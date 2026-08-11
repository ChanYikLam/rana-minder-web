/**
 * Mock 层有状态内存库：社团接入（SM-ORG-001）与停用体系
 * 单一数据源，页面刷新即重置；状态流转经 state-machines assertTransition 校验
 * 接入向导：分层 Group 搜索（精确→中文连续子串→受控错别字近似、3 有效字符门槛）、
 *          层级/用途唯一/重复绑定校验、已有成员导入（Casdoor 既有成员成为当前关系）
 * 停用体系：普通停用（进行中业务阻止）/紧急停用（只读+期限暂停）/恢复顺延/解除接入/修复/重绑/重新接入
 */
import { assertTransition } from './state-machines/transitions'
import { getMemberStats } from './db-members'
import type { ClubAccessItem, ClubAccessStatus, GroupNode, GroupMatchTier, GroupSearchResult } from '../types/domain/organization'

const SM = 'SM-ORG-001'

interface GroupSeed extends Omit<GroupNode, 'memberCount'> {
  leaderGroupId: string | null
  members: string[]
}

export interface ClubSyncEvent {
  id: string
  kind: 'group_lost' | 'repair' | 'rebind' | 'disconnect' | 'reaccess' | 'suspend' | 'recover' | 'import'
  at: string
  note: string
}

export interface ClubFreezeInterval {
  id: string
  reason: string
  suspendedAt: string
  recoveredAt: string | null
}

export interface WizardDraft {
  selectedGroupId: string | null
  leaderGroupId: string | null
  email: string
  deptGroups: string[]
  roleGroups: string[]
  leaderRoleGroup: string
}

export interface MockClubAccess {
  clubId: string
  clubName: string
  description: string
  status: ClubAccessStatus
  groupId: string | null
  mappingVersion: number
  wizardStep: number
  wizard: WizardDraft | null
  leaderGroupId: string | null
  leaderName: string | null
  /** 向导提交时选择的部门 Group ID 列表（P1-005 权限模板映射用） */
  deptGroupIds: string[]
  /** 向导提交时选择的职位 Group ID 列表（不含负责人职位） */
  roleGroupIds: string[]
  createdAt: string
  boundAt: string | null
  importedAt: string | null
  importedCount: number
  syncEvents: ClubSyncEvent[]
  freezeIntervals: ClubFreezeInterval[]
  readonly: boolean
}

/** Group → 权限模板映射（向导提交后建立，用于接入后从 Group 成员推导权限） */
export interface GroupTemplateMapping {
  clubId: string
  groupId: string
  templateId: string
  createdAt: string
}

