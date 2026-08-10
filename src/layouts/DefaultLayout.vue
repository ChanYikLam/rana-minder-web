<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import {
  Search, Bell, User, Settings, LogOut, ChevronDown, Menu, X, Sun, Moon,
  Building2, Users, ShieldAlert,
} from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Drawer, DrawerContent, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer'
import WorkspaceNav from './components/WorkspaceNav.vue'
import { buildClubGroups, ADMIN_NAV } from './components/sideNav'
import ClubSwitcher from '@/components/business/ClubSwitcher.vue'
import Breadcrumbs from '@/components/business/Breadcrumbs.vue'
import RoleBadge from '@/components/business/RoleBadge.vue'
import { useTheme } from '@/composables/useTheme'
import { useUserMenu } from '@/composables/useUserMenu'

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
const notifications = useNotificationViewStore()
const { theme, toggleTheme } = useTheme()
const { canAccessPlatformAdmin, hasAnyPlatformPermission: isAdmin, handleLogout } = useUserMenu({ beforeRedirect: closeMobileNav })

const currentClubId = computed(() => workspace.currentClubId)
const clubIdFromRoute = computed(() => (route.params.clubId as string) || currentClubId.value)

const canAccess = (permission?: string, permissionAny?: string[]) => {
  if (permissionAny && permissionAny.length > 0) {
    return permissionAny.some((p) => workspace.hasPermission(p))
  }
  return !permission || workspace.hasPermission(permission)
}

const navGroups = computed(() => (clubIdFromRoute.value ? buildClubGroups(clubIdFromRoute.value, canAccess) : []))

/** 当前社团存在任何可用管理功能时，才展示"切换社团/社团管理"工作空间入口 */
const canAccessWorkspace = computed(() => navGroups.value.length > 0)
const canAccessDashboard = computed(() => !!clubIdFromRoute.value && canAccess('club:dashboard:view'))

const adminNavGroups = ADMIN_NAV

const mobileNavOpen = ref(false)

function closeMobileNav() {
  mobileNavOpen.value = false
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <a
      href="#default-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
    >
      跳到主内容
    </a>
    <!-- Top Navigation -->
    <header
      class="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b bg-elevated shadow-sm"
      role="banner"
    >
      <div class="flex items-center gap-4">
        <button
          class="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
          aria-label="打开导航菜单"
          @click="mobileNavOpen = true"
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
            :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/explore') }"
          >
            <Search :size="16" /> 找社团/活动
          </router-link>
          <router-link
            to="/me"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
            :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/me') }"
          >
            <User :size="16" /> 个人中心
          </router-link>
          <router-link
            v-if="canAccessPlatformAdmin"
            to="/admin/clubs"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
            :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/admin') }"
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
            <DropdownMenuItem v-if="canAccessPlatformAdmin" @click="router.push('/admin/clubs')" class="cursor-pointer">
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
        <!-- 社团标识 / 平台标识 -->
        <div v-if="canAccessWorkspace" class="p-3 border-b">
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
            to="/explore"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="route.path.startsWith('/explore') ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
          >
            <Search :size="16" /> 公开发现
          </router-link>
          <router-link
            v-if="canAccessDashboard"
            :to="`/org/${clubIdFromRoute}/dashboard`"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="route.path.startsWith(`/org/${clubIdFromRoute}/dashboard`) ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
          >
            <Users :size="16" /> 我的工作台
          </router-link>
          <router-link
            to="/me"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
            :class="route.path.startsWith('/me') ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
          >
            <User :size="16" /> 个人空间
          </router-link>
        </nav>

        <!-- 社团管理 -->
        <template v-if="canAccessWorkspace">
          <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">社团管理</p>
          <WorkspaceNav :groups="navGroups" />
        </template>

        <!-- 平台 -->
        <template v-if="isAdmin">
          <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">平台</p>
          <WorkspaceNav :groups="adminNavGroups" />
        </template>
      </aside>

      <!-- Main Content -->
      <main id="default-main" class="flex-1 overflow-y-auto" role="main" tabindex="-1">
        <div class="mx-auto max-w-[1400px] p-4 md:p-6">
          <div class="mb-4">
            <Breadcrumbs />
          </div>
          <slot />
        </div>
      </main>
    </div>

    <!-- Mobile Drawer Navigation -->
    <Drawer :open="mobileNavOpen" @update:open="(v: boolean) => (mobileNavOpen = v)">
      <DrawerContent class="bg-elevated">
        <div class="mx-auto w-full max-w-sm flex items-center justify-between px-4 py-3">
          <DrawerTitle class="text-base">导航菜单</DrawerTitle>
          <button
            class="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
            aria-label="关闭导航菜单"
            @click="closeMobileNav"
          >
            <X :size="18" />
          </button>
        </div>
        <DrawerDescription class="sr-only">主导航与工作空间导航</DrawerDescription>
        <div class="mx-auto w-full max-w-sm overflow-y-auto max-h-[70vh]">
          <nav class="flex flex-wrap items-center gap-1 px-4 pb-3 border-b border-border" role="navigation" aria-label="主导航">
            <router-link
              to="/explore"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
              :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/explore') }"
              @click="closeMobileNav"
            >
              <Search :size="16" /> 找社团/活动
            </router-link>
            <router-link
              to="/me"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
              :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/me') }"
              @click="closeMobileNav"
            >
              <User :size="16" /> 个人中心
            </router-link>
            <router-link
              v-if="canAccessPlatformAdmin"
              to="/admin/clubs"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
              :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/admin') }"
              @click="closeMobileNav"
            >
              <ShieldAlert :size="16" /> 平台管理
            </router-link>
          </nav>
          <div v-if="canAccessWorkspace" class="px-4 pt-3">
            <p class="text-xs text-text-secondary mb-1">切换社团</p>
            <ClubSwitcher />
          </div>
          <div v-else-if="isAdmin" class="px-4 pt-3">
            <p class="text-xs text-text-secondary mb-1">管理视角</p>
            <span class="text-sm font-medium text-primary">平台管理</span>
          </div>
          <nav class="p-2" role="navigation" aria-label="个人导航">
            <p class="px-3 pt-2 pb-1 text-xs font-medium text-text-secondary">发现与个人</p>
            <router-link
              to="/explore"
              class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-subtle transition-colors"
              :class="route.path.startsWith('/explore') ? 'text-primary font-medium' : ''"
              @click="closeMobileNav"
            >
              <Search :size="16" /> 公开发现
            </router-link>
            <router-link
              v-if="canAccessDashboard"
              :to="`/org/${clubIdFromRoute}/dashboard`"
              class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-subtle transition-colors"
              :class="route.path.startsWith(`/org/${clubIdFromRoute}/dashboard`) ? 'text-primary font-medium' : ''"
              @click="closeMobileNav"
            >
              <Users :size="16" /> 我的工作台
            </router-link>
            <router-link
              to="/me"
              class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-subtle transition-colors"
              :class="route.path.startsWith('/me') ? 'text-primary font-medium' : ''"
              @click="closeMobileNav"
            >
              <User :size="16" /> 个人空间
            </router-link>
          </nav>
          <template v-if="canAccessWorkspace">
            <p class="px-4 pt-2 pb-1 text-xs font-medium text-text-secondary">社团管理</p>
            <WorkspaceNav :groups="navGroups" />
          </template>
          <template v-if="isAdmin">
            <p class="px-4 pt-2 pb-1 text-xs font-medium text-text-secondary">平台</p>
            <WorkspaceNav :groups="adminNavGroups" />
          </template>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
