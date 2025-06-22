/**
 * @fileoverview 이벤트 시스템 구현
 * @description 애플리케이션 전반의 이벤트 관리를 담당하는 EventManager 클래스
 * @version 2.0.0
 */

import type { 
  EventData, 
  EventHandler, 
  EventListenerOptions
} from '../types/index.js';

/**
 * 이벤트 리스너 정보를 저장하는 인터페이스
 */
interface ListenerInfo {
  handler: EventHandler;
  options?: EventListenerOptions | undefined;
  id: string;
}

/**
 * 이벤트 메트릭 정보
 */
interface EventMetrics {
  totalEvents: number;
  totalListeners: number;
  eventCounts: Map<string, number>;
  errors: Array<{
    event: string;
    error: Error;
    timestamp: number;
    originalEvent?: string;
    stack?: string;
  }>;
}

/**
 * 애플리케이션 전체의 이벤트 관리를 담당하는 클래스
 * 
 * @example
 * ```typescript
 * const eventManager = new EventManager();
 * 
 * // 이벤트 리스너 등록
 * const unsubscribe = eventManager.on('user:login', (data) => {
 *   console.log('User logged in:', data);
 * });
 * 
 * // 이벤트 발생
 * eventManager.emit('user:login', { userId: 123, name: 'John' });
 * 
 * // 리스너 해제
 * unsubscribe();
 * ```
 */
export class EventManager {
  private listeners = new Map<string, Set<ListenerInfo>>();
  private onceListeners = new Map<string, Set<ListenerInfo>>();
  private metrics: EventMetrics;
  private isDebugMode: boolean = false;
  private maxListeners: number = 100;
  private listenerIdCounter: number = 0;

  constructor(options?: { debug?: boolean; maxListeners?: number }) {
    this.isDebugMode = options?.debug ?? false;
    this.maxListeners = options?.maxListeners ?? 100;
    this.metrics = {
      totalEvents: 0,
      totalListeners: 0,
      eventCounts: new Map(),
      errors: []
    };

    if (this.isDebugMode) {
      console.log('🎯 EventManager initialized with debug mode');
    }
  }

  /**
   * 이벤트 리스너를 등록합니다
   * 
   * @param event - 이벤트 이름
   * @param handler - 이벤트 핸들러 함수
   * @param options - 리스너 옵션
   * @returns 리스너 해제 함수
   */
  on<T = any>(event: string, handler: EventHandler<T>, options?: EventListenerOptions): () => void {
    this.validateEventName(event);
    this.validateHandler(handler);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const listenersSet = this.listeners.get(event)!;
    
    // 최대 리스너 수 확인
    if (listenersSet.size >= this.maxListeners) {
      console.warn(`⚠️ Maximum listeners (${this.maxListeners}) reached for event: ${event}`);
    }

    const listenerInfo: ListenerInfo = {
      handler: handler as EventHandler,
      options: options || undefined,
      id: this.generateListenerId()
    };

    listenersSet.add(listenerInfo);
    this.metrics.totalListeners++;

    if (this.isDebugMode) {
      console.log(`📝 Listener registered for event: ${event}, total: ${listenersSet.size}`);
    }

    // 리스너 해제 함수 반환
    return () => this.off(event, handler);
  }

  /**
   * 한 번만 실행되는 이벤트 리스너를 등록합니다
   * 
   * @param event - 이벤트 이름
   * @param handler - 이벤트 핸들러 함수
   * @param options - 리스너 옵션
   */
  once(event: string, handler: EventHandler, options?: EventListenerOptions): void {
    this.validateEventName(event);
    this.validateHandler(handler);

    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }

    const listenerInfo: ListenerInfo = {
      handler,
      options,
      id: this.generateListenerId()
    };

    this.onceListeners.get(event)!.add(listenerInfo);
    this.metrics.totalListeners++;

