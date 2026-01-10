import Fastify from "fastify";
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
import {containerName} from "./docker/names";
import {createDockerClient} from "./docker/client";
import websocket from "@fastify/websocket";
import {ServerSpec} from "./docker/types";

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
const nodeName = process.env.NODE_NAME ?? `nestium-Node-${uuidv4()}`;
const endpointUrl = process.env.NODE_ENDPOINT_URL ?? `http://localhost:${port}`;
const panelUrl = process.env.PANEL_URL ?? "http://localhost:3000";
const enrollToken = process.env.ENROLL_TOKEN;
const agentVersion = process.env.AGENT_VERSION ?? "0.1.0";

const app = Fastify(
    {
      logger: {
        name: nodeName,
        serializers: {
          res (reply){
            return {
              statusCode: reply.statusCode
            }
          },
        },
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true, translateTime: "HH:mm:ss Z", ignore: "pid,hostname"
          }
        },
  }, trustProxy: true, });
app.register(websocket, {
    options: {
        maxPayload: 1048576,
        idleTimeout: 30000,
    }
});
app.addHook("preHandler", hmacAuthHook);



// Identity speichern wir lokal, damit der Agent nicht bei jedem Start neu registriert
const dataDir = path.join(process.cwd(), "data");
const identityPath = path.join(dataDir, "identity.json");

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

function saveIdentity(id: AgentIdentity) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(id, null, 2), "utf-8");
}

async function enrollIfNeeded() {
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

/**
 * Docker API
 */

const docker = createDockerClient();
function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

app.get<{ Params: { id: string }, Querystring: { tail?: string } }>(
    "/v1/servers/:id/logs/stream",
    { websocket: true },
    (connection, req) => {
        let serverId = req.params?.id;
        if (!serverId || serverId === ':id') {
            const rawUrl = req.raw?.url ?? "";
            const urlPath = rawUrl.split("?")[0];
            serverId = urlPath.split("/")[3];
        }
        if (!serverId) {
            app.log.error({ rawUrl: req.raw.url, url: req.url }, "Handshake failed: serverId not found");
            if(connection && connection.socket){
                connection.socket.destroy();
            }
            return;
        }

        const tail = req.query?.tail ? parseInt(req.query.tail as string, 10) : 100;
        app.log.info({ serverId, tail }, "Logs stream request accepted");

        const name = containerName(serverId);
        const container = docker.getContainer(name);

        let closed = false;
        let activeStream: any = null;

        const closeAll = () => {
            if (closed) return;
            closed = true;
            try { activeStream?.destroy?.(); } catch {}
            try { connection.socket.close(); } catch {}
        };

        connection.socket.on("close", closeAll);
        connection.socket.on("error", closeAll);

    const attachOnce = () =>
        new Promise<void>((resolve) => {
            if (closed) return resolve();

            container.logs(
                {
                    stdout: true,
                    stderr: true,
                    follow: true,
                    tail,
                    timestamps: false,
                },
                (err, stream) => {
                    if (err || !stream) {
                        app.log.error(err, "Failed to get logs from docker");
                        connection.socket.send("ERROR: Could not attach to logs");
                        return;
                    }

                    activeStream = stream;

                    const handleData = (chunk: Buffer) => {
                        if (closed) return;

                        // Docker Multiplex Header (8 Bytes) entfernen falls vorhanden
                        // Format: [STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4]
                        let offset = 0;
                        while (offset < chunk.length) {
                            if (chunk.length - offset < 8) {
                                // Rest zu klein für Header, als Plain senden
                                connection.socket.send(chunk.slice(offset).toString('utf-8'));
                                break;
                            }

                            const type = chunk.readUInt8(offset);
                            if (type >= 0 && type <= 3) { // 0, 1, 2 sind gültige Docker Stream Typen
                                const size = chunk.readUInt32BE(offset + 4);
                                const end = offset + 8 + size;
                                const message = chunk.slice(offset + 8, Math.min(end, chunk.length));
                                connection.socket.send(message.toString('utf-8'));
                                offset = end;
                            } else {
                                // Kein erkennbarer Header, sende restliches Chunk
                                connection.socket.send(chunk.slice(offset).toString('utf-8'));
                                break;
                            }
                        }
                    };

                    // WICHTIG: Streams in Node.js können im paused state starten
                    if (typeof (stream as any).on === 'function') {
                        (stream as any).on('data', handleData);
                        (stream as any).on('error', () => closeAll());
                        (stream as any).on('end', () => closeAll());

                        // Explizit resume aufrufen, falls es ein Readable Stream ist
                        if ((stream as any).resume) (stream as any).resume();
                    }
                }
            );
        });

    (async () => {
        // Keep reattaching while WS alive
        while (!closed) {
            await attachOnce();
            if (closed) break;
            await sleep(800); // backoff to avoid tight loop
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


async function main() {
  await enrollIfNeeded();

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Agent listening on ${endpointUrl}`);
  app.log.info(`Panel URL: ${panelUrl}`);
  app.log.info(`Node name: ${nodeName}`);
  app.log.info(`Agent version: ${agentVersion}`);
}

main().catch((err) => {
  app.log.error(err, "Agent failed to start");
  process.exit(1);
});
