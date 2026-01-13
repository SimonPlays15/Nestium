import Fastify, {FastifyInstance} from "fastify";
import {z} from "zod";
import path from "path"
import fs from "fs"
import {hmacAuthHook} from "./security/authHook";
import {
    containerExists,
    containerStatus,
    createOrReplaceContainer,
    deleteContainer,
    restartContainer,
    startContainer,
    stopContainer,
    tailLogs
} from "./docker/runtime";
import {PassThrough} from "stream";
import {containerName} from "./docker/names";
import {createDockerClient} from "./docker/client";
import websocket from "@fastify/websocket";
import {ServerSpec} from "./docker/types";
import {config} from "dotenv"

config();

// Random UUID v4 generator
// @ts-ignore
const uuidv4 = () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

const RegisterResponseSchema = z.object({
  nodeId: z.string(),
  sharedSecret: z.string(),
});

type AgentIdentity = {
  nodeId: string;
  sharedSecret: string;
};

const port = Number(process.env.AGENT_PORT ?? "8081");
const nodeName = process.env.NODE_NAME ?? `${uuidv4()}`;
const endpointUrl = process.env.NODE_ENDPOINT_URL ?? `http://localhost:${port}`;
const panelUrl = process.env.PANEL_URL ?? "http://localhost:3000";
const enrollToken = process.env.ENROLL_TOKEN;
const agentVersion = process.env.AGENT_VERSION ?? "0.1.0";

// Identity speichern wir lokal, damit der Agent nicht bei jedem Start neu registriert
const dataDir = path.join(process.cwd(), "data");
const identityPath = path.join(dataDir, "identity.json");

/**
 * Loads the agent identity from a specified file path.
 *
 * The identity is expected to be stored in JSON format. If the file exists and contains
 * the necessary properties (`nodeId` and `sharedSecret`), the parsed object is returned.
 * If the file is missing, unreadable, or does not contain the expected properties,
 * the method returns `null`.
 *
 * @return {AgentIdentity | null} The loaded agent identity object if valid, or `null` if invalid or not found.
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
 * Saves the given agent identity to a predefined data directory.
 * The method ensures that the data directory exists and writes
 * the identity information as a JSON file.
 *
 * @param {AgentIdentity} id - The agent identity object to be saved.
 * @return {void} This method does not return a value.
 */
function saveIdentity(id: AgentIdentity): void {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(identityPath, JSON.stringify(id, null, 2), "utf-8");
}

/**
 * Enrolls the application if no existing identity is found. If an identity exists, skips the enrollment process.
 *
 * @param {FastifyInstance} app - The Fastify application instance, used for logging and application context.
 * @return {Promise<Object>} A Promise resolving to the existing or newly enrolled identity object.
 * @throws {Error} If the ENROLL_TOKEN is missing or the enrollment process fails.
 */
async function enrollIfNeeded(app: FastifyInstance): Promise<object> {
    const existing = loadIdentity();
    if (existing) {
        app.log.info({ nodeId: existing.nodeId }, "Identity already present, skip enrollment.");
        return existing;
    }

    if (!enrollToken) {
        app.log.error("ENROLL_TOKEN is missing. Create one via POST /nodes/enroll in panel.");
        throw new Error("ENROLL_TOKEN is missing. Create one via POST /nodes/enroll in panel.");
    }

    app.log.info(
        { panelUrl, nodeName, endpointUrl, agentVersion },
        "No identity found, enrolling with panel..."
    );

    const res = await fetch(`${panelUrl}/nodes/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            token: enrollToken,
            name: nodeName,
            endpointUrl,
            agentVersion,
            capacity: {
                // MVP: optional, später echte Werte
                cpuCores: 2,
                memMb: 1024,
            },
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Enrollment failed: ${res.status} ${res.statusText} ${text}`);
    }

    const json = await res.json();
    const parsed = RegisterResponseSchema.parse(json);

    saveIdentity(parsed);
    app.log.info({ nodeId: parsed.nodeId }, "Enrollment successful, identity saved.");
    return parsed;
}

/**
 * Pauses the execution of code for a specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to pause execution.
 * @return {Promise<void>} A promise that resolves after the specified delay.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Safely sends a message through a WebSocket. Ensures that any errors
 * that occur during the send operation are caught and do not disrupt execution.
 *
 * @param {any} ws - The WebSocket instance to send the message through.
 * @param {string} msg - The message to be sent via the WebSocket.
 * @return {void} - This method does not return a value.
 */
function safeSend(ws: any, msg: string): void {
    try { ws.send(msg); } catch {}
}

