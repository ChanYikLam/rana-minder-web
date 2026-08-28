import type { ApiResult } from '@/types/contracts'
import type { SessionInfo } from '@/types/domain'
import { identityApi } from './modules'

export type AuthMode = 'mock' | 'oidc' | 'disabled'

type LoginResult = 'ready' | 'redirected' | 'disabled'

const MOCK_ROLE_STORAGE_KEY = 'ranaminder.mockRole'

/** 会话请求可选参数：mock 身份，或 OIDC 回调带来的授权码参数 */
export interface SessionRequestParams {
  mockUser?: string
  code?: string
  state?: string
}

function resolveAuthMode(): AuthMode {
  const mode = import.meta.env.VITE_AUTH_MODE
  return mode === 'oidc' || mode === 'disabled' ? mode : 'mock'
}

export const authMode = resolveAuthMode()

/** 拉取 Casdoor 登录跳转地址（契约：接口清单 §4 data.loginUrl） */
async function fetchOidcLoginUrl(): Promise<string> {
  const response = await fetch('/api/auth/casdoor/login-url', { credentials: 'include' })
  const body = (await response.json().catch(() => null)) as {
    data?: { loginUrl?: string }
    url?: string
  } | null
  const url = body?.data?.loginUrl ?? body?.url
  if (!response.ok || typeof url !== 'string' || url.length === 0) {
    throw new Error('OIDC_LOGIN_URL_UNAVAILABLE')
  }
  return url
}

export async function startLogin(redirect: string, mockRole?: string): Promise<LoginResult> {
  if (authMode === 'disabled') return 'disabled'

  if (authMode === 'mock') {
    if (mockRole) sessionStorage.setItem(MOCK_ROLE_STORAGE_KEY, mockRole)
    return 'ready'
  }

  // oidc：跳转地址由后端构造并携带服务端签发的 nonce/state；
  // redirect 落点不在授权 URL 中传递，回调后由前端同源校验解析。
  void redirect
  window.location.assign(await fetchOidcLoginUrl())
  return 'redirected'
}

export function getSession(params?: SessionRequestParams): Promise<ApiResult<SessionInfo>> {
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
  const sessionParams: SessionRequestParams = {
    ...(params?.code ? { code: params.code } : {}),
    ...(params?.state ? { state: params.state } : {}),
    ...(mockUser ?? params?.mockUser ? { mockUser: mockUser ?? params?.mockUser } : {}),
  }
  return identityApi.getSession(
    Object.keys(sessionParams).length > 0
      ? { code: sessionParams.code, state: sessionParams.state, mockUser: sessionParams.mockUser }
      : undefined,
  )
}

/**
 * 登出：清除本地会话并返回 Casdoor RP-initiated 登出地址（oidc 模式）。
 * 返回非空 endSessionUrl 时调用方应跳转该地址完成上游单点登出；
 * 失败/未配置时返回 null（本地登出已闭环）。
 */
export async function logout(): Promise<string | null> {
  try {
    if (authMode === 'oidc') {
      const result = await identityApi.logout()
      const endSessionUrl =
        result.kind === 'completed' && result.data ? (result.data.endSessionUrl ?? null) : null
      return endSessionUrl
    }
    return null
  } finally {
    sessionStorage.removeItem(MOCK_ROLE_STORAGE_KEY)
  }
}
