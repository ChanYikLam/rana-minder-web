<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, AlertTriangle, RefreshCw } from '@lucide/vue'
import Button from '@/components/common/Button.vue'

export interface PartialResult {
  id: string
  label: string
  success: boolean
  message?: string
}

const props = defineProps<{
  results: PartialResult[]
  retrying?: boolean
  retryCount?: number
}>()

const emit = defineEmits<{
  retry: []
}>()

const succeeded = computed(() => props.results.filter((r) => r.success).length)
const failed = computed(() => props.results.filter((r) => !r.success))
const hasFailure = computed(() => failed.value.length > 0)
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated p-4">
    <div class="flex items-center gap-3 mb-3">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
        :class="hasFailure ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'"
      >
        <CheckCircle2 v-if="!hasFailure" :size="20" aria-hidden="true" />
        <AlertTriangle v-else :size="20" aria-hidden="true" />
      </div>
      <div>
        <p class="text-sm font-semibold text-text-primary">{{ hasFailure ? '部分成功' : '全部成功' }}</p>
        <p class="text-xs text-text-secondary">
          成功 {{ succeeded }} 项{{ hasFailure ? `，失败 ${failed.length} 项` : '' }}
          <span v-if="retryCount">（已重试 {{ retryCount }} 次）</span>
        </p>
      </div>
    </div>

    <ul class="space-y-1.5 max-h-72 overflow-y-auto">
      <li
        v-for="r in props.results"
        :key="r.id"
        class="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-2 text-sm"
      >
        <span class="text-text-primary min-w-0 truncate">{{ r.label }}</span>
        <span class="flex items-center gap-1 text-xs shrink-0" :class="r.success ? 'text-success' : 'text-danger'">
          <CheckCircle2 v-if="r.success" :size="13" aria-hidden="true" />
          <AlertTriangle v-else :size="13" aria-hidden="true" />
          {{ r.message || (r.success ? '成功' : '失败') }}
        </span>
      </li>
    </ul>

    <div v-if="hasFailure" class="mt-3 flex items-center justify-between gap-3">
      <p class="text-xs text-text-secondary">成功项已保留，失败项可单独重试</p>
      <Button variant="outline" :loading="retrying" @click="emit('retry')">
        <RefreshCw :size="14" class="mr-1" />
        重试失败项（{{ failed.length }}）
      </Button>
    </div>
  </div>
</template>