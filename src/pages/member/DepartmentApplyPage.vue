<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { ArrowRightLeft, Plus, AlertTriangle, RefreshCw } from '@lucide/vue'

interface DeptApply {
  id: string; applicantId: string; applicantName: string
  type: 'join' | 'leave' | 'transfer'
  currentDept: string
  targetDeptId: string | null; targetDeptName: string | null
  reason: string; status: string; submittedAt: string
  decidedAt: string | null; decidedBy: string | null; rejectReason: string | null
}
interface Dept { id: string; name: string }

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const items = ref<DeptApply[]>([])
const departments = ref<Dept[]>([])

// 驳回弹窗
const rejectingId = ref<string | null>(null)
const rejectReason = ref('')
const rejectError = ref('')

// 发起申请弹窗
const showCreate = ref(false)
const createType = ref<'join' | 'leave' | 'transfer'>('join')
const createDept = ref('')
const createReason = ref('')
const createError = ref('')
const createSubmitting = ref(false)

const actingId = ref<string | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: DeptApply[]; departments: Dept[] }>(`/org/${clubId}/members/department-apply`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    departments.value = result.data.departments
    state.value = 'normal'
  } else if (result.kind === 'accepted') {
    // P1-1：202/IFC-ERR-014 异步受理（数据生成中）不再永久卡 loading，降级为可重试的 error 态
    state.value = 'error'
    pageError.value = { code: 'IFC-ERR-014', message: '数据正在生成中，请稍后重试' }
  } else {
    const code = result.error.code as ErrorCode
    pageError.value = { code, message: ERROR_MESSAGES[code] ?? result.error.message, supportId: result.error.supportId }
    state.value = errorToPageState(code)
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 自审拦截：申请人不能审批自己的申请 + 前端权限校验
function canApprove(item: DeptApply): boolean {
  return item.applicantId !== session.workspace?.memberId && session.hasPermission('club:member:manage')
}

function startReject(id: string) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectError.value = ''
}

async function handleReject() {
  if (!rejectReason.value.trim()) {
    rejectError.value = '驳回必须填写原因'
    return
  }
  actingId.value = rejectingId.value
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/department-apply/${rejectingId.value}/decide`, { decision: 'reject', rejectReason: rejectReason.value.trim() })
  actingId.value = null
  rejectingId.value = null
  if (r.kind === 'completed') {
    toast.success('已驳回')
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

async function handleApprove(id: string) {
  actingId.value = id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/department-apply/${id}/decide`, { decision: 'approve' })
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('已批准，待执行生效')
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

// 执行已批准申请（首次可能失败，失败后可重试）
async function handleExecute(id: string) {
  actingId.value = id
  const clubId = route.params.clubId as string
  const r = await post<{ failed?: boolean; message?: string }>(`/org/${clubId}/members/department-apply/${id}/execute`)
  actingId.value = null
  if (r.kind === 'completed') {
    if (r.data.failed) {
      toast.warning(r.data.message || '执行失败，可重试')
    } else {
      toast.success('关系变更已生效')
    }
    await loadData()
  } else {
    toastError(r, '执行失败，请重试')
  }
}

