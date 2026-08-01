import { describe, expect, it } from 'vitest'
import { errorToPageState, httpStatusToResult } from './error-map'

describe('httpStatusToResult', () => {
  it('keeps accepted work distinct from completed work', () => {
    const result = httpStatusToResult(202, {
      code: 'IFC-ERR-014',
      data: { taskId: 'task-1', status: 'processing' },
    })

    expect(result).toEqual({ kind: 'accepted', data: { taskId: 'task-1', status: 'processing' } })
  })

  it('classifies uncertain and concurrency outcomes by contract code', () => {
    expect(httpStatusToResult(202, { code: 'IFC-ERR-013' }).kind).toBe('external_uncertain')
    expect(httpStatusToResult(409, { code: 'IFC-ERR-008', currentData: { version: 2 } }).kind).toBe('concurrency_conflict')
  })

  it('fails closed for authorization and visibility errors', () => {
    expect(errorToPageState('IFC-ERR-003')).toBe('forbidden')
    expect(errorToPageState('IFC-ERR-015')).toBe('forbidden')
  })

  it('maps unknown server codes to the safe commit failure class', () => {
    const result = httpStatusToResult(500, { code: 'INTERNAL_STACK_TRACE', message: 'sensitive detail' })
    expect(result).toEqual({
      kind: 'rejected',
      error: { code: 'IFC-ERR-016', message: '操作未能安全提交，请稍后重试' },
    })
  })
})