/**
 * Extracts and returns the server ID from the given request object. The method
 * attempts to retrieve the ID first from the request parameters, and if not found,
 * parses it from the request URL.
 *
 * @param {Object} req - The request object containing parameters and raw URL data.
 * @return {string|null} The extracted server ID as a string if found, otherwise null.
 */
function parseServerId(req: any): string | null {
    const fromParams = (req.params as any)?.id;
    if (fromParams) return String(fromParams);

    const rawUrl = String(req.raw?.url ?? "");
    const path = rawUrl.split("?")[0];
    const m = path.match(/^\/v1\/servers\/([^/]+)\/logs\/stream$/);
    return m?.[1] ?? null;
}

/**
 * Parses the "tail" parameter from a given URL string and returns its value
 * as a finite integer within a valid range. If the parameter is not present,
 * invalid, or out of range, the default value is returned.
 *
 * @param {string} rawUrl - The URL string to parse for the "tail" parameter.
 * @param {number} [defaultTail=100] - The default value to return if the "tail" parameter is invalid or not specified.
 * @return {number} The parsed "tail" value as an integer within the range 0-5000, or the default value if validation fails.
 */
function parseTail(rawUrl: string, defaultTail: number = 100): number {
    try {
        const u = new URL(rawUrl, "http://localhost");
        const t = u.searchParams.get("tail");
        const n = t ? Number(t) : defaultTail;
        if (Number.isFinite(n) && n >= 0 && n <= 5000) return Math.floor(n);
    } catch {}
    return defaultTail;
}


/**
 * Initializes and configures a Fastify application with a logger, error handler,
 * WebSocket support, and various routes for different functionalities, including
 * health checks, authentication tests, server logs, and console streaming.
 *
 * @return {Promise<void>} A promise that resolves once the Fastify application
 * is successfully initialized with all hooks, routes, and services registered.
 */
async function bootstrap(): Promise<void> {
    const app = Fastify(
        {
            logger: {
                name: nodeName,
                serializers: {
                    req (req){
                        return {
                            method: req.raw.method,
                            url: req.raw.url,
                            body: req.body,
                            params: req.params,
                        }
                    },

                },
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true, translateTime: "HH:mm:ss Z", ignore: "pid,hostname"
                    },
                    level: "debug"
                },
            }, trustProxy: true, });

    app.setErrorHandler((err, req, reply) => {
        if(err) {
            app.log.error(err, `An error accurred: ${err}`)
            reply.status(500).send({error: "Internal server error", theError: err});
        } else
            app.log.error("An error occurred but no error was provided")
    })
    await app.register(websocket, {
        options: {
            pingTimeout: 10000,
            pingInterval: 5000,
        },
    });
    app.addHook("preHandler", hmacAuthHook);

// Health endpoint
    app.get("/health", async () => {
        const id = loadIdentity();
        return {
            status: "ok",
            nodeName,
            endpointUrl,
            agentVersion,
            enrolled: Boolean(id),
            nodeId: id?.nodeId ?? null,
        };
    });

