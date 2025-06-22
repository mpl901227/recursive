import { defineConfig } from 'vite';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    root: 'public',
    publicDir: 'assets',
    
    build: {
      outDir: '../build',
      emptyOutDir: true,
      sourcemap: isProduction ? false : true,
      target: 'es2022',
      minify: isProduction ? 'terser' : false,
      
      // 🎯 Phase 5.2.1: Code Splitting 최적화
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'public/index.html'),
          app: resolve(__dirname, 'public/main.ts')
        },
        output: {
          // 🎯 Phase 5.2.2: 세분화된 번들 분리
          manualChunks: (id) => {
            // 🔸 Vendor 번들 (외부 라이브러리)
            if (id.includes('node_modules')) {
              if (id.includes('typescript')) {
                return 'vendor-typescript';
              }
              return 'vendor';
            }
            
            // 🔸 Core 시스템 번들
            if (id.includes('src/core/')) {
              return 'core';
            }
            
            // 🔸 Utils 번들
            if (id.includes('src/utils/')) {
              return 'utils';
            }
            
            // 🔸 Types 번들
            if (id.includes('src/types/')) {
              return 'types';
            }
            
            // 🔸 Styles 번들
            if (id.includes('src/styles/')) {
              return 'styles';
            }
            
            // 나머지는 자동 청크 분할 사용
            return undefined;
          },
          
          // 🎯 Phase 5.2.3: 파일명 최적화
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            }
            if (/woff2?|eot|ttf|otf/i.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            }
            if (/css/i.test(ext)) {
              return `assets/css/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          }
        }
      },
      
      // 🎯 Phase 5.2.4: Terser 최적화
      terserOptions: {
        compress: {
          drop_console: isProduction, // 프로덕션에서만 console 제거
          drop_debugger: true,
          dead_code: true,
          unused: true,
          // 🔧 Tree shaking 강화
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 2
        },
        mangle: {
          // 변수명 최적화
          safari10: true
        },
        format: {
          comments: false
        }
      },
      
      // 🎯 Phase 5.2.5: 에셋 최적화
      assetsInlineLimit: 4096, // 4KB 이하 파일은 인라인
      cssCodeSplit: true, // CSS 코드 분할
      
      // 🔧 빌드 성능 최적화
      reportCompressedSize: false, // 압축 크기 보고 비활성화 (빌드 속도 향상)
      
      // 🎯 Phase 5.2.6: 실험적 최적화
      experimental: {
        renderBuiltUrl: (filename, { hostType }) => {
          if (hostType === 'js') {
            return { js: `"/${filename}"` };
          }
          return { relative: true };
        }
      }
    },
    
    // 🎯 Phase 5.2.7: 개발 서버 최적화
    server: {
      port: 3001,
      host: true,
      open: false,
      hmr: {
        overlay: true
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        },
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          changeOrigin: true
        }
      }
    },
    
    preview: {
      port: 3002,
      host: true
    },
    
    // 🎯 Phase 5.2.8: 의존성 최적화
    optimizeDeps: {
      include: ['typescript'],
      exclude: [], // 제외할 의존성
      force: false // 강제 재최적화 비활성화
    },
    
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@/components': resolve(__dirname, 'src/components'),
        '@/services': resolve(__dirname, 'src/services'),
        '@/utils': resolve(__dirname, 'src/utils'),
        '@/types': resolve(__dirname, 'src/types'),
        '@/styles': resolve(__dirname, 'src/styles'),
        '@/core': resolve(__dirname, 'src/core')
      }
    },
    
    // 🎯 Phase 5.2.9: CSS 최적화
    css: {
      preprocessorOptions: {
        scss: {
          // additionalData 제거하여 중복 import 방지
          // 각 컴포넌트에서 필요에 따라 개별적으로 import
        }
      },
      postcss: {
        plugins: isProduction ? [
          // 프로덕션에서만 CSS 최적화 플러그인 적용
        ] : []
      },
      devSourcemap: !isProduction
    },
    
    // 🎯 Phase 5.2.10: 플러그인 설정
    plugins: [
      // 🔍 번들 분석기 (개발 모드에서만)
      !isProduction && visualizer({
        filename: 'build/bundle-analysis.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap' // 'treemap', 'sunburst', 'network'
      })
    ].filter(Boolean),
    
    // 🎯 Phase 5.2.11: 환경 변수 정의
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __DEV__: JSON.stringify(!isProduction),
      __PROD__: JSON.stringify(isProduction)
    },
    
    // 🎯 Phase 5.2.12: 로깅 설정
    logLevel: isProduction ? 'warn' : 'info',
    
    // 🔧 워커 설정
    worker: {
      format: 'es',
      plugins: () => []
    }
  };
}); 