<script setup lang="ts">
import { computed } from 'vue'
import { Bell } from '@lucide/vue'

const props = withDefaults(defineProps<{
  count: number
  max?: number
  unread?: boolean
}>(), {
  max: 99,
  unread: true,
})

const display = computed(() => props.count > props.max ? `${props.max}+` : String(props.count))
</script>

<template>
  <span class="inline-flex items-center justify-center" :class="unread ? 'relative' : ''">
    <Bell :size="18" aria-hidden="true" />
    <span
      v-if="count > 0 && unread"
      class="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold rounded-full bg-accent text-text-on-accent"
      role="status"
    >
      {{ display }}
    </span>
  </span>
</template>