import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockToastError, mockToastSuccess, mockToastInfo, mockUseRoute } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastInfo: vi.fn(),
  mockUseRoute: vi.fn(() => ({ params: { clubId: 'club-001', activityId: 'act-1' }, query: {} })),
}))
vi.mock('vue-router', () => ({
  useRoute: () => mockUseRoute(),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a), info: (...a: unknown[]) => mockToastInfo(...a) },
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ReviewPage from './ReviewPage.vue'

const review = {
  id: 'app-1', applicantId: 'u-1', applicantName: '张三', departmentName: '技术部',
  status: 'in_progress', rating: null, comment: null, concludedAt: null, concludedBy: null,
  reviewId: 'rev-1', roundName: '一轮', interviewAt: '2026-08-10T04:00:00Z',
  myRating: null, myComment: null, myReviewVersion: null, peerViewLocked: false, reviews: [],
}

/** 申请详情响应：含 answers（file 字段含 FileMeta） */
const applicationDetail = {
  answers: {
    f1: '我叫张三',
    f4: [{ id: 'file-abc', name: '作品集.pdf', size: 1024, mimeType: 'application/pdf', status: 'approved', uploadedAt: '', checkedAt: null, downloadUrl: null }],
  },
  preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
  submittedAt: '2026-08-01T10:00:00Z',
}

/** 按 URL 路由 mock get（ReviewPage 并行发起多个 get） */
function setupGetRouter(overrides: { reviews?: unknown; application?: unknown; rejectedApplication?: boolean } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.endsWith('/recruitment/act-1')) {
      return Promise.resolve({ kind: 'completed', data: { formId: 'form-001' } })
    }
    if (url.endsWith('/forms/form-001')) {
      return Promise.resolve({
        kind: 'completed',
        data: {
          versions: [{
            fields: [
              { id: 'f1', type: 'text', label: '自我介绍', required: true, permission: 'read_write', options: null, description: null },
              { id: 'f4', type: 'file', label: '作品附件', required: false, permission: 'read_write', options: null, description: null },
            ],
          }],
        },
      })
    }
    if (url.endsWith('/reviews')) {
      return Promise.resolve(overrides.reviews ?? { kind: 'completed', data: { items: [review] } })
    }
    if (url.includes('/applications/')) {
      if (overrides.rejectedApplication) return Promise.resolve({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
      return Promise.resolve(overrides.application ?? { kind: 'completed', data: applicationDetail })
    }
    return Promise.resolve({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'unknown' } })
  })
}

/** 触发列表行点击，选中申请人 */
async function clickReviewRow(wrapper: ReturnType<typeof mount>) {
  // 表头也有 role="row"，需定位 tbody 中的第一行数据
  const rows = wrapper.findAll('tbody tr[role="row"]')
  await rows[0].trigger('click')
  await flushPromises()
}

describe('ReviewPage 评审页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRoute.mockReturnValue({ params: { clubId: 'club-001', activityId: 'act-1' }, query: {} })
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染评审列表', async () => {
    setupGetRouter()
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('技术部')
  })

  it('加载失败：不渲染列表', async () => {
    setupGetRouter({ reviews: { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })

  it('选中申请人：加载并展示报名表单答案，附件渲染为可点击链接', async () => {
    setupGetRouter()
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)

    // 申请详情接口被调用（面试官视角可访问）
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/applications/u-1')
    // 表单答案展示
    expect(wrapper.text()).toContain('报名信息')
    expect(wrapper.text()).toContain('自我介绍')
    expect(wrapper.text()).toContain('我叫张三')
    // 文件字段渲染为可点击链接跳转 FilePreviewPage
    expect(wrapper.text()).toContain('作品附件')
    expect(wrapper.text()).toContain('作品集.pdf')
    const link = wrapper.find('a[href="/files/file-abc"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('作品集.pdf')
    // 不展示 FileMeta 原始 JSON
    expect(wrapper.text()).not.toContain('{&quot;id&quot;')
  })

  it('选中申请人但申请详情加载失败：评价流程不受影响', async () => {
    setupGetRouter({ rejectedApplication: true })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)

    // 不展示报名信息块，但评价面板仍可渲染
    expect(wrapper.text()).not.toContain('报名信息')
    expect(wrapper.text()).toContain('张三')
  })

  it('提交评价：按 applicantId 调 conclude（不再用行 id app-xxx），失败仅 toast 展示，成功后刷新列表', async () => {
    setupGetRouter()
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '申请人不存在' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)
    await wrapper.find('button[aria-label="4 星"]').trigger('click')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('提交评价'))
    expect(submitBtn, '未找到提交评价按钮').toBeTruthy()
    await submitBtn!.trigger('click')
    await flushPromises()

    // 契约：conclude 按 applicantId 定位申请人（列表行 applicantId=u-1）
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews/u-1/conclude', {
      rating: 4,
      comment: '',
    }, { expectedVersion: undefined })
    // 失败不再静默：操作结果走向独立 Toast 层（不内联进评价正文）
    expect(mockToastError).toHaveBeenCalledWith('申请人不存在')
    expect(wrapper.text()).not.toContain('申请人不存在')
  })

  it('提交评价成功：toast 提示并刷新列表', async () => {
    setupGetRouter()
    mockPost.mockResolvedValue({ kind: 'completed', data: { status: 'concluded' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)
    await wrapper.find('button[aria-label="4 星"]').trigger('click')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('提交评价'))
    expect(submitBtn, '未找到提交评价按钮').toBeTruthy()
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews/u-1/conclude', {
      rating: 4,
      comment: '',
    }, { expectedVersion: undefined })
    expect(mockToastSuccess).toHaveBeenCalledWith('评价已提交')
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews')
  })

  it('带 ?applicantId= 锚定进入：自动选中对应申请人', async () => {
    mockUseRoute.mockReturnValue({
      params: { clubId: 'club-001', activityId: 'act-1' },
      query: { applicantId: 'u-1' },
    })
    setupGetRouter()
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')
    // 评价面板已展开（非"点击左侧申请人查看详情"占位）
    expect(wrapper.text()).not.toContain('点击左侧申请人查看详情')
  })

  it('提交评价被异步受理（accepted）：提示已受理且不误报失败', async () => {
    setupGetRouter()
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 't-1', status: 'processing' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)
    await wrapper.find('button[aria-label="4 星"]').trigger('click')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('提交评价'))
    expect(submitBtn, '未找到提交评价按钮').toBeTruthy()
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockToastInfo).toHaveBeenCalledWith('评价已受理，正在后台处理')
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('统一发布结论被异步受理（accepted）：提示已受理且不误报失败', async () => {
    setupGetRouter({ reviews: { kind: 'completed', data: { items: [{ ...review, status: 'concluded', myRating: 4 }] } } })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 't-1', status: 'processing' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 打开统一发布弹窗并确认
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('统一发布结论'))
    expect(publishBtn, '未找到统一发布结论按钮').toBeTruthy()
    await publishBtn!.trigger('click')
    await flushPromises()
    const hrcConfirm = wrapper.find('.hrc-confirm')
    expect(hrcConfirm.exists(), '未找到 HighRiskConfirm 确认按钮').toBe(true)
    await hrcConfirm.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews/publish')
    expect(mockToastInfo).toHaveBeenCalledWith('发布已受理，正在后台处理')
    expect(mockToastError).not.toHaveBeenCalled()
  })
})
