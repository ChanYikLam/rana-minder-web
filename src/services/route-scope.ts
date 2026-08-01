import type { RouteLocationNormalizedLoaded } from 'vue-router'

export type ApiScope =
  | { kind: 'platform'; prefix: '/admin' }
  | { kind: 'workspace'; prefix: `/org/${string}`; clubId: string }

export function resolveApiScope(route: RouteLocationNormalizedLoaded): ApiScope | null {
  if (route.path.startsWith('/admin/')) {
    return { kind: 'platform', prefix: '/admin' }
  }

  const clubId = typeof route.params.clubId === 'string' ? route.params.clubId : null
  if (!clubId) return null
  return { kind: 'workspace', prefix: `/org/${clubId}`, clubId }
}
