<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, DataTable } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import type { FormField, FileMeta } from '@/types/domain/form'
import { restoredFileMeta } from '@/lib/formFile'
import { Star, Send, CheckCircle2, Lock, EyeOff, FileText } from '@lucide/vue'

interface PeerReview {
  id: string; authorName: string; authorRole: string; comment: string
  version: number; createdAt: string; updatedAt: string
}

interface ReviewItem {
  id: string; applicantId: string; applicantName: string
  departmentName: string; status: string; rating: number | null
  roundName: string; interviewAt: string | null
  comment: string; concludedAt: string | null; concludedBy: string | null
  reviewId: string | null
  myRating: number | null; myComment: string | null
  myReviewVersion: number | null
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

// 申请表单答案（面试官视角）：选中申请人后加载申请详情接口的 answers，文件字段渲染为可点击链接
interface ApplicationDetail {
  answers?: Record<string, unknown>
  preferences?: { departmentId: string; departmentName: string }[]
  submittedAt?: string | null
}
const application = ref<ApplicationDetail | null>(null)
const formFields = ref<FormField[]>([])
const applicationLoading = ref(false)

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
  { key: 'roundName', label: '轮次' },
  { key: 'interviewAt', label: '面试时间' },
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
    // Issue-4.0-1: 支持从任务页带 ?applicantId= 锚定进入，自动选中对应申请人
    const anchor = typeof route.query.applicantId === 'string' ? route.query.applicantId : null
    if (anchor) {
      const target = reviews.value.find((r) => r.applicantId === anchor)
      if (target) handleRowClick(target)
    }
  } else {
    state.value = 'error'
  }
}

/** 加载活动报名表单定义（用于渲染 answers 的字段标签） */
async function loadFormSchema() {
  const scope = routeScope()
  if (!scope) return
  try {
    const actRes = await get<{ formId?: string }>(`/org/${scope.clubId}/recruitment/${scope.activityId}`)
    if (actRes.kind !== 'completed' || !actRes.data.formId) return
    const formRes = await get<{ versions: { fields: FormField[] }[] }>(`/org/${scope.clubId}/forms/${actRes.data.formId}`)
    if (formRes.kind === 'completed') {
      formFields.value = formRes.data.versions?.[0]?.fields || []
    }
  } catch {
    // 表单定义加载失败不影响评价流程
  }
}

/** 选中申请人：加载申请详情（表单答案 + 附件 fileId） */
async function loadApplicationDetail(item: ReviewItem) {
  const scope = routeScope()
  if (!scope) return
  applicationLoading.value = true
  application.value = null
  try {
    const result = await get<ApplicationDetail>(`/org/${scope.clubId}/recruitment/${scope.activityId}/applications/${item.applicantId}`)
    if (result.kind === 'completed') {
      application.value = result.data
    }
  } catch {
    // 申请详情加载失败不影响评价流程
  } finally {
    applicationLoading.value = false
  }
}

function handleRowClick(row: unknown) {
  const item = row as ReviewItem
  selected.value = item
  selectedId.value = item.id
  // 预填本人已有评分/评语（Issue-4.0-1：锚定/重选时保留上次提交内容）
  rating.value = item.myRating ?? 0
  comment.value = item.myComment ?? ''
  void loadApplicationDetail(item)
}

/** 渲染非文件表单答案 */
function renderAnswerValue(v: unknown): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.map(renderAnswerValue).filter(Boolean).join('、')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 取文件字段的 FileMeta 列表（兼容 fileId 字符串 / FileMeta[] 两种历史形态） */
function answerFiles(value: unknown): FileMeta[] {
  return restoredFileMeta(value)
}

/** 文件字段是否非空 */
function hasAnswerFiles(fieldId: string): boolean {
  const v = application.value?.answers?.[fieldId]
  return answerFiles(v).length > 0
}

/** 非文件字段答案文案 */
function answerText(fieldId: string): string {
  const v = application.value?.answers?.[fieldId]
  if (v == null || v === '') return ''
  const field = formFields.value.find((f) => f.id === fieldId)
  if (field?.type === 'file' || field?.type === 'image') return ''
  return renderAnswerValue(v)
}

