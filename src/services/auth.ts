import type { ApiResult } from '@/types/contracts'
import type { SessionInfo } from '@/types/domain'
import { identityApi } from './modules'

export type AuthMode = 'mock' | 'oidc' | 'disabled'

type LoginResult = 'ready' | 'redirected' | 'disabled'

const MOCK_ROLE_STORAGE_KEY = 'ranaminder.mockRole'

function resolveAuthMode(): AuthMode {
  const mode = import.meta.env.VITE_AUTH_MODE
  return mode === 'oidc' || mode === 'disabled' ? mode : 'mock'
}

export const authMode = resolveAuthMode()

export async function startLogin(redirect: string, mockRole?: string): Promise<LoginResult> {
  if (authMode === 'disabled') return 'disabled'

  if (authMode === 'mock') {
    if (mockRole) sessionStorage.setItem(MOCK_ROLE_STORAGE_KEY, mockRole)
    return 'ready'
  }

  window.location.assign(`/api/auth/login?redirect=${encodeURIComponent(redirect)}`)
  return 'redirected'
}

export function getSession(): Promise<ApiResult<SessionInfo>> {
  if (authMode === 'disabled') {
    return Promise.resolve({
      kind: 'rejected',
      error: { code: 'AUTH-DISABLED', message: '统一认证尚未配置' },
    })
  }

  const mockUser = authMode === 'mock' ? sessionStorage.getItem(MOCK_ROLE_STORAGE_KEY) : null
  if (authMode === 'mock' && !mockUser) {
    return Promise.resolve({
      kind: 'rejected',
      error: { code: 'AUTH-MOCK-NOT-SELECTED', message: '请先选择 Mock 登录身份' },
    })
  }
  return identityApi.getSession(mockUser ?? undefined)
}

export async function logout(): Promise<void> {
  try {
    if (authMode === 'oidc') await identityApi.logout()
  } finally {
    sessionStorage.removeItem(MOCK_ROLE_STORAGE_KEY)
  }
}
