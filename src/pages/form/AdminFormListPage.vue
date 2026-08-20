<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import { useRequest } from '@/composables/useRequest'
import { ChevronRight, FileText } from '@lucide/vue'

interface FormItem { id: string; title: string; status: string; version: number; scope: string; updatedAt: string }

const router = useRouter()
const { data, state, execute: loadData } = useRequest<{ items: FormItem[] }>(
  () => get<{ items: FormItem[] }>('/admin/forms'),
  { immediate: true }
)
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <PageStateBoundary :state="state" title="平台表单" empty-title="暂无平台表单" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">平台表单管理</h1>

      <div class="space-y-2">
        <Card
          v-for="form in items"
          :key="form.id"
          class="cursor-pointer"
          @click="router.push(`/admin/forms/designer/${form.id}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary">
                <FileText :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ form.title }}</p>
                <p class="text-xs text-text-secondary">v{{ form.version }} · 平台级</p>
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
