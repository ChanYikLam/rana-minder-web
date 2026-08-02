<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

const props = withDefaults(defineProps<{
  title?: string
  message?: string
  compact?: boolean
}>(), {
  title: '加载失败',
})

const emit = defineEmits<{
  retry: []
}>()

const message = () => props.message || '数据加载失败，请稍后重试或刷新页面。'
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3"
    :class="compact ? 'max-w-md' : ''"
    role="alert"
  >
    <AlertTriangle :size="20" class="text-danger shrink-0 mt-0.5" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-danger">{{ title }}</p>
      <p class="text-sm text-text-secondary mt-0.5">{{ message() }}</p>
    </div>
    <Button variant="outline" size="sm" @click="emit('retry')">重试</Button>
  </div>
</template>