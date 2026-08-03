<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Filter, X } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterField {
  key: string
  label: string
  options: FilterOption[]
  multiple?: boolean
}

export interface DeadlineShortcut {
  label: string
  fieldKey: string
  /** 相对当前时刻的截止（天，正数=未来） */
  offsetDays: number
}

const props = defineProps<{
  fields: FilterField[]
  searchable?: boolean
  searchPlaceholder?: string
  deadlineShortcuts?: DeadlineShortcut[]
}>()

const emit = defineEmits<{
  change: [value: Record<string, string[] | string>]
}>()

const search = ref('')
const values = ref<Record<string, string[]>>({})
const open = ref(false)

const activeCount = computed(() => Object.values(values.value).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0))

function toggle(key: string, val: string) {
  const cur = values.value[key] ? [...values.value[key]] : []
  const idx = cur.indexOf(val)
  if (idx >= 0) cur.splice(idx, 1)
  else cur.push(val)
  values.value[key] = cur
  emitChange()
}

function applyShortcut(fieldKey: string, offsetDays: number) {
  const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  values.value[fieldKey] = [target.toISOString()]
  emitChange()
}

function resetSearch() {
  search.value = ''
  values.value = {}
  emit('change', {})
}

function emitChange() {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(values.value)) {
    if (v.length === 1 && !props.fields.find((f) => f.key === k)?.multiple) out[k] = v[0]
    else if (v.length > 0) out[k] = v
  }
  if (search.value) out.search = search.value
  emit('change', out)
}
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated">
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <Search :size="15" class="text-text-secondary shrink-0" aria-hidden="true" />
      <input
        v-model="search"
        type="search"
        class="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        :placeholder="searchPlaceholder || '搜索名称…'"
        @input="emitChange"
      />
      <button
        class="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-subtle text-text-secondary"
        :class="activeCount > 0 ? 'text-primary' : ''"
        :aria-expanded="open"
        @click="open = !open"
      >
        <Filter :size="14" aria-hidden="true" />
        筛选{{ activeCount > 0 ? `（${activeCount}）` : '' }}
      </button>
      <button
        v-if="search || activeCount > 0"
        class="text-text-secondary hover:text-primary p-1"
        aria-label="清除筛选"
        @click="resetSearch"
      >
        <X :size="14" />
      </button>
    </div>

    <div v-if="open" class="p-3 space-y-3">
      <div v-for="field in fields" :key="field.key">
        <p class="text-xs font-medium text-text-secondary mb-1.5">{{ field.label }}</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in field.options"
            :key="opt.value"
            type="button"
            class="rounded-full border px-2.5 py-1 text-xs transition-colors"
            :class="(values[field.key] || []).includes(opt.value)
              ? 'border-primary bg-primary-subtle text-primary'
              : 'border-border text-text-secondary hover:border-border-strong'"
            @click="toggle(field.key, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <template v-if="deadlineShortcuts?.length">
        <div>
          <p class="text-xs font-medium text-text-secondary mb-1.5">截止范围</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in deadlineShortcuts"
              :key="s.label"
              type="button"
              class="rounded-md border px-2.5 py-1 text-xs transition-colors"
              :class="values[s.fieldKey]?.length ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-text-secondary hover:border-border-strong'"
              @click="applyShortcut(s.fieldKey, s.offsetDays)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
      </template>

      <div class="flex justify-end">
        <Button variant="ghost" size="sm" @click="resetSearch">重置</Button>
      </div>
    </div>
  </div>
</template>