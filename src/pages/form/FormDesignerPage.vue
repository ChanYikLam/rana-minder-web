<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Type, AlignLeft, Hash, Calendar, CircleDot, ListChecks, Image, FileUp, Plus, X, GripVertical, Save, Eye } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface Field { id: string; type: string; label: string; required: boolean; readonly: boolean; permission: string; options: string[] | null; description: string | null }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const formId = ref('')
const currentVersion = ref(1)
const fields = ref<Field[]>([])
const selectedFieldId = ref<string | null>(null)
const saving = ref(false)
const previewOpen = ref(false)

const selectedField = computed(() => {
  if (!selectedFieldId.value) return null
  return fields.value.find((f) => f.id === selectedFieldId.value) || null
})

// P-FORM-01：字段类型按规格对齐为 8 种（短文本/长文本/数字/日期/单选/多选/图片/文件）
const fieldTypes = [
  { type: 'text', label: '短文本', icon: Type },
  { type: 'textarea', label: '长文本', icon: AlignLeft },
  { type: 'number', label: '数字', icon: Hash },
  { type: 'date', label: '日期', icon: Calendar },
  { type: 'radio', label: '单选', icon: CircleDot },
  { type: 'multi_select', label: '多选', icon: ListChecks },
  { type: 'image', label: '图片', icon: Image },
  { type: 'file', label: '文件', icon: FileUp },
]

// 历史类型标签兜底（select/checkbox/datetime 等旧数据仍可渲染）
const legacyTypeLabels: Record<string, string> = {
  select: '下拉选择', checkbox: '勾选', datetime: '日期时间', array: '子表单',
}

function labelOf(type: string): string {
  return fieldTypes.find((ft) => ft.type === type)?.label || legacyTypeLabels[type] || type
}

const optionableTypes = ['radio', 'multi_select', 'select']

async function loadData() {
  state.value = 'loading'
  const id = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ id: string; title: string; fields: Field[]; version: number }>(`${apiScope.prefix}/forms/designer/${id}`)
  if (result.kind === 'completed') {
    formTitle.value = result.data.title
    fields.value = result.data.fields
    formId.value = result.data.id || id
    currentVersion.value = typeof result.data.version === 'number' ? result.data.version : 1
    state.value = 'normal'
  } else { state.value = 'error' }
}

function addField(type: string) {
  const newField: Field = {
    id: `f-${Date.now()}`, type, label: '新字段', required: false, readonly: false,
    permission: 'read_write', options: null, description: null,
  }
  fields.value.push(newField)
  selectedFieldId.value = newField.id
}

function removeField(id: string) {
  fields.value = fields.value.filter((f) => f.id !== id)
  if (selectedFieldId.value === id) selectedFieldId.value = null
}

function selectField(id: string) {
  selectedFieldId.value = id
}

function updateSelectedField(updates: Partial<Field>) {
  if (!selectedField.value) return
  const idx = fields.value.findIndex((f) => f.id === selectedField.value!.id)
  if (idx !== -1) {
    fields.value[idx] = { ...fields.value[idx], ...updates }
  }
}

