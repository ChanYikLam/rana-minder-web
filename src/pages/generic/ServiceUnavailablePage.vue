<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Wrench, Compass, RefreshCw } from '@lucide/vue'
import { useSessionViewStore } from '@/state/sessionViewStore'

const session = useSessionViewStore()
const retrying = ref(false)
// P2-16：延时重载句柄——页面卸载时取消，避免用户离开后仍被强制刷新
let retryTimer: ReturnType<typeof setTimeout> | null = null

const remainingMinutes = computed(() => {
  const ms = session.degradedWindowRemainingMs
  if (ms <= 0) return 0
  return Math.ceil(ms / 1000 / 60)
})

function handleRetry() {
  if (retrying.value) return
  retrying.value = true
  // mock: 模拟重新探测依赖状态
  retryTimer = setTimeout(() => {
    retryTimer = null
    try {
      window.location.reload()
    } finally {
      retrying.value = false
    }
  }, 1200)
}

onUnmounted(() => {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
})
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center">
    <div class="max-w-md text-center px-4">
      <div class="flex items-center justify-center w-20 h-20 mx-auto mb-6 rounded-full bg-warning-subtle text-warning">
        <Wrench :size="40" />
      </div>

      <h1 class="text-2xl font-bold text-primary mb-2">服务暂时不可用</h1>
      <p class="text-sm text-text-secondary mb-1">
        统一身份认证服务暂时不可用，部分功能已暂停
      </p>
      <p class="text-xs text-muted-foreground mb-4">
        受影响的范围：登录、报名、邀请确认等需要身份核验的操作
      </p>

      <p
        v-if="session.degraded && session.inDegradedWindow"
        class="text-xs text-warning bg-warning-subtle rounded-md px-3 py-2 mb-4"
      >
        降级最小白名单剩余 {{ remainingMinutes }} 分钟（可查看本人资料与既有草稿）
      </p>

      <div class="rounded-lg border border-border bg-elevated p-4 mb-6 text-left">
        <p class="text-sm font-medium text-primary mb-2">您现在可以：</p>
        <ul class="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
          <li>浏览公开的社团与招新活动</li>
          <li>等待服务恢复后重新尝试</li>
        </ul>
      </div>

      <div class="flex flex-col gap-3">
        <button
          class="w-full h-11 flex items-center justify-center gap-2 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
          :disabled="retrying"
          @click="handleRetry"
        >
          <RefreshCw :size="16" :class="retrying ? 'animate-spin' : ''" />
          {{ retrying ? '正在检测服务状态...' : '重新检测' }}
        </button>
        <router-link
          to="/explore"
          class="w-full h-11 flex items-center justify-center gap-2 rounded-md border border-border text-primary hover:bg-subtle transition-colors"
        >
          <Compass :size="16" />
          浏览公开内容
        </router-link>
      </div>

      <p class="mt-6 text-xs text-muted-foreground">
        系统将在服务恢复后自动可用，通常不超过 15 分钟
      </p>
    </div>
  </div>
</template>
