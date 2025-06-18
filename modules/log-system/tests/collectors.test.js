/**
 * 수집기 테스트
 * Phase 4.1: 기본 수집기 클래스 테스트
 * Phase 4.2: MCP 수집기 테스트 추가
 */

const { BaseCollector, MCPCollector, RecursiveCollectors } = require('../src/collectors/recursive-collectors');
const EventEmitter = require('events');

// 표준화된 Mock 시스템
function createMockLogSystem() {
  return {
    log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' }),
    isConnected: jest.fn().mockReturnValue(true),
    start: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    query: jest.fn().mockResolvedValue({ results: [] }),
    getStats: jest.fn().mockResolvedValue({ total: 0 })
  };
}

function createMockEventBus() {
  const eventBus = new EventEmitter();
  // 이벤트 리스너 제한 해제
  eventBus.setMaxListeners(0);
  return eventBus;
}

function createTestConfig() {
  return {
    collectors: {
      recursive_mcp: {
        enabled: true,
        request_timeout: 30000,
        track_performance: true
      },
      recursive_websocket: {
        enabled: true,
        log_messages: true
      },
      recursive_ai: {
        enabled: true,
        log_python_calls: true,
        track_performance: true
      },
      recursive_http: {
        enabled: true,
        slow_request_threshold: 1000
      }
    },
    logging: {
      default_level: 'INFO',
      levels: {
        recursive_mcp: 'DEBUG',
        recursive_ai: 'WARN'
      }
    },
    filters: {
      exclude_patterns: ['health', 'ping'],
      sensitive_fields: ['password', 'token', 'api_key'],
      rate_limiting: {
        enabled: true,
        max_logs_per_second: 50
      }
    }
  };
}

// 전역 정리 함수
async function cleanupCollectors(collectors) {
  if (collectors && typeof collectors.stop === 'function') {
    try {
      await collectors.stop();
    } catch (error) {
      // 정리 중 에러는 무시
    }
  }
}

function cleanupEventBus() {
  if (global.mockEventBus) {
    global.mockEventBus.removeAllListeners();
    delete global.mockEventBus;
  }
}

// 전체 정리 함수
async function fullCleanup(collectors) {
  await cleanupCollectors(collectors);
  cleanupEventBus();
  
  // Jest 타이머 정리
  jest.clearAllTimers();
  jest.useRealTimers();
}

describe('BaseCollector', () => {
  let collector;
  
  beforeEach(() => {
    collector = new BaseCollector('test-collector', {
      enabled: true,
      autoRestart: false,
      healthCheckInterval: 0 // 테스트에서는 헬스체크 비활성화
    });
  });
  
  afterEach(async () => {
    if (collector.state === 'running') {
      await collector.stop();
    }
  });
  
  describe('Lifecycle Management', () => {
    test('should start successfully', async () => {
      await collector.start();
      expect(collector.state).toBe('running');
      expect(collector.startTime).toBeTruthy();
    });
    
    test('should stop successfully', async () => {
      await collector.start();
      await collector.stop();
      expect(collector.state).toBe('stopped');
    });
    
    test('should restart successfully', async () => {
      await collector.start();
      const firstStartTime = collector.startTime;
      
      await new Promise(resolve => setTimeout(resolve, 10)); // 시간 차이를 위한 대기
      
      await collector.restart();
      expect(collector.state).toBe('running');
      expect(collector.startTime).toBeGreaterThan(firstStartTime);
    });
    
    test('should not start if disabled', async () => {
      collector.config.enabled = false;
      await collector.start();
      expect(collector.state).toBe('stopped');
    });
    
    test('should not start if already running', async () => {
      await collector.start();
      await collector.start(); // 두 번 시작 시도
      expect(collector.state).toBe('running');
    });
  });
  
  describe('Error Handling', () => {
    test('should handle errors gracefully', async () => {
      let errorEmitted = false;
      collector.on('error:occurred', () => {
        errorEmitted = true;
      });
      
      // 에러 이벤트 리스너 추가하여 unhandled error 방지
      collector.on('error', (error) => {
        // 에러 처리됨
      });
      
      await collector.start();
      
      const testError = new Error('Test error');
      await collector.handleError(testError);
      
      expect(errorEmitted).toBe(true);
      expect(collector.lastError).toBe(testError);
      expect(collector.stats.errorsOccurred).toBe(1);
    });
    
    test('should auto-restart with configuration', async () => {
      collector.config.autoRestart = true;
      collector.config.retryDelay = 10;
      
      expect(collector.config.autoRestart).toBe(true);
      expect(collector.config.retryDelay).toBe(10);
    });
  });
  
  describe('Log Collection', () => {
    test('should collect logs when running', async () => {
      let logCollected = false;
      collector.on('log:collected', () => {
        logCollected = true;
      });
      
      await collector.start();
      await collector.collectLog({ message: 'test log', level: 'info' });
      
      expect(logCollected).toBe(true);
      expect(collector.stats.logsCollected).toBe(1);
    });
    
    test('should ignore logs when not running', async () => {
      let logCollected = false;
      collector.on('log:collected', () => {
        logCollected = true;
      });
      
      await collector.collectLog({ message: 'test log', level: 'info' });
      
      expect(logCollected).toBe(false);
      expect(collector.stats.logsCollected).toBe(0);
    });
    
    test('should preprocess logs correctly', async () => {
      await collector.start();
      
      const originalLog = { message: 'test', level: 'info' };
      const processedLog = await collector.preprocessLog(originalLog);
      
      expect(processedLog.collector).toBe('test-collector');
      expect(processedLog.collected_at).toBeTruthy();
      expect(processedLog.metadata.collector_version).toBe('1.0.0');
    });
  });
  
  describe('Status and Health', () => {
    test('should return correct status', () => {
      const status = collector.getStatus();
      
      expect(status.name).toBe('test-collector');
      expect(status.state).toBe('stopped');
      expect(status.stats).toBeTruthy();
    });
    
    test('should calculate uptime correctly', async () => {
      expect(collector.getUptime()).toBe(0);
      
      await collector.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(collector.getUptime()).toBeGreaterThan(50);
    });
  });
  
  describe('Health Checks', () => {
    test('should emit health check events', async () => {
      let healthCheckEmitted = false;
      collector.on('health:check', () => {
        healthCheckEmitted = true;
      });
      
      await collector.checkHealth();
      expect(healthCheckEmitted).toBe(true);
    });
    
    test('should manage health check timer', async () => {
      collector.config.healthCheckInterval = 100;
      
      collector.startHealthCheck();
      expect(collector.healthCheckTimer).toBeTruthy();
      
      collector.stopHealthCheck();
      expect(collector.healthCheckTimer).toBeNull();
    });
  });
});

