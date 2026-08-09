<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import { DateTimePicker } from '@/components/form'
import { get, post } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useLastLeaderGuard } from '@/composables/useLastLeaderGuard'
import type { PageState } from '@/types/machine'
import { Crown, ArrowRightLeft, UserMinus, AlertTriangle, CalendarClock, RefreshCw } from '@lucide/vue'

interface AppointMember { id: string; name: string; studentId: string; department: string; title: string; status: string; isMember?: boolean; previousMemberId?: string | null }
interface Dept { id: string; name: string }
interface Command {
  id: string; action: 'appoint' | 'transfer' | 'dismiss'
  memberId: string; memberName: string
  departmentId: string | null; departmentName: string | null
  title: string | null; scheduledAt: string | null
  status: string; createdAt: string; createdBy: string
  executedAt: string | null; failReason: string | null
}

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const members = ref<AppointMember[]>([])
const candidates = ref<AppointMember[]>([])
const departments = ref<Dept[]>([])
const titles = ref<string[]>([])
const commands = ref<Command[]>([])
const selectedMember = ref<AppointMember | null>(null)
const action = ref<'appoint' | 'transfer' | 'dismiss'>('appoint')
const targetDept = ref('')
const targetTitle = ref('')
const isScheduled = ref(false)
const scheduledAt = ref('')
const submitting = ref(false)
const actingId = ref<string | null>(null)
const showDismissConfirm = ref(false)
const candidateSearch = ref('')

const actions = [
  { key: 'appoint' as const, label: '任命', icon: Crown, desc: '为成员分配新职位' },
  { key: 'transfer' as const, label: '调岗', icon: ArrowRightLeft, desc: '调整成员所在部门或职位' },
  { key: 'dismiss' as const, label: '免职', icon: UserMinus, desc: '移除成员当前职位' },
]

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: AppointMember[]; candidates: AppointMember[]; departments: Dept[]; titles: string[]; commands: Command[] }>(`/org/${clubId}/members/appointments`)
  if (result.kind === 'completed') {
    members.value = result.data.items
    candidates.value = result.data.candidates ?? []
    departments.value = result.data.departments
    titles.value = result.data.titles
    commands.value = result.data.commands
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

function selectMember(m: AppointMember) {
  selectedMember.value = m
  if (!m.isMember) {
    // 非成员候选人（MEM-003）：仅可任命，默认落在首个部门与最低职位
    action.value = 'appoint'
    targetDept.value = departments.value[0]?.id ?? ''
    targetTitle.value = titles.value[0] ?? ''
  } else {
    const first = departments.value.find((d) => d.name === m.department)
    targetDept.value = first?.id ?? departments.value[0]?.id ?? ''
    targetTitle.value = m.title
  }
  scheduledAt.value = ''
}

const filteredCandidates = computed(() => {
  const kw = candidateSearch.value.trim()
  if (!kw) return candidates.value
  return candidates.value.filter((c) => c.name.includes(kw) || c.studentId === kw)
})

// 不能免职自己
const isSelf = computed(() => selectedMember.value?.isMember && selectedMember.value?.id === session.workspace?.memberId)

// 末位负责人不可免职（需先交接）
const { isLastLeader: isLastLeaderGuard } = useLastLeaderGuard(members)
const isLastLeader = computed(() => {
  if (!selectedMember.value || action.value !== 'dismiss') return false
  if (!selectedMember.value.isMember) return false
  return isLastLeaderGuard(selectedMember.value)
})

const canExecute = computed(() => {
  if (!selectedMember.value) return false
  // 非成员候选人（MEM-003）：仅可任命，需选好部门与职位
  if (!selectedMember.value.isMember) {
    return action.value === 'appoint' && !!targetDept.value && !!targetTitle.value && (!isScheduled.value || !!scheduledAt.value)
  }
  if (isSelf.value) return false
  if (isLastLeader.value) return false
  if (isScheduled.value && !scheduledAt.value) return false
  return true
})

// 免职为不可逆操作，先经过高风险确认
function onExecuteClick() {
  if (!selectedMember.value || !canExecute.value) return
  if (action.value === 'dismiss') {
    showDismissConfirm.value = true
  } else {
    handleExecute()
  }
}

async function handleExecute() {
  if (!selectedMember.value || !canExecute.value) return
  submitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/appointments`, {
    action: action.value,
    memberId: selectedMember.value.id,
    departmentId: action.value === 'dismiss' ? null : targetDept.value,
    title: action.value === 'dismiss' ? null : targetTitle.value,
    scheduledAt: isScheduled.value ? new Date(scheduledAt.value).toISOString() : null,
    candidateStudentId: selectedMember.value.isMember ? null : selectedMember.value.studentId,
  })
  submitting.value = false
  if (r.kind === 'completed') {
    toast.success(isScheduled.value ? '预约命令已创建' : (action.value === 'appoint' ? '任命已生效' : action.value === 'transfer' ? '调岗已生效' : '免职已生效'))
    selectedMember.value = null
    await loadData()
  } else {
    toastError(r, '操作失败，请重试')
  }
}

// 取消预约命令
async function handleCancel(cmd: Command) {
  actingId.value = cmd.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/appointments/${cmd.id}/cancel`)
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('预约已取消')
    await loadData()
  } else { toastError(r, '取消失败') }
}

