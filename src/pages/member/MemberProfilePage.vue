<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { get } from '@/services/client'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { Calendar, Mail, Phone, Building2, Clock, AlertTriangle, History, ArrowLeft } from '@lucide/vue'

interface MemberDetail {
  id: string; studentId: string; name: string; email: string; phone: string
  status: string; joinedAt: string; exitedAt: string | null
  positions: { id: string; departmentName: string; title: string; startDate: string; endDate: string | null; status: string }[]
  tenures: { id: string; departmentName: string; title: string; startDate: string; endDate: string | null; endReason: string | null }[]
  departmentHistory: { id: string; action: string; departmentName: string; at: string }[]
  anomalies: { id: string; kind: string; message: string; createdAt: string }[]
  historyMemberships: { id: string; name: string; joinedAt: string; exitedAt: string | null; status: string }[]
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const pageError = ref<{ code: string; message: string; supportId?: string } | null>(null)
const member = ref<MemberDetail | null>(null)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const memberId = route.params.memberId as string
  const result = await get<MemberDetail>(`/org/${clubId}/members/${memberId}`)
  if (result.kind === 'completed') {
    member.value = result.data
    if (result.data) {
      state.value = 'normal'
    } else {
      state.value = 'empty'
    }
  } else if (result.kind === 'accepted') {
    // P1-1：202/IFC-ERR-014 异步受理（数据生成中）不再永久卡 loading，降级为可重试的 error 态
    state.value = 'error'
    pageError.value = { code: 'IFC-ERR-014', message: '数据正在生成中，请稍后重试' }
  } else {
    const code = result.error.code as ErrorCode
    pageError.value = { code, message: ERROR_MESSAGES[code] ?? result.error.message, supportId: result.error.supportId }
    state.value = errorToPageState(code)
  }
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function actionLabel(a: string): string {
  return { join: '加入', leave: '退出', transfer: '调岗', appoint: '任命', promote: '晋升', dismiss: '免职' }[a] ?? a
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="成员经历" :error="pageError" @retry="loadData">
    <div v-if="member" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.push(`/org/${route.params.clubId}/members`)">
        <ArrowLeft :size="16" /> 返回成员列表
      </button>
      <!-- 成员头部 -->
      <Card class="mb-4">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-text-on-primary text-lg font-medium">{{ member.name.charAt(0) }}</div>
            <div>
              <h1 class="text-xl font-bold text-text-primary">{{ member.name }}</h1>
              <p class="text-sm text-text-secondary">{{ member.studentId }}</p>
            </div>
          </div>
          <StateTag :status="member.status" />
        </div>
        <p class="text-xs text-text-secondary mb-3">当前成员关系由 Casdoor Group 权威维护，本页面记录任期、异动与审批历史。</p>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="flex items-center gap-2 text-text-secondary"><Mail :size="16" /> {{ member.email }}</div>
          <div class="flex items-center gap-2 text-text-secondary"><Phone :size="16" /> {{ member.phone }}</div>
          <div class="flex items-center gap-2 text-text-secondary"><Calendar :size="16" /> 加入于 {{ formatDate(member.joinedAt) }}</div>
          <div v-if="member.exitedAt" class="flex items-center gap-2 text-text-secondary"><Clock :size="16" /> 退出于 {{ formatDate(member.exitedAt) }}</div>
        </div>
      </Card>

      <!-- 当前职位 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">当前职位</h2>
        <div class="space-y-2">
          <div v-for="pos in member.positions.filter((p) => p.status === 'active')" :key="pos.id" class="flex items-center justify-between rounded-lg border border-border p-3">
            <div class="flex items-center gap-2">
              <Building2 :size="16" class="text-text-secondary" />
              <span class="text-sm text-text-primary">{{ pos.departmentName }} · {{ pos.title }}</span>
              <!-- MEM-012: 计划任期结束不触发自动卸任，在任者仍显示"在任" -->
              <StateTag :status="pos.status === 'active' ? 'active' : pos.status" :label="pos.status === 'active' ? '在任' : undefined" />
            </div>
            <span class="text-xs text-text-secondary">自 {{ formatDate(pos.startDate) }}</span>
          </div>
          <p v-if="member.positions.filter((p) => p.status === 'active').length === 0" class="text-sm text-text-secondary text-center py-2">无活跃职位</p>
        </div>
        <!-- MEM-014: 计划任期只用于内部提醒，不改变前台展示 -->
        <p class="text-xs text-text-secondary mt-2">注：计划任期结束时间仅用于换届规划提醒，不触发自动卸任</p>
      </Card>

      <!-- 数据异常（Casdoor 不一致等） -->
      <Card v-if="member.anomalies.length > 0" class="mb-4 border-warning">
        <h2 class="text-base font-medium text-warning mb-3 flex items-center gap-2">
          <AlertTriangle :size="16" /> 数据异常
        </h2>
        <div class="space-y-2">
          <div v-for="an in member.anomalies" :key="an.id" class="rounded-lg bg-warning-subtle p-3">
            <p class="text-xs text-warning">{{ an.message }}</p>
            <p class="text-xs text-text-secondary mt-0.5">发现于 {{ formatDate(an.createdAt) }}</p>
          </div>
        </div>
        <PermissionGuard permission="club:audit:view" scope="workspace">
          <button class="mt-3 px-3 h-8 rounded-md border border-warning text-warning text-xs hover:bg-warning-subtle" @click="router.push(`/org/${route.params.clubId}/audit/corrections`)">
            去处理
          </button>
        </PermissionGuard>
      </Card>

      <!-- 部门经历 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <History :size="16" /> 部门经历
        </h2>
        <div class="space-y-2">
          <div v-for="h in member.departmentHistory" :key="h.id" class="flex items-center gap-2 text-sm">
            <span class="text-xs px-1.5 py-0.5 rounded bg-subtle text-text-secondary">{{ actionLabel(h.action) }}</span>
            <span class="text-text-primary">{{ h.departmentName }}</span>
            <span class="text-xs text-text-secondary ml-auto">{{ formatDate(h.at) }}</span>
          </div>
          <p v-if="member.departmentHistory.length === 0" class="text-sm text-text-secondary text-center py-2">暂无部门经历</p>
        </div>
      </Card>

      <!-- 任期历史 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-3">任期历史</h2>
        <div class="relative pl-4 border-l-2 border-border space-y-4">
          <div v-for="tenure in member.tenures" :key="tenure.id" class="relative">
            <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary" />
            <p class="text-sm font-medium text-text-primary">{{ tenure.departmentName }} · {{ tenure.title }}</p>
            <p class="text-xs text-text-secondary mt-0.5">
              {{ formatDate(tenure.startDate) }} - {{ tenure.endDate ? formatDate(tenure.endDate) : '至今' }}
            </p>
            <p v-if="tenure.endReason" class="text-xs text-text-secondary mt-0.5">原因：{{ tenure.endReason }}</p>
          </div>
        </div>
      </Card>

      <!-- MEM-007: 历史成员分段（同学生账号的过往经历，供重新加入时间线还原） -->
      <Card v-if="(member.historyMemberships ?? []).length > 0" class="mt-4 border-warning">
        <h2 class="text-base font-medium text-warning mb-3 flex items-center gap-2">
          <History :size="16" /> 历史成员身份
        </h2>
        <p class="text-xs text-text-secondary mb-3">同学生账号在社团中的历史成员记录（分段存档，不并入当前任期）。</p>
        <div class="space-y-2">
          <div v-for="h in member.historyMemberships" :key="h.id" class="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p class="text-sm text-text-primary">{{ h.name }} <StateTag :status="h.status" class="ml-2" /></p>
              <p class="text-xs text-text-secondary mt-0.5">加入于 {{ formatDate(h.joinedAt) }}{{ h.exitedAt ? ` · 退出于 ${formatDate(h.exitedAt)}` : '' }}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </PageStateBoundary>
</template>
