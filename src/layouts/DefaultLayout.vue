<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { Search, User, ShieldAlert, X } from '@lucide/vue'
import {
  Drawer, DrawerContent, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer'
import TopNav from './components/TopNav.vue'
import SideNav from './components/SideNav.vue'
import Breadcrumb from './components/Breadcrumb.vue'
import ContentContainer from './components/ContentContainer.vue'
import DegradedBanner from '@/components/business/DegradedBanner.vue'
import { useSideNav, ADMIN_NAV } from './components/sideNav'

const route = useRoute()
const session = useSessionViewStore()
const workspace = useWorkspaceContextStore()

const currentClubId = computed(() => workspace.currentClubId)
const clubIdFromRoute = computed(() => (route.params.clubId as string) || currentClubId.value)

const isAdmin = computed(() => session.hasPermission('platform:club:manage'))

const { clubNav, personalLinks } = useSideNav(clubIdFromRoute)

const mobileNavOpen = ref(false)

function closeMobileNav() {
  mobileNavOpen.value = false
}

watch(() => route.fullPath, closeMobileNav)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <a
      href="#default-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
    >
      跳到主内容
    </a>

    <TopNav :on-open-mobile-menu="() => (mobileNavOpen = true)" />

    <!-- Body: Sidebar + Content -->
    <div class="flex flex-1">
      <aside
        class="hidden md:flex flex-col w-56 border-r bg-elevated overflow-y-auto"
        role="complementary"
        aria-label="主导航"
      >
        <SideNav
          :club-id="clubIdFromRoute"
          :is-admin="isAdmin"
          :show-club-indicator="!!clubIdFromRoute"
          :club-groups="clubNav"
          :admin-groups="ADMIN_NAV"
          :personal-links="personalLinks"
        />
      </aside>

      <!-- Main Content -->
      <main id="default-main" class="flex-1 overflow-y-auto" role="main" tabindex="-1">
        <ContentContainer>
          <div class="mb-4"><DegradedBanner /></div>
          <div class="mb-4"><Breadcrumb /></div>
          <slot />
        </ContentContainer>
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
          <SideNav
            :club-id="clubIdFromRoute"
            :is-admin="isAdmin"
            :show-club-indicator="!!clubIdFromRoute"
            :club-groups="clubNav"
            :admin-groups="ADMIN_NAV"
            :personal-links="personalLinks"
          />
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>