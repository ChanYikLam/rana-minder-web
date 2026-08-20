<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card, EmptyState } from '@/components/common'
import HighRiskConfirm from '@/components/common/HighRiskConfirm.vue'
import PermissionGuard from '@/components/business/PermissionGuard.vue'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { Download, Plus, FileText, Clock, CheckCircle2 } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'
import { formatSize, formatTime } from '@/lib/exportFormat'
import { openAuthorizedDownload } from '@/services/download'
import { toast } from 'vue-sonner'

interface ExportTask { id: string; type: string; status: 'generating' | 'processing' | 'completed' | 'failed' | 'expired'; createdAt: string; completedAt: string | null; expiredAt: string | null; downloadUrl: string | null; fileSize: number }

const route = useRoute()
const state = ref<PageState>('loading')
const items = ref<ExportTask[]>([])
const confirmOpen = ref(false)
const executing = ref(false)
const succeeded = ref(false)
const errorMessage = ref('')
const downloadConfirmOpen = ref(false)
const downloadTarget = ref<ExportTask | null>(null)
const downloadReason = ref('')
const downloadError = ref('')
const downloading = ref(false)
const pollingTimers = new Map<string, ReturnType<typeof setInterval>>()

function resetConfirmState() {
  succeeded.value = false
  errorMessage.value = ''
}

async function loadData() {
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ items: ExportTask[] }>(`${apiScope.prefix}/exports`)
  if (result.kind === 'completed') {
    items.value = (result as { kind: 'completed'; data: { items: ExportTask[] } }).data.items
    state.value = 'normal'
    // 启动轮询：仅轮询进行中的任务（generating 排队待调度 / processing 生成中）
    items.value.forEach((t) => {
      if ((t.status === 'generating' || t.status === 'processing') && !pollingTimers.has(t.id)) {
        startPolling(t.id, apiScope.prefix)
      }
    })
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

function startPolling(taskId: string, prefix: string) {
  const poll = async () => {
    const r = await get<{ status: ExportTask['status']; downloadUrl: string | null; fileSize: number; completedAt: string | null; expiredAt: string | null }>(`${prefix}/exports/${taskId}/status`)
    if (r.kind === 'completed') {
      const data = r.data
      const idx = items.value.findIndex((t) => t.id === taskId)
      if (idx === -1) {
        // MRM-009：列表里已不存在（被 GC）→ 立刻停止轮询，避免无主定时器
        stopPolling(taskId)
        return
      }
      items.value[idx] = { ...items.value[idx], ...data }
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'expired') {
        stopPolling(taskId)
        if (data.status === 'completed') {
          toast.success('导出已生成完成，可点击下载')
        } else if (data.status === 'failed') {
          toast.error('导出失败，请稍后重试')
        } else if (data.status === 'expired') {
          toast.info('导出已过期')
        }
      }
      return
    }
    // MRM-009：状态接口被拒绝/404/网络错误统一停止轮询，避免 setInterval 永不收敛形成"无主定时器"
    // 业务错误码 404（任务已被 GC）/ 401（会话失效）也属于此分支
    stopPolling(taskId)
  }
  // MRM-009：幂等防重——同 taskId 已有轮询定时器则直接复用，避免重复 setInterval 造成无主定时器
  if (pollingTimers.has(taskId)) return
  const handle = setInterval(poll, 2000)
  pollingTimers.set(taskId, handle)
}

function stopPolling(taskId: string) {
  const handle = pollingTimers.get(taskId)
  if (handle) {
    clearInterval(handle)
    pollingTimers.delete(taskId)
  }
}

function stopAllPolling() {
  pollingTimers.forEach((handle) => clearInterval(handle))
  pollingTimers.clear()
}

const EXPORT_TYPE_MEMBERS = 'members'
const EXPORT_TYPE_LABELS: Record<string, string> = {
  [EXPORT_TYPE_MEMBERS]: '成员名单',
}

async function handleCreate() {
  const apiScope = resolveApiScope(route)
  if (!apiScope) return
  executing.value = true
  succeeded.value = false
  errorMessage.value = ''
  try {
    const result = await post(`${apiScope.prefix}/exports`, { type: EXPORT_TYPE_MEMBERS })
    if (result.kind === 'completed') {
      const task = (result.data as ExportTask) || null
      if (task) {
        // MRM-009：POST 可能复用已存在进行中任务（同 scope+type），此时不应重复插入列表，避免同一任务渲染多份
        const exists = items.value.some((t) => t.id === task.id)
        if (!exists) items.value = [task, ...items.value]
        if (task.status === 'generating' || task.status === 'processing') {
          // startPolling 内部幂等（同 taskId 已有定时器则不重复创建），杜绝重复 setInterval
          startPolling(task.id, apiScope.prefix)
        } else if (task.status === 'completed') {
          toast.success('导出已生成完成，可点击下载')
        }
      }
      succeeded.value = true
      // 弹窗保留在 done 一段时间后由用户关闭
    } else {
      errorMessage.value = (result as { error?: { message?: string } }).error?.message || '创建导出失败，请稍后重试'
    }
  } finally {
    executing.value = false
  }
}

function openCreateConfirm() {
  confirmOpen.value = true
}

