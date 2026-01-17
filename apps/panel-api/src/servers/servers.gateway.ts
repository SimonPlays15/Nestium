import {OnGatewayConnection, WebSocketGateway} from '@nestjs/websockets';
import WebSocket from 'ws';
import crypto from 'crypto';
import {PrismaService} from '../prisma/prisma.service';
import {toWsUrl} from "@nestium/shared";
import {agentSignedHeaders} from "../nodes/agent/agent-client";
import {ServersService} from "./servers.service";

/**
 * Safely closes a WebSocket connection, ensuring proper handling of different states.
 *
 * @param {WebSocket | null} ws - The WebSocket instance to be closed. Can be null.
 * @param {number} [code=1000] - The status code explaining why the connection is being closed.
 * @param {string} [reason='closed'] - A human-readable reason for closing the connection.
 * @return {void} This function does not return a value.
 */
function safeClose(ws: WebSocket | null, code: number = 1000, reason: string = 'closed'): void {
    if (!ws) return;
    try {
        if (ws.readyState === WebSocket.CONNECTING) {
            ws.terminate(); // wichtig gegen "closed before established"
            return;
        }
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(code, reason);
            return;
        }
    } catch {
    }
}

/**
 * Safely sends a JSON-serialized object through a WebSocket connection if the connection is open.
 *
 * @param {WebSocket} ws - The WebSocket instance through which the object will be sent.
 * @param {any} obj - The object to be serialized and sent.
 * @return {void} This method does not return a value.
 */
function safeSend(ws: WebSocket, obj: any): void {
    try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    } catch {
        /* empty */
    }
}

/**
 * Represents the possible states of a server.
 *
 * This type definition enumerates all the valid states
 * that a server can be in during its lifecycle.
 *
 * - `unknown`: The server state is not determined or has not been initialized.
 * - `starting`: The server is in the process of starting up.
 * - `running`: The server is currently running and operational.
 * - `stopped`: The server has been intentionally stopped and is not running.
 * - `crashed`: The server has encountered an error and is no longer operational.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ServerState = 'unknown' | 'starting' | 'running' | 'stopped' | 'crashed';
/**
 * Represents the available communication channels for an agent.
 *
 * `AgentChannel` is a union type that defines the specific strings that
 * can be used to denote different operational channels in a system.
 *
 * - `'logs'`: Represents the channel dedicated to logging information or messages.
 * - `'console'`: Represents the console channel, typically used for debugging or direct system outputs.
 * - `'status'`: Represents the channel used to convey operational or system status updates.
 */
type AgentChannel = 'logs' | 'console' | 'status';

/**
 * WebSocket gateway that manages real-time server communication via websockets.
 * This gateway handles connections to and from server clients, performs authentication,
 * and proxies data to the appropriate server node for logs and console streams.
 * Implements the `OnGatewayConnection` interface for handling client connections.
 */
@WebSocketGateway({path: '/ws/servers'})
export class ServersGateway implements OnGatewayConnection {

    constructor(private prisma: PrismaService, private serverService: ServersService) {
    }

    async handleConnection(clientWs: WebSocket, req: any) {
        try {
            const url = new URL(req.url ?? '', `http://${req.headers.host}`);
            const serverId = url.searchParams.get('serverId');
            const token = url.searchParams.get('token');

            if (!serverId || !token) {
                clientWs.close(1008, 'Missing serverId/token');
                return;
            }

            // 1) Token prüfen (single-use)
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const wsToken = await this.prisma.wsToken.findUnique({where: {tokenHash}});

            if (!wsToken || wsToken.serverId !== serverId || wsToken.expiresAt.getTime() < Date.now()) {
                safeClose(clientWs, 1008, 'Invalid token');
                return;
            }

            if ((wsToken as any).userId && req.user?.id && (wsToken as any).userId !== req.user.id) {
                safeClose(clientWs, 1008, 'Token user mismatch');
                return;
            }
            // single use
            await this.prisma.wsToken.delete({where: {tokenHash}});

            const server = await this.prisma.server.findUnique({where: {id: serverId}});
            if (!server) {
                safeClose(clientWs, 1008, 'Server not found');
                return;
            }
            await this.serverService.assertServerAccess(req.user?.id ?? null, serverId);

            const node = await this.prisma.node.findUnique({where: {id: server.nodeId}});
            if (!node) {
                safeClose(clientWs, 1008, 'Node not found');
                return;
            }

            this.proxyAll(clientWs, node, serverId, req);

        } catch (error) {
            try {
                clientWs.close(1011, `${error}`);
            } catch {
                /* empty */
            }
        }
    }

