<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Users, Send, Save, CheckCircle2, Upload, FileWarning, ChevronUp, ChevronDown, X, Archive } from '@lucide/vue'
import { applicationStatusLabel, isEditableStatus } from '@/lib/recruitment-status'
import {
  buildSubmitPayload,
  channelStatusMeta,
  clubNamesOf as jointClubNamesOf,
  movePreference as jointMovePreference,
  renderAnswerValue as renderAnswer,
  restoreDraftState,
  togglePreference as jointTogglePreference,
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

interface FormField {
  id: string
  type: string
  label: string
  description: string | null
  required: boolean
  readonly: boolean
  permission: string
  options: string[] | null
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

const formData = reactive<Record<string, string>>({})
interface FormFile { fileId: string; name: string; size: number; checking: boolean; error: boolean }
const formFiles = reactive<Record<string, FormFile | null>>({})
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
const showApplyForm = computed(() => isEditableStatus(myApplication.value))

/** 部门意向仅对已选意向社团开放 */
const volunteerClubs = computed(() => (detail.value?.clubs || []).filter((c) => volunteerClubIds.value.includes(c.id)))

async function uploadFile(fieldId: string, file: File): Promise<void> {
  formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: true, error: false }
  const uploadForm = new FormData()
  uploadForm.append('file', file)
  uploadForm.append('purpose', 'application')
  try {
    const result = await post<{ fileId: string; status: string }>('/files/upload', uploadForm)
    if (result.kind === 'completed') {
      const data = result.data as { fileId: string; status?: string }
      if (data.status === 'failed') {
        formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
        toast.error('文件安全检查未通过，请重新上传')
        return
      }
      formFiles[fieldId] = { fileId: data.fileId, name: file.name, size: file.size, checking: false, error: false }
      formData[fieldId] = data.fileId
    } else {
      formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
      toast.error('文件上传失败，请重试')
    }
  } catch {
    formFiles[fieldId] = { fileId: '', name: file.name, size: file.size, checking: false, error: true }
    toast.error('文件上传失败，请重试')
  }
}

async function handleFileChange(e: Event, fieldId: string) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await uploadFile(fieldId, file)
  input.value = ''
}

function getFieldDescriptionId(fieldId: string): string {
  return `field-${fieldId}-description`
}

function getFieldErrorId(fieldId: string): string {
  return `field-${fieldId}-error`
}

function getFieldDescribedBy(field: FormField): string | undefined {
  const ids = [
    field.description ? getFieldDescriptionId(field.id) : undefined,
    formErrors.value[field.id] ? getFieldErrorId(field.id) : undefined,
  ].filter((id): id is string => Boolean(id))
  return ids.length > 0 ? ids.join(' ') : undefined
}

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
    const failed = detailRes.kind === 'completed' ? formRes : detailRes
    state.value = errorToPageState(errorCodeOf(failed))
  }
}

