<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { resolveStatusLabel } from './stateLabels'

interface Props {
  status: string
  label?: string
}

const props = defineProps<Props>()

const config = computed(() => {
  const c = resolveStatusLabel(props.status)
  return c || { variant: 'neutral' as const, label: props.label || props.status }
})
</script>

<template>
  <StatusBadge :variant="config.variant" :label="config.label" />
</template>