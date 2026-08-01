<script setup lang="ts">
import { computed, useId } from 'vue'
import { cn } from '@/lib/utils'
import { Input as ShadcnInput } from '@/components/ui/input'

interface Props {
  modelValue?: string | number
  label?: string
  type?: string
  placeholder?: string
  required?: boolean
  readonly?: boolean
  disabled?: boolean
  error?: string
  helpText?: string
  autocomplete?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  required: false,
  readonly: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const inputId = useId()
const errorId = `${inputId}-error`
const helpId = `${inputId}-help`

const hasError = computed(() => !!props.error)

const describedBy = computed(() => {
  const parts: string[] = []
  if (hasError.value) parts.push(errorId)
  if (props.helpText) parts.push(helpId)
  return parts.join(' ') || undefined
})
</script>

<template>
  <div class="space-y-1.5">
    <label
      v-if="label"
      :for="inputId"
      class="block text-sm font-medium text-primary"
    >
      {{ label }}
      <span v-if="required" class="text-danger" aria-label="必填">*</span>
    </label>
    <ShadcnInput
      :id="inputId"
      :type="type"
      :model-value="modelValue"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="disabled"
      :required="required"
      :autocomplete="autocomplete"
      :aria-invalid="hasError"
      :aria-describedby="describedBy"
      :class="cn(hasError && 'border-danger focus-visible:ring-danger')"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p v-if="helpText" :id="helpId" class="text-xs text-text-secondary">{{ helpText }}</p>
    <p v-if="hasError" :id="errorId" class="text-xs text-danger" role="alert">{{ error }}</p>
  </div>
</template>
