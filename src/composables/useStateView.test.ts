import { describe, expect, it, vi } from 'vitest'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { useStateView } from './useStateView'

describe('useStateView 角色词表与导航', () => {
  it('roleLabel 覆盖全部 7 种角色', () => {
    const { roleLabel } = useStateView()
    expect(roleLabel('super_admin')).toBe('超级管理员')
    expect(roleLabel('club_leader')).toBe('社团负责人')
    expect(roleLabel('hr')).toBe('人事')
    expect(roleLabel('department_leader')).toBe('部门负责人')
    expect(roleLabel('interviewer')).toBe('面试官')
    expect(roleLabel('member')).toBe('普通成员')
    expect(roleLabel('applicant')).toBe('申请人')
  })

  it('roleColor 覆盖全部角色，未知角色回退 neutral', () => {
    const { roleColor } = useStateView()
    expect(roleColor('super_admin')).toBe('danger')
    expect(roleColor('club_leader')).toBe('primary')
    expect(roleColor('interviewer')).toBe('warning')
    expect(roleColor('member')).toBe('neutral')
    // 未知角色（类型外的运行时值）回退
    expect(roleColor('ghost' as never)).toBe('neutral')
  })

  it('navigate 触发 router.push', () => {
    const { navigate } = useStateView()
    navigate('/me/ongoing')
    expect(pushMock).toHaveBeenCalledWith('/me/ongoing')
  })
})
