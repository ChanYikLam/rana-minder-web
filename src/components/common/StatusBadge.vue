<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariant = cva(
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-success-subtle text-success',
        danger: 'bg-danger-subtle text-danger',
        warning: 'bg-warning-subtle text-warning',
        info: 'bg-info-subtle text-info',
        neutral: 'bg-muted text-text-secondary',
        selected: 'bg-primary-subtle text-primary',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
)

type BadgeVariant = VariantProps<typeof badgeVariant>['variant']

interface Props {
  variant?: BadgeVariant
  label: string
  icon?: unknown
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
})

const classes = computed(() => cn(badgeVariant({ variant: props.variant })))
</script>

<template>
  <span :class="classes" role="status">
    <component v-if="icon" :is="icon" :size="12" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>
