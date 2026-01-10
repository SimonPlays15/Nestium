import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import WebSocket from 'ws';
import { agentSignedHeaders } from '../nodes/agent/agent-client';
import crypto from 'crypto';

@WebSocketGateway({ path: '/ws/logs' })
export class ServersGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

// ... existing code ...
  private proxyToAgent(clientWs: WebSocket, serverData: any, serverId: string) {
    const node = serverData.node;
    const agentWsUrl = node.endpointUrl.replace(/^http/, 'ws').replace('localhost', '127.0.0.1') + `/v1/servers/${serverId}/logs/stream`;

    console.log(`Connecting to Agent WS: ${agentWsUrl}`);

    const headers = agentSignedHeaders({
      nodeId: node.id,
      sharedSecret: node.sharedSecret,
      method: 'GET',
      path: `/v1/servers/${serverId}/logs/stream`,
      bodyStr: '',
    });

    const agentWs = new WebSocket(agentWsUrl, { headers,
      handshakeTimeout: 10000, // Erhöhe auf 10s
      skipUTF8Validation: true
    });
    agentWs.on('unexpected-response', (req, res) => {
      console.error(`Agent rejected connection with Status: ${res.statusCode}`);
      // Wenn hier 401 steht -> HMAC Fehler
      // Wenn hier 404 steht -> Pfad falsch
      clientWs.close(1011, `Agent rejected: ${res.statusCode}`);
    });
    agentWs.on('open', () => {
      console.log('Connected to Agent successfully');
    });

    agentWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        // Sicherstellen, dass wir Buffer korrekt zu String wandeln
        const payload = Buffer.isBuffer(data) ? data.toString('utf-8') : data.toString();
        clientWs.send(JSON.stringify({ type: 'live', data: payload }));
      }
    });

    agentWs.on('close', (code, reason) => {
      console.log(`Agent WS closed: ${code} ${reason}`);
      clientWs.close();
    });

    agentWs.on('error', (err) => {
      console.error('Agent WS Error:', err);
      clientWs.close();
    });

    clientWs.on('close', () => {
      console.log('Client disconnected, closing Agent connection');
      agentWs.close();
    });
  }
}