import { computed } from 'vue'
import { useSessionViewStore } from '@/state/sessionViewStore'

/**
 * IDN-010/IDN-011: 资料门拦截期间全局写操作控制
 * 资料未补齐或邮箱未验证时，所有业务写操作按钮/入口必须禁用或隐藏
 * 只读页面和个人中心仍按上游规则开放
 */
export function useWriteGuard() {
  const session = useSessionViewStore()

  /** 是否允许执行写操作 */
  const canWrite = computed(() => {
    if (!session.isAuthenticated) return false
    return session.isProfileComplete
  })

  /** 写操作被禁用的原因（用于 tooltip/aria-describedby） */
  const writeDisabledReason = computed(() => {
    if (!session.isAuthenticated) return '请先登录'
    if (!session.profileGate.complete) return '请先补充个人资料'
    if (!session.profileGate.emailVerified) return '请先验证邮箱'
    return ''
  })

  return {
    canWrite,
    writeDisabledReason,
  }
}
