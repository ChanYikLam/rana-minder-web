<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { CheckCircle2, XCircle, Clock, Mail, ArrowLeft } from '@lucide/vue'

interface JointInvitationDetail {
  id: string; jointId: string; jointTitle: string
  clubName: string; applicantName: string; type: string
  status: string; sentAt: string; expiredAt: string
  reviewFlag: boolean; casdoorSync: string | null
}

const route = useRoute()
const state = ref<PageState>('loading')
const detail = ref<JointInvitationDetail | null>(null)
const responding = ref(false)
const syncing = ref(false)

async function loadDetail() {
  state.value = 'loading'
  const id = route.params.invitationId as string
  const result = await get<JointInvitationDetail>(`/me/invitations/joint/${id}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function handleRespond(action: 'accept' | 'reject') {
  if (!detail.value || responding.value) return
  responding.value = true
  const result = await post(`/me/invitations/joint/${detail.value.id}/respond`, { action })
  responding.value = false
  if (result.kind === 'completed') {
    detail.value.status = action === 'accept' ? 'accepted' : 'rejected'
    if (action === 'accept') {
      detail.value.casdoorSync = 'processing'
      toast.success('已接受联合邀请，等待身份同步生效')
    } else {
      toast.success('已拒绝邀请')
    }
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败，请稍后重试')
  }
}

// 新-2：申请人侧「确认生效」——接受联合录取后主动触发 Casdoor 同步确认（原仅有管理端点）
async function handleSyncConfirm() {
  if (!detail.value || syncing.value) return
  syncing.value = true
  const result = await post(`/me/invitations/joint/${detail.value.id}/sync-confirm`)
  syncing.value = false
  if (result.kind === 'completed') {
    detail.value.casdoorSync = 'confirmed'
    toast.success('成员身份已生效')
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
  <PageStateBoundary :state="state" title="联合录取邀请" @retry="loadDetail">
    <div v-if="detail" class="max-w-lg mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="$router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-subtle text-primary">
            <Mail :size="24" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary">联合录取邀请</h1>
            <p class="text-sm text-text-secondary">{{ detail.clubName }} · {{ detail.jointTitle }}</p>
          </div>
        </div>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-text-secondary">邀请类型</dt>
            <dd class="text-text-primary font-medium">{{ detail.type === 'transfer' ? '调剂邀请' : '正式邀请' }}</dd>
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

      <template v-if="detail.status === 'pending_acceptance' || detail.status === 'sent'">
        <Card class="mb-4 border-warning">
          <div class="flex items-start gap-2">
            <Clock :size="18" class="text-warning mt-0.5 shrink-0" />
            <p class="text-sm text-text-secondary">
              请在截止时间前确认是否接受联合录取邀请。接受后需等待统一身份认证同步完成方可正式生效。
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

      <Card v-else-if="detail.status === 'accepted'" class="border-success">
        <div class="flex items-center gap-2 text-success">
          <CheckCircle2 :size="20" />
          <p class="text-sm font-medium">您已接受联合邀请</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">系统正在与统一身份认证同步，生效后您将成为正式成员</p>

        <!-- 新-2：申请人侧确认生效入口（casdoorSync=processing 时） -->
        <div v-if="detail.casdoorSync === 'processing'" class="mt-3">
          <div class="rounded-lg bg-warning-subtle p-2.5 mb-3 flex items-center gap-2">
            <Clock :size="14" class="text-warning shrink-0" />
            <p class="text-xs text-warning">已接受，正在等待成员身份生效确认</p>
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
