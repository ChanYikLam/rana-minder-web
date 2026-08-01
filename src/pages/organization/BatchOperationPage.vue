<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { post } from '@/services/client'
import { toast } from 'vue-sonner'
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, ChevronRight } from '@lucide/vue'

type BatchType = 'assign_interviewer' | 'schedule_interview' | 'publish_result' | 'send_invitation'

const route = useRoute()
const step = ref<'select' | 'preview' | 'execute' | 'result'>('select')
const selectedType = ref<BatchType | null>(null)
const selectedItems = ref<string[]>([])
const executing = ref(false)
const retrying = ref(false)

const batchTypes: { type: BatchType; label: string; desc: string }[] = [
  { type: 'assign_interviewer', label: '批量分配面试官', desc: '为多个申请人分配同一面试官' },
  { type: 'schedule_interview', label: '批量安排面试', desc: '为多个申请人安排同一时段面试' },
  { type: 'publish_result', label: '批量发布结果', desc: '统一发布多个申请人的评价结论' },
  { type: 'send_invitation', label: '批量发送邀请', desc: '向多个申请人发送同一类型邀请' },
]

const mockApplicants = [
  { id: 'app-001', name: '刘子豪', studentId: '20240001', department: '技术部', status: 'submitted' },
  { id: 'app-002', name: '陈雨桐', studentId: '20240002', department: '运营部', status: 'under_review' },
  { id: 'app-003', name: '王梓涵', studentId: '20240003', department: '技术部', status: 'accepted' },
  { id: 'app-004', name: '张博文', studentId: '20240004', department: '运营部', status: 'rejected' },
  { id: 'app-005', name: '李欣怡', studentId: '20240005', department: '设计部', status: 'submitted' },
]

interface BatchResult { id: string; name: string; success: boolean; message: string }
const results = ref<BatchResult[]>([])

function selectType(type: BatchType) {
  selectedType.value = type
  selectedItems.value = []
  step.value = 'preview'
}

function toggleItem(id: string) {
  const idx = selectedItems.value.indexOf(id)
  if (idx >= 0) selectedItems.value.splice(idx, 1)
  else selectedItems.value.push(id)
}

function applyResults(list: { memberId: string; success: boolean; message: string }[]) {
  for (const item of list) {
    const app = mockApplicants.find((a) => a.id === item.memberId)
    const existing = results.value.findIndex((r) => r.id === item.memberId)
    const entry: BatchResult = {
      id: item.memberId,
      name: app?.name || item.memberId,
      success: item.success,
      message: item.message || (item.success ? '操作成功' : '操作失败'),
    }
    if (existing >= 0) results.value[existing] = entry
    else results.value.push(entry)
  }
}

async function runBatch(memberIds: string[]) {
  const clubId = (route.params.clubId as string) || 'club-001'
  const result = await post<{ results: { memberId: string; success: boolean; message: string }[] }>(`/org/${clubId}/batch/execute`, {
    action: selectedType.value,
    memberIds,
  })
  if (result.kind === 'completed') {
    applyResults(result.data.results)
    toast.success('批量操作执行完成')
    return true
  }
  toast.error('批量操作执行失败，请重试')
  return false
}

async function execute() {
  step.value = 'execute'
  executing.value = true
  results.value = []
  const ok = await runBatch(selectedItems.value)
  executing.value = false
  if (ok) step.value = 'result'
  else step.value = 'preview'
}

async function retryFailed() {
  retrying.value = true
  const failed = results.value.filter((r) => !r.success).map((r) => r.id)
  await runBatch(failed)
  retrying.value = false
}

function reset() {
  step.value = 'select'
  selectedType.value = null
  selectedItems.value = []
  results.value = []
}

