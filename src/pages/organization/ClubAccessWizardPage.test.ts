import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-004' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ClubAccessWizardPage from './ClubAccessWizardPage.vue'

const wizardStubs = {
  ...pageStubs,
  NameSearch: { template: '<input type="text" />' },
}

describe('ClubAccessWizardPage 社团接入向导', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：并行加载 Casdoor Group 与已有社团，进入步骤一', async () => {
    // mockResolvedValueOnce 优先于默认值，按调用顺序设置：groups → clubs
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ id: 'grp-1', name: '摄影协会', path: '/学校学生组织/摄影协会', stableId: 'G-PHOTO', purpose: 'club', boundClubId: null }] },
    })
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ clubId: 'club-004', clubName: '摄影协会', status: 'wizard_pending' }] },
    })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups')
    expect(mockGet).toHaveBeenCalledWith('/admin/clubs')
    // 向导步骤一渲染
    expect(wrapper.text()).toContain('选择社团 Casdoor Group')
    expect(wrapper.text()).toContain('下一步')
    wrapper.unmount()
  })

  it('加载失败：请求已发出且页面可操作（向导步骤照常渲染）', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: wizardStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/groups')
    expect(wrapper.text()).toContain('下一步')
    wrapper.unmount()
  })
})
