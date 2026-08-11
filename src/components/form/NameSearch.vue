<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Search } from '@lucide/vue'

export interface SearchResult {
  id: string
  name: string
  subtitle?: string
  group: string
  match: 'exact' | 'substring' | 'fuzzy'
  score: number
}

const props = defineProps<{
  modelValue: string
  results: SearchResult[]
  loading?: boolean
  placeholder?: string
  emptyText?: string
  failed?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [result: SearchResult]
}>()

const open = ref(false)

const grouped = computed(() => {
  const map = new Map<string, SearchResult[]>()
  for (const r of props.results) {
    if (!map.has(r.group)) map.set(r.group, [])
    map.get(r.group)!.push(r)
  }
  return Array.from(map.entries())
})

let blurTimer: ReturnType<typeof setTimeout> | null = null

function onSelect(r: SearchResult) {
  emit('select', r)
  open.value = false
}

function onFocus() {
  open.value = true
}

function onBlur() {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => { open.value = false }, 120)
}

onUnmounted(() => {
  if (blurTimer) { clearTimeout(blurTimer); blurTimer = null }
})
</script>

<template>
  <div class="relative">
    <div class="flex items-center gap-2 rounded-md border border-border bg-elevated px-3 h-10 focus-within:border-primary">
      <Search :size="16" class="text-text-secondary shrink-0" aria-hidden="true" />
      <input
        :value="props.modelValue"
        type="search"
        class="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        :placeholder="props.placeholder || '输入姓名或学号搜索'"
        aria-label="搜索名称"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="onFocus"
        @blur="onBlur"
      />
    </div>

    <div
      v-if="open && (props.modelValue || props.loading)"
      class="absolute z-20 mt-1 w-full rounded-md border border-border bg-elevated shadow-lg"
      role="listbox"
    >
      <p v-if="props.loading" class="px-3 py-3 text-sm text-text-secondary">搜索中...</p>
      <p
        v-else-if="props.modelValue && !props.failed && props.results.length === 0"
        class="px-3 py-3 text-sm text-text-secondary"
        role="status"
      >
        {{ props.emptyText || '未找到匹配结果' }}
      </p>
      <template v-for="[group, items] in grouped" :key="group">
        <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">{{ group }}</p>
        <button
          v-for="r in items"
          :key="r.id"
          type="button"
          role="option"
          class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle transition-colors"
          @mousedown.prevent="onSelect(r)"
        >
          <span class="min-w-0">
            <span class="block truncate text-text-primary">{{ r.name }}</span>
            <span v-if="r.subtitle" class="block text-xs text-text-secondary truncate">{{ r.subtitle }}</span>
          </span>
          <span
            class="shrink-0 text-[10px] rounded-full border px-1.5 py-0.5"
            :class="r.match === 'exact' ? 'text-success border-success/40' : r.match === 'substring' ? 'text-info border-info/40' : 'text-warning border-warning/40'"
          >
            {{ r.match === 'exact' ? '精确' : r.match === 'substring' ? '包含' : '近似' }}
          </span>
        </button>
      </template>
    </div>
  </div>
</template>