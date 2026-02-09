/**
 * API Client with automatic authentication handling
 *
 * This module provides a centralized HTTP client that automatically:
 * - Adds authentication tokens to requests
 * - Handles 401/403 errors by redirecting to login
 * - Provides type-safe API methods
 */

const TOKEN_KEY = 'auth_token'

/**
 * Base API configuration
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'

/**
 * HTTP client error
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Clear authentication and redirect to login
 */
function clearAuthAndRedirect() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('auth_user')
  window.location.href = '/login'
}

/**
 * Generic fetch wrapper with authentication
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

  // Add authentication header if token exists
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Handle authentication errors
    if (response.status === 401) {
      clearAuthAndRedirect()
      throw new ApiError('Unauthorized', 401)
    }

    if (response.status === 403) {
      throw new ApiError('Forbidden - Insufficient permissions', 403)
    }

    // Parse response
    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(
        data.message || `HTTP ${response.status}`,
        response.status,
        data
      )
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError('Network error', 0, error)
  }
}

/**
 * API methods
 */
export const api = {
  /**
   * Generic GET request
   */
  get: <T = any>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'GET' }),

  /**
   * Generic POST request
   */
  post: <T = any>(endpoint: string, data?: any) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * Generic PUT request
   */
  put: <T = any>(endpoint: string, data?: any) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * Generic DELETE request
   */
  delete: <T = any>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'DELETE' }),

  /**
   * Server endpoints
   */
  servers: {
    list: () => api.get('/servers'),
    get: (id: string) => api.get(`/servers/${id}`),
    status: (id: string) => api.get(`/servers/${id}/status`),
    logs: (id: string, tail?: number) =>
      api.get(`/servers/${id}/logs${tail ? `?tail=${tail}` : ''}`),
    start: (id: string) => api.post(`/servers/${id}/start`),
    stop: (id: string) => api.post(`/servers/${id}/stop`),
    restart: (id: string) => api.post(`/servers/${id}/restart`),
    delete: (id: string) => api.delete(`/servers/${id}`),
    createWsToken: (id: string) => api.post(`/servers/${id}/ws-token`),
    createMinecraft: (data: {
      nodeId: string
      name: string
      hostPort: number
      memoryMb: number
      version?: string
    }) => api.post('/servers/minecraft', data),
  },

  /**
   * Node endpoints
   */
  nodes: {
    list: () => api.get('/nodes'),
    get: (id: string) => api.get(`/nodes/${id}`),
    ping: (id: string) => api.post(`/nodes/${id}/ping`),
    pingAll: () => api.post('/nodes/ping-all'),
    createAllocations: (
      id: string,
      data: { startPort: number; endPort: number; protocol?: string }
    ) => api.post(`/nodes/${id}/allocations`, data),
  },

  /**
   * Auth endpoints
   */
  auth: {
    login: (email: string, password: string) =>
      api.post('/auth/login', { email, password }),
    logout: () => api.post('/auth/logout'),
    me: () => api.get('/auth/me'),
    refresh: () => api.post('/auth/refresh'),
  },
}
