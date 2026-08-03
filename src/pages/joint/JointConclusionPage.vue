<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Star, Send, Building2, CheckCircle2, ThumbsUp, ThumbsDown, RefreshCw, XCircle } from '@lucide/vue'

interface Conclusion {
  id: string; applicantId?: string; applicantName: string; clubName: string; status: string
  conclusion: 'admit' | 'not_admit' | null; reviewFlag: boolean
  rating: number | null; comment: string; concludedAt: string | null
  myClub: boolean
}
interface JointInvitation {
  id: string; applicantId: string; applicantName: string; clubId: string
  status: string; sentAt: string; expiredAt: string
}

const route = useRoute()
const state = ref<PageState>('loading')
const conclusions = ref<Conclusion[]>([])
const invitations = ref<JointInvitation[]>([])
const selected = ref<Conclusion | null>(null)
const rating = ref(0)
const comment = ref('')
const evaluating = ref(false)
const invitingName = ref<string | null>(null)
const actionError = ref('')

const clubId = computed(() => (route.params.clubId as string) || '')
const jointId = computed(() => (route.params.jointId as string) || '')

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: Conclusion[] }>(`/org/${clubId.value}/joint/${jointId.value}/conclusions`)
  if (result.kind === 'completed') {
    conclusions.value = result.data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function loadInvitations() {
  const result = await get<{ items: JointInvitation[] }>(`/org/${clubId.value}/joint/${jointId.value}/invitations`)
  if (result.kind === 'completed') {
    invitations.value = result.data.items.filter((i) => i.clubId === clubId.value)
  }
}

function openEvaluate(c: Conclusion) {
  selected.value = c
  rating.value = 0
  comment.value = ''
}

async function handleEvaluate() {
  if (!selected.value || rating.value === 0) return
  evaluating.value = true
  actionError.value = ''
  const result = await post(`/org/${clubId.value}/joint/${jointId.value}/conclusions/${selected.value.id}/evaluate`, {
    rating: rating.value,
    comment: comment.value,
  })
  evaluating.value = false
  if (result.kind === 'completed') {
    const item = conclusions.value.find((c) => c.id === selected.value!.id)
    if (item) {
      item.status = 'concluded'
      item.rating = rating.value
      item.comment = comment.value
      item.concludedAt = new Date().toISOString()
    }
    selected.value = null
    rating.value = 0
    comment.value = ''
    toast.success('评价已提交')
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '评价提交失败'
  }
}

async function handleInvite(c: Conclusion) {
  invitingName.value = c.applicantName
  actionError.value = ''
  const result = await post(`/org/${clubId.value}/joint/${jointId.value}/invitations`, {
    applicantId: c.applicantId || '',
  })
  invitingName.value = null
  if (result.kind === 'completed') {
    toast.success(`邀请已发送至 ${c.applicantName}`)
    await loadInvitations()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '邀请发送失败'
  }
}

async function handleSetConclusion(c: Conclusion, conclusion: 'admit' | 'not_admit') {
  if (!c.applicantId) return
  actionError.value = ''
  const result = await post(`/org/${clubId.value}/joint/${jointId.value}/conclusions/${c.applicantId}/set`, { conclusion })
  if (result.kind === 'completed') {
    toast.success(`已设定结论：${conclusion === 'admit' ? '录用' : '不录用'}`)
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '设定结论失败'
  }
}

const reviewingId = ref<string | null>(null)

async function handleReview(c: Conclusion, action: 'keep' | 'modify', newConclusion?: 'admit' | 'not_admit') {
  if (!c.applicantId) return
  actionError.value = ''
  const result = await post(`/org/${clubId.value}/joint/${jointId.value}/conclusions/${c.applicantId}/review`, {
    action,
    newConclusion,
  })
  if (result.kind === 'completed') {
    toast.success(action === 'keep' ? '结论已保持' : '结论已复核修改')
    reviewingId.value = null
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '复核失败'
  }
}

async function handleInvitationAction(invitationId: string, action: string) {
  actionError.value = ''
  const result = await post(`/org/${clubId.value}/joint/${jointId.value}/invitations/${invitationId}/${action}`, {})
  if (result.kind === 'completed') {
    toast.success(action === 'withdraw' ? '邀请已撤回' : '邀请已同步生效')
    await loadInvitations()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '操作失败'
  }
}

const invitedFor = (applicantName: string) => invitations.value.filter((i) => i.applicantName === applicantName)

onMounted(async () => {
  await loadData()
  await loadInvitations()
})
</script>

<template>
  <PageStateBoundary :state="state" title="联合结论与邀请" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-text-primary mb-2">联合结论与邀请</h1>
      <p class="text-sm text-text-secondary mb-6">各参与社团独立给出结论和邀请</p>

      <PermissionGuard permission="club:joint:manage">
        <div class="space-y-4">
          <Card v-for="name in [...new Set(conclusions.map((c) => c.applicantName))]" :key="name">
            <p class="text-base font-medium text-text-primary mb-3">{{ name }}</p>
            <div class="space-y-2">
              <div
                v-for="c in conclusions.filter((c) => c.applicantName === name)"
                :key="c.id"
                class="flex items-center justify-between rounded-lg border p-3"
                :class="c.myClub ? 'border-border' : 'border-border bg-subtle/50'"
              >
                <div class="flex items-center gap-2">
                  <Building2 :size="16" class="text-text-secondary" />
                  <span class="text-sm text-text-primary">{{ c.clubName }}</span>
                  <span
                    v-if="!c.myClub"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-info-subtle text-info"
                  >
                    跨社互见
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <template v-if="c.conclusion">
                    <span
                      class="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                      :class="c.conclusion === 'admit' ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'"
                    >
                      {{ c.conclusion === 'admit' ? '录用' : '不录用' }}
                    </span>
                  </template>
                  <template v-if="c.status === 'concluded'">
                    <span class="flex items-center gap-1 text-sm">
                      <Star :size="14" class="text-warning fill-warning" /> {{ c.rating }}
                    </span>
                    <StateTag status="concluded" />
                    <!-- 复核仅对补面完成后标记了 reviewFlag 的结论开放，后台会拒绝无标志复核；互见行只读 -->
                    <template v-if="c.myClub">
                      <button v-if="c.reviewFlag" class="text-xs text-primary hover:underline" @click="reviewingId = reviewingId === c.id ? null : c.id">复核</button>
                      <div v-if="c.reviewFlag && reviewingId === c.id" class="flex items-center gap-1.5">
                        <button
                          class="px-2 h-7 rounded-md bg-subtle text-success text-xs font-medium hover:bg-muted"
                          @click="handleReview(c, 'keep')"
                        >
                          保持结论
                        </button>
                        <button
                          class="px-2 h-7 rounded-md bg-subtle text-success text-xs font-medium hover:bg-muted"
                          @click="handleReview(c, 'modify', 'admit')"
                        >
                          改为录用
                        </button>
                        <button
                          class="px-2 h-7 rounded-md bg-subtle text-destructive text-xs font-medium hover:bg-muted"
                          @click="handleReview(c, 'modify', 'not_admit')"
                        >
                          改为不录用
                        </button>
                      </div>
                    </template>
                  </template>
                  <!-- JNT-014: 过期与拒绝是不同状态，不得混用（mock 不产生此二态，状态机 SM-JNT-005 亦无） -->
                  <template v-else-if="c.status === 'pending'">
                    <template v-if="c.myClub">
                      <div class="flex items-center gap-1.5">
                        <button
                          class="flex items-center gap-1 px-2 h-7 rounded-md bg-subtle text-success text-xs font-medium hover:bg-muted disabled:opacity-60"
                          @click="handleSetConclusion(c, 'admit')"
                        >
                          <ThumbsUp :size="12" /> 录用
                        </button>
                        <button
                          class="flex items-center gap-1 px-2 h-7 rounded-md bg-subtle text-destructive text-xs font-medium hover:bg-muted disabled:opacity-60"
                          @click="handleSetConclusion(c, 'not_admit')"
                        >
                          <ThumbsDown :size="12" /> 不录用
                        </button>
                        <button class="text-xs text-primary hover:underline" @click="openEvaluate(c)">评价</button>
                      </div>
                    </template>
                    <StateTag v-else :status="c.status" />
                  </template>
                  <template v-else>
                    <StateTag :status="c.status" />
                    <button v-if="c.myClub" class="text-xs text-primary hover:underline" @click="openEvaluate(c)">评价</button>
                  </template>
                </div>
              </div>
            </div>

            <!-- 已发邀请 -->
            <div v-if="invitedFor(name).length > 0" class="mt-3 pt-3 border-t border-border space-y-2">
              <p class="text-xs text-text-secondary">已发送的邀请</p>
              <div
                v-for="inv in invitedFor(name)"
                :key="inv.id"
                class="flex items-center justify-between rounded-md bg-subtle px-3 py-2"
              >
                <div class="flex items-center gap-2">
                  <Send :size="13" class="text-text-secondary" />
                  <StateTag :status="inv.status" />
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    v-if="inv.status === 'pending_acceptance'"
                    class="flex items-center gap-1 px-2 h-7 rounded-md bg-muted text-text-primary text-xs font-medium hover:bg-border disabled:opacity-60"
                    @click="handleInvitationAction(inv.id, 'withdraw')"
                  >
                    <XCircle :size="12" /> 撤回
                  </button>
                  <button
                    v-if="inv.status === 'accepted'"
                    class="flex items-center gap-1 px-2 h-7 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                    @click="handleInvitationAction(inv.id, 'sync')"
                  >
                    <CheckCircle2 :size="12" /> 同步生效
                  </button>
                  <button
                    v-if="['rejected', 'withdrawn', 'expired'].includes(inv.status)"
                    class="flex items-center gap-1 px-2 h-7 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    @click="handleInvite(conclusions.find((c) => c.applicantId === inv.applicantId)!)"
                  >
                    <RefreshCw :size="12" /> {{ invitingName === inv.applicantName ? '发送中...' : '重发' }}
                  </button>
                </div>
              </div>
            </div>

            <div
              v-else-if="conclusions.filter((c) => c.applicantName === name).every((c) => c.status === 'concluded')"
              class="mt-3 pt-3 border-t border-border"
            >
              <button
                v-if="conclusions.some((c) => c.applicantName === name && c.myClub)"
                class="flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="invitingName !== null"
                @click="handleInvite(conclusions.find((c) => c.applicantName === name)!)"
              >
                <Send :size="14" /> {{ invitingName === name ? '发送中...' : '发送邀请' }}
              </button>
            </div>
          </Card>
        </div>
      </PermissionGuard>

      <p v-if="actionError" class="mt-3 text-xs text-destructive">{{ actionError }}</p>

      <!-- 评价面板 -->
      <Card v-if="selected" class="mt-4">
        <div class="mb-4">
          <h2 class="text-base font-medium text-text-primary">{{ selected.applicantName }} · {{ selected.clubName }}</h2>
          <p class="text-sm text-text-secondary">提交该社团的联合结论评价</p>
        </div>
        <div class="mb-4">
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
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1">评语</label>
          <textarea
            v-model="comment"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="填写评价内容..."
          />
        </div>
        <button
          class="flex items-center justify-center gap-1.5 w-full h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
          :disabled="evaluating || rating === 0"
          @click="handleEvaluate"
        >
          <CheckCircle2 :size="16" /> {{ evaluating ? '提交中...' : '提交评价' }}
        </button>
      </Card>
    </div>
  </PageStateBoundary>
</template>
