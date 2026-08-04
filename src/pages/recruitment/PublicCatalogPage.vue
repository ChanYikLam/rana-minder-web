<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Search, Users, Calendar, ChevronRight, Building2, Sparkles, Tag, History } from '@lucide/vue'

interface Club { id: string; name: string; description: string; memberCount: number; logo: string | null; layer: SearchLayer }
interface Activity {
  id: string; clubId: string; clubName: string; title: string
  type: 'recruitment' | 'joint'; status: string
  enrolling: boolean; deadline: string; description: string; layer: SearchLayer
}
type SearchLayer = 'exact' | 'substring' | 'fuzzy'

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const clubs = ref<Club[]>([])
const activities = ref<Activity[]>([])
const historyActivities = ref<Activity[]>([])
const searchKeyword = ref('')


// 活动模式筛选（REC-047）
const typeFilter = ref<'all' | 'recruitment' | 'joint'>('all')
const statusFilter = ref<'all' | 'enrolling'>('all')
const deadlineRange = ref<'all' | 'today' | '3d' | '7d' | 'custom'>('all')
const customFrom = ref('')
const customTo = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null

const activeTab = computed<'activities' | 'clubs'>(() => (route.meta.tab as 'activities' | 'clubs') || 'activities')

const directMatches = computed(() => activities.value.filter((a) => a.layer === 'exact' || a.layer === 'substring'))
const fuzzyMatches = computed(() => activities.value.filter((a) => a.layer === 'fuzzy'))

const directClubs = computed(() => clubs.value.filter((c) => c.layer === 'exact' || c.layer === 'substring'))
const fuzzyClubs = computed(() => clubs.value.filter((c) => c.layer === 'fuzzy'))

function buildActivityParams(withClubs: boolean): string {
  const params = new URLSearchParams()
  if (searchKeyword.value.trim()) params.set('q', searchKeyword.value.trim())
  if (withClubs && !params.has('q')) params.set('q', searchKeyword.value.trim())
  if (!withClubs) {
    if (typeFilter.value !== 'all') params.set('type', typeFilter.value)
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
    if (deadlineRange.value !== 'all') params.set('range', deadlineRange.value)
    if (deadlineRange.value === 'custom') {
      if (customFrom.value) params.set('deadlineFrom', new Date(customFrom.value).toISOString())
      if (customTo.value) params.set('deadlineTo', new Date(customTo.value).toISOString())
    }
  }
  return params.toString()
}

async function loadData() {
  state.value = 'loading'
  const [clubsRes, actRes] = await Promise.all([
    get<{ items: Club[] }>(`/explore/clubs?${buildActivityParams(true)}`),
    get<{ items: Activity[]; history: Activity[] }>(`/explore/activities?${buildActivityParams(false)}`),
  ])
  if (clubsRes.kind === 'completed' && actRes.kind === 'completed') {
    clubs.value = (clubsRes as { kind: 'completed'; data: { items: Club[] } }).data.items
    activities.value = (actRes as { kind: 'completed'; data: { items: Activity[] } }).data.items
    historyActivities.value = (actRes as { kind: 'completed'; data: { history: Activity[] } }).data.history
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void loadData() }, 300)
}

function switchTab(tab: 'activities' | 'clubs') {
  router.push(tab === 'clubs' ? '/explore/clubs' : '/explore/activities')
}

function onFilterChange() {
  void loadData()
}

