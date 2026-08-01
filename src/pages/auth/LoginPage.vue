<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { LogIn, Compass, AlertTriangle, ShieldCheck, Users, UserCog, ClipboardCheck, User, GraduationCap } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const session = useSessionViewStore()

const loggingIn = ref(false)
const loginError = ref<string | null>(null)
const degraded = ref(false)
const selectedRole = ref('leader')

const mockRoles = [
  { key: 'admin', label: '超级管理员', desc: '平台全局管理', icon: ShieldCheck },
  { key: 'leader', label: '社团负责人', desc: '社团管理全部功能', icon: Users },
  { key: 'hr', label: '人事', desc: '招新与成员管理', icon: UserCog },
  { key: 'interviewer', label: '面试官', desc: '面试评价', icon: ClipboardCheck },
  { key: 'member', label: '普通成员', desc: '查看本人信息', icon: User },
  { key: 'applicant', label: '申请人', desc: '报名与查看邀请', icon: GraduationCap },
]

async function handleLogin() {
  if (loggingIn.value) return
  loggingIn.value = true
  loginError.value = null
  degraded.value = false

  try {
    await session.loadSession(selectedRole.value)
    loggingIn.value = false

    if (!session.isAuthenticated) {
      degraded.value = true
      loginError.value = '统一认证服务暂时不可用，请稍后再试'
      return
    }

    const redirect = (route.query.redirect as string) || '/me'
    router.push(redirect)
  } catch {
    loginError.value = '登录失败，请稍后重试'
    loggingIn.value = false
  }
}
</script>

<template>
  <div>
    <!-- 降级提示 -->
    <div
      v-if="degraded"
      class="mb-4 flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-3"
      role="alert"
    >
      <AlertTriangle :size="16" class="text-warning mt-0.5 shrink-0" />
      <div class="text-sm text-warning">
        <p class="font-medium">认证服务暂时不可用</p>
        <p class="text-xs mt-0.5">您可以先浏览公开内容，待服务恢复后再登录</p>
      </div>
    </div>

    <div class="rounded-lg border border-border bg-elevated shadow-md p-8">
      <h2 class="text-lg font-semibold text-primary mb-1">登录</h2>
      <p class="text-sm text-text-secondary mb-6">使用学校统一身份认证（Casdoor）登录</p>

      <!-- Mock 角色选择器 -->
      <div class="mb-6">
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

      <button
        class="w-full h-12 flex items-center justify-center gap-2 rounded-md bg-primary text-text-on-primary font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary"
        :disabled="loggingIn"
        :aria-busy="loggingIn"
        @click="handleLogin"
      >
        <span
          v-if="loggingIn"
          class="w-4 h-4 border-2 border-text-on-primary border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        <LogIn v-else :size="18" aria-hidden="true" />
        {{ loggingIn ? '正在登录...' : '使用统一身份认证登录' }}
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
