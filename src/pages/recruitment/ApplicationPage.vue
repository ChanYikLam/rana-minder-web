<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, Button, ResponsiveActionRegion } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Save, Send, FileWarning, CheckCircle2, AlertTriangle, Archive } from '@lucide/vue'
import { applicationStatusLabel, isEditableStatus, terminalStatusHint } from '@/lib/recruitment-status'
import DynamicForm from '@/components/form/DynamicForm.vue'
import ObjectPicker from '@/components/form/ObjectPicker.vue'
import type { PickerGroup } from '@/components/form/ObjectPicker.vue'
import PreferenceSorter from '@/components/form/PreferenceSorter.vue'
import type { PreferenceEntry } from '@/components/form/PreferenceSorter.vue'
import type { FormField, FileMeta } from '@/types/domain/form'

interface ActivityDetail { id: string; title: string; clubName: string; deadline: string; departments: { id: string; name: string }[]; formId: string; allowAdjustmentDefault?: boolean }
interface MyApplication {
  status: string
  answers?: Record<string, unknown>
  preferences?: { departmentId: string; departmentName: string }[]
  allowAdjustment?: boolean
  submittedAt?: string | null
  recoveryWindowDeadline?: string | null
}

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const activity = ref<ActivityDetail | null>(null)
const formFields = ref<FormField[]>([])

const formData = ref<Record<string, unknown>>({})
const formErrors = ref<Record<string, string[]>>({})
const preferences = ref<{ departmentId: string; departmentName: string }[]>([])
const allowAdjustment = ref(true)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const savedDraft = ref(false)
const savingDraft = ref(false)

/** 草稿/已提交 answers 中 file 字段值兼容两种历史形态：fileId 字符串或 FileMeta[] */
function restoredFileMeta(value: unknown): FileMeta[] {
  if (Array.isArray(value)) {
    return value.map((v): FileMeta => (typeof v === 'object' && v !== null ? (v as FileMeta) : restoredFileMeta(v)[0])).filter(Boolean)
  }
  if (typeof value !== 'string' || value === '') return []
  // 历史 fileId 字符串回填：不宣称已通过安全检测（无真实元数据），以中性态 uploaded 展示
  return [{ id: value, name: '已上传附件', size: 0, mimeType: '', status: 'uploaded', uploadedAt: '', checkedAt: null, downloadUrl: null }]
}

