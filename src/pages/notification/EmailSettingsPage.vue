<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { Banner, ErrorState } from '@/components/feedback'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Save, Send } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'
import { useSessionViewStore } from '@/state/sessionViewStore'

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const config = ref({ smtpHost: '', smtpPort: 465, smtpUser: '', fromName: '', encryption: 'ssl', verified: false })
const testing = ref(false)
const testError = ref<string | null>(null)
const saving = ref(false)
const savingPrefs = ref(false)
const refilling = ref(false)

// 页面 UI 仅展示 4 类常用偏好；fullPreferences 持有全部模板类型（含页面未展示的结论/成员/换届/纠错/标签改判/整体未录取）
const preferences = ref({
  applicationStatus: true,
  interviewNotify: true,
  admissionInvite: true,
  systemMaintenance: false,
})

// kind -> UI 字段映射（保存时合并回全量 8 类，读取时回显）
const KIND_TO_UI: Record<string, keyof typeof preferences.value> = {
  application: 'applicationStatus',
  interview: 'interviewNotify',
  invitation: 'admissionInvite',
  system: 'systemMaintenance',
}
const UI_TO_KIND: Record<keyof typeof preferences.value, string> = {
  applicationStatus: 'application',
  interviewNotify: 'interview',
  admissionInvite: 'invitation',
  systemMaintenance: 'system',
}
const fullPreferences = ref<Record<string, boolean>>({})

const scope = computed(() => (route.meta.scope as string) || 'personal')
const scopeLabel = computed(() => {
  const map: Record<string, string> = { personal: '个人邮件偏好', club: '社团发信配置', platform: '平台发信配置' }
  return map[scope.value] || '邮件设置'
})

const isConfig = computed(() => scope.value !== 'personal')

