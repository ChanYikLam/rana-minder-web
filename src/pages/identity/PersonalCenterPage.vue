<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf, type ErrorCode } from '@/services/error-map'
import type { ApiResult } from '@/types/contracts'
import { toast } from 'vue-sonner'
import { navigateByLink } from '@/router/safeLink'
import type { PageState } from '@/types/machine'
import { Calendar, Clock, ChevronRight, ClipboardList, Hourglass, History, XCircle } from '@lucide/vue'

interface TodoItem { id: string; type: string; title: string; description: string; deadline: string; link: string }
interface OngoingItem { id: string; type: string; title: string; description: string; submittedAt: string; link: string; activityId?: string; status?: string }
interface HistoryItem { id: string; type: string; title: string; result: string; completedAt: string }
interface ScheduleItem { id: string; title: string; activityTitle: string; time: string; location: string; interviewerName: string; status: string; role?: 'applicant' | 'interviewer'; applicantName?: string }

type TabKey = 'todo' | 'ongoing' | 'history' | 'schedule'

const route = useRoute()
const router = useRouter()

const tabs: { key: TabKey; label: string; icon: typeof ClipboardList }[] = [
  { key: 'todo', label: '待我处理', icon: ClipboardList },
  { key: 'ongoing', label: '进行中', icon: Hourglass },
  { key: 'history', label: '历史记录', icon: History },
  { key: 'schedule', label: '面试日程', icon: Calendar },
]

const state = ref<PageState>('loading')
const todos = ref<TodoItem[]>([])
const ongoing = ref<OngoingItem[]>([])
const history = ref<HistoryItem[]>([])
const schedule = ref<ScheduleItem[]>([])
const confirmingId = ref<string | null>(null)
const withdrawing = ref(false)
// P2-16：确认态 5s 超时复位（对照 JointApply/Application 的撤销确认）；切 tab/卸载/执行后清理
let confirmWithdrawTimer: ReturnType<typeof setTimeout> | null = null

/** P2-16：清理确认态并取消计时器，旧点击不再被误当“确认” */
function resetConfirmState() {
  if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
  confirmWithdrawTimer = null
  confirmingId.value = null
}

// P2-42：各 tab 数据独立加载，单点失败不再拖垮整页；
// 页面整体状态由当前激活 tab 决定，其余 tab 失败仅记录，切到该 tab 时再呈现错误
const tabErrors = ref<Partial<Record<TabKey, ErrorCode>>>({})

const activeTab = computed<TabKey>(() => (route.meta.tab as TabKey) || 'todo')

async function loadData() {
  state.value = 'loading'
  const [todoRes, ongoingRes, historyRes, scheduleRes] = await Promise.allSettled([
    get<{ items: TodoItem[] }>('/me/todo'),
    get<{ items: OngoingItem[] }>('/me/ongoing'),
    get<{ items: HistoryItem[] }>('/me/history'),
    get<{ items: ScheduleItem[] }>('/me/schedule'),
  ])

  // P2-42：各 tab 独立处理；请求本身不抛异常（rejected 结果），allSettled 兜底网络层异常
  const rejected = (msg: string): ApiResult<unknown> => ({
    kind: 'rejected', error: { code: 'IFC-ERR-016', message: msg },
  })
  const normalized: ApiResult<unknown>[] = [todoRes, ongoingRes, historyRes, scheduleRes].map((r) =>
    r.status === 'fulfilled' ? r.value : rejected('加载失败'),
  )
  const [todoR, ongoingR, historyR, scheduleR] = normalized

  if (todoR.kind === 'completed') todos.value = (todoR.data as { items: TodoItem[] }).items
  if (ongoingR.kind === 'completed') ongoing.value = (ongoingR.data as { items: OngoingItem[] }).items
  if (historyR.kind === 'completed') history.value = (historyR.data as { items: HistoryItem[] }).items
  if (scheduleR.kind === 'completed') schedule.value = (scheduleR.data as { items: ScheduleItem[] }).items

  const store = (key: TabKey, r: ApiResult<unknown>) => {
    if (r.kind === 'rejected') tabErrors.value[key] = errorCodeOf(r)
    else delete tabErrors.value[key]
  }
  store('todo', todoR)
  store('ongoing', ongoingR)
  store('history', historyR)
  store('schedule', scheduleR)

  // 当前激活 tab 失败才整页错误，其余 tab 的失败不影响整页
  state.value = tabErrors.value[activeTab.value] ? errorToPageState(tabErrors.value[activeTab.value]!) : 'normal'
}

async function handleWithdraw(item: OngoingItem) {
  if (!item.activityId || withdrawing.value) return
  if (confirmingId.value !== item.id) {
    confirmingId.value = item.id
    if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
    confirmWithdrawTimer = setTimeout(() => {
      confirmingId.value = null
      confirmWithdrawTimer = null
    }, 5000)
    return
  }
  resetConfirmState()
  withdrawing.value = true
  try {
    const result = await post(`/activity/recruitment/${item.activityId}/withdraw`, { confirm: true })
    if (result.kind === 'completed') {
      toast.success('已退出招新')
      await loadData()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '退出失败')
    }
  } finally {
    withdrawing.value = false
  }
}

