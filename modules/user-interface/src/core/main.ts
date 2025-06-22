/**
 * Recursive UI - Main Entry Point
 * TypeScript 모듈 시스템의 진입점 - 완전 수정본
 */

// 파일 로드 확인
console.log('🔥 main.ts 파일이 로드되었습니다!');

// 전역 타입 확장
declare global {
  interface Window {
    __APP_CONFIG__?: {
      version?: string;
      env?: string;
      apiBaseUrl?: string;
      wsUrl?: string;
    };
    __RECURSIVE_APP_INSTANCE__?: any; // 앱 인스턴스 추적용
    __RECURSIVE_INIT_STATE__?: 'idle' | 'initializing' | 'initialized' | 'error';
  }
  
  interface ImportMeta {
    hot?: {
      accept(): void;
      accept(deps: string | string[], callback?: () => void): void;
      dispose(callback: () => void): void;
      invalidate(): void;
    };
  }
}

// CSS 스타일 import - 통합된 스타일만 로드
import '../src/styles/globals.scss';

// TypeScript 애플리케이션 import
import { Application } from '../../src/core/app.ts';
import type { Config } from '../../src/types/index.ts';

// 전역 초기화 상태 추적 (더 강화된 방식)
let initializationPromise: Promise<void> | null = null;

/**
 * 앱 레이아웃 상태 관리 클래스
 */
class AppLayoutManager {
  private appMainElement: HTMLElement | null = null;
  
  constructor() {
    this.appMainElement = document.getElementById('appMain');
  }
  
  updateSidebarState(isOpen: boolean): void {
    if (!this.appMainElement) return;
    
    if (isOpen) {
      this.appMainElement.classList.remove('sidebar-closed');
    } else {
      this.appMainElement.classList.add('sidebar-closed');
    }
  }
  
  updateAISidebarState(isOpen: boolean): void {
    if (!this.appMainElement) return;
    
    if (isOpen) {
      this.appMainElement.classList.remove('ai-sidebar-closed');
    } else {
      this.appMainElement.classList.add('ai-sidebar-closed');
    }
  }
  
  updateBothSidebarsState(sidebarOpen: boolean, aiSidebarOpen: boolean): void {
    if (!this.appMainElement) return;
    
    this.appMainElement.classList.toggle('sidebar-closed', !sidebarOpen);
    this.appMainElement.classList.toggle('ai-sidebar-closed', !aiSidebarOpen);
    this.appMainElement.classList.toggle('both-closed', !sidebarOpen && !aiSidebarOpen);
  }
}

// 전역 레이아웃 매니저 인스턴스
const layoutManager = new AppLayoutManager();

/**
 * 기존 앱 인스턴스 정리
 */
async function cleanupExistingApp(): Promise<void> {
  if (window.__RECURSIVE_APP_INSTANCE__) {
    console.log('🧹 기존 앱 인스턴스 정리 중...');
    try {
      await window.__RECURSIVE_APP_INSTANCE__.destroy();
    } catch (error) {
      console.warn('⚠️ 기존 앱 정리 중 오류:', error);
    }
    window.__RECURSIVE_APP_INSTANCE__ = null;
  }
  
  // DOM 정리
  const componentElements = document.querySelectorAll('[data-component-initialized]');
  componentElements.forEach(element => {
    element.removeAttribute('data-component-initialized');
  });
  
  // 글로벌 이벤트 리스너 정리
  const existingListeners = document.querySelectorAll('[data-event-listeners]');
  existingListeners.forEach(element => {
    element.removeAttribute('data-event-listeners');
  });
  
  console.log('✅ 기존 앱 정리 완료');
}

/**
 * 애플리케이션 초기화 - 강화된 버전
 */
async function initializeApp(): Promise<void> {
  console.log('🔥 initializeApp 함수가 호출되었습니다!');
  
  // 이미 초기화 중이면 기존 Promise 반환
  if (initializationPromise) {
    console.log('⚠️ 이미 초기화 중입니다. 기존 Promise를 반환합니다.');
    return initializationPromise;
  }
  
  // 초기화 상태 확인
  if (window.__RECURSIVE_INIT_STATE__ === 'initialized') {
    console.log('✅ 이미 초기화 완료됨');
    return;
  }
  
  if (window.__RECURSIVE_INIT_STATE__ === 'initializing') {
    console.log('⚠️ 초기화 진행 중...');
    return;
  }
  
  // 초기화 Promise 생성
  initializationPromise = performInitialization();
  
  try {
    await initializationPromise;
    console.log('✅ 애플리케이션 초기화 완료');
  } catch (error) {
    console.error('❌ 애플리케이션 초기화 실패:', error);
    throw error;
  } finally {
    initializationPromise = null;
  }
}

/**
 * 실제 초기화 작업 수행
 */