/** 模板映射注册表（内存态，与 clubAccesses 同步生命周期） */
const groupTemplateMappings: GroupTemplateMapping[] = [
  { clubId: 'club-001', groupId: 'grp-001', templateId: 'tpl-002', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-001', groupId: 'grp-lead-001', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-001', groupId: 'grp-dept-001', templateId: 'tpl-003', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-002', groupId: 'grp-002', templateId: 'tpl-002', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-002', groupId: 'grp-lead-002', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
]

/** 预置模板与 Group 用途的默认关联规则（P1-005）
 * - leader（社团负责人职位）→ tpl-001 社团负责人模板
 * - 普通职位（副负责人/干事等）→ tpl-002 人事模板（成员管理/招新），避免越级授予负责人权限
 * - 部门 → tpl-003 面试官模板
 */
const DEFAULT_TEMPLATE_MAP: Record<string, string> = {
  leader: 'tpl-001',     // 负责人职位 Group → 社团负责人模板
  position: 'tpl-002',   // 普通职位 Group → 人事模板
  department: 'tpl-003', // 部门 Group → 面试官模板
}

const nowIso = () => new Date().toISOString()

/** 稳定标识可精确检索、原始名称可检索的 Group 树（层级 + 用途 + 绑定关系） */
const groups: GroupSeed[] = [
  {
    id: 'grp-root', name: '学校学生组织', stableId: 'G-ROOT', path: '/学校学生组织',
    parentId: null, purpose: 'position', boundClubId: null, leaderGroupId: null, members: [],
  },
  {
    id: 'grp-001', name: '计算机协会', stableId: 'G-COMP-CLUB', path: '/学校学生组织/计算机协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: 'club-001', leaderGroupId: 'grp-lead-001', members: ['mem-004', 'mem-001', 'mem-002', 'mem-003', 'mem-006'],
  },
  {
    id: 'grp-002', name: '电子设计协会', stableId: 'G-ELEC-CLUB', path: '/学校学生组织/电子设计协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: 'club-002', leaderGroupId: 'grp-lead-002', members: ['mem-101'],
  },
  {
    id: 'grp-003', name: '数学建模协会', stableId: 'G-MATH-CLUB', path: '/学校学生组织/数学建模协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: 'club-003', leaderGroupId: null, members: ['mem-201', 'mem-202', 'mem-203'],
  },
  {
    id: 'grp-004', name: '摄影协会', stableId: 'G-PHOTO-CLUB', path: '/学校学生组织/摄影协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: null, leaderGroupId: null, members: ['mem-401', 'mem-402', 'mem-403'],
  },
  {
    id: 'grp-005', name: '新媒体中心', stableId: 'G-MEDIA-CLUB', path: '/学校学生组织/新媒体中心',
    parentId: 'grp-root', purpose: 'club', boundClubId: 'club-005', leaderGroupId: null, members: ['mem-301'],
  },
  {
    id: 'grp-lead-004', name: '摄影协会负责人', stableId: 'G-PHOTO-LEAD', path: '/学校学生组织/摄影协会/负责人',
    parentId: 'grp-004', purpose: 'position', boundClubId: null, leaderGroupId: null, members: ['mem-401'],
  },
  {
    id: 'grp-vice-004', name: '摄影协会副负责人', stableId: 'G-PHOTO-VICE', path: '/学校学生组织/摄影协会/副负责人',
    parentId: 'grp-004', purpose: 'position', boundClubId: null, leaderGroupId: null, members: ['mem-402'],
  },
  {
    id: 'grp-lead-001', name: '计算机协会负责人', stableId: 'G-COMP-LEAD', path: '/学校学生组织/计算机协会/负责人',
    parentId: 'grp-001', purpose: 'position', boundClubId: 'club-001', leaderGroupId: null, members: ['mem-004'],
  },
  {
    id: 'grp-lead-002', name: '电子设计协会负责人', stableId: 'G-ELEC-LEAD', path: '/学校学生组织/电子设计协会/负责人',
    parentId: 'grp-002', purpose: 'position', boundClubId: 'club-002', leaderGroupId: null, members: ['mem-101'],
  },
  {
    id: 'grp-dept-001', name: '计算机协会技术部', stableId: 'G-COMP-DEPT-001', path: '/学校学生组织/计算机协会/技术部',
    parentId: 'grp-001', purpose: 'department', boundClubId: 'club-001', leaderGroupId: null, members: [],
  },
  {
    id: 'grp-dept-004', name: '摄影协会创作部', stableId: 'G-PHOTO-DEPT-001', path: '/学校学生组织/摄影协会/创作部',
    parentId: 'grp-004', purpose: 'department', boundClubId: null, leaderGroupId: null, members: [],
  },
  // 同名后缀种子（与 grp-dept-001 以「技术部」结尾）：用于验证 suffix 匹配在「社团名+部门名」约定下的精确解析优先级
  {
    id: 'grp-dept-002', name: '计算机协会信息技术部', stableId: 'G-COMP-DEPT-002', path: '/学校学生组织/计算机协会/信息技术部',
    parentId: 'grp-001', purpose: 'department', boundClubId: 'club-001', leaderGroupId: null, members: [],
  },
]

const memberNames: Record<string, string> = {
  'mem-004': '张明远', 'mem-001': '陈雨桐', 'mem-002': '王浩然', 'mem-003': '李思颖', 'mem-006': '林晓薇',
  'mem-101': '赵子涵', 'mem-201': '郑浩宇', 'mem-202': '陈雨桐', 'mem-203': '黄志强',
  'mem-301': '吴思远', 'mem-401': '孙欣怡', 'mem-402': '周嘉诚', 'mem-403': '徐静怡',
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** 接入注册表：club-001/002 已启用；club-004 待接入；club-003 停用中；club-005 同步异常（可演示修复/重绑） */
export const clubAccesses: MockClubAccess[] = [
  {
    clubId: 'club-001', clubName: '计算机协会', description: '专注计算机技术交流与项目实践', status: 'enabled', groupId: 'grp-001', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-001', leaderGroupId: 'grp-lead-001', email: 'club-001@example.edu.cn', deptGroups: ['grp-dept-001'], roleGroups: [], leaderRoleGroup: 'grp-lead-001' },
    leaderGroupId: 'grp-lead-001', leaderName: '张明远', deptGroupIds: ['grp-dept-001'], roleGroupIds: [],
    createdAt: '2022-09-01T00:00:00+08:00', boundAt: '2022-09-05T10:00:00+08:00', importedAt: '2022-09-05T11:00:00+08:00', importedCount: 6,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-002', clubName: '电子设计协会', description: '电子设计与嵌入式开发', status: 'enabled', groupId: 'grp-002', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-002', leaderGroupId: 'grp-lead-002', email: 'club-002@example.edu.cn', deptGroups: [], roleGroups: [], leaderRoleGroup: 'grp-lead-002' },
    leaderGroupId: 'grp-lead-002', leaderName: '赵子涵', deptGroupIds: [], roleGroupIds: [],
    createdAt: '2022-09-01T00:00:00+08:00', boundAt: '2022-09-05T10:00:00+08:00', importedAt: '2022-09-05T11:00:00+08:00', importedCount: 1,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-003', clubName: '数学建模协会', description: '数学建模竞赛与学术研究', status: 'suspended', groupId: 'grp-003', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-003', leaderGroupId: null, email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: '' },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [],
    createdAt: '2023-03-01T00:00:00+08:00', boundAt: '2023-03-10T10:00:00+08:00', importedAt: null, importedCount: 0,
    syncEvents: [], freezeIntervals: [{ id: 'fri-001', reason: '常规停用', suspendedAt: daysAgo(9), recoveredAt: null }], readonly: true,
  },
  {
    clubId: 'club-004', clubName: '摄影协会', description: '摄影艺术与后期制作', status: 'wizard_pending', groupId: null, mappingVersion: 0,
    wizardStep: 0, wizard: { selectedGroupId: null, leaderGroupId: null, email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: '' },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [],
    createdAt: '2025-07-28T00:00:00+08:00', boundAt: null, importedAt: null, importedCount: 0,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-005', clubName: '新媒体中心', description: '校园新媒体运营与内容创作', status: 'sync_abnormal_ro', groupId: 'grp-005', mappingVersion: 2,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-005', leaderGroupId: null, email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: '' },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [],
    createdAt: '2024-09-01T00:00:00+08:00', boundAt: '2024-09-08T10:00:00+08:00', importedAt: null, importedCount: 0,
    syncEvents: [{ id: 'evt-001', kind: 'group_lost', at: daysAgo(3), note: '对账检测到 Group 删除/移动/失权，进入同步异常只读' }],
    freezeIntervals: [], readonly: true,
  },
]

