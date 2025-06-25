import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: '/',
  
  // 개발 서버 설정
  server: {
    port: 3003,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      },
      // 로그 시스템 프록시 추가
      '/log-rpc': {
        target: 'http://localhost:8888/rpc',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/log-rpc/, '')
      },
      '/log-ws': {
        target: 'ws://localhost:8888/ws',
        ws: true,
        rewrite: (path) => path.replace(/^\/log-ws/, '')
      }
    }
  },
  
  // 빌드 설정
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    target: 'es2020',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        manualChunks: {
          vendor: ['typescript'],
          ai: ['@recursive/ai-analysis'],
          logs: ['@recursive/log-system']
        }
      }
    }
  },
  
  // 경로 별칭
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/components': resolve(__dirname, 'src/components'),
      '@/services': resolve(__dirname, 'src/services'),
      '@/types': resolve(__dirname, 'src/types'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/styles': resolve(__dirname, 'src/styles')
    }
  },
  
  // CSS 설정
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // modern Sass API 사용
        additionalData: `@use "@/styles/variables" as *;`
      }
    }
  },
  
  // 환경 변수
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  }
}); 