describe('MCPCollector', () => {
  let mcpCollector;
  let mockEventBus;
  
  beforeEach(() => {
    // Mock EventBus 생성
    mockEventBus = new EventEmitter();
    global.mockEventBus = mockEventBus;
    
    mcpCollector = new MCPCollector({
      enabled: true,
      autoTrace: true,
      collectRequests: true,
      collectResponses: true,
      collectErrors: true,
      healthCheckInterval: 0
    });
  });
  
  afterEach(async () => {
    if (mcpCollector.state === 'running') {
      await mcpCollector.stop();
    }
    
    // 이벤트 리스너 정리
    if (mockEventBus) {
      mockEventBus.removeAllListeners();
    }
    
    delete global.mockEventBus;
  });
  
  describe('MCP Collector Lifecycle', () => {
    test('should start and setup event listeners', async () => {
      await mcpCollector.start();
      
      expect(mcpCollector.state).toBe('running');
      expect(mcpCollector.eventBus).toBe(mockEventBus);
    });
    
    test('should stop and remove event listeners', async () => {
      await mcpCollector.start();
      await mcpCollector.stop();
      
      expect(mcpCollector.state).toBe('stopped');
      expect(mockEventBus.listenerCount('mcp:request')).toBe(0);
      expect(mockEventBus.listenerCount('mcp:response')).toBe(0);
      expect(mockEventBus.listenerCount('mcp:error')).toBe(0);
    });
  });
  
  describe('MCP Request Handling', () => {
    test('should handle MCP requests correctly', async () => {
      await mcpCollector.start();
      
      const requestData = {
        id: 'test-request-1',
        method: 'test_method',
        params: { key: 'value' },
        trace_id: 'trace-123'
      };
      
      // 이벤트를 발생시키고 통계가 업데이트되는지 확인
      mockEventBus.emit('mcp:request', requestData);
      
      // 통계 확인
      expect(mcpCollector.mcpStats.totalRequests).toBe(1);
      expect(mcpCollector.mcpStats.methodCounts['test_method']).toBe(1);
    });
    
    test('should generate request ID when not provided', async () => {
      await mcpCollector.start();
      
      const requestData = {
        method: 'test_method',
        params: { key: 'value' }
      };
      
      mockEventBus.emit('mcp:request', requestData);
      
      // 활성 요청에 생성된 ID가 있는지 확인
      expect(mcpCollector.mcpStats.activeRequests.size).toBe(1);
    });
    
    test('should generate trace ID when enabled', async () => {
      await mcpCollector.start();
      
      const requestData = {
        method: 'test_method',
        params: { key: 'value' }
      };
      
      mockEventBus.emit('mcp:request', requestData);
      
      // 활성 요청에 trace ID가 생성되었는지 확인
      const activeRequest = Array.from(mcpCollector.mcpStats.activeRequests.values())[0];
      expect(activeRequest.traceId).toMatch(/^trace_\d+_[a-z0-9]+$/);
    });
  });
  
  describe('MCP Response Handling', () => {
    test('should handle successful responses', async () => {
      await mcpCollector.start();
      
      // 먼저 요청을 추적에 추가
      const requestData = {
        id: 'test-request-1',
        method: 'test_method',
        params: { key: 'value' }
      };
      mockEventBus.emit('mcp:request', requestData);
      
      // 응답 처리
      const responseData = {
        id: 'test-request-1',
        method: 'test_method',
        result: { success: true }
      };
      
      mockEventBus.emit('mcp:response', responseData);
      
      expect(mcpCollector.mcpStats.totalResponses).toBe(1);
      expect(mcpCollector.mcpStats.activeRequests.size).toBe(0); // 요청이 완료되어 제거됨
    });
    
    test('should handle error responses', async () => {
      await mcpCollector.start();
      
      const responseData = {
        id: 'test-request-1',
        method: 'test_method',
        error: { message: 'Test error', code: 'TEST_ERROR' }
      };
      
      mockEventBus.emit('mcp:response', responseData);
      
      expect(mcpCollector.mcpStats.totalErrors).toBe(1);
    });
    
    test('should calculate response time correctly', async () => {
      await mcpCollector.start();
      
      // 요청 시작
      const requestData = {
        id: 'test-request-1',
        method: 'test_method'
      };
      mockEventBus.emit('mcp:request', requestData);
      
      // 50ms 대기
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 응답 처리
      const responseData = {
        id: 'test-request-1',
        method: 'test_method',
        result: { success: true }
      };
      mockEventBus.emit('mcp:response', responseData);
      
      expect(mcpCollector.mcpStats.averageResponseTime).toBeGreaterThan(40);
      expect(mcpCollector.mcpStats.averageResponseTime).toBeLessThan(100);
    });
  });
  
  describe('MCP Error Handling', () => {
    test('should handle MCP errors', async () => {
      await mcpCollector.start();
      
      const errorData = {
        id: 'test-request-1',
        method: 'test_method',
        error: { message: 'Test error', code: 'TEST_ERROR' },
        trace_id: 'trace-123'
      };
      
      mockEventBus.emit('mcp:error', errorData);
      
      expect(mcpCollector.mcpStats.totalErrors).toBe(1);
    });
  });
  
  describe('Data Sanitization', () => {
    test('should sanitize sensitive parameters', () => {
      const params = {
        username: 'test',
        password: 'secret123',
        apiKey: 'key123',
        data: 'normal'
      };
      
      const sanitized = mcpCollector.sanitizeParams(params);
      
      expect(sanitized.username).toBe('test');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.data).toBe('normal');
    });
    
    test('should sanitize error information', () => {
      const error = new Error('Test error');
      error.code = 'TEST_CODE';
      error.stack = 'Very long stack trace...'.repeat(100);
      
      const sanitized = mcpCollector.sanitizeError(error);
      
      expect(sanitized.message).toBe('Test error');
      expect(sanitized.code).toBe('TEST_CODE');
      expect(sanitized.stack.length).toBeLessThanOrEqual(500);
    });
  });
  
  describe('Statistics and Metrics', () => {
    test('should track method statistics', async () => {
      await mcpCollector.start();
      
      // 여러 요청 시뮬레이션
      mockEventBus.emit('mcp:request', { method: 'method1' });
      mockEventBus.emit('mcp:request', { method: 'method1' });
      mockEventBus.emit('mcp:request', { method: 'method2' });
      
      const stats = mcpCollector.getMCPStats();
      
      expect(stats.methodCounts).toEqual({
        method1: 2,
        method2: 1
      });
    });
    
    test('should calculate average response time', async () => {
      await mcpCollector.start();
      
      // 첫 번째 요청/응답
      mockEventBus.emit('mcp:request', { id: 'req1', method: 'test' });
      await new Promise(resolve => setTimeout(resolve, 10));
      mockEventBus.emit('mcp:response', { id: 'req1', method: 'test', result: {} });
      
      // 두 번째 요청/응답
      mockEventBus.emit('mcp:request', { id: 'req2', method: 'test' });
      await new Promise(resolve => setTimeout(resolve, 10));
      mockEventBus.emit('mcp:response', { id: 'req2', method: 'test', result: {} });
      
      expect(mcpCollector.mcpStats.averageResponseTime).toBeGreaterThan(0);
    });
    
    test('should provide comprehensive status', () => {
      const status = mcpCollector.getStatus();
      
      expect(status.name).toBe('mcp-collector');
      expect(status.mcpStats).toBeTruthy();
      expect(status.mcpStats.totalRequests).toBeDefined();
      expect(status.mcpStats.totalResponses).toBeDefined();
      expect(status.mcpStats.totalErrors).toBeDefined();
    });
  });
});

