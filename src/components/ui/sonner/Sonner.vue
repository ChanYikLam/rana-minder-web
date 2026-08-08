<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/lib/utils'

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, 'class', 'toastOptions', 'position', 'gap', 'offset', 'visibleToasts')
</script>

<template>
  <Sonner
    position="top-center"
    :gap="8"
    :offset="16"
    :visible-toasts="3"
    :class="cn('toaster group', props.class)"
    :style="{
      '--width': 'min(92vw, 420px)',
      '--border-radius': 'var(--radius-lg)',
      '--normal-bg': 'var(--bg-elevated)',
      '--normal-text': 'var(--text-primary)',
      '--normal-border': 'var(--border)',
      '--success-bg': 'var(--success-subtle)',
      '--success-text': 'var(--success)',
      '--success-border': 'var(--success)',
      '--error-bg': 'var(--danger-subtle)',
      '--error-text': 'var(--danger)',
      '--error-border': 'var(--danger)',
      '--warning-bg': 'var(--warning-subtle)',
      '--warning-text': 'var(--warning)',
      '--warning-border': 'var(--warning)',
      '--info-bg': 'var(--info-subtle)',
      '--info-text': 'var(--info)',
      '--info-border': 'var(--info)',
      '--gray2': 'var(--text-primary)',
      '--gray3': 'var(--border)',
      '--gray4': 'var(--border)',
      '--gray5': 'var(--border)',
      '--gray12': 'var(--text-primary)',
    }"
    :toast-options="props.toastOptions ?? {
      duration: 2000,
      classes: {
        toast: 'backdrop-blur',
      },
    }"
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <CircleCheckIcon class="size-[18px] text-success" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-[18px] text-info" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-[18px] text-warning" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-[18px] text-danger" />
    </template>
    <template #loading-icon>
      <div>
        <Loader2Icon class="size-[18px] animate-spin text-primary" />
      </div>
    </template>
  </Sonner>
</template>