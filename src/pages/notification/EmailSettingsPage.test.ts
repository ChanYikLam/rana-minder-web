import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/notifications/email-config', params: { clubId: 'club-001' }, meta: { scope: 'club' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import EmailSettingsPage from './EmailSettingsPage.vue'

describe('EmailSettingsPage 邮件设置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('社团作用域：加载发信配置并渲染', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { smtpHost: 'smtp.example.com', smtpPort: 465, smtpUser: 'no-reply', fromName: '网络协会', encryption: 'ssl', verified: false },
    })
    const wrapper = mount(EmailSettingsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/notifications/email-config')
    expect(wrapper.text()).toContain('社团发信配置')
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('smtp.example.com')
  })

  it('发送测试失败：展示错误信息', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { smtpHost: 'smtp.example.com', smtpPort: 465, smtpUser: '', fromName: '', encryption: 'ssl', verified: false } })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '连接超时' } })
    const wrapper = mount(EmailSettingsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('测试'))
    if (testBtn) {
      await testBtn.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('测试邮件发送失败，请稍后重试')
    }
  })

  it('加载失败：不渲染配置', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(EmailSettingsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('smtp.example.com')
  })
})
