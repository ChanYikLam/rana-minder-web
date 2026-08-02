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

// 二次确认：由父组件配合 HighRiskConfirm/ConfirmScope 使用；
// 本组件仅负责危险样式 + 触发确认流程，不重复实现弹窗。
// 若未配合确认组件，则直接用 window.confirm 兜底。
function onClick() {
  if (props.disabled) return
  if (!props.confirmTitle) {
    emit('confirm')
    return
  }
  // 简化交互：无独立确认组件时以原生确认兜底
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