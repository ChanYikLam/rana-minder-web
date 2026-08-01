<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Search, ChevronRight, UserCircle } from '@lucide/vue'

interface Member { id: string; name: string; studentId: string; department: string; title: string; status: string; joinedAt: string }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const members = ref<Member[]>([])
const keyword = ref('')

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: Member[] }>(`/org/${clubId}/members`)
  if (result.kind === 'completed') {
    members.value = (result as { kind: 'completed'; data: { items: Member[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

const filtered = ref<Member[]>([])
function filter() {
  filtered.value = keyword.value
    ? members.value.filter((m) => m.name.includes(keyword.value) || m.studentId.includes(keyword.value) || m.department.includes(keyword.value))
    : members.value
}

onMounted(async () => { await loadData(); filter() })
watch(() => keyword.value, filter)
</script>

<template>
  <PageStateBoundary :state="state" title="成员列表" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">成员管理</h1>
        <span class="text-sm text-text-secondary">共 {{ filtered.length }} 人</span>
      </div>

      <div class="mb-4">
        <div class="relative">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索姓名、学号或部门..."
            class="w-full h-10 pl-10 pr-4 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          />
        </div>
      </div>

      <EmptyState v-if="filtered.length === 0" type="no_data" title="未找到成员" />

      <div v-else class="space-y-2">
        <Card
          v-for="m in filtered"
          :key="m.id"
          class="cursor-pointer"
          @click="router.push(`/org/${route.params.clubId}/members/${m.id}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary">
                <UserCircle :size="20" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ m.name }}</p>
                <p class="text-xs text-text-secondary">{{ m.studentId }} · {{ m.department }} · {{ m.title }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="m.status" />
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
