<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { Banner, ErrorState } from '@/components/feedback'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Save, Send } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

const route = useRoute()
const state = ref<PageState>('loading')
const config = ref({ smtpHost: '', smtpPort: 465, smtpUser: '', fromName: '', encryption: 'ssl', verified: false })
const testing = ref(false)
const testResult = ref<string | null>(null)
const testError = ref<string | null>(null)
const saving = ref(false)

const scope = computed(() => (route.meta.scope as string) || 'personal')
const scopeLabel = computed(() => {
  const map: Record<string, string> = { personal: '个人邮件偏好', club: '社团发信配置', platform: '平台发信配置' }
  return map[scope.value] || '邮件设置'
})

const isConfig = computed(() => scope.value !== 'personal')

async function loadData() {
  if (!isConfig.value) { state.value = 'normal'; return }
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<typeof config.value>(`${apiScope.prefix}/notifications/email-config`)
  if (result.kind === 'completed') {
    config.value = result.data
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleTest() {
  testing.value = true
  testResult.value = null
  testError.value = null
  const apiScope = resolveApiScope(route)
  if (!apiScope) { testing.value = false; return }
  const result = await post(`${apiScope.prefix}/notifications/email-config/test`, {})
  testing.value = false
  if (result.kind === 'completed') {
    testResult.value = '测试邮件已发送至 ' + config.value.smtpUser + '，请查收'
  } else {
    testError.value = '测试邮件发送失败，请稍后重试'
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
    toast.success('配置已保存')
  } else {
    toast.error('保存失败，请稍后重试')
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
            <input type="checkbox" checked class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">面试安排通知</span>
            <input type="checkbox" checked class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">录取邀请通知</span>
            <input type="checkbox" checked class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-text-primary">系统维护通知</span>
            <input type="checkbox" class="rounded border-border" />
          </label>
        </div>
        <button class="w-full mt-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover">保存偏好</button>
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
                <button class="px-3 h-10 rounded-md border border-border text-sm text-text-primary hover:bg-subtle">重新填写</button>
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

        <p v-if="testResult" class="text-sm text-success mb-4" role="status">{{ testResult }}</p>

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
