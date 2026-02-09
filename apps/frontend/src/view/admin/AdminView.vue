<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { useAuth } from '@/composable/useAuth'

const router = useRouter()
const { currentUser, isAdmin } = useAuth()

// Redirect if not admin
if (!isAdmin.value) {
  router.push('/dashboard')
}

function goBack() {
  router.push('/dashboard')
}
</script>

<template>
  <div class="admin-container">
    <!-- Background Decoration -->
    <div class="background-decoration">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
    </div>

    <!-- Header -->
    <header class="admin-header">
      <div class="header-content">
        <div class="header-left">
          <button class="back-button" @click="goBack">
            <i class="pi pi-arrow-left"></i>
          </button>
          <div class="logo">
            <i class="pi pi-shield"></i>
          </div>
          <div class="header-info">
            <h1>Admin Panel</h1>
            <p class="subtitle">System Management & Configuration</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="admin-main">
      <div class="placeholder-card">
        <div class="placeholder-icon">
          <i class="pi pi-wrench"></i>
        </div>
        <h2>Admin Panel Coming Soon</h2>
        <p>This area is under construction. Admin features will be available here:</p>
        <ul class="feature-list">
          <li>
            <i class="pi pi-users"></i>
            <span>User Management</span>
          </li>
          <li>
            <i class="pi pi-server"></i>
            <span>Server Administration</span>
          </li>
          <li>
            <i class="pi pi-database"></i>
            <span>Node Management</span>
          </li>
          <li>
            <i class="pi pi-cog"></i>
            <span>System Configuration</span>
          </li>
          <li>
            <i class="pi pi-chart-line"></i>
            <span>Analytics & Monitoring</span>
          </li>
        </ul>
        <button class="primary-button" @click="goBack">
          <i class="pi pi-arrow-left"></i>
          <span>Back to Dashboard</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Container */
.admin-container {
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
  background: linear-gradient(135deg, #a855f7, #ec4899);
  top: -250px;
  right: -100px;
}

.orb-2 {
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #f97316, #a855f7);
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
.admin-header {
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
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid #3b82f6;
  border-radius: 8px;
  color: #60a5fa;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-button:hover {
  background: rgba(59, 130, 246, 0.25);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  transform: translateY(-2px);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  border-radius: 12px;
  box-shadow:
    0 6px 16px rgba(168, 85, 247, 0.4),
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

.subtitle {
  margin: 0.25rem 0 0 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

/* Main Content */
.admin-main {
  position: relative;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 120px);
}

/* Placeholder Card */
.placeholder-card {
  max-width: 600px;
  width: 100%;
  background: rgba(26, 31, 46, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 16px;
  padding: 3rem;
  text-align: center;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 100px rgba(168, 85, 247, 0.15);
  animation: slideUp 0.6s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  border-radius: 20px;
  margin-bottom: 1.5rem;
  box-shadow:
    0 8px 24px rgba(168, 85, 247, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.placeholder-icon i {
  font-size: 2.5rem;
  color: white;
}

.placeholder-card h2 {
  margin: 0 0 1rem 0;
  font-size: 2rem;
  font-weight: 700;
  color: #f1f5f9;
}

.placeholder-card > p {
  margin: 0 0 2rem 0;
  font-size: 1rem;
  color: #94a3b8;
  line-height: 1.6;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 2.5rem 0;
  text-align: left;
}

.feature-list li {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid #2d3748;
  border-radius: 10px;
  color: #cbd5e1;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.feature-list li:hover {
  border-color: #a855f7;
  background: rgba(168, 85, 247, 0.1);
  transform: translateX(4px);
}

.feature-list li i {
  color: #a855f7;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.primary-button {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: 1px solid #1d4ed8;
  border-radius: 10px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow:
    0 4px 14px rgba(59, 130, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.primary-button:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow:
    0 6px 20px rgba(59, 130, 246, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.primary-button:active {
  transform: translateY(0);
}

.primary-button i {
  font-size: 1rem;
}

/* Responsive */
@media (max-width: 768px) {
  .admin-main {
    padding: 1.5rem;
  }

  .placeholder-card {
    padding: 2rem 1.5rem;
  }

  .placeholder-card h2 {
    font-size: 1.5rem;
  }
}

@media (max-width: 480px) {
  .header-left {
    flex-wrap: wrap;
  }

  .placeholder-icon {
    width: 64px;
    height: 64px;
  }

  .placeholder-icon i {
    font-size: 2rem;
  }
}
</style>
