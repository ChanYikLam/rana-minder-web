<script setup lang="ts">
import { computed } from 'vue'
import { ClipboardList, Play } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

export interface BatchItem {
  id: string
  label: string
}

const props = withDefaults(defineProps<{
  selected: BatchItem[]
  executing?: boolean
  actionLabel?: string
}>(), {
  executing: false,
  actionLabel: '执行批量操作',
})

const emit = defineEmits<{
  preview: []
  execute: []
}>()

const previewItems = computed(() => props.selected.slice(0, 5))
const more = computed(() => props.selected.length - previewItems.value.length)
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated p-4">
    <div class="flex items-center justify-between mb-3">
      <p class="flex items-center gap-1.5 text-sm font-medium text-text-primary">
<ClipboardList :size="16" class="text-primary" aria-hidden="true" />
      已选对象（{{ selected.length }}）
      </p>
    </div>

    <div class="mb-4 space-y-1">
      <p
        v-for="item in previewItems"
        :key="item.id"
        class="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5 text-sm"
      >
        <span class="text-text-primary">{{ item.label }}</span>
        <span class="text-xs text-text-secondary">待处理</span>
      </p>
      <p v-if="more > 0" class="px-2.5 text-xs text-text-secondary">…… 另有 {{ more }} 项未列出</p>
      <p v-if="selected.length === 0" class="px-2.5 py-3 text-sm text-text-secondary text-center">
        请先选择需要批量操作的对象
      </p>
    </div>

    <div class="flex flex-col-reverse sm:flex-row gap-2">
      <Button variant="outline" class="sm:w-auto" :disabled="selected.length === 0" @click="emit('preview')">
        预览固定清单
      </Button>
      <Button
        class="w-full sm:flex-1"
        :disabled="selected.length === 0"
        :loading="executing"
        @click="emit('execute')"
      >
        <Play :size="14" class="mr-1" />
        {{ executing ? '执行中…' : `${actionLabel}（${selected.length}）` }}
      </Button>
    </div>
  </div>
</template>