/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 认证模式：mock / oidc / disabled */
  readonly VITE_AUTH_MODE?: 'mock' | 'oidc' | 'disabled'
  /** API 基础路径，默认 /api */
  readonly VITE_API_BASE_URL?: string
  /** 浏览器内 Mock 开关：on / off */
  readonly VITE_USE_MOCK?: 'on' | 'off'
  /** 开发环境 Vite /api 代理目标 */
  readonly VITE_API_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
