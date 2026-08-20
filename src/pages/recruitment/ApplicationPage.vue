<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, Button, ResponsiveActionRegion } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { toastAcceptedAction } from '@/utils/acceptedResult'
import { ArrowLeft, Save, Send, FileWarning, CheckCircle2, AlertTriangle, Archive, FileText } from '@lucide/vue'
import { applicationStatusLabel, isEditableStatus, terminalStatusHint } from '@/lib/recruitment-status'
import DynamicForm from '@/components/form/DynamicForm.vue'
import ObjectPicker from '@/components/form/ObjectPicker.vue'
import type { PickerGroup } from '@/components/form/ObjectPicker.vue'
import PreferenceSorter from '@/components/form/PreferenceSorter.vue'
import type { PreferenceEntry } from '@/components/form/PreferenceSorter.vue'
import type { FormField, FileMeta } from '@/types/domain/form'
import { fileBlockingError, isFieldFilled, restoredFieldValue, restoredFileMeta as restoredFileMetaFromLib, draftSafeFileMeta } from '@/lib/formFile'

interface ActivityDetail { id: string; title: string; clubName: string; deadline: string; departments: { id: string; name: string }[]; formId: string; allowAdjustmentDefault?: boolean }
interface MyApplication {
  status: string
  answers?: Record<string, unknown>
  preferences?: { departmentId: string; departmentName: string }[]
  allowAdjustment?: boolean
  submittedAt?: string | null
  recoveryWindowDeadline?: string | null
  withdrawBlockedReason?: string | null
  version?: number
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
const savingDraft = ref(false)

/** 草稿/已提交 answers 中 file 字段值兼容两种历史形态：fileId 字符串或 FileMeta[]（逻辑见 src/lib/formFile） */
const restoredFileMeta = restoredFileMetaFromLib

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
    // loadMyApplication 异常时已置 error 态，勿覆盖
    if (state.value === 'loading') state.value = 'normal'
  } else {
    // P3-3：取首个失败请求的错误码（任一失败即整页失败）
    state.value = errorToPageState(errorCodeOf(actRes.kind === 'completed' ? formRes : actRes))
  }
}

const myApplication = ref<MyApplication | null>(null)
const applyDenied = ref(false)
const withdrawing = ref(false)
const confirmWithdraw = ref(false)
let confirmWithdrawTimer: ReturnType<typeof setTimeout> | null = null

/** 仅已提交（可撤销）进入只读卡片；revision_requested 保留可编辑+重新提交，identity_anomaly 仅只读展示 */
const hasSubmitted = computed(() => myApplication.value?.status === 'submitted')
const hasArchived = computed(() => myApplication.value?.status === 'archived')
const hasReadonlyStatus = computed(() => ['submitted', 'identity_anomaly'].includes(myApplication.value?.status || ''))

/** 可编辑性统一走共享状态机：draft/revision_requested 可编辑，exited 恢复窗口内可重新提交（recovery_resubmit）；
 * 无报名资格（403）时始终不可编辑 */
const showApplyForm = computed(() => !applyDenied.value && isEditableStatus(myApplication.value))
const isTerminal = computed(() => !applyDenied.value && !showApplyForm.value)
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
  if (field?.type === 'file' || field?.type === 'image') return ''
  return renderAnswerValue(v)
}

/** 文件字段的 FileMeta 列表（兼容 fileId 字符串 / FileMeta[] 两种历史形态） */
function answerFiles(fieldId: string): FileMeta[] {
  const v = myApplication.value?.answers?.[fieldId]
  return restoredFileMetaFromLib(v)
}

/** 文件字段是否非空 */
function hasAnswerFiles(fieldId: string): boolean {
  return answerFiles(fieldId).length > 0
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
    } else if (result.kind === 'accepted') {
      toastAcceptedAction('撤销已受理，正在后台处理')
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
    // P2-34：重试/权限恢复后复位阻断态，避免表单永久隐藏
    applyDenied.value = false
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
    if (result.kind === 'rejected' && result.error.code === 'IFC-ERR-003') {
      // 无报名资格（403）：明确阻断表单填写并给出提示（Issue-4.0-2 不静默吞并）
      applyDenied.value = true
      return
    }
    // 网络/服务端异常等其余错误：不得静默当作"无申请"（避免覆盖已有草稿/申请），整页降级为可重试错误态
    state.value = errorToPageState(errorCodeOf(result))
  } catch {
    // 网络层异常：同样降级为可重试错误态，避免误判"无申请"
    state.value = 'error'
  }
}

