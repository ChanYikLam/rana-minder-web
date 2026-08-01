<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'

const route = useRoute()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
const notifications = useNotificationViewStore()

const layout = computed(() => {
  const meta = route.meta.layout
  if (meta === 'auth') return AuthLayout
  if (meta === 'public') return PublicLayout
  return DefaultLayout
})

watch(
  () => route.params.clubId,
  (clubId) => {
    if (clubId && typeof clubId === 'string') {
      if (workspace.currentClubId !== clubId) {
        workspace.setWorkspace(clubId, '计算机协会', 'club_leader', session.permissions)
      }
    }
  },
  { immediate: true }
)

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
</template>
