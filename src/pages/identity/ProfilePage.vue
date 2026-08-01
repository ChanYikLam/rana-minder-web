<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { z } from 'zod'
import { PageStateBoundary } from '@/components/common'
import { get, put, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { MailCheck, ShieldCheck, RefreshCw, CheckCircle2 } from '@lucide/vue'

interface Profile {
  studentId: string
  name: string
  email: string
  phone: string
  emailVerified: boolean
  profileComplete: boolean
}

const state = ref<PageState>('loading')
const error = ref<{ code: string; message: string } | null>(null)
const profile = ref<Profile | null>(null)
const version = ref(0)

const editing = ref(false)
const formEmail = ref('')
const formPhone = ref('')
const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const submitError = ref<string | null>(null)

// 邮箱验证
const showVerify = ref(false)
const verifyCode = ref('')
const verifyError = ref('')
const codeSent = ref(false)
const sendingCode = ref(false)
const verifying = ref(false)

const profileSchema = z.object({
  email: z.string().email('请输入正确的邮箱格式'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的中国大陆手机号'),
})

async function loadProfile() {
  state.value = 'loading'
  error.value = null
  const result = await get<Profile>('/auth/profile')
  if (result.kind === 'completed') {
    profile.value = result.data
    version.value = 1
    state.value = 'normal'
  } else if (result.kind === 'rejected') {
    state.value = result.error.code.startsWith('IFC-ERR-00') && ['IFC-ERR-001', 'IFC-ERR-002', 'IFC-ERR-003'].includes(result.error.code)
      ? 'forbidden'
      : 'error'
    error.value = result.error
  } else {
    state.value = 'error'
    error.value = { code: 'IFC-ERR-016', message: '加载失败' }
  }
}

function startEdit() {
  if (!profile.value) return
  formEmail.value = profile.value.email
  formPhone.value = profile.value.phone
  formErrors.value = {}
  submitError.value = null
  editing.value = true
}

async function handleSave() {
  formErrors.value = {}
  submitError.value = null

  const parsed = profileSchema.safeParse({ email: formEmail.value, phone: formPhone.value })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0])
      if (!formErrors.value[field]) formErrors.value[field] = issue.message
    }
    return
  }

  submitting.value = true
  const result = await put<Profile>('/auth/profile', parsed.data, { expectedVersion: version.value })
  submitting.value = false

  if (result.kind === 'completed') {
    profile.value = result.data
    editing.value = false
    version.value += 1
  } else if (result.kind === 'concurrency_conflict') {
    submitError.value = '资料已被其他会话修改，请刷新后重试'
  } else if (result.kind === 'rejected') {
    if (result.error.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.error.fieldErrors)) {
        formErrors.value[field] = msgs[0]
      }
    } else {
      submitError.value = result.error.message
    }
  } else {
    submitError.value = '保存失败，请稍后重试'
  }
}

async function handleSendCode() {
  if (sendingCode.value) return
  sendingCode.value = true
  const result = await post<{ sent: boolean }>('/auth/profile/send-email-code')
  sendingCode.value = false
  if (result.kind === 'completed') {
    codeSent.value = true
  }
}

async function handleVerify() {
  if (verifying.value) return
  verifyError.value = ''
  verifying.value = true
  const result = await post<{ emailVerified: boolean }>('/auth/profile/verify-email', { code: verifyCode.value })
  verifying.value = false
  if (result.kind === 'completed') {
    if (profile.value) profile.value.emailVerified = true
    showVerify.value = false
    verifyCode.value = ''
    codeSent.value = false
  } else if (result.kind === 'rejected') {
    verifyError.value = result.error.fieldErrors?.code?.[0] || result.error.message
  }
}

const readonlyFields = computed(() =>
  profile.value
    ? [
        { label: '学号', value: profile.value.studentId, hint: '同步自统一身份认证' },
        { label: '姓名', value: profile.value.name, hint: '同步自统一身份认证' },
      ]
    : []
)

onMounted(loadProfile)
</script>

