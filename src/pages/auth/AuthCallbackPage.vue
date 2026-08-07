<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { resolveLoginTarget, parseSameOriginRedirect } from './loginTarget'

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    await session.loadSession()
    if (!session.isAuthenticated) {
      error.value = '未能建立登录会话，请返回登录页后重试。'
      return
    }
    // 与登录页/根守卫同一落点口径：redirect 校验同源后优先；
    // 资料未完善（needsProfileGate）时 redirect 也让位，直达 P-GEN-04，避免闪跳
    const target = resolveLoginTarget({
      workspace: session.workspace,
      hasPermission: (permission) => session.hasPermission(permission),
      requestedRedirect: parseSameOriginRedirect(route.query.redirect),
      needsProfileGate: session.needsProfileGate,
    })
    await router.replace(target)
  } catch {
    error.value = '登录回调处理失败，请返回登录页后重试。'
  }
})
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated shadow-md p-8 text-center">
    <template v-if="!error">
      <div class="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" />
      <h1 class="text-lg font-semibold text-primary">正在完成登录</h1>
      <p class="mt-2 text-sm text-text-secondary">正在验证您的登录会话，请稍候。</p>
    </template>
    <template v-else>
      <h1 class="text-lg font-semibold text-primary">登录未完成</h1>
      <p class="mt-2 text-sm text-danger" role="alert">{{ error }}</p>
      <router-link to="/login" class="mt-6 inline-flex text-sm text-primary hover:underline">返回登录页</router-link>
    </template>
  </div>
</template>
