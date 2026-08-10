<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import type { PageState } from '@/types/machine'
import { CheckCircle2, XCircle, Clock, Mail, ArrowLeft } from '@lucide/vue'

interface InvitationDetail {
  id: string; activityId: string; activityTitle: string
  clubName: string; applicantName: string; status: string
  sentAt: string; expiredAt: string; departmentName: string
  casdoorSync: 'none' | 'processing' | 'confirmed' | 'failed'
}

const route = useRoute()
const state = ref<PageState>('loading')
const detail = ref<InvitationDetail | null>(null)
const responding = ref(false)
const syncing = ref(false)

const isManageView = computed(() => route.meta.view === 'manage')

async function loadDetail() {
  state.value = 'loading'
  const id = route.params.invitationId as string
  const result = await get<InvitationDetail>(`/me/invitations/recruitment/${id}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function handleRespond(action: 'accept' | 'reject') {
  if (!detail.value || responding.value) return
  responding.value = true
  const result = await post(`/me/invitations/recruitment/${detail.value.id}/respond`, { action })
  responding.value = false
  if (result.kind === 'completed') {
    detail.value.status = action === 'accept' ? 'accepted' : 'rejected'
    if (action === 'accept') {
      detail.value.casdoorSync = 'processing'
      toast.success('已接受邀请，等待身份同步生效')
    } else {
      toast.success('已拒绝邀请')
    }
  } else if (result.kind === 'accepted') {
    toastAcceptedAction(action === 'accept' ? '接受邀请已受理，正在后台处理' : '拒绝邀请已受理，正在后台处理')
  } else {
    toast.error('操作失败，请稍后重试')
  }
}

// 新-2：申请人侧「确认生效」——接受录取后主动触发 Casdoor 同步确认（原仅有管理端点）
async function handleSyncConfirm() {
  if (!detail.value || syncing.value) return
  syncing.value = true
  const result = await post(`/me/invitations/recruitment/${detail.value.id}/sync-confirm`)
  syncing.value = false
  if (result.kind === 'completed') {
    toast.success('成员身份已生效')
    // 重新拉取详情：sync_failed 重试成功后 status/casdoorSync 均由后端更新
    await loadDetail()
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('同步确认已受理，正在后台处理')
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '确认失败，请稍后重试')
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="录取邀请" @retry="loadDetail">
    <div v-if="detail" class="max-w-lg mx-auto">
      <button v-if="!isManageView" class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="$router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-subtle text-primary">
            <Mail :size="24" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary">录取邀请</h1>
            <p class="text-sm text-text-secondary">{{ detail.clubName }} · {{ detail.activityTitle }}</p>
          </div>
        </div>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-text-secondary">录取方向</dt>
            <dd class="text-text-primary font-medium">{{ detail.departmentName }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">发送时间</dt>
            <dd class="text-text-primary">{{ formatTime(detail.sentAt) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">截止时间</dt>
            <dd class="text-warning">{{ formatTime(detail.expiredAt) }}</dd>
          </div>
          <div class="flex justify-between items-center">
            <dt class="text-text-secondary">当前状态</dt>
            <dd><StateTag :status="detail.status" /></dd>
          </div>
        </dl>
      </Card>

      <!-- 响应区域 -->
      <template v-if="detail.status === 'pending_acceptance' || detail.status === 'sent'">
        <Card class="mb-4 border-warning">
          <div class="flex items-start gap-2 mb-3">
            <Clock :size="18" class="text-warning mt-0.5 shrink-0" />
            <p class="text-sm text-text-secondary">
              请在截止时间前确认是否接受邀请。接受后需等待统一身份认证同步完成方可正式生效。
            </p>
          </div>
        </Card>

        <div class="flex gap-3">
          <button
            class="flex-1 h-12 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            :disabled="responding"
            @click="handleRespond('accept')"
          >
            <CheckCircle2 :size="18" /> {{ responding ? '处理中...' : '接受邀请' }}
          </button>
          <button
            class="flex-1 h-12 rounded-md border border-danger text-danger font-medium hover:bg-danger-subtle transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            :disabled="responding"
            @click="handleRespond('reject')"
          >
            <XCircle :size="18" /> 拒绝
          </button>
        </div>
      </template>

      <!-- 已响应 -->
      <Card v-else-if="detail.status === 'accepted' || detail.status === 'sync_failed'" class="border-success">
        <div class="flex items-center gap-2" :class="detail.status === 'sync_failed' ? 'text-danger' : 'text-success'">
          <CheckCircle2 :size="20" />
          <p class="text-sm font-medium">{{ detail.status === 'sync_failed' ? '您已接受邀请，但成员同步失败' : '您已接受邀请' }}</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">{{ detail.status === 'sync_failed' ? '身份同步未完成，可点击下方按钮重新发起同步确认' : '系统正在与统一身份认证同步，生效后您将成为正式成员' }}</p>
        <!-- REC-028: 普通招新不提供"撤销已接受录取"操作 -->
        <p class="text-xs text-warning mt-2">已接受的录取邀请不可撤销</p>

        <!-- 新-2：申请人侧确认生效入口（casdoorSync=processing 或 sync_failed 重试） -->
        <div v-if="detail.casdoorSync === 'processing' || detail.status === 'sync_failed'" class="mt-3">
          <div class="rounded-lg bg-warning-subtle p-2.5 mb-3 flex items-center gap-2">
            <Clock :size="14" class="text-warning shrink-0" />
            <p class="text-xs text-warning">{{ detail.status === 'sync_failed' ? '成员同步失败，可点击重新确认生效' : '已接受，正在等待成员身份生效确认' }}</p>
          </div>
          <button
            class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="syncing"
            @click="handleSyncConfirm"
          >
            <CheckCircle2 :size="14" /> {{ syncing ? '确认中...' : '确认生效' }}
          </button>
        </div>
        <p v-else-if="detail.casdoorSync === 'confirmed'" class="text-xs text-success mt-2 flex items-center gap-1">
          <CheckCircle2 :size="12" /> 已生效，欢迎加入
        </p>
      </Card>

      <Card v-else-if="detail.status === 'rejected'">
        <div class="flex items-center gap-2 text-text-secondary">
          <XCircle :size="20" />
          <p class="text-sm font-medium">您已拒绝此邀请</p>
        </div>
      </Card>

      <Card v-else-if="detail.status === 'expired'">
        <div class="flex items-center gap-2 text-text-secondary">
          <Clock :size="20" />
          <p class="text-sm font-medium">邀请已过期</p>
        </div>
      </Card>

      <Card v-else-if="detail.status === 'pending_casdoor_sync'">
        <div class="flex items-center gap-2 text-warning">
          <Clock :size="20" class="animate-pulse" />
          <p class="text-sm font-medium">正在同步至统一身份认证...</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">同步完成后权限将自动生效</p>
      </Card>
    </div>
  </PageStateBoundary>
</template>
