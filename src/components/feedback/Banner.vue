<script setup lang="ts">
import { ref, computed } from 'vue'
import { Info, CheckCircle2, AlertTriangle, X } from '@lucide/vue'

const props = withDefaults(defineProps<{
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  message?: string
  closable?: boolean
}>(), {
  tone: 'info',
  closable: false,
})

const emit = defineEmits<{ close: [] }>()

const visible = ref(true)

const config = computed(() => {
  switch (props.tone) {
    case 'success': return { icon: CheckCircle2, border: 'border-success/40', bg: 'bg-success-subtle', text: 'text-success' }
    case 'warning': return { icon: AlertTriangle, border: 'border-warning/40', bg: 'bg-warning-subtle', text: 'text-warning' }
    case 'danger': return { icon: AlertTriangle, border: 'border-danger/40', bg: 'bg-danger-subtle', text: 'text-danger' }
    default: return { icon: Info, border: 'border-info/40', bg: 'bg-info-subtle', text: 'text-info' }
  }
})

function dismiss() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <div
    v-if="visible"
    class="flex items-start gap-3 rounded-md border px-3 py-2.5"
    :class="[config.border, config.bg]"
    role="status"
  >
    <component :is="config.icon" :size="18" class="mt-0.5 shrink-0" :class="config.text" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p v-if="title" class="text-sm font-medium" :class="config.text">{{ title }}</p>
      <p v-if="message" class="text-sm text-text-secondary mt-0.5">{{ message }}</p>
      <slot />
    </div>
    <button
      v-if="closable"
      class="text-text-secondary hover:text-primary shrink-0"
      aria-label="关闭提示"
      @click="dismiss"
    >
      <X :size="16" />
    </button>
  </div>
</template>