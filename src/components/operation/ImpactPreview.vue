<script setup lang="ts">
import { computed } from 'vue'
import { Users, Building2, Bell, Lock } from '@lucide/vue'

export interface ImpactItem {
  id: string
  label: string
  detail?: string
}

const props = defineProps<{
  clubName?: string
  department?: string
  targets: ImpactItem[]
  notifyCount?: number
  irreversible?: boolean
}>()

const scopeRows = computed(() => [
  { icon: Building2, label: '目标社团', value: props.clubName || '-' },
  { icon: Users, label: '涉及部门', value: props.department || '全部部门' },
  { icon: Bell, label: '预计通知', value: `${props.notifyCount ?? props.targets.length} 位对象` },
  { icon: Lock, label: '边界', value: props.irreversible ? '不可逆，执行后将产生事实记录' : '可回退' },
])
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated p-4">
    <p class="text-sm font-medium text-text-primary mb-3">影响预览</p>

    <dl class="space-y-2">
      <div v-for="row in scopeRows" :key="row.label" class="flex items-center gap-2 text-sm">
        <dt class="flex items-center gap-1.5 text-text-secondary w-24 shrink-0">
          <component :is="row.icon" :size="14" aria-hidden="true" />
          {{ row.label }}
        </dt>
        <dd class="text-text-primary" :class="row.label === '边界' && props.irreversible ? 'text-danger font-medium' : ''">
          {{ row.value }}
        </dd>
      </div>
    </dl>

    <div class="mt-3 pt-3 border-t border-border">
      <p class="text-xs text-text-secondary mb-1.5">目标对象清单（{{ props.targets.length }}）</p>
      <ul class="space-y-1 max-h-40 overflow-y-auto">
        <li
          v-for="t in props.targets"
          :key="t.id"
          class="flex items-start justify-between gap-2 text-sm"
        >
          <span class="text-text-primary">{{ t.label }}</span>
          <span v-if="t.detail" class="text-xs text-text-secondary shrink-0">{{ t.detail }}</span>
        </li>
      </ul>
    </div>

    <p v-if="props.irreversible" class="mt-3 text-xs text-danger bg-danger-subtle rounded-md px-2 py-1.5">
      此操作不可逆，将产生正式记录，请在执行前确认范围。
    </p>
  </div>
</template>