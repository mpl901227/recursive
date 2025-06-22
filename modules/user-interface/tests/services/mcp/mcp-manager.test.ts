/**
 * MCPManager 테스트 (RequestQueue 통합 버전)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventManager } from '../../../src/core/events.js';
import { MCPManager } from '../../../src/services/mcp/mcp-manager.js';
import { createSafeMockWebSocket } from '../../utils/test-helpers.js';
import { RequestPriority } from '../../../src/services/mcp/request_queue.js';
import { 
  createTestEnvironment, 
  waitForCondition, 
  createSafePromise,
  waitForEvent 
} from '../../utils/test-helpers.js';
import { WebSocketClient } from '../../../src/services/websocket/websocket-client.js';

// WebSocket mock
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url = '';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // 즉시 연결 상태로 변경
    setImmediate(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    });
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

/**
 * 테스트용 도구 레지스트리 설정 헬퍼
 */
async function setupMockTools(manager: MCPManager, toolNames: string[]) {
  const tools = toolNames.map(name => ({
    name,
    description: 'Test tool',
    inputSchema: { type: 'object', properties: {} }
  }));
  
  vi.spyOn(manager.getClient(), 'listTools').mockResolvedValue(tools);
  
  // public 메서드로 변경된 refreshToolRegistry 호출
  try {
    await manager.refreshToolRegistry();
  } catch (error) {
    // 에러 발생 시 무시
    console.warn('Failed to refresh tool registry in test:', error);
  }
}

/**
 * RequestQueue 상태를 기다리는 헬퍼 함수
 */
