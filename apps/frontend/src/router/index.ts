import {createRouter, createWebHistory} from 'vue-router'
import TestConsoleView from "@/view/server/TestConsoleView.vue";
import LoginView from "@/view/LoginView.vue";
import DashboardView from "@/view/dashboard/DashboardView.vue";
import {useAuth} from "@/composable/useAuth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/dashboard'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {requiresGuest: true}
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: {requiresAuth: true}
    },
    {
      path: '/console/:serverId',
      name: 'console',
      component: TestConsoleView,
      meta: {requiresAuth: true}
    },
    {
      path: '/admin',
      name: 'admin',
      // TODO: Create AdminView component
      component: () => import('@/view/admin/AdminView.vue'),
      meta: {requiresAuth: true, requiresAdmin: true}
    },
  ],
})

/**
 * Navigation guard to protect routes and refresh user data
 */
router.beforeEach(async (to, from, next) => {
  const auth = useAuth()

  // Try to refresh user data if authenticated and token exists
  if (auth.isAuthenticated.value && auth.accessToken.value) {
    try {
      // Refresh user data to get latest permissions
      // Only refresh if we're not already on the login page and user data exists
      if (to.path !== '/login' && auth.currentUser.value) {
        await auth.refreshUser()
      }
    } catch (error) {
      // If refresh fails (e.g., token expired), clear auth and redirect to login
      console.error('Failed to refresh user data:', error)
      if (to.meta.requiresAuth) {
        return next('/login')
      }
    }
  }

  // Check if route requires authentication
  if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
    return next('/login')
  }

  // Check if route requires guest (not logged in)
  if (to.meta.requiresGuest && auth.isAuthenticated.value) {
    return next('/dashboard')
  }

  // Check if route requires admin role
  if (to.meta.requiresAdmin && !auth.isAdmin.value) {
    return next('/dashboard')
  }

  next()
})

export default router
