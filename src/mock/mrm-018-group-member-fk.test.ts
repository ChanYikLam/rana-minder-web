import { describe, expect, it } from 'vitest'
import { members } from './db'
import { listGroups, getGroupDetail, listClubAccesses } from './db-organization'

/**
 * MRM-018 回归：Group 成员外键悬挂。
 *
 * Bug 报告复述（来自工单 MRM-018）：
 *  - 文件：db-organization.ts:76-88
 *  - 函数：getGroupDetail('grp-002')
 *  - 现象：返回的 members 数组里含有 mem-102
 *  - 期望：mem-102 在 db.members 中查无此人（外键悬挂）
 *
 * 历史核查：db-organization.ts 曾在 MRM-008（dcd3d76）被抽成 db-members
 * 共享模块（members 数组下沉），但 Group 树与 memberNames 保留在
 * db-organization.ts。在 dev 最新态下 getGroupDetail('grp-002') 仍返回
 * ['mem-101','mem-102']，而 mem-102 不在 db-members.ts 中 —— 外键悬挂
 * 真实存在，已于本分支修复（grp-002.members 移除 mem-102，memberNames
 * 移除该悬挂条目）。
 *
 * 本测试承担两层职责：
 *  ① 守门：断言「mem-102 不是成员」且「任一已启用社团的 Group 引用的
 *     mem-* 成员必须全部存在于 db.members」。一旦未来有人把悬挂记录
 *     粘回来（db.ts / db-recruitment.ts / db-organization.ts / 任何新
 *     引入的 group 数据），CI 即失败。
 *  ② 通用扫描：对 db / db-organization（Group 树）全部已知"含成员 ID
 *     引用"的字段做一次「引用必须存在于 db.members」的不变量校验。
 *     未来引入新的 Group / 部门子组 / 班级等结构，只需要在 COLLECTORS
 *     里追加收集器即可。
 */

/** 收集器：每个收集器返回若干形如「来源:ID」的引用字符串。 */
type Reference = { source: string; id: string; hint?: string }
type Collector = () => Reference[] | Iterable<Reference>

/**
 * db.ts：member 自身 id 集合（唯一合法来源）。
 */
const collectFromDb = (): Reference[] => {
  const out: Reference[] = []
  for (const m of members) {
    out.push({ source: `db.members[${m.id}]`, id: m.id })
  }
  return out
}

/**
 * db-organization.ts：Group 树成员引用。
 *  - 仅扫描「已启用社团」绑定的 Group：未启用（wizard_pending / suspended /
 *    sync_abnormal_ro）的社团其 Group 成员是待接入的占位/演示数据，
 *    不要求在成员表存在（与既有 importMembers 演示语义一致）。
 *  - getGroupDetail 返回每个成员 id + 展示名，直接作为引用来源。
 */
const collectFromOrgGroups = (): Reference[] => {
  const enabledClubIds = new Set(
    listClubAccesses().filter((c) => c.status === 'enabled').map((c) => c.clubId),
  )
  const out: Reference[] = []
  for (const g of listGroups()) {
    if (!g.boundClubId || !enabledClubIds.has(g.boundClubId)) continue
    const detail = getGroupDetail(g.id)
    for (const m of detail?.members ?? []) {
      out.push({ source: `grp[${g.id}].members`, id: m.id, hint: m.name })
    }
  }
  return out
}

const COLLECTORS: Array<{ name: string; collect: Collector }> = [
  { name: 'db', collect: collectFromDb },
  { name: 'db-organization', collect: collectFromOrgGroups },
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

  it('整库扫描：已启用社团 Group 引用的 mem-* 必须全部存在于 db.members', () => {
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

  it('bug 报告场景：getGroupDetail("grp-002") 的成员全部在 db.members 中查得到', () => {
    const set = membersIdSet()
    const detail = getGroupDetail('grp-002')
    expect(detail, 'grp-002 应存在于 Group 树').toBeTruthy()
    for (const m of detail!.members) {
      expect(set.has(m.id), `grp-002 引用 ${m.id}（${m.name}）应在 db.members 中查得到`).toBe(true)
    }
  })
})
