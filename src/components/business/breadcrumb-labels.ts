/** 面包屑段名映射与解析（纯逻辑，便于单测） */

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
    interviews: '面试管理',
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
  activity: {
    recruitment: '招新活动',
    joint: '联合活动',
  },
}

/** 段名随上下文变化（静态段，以「已确定的静态链」为键）：如 recruitment 在录取/面试语境下语义不同 */
const CONTEXT_LABELS: Record<string, Record<string, string>> = {
  me: {
    'profile/edit': '编辑资料',
    'profile/required': '补全必填信息',
    'notifications/preferences': '通知偏好',
    'interviews/tasks': '面试任务',
    'interviews/recruitment': '招新面试',
    'interviews/joint': '联合面试',
  },
  org: {
    'joint/interview': '联合面试',
    'joint/close': '结束联合活动',
    'joint/conclusions': '联合结论',
  },
  admin: {
    'joint/close': '结束联合活动',
  },
  activity: {
    'recruitment/apply': '报名申请',
    'joint/apply': '联合报名',
  },
}

/** 动态参数段（:id 等）的详情名：以「已确定的静态链」为键，避免把原始 id 展示在面包屑 */
const DETAIL_LABELS: Record<string, Record<string, string>> = {
  me: {
    'interviews/recruitment': '面试详情',
    'interviews/joint': '面试详情',
    'invitations/recruitment': '邀请详情',
    'invitations/joint': '邀请详情',
    'invitations/membership': '邀请详情',
  },
  org: {
    recruitment: '活动详情',
    joint: '活动详情',
    members: '成员详情',
    'forms/designer': '表单详情',
    'forms/versions': '表单详情',
  },
  admin: {
    joint: '活动详情',
    'forms/designer': '表单详情',
    'forms/versions': '表单详情',
  },
  activity: {
    recruitment: '活动详情',
    joint: '活动详情',
  },
}

/** 段名解析（纯函数）：静态段按域词表，上下文歧义段按静态链优先，动态参数段回退为「详情」名；无法识别才回退原文 */
export function resolveSegmentLabels(prefix: string, segments: string[]): string[] {
  const staticChain: string[] = []
  const labels: string[] = []
  for (const seg of segments) {
    const chainKey = [...staticChain, seg].join('/')
    const segLabel = SEGMENT_LABELS[prefix]?.[seg]
    const contextLabel = CONTEXT_LABELS[prefix]?.[chainKey]
    if (segLabel && !contextLabel) {
      labels.push(segLabel)
      staticChain.push(seg)
    } else if (contextLabel) {
      labels.push(contextLabel)
      staticChain.push(seg)
    } else {
      labels.push(DETAIL_LABELS[prefix]?.[staticChain.join('/')] || seg)
    }
  }
  return labels
}
