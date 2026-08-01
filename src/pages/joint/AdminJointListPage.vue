<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { ChevronRight, Users, ShieldAlert } from '@lucide/vue'

interface JointItem { id: string; title: string; status: string; participants: string[]; applicantCount: number; canForceClose: boolean }

const router = useRouter()
const state = ref<PageState>('loading')
const items = ref<JointItem[]>([])

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: JointItem[] }>('/admin/joint')
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: JointItem[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合活动管理" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-2">联合活动管理</h1>
      <p class="text-sm text-text-secondary mb-6">平台视角查看所有联合活动，可强制关闭异常活动</p>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无联合活动" />

      <div v-else class="space-y-3">
        <Card v-for="jnt in items" :key="jnt.id">
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
              <button
                v-if="jnt.canForceClose"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle"
                @click="router.push(`/admin/joint/${jnt.id}/close`)"
              >
                <ShieldAlert :size="12" /> 强制关闭
              </button>
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
