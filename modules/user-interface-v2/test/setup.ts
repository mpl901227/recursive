// ====================================================
// User-Interface-V2 - 테스트 설정
// ====================================================

import { vi } from 'vitest';

// DOM 환경 설정
Object.defineProperty(window, 'location', {
  value: {
    hash: '',
    href: 'http://localhost:3000',
    pathname: '/',
    search: '',
    reload: vi.fn()
  },
  writable: true
});

// localStorage 모킹
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
});

// WebSocket 모킹
global.WebSocket = vi.fn(() => ({
  close: vi.fn(),
  send: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1,
  OPEN: 1,
  CLOSED: 3
})) as any;

// Console 메서드 모킹 (선택적)
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

// 환경 변수 설정
process.env.NODE_ENV = 'test'; 