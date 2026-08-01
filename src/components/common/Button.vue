<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { Loader2 } from '@lucide/vue'
import { Button as ShadcnButton } from '@/components/ui/button'

interface Props {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
  loading?: boolean
  disabled?: boolean
  disabledReason?: string
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  loading: false,
  disabled: false,
  type: 'button',
})

const sizeMap = {
  default: 'h-10 px-4 text-sm',
  xs: 'h-6 px-2 text-xs',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-10 w-10',
  'icon-xs': 'h-6 w-6',
  'icon-sm': 'h-8 w-8',
  'icon-lg': 'h-12 w-12',
}

const computedSize = computed(() => sizeMap[props.size])
const isDisabled = computed(() => props.disabled || props.loading)

const describedBy = computed(() => {
  if (props.disabled && props.disabledReason) return 'disabled-reason'
  return undefined
})
</script>

<template>
  <ShadcnButton
    :variant="variant"
    :size="size"
    :type="type"
    :disabled="isDisabled"
    :aria-describedby="describedBy"
    :class="cn(computedSize)"
  >
    <Loader2 v-if="loading" :size="16" class="mr-1.5 animate-spin" aria-hidden="true" />
    <slot />
    <span v-if="disabled && disabledReason" id="disabled-reason" class="sr-only">{{ disabledReason }}</span>
  </ShadcnButton>
</template>
