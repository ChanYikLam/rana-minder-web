<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Plus, FileSearch } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface Correction { id: string; targetType: string; targetId: string; reason: string; evidence: string; status: string; submittedAt: string; submitterName: string; decidedBy?: string; decidedAt?: string; withdrawnBy?: string; withdrawnAt?: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<Correction[]>([])
const view = computed(() => route.meta.view || 'self')
const showForm = ref(false)
const form = ref({ targetType: '', targetId: '', reason: '', evidence: '' })
const creating = ref(false)
const actingId = ref<string | null>(null)
const formError = ref('')
const actError = ref('')
const justSubmitted = ref('')
const submittedTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function flashSubmitted(message: string) {
  justSubmitted.value = message
  if (submittedTimer.value) clearTimeout(submittedTimer.value)
  submittedTimer.value = setTimeout(() => { justSubmitted.value = '' }, 4000)
}

onUnmounted(() => {
  if (submittedTimer.value) {
    clearTimeout(submittedTimer.value)
    submittedTimer.value = null
  }
})

function correctionsPrefix(): string | null {
  if (view.value === 'self') return '/me/corrections'
  const apiScope = resolveApiScope(route)
  return apiScope ? `${apiScope.prefix}/audit/corrections` : null
}

async function loadData() {
  state.value = 'loading'
  const prefix = correctionsPrefix()
  if (!prefix) { state.value = 'error'; return }
  const result = await get<{ items: Correction[] }>(prefix)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: Correction[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleCreate() {
  creating.value = true
  formError.value = ''
  const prefix = correctionsPrefix()
  if (!prefix) { creating.value = false; formError.value = '页面作用域不可用，无法提交'; return }
  const result = await post(prefix, { ...form.value })
  creating.value = false
  if (result.kind === 'completed') {
    showForm.value = false
    form.value = { targetType: '', targetId: '', reason: '', evidence: '' }
    flashSubmitted('纠错申请已提交，等待审核')
    await loadData()
  } else {
    formError.value = (result as { error?: { message?: string } }).error?.message || '提交失败，请重试'
  }
}

async function handleDecide(item: Correction, decision: 'approve' | 'reject') {
  actingId.value = item.id
  actError.value = ''
  const prefix = correctionsPrefix()
  if (!prefix) { actingId.value = null; actError.value = '页面作用域不可用，无法处理'; return }
  const result = await post(`${prefix}/${item.id}/decide`, { decision })
  actingId.value = null
  if (result.kind === 'completed') {
    flashSubmitted(decision === 'approve' ? '纠错申请已批准' : '纠错申请已拒绝')
    await loadData()
  } else {
    actError.value = '操作失败，请重试'
  }
}

async function handleWithdraw(item: Correction) {
  actingId.value = item.id
  actError.value = ''
  const prefix = correctionsPrefix()
  if (!prefix) { actingId.value = null; actError.value = '页面作用域不可用，无法撤回'; return }
  const result = await post(`${prefix}/${item.id}/withdraw`, {})
  actingId.value = null
  if (result.kind === 'completed') {
    flashSubmitted('纠错申请已撤回')
    await loadData()
  } else {
    actError.value = '撤回失败，请重试'
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="事实纠错" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">事实纠错</h1>
        <button
          class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
          @click="showForm = !showForm"
        >
          <Plus :size="16" /> {{ showForm ? '收起' : '发起纠错' }}
        </button>
      </div>

      <Card v-if="showForm" class="mb-4">
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">对象类型</label>
              <input v-model="form.targetType" type="text" placeholder="如：成员信息" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">对象编号</label>
              <input v-model="form.targetId" type="text" placeholder="如：mem-001" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">纠错原因</label>
            <input v-model="form.reason" type="text" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">证据</label>
            <input v-model="form.evidence" type="text" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <p v-if="formError" class="text-sm text-danger mb-3" role="alert">{{ formError }}</p>
          <button
            class="w-full h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="creating || !form.targetType || !form.targetId || !form.reason"
            @click="handleCreate"
          >
            {{ creating ? '提交中...' : '提交纠错' }}
          </button>
        </div>
      </Card>

      <div v-if="justSubmitted" class="mb-4 rounded-md bg-success-subtle border border-success px-4 py-3 text-sm text-success" role="status">
        {{ justSubmitted }}
      </div>
      <p v-if="actError" class="text-sm text-danger mb-4" role="alert">{{ actError }}</p>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无纠错申请" />

      <div v-else class="space-y-3">
        <Card v-for="item in items" :key="item.id">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <FileSearch :size="16" class="text-text-secondary" />
              <span class="text-sm font-medium text-text-primary">{{ item.targetType }} #{{ item.targetId }}</span>
            </div>
            <StateTag :status="item.status" />
          </div>
          <p class="text-sm text-text-secondary">{{ item.reason }}</p>
          <p class="text-xs text-text-secondary mt-2">提交人：{{ item.submitterName }} · {{ formatDate(item.submittedAt) }}</p>
          <!-- 审计轨迹：审批/撤回闭环可追溯（P1-010） -->
          <p v-if="item.decidedBy && item.decidedAt" class="text-xs text-text-secondary mt-1">
            审批人：{{ item.decidedBy }} · {{ formatDate(item.decidedAt) }}
            <span>（{{ item.status === 'approved' ? '已批准' : '已拒绝' }}）</span>
          </p>
          <p v-if="item.withdrawnBy && item.withdrawnAt" class="text-xs text-text-secondary mt-1">
            撤回人：{{ item.withdrawnBy }} · {{ formatDate(item.withdrawnAt) }}
          </p>

          <div v-if="view !== 'self' && item.status === 'submitted'" class="mt-3 flex gap-2">
            <button
              class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
              :disabled="actingId !== null"
              @click="handleDecide(item, 'approve')"
            >
              {{ actingId === item.id ? '处理中...' : '批准' }}
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
              :disabled="actingId !== null"
              @click="handleDecide(item, 'reject')"
            >
              {{ actingId === item.id ? '处理中...' : '拒绝' }}
            </button>
          </div>
          <div v-if="view === 'self' && item.status === 'submitted'" class="mt-3">
            <button
              class="text-xs text-danger hover:underline disabled:opacity-60"
              :disabled="actingId !== null"
              @click="handleWithdraw(item)"
            >
              {{ actingId === item.id ? '撤回中...' : '撤回申请' }}
            </button>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
