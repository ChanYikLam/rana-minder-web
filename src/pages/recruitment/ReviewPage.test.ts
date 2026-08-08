import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ReviewPage from './ReviewPage.vue'

const review = {
  id: 'app-1', applicantId: 'u-1', applicantName: '张三', departmentName: '技术部',
  status: 'in_progress', rating: null, comment: null, concludedAt: null, concludedBy: null,
  roundName: '一轮', interviewAt: '2026-08-10T04:00:00Z',
  myRating: null, myComment: null, peerViewLocked: false, reviews: [],
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
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
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

  it('提交评价：按 applicantId 调 conclude（不再用行 id app-xxx），成功后刷新列表', async () => {
    setupGetRouter()
    mockPost.mockResolvedValue({ kind: 'completed', data: { status: 'concluded' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)
    await wrapper.find('button[aria-label="4 星"]').trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('提交评价'))!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews/u-1/conclude', {
      rating: 4,
      comment: '',
    })
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/reviews')
  })

  it('提交评价失败：错误信息展示，不再静默吞掉', async () => {
    setupGetRouter()
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '申请人不存在' } })
    const wrapper = mount(ReviewPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await clickReviewRow(wrapper)
    await wrapper.find('button[aria-label="4 星"]').trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('提交评价'))!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('申请人不存在')
  })
})
