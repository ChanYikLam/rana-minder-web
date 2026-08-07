import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AttachmentUpload from './AttachmentUpload.vue'

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('AttachmentUpload 附件上传', () => {
  it('空列表：展示选择入口与提示', () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [], hint: '支持 PDF' } })
    expect(wrapper.text()).toContain('选择附件')
    expect(wrapper.text()).toContain('支持 PDF')
  })

  it('渲染已上传文件的状态标签', () => {
    const wrapper = mount(AttachmentUpload, {
      props: {
        modelValue: [
          { id: 'f1', name: '简历.pdf', size: 2048, mimeType: 'application/pdf', status: 'checking', uploadedAt: '2026-08-01T00:00:00Z', checkedAt: null, downloadUrl: null },
          { id: 'f2', name: '照片.png', size: 1048576, mimeType: 'image/png', status: 'approved', uploadedAt: '2026-08-01T00:00:00Z', checkedAt: null, downloadUrl: null },
        ],
      },
    })
    expect(wrapper.text()).toContain('简历.pdf')
    expect(wrapper.text()).toContain('安全检查中')
    expect(wrapper.text()).toContain('2 KB')
    expect(wrapper.text()).toContain('照片.png')
    expect(wrapper.text()).toContain('已通过安全检测')
    expect(wrapper.text()).toContain('1.0 MB')
  })

  it('选择合法文件：追加 checking 状态条目', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [makeFile('a.pdf', 'application/pdf')], configurable: true })
    await input.trigger('change')
    const emitted = wrapper.emitted('update:modelValue')?.[0]![0] as { name: string; status: string }[]
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ name: 'a.pdf', status: 'checking' })
  })

  it('类型不在白名单：标记 rejected 不进入检查', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [makeFile('evil.exe', 'application/x-msdownload')], configurable: true })
    await input.trigger('change')
    const emitted = wrapper.emitted('update:modelValue')?.[0]![0] as { status: string; id: string }[]
    expect(emitted[0].status).toBe('rejected')
    expect(emitted[0].id).toContain('rejected-type')
  })

  it('超过 10MB：标记 rejected（size）', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [] } })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [makeFile('big.pdf', 'application/pdf', 11 * 1024 * 1024)], configurable: true })
    await input.trigger('change')
    const emitted = wrapper.emitted('update:modelValue')?.[0]![0] as { status: string; id: string }[]
    expect(emitted[0].status).toBe('rejected')
    expect(emitted[0].id).toContain('rejected-size')
  })

  it('accept 含 image/* 通配符：展开为具体图片类型', async () => {
    const wrapper = mount(AttachmentUpload, { props: { modelValue: [], accept: 'image/*' } })
    const input = wrapper.find('input[type="file"]')
    // PNG 允许、PDF 拒绝
    Object.defineProperty(input.element, 'files', { value: [makeFile('x.png', 'image/png'), makeFile('x.pdf', 'application/pdf')], configurable: true })
    await input.trigger('change')
    const emitted = wrapper.emitted('update:modelValue')?.[0]![0] as { status: string }[]
    expect(emitted[0].status).toBe('checking')
    expect(emitted[1].status).toBe('rejected')
  })
})
