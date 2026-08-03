<script setup lang="ts">
import { ref } from 'vue'
import { Undo2 } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

withDefaults(defineProps<{
  label?: string
  confirmText?: string
  disabled?: boolean
  disabledReason?: string
  loading?: boolean
}>(), {
  label: '撤回',
  confirmText: '确定要撤回该操作吗？确认后相关人员将重新查看。',
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  confirm: []
}>()

const ask = ref(false)

function onConfirm() {
  emit('confirm')
  ask.value = false
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <Button variant="outline" :disabled="disabled || loading" :loading="loading" @click="ask = !ask">
      <Undo2 :size="14" class="mr-1" />
      {{ label }}
    </Button>
    <template v-if="ask">
      <span class="text-xs text-text-secondary">{{ confirmText }}</span>
      <Button variant="destructive" size="sm" :disabled="loading" @click="onConfirm">确认撤回</Button>
      <Button variant="ghost" size="sm" @click="ask = false">取消</Button>
    </template>
  </div>
</template>