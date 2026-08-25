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

  // M-2：工作空间加载代次——并发 loadWorkspace 时仅最新一次可写回 store，
  // 旧请求的响应（哪怕晚到）不得覆盖新请求已写入的状态，避免跨社团快速切换时 store 与 UI 不一致
  let loadGeneration = 0
  // M-2：同 clubId 在飞请求去重——同一社团并发点击复用单次 API 调用，
  // 避免重复请求 + 同一结果被多个调用方分别处理。
  // 同时记录该请求捕获的会话身份：仅在飞请求与当前身份一致时才可复用，
  // 否则（期间换账号/登出）直接复用会返回过期的 false，导致 ClubSwitcher 静默无响应
  const inFlightByClub = new Map<string, { promise: Promise<boolean>; userId: string | null }>()

  const session = useSessionViewStore()

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
    if (
      currentClubId.value === clubId &&
      currentRole.value &&
      // 会话未初始化（session.user 为 null）时不得命中缓存，避免复用上一身份的上下文
      currentUserId.value !== null &&
      currentUserId.value === session.user?.id
    ) {
      return true
    }

    // M-2：同 clubId 的并发请求复用同一在飞 Promise，避免重复请求。
    // 但仅当在飞请求与当前会话身份一致时才复用；若在飞请求属于旧身份（期间已换账号/登出），
    // 其返回结果必为 false，复用会导致本次点击静默失败，故应发起一次新请求（并使其代次递增）
    const existing = inFlightByClub.get(clubId)
    if (existing && existing.userId === (session.user?.id ?? null)) return existing.promise

    // M-2：捕获本次请求的代次与会话身份——请求返回后逐一校验；
    // 任一变化（被新请求取代 / 会话身份切换）则本次结果视为过期，不写回 store
    const myGen = ++loadGeneration
    const inFlightUserId = session.user?.id ?? null
    loading.value = true
    const promise = (async () => {
      try {
        const result = await organizationApi.getContext(clubId)

        // M-2：代次校验——后发请求（不同 clubId）已使 loadGeneration 递增，
        // 本次响应视为过期，不写回 store，避免旧上下文覆盖新请求状态
        if (myGen !== loadGeneration) return false
        // M-2：会话身份校验——请求期间发生换账号/登出，捕获的 userId 与当前不一致，
        // 结果丢弃（不写回、不清空），避免旧身份响应污染新身份上下文
        if (inFlightUserId !== (session.user?.id ?? null)) return false

        if (result.kind !== 'completed') {
          // 评审 I4：异常时也要复位 loading，避免切社团转圈卡死
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
      } finally {
        // M-2：仅最新代次的请求复位 loading，过期请求（已被新请求取代）不得干预新请求的 loading 状态
        if (myGen === loadGeneration) {
          loading.value = false
        }
        // 仅删除仍指向本次请求的 map 条目：避免旧身份请求晚返回时误删新身份请求刚写入的条目，
        // 破坏新请求的 in-flight 去重
        if (inFlightByClub.get(clubId)?.promise === promise) {
          inFlightByClub.delete(clubId)
        }
      }
    })()

    inFlightByClub.set(clubId, { promise, userId: inFlightUserId })
    return promise
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
