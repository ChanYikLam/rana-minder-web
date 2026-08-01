<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Home, ArrowLeft } from '@lucide/vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center">
    <div class="text-center px-4">
      <p class="text-6xl font-bold text-primary mb-2">404</p>
      <h1 class="text-xl font-medium text-text-primary mb-2">页面未找到</h1>
      <p class="text-sm text-text-secondary mb-6">您访问的页面不存在或已被移除</p>
      <div class="flex gap-3 justify-center">
        <button class="flex items-center gap-1.5 px-4 h-10 rounded-md border border-border text-text-primary hover:bg-subtle" @click="router.back()">
          <ArrowLeft :size="16" /> 返回上页
        </button>
        <button class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover" @click="router.push('/explore')">
          <Home :size="16" /> 首页
        </button>
      </div>
    </div>
  </div>
</template>
