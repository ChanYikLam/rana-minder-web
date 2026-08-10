<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { z } from 'zod'
import { PageStateBoundary } from '@/components/common'
import { get, put, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { identityApi } from '@/services/modules'
import { authMode } from '@/services/auth'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { MailCheck, ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, Scale } from '@lucide/vue'

interface Profile {
  version?: number
  studentId: string
  name: string
  email: string
  phone: string
  emailVerified: boolean
  profileComplete: boolean
  syncStatus?: Record<string, SyncState>
}

type SyncState = 'synced' | 'pending' | 'retrying' | 'awaiting' | 'conflict' | 'reverted'

// SRS-SM-IDN-003 同步状态展示映射（已同步/同步中/重试中/等待核验/冲突待处理/已回退）
const SYNC_META: Record<SyncState, { label: string; className: string }> = {
  synced: { label: '已同步', className: 'text-success' },
  pending: { label: '同步中', className: 'text-info' },
  retrying: { label: '同步重试中', className: 'text-warning' },
  awaiting: { label: '等待核验', className: 'text-warning' },
  conflict: { label: '冲突待处理', className: 'text-danger' },
  reverted: { label: '已回退至修改前值', className: 'text-muted-foreground' },
}

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const isSyncConflict = computed(() => route.meta.mode === 'sync-conflict')

const state = ref<PageState>('loading')
const error = ref<{ code: string; message: string } | null>(null)
const profile = ref<Profile | null>(null)
const version = ref(0)
// 错误态提示文案：按失败来源区分「资料加载失败」与「冲突加载失败」（审计 P3）
const pageErrorMsg = ref('资料加载失败')

const editing = ref(false)
const formEmail = ref('')
const formPhone = ref('')
const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)

// 邮箱验证
const showVerify = ref(false)
const verifyCode = ref('')
const codeSent = ref(false)
const sendingCode = ref(false)
const verifying = ref(false)
const resendCountdown = ref(0)
let resendTimer: ReturnType<typeof setInterval> | null = null

function startResendCountdown() {
  resendCountdown.value = 60
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCountdown.value -= 1
    if (resendCountdown.value <= 0 && resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (resendTimer) clearInterval(resendTimer)
})

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
    // 版本号以响应为准（P2-3：删除硬编码 1，与 mock 侧最新版本保持一致）
    version.value = result.data.version ?? 1
    state.value = 'normal'
  } else {
    // P3-2：rejected 也统一走 errorToPageState，避免手写 forbidden 集合与映射不一致（004/011/015 同样映射为 forbidden）
    state.value = errorToPageState(errorCodeOf(result))
    error.value = 'error' in result ? result.error : { code: errorCodeOf(result), message: '加载失败' }
  }
}

// 统一入口：按模式分派加载逻辑（正常模式加载资料，sync-conflict 模式先拉资料再拉冲突清单）
async function loadPage() {
  // 重置冲突页遗留状态（审计 P2-1：组件实例被路由复用/onMounted 不重新触发时，防止旧冲突数据残留）
  resetConflictState()
  // 默认错误文案为「资料加载失败」，sync-conflict 分支若冲突清单加载失败会覆盖为「冲突清单加载失败」（审计 P3）
  pageErrorMsg.value = '资料加载失败'
  if (!isSyncConflict.value) {
    await loadProfile()
    return
  }
  // sync-conflict 模式：先拉取真实本地档案，再请求真实冲突清单
  state.value = 'loading'
  error.value = null
  const result = await get<Profile>('/auth/profile')
  if (result.kind === 'completed') {
    profile.value = result.data
    state.value = 'normal'
    await loadConflicts()
  } else {
    state.value = 'error'
    error.value = result.kind === 'rejected' && result.error ? result.error : { code: 'IFC-ERR-016', message: '加载失败' }
  }
}

function startEdit() {
  if (!profile.value) return
  formEmail.value = profile.value.email
  formPhone.value = profile.value.phone
  formErrors.value = {}
  editing.value = true
}

