import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { agentFetch } from './agent/agent-client';
import { PrismaService } from '../prisma/prisma.service';
import crypto from 'crypto';
import { CreateEnrollmentDto } from './dto/create-enroll.dto';
import { RegisterNodeDto } from './dto/register-node.dto';
import { CreateAllocationsDto } from './dto/create-allocations.dto';
import { Prisma } from '@prisma/client';

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  async createEnrollment(dto: CreateEnrollmentDto) {
    const ttl = dto.ttlMinutes ?? 60;
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + ttl * 60_000);

    await this.prisma.nodeEnrollment.create({
      data: { tokenHash, expiresAt },
    });

    return { token, expiresAt };
  }

  async registerNode(dto: RegisterNodeDto) {
    const tokenHash = sha256(dto.token);

    const enrollment = await this.prisma.nodeEnrollment.findUnique({
      where: { tokenHash },
    });

    if (!enrollment) throw new BadRequestException('Invalid enrollment token');
    if (enrollment.usedAt) throw new BadRequestException('Token already used');
    if (enrollment.expiresAt.getTime() < Date.now())
      throw new BadRequestException('Token expired');

    const sharedSecret = randomToken(32);

    const node = await this.prisma.node.create({
      data: {
        name: dto.name,
        endpointUrl: dto.endpointUrl,
        agentVersion: dto.agentVersion,
        capacityJson: (dto.capacity as Prisma.JsonValue) ?? undefined,
        sharedSecret,
        status: 'OFFLINE',
      },
    });

    await this.prisma.nodeEnrollment.update({
      where: { id: enrollment.id },
      data: { usedAt: new Date(), nodeId: node.id },
    });

    return {
      nodeId: node.id,
      sharedSecret,
    };
  }

  async listNodes() {
    return this.prisma.node.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        endpointUrl: true,
        status: true,
        lastSeenAt: true,
        agentVersion: true,
        capacityJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getNode(id: string) {
    return this.prisma.node.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        endpointUrl: true,
        status: true,
        lastSeenAt: true,
        agentVersion: true,
        capacityJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async pingNode(nodeId: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(`${node.endpointUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok)
        throw new Error(`Node ping failed with status ${res.status}`);
      const health = await res.json().catch(() => ({}));
      await this.prisma.node.update({
        where: { id: node.id },
        data: {
          status: 'ONLINE',
          lastSeenAt: new Date(),
          agentVersion:
            typeof health?.agentVersion === 'string'
              ? health.agentVersion
              : node.agentVersion,
        },
      });
    } catch (error) {
      clearTimeout(timeout);

      await this.prisma.node.update({
        where: { id: node.id },
        data: {
          status: 'OFFLINE',
        },
      });

      return { ok: false, nodeId: node.id, status: 'OFFLINE' };
    }
  }

  async pingAllNodes() {
    const nodes = await this.prisma.node.findMany({ select: { id: true } });
    const results = [];
    for (const n of nodes) {
      // @ts-ignore
      results.push(await this.pingNode(n.id));
    }
    return results;
  }

  async authTest(nodeId: string, payload: any) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const res = await agentFetch({
      nodeId: node.id,
      sharedSecret: node.sharedSecret,
      endpointUrl: node.endpointUrl,
      path: '/v1/auth-test',
      method: 'POST',
      body: payload ?? { hello: 'nestium' },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`Agent responded ${res.status}: ${text}`);
    }
    return JSON.parse(text);
  }

  async createAllocations(nodeId: string, dto: CreateAllocationsDto) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const ip = dto.ip ?? '0.0.0.0';
    const protocol = (dto.protocol ?? 'TCP') as any;

    if (dto.startPort > dto.endPort) {
      throw new BadRequestException('startPort must be <= endPort');
    }

    const ports: { nodeId: string; ip: string; port: number; protocol: any }[] =
      [];
    for (let p = dto.startPort; p <= dto.endPort; p++) {
      ports.push({ nodeId, ip, port: p, protocol });
    }

    // skipDuplicates verhindert Fehler, wenn du den Range nochmal anlegst
    const result = await this.prisma.allocation.createMany({
      data: ports,
      skipDuplicates: true,
    });

    return { created: result.count };
  }
}
