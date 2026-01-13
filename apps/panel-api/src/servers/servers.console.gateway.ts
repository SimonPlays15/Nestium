import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import WebSocket from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import crypto from 'crypto';
import { IncomingMessage } from 'http';
import { agentSignedHeaders } from '../nodes/agent/agent-client';
import { toWsUrl } from '@nestium/shared';

/**
 * Safely closes a WebSocket connection if it is not null and in a state that allows closing.
 * If the WebSocket is in the CONNECTING state, it terminates the connection.
 * If the WebSocket is in the OPEN state, it gracefully closes the connection with the specified code and reason.
 *
 * @param {WebSocket | null} ws - The WebSocket instance to be closed, or null if no WebSocket exists.
 * @param {number} [code=1000] - The status code indicating the reason for closing the WebSocket connection.
 * @param {string} [reason='closed'] - A human-readable string providing an explanation as to why the connection is being closed.
 * @return {void} This function does not return a value.
 */
function safeWsClose(
  ws: WebSocket | null,
  code: number = 1000,
  reason: string = 'closed',
): void {
  if (!ws) return;
  try {
    if (ws.readyState === WebSocket.CONNECTING) return ws.terminate();
    if (ws.readyState === WebSocket.OPEN) return ws.close(code, reason);
  } catch {}
}

/**
 * Represents a WebSocket gateway for handling and proxying console connections
 * between clients and servers.
 *
 * This gateway functions as a bridge to connect a user's browser to a server's
 * console via WebSocket. It ensures secure communication by validating tokens
 * and verifies the presence of corresponding server and node data. Additionally,
 * it proxies bidirectional message streams between the client and the server.
 *
 * Decorated with `@WebSocketGateway`, it also specifies the configured WebSocket
 * endpoint path.
 */
@WebSocketGateway({ path: '/ws/console' })
export class ServerConsoleGateway implements OnGatewayConnection {
  constructor(private prisma: PrismaService) {}

  async handleConnection(clientWs: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const serverId = url.searchParams.get('serverId');
    const token = url.searchParams.get('token');

    if (!serverId || !token) {
      clientWs.close(1008, 'Missing serverId or token');
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const wsToken = await this.prisma.wsToken.findUnique({
      where: { tokenHash },
    });

    if (
      !wsToken ||
      wsToken.serverId !== serverId ||
      wsToken.expiresAt < new Date()
    ) {
      clientWs.close(1008, 'Invalid or expired token');
      return;
    }
    await this.prisma.wsToken.delete({ where: { tokenHash } });

    const serverData = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });

    if (!serverData?.node) {
      clientWs.close(1008, 'Server or Node not found');
      return;
    }

    this.proxyConsole(clientWs, serverData, serverId);
  }

  private proxyConsole(clientWs: WebSocket, serverData: any, serverId: string) {
    const node = serverData.node;

    const agentPath = `/v1/servers/${serverId}/console/stream`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const agentUrl = `${toWsUrl(node.endpointUrl)}${agentPath}`;

    let closed = false;
    let agentWs: WebSocket | null = null;

    const closeAll = () => {
      if (closed) return;
      closed = true;
      safeWsClose(agentWs, 1000, 'cleanup');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      safeWsClose(clientWs as any, 1000, 'cleanup');
    };

    const headers = agentSignedHeaders({
      nodeId: node.id,
      sharedSecret: node.sharedSecret,
      method: 'GET',
      path: agentPath,
      bodyStr: '',
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    agentWs = new WebSocket(agentUrl, { headers, handshakeTimeout: 20_000 });

    agentWs.on('open', () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'agent', status: 'connected' }));
      }
    });

    // Agent -> Browser
    agentWs.on('message', (data) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      const payload = Buffer.isBuffer(data)
        ? data.toString('utf-8')
        : data.toString();
      clientWs.send(JSON.stringify({ type: 'agent', data: payload }));
    });

    agentWs.on('close', () => closeAll());
    agentWs.on('error', () => closeAll());

    // Browser -> Agent (Commands)
    clientWs.on('message', (data) => {
      if (!agentWs || agentWs.readyState !== WebSocket.OPEN) return;
      // Data kann schon JSON sein – wir forwarden 1:1
      agentWs.send(data);
    });

    clientWs.on('close', () => closeAll());
    clientWs.on('error', () => closeAll());
  }
}
