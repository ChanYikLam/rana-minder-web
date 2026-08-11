<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { toDateTimeLocal, toIso } from '@/lib/date'
import type { PageState } from '@/types/machine'
import {
  Users, ChevronRight, ArrowLeft, Building2, Calendar, UserCheck,
  Rocket, XCircle, DoorOpen, DoorClosed, RefreshCw, CheckCircle2,
} from '@lucide/vue'

interface JointActivity {
  id: string; title: string; description: string; status: string; channelStatus: string
  deadline: string; participants: { clubId: string; clubName: string; status: string; concludedCount: number }[]
  applicantCount: number; version: number
}

const route = useRoute()
const router = useRouter()
const isCreate = computed(() => route.meta.mode === 'create')
const state = ref<PageState>('loading')
const detail = ref<JointActivity | null>(null)

// 创建表单
const form = ref({ title: '', description: '', deadline: '', participants: [] as string[] })
const submitting = ref(false)

// 管理操作
const actionLoading = ref(false)
const riskError = ref('')
const newDeadline = ref(toDateTimeLocal(new Date(Date.now() + 7 * 86400000).toISOString()))
const riskOpen = ref(false)
const riskSucceeded = ref(false)

/** 打开取消确认弹窗前重置 succeeded/error，避免上次成功后残留导致重开直接跳 done */
function openCancelRisk() {
  riskSucceeded.value = false
  riskError.value = ''
  riskOpen.value = true
}

async function loadDetail() {
  if (isCreate.value) { state.value = 'normal'; return }
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const jointId = route.params.jointId as string
  const result = await get<JointActivity>(`/org/${clubId}/joint/${jointId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

async function runAction(action: string, input?: Record<string, unknown>) {
  if (!detail.value || actionLoading.value) return
  actionLoading.value = true
  // P3：每次执行前重置 succeeded/error，避免上次取消成功后残留导致重开直接跳 done
  riskSucceeded.value = false
  riskError.value = ''
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/joint/${detail.value.id}/${action}`, { ...(input || {}) })
  actionLoading.value = false
  if (result.kind === 'completed') {
    // P1：#5 取消活动成功后需关闭弹窗并置位 succeeded，否则 HighRiskConfirm 永久停留“正在执行...”
    if (action === 'cancel') {
      riskSucceeded.value = true
      riskOpen.value = false
      riskError.value = ''
    }
    await loadDetail()
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('操作已受理，正在后台处理')
    if (action === 'cancel') {
      riskOpen.value = false
    }
  } else if (result.kind === 'rejected' && result.error) {
    riskError.value = (result.error as { message?: string }).message || '操作失败'
    toast.error(riskError.value)
  } else {
    // P3：并发冲突/依赖不可用/外部不确定等其余分支统一兜底，避免静默无反馈
    riskError.value = '操作失败，请稍后重试'
    toast.error(riskError.value)
  }
}

async function runChannel(action: string, input?: Record<string, unknown>) {
  if (!detail.value || actionLoading.value) return
  // P2-32：截止时间必须为未来时间
  const rawDeadline = input?.deadline as string | undefined
  if (!rawDeadline || new Date(toIso(rawDeadline)).getTime() <= Date.now()) {
    toast.error('截止时间必须晚于当前时间')
    return
  }
  actionLoading.value = true
  const clubId = route.params.clubId as string
  const body: Record<string, unknown> = { action, ...(input || {}) }
  // P2-32：datetime-local → ISO 契约转换
  if (typeof body.deadline === 'string' && body.deadline.includes('T') && !body.deadline.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(body.deadline)) {
    body.deadline = toIso(body.deadline)
  }
  const result = await post(`/org/${clubId}/joint/${detail.value.id}/channel`, body)
  actionLoading.value = false
  if (result.kind === 'completed') {
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '操作失败')
  }
}

