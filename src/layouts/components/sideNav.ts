import {
  Building2, BarChart3, Users, FileText, Mail, ShieldAlert, ClipboardList, Megaphone, Flag, Settings,
} from '@lucide/vue'
import type { LucideIcon } from '@lucide/vue'

export interface SideNavItem {
  label: string
  path: string
  permission?: string
}

export interface SideNavGroup {
  label: string
  icon: LucideIcon
  prefix: string
  items: SideNavItem[]
  permission?: string
  /** 任一命中即可（与 permission 二选一；item 未显式声明权限时继承） */
  permissionAny?: string[]
}

/** 构建某社团的 L3 模块导航（按权限过滤） */
export function buildClubGroups(clubId: string, canAccess: (p?: string) => boolean): SideNavGroup[] {
  const base = `/org/${clubId}`
  const groups: SideNavGroup[] = [
    {
      label: '工作台', icon: BarChart3, prefix: `${base}/dashboard`,
      items: [
        { label: '管理看板', path: `${base}/dashboard`, permission: 'club:dashboard:view' },
        { label: '批量操作', path: `${base}/batch`, permission: 'club:batch:execute' },
      ],
    },
    {
      label: '普通招新', icon: Megaphone, prefix: `${base}/recruitment`,
      // 招新管理（负责人/人事）与默认/临时面试职能（部门负责人/面试官）均可进入活动列表与评审
      permission: 'club:recruitment:manage',
      permissionAny: ['club:recruitment:manage', 'club:interview:view', 'club:interview:evaluate'],
      items: [
        { label: '活动列表', path: `${base}/recruitment` },
        { label: '创建活动', path: `${base}/recruitment/create`, permission: 'club:recruitment:manage' },
      ],
    },
    {
      label: '联合活动', icon: Users, prefix: `${base}/joint`, permission: 'club:joint:manage',
      items: [
        { label: '活动列表', path: `${base}/joint` },
        { label: '发起活动', path: `${base}/joint/create` },
      ],
    },
    {
      label: '成员与组织', icon: Building2, prefix: `${base}/members`,
      items: [
        { label: '成员列表', path: `${base}/members`, permission: 'club:member:manage' },
        { label: '部门关系申请', path: `${base}/members/department-apply`, permission: 'club:member:manage' },
        { label: '常规入社邀请', path: `${base}/members/invite`, permission: 'club:invite:manage' },
        { label: '任命调岗免职', path: `${base}/members/appointments`, permission: 'club:appointment:manage' },
        { label: '成员退出与移除', path: `${base}/members/exit`, permission: 'club:member:manage' },
        { label: '换届管理', path: `${base}/members/transition`, permission: 'club:transition:manage' },
      ],
    },
    {
      label: '动态表单', icon: FileText, prefix: `${base}/forms`, permission: 'club:form:design',
      items: [{ label: '表单列表', path: `${base}/forms` }],
    },
    {
      label: '统计与导出', icon: BarChart3, prefix: `${base}/stat`,
      items: [
        { label: '数据统计', path: `${base}/stats`, permission: 'club:stats:view' },
        { label: '数据导出', path: `${base}/exports`, permission: 'club:export:execute' },
      ],
    },
    {
      label: '通知配置', icon: Mail, prefix: `${base}/notifications`, permission: 'club:email:config',
      items: [{ label: '发信配置', path: `${base}/notifications/email-config` }],
    },
    {
      label: '纠错与审计', icon: ShieldAlert, prefix: `${base}/audit`, permission: 'club:audit:view',
      items: [
        { label: '事实纠错', path: `${base}/audit/corrections` },
        { label: '审计日志', path: `${base}/audit/logs` },
      ],
    },
    {
      label: '社团配置', icon: Settings, prefix: `${base}/config`, permission: 'club:config:manage',
      items: [{ label: '配置管理', path: `${base}/config` }],
    },
  ]
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => (i.permission ? canAccess(i.permission) : canAccess(g.permission, g.permissionAny))),
    }))
    .filter((g) => g.items.length > 0)
}

/** 平台管理员导航（不依赖社团上下文） */
export const ADMIN_NAV: SideNavGroup[] = [
  { label: '社团管理', icon: Building2, prefix: '/admin/clubs', items: [{ label: '社团接入', path: '/admin/clubs' }] },
  { label: '联合活动', icon: Users, prefix: '/admin/joint', items: [{ label: '活动列表', path: '/admin/joint' }] },
  { label: '招新活动', icon: Flag, prefix: '/admin/recruitment', items: [{ label: '活动列表', path: '/admin/recruitment' }] },
  { label: '表单管理', icon: FileText, prefix: '/admin/forms', items: [{ label: '平台表单', path: '/admin/forms' }] },
  {
    label: '审计管理', icon: ShieldAlert, prefix: '/admin/audit',
    items: [
      { label: '纠错处置', path: '/admin/audit/corrections' },
      { label: '审计日志', path: '/admin/audit/logs' },
      { label: '正式删除', path: '/admin/delete' },
      { label: '数据保留', path: '/admin/retention' },
    ],
  },
  {
    label: '统计导出', icon: BarChart3, prefix: '/admin/stat',
    items: [
      { label: '全局统计', path: '/admin/stats' },
      { label: '全平台导出', path: '/admin/exports' },
    ],
  },
  { label: '通知配置', icon: Mail, prefix: '/admin/notifications', items: [{ label: '平台发信', path: '/admin/notifications/email-config' }] },
  {
    label: '平台配置', icon: Settings, prefix: '/admin/config',
    items: [
      { label: '平台配置', path: '/admin/config' },
      { label: '权限模板', path: '/admin/config/permission-templates' },
    ],
  },
  { label: '运维状态', icon: ClipboardList, prefix: '/admin/ops', items: [{ label: '运维监控', path: '/admin/ops-status' }] },
]