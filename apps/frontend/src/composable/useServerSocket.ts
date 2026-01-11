import {ref} from "vue";

type ServerState = "unknown" | "starting" | "running" | "stopped" | "crashed";

type Incoming =
  | { type: "logs"; data: string }
  | { type: "state"; value: ServerState }
  | { type: "info"; message: string }
  | { type: "error"; message: string }
  | { type: "agent"; channel: string; status: "connected" | "disconnected" }
  | { type: "pong" };

export function useServerSocket(opts: {
  serverId: string;
  httpBase?: string; // default http://127.0.0.1:3000
  wsBase?: string;   // default ws://127.0.0.1:3000
}) {
  const httpBase = opts.httpBase ?? "http://127.0.0.1:3000";
  const wsBase = opts.wsBase ?? "ws://127.0.0.1:3000";

  const ws = ref<WebSocket | null>(null);
  const connected = ref(false);
  const state = ref<ServerState>("unknown");

  const lastError = ref<string | null>(null);

  let closed = false;
  let reconnectTimer: any = null;

  const listeners = new Set<(msg: Incoming) => void>();

  function onMessage(cb: (msg: Incoming) => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function emit(msg: Incoming) {
    for (const cb of listeners) cb(msg);
  }

  async function fetchToken(): Promise<string> {
    const r = await fetch(`${httpBase}/servers/${opts.serverId}/ws-token`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.token) throw new Error(j?.error ?? `Token request failed (${r.status})`);
    return j.token as string;
  }

  function scheduleReconnect(ms = 800) {
    if (closed) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, ms);
  }

  async function connect() {
    if (closed) return;

    // close old
    try { ws.value?.close(); } catch {}
    ws.value = null;

    connected.value = false;

    let token: string;
    try {
      token = await fetchToken();
    } catch (e: any) {
      lastError.value = String(e?.message ?? e);
      emit({ type: "error", message: `token: ${lastError.value}` });
      scheduleReconnect(1200);
      return;
    }

    const url = `${wsBase}/ws/servers?serverId=${encodeURIComponent(opts.serverId)}&token=${encodeURIComponent(token)}`;
    const sock = new WebSocket(url);
    ws.value = sock;

    sock.onopen = () => {
      connected.value = true;
      lastError.value = null;
      emit({ type: "info", message: "[ws] connected" });
    };

    sock.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data ?? ""));
      } catch {
        // fallback: treat as log text
        emit({ type: "logs", data: String(ev.data ?? "") });
        return;
      }

      if (msg?.type === "state") state.value = msg.value;
      emit(msg as Incoming);
    };

    sock.onclose = () => {
      connected.value = false;
      emit({ type: "info", message: "[ws] disconnected (reconnecting...)" });
      scheduleReconnect(700);
    };

    sock.onerror = () => {
      try { sock.close(); } catch {}
    };
  }

  function sendCmd(cmd: string) {
    const sock = ws.value;
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      emit({ type: "error", message: "WS not connected" });
      return false;
    }
    try {
      sock.send(JSON.stringify({ type: "cmd", data: cmd }));
      return true;
    } catch {
      emit({ type: "error", message: "Failed to send cmd" });
      return false;
    }
  }

  function dispose() {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try { ws.value?.close(); } catch {}
    ws.value = null;
  }

  return { connect, dispose, onMessage, sendCmd, connected, state, lastError };
}
