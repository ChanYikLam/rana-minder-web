<script setup lang="ts">
import { computed } from 'vue'
import { Clock3 } from '@lucide/vue'
import { useSessionViewStore } from '@/state/sessionViewStore'

// 降级提示条（SRS-FAIL-001/002）
// - 15 分钟窗口内：展示剩余时间与最小白名单范围
// - 超过 15 分钟：覆盖由路由守卫重定向到 P-GEN-03，本组件仅展示窗口内信息

const session = useSessionViewStore()

const remainingMinutes = computed(() => {
  const ms = session.degradedWindowRemainingMs
  if (ms <= 0) return 0
  return Math.ceil(ms / 1000 / 60)
})

const visible = computed(() => session.degraded && session.inDegradedWindow)
</script>

<template>
  <div
    v-if="visible"
    role="status"
    aria-live="polite"
    class="flex items-start gap-3 rounded-md border border-warning-strong bg-warning-subtle px-4 py-3"
  >
    <Clock3 data-slot="degraded-icon" class="mt-0.5 shrink-0" :size="18" aria-hidden="true" />
    <div class="min-w-0">
      <p class="text-sm font-medium text-warning">统一身份认证服务暂时不可用</p>
      <p class="mt-0.5 text-xs text-text-secondary">
        您仍可在剩余 {{ remainingMinutes }} 分钟内查看本人资料与编辑既有申请草稿（附件暂不开放），
        其他受保护功能已临时关闭。
      </p>
    </div>
  </div>
</template>