import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { fileId: 'file-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/services/download', () => ({
  openAuthorizedDownload: () => true,
}))

import { toast } from 'vue-sonner'
import FilePreviewPage from './FilePreviewPage.vue'

const approvedFile = {
  id: 'file-001', name: '简历.pdf', size: 2048, mimeType: 'application/pdf',
  status: 'approved', uploadedAt: '2026-08-01T04:00:00Z', checkedAt: '2026-08-01T04:05:00Z', downloadUrl: '/files/file-001',
}

describe('FilePreviewPage 文件预览', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('已通过检查：展示文件信息与下载按钮', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: approvedFile })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('简历.pdf')
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.text()).toContain('下载文件')
  })

  it('accepted 异步受理：轮询至 completed 后自动展示文件', async () => {
    vi.useFakeTimers()
    mockGet
      .mockResolvedValueOnce({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } })
      .mockResolvedValue({ kind: 'completed', data: approvedFile })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('简历.pdf')

    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('简历.pdf')
    expect(wrapper.text()).toContain('下载文件')
    wrapper.unmount()
  })

  it('检查中：不可下载并提示安全检查中', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { ...approvedFile, status: 'checking', checkedAt: null } })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('文件正在安全检查中')
    expect(wrapper.text()).toContain('文件需通过安全检查后方可下载')
    // 无下载按钮（'下载文件' 是提示文案子串，用按钮断言）
    expect(wrapper.findAll('button').some((b) => b.text().includes('下载'))).toBe(false)
  })

  it('被隔离：提示未通过安全检查', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { ...approvedFile, status: 'quarantined', downloadUrl: null } })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('文件未通过安全检查，已被隔离')
  })

  it('加载失败：错误码映射为页面状态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '不存在' } })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('简历.pdf')
  })

  it('下载成功：请求下载地址并提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: approvedFile })
    mockPost.mockResolvedValue({ kind: 'completed', data: { downloadUrl: '/files/file-001' } })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下载文件'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/files/file-001/download', {})
    expect(toast.success).toHaveBeenCalledWith('已开始下载')
  })

  it('下载失败：展示错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: approvedFile })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(FilePreviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('下载文件'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('下载失败，请稍后重试')
  })
})
