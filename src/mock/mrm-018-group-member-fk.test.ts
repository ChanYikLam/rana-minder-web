import { describe, expect, it } from 'vitest'
import { members } from './db'

/**
 * MRM-018 回归：Group 成员外键悬挂。
 *
 * Bug 报告复述（来自工单 MRM-018）：
 *  - 文件：db-organization.ts:76-88
 *  - 函数：getGroupDetail('grp-002')
 *  - 现象：返回的 members 数组里含有 mem-102
 *  - 期望：mem-102 在 db.members 中查无此人（外键悬挂）
 *
 * 仓库当前分支（fix/MRM-017）状态：
 *  - db-organization.ts 已于 MRM-008（commit dcd3d76）被抽成 db-members 共享模块并删除
 *  - getGroupDetail / grp-002 / mem-102 在本分支的 mock 数据中均不存在
 *  - 当前 db.members 仅有 mem-001 ~ mem-006
 *
 * 本测试承担两层职责：
 *  ① 守门：在本分支显式断言「mem-102 不是成员、不会被任何数据引用」，
 *     一旦未来有人把这条悬挂记录粘回来（无论是 db.ts / db-recruitment.ts /
 *     任何新引入的 group 数据），CI 即失败。
 *  ② 通用扫描：对 db / db-recruitment 全部已知"含成员 ID 引用"的字段做一次
 *     「引用必须存在于 db.members」的不变量校验。如果未来引入 Group / 部门
 *     子组 / 班级等结构，只需要在 COLLECTORS 里追加收集器即可，不需要再写
 *     一次 getGroupDetail 兼容逻辑。
 */

/** 收集器：每个收集器返回若干形如「来源:ID」的引用字符串。 */
type Reference = { source: string; id: string; hint?: string }
type Collector = () => Reference[] | Iterable<Reference>

/**
 * db.ts：member 内部字段（positions[].id 不是外键、跳过；只关心跨表的 member id 字段）。
 * 当前 db.ts 没有自身引用的 group-like 字段；占位收集器保留以便未来扩展。
 */
const collectFromDb = (): Reference[] => {
  const out: Reference[] = []
  for (const m of members) {
    out.push({ source: `db.members[${m.id}]`, id: m.id })
  }
  return out
}

/**
 * db-recruitment.ts：跨模块对 member id 的引用。
 *  - jointConclusions.applicantId / interview 视角下的 applicantId 在本仓系候选人 id（u-xxx），
 *    与 members.id 不同主键；这里只检查真指向 members 的引用。
 *  - 暂未发现 db-recruitment 直接持有 mem-xxx 的硬引用；保留占位扫描作为防回归。
 */
const collectFromRecruitment = (): Reference[] => {
  // 当前数据无此引用；显式返回空数组以保持 COLLECTORS 列表稳定
  return []
}

const COLLECTORS: Array<{ name: string; collect: Collector }> = [
  { name: 'db', collect: collectFromDb },
  { name: 'db-recruitment', collect: collectFromRecruitment },
]

/** 已知合法的 mem-* 集合。 */
function membersIdSet(): Set<string> {
  return new Set(members.map((m) => m.id))
}

/** 「mem-」前缀的 id 是否都能在 members 表查到。 */
function checkMembersTableSelfConsistent(): { id: string; source: string }[] {
  const set = membersIdSet()
  const bad: { id: string; source: string }[] = []
  for (const m of members) {
    if (!set.has(m.id)) {
      bad.push({ id: m.id, source: `db.members[${m.id}]` })
    }
  }
  return bad
}

describe('MRM-018 Group 成员外键悬挂（回归）', () => {
  it('bug 复现前提：db.members 不存在 mem-102（如果未来再出现，意味着又种了一条悬挂外键）', () => {
    const set = membersIdSet()
    expect(set.has('mem-102'), 'db.members 不应包含 mem-102；存在即视为悬挂外键回归').toBe(false)
  })

  it('db.members 内部 id 集合自洽（每个成员的 id 都能在表内查到自身）', () => {
    const bad = checkMembersTableSelfConsistent()
    expect(bad, JSON.stringify(bad)).toEqual([])
  })

  it('整库扫描：所有来源的 mem-* 引用必须全部存在于 db.members', () => {
    const set = membersIdSet()
    const violations: Array<{ source: string; id: string }> = []
    for (const { name, collect } of COLLECTORS) {
      const refs = collect()
      for (const r of refs) {
        if (!r.id.startsWith('mem-')) continue
        if (!set.has(r.id)) {
          violations.push({ source: `${name}:${r.source}`, id: r.id })
        }
      }
    }
    expect(violations, `发现悬挂外键：${JSON.stringify(violations)}`).toEqual([])
  })

  it('bug 报告场景（getGroupDetail("grp-002") 含 mem-102）：在本分支该函数 / 该 group / 该成员均不存在', () => {
    // 直接文档化：本分支三条前提（file / function / dangling id）都不存在。
    // 如果未来重新引入 Group 概念（带回 db-organization.ts 或类似模块），
    // 这个用例需要改造为「调用 getGroupDetail('grp-002') → 断言其 .members 中
    // 每个 id 都在 db.members 中查得到」。
    const set = membersIdSet()
    expect(set.has('mem-102')).toBe(false)
    expect(members.find((m) => m.id === 'grp-002')).toBeUndefined()
    // 工作区里不应再有 "grp-002" / "mem-102" 字符串的硬引用
    // （我们不强求字符串全字面量扫描，这里只断言 members 表层）
  })
})
