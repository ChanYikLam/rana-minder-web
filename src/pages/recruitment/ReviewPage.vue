<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, DataTable } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { Star, Send, CheckCircle2, Lock, EyeOff } from '@lucide/vue'

interface PeerReview {
  authorName: string; authorRole: string; comment: string
  version: number; createdAt: string; updatedAt: string
}

interface ReviewItem {
  id: string; applicantId: string; applicantName: string
  departmentName: string; status: string; rating: number | null
  comment: string; concludedAt: string | null; concludedBy: string | null
  myRating: number | null; myComment: string | null
  peerViewLocked: boolean
  reviews: PeerReview[]
}

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const reviews = ref<ReviewItem[]>([])
const selectedId = ref<string | null>(null)
const rating = ref(0)
const comment = ref('')
const submitting = ref(false)
const publishOpen = ref(false)
const publishSucceeded = ref(false)
const publishError = ref('')

const selected = ref<ReviewItem | null>(null)

// REC-014: 首评前隔离 - 首次提交本人评价前，不得查看同轮其他面试官评价（服务端强制）
const evaluationIsolated = computed(() => {
  return selected.value?.peerViewLocked ?? false
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
  rating.value = 0
  comment.value = ''
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
    await loadReviews()
  }
}

async function handlePublishAll() {
  submitting.value = true
  publishSucceeded.value = false
  publishError.value = ''
  const scope = routeScope()
  if (!scope) { submitting.value = false; return }
  const result = await post(`/org/${scope.clubId}/recruitment/${scope.activityId}/reviews/publish`)
  submitting.value = false
  if (result.kind === 'completed') {
    publishSucceeded.value = true
    reviews.value.forEach((r) => { if (r.status === 'concluded') r.status = 'published' })
  } else {
    publishError.value = (result as { error?: { message?: string } }).error?.message || '发布失败，请重试'
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
            :disabled="!reviews.some((r) => r.status === 'concluded')"
            @click="publishOpen = true"
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

          <!-- REC-014: 首评前隔离 - 未提交本人评价，不可查看同轮他评（服务端强制） -->
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
            <PermissionGuard permission="club:interview:evaluate" fallback="disable" disable-reason="无面试评价权限">
              <button
                class="w-full h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                :disabled="submitting || rating === 0"
                @click="handleSubmitReview"
              >
                <CheckCircle2 :size="16" /> {{ submitting ? '提交中...' : '提交评价' }}
              </button>
            </PermissionGuard>
          </div>

          <!-- 已提交本人评价：可见同轮全部评价（多作者），轮次关闭前可修改自己的 -->
          <div v-else class="space-y-4">
            <div>
              <p class="text-xs text-text-secondary mb-1">同轮评价（{{ selected.reviews.length }} 条）</p>
              <div class="space-y-2">
                <div
                  v-for="(r, idx) in selected.reviews"
                  :key="idx"
                  class="rounded-lg border border-border bg-elevated p-3"
                >
                  <div class="flex items-center justify-between mb-1">
                    <p class="text-sm font-medium text-text-primary">{{ r.authorName }}</p>
                    <p class="text-xs text-text-secondary">{{ r.authorRole }} · v{{ r.version }}</p>
                  </div>
                  <p class="text-sm text-text-primary">{{ r.comment || '无评语' }}</p>
                </div>
              </div>
            </div>

            <div v-if="selected.status !== 'published'" class="border-t border-border pt-3 space-y-3">
              <p class="text-xs text-text-secondary">提交或修改本人评价（轮次关闭前可修改，每次修改保留历史）</p>
              <div>
                <label class="block text-sm font-medium text-text-primary mb-2">我的评分</label>
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
                <label class="block text-sm font-medium text-text-primary mb-1">我的评语</label>
                <textarea
                  v-model="comment"
                  rows="3"
                  class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                  placeholder="填写评价内容..."
                />
              </div>
              <PermissionGuard permission="club:interview:evaluate" fallback="disable" disable-reason="无面试评价权限">
                <button
                  class="w-full h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  :disabled="submitting || rating === 0"
                  @click="handleSubmitReview"
                >
                  <CheckCircle2 :size="16" /> {{ submitting ? '提交中...' : '提交/更新评价' }}
                </button>
              </PermissionGuard>
            </div>
          </div>
        </Card>

        <Card v-else class="h-fit flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">点击左侧申请人查看详情</p>
        </Card>
      </div>
    </div>

    <HighRiskConfirm
      v-model:open="publishOpen"
      title="统一发布结论"
      description="将全部已评价结论一次性发布给申请人，发布后不可撤回。"
      :targets="reviews.filter((r) => r.status === 'concluded').map((r) => ({ id: r.id, label: r.applicantName, detail: `${r.departmentName} · ${r.rating ?? 0} 分` }))"
      impact-summary="申请人将收到录用/未录用结果通知；未完成评价的申请人不受影响。"
      confirm-label="确认发布"
      reauth-required
      :executing="submitting"
      :succeeded="publishSucceeded"
      :error-message="publishError"
      @confirm="handlePublishAll"
    />
  </PageStateBoundary>
</template>
