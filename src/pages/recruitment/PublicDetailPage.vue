<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card, Button, ResponsiveActionRegion } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Calendar, Building2, ArrowLeft, Users, FileText, ChevronRight } from '@lucide/vue'

interface ActivityDetail {
  id: string; clubId: string; clubName: string; title: string
  description: string; status: string; channelStatus: string
  deadline: string; departments: { id: string; name: string }[]; formId: string
}

const route = useRoute()
const router = useRouter()

const state = ref<PageState>('loading')
const detail = ref<ActivityDetail | null>(null)

async function loadDetail() {
  state.value = 'loading'
  const id = route.params.activityId as string
  const result = await get<ActivityDetail>(`/explore/activities/${id}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else if (result.kind === 'rejected' && result.error.code === 'IFC-ERR-004') {
    state.value = 'error'
  } else {
    state.value = 'error'
  }
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="活动详情" @retry="loadDetail">
    <div v-if="detail" class="max-w-3xl mx-auto">
      <button
        class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4"
        @click="router.push('/explore')"
      >
        <ArrowLeft :size="16" /> 返回目录
      </button>

      <!-- 活动头部 -->
      <Card class="mb-4">
        <div class="flex items-start justify-between mb-3">
          <div>
            <h1 class="text-2xl font-bold text-text-primary mb-1">{{ detail.title }}</h1>
            <p class="flex items-center gap-1.5 text-sm text-text-secondary">
              <Building2 :size="16" /> {{ detail.clubName }}
            </p>
          </div>
          <StateTag :status="detail.channelStatus" />
        </div>
        <p class="text-sm text-text-secondary leading-relaxed">{{ detail.description }}</p>
        <div class="mt-4 flex items-center gap-4 text-sm">
          <span class="flex items-center gap-1 text-warning">
            <Calendar :size="16" /> 报名截止：{{ formatDeadline(detail.deadline) }}
          </span>
        </div>
      </Card>

      <!-- 招新部门 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <Users :size="18" /> 招新方向
        </h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="dept in detail.departments"
            :key="dept.id"
            class="flex items-center justify-between rounded-lg border border-border p-3 hover:border-border-strong transition-colors"
          >
            <span class="text-sm text-text-primary">{{ dept.name }}</span>
            <ChevronRight :size="16" class="text-text-secondary" />
          </div>
        </div>
      </Card>

      <!-- 报名表单 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-2 flex items-center gap-2">
          <FileText :size="18" /> 报名表单
        </h2>
        <p class="text-sm text-text-secondary mb-3">报名需填写在线表单，包含自我介绍、意向方向等</p>
      </Card>

      <!-- 操作区 -->
      <ResponsiveActionRegion page-family="detail">
        <Button
          class="w-full md:w-auto"
          size="lg"
          :disabled="detail.channelStatus !== 'open'"
          :disabled-reason="detail.channelStatus !== 'open' ? '当前活动的报名通道未开放。' : undefined"
          @click="router.push(`/activity/recruitment/${detail.id}/apply`)"
        >
          {{ detail.channelStatus === 'open' ? '立即报名' : '报名已截止' }}
        </Button>
      </ResponsiveActionRegion>
    </div>
  </PageStateBoundary>
</template>
