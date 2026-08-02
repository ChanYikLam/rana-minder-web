<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { Download, Plus, FileText, Clock, CheckCircle2 } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'
import { openAuthorizedDownload } from '@/services/download'
import { toast } from 'vue-sonner'

interface ExportTask { id: string; type: string; status: string; createdAt: string; completedAt: string | null; expiredAt: string | null; downloadUrl: string | null; fileSize: number }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<ExportTask[]>([])
const confirmOpen = ref(false)
const executing = ref(false)

async function loadData() {
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ items: ExportTask[] }>(`${apiScope.prefix}/exports`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: ExportTask[] } }).data.items
    state.value = 'normal'
  } else { state.value = 'error' }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleCreate() {
  const apiScope = resolveApiScope(route)
  if (!apiScope) return
  executing.value = true
  const result = await post(`${apiScope.prefix}/exports`, { type: '成员名单' })
  executing.value = false
  if (result.kind === 'completed') {
    confirmOpen.value = false
    await loadData()
  } else {
    toast.error('创建导出失败，请稍后重试')
  }
}

function openCreateConfirm() {
  confirmOpen.value = true
}

async function handleDownload(task: ExportTask) {
  const apiScope = resolveApiScope(route)
  if (!apiScope) return
  const result = await post<{ downloadUrl: string }>(`${apiScope.prefix}/exports/${task.id}/download`, {})
  if (result.kind === 'completed') {
    if (openAuthorizedDownload(result.data.downloadUrl)) {
      toast.success('已开始下载')
      return
    }
    toast.error('下载地址无效，请重新获取')
    return
  }
  if (result.kind === 'accepted') {
    toast.info('导出正在生成中，请稍后重试')
    return
  }
  toast.error('下载失败，请稍后重试')
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="导出管理" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">导出管理</h1>
        <PermissionGuard permission="club:member:manage">
          <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="openCreateConfirm">
            <Plus :size="16" /> 新建导出
          </button>
        </PermissionGuard>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无导出任务">
        <template #action>
          <PermissionGuard permission="club:member:manage">
            <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="openCreateConfirm">
              <Plus :size="16" /> 新建导出
            </button>
          </PermissionGuard>
        </template>
      </EmptyState>

      <!-- EXP-002: 导出配置提示 -->
      <Card v-if="items.length > 0" class="mb-4 border-warning">
        <div class="space-y-2">
          <p class="text-xs font-medium text-warning">导出安全规则</p>
          <ul class="text-xs text-text-secondary space-y-1 list-disc list-inside">
            <li>手机号、邮箱默认不导出，需在导出时显式勾选</li>
            <li>图片和附件默认不打包，需单独选择并附导出清单</li>
            <li>表格内容已做公式注入防护，安全转义可能被解释为公式的单元格</li>
            <li>密码、密钥、令牌、验证码等系统秘密永不导出</li>
            <li>每次下载实时校验权限，失权后不可下载</li>
          </ul>
        </div>
      </Card>

      <div v-if="items.length > 0" class="space-y-3">
        <Card v-for="task in items" :key="task.id">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary">
                <FileText :size="18" />
              </div>
              <div>
                <p class="text-sm font-medium text-text-primary">{{ task.type }}</p>
                <p class="text-xs text-text-secondary">{{ formatSize(task.fileSize) }} · 创建于 {{ formatTime(task.createdAt) }}</p>
              </div>
            </div>
            <StateTag :status="task.status" />
          </div>

          <div class="mt-3 flex items-center justify-between">
            <div class="text-xs text-text-secondary">
              <span v-if="task.completedAt" class="flex items-center gap-1"><CheckCircle2 :size="12" /> 完成于 {{ formatTime(task.completedAt) }}</span>
              <span v-else-if="task.status === 'generating'" class="flex items-center gap-1 text-warning"><Clock :size="12" /> 生成中...</span>
              <span v-if="task.expiredAt && task.status === 'completed'">截止 {{ formatTime(task.expiredAt) }}</span>
            </div>
            <button
              v-if="task.status === 'completed' && task.downloadUrl"
              class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover"
              @click="handleDownload(task)"
            >
              <Download :size="14" /> 下载
            </button>
            <span v-else-if="task.status === 'expired'" class="text-xs text-text-secondary">已过期</span>
          </div>
        </Card>
      </div>
    </div>

    <HighRiskConfirm
      v-model:open="confirmOpen"
      title="创建成员名单导出"
      description="导出将生成包含社团成员信息的文件，请确认导出范围与安全规则。"
      :targets="[{ id: 'members', label: '本社团全部成员', detail: '仅基础字段，不含敏感列' }]"
      impact-summary="导出任务生成后 7 天内可下载，过期自动失效；每次下载实时校验权限。"
      confirm-label="开始导出"
      :executing="executing"
      @confirm="handleCreate"
    />
  </PageStateBoundary>
</template>
