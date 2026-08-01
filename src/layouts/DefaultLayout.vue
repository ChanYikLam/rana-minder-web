<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useNotificationViewStore } from '@/state/notificationViewStore'
import {
  Search, Bell, User, Settings, LogOut, ChevronDown, Menu, X,
  Building2, BarChart3, Users, FileText, Mail, ShieldAlert, ClipboardList, Megaphone,
} from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Drawer, DrawerContent, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer'
import WorkspaceNav from './components/WorkspaceNav.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()
const notifications = useNotificationViewStore()

const currentClubId = computed(() => workspace.currentClubId)
const clubIdFromRoute = computed(() => (route.params.clubId as string) || currentClubId.value)

interface NavGroup {
  label: string
  icon: typeof Building2
  prefix: string
  items: { label: string; path: string }[]
}

const navGroups = computed<NavGroup[]>(() => {
  if (!clubIdFromRoute.value) return []
  const base = `/org/${clubIdFromRoute.value}`
  return [
    {
      label: '工作台', icon: BarChart3, prefix: `${base}/dashboard`,
      items: [
        { label: '管理看板', path: `${base}/dashboard` },
        { label: '批量操作', path: `${base}/batch` },
      ],
    },
    {
      label: '普通招新', icon: Megaphone, prefix: `${base}/recruitment`,
      items: [
        { label: '活动列表', path: `${base}/recruitment` },
        { label: '创建活动', path: `${base}/recruitment/create` },
      ],
    },
    {
      label: '联合活动', icon: Users, prefix: `${base}/joint`,
      items: [
        { label: '活动列表', path: `${base}/joint` },
        { label: '发起活动', path: `${base}/joint/create` },
      ],
    },
    {
      label: '成员与组织', icon: Building2, prefix: `${base}/members`,
      items: [
        { label: '成员列表', path: `${base}/members` },
        { label: '部门关系申请', path: `${base}/members/department-apply` },
        { label: '常规入社邀请', path: `${base}/members/invite` },
        { label: '任命调岗免职', path: `${base}/members/appointments` },
        { label: '成员退出与移除', path: `${base}/members/exit` },
        { label: '换届管理', path: `${base}/members/transition` },
      ],
    },
    {
      label: '动态表单', icon: FileText, prefix: `${base}/forms`,
      items: [
        { label: '表单列表', path: `${base}/forms` },
      ],
    },
    {
      label: '统计与导出', icon: BarChart3, prefix: `${base}/stat`,
      items: [
        { label: '数据统计', path: `${base}/stats` },
        { label: '数据导出', path: `${base}/exports` },
      ],
    },
    {
      label: '通知配置', icon: Mail, prefix: `${base}/notifications`,
      items: [
        { label: '发信配置', path: `${base}/notifications/email-config` },
      ],
    },
    {
      label: '纠错与审计', icon: ShieldAlert, prefix: `${base}/audit`,
      items: [
        { label: '事实纠错', path: `${base}/audit/corrections` },
        { label: '审计日志', path: `${base}/audit/logs` },
      ],
    },
    {
      label: '社团配置', icon: Settings, prefix: `${base}/config`,
      items: [
        { label: '配置管理', path: `${base}/config` },
      ],
    },
  ]
})

