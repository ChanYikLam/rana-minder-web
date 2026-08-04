<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import { Timeline, type TimelineEntry } from '@/components/display'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Search } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

interface AuditLog { id: string; actorName: string; action: string; targetType: string; targetId: string; detail: string; createdAt: string }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<AuditLog[]>([])
const searchKeyword = ref('')

const timelineItems = computed<TimelineEntry[]>(() =>
  items.value.map((log) => ({
    id: log.id,
    time: log.createdAt,
    title: `${log.actorName} · ${log.action}`,
    description: log.detail,
    by: `${log.targetType} #${log.targetId}`,
  })),
)

let searchTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0
async function loadData() {
  const seq = ++requestSeq
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ items: AuditLog[] }>(`${apiScope.prefix}/audit/logs`, { search: searchKeyword.value || undefined })
  if (seq !== requestSeq) return
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: AuditLog[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadData, 300)
}

onMounted(loadData)
onUnmounted(() => {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
  requestSeq++
})
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

      <Card v-else class="p-4">
        <Timeline :items="timelineItems" label="审计记录时间线" />
      </Card>
    </div>
  </PageStateBoundary>
</template>
