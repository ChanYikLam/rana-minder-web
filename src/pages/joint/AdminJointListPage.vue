<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Users, ShieldAlert, ShieldOff, RotateCcw } from '@lucide/vue'

interface JointClub { clubId: string; clubName: string; suspended: boolean }
interface JointItem {
  id: string; title: string; status: string; participants: string[]
  applicantCount: number; canForceClose: boolean; clubs: JointClub[]
}

const state = ref<PageState>('loading')
const items = ref<JointItem[]>([])
const busy = ref(false)

const closeTarget = ref<JointItem | null>(null)
const closeOpen = ref(false)
const closeReason = ref('')
const closeError = ref('')
const clubBusy = ref('')

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: JointItem[] }>('/admin/joint')
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: JointItem[] } }).data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function handleForceClose(proof?: string) {
  if (!closeTarget.value || busy.value) return
  if (!closeReason.value.trim()) {
    closeError.value = '请填写强制关闭原因'
    return
  }
  busy.value = true
  try {
    closeError.value = ''
    const result = await post(`/admin/joint/${closeTarget.value.id}/force-close`, { reason: closeReason.value.trim(), reauthProof: proof })
    if (result.kind === 'completed') {
      closeOpen.value = false
      closeTarget.value = null
      closeReason.value = ''
      await loadData()
    } else if (result.kind === 'rejected' && result.error) {
      closeError.value = (result.error as { message?: string }).message || '操作失败'
    }
  } finally {
    busy.value = false
  }
}

async function toggleClub(jnt: JointItem, club: JointClub) {
  if (clubBusy.value) return
  clubBusy.value = `${jnt.id}:${club.clubId}`
  const result = await post(`/admin/joint/${jnt.id}/clubs/${club.clubId}/${club.suspended ? 're-enable' : 'force-suspend'}`, {})
  clubBusy.value = ''
  if (result.kind === 'completed') {
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合活动管理" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">联合活动管理</h1>
      <p class="text-sm text-text-secondary mb-6">平台视角查看所有联合活动，可强制关闭异常活动、停用或恢复参与社团</p>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无联合活动" />

      <div v-else class="space-y-3">
        <Card v-for="jnt in items" :key="jnt.id">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="text-sm font-medium text-text-primary">{{ jnt.title }}</p>
              <div class="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                <span class="flex items-center gap-1"><Users :size="12" /> {{ jnt.participants.join(' + ') }}</span>
                <span>{{ jnt.applicantCount }} 报名</span>
              </div>
              <div v-if="jnt.clubs.length" class="flex flex-wrap gap-1.5 mt-2">
                <span
                  v-for="club in jnt.clubs"
                  :key="club.clubId"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border"
                  :class="club.suspended ? 'border-danger text-danger bg-danger-subtle' : 'border-border text-text-secondary bg-subtle'"
                >
                  {{ club.clubName }}
                  <button
                    class="flex items-center gap-0.5 hover:text-text-primary disabled:opacity-50"
                    :disabled="!!clubBusy"
                    @click="toggleClub(jnt, club)"
                  >
                    <component :is="club.suspended ? RotateCcw : ShieldOff" :size="11" />
                    {{ club.suspended ? '恢复' : '停用' }}
                  </button>
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="jnt.status" />
              <button
                v-if="jnt.canForceClose"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle"
                @click="closeTarget = jnt; closeReason = ''; closeError = ''; closeOpen = true"
              >
                <ShieldAlert :size="12" /> 强制关闭
              </button>
            </div>
          </div>
        </Card>
      </div>

      <HighRiskConfirm
        v-model:open="closeOpen"
        title="强制关闭联合活动"
        description="将强制结束活动，所有参与社团确认流程作废，此操作不可撤销。"
        :targets="closeTarget ? [{ id: closeTarget.id, label: closeTarget.title, detail: '强制关闭前请填写原因' }] : []"
        impact-summary="强制关闭后活动进入平台强制结束状态，不经过社团确认。"
        confirm-label="确认强制关闭"
        reauth-required
        :executing="busy"
        :error-message="closeError || undefined"
        @confirm="handleForceClose"
        @update:error-message="(v) => closeError = v"
        @retry="closeError = ''"
      >
        <template #extra>
          <input
            v-model="closeReason"
            class="w-full px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="强制关闭原因（必填）"
          />
        </template>
      </HighRiskConfirm>
    </div>
  </PageStateBoundary>
</template>
