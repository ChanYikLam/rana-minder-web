import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationApi } from '@/services'

export const useNotificationViewStore = defineStore('notificationView', () => {
  const unreadCount = ref(0)
  const items = ref<{ id: string; type: string; title: string; body: string; read: boolean; createdAt: string; link: string | null }[]>([])
  const loading = ref(false)

  const hasUnread = computed(() => unreadCount.value > 0)

  async function loadUnreadCount() {
    const result = await notificationApi.getUnreadCount()
    if (result.kind === 'completed') {
      unreadCount.value = (result.data as { count: number }).count
    }
  }

  async function loadNotifications(cursor?: string) {
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
      } else {
        // 失败时显式抛出，让上层 try/catch 能感知到错误
        throw new Error('load notifications failed')
      }
    } finally {
      loading.value = false
    }
  }

  async function markRead(id: string) {
    const result = await notificationApi.markRead(id)
    if (result.kind === 'completed') {
      const item = items.value.find((n) => n.id === id)
      if (item && !item.read) {
        item.read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } else {
      throw new Error('mark read failed')
    }
  }

  async function markAllRead() {
    const result = await notificationApi.markAllRead()
    if (result.kind === 'completed') {
      items.value.forEach((n) => { n.read = true })
      unreadCount.value = 0
    } else {
      throw new Error('mark all read failed')
    }
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
  }
})
