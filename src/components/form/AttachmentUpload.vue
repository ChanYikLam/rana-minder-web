<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, LoaderCircle, ShieldAlert } from '@lucide/vue'
import type { FileMeta, FileStatus } from '@/types/domain/form'

const props = defineProps<{
  modelValue?: FileMeta[]
  accept?: string
  hint?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [files: FileMeta[]]
}>()

const ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

const allowedTypes = computed(() =>
  props.accept ? props.accept.split(',').map((s) => s.trim()).filter(Boolean) : ACCEPTED_TYPES,
)

const files = computed(() => props.modelValue ?? [])

function statusPreview(status: FileStatus): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' } {
  switch (status) {
    case 'uploading': return { label: '上传中', tone: 'neutral' }
    case 'uploaded': return { label: '已上传，待检查', tone: 'neutral' }
    case 'checking': return { label: '安全检查中', tone: 'warning' }
    case 'quarantined': return { label: '已隔离（疑似恶意）', tone: 'danger' }
    case 'approved': return { label: '已通过安全检测', tone: 'success' }
    case 'rejected': return { label: '已拒绝', tone: 'danger' }
    default: return { label: status, tone: 'neutral' }
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function onSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  const nextFiles: FileMeta[] = [...files.value]
  Array.from(input.files).forEach((f) => {
    const now = new Date().toISOString()
    const base = { uploadedAt: now, checkedAt: null as string | null, downloadUrl: null as string | null }
    if (!allowedTypes.value.includes(f.type)) {
      nextFiles.push({ ...base, id: `rejected-type-${Date.now()}`, name: f.name, size: f.size, mimeType: f.type, status: 'rejected' })
      return
    }
    if (f.size > MAX_SIZE_BYTES) {
      nextFiles.push({ ...base, id: `rejected-size-${Date.now()}`, name: f.name, size: f.size, mimeType: f.type, status: 'rejected' })
      return
    }
    nextFiles.push({ ...base, id: `mock-file-${Date.now()}`, name: f.name, size: f.size, mimeType: f.type, status: 'checking' })
  })
  emit('update:modelValue', nextFiles)
  input.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-1.5 text-xs text-text-secondary">
      <span>{{ hint || '支持：图片（PNG/WebP）、PDF、Word；单个不超过 10MB' }}</span>
    </div>

    <div class="space-y-2">
      <div
        v-for="f in files"
        :key="f.id"
        class="flex items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-text-primary truncate">{{ f.name }}</p>
          <p class="text-xs text-text-secondary">{{ formatSize(f.size) }}</p>
        </div>
        <span
          class="flex items-center gap-1 text-xs whitespace-nowrap"
          :class="{
            'text-success': statusPreview(f.status).tone === 'success',
            'text-danger': statusPreview(f.status).tone === 'danger',
            'text-warning': statusPreview(f.status).tone === 'warning',
            'text-text-secondary': statusPreview(f.status).tone === 'neutral',
          }"
        >
          <CheckCircle2 v-if="f.status === 'approved'" :size="14" />
          <LoaderCircle v-else-if="f.status === 'checking' || f.status === 'uploading'" :size="14" class="animate-spin" />
          <ShieldAlert v-else-if="f.status === 'quarantined'" :size="14" />
          {{ statusPreview(f.status).label }}
        </span>
        <button
          class="text-xs text-primary hover:underline shrink-0"
          :disabled="f.status === 'checking' || f.status === 'uploading'"
          @click="emit('update:modelValue', files.filter((x) => x.id !== f.id))"
        >
          移除
        </button>
      </div>

      <p v-if="files.some((f) => f.status === 'quarantined')" class="text-xs text-danger">
        检测到疑似恶意内容，附件已被隔离，请联系管理员。
      </p>

      <label
        class="flex items-center justify-center h-10 rounded-md border border-dashed border-border-strong cursor-pointer hover:bg-subtle transition-colors"
      >
        <input type="file" multiple class="sr-only" :accept="allowedTypes.join(',')" @change="onSelect" />
        <span class="text-sm text-text-secondary">+ 选择附件</span>
      </label>
    </div>
  </div>
</template>