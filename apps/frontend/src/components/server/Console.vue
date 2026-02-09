<script lang="ts" setup>
import {computed, onBeforeUnmount, onMounted, type Ref, ref} from 'vue'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * A variable to hold an instance of the ResizeObserver or `null`.
 *
 * ResizeObserver is used to observe changes to the dimensions or size of an element.
 * It can be set to an active ResizeObserver instance or remain `null` if not initialized.
 */
let ro: ResizeObserver | null = null


/**
 * Represents the possible states of a server during its lifecycle.
 *
 * The ServerState type is a union of specific string literals that denote
 * the current operational status of a server. It provides type safety
 * and ensures that only valid states can be assigned or compared.
 *
 * Possible values:
 * - 'unknown': The server state is not determined or cannot be identified.
 * - 'starting': The server is in the process of starting up.
 * - 'running': The server is operational and actively running.
 * - 'stopped': The server is not running, but it has been intentionally stopped.
 * - 'crashed': The server has become non-functional due to an error or failure.
 */
type ServerState = 'unknown' | 'starting' | 'running' | 'stopped' | 'crashed'
/**
 * Represents the connectivity status of an agent.
 *
 * This type is used to identify whether an agent is currently connected or disconnected.
 *
 * Possible values:
 * - 'connected': Indicates the agent is actively connected.
 * - 'disconnected': Indicates the agent is not connected.
 */
type AgentStatus = 'connected' | 'disconnected'

/**
 * Represents a union type for incoming messages in a system with various possible structures.
 * Each variant of the type represents a specific kind of message or data packet the system can handle.
 */
type Incoming =
  | { type: 'logs'; data: string }
  | { type: 'state'; value: ServerState }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'agent'; channel: 'logs' | 'console' | 'status'; status: AgentStatus }
  | { type: 'pong' }

const props = defineProps<{
  serverId: string
  panelHttpBase?: string // default http://127.0.0.1:3000
  panelWsBase?: string // default ws://127.0.0.1:3000
  maxLines?: number // not used with xterm, kept for compat
}>()

/**
 * Base URL for the panel's HTTP requests.
 *
 * This variable defines the base address used when making HTTP calls
 * to the panel's backend. If the `panelHttpBase` property is provided
 * in the `props` object, its value will be used as the base URL.
 * Otherwise, it defaults to 'http://127.0.0.1:3000'.
 */
const panelHttpBase: string = props.panelHttpBase ?? 'http://127.0.0.1:3000'
/**
 * The base WebSocket URL for the panel server. This URL is used to establish a
 * WebSocket connection with the panel's backend service. Defaults to
 * 'ws://127.0.0.1:3000' if not provided in the `props` object.
 *
 * @type {string}
 */
const panelWsBase: string = props.panelWsBase ?? 'ws://127.0.0.1:3000'

// ---- UI State ----
/**
 * A reactive reference that determines whether auto-scrolling is enabled or disabled.
 *
 * When set to `true`, auto-scrolling functionality is active.
 * When set to `false`, auto-scrolling is disabled.
 *
 * Typically used in scenarios where automated scrolling behavior is needed,
 * such as maintaining visibility of the most recent content in a dynamic list
 * or chat application.
 */
const autoscroll: Ref<boolean> = ref(true)
/**
 * Represents the current status of the server.
 *
 * This variable holds a reactive reference to the state of the server,
 * which can dynamically change over time. The initial value is set to 'unknown'.
 *
 * Possible values for the server state may include (but are not limited to):
 * - 'unknown': The server state is not yet determined.
 * - 'online': The server is operational and accessible.
 * - 'offline': The server is not accessible or unavailable.
 * - 'maintenance': The server is undergoing scheduled maintenance.
 *
 * The variable is designed to be used in contexts where real-time reactivity
 * or state tracking is essential.
 */
