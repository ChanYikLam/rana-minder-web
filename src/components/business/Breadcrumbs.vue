<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

interface Crumb {
  label: string
  path: string | null
}

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceContextStore()

/** 各域（路由首段）下的段中文名：同一段在不同域语义不同，按域隔离 */
const SEGMENT_LABELS: Record<string, Record<string, string>> = {
  me: {
    todo: '待我处理',
    ongoing: '进行中',
    history: '历史记录',
    schedule: '面试日程',
    profile: '个人资料',
    notifications: '通知中心',
    corrections: '事实纠错',
    'sync-conflict': '同步冲突处理',
    invitations: '录取邀请',
    recruitment: '招新录取',
    joint: '联合录取',
    membership: '入社邀请',
  },
  org: {
    dashboard: '管理看板',
    batch: '批量操作',
    recruitment: '普通招新',
    create: '创建活动',
    joint: '联合活动',
    members: '成员与组织',
    'department-apply': '部门关系申请',
    invite: '常规入社邀请',
    appointments: '任命调岗免职',
    exit: '成员退出与移除',
    transition: '换届管理',
    forms: '动态表单',
    designer: '表单设计',
    versions: '表单版本',
    stats: '数据统计',
    exports: '数据导出',
    notifications: '通知配置',
    'email-config': '发信配置',
    audit: '纠错与审计',
    corrections: '事实纠错',
    logs: '审计日志',
    config: '社团配置',
    interview: '面试管理',
    applications: '报名管理',
    review: '评定管理',
    invitations: '邀请管理',
  },
  admin: {
    forms: '表单管理',
    designer: '表单设计',
    versions: '表单版本',
    joint: '联合活动',
    recruitment: '招新活动',
    clubs: '社团接入',
    wizard: '接入向导',
    notifications: '通知配置',
    'email-config': '发信配置',
    audit: '纠错与审计',
    corrections: '事实纠错',
    logs: '审计日志',
    stats: '数据统计',
    exports: '数据导出',
    delete: '正式删除',
    retention: '数据保留',
    config: '平台配置',
    'permission-templates': '权限模板',
    'ops-status': '运维监控',
  },
  explore: {
    clubs: '社团',
    activities: '活动',
    joint: '联合活动',
    recruitment: '招新活动',
  },
}

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
    me: '个人中心',
    admin: '平台管理',
    org: workspace.currentClubName || '社团工作台',
    login: '登录',
    forbidden: '无权限访问',
  }

  const homePath = `/${prefix}`
  const result: Crumb[] = [{ label: homeLabel[prefix] || '首页', path: isKnownPath(homePath) ? homePath : null }]
  let acc = `/${prefix}`

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (prefix === 'org' && i === 1) {
      acc += `/${seg}`
      continue
    }
    acc += `/${seg}`
    const label = SEGMENT_LABELS[prefix]?.[seg] || seg
    result.push({ label, path: isKnownPath(acc) ? acc : null })
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
