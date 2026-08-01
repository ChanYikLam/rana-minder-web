import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteMockServe } from 'vite-plugin-mock'

// 使用标准 ESM import.meta.url 解析路径，避免引入 @types/node
const srcPath = new URL('./src', import.meta.url).pathname
// 在 Windows 上 pathname 以 /C:/ 开头，需要去掉开头的 /
const resolvedSrcPath = srcPath.startsWith('/') && /^\/[A-Za-z]:/.test(srcPath) ? srcPath.slice(1) : srcPath

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    viteMockServe({
      mockPath: 'src/mock',
      enable: true,
      logger: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolvedSrcPath,
    },
  },
})
