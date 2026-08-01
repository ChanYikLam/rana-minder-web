<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  selected?: boolean
  disabled?: boolean
  hoverable?: boolean
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  disabled: false,
  hoverable: true,
  padding: 'p-4',
})

const classes = computed(() =>
  cn(
    'rounded-lg border bg-elevated transition-colors',
    props.padding,
    props.selected && 'border-primary border-l-[3px] shadow-sm',
    !props.selected && 'border-border',
    props.hoverable && !props.disabled && 'hover:border-strong hover:shadow-sm cursor-pointer',
    props.disabled && 'opacity-60 cursor-not-allowed'
  )
)
</script>

<template>
  <div :class="classes" :aria-disabled="disabled">
    <slot />
  </div>
</template>
