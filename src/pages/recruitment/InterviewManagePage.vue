<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, DataTable } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post, put } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Calendar, MapPin, User, Play, CheckCircle2, XCircle, Clock3, Layers, Plus, RefreshCw, Users } from '@lucide/vue'

interface InterviewRow {
  id: string; activityId: string; roundId: string; roundName: string
  applicantId: string; applicantName: string; studentId: string
  status: string; slotId: string; scheduledTime: string; endTime: string
  attendance: string; invalidReason: string | null
}
interface RoundItem { id: string; name: string; status: string; selectDeadline: string; slots: { id: string; startAt: string; endAt: string; capacity: number; available: number }[]; bookedCount: number }
interface AppItem { applicantId: string; applicantName: string; status: string }

interface InterviewerTaskItem {
  id: string; userId: string; userName: string
  scope: 'activity' | 'round'; roundId: string; roundName: string; status: string
}
interface CandidateItem { id: string; name: string; role: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<InterviewRow[]>([])
const selected = ref<InterviewRow | null>(null)
const actionLoading = ref(false)
const invalidReason = ref('')
const bookOpen = ref(false)
const rounds = ref<RoundItem[]>([])
const applications = ref<AppItem[]>([])
const bookForm = ref({ applicantId: '', roundId: '', slotId: '' })

// 轮次管理
const roundAdminOpen = ref(false)
const roundForm = ref({ name: '', mode: 'club_unified' as 'club_unified' | 'dept_separate', deadline: '', slotStart: '', slotEnd: '', slotCapacity: 10 })
const roundError = ref('')
const skipForm = ref({ applicantId: '', reason: '' })
const updatingRound = ref<string | null>(null)
const newRoundDeadline = ref('')
const cancelRoundId = ref<string | null>(null)
const cancelRoundReason = ref('')
const cancelRoundError = ref('')

const clubId = computed(() => (route.params.clubId as string) || '')
const actId = computed(() => (route.params.activityId as string) || '')

// 临时面试官任务（REC-013/ORG-037）
const interviewerOpen = ref(false)
const defaultReviewers = ref<{ id: string; name: string; source: string }[]>([])
const tasks = ref<InterviewerTaskItem[]>([])
const candidates = ref<CandidateItem[]>([])
const taskForm = ref<{ userId: string; scope: 'activity' | 'round'; roundId: string }>({ userId: '', scope: 'activity', roundId: '' })
const taskError = ref('')
const revokingTaskId = ref<string | null>(null)

watch([clubId, actId], ([cid, aid]) => {
  if (!cid || !aid) {
    state.value = 'error'
  }
}, { immediate: true })

function validateParams(): boolean {
  if (!clubId.value || !actId.value) {
    state.value = 'error'
    return false
  }
  return true
}

const columns = [
  { key: 'applicantName', label: '申请人' },
  { key: 'roundName', label: '轮次' },
  { key: 'status', label: '状态' },
  { key: 'scheduledTime', label: '时间' },
]

async function loadInterviews() {
  state.value = 'loading'
  if (!validateParams()) return
  const result = await get<{ items: InterviewRow[] }>(`/org/${clubId.value}/recruitment/${actId.value}/interviews`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    if (selected.value) {
      selected.value = items.value.find((i) => i.id === selected.value?.id) || null
    }
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function loadBookOptions() {
  if (!validateParams()) return
  const [r, a] = await Promise.all([
    get<{ items: RoundItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/rounds`),
    get<{ items: AppItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/applications`),
  ])
  if (r.kind === 'completed') rounds.value = r.data.items
  if (a.kind === 'completed') applications.value = a.data.items
}

function handleRowClick(row: unknown) {
  const it = row as InterviewRow
  selected.value = it
  invalidReason.value = ''
}

function formatTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function runAction(action: string, input?: Record<string, unknown>) {
  if (!selected.value || actionLoading.value) return
  if (!validateParams()) return
  actionLoading.value = true
  const result = await post(
    `/org/${clubId.value}/recruitment/${actId.value}/interviews/${selected.value.id}/${action}`,
    { ...(input || {}) }
  )
  actionLoading.value = false
  if (result.kind === 'completed') {
    await loadInterviews()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败')
  }
}

async function handleBook() {
  if (!validateParams()) return
  if (!bookForm.value.applicantId || !bookForm.value.slotId || actionLoading.value) return
  actionLoading.value = true
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/interviews/book`, {
    applicantId: bookForm.value.applicantId,
    slotId: bookForm.value.slotId,
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    bookOpen.value = false
    bookForm.value = { applicantId: '', roundId: '', slotId: '' }
    await loadInterviews()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '预约失败')
  }
}

const selectedRoundSlots = computed(() => {
  const round = rounds.value.find((r) => r.id === bookForm.value.roundId)
  return round ? round.slots : []
})

async function loadRounds() {
  const r = await get<{ items: RoundItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/rounds`)
  if (r.kind === 'completed') rounds.value = r.data.items
}

async function handleCreateRound() {
  if (!validateParams()) return
  if (!roundForm.value.name || !roundForm.value.deadline || !roundForm.value.slotStart || !roundForm.value.slotEnd) {
    roundError.value = '请完整填写轮次名称、截止时间与面试时段'
    return
  }
  if (actionLoading.value) return
  actionLoading.value = true
  roundError.value = ''
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/rounds`, {
    name: roundForm.value.name,
    mode: roundForm.value.mode,
    selectDeadline: roundForm.value.deadline,
    slots: [{ startAt: roundForm.value.slotStart, endAt: roundForm.value.slotEnd, capacity: Number(roundForm.value.slotCapacity) || 10 }],
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    roundForm.value = { name: '', mode: 'club_unified', deadline: '', slotStart: '', slotEnd: '', slotCapacity: 10 }
    roundError.value = ''
    await loadRounds()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '创建轮次失败')
  }
}

async function handleUpdateRound(roundId: string) {
  if (!validateParams()) return
  if (!newRoundDeadline.value) return
  if (actionLoading.value) return
  actionLoading.value = true
  const result = await put(`/org/${clubId.value}/recruitment/${actId.value}/rounds/${roundId}`, {
    selectDeadline: newRoundDeadline.value,
  })
  actionLoading.value = false
  updatingRound.value = null
  newRoundDeadline.value = ''
  if (result.kind === 'completed') {
    await loadRounds()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '更新失败')
  }
}

async function handleCancelRound(roundId: string) {
  if (!validateParams()) return
  if (!cancelRoundReason.value.trim()) {
    cancelRoundError.value = '请填写取消原因'
    return
  }
  if (actionLoading.value) return
  actionLoading.value = true
  cancelRoundError.value = ''
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/rounds/${roundId}/cancel`, {
    reason: cancelRoundReason.value.trim(),
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    cancelRoundId.value = null
    cancelRoundReason.value = ''
    cancelRoundError.value = ''
    await loadRounds()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '取消失败')
  }
}

function openCancelRound(roundId: string) {
  cancelRoundId.value = roundId
  cancelRoundReason.value = ''
  cancelRoundError.value = ''
}

async function loadInterviewers() {
  if (!validateParams()) return
  const [t, c] = await Promise.all([
    get<{ defaultReviewers: { id: string; name: string; source: string }[]; tasks: InterviewerTaskItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/interviewers`),
    get<{ items: CandidateItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/interviewers/candidates`),
  ])
  if (t.kind === 'completed') {
    // 防御：后端缺省字段时回落空数组，避免模板 .map 崩溃
    defaultReviewers.value = t.data.defaultReviewers ?? []
    tasks.value = t.data.tasks ?? []
  }
  if (c.kind === 'completed') candidates.value = c.data.items
}

async function handleAssignTask() {
  if (!validateParams()) return
  if (!taskForm.value.userId) {
    taskError.value = '请选择要指派的成员'
    return
  }
  if (taskForm.value.scope === 'round' && !taskForm.value.roundId) {
    taskError.value = '轮次级任务必须指定轮次'
    return
  }
  if (actionLoading.value) return
  actionLoading.value = true
  taskError.value = ''
  const candidate = candidates.value.find((x) => x.id === taskForm.value.userId)
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/interviewers`, {
    userId: taskForm.value.userId,
    userName: candidate?.name || '',
    scope: taskForm.value.scope,
    roundId: taskForm.value.scope === 'round' ? taskForm.value.roundId : undefined,
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    taskForm.value = { userId: '', scope: 'activity', roundId: '' }
    taskError.value = ''
    await loadInterviewers()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '指派失败')
  }
}

async function handleRevokeTask(taskId: string) {
  if (!validateParams()) return
  if (actionLoading.value) return
  actionLoading.value = true
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/interviewers/${taskId}/revoke`, {})
  actionLoading.value = false
  revokingTaskId.value = null
  if (result.kind === 'completed') {
    await loadInterviewers()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '撤销失败')
  }
}

