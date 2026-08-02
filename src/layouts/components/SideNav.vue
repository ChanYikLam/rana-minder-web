<script setup lang="ts">
import { useRoute } from 'vue-router'
import WorkspaceNav from './WorkspaceNav.vue'
import ClubSwitcher from '@/components/business/ClubSwitcher.vue'
import type { SideNavGroup, PersonalLink } from './sideNav'

defineProps<{
  clubId: string | null
  isAdmin: boolean
  showClubIndicator: boolean
  clubGroups: SideNavGroup[]
  adminGroups: SideNavGroup[]
  personalLinks: PersonalLink[]
}>()

const route = useRoute()

function active(path: string): boolean {
  return path.length > 0 && (route.path === path || route.path.startsWith(`${path}/`))
}
</script>

<template>
  <div class="flex flex-col">
    <!-- 社团标识 / 平台标识 -->
    <div v-if="showClubIndicator" class="p-3 border-b">
      <p class="text-xs text-text-secondary mb-1 px-2">切换社团</p>
      <ClubSwitcher />
    </div>
    <div v-else-if="isAdmin" class="p-3 border-b">
      <p class="text-xs text-text-secondary mb-1">管理视角</p>
      <span class="text-sm font-medium text-primary">平台管理</span>
    </div>

    <!-- 发现与个人 -->
    <nav class="p-2" role="navigation" aria-label="个人导航">
      <p class="px-3 pt-1 pb-1 text-xs font-medium text-text-secondary">发现与个人</p>
      <router-link
        v-for="link in personalLinks"
        :key="link.label"
        :to="link.path"
        class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
        :class="active(link.path) ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
      >
        <component :is="link.icon" :size="16" />
        {{ link.label }}
      </router-link>
    </nav>

    <!-- 社团管理 -->
    <template v-if="showClubIndicator">
      <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">社团管理</p>
      <WorkspaceNav :groups="clubGroups" />
    </template>

    <!-- 平台 -->
    <template v-if="isAdmin">
      <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">平台</p>
      <WorkspaceNav :groups="adminGroups" />
    </template>
  </div>
</template>