import { FastifyRequest, FastifyReply } from "fastify";
import { hmacSha256Hex, safeEqualHex, sha256Hex } from "./hmac";
import fs from "fs";
import path from "path";

type AgentIdentity = {
    nodeId: string;
    sharedSecret: string;
};

const identityPath = path.join(process.cwd(), "data", "identity.json");

function loadIdentity(): AgentIdentity | null {
    try {
        const raw = fs.readFileSync(identityPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed?.nodeId && parsed?.sharedSecret) return parsed;
        return null;
    } catch {
        return null;
    }
}

function getRawBody(req: FastifyRequest): string {
    // In Fastify ist req.body schon geparst; wir signieren für MVP den JSON-stringify.
    // Für perfekte Signaturen später: rawBody Plugin nutzen.
    if (!req.body) return "";
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
}

export async function hmacAuthHook(req: FastifyRequest, reply: FastifyReply) {
    // Allow unauth endpoints:
    if (req.url === "/health") return;

    const id = loadIdentity();
    if (!id) {
        return reply.code(503).send({ error: "Agent not enrolled" });
    }

    const nodeId = req.headers["x-node-id"];
    const ts = req.headers["x-timestamp"];
    const bodyHash = req.headers["x-body-sha256"];
    const sig = req.headers["x-signature"];

    if (
        typeof nodeId !== "string" ||
        typeof ts !== "string" ||
        typeof bodyHash !== "string" ||
        typeof sig !== "string"
    ) {
        return reply.code(401).send({ error: "Missing auth headers" });
    }

    if (nodeId !== id.nodeId) {
        return reply.code(401).send({ error: "Invalid node id" });
    }

    const now = Date.now();
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
        return reply.code(401).send({ error: "Invalid timestamp" });
    }

    const skewMs = Math.abs(now - tsNum);
    if (skewMs > 60_000) {
        return reply.code(401).send({ error: "Timestamp out of range" });
    }

    const rawBody = getRawBody(req);
    const computedBodyHash = sha256Hex(rawBody);

    if (computedBodyHash !== bodyHash) {
        return reply.code(401).send({ error: "Body hash mismatch" });
    }

    const method = (req.method || "GET").toUpperCase();
    const pathOnly = req.url.split("?")[0]; // IMPORTANT: path ohne query

    const signingString = `${ts}.${method}.${pathOnly}.${bodyHash}`;
    const computedSig = hmacSha256Hex(id.sharedSecret, signingString);

    if (!safeEqualHex(computedSig, sig)) {
        return reply.code(401).send({ error: "Bad signature" });
    }
}
