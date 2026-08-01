<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Calendar, Mail, Phone, Building2, Clock } from '@lucide/vue'

interface MemberDetail {
  id: string; studentId: string; name: string; email: string; phone: string
  status: string; joinedAt: string; exitedAt: string | null
  positions: { id: string; departmentName: string; title: string; startDate: string; endDate: string | null; status: string }[]
  tenures: { id: string; departmentName: string; title: string; startDate: string; endDate: string | null; endReason: string | null }[]
}

const route = useRoute()
const state = ref<PageState>('loading')
const member = ref<MemberDetail | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const memberId = route.params.memberId as string
  const result = await get<MemberDetail>(`/org/${clubId}/members/${memberId}`)
  if (result.kind === 'completed') {
    member.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="成员经历" @retry="loadData">
    <div v-if="member" class="max-w-2xl mx-auto">
      <!-- 成员头部 -->
      <Card class="mb-4">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-text-on-primary text-lg font-medium">{{ member.name.charAt(0) }}</div>
            <div>
              <h1 class="text-xl font-bold text-text-primary">{{ member.name }}</h1>
              <p class="text-sm text-text-secondary">{{ member.studentId }}</p>
            </div>
          </div>
          <StateTag :status="member.status" />
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="flex items-center gap-2 text-text-secondary"><Mail :size="16" /> {{ member.email }}</div>
          <div class="flex items-center gap-2 text-text-secondary"><Phone :size="16" /> {{ member.phone }}</div>
          <div class="flex items-center gap-2 text-text-secondary"><Calendar :size="16" /> 加入于 {{ formatDate(member.joinedAt) }}</div>
          <div v-if="member.exitedAt" class="flex items-center gap-2 text-text-secondary"><Clock :size="16" /> 退出于 {{ formatDate(member.exitedAt) }}</div>
        </div>
      </Card>

      <!-- 当前职位 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">当前职位</h2>
        <div class="space-y-2">
          <div v-for="pos in member.positions.filter((p) => p.status === 'active')" :key="pos.id" class="flex items-center justify-between rounded-lg border border-border p-3">
            <div class="flex items-center gap-2">
              <Building2 :size="16" class="text-text-secondary" />
              <span class="text-sm text-text-primary">{{ pos.departmentName }} · {{ pos.title }}</span>
              <!-- MEM-012: 计划任期结束不触发自动卸任，在任者仍显示"在任" -->
              <span class="text-xs text-success">在任</span>
            </div>
            <span class="text-xs text-text-secondary">自 {{ formatDate(pos.startDate) }}</span>
          </div>
          <p v-if="member.positions.filter((p) => p.status === 'active').length === 0" class="text-sm text-text-secondary text-center py-2">无活跃职位</p>
        </div>
        <!-- MEM-014: 计划任期只用于内部提醒，不改变前台展示 -->
        <p class="text-xs text-text-secondary mt-2">注：计划任期结束时间仅用于换届规划提醒，不触发自动卸任</p>
      </Card>

      <!-- 任期历史 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-3">任期历史</h2>
        <div class="relative pl-4 border-l-2 border-border space-y-4">
          <div v-for="tenure in member.tenures" :key="tenure.id" class="relative">
            <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary" />
            <p class="text-sm font-medium text-text-primary">{{ tenure.departmentName }} · {{ tenure.title }}</p>
            <p class="text-xs text-text-secondary mt-0.5">
              {{ formatDate(tenure.startDate) }} - {{ tenure.endDate ? formatDate(tenure.endDate) : '至今' }}
            </p>
            <p v-if="tenure.endReason" class="text-xs text-text-secondary mt-0.5">原因：{{ tenure.endReason }}</p>
          </div>
        </div>
      </Card>
    </div>
  </PageStateBoundary>
</template>