async function handleSave() {
  formErrors.value = {}

  const parsed = profileSchema.safeParse({ email: formEmail.value, phone: formPhone.value })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0])
      if (!formErrors.value[field]) formErrors.value[field] = issue.message
    }
    return
  }

  // 无实际改动则不上送：避免「编辑后原样提交」触发无效版本递增（MRM-007 边界）
  if (parsed.data.email === profile.value?.email && parsed.data.phone === profile.value?.phone) {
    editing.value = false
    return
  }

  submitting.value = true
  const result = await put<Profile>('/auth/profile', parsed.data, { expectedVersion: version.value })
  submitting.value = false

  if (result.kind === 'completed') {
    profile.value = result.data
    editing.value = false
    // 版本号以响应为准，避免「本地自增与服务器登记不一致」再次触发 409（P2-3）
    version.value = result.data.version ?? version.value + 1
    toast.success('资料已保存')
    // 保存后刷新会话：资料门 profileComplete 翻转即时生效（P2-3：页面保存与会话联动）
    await session.loadSession()
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('资料已被其他会话修改，请刷新后重试')
  } else if (result.kind === 'rejected') {
    if (result.error.fieldErrors) {
      for (const [field, msgs] of Object.entries(result.error.fieldErrors)) {
        formErrors.value[field] = msgs[0]
      }
    } else {
      toast.error(result.error.message)
    }
  } else {
    toast.error('保存失败，请稍后重试')
  }
}

async function handleSendCode() {
  if (sendingCode.value || resendCountdown.value > 0) return
  sendingCode.value = true
  const result = await post<{ sent: boolean }>('/auth/profile/send-email-code')
  sendingCode.value = false
  if (result.kind === 'completed') {
    codeSent.value = true
    startResendCountdown()
  }
}

