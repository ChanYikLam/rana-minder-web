<script setup lang="ts">
import type { FormField, FileMeta } from '@/types/domain/form'
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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DynamicFormValue]
  'resolveConflict': []
  'migrateVersion': []
}>()

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

function arrayItems(field: FormField): Array<{ id: string; index: number }> {
  const val = fieldValue(field)
  if (Array.isArray(val)) {
    return val.map((_item: unknown, index: number) => ({
      id: `${field.id}-${index}`,
      index,
    }))
  }
  return []
}

function addArrayItem(field: FormField) {
  const current = Array.isArray(fieldValue(field)) ? [...(fieldValue(field) as unknown[])] : []
  current.push({})
  updateField(field, current)
}

function removeArrayItem(field: FormField, index: number) {
  const current = Array.isArray(fieldValue(field)) ? [...(fieldValue(field) as unknown[])] : []
  current.splice(index, 1)
  updateField(field, current)
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
    .map((f) => ({
      ...f,
      id: f.id.split('.').slice(1).join('.'),
    }))
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
        class="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-warning/90"
        @click="$emit('migrateVersion')"
      >
        迁移到新版本
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
        class="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90"
        @click="$emit('resolveConflict')"
      >
        刷新数据
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
          @change="updateField(field, ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>请选择</option>
          <option v-for="opt in field.options || []" :key="opt" :value="opt" :selected="fieldValue(field) === opt">
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
          @input="updateField(field, Number(($event.target as HTMLInputElement).value))"
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
          :key="ei"
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
              <label class="text-xs font-medium text-text-secondary">
                {{ child.label }}
                <span v-if="child.required" class="text-danger">*</span>
              </label>

              <textarea
                v-if="child.type === 'textarea'"
                class="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                rows="2"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = (e.target as HTMLTextAreaElement).value
                  updateArrayItem(field, item.index, row)
                }"
              />

              <input
                v-else-if="child.type === 'number'"
                type="number"
                class="w-full h-10 rounded-md border border-border bg-elevated px-3 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = Number((e.target as HTMLInputElement).value)
                  updateArrayItem(field, item.index, row)
                }"
              />

              <input
                v-else
                type="text"
                class="w-full h-10 rounded-md border border-border bg-elevated px-3 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
                :value="arrayItemValue(field, item.index, child.id)"
                :disabled="isReadOnly(field) || child.readonly"
                :required="child.required"
                @input="(e: Event) => {
                  const row = { ...((fieldValue(field) as unknown[])[item.index] as Record<string, unknown>) }
                  row[child.id] = (e.target as HTMLInputElement).value
                  updateArrayItem(field, item.index, row)
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>