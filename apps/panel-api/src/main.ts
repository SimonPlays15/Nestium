import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {WebSocketServer} from "ws";
import WebSocket from "ws";
import {agentSignedHeaders} from "./nodes/agent/agent-client";
import {PrismaService} from "./prisma/prisma.service";

function toWsUrl(httpUrl: string) {
  // http://localhost:8081 -> ws://localhost:8081
  // https://... -> wss://...
  return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({origin: true, credentials: true});

  const prisma = app.get(PrismaService);
  const httpServer = await app.listen(process.env.PORT ?? 3000);
  const wss = new WebSocketServer({
    server: (httpServer as any),
    path: "/ws/logs",
  })
  wss.on("connection", async (clientWs, req) => {
    try {
      // URL: ws://localhost:3000/ws/logs?serverId=<uuid>
      const url = new URL(req.url ?? "", "http://localhost");
      const serverId = url.searchParams.get("serverId");
      if (!serverId) {
        clientWs.close(1008, "Missing serverId");
        return;
      }

      // TODO später: Auth check (User darf server sehen)
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) {
        clientWs.close(1008, "Server not found");
        return;
      }

      const node = await prisma.node.findUnique({ where: { id: server.nodeId } });
      if (!node) {
        clientWs.close(1008, "Node not found");
        return;
      }

      const agentPath = `/v1/servers/${serverId}/logs/stream`;
      const agentUrl = `${toWsUrl(node.endpointUrl)}${agentPath}`;

      const headers = agentSignedHeaders({
        nodeId: node.id,
        sharedSecret: node.sharedSecret,
        method: "GET",
        path: agentPath,
        bodyStr: "",
      });

      // Panel -> Agent WS (mit HMAC headers)
      const agentWs = new WebSocket(agentUrl, {headers});

      const closeBoth = (code = 1000, reason = "closed") => {
        try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code, reason); } catch {}
        try { if (agentWs.readyState === WebSocket.OPEN) agentWs.close(code, reason); } catch {}
      };

      clientWs.on("close", () => closeBoth());
      clientWs.on("error", () => closeBoth(1011, "client error"));

      agentWs.on("open", () => {
        // optional handshake message
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "status", ok: true }));
        }
      });

      agentWs.on("message", (data) => {
        // forward raw text
        if (clientWs.readyState === WebSocket.OPEN) {
          // du kannst hier auch JSON wrappen, aber raw ist für MVP ok
          clientWs.send(data.toString());
        }
      });

      agentWs.on("close", () => closeBoth(1000, "agent closed"));
      agentWs.on("error", () => closeBoth(1011, "agent error"));
    } catch {
      try { clientWs.close(1011, "proxy error"); } catch {}
    }
  });

  console.log("Panel WS proxy available at ws://localhost:3000/ws/logs?serverId=<id>");
}
bootstrap().catch((err) => {
  console.error('Failed to start the application:', err);
  process.exit(1);
});
