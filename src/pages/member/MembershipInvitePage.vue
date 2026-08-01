<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Mail, UserPlus, CheckCircle2, XCircle, AlertTriangle } from '@lucide/vue'

interface Invite { id: string; candidateName: string; candidateStudentId: string; status: string; sentAt: string; acceptedAt: string | null; expiredAt: string; departmentName?: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<Invite[]>([])
const isManageView = computed(() => route.meta.view === 'manage')
const actingId = ref<string | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: Invite[] }>(`/org/${clubId}/members/invite`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: Invite[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function handleSendInvite() {
  toast.info('演示环境暂不支持')
}

async function handleWithdraw(inv: Invite) {
  actingId.value = inv.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/invite/${inv.id}/withdraw`, {})
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success('邀请已撤回')
    await loadData()
  } else {
    toast.error('撤回失败，请重试')
  }
}

async function handleRespond(inv: Invite, action: 'accept' | 'reject') {
  actingId.value = inv.id
  const r = await post(`/me/invitations/recruitment/${inv.id}/respond`, { action })
  actingId.value = null
  if (r.kind === 'completed') {
    toast.success(action === 'accept' ? '已接受邀请' : '已拒绝邀请')
    await loadData()
  } else {
    toast.error('操作失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="常规入社邀请" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">常规入社邀请</h1>
        <button v-if="isManageView" class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="handleSendInvite">
          <UserPlus :size="16" /> 发送邀请
        </button>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无入社邀请" description="发出的入社邀请将显示在这里" />

      <div v-else class="space-y-3">
        <Card v-for="inv in items" :key="inv.id">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary">
                <Mail :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ inv.candidateName }}</p>
                <p class="text-xs text-text-secondary">{{ inv.candidateStudentId }}</p>
                <p v-if="inv.departmentName" class="text-xs text-text-secondary mt-0.5">加入部门：{{ inv.departmentName }}</p>
              </div>
            </div>
            <StateTag :status="inv.status" />
          </div>
          <div class="mt-3 flex items-center gap-4 text-xs text-text-secondary">
            <span>发送于 {{ formatDate(inv.sentAt) }}</span>
            <span v-if="inv.acceptedAt" class="text-success">接受于 {{ formatDate(inv.acceptedAt) }}</span>
            <span>截止 {{ formatDate(inv.expiredAt) }}</span>
          </div>

          <!-- MEM-018: 管理视角 - 撤回仅限待处理且未被接受 -->
          <div v-if="isManageView && (inv.status === 'sent' || inv.status === 'pending_acceptance')" class="mt-2">
            <button class="text-xs text-danger hover:underline" :disabled="actingId === inv.id" @click="handleWithdraw(inv)">{{ actingId === inv.id ? '处理中...' : '撤回邀请' }}</button>
          </div>

          <!-- MEM-018: 申请人视角 - 整体接受/整体拒绝 -->
          <div v-if="!isManageView && (inv.status === 'sent' || inv.status === 'pending_acceptance')" class="mt-3">
            <div class="rounded-lg bg-warning-subtle p-2.5 mb-3">
              <p class="text-xs text-warning">接受邀请将同时加入社团{{ inv.departmentName ? `和「${inv.departmentName}」部门` : '' }}，不可拆分接受</p>
            </div>
            <div class="flex gap-2">
              <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" :disabled="actingId === inv.id" @click="handleRespond(inv, 'accept')">
                <CheckCircle2 :size="16" /> {{ actingId === inv.id ? '处理中...' : '整体接受' }}
              </button>
              <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-danger text-danger text-sm hover:bg-danger-subtle" :disabled="actingId === inv.id" @click="handleRespond(inv, 'reject')">
                <XCircle :size="16" /> 拒绝
              </button>
            </div>
          </div>

          <!-- 已接受不可撤回 -->
          <div v-if="inv.status === 'accepted'" class="mt-2 flex items-center gap-1 text-xs text-success">
            <CheckCircle2 :size="12" /> 已接受（不可撤回）
          </div>
          <div v-if="inv.status === 'pending_casdoor_sync'" class="mt-2 flex items-center gap-1 text-xs text-warning">
            <AlertTriangle :size="12" /> 成员身份生效处理中...
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
