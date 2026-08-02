<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import SyncIndicator from '@/components/common/SyncIndicator.vue'
import { get } from '@/services/client'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import type { PageState } from '@/types/machine'
import { ClipboardList, Users, Mail, ChevronRight, Plus, Building2, ClipboardCheck, CalendarClock, Send, AlertTriangle } from '@lucide/vue'

interface TodoItem { id: string; type: string; title: string; count: number }
interface DashboardMetrics {
  pendingReviews: number
  pendingInterviews: number
  pendingResults: number
  syncErrors: number
}

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceContextStore()
const state = ref<PageState>('loading')
const clubName = ref('计算机协会')
const role = ref('负责人')
const todos = ref<TodoItem[]>([])
const metrics = ref<DashboardMetrics | null>(null)

async function loadDashboard() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{
    club: { id: string; name: string }; role: string; permissions: string[]
    metrics?: DashboardMetrics
    todos: TodoItem[]; recentActivities: unknown[]
  }>(`/org/${clubId}/dashboard`)
  if (result.kind === 'completed') {
    const data = result.data
    clubName.value = data.club.name
    role.value = data.role
    todos.value = data.todos
    metrics.value = data.metrics ?? null
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

const can = (permission: string) => workspace.hasPermission(permission)

const visibleTodos = computed(() =>
  todos.value.filter((todo) => {
    if (todo.type === 'application_review') return can('club:member:manage')
    return can('club:recruitment:manage')
  }),
)

const todoIcons: Record<string, typeof ClipboardList> = {
  application_review: ClipboardList,
  interview_schedule: Users,
  invitation_pending: Mail,
}

onMounted(loadDashboard)
</script>

<template>
  <PageStateBoundary :state="state" title="管理工作台" @retry="loadDashboard">
    <div class="max-w-3xl mx-auto">
      <!-- 工作空间头部 -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-subtle text-primary font-medium">
            {{ clubName.charAt(0) }}
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary">{{ clubName }}</h1>
            <p class="text-sm text-text-secondary">{{ role }}</p>
          </div>
        </div>
        <button
          v-if="can('club:recruitment:manage')"
          class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
          @click="router.push(`/org/${route.params.clubId}/recruitment/create`)"
        >
          <Plus :size="16" /> 创建活动
        </button>
      </div>

      <!-- HR 指标 -->
      <div v-if="metrics" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card v-if="can('club:member:manage')" padding="p-4" class="cursor-pointer" @click="router.push(`/org/${route.params.clubId}/members/department-apply`)">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary"><ClipboardCheck :size="20" /></div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ metrics.pendingReviews }}</p>
              <p class="text-xs text-text-secondary">待审批申请</p>
            </div>
          </div>
        </Card>
        <Card v-if="can('club:recruitment:manage')" padding="p-4" class="cursor-pointer" @click="router.push(`/org/${route.params.clubId}/recruitment/act-001/interview`)">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-warning-subtle text-warning"><CalendarClock :size="20" /></div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ metrics.pendingInterviews }}</p>
              <p class="text-xs text-text-secondary">待安排面试</p>
            </div>
          </div>
        </Card>
        <Card v-if="can('club:recruitment:manage')" padding="p-4" class="cursor-pointer" @click="router.push(`/org/${route.params.clubId}/recruitment/act-001/invitations`)">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-success-subtle text-success"><Send :size="20" /></div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ metrics.pendingResults }}</p>
              <p class="text-xs text-text-secondary">待发布结果</p>
            </div>
          </div>
        </Card>
        <Card v-if="can('club:member:manage')" padding="p-4" class="cursor-pointer" :class="metrics.syncErrors > 0 ? 'border-danger' : ''" @click="router.push(`/org/${route.params.clubId}/members`)">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-danger-subtle text-danger"><AlertTriangle :size="20" /></div>
            <div>
              <p class="text-2xl font-bold" :class="metrics.syncErrors > 0 ? 'text-danger' : 'text-text-primary'">{{ metrics.syncErrors }}</p>
              <p class="text-xs text-text-secondary">同步异常</p>
            </div>
          </div>
        </Card>
      </div>

      <!-- 同步异常告警 -->
      <Card v-if="metrics && metrics.syncErrors > 0 && can('club:member:manage')" class="mb-6 border-danger">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-danger-subtle text-danger"><AlertTriangle :size="20" /></div>
            <div>
              <p class="text-sm font-medium text-text-primary">需要关注</p>
              <p class="text-xs text-text-secondary mt-0.5">Casdoor Group 写入回读存在 {{ metrics.syncErrors }} 条异常，成员权限尚未开放。</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <SyncIndicator status="sync_failed" />
            <button class="px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="router.push(`/org/${route.params.clubId}/members`)">查看异常</button>
          </div>
        </div>
      </Card>

      <!-- 待办事项 -->
      <h2 class="text-base font-medium text-text-primary mb-3">待办事项</h2>
      <div v-if="visibleTodos.length > 0" class="space-y-3 mb-6">
        <Card
          v-for="todo in visibleTodos"
          :key="todo.id"
          class="cursor-pointer"
          @click="router.push(`/org/${route.params.clubId}/recruitment/act-001`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-warning-subtle text-warning">
                <component :is="todoIcons[todo.type] || ClipboardList" :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ todo.title }}</p>
                <p class="text-xs text-text-secondary">待处理</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-lg font-bold text-primary">{{ todo.count }}</span>
              <ChevronRight :size="18" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
      <Card v-else class="mb-6 flex items-center justify-center py-8">
        <p class="text-sm text-text-secondary">暂无待办事项</p>
      </Card>

      <!-- 快捷入口 -->
      <h2 class="text-base font-medium text-text-primary mb-3">快捷入口</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card v-if="can('club:member:manage')" padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/members`)">
          <Users :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">成员管理</p>
        </Card>
        <Card v-if="can('club:batch:execute')" padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/batch`)">
          <ClipboardList :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">批量操作</p>
        </Card>
        <Card v-if="can('club:config:manage')" padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/config`)">
          <Building2 :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">社团配置</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
