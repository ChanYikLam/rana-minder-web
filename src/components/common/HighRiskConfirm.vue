<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { ShieldAlert, ArrowRight, CheckCircle2, RefreshCw, KeyRound, XCircle } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import Button from '../common/Button.vue'
import { useReauth, type ReauthResult } from '@/composables/useReauth'

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
  succeeded?: boolean
  errorMessage?: string
  /** 二次鉴权实现注入：父级传入后组件仅调用并消费结果，不再感知业务 IO；缺省走 useReauth */
  onReauth?: (password: string) => Promise<ReauthResult>
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: '确认执行',
  cancelLabel: '取消',
  reauthRequired: false,
  reauthDeadline: 10 * 60 * 1000,
  executing: false,
  succeeded: false,
  errorMessage: '',
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:errorMessage': [value: string]
  confirm: [proof?: string]
  cancel: []
  retry: []
}>()

const { reauth: defaultReauth } = useReauth()
// 注入：父级 onReauth 变化时跟随（computed），缺省走 useReauth
const performReauth = computed(() => props.onReauth ?? defaultReauth)

const step = ref<'preview' | 'confirm' | 'executing' | 'done'>('preview')

const reauthPassword = ref('')
const reauthError = ref('')
const reauthBusy = ref(false)

const openedAt = ref(Date.now())
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null

const isReauthExpired = computed(() => props.reauthRequired && remainingSeconds.value <= 0)

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

// 监听外部"已成功"信号：父组件在确认成功后置 succeeded=true → 进入 done
watch(
  () => props.succeeded,
  (succeeded) => {
    if (succeeded && step.value === 'executing') {
      step.value = 'done'
    }
  }
)

// 监听外部"执行中"信号：父组件把 executing 从 true 置为 false
// 只有当 succeeded 也为 true 时才进入 done；否则保持在 executing 并显示错误
watch(
  () => props.executing,
  (executing, wasExecuting) => {
    if (wasExecuting && !executing && step.value === 'executing') {
      if (props.succeeded) {
        step.value = 'done'
      } else if (props.errorMessage) {
        // 保持 executing 步骤但显示错误，等待父组件 retry 或关闭
      }
    }
  }
)

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
  // P2-2：重认证请求进行中时忽略重复触发（按钮 loading 与 Enter 键都要防）
  if (reauthBusy.value) return
  if (isReauthExpired.value) {
    reauthError.value = '认证已过期，请重新打开确认'
    return
  }
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
  try {
    const result = await performReauth.value(reauthPassword.value)
    if (result.kind === 'completed') {
      step.value = 'executing'
      emit('confirm', result.proof)
    } else {
      reauthError.value = result.message
    }
  } finally {
    reauthBusy.value = false
  }
}

function handleCancel() {
  emit('cancel')
  emit('update:open', false)
}

function handleRetry() {
  emit('update:errorMessage', '')
  reauthError.value = ''
  emit('retry')
  step.value = 'confirm'
}

const remainingSeconds = computed(() => {
  if (!props.reauthRequired) return 0
  const elapsed = now.value - openedAt.value
  return Math.max(0, Math.ceil((props.reauthDeadline - elapsed) / 1000))
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-[480px]" @pointerdown-outside.prevent @escape-key-down.prevent>
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

      <!-- Step: Executing（含失败错误状态） -->
      <div v-else-if="step === 'executing'" class="py-8 text-center">
        <template v-if="!executing && errorMessage">
          <XCircle class="text-danger mx-auto mb-3" :size="32" />
          <p class="text-sm font-medium text-danger mb-2">操作失败</p>
          <p class="text-xs text-text-secondary">{{ errorMessage }}</p>
        </template>
        <template v-else>
          <RefreshCw class="animate-spin text-primary mx-auto mb-3" :size="32" />
          <p class="text-sm text-text-secondary">正在执行...</p>
        </template>
      </div>

      <!-- Step: Done -->
      <div v-else class="py-8 text-center">
        <CheckCircle2 class="text-success mx-auto mb-3" :size="32" />
        <p class="text-sm font-medium text-primary">操作完成</p>
      </div>

      <DialogFooter v-if="step === 'done'">
        <Button variant="outline" @click="handleCancel">关闭</Button>
      </DialogFooter>

      <DialogFooter v-if="step === 'preview' || step === 'confirm'">
        <Button variant="outline" @click="handleCancel">{{ cancelLabel }}</Button>
        <Button v-if="step === 'preview'" @click="handleNext">下一步</Button>
        <Button v-else variant="destructive" :loading="executing || reauthBusy" :disabled="isReauthExpired" @click="handleConfirm">{{ reauthRequired ? '验证并执行' : confirmLabel }}</Button>
      </DialogFooter>

      <DialogFooter v-else-if="step === 'executing' && !executing && errorMessage">
        <Button variant="outline" @click="emit('update:open', false)">关闭</Button>
        <Button variant="destructive" @click="handleRetry">重试</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
