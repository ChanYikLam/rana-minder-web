<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { PageState } from '@/types/machine'
import { Loader2, AlertTriangle, Lock, Inbox } from '@lucide/vue'

interface Props {
  state: PageState
  title?: string
  error?: { code: string; message: string; supportId?: string } | null
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  loadingSkeleton?: boolean
  forbiddenMessage?: string
  errorMessage?: string
  supportId?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  emptyTitle: '暂无数据',
  emptyDescription: '',
  emptyActionLabel: '',
  loadingSkeleton: true,
  forbiddenMessage: '您没有访问此页面的权限',
  errorMessage: '',
  supportId: '',
})

const emit = defineEmits<{
  retry: []
  emptyAction: []
}>()

const containerRef = ref<HTMLElement | null>(null)

watch(
  () => props.state,
  async (newState) => {
    await nextTick()
    if (containerRef.value) {
      if (newState === 'error' || newState === 'forbidden') {
        containerRef.value.focus()
      } else if (newState === 'empty' && containerRef.value) {
        const heading = containerRef.value.querySelector('h3')
        heading?.focus()
      }
    }
  }
)

const displayMessage = computed(() => {
  if (props.state === 'error') return props.errorMessage || props.error?.message || '加载失败，请重试'
  if (props.state === 'forbidden') return props.forbiddenMessage
  return ''
})

const displaySupportId = computed(() => props.supportId || props.error?.supportId || '')
</script>

<template>
  <div
    ref="containerRef"
    class="page-state-boundary"
    :aria-busy="state === 'loading'"
    tabindex="state === 'error' || state === 'forbidden' ? -1 : undefined"
  >
    <!-- Normal -->
    <div v-if="state === 'normal'" role="region" :aria-label="title">
      <slot />
    </div>

    <!-- Loading -->
    <div
      v-else-if="state === 'loading'"
      role="status"
      aria-live="polite"
    >
      <slot name="loading">
        <div class="flex flex-col items-center justify-center py-12">
          <Loader2 :size="32" class="animate-spin text-primary mb-3" />
          <p class="text-sm text-text-secondary">加载中...</p>
          <div v-if="loadingSkeleton" class="w-full mt-6 space-y-3">
            <div class="h-4 bg-muted rounded animate-pulse" />
            <div class="h-4 bg-muted rounded animate-pulse w-4/5" />
            <div class="h-4 bg-muted rounded animate-pulse w-3/5" />
          </div>
        </div>
      </slot>
    </div>

    <!-- Empty -->
    <div
      v-else-if="state === 'empty'"
      class="flex flex-col items-center justify-center py-12"
      role="status"
    >
      <div class="flex items-center justify-center w-24 h-24 mb-4 text-muted-foreground">
        <Inbox :size="48" />
      </div>
      <h3 class="text-lg font-medium text-primary mb-1" tabindex="-1">{{ emptyTitle }}</h3>
      <p v-if="emptyDescription" class="text-sm text-text-secondary text-center max-w-md">{{ emptyDescription }}</p>
      <button
        v-if="emptyActionLabel"
        class="mt-4 px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors"
        @click="emit('emptyAction')"
      >
        {{ emptyActionLabel }}
      </button>
    </div>

    <!-- Error -->
    <div
      v-else-if="state === 'error'"
      class="flex flex-col items-center justify-center py-12"
      role="alert"
      aria-live="assertive"
      tabindex="-1"
    >
      <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-danger-subtle text-danger">
        <AlertTriangle :size="32" />
      </div>
      <h3 class="text-lg font-medium text-danger mb-1">操作失败</h3>
      <p class="text-sm text-text-secondary text-center max-w-md">{{ displayMessage }}</p>
      <p v-if="displaySupportId" class="text-xs text-muted-foreground mt-2">支持编号：{{ displaySupportId }}</p>
      <button
        class="mt-4 px-4 py-2 rounded-md border border-border text-primary text-sm font-medium hover:bg-primary-subtle transition-colors"
        @click="emit('retry')"
      >
        重试
      </button>
    </div>

    <!-- Forbidden -->
    <div
      v-else-if="state === 'forbidden'"
      class="flex flex-col items-center justify-center py-12"
      role="alert"
      aria-live="assertive"
      tabindex="-1"
    >
      <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-danger-subtle text-danger">
        <Lock :size="32" />
      </div>
      <h3 class="text-lg font-medium text-danger mb-1">无权限访问</h3>
      <p class="text-sm text-text-secondary text-center max-w-md">{{ displayMessage }}</p>
      <p v-if="displaySupportId" class="text-xs text-muted-foreground mt-2">支持编号：{{ displaySupportId }}</p>
      <div class="flex gap-2 mt-4">
        <router-link
          to="/me"
          class="px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          返回个人中心
        </router-link>
      </div>
    </div>
  </div>
</template>
