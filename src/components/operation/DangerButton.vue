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

// 二次确认：父组件可选配 HighRiskConfirm/ConfirmScope 承载弹窗。
// 未接入确认组件时，以原生 window.confirm 兜底（按 confirmTitle 确认）。
function onClick() {
  if (props.disabled) return
  const required = !!props.confirmTitle
  if (required && !window.confirm(props.confirmDescription || `确认要执行「${props.confirmTitle}」吗？`)) {
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