<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { HighRiskConfirm } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { NameSearch, type SearchResult } from '@/components/form'
import WithdrawAction from '@/components/operation/WithdrawAction.vue'
import { get, post } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import type { PageState } from '@/types/machine'
import { Mail, UserPlus, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from '@lucide/vue'

interface Invite {
  id: string
  candidateId?: string
  candidateName: string
  candidateStudentId?: string
  clubName?: string
  departmentId?: string | null
  departmentName?: string | null
  status: string
  sentAt: string
  acceptedAt: string | null
  expiredAt: string
  withdrawnAt?: string | null
}
interface Candidate { id: string; studentId: string; name: string; isMember: boolean }
interface Dept { id: string; name: string }

const route = useRoute()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const items = ref<Invite[]>([])
const departments = ref<Dept[]>([])
const isManageView = computed(() => route.meta.view === 'manage')
const actingId = ref<string | null>(null)

// 发送邀请弹窗
const showSend = ref(false)
const candidateKeyword = ref('')
const candidates = ref<Candidate[]>([])
const selectedCandidate = ref<Candidate | null>(null)
const targetDept = ref('')
const sendError = ref('')
const sendSubmitting = ref(false)

const actionableStatuses = ['sent', 'pending_acceptance']

// 接受邀请高风险确认
const acceptTarget = ref<Invite | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const path = isManageView.value ? `/org/${clubId}/members/invite` : `/me/invitations/membership`
  const result = await get<{ items: Invite[]; departments?: Dept[] }>(path)
  if (result.kind === 'completed') {
    items.value = result.data.items
    if (result.data.departments) departments.value = result.data.departments
    state.value = 'normal'
  } else if (result.kind === 'accepted') {
    state.value = 'loading'
  } else {
    const code = result.error.code as ErrorCode
    pageError.value = { code, message: ERROR_MESSAGES[code] ?? result.error.message, supportId: result.error.supportId }
    state.value = errorToPageState(code)
  }
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function isActionable(inv: Invite): boolean {
  return actionableStatuses.includes(inv.status)
}

function isExpired(inv: Invite): boolean {
  return inv.status === 'expired' || (isActionable(inv) && new Date(inv.expiredAt).getTime() < Date.now())
}

// 候选搜索（姓名连续子串/学号精确）
async function searchCandidates() {
  const clubId = route.params.clubId as string
  const r = await get<{ items: Candidate[] }>(`/org/${clubId}/members/invite/candidates`, { search: candidateKeyword.value })
  if (r.kind === 'completed') {
    candidates.value = r.data.items
  }
}

const searchResults = computed<SearchResult[]>(() =>
  candidates.value.map((c) => ({
    id: c.id,
    name: c.name,
    subtitle: c.isMember ? `${c.studentId} · 已是成员` : c.studentId,
    group: '候选人',
    match: 'substring' as const,
    score: 0,
  })),
)

function onSelectCandidate(r: SearchResult) {
  const found = candidates.value.find((c) => c.id === r.id)
  if (found) selectedCandidate.value = found
}

function openSend() {
  candidateKeyword.value = ''
  candidates.value = []
  selectedCandidate.value = null
  targetDept.value = departments.value[0]?.id ?? ''
  sendError.value = ''
  showSend.value = true
}

async function handleSend() {
  if (!selectedCandidate.value) {
    sendError.value = '请选择目标候选人'
    return
  }
  sendSubmitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/invite`, {
    candidateId: selectedCandidate.value.id,
    departmentId: targetDept.value || null,
    expireDays: 7,
  })
  sendSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success('邀请已发送')
    showSend.value = false
    await loadData()
  } else {
    sendError.value = '发送失败，请重试'
  }
}

async function handleWithdraw(inv: Invite) {
  actingId.value = inv.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/invite/${inv.id}/withdraw`, {})
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('邀请已撤回')
    await loadData()
  } else {
    toastError(r, '撤回失败，请重试')
  }
}

