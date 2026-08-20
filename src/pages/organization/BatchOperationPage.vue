<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { Card } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import { BatchActionBar, type BatchItem } from '@/components/operation'
import { PartialSuccess, type PartialResult } from '@/components/operation'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { ArrowRight, ArrowLeft, ChevronRight } from '@lucide/vue'

type BatchType = 'assign_interviewer' | 'schedule_interview' | 'publish_result' | 'send_invitation'

interface BatchCandidate {
  id: string
  name: string
  studentId: string
  department: string
  status: string
}

const route = useRoute()
const step = ref<'select' | 'preview' | 'execute' | 'result'>('select')
const selectedType = ref<BatchType | null>(null)
const selectedItems = ref<string[]>([])
const executing = ref(false)
const candidates = ref<BatchCandidate[]>([])
const loadingCandidates = ref(false)
const loadFailed = ref(false)
const candidatesError = ref(false)
const interviewers = ref<{ id: string; name: string }[]>([])
const interviewerId = ref('')
const confirmOpen = ref(false)
const confirmError = ref('')
const confirmReason = ref('')
// 重试失败项时选中的目标（非空表示当前为重试模式，仅重跑失败项）
const retryingIds = ref<string[]>([])

const batchTypes: { type: BatchType; label: string; desc: string }[] = [
  { type: 'assign_interviewer', label: '批量分配面试官', desc: '为多个申请人分配同一面试官' },
  { type: 'schedule_interview', label: '批量安排面试', desc: '为多个申请人安排同一时段面试' },
  { type: 'publish_result', label: '批量发布结果', desc: '统一发布多个申请人的评价结论' },
  { type: 'send_invitation', label: '批量发送邀请', desc: '向多个申请人发送同一类型邀请' },
]

interface BatchResult { id: string; name: string; success: boolean; message: string }
const results = ref<BatchResult[]>([])

const clubId = computed(() => (typeof route.params.clubId === 'string' ? route.params.clubId : null))

let candidatesAbort: AbortController | null = null
// P2-16：代次计数器——后发请求 abort 先发请求后，先发请求的 finally 不得复位 loading（其代次已过期）
let candidatesGeneration = 0

async function loadCandidates() {
  if (!clubId.value) return
  candidatesGeneration += 1
  const generation = candidatesGeneration
  if (candidatesAbort) candidatesAbort.abort()
  candidatesAbort = new AbortController()
  loadingCandidates.value = true
  loadFailed.value = false
  candidatesError.value = false
  try {
    const res = await get<{ items: BatchCandidate[] }>(`/org/${clubId.value}/batch/candidates`, undefined, candidatesAbort.signal)
    if (generation !== candidatesGeneration) return
    if (res.kind === 'completed') {
      candidates.value = res.data.items
      loadFailed.value = false
    } else {
      loadFailed.value = true
      candidatesError.value = true
    }
  } catch (err) {
    if (generation !== candidatesGeneration) return
    // P2-63：abort 中断属于预期取消，不产生 unhandled rejection
    if (err instanceof DOMException && err.name === 'AbortError') return
    loadFailed.value = true
    candidatesError.value = true
  } finally {
    // 仅最新代次的请求复位 loading，过期请求（已被 abort）不覆盖在途请求的指示
    if (generation === candidatesGeneration) loadingCandidates.value = false
  }
}

onMounted(() => {
  loadCandidates()
  loadInterviewers()
})

async function loadInterviewers() {
  if (!clubId.value) return
  const res = await get<{ items: { id: string; name: string }[] }>(`/org/${clubId.value}/batch/interviewers`)
  if (res.kind === 'completed') interviewers.value = res.data.items
  else toast.error('面试官列表加载失败，请重试')
}

onBeforeUnmount(() => {
  candidatesAbort?.abort()
  candidatesAbort = null
})

function selectType(type: BatchType) {
  selectedType.value = type
  selectedItems.value = []
  interviewerId.value = ''
  step.value = 'preview'
}

function toggleItem(id: string) {
  const idx = selectedItems.value.indexOf(id)
  if (idx >= 0) selectedItems.value.splice(idx, 1)
  else selectedItems.value.push(id)
}

function applyResults(list: { memberId: string; success: boolean; message: string }[]) {
  for (const item of list) {
    const app = candidates.value.find((a) => a.id === item.memberId)
    const existing = results.value.findIndex((r) => r.id === item.memberId)
    const entry: BatchResult = {
      id: item.memberId,
      name: app?.name || item.memberId,
      success: item.success,
      message: item.message || (item.success ? '操作成功' : '操作失败'),
    }
    if (existing >= 0) results.value[existing] = entry
    else results.value.push(entry)
  }
}

