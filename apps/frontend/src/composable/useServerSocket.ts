import { type Ref, ref, type UnwrapRef } from 'vue'

/**
 * Represents the possible states of a server.
 *
 * The `ServerState` type is a union of string literals that indicate various
 * operational states a server can be in. These states can help monitor and
 * manage server behavior in an application.
 *
 * Possible values:
 * - `'unknown'`: The server's state is not determined or initialized.
 * - `'starting'`: The server is in the process of starting up.
 * - `'running'`: The server is operational and actively running.
 * - `'stopped'`: The server has been intentionally stopped and is not running.
 * - `'crashed'`: The server has encountered an error and stopped unexpectedly.
 */
type ServerState = 'unknown' | 'starting' | 'running' | 'stopped' | 'crashed'

/**
 * Represents the structure of incoming messages that can be processed in the system.
 * This type is a union of multiple possible message types, each with its own specific properties.
 *
 * The incoming message types include:
 * - Logs: Contains a log entry as a string.
 * - State: Represents the server state with an associated value.
 * - Info: Conveys informational messages.
 * - Error: Conveys error-related messages.
 * - Agent: Describes the status of an agent and its associated communication channel.
 * - Pong: Represents a pong response, typically used for keep-alive or health-check mechanisms.
 */
type Incoming =
  | { type: 'logs'; data: string }
  | { type: 'state'; value: ServerState }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'agent'; channel: string; status: 'connected' | 'disconnected' }
  | { type: 'pong' }

/**
 * Establishes and manages a communication socket with a server, supporting connection, message handling, and state tracking.
 * Provides methods to connect, dispose, register message handlers, and send commands to the server.
 *
 * @param {Object} opts - Configuration options for initializing the server socket.
 * @param {string} opts.serverId - Unique identifier for the server to connect to.
 * @param {string} [opts.httpBase] - The HTTP base URL for token retrieval. Defaults to `http://127.0.0.1:3000`.
 * @param {string} [opts.wsBase] - The WebSocket base URL for establishing the connection. Defaults to `ws://127.0.0.1:3000`.
 * @return {Object} An object with methods and state for interacting with the server socket.
 * @return {Function} return.connect - Initiates the connection to the server socket. Returns a Promise that resolves when the connection attempt completes.
 * @return {Function} return.dispose - Closes the socket connection and releases any resources.
 * @return {Function} return.onMessage - Registers a callback for incoming messages. Returns a cleanup function to unregister the listener.
 * @return {Function} return.sendCmd - Sends a command to the server over the WebSocket. Returns a boolean indicating success.
 * @return {Ref<boolean>} return.connected - Reactive reference indicating whether the WebSocket is connected.
 * @return {Ref<ServerState>} return.state - Reactive reference holding the current server state.
 * @return {Ref<string|null>} return.lastError - Reactive reference holding the last error message, or `null` if no errors occurred.
 */
export function useServerSocket(opts: {
  serverId: string
  httpBase?: string // default http://127.0.0.1:3000
  wsBase?: string // default ws://127.0.0.1:3000
}): {
  connect: () => Promise<void>
  dispose: () => void
  onMessage: (cb: (msg: Incoming) => void) => () => boolean
  sendCmd: (cmd: string) => boolean
  connected: Ref<UnwrapRef<boolean>, UnwrapRef<boolean> | boolean>
  state: Ref<UnwrapRef<ServerState>, UnwrapRef<ServerState> | ServerState>
  lastError: Ref<UnwrapRef<string | null>, UnwrapRef<string | null> | string | null>
} {
  const httpBase = opts.httpBase ?? 'http://127.0.0.1:3000'
  const wsBase = opts.wsBase ?? 'ws://127.0.0.1:3000'

  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const state = ref<ServerState>('unknown')

  const lastError = ref<string | null>(null)

  let closed = false
  let reconnectTimer: any = null

  const listeners = new Set<(msg: Incoming) => void>()

  function onMessage(cb: (msg: Incoming) => void) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  function emit(msg: Incoming) {
    for (const cb of listeners) cb(msg)
  }

  async function fetchToken(): Promise<string> {
    const r = await fetch(`${httpBase}/servers/${opts.serverId}/ws-token`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j?.token) throw new Error(j?.error ?? `Token request failed (${r.status})`)
    return j.token as string
  }

  function scheduleReconnect(ms = 800) {
    if (closed) return
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, ms)
  }

  async function connect() {
    if (closed) return

    // close old
    try {
      ws.value?.close()
    } catch {}
    ws.value = null

    connected.value = false

    let token: string
    try {
      token = await fetchToken()
    } catch (e: any) {
      lastError.value = String(e?.message ?? e)
      emit({ type: 'error', message: `token: ${lastError.value}` })
      scheduleReconnect(1200)
      return
    }

    const url = `${wsBase}/ws/servers?serverId=${encodeURIComponent(opts.serverId)}&token=${encodeURIComponent(token)}`
    const sock = new WebSocket(url)
    ws.value = sock

    sock.onopen = () => {
      connected.value = true
      lastError.value = null
      emit({ type: 'info', message: '[ws] connected' })
    }

    sock.onmessage = ev => {
      let msg: any
      try {
        msg = JSON.parse(String(ev.data ?? ''))
      } catch {
        // fallback: treat as log text
        emit({ type: 'logs', data: String(ev.data ?? '') })
        return
      }

      if (msg?.type === 'state') state.value = msg.value
      emit(msg as Incoming)
    }

    sock.onclose = () => {
      connected.value = false
      emit({ type: 'info', message: '[ws] disconnected (reconnecting...)' })
      scheduleReconnect(700)
    }

    sock.onerror = () => {
      try {
        sock.close()
      } catch {}
    }
  }

  function sendCmd(cmd: string) {
    const sock = ws.value
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      emit({ type: 'error', message: 'WS not connected' })
      return false
    }
    try {
      sock.send(JSON.stringify({ type: 'cmd', data: cmd }))
      return true
    } catch {
      emit({ type: 'error', message: 'Failed to send cmd' })
      return false
    }
  }

  function dispose() {
    closed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    try {
      ws.value?.close()
    } catch {}
    ws.value = null
  }

  return { connect, dispose, onMessage, sendCmd, connected, state, lastError }
}
