/**
 * WebSocketManager 테스트 (수정된 버전 - 무한 대기 문제 해결)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventManager } from '../../../src/core/events.js';
import { 
  WebSocketManager, 
  ExponentialBackoffReconnect, 
  LinearBackoffReconnect,
  type WebSocketManagerConfig 
} from '../../../src/services/websocket/websocket-manager.js';

// WebSocketClient Mock
class MockWebSocketClient {
  private isConnected = false;
  private eventListeners = new Map<string, Function[]>();
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      // 즉시 연결 상태로 변경
      this.isConnected = true;
      
      // 동기적으로 connect 이벤트 발생
      setImmediate(() => {
        this.emit('connect');
      });
      
      resolve();
    });
  }

  disconnect(): void {
    this.isConnected = false;
    this.emit('disconnect');
  }

  send(message: any): boolean {
    if (!this.isConnected) return false;
    return true;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: this.isConnected ? 1 : 3,
      url: this.config.url,
      reconnectAttempts: 0,
      lastPong: null
    };
  }

  on(event: string, handler: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
    
    // unsubscribe 함수 반환
    return () => {
      this.off(event, handler);
    };
  }

  once(event: string, handler: Function): void {
    const onceHandler = (...args: any[]) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event: string, data?: any): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Mock event handler error:', error);
        }
      });
    }
  }

  destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }
}

// WebSocketClient Mock
vi.mock('../../../src/services/websocket/websocket-client.js', () => ({
  WebSocketClient: MockWebSocketClient
}));

describe('WebSocketManager', () => {
  let eventManager: EventManager;
  let config: WebSocketManagerConfig;

  beforeEach(() => {
    eventManager = new EventManager();
    config = {
      url: 'ws://localhost:3000',
      enableConnectionPool: false,
      healthCheckInterval: 1000,
      statisticsInterval: 2000,
      enableAutoReconnect: true
    };
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('초기화', () => {
    it('매니저가 올바르게 초기화되어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      
      expect(manager).toBeDefined();
      expect(manager.isConnected).toBe(false);
      
      await manager.initialize();
      
      expect(manager).toBeDefined();
    });

    it('중복 초기화 시 경고를 출력해야 한다', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = new WebSocketManager(config, eventManager);
      
      await manager.initialize();
      await manager.initialize(); // 중복 초기화
      
      expect(consoleSpy).toHaveBeenCalledWith('WebSocketManager is already initialized');
      
      consoleSpy.mockRestore();
    });
  });

  describe('연결 관리', () => {
    it('WebSocket 연결이 성공해야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      const connectSpy = vi.fn();
      eventManager.on('websocket-manager:connected', connectSpy);
      
      await manager.connect();
      
      // 이벤트가 발생할 때까지 잠시 대기
      await new Promise(resolve => setImmediate(resolve));
      
      expect(manager.isConnected).toBe(true);
      expect(connectSpy).toHaveBeenCalled();
    });

    it('이미 연결된 경우 중복 연결을 방지해야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await manager.connect(); // 중복 연결 시도
      
      expect(consoleSpy).toHaveBeenCalledWith('Already connected');
      
      consoleSpy.mockRestore();
    });

    it('연결 해제가 올바르게 작동해야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      const disconnectSpy = vi.fn();
      eventManager.on('websocket-manager:disconnected', disconnectSpy);
      
      await manager.disconnect();
      
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('재연결 전략', () => {
    it('ExponentialBackoffReconnect가 올바르게 동작해야 한다', () => {
      const strategy = new ExponentialBackoffReconnect(1000, 10000, 5, 2);
      
      expect(strategy.getNextDelay(0)).toBe(1000);
      expect(strategy.getNextDelay(1)).toBe(2000);
      expect(strategy.getNextDelay(2)).toBe(4000);
      expect(strategy.getNextDelay(10)).toBe(10000); // max 제한
      
      expect(strategy.shouldStop(4)).toBe(false);
      expect(strategy.shouldStop(5)).toBe(true);
    });

    it('LinearBackoffReconnect가 올바르게 동작해야 한다', () => {
      const strategy = new LinearBackoffReconnect(2000, 1000, 10000, 5);
      
      expect(strategy.getNextDelay(0)).toBe(2000);
      expect(strategy.getNextDelay(1)).toBe(3000);
      expect(strategy.getNextDelay(2)).toBe(4000);
      expect(strategy.getNextDelay(10)).toBe(10000); // max 제한
      
      expect(strategy.shouldStop(4)).toBe(false);
      expect(strategy.shouldStop(5)).toBe(true);
    });
  });

  describe('메시지 전송', () => {
    it('연결된 상태에서 메시지를 전송할 수 있어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      const message = { type: 'test', data: 'hello' };
      const result = manager.send(message);
      
      expect(result).toBe(true);
    });

    it('연결되지 않은 상태에서는 메시지 전송이 실패해야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      const message = { type: 'test', data: 'hello' };
      const result = manager.send(message);
      
      expect(result).toBe(false);
    });
  });

  describe('통계 수집', () => {
    it('기본 통계 정보를 가져올 수 있어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      const stats = manager.getStatistics();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('totalDisconnections');
      expect(stats).toHaveProperty('totalMessagesSent');
      expect(stats).toHaveProperty('totalMessagesReceived');
      expect(stats).toHaveProperty('reconnectAttempts');
      expect(stats).toHaveProperty('errors');
      
      expect(stats.totalConnections).toBe(0);
      expect(stats.totalDisconnections).toBe(0);
    });

    it('연결 후 통계가 업데이트되어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      const stats = manager.getStatistics();
      expect(stats.totalConnections).toBe(1);
    });
  });

  describe('헬스체크', () => {
    it('헬스체크를 수행할 수 있어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      // pong 이벤트를 즉시 발생시키는 Promise
      const healthCheckPromise = manager.performHealthCheck();
      
      // pong 이벤트를 즉시 발생
      const client = (manager as any).client;
      if (client) {
        setImmediate(() => client.emit('pong'));
      }
      
      const health = await healthCheckPromise;
      
      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('latency');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('errors');
    });

    it('연결되지 않은 상태에서는 헬스체크가 실패해야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      const health = await manager.performHealthCheck();
      
      expect(health.isHealthy).toBe(false);
      expect(health.errors).toContain('Not connected');
    });
  });

  describe('이벤트 시스템 통합', () => {
    it('WebSocket 이벤트가 매니저 이벤트로 전파되어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      const connectSpy = vi.fn();
      const disconnectSpy = vi.fn();
      
      eventManager.on('websocket:connected', connectSpy);
      eventManager.on('websocket:disconnected', disconnectSpy);
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      await manager.disconnect();
      
      expect(connectSpy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('리소스 정리', () => {
    it('destroy 호출 시 모든 리소스가 정리되어야 한다', async () => {
      const manager = new WebSocketManager(config, eventManager);
      await manager.initialize();
      
      await manager.connect();
      await new Promise(resolve => setImmediate(resolve));
      
      manager.destroy();
      
      expect(manager.isConnected).toBe(false);
    });
  });
});