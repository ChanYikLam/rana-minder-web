import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('./modules', () => ({
  identityApi: { getSession: mocks.getSession, logout: mocks.logout },
}))

const MOCK_ROLE_STORAGE_KEY = 'ranaminder.mockRole'

describe('services/auth 认证模式分流', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadAuth(mode: string) {
    vi.stubEnv('VITE_AUTH_MODE', mode)
    vi.resetModules()
    return await import('./auth')
  }

  it('mock 模式：startLogin 记录 mock 角色并返回 ready', async () => {
    const { startLogin } = await loadAuth('mock')

    await expect(startLogin('/me', 'club_leader')).resolves.toBe('ready')

    expect(sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY)).toBe('club_leader')
  })

  it('mock 模式：startLogin 不传角色时不写存储', async () => {
    const { startLogin } = await loadAuth('mock')

    await startLogin('/me')

    expect(sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY)).toBeNull()
  })

  it('oidc 模式：startLogin 跳转统一认证并返回 redirected', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign, origin: 'https://app.test' } })
    const { startLogin } = await loadAuth('oidc')

    const result = await startLogin('/me/history?a=1')

    expect(result).toBe('redirected')
    expect(assign).toHaveBeenCalledWith('/api/auth/login?redirect=%2Fme%2Fhistory%3Fa%3D1')
  })

  it('disabled 模式：startLogin 直接返回 disabled', async () => {
    const { startLogin } = await loadAuth('disabled')

    await expect(startLogin('/me')).resolves.toBe('disabled')
  })

  it('disabled 模式：getSession 拒绝并提示认证未配置', async () => {
    const { getSession } = await loadAuth('disabled')

    await expect(getSession()).resolves.toEqual({
      kind: 'rejected',
      error: { code: 'AUTH-DISABLED', message: '统一认证尚未配置' },
    })
  })

  it('mock 模式未选角色：getSession 拒绝', async () => {
    const { getSession } = await loadAuth('mock')
    sessionStorage.clear()

    await expect(getSession()).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'AUTH-MOCK-NOT-SELECTED' },
    })
  })

  it('mock 模式已选角色：角色透传 identityApi.getSession', async () => {
    const { getSession } = await loadAuth('mock')
    sessionStorage.setItem(MOCK_ROLE_STORAGE_KEY, 'hr')
    mocks.getSession.mockResolvedValue({ kind: 'completed', data: { user: { id: 'u1' } } })

    const result = await getSession()

    expect(mocks.getSession).toHaveBeenCalledWith('hr')
    expect(result.kind).toBe('completed')
  })

  it('oidc 模式：getSession 不带 mock 角色', async () => {
    const { getSession } = await loadAuth('oidc')
    mocks.getSession.mockResolvedValue({ kind: 'completed', data: { user: { id: 'u1' } } })

    await getSession()

    expect(mocks.getSession).toHaveBeenCalledWith(undefined)
  })

  it('logout 始终清除 mock 角色（即使 oidc 登出失败也走 finally）', async () => {
    const { logout } = await loadAuth('oidc')
    sessionStorage.setItem(MOCK_ROLE_STORAGE_KEY, 'x')
    mocks.logout.mockRejectedValue(new Error('oidc down'))

    await expect(logout()).rejects.toThrow('oidc down')

    expect(sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY)).toBeNull()
  })

  it('mock 模式：logout 不调用 identityApi.logout 但清除角色', async () => {
    const { logout } = await loadAuth('mock')
    sessionStorage.setItem(MOCK_ROLE_STORAGE_KEY, 'x')

    await logout()

    expect(mocks.logout).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY)).toBeNull()
  })
})
