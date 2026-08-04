<script setup lang="ts">
import { computed } from 'vue'
import { Clock3, ArrowLeft } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

export interface NotificationDetailData {
  id: string
  title: string
  body: string
  createdAt: string
  type: string
  read?: boolean
  link?: string | null
  clubName?: string | null
  actions?: { label: string; key: string; variant?: 'default' | 'outline'; primary?: boolean }[]
}

const props = defineProps<{ notification: NotificationDetailData }>()

const emit = defineEmits<{
  back: []
  action: [key: string]
}>()

const timeLabel = computed(() => new Date(props.notification.createdAt).toLocaleString('zh-CN'))

const typeLabel = computed(() => {
  const map: Record<string, string> = {
    application: '报名',
    interview: '面试',
    invitation: '邀请',
    system: '系统',
    member: '成员',
    transition: '换届',
  }
  return map[props.notification.type] || props.notification.type
})
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <button
        type="button"
        class="text-xs text-text-secondary hover:text-primary flex items-center gap-1"
        aria-label="返回通知列表"
        @click="emit('back')"
      >
        <ArrowLeft :size="14" /> 返回
      </button>
      <span class="text-xs rounded-full border border-border px-2 py-0.5 text-text-secondary">{{ typeLabel }}</span>
      <span v-if="notification.clubName" class="text-xs rounded-full border border-border px-2 py-0.5 text-text-secondary">{{ notification.clubName }}</span>
      <span class="ml-auto text-xs text-text-secondary flex items-center gap-1">
        <Clock3 :size="12" aria-hidden="true" /> {{ timeLabel }}
      </span>
    </div>

    <div class="px-4 py-4">
      <h2 class="text-base font-semibold text-text-primary mb-2">{{ notification.title }}</h2>
      <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{{ notification.body }}</p>
    </div>

    <div v-if="notification.actions?.length" class="flex gap-2 border-t border-border px-4 py-3">
      <Button
        v-for="a in notification.actions"
        :key="a.key"
        :variant="a.primary ? 'default' : 'outline'"
        @click="emit('action', a.key)"
      >
        {{ a.label }}
      </Button>
    </div>
  </div>
</template>