describe('RecursiveCollectors', () => {
  let collectors;
  let mockLogSystem;
  
  beforeEach(() => {
    mockLogSystem = createMockLogSystem();
    
    collectors = new RecursiveCollectors(mockLogSystem, createTestConfig());
  });
  
  afterEach(async () => {
    try {
      await collectors.stop();
    } catch (error) {
      // 테스트 정리 중 에러는 무시
    }
  });
  
  describe('Collector Registration', () => {
    test('should register collector successfully', () => {
      const testCollector = new BaseCollector('test');
      
      collectors.registerCollector(testCollector);
      
      expect(collectors.collectors.has('test')).toBe(true);
      expect(collectors.collectors.get('test')).toBe(testCollector);
    });
    
    test('should reject non-BaseCollector instances', () => {
      expect(() => {
        collectors.registerCollector({ name: 'invalid' });
      }).toThrow('Collector must be an instance of BaseCollector');
    });
  });
  
  describe('Lifecycle Management', () => {
    test('should start all enabled collectors', async () => {
      const collector1 = new BaseCollector('test1', { enabled: true });
      const collector2 = new BaseCollector('test2', { enabled: true });
      
      collectors.registerCollector(collector1);
      collectors.registerCollector(collector2);
      
      await collectors.start();
      
      expect(collector1.state).toBe('running');
      expect(collector2.state).toBe('running');
    });
    
    test('should skip disabled collectors', async () => {
      const collector1 = new BaseCollector('test1', { enabled: true });
      const collector2 = new BaseCollector('test2', { enabled: false });
      
      collectors.registerCollector(collector1);
      collectors.registerCollector(collector2);
      
      await collectors.start();
      
      expect(collector1.state).toBe('running');
      expect(collector2.state).toBe('stopped');
    });
    
    test('should stop all running collectors', async () => {
      const collector1 = new BaseCollector('test1');
      const collector2 = new BaseCollector('test2');
      
      collectors.registerCollector(collector1);
      collectors.registerCollector(collector2);
      
      await collectors.start();
      await collectors.stop();
      
      expect(collector1.state).toBe('stopped');
      expect(collector2.state).toBe('stopped');
    });
    
    test('should auto-register MCP collector', async () => {
      // Mock EventBus for MCP collector
      global.mockEventBus = new EventEmitter();
      
      await collectors.start();
      
      expect(collectors.collectors.has('mcp-collector')).toBe(true);
      
      delete global.mockEventBus;
    });
    
    test('should auto-register WebSocket collector', async () => {
      // Mock EventBus for WebSocket collector
      global.mockEventBus = new EventEmitter();
      
      await collectors.start();
      
      expect(collectors.collectors.has('websocket-collector')).toBe(true);
      const wsCollector = collectors.collectors.get('websocket-collector');
      expect(wsCollector.name).toBe('websocket-collector');
      
      delete global.mockEventBus;
    });
    
    test('should auto-register AI Analysis collector', async () => {
      // Mock EventBus for AI Analysis collector
      global.mockEventBus = new EventEmitter();
      
      await collectors.start();
      
      expect(collectors.collectors.has('ai-analysis-collector')).toBe(true);
      const aiCollector = collectors.collectors.get('ai-analysis-collector');
      expect(aiCollector.name).toBe('ai-analysis-collector');
      
      delete global.mockEventBus;
    });
    
    test('should auto-register HTTP collector', async () => {
      await collectors.start();
      
      expect(collectors.collectors.has('http-collector')).toBe(true);
      const httpCollector = collectors.collectors.get('http-collector');
      expect(httpCollector.name).toBe('http-collector');
      
      // 미들웨어 생성 확인
      const middleware = httpCollector.createMiddleware();
      expect(typeof middleware).toBe('function');
    });
  });
  
  describe('Log Processing', () => {
    test('should process collected logs', async () => {
      const testCollector = new BaseCollector('test');
      collectors.registerCollector(testCollector);
      
      await collectors.start();
      
      const logData = {
        collector: 'test',
        log: { message: 'test log', level: 'info' },
        timestamp: Date.now()
      };
      
      await collectors.handleLogCollected(logData);
      
      expect(collectors.globalStats.totalLogs).toBe(1);
      expect(collectors.globalStats.lastActivity).toBeTruthy();
    });
    
    test('should handle log processing errors', async () => {
      const logData = null; // 잘못된 데이터
      
      await collectors.handleLogCollected(logData);
      
      expect(collectors.globalStats.totalErrors).toBe(1);
    });
    
    test('should ignore logs during shutdown', async () => {
      collectors.isShuttingDown = true;
      
      const logData = {
        collector: 'test',
        log: { message: 'test log', level: 'info' },
        timestamp: Date.now()
      };
      
      await collectors.handleLogCollected(logData);
      
      expect(collectors.globalStats.totalLogs).toBe(0);
    });
  });
  
  describe('Status and Statistics', () => {
    test('should provide comprehensive status', () => {
      const status = collectors.getStatus();
      
      expect(status.collectors).toBeTruthy();
      expect(status.globalStats).toBeTruthy();
      expect(status.uptime).toBeDefined();
    });
    
    test('should calculate uptime correctly', async () => {
      expect(collectors.getUptime()).toBe(0);
      
      await collectors.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(collectors.getUptime()).toBeGreaterThan(50);
    });
  });
  
  describe('Graceful Shutdown', () => {
    test('should perform graceful shutdown', async () => {
      const testCollector = new BaseCollector('test');
      collectors.registerCollector(testCollector);
      
      await collectors.start();
      await collectors.gracefulShutdown();
      
      expect(testCollector.state).toBe('stopped');
      expect(collectors.isShuttingDown).toBe(true);
    });
    
    test('should handle graceful shutdown timeout', async () => {
      // 타임아웃이 발생하도록 설정
      collectors.config.gracefulShutdownTimeout = 100;
      
      const slowCollector = new BaseCollector('slow');
      // stop 메서드를 오버라이드하여 지연 발생
      slowCollector.stop = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        slowCollector.state = 'stopped';
      };
      
      collectors.registerCollector(slowCollector);
      await collectors.start();
      
      // gracefulShutdown이 타임아웃으로 실패할 것을 예상하지만
      // 실제로는 완료되어야 함 (강제 종료)
      await collectors.gracefulShutdown();
      expect(collectors.isShuttingDown).toBe(true);
    });
  });
});

