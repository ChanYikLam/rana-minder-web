<script setup lang="ts">
import { computed } from 'vue'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useWriteGuard } from '@/composables/useWriteGuard'

interface Props {
  permission: string
  scope?: 'session' | 'workspace'
  fallback?: 'hide' | 'disable'
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
  if (props.scope === 'workspace') {
    return workspaceStore.hasPermission(props.permission)
  }
  return sessionStore.hasPermission(props.permission)
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
</template>
