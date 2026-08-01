<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Plus, ShieldAlert, Calendar } from '@lucide/vue'

interface Policy { id: string; scope: string; retentionDays: number; action: string; status: string; updatedAt: string }
const state = ref<PageState>('loading')
const policies = ref<Policy[]>([])
const showForm = ref(false)
const creating = ref(false)
const form = ref({ scope: '', retentionDays: 365, action: 'auto_delete' })

const actionLabels: Record<string, string> = { auto_delete: '自动删除', archive: '归档', keep: '保留' }

async function loadData() {
  state.value = 'loading'
  const result = await get<{ policies: Policy[] }>('/admin/retention')
  if (result.kind === 'completed') {
    policies.value = result.data.policies
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleCreate() {
  creating.value = true
  const result = await post('/admin/retention', { ...form.value })
  creating.value = false
  if (result.kind === 'completed') {
    toast.success('保留策略草稿已创建')
    showForm.value = false
    form.value = { scope: '', retentionDays: 365, action: 'auto_delete' }
    await loadData()
  } else {
    toast.error('创建失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="数据保留策略" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">数据保留策略</h1>
        <button
          class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover"
          @click="showForm = !showForm"
        >
          <Plus :size="16" /> {{ showForm ? '收起' : '新建策略' }}
        </button>
      </div>

      <Card v-if="showForm" class="mb-4">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">策略范围</label>
            <input v-model="form.scope" type="text" placeholder="如：已退出成员数据" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">保留天数</label>
              <input v-model.number="form.retentionDays" type="number" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">到期操作</label>
              <select v-model="form.action" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option value="auto_delete">自动删除</option>
                <option value="archive">归档</option>
                <option value="keep">保留</option>
              </select>
            </div>
          </div>
          <button
            class="w-full h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="creating || !form.scope"
            @click="handleCreate"
          >
            {{ creating ? '创建中...' : '创建草稿' }}
          </button>
        </div>
      </Card>

      <Card class="mb-4 border-warning">
        <div class="flex items-start gap-2">
          <ShieldAlert :size="18" class="text-warning mt-0.5 shrink-0" />
          <p class="text-xs text-text-secondary">策略发布为高风险操作，需重新认证。发布后新策略立即生效。</p>
        </div>
      </Card>

      <div class="space-y-3">
        <Card v-for="p in policies" :key="p.id">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-medium text-text-primary">{{ p.scope }}</p>
            <StateTag :status="p.status" />
          </div>
          <div class="flex items-center gap-4 text-sm text-text-secondary">
            <span class="flex items-center gap-1"><Calendar :size="14" /> 保留 {{ p.retentionDays }} 天</span>
            <span>操作：{{ actionLabels[p.action] || p.action }}</span>
          </div>
          <p class="text-xs text-text-secondary mt-1">更新于 {{ p.updatedAt }}</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
