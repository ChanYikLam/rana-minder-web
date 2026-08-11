<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import SyncIndicator from '@/components/common/SyncIndicator.vue'
import { FilterPanel, type FilterField, type FilterOption } from '@/components/display'
import { StatChart, type ChartSeries } from '@/components/display'
import { get } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import type { PageState } from '@/types/machine'
import {
  UserCircle, ChevronRight, UserPlus, ArrowRightLeft,
  LogOut, Users, Mail, RefreshCw, Building2, CalendarClock,
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
  termEndAt: string | null
  /** MEM-004：距 termEndAt 的剩余天数（仅进入提醒窗口的在任成员有值） */
  termDaysLeft: number | null
}
interface Stats {
  total: number
  active: number
  exited: number
  byDepartment: { id: string; name: string; count: number }[]
  zeroDepartment: number
}
interface PendingCounts {
  departmentApply: number
  appointments: number
  transition: number
}

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const members = ref<Member[]>([])
const stats = ref<Stats | null>(null)
const pendingCounts = ref<PendingCounts | null>(null)
const keyword = ref('')
const deptFilter = ref('all')
const titleFilter = ref('all')
const statusFilter = ref('all')
const page = ref(1)
const pageSize = 10

const canManage = computed(() => session.hasPermission('club:member:manage'))
const canViewContact = computed(() => canManage.value || session.hasPermission('club:audit:view'))

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: Member[]; stats: Stats; pendingCounts?: PendingCounts }>(`/org/${clubId}/members`)
  if (result.kind === 'completed') {
    members.value = (result as { kind: 'completed'; data: { items: Member[]; stats: Stats; pendingCounts?: PendingCounts } }).data.items
    stats.value = (result as { kind: 'completed'; data: { items: Member[]; stats: Stats; pendingCounts?: PendingCounts } }).data.stats
    pendingCounts.value = (result as { kind: 'completed'; data: { items: Member[]; stats: Stats; pendingCounts?: PendingCounts } }).data.pendingCounts ?? null
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

  if (titleFilter.value !== 'all') {
    result = result.filter((m) => m.positions.some((p) => p.title === titleFilter.value))
  }

  if (keyword.value.trim()) {
    const kw = keyword.value.trim()
    result = result.filter(
      (m) => m.name.includes(kw) || m.studentId.includes(kw),
    )
  }

  return result
})

const allTitles = computed(() => {
  const set = new Set<string>()
  members.value.forEach((m) => m.positions.forEach((p) => set.add(p.title)))
  return Array.from(set)
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))

const paged = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

watch([keyword, deptFilter, titleFilter, statusFilter], () => { page.value = 1 })

const statusOptions: FilterOption[] = [
  { value: 'active', label: '活跃' },
  { value: 'pending_casdoor_sync', label: '关系同步中' },
  { value: 'exiting', label: '退出中' },
  { value: 'exited', label: '已退出' },
  { value: 'sync_anomaly', label: '同步异常' },
]

const filterFields = computed<FilterField[]>(() => {
  const deptOptions: FilterOption[] = (stats.value?.byDepartment ?? []).map(d => ({ value: d.id, label: d.name }))
  if (stats.value && stats.value.zeroDepartment > 0) deptOptions.push({ value: 'zero', label: '待分配' })
  return [
    { key: 'department', label: '部门', options: deptOptions },
    { key: 'title', label: '职位', options: allTitles.value.map(t => ({ value: t, label: t })) },
    { key: 'status', label: '状态', options: statusOptions },
  ]
})

