<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Search, Clock } from '@lucide/vue'

interface AuditLog { id: string; actorName: string; action: string; targetType: string; targetId: string; detail: string; createdAt: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<AuditLog[]>([])
const searchKeyword = ref('')

async function loadData() {
  state.value = 'loading'
  const clubId = (route.params.clubId as string) || 'club-001'
  const result = await get<{ items: AuditLog[] }>(`/org/${clubId}/audit/logs`, { search: searchKeyword.value || undefined })
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: AuditLog[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadData, 300)
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="审计查询" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">审计查询</h1>

      <div class="mb-4">
        <div class="relative">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            v-model="searchKeyword"
            type="search"
            placeholder="搜索操作人、操作类型或详情..."
            class="w-full h-10 pl-10 pr-4 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
            @input="onSearchInput"
          />
        </div>
      </div>

      <EmptyState v-if="items.length === 0" type="no_result" title="未找到审计记录" />

      <Card v-else>
        <div class="space-y-3">
          <div v-for="log in items" :key="log.id" class="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-subtle text-text-secondary shrink-0 mt-0.5">
              <Clock :size="14" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-text-primary">
                <span class="font-medium">{{ log.actorName }}</span>
                <span class="text-text-secondary"> {{ log.action }}</span>
              </p>
              <p class="text-xs text-text-secondary mt-0.5">{{ log.detail }}</p>
              <p class="text-xs text-text-secondary mt-0.5">{{ formatTime(log.createdAt) }} · {{ log.targetType }} #{{ log.targetId }}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </PageStateBoundary>
</template>
