<script setup lang="ts">
import { computed } from 'vue'
import { Eye, Pencil, EyeOff, ShieldCheck } from '@lucide/vue'

export type FieldPermissionValue = 'read_write' | 'read_only' | 'hidden'

const props = defineProps<{
  permission: FieldPermissionValue
  source?: string
}>()

const config = computed(() => {
  switch (props.permission) {
    case 'read_only':
      return { icon: Eye, label: '只读', tone: 'info' }
    case 'hidden':
      return { icon: EyeOff, label: '隐藏', tone: 'neutral' }
    default:
      return { icon: Pencil, label: '可编辑', tone: 'success' }
  }
})

const toneClass = computed(() => {
  switch (props.permission) {
    case 'read_only': return 'text-info border-info/40 bg-info-subtle'
    case 'hidden': return 'text-text-secondary border-border-strong bg-subtle'
    default: return 'text-success border-success/40 bg-success-subtle'
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
    :class="toneClass"
    :title="props.source ? `权限来源：${props.source}` : undefined"
  >
    <component :is="config.icon" :size="10" aria-hidden="true" />
    {{ config.label }}
    <ShieldCheck v-if="props.source" :size="10" aria-hidden="true" />
  </span>
</template>