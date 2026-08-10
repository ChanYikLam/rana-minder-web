<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import { HighRiskConfirm } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { identityApi } from '@/services/modules'
import type { PageState } from '@/types/machine'
import { Plus, Shield, Check, Minus, KeyRound } from '@lucide/vue'

interface Template {
  id: string
  name: string
  permissions: string[]
  version: number
  draftVersion: number | null
  status: string
}

interface TemplateDiff {
  added: string[]
  removed: string[]
  affectedGroups: string[]
  affectedMembers: number
  previewVersion: number
}

const state = ref<PageState>('loading')
const items = ref<Template[]>([])
const selected = ref<Template | null>(null)
const mode = ref<'edit' | 'create' | null>(null)
const publishing = ref(false)
const publishOpen = ref(false)
const publishSucceeded = ref(false)
const publishError = ref('')
const draft = ref({ name: '', permissions: '' })
const saving = ref(false)
const creating = ref(false)

const diff = ref<TemplateDiff | null>(null)
const diffLoading = ref(false)
const publishReason = ref('')
const reauthProof = ref('')
const reauthenticating = ref(false)
const reauthConfirmOpen = ref(false)

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: Template[] }>('/admin/config/permission-templates')
  if (result.kind === 'completed') {
    items.value = result.data.items
    selected.value = null
    diff.value = null
    publishReason.value = ''
    reauthProof.value = ''
    mode.value = null
    draft.value = { name: '', permissions: '' }
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

function resetEditor() {
  mode.value = null
  draft.value = { name: '', permissions: '' }
}

function startCreate() {
  mode.value = 'create'
  draft.value = { name: '', permissions: '' }
}

function startEdit() {
  if (!selected.value) return
  mode.value = 'edit'
  draft.value = {
    name: selected.value.name,
    permissions: selected.value.permissions.join('\n'),
  }
}

async function handleSave() {
  const name = draft.value.name.trim()
  const permissions = draft.value.permissions.split('\n').map((p) => p.trim()).filter(Boolean)
  if (!name) { toast.error('模板名称不能为空'); return }
  if (permissions.length === 0) { toast.error('权限列表不能为空'); return }

  if (mode.value === 'create') {
    creating.value = true
    const result = await post<Template>('/admin/config/permission-templates', { name, permissions })
    creating.value = false
    if (result.kind === 'completed') {
      toast.success('模板已创建（草稿）')
      resetEditor()
      await loadData()
      selected.value = result.data
      return
    }
    toastError(result, '创建模板失败，请重试')
    return
  }

  if (!selected.value || saving.value) return
  saving.value = true
  const result = await post<Template>(`/admin/config/permission-templates/${selected.value.id}/save`, { name, permissions })
  saving.value = false
  if (result.kind !== 'completed') {
    toastError(result, '草稿保存失败，请重试')
    return
  }
  await loadData()
  selected.value = items.value.find((t) => t.id === result.data.id) ?? null
  resetEditor()
  toast.success('草稿已保存')
}

async function openDiff() {
  if (!selected.value || selected.value.status !== 'draft') return
  if (!reauthProof.value) { toast.error('请先完成重新认证再预览'); return }
  diffLoading.value = true
  diff.value = null
  const result = await get<TemplateDiff>(`/admin/config/permission-templates/${selected.value.id}/diff`)
  diffLoading.value = false
  if (result.kind === 'completed') {
    diff.value = result.data
    publishReason.value = ''
  } else {
    toastError(result, '差异预览失败，请重试')
  }
}

async function reauthenticate() {
  reauthenticating.value = true
  const result = await identityApi.reauthenticate()
  reauthenticating.value = false
  if (result.kind === 'completed') {
    reauthProof.value = result.data.proof
    toast.success('身份验证已完成')
    return
  }
  toast.error('身份验证失败，请重新登录后再试')
}

async function handlePublish() {
  const t = selected.value
  const d = diff.value
  if (!t || !d) return
  if (!publishReason.value.trim() || publishReason.value.trim().length < 5) {
    toast.error('请填写至少 5 个字符的发布原因')
    return
  }
  publishing.value = true
  const result = await post(`/admin/config/permission-templates/${t.id}/publish`, {
    reauthProof: reauthProof.value,
    previewVersion: d.previewVersion,
    reason: publishReason.value.trim(),
  })
  publishing.value = false
  reauthConfirmOpen.value = false
  if (result.kind === 'completed') {
    toast.success('模板已发布')
    await loadData()
  } else if (result.kind === 'rejected' && (result.error as { code?: string }).code === 'IFC-ERR-002') {
    toast.error('身份验证已失效，请重新认证后重试')
    reauthProof.value = ''
  } else if (result.kind === 'concurrency_conflict') {
    toast.error('差异预览已过期，请重新预览后发布')
    diff.value = null
  } else {
    toastError(result, '发布失败，请重试')
  }
}

async function handlePublishSimple() {
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
        <button v-if="mode !== 'create'" class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="startCreate">
          <Plus :size="16" /> 新建模板
        </button>
      </div>

      <div class="grid lg:grid-cols-[1fr_340px] gap-4">
        <!-- 模板列表 -->
        <div class="space-y-2">
          <Card
            v-for="tpl in items"
            :key="tpl.id"
            class="cursor-pointer"
            :selected="selected?.id === tpl.id"
            @click="selected = tpl; resetEditor(); diff = null"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Shield :size="16" class="text-text-secondary" />
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ tpl.name }}</p>
                  <p class="text-xs text-text-secondary">{{ tpl.permissions.length }} 项权限 · v{{ tpl.version }}{{ tpl.draftVersion ? `（草稿 v${tpl.draftVersion}）` : '' }}</p>
                </div>
              </div>
              <StateTag :status="tpl.status" />
            </div>
          </Card>
        </div>

        <!-- 详情 / 编辑器 / 发布（HEAD 分支：mode 驱动） -->
        <div v-if="selected || mode === 'create'" class="space-y-4">
          <Card class="h-fit">
            <!-- 新建模板 -->
            <template v-if="mode === 'create'">
              <p class="text-sm font-medium text-text-primary mb-3">新建权限模板</p>
              <div class="space-y-3">
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
                <button class="flex-1 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="resetEditor">取消</button>
                <button class="flex-1 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60" :disabled="creating" @click="handleSave">{{ creating ? '创建中...' : '创建草稿' }}</button>
              </div>
            </template>

            <!-- 编辑草稿 -->
            <template v-else-if="mode === 'edit'">
              <p class="text-sm font-medium text-text-primary mb-3">编辑草稿 · {{ selected?.name }}</p>
              <div class="space-y-3">
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
                <button class="flex-1 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="resetEditor">取消</button>
                <button class="flex-1 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60" :disabled="saving" @click="handleSave">{{ saving ? '保存中...' : '保存草稿' }}</button>
              </div>
            </template>

            <!-- 只读详情 -->
            <template v-else>
              <p class="text-sm font-medium text-text-primary mb-3">{{ selected?.name }} · v{{ selected?.version }}</p>
              <div class="space-y-1.5 max-h-64 overflow-y-auto">
                <div v-for="perm in selected?.permissions ?? []" :key="perm" class="flex items-center gap-2 text-sm">
                  <Check :size="14" class="text-success shrink-0" />
                  <span class="text-text-primary font-mono text-xs">{{ perm }}</span>
                </div>
              </div>
              <div class="mt-4 pt-3 border-t border-border flex gap-2">
                <button class="flex-1 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="startEdit">{{ selected?.status === 'draft' ? '继续编辑' : '编辑' }}</button>
                <button
                  v-if="selected?.status === 'draft'"
                  class="flex-1 h-8 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-60"
                  disabled
                >
                  发布（见下方）
                </button>
              </div>
            </template>
          </Card>

          <!-- 发布流程（仅草稿） -->
          <Card v-if="selected?.status === 'draft'" class="h-fit border-warning">
            <p class="text-sm font-medium text-warning mb-3 flex items-center gap-1.5"><KeyRound :size="14" /> 发布草稿（需重新认证）</p>

            <button
              class="w-full h-9 rounded-md border border-border text-xs text-text-primary hover:bg-subtle disabled:opacity-50"
              :disabled="reauthenticating || Boolean(reauthProof)"
              @click="reauthenticate"
            >
              {{ reauthProof ? '身份验证已完成' : reauthenticating ? '正在验证...' : '重新验证身份' }}
            </button>

            <button
              class="mt-3 w-full h-9 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover disabled:opacity-50"
              :disabled="!reauthProof || diffLoading"
              @click="openDiff"
            >
              {{ diffLoading ? '正在预览差异...' : diff ? '重新预览差异' : '预览差异' }}
            </button>

            <!-- 差异预览 -->
            <div v-if="diff" class="mt-3 space-y-2">
              <div>
                <p class="text-xs font-medium text-success mb-1">新增权限（{{ diff.added.length }}）</p>
                <div v-if="diff.added.length" class="space-y-1 max-h-24 overflow-y-auto rounded bg-success-subtle p-2">
                  <p v-for="p in diff.added" :key="p" class="flex items-center gap-1.5 text-xs font-mono text-success"><Plus :size="12" /> {{ p }}</p>
                </div>
                <p v-else class="text-xs text-text-secondary">无新增权限</p>
              </div>
              <div>
                <p class="text-xs font-medium text-danger mb-1">移除权限（{{ diff.removed.length }}）</p>
                <div v-if="diff.removed.length" class="space-y-1 max-h-24 overflow-y-auto">
                  <p v-for="p in diff.removed" :key="p" class="flex items-center gap-1.5 text-xs font-mono text-danger"><Minus :size="12" /> {{ p }}</p>
                </div>
                <p v-else class="text-xs text-text-secondary">无移除权限</p>
              </div>
              <p class="text-xs text-warning">影响 {{ diff.affectedGroups.join('、') }} 等 {{ diff.affectedMembers }} 名成员</p>

              <div>
                <label class="block text-xs font-medium text-text-primary mb-1">发布原因</label>
                <textarea v-model="publishReason" rows="2" maxlength="200" class="w-full rounded-md border border-border bg-elevated px-3 py-2 text-xs text-text-primary focus:outline-2 focus:outline-primary" placeholder="至少 5 个字符" />
              </div>

              <button
                class="w-full h-9 rounded-md bg-danger text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-50"
                :disabled="!publishReason.trim() || publishReason.trim().length < 5 || !reauthProof"
                @click="reauthConfirmOpen = true"
              >
                确认发布草稿
              </button>
            </div>
          </Card>
        </div>

        <Card v-else class="h-fit flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">选择模板查看详情，或新建模板</p>
        </Card>
      </div>

      <HighRiskConfirm
        :open="reauthConfirmOpen"
        title="发布权限模板"
        description="发布后不可变版本生效；失败保留旧版，回滚通过发布新版本实现。"
        :targets="diff ? [{ id: 'diff', label: selected?.name || '新增权限模板', detail: `变更 ${diff.added.length + diff.removed.length} 项 · 影响 ${diff.affectedMembers} 名成员` }] : []"
        impact-summary="发布后立即对所有绑定该模板的角色生效，请确认差异与原因。"
        confirm-label="确认发布"
        :executing="publishing"
        @confirm="handlePublish"
        @update:open="(v) => { if (!v) reauthConfirmOpen = false }"
      />
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
      @confirm="handlePublishSimple"
    />
  </PageStateBoundary>
</template>