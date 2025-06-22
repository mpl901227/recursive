/**
 * 테스트 유틸리티 함수들
 */

import { vi } from 'vitest';

/**
 * Promise 기반 delay 함수
 */
export const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * 비동기 함수 대기 헬퍼
 */
export const waitFor = async (
  callback: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await callback()) {
      return;
    }
    await delay(interval);
  }
  
  throw new Error(`waitFor timeout after ${timeout}ms`);
};

/**
 * DOM 요소 생성 헬퍼
 */
export const createElement = (
  tag: string, 
  attributes: Record<string, string> = {},
  textContent?: string
): HTMLElement => {
  const element = document.createElement(tag);
  
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  if (textContent) {
    element.textContent = textContent;
  }
  
  return element;
};

/**
 * 이벤트 디스패치 헬퍼
 */
export const dispatchEvent = (
  element: Element,
  eventType: string,
  eventInit?: EventInit
): boolean => {
  const event = new Event(eventType, eventInit);
  return element.dispatchEvent(event);
};

/**
 * 커스텀 이벤트 디스패치 헬퍼
 */
export const dispatchCustomEvent = <T = any>(
  element: Element,
  eventType: string,
  detail?: T,
  eventInit?: CustomEventInit<T>
): boolean => {
  const event = new CustomEvent(eventType, { detail, ...eventInit });
  return element.dispatchEvent(event);
};

/**
 * WebSocket 모킹 헬퍼
 */
export const createMockWebSocket = () => {
  const mockWs = {
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    readyState: 0, // CONNECTING
    url: 'ws://localhost:8080',
    protocol: '',
    extensions: '',
    bufferedAmount: 0,
    binaryType: 'blob' as BinaryType,
    onopen: null as ((event: Event) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    CONNECTING: 0 as const,
    OPEN: 1 as const,
    CLOSING: 2 as const,
    CLOSED: 3 as const,
  };

  // 연결 시뮬레이션 메서드
  const simulateOpen = () => {
    mockWs.readyState = 1; // OPEN
    if (mockWs.onopen) {
      mockWs.onopen(new Event('open'));
    }
  };

  const simulateMessage = (data: any) => {
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data }));
    }
  };

  const simulateClose = (code = 1000, reason = '') => {
    mockWs.readyState = 3; // CLOSED
    if (mockWs.onclose) {
      mockWs.onclose(new CloseEvent('close', { code, reason }));
    }
  };

  const simulateError = () => {
    if (mockWs.onerror) {
      mockWs.onerror(new Event('error'));
    }
  };

  return {
    mockWs,
    simulateOpen,
    simulateMessage,
    simulateClose,
    simulateError,
  };
};

/**
 * 로컬 스토리지 모킹 헬퍼
 */
export const createMockStorage = () => {
  const storage = new Map<string, string>();
  
  return {
    getItem: vi.fn((key: string) => storage.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
    get length() {
      return storage.size;
    },
    key: vi.fn((index: number) => {
      const keys = Array.from(storage.keys());
      return keys[index] || null;
    }),
    // 테스트용 헬퍼
    __getStorage: () => storage,
  };
};

/**
 * 이벤트 매니저 모킹 헬퍼
 */
export const createMockEventManager = () => {
  const listeners = new Map<string, Function[]>();
  
  return {
    on: vi.fn((event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);
    }),
    off: vi.fn((event: string, callback: Function) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach(callback => callback(...args));
      }
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    }),
    // 테스트용 헬퍼
    __getListeners: () => listeners,
  };
};

/**
 * 컴포넌트 테스트 래퍼
 */
export const renderComponent = (
  componentHtml: string,
  container?: HTMLElement
): HTMLElement => {
  const wrapper = container || document.createElement('div');
  wrapper.innerHTML = componentHtml;
  document.body.appendChild(wrapper);
  return wrapper;
};

/**
 * 컴포넌트 정리 헬퍼
 */
export const cleanup = (): void => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
};

/**
 * 테스트 타임아웃 관리자
 */
export class TestTimeout {
  private timeouts: NodeJS.Timeout[] = [];
  private intervals: NodeJS.Timeout[] = [];

  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timeout = setTimeout(callback, delay);
    this.timeouts.push(timeout);
    return timeout;
  }

  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    const interval = setInterval(callback, delay);
    this.intervals.push(interval);
    return interval;
  }

  cleanup(): void {
    this.timeouts.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timeouts = [];
    this.intervals = [];
  }
}

/**
 * 안전한 Promise 생성 (타임아웃 보장)
 */
export const createSafePromise = <T>(
  executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
  timeoutMs: number = 5000
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Promise timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    executor(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(value);
        }
      },
      (reason) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(reason);
        }
      }
    );
  });
};

/**
 * 조건 대기 (개선된 waitFor)
 */
