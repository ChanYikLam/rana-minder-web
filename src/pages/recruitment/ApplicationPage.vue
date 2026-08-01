<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Upload, Save, Send } from '@lucide/vue'

interface ActivityDetail { id: string; title: string; clubName: string; deadline: string; departments: { id: string; name: string }[]; formId: string }
interface FormField { id: string; type: string; label: string; description: string | null; required: boolean; readonly: boolean; permission: string; options: string[] | null }

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const activity = ref<ActivityDetail | null>(null)
const formFields = ref<FormField[]>([])

const formData = reactive<Record<string, string>>({})
const formErrors = ref<Record<string, string>>({})
const preferences = ref<{ departmentId: string; departmentName: string }[]>([])
const submitting = ref(false)
const submitError = ref<string | null>(null)
const savedDraft = ref(false)
const savingDraft = ref(false)

async function loadData() {
  state.value = 'loading'
  const id = route.params.activityId as string
  const [actRes, formRes] = await Promise.all([
    get<ActivityDetail>(`/explore/activities/${id}`),
    get<{ versions: { fields: FormField[] }[] }>(`/org/club-001/forms/form-001`),
  ])
  if (actRes.kind === 'completed' && formRes.kind === 'completed') {
    activity.value = actRes.data
    const versions = (formRes as { kind: 'completed'; data: { versions: { fields: FormField[] }[] } }).data.versions
    formFields.value = versions[0]?.fields || []
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function addPreference(deptId: string, deptName: string) {
  if (!preferences.value.find((p) => p.departmentId === deptId)) {
    preferences.value.push({ departmentId: deptId, departmentName: deptName })
  }
}

function removePreference(index: number) {
  preferences.value.splice(index, 1)
}

function movePreference(index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= preferences.value.length) return
  const temp = preferences.value[index]
  preferences.value[index] = preferences.value[target]
  preferences.value[target] = temp
}

async function handleSaveDraft() {
  savingDraft.value = true
  const result = await post(`/activity/recruitment/${route.params.activityId}/draft`, {
    formAnswers: formData,
  })
  savingDraft.value = false
  if (result.kind === 'completed') {
    const savedAt = (result.data as { savedAt?: string }).savedAt
    savedDraft.value = true
    setTimeout(() => { savedDraft.value = false }, 2000)
    toast.success(savedAt ? `草稿已保存，保存时间 ${new Date(savedAt).toLocaleString()}` : '草稿已保存')
  } else {
    toast.error('草稿保存失败，请稍后重试')
  }
}

async function handleSubmit() {
  formErrors.value = {}
  submitError.value = null

  for (const field of formFields.value) {
    if (field.required && !formData[field.id]) {
      formErrors.value[field.id] = `${field.label}为必填项`
    }
  }
  if (preferences.value.length === 0) {
    submitError.value = '请至少选择一个意向方向'
    return
  }
  if (Object.keys(formErrors.value).length > 0) return

  submitting.value = true
  const result = await post('/activity/recruitment/' + route.params.activityId + '/apply', {
    formData,
    preferences: preferences.value,
  })
  submitting.value = false

  if (result.kind === 'completed') {
    router.push('/me/ongoing')
  } else if (result.kind === 'rejected') {
    submitError.value = result.error.message
  } else {
    submitError.value = '提交失败，请稍后重试'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="报名申请" @retry="loadData">
    <div v-if="activity" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-1">{{ activity.title }}</h1>
      <p class="text-sm text-text-secondary mb-6">{{ activity.clubName }} · 报名申请</p>

      <!-- 意向方向排序 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2">意向方向</h2>
        <p class="text-xs text-text-secondary mb-3">点击添加意向部门，可拖拽或用按钮调整优先级顺序</p>

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
              <button class="p-1 rounded hover:bg-subtle text-danger" aria-label="移除" @click="removePreference(index)">
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="dept in activity.departments"
            :key="dept.id"
            v-show="!preferences.find((p) => p.departmentId === dept.id)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
            @click="addPreference(dept.id, dept.name)"
          >
            <Plus :size="14" /> {{ dept.name }}
          </button>
        </div>
      </Card>

      <!-- 动态表单 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">报名表单</h2>
        <div class="space-y-4">
          <div v-for="field in formFields" :key="field.id">
            <label :for="field.id" class="block text-sm font-medium text-text-primary mb-1">
              {{ field.label }}
              <span v-if="field.required" class="text-danger">*</span>
            </label>
            <p v-if="field.description" class="text-xs text-text-secondary mb-1.5">{{ field.description }}</p>

            <input
              v-if="field.type === 'text'"
              :id="field.id"
              :value="formData[field.id] || ''"
              type="text"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @input="formData[field.id] = ($event.target as HTMLInputElement).value"
            />

            <textarea
              v-else-if="field.type === 'textarea'"
              :id="field.id"
              :value="formData[field.id] || ''"
              rows="4"
              class="w-full px-3 py-2 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @input="formData[field.id] = ($event.target as HTMLTextAreaElement).value"
            />

            <select
              v-else-if="field.type === 'select'"
              :id="field.id"
              :value="formData[field.id] || ''"
              class="w-full h-10 px-3 rounded-md border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
              :class="formErrors[field.id] ? 'border-danger' : 'border-border'"
              @change="formData[field.id] = ($event.target as HTMLSelectElement).value"
            >
              <option value="">请选择</option>
              <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>

            <button
              v-else-if="field.type === 'file'"
              :id="field.id"
              class="w-full h-24 rounded-md border border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-secondary hover:border-primary hover:text-primary transition-colors"
            >
              <Upload :size="20" />
              <span class="text-xs">点击上传文件</span>
            </button>

            <p v-if="formErrors[field.id]" class="mt-1 text-xs text-danger" role="alert">{{ formErrors[field.id] }}</p>
          </div>
        </div>
      </Card>

      <!-- 错误提示 -->
      <p v-if="submitError" class="text-sm text-danger mb-4" role="alert">{{ submitError }}</p>
      <p v-if="savedDraft" class="text-sm text-success mb-4" role="status">草稿已保存</p>

      <!-- 操作区 -->
      <div class="sticky bottom-0 md:static bg-elevated md:bg-transparent border-t md:border-0 p-4 md:p-0 pt-4 flex gap-3">
        <button
          class="flex items-center gap-1.5 px-4 h-11 rounded-md border border-border text-text-primary hover:bg-subtle transition-colors disabled:opacity-60"
          :disabled="savingDraft"
          @click="handleSaveDraft"
        >
          <Save :size="16" /> {{ savingDraft ? '保存中...' : '保存草稿' }}
        </button>
        <button
          class="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-8 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
          :disabled="submitting"
          @click="handleSubmit"
        >
          <Send :size="16" /> {{ submitting ? '提交中...' : '提交报名' }}
        </button>
      </div>
    </div>
  </PageStateBoundary>
</template>
