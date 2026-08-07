import { describe, expect, it } from 'vitest'
import { MOCK_ERROR_CODES, MOCK_ERROR_MESSAGES, MOCK_ERROR_HTTP, resolveMockError, mockErrorBody } from './errors'
import { ERROR_CODES, ERROR_MESSAGES } from '../services/error-map'

describe('mock 错误码表与前端 error-map 保持一致', () => {
  it('MOCK_ERROR_CODES 与 ERROR_CODES 完全一致（防止错误码体系脱节）', () => {
    expect([...MOCK_ERROR_CODES].sort()).toEqual([...ERROR_CODES].sort())
  })

  it('每个 mock 错误码都有文案与 HTTP 状态映射', () => {
    for (const code of MOCK_ERROR_CODES) {
      expect(MOCK_ERROR_MESSAGES[code]).toBeTruthy()
      expect(MOCK_ERROR_HTTP[code]).toBeGreaterThanOrEqual(200)
    }
  })

  it('IFC-ERR-017 映射为 400 且文案与 error-map 一致', () => {
    expect(MOCK_ERROR_HTTP['IFC-ERR-017']).toBe(400)
    expect(MOCK_ERROR_MESSAGES['IFC-ERR-017']).toBe(ERROR_MESSAGES['IFC-ERR-017'])
  })
})

describe('?_mock_error 注入', () => {
  it('IFC-ERR-017 可被解析并构造响应体', () => {
    expect(resolveMockError('http://localhost/api/x?_mock_error=IFC-ERR-017')).toBe('IFC-ERR-017')
    const body = mockErrorBody('IFC-ERR-017')
    expect(body.code).toBe('IFC-ERR-017')
    expect(body.message).toBe(MOCK_ERROR_MESSAGES['IFC-ERR-017'])
    expect(body.supportId).toMatch(/^MOCK-/)
  })

  it('未知错误码注入返回 null', () => {
    expect(resolveMockError('http://localhost/api/x?_mock_error=IFC-ERR-999')).toBeNull()
    expect(resolveMockError('http://localhost/api/x?_mock_error=unknown')).toBeNull()
  })
})
