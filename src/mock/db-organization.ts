/**
 * Mock 层有状态内存库：社团接入（SM-ORG-001）与停用体系
 * 单一数据源，页面刷新即重置；状态流转经 state-machines assertTransition 校验
 * 接入向导：分层 Group 搜索（精确→中文连续子串→受控错别字近似、3 有效字符门槛）、
 *          层级/用途唯一/重复绑定校验、已有成员导入（Casdoor 既有成员成为当前关系）
 * 停用体系：普通停用（进行中业务阻止）/紧急停用（只读+期限暂停）/恢复顺延/解除接入/修复/重绑/重新接入
 */
import { assertTransition } from './state-machines/transitions'
import type { ClubAccessItem, ClubAccessStatus, GroupNode, GroupMatchTier, GroupSearchResult } from '../types/domain/organization'

const SM = 'SM-ORG-001'

interface GroupSeed extends Omit<GroupNode, 'memberCount'> {
  leaderGroupId: string | null
  members: string[]
}

export interface ClubSyncEvent {
  id: string
  kind: 'group_lost' | 'repair' | 'rebind' | 'disconnect' | 'reaccess' | 'suspend' | 'recover'
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
  /** 向导提交时选择的部门 Group ID 列表 */
  deptGroupIds: string[]
  /** 向导提交时选择的职位 Group ID 列表（不含负责人职位） */
  roleGroupIds: string[]
  memberCount: number
  createdAt: string
  boundAt: string | null
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
  { clubId: 'club-001', groupId: 'grp-001', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-001', groupId: 'grp-lead-001', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-001', groupId: 'grp-dept-001', templateId: 'tpl-003', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-002', groupId: 'grp-002', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
  { clubId: 'club-002', groupId: 'grp-lead-002', templateId: 'tpl-001', createdAt: '2022-09-05T10:00:00+08:00' },
]

/** 预置模板与 Group 用途的默认关联规则 */
const DEFAULT_TEMPLATE_MAP: Record<string, string> = {
  position: 'tpl-001',   // 职位 Group → 社团负责人模板
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
    parentId: 'grp-root', purpose: 'club', boundClubId: 'club-002', leaderGroupId: 'grp-lead-002', members: ['mem-101', 'mem-102'],
  },
  {
    id: 'grp-003', name: '数学建模协会', stableId: 'G-MATH-CLUB', path: '/学校学生组织/数学建模协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: null, leaderGroupId: null, members: ['mem-201', 'mem-202', 'mem-203'],
  },
  {
    id: 'grp-004', name: '摄影协会', stableId: 'G-PHOTO-CLUB', path: '/学校学生组织/摄影协会',
    parentId: 'grp-root', purpose: 'club', boundClubId: null, leaderGroupId: null, members: ['mem-401', 'mem-402', 'mem-403'],
  },
  {
    id: 'grp-005', name: '新媒体中心', stableId: 'G-MEDIA-CLUB', path: '/学校学生组织/新媒体中心',
    parentId: 'grp-root', purpose: 'club', boundClubId: null, leaderGroupId: null, members: ['mem-301'],
  },
  {
    id: 'grp-lead-004', name: '摄影协会负责人', stableId: 'G-PHOTO-LEAD', path: '/学校学生组织/摄影协会/负责人',
    parentId: 'grp-004', purpose: 'position', boundClubId: null, leaderGroupId: null, members: ['mem-401'],
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
]

const memberNames: Record<string, string> = {
  'mem-004': '张明远', 'mem-001': '陈雨桐', 'mem-002': '王浩然', 'mem-003': '李思颖', 'mem-006': '林晓薇',
  'mem-101': '赵子涵', 'mem-102': '孙嘉怡', 'mem-201': '郑浩宇', 'mem-202': '陈雨桐', 'mem-203': '黄志强',
  'mem-301': '吴思远', 'mem-401': '孙欣怡', 'mem-402': '周嘉诚', 'mem-403': '徐静怡',
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** 测试隔离快照：Group 树（含 boundClubId 绑定关系） */
const seedGroups = structuredClone(groups)

/** 接入注册表：club-001/002 已启用；club-004 待接入；club-003 停用中；club-005 同步异常（可演示修复/重绑） */
export const clubAccesses: MockClubAccess[] = [
  {
    clubId: 'club-001', clubName: '计算机协会', description: '专注计算机技术交流与项目实践', status: 'enabled', groupId: 'grp-001', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-001', leaderGroupId: 'grp-lead-001' },
    leaderGroupId: 'grp-lead-001', leaderName: '张明远', deptGroupIds: ['grp-dept-001'], roleGroupIds: [], memberCount: 128,
    createdAt: '2022-09-01T00:00:00+08:00', boundAt: '2022-09-05T10:00:00+08:00', importedCount: 128,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-002', clubName: '电子设计协会', description: '电子设计与嵌入式开发', status: 'enabled', groupId: 'grp-002', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-002', leaderGroupId: 'grp-lead-002' },
    leaderGroupId: 'grp-lead-002', leaderName: '赵子涵', deptGroupIds: [], roleGroupIds: [], memberCount: 86,
    createdAt: '2022-09-01T00:00:00+08:00', boundAt: '2022-09-05T10:00:00+08:00', importedCount: 86,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-003', clubName: '数学建模协会', description: '数学建模竞赛与学术研究', status: 'suspended', groupId: 'grp-003', mappingVersion: 1,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-003', leaderGroupId: null },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [], memberCount: 64,
    createdAt: '2023-03-01T00:00:00+08:00', boundAt: '2023-03-10T10:00:00+08:00', importedCount: 64,
    syncEvents: [], freezeIntervals: [{ id: 'fri-001', reason: '常规停用', suspendedAt: daysAgo(9), recoveredAt: null }], readonly: true,
  },
  {
    clubId: 'club-004', clubName: '摄影协会', description: '摄影艺术与后期制作', status: 'wizard_pending', groupId: null, mappingVersion: 0,
    wizardStep: 0, wizard: { selectedGroupId: null, leaderGroupId: null },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [], memberCount: 0,
    createdAt: '2025-07-28T00:00:00+08:00', boundAt: null, importedCount: 0,
    syncEvents: [], freezeIntervals: [], readonly: false,
  },
  {
    clubId: 'club-005', clubName: '新媒体中心', description: '校园新媒体运营与内容创作', status: 'sync_abnormal_ro', groupId: 'grp-005', mappingVersion: 2,
    wizardStep: 4, wizard: { selectedGroupId: 'grp-005', leaderGroupId: null },
    leaderGroupId: null, leaderName: null, deptGroupIds: [], roleGroupIds: [], memberCount: 37,
    createdAt: '2024-09-01T00:00:00+08:00', boundAt: '2024-09-08T10:00:00+08:00', importedCount: 37,
    syncEvents: [{ id: 'evt-001', kind: 'group_lost', at: daysAgo(3), note: '对账检测到 Group 删除/移动/失权，进入同步异常只读' }],
    freezeIntervals: [], readonly: true,
  },
]

