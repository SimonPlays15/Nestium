import {computed, ref, watch} from 'vue'

/**
 * User role types matching the Prisma schema
 */
export type UserRole = 'ADMIN' | 'USER'

/**
 * User data structure
 */
export interface User {
  id: string
  email: string
  role: UserRole
  permissions: string[]
}

/**
 * Local storage keys
 */
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

/**
 * Auth state - persisted in localStorage and synced with backend
 */
const currentUser = ref<User | null>(null)
const accessToken = ref<string | null>(null)

/**
 * Initialize auth state from localStorage on module load
 */
function initializeAuthState() {
  const storedToken = localStorage.getItem(TOKEN_KEY)
  const storedUser = localStorage.getItem(USER_KEY)

  if (storedToken && storedUser) {
    try {
      accessToken.value = storedToken
      currentUser.value = JSON.parse(storedUser)
    } catch (error) {
      console.error('Failed to parse stored user data:', error)
      clearAuthState()
    }
  }
}

/**
 * Clear auth state from memory and localStorage
 */
function clearAuthState() {
  accessToken.value = null
  currentUser.value = null
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/**
 * Save auth state to localStorage
 */
function saveAuthState(token: string, user: User) {
  accessToken.value = token
  currentUser.value = user
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// Initialize on load
initializeAuthState()

// Watch for changes and sync to localStorage
watch([accessToken, currentUser], ([token, user]) => {
  if (token && user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }
})

/**
 * Composable for authentication and user management
 *
 * Provides reactive access to the current user state and authentication helpers.
 * In production, this should be integrated with your backend authentication system.
 */
export function useAuth(opts: {
  httpBase?: string // default http://127.0.0.1:3000
} = {}) {

  const httpBase = opts.httpBase ?? 'http://127.0.0.1:3000'

  /**
   * Check if user is currently authenticated
   */
  const isAuthenticated = computed(() => currentUser.value !== null)

  /**
   * Check if current user has admin role
   */
  const isAdmin = computed(() => currentUser.value?.role === 'ADMIN')

  /**
   * Get current user email or null
   */
  const userEmail = computed(() => currentUser.value?.email ?? null)

  /**
   * Get current user role or null
   */
  const userRole = computed(() => currentUser.value?.role ?? null)

  /**
   * Login user and persist session
   */
  async function login(email: string, password: string): Promise<void> {
    const r = await fetch(`${httpBase}/auth/login`, {
      method: "POST",
      body: JSON.stringify({email, password}),
      headers: {"Content-Type": "application/json"}
    });

    const data = await r.json();

    if (!r.ok) throw new Error(data.message);

    // Save token and user data to localStorage
    saveAuthState(data.accessToken, data.user);
  }

  /**
   * Logout current user and clear session
   */
  async function logout(): Promise<void> {
    try {
      const token = accessToken.value;

      if (token) {
        await fetch(`${httpBase}/auth/logout`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      }
    } finally {
      // Always clear local state, even if API call fails
      clearAuthState();
    }
  }

  /**
   * Refresh user data (including permissions) from backend
   */
  async function refreshUser(): Promise<void> {
    const token = accessToken.value;

    if (!token) {
      throw new Error('No authentication token available');
    }

    const r = await fetch(`${httpBase}/auth/refresh`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!r.ok) {
      // Token might be invalid or expired
      clearAuthState();
      throw new Error('Failed to refresh user data');
    }

    const userData = await r.json();
    saveAuthState(token, userData);
  }

  /**
   * Check if user has a specific permission
   */
  function hasPermission(permission: string): boolean {
    if (!currentUser.value) return false
    if (currentUser.value.role === 'ADMIN') return true
    return currentUser.value.permissions.includes(permission)
  }

  return {
    currentUser: computed(() => currentUser.value),
    accessToken: computed(() => accessToken.value),
    isAuthenticated,
    isAdmin,
    userEmail,
    userRole,
    login,
    logout,
    refreshUser,
    hasPermission
  }
}
