<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { ClipboardList, MailCheck, ArrowRight, RefreshCw } from '@lucide/vue'

const router = useRouter()
const session = useSessionViewStore()

const rechecking = ref(false)

const missingItems: { key: string; label: string; icon: typeof ClipboardList; done: boolean }[] = []

if (!session.profileGate.complete) {
  missingItems.push({ key: 'profile', label: '补充个人资料（手机号、邮箱）', icon: ClipboardList, done: false })
}
if (!session.profileGate.emailVerified) {
  missingItems.push({ key: 'email', label: '验证邮箱', icon: MailCheck, done: false })
}

async function handleRecheck() {
  if (rechecking.value) return
  rechecking.value = true
  await session.loadSession()
  rechecking.value = false
  if (!session.needsProfileGate) {
    router.push('/me')
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto py-12">
    <div class="rounded-lg border border-border bg-elevated shadow-md p-8">
      <div class="flex items-center gap-3 mb-6">
        <div class="flex items-center justify-center w-12 h-12 rounded-full bg-warning-subtle text-warning">
          <ClipboardList :size="24" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-primary">请先完善资料</h1>
          <p class="text-sm text-text-secondary">完成以下步骤后才能使用业务功能</p>
        </div>
      </div>

      <!-- 步骤指示 -->
      <ol class="space-y-3 mb-8">
        <li
          v-for="(item, index) in missingItems"
          :key="item.key"
          class="flex items-center gap-3 rounded-lg border border-border p-4"
        >
          <span
            class="flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium shrink-0"
            :class="item.done ? 'bg-success text-text-on-primary' : 'bg-primary text-text-on-primary'"
            aria-hidden="true"
          >
            {{ index + 1 }}
          </span>
          <component :is="item.icon" :size="18" class="text-text-secondary shrink-0" />
          <span class="text-sm text-primary">{{ item.label }}</span>
        </li>
      </ol>

      <div class="flex flex-col gap-3">
        <button
          class="w-full h-11 flex items-center justify-center gap-2 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors"
          @click="router.push('/me/profile/edit')"
        >
          前往完善资料
          <ArrowRight :size="16" />
        </button>

        <button
          class="w-full h-11 flex items-center justify-center gap-2 rounded-md border border-border text-primary hover:bg-subtle transition-colors disabled:opacity-60"
          :disabled="rechecking"
          @click="handleRecheck"
        >
          <RefreshCw :size="16" :class="rechecking ? 'animate-spin' : ''" />
          {{ rechecking ? '正在核验...' : '我已完成，重新核验' }}
        </button>
      </div>

      <p class="mt-4 text-xs text-text-secondary text-center">
        资料将同步自学校统一身份认证，仅用于业务联系
      </p>
    </div>
  </div>
</template>
