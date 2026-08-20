<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, Check, ChevronDown, LoaderCircle } from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { identityApi } from '@/services'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useSessionViewStore, mergeClubPermissions } from '@/state/sessionViewStore'
import { useStateView } from '@/composables/useStateView'
import type { WorkspaceContext } from '@/types/domain'

interface MyClub {
  clubId: string
  clubName: string
  role: WorkspaceContext['role']
}

const router = useRouter()
const workspace = useWorkspaceContextStore()
const session = useSessionViewStore()
const { roleLabel } = useStateView()

const clubs = ref<MyClub[]>([])
const loading = ref(false)
const loadError = ref(false)
const switching = ref(false)
// P2-16：列表缓存与会话绑定——记录最近一次拉取对应的用户，换账号/登出后作废
let clubsSessionKey: string | null = null
// P2-16：代次计数，换账号/登出时递增；请求返回时若代次已变则丢弃结果，
// 避免旧账号在途的 getMyClubs 完成后写回并污染新账号菜单
let clubsGeneration = 0
// P2-16：强制刷新待补位——lastLoadedAt 触发时若正加载中，加载结束后再补一次，避免被静默丢弃
let pendingForce = false

async function loadClubs(force = false) {
  if (loading.value) {
    // P2-16：强制刷新在 loading 中时不丢弃，标记待补位，加载结束后再补一次
    if (force) pendingForce = true
    return
  }
  const sessionKey = session.user?.id ?? null
  // 缓存命中仅限同用户；force（会话重载/角色变化后）强制刷新
  if (!force && clubs.value.length > 0 && clubsSessionKey === sessionKey) return
  loading.value = true
  loadError.value = false
  // 记录本次请求对应的代次与用户，写入前校验，防止在途请求写回旧数据
  const gen = clubsGeneration
  const reqSessionKey = sessionKey
  try {
    const result = await identityApi.getMyClubs()
    // P2-16：请求期间发生换账号/登出（代次或用户已变）则丢弃本次结果，避免旧列表污染新账号
    if (gen !== clubsGeneration || reqSessionKey !== (session.user?.id ?? null)) return
    if (result.kind === 'completed') {
      clubs.value = result.data.clubs
      clubsSessionKey = reqSessionKey
    } else {
      // P2-14：拉取失败不再静默——否则菜单误导"暂无加入的社团"
      loadError.value = true
    }
  } finally {
    loading.value = false
    // P2-16：补位——loading 期间被标记的强制刷新，结束后再执行一次
    if (pendingForce) {
      pendingForce = false
      void loadClubs(true)
    }
  }
}

// P2-16：登出/换账号时旧列表立即作废（不再沿用上一账号的社团菜单）
watch(() => session.user?.id, (id) => {
  if (clubsSessionKey !== id) {
    clubs.value = []
    clubsSessionKey = null
    // P2-16：递增代次，作废在途请求的写回
    clubsGeneration++
  }
})

// P2-16：会话重载（登录/刷新/加入新社团/角色变更）后强制刷新，clubs.length>0 不再阻止拉取
watch(() => session.lastLoadedAt, () => {
  if (session.lastLoadedAt != null) void loadClubs(true)
})

// P2-6：落点跟随权限（与 loginTarget.ts / 根守卫同一口径），无 club:dashboard:view 时不再硬跳 dashboard
// 直落无权限页，而是回退个人中心/平台管理
async function switchClub(club: MyClub) {
  if (club.clubId === workspace.currentClubId) return
  switching.value = true
  // 评审 I4：异常时也要复位 switching，避免下拉按钮永久转圈
  let ok: boolean
  try {
    ok = await workspace.loadWorkspace(club.clubId)
  } finally {
    switching.value = false
  }
  if (!ok) return
  // 同步会话工作空间与权限集，避免 store 为 club-002、session 仍为 club-001 的双源不一致
  // memberId 与社团级权限按新社团上下文重新解析后整体写入（而非合并缺省字段），
  // 避免跨社团切换时沿用上一社团的 memberId 导致成员生命周期自审误判
  session.setWorkspaceInfo({
    clubId: club.clubId,
    clubName: club.clubName,
    role: club.role,
    memberId: workspace.currentMemberId ?? undefined,
  })
  // 社团切换不抹掉 platform:* 等全局权限：保留全局权限位，仅以新社团权限覆盖 club:* 域
  session.setPermissions(mergeClubPermissions(session.permissions, workspace.currentPermissions))
  if (session.hasPermission('club:dashboard:view')) {
    await router.push(`/org/${club.clubId}/dashboard`)
  } else if (session.hasPermission('platform:club:manage')) {
    await router.push('/admin/clubs')
  } else {
    await router.push('/me')
  }
}

onMounted(loadClubs)
</script>

<template>
  <DropdownMenu @open-change="() => loadClubs()">
    <DropdownMenuTrigger as-child>
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-primary-subtle transition-colors"
        aria-label="切换社团"
      >
        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-medium shrink-0">
          {{ workspace.currentClubName?.charAt(0) || '社' }}
        </div>
        <div class="min-w-0 flex-1 text-left">
          <p class="text-sm font-medium truncate">{{ workspace.currentClubName || '未选择社团' }}</p>
          <p class="text-xs text-text-secondary truncate">
            {{ workspace.currentRole ? roleLabel(workspace.currentRole) : '未加入社团' }}
          </p>
        </div>
        <LoaderCircle v-if="switching" :size="14" class="text-text-secondary animate-spin shrink-0" />
        <ChevronDown v-else :size="14" class="text-text-secondary shrink-0" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel class="flex items-center gap-2 text-xs text-text-secondary">
        <Building2 :size="14" /> 我的社团
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div v-if="loading" class="px-2 py-4 flex items-center justify-center gap-2 text-sm text-text-secondary">
        <LoaderCircle :size="14" class="animate-spin" /> 加载中…
      </div>
      <template v-else>
        <DropdownMenuItem
          v-for="club in clubs"
          :key="club.clubId"
          class="cursor-pointer"
          @click="switchClub(club)"
        >
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-primary-subtle text-primary text-[10px] font-medium shrink-0">
            {{ club.clubName?.charAt(0) }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm truncate">{{ club.clubName }}</p>
            <p class="text-xs text-text-secondary">{{ roleLabel(club.role) }}</p>
          </div>
          <Check
            v-if="club.clubId === workspace.currentClubId"
            :size="14"
            class="text-primary shrink-0"
          />
        </DropdownMenuItem>
        <p v-if="loadError" class="px-2 py-4 text-sm text-text-secondary">
          社团列表加载失败
          <button class="mt-1 w-full text-primary hover:underline" @click="() => loadClubs(true)">重试</button>
        </p>
        <p v-else-if="clubs.length === 0" class="px-2 py-4 text-sm text-text-secondary">暂无加入的社团</p>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
