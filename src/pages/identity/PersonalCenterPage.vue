<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Calendar, Clock, ChevronRight, ClipboardList, Hourglass, History } from '@lucide/vue'

interface TodoItem { id: string; type: string; title: string; description: string; deadline: string; link: string }
interface OngoingItem { id: string; type: string; title: string; description: string; submittedAt: string; link: string }
interface HistoryItem { id: string; type: string; title: string; result: string; completedAt: string }
interface ScheduleItem { id: string; title: string; activityTitle: string; time: string; location: string; interviewerName: string; status: string }

type TabKey = 'todo' | 'ongoing' | 'history' | 'schedule'

const route = useRoute()
const router = useRouter()

const activeTab = computed<TabKey>(() => (route.meta.tab as TabKey) || 'todo')

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

async function loadData() {
  state.value = 'loading'
  const [todoRes, ongoingRes, historyRes, scheduleRes] = await Promise.all([
    get<{ items: TodoItem[] }>('/me/todo'),
    get<{ items: OngoingItem[] }>('/me/ongoing'),
    get<{ items: HistoryItem[] }>('/me/history'),
    get<{ items: ScheduleItem[] }>('/me/schedule'),
  ])

  const allCompleted = [todoRes, ongoingRes, historyRes, scheduleRes].every((r) => r.kind === 'completed')
  if (allCompleted) {
    todos.value = (todoRes as { kind: 'completed'; data: { items: TodoItem[] } }).data.items
    ongoing.value = (ongoingRes as { kind: 'completed'; data: { items: OngoingItem[] } }).data.items
    history.value = (historyRes as { kind: 'completed'; data: { items: HistoryItem[] } }).data.items
    schedule.value = (scheduleRes as { kind: 'completed'; data: { items: ScheduleItem[] } }).data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function switchTab(tab: TabKey) {
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

onMounted(loadData)
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
          <Card v-for="item in todos" :key="item.id" class="cursor-pointer" @click="router.push(item.link)">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-primary">{{ item.title }}</p>
                <p class="text-xs text-text-secondary mt-0.5">{{ item.description }}</p>
                <p class="text-xs text-warning mt-1 flex items-center gap-1">
                  <Clock :size="12" /> 截止：{{ formatTime(item.deadline) }}
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
            <p class="text-sm font-medium text-primary">{{ item.title }}</p>
            <p class="text-xs text-text-secondary mt-0.5">{{ item.description }}</p>
            <p class="text-xs text-muted-foreground mt-1">提交于 {{ formatTime(item.submittedAt) }}</p>
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
                  {{ formatTime(item.time) }} · {{ item.location }} · 面试官：{{ item.interviewerName }}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
