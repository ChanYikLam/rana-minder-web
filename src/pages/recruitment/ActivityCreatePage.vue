<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Card } from '@/components/common'
import { post } from '@/services/client'
import { ArrowLeft, Plus, X, Save } from '@lucide/vue'

const route = useRoute()
const router = useRouter()

const step = ref(1)
const submitting = ref(false)
const submitError = ref<string | null>(null)

const form = reactive({
  title: '',
  description: '',
  deadline: '',
  departments: [] as { id: string; name: string }[],
  formId: 'form-001',
})

const newDeptName = ref('')

function addDepartment() {
  if (!newDeptName.value.trim()) return
  form.departments.push({ id: `dept-${Date.now()}`, name: newDeptName.value.trim() })
  newDeptName.value = ''
}

function removeDepartment(index: number) {
  form.departments.splice(index, 1)
}

const canProceed = computed(() => {
  if (step.value === 1) return form.title.trim() !== '' && form.deadline !== ''
  if (step.value === 2) return form.departments.length > 0
  return true
})

const steps = [
  { num: 1, label: '基本信息' },
  { num: 2, label: '招新方向' },
  { num: 3, label: '预览发布' },
]

async function handlePublish() {
  submitting.value = true
  submitError.value = null
  const clubId = route.params.clubId as string
  const result = await post(`/org/${clubId}/recruitment`, form)
  submitting.value = false
  if (result.kind === 'completed') {
    router.push(`/org/${clubId}/recruitment/${(result.data as { id: string }).id}`)
  } else {
    submitError.value = '发布失败，请稍后重试'
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
      <ArrowLeft :size="16" /> 返回
    </button>

    <h1 class="text-2xl font-bold text-text-primary mb-6">创建招新活动</h1>

    <!-- 步骤指示 -->
    <div class="flex items-center gap-2 mb-8">
      <template v-for="(s, i) in steps" :key="s.num">
        <div
          class="flex items-center gap-2"
          :class="step >= s.num ? 'text-primary' : 'text-text-secondary'"
        >
          <span
            class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
            :class="step >= s.num ? 'bg-primary text-text-on-primary' : 'bg-muted text-text-secondary'"
          >{{ s.num }}</span>
          <span class="text-sm font-medium hidden sm:inline">{{ s.label }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="flex-1 h-px bg-border mx-2" />
      </template>
    </div>

    <!-- Step 1: 基本信息 -->
    <Card v-if="step === 1" class="mb-4">
      <h2 class="text-base font-medium text-text-primary mb-4">活动基本信息</h2>
      <div class="space-y-4">
        <div>
          <label for="title" class="block text-sm font-medium text-text-primary mb-1">活动名称 <span class="text-danger">*</span></label>
          <input
            id="title"
            v-model="form.title"
            type="text"
            class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="例：2025 秋季招新"
          />
        </div>
        <div>
          <label for="desc" class="block text-sm font-medium text-text-primary mb-1">活动描述</label>
          <textarea
            id="desc"
            v-model="form.description"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="简要描述活动内容..."
          />
        </div>
        <div>
          <label for="deadline" class="block text-sm font-medium text-text-primary mb-1">报名截止时间 <span class="text-danger">*</span></label>
          <input
            id="deadline"
            v-model="form.deadline"
            type="datetime-local"
            class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          />
        </div>
      </div>
    </Card>

    <!-- Step 2: 招新方向 -->
    <Card v-if="step === 2" class="mb-4">
      <h2 class="text-base font-medium text-text-primary mb-2">招新方向</h2>
      <p class="text-xs text-text-secondary mb-4">添加本次招新的部门或方向，申请人将按优先级选择</p>

      <div v-if="form.departments.length > 0" class="space-y-2 mb-4">
        <div
          v-for="(dept, index) in form.departments"
          :key="dept.id"
          class="flex items-center justify-between rounded-lg border border-border p-3"
        >
          <div class="flex items-center gap-2">
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-text-on-primary text-xs">{{ index + 1 }}</span>
            <span class="text-sm text-text-primary">{{ dept.name }}</span>
          </div>
          <button class="p-1 rounded hover:bg-subtle text-danger" aria-label="删除" @click="removeDepartment(index)">
            <X :size="14" />
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <input
          v-model="newDeptName"
          type="text"
          class="flex-1 h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          placeholder="输入方向名称"
          @keyup.enter="addDepartment"
        />
        <button
          class="flex items-center gap-1 px-3 h-10 rounded-md border border-border text-text-primary hover:bg-subtle"
          @click="addDepartment"
        >
          <Plus :size="16" /> 添加
        </button>
      </div>
    </Card>

    <!-- Step 3: 预览 -->
    <Card v-if="step === 3" class="mb-4">
      <h2 class="text-base font-medium text-text-primary mb-4">预览确认</h2>
      <dl class="space-y-3 text-sm">
        <div class="flex justify-between border-b border-border pb-2">
          <dt class="text-text-secondary">活动名称</dt>
          <dd class="text-text-primary font-medium">{{ form.title }}</dd>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <dt class="text-text-secondary">报名截止</dt>
          <dd class="text-text-primary">{{ form.deadline }}</dd>
        </div>
        <div class="flex justify-between border-b border-border pb-2">
          <dt class="text-text-secondary">招新方向</dt>
          <dd class="text-text-primary">{{ form.departments.map((d) => d.name).join('、') }}</dd>
        </div>
        <div v-if="form.description" class="flex justify-between">
          <dt class="text-text-secondary">描述</dt>
          <dd class="text-text-primary text-right max-w-xs">{{ form.description }}</dd>
        </div>
      </dl>
    </Card>

    <p v-if="submitError" class="text-sm text-danger mb-4" role="alert">{{ submitError }}</p>

    <!-- 操作按钮 -->
    <div class="flex gap-3">
      <button
        v-if="step > 1"
        class="px-4 h-11 rounded-md border border-border text-text-primary hover:bg-subtle"
        @click="step--"
      >
        上一步
      </button>
      <button
        v-if="step < 3"
        class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
        :disabled="!canProceed"
        @click="step++"
      >
        下一步
      </button>
      <button
        v-if="step === 3"
        class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="submitting"
        @click="handlePublish"
      >
        <Save :size="16" /> {{ submitting ? '发布中...' : '发布活动' }}
      </button>
    </div>
  </div>
</template>
