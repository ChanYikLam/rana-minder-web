<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Users, Send, Save, CheckCircle2 } from '@lucide/vue'

interface JointDetail {
  title: string
  clubName: string
  participants: { id: string; name: string }[]
  description: string
  channelStatus?: string
  deadline?: string
}

/** 联合申请状态 → 用户可读文案（未知状态回退原始值；联合申请状态集仅 draft/submitted/archived） */
const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '等待审核',
  archived: '已归档',
}

function statusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status] || status
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const detail = ref<JointDetail | null>(null)
const myApplication = ref<{ status: string; volunteerClubIds?: string[]; consented?: boolean; allowJointAdjustment?: boolean } | null>(null)
/** 仅当申请状态为 submitted 才算“已提交”，草稿（draft）用户仍可继续填写/提交 */
const hasSubmitted = computed(() => myApplication.value?.status === 'submitted')
const consented = ref(false)
const allowJointAdjustment = ref(false)
const volunteerClubIds = ref<string[]>([])
const submitting = ref(false)

async function loadData() {
  state.value = 'loading'
  const jointId = typeof route.params.jointId === 'string' ? route.params.jointId : null
  if (!jointId) { state.value = 'error'; return }
  const result = await get<JointDetail>(`/explore/joint/${jointId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    volunteerClubIds.value = (result.data.participants || []).map((p) => p.id)
    const appLoaded = await loadMyApplication()
    // 只有申请状态解析成功（含未提交）才进入 normal，避免覆盖 loadMyApplication 设置的 error/forbidden
    if (appLoaded) state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

/** 返回 true 表示已正常解析申请状态（含未提交），false 表示已进入错误/无权限等终态 */
async function loadMyApplication(): Promise<boolean> {
  const jointId = route.params.jointId
  if (typeof jointId !== 'string') return true
  try {
    const result = await get<{ status: string; volunteerClubIds?: string[]; consented?: boolean; allowJointAdjustment?: boolean }>(`/activity/joint/${jointId}/apply`)
    if (result.kind === 'completed') {
      const app = result.data
      myApplication.value = app
      // 回填草稿已保存的填写内容，便于用户继续编辑后直接提交
      if (app.volunteerClubIds) volunteerClubIds.value = app.volunteerClubIds
      if (typeof app.consented === 'boolean') consented.value = app.consented
      if (typeof app.allowJointAdjustment === 'boolean') allowJointAdjustment.value = app.allowJointAdjustment
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

function toggleVolunteer(clubId: string) {
  if (!volunteerClubIds.value.includes(clubId)) volunteerClubIds.value.push(clubId)
  else volunteerClubIds.value = volunteerClubIds.value.filter((id) => id !== clubId)
}

async function handleSubmit() {
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
    const result = await post(`/activity/joint/${route.params.jointId}/apply`, {
      consented: consented.value,
      allowJointAdjustment: allowJointAdjustment.value,
      volunteerClubIds: volunteerClubIds.value,
    })
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
  if (submitting.value) return
  const result = await post(`/activity/joint/${route.params.jointId}/draft`, {})
  if (result.kind === 'completed') {
    toast.success('报名草稿已保存，可随时回来继续填写')
  } else if (result.kind === 'rejected' && result.error) {
    toast.error((result.error as { message?: string }).message || '草稿保存失败')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

onMounted(loadData)

function formatDeadline(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <PageStateBoundary :state="state" title="联合报名" @retry="loadData">
    <div v-if="detail" class="max-w-lg mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <h1 class="text-xl font-bold text-text-primary mb-2">{{ detail.title }}</h1>
        <p class="text-sm text-text-secondary mb-4">{{ detail.description }}</p>

        <div class="flex flex-wrap gap-2 mb-4">
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
            :class="detail.channelStatus === 'open' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'"
          >
            {{ detail.channelStatus === 'open' ? '报名通道开放中' : '报名通道已关闭' }}
          </span>
          <span v-if="detail.deadline" class="inline-flex items-center px-2.5 py-1 rounded-md bg-subtle text-xs text-text-secondary">
            报名截止：{{ formatDeadline(detail.deadline) }}
          </span>
        </div>

        <div class="rounded-lg bg-warning-subtle p-3 mb-4">
          <p class="text-sm text-warning font-medium mb-1">联合活动说明</p>
          <p class="text-xs text-text-secondary">各参与社团将独立给出评价结论和邀请，您的报名信息将共享给所有参与社团。</p>
        </div>

        <div class="mb-4">
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
        <p class="text-xs text-text-secondary mt-1">当前状态：{{ statusLabel(myApplication?.status ?? '') }}</p>
      </Card>

      <!-- 意向社团（未提交时展示；草稿用户仍可编辑） -->
      <Card v-else class="mb-4">
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

      <!-- 共享同意 -->
      <Card v-if="!hasSubmitted" class="mb-4">
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
        v-if="!hasSubmitted"
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="!consented || volunteerClubIds.length === 0 || submitting"
        @click="handleSubmit"
      >
        <Send :size="16" /> {{ submitting ? '提交中...' : '提交联合报名' }}
      </button>

      <button
        v-if="!hasSubmitted"
        class="w-full mt-3 h-10 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle flex items-center justify-center gap-2"
        :disabled="submitting"
        @click="handleSaveDraft"
      >
        <Save :size="14" /> 暂存草稿
      </button>
    </div>
  </PageStateBoundary>
</template>
