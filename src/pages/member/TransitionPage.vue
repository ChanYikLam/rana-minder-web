<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import type { PageState } from '@/types/machine'
import { Crown, ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, Users, Plus, Trash2, RefreshCw } from '@lucide/vue'

interface PlanItem { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }
interface TransitionData {
  currentLeader: { id: string; name: string; title: string }
  candidates: PlanItem[]
  appointments: PlanItem[]
  canExecute: boolean
  executedAt: string | null
  results: { memberId: string; name: string; action: string; targetTitle: string; success: boolean; message: string }[]
}
interface Member { id: string; name: string; studentId: string; department: string; title: string; status: string }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const data = ref<TransitionData | null>(null)
const members = ref<Member[]>([])
const executing = ref(false)
const saving = ref(false)
const showEditor = ref(false)
const showExecuteConfirm = ref(false)

// 编辑方案表单
const editList = ref<'candidates' | 'appointments'>('candidates')
const editMemberId = ref('')
const editTitle = ref('')
const editError = ref('')

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<TransitionData>(`/org/${clubId}/members/transition`)
  if (result.kind === 'completed') {
    data.value = result.data
    state.value = 'normal'
  } else if (result.kind === 'accepted') {
    state.value = 'loading'
  } else {
    const code = result.error.code as ErrorCode
    pageError.value = { code, message: ERROR_MESSAGES[code] ?? result.error.message, supportId: result.error.supportId }
    state.value = errorToPageState(code)
  }
}

async function loadMembers() {
  const clubId = route.params.clubId as string
  const r = await get<{ items: Member[] }>(`/org/${clubId}/members`)
  if (r.kind === 'completed') members.value = r.data.items
}

function openEditor() {
  editMemberId.value = ''
  editTitle.value = ''
  editError.value = ''
  showEditor.value = true
}

function addPlanItem() {
  if (!data.value) return
  if (!editMemberId.value) { editError.value = '请选择成员'; return }
  if (!editTitle.value.trim()) { editError.value = '请填写目标职位'; return }
  const m = members.value.find((x) => x.id === editMemberId.value)
  if (!m) { editError.value = '成员不存在'; return }
  const item: PlanItem = { memberId: m.id, name: m.name, currentTitle: m.title, proposedTitle: editTitle.value.trim(), department: m.department }
  const list = editList.value === 'candidates' ? data.value.candidates : data.value.appointments
  if (list.some((x) => x.memberId === m.id)) { editError.value = '该成员已在方案中'; return }
  list.push(item)
  editError.value = ''
}

function removePlanItem(list: 'candidates' | 'appointments', memberId: string) {
  if (!data.value) return
  if (list === 'candidates') data.value.candidates = data.value.candidates.filter((x) => x.memberId !== memberId)
  else data.value.appointments = data.value.appointments.filter((x) => x.memberId !== memberId)
}

