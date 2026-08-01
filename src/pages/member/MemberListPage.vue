<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import {
  Search, UserCircle, ChevronRight, UserPlus, ArrowRightLeft,
  LogOut, Users, Mail, RefreshCw, Building2,
} from '@lucide/vue'

interface MemberPosition {
  departmentId: string
  departmentName: string
  title: string
  status: string
}
interface Member {
  id: string
  name: string
  studentId: string
  email: string
  phone: string
  positions: MemberPosition[]
  department: string
  title: string
  status: string
  joinedAt: string
  exitedAt: string | null
}
interface Stats {
  total: number
  active: number
  exited: number
  byDepartment: { name: string; count: number }[]
  zeroDepartment: number
}

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const members = ref<Member[]>([])
const stats = ref<Stats | null>(null)
const keyword = ref('')
const deptFilter = ref('all')
const statusFilter = ref('all')

const canManage = computed(() => session.hasPermission('club:member:manage'))
const canViewContact = computed(() => canManage.value || session.hasPermission('club:audit:view'))

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: Member[]; stats: Stats }>(`/org/${clubId}/members`)
  if (result.kind === 'completed') {
    members.value = (result as { kind: 'completed'; data: { items: Member[]; stats: Stats } }).data.items
    stats.value = (result as { kind: 'completed'; data: { items: Member[]; stats: Stats } }).data.stats
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

const filtered = computed(() => {
  let result = members.value

  if (statusFilter.value !== 'all') {
    result = result.filter((m) => m.status === statusFilter.value)
  }

  if (deptFilter.value === 'zero') {
    result = result.filter((m) => m.positions.length === 0)
  } else if (deptFilter.value !== 'all') {
    result = result.filter((m) => m.positions.some((p) => p.departmentId === deptFilter.value))
  }

  if (keyword.value.trim()) {
    const kw = keyword.value.trim()
    result = result.filter(
      (m) => m.name.includes(kw) || m.studentId.includes(kw),
    )
  }

  return result
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="成员管理" @retry="loadData">
    <div class="max-w-5xl mx-auto">
      <!-- 标题 + 快捷操作 -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">成员管理</h1>
          <p class="text-sm text-text-secondary mt-1">管理社团成员、部门关系与职位</p>
        </div>
        <div v-if="canManage" class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
            @click="router.push(`/org/${route.params.clubId}/members/appointments`)"
          >
            <UserPlus :size="15" /> 任命调岗
          </button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
            @click="router.push(`/org/${route.params.clubId}/members/invite`)"
          >
            <Mail :size="15" /> 入社邀请
          </button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
            @click="router.push(`/org/${route.params.clubId}/members/department-apply`)"
          >
            <ArrowRightLeft :size="15" /> 部门管理
          </button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
            @click="router.push(`/org/${route.params.clubId}/members/exit`)"
          >
            <LogOut :size="15" /> 退出移除
          </button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
            @click="router.push(`/org/${route.params.clubId}/members/transition`)"
          >
            <RefreshCw :size="15" /> 换届管理
          </button>
        </div>
      </div>

      <!-- 统计概览 -->
      <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card class="!p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary">
              <Users :size="20" />
            </div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ stats.total }}</p>
              <p class="text-xs text-text-secondary">总成员</p>
            </div>
          </div>
        </Card>
        <Card class="!p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-success-subtle text-success">
              <UserCircle :size="20" />
            </div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ stats.active }}</p>
              <p class="text-xs text-text-secondary">活跃成员</p>
            </div>
          </div>
        </Card>
        <Card class="!p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-muted text-text-secondary">
              <LogOut :size="20" />
            </div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ stats.exited }}</p>
              <p class="text-xs text-text-secondary">已退出</p>
            </div>
          </div>
        </Card>
        <Card class="!p-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-warning-subtle text-warning">
              <Building2 :size="20" />
            </div>
            <div>
              <p class="text-2xl font-bold text-text-primary">{{ stats.zeroDepartment }}</p>
              <p class="text-xs text-text-secondary">待分配部门</p>
            </div>
          </div>
        </Card>
      </div>

      <!-- 部门分布 -->
      <div v-if="stats" class="flex flex-wrap items-center gap-2 mb-4">
        <span class="text-xs text-text-secondary">部门分布：</span>
        <span
          v-for="d in stats.byDepartment"
          :key="d.name"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-subtle text-text-secondary"
        >
          {{ d.name }} ({{ d.count }})
        </span>
        <span
          v-if="stats.zeroDepartment > 0"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning-subtle text-warning"
        >
          待分配 ({{ stats.zeroDepartment }})
        </span>
      </div>

      <!-- 筛选工具栏 -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="relative flex-1 min-w-[200px]">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索姓名或学号..."
            class="w-full h-10 pl-10 pr-4 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          />
        </div>
        <select
          v-model="deptFilter"
          class="h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
        >
          <option value="all">全部部门</option>
          <option v-for="d in stats?.byDepartment" :key="d.name" :value="d.name">{{ d.name }}</option>
          <option value="zero">待分配</option>
        </select>
        <select
          v-model="statusFilter"
          class="h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
        >
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="exited">已退出</option>
          <option value="removed">已移除</option>
        </select>
      </div>

      <!-- 成员列表 -->
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-text-secondary">共 {{ filtered.length }} 人</span>
      </div>

      <EmptyState v-if="filtered.length === 0" type="no_data" title="未找到符合条件的成员" />

      <div v-else class="space-y-2">
        <Card
          v-for="m in filtered"
          :key="m.id"
          class="cursor-pointer hover:border-primary transition-colors"
          @click="router.push(`/org/${route.params.clubId}/members/${m.id}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary shrink-0">
                <UserCircle :size="20" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-text-primary">{{ m.name }}</p>
                  <StateTag :status="m.status" />
                </div>
                <div class="flex items-center gap-3 mt-0.5">
                  <p class="text-xs text-text-secondary">{{ m.studentId }}</p>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="p in m.positions"
                      :key="p.departmentId"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-subtle text-text-secondary"
                    >
                      {{ p.departmentName }} · {{ p.title }}
                    </span>
                    <span
                      v-if="m.positions.length === 0"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-warning-subtle text-warning"
                    >
                      待分配
                    </span>
                  </div>
                </div>
                <div v-if="canViewContact && m.status === 'active'" class="flex items-center gap-3 mt-0.5">
                  <p class="text-xs text-text-secondary">{{ m.email }}</p>
                  <p class="text-xs text-text-secondary">{{ m.phone }}</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="text-right">
                <p class="text-xs text-text-secondary">加入于 {{ formatDate(m.joinedAt) }}</p>
                <p v-if="m.exitedAt" class="text-xs text-text-secondary">退出于 {{ formatDate(m.exitedAt) }}</p>
              </div>
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