async function waitForQueueProcessing(manager: MCPManager, maxWait = 1000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const stats = manager.getStatistics();
    if (stats.queueSize === 0 && stats.activeRequests === 0) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('MCPManager with RequestQueue Integration', () => {
  let eventManager: EventManager;
  let websocketClient: any; // SafeMockWebSocket을 WebSocketClient로 사용
  let mcpManager: MCPManager;

  beforeEach(async () => {
    // Mock 초기화
    vi.clearAllMocks();
    
    // EventManager 생성
    eventManager = new EventManager();
    
          // WebSocketClient 생성
      websocketClient = createSafeMockWebSocket();
    
    // MCPManager 생성 (RequestQueue 통합 설정)
    const config = {
      enableToolRegistry: true,
      enableRequestQueue: true,
      enableStatistics: true,
      queueMaxSize: 10,
      queueProcessInterval: 5, // 더 빠른 처리를 위해 감소
      batchConfig: {
        maxBatchSize: 5,
        batchTimeout: 20, // 테스트 시간 단축
        enableParallel: true,
        maxParallel: 3
      }
    };
    
    mcpManager = new MCPManager(websocketClient, eventManager, config);
  });

  afterEach(async () => {
    // 순차적 정리
    if (mcpManager) {
      mcpManager.destroy();
    }
    
    if (websocketClient) {
      websocketClient.close();
    }
    
    vi.restoreAllMocks();
    
    // 모든 비동기 작업 완료 대기
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('초기화', () => {
    it('MCPManager가 올바르게 초기화되어야 함', () => {
      expect(mcpManager).toBeDefined();
      expect(mcpManager.isConnected()).toBe(false);
      expect(mcpManager.isReady()).toBe(false);
    });

    it('초기 통계가 올바르게 설정되어야 함', () => {
      const stats = mcpManager.getStatistics();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.queueSize).toBe(0);
      expect(stats.activeRequests).toBe(0);
      expect(stats.toolsRegistered).toBe(0);
      expect(stats.resourcesAvailable).toBe(0);
      expect(stats.promptsAvailable).toBe(0);
    });

    it('RequestQueue가 올바르게 초기화되어야 함', () => {
      const stats = mcpManager.getStatistics();
      expect(stats.queueSize).toBe(0);
      expect(stats.activeRequests).toBe(0);
    });
  });

  describe('도구 레지스트리', () => {
    it('등록된 도구 목록을 반환해야 함', () => {
      const tools = mcpManager.getRegisteredTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('도구 활성화/비활성화가 작동해야 함', async () => {
      // 테스트용 도구 등록
      await setupMockTools(mcpManager, ['test-tool']);
      
      // 등록된 도구 활성화/비활성화 테스트
      expect(mcpManager.setToolEnabled('test-tool', false)).toBe(true);
      expect(mcpManager.setToolEnabled('test-tool', true)).toBe(true);
      
      // 존재하지 않는 도구
      expect(mcpManager.setToolEnabled('nonexistent-tool', false)).toBe(false);
    });

    it('도구 레지스트리 새로고침이 작동해야 함', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Test tool 1', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool2', description: 'Test tool 2', inputSchema: { type: 'object', properties: {} } }
      ];

      vi.spyOn(mcpManager.getClient(), 'listTools').mockResolvedValue(mockTools);
      
      await mcpManager.refreshToolRegistry();
      
      const stats = mcpManager.getStatistics();
      expect(stats.toolsRegistered).toBe(2);
    });
  });

  describe('리소스 및 프롬프트', () => {
    it('사용 가능한 리소스 목록을 반환해야 함', () => {
      const resources = mcpManager.getAvailableResources();
      expect(Array.isArray(resources)).toBe(true);
    });

    it('사용 가능한 프롬프트 목록을 반환해야 함', () => {
      const prompts = mcpManager.getAvailablePrompts();
      expect(Array.isArray(prompts)).toBe(true);
    });
  });

  describe('RequestQueue 통합 테스트', () => {
    it('새로운 RequestQueue를 사용한 도구 호출이 작동해야 함', async () => {
      // Mock 도구 응답 설정
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpManager.getClient(), 'callTool').mockResolvedValue(mockResult);

      // 도구 등록
      await setupMockTools(mcpManager, ['test-tool']);

      // 도구 호출
      const result = await mcpManager.callTool('test-tool', { arg1: 'value1' });
      expect(result).toEqual(mockResult);

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
      expect(stats.successfulRequests).toBeGreaterThanOrEqual(1);
    }, 3000);

    it('우선순위 큐가 작동해야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpManager.getClient(), 'callTool').mockResolvedValue(mockResult);

      // 도구 등록
      await setupMockTools(mcpManager, ['test-tool-low', 'test-tool-high', 'test-tool-normal']);

      // 다양한 우선순위로 요청 생성
      const lowPriorityPromise = mcpManager.callTool('test-tool-low', {}, { priority: RequestPriority.LOW });
      const highPriorityPromise = mcpManager.callTool('test-tool-high', {}, { priority: RequestPriority.HIGH });
      const normalPriorityPromise = mcpManager.callTool('test-tool-normal', {}, { priority: RequestPriority.NORMAL });

      await Promise.all([lowPriorityPromise, highPriorityPromise, normalPriorityPromise]);

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(3);
      expect(stats.successfulRequests).toBeGreaterThanOrEqual(3);
    }, 3000);

    it('리소스 읽기가 RequestQueue를 통해 작동해야 함', async () => {
      const mockResource = { content: 'test resource content' };
      vi.spyOn(mcpManager.getClient(), 'readResource').mockResolvedValue(mockResource);

      const result = await mcpManager.readResource('test://resource/uri');
      expect(result).toEqual(mockResource);

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
      expect(stats.successfulRequests).toBeGreaterThanOrEqual(1);
    }, 3000);

    it('프롬프트 가져오기가 RequestQueue를 통해 작동해야 함', async () => {
      const mockPrompt = { content: 'test prompt content' };
      vi.spyOn(mcpManager.getClient(), 'getPrompt').mockResolvedValue(mockPrompt);

      const result = await mcpManager.getPrompt('test-prompt', { arg1: 'value1' });
      expect(result).toEqual(mockPrompt);

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
      expect(stats.successfulRequests).toBeGreaterThanOrEqual(1);
    }, 3000);

    it('RequestQueue 통계가 올바르게 업데이트되어야 함', async () => {
      const mockResult = { result: 'test success' };
      vi.spyOn(mcpManager.getClient(), 'callTool').mockResolvedValue(mockResult);

      // 도구 등록
      await setupMockTools(mcpManager, ['test-tool-1', 'test-tool-2', 'test-tool-3']);

      // 여러 요청 실행
      await Promise.all([
        mcpManager.callTool('test-tool-1', {}),
        mcpManager.callTool('test-tool-2', {}),
        mcpManager.callTool('test-tool-3', {})
      ]);

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(3);
      expect(stats.successfulRequests).toBeGreaterThanOrEqual(3);
      expect(stats.failedRequests).toBe(0);
    }, 3000);

    it('큐 지우기가 작동해야 함', () => {
      mcpManager.clearQueue();
      
      const stats = mcpManager.getStatistics();
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('배치 요청 처리', () => {
    it('배치 요청이 올바르게 처리되어야 함', async () => {
      const mockResults = [
        { result: 'tool1 result' },
        { content: 'resource content' },
        { content: 'prompt content' }
      ];

      vi.spyOn(mcpManager.getClient(), 'callTool').mockResolvedValue(mockResults[0]);
      vi.spyOn(mcpManager.getClient(), 'readResource').mockResolvedValue(mockResults[1]);
      vi.spyOn(mcpManager.getClient(), 'getPrompt').mockResolvedValue(mockResults[2]);

      // 도구 등록
      await setupMockTools(mcpManager, ['test-tool']);

      const batchRequests = [
        { method: 'tools/call' as const, params: { name: 'test-tool', arguments: {} } },
        { method: 'resources/read' as const, params: { uri: 'test://resource' } },
        { method: 'prompts/get' as const, params: { name: 'test-prompt', arguments: {} } }
      ];

      const results = await mcpManager.executeBatch(batchRequests);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    }, 3000);
  });

  describe('에러 처리', () => {
    it('도구 호출 에러가 올바르게 처리되어야 함', async () => {
      const mockError = new Error('Tool execution failed');
      vi.spyOn(mcpManager.getClient(), 'callTool').mockRejectedValue(mockError);

      // 도구 등록
      await setupMockTools(mcpManager, ['failing-tool']);

      await expect(mcpManager.callTool('failing-tool', {})).rejects.toThrow('Tool execution failed');

      const stats = mcpManager.getStatistics();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(1);
      expect(stats.failedRequests).toBeGreaterThanOrEqual(1);
    }, 3000);

    it('매니저 파괴 후 요청이 거부되어야 함', async () => {
      // 별도의 매니저 인스턴스를 생성하여 테스트
      const testConfig = {
        enableToolRegistry: false,
        enableRequestQueue: true,
        enableStatistics: true,
        queueMaxSize: 10,
        queueProcessInterval: 10
      };
      
      const testManager = new MCPManager(websocketClient, eventManager, testConfig);

      testManager.destroy();

      await expect(testManager.callTool('test-tool', {})).rejects.toThrow();
    }, 3000);
  });

  describe('이벤트 처리', () => {
    it('MCP 준비 이벤트가 올바르게 처리되어야 함', async () => {
      // 도구 레지스트리를 비활성화하여 초기화 작업 건너뛰기
      const testConfig = {
        enableToolRegistry: false,
        enableRequestQueue: false,
        enableStatistics: true,
        queueMaxSize: 10,
        queueProcessInterval: 10
      };
      
      const testManager = new MCPManager(websocketClient, eventManager, testConfig);
      
      try {
        return Promise.race([
          new Promise<void>((resolve) => {
            eventManager.on('mcp-manager:ready', () => {
              expect(true).toBe(true);
              resolve();
            });

            // MCP 준비 이벤트 발생
            setTimeout(() => {
              eventManager.emit('mcp:ready');
            }, 10);
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Event timeout')), 500);
          })
        ]);
      } finally {
        testManager.destroy();
      }
    }, 1000);

    it('MCP 연결 해제 이벤트가 올바르게 처리되어야 함', async () => {
      return Promise.race([
        new Promise<void>((resolve) => {
          eventManager.on('mcp-manager:disconnected', () => {
            expect(true).toBe(true);
            resolve();
          });

          // MCP 연결 해제 이벤트 발생
          setTimeout(() => {
            eventManager.emit('mcp:disconnected');
          }, 10);
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Event timeout')), 500);
        })
      ]);
    }, 1000);

    it('MCP 에러 이벤트가 올바르게 처리되어야 함', async () => {
      return Promise.race([
        new Promise<void>((resolve) => {
          eventManager.on('mcp-manager:error', (event: any) => {
            expect(event.error).toBeDefined();
            resolve();
          });

          // MCP 에러 이벤트 발생
          setTimeout(() => {
            const testError = new Error('Test MCP error');
            eventManager.emit('mcp:error', { error: testError });
          }, 10);
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Event timeout')), 500);
        })
      ]);
    }, 1000);
  });

  describe('통계 및 모니터링', () => {
    it('통계가 올바르게 수집되어야 함', () => {
      const stats = mcpManager.getStatistics();
      
      expect(typeof stats.totalRequests).toBe('number');
      expect(typeof stats.successfulRequests).toBe('number');
      expect(typeof stats.failedRequests).toBe('number');
      expect(typeof stats.averageResponseTime).toBe('number');
      expect(typeof stats.queueSize).toBe('number');
      expect(typeof stats.activeRequests).toBe('number');
      expect(typeof stats.toolsRegistered).toBe('number');
      expect(typeof stats.resourcesAvailable).toBe('number');
      expect(typeof stats.promptsAvailable).toBe('number');
      expect(typeof stats.connectionUptime).toBe('number');
    });

    it('연결 상태 확인이 작동해야 함', () => {
      expect(typeof mcpManager.isConnected()).toBe('boolean');
      expect(typeof mcpManager.isReady()).toBe('boolean');
    });
  });

  describe('리소스 정리', () => {
    it('destroy 메서드가 올바르게 작동해야 함', () => {
      expect(() => mcpManager.destroy()).not.toThrow();
    });

    it('destroy 후 재사용 시 에러가 발생해야 함', async () => {
      mcpManager.destroy();
      
      await expect(mcpManager.callTool('test-tool', {})).rejects.toThrow('Manager destroyed');
    });
  });
});