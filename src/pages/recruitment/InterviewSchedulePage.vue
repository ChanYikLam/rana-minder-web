<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Calendar, MapPin, User, CheckCircle2 } from '@lucide/vue'

interface InterviewSlot { id: string; time: string; location: string; capacity: number; booked: number }
interface InterviewDetail {
  id: string; activityId: string; activityTitle: string
  applicantName: string; status: string; attendance: string
  scheduledTime: string | null; location: string | null
  interviewers: { id: string; name: string }[]
  availableSlots: InterviewSlot[]
}

const route = useRoute()
const state = ref<PageState>('loading')
const detail = ref<InterviewDetail | null>(null)
const selectedSlotId = ref<string | null>(null)
const booking = ref(false)
const leaving = ref(false)

async function loadDetail() {
  state.value = 'loading'
  const id = route.params.interviewId as string
  const result = await get<InterviewDetail>(`/me/interviews/recruitment/${id}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const canReschedule = (s: string | null | undefined) => ['leave', 'late', 'absent', 'invalidated'].includes(s || '')

const panelTitle = computed(() => {
  if (!detail.value) return ''
  if (canReschedule(detail.value.status)) return '重新安排面试'
  if (detail.value.scheduledTime) return '换时（重新选择时段）'
  return '选择面试时段'
})

const panelHint = computed(() => {
  if (!detail.value) return ''
  if (canReschedule(detail.value.status)) return '您当前为请假/缺席状态，可重新选择时段以补面'
  if (detail.value.scheduledTime) return '换时将在确认后原子替换原时段，失败时原安排保持有效'
  return '请选择一个可用的面试时段，每时段容量有限'
})

const bookLabel = computed(() => {
  if (!detail.value) return '确认预约'
  if (canReschedule(detail.value.status)) return '确认重新安排'
  if (detail.value.scheduledTime) return '确认换时'
  return '确认预约'
})

async function handleBookSlot() {
  if (!selectedSlotId.value || !detail.value) return
  booking.value = true
  const result = await post(`/me/interviews/recruitment/${detail.value.id}/book`, { slotId: selectedSlotId.value })
  booking.value = false
  if (result.kind === 'completed') {
    toast.success('时段已预约')
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败，请稍后重试')
  }
}

async function handleLeave() {
  if (!detail.value || leaving.value) return
  leaving.value = true
  const result = await post(`/me/interviews/recruitment/${detail.value.id}/leave`)
  leaving.value = false
  if (result.kind === 'completed') {
    toast.success('已登记请假，可重新选择时段')
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '请假失败，请稍后重试')
  }
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="面试排期" @retry="loadDetail">
    <div v-if="detail" class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-1">面试排期</h1>
      <p class="text-sm text-text-secondary mb-6">{{ detail.activityTitle }}</p>

      <!-- 已安排的面试 -->
      <Card v-if="detail.scheduledTime" class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-medium text-text-primary">已安排的面试</h2>
          <div class="flex items-center gap-2">
            <StateTag :status="detail.status" />
            <StateTag v-if="detail.attendance !== 'none'" :status="detail.attendance" />
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2 text-text-primary">
            <Calendar :size="16" class="text-text-secondary" /> {{ formatTime(detail.scheduledTime) }}
          </div>
          <div class="flex items-center gap-2 text-text-primary">
            <MapPin :size="16" class="text-text-secondary" /> {{ detail.location }}
          </div>
          <div class="flex items-center gap-2 text-text-primary">
            <User :size="16" class="text-text-secondary" />
            面试官：{{ detail.interviewers.map((i) => i.name).join('、') }}
          </div>
        </div>
        <button
          v-if="detail.status === 'scheduled'"
          class="mt-3 w-full h-10 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
          :disabled="leaving || booking"
          @click="handleLeave"
        >
          {{ leaving ? '提交中...' : '申请请假（登记后可选新时段补面）' }}
        </button>
      </Card>

      <!-- 选时面板 -->
      <Card v-if="detail.status === 'scheduled' || canReschedule(detail.status) || !detail.scheduledTime">
        <h2 class="text-base font-medium text-text-primary mb-2">{{ panelTitle }}</h2>
        <p class="text-xs text-text-secondary mb-4">{{ panelHint }}</p>

        <div class="space-y-2">
          <button
            v-for="slot in detail.availableSlots"
            :key="slot.id"
            class="w-full flex items-center justify-between rounded-lg border p-3 transition-colors text-left"
            :class="selectedSlotId === slot.id ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong'"
            :disabled="slot.booked >= slot.capacity"
            @click="selectedSlotId = slot.id"
          >
            <div>
              <p class="text-sm font-medium text-text-primary">{{ formatTime(slot.time) }}</p>
              <p class="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                <MapPin :size="12" /> {{ slot.location }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="text-xs px-2 py-0.5 rounded"
                :class="slot.booked >= slot.capacity ? 'bg-muted text-text-secondary' : 'bg-success-subtle text-success'"
              >
                {{ slot.booked >= slot.capacity ? '已满' : `剩余 ${slot.capacity - slot.booked}` }}
              </span>
              <CheckCircle2 v-if="selectedSlotId === slot.id" :size="18" class="text-primary" />
            </div>
          </button>
        </div>

        <button
          v-if="selectedSlotId"
          class="w-full mt-4 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
          :disabled="booking"
          @click="handleBookSlot"
        >
          {{ booking ? '提交中...' : bookLabel }}
        </button>
      </Card>
    </div>
  </PageStateBoundary>
</template>