async function runBatch(memberIds: string[], reason: string, proof?: string) {
  if (!clubId.value) {
    toast.error('工作空间参数无效')
    return false
  }
  const result = await post<{ results: { memberId: string; success: boolean; message: string }[] }>(`/org/${clubId.value}/batch/execute`, {
    action: selectedType.value,
    memberIds,
    interviewerId: selectedType.value === 'assign_interviewer' ? interviewerId.value : undefined,
    reason: reason || undefined,
    reauthProof: proof,
  })
  if (result.kind === 'completed') {
    applyResults(result.data.results)
    toast.success('批量操作执行完成')
    return true
  }
  if (result.kind === 'accepted') {
    toastAcceptedAction('批量操作已受理，正在后台处理')
    return true
  }
  toast.error('批量操作执行失败，请重试')
  return false
}

async function execute() {
  confirmError.value = ''
  retryingIds.value = []
  if (!confirmReason.value.trim() || confirmReason.value.trim().length < 5) {
    confirmError.value = '请填写批量执行原因（至少 5 字）'
  }
  confirmOpen.value = true
}

async function confirmExecute(proof?: string) {
  const reason = confirmReason.value.trim()
  if (!reason || reason.length < 5) {
    confirmError.value = '请填写批量执行原因（至少 5 字）'
    return
  }
  confirmOpen.value = false
  step.value = 'execute'
  executing.value = true
  try {
    results.value = []
    // 重试模式仅重跑失败项；普通执行跑全量选中项
    const targets = retryingIds.value.length ? retryingIds.value : selectedItems.value
    const ok = await runBatch(targets, reason, proof)
    retryingIds.value = []
    if (ok) step.value = 'result'
    else step.value = 'preview'
  } finally {
    executing.value = false
  }
}

// 重试失败项：proof 为一次性凭证，旧 proof 已被首次执行消费，必须重新走重认证确认流程
function retryFailed() {
  retryingIds.value = results.value.filter((r) => !r.success).map((r) => r.id)
  confirmError.value = ''
  confirmOpen.value = true
}

function cancelConfirm() {
  confirmError.value = ''
}

function reset() {
  step.value = 'select'
  selectedType.value = null
  selectedItems.value = []
  results.value = []
}

const batchSelected = computed<BatchItem[]>(() =>
  selectedItems.value.map((id) => {
    const c = candidates.value.find((a) => a.id === id)
    return { id, label: c ? `${c.name}（${c.studentId}）` : id }
  }),
)

// 确认弹窗影响范围：重试模式展示失败项，普通执行展示全量选中项
const confirmTargets = computed<BatchItem[]>(() =>
  retryingIds.value.length
    ? retryingIds.value.map((id) => {
        const c = candidates.value.find((a) => a.id === id)
        return { id, label: c ? `${c.name}（${c.studentId}）` : id }
      })
    : batchSelected.value,
)

const batchResults = computed<PartialResult[]>(() =>
  results.value.map((r) => ({ id: r.id, label: r.name, success: r.success, message: r.message })),
)

