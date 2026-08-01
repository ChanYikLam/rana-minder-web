<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ShieldAlert, CheckCircle2, Users, Mail, ArrowLeft } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const closing = ref(false)
const detail = ref<{
  id: string; title: string; status: string
  participants: { clubId: string; clubName: string; status: string; concludedCount: number; invitationSent: number }[]
  totalApplicants: number; totalConcluded: number; totalInvited: number; canClose: boolean
} | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await get(`/org/${clubId}/joint/${jointId}/close`)
  if (result.kind === 'completed') {
    detail.value = result.data as typeof detail.value
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

onMounted(loadData)

async function handleClose() {
  closing.value = true
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await post(`/org/${clubId}/joint/${jointId}/close`, {})
  closing.value = false
  if (result.kind === 'completed') {
    toast.success('联合活动已结束')
    router.push(`/org/${clubId}/joint`)
  } else {
    toast.error('结束失败，请稍后重试')
  }
}
</script>

<template>
  <PageStateBoundary :state="state" title="结束确认" @retry="loadData">
    <div v-if="detail" class="max-w-lg mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">联合活动结束确认</h1>
      <p class="text-sm text-text-secondary mb-6">{{ detail.title }}</p>

      <!-- 数据汇总 -->
      <div class="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <Card padding="p-3 sm:p-4 text-center">
          <Users :size="18" class="mx-auto text-text-secondary mb-1 sm:hidden" />
          <Users :size="20" class="hidden sm:block mx-auto text-text-secondary mb-1" />
          <p class="text-lg sm:text-xl font-bold text-text-primary">{{ detail.totalApplicants }}</p>
          <p class="text-xs text-text-secondary">总报名</p>
        </Card>
        <Card padding="p-3 sm:p-4 text-center">
          <CheckCircle2 :size="18" class="mx-auto text-text-secondary mb-1 sm:hidden" />
          <CheckCircle2 :size="20" class="hidden sm:block mx-auto text-text-secondary mb-1" />
          <p class="text-lg sm:text-xl font-bold text-text-primary">{{ detail.totalConcluded }}</p>
          <p class="text-xs text-text-secondary">已结论</p>
        </Card>
        <Card padding="p-3 sm:p-4 text-center">
          <Mail :size="18" class="mx-auto text-text-secondary mb-1 sm:hidden" />
          <Mail :size="20" class="hidden sm:block mx-auto text-text-secondary mb-1" />
          <p class="text-lg sm:text-xl font-bold text-text-primary">{{ detail.totalInvited }}</p>
          <p class="text-xs text-text-secondary">已邀请</p>
        </Card>
      </div>

      <!-- 参与社团状态 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">各社团完成情况</h2>
        <div class="space-y-2">
          <div v-for="p in detail.participants" :key="p.clubId" class="flex items-center justify-between rounded-lg border border-border p-3">
            <span class="text-sm text-text-primary">{{ p.clubName }}</span>
            <div class="flex items-center gap-3 text-xs text-text-secondary">
              <span>结论 {{ p.concludedCount }}</span>
              <span>邀请 {{ p.invitationSent }}</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 高风险确认提示 -->
      <Card v-if="detail.canClose" class="mb-4 border-warning">
        <div class="flex items-start gap-2">
          <ShieldAlert :size="20" class="text-warning mt-0.5 shrink-0" />
          <div>
            <p class="text-sm font-medium text-warning">结束操作不可撤销</p>
            <p class="text-xs text-text-secondary mt-1">结束后将关闭报名通道，已发出的邀请不受影响，但不可再发新邀请。</p>
          </div>
        </div>
      </Card>

      <button
        class="w-full h-11 rounded-md bg-warning text-text-on-accent font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="!detail.canClose || closing"
        @click="handleClose"
      >
        <ShieldAlert :size="18" /> {{ closing ? '结束中...' : '确认结束联合活动' }}
      </button>
      <p v-if="!detail.canClose" class="mt-3 text-xs text-text-secondary text-center">尚有未完成的结论或邀请，暂时无法结束</p>
    </div>
  </PageStateBoundary>
</template>