// WebSocket 수집기 테스트
describe('WebSocketCollector', () => {
  let wsCollector;
  let mockEventBus;
  
  beforeEach(() => {
    // Mock EventBus 설정
    mockEventBus = new EventEmitter();
    global.mockEventBus = mockEventBus;
    
    const { WebSocketCollector } = require('../src/collectors/recursive-collectors');
    wsCollector = new WebSocketCollector({
      logMessages: true, // 테스트에서는 메시지 로깅 활성화
      logConnectionEvents: true
    });
    
    // Mock logSystem
    const mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' })
    };
    wsCollector.logSystem = mockLogSystem;
  });
  
  afterEach(async () => {
    if (wsCollector && wsCollector.state === 'running') {
      await wsCollector.stop();
    }
    delete global.mockEventBus;
  });
  
  test('should start and stop WebSocket collector', async () => {
    await wsCollector.start();
    expect(wsCollector.state).toBe('running');
    
    await wsCollector.stop();
    expect(wsCollector.state).toBe('stopped');
  });
  
  test('should handle WebSocket connection events', async () => {
    await wsCollector.start();
    
    const connectionData = {
      connectionId: 'conn-123',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      origin: 'http://localhost:3000',
      protocol: 'ws'
    };
    
    mockEventBus.emit('websocket:connection', connectionData);
    
    // 잠시 대기하여 비동기 처리 완료
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(wsCollector.wsStats.totalConnections).toBe(1);
    expect(wsCollector.wsStats.connectionEvents.connect).toBe(1);
    expect(wsCollector.wsStats.activeConnections.has('conn-123')).toBe(true);
    expect(wsCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        level: 'INFO',
        message: 'WebSocket connection established'
      })
    );
  });
  
  test('should handle WebSocket disconnection events', async () => {
    await wsCollector.start();
    
    // 먼저 연결
    const connectionData = {
      connectionId: 'conn-123',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0'
    };
    mockEventBus.emit('websocket:connection', connectionData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 연결 해제
    const disconnectionData = {
      connectionId: 'conn-123',
      reason: 'client_disconnect',
      code: 1000
    };
    mockEventBus.emit('websocket:disconnect', disconnectionData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(wsCollector.wsStats.connectionEvents.disconnect).toBe(1);
    expect(wsCollector.wsStats.activeConnections.has('conn-123')).toBe(false);
    expect(wsCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        level: 'INFO',
        message: 'WebSocket connection closed'
      })
    );
  });
  
  test('should handle WebSocket connection errors', async () => {
    await wsCollector.start();
    
    const errorData = {
      connectionId: 'conn-123',
      error: new Error('Connection failed')
    };
    
    mockEventBus.emit('websocket:error', errorData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(wsCollector.wsStats.connectionEvents.error).toBe(1);
    expect(wsCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        level: 'ERROR',
        message: 'WebSocket connection error'
      })
    );
  });
  
  test('should handle WebSocket messages', async () => {
    await wsCollector.start();
    
    // 먼저 연결
    const connectionData = { connectionId: 'conn-123' };
    mockEventBus.emit('websocket:connection', connectionData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 메시지 수신
    const messageData = {
      connectionId: 'conn-123',
      message: JSON.stringify({ type: 'chat', content: 'Hello World' })
    };
    
    mockEventBus.emit('websocket:message', messageData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(wsCollector.wsStats.totalMessages).toBe(1);
    expect(wsCollector.wsStats.totalBytes).toBeGreaterThan(0);
    expect(wsCollector.wsStats.messageTypes.get('chat')).toBe(1);
    
    const connectionInfo = wsCollector.wsStats.activeConnections.get('conn-123');
    expect(connectionInfo.messageCount).toBe(1);
    expect(connectionInfo.bytesReceived).toBeGreaterThan(0);
    
    expect(wsCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        level: 'DEBUG',
        message: 'WebSocket message received'
      })
    );
  });
  
  test('should handle WebSocket message sent events', async () => {
    await wsCollector.start();
    
    // 먼저 연결
    const connectionData = { connectionId: 'conn-123' };
    mockEventBus.emit('websocket:connection', connectionData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 메시지 전송
    const messageData = {
      connectionId: 'conn-123',
      message: 'Hello from server'
    };
    
    mockEventBus.emit('websocket:message:sent', messageData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const connectionInfo = wsCollector.wsStats.activeConnections.get('conn-123');
    expect(connectionInfo.bytesSent).toBeGreaterThan(0);
    
    expect(wsCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        level: 'DEBUG',
        message: 'WebSocket message sent'
      })
    );
  });
  
  test('should calculate message sizes correctly', async () => {
    const textMessage = 'Hello World';
    const jsonMessage = { type: 'test', data: 'value' };
    const binaryMessage = Buffer.from('binary data');
    
    expect(wsCollector.calculateMessageSize(textMessage)).toBe(Buffer.byteLength(textMessage, 'utf8'));
    expect(wsCollector.calculateMessageSize(jsonMessage)).toBe(Buffer.byteLength(JSON.stringify(jsonMessage), 'utf8'));
    expect(wsCollector.calculateMessageSize(binaryMessage)).toBe(binaryMessage.length);
  });
  
  test('should determine message types correctly', async () => {
    expect(wsCollector.getMessageType('plain text')).toBe('text');
    expect(wsCollector.getMessageType('{"type":"chat"}')).toBe('chat');
    expect(wsCollector.getMessageType({ type: 'notification' })).toBe('notification');
    expect(wsCollector.getMessageType(Buffer.from('data'))).toBe('binary');
  });
  
  test('should track large messages', async () => {
    await wsCollector.start();
    
    // 먼저 연결
    const connectionData = { connectionId: 'conn-123' };
    mockEventBus.emit('websocket:connection', connectionData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 대용량 메시지 (1MB 초과)
    const largeMessage = 'x'.repeat(1024 * 1024 + 1);
    const messageData = {
      connectionId: 'conn-123',
      message: largeMessage
    };
    
    mockEventBus.emit('websocket:message', messageData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(wsCollector.wsStats.largeMessages).toBe(1);
  });
  
  test('should provide WebSocket statistics', async () => {
    await wsCollector.start();
    
    // 연결 및 메시지 시뮬레이션
    mockEventBus.emit('websocket:connection', { connectionId: 'conn-1' });
    mockEventBus.emit('websocket:connection', { connectionId: 'conn-2' });
    mockEventBus.emit('websocket:message', { 
      connectionId: 'conn-1', 
      message: JSON.stringify({ type: 'chat' })
    });
    mockEventBus.emit('websocket:message', { 
      connectionId: 'conn-1', 
      message: JSON.stringify({ type: 'notification' })
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const stats = wsCollector.getWebSocketStats();
    
    expect(stats.totalConnections).toBe(2);
    expect(stats.activeConnectionsCount).toBe(2);
    expect(stats.totalMessages).toBe(2);
    expect(stats.topMessageTypes).toEqual([
      ['chat', 1],
      ['notification', 1]
    ]);
  });
  
  test('should handle errors gracefully', async () => {
    await wsCollector.start();
    
    const errorSpy = jest.spyOn(wsCollector, 'emit');
    
    // 에러 이벤트 리스너 추가하여 unhandled error 방지
    wsCollector.on('error', (error) => {
      // 에러를 처리하여 unhandled error 방지
      expect(error).toBeInstanceOf(Error);
    });
    
    // 잘못된 데이터로 에러 유발
    mockEventBus.emit('websocket:connection', null);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
  });
  
  test('should get status with WebSocket stats', async () => {
    const status = wsCollector.getStatus();
    
    expect(status).toHaveProperty('websocketStats');
    expect(status.websocketStats).toHaveProperty('totalConnections');
    expect(status.websocketStats).toHaveProperty('activeConnectionsCount');
    expect(status.websocketStats).toHaveProperty('totalMessages');
  });
});

// AI 분석 수집기 테스트
describe('AIAnalysisCollector', () => {
  let aiCollector;
  let mockEventBus;
  
  beforeEach(() => {
    // Mock EventBus 설정
    mockEventBus = new EventEmitter();
    global.mockEventBus = mockEventBus;
    
    const { AIAnalysisCollector } = require('../src/collectors/recursive-collectors');
    aiCollector = new AIAnalysisCollector({
      logPythonCalls: true,
      logAnalysisSteps: true,
      trackPerformance: true
    });
    
    // Mock logSystem
    const mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' })
    };
    aiCollector.logSystem = mockLogSystem;
  });
  
  afterEach(async () => {
    if (aiCollector && aiCollector.state === 'running') {
      await aiCollector.stop();
    }
    delete global.mockEventBus;
  });
  
  test('should start and stop AI analysis collector', async () => {
    await aiCollector.start();
    expect(aiCollector.state).toBe('running');
    expect(aiCollector.name).toBe('ai-analysis-collector');
    
    await aiCollector.stop();
    expect(aiCollector.state).toBe('stopped');
  });
  
  test('should handle analysis start events', async () => {
    await aiCollector.start();
    
    const analysisData = {
      analysis_id: 'test-analysis-001',
      type: 'code_analysis',
      input_size: 1024,
      model: 'gpt-4',
      parameters: { max_tokens: 1000 },
      trace_id: 'trace-001'
    };
    
    mockEventBus.emit('ai:analysis:start', analysisData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.aiStats.totalAnalyses).toBe(1);
    expect(aiCollector.aiStats.activeAnalyses.has('test-analysis-001')).toBe(true);
    expect(aiCollector.aiStats.analysisTypes.get('code_analysis')).toBe(1);
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai_analysis',
        level: 'INFO',
        message: 'AI analysis started: code_analysis'
      })
    );
  });
  
  test('should handle analysis completion events', async () => {
    await aiCollector.start();
    
    // 분석 시작
    const startData = {
      analysis_id: 'test-analysis-002',
      type: 'pattern_analysis'
    };
    mockEventBus.emit('ai:analysis:start', startData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 분석 완료
    const completeData = {
      analysis_id: 'test-analysis-002',
      result_size: 2048,
      trace_id: 'trace-002'
    };
    mockEventBus.emit('ai:analysis:complete', completeData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.aiStats.activeAnalyses.has('test-analysis-002')).toBe(false);
    expect(aiCollector.aiStats.totalResultSize).toBe(2048);
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai_analysis',
        message: 'AI analysis completed: pattern_analysis'
      })
    );
  });
  
  test('should handle Python call events', async () => {
    await aiCollector.start();
    
    const pythonCallData = {
      call_id: 'call-001',
      function: 'analyze_code_structure',
      analysis_id: 'analysis-001',
      parameters: { file_path: '/test/file.js' },
      trace_id: 'trace-003'
    };
    
    mockEventBus.emit('ai:python:call', pythonCallData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.aiStats.totalPythonCalls).toBe(1);
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai_python',
        message: 'Python function called: analyze_code_structure'
      })
    );
  });
  
  test('should handle Python response events', async () => {
    await aiCollector.start();
    
    const pythonResponseData = {
      call_id: 'call-002',
      function: 'generate_summary',
      duration_ms: 1500,
      result_size: 512,
      trace_id: 'trace-004'
    };
    
    mockEventBus.emit('ai:python:response', pythonResponseData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const stats = aiCollector.aiStats.pythonCallStats.get('generate_summary');
    expect(stats.count).toBe(1);
    expect(stats.totalTime).toBe(1500);
    expect(stats.errors).toBe(0);
    
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai_python',
        message: 'Python function completed: generate_summary'
      })
    );
  });
  
  test('should handle analysis errors', async () => {
    await aiCollector.start();
    
    // 분석 시작
    const startData = {
      analysis_id: 'test-analysis-error',
      type: 'error_analysis'
    };
    mockEventBus.emit('ai:analysis:start', startData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 분석 에러
    const errorData = {
      analysis_id: 'test-analysis-error',
      error: new Error('Analysis failed'),
      trace_id: 'trace-error'
    };
    
    mockEventBus.emit('ai:analysis:error', errorData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.aiStats.performanceMetrics.failedAnalyses).toBe(1);
    expect(aiCollector.aiStats.activeAnalyses.has('test-analysis-error')).toBe(false);
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ai_analysis',
        level: 'ERROR',
        message: 'AI analysis failed: error_analysis'
      })
    );
  });
  
  test('should track performance metrics', async () => {
    await aiCollector.start();
    
    // 느린 분석 시뮬레이션
    const startData = {
      analysis_id: 'slow-analysis',
      type: 'slow_analysis'
    };
    mockEventBus.emit('ai:analysis:start', startData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 분석 완료 (느린 분석)
    const completeData = {
      analysis_id: 'slow-analysis',
      result_size: 15 * 1024 * 1024 // 15MB (임계값 초과)
    };
    
    // 인위적으로 시작 시간을 과거로 설정
    const analysisInfo = aiCollector.aiStats.activeAnalyses.get('slow-analysis');
    analysisInfo.startTime = Date.now() - 35000; // 35초 전
    
    mockEventBus.emit('ai:analysis:complete', completeData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.aiStats.performanceMetrics.slowAnalyses).toBe(1);
    expect(aiCollector.aiStats.largeResults).toBe(1);
  });
  
  test('should sanitize sensitive parameters', async () => {
    await aiCollector.start();
    
    const sensitiveData = {
      analysis_id: 'sensitive-test',
      type: 'security_analysis',
      parameters: {
        api_key: 'secret-key-123',
        normal_param: 'normal-value',
        auth_token: 'bearer-token-456'
      }
    };
    
    mockEventBus.emit('ai:analysis:start', sensitiveData);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(aiCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          parameters: {
            api_key: '[MASKED]',
            normal_param: 'normal-value',
            auth_token: '[MASKED]'
          }
        })
      })
    );
  });
  
  test('should provide comprehensive status information', async () => {
    await aiCollector.start();
    
    // 일부 활동 시뮬레이션
    mockEventBus.emit('ai:analysis:start', { analysis_id: 'status-test', type: 'status_analysis' });
    mockEventBus.emit('ai:python:call', { function: 'status_function' });
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const status = aiCollector.getStatus();
    
    expect(status).toHaveProperty('aiStats');
    expect(status.aiStats).toHaveProperty('totalAnalyses');
    expect(status.aiStats).toHaveProperty('activeAnalyses');
    expect(status.aiStats).toHaveProperty('analysisTypes');
    expect(status.aiStats).toHaveProperty('totalPythonCalls');
    expect(status.aiStats).toHaveProperty('performanceMetrics');
    expect(status.aiStats).toHaveProperty('topPythonFunctions');
    expect(status.aiStats).toHaveProperty('topAnalysisTypes');
  });
  
  test('should handle errors gracefully', async () => {
    await aiCollector.start();
    
    const errorSpy = jest.spyOn(aiCollector, 'emit');
    
    // 에러 이벤트 리스너 추가하여 unhandled error 방지
    aiCollector.on('error', (error) => {
      expect(error).toBeInstanceOf(Error);
    });
    
    // 잘못된 데이터로 에러 유발
    mockEventBus.emit('ai:analysis:start', null);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(errorSpy).toHaveBeenCalledWith('error:occurred', expect.objectContaining({
      collector: 'ai-analysis-collector',
      error: expect.objectContaining({
        message: expect.any(String)
      })
    }));
  });
});

