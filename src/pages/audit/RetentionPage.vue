<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card, HighRiskConfirm } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { identityApi } from '@/services/modules'
import type { PageState } from '@/types/machine'
import { Plus, ShieldAlert, Calendar, ArrowRight } from '@lucide/vue'

interface Policy {
  id: string
  scope: string
  retentionDays: number
  action: string
  status: string
  version: number
  updatedAt: string
  publishedAt: string | null
}

interface PolicyPreview {
  scope: string
  fromDays: number | null
  toDays: number
  action: string
  affectedObjects: { records: number; members: number }
  bufferDays: number
  previewVersion: number
}

interface RetentionExecution {
  runId: string
  executedAt: string
  results: Array<{ policyId: string; scope: string; action: string; retentionDays: number; executedCount: number; skippedCount: number }>
}

const state = ref<PageState>('loading')
const policies = ref<Policy[]>([])
const lastExecution = ref<RetentionExecution | null>(null)
const showForm = ref(false)
const creating = ref(false)
const form = ref({ scope: '', retentionDays: 30, action: 'clean' })

const preview = ref<PolicyPreview | null>(null)
const previewTarget = ref<Policy | null>(null)
const previewLoading = ref(false)
const publishReason = ref('')
const reauthProof = ref('')
const reauthenticating = ref(false)
const confirmOpen = ref(false)
const publishing = ref(false)

// 执行保留策略（P1-010：执行器真实处置到期数据，写审计日志）
const executeOpen = ref(false)
const executing = ref(false)
const executeSucceeded = ref(false)
const executeError = ref('')

const actionLabels: Record<string, string> = { auto_delete: '自动删除', archive: '归档', keep: '保留', clean: '清理' }

