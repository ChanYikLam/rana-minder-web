import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationViewStore } from './notificationViewStore'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getUnreadCount: vi.fn(),
}))

vi.mock('@/services', () => ({
  notificationApi: mocks,
}))

function makeItem(id: string, read: boolean) {
  return { id, type: 'info', title: `通知${id}`, body: '内容', read, createdAt: '2026-08-07T04:00:00Z', link: null, clubName: null }
}

describe('notificationViewStore 未读数与列表', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadUnreadCount 成功时写入计数', async () => {
    const store = useNotificationViewStore()
    mocks.getUnreadCount.mockResolvedValue({ kind: 'completed', data: { count: 5 } })

    await store.loadUnreadCount()

    expect(store.unreadCount).toBe(5)
    expect(store.hasUnread).toBe(true)
  })

  it('loadUnreadCount 失败时计数保持不变', async () => {
    const store = useNotificationViewStore()
    store.unreadCount = 3
    mocks.getUnreadCount.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    await store.loadUnreadCount()

    expect(store.unreadCount).toBe(3)
  })

  it('loadNotifications 无 cursor：整表替换', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-0', false)]
    mocks.list.mockResolvedValue({
      kind: 'completed',
      data: { items: [makeItem('n-1', false), makeItem('n-2', true)], nextCursor: 'c2' },
    })

    await store.loadNotifications()

    expect(store.items.map((n) => n.id)).toEqual(['n-1', 'n-2'])
    expect(store.loading).toBe(false)
  })

  it('loadNotifications 带 cursor：追加分页', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-1', false)]
    mocks.list.mockResolvedValue({
      kind: 'completed',
      data: { items: [makeItem('n-2', true)], nextCursor: null },
    })

    await store.loadNotifications('c1')

    expect(mocks.list).toHaveBeenCalledWith({ cursor: 'c1' })
    expect(store.items.map((n) => n.id)).toEqual(['n-1', 'n-2'])
  })

  it('loadNotifications 失败：返回错误码且 loading 复位', async () => {
    const store = useNotificationViewStore()
    mocks.list.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: 'x' } })

    const code = await store.loadNotifications()

    expect(code).toBe('IFC-ERR-003')
    expect(store.loading).toBe(false)
  })

  it('loadNotifications 失败（external_uncertain）：返回 013 错误码', async () => {
    const store = useNotificationViewStore()
    mocks.list.mockResolvedValue({ kind: 'external_uncertain', error: { code: 'IFC-ERR-013', message: 'x' } })

    const code = await store.loadNotifications()

    expect(code).toBe('IFC-ERR-013')
    expect(store.loading).toBe(false)
  })

  it('loadNotifications 成功：返回 null 且不抛错', async () => {
    const store = useNotificationViewStore()
    mocks.list.mockResolvedValue({ kind: 'completed', data: { items: [], nextCursor: null } })

    const code = await store.loadNotifications()

    expect(code).toBeNull()
  })
})

describe('notificationViewStore 已读操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('markRead：未读项置读并递减未读数', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-1', false), makeItem('n-2', true)]
    store.unreadCount = 3
    mocks.markRead.mockResolvedValue({ kind: 'completed', data: null })

    await store.markRead('n-1')

    expect(store.items[0].read).toBe(true)
    expect(store.unreadCount).toBe(2)
  })

  it('markRead：重复标记同一未读项只递减一次（递减保护）', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-1', false)]
    store.unreadCount = 3
    mocks.markRead.mockResolvedValue({ kind: 'completed', data: null })

    await store.markRead('n-1')
    await store.markRead('n-1')

    expect(store.unreadCount).toBe(2)
  })

  it('markRead：已读项不递减未读数', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-2', true)]
    store.unreadCount = 1
    mocks.markRead.mockResolvedValue({ kind: 'completed', data: null })

    await store.markRead('n-2')

    expect(store.unreadCount).toBe(1)
  })

  it('markRead：目标项不在列表时不递减', async () => {
    const store = useNotificationViewStore()
    store.items = []
    store.unreadCount = 1
    mocks.markRead.mockResolvedValue({ kind: 'completed', data: null })

    await store.markRead('n-ghost')

    expect(store.unreadCount).toBe(1)
  })

  it('markRead 失败：显式抛出', async () => {
    const store = useNotificationViewStore()
    mocks.markRead.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    await expect(store.markRead('n-1')).rejects.toThrow('mark read failed')
  })

  it('markAllRead：全部置读并清零未读数', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-1', false), makeItem('n-2', false)]
    store.unreadCount = 2
    mocks.markAllRead.mockResolvedValue({ kind: 'completed', data: null })

    await store.markAllRead()

    expect(store.items.every((n) => n.read)).toBe(true)
    expect(store.unreadCount).toBe(0)
    expect(store.hasUnread).toBe(false)
  })

  it('markAllRead 失败：返回错误码且状态不变', async () => {
    const store = useNotificationViewStore()
    store.items = [makeItem('n-1', false)]
    store.unreadCount = 1
    mocks.markAllRead.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: 'x' } })

    const code = await store.markAllRead()

    expect(code).toBe('IFC-ERR-003')
    expect(store.items[0].read).toBe(false)
    expect(store.unreadCount).toBe(1)
  })

  it('markAllRead 失败不影响下一次 loadNotifications 的错误码（P1-1：无 lastError 竞态）', async () => {
    const store = useNotificationViewStore()
    mocks.markAllRead.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    mocks.list.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-012', message: '依赖不可用' } })

    await store.markAllRead()
    const code = await store.loadNotifications()

    expect(code).toBe('IFC-ERR-012')
  })
})
