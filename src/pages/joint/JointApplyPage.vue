<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import type { PageState } from '@/types/machine'
import { toast } from 'vue-sonner'
import { ArrowLeft, Users, Send } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const detail = ref<{ title: string; clubName: string; participants: { clubName: string }[]; description: string } | null>(null)
const consented = ref(false)
const submitting = ref(false)

async function loadData() {
  state.value = 'loading'
  const result = await get<{ title: string; description: string; participants: { clubName: string }[]; clubName: string }>(`/org/club-001/joint/${route.params.jointId}`)
  if (result.kind === 'completed') {
    detail.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

async function handleSubmit() {
  submitting.value = true
  const result = await post(`/activity/joint/${route.params.jointId}/apply`, {
    consented: consented.value,
  })
  submitting.value = false
  if (result.kind === 'completed') {
    toast.success('联合报名已提交')
    router.push('/me/ongoing')
  } else {
    toast.error('提交失败，请稍后重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="联合报名" @retry="loadData">
    <div v-if="detail" class="max-w-lg mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <Card class="mb-4">
        <h1 class="text-xl font-bold text-text-primary mb-2">{{ detail.title }}</h1>
        <p class="text-sm text-text-secondary mb-4">{{ detail.description }}</p>

        <div class="rounded-lg bg-warning-subtle p-3 mb-4">
          <p class="text-sm text-warning font-medium mb-1">联合活动说明</p>
          <p class="text-xs text-text-secondary">各参与社团将独立给出评价结论和邀请，您的报名信息将共享给所有参与社团。</p>
        </div>

        <div class="mb-4">
          <p class="text-sm font-medium text-text-primary mb-2 flex items-center gap-1.5"><Users :size="16" /> 参与社团</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="p in detail.participants" :key="p.clubName" class="inline-flex items-center px-3 py-1.5 rounded-md bg-subtle text-sm text-text-primary">{{ p.clubName }}</span>
          </div>
        </div>
      </Card>

      <!-- 共享同意 -->
      <Card class="mb-4">
        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="consented" type="checkbox" class="mt-0.5 rounded border-border" />
          <div>
            <p class="text-sm font-medium text-text-primary">我已阅读并理解联合活动规则</p>
            <p class="text-xs text-text-secondary mt-0.5">我的报名信息将共享给所有参与社团，各社团独立评价</p>
          </div>
        </label>
      </Card>

      <button
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
        :disabled="!consented || submitting"
        @click="handleSubmit"
      >
        <Send :size="16" /> {{ submitting ? '提交中...' : '提交联合报名' }}
      </button>
    </div>
  </PageStateBoundary>
</template>