<template>
  <PageStateBoundary
    :state="state"
    title="个人资料"
    :error="error"
    error-message="资料加载失败"
    @retry="loadProfile"
  >
    <div class="max-w-2xl mx-auto" v-if="profile">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-primary">个人资料</h1>
        <button
          v-if="!editing"
          class="px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors"
          @click="startEdit"
        >
          编辑资料
        </button>
      </div>

      <!-- 只读字段（同步自 Casdoor） -->
      <div class="rounded-lg border border-border bg-elevated mb-4">
        <div class="px-4 py-3 border-b border-border flex items-center gap-2">
          <ShieldCheck :size="16" class="text-primary" />
          <span class="text-sm font-medium text-primary">身份信息</span>
        </div>
        <dl class="divide-y divide-border">
          <div v-for="field in readonlyFields" :key="field.label" class="px-4 py-3 flex items-center justify-between">
            <dt class="text-sm text-text-secondary">{{ field.label }}</dt>
            <dd class="text-sm text-primary font-medium">
              {{ field.value }}
              <span class="block text-xs text-muted-foreground font-normal">{{ field.hint }}</span>
            </dd>
          </div>
        </dl>
      </div>

      <!-- 可编辑字段 -->
      <div class="rounded-lg border border-border bg-elevated mb-4">
        <div class="px-4 py-3 border-b border-border flex items-center justify-between">
          <span class="text-sm font-medium text-primary">联系方式</span>
          <span v-if="profile.emailVerified" class="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 :size="14" /> 邮箱已验证
          </span>
          <button
            v-else
            class="inline-flex items-center gap-1 text-xs text-warning hover:underline"
            @click="showVerify = true"
          >
            <MailCheck :size="14" /> 验证邮箱
          </button>
        </div>

        <!-- 展示模式 -->
        <dl v-if="!editing" class="divide-y divide-border">
          <div class="px-4 py-3 flex items-center justify-between">
            <dt class="text-sm text-text-secondary">邮箱</dt>
            <dd class="text-sm text-primary font-medium">{{ profile.email }}</dd>
          </div>
          <div class="px-4 py-3 flex items-center justify-between">
            <dt class="text-sm text-text-secondary">手机号</dt>
            <dd class="text-sm text-primary font-medium">{{ profile.phone }}</dd>
          </div>
        </dl>

        <!-- 编辑模式 -->
        <div v-else class="p-4 space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-primary mb-1">
              邮箱 <span class="text-danger">*</span>
            </label>
            <input
              id="email"
              v-model="formEmail"
              type="email"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors.email ? 'border-danger' : 'border-border'"
              :aria-invalid="!!formErrors.email"
              aria-describedby="email-error"
            />
            <p v-if="formErrors.email" id="email-error" class="mt-1 text-xs text-danger" role="alert">
              {{ formErrors.email }}
            </p>
          </div>
          <div>
            <label for="phone" class="block text-sm font-medium text-primary mb-1">
              手机号 <span class="text-danger">*</span>
            </label>
            <input
              id="phone"
              v-model="formPhone"
              type="tel"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors.phone ? 'border-danger' : 'border-border'"
              :aria-invalid="!!formErrors.phone"
              aria-describedby="phone-error"
            />
            <p v-if="formErrors.phone" id="phone-error" class="mt-1 text-xs text-danger" role="alert">
              {{ formErrors.phone }}
            </p>
          </div>

          <p v-if="submitError" class="text-sm text-danger" role="alert">{{ submitError }}</p>

          <div class="flex gap-2 pt-2">
            <button
              class="px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
              :disabled="submitting"
              @click="handleSave"
            >
              {{ submitting ? '保存中...' : '保存' }}
            </button>
            <button
              class="px-4 py-2 rounded-md border border-border text-primary text-sm hover:bg-subtle transition-colors"
              :disabled="submitting"
              @click="editing = false"
            >
              取消
            </button>
          </div>
        </div>
      </div>

      <!-- 邮箱验证面板 -->
      <div v-if="showVerify" class="rounded-lg border border-accent bg-accent-subtle p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <MailCheck :size="18" class="text-warning" />
          <span class="text-sm font-medium text-primary">验证邮箱</span>
        </div>
        <p class="text-xs text-text-secondary mb-3">
          验证码将发送至 <span class="font-medium">{{ profile.email }}</span>
        </p>
        <div class="flex gap-2">
          <button
            class="px-3 py-2 rounded-md border border-border text-sm text-primary hover:bg-elevated transition-colors disabled:opacity-60"
            :disabled="sendingCode || codeSent"
            @click="handleSendCode"
          >
            {{ codeSent ? '已发送（mock 验证码：123456）' : sendingCode ? '发送中...' : '发送验证码' }}
          </button>
          <template v-if="codeSent">
            <input
              v-model="verifyCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位验证码"
              class="flex-1 h-10 px-3 rounded-md border border-border bg-elevated text-sm text-primary focus:outline-2 focus:outline-primary"
              aria-label="验证码"
            />
            <button
              class="px-3 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
              :disabled="verifying || verifyCode.length !== 6"
              @click="handleVerify"
            >
              {{ verifying ? '验证中...' : '验证' }}
            </button>
          </template>
        </div>
        <p v-if="verifyError" class="mt-2 text-xs text-danger" role="alert">{{ verifyError }}</p>
      </div>

      <!-- 同步冲突入口 -->
      <div class="rounded-lg border border-border bg-elevated p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-primary">与统一身份认证同步</p>
            <p class="text-xs text-text-secondary mt-0.5">若学校侧信息发生变更，可手动触发同步</p>
          </div>
          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-primary hover:bg-subtle transition-colors"
            @click="loadProfile"
          >
            <RefreshCw :size="14" />
            刷新
          </button>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
