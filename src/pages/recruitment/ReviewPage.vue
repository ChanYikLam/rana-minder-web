<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, DataTable } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { Star, Send, CheckCircle2, Lock, EyeOff } from '@lucide/vue'

interface ReviewItem {
  id: string; applicantId: string; applicantName: string
  departmentName: string; status: string; rating: number | null
  comment: string; concludedAt: string | null; concludedBy: string | null
  myRating: number | null; myComment: string | null
}

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const reviews = ref<ReviewItem[]>([])
const selectedId = ref<string | null>(null)
const rating = ref(0)
const comment = ref('')
const submitting = ref(false)

const selected = ref<ReviewItem | null>(null)

// REC-014: 首评前隔离 - 首次提交本人评价前，不得查看同轮其他面试官评价
const evaluationIsolated = computed(() => {
  if (!selected.value) return false
  return selected.value.myRating === null && selected.value.status === 'evaluating'
})

// REC-015: 申请人不可查看内部评分、评语或讨论
const isApplicant = computed(() => {
  return session.user?.id === selected.value?.applicantId
})

const columns = [
  { key: 'applicantName', label: '申请人' },
  { key: 'departmentName', label: '意向方向' },
  { key: 'status', label: '状态' },
  { key: 'rating', label: '评分' },
]

function routeScope(): { clubId: string; activityId: string } | null {
  const clubId = typeof route.params.clubId === 'string' ? route.params.clubId : null
  const activityId = typeof route.params.activityId === 'string' ? route.params.activityId : null
  return clubId && activityId ? { clubId, activityId } : null
}

async function loadReviews() {
  state.value = 'loading'
  const scope = routeScope()
  if (!scope) { state.value = 'error'; return }
  const result = await get<{ items: ReviewItem[] }>(`/org/${scope.clubId}/recruitment/${scope.activityId}/reviews`)
  if (result.kind === 'completed') {
    reviews.value = (result as { kind: 'completed'; data: { items: ReviewItem[] } }).data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function handleRowClick(row: unknown) {
  const item = row as ReviewItem
  selected.value = item
  selectedId.value = item.id
  rating.value = item.rating || 0
  comment.value = item.comment || ''
}

async function handleSubmitReview() {
  if (!selected.value || rating.value === 0) return
  submitting.value = true
  const scope = routeScope()
  if (!scope) { submitting.value = false; return }
  const result = await post(`/org/${scope.clubId}/recruitment/${scope.activityId}/reviews/${selected.value.id}/conclude`, {
    rating: rating.value,
    comment: comment.value,
  })
  submitting.value = false
  if (result.kind === 'completed') {
    selected.value!.status = 'concluded'
    selected.value!.rating = rating.value
    selected.value!.comment = comment.value
    selected.value!.concludedAt = new Date().toISOString()
  }
}

async function handlePublishAll() {
  submitting.value = true
  const scope = routeScope()
  if (!scope) { submitting.value = false; return }
  const result = await post(`/org/${scope.clubId}/recruitment/${scope.activityId}/reviews/publish`)
  submitting.value = false
  if (result.kind === 'completed') {
    reviews.value.forEach((r) => { if (r.status === 'concluded') r.status = 'published' })
  }
}

onMounted(loadReviews)
</script>

<template>
  <PageStateBoundary :state="state" title="评价与结论" @retry="loadReviews">
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">评价与结论</h1>
        <PermissionGuard permission="club:recruitment:manage">
          <button
            class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
            :disabled="submitting || !reviews.some((r) => r.status === 'concluded')"
            @click="handlePublishAll"
          >
            <Send :size="16" /> 统一发布结论
          </button>
        </PermissionGuard>
      </div>

      <div class="grid lg:grid-cols-[1fr_400px] gap-4">
        <!-- 左：列表 -->
        <DataTable
          :columns="columns"
          :rows="reviews"
          :loading="state === 'loading'"
          empty-title="暂无申请人"
          @row-click="handleRowClick"
        >
          <template #cell-status="{ row }">
            <StateTag :status="(row as ReviewItem).status" />
          </template>
          <template #cell-rating="{ row }">
            <span v-if="(row as ReviewItem).rating" class="flex items-center gap-1">
              <Star :size="14" class="text-warning fill-warning" /> {{ (row as ReviewItem).rating }}
            </span>
            <span v-else class="text-text-secondary">-</span>
          </template>
        </DataTable>

        <!-- 右：评价面板 -->
        <Card v-if="selected" class="h-fit">
          <div class="mb-4">
            <h2 class="text-base font-medium text-text-primary">{{ selected.applicantName }}</h2>
            <p class="text-sm text-text-secondary">意向：{{ selected.departmentName }}</p>
          </div>

          <!-- REC-015: 申请人不可查看内部评分、评语或讨论 -->
          <div v-if="isApplicant" class="rounded-lg bg-muted p-4 text-center">
            <EyeOff :size="24" class="mx-auto text-text-secondary mb-2" />
            <p class="text-sm text-text-secondary">内部评分和评语不对申请人公开</p>
          </div>

          <!-- 已有结论 -->
          <div v-else-if="selected.status === 'concluded' || selected.status === 'published'" class="space-y-3">
            <div>
              <p class="text-xs text-text-secondary mb-1">评分</p>
              <div class="flex gap-1">
                <Star v-for="i in 5" :key="i" :size="20" :class="i <= (selected.rating || 0) ? 'text-warning fill-warning' : 'text-muted'" />
              </div>
            </div>
            <div>
              <p class="text-xs text-text-secondary mb-1">评语</p>
              <p class="text-sm text-text-primary">{{ selected.comment || '无评语' }}</p>
            </div>
            <p v-if="selected.concludedBy" class="text-xs text-text-secondary">
              评价人：{{ selected.concludedBy }}
            </p>
          </div>

          <!-- REC-014: 首评前隔离 - 提示不可查看同轮他评 -->
          <div v-else-if="evaluationIsolated" class="space-y-4">
            <div class="rounded-lg bg-warning-subtle p-3 flex items-center gap-2">
              <Lock :size="16" class="text-warning" />
              <p class="text-xs text-warning">首次提交本人评价前，不可查看同轮其他面试官评价</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-2">评分</label>
              <div class="flex gap-1">
                <button
                  v-for="i in 5"
                  :key="i"
                  class="p-1"
                  :aria-label="`${i} 星`"
                  @click="rating = i"
                >
                  <Star :size="24" :class="i <= rating ? 'text-warning fill-warning' : 'text-muted'" />
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">评语</label>
              <textarea
                v-model="comment"
                rows="4"
                class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                placeholder="填写评价内容..."
              />
            </div>
            <PermissionGuard
              :permission="['club:interview:evaluate', 'club:recruitment:manage']"
              scope="workspace"
              fallback="disable"
              disable-reason="无面试评价权限"
            >
              <button
                class="w-full h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                :disabled="submitting || rating === 0"
                @click="handleSubmitReview"
              >
                <CheckCircle2 :size="16" /> {{ submitting ? '提交中...' : '提交评价' }}
              </button>
            </PermissionGuard>
          </div>
        </Card>

        <Card v-else class="h-fit flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">点击左侧申请人查看详情</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
