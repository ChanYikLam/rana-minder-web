<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useLastLeaderGuard } from '@/composables/useLastLeaderGuard'
import type { PageState } from '@/types/machine'
import { UserMinus, LogOut, AlertTriangle, FileText, CheckCircle2, XCircle } from '@lucide/vue'

interface ExitMember { id: string; name: string; studentId: string; department: string; title: string; status: string; joinedAt: string; exitedAt: string | null }
interface Resignation { id: string; memberId: string; memberName: string; departmentName: string; title: string; reason: string; status: string; submittedAt: string; decidedAt: string | null; decidedBy: string | null }
interface ExitRequestRow { id: string; memberId: string; memberName: string; reason: string; status: string; submittedAt: string; decidedAt: string | null; decidedBy: string | null; confirmedAt: string | null; dueAt: string; overdue?: boolean; canWithdraw?: boolean; canConfirm?: boolean }

const route = useRoute()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
// P2：退出审批仅社团负责人/人事（canManageMembersFull），部门负责人虽有 club:member:manage 但必 403
const canApproveExit = computed(() =>
  workspace.hasPermission('club:member:manage') && workspace.currentRole !== 'department_leader',
)
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const items = ref<ExitMember[]>([])
const resignations = ref<Resignation[]>([])
const exitRequests = ref<ExitRequestRow[]>([])

// 移除/标记退出确认（标记退出用自定义弹窗；移除走高风险确认流）
const actingId = ref<string | null>(null)
const actingAction = ref<'remove' | 'mark_exit' | null>(null)
const actingMember = computed(() => items.value.find((m) => m.id === actingId.value) ?? null)
const reason = ref('')
const reasonError = ref('')
const actingSubmitting = ref(false)

// 移除成员（高风险：需重认证 + 必填原因）
const removeOpen = ref(false)
const removeSucceeded = ref(false)
const removeError = ref('')

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: ExitMember[]; resignations: Resignation[]; exitRequestsWithFlags?: ExitRequestRow[] }>(`/org/${clubId}/members/exit`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    resignations.value = result.data.resignations ?? []
    exitRequests.value = result.data.exitRequestsWithFlags ?? []
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
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

// ================= 主动退出申请（MEM-001：申请→审批→二次确认→离社） =================
const exitOpen = ref(false)
const exitReason = ref('')
const exitError = ref('')
const exitSubmitting = ref(false)

async function handleSubmitExitRequest() {
  if (!exitReason.value.trim()) {
    exitError.value = '请填写退出原因'
    return
  }
  exitSubmitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit-requests`, { reason: exitReason.value.trim() })
  exitSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success('退出申请已提交，等待负责人/人事审批')
    exitOpen.value = false
    exitReason.value = ''
    await loadData()
  } else if (r.kind === 'rejected' && r.error) {
    exitError.value = (r.error as { message?: string }).message || '提交失败'
  } else {
    exitError.value = '提交失败，请稍后重试'
  }
}

// 审批（负责人/人事）、本人撤回 / 二次确认
const exitActingId = ref<string | null>(null)

async function handleExitDecide(req: ExitRequestRow, decision: 'approve' | 'reject') {
  exitActingId.value = req.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit-requests/${req.id}/decide`, { decision })
  exitActingId.value = null
  if (r.kind === 'completed') {
    toast.success(decision === 'approve' ? '已批准，等待本人二次确认' : '已驳回退出申请')
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

async function handleExitWithdraw(req: ExitRequestRow) {
  exitActingId.value = req.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit-requests/${req.id}/withdraw`)
  exitActingId.value = null
  if (r.kind === 'completed') {
    toast.success('已撤回退出申请')
    await loadData()
  } else {
    toastError(r, '撤回失败，请重试')
  }
}

async function handleExitConfirm(req: ExitRequestRow) {
  exitActingId.value = req.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit-requests/${req.id}/confirm`)
  exitActingId.value = null
  if (r.kind === 'completed') {
    toast.success('已确认退出，正式离社')
    await loadData()
  } else {
    toastError(r, '确认失败，请重试')
  }
}

// 操作者不能通过移除入口移除自己
function canRemove(m: ExitMember): boolean {
  return m.id !== session.workspace?.memberId
}

// 最后负责人不可移除/退出（需先交接）
const { isLastLeader } = useLastLeaderGuard(items)

function openAction(id: string, action: 'remove' | 'mark_exit') {
  actingId.value = id
  actingAction.value = action
  reason.value = ''
  reasonError.value = ''
  if (action === 'remove') {
    removeOpen.value = true
    removeSucceeded.value = false
    removeError.value = ''
  }
}

function closeAction() {
  actingId.value = null
  actingAction.value = null
  reason.value = ''
  reasonError.value = ''
}

async function handleConfirmAction() {
  if (!reason.value.trim()) {
    reasonError.value = '原因不能为空'
    return
  }
  if (!actingId.value || !actingAction.value) return
  actingSubmitting.value = true
  const clubId = route.params.clubId as string
  const action = actingAction.value
  const targetId = actingId.value
  const r = await post(`/org/${clubId}/members/exit`, {
    memberId: targetId,
    action,
    reason: reason.value.trim(),
  })
  actingSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success(action === 'remove' ? '成员已移除' : '已标记退出')
    closeAction()
    await loadData()
  } else {
    toastError(r, action === 'remove' ? '移除失败，请重试' : '标记失败，请重试')
  }
}

