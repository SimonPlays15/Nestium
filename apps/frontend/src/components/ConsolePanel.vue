<script lang="ts" setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from "vue";

/**
 * ConsolePanel.vue (Option 1)
 * - Single WS: ws://<panel>/ws/servers?serverId=...&token=...
 * - Token fetch: POST http://<panel>/servers/:id/ws-token
 * - Multiplex messages:
 *    incoming: {type:"logs",data}, {type:"state",value}, {type:"info",message}, {type:"error",message}, {type:"agent",channel,status}
 *    outgoing: {type:"cmd",data}
 */

type ServerState = "unknown" | "starting" | "running" | "stopped" | "crashed";
type AgentStatus = "connected" | "disconnected";

type Incoming =
  | { type: "logs"; data: string }
  | { type: "state"; value: ServerState }
  | { type: "info"; message: string }
  | { type: "error"; message: string }
  | { type: "agent"; channel: "logs" | "console" | "status"; status: AgentStatus }
  | { type: "pong" };

type TermLineKind = "out" | "err" | "info" | "cmd";
type TermLine = { kind: TermLineKind; text: string; ts: number };

const props = defineProps<{
  serverId: string;

  // optional overrides
  panelHttpBase?: string; // default http://127.0.0.1:3000
  panelWsBase?: string;   // default ws://127.0.0.1:3000

  // UX
  maxLines?: number;      // default 3000
}>();

const panelHttpBase = props.panelHttpBase ?? "http://127.0.0.1:3000";
const panelWsBase = props.panelWsBase ?? "ws://127.0.0.1:3000";
const maxLines = props.maxLines ?? 3000;

// terminal state
const lines = ref<TermLine[]>([]);
const autoscroll = ref(true);

function append(kind: TermLineKind, text: string) {
  if (!text) return;
  const parts = text.replace(/\r/g, "").split("\n");
  for (const p of parts) {
    if (p === "") continue;
    lines.value.push({ kind, text: p, ts: Date.now() });
  }
  if (lines.value.length > maxLines) {
    lines.value.splice(0, lines.value.length - maxLines);
  }
}

function clear() {
  lines.value = [];
}

const viewportEl = ref<HTMLDivElement | null>(null);
function scrollToBottom() {
  const el = viewportEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}
async function maybeAutoScroll() {
  if (!autoscroll.value) return;
  await nextTick();
  scrollToBottom();
}
function onScroll() {
  const el = viewportEl.value;
  if (!el) return;
  autoscroll.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
}
const serverStatus = ref<ServerState>("unknown")
async function readStatus(){
    console.log("readStatus");
    const response = await fetch(panelHttpBase+`/servers/${props.serverId}/status`, {
        method: "GET",
    });
    if(!response.ok) throw new Error(`Failed to fetch server status: ${response.status}`);
    const data = await response.json();
    serverStatus.value = data.status;
    console.log(data)
}
readStatus();
setTimeout(() => {
    readStatus()
}, 1000)
// connection state
const ws = ref<WebSocket | null>(null);
const wsConnected = ref(false);
const state = ref<ServerState>("unknown");

const agent = ref<Record<string, AgentStatus>>({
  logs: "disconnected",
  console: "disconnected",
});

const lastError = ref<string | null>(null);

let disposed = false;
let reconnectTimer: any = null;

async function fetchToken(): Promise<string> {
  const r = await fetch(`${panelHttpBase}/servers/${encodeURIComponent(props.serverId)}/ws-token`, {
    method: "POST",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.token) {
    throw new Error(j?.error ?? `Token request failed (${r.status})`);
  }
  return j.token as string;
}

function scheduleReconnect(ms = 800) {
  if (disposed) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, ms);
}

function safeCloseSocket(sock: WebSocket | null) {
  if (!sock) return;
  try {
    if (sock.readyState === WebSocket.CONNECTING) {
      // @ts-ignore
      sock.close();
      return;
    }
    if (sock.readyState === WebSocket.OPEN) sock.close(1000, "close");
  } catch {}
}

function parseIncoming(raw: any): Incoming | null {
  try {
    const obj = JSON.parse(String(raw ?? ""));
    if (obj?.type) return obj as Incoming;
    return null;
  } catch {
    // treat as raw logs
    return { type: "logs", data: String(raw ?? "") };
  }
}

async function connect() {
  if (disposed) return;

  // close previous
  safeCloseSocket(ws.value);
  ws.value = null;

  wsConnected.value = false;
  lastError.value = null;

  let token: string;
  try {
    token = await fetchToken();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    lastError.value = msg;
    append("err", `ERROR: token: ${msg}`);
    void maybeAutoScroll();
    scheduleReconnect(1200);
    return;
  }

  const url = `${panelWsBase}/ws/servers?serverId=${encodeURIComponent(props.serverId)}&token=${encodeURIComponent(
    token
  )}`;

  const sock = new WebSocket(url);
  ws.value = sock;

  sock.onopen = () => {
    wsConnected.value = true;
    void maybeAutoScroll();
  };

  sock.onmessage = (ev) => {
    const msg = parseIncoming(ev.data);
    if (!msg) return;

    if (msg.type === "logs") {
      append("out", msg.data);
    } else if (msg.type === "state") {
      state.value = msg.value;
    } else if (msg.type === "info") {
      append("info", msg.message);
    } else if (msg.type === "error") {
      append("err", msg.message);
    } else if (msg.type === "agent") {
      agent.value[msg.channel] = msg.status;
      append("info", `[agent] ${msg.channel}: ${msg.status}`);
    }

    void maybeAutoScroll();
  };

  sock.onclose = () => {
    wsConnected.value = false;
    agent.value.logs = "disconnected";
    agent.value.console = "disconnected";
    void maybeAutoScroll();
    scheduleReconnect(700);
  };

  sock.onerror = () => {
    try {
      sock.close();
    } catch {}
  };
}

