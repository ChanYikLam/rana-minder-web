import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useRequest } from './useRequest'
import { useForm } from './useForm'
import type { ApiResult } from '@/types/contracts'

describe('useRequest 页面状态机', () => {
  it('completed 非分页数据：state=normal 并写入 data', async () => {
    const { execute, data, state } = useRequest<{ id: string }>(async () => ({ kind: 'completed', data: { id: 'a1' } }))

    await execute()

    expect(state.value).toBe('normal')
    expect(data.value).toEqual({ id: 'a1' })
  })

  it('completed 空 items：state=empty', async () => {
    const { execute, state } = useRequest<{ items: unknown[] }>(async () => ({ kind: 'completed', data: { items: [] } }))

    await execute()

    expect(state.value).toBe('empty')
  })

  it('completed 非空 items：state=normal', async () => {
    const { execute, state } = useRequest<{ items: unknown[] }>(async () => ({ kind: 'completed', data: { items: [1] } }))

    await execute()

    expect(state.value).toBe('normal')
  })

  it('accepted：state=loading（任务处理中）', async () => {
    const { execute, state } = useRequest(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }))

    await execute()

    expect(state.value).toBe('loading')
  })

  it('external_uncertain：state=loading（结果不确定）', async () => {
    const { execute, state } = useRequest(async () => ({ kind: 'external_uncertain', error: { code: 'IFC-ERR-013', message: 'x' } }))

    await execute()

    expect(state.value).toBe('loading')
  })

  it('concurrency_conflict：state=error 并携带 supportId', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'concurrency_conflict',
      error: { code: 'IFC-ERR-008', message: '数据已变化', supportId: 'SUP-9' },
      currentData: {},
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value).toEqual({ code: 'IFC-ERR-008', message: '数据已变化', supportId: 'SUP-9' })
  })

  it('dependency_unavailable：state=error', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'dependency_unavailable',
      error: { code: 'IFC-ERR-012', message: '服务不可用' },
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value?.message).toBe('服务不可用')
  })

  it('rejected 越权码（003）：state=forbidden', async () => {
    const { execute, state } = useRequest(async () => ({
      kind: 'rejected',
      error: { code: 'IFC-ERR-003', message: '无权限' },
    }))

    await execute()

    expect(state.value).toBe('forbidden')
  })

  it('rejected 一般码（005）：state=error', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'rejected',
      error: { code: 'IFC-ERR-005', message: '校验失败' },
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value?.message).toBe('校验失败')
  })

  it('fn 抛异常：state=error 且错误信息取自异常', async () => {
    const { execute, state, error } = useRequest(async () => {
      throw new Error('boom')
    })

    await execute()

    expect(state.value).toBe('error')
    expect(error.value).toEqual({ code: 'IFC-ERR-016', message: 'boom' })
  })

  it('执行期间并发调用被去重（submitting 守卫）', async () => {
    let resolveFn: (r: ApiResult<{ id: string }>) => void = () => {}
    const fn = vi.fn(() => new Promise<ApiResult<{ id: string }>>((resolve) => { resolveFn = resolve }))
    const { execute, state } = useRequest<{ id: string }>(fn)

    const p1 = execute()
    const p2 = execute()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(state.value).toBe('loading')

    resolveFn({ kind: 'completed', data: { id: 'x' } })
    await Promise.all([p1, p2])
    expect(state.value).toBe('normal')
  })

  it('immediate: 初始 state=loading 并自动执行一次', async () => {
    const fn = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'completed', data: { id: 'x' } }))
    const { state } = useRequest<{ id: string }>(fn, { immediate: true })

    expect(state.value).toBe('loading')
    await new Promise((r) => setTimeout(r, 0))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(state.value).toBe('normal')
  })

  it('refresh 重新执行', async () => {
    const fn = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'completed', data: { id: 'x' } }))
    const { refresh } = useRequest<{ id: string }>(fn)

    await refresh()
    await refresh()

    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('useForm 表单状态机', () => {
  const schema = z.object({
    name: z.string().min(2, '姓名至少 2 个字符'),
    age: z.coerce.number().min(18, '年龄需满 18 岁'),
  })

  it('本地校验失败：errors 按字段首条错误填充，不调用 onSubmit', async () => {
    const onSubmit = vi.fn()
    const form = useForm({ schema, initialValues: { name: '张' }, onSubmit })

    await form.handleSubmit()

    expect(form.errors.value.name).toBe('姓名至少 2 个字符')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('校验通过且 completed：无错误态', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({ kind: 'completed', data: { name: '张三', age: 20 } }),
    })

    await form.handleSubmit()

    expect(form.errors.value).toEqual({})
    expect(form.submitError.value).toBeNull()
    expect(form.versionConflict.value).toBe(false)
    expect(form.submitting.value).toBe(false)
  })

  it('accepted：submitError=操作正在处理中', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }),
    })

    await form.handleSubmit()

    expect(form.submitError.value).toBe('操作正在处理中')
  })

  it('concurrency_conflict：versionConflict=true 并展示服务端消息', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({
        kind: 'concurrency_conflict',
        error: { code: 'IFC-ERR-008', message: '版本已过期' },
        currentData: {},
      }),
    })

    await form.handleSubmit()

    expect(form.versionConflict.value).toBe(true)
    expect(form.submitError.value).toBe('版本已过期')
  })

  it('rejected 带 fieldErrors：errors 取每条首条消息，fieldErrors 保留原始结构', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({
        kind: 'rejected',
        error: { code: 'IFC-ERR-005', message: '校验失败', fieldErrors: { name: ['姓名已占用', '格式错误'] } },
      }),
    })

    await form.handleSubmit()

    expect(form.errors.value).toEqual({ name: '姓名已占用' })
    expect(form.fieldErrors.value).toEqual({ name: ['姓名已占用', '格式错误'] })
  })

  it('rejected 无 fieldErrors：submitError 取服务端消息', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({ kind: 'rejected', error: { code: 'IFC-ERR-006', message: '活动已结束' } }),
    })

    await form.handleSubmit()

    expect(form.submitError.value).toBe('活动已结束')
  })

  it('rejected 无消息：submitError 回退默认文案', async () => {
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () => ({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '' } }),
    })

    await form.handleSubmit()

    expect(form.submitError.value).toBe('提交失败，请稍后重试')
  })

  it('提交期间重复提交被忽略（submitting 守卫）', async () => {
    let resolveFn: (r: ApiResult<{ name: string; age: number }>) => void = () => {}
    const onSubmit = vi.fn(
      () => new Promise<ApiResult<{ name: string; age: number }>>((resolve) => { resolveFn = resolve }),
    )
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit,
    })

    const p1 = form.handleSubmit()
    const p2 = form.handleSubmit()

    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolveFn({ kind: 'completed', data: { name: '张三', age: 20 } })
    await Promise.all([p1, p2])
    expect(form.submitting.value).toBe(false)
  })

  it('setFieldError / clearErrors / setServerErrors 辅助方法', () => {
    const form = useForm({
      schema,
      onSubmit: async () => ({ kind: 'completed', data: {} }),
    })

    form.setFieldError('name', '手动错误')
    expect(form.errors.value.name).toBe('手动错误')

    form.setServerErrors({ age: ['年龄校验失败'] })
    expect(form.fieldErrors.value.age).toEqual(['年龄校验失败'])
    expect(form.errors.value.age).toBe('年龄校验失败')

    form.clearErrors()
    expect(form.errors.value).toEqual({})
    expect(form.fieldErrors.value).toEqual({})
    expect(form.submitError.value).toBeNull()
    expect(form.versionConflict.value).toBe(false)
  })

  it('下一次提交重置上一次的 submitError 与 versionConflict', async () => {
    let mode: 'conflict' | 'ok' = 'conflict'
    const form = useForm({
      schema,
      initialValues: { name: '张三', age: 20 },
      onSubmit: async () =>
        mode === 'conflict'
          ? ({ kind: 'concurrency_conflict', error: { code: 'IFC-ERR-008', message: '冲突' }, currentData: {} } as const)
          : ({ kind: 'completed', data: {} } as const),
    })

    await form.handleSubmit()
    expect(form.versionConflict.value).toBe(true)

    mode = 'ok'
    await form.handleSubmit()
    expect(form.versionConflict.value).toBe(false)
    expect(form.submitError.value).toBeNull()
  })
})
