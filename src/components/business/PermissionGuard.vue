<script setup lang="ts">
import { computed } from 'vue'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useWriteGuard } from '@/composables/useWriteGuard'

interface Props {
  /** 单个权限串或权限串数组（任一命中即可） */
  permission: string | string[]
  scope?: 'session' | 'workspace'
  fallback?: 'hide' | 'disable' | 'notice'
  disableReason?: string
  /** IDN-010/011: 写操作门禁 - 资料门未通过时禁用 */
  requireWrite?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  scope: 'session',
  fallback: 'hide',
  disableReason: '',
  requireWrite: false,
})

const sessionStore = useSessionViewStore()
const workspaceStore = useWorkspaceContextStore()
const { canWrite, writeDisabledReason } = useWriteGuard()

const hasPermission = computed(() => {
  const check = (permission: string) => {
    if (props.scope === 'workspace') {
      return workspaceStore.hasPermission(permission)
    }
    return sessionStore.hasPermission(permission)
  }
  if (Array.isArray(props.permission)) {
    return props.permission.some(check)
  }
  return check(props.permission)
})

/** 写操作门禁：资料门未通过时也禁用 */
const isDisabled = computed(() => {
  if (props.requireWrite && !canWrite.value) return true
  return false
})

const disabledReasonText = computed(() => {
  if (isDisabled.value && props.requireWrite) return writeDisabledReason.value || props.disableReason
  return props.disableReason
})
</script>

<template>
  <template v-if="hasPermission && !isDisabled">
    <slot />
  </template>
  <template v-else-if="fallback === 'disable' || (hasPermission && isDisabled)">
    <slot :disabled="true" :disabledReason="disabledReasonText" />
  </template>
  <div
    v-else-if="fallback === 'notice'"
    class="rounded-lg border border-dashed border-border bg-subtle/50 px-4 py-3 text-center"
  >
    <div class="text-sm font-medium text-text-primary mb-1">无权限操作</div>
    <div class="text-xs text-text-secondary">{{ disableReason || '当前账号无执行此操作的权限，如需帮助请联系管理员' }}</div>
  </div>
</template>