const serverStatus = ref<ServerState>('unknown')
/**
 * A reactive reference representing the connection status of a WebSocket.
 *
 * The `wsConnected` variable holds a boolean value indicating whether the WebSocket connection
 * is currently established (true) or not (false). This value can be used to manage or react
 * to the connection state within a reactive framework or component.
 */
const wsConnected: Ref<boolean> = ref(false)
/**
 * Represents the state of a server, maintained within a reactive reference.
 *
 * The state is initialized to 'unknown' and is intended to track
 * the current status of the server during its lifecycle. Possible values
 * could include server statuses such as 'starting', 'running', 'stopping',
 * 'stopped', or any other applicable states depending on the system's design.
 *
 * This variable is designed to be used in a reactive context, enabling automatic
 * updates to any watchers or consumers when the state changes.
 *
 * @type {Ref<ServerState>}
 */
const state: Ref<ServerState> = ref<ServerState>('unknown')

/**
 * Represents a mapping of agent components to their connection statuses.
 *
 * The `agent` object is used to track the connection status of various agent components
 * such as logs, console, and overall status. Each key in the record corresponds to a
 * specific agent component, and the value represents its current connection status.
 *
 * Possible values for each component's connection status:
 * - `'disconnected'`: The component is currently not connected.
 */
const agent = ref<Record<string, AgentStatus>>({
  logs: 'disconnected',
  console: 'disconnected',
  status: 'disconnected',
})

/**
 * A reactive reference that holds information about the most recent error.
 *
 * The value can either be a string containing the error message or `null` if there is no error.
 * This variable is typically used to track error states in an application and update the UI accordingly.
 */
const lastError = ref<string | null>(null)

/**
 * Fetches the current status of the server and updates the serverStatus variable.
 *
 * This method sends a GET request to retrieve the server's status and processes the response.
 * It throws an error if the request fails.
 *
 * @return {Promise<void>} A promise that resolves once the server status has been successfully fetched and updated.
 */
async function readStatus(): Promise<void> {
  const response = await fetch(panelHttpBase + `/servers/${props.serverId}/status`, {method: 'GET'})
  if (!response.ok) throw new Error(`Failed to fetch server status: ${response.status}`)
  const data = await response.json()
  serverStatus.value = data.status
}

// ---- WebSocket ----
/**
 * A reactive reference that holds a WebSocket instance or null.
 *
 * This variable is used to manage the state of a WebSocket connection.
 * It is initialized as null and can be updated with a WebSocket instance
 * when a connection is established or reset to null when the connection
 * is closed.
 *
 * @type {Ref<WebSocket | null>}
 */
const ws: Ref<(WebSocket | null)> = ref<WebSocket | null>(null)
/**
 * A boolean variable indicating whether a certain resource or object has been disposed of.
 *
 * - `true`: The resource or object has been disposed of and is no longer in use.
 * - `false`: The resource or object is still active and has not been disposed of.
 */
let disposed = false
/**
 * A variable used to manage and track the reconnection timer.
 *
 * This variable can store a value representing the timer instance
 * or its associated identifier, which might be used to control
 * delayed reconnection attempts (e.g., clearing or resetting the timer).
 *
 * Initially set to null, it is assigned a value when a reconnection
 * process is initiated.
 *
 * @type {any}
 */
let reconnectTimer: any = null

/**
 * Fetches a WebSocket token from the server for connecting to a specific resource.
 *
 * This method sends a POST request to the server to retrieve an authorized token
 * for establishing a WebSocket connection. If the request fails or the token is
 * not present in the response, an error is thrown.
 *
 * @return {Promise<string>} A promise that resolves to the WebSocket token as a string.
 * @throws {Error} If the request fails or the token is not available in the response.
 */
