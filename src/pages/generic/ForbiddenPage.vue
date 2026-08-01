<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Lock, Home, ArrowLeft } from '@lucide/vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center">
    <div class="text-center px-4 max-w-md">
      <div class="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-danger-subtle text-danger">
        <Lock :size="32" />
      </div>
      <h1 class="text-xl font-medium text-text-primary mb-2">无权限访问</h1>
      <p class="text-sm text-text-secondary mb-1">您没有访问此页面的权限</p>
      <p class="text-xs text-muted-foreground mb-6">如需帮助，请联系管理员</p>
      <div class="flex gap-3 justify-center">
        <button class="flex items-center gap-1.5 px-4 h-10 rounded-md border border-border text-text-primary hover:bg-subtle" @click="router.back()">
          <ArrowLeft :size="16" /> 返回上页
        </button>
        <button class="flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover" @click="router.push('/me')">
          <Home :size="16" /> 个人中心
        </button>
      </div>
    </div>
  </div>
</template>
