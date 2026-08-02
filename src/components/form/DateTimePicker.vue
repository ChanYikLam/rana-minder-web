<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, Clock3, Globe } from '@lucide/vue'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  timezone?: string
  required?: boolean
  label?: string
}>(), {
  timezone: 'Asia/Shanghai',
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const today = new Date().toISOString().slice(0, 10)

const datePart = computed(() => props.modelValue?.slice(0, 10) || '')
const timePart = computed(() => props.modelValue?.slice(11, 16) || '')

function toIso(date: string, time: string): string {
  return `${date}T${time || '00:00'}:00+08:00`
}

function onDate(v: string) {
  emit('update:modelValue', toIso(v, timePart.value || '00:00'))
}

function onTime(v: string) {
  emit('update:modelValue', toIso(datePart.value || today, v))
}
</script>

<template>
  <div
    class="inline-flex flex-wrap items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 focus-within:border-primary"
    :aria-label="props.label || '日期时间选择'"
  >
    <CalendarDays :size="16" class="text-text-secondary" aria-hidden="true" />
    <input
      type="date"
      class="bg-transparent text-sm text-text-primary focus:outline-none"
      :value="datePart"
      :min="today"
      :required="props.required"
      aria-label="日期"
      @input="onDate(($event.target as HTMLInputElement).value)"
    />
    <span class="text-text-secondary" aria-hidden="true">–</span>
    <Clock3 :size="16" class="text-text-secondary" aria-hidden="true" />
    <input
      type="time"
      class="bg-transparent text-sm text-text-primary focus:outline-none"
      :value="timePart"
      @input="onTime(($event.target as HTMLInputElement).value)"
      aria-label="时间"
    />
    <span class="flex items-center gap-1 text-xs text-text-secondary">
      <Globe :size="12" aria-hidden="true" />
      UTC{{ props.timezone === 'Asia/Shanghai' ? '+8' : '' }}（平台时区）
    </span>
  </div>
</template>