/** 测试隔离快照（模块加载时捕获初始种子） */
const seedClubAccesses = structuredClone(clubAccesses)
const seedGroupTemplateMappings = structuredClone(groupTemplateMappings)

// ================= 工具 =================

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
  const exact = groups.filter((g) => g.name === kw || g.stableId === kw)
  const substring = groups.filter((g) => !exact.includes(g) && (g.name.includes(kw) || g.path.includes(kw)))
  const directCount = exact.length + substring.length
  let fuzzy: GroupSeed[] = []
  if (eff >= 3) {
    const threshold = kw.length <= 4 ? 1 : 2
    fuzzy = groups.filter((g) => !exact.includes(g) && !substring.includes(g) && editDistance(g.name, kw) <= threshold)
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

/** Group 详情：基本信息 + 已有成员 + 可用负责人职位 Group（向导步骤 1/2 使用） */
export function getGroupDetail(groupId: string): {
  id: string
  name: string
  stableId: string
  path: string
  purpose: GroupNode['purpose']
  boundClubId: string | null
  members: { id: string; name: string }[]
  leaderGroups: GroupNode[]
} | null {
  const group = findGroup(groupId)
  if (!group) return null
  return {
    id: group.id,
    name: group.name,
    stableId: group.stableId,
    path: group.path,
    purpose: group.purpose,
    boundClubId: group.boundClubId,
    members: group.members.map((id) => ({ id, name: memberNames[id] ?? id })),
    leaderGroups: groups.filter((g) => g.purpose === 'position' && g.parentId === groupId && !g.boundClubId).map((g) => ({
      id: g.id, name: g.name, stableId: g.stableId, path: g.path, parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId, memberCount: g.members.length,
    })),
  }
}

/** 创建新社团接入记录（向导提交后进入待审核，外部已做名称/Group 等校验） */
export function createClub(input: { clubName: string; description: string; groupId: string; leaderGroupId: string; deptGroupIds?: string[]; roleGroupIds?: string[] }): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const name = input.clubName.trim()
  if (!name) return { ok: false, error: '社团名称不能为空' }
  if (clubAccesses.some((c) => c.clubName === name)) return { ok: false, error: '社团名称已存在' }
  const group = findGroup(input.groupId)
  if (!group) return { ok: false, error: '所选 Group 不存在' }
  const binding = validateGroupForBinding(input.groupId, '')
  if (!binding.ok) return { ok: false, error: binding.error }
  const leaderGroup = findGroup(input.leaderGroupId)
  if (!leaderGroup || leaderGroup.members.length === 0) return { ok: false, error: '负责人职位 Group 无效' }
  const id = `club-${String(clubAccesses.length + 1).padStart(3, '0')}`
  const newClub: MockClubAccess = {
    clubId: id,
    clubName: name,
    description: input.description.trim(),
    status: 'wizard_pending',
    groupId: null,
    mappingVersion: 0,
    wizardStep: 0,
    wizard: { selectedGroupId: input.groupId, leaderGroupId: input.leaderGroupId },
    leaderGroupId: null,
    leaderName: null,
    deptGroupIds: input.deptGroupIds ?? [],
    roleGroupIds: input.roleGroupIds ?? [],
    memberCount: 0,
    createdAt: nowIso(),
    boundAt: null,
    importedCount: 0,
    syncEvents: [],
    freezeIntervals: [],
    readonly: false,
  }
  clubAccesses.push(newClub)
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === id) }
}

