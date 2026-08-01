<script setup lang="ts">
import { Building2 } from '@lucide/vue'
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <!-- 背景几何装饰（非渐变，墨青色系线条） -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <svg class="absolute top-0 left-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--primary)" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>

    <div class="relative w-full max-w-[420px]">
      <div class="flex flex-col items-center mb-8">
        <div class="flex items-center justify-center w-14 h-14 rounded-lg bg-primary text-text-on-primary mb-3">
          <Building2 :size="28" />
        </div>
        <h1 class="text-2xl font-bold text-primary">RanaMinder</h1>
        <p class="text-sm text-text-secondary mt-1">高校学生社团人员管理系统</p>
      </div>

      <slot />
    </div>
  </div>
</template>