function openDownloadConfirm(task: ExportTask) {
  if (task.status !== 'completed' || !task.downloadUrl) {
    toast.info('导出尚未完成，请稍候')
    return
  }
  // MRM-009：expiredAt（24h 链接失效）即不可下载；后端 expired 态在 expiredAt+365d 才惰性转换，
  // 前端须在此处单独判定，避免 24h 后仍可点下载却在后端被拒。
  if (task.expiredAt && Date.now() >= new Date(task.expiredAt).getTime()) {
    toast.info('导出链接已过期，请重新导出')
    return
  }
  downloadTarget.value = task
  downloadReason.value = ''
  downloadError.value = ''
  downloadConfirmOpen.value = true
}

async function confirmDownload(proof?: string) {
  const task = downloadTarget.value
  if (!task || downloading.value) return
  const reason = downloadReason.value.trim()
  if (!reason || reason.length < 5) {
    downloadError.value = '请填写下载原因（至少 5 字）'
    return
  }
  downloading.value = true
  downloadError.value = ''
  try {
    const result = await post<{ downloadUrl: string }>(`${apiScope.value}/exports/${task.id}/download`, {
      reason,
      reauthProof: proof,
    })
    if (result.kind === 'completed') {
      if (openAuthorizedDownload(result.data.downloadUrl)) {
        toast.success('已开始下载')
        downloadConfirmOpen.value = false
        downloadTarget.value = null
        return
      }
      downloadError.value = '下载地址无效，请重新获取'
      return
    }
    if (result.kind === 'accepted') {
      downloadError.value = '导出正在生成中，请稍后重试'
      return
    }
    downloadError.value = '下载失败，请稍后重试'
  } finally {
    downloading.value = false
  }
}

const apiScope = ref<string | null>(null)

onMounted(async () => {
  const scope = resolveApiScope(route)
  if (scope) apiScope.value = scope.prefix
  await loadData()
})

onBeforeUnmount(stopAllPolling)
</script>

<template>
  <PageStateBoundary :state="state" title="导出管理" @retry="loadData">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">导出管理</h1>
        <PermissionGuard permission="club:export:execute" scope="workspace">
          <button class="flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover" @click="openCreateConfirm">
            <Plus :size="16" /> 新建导出
          </button>
        </PermissionGuard>
      </div>

      <EmptyState v-if="items.length === 0" type="no_data" title="暂无导出任务">
        <template #action>
          <PermissionGuard permission="club:export:execute" scope="workspace">
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
                <p class="text-sm font-medium text-text-primary">{{ EXPORT_TYPE_LABELS[task.type] ?? task.type }}</p>
                <p class="text-xs text-text-secondary">{{ formatSize(task.fileSize) }} · 创建于 {{ formatTime(task.createdAt) }}</p>
              </div>
            </div>
            <StateTag :status="task.status" />
          </div>

          <div class="mt-3 flex items-center justify-between">
            <div class="text-xs text-text-secondary">
              <span v-if="task.completedAt" class="flex items-center gap-1"><CheckCircle2 :size="12" /> 完成于 {{ formatTime(task.completedAt) }}</span>
              <span v-else-if="task.status === 'generating'" class="flex items-center gap-1 text-warning"><Clock :size="12" /> 生成中...</span>
              <span v-else-if="task.status === 'processing'" class="flex items-center gap-1 text-warning"><Clock :size="12" /> 处理中...</span>
              <span v-if="task.expiredAt && task.status === 'completed'">截止 {{ formatTime(task.expiredAt) }}</span>
            </div>
            <button
              v-if="task.status === 'completed' && task.downloadUrl"
              class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:bg-primary-hover"
              @click="openDownloadConfirm(task)"
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
      impact-summary="导出任务生成后 24 小时内可下载，过期自动失效；每次下载实时校验权限。"
      confirm-label="开始导出"
      :executing="executing"
      :succeeded="succeeded"
      :error-message="errorMessage"
      @confirm="handleCreate"
      @cancel="resetConfirmState"
      @update:error-message="(v) => errorMessage = v"
      @retry="resetConfirmState"
    />

    <HighRiskConfirm
      v-model:open="downloadConfirmOpen"
      :title="`下载导出文件：${downloadTarget ? (EXPORT_TYPE_LABELS[downloadTarget.type] ?? downloadTarget.type) : ''}`"
      description="下载会校验当前权限与作用域，每次下载会写入审计日志。"
      :targets="downloadTarget ? [{ id: downloadTarget.id, label: EXPORT_TYPE_LABELS[downloadTarget.type] ?? downloadTarget.type, detail: `${formatSize(downloadTarget.fileSize)} · ${downloadTarget.downloadUrl}` }] : []"
      impact-summary="下载属于高风险命令：含敏感字段或大量成员信息时会触发重认证；请填写下载原因用于审计。"
      confirm-label="确认下载"
      reauth-required
      :executing="downloading"
      :error-message="downloadError"
      @confirm="confirmDownload"
      @update:error-message="(v) => downloadError = v"
      @retry="downloadError = ''"
    >
      <template #extra>
        <label class="block text-sm font-medium text-text-primary mb-1.5">下载原因（必填，至少 5 字，用于审计）</label>
        <input
          v-model="downloadReason"
          class="w-full px-3 h-9 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary"
          placeholder="下载原因：例如学期末名单归档"
        />
      </template>
    </HighRiskConfirm>
  </PageStateBoundary>
</template>
