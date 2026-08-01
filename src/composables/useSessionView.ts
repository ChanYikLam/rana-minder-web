import { computed } from 'vue'
import { useSessionViewStore } from '@/state/sessionViewStore'

export function useSessionView() {
  const store = useSessionViewStore()

  return {
    user: computed(() => store.user),
    isAuthenticated: computed(() => store.isAuthenticated),
    isProfileComplete: computed(() => store.isProfileComplete),
    needsProfileGate: computed(() => store.needsProfileGate),
    degraded: computed(() => store.degraded),
    loading: computed(() => store.loading),
    hasPermission: (permission: string) => store.hasPermission(permission),
    loadSession: () => store.loadSession(),
    clearSession: () => store.clearSession(),
  }
}
