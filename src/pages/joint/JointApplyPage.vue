<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Users, Send, Save, CheckCircle2, Archive, AlertTriangle } from '@lucide/vue'
import { applicationStatusLabel, isEditableStatus } from '@/lib/recruitment-status'
import DynamicForm from '@/components/form/DynamicForm.vue'
import ObjectPicker from '@/components/form/ObjectPicker.vue'
import type { PickerGroup } from '@/components/form/ObjectPicker.vue'
import PreferenceSorter from '@/components/form/PreferenceSorter.vue'
import type { PreferenceEntry } from '@/components/form/PreferenceSorter.vue'
import type { FormField } from '@/types/domain/form'
import { restoredFileMeta as restoredFileMetaFromLib, draftSafeFileMeta } from '@/lib/formFile'
import {
  buildSubmitPayload,
  channelStatusMeta,
  clubNamesOf as jointClubNamesOf,
  renderAnswerValue as renderAnswer,
  restoreDraftState,
  toggleVolunteer as jointToggleVolunteer,
  validateJointForm,
} from '@/lib/jointApplyLogic'

interface JointDetail {
  title: string
  clubName: string
  participants: { id: string; name: string }[]
  clubs?: { id: string; name: string; departments: { id: string; name: string }[] }[]
  description: string
  channelStatus?: string
  deadline?: string
  sharedAgreement?: { version: number; text: string }
}

interface MyApplication {
  status: string
  answers?: Record<string, unknown>
  volunteerClubIds?: string[]
  volunteerClubSnapshot?: string[]
  preferences?: { departmentId: string; departmentName: string }[]
  allowJointAdjustment?: boolean
  consented?: boolean
  submittedAt?: string | null
  withdrawBlockedReason?: string | null
  version?: number
}

const CHANNEL_STATUS_TONE_CLASS: Record<string, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-subtle text-text-secondary',
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const detail = ref<JointDetail | null>(null)
const myApplication = ref<MyApplication | null>(null)
const formFields = ref<FormField[]>([])

const formData = ref<Record<string, unknown>>({})
const formErrors = ref<Record<string, string>>({})
const consented = ref(false)
const allowJointAdjustment = ref(false)
const volunteerClubIds = ref<string[]>([])
const preferences = ref<{ departmentId: string; departmentName: string }[]>([])
const submitting = ref(false)
const withdrawing = ref(false)
const confirmWithdraw = ref(false)
let confirmWithdrawTimer: ReturnType<typeof setTimeout> | null = null

/** 仅当申请状态为 submitted 才算“已提交”，草稿（draft）用户仍可继续填写/提交；archived 视为流程已结束不再可提交（可编辑性统一走共享状态机） */
const hasSubmitted = computed(() => myApplication.value?.status === 'submitted')
const hasArchived = computed(() => myApplication.value?.status === 'archived')
/** 无报名资格（403）：阻断填写并给出提示，与普通招新 ApplicationPage 的 applyDenied 语义一致（不整页进错误态） */
const applyDenied = ref(false)
/** 可编辑性统一走共享状态机；无报名资格（403）时始终不可编辑 */
const showApplyForm = computed(() => !applyDenied.value && isEditableStatus(myApplication.value))

/** 部门意向仅对已选意向社团开放 */
const volunteerClubs = computed(() => (detail.value?.clubs || []).filter((c) => volunteerClubIds.value.includes(c.id)))

/** 草稿/已提交 answers 中 file 字段值兼容两种历史形态：fileId 字符串或 FileMeta[]（逻辑见 src/lib/formFile） */
const restoredFileMeta = restoredFileMetaFromLib

/** validateJointForm 返回单错误串，DynamicForm 的 fieldErrors 需要 string[] */
const formErrorGroups = computed<Record<string, string[]>>(() =>
  Object.fromEntries(Object.entries(formErrors.value).map(([k, v]) => [k, [v]])),
)

