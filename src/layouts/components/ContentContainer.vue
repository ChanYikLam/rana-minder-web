<script setup lang="ts">
// 内容容器：最大宽度 1400px 居中，含页头辅助区域
const props = withDefaults(defineProps<{ maxWidth?: string }>(), { maxWidth: 'max-w-[1400px]' })
</script>

<template>
  <div class="w-full mx-auto p-4 md:p-6" :class="props.maxWidth">
    <slot />
  </div>
</template>