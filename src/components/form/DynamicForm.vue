<script setup lang="ts">
import type { FormField, FileMeta } from '@/types/domain/form'
import { computed, onMounted, watch } from 'vue'
import FieldPermission from './FieldPermission.vue'
import AttachmentUpload from './AttachmentUpload.vue'
import DateTimePicker from './DateTimePicker.vue'

export interface DynamicFormValue {
  [fieldId: string]: unknown
}

const props = defineProps<{
  fields: FormField[]
  modelValue: DynamicFormValue
  disabled?: boolean
  fieldErrors?: Record<string, string[]>
  versionPending?: boolean
  versionConflict?: boolean
  resolvingConflict?: boolean
  migratingVersion?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DynamicFormValue]
  'resolveConflict': []
  'migrateVersion': []
  'update:fieldErrors': [value: Record<string, string[]>]
}>()

// P2-9：legacy 数组数据缺少 _uid 时一次性补齐稳定 key，
// 避免删除中间项后 index key 错位导致 DOM/输入状态漂移
function ensureArrayUids() {
  let dirty = false
  const next: DynamicFormValue = { ...props.modelValue }
  for (const field of props.fields) {
    if (field.type !== 'array') continue
    const val = next[field.id]
    if (!Array.isArray(val)) continue
    next[field.id] = val.map((row: unknown) => {
      const record = row as Record<string, unknown> | null
      if (record && typeof record === 'object' && !record._uid) {
        dirty = true
        return { ...record, _uid: crypto.randomUUID() }
      }
      return row
    })
  }
  if (dirty) emit('update:modelValue', next)
}

onMounted(ensureArrayUids)
// 消费方通常在表单已挂载后才异步回填数据（如活动详情、历史版本），
// 仅挂载时补齐会漏掉这些路径，需深度监听模型变化
watch(() => props.modelValue, ensureArrayUids, { deep: true })

// P1-23：进行中状态改为纯 prop 驱动（resolvingConflict/migratingVersion），
// 父级完成/取消后置 false 即复位；删除内部置位 ref，避免"刷新中/迁移中"永久停留
const isResolving = computed(() => props.resolvingConflict === true)
const isMigrating = computed(() => props.migratingVersion === true)

function fieldValue(field: FormField): unknown {
  return props.modelValue[field.id]
}

function updateField(field: FormField, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [field.id]: value })
}

function isFieldVisible(field: FormField): boolean {
  if (!field.conditionalFieldId) return true
  const trigger = props.fields.find((f) => f.id === field.conditionalFieldId)
  if (!trigger) return true
  const v = String(props.modelValue[field.conditionalFieldId] ?? '')
  return v === field.conditionalValue
}

function isHidden(field: FormField): boolean {
  return field.permission === 'hidden' || !isFieldVisible(field)
}

function isReadOnly(field: FormField): boolean {
  return props.disabled || field.readonly || field.permission === 'read_only'
}

function toggleCheckbox(field: FormField, opt: string, checked: boolean) {
  const current = Array.isArray(fieldValue(field)) ? (fieldValue(field) as string[]) : []
  const next = checked ? [...current, opt] : current.filter((x) => x !== opt)
  updateField(field, next)
}

/** select 取值契约：单选取 string（空 = ''），multi_select 取 string[]（空 = []） */
function selectChangeValue(field: FormField, el: HTMLSelectElement): string | string[] {
  if (field.type !== 'multi_select') return el.value
  return Array.from(el.selectedOptions)
    .map((o) => o.value)
    .filter((v) => v !== '')
}

/** multi_select 回显规范化：始终返回 string[]（空 = []），兼容历史 string 存储，避免回显与提交类型漂移 */
function multiSelectValue(field: FormField): string[] {
  const v = fieldValue(field)
  if (Array.isArray(v)) return v as string[]
  return typeof v === 'string' && v !== '' ? [v] : []
}

function arrayItems(field: FormField): Array<{ id: string; index: number }> {
  const val = fieldValue(field)
  if (Array.isArray(val)) {
    return val.map((item: unknown, index: number) => {
      const row = item as Record<string, unknown> | null
      return {
        id: (row?._uid as string) || `${field.id}-${index}`,
        index,
      }
    })
  }
  return []
}

