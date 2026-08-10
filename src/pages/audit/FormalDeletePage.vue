<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import { ImpactPreview, type ImpactItem } from '@/components/operation'
import { PartialSuccess, type PartialResult } from '@/components/operation'
import DangerButton from '@/components/operation/DangerButton.vue'
import { ConfirmScope } from '@/components/operation'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { ShieldAlert, Trash2, AlertTriangle, Database } from '@lucide/vue'
import { identityApi } from '@/services/modules'

interface DeleteTarget { id: string; label: string; type: string; recordCount: number; memberCount: number }
interface DeletePreview { scope: string; targets: DeleteTarget[]; totalRecords: number; totalMembers: number; warning: string; previewVersion: number }
interface DeleteResult { targetId: string; success: boolean; stores: string[] }

const state = ref<PageState>('loading')
const preview = ref<DeletePreview | null>(null)
const step = ref<'preview' | 'confirm' | 'executing' | 'result'>('preview')
const results = ref<DeleteResult[]>([])
const auditRef = ref('')
const reason = ref('')
const reauthProof = ref('')
const reauthenticating = ref(false)
const hasActiveRelationships = computed(() => preview.value?.targets.some((target) => target.memberCount > 0) ?? true)
const canExecute = computed(() => !hasActiveRelationships.value && reason.value.trim().length >= 5 && Boolean(reauthProof.value))

const impactTargets = computed<ImpactItem[]>(() =>
  (preview.value?.targets ?? []).map((t) => ({ id: t.id, label: t.label, detail: `${t.type} · ${t.recordCount} 条记录` })),
)

const confirmOpen = ref(false)
const executingConfirm = ref(false)

const partialResults = computed<PartialResult[]>(() =>
  results.value.map((r) => {
    const target = preview.value?.targets.find((t) => t.id === r.targetId)
    return { id: r.targetId, label: target?.label || r.targetId, success: r.success, message: r.success ? `${r.stores.join('、')} 已清除` : '删除失败' }
  }),
)

async function loadData() {
  state.value = 'loading'
  const result = await get<DeletePreview>('/admin/delete/preview')
  if (result.kind === 'completed') {
    preview.value = result.data
    reason.value = ''
    reauthProof.value = ''
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
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

async function execute() {
  if (!preview.value || !canExecute.value) return
  confirmOpen.value = false
  executingConfirm.value = true
  step.value = 'executing'
  results.value = []
  const result = await post<{ results: DeleteResult[]; auditRef: string }>('/admin/delete/execute', {
    targetIds: preview.value!.targets.map((t) => t.id),
    reason: reason.value.trim(),
    previewVersion: preview.value.previewVersion,
    reauthProof: reauthProof.value,
  }, { expectedVersion: preview.value.previewVersion })
  executingConfirm.value = false
  if (result.kind === 'completed') {
    results.value = result.data.results
    auditRef.value = result.data.auditRef
    step.value = 'result'
  } else {
    toast.error('删除执行失败，请重试')
    step.value = 'confirm'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="正式删除" @retry="loadData">
    <div v-if="preview" class="max-w-lg mx-auto">
      <h1 class="text-2xl font-bold text-danger mb-2">正式删除</h1>
      <p class="text-sm text-text-secondary mb-6">高风险操作 · 需重新认证 · 不可撤销</p>

      <!-- 预览 -->
      <template v-if="step === 'preview'">
        <ImpactPreview
          class="mb-4"
          :targets="impactTargets"
          :notify-count="preview.totalMembers"
          :irreversible="true"
        />

        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">删除范围</h2>
          <div class="space-y-2">
            <div v-for="t in preview.targets" :key="t.id" class="flex items-center justify-between rounded-lg border border-border p-3">
              <div class="flex items-center gap-2">
                <Database :size="16" class="text-text-secondary" />
                <div>
                  <p class="text-sm text-text-primary">{{ t.label }}</p>
                  <p class="text-xs text-text-secondary">{{ t.type }} · {{ t.recordCount }} 条记录</p>
                  <!-- AUD-007: 活跃关系检查 -->
                  <p v-if="t.memberCount > 0" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                    <ShieldAlert :size="12" /> 存在 {{ t.memberCount }} 名活跃成员，需先处理成员关系
                  </p>
                </div>
              </div>
              <Trash2 :size="16" class="text-danger" />
            </div>
          </div>
        </Card>

        <!-- AUD-007: 活跃关系阻止提示 -->
        <Card v-if="preview.targets.some((t) => t.memberCount > 0)" class="mb-4 border-warning">
          <div class="flex items-start gap-2">
            <ShieldAlert :size="18" class="text-warning mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-warning">存在活跃关系，暂时无法删除</p>
              <p class="text-xs text-text-secondary mt-1">需先结束成员关系、有效邀请或进行中活动后方可执行删除</p>
            </div>
          </div>
        </Card>

        <button
          class="w-full h-11 rounded-md bg-danger text-text-on-primary font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          :disabled="hasActiveRelationships"
          @click="step = 'confirm'"
        >
          <ShieldAlert :size="18" /> 下一步：重新认证
        </button>
      </template>

      <!-- 确认 -->
      <template v-else-if="step === 'confirm'">
        <Card class="mb-4 border-danger">
          <div class="text-center py-4">
            <AlertTriangle :size="40" class="text-danger mx-auto mb-3" />
            <p class="text-base font-medium text-danger">确认执行删除？</p>
            <p class="text-sm text-text-secondary mt-1">此操作不可撤销，{{ preview.totalRecords }} 条记录将被永久清除</p>
          </div>
        </Card>
        <Card class="mb-4">
          <label for="delete-reason" class="block text-sm font-medium text-text-primary mb-2">删除原因</label>
          <textarea
            id="delete-reason"
            v-model="reason"
            rows="3"
            maxlength="500"
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary"
            placeholder="请填写至少 5 个字符的删除原因"
          />
          <button
            class="mt-3 w-full h-10 rounded-md border border-border text-text-primary hover:bg-subtle disabled:opacity-50"
            :disabled="reauthenticating || Boolean(reauthProof)"
            @click="reauthenticate"
          >
            {{ reauthProof ? '身份验证已完成' : reauthenticating ? '正在验证...' : '重新验证身份' }}
          </button>
        </Card>
        <div class="flex gap-3">
          <button class="flex-1 h-11 rounded-md border border-border text-text-primary hover:bg-subtle" @click="step = 'preview'">返回</button>
          <DangerButton
            class="flex-1"
            label="确认删除"
            :disabled="!canExecute"
            @confirm="confirmOpen = true"
          />
        </div>

        <ConfirmScope
          :open="confirmOpen"
          :targets="impactTargets"
          :notify-count="preview.totalMembers"
          :irreversible="true"
          :confirming="executingConfirm"
          @confirm="execute()"
          @cancel="confirmOpen = false"
        />
      </template>

      <!-- 执行中 -->
      <div v-else-if="step === 'executing'" class="text-center py-12">
        <div class="w-10 h-10 border-3 border-danger border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p class="text-sm text-text-secondary">正在删除...（{{ results.length }}/{{ preview.targets.length }}）</p>
      </div>

      <!-- 结果 -->
      <template v-else>
        <PartialSuccess :results="partialResults" class="mb-4" />
        <Card v-if="auditRef" class="mb-4">
          <p class="text-xs text-text-secondary">审计编号：{{ auditRef }}</p>
        </Card>
        <button class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover" @click="step = 'preview'">完成</button>
      </template>
    </div>
  </PageStateBoundary>
</template>
