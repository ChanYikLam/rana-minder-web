<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { ShieldAlert, ArrowRight, CheckCircle2, RefreshCw, KeyRound } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import Button from '../common/Button.vue'
import { post } from '@/services/client'

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

const reauthPassword = ref('')
const reauthError = ref('')
const reauthBusy = ref(false)

// 重认证倒计时：从弹窗打开起计时，每秒刷新
const openedAt = ref(Date.now())
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      step.value = 'preview'
      reauthPassword.value = ''
      reauthError.value = ''
      openedAt.value = Date.now()
      now.value = Date.now()
      stopCountdown()
      if (props.reauthRequired) {
        countdownTimer = setInterval(() => {
          now.value = Date.now()
        }, 1000)
      }
    } else {
      stopCountdown()
    }
  },
  { immediate: true }
)

onBeforeUnmount(stopCountdown)

function handleNext() {
  if (step.value === 'preview') {
    step.value = 'confirm'
  }
}

async function handleConfirm() {
  if (!props.reauthRequired) {
    step.value = 'executing'
    emit('confirm')
    return
  }
  // 需要先完成密码重认证
  if (!reauthPassword.value) {
    reauthError.value = '请输入密码完成身份验证'
    return
  }
  reauthBusy.value = true
  reauthError.value = ''
  const result = await post('/auth/reauth', { password: reauthPassword.value })
  reauthBusy.value = false
  if (result.kind === 'completed') {
    step.value = 'executing'
    emit('confirm')
  } else if (result.kind === 'rejected' && result.error) {
    const fieldMsg = (result.error as { fieldErrors?: Record<string, string[]> }).fieldErrors?.password?.[0]
    reauthError.value = fieldMsg || (result.error as { message?: string }).message || '密码错误，请重试'
  } else {
    reauthError.value = '验证失败，请稍后重试'
  }
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}

const remainingSeconds = computed(() => {
  if (!props.reauthRequired) return 0
  const elapsed = now.value - openedAt.value
  return Math.max(0, Math.ceil((props.reauthDeadline - elapsed) / 1000))
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

        <slot name="extra" />

        <div v-if="reauthRequired" class="space-y-2">
          <label class="block text-sm font-medium text-text-primary flex items-center gap-1.5">
            <KeyRound :size="14" /> 重新认证（剩余 {{ remainingSeconds }} 秒）
          </label>
          <input
            v-model="reauthPassword"
            type="password"
            class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            :class="reauthError ? 'border-danger' : ''"
            placeholder="请输入登录密码"
            @keyup.enter="handleConfirm"
          />
          <p v-if="reauthError" class="text-xs text-danger" role="alert">{{ reauthError }}</p>
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
        <Button v-else variant="destructive" :loading="executing || reauthBusy" @click="handleConfirm">{{ reauthRequired ? '验证并执行' : confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
