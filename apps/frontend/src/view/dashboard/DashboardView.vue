<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composable/useAuth'
import ServerCard, { type Server } from '@/components/dashboard/ServerCard.vue'

const router = useRouter()
const { currentUser, isAdmin, logout } = useAuth()

const servers = ref<Server[]>([])
const isLoading = ref(true)

/**
 * Fetch user's servers (mock implementation)
 * TODO: Replace with actual API call
 */
async function fetchServers() {
  isLoading.value = true

  try {
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 800))

    // Mock server data
    servers.value = [
      {
        id: 'a54ff461-774a-4ee5-975e-d18d9f8998c4',
        name: 'Minecraft Survival',
        type: 'Minecraft Java',
        state: 'RUNNING',
        nodeName: 'Node-EU-01',
        image: 'minecraft:java17'
      },
      {
        id: 'b64ff461-774a-4ee5-975e-d18d9f8998c5',
        name: 'Discord Bot',
        type: 'Node.js',
        state: 'STOPPED',
        nodeName: 'Node-US-01',
        image: 'node:20-alpine'
      },
      {
        id: 'c74ff461-774a-4ee5-975e-d18d9f8998c6',
        name: 'Web Server',
        type: 'Nginx',
        state: 'RUNNING',
        nodeName: 'Node-EU-02',
        image: 'nginx:alpine'
      },
      {
        id: 'd84ff461-774a-4ee5-975e-d18d9f8998c7',
        name: 'Database',
        type: 'PostgreSQL',
        state: 'CREATED',
        nodeName: 'Node-EU-01',
        image: 'postgres:16'
      }
    ]
  } catch (error) {
    console.error('Failed to fetch servers:', error)
  } finally {
    isLoading.value = false
  }
}

/**
 * Navigate to admin panel
 */
function goToAdmin() {
  router.push('/admin')
}

/**
 * Handle logout
 */
function handleLogout() {
  logout()
  router.push('/login')
}

/**
 * Get statistics for quick overview
 */
function getStats() {
  const total = servers.value.length
  const running = servers.value.filter(s => s.state === 'RUNNING').length
  const stopped = servers.value.filter(s => s.state === 'STOPPED').length
  const created = servers.value.filter(s => s.state === 'CREATED').length

  return { total, running, stopped, created }
}

onMounted(() => {
  fetchServers()
})
</script>

<template>
  <div class="dashboard-container">
    <!-- Background Decoration -->
    <div class="background-decoration">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
    </div>

    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-content">
        <div class="header-left">
          <div class="logo">
            <i class="pi pi-server"></i>
          </div>
          <div class="header-info">
            <h1>Dashboard</h1>
            <p class="welcome-text">
              Welcome back, <strong>{{ currentUser?.email }}</strong>
            </p>
          </div>
        </div>

        <div class="header-actions">
          <!-- Admin Button (only visible for admins) -->
          <button
            v-if="isAdmin"
            class="action-button admin-button"
            @click="goToAdmin"
            title="Admin Panel"
          >
            <i class="pi pi-shield"></i>
            <span>Admin Panel</span>
          </button>

          <!-- Logout Button -->
          <button
            class="action-button logout-button"
            @click="handleLogout"
            title="Logout"
          >
            <i class="pi pi-sign-out"></i>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="dashboard-main">
      <!-- Statistics Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon total">
            <i class="pi pi-server"></i>
          </div>
          <div class="stat-info">
            <p class="stat-label">Total Servers</p>
            <p class="stat-value">{{ getStats().total }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon running">
            <i class="pi pi-check-circle"></i>
          </div>
          <div class="stat-info">
            <p class="stat-label">Running</p>
            <p class="stat-value">{{ getStats().running }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon stopped">
            <i class="pi pi-pause-circle"></i>
          </div>
          <div class="stat-info">
            <p class="stat-label">Stopped</p>
            <p class="stat-value">{{ getStats().stopped }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon created">
            <i class="pi pi-clock"></i>
          </div>
          <div class="stat-info">
            <p class="stat-label">Created</p>
            <p class="stat-value">{{ getStats().created }}</p>
          </div>
        </div>
      </div>

      <!-- Servers Section -->
      <section class="servers-section">
        <div class="section-header">
          <h2>
            <i class="pi pi-list"></i>
            <span>Your Servers</span>
          </h2>
          <button class="refresh-button" @click="fetchServers" :disabled="isLoading">
            <i class="pi" :class="isLoading ? 'pi-spin pi-spinner' : 'pi-refresh'"></i>
            <span>Refresh</span>
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="loading-state">
          <i class="pi pi-spin pi-spinner"></i>
          <p>Loading servers...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="servers.length === 0" class="empty-state">
          <i class="pi pi-inbox"></i>
          <h3>No servers found</h3>
          <p>You don't have any servers yet. Contact your administrator to create one.</p>
        </div>

        <!-- Server Grid -->
        <div v-else class="server-grid">
          <ServerCard
            v-for="server in servers"
            :key="server.id"
            :server="server"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Container */
.dashboard-container {
  width: 100%;
  min-height: 100vh;
  background: #0f1419;
  position: relative;
  overflow-x: hidden;
}

/* Background Decoration */
.background-decoration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.12;
  animation: float 25s infinite ease-in-out;
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  top: -250px;
  right: -100px;
}

.orb-2 {
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #06b6d4, #3b82f6);
  bottom: -300px;
  left: -200px;
  animation-delay: -12s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -40px) scale(1.1); }
  66% { transform: translate(-30px, 30px) scale(0.9); }
}