async function performInitialization(): Promise<void> {
  window.__RECURSIVE_INIT_STATE__ = 'initializing';
  
  // DOM 요소들 확인
  const requiredElements = {
    app: document.getElementById('app'),
    header: document.getElementById('header'),
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('mainContent'),
    aiSidebar: document.getElementById('aiSidebar'),
    appMain: document.getElementById('appMain'),
    sidebarOverlay: document.getElementById('sidebarOverlay')
  };
  
  console.log('🔍 DOM 요소들 확인:');
  Object.entries(requiredElements).forEach(([key, element]) => {
    console.log(`- ${key}:`, element ? '✅' : '❌');
  });
  
  // 필수 요소 검증
  const missingElements = Object.entries(requiredElements)
    .filter(([_, element]) => !element)
    .map(([key]) => key);
  
  if (missingElements.length > 0) {
    throw new Error(`필수 DOM 요소가 없습니다: ${missingElements.join(', ')}`);
  }
  
  try {
    console.log('🚀 Recursive UI 초기화 시작...');
    
    // 기존 인스턴스 정리
    await cleanupExistingApp();
    
    // 환경 설정
    const config = createAppConfig();
    
    // 애플리케이션 인스턴스 생성 (새 인스턴스 강제 생성)
    const app = Application.createInstance({
      config,
      autoStart: false,
      debug: true,
      rootElement: '#app'
    });
    
    // 전역 참조 저장
    window.__RECURSIVE_APP_INSTANCE__ = app;
    
    // 레이아웃 이벤트 리스너 설정
    setupLayoutEventListeners(app);
    
    // 애플리케이션 초기화
    console.log('🔧 애플리케이션 초기화 중...');
    await app.initialize();
    
    // 애플리케이션 시작
    console.log('🚀 app.start() 호출 전...');
    await app.start();
    console.log('✅ app.start() 완료!');
    
    // UI 표시
    hideLoadingScreen();
    showApp();
    
    // 상태 업데이트
    window.__RECURSIVE_INIT_STATE__ = 'initialized';
    
    console.log('✅ Recursive UI 초기화 완료');
    console.log('📊 애플리케이션 상태:', app.getState());
    
    // 서비스 등록 확인
    const serviceRegistry = app.getServiceRegistry();
    const registeredServices = serviceRegistry.getAll();
    console.log('🔧 등록된 서비스:', Array.from(registeredServices.keys()));
    
  } catch (error) {
    window.__RECURSIVE_INIT_STATE__ = 'error';
    console.error('❌ 애플리케이션 초기화 실패:', error);
    showErrorScreen(error as Error);
    throw error;
  }
}

/**
 * 앱 설정 생성
 */
function createAppConfig(): Partial<Config> {
  return {
    app: {
      name: 'Recursive UI',
      version: window.__APP_CONFIG__?.version || '2.0.0',
      environment: (window.__APP_CONFIG__?.env as 'development' | 'production' | 'test') || 'development',
      debug: true,
      locale: 'ko',
      theme: 'auto'
    },
    api: {
      baseURL: window.__APP_CONFIG__?.apiBaseUrl || '/api',
      version: 'v1',
      timeout: 30000,
      enabled: true,
      autoStart: true,
      retryCount: 3,
      headers: {
        'Content-Type': 'application/json'
      },
      interceptors: {
        useRequestInterceptor: true,
        useResponseInterceptor: true,
        useErrorInterceptor: true
      }
    },
    websocket: {
      url: window.__APP_CONFIG__?.wsUrl || 'ws://localhost:3000/ws',
      enabled: true,
      autoStart: true,
      retryCount: 5,
      timeout: 30000,
      heartbeatInterval: 30000,
      reconnect: {
        enabled: true,
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 1.5
      },
      messageQueue: {
        maxSize: 100,
        usePriority: true,
        messageTTL: 60000
      }
    },
    mcp: {
      serverUrl: '/mcp',
      clientId: 'recursive-ui',
      enabled: true,
      autoStart: true,
      retryCount: 3,
      timeout: 30000,
      requestQueue: {
        maxConcurrent: 10,
        requestInterval: 100,
        batchSize: 5,
        usePriority: true
      },
      tools: {
        autoLoad: true,
        toolTimeout: 30000
      }
    },
    ui: {
      theme: 'auto',
      locale: 'ko',
      animations: true,
      accessibility: false,
      layout: {
        sidebarWidth: 280,
        headerHeight: 60,
        aiSidebarWidth: 320,
        breakpoints: {
          mobile: 768,
          tablet: 1024,
          desktop: 1440
        }
      },
      components: {
        modal: {
          closeOnBackdrop: true,
          closeOnEscape: true,
          trapFocus: true
        },
        toast: {
          duration: 5000,
          maxToasts: 5,
          position: 'top-right'
        },
        loader: {
          type: 'spinner',
          size: 'medium',
          color: '#007acc'
        }
      }
    },
    logging: {
      level: 'info',
      console: true,
      remote: false,
      format: 'structured',
      filters: []
    }
  };
}

/**
 * 레이아웃 이벤트 리스너 설정
 */