const successCount = computed(() => results.value.filter((r) => r.success).length)
const failCount = computed(() => results.value.filter((r) => !r.success).length)
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-text-primary mb-6">受控批量操作</h1>

    <!-- 步骤指示 -->
    <div class="flex items-center gap-2 mb-8 text-sm">
      <span :class="step === 'select' ? 'text-primary font-medium' : 'text-text-secondary'">1. 选择类型</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'preview' || step === 'execute' || step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">2. 预览</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'execute' || step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">3. 执行</span>
      <ArrowRight :size="14" class="text-text-secondary" />
      <span :class="step === 'result' ? 'text-primary font-medium' : 'text-text-secondary'">4. 结果</span>
    </div>

    <!-- Step 1: 选择类型 -->
    <div v-if="step === 'select'">
      <div class="space-y-3">
        <Card
          v-for="bt in batchTypes"
          :key="bt.type"
          class="cursor-pointer"
          @click="selectType(bt.type)"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ bt.label }}</p>
              <p class="text-xs text-text-secondary mt-0.5">{{ bt.desc }}</p>
            </div>
            <ChevronRight />
          </div>
        </Card>
      </div>
    </div>

    <!-- Step 2: 预览 -->
    <div v-else-if="step === 'preview'">
      <Card class="mb-4">
        <p class="text-sm font-medium text-text-primary mb-1">
          {{ batchTypes.find((b) => b.type === selectedType)?.label }}
        </p>
        <p class="text-xs text-text-secondary">选择需要批量操作的对象，一次批次只属于一个操作类型</p>
      </Card>

      <Card class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-text-primary">选择对象（{{ selectedItems.length }}）</p>
          <button
            class="text-xs text-primary hover:underline"
            @click="selectedItems.length === mockApplicants.length ? (selectedItems = []) : (selectedItems = mockApplicants.map((a) => a.id))"
          >
            {{ selectedItems.length === mockApplicants.length ? '取消全选' : '全选' }}
          </button>
        </div>
        <div class="space-y-2">
          <label
            v-for="app in mockApplicants"
            :key="app.id"
            class="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-border-strong"
          >
            <input
              type="checkbox"
              :checked="selectedItems.includes(app.id)"
              class="rounded border-border"
              @change="toggleItem(app.id)"
            />
            <div class="flex-1">
              <span class="text-sm text-text-primary">{{ app.name }}</span>
              <span class="text-xs text-text-secondary ml-2">{{ app.studentId }} · {{ app.department }}</span>
            </div>
            <StateTag :status="app.status" />
          </label>
        </div>
      </Card>

      <div class="flex gap-3">
        <button class="px-4 h-11 rounded-md border border-border text-text-primary hover:bg-subtle" @click="reset">
          <ArrowLeft :size="16" class="inline mr-1" /> 返回
        </button>
        <button
          class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60"
          :disabled="selectedItems.length === 0"
          @click="step = 'execute'; execute()"
        >
          确认执行（{{ selectedItems.length }} 项）
        </button>
      </div>
    </div>

    <!-- Step 3: 执行中 -->
    <div v-else-if="step === 'execute'" class="text-center py-12">
      <div class="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p class="text-sm text-text-secondary">正在逐项执行...（{{ results.length }}/{{ selectedItems.length }}）</p>
    </div>

    <!-- Step 4: 结果 -->
    <div v-else-if="step === 'result'">
      <Card class="mb-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex items-center justify-center w-12 h-12 rounded-full" :class="failCount === 0 ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
            <CheckCircle2 v-if="failCount === 0" :size="24" />
            <AlertTriangle v-else :size="24" />
          </div>
          <div>
            <p class="text-base font-medium text-text-primary">
              {{ failCount === 0 ? '全部成功' : '部分成功' }}
            </p>
            <p class="text-sm text-text-secondary">
              成功 {{ successCount }} 项{{ failCount > 0 ? `，失败 ${failCount} 项` : '' }}
            </p>
          </div>
        </div>

        <div class="space-y-2">
          <div
            v-for="r in results"
            :key="r.id"
            class="flex items-center justify-between rounded-lg border border-border p-2.5"
          >
            <span class="text-sm text-text-primary">{{ r.name }}</span>
            <span
              class="flex items-center gap-1 text-xs"
              :class="r.success ? 'text-success' : 'text-danger'"
            >
              <CheckCircle2 v-if="r.success" :size="14" />
              <AlertTriangle v-else :size="14" />
              {{ r.message }}
            </span>
          </div>
        </div>
      </Card>

      <div class="flex gap-3">
        <button
          v-if="failCount > 0"
          class="flex-1 h-11 rounded-md border border-border text-text-primary hover:bg-subtle disabled:opacity-60"
          :disabled="retrying"
          @click="retryFailed"
        >
          {{ retrying ? '重试中...' : '重试失败项' }}
        </button>
        <button
          class="flex-1 h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover"
          @click="reset"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