// ================= 工具 =================

const seedClubAccesses: MockClubAccess[] = structuredClone(clubAccesses)
const seedGroups: GroupSeed[] = structuredClone(groups)
const seedGroupTemplateMappings: GroupTemplateMapping[] = structuredClone(groupTemplateMappings)
const seedMemberNames: Record<string, string> = { ...memberNames }

/**
 * 测试隔离：恢复接入注册表、Group 绑定关系、动态成员名、同步失败留痕与序号。
 * MRM-013：此前仅恢复 clubAccesses / groups 绑定字段 / 模板映射，遗漏——
 * ① syncPositionMembership 写入的动态成员名（memberNames）；
 * ② groupSyncFail 累积的失败留痕（groupSyncTraces）与序号；
 * ③ resolvePositionGroup 运行时新建的职位 Group（grp-pos-*，groups 数组被 push）；
 * ④ positionGroupSeq / groupSyncTraceSeq 自增序列。
 * 中断写入用例后重跑会因上述残留导致断言失败。
 */
export function resetOrgDb(): void {
  clubAccesses.splice(0, clubAccesses.length, ...structuredClone(seedClubAccesses))
  // 删除运行时新建的 Group（seedGroups 之后的元素），再按索引整体还原种子字段
  groups.splice(seedGroups.length)
  for (let i = 0; i < seedGroups.length; i++) {
    const seed = seedGroups[i]
    const g = groups[i]
    g.boundClubId = seed.boundClubId
    g.leaderGroupId = seed.leaderGroupId
    g.members = [...seed.members]
  }
  groupTemplateMappings.splice(0, groupTemplateMappings.length, ...structuredClone(seedGroupTemplateMappings))
  // MRM-013：还原动态成员名快照（syncPositionMembership 会写入新条目）
  Object.keys(memberNames).forEach((k) => { delete memberNames[k] })
  Object.assign(memberNames, structuredClone(seedMemberNames))
  // MRM-013：清空同步失败留痕并还原序号，避免跨用例 id 膨胀与留痕残留
  groupSyncTraces.splice(0, groupSyncTraces.length)
  positionGroupSeq = 0
  groupSyncTraceSeq = 0
}

function findClub(clubId: string): MockClubAccess | undefined {
  return clubAccesses.find((c) => c.clubId === clubId)
}

function findGroup(groupId: string): GroupSeed | undefined {
  return groups.find((g) => g.id === groupId)
}

function groupName(groupId: string | null): string | null {
  const g = groupId ? findGroup(groupId) : undefined
  return g?.name ?? null
}

function validateTransition(club: MockClubAccess, to: ClubAccessStatus, event: string): { ok: boolean; error?: string } {
  const check = assertTransition(SM, club.status, to, event)
  if (!check.ok) return { ok: false, error: check.reason || '非法状态转换' }
  return { ok: true }
}

function pushSyncEvent(club: MockClubAccess, kind: ClubSyncEvent['kind'], note: string) {
  club.syncEvents.unshift({ id: 'evt-' + Date.now(), kind, at: nowIso(), note })
}

/** 校验 Group 是否满足层级/用途唯一/重复绑定约束（SRS 7.3 + PRD US-ORG-01） */
export function validateGroupForBinding(groupId: string, clubId: string): { ok: boolean; error?: string } {
  const group = findGroup(groupId)
  if (!group) return { ok: false, error: '未找到该 Group' }
  if (group.purpose !== 'club') return { ok: false, error: `Group「${group.name}」用途为「${group.purpose}」，仅 club 用途可绑定为社团` }
  if (group.boundClubId && group.boundClubId !== clubId) return { ok: false, error: `Group「${group.name}」已被社团 ${group.boundClubId} 绑定，不得重复绑定` }
  if (!group.parentId || !findGroup(group.parentId)) return { ok: false, error: `Group「${group.name}」缺少有效父级，层级校验未通过` }
  return { ok: true }
}

/** 向导步骤 3 引用校验：部门/职位/负责人职位 Group 必须位于所选社团层级之下且用途匹配（CFG-006；供后续权限映射写入前复检） */
function validateSubGroups(
  groupId: string | null,
  deptGroups: string[] | undefined,
  roleGroups: string[] | undefined,
  leaderRoleGroup: string | undefined,
): { ok: boolean; error?: string } {
  const underGroup = (id: string, purpose: 'department' | 'position'): boolean => {
    const g = findGroup(id)
    return !!g && g.purpose === purpose && !!groupId && g.parentId === groupId
  }
  if (deptGroups && deptGroups.length > 0 && deptGroups.some((id) => !underGroup(id, 'department'))) {
    return { ok: false, error: '部门 Group 必须位于所选社团层级下且为部门级 Group' }
  }
  if (roleGroups && roleGroups.length > 0 && roleGroups.some((id) => !underGroup(id, 'position'))) {
    return { ok: false, error: '职位 Group 必须位于所选社团层级下且为职位级 Group' }
  }
  if (leaderRoleGroup && !underGroup(leaderRoleGroup, 'position')) {
    return { ok: false, error: '负责人职位 Group 必须位于所选社团层级下且为职位 Group' }
  }
  return { ok: true }
}

// ================= 分层搜索（PRD US-ORG-01 / SRS 7.3） =================

const CJK_LATIN_RE = /[\u4e00-\u9fa5a-zA-Z0-9]/g

/** 去除首尾空白后的有效字符数（不足 3 不产生近似候选） */
export function effectiveChars(keyword: string): number {
  return (keyword.trim().match(CJK_LATIN_RE) || []).length
}

