import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../prisma/prisma.service";
import {agentFetch} from "../nodes/agent/agent-client";
import {minecraftSpec} from "./templates/minecraft-template";
import {Prisma} from "@prisma/client";
import crypto from "crypto";

function parseJsonSafe(text: string) {
    try { return JSON.parse(text); } catch { return null; }
}

function sha256Hex(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}
function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
}

@Injectable()
export class ServersService {
    constructor(private prisma: PrismaService) {}

    async createMinecraftServer(dto: { ownerId: string; nodeId: string; name: string; hostPort: number; memoryMb: number; version?: string }) {
        const node = await this.prisma.node.findUnique({ where: { id: dto.nodeId } });
        if (!node) throw new NotFoundException("Node not found");

        // 1) Server in DB erstellen
        const result = await this.prisma.$transaction(async (tx) => {
            const server = await tx.server.create({
                data: {
                    name: dto.name,
                    type: "minecraft",
                    state: "CREATED",
                    image: "itzg/minecraft-server:latest",
                    envJson: {},
                    limitsJson: {},
                    networkJson: {}, // wird gleich gesetzt
                    storageJson: {},
                    nodeId: node.id,
                    ownerId: dto.ownerId,
                },
            });

            const alloc = await this.allocatePortTx(tx, node.id, server.id);

            return tx.server.update({
                where: {id: server.id},
                data: {
                    networkJson: {ip: alloc.ip, hostPort: alloc.port, protocol: "tcp"},
                },
            });
        });
        if(!result) {
            throw new BadRequestException("Failed to create server");
        }

        // 2) Agent create container (HMAC)
        // @ts-ignore
        const spec = minecraftSpec({ hostPort: result.networkJson.hostPort, memoryMb: dto.memoryMb, version: dto.version });

        const res = await agentFetch({
            nodeId: node.id,
            sharedSecret: node.sharedSecret,
            endpointUrl: node.endpointUrl,
            path: `/v1/servers/${result.id}/create`,
            method: "POST",
            body: spec,
        });

        const text = await res.text();
        if (!res.ok) {
            await this.freeAllocation(result.id);
            await this.prisma.server.update({ where: { id: result.id }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent create failed ${res.status}: ${text}`);
        }

        // 3) Optional: direkt starten
        const start = await agentFetch({
            nodeId: node.id,
            sharedSecret: node.sharedSecret,
            endpointUrl: node.endpointUrl,
            path: `/v1/servers/${result.id}/start`,
            method: "POST",
            body: {},
        });

        if (!start.ok) {
            const t2 = await start.text();
            await this.prisma.server.update({ where: { id: result.id }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent start failed ${start.status}: ${t2}`);
        }

        await this.prisma.server.update({ where: { id: result.id }, data: { state: "RUNNING" } });
        return result;
    }

    async logs(serverId: string, tail = 200) {
        const server = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!server) throw new NotFoundException("Server not found");

        const node = await this.prisma.node.findUnique({ where: { id: server.nodeId } });
        if (!node) throw new NotFoundException("Node not found");

        const res = await agentFetch({
            nodeId: node.id,
            sharedSecret: node.sharedSecret,
            endpointUrl: node.endpointUrl,
            path: `/v1/servers/${serverId}/logs?tail=${tail}`,
            method: "GET",
        });

        const text = await res.text();
        if (!res.ok) throw new BadRequestException(`Agent logs failed ${res.status}: ${text}`);
        return JSON.parse(text);
    }

    async allocatePortTx(tx: Prisma.TransactionClient, nodeId: string, serverId: string) {
        // 1) Einen freien Port locken (SKIP LOCKED verhindert Deadlocks bei parallel Requests)
        const rows = await tx.$queryRaw<{ id: string; port: number; ip: string }[]>`
    SELECT "id", "port", "ip"
    FROM "Allocation"
    WHERE "nodeId" = ${nodeId}
      AND "assignedServerId" IS NULL
      AND "protocol" = 'TCP'
    ORDER BY "port" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  `;

        const picked = rows[0];
        if (!picked) throw new BadRequestException("No free allocations available for this node");

        // 2) Markieren als vergeben
        await tx.allocation.update({
            where: { id: picked.id },
            data: { assignedServerId: serverId },
        });

        return picked; // {port, ip}
    }

    async freeAllocation(serverId: string) {
        await this.prisma.allocation.updateMany({
            where: { assignedServerId: serverId },
            data: { assignedServerId: null },
        });
    }

