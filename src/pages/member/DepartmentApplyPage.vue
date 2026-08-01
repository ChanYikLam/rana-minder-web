<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { toast } from 'vue-sonner'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { ArrowRightLeft, Plus, AlertTriangle } from '@lucide/vue'

interface DeptApply { id: string; applicantId: string; applicantName: string; currentDept: string; targetDept: string; reason: string; status: string; submittedAt: string }

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const items = ref<DeptApply[]>([])

// 驳回弹窗
const rejectingId = ref<string | null>(null)
const rejectReason = ref('')
const rejectError = ref('')

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: DeptApply[] }>(`/org/${clubId}/members/department-apply`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: DeptApply[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// MEM-005: 审批人不能审批自己的申请
function canApprove(item: DeptApply): boolean {
  return item.applicantId !== session.user?.id
}

function startReject(id: string) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectError.value = ''
}

function handleReject() {
  if (!rejectReason.value.trim()) {
    rejectError.value = '请填写驳回原因'
    return
  }
  const item = items.value.find((i) => i.id === rejectingId.value)
  if (item) item.status = 'rejected'
  rejectingId.value = null
}

function handleApprove(id: string) {
  const item = items.value.find((i) => i.id === id)
  if (item) item.status = 'approved'
}

function handleCreate() {
  toast.info('演示环境暂不支持')
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="部门关系申请" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">部门关系申请</h1>
        <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="handleCreate">
          <Plus :size="16" /> 发起申请
        </button>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无部门关系申请" description="成员发起的部门转移申请将显示在这里" />

      <div v-else class="space-y-3">
        <Card v-for="item in items" :key="item.id">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ item.applicantName }}</p>
              <p v-if="!canApprove(item)" class="text-xs text-warning mt-0.5 flex items-center gap-1">
                <AlertTriangle :size="12" /> 不能审批自己的申请
              </p>
            </div>
            <StateTag :status="item.status" />
          </div>
          <div class="flex items-center gap-2 text-sm text-text-secondary mb-2">
            <span>{{ item.currentDept }}</span>
            <ArrowRightLeft :size="14" />
            <span class="text-primary">{{ item.targetDept }}</span>
          </div>
          <p class="text-xs text-text-secondary">原因：{{ item.reason }}</p>
          <p class="text-xs text-text-secondary mt-1">提交于 {{ formatDate(item.submittedAt) }}</p>

          <div v-if="item.status === 'under_review' && canApprove(item)" class="mt-3 flex gap-2">
            <button class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90" @click="handleApprove(item.id)">批准</button>
            <button class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle" @click="startReject(item.id)">驳回</button>
          </div>
        </Card>
      </div>

      <!-- 驳回弹窗 -->
      <div v-if="rejectingId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="驳回申请">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-base font-medium text-text-primary mb-2">驳回申请</h3>
          <p class="text-xs text-warning mb-3">驳回必须填写原因</p>
          <textarea
            v-model="rejectReason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="请填写驳回原因..."
            aria-label="驳回原因"
          />
          <p v-if="rejectError" class="mt-2 text-xs text-danger" role="alert">{{ rejectError }}</p>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="rejectingId = null">取消</button>
            <button class="flex-1 h-9 rounded-md bg-danger text-text-on-primary text-sm font-medium hover:opacity-90" @click="handleReject">确认驳回</button>
          </div>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
