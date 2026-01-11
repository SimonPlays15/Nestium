import {FastifyReply, FastifyRequest} from "fastify";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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
const EMPTY_SHA256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
function sha256Hex(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function hmacSha256Hex(secret: string, input: string) {
    return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function safeTimingEqualHex(a: string, b: string) {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function methodHasBody(method: string) {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function isWebSocketUpgrade(req: FastifyRequest) {
    const u = String(req.raw?.headers?.upgrade ?? "").toLowerCase();
    return u === "websocket" || (req as any).ws || (req.raw as any)?.upgrade === true;
}

async function readRawBody(req: FastifyRequest): Promise<string> {
    if (!req.body) return "";
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
}

async function getNodeSharedSecret(nodeId: string): Promise<string | null> {
    const identity = loadIdentity();
    if (identity && identity.nodeId === nodeId) return identity.sharedSecret;
    return null;
}

/**
 * HMAC Auth Hook (Fastify)
 */
export async function hmacAuthHook(req: FastifyRequest, reply: FastifyReply) {
    const initiateTime = Date.now();
    const rawUrl = String(req.raw?.url ?? "");
    const path = rawUrl.split("?")[0];
    if (path === "/health" || path === "/ws-test") return;

    const isWs = isWebSocketUpgrade(req);

    const nodeId = req.headers["x-node-id"] as string | undefined;
    const tsHeader = req.headers["x-timestamp"] as string | undefined;
    const sigHeader = req.headers["x-signature"] as string | undefined;
    const bodyHashHeader = req.headers["x-body-sha256"] as string | undefined;

    if (!nodeId || !tsHeader || !sigHeader || !bodyHashHeader) {
        reply.code(401).send({ error: "Missing authentication headers" });
        return;
    }

    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) {
        reply.code(401).send({ error: "Invalid timestamp" });
        return;
    }

    // replay window 60s
    if (Math.abs(Date.now() - ts) > 60_000) {
        reply.code(401).send({ error: "Timestamp expired" });
        return;
    }

    const method = String(req.raw?.method ?? req.method ?? "GET").toUpperCase();
    const pathOnly = rawUrl.split("?")[0];

    // Body hash: WS + GET/HEAD -> empty, else read
    let computedBodyHash = EMPTY_SHA256;
    if (!isWs && methodHasBody(method)) {
        const body = await readRawBody(req);
        computedBodyHash = sha256Hex(body);
    }

    if (!computedBodyHash) {
        reply.code(428).send({ error: "Body hash missing" });
        return;
    }

    if (computedBodyHash !== bodyHashHeader) {
        reply.code(401).send({ error: "Body hash mismatch" });
        return;
    }

    const sharedSecret = await getNodeSharedSecret(nodeId);
    if (!sharedSecret) {
        reply.code(401).send({ error: "Unknown node" });
        return;
    }

    const signingString = `${tsHeader}.${method}.${pathOnly}.${computedBodyHash}`;
    const expectedSig = hmacSha256Hex(sharedSecret, signingString);

    if (!safeTimingEqualHex(sigHeader, expectedSig)) {
        reply.code(401).send({ error: "Invalid signature" });
        return;
    }

    const timeNow = Date.now();

    console.log(Date.now() - initiateTime, "HMAC Auth Hook", method, pathOnly, nodeId, timeNow - initiateTime, "ms");
    // OK -> allow request
}