async function loadData() {
  state.value = 'loading'
  const result = await get<{ policies: Policy[]; lastExecution?: RetentionExecution | null }>('/admin/retention')
  if (result.kind === 'completed') {
    policies.value = result.data.policies
    lastExecution.value = result.data.lastExecution ?? null
    preview.value = null
    previewTarget.value = null
    publishReason.value = ''
    reauthProof.value = ''
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleCreate() {
  creating.value = true
  const result = await post('/admin/retention', { ...form.value })
  creating.value = false
  if (result.kind === 'completed') {
    toast.success('保留策略草稿已创建')
    const created = result.data as { id: string; scope: string; retentionDays: number; action: string; status: string; version: number; updatedAt: string; publishedAt: string | null }
    policies.value.unshift(created)
    showForm.value = false
    form.value = { scope: '', retentionDays: 30, action: 'clean' }
    await loadData()
  } else {
    toastError(result, '创建失败，请重试')
  }
}

async function openPreview(policy: Policy) {
  if (!reauthProof.value) { toast.error('请先完成重新认证再预览'); return }
  previewLoading.value = true
  preview.value = null
  previewTarget.value = policy
  publishReason.value = ''
  const result = await get<PolicyPreview>(`/admin/retention/${policy.id}/preview`)
  previewLoading.value = false
  if (result.kind === 'completed') {
    preview.value = result.data
  } else {
    toastError(result, '影响预览失败，请重试')
    previewTarget.value = null
  }
}

async function reauthenticate() {
  reauthenticating.value = true
  const result = await identityApi.reauthenticate()
  reauthenticating.value = false
  if (result.kind === 'completed') {
    reauthProof.value = result.data.proof
    toast.success('身份验证已完成')
    return
  }
  toast.error('身份验证失败，请重新登录后再试')
}

async function handlePublish() {
  const p = previewTarget.value
  const pv = preview.value
  if (!p || !pv) return
  if (!publishReason.value.trim() || publishReason.value.trim().length < 5) {
    toast.error('请填写至少 5 个字符的发布原因')
    return
  }
  publishing.value = true
  const result = await post(`/admin/retention/${p.id}/publish`, {
    reason: publishReason.value.trim(),
    reauthProof: reauthProof.value,
    previewVersion: pv.previewVersion,
  })
  publishing.value = false
  confirmOpen.value = false
  if (result.kind === 'completed') {
    toast.success('策略已发布')
    const data = result.data as { notice?: string | null; auditRef?: string }
    if (data.notice) toast.info(data.notice)
    await loadData()
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('发布已受理，正在后台处理')
    await loadData()
  } else if (result.kind === 'rejected' && (result.error as { code?: string }).code === 'IFC-ERR-002') {
    toast.error('身份验证已失效，请重新认证后重试')
    reauthProof.value = ''
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('影响预览已过期，请重新预览后发布')
    preview.value = null
  } else {
    toastError(result, '发布失败，请重试')
  }
}

async function handleExecute(proof?: string) {
  if (!proof) {
    toast.error('身份验证失败，请重试')
    executeOpen.value = false
    return
  }
  executing.value = true
  executeSucceeded.value = false
  executeError.value = ''
  const result = await post('/admin/retention/execute', {
    reason: '例行保留策略执行',
    reauthProof: proof,
  })
  executing.value = false
  if (result.kind === 'completed') {
    executeSucceeded.value = true
    const data = result.data as { totalExecuted: number }
    toast.success(`保留策略执行完成，共处置 ${data.totalExecuted} 条数据`)
    await loadData()
  } else if (result.kind === 'rejected' && (result.error as { code?: string }).code === 'IFC-ERR-002') {
    toast.error('身份验证已失效，请重新认证后重试')
    executeOpen.value = false
  } else {
    executeError.value = (result as { error?: { message?: string } }).error?.message || '执行失败，请重试'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="数据保留策略" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">数据保留策略</h1>
        <button
          class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
          @click="showForm = !showForm"
        >
          <Plus :size="16" /> {{ showForm ? '收起' : '新建策略' }}
        </button>
      </div>

      <Card v-if="showForm" class="mb-4">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">策略范围</label>
            <input v-model="form.scope" type="text" placeholder="如：已退出成员数据" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">保留天数</label>
              <input v-model.number="form.retentionDays" type="number" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">到期操作</label>
              <select v-model="form.action" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="clean">清理（临时/技术数据）</option>
                <option value="archive">归档</option>
                <option value="keep">保留</option>
                <option value="auto_delete">自动删除</option>
              </select>
            </div>
          </div>
          <button
            class="w-full h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="creating || !form.scope"
            @click="handleCreate"
          >
            {{ creating ? '创建中...' : '创建草稿' }}
          </button>
        </div>
      </Card>

      <Card class="mb-4 border-warning">
        <div class="flex items-start gap-2">
          <ShieldAlert :size="18" class="text-warning mt-0.5 shrink-0" />
          <p class="text-xs text-text-secondary">策略发布为高风险操作，需重新认证并先预览影响。缩短保留期限时，已有数据将获得至少 7 天缓冲期。</p>
        </div>
      </Card>

      <!-- 执行器（P1-010）：保留策略真实处置到期数据，并写入审计日志 -->
      <Card class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm font-medium text-text-primary">保留策略执行器</p>
          <button
            class="flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
            @click="executeOpen = true"
          >
            <Calendar :size="14" /> 立即执行
          </button>
        </div>
        <div v-if="lastExecution" class="space-y-1.5 text-xs text-text-secondary">
          <p>最近执行：{{ lastExecution.runId }} · {{ lastExecution.executedAt }}</p>
          <p v-for="r in lastExecution.results" :key="r.policyId">
            「{{ r.scope }}」{{ actionLabels[r.action] || r.action }} 处置 {{ r.executedCount }} 条 / 跳过 {{ r.skippedCount }} 条
          </p>
        </div>
        <p v-else class="text-xs text-text-secondary">尚未执行。点击「立即执行」扫描到期数据并按生效策略处置（处置结果写入审计日志）。</p>
        <p class="text-xs text-text-secondary mt-2">执行需重新认证身份，处置明细将逐策略写入平台审计日志。</p>
      </Card>

      <div class="space-y-3">
        <Card v-for="p in policies" :key="p.id">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-medium text-text-primary">{{ p.scope }}</p>
            <StateTag :status="p.status" />
          </div>
          <div class="flex items-center gap-4 text-sm text-text-secondary">
            <span class="flex items-center gap-1"><Calendar :size="14" /> 保留 {{ p.retentionDays }} 天</span>
            <span>操作：{{ actionLabels[p.action] || p.action }}</span>
            <span>v{{ p.version }}</span>
          </div>
          <p class="text-xs text-text-secondary mt-1">更新于 {{ p.updatedAt }}</p>

          <!-- 草稿发布流程（HEAD：复杂流程，含重新认证和预览） -->
          <div v-if="p.status === 'draft'" class="mt-3 pt-3 border-t border-border">
            <button
              class="w-full h-9 rounded-md border border-border text-xs text-text-primary hover:bg-subtle disabled:opacity-50"
              :disabled="reauthenticating || Boolean(reauthProof)"
              @click="reauthenticate"
            >
              {{ reauthProof ? '身份验证已完成' : reauthenticating ? '正在验证...' : '重新验证身份' }}
            </button>

            <button
              class="mt-2 w-full h-9 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-50"
              :disabled="!reauthProof || previewLoading"
              @click="openPreview(p)"
            >
              {{ previewLoading ? '正在预览...' : previewTarget?.id === p.id && preview ? '重新预览影响' : '预览影响' }}
            </button>

            <div v-if="previewTarget?.id === p.id && preview" class="mt-3 rounded-lg border border-border p-3 space-y-2">
              <p class="text-xs text-text-secondary flex items-center gap-1">
                <span class="text-text-primary">{{ preview.fromDays ?? '首次设置' }} 天</span>
                <ArrowRight :size="12" /> <span class="text-text-primary">{{ preview.toDays }} 天</span>
                <span>（{{ actionLabels[preview.action] }}）</span>
              </p>
              <p class="text-xs text-text-secondary">影响 {{ preview.affectedObjects.records }} 条记录 · {{ preview.affectedObjects.members }} 名成员</p>
              <p v-if="preview.bufferDays > 0" class="text-xs text-warning flex items-center gap-1">
                <ShieldAlert :size="12" /> 保留期限被缩短，已有数据将获得至少 {{ preview.bufferDays }} 天缓冲期
              </p>
              <div>
                <label class="block text-xs font-medium text-text-primary mb-1">发布原因</label>
                <textarea v-model="publishReason" rows="2" maxlength="200" class="w-full rounded-md border border-border bg-elevated px-3 py-2 text-xs text-text-primary focus:outline-2 focus:outline-primary" placeholder="至少 5 个字符" />
              </div>
              <button
                class="w-full h-9 rounded-md bg-danger text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-50"
                :disabled="!publishReason.trim() || publishReason.trim().length < 5 || !reauthProof"
                @click="confirmOpen = true"
              >
                确认发布
              </button>
            </div>
          </div>

        </Card>
      </div>

      <HighRiskConfirm
        :open="confirmOpen"
        title="发布保留策略"
        :description="`将「${previewTarget?.scope ?? ''}」的保留期限调整为 ${preview?.toDays ?? '?'} 天并立即生效（不可变版本，发布失败保留旧版）。`"
        :targets="preview ? [{ id: previewTarget!.id, label: previewTarget!.scope, detail: `${preview.fromDays ?? '首次'} → ${preview.toDays} 天 · ${actionLabels[preview.action]}` }] : []"
        :impact-summary="preview?.bufferDays ? `保留期限被缩短，已有数据将获得至少 ${preview.bufferDays} 天缓冲期后按新策略处理。` : '发布后新策略立即生效，不可变版本。'"
        confirm-label="确认发布"
        :executing="publishing"
        @confirm="handlePublish"
        @update:open="(v) => { if (!v) confirmOpen = false }"
      />
    </div>

    <HighRiskConfirm
      v-model:open="executeOpen"
      title="执行保留策略"
      description="按所有生效策略扫描到期数据并执行处置（自动删除 / 归档 / 保留），处置明细将写入审计日志，此操作不可撤销。"
      :targets="lastExecution?.results?.length ? lastExecution.results.map((r) => ({ id: r.policyId, label: r.scope, detail: `${actionLabels[r.action] || r.action} · 保留 ${r.retentionDays} 天` })) : []"
      impact-summary="执行结果实时可见，并逐策略写入平台审计日志。"
      confirm-label="确认执行"
      reauth-required
      :executing="executing"
      :succeeded="executeSucceeded"
      :error-message="executeError"
      @confirm="handleExecute"
    />
  </PageStateBoundary>
</template>