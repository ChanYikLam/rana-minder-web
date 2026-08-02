<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import { ApplicantCard, type ApplicantEntry } from '@/components/display'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { ArrowLeft, ChevronDown } from '@lucide/vue'

interface Application {
  id: string; activityId: string; applicantId: string
  applicantName: string; applicantStudentId: string
  status: string
  preferences: { order: number; departmentId: string; departmentName: string }[]
  submittedAt: string | null; withdrawnAt: string | null; formVersion: number
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const items = ref<Application[]>([])
const activeStatus = ref('all')
const expandedId = ref<string | null>(null)
const actionBusy = ref(false)
const actionError = ref<Record<string, string>>({})
const deptInput = ref<Record<string, string>>({})
const textInput = ref<Record<string, string>>({})
const deadlineInput = ref<Record<string, string>>({})

const statusTabs = [
  { value: 'all', label: '全部' },
  { value: 'submitted', label: '已提交' },
  { value: 'under_review', label: '审核中' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'draft', label: '草稿' },
]

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const activityId = route.params.activityId as string
  const query = activeStatus.value !== 'all' ? `?status=${activeStatus.value}` : ''
  const result = await get<{ items: Application[] }>(`/org/${clubId}/recruitment/${activityId}/applications${query}`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: Application[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function switchStatus(s: string) {
  if (s === activeStatus.value) return
  activeStatus.value = s
  loadData()
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
  actionError.value[id] = ''
}

function toApplicantEntry(app: Application): ApplicantEntry {
  return {
    id: app.id,
    name: app.applicantName,
    studentId: app.applicantStudentId,
    status: app.status,
    preferences: app.preferences.map((p, i) => ({ order: p.order || i + 1, departmentName: p.departmentName })),
    appliedAt: app.submittedAt ?? undefined,
  }
}

async function runAppAction(app: Application, action: string, input?: Record<string, unknown>) {
  if (actionBusy.value) return
  actionBusy.value = true
  actionError.value[app.id] = ''
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/recruitment/${app.activityId}/applications/${app.applicantId}/${action}`, { ...(input || {}) })
  actionBusy.value = false
  if (result.kind === 'completed') {
    expandedId.value = null
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value[app.id] = (result.error as { message?: string }).message || '操作失败'
  }
}

async function runPathAction(app: Application, action: 'decision' | 'waitlist' | 'publish' | 'label', decision?: string, label?: boolean) {
  if (actionBusy.value) return
  actionBusy.value = true
  actionError.value[app.id] = ''
  const clubId = route.params.clubId as string
  const deptId = deptInput.value[app.id] || app.preferences[0]?.departmentId
  if (!deptId) {
    actionError.value[app.id] = '请选择部门'
    actionBusy.value = false
    return
  }
  const result = await post(`/org/${clubId}/recruitment/${app.activityId}/applications/${app.applicantId}/paths/${deptId}/${action}`, decision ? { decision } : action === 'label' ? { label: label ?? true } : {})
  actionBusy.value = false
  if (result.kind === 'completed') {
    expandedId.value = null
    await loadData()
  } else if (result.kind === 'rejected' && result.error) {
    actionError.value[app.id] = (result.error as { message?: string }).message || '操作失败'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="报名申请管理" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">报名申请管理</h1>
      <p class="text-sm text-text-secondary mb-6">查看和处理本活动的所有报名申请</p>

      <!-- 状态筛选 -->
      <div class="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="申请状态筛选">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="px-3 h-8 rounded-md text-sm transition-colors"
          :class="activeStatus === tab.value ? 'bg-primary text-text-on-primary font-medium' : 'bg-subtle text-text-secondary hover:text-primary'"
          @click="switchStatus(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <EmptyState
        v-if="items.length === 0"
        type="no_data"
        title="暂无符合条件的申请"
        description="可以切换其他状态筛选查看"
      />

      <div v-else class="space-y-3">
        <Card v-for="app in items" :key="app.id" padding="p-4">
          <ApplicantCard :applicant="toApplicantEntry(app)" />

          <!-- 审核操作 -->
          <PermissionGuard permission="club:recruitment:manage">
            <div class="mt-3 pt-3 border-t border-border">
              <button class="flex items-center gap-1 text-xs font-medium text-primary hover:underline" @click="toggleExpand(app.id)">
                <ChevronDown :size="14" :class="expandedId === app.id ? 'rotate-180' : ''" /> 审核操作
              </button>

              <div v-if="expandedId === app.id" class="mt-3 space-y-3">
                <div v-if="app.status === 'exited'" class="flex flex-wrap items-center gap-2">
                  <input
                    v-model="deadlineInput[app.id]"
                    class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="恢复窗口截止（ISO）"
                  />
                  <button
                    class="px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runAppAction(app, 'recovery-window', { deadline: deadlineInput[app.id] || '2026-09-20T23:59:00+08:00' })"
                  >
                    创建恢复窗口
                  </button>
                </div>

                <div v-if="['submitted', 'revision_requested'].includes(app.status)" class="flex flex-wrap items-center gap-2">
                  <input
                    v-model="textInput[app.id]"
                    class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="补充要求"
                  />
                  <input
                    v-model="deadlineInput[app.id]"
                    class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="补充截止（ISO）"
                  />
                  <button
                    v-if="app.status === 'submitted'"
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runAppAction(app, 'supplement', { requirement: textInput[app.id] || '补充材料', deadline: deadlineInput[app.id] || '2026-09-25T23:59:00+08:00' })"
                  >
                    要求补充
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runAppAction(app, 'identity-anomaly')"
                  >
                    标记身份异常
                  </button>
                </div>

                <div v-if="app.status === 'identity_anomaly'" class="flex flex-wrap items-center gap-2">
                  <button
                    class="px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runAppAction(app, 'identity-anomaly/recover')"
                  >
                    恢复身份
                  </button>
                  <input
                    v-model="textInput[app.id]"
                    class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                    placeholder="不通过原因"
                  />
                  <button
                    class="px-3 h-8 rounded-md bg-destructive text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runAppAction(app, 'not-qualified', { reason: textInput[app.id] || '不符合录用条件' })"
                  >
                    公布不通过
                  </button>
                </div>

                <div v-if="['submitted', 'revision_requested'].includes(app.status)" class="flex flex-wrap items-center gap-2">
                  <select
                    v-model="deptInput[app.id]"
                    class="px-2 h-8 rounded-md border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                  >
                    <option v-for="p in app.preferences" :key="p.departmentId" :value="p.departmentId">
                      第{{ p.order }}志愿 · {{ p.departmentName }}
                    </option>
                  </select>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runPathAction(app, 'decision', 'admit')"
                  >
                    决定录取
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runPathAction(app, 'decision', 'not_admit')"
                  >
                    决定不录取
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runPathAction(app, 'waitlist')"
                  >
                    设为候补
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-subtle text-text-primary text-xs font-medium hover:bg-muted disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runPathAction(app, 'label')"
                  >
                    标记意向
                  </button>
                  <button
                    class="px-3 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                    :disabled="actionBusy"
                    @click="runPathAction(app, 'publish')"
                  >
                    发布结论
                  </button>
                </div>

                <p v-if="actionError[app.id]" class="text-xs text-destructive">{{ actionError[app.id] }}</p>
              </div>
            </div>
          </PermissionGuard>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
