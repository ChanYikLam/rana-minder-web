<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle, Clock3, CheckCircle2, RefreshCw, XCircle } from '@lucide/vue'

const props = withDefaults(defineProps<{
  status: 'uploading' | 'checking' | 'saving' | 'syncing' | 'generating' | 'approved' | 'pending' | 'failed'
  label?: string
}>(), {})

const config = computed(() => {
  switch (props.status) {
    case 'checking':
    case 'generating':
      return { icon: RefreshCw, cls: 'bg-warning-subtle text-warning', spin: true }
    case 'uploading':
    case 'syncing':
      return { icon: LoaderCircle, cls: 'bg-info-subtle text-info', spin: true }
    case 'pending':
      return { icon: Clock3, cls: 'bg-subtle text-text-secondary', spin: false }
    case 'approved':
      return { icon: CheckCircle2, cls: 'bg-success-subtle text-success', spin: false }
    case 'failed':
      return { icon: XCircle, cls: 'bg-danger-subtle text-danger', spin: false }
    default:
      return { icon: LoaderCircle, cls: 'bg-subtle text-text-secondary', spin: false }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="config.cls"
    role="status"
  >
    <component :is="config.icon" :size="13" :class="config.spin ? 'animate-spin' : ''" aria-hidden="true" />
    <span>{{ label || status }}</span>
    <span class="sr-only">{{ status }}</span>
  </span>
</template>