async function handleSkipRound() {
  if (!validateParams()) return
  if (!skipForm.value.applicantId || !skipForm.value.reason.trim()) {
    roundError.value = '请选择申请人与填写跳轮原因'
    return
  }
  const roundId = bookForm.value.roundId || rounds.value[0]?.id
  if (!roundId) {
    roundError.value = '没有可用的面试轮次'
    return
  }
  if (actionLoading.value) return
  actionLoading.value = true
  roundError.value = ''
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/rounds/${roundId}/skip`, {
    applicantId: skipForm.value.applicantId,
    reason: skipForm.value.reason.trim(),
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    skipForm.value = { applicantId: '', reason: '' }
    roundError.value = ''
    await Promise.all([loadRounds(), loadInterviews()])
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '跳轮失败')
  }
}

const canRegisterAttendance = computed(() => selected.value?.status === 'scheduled')
const canStart = computed(() => ['scheduled', 'late'].includes(selected.value?.status || ''))
const canComplete = computed(() => selected.value?.status === 'in_progress')
const canInvalidate = computed(() => {
  if (!selected.value) return false
  return !['cancelled', 'invalidated', 'completed'].includes(selected.value.status)
})

onMounted(async () => {
  await loadInterviews()
  await loadBookOptions()
  await loadInterviewers()
})

watch(
  () => [route.params.clubId, route.params.activityId],
  () => {
    validateParams()
    if (state.value !== 'error') loadInterviews()
  }
)
</script>

<template>
  <PageStateBoundary :state="state" title="面试排期管理" @retry="loadInterviews">
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">面试排期管理</h1>
        <PermissionGuard permission="club:recruitment:manage">
          <button
            class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
            :disabled="actionLoading"
            @click="bookOpen = !bookOpen"
          >
            <Calendar :size="16" /> 代预约面试
          </button>
        </PermissionGuard>
      </div>

      <!-- 代预约 -->
      <Card v-if="bookOpen" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">代申请人预约面试</h2>
        <div class="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-xs text-text-secondary mb-1">申请人</label>
            <select
              v-model="bookForm.applicantId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            >
              <option value="" disabled>选择申请人</option>
              <option v-for="a in applications" :key="a.applicantId" :value="a.applicantId">
                {{ a.applicantName }}（{{ a.status }}）
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">面试轮次</label>
            <select
              v-model="bookForm.roundId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              @change="bookForm.slotId = ''"
            >
              <option value="" disabled>选择轮次</option>
              <option v-for="r in rounds.filter((x) => x.status === 'open')" :key="r.id" :value="r.id">
                {{ r.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">面试时段</label>
            <select
              v-model="bookForm.slotId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            >
              <option value="" disabled>选择时段</option>
              <option v-for="s in selectedRoundSlots.filter((x) => x.available > 0)" :key="s.id" :value="s.id">
                {{ formatTime(s.startAt) }}（剩 {{ s.available }}）
              </option>
            </select>
          </div>
        </div>
        <button
          class="h-10 px-4 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
          :disabled="actionLoading || !bookForm.applicantId || !bookForm.slotId"
          @click="handleBook"
        >
          {{ actionLoading ? '预约中...' : '确认预约' }}
        </button>
      </Card>

      <!-- 临时面试官任务（REC-013/ORG-037） -->
      <PermissionGuard permission="club:recruitment:manage">
        <Card class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-medium text-text-primary">面试官与临时任务</h2>
            <button
              class="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-secondary text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-60"
              :disabled="actionLoading"
              @click="interviewerOpen = !interviewerOpen"
            >
              <Users :size="14" /> {{ interviewerOpen ? '收起' : '指派临时面试官' }}
            </button>
          </div>

          <div class="space-y-3 text-sm">
            <p class="text-xs text-text-secondary">
              默认面试官：{{ defaultReviewers.map((d) => d.name).join('、') || '无' }}。临时面试官须为本社团当前成员，任务撤销或轮次/活动结束即失效。
            </p>

            <div v-if="interviewerOpen" class="rounded-lg border border-border p-3 space-y-3">
              <p class="text-sm font-medium text-text-primary flex items-center gap-1"><Plus :size="14" /> 指派临时面试官</p>
              <div class="grid sm:grid-cols-3 gap-3">
                <select v-model="taskForm.userId" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary">
                  <option value="" disabled>选择成员</option>
                  <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.name }}（{{ c.role }}）</option>
                </select>
                <select v-model="taskForm.scope" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary">
                  <option value="activity">活动级（全部轮次）</option>
                  <option value="round">轮次级（指定轮次）</option>
                </select>
                <select
                  v-if="taskForm.scope === 'round'"
                  v-model="taskForm.roundId"
                  class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                >
                  <option value="" disabled>选择轮次</option>
                  <option v-for="r in rounds" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="px-4 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading || !taskForm.userId"
                  @click="handleAssignTask"
                >
                  {{ actionLoading ? '指派中...' : '确认指派' }}
                </button>
                <p v-if="taskError" class="text-xs text-destructive">{{ taskError }}</p>
              </div>
            </div>

            <div v-if="tasks.length" class="space-y-2">
              <div v-for="t in tasks" :key="t.id" class="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ t.userName }}</p>
                  <p class="text-xs text-text-secondary mt-0.5">
                    {{ t.scope === 'round' ? `轮次级 · ${t.roundName}` : '活动级 · 全部轮次' }}
                    <StateTag :status="t.status" />
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <template v-if="revokingTaskId === t.id">
                    <span class="text-xs text-text-secondary">撤销后立即失效</span>
                    <button class="px-2 h-8 rounded-md bg-destructive text-text-on-primary text-xs font-medium" :disabled="actionLoading" @click="handleRevokeTask(t.id)">确认</button>
                    <button class="px-2 h-8 rounded-md border border-border text-xs" @click="revokingTaskId = null">取消</button>
                  </template>
                  <button
                    v-else-if="t.status === 'active'"
                    class="px-2 h-8 rounded-md bg-subtle text-destructive text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="revokingTaskId = t.id"
                  >
                    <XCircle :size="12" class="inline mr-1" />撤销
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </PermissionGuard>

      <!-- 轮次管理 -->
      <PermissionGuard permission="club:recruitment:manage">
        <Card class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-medium text-text-primary">面试轮次管理</h2>
            <button
              class="flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-text-secondary text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-60"
              :disabled="actionLoading"
              @click="roundAdminOpen = !roundAdminOpen"
            >
              <Layers :size="14" /> {{ roundAdminOpen ? '收起' : '轮次管理' }}
            </button>
          </div>

          <div v-if="roundAdminOpen" class="space-y-4">
            <!-- 创建轮次 -->
            <div class="rounded-lg border border-border p-3 space-y-3">
              <p class="text-sm font-medium text-text-primary flex items-center gap-1"><Plus :size="14" /> 新建轮次</p>
              <div class="grid sm:grid-cols-2 gap-3">
                <input v-model="roundForm.name" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="轮次名称，如：一面" />
                <select v-model="roundForm.mode" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary">
                  <option value="club_unified">社团统一面试</option>
                  <option value="dept_separate">分部门面试</option>
                </select>
                <input v-model="roundForm.deadline" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="选时截止（ISO）" />
                <div class="grid grid-cols-2 gap-2">
                  <input v-model="roundForm.slotStart" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="时段开始（ISO）" />
                  <input v-model="roundForm.slotEnd" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="时段结束（ISO）" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input v-model.number="roundForm.slotCapacity" type="number" min="1" class="w-24 px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
                <button
                  class="px-4 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="handleCreateRound"
                >
                  {{ actionLoading ? '创建中...' : '创建轮次' }}
                </button>
                <p v-if="roundError" class="text-xs text-destructive">{{ roundError }}</p>
              </div>
            </div>

            <!-- 轮次列表 -->
            <div class="space-y-2">
              <div v-for="r in rounds" :key="r.id" class="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p class="text-sm font-medium text-text-primary flex items-center gap-2">
                    {{ r.name }} <StateTag :status="r.status" />
                  </p>
                  <p class="text-xs text-text-secondary mt-0.5">{{ r.slots.length }} 个时段 · 已约 {{ r.bookedCount }} 人</p>
                </div>
                <div class="flex items-center gap-2">
                  <template v-if="updatingRound === r.id">
                    <input v-model="newRoundDeadline" class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary" placeholder="新选时截止（ISO）" />
                    <button class="px-2 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium" :disabled="actionLoading" @click="handleUpdateRound(r.id)">保存</button>
                  </template>
                  <button
                    v-else-if="r.status === 'open'"
                    class="flex items-center gap-1 px-2 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="updatingRound = r.id; newRoundDeadline = ''"
                  >
                    <RefreshCw :size="12" /> 改截止
                  </button>
                  <button
                    v-if="r.status === 'open'"
                    class="flex items-center gap-1 px-2 h-8 rounded-md bg-subtle text-destructive text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="openCancelRound(r.id)"
                  >
                    <XCircle :size="12" /> 取消轮次
                  </button>
                </div>
              </div>

              <!-- 跳轮/免试 -->
              <div class="rounded-lg border border-border p-3">
                <p class="text-sm font-medium text-text-primary mb-2">跳轮 / 免试</p>
                <div class="flex flex-wrap items-center gap-2">
                  <select v-model="skipForm.applicantId" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary">
                    <option value="" disabled>选择申请人</option>
                    <option v-for="a in applications.filter((x) => x.status === 'submitted')" :key="a.applicantId" :value="a.applicantId">{{ a.applicantName }}</option>
                  </select>
                  <input v-model="skipForm.reason" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="跳轮原因（必填）" />
                  <button
                    class="px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading || !skipForm.applicantId || !skipForm.reason.trim()"
                    @click="handleSkipRound"
                  >
                    {{ actionLoading ? '处理中...' : '执行跳轮' }}
                  </button>
                </div>
              </div>

              <!-- 取消轮次原因 -->
              <div v-if="cancelRoundId" class="rounded-lg border border-danger bg-danger-subtle p-3">
                <p class="text-sm font-medium text-danger mb-2">取消轮次</p>
                <div class="flex items-center gap-2">
                  <input v-model="cancelRoundReason" class="flex-1 px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="请填写取消原因（必填）" />
                  <button
                    class="px-3 h-9 rounded-md bg-destructive text-text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-60"
                    :disabled="actionLoading || !cancelRoundReason.trim()"
                    @click="handleCancelRound(cancelRoundId)"
                  >
                    {{ actionLoading ? '取消中...' : '确认取消' }}
                  </button>
                  <button
                    class="px-3 h-9 rounded-md border border-border text-text-primary text-sm hover:bg-subtle"
                    @click="cancelRoundId = null; cancelRoundReason = ''; cancelRoundError = ''"
                  >
                    取消
                  </button>
                </div>
                <p v-if="cancelRoundError" class="text-xs text-destructive mt-1">{{ cancelRoundError }}</p>
              </div>
            </div>
          </div>
        </Card>
      </PermissionGuard>

      <div class="grid lg:grid-cols-[1fr_400px] gap-4">
        <!-- 左：列表 -->
        <DataTable
          :columns="columns"
          :rows="items"
          :loading="state === 'loading'"
          empty-title="暂无面试安排"
          @row-click="handleRowClick"
        >
          <template #default="{ row }">
            <td class="px-3 py-2.5 text-sm">{{ (row as InterviewRow).applicantName }}</td>
            <td class="px-3 py-2.5 text-sm">{{ (row as InterviewRow).roundName }}</td>
            <td class="px-3 py-2.5"><StateTag :status="(row as InterviewRow).status" /></td>
            <td class="px-3 py-2.5 text-sm text-text-secondary">{{ formatTime((row as InterviewRow).scheduledTime) }}</td>
          </template>
        </DataTable>

        <!-- 右：操作面板 -->
        <Card v-if="selected" class="h-fit">
          <div class="mb-4">
            <h2 class="text-base font-medium text-text-primary">{{ selected.applicantName }}</h2>
            <p class="text-sm text-text-secondary flex items-center gap-1 mt-0.5">
              <User :size="14" /> {{ selected.studentId || selected.applicantId }}
            </p>
          </div>

          <div class="space-y-2 text-sm mb-4">
            <div class="flex items-center gap-2 text-text-primary">
              <StateTag :status="selected.status" />
              <StateTag v-if="selected.attendance !== 'none'" :status="selected.attendance" />
            </div>
            <div class="flex items-center gap-2 text-text-primary">
              <Calendar :size="15" class="text-text-secondary" /> {{ formatTime(selected.scheduledTime) }}
            </div>
            <div class="flex items-center gap-2 text-text-primary">
              <MapPin :size="15" class="text-text-secondary" /> {{ selected.roundName }}
            </div>
            <p v-if="selected.invalidReason" class="text-xs text-destructive">作废原因：{{ selected.invalidReason }}</p>
          </div>

          <PermissionGuard permission="club:recruitment:manage">
            <div class="space-y-3">
              <!-- 出席登记 -->
              <div v-if="canRegisterAttendance">
                <p class="text-xs text-text-secondary mb-2">出席登记</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="runAction('attendance', { event: 'late' })"
                  >
                    <Clock3 :size="13" class="inline mr-1" />迟到
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="runAction('attendance', { event: 'leave' })"
                  >
                    请假
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionLoading"
                    @click="runAction('attendance', { event: 'absent' })"
                  >
                    缺席
                  </button>
                </div>
              </div>

              <!-- 开始 / 完成 -->
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="canStart"
                  class="flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction('start')"
                >
                  <Play :size="13" /> 开始面试
                </button>
                <button
                  v-if="canComplete"
                  class="flex items-center gap-1.5 px-3 h-8 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction('complete')"
                >
                  <CheckCircle2 :size="13" /> 完成面试
                </button>
              </div>

              <!-- 作废 -->
              <div v-if="canInvalidate" class="pt-3 border-t border-border">
                <p class="text-xs text-text-secondary mb-2">作废面试（须填原因，不可撤销）</p>
                <div class="flex gap-2">
                  <input
                    v-model="invalidReason"
                    class="flex-1 px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="作废原因"
                  />
                  <button
                    class="flex items-center gap-1 px-3 h-8 rounded-md bg-destructive text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                    :disabled="actionLoading || !invalidReason.trim()"
                    @click="runAction('invalidate', { reason: invalidReason })"
                  >
                    <XCircle :size="13" /> 作废
                  </button>
                </div>
              </div>

              <!-- 操作结果反馈统一走 toast，页面内联不再承载 -->
            </div>
          </PermissionGuard>
        </Card>

        <Card v-else class="h-fit flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">点击左侧面试记录查看详情</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
