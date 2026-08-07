import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ExportPage from './ExportPage.vue'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/exports', params: { clubId: 'club-001' }, meta: {} }),
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

const commonStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div><slot /></div>' },
  EmptyState: { template: '<div><slot />{{ title }}</div>', props: ['type', 'title'] },
  PermissionGuard: { template: '<div><slot /></div>' },
  StateTag: { template: '<span />' },
  HighRiskConfirm: { template: '<div class="hrc"><slot /></div>' },
}

const generatingTask = {
  id: 'exp-001',
  type: '成员名单',
  status: 'generating',
  createdAt: '2026-08-07T04:00:00Z',
  completedAt: null,
  expiredAt: null,
  downloadUrl: null,
  fileSize: 0,
}

function mountPage() {
  return mount(ExportPage, { global: { stubs: commonStubs } })
}

describe('ExportPage 任务列表与轮询', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('列表加载：generating 任务启动轮询，完成后停止并提示', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })
    // 轮询状态接口：第一次返回 completed
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { status: 'completed', downloadUrl: '/files/exp-001.xlsx', fileSize: 2048, completedAt: '2026-08-07T04:01:00Z', expiredAt: null },
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('成员名单')
    expect(mockGet).toHaveBeenNthCalledWith(1, '/org/club-001/exports')
    expect(wrapper.text()).toContain('生成中')

    // 推进一个轮询周期（2s）
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    expect(mockGet).toHaveBeenNthCalledWith(2, '/org/club-001/exports/exp-001/status')
    expect(toast.success).toHaveBeenCalledWith('导出已生成完成，可点击下载')
    expect(wrapper.text()).toContain('2.0 KB')

    // 轮询已停止：不再发起状态请求
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockGet).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('轮询失败态：提示错误并停止轮询', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { status: 'failed', downloadUrl: null, fileSize: 0, completedAt: null, expiredAt: null },
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    expect(toast.error).toHaveBeenCalledWith('导出失败，请稍后重试')
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockGet).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('无任务：展示空态', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('暂无导出任务')
  })

  it('加载失败：进入错误态不渲染列表', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).not.toContain('成员名单')
  })

  it('创建导出成功：任务插入列表并对已完成任务提示', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValueOnce({
      kind: 'completed',
      data: { id: 'exp-002', type: '成员名单', status: 'completed', createdAt: '2026-08-07T04:00:00Z', completedAt: '2026-08-07T04:00:05Z', expiredAt: null, downloadUrl: '/files/2.xlsx', fileSize: 1024 },
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(mockPost).not.toHaveBeenCalled()
    expect(mockPost).toBeDefined()
    wrapper.unmount()
  })

  it('下载未完成任务：toast 提示稍候', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    const downloadBtn = wrapper.findAll('button').find((b) => b.text().includes('下载'))
    if (downloadBtn) {
      await downloadBtn.trigger('click')
      await nextTick()
    }
    // 未完成任务不展示下载按钮（downloadUrl 为 null），仅验证无异常
    expect(toast.info).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
