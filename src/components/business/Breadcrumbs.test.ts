import { describe, expect, it } from 'vitest'
import { resolveSegmentLabels } from '@/components/business/breadcrumb-labels'

/**
 * 面包屑段名解析：静态段按域词表中文名；上下文歧义段按静态链取语义（如 recruitment 在录取/面试语境不同）；
 * 动态参数段（:id）不展示原始 id，按父级静态链回退为「详情」名；均未命中才回退原文。
 */
describe('面包屑段名解析', () => {
  it('常规静态段返回中文名', () => {
    expect(resolveSegmentLabels('me', ['ongoing'])).toEqual(['进行中'])
    expect(resolveSegmentLabels('org', ['dashboard'])).toEqual(['管理看板'])
    expect(resolveSegmentLabels('admin', ['ops-status'])).toEqual(['运维监控'])
  })

  it('未收录段不崩溃，回退原文', () => {
    expect(resolveSegmentLabels('me', ['unknown-seg'])).toEqual(['unknown-seg'])
  })

  it('me 个人资料下嵌套段有规范命名', () => {
    expect(resolveSegmentLabels('me', ['profile', 'edit'])).toEqual(['个人资料', '编辑资料'])
    expect(resolveSegmentLabels('me', ['profile', 'required'])).toEqual(['个人资料', '补全必填信息'])
    expect(resolveSegmentLabels('me', ['profile', 'sync-conflict'])).toEqual(['个人资料', '同步冲突处理'])
  })

  it('me 通知偏好', () => {
    expect(resolveSegmentLabels('me', ['notifications', 'preferences'])).toEqual(['通知中心', '通知偏好'])
  })

  it('me 面试任务与详情（recruitment/joint 在面试语境为面试而非录取）', () => {
    expect(resolveSegmentLabels('me', ['interviews', 'tasks'])).toEqual(['面试管理', '面试任务'])
    expect(resolveSegmentLabels('me', ['interviews', 'recruitment', 'rinv-001'])).toEqual(['面试管理', '招新面试', '面试详情'])
    expect(resolveSegmentLabels('me', ['interviews', 'joint', 'jnt-001'])).toEqual(['面试管理', '联合面试', '面试详情'])
  })

  it('me 录取邀请详情（recruitment/joint 在录取语境为录取）', () => {
    expect(resolveSegmentLabels('me', ['invitations', 'recruitment', 'rinv-001'])).toEqual(['录取邀请', '招新录取', '邀请详情'])
    expect(resolveSegmentLabels('me', ['invitations', 'joint', 'jinv-001'])).toEqual(['录取邀请', '联合录取', '邀请详情'])
    expect(resolveSegmentLabels('me', ['invitations', 'membership', 'minv-001'])).toEqual(['录取邀请', '入社邀请', '邀请详情'])
  })

  it('org 动态参数段不显示原始 id，按父级静态链取详情名', () => {
    expect(resolveSegmentLabels('org', ['recruitment', 'act-001'])).toEqual(['普通招新', '活动详情'])
    expect(resolveSegmentLabels('org', ['joint', 'jnt-001'])).toEqual(['联合活动', '活动详情'])
    expect(resolveSegmentLabels('org', ['members', 'mem-001'])).toEqual(['成员与组织', '成员详情'])
    expect(resolveSegmentLabels('org', ['forms', 'designer', 'form-001'])).toEqual(['动态表单', '表单设计', '表单详情'])
  })

  it('org 联合活动子页上下文命名（面试/结论/结束）', () => {
    expect(resolveSegmentLabels('org', ['joint', 'jnt-001', 'interview'])).toEqual(['联合活动', '活动详情', '联合面试'])
    expect(resolveSegmentLabels('org', ['joint', 'jnt-001', 'conclusions'])).toEqual(['联合活动', '活动详情', '联合结论'])
    expect(resolveSegmentLabels('org', ['joint', 'jnt-001', 'close'])).toEqual(['联合活动', '活动详情', '结束联合活动'])
  })

  it('org 普通招新子页仍用原有命名', () => {
    expect(resolveSegmentLabels('org', ['recruitment', 'act-001', 'applications'])).toEqual(['普通招新', '活动详情', '报名管理'])
    expect(resolveSegmentLabels('org', ['recruitment', 'act-001', 'interview'])).toEqual(['普通招新', '活动详情', '面试管理'])
    expect(resolveSegmentLabels('org', ['recruitment', 'create'])).toEqual(['普通招新', '创建活动'])
  })

  it('admin 联合活动结束页与表单详情', () => {
    expect(resolveSegmentLabels('admin', ['joint', 'jnt-001', 'close'])).toEqual(['联合活动', '活动详情', '结束联合活动'])
    expect(resolveSegmentLabels('admin', ['forms', 'designer', 'form-001'])).toEqual(['表单管理', '表单设计', '表单详情'])
  })

  it('activity 公开活动详情与报名申请（apply 段规范化）', () => {
    expect(resolveSegmentLabels('activity', ['recruitment', 'act-001'])).toEqual(['招新活动', '活动详情'])
    expect(resolveSegmentLabels('activity', ['recruitment', 'act-001', 'apply'])).toEqual(['招新活动', '活动详情', '报名申请'])
    expect(resolveSegmentLabels('activity', ['joint', 'jnt-001'])).toEqual(['联合活动', '活动详情'])
    expect(resolveSegmentLabels('activity', ['joint', 'jnt-001', 'apply'])).toEqual(['联合活动', '活动详情', '联合报名'])
  })
})
