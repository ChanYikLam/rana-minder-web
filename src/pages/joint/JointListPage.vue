<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { Plus, ChevronRight, Users } from '@lucide/vue'

interface JointActivity { id: string; title: string; status: string; channelStatus: string; participants: string[]; applicantCount: number; createdAt: string }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const items = ref<JointActivity[]>([])

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: JointActivity[] }>(`/org/${clubId}/joint`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: JointActivity[] } }).data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合活动" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">联合活动</h1>
        <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="router.push(`/org/${route.params.clubId}/joint/create`)">
          <Plus :size="16" /> 发起活动
        </button>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无联合活动" action-label="发起活动" @action="router.push(`/org/${route.params.clubId}/joint/create`)" />

      <div v-else class="space-y-3">
        <Card
          v-for="jnt in items"
          :key="jnt.id"
          class="cursor-pointer"
          @click="router.push(`/org/${route.params.clubId}/joint/${jnt.id}`)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="text-sm font-medium text-text-primary">{{ jnt.title }}</p>
              <div class="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                <span class="flex items-center gap-1"><Users :size="12" /> {{ jnt.participants.join(' + ') }}</span>
                <span>{{ jnt.applicantCount }} 报名</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="jnt.status" />
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