function switchTab(tab: TabKey) {
  // P2-16：切 tab 清理确认态，避免旧确认在切换后误触发
  resetConfirmState()
  const pathMap: Record<TabKey, string> = {
    todo: '/me/todo',
    ongoing: '/me/ongoing',
    history: '/me/history',
    schedule: '/me/schedule',
  }
  router.push(pathMap[tab])
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isOverdue(deadline: string): boolean {
  return new Date(deadline).getTime() < Date.now()
}

// P2-42：切换 tab 时按该 tab 的加载结果刷新整页状态
watch(activeTab, (key) => {
  // P2-16：路由级切 tab（浏览器前进/后退等不经 switchTab 的路径）同样清理确认态
  resetConfirmState()
  if (state.value === 'loading') return
  state.value = tabErrors.value[key] ? errorToPageState(tabErrors.value[key]!) : 'normal'
})

onMounted(loadData)

onUnmounted(resetConfirmState)
</script>

<template>
  <PageStateBoundary :state="state" title="个人中心" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-primary mb-6">个人中心</h1>

      <!-- Tab 切换 -->
      <div class="flex gap-1 border-b border-border mb-6 overflow-x-auto" role="tablist" aria-label="个人中心分区">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
          :class="activeTab === tab.key
            ? 'border-primary text-primary'
            : 'border-transparent text-text-secondary hover:text-primary'"
          @click="switchTab(tab.key)"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.label }}
          <span
            v-if="tab.key === 'todo' && todos.length > 0"
            class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-accent text-text-on-accent font-bold"
          >
            {{ todos.length }}
          </span>
        </button>
      </div>

      <!-- 待我处理 -->
      <div v-if="activeTab === 'todo'" role="tabpanel" aria-label="待我处理">
        <EmptyState
          v-if="todos.length === 0"
          type="no_data"
          title="暂无待处理事项"
          description="当有新的邀请、面试确认等待办时会显示在这里"
        />
        <div v-else class="space-y-3">
          <Card v-for="item in todos" :key="item.id" class="cursor-pointer" @click="navigateByLink(item.link)">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-primary">{{ item.title }}</p>
                <p class="text-xs text-text-secondary mt-0.5">{{ item.description }}</p>
                <p v-if="item.deadline" class="text-xs mt-1 flex items-center gap-1" :class="isOverdue(item.deadline) ? 'text-danger' : 'text-warning'">
                  <Clock :size="12" />
                  <template v-if="isOverdue(item.deadline)">已逾期（截止 {{ formatTime(item.deadline) }}）</template>
                  <template v-else>截止：{{ formatTime(item.deadline) }}</template>
                </p>
              </div>
              <ChevronRight :size="18" class="text-muted-foreground" />
            </div>
          </Card>
        </div>
      </div>

      <!-- 进行中 -->
      <div v-else-if="activeTab === 'ongoing'" role="tabpanel" aria-label="进行中">
        <EmptyState
          v-if="ongoing.length === 0"
          type="no_data"
          title="暂无进行中的事项"
          description="您提交的报名、申请等在进行中会显示在这里"
        />
        <div v-else class="space-y-3">
          <Card v-for="item in ongoing" :key="item.id">
            <div class="flex items-start justify-between">
              <div class="cursor-pointer" @click="navigateByLink(item.link)">
                <p class="text-sm font-medium text-primary">{{ item.title }}</p>
                <p class="text-xs text-text-secondary mt-0.5">{{ item.description }}</p>
                <p class="text-xs text-muted-foreground mt-1">提交于 {{ formatTime(item.submittedAt) }}</p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <button
                  v-if="item.type === 'application' && item.status !== 'accepted' && item.activityId"
                  class="flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium border transition-colors"
                  :class="confirmingId === item.id
                    ? 'border-danger bg-danger-subtle text-danger'
                    : 'border-border text-text-secondary hover:border-danger hover:text-danger'"
                  :disabled="withdrawing"
                  @click="handleWithdraw(item)"
                >
                  <XCircle :size="13" />
                  {{ confirmingId === item.id ? (withdrawing ? '处理中...' : '再点一次确认退出') : '退出招新' }}
                </button>
                <p v-else-if="item.type === 'application' && item.status === 'accepted'" class="text-xs text-warning">
                  已接受录取，请走成员退出流程
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 历史记录 -->
      <div v-else-if="activeTab === 'history'" role="tabpanel" aria-label="历史记录">
        <EmptyState
          v-if="history.length === 0"
          type="no_data"
          title="暂无历史记录"
          description="已完成的报名、申请记录会显示在这里"
        />
        <div v-else class="space-y-3">
          <Card v-for="item in history" :key="item.id">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-primary">{{ item.title }}</p>
                <p class="text-xs text-muted-foreground mt-1">完成于 {{ formatTime(item.completedAt) }}</p>
              </div>
              <span
                class="text-xs px-2 py-1 rounded"
                :class="item.result === '未录取' ? 'bg-muted text-text-secondary' : 'bg-success-subtle text-success'"
              >
                {{ item.result }}
              </span>
            </div>
          </Card>
        </div>
      </div>

      <!-- 面试日程 -->
      <div v-else role="tabpanel" aria-label="面试日程">
        <EmptyState
          v-if="schedule.length === 0"
          type="no_data"
          title="暂无面试安排"
          description="当您的面试被排期后会显示在这里"
        />
        <div v-else class="space-y-3">
          <Card v-for="item in schedule" :key="item.id">
            <div class="flex items-start gap-3">
              <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-primary-subtle text-primary shrink-0">
                <Calendar :size="22" />
              </div>
              <div>
                <p class="text-sm font-medium text-primary">{{ item.title }}</p>
                <p class="text-xs text-text-secondary">{{ item.activityTitle }}</p>
                <p class="text-xs text-text-secondary mt-1">
                  <template v-if="item.role === 'interviewer'">
                    {{ formatTime(item.time) }} · 面试对象：{{ item.applicantName }}
                  </template>
                  <template v-else>
                    {{ formatTime(item.time) }} · {{ item.location }} · 面试官：{{ item.interviewerName }}
                  </template>
                </p>
              </div>
              <span
                v-if="item.role === 'interviewer'"
                class="ml-auto shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs bg-warning-subtle text-warning"
              >
                我的任务
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