function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[m][n]
}

function toResult(g: GroupSeed, match: GroupMatchTier, score: number): GroupSearchResult {
  return { id: g.id, name: g.name, stableId: g.stableId, path: g.path, parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId, memberCount: g.members.length, match, score }
}

/**
 * 名称分层搜索：精确命中 → 中文任意连续子串命中 → 受控错别字近似候选。
 * 近似候选不得超过直接命中（精确+子串）数量；不足 3 个有效字符时不产生近似候选。
 * 层内按名称确定性排序。Group 原始名称可直接检索，稳定标识精确匹配。
 */
export function searchGroups(keyword: string): GroupSearchResult[] {
  const kw = keyword.trim()
  if (!kw) return []
  const eff = effectiveChars(kw)
  // SM-ORG-001：仅暴露社团级候选（与 /admin/groups 列表同口径，不泄露内部部门/职位层级）
  const scope = groups.filter((g) => g.purpose === 'club')
  const exact = scope.filter((g) => g.name === kw || g.stableId === kw)
  const substring = scope.filter((g) => !exact.includes(g) && (g.name.includes(kw) || g.path.includes(kw)))
  const directCount = exact.length + substring.length
  let fuzzy: GroupSeed[] = []
  if (eff >= 3) {
    const threshold = kw.length <= 4 ? 1 : 2
    fuzzy = scope.filter((g) => !exact.includes(g) && !substring.includes(g) && editDistance(g.name, kw) <= threshold)
    if (fuzzy.length > directCount) fuzzy = fuzzy.slice(0, directCount)
  }
  const sortName = (list: GroupSeed[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
  return [
    ...sortName(exact).map((g) => toResult(g, 'exact', 1)),
    ...sortName(substring).map((g) => toResult(g, 'substring', 0.8)),
    ...sortName(fuzzy).map((g) => toResult(g, 'fuzzy', 0.6)),
  ]
}

// ================= 接入向导 =================

/** 职位 Group 统一查询：同一数据源按「是否排除已绑定」过滤（leaderGroups/positions 共用，杜绝双源不一致） */
function listPositionGroups(parentId: string, excludeBound = true): GroupNode[] {
  return groups
    .filter((g) => g.purpose === 'position' && g.parentId === parentId && (!excludeBound || !g.boundClubId))
    .map((g) => ({
      id: g.id, name: g.name, stableId: g.stableId, path: g.path, parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId, memberCount: g.members.length,
    }))
}

/** Group 详情：基本信息 + 已有成员 + 可用负责人职位 Group（向导步骤 1/2 使用） */
let positionGroupSeq = 0

/** 部门 Group 解析：社团 Group 下 purpose=department 的 Group。解析优先级——①精确名；②「社团名+部门名」拼接（种子命名约定，如 计算机协会技术部）；
 * ③名称后缀匹配（同后缀多候选时取命名最短者，最贴近部门名），避免同后缀歧义时 find 取到首个非目标 Group */
function findDepartmentGroup(clubGroup: GroupSeed, departmentName: string | null): GroupSeed | null {
  if (!departmentName) return null
  const candidates = groups.filter((g) => g.parentId === clubGroup.id && g.purpose === 'department')
  return (
    candidates.find((g) => g.name === departmentName) ??
    candidates.find((g) => g.name === clubGroup.name + departmentName) ??
    candidates.filter((g) => g.name.endsWith(departmentName)).sort((a, b) => a.name.length - b.name.length)[0] ??
    null
  )
}

/** 职位 Group 定位/建立：部门职位挂在部门 Group 下（部门 Group 缺失时挂社团 Group 下），同名职位 Group 已存在则复用 */
function resolvePositionGroup(clubGroup: GroupSeed, departmentGroup: GroupSeed | null, title: string): GroupSeed {
  const parent = departmentGroup ?? clubGroup
  const existing = groups.find((g) => g.parentId === parent.id && g.purpose === 'position' && g.name === title)
  if (existing) return existing
  positionGroupSeq += 1
  const node: GroupSeed = {
    id: `grp-pos-${positionGroupSeq}`,
    name: title,
    stableId: `G-POS-${positionGroupSeq}`,
    path: `${parent.path}/${title}`,
    parentId: parent.id,
    purpose: 'position',
    boundClubId: clubGroup.boundClubId,
    leaderGroupId: null,
    members: [],
  }
  groups.push(node)
  return node
}

/**
 * ORG-001/017：Group 为当前关系权威——任命/免职/换届执行后同步职位 Group 成员，positions 不得独立于 Group 变动。
 * 职位 Group 解析：title=负责人 → 社团负责人职位 Group（leaderGroupId）；其余 → 部门 Group 下的同名职位 Group（部门 Group 缺失时挂社团 Group 下），无则自动建立。
 * 宽容语义：移除操作不自动建组（未命中既有职位 Group 视为无事可做，不记录失败）；社团未接入/未绑定 Group 时返回 ok:false 但不阻断任命流程（调用方忽略结果）。
 * 失败留痕：所有 ok:false 写入 groupSyncTraces，避免「职位已写入但 Group 未同步」静默发生；负责人 Group 配置悬空（leaderGroupId 指向不存在）视为配置损坏，
 * 即使移除也返回明确错误并入留痕，不再静默吞错。
 */
export interface PositionSyncInput {
  clubId: string
  memberId: string
  memberName: string
  departmentName: string | null
  title: string
  active: boolean
}

export interface GroupSyncTrace {
  id: string
  at: string
  ok: boolean
  clubId: string
  memberId: string
  memberName: string
  departmentName: string | null
  title: string
  active: boolean
  error: string
}

/** ORG-001/017 同步失败留痕（最近失败在前；调用方可据此观测/补偿，AppointmentCommand.syncWarning 同步可见） */
export const groupSyncTraces: GroupSyncTrace[] = []

let groupSyncTraceSeq = 0

function groupSyncFail(input: PositionSyncInput, error: string): { ok: false; error: string } {
  groupSyncTraceSeq += 1
  groupSyncTraces.unshift({
    id: `gs-${groupSyncTraceSeq}`,
    at: nowIso(),
    ok: false,
    clubId: input.clubId,
    memberId: input.memberId,
    memberName: input.memberName,
    departmentName: input.departmentName,
    title: input.title,
    active: input.active,
    error,
  })
  return { ok: false, error }
}

export function syncPositionMembership(input: PositionSyncInput): { ok: boolean; error?: string; groupId?: string } {
  const access = clubAccesses.find((c) => c.clubId === input.clubId)
  if (!access) return groupSyncFail(input, '社团未接入')
  const clubGroup = access.groupId ? groups.find((g) => g.id === access.groupId) : undefined
  if (!clubGroup) return groupSyncFail(input, '社团未绑定 Group')
  let target: GroupSeed | null
  if (input.title === '负责人') {
    if (access.leaderGroupId) {
      target = groups.find((g) => g.id === access.leaderGroupId) ?? null
      // leaderGroupId 为空时非目标（社团接入向导未配置负责人 Group）不视为错误；配置了却不存在则视为配置损坏，不静默吞错
      if (!target) return groupSyncFail(input, '负责人职位 Group 不存在或已失效')
    } else {
      target = null
    }
  } else if (input.active) {
    target = resolvePositionGroup(clubGroup, findDepartmentGroup(clubGroup, input.departmentName), input.title)
  } else {
    const parent = findDepartmentGroup(clubGroup, input.departmentName) ?? clubGroup
    target = groups.find((g) => g.parentId === parent.id && g.purpose === 'position' && g.name === input.title) ?? null
  }
  if (!target) {
    if (input.active) return groupSyncFail(input, '未找到对应职位 Group')
    // 移除宽容：负责人无配置或非负责人职位从未建组/从未入组，视为无事可做，不记录失败
    return { ok: true }
  }
  const idx = target.members.indexOf(input.memberId)
  if (input.active) {
    if (idx === -1) target.members.push(input.memberId)
    if (!memberNames[input.memberId]) memberNames[input.memberId] = input.memberName
  } else if (idx !== -1) {
    target.members.splice(idx, 1)
  }
  return { ok: true, groupId: target.id }
}

export function getGroupDetail(groupId: string): {
  id: string
  name: string
  stableId: string
  path: string
  parentId: string | null
  purpose: GroupNode['purpose']
  boundClubId: string | null
  members: { id: string; name: string }[]
  leaderGroups: GroupNode[]
  departments: GroupNode[]
  positions: GroupNode[]
} | null {
  const group = findGroup(groupId)
  if (!group) return null
  return {
    id: group.id,
    name: group.name,
    stableId: group.stableId,
    path: group.path,
    parentId: group.parentId,
    purpose: group.purpose,
    boundClubId: group.boundClubId,
    members: group.members.map((id) => ({ id, name: memberNames[id] ?? id })),
    leaderGroups: listPositionGroups(groupId, true),
    departments: groups.filter((g) => g.purpose === 'department' && g.parentId === groupId).map((g) => ({
      id: g.id, name: g.name, stableId: g.stableId, path: g.path, parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId, memberCount: g.members.length,
    })),
    positions: listPositionGroups(groupId, false),
  }
}

export function getClubAccess(clubId: string): MockClubAccess | undefined {
  return findClub(clubId)
}

export function listClubAccesses(): ClubAccessItem[] {
  return [...clubAccesses]
    .sort((a, b) => a.clubName.localeCompare(b.clubName, 'zh-CN'))
    .map((c) => ({
      clubId: c.clubId,
      clubName: c.clubName,
      description: c.description,
      status: c.status,
      groupId: c.groupId,
      groupName: groupName(c.groupId),
      mappingVersion: c.mappingVersion,
      wizardStep: c.wizardStep,
      leaderName: c.leaderName,
      memberCount: getMemberStats(c.clubId).total,
      createdAt: c.createdAt,
      boundAt: c.boundAt,
      importedAt: c.importedAt,
      importedCount: c.importedCount,
      wizard: c.wizard
        ? {
            selectedGroupId: c.wizard.selectedGroupId,
            leaderGroupId: c.wizard.leaderGroupId,
            email: c.wizard.email,
            deptGroups: c.wizard.deptGroups,
            roleGroups: c.wizard.roleGroups,
            leaderRoleGroup: c.wizard.leaderRoleGroup,
          }
        : null,
      freezeExtensionMs: c.freezeIntervals.reduce((sum, f) => sum + (f.recoveredAt ? new Date(f.recoveredAt).getTime() - new Date(f.suspendedAt).getTime() : 0), 0),
      readonly: c.readonly,
      hasActiveBusiness: false,
      syncEvents: c.syncEvents,
    }))
}

/** 全量 Group 目录（SM-ORG-001 唯一 Group 数据源；接入向导候选/层级校验共用） */
export function listGroups(): GroupNode[] {
  return groups.map((g) => ({
    id: g.id, name: g.name, stableId: g.stableId, path: g.path,
    parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId, memberCount: g.members.length,
  }))
}

// ================= 模板映射（US-CFG-01 / P1-005） =================

/** 查询社团所有 Group→Template 映射 */
export function getTemplateMappings(clubId: string): GroupTemplateMapping[] {
  return groupTemplateMappings.filter((m) => m.clubId === clubId)
}

/** 创建单条 Group→Template 映射（幂等） */
function ensureMapping(clubId: string, groupId: string, templateId: string) {
  const exists = groupTemplateMappings.some((m) => m.clubId === clubId && m.groupId === groupId)
  if (!exists) {
    groupTemplateMappings.push({ clubId, groupId, templateId, createdAt: nowIso() })
  }
}

/** 为社团批量创建权限模板映射（向导完成后调用，幂等） */
function createTemplateMappings(club: MockClubAccess) {
  // 负责人 Group → tpl-001（社团负责人模板）
  if (club.leaderGroupId) ensureMapping(club.clubId, club.leaderGroupId, 'tpl-001')
  // 部门 Group → tpl-003（面试官模板）
  for (const deptId of club.deptGroupIds) ensureMapping(club.clubId, deptId, DEFAULT_TEMPLATE_MAP.department)
  // 普通职位 Group（roleGroupIds 不含负责人，负责人已在上面单独映射） → tpl-002（人事模板）
  for (const roleId of club.roleGroupIds) {
    if (roleId === club.leaderGroupId) continue // 负责人已映射 tpl-001，避免重复
    ensureMapping(club.clubId, roleId, DEFAULT_TEMPLATE_MAP.position)
  }
  // 社团主 Group → tpl-002（人事模板；主 Group 成员为普通成员，不授予负责人级权限）
  if (club.groupId) ensureMapping(club.clubId, club.groupId, DEFAULT_TEMPLATE_MAP.position)
}

/** 清除社团所有模板映射（解除接入时调用） */
export function clearTemplateMappings(clubId: string) {
  for (let i = groupTemplateMappings.length - 1; i >= 0; i--) {
    if (groupTemplateMappings[i].clubId === clubId) groupTemplateMappings.splice(i, 1)
  }
}

/**
 * 新社团接入：从既有 Casdoor Group 选择接入（ORG-005 取消新建社团，CFG-006 向导）。
 * 创建即进入 wizard_pending（SM-ORG-001 初始态），任一步校验失败保持未启用且不产生部分权限；
 * 绑定仅在 complete_validation 时落库（重复绑定/层级/负责人连续性在启用前复检）。
 */
export function createClubAccess(input: { groupId: string; name: string; description?: string; leaderGroupId: string; email?: string; deptGroups?: string[]; roleGroups?: string[]; leaderRoleGroup?: string }): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const name = input.name.trim()
  if (!name) return { ok: false, error: '请填写社团展示名称' }
  if (clubAccesses.some((c) => c.clubName === name)) return { ok: false, error: '社团名称已存在，请检查用途唯一性' }
  const binding = validateGroupForBinding(input.groupId, '')
  if (!binding.ok) return { ok: false, error: binding.error }
  const group = findGroup(input.groupId)!
  const leader = findGroup(input.leaderGroupId)
  if (!leader) return { ok: false, error: '负责人职位 Group 不存在' }
  if (leader.parentId !== group.id || leader.purpose !== 'position') return { ok: false, error: '负责人职位 Group 必须在所选社团层级下且为职位 Group' }
  if (leader.members.length === 0) return { ok: false, error: '负责人职位 Group 内没有有效负责人，接入不可创建' }
  const sub = validateSubGroups(input.groupId, input.deptGroups, input.roleGroups, input.leaderRoleGroup)
  if (!sub.ok) return { ok: false, error: sub.error }
  // P3-3：层级校验通过后，负责人职位引用必须与负责人职位一致（前端向导同值提交），避免草稿双字段分裂
  if (input.leaderRoleGroup && input.leaderRoleGroup !== input.leaderGroupId) {
    return { ok: false, error: '负责人职位引用必须与负责人职位一致' }
  }
  const seq = Math.max(0, ...clubAccesses.map((c) => Number(c.clubId.replace('club-', '')) || 0)) + 1
  const club: MockClubAccess = {
    clubId: `club-${String(seq).padStart(3, '0')}`,
    clubName: name,
    description: (input.description ?? '').trim(),
    status: 'wizard_pending',
    groupId: null,
    mappingVersion: 0,
    wizardStep: 2,
    wizard: { selectedGroupId: input.groupId, leaderGroupId: input.leaderGroupId, email: (input.email ?? '').trim(), deptGroups: input.deptGroups ?? [], roleGroups: input.roleGroups ?? [], leaderRoleGroup: input.leaderRoleGroup ?? '' },
    leaderGroupId: input.leaderGroupId,
    leaderName: memberNames[leader.members[0]] ?? null,
    deptGroupIds: input.deptGroups ?? [],
    roleGroupIds: input.roleGroups ?? [],
    createdAt: nowIso(),
    boundAt: null,
    importedAt: null,
    importedCount: 0,
    syncEvents: [],
    freezeIntervals: [],
    readonly: false,
  }
  clubAccesses.push(club)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === club.clubId) }
}

