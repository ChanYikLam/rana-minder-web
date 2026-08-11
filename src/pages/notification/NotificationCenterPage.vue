<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { NotificationBadge } from '@/components/feedback'
import { NotificationDetail, type NotificationDetailData } from '@/components/feedback'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import { errorToPageState } from '@/services/error-map'
import { navigateByLink } from '@/router/safeLink'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Bell, CheckCheck, ChevronRight } from '@lucide/vue'

const notifStore = useNotificationViewStore()
const state = ref<PageState>('loading')
const markingAll = ref(false)
const selectedId = ref<string | null>(null)
const clubFilter = ref('all')
const typeFilter = ref('all')

const TYPE_LABELS: Record<string, string> = {
  application: '报名',
  interview: '面试',
  invitation: '邀请',
  system: '系统',
  member: '成员',
  transition: '换届',
  conclusion: '结论',
  correction: '纠错',
  label_override: '标签改判',
  overall_not_admitted: '整体未录取',
}

const clubOptions = computed(() => {
  const names = new Set<string>()
  for (const n of notifStore.items) {
    if (n.clubName) names.add(n.clubName)
  }
  return Array.from(names).sort()
})

const filteredItems = computed(() =>
  notifStore.items.filter((n) => {
    if (clubFilter.value !== 'all' && n.clubName !== clubFilter.value) return false
    if (typeFilter.value !== 'all' && n.type !== typeFilter.value) return false
    return true
  })
)

const hasActiveFilter = computed(() => clubFilter.value !== 'all' || typeFilter.value !== 'all')

const selected = computed<NotificationDetailData | null>(() => {
  const item = notifStore.items.find((n) => n.id === selectedId.value)
  if (!item) return null
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    createdAt: item.createdAt,
    type: item.type,
    read: item.read,
    link: item.link,
    clubName: item.clubName,
    actions: item.link ? [{ label: '前往查看', key: 'navigate', primary: true }] : undefined,
  }
})

function openDetail(id: string) {
  const item = notifStore.items.find((n) => n.id === id)
  if (!item) return
  if (!item.read) {
    // 标记已读失败仅记录日志，不打断查看详情（避免 unhandled rejection）
    void notifStore.markRead(id).then((code) => {
      if (code) console.error('标记已读失败:', code)
    })
  }
  selectedId.value = id
}

function onDetailAction(key: string) {
  if (key === 'navigate' && selected.value?.link) {
    navigateByLink(selected.value.link)
  }
}

async function loadNotifications() {
  state.value = 'loading'
  // P1-1：loadNotifications 直接返回错误码（null=成功），不再依赖 Store 内部可变 lastError，避免竞态导致错误码错配
  const code = await notifStore.loadNotifications()
  if (code) {
    state.value = errorToPageState(code)
    console.error('加载通知失败:', code)
  } else {
    state.value = notifStore.items.length === 0 ? 'empty' : 'normal'
  }
}

async function handleMarkAllRead() {
  if (markingAll.value) return
  markingAll.value = true
  try {
    // P2-1：写操作失败语义固定为 error（不区分 forbidden），返回错误码仅用于日志
    // 不整页 loading：保留列表可见，仅按钮局部禁用
    const code = await notifStore.markAllRead()
    if (code) {
      toast.error('标记已读失败，请稍后重试')
      console.error('标记已读失败:', code)
    }
  } finally {
    markingAll.value = false
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
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-text-primary">站内信</h1>
          <NotificationBadge v-if="notifStore.hasUnread" :count="notifStore.unreadCount" />
        </div>
        <button
          v-if="notifStore.hasUnread"
          class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle disabled:opacity-60"
          :disabled="markingAll"
          @click="handleMarkAllRead"
        >
          <CheckCheck :size="16" /> {{ markingAll ? '处理中...' : '全部已读' }}
        </button>
      </div>

      <NotificationDetail
        v-if="selected"
        :notification="selected"
        class="mb-4"
        @back="selectedId = null"
        @action="onDetailAction"
      />

      <template v-else>

      <EmptyState
        v-if="notifStore.items.length === 0"
        type="no_data"
        title="暂无通知"
        description="当有新的报名、面试、邀请等消息时会显示在这里"
      />

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <select
            v-model="typeFilter"
            class="h-9 px-2.5 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            aria-label="按业务类型筛选"
          >
            <option value="all">全部类型</option>
            <option v-for="(label, key) in TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <select
            v-model="clubFilter"
            class="h-9 px-2.5 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            aria-label="按社团筛选"
          >
            <option value="all">全部社团</option>
            <option v-for="name in clubOptions" :key="name" :value="name">{{ name }}</option>
          </select>
          <button
            v-if="hasActiveFilter"
            class="text-xs text-primary hover:underline"
            @click="clubFilter = 'all'; typeFilter = 'all'"
          >
            清除筛选
          </button>
        </div>

        <EmptyState
          v-if="filteredItems.length === 0"
          type="no_data"
          title="当前筛选无匹配通知"
          description="请调整筛选条件或清除筛选"
        />

        <div v-else class="space-y-2">
          <Card
            v-for="item in filteredItems"
            :key="item.id"
            class="cursor-pointer"
            :selected="!item.read"
            @click="openDetail(item.id)"
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
                <p class="text-xs text-text-secondary mt-1 flex items-center gap-2">
                  <span class="rounded-full border border-border px-1.5 py-0.5">{{ TYPE_LABELS[item.type] || item.type }}</span>
                  <span v-if="item.clubName" class="rounded-full border border-border px-1.5 py-0.5">{{ item.clubName }}</span>
                  <span>{{ formatTime(item.createdAt) }}</span>
                </p>
              </div>
              <ChevronRight :size="16" class="text-text-secondary shrink-0" />
            </div>
          </Card>
        </div>
      </template>
      </template>
    </div>
  </PageStateBoundary>
</template>