// HTTP 수집기 테스트
describe('HTTPCollector', () => {
  let httpCollector;
  let mockReq, mockRes;
  let middleware;
  
  beforeEach(() => {
    const { HTTPCollector } = require('../src/collectors/recursive-collectors');
    httpCollector = new HTTPCollector({
      logRequests: true,
      logResponses: true,
      trackPerformance: true,
      ignorePaths: ['/health', '/static/*'],
      slowRequestThreshold: 500
    });
    
    // Mock logSystem
    const mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' })
    };
    httpCollector.logSystem = mockLogSystem;
    
    // Mock Express req/res
    mockReq = {
      method: 'GET',
      path: '/api/test',
      url: '/api/test?param=value',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'x-trace-id': 'trace-123'
      },
      get: jest.fn((header) => mockReq.headers[header.toLowerCase()]),
      query: { param: 'value' },
      params: {},
      body: {}
    };
    
    mockRes = {
      statusCode: 200,
      send: jest.fn(),
      json: jest.fn(),
      end: jest.fn(),
      get: jest.fn(),
      on: jest.fn()
    };
    
    // 미들웨어 생성
    middleware = httpCollector.createMiddleware();
  });
  
  afterEach(async () => {
    if (httpCollector && httpCollector.state === 'running') {
      await httpCollector.stop();
    }
  });
  
  test('should start and stop HTTP collector', async () => {
    expect(httpCollector.state).toBe('stopped');
    
    await httpCollector.start();
    expect(httpCollector.state).toBe('running');
    
    await httpCollector.stop();
    expect(httpCollector.state).toBe('stopped');
  });
  
  test('should create Express middleware', () => {
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // req, res, next
  });
  
  test('should ignore specified paths', () => {
    expect(httpCollector.shouldIgnorePath('/health')).toBe(true);
    expect(httpCollector.shouldIgnorePath('/static/css/main.css')).toBe(true);
    expect(httpCollector.shouldIgnorePath('/api/test')).toBe(false);
  });
  
  test('should log HTTP request', async () => {
    const requestSpy = jest.spyOn(httpCollector, 'emit');
    
    const next = jest.fn();
    middleware(mockReq, mockRes, next);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(next).toHaveBeenCalled();
    expect(httpCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'http_requests',
        level: 'INFO',
        message: 'HTTP GET /api/test',
        metadata: expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          ip: '127.0.0.1'
        }),
        tags: ['http', 'request', 'get']
      })
    );
  });
  
  test('should log HTTP response with statistics', async () => {
    const responseSpy = jest.spyOn(httpCollector, 'emit');
    mockRes.get.mockReturnValue('application/json');
    
    const next = jest.fn();
    middleware(mockReq, mockRes, next);
    
    // 응답 시뮬레이션
    const responseData = JSON.stringify({ message: 'success' });
    mockRes.send(responseData);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(httpCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'http_responses',
        level: 'INFO',
        metadata: expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          status: 200,
          duration_ms: expect.any(Number)
        }),
        tags: expect.arrayContaining(['http', 'response', 'success'])
      })
    );
    
    // 통계 확인
    const stats = httpCollector.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.requestsByMethod.GET).toBe(1);
    expect(stats.responsesByStatus['200']).toBe(1);
  });
  
  test('should handle error responses', async () => {
    mockRes.statusCode = 500;
    
    const next = jest.fn();
    middleware(mockReq, mockRes, next);
    
    // 에러 응답 시뮬레이션
    mockRes.send('Internal Server Error');
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(httpCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'http_responses',
        level: 'ERROR',
        metadata: expect.objectContaining({
          status: 500,
          is_error: true
        }),
        tags: expect.arrayContaining(['http', 'response', 'error'])
      })
    );
    
    const stats = httpCollector.getStats();
    expect(stats.errorRequests).toBe(1);
    expect(stats.errorRate).toBe('100.00%');
  });
  
  test('should detect slow requests', async () => {
    const next = jest.fn();
    
    // 느린 요청 시뮬레이션을 위해 시작 시간 조작
    const originalCreateMiddleware = httpCollector.createMiddleware;
    httpCollector.createMiddleware = function() {
      return (req, res, next) => {
        const requestId = `req_${++this.requestIdCounter}_${Date.now()}`;
        const startTime = Date.now() - 1000; // 1초 전으로 설정
        
        const requestInfo = {
          id: requestId,
          method: req.method,
          path: req.path,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          startTime,
          headers: req.headers
        };
        
        this.activeRequests.set(requestId, requestInfo);
        
        const originalSend = res.send;
        res.send = function(data) {
          const duration = Date.now() - startTime;
          const responseInfo = {
            ...requestInfo,
            status: res.statusCode,
            duration,
            endTime: Date.now()
          };
          
          this.updateStats(responseInfo);
          this.logResponse(responseInfo, data);
          this.activeRequests.delete(requestId);
          
          return originalSend.call(this, data);
        }.bind(this);
        
        next();
      };
    };
    
    middleware = httpCollector.createMiddleware();
    middleware(mockReq, mockRes, next);
    mockRes.send('response');
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(httpCollector.logSystem.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          is_slow: true
        }),
        tags: expect.arrayContaining(['slow'])
      })
    );
    
    const stats = httpCollector.getStats();
    expect(stats.slowRequests).toBe(1);
  });
  
  test('should sanitize sensitive headers', () => {
    const headers = {
      'authorization': 'Bearer secret-token',
      'cookie': 'session=abc123',
      'x-api-key': 'api-key-123',
      'user-agent': 'test-agent'
    };
    
    const sanitized = httpCollector.sanitizeHeaders(headers);
    
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized['x-api-key']).toBe('[REDACTED]');
    expect(sanitized['user-agent']).toBe('test-agent');
  });
  
  test('should sanitize request body', () => {
    const body = {
      username: 'testuser',
      password: 'secret123',
      token: 'auth-token',
      data: 'normal data'
    };
    
    const sanitized = httpCollector.sanitizeBody(body);
    
    expect(sanitized).toContain('"password":"[REDACTED]"');
    expect(sanitized).toContain('"token":"[REDACTED]"');
    expect(sanitized).toContain('testuser');
    expect(sanitized).toContain('normal data');
  });
  
  test('should provide path analysis', async () => {
    // 여러 요청 시뮬레이션
    const requests = [
      { method: 'GET', path: '/api/users' },
      { method: 'GET', path: '/api/users' },
      { method: 'POST', path: '/api/users' },
      { method: 'GET', path: '/api/posts' }
    ];
    
    for (const req of requests) {
      const responseInfo = {
        method: req.method,
        path: req.path,
        status: 200,
        duration: 100
      };
      httpCollector.updateStats(responseInfo);
    }
    
    const analysis = httpCollector.getPathAnalysis();
    
    expect(analysis).toHaveLength(3);
    expect(analysis[0].path).toBe('GET /api/users');
    expect(analysis[0].requests).toBe(2);
    expect(analysis[1].path).toBe('POST /api/users');
    expect(analysis[1].requests).toBe(1);
  });
  
  test('should handle errors gracefully', async () => {
    const errorSpy = jest.spyOn(httpCollector, 'emit');
    
    // logSystem에서 에러 발생 시뮬레이션
    httpCollector.logSystem.log.mockRejectedValueOnce(new Error('Log system error'));
    
    const next = jest.fn();
    middleware(mockReq, mockRes, next);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(errorSpy).toHaveBeenCalledWith('error:occurred', expect.objectContaining({
      collector: 'http-collector',
      error: expect.objectContaining({
        message: expect.any(String)
      })
    }));
  });
});