function openActivity(a: Activity) {
  router.push(a.type === 'joint' ? `/activity/joint/${a.id}` : `/activity/recruitment/${a.id}`)
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function typeLabel(t: 'recruitment' | 'joint'): string {
  return t === 'joint' ? '联合活动' : '普通招新'
}

// 筛选变化即重新查询（截止/状态/类型都是服务端语义）；搜索 300ms 防抖
watch([typeFilter, statusFilter, deadlineRange, customFrom, customTo], onFilterChange)

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="招新公开目录" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-primary mb-6">发现社团与活动</h1>

      <!-- 搜索栏（REC-047 同一时刻只使用一种名称搜索，不组合社团+活动名称） -->
      <div class="mb-4">
        <div class="relative">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            v-model="searchKeyword"
            type="search"
            :placeholder="activeTab === 'clubs' ? '按社团展示名称搜索...' : '按活动名称搜索...'"
            class="w-full h-11 pl-10 pr-4 rounded-lg border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            aria-label="搜索"
            @input="scheduleSearch"
          />
        </div>
        <p class="text-xs text-text-secondary mt-1.5">
          支持精确、连续子串及受控近似匹配；不足 3 个有效字符仅做精确与子串匹配。
        </p>
      </div>

      <!-- Tab 切换 -->
      <div class="flex gap-1 border-b border-border mb-4">
        <button
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'activities' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-primary'"
          @click="switchTab('activities')"
        >
          <Calendar :size="16" class="inline mr-1.5" />
          找活动
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'clubs' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-primary'"
          @click="switchTab('clubs')"
        >
          <Building2 :size="16" class="inline mr-1.5" />
          找社团
        </button>
      </div>

      <!-- 活动模式筛选（REC-047：类型 + 报名状态 + 截止时间） -->
      <div v-if="activeTab === 'activities'" class="flex flex-wrap items-center gap-2 mb-5">
        <select
          v-model="typeFilter"
          class="px-2.5 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          aria-label="活动类型"
        >
          <option value="all">全部类型</option>
          <option value="recruitment">普通招新</option>
          <option value="joint">联合活动</option>
        </select>
        <select
          v-model="statusFilter"
          class="px-2.5 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          aria-label="报名状态"
        >
          <option value="all">全部状态</option>
          <option value="enrolling">正在报名</option>
        </select>
        <select
          v-model="deadlineRange"
          class="px-2.5 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          aria-label="报名截止时间"
        >
          <option value="all">全部截止时间</option>
          <option value="today">今日截止</option>
          <option value="3d">3 日内截止</option>
          <option value="7d">7 日内截止</option>
          <option value="custom">自定义起止日期</option>
        </select>
        <template v-if="deadlineRange === 'custom'">
          <input v-model="customFrom" type="date" class="px-2.5 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" aria-label="起始日期" />
          <span class="text-xs text-text-secondary">至</span>
          <input v-model="customTo" type="date" class="px-2.5 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" aria-label="结束日期" />
        </template>
      </div>

      <!-- 活动列表（进行中） -->
      <template v-if="activeTab === 'activities'">
        <EmptyState
          v-if="directMatches.length === 0 && fuzzyMatches.length === 0"
          type="no_result"
          title="未找到匹配的活动"
          :description="searchKeyword ? '尝试更换关键词或调整筛选条件' : '当前没有进行中的招新活动'"
        />
        <template v-else>
          <p v-if="searchKeyword" class="text-xs text-text-secondary mb-2 flex items-center gap-1">
            <Tag :size="12" /> 直接命中（精确 / 子串）{{ directMatches.length }} 项
          </p>
          <div v-if="directMatches.length" class="grid gap-4 md:grid-cols-2 mb-2">
            <Card
              v-for="act in directMatches"
              :key="act.id"
              class="cursor-pointer"
              @click="openActivity(act)"
            >
              <div class="flex items-start justify-between mb-2">
                <div>
                  <h3 class="text-base font-medium text-text-primary">{{ act.title }}</h3>
                  <p class="text-sm text-text-secondary mt-0.5">{{ act.clubName }} · {{ typeLabel(act.type) }}</p>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <span
                    v-if="act.enrolling"
                    class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-success-subtle text-success"
                  >
                    正在报名
                  </span>
                  <span v-else-if="act.status === 'paused'" class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-warning-subtle text-warning">已暂停</span>
                  <span v-else class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-muted text-text-secondary">报名通道关闭</span>
                </div>
              </div>
              <p class="text-sm text-text-secondary line-clamp-2 mb-3">{{ act.description }}</p>
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1 text-warning">
                  <Calendar :size="12" /> 截止 {{ formatDeadline(act.deadline) }}
                </span>
                <span class="flex items-center gap-0.5 text-text-secondary">
                  查看详情 <ChevronRight :size="14" />
                </span>
              </div>
            </Card>
          </div>

          <template v-if="fuzzyMatches.length">
            <p class="text-xs text-text-secondary mt-3 mb-2 flex items-center gap-1">
              <Sparkles :size="12" /> 近似匹配（受控候选）{{ fuzzyMatches.length }} 项
            </p>
            <div class="grid gap-4 md:grid-cols-2">
              <Card
                v-for="act in fuzzyMatches"
                :key="act.id"
                class="cursor-pointer border-dashed"
                @click="openActivity(act)"
              >
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <h3 class="text-base font-medium text-text-primary">{{ act.title }}</h3>
                    <p class="text-sm text-text-secondary mt-0.5">{{ act.clubName }} · {{ typeLabel(act.type) }}</p>
                  </div>
                  <span v-if="act.enrolling" class="text-xs px-2 py-0.5 rounded bg-success-subtle text-success">正在报名</span>
                  <span v-else class="text-xs px-2 py-0.5 rounded bg-muted text-text-secondary">通道关闭</span>
                </div>
                <p class="text-sm text-text-secondary line-clamp-2 mb-3">{{ act.description }}</p>
                <div class="flex items-center justify-between text-xs">
                  <span class="flex items-center gap-1 text-warning">
                    <Calendar :size="12" /> 截止 {{ formatDeadline(act.deadline) }}
                  </span>
                  <span class="flex items-center gap-0.5 text-text-secondary">
                    查看详情 <ChevronRight :size="14" />
                  </span>
                </div>
              </Card>
            </div>
          </template>
        </template>

        <!-- REC-047 历史活动分区：只保留允许公开的信息，不提供报名入口 -->
        <div v-if="historyActivities.length" class="mt-8 border-t border-border pt-5">
          <h2 class="text-base font-medium text-text-primary mb-1 flex items-center gap-2">
            <History :size="16" class="text-text-secondary" /> 历史活动
          </h2>
          <p class="text-xs text-text-secondary mb-3">仅保留允许公开的信息，不提供报名入口</p>
          <div class="grid gap-4 md:grid-cols-2">
            <Card
              v-for="act in historyActivities"
              :key="act.id"
              class="cursor-pointer opacity-80 hover:opacity-100"
              @click="openActivity(act)"
            >
              <div class="flex items-start justify-between mb-2">
                <div>
                  <h3 class="text-base font-medium text-text-primary">{{ act.title }}</h3>
                  <p class="text-sm text-text-secondary mt-0.5">{{ act.clubName }} · {{ typeLabel(act.type) }}</p>
                </div>
                <span class="text-xs px-2 py-0.5 rounded bg-muted text-text-secondary">已结束</span>
              </div>
              <p class="text-sm text-text-secondary line-clamp-2 mb-3">{{ act.description }}</p>
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1 text-text-secondary">
                  <Calendar :size="12" /> 截止 {{ formatDeadline(act.deadline) }}
                </span>
                <span class="flex items-center gap-0.5 text-text-secondary">
                  查看详情 <ChevronRight :size="14" />
                </span>
              </div>
            </Card>
          </div>
        </div>
      </template>

      <!-- 社团列表（找社团模式） -->
      <template v-else>
        <EmptyState
          v-if="directClubs.length === 0 && fuzzyClubs.length === 0"
          type="no_result"
          title="未找到匹配的社团"
          :description="searchKeyword ? '尝试更换关键词' : '暂无社团'"
        />
        <template v-else>
          <template v-if="directClubs.length">
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card v-for="club in directClubs" :key="club.id">
                <div class="flex items-start gap-3">
                  <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-subtle text-primary font-medium shrink-0">
                    {{ club.name.charAt(0) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-base font-medium text-text-primary">{{ club.name }}</h3>
                    <p class="text-sm text-text-secondary mt-0.5 line-clamp-2">{{ club.description }}</p>
                    <p class="text-xs text-text-secondary mt-2 flex items-center gap-1">
                      <Users :size="12" /> {{ club.memberCount }} 名成员
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </template>
          <template v-if="fuzzyClubs.length">
            <p class="text-xs text-text-secondary mt-3 mb-2 flex items-center gap-1">
              <Sparkles :size="12" /> 近似匹配（受控候选）{{ fuzzyClubs.length }} 项
            </p>
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card v-for="club in fuzzyClubs" :key="club.id" class="border-dashed">
                <div class="flex items-start gap-3">
                  <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-subtle text-primary font-medium shrink-0">
                    {{ club.name.charAt(0) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-base font-medium text-text-primary">{{ club.name }}</h3>
                    <p class="text-sm text-text-secondary mt-0.5 line-clamp-2">{{ club.description }}</p>
                    <p class="text-xs text-text-secondary mt-2 flex items-center gap-1">
                      <Users :size="12" /> {{ club.memberCount }} 名成员
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </template>
        </template>
      </template>
    </div>
  </PageStateBoundary>
</template>