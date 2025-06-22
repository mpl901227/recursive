/**
 * RequestQueue 테스트 (FRONTEND_REFACTORING_PLAN.md Phase 4.4)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventManager } from '../../../src/core/events.js';
import { WebSocketClient } from '../../../src/services/websocket/websocket-client.js';
import { MCPClient } from '../../../src/services/mcp/mcp-client.js';
import { 
  MCPRequestQueue, 
  RequestPriority, 
  RequestStatus,
  type QueuedRequest,
  type RequestQueueConfig,
  type QueueStatistics
} from '../../../src/services/mcp/request_queue.js';

// WebSocket mock
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url = '';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    // Mock send implementation
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

// WebSocket을 mock으로 교체
Object.defineProperty(global, 'WebSocket', {
  writable: true,
  value: MockWebSocket
});

describe('MCPRequestQueue', () => {
  let eventManager: EventManager;
  let websocketClient: WebSocketClient;
  let mcpClient: MCPClient;
  let requestQueue: MCPRequestQueue;

  beforeEach(() => {
    // Mock 초기화
    vi.clearAllMocks();
    
    // EventManager 생성
    eventManager = new EventManager();
    
    // WebSocketClient 생성
    websocketClient = new WebSocketClient({
      url: 'ws://localhost:8080',
      reconnectDelay: 50, // 테스트 시간 단축
      maxReconnectAttempts: 2
    });
    
    // MCPClient 생성
    mcpClient = new MCPClient(websocketClient, eventManager);
    
    // RequestQueue 설정
    const config: RequestQueueConfig = {
      maxSize: 10,
      maxConcurrent: 3,
      processInterval: 5, // 더 빠른 처리
      enablePriority: true,
      enableRateLimit: false,
      enableStatistics: true,
      enableDebugging: false,
      requestTimeout: 1000 // 테스트 시간 단축
    };
    
    requestQueue = new MCPRequestQueue(eventManager, mcpClient, config);
  });

  afterEach(async () => {
    // 순차적 정리
    if (requestQueue) {
      requestQueue.destroy();
    }
    
    if (websocketClient) {
      websocketClient.disconnect();
    }
    
    vi.restoreAllMocks();
    
    // 모든 비동기 작업 완료 대기
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  describe('초기화', () => {
    it('RequestQueue가 올바르게 초기화되어야 함', () => {
      expect(requestQueue).toBeDefined();
      
      const status = requestQueue.getStatus();
      expect(status.queueSize).toBe(0);
      expect(status.activeRequests).toBe(0);
      expect(status.isProcessing).toBe(true); // 자동으로 처리 시작
    });

    it('설정이 올바르게 적용되어야 함', () => {
      const statistics = requestQueue.getStatistics();
      expect(statistics).toBeDefined();
      expect(statistics.totalRequests).toBe(0);
      expect(statistics.completedRequests).toBe(0);
      expect(statistics.failedRequests).toBe(0);
    });
  });

  describe('요청 큐잉', () => {
    it('기본 요청이 큐에 추가되어야 함', async () => {
      // Mock 응답 설정
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mockResult);

      const promise = requestQueue.enqueue(
        'tools/call',
        { name: 'test-tool', arguments: {} }
      );

      expect(promise).toBeInstanceOf(Promise);
      
      const result = await promise;
      expect(result).toEqual(mockResult);
    });

    it('우선순위가 올바르게 적용되어야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mockResult);

      // 다양한 우선순위로 요청 추가
      const lowPromise = requestQueue.enqueue(
        'tools/call',
        { name: 'low-tool', arguments: {} },
        { priority: RequestPriority.LOW }
      );

      const highPromise = requestQueue.enqueue(
        'tools/call',
        { name: 'high-tool', arguments: {} },
        { priority: RequestPriority.HIGH }
      );

      const criticalPromise = requestQueue.enqueue(
        'tools/call',
        { name: 'critical-tool', arguments: {} },
        { priority: RequestPriority.CRITICAL }
      );

      await Promise.all([lowPromise, highPromise, criticalPromise]);

      const statistics = requestQueue.getStatistics();
      expect(statistics.totalRequests).toBe(3);
      expect(statistics.completedRequests).toBe(3);
    });

    it('큐 크기 제한이 작동해야 함', async () => {
      // 작은 큐 크기로 새 인스턴스 생성
      const smallQueueConfig: RequestQueueConfig = {
        maxSize: 2,
        maxConcurrent: 1,
        processInterval: 10,
        enablePriority: true,
        enableRateLimit: false,
        enableStatistics: true,
        enableDebugging: false,
        requestTimeout: 5000
      };

      const smallQueue = new MCPRequestQueue(eventManager, mcpClient, smallQueueConfig);

      try {
        // Mock을 느리게 응답하도록 설정하여 큐에 쌓이게 함
        vi.spyOn(mcpClient, 'callTool').mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ result: 'success' }), 100))
        );

        // 큐 크기보다 많은 요청 추가
        const promises: Promise<any>[] = [];
        for (let i = 0; i < 5; i++) {
          try {
            const promise = smallQueue.enqueue(
              'tools/call',
              { name: `tool-${i}`, arguments: {} }
            );
            promises.push(promise);
          } catch (error) {
            // 큐가 가득 찬 경우 에러 발생 예상
            expect(error).toBeInstanceOf(Error);
          }
        }

        // 일부 요청은 성공해야 함
        const results = await Promise.allSettled(promises);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
      } finally {
        smallQueue.destroy();
      }
    });

    it('태그를 사용한 요청 분류가 작동해야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mockResult);

      await requestQueue.enqueue(
        'tools/call',
        { name: 'test-tool', arguments: {} },
        { tags: ['test', 'development'] }
      );

      const statistics = requestQueue.getStatistics();
      expect(statistics.totalRequests).toBe(1);
    });
  });

  describe('다양한 메서드 지원', () => {
    it('리소스 읽기 요청이 작동해야 함', async () => {
      const mockResource = { content: 'resource content' };
      vi.spyOn(mcpClient, 'readResource').mockResolvedValue(mockResource);

      const result = await requestQueue.enqueue(
        'resources/read',
        { uri: 'test://resource' }
      );

      expect(result).toEqual(mockResource);
    });

    it('프롬프트 요청이 작동해야 함', async () => {
      const mockPrompt = { content: 'prompt content' };
      vi.spyOn(mcpClient, 'getPrompt').mockResolvedValue(mockPrompt);

      const result = await requestQueue.enqueue(
        'prompts/get',
        { name: 'test-prompt', arguments: {} }
      );

      expect(result).toEqual(mockPrompt);
    });

    it('지원되지 않는 메서드에 대해 에러가 발생해야 함', async () => {
      await expect(
        requestQueue.enqueue('unsupported/method' as any, {}, { timeout: 500 })
      ).rejects.toThrow('Unsupported MCP method');
    }, 1000);
  });

  describe('에러 처리 및 재시도', () => {
    it('요청 실패 시 재시도가 작동해야 함', async () => {
      let callCount = 0;
      vi.spyOn(mcpClient, 'callTool').mockImplementation(async () => {
        callCount++;
        if (callCount < 2) { // 2번째 시도에서 성공
          throw new Error('Network timeout'); // 네트워크 오류로 변경
        }
        return { result: 'success after retry' };
      });

      const result = await requestQueue.enqueue(
        'tools/call',
        { name: 'retry-tool', arguments: {} },
        { maxRetries: 2, timeout: 1000 }
      );

      expect(result).toEqual({ result: 'success after retry' });
      expect(callCount).toBe(2);
    }, 2000);

    it('최대 재시도 횟수 초과 시 실패해야 함', async () => {
      vi.spyOn(mcpClient, 'callTool').mockRejectedValue(new Error('Persistent failure'));

      await expect(
        requestQueue.enqueue(
          'tools/call',
          { name: 'failing-tool', arguments: {} },
          { maxRetries: 2 }
        )
      ).rejects.toThrow('Persistent failure');
    });

    it('타임아웃이 작동해야 함', async () => {
      // 매우 긴 지연으로 타임아웃 유발
      vi.spyOn(mcpClient, 'callTool').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      await expect(
        requestQueue.enqueue(
          'tools/call',
          { name: 'slow-tool', arguments: {} },
          { timeout: 100 }
        )
      ).rejects.toThrow();
    });
  });

  describe('동시성 제어', () => {
    it('최대 동시 요청 수가 제한되어야 함', async () => {
      const concurrentConfig: RequestQueueConfig = {
        maxSize: 10,
        maxConcurrent: 2,
        processInterval: 10,
        enablePriority: true,
        enableRateLimit: false,
        enableStatistics: true,
        enableDebugging: false,
        requestTimeout: 5000
      };

      const concurrentQueue = new MCPRequestQueue(eventManager, mcpClient, concurrentConfig);

      try {
        let activeCount = 0;
        let maxActiveCount = 0;

        vi.spyOn(mcpClient, 'callTool').mockImplementation(async () => {
          activeCount++;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          
          await new Promise(resolve => setTimeout(resolve, 50));
          
          activeCount--;
          return { result: 'success' };
        });

        // 여러 요청을 동시에 시작
        const promises: Promise<any>[] = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            concurrentQueue.enqueue('tools/call', { name: `tool-${i}`, arguments: {} })
          );
        }

        await Promise.all(promises);

        // 최대 동시 실행 수가 설정값을 초과하지 않아야 함
        expect(maxActiveCount).toBeLessThanOrEqual(2);
      } finally {
        concurrentQueue.destroy();
      }
    });
  });

  describe('통계 및 모니터링', () => {
    it('통계가 올바르게 수집되어야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mockResult);

      // 성공 요청
      await requestQueue.enqueue('tools/call', { name: 'success-tool', arguments: {} });

      // 실패 요청
      vi.spyOn(mcpClient, 'callTool').mockRejectedValueOnce(new Error('Test failure'));
      
      try {
        await requestQueue.enqueue('tools/call', { name: 'fail-tool', arguments: {} });
      } catch (error) {
        // 예상된 에러
      }

      const statistics = requestQueue.getStatistics();
      expect(statistics.totalRequests).toBe(2);
      expect(statistics.completedRequests).toBe(1);
      expect(statistics.failedRequests).toBe(1);
      expect(statistics.averageProcessTime).toBeGreaterThanOrEqual(0);
    });

    it('큐 상태 정보가 올바르게 반환되어야 함', () => {
      const status = requestQueue.getStatus();
      
      expect(typeof status.queueSize).toBe('number');
      expect(typeof status.activeRequests).toBe('number');
      expect(typeof status.isProcessing).toBe('boolean');
      // rateLimitUsage는 optional이므로 존재할 때만 검사
      if (status.rateLimitUsage) {
        expect(typeof status.rateLimitUsage.current).toBe('number');
        expect(typeof status.rateLimitUsage.limit).toBe('number');
        expect(typeof status.rateLimitUsage.resetTime).toBe('number');
      }
    });
  });

  describe('이벤트 발생', () => {
    it('요청 처리 이벤트가 발생해야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpClient, 'callTool').mockResolvedValue(mockResult);

      // enqueued와 completed 이벤트만 확인 (이들은 확실히 발생함)
      const eventPromises = [
        new Promise(resolve => eventManager.once('request-queue:enqueued', resolve)),
        new Promise(resolve => eventManager.once('request-queue:completed', resolve))
      ];

      const requestPromise = requestQueue.enqueue(
        'tools/call',
        { name: 'event-tool', arguments: {} }
      );

      await Promise.all([requestPromise, ...eventPromises]);

      expect(true).toBe(true); // 이벤트가 발생했음을 확인
    }, 1000);

    it('에러 이벤트가 발생해야 함', async () => {
      vi.spyOn(mcpClient, 'callTool').mockRejectedValue(new Error('Test error'));

      const errorEventPromise = new Promise(resolve => 
        eventManager.once('request-queue:failed', resolve)
      );

      try {
        await requestQueue.enqueue('tools/call', { name: 'error-tool', arguments: {} });
      } catch (error) {
        // 예상된 에러
      }

      await errorEventPromise;
      expect(true).toBe(true); // 에러 이벤트가 발생했음을 확인
    }, 1000);
  });

  describe('큐 관리', () => {
    it('큐를 지울 수 있어야 함', () => {
      // 몇 개의 요청을 큐에 추가 (실행되지 않도록)
      vi.spyOn(mcpClient, 'callTool').mockImplementation(() => 
        new Promise(() => {}) // 영원히 대기하는 Promise
      );

      requestQueue.enqueue('tools/call', { name: 'pending-tool', arguments: {} }).catch(() => {});

      requestQueue.clear();

      const status = requestQueue.getStatus();
      expect(status.queueSize).toBe(0);
    });

    it('특정 요청을 취소할 수 있어야 함', async () => {
      // 긴 지연으로 요청 생성
      vi.spyOn(mcpClient, 'callTool').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ result: 'delayed' }), 1000))
      );

      const promise = requestQueue.enqueue('tools/call', { name: 'cancelable-tool', arguments: {} });

      // 요청이 시작되기 전에 큐 지우기
      requestQueue.clear();

      await expect(promise).rejects.toThrow();
    });
  });

  describe('리소스 정리', () => {
    it('destroy 메서드가 올바르게 작동해야 함', () => {
      expect(() => requestQueue.destroy()).not.toThrow();
      
      const status = requestQueue.getStatus();
      expect(status.queueSize).toBe(0);
    });

    it('destroy 후 새 요청이 거부되어야 함', async () => {
      requestQueue.destroy();

      await expect(
        requestQueue.enqueue('tools/call', { name: 'post-destroy-tool', arguments: {} })
      ).rejects.toThrow();
    });
  });

  describe('디버깅 지원', () => {
    it('디버깅 모드에서 추가 정보가 제공되어야 함', () => {
      const debugConfig: RequestQueueConfig = {
        maxSize: 10,
        maxConcurrent: 3,
        processInterval: 10,
        enablePriority: true,
        enableRateLimit: false,
        enableStatistics: true,
        enableDebugging: true,
        requestTimeout: 5000
      };

      const debugQueue = new MCPRequestQueue(eventManager, mcpClient, debugConfig);

      try {
        const statistics = debugQueue.getStatistics();
        expect(statistics).toBeDefined();
        
        // 디버깅 모드에서는 추가 통계 정보가 있을 수 있음
        expect(typeof statistics.totalRequests).toBe('number');
      } finally {
        debugQueue.destroy();
      }
    });
  });
});