export const waitForCondition = async (
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> => {
  const { timeout = 1000, interval = 10, message = 'Condition timeout' } = options;
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = Math.ceil(timeout / interval);
  
  while (attempts < maxAttempts && Date.now() - startTime < timeout) {
    try {
      // 각 조건 체크에 짧은 타임아웃 적용하여 무한 대기 방지
      const result = await Promise.race([
        Promise.resolve(condition()),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Single check timeout')), 50)
        )
      ]);
      
      if (result) {
        return;
      }
    } catch (error) {
      // 조건 확인 중 에러 발생해도 계속 시도
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  throw new Error(`${message} after ${timeout}ms (${attempts} attempts)`);
};

/**
 * 이벤트 대기 헬퍼
 */
export const waitForEvent = <T = any>(
  eventManager: { on: (event: string, callback: (data: T) => void) => () => void },
  eventName: string,
  timeout: number = 1000
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;
    
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    // 타임아웃 설정
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Event '${eventName}' not received within ${timeout}ms`));
    }, timeout);
    
    // 이벤트 리스너 등록
    try {
      unsubscribe = eventManager.on(eventName, (data: T) => {
        cleanup();
        resolve(data);
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};

/**
 * 여러 이벤트 동시 대기
 */
export const waitForMultipleEvents = async (
  eventManager: { on: (event: string, callback: (data: any) => void) => () => void },
  eventNames: string[],
  timeout: number = 1000
): Promise<any[]> => {
  // 각 이벤트에 대해 개별 타임아웃 적용
  const promises = eventNames.map(eventName => 
    waitForEvent(eventManager, eventName, timeout)
  );
  
  // Promise.race로 하나라도 실패하면 즉시 실패
  return Promise.race([
    Promise.all(promises),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Multiple events timeout after ${timeout}ms`)), timeout + 100)
    )
  ]);
};

/**
 * 안전한 MockWebSocket (기존 개선)
 */
export const createSafeMockWebSocket = () => {
  class SafeMockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = SafeMockWebSocket.CONNECTING;
    url = '';
    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    public destroyed = false;
    protocol = '';
    extensions = '';
    bufferedAmount = 0;
    binaryType = 'blob' as BinaryType;
    CONNECTING = 0 as const;
    OPEN = 1 as const;
    CLOSING = 2 as const;
    CLOSED = 3 as const;

    constructor(url: string, autoConnect = true) {
      this.url = url;
      
      if (autoConnect) {
        // 즉시 연결하지 않고 다음 틱에 연결
        Promise.resolve().then(() => {
          if (!this.destroyed) {
            this.simulateOpen();
          }
        });
      }
    }

    simulateOpen(): void {
      if (this.destroyed) return;
      
      this.readyState = SafeMockWebSocket.OPEN;
      if (this.onopen) {
        // 안전한 비동기 실행
        Promise.resolve().then(() => {
          if (!this.destroyed && this.onopen) {
            this.onopen(new Event('open'));
          }
        });
      }
    }

    simulateMessage(data: any): void {
      if (this.destroyed || this.readyState !== SafeMockWebSocket.OPEN) return;
      
      if (this.onmessage) {
        Promise.resolve().then(() => {
          if (!this.destroyed && this.onmessage) {
            this.onmessage(new MessageEvent('message', { data }));
          }
        });
      }
    }

    simulateClose(code = 1000, reason = ''): void {
      if (this.destroyed) return;
      
      this.readyState = SafeMockWebSocket.CLOSED;
      if (this.onclose) {
        Promise.resolve().then(() => {
          if (!this.destroyed && this.onclose) {
            this.onclose(new CloseEvent('close', { code, reason }));
          }
        });
      }
    }

    simulateError(): void {
      if (this.destroyed) return;
      
      if (this.onerror) {
        Promise.resolve().then(() => {
          if (!this.destroyed && this.onerror) {
            this.onerror(new Event('error'));
          }
        });
      }
    }

    send(data: string): void {
      if (this.destroyed || this.readyState !== SafeMockWebSocket.OPEN) {
        throw new Error('WebSocket is not open');
      }
    }

    close(): void {
      if (!this.destroyed) {
        this.simulateClose();
      }
    }

    destroy(): void {
      this.destroyed = true;
      this.readyState = SafeMockWebSocket.CLOSED;
      this.onopen = null;
      this.onclose = null;
      this.onmessage = null;
      this.onerror = null;
    }

    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispatchEvent = vi.fn();
  }

  const mockWs = new SafeMockWebSocket('ws://localhost:8080', false);

  return {
    mockWs,
    simulateOpen: () => mockWs.simulateOpen(),
    simulateMessage: (data: any) => mockWs.simulateMessage(data),
    simulateClose: (code?: number, reason?: string) => mockWs.simulateClose(code, reason),
    simulateError: () => mockWs.simulateError(),
    destroy: () => mockWs.destroy(),
  };
};

/**
 * Mock MCP Client 생성
 */
export const createMockMCPClient = () => {
  return {
    callTool: vi.fn().mockResolvedValue({ result: 'mock success' }),
    readResource: vi.fn().mockResolvedValue({ content: 'mock content' }),
    getPrompt: vi.fn().mockResolvedValue({ content: 'mock prompt' }),
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    destroy: vi.fn(),
  };
};

/**
 * 테스트 환경 설정 헬퍼
 */
export const createTestEnvironment = () => {
  const testTimeout = new TestTimeout();
  const mockStorage = createMockStorage();
  const mockEventManager = createMockEventManager();
  const safeMockWs = createSafeMockWebSocket();
  const mockMCPClient = createMockMCPClient();

  return {
    testTimeout,
    mockStorage,
    mockEventManager,
    safeMockWs,
    mockMCPClient,
    cleanup: async () => {
      testTimeout.cleanup();
      safeMockWs.destroy();
      // 모든 비동기 작업 완료 대기
      await delay(10);
    }
  };
}; 