function restoreDraft(app: MyApplication) {
  if (app.answers) {
    for (const [fieldId, value] of Object.entries(app.answers)) {
      const field = formFields.value.find((f) => f.id === fieldId)
      if (field?.type === 'file' || field?.type === 'image') {
        formData.value[fieldId] = restoredFileMeta(value)
        continue
      }
      const restored = restoredFieldValue(value, field?.type ?? '')
      if (restored !== undefined) formData.value[fieldId] = restored
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

async function handleSaveDraft() {
  if (!showApplyForm.value) return
  savingDraft.value = true
  // 瞬态附件（uploading 占位/checking 检查中）不得原样落库：uploading 丢弃、checking 降级 uploaded，
  // 否则重开草稿后会得到永远无法 auto-approve、无法移除、无法提交的卡死文件（见 draftSafeFileMeta）
  const draftAnswers: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(formData.value)) {
    const field = formFields.value.find((f) => f.id === fieldId)
    if (field?.type === 'file' || field?.type === 'image') {
      const safe = draftSafeFileMeta(value)
      if (safe !== undefined) draftAnswers[fieldId] = safe
      continue
    }
    draftAnswers[fieldId] = value
  }
  const result = await post(`/activity/recruitment/${route.params.activityId}/draft`, {
    answers: draftAnswers,
  }, { expectedVersion: myApplication.value?.version })
  savingDraft.value = false
  if (result.kind === 'completed') {
    const savedAt = (result.data as { savedAt?: string }).savedAt
    toast.success(savedAt ? `草稿已保存，保存时间 ${new Date(savedAt).toLocaleString()}` : '草稿已保存')
    // 更新本地版本号：下次保存基于新版本（P2-8 乐观锁）
    const data = result.data as { version?: number }
    if (data?.version && myApplication.value) myApplication.value.version = data.version
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('草稿已受理保存，正在后台处理')
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('草稿已在其他窗口被修改，已刷新恢复最新内容，请重新编辑')
    await loadMyApplication()
  } else {
    toast.error((result as { error?: { message?: string } }).error?.message || '草稿保存失败，请稍后重试')
  }
}

/** 必填判定按字段类型取值（逻辑见 src/lib/formFile）：file/image 以附件数组非空、number 以数值、multi_select/checkbox/array 以非空数组、其余以非空字符串为准 */
function isFilled(value: unknown, field: FormField): boolean {
  return isFieldFilled(value, field.type)
}

/** 附件状态拦截（逻辑见 src/lib/formFile）：检查中/上传中不可提交，被拒绝、隔离或删除需重新处理 */

async function handleSubmit() {
  if (!showApplyForm.value) return
  formErrors.value = {}
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
    toast.error('请至少选择一个意向方向')
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
  } else if (result.kind === 'accepted') {
    toastAcceptedAction('申请已受理，正在后台处理，请稍后刷新查看结果')
  } else if (result.kind === 'rejected') {
    toast.error(result.error.message)
  } else {
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

      <!-- 无报名资格（403）：阻断填写并明确提示，避免静默吞并成"无申请"（Issue-4.0-2） -->
      <Card v-if="applyDenied" class="mb-4">
        <div class="flex items-center gap-2 text-danger" role="alert">
          <AlertTriangle :size="18" />
          <p class="text-sm font-medium text-text-primary">当前账号无报名资格</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">报名仅面向在校学生开放，如确认符合条件请联系管理员核实账号状态。</p>
      </Card>

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
              <template v-if="field.type === 'file' || field.type === 'image'">
                <p v-if="hasAnswerFiles(field.id)" class="text-xs text-text-secondary">{{ field.label }}</p>
                <div v-if="hasAnswerFiles(field.id)" class="mt-1 space-y-1">
                  <router-link
                    v-for="(f) in answerFiles(field.id)"
                    :key="f.id"
                    :to="`/files/${f.id}`"
                    class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <FileText :size="14" /> {{ f.name || f.id }}
                  </router-link>
                </div>
              </template>
              <template v-else-if="answersOf(field.id)">
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
            :disabled="!!myApplication?.withdrawBlockedReason"
            @click="requestWithdrawConfirm"
          >
            <Save :size="14" /> {{ withdrawing ? '撤销中...' : confirmWithdraw ? '再次点击确认撤销' : '撤销提交' }}
          </Button>
          <p v-if="hasSubmitted && myApplication?.withdrawBlockedReason" class="text-xs text-danger mt-2">{{ myApplication.withdrawBlockedReason }}</p>
          <p v-else-if="hasSubmitted" class="text-xs text-text-secondary mt-2">撤销后报名内容将保留为草稿，可修改后重新提交。</p>
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
        <DynamicForm
          :fields="formFields"
          v-model="formData"
          :field-errors="formErrors"
          @update:field-errors="formErrors = $event"
        />
      </Card>

      <!-- 错误提示：操作结果反馈统一走 toast（字段级校验由 formErrors 承载） -->

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