export function saveWizardStep(clubId: string, input: { step: number; selectedGroupId?: string | null; leaderGroupId?: string | null; email?: string; deptGroups?: string[]; roleGroups?: string[]; leaderRoleGroup?: string }): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'wizard_pending', 'save_step')
  if (!check.ok) return { ok: false, error: check.error }
  const selectedGroupId = input.selectedGroupId !== undefined ? input.selectedGroupId : club.wizard?.selectedGroupId ?? null
  const leaderGroupId = input.leaderGroupId !== undefined ? input.leaderGroupId : club.wizard?.leaderGroupId ?? null
  if (leaderGroupId) {
    const leader = findGroup(leaderGroupId)
    if (!leader) return { ok: false, error: '负责人职位 Group 不存在' }
    if (selectedGroupId && (leader.parentId !== selectedGroupId || leader.purpose !== 'position')) return { ok: false, error: '负责人职位 Group 必须在所选社团层级下且为职位 Group' }
  }
  const deptGroups = input.deptGroups !== undefined ? input.deptGroups : club.wizard?.deptGroups ?? []
  const roleGroups = input.roleGroups !== undefined ? input.roleGroups : club.wizard?.roleGroups ?? []
  const leaderRoleGroup = input.leaderRoleGroup !== undefined ? input.leaderRoleGroup : club.wizard?.leaderRoleGroup ?? ''
  if ((deptGroups.length > 0 || roleGroups.length > 0 || leaderRoleGroup) && !selectedGroupId) {
    return { ok: false, error: '请先选择要接入的 Group' }
  }
  const sub = validateSubGroups(selectedGroupId, deptGroups, roleGroups, leaderRoleGroup)
  if (!sub.ok) return { ok: false, error: sub.error }
  // P3-3：层级校验通过后，负责人职位引用必须与负责人职位一致（前端向导同值提交）
  if (leaderRoleGroup && leaderGroupId && leaderRoleGroup !== leaderGroupId) {
    return { ok: false, error: '负责人职位引用必须与负责人职位一致' }
  }
  club.wizardStep = Math.max(0, Math.min(4, input.step))
  club.wizard = {
    selectedGroupId,
    leaderGroupId,
    email: input.email !== undefined ? input.email.trim() : club.wizard?.email ?? '',
    deptGroups,
    roleGroups,
    leaderRoleGroup,
  }
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/**
 * MRM-A2：向导保存的部门/职位引用在极端/历史数据下可能混入 path 形态（如
 * '/学校学生组织/计算机协会/技术部'）而非 group ID。deptGroupIds/roleGroupIds
 * 作为模板映射的 groupId 契约必须是 ID，统一在此解析回 group ID：
 * - 已是 ID（groups 中可命中 id）则原样保留；
 * - 是 path（groups 中命中 path）则解析为对应 id；
 * - 两者都命中不了则原样透传（由后续 ensureMapping 按字符串建映射，不抛错）。
 */
