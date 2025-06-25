// ========================================
// Recursive v2 - 메인 앱 진입점 (단순화)
// ========================================

import './styles/globals.scss';
import { App } from './app.ts';
import type { AppConfig } from './types/index.ts';
import './utils/logger.ts'; // 브라우저 콘솔 로거 초기화

// 전역 타입 확장
declare global {
  interface Window {
    __RECURSIVE_V2_APP__?: App;
    __APP_CONFIG__?: Partial<AppConfig>;
  }
}

// 기본 설정
const defaultConfig: AppConfig = {
  theme: 'light',
  apiBaseUrl: '/api',
  wsUrl: 'ws://localhost:3001',
  logLevel: 'info',
  debug: true,
  version: 'v1.0.0',
  gitHash: 'main'
};

// MCP 도구 등록
async function registerMCPTools() {
  try {
    // MCP 도구들을 전역에서 사용할 수 있도록 등록
    (window as any).mcpTools = {
      get_recent_errors: async (params: any) => {
        try {
          // 실제 환경에서는 MCP 서버를 통해 로그를 가져옴
          // 개발 환경에서는 시뮬레이션된 에러 로그 반환
          const errorLogs = [];
          
          // 브라우저 콘솔 에러 체크
          const consoleLogs = (console as any)._logs || [];
          const recentErrors = consoleLogs
            .filter((log: any) => log.level === 'error' && 
              Date.now() - log.timestamp < (params.minutes || 30) * 60 * 1000)
            .slice(0, params.limit || 20);
          
          for (const error of recentErrors) {
            errorLogs.push({
              timestamp: new Date(error.timestamp).toISOString(),
              source: 'browser-console',
              message: error.message || 'Unknown error',
              error_type: 'ConsoleError',
              metadata: error.metadata || {}
            });
          }
          
          // 네트워크 에러 시뮬레이션
          if (errorLogs.length === 0) {
            errorLogs.push({
              timestamp: new Date().toISOString(),
              source: 'network-monitor',
              message: 'Simulated network connectivity check',
              error_type: 'NetworkError',
              metadata: { 
                type: 'simulation',
                online: navigator.onLine,
                connection: (navigator as any).connection?.effectiveType || 'unknown'
              }
            });
          }
          
          return {
            success: true,
            recent_errors: errorLogs,
            count: errorLogs.length
          };
          
        } catch (error) {
          console.error('MCP get_recent_errors 실패:', error);
          return { success: false, recent_errors: [], count: 0 };
        }
      },
      
      get_recent_logs: async (params: any) => {
        try {
          const logs = [];
          const now = Date.now();
          const timeRange = (params.minutes || 10) * 60 * 1000;
          
          // 성능 메트릭 로그
          if (window.performance && (window.performance as any).memory) {
            const memory = (window.performance as any).memory;
            logs.push({
              id: `perf_${now}`,
              timestamp: new Date().toISOString(),
              level: 'INFO',
              source: 'performance-monitor',
              message: `Memory: ${Math.round(memory.usedJSHeapSize/1024/1024)}MB used`,
              metadata: {
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize
              }
            });
          }
          
          // 사용자 상호작용 로그
          const interactions = ['click', 'scroll', 'keypress', 'resize'];
          for (let i = 0; i < Math.min(params.limit || 10, 20); i++) {
            const randomTime = now - Math.random() * timeRange;
            logs.push({
              id: `ui_${randomTime}_${i}`,
              timestamp: new Date(randomTime).toISOString(),
              level: params.levels ? params.levels[Math.floor(Math.random() * params.levels.length)] : 'INFO',
              source: 'ui-interaction',
              message: `User ${interactions[Math.floor(Math.random() * interactions.length)]} event detected`,
              metadata: {
                event_type: interactions[Math.floor(Math.random() * interactions.length)],
                timestamp: randomTime
              }
            });
          }
          
          return {
            success: true,
            logs: logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
            count: logs.length
          };
          
        } catch (error) {
          console.error('MCP get_recent_logs 실패:', error);
          return { success: false, logs: [], count: 0 };
        }
      }
    };
    
    // 로그 시스템 연결 테스트 함수 추가
    (window as any).testLogSystem = async () => {
      console.log('🔍 로그 시스템 연결 테스트 중...');
      
      try {
        const response = await fetch('/log-rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'ping',
            id: 1
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ 로그 시스템 연결 성공:', data);
          return data;
        } else {
          console.error('❌ 로그 시스템 연결 실패:', response.status, response.statusText);
          return null;
        }
      } catch (error) {
        console.error('❌ 로그 시스템 연결 오류:', error);
        return null;
      }
    };
    
    // 실제 로그 조회 테스트 함수
    (window as any).testLogQuery = async () => {
      console.log('📊 로그 조회 테스트 중...');
      
      try {
        const response = await fetch('/log-rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'query',
            params: {
              limit: 10,
              since: '1h'
            },
            id: 2
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ 로그 조회 성공:', data);
          return data;
        } else {
          console.error('❌ 로그 조회 실패:', response.status, response.statusText);
          return null;
        }
      } catch (error) {
        console.error('❌ 로그 조회 오류:', error);
        return null;
      }
    };
    
    console.log('MCP 도구 등록 완료');
    console.log('💡 브라우저 콘솔에서 다음 함수들을 사용할 수 있습니다:');
    console.log('  - window.testLogSystem() : 로그 시스템 연결 테스트');
    console.log('  - window.testLogQuery() : 로그 조회 테스트');
    
  } catch (error) {
    console.warn('MCP 도구 등록 실패:', error);
  }
}

