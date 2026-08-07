import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useLastLeaderGuard } from './useLastLeaderGuard'

describe('useLastLeaderGuard 末位负责人守卫', () => {
  it('成员为负责人且社团内负责人不超过 1 名：判定为末位负责人', () => {
    const members = ref([
      { title: '负责人', status: 'active' },
      { title: '干事', status: 'active' },
    ])
    const { isLastLeader } = useLastLeaderGuard(members)
    expect(isLastLeader({ title: '负责人', status: 'active' })).toBe(true)
  })

  it('存在第二名 active 负责人：不是末位', () => {
    const members = ref([
      { title: '负责人', status: 'active' },
      { title: '负责人', status: 'active' },
    ])
    const { isLastLeader } = useLastLeaderGuard(members)
    expect(isLastLeader({ title: '负责人', status: 'active' })).toBe(false)
  })

  it('非负责人职位不触发守卫', () => {
    const members = ref([{ title: '负责人', status: 'active' }])
    const { isLastLeader } = useLastLeaderGuard(members)
    expect(isLastLeader({ title: '干事', status: 'active' })).toBe(false)
  })

  it('非 active 的负责人不计入统计', () => {
    const members = ref([
      { title: '负责人', status: 'active' },
      { title: '负责人', status: 'ended' },
    ])
    const { isLastLeader } = useLastLeaderGuard(members)
    expect(isLastLeader({ title: '负责人', status: 'active' })).toBe(true)
  })

  it('null/undefined 成员返回 false', () => {
    const members = ref([{ title: '负责人', status: 'active' }])
    const { isLastLeader } = useLastLeaderGuard(members)
    expect(isLastLeader(null)).toBe(false)
    expect(isLastLeader(undefined)).toBe(false)
  })

  it('响应性：新负责人加入后守卫解除', async () => {
    const members = ref([{ title: '负责人', status: 'active' }])
    const { isLastLeader } = useLastLeaderGuard(members)
    const target = { title: '负责人', status: 'active' }
    expect(isLastLeader(target)).toBe(true)

    members.value.push({ title: '负责人', status: 'active' })
    expect(isLastLeader(target)).toBe(false)
  })
})
