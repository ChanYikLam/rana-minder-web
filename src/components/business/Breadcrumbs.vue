<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { resolveSegmentLabels } from './breadcrumb-labels'

interface Crumb {
  label: string
  path: string | null
}

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceContextStore()

/** 累积路径是否命中真实路由：与路由表同源校验，避免白名单漂移造成点击 404 或漏链（catch-all 除外） */
function isKnownPath(path: string): boolean {
  const resolved = router.resolve(path)
  const last = resolved.matched[resolved.matched.length - 1]
  return !!last && last.name !== 'P-GEN-01' && last.name !== 'P-GEN-00-root'
}

const crumbs = computed<Crumb[]>(() => {
  const segments = route.path.split('/').filter(Boolean)
  if (segments.length === 0) return []

  const prefix = segments[0]
  const homeLabel: Record<string, string> = {
    explore: '找社团/活动',
    activity: '活动',
    me: '个人中心',
    admin: '平台管理',
    org: workspace.currentClubName || '社团工作台',
    login: '登录',
    forbidden: '无权限访问',
  }

  const homePath = `/${prefix}`
  const result: Crumb[] = [{ label: homeLabel[prefix] || '首页', path: isKnownPath(homePath) ? homePath : null }]
  let acc = `/${prefix}`

  const pathSegments = segments.slice(1)
  const labelSegments = pathSegments.filter((_, idx) => !(prefix === 'org' && idx === 0))
  const labels = resolveSegmentLabels(prefix, labelSegments)
  for (let i = 0; i < pathSegments.length; i++) {
    acc += `/${pathSegments[i]}`
    if (prefix === 'org' && i === 0) continue
    const labelIdx = prefix === 'org' ? i - 1 : i
    result.push({ label: labels[labelIdx], path: isKnownPath(acc) ? acc : null })
  }

  return result
})
</script>

<template>
  <nav
    v-if="crumbs.length > 0"
    class="flex flex-wrap items-center gap-1 text-sm text-text-secondary"
    aria-label="面包屑"
  >
    <template v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`">
      <template v-if="index > 0">
        <ChevronRight :size="14" class="shrink-0" aria-hidden="true" />
      </template>
      <span v-if="crumb.path" class="hover:text-primary">
        <router-link :to="crumb.path" class="transition-colors">{{ crumb.label }}</router-link>
      </span>
      <span v-else class="text-text-primary font-medium">{{ crumb.label }}</span>
    </template>
  </nav>
</template>
