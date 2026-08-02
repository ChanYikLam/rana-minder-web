<script setup lang="ts">
import { computed } from 'vue'

export interface ChartSeries {
  label: string
  value: number
  color?: string
}

const props = withDefaults(defineProps<{
  title?: string
  series: ChartSeries[]
  smallSampleThreshold?: number
  unit?: string
}>(), {
  smallSampleThreshold: 5,
})

const max = computed(() => Math.max(...props.series.map((s) => s.value), 1))
const total = computed(() => props.series.reduce((n, s) => n + s.value, 0))

/** 小样本保护：总量过小时降低置信度提示 */
const smallSample = computed(() => total.value > 0 && total.value <= props.smallSampleThreshold)
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated p-4">
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm font-medium text-text-primary">{{ title }}</p>
      <span v-if="unit" class="text-xs text-text-secondary">单位：{{ unit }}</span>
    </div>

    <div class="flex items-end gap-4" role="img" :aria-label="title ? `${title} 统计图` : '统计图'">
      <div
        v-for="s in series"
        :key="s.label"
        class="flex-1 flex flex-col items-center gap-1"
      >
        <span class="text-xs text-text-primary font-medium">{{ s.value }}</span>
        <div
          class="w-full rounded-t-sm transition-all"
          :class="s.color || 'bg-primary'"
          :style="{ height: `${Math.max(6, (s.value / max) * 96)}px` }"
          :aria-label="`${s.label}：${s.value}${unit || ''}`"
        />
        <span class="text-xs text-text-secondary truncate w-full text-center">{{ s.label }}</span>
      </div>
    </div>

    <p v-if="smallSample" class="mt-3 text-xs text-warning">
      数据样本较少（共 {{ total }}{{ unit || ' 条' }}），统计结果仅供趋势参考。
    </p>
  </div>
</template>