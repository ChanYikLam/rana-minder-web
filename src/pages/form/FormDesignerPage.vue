<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Type, AlignLeft, List, FileUp, Calendar, CheckSquare, Plus, X, GripVertical, Save, Eye } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface Field { id: string; type: string; label: string; required: boolean; readonly: boolean; permission: string; options: string[] | null; description: string | null }

const route = useRoute()
const state = ref<PageState>('loading')
const formTitle = ref('')
const fields = ref<Field[]>([])
const selectedFieldId = ref<string | null>(null)
const selectedField = computed(() => fields.value.find((f) => f.id === selectedFieldId.value) || null)
const riskOpen = ref(false)
const saving = ref(false)
const saveError = ref('')

const fieldTypes = [
  { type: 'text', label: '单行文本', icon: Type },
  { type: 'textarea', label: '多行文本', icon: AlignLeft },
  { type: 'select', label: '下拉选择', icon: List },
  { type: 'date', label: '日期', icon: Calendar },
  { type: 'checkbox', label: '勾选', icon: CheckSquare },
  { type: 'file', label: '文件上传', icon: FileUp },
]

async function loadData() {
  state.value = 'loading'
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ title: string; fields: Field[] }>(`${apiScope.prefix}/forms/designer/${formId}`)
  if (result.kind === 'completed') {
    formTitle.value = result.data.title
    fields.value = result.data.fields
    state.value = 'normal'
  } else { state.value = 'error' }
}

function addField(type: string) {
  fields.value.push({
    id: `f-${Date.now()}`, type, label: '新字段', required: false, readonly: false,
    permission: 'read_write', options: null, description: null,
  })
}

function removeField(id: string) {
  fields.value = fields.value.filter((f) => f.id !== id)
  if (selectedFieldId.value === id) selectedFieldId.value = null
}

function openSaveConfirm() {
  saveError.value = ''
  riskOpen.value = true
}

async function handleSave() {
  const formId = route.params.formId as string
  const apiScope = resolveApiScope(route)
  if (!apiScope) return
  saving.value = true
  saveError.value = ''
  const result = await post(`${apiScope.prefix}/forms/designer/${formId}`, { fields: fields.value })
  saving.value = false
  if (result.kind === 'completed') {
    toast.success('保存成功')
  } else if (result.kind === 'rejected' && result.error) {
    saveError.value = (result.error as { message?: string }).message || '保存失败，请稍后重试'
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
          <button class="flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-sm text-text-primary hover:bg-subtle"><Eye :size="16" /> 预览</button>
          <button
            class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            :disabled="saving"
            @click="openSaveConfirm"
          >
            <Save :size="16" /> {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>

      <div class="grid lg:grid-cols-[200px_1fr_280px] gap-4">
        <!-- 左：字段库 -->
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

        <!-- 中：画布 -->
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
              class="flex items-center gap-2 rounded-lg border p-3 cursor-pointer"
              :class="selectedFieldId === field.id ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong'"
              @click="selectedFieldId = field.id"
            >
              <GripVertical :size="16" class="text-muted-foreground cursor-grab" />
              <span class="text-xs text-text-secondary w-6">{{ index + 1 }}</span>
              <div class="flex-1">
                <p class="text-sm text-text-primary">{{ field.label }}</p>
                <p class="text-xs text-text-secondary">{{ fieldTypes.find((ft) => ft.type === field.type)?.label || field.type }}{{ field.required ? ' · 必填' : '' }}</p>
              </div>
              <button class="p-1 rounded hover:bg-subtle text-danger" @click.stop="removeField(field.id)"><X :size="14" /></button>
            </div>
          </div>
        </Card>

        <!-- 右：属性面板 -->
        <Card class="h-fit">
          <p class="text-sm font-medium text-text-primary mb-3">属性配置</p>
          <div v-if="selectedField" class="space-y-3 text-sm">
            <div>
              <label class="block text-xs text-text-secondary mb-1">字段标签</label>
              <input v-model="selectedField.label" type="text" class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary" placeholder="字段标签" />
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">描述说明</label>
              <input v-model="selectedField.description" type="text" class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary" placeholder="可选" />
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">字段权限</label>
              <select v-model="selectedField.permission" class="w-full h-8 px-2 rounded border border-border bg-elevated text-xs text-text-primary">
                <option value="read_write">可读可写</option>
                <option value="read_only">只读</option>
                <option value="hidden">隐藏</option>
              </select>
            </div>
            <label class="flex items-center gap-2"><input v-model="selectedField.required" type="checkbox" class="rounded border-border" /> 必填</label>
          </div>
          <p v-else class="text-xs text-text-secondary">选择字段后编辑属性</p>
        </Card>
      </div>
    </div>

    <HighRiskConfirm
      v-model:open="riskOpen"
      title="保存表单设计"
      description="保存后将更新表单字段结构，可能影响正在进行的招新活动。"
      :targets="[{ id: 'form', label: formTitle || '招新报名表', detail: `${fields.length} 个字段` }]"
      impact-summary="请确认字段配置符合活动要求；错误配置可能导致报名表单展示异常。"
      confirm-label="确认保存"
      :executing="saving"
      :error="saveError || null"
      @confirm="handleSave"
    />
  </PageStateBoundary>
</template>
