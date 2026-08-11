<script setup lang="ts">
import Button from '@/components/common/Button.vue'

const props = withDefaults(defineProps<{
  label?: string
  disabled?: boolean
  disabledReason?: string
  confirmTitle?: string
  confirmDescription?: string
  loading?: boolean
}>(), {
  label: '危险操作',
  disabled: false,
})

const emit = defineEmits<{
  confirm: []
}>()

// P2-4：危险操作一律需确认。父组件可选配 HighRiskConfirm/ConfirmScope 承载弹窗；
// 未接入确认组件时，以原生 window.confirm 兜底（缺 confirmTitle 时用默认文案，零确认直接执行）。
function onClick() {
  if (props.disabled) return
  const title = props.confirmTitle || '执行危险操作'
  if (!window.confirm(props.confirmDescription || `确认要执行「${title}」吗？`)) {
    return
  }
  emit('confirm')
}
</script>

<template>
  <Button
    variant="destructive"
    :disabled="disabled"
    :disabled-reason="disabledReason"
    :loading="loading"
    @click="onClick"
  >
    <slot>{{ label }}</slot>
  </Button>
</template>