// command input UX
const input = ref("");
const inputEl = ref<HTMLInputElement | null>(null);

const history = ref<string[]>([]);
const historyIdx = ref<number>(-1);
const lastTyped = ref<string>("");

const canSend = computed(() => {
  // allow sending if console channel is connected; optionally require running/starting
  const consoleReady = agent.value.console === "connected";
  const stateOk = state.value === "running" || state.value === "starting";
  return wsConnected.value && consoleReady && stateOk;
});

function sendCmd(cmd: string) {
  const sock = ws.value;
  if (!sock || sock.readyState !== WebSocket.OPEN) {
    append("err", "ERROR: WS not connected");
    return;
  }
  try {
    sock.send(JSON.stringify({ type: "cmd", data: cmd }));
  } catch {
    append("err", "ERROR: failed to send cmd");
  }
}

function submit() {
  const cmd = input.value.trim();
  if (!cmd) return;

  append("cmd", `> ${cmd}`);
  void maybeAutoScroll();

  if (history.value[history.value.length - 1] !== cmd) history.value.push(cmd);
  historyIdx.value = -1;
  lastTyped.value = "";

  sendCmd(cmd);
  input.value = "";
  inputEl.value?.focus();
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (canSend.value) submit();
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (history.value.length === 0) return;

    if (historyIdx.value === -1) {
      lastTyped.value = input.value;
      historyIdx.value = history.value.length - 1;
    } else {
      historyIdx.value = Math.max(0, historyIdx.value - 1);
    }
    input.value = history.value[historyIdx.value] ?? input.value;
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (history.value.length === 0) return;
    if (historyIdx.value === -1) return;

    if (historyIdx.value >= history.value.length - 1) {
      historyIdx.value = -1;
      input.value = lastTyped.value;
      return;
    }

    historyIdx.value = Math.min(history.value.length - 1, historyIdx.value + 1);
    input.value = history.value[historyIdx.value] ?? input.value;
  }
}

function badgeText() {
  if (state.value === "running") return "RUNNING";
  if (state.value === "starting") return "STARTING";
  if (state.value === "stopped") return "STOPPED";
  if (state.value === "crashed") return "CRASHED";
  return "UNKNOWN";
}

function connText() {
  const a = agent.value;
  return `ws:${wsConnected.value ? "on" : "off"} · logs:${a.logs} · console:${a.console} | Server: ${serverStatus.value}`;
}

onMounted(() => {
  connect();
  // focus
  setTimeout(() => inputEl.value?.focus(), 50);
});

onBeforeUnmount(() => {
  disposed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  safeCloseSocket(ws.value);
  ws.value = null;
});
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height: 100%;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <strong>Console</strong>

        <span style="font-size:12px; padding:2px 8px; border:1px solid #ccc; border-radius:999px;">
          {{ badgeText() }}
        </span>

        <span style="font-size:12px; opacity:0.7;">
          {{ connText() }}
        </span>
      </div>

      <div style="display:flex; align-items:center; gap:10px;">
        <label style="font-size:12px; display:flex; gap:6px; align-items:center; max-height:512px;">
          <input v-model="autoscroll" type="checkbox" />
          autoscroll
        </label>
        <button style="font-size:12px;" @click="clear">clear</button>
      </div>
    </div>

    <div
      ref="viewportEl"
      style="flex:1; overflow:auto; border:1px solid #ddd; border-radius:8px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; line-height:1.4;"
      @scroll="onScroll"
    >
      <div v-for="(l, idx) in lines" :key="idx" style="white-space:pre-wrap;">
        <span v-if="l.kind==='cmd'" style="opacity:0.85;">{{ l.text }}</span>
        <span v-else-if="l.kind==='err'" style="font-weight:600;">{{ l.text }}</span>
        <span v-else-if="l.kind==='info'" style="opacity:0.8;">{{ l.text }}</span>
        <span v-else>{{ l.text }}</span>
      </div>
    </div>

    <div style="display:flex; gap:10px;">
      <input
        ref="inputEl"
        v-model="input"
        :disabled="!canSend"
        placeholder="type a command and press Enter"
        style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px;"
        @keydown="onInputKeydown"
      />
      <button
        :disabled="!canSend || !input.trim()"
        style="padding:10px 14px; border:1px solid #ddd; border-radius:8px;"
        @click="submit"
      >
        Send
      </button>
    </div>

    <div v-if="lastError" style="font-size:12px; opacity:0.8;">
      last error: {{ lastError }}
    </div>
  </div>
</template>
