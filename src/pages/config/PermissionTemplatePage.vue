<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Plus, Shield, Check } from '@lucide/vue'

interface Template { id: string; name: string; permissions: string[]; version: number; status: string }

const state = ref<PageState>('loading')
const items = ref<Template[]>([])
const selected = ref<Template | null>(null)
const editing = ref(false)
const publishing = ref(false)
const publishOpen = ref(false)
const publishSucceeded = ref(false)
const publishError = ref('')
const draft = ref({ name: '', permissions: '' })

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: Template[] }>('/admin/config/permission-templates')
  if (result.kind === 'completed') {
    items.value = result.data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

const saving = ref(false)

function startCreate() {
  const tpl: Template = {
    id: `tpl-${Date.now()}`,
    name: '未命名模板',
    permissions: [],
    version: 1,
    status: 'draft',
  }
  items.value.unshift(tpl)
  selected.value = tpl
  draft.value = { name: tpl.name, permissions: '' }
  editing.value = true
}

const saving = ref(false)

function startEdit() {
  if (!selected.value) return
  draft.value = {
    name: selected.value.name,
    permissions: selected.value.permissions.join('\n'),
  }
  editing.value = true
}

async function saveDraft() {
  if (!selected.value || saving.value) return
  saving.value = true
  const result = await post(`/admin/config/permission-templates/${selected.value.id}/save`, {
    name: draft.value.name,
    permissions: draft.value.permissions.split('\n').map((p) => p.trim()).filter(Boolean),
  })
  saving.value = false
  if (result.kind !== 'completed') {
    toast.error('草稿保存失败，请重试')
    return
  }
  selected.value.name = draft.value.name
  selected.value.permissions = draft.value.permissions.split('\n').map((p) => p.trim()).filter(Boolean)
  selected.value.version += 1
  selected.value.status = 'draft'
  const idx = items.value.findIndex((t) => t.id === selected.value!.id)
  if (idx >= 0) items.value[idx] = { ...selected.value }
  editing.value = false
  toast.success('草稿已保存')
}

async function handlePublish() {
  if (!selected.value || publishing.value) return
  publishing.value = true
  publishSucceeded.value = false
  publishError.value = ''
  const result = await post(`/admin/config/permission-templates/${selected.value.id}/publish`)
  publishing.value = false
  if (result.kind === 'completed') {
    publishSucceeded.value = true
    selected.value.status = 'published'
    const idx = items.value.findIndex((t) => t.id === selected.value!.id)
    if (idx >= 0) items.value[idx] = { ...selected.value }
    toast.success('模板已发布')
  } else {
    publishError.value = (result as { error?: { message?: string } }).error?.message || '发布失败，请重试'
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="权限模板" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">权限模板管理</h1>
        <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="startCreate">
          <Plus :size="16" /> 新建模板
        </button>
      </div>

      <div class="grid lg:grid-cols-[1fr_320px] gap-4">
        <!-- 模板列表 -->
        <div class="space-y-2">
          <Card
            v-for="tpl in items"
            :key="tpl.id"
            class="cursor-pointer"
            :selected="selected?.id === tpl.id"
            @click="selected = tpl"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Shield :size="16" class="text-text-secondary" />
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ tpl.name }}</p>
                  <p class="text-xs text-text-secondary">{{ tpl.permissions.length }} 项权限 · v{{ tpl.version }}</p>
                </div>
              </div>
              <StateTag :status="tpl.status" />
            </div>
          </Card>
        </div>

        <!-- 权限详情 -->
        <Card v-if="selected" class="h-fit">
          <p class="text-sm font-medium text-text-primary mb-3">{{ selected.name }}</p>
          <div v-if="!editing" class="space-y-1.5 max-h-80 overflow-y-auto">
            <div v-for="perm in selected.permissions" :key="perm" class="flex items-center gap-2 text-sm">
              <Check :size="14" class="text-success shrink-0" />
              <span class="text-text-primary font-mono text-xs">{{ perm }}</span>
            </div>
          </div>
          <div v-else class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-text-primary mb-1">模板名称</label>
              <input v-model="draft.name" type="text" class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
            <div>
              <label class="block text-xs font-medium text-text-primary mb-1">权限（每行一条）</label>
              <textarea v-model="draft.permissions" rows="8" class="w-full px-3 py-2 rounded-md border border-border bg-elevated font-mono text-xs text-text-primary focus:outline-2 focus:outline-primary" />
            </div>
          </div>
          <div class="mt-4 pt-3 border-t border-border flex gap-2">
            <template v-if="!editing">
              <button class="flex-1 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="startEdit">编辑</button>
              <button
                class="flex-1 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                @click="publishOpen = true"
              >
                发布
              </button>
            </template>
            <template v-else>
              <button class="flex-1 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="editing = false">取消</button>
              <button class="flex-1 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60" :disabled="saving" @click="saveDraft">{{ saving ? '保存中...' : '保存草稿' }}</button>
            </template>
          </div>
        </Card>
        <Card v-else class="h-fit flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">选择模板查看权限详情</p>
        </Card>
      </div>
    </div>

    <HighRiskConfirm
      v-model:open="publishOpen"
      title="发布权限模板"
      description="发布后立即作用于全部关联成员并原子切换权限，此操作不可撤销。"
      :targets="selected ? [{ id: selected.id, label: selected.name, detail: `${selected.permissions.length} 项权限 · v${selected.version}` }] : []"
      impact-summary="发布失败时全部成员继续使用旧版本；权限缓存将按新版本刷新。"
      confirm-label="确认发布"
      reauth-required
      :executing="publishing"
      :succeeded="publishSucceeded"
      :error-message="publishError"
      @confirm="handlePublish"
    />
  </PageStateBoundary>
</template>
