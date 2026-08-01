<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  pageFamily?: 'list' | 'form' | 'workspace' | 'high_risk' | 'detail'
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  pageFamily: 'list',
})
</script>

<template>
  <div
    :class="cn(
      'flex items-center gap-2',
      // Mobile: bottom fixed action bar
      'sticky bottom-0 md:static',
      'bg-elevated border-t md:border-t-0 md:bg-transparent',
      'px-4 py-3 md:px-0 md:py-0',
      'safe-area-bottom',
      props.className
    )"
    role="region"
    aria-label="操作区域"
  >
    <slot />
  </div>
</template>

<style scoped>
.safe-area-bottom {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}
</style>
