<script setup lang="ts">
import { computed } from 'vue'
import { ChevronUp, ChevronDown } from '@lucide/vue'

export interface PreferenceEntry {
  id: string
  label: string
  subtitle?: string
}

const props = defineProps<{
  modelValue: PreferenceEntry[]
  max?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [items: PreferenceEntry[]]
}>()

/** P2-10：max 上限生效——剩余可添加数提示（达上限时置灰入口由调用方决定，此处仅反馈状态） */
const remainingSlots = computed(() =>
  props.max === undefined ? null : Math.max(0, props.max - props.modelValue.length)
)

function move(index: number, delta: -1 | 1) {
  const items = [...props.modelValue]
  const target = index + delta
  if (target < 0 || target >= items.length) return
  const [it] = items.splice(index, 1)
  items.splice(target, 0, it)
  emit('update:modelValue', items)
}

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowUp') { event.preventDefault(); move(index, -1) }
  if (event.key === 'ArrowDown') { event.preventDefault(); move(index, 1) }
  if (event.key === 'Delete') { event.preventDefault(); removeAt(index) }
}
</script>

<template>
  <ol class="space-y-2" role="list" aria-label="志愿排序">
    <li
      v-for="(it, index) in props.modelValue"
      :key="it.id"
      class="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2"
      tabindex="0"
      :aria-label="`第 ${index + 1} 个志愿：${it.label}，按上/下键移动，Delete 移除`"
      @keydown="onKeydown($event, index)"
    >
      <span class="flex items-center justify-center w-7 h-7 rounded-full bg-primary-subtle text-primary text-xs font-medium shrink-0" aria-hidden="true">
        {{ index + 1 }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-text-primary truncate">{{ it.label }}</p>
        <p v-if="it.subtitle" class="text-xs text-text-secondary truncate">{{ it.subtitle }}</p>
      </div>

      <div class="flex items-center gap-0.5" role="group" aria-label="调整顺序">
        <button
          type="button"
          class="p-1 rounded hover:bg-subtle text-text-secondary hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="index === 0"
          :aria-label="`上移 ${it.label}`"
          @click="move(index, -1)"
        >
          <ChevronUp :size="15" />
        </button>
        <button
          type="button"
          class="p-1 rounded hover:bg-subtle text-text-secondary hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="index === props.modelValue.length - 1"
          :aria-label="`下移 ${it.label}`"
          @click="move(index, 1)"
        >
          <ChevronDown :size="15" />
        </button>
      </div>

      <div v-if="index === 0" class="text-xs text-primary shrink-0 px-1" aria-label="第一志愿">
        第一志愿
      </div>
      <button
        type="button"
        class="text-xs text-danger hover:underline shrink-0"
        :aria-label="`移除 ${it.label}`"
        @click="removeAt(index)"
      >
        移除
      </button>
    </li>
    <li v-if="props.modelValue.length === 0" class="text-sm text-text-secondary py-4 text-center border border-dashed border-border-strong rounded-md">
      暂无志愿，从上方的部门列表添加
    </li>
    <li
      v-if="remainingSlots !== null"
      class="text-xs text-text-secondary px-1"
      role="status"
    >
      {{ remainingSlots === 0 ? '已达到上限，不再接受新的志愿' : `还可添加 ${remainingSlots} 项志愿` }}
    </li>
  </ol>
</template>