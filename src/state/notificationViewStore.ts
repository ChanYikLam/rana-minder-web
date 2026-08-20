import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationApi } from '@/services'
import { errorCodeOf, type ErrorCode } from '@/services/error-map'

export const useNotificationViewStore = defineStore('notificationView', () => {
  const unreadCount = ref(0)
  const items = ref<{ id: string; type: string; title: string; body: string; read: boolean; createdAt: string; link: string | null; clubName: string | null }[]>([])
  const loading = ref(false)

  const hasUnread = computed(() => unreadCount.value > 0)

  async function loadUnreadCount() {
    const result = await notificationApi.getUnreadCount()
    if (result.kind === 'completed') {
      unreadCount.value = (result.data as { count: number }).count
    }
  }

  /** 返回 null 表示成功；失败时返回错误码，供页面 errorToPageState 区分 forbidden/error（P1-1：避免 Store 级可变状态竞态） */
  async function loadNotifications(cursor?: string): Promise<ErrorCode | null> {
    loading.value = true
    try {
      const result = await notificationApi.list({ cursor })
      if (result.kind === 'completed') {
        const data = result.data as { items: typeof items.value; nextCursor: string | null }
        if (cursor) {
          items.value.push(...data.items)
        } else {
          items.value = data.items
        }
        return null
      }
      return errorCodeOf(result)
    } finally {
      loading.value = false
    }
  }

  /** 返回 null 表示成功；失败时返回错误码（不抛异常，避免 openDetail 等调用方产生 unhandled rejection） */
  async function markRead(id: string): Promise<ErrorCode | null> {
    const result = await notificationApi.markRead(id)
    if (result.kind === 'completed') {
      const item = items.value.find((n) => n.id === id)
      if (item && !item.read) {
        item.read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
      return null
    }
    return errorCodeOf(result)
  }

  /** 写操作失败语义固定为 error（不区分 forbidden），返回错误码仅供调用方日志/提示使用 */
  async function markAllRead(): Promise<ErrorCode | null> {
    const result = await notificationApi.markAllRead()
    if (result.kind === 'completed') {
      items.value.forEach((n) => { n.read = true })
      unreadCount.value = 0
      return null
    }
    return errorCodeOf(result)
  }

  /** P2-16：登出/换账号时清空未读数与列表（session.clearSession 联动调用），避免旧账号数据残留到新会话 */
  function reset() {
    unreadCount.value = 0
    items.value = []
    loading.value = false
  }

  return {
    unreadCount,
    items,
    loading,
    hasUnread,
    loadUnreadCount,
    loadNotifications,
    markRead,
    markAllRead,
    reset,
  }
})
