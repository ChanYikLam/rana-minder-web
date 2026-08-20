import { post } from '@/services/client'

export type ReauthResult =
  | { kind: 'completed'; proof?: string }
  | { kind: 'rejected'; message: string }

/** 二次鉴权（P1-011 高风险命令门禁）：经 /auth/reauth 换取重认证 proof。
 * 抽离自 HighRiskConfirm，使通用组件不再直接依赖业务 IO；父级可自行替换实现（onReauth）。 */
export function useReauth() {
  async function reauth(password: string): Promise<ReauthResult> {
    const result = await post<{ proof?: string }>('/auth/reauth', { password })
    if (result.kind === 'completed') {
      return { kind: 'completed', proof: result.data?.proof }
    }
    if (result.kind === 'rejected' && result.error) {
      const fieldMsg = (result.error as { fieldErrors?: Record<string, string[]> }).fieldErrors?.password?.[0]
      return { kind: 'rejected', message: fieldMsg || (result.error as { message?: string }).message || '密码错误，请重试' }
    }
    return { kind: 'rejected', message: '验证失败，请稍后重试' }
  }

  return { reauth }
}