<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import { useTheme } from '@/composables/useTheme'
import { Search, Bell, User, Settings, LogOut, ChevronDown, Menu, Building2, Sun, Moon, ShieldAlert } from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import RoleBadge from '@/components/business/RoleBadge.vue'

defineProps<{ onOpenMobileMenu: () => void }>()

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
const notifications = useNotificationViewStore()
const { theme, toggleTheme } = useTheme()

const isAdmin = computed(() => session.hasPermission('platform:club:manage'))

function mainNavActive(prefix: string): boolean {
  return route.path.startsWith(prefix)
}

async function handleLogout() {
  await session.logout()
  workspace.clearWorkspace()
  await router.push('/login')
}
</script>

<template>
  <header
    class="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b bg-elevated shadow-sm"
    role="banner"
  >
    <div class="flex items-center gap-4">
      <button
        class="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
        aria-label="打开导航菜单"
        @click="onOpenMobileMenu"
      >
        <Menu :size="20" />
      </button>

      <router-link to="/explore" class="flex items-center gap-2 font-bold text-primary text-lg" aria-label="RanaMinder 首页">
        <Building2 :size="24" />
        <span class="hidden sm:inline">RanaMinder</span>
      </router-link>

      <nav class="hidden md:flex items-center gap-1" role="navigation" aria-label="主导航">
        <router-link
          to="/explore"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          :class="{ 'text-primary bg-primary-subtle': mainNavActive('/explore') }"
        >
          <Search :size="16" /> 找社团/活动
        </router-link>
        <router-link
          to="/me"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          :class="mainNavActive('/me') ? 'text-primary bg-primary-subtle' : ''"
        >
          <User :size="16" /> 个人中心
        </router-link>
        <router-link
          v-if="isAdmin"
          to="/admin/clubs"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          :class="mainNavActive('/admin') ? 'text-primary bg-primary-subtle' : ''"
        >
          <ShieldAlert :size="16" /> 平台管理
        </router-link>
      </nav>
    </div>

    <div class="flex items-center gap-2">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
        :aria-label="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
        @click="toggleTheme"
      >
        <Sun v-if="theme === 'dark'" :size="18" />
        <Moon v-else :size="18" />
      </button>

      <router-link
        to="/me/notifications"
        class="relative flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
        aria-label="通知"
      >
        <Bell :size="18" />
        <span
          v-if="notifications.hasUnread"
          class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 text-xs font-bold rounded-full bg-accent text-text-on-accent"
          role="status"
        >
          {{ notifications.unreadCount > 99 ? '99+' : notifications.unreadCount }}
        </span>
      </router-link>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm hover:bg-primary-subtle transition-colors" aria-label="用户菜单">
            <div class="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-text-on-primary text-xs font-medium">
              {{ session.user?.name?.charAt(0) || '?' }}
            </div>
            <span class="hidden sm:inline text-text-secondary">{{ session.user?.name || '未登录' }}</span>
            <ChevronDown :size="14" class="text-text-secondary" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <div class="px-2 py-1.5 border-b">
            <p class="text-sm font-medium">{{ session.user?.name }}</p>
            <p class="text-xs text-text-secondary">{{ session.user?.email }}</p>
            <div v-if="workspace.currentClubId" class="mt-1.5">
              <RoleBadge />
            </div>
          </div>
          <DropdownMenuItem @click="router.push('/me/profile')" class="cursor-pointer">
            <User :size="16" class="mr-2" /> 个人资料
          </DropdownMenuItem>
          <DropdownMenuItem v-if="isAdmin" @click="router.push('/admin/clubs')" class="cursor-pointer">
            <Settings :size="16" class="mr-2" /> 平台管理
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="handleLogout" class="cursor-pointer text-danger">
            <LogOut :size="16" class="mr-2" /> 退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
</template>