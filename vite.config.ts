import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { localMockPlugin } from './mock-plugin'

// https://vite.dev/config/
// 联调说明：
// - 默认（不配置任何环境变量）行为与原先一致：本地 mock 插件拦截全部 /api 请求；
// - 在 .env.development.local 中设置 VITE_USE_MOCK=off 后，mock 插件不注册，
//   /api 经下方 server.proxy 转发到真实后端（VITE_API_PROXY_TARGET，默认本机 3001）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useMock = env.VITE_USE_MOCK !== 'off'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001'

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(useMock ? [localMockPlugin()] : []),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          // 保持 Host 为前端 origin：Casdoor 回调 redirect_uri 以 localhost:5173 注册
          changeOrigin: false,
        },
      },
    },
    build: {
      target: ['chrome108', 'edge108', 'safari16', 'firefox116'],
    },
  }
})
