<script setup lang="ts">
import { computed } from 'vue'
import { CircleDot, CheckCircle2, AlertCircle, Clock3 } from '@lucide/vue'

export interface TimelineEntry {
  id: string
  time: string
  title: string
  description?: string
  kind?: 'default' | 'success' | 'warning' | 'danger' | 'pending'
  by?: string
}

const props = defineProps<{
  items: TimelineEntry[]
  label?: string
}>()

const sorted = computed(() =>
  [...props.items].sort((a, b) => {
    const ta = new Date(a.time).getTime()
    const tb = new Date(b.time).getTime()
    return ta - tb
  }),
)

function entryIcon(kind: TimelineEntry['kind'] = 'default') {
  switch (kind) {
    case 'success': return CheckCircle2
    case 'warning': return AlertCircle
    case 'danger': return AlertCircle
    case 'pending': return Clock3
    default: return CircleDot
  }
}
</script>

<template>
  <ol class="relative border-l border-border pl-4 space-y-4" :aria-label="label || '时间线'">
    <li v-for="item in sorted" :key="item.id" class="relative">
      <span
        class="absolute -left-[21px] flex items-center justify-center w-4 h-4 rounded-full bg-background"
        :class="item.kind === 'success' ? 'text-success' : item.kind === 'danger' ? 'text-danger' : item.kind === 'warning' ? 'text-warning' : 'text-primary'"
      >
        <component
          :is="entryIcon(item.kind)"
          :size="16"
          aria-hidden="true"
        />
      </span>
      <div class="pt-0.5">
        <div class="flex items-center gap-2">
          <p class="text-sm font-medium text-text-primary">{{ item.title }}</p>
          <span v-if="item.by" class="text-xs text-text-secondary">· {{ item.by }}</span>
        </div>
        <p v-if="item.description" class="text-sm text-text-secondary mt-0.5">{{ item.description }}</p>
        <p class="text-xs text-text-secondary mt-0.5">{{ item.time }}</p>
      </div>
    </li>
  </ol>
</template>