async function loadData() {
  state.value = 'loading'
  const jointId = typeof route.params.jointId === 'string' ? route.params.jointId : null
  if (!jointId) { state.value = 'error'; return }
  const [detailRes, formRes] = await Promise.all([
    get<JointDetail>(`/explore/joint/${jointId}`),
    get<{ versions: { fields: FormField[] }[] }>(`/explore/joint/${jointId}/form`),
  ])
  if (detailRes.kind === 'completed' && formRes.kind === 'completed') {
    detail.value = detailRes.data
    formFields.value = (formRes as { kind: 'completed'; data: { versions: { fields: FormField[] }[] } }).data.versions[0]?.fields || []
    volunteerClubIds.value = (detailRes.data.participants || []).map((p) => p.id)
    const appLoaded = await loadMyApplication()
    // 只有申请状态解析成功（含未提交）才进入 normal，避免覆盖 loadMyApplication 设置的 error/forbidden
    if (appLoaded) state.value = 'normal'
  } else {
    // P3-3：取首个失败请求的错误码（任一失败即整页失败）
    const failed = detailRes.kind === 'completed' ? formRes : detailRes
    state.value = errorToPageState(errorCodeOf(failed))
  }
}

/** 返回 true 表示已正常解析申请状态（含未提交/无报名资格），false 表示已进入错误等终态 */
async function loadMyApplication(): Promise<boolean> {
  const jointId = route.params.jointId
  if (typeof jointId !== 'string') return true
  try {
    // P2-34：重试/权限恢复后复位阻断态，避免表单永久隐藏
    applyDenied.value = false
    const result = await get<MyApplication>(`/activity/joint/${jointId}/apply`)
    if (result.kind === 'completed') {
      myApplication.value = result.data
      restoreDraft(result.data)
      return true
    }
    if (result.kind === 'rejected' && result.error.code === 'IFC-ERR-015') {
      myApplication.value = null
      return true
    }
    if (result.kind === 'rejected' && result.error.code === 'IFC-ERR-003') {
      // 无报名资格（403）：明确阻断填写并给出提示（与 ApplicationPage.applyDenied 一致，不整页进错误态）
      applyDenied.value = true
      return true
    }
    state.value = errorToPageState(errorCodeOf(result))
    return false
  } catch {
    state.value = 'error'
    return false
  }
}

/** 已有草稿时回填表单内容，支持继续修改 */
function restoreDraft(app: MyApplication) {
  const restored = restoreDraftState(app, formFields.value)
  for (const [fieldId, value] of Object.entries(restored.answers)) {
    const field = formFields.value.find((f) => f.id === fieldId)
    // restoreDraftState 对 FileMeta[] 原样返回、对历史 fileId 字符串返回字符串；
    // 此处统一经 restoredFileMeta 归一为 FileMeta[]（字符串形态必须转换，数组形态幂等）
    formData.value[fieldId] = field?.type === 'file' || field?.type === 'image' ? restoredFileMeta(value) : value
  }
  volunteerClubIds.value = restored.volunteerClubIds
  preferences.value = restored.preferences
  consented.value = restored.consented
  allowJointAdjustment.value = restored.allowJointAdjustment
}

function toggleVolunteer(clubId: string) {
  const next = jointToggleVolunteer(volunteerClubIds.value, preferences.value, detail.value?.clubs || [], clubId)
  volunteerClubIds.value = next.volunteerClubIds
  preferences.value = next.preferences
}

/** 部门意向：PreferenceSorter 排序条目（保持部门 id → 名称映射） */
const preferenceEntries = computed<PreferenceEntry[]>({
  get: () => preferences.value.map((p) => ({ id: p.departmentId, label: p.departmentName })),
  set: (entries) => {
    preferences.value = entries.map((e) => {
      const dept = volunteerClubs.value.flatMap((c) => c.departments).find((d) => d.id === e.id)
      return { departmentId: e.id, departmentName: dept?.name ?? e.label }
    })
  },
})

/** ObjectPicker 分组：每个已选意向社团一组部门，多选切换已选/未选；key 用 club.id 保证多社团分组唯一 */
const deptPickerGroups = computed<PickerGroup[]>(() =>
  volunteerClubs.value.map((club) => ({
    type: 'department',
    key: club.id,
    label: club.name,
    items: club.departments.map((d) => ({ id: d.id, label: d.name })),
  })),
)

const selectedDeptIds = computed<string[]>(() => preferences.value.map((p) => p.departmentId))

