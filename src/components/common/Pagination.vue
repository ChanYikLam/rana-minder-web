<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = withDefaults(defineProps<{
  page: number
  pageSize?: number
  total: number
}>(), {
  pageSize: 20,
})

const emit = defineEmits<{
  'update:page': [value: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
/** 越界 page 钳制到 [1, totalPages]，避免「第 81-21 条」倒挂文案 */
const pageClamped = computed(() => Math.min(Math.max(1, props.page), totalPages.value))
const from = computed(() => (props.total === 0 ? 0 : (pageClamped.value - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, pageClamped.value * props.pageSize))

function go(p: number) {
  if (p < 1 || p > totalPages.value || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
    <p class="text-xs text-text-secondary">
      共 {{ total }} 条 · 第 {{ from }}-{{ to }} 条
    </p>
    <div class="flex items-center gap-2">
      <button
        class="flex items-center gap-1 px-2.5 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="page <= 1"
        @click="go(page - 1)"
      >
        <ChevronLeft :size="14" /> 上一页
      </button>
      <span class="text-xs text-text-secondary">{{ pageClamped }} / {{ totalPages }}</span>
      <button
        class="flex items-center gap-1 px-2.5 h-8 rounded-md border border-border text-xs text-text-primary hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="page >= totalPages"
        @click="go(page + 1)"
      >
        下一页 <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>
