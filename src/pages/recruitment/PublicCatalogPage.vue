<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Search, Users, Calendar, ChevronRight, Building2 } from '@lucide/vue'

interface Club { id: string; name: string; description: string; memberCount: number; logo: string | null }
interface Activity { id: string; clubId: string; clubName: string; title: string; type: string; status: string; deadline: string; description: string }

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const clubs = ref<Club[]>([])
const activities = ref<Activity[]>([])
const searchKeyword = ref('')

const activeTab = computed<'activities' | 'clubs'>(() => (route.meta.tab as 'activities' | 'clubs') || 'activities')

const filteredClubs = computed(() => {
  if (!searchKeyword.value) return clubs.value
  return clubs.value.filter((c) => c.name.includes(searchKeyword.value) || c.description.includes(searchKeyword.value))
})

const filteredActivities = computed(() => {
  if (!searchKeyword.value) return activities.value
  return activities.value.filter((a) => a.title.includes(searchKeyword.value) || a.clubName.includes(searchKeyword.value))
})

async function loadData() {
  state.value = 'loading'
  const [clubsRes, actRes] = await Promise.all([
    get<{ items: Club[] }>('/explore/clubs'),
    get<{ items: Activity[] }>('/explore/activities'),
  ])
  if (clubsRes.kind === 'completed' && actRes.kind === 'completed') {
    clubs.value = (clubsRes as { kind: 'completed'; data: { items: Club[] } }).data.items
    activities.value = (actRes as { kind: 'completed'; data: { items: Activity[] } }).data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function switchTab(tab: 'activities' | 'clubs') {
  router.push(tab === 'clubs' ? '/explore/clubs' : '/explore/activities')
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="招新公开目录" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-primary mb-6">发现社团与活动</h1>

      <!-- 搜索栏 -->
      <div class="mb-6">
        <div class="relative">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            v-model="searchKeyword"
            type="search"
            placeholder="搜索社团或活动名称..."
            class="w-full h-11 pl-10 pr-4 rounded-lg border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            aria-label="搜索"
          />
        </div>
      </div>

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
          v-if="filteredActivities.length === 0"
          type="no_result"
          title="未找到匹配的活动"
          :description="searchKeyword ? '尝试更换关键词' : '当前没有进行中的招新活动'"
        />
        <div v-else class="grid gap-4 md:grid-cols-2">
          <Card
            v-for="act in filteredActivities"
            :key="act.id"
            class="cursor-pointer"
            @click="router.push(`/activity/recruitment/${act.id}`)"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <h3 class="text-base font-medium text-text-primary">{{ act.title }}</h3>
                <p class="text-sm text-text-secondary mt-0.5">{{ act.clubName }}</p>
              </div>
              <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-success-subtle text-success">
                报名中
              </span>
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