async function savePlan() {
  if (!data.value) return
  saving.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/transition/plan`, {
    candidates: data.value.candidates,
    appointments: data.value.appointments,
  })
  saving.value = false
  if (r.kind === 'completed') {
    toast.success('换届方案已保存')
    showEditor.value = false
    await loadData()
  } else {
    toastError(r, '保存失败，请重试')
  }
}

async function handleExecute() {
  if (!data.value?.canExecute) return
  executing.value = true
  const clubId = route.params.clubId as string
  const r = await post<{ results: TransitionData['results'] }>(`/org/${clubId}/members/transition`)
  executing.value = false
  if (r.kind === 'completed') {
    data.value.results = r.data.results
    data.value.executedAt = new Date().toISOString()
    data.value.canExecute = false
    const failed = r.data.results.filter((x) => !x.success)
    toast.success(failed.length === 0 ? '换届执行完成' : '换届执行部分成功')
  } else {
    toastError(r, '换届执行失败，请重试')
  }
}

// 失败项重试
async function handleRetry() {
  executing.value = true
  const clubId = route.params.clubId as string
  const r = await post<{ results: TransitionData['results'] }>(`/org/${clubId}/members/transition/retry`)
  executing.value = false
  if (r.kind === 'completed' && data.value) {
    data.value.results = r.data.results
    toast.success('失败项已重试成功')
  } else {
    toastError(r, '重试失败，请重试')
  }
}

onMounted(async () => {
  await loadData()
  await loadMembers()
})
</script>

<template>
  <PageStateBoundary :state="state" title="换届管理" :error="pageError" @retry="loadData">
    <div v-if="data" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">换届管理</h1>
        <button v-if="!data.executedAt" class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="openEditor">
          <Plus :size="16" /> 编辑方案
        </button>
      </div>

      <!-- 执行前 -->
      <template v-if="!data.executedAt">
        <!-- 当前负责人 -->
        <Card class="mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-text-on-primary"><Crown :size="24" /></div>
            <div>
              <p class="text-sm text-text-secondary">当前负责人</p>
              <p class="text-base font-medium text-text-primary">{{ data.currentLeader.name }} · {{ data.currentLeader.title }}</p>
            </div>
          </div>
        </Card>

        <!-- 新任方案 -->
        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">新任方案（{{ data.candidates.length }}）</h2>
          <div v-if="data.candidates.length === 0" class="text-sm text-text-secondary text-center py-4">暂无晋升安排</div>
          <div v-else class="space-y-2">
            <div v-for="c in data.candidates" :key="c.memberId" class="flex items-center justify-between rounded-lg border border-border p-3">
              <div class="flex items-center gap-2">
                <Users :size="16" class="text-text-secondary" />
                <div>
                  <p class="text-sm text-text-primary">{{ c.name }}</p>
                  <p class="text-xs text-text-secondary">{{ c.department }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs text-text-secondary">{{ c.currentTitle }}</p>
                <p class="text-sm font-medium text-primary">→ {{ c.proposedTitle }}</p>
              </div>
              <button v-if="showEditor" class="text-danger ml-2" aria-label="移除" @click="removePlanItem('candidates', c.memberId)"><Trash2 :size="16" /></button>
            </div>
          </div>
        </Card>

        <!-- 任命方案 -->
        <Card v-if="data.appointments.length > 0 || showEditor" class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">同期任命（{{ data.appointments.length }}）</h2>
          <div v-if="data.appointments.length === 0" class="text-sm text-text-secondary text-center py-4">暂无同期任命</div>
          <div v-else class="space-y-2">
            <div v-for="a in data.appointments" :key="a.memberId" class="flex items-center justify-between rounded-lg border border-border p-3">
              <span class="text-sm text-text-primary">{{ a.name }} · {{ a.department }}</span>
              <div class="text-right">
                <p class="text-xs text-text-secondary">{{ a.currentTitle }}</p>
                <p class="text-sm font-medium text-primary">→ {{ a.proposedTitle }}</p>
              </div>
              <button v-if="showEditor" class="text-danger ml-2" aria-label="移除" @click="removePlanItem('appointments', a.memberId)"><Trash2 :size="16" /></button>
            </div>
          </div>
        </Card>

        <!-- 方案编辑器 -->
        <Card v-if="showEditor" class="mb-4 border-primary">
          <h2 class="text-base font-medium text-text-primary mb-3">添加方案项</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-text-secondary mb-1">方案类型</label>
              <select v-model="editList" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="candidates">晋升方案（新负责人等）</option>
                <option value="appointments">同期任命（部长/副部长等）</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">成员</label>
              <select v-model="editMemberId" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="">请选择成员</option>
                <option v-for="m in members.filter((x) => x.status === 'active')" :key="m.id" :value="m.id">{{ m.name }}（{{ m.department }} · {{ m.title }}）</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">目标职位</label>
              <input v-model="editTitle" type="text" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="如：负责人 / 副部长" aria-label="目标职位" />
            </div>
            <p v-if="editError" class="text-xs text-danger" role="alert">{{ editError }}</p>
            <button class="w-full h-9 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary-subtle" @click="addPlanItem">加入方案</button>
            <button class="w-full h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" :disabled="saving" @click="savePlan">{{ saving ? '保存中...' : '保存方案' }}</button>
          </div>
        </Card>

        <!-- 高风险提示 -->
        <Card class="mb-4 border-warning">
          <div class="flex items-start gap-2">
            <ShieldAlert :size="20" class="text-warning mt-0.5 shrink-0" />
            <div class="text-sm">
              <p class="font-medium text-warning">换届操作需重新认证</p>
              <p class="text-xs text-text-secondary mt-1">系统先确认新任生效，再移除旧任；任何时刻均保持至少一名有效社团负责人。新任失败将撤回，旧任部分失败保留新任持续重试，部分失败不回滚已成功新任。</p>
            </div>
          </div>
        </Card>

        <button
          class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
          :disabled="executing || !data.canExecute"
          @click="showExecuteConfirm = true"
        >
          <ShieldAlert :size="18" /> {{ executing ? '执行中...' : '确认执行换届' }}
        </button>
        <p v-if="!data.canExecute" class="text-xs text-text-secondary mt-2 text-center">需先保存包含至少一项晋升或任命的换届方案，且换届未执行</p>
      </template>

      <!-- 执行结果 -->
      <template v-else>
        <Card class="mb-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center justify-center w-12 h-12 rounded-full" :class="data.results.some((x) => !x.success) ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'">
              <CheckCircle2 v-if="!data.results.some((x) => !x.success)" :size="24" />
              <AlertTriangle v-else :size="24" />
            </div>
            <div>
              <p class="text-base font-medium text-text-primary">{{ data.results.some((x) => !x.success) ? '部分成功' : '换届完成' }}</p>
              <p class="text-sm text-text-secondary">成功 {{ data.results.filter((x) => x.success).length }} 项{{ data.results.some((x) => !x.success) ? `，失败 ${data.results.filter((x) => !x.success).length} 项` : '' }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <div v-for="r in data.results" :key="r.memberId + r.action" class="flex items-center gap-2 text-sm">
              <CheckCircle2 v-if="r.success" :size="14" class="text-success" />
              <AlertTriangle v-else :size="14" class="text-warning" />
              <span class="text-text-primary">{{ r.name }}</span>
              <span class="text-xs text-text-secondary">→ {{ r.targetTitle }}</span>
              <span class="text-xs ml-auto" :class="r.success ? 'text-success' : 'text-warning'">{{ r.message }}</span>
            </div>
          </div>

          <button v-if="data.results.some((x) => !x.success)" class="w-full mt-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover flex items-center justify-center gap-2" :disabled="executing" @click="handleRetry">
            <RefreshCw :size="16" /> {{ executing ? '重试中...' : '重试失败项' }}
          </button>
        </Card>

        <button class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover" @click="router.push(`/org/${route.params.clubId}/dashboard`)">
          返回工作台
        </button>
      </template>

      <HighRiskConfirm
        :open="showExecuteConfirm"
        title="确认执行换届"
        description="系统先确认新任生效，再移除旧任；任何时刻均保持至少一名有效社团负责人。"
        :targets="data ? [
          { id: data.currentLeader.id, label: data.currentLeader.name, detail: `${data.currentLeader.title}（现任负责人）` },
          ...data.candidates.map((c) => ({ id: `c-${c.memberId}`, label: c.name, detail: `${c.currentTitle} → ${c.proposedTitle}` })),
          ...data.appointments.map((a) => ({ id: `a-${a.memberId}`, label: a.name, detail: `${a.currentTitle} → ${a.proposedTitle}` })),
        ] : []"
        impact-summary="新任失败将撤回，旧任部分失败保留新任持续重试；部分失败不回滚已成功新任。"
        confirm-label="确认执行换届"
        reauth-required
        :executing="executing"
        @confirm="showExecuteConfirm = false; handleExecute()"
        @update:open="(v) => { if (!v) showExecuteConfirm = false }"
      />
    </div>
  </PageStateBoundary>
</template>
