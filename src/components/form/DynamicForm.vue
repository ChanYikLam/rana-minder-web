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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DynamicFormValue]
}>()

function fieldValue(field: FormField): unknown {
  return props.modelValue[field.id]
}

function updateField(field: FormField, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [field.id]: value })
}

/** 条件隐藏：conditionalFieldId 触发字段的值与 conditionalValue 一致时显示 */
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

const inputClass = 'w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60'
</script>

<template>
  <div class="space-y-5">
    <div v-for="field in props.fields" :key="field.id">
      <div v-if="!isHidden(field)" class="space-y-1.5">
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
          class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
          rows="3"
          :value="(fieldValue(field) as string) || ''"
          :disabled="isReadOnly(field)"
          :required="field.required"
          @input="updateField(field, ($event.target as HTMLTextAreaElement).value)"
        />

        <select
          v-else-if="field.type === 'select' || field.type === 'multi_select'"
          :id="`dyn-${field.id}`"
          class="w-full h-10 rounded-md border border-border bg-elevated px-3 text-sm text-text-primary focus:outline-2 focus:outline-primary disabled:opacity-60"
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
          :class="inputClass"
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
          :class="inputClass"
          :value="(fieldValue(field) as string) || ''"
          :disabled="isReadOnly(field)"
          :required="field.required"
          @input="updateField(field, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>