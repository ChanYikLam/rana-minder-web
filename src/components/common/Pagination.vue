<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  current: number
  total: number
  pageSize?: number
  maxVisible?: number
}>(), {
  pageSize: 20,
  maxVisible: 7,
})

const emit = defineEmits<{
  'update:current': [page: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const pages = computed(() => {
  const result: Array<number | 'ellipsis'> = []
  const tp = totalPages.value
  const cur = props.current
  const mv = props.maxVisible

  if (tp <= mv) {
    for (let i = 1; i <= tp; i++) result.push(i)
    return result
  }

  const half = Math.floor(mv / 2)
  let start = Math.max(1, cur - half)
  let end = Math.min(tp, start + mv - 1)

  if (end - start + 1 < mv) {
    start = Math.max(1, end - mv + 1)
  }

  if (start > 1) {
    result.push(1)
    if (start > 2) result.push('ellipsis')
  }

  for (let i = start; i <= end; i++) {
    result.push(i)
  }

  if (end < tp) {
    if (end < tp - 1) result.push('ellipsis')
    result.push(tp)
  }

  return result
})

function goTo(page: number) {
  if (page < 1 || page > totalPages.value || page === props.current) return
  emit('update:current', page)
}
</script>

<template>
  <nav v-if="totalPages > 1" aria-label="分页导航" class="flex items-center justify-center gap-1">
    <Button
      variant="ghost"
      size="icon-sm"
      :disabled="current <= 1"
      aria-label="上一页"
      @click="goTo(current - 1)"
    >
      <span aria-hidden="true">&laquo;</span>
    </Button>

    <template v-for="page in pages" :key="page">
      <span v-if="page === 'ellipsis'" class="px-2 text-text-secondary">&hellip;</span>
      <Button
        v-else
        :variant="page === current ? 'primary' : 'ghost'"
        size="icon-sm"
        :aria-label="`第 ${page} 页`"
        :aria-current="page === current ? 'page' : undefined"
        @click="goTo(page)"
      >
        {{ page }}
      </Button>
    </template>

    <Button
      variant="ghost"
      size="icon-sm"
      :disabled="current >= totalPages"
      aria-label="下一页"
      @click="goTo(current + 1)"
    >
      <span aria-hidden="true">&raquo;</span>
    </Button>
  </nav>
</template>