function setupLayoutEventListeners(app: any): void {
  const eventManager = app.getEventManager();
  
  // 사이드바 토글 이벤트
  eventManager.on('sidebar:toggled', (data: any) => {
    console.log('📡 Layout: sidebar:toggled 이벤트 수신:', data);
    layoutManager.updateSidebarState(data.isOpen);
  });
  
  // AI 사이드바 토글 이벤트
  eventManager.on('ai-sidebar:toggled', (data: any) => {
    console.log('📡 Layout: ai-sidebar:toggled 이벤트 수신:', data);
    layoutManager.updateAISidebarState(data.isOpen);
  });
  
  // 모바일 오버레이 처리
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      eventManager.emit('sidebar:close');
      eventManager.emit('ai-sidebar:close');
    });
  }
  
  console.log('🔗 레이아웃 이벤트 리스너 설정 완료');
}

/**
 * 로딩 화면 숨기기
 */
function hideLoadingScreen(): void {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 500);
  }
}

/**
 * 앱 표시
 */
function showApp(): void {
  const app = document.getElementById('app');
  if (app) {
    app.classList.add('ready');
    app.style.display = 'flex';
  }
}

/**
 * 에러 화면 표시
 */
function showErrorScreen(error: Error): void {
  const loadingScreen = document.getElementById('loadingScreen');
  const errorBoundary = document.getElementById('errorBoundary');
  
  if (loadingScreen) {
    loadingScreen.style.display = 'none';
  }
  
  if (errorBoundary) {
    const errorContent = errorBoundary.querySelector('.error-content');
    if (errorContent) {
      errorContent.innerHTML = `
        <h2>앗! 문제가 발생했습니다.</h2>
        <p>애플리케이션 초기화 중 오류가 발생했습니다:</p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0; overflow-x: auto; text-align: left; max-width: 100%; word-wrap: break-word;">
${error.message}
${error.stack ? '\n\n' + error.stack : ''}
        </pre>
        <div style="margin-top: 1rem;">
          <button onclick="window.location.reload()" style="
            background: #007acc; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
          ">새로고침</button>
          <button onclick="this.parentElement.parentElement.parentElement.style.display='none'" style="
            background: #6b7280; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 14px;
          ">닫기</button>
        </div>
      `;
    }
    errorBoundary.style.display = 'flex';
    errorBoundary.style.position = 'fixed';
    errorBoundary.style.top = '0';
    errorBoundary.style.left = '0';
    errorBoundary.style.width = '100%';
    errorBoundary.style.height = '100%';
    errorBoundary.style.background = 'rgba(0, 0, 0, 0.8)';
    errorBoundary.style.alignItems = 'center';
    errorBoundary.style.justifyContent = 'center';
    errorBoundary.style.zIndex = '9999';
  }
}

/**
 * 전역 에러 핸들러 - 개선된 버전
 */
window.addEventListener('error', (event) => {
  console.error('전역 에러:', event.error);
  
  // 초기화 중이 아닐 때만 에러 화면 표시
  if (window.__RECURSIVE_INIT_STATE__ !== 'initializing') {
    showErrorScreen(event.error || new Error('알 수 없는 오류'));
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('처리되지 않은 Promise 거부:', event.reason);
  
  // 초기화 중이 아닐 때만 에러 화면 표시
  if (window.__RECURSIVE_INIT_STATE__ !== 'initializing') {
    showErrorScreen(new Error(`Promise 거부: ${event.reason}`));
  }
});

/**
 * DOM 로드 완료 시 애플리케이션 시작
 */
console.log('🔥 DOM readyState:', document.readyState);

// 초기화 상태 초기화
window.__RECURSIVE_INIT_STATE__ = 'idle';

if (document.readyState === 'loading') {
  console.log('🔥 DOM이 로딩 중입니다. DOMContentLoaded 이벤트를 기다립니다.');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🔥 DOMContentLoaded 이벤트 발생!');
    initializeApp().catch(error => {
      console.error('❌ 초기화 실패:', error);
    });
  });
} else {
  console.log('🔥 DOM이 이미 로드되었습니다. 즉시 앱을 초기화합니다.');
  initializeApp().catch(error => {
    console.error('❌ 초기화 실패:', error);
  });
}

// 개발 모드에서 HMR 지원
if (import.meta.hot) {
  import.meta.hot.accept();
  
  // HMR 시 기존 인스턴스 정리
  import.meta.hot.dispose(() => {
    if (window.__RECURSIVE_APP_INSTANCE__) {
      console.log('🔥 HMR: 기존 앱 인스턴스 정리');
      window.__RECURSIVE_APP_INSTANCE__.destroy();
      window.__RECURSIVE_APP_INSTANCE__ = null;
      window.__RECURSIVE_INIT_STATE__ = 'idle';
    }
  });
}

// 디버깅을 위한 전역 함수 노출 (개발 모드)
if (window.__APP_CONFIG__?.env === 'development') {
  (window as any).RecursiveDebug = {
    getApp: () => window.__RECURSIVE_APP_INSTANCE__,
    getInitState: () => window.__RECURSIVE_INIT_STATE__,
    reinitialize: () => {
      window.__RECURSIVE_INIT_STATE__ = 'idle';
      return initializeApp();
    },
    layoutManager
  };
}