// 本次执行的目标总数（重试模式为失败项数，普通执行为全量选中数），用于进度展示
const executingTotal = computed(() => (retryingIds.value.length ? retryingIds.value.length : selectedItems.value.length))
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-text-primary mb-6">受控批量操作</h1>

    <!-- 步骤指示 -->
    <div class="flex items-center gap-2 mb-8 text-sm">
      <span :class="step === 'select' ? 'text-primary font-medium' : 'text-text-secondary'">1. 选择类型</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'preview' || step === 'execute' || step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">2. 预览</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'execute' || step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">3. 执行</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">4. 结果</span>
    </div>

    <!-- Step 1: 选择类型 -->
    <div v-if="step === 'select'">
      <div class="space-y-3">
        <Card
          v-for="bt in batchTypes"
          :key="bt.type"
          class="cursor-pointer"
          @click="selectType(bt.type)"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ bt.label }}</p>
              <p class="text-xs text-text-secondary mt-0.5">{{ bt.desc }}</p>
            </div>
            <ChevronRight />
          </div>
        </Card>
      </div>
    </div>

    <!-- Step 2: 预览 -->
    <div v-else-if="step === 'preview'">
      <Card class="mb-4">
        <p class="text-sm font-medium text-text-primary mb-1">
          {{ batchTypes.find((b) => b.type === selectedType)?.label }}
        </p>
        <p class="text-xs text-text-secondary">选择需要批量操作的对象，一次批次只属于一个操作类型</p>
      </Card>

      <Card class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-text-primary">选择对象（{{ selectedItems.length }}）</p>
          <button
            class="text-xs text-primary hover:underline"
            @click="selectedItems.length === candidates.length ? (selectedItems = []) : (selectedItems = candidates.map((a) => a.id))"
          >
            {{ selectedItems.length === candidates.length ? '取消全选' : '全选' }}
          </button>
        </div>
        <p v-if="loadingCandidates" class="text-sm text-text-secondary py-6 text-center">正在加载候选人...</p>
        <div v-else-if="loadFailed" class="py-6 text-center">
          <p class="text-sm text-text-secondary mb-3">候选人列表加载失败</p>
          <button class="px-3 py-1.5 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="loadCandidates">重新加载</button>
        </div>
        <div v-else-if="candidatesError" class="py-6 text-center">
          <p class="text-sm text-text-secondary mb-3">候选人加载失败，请重试</p>
          <button class="px-4 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="loadCandidates">重试</button>
        </div>
        <p v-else-if="candidates.length === 0" class="text-sm text-text-secondary py-6 text-center">暂无报名申请</p>
        <div v-else class="space-y-2">
          <label
            v-for="app in candidates"
            :key="app.id"
            class="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-border-strong"
          >
            <input
              type="checkbox"
              :checked="selectedItems.includes(app.id)"
              class="rounded border-border"
              @change="toggleItem(app.id)"
            />
            <div class="flex-1">
              <span class="text-sm text-text-primary">{{ app.name }}</span>
              <span class="text-xs text-text-secondary ml-2">{{ app.studentId }} · {{ app.department }}</span>
            </div>
            <StateTag :status="app.status" />
          </label>
        </div>
      </Card>

      <Card class="mb-4">
        <div v-if="selectedType === 'assign_interviewer'">
          <label class="block text-sm font-medium text-text-primary mb-2" for="batch-interviewer">选择面试官（批量分配目标）</label>
          <select
            id="batch-interviewer"
            v-model="interviewerId"
            class="w-full h-10 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary"
          >
            <option value="" disabled>请选择面试官</option>
            <option v-for="iv in interviewers" :key="iv.id" :value="iv.id">{{ iv.name }}</option>
          </select>
        </div>
      </Card>

      <div class="flex gap-3">
        <button class="px-4 h-11 rounded-md border border-border text-text-primary hover:bg-subtle" @click="reset">
          <ArrowLeft :size="16" class="inline mr-1" /> 返回
        </button>
        <div class="flex-1">
          <BatchActionBar
            :selected="batchSelected"
            :executing="executing"
            :action-label="batchTypes.find((b) => b.type === selectedType)?.label || '执行批量操作'"
            :disabled="selectedType === 'assign_interviewer' && !interviewerId"
            :disabled-reason="selectedType === 'assign_interviewer' && !interviewerId ? '请先选择面试官' : ''"
            @execute="execute"
          />
        </div>
      </div>
    </div>

    <!-- Step 3: 执行中 -->
    <div v-else-if="step === 'execute'" class="text-center py-12">
      <div class="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p class="text-sm text-text-secondary">正在逐项执行...（{{ results.length }}/{{ executingTotal }}）</p>
    </div>

    <!-- Step 4: 结果 -->
    <div v-else-if="step === 'result'">
      <PartialSuccess
        :results="batchResults"
        class="mb-4"
        @retry="retryFailed"
      />

      <div class="flex gap-3">
        <button
          class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover"
          @click="reset"
        >
          完成
        </button>
      </div>
    </div>

    <HighRiskConfirm
      v-model:open="confirmOpen"
      :title="`批量${batchTypes.find((b) => b.type === selectedType)?.label || '执行'}${retryingIds.length ? '（重试失败项）' : ''}`"
      :description="retryingIds.length ? `将重试 ${retryingIds.length} 个失败项，请重新完成身份验证后提交。` : `将对 ${selectedItems.length} 名对象执行批量操作，提交后请勿关闭页面。`"
      :targets="confirmTargets"
      impact-summary="批量执行会立即影响所选对象，触发状态变更与通知；执行后可在结果页查看失败项并单独重试。"
      confirm-label="确认执行"
      reauth-required
      :executing="executing"
      :error-message="confirmError"
      @confirm="confirmExecute"
      @cancel="cancelConfirm"
      @update:error-message="(v) => confirmError = v"
      @retry="confirmError = ''"
    >
      <template #extra>
        <label class="block text-sm font-medium text-text-primary mb-1.5">执行原因（必填，至少 5 字，用于审计）</label>
        <input
          v-model="confirmReason"
          class="w-full px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          placeholder="执行原因：例如社团开放日集中发送邀请"
        />
      </template>
    </HighRiskConfirm>
  </div>
</template>