async function handleRespond(inv: Invite, action: 'accept' | 'reject') {
  actingId.value = inv.id
  const r = await post(`/me/invitations/membership/${inv.id}/respond`, { action })
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success(action === 'accept' ? '已整体接受邀请' : '已拒绝邀请')
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

// Casdoor 回读确认：接受后成员身份正式生效
async function handleSyncConfirm(inv: Invite) {
  actingId.value = inv.id
  const r = await post(`/me/invitations/membership/${inv.id}/sync-confirm`)
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('已确认生效')
    await loadData()
  } else {
    toastError(r, '确认失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="常规入社邀请" :error="pageError" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">{{ isManageView ? '常规入社邀请' : '我的入社邀请' }}</h1>
        <button v-if="isManageView" class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="openSend">
          <UserPlus :size="16" /> 发送邀请
        </button>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" :title="isManageView ? '暂无入社邀请' : '暂无待处理的入社邀请'" :description="isManageView ? '发出的入社邀请将显示在这里' : '收到邀请后将在这里处理'" />

      <div v-else class="space-y-3">
        <Card v-for="inv in items" :key="inv.id">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary">
                <Mail :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ isManageView ? inv.candidateName : inv.clubName }}</p>
                <p class="text-xs text-text-secondary">{{ isManageView ? inv.candidateStudentId : inv.candidateName }}</p>
                <p v-if="inv.departmentName" class="text-xs text-text-secondary mt-0.5">加入部门：{{ inv.departmentName }}</p>
              </div>
            </div>
            <StateTag :status="inv.status" />
          </div>
          <div class="mt-3 flex items-center gap-4 text-xs text-text-secondary">
            <span>发送于 {{ formatDate(inv.sentAt) }}</span>
            <span v-if="inv.acceptedAt" class="text-success">接受于 {{ formatDate(inv.acceptedAt) }}</span>
            <span v-if="inv.withdrawnAt" class="text-danger">撤回于 {{ formatDate(inv.withdrawnAt) }}</span>
            <span v-else>截止 {{ formatDate(inv.expiredAt) }}</span>
          </div>

          <!-- 已过期提示 -->
          <div v-if="isExpired(inv) && isActionable(inv)" class="mt-2 flex items-center gap-1 text-xs text-warning">
            <AlertTriangle :size="12" /> 邀请已过期，无法处理
          </div>

          <!-- 管理视角：撤回仅限待处理且未被接受 -->
          <div v-if="isManageView && isActionable(inv) && !isExpired(inv)" class="mt-2">
            <WithdrawAction
              label="撤回邀请"
              confirm-text="撤回后该候选人需重新查找并再次邀请。确定要撤回该邀请吗？"
              :disabled="actingId === inv.id"
              :loading="actingId === inv.id"
              @confirm="handleWithdraw(inv)"
            />
          </div>

          <!-- 被邀请人视角：整体接受/整体拒绝（过期不可处理） -->
          <div v-if="!isManageView && isActionable(inv) && !isExpired(inv)" class="mt-3">
            <div class="rounded-lg bg-warning-subtle p-2.5 mb-3">
              <p class="text-xs text-warning">接受邀请将同时加入社团{{ inv.departmentName ? `和「${inv.departmentName}」部门` : '' }}，不可拆分接受</p>
            </div>
            <div class="flex gap-2">
              <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" :disabled="actingId === inv.id" @click="acceptTarget = inv">
                <CheckCircle2 :size="16" /> 整体接受
              </button>
              <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-danger text-danger text-sm hover:bg-danger-subtle" :disabled="actingId === inv.id" @click="handleRespond(inv, 'reject')">
                <XCircle :size="16" /> 拒绝
              </button>
            </div>
          </div>

          <!-- 已接受待回读确认：Casdoor 同步确认 -->
          <div v-if="!isManageView && inv.status === 'accepted_pending_sync'" class="mt-3">
            <div class="rounded-lg bg-warning-subtle p-2.5 mb-3 flex items-center gap-2">
              <RefreshCw :size="14" class="text-warning" />
              <p class="text-xs text-warning">已接受，正在等待成员身份生效确认</p>
            </div>
            <button class="px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover" :disabled="actingId === inv.id" @click="handleSyncConfirm(inv)">{{ actingId === inv.id ? '确认中...' : '确认生效' }}</button>
          </div>

          <!-- 已生效 -->
          <div v-if="inv.status === 'effective'" class="mt-2 flex items-center gap-1 text-xs text-success">
            <CheckCircle2 :size="12" /> 已生效，欢迎加入
          </div>
        </Card>
      </div>

      <!-- 发送邀请弹窗 -->
      <div v-if="showSend" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="发送入社邀请">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-base font-medium text-text-primary mb-4">发送常规入社邀请</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-text-secondary mb-1">搜索候选人</label>
              <NameSearch
                v-model="candidateKeyword"
                :results="searchResults"
                :loading="false"
                placeholder="姓名或学号..."
                @update:model-value="searchCandidates"
                @select="onSelectCandidate"
              />
              <p v-if="candidateKeyword && candidates.length === 0" class="mt-2 text-xs text-text-secondary">未找到匹配的候选人</p>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">加入部门（可选）</label>
              <select v-model="targetDept" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="">不指定</option>
                <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
            <p v-if="sendError" class="text-xs text-danger" role="alert">{{ sendError }}</p>
            <div class="flex gap-2">
              <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="showSend = false">取消</button>
              <button class="flex-1 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" :disabled="sendSubmitting" @click="handleSend">{{ sendSubmitting ? '发送中...' : '发送邀请' }}</button>
            </div>
          </div>
        </div>
      </div>

      <HighRiskConfirm
        :open="!!acceptTarget"
        title="确认接受入社邀请"
        description="接受后将建立该社团的成员关系，以及邀请中指定的部门关系。"
        :targets="acceptTarget ? [
          { id: 'club', label: '目标社团', detail: acceptTarget.clubName ?? '该社团' },
          { id: 'dept', label: '加入部门', detail: acceptTarget.departmentName ?? '不指定' },
          { id: 'status', label: '当前状态', detail: '待处理邀请' },
        ] : []"
        impact-summary="接受后将创建成员生效任务。系统完成 Casdoor Group 写入并可信回读前，不会开放成员权限。"
        confirm-label="确认接受"
        :executing="acceptTarget !== null && actingId === acceptTarget.id"
        @confirm="acceptTarget && handleRespond(acceptTarget, 'accept')"
        @update:open="(v) => { if (!v) acceptTarget = null }"
      />
    </div>
  </PageStateBoundary>
</template>
