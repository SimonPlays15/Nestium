import {OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer,} from '@nestjs/websockets';
import WebSocket, {Server} from 'ws';
import {IncomingMessage} from 'http';
import {PrismaService} from '../prisma/prisma.service';
import {agentSignedHeaders} from '../nodes/agent/agent-client';
import crypto from 'crypto';
import {toWsUrl} from '@nestium/shared';

function safeWsClose(ws: WebSocket | null, code = 1000, reason = "closed") {
  if (!ws) return;
  try {
    if (ws.readyState === WebSocket.CONNECTING) return ws.terminate();
    if (ws.readyState === WebSocket.OPEN) return ws.close(code, reason);
  } catch {}
}

@WebSocketGateway({ path: '/ws/logs' })
export class ServersLogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server | undefined;

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const serverId = url.searchParams.get('serverId');
    const token = url.searchParams.get('token');

    if (!serverId || !token) {
      client.close(1008, 'Missing serverId or token');
      return;
    }

    // Token Validierung
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const wsToken = await this.prisma.wsToken.findUnique({ where: { tokenHash } });

    if (!wsToken || wsToken.serverId !== serverId || wsToken.expiresAt < new Date()) {
      client.close(1008, 'Invalid or expired token');
      return;
    }
    await this.prisma.wsToken.delete({ where: { tokenHash } });

    const serverData = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });

    if (!serverData || !serverData.node) {
      client.close(1008, 'Server or Node not found');
      return;
    }

    this.proxyToAgent(client, serverData, serverId);
  }

  handleDisconnect(client: WebSocket) {
    // Cleanup wird durch die proxyToAgent Logik erledigt
  }

  private proxyToAgent(clientWs: WebSocket, serverData: any, serverId: string) {
    const node = serverData.node;

    const agentPath = `/v1/servers/${serverId}/logs/stream`; // signiert OHNE query
    const agentUrl = `${toWsUrl(node.endpointUrl)}${agentPath}?tail=0`;

    let agentWs: WebSocket | null = null;
    let closed = false;
    let connecting = false;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const sendToClient = (obj: any) => {
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(obj));
        }
      } catch {}
    };

    const cleanupAgent = () => {
      try { agentWs?.removeAllListeners(); } catch {}
      safeWsClose(agentWs, 1000, "cleanup");
      agentWs = null;
    };

    const scheduleReconnect = (ms: number) => {
      if (closed) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectAgent();
      }, ms);
    };

    const closeAll = (code = 1000, reason = "closed") => {
      if (closed) return;
      closed = true;

      if (reconnectTimer) {
        try { clearTimeout(reconnectTimer); } catch {}
        reconnectTimer = null;
      }

      cleanupAgent();
      try { clearInterval(pingTimer); } catch {}

      safeWsClose(clientWs as any, code, reason);
    };

    // Keepalive pings
    const pingTimer = setInterval(() => {
      try { if (clientWs.readyState === WebSocket.OPEN) clientWs.ping(); } catch {}
      try { if (agentWs && agentWs.readyState === WebSocket.OPEN) agentWs.ping(); } catch {}
    }, 25_000);

    const sendTail = async () => {
      try {
        const tailPath = `/v1/servers/${serverId}/logs?tail=200`;
        const headers = agentSignedHeaders({
          nodeId: node.id,
          sharedSecret: node.sharedSecret,
          method: "GET",
          path: tailPath,
          bodyStr: "",
        });

        const res = await fetch(`${node.endpointUrl}${tailPath}`, { headers });
        if (!res.ok) return;

        const json = await res.json().catch(() => null);
        const logsText = json?.logs ?? "";
        if (logsText) sendToClient({ type: "tail", data: logsText });
      } catch {
        // ignore
      }
    };

    const connectAgent = () => {
      if (closed || connecting) return;
      connecting = true;

      cleanupAgent();

      const headers = agentSignedHeaders({
        nodeId: node.id,
        sharedSecret: node.sharedSecret,
        method: "GET",
        path: agentPath, // ✅ OHNE query signieren
        bodyStr: "",
      });

      console.log(`Connecting to Agent WS: ${agentUrl}`);

      const ws = new WebSocket(agentUrl, { headers, handshakeTimeout: 20_000 });
      agentWs = ws;

      // IMPORTANT: always have an error listener (prevents "Unhandled 'error' event")
      ws.on("error", () => {});

      ws.on("unexpected-response", (_req, res) => {
        connecting = false;
        console.error(`Agent rejected connection: ${res.statusCode}`);

        // ✅ kill this socket and retry
        try { ws.terminate(); } catch {}
        sendToClient({ type: "agent", status: "rejected", code: res.statusCode });

        scheduleReconnect(1200);
      });

      ws.on("open", async () => {
        connecting = false;
        console.log("Connected to Agent successfully");
        sendToClient({ type: "agent", status: "connected" });

        await sendTail(); // ✅ resync on every connect
      });

      ws.on("message", (data) => {
        const payload = Buffer.isBuffer(data) ? data.toString("utf-8") : data.toString();
        sendToClient({ type: "live", data: payload });
      });

      ws.on("close", (code, reason) => {
        connecting = false;
        console.log(`Agent WS closed: ${code} ${reason?.toString?.() ?? ""}`);

        sendToClient({ type: "agent", status: "disconnected", code });
        scheduleReconnect(900);
      });

      ws.on("error", (err) => {
        connecting = false;
        console.error("Agent WS Error:", err);
        scheduleReconnect(900);
      });
    };

    clientWs.on("close", () => closeAll(1000, "client closed"));
    clientWs.on("error", () => closeAll(1011, "client error"));

    connectAgent();
  }
}