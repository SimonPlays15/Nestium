<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

  /**
   * ConsolePanel.vue (Option 1)
   * - Single WS: ws://<panel>/ws/servers?serverId=...&token=...
   * - Token fetch: POST http://<panel>/servers/:id/ws-token
   * - Multiplex messages:
   *    incoming: {type:"logs",data}, {type:"state",value}, {type:"info",message}, {type:"error",message}, {type:"agent",channel,status}
   *    outgoing: {type:"cmd",data}
   */

  type ServerState = 'unknown' | 'starting' | 'running' | 'stopped' | 'crashed'
  /**
   * Represents the status of an agent in a system.
   *
   * This type is used to denote whether an agent is currently connected or disconnected.
   * It can have one of the following values:
   * - 'connected': Indicates the agent is active and currently connected.
   * - 'disconnected': Indicates the agent is inactive or not currently connected.
   */
  type AgentStatus = 'connected' | 'disconnected'

  /**
   * Represents various types of incoming messages processed by the system.
   *
   * This type is a union of different object shapes, each identified by a `type` property.
   * The `type` property specifies the kind of message, while additional properties
   * provide contextual data based on the type.
   *
   * Each possible shape is as follows:
   *
   * - `{ type: 'logs'; data: string }`: Represents a log message with string data.
   * - `{ type: 'state'; value: ServerState }`: Represents a server state message, including the current state as a `ServerState` object.
   * - `{ type: 'info'; message: string }`: Represents an informational message with a string description.
   * - `{ type: 'error'; message: string }`: Represents an error message with a string description.
   * - `{ type: 'agent'; channel: 'logs' | 'console' | 'status'; status: AgentStatus }`: Represents an agent status update, including the `channel` being updated and the agent's `status`.
   * - `{ type: 'pong' }`: Represents a response to a ping, used to check connectivity.
   */
  type Incoming =
    | { type: 'logs'; data: string }
    | { type: 'state'; value: ServerState }
    | { type: 'info'; message: string }
    | { type: 'error'; message: string }
    | { type: 'agent'; channel: 'logs' | 'console' | 'status'; status: AgentStatus }
    | { type: 'pong' }

  /**
   * Represents the type of terminal line.
   *
   * This type is used to categorize different kinds of lines that can
   * be output or processed in a terminal or command-line interface.
   *
   * Possible values:
   * - `'out'`: Represents standard output from a command or application.
   * - `'err'`: Represents error output from a command or application.
   * - `'info'`: Represents informational messages or logs.
   * - `'cmd'`: Represents a command or input issued to a terminal or system.
   */
  type TermLineKind = 'out' | 'err' | 'info' | 'cmd'

  type TermLine = { kind: TermLineKind; text: string; ts: number }

  const props = defineProps<{
    serverId: string

    // optional overrides
    panelHttpBase?: string // default http://127.0.0.1:3000
    panelWsBase?: string // default ws://127.0.0.1:3000

    // UX
    maxLines?: number // default 3000
  }>()

  /**
   * Represents the base URL used for HTTP requests related to the panel.
   * If a value is provided through the `props.panelHttpBase` property, it will be used.
   * Otherwise, it defaults to 'http://127.0.0.1:3000'.
   */
  const panelHttpBase = props.panelHttpBase ?? 'http://127.0.0.1:3000'
  /**
   * The WebSocket base URL used for establishing a connection to the panel server.
   * This variable represents the base address of the WebSocket endpoint that the application will connect to.
   * If the property `panelWsBase` exists in `props`, its value will be used.
   * Otherwise, it defaults to `'ws://127.0.0.1:3000'`.
   *
   * @type {string}
   */
  const panelWsBase: string = props.panelWsBase ?? 'ws://127.0.0.1:3000'
  /**
   * Specifies the maximum number of lines that can be processed or displayed.
   * If not provided in the props, a default value of 3000 is used.
   *
   * This variable is typically used to limit the processing or rendering to a
   * defined number of lines to improve performance or adhere to constraints.
   *
   * @type {number}
   */
  const maxLines: number = props.maxLines ?? 3000

  // terminal state
  /**
   * A reactive reference to an array of TermLine objects.
   * This variable is typically used to manage and track an array of lines
   * dynamically, allowing updates and reactivity within a component or application.
   *
   * The array elements are expected to be of the type TermLine.
   * The `ref()` wrapper ensures the variable maintains reactivity
   * in frameworks/libraries that support it, such as Vue.js.
   */
  const lines = ref<TermLine[]>([])
  /**
   * A reactive reference that controls the state of auto-scrolling functionality.
   *
   * When set to `true`, auto-scrolling is enabled, allowing content to scroll
   * automatically. Set it to `false` to disable this feature.
   *
   * This variable is often used in applications where content updates dynamically,
   * such as chat applications or live data feeds, to ensure that users can follow
   * the latest updates without manual scrolling.
   */
  const autoscroll = ref(true)

  /**
   * Appends text to a collection of lines, splitting it into parts and managing the maximum number of lines.
   *
   * @param {TermLineKind} kind - The type or classification of the line being appended.
   * @param {string} text - The text to append. If the text is empty, the function will return without processing.
   * @return {void} This method does not return a value.
   */
  function append(kind: TermLineKind, text: string): void {
    if (!text) return
    const parts = text.replace(/\r/g, '').split('\n')
    for (const p of parts) {
      if (p === '') continue
      lines.value.push({ kind, text: p, ts: Date.now() })
    }
    if (lines.value.length > maxLines) {
      lines.value.splice(0, lines.value.length - maxLines)
    }
  }

  /**
   * Clears the current lines by resetting the value to an empty array.
   *
   * @return {void} Does not return a value.
   */
  function clear(): void {
    lines.value = []
  }

  /**
   * A reactive reference to an HTMLDivElement or null.
   *
   * This variable is commonly used to store a reference to a DOM element that represents a viewport or container.
   * It may be null initially or when the element is not mounted in the DOM.
   */
  const viewportEl = ref<HTMLDivElement | null>(null)
  /**
   * Scrolls the specified viewport element to the bottom of its content.
   *
   * This method retrieves the element stored in `viewportEl.value` and,
   * if the element exists, adjusts its `scrollTop` property to match its
   * `scrollHeight`, effectively scrolling to the bottom.
   *
   * @return {void} This method does not return a value.
   */
  function scrollToBottom(): void {
    const el = viewportEl.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  }
  /**
   * Checks if the autoscroll feature is enabled and, if so, performs a scroll action.
   * Executes the scroll to the bottom of the content after ensuring the DOM is updated.
   *
   * @return {Promise<void>} A promise that resolves after the scroll action is completed.
   */
  async function maybeAutoScroll(): Promise<void> {
    if (!autoscroll.value) return
    await nextTick()
    scrollToBottom()
  }
  /**
   * Handles the scroll event for a specified viewport element.
   * Determines if the element is scrolled to near the bottom and updates the autoscroll state accordingly.
   *
   * @return {void} This method does not return a value.
   */
  function onScroll(): void {
    const el = viewportEl.value
    if (!el) return
    autoscroll.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
  }
  /**
   * A reactive reference representing the current status of the server.
   *
   * This variable is a reference object used to hold the state
   * of the server, which can be dynamically updated. The initial value
   * is set to 'unknown'. It is commonly utilized in applications
   * that need to track and respond to changes in server status
   * during runtime.
   *
   * Possible values for `serverStatus` may include states such as
   * 'unknown', 'online', 'offline', 'error', or other custom states
   * defined within the application logic.
   */
  const serverStatus = ref<ServerState>('unknown')
  /**
   * Fetches the status of a server from the server API and updates the server status.
   *
   * @return {Promise<void>} A promise that resolves when the server status has been successfully fetched and updated. Throws an error if the fetch operation fails.
   */
  async function readStatus(): Promise<void> {
    console.log('readStatus')
    const response = await fetch(panelHttpBase + `/servers/${props.serverId}/status`, {
      method: 'GET',
    })
    if (!response.ok) throw new Error(`Failed to fetch server status: ${response.status}`)
    const data = await response.json()
    serverStatus.value = data.status
    console.log(data)
  }
  readStatus()
  setTimeout(() => {
    readStatus()
  }, 1000)
  // connection state
  /**
   * A reactive reference to a WebSocket instance or null.
   * This variable holds the WebSocket object, which can be used for real-time
   * communication between the client and server. Its initial value is null,
   * and it can be updated dynamically to reference a valid WebSocket instance.
   *
   * Use this variable to monitor or manipulate the WebSocket connection
   * state within a reactive system, such as in a Vue.js composition API setup.
   *
   * Possible values:
   * - A WebSocket instance representing an open connection.
   * - Null, indicating no active connection or an uninitialized state.
   */
  const ws = ref<WebSocket | null>(null)
  /**
   * A reactive reference that indicates the WebSocket connection status.
   *
   * The value is `true` when the WebSocket is connected, and `false` when it is disconnected.
   * This can be used to monitor and respond to changes in the WebSocket's connectivity state.
   */
  const wsConnected = ref(false)
  /**
   * Represents the current state of the server.
   *
   * Possible values include:
   * - 'unknown': The server state is not yet determined.
   * - Other values are expected to indicate specific server states.
   *
   * This variable is a reactive reference and can be used for reactivity within supported frameworks.
   */
  const state = ref<ServerState>('unknown')

  /**
   * Represents the status of different agents in the system.
   * Each key corresponds to a specific agent, and the value indicates its current status.
   * Possible statuses include 'connected', 'disconnected', or other relevant states.
   */
  const agent = ref<Record<string, AgentStatus>>({
    logs: 'disconnected',
    console: 'disconnected',
  })

  /**
   * A reactive variable representing the last error that occurred.
   * It can hold a string describing the error or be null if no error is present.
   *
   * This variable is intended to be used in reactive frameworks like Vue.js
   * to track and display error messages dynamically.
   *
   * @type {import('vue').Ref<string | null>}
   */
  const lastError: import('vue').Ref<string | null> = ref<string | null>(null)

  /**
   * A boolean variable indicating the disposal state of an object or resource.
   * When set to `true`, it signifies that the object or resource has been released
   * or disposed of and should no longer be used. If `false`, the object or resource
   * is still active and available for use.
   */
  let disposed = false
  /**
   * Represents the timer value used to manage reconnection attempts.
   * It can hold a numeric value indicating the timer's duration, `null` if no timer is set,
   * or `undefined` if its state is uninitialized.
   *
   * Type:
   *   - `number`: Specifies the timer duration for reconnection in milliseconds.
   *   - `null`: Indicates no current reconnection timer is active.
   *   - `undefined`: Denotes the reconnection timer has not been initialized.
   */
  let reconnectTimer: number | null | undefined = null

  /**
   * Fetches a WebSocket token from the server.
   *
   * Sends a POST request to the server to retrieve a WebSocket token
   * for establishing secure communication.
   *
   * @return {Promise<string>} A promise that resolves to the fetched token as a string.
   * @throws {Error} If the request fails or the response does not contain a valid token.
   */
  async function fetchToken(): Promise<string> {
    const r = await fetch(
      `${panelHttpBase}/servers/${encodeURIComponent(props.serverId)}/ws-token`,
      {
        method: 'POST',
      },
    )
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j?.token) {
      throw new Error(j?.error ?? `Token request failed (${r.status})`)
    }
    return j.token as string
  }

  /**
   * Schedules a reconnection attempt after a specified delay, unless already scheduled or disposed.
   *
   * @param {number} [ms=800] - The delay in milliseconds before attempting to reconnect. Defaults to 800ms if not specified.
   * @return {void} This function does not return any value.
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
   * Safely closes a given WebSocket connection.
   * Ensures that the socket is closed based on its current ready state and handles possible exceptions during the process.
   *
   * @param {WebSocket | null} sock - The WebSocket instance to be closed. If null, the function exits without performing any operation.
   * @return {void} This function does not return any value.
   */
  function safeCloseSocket(sock: WebSocket | null): void {
    if (!sock) return
    try {
      if (sock.readyState === WebSocket.CONNECTING) {
        sock.close()
        return
      }
      if (sock.readyState === WebSocket.OPEN) sock.close(1000, 'close')
    } catch {}
  }

  /**
   * Parses the incoming raw data into an Incoming object if possible.
   *
   * @param {any} raw The raw input data to be parsed.
   * @return {Incoming|null} The parsed Incoming object if successful, or null if the parsing fails or the type property is missing.
   */
  function parseIncoming(raw: any): Incoming | null {
    try {
      const obj = JSON.parse(String(raw ?? ''))
      if (obj?.type) return obj as Incoming
      return null
    } catch {
      // treat as raw logs
      return { type: 'logs', data: String(raw ?? '') }
    }
  }

  /**
   * Establishes a WebSocket connection to the server and handles incoming messages, connection states,
   * and reconnection logic in case of errors or disconnections. If a token fetch fails, it schedules a
   * reconnection attempt.
   *
   * @return {Promise<void>} A promise that resolves when the connection logic is completed, or it fails and schedules a reconnect.
   */
  async function connect(): Promise<void> {
    if (disposed) return

    // close previous
    safeCloseSocket(ws.value)
    ws.value = null

    wsConnected.value = false

    let token: string
    try {
      token = await fetchToken()
      lastError.value = null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown | never) {
      lastError.value = 'We are having some trouble to connect to the API.'
      scheduleReconnect(3000)
      return
    }

    const url = `${panelWsBase}/ws/servers?serverId=${encodeURIComponent(props.serverId)}&token=${encodeURIComponent(
      token,
    )}`

    const sock = new WebSocket(url)
    ws.value = sock

    sock.onopen = () => {
      wsConnected.value = true
      void maybeAutoScroll()
    }

    sock.onmessage = ev => {
      const msg = parseIncoming(ev.data)
      if (!msg) return

      if (msg.type === 'logs') {
        append('out', msg.data)
      } else if (msg.type === 'state') {
        state.value = msg.value
      } else if (msg.type === 'info') {
        append('info', msg.message)
      } else if (msg.type === 'error') {
        append('err', msg.message)
      } else if (msg.type === 'agent') {
        agent.value[msg.channel] = msg.status
        append('info', `[agent] ${msg.channel}: ${msg.status}`)
      }

      void maybeAutoScroll()
    }

    sock.onclose = () => {
      wsConnected.value = false
      agent.value.logs = 'disconnected'
      agent.value.console = 'disconnected'
      void maybeAutoScroll()
      scheduleReconnect(700)
    }

    sock.onerror = () => {
      try {
        sock.close()
      } catch {}
    }
  }

  // command input UX
  /**
   * Reactive reference object initialized with an empty string.
   * Commonly used in frameworks like Vue.js to create a mutable,
   * reactive state that automatically updates the DOM or triggers
   * reactivity when its value changes.
   */
  const input = ref('')
  /**
   * Reactive reference for an HTML input element.
   * Holds a reference to a DOM `<input>` element or `null` when the element is not mounted.
   * Can be used to dynamically access or manipulate the associated input element in the DOM.
   */
  const inputEl = ref<HTMLInputElement | null>(null)

  /**
   * A reactive reference to an array of strings representing the historical data or events.
   * The `history` variable can be used to store and manipulate a log of actions, changes, or records.
   * It is initialized with an empty array.
   */
  const history = ref<string[]>([])
  /**
   * A reactive variable used to track the current index in the history state.
   *
   * The value is initialized to -1, indicating no selection or no valid history state.
   * It can be updated dynamically to reflect changes in the user's navigation
   * history or other sequential state changes.
   *
   * This is typically used in scenarios involving undo/redo functionality or
   * maintaining a cursor position in a list of historical states.
   *
   * @type {import('vue').Ref<number>}
   */
  const historyIdx: import('vue').Ref<number> = ref<number>(-1)
  /**
   * Reactive reference to a string value representing the most recent input typed by the user.
   * This variable is typically used to track and store user input in real-time.
   * It is initialized with an empty string and can be updated dynamically.
   */
  const lastTyped = ref<string>('')

  /**
   * A computed property that determines if actions can be sent based on the current state and connection status.
   *
   * The value evaluates to `true` when:
   * - A WebSocket connection is established (`wsConnected.value` is `true`).
   * - The console channel is connected (`agent.value.console` is `'connected'`).
   * - The system state is either `'running'` or `'starting'` (`state.value` is `'running'` or `'starting'`).
   *
   * Otherwise, the property evaluates to `false`.
   */
  const canSend = computed(() => {
    // allow sending if a console channel is connected; optionally require running/starting
    const consoleReady = agent.value.console === 'connected'
    const stateOk = state.value === 'running' || state.value === 'starting'
    return wsConnected.value && consoleReady && stateOk
  })

  /**
   * Sends a command to the server via WebSocket.
   *
   * @param {string} cmd - The command to be sent.
   * @return {void} This function does not return a value.
   */
  function sendCmd(cmd: string): void {
    const sock = ws.value
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      append('err', 'ERROR: WS not connected')
      return
    }
    try {
      sock.send(JSON.stringify({ type: 'cmd', data: cmd }))
    } catch {
      append('err', 'ERROR: failed to send cmd')
    }
  }

  /**
   * Processes the current input command, appends it to the output, updates the history, and sends the command.
   *
   * Handles empty input values gracefully and ensures the input field is reset after submission.
   *
   * @return {void} No return value.
   */
  function submit(): void {
    const cmd = input.value.trim()
    if (!cmd) return

    append('cmd', `> ${cmd}`)
    void maybeAutoScroll()

    if (history.value[history.value.length - 1] !== cmd) history.value.push(cmd)
    historyIdx.value = -1
    lastTyped.value = ''

    sendCmd(cmd)
    input.value = ''
    inputEl.value?.focus()
  }

  /**
   * Handles keydown events for an input field, providing functionality for Enter, ArrowUp, and ArrowDown keys.
   *
   * @param {KeyboardEvent} e - The keyboard event triggered by the keydown action.
   * @return {void} No return value.
   */
  function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (canSend.value) submit()
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.value.length === 0) return

      if (historyIdx.value === -1) {
        lastTyped.value = input.value
        historyIdx.value = history.value.length - 1
      } else {
        historyIdx.value = Math.max(0, historyIdx.value - 1)
      }
      input.value = history.value[historyIdx.value] ?? input.value
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (history.value.length === 0) return
      if (historyIdx.value === -1) return

      if (historyIdx.value >= history.value.length - 1) {
        historyIdx.value = -1
        input.value = lastTyped.value
        return
      }

      historyIdx.value = Math.min(history.value.length - 1, historyIdx.value + 1)
      input.value = history.value[historyIdx.value] ?? input.value
    }
  }

  /**
   * Determines the text to be displayed on a badge based on the current state value.
   *
   * @return {string} The badge text corresponding to the state value. Possible values are:
   * - 'RUNNING' if the state is 'running'
   * - 'STARTING' if the state is 'starting'
   * - 'STOPPED' if the state is 'stopped'
   * - 'CRASHED' if the state is 'crashed'
   * - 'UNKNOWN' for any other state value
   */
  function badgeText(): string {
    if (state.value === 'running') return 'RUNNING'
    if (state.value === 'starting') return 'STARTING'
    if (state.value === 'stopped') return 'STOPPED'
    if (state.value === 'crashed') return 'CRASHED'
    return 'UNKNOWN'
  }

  /**
   * Constructs a string indicating the WebSocket connection status, logging activity,
   * console activity, and the server's status.
   *
   * @return {string} A formatted text summarizing the WebSocket connection state,
   *                  logging status, console activity, and server status.
   */
  function connText(): string {
    const a = agent.value
    return `ws:${wsConnected.value ? 'on' : 'off'} · logs:${a.logs} · console:${a.console} | Server: ${serverStatus.value}`
  }

  onMounted(() => {
    connect()
    // focus
    setTimeout(() => inputEl.value?.focus(), 50)
  })

  onBeforeUnmount(() => {
    disposed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    safeCloseSocket(ws.value)
    ws.value = null
  })
