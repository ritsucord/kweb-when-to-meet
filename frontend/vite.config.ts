import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // '@/components/ui/button'처럼 src 기준 절대 경로로 import한다 (shadcn/ui 규칙)
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // 컨테이너 밖(VS Code 포트 포워딩)에서도 접속되도록 모든 인터페이스에서 받는다.
    host: true,
    // 백엔드에 CORS 설정이 없으므로, 개발 중에는 /api 요청을 Vite가 백엔드(3000)로 넘겨준다.
    // 브라우저 입장에서는 같은 출처라 쿠키도 그대로 오간다.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    rollupOptions: {
      // 앱(index.html)과 디자인 시스템 문서(design-system.html)를 함께 빌드한다.
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        designSystem: path.resolve(import.meta.dirname, 'design-system.html'),
      },
    },
  },
})