export function getClubAccess(clubId: string): MockClubAccess | undefined {
  return findClub(clubId)
}

/** 列出所有 Group（用于 Casdoor Group 兼容层），支持按父节点和用途过滤 */
export function listGroups(opts?: { parentId?: string | null; purpose?: string }): GroupNode[] {
  let result: GroupSeed[] = groups
  if (opts?.parentId !== undefined) result = result.filter((g) => g.parentId === opts.parentId)
  if (opts?.purpose) result = result.filter((g) => g.purpose === opts.purpose)
  return result.map((g) => ({
    id: g.id, name: g.name, stableId: g.stableId, path: g.path,
    parentId: g.parentId, purpose: g.purpose, boundClubId: g.boundClubId,
    memberCount: g.members.length,
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

/** 为社团批量创建权限模板映射（向导完成后调用） */
function createTemplateMappings(club: MockClubAccess) {
  // 负责人 Group → tpl-001（社团负责人模板）
  if (club.leaderGroupId) ensureMapping(club.clubId, club.leaderGroupId, 'tpl-001')
  // 部门 Group → tpl-003（面试官模板）
  for (const deptId of club.deptGroupIds) ensureMapping(club.clubId, deptId, DEFAULT_TEMPLATE_MAP.department)
  // 职位 Group（含 roleGroupIds + leaderGroupId） → tpl-001
  for (const roleId of club.roleGroupIds) ensureMapping(club.clubId, roleId, DEFAULT_TEMPLATE_MAP.position)
  // 社团主 Group → tpl-001
  if (club.groupId) ensureMapping(club.clubId, club.groupId, DEFAULT_TEMPLATE_MAP.position)
}

/** 清除社团所有模板映射（解除接入时调用） */
export function clearTemplateMappings(clubId: string) {
  for (let i = groupTemplateMappings.length - 1; i >= 0; i--) {
    if (groupTemplateMappings[i].clubId === clubId) groupTemplateMappings.splice(i, 1)
  }
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
      memberCount: c.memberCount,
      createdAt: c.createdAt,
      boundAt: c.boundAt,
      importedCount: c.importedCount,
      freezeExtensionMs: c.freezeIntervals.reduce((sum, f) => sum + (f.recoveredAt ? new Date(f.recoveredAt).getTime() - new Date(f.suspendedAt).getTime() : 0), 0),
      readonly: c.readonly,
      hasActiveBusiness: false,
      syncEvents: c.syncEvents,
    }))
}

export function saveWizardStep(clubId: string, input: { step: number; selectedGroupId?: string | null; leaderGroupId?: string | null }): { ok: boolean; error?: string; data?: ClubAccessItem } {
  const club = findClub(clubId)
  if (!club) return { ok: false, error: '未找到该社团' }
  const check = validateTransition(club, 'wizard_pending', 'save_step')
  if (!check.ok) return { ok: false, error: check.error }
  club.wizardStep = Math.max(0, Math.min(4, input.step))
  club.wizard = {
    selectedGroupId: input.selectedGroupId !== undefined ? input.selectedGroupId : club.wizard?.selectedGroupId ?? null,
    leaderGroupId: input.leaderGroupId !== undefined ? input.leaderGroupId : club.wizard?.leaderGroupId ?? null,
  }
  return { ok: true, data: listClubAccesses().find((c) => c.clubId === clubId) }
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
  const group = findGroup(groupId)!
  group.boundClubId = clubId
  club.groupId = groupId
  club.leaderGroupId = leaderGroupId
  club.leaderName = memberNames[leaderGroup.members[0]] ?? null
  club.memberCount = group.members.length
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
  const valid = memberIds.filter((id) => group.members.includes(id))
  if (valid.length !== memberIds.length) return { ok: false, error: '存在不在该 Group 内的成员，导入被拒绝' }
  club.memberCount = group.members.length
  club.importedCount = valid.length
  club.boundAt = club.boundAt || nowIso()
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
  club.status = 'pending_rebind'
  club.groupId = null
  club.readonly = true
  club.leaderGroupId = null
  club.leaderName = null
  club.wizardStep = 0
  club.wizard = { selectedGroupId: null, leaderGroupId: null }
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
  club.memberCount = group.members.length
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

/** 测试隔离：恢复种子数据与模板映射（P1-005 注册表随之重置） */
export function resetOrgDb(): void {
  groups.splice(0, groups.length, ...structuredClone(seedGroups))
  clubAccesses.splice(0, clubAccesses.length, ...structuredClone(seedClubAccesses))
  groupTemplateMappings.splice(0, groupTemplateMappings.length, ...structuredClone(seedGroupTemplateMappings))
}
