import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SessionInfo, User, ProfileGate, WorkspaceInfo } from '@/types/domain'
import { getSession, logout as logoutAuth } from '@/services/auth'

/** 社团切换后的会话权限集：保留 platform:* 等全局权限，仅以新社团权限覆盖 club:* 域 */
export function mergeClubPermissions(current: readonly string[], clubPermissions: readonly string[]): string[] {
  return [...current.filter((p) => !p.startsWith('club:')), ...clubPermissions]
}

export const useSessionViewStore = defineStore('sessionView', () => {
  const user = ref<User | null>(null)
  const profileGate = ref<ProfileGate>({ complete: false, emailVerified: false })
  const degraded = ref(false)
  /** 降级起点时间戳（毫秒）；SRS-FAIL-001 15 分钟窗口 */
  const degradedSince = ref<number | null>(null)
  const permissions = ref<string[]>([])
  const workspace = ref<WorkspaceInfo | null>(null)
  const loading = ref(false)
  const lastLoadedAt = ref<number | null>(null)
  /** 最近一次会话加载的失败信息（登录页据此展示具体原因，如账号禁用） */
  const lastError = ref<string | null>(null)

  /** SRS-FAIL-001 最小白名单窗口：15 分钟 */
  const DEGRADED_WINDOW_MS = 15 * 60 * 1000

  /** 秒级时钟：驱动白名单窗口计数，避免离开页面后倒计时静止 */
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null

  function startClock() {
    if (ticker) return
    ticker = setInterval(() => {
      now.value = Date.now()
    }, 30 * 1000)
  }

  function stopClock() {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  const isAuthenticated = computed(() => user.value !== null)
  const isProfileComplete = computed(() => profileGate.value.complete && profileGate.value.emailVerified)
  const needsProfileGate = computed(() => isAuthenticated.value && !isProfileComplete.value)

  /** 是否处于 15 分钟白名单窗口内（故障前已可信登录的既有会话） */
  const inDegradedWindow = computed(() => {
    if (!degraded.value || degradedSince.value == null) return false
    return now.value - degradedSince.value < DEGRADED_WINDOW_MS
  })

  /** 剩余窗口毫秒（窗口外为 0） */
  const degradedWindowRemainingMs = computed(() => {
    if (!degraded.value || degradedSince.value == null) return 0
    return Math.max(0, DEGRADED_WINDOW_MS - (now.value - degradedSince.value))
  })

  /** 降级窗口是否已过期（供路由侧强制跳转 P-GEN-03） */
  const degradedWindowExpired = computed(
    () => degraded.value && degradedSince.value != null && now.value - degradedSince.value >= DEGRADED_WINDOW_MS,
  )

  /** 窗口状态变化时同步时钟：降级开启→启动 ticker，恢复→停止 */
  function syncClock() {
    if (degraded.value && degradedSince.value != null) startClock()
    else stopClock()
  }

  async function loadSession() {
    loading.value = true
    lastError.value = null
    try {
      const result = await getSession()

      if (result.kind === 'completed') {
        const data: SessionInfo = result.data
        user.value = data.user
        profileGate.value = data.profileGate
        degraded.value = data.degraded
        degradedSince.value =
          data.degraded && data.degradedSince
            ? new Date(data.degradedSince).getTime()
            : data.degraded
              ? (degradedSince.value ?? Date.now())
              : null
        permissions.value = data.permissions
        workspace.value = data.workspace
        lastLoadedAt.value = Date.now()
        syncClock()
      } else {
        lastError.value = 'error' in result && result.error ? result.error.message : null
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
    degradedSince.value = null
    permissions.value = []
    workspace.value = null
    lastLoadedAt.value = null
    lastError.value = null
    stopClock()
  }

  async function logout() {
    try {
      await logoutAuth()
    } finally {
      clearSession()
    }
  }

  /** 同步当前工作空间（如社团切换后），保持与 workspaceContextStore 单源一致；
   * 传入信息缺省的可选字段（如 memberId）保留原值，避免自审逻辑（免职/审批/退社自审）失效 */
  function setWorkspaceInfo(info: WorkspaceInfo) {
    workspace.value = { ...workspace.value, ...info }
  }

  /** 同步会话级权限（社团切换后按新社团上下文刷新，避免 session.hasPermission 沿用旧社团权限集） */
  function setPermissions(next: string[]) {
    permissions.value = next
  }

  function hasPermission(permission: string): boolean {
    return permissions.value.includes(permission)
  }

  return {
    user,
    profileGate,
    degraded,
    degradedSince,
    permissions,
    workspace,
    loading,
    lastLoadedAt,
    lastError,
    isAuthenticated,
    isProfileComplete,
    needsProfileGate,
    inDegradedWindow,
    degradedWindowRemainingMs,
    degradedWindowExpired,
    loadSession,
    clearSession,
    logout,
    hasPermission,
    setWorkspaceInfo,
    setPermissions,
  }
})
