<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CheckCircle2, Clock, Mail, XCircle } from '@lucide/vue'
import { Card, PageStateBoundary } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'

interface JointInvitation {
  id: string
  jointTitle: string
  status: string
  sentAt: string
  expiredAt: string
  offers: { clubId: string; clubName: string; departmentName: string }[]
}

const route = useRoute()
const state = ref<PageState>('loading')
const detail = ref<JointInvitation | null>(null)
const responding = ref(false)
const errorMessage = ref('')

async function loadDetail() {
  state.value = 'loading'
  const invitationId = route.params.invitationId as string
  const result = await get<JointInvitation>(`/me/invitations/joint/${invitationId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

async function respond(action: 'accept' | 'reject') {
  if (!detail.value || responding.value) return
  responding.value = true
  errorMessage.value = ''
  const result = await post(`/me/invitations/joint/${detail.value.id}/respond`, { action })
  responding.value = false
  if (result.kind === 'completed') {
    detail.value.status = action === 'accept' ? 'accepted' : 'rejected'
  } else {
    errorMessage.value = 'error' in result ? result.error.message : '邀请响应正在处理中，请勿重复提交'
  }
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="联合录取邀请" @retry="loadDetail">
    <div v-if="detail" class="mx-auto max-w-lg">
      <Card class="mb-4">
        <div class="mb-4 flex items-center gap-3">
          <Mail :size="24" class="text-primary" />
          <div>
            <h1 class="text-xl font-bold text-text-primary">联合录取邀请</h1>
            <p class="text-sm text-text-secondary">{{ detail.jointTitle }}</p>
          </div>
          <StateTag class="ml-auto" :status="detail.status" />
        </div>
        <div class="space-y-2">
          <div v-for="offer in detail.offers" :key="offer.clubId" class="rounded-md border border-border p-3">
            <p class="text-sm font-medium text-text-primary">{{ offer.clubName }}</p>
            <p class="text-xs text-text-secondary">录取方向：{{ offer.departmentName }}</p>
          </div>
        </div>
        <p class="mt-3 flex items-center gap-1 text-xs text-warning"><Clock :size="14" /> 截止时间：{{ detail.expiredAt }}</p>
      </Card>

      <p v-if="errorMessage" class="mb-3 text-sm text-danger" role="alert">{{ errorMessage }}</p>
      <div v-if="detail.status === 'sent' || detail.status === 'pending_acceptance'" class="flex gap-3">
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-text-on-primary disabled:opacity-60" :disabled="responding" @click="respond('accept')">
          <CheckCircle2 :size="18" /> 接受全部邀请
        </button>
        <button class="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-danger text-danger disabled:opacity-60" :disabled="responding" @click="respond('reject')">
          <XCircle :size="18" /> 拒绝
        </button>
      </div>
    </div>
  </PageStateBoundary>
</template>
