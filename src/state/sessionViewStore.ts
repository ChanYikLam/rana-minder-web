import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SessionInfo, User, ProfileGate, WorkspaceInfo } from '@/types/domain'
import { getSession, logout as logoutAuth } from '@/services/auth'

export const useSessionViewStore = defineStore('sessionView', () => {
  const user = ref<User | null>(null)
  const profileGate = ref<ProfileGate>({ complete: false, emailVerified: false })
  const degraded = ref(false)
  const permissions = ref<string[]>([])
  const workspace = ref<WorkspaceInfo | null>(null)
  const loading = ref(false)
  const lastLoadedAt = ref<number | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const isProfileComplete = computed(() => profileGate.value.complete && profileGate.value.emailVerified)
  const needsProfileGate = computed(() => isAuthenticated.value && !isProfileComplete.value)

  async function loadSession() {
    loading.value = true
    try {
      const result = await getSession()

      if (result.kind === 'completed') {
        const data: SessionInfo = result.data
        user.value = data.user
        profileGate.value = data.profileGate
        degraded.value = data.degraded
        permissions.value = data.permissions
        workspace.value = data.workspace
        lastLoadedAt.value = Date.now()
      } else {
        clearSession()
      }
    } finally {
      loading.value = false
    }
  }

  function clearSession() {
    user.value = null
    profileGate.value = { complete: false, emailVerified: false }
    degraded.value = false
    permissions.value = []
    workspace.value = null
    lastLoadedAt.value = null
  }

  async function logout() {
    try {
      await logoutAuth()
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
    workspace,
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
