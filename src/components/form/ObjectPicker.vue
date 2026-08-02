<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@lucide/vue'

export type ObjectGroupType = 'person' | 'club' | 'department' | 'position'

export interface PickerGroup {
  type: ObjectGroupType
  label: string
  items: { id: string; label: string; subtitle?: string }[]
}

const props = defineProps<{
  groups: PickerGroup[]
  multiple?: boolean
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [ids: string[]]
}>()

const query = ref('')

const normalized = (s: string) => s.toLowerCase().replace(/\s/g, '')
const isSubsequence = (hay: string, needle: string): boolean => {
  if (!needle) return true
  let i = 0
  for (const ch of hay) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

const filtered = computed(() => {
  const q = normalized(query.value)
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((it) => isSubsequence(normalized(it.label + it.subtitle || ''), q)),
    }))
    .filter((group) => group.items.length > 0)
})

function toggle(id: string) {
  if (props.multiple) {
    const next = props.modelValue.includes(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id]
    emit('update:modelValue', next)
  } else {
    emit('update:modelValue', props.modelValue.includes(id) ? [] : [id])
  }
}

function isSelected(id: string): boolean {
  return props.modelValue.includes(id)
}
</script>

<template>
  <div class="rounded-md border border-border bg-elevated">
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <Search :size="14" class="text-text-secondary" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        class="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        placeholder="搜索对象（支持中文连续子串）"
        aria-label="搜索对象"
      />
    </div>

    <div class="max-h-64 overflow-y-auto p-2" role="listbox" :aria-multiselectable="multiple || undefined">
      <template v-for="group in filtered" :key="group.type">
        <p class="px-2 pt-2 pb-1 text-xs font-medium text-text-secondary">{{ group.label }}</p>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="isSelected(item.id)"
          class="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors"
          :class="isSelected(item.id) ? 'bg-primary-subtle text-primary' : 'text-text-primary hover:bg-subtle'"
          @click="toggle(item.id)"
        >
          <span class="min-w-0">
            <span class="block truncate">{{ item.label }}</span>
            <span v-if="item.subtitle" class="block text-xs text-text-secondary truncate">{{ item.subtitle }}</span>
          </span>
        </button>
      </template>
      <p v-if="filtered.length === 0" class="px-3 py-6 text-sm text-text-secondary text-center">无匹配结果</p>
    </div>
  </div>
</template>