function addArrayItem(field: FormField) {
  const current = Array.isArray(fieldValue(field)) ? [...(fieldValue(field) as unknown[])] : []
  current.push({ _uid: crypto.randomUUID() })
  updateField(field, current)
}

function removeArrayItem(field: FormField, index: number) {
  const current = Array.isArray(fieldValue(field)) ? [...(fieldValue(field) as unknown[])] : []
  current.splice(index, 1)
  updateField(field, current)
  // P2-13：服务端数组子字段错误 key 采用 `fieldId.index.childId` 下标口径（契约一致）。
  // 删除中间项后后续项 index 前移，需同步把受影响位置的错误 key 前移一位、并清掉被删项的错误，
  // 否则错误提示会错位粘到错误的输入框上（潜在回归）。item.id(_uid) 服务端不可见，不能作为查询 key。
  if (props.fieldErrors) {
    const fe = { ...props.fieldErrors }
    const prefix = `${field.id}.`
    let changed = false
    for (const key of Object.keys(fe)) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const dot = rest.indexOf('.')
      if (dot === -1) continue // 字段级错误不受数组下标影响
      const itemIdx = Number(rest.slice(0, dot))
      if (!Number.isInteger(itemIdx)) continue
      if (itemIdx === index) {
        delete fe[key]
        changed = true
      } else if (itemIdx > index) {
        const newKey = `${prefix}${itemIdx - 1}${rest.slice(dot)}`
        fe[newKey] = fe[key]
        delete fe[key]
        changed = true
      }
    }
    if (changed) emit('update:fieldErrors', fe)
  }
}

function updateArrayItem(field: FormField, index: number, itemValue: unknown) {
  const current = Array.isArray(fieldValue(field)) ? [...(fieldValue(field) as unknown[])] : []
  current[index] = itemValue
  updateField(field, current)
}

function arrayChildFields(field: FormField): FormField[] {
  if (!field.arrayFieldTemplateId) return []
  return props.fields
    .filter((f) => f.arrayFieldTemplateId === field.id)
}

function getFieldErrors(fieldId: string): string[] {
  return props.fieldErrors?.[fieldId] ?? []
}

function fieldErrorDescribedBy(fieldId: string): string | undefined {
  const errors = getFieldErrors(fieldId)
  return errors.length > 0
    ? errors.map((_, ei) => `dyn-err-${fieldId}-${ei}`).join(' ')
    : undefined
}

function arrayItemValue(field: FormField, index: number, childId: string): string {
  const val = fieldValue(field)
  if (!Array.isArray(val)) return ''
  const row = val[index]
  if (row && typeof row === 'object') {
    const v = (row as Record<string, unknown>)[childId]
    return v === undefined || v === null ? '' : String(v)
  }
  return ''
}

function handleResolveConflict() {
  if (isResolving.value) return
  emit('resolveConflict')
}

function handleMigrateVersion() {
  if (isMigrating.value) return
  emit('migrateVersion')
}

const inputClass = 'w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60'
const inputErrorClass = 'border-danger'
</script>

