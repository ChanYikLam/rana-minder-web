<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { authMode, startLogin } from '@/services/auth'
import { DEMO_ROLES } from '@/mock/auth'
import type { MockRole } from '@/mock/auth'
import { resolveLoginTarget, parseSameOriginRedirect } from './loginTarget'
import {
  ShieldCheck, Users, UserCog, Building2, ClipboardCheck, User, GraduationCap,
  LogIn, Compass,
} from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const session = useSessionViewStore()

const loggingIn = ref(false)
const loginError = ref<string | null>(null)
const selectedRole = ref('leader')

const roleIcons: Record<MockRole['role'], typeof ShieldCheck> = {
  super_admin: ShieldCheck,
  club_leader: Users,
  hr: UserCog,
  department_leader: Building2,
  interviewer: ClipboardCheck,
  member: User,
  applicant: GraduationCap,
}

const mockRoles = DEMO_ROLES.map((r) => ({ ...r, icon: roleIcons[r.role] }))

function resolveTargetAfterLogin(): string {
  return resolveLoginTarget({
    workspace: session.workspace,
    hasPermission: (permission) => session.hasPermission(permission),
    requestedRedirect: parseSameOriginRedirect(route.query.redirect),
    needsProfileGate: session.needsProfileGate,
  })
}

onMounted(async () => {
  await session.loadSession()
  if (session.isAuthenticated) {
    await router.replace(resolveTargetAfterLogin())
  }
})

async function handleLogin() {
  if (loggingIn.value || authMode === 'disabled') return
  loggingIn.value = true
  loginError.value = null

  try {
    const result = await startLogin(parseSameOriginRedirect(route.query.redirect) ?? '/me', selectedRole.value)
    if (result === 'redirected') return
    if (result === 'disabled') {
      loginError.value = '统一认证尚未配置，当前无法登录'
      return
    }

    await session.loadSession()
    if (!session.isAuthenticated) {
      loginError.value = session.lastError || '登录失败，请稍后重试'
      return
    }

    await router.push(resolveTargetAfterLogin())
  } catch {
    // 兜底：优先透出会话层具体原因（如账号禁用），再退化为通用文案
    loginError.value = session.lastError || '登录失败，请稍后重试'
  } finally {
    loggingIn.value = false
  }
}
</script>

<template>
  <div>
    <div class="rounded-lg border border-border bg-elevated shadow-md p-8">
      <h2 class="text-lg font-semibold text-primary mb-1">登录</h2>
      <p class="text-sm text-text-secondary mb-6">使用学校统一身份认证（Casdoor）登录</p>

      <div v-if="authMode === 'mock'" class="mb-6">
        <p class="text-xs font-medium text-text-secondary mb-2">选择登录身份（Mock 演示）</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="role in mockRoles"
            :key="role.key"
            class="flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors"
            :class="selectedRole === role.key
              ? 'border-primary bg-primary-subtle'
              : 'border-border hover:border-border-strong'"
            @click="selectedRole = role.key"
          >
            <component
              :is="role.icon"
              :size="16"
              :class="selectedRole === role.key ? 'text-primary' : 'text-text-secondary'"
            />
            <div class="min-w-0">
              <p class="text-xs font-medium" :class="selectedRole === role.key ? 'text-primary' : 'text-text-primary'">{{ role.label }}</p>
              <p class="text-xs text-text-secondary truncate">{{ role.desc }}</p>
            </div>
            <span
              v-if="role.badge"
              class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="selectedRole === role.key ? 'bg-primary text-text-on-primary' : 'bg-background-subtle text-text-secondary'"
            >{{ role.badge }}</span>
          </button>
        </div>
      </div>

      <p v-if="authMode === 'disabled'" class="mb-6 rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-warning" role="alert">
        统一认证尚未配置，当前无法登录。
      </p>

      <button
        class="w-full h-12 flex items-center justify-center gap-2 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary"
        :disabled="loggingIn || authMode === 'disabled'"
        :aria-busy="loggingIn"
        @click="handleLogin"
      >
        <span
          v-if="loggingIn"
          class="w-4 h-4 border-2 border-text-on-primary border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        <LogIn v-else :size="18" aria-hidden="true" />
        {{ loggingIn ? '正在登录...' : authMode === 'disabled' ? '统一认证未配置' : '使用统一身份认证登录' }}
      </button>

      <p v-if="loginError" class="mt-3 text-sm text-danger text-center" role="alert">
        {{ loginError }}
      </p>

      <div class="mt-6 pt-6 border-t border-border">
        <p class="text-xs text-text-secondary text-center mb-3">无需登录也可以</p>
        <router-link
          to="/explore"
          class="flex items-center justify-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Compass :size="14" />
          浏览公开社团与招新活动
        </router-link>
      </div>
    </div>

    <p class="mt-6 text-xs text-text-secondary text-center">
      登录即代表您同意学校的相关管理规定
    </p>
  </div>
</template>