async function fetchToken(): Promise<string> {
  const r = await fetch(`${panelHttpBase}/servers/${encodeURIComponent(props.serverId)}/ws-token`, {
    method: 'POST',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.token) throw new Error(j?.error ?? `Token request failed (${r.status})`)
  return j.token as string
}

/**
 * Schedules a reconnection attempt after a specified delay. If a reconnect
 * attempt is already scheduled or the system is disposed, this method will
 * exit without scheduling a new attempt.
 *
 * @param {number} ms - The delay in milliseconds before the reconnect attempt is made. Defaults to 800 ms if not specified.
 * @return {void}
 */
function scheduleReconnect(ms: number = 800): void {
  if (disposed) return
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, ms)
}

/**
 * Safely closes a WebSocket connection if it exists and is not already closed.
 *
 * @param {WebSocket | null} sock - The WebSocket instance to close. If null, no action is taken.
 * @return {void} Does not return any value.
 */
function safeCloseSocket(sock: WebSocket | null): void {
  if (!sock) return
  try {
    if (sock.readyState === WebSocket.CONNECTING) {
      sock.close()
      return
    }
    if (sock.readyState === WebSocket.OPEN) sock.close(1000, 'close')
  } catch {
  }
}

/**
 * Parses the incoming raw data and attempts to convert it into an `Incoming` object.
 *
 * @param {any} raw - The raw input data to be parsed.
 * @return {Incoming | null} Returns an `Incoming` object if the raw data contains a `type` property,
 *                           a log-like object if an error occurs during parsing, or null otherwise.
 */
function parseIncoming(raw: any): Incoming | null {
  try {
    const obj = JSON.parse(String(raw ?? ''))
    if (obj?.type) return obj as Incoming
    return null
  } catch {
    return {type: 'logs', data: String(raw ?? '')}
  }
}

/**
 * Sends a command via a WebSocket connection if the connection is open and ready.
 *
 * @param {string} cmd - The command to be sent. This will be serialized into a JSON object with a type of 'cmd' and sent through the WebSocket.
 * @return {void} This method does not return a value.
 */
function sendCmd(cmd: string): void {
  const sock = ws.value
  if (!sock || sock.readyState !== WebSocket.OPEN) {
    termWriteln('\u001b[31mERROR: WS not connected\u001b[0m')
    prompt()
    return
  }
  try {
    sock.send(JSON.stringify({type: 'cmd', data: cmd}))
  } catch {
    termWriteln('\u001b[31mERROR: failed to send cmd\u001b[0m')
    prompt()
  }
}

/**
 * A computed property that determines if sending data is permitted.
 *
 * The value of `canSend` is derived from the following conditions:
 * - `wsConnected`: Indicates whether the WebSocket is connected.
 * - `agent.console`: Must be in the 'connected' state.
 * - `state`: Must be either 'running' or 'starting'.
 *
 * Returns `true` only if all the above conditions are met.
 */
const canSend = computed(() => {
  const consoleReady = agent.value.console === 'connected'
  const stateOk = state.value === 'running' || state.value === 'starting'
  return wsConnected.value && consoleReady && stateOk
})

/**
 * Establishes a WebSocket connection to the server, initializes necessary properties,
 * and handles messages, errors, and reconnection logic.
 *
 * This method manages the connection lifecycle by:
 * - Fetching an authentication token.
 * - Opening a WebSocket connection to the specified server URL.
 * - Handling incoming WebSocket messages to process logs, state, agent updates, or errors.
 * - Managing connection status and reconnection on unexpected disconnection.
 *
 * @return {Promise<void>} A promise that resolves when the connection logic is complete,
 * or rejects if an error occurs during the connection or token retrieval process.
 */