<template>
  <div class="space-y-5">
    <div v-if="versionPending" class="flex items-center gap-3 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm">
      <span class="text-warning">&#9888;</span>
      <div class="flex-1">
        <p class="font-medium text-text-primary">表单版本已更新</p>
        <p class="text-text-secondary">当前填写内容可能需要迁移到最新版本，迁移后部分字段值可能丢失。</p>
      </div>
      <button
        type="button"
        :disabled="isMigrating"
        class="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-warning/90 disabled:opacity-60"
        @click="handleMigrateVersion"
      >
        {{ isMigrating ? '迁移中...' : '迁移到新版本' }}
      </button>
    </div>

    <div v-if="versionConflict" class="flex items-center gap-3 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm">
      <span class="text-danger">&#9888;</span>
      <div class="flex-1">
        <p class="font-medium text-text-primary">数据版本冲突</p>
        <p class="text-text-secondary">当前数据已被其他操作修改，请刷新后重试。</p>
      </div>
      <button
        type="button"
        :disabled="isResolving"
        class="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-60"
        @click="handleResolveConflict"
      >
        {{ isResolving ? '刷新中...' : '刷新数据' }}
      </button>
    </div>

    <div v-for="field in props.fields" :key="field.id">
      <div v-if="!isHidden(field) && field.type !== 'array'" class="space-y-1.5">
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-text-primary" :for="`dyn-${field.id}`">
            {{ field.label }}
            <span v-if="field.required" class="text-danger">*</span>
          </label>
          <FieldPermission :permission="field.permission" source="表单版本" />
        </div>

        <p v-if="field.description" class="text-xs text-text-secondary">{{ field.description }}</p>

        <textarea
          v-if="field.type === 'textarea'"
          :id="`dyn-${field.id}`"
          :class="[inputClass, getFieldErrors(field.id).length > 0 ? inputErrorClass : '']"
          :aria-describedby="fieldErrorDescribedBy(field.id)"
          :aria-invalid="getFieldErrors(field.id).length > 0 || undefined"
          rows="3"
          :value="(fieldValue(field) as string) || ''"
          :disabled="isReadOnly(field)"
          :required="field.required"
          @input="updateField(field, ($event.target as HTMLTextAreaElement).value)"
        />

        <select
          v-else-if="field.type === 'select' || field.type === 'multi_select'"
          :id="`dyn-${field.id}`"
          :class="[inputClass, getFieldErrors(field.id).length > 0 ? inputErrorClass : '']"
          :aria-describedby="fieldErrorDescribedBy(field.id)"
          :aria-invalid="getFieldErrors(field.id).length > 0 || undefined"
          :multiple="field.type === 'multi_select'"
          :disabled="isReadOnly(field)"
          :required="field.required"
          :value="field.type === 'multi_select' ? multiSelectValue(field) : (fieldValue(field) as string) || ''"
          @change="updateField(field, selectChangeValue(field, $event.target as HTMLSelectElement))"
        >
          <option value="" disabled>请选择</option>
          <option v-for="opt in field.options || []" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>

        <div v-else-if="field.type === 'radio'" class="flex flex-wrap gap-4 pt-1">
          <label v-for="opt in field.options || []" :key="opt" class="flex items-center gap-1.5 text-sm text-text-primary">
            <input
              type="radio"
              :value="opt"
              :checked="fieldValue(field) === opt"
              :disabled="isReadOnly(field)"
              @change="updateField(field, opt)"
            />
            {{ opt }}
          </label>
        </div>

        <div v-else-if="field.type === 'checkbox'" class="flex flex-wrap gap-4 pt-1">
          <label v-for="opt in field.options || []" :key="opt" class="flex items-center gap-1.5 text-sm text-text-primary">
            <input
              type="checkbox"
              :checked="Array.isArray(fieldValue(field)) && (fieldValue(field) as string[]).includes(opt)"
              :disabled="isReadOnly(field)"
              @change="toggleCheckbox(field, opt, ($event.target as HTMLInputElement).checked)"
            />
            {{ opt }}
          </label>
        </div>

        <input
          v-else-if="field.type === 'number'"
          :id="`dyn-${field.id}`"
          type="number"
          :class="[inputClass, getFieldErrors(field.id).length > 0 ? inputErrorClass : '']"
          :aria-describedby="fieldErrorDescribedBy(field.id)"
          :aria-invalid="getFieldErrors(field.id).length > 0 || undefined"
          :value="(fieldValue(field) as number | undefined) ?? ''"
          :disabled="isReadOnly(field)"
          @input="updateField(field, ($event.target as HTMLInputElement).value === '' ? '' : Number(($event.target as HTMLInputElement).value))"
        />

        <DateTimePicker
          v-else-if="field.type === 'date' || field.type === 'datetime'"
          :model-value="(fieldValue(field) as string) || ''"
          :required="field.required"
          @update:model-value="(v: string) => updateField(field, v)"
        />

        <AttachmentUpload
          v-else-if="field.type === 'file'"
          :model-value="(fieldValue(field) as FileMeta[] | undefined) || []"
          @update:model-value="(v: FileMeta[]) => updateField(field, v)"
        />

        <AttachmentUpload
          v-else-if="field.type === 'image'"
          :model-value="(fieldValue(field) as FileMeta[] | undefined) || []"
          accept="image/*"
          hint="支持 JPG/PNG/WebP 等图片格式"
          @update:model-value="(v: FileMeta[]) => updateField(field, v)"
        />

        <input
          v-else
          :id="`dyn-${field.id}`"
          type="text"
          :class="[inputClass, getFieldErrors(field.id).length > 0 ? inputErrorClass : '']"
          :aria-describedby="fieldErrorDescribedBy(field.id)"
          :aria-invalid="getFieldErrors(field.id).length > 0 || undefined"
          :value="(fieldValue(field) as string) || ''"
          :disabled="isReadOnly(field)"
          :required="field.required"
          @input="updateField(field, ($event.target as HTMLInputElement).value)"
        />

        <p
          v-for="(msg, ei) in getFieldErrors(field.id)"
          :id="`dyn-err-${field.id}-${ei}`"
          :key="`${field.id}-${ei}`"
          class="text-xs text-danger"
          role="alert"
        >
          {{ msg }}
        </p>
      </div>

      <div v-else-if="!isHidden(field) && field.type === 'array'" class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-text-primary">
              {{ field.label }}
              <span v-if="field.required" class="text-danger">*</span>
            </label>
            <FieldPermission :permission="field.permission" source="表单版本" />
          </div>
          <button
            v-if="!isReadOnly(field)"
            type="button"
            class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-muted"
            @click="addArrayItem(field)"
          >
            + 添加
          </button>
        </div>

        <p v-if="field.description" class="text-xs text-text-secondary">{{ field.description }}</p>

        <p
          v-for="(msg, ei) in getFieldErrors(field.id)"
          :id="`dyn-err-${field.id}-${ei}`"
          :key="`${field.id}-${ei}`"
          class="text-xs text-danger"
          role="alert"
        >
          {{ msg }}
        </p>

        <div v-if="arrayItems(field).length === 0" class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">
          暂无内容，点击「添加」新增一条记录
        </div>

        <div
          v-for="item in arrayItems(field)"
          :key="item.id"
          class="rounded-lg border border-border bg-muted/30 p-4"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-medium text-text-secondary">#{{ item.index + 1 }}</span>
            <button
              v-if="!isReadOnly(field)"
              type="button"
              class="text-xs text-danger hover:underline"
              @click="removeArrayItem(field, item.index)"
            >
              删除
            </button>
          </div>

          <div class="space-y-3">
            <div v-for="child in arrayChildFields(field)" :key="child.id" class="space-y-1">
              <label
                class="text-xs font-medium text-text-secondary"
                :for="`dyn-${field.id}-${item.id}-${child.id}`"
              >
                {{ child.label }}
                <span v-if="child.required" class="text-danger">*</span>
              </label>

              <textarea
                v-if="child.type === 'textarea'"
                :id="`dyn-${field.id}-${item.id}-${child.id}`"
                :class="[getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 ? inputErrorClass : '']"
                class="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                rows="2"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                :aria-invalid="getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 || undefined"
                :aria-describedby="fieldErrorDescribedBy(`${field.id}.${item.index}.${child.id}`)"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = (e.target as HTMLTextAreaElement).value
                  updateArrayItem(field, item.index, row)
                }"
              />

              <input
                v-else-if="child.type === 'number'"
                :id="`dyn-${field.id}-${item.id}-${child.id}`"
                type="number"
                :class="[getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 ? inputErrorClass : '']"
                class="w-full h-10 rounded-md border border-border bg-elevated px-3 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                :aria-invalid="getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 || undefined"
                :aria-describedby="fieldErrorDescribedBy(`${field.id}.${item.index}.${child.id}`)"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = Number((e.target as HTMLInputElement).value)
                  updateArrayItem(field, item.index, row)
                }"
              />

              <input
                v-else
                :id="`dyn-${field.id}-${item.id}-${child.id}`"
                type="text"
                :class="[getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 ? inputErrorClass : '']"
                class="w-full h-10 rounded-md border border-border bg-elevated px-3 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                :aria-invalid="getFieldErrors(`${field.id}.${item.index}.${child.id}`).length > 0 || undefined"
                :aria-describedby="fieldErrorDescribedBy(`${field.id}.${item.index}.${child.id}`)"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = (e.target as HTMLInputElement).value
                  updateArrayItem(field, item.index, row)
                }"
              />

              <p
                v-for="(msg, ei) in getFieldErrors(`${field.id}.${item.index}.${child.id}`)"
                :id="`dyn-err-${field.id}.${item.index}.${child.id}-${ei}`"
                :key="`${field.id}.${item.index}.${child.id}-${ei}`"
                class="text-xs text-danger"
                role="alert"
              >
                {{ msg }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
