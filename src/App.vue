<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'
import { Toaster } from '@/components/ui/sonner'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'

const route = useRoute()
const session = useSessionViewStore()
const notifications = useNotificationViewStore()

const layout = computed(() => {
  // 404 页（P-GEN-01）按登录态动态布局：已登录保留导航便于返回，未登录用简洁公开布局。
  // guard.ts 已对 P-GEN-01 加载会话，故刷新直达 404 时此处也能拿到正确登录态。
  if (route.name === 'P-GEN-01') {
    return session.isAuthenticated ? DefaultLayout : PublicLayout
  }
  const meta = route.meta.layout
  if (meta === 'auth') return AuthLayout
  if (meta === 'public') return PublicLayout
  return DefaultLayout
})

watch(
  () => session.isAuthenticated,
  (authed) => {
    if (authed) {
      notifications.loadUnreadCount()
    }
  },
  { immediate: true }
)
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
  <Toaster />
</template>
