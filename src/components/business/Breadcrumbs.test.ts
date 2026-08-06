import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import Breadcrumbs from '@/components/business/Breadcrumbs.vue'
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

/** 组件级链接用例：路径累积必须保留 org 域 clubId（真实路由 /org/:clubId/...），否则链接失效渲染为纯文本 */
describe('面包屑组件链接', () => {
  const routes = [
    { path: '/me', name: 'mock-me-root', component: { template: '<div />' } },
    { path: '/me/interviews/recruitment/:rid', name: 'mock-me-interview', component: { template: '<div />' } },
    { path: '/explore', name: 'mock-explore-root', component: { template: '<div />' } },
    { path: '/org', name: 'mock-org-root', component: { template: '<div />' } },
    { path: '/org/:clubId', name: 'mock-org-club', component: { template: '<div />' } },
    { path: '/org/:clubId/recruitment', name: 'mock-org-recruitment', component: { template: '<div />' } },
    { path: '/org/:clubId/recruitment/:activityId', name: 'mock-org-recruitment-detail', component: { template: '<div />' } },
    { path: '/org/:clubId/recruitment/:activityId/applications', name: 'mock-org-applications', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', name: 'P-GEN-01', component: { template: '<div />' } },
  ]

  async function mountAt(path: string) {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const pinia = createPinia()
    router.push(path)
    await router.isReady()
    return mount(Breadcrumbs, { global: { plugins: [router, pinia] } })
  }

  it('org 域子级面包屑保留 clubId 累积为可点击链接（P1 回归）', async () => {
    const wrapper = await mountAt('/org/club-001/recruitment')
    const links = wrapper.findAll('a')
    expect(links.map((a) => [a.text(), a.attributes('href')])).toContainEqual(['普通招新', '/org/club-001/recruitment'])
  })

  it('org 域多级路径逐级累积 clubId 前缀', async () => {
    const wrapper = await mountAt('/org/club-001/recruitment/act-001/applications')
    const links = wrapper.findAll('a')
    expect(links.map((a) => a.attributes('href'))).toEqual([
      '/org',
      '/org/club-001/recruitment',
      '/org/club-001/recruitment/act-001',
      '/org/club-001/recruitment/act-001/applications',
    ])
  })

  it('org 域 clubId 不渲染为面包屑节点', async () => {
    const wrapper = await mountAt('/org/club-001/recruitment')
    expect(wrapper.text()).not.toContain('club-001')
  })

  it('非 org 域路径不受影响（me 详情链接有效）', async () => {
    const wrapper = await mountAt('/me/interviews/recruitment/rinv-001')
    const links = wrapper.findAll('a')
    expect(links.map((a) => [a.text(), a.attributes('href')])).toContainEqual(['面试详情', '/me/interviews/recruitment/rinv-001'])
  })
})
