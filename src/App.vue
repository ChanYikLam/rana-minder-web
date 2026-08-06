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