/** 返回 true 表示已正常解析申请状态（含未提交），false 表示已进入错误/无权限等终态 */
async function loadMyApplication(): Promise<boolean> {
  const jointId = route.params.jointId
  if (typeof jointId !== 'string') return true
  try {
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
  Object.assign(formData, restored.answers)
  for (const [fieldId, fileId] of Object.entries(restored.fileIds)) {
    formFiles[fieldId] = { fileId, name: '已上传附件', size: 0, checking: false, error: false }
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

function togglePreference(dept: { id: string; name: string }) {
  preferences.value = jointTogglePreference(preferences.value, { departmentId: dept.id, departmentName: dept.name })
}

function movePreference(index: number, direction: 'up' | 'down') {
  preferences.value = jointMovePreference(preferences.value, index, direction)
}

async function handleSubmit() {
  if (!showApplyForm.value) return
  formErrors.value = validateJointForm(formFields.value, formData, formFiles)
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
      answers: { ...formData },
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
  const result = await post(`/activity/joint/${route.params.jointId}/draft`, {
    answers: { ...formData },
    volunteerClubIds: volunteerClubIds.value ?? [],
    preferences: preferences.value,
    allowJointAdjustment: allowJointAdjustment.value,
    consented: consented.value,
  })
  if (result.kind === 'completed') {
    myApplication.value = {
      status: 'draft',
      answers: { ...formData },
      volunteerClubIds: volunteerClubIds.value,
      preferences: preferences.value,
      allowJointAdjustment: allowJointAdjustment.value,
      consented: consented.value,
    }
    toast.success('报名草稿已保存，可随时回来继续填写')
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
  if (field?.type === 'file') return '已上传附件'
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

      <Card v-if="hasSubmitted" class="mb-4">
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
          :disabled="withdrawing"
          @click="requestWithdrawConfirm"
        >
          {{ withdrawing ? '撤销中...' : confirmWithdraw ? '再次点击确认撤销' : '撤销提交' }}
        </button>
        <p class="text-xs text-text-secondary mt-2">撤销后报名内容将保留为草稿，可修改后在报名通道关闭前重新提交。</p>
      </Card>

      <Card v-else-if="hasArchived" class="mb-4">
        <div class="flex items-center gap-2 text-text-secondary">
          <Archive :size="18" />
          <p class="text-sm font-medium text-text-primary">您的联合报名已归档</p>
        </div>
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ applicationStatusLabel(myApplication?.status ?? '') }}</p>
      </Card>

      <div v-else-if="myApplication" class="rounded-lg bg-warning-subtle p-3 mb-4">
        <p class="text-sm text-warning font-medium">您有已保存的草稿（状态：{{ applicationStatusLabel(myApplication.status) }}），可继续修改后提交</p>
        <p class="text-xs text-text-secondary mt-1">暂存草稿会覆盖此前保存的内容</p>
      </div>

      <!-- 共享报名表（未提交且未归档时展示，草稿用户仍可编辑） -->
      <Card v-if="showApplyForm" class="mb-4">
        <p class="text-sm font-medium text-text-primary mb-3">共享报名表</p>
        <div class="space-y-4">
          <div v-for="field in formFields" :key="field.id">
            <label :for="field.id" class="block text-sm font-medium text-text-primary mb-1">
              {{ field.label }}
              <span v-if="field.required" class="text-danger">*</span>
            </label>
            <p v-if="field.description" :id="getFieldDescriptionId(field.id)" class="text-xs text-text-secondary mb-1.5">
              {{ field.description }}
            </p>

            <input
              v-if="field.type === 'text'"
              :id="field.id"
              :value="formData[field.id] || ''"
              type="text"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @input="formData[field.id] = ($event.target as HTMLInputElement).value"
            />

            <textarea
              v-else-if="field.type === 'textarea'"
              :id="field.id"
              :value="formData[field.id] || ''"
              rows="4"
              class="w-full px-3 py-2 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @input="formData[field.id] = ($event.target as HTMLTextAreaElement).value"
            />

            <select
              v-else-if="field.type === 'select'"
              :id="field.id"
              :value="formData[field.id] || ''"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
              @change="formData[field.id] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">请选择</option>
              <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <div
              v-else-if="field.type === 'file'"
              :id="field.id"
              :class="[formErrors[field.id] || formFiles[field.id]?.error ? 'border-danger' : 'border-border']"
              class="w-full rounded-md border border-dashed flex flex-col items-center justify-center gap-1 text-text-secondary hover:border-primary hover:text-primary transition-colors"
              :aria-invalid="Boolean(formErrors[field.id])"
              :aria-describedby="getFieldDescribedBy(field)"
            >
              <template v-if="formFiles[field.id]">
                <div class="flex items-center gap-2 p-3">
                  <FileWarning v-if="formFiles[field.id]!.checking" :size="16" class="text-warning" />
                  <Upload v-else-if="!formFiles[field.id]!.error" :size="16" class="text-success" />
                  <FileWarning v-else :size="16" class="text-danger" />
                  <span class="text-xs text-text-primary">{{ formFiles[field.id]!.name }}</span>
                  <span v-if="formFiles[field.id]!.size > 0" class="text-xs text-text-secondary">({{ (formFiles[field.id]!.size / 1024).toFixed(1) }} KB)</span>
                  <span v-if="formFiles[field.id]!.checking" class="text-xs text-warning">检查中...</span>
                  <span v-else-if="formFiles[field.id]!.error" class="text-xs text-danger">上传失败</span>
                  <span v-else class="text-xs text-success">已上传</span>
                  <button type="button" class="text-xs text-danger hover:underline" :disabled="formFiles[field.id]!.checking" @click="formFiles[field.id] = null; formData[field.id] = ''">移除</button>
                </div>
              </template>
              <label v-else class="flex flex-col items-center justify-center gap-1 py-6 cursor-pointer w-full h-full">
                <Upload :size="20" />
                <span class="text-xs">点击上传文件</span>
                <input
                  type="file"
                  class="hidden"
                  :aria-label="`上传${field.label}`"
                  @change="(e) => handleFileChange(e as Event, field.id)"
                />
              </label>
            </div>

            <p v-if="formErrors[field.id]" :id="getFieldErrorId(field.id)" class="mt-1 text-xs text-danger" role="alert">
              {{ formErrors[field.id] }}
            </p>
          </div>
        </div>
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
        <p class="text-xs text-text-secondary mb-3">仅可为已选的意向社团添加部门，点击添加意向部门，可调整优先级顺序（1 为最优先）</p>

        <div v-if="preferences.length > 0" class="space-y-2 mb-3">
          <div
            v-for="(pref, index) in preferences"
            :key="pref.departmentId"
            class="flex items-center gap-2 rounded-lg border border-border p-3"
          >
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-text-on-primary text-xs font-bold">{{ index + 1 }}</span>
            <span class="flex-1 text-sm text-text-primary">{{ pref.departmentName }}</span>
            <div class="flex items-center gap-1">
              <button class="p-1 rounded hover:bg-subtle text-text-secondary" :disabled="index === 0" aria-label="上移" @click="movePreference(index, 'up')">
                <ChevronUp :size="14" />
              </button>
              <button class="p-1 rounded hover:bg-subtle text-text-secondary" :disabled="index === preferences.length - 1" aria-label="下移" @click="movePreference(index, 'down')">
                <ChevronDown :size="14" />
              </button>
              <button class="p-1 rounded hover:bg-subtle text-danger" aria-label="移除" @click="preferences.splice(index, 1)">
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>

        <p v-if="volunteerClubs.length === 0" class="text-xs text-warning">请先在上方选择意向社团，再添加部门意向</p>
        <div v-for="club in volunteerClubs" :key="club.id" class="mb-3 last:mb-0">
          <p class="text-xs text-text-secondary mb-1.5">{{ club.name }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="dept in club.departments" :key="dept.id" type="button"
              class="px-3 py-1.5 rounded-md border text-sm transition-colors"
              :class="preferences.some((p) => p.departmentId === dept.id) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-text-secondary hover:bg-subtle'"
              @click="togglePreference(dept)"
            >
              {{ dept.name }}
            </button>
          </div>
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