    if (this.isDebugMode) {
      console.log(`📝 Once listener registered for event: ${event}`);
    }
  }

  /**
   * 이벤트 리스너를 해제합니다
   * 
   * @param event - 이벤트 이름
   * @param handler - 해제할 핸들러 함수
   * @returns 리스너가 제거되었는지 여부
   */
  off(event: string, handler?: EventHandler): boolean {
    if (!handler) {
      // 핸들러가 없으면 해당 이벤트의 모든 리스너 제거
      this.removeAllListeners(event);
      return true;
    }

    // 일반 리스너에서 제거
    if (this.listeners.has(event)) {
      const listenersSet = this.listeners.get(event)!;
      for (const listenerInfo of listenersSet) {
        if (listenerInfo.handler === handler) {
          listenersSet.delete(listenerInfo);
          this.metrics.totalListeners--;
          break;
        }
      }
      
      if (listenersSet.size === 0) {
        this.listeners.delete(event);
      }
    }

    // 한 번만 실행되는 리스너에서 제거
    if (this.onceListeners.has(event)) {
      const onceSet = this.onceListeners.get(event)!;
      for (const listenerInfo of onceSet) {
        if (listenerInfo.handler === handler) {
          onceSet.delete(listenerInfo);
          this.metrics.totalListeners--;
          break;
        }
      }
      
      if (onceSet.size === 0) {
        this.onceListeners.delete(event);
      }
    }

    if (this.isDebugMode) {
      console.log(`🗑️ Listener removed for event: ${event}`);
    }

    return true;
  }

  /**
   * 이벤트를 발생시킵니다
   * 
   * @param event - 이벤트 이름
   * @param data - 이벤트 데이터
   * @returns 리스너가 있었는지 여부
   */
  emit<T = any>(event: string, data?: T): boolean {
    this.validateEventName(event);

    let hasListeners = false;
    const eventData: EventData = {
      type: event,
      timestamp: Date.now(),
      source: 'EventManager',
      payload: {},
      ...(data as any)
    };

    this.metrics.totalEvents++;
    this.updateEventCount(event);

    // 빈번한 이벤트들은 로그에서 제외
    const silentEvents = [
      'connection-status:check-requested',
      'heartbeat',
      'ping',
      'pong',
      'metrics:update',
      'timer:tick'
    ];

    if (this.isDebugMode && !silentEvents.includes(event)) {
      console.log(`🚀 Emitting event: ${event}`, eventData);
    }

    // 일반 리스너들 실행
    if (this.listeners.has(event)) {
      hasListeners = true;
      const listenersSet = this.listeners.get(event)!;
      
      for (const listenerInfo of listenersSet) {
        this.executeListener(event, listenerInfo, eventData);
      }
    }

    // 한 번만 실행되는 리스너들 실행 후 제거
    if (this.onceListeners.has(event)) {
      hasListeners = true;
      const onceSet = this.onceListeners.get(event)!;
      
      // 복사본을 만들어서 실행 중 수정 방지
      const listenersToExecute = Array.from(onceSet);
      onceSet.clear(); // 먼저 클리어
      
      for (const listenerInfo of listenersToExecute) {
        this.executeListener(event, listenerInfo, eventData);
        this.metrics.totalListeners--;
      }
      
      this.onceListeners.delete(event);
    }

    // 와일드카드 리스너들 실행 (*.* 형태)
    this.executeWildcardListeners(event, eventData);

    return hasListeners;
  }

  /**
   * Promise 기반 이벤트 대기
   * 
   * @param event - 대기할 이벤트 이름
   * @param timeout - 타임아웃 (밀리초)
   * @returns 이벤트 데이터를 담은 Promise
   */
  waitFor(event: string, timeout?: number): Promise<EventData> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      let resolved = false;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolved = true;
      };

      this.once(event, (data) => {
        if (!resolved) {
          cleanup();
          resolve(data);
        }
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          if (!resolved) {
            cleanup();
            reject(new Error(`Event '${event}' timeout after ${timeout}ms`));
          }
        }, timeout);
      }
    });
  }

  /**
   * 특정 이벤트의 모든 리스너를 제거합니다
   * 
   * @param event - 이벤트 이름
   */
  removeAllListeners(event?: string): void {
    if (event) {
      // 특정 이벤트의 리스너만 제거
      const regularCount = this.listeners.get(event)?.size ?? 0;
      const onceCount = this.onceListeners.get(event)?.size ?? 0;
      
      this.listeners.delete(event);
      this.onceListeners.delete(event);
      this.metrics.totalListeners -= (regularCount + onceCount);
      
      if (this.isDebugMode) {
        console.log(`🗑️ All listeners removed for event: ${event}`);
      }
    } else {
      // 모든 이벤트의 리스너 제거
      this.listeners.clear();
      this.onceListeners.clear();
      this.metrics.totalListeners = 0;
      
      if (this.isDebugMode) {
        console.log('🗑️ All listeners removed');
      }
    }
  }

  /**
   * 이벤트 리스너 목록을 반환합니다
   * 
   * @param event - 이벤트 이름 (선택사항)
   * @returns 이벤트 리스너 정보
   */
  getListeners(event?: string): string[] {
    if (event) {
      const regular = this.listeners.get(event)?.size ?? 0;
      const once = this.onceListeners.get(event)?.size ?? 0;
      return [`Regular: ${regular}`, `Once: ${once}`];
    }

    const allEvents = new Set([
      ...this.listeners.keys(),
      ...this.onceListeners.keys()
    ]);

    return Array.from(allEvents).map(eventName => {
      const regular = this.listeners.get(eventName)?.size ?? 0;
      const once = this.onceListeners.get(eventName)?.size ?? 0;
      return `${eventName}: Regular(${regular}), Once(${once})`;
    });
  }

  /**
   * 특정 이벤트의 리스너 수를 반환합니다
   * 
   * @param event - 이벤트 이름
   * @returns 리스너 수
   */
  listenerCount(event: string): number {
    const regularListeners = this.listeners.get(event)?.size || 0;
    const onceListeners = this.onceListeners.get(event)?.size || 0;
    return regularListeners + onceListeners;
  }

  /**
   * 이벤트 메트릭을 반환합니다
   * 
   * @returns 이벤트 메트릭 정보
   */
  getMetrics(): EventMetrics {
    return {
      ...this.metrics,
      eventCounts: new Map(this.metrics.eventCounts),
      errors: [...this.metrics.errors]
    };
  }

  /**
   * 디버그 모드를 설정합니다
   * 
   * @param enabled - 디버그 모드 활성화 여부
   */
  setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
    console.log(`🐛 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 이벤트 시스템을 정리합니다
   */
  destroy(): void {
    this.removeAllListeners();
    this.metrics.eventCounts.clear();
    this.metrics.errors = [];
    
    if (this.isDebugMode) {
      console.log('💥 EventManager destroyed');
    }
  }

  // Private Methods

  /**
   * 이벤트 이름 유효성 검사
   */
  private validateEventName(event: string): void {
    if (!event || typeof event !== 'string' || event.trim() === '') {
      throw new Error('Event name must be a non-empty string');
    }
  }

  /**
   * 핸들러 함수 유효성 검사
   */
  private validateHandler(handler: EventHandler): void {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }
  }

  /**
   * 리스너 ID 생성
   */
  private generateListenerId(): string {
    return `listener_${++this.listenerIdCounter}_${Date.now()}`;
  }

  /**
   * 이벤트 카운트 업데이트
   */
  private updateEventCount(event: string): void {
    const currentCount = this.metrics.eventCounts.get(event) ?? 0;
    this.metrics.eventCounts.set(event, currentCount + 1);
  }

  /**
   * 리스너 실행
   */
  private executeListener(event: string, listenerInfo: ListenerInfo, data: EventData): void {
    try {
      // 옵션 확인 (조건부 실행은 향후 지원 예정)

      if (listenerInfo.options?.async) {
        // 비동기 실행
        Promise.resolve(listenerInfo.handler(data)).catch(error => {
          this.handleListenerError(event, error);
        });
      } else {
        // 동기 실행
        listenerInfo.handler(data);
      }
    } catch (error) {
      this.handleListenerError(event, error as Error);
    }
  }

  /**
   * 와일드카드 리스너 실행
   */
  private executeWildcardListeners(_event: string, data: EventData): void {
    const wildcardEvents = ['*', '*.*'];
    
    for (const wildcardEvent of wildcardEvents) {
      if (this.listeners.has(wildcardEvent)) {
        const listenersSet = this.listeners.get(wildcardEvent)!;
        for (const listenerInfo of listenersSet) {
          this.executeListener(wildcardEvent, listenerInfo, data);
        }
      }
    }
  }

  /**
   * 리스너 에러 처리
   */
  private handleListenerError(event: string, error: Error): void {
    this.metrics.errors.push({
      event,
      error,
      timestamp: Date.now()
    });

    // 에러 로그 출력
    console.error(`❌ Error in event listener for '${event}':`, error);

    // 에러 이벤트 발생 (무한 루프 방지를 위해 조건부)
    if (event !== 'error' && event !== 'listener:error') {
      this.emit('listener:error', {
        type: 'listener:error',
        timestamp: Date.now(),
        source: 'EventManager',
        payload: {
          originalEvent: event,
          error: error.message,
          stack: error.stack
        }
      });
    }

    // 에러 메트릭 정리 (최대 100개까지만 보관)
    if (this.metrics.errors.length > 100) {
      this.metrics.errors = this.metrics.errors.slice(-50);
    }
  }
}

/**
 * 전역 이벤트 매니저 인스턴스
 */
export const globalEventManager = new EventManager({ debug: false });

/**
 * 이벤트 매니저 팩토리 함수
 * 
 * @param options - 이벤트 매니저 옵션
 * @returns 새로운 EventManager 인스턴스
 */
export function createEventManager(options?: { debug?: boolean; maxListeners?: number }): EventManager {
  return new EventManager(options);
}

/**
 * 이벤트 이름 상수
 */
export const Events = {
  // 애플리케이션 이벤트
  APP_INIT: 'app:init',
  APP_READY: 'app:ready',
  APP_ERROR: 'app:error',
  APP_DESTROY: 'app:destroy',

  // WebSocket 이벤트
  WS_CONNECTING: 'websocket:connecting',
  WS_CONNECTED: 'websocket:connected',
  WS_DISCONNECTED: 'websocket:disconnected',
  WS_MESSAGE: 'websocket:message',
  WS_ERROR: 'websocket:error',

  // MCP 이벤트
  MCP_READY: 'mcp:ready',
  MCP_REQUEST: 'mcp:request',
  MCP_RESPONSE: 'mcp:response',
  MCP_ERROR: 'mcp:error',

  // UI 이벤트
  UI_THEME_CHANGED: 'ui:theme:changed',
  UI_SIDEBAR_TOGGLE: 'ui:sidebar:toggle',
  UI_MODAL_OPEN: 'ui:modal:open',
  UI_MODAL_CLOSE: 'ui:modal:close',
  UI_TOAST_SHOW: 'ui:toast:show',

  // 라우터 이벤트
  ROUTE_CHANGE: 'router:change',
  ROUTE_ERROR: 'router:error',

  // 에러 이벤트
  LISTENER_ERROR: 'listener:error',
  SYSTEM_ERROR: 'system:error'
} as const;

export default EventManager; 