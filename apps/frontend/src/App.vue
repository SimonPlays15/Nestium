<script lang="ts" setup>
import {nextTick, ref} from "vue";

const showSystemLogs = ref(false);
const command = ref("");

const SYSTEM_PREFIXES = ["[init]", "[cont-init.d]", "[services.d]"];

const logLines = ref<string[]>([]);
const logContainer = ref<HTMLDivElement | null>(null);

const MAX_LINES = 5000;
let autoScroll = true;

function appendToLog(raw: string) {
  if (!raw) return;

  const lines = raw.replace(/\r/g, "").split("\n");

  for (const line of lines) {
    if (!line) continue;

    const trimmed = line.trim();

    const isSystem = SYSTEM_PREFIXES.some((p) => trimmed.startsWith(p));
    if (isSystem && !showSystemLogs.value) continue;

    logLines.value.push(line);
  }

  if (logLines.value.length > MAX_LINES) {
    logLines.value.splice(0, logLines.value.length - MAX_LINES);
  }

  nextTick(() => {
    if (!autoScroll || !logContainer.value) return;
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  });
}
let wsConsole: WebSocket | undefined;
async function connectToConsole(serverId: string) {
  const r = await fetch(`http://127.0.0.1:3000/servers/${serverId}/ws-token`, { method: "POST" });
  const { token } = await r.json();
  wsConsole = new WebSocket(`ws://localhost:3000/ws/console?serverId=${serverId}&token=${token}`);
}

async function sendCommand(serverId: string, command: string){
  if(!wsConsole) {
    console.log("wsConsole not connected");
    return;
  }

  if(wsConsole.readyState !== 1){
    console.log(`wsConsole not connected, status ${wsConsole.readyState}`);
    await connectToConsole(serverId)
    return;
  }

  if(wsConsole.readyState !== wsConsole.OPEN){
    setTimeout(() => sendCommand(serverId, command), 1000);
    return;
  }

  wsConsole.send(JSON.stringify({ type: "cmd", data: command }))
}

async function connectLogs(serverId: string) {
  // Nutze 127.0.0.1 statt localhost für konsistente lokale Entwicklung
  const r = await fetch(`http://127.0.0.1:3000/servers/${serverId}/ws-token`, { method: "POST" });
  const { token } = await r.json();

  const ws = new WebSocket(`ws://127.0.0.1:3000/ws/logs?serverId=${serverId}&token=${token}`);

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      // Das Panel Gateway schickt msg.type "live"
      if (msg.type === "live" || msg.type === "tail") {
        appendToLog(msg.data);
      }
    } catch (e) {
      // Falls mal roher Text durchkommt (Fallback)
      appendToLog(ev.data);
    }
  };

  ws.onclose = () => {
    setTimeout(() => connectLogs(serverId), 1000)
  };
  ws.onerror = (error) => {
    console.log(error)
    ws.close()
  };
}

function onLogScroll() {
  if (!logContainer.value) return;

  const el = logContainer.value;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

  // Toleranz 50px
  autoScroll = distanceFromBottom < 50;
}

connectLogs("a54ff461-774a-4ee5-975e-d18d9f8998c4")
connectToConsole("a54ff461-774a-4ee5-975e-d18d9f8998c4")
</script>

<template>
  <label class="toggle">
    <input v-model="showSystemLogs" type="checkbox" />
    Systemlogs anzeigen
  </label>

  <div
    ref="logContainer"
    class="log-view"
    @scroll="onLogScroll"
  >
    <pre v-for="(line, i) in logLines" :key="i">{{ line }}</pre>
    <form @submit.prevent="sendCommand('a54ff461-774a-4ee5-975e-d18d9f8998c4', command)">
      <input v-model="command" placeholder="Befehl eingeben" type="text" />
      <button type="submit">Senden</button>
    </form>
  </div>
</template>


<style scoped>
.log-view {
  height: 400px;
  overflow-y: auto;
  background: #0e0e0e;
  color: #dcdcdc;
  font-family: monospace;
  font-size: 13px;
  padding: 8px;
}

.log-view pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

</style>
