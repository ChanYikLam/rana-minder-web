<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Building2, CheckCircle2, Clock } from '@lucide/vue'

interface ClubItem { id: string; name: string; status: string; memberCount: number; createdAt: string; groupMapped: boolean }

const state = ref<PageState>('loading')
const items = ref<ClubItem[]>([])
const actingId = ref<string | null>(null)

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: ClubItem[] }>('/admin/clubs')
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: ClubItem[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleDecide(club: ClubItem, decision: 'approve' | 'reject') {
  actingId.value = club.id
  const result = await post(`/admin/clubs/${club.id}/${decision}`)
  actingId.value = null
  if (result.kind === 'completed') {
    club.status = decision === 'approve' ? 'approved' : 'rejected'
    toast.success(decision === 'approve' ? '已批准接入' : '已拒绝接入')
  } else {
    toast.error('操作失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="社团接入管理" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">社团接入管理</h1>
      <div class="space-y-3">
        <Card v-for="club in items" :key="club.id">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary">
                <Building2 :size="20" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ club.name }}</p>
                <p class="text-xs text-text-secondary">{{ club.memberCount }} 名成员 · 创建于 {{ club.createdAt.slice(0, 7) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="club.groupMapped" class="flex items-center gap-1 text-xs text-success"><CheckCircle2 :size="14" /> Group 已映射</span>
              <span v-else class="flex items-center gap-1 text-xs text-warning"><Clock :size="14" /> 待映射</span>
              <StateTag :status="club.status" />
            </div>
          </div>
          <div v-if="club.status === 'pending_review'" class="mt-3 flex gap-2">
            <button
              class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60"
              :disabled="actingId !== null"
              @click="handleDecide(club, 'approve')"
            >
              {{ actingId === club.id ? '处理中...' : '批准接入' }}
            </button>
            <button
              class="px-3 py-1.5 rounded-md border border-danger text-danger text-xs hover:bg-danger-subtle disabled:opacity-60"
              :disabled="actingId !== null"
              @click="handleDecide(club, 'reject')"
            >
              {{ actingId === club.id ? '处理中...' : '拒绝' }}
            </button>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
