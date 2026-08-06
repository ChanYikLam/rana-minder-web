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
      // 基线防倒退门槛（2026-08-07 实测 lines 50.1/stmts 46.4/funcs 45.0/branches 38.5）。
      // 统计范围已扩至 composables/lib/state/utils；随页面测试补齐可继续上调。
      thresholds: {
        statements: 42,
        functions: 40,
        branches: 34,
        lines: 45,
      },
    },
  },
})