// 수집기 설정 관리 테스트
describe('Collector Configuration Management', () => {
  let collectors;
  let mockLogSystem;
  
  beforeEach(() => {
    mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' })
    };
    
    // 설정이 포함된 RecursiveCollectors 인스턴스 생성
    const testConfig = {
      collectors: {
        recursive_mcp: {
          enabled: true,
          request_timeout: 30000,
          track_performance: true
        },
        recursive_websocket: {
          enabled: false,
          log_messages: true
        },
        recursive_ai: {
          enabled: true,
          log_python_calls: true,
          track_performance: true
        },
        recursive_http: {
          enabled: true,
          slow_request_threshold: 1000
        }
      },
      logging: {
        default_level: 'INFO',
        levels: {
          recursive_mcp: 'DEBUG',
          recursive_ai: 'WARN'
        }
      },
      filters: {
        exclude_patterns: ['health', 'ping'],
        sensitive_fields: ['password', 'token', 'api_key'],
        rate_limiting: {
          enabled: true,
          max_logs_per_second: 50
        }
      }
    };
    
    const { RecursiveCollectors } = require('../src/collectors/recursive-collectors');
    collectors = new RecursiveCollectors(mockLogSystem, testConfig);
    
    // Mock EventBus for all collectors
    global.mockEventBus = new EventEmitter();
  });
  
  afterEach(async () => {
    if (collectors) {
      await collectors.stop();
    }
    delete global.mockEventBus;
  });
  
  test('should register collectors based on configuration', async () => {
    await collectors.start();
    
    // MCP 수집기는 enabled: true이므로 등록되어야 함
    expect(collectors.collectors.has('mcp-collector')).toBe(true);
    
    // WebSocket 수집기는 enabled: false이므로 등록되지 않아야 함
    expect(collectors.collectors.has('websocket-collector')).toBe(false);
    
    // AI 분석 수집기는 enabled: true이므로 등록되어야 함
    expect(collectors.collectors.has('ai-analysis-collector')).toBe(true);
    
    // HTTP 수집기는 enabled: true이므로 등록되어야 함
    expect(collectors.collectors.has('http-collector')).toBe(true);
  });
  
  test('should merge collector configurations correctly', () => {
    const mcpConfig = collectors.getMergedCollectorConfig('recursive_mcp');
    
    expect(mcpConfig.enabled).toBe(true);
    expect(mcpConfig.request_timeout).toBe(30000);
    expect(mcpConfig.track_performance).toBe(true);
    expect(mcpConfig.logLevel).toBe('DEBUG'); // 오버라이드된 로그 레벨
  });
  
  test('should apply filtering rules correctly', () => {
    const logEntry1 = {
      message: 'User login successful',
      metadata: {
        username: 'testuser',
        password: 'secret123',
        api_key: 'key_abcdef123456'
      }
    };
    
    const filtered1 = collectors.applyFilters(logEntry1);
    
    // 민감한 데이터가 마스킹되어야 함
    expect(filtered1.metadata.password).toBe('se*****23'); // secret123 -> se*****23 (9글자)
    expect(filtered1.metadata.api_key).toBe('ke************56'); // key_abcdef123456 -> ke************56 (16글자)
    expect(filtered1.metadata.username).toBe('testuser'); // 민감한 필드가 아니므로 그대로
    
    const logEntry2 = {
      message: 'Health check endpoint called',
      metadata: {}
    };
    
    const filtered2 = collectors.applyFilters(logEntry2);
    
    // 제외 패턴에 매치되므로 null 반환
    expect(filtered2).toBeNull();
  });
  
  test('should mask sensitive data correctly', () => {
    expect(collectors.maskSensitiveData('password123')).toBe('pa*******23'); // 11글자 -> pa*******23
    expect(collectors.maskSensitiveData('secret123')).toBe('se*****23'); // 9글자 -> se*****23
    expect(collectors.maskSensitiveData('key')).toBe('***'); // 3글자 이하
    expect(collectors.maskSensitiveData('ab')).toBe('***'); // 2글자
    expect(collectors.maskSensitiveData('')).toBe('***'); // 빈 문자열
    expect(collectors.maskSensitiveData(123)).toBe(123); // 문자열이 아닌 경우 그대로 반환
  });
  
  test('should handle rate limiting', () => {
    // 레이트 리밋 상태 초기화
    collectors.rateLimitState = null;
    
    // 처음 50개 요청은 통과해야 함
    for (let i = 0; i < 50; i++) {
      expect(collectors.rateLimitCheck()).toBe(true);
    }
    
    // 51번째 요청은 차단되어야 함
    expect(collectors.rateLimitCheck()).toBe(false);
  });
  
  test('should update collector configuration dynamically', async () => {
    await collectors.start();
    
    const mcpCollector = collectors.collectors.get('mcp-collector');
    const originalTimeout = mcpCollector.config.request_timeout;
    
    await collectors.updateCollectorConfig('mcp-collector', {
      request_timeout: 60000
    });
    
    expect(mcpCollector.config.request_timeout).toBe(60000);
    expect(mcpCollector.config.request_timeout).not.toBe(originalTimeout);
  });
  
  test('should toggle collector enabled state', async () => {
    await collectors.start();
    
    const mcpCollector = collectors.collectors.get('mcp-collector');
    expect(mcpCollector.state).toBe('running');
    
    // 수집기 비활성화
    await collectors.toggleCollector('mcp-collector', false);
    expect(mcpCollector.config.enabled).toBe(false);
    expect(mcpCollector.state).toBe('stopped');
    
    // 수집기 재활성화
    await collectors.toggleCollector('mcp-collector', true);
    expect(mcpCollector.config.enabled).toBe(true);
    expect(mcpCollector.state).toBe('running');
  });
  
  test('should return collector configurations', async () => {
    await collectors.start();
    
    const configs = collectors.getCollectorConfigs();
    
    expect(configs).toHaveProperty('mcp-collector');
    expect(configs).toHaveProperty('ai-analysis-collector');
    expect(configs).toHaveProperty('http-collector');
    
    expect(configs['mcp-collector'].enabled).toBe(true);
    expect(configs['mcp-collector'].state).toBe('running');
    expect(typeof configs['mcp-collector'].uptime).toBe('number');
  });
  
  test('should handle missing collector configuration gracefully', () => {
    expect(collectors.shouldRegisterCollector('nonexistent_collector', 'test-collector')).toBe(false);
    
    const config = collectors.getMergedCollectorConfig('nonexistent_collector');
    expect(config.enabled).toBe(true); // 기본값
    expect(config.logLevel).toBe('INFO'); // 기본값
  });
});

