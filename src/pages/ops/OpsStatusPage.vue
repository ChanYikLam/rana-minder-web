<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import { get } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { CheckCircle2, AlertTriangle, Server, Database, Cloud, Mail, Clock } from '@lucide/vue'

const state = ref<PageState>('loading')
const data = ref<{
  appVersion: string; uptime: string
  dependencies: { name: string; status: string; latency: number }[]
  taskQueue: { pending: number; processing: number; failed: number }
  syncHealth: { abnormalClubs: number; pendingCorrections: number; recentEvents: { id: string; kind: string; clubId: string; clubName: string; at: string; note: string }[] }
  lastCheckAt: string
} | null>(null)

const depIcons: Record<string, typeof Server> = { PostgreSQL: Database, Casdoor: Server, '对象存储': Cloud, '邮件服务': Mail }

async function loadData() {
  state.value = 'loading'
  const result = await get<typeof data.value>('/admin/ops-status')
  if (result.kind === 'completed') {
    data.value = result.data
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

function formatCheck(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const eventKindLabels: Record<string, string> = { group_lost: 'Group 失权', suspend: '停用', recover: '恢复', disconnect: '解除接入', rebind: '重新绑定', reaccess: '重新接入', repair: '修复', import: '成员导入' }

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="运维状态" @retry="loadData">
    <div v-if="data" class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">运维状态</h1>
        <span class="text-xs text-text-secondary flex items-center gap-1"><Clock :size="12" /> 最后检查 {{ formatCheck(data.lastCheckAt) }}</span>
      </div>

      <!-- 应用信息 -->
      <Card class="mb-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-text-secondary">应用版本</p>
            <p class="text-text-primary font-medium font-mono">{{ data.appVersion }}</p>
          </div>
          <div>
            <p class="text-text-secondary">运行时长</p>
            <p class="text-text-primary font-medium">{{ data.uptime }}</p>
          </div>
        </div>
      </Card>

      <!-- 依赖状态 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">依赖服务</h2>
        <div class="space-y-2">
          <div v-for="dep in data.dependencies" :key="dep.name" class="flex items-center justify-between rounded-lg border border-border p-3">
            <div class="flex items-center gap-2">
              <component :is="depIcons[dep.name] || Server" :size="16" class="text-text-secondary" />
              <span class="text-sm text-text-primary">{{ dep.name }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-text-secondary">{{ dep.latency }}ms</span>
              <span v-if="dep.status === 'healthy'" class="flex items-center gap-1 text-xs text-success"><CheckCircle2 :size="14" /> 正常</span>
              <span v-else-if="dep.status === 'degraded'" class="flex items-center gap-1 text-xs text-warning"><AlertTriangle :size="14" /> 降级</span>
              <span v-else class="flex items-center gap-1 text-xs text-danger"><AlertTriangle :size="14" /> 异常</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 任务队列 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3">导出任务队列</h2>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div>
            <p class="text-2xl font-bold text-text-primary">{{ data.taskQueue.pending }}</p>
            <p class="text-xs text-text-secondary">生成中</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-text-primary">{{ data.taskQueue.processing }}</p>
            <p class="text-xs text-text-secondary">处理中</p>
          </div>
          <div>
            <p class="text-2xl font-bold" :class="data.taskQueue.failed > 0 ? 'text-danger' : 'text-text-primary'">{{ data.taskQueue.failed }}</p>
            <p class="text-xs text-text-secondary">失败</p>
          </div>
        </div>
      </Card>

      <!-- 数据同步健康 -->
      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <AlertTriangle :size="16" :class="data.syncHealth.abnormalClubs > 0 ? 'text-danger' : 'text-success'" />
          数据同步健康
        </h2>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="rounded-lg border border-border p-3">
            <p class="text-2xl font-bold" :class="data.syncHealth.abnormalClubs > 0 ? 'text-danger' : 'text-text-primary'">{{ data.syncHealth.abnormalClubs }}</p>
            <p class="text-xs text-text-secondary">同步异常社团</p>
          </div>
          <div class="rounded-lg border border-border p-3">
            <p class="text-2xl font-bold text-text-primary">{{ data.syncHealth.pendingCorrections }}</p>
            <p class="text-xs text-text-secondary">待处理纠错</p>
          </div>
        </div>
        <p class="text-xs font-medium text-text-secondary mb-2">最近同步事件</p>
        <div class="space-y-2">
          <div v-for="ev in data.syncHealth.recentEvents" :key="ev.id" class="flex items-center justify-between rounded-lg border border-border p-2.5">
            <div class="min-w-0">
              <p class="text-sm text-text-primary truncate">
                <span class="text-warning">{{ eventKindLabels[ev.kind] || ev.kind }}</span>
                <span class="text-text-secondary"> · {{ ev.clubName }}</span>
              </p>
              <p class="text-xs text-text-secondary truncate">{{ ev.note }}</p>
            </div>
            <span class="text-xs text-text-secondary shrink-0 ml-2">{{ formatCheck(ev.at) }}</span>
          </div>
          <p v-if="data.syncHealth.recentEvents.length === 0" class="text-xs text-text-secondary">暂无同步事件</p>
        </div>
      </Card>
    </div>
  </PageStateBoundary>
</template>