// Tests
    app.post("/v1/auth-test", async (req) => {
        return { ok: true, received: req.body ?? null };
    });
    app.get("/ws-test", { websocket: true }, (conn: any, req: any) => {
        const ws = conn?.socket ?? conn; // ✅ unterstützt beide Signaturen
        ws.send("ok");
        try{ ws.close();} catch {}
        try{ ws.destroy();} catch {}
    });

    /**
     * Docker API
     */
    const docker = createDockerClient();

    // logs
    app.get("/v1/servers/:id/logs/stream", { websocket: true }, (connection, req) => {
        const ws: any = (connection as any)?.socket ?? (connection as any);

        const rawUrl = String(req.raw?.url ?? "");
        const serverId = parseServerId(req);
        const tail = parseTail(rawUrl, 100);

        if (!serverId) {
            safeSend(ws, "ERROR: serverId not found\n");
            try { ws.close?.(); } catch {}
            return;
        }

        const name = containerName(serverId);
        const container = docker.getContainer(name);

        let closed = false;
        let activeStream: any = null;

        let lastSinceSec: number | null = null;

        const stripTimestamps = true;

        function updateSinceFromText(text: string) {
            const lines = text.replace(/\r/g, "").split("\n");
            for (const ln of lines) {
                const space = ln.indexOf(" ");
                if (space <= 0) continue;
                const ts = ln.slice(0, space);
                const cleaned = ts.replace(/\.(\d{3})\d+Z$/, ".$1Z");
                const ms = Date.parse(cleaned);
                if (!Number.isNaN(ms)) lastSinceSec = Math.floor(ms / 1000);
            }
        }

        function maybeStripTimestamps(text: string) {
            if (!stripTimestamps) return text;
            return text.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s/gm, "");
        }

        const closeAll = () => {
            if (closed) return;
            closed = true;
            try { activeStream?.destroy?.(); } catch {}
            try { ws.terminate?.(); } catch {}
            try { ws.close?.(); } catch {}
        };

        ws.on("close", closeAll);
        ws.on("error", closeAll);

        const attachOnce = async () => {
            if (closed) return;

            const info = await container.inspect().catch(() => null);
            const isTty = Boolean((info as any)?.Config?.Tty);

            await new Promise<void>((resolve) => {
                const opts: any = {
                    stdout: true,
                    stderr: true,
                    follow: true,
                    timestamps: true,
                };
                if (lastSinceSec) {
                    opts.since = lastSinceSec;
                    opts.tail = 0;
                } else {
                    opts.tail = tail;
                }

                container.logs(opts, (err, stream) => {
                    if (closed) return resolve();

                    if (err || !stream) {
                        req.log.error(err, "container.logs failed");
                        safeSend(ws, `ERROR: logs attach failed: ${String(err?.message ?? err)}\n`);
                        return resolve();
                    }

                    activeStream = stream as any;

                    let inactivityTimer: NodeJS.Timeout | null = null;
                    const armInactivity = () => {
                        if (inactivityTimer) clearTimeout(inactivityTimer);
                        inactivityTimer = setTimeout(() => {
                            try { (stream as any)?.destroy?.(); } catch {}
                            resolve();
                        }, 20_000);
                    };

                    const onText = (text: string) => {
                        if (closed) return;
                        armInactivity();
                        updateSinceFromText(text);
                        safeSend(ws, maybeStripTimestamps(text));
                    };

                    const onChunk = (chunk: Buffer) => onText(chunk.toString("utf-8"));

                    if (isTty) {
                        (stream as any).on("data", onChunk);
                    } else {
                        const out = new PassThrough();
                        const errOut = new PassThrough();
                        out.on("data", (b: Buffer) => onText(b.toString("utf-8")));
                        errOut.on("data", (b: Buffer) => onText(b.toString("utf-8")));

                        try {
                            // @ts-ignore
                            docker.modem.demuxStream(stream, out, errOut);
                        } catch {
                            (stream as any).on("data", onChunk);
                        }
                    }

                    armInactivity();

                    const finish = () => {
                        if (inactivityTimer) clearTimeout(inactivityTimer);
                        resolve();
                    };

                    (stream as any).on("end", finish);
                    (stream as any).on("error", finish);
                });
            });
        };

        (async () => {
            while (!closed) {
                await attachOnce();
                if (closed) break;
                await sleep(800);
            }
        })().catch(() => closeAll());
    });

    app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
        "/v1/servers/:id/logs",
        async (req) => {
            const tail = req.query.tail ? Number(req.query.tail) : 200;
            const text = await tailLogs(req.params.id, Number.isFinite(tail) ? tail : 200);
            return { ok: true, logs: text };
        }
    );

    // commands
    app.get("/v1/servers/:id/console/stream", { websocket: true }, async (connection, req) => {
        const ws: any = (connection as any)?.socket ?? (connection as any);

        const serverId = (req.params as any)?.id ?? (() => {
            const rawUrl = String(req.raw?.url ?? "");
            const path = rawUrl.split("?")[0];
            const m = path.match(/^\/v1\/servers\/([^/]+)\/console\/stream$/);
            return m?.[1];
        })();

        if (!serverId) {
            safeSend(ws, "ERROR: serverId not found\n");
            try { ws.close?.(); } catch {}
            return;
        }

        const name = containerName(serverId);
        const container = docker.getContainer(name);
        const info = await container.inspect().catch(() => null);
        if (!info) {
            safeSend(ws, `ERROR: container not found: ${name}\n`);
            try { ws.close?.(); } catch {}
            return;
        }

        const open = Boolean((info as any)?.Config?.OpenStdin);
        const attach = Boolean((info as any)?.Config?.AttachStdin);
        const tty = Boolean((info as any)?.Config?.Tty);

        safeSend(ws, `[agent] console inspect: OpenStdin=${open} AttachStdin=${attach} Tty=${tty}\n`);

        if (!open) {
            safeSend(ws, `ERROR: Container was created with OpenStdin=false. Enable stdin_open/OpenStdin.\n`);
            try { ws.close?.(); } catch {}
            return;
        }
        let closed = false;
        let stdinStream: any = null;
        let attaching = false;

        const closeAll = () => {
            if (closed) return;
            closed = true;
            try { stdinStream?.destroy?.(); } catch {}
            try { ws.terminate?.(); } catch {}
            try { ws.close?.(); } catch {}
        };

        ws.on("close", closeAll);
        ws.on("error", closeAll);

        const attachStdin = async () => {
            if (closed || attaching) return;
            attaching = true;

            try { stdinStream?.destroy?.(); } catch {}
            stdinStream = null;

            try {
                // attach stdin-only (no logs here)
                const stream = await container.attach({
                    stream: true,
                    stdin: true,
                    stdout: false,
                    stderr: false,
                    logs: false,
                    hijack: true
                });
                (stream as any).resume?.();
                stdinStream = stream as any;
                safeSend(ws, `[agent] console attached for ${name}\n`);

                // wenn attach-stream endet (restart etc.), reattach versuchen
                (stdinStream as any).on("end", async () => {
                    attaching = false;
                    if (!closed) {
                        safeSend(ws, `[agent] console detached, reattaching...\n`);
                        await sleep(500);
                        await attachStdin();
                    }
                });

                (stdinStream as any).on("error", async () => {
                    attaching = false;
                    if (!closed) {
                        await sleep(500);
                        await attachStdin();
                    }
                });
            } catch (e: any) {
                attaching = false;
                safeSend(ws, `ERROR: console attach failed: ${String(e?.message ?? e)}\n`);
                // retry loop
                if (!closed) {
                    await sleep(800);
                    await attachStdin();
                }
            } finally {
                attaching = false;
            }
        };

        // Commands vom Panel entgegennehmen
        ws.on("message", async (data: any) => {
            if (closed) return;

            const text = Buffer.isBuffer(data) ? data.toString("utf-8") : String(data);

            // optional: JSON protocol
            let cmd = text;
            try {
                const obj = JSON.parse(text);
                if (obj?.type === "cmd" && typeof obj.data === "string") cmd = obj.data;
            } catch {
                // plain text ok
            }

            cmd = cmd.replace(/\r?\n/g, "").trim();
            if (!cmd) return;

            // ensure attached
            if (!stdinStream) await attachStdin();

            try {
                const line = cmd + "\n";
                const ok = (stdinStream as any)?.write?.(line);

                if (ok === false) {
                    safeSend(ws, "WARN: stdin backpressure (write returned false)\n");
                } else {
                    safeSend(ws, "[agent] ok\n");
                }
            } catch (e: any) {
                safeSend(ws, `ERROR: write failed: ${String(e?.message ?? e)}\n`);
                // try reattach next time
                try { stdinStream?.destroy?.(); } catch {}
                stdinStream = null;
            }
        });

        await attachStdin();
    });

    // server create
    app.post<{ Params: { id: string }; Body: Omit<ServerSpec, "serverId"> }>(
        "/v1/servers/:id/create",
        async (req) => {
            const serverId = req.params.id;
            const spec: ServerSpec = { serverId, ...req.body };
            const result = await createOrReplaceContainer(spec);
            return { ok: true, ...result };
        }
    );

    /**
     * Server lifecycle management.
     */

    app.get<{ Params: { id: string } }>("/v1/servers/:id/exists", async (req) => {
        const exists = await containerExists(req.params.id);
        return { ok: true, exists };
    });

    app.get<{ Params: { id: string } }>("/v1/servers/:id/status", async (req) => {
        const status = await containerStatus(req.params.id);
        return { ok: true, ...status };
    });

    app.post<{ Params: { id: string } }>("/v1/servers/:id/start", async (req) => {
        await startContainer(req.params.id);
        return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/v1/servers/:id/stop", async (req) => {
        await stopContainer(req.params.id);
        return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/v1/servers/:id/restart", async (req) => {
        await restartContainer(req.params.id);
        return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/v1/servers/:id", async (req) => {
        await deleteContainer(req.params.id);
        return { ok: true };
    });

    // Starting Fastify Endpoint
    await enrollIfNeeded(app);

    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Agent listening on ${endpointUrl}`);
    app.log.info(`Panel URL: ${panelUrl}`);
    app.log.info(`Node name: ${nodeName}`);
    app.log.info(`Agent version: ${agentVersion}`);

}

bootstrap().catch((err) => {
  console.error(err, "Agent failed to start");
  process.exit(1);
});
