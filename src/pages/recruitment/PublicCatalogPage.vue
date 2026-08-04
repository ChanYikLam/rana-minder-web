<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import FilterPanel from '@/components/display/FilterPanel.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Users, Calendar, ChevronRight, Building2 } from '@lucide/vue'

interface Club { id: string; name: string; description: string; memberCount: number; logo: string | null }
type RecruitStatus = 'recruiting' | 'upcoming' | 'ended'
interface Activity {
  id: string; clubId: string; clubName: string; title: string; type: string; status: string
  recruitStatus: RecruitStatus; deadline: string; startAt: string; description: string; applicantCount: number
}

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const clubs = ref<Club[]>([])
const activities = ref<Activity[]>([])
const searchKeyword = ref('')
const statusFilter = ref<string[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

const activeTab = computed<'activities' | 'clubs'>(() => (route.meta.tab as 'activities' | 'clubs') || 'activities')

const filteredClubs = computed(() => {
  if (!searchKeyword.value) return clubs.value
  return clubs.value.filter((c) => c.name.includes(searchKeyword.value) || c.description.includes(searchKeyword.value))
})

const statusOptions = [
  { value: 'recruiting', label: '正在报名' },
  { value: 'upcoming', label: '即将开始' },
  { value: 'ended', label: '已结束' },
]

async function loadActivities() {
  const q = searchKeyword.value.trim()
  const res = await get<{ items: Activity[] }>('/explore/activities', {
    q: q.length >= 2 ? q : undefined,
    status: statusFilter.value.length === 1 ? statusFilter.value[0] : undefined,
  })
  if (res.kind === 'completed') activities.value = res.data.items
}

async function loadData() {
  state.value = 'loading'
  const clubsRes = await get<{ items: Club[] }>('/explore/clubs')
  if (clubsRes.kind === 'completed') {
    clubs.value = clubsRes.data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
    return
  }
  await loadActivities()
}

function onFilterChange(v: Record<string, string[] | string>) {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchKeyword.value = typeof v.search === 'string' ? v.search : ''
    statusFilter.value = Array.isArray(v.recruitStatus) ? (v.recruitStatus as string[]) : []
    if (activeTab.value === 'activities') {
      state.value = 'loading'
      loadActivities().then(() => { state.value = 'normal' })
    }
  }, 350)
}

function switchTab(tab: 'activities' | 'clubs') {
  router.push(tab === 'clubs' ? '/explore/clubs' : '/explore/activities')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const recruitStatusLabel: Record<RecruitStatus, { text: string; cls: string }> = {
  recruiting: { text: '报名中', cls: 'bg-success-subtle text-success' },
  upcoming: { text: '即将开始', cls: 'bg-primary-subtle text-primary' },
  ended: { text: '已结束', cls: 'bg-subtle text-text-secondary' },
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="招新公开目录" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-primary mb-6">发现社团与活动</h1>

      <!-- 搜索与筛选（US-REC-08：服务端分层搜索 + 状态范围筛选） -->
      <FilterPanel
        class="mb-6"
        :fields="[{ key: 'recruitStatus', label: '报名状态', options: statusOptions, multiple: true }]"
        searchable
        search-placeholder="搜索活动或社团名称（2 个字符起，支持近似匹配）..."
        @change="onFilterChange"
      />

      <!-- Tab 切换 -->
      <div class="flex gap-1 border-b border-border mb-6">
        <button
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'activities' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-primary'"
          @click="switchTab('activities')"
        >
          <Calendar :size="16" class="inline mr-1.5" />
          招新活动
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'clubs' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-primary'"
          @click="switchTab('clubs')"
        >
          <Building2 :size="16" class="inline mr-1.5" />
          社团列表
        </button>
      </div>

      <!-- 活动列表 -->
      <div v-if="activeTab === 'activities'">
        <EmptyState
          v-if="activities.length === 0"
          type="no_result"
          title="未找到匹配的活动"
          :description="searchKeyword || statusFilter.length ? '尝试更换关键词或清除筛选' : '当前没有进行中的招新活动'"
        />
        <div v-else class="grid gap-4 md:grid-cols-2">
          <Card
            v-for="act in activities"
            :key="act.id"
            class="cursor-pointer"
            @click="router.push(`/activity/recruitment/${act.id}`)"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <h3 class="text-base font-medium text-text-primary">{{ act.title }}</h3>
                <p class="text-sm text-text-secondary mt-0.5">{{ act.clubName }}</p>
              </div>
              <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded whitespace-nowrap" :class="recruitStatusLabel[act.recruitStatus].cls">
                {{ recruitStatusLabel[act.recruitStatus].text }}
              </span>
            </div>
            <p class="text-sm text-text-secondary line-clamp-2 mb-3">{{ act.description }}</p>
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1 text-warning">
                  <Calendar :size="12" /> 截止 {{ formatDate(act.deadline) }}
                </span>
                <span class="flex items-center gap-1 text-text-secondary">
                  <Users :size="12" /> {{ act.applicantCount }} 人已报名
                </span>
              </div>
              <span class="flex items-center gap-0.5 text-text-secondary">
                查看详情 <ChevronRight :size="14" />
              </span>
            </div>
          </Card>
        </div>
      </div>

      <!-- 社团列表 -->
      <div v-else>
        <EmptyState
          v-if="filteredClubs.length === 0"
          type="no_result"
          title="未找到匹配的社团"
          :description="searchKeyword ? '尝试更换关键词' : '暂无社团'"
        />
        <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card v-for="club in filteredClubs" :key="club.id">
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
      </div>
    </div>
  </PageStateBoundary>
</template>
