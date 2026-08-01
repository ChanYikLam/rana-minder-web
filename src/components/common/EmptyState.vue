<script setup lang="ts">
import type { LucideIcon } from '@lucide/vue'
import { Inbox, SearchX, Archive, Lock } from '@lucide/vue'

interface Props {
  type?: 'no_data' | 'no_permission' | 'archived' | 'no_result'
  title: string
  description?: string
  actionLabel?: string
}

withDefaults(defineProps<Props>(), {
  type: 'no_data',
  description: '',
  actionLabel: '',
})

const emit = defineEmits<{ action: [] }>()

const iconMap: Record<string, LucideIcon> = {
  no_data: Inbox,
  no_permission: Lock,
  archived: Archive,
  no_result: SearchX,
}
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12" role="status">
    <div class="flex items-center justify-center w-24 h-24 mb-4 text-muted-foreground">
      <component :is="iconMap[type]" :size="48" />
    </div>
    <h3 class="text-lg font-medium text-primary mb-1" tabindex="-1">{{ title }}</h3>
    <p v-if="description" class="text-sm text-text-secondary text-center max-w-md">{{ description }}</p>
    <button
      v-if="actionLabel"
      class="mt-4 px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
