<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useTheme } from '@/composables/useTheme'
import DegradedBanner from '@/components/business/DegradedBanner.vue'
import { Search, Bell, User, Building2, ChevronDown, Settings, LogOut, Sun, Moon } from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import RoleBadge from '@/components/business/RoleBadge.vue'

const router = useRouter()
const session = useSessionViewStore()
const notifications = useNotificationViewStore()
const workspace = useWorkspaceContextStore()
const { theme, toggleTheme } = useTheme()

const isAdmin = computed(() => {
  return session.hasPermission('platform:club:manage') ||
    session.hasPermission('platform:form:design') ||
    session.hasPermission('platform:config:manage') ||
    session.hasPermission('platform:audit:view') ||
    session.hasPermission('platform:export:execute') ||
    session.hasPermission('platform:delete:execute') ||
    session.hasPermission('platform:ops:view')
})

async function handleLogout() {
  await session.logout()
  workspace.clearWorkspace()
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <a
      href="#public-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
    >
      跳到主内容
    </a>
    <!-- Top Nav (simplified for public pages) -->
    <header
      class="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b bg-elevated shadow-sm"
      role="banner"
    >
      <div class="flex items-center gap-4">
        <router-link to="/explore" class="flex items-center gap-2 font-bold text-primary text-lg" aria-label="RanaMinder 首页">
          <Building2 :size="24" />
          <span class="hidden sm:inline">RanaMinder</span>
        </router-link>

        <nav class="flex items-center gap-1" role="navigation" aria-label="主导航">
          <router-link
            to="/explore"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          >
            <Search :size="16" />
            <span class="hidden sm:inline">找社团/活动</span>
          </router-link>
          <router-link
            v-if="session.isAuthenticated"
            to="/me"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          >
            <User :size="16" />
            <span class="hidden sm:inline">个人中心</span>
          </router-link>
          <router-link
            v-else
            to="/login"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-on-primary bg-primary hover:bg-primary-hover transition-colors"
          >
            登录
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
          v-if="session.isAuthenticated"
          to="/me/notifications"
          class="relative flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          aria-label="通知"
        >
          <Bell :size="18" />
          <span
            v-if="notifications.hasUnread"
            class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 text-xs font-bold rounded-full bg-accent text-text-on-accent"
          >
            {{ notifications.unreadCount > 99 ? '99+' : notifications.unreadCount }}
          </span>
        </router-link>

        <DropdownMenu v-if="session.isAuthenticated">
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

    <!-- Body: Sidebar + Content -->
    <div class="flex flex-1">
      <aside
        class="hidden lg:flex flex-col w-56 border-r bg-elevated overflow-y-auto"
        role="complementary"
        aria-label="主导航"
      >
        <nav class="p-2" role="navigation" aria-label="个人导航">
          <p class="px-3 pt-1 pb-1 text-xs font-medium text-text-secondary">发现与个人</p>
          <router-link
            to="/explore"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="$route.path.startsWith('/explore') ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
          >
            <Search :size="16" /> 公开发现
          </router-link>
          <router-link
            v-if="session.isAuthenticated"
            to="/me"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="$route.path.startsWith('/me') ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
          >
            <User :size="16" /> 个人空间
          </router-link>
          <router-link
            v-else
            to="/login"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-text-secondary hover:text-primary hover:bg-subtle"
          >
            <User :size="16" /> 登录
          </router-link>
        </nav>
      </aside>

      <!-- Main Content -->
      <main id="public-main" class="flex-1 overflow-y-auto" role="main" tabindex="-1">
        <div class="mx-auto max-w-[1400px] p-4 md:p-6">
          <div class="mb-4"><DegradedBanner /></div>
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
