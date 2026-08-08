import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAuthorizedDownload } from './download'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function stubOrigin(origin: string) {
  vi.stubGlobal('window', { location: { origin } })
}

function stubClick() {
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

describe('openAuthorizedDownload 下载 URL 白名单', () => {
  it('非字符串或空串直接拒绝', () => {
    stubOrigin('https://app.test')
    expect(openAuthorizedDownload(null)).toBe(false)
    expect(openAuthorizedDownload(undefined)).toBe(false)
    expect(openAuthorizedDownload(123)).toBe(false)
    expect(openAuthorizedDownload('')).toBe(false)
    expect(openAuthorizedDownload('   ')).toBe(false)
  })

  it('非法 URL（畸形百分号编码）拒绝', () => {
    stubOrigin('https://app.test')
    expect(openAuthorizedDownload('http://exa%zz.com/file')).toBe(false)
  })

  it('javascript: 协议拒绝（防 XSS 注入）', () => {
    stubOrigin('https://app.test')
    expect(openAuthorizedDownload('javascript:alert(1)')).toBe(false)
  })

  it('https 跨源放行（协议白名单语义：https 即可信，不校验同源）', () => {
    stubOrigin('https://app.test')
    expect(openAuthorizedDownload('https://cdn.remote.com/file.pdf')).toBe(true)
  })

  it('跨源 http 拒绝', () => {
    stubOrigin('https://app.test')
    expect(openAuthorizedDownload('http://evil.com/file.pdf')).toBe(false)
  })

  it('同源 http 特例放行（本地联调场景）', () => {
    stubOrigin('http://localhost:5173')
    expect(openAuthorizedDownload('http://localhost:5173/files/1')).toBe(true)
  })

  it('同源 https：创建链接、设置 noopener、触发点击并移除', () => {
    stubOrigin('https://app.test')
    const clickSpy = stubClick()
    const appendSpy = vi.spyOn(document.body, 'appendChild')

    const ok = openAuthorizedDownload('https://app.test/api/files/a1b2')

    expect(ok).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    const link = appendSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(link.href).toBe('https://app.test/api/files/a1b2')
    expect(link.rel).toBe('noopener noreferrer')
    expect(link.download).toBe('')
    // 点击后立即从 DOM 移除，不留痕迹
    expect(document.body.children.length).toBe(0)
  })
})
