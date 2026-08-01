<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Crown, ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, Users } from '@lucide/vue'
import { identityApi } from '@/services/modules'

interface TransitionData {
  currentLeader: { id: string; name: string; title: string }
  candidates: { id: string; name: string; currentTitle: string; proposedTitle: string; department: string }[]
  appointments: { id: string; name: string; currentTitle: string; proposedTitle: string; department: string }[]
  canExecute: boolean
  version: number
}

interface TransitionResult { memberId: string; action: string; targetTitle: string; success: boolean }

const route = useRoute()
const router = useRouter()
const state = ref<PageState>('loading')
const data = ref<TransitionData | null>(null)
const executing = ref(false)
const result = ref<{ success: string[]; failed: string[] } | null>(null)
const reauthProof = ref('')
const reauthenticating = ref(false)

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<TransitionData>(`/org/${clubId}/members/transition`)
  if (result.kind === 'completed') {
    data.value = result.data
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

async function reauthenticate() {
  reauthenticating.value = true
  const response = await identityApi.reauthenticate()
  reauthenticating.value = false
  if (response.kind === 'completed') {
    reauthProof.value = response.data.proof
    toast.success('身份验证已完成')
    return
  }
  toast.error('身份验证失败，请重新登录后再试')
}

async function handleExecute() {
  if (!data.value?.canExecute || !reauthProof.value) return
  executing.value = true
  const clubId = route.params.clubId as string
  const r = await post<{ results: TransitionResult[] }>(`/org/${clubId}/members/transition`, {
    reauthProof: reauthProof.value,
  }, { expectedVersion: data.value.version })
  executing.value = false
  if (r.kind === 'completed') {
    const results = (r as { kind: 'completed'; data: { results: TransitionResult[] } }).data.results
    const nameOf = (memberId: string) => {
      const c = data.value?.candidates.find((x) => x.id === memberId)
      if (c) return c.name
      const a = data.value?.appointments.find((x) => x.id === memberId)
      return a ? a.name : memberId
    }
    const success = results.filter((x) => x.success).map((x) => nameOf(x.memberId))
    const failed = results.filter((x) => !x.success).map((x) => nameOf(x.memberId))
    result.value = { success, failed }
    toast.success(failed.length === 0 ? '换届执行完成' : '换届执行部分成功')
  } else {
    reauthProof.value = ''
    toast.error('换届执行失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="换届管理" @retry="loadData">
    <div v-if="data" class="max-w-2xl mx-auto">
      <button class="flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4" @click="router.back()">
        <ArrowLeft :size="16" /> 返回
      </button>

      <h1 class="text-2xl font-bold text-text-primary mb-6">换届管理</h1>

      <!-- 执行前 -->
      <template v-if="!result">
        <!-- 当前负责人 -->
        <Card class="mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-text-on-primary"><Crown :size="24" /></div>
            <div>
              <p class="text-sm text-text-secondary">当前负责人</p>
              <p class="text-base font-medium text-text-primary">{{ data.currentLeader.name }} · {{ data.currentLeader.title }}</p>
            </div>
          </div>
        </Card>

        <!-- 新任方案 -->
        <Card class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">新任方案</h2>
          <div class="space-y-2">
            <div v-for="c in data.candidates" :key="c.id" class="flex items-center justify-between rounded-lg border border-border p-3">
              <div class="flex items-center gap-2">
                <Users :size="16" class="text-text-secondary" />
                <div>
                  <p class="text-sm text-text-primary">{{ c.name }}</p>
                  <p class="text-xs text-text-secondary">{{ c.department }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs text-text-secondary">{{ c.currentTitle }}</p>
                <p class="text-sm font-medium text-primary">→ {{ c.proposedTitle }}</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- 任命方案 -->
        <Card v-if="data.appointments.length > 0" class="mb-4">
          <h2 class="text-base font-medium text-text-primary mb-3">同期任命</h2>
          <div class="space-y-2">
            <div v-for="a in data.appointments" :key="a.id" class="flex items-center justify-between rounded-lg border border-border p-3">
              <span class="text-sm text-text-primary">{{ a.name }} · {{ a.department }}</span>
              <div class="text-right">
                <p class="text-xs text-text-secondary">{{ a.currentTitle }}</p>
                <p class="text-sm font-medium text-primary">→ {{ a.proposedTitle }}</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- 高风险提示 -->
        <Card class="mb-4 border-warning">
          <div class="flex items-start gap-2">
            <ShieldAlert :size="20" class="text-warning mt-0.5 shrink-0" />
            <div class="text-sm">
              <p class="font-medium text-warning">换届操作需重新认证</p>
              <p class="text-xs text-text-secondary mt-1">新任失败将撤回，旧任部分失败保留新任持续重试。部分失败不回滚已成功新任。</p>
            </div>
          </div>
        </Card>

        <button
          class="w-full h-11 rounded-md border border-border text-text-primary font-medium hover:bg-subtle disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
          :disabled="reauthenticating || Boolean(reauthProof)"
          @click="reauthenticate"
        >
          <ShieldAlert :size="18" /> {{ reauthProof ? '身份验证已完成' : reauthenticating ? '正在验证...' : '重新验证身份' }}
        </button>

        <button
          class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2"
          :disabled="executing || !data.canExecute || !reauthProof"
          @click="handleExecute"
        >
          <ShieldAlert :size="18" /> {{ executing ? '执行中...' : '确认执行换届' }}
        </button>
      </template>

      <!-- 执行结果 -->
      <template v-else>
        <Card class="mb-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center justify-center w-12 h-12 rounded-full" :class="result.failed.length === 0 ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
              <CheckCircle2 v-if="result.failed.length === 0" :size="24" />
              <AlertTriangle v-else :size="24" />
            </div>
            <div>
              <p class="text-base font-medium text-text-primary">{{ result.failed.length === 0 ? '换届完成' : '部分成功' }}</p>
              <p class="text-sm text-text-secondary">成功 {{ result.success.length }} 项{{ result.failed.length > 0 ? `，失败 ${result.failed.length} 项` : '' }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <div v-for="name in result.success" :key="name" class="flex items-center gap-2 text-sm">
              <CheckCircle2 :size="14" class="text-success" />
              <span class="text-text-primary">{{ name }}</span>
              <span class="text-xs text-success ml-auto">成功</span>
            </div>
          </div>
        </Card>

        <button class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover" @click="router.push(`/org/${route.params.clubId}/dashboard`)">
          返回工作台
        </button>
      </template>
    </div>
  </PageStateBoundary>
</template>
