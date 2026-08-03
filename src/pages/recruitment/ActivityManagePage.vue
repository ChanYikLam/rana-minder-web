<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post, put } from '@/services/client'
import type { PageState } from '@/types/machine'
import {
  ClipboardList, Users, Mail, Rocket, PauseCircle, Flag, XCircle, PlayCircle,
  DoorOpen, DoorClosed, RefreshCw, PencilLine, Save, ChevronRight, FileText,
} from '@lucide/vue'

interface ActivityManage {
  id: string; title: string; description: string
  status: string; channelStatus: string; deadline: string
  departments: { id: string; name: string }[]
  applicantCount: number; interviewCount: number; invitationCount: number
  version: number
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const detail = ref<ActivityManage | null>(null)
const actionLoading = ref(false)
const actionError = ref('')
const newDeadline = ref(new Date(Date.now() + 7 * 86400000).toISOString())
const riskOpen = ref(false)
const riskAction = ref<'complete' | 'cancel' | null>(null)

async function loadDetail() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const actId = route.params.activityId as string
  const result = await get<ActivityManage>(`/org/${clubId}/recruitment/${actId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function runAction(action: string, input?: Record<string, unknown>) {
  if (!detail.value || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/recruitment/${detail.value.id}/${action}`, { ...(input || {}) })
  actionLoading.value = false
  if (result.kind === 'completed') {
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '操作失败'
  }
}

