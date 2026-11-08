import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 백엔드에 CORS 설정이 없으므로, 개발 중에는 /api 요청을 Vite가 백엔드(3000)로 넘겨준다.
    // 브라우저 입장에서는 같은 출처(localhost:5173)로 보내는 것이라 쿠키도 그대로 오간다.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
