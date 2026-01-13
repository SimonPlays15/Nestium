import {FastifyReply, FastifyRequest} from "fastify";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Represents the identity of an agent within the system.
 *
 * This type defines the unique identifier and shared secret associated with an agent,
 * used for authentication or identification purposes.
 */
type AgentIdentity = {
    nodeId: string;
    sharedSecret: string;
};

/**
 * The file path to the identity.json file, located in the 'data' directory
 * within the current working directory of the process.
 *
 * This variable is constructed using the `path.join` method to ensure
 * cross-platform compatibility for file paths.
 *
 * The `identity.json` file is typically used to store identity or
 * configuration-related data for the application.
 *
 * Note: Ensure the 'data' directory and the 'identity.json' file exist
 * in the specified location to avoid runtime errors.
 */
const identityPath = path.join(process.cwd(), "data", "identity.json");

/**
 * Loads and returns an AgentIdentity object by reading and parsing the identity file.
 * If the file does not exist or parsing fails, it returns null.
 *
 * @return {AgentIdentity|null} The loaded AgentIdentity object if successful, otherwise null.
 */
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

/**
 * A constant representing the SHA-256 hash of an empty string.
 * This value is commonly used as a baseline or default in cryptographic operations
 * or when dealing with empty data inputs.
 *
 * The hash is a 64-character hexadecimal string.
 */
const EMPTY_SHA256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * Computes the SHA-256 hash of the given input string and returns it as a hexadecimal string.
 *
 * @param input The input string to hash.
 * @return The hexadecimal representation of the SHA-256 hash of the input string.
 */
function sha256Hex(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generates an HMAC-SHA256 hash in hexadecimal format for the given input using the specified secret key.
 *
 * @param {string} secret The secret key used for generating the HMAC hash.
 * @param {string} input The input data to be hashed.
 * @return {string} The resulting HMAC-SHA256 hash in hexadecimal format.
 */
function hmacSha256Hex(secret: string, input: string): string {
    return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

/**
 * Compares two hexadecimal strings in a timing-safe manner, ensuring that the comparison
 * is resistant to timing attacks. Both strings must have the same length to be considered equal.
 *
 * @param {string} a - The first hexadecimal string to compare.
 * @param {string} b - The second hexadecimal string to compare.
 * @return {boolean} Returns true if the strings are equal in a timing-safe manner, false otherwise.
 */
function safeTimingEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Determines if the provided HTTP method typically includes a body in the request.
 *
 * @param {string} method - The HTTP method to check (e.g., "GET", "POST", "PUT").
 * @return {boolean} True if the method typically includes a body, false otherwise.
 */
function methodHasBody(method: string): boolean {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

/**
 * Determines if the given request is attempting to upgrade to a WebSocket connection.
 *
 * @param {FastifyRequest} req - The HTTP request object to evaluate.
 * @return {boolean} Returns `true` if the request is a WebSocket upgrade request, otherwise `false`.
 */
function isWebSocketUpgrade(req: FastifyRequest): boolean {
    const u = String(req.raw?.headers?.upgrade ?? "").toLowerCase();
    return u === "websocket" || (req as any).ws || (req.raw as any)?.upgrade === true;
}

/**
 * Reads and retrieves the raw body of an incoming HTTP request.
 *
 * @param {FastifyRequest} req - The Fastify request object from which the body is to be read.
 * @return {Promise<string>} A promise that resolves to the raw body as a string. If the body is not present, an empty string is returned.
 */
async function readRawBody(req: FastifyRequest): Promise<string> {
    if (!req.body) return "";
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
}

/**
 * Retrieves the shared secret for a given node if the identity matches the specified node ID.
 *
 * @param {string} nodeId - The ID of the node for which the shared secret is to be retrieved.
 * @return {Promise<string | null>} A promise that resolves to the shared secret if the identity matches the node ID, or null if no match is found.
 */
async function getNodeSharedSecret(nodeId: string): Promise<string | null> {
    const identity = loadIdentity();
    if (identity && identity.nodeId === nodeId) return identity.sharedSecret;
    return null;
}

/**
 * An asynchronous HMAC authentication hook for validating incoming requests.
 * It ensures the integrity and authenticity of requests by verifying headers, body hash, and HMAC signature.
 *
 * @param {FastifyRequest} req The incoming FastifyRequest object containing details of the HTTP request.
 * @param {FastifyReply} reply The FastifyReply object used to handle the HTTP response.
 * @return {Promise<void>} A promise that completes when the authentication process is done.
 *                         The function sends a response and halts further execution if authentication fails.
 */
export async function hmacAuthHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
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