const canOpenChannel = computed(() => {
  if (!detail.value) return false
  return ['not_open', 'closed'].includes(detail.value.channelStatus)
})

const canCloseChannel = computed(() => detail.value?.channelStatus === 'open')

// 名单调整
// P2-30：参与社团名单从 /explore/clubs（真实数据）加载，静态名单仅作加载失败时的兜底，不再硬编码写死
const staticClubOptions = [
  { id: 'club-001', name: '计算机协会' },
  { id: 'club-002', name: '电子设计协会' },
  { id: 'club-003', name: '数学建模协会' },
]
const clubOptions = ref<{ id: string; name: string }[]>(staticClubOptions)

async function loadClubOptions() {
  const result = await get<{ items: { id: string; name: string }[] }>('/explore/clubs')
  if (result.kind === 'completed' && Array.isArray(result.data?.items) && result.data.items.length > 0) {
    clubOptions.value = result.data.items
  }
}

// 创建模式可邀请的社团 = 真实名单除去当前工作空间社团
const createClubOptions = computed(() =>
  clubOptions.value.filter((c) => c.id !== (route.params.clubId as string)),
)
const adjustOpen = ref(false)
const selectedClubs = ref<string[]>([])
const newConfirmDeadline = ref(toDateTimeLocal(new Date(Date.now() + 7 * 86400000).toISOString()))

async function openAdjust() {
  adjustOpen.value = true
  selectedClubs.value = detail.value ? detail.value.participants.map((p) => p.clubId) : []
}