async function handleConfirmRemove(proof?: string) {
  if (!reason.value.trim()) {
    reasonError.value = '移除原因不能为空'
    return
  }
  if (!actingId.value) return
  if (!proof) {
    removeError.value = '身份验证失败，请重试'
    return
  }
  actingSubmitting.value = true
  removeSucceeded.value = false
  removeError.value = ''
  const clubId = route.params.clubId as string
  const targetId = actingId.value
  const r = await post(`/org/${clubId}/members/exit`, {
    memberId: targetId,
    action: 'remove',
    reason: reason.value.trim(),
    reauthProof: proof,
  })
  actingSubmitting.value = false
  if (r.kind === 'completed') {
    removeSucceeded.value = true
    toast.success('成员已移除')
    closeAction()
    await loadData()
  } else {
    removeError.value = (r as { error?: { message?: string } }).error?.message || '移除失败，请重试'
  }
}

// 辞职审批
async function handleResignDecide(res: Resignation, decision: 'approve' | 'reject') {
  actingId.value = res.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/resignation/${res.id}/decide`, { decision })
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success(decision === 'approve' ? '已批准辞职' : '已驳回辞职')
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

// 本人提交辞职申请
const resignOpen = ref(false)
const resignReason = ref('')
const resignError = ref('')
const resignSubmitting = ref(false)

async function handleSubmitResignation() {
  if (!resignReason.value.trim()) {
    resignError.value = '请填写辞职原因'
    return
  }
  resignSubmitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/resignation`, { reason: resignReason.value.trim() })
  resignSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success('辞职申请已提交，等待负责人审批')
    resignOpen.value = false
    resignReason.value = ''
    await loadData()
  } else if (r.kind === 'rejected' && r.error) {
    resignError.value = (r.error as { message?: string }).message || '提交失败'
  } else {
    resignError.value = '提交失败，请稍后重试'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="成员退出与移除" :error="pageError" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">成员退出与移除</h1>
      <p class="text-sm text-text-secondary mb-6">管理成员退出和移除操作</p>

      <!-- 本人辞职申请 -->
      <Card class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="text-sm font-medium text-text-primary flex items-center gap-1.5"><FileText :size="15" /> 提交辞职申请</p>
            <p class="text-xs text-text-secondary mt-0.5">以本人身份提交，提交后由负责人审批</p>
          </div>
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle"
            @click="resignOpen = true; resignReason = ''; resignError = ''"
          >
            <FileText :size="14" /> 提交申请
          </button>
        </div>
        <div v-if="resignOpen" class="pt-3 border-t border-border space-y-3">
          <textarea
            v-model="resignReason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="请填写辞职原因（必填）"
          />
          <p v-if="resignError" class="text-xs text-danger">{{ resignError }}</p>
          <div class="flex gap-2">
            <button
              class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
              @click="resignOpen = false"
            >
              取消
            </button>
            <button
              class="flex-1 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="resignSubmitting"
              @click="handleSubmitResignation"
            >
              {{ resignSubmitting ? '提交中...' : '确认提交' }}
            </button>
          </div>
        </div>
      </Card>

      <!-- 本人主动退出申请（MEM-001：申请 → 负责人/人事审批 → 本人二次确认 → 离社） -->
      <Card class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="text-sm font-medium text-text-primary flex items-center gap-1.5"><LogOut :size="15" /> 申请主动退出</p>
            <p class="text-xs text-text-secondary mt-0.5">以本人身份提交，由负责人/人事审批，批准后需本人二次确认方可离社</p>
          </div>
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle"
            @click="exitOpen = true; exitReason = ''; exitError = ''"
          >
            <LogOut :size="14" /> 申请退出
          </button>
        </div>
        <div v-if="exitOpen" class="pt-3 border-t border-border space-y-3">
          <textarea
            v-model="exitReason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="请填写退出原因（必填）"
          />
          <p v-if="exitError" class="text-xs text-danger">{{ exitError }}</p>
          <div class="flex gap-2">
            <button
              class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
              @click="exitOpen = false"
            >
              取消
            </button>
            <button
              class="flex-1 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="exitSubmitting"
              @click="handleSubmitExitRequest"
            >
              {{ exitSubmitting ? '提交中...' : '确认提交' }}
            </button>
          </div>
        </div>

        <!-- 退出申请列表：本人撤回/二次确认 + 管理端审批 -->
        <div v-if="exitRequests.length > 0" class="mt-4 pt-3 border-t border-border space-y-3">
          <p class="text-xs font-medium text-text-secondary">退出申请记录</p>
          <Card v-for="req in exitRequests" :key="req.id" class="!p-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-text-primary">
                  {{ req.memberName }}
                  <span v-if="req.overdue" class="ml-2 text-xs text-danger">已超处理期限</span>
                </p>
                <p class="text-xs text-text-secondary mt-0.5">原因：{{ req.reason }}</p>
                <p class="text-xs text-text-secondary mt-0.5">提交于 {{ formatDate(req.submittedAt) }} · 处理期限 {{ req.dueAt?.slice(0, 10) }}</p>
              </div>
              <StateTag :status="req.status" />
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <!-- 本人：审批前撤回 / 批准后二次确认 -->
              <button
                v-if="req.status === 'under_review' && req.canWithdraw"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-text-secondary hover:bg-subtle"
                :disabled="exitActingId === req.id"
                @click="handleExitWithdraw(req)"
              >
                撤回申请
              </button>
              <button
                v-if="req.status === 'approved' && req.canConfirm"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90"
                :disabled="exitActingId === req.id"
                @click="handleExitConfirm(req)"
              >
                二次确认退出
              </button>
              <!-- 管理端：审批（仅社团负责人/人事，与后端 canManageMembersFull 一致） -->
              <template v-if="req.status === 'under_review' && canApproveExit">
                <button
                  class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90"
                  :disabled="exitActingId === req.id"
                  @click="handleExitDecide(req, 'approve')"
                >
                  <CheckCircle2 :size="13" /> 批准
                </button>
                <button
                  class="flex items-center gap-1 px-2.5 py-1 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle"
                  :disabled="exitActingId === req.id"
                  @click="handleExitDecide(req, 'reject')"
                >
                  <XCircle :size="13" /> 驳回
                </button>
              </template>
              <p v-else-if="req.status === 'approved' && req.decidedBy" class="text-xs text-success self-center">由 {{ req.decidedBy }} 批准，待本人二次确认</p>
              <p v-else-if="req.status === 'rejected' && req.decidedBy" class="text-xs text-text-secondary self-center">由 {{ req.decidedBy }} 驳回</p>
              <p v-else-if="req.status === 'exited'" class="text-xs text-text-secondary self-center">已确认离社</p>
            </div>
          </Card>
        </div>
      </Card>

      <!-- 辞职审批（仅社团负责人/人事可见） -->
      <PermissionGuard permission="club:resignation:approve" scope="workspace">
        <div v-if="resignations.length > 0" class="mb-6">
          <h2 class="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
            <FileText :size="18" /> 辞职申请审批
          </h2>
          <div class="space-y-3">
            <Card v-for="res in resignations" :key="res.id">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ res.memberName }} <span class="text-xs text-text-secondary ml-1">{{ res.departmentName }} · {{ res.title }}</span></p>
                  <p class="text-xs text-text-secondary mt-1">原因：{{ res.reason }}</p>
                  <p class="text-xs text-text-secondary mt-0.5">提交于 {{ formatDate(res.submittedAt) }}</p>
                </div>
                <StateTag :status="res.status" />
              </div>
              <div v-if="res.status === 'under_review'" class="mt-3 flex gap-2">
                <button class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90" :disabled="actingId === res.id" @click="handleResignDecide(res, 'approve')">
                  <CheckCircle2 :size="14" /> 批准
                </button>
                <button class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle" :disabled="actingId === res.id" @click="handleResignDecide(res, 'reject')">
                  <XCircle :size="14" /> 驳回
                </button>
              </div>
              <p v-else-if="res.status === 'rejected' && res.decidedBy" class="text-xs text-text-secondary mt-2">由 {{ res.decidedBy }} 驳回</p>
              <p v-else-if="res.status === 'approved' && res.decidedBy" class="text-xs text-success mt-2">由 {{ res.decidedBy }} 批准</p>
            </Card>
          </div>
        </div>
      </PermissionGuard>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无成员记录" />

      <div v-else class="space-y-3">
        <Card v-for="m in items" :key="m.id">
          <div class="flex items-start justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ m.name }}</p>
              <p class="text-xs text-text-secondary">{{ m.studentId }} · {{ m.department }} · {{ m.title }}</p>
              <p v-if="!canRemove(m)" class="text-xs text-warning mt-1 flex items-center gap-1">
                <AlertTriangle :size="12" /> 不能移除自己
              </p>
              <p v-if="isLastLeader(m) && canRemove(m)" class="text-xs text-warning mt-1 flex items-center gap-1">
                <AlertTriangle :size="12" /> 最后一位负责人，需先交接方可退出/移除
              </p>
            </div>
            <StateTag :status="m.status" />
          </div>
          <p class="text-xs text-text-secondary">加入于 {{ formatDate(m.joinedAt) }}</p>
          <p v-if="m.exitedAt" class="text-xs text-text-secondary">退出于 {{ formatDate(m.exitedAt) }}</p>

          <div v-if="m.status === 'active' && canRemove(m) && !isLastLeader(m)" class="mt-3 flex gap-2">
            <button class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle" :disabled="actingId === m.id" @click="openAction(m.id, 'mark_exit')">
              <LogOut :size="14" /> 标记退出
            </button>
            <button class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-danger text-sm text-danger hover:bg-danger-subtle" @click="openAction(m.id, 'remove')">
              <UserMinus :size="14" /> 移除成员
            </button>
          </div>
        </Card>
      </div>

      <!-- 标记退出确认弹窗 -->
      <div v-if="actingId && actingAction === 'mark_exit'" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" :aria-label="'标记退出确认'">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <div class="flex items-center gap-2 mb-3">
            <AlertTriangle :size="20" class="text-warning" />
            <h3 class="text-base font-medium text-warning">确认标记退出</h3>
          </div>
          <p class="text-sm text-text-secondary mb-3">此操作将该成员标记为已退出（保留部门/职位档案，不触发「被移出」通知），请填写退出原因以便后续审计。</p>
          <div v-if="actingMember" class="rounded-lg border border-border p-3 mb-3 text-sm">
            <div class="flex items-center justify-between py-0.5"><span class="text-text-secondary">目标成员</span><span class="text-text-primary">{{ actingMember.name }}</span></div>
            <div class="flex items-center justify-between py-0.5"><span class="text-text-secondary">学号</span><span class="text-text-primary">{{ actingMember.studentId }}</span></div>
            <div class="flex items-center justify-between py-0.5"><span class="text-text-secondary">部门 · 职位</span><span class="text-text-primary">{{ actingMember.department }} · {{ actingMember.title }}</span></div>
          </div>
          <p class="text-xs text-warning mb-2">标记退出必须填写原因</p>
          <textarea
            v-model="reason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            :class="reasonError ? 'border-danger' : 'border-border'"
            placeholder="请填写退出原因..."
            aria-label="操作原因"
          />
          <p v-if="reasonError" class="mt-2 text-xs text-danger" role="alert">{{ reasonError }}</p>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="closeAction">取消</button>
            <button
              class="flex-1 h-9 rounded-md text-text-on-primary text-sm font-medium hover:opacity-90 bg-warning"
              :disabled="actingSubmitting"
              @click="handleConfirmAction"
            >
              {{ actingSubmitting ? '处理中...' : '确认标记退出' }}
            </button>
          </div>
        </div>
      </div>

      <HighRiskConfirm
        v-model:open="removeOpen"
        title="移除成员"
        description="此操作不可撤销，将移除该成员的全部部门、职位和访问权限，并通知当事人。"
        :targets="actingMember ? [{ id: actingMember.id, label: actingMember.name, detail: `${actingMember.department} · ${actingMember.title}` }] : []"
        impact-summary="移除必须填写原因；操作者不能移除自己，最后一位负责人需先交接。"
        confirm-label="确认移除"
        reauth-required
        :executing="actingSubmitting"
        :succeeded="removeSucceeded"
        :error-message="removeError"
        @confirm="handleConfirmRemove"
      >
        <template #extra>
          <textarea
            v-model="reason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            :class="reasonError ? 'border-danger' : ''"
            placeholder="请填写移除原因（必填）"
            aria-label="移除原因"
          />
          <p v-if="reasonError" class="mt-2 text-xs text-danger" role="alert">{{ reasonError }}</p>
        </template>
      </HighRiskConfirm>
    </div>
  </PageStateBoundary>
</template>