async function handleWithdraw(id: string) {
  actingId.value = id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/department-apply/${id}/withdraw`)
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('申请已撤回')
    await loadData()
  } else if (r.kind === 'accepted') {
    toastAcceptedAction('撤回已受理，正在后台处理')
  } else if (r.kind === 'rejected' && r.error) {
    toastError(r, '撤回失败')
  }
}

function openCreate() {
  createType.value = 'join'
  createDept.value = departments.value[0]?.id ?? ''
  createReason.value = ''
  createError.value = ''
  showCreate.value = true
}

async function handleCreate() {
  if (createType.value !== 'leave' && !createDept.value) {
    createError.value = '请选择目标部门'
    return
  }
  if (!createReason.value.trim()) {
    createError.value = '请填写申请原因'
    return
  }
  createSubmitting.value = true
  const clubId = route.params.clubId as string
  const r = await post<{ id: string; status: string }>(`/org/${clubId}/members/department-apply`, {
    type: createType.value,
    targetDeptId: createType.value === 'leave' ? null : createDept.value,
    reason: createReason.value.trim(),
  })
  createSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success('申请已提交')
    showCreate.value = false
    await loadData()
  } else {
    toastError(r, '提交失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="部门关系申请" :error="pageError" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">部门关系申请</h1>
        <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="openCreate">
          <Plus :size="16" /> 发起申请
        </button>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无部门关系申请" description="成员发起的部门转移申请将显示在这里" />

      <div v-else class="space-y-3">
        <Card v-for="item in items" :key="item.id">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ item.applicantName }}</p>
              <p v-if="!canApprove(item) && item.status === 'under_review'" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                <AlertTriangle :size="12" /> 不能审批自己的申请
              </p>
              <p v-else-if="item.decidedBy" class="text-xs text-text-secondary mt-0.5">由 {{ item.decidedBy }} 处理</p>
            </div>
            <StateTag :status="item.status" />
          </div>
          <div class="flex items-center gap-2 text-sm text-text-secondary mb-2">
            <span>{{ item.currentDept === '-' ? '未加入部门' : item.currentDept }}</span>
            <ArrowRightLeft :size="14" />
            <span class="text-primary">{{ item.type === 'leave' ? '退出' : item.targetDeptName }}</span>
          </div>
          <p class="text-xs text-text-secondary">原因：{{ item.reason }}</p>
          <p v-if="item.status === 'rejected' && item.rejectReason" class="text-xs text-danger mt-1">驳回原因：{{ item.rejectReason }}</p>
          <p class="text-xs text-text-secondary mt-1">提交于 {{ formatDate(item.submittedAt) }}</p>

          <!-- 待审批：批准/驳回（自审拦截）；本人可撤回 -->
          <div v-if="item.status === 'under_review'" class="mt-3 flex gap-2">
            <template v-if="canApprove(item)">
              <button class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90" :disabled="actingId === item.id" @click="handleApprove(item.id)">{{ actingId === item.id ? '处理中...' : '批准' }}</button>
              <button class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle" :disabled="actingId === item.id" @click="startReject(item.id)">驳回</button>
            </template>
            <button
              v-if="item.applicantId === session.workspace?.memberId"
              class="px-3 py-1.5 rounded-md border border-border text-text-secondary text-xs hover:border-danger hover:text-danger"
              :disabled="actingId === item.id"
              @click="handleWithdraw(item.id)"
            >
              {{ actingId === item.id ? '处理中...' : '撤回申请' }}
            </button>
          </div>

          <!-- 已批准待执行：执行/失败重试（与批准一致：非本人 + member:manage） -->
          <div v-if="item.status === 'approved_pending_exec'" class="mt-3">
            <button v-if="canApprove(item)" class="px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover flex items-center gap-1" :disabled="actingId === item.id" @click="handleExecute(item.id)">
              <RefreshCw :size="12" /> {{ actingId === item.id ? '执行中...' : '执行生效' }}
            </button>
          </div>
          <div v-if="item.status === 'exec_failed'" class="mt-3">
            <p class="text-xs text-warning mb-2 flex items-center gap-1"><AlertTriangle :size="12" /> 执行失败，原关系保持不变，可重试</p>
            <button v-if="canApprove(item)" class="px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover flex items-center gap-1" :disabled="actingId === item.id" @click="handleExecute(item.id)">
              <RefreshCw :size="12" /> {{ actingId === item.id ? '重试中...' : '重试' }}
            </button>
          </div>
        </Card>
      </div>

      <!-- 驳回弹窗 -->
      <div v-if="rejectingId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="驳回申请">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-base font-medium text-text-primary mb-2">驳回申请</h3>
          <p class="text-xs text-warning mb-3">驳回必须填写原因</p>
          <textarea
            v-model="rejectReason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="请填写驳回原因..."
            aria-label="驳回原因"
          />
          <p v-if="rejectError" class="mt-2 text-xs text-danger" role="alert">{{ rejectError }}</p>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="rejectingId = null">取消</button>
            <button class="flex-1 h-9 rounded-md bg-danger text-text-on-primary text-sm font-medium hover:opacity-90" @click="handleReject">确认驳回</button>
          </div>
        </div>
      </div>

      <!-- 发起申请弹窗 -->
      <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="发起部门关系申请">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-base font-medium text-text-primary mb-4">发起申请</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-text-secondary mb-1">申请类型</label>
              <select v-model="createType" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="join">加入部门</option>
                <option value="transfer">调换部门</option>
                <option value="leave">退出部门</option>
              </select>
            </div>
            <div v-if="createType !== 'leave'">
              <label class="block text-xs text-text-secondary mb-1">目标部门</label>
              <select v-model="createDept" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">申请原因</label>
              <textarea v-model="createReason" rows="3" class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="请填写申请原因..." aria-label="申请原因" />
            </div>
            <p v-if="createError" class="text-xs text-danger" role="alert">{{ createError }}</p>
            <div class="flex gap-2">
              <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="showCreate = false">取消</button>
              <button class="flex-1 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" :disabled="createSubmitting" @click="handleCreate">{{ createSubmitting ? '提交中...' : '提交申请' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