/* Header */
.dashboard-header {
  position: relative;
  z-index: 1;
  background: rgba(26, 31, 46, 0.9);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid #2d3748;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 12px;
  box-shadow:
    0 6px 16px rgba(59, 130, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.logo i {
  font-size: 1.75rem;
  color: white;
}

.header-info h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.5px;
}

.welcome-text {
  margin: 0.25rem 0 0 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

.welcome-text strong {
  color: #cbd5e1;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1.25rem;
  border: 1px solid;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-button i {
  font-size: 1rem;
}

.admin-button {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  border-color: #7e22ce;
  color: white;
  box-shadow:
    0 4px 12px rgba(168, 85, 247, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.admin-button:hover {
  background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);
  box-shadow:
    0 6px 16px rgba(168, 85, 247, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.logout-button {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #ef4444;
}

.logout-button:hover {
  background: rgba(239, 68, 68, 0.25);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  transform: translateY(-2px);
}

.action-button:active {
  transform: translateY(0);
}

/* Main Content */
.dashboard-main {
  position: relative;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

/* Statistics Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.5rem;
  background: rgba(26, 31, 46, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid #2d3748;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.stat-card:hover {
  border-color: #3b82f6;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(59, 130, 246, 0.3);
  transform: translateY(-2px);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 1.5rem;
}

.stat-icon.total {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.stat-icon.running {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.stat-icon.stopped {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(107, 114, 128, 0.3);
}

.stat-icon.created {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
}

.stat-info {
  flex: 1;
}

.stat-label {
  margin: 0 0 0.25rem 0;
  font-size: 0.875rem;
  color: #94a3b8;
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: #f1f5f9;
}

/* Servers Section */
.servers-section {
  background: rgba(26, 31, 46, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid #2d3748;
  border-radius: 12px;
  padding: 1.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;
  gap: 1rem;
}

.section-header h2 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #f1f5f9;
}

.section-header h2 i {
  color: #60a5fa;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid #3b82f6;
  border-radius: 6px;
  color: #60a5fa;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Server Grid */
.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.25rem;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: #94a3b8;
}

.loading-state i {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: #60a5fa;
}

.loading-state p {
  margin: 0;
  font-size: 1rem;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-state i {
  font-size: 4rem;
  color: #64748b;
  margin-bottom: 1.5rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  color: #cbd5e1;
}

.empty-state p {
  margin: 0;
  font-size: 0.95rem;
  color: #94a3b8;
  max-width: 400px;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .header-content {
    padding: 1.25rem 1.5rem;
  }

  .dashboard-main {
    padding: 1.5rem;
  }

  .server-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-left {
    width: 100%;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .action-button span {
    display: inline;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .server-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .dashboard-main {
    padding: 1rem;
  }

  .servers-section {
    padding: 1.25rem;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .header-info h1 {
    font-size: 1.5rem;
  }

  .logo {
    width: 48px;
    height: 48px;
  }

  .logo i {
    font-size: 1.5rem;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .refresh-button {
    align-self: flex-start;
  }
}
</style>
