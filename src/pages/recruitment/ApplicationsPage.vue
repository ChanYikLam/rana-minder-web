<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { ArrowLeft, User } from '@lucide/vue'

interface Application {
  id: string; activityId: string; applicantId: string
  applicantName: string; applicantStudentId: string
  status: string
  preferences: { order: number; departmentId: string; departmentName: string }[]
  submittedAt: string | null; withdrawnAt: string | null; formVersion: number
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const items = ref<Application[]>([])
const activeStatus = ref('all')

const statusTabs = [
  { value: 'all', label: '全部' },
  { value: 'submitted', label: '已提交' },
  { value: 'under_review', label: '审核中' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'draft', label: '草稿' },
]

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const activityId = route.params.activityId as string
  const query = activeStatus.value !== 'all' ? `?status=${activeStatus.value}` : ''
  const result = await get<{ items: Application[] }>(`/org/${clubId}/recruitment/${activityId}/applications${query}`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: Application[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function switchStatus(s: string) {
  if (s === activeStatus.value) return
  activeStatus.value = s
  loadData()
}

function formatTime(iso: string | null): string {
  if (!iso) return '未提交'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="报名申请管理" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">报名申请管理</h1>
      <p class="text-sm text-text-secondary mb-6">查看和处理本活动的所有报名申请</p>

      <!-- 状态筛选 -->
      <div class="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="申请状态筛选">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="px-3 h-8 rounded-md text-sm transition-colors"
          :class="activeStatus === tab.value ? 'bg-primary text-text-on-primary font-medium' : 'bg-subtle text-text-secondary hover:text-primary'"
          @click="switchStatus(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <EmptyState
        v-if="items.length === 0"
        type="no_data"
        title="暂无符合条件的申请"
        description="可以切换其他状态筛选查看"
      />

      <div v-else class="space-y-3">
        <Card v-for="app in items" :key="app.id" padding="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary shrink-0">
                <User :size="18" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-primary truncate">{{ app.applicantName }}</p>
                <p class="text-xs text-text-secondary">{{ app.applicantStudentId }} · 提交于 {{ formatTime(app.submittedAt) }}</p>
              </div>
            </div>
            <StateTag :status="app.status" />
          </div>
          <div v-if="app.preferences.length > 0" class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="pref in app.preferences"
              :key="pref.order"
              class="inline-flex items-center px-2 py-0.5 rounded bg-subtle text-xs text-text-secondary"
            >
              第{{ pref.order }}志愿 · {{ pref.departmentName }}
            </span>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
