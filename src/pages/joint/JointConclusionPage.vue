<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Star, Send, Building2, CheckCircle2 } from '@lucide/vue'

interface Conclusion { id: string; applicantId?: string; applicantName: string; clubName: string; status: string; rating: number | null; comment: string; concludedAt: string | null }

const route = useRoute()
const state = ref<PageState>('loading')
const conclusions = ref<Conclusion[]>([])
const selected = ref<Conclusion | null>(null)
const rating = ref(0)
const comment = ref('')
const evaluating = ref(false)
const invitingName = ref<string | null>(null)
const invitedNames = ref<Set<string>>(new Set())

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await get<{ items: Conclusion[] }>(`/org/${clubId}/joint/${jointId}/conclusions`)
  if (result.kind === 'completed') {
    conclusions.value = (result as { kind: 'completed'; data: { items: Conclusion[] } }).data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
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
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await post(`/org/${clubId}/joint/${jointId}/conclusions/${selected.value.id}/evaluate`, {
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
  } else {
    toast.error('评价提交失败，请稍后重试')
  }
}

async function handleInvite(c: Conclusion) {
  invitingName.value = c.applicantName
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await post(`/org/${clubId}/joint/${jointId}/invitations`, {
    applicantId: c.applicantId || '',
  })
  invitingName.value = null
  if (result.kind === 'completed') {
    invitedNames.value.add(c.applicantName)
    toast.success(`邀请已发送至 ${c.applicantName}`)
  } else {
    toast.error('邀请发送失败，请稍后重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合结论与邀请" @retry="loadData">
    <div>
      <h1 class="text-2xl font-bold text-text-primary mb-2">联合结论与邀请</h1>
      <p class="text-sm text-text-secondary mb-6">各参与社团独立给出结论和邀请</p>

      <!-- 按申请人分组 -->
      <div class="space-y-4">
        <Card v-for="name in [...new Set(conclusions.map((c) => c.applicantName))]" :key="name">
          <p class="text-base font-medium text-text-primary mb-3">{{ name }}</p>
          <div class="space-y-2">
            <div
              v-for="c in conclusions.filter((c) => c.applicantName === name)"
              :key="c.id"
              class="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div class="flex items-center gap-2">
                <Building2 :size="16" class="text-text-secondary" />
                <span class="text-sm text-text-primary">{{ c.clubName }}</span>
              </div>
              <div class="flex items-center gap-3">
                <template v-if="c.status === 'concluded'">
                  <span class="flex items-center gap-1 text-sm">
                    <Star :size="14" class="text-warning fill-warning" /> {{ c.rating }}
                  </span>
                  <StateTag status="concluded" />
                </template>
                <!-- JNT-014: 过期与拒绝是不同状态，不得混用 -->
                <template v-else-if="c.status === 'expired'">
                  <StateTag status="expired" />
                  <span class="text-xs text-text-secondary">逾期未处理（非主动拒绝）</span>
                </template>
                <template v-else-if="c.status === 'rejected'">
                  <StateTag status="rejected" />
                </template>
                <template v-else>
                  <StateTag :status="c.status" />
                  <button class="text-xs text-primary hover:underline" @click="openEvaluate(c)">评价</button>
                </template>
              </div>
            </div>
          </div>
          <div v-if="conclusions.filter((c) => c.applicantName === name).every((c) => c.status === 'concluded') && !invitedNames.has(name)" class="mt-3 pt-3 border-t border-border">
            <button
              class="flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="invitingName !== null"
              @click="handleInvite(conclusions.find((c) => c.applicantName === name)!)"
            >
              <Send :size="14" /> {{ invitingName === name ? '发送中...' : '发送邀请' }}
            </button>
          </div>
        </Card>
      </div>

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
