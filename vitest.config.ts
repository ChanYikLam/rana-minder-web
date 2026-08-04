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
      include: ['src/mock/**', 'src/services/**', 'src/router/**', 'src/components/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/mock/index.ts',
        'src/mock/recruitment-api.ts',
        'src/router/index.ts',
        'src/router/guards.ts',
      ],
// 基线防倒退门槛（2026-08-04 实测 lines 24.4/stmts 22.4/funcs 19.8/branches 17.7）。
      // 实际覆盖集中在 mock/services 模块；随页面/composables 测试补齐后应上调。
      thresholds: {
        statements: 20,
        functions: 18,
        branches: 16,
        lines: 22,
      },
    },
  },
})