async function runChannel(action: string, input?: Record<string, unknown>) {
  if (!detail.value || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/recruitment/${detail.value.id}/channel`, { action, ...(input || {}) })
  actionLoading.value = false
  if (result.kind === 'completed') {
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '操作失败'
  }
}

const canOpenChannel = computed(() => {
  if (!detail.value) return false
  return ['not_open', 'closed'].includes(detail.value.channelStatus)
})

const canCloseChannel = computed(() => {
  return detail.value?.channelStatus === 'open'
})

// 规则收紧（REC-007/044）
const tightenOpen = ref(false)
const tightenForm = ref({ reason: '', days: 7 })
const tightenResult = ref<{ affectedCount: number } | null>(null)

async function runTighten() {
  if (!detail.value || actionLoading.value) return
  if (!tightenForm.value.reason.trim()) {
    actionError.value = '必须填写收紧原因'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  tightenResult.value = null
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/recruitment/${detail.value.id}/rules/tighten`, {
    reason: tightenForm.value.reason.trim(),
    deadlineDays: Number(tightenForm.value.days) || 7,
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    tightenResult.value = result.data as { affectedCount: number }
    tightenOpen.value = false
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value = (result.error as { message?: string }).message || '操作失败'
  }
}

// 活动编辑
const editOpen = ref(false)
const editForm = ref({ title: '', description: '' })
const editError = ref('')

async function openEdit() {
  if (!detail.value) return
  editOpen.value = true
  editForm.value = { title: detail.value.title, description: detail.value.description }
  editError.value = ''
}

async function handleSaveEdit() {
  if (!detail.value || actionLoading.value) return
  if (!editForm.value.title.trim()) {
    editError.value = '活动名称不能为空'
    return
  }
  actionLoading.value = true
  editError.value = ''
  const clubId = route.params.clubId as string
  const result = await put(`/org/${clubId}/recruitment/${detail.value.id}`, {
    title: editForm.value.title.trim(),
    description: editForm.value.description.trim(),
  })
  actionLoading.value = false
  if (result.kind === 'completed') {
    editOpen.value = false
    await loadDetail()
  } else if (result.kind === 'rejected' && result.error) {
    editError.value = (result.error as { message?: string }).message || '保存失败'
  }
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="活动管理" @retry="loadDetail">
    <div v-if="detail" class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">{{ detail.title }}</h1>
          <div class="flex items-center gap-2 mt-1">
            <StateTag :status="detail.status" />
            <StateTag :status="detail.channelStatus" />
          </div>
        </div>
      </div>

      <!-- 数据概览 -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <ClipboardList :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">报名申请</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.applicantCount }}</p>
        </Card>
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <Users :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">面试安排</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.interviewCount }}</p>
        </Card>
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <Mail :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">录取邀请</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.invitationCount }}</p>
        </Card>
      </div>

      <!-- 活动状态操作 -->
      <PermissionGuard permission="club:recruitment:manage">
        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">活动状态操作</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="detail.status === 'draft'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction('publish')"
            >
              <Rocket :size="15" /> 发布活动
            </button>
            <button
              v-if="['draft', 'in_progress', 'paused'].includes(detail.status)"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
              :disabled="actionLoading"
              @click="openEdit"
            >
              <PencilLine :size="15" /> 编辑活动
            </button>

            <template v-if="detail.status === 'in_progress'">
              <button
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                :disabled="actionLoading"
                @click="runAction('pause', { reason: '临时调整' })"
              >
                <PauseCircle :size="15" /> 暂停活动
              </button>
              <button
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-warning text-text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-60"
                :disabled="actionLoading"
                @click="riskAction = 'complete'; riskOpen = true"
              >
                <Flag :size="15" /> 结束活动
              </button>
              <button
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-destructive text-text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-60"
                :disabled="actionLoading"
                @click="riskAction = 'cancel'; riskOpen = true"
              >
                <XCircle :size="15" /> 取消活动
              </button>
            </template>

            <button
              v-if="detail.status === 'paused'"
              class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
              :disabled="actionLoading"
              @click="runAction('resume')"
            >
              <PlayCircle :size="15" /> 恢复活动
            </button>
          </div>

          <!-- 报名通道 -->
          <div v-if="['in_progress', 'paused'].includes(detail.status)" class="mt-4 pt-4 border-t border-border">
            <p class="text-sm font-medium text-text-primary mb-2">
              报名通道：<StateTag :status="detail.channelStatus" />
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <template v-if="canOpenChannel">
                <input
                  v-model="newDeadline"
                  class="px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                  placeholder="新截止时间"
                />
                <button
                  class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runChannel('open', { newDeadline: newDeadline })"
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
                v-if="detail.channelStatus === 'open'"
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                :disabled="actionLoading"
                @click="tightenOpen = !tightenOpen"
              >
                <PencilLine :size="15" /> 收紧规则
              </button>
              <button
                v-if="detail.channelStatus === 'paused'"
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-subtle text-text-primary text-sm font-medium hover:bg-muted disabled:opacity-60"
                :disabled="actionLoading"
                @click="runChannel('resume', { newDeadline: newDeadline })"
              >
                <RefreshCw :size="15" /> 恢复通道
              </button>
            </div>
            <div v-if="tightenOpen" class="mt-3 space-y-2 rounded-lg border border-border bg-elevated p-3">
              <p class="text-xs text-text-secondary">
                收紧规则将暂停报名通道，为已提交申请开放补救窗口；逾期未处理将进入调整逾期，不会被自动淘汰。
              </p>
              <textarea
                v-model="tightenForm.reason"
                rows="2"
                class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                placeholder="收紧原因（必填，将作为调整依据留痕）"
              />
              <div class="flex items-center gap-2">
                <label class="text-xs text-text-secondary shrink-0">补救窗口（天）</label>
                <input
                  v-model.number="tightenForm.days"
                  type="number"
                  min="1"
                  max="30"
                  class="w-24 px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
                />
                <button
                  class="px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                  :disabled="actionLoading"
                  @click="runTighten"
                >
                  {{ actionLoading ? '执行中...' : '确认收紧' }}
                </button>
                <button
                  class="px-3 h-9 rounded-md border border-border text-text-secondary text-sm hover:bg-subtle"
                  @click="tightenOpen = false"
                >
                  取消
                </button>
              </div>
              <p v-if="tightenResult" class="text-xs text-primary">
                已为 {{ tightenResult.affectedCount }} 名已提交申请人开放补救窗口，通道已暂停。
              </p>
            </div>
          </div>

          <!-- 编辑面板 -->
          <div v-if="editOpen" class="mt-4 pt-4 border-t border-border space-y-3">
            <input
              v-model="editForm.title"
              class="w-full px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              placeholder="活动名称"
            />
            <textarea
              v-model="editForm.description"
              rows="3"
              class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              placeholder="活动描述"
            />
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
                :disabled="actionLoading"
                @click="handleSaveEdit"
              >
                <Save :size="15" /> {{ actionLoading ? '保存中...' : '保存修改' }}
              </button>
              <button
                class="px-3 h-9 rounded-md border border-border text-text-secondary text-sm hover:bg-subtle"
                @click="editOpen = false"
              >
                取消
              </button>
              <p v-if="editError" class="text-xs text-destructive">{{ editError }}</p>
            </div>
          </div>

          <p v-if="actionError" class="mt-3 text-xs text-destructive">{{ actionError }}</p>
        </Card>
      </PermissionGuard>

      <!-- 管理入口 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">管理操作</h2>
        <div class="space-y-1">
          <button
            v-for="item in [
              { label: '报名申请管理', desc: '查看和处理所有报名申请', icon: ClipboardList, path: 'applications' },
              { label: '面试排期管理', desc: '安排面试时段和面试官', icon: Users, path: 'interview' },
              { label: '评价与结论', desc: '评价申请人并发布结论', icon: FileText, path: 'review' },
              { label: '邀请管理', desc: '发送和管理录取邀请', icon: Mail, path: 'invitations' },
            ]"
            :key="item.path"
            class="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-subtle transition-colors text-left"
            @click="router.push(`/org/${route.params.clubId}/recruitment/${detail.id}/${item.path}`)"
          >
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary shrink-0">
              <component :is="item.icon" :size="18" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-text-primary">{{ item.label }}</p>
              <p class="text-xs text-text-secondary">{{ item.desc }}</p>
            </div>
            <ChevronRight :size="18" class="text-text-secondary" />
          </button>
        </div>
      </Card>

      <!-- 招新方向 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">招新方向</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="dept in detail.departments"
            :key="dept.id"
            class="inline-flex items-center px-3 py-1.5 rounded-md bg-subtle text-sm text-text-primary"
          >
            {{ dept.name }}
          </span>
        </div>
      </Card>

      <!-- 活动信息 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-3">活动信息</h2>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between">
            <dt class="text-text-secondary">报名截止</dt>
            <dd class="text-text-primary">{{ formatDeadline(detail.deadline) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">数据版本</dt>
            <dd class="text-text-primary">v{{ detail.version }}</dd>
          </div>
        </dl>
      </Card>

      <HighRiskConfirm
        v-model:open="riskOpen"
        :title="riskAction === 'complete' ? '结束招新活动' : '取消招新活动'"
        :description="riskAction === 'complete' ? '活动将进入已结束状态，报名通道关闭，已提交的申请将锁定。' : '活动将被取消，所有申请和面试安排将失效，此操作不可撤销。'"
        :targets="detail ? [{ id: detail.id, label: detail.title, detail: '影响全部报名与面试数据' }] : []"
        impact-summary="操作后活动状态不可自行恢复；取消仅限未发出邀请的活动。"
        confirm-label="确认执行"
        :executing="actionLoading"
        :error="actionError || null"
        @confirm="riskAction === 'complete' ? runAction('complete') : runAction('cancel', { reason: '社团主动取消', confirmAcceptedSync: true })"
      />
    </div>
  </PageStateBoundary>
</template>
