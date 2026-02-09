<script lang="ts" setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

/**
 * Server state types matching Prisma schema
 */
type ServerState = 'CREATED' | 'RUNNING' | 'STOPPED' | 'ERROR'

/**
 * Server data structure
 */
export interface Server {
  id: string
  name: string
  type: string
  state: ServerState
  nodeName: string
  image: string
}

const props = defineProps<{
  server: Server
}>()

const router = useRouter()

/**
 * Get display text for server state badge
 */
const stateText = computed(() => {
  switch (props.server.state) {
    case 'RUNNING': return 'RUNNING'
    case 'STOPPED': return 'STOPPED'
    case 'CREATED': return 'CREATED'
    case 'ERROR': return 'CRASHED'
    default: return 'UNKNOWN'
  }
})

/**
 * Get CSS class for server state styling
 */
const stateClass = computed(() => {
  switch (props.server.state) {
    case 'RUNNING': return 'state-running'
    case 'STOPPED': return 'state-stopped'
    case 'CREATED': return 'state-created'
    case 'ERROR': return 'state-error'
    default: return 'state-unknown'
  }
})

/**
 * Open server console
 */
function openConsole() {
  router.push(`/console/${props.server.id}`)
}

/**
 * Start server (mock implementation)
 * TODO: Implement actual API call
 */
function startServer() {
  console.log('Starting server:', props.server.id)
  // TODO: API call to start server
}

/**
 * Stop server (mock implementation)
 * TODO: Implement actual API call
 */
function stopServer() {
  console.log('Stopping server:', props.server.id)
  // TODO: API call to stop server
}

/**
 * Restart server (mock implementation)
 * TODO: Implement actual API call
 */
function restartServer() {
  console.log('Restarting server:', props.server.id)
  // TODO: API call to restart server
}
</script>

<template>
  <div class="server-card">
    <!-- Card Header -->
    <div class="card-header">
      <div class="header-left">
        <i class="pi pi-server"></i>
        <div class="server-info">
          <h3 class="server-name">{{ server.name }}</h3>
          <p class="server-type">{{ server.type }}</p>
        </div>
      </div>

      <!-- Status Badge -->
      <div class="status-badge" :class="stateClass">
        <span class="status-indicator"></span>
        <span class="status-text">{{ stateText }}</span>
      </div>
    </div>

    <!-- Card Body -->
    <div class="card-body">
      <!-- Server Details -->
      <div class="detail-row">
        <i class="pi pi-database"></i>
        <span class="detail-label">Node:</span>
        <span class="detail-value">{{ server.nodeName }}</span>
      </div>

      <div class="detail-row">
        <i class="pi pi-box"></i>
        <span class="detail-label">Image:</span>
        <span class="detail-value">{{ server.image }}</span>
      </div>
    </div>

    <!-- Card Footer -->
    <div class="card-footer">
      <button
        class="action-button primary"
        @click="openConsole"
        title="Open Console"
      >
        <i class="pi pi-terminal"></i>
        <span>Console</span>
      </button>

      <button
        v-if="server.state !== 'RUNNING'"
        class="action-button success"
        @click="startServer"
        title="Start Server"
      >
        <i class="pi pi-play"></i>
      </button>

      <button
        v-if="server.state === 'RUNNING'"
        class="action-button warning"
        @click="restartServer"
        title="Restart Server"
      >
        <i class="pi pi-refresh"></i>
      </button>

      <button
        v-if="server.state === 'RUNNING'"
        class="action-button danger"
        @click="stopServer"
        title="Stop Server"
      >
        <i class="pi pi-stop"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Server Card */
.server-card {
  background: rgba(26, 31, 46, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid #2d3748;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.server-card:hover {
  border-color: #3b82f6;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(59, 130, 246, 0.3);
  transform: translateY(-2px);
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1px solid #2d3748;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

.header-left > i {
  font-size: 1.75rem;
  color: #60a5fa;
  flex-shrink: 0;
}

.server-info {
  flex: 1;
  min-width: 0;
}

.server-name {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-type {
  margin: 0.25rem 0 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status Badge */
.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-badge.state-running {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
  color: #22c55e;
}

.status-badge.state-running .status-indicator {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.status-badge.state-stopped {
  background: rgba(107, 114, 128, 0.15);
  border-color: #6b7280;
  color: #9ca3af;
}

.status-badge.state-stopped .status-indicator {
  background: #6b7280;
}

.status-badge.state-created {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #3b82f6;
}

.status-badge.state-created .status-indicator {
  background: #3b82f6;
  box-shadow: 0 0 6px #3b82f6;
}

.status-badge.state-error {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #ef4444;
}

.status-badge.state-error .status-indicator {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.status-badge.state-unknown {
  background: rgba(251, 191, 36, 0.15);
  border-color: #fbbf24;
  color: #fbbf24;
}

.status-badge.state-unknown .status-indicator {
  background: #fbbf24;
}

/* Card Body */
.card-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.875rem;
}

.detail-row i {
  color: #64748b;
  font-size: 0.875rem;
  width: 16px;
  flex-shrink: 0;
}

.detail-label {
  color: #94a3b8;
  font-weight: 500;
}

.detail-value {
  color: #cbd5e1;
  margin-left: auto;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Card Footer */
.card-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid #2d3748;
}

/* Action Buttons */
.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: 1px solid;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-button i {
  font-size: 0.875rem;
}

.action-button.primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-color: #1d4ed8;
  color: white;
  flex: 1;
}

.action-button.primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.action-button.success {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
  color: #22c55e;
  padding: 0.625rem;
}

.action-button.success:hover {
  background: rgba(34, 197, 94, 0.25);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  transform: translateY(-1px);
}

.action-button.warning {
  background: rgba(251, 191, 36, 0.15);
  border-color: #fbbf24;
  color: #fbbf24;
  padding: 0.625rem;
}

.action-button.warning:hover {
  background: rgba(251, 191, 36, 0.25);
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
  transform: translateY(-1px);
}

.action-button.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #ef4444;
  padding: 0.625rem;
}

.action-button.danger:hover {
  background: rgba(239, 68, 68, 0.25);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  transform: translateY(-1px);
}

.action-button:active {
  transform: translateY(0);
}

/* Responsive */
@media (max-width: 480px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .status-badge {
    align-self: flex-start;
  }

  .action-button span {
    display: none;
  }

  .action-button.primary {
    flex: 1;
  }
}
</style>
