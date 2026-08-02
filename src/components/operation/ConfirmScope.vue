<script setup lang="ts">
import { computed } from 'vue'
import { ShieldAlert, Check } from '@lucide/vue'
import ImpactPreview, { type ImpactItem } from './ImpactPreview.vue'
import Button from '@/components/common/Button.vue'

export interface ConfirmScopeProps {
  open: boolean
  clubName?: string
  department?: string
  targets: ImpactItem[]
  notifyCount?: number
  irreversible?: boolean
  confirming?: boolean
}

const props = withDefaults(defineProps<ConfirmScopeProps>(), {
  confirming: false,
  irreversible: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const agreed = computed(() => props.open && props.targets.length > 0)

function onConfirm() {
  if (!agreed.value) return
  emit('confirm')
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="emit('update:open', false)" />
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-scope-title"
      class="relative w-full max-w-lg rounded-lg border border-border bg-background shadow-xl max-h-[85vh] overflow-y-auto"
    >
      <div class="flex items-center gap-2 border-b border-border px-5 py-4">
        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-warning-subtle text-warning shrink-0">
          <ShieldAlert :size="18" />
        </div>
        <h2 id="confirm-scope-title" class="text-base font-semibold text-primary">确认操作影响范围</h2>
      </div>

      <div class="px-5 py-4 space-y-4">
        <ImpactPreview
          :club-name="clubName"
          :department="department"
          :targets="targets"
          :notify-count="notifyCount"
          :irreversible="irreversible"
        />
        <p class="text-xs text-text-secondary">
          请核对上述目标社团、实际影响范围与预计通知对象。确认后操作将正式执行。
        </p>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="outline" @click="emit('cancel'); emit('update:open', false)">取消</Button>
        <Button variant="destructive" :loading="confirming" :disabled="!agreed" @click="onConfirm">
          <Check :size="14" class="mr-1" /> 确认执行（{{ targets.length }} 项）
        </Button>
      </div>
    </div>
  </div>
</template>