async function loadData() {
  state.value = 'loading'
  const id = route.params.activityId as string
  const [actRes, formRes] = await Promise.all([
    get<ActivityDetail>(`/explore/activities/${id}`),
    get<{ versions: { fields: FormField[] }[] }>(`/explore/activities/${id}/form`),
  ])
  if (actRes.kind === 'completed' && formRes.kind === 'completed') {
    activity.value = actRes.data
    allowAdjustment.value = actRes.data.allowAdjustmentDefault !== false
    const versions = (formRes as { kind: 'completed'; data: { versions: { fields: FormField[] }[] } }).data.versions
    formFields.value = versions[0]?.fields || []
    await loadMyApplication()
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

const myApplication = ref<MyApplication | null>(null)
const withdrawing = ref(false)
const confirmWithdraw = ref(false)
let confirmWithdrawTimer: ReturnType<typeof setTimeout> | null = null

/** 仅已提交（可撤销）进入只读卡片；revision_requested 保留可编辑+重新提交，identity_anomaly 仅只读展示 */
const hasSubmitted = computed(() => myApplication.value?.status === 'submitted')
const hasArchived = computed(() => myApplication.value?.status === 'archived')
const hasReadonlyStatus = computed(() => ['submitted', 'identity_anomaly'].includes(myApplication.value?.status || ''))

/** 可编辑性统一走共享状态机：draft/revision_requested 可编辑，exited 恢复窗口内可重新提交（recovery_resubmit） */
const showApplyForm = computed(() => isEditableStatus(myApplication.value))
const isTerminal = computed(() => !showApplyForm.value)
const recoveryWindowDeadline = computed(() => myApplication.value?.recoveryWindowDeadline || null)

function renderAnswerValue(v: unknown): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.map(renderAnswerValue).filter(Boolean).join('、')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function answersOf(fieldId: string): string {
  const v = myApplication.value?.answers?.[fieldId]
  if (v == null || v === '') return ''
  const field = formFields.value.find((f) => f.id === fieldId)
  if (field?.type === 'file') return '已上传附件'
  return renderAnswerValue(v)
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 撤销报名提交：先点击进入确认态，5 秒内再次点击才执行（与联合报名一致，避免 iframe/沙箱禁用 window.confirm） */
function requestWithdrawConfirm() {
  if (withdrawing.value) return
  if (!confirmWithdraw.value) {
    confirmWithdraw.value = true
    if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
    confirmWithdrawTimer = setTimeout(() => {
      confirmWithdraw.value = false
    }, 5000)
    return
  }
  if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
  confirmWithdraw.value = false
  void handleWithdraw()
}

/** 撤销提交回到草稿（服务端 SM-REC-003 submitted→draft），可修改后重新提交 */
async function handleWithdraw() {
  if (withdrawing.value) return
  withdrawing.value = true
  try {
    const result = await post(`/activity/recruitment/${route.params.activityId}/apply/withdraw`, {})
    if (result.kind === 'completed') {
      toast.success('已撤销提交，可修改后重新提交')
      await loadData()
    } else if (result.kind === 'rejected' && result.error) {
      toast.error((result.error as { message?: string }).message || '撤销失败，请稍后重试')
    } else {
      toast.error('撤销失败，请稍后重试')
    }
  } finally {
    withdrawing.value = false
  }
}

/** 加载已有申请记录，恢复草稿或展示已提交/已归档状态 */
async function loadMyApplication() {
  try {
    const result = await get<MyApplication>(`/activity/recruitment/${route.params.activityId}/apply`)
    if (result.kind === 'completed') {
      myApplication.value = result.data
      // draft / revision_requested / exited（恢复窗口内）均可继续编辑，回填已填内容
      if (isEditableStatus(result.data)) {
        restoreDraft(result.data)
      }
      return
    }
    if (result.kind === 'rejected' && result.error.code === 'IFC-ERR-015') {
      // 尚未创建申请：视为无申请，可正常填写提交
      myApplication.value = null
      return
    }
    // 其他拒绝/错误（如无权限）不影响表单填写
    myApplication.value = null
  } catch {
    // 忽略：草稿恢复失败不影响表单填写
  }
}

function restoreDraft(app: MyApplication) {
  if (app.answers) {
    for (const [fieldId, value] of Object.entries(app.answers)) {
      const field = formFields.value.find((f) => f.id === fieldId)
      if (field?.type === 'file' || field?.type === 'image') {
        formData.value[fieldId] = restoredFileMeta(value)
      } else if (typeof value === 'string') {
        formData.value[fieldId] = value
      }
    }
  }
  if (app.preferences) {
    preferences.value = app.preferences.map((p) => ({ departmentId: p.departmentId, departmentName: p.departmentName }))
  }
  if (app.allowAdjustment !== undefined) {
    allowAdjustment.value = app.allowAdjustment
  }
}

/** 意向方向：PreferenceSorter 排序条目（保持部门 id → 名称映射） */
const preferenceEntries = computed<PreferenceEntry[]>({
  get: () => preferences.value.map((p) => ({ id: p.departmentId, label: p.departmentName })),
  set: (entries) => {
    preferences.value = entries.map((e) => {
      const dept = activity.value?.departments.find((d) => d.id === e.id)
      return { departmentId: e.id, departmentName: dept?.name ?? e.label }
    })
  },
})

/** ObjectPicker 分组：本活动全部部门，多选切换已选/未选 */
const deptPickerGroups = computed<PickerGroup[]>(() =>
  activity.value
    ? [{ type: 'department', label: '意向部门', items: activity.value.departments.map((d) => ({ id: d.id, label: d.name })) }]
    : [],
)

const selectedDeptIds = computed<string[]>(() => preferences.value.map((p) => p.departmentId))

function onPickDepartments(ids: string[]) {
  const depts = activity.value?.departments ?? []
  const selected = new Set(ids)
  const kept = preferences.value.filter((p) => selected.has(p.departmentId))
  const existing = new Set(preferences.value.map((p) => p.departmentId))
  const added = depts
    .filter((d) => selected.has(d.id) && !existing.has(d.id))
    .map((d) => ({ departmentId: d.id, departmentName: d.name }))
  preferences.value = [...kept, ...added]
}

watch([formData, preferences], () => {
  savedDraft.value = false
}, { deep: true })

async function handleSaveDraft() {
  if (!showApplyForm.value) return
  savingDraft.value = true
  const result = await post(`/activity/recruitment/${route.params.activityId}/draft`, {
    answers: { ...formData.value },
  })
  savingDraft.value = false
  if (result.kind === 'completed') {
    const savedAt = (result.data as { savedAt?: string }).savedAt
    savedDraft.value = true
    toast.success(savedAt ? `草稿已保存，保存时间 ${new Date(savedAt).toLocaleString()}` : '草稿已保存')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

/** 必填判定按字段类型取值：file/image 以附件数组非空为准，其余以非空字符串为准 */
function isFilled(value: unknown, field: FormField): boolean {
  if (field.type === 'file' || field.type === 'image') {
    return Array.isArray(value) && value.length > 0
  }
  return typeof value === 'string' && value.trim() !== ''
}

/** 附件状态拦截：检查中/上传中不可提交，被拒绝、隔离或删除需重新处理 */
function fileBlockingError(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const f of value as FileMeta[]) {
    if (f.status === 'checking' || f.status === 'uploading') return '文件安全检查中，请稍候再提交'
    if (f.status === 'rejected') return '文件上传失败，请重新上传'
    if (f.status === 'quarantined') return '附件疑似恶意内容已隔离，请联系管理员处理'
    if (f.status === 'deleted') return '文件已移除，请重新上传'
  }
  return null
}

async function handleSubmit() {
  if (!showApplyForm.value) return
  formErrors.value = {}
  submitError.value = null

  for (const field of formFields.value) {
    const value = formData.value[field.id]
    if (field.required && !isFilled(value, field)) {
      formErrors.value[field.id] = [`${field.label}为必填项`]
    }
    if (field.type === 'file' || field.type === 'image') {
      const msg = fileBlockingError(value)
      if (msg) {
        formErrors.value[field.id] = [...(formErrors.value[field.id] ?? []), msg]
      }
    }
  }
  if (preferences.value.length === 0) {
    submitError.value = '请至少选择一个意向方向'
    return
  }
  if (Object.keys(formErrors.value).length > 0) return

  submitting.value = true
  const result = await post('/activity/recruitment/' + route.params.activityId + '/apply', {
    answers: { ...formData.value },
    preferences: preferences.value,
    allowAdjustment: allowAdjustment.value,
  })
  submitting.value = false

  if (result.kind === 'completed') {
    router.push('/me/ongoing')
  } else if (result.kind === 'rejected') {
    submitError.value = result.error.message
    toast.error(result.error.message)
  } else {
    submitError.value = '提交失败，请稍后重试'
    toast.error('提交失败，请稍后重试')
  }
}

// 暴露提交/保存入口供组件测试验证终态守卫
defineExpose({ handleSaveDraft, handleSubmit })

onMounted(loadData)

onUnmounted(() => {
  if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
})
</script>

<template>
  <PageStateBoundary :state="state" title="报名申请" @retry="loadData">
    <div v-if="activity" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ activity.title }}</h1>
      <p class="text-sm text-text-secondary mb-6">{{ activity.clubName }} · 报名申请</p>

      <!-- 非可编辑终态（已提交/身份异常、已归档、其他终态互斥展示）；仅 submitted 可撤销（与联合报名一致） -->
      <Card v-if="isTerminal" class="mb-4">
        <!-- 已提交/身份异常：只读回显本人填写内容，仅 submitted 可撤销 -->
        <template v-if="hasReadonlyStatus">
          <div
            v-if="myApplication?.status === 'identity_anomaly'"
            class="flex items-center gap-2 text-warning"
            role="alert"
          >
            <FileWarning :size="18" />
            <p class="text-sm font-medium text-text-primary">身份异常，请联系管理员处理</p>
          </div>
          <div v-else class="flex items-center gap-2 text-success">
            <CheckCircle2 :size="18" />
            <p class="text-sm font-medium text-text-primary">您已提交报名</p>
          </div>
          <p class="text-xs text-text-secondary mt-1">当前状态：{{ applicationStatusLabel(myApplication?.status || '') }}</p>
          <p v-if="myApplication?.status === 'identity_anomaly'" class="text-xs text-text-secondary mt-1">该状态下不可编辑或提交报名</p>

          <div class="mt-4 border-t border-border pt-3 space-y-2.5">
            <p class="text-sm font-medium text-text-primary">您的报名详情</p>
            <div v-for="field in formFields" :key="field.id">
              <template v-if="answersOf(field.id)">
                <p class="text-xs text-text-secondary">{{ field.label }}</p>
                <p class="text-sm text-text-primary whitespace-pre-wrap">{{ answersOf(field.id) }}</p>
              </template>
            </div>
            <div v-if="myApplication?.preferences?.length">
              <p class="text-xs text-text-secondary">意向方向（按优先级）</p>
              <p class="text-sm text-text-primary">{{ myApplication.preferences.map((p, i) => `${i + 1}. ${p.departmentName}`).join('、') }}</p>
            </div>
            <div>
              <p class="text-xs text-text-secondary">服从调剂</p>
              <p class="text-sm text-text-primary">{{ myApplication?.allowAdjustment ? '是' : '否' }}</p>
            </div>
            <div v-if="myApplication?.submittedAt">
              <p class="text-xs text-text-secondary">提交时间</p>
              <p class="text-sm text-text-primary">{{ formatDateTime(myApplication.submittedAt) }}</p>
            </div>
          </div>

          <Button
            v-if="hasSubmitted"
            variant="outline"
            class="mt-4 w-full"
            :class="confirmWithdraw ? '!text-danger !border-danger' : ''"
            :loading="withdrawing"
            @click="requestWithdrawConfirm"
          >
            <Save :size="14" /> {{ withdrawing ? '撤销中...' : confirmWithdraw ? '再次点击确认撤销' : '撤销提交' }}
          </Button>
          <p v-if="hasSubmitted" class="text-xs text-text-secondary mt-2">撤销后报名内容将保留为草稿，可修改后重新提交。</p>
        </template>

        <!-- 已归档态 -->
        <template v-else-if="hasArchived">
          <div class="flex items-center gap-2 text-text-secondary">
            <Archive :size="18" />
            <p class="text-sm font-medium text-text-primary">您的报名申请已归档</p>
          </div>
          <p class="text-xs text-text-secondary mt-1">当前状态：{{ applicationStatusLabel(myApplication?.status ?? '') }}</p>
        </template>

        <!-- 其他终态（exited 无恢复窗口/窗口过期、adjustment_overdue、not_qualified、accepted 等） -->
        <template v-else>
          <div class="flex items-center gap-2 text-text-secondary">
            <AlertTriangle :size="18" />
            <p class="text-sm font-medium text-text-primary">当前申请状态：{{ applicationStatusLabel(myApplication?.status ?? '') }}</p>
          </div>
          <p class="text-xs text-text-secondary mt-1">{{ terminalStatusHint(myApplication?.status ?? '') }}</p>
        </template>
      </Card>

      <!-- 需补充材料：可编辑并重新提交 -->
      <div v-else-if="myApplication?.status === 'revision_requested'" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您的报名需补充材料（状态：{{ applicationStatusLabel(myApplication.status) }}），请修改后重新提交</p>
        <p class="text-xs text-text-secondary mt-1">请完善下方报名内容后重新提交，已填内容已为您保留。</p>
      </div>

      <!-- 恢复窗口期内重新提交（exited 但窗口未过期，SM-REC-003 recovery_resubmit） -->
      <div v-else-if="myApplication?.status === 'exited'" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您已退出招新，恢复窗口期内可重新提交报名（状态：{{ applicationStatusLabel(myApplication.status) }}）</p>
        <p v-if="recoveryWindowDeadline" class="text-xs text-text-secondary mt-1">请在 {{ formatDateTime(recoveryWindowDeadline) }} 前完善内容并重新提交。</p>
      </div>

      <!-- 草稿提示 -->
      <div v-else-if="myApplication?.status === 'draft'" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您有已保存的草稿（状态：{{ applicationStatusLabel(myApplication.status) }}），可继续修改后提交</p>
        <p class="text-xs text-text-secondary mt-1">暂存草稿会覆盖此前保存的内容</p>
      </div>

      <!-- 意向方向排序（已提交/已归档/终态后隐藏，展示只读卡片） -->
      <Card v-if="showApplyForm" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2">意向方向</h2>
        <p class="text-xs text-text-secondary mb-3">搜索并点击添加意向部门；已选部门按优先级排序，可用按钮或键盘（上/下/Delete）调整</p>

        <ObjectPicker :groups="deptPickerGroups" multiple :model-value="selectedDeptIds" @update:model-value="onPickDepartments" />

        <div class="mt-3">
          <PreferenceSorter v-model="preferenceEntries" />
        </div>

        <label class="flex items-center gap-2 mt-4 cursor-pointer">
          <input v-model="allowAdjustment" type="checkbox" class="w-4 h-4 accent-primary" />
          <span class="text-sm text-text-primary">服从调剂</span>
          <span class="text-xs text-text-secondary">未被任一意向方向录取时，接受调剂到其他方向</span>
        </label>
      </Card>

      <!-- 动态表单（已提交/已归档/终态后隐藏，展示只读卡片） -->
      <Card v-if="showApplyForm" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">报名表单</h2>
        <DynamicForm :fields="formFields" v-model="formData" :field-errors="formErrors" />
      </Card>

      <!-- 错误提示 -->
      <p v-if="submitError && showApplyForm" class="text-sm text-danger mb-4" role="alert">{{ submitError }}</p>
      <p v-if="savedDraft && showApplyForm" class="text-sm text-success mb-4" role="status">草稿已保存</p>

      <!-- 操作区（已提交/已归档/终态后隐藏） -->
      <ResponsiveActionRegion v-if="showApplyForm" page-family="form">
        <Button variant="outline" :loading="savingDraft" @click="handleSaveDraft">
          <Save :size="16" /> {{ savingDraft ? '保存中...' : '保存草稿' }}
        </Button>
        <Button class="flex-1 md:flex-none" :loading="submitting" @click="handleSubmit">
          <Send :size="16" /> {{ submitting ? '提交中...' : myApplication?.status === 'revision_requested' ? '重新提交' : '提交报名' }}
        </Button>
      </ResponsiveActionRegion>
    </div>
  </PageStateBoundary>
</template>