function onFilterChange(v: Record<string, string | string[]>) {
  const single = (key: string) => {
    const raw = v[key]
    return Array.isArray(raw) ? raw[0] ?? undefined : raw
  }
  keyword.value = typeof v.search === 'string' ? v.search : ''
  deptFilter.value = single('department') ?? 'all'
  titleFilter.value = single('title') ?? 'all'
  statusFilter.value = single('status') ?? 'all'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function termYear(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}-${d.getFullYear() + 1}`
}

onMounted(loadData)

const deptSeries = computed<ChartSeries[]>(() =>
  (stats.value?.byDepartment ?? []).map((d) => ({ label: d.name, value: d.count })),
)

// P2-46：口径与列表徽标一致——仅统计在任（active）且有任期到期提醒的成员，排除离职残留 termEndAt
const upcomingTermCount = computed(() => members.value.filter((m) => m.status === 'active' && m.termEndAt).length)
</script>

<template>
  <PageStateBoundary :state="state" :title="canManage ? '成员管理' : '组织成员'" :error="pageError" @retry="loadData">
    <template #loading>
      <div class="max-w-5xl mx-auto space-y-4" role="status" aria-live="polite">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="i in 4" :key="i" class="h-20 bg-muted rounded animate-pulse" />
        </div>
        <div class="h-10 bg-muted rounded animate-pulse" />
        <div class="space-y-2">
          <div v-for="i in 6" :key="i" class="h-14 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </template>
    <div class="max-w-5xl mx-auto">
      <!-- 标题 + 快捷操作 -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">{{ canManage ? '成员管理' : '组织成员' }}</h1>
          <p class="text-sm text-text-secondary mt-1">
            <template v-if="canManage">当前关系来自 Casdoor Group；本系统记录任期、异动与审批历史。</template>
            <template v-else>本社团成员与在任职位，仅供查看。</template>
          </p>
        </div>
        <div v-if="canManage" class="flex flex-wrap gap-2">
          <PermissionGuard permission="club:appointment:manage" scope="workspace">
            <button
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
              @click="router.push(`/org/${route.params.clubId}/members/appointments`)"
            >
              <UserPlus :size="15" /> 任命调岗
            </button>
          </PermissionGuard>
          <PermissionGuard permission="club:invite:manage" scope="workspace">
            <button
              class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
              @click="router.push(`/org/${route.params.clubId}/members/invite`)"
            >
              <Mail :size="15" /> 入社邀请
            </button>
          </PermissionGuard>
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
          <PermissionGuard permission="club:transition:manage" scope="workspace">
            <button
              class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"
              @click="router.push(`/org/${route.params.clubId}/members/transition`)"
            >
              <RefreshCw :size="15" /> 换届管理
            </button>
          </PermissionGuard>
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

      <!-- 待办驱动操作入口 -->
      <div v-if="pendingCounts" class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card v-if="workspace.hasPermission('club:member:manage')" class="!p-4 cursor-pointer transition-colors hover:border-primary" @click="router.push(`/org/${route.params.clubId}/members/department-apply`)">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">待审批成员申请</p>
              <p class="text-xs text-text-secondary mt-0.5">部门加入 / 调换 / 退出</p>
            </div>
            <span class="text-xl font-bold" :class="pendingCounts.departmentApply > 0 ? 'text-warning' : 'text-text-secondary'">{{ pendingCounts.departmentApply }}</span>
          </div>
          <button class="mt-3 w-full h-8 rounded-md border border-border text-xs text-primary hover:bg-primary-subtle" @click.stop="router.push(`/org/${route.params.clubId}/members/department-apply`)">去审批</button>
        </Card>
        <Card v-if="workspace.hasPermission('club:appointment:manage')" class="!p-4 cursor-pointer transition-colors hover:border-primary" @click="router.push(`/org/${route.params.clubId}/members/appointments`)">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">预约管理命令</p>
              <p class="text-xs text-text-secondary mt-0.5">待执行与失权待确认</p>
            </div>
            <span class="text-xl font-bold" :class="pendingCounts.appointments > 0 ? 'text-warning' : 'text-text-secondary'">{{ pendingCounts.appointments }}</span>
          </div>
          <button class="mt-3 w-full h-8 rounded-md border border-border text-xs text-primary hover:bg-primary-subtle" @click.stop="router.push(`/org/${route.params.clubId}/members/appointments`)">查看预约</button>
        </Card>
        <Card v-if="workspace.hasPermission('club:transition:manage')" class="!p-4 cursor-pointer transition-colors hover:border-primary" @click="router.push(`/org/${route.params.clubId}/members/transition`)">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">换届批次</p>
              <p class="text-xs text-text-secondary mt-0.5">已保存的新任与同期任命</p>
            </div>
            <span class="text-xl font-bold" :class="pendingCounts.transition > 0 ? 'text-warning' : 'text-text-secondary'">{{ pendingCounts.transition }}</span>
          </div>
          <button class="mt-3 w-full h-8 rounded-md border border-border text-xs text-primary hover:bg-primary-subtle" @click.stop="router.push(`/org/${route.params.clubId}/members/transition`)">打开换届预览</button>
        </Card>
      </div>

      <!-- 部门分布 -->
      <StatChart
        v-if="stats && deptSeries.length > 0"
        title="部门成员分布"
        unit="人"
        :series="deptSeries"
        class="mb-4"
      />
      <div
        v-if="stats && stats.zeroDepartment > 0"
        class="flex items-center gap-2 text-xs text-warning mb-4"
      >
        另有 {{ stats.zeroDepartment }} 名成员待分配部门
      </div>

      <!-- 任期提醒（MEM-004） -->
      <div
        v-if="upcomingTermCount > 0"
        class="flex items-center gap-2 text-xs text-warning mb-4"
        role="status"
      >
        <CalendarClock :size="14" /> {{ upcomingTermCount }} 名成员任期将到期，须在到期日交接或续任安排
      </div>

      <!-- 筛选工具栏 -->
      <FilterPanel
        class="mb-4"
        :fields="filterFields"
        searchable
        search-placeholder="搜索姓名或学号..."
        @change="onFilterChange"
      />

      <!-- 成员列表 -->
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-medium text-text-primary flex items-center gap-2">
          当前成员
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-subtle text-text-secondary">{{ filtered.length }} 人</span>
        </h2>
      </div>

      <EmptyState v-if="filtered.length === 0" type="no_data" title="未找到符合条件的成员" description="可调整筛选条件，或向候选人发送入社邀请" />

      <div v-else class="space-y-2">
        <Card
          v-for="m in paged"
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
                  <SyncIndicator v-if="m.status === 'pending_casdoor_sync'" status="syncing" label="关系同步中" />
                  <span v-if="m.status === 'active' && m.termEndAt" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-warning-subtle text-warning" title="任期将到期">
                    <CalendarClock :size="11" /> 任期 {{ m.termEndAt.slice(0, 10) }} 到期
                    <template v-if="m.termDaysLeft !== null && m.termDaysLeft >= 0">· 剩 {{ m.termDaysLeft }} 天</template>
                  </span>
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
                <p v-if="m.status === 'active' && m.positions.length > 0" class="text-xs text-primary">任期自 {{ termYear(m.joinedAt) }}</p>
                <p class="text-xs text-text-secondary">加入于 {{ formatDate(m.joinedAt) }}</p>
                <p v-if="m.exitedAt" class="text-xs text-text-secondary">退出于 {{ formatDate(m.exitedAt) }}</p>
              </div>
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>

        <!-- 分页器 -->
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-2">
          <button
            class="px-3 h-8 rounded-md border border-border text-xs text-text-secondary hover:bg-subtle disabled:opacity-40"
            :disabled="page <= 1"
            @click="page -= 1"
          >上一页</button>
          <span class="text-xs text-text-secondary">第 {{ page }} / {{ totalPages }} 页</span>
          <button
            class="px-3 h-8 rounded-md border border-border text-xs text-text-secondary hover:bg-subtle disabled:opacity-40"
            :disabled="page >= totalPages"
            @click="page += 1"
          >下一页</button>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
