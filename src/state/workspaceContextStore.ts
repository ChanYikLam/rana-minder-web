import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ClubRole } from '@/types/domain'
import { organizationApi } from '@/services'
import { useSessionViewStore } from './sessionViewStore'

export const useWorkspaceContextStore = defineStore('workspaceContext', () => {
  const currentClubId = ref<string | null>(null)
  const currentClubName = ref<string>('')
  const currentRole = ref<ClubRole | null>(null)
  const currentPermissions = ref<string[]>([])
  /** 上下文所属用户 id：缓存按「用户 × 社团」维度，身份变化后强制重拉 */
  const currentUserId = ref<string | null>(null)
  const loading = ref(false)

  const hasWorkspace = computed(() => currentClubId.value !== null)

  function setWorkspace(
    clubId: string,
    clubName: string,
    role: ClubRole,
    permissions: string[],
    userId: string | null,
  ) {
    currentClubId.value = clubId
    currentClubName.value = clubName
    currentRole.value = role
    currentPermissions.value = permissions
    currentUserId.value = userId
  }

  async function loadWorkspace(clubId: string): Promise<boolean> {
    const session = useSessionViewStore()
    if (
      currentClubId.value === clubId &&
      currentRole.value &&
      // 会话未初始化（session.user 为 null）时不得命中缓存，避免复用上一身份的上下文
      currentUserId.value !== null &&
      currentUserId.value === session.user?.id
    ) {
      return true
    }

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
      session.user?.id ?? null,
    )
    return true
  }

  function clearWorkspace() {
    currentClubId.value = null
    currentClubName.value = ''
    currentRole.value = null
    currentPermissions.value = []
    currentUserId.value = null
  }

  function hasPermission(permission: string): boolean {
    return currentPermissions.value.includes(permission)
  }

  return {
    currentClubId,
    currentClubName,
    currentRole,
    currentPermissions,
    currentUserId,
    loading,
    hasWorkspace,
    setWorkspace,
    loadWorkspace,
    clearWorkspace,
    hasPermission,
  }
})
