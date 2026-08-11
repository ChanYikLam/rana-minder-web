<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Mail } from '@lucide/vue'
import { Card, PageStateBoundary } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'

interface InvitationItem {
  id: string
  applicantName: string
  departmentName: string
  status: string
  sentAt: string
  expiredAt: string
}

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<InvitationItem[]>([])

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const activityId = route.params.activityId as string
  const result = await get<{ items: InvitationItem[] }>(`/org/${clubId}/recruitment/${activityId}/invitations`)
  if (result.kind === 'completed') {
    items.value = result.data.items
    state.value = items.value.length ? 'normal' : 'empty'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

// P2-29：过期时间格式化为可读文案，不再直接渲染原始 ISO
function formatDeadline(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="录取邀请管理" @retry="loadData">
    <div class="mx-auto max-w-2xl">
      <h1 class="mb-6 text-2xl font-bold text-text-primary">录取邀请管理</h1>
      <div v-if="items.length > 0" class="space-y-3">
        <Card v-for="item in items" :key="item.id">
          <div class="flex items-center gap-3">
            <Mail :size="20" class="text-primary" />
            <div>
              <p class="text-sm font-medium text-text-primary">{{ item.applicantName }}</p>
              <p class="text-xs text-text-secondary">{{ item.departmentName }} · 截止 {{ formatDeadline(item.expiredAt) }}</p>
            </div>
            <StateTag class="ml-auto" :status="item.status" />
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
