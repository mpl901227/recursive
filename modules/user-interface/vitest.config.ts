/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // 테스트 환경 설정
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    
    // 테스트 파일 패턴
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    
    // 커버리지 설정
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/setup.ts',
        'tests/mocks/',
        'src/types/',
        '**/*.d.ts',
        '**/*.config.*'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // 테스트 타임아웃을 매우 짧게 설정하여 무한 대기 방지
    testTimeout: 2000, // 2초로 단축
    hookTimeout: 1000, // 1초로 단축
    teardownTimeout: 500, // 0.5초로 단축
    
    // 병렬 실행 비활성화로 안정성 향상
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // 단일 프로세스로 실행
      }
    },
    
    // 재시도 비활성화 (무한 대기 시 빠른 실패)
    retry: 0,
    
    // 느린 테스트 감지 임계값
    slowTestThreshold: 1000,
    
    // 커버리지 제외 파일 패턴
    exclude: ['node_modules', 'dist'],
    
    // 메모리 누수 방지
    isolate: true,
    
    // 강제 종료 타임아웃
    bail: 1 // 첫 번째 실패 시 즉시 중단
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/components': resolve(__dirname, 'src/components'),
      '@/services': resolve(__dirname, 'src/services'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/types': resolve(__dirname, 'src/types'),
      '@/core': resolve(__dirname, 'src/core'),
      '@/tests': resolve(__dirname, 'tests')
    }
  }
}); 