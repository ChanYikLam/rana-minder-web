import { describe, expect, it } from 'vitest'
import { buildClubGroups, ADMIN_NAV } from './sideNav'

const ALLOW = () => true
const DENY = () => false

describe('buildClubGroups 权限过滤导航树', () => {
  it('无任何权限：返回空导航', () => {
    expect(buildClubGroups('c1', DENY)).toEqual([])
  })

  it('全权限：全部 9 组保留，路径基于 clubId 前缀', () => {
    const groups = buildClubGroups('club-001', ALLOW)

    expect(groups.map((g) => g.label)).toEqual([
      '工作台', '普通招新', '联合活动', '成员与组织', '动态表单', '统计与导出', '通知配置', '纠错与审计', '社团配置',
    ])
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.path.startsWith('/org/club-001/')).toBe(true)
      }
    }
  })

  it('权限过滤：组按权限裁剪，项独立权限不满足时剔除', () => {
    const can = (p?: string, permissionAny?: string[]) =>
      p === 'club:dashboard:view' || (permissionAny?.includes('club:interview:view') ?? false)

    const groups = buildClubGroups('c1', can)

    // 工作台：仅保留管理看板，批量操作被过滤
    const dashboard = groups.find((g) => g.label === '工作台')!
    expect(dashboard.items.map((i) => i.path)).toEqual(['/org/c1/dashboard'])

    // 普通招新：组级 permissionAny 任一命中保留，但"创建活动"需独立权限被过滤
    const recruit = groups.find((g) => g.label === '普通招新')!
    expect(recruit.items.map((i) => i.path)).toEqual(['/org/c1/recruitment'])
  })

  it('权限继承：item 未声明权限时继承组级权限', () => {
    const can = (p?: string) => p === 'club:joint:manage'

    const groups = buildClubGroups('c1', can)

    const joint = groups.find((g) => g.label === '联合活动')!
    expect(joint.items.map((i) => i.path)).toEqual(['/org/c1/joint', '/org/c1/joint/create'])
  })

  it('组级权限不满足且无 permissionAny：整组剔除', () => {
    const can = (p?: string) => p === 'club:config:manage'

    const groups = buildClubGroups('c1', can)

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('社团配置')
  })
})

describe('ADMIN_NAV 平台导航结构', () => {
  it('所有分组非空且路径都在 /admin 下', () => {
    expect(ADMIN_NAV.length).toBeGreaterThan(5)
    for (const group of ADMIN_NAV) {
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.path.startsWith('/admin/')).toBe(true)
      }
    }
  })
})