async function connect(): Promise<void> {
  if (disposed) return

  safeCloseSocket(ws.value)
  ws.value = null
  wsConnected.value = false

  // reset channels
  agent.value.logs = 'disconnected'
  agent.value.console = 'disconnected'
  agent.value.status = 'disconnected'

  let token: string
  try {
    token = await fetchToken()
    lastError.value = null
  } catch {
    lastError.value = 'We are having some trouble to connect to the API.'
    scheduleReconnect(3000)
    return
  }

  const url = `${panelWsBase}/ws/servers?serverId=${encodeURIComponent(props.serverId)}&token=${encodeURIComponent(token)}`
  const sock = new WebSocket(url)
  ws.value = sock

  sock.onopen = () => {
    wsConnected.value = true
    termWriteln('\u001b[90m[ws] connected\u001b[0m')
    redrawInputLine()
  }

  sock.onmessage = (ev) => {
    const msg = parseIncoming(ev.data)
    if (!msg) return

    if (msg.type === 'logs') {
      termWrite(msg.data)
    } else if (msg.type === 'state') {
      state.value = msg.value
    } else if (msg.type === 'info') {
      termWriteln(`\u001b[90m${msg.message}\u001b[0m`)
    } else if (msg.type === 'error') {
      termWriteln(`\u001b[31m${msg.message}\u001b[0m`)
    } else if (msg.type === 'agent') {
      agent.value[msg.channel] = msg.status
      termWriteln(`\u001b[90m[agent] ${msg.channel}: ${msg.status}\u001b[0m`)
    }

    if (autoscroll.value) {
      // keep the input prompt visible and "at the end"
      redrawInputLine()
    }
  }

  sock.onclose = () => {
    wsConnected.value = false
    agent.value.logs = 'disconnected'
    agent.value.console = 'disconnected'
    agent.value.status = 'disconnected'

    termWriteln('\u001b[90m[ws] disconnected (reconnecting...)\u001b[0m')
    redrawInputLine()
    scheduleReconnect(700)
  }

  sock.onerror = () => {
    try {
      sock.close()
    } catch {
    }
  }
}

// ---- Xterm ----
/**
 * A reactive reference to an HTMLDivElement or null, typically used for managing
 * and interacting with a DOM element in a reactive framework like Vue.js.
 *
 * The value is initially null and can be dynamically updated to reference a specific
 * HTMLDivElement at runtime.
 *
 * Useful in scenarios where direct access to a DOM element is required, such as
 * manipulating its attributes, styles, or listening to events.
 */
const termEl = ref<HTMLDivElement | null>(null)
/**
 * Represents a terminal instance that can either hold a Terminal object
 * or be null when no terminal is initialized.
 *
 * This variable is typically used to manage the state of a terminal connection
 * within an application, where a null value indicates that no active terminal is present.
 */
let term: Terminal | null = null
/**
 * Represents the instance of the FitAddon used to enable or manage
 * the fit functionality of a terminal in a project. It can be used
 * to dynamically resize the terminal display to fit its container.
 *
 * This variable is initialized to `null` by default and can later
 * be assigned an instance of `FitAddon` as needed.
 *
 * @type {FitAddon | null}
 */
let fit: FitAddon | null = null

/**
 * Writes the provided text to the terminal, replacing carriage return characters.
 *
 * @param {string} text - The text to write to the terminal. If null or undefined, an empty string is used.
 * @return {void} Does not return a value.
 */
function termWrite(text: string): void {
  if (!term) return
  term.write(String(text ?? '').replace(/\r/g, ''))
}

/**
 * Writes the specified text to the terminal and appends a newline at the end.
 *
 * @param {string} text - The text to be written to the terminal.
 * @return {void} This method does not return a value.
 */
function termWriteln(text: string): void {
  termWrite(text)
}

/**
 * Displays a prompt symbol (">") in the terminal with specific formatting.
 *
 * This method uses escape sequences to apply styling to the prompt and
 * appends a newline before showing it. It is typically utilized in
 * command-line interfaces to signify user input readiness.
 *
 * @return {void} Does not return a value.
 */
function prompt(): void {
  termWrite('\r\n\u001b[90m>\u001b[0m ')
}

/**
 * Updates the input line by clearing the current line and redrawing the prompt with the provided text.
 *
 * @param {string} text - The text to be set as the input line content.
 * @return {void} No return value.
 */
