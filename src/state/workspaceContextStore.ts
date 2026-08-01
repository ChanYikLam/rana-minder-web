import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ClubRole } from '@/types/domain'

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
    clearWorkspace,
    hasPermission,
  }
})
