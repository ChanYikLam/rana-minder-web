import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SessionInfo, User, ProfileGate, WorkspaceInfo } from '@/types/domain'
import { getSession, logout as logoutAuth } from '@/services/auth'

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
    stopClock()
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
    degradedSince,
    permissions,
    workspace,
    loading,
    lastLoadedAt,
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
  }
})
