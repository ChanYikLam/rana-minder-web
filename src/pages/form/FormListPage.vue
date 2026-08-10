<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { ChevronRight, FileText } from '@lucide/vue'

interface FormItem { id: string; title: string; status: string; version: number; updatedAt: string }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const items = ref<FormItem[]>([])

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: FormItem[] }>(`/org/${clubId}/forms`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: FormItem[] } }).data.items
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="表单列表" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">动态表单</h1>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无表单" />

      <div v-else class="space-y-2">
        <Card
          v-for="form in items"
          :key="form.id"
          class="cursor-pointer"
          @click="router.push(`/org/${route.params.clubId}/forms/designer/${form.id}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary">
                <FileText :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ form.title }}</p>
                <p class="text-xs text-text-secondary">v{{ form.version }} · 更新于 {{ formatDate(form.updatedAt) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StateTag :status="form.status" />
              <ChevronRight :size="16" class="text-text-secondary" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
