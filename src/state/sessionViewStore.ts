import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SessionInfo, User, ProfileGate } from '@/types/domain'
import { identityApi } from '@/services'

export const useSessionViewStore = defineStore('sessionView', () => {
  const user = ref<User | null>(null)
  const profileGate = ref<ProfileGate>({ complete: false, emailVerified: false })
  const degraded = ref(false)
  const permissions = ref<string[]>([])
  const loading = ref(false)
  const lastLoadedAt = ref<number | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const isProfileComplete = computed(() => profileGate.value.complete && profileGate.value.emailVerified)
  const needsProfileGate = computed(() => isAuthenticated.value && !isProfileComplete.value)

  async function loadSession(mockUser?: string) {
    loading.value = true
    const result = await identityApi.getSession(mockUser)
    loading.value = false

    if (result.kind === 'completed') {
      const data = result.data as SessionInfo
      user.value = data.user
      profileGate.value = data.profileGate
      degraded.value = data.degraded
      permissions.value = data.permissions
      lastLoadedAt.value = Date.now()
    } else {
      user.value = null
      permissions.value = []
    }
  }

  function clearSession() {
    user.value = null
    profileGate.value = { complete: false, emailVerified: false }
    degraded.value = false
    permissions.value = []
    lastLoadedAt.value = null
  }

  async function logout() {
    try {
      await identityApi.logout()
    } finally {
      clearSession()
    }
  }

  function hasPermission(permission: string): boolean {
    return permissions.value.includes(permission)
  }

  return {
    user,
    profileGate,
    degraded,
    permissions,
    loading,
    lastLoadedAt,
    isAuthenticated,
    isProfileComplete,
    needsProfileGate,
    loadSession,
    clearSession,
    logout,
    hasPermission,
  }
})