function resolveGroupIds(entries: string[] | undefined): string[] {
  if (!entries || entries.length === 0) return []
  return entries.map((entry) => {
    const byId = findGroup(entry)
    if (byId) return entry
    const byPath = groups.find((g) => g.path === entry)
    return byPath ? byPath.id : entry
  })
}

export function completeWizard(clubId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'enabled', 'complete_validation')
  if (!check.ok) return { ok: false, error: check.error }
  const groupId = club.wizard?.selectedGroupId
  if (!groupId) return { ok: false, error: '请先选择要接入的 Group' }
  const binding = validateGroupForBinding(groupId, clubId)
  if (!binding.ok) return { ok: false, error: binding.error }
  const leaderGroupId = club.wizard?.leaderGroupId || club.leaderGroupId
  if (!leaderGroupId) return { ok: false, error: '必须指定负责人职位 Group' }
  const leaderGroup = findGroup(leaderGroupId)
  if (!leaderGroup || leaderGroup.members.length === 0) return { ok: false, error: '负责人职位 Group 内没有有效负责人，接入不可完成' }
  if (leaderGroup.parentId !== groupId || leaderGroup.purpose !== 'position') return { ok: false, error: '负责人职位 Group 必须在所选社团层级下且为职位 Group' }
  const group = findGroup(groupId)!
  group.boundClubId = clubId
  club.groupId = groupId
  club.leaderGroupId = leaderGroupId
  club.leaderName = memberNames[leaderGroup.members[0]] ?? null
  // MRM-A2：部门/职位引用统一解析为 group ID（兼容历史 path 形态，保证模板映射 groupId 契约）
  club.deptGroupIds = resolveGroupIds(club.wizard?.deptGroups ?? club.deptGroupIds ?? [])
  club.roleGroupIds = resolveGroupIds(club.wizard?.roleGroups ?? club.roleGroupIds ?? [])
  club.boundAt = nowIso()
  club.mappingVersion += 1
  club.status = 'enabled'
  club.readonly = false
  createTemplateMappings(club)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/** 接入时已有成员成为当前关系（来自 Casdoor 既有成员）；未知历史日期不得伪造成接入日期 */
