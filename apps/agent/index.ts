import Fastify from "fastify";
import { z } from "zod";
import path from "path"
import fs from "fs"
import { hmacAuthHook } from "./security/authHook";
import {
  createOrReplaceContainer,
  startContainer,
  stopContainer,
  deleteContainer,
  tailLogs,
  containerExists, containerStatus, restartContainer
} from "./docker/runtime";
import { containerName } from "./docker/names";
import { createDockerClient } from "./docker/client";
import websocket from "@fastify/websocket";
import { ServerSpec } from "./docker/types";

const RegisterResponseSchema = z.object({
  nodeId: z.string(),
  sharedSecret: z.string(),
});

type AgentIdentity = {
  nodeId: string;
  sharedSecret: string;
};

const app = Fastify({ logger: true, trustProxy: true, });
app.register(websocket);
app.addHook("preHandler", hmacAuthHook);

const port = Number(process.env.AGENT_PORT ?? "8081");
const nodeName = process.env.NODE_NAME ?? "node";
const endpointUrl = process.env.NODE_ENDPOINT_URL ?? `http://localhost:${port}`;
const panelUrl = process.env.PANEL_URL ?? "http://localhost:3000";
const enrollToken = process.env.ENROLL_TOKEN;
const agentVersion = process.env.AGENT_VERSION ?? "0.1.0";

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

app.get(
    "/v1/servers/:id/logs/stream",
    { websocket: true },
    (connection, req) => {
      const serverId = (req.params as any).id as string;
      const name = containerName(serverId);

      let ended = false;

      (async () => {
        try {
          const container = docker.getContainer(name);

          // follow logs
          const stream = await container.logs({
            stdout: true,
            stderr: true,
            follow: true,
            tail: 0,
            timestamps: false,
          });

          const closeAll = () => {
            if (ended) return;
            ended = true;
            try { (stream as any)?.destroy?.(); } catch {}
            try { connection.socket.close(); } catch {}
          };

          connection.socket.on("close", closeAll);
          connection.socket.on("error", closeAll);

          // dockerode kann Buffer oder Stream liefern
          if (Buffer.isBuffer(stream)) {
            connection.socket.send(stream.toString("utf-8"));
            closeAll();
            return;
          }

          (stream as any).on("data", (chunk: Buffer) => {
            // plain text (weil du Tty:true gesetzt hast)
            try {
              connection.socket.send(chunk.toString("utf-8"));
            } catch {
              closeAll();
            }
          });

          (stream as any).on("end", closeAll);
          (stream as any).on("error", closeAll);
        } catch (e: any) {
          // Wenn container nicht existiert o.ä.
          try {
            connection.socket.send(`ERROR: ${String(e?.message ?? e)}`);
          } catch {}
          try { connection.socket.close(); } catch {}
        }
      })();
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
app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
    "/v1/servers/:id/logs",
    async (req) => {
      const tail = req.query.tail ? Number(req.query.tail) : 200;
      const text = await tailLogs(req.params.id, Number.isFinite(tail) ? tail : 200);
      return { ok: true, logs: text };
    }
);

async function main() {
  await enrollIfNeeded();

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Agent listening on ${endpointUrl}`);
}

main().catch((err) => {
  app.log.error(err, "Agent failed to start");
  process.exit(1);
});