    private proxyAll(clientWs: WebSocket, node: any, serverId: string, req: any) {
        let closed: boolean = false;

        // Downstream Sockets
        let agentLogsWs: WebSocket | null = null;
        let agentStatusWs: WebSocket | null = null;
        // Status State
        let lastState: ServerState = 'unknown';
        let pollTimer: NodeJS.Timeout | null = null;
        const setState = (s: ServerState) => {
            lastState = s;
            safeSend(clientWs, {type: 'state', value: s});
        }
        const setAgent = (channel: AgentChannel, status: 'connected' | 'disconnected') => {
            safeSend(clientWs, {type: 'agent', channel, status});
        };

        const closeAll = () => {
            if (closed) return;
            closed = true;

            if (pollTimer) {
                try {
                    clearInterval(pollTimer);
                } catch {
                }
                pollTimer = null;
            }

            safeClose(agentLogsWs);
            safeClose(agentStatusWs);
            agentLogsWs = null;
            agentStatusWs = null;

            safeClose(clientWs);
        };

        clientWs.on('close', closeAll);
        clientWs.on('error', closeAll);

        // ---------------------------
        // (A) LOGS Stream (Agent WS)
        // ---------------------------
        const logsPath = `/v1/servers/${serverId}/logs/stream`;
        const logsUrl = `${toWsUrl(node.endpointUrl)}${logsPath}?tail=100`;

        const connectLogs = () => {
            if (closed) return;
            const headers = agentSignedHeaders({
                nodeId: node.id,
                sharedSecret: node.sharedSecret,
                method: "GET",
                path: logsPath,
                bodyStr: ''
            });
            safeClose(agentLogsWs);
            agentLogsWs = new WebSocket(logsUrl, {headers, handshakeTimeout: 10000});
            agentLogsWs.on('open', () => setAgent('logs', 'connected'));
            agentLogsWs.on('message', (data) => {
                safeSend(clientWs, {type: 'logs', data: data.toString()});
            });
            agentLogsWs.on('close', () => {
                setAgent('logs', 'disconnected');
                if (!closed) setTimeout(connectLogs, 900);
            });
            agentLogsWs.on('error', () => {
                try {
                    agentLogsWs?.close();
                } catch {
                }
            });
        }

        // -----------------------------------
        // (B) STATUS Stream (Agent WS) + Fallback
        // -----------------------------------
        const statusStreamPath = `/v1/servers/${serverId}/status/stream`;
        const statusStreamUrl = `${toWsUrl(node.endpointUrl)}${statusStreamPath}`;

        const connectStatusStream = () => {
            if (closed) return;

            const headers = agentSignedHeaders({
                nodeId: node.id,
                sharedSecret: node.sharedSecret,
                method: 'GET',
                path: statusStreamPath,
                bodyStr: '',
            });

            safeClose(agentStatusWs);
            agentStatusWs = new WebSocket(statusStreamUrl, {headers, handshakeTimeout: 10_000});

            let gotAnyMessage = false;

            agentStatusWs.on('open', () => setAgent('status', 'connected'));
            agentStatusWs.on('message', (data) => {
                gotAnyMessage = true;
                // Erwartung: Agent sendet z.B. {"type":"state","value":"running"} oder nur "running"
                const txt = data.toString();
                try {
                    const obj = JSON.parse(txt);
                    if (obj?.value) setState(obj.value);
                    else if (obj?.status) setState(obj.status);
                } catch {
                    // fallback plain string
                    if (txt.includes('running')) setState('running');
                    else if (txt.includes('starting')) setState('starting');
                    else if (txt.includes('stopped')) setState('stopped');
                    else if (txt.includes('crashed')) setState('crashed');
                }
            });

            agentStatusWs.on('close', () => {
                setAgent('status', 'disconnected');
                // wenn nie eine Message kam -> vermutlich endpoint nicht vorhanden -> polling reicht
                if (!gotAnyMessage) return;
                if (!closed) setTimeout(connectStatusStream, 1200);
            });

            agentStatusWs.on('unexpected-response', () => {
                // endpoint nicht da → polling übernimmt
                try {
                    agentStatusWs?.close();
                } catch {
                }
            });

            agentStatusWs.on('error', () => {
                try {
                    agentStatusWs?.close();
                } catch {
                }
            });
        };

        // Poll-Fallback
        const pollStatus = async () => {
            try {
                const path = `/v1/servers/${serverId}/status`;
                const headers = agentSignedHeaders({
                    nodeId: node.id,
                    sharedSecret: node.sharedSecret,
                    method: 'GET',
                    path,
                    bodyStr: '',
                });

                const res = await fetch(`${node.endpointUrl}${path}`, {headers});
                if (!res.ok) return;

                const json: any = await res.json().catch(() => null);
                if (!json || json.ok !== true) return;

                const s =
                    json.state ??
                    json.status ??
                    json.lifecycle ??
                    (json.running === true ? 'running' : undefined) ??
                    (json.isRunning === true ? 'running' : undefined);

                if (typeof s === 'string') {
                    const normalized =
                        s === 'online' ? 'running'
                            : s === 'offline' ? 'stopped'
                                : s;

                    if (['unknown', 'starting', 'running', 'stopped', 'crashed'].includes(normalized)) {
                        setState(normalized as ServerState);
                    }
                }
            } catch {
                // ignore
            }
        };

        pollTimer = setInterval(() => void pollStatus(), 2000);
        void pollStatus();

        // -----------------------------------
        // (C) CONSOLE Commands (Browser -> Panel -> Agent HTTP)
        // -----------------------------------
        const sendCommandToAgent = async (cmd: string) => {
            const path = `/v1/servers/${serverId}/command`;
            const body = {command: cmd};

            const headers = agentSignedHeaders({
                nodeId: node.id,
                sharedSecret: node.sharedSecret,
                method: 'POST',
                path,
                bodyStr: JSON.stringify(body),
            });

            const r = await fetch(`${node.endpointUrl}${path}`, {
                method: 'POST',
                headers: {...headers, 'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });

            return r.ok;
        };

        clientWs.on('message', async (raw) => {
            if (closed) return;

            let msg: any = null;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
            }
            if (!msg) return;
            if (!msg?.type) return;

            if (msg.type === 'cmd') {
                const cmd = String(msg.data ?? '').trim();
                if (!cmd) return;
                await this.serverService.assertServerAccess(req.user?.id ?? null, serverId);

                const ok = await sendCommandToAgent(cmd).catch(() => false);
                if (!ok) safeSend(clientWs, {type: 'error', message: 'Command failed'});
                return;
            }

            if (msg.type === 'ping') {
                safeSend(clientWs, {type: 'pong'});
            }
        });

        // --- Start everything ---
        connectLogs();
        connectStatusStream();

        safeSend(clientWs, {type: 'info', message: '[panel] ws ready'});
    }

}
