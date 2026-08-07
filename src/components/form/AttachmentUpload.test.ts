import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { FileMeta } from '@/types/domain/form'

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前可用
const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }))

vi.mock('@/services/client', () => ({
  post: (...args: unknown[]) => mockPost(...args),
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'vue-sonner'
import AttachmentUpload from './AttachmentUpload.vue'

const uploadOk = {
  kind: 'completed' as const,
  data: { fileId: 'file-upload-001', name: 'resume.pdf', size: 1024, mimeType: 'application/pdf', status: 'clean', uploadedAt: '2026-08-07T00:00:00Z' },
}

/** 手工控制上传接口的返回时机：先应用父组件收到的 emitted 值，再让上传完成，避免 props 滞后 */
let resolveUploadReq!: (value: unknown) => void

function lastFiles(wrapper: ReturnType<typeof mount>): FileMeta[] {
  const emitted = wrapper.emitted('update:modelValue')
  return (emitted?.[emitted.length - 1]?.[0] as FileMeta[]) ?? []
}

function selectFile(wrapper: ReturnType<typeof mount>, name = 'resume.pdf', type = 'application/pdf') {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['x'], name, { type })], configurable: true })
  return input.trigger('change')
}

describe('AttachmentUpload 上传与安全检查', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockImplementation(() => new Promise((r) => { resolveUploadReq = r }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('上传成功：经真实上传接口取得 file- id，检查通过后标为 approved', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })

    await selectFile(wrapper)
    expect(mockPost).toHaveBeenCalledWith('/api/files/upload', { purpose: 'form-attachment', name: 'resume.pdf' })

    // 上传中阶段：本地临时 id 仅为占位，不产出 mock 伪造 id
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    expect(lastFiles(wrapper)[0].status).toBe('uploading')

    resolveUploadReq(uploadOk)
    await flushPromises()
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })

    // 上传完成后替换为真实 file- id，进入检查中
    expect(lastFiles(wrapper)[0].id).toBe('file-upload-001')
    expect(lastFiles(wrapper)[0].status).toBe('checking')
    expect(wrapper.text()).toContain('安全检查中')

    await vi.advanceTimersByTimeAsync(1500)
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    await nextTick()

    expect(wrapper.text()).toContain('已通过安全检测')
    expect(lastFiles(wrapper)[0].status).toBe('approved')
    expect(lastFiles(wrapper)[0].downloadUrl).toBe('/api/files/file-upload-001')
  })

  it('定时器触发前文件已被移除：不复活为 approved', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })

    await selectFile(wrapper)
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    resolveUploadReq(uploadOk)
    await flushPromises()
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    expect(wrapper.text()).toContain('安全检查中')

    // 父组件在检查通过前移除该文件
    await wrapper.setProps({ modelValue: [] })
    const emitCount = wrapper.emitted('update:modelValue')?.length ?? 0

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.length).toBe(emitCount)
    expect(wrapper.text()).not.toContain('已通过安全检测')
  })

  it('autoApprove=false：上传完成后仅置为已上传待检查，不自动通过', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [], autoApprove: false } })

    await selectFile(wrapper)
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    resolveUploadReq(uploadOk)
    await flushPromises()
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })

    expect(lastFiles(wrapper)[0].id).toBe('file-upload-001')
    expect(lastFiles(wrapper)[0].status).toBe('uploaded')

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()
    expect(wrapper.text()).toContain('已上传，待检查')
    expect(wrapper.text()).not.toContain('已通过安全检测')
  })

  it('上传失败：标记已拒绝并 toast 提示', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })

    await selectFile(wrapper)
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    resolveUploadReq({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '网络连接异常' } })
    await flushPromises()
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })

    expect(lastFiles(wrapper)[0].status).toBe('rejected')
    expect(wrapper.text()).toContain('已拒绝')
    expect(toast.error).toHaveBeenCalledWith('网络连接异常')
  })

  it('类型/大小不符合要求：本地直接拒绝且不发起上传', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })

    await selectFile(wrapper, 'a.exe', 'application/x-msdownload')
    expect(mockPost).not.toHaveBeenCalled()
    await wrapper.setProps({ modelValue: lastFiles(wrapper) })
    expect(wrapper.text()).toContain('已拒绝')
  })
})
