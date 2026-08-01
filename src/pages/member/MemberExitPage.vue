<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { UserMinus, LogOut, AlertTriangle } from '@lucide/vue'

interface ExitMember { id: string; name: string; studentId: string; department: string; title: string; status: string; joinedAt: string; exitedAt: string | null }

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const items = ref<ExitMember[]>([])

// 移除确认弹窗
const removingId = ref<string | null>(null)
const removeReason = ref('')
const removeError = ref('')
const exitingId = ref<string | null>(null)
const removeSubmitting = ref(false)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: ExitMember[] }>(`/org/${clubId}/members/exit`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: ExitMember[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

// MEM-008: 操作者不能通过移除入口移除自己
function canRemove(m: ExitMember): boolean {
  return m.id !== session.user?.id
}

// MEM-008: 最后负责人不可移除/退出（简化：title 为负责人的标记）
function isLastLeader(m: ExitMember): boolean {
  return m.title === '负责人' && items.value.filter((i) => i.title === '负责人' && i.status === 'active').length <= 1
}

function startRemove(id: string) {
  removingId.value = id
  removeReason.value = ''
  removeError.value = ''
}

async function handleMarkExit(m: ExitMember) {
  exitingId.value = m.id
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit`, { memberIds: [m.id] })
  exitingId.value = null
  if (r.kind === 'completed') {
    toast.success('已标记退出')
    await loadData()
  } else {
    toast.error('操作失败，请重试')
  }
}

async function handleRemove() {
  if (!removeReason.value.trim()) {
    removeError.value = '请填写移除原因'
    return
  }
  removeSubmitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/exit`, { memberIds: [removingId.value!] })
  removeSubmitting.value = false
  if (r.kind === 'completed') {
    toast.success('成员已移除')
    removingId.value = null
    await loadData()
  } else {
    toast.error('移除失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="成员退出与移除" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">成员退出与移除</h1>
      <p class="text-sm text-text-secondary mb-6">管理成员退出和移除操作</p>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无成员记录" />

      <div v-else class="space-y-3">
        <Card v-for="m in items" :key="m.id">
          <div class="flex items-start justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-text-primary">{{ m.name }}</p>
              <p class="text-xs text-text-secondary">{{ m.studentId }} · {{ m.department }} · {{ m.title }}</p>
              <p v-if="!canRemove(m)" class="text-xs text-warning mt-1 flex items-center gap-1">
                <AlertTriangle :size="12" /> 不能移除自己
              </p>
              <p v-if="isLastLeader(m) && canRemove(m)" class="text-xs text-warning mt-1 flex items-center gap-1">
                <AlertTriangle :size="12" /> 最后一位负责人，需先交接方可退出/移除
              </p>
            </div>
            <StateTag :status="m.status" />
          </div>
          <p class="text-xs text-text-secondary">加入于 {{ formatDate(m.joinedAt) }}</p>
          <p v-if="m.exitedAt" class="text-xs text-text-secondary">退出于 {{ formatDate(m.exitedAt) }}</p>

          <div v-if="m.status === 'active' && canRemove(m) && !isLastLeader(m)" class="mt-3 flex gap-2">
            <button class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:bg-subtle" :disabled="exitingId === m.id" @click="handleMarkExit(m)">
              <LogOut :size="14" /> {{ exitingId === m.id ? '处理中...' : '标记退出' }}
            </button>
            <button class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-danger text-sm text-danger hover:bg-danger-subtle" @click="startRemove(m.id)">
              <UserMinus :size="14" /> 移除成员
            </button>
          </div>
        </Card>
      </div>

      <!-- 移除确认弹窗（MEM-008: 原因+二次确认） -->
      <div v-if="removingId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="移除成员确认">
        <div class="bg-elevated rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <div class="flex items-center gap-2 mb-3">
            <AlertTriangle :size="20" class="text-danger" />
            <h3 class="text-base font-medium text-danger">确认移除成员</h3>
          </div>
          <p class="text-sm text-text-secondary mb-3">此操作不可撤销，将移除该成员的全部部门、职位和访问权限，并通知当事人。</p>
          <p class="text-xs text-warning mb-2">移除必须填写原因</p>
          <textarea
            v-model="removeReason"
            rows="3"
            class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            placeholder="请填写移除原因..."
            aria-label="移除原因"
          />
          <p v-if="removeError" class="mt-2 text-xs text-danger" role="alert">{{ removeError }}</p>
          <div class="flex gap-2 mt-4">
            <button class="flex-1 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="removingId = null">取消</button>
            <button class="flex-1 h-9 rounded-md bg-danger text-text-on-primary text-sm font-medium hover:opacity-90" :disabled="removeSubmitting" @click="handleRemove">{{ removeSubmitting ? '处理中...' : '确认移除' }}</button>
          </div>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>
