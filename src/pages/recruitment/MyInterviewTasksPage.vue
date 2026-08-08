<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { ScheduleView, type ScheduleSlot } from '@/components/display'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Calendar, Clock, AlertTriangle, User } from '@lucide/vue'

interface InterviewTask {
  id: string
  type: string
  activityId: string
  activityTitle: string
  clubId: string
  clubName: string
  applicantId: string
  applicantName: string
  roundId: string
  roundName: string
  status: string
  startAt: string | null
  endAt: string | null
  attendance: string
  conflict: { conflict: boolean; detail?: string }
}

const state = ref<PageState>('loading')
const tasks = ref<InterviewTask[]>([])

const activities = computed(() => {
  const map = new Map<string, InterviewTask[]>()
  for (const t of tasks.value) {
    const key = t.activityId
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return [...map.entries()].map(([activityId, items]) => ({ activityId, title: items[0]?.activityTitle || activityId, clubName: items[0]?.clubName || '', items }))
})

const scheduleItems = computed<ScheduleSlot[]>(() =>
  tasks.value
    .filter((t) => t.startAt && t.endAt)
    .map((t) => ({
      id: t.id,
      title: `${t.applicantName} · ${t.roundName || '面试'}`,
      startAt: t.startAt!,
      endAt: t.endAt!,
      location: t.activityTitle,
      interviewer: '我',
      conflictWith: t.conflict.conflict ? t.conflict.detail : undefined,
    })),
)

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: InterviewTask[] }>('/me/interviews/tasks')
  if (result.kind === 'completed') {
    tasks.value = result.data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '未排期'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="我的面试任务" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">我的面试任务</h1>
      <p class="text-sm text-text-secondary mb-6">作为面试官参与的普通招新面试（冲突检测与申请人侧口径一致）</p>

      <Card class="mb-6">
        <p class="text-sm font-medium text-text-primary mb-3">时间轴</p>
        <ScheduleView v-if="scheduleItems.length > 0" :items="scheduleItems" mode="list" />
        <p v-else class="text-sm text-text-secondary py-4 text-center">暂无已排期任务</p>
      </Card>

      <EmptyState
        v-if="tasks.length === 0"
        type="no_data"
        title="暂无面试任务"
        description="被分配为面试官后，任务将出现在这里"
      />

      <div v-for="group in activities" :key="group.activityId" class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <Calendar :size="16" class="text-primary" />
          <p class="text-sm font-medium text-text-primary">{{ group.title }}</p>
          <span class="text-xs text-text-secondary">{{ group.clubName }}</span>
        </div>
        <div class="space-y-2">
          <Card v-for="t in group.items" :key="t.id">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center w-9 h-9 rounded-full bg-primary-subtle text-primary">
                  <User :size="16" />
                </div>
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ t.applicantName }}</p>
                  <p class="text-xs text-text-secondary flex items-center gap-1.5">
                    <Clock :size="12" /> {{ formatTime(t.startAt) }}{{ t.endAt ? ` ～ ${formatTime(t.endAt)}` : '' }} · {{ t.roundName || '待分配轮次' }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="t.conflict.conflict" class="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-danger-subtle text-danger">
                  <AlertTriangle :size="12" /> 时间冲突
                </span>
                <StateTag :status="t.status" />
                <router-link
                  :to="`/org/${t.clubId}/recruitment/${t.activityId}/review`"
                  class="inline-flex items-center gap-1 px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover transition-colors"
                >
                  去评价
                </router-link>
              </div>
            </div>
            <p v-if="t.conflict.conflict && t.conflict.detail" class="mt-2 text-xs text-danger">{{ t.conflict.detail }}</p>
          </Card>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