async function handleSave() {
  saving.value = true
  const id = (formId.value || (route.params.formId as string))
  const apiScope = resolveApiScope(route)
  if (!apiScope) { saving.value = false; return }
  const nextVersion = currentVersion.value + 1
  const result = await post(`${apiScope.prefix}/forms/designer/${id}/save`, {
    fields: fields.value,
    version: nextVersion,
    expectedVersion: currentVersion.value,
  })
  saving.value = false
  if (result.kind === 'completed') {
    const data = result.data as { version?: number; status?: string }
    if (typeof data?.version === 'number') currentVersion.value = data.version
    else currentVersion.value = nextVersion
    toast.success(`表单已保存（v${currentVersion.value}）`)
  } else {
    toast.error('保存失败，请稍后重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="表单设计器" @retry="loadData">
    <div v-if="state === 'normal'" class="max-w-5xl">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">{{ formTitle }}</h1>
        <div class="flex gap-2">
          <button class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle" @click="previewOpen = true"><Eye :size="16" /> 预览</button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="saving"
            @click="handleSave"
          >
            <Save :size="16" /> {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>

      <div class="grid lg:grid-cols-[200px_1fr_280px] gap-4">
        <Card class="h-fit">
          <p class="text-sm font-medium text-text-primary mb-3">字段库</p>
          <div class="space-y-1">
            <button
              v-for="ft in fieldTypes"
              :key="ft.type"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-subtle hover:text-primary transition-colors"
              @click="addField(ft.type)"
            >
              <component :is="ft.icon" :size="16" />
              {{ ft.label }}
            </button>
          </div>
        </Card>

        <Card>
          <p class="text-sm font-medium text-text-secondary mb-3">表单画布</p>
          <div v-if="fields.length === 0" class="flex flex-col items-center justify-center py-12 text-text-secondary">
            <Plus :size="32" class="mb-2" />
            <p class="text-sm">从左侧字段库添加字段</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(field, index) in fields"
              :key="field.id"
              class="flex items-center gap-2 rounded-lg border cursor-pointer p-3 hover:border-primary transition-colors"
              :class="selectedFieldId === field.id ? 'border-primary bg-primary-subtle' : 'border-border'"
              @click="selectField(field.id)"
            >
              <GripVertical :size="16" class="text-muted-foreground cursor-grab" />
              <span class="text-xs text-text-secondary w-6">{{ index + 1 }}</span>
              <div class="flex-1">
                <p class="text-sm text-text-primary">{{ field.label }}</p>
                <p class="text-xs text-text-secondary">{{ labelOf(field.type) }}{{ field.required ? ' · 必填' : '' }}</p>
              </div>
              <button class="p-1 rounded hover:bg-subtle text-danger" @click.stop="removeField(field.id)"><X :size="14" /></button>
            </div>
          </div>
        </Card>

        <Card class="h-fit">
          <p class="text-sm font-medium text-text-primary mb-3">属性配置</p>
          <div v-if="selectedField" class="space-y-3 text-sm">
            <div>
              <label class="block text-xs text-text-secondary mb-1">字段标签</label>
              <input
                type="text"
                :value="selectedField.label"
                class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                @input="updateSelectedField({ label: ($event.target as HTMLInputElement).value })"
              />
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">描述说明</label>
              <input
                type="text"
                :value="selectedField.description || ''"
                class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                placeholder="可选"
                @input="updateSelectedField({ description: ($event.target as HTMLInputElement).value || null })"
              />
            </div>
            <div v-if="optionableTypes.includes(selectedField.type)">
              <label class="block text-xs text-text-secondary mb-1">选项列表（每行一条）</label>
              <textarea
                rows="3"
                class="w-full px-2 py-1.5 rounded border border-border bg-elevated text-xs text-text-primary focus:outline-2 focus:outline-primary"
                :value="(selectedField.options || []).join('\n')"
                @input="updateSelectedField({ options: ($event.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean) || null })"
              />
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">字段权限</label>
              <select
                :value="selectedField.permission"
                class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary"
                @change="updateSelectedField({ permission: ($event.target as HTMLSelectElement).value })"
              >
                <option value="read_write">可读可写</option>
                <option value="read_only">只读</option>
                <option value="hidden">隐藏</option>
              </select>
            </div>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                class="rounded border-border"
                :checked="selectedField.required"
                @change="updateSelectedField({ required: ($event.target as HTMLInputElement).checked })"
              /> 必填
            </label>
          </div>
          <p v-else class="text-xs text-text-secondary">请从画布中选择一个字段进行编辑</p>
        </Card>
      </div>

      <div v-if="previewOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="form-preview-title">
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div class="relative w-full max-w-lg rounded-lg border border-border bg-background shadow-xl max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="form-preview-title" class="text-base font-semibold text-text-primary">表单预览</h2>
            <button class="text-sm text-text-secondary hover:text-text-primary" @click="previewOpen = false">关闭</button>
          </div>
          <div class="px-5 py-4 space-y-4">
            <div v-if="fields.length === 0" class="text-sm text-text-secondary py-8 text-center">暂未添加字段</div>
            <div v-for="field in fields" :key="field.id">
              <label class="block text-sm font-medium text-text-primary mb-1">
                {{ field.label }}<span v-if="field.required" class="text-danger"> *</span>
              </label>
              <p v-if="field.description" class="text-xs text-text-secondary mb-1">{{ field.description }}</p>
              <input
                v-if="['text', 'date', 'number'].includes(field.type)"
                :type="field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'"
                :placeholder="field.type === 'text' ? '请输入' : ''"
                disabled
                class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary opacity-70"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                rows="2"
                disabled
                placeholder="请输入"
                class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary opacity-70"
              />
              <select v-else-if="field.type === 'select' || field.type === 'multi_select'" :multiple="field.type === 'multi_select'" disabled class="w-full h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary opacity-70">
                <option v-for="opt in field.options || ['请选择']" :key="opt">{{ opt }}</option>
              </select>
              <div v-else-if="field.type === 'radio' || field.type === 'checkbox'" class="flex flex-wrap gap-4 pt-1">
                <label v-for="opt in field.options || []" :key="opt" class="flex items-center gap-1.5 text-sm text-text-primary opacity-70">
                  <input :type="field.type === 'radio' ? 'radio' : 'checkbox'" disabled class="rounded border-border" /> {{ opt }}
                </label>
              </div>
              <div v-else-if="field.type === 'image'" class="w-full h-9 px-3 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-text-secondary">
                图片上传区域（预览）
              </div>
              <div v-else-if="field.type === 'file'" class="w-full h-9 px-3 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-text-secondary">
                文件上传区域（预览）
              </div>
            </div>
          </div>
          <div class="flex justify-end border-t border-border px-5 py-3">
            <button class="px-4 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="previewOpen = false">关闭预览</button>
          </div>
        </div>
      </div>
    </div>
  </PageStateBoundary>
</template>