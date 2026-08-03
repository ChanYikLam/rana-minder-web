<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import ConfirmScope from '@/components/operation/ConfirmScope.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { useRouter } from 'vue-router'
import type { PageState } from '@/types/machine'
import { Building2, CheckCircle2, Clock, Plus } from '@lucide/vue'

interface ClubItem { id: string; name: string; status: string; memberCount: number; createdAt: string; groupMapped: boolean }

type ClubAction = 'approve' | 'reject' | 'suspend' | 'emergency-suspend' | 're-enable' | 'revoke'

const ACTION_LABELS: Record<ClubAction, string> = {
  approve: '批准接入',
  reject: '拒绝',
  suspend: '停用',
  'emergency-suspend': '紧急停用',
  're-enable': '恢复',
  revoke: '解除接入',
}

const state = ref<PageState>('loading')
const items = ref<ClubItem[]>([])
const actingId = ref<string | null>(null)
const confirmState = ref<{ club: ClubItem; action: ClubAction } | null>(null)
const confirming = ref(false)
const router = useRouter()

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: ClubItem[] }>('/admin/clubs')
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: ClubItem[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function runAction(club: ClubItem, action: ClubAction) {
  actingId.value = club.id
  const result = await post<{ status: string }>(`/admin/clubs/${club.id}/${action}`)
  actingId.value = null
  if (result.kind === 'completed') {
    club.status = (result as { kind: 'completed'; data: { status: string } }).data.status
    toast.success(`${club.name}：${ACTION_LABELS[action]}成功`)
  } else {
    toast.error('操作失败，请重试')
  }
}

function handleAction(club: ClubItem, action: ClubAction) {
  if (action === 'revoke' || action === 'emergency-suspend') {
    confirmState.value = { club, action }
    return
  }
  runAction(club, action)
}

async function onConfirmScope() {
  const current = confirmState.value
  if (!current) return
  confirming.value = true
  await runAction(current.club, current.action)
  confirming.value = false
  confirmState.value = null
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="社团接入管理" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">社团接入管理</h1>
        <button
          class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:opacity-90"
          @click="router.push('/admin/clubs/wizard')"
        >
          <Plus :size="14" /> 新社团接入
        </button>
      </div>
      <div class="space-y-3">
        <Card v-for="club in items" :key="club.id">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary">
                <Building2 :size="20" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ club.name }}</p>
                <p class="text-xs text-text-secondary">{{ club.memberCount }} 名成员 · 创建于 {{ club.createdAt.slice(0, 7) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="club.groupMapped" class="flex items-center gap-1 text-xs text-success"><CheckCircle2 :size="14" /> Group 已映射</span>
              <span v-else class="flex items-center gap-1 text-xs text-warning"><Clock :size="14" /> 待映射</span>
              <StateTag :status="club.status" />
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <template v-if="club.status === 'pending_review'">
              <button
                class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'approve')"
              >
                {{ actingId === club.id ? '处理中...' : '批准接入' }}
              </button>
              <button
                class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'reject')"
              >
                {{ actingId === club.id ? '处理中...' : '拒绝' }}
              </button>
            </template>
            <template v-else-if="club.status === 'approved'">
              <button
                class="px-3 py-1.5 rounded-md border border-border text-text-primary text-xs hover:bg-elevated disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'suspend')"
              >
                {{ actingId === club.id ? '处理中...' : '停用' }}
              </button>
              <button
                class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'emergency-suspend')"
              >
                {{ actingId === club.id ? '处理中...' : '紧急停用' }}
              </button>
              <button
                class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'revoke')"
              >
                {{ actingId === club.id ? '处理中...' : '解除接入' }}
              </button>
            </template>
            <template v-else-if="club.status === 'suspended' || club.status === 'emergency_suspended'">
              <button
                class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 're-enable')"
              >
                {{ actingId === club.id ? '处理中...' : '恢复' }}
              </button>
              <button
                class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
                :disabled="actingId !== null"
                @click="handleAction(club, 'revoke')"
              >
                {{ actingId === club.id ? '处理中...' : '解除接入' }}
              </button>
            </template>
          </div>
        </Card>
      </div>
    </div>

    <ConfirmScope
      v-if="confirmState"
      :open="true"
      :club-name="confirmState.club.name"
      :irreversible="confirmState.action === 'revoke'"
      :confirming="confirming"
      :targets="[{ id: confirmState.club.id, label: confirmState.club.name, detail: `${confirmState.club.memberCount} 名成员` }]"
      @update:open="(v: boolean) => { if (!v) confirmState = null }"
      @cancel="confirmState = null"
      @confirm="onConfirmScope"
    />
  </PageStateBoundary>
</template>
