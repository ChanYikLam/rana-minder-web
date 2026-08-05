import { describe, expect, it } from 'vitest'
import { readMultipartBody } from '../../mock-plugin'
import type { IncomingMessage } from 'node:http'

function buildMultipart(boundary: string, parts: { name: string; value: string; filename?: string; contentType?: string }[]): Buffer {
  const lines: string[] = []
  for (const part of parts) {
    lines.push(`--${boundary}`)
    if (part.filename) {
      lines.push(`Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`)
      lines.push(`Content-Type: ${part.contentType || 'application/octet-stream'}`)
    } else {
      lines.push(`Content-Disposition: form-data; name="${part.name}"`)
    }
    lines.push('')
    lines.push(part.value)
  }
  lines.push(`--${boundary}--`)
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')
}

function requestWith(contentType: string): IncomingMessage {
  return { headers: { 'content-type': contentType } } as IncomingMessage
}

describe('mock-plugin multipart/form-data 解析', () => {
  it('提取文件字段的 filename 与 size，普通字段归入 fields（purpose 归入 input）', () => {
    const raw = buildMultipart('boundary123', [
      { name: 'purpose', value: 'application' },
      { name: 'file', value: 'fake-pdf-content', filename: '简历.pdf', contentType: 'application/pdf' },
    ])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=boundary123'), raw)
    expect(out).toEqual({ input: { name: '简历.pdf', size: 16, purpose: 'application' } })
  })

  it('boundary 带引号也可解析', () => {
    const raw = buildMultipart('xyz', [{ name: 'purpose', value: 'application' }])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary="xyz"'), raw)
    expect(out).toEqual({ input: { purpose: 'application' } })
  })

  it('缺少 boundary 时返回空对象（不抛异常）', () => {
    const raw = Buffer.from('not-multipart', 'latin1')
    const out = readMultipartBody(requestWith('multipart/form-data'), raw)
    expect(out).toEqual({})
  })

  it('无文件字段时回退为普通字段映射', () => {
    const raw = buildMultipart('b1', [{ name: 'title', value: 'hello' }])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=b1'), raw)
    expect(out).toEqual({ title: 'hello' })
  })

  it('普通字段中文值应正确解码（含文件字段并存时归入 input.purpose）', () => {
    const raw = buildMultipart('b', [
      { name: 'purpose', value: '申请材料' },
      { name: 'file', value: 'x', filename: '简历.pdf' },
    ])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=b'), raw)
    expect(out).toEqual({ input: { name: '简历.pdf', size: 1, purpose: '申请材料' } })
  })

  it('空文件（size=0）仍保留文件名与大小', () => {
    const raw = buildMultipart('b2', [
      { name: 'purpose', value: 'application' },
      { name: 'file', value: '', filename: 'empty.txt' },
    ])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=b2'), raw)
    expect(out).toEqual({ input: { name: 'empty.txt', size: 0, purpose: 'application' } })
  })

  it('字段名含中文时可正确解析（head 已 utf8 解码后匹配 name）', () => {
    const raw = buildMultipart('b3', [{ name: '用途', value: '材料' }])
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=b3'), raw)
    expect(out).toEqual({ 用途: '材料' })
  })

  it('RFC 5987 filename* 扩展（UTF-8 百分号编码）正确解码文件名', () => {
    const head = [
      '--b4',
      'Content-Disposition: form-data; name="purpose"',
      '',
      'application',
      '--b4',
      `Content-Disposition: form-data; name="file"; filename*=UTF-8''${encodeURIComponent('简历.pdf')}`,
      'Content-Type: application/pdf',
      '',
      'x',
      '--b4--',
      '',
    ].join('\r\n')
    const raw = Buffer.from(head, 'utf8')
    const out = readMultipartBody(requestWith('multipart/form-data; boundary=b4'), raw)
    expect(out).toEqual({ input: { name: '简历.pdf', size: 1, purpose: 'application' } })
  })
})
