<script setup lang="ts">
import { RefreshCw, CheckCircle2, AlertTriangle, GitCompare } from '@lucide/vue'

interface Props {
  status: 'syncing' | 'synced' | 'sync_failed' | 'conflict'
  label?: string
}

const props = defineProps<Props>()

const config = {
  syncing: {
    icon: RefreshCw,
    text: '同步中',
    color: 'text-warning',
    spin: true,
  },
  synced: {
    icon: CheckCircle2,
    text: '已同步',
    color: 'text-success',
    spin: false,
  },
  sync_failed: {
    icon: AlertTriangle,
    text: '同步失败',
    color: 'text-danger',
    spin: false,
  },
  conflict: {
    icon: GitCompare,
    text: '数据冲突',
    color: 'text-warning',
    spin: false,
  },
}

const c = config[props.status]
</script>

<template>
  <span
    class="inline-flex items-center gap-1 text-xs font-medium"
    :class="c.color"
    role="status"
    :aria-label="label || c.text"
  >
    <component :is="c.icon" :size="14" :class="c.spin ? 'animate-spin' : ''" aria-hidden="true" />
    <span>{{ label || c.text }}</span>
  </span>
</template>