export function importMembers(clubId: string, memberIds: string[]): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  if (club.status !== 'wizard_pending' && club.status !== 'enabled') return { ok: false, error: '当前状态不可导入成员' }
  const group = club.groupId ? findGroup(club.groupId) : club.wizard?.selectedGroupId ? findGroup(club.wizard.selectedGroupId) : undefined
  if (!group) return { ok: false, error: '请先选择要接入的 Group' }
  if (!memberIds || memberIds.length === 0) return { ok: false, error: '成员列表不能为空，请先选择要导入的成员' }
  const valid = memberIds.filter((id) => group.members.includes(id))
  if (valid.length !== memberIds.length) return { ok: false, error: '存在不在该 Group 内的成员，导入被拒绝' }
  club.importedCount = valid.length
  club.importedAt = nowIso()
  // boundAt 仅由启用（completeWizard）写入：启用前导入不提前绑定；启用后导入保留既有绑定时间
  pushSyncEvent(club, 'import', `导入 ${valid.length} 名既有成员，历史计数与当前成员数口径不同`)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

// ================= 停用体系（US-ORG-03） =================

/** 普通停用：被进行中业务阻止；紧急停用：只读 + 期限暂停 */
export function suspendClub(clubId: string, mode: 'normal' | 'force', reason: string, opts: { hasActiveBusiness: boolean }): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  if (mode === 'normal' && opts.hasActiveBusiness) return { ok: false, error: '存在进行中业务，不能普通停用，请先完成或结束相关业务' }
  if (!reason.trim()) return { ok: false, error: '停用必须填写原因' }
  const event = mode === 'normal' ? 'normal_suspend' : 'force_suspend'
  const check = validateTransition(club, 'suspended', event)
  if (!check.ok) return { ok: false, error: check.error }
  club.status = 'suspended'
  club.readonly = true
  club.freezeIntervals.push({ id: 'fri-' + Date.now(), reason: reason.trim(), suspendedAt: nowIso(), recoveredAt: null })
  pushSyncEvent(club, 'suspend', `${mode === 'force' ? '紧急' : '普通'}停用：${reason.trim()}`)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/** 恢复启用：独立重新启用，按实际受阻时长一次性顺延冻结期限 */
