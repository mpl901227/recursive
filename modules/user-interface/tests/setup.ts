/**
 * 테스트 환경 설정 (안정성 개선 버전)
 * 모든 테스트 실행 전에 실행되는 글로벌 설정
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { TestTimeout } from './utils/test-helpers.js';

// 전역 테스트 타임아웃 관리자
let globalTestTimeout: TestTimeout;

// DOM 환경 설정
beforeAll(() => {
  // JSDOM 환경에서 누락된 API들을 모킹
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // ResizeObserver 모킹
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // IntersectionObserver 모킹
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // WebSocket 모킹
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 0, // CONNECTING
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  }));
  
  // 정적 속성 추가
  (MockWebSocket as any).CONNECTING = 0;
  (MockWebSocket as any).OPEN = 1;
  (MockWebSocket as any).CLOSING = 2;
  (MockWebSocket as any).CLOSED = 3;
  
  global.WebSocket = MockWebSocket as any;

  // fetch 모킹 (기본적으로 성공 응답)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
  } as Response);

  // localStorage/sessionStorage 모킹
  const createStorageMock = () => {
    const storage = new Map<string, string>();
    return {
      getItem: vi.fn((key: string) => storage.get(key) || null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
      get length() { return storage.size; },
      key: vi.fn((index: number) => Array.from(storage.keys())[index] || null),
    };
  };

  Object.defineProperty(window, 'localStorage', {
    value: createStorageMock(),
  });

  Object.defineProperty(window, 'sessionStorage', {
    value: createStorageMock(),
  });

  // URL 모킹
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost:3001/',
      origin: 'http://localhost:3001',
      pathname: '/',
      search: '',
      hash: '',
      host: 'localhost:3001',
      hostname: 'localhost',
      port: '3001',
      protocol: 'http:',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    },
    writable: true,
  });

  // 콘솔 메서드 모킹 (테스트 출력 정리)
  const originalConsole = { ...console };
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  // 원본 콘솔을 복원할 수 있도록 저장
  (global as any).__originalConsole = originalConsole;
});

// 각 테스트 전에 실행
beforeEach(() => {
  // DOM 초기화
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // 전역 테스트 타임아웃 관리자 생성
  globalTestTimeout = new TestTimeout();
  
  // 실제 타이머 사용 (fake 타이머는 무한 대기 문제 야기)
  vi.useRealTimers();
  
  // 모든 모킹 클리어
  vi.clearAllMocks();
});

// 각 테스트 후에 실행
afterEach(async () => {
  // 타이머 정리
  if (globalTestTimeout) {
    globalTestTimeout.cleanup();
  }
  
  // 이벤트 리스너 정리
  document.removeEventListener = vi.fn();
  window.removeEventListener = vi.fn();
  
  // 타이머 정리 및 복원
  vi.useRealTimers();
  
  // 모든 비동기 작업 완료 대기
  await new Promise(resolve => setTimeout(resolve, 10));
});

// 모든 테스트 완료 후 실행
afterAll(() => {
  // 콘솔 복원
  if ((global as any).__originalConsole) {
    global.console = (global as any).__originalConsole;
  }
  
  // 모든 모킹 복원
  vi.restoreAllMocks();
}); 