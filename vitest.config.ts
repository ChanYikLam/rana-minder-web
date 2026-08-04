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
      thresholds: {
        statements: 20,
        functions: 18,
        branches: 16,
        lines: 22,
      },
    },
  },
})
