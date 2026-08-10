<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ShieldAlert, CheckCircle2, Users, Mail, ArrowLeft, XCircle } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const closing = ref(false)
const detail = ref<{
  id: string; title: string; status: string
  participants: { clubId: string; clubName: string; status: string; concludedCount: number; invitationSent: number; endConfirmed: boolean }[]
  totalApplicants: number; totalConcluded: number; totalInvited: number; canClose: boolean
} | null>(null)

const clubId = computed(() => (route.params.clubId as string) || '')
const jointId = computed(() => (route.params.jointId as string) || '')
const isAdminScope = computed(() => !clubId.value)
const closeBaseUrl = computed(() =>
  isAdminScope.value
    ? `/admin/joint/${jointId.value}/close`
    : `/org/${clubId.value}/joint/${jointId.value}/close`
)

async function loadData() {
  state.value = 'loading'
  const result = await get(closeBaseUrl.value)
  if (result.kind === 'completed') {
    detail.value = result.data as typeof detail.value
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

const allConfirmed = computed(() => {
  if (!detail.value) return false
  return detail.value.participants.length > 0 && detail.value.participants.every((p) => p.endConfirmed)
})

async function handleStartClose() {
  if (!detail.value || closing.value) return
  closing.value = true
  const result = await post(`${closeBaseUrl.value}/start`, {})
  closing.value = false
  if (result.kind === 'completed') {
    toast.success('已进入结束确认阶段')
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '进入结束确认失败')
  }
}

async function handleClose() {
  if (!detail.value || closing.value) return
  closing.value = true
  const result = await post(closeBaseUrl.value, {})
  closing.value = false
  if (result.kind === 'completed') {
    toast.success('本社团确认完成')
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '确认失败')
  }
}

onMounted(loadData)
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
            <div class="flex items-center gap-2">
              <span class="text-sm text-text-primary">{{ p.clubName }}</span>
              <CheckCircle2 v-if="p.endConfirmed" :size="15" class="text-success" />
            </div>
            <div class="flex items-center gap-3 text-xs text-text-secondary">
              <span>结论 {{ p.concludedCount }}</span>
              <span>邀请 {{ p.invitationSent }}</span>
              <span :class="p.endConfirmed ? 'text-success' : 'text-warning'">{{ p.endConfirmed ? '已确认' : '未确认' }}</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 高风险确认提示 -->
      <Card v-if="detail.canClose && !['closing_confirm', 'closed'].includes(detail.status)" class="mb-4 border-warning">
        <div class="flex items-start gap-2">
          <ShieldAlert :size="20" class="text-warning mt-0.5 shrink-0" />
          <div>
            <p class="text-sm font-medium text-warning">结束操作不可撤销</p>
            <p class="text-xs text-text-secondary mt-1">结束后将关闭报名通道，已发出的邀请不受影响，但不可再发新邀请。需全部参与社团确认后方可结束。</p>
          </div>
        </div>
      </Card>

      <template v-if="detail.status === 'closing_confirm'">
        <button
          v-if="!allConfirmed"
          class="w-full h-11 rounded-md bg-warning text-text-on-accent font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          :disabled="closing"
          @click="handleClose"
        >
          <ShieldAlert :size="18" /> {{ closing ? '提交中...' : '确认本社团同意结束' }}
        </button>
        <p v-if="allConfirmed" class="flex items-center justify-center gap-2 text-sm text-success">
          <CheckCircle2 :size="18" /> 全部社团已确认，联合活动已结束
        </p>
      </template>

      <button
        v-else-if="detail.canClose && !['closed'].includes(detail.status)"
        class="w-full h-11 rounded-md bg-warning text-text-on-accent font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="!detail.canClose || closing"
        @click="handleStartClose"
      >
        <ShieldAlert :size="18" /> {{ closing ? '提交中...' : '进入结束确认' }}
      </button>
      <p v-if="!detail.canClose && !['closed', 'closing_confirm'].includes(detail.status)" class="mt-3 text-xs text-text-secondary text-center">尚有未完成的结论或邀请，暂时无法结束</p>
      <p v-if="detail.status === 'closed'" class="flex items-center justify-center gap-2 text-sm text-success">
        <CheckCircle2 :size="18" /> 联合活动已结束
      </p>
      <p v-if="['cancelled', 'force_closed'].includes(detail.status)" class="flex items-center justify-center gap-2 text-sm text-text-secondary">
        <XCircle :size="18" /> 活动已取消，无需结束确认
      </p>
    </div>
  </PageStateBoundary>
</template>
