<script setup lang="ts">
import { computed, ref } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post } from '@/services/client'
import { useRequest } from '@/composables/useRequest'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { Flag, ShieldAlert } from '@lucide/vue'

interface RecItem {
  id: string; title: string; clubName: string; status: string
  applicantCount: number; canForceComplete: boolean
}

const { data, state, execute: loadData } = useRequest<{ items: RecItem[] }>(
  () => get<{ items: RecItem[] }>('/admin/recruitment'),
  { immediate: true }
)
const items = computed(() => data.value?.items ?? [])
const busy = ref(false)

const target = ref<RecItem | null>(null)
const open = ref(false)
const reason = ref('')
const reasonError = ref('')

async function handleForceComplete(proof?: string) {
  if (!target.value || busy.value) return
  if (!reason.value.trim()) {
    reasonError.value = '请填写强制结束原因'
    return
  }
  busy.value = true
  reasonError.value = ''
  try {
    const result = await post(`/admin/recruitment/${target.value.id}/force-complete`, { reason: reason.value.trim(), reauthProof: proof })
    if (result.kind === 'completed') {
      open.value = false
      target.value = null
      reason.value = ''
      await loadData()
    } else if (result.kind === 'accepted') {
      // P1-1：202/IFC-ERR-014 异步受理——关闭弹窗并提示已受理，避免停留在“正在执行...”
      toastAcceptedAction('强制结束已受理，正在后台处理')
      open.value = false
      target.value = null
      reason.value = ''
    } else if (result.kind === 'rejected' && result.error) {
      reasonError.value = (result.error as { message?: string }).message || '操作失败'
    } else {
      reasonError.value = '操作失败，请稍后重试'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageStateBoundary :state="state" title="招新活动管理" empty-title="暂无招新活动" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">招新活动管理</h1>
      <p class="text-sm text-text-secondary mb-6">平台视角查看所有招新活动，可强制结束异常活动</p>

      <div class="space-y-3">
        <Card v-for="rec in items" :key="rec.id">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="text-sm font-medium text-text-primary">{{ rec.title }}</p>
              <div class="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                <span class="flex items-center gap-1"><Flag :size="12" /> {{ rec.clubName }}</span>
                <span>{{ rec.applicantCount }} 报名</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="rec.status" />
              <button
                v-if="rec.canForceComplete"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle"
                @click="target = rec; reason = ''; reasonError = ''; open = true"
              >
                <ShieldAlert :size="12" /> 强制结束
              </button>
            </div>
          </div>
        </Card>
      </div>

      <HighRiskConfirm
        v-model:open="open"
        title="强制结束招新活动"
        description="将强制结束活动，全部报名通道关闭、未完成面试作废，此操作不可撤销。"
        :targets="target ? [{ id: target.id, label: target.title, detail: `${target.clubName} · ${target.applicantCount} 报名` }] : []"
        impact-summary="强制结束后活动进入平台强制结束状态，社团不可再恢复。"
        confirm-label="确认强制结束"
        reauth-required
        :executing="busy"
        :error-message="reasonError || undefined"
        @confirm="handleForceComplete"
        @update:error-message="(v) => reasonError = v"
        @retry="reasonError = ''"
      >
        <template #extra>
          <input
            v-model="reason"
            class="w-full px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="强制结束原因（必填）"
          />
        </template>
      </HighRiskConfirm>
    </div>
  </PageStateBoundary>
</template>
