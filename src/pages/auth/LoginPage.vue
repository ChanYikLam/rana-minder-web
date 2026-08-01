<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { authMode, startLogin } from '@/services/auth'
import { LogIn, Compass, ShieldCheck, Users, UserCog, ClipboardCheck, User, GraduationCap } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const session = useSessionViewStore()

const loggingIn = ref(false)
const loginError = ref<string | null>(null)
const selectedRole = ref('leader')

const mockRoles = [
  { key: 'admin', label: '超级管理员', desc: '平台全局管理', icon: ShieldCheck },
  { key: 'leader', label: '社团负责人', desc: '社团管理全部功能', icon: Users },
  { key: 'hr', label: '人事', desc: '招新与成员管理', icon: UserCog },
  { key: 'interviewer', label: '面试官', desc: '面试评价', icon: ClipboardCheck },
  { key: 'member', label: '普通成员', desc: '查看本人信息', icon: User },
  { key: 'applicant', label: '申请人', desc: '报名与查看邀请', icon: GraduationCap },
]

function getRedirect(): string {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) return '/me'

  try {
    const target = new URL(redirect, window.location.origin)
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/me'
  } catch {
    return '/me'
  }
}

async function handleLogin() {
  if (loggingIn.value || authMode === 'disabled') return
  loggingIn.value = true
  loginError.value = null

  try {
    const result = await startLogin(getRedirect(), selectedRole.value)
    if (result === 'redirected') return
    if (result === 'disabled') {
      loginError.value = '统一认证尚未配置，当前无法登录'
      return
    }

    await session.loadSession()
    if (!session.isAuthenticated) {
      loginError.value = '登录失败，请稍后重试'
      return
    }

    await router.push(getRedirect())
  } catch {
    loginError.value = '登录失败，请稍后重试'
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
