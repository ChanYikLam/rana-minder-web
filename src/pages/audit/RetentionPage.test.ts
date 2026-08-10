import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import RetentionPage from './RetentionPage.vue'

// 在保留 pageStubs 其他项的同时，覆盖 HighRiskConfirm 以模拟失败/重试/关闭按钮，
// 避免依赖真实组件的内部状态机（在 happy-dom 下 reka-ui Dialog 行为不稳定）。
const highRiskConfirmStub = {
  props: ['open', 'confirmLabel', 'cancelLabel', 'executing', 'succeeded', 'errorMessage', 'reauthRequired'],
  template: `
    <div class="hrc" v-if="open" :data-reauth="reauthRequired == null || reauthRequired ? '1' : '0'">
      <slot /><slot name="extra" />{{ errorMessage }}
      <button class="hrc-cancel" @click="$emit('cancel')">{{ cancelLabel || '取消' }}</button>
      <button class="hrc-confirm" :disabled="executing" @click="$emit('confirm', reauthRequired === false ? undefined : 'mock-reauth-proof')">{{ confirmLabel || '确认' }}</button>
      <button v-if="!executing && errorMessage" class="hrc-close" @click="$emit('update:open', false)">关闭</button>
      <button v-if="!executing && errorMessage" class="hrc-retry" @click="$emit('update:errorMessage', ''); $emit('retry')">重试</button>
    </div>
  `,
}
const retentionStubs = { ...pageStubs, HighRiskConfirm: highRiskConfirmStub }

describe('RetentionPage 数据保留策略', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染保留策略', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive' }] },
    })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/retention')
    expect(wrapper.text()).toContain('application')
    expect(wrapper.text()).toContain('180')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('180')
  })

  it('执行保留策略被 202 异步受理：提示已受理并关闭执行弹窗，不误报失败', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'pending' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    expect(wrapper.find('.hrc').exists()).toBe(true)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/retention/execute', expect.objectContaining({ reauthProof: 'mock-reauth-proof' }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(wrapper.find('.hrc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('执行保留策略失败：错误传入弹窗展示而非永久卡“正在执行”', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '执行被中断' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists()).toBe(true)
    expect(wrapper.find('.hrc').text()).toContain('执行被中断')
    wrapper.unmount()
  })
})

describe('RetentionPage 正式发布失败处理', () => {
  const wrappers: VueWrapper[] = []

  const policy = {
    id: 'rt-draft-1',
    scope: 'application',
    retentionDays: 30,
    action: 'archive',
    status: 'draft',
    version: 1,
    updatedAt: '2026-08-10T00:00:00Z',
    publishedAt: null,
  }
  const preview = {
    scope: 'application',
    fromDays: 30,
    toDays: 90,
    action: 'archive',
    affectedObjects: { records: 12, members: 4 },
    bufferDays: 0,
    previewVersion: 1,
  }

  function mockRetentionGet() {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/admin/retention') {
        return { kind: 'completed', data: { policies: [policy] } }
      }
      if (url === '/admin/retention/rt-draft-1/preview') {
        return { kind: 'completed', data: preview }
      }
      return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } }
    })
  }

  function mockReauthPost() {
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/auth/reauth') {
        return { kind: 'completed', data: { proof: 'proof-rt', expiresAt: '2026-08-10T01:00:00Z' } }
      }
      return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } }
    })
  }

  function mountWithPolicy() {
    mockRetentionGet()
    mockReauthPost()
    const w = mount(RetentionPage, { global: { stubs: retentionStubs } })
    wrappers.push(w)
    return w
  }

  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    vi.restoreAllMocks()
  })

  async function gotoConfirmDialog(wrapper: VueWrapper) {
    await flushPromises()

    // 1. 重新验证身份
    const reauthBtn = wrapper.findAll('button').find((b) => b.text().includes('重新验证身份') || b.text().includes('身份验证已完成'))
    expect(reauthBtn, '重新验证身份按钮').toBeTruthy()
    await reauthBtn!.trigger('click')
    await flushPromises()

    // 2. 预览影响
    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('预览影响') || b.text().includes('重新预览影响'))
    expect(previewBtn, '预览影响按钮').toBeTruthy()
    await previewBtn!.trigger('click')
    await flushPromises()

    // 3. 填写发布原因（≥5 字符）
    const textarea = wrapper.find('textarea')
    expect(textarea.exists(), '发布原因输入框').toBe(true)
    await textarea.setValue('正常发布保留策略')
    await flushPromises()

    // 4. 打开 HighRiskConfirm
    const publishBtn = wrapper.findAll('button').find((b) => b.text().trim() === '确认发布')
    expect(publishBtn, '打开确认发布弹窗按钮').toBeTruthy()
    await publishBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists(), 'HighRiskConfirm 已打开').toBe(true)
  }

  it('发布失败：弹窗显示错误，可手动关闭', async () => {
    const wrapper = mountWithPolicy()
    await gotoConfirmDialog(wrapper)

    // mockPost 当前仅处理 /auth/reauth；发布接口让其失败
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/auth/reauth') {
        return { kind: 'completed', data: { proof: 'proof-rt', expiresAt: '2026-08-10T01:00:00Z' } }
      }
      return { kind: 'rejected', error: { code: 'IFC-ERR-018', message: '服务暂时不可用' } }
    })

    const hrc = wrapper.find('.hrc')
    const confirmBtn = hrc.find('.hrc-confirm')
    expect(confirmBtn.exists(), 'HighRiskConfirm 内的确认发布按钮').toBe(true)
    await confirmBtn.trigger('click')
    await flushPromises()

    // 1. 弹窗未自动关闭，仍可见
    const hrcAfter = wrapper.find('.hrc')
    expect(hrcAfter.exists(), '失败后弹窗不应被自动关闭').toBe(true)
    // 2. 弹窗内显示错误文案
    expect(hrcAfter.text()).toContain('服务暂时不可用')

    // 3. 关闭按钮可点击并真的关闭弹窗（不卡"正在执行..."）
    const closeBtn = hrcAfter.find('.hrc-close')
    expect(closeBtn.exists(), '失败状态下的关闭按钮').toBe(true)
    await closeBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists(), '点击关闭后弹窗消失').toBe(false)
  })

  it('发布成功：弹窗显示完成态，succeeded 被置 true 后再关闭', async () => {
    const wrapper = mountWithPolicy()
    await gotoConfirmDialog(wrapper)

    mockPost.mockImplementation(async (url: string) => {
      if (url === '/auth/reauth') {
        return { kind: 'completed', data: { proof: 'proof-rt', expiresAt: '2026-08-10T01:00:00Z' } }
      }
      if (url === '/admin/retention/rt-draft-1/publish') {
        return { kind: 'completed', data: { notice: null, auditRef: 'audit-1' } }
      }
      return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } }
    })

    const hrc = wrapper.find('.hrc')
    const confirmBtn = hrc.find('.hrc-confirm')
    expect(confirmBtn.exists(), 'HighRiskConfirm 内的确认发布按钮').toBe(true)
    await confirmBtn.trigger('click')
    await flushPromises()

    // 成功后弹窗应自动关闭（succeeded=true 后父组件显式关闭，避免卡在"正在执行..."）
    expect(wrapper.find('.hrc').exists(), '成功后弹窗被关闭').toBe(false)
  })
})
