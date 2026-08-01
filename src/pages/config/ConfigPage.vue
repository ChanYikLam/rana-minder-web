<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import { Save, ShieldAlert, Building2 } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

const route = useRoute()
const state = ref<PageState>('loading')
const saving = ref(false)
const config = ref({
  clubName: '', clubDescription: '', requireEmailVerification: true, requireProfileComplete: true,
  maxMembers: 200, allowSelfExit: true, academicYearStart: 9,
})

const isAdmin = computed(() => route.path.startsWith('/admin'))

async function loadData() {
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<typeof config.value>(`${apiScope.prefix}/config`)
  if (result.kind === 'completed') {
    config.value = { ...config.value, ...result.data }
    state.value = 'normal'
  } else { state.value = 'error' }
}

async function handleSave() {
  saving.value = true
  const apiScope = resolveApiScope(route)
  if (!apiScope) { saving.value = false; return }
  const result = await post(`${apiScope.prefix}/config`, { ...config.value })
  saving.value = false
  if (result.kind === 'completed') {
    toast.success('配置已保存')
  } else {
    toast.error('保存失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="配置" @retry="loadData">
    <div class="max-w-xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">{{ isAdmin ? '平台配置' : '社团配置' }}</h1>

      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4 flex items-center gap-2"><Building2 :size="18" /> 基本信息</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">{{ isAdmin ? '平台名称' : '社团名称' }}</label>
            <input v-model="config.clubName" type="text" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">描述</label>
            <textarea v-model="config.clubDescription" rows="2" class="w-full px-3 py-2 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
        </div>
      </Card>

      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">安全与准入</h2>
        <div class="space-y-3">
          <label class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">要求邮箱验证</p>
              <p class="text-xs text-text-secondary">成员必须验证邮箱才能使用业务功能</p>
            </div>
            <input v-model="config.requireEmailVerification" type="checkbox" class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">要求资料完整</p>
              <p class="text-xs text-text-secondary">成员必须补齐资料才能使用业务功能</p>
            </div>
            <input v-model="config.requireProfileComplete" type="checkbox" class="rounded border-border" />
          </label>
          <label class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">允许自行退出</p>
              <p class="text-xs text-text-secondary">成员可自行申请退出社团</p>
            </div>
            <input v-model="config.allowSelfExit" type="checkbox" class="rounded border-border" />
          </label>
        </div>
      </Card>

      <Card class="mb-4">
        <h2 class="text-base font-medium text-text-primary mb-4">容量与学年</h2>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">最大成员数</label>
            <input v-model.number="config.maxMembers" type="number" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">学年开始月</label>
            <select v-model.number="config.academicYearStart" class="w-full h-10 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary">
              <option v-for="m in 12" :key="m" :value="m">{{ m }}月</option>
            </select>
          </div>
        </div>
      </Card>

      <Card class="mb-4 border-warning">
        <div class="flex items-start gap-2">
          <ShieldAlert :size="18" class="text-warning mt-0.5 shrink-0" />
          <p class="text-xs text-text-secondary">安全开关修改为高风险操作，需重新认证后生效。</p>
        </div>
      </Card>

      <button
        class="w-full h-11 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover flex items-center justify-center gap-2 disabled:opacity-60"
        :disabled="saving"
        @click="handleSave"
      >
        <Save :size="18" /> {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </PageStateBoundary>
</template>