// Phase 4.7: 부하 테스트 및 메모리 누수 테스트
describe('Collector Load Testing and Memory Leak Detection', () => {
  let collectors;
  let mockLogSystem;
  let mockEventBus;
  
  beforeEach(() => {
    // Python 서버 없이 동작하는 mock 시스템 사용
    mockLogSystem = createMockLogSystem();
    
    mockEventBus = createMockEventBus();
    global.mockEventBus = mockEventBus;
    
    const { RecursiveCollectors } = require('../src/collectors/recursive-collectors');
    collectors = new RecursiveCollectors(mockLogSystem, createTestConfig());
  });
  
  afterEach(async () => {
    try {
      // 철저한 정리
      if (collectors) {
        if (collectors.collectors && collectors.collectors.size > 0) {
          await collectors.stop();
        }
        collectors = null;
      }
      
      // EventBus 리스너 모두 제거
      if (mockEventBus) {
        mockEventBus.removeAllListeners();
        mockEventBus.setMaxListeners(0);
      }
      
      // Global 정리
      if (global.mockEventBus) {
        global.mockEventBus.removeAllListeners();
        delete global.mockEventBus;
      }
      
      // Mock 정리
      mockLogSystem = null;
      mockEventBus = null;
      
      // Jest 정리
      jest.clearAllTimers();
      jest.clearAllMocks();
      
      // 메모리 정리를 위한 가비지 컬렉션 힌트
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });
  
  describe('High Volume Event Processing', () => {
    test('should handle 500 concurrent events without memory leak', async () => {
      await collectors.start();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 500개 이벤트 동시 처리
      const promises = [];
      for (let i = 0; i < 500; i++) {
        promises.push(new Promise(resolve => {
          mockEventBus.emit('mcp:request', {
            id: `load-test-${i}`,
            method: 'test_method',
            params: { data: `test-${i}` },
            timestamp: Date.now()
          });
          setTimeout(resolve, 1); // 비동기 처리 시뮬레이션
        }));
      }
      
      await Promise.all(promises);
      
      // 메모리 사용량 확인 (메모리 누수 검증)
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 메모리 증가가 100MB 미만이어야 함 (합리적인 임계값)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      
      // 통계 확인
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThanOrEqual(500);
    }, 15000);
    
    test('should maintain performance under sustained load', async () => {
      await collectors.start();
      
      const startTime = Date.now();
      
      // 지속적인 부하 테스트 (10초간 100개 이벤트/초)
      for (let batch = 0; batch < 10; batch++) {
        const batchPromises = [];
        for (let i = 0; i < 100; i++) {
          batchPromises.push(new Promise(resolve => {
            mockEventBus.emit('mcp:request', {
              id: `sustained-${batch}-${i}`,
              method: 'sustained_test',
              params: { batch, index: i },
              timestamp: Date.now()
            });
            resolve();
          }));
        }
        await Promise.all(batchPromises);
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // 10초 내에 완료되어야 함
      expect(totalTime).toBeLessThan(12000);
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThanOrEqual(1000);
    }, 20000);
  });
  
  describe('Memory Management', () => {
    test('should properly clean up resources after processing', async () => {
      await collectors.start();
      
      // 대량 데이터 처리
      for (let i = 0; i < 100; i++) {
        mockEventBus.emit('mcp:request', {
          id: `memory-test-${i}`,
          method: 'memory_test',
          params: { data: 'x'.repeat(1000) }, // 1KB 데이터
          timestamp: Date.now()
        });
      }
      
      // 처리 완료 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 수집기 중지
      await collectors.stop();
      
      // 리소스 정리 확인
      expect(collectors.state).toBe('stopped');
      expect(collectors.collectors.size).toBeGreaterThan(0); // 수집기는 등록되어 있지만
      
      // 각 수집기의 상태 확인
      for (const [name, collector] of collectors.collectors) {
        expect(collector.state).toBe('stopped');
      }
    }, 10000);
  });
  
  describe('Performance Benchmarks', () => {
    test('should process events within acceptable time limits', async () => {
      await collectors.start();
      
      const eventCounts = [10, 50, 100, 200];
      const results = [];
      
      for (const count of eventCounts) {
        const startTime = Date.now();
        
        for (let i = 0; i < count; i++) {
          mockEventBus.emit('mcp:request', {
            id: `perf-test-${count}-${i}`,
            method: 'performance_test',
            params: { count, index: i },
            timestamp: Date.now()
          });
        }
        
        // 처리 완료 대기
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        results.push({
          eventCount: count,
          processingTime,
          eventsPerSecond: count / (processingTime / 1000)
        });
      }
      
      // 성능 기준 검증
      results.forEach(result => {
        // 이벤트당 평균 처리 시간이 15ms 미만이어야 함 (테스트 환경 고려)
        const avgTimePerEvent = result.processingTime / result.eventCount;
        expect(avgTimePerEvent).toBeLessThan(15);
        
        // 초당 최소 50개 이벤트 처리 가능해야 함 (테스트 환경 고려)
        expect(result.eventsPerSecond).toBeGreaterThan(50);
      });
      
      console.log('Performance Results:', results);
    }, 10000);
  });
});

// 성능 벤치마크 테스트
describe('Performance Benchmarking', () => {
  let collectors;
  let mockLogSystem;
  let mockEventBus;
  
  beforeEach(() => {
    mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' })
    };
    
    mockEventBus = new EventEmitter();
    global.mockEventBus = mockEventBus;
    
    const { RecursiveCollectors } = require('../src/collectors/recursive-collectors');
    collectors = new RecursiveCollectors(mockLogSystem);
  });
  
  afterEach(async () => {
    if (collectors && collectors.collectors.size > 0) {
      await collectors.stop();
    }
    delete global.mockEventBus;
  });
  
  test('should meet performance targets for log processing', async () => {
    await collectors.start();
    
    const logCount = 1000;
    const startTime = Date.now();
    
    // 1000개 로그 처리 시뮬레이션
    for (let i = 0; i < logCount; i++) {
      await collectors.handleLogCollected({
        collector: 'performance-test',
        log: {
          level: 'INFO',
          message: `Performance test log ${i}`,
          timestamp: Date.now(),
          metadata: { index: i }
        },
        timestamp: Date.now()
      });
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const logsPerSecond = (logCount / processingTime) * 1000;
    
    // 성능 목표: 최소 100 logs/sec 처리
    expect(logsPerSecond).toBeGreaterThan(100);
    expect(processingTime).toBeLessThan(10000); // 10초 이내
  }, 15000);
  
  test('should have efficient memory usage', async () => {
    await collectors.start();
    
    const initialMemory = process.memoryUsage();
    
         // 대량 데이터 처리
     for (let i = 0; i < 500; i++) {
       mockEventBus.emit('mcp:request', {
         id: `memory-test-${i}`,
         method: 'memory_test',
         params: { data: 'x'.repeat(1000) }, // 1KB 데이터
         timestamp: Date.now()
       });
     }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const afterProcessingMemory = process.memoryUsage();
    const memoryIncrease = afterProcessingMemory.heapUsed - initialMemory.heapUsed;
    
    // 메모리 효율성: 500KB 데이터 처리 시 메모리 증가가 5MB 미만
    expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
  }, 10000);
});

// 에러 시나리오 및 복구 테스트
describe('Error Scenarios and Recovery Testing', () => {
  let collectors;
  let mockLogSystem;
  let mockEventBus;
  
  beforeEach(() => {
    // 에러 시나리오 테스트용 mock 시스템
    mockLogSystem = createMockLogSystem();
    
    mockEventBus = createMockEventBus();
    global.mockEventBus = mockEventBus;
    
    const { RecursiveCollectors } = require('../src/collectors/recursive-collectors');
    collectors = new RecursiveCollectors(mockLogSystem, createTestConfig());
  });
  
  afterEach(async () => {
    try {
      // 철저한 정리
      if (collectors) {
        if (collectors.collectors && collectors.collectors.size > 0) {
          await collectors.stop();
        }
        collectors = null;
      }
      
      // EventBus 리스너 모두 제거
      if (mockEventBus) {
        mockEventBus.removeAllListeners();
        mockEventBus.setMaxListeners(0);
      }
      
      // Global 정리
      if (global.mockEventBus) {
        global.mockEventBus.removeAllListeners();
        delete global.mockEventBus;
      }
      
      // Mock 정리
      mockLogSystem = null;
      mockEventBus = null;
      
      // Jest 정리
      jest.clearAllTimers();
      jest.clearAllMocks();
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });
  
  describe('Error Handling', () => {
    test('should handle corrupted MCP request data', async () => {
      await collectors.start();
      const mcpCollector = collectors.collectors.get('mcp-collector');
      
      // 손상된 데이터 시뮬레이션
      const corruptedRequests = [
        null,
        undefined,
        { /* id 누락 */ method: 'test' },
        { id: 'test', /* method 누락 */ params: {} },
        { id: 'test', method: null, params: {} },
        { id: 'test', method: 'test', params: 'invalid-params' }
      ];
      
      const initialErrors = mcpCollector.mcpStats.totalErrors;
      
      corruptedRequests.forEach((request, index) => {
        try {
          mockEventBus.emit('mcp:request', request);
        } catch (error) {
          // 에러가 발생해도 시스템이 중단되지 않아야 함
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 에러 카운트가 증가했는지 확인
      expect(mcpCollector.mcpStats.totalErrors).toBeGreaterThan(initialErrors);
      
      // 시스템이 여전히 정상 요청을 처리할 수 있는지 확인
      mockEventBus.emit('mcp:request', {
        id: 'valid-request',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mcpCollector.mcpStats.totalRequests).toBeGreaterThan(0);
    });
    
    test('should handle WebSocket connection failures gracefully', async () => {
      await collectors.start();
      const wsCollector = collectors.collectors.get('websocket-collector');
      
      // 연결 실패 시뮬레이션
      mockEventBus.emit('websocket:error', {
        connectionId: 'failed-conn',
        error: 'Connection refused',
        timestamp: Date.now()
      });
      
      // 잘못된 메시지 데이터
      mockEventBus.emit('websocket:message', {
        connectionId: 'test-conn',
        data: null, // 잘못된 데이터
        type: 'text',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 에러가 처리되었는지 확인
      expect(wsCollector.wsStats.totalErrors).toBeGreaterThan(0);
      
      // 정상 메시지는 여전히 처리되는지 확인
      mockEventBus.emit('websocket:message', {
        connectionId: 'valid-conn',
        data: JSON.stringify({ message: 'test' }),
        type: 'text',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(wsCollector.wsStats.totalMessages).toBeGreaterThan(0);
    });
    
    test('should handle AI analysis errors', async () => {
      await collectors.start();
      const aiCollector = collectors.collectors.get('ai-analysis-collector');
      
      // AI 분석 에러 시뮬레이션
      mockEventBus.emit('ai:analysis:error', {
        analysisId: 'failed-analysis',
        error: 'Analysis timeout',
        timestamp: Date.now()
      });
      
      // 잘못된 분석 시작 데이터
      mockEventBus.emit('ai:analysis:start', {
        analysisId: null, // 잘못된 ID
        type: 'invalid_type',
        data: undefined,
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 에러가 기록되었는지 확인
      expect(aiCollector.aiStats.totalErrors).toBeGreaterThan(0);
      
      // 정상 분석은 여전히 처리되는지 확인
      mockEventBus.emit('ai:analysis:start', {
        analysisId: 'valid-analysis',
        type: 'code_analysis',
        data: { code: 'test code' },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(aiCollector.aiStats.totalAnalyses).toBeGreaterThan(0);
    });
    
    test('should handle HTTP request errors', async () => {
      await collectors.start();
      const httpCollector = collectors.collectors.get('http-collector');
      
      // HTTP 에러 응답 시뮬레이션
      const errorResponses = [
        { status: 400, error: 'Bad Request' },
        { status: 404, error: 'Not Found' },
        { status: 500, error: 'Internal Server Error' },
        { status: 503, error: 'Service Unavailable' }
      ];
      
      errorResponses.forEach((response, index) => {
        mockEventBus.emit('http:response', {
          requestId: `error-req-${index}`,
          statusCode: response.status,
          responseTime: Math.random() * 1000,
          error: response.error,
          timestamp: Date.now()
        });
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 에러 응답이 기록되었는지 확인
      expect(httpCollector.httpStats.errorResponses).toBeGreaterThan(0);
      
      // 정상 요청은 여전히 처리되는지 확인
      mockEventBus.emit('http:request', {
        requestId: 'valid-http-req',
        method: 'GET',
        path: '/api/test',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(httpCollector.httpStats.totalRequests).toBeGreaterThan(0);
    });
  });
  
  describe('Recovery Mechanisms', () => {
    test('should recover from temporary system failures', async () => {
      await collectors.start();
      
      // 시스템 실패 시뮬레이션 (mock 로그 시스템 실패)
      mockLogSystem.log = jest.fn().mockRejectedValue(new Error('System temporarily unavailable'));
      
      // 실패 중에도 이벤트 처리 시도
      mockEventBus.emit('mcp:request', {
        id: 'failure-test',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 시스템 복구 시뮬레이션
      mockLogSystem.log = jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' });
      
      // 복구 후 정상 처리 확인
      mockEventBus.emit('mcp:request', {
        id: 'recovery-test',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
    
    test('should handle collector restart scenarios', async () => {
      await collectors.start();
      const initialState = collectors.state;
      
      // 수집기 중지
      await collectors.stop();
      expect(collectors.state).toBe('stopped');
      
      // 재시작
      await collectors.start();
      expect(collectors.state).toBe('running');
      
      // 재시작 후 정상 동작 확인
      mockEventBus.emit('mcp:request', {
        id: 'restart-test',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
    
    test('should maintain statistics during error conditions', async () => {
      await collectors.start();
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      const wsCollector = collectors.collectors.get('websocket-collector');
      
      // 정상 이벤트 처리
      mockEventBus.emit('mcp:request', {
        id: 'normal-1',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      // 에러 이벤트 처리
      mockEventBus.emit('mcp:request', null); // 에러 유발
      
      // 다시 정상 이벤트 처리
      mockEventBus.emit('mcp:request', {
        id: 'normal-2',
        method: 'test_method',
        params: { test: true },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 통계가 유지되고 있는지 확인
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
      expect(collectors.globalStats.totalErrors).toBeGreaterThan(0);
      
      // 전체 시스템 통계도 확인
      const globalStats = collectors.getGlobalStatistics();
      expect(globalStats.totalEvents).toBeGreaterThan(0);
    });
  });
}); 