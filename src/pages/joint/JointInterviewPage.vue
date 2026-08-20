<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Calendar, Users, AlertTriangle, Play, CheckCircle2, XCircle, Clock3, CalendarPlus, Star, Plus } from '@lucide/vue'

interface JointInterview {
  id: string; jointId: string; applicantId: string; applicantName: string
  status: string; scheduledTime: string; attendance: string; invalidReason: string | null; attempt: number
  reviews: { clubId: string; clubName: string; rating: number; comment: string; concludedAt: string }[]
}
interface JointApp { applicantId: string; applicantName: string; status: string }
interface Slot { id: string; startAt: string; capacity: number; available: number }
interface JointInterviewerTask { id: string; userId: string; userName: string; scope: string; status: string }
interface CandidateItem { id: string; name: string; role: string }

const route = useRoute()
const state = ref<PageState>('loading')
const interviews = ref<JointInterview[]>([])
const applications = ref<JointApp[]>([])
const slots = ref<Slot[]>([])
// P2-35：作废原因按申请人隔离（Record<applicantId, reason>），A 卡输入不残留到 B 卡
const invalidReasons = ref<Record<string, string>>({})
const actionLoading = ref(false)
const bookOpen = ref(false)
const bookForm = ref({ applicantId: '', slotId: '' })

const clubId = computed(() => (route.params.clubId as string) || '')
const jointId = computed(() => (route.params.jointId as string) || '')

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: JointInterview[] }>(`/org/${clubId.value}/joint/${jointId.value}/interviews`)
  if (result.kind === 'completed') {
    interviews.value = result.data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function loadOptions() {
  // P2-36：加载失败不再静默--下拉为空时给出明确错误提示，而非误导"无数据"
  optionsError.value = ''
  const [a, s] = await Promise.all([
    get<{ items: JointApp[] }>(`/org/${clubId.value}/joint/${jointId.value}/applications`),
    get<{ items: Slot[] }>(`/org/${clubId.value}/joint/${jointId.value}/slots`),
  ])
  if (a.kind === 'completed') {
    applications.value = a.data.items
  } else {
    optionsError.value = '申请人列表加载失败'
    toast.error('申请人列表加载失败，请刷新重试')
  }
  if (s.kind === 'completed') {
    slots.value = s.data.items
  } else {
    optionsError.value = optionsError.value ? `${optionsError.value}；面试时段加载失败` : '面试时段加载失败'
    toast.error('面试时段加载失败，请刷新重试')
  }
}

function formatTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function runAction(applicantId: string, action: string, input?: Record<string, unknown>) {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    const result = await post(
      `/org/${clubId.value}/joint/${jointId.value}/interviews/${applicantId}/${action}`,
      { ...(input || {}) }
    )
    if (result.kind === 'completed') {
      await loadData()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '操作失败')
    }
  } finally {
    actionLoading.value = false
  }
}

async function handleBook() {
  if (!bookForm.value.applicantId || !bookForm.value.slotId || actionLoading.value) return
  actionLoading.value = true
  try {
    const result = await post(`/org/${clubId.value}/joint/${jointId.value}/interviews/book`, {
      applicantId: bookForm.value.applicantId,
      slotId: bookForm.value.slotId,
    })
    if (result.kind === 'completed') {
      toast.success('预约成功')
      bookOpen.value = false
      bookForm.value = { applicantId: '', slotId: '' }
      await loadData()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '预约失败')
    }
  } finally {
    actionLoading.value = false
  }
}

const canRegisterAttendance = (s: string) => s === 'scheduled'
const canStart = (s: string) => ['scheduled', 'late'].includes(s)
const canComplete = (s: string) => s === 'in_progress'
const canInvalidate = (s: string) => !['cancelled', 'invalidated', 'completed'].includes(s)

// 临时联合面试官任务（JNT-031/ORG-037：本社团当前成员，活动级）
const interviewerOpen = ref(false)
const defaultReviewers = ref<{ id: string; name: string; source: string }[]>([])
const jointTasks = ref<JointInterviewerTask[]>([])
const candidates = ref<CandidateItem[]>([])
const taskForm = ref<{ userId: string }>({ userId: '' })
const taskError = ref('')
const revokingTaskId = ref<string | null>(null)
// P2-36：选项/面试官加载失败时的错误态（避免下拉静默为空）
const optionsError = ref('')
const interviewersError = ref('')

async function loadInterviewers() {
  // P2-36：加载失败不再静默
  interviewersError.value = ''
  const [t, c] = await Promise.all([
    get<{ defaultReviewers: { id: string; name: string; source: string }[]; tasks: JointInterviewerTask[] }>(`/org/${clubId.value}/joint/${jointId.value}/interviewers`),
    get<{ items: CandidateItem[] }>(`/org/${clubId.value}/joint/${jointId.value}/interviewers/candidates`),
  ])
  if (t.kind === 'completed') {
    // 防御：后端缺省字段时回落空数组，避免模板 .map 崩溃
    defaultReviewers.value = t.data.defaultReviewers ?? []
    jointTasks.value = t.data.tasks ?? []
  } else {
    interviewersError.value = '面试官任务加载失败'
    toast.error('面试官任务加载失败，请刷新重试')
  }
  if (c.kind === 'completed') {
    candidates.value = c.data.items
  } else {
    interviewersError.value = interviewersError.value ? `${interviewersError.value}；候选成员加载失败` : '候选成员加载失败'
    toast.error('候选成员加载失败，请刷新重试')
  }
}

async function handleAssignTask() {
  if (!taskForm.value.userId) {
    taskError.value = '请选择要指派的成员'
    return
  }
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    const candidate = candidates.value.find((x) => x.id === taskForm.value.userId)
    const result = await post(`/org/${clubId.value}/joint/${jointId.value}/interviewers`, {
      userId: taskForm.value.userId,
      userName: candidate?.name || '',
    })
    if (result.kind === 'completed') {
      taskForm.value = { userId: '' }
      taskError.value = ''
      await loadInterviewers()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '指派失败')
    }
  } finally {
    actionLoading.value = false
  }
}

async function handleRevokeTask(taskId: string) {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    const result = await post(`/org/${clubId.value}/joint/${jointId.value}/interviewers/${taskId}/revoke`, {})
    revokingTaskId.value = null
    if (result.kind === 'completed') {
      await loadInterviewers()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '撤销失败')
    }
  } finally {
    actionLoading.value = false
  }
}

onMounted(async () => {
  await loadData()
  await loadOptions()
  await loadInterviewers()
})
</script>

