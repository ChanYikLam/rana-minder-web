<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, DataTable } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Mail, Send, RefreshCw, XCircle, CheckCircle2, Plus, Users } from '@lucide/vue'

interface InvitationRow {
  id: string; applicantId: string; applicantName: string
  departmentId: string; departmentName: string; status: string
  sentAt: string; acceptedAt: string | null; expiredAt: string; version: number
}
interface AppItem { applicantId: string; applicantName: string; status: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<InvitationRow[]>([])
const applications = ref<AppItem[]>([])
const sendOpen = ref(false)
const sendForm = ref({ applicantId: '', departmentId: '', expireDays: 7 })
const departments = ref<{ id: string; name: string }[]>([])
const actionLoading = ref(false)

const clubId = computed(() => (route.params.clubId as string) || '')
const actId = computed(() => (route.params.activityId as string) || '')

const columns = [
  { key: 'applicantName', label: '申请人' },
  { key: 'departmentName', label: '录取方向' },
  { key: 'status', label: '状态' },
  { key: 'expiredAt', label: '截止' },
  { key: 'actions', label: '操作' },
]

async function loadInvitations() {
  state.value = 'loading'
  const result = await get<{ items: InvitationRow[] }>(`/org/${clubId.value}/recruitment/${actId.value}/invitations`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

async function loadOptions() {
  const [a, d] = await Promise.all([
    get<{ items: AppItem[] }>(`/org/${clubId.value}/recruitment/${actId.value}/applications`),
    get<{ departments: { id: string; name: string }[] }>(`/org/${clubId.value}/recruitment/${actId.value}`),
  ])
  if (a.kind === 'completed') applications.value = a.data.items
  if (d.kind === 'completed') departments.value = d.data.departments
}

async function runAction(invitationId: string, action: string) {
  if (actionLoading.value) return
  actionLoading.value = true
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/invitations/${invitationId}/${action}`, {})
  actionLoading.value = false
  if (result.kind === 'completed') {
    await loadInvitations()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败')
  }
}

async function handleSend() {
  if (!sendForm.value.applicantId || !sendForm.value.departmentId || actionLoading.value) return
  actionLoading.value = true
  const result = await post(`/org/${clubId.value}/recruitment/${actId.value}/invitations`, {
    applicantId: sendForm.value.applicantId,
    departmentId: sendForm.value.departmentId,
    expireDays: sendForm.value.expireDays,
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    sendOpen.value = false
    sendForm.value = { applicantId: '', departmentId: '', expireDays: 7 }
    await loadInvitations()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '发送失败')
  }
}

function formatTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const canWithdraw = (status: string) => status === 'pending_acceptance'
const canReissue = (status: string) => ['rejected', 'withdrawn', 'expired'].includes(status)
const canSync = (status: string) => status === 'accepted'

onMounted(async () => {
  await loadInvitations()
  await loadOptions()
})
</script>

<template>
  <PageStateBoundary :state="state" title="邀请管理" @retry="loadInvitations">
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">邀请管理</h1>
        <PermissionGuard permission="club:recruitment:manage">
          <button
            class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
            :disabled="actionLoading"
            @click="sendOpen = !sendOpen"
          >
            <Plus :size="16" /> 发送录取邀请
          </button>
        </PermissionGuard>
      </div>

      <!-- 发送邀请 -->
      <Card v-if="sendOpen" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">发送录取邀请</h2>
        <div class="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-xs text-text-secondary mb-1">申请人</label>
            <select
              v-model="sendForm.applicantId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            >
              <option value="" disabled>选择申请人</option>
              <option v-for="a in applications.filter((x) => x.status === 'submitted')" :key="a.applicantId" :value="a.applicantId">
                {{ a.applicantName }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">录取方向</label>
            <select
              v-model="sendForm.departmentId"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            >
              <option value="" disabled>选择方向</option>
              <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-text-secondary mb-1">有效期（天）</label>
            <input
              v-model.number="sendForm.expireDays"
              type="number"
              min="1"
              max="30"
              class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            />
          </div>
          <div class="flex items-end">
            <button
              class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading || !sendForm.applicantId || !sendForm.departmentId || !sendForm.expireDays || sendForm.expireDays < 1 || sendForm.expireDays > 30"
              @click="handleSend"
            >
              <Send :size="15" /> {{ actionLoading ? '发送中...' : '发送' }}
            </button>
          </div>
        </div>
        <p class="text-xs text-text-secondary flex items-center gap-1">
          <Users :size="13" /> 仅可向已提交申请的申请人发送，有效期默认 7 天（1~30 天可调）
        </p>
      </Card>

      <!-- 操作结果反馈统一走 toast -->

      <DataTable
        :columns="columns"
        :rows="items"
        :loading="state === 'loading'"
        empty-title="暂无录取邀请"
      >
        <template #cell-applicantName="{ row }">
          <span class="text-sm">{{ (row as InvitationRow).applicantName }}</span>
        </template>
        <template #cell-departmentName="{ row }">
          <span class="text-sm">{{ (row as InvitationRow).departmentName }}</span>
        </template>
        <template #cell-status="{ row }">
          <StateTag :status="(row as InvitationRow).status" />
        </template>
        <template #cell-expiredAt="{ row }">
          <span class="text-sm text-text-secondary">{{ formatTime((row as InvitationRow).expiredAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1.5">
            <button
              v-if="canWithdraw((row as InvitationRow).status)"
              class="flex items-center gap-1 px-2 h-7 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction((row as InvitationRow).id, 'withdraw')"
            >
              <XCircle :size="12" /> 撤回
            </button>
            <button
              v-if="canReissue((row as InvitationRow).status)"
              class="flex items-center gap-1 px-2 h-7 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction((row as InvitationRow).id, 'reissue')"
            >
              <RefreshCw :size="12" /> 重发
            </button>
            <button
              v-if="canSync((row as InvitationRow).status)"
              class="flex items-center gap-1 px-2 h-7 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction((row as InvitationRow).id, 'sync')"
            >
              <CheckCircle2 :size="12" /> 同步生效
            </button>
          </div>
        </template>
      </DataTable>

      <p v-if="items.length > 0" class="mt-3 text-xs text-text-secondary flex items-center gap-1">
        <Mail :size="12" /> 受邀人可在截止时间前接受/拒绝；已接受邀请需执行"同步生效"完成成员加入
      </p>
    </div>
  </PageStateBoundary>
</template>
