<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import type { PageState } from '@/types/machine'
import { Bell, CheckCheck, ChevronRight } from '@lucide/vue'

const notifStore = useNotificationViewStore()
const state = ref<PageState>('loading')

async function loadNotifications() {
  state.value = 'loading'
  try {
    await notifStore.loadNotifications()
    state.value = notifStore.items.length === 0 ? 'normal' : 'normal'
  } catch {
    state.value = 'error'
  }
}

async function handleMarkAllRead() {
  try {
    state.value = 'loading'
    await notifStore.markAllRead()
    state.value = 'normal'
  } catch {
    state.value = 'error'
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(loadNotifications)
</script>

<template>
  <PageStateBoundary :state="state" title="站内信" @retry="loadNotifications">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">站内信</h1>
        <button
          v-if="notifStore.hasUnread"
          class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle"
          @click="handleMarkAllRead"
        >
          <CheckCheck :size="16" /> 全部已读
        </button>
      </div>

      <EmptyState
        v-if="notifStore.items.length === 0"
        type="no_data"
        title="暂无通知"
        description="当有新的报名、面试、邀请等消息时会显示在这里"
      />

      <div v-else class="space-y-2">
        <Card
          v-for="item in notifStore.items"
          :key="item.id"
          class="cursor-pointer"
          :selected="!item.read"
          @click="!item.read && notifStore.markRead(item.id); item.link && $router.push(item.link)"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
              :class="item.read ? 'bg-muted text-text-secondary' : 'bg-primary-subtle text-primary'"
            >
              <Bell :size="18" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-text-primary truncate">{{ item.title }}</p>
                <span v-if="!item.read" class="w-2 h-2 rounded-full bg-accent shrink-0" aria-label="未读" />
              </div>
              <p class="text-sm text-text-secondary mt-0.5 line-clamp-2">{{ item.body }}</p>
              <p class="text-xs text-text-secondary mt-1">{{ formatTime(item.createdAt) }}</p>
            </div>
            <ChevronRight :size="16" class="text-text-secondary shrink-0" />
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