// 앱 초기화
async function initializeApp() {
  try {
    // 사용자 설정과 기본 설정을 병합
    const config: AppConfig = {
      ...defaultConfig,
      ...window.__APP_CONFIG__
    };

    // 앱 인스턴스 생성 및 초기화
    const app = new App(config);
    
    // 전역 객체에 앱 인스턴스 저장 (디버깅용 및 컴포넌트 통신용)
    window.__RECURSIVE_V2_APP__ = app;
    (window as any).recursiveApp = app;

    // 앱 초기화 전에 로딩 화면 표시
    showLoadingScreen();
    
    // 앱 초기화
    await app.initialize();
    
    // 초기화 완료 후 앱 표시
    await showApp();
    
    console.log('✅ 애플리케이션이 성공적으로 시작되었습니다.');
    
  } catch (error) {
    console.error('❌ 애플리케이션 초기화 실패:', error);
    showErrorScreen(error);
  }
}

// 로딩 화면 표시
function showLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.style.display = 'flex';
    loadingScreen.style.opacity = '1';
  }
}

// 앱 표시
async function showApp() {
  const loadingScreen = document.getElementById('loadingScreen');
  const appElement = document.getElementById('app');
  
  // 로딩 화면 페이드 아웃
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 300));
    loadingScreen.style.display = 'none';
  }
  
  // 앱 페이드 인
  if (appElement) {
    appElement.classList.add('ready');
    appElement.style.display = 'block';
    appElement.style.opacity = '0';
    
    // DOM 업데이트를 위한 짧은 대기
    await new Promise(resolve => setTimeout(resolve, 50));
    
    appElement.style.opacity = '1';
  }
}

// 에러 화면 표시
function showErrorScreen(error: unknown) {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.style.display = 'none';
  }

  document.body.innerHTML = `
    <div class="error-screen">
      <h1>앱 시작 실패</h1>
      <p>애플리케이션을 시작하는 중 오류가 발생했습니다.</p>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
      <button onclick="location.reload()">새로고침</button>
    </div>
  `;
}

// DOM이 준비되면 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  registerMCPTools().then(() => {
    initializeApp();
  });
});

// 개발용 전역 함수
if (import.meta.env.DEV) {
  (window as any).getApp = () => window.__RECURSIVE_V2_APP__;
  (window as any).reloadApp = async () => {
    if (window.__RECURSIVE_V2_APP__) {
      await window.__RECURSIVE_V2_APP__.destroy();
    }
    location.reload();
  };
} 