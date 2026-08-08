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

import { pageStubs } from '@/test-utils/pageStubs'

const commonStubs = pageStubs

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

  it('MRM-009：任务被 GC 后状态接口 404——轮询立刻停止，不形成无主定时器', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })
    // 第二次轮询：任务已被 GC，状态接口返回业务 404
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '导出任务不存在' } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    // 错误分支统一 stopPolling：不再发起状态请求
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockGet).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('MRM-009：状态接口网络错误——轮询停止，不无限重试', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'NET-001', message: '网络错误' } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

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

  async function openCreateConfirm(wrapper: ReturnType<typeof mountPage>) {
    await wrapper.findAll('button').find((b) => b.text().includes('新建导出'))!.trigger('click')
    await nextTick()
    expect(wrapper.find('.hrc').exists()).toBe(true)
  }

  it('创建导出成功：任务插入列表并对已完成任务提示', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValueOnce({
      kind: 'completed',
      data: { id: 'exp-002', type: '成员名单', status: 'completed', createdAt: '2026-08-07T04:00:00Z', completedAt: '2026-08-07T04:00:05Z', expiredAt: null, downloadUrl: '/files/2.xlsx', fileSize: 1024 },
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await openCreateConfirm(wrapper)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/exports', { type: '成员名单' })
    expect(toast.success).toHaveBeenCalledWith('导出已生成完成，可点击下载')
    // 任务插入列表并展示尺寸
    expect(wrapper.text()).toContain('成员名单')
    expect(wrapper.text()).toContain('1.0 KB')
    expect(wrapper.text()).toContain('完成于')
    wrapper.unmount()
  })

  it('MRM-009：复用进行中任务不重复插入列表（后端复用同 id）', async () => {
    vi.useFakeTimers()
    // 列表已有进行中任务 exp-005
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ id: 'exp-005', type: '成员名单', status: 'generating', createdAt: '2026-08-07T04:00:00Z', completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0 }] },
    })
    // 创建返回复用同一任务（同 id）——不应重复插入渲染
    mockPost.mockResolvedValueOnce({
      kind: 'completed',
      data: { id: 'exp-005', type: '成员名单', status: 'generating', createdAt: '2026-08-07T04:00:00Z', completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0 },
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await openCreateConfirm(wrapper)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    await nextTick()

    // 复用任务只在列表渲染一次（'.card' 含安全规则提示卡片，按任务文案过滤计数）
    const rendered = wrapper.findAll('.card').filter((c) => c.text().includes('成员名单'))
    expect(rendered).toHaveLength(1)
    wrapper.unmount()
  })

  it('创建导出失败：弹窗展示错误信息且不插入任务', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [] } })
    mockPost.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '导出服务异常' } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await openCreateConfirm(wrapper)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.hrc').text()).toContain('导出服务异常')
    expect(wrapper.text()).not.toContain('成员名单')
    wrapper.unmount()
  })

  it('下载按钮仅对已完成的导出任务展示', async () => {
    vi.useFakeTimers()
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [generatingTask] } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    // 生成中任务不展示下载按钮
    expect(wrapper.findAll('button').some((b) => b.text().includes('下载'))).toBe(false)
    expect(wrapper.text()).toContain('生成中...')
    wrapper.unmount()
  })

  it('下载已完成任务：请求下载地址并提示开始下载', async () => {
    const completedTask = {
      id: 'exp-003', type: '成员名单', status: 'completed', createdAt: '2026-08-07T04:00:00Z',
      completedAt: '2026-08-07T04:01:00Z', expiredAt: '2026-09-08T04:00:00Z',
      downloadUrl: '/files/3.xlsx', fileSize: 2048,
    }
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [completedTask] } })
    mockPost.mockResolvedValueOnce({ kind: 'completed', data: { downloadUrl: '/files/3.xlsx' } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('下载'))!.trigger('click')
    await flushPromises()
    await nextTick()

    // 下载走高危确认：先填原因，再点确认
    expect(wrapper.findAll('.hrc').length).toBeGreaterThan(0)
    const downloadHrc = wrapper.findAll('.hrc').find((h) => h.text().includes('确认下载'))!
    expect(downloadHrc.exists(), '下载高危确认弹窗').toBe(true)
    const reasonInput = downloadHrc.find('input[placeholder*="下载原因"]')
    expect(reasonInput.exists(), '下载原因输入').toBe(true)
    await reasonInput.setValue('学期末名单归档审计')
    await downloadHrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/exports/exp-003/download', {
      reason: '学期末名单归档审计',
      reauthProof: 'mock-reauth-proof',
    })
    expect(toast.success).toHaveBeenCalledWith('已开始下载')
    wrapper.unmount()
  })

  it('MRM-009：completed 任务 expiredAt 已过——前端拦截下载并提示重新导出', async () => {
    const expiredTask = {
      id: 'exp-005', type: '成员名单', status: 'completed', createdAt: '2026-08-01T04:00:00Z',
      completedAt: '2026-08-01T04:01:00Z', expiredAt: '2026-08-02T04:00:00Z',
      downloadUrl: '/files/5.xlsx', fileSize: 2048,
    }
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [expiredTask] } })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('下载'))!.trigger('click')
    await flushPromises()
    await nextTick()

    // 过期任务不弹出下载确认框，且给出明确提示
    expect(toast.info).toHaveBeenCalledWith('导出链接已过期，请重新导出')
    expect(wrapper.findAll('.hrc').some((h) => h.text().includes('确认下载'))).toBe(false)
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('下载：空原因被拦截', async () => {
    const completedTask = {
      id: 'exp-004', type: '成员名单', status: 'completed', createdAt: '2026-08-07T04:00:00Z',
      completedAt: '2026-08-07T04:01:00Z', expiredAt: '2026-09-08T04:00:00Z',
      downloadUrl: '/files/4.xlsx', fileSize: 2048,
    }
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [completedTask] } })
    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text().includes('下载'))!.trigger('click')
    await flushPromises()
    await nextTick()

    const downloadHrc = wrapper.findAll('.hrc').find((h) => h.text().includes('确认下载'))!
    expect(downloadHrc.exists(), '下载高危确认弹窗').toBe(true)
    await downloadHrc.find('.hrc-confirm').trigger('click')
    await flushPromises()
    await nextTick()

    expect(downloadHrc.text()).toContain('请填写下载原因')
    expect(mockPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