    async syncStatus(serverId: string) {
        const { server, node } = await this.getServerAndNode(serverId);

        const { res, text, json } = await this.agentCall(node, `/v1/servers/${serverId}/status`, "GET");

        if (!res.ok) {
            // Agent nicht erreichbar / Fehler
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "STOPPED" } });
            throw new BadRequestException(`Agent status failed ${res.status}: ${text}`);
        }

        // json: { ok:true, exists, status, running... }
        if (!json?.exists) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            return { ok: true, exists: false, mappedState: "ERROR", raw: json };
        }

        const mappedState = json.running ? "RUNNING" : "STOPPED";
        await this.prisma.server.update({ where: { id: serverId }, data: { state: mappedState } });

        return { ok: true, exists: true, mappedState, raw: json };
    }

    async start(serverId: string) {
        const { node } = await this.getServerAndNode(serverId);

        // optional: status check, ob container existiert
        const status = await this.agentCall(node, `/v1/servers/${serverId}/status`, "GET");
        if (status.res.ok && status.json && status.json.exists === false) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            throw new BadRequestException("Container does not exist on node (deploy missing?)");
        }

        const { res, text } = await this.agentCall(node, `/v1/servers/${serverId}/start`, "POST", {});
        if (!res.ok) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent start failed ${res.status}: ${text}`);
        }

        await this.prisma.server.update({ where: { id: serverId }, data: { state: "RUNNING" } });
        return { ok: true };
    }

    async stop(serverId: string) {
        const { node } = await this.getServerAndNode(serverId);

        const { res, text } = await this.agentCall(node, `/v1/servers/${serverId}/stop`, "POST", {});
        if (!res.ok) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent stop failed ${res.status}: ${text}`);
        }

        await this.prisma.server.update({ where: { id: serverId }, data: { state: "STOPPED" } });
        return { ok: true };
    }

    async restart(serverId: string) {
        const { node } = await this.getServerAndNode(serverId);

        const { res, text } = await this.agentCall(node, `/v1/servers/${serverId}/restart`, "POST", {});
        if (!res.ok) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent restart failed ${res.status}: ${text}`);
        }

        await this.prisma.server.update({ where: { id: serverId }, data: { state: "RUNNING" } });
        return { ok: true };
    }

    async delete(serverId: string) {
        const { server, node } = await this.getServerAndNode(serverId);

        // Agent delete (wenn Agent down, willst du evtl. trotzdem DB löschen? MVP: wir failen)
        const { res, text } = await this.agentCall(node, `/v1/servers/${serverId}`, "DELETE");
        if (!res.ok) {
            await this.prisma.server.update({ where: { id: serverId }, data: { state: "ERROR" } });
            throw new BadRequestException(`Agent delete failed ${res.status}: ${text}`);
        }

        // Allocation freigeben
        await this.freeAllocation(serverId);

        await this.prisma.server.delete({ where: { id: serverId } });

        return { ok: true };
    }

    async status(serverId: string) {
        const { server, node } = await this.getServerAndNode(serverId);

        const {res, text} = await this.agentCall(node, `/v1/servers/${serverId}/status`, "GET");
        if(!res.ok) throw new BadRequestException(`Agent status failed ${res.status}: ${text}`);

        return JSON.parse(text);
    }

    // WS Token
    async createWsToken(serverId: string, userId: string) {
        // optional: prüfen ob server existiert
        const server = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!server) throw new NotFoundException("Server not found");

        const token = randomToken(32);
        const tokenHash = sha256Hex(token);
        const expiresAt = new Date(Date.now() + 60_000); // 60s TTL fürs Upgrade

        await this.prisma.wsToken.create({
            data: { tokenHash, serverId, userId, expiresAt },
        });

        return { token, expiresAt };
    }

    private async getServerAndNode(serverId: string) {
        const server = await this.prisma.server.findUnique({ where: { id: serverId } });
        if (!server) throw new NotFoundException("Server not found");

        const node = await this.prisma.node.findUnique({ where: { id: server.nodeId } });
        if (!node) throw new NotFoundException("Node not found");

        return { server, node };
    }

    private async agentCall(node: any, path: string, method: string, body?: any) {
        const res = await agentFetch({
            nodeId: node.id,
            sharedSecret: node.sharedSecret,
            endpointUrl: node.endpointUrl,
            path,
            method,
            body,
        });

        const text = await res.text().catch(() => "");
        const json = parseJsonSafe(text);
        return { res, text, json };
    }
}