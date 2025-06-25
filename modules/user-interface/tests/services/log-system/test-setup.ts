/**
 * Log System Test Setup
 * log-system 테스트를 위한 최소한의 설정
 */

import { vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// 🌐 필수 모킹 설정
// =============================================================================

/**
 * fetch API 모킹 (JSON-RPC 통신용)
 */
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * WebSocket 모킹 (실시간 로그 스트림용)
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send = vi.fn();
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
}

global.WebSocket = MockWebSocket as any;

/**
 * Console 출력 억제 (테스트 로그 정리)
 */
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

// =============================================================================
// 🧹 테스트 정리 설정
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockClear();
});

afterEach(async () => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  await new Promise(resolve => setTimeout(resolve, 0));
});

// =============================================================================
// 🛠️ 테스트 유틸리티
// =============================================================================

export { mockFetch, MockWebSocket };
