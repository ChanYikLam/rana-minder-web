<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

interface Crumb {
  label: string
  path: string | null
}

const route = useRoute()
const workspace = useWorkspaceContextStore()

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: '管理看板',
  batch: '批量操作',
  members: '成员与组织',
  'department-apply': '部门关系申请',
  invite: '常规入社邀请',
  appointments: '任命调岗免职',
  exit: '成员退出与移除',
  transition: '换届管理',
  recruitment: '普通招新',
  create: '创建活动',
  joint: '联合活动',
  forms: '动态表单',
  stats: '数据统计',
  exports: '数据导出',
  notifications: '通知配置',
  'email-config': '发信配置',
  audit: '纠错与审计',
  corrections: '事实纠错',
  logs: '审计日志',
  config: '社团配置',
  clubs: '社团接入',
  delete: '正式删除',
  retention: '数据保留',
  'permission-templates': '权限模板',
  'ops-status': '运维监控',
  profile: '个人资料',
  'sync-conflict': '同步冲突处理',
  settings: '设置',
}

const crumbs = computed<Crumb[]>(() => {
  const segments = route.path.split('/').filter(Boolean)
  if (segments.length === 0) return []

  const prefix = segments[0]
  const homeLabel: Record<string, string> = {
    explore: '找社团/活动',
    me: '个人中心',
    admin: '平台管理',
    org: workspace.currentClubName || '社团工作台',
    login: '登录',
  }

  const result: Crumb[] = [{ label: homeLabel[prefix] || '首页', path: `/${prefix}` }]
  let acc = `/${prefix}`

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    acc += `/${seg}`
    const isClubId = prefix === 'org' && i === 1
    const label = isClubId
      ? workspace.currentClubName || '社团工作台'
      : SEGMENT_LABELS[seg] || seg
    result.push({ label, path: isClubId || i === segments.length - 1 ? null : acc })
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
