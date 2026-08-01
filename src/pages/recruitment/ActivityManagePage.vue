<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Users, FileText, Mail, ClipboardList, ChevronRight } from '@lucide/vue'

interface ActivityManage {
  id: string; title: string; description: string
  status: string; channelStatus: string; deadline: string
  departments: { id: string; name: string }[]
  applicantCount: number; interviewCount: number; invitationCount: number
  version: number
}

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const detail = ref<ActivityManage | null>(null)

async function loadDetail() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const actId = route.params.activityId as string
  const result = await get<ActivityManage>(`/org/${clubId}/recruitment/${actId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(loadDetail)
</script>

<template>
  <PageStateBoundary :state="state" title="活动管理" @retry="loadDetail">
    <div v-if="detail" class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-text-primary">{{ detail.title }}</h1>
          <div class="flex items-center gap-2 mt-1">
            <StateTag :status="detail.status" />
            <StateTag :status="detail.channelStatus" />
          </div>
        </div>
      </div>

      <!-- 数据概览 -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <ClipboardList :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">报名申请</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.applicantCount }}</p>
        </Card>
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <Users :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">面试安排</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.interviewCount }}</p>
        </Card>
        <Card padding="p-4">
          <div class="flex items-center gap-2 mb-1">
            <Mail :size="16" class="text-text-secondary" />
            <span class="text-xs text-text-secondary">录取邀请</span>
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ detail.invitationCount }}</p>
        </Card>
      </div>

      <!-- 管理入口 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">管理操作</h2>
        <div class="space-y-1">
          <button
            v-for="item in [
              { label: '报名申请管理', desc: '查看和处理所有报名申请', icon: ClipboardList, path: 'applications' },
              { label: '面试排期管理', desc: '安排面试时段和面试官', icon: Users, path: 'interview' },
              { label: '评价与结论', desc: '评价申请人并发布结论', icon: FileText, path: 'review' },
              { label: '邀请管理', desc: '发送和管理录取邀请', icon: Mail, path: 'invitations' },
            ]"
            :key="item.path"
            class="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-subtle transition-colors text-left"
            @click="router.push(`/org/${route.params.clubId}/recruitment/${detail.id}/${item.path}`)"
          >
            <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary shrink-0">
              <component :is="item.icon" :size="18" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-text-primary">{{ item.label }}</p>
              <p class="text-xs text-text-secondary">{{ item.desc }}</p>
            </div>
            <ChevronRight :size="18" class="text-text-secondary" />
          </button>
        </div>
      </Card>

      <!-- 招新方向 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">招新方向</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="dept in detail.departments"
            :key="dept.id"
            class="inline-flex items-center px-3 py-1.5 rounded-md bg-subtle text-sm text-text-primary"
          >
            {{ dept.name }}
          </span>
        </div>
      </Card>

      <!-- 活动信息 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-3">活动信息</h2>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between">
            <dt class="text-text-secondary">报名截止</dt>
            <dd class="text-text-primary">{{ formatDeadline(detail.deadline) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">数据版本</dt>
            <dd class="text-text-primary">v{{ detail.version }}</dd>
          </div>
        </dl>
      </Card>
    </div>
  </PageStateBoundary>
</template>
