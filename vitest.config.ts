import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 统计口径：仅计入 mock/services/router/components/composables/lib/state/utils 源码。
      // 页面 .vue 源码（src/pages/**）不计入门槛：页面测试文件随 include: ['src/**/*.test.ts'] 运行，
      // 但大量薄壳页/大逻辑页（InterviewManagePage 738 行等）未做组件测试，纳入会拉低门槛且无法区分真实回归。
      // 高价值页面逻辑统一抽为纯函数并落位 src/lib/**（jointApplyLogic/exportFormat/recruitment-status），
      // 由 lib 下的 *.test.ts 覆盖并计入统计；页面组件只做少量关键交互测试（不计入）。
      // 另排除 src/components/ui/**（79 个 shadcn 包装组件，纯透传低价值）。
      include: [
        'src/mock/**',
        'src/services/**',
        'src/router/**',
        'src/components/**',
        'src/composables/**',
        'src/lib/**',
        'src/state/**',
        'src/utils/**',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/mock/index.ts',
        'src/mock/recruitment-api.ts',
        'src/router/index.ts',
        'src/components/ui/**',
      ],
      // 基线防倒退门槛（2026-08-07 实测 lines 56.1/stmts 52.4/funcs 53.5/branches 44.5）。
      // CI 已改为 test:coverage，此门槛在 PR 上强制拦截。
      thresholds: {
        statements: 48,
        functions: 49,
        branches: 40,
        lines: 51,
      },
    },
  },
})
