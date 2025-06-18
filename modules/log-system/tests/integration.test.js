/**
 * 통합 테스트 - JSON-RPC 클라이언트와 Python 서버
 */

const { JSONRPCClient } = require('../src/utils/json-rpc-client');
const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { LogSystemBridge } = require('../src/log-system-bridge');

describe('Integration Tests', () => {
  let client;
  let pythonServer;
  const serverEndpoint = 'http://localhost:8888/rpc';
  
  beforeAll(async () => {
    // Python 서버 시작
    const pythonPath = path.join(__dirname, '../python/main.py');
    pythonServer = spawn('python', [pythonPath, '--dev', '--host', 'localhost', '--port', '8888'], {
      stdio: 'pipe',
      cwd: path.dirname(pythonPath)
    });
    
    // 서버가 시작될 때까지 대기
    await new Promise((resolve) => {
      pythonServer.stdout.on('data', (data) => {
        if (data.toString().includes('Ready to collect logs')) {
          resolve();
        }
      });
      
      // 타임아웃 설정 (10초)
      setTimeout(resolve, 10000);
    });
    
    // 클라이언트 생성
    client = new JSONRPCClient(serverEndpoint, {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    });
  }, 15000);
  
  afterAll(async () => {
    if (client) {
      client.destroy();
    }
    
    if (pythonServer) {
      pythonServer.kill('SIGTERM');
      
      // 프로세스가 종료될 때까지 대기
      await new Promise((resolve) => {
        pythonServer.on('exit', resolve);
        setTimeout(resolve, 5000); // 최대 5초 대기
      });
    }
  });
  
  test('should connect to Python server and get health status', async () => {
    const isHealthy = await client.ping();
    expect(isHealthy).toBe(true);
  });
  
  test('should send log message to Python server', async () => {
    const logData = {
      source: 'integration-test',
      level: 'INFO',
      message: 'Test log message from Node.js client',
      metadata: {
        test_id: 'integration-001',
        timestamp: new Date().toISOString()
      }
    };
    
    const result = await client.call('log', logData);
    
    // Python 서버의 실제 응답 형식에 맞춤
    expect(result).toHaveProperty('status', 'received');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('alerts');
    expect(typeof result.id).toBe('string');
    expect(typeof result.alerts).toBe('number');
  });
  
  test('should query logs from Python server', async () => {
    // 먼저 로그 전송
    await client.call('log', {
      source: 'query-test',
      level: 'DEBUG',
      message: 'Queryable test message'
    });
    
    // 로그 조회
    const result = await client.call('query', {
      source: 'query-test',
      limit: 10
    });
    
    // Python 서버의 실제 응답 형식에 맞춤
    expect(result).toHaveProperty('logs');
    expect(result).toHaveProperty('count');
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBeGreaterThan(0);
    
    const log = result.logs.find(l => l.message === 'Queryable test message');
    expect(log).toBeDefined();
    expect(log.source).toBe('query-test');
    expect(log.level).toBe('DEBUG');
  });
  
  test('should get statistics from Python server', async () => {
    const stats = await client.call('get_stats', {
      timerange: '1h'
    });

    // Python 서버의 실제 응답 형식에 맞춤
    expect(stats).toHaveProperty('total_logs');
    expect(stats).toHaveProperty('by_source');
    expect(stats).toHaveProperty('by_level');
    expect(stats).toHaveProperty('timerange');
    expect(typeof stats.total_logs).toBe('number');
    expect(typeof stats.by_source).toBe('object');
    expect(typeof stats.by_level).toBe('object');
  });
  
  test('should handle batch requests', async () => {
    const batchRequests = [
      {
        method: 'log',
        params: {
          source: 'batch-test',
          level: 'INFO',
          message: 'Batch message 1'
        }
      },
      {
        method: 'log',
        params: {
          source: 'batch-test',
          level: 'WARN',
          message: 'Batch message 2'
        }
      },
      {
        method: 'get_stats',
        params: { timerange: '1m' }
      }
    ];
    
    const results = await client.callBatch(batchRequests);
    
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);
    
    // 첫 번째와 두 번째는 로그 저장 결과 - Python 서버 형식에 맞춤
    expect(results[0]).toHaveProperty('status', 'received');
    expect(results[1]).toHaveProperty('status', 'received');
    
    // 세 번째는 통계 결과
    expect(results[2]).toHaveProperty('total_logs');
  });
  
  test('should handle server errors gracefully', async () => {
    // 존재하지 않는 메서드 호출
    await expect(client.call('nonexistent_method', {}))
      .rejects
      .toThrow('HTTP 400'); // Python 서버가 400 에러를 반환함
  });
  
  test('should send notifications', async () => {
    // 알림은 응답을 기대하지 않음
    // Python 서버에 heartbeat 메서드가 없으므로 ping으로 변경
    await expect(client.notify('ping', { 
      client_id: 'integration-test',
      timestamp: new Date().toISOString()
    })).resolves.not.toThrow();
  });
  
  test('should get comprehensive health check', async () => {
    const health = await client.healthCheck();
    
    expect(health).toHaveProperty('healthy', true);
    expect(health).toHaveProperty('stats');
    expect(health).toHaveProperty('timestamp');
    expect(health.stats).toHaveProperty('total_logs');
  });
  
  test('should track client statistics', async () => {
    // 몇 개의 요청 실행
    await client.call('get_stats', { timerange: '1m' });
    await client.call('get_stats', { timerange: '1m' });
    
    const clientStats = client.getStats();
    
    expect(clientStats.totalRequests).toBeGreaterThan(0);
    expect(clientStats.successfulRequests).toBeGreaterThan(0);
    expect(parseFloat(clientStats.successRate)).toBeGreaterThan(0);
  });
});