/** 是否存在任一可见表单答案（文件字段以附件非空为准） */
const hasApplicationAnswers = computed(() => {
  if (!application.value?.answers) return false
  for (const field of formFields.value) {
    const v = application.value.answers[field.id]
    if (field.type === 'file' || field.type === 'image') {
      if (answerFiles(v).length > 0) return true
    } else if (v != null && v !== '') {
      return true
    }
  }
  return (application.value.preferences?.length ?? 0) > 0 || !!application.value.submittedAt
})

function formatDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleSubmitReview() {
  if (!selected.value || rating.value === 0) return
  submitting.value = true
  const scope = routeScope()
  if (!scope) { submitting.value = false; return }
  // 契约：conclude 按 applicantId 定位申请人（行 id 为 app-xxx，不能作为评价标识）
  const result = await post(`/org/${scope.clubId}/recruitment/${scope.activityId}/reviews/${selected.value.applicantId}/conclude`, {
    rating: rating.value,
    comment: comment.value,
  }, { expectedVersion: selected.value.myReviewVersion ?? undefined })
  submitting.value = false
  if (result.kind === 'completed') {
    toast.success('评价已提交')
    await loadReviews()
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('评价已受理，正在后台处理')
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('该评价已在其他窗口被修改，已刷新最新内容，请重新提交')
    await loadReviews()
  } else {
    const message = (result as { error?: { message?: string } }).error?.message || '提交失败，请重试'
    toast.error(message)
  }
}

/** 首次提交（隔离态）为「提交评价」，已有本人评价为「更新评价」 */
const submitLabel = computed(() => (selected.value?.peerViewLocked || selected.value?.myRating == null ? '提交评价' : '更新评价'))

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
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('发布已受理，正在后台处理')
  } else {
    publishError.value = (result as { error?: { message?: string } }).error?.message || '发布失败，请重试'
  }
}

onMounted(() => {
  void loadReviews()
  void loadFormSchema()
})
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
          <template #cell-roundName="{ row }">
            <span class="text-sm text-text-secondary">{{ (row as ReviewItem).roundName || '-' }}</span>
          </template>
          <template #cell-interviewAt="{ row }">
            <span class="text-sm text-text-secondary">{{ formatDateTime((row as ReviewItem).interviewAt) || '-' }}</span>
          </template>
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

          <!-- 申请表单答案与附件（面试官视角；REC 附件查看修复） -->
          <div v-if="applicationLoading" class="mb-4 rounded-lg bg-muted p-3">
            <p class="text-sm text-text-secondary">加载报名信息中...</p>
          </div>
          <div v-else-if="application && hasApplicationAnswers" class="mb-4 rounded-lg border border-border bg-elevated p-3 space-y-2.5">
            <p class="text-sm font-medium text-text-primary">报名信息</p>
            <div v-for="field in formFields" :key="field.id">
              <template v-if="field.type === 'file' || field.type === 'image'">
                <p v-if="hasAnswerFiles(field.id)" class="text-xs text-text-secondary">{{ field.label }}</p>
                <div v-if="hasAnswerFiles(field.id)" class="mt-1 space-y-1">
                  <router-link
                    v-for="(f, idx) in answerFiles(application.answers?.[field.id])"
                    :key="`${field.id}-${idx}`"
                    :to="`/files/${f.id}`"
                    class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <FileText :size="14" /> {{ f.name || f.id }}
                  </router-link>
                </div>
              </template>
              <template v-else-if="answerText(field.id)">
                <p class="text-xs text-text-secondary">{{ field.label }}</p>
                <p class="text-sm text-text-primary whitespace-pre-wrap">{{ answerText(field.id) }}</p>
              </template>
            </div>
            <div v-if="application.preferences?.length">
              <p class="text-xs text-text-secondary">意向方向（按优先级）</p>
              <p class="text-sm text-text-primary">{{ application.preferences.map((p, i) => `${i + 1}. ${p.departmentName}`).join('、') }}</p>
            </div>
            <div v-if="application.submittedAt">
              <p class="text-xs text-text-secondary">提交时间</p>
              <p class="text-sm text-text-primary">{{ formatDateTime(application.submittedAt) }}</p>
            </div>
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
                <CheckCircle2 :size="16" /> {{ submitting ? '提交中...' : submitLabel }}
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
                  <CheckCircle2 :size="16" /> {{ submitting ? '提交中...' : submitLabel }}
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