// 重新确认预约命令（失权后恢复）
async function handleReconfirm(cmd: Command) {
  actingId.value = cmd.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/appointments/${cmd.id}/reconfirm`, { scheduledAt: cmd.scheduledAt || new Date().toISOString() })
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('已重新确认')
    await loadData()
  } else { toastError(r, '重新确认失败') }
}

// 执行预约命令（首次可能失败，失败后可重试）
async function handleExecuteCommand(cmd: Command) {
  actingId.value = cmd.id
  const clubId = route.params.clubId as string
  const r = await post<{ failed?: boolean; message?: string }>(`/org/${clubId}/members/appointments/${cmd.id}/execute`)
  actingId.value = null
  if (r.kind === 'completed') {
    if (r.data.failed) {
      toast.warning(r.data.message || '执行失败，可重试')
    } else {
      toast.success('已执行生效')
    }
    await loadData()
  } else { toastError(r, '执行失败') }
}

function actionLabel(a: string): string {
  return { appoint: '任命', transfer: '调岗', dismiss: '免职' }[a] ?? a
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="任命调岗免职" :error="pageError" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">任命 / 调岗 / 免职</h1>

      <!-- 操作类型 -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <button
          v-for="a in actions"
          :key="a.key"
          class="rounded-lg border p-4 text-center transition-colors"
          :class="action === a.key ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong'"
          :disabled="!!(selectedMember && !selectedMember.isMember && a.key !== 'appoint')"
          :title="selectedMember && !selectedMember.isMember && a.key !== 'appoint' ? '非成员候选人仅支持任命' : undefined"
          @click="action = a.key"
        >
          <component :is="a.icon" :size="20" class="mx-auto mb-1" :class="action === a.key ? 'text-primary' : 'text-text-secondary'" />
          <p class="text-sm font-medium" :class="action === a.key ? 'text-primary' : 'text-text-secondary'">{{ a.label }}</p>
        </button>
      </div>

      <div class="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
        <!-- 成员列表 -->
        <Card>
          <p class="text-sm font-medium text-text-primary mb-3">选择成员</p>
          <div v-if="members.length === 0" class="text-center py-6 text-sm text-text-secondary">无可操作成员</div>
          <div v-else class="space-y-1 max-h-72 overflow-y-auto">
            <button
              v-for="m in members"
              :key="m.id"
              class="w-full flex items-center justify-between rounded-lg p-2.5 text-left transition-colors"
              :class="selectedMember?.id === m.id ? 'bg-primary-subtle' : 'hover:bg-subtle'"
              @click="selectMember(m)"
            >
              <div>
                <span class="text-sm text-text-primary">{{ m.name }}</span>
                <span class="text-xs text-text-secondary ml-2">{{ m.studentId }}</span>
              </div>
              <span class="text-xs text-text-secondary">{{ m.department }} · {{ m.title }}</span>
            </button>
          </div>

          <!-- 非成员候选人（MEM-003：组合任命支持非成员候选人） -->
          <template v-if="candidates.length > 0">
            <p class="text-sm font-medium text-text-primary pt-3 border-t border-border flex items-center gap-1.5">
              <Crown :size="14" /> 非成员候选人（组合任命）
            </p>
            <input
              v-model="candidateSearch"
              class="w-full h-8 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary"
              placeholder="按姓名/学号搜索候选人"
            />
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <button
                v-for="c in filteredCandidates"
                :key="c.id"
                class="w-full flex items-center justify-between rounded-lg p-2.5 text-left transition-colors"
                :class="selectedMember?.id === c.id ? 'bg-primary-subtle' : 'hover:bg-subtle'"
                @click="selectMember(c)"
              >
                <div>
                  <span class="text-sm text-text-primary">{{ c.name }}</span>
                  <span class="text-xs text-text-secondary ml-2">{{ c.studentId }}</span>
                  <span v-if="c.previousMemberId" class="ml-2 text-xs text-warning">历史成员重新加入</span>
                </div>
                <span class="text-xs text-text-secondary">非成员</span>
              </button>
            </div>
          </template>
        </Card>

        <!-- 操作面板 -->
        <Card v-if="selectedMember">
          <p class="text-sm font-medium text-text-primary mb-3">{{ actions.find((a) => a.key === action)?.label }} - {{ selectedMember.name }}</p>

          <div v-if="action === 'appoint' || action === 'transfer'" class="space-y-3">
            <div>
              <label class="block text-xs text-text-secondary mb-1">目标部门</label>
              <select v-model="targetDept" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">目标职位</label>
              <select v-model="targetTitle" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option v-for="t in titles" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div v-else-if="action === 'dismiss'" class="rounded-lg bg-danger-subtle p-3 mb-3">
            <p class="text-xs text-danger">免职后该成员将不再担任当前职位，但保留社团成员身份。</p>
          </div>

          <div v-if="selectedMember && !selectedMember.isMember && selectedMember.previousMemberId" class="rounded-lg bg-warning-subtle p-3 mb-3">
            <p class="text-xs text-warning flex items-center gap-1"><AlertTriangle :size="13" /> 该候选人为历史成员，任命后将以新成员身份加入社团。</p>
          </div>

          <!-- 预约执行 -->
          <div class="mt-3 rounded-lg border border-border p-3">
            <label class="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input v-model="isScheduled" type="checkbox" class="accent-primary" />
              预约执行（延迟到指定时间生效）
            </label>
            <div v-if="isScheduled" class="mt-2">
              <DateTimePicker v-model="scheduledAt" label="预约执行时间" />
            </div>
          </div>

          <div v-if="isSelf" class="rounded-lg bg-warning-subtle p-3 mb-3 mt-3 flex items-center gap-2">
            <AlertTriangle :size="16" class="text-warning" />
            <p class="text-xs text-warning">不能免职自己</p>
          </div>
          <div v-else-if="isLastLeader" class="rounded-lg bg-warning-subtle p-3 mb-3 mt-3 flex items-center gap-2">
            <AlertTriangle :size="16" class="text-warning" />
            <p class="text-xs text-warning">最后一位负责人，需先交接方可免职</p>
          </div>

          <button class="w-full mt-4 h-9 rounded-md text-sm font-medium text-text-on-primary disabled:opacity-40 disabled:cursor-not-allowed" :class="action === 'dismiss' ? 'bg-danger' : 'bg-primary'" :disabled="!canExecute || submitting" @click="onExecuteClick">
            {{ submitting ? '处理中...' : '确认' + (actions.find((a) => a.key === action)?.label ?? '') }}
          </button>
        </Card>

        <Card v-else class="flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">请选择成员</p>
        </Card>
      </div>

      <!-- 预约命令列表 -->
      <div v-if="commands.length > 0">
        <h2 class="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <CalendarClock :size="18" /> 预约命令
        </h2>
        <div class="space-y-2">
          <Card v-for="cmd in commands" :key="cmd.id">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-text-primary">{{ actionLabel(cmd.action) }} · {{ cmd.memberName }}</p>
                <p class="text-xs text-text-secondary mt-0.5">
                  {{ cmd.departmentName || cmd.title || '当前职位' }}{{ cmd.title ? ` · ${cmd.title}` : '' }} · 执行时间 {{ formatDate(cmd.scheduledAt) }}
                </p>
                <p v-if="cmd.status === 'exec_failed'" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                  <AlertTriangle :size="12" /> {{ cmd.failReason || '执行失败，可重试' }}
                </p>
                <p v-if="cmd.status === 'initiator_lost_rights'" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                  <AlertTriangle :size="12" /> 发起人已失去操作权限，需重新确认后执行
                </p>
                <p v-if="cmd.status === 'precondition_failed'" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                  <AlertTriangle :size="12" /> 前置条件未满足，可调整执行时间后重新确认或取消
                </p>
              </div>
              <div class="flex items-center gap-2">
                <StateTag :status="cmd.status" />
                <button v-if="cmd.status === 'pending_exec' || cmd.status === 'initiator_lost_rights' || cmd.status === 'precondition_failed'" class="text-xs text-danger hover:underline" :disabled="actingId === cmd.id" @click="handleCancel(cmd)">取消</button>
                <button v-if="cmd.status === 'initiator_lost_rights' || cmd.status === 'precondition_failed'" class="text-xs text-primary hover:underline" :disabled="actingId === cmd.id" @click="handleReconfirm(cmd)">重新确认</button>
                <button v-if="cmd.status === 'pending_exec' || cmd.status === 'reconfirmed' || cmd.status === 'exec_failed'" class="flex items-center gap-1 text-xs text-primary hover:underline" :disabled="actingId === cmd.id" @click="handleExecuteCommand(cmd)">
                  <RefreshCw :size="12" /> {{ cmd.status === 'exec_failed' ? '重试' : '执行' }}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <EmptyState v-else type="no_data" title="暂无预约命令" description="发起预约执行的任命/调岗/免职将显示在这里" />

      <HighRiskConfirm
        :open="showDismissConfirm"
        title="确认免职"
        description="免职后将移除该成员的当前职位，此操作不可撤销。"
        :targets="selectedMember ? [{ id: selectedMember.id, label: selectedMember.name, detail: `${selectedMember.department} · ${selectedMember.title}` }] : []"
        impact-summary="免职后该成员将不再担任当前职位，但保留社团成员身份。"
        confirm-label="确认免职"
        :executing="submitting"
        @confirm="showDismissConfirm = false; handleExecute()"
        @update:open="(v) => { if (!v) showDismissConfirm = false }"
      />
    </div>
  </PageStateBoundary>
</template>
