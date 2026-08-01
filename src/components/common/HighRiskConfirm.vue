<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ShieldAlert, ArrowRight, CheckCircle2, RefreshCw } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import Button from '../common/Button.vue'

interface TargetItem {
  id: string
  label: string
  detail?: string
}

interface Props {
  open: boolean
  title: string
  description: string
  targets: TargetItem[]
  impactSummary: string
  confirmLabel?: string
  cancelLabel?: string
  reauthRequired?: boolean
  reauthDeadline?: number
  executing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: '确认执行',
  cancelLabel: '取消',
  reauthRequired: false,
  reauthDeadline: 10 * 60 * 1000,
  executing: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const step = ref<'preview' | 'confirm' | 'executing' | 'done'>('preview')

watch(
  () => props.open,
  (open) => {
    if (open) step.value = 'preview'
  }
)

function handleNext() {
  if (step.value === 'preview') {
    step.value = 'confirm'
  }
}

function handleConfirm() {
  step.value = 'executing'
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}

const remainingSeconds = computed(() => {
  if (!props.reauthRequired) return 0
  return Math.ceil(props.reauthDeadline / 1000)
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-[480px]">
      <DialogHeader>
        <div class="flex items-center gap-2 mb-1">
          <div class="flex items-center justify-center w-8 h-8 rounded-full bg-warning-subtle text-warning">
            <ShieldAlert :size="18" />
          </div>
          <DialogTitle class="text-lg">{{ title }}</DialogTitle>
        </div>
        <DialogDescription class="text-sm text-text-secondary">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <!-- Step: Preview -->
      <div v-if="step === 'preview'" class="space-y-4">
        <div>
          <p class="text-sm font-medium text-primary mb-2">影响范围</p>
          <div class="rounded-lg border border-border p-3 space-y-2 max-h-48 overflow-y-auto">
            <div v-for="target in targets" :key="target.id" class="flex items-start gap-2 text-sm">
              <ArrowRight :size="14" class="mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span class="text-primary">{{ target.label }}</span>
                <span v-if="target.detail" class="text-text-secondary ml-2">{{ target.detail }}</span>
              </div>
            </div>
          </div>
          <p class="text-xs text-warning mt-2">{{ impactSummary }}</p>
        </div>

        <div v-if="reauthRequired" class="flex items-center gap-2 text-xs text-warning bg-warning-subtle rounded-md px-3 py-2">
          <ShieldAlert :size="14" />
          <span>此操作需要重新认证（剩余 {{ remainingSeconds }} 秒）</span>
        </div>
      </div>

      <!-- Step: Confirm -->
      <div v-else-if="step === 'confirm'" class="space-y-4">
        <div class="rounded-lg border border-warning bg-warning-subtle p-4">
          <p class="text-sm font-medium text-warning mb-1">请确认操作</p>
          <p class="text-xs text-text-secondary">此操作不可撤销，执行后将影响 {{ targets.length }} 个对象。</p>
        </div>
        <div class="text-sm text-text-secondary">
          <p>即将执行：<span class="font-medium text-primary">{{ title }}</span></p>
        </div>
      </div>

      <!-- Step: Executing -->
      <div v-else-if="step === 'executing'" class="py-8 text-center">
        <RefreshCw class="animate-spin text-primary mx-auto mb-3" :size="32" />
        <p class="text-sm text-text-secondary">正在执行...</p>
      </div>

      <!-- Step: Done -->
      <div v-else class="py-8 text-center">
        <CheckCircle2 class="text-success mx-auto mb-3" :size="32" />
        <p class="text-sm font-medium text-primary">操作完成</p>
      </div>

      <DialogFooter v-if="step === 'preview' || step === 'confirm'">
        <Button variant="outline" @click="handleCancel">{{ cancelLabel }}</Button>
        <Button v-if="step === 'preview'" @click="handleNext">下一步</Button>
        <Button v-else variant="destructive" :loading="executing" @click="handleConfirm">{{ confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