</script>

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
            style="font-size: 12px; padding: 2px 8px; border: 1px solid #ccc; border-radius: 999px"
          >
            {{ badgeText() }}
          </span>

          <span style="font-size: 12px; opacity: 0.7">
            {{ connText() }}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px">
          <label style="font-size: 12px; display: flex; gap: 6px; align-items: center">
            <input v-model="autoscroll" type="checkbox" />
            autoscroll
          </label>
          <button style="font-size: 12px" @click="clear">clear</button>
        </div>
      </div>

      <div
        ref="viewportEl"
        style="
          flex: 1;
          overflow: auto;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 10px;
          font-size: 12px;
          line-height: 1.4;
        "
        @scroll="onScroll"
      >
        <div v-for="(l, idx) in lines" :key="idx" style="white-space: pre-wrap">
          <span v-if="l.kind === 'cmd'" style="opacity: 0.85">{{ l.text }}</span>
          <span v-else-if="l.kind === 'err'" style="font-weight: 600">{{ l.text }}</span>
          <span v-else-if="l.kind === 'info'" style="opacity: 0.8">{{ l.text }}</span>
          <span v-else>{{ l.text }}</span>
        </div>
      </div>

      <div style="display: flex; gap: 10px">
        <input
          ref="inputEl"
          v-model="input"
          :disabled="!canSend"
          placeholder="type a command and press Enter"
          style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 8px"
          @keydown="onInputKeydown"
        />
        <button
          :disabled="!canSend || !input.trim()"
          style="padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px"
          @click="submit"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>