async function loadData() {
  if (!isConfig.value) {
    state.value = 'loading'
    const apiScope = resolveApiScope(route)
    if (apiScope) {
      const result = await get<{ preferences: Record<string, boolean> }>(`${apiScope.prefix}/notifications/preferences`)
      if (result.kind === 'completed') {
        fullPreferences.value = result.data.preferences
        for (const [kind, uiKey] of Object.entries(KIND_TO_UI)) {
          if (typeof fullPreferences.value[kind] === 'boolean') {
            preferences.value[uiKey] = fullPreferences.value[kind]
          }
        }
      }
    }
    state.value = 'normal'
    return
  }
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<typeof config.value>(`${apiScope.prefix}/notifications/email-config`)
  if (result.kind === 'completed') {
    config.value = result.data
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function handleTest() {
  testing.value = true
  testError.value = null
  const apiScope = resolveApiScope(route)
  if (!apiScope) { testing.value = false; return }
  const result = await post(`${apiScope.prefix}/notifications/email-config/test`, {
    scope: scope.value,
    recipient: session.user?.email || config.value.smtpUser,
    smtpHost: config.value.smtpHost,
    smtpPort: config.value.smtpPort,
    smtpUser: config.value.smtpUser,
    fromName: config.value.fromName,
    encryption: config.value.encryption,
  })
  testing.value = false
  if (result.kind === 'completed') {
    toast.success('测试邮件已发送至 ' + (session.user?.email || config.value.smtpUser) + '，请查收')
  } else {
    // 保留通用引导文案，同时透出服务端具体原因（如连接超时），便于定位
    const detail = result.kind === 'rejected' && result.error?.message ? `（${result.error.message}）` : ''
    testError.value = `测试邮件发送失败，请稍后重试${detail}`
  }
}

async function handleSavePreferences() {
  savingPrefs.value = true
  const apiScope = resolveApiScope(route)
  if (!apiScope) { savingPrefs.value = false; return }
  const nextPrefs: Record<string, boolean> = { ...fullPreferences.value }
  for (const [uiKey, kind] of Object.entries(UI_TO_KIND)) {
    nextPrefs[kind] = preferences.value[uiKey as keyof typeof preferences.value]
  }
  const result = await post(`${apiScope.prefix}/notifications/preferences`, nextPrefs)
  savingPrefs.value = false
  if (result.kind === 'completed') {
    toast.success('偏好已保存')
  } else {
    toast.error('偏好保存失败，请稍后重试')
  }
}

async function handleRefillKey() {
  refilling.value = true
  const apiScope = resolveApiScope(route)
  if (!apiScope) { refilling.value = false; return }
  const result = await post(`${apiScope.prefix}/notifications/email-config/rotate-key`, {})
  refilling.value = false
  if (result.kind === 'completed') {
    toast.success('密钥已轮换，请重新填写')
  } else {
    toast.error('密钥轮换失败，请稍后重试')
  }
}

async function handleSave() {
  saving.value = true
  const apiScope = resolveApiScope(route)
  if (!apiScope) { saving.value = false; return }
  const result = await post(`${apiScope.prefix}/notifications/email-config`, {
    smtpHost: config.value.smtpHost,
    smtpPort: config.value.smtpPort,
    smtpUser: config.value.smtpUser,
    fromName: config.value.fromName,
    encryption: config.value.encryption,
  })
  saving.value = false
  if (result.kind === 'completed') {
    config.value.verified = true
    toast.success('发信配置已保存')
  } else {
    // IFC-ERR-006：未通过测试的配置不可保存（US-NTF-02），展示服务端具体原因
    const msg = result.kind === 'rejected' && result.error?.message ? result.error.message : '保存失败，请稍后重试'
    toast.error(msg)
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" :title="scopeLabel" @retry="loadData">
    <div class="max-w-xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">{{ scopeLabel }}</h1>

      <!-- 个人偏好 -->
      <Card v-if="!isConfig" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">通知偏好</h2>
        <div class="space-y-3">
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">报名状态变更</span>
            <input type="checkbox" v-model="preferences.applicationStatus" class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">面试安排通知</span>
            <input type="checkbox" v-model="preferences.interviewNotify" class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">录取邀请通知</span>
            <input type="checkbox" v-model="preferences.admissionInvite" class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">系统维护通知</span>
            <input type="checkbox" v-model="preferences.systemMaintenance" class="rounded border-border" />
          </label>
        </div>
        <button
          class="w-full mt-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
          :disabled="savingPrefs"
          @click="handleSavePreferences"
        >
          {{ savingPrefs ? '保存中...' : '保存偏好' }}
        </button>
      </Card>

      <!-- 社团/平台发信配置 -->
      <template v-else>
        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-4">SMTP 配置</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">SMTP 服务器</label>
              <input v-model="config.smtpHost" type="text" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-text-primary mb-1">端口</label>
                <input v-model.number="config.smtpPort" type="number" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-primary mb-1">加密方式</label>
                <select v-model="config.encryption" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                  <option value="none">无</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">发信账号</label>
              <input v-model="config.smtpUser" type="email" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <!-- NTF-007: 密钥不明文回显，只能重新填写或轮换 -->
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">发信密钥</label>
              <div class="flex gap-2">
                <input
                  type="password"
                  value=""
                  placeholder="••••••••（已配置，不回显明文）"
                  class="flex-1 h-10 px-3 rounded-md border border-border bg-muted text-sm text-text-secondary focus:outline-2 focus:outline-primary"
                  readonly
                  aria-label="发信密钥（已脱敏）"
                />
                <button
                  class="px-3 h-10 rounded-md border border-border text-sm text-text-primary hover:bg-subtle disabled:opacity-60"
                  :disabled="refilling"
                  @click="handleRefillKey"
                >
                  {{ refilling ? '处理中...' : '重新填写' }}
                </button>
              </div>
              <p class="text-xs text-text-secondary mt-1">密钥不明文回显，只能重新填写或轮换</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">发件人名称</label>
              <input v-model="config.fromName" type="text" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
          </div>
        </Card>

        <Banner v-if="config.verified" tone="success" title="发信配置已验证" class="mb-4" />

        <ErrorState
          v-if="testError"
          title="测试发送失败"
          :message="testError"
          compact
          class="mb-4"
          @retry="handleTest"
        />

        <div class="flex gap-3">
          <button class="flex items-center gap-1.5 px-4 h-10 rounded-md border border-border text-text-primary hover:bg-subtle" :disabled="testing" @click="handleTest">
            <Send :size="16" /> {{ testing ? '发送中...' : '发送测试邮件' }}
          </button>
          <button
            class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="saving"
            @click="handleSave"
          >
            <Save :size="16" /> {{ saving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </template>
    </div>
  </PageStateBoundary>
</template>
