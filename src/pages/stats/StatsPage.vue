<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get } from '@/services/client'
import { errorToPageState, errorCodeOf } from '@/services/error-map'
import type { PageState } from '@/types/machine'
import { TrendingUp, TrendingDown, Minus, Users, UserPlus, ClipboardList, Mail } from '@lucide/vue'
import { resolveApiScope } from '@/services/route-scope'

const route = useRoute()
const state = ref<PageState>('loading')
const summary = ref<{ label: string; value: number; trend: string; trendValue: number }[]>([])
const deptDist = ref<{ name: string; count: number }[]>([])

const icons: Record<string, typeof Users> = { 总成员数: Users, 本月新增: UserPlus, 活跃招新: ClipboardList, 待处理申请: Mail }

async function loadData() {
  state.value = 'loading'
  const apiScope = resolveApiScope(route)
  if (!apiScope) { state.value = 'error'; return }
  const result = await get<{ summary: typeof summary.value; departmentDistribution: typeof deptDist.value }>(`${apiScope.prefix}/stats`)
  if (result.kind === 'completed') {
    summary.value = result.data.summary
    deptDist.value = result.data.departmentDistribution
    state.value = 'normal'
  } else { state.value = errorToPageState(errorCodeOf(result)) }
}

const maxCount = ref(0)
function updateMax() { maxCount.value = Math.max(...deptDist.value.map((d) => d.count), 1) }

onMounted(async () => { await loadData(); updateMax() })
</script>

<template>
  <PageStateBoundary :state="state" title="管理统计" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">管理统计</h1>

      <!-- 概览卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card v-for="item in summary" :key="item.label" padding="p-4">
          <div class="flex items-center justify-between mb-1">
            <component :is="icons[item.label] || ClipboardList" :size="16" class="text-text-secondary" />
            <span
              v-if="item.trend !== 'flat'"
              class="flex items-center gap-0.5 text-xs"
              :class="item.trend === 'up' ? 'text-success' : 'text-danger'"
            >
              <component :is="item.trend === 'up' ? TrendingUp : TrendingDown" :size="12" />
              {{ item.trendValue }}
            </span>
            <Minus v-else :size="12" class="text-text-secondary" />
          </div>
          <p class="text-2xl font-bold text-text-primary">{{ item.value }}</p>
          <p class="text-xs text-text-secondary">{{ item.label }}</p>
        </Card>
      </div>

      <!-- 部门分布 -->
      <Card>
        <h2 class="text-base font-medium text-text-primary mb-4">部门成员分布</h2>
        <div class="space-y-3">
          <div v-for="dept in deptDist" :key="dept.name" class="flex items-center gap-3">
            <span class="text-sm text-text-primary w-20 shrink-0">{{ dept.name }}</span>
            <div class="flex-1 h-6 rounded bg-subtle overflow-hidden">
              <div
                class="h-full bg-primary rounded transition-all"
                :style="{ width: `${(dept.count / maxCount) * 100}%` }"
              />
            </div>
            <span class="text-sm text-text-secondary w-8 text-right">{{ dept.count }}</span>
          </div>
        </div>
        <p class="text-xs text-text-secondary mt-4">
          * 成员统计按学号去重；部门统计允许重复计入（同一成员可属于多个部门）<br>
          * 数据已做小样本保护，不提供成员排行榜、自动评分或人员优劣排名
        </p>
      </Card>
    </div>
  </PageStateBoundary>
</template>
