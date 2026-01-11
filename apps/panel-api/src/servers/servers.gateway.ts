import {OnGatewayConnection, WebSocketGateway} from "@nestjs/websockets";
import type {IncomingMessage} from "http";
import WebSocket from "ws";
import crypto from "crypto";
import {PrismaService} from "../prisma/prisma.service";
import {toWsUrl} from '@nestium/shared';
import {agentSignedHeaders} from "../nodes/agent/agent-client";

function safeWsClose(ws: WebSocket | null, code = 1000, reason = "closed") {
    if (!ws) return;
    try {
        if (ws.readyState === WebSocket.CONNECTING) return ws.terminate();
        if (ws.readyState === WebSocket.OPEN) return ws.close(code, reason);
    } catch {}
}

function safeSend(ws: WebSocket, obj: any) {
    try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    } catch {}
}

type ServerState = "unknown" | "starting" | "running" | "stopped" | "crashed";

@WebSocketGateway({ path: "/ws/servers" })
export class ServersGateway implements OnGatewayConnection {
    constructor(private prisma: PrismaService) {}

    async handleConnection(clientWs: WebSocket, req: IncomingMessage) {
        try {
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const serverId = url.searchParams.get("serverId");
            const token = url.searchParams.get("token");

            if (!serverId || !token) {
                clientWs.close(1008, "Missing serverId/token");
                return;
            }

            // Token check
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const wsToken = await this.prisma.wsToken.findUnique({ where: { tokenHash } });

            if (!wsToken || wsToken.serverId !== serverId || wsToken.expiresAt < new Date()) {
                console.log("Invalid token for serverId:", serverId);
                clientWs.close(1008, "Invalid token");
                return;
            }
            // single use
            await this.prisma.wsToken.delete({ where: { tokenHash } });

            const serverData = await this.prisma.server.findUnique({
                where: { id: serverId },
                include: { node: true },
            });

            if (!serverData?.node) {
                clientWs.close(1008, "Server/Node not found");
                return;
            }

            this.proxyAll(clientWs, serverData.node, serverId);
        } catch {
            try { clientWs.close(1011, "proxy error"); } catch {}
        }
    }

    private proxyAll(clientWs: WebSocket, node: any, serverId: string) {
        const nodeId = node.id;
        const sharedSecret = node.sharedSecret;
        const endpointUrl = node.endpointUrl;

        const agentLogsPath = `/v1/servers/${serverId}/logs/stream`;
        const agentConsolePath = `/v1/servers/${serverId}/console/stream`;

        // Du kannst logs tail hier auf 0 setzen, weil du optional REST-tail senden kannst
        const agentLogsUrl = `${toWsUrl(endpointUrl)}${agentLogsPath}?tail=0`;
        const agentConsoleUrl = `${toWsUrl(endpointUrl)}${agentConsolePath}`;

        let closed = false;
        let logsWs: WebSocket | null = null;
        let consoleWs: WebSocket | null = null;

        const closeAll = () => {
            if (closed) return;
            closed = true;
            safeWsClose(logsWs, 1000, "close");
            safeWsClose(consoleWs, 1000, "close");
            safeWsClose(clientWs, 1000, "close");
        };

        clientWs.on("close", closeAll);
        clientWs.on("error", closeAll);

        // --- connect helpers (mit basic reconnect) ---
        const connectAgentWs = (
            channel: "logs" | "console",
            url: string,
            pathToSign: string,
            assign: (ws: WebSocket | null) => void,
            onMessage: (data: WebSocket.RawData) => void,
        ) => {
            if (closed) return;

            const headers = agentSignedHeaders({
                nodeId,
                sharedSecret,
                method: "GET",
                path: pathToSign,
                bodyStr: "",
            });

            const ws = new WebSocket(url, { headers, handshakeTimeout: 20_000 });
            assign(ws);

            ws.on("open", () => safeSend(clientWs, { type: "agent", channel, status: "connected" }));

            ws.on("message", onMessage);

            ws.on("close", () => {
                assign(null);
                safeSend(clientWs, { type: "agent", channel, status: "disconnected" });
                if (!closed) setTimeout(() => connectAgentWs(channel, url, pathToSign, assign, onMessage), 800);
            });

            ws.on("error", () => {
                try { ws.close(); } catch {}
            });

            ws.on("unexpected-response", (_req, res) => {
                safeSend(clientWs, { type: "error", message: `Agent ${channel} rejected: ${res.statusCode}` });
                try { ws.close(); } catch {}
            });
        };

        connectAgentWs(
            "logs",
            agentLogsUrl,
            agentLogsPath,
            (w) => (logsWs = w),
            (data) => {
                const text = Buffer.isBuffer(data) ? data.toString("utf-8") : data.toString();
                safeSend(clientWs, { type: "logs", data: text });
            },
        );

        connectAgentWs(
            "console",
            agentConsoleUrl,
            agentConsolePath,
            (w) => (consoleWs = w),
            (data) => {
                const text = Buffer.isBuffer(data) ? data.toString("utf-8") : data.toString();
                // optional: console ack/info
                safeSend(clientWs, { type: "info", message: text.trimEnd() });
            },
        );

        // --- Browser → Panel → Agent console (cmd) ---
        clientWs.on("message", (data) => {
            if (closed) return;

            let msg: any;
            try {
                msg = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf-8") : String(data));
            } catch {
                // allow plain text -> treat as command
                msg = { type: "cmd", data: Buffer.isBuffer(data) ? data.toString("utf-8") : String(data) };
            }

            if (msg?.type === "ping") {
                safeSend(clientWs, { type: "pong" });
                return;
            }

            if (msg?.type === "cmd" && typeof msg.data === "string") {
                const payload = JSON.stringify({ type: "cmd", data: msg.data });
                if (consoleWs && consoleWs.readyState === WebSocket.OPEN) {
                    try { consoleWs.send(payload); } catch {}
                } else {
                    safeSend(clientWs, { type: "error", message: "Console channel not connected" });
                }
            }
        });
    }
}
