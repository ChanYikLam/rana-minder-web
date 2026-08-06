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
  /** 上下文所属用户 id：缓存按「用户 × 社团」维度，登录身份变化后强制重拉，杜绝复用上一身份的角色/权限 */
  const currentUserId = ref<string | null>(null)
  /** 当前用户在当前社团的成员 id（成员生命周期自审/自操作依据）；无法解析时为 null */
  const currentMemberId = ref<string | null>(null)
  const loading = ref(false)

  const hasWorkspace = computed(() => currentClubId.value !== null)

  function setWorkspace(clubId: string, clubName: string, role: ClubRole, permissions: string[], userId: string | null, memberId: string | null = null) {
    currentClubId.value = clubId
    currentClubName.value = clubName
    currentRole.value = role
    currentPermissions.value = permissions
    currentUserId.value = userId
    currentMemberId.value = memberId
  }

  /** 会话级同步：身份变化后，新身份有工作空间则按会话初始化（侧边栏导航用）；
   * 新身份无工作空间则清空上一身份残留的上下文；同一身份保留最近访问的社团上下文不重置。 */
  function syncWithSession(
    workspace: { clubId: string; clubName: string; role: ClubRole; memberId?: string | null } | null,
    permissions: string[],
    userId: string | null,
  ) {
    if (workspace && (!hasWorkspace.value || currentUserId.value !== userId)) {
      setWorkspace(workspace.clubId, workspace.clubName, workspace.role, permissions, userId, workspace.memberId ?? null)
    } else if (!workspace && hasWorkspace.value && currentUserId.value !== userId) {
      clearWorkspace()
    }
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
      result.data.memberId ?? null,
    )
    return true
  }

  function clearWorkspace() {
    currentClubId.value = null
    currentClubName.value = ''
    currentRole.value = null
    currentPermissions.value = []
    currentUserId.value = null
    currentMemberId.value = null
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
    currentMemberId,
    loading,
    hasWorkspace,
    setWorkspace,
    syncWithSession,
    loadWorkspace,
    clearWorkspace,
    hasPermission,
  }
})