export function recoverClub(clubId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'enabled', 're_enable')
  if (!check.ok) return { ok: false, error: check.error }
  for (const f of club.freezeIntervals) {
    if (!f.recoveredAt) f.recoveredAt = nowIso()
  }
  club.status = 'enabled'
  club.readonly = false
  pushSyncEvent(club, 'recover', '恢复启用，冻结期限已按停用时长顺延')
  createTemplateMappings(club)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/** 解除接入：有历史的空间进入待重新接入，普通角色失权，超管保留修复入口 */
export function disconnectClub(clubId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  // 支持 enabled → pending_rebind（前端管理页对已启用社团展示"解除接入"）与
  // sync_abnormal_ro → pending_rebind（对账异常后解除），统一走 pending_rebind 待重接状态
  const check = validateTransition(club, 'pending_rebind', 'disconnect')
  if (!check.ok) return { ok: false, error: check.error }
  const prevGroupId = club.groupId
  const prevLeaderGroupId = club.leaderGroupId
  const prevGroupName = groupName(prevGroupId) || '未绑定'
  if (prevGroupId) {
    const g = findGroup(prevGroupId)
    if (g) g.boundClubId = null
  }
  if (prevLeaderGroupId && prevLeaderGroupId !== prevGroupId) {
    const lg = findGroup(prevLeaderGroupId)
    if (lg) lg.boundClubId = null
  }
  // 一并解绑该社团层级下的部门/职位子 Group（P3-1：避免子 Group 残留绑定）
  for (const g of groups) {
    if (g.boundClubId === club.clubId) g.boundClubId = null
  }
  club.status = 'pending_rebind'
  club.groupId = null
  club.readonly = true
  club.leaderGroupId = null
  club.leaderName = null
  club.wizardStep = 0
  club.wizard = { selectedGroupId: null, leaderGroupId: null, email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: '' }
  pushSyncEvent(club, 'disconnect', `解除接入（原 Group：${prevGroupName}），等待重新接入`)
  clearTemplateMappings(clubId)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

function bindGroupInternal(club: MockClubAccess, groupId: string): { ok: boolean; error?: string } {
  const binding = validateGroupForBinding(groupId, club.clubId)
  if (!binding.ok) return binding
  const group = findGroup(groupId)!
  group.boundClubId = club.clubId
  club.groupId = groupId
  club.mappingVersion += 1
  return { ok: true }
}

/** 修复原 Group（对账通过后统一先进入已停用，PRD-OPT-041） */
export function repairGroup(clubId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'suspended', 'repair_ok')
  if (!check.ok) return { ok: false, error: check.error }
  if (club.groupId && findGroup(club.groupId)) {
    club.status = 'suspended'
    club.readonly = false
    pushSyncEvent(club, 'repair', '修复原 Group 并对账通过，按规范统一先进入已停用')
    return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
  }
  return { ok: false, error: '原 Group 已不存在，请选择重新绑定' }
}

/** 重新绑定新 Group（统一先进入已停用） */
export function rebindClub(clubId: string, groupId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'suspended', 'rebind_ok')
  if (!check.ok) return { ok: false, error: check.error }
  const bind = bindGroupInternal(club, groupId)
  if (!bind.ok) return bind
  club.status = 'suspended'
  club.readonly = false
  pushSyncEvent(club, 'rebind', `重新绑定 Group「${groupName(groupId)}」，统一先进入已停用`)
  createTemplateMappings(club)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/** 从待重新接入状态重新接入 */
export function reaccessClub(clubId: string, groupId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'suspended', 'reaccess_ok')
  if (!check.ok) return { ok: false, error: check.error }
  const bind = bindGroupInternal(club, groupId)
  if (!bind.ok) return bind
  const leaderGroupId = club.leaderGroupId
  if (leaderGroupId && findGroup(leaderGroupId)) {
    const leaderGroup = findGroup(leaderGroupId)!
    if (leaderGroup.members.length > 0) club.leaderName = memberNames[leaderGroup.members[0]] ?? null
  }
  club.status = 'suspended'
  club.readonly = false
  pushSyncEvent(club, 'reaccess', `重新接入 Group「${groupName(groupId)}」，统一先进入已停用`)
  createTemplateMappings(club)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}

/** 模拟对账检测到 Group 删除/移动/失权（演示：供测试与脚本触发） */
export function triggerGroupLost(clubId: string): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'sync_abnormal_ro', 'group_lost')
  if (!check.ok) return { ok: false, error: check.error }
  club.status = 'sync_abnormal_ro'
  club.readonly = true
  pushSyncEvent(club, 'group_lost', '对账检测到 Group 删除/移动/失权，进入同步异常只读')
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
}
