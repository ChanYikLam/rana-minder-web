import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ClubRole } from '@/types/domain'
import { organizationApi } from '@/services'

export const useWorkspaceContextStore = defineStore('workspaceContext', () => {
  const currentClubId = ref<string | null>(null)
  const currentClubName = ref<string>('')
  const currentRole = ref<ClubRole | null>(null)
  const currentPermissions = ref<string[]>([])
  const loading = ref(false)

  const hasWorkspace = computed(() => currentClubId.value !== null)

  function setWorkspace(clubId: string, clubName: string, role: ClubRole, permissions: string[]) {
    currentClubId.value = clubId
    currentClubName.value = clubName
    currentRole.value = role
    currentPermissions.value = permissions
  }

  async function loadWorkspace(clubId: string): Promise<boolean> {
    if (currentClubId.value === clubId && currentRole.value) return true

    loading.value = true
    const result = await organizationApi.getContext(clubId)
    loading.value = false

    if (result.kind !== 'completed') {
      clearWorkspace()
      return false
    }

    setWorkspace(
      result.data.clubId,
      result.data.clubName,
      result.data.role,
      result.data.permissions,
    )
    return true
  }

  function clearWorkspace() {
    currentClubId.value = null
    currentClubName.value = ''
    currentRole.value = null
    currentPermissions.value = []
  }

  function hasPermission(permission: string): boolean {
    return currentPermissions.value.includes(permission)
  }

  return {
    currentClubId,
    currentClubName,
    currentRole,
    currentPermissions,
    loading,
    hasWorkspace,
    setWorkspace,
    loadWorkspace,
    clearWorkspace,
    hasPermission,
  }
})