function setInputLine(text: string): void {
  // clear line and redraw prompt + input
  termWrite('\r\u001b[2K\u001b[90m>\u001b[0m ' + text)
}

// input editing inside terminal
/**
 * A variable used to store the current line of text being processed.
 * Typically updated dynamically as input or processing progresses.
 * Can be an empty string when no current line is available or applicable.
 *
 * @type {string}
 */
let currentLine: string = ''
/**
 * Represents the history of actions or events.
 *
 * This variable is an array of strings used to store a sequence of events,
 * actions, or recorded data in the order they occurred. It can be modified
 * to append or manage entries as needed.
 */
const history: string[] = []
/**
 * Represents the index of the current position in the history stack.
 *
 * This variable is typically used to track the position of the user's interaction
 * within a history array, such as for undo/redo operations. A value of -1 indicates
 * that no history navigation has occurred, or the history is at its initial state.
 *
 * Possible values:
 * - Negative values (e.g., -1) typically signify an uninitialized or default state.
 * - Non-negative values indicate valid positions within the history stack.
 */
let historyIdx = -1
/**
 * A variable that stores the most recent value input or typed by a user.
 * It is initialized as an empty string and is typically updated when
 * user input events occur.
 */
let lastTyped = ''

/**
 * Re-renders the input line on the terminal, ensuring that the current prompt and line content are displayed correctly.
 * This method also ensures the terminal view scrolls to the bottom if autoscroll is enabled.
 *
 * @return {void} Does not return a value.
 */
function redrawInputLine(): void {
  // redraw prompt + currentLine (helps when logs arrive)
  setInputLine(currentLine)
  // scroll down if enabled
  if (autoscroll.value) {
    try {
      term?.scrollToBottom()
    } catch {
    }
  }
}

/**
 * Processes the current line of input, adds it to the command history if valid,
 * and attempts to execute the command. Handles terminal feedback and manages the
 * input prompt state accordingly.
 *
 * @return {void} No return value.
 */
function commitLine(): void {
  const cmd = currentLine.trim()
  termWrite('\n')

  if (cmd) {
    if (history[history.length - 1] !== cmd) history.push(cmd)
  }
  historyIdx = -1
  lastTyped = ''
  currentLine = ''

  if (cmd) {
    if (canSend.value) sendCmd(cmd)
    else termWriteln('\u001b[33m[warn]\u001b[0m console not ready (offline / stopped)')
  }

  prompt()
  redrawInputLine()
}

/**
 * Handles input data for the terminal, including processing of special characters
 * such as Enter, Backspace, and navigation through input history.
 *
 * @param {string} data - The input data received from the terminal, which may include
 * printable characters, control sequences, and special keys.
 * @return {void} This method does not return a value.
 */
function onTermData(data: string): void {
  // Enter
  if (data === '\r') {
    commitLine()
    return
  }

  // Backspace
  if (data === '\u007F') {
    if (currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1)
      setInputLine(currentLine)
    }
    return
  }

  // Arrow up/down (history)
  if (data === '\u001b[A') {
    if (history.length === 0) return
    if (historyIdx === -1) {
      lastTyped = currentLine
      historyIdx = history.length - 1
    } else {
      historyIdx = Math.max(0, historyIdx - 1)
    }
    currentLine = history[historyIdx] ?? ''
    setInputLine(currentLine)
    return
  }

  if (data === '\u001b[B') {
    if (history.length === 0) return
    if (historyIdx === -1) return

    if (historyIdx >= history.length - 1) {
      historyIdx = -1
      currentLine = lastTyped
      setInputLine(currentLine)
      return
    }

    historyIdx = Math.min(history.length - 1, historyIdx + 1)
    currentLine = history[historyIdx] ?? ''
    setInputLine(currentLine)
    return
  }

  // ignore other escape sequences
  if (data.startsWith('\u001b')) return

  // normal printable (also paste)
  currentLine += data
  termWrite(data)
}