async function handleVerify() {
  if (verifying.value) return
  verifying.value = true
  const result = await post<{ emailVerified: boolean }>('/auth/profile/verify-email', { code: verifyCode.value })
  verifying.value = false
  if (result.kind === 'completed') {
    if (profile.value) profile.value.emailVerified = true
    showVerify.value = false
    verifyCode.value = ''
    codeSent.value = false
    toast.success('邮箱验证成功')
    // 验证通过后刷新会话：资料门 emailVerified 翻转即时生效（P2-3）
    await session.loadSession()
  } else if (result.kind === 'rejected') {
    toast.error(result.error.fieldErrors?.code?.[0] || result.error.message)
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

function syncTag(field: string): { label: string; className: string } | null {
  const state = profile.value?.syncStatus?.[field]
  return state ? SYNC_META[state] : null
}

// 同步冲突解决（sync-conflict 模式）
interface ConflictField { field: string; label: string; localValue: string; remoteValue: string; chosen: 'local' | 'remote' }
const conflictFields = ref<ConflictField[]>([])
const conflictSubmitting = ref(false)
const conflictLoading = ref(false)

/** 重置冲突页状态（进入/重试 sync-conflict 模式时调用，避免旧状态残留） */
function resetConflictState() {
  conflictFields.value = []
  conflictSubmitting.value = false
  conflictLoading.value = false
}

async function loadConflicts() {
  conflictLoading.value = true
  const result = await get<{ conflicts: Array<{ field: string; label: string; localValue: string; remoteValue: string }> }>('/auth/profile/sync-conflicts')
  conflictLoading.value = false
  if (result.kind === 'completed') {
    conflictFields.value = result.data.conflicts.map((c) => ({ ...c, chosen: 'remote' as const }))
    if (conflictFields.value.length === 0) {
      toast.success('没有待处理的同步冲突')
      router.push('/me/profile')
      return
    }
  } else if (result.kind === 'rejected' && result.error) {
    state.value = 'error'
    error.value = result.error
    // 冲突清单加载失败：区分错误文案，便于用户判断重试对象（审计 P3）
    pageErrorMsg.value = '冲突清单加载失败'
  } else {
    state.value = 'error'
    error.value = { code: 'IFC-ERR-016', message: '冲突加载失败' }
    pageErrorMsg.value = '冲突清单加载失败'
  }
}

async function handleResolveConflicts() {
  if (conflictSubmitting.value) return
  conflictSubmitting.value = true
  for (const f of conflictFields.value) {
    const chosenValue = f.chosen === 'local' ? f.localValue : f.remoteValue
    const r = await identityApi.resolveSyncConflict({ field: f.field, chosenValue })
    if (r.kind === 'rejected' && r.error) {
      conflictSubmitting.value = false
      toastError(r, '冲突解决失败')
      // 逐条写回过程中途失败：已写回字段已生效，重新拉取冲突清单使页面与服务端状态对齐，
      // 避免已解决字段留在页面上被重复提交
      await loadConflicts()
      return
    }
  }
  conflictSubmitting.value = false
  if (profile.value) {
    profile.value = { ...profile.value }
  }
  conflictFields.value = []
  toast.success('冲突已解决')
  router.push('/me/profile')
}

onMounted(async () => {
  await loadPage()
})

// 审计 P2-1：ProfilePage 被 /me/profile、/me/profile/edit、/me/profile/sync-conflict 三个路由共用，
// vue-router 复用组件实例时 onMounted 不会重新触发。监听路由模式变化，
// 在切入 sync-conflict 模式时强制重置状态并重新加载，避免旧 profile/conflictFields 残留导致静默失效。
watch(
  () => route.meta.mode,
  async (mode, prevMode) => {
    if (mode === 'sync-conflict' && mode !== prevMode) {
      await loadPage()
    }
  },
  { immediate: false }
)
</script>

<template>
  <PageStateBoundary
    :state="state"
    title="个人资料"
    :error="error"
    :error-message="pageErrorMsg"
    @retry="loadPage"
  >
    <div class="max-w-2xl mx-auto" v-if="profile">
      <!-- 同步冲突解决模式 -->
      <template v-if="isSyncConflict">
        <div class="flex items-center gap-2 mb-1">
          <AlertTriangle :size="20" class="text-warning" />
          <h1 class="text-2xl font-bold text-text-primary">资料同步冲突</h1>
        </div>
        <p class="text-sm text-text-secondary mb-6">本地档案与统一身份认证存在不一致，请选择保留哪一侧的值</p>

        <div v-if="conflictLoading" class="rounded-lg border border-border bg-elevated p-8 text-center text-sm text-text-secondary">
          正在加载冲突字段...
        </div>

        <div v-else-if="conflictFields.length > 0" class="rounded-lg border border-border bg-elevated mb-4 overflow-hidden">
          <div class="px-4 py-3 border-b border-border flex items-center gap-2">
            <Scale :size="16" class="text-warning" />
            <span class="text-sm font-medium text-text-primary">冲突字段</span>
          </div>
          <div v-for="f in conflictFields" :key="f.field" class="px-4 py-3 border-b border-border last:border-b-0">
            <p class="text-sm font-medium text-text-primary mb-2">{{ f.label }}</p>
            <div class="flex gap-3">
              <label class="flex-1 rounded-md border p-3 cursor-pointer" :class="f.chosen === 'local' ? 'border-primary bg-primary-subtle' : 'border-border'" @click="f.chosen = 'local'">
                <input type="radio" class="sr-only" :checked="f.chosen === 'local'" />
                <p class="text-xs text-text-secondary mb-1">本地档案</p>
                <p class="text-sm text-text-primary font-medium">{{ f.localValue }}</p>
              </label>
              <label class="flex-1 rounded-md border p-3 cursor-pointer" :class="f.chosen === 'remote' ? 'border-primary bg-primary-subtle' : 'border-border'" @click="f.chosen = 'remote'">
                <input type="radio" class="sr-only" :checked="f.chosen === 'remote'" />
                <p class="text-xs text-text-secondary mb-1">统一身份认证</p>
                <p class="text-sm text-text-primary font-medium">{{ f.remoteValue }}</p>
              </label>
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="flex-1 h-11 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
            @click="router.push('/me/profile')"
          >
            暂不处理
          </button>
          <button
            class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="conflictSubmitting || conflictLoading || conflictFields.length === 0"
            @click="handleResolveConflicts"
          >
            {{ conflictSubmitting ? '提交中...' : '解决冲突' }}
          </button>
        </div>
      </template>

      <!-- 正常模式 -->
      <template v-else>
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
            <dd class="text-sm text-primary font-medium flex items-center gap-2">
              {{ profile.email }}
              <span v-if="syncTag('email')" class="text-xs" :class="syncTag('email')!.className">{{ syncTag('email')!.label }}</span>
            </dd>
          </div>
          <div class="px-4 py-3 flex items-center justify-between">
            <dt class="text-sm text-text-secondary">手机号</dt>
            <dd class="text-sm text-primary font-medium flex items-center gap-2">
              {{ profile.phone }}
              <span v-if="syncTag('phone')" class="text-xs" :class="syncTag('phone')!.className">{{ syncTag('phone')!.label }}</span>
            </dd>
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
          验证码 5 分钟内有效，将发送至 <span class="font-medium">{{ profile.email }}</span>
        </p>
        <div class="flex gap-2">
          <button
            class="px-3 py-2 rounded-md border border-border text-sm text-primary hover:bg-elevated transition-colors disabled:opacity-60"
            :disabled="sendingCode || codeSent || resendCountdown > 0"
            @click="handleSendCode"
          >
            {{ codeSent ? (authMode === 'mock' ? '已发送，24 小时内有效（演示验证码：123456）' : '已发送，24 小时内有效') : resendCountdown > 0 ? `${resendCountdown}s 后可重发` : sendingCode ? '发送中...' : '发送验证码' }}
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
      </template>
    </div>
  </PageStateBoundary>
</template>
