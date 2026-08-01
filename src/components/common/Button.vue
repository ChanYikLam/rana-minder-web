<script setup lang="ts">
import { computed, useAttrs, useId } from 'vue'
import { cn } from '@/lib/utils'
import { Loader2 } from '@lucide/vue'
import { Button as ShadcnButton } from '@/components/ui/button'

defineOptions({ inheritAttrs: false })

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

const attrs = useAttrs()
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
const disabledReasonId = `disabled-reason-${useId()}`
const hasDisabledReason = computed(() => isDisabled.value && Boolean(props.disabledReason))
const describedBy = computed(() => hasDisabledReason.value ? disabledReasonId : undefined)
</script>

<template>
  <div class="inline-flex flex-col items-start gap-1">
    <ShadcnButton
      v-bind="attrs"
      :variant="variant"
      :size="size"
      :type="type"
      :disabled="isDisabled"
      :aria-describedby="describedBy"
      :class="cn(computedSize)"
    >
      <Loader2 v-if="loading" :size="16" class="mr-1.5 animate-spin" aria-hidden="true" />
      <slot />
    </ShadcnButton>
    <p v-if="hasDisabledReason" :id="disabledReasonId" class="text-xs text-text-secondary">
      {{ disabledReason }}
    </p>
  </div>
</template>
