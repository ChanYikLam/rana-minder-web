<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { ClipboardList, Users, Mail, ChevronRight, Plus, Building2 } from '@lucide/vue'

interface TodoItem { id: string; type: string; title: string; count: number }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const clubName = ref('计算机协会')
const role = ref('负责人')
const todos = ref<TodoItem[]>([])

async function loadDashboard() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{
    club: { id: string; name: string }; role: string; permissions: string[]
    todos: TodoItem[]; recentActivities: unknown[]
  }>(`/org/${clubId}/dashboard`)
  if (result.kind === 'completed') {
    const data = result.data
    clubName.value = data.club.name
    role.value = data.role
    todos.value = data.todos
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

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
          class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
          @click="router.push(`/org/${route.params.clubId}/recruitment/create`)"
        >
          <Plus :size="16" /> 创建活动
        </button>
      </div>

      <!-- 待办事项 -->
      <h2 class="text-base font-medium text-text-primary mb-3">待办事项</h2>
      <div v-if="todos.length > 0" class="space-y-3 mb-6">
        <Card
          v-for="todo in todos"
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
        <Card padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/members/appointments`)">
          <Users :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">成员管理</p>
        </Card>
        <Card padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/batch`)">
          <ClipboardList :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">批量操作</p>
        </Card>
        <Card padding="p-4" class="cursor-pointer text-center" @click="router.push(`/org/${route.params.clubId}/config`)">
          <Building2 :size="24" class="mx-auto text-primary mb-2" />
          <p class="text-sm text-text-primary">社团配置</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