async function handleAdjust() {
  if (!detail.value || actionLoading.value) return
  if (!newConfirmDeadline.value || new Date(toIso(newConfirmDeadline.value)).getTime() <= Date.now()) {
    toast.error('确认截止时间必须晚于当前时间')
    return
  }
  actionLoading.value = true
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/joint/${detail.value.id}/clubs`, {
    clubIds: selectedClubs.value,
    newDeadline: toIso(newConfirmDeadline.value),
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    adjustOpen.value = false
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '调整失败')
  }
}

async function handleCreate() {
  // P2-31：创建页补齐"至少两个参与社团"校验（与调整名单口径一致）
  if (form.value.participants.length < 2) {
    toast.error('参与社团至少选择两个')
    return
  }
  if (!form.value.deadline || new Date(toIso(form.value.deadline)).getTime() <= Date.now()) {
    toast.error('报名截止时间必须晚于当前时间')
    return
  }
  submitting.value = true
  const clubId = route.params.clubId as string
  // P2-22：datetime-local 本地值转 ISO 契约后再提交
  const payload = { ...form.value, deadline: toIso(form.value.deadline) }
  const result = await post(`/org/${clubId}/joint`, payload)
  submitting.value = false
  if (result.kind === 'completed') {
    router.push(`/org/${clubId}/joint/${(result.data as { id: string }).id}`)
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('创建已受理，正在后台处理')
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '创建失败，请稍后重试')
  } else {
    // P1：#6 创建活动失败不再完全静默，给出明确错误提示
    toast.error((result as { error?: { message?: string } }).error?.message || '创建失败，请稍后重试')
  }
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(() => {
  loadClubOptions()
  loadDetail()
})
</script>

<template>
  <PageStateBoundary :state="state" title="联合活动" @retry="loadDetail">
    <!-- 创建模式 -->
    <div v-if="isCreate" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>
      <h1 class="text-2xl font-bold text-text-primary mb-6">发起联合活动</h1>

      <Card class="mb-4">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">活动名称 <span class="text-danger">*</span></label>
            <input v-model="form.title" type="text" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="例：计算机+电子联合招新" />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">活动描述</label>
            <textarea v-model="form.description" rows="3" class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" placeholder="描述联合活动内容..." />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">报名截止时间 <span class="text-danger">*</span></label>
            <input v-model="form.deadline" type="datetime-local" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-2">参与社团</label>
            <p class="text-xs text-text-secondary mb-2">邀请其他社团参与，各社团将独立进行评价和邀请</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="club in createClubOptions"
                :key="club.id"
                class="flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm transition-colors"
                :class="form.participants.includes(club.id) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-text-secondary hover:border-border-strong'"
                @click="form.participants.includes(club.id) ? form.participants = form.participants.filter((id) => id !== club.id) : form.participants.push(club.id)"
              >
                <Users :size="14" /> {{ club.name }}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <button
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
        :disabled="submitting || !form.title || !form.deadline"
        @click="handleCreate"
      >
        {{ submitting ? '创建中...' : '创建联合活动' }}
      </button>
    </div>

    <!-- 管理模式 -->
    <div v-else-if="detail" class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">{{ detail.title }}</h1>
          <div class="flex items-center gap-2 mt-1">
            <StateTag :status="detail.status" />
            <StateTag :status="detail.channelStatus" />
          </div>
        </div>
      </div>

      <Card class="mb-4">
        <p class="text-sm text-text-secondary mb-3">{{ detail.description }}</p>
        <div class="flex items-center gap-4 text-sm">
          <span class="flex items-center gap-1 text-warning"><Calendar :size="16" /> 截止 {{ formatDeadline(detail.deadline) }}</span>
          <span class="flex items-center gap-1 text-text-secondary"><Users :size="16" /> {{ detail.applicantCount }} 报名</span>
        </div>
      </Card>

      <!-- 参与社团 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">参与社团</h2>
        <div class="space-y-2">
          <div v-for="p in detail.participants" :key="p.clubId" class="flex items-center justify-between rounded-lg border border-border p-3">
            <div class="flex items-center gap-2">
              <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs">{{ p.clubName.charAt(0) }}</div>
              <span class="text-sm text-text-primary">{{ p.clubName }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-secondary">已结论 {{ p.concludedCount }}</span>
              <StateTag :status="p.status" />
            </div>
          </div>
        </div>
      </Card>

      <!-- 状态与通道操作 -->
      <PermissionGuard permission="club:joint:manage">
        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">状态与通道操作</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="detail.status === 'confirmed'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction('publish')"
            >
              <Rocket :size="15" /> 发布活动
            </button>
            <button
              v-if="detail.status === 'draft'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction('confirm')"
            >
              <CheckCircle2 :size="15" /> 确认参与
            </button>
            <button
              v-if="detail.status === 'draft'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="openAdjust"
            >
              <Building2 :size="15" /> 调整名单
            </button>
            <button
              v-if="detail.status === 'draft'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-secondary text-sm font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction('withdraw')"
            >
              <XCircle :size="15" /> 退出联合
            </button>
            <button
              v-if="!['cancelled', 'force_closed', 'closed'].includes(detail.status)"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-destructive text-text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-60"
              :disabled="actionLoading"
              @click="openCancelRisk"
            >
              <XCircle :size="15" /> 取消活动
            </button>
          </div>

          <!-- 调整名单 -->
          <div v-if="adjustOpen" class="mt-4 pt-4 border-t border-border">
            <p class="text-sm font-medium text-text-primary mb-2">调整参与社团（至少两个）</p>
            <div class="flex flex-wrap gap-2 mb-2">
              <button
                v-for="club in clubOptions"
                :key="club.id"
                class="px-3 py-1.5 rounded-md border text-sm transition-colors"
                :class="selectedClubs.includes(club.id) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-text-secondary hover:border-border-strong'"
                @click="selectedClubs.includes(club.id) ? (selectedClubs = selectedClubs.filter((id) => id !== club.id)) : selectedClubs.push(club.id)"
              >
                {{ club.name }}
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <label for="joint-confirm-deadline" class="text-xs text-text-secondary">新的确认截止时间</label>
              <input
                id="joint-confirm-deadline"
                v-model="newConfirmDeadline"
                type="datetime-local"
                class="px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              />
            </div>
            <button
              class="px-4 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading || selectedClubs.length < 2"
              @click="handleAdjust"
            >
              {{ actionLoading ? '提交中...' : '保存名单' }}
            </button>
          </div>

          <!-- 联合报名通道 -->
          <div v-if="detail.status === 'published' || detail.status === 'invite_phase'" class="mt-4 pt-4 border-t border-border">
            <p class="text-sm font-medium text-text-primary mb-2">
              联合报名通道：<StateTag :status="detail.channelStatus" />
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <template v-if="canOpenChannel">
                <label for="joint-channel-deadline" class="text-xs text-text-secondary">新截止时间</label>
                <input
                  id="joint-channel-deadline"
                  v-model="newDeadline"
                  type="datetime-local"
                  class="px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                />
                <button
                  class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runChannel('open', { deadline: newDeadline })"
                >
                  <DoorOpen :size="15" /> 开放/重开通道
                </button>
              </template>
              <button
                v-if="canCloseChannel"
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                :disabled="actionLoading"
                @click="runChannel('close', { reason: '报满关闭' })"
              >
                <DoorClosed :size="15" /> 关闭通道
              </button>
              <button
                v-if="detail.channelStatus === 'open'"
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                :disabled="actionLoading"
                @click="runChannel('pause')"
              >
                <PauseCircle :size="15" /> 暂停通道
              </button>
              <button
                v-if="detail.channelStatus === 'paused'"
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                :disabled="actionLoading"
                @click="runChannel('resume', { deadline: newDeadline })"
              >
                <RefreshCw :size="15" /> 恢复通道
              </button>
            </div>
          </div>
        </Card>
      </PermissionGuard>

      <!-- 管理入口 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-3">管理操作</h2>
        <div class="space-y-1">
          <button class="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-subtle text-left" @click="router.push(`/org/${route.params.clubId}/joint/${detail.id}/interview`)">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary"><Users :size="18" /></div>
            <div class="flex-1"><p class="text-sm font-medium text-text-primary">面试排期与评价</p><p class="text-xs text-text-secondary">共享排期、跨社评价</p></div>
            <ChevronRight :size="18" class="text-text-secondary" />
          </button>
          <button class="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-subtle text-left" @click="router.push(`/org/${route.params.clubId}/joint/${detail.id}/conclusions`)">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary"><UserCheck :size="18" /></div>
            <div class="flex-1"><p class="text-sm font-medium text-text-primary">结论与邀请</p><p class="text-xs text-text-secondary">各社团独立结论与邀请</p></div>
            <ChevronRight :size="18" class="text-text-secondary" />
          </button>
          <button class="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-subtle text-left" @click="router.push(`/org/${route.params.clubId}/joint/${detail.id}/close`)">
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-warning-subtle text-warning"><Building2 :size="18" /></div>
            <div class="flex-1"><p class="text-sm font-medium text-text-primary">结束确认</p><p class="text-xs text-text-secondary">确认结束联合活动</p></div>
            <ChevronRight :size="18" class="text-text-secondary" />
          </button>
        </div>
      </Card>

      <HighRiskConfirm
        v-model:open="riskOpen"
        title="取消联合活动"
        description="活动将被取消，所有联合报名与面试安排将失效，此操作不可撤销。"
        :targets="detail ? [{ id: detail.id, label: detail.title, detail: '影响全部参与社团与报名数据' }] : []"
        impact-summary="取消后活动进入已取消状态，不可恢复；未确认结束的联合活动可取消。"
        confirm-label="确认取消"
        reauth-required
        :executing="actionLoading"
        :succeeded="riskSucceeded"
        :error-message="riskError"
        @confirm="runAction('cancel', { confirm: true, reason: '发起方取消联合活动' })"
        @update:error-message="(v) => riskError = v"
        @retry="riskError = ''"
      />
    </div>
  </PageStateBoundary>
</template>