function onPickDepartments(ids: string[]) {
  const selected = new Set(ids)
  const kept = preferences.value.filter((p) => selected.has(p.departmentId))
  const existing = new Set(preferences.value.map((p) => p.departmentId))
  const added: { departmentId: string; departmentName: string }[] = []
  for (const club of volunteerClubs.value) {
    for (const d of club.departments) {
      if (selected.has(d.id) && !existing.has(d.id)) added.push({ departmentId: d.id, departmentName: d.name })
    }
  }
  preferences.value = [...kept, ...added]
}

async function handleSubmit() {
  if (!showApplyForm.value) return
  formErrors.value = validateJointForm(formFields.value, formData.value)
  if (Object.keys(formErrors.value).length > 0) return

  submitting.value = true
  try {
    // mock 契约要求先存在申请草稿才能提交；无记录（含新用户）时先创建草稿
    if (!myApplication.value) {
      const draftRes = await post(`/activity/joint/${route.params.jointId}/draft`, {})
      if (draftRes.kind !== 'completed') {
        toast.error(draftRes.kind === 'rejected' && draftRes.error
          ? (draftRes.error as { message?: string }).message || '草稿创建失败，请稍后重试'
          : '草稿创建失败，请稍后重试')
        return
      }
    }

    const payload = buildSubmitPayload({
      consented: consented.value,
      allowJointAdjustment: allowJointAdjustment.value,
      volunteerClubIds: volunteerClubIds.value ?? [],
      preferences: preferences.value,
      answers: { ...formData.value },
    })
    const result = await post(`/activity/joint/${route.params.jointId}/apply`, payload)
    if (result.kind === 'completed') {
      toast.success('联合报名已提交')
      router.push('/me/ongoing')
    } else if (result.kind === 'rejected' && result.error) {
      toast.error(result.error.message || '提交失败，请稍后重试')
    } else {
      toast.error('提交失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}

async function handleSaveDraft() {
  if (submitting.value || !showApplyForm.value) return
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
  const result = await post(`/activity/joint/${route.params.jointId}/draft`, {
    answers: draftAnswers,
    volunteerClubIds: volunteerClubIds.value ?? [],
    preferences: preferences.value,
    allowJointAdjustment: allowJointAdjustment.value,
    consented: consented.value,
  }, { expectedVersion: myApplication.value?.version })
  if (result.kind === 'completed') {
    const data = result.data as { version?: number }
    myApplication.value = {
      status: 'draft',
      answers: { ...formData.value },
      volunteerClubIds: volunteerClubIds.value,
      preferences: preferences.value,
      allowJointAdjustment: allowJointAdjustment.value,
      consented: consented.value,
      version: data?.version,
    }
    toast.success('报名草稿已保存，可随时回来继续填写')
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('草稿已在其他窗口被修改，已刷新恢复最新内容，请重新编辑')
    await loadMyApplication()
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '草稿保存失败')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

onMounted(loadData)

onUnmounted(() => {
  if (confirmWithdrawTimer) clearTimeout(confirmWithdrawTimer)
})

function formatDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 提交详情只读回显：表单字段值按类型渲染（数组 join、结构化对象 JSON、文件显示「已上传附件」），空值不展示 */
function renderAnswerValue(v: unknown): string {
  return renderAnswer(v)
}

function answersOf(fieldId: string): string {
  const v = myApplication.value?.answers?.[fieldId]
  if (v == null || v === '') return ''
  const field = formFields.value.find((f) => f.id === fieldId)
  if (field?.type === 'file' || field?.type === 'image') return '已上传附件'
  return renderAnswerValue(v)
}

/** 意向社团 id → 名称（详情接口参与社团与部门列表同源，取任一可用的名称） */
function clubNamesOf(ids?: string[]): string[] {
  return jointClubNamesOf(ids, myApplication.value?.volunteerClubSnapshot, detail.value?.participants || [], detail.value?.clubs || [])
}

/** 撤销联合报名提交：先点击进入确认态，5 秒内再次点击才执行（避免 iframe/沙箱环境禁用 window.confirm 导致无反应） */
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

async function handleWithdraw() {
  if (withdrawing.value) return
  const jointId = route.params.jointId
  if (typeof jointId !== 'string') return
  withdrawing.value = true
  try {
    const result = await post(`/activity/joint/${jointId}/withdraw`, {})
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
</script>

<template>
  <PageStateBoundary :state="state" title="联合报名" @retry="loadData">
    <div v-if="detail" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <h1 class="text-xl font-bold text-text-primary mb-2">{{ detail.title }}</h1>
        <p class="text-sm text-text-secondary mb-4">{{ detail.description }}</p>

        <div class="flex flex-wrap gap-2 mb-4">
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
            :class="CHANNEL_STATUS_TONE_CLASS[channelStatusMeta(detail.channelStatus).tone]"
          >
            {{ channelStatusMeta(detail.channelStatus).label }}
          </span>
          <span v-if="detail.deadline" class="inline-flex items-center px-2.5 py-1 rounded-md bg-subtle text-xs text-text-secondary">
            报名截止：{{ formatDateTime(detail.deadline) }}
          </span>
        </div>

        <div class="rounded-lg bg-warning-subtle p-3 mb-4">
          <p class="text-sm text-warning font-medium mb-1">联合活动说明</p>
          <p class="text-xs text-text-secondary">{{ detail.sharedAgreement?.text || '您的报名信息将共享给所有参与社团，各参与社团独立评价。' }}</p>
        </div>

        <div>
          <p class="text-sm font-medium text-text-primary mb-2 flex items-center gap-1.5"><Users :size="16" /> 参与社团</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="p in detail.participants" :key="p.id" class="inline-flex items-center px-3 py-1.5 rounded-md bg-subtle text-sm text-text-primary">{{ p.name }}</span>
          </div>
        </div>
      </Card>

      <!-- 无报名资格（403）：阻断填写并明确提示，避免整页进错误态（与普通招新 ApplicationPage.applyDenied 一致） -->
      <Card v-if="applyDenied" class="mb-4" role="alert">
        <div class="flex items-center gap-2 text-danger">
          <AlertTriangle :size="18" />
          <p class="text-sm font-medium text-text-primary">当前账号无报名资格</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">联合报名仅面向在校学生开放，如确认符合条件请联系管理员核实账号状态。</p>
      </Card>

      <Card v-if="hasSubmitted && !applyDenied" class="mb-4">
        <div class="flex items-center gap-2 text-success">
          <CheckCircle2 :size="18" />
          <p class="text-sm font-medium text-text-primary">您已提交联合报名</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ applicationStatusLabel(myApplication?.status ?? '') }}</p>

        <!-- 报名详情（提交后只读回显本人填写内容） -->
        <div class="mt-4 border-t border-border pt-3 space-y-2.5">
          <p class="text-sm font-medium text-text-primary">您的报名详情</p>
          <div v-for="field in formFields" :key="field.id">
            <template v-if="answersOf(field.id)">
              <p class="text-xs text-text-secondary">{{ field.label }}</p>
              <p class="text-sm text-text-primary whitespace-pre-wrap">{{ answersOf(field.id) }}</p>
            </template>
          </div>
          <div>
            <p class="text-xs text-text-secondary">意向社团</p>
            <p class="text-sm text-text-primary">{{ clubNamesOf(myApplication?.volunteerClubIds).join('、') || '未选择' }}</p>
          </div>
          <div v-if="myApplication?.preferences?.length">
            <p class="text-xs text-text-secondary">部门意向（按优先级）</p>
            <p class="text-sm text-text-primary">{{ myApplication.preferences.map((p, i) => `${i + 1}. ${p.departmentName}`).join('、') }}</p>
          </div>
          <div>
            <p class="text-xs text-text-secondary">服从联合调剂</p>
            <p class="text-sm text-text-primary">{{ myApplication?.allowJointAdjustment ? '是' : '否' }}</p>
          </div>
          <div v-if="myApplication?.submittedAt">
            <p class="text-xs text-text-secondary">提交时间</p>
            <p class="text-sm text-text-primary">{{ formatDateTime(myApplication.submittedAt) }}</p>
          </div>
        </div>

        <button
          type="button"
          class="mt-4 w-full h-10 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle flex items-center justify-center gap-2 disabled:opacity-60"
          :class="confirmWithdraw ? 'text-danger border-danger' : ''"
          :disabled="withdrawing || !!myApplication?.withdrawBlockedReason"
          @click="requestWithdrawConfirm"
        >
          {{ withdrawing ? '撤销中...' : confirmWithdraw ? '再次点击确认撤销' : '撤销提交' }}
        </button>
        <p v-if="myApplication?.withdrawBlockedReason" class="text-xs text-danger mt-2">{{ myApplication.withdrawBlockedReason }}</p>
        <p v-else class="text-xs text-text-secondary mt-2">撤销后报名内容将保留为草稿，可修改后在报名通道关闭前重新提交。</p>
      </Card>

      <Card v-else-if="hasArchived && !applyDenied" class="mb-4">
        <div class="flex items-center gap-2 text-text-secondary">
          <Archive :size="18" />
          <p class="text-sm font-medium text-text-primary">您的联合报名已归档</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ applicationStatusLabel(myApplication?.status ?? '') }}</p>
      </Card>

      <div v-else-if="myApplication && !applyDenied" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您有已保存的草稿（状态：{{ applicationStatusLabel(myApplication.status) }}），可继续修改后提交</p>
        <p class="text-xs text-text-secondary mt-1">暂存草稿会覆盖此前保存的内容</p>
      </div>

      <!-- 共享报名表（未提交且未归档时展示，草稿用户仍可编辑） -->
      <Card v-if="showApplyForm" class="mb-4">
        <p class="text-sm font-medium text-text-primary mb-3">共享报名表</p>
        <DynamicForm :fields="formFields" v-model="formData" :field-errors="formErrorGroups" />
      </Card>

      <!-- 意向社团（未提交且未归档时展示；草稿用户仍可编辑） -->
      <Card v-if="showApplyForm" class="mb-4">
        <p class="text-sm font-medium text-text-primary mb-1 flex items-center gap-1.5"><Users :size="16" /> 意向社团</p>
        <p class="text-xs text-text-secondary mb-3">选择您希望加入的参与社团，未选择的社团只有在您服从联合调剂时才可能向您发出加入邀请。</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in detail.participants" :key="p.id" type="button"
            class="px-3 py-1.5 rounded-md border text-sm transition-colors"
            :class="volunteerClubIds.includes(p.id) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-text-secondary hover:bg-subtle'"
            @click="toggleVolunteer(p.id)"
          >
            {{ p.name }}
          </button>
        </div>
      </Card>

      <!-- 部门意向（未提交且未归档时展示；草稿用户仍可编辑） -->
      <Card v-if="showApplyForm" class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2">部门意向</h2>
        <p class="text-xs text-text-secondary mb-3">仅可为已选的意向社团添加部门，搜索并点击添加；已选部门按优先级排序，可用按钮或键盘（上/下/Delete）调整（1 为最优先）</p>

        <ObjectPicker :groups="deptPickerGroups" multiple :model-value="selectedDeptIds" @update:model-value="onPickDepartments" />
        <p v-if="volunteerClubs.length === 0" class="text-xs text-warning mt-3">请先在上方选择意向社团，再添加部门意向</p>

        <div class="mt-3">
          <PreferenceSorter v-model="preferenceEntries" />
        </div>
      </Card>

      <!-- 共享同意（未提交且未归档时展示） -->
      <Card v-if="showApplyForm" class="mb-4">
        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="consented" type="checkbox" class="mt-0.5 rounded border-border" />
          <div>
            <p class="text-sm font-medium text-text-primary">我已阅读并理解联合活动规则</p>
            <p class="text-xs text-text-secondary mt-0.5">我的报名信息将共享给所有参与社团，各社团独立评价</p>
          </div>
        </label>
        <label class="flex items-start gap-3 cursor-pointer mt-3">
          <input v-model="allowJointAdjustment" type="checkbox" class="mt-0.5 rounded border-border" />
          <div>
            <p class="text-sm font-medium text-text-primary">服从联合调剂</p>
            <p class="text-xs text-text-secondary mt-0.5">同意在未被意向社团录取的情况下，由其他参与社团向您发出加入邀请</p>
          </div>
        </label>
      </Card>

      <button
        v-if="showApplyForm"
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="!consented || submitting"
        @click="handleSubmit"
      >
        <Send :size="16" /> {{ submitting ? '提交中...' : '提交联合报名' }}
      </button>

      <button
        v-if="showApplyForm"
        class="w-full mt-3 h-10 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle flex items-center justify-center gap-2"
        :disabled="submitting"
        @click="handleSaveDraft"
      >
        <Save :size="14" /> 暂存草稿
      </button>
    </div>
  </PageStateBoundary>
</template>