<template>
  <PageStateBoundary :state="state" title="联合面试" @retry="loadData">
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">联合面试排期与评价</h1>
          <p class="text-sm text-text-secondary mt-1">共享排期，一次面试，各参与社团独立评价</p>
        </div>
        <PermissionGuard permission="club:joint:manage">
          <button
            class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
            :disabled="actionLoading"
            @click="bookOpen = !bookOpen"
          >
            <CalendarPlus :size="16" /> 代预约面试
          </button>
        </PermissionGuard>
      </div>

      <!-- 代预约 -->
      <Card v-if="bookOpen" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">代申请人预约联合面试</h2>
        <div class="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-xs text-text-secondary mb-1">申请人</label>
            <select
              v-model="bookForm.applicantId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            >
              <option value="" disabled>选择申请人</option>
              <option v-for="a in applications.filter((x) => x.status === 'submitted')" :key="a.applicantId" :value="a.applicantId">
                {{ a.applicantName }}
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
              <option v-for="s in slots.filter((x) => x.available > 0)" :key="s.id" :value="s.id">
                {{ formatTime(s.startAt) }}（剩 {{ s.available }}）
              </option>
            </select>
          </div>
          <div class="flex items-end">
            <button
              class="px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading || !bookForm.applicantId || !bookForm.slotId"
              @click="handleBook"
            >
              {{ actionLoading ? '预约中...' : '确认预约' }}
            </button>
          </div>
        </div>
        <p v-if="optionsError" class="mt-2 text-xs text-destructive flex items-center gap-1">
          <AlertTriangle :size="12" /> {{ optionsError }}
        </p>
      </Card>

      <!-- 临时联合面试官任务（JNT-031/ORG-037） -->
      <PermissionGuard permission="club:joint:manage">
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
              默认面试官：{{ defaultReviewers.map((d) => d.name).join('、') || '无' }}。临时面试官须为本社团当前成员，撤销或联合活动结束即失效。
            </p>
            <p v-if="interviewersError" class="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle :size="12" /> {{ interviewersError }}
            </p>

            <div v-if="interviewerOpen" class="rounded-lg border border-border p-3 space-y-3">
              <p class="text-sm font-medium text-text-primary flex items-center gap-1"><Plus :size="14" /> 指派临时联合面试官（覆盖全部联合面试）</p>
              <div class="grid sm:grid-cols-3 gap-3">
                <select v-model="taskForm.userId" class="px-2 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary">
                  <option value="" disabled>选择成员</option>
                  <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.name }}（{{ c.role }}）</option>
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

            <div v-if="jointTasks.length" class="space-y-2">
              <div v-for="t in jointTasks" :key="t.id" class="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ t.userName }}</p>
                  <p class="text-xs text-text-secondary mt-0.5">
                    活动级 · 全部联合面试 <StateTag :status="t.status" />
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

      <div class="grid gap-3">
        <!-- P2-37：面试列表空态 -->
        <Card v-if="interviews.length === 0" class="py-10 text-center">
          <CalendarPlus :size="28" class="mx-auto text-text-secondary mb-2" />
          <p class="text-sm text-text-secondary">暂无联合面试记录，可在上方为申请人预约面试</p>
        </Card>
        <Card v-for="iv in interviews" :key="iv.id">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-base font-medium text-text-primary">{{ iv.applicantName }}</p>
              <div class="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                <span class="flex items-center gap-1"><Calendar :size="14" /> {{ formatTime(iv.scheduledTime) }}</span>
                <span class="flex items-center gap-1"><Users :size="14" /> 第 {{ iv.attempt }} 次尝试</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="iv.status" />
              <StateTag v-if="iv.attendance !== 'none'" :status="iv.attendance" />
            </div>
          </div>

          <p v-if="iv.invalidReason" class="text-xs text-destructive mb-2">作废原因：{{ iv.invalidReason }}</p>

          <!-- JNT-012: 联合面试评价实时互见（与普通面试"首评前隔离"不同） -->
          <div v-if="iv.status === 'completed' || iv.status === 'in_progress'" class="border-t border-border pt-3 mt-2">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs text-text-secondary">跨社评价（实时互见）</p>
              <span class="text-xs text-info">各社团评价实时互相可见</span>
            </div>
            <div v-if="iv.reviews.length === 0" class="rounded-md bg-subtle px-3 py-2">
              <p class="text-xs text-text-secondary">尚未有社团提交评价</p>
            </div>
            <div v-else class="space-y-2">
              <div v-for="rv in iv.reviews" :key="rv.clubId" class="rounded-md bg-subtle px-3 py-2">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-text-primary">{{ rv.clubName }}</span>
                  <span class="flex items-center gap-1 text-xs text-warning">
                    <Star :size="12" class="fill-warning" /> {{ rv.rating }}
                  </span>
                </div>
                <p v-if="rv.comment" class="text-xs text-text-secondary">{{ rv.comment }}</p>
              </div>
            </div>
            <p class="text-xs text-text-secondary mt-2">注：只能修改本人提交的评语，活动结束后锁定</p>
          </div>

          <div v-else-if="iv.status === 'scheduled' || iv.status === 'confirmed'" class="border-t border-border pt-3 mt-2">
            <p class="text-xs text-text-secondary">面试待进行，完成后各社团将独立评价（实时互见）</p>
          </div>

          <!-- JNT-010: 面试作废待复核标志 -->
          <div v-if="iv.status === 'invalidated'" class="border-t border-border pt-3 mt-2">
            <div class="rounded-lg bg-warning-subtle p-2 flex items-center gap-2">
              <AlertTriangle :size="14" class="text-warning" />
              <p class="text-xs text-warning">面试作废待复核 — 邀请暂不可接受，等待补面后各社团独立复核</p>
            </div>
          </div>

          <!-- 管理操作 -->
          <PermissionGuard permission="club:joint:manage">
            <div class="border-t border-border pt-3 mt-2 space-y-3">
              <div v-if="canRegisterAttendance(iv.status)" class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-text-secondary">出席登记：</span>
                <button
                  class="flex items-center gap-1 px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction(iv.applicantId, 'attendance', { event: 'late' })"
                >
                  <Clock3 :size="13" /> 迟到
                </button>
                <button
                  class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction(iv.applicantId, 'attendance', { event: 'leave' })"
                >
                  请假
                </button>
                <button
                  class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction(iv.applicantId, 'attendance', { event: 'absent' })"
                >
                  缺席
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-if="canStart(iv.status)"
                  class="flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction(iv.applicantId, 'start')"
                >
                  <Play :size="13" /> 开始面试
                </button>
                <button
                  v-if="canComplete(iv.status)"
                  class="flex items-center gap-1.5 px-3 h-8 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runAction(iv.applicantId, 'complete')"
                >
                  <CheckCircle2 :size="13" /> 完成面试
                </button>
                <template v-if="canInvalidate(iv.status)">
                  <input
                    v-model="invalidReasons[iv.applicantId]"
                    class="flex-1 max-w-52 px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="作废原因（必填）"
                  />
                  <button
                    class="flex items-center gap-1 px-3 h-8 rounded-md bg-destructive text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                    :disabled="actionLoading || !(invalidReasons[iv.applicantId] ?? '').trim()"
                    @click="runAction(iv.applicantId, 'invalidate', { reason: invalidReasons[iv.applicantId] ?? '' })"
                  >
                    <XCircle :size="13" /> 作废
                  </button>
                </template>
              </div>
            </div>
          </PermissionGuard>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
