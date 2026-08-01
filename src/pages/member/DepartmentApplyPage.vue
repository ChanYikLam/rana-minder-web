<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { ArrowRightLeft, Plus, AlertTriangle } from '@lucide/vue'

interface DeptApply {
  id: string
  applicantId: string
  applicantName: string
  operation: 'join' | 'leave' | 'transfer'
  currentDept: string
  targetDept: string
  reason: string
  status: string
  submittedAt: string
  rejectReason?: string
}

const departments = ['技术部', '运营部', '设计部', '人事部']
const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const items = ref<DeptApply[]>([])
const showForm = ref(false)
const form = ref({ operation: 'transfer' as DeptApply['operation'], currentDept: '', targetDept: '', reason: '' })
const creating = ref(false)
const actingId = ref<string | null>(null)
const rejectingId = ref<string | null>(null)
const rejectReason = ref('')
const rejectError = ref('')

function clubId(): string {
  return (route.params.clubId as string) || 'club-001'
}

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: DeptApply[] }>(`/org/${clubId()}/members/department-apply`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function canApprove(item: DeptApply): boolean {
  return item.applicantId !== session.user?.id
}

function canWithdraw(item: DeptApply): boolean {
  return item.applicantId === session.user?.id && item.status === 'under_review'
}

function resetForm() {
  form.value = { operation: 'transfer', currentDept: '', targetDept: '', reason: '' }
}

async function handleCreate() {
  creating.value = true
  const result = await post(`/org/${clubId()}/members/department-apply`, form.value)
  creating.value = false
  if (result.kind === 'completed') {
    toast.success('部门关系申请已提交')
    showForm.value = false
    resetForm()
    await loadData()
  } else {
    toast.error('提交失败，请重试')
  }
}

async function handleWithdraw(item: DeptApply) {
  actingId.value = item.id
  const result = await post(`/org/${clubId()}/members/department-apply/${item.id}/withdraw`)
  actingId.value = null
  if (result.kind === 'completed') {
    toast.success('申请已撤回')
  } else {
    toast.error('撤回失败，请刷新后重试')
  }
  await loadData()
}

function startReject(id: string) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectError.value = ''
}

async function handleReject() {
  if (!rejectReason.value.trim()) {
    rejectError.value = '请填写驳回原因'
    return
  }
  if (!rejectingId.value) return

  actingId.value = rejectingId.value
  const result = await post(`/org/${clubId()}/members/department-apply/${rejectingId.value}/decide`, {
    decision: 'reject',
    reason: rejectReason.value.trim(),
  })
  actingId.value = null
  if (result.kind === 'completed') {
    toast.success('申请已驳回')
    rejectingId.value = null
    await loadData()
  } else {
    rejectError.value = '驳回失败，请刷新后重试'
    await loadData()
  }
}

async function handleApprove(item: DeptApply) {
  actingId.value = item.id
  const result = await post(`/org/${clubId()}/members/department-apply/${item.id}/decide`, { decision: 'approve' })
  actingId.value = null
  if (result.kind === 'completed') {
    toast.success('申请已批准')
  } else {
    toast.error('批准失败，请刷新后重试')
  }
  await loadData()
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="部门关系申请" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">部门关系申请</h1>
        <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="showForm = !showForm">
          <Plus :size="16" /> {{ showForm ? '收起' : '发起申请' }}
        </button>
      </div>

      <Card v-if="showForm" class="mb-4">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">申请类型</label>
            <select v-model="form.operation" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
              <option value="join">加入部门</option>
              <option value="leave">退出部门</option>
              <option value="transfer">跨部门调动</option>
            </select>
          </div>
          <div v-if="form.operation !== 'join'">
            <label class="block text-sm font-medium text-text-primary mb-1">当前部门</label>
            <select v-model="form.currentDept" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
              <option value="">请选择当前部门</option>
              <option v-for="department in departments" :key="department" :value="department">{{ department }}</option>
            </select>
          </div>
          <div v-if="form.operation !== 'leave'">
            <label class="block text-sm font-medium text-text-primary mb-1">目标部门</label>
            <select v-model="form.targetDept" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
              <option value="">请选择目标部门</option>
              <option v-for="department in departments" :key="department" :value="department">{{ department }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">申请原因</label>
            <textarea v-model="form.reason" rows="3" class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary" placeholder="请填写申请原因" />
          </div>
          <button
            class="w-full h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="creating || !form.reason.trim() || (form.operation !== 'join' && !form.currentDept) || (form.operation !== 'leave' && !form.targetDept) || (form.operation === 'transfer' && form.currentDept === form.targetDept)"
            @click="handleCreate"
          >
            {{ creating ? '提交中...' : '提交申请' }}
          </button>
        </div>
      </Card>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无部门关系申请" description="可通过发起申请办理加入、退出或跨部门调动" />

      <div v-else class="space-y-3">
        <Card v-for="item in items" :key="item.id">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ item.applicantName }}</p>
              <p v-if="!canApprove(item)" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                <AlertTriangle :size="12" /> 不能审批自己的申请
              </p>
            </div>
            <StateTag :status="item.status" />
          </div>
          <div class="flex items-center gap-2 text-sm text-text-secondary mb-2">
            <span>{{ item.currentDept || '未加入部门' }}</span>
            <ArrowRightLeft :size="14" />
            <span class="text-primary">{{ item.targetDept || '退出部门' }}</span>
          </div>
          <p class="text-xs text-text-secondary">原因：{{ item.reason }}</p>
          <p v-if="item.rejectReason" class="text-xs text-danger mt-1">驳回原因：{{ item.rejectReason }}</p>
          <p class="text-xs text-text-secondary mt-1">提交于 {{ formatDate(item.submittedAt) }}</p>

          <div v-if="item.status === 'under_review'" class="mt-3 flex gap-2">
            <button v-if="canWithdraw(item)" class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60" :disabled="actingId !== null" @click="handleWithdraw(item)">
              {{ actingId === item.id ? '撤回中...' : '撤回申请' }}
            </button>
            <template v-if="canApprove(item)">
              <button class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60" :disabled="actingId !== null" @click="handleApprove(item)">
                {{ actingId === item.id ? '处理中...' : '批准' }}
              </button>
              <button class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60" :disabled="actingId !== null" @click="startReject(item.id)">
                驳回
              </button>
            </template>
          </div>
        </Card>
      </div>

      <div v-if="rejectingId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="驳回申请">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-base font-medium text-text-primary mb-2">驳回申请</h3>
          <p class="text-xs text-warning mb-3">驳回必须填写原因</p>
          <textarea v-model="rejectReason" rows="3" class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="请填写驳回原因..." aria-label="驳回原因" />
          <p v-if="rejectError" class="mt-2 text-xs text-danger" role="alert">{{ rejectError }}</p>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle disabled:opacity-60" :disabled="actingId !== null" @click="rejectingId = null">取消</button>
            <button class="flex-1 h-9 rounded-md bg-danger text-text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-60" :disabled="actingId !== null" @click="handleReject">{{ actingId ? '处理中...' : '确认驳回' }}</button>
          </div>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
