<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { Download, FileText, ShieldCheck, ArrowLeft } from '@lucide/vue'
import { openAuthorizedDownload } from '@/services/download'

interface FileMeta {
  id: string; name: string; size: number; mimeType: string
  status: string; uploadedAt: string; checkedAt: string | null; downloadUrl: string | null
}

const route = useRoute()
const state = ref<PageState>('loading')
const file = ref<FileMeta | null>(null)
const downloading = ref(false)

async function loadFile() {
  state.value = 'loading'
  const id = route.params.fileId as string
  const result = await get<FileMeta>(`/files/${id}`)
  if (result.kind === 'completed') {
    file.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleDownload() {
  downloading.value = true
  const id = route.params.fileId as string
  const result = await post<{ downloadUrl: string }>(`/files/${id}/download`, {})
  downloading.value = false
  if (result.kind === 'completed') {
    if (openAuthorizedDownload(result.data.downloadUrl)) {
      toast.success('已开始下载')
    } else {
      toast.error('下载地址无效，请重新获取')
    }
  } else {
    toast.error('下载失败，请稍后重试')
  }
}

onMounted(loadFile)
</script>

<template>
  <PageStateBoundary :state="state" title="文件预览" @retry="loadFile">
    <div v-if="file" class="max-w-lg mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="$router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <div class="flex items-start gap-3 mb-4">
          <div class="flex items-center justify-center w-14 h-14 rounded-lg bg-primary-subtle text-primary shrink-0">
            <FileText :size="28" />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-base font-medium text-text-primary truncate">{{ file.name }}</h1>
            <p class="text-sm text-text-secondary mt-0.5">{{ formatSize(file.size) }} · {{ file.mimeType }}</p>
            <div class="mt-1"><StateTag :status="file.status" /></div>
          </div>
        </div>

        <dl class="space-y-2 text-sm border-t border-border pt-4">
          <div class="flex justify-between">
            <dt class="text-text-secondary">上传时间</dt>
            <dd class="text-text-primary">{{ formatTime(file.uploadedAt) }}</dd>
          </div>
          <div v-if="file.checkedAt" class="flex justify-between">
            <dt class="text-text-secondary">检查时间</dt>
            <dd class="text-text-primary">{{ formatTime(file.checkedAt) }}</dd>
          </div>
        </dl>
      </Card>

      <!-- 安全检查状态 -->
      <Card v-if="file.status === 'approved'" class="mb-4 border-success">
        <div class="flex items-center gap-2 text-success">
          <ShieldCheck :size="20" />
          <p class="text-sm font-medium">文件已通过安全检查</p>
        </div>
      </Card>

      <Card v-else-if="file.status === 'checking'" class="mb-4 border-warning">
        <div class="flex items-center gap-2 text-warning">
          <div class="w-4 h-4 border-2 border-warning border-t-transparent rounded-full animate-spin" />
          <p class="text-sm font-medium">文件正在安全检查中...</p>
        </div>
        <!-- GOV-008: 检查中期间任何角色均不能预览或下载 -->
        <p class="text-xs text-warning mt-1">检查完成前任何角色均不能预览或下载</p>
      </Card>

      <Card v-else-if="file.status === 'quarantined'" class="mb-4 border-danger">
        <div class="flex items-center gap-2 text-danger">
          <ShieldCheck :size="20" />
          <p class="text-sm font-medium">文件未通过安全检查，已被隔离</p>
        </div>
      </Card>

      <!-- 下载按钮 -->
      <button
        v-if="file.status === 'approved'"
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="downloading"
        @click="handleDownload"
      >
        <Download :size="18" /> {{ downloading ? '生成中...' : '下载文件' }}
      </button>
      <p v-else class="text-center text-sm text-text-secondary">文件需通过安全检查后方可下载</p>

      <!-- FORM-008: 水印提示 -->
      <p class="mt-4 text-xs text-text-secondary text-center">
        每次访问文件需重新获取授权，文件地址不会公开暴露<br>
        预览和下载默认叠加查看者信息与时间水印
      </p>
    </div>
  </PageStateBoundary>
</template>