const adminNavGroups: NavGroup[] = [
  {
    label: '社团管理', icon: Building2, prefix: '/admin/clubs',
    items: [
      { label: '社团接入', path: '/admin/clubs' },
    ],
  },
  {
    label: '联合活动', icon: Users, prefix: '/admin/joint',
    items: [
      { label: '活动列表', path: '/admin/joint' },
    ],
  },
  {
    label: '表单管理', icon: FileText, prefix: '/admin/forms',
    items: [
      { label: '平台表单', path: '/admin/forms' },
    ],
  },
  {
    label: '审计管理', icon: ShieldAlert, prefix: '/admin/audit',
    items: [
      { label: '纠错处置', path: '/admin/audit/corrections' },
      { label: '审计日志', path: '/admin/audit/logs' },
      { label: '正式删除', path: '/admin/delete' },
      { label: '数据保留', path: '/admin/retention' },
    ],
  },
  {
    label: '统计导出', icon: BarChart3, prefix: '/admin/stat',
    items: [
      { label: '全局统计', path: '/admin/stats' },
      { label: '全平台导出', path: '/admin/exports' },
    ],
  },
  {
    label: '通知配置', icon: Mail, prefix: '/admin/notifications',
    items: [
      { label: '平台发信', path: '/admin/notifications/email-config' },
    ],
  },
  {
    label: '平台配置', icon: Settings, prefix: '/admin/config',
    items: [
      { label: '平台配置', path: '/admin/config' },
      { label: '权限模板', path: '/admin/config/permission-templates' },
    ],
  },
  {
    label: '运维状态', icon: ClipboardList, prefix: '/admin/ops',
    items: [
      { label: '运维监控', path: '/admin/ops-status' },
    ],
  },
]

const isAdmin = computed(() => session.hasPermission('platform:club:manage'))

const mobileNavOpen = ref(false)

function closeMobileNav() {
  mobileNavOpen.value = false
}

async function handleLogout() {
  await session.logout()
  workspace.clearWorkspace()
  closeMobileNav()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
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
            v-if="isAdmin"
            to="/admin/clubs"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
            :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/admin') }"
          >
            <ShieldAlert :size="16" /> 平台管理
          </router-link>
        </nav>
      </div>

      <div class="flex items-center gap-2">
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
        v-if="clubIdFromRoute || route.path.startsWith('/admin')"
        class="hidden md:flex flex-col w-56 border-r bg-elevated overflow-y-auto"
        role="complementary"
        aria-label="工作空间导航"
      >
        <!-- 社团标识 -->
        <div v-if="clubIdFromRoute" class="p-3 border-b">
          <p class="text-xs text-text-secondary mb-1">当前社团</p>
          <div class="flex items-center gap-2">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-medium">
              {{ workspace.currentClubName?.charAt(0) || '社' }}
            </div>
            <span class="text-sm font-medium">{{ workspace.currentClubName || '计算机协会' }}</span>
          </div>
        </div>
        <div v-else-if="isAdmin" class="p-3 border-b">
          <p class="text-xs text-text-secondary mb-1">管理视角</p>
          <span class="text-sm font-medium text-primary">平台管理</span>
        </div>

        <!-- 折叠式导航 -->
        <WorkspaceNav v-if="clubIdFromRoute" :groups="navGroups" />
        <WorkspaceNav v-else-if="isAdmin" :groups="adminNavGroups" />
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto" role="main" tabindex="-1">
        <div class="mx-auto max-w-[1400px] p-4 md:p-6">
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
              v-if="isAdmin"
              to="/admin/clubs"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors"
              :class="{ 'text-primary bg-primary-subtle': route.path.startsWith('/admin') }"
              @click="closeMobileNav"
            >
              <ShieldAlert :size="16" /> 平台管理
            </router-link>
          </nav>
          <div v-if="clubIdFromRoute" class="px-4 pt-3">
            <p class="text-xs text-text-secondary mb-1">当前社团</p>
            <div class="flex items-center gap-2">
              <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-medium">
                {{ workspace.currentClubName?.charAt(0) || '社' }}
              </div>
              <span class="text-sm font-medium">{{ workspace.currentClubName || '计算机协会' }}</span>
            </div>
          </div>
          <div v-else-if="isAdmin" class="px-4 pt-3">
            <p class="text-xs text-text-secondary mb-1">管理视角</p>
            <span class="text-sm font-medium text-primary">平台管理</span>
          </div>
          <WorkspaceNav v-if="clubIdFromRoute" :groups="navGroups" />
          <WorkspaceNav v-else-if="isAdmin" :groups="adminNavGroups" />
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