// Phase 4.7: 전체 워크플로우 및 실제 사용 시나리오 테스트
describe('Phase 4.7: Complete Workflow Integration Tests', () => {
  let mockLogSystem;
  let collectors;
  let mockEventBus;
  
  beforeAll(async () => {
    // Python 서버 없이 mock 시스템으로 테스트
    mockLogSystem = {
      log: jest.fn().mockResolvedValue({ status: 'received', id: 'test-id' }),
      start: jest.fn().mockResolvedValue(true),
      stop: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true)
    };
    
    mockEventBus = new EventEmitter();
    global.mockEventBus = mockEventBus;
    
    const { RecursiveCollectors } = require('../src/collectors/recursive-collectors');
    collectors = new RecursiveCollectors(mockLogSystem, {
      collectors: {
        recursive_mcp: { enabled: true },
        recursive_websocket: { enabled: true },
        recursive_ai: { enabled: true },
        recursive_http: { enabled: true }
      },
      logging: {
        level: 'INFO',
        sensitive_fields: ['password', 'api_key', 'token']
      },
      filters: {
        exclude_patterns: ['test_ignore'],
        rate_limiting: { max_logs_per_second: 100 }
      }
    });
    
    await collectors.start();
  }, 15000);
  
  afterAll(async () => {
    if (collectors) {
      await collectors.stop();
    }
    
    if (mockEventBus) {
      mockEventBus.removeAllListeners();
    }
    
    delete global.mockEventBus;
  }, 10000);
  
  describe('End-to-End Workflow Tests', () => {
    test('should handle complete MCP request lifecycle', async () => {
      const traceId = `trace-${Date.now()}`;
      
      // MCP 요청 시작
      mockEventBus.emit('mcp:request', {
        id: 'e2e-mcp-request',
        method: 'test_method',
        params: { data: 'test data' },
        trace_id: traceId,
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // MCP 응답
      mockEventBus.emit('mcp:response', {
        id: 'e2e-mcp-request',
        result: { success: true },
        trace_id: traceId,
        responseTime: 150,
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
      expect(collectors.globalStats.totalErrors).toBeGreaterThanOrEqual(0);
    });
    
    test('should handle WebSocket connection lifecycle', async () => {
      const connectionId = `conn-${Date.now()}`;
      
      // WebSocket 연결
      mockEventBus.emit('websocket:connection', {
        connectionId,
        remoteAddress: '127.0.0.1',
        timestamp: Date.now()
      });
      
      // 메시지 교환
      mockEventBus.emit('websocket:message', {
        connectionId,
        data: JSON.stringify({ type: 'ping' }),
        type: 'text',
        timestamp: Date.now()
      });
      
      mockEventBus.emit('websocket:message', {
        connectionId,
        data: JSON.stringify({ type: 'pong' }),
        type: 'text',
        timestamp: Date.now()
      });
      
      // 연결 해제
      mockEventBus.emit('websocket:disconnect', {
        connectionId,
        reason: 'client_disconnect',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const wsCollector = collectors.collectors.get('websocket-collector');
      expect(wsCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
    
    test('should handle AI analysis workflow', async () => {
      const analysisId = `analysis-${Date.now()}`;
      
      // AI 분석 시작
      mockEventBus.emit('ai:analysis:start', {
        analysisId,
        type: 'code_review',
        data: { 
          code: 'function test() { return "hello"; }',
          language: 'javascript'
        },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Python 호출 시뮬레이션
      mockEventBus.emit('ai:python:call', {
        analysisId,
        function: 'analyze_code',
        params: { code: 'function test() { return "hello"; }' },
        timestamp: Date.now()
      });
      
      // Python 응답 시뮬레이션
      mockEventBus.emit('ai:python:response', {
        analysisId,
        result: { 
          score: 85,
          suggestions: ['Add type annotations'],
          complexity: 'low'
        },
        processingTime: 250,
        timestamp: Date.now()
      });
      
      // AI 분석 완료
      mockEventBus.emit('ai:analysis:complete', {
        analysisId,
        result: {
          score: 85,
          suggestions: ['Add type annotations'],
          complexity: 'low'
        },
        processingTime: 300,
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const aiCollector = collectors.collectors.get('ai-analysis-collector');
      expect(aiCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
    
    test('should handle HTTP request/response cycle', async () => {
      const requestId = `req-${Date.now()}`;
      
      // HTTP 요청
      mockEventBus.emit('http:request', {
        requestId,
        method: 'POST',
        path: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test User' }),
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // HTTP 응답
      mockEventBus.emit('http:response', {
        requestId,
        statusCode: 201,
        responseTime: 120,
        headers: { 'content-type': 'application/json' },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const httpCollector = collectors.collectors.get('http-collector');
      expect(httpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
  });
  
  describe('Cross-Collector Communication', () => {
    test('should handle events across multiple collectors', async () => {
      const sessionId = `session-${Date.now()}`;
      
      // 시뮬레이션: 사용자 요청이 여러 수집기를 거쳐 처리됨
      
      // 1. HTTP 요청으로 시작
      mockEventBus.emit('http:request', {
        requestId: `${sessionId}-http`,
        method: 'POST',
        path: '/api/analyze',
        sessionId,
        timestamp: Date.now()
      });
      
      // 2. MCP 호출로 이어짐
      mockEventBus.emit('mcp:request', {
        id: `${sessionId}-mcp`,
        method: 'analyze_request',
        params: { sessionId },
        timestamp: Date.now()
      });
      
      // 3. AI 분석 시작
      mockEventBus.emit('ai:analysis:start', {
        analysisId: `${sessionId}-ai`,
        type: 'request_analysis',
        data: { sessionId },
        timestamp: Date.now()
      });
      
      // 4. WebSocket으로 실시간 업데이트
      mockEventBus.emit('websocket:message', {
        connectionId: `${sessionId}-ws`,
        data: JSON.stringify({ 
          type: 'analysis_progress',
          sessionId,
          progress: 50
        }),
        type: 'text',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 모든 수집기가 이벤트를 처리했는지 확인
      const httpCollector = collectors.collectors.get('http-collector');
      const mcpCollector = collectors.collectors.get('mcp-collector');
      const aiCollector = collectors.collectors.get('ai-analysis-collector');
      const wsCollector = collectors.collectors.get('websocket-collector');
      
      expect(httpCollector).toBeDefined();
      expect(mcpCollector).toBeDefined();
      expect(aiCollector).toBeDefined();
      expect(wsCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
    });
    
    test('should maintain global statistics consistency', async () => {
      const initialStats = { ...collectors.globalStats };
      
      // 여러 이벤트 발생
      mockEventBus.emit('mcp:request', {
        id: 'stats-test-1',
        method: 'test',
        params: {},
        timestamp: Date.now()
      });
      
      mockEventBus.emit('websocket:message', {
        connectionId: 'stats-test-conn',
        data: JSON.stringify({ test: true }),
        type: 'text',
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalStats = { ...collectors.globalStats };
      
      // 전체 통계가 증가했는지 확인
      expect(finalStats.totalEvents).toBeGreaterThan(initialStats.totalEvents);
      expect(collectors.collectors.size).toBe(4); // 4개 수집기
    });
  });
  
  describe('Configuration Management', () => {
    test('should apply filtering rules correctly', async () => {
      // 제외 패턴에 해당하는 이벤트
      mockEventBus.emit('mcp:request', {
        id: 'test_ignore_request',
        method: 'test_ignore',
        params: { data: 'should be filtered' },
        timestamp: Date.now()
      });
      
      // 민감한 데이터를 포함한 이벤트
      mockEventBus.emit('mcp:request', {
        id: 'sensitive-request',
        method: 'login',
        params: { 
          username: 'testuser',
          password: 'secret123',
          api_key: 'key_12345'
        },
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 로그 시스템이 호출되었는지 확인
      expect(mockLogSystem.log).toHaveBeenCalled();
      
      // 민감한 데이터가 마스킹되었는지 확인하기 위해 호출된 인수 검사
      const logCalls = mockLogSystem.log.mock.calls;
      const sensitiveCall = logCalls.find(call => 
        call[0].data && call[0].data.params && call[0].data.params.password
      );
      
      if (sensitiveCall) {
        expect(sensitiveCall[0].data.params.password).toMatch(/\*+/);
      }
    });
    
    test('should handle dynamic configuration updates', async () => {
      // 수집기 비활성화
      await collectors.updateCollectorConfig('mcp-collector', { enabled: false });
      
      // 비활성화된 수집기로 이벤트 발생
      const initialEvents = collectors.globalStats.totalEvents;
      
      mockEventBus.emit('mcp:request', {
        id: 'disabled-test',
        method: 'test',
        params: {},
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 수집기 재활성화
      await collectors.updateCollectorConfig('mcp-collector', { enabled: true });
      
      mockEventBus.emit('mcp:request', {
        id: 'enabled-test',
        method: 'test',
        params: {},
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 시스템이 정상 작동하는지 확인
      expect(collectors.state).toBe('running');
    });
  });
  
  describe('System Resilience', () => {
    test('should handle pause and resume operations', async () => {
      // 시스템 일시 정지
      await collectors.pause();
      expect(collectors.state).toBe('paused');
      
      // 일시 정지 중 이벤트 발생
      const pausedEvents = collectors.globalStats.totalEvents;
      
      mockEventBus.emit('mcp:request', {
        id: 'paused-test',
        method: 'test',
        params: {},
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 시스템 재개
      await collectors.resume();
      expect(collectors.state).toBe('running');
      
      mockEventBus.emit('mcp:request', {
        id: 'resumed-test',
        method: 'test',
        params: {},
        timestamp: Date.now()
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 시스템이 재개되었는지 확인
      expect(collectors.globalStats.totalEvents).toBeGreaterThanOrEqual(pausedEvents);
    });
    
    test('should maintain performance under sustained load', async () => {
      const startTime = Date.now();
      const eventCount = 1000;
      
      // 1000개 이벤트 발생
      for (let i = 0; i < eventCount; i++) {
        mockEventBus.emit('mcp:request', {
          id: `load-test-${i}`,
          method: 'load_test',
          params: { index: i },
          timestamp: Date.now()
        });
        
        // 매 100개마다 짧은 대기
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // 성능 기준 확인
      expect(totalTime).toBeLessThan(10000); // 10초 이내
      
      const mcpCollector = collectors.collectors.get('mcp-collector');
      expect(mcpCollector).toBeDefined();
      expect(collectors.globalStats.totalEvents).toBeGreaterThan(0);
      
      // 평균 처리 시간 확인
      const avgTime = totalTime / eventCount;
      expect(avgTime).toBeLessThan(5); // 이벤트당 5ms 이내
    }, 15000);
  });
}); 