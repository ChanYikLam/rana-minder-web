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
