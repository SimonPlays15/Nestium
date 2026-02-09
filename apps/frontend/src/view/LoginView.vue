<script lang="ts" setup>
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAuth} from '@/composable/useAuth'

const router = useRouter()

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

async function handleLogin() {
  errorMessage.value = null

  if (!email.value || !password.value) {
    errorMessage.value = 'Please fill in all fields'
    return
  }

  isLoading.value = true

  try {
    await useAuth().login(email.value, password.value);
    // Redirect to dashboard
    await router.push('/dashboard')

  } catch (error: any) {
    errorMessage.value = error.message || 'Login failed. Please check your credentials.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <!-- Background Decoration -->
    <div class="background-decoration">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- Login Card -->
    <div class="login-card">
      <!-- Logo/Header -->
      <div class="login-header">
        <div class="logo">
          <i class="pi pi-server"></i>
        </div>
        <h1>Nestium</h1>
        <p class="subtitle">Sign in to your account</p>
      </div>

      <!-- Error Alert -->
      <div v-if="errorMessage" class="error-alert">
        <i class="pi pi-exclamation-circle"></i>
        <span>{{ errorMessage }}</span>
        <button class="error-close" @click="errorMessage = null">
          <i class="pi pi-times"></i>
        </button>
      </div>

      <!-- Login Form -->
      <form class="login-form" @submit.prevent="handleLogin">
        <!-- Email Field -->
        <div class="form-group">
          <label for="email">
            <i class="pi pi-envelope"></i>
            <span>Email Address</span>
          </label>
          <input
            id="email"
            v-model="email"
            :disabled="isLoading"
            autocomplete="email"
            placeholder="user@example.com"
            required
            type="email"
          />
        </div>

        <!-- Password Field -->
        <div class="form-group">
          <label for="password">
            <i class="pi pi-lock"></i>
            <span>Password</span>
          </label>
          <input
            id="password"
            v-model="password"
            :disabled="isLoading"
            autocomplete="current-password"
            placeholder="••••••••"
            required
            type="password"
          />
        </div>

        <!-- Remember Me & Forgot Password -->
        <div class="form-options">
          <label class="checkbox-control">
            <input v-model="rememberMe" :disabled="isLoading" type="checkbox"/>
            <i :class="rememberMe ? 'pi pi-check-square' : 'pi pi-square'"></i>
            <span>Remember me</span>
          </label>
          <a class="forgot-link" href="#">Forgot password?</a>
        </div>

        <!-- Submit Button -->
        <button :disabled="isLoading" class="login-button" type="submit">
          <i v-if="isLoading" class="pi pi-spin pi-spinner"></i>
          <i v-else class="pi pi-sign-in"></i>
          <span>{{ isLoading ? 'Signing in...' : 'Sign In' }}</span>
        </button>
      </form>

      <!-- Footer Links -->
      <div class="login-footer">
        <p>Don't have an account? <a href="#">Contact Administrator</a></p>
      </div>
    </div>

    <!-- Version Info -->
    <div class="version-info">
      <span>Nestium Panel v1.0.0</span>
    </div>
  </div>
</template>

<style scoped>
/* Container */
.login-container {
  width: 100%;
  height: 100vh;
  background: #0f1419;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 1.5rem;
}

/* Background Decoration */
.background-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
  animation: float 20s infinite ease-in-out;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  top: -200px;
  left: -200px;
  animation-delay: 0s;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #06b6d4, #3b82f6);
  bottom: -250px;
  right: -250px;
  animation-delay: -10s;
}

.orb-3 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -5s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.1);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.9);
  }
  75% {
    transform: translate(20px, 30px) scale(1.05);
  }
}

/* Login Card */
.login-card {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: rgba(26, 31, 46, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 16px;
  padding: 2.5rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
  0 0 100px rgba(59, 130, 246, 0.1),
  inset 0 1px 0 rgba(255, 255, 255, 0.05);
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

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 16px;
  margin-bottom: 1.25rem;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.logo i {
  font-size: 2rem;
  color: white;
}

.login-header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: #94a3b8;
  font-weight: 400;
}

/* Error Alert */
.error-alert {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: 10px;
  color: #fca5a5;
  font-size: 0.875rem;
  animation: shake 0.4s ease-out;
}

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-8px);
  }
  75% {
    transform: translateX(8px);
  }
}

.error-alert i:first-child {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.error-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: #fca5a5;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.error-close:hover {
  background: rgba(220, 38, 38, 0.2);
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #cbd5e1;
}

.form-group label i {
  font-size: 0.875rem;
  color: #64748b;
}

.form-group input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: rgba(15, 20, 25, 0.6);
  border: 1px solid #2d3748;
  border-radius: 10px;
  color: #f1f5f9;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  outline: none;
}

.form-group input::placeholder {
  color: #64748b;
}

.form-group input:focus {
  background: rgba(15, 20, 25, 0.8);
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1),
  0 4px 12px rgba(59, 130, 246, 0.15);
}

.form-group input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Form Options */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -0.5rem;
}

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
  font-size: 1rem;
  color: #3b82f6;
  transition: transform 0.2s ease;
}

.checkbox-control:hover i {
  transform: scale(1.1);
}

.checkbox-control input:disabled ~ * {
  opacity: 0.5;
  cursor: not-allowed;
}

.forgot-link {
  color: #60a5fa;
  font-size: 0.875rem;
  text-decoration: none;
  transition: color 0.2s ease;
}

.forgot-link:hover {
  color: #3b82f6;
  text-decoration: underline;
}

/* Submit Button */
.login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  width: 100%;
  padding: 1rem;
  margin-top: 0.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: 1px solid #1d4ed8;
  border-radius: 10px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.login-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.login-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.login-button i {
  font-size: 1.125rem;
}

/* Footer */
.login-footer {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(45, 55, 72, 0.6);
  text-align: center;
}

.login-footer p {
  margin: 0;
  font-size: 0.875rem;
  color: #94a3b8;
}

.login-footer a {
  color: #60a5fa;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s ease;
}

.login-footer a:hover {
  color: #3b82f6;
  text-decoration: underline;
}

/* Version Info */
.version-info {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
  opacity: 0.7;
}

/* Responsive Design */
@media (max-width: 480px) {
  .login-card {
    padding: 2rem 1.5rem;
  }

  .login-header h1 {
    font-size: 1.75rem;
  }

  .logo {
    width: 56px;
    height: 56px;
  }

  .logo i {
    font-size: 1.75rem;
  }

  .form-options {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}

@media (max-height: 700px) {
  .login-container {
    padding: 1rem;
  }

  .login-card {
    padding: 1.5rem;
  }

  .login-header {
    margin-bottom: 1.5rem;
  }

  .logo {
    width: 48px;
    height: 48px;
    margin-bottom: 1rem;
  }

  .logo i {
    font-size: 1.5rem;
  }

  .login-header h1 {
    font-size: 1.5rem;
  }
}
</style>