/**
 * Clears the terminal screen and resets it to display the default header message.
 * Executes the necessary steps to redraw the input line for further user interaction.
 *
 * @return {void} No return value.
 */
function clearTerminal(): void {
  try {
    term?.clear()
  } catch {
  }
  termWriteln('\u001b[90mNestium Console\u001b[0m')
  prompt()
  redrawInputLine()
}

/**
 * Generates a text label representing the current state of the system based on the value of `state.value`.
 *
 * The returned text corresponds to the following states:
 * - 'running': returns 'RUNNING'
 * - 'starting': returns 'STARTING'
 * - 'stopped': returns 'STOPPED'
 * - 'crashed': returns 'CRASHED'
 * - Any other state: returns 'UNKNOWN'
 *
 * @return {string} The text label representing the current state.
 */
function badgeText(): string {
  if (state.value === 'running') return 'RUNNING'
  if (state.value === 'starting') return 'STARTING'
  if (state.value === 'stopped') return 'STOPPED'
  if (state.value === 'crashed') return 'CRASHED'
  return 'UNKNOWN'
}

/**
 * Constructs a connection status text string that reflects the current WebSocket connection state,
 * logs status, console status, agent status, and server status.
 *
 * @return {string} A formatted string describing the WebSocket connection status and other relevant information.
 */
function connText(): string {
  const a = agent.value
  return `ws:${wsConnected.value ? 'on' : 'off'} · logs:${a.logs} · console:${a.console} · status:${a.status} | Server: ${serverStatus.value}`
}

onMounted(async () => {
  // init terminal
  term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    scrollback: 5000,
    fontSize: 12,
  })
  fit = new FitAddon()
  term.loadAddon(fit)

  term.open(termEl.value!)
  if (termEl.value) {
    ro = new ResizeObserver(() => {
      requestAnimationFrame(() => fit?.fit())
    })
    ro.observe(termEl.value)
  }
  fit.fit()

  term.onData(onTermData)

  termWriteln('\u001b[90mNestium Console\u001b[0m')
  prompt()
  redrawInputLine()

  // optional: status poll (keeping your logic)
  try {
    await readStatus()
  } catch {
  }
  setTimeout(() => {
    void readStatus()
  }, 1000)

  // connect WS
  void connect()

  // resize
  const onResize = () => fit?.fit()
  window.addEventListener('resize', onResize)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
  })
})

onBeforeUnmount(() => {
  disposed = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  safeCloseSocket(ws.value)
  ws.value = null

  try {
    ro?.disconnect()
  } catch {
  }
  ro = null;
  try {
    term?.dispose()
  } catch {
  }
  term = null
  fit = null
})
</script>

<template>
  <div class="console-container">
    <!-- Error Alert -->
    <div v-if="lastError" class="error-alert">
      <div class="error-content">
        <i class="pi pi-exclamation-triangle"></i>
        <div>
          <strong>Connection Error</strong>
          <p>{{ lastError }}</p>
        </div>
      </div>
      <button class="error-close" @click="lastError = null">
        <i class="pi pi-times"></i>
      </button>
    </div>

    <!-- Console Panel -->
    <div class="console-panel">
      <!-- Header -->
      <div class="console-header">
        <div class="header-left">
          <div class="header-title">
            <i class="pi pi-terminal"></i>
            <h2>Server Console</h2>
          </div>
          
          <!-- Status Badge -->
          <div class="status-badge" :class="`status-${state}`">
            <span class="status-indicator"></span>
            <span class="status-text">{{ badgeText() }}</span>
          </div>
        </div>

        <div class="header-right">
          <!-- Connection Info -->
          <div class="connection-info">
            <div class="info-item" :class="{ connected: wsConnected }">
              <i class="pi pi-circle-fill"></i>
              <span>WebSocket</span>
            </div>
            <div class="info-item" :class="{ connected: agent.console === 'connected' }">
              <i class="pi pi-circle-fill"></i>
              <span>Console</span>
            </div>
            <div class="info-item" :class="{ connected: agent.logs === 'connected' }">
              <i class="pi pi-circle-fill"></i>
              <span>Logs</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Terminal Container -->
      <div class="terminal-wrapper">
        <div ref="termEl" class="terminal-container"></div>
      </div>

      <!-- Footer Controls -->
      <div class="console-footer">
        <div class="footer-left">
          <label class="checkbox-control">
            <input v-model="autoscroll" type="checkbox" />
            <i :class="autoscroll ? 'pi pi-check-square' : 'pi pi-square'"></i>
            <span>Auto-scroll</span>
          </label>
        </div>

        <div class="footer-right">
          <button class="control-button" @click="clearTerminal" title="Clear console">
            <i class="pi pi-trash"></i>
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Container */
.console-container {
  width: 100%;
  height: 100vh;
  background: #0f1419;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Error Alert */
.error-alert {
  background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  border: 1px solid #b91c1c;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: white;
}

.error-content i {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.error-content strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.error-content p {
  margin: 0;
  font-size: 0.875rem;
  opacity: 0.95;
}

.error-close {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0.5rem;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Console Panel */
.console-panel {
  flex: 1;
  background: #1a1f2e;
  border: 1px solid #2d3748;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* Header */
.console-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1px solid #2d3748;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-title i {
  font-size: 1.5rem;
  color: #60a5fa;
}

.header-title h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #f1f5f9;
}

/* Status Badge */
.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-badge.status-running {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
  color: #22c55e;
}

.status-badge.status-running .status-indicator {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.status-badge.status-starting {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #3b82f6;
}

.status-badge.status-starting .status-indicator {
  background: #3b82f6;
  box-shadow: 0 0 8px #3b82f6;
}

.status-badge.status-stopped {
  background: rgba(107, 114, 128, 0.15);
  border-color: #6b7280;
  color: #9ca3af;
}

.status-badge.status-stopped .status-indicator {
  background: #6b7280;
}

.status-badge.status-crashed {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #ef4444;
}

.status-badge.status-crashed .status-indicator {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
}

.status-badge.status-unknown {
  background: rgba(251, 191, 36, 0.15);
  border-color: #fbbf24;
  color: #fbbf24;
}

.status-badge.status-unknown .status-indicator {
  background: #fbbf24;
}

/* Header Right */
.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid #2d3748;
  border-radius: 6px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #64748b;
  transition: color 0.3s ease;
}

.info-item i {
  font-size: 0.5rem;
}

.info-item.connected {
  color: #22c55e;
}

.info-item.connected i {
  animation: blink 2s infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* Terminal Wrapper */
.terminal-wrapper {
  flex: 1;
  background: #0a0e1a;
  padding: 1rem;
  overflow: hidden;
  position: relative;
}

.terminal-container {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
}

/* Footer */
.console-footer {
  background: #1e293b;
  border-top: 1px solid #2d3748;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Checkbox Control */
.checkbox-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  color: #cbd5e1;
  font-size: 0.875rem;
  transition: color 0.2s ease;
}

.checkbox-control:hover {
  color: #f1f5f9;
}

.checkbox-control input[type="checkbox"] {
  display: none;
}

.checkbox-control i {
  font-size: 1.125rem;
  color: #60a5fa;
  transition: transform 0.2s ease;
}

.checkbox-control:hover i {
  transform: scale(1.1);
}

/* Control Button */
.control-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.control-button:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.control-button:active {
  transform: translateY(0);
}

.control-button i {
  font-size: 1rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .console-container {
    padding: 1rem;
  }

  .console-header {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
  }

  .header-left,
  .header-right {
    width: 100%;
  }

  .connection-info {
    width: 100%;
    justify-content: space-between;
  }

  .console-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .footer-left,
  .footer-right {
    width: 100%;
  }

  .control-button {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .header-title h2 {
    font-size: 1.125rem;
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.375rem 0.75rem;
  }

  .connection-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>
