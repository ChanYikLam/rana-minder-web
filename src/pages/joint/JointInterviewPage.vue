<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Star, Calendar, MapPin, Users, AlertTriangle } from '@lucide/vue'

interface JointInterview { id: string; applicantName: string; status: string; scheduledTime: string; location: string; interviewers: { id: string; name: string }[] }

const route = useRoute()
const state = ref<PageState>('loading')
const interviews = ref<JointInterview[]>([])

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await get<{ items: JointInterview[] }>(`/org/${clubId}/joint/${jointId}/interviews`)
  if (result.kind === 'completed') {
    interviews.value = (result as { kind: 'completed'; data: { items: JointInterview[] } }).data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合面试" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-text-primary mb-2">联合面试排期与评价</h1>
      <p class="text-sm text-text-secondary mb-6">共享排期，一次面试，各参与社团独立评价</p>

      <div class="grid gap-3">
        <Card v-for="iv in interviews" :key="iv.id">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-base font-medium text-text-primary">{{ iv.applicantName }}</p>
              <div class="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                <span class="flex items-center gap-1"><Calendar :size="14" /> {{ formatTime(iv.scheduledTime) }}</span>
                <span class="flex items-center gap-1"><MapPin :size="14" /> {{ iv.location }}</span>
              </div>
              <div class="flex items-center gap-1 mt-1 text-sm text-text-secondary">
                <Users :size="14" /> 面试官：{{ iv.interviewers.map((i) => i.name).join('、') }}
              </div>
            </div>
            <StateTag :status="iv.status" />
          </div>

          <!-- JNT-012: 联合面试评价实时互见（与普通面试"首评前隔离"不同） -->
          <div v-if="iv.status === 'completed' || iv.status === 'in_progress'" class="border-t border-border pt-3 mt-2">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs text-text-secondary">跨社评价（实时互见）</p>
              <span class="text-xs text-info">各社团评价实时互相可见</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-lg bg-subtle p-3">
                <p class="text-xs text-text-secondary">计算机协会</p>
                <div class="flex items-center gap-1 mt-1">
                  <Star :size="14" class="text-warning fill-warning" />
                  <span class="text-sm text-text-primary">4 分</span>
                </div>
                <p class="text-xs text-text-secondary mt-0.5">表现优秀</p>
              </div>
              <div class="rounded-lg bg-subtle p-3">
                <p class="text-xs text-text-secondary">电子设计协会</p>
                <p class="text-sm text-text-secondary mt-1">待评价</p>
              </div>
            </div>
            <!-- JNT-012: 任何人都不能修改其他作者记录 -->
            <p class="text-xs text-text-secondary mt-2">注：只能修改本人提交的评语，活动结束后锁定</p>
          </div>

          <div v-else-if="iv.status === 'scheduled' || iv.status === 'confirmed'" class="border-t border-border pt-3 mt-2">
            <p class="text-xs text-text-secondary">面试待进行，完成后各社团将独立评价（实时互见）</p>
          </div>

          <!-- JNT-010: 面试作废待复核标志 -->
          <div v-if="iv.status === 'invalidated'" class="border-t border-border pt-3 mt-2">
            <div class="rounded-lg bg-warning-subtle p-2 flex items-center gap-2">
              <AlertTriangle :size="14" class="text-warning" />
              <p class="text-xs text-warning">面试作废待复核 — 邀请暂不可接受，等待补面后各社团独立复核</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
