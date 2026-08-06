<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, Check, ChevronDown, LoaderCircle } from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { identityApi } from '@/services'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useSessionViewStore } from '@/state/sessionViewStore'
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
const switching = ref(false)

async function loadClubs() {
  if (clubs.value.length > 0 || loading.value) return
  loading.value = true
  const result = await identityApi.getMyClubs()
  loading.value = false
  if (result.kind === 'completed') {
    clubs.value = result.data.clubs
  }
}

async function switchClub(club: MyClub) {
  if (club.clubId === workspace.currentClubId) return
  switching.value = true
  const ok = await workspace.loadWorkspace(club.clubId)
  switching.value = false
  if (!ok) return
  // 同步会话工作空间，避免 store 为 club-002、session.workspace 仍为 club-001 的双源不一致
  session.setWorkspaceInfo({ clubId: club.clubId, clubName: club.clubName, role: club.role })
  await router.push(`/org/${club.clubId}/dashboard`)
}

onMounted(loadClubs)
</script>

<template>
  <DropdownMenu @open-change="loadClubs">
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
        <p v-if="clubs.length === 0" class="px-2 py-4 text-sm text-text-secondary">暂无加入的社团</p>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
