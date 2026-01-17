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

<style scoped>

</style>

<template>
  <div class="container-fluid mt-2">
    <div v-if="lastError" class="alert alert-danger alert-dismissible">
      <strong>Error</strong> {{ lastError }}
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; height: 100%">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
        <div style="display: flex; align-items: center; gap: 10px">
          <strong>Console</strong>

          <span
            style="font-size: 12px; padding: 2px 8px; border: 1px solid #ccc; border-radius: 999px">
            {{ badgeText() }}
          </span>

          <span style="font-size: 12px; opacity: 0.7">
            {{ connText() }}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px">
          <label style="font-size: 12px; display: flex; gap: 6px; align-items: center">
            <input v-model="autoscroll" type="checkbox"/>
            autoscroll
          </label>

          <button style="font-size: 12px" @click="clearTerminal">clear</button>
        </div>
      </div>

      <!-- xterm container -->
      <div
        ref="termEl"
        style="flex: 1; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; min-height: 320px; "
      />
    </div>
  </div>
</template>
