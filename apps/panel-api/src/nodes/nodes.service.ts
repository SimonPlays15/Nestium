import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import crypto from "crypto";
import { CreateEnrollmentDto } from "./dto/create-enroll.dto";
import { RegisterNodeDto } from "./dto/register-node.dto";
import {Prisma} from "@prisma/client";

function sha256(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
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

        if (!enrollment) throw new BadRequestException("Invalid enrollment token");
        if (enrollment.usedAt) throw new BadRequestException("Token already used");
        if (enrollment.expiresAt.getTime() < Date.now())
            throw new BadRequestException("Token expired");

        const sharedSecret = randomToken(32);

        const node = await this.prisma.node.create({
            data: {
                name: dto.name,
                endpointUrl: dto.endpointUrl,
                agentVersion: dto.agentVersion,
                capacityJson: (dto.capacity as Prisma.JsonValue) ?? undefined,
                sharedSecret,
                status: "OFFLINE",
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
}
