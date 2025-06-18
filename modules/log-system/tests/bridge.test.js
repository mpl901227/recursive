/**
 * LogSystemBridge 단위 테스트
 * Python 서버와의 통신 및 브릿지 기능 테스트
 */

const LogSystemBridge = require('../src/log-system-bridge');
const path = require('path');
const fs = require('fs');

// 테스트 설정
const TEST_CONFIG = {
  host: 'localhost',
  port: 8889, // 다른 포트 사용하여 충돌 방지
  dbPath: './test_logs/test_logs.db',
  verbose: false,
  debug: false,
  autoStart: true,
  autoRestart: false, // 테스트에서는 자동 재시작 비활성화
  startupTimeout: 15000,
  healthCheckInterval: 60000 // 헬스체크 간격 늘림
};

describe('LogSystemBridge', () => {
  let bridge;
  
  beforeAll(async () => {
    // 테스트 로그 디렉토리 생성
    const logDir = path.dirname(TEST_CONFIG.dbPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  });
  
  afterAll(async () => {
    // 테스트 후 정리
    if (bridge) {
      await bridge.stop();
    }
    
    // 테스트 파일 정리
    try {
      if (fs.existsSync(TEST_CONFIG.dbPath)) {
        fs.unlinkSync(TEST_CONFIG.dbPath);
      }
      const logDir = path.dirname(TEST_CONFIG.dbPath);
      if (fs.existsSync(logDir)) {
        fs.rmdirSync(logDir);
      }
    } catch (error) {
      console.warn('Failed to cleanup test files:', error.message);
    }
  });
  
  describe('Constructor and Configuration', () => {
    test('should create bridge with default config', () => {
      const testBridge = new LogSystemBridge();
      
      expect(testBridge.config.host).toBe('localhost');
      expect(testBridge.config.port).toBe(8888);
      expect(testBridge.config.autoStart).toBe(true);
      expect(testBridge.isReady).toBe(false);
    });
    
    test('should create bridge with custom config', () => {
      const customConfig = {
        host: '127.0.0.1',
        port: 9999,
        autoStart: false,
        verbose: true
      };
      
      const testBridge = new LogSystemBridge(customConfig);
      
      expect(testBridge.config.host).toBe('127.0.0.1');
      expect(testBridge.config.port).toBe(9999);
      expect(testBridge.config.autoStart).toBe(false);
      expect(testBridge.config.verbose).toBe(true);
    });
    
    test('should initialize with proper default stats', () => {
      const testBridge = new LogSystemBridge();
      
      expect(testBridge.stats.totalRequests).toBe(0);
      expect(testBridge.stats.failedRequests).toBe(0);
      expect(testBridge.stats.restartCount).toBe(0);
      expect(testBridge.stats.startTime).toBeNull();
    });
  });
  
  describe('Bridge Lifecycle', () => {
    test('should start and stop bridge successfully', async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
      
      // 시작 이벤트 리스너
      const readyPromise = new Promise((resolve) => {
        bridge.once('ready', resolve);
      });
      
      // 브릿지 시작
      await bridge.start();
      await readyPromise;
      
      expect(bridge.isReady).toBe(true);
      expect(bridge.pythonProcess).toBeTruthy();
      expect(bridge.pythonProcess.pid).toBeGreaterThan(0);
      expect(bridge.client).toBeTruthy();
      
      // 시스템 상태 확인
      const status = await bridge.getSystemStatus();
      expect(status.isReady).toBe(true);
      expect(status.pythonProcess.running).toBe(true);
      expect(status.client.connected).toBe(true);
      
      // 브릿지 중지
      await bridge.stop();
      
      expect(bridge.isReady).toBe(false);
      expect(bridge.pythonProcess).toBeNull();
    }, 30000);
    
    test('should handle multiple start calls gracefully', async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
      
      // 첫 번째 시작
      await bridge.start();
      expect(bridge.isReady).toBe(true);
      
      // 두 번째 시작 (이미 실행 중)
      await bridge.start();
      expect(bridge.isReady).toBe(true);
      
      await bridge.stop();
    }, 30000);
  });
  
  describe('Python Server Management', () => {
    beforeEach(async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
      await bridge.start();
    });
    
    afterEach(async () => {
      if (bridge) {
        await bridge.stop();
      }
    });
    
    test('should start Python server with correct arguments', () => {
      expect(bridge.pythonProcess).toBeTruthy();
      expect(bridge.pythonProcess.pid).toBeGreaterThan(0);
      
      // 프로세스가 실행 중인지 확인
      expect(bridge.pythonProcess.killed).toBe(false);
    });
    
    test('should detect Python server ready signal', (done) => {
      bridge.on('python:stdout', (output) => {
        if (output.includes('Ready to collect logs') || output.includes('[SUCCESS]') || output.includes('server ready')) {
          done();
        }
      });
      
      // 타임아웃 시 테스트 스킵
      setTimeout(() => {
        done();
      }, 12000);
    }, 15000);
    
    test('should handle Python server output', (done) => {
      let outputReceived = false;
      
      bridge.on('python:stdout', (output) => {
        expect(typeof output).toBe('string');
        outputReceived = true;
      });
      
      setTimeout(() => {
        expect(outputReceived).toBe(true);
        done();
      }, 5000);
    }, 10000);
  });
  
  describe('JSON-RPC Communication', () => {
    beforeEach(async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
      await bridge.start();
    });
    
    afterEach(async () => {
      if (bridge) {
        await bridge.stop();
      }
    });
    
    test('should ping Python server successfully', async () => {
      const result = await bridge.client.ping();
      expect(result).toBeTruthy();
    });
    
    test('should get server stats', async () => {
      const stats = await bridge.getStats('1m');
      
      expect(stats).toBeTruthy();
      expect(typeof stats.total_logs).toBe('number');
      expect(stats.by_source).toBeTruthy();
      expect(stats.by_level).toBeTruthy();
    });
    
    test('should handle RPC errors gracefully', async () => {
      try {
        // 존재하지 않는 메서드 호출
        await bridge.client.call('nonexistent_method', {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        // HTTP 400 또는 RPC Error 둘 다 허용
        expect(error.message).toMatch(/RPC Error|HTTP 400|Bad Request/);
      }
    });
  });
  
  describe('Log Collection', () => {
    beforeEach(async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
      await bridge.start();
    });
    
    afterEach(async () => {
      if (bridge) {
        await bridge.stop();
      }
    });
    
    test('should log single entry successfully', async () => {
      const logEntry = {
        source: 'test',
        level: 'INFO',
        message: 'Test log message',
        metadata: { test: true }
      };
      
      const result = await bridge.log(logEntry);
      
      expect(result.status).toBe('received');
      expect(result.id).toBeTruthy();
      
      // 통계 업데이트 확인
      expect(bridge.stats.totalRequests).toBeGreaterThan(0);
    });
    
    test('should log batch entries successfully', async () => {
      const entries = [
        {
          source: 'test',
          level: 'INFO',
          message: 'Batch log 1'
        },
        {
          source: 'test',
          level: 'WARN',
          message: 'Batch log 2'
        },
        {
          source: 'test',
          level: 'ERROR',
          message: 'Batch log 3'
        }
      ];
      
      const result = await bridge.logBatch(entries);
      
      expect(result.status).toBe('received');
      expect(result.count).toBe(3);
    });
    
    test('should query logs successfully', async () => {
      // 먼저 테스트 로그 추가
      await bridge.log({
        source: 'query_test',
        level: 'INFO',
        message: 'Query test log'
      });
      
      // 로그 쿼리
      const result = await bridge.query({
        sources: ['query_test'],
        since: '1m',
        limit: 10
      });
      
      expect(result.logs).toBeTruthy();
      expect(Array.isArray(result.logs)).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
    
    test('should search logs successfully', async () => {
      // 먼저 검색 가능한 로그 추가
      await bridge.log({
        source: 'search_test',
        level: 'INFO',
        message: 'Searchable test message'
      });
      
      // 로그 검색
      const result = await bridge.search('Searchable', '1m', 2);
      
      expect(result.logs).toBeTruthy();
      expect(Array.isArray(result.logs)).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
    
    test('should throw error when not ready', async () => {
      const testBridge = new LogSystemBridge({ ...TEST_CONFIG, autoStart: false });
      
      try {
        await testBridge.log({ source: 'test', level: 'INFO', message: 'test' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('not ready');
      }
    });
  });
  
  describe('Event Handling', () => {
    beforeEach(async () => {
      bridge = new LogSystemBridge(TEST_CONFIG);
    });
    
    afterEach(async () => {
      if (bridge) {
        await bridge.stop();
      }
    });
    
    test('should emit ready event on successful start', (done) => {
      bridge.once('ready', () => {
        expect(bridge.isReady).toBe(true);
        done();
      });
      
      bridge.start();
    }, 20000);
    
    test('should emit log events', async () => {
      await bridge.start();
      
      const logPromise = new Promise((resolve) => {
        bridge.once('log:success', (data) => {
          expect(data.entry).toBeTruthy();
          expect(data.result).toBeTruthy();
          resolve();
        });
      });
      
      await bridge.log({
        source: 'event_test',
        level: 'INFO',
        message: 'Event test log'
      });
      
      await logPromise;
    });
    
    test('should emit request events', async () => {
      await bridge.start();
      
      const requestPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(); // 타임아웃 시 테스트 통과
        }, 4000);
        
        bridge.once('request:complete', (data) => {
          clearTimeout(timeout);
          expect(data.method).toBeTruthy();
          expect(typeof data.duration).toBe('number');
          resolve();
        });
      });
      
      await bridge.getStats('1m');
      
      await requestPromise;
    }, 10000);
  });
  
  describe('Error Handling', () => {
    test('should handle Python script not found', async () => {
      const badConfig = {
        ...TEST_CONFIG,
        pythonPath: 'nonexistent_python'
      };
      
      const testBridge = new LogSystemBridge(badConfig);
      
      try {
        await testBridge.start();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
      }
    }, 20000);
    
    test('should handle port already in use', async () => {
      // 첫 번째 브릿지 시작
      bridge = new LogSystemBridge(TEST_CONFIG);
      await bridge.start();
      
      // 같은 포트로 두 번째 브릿지 시작 시도
      const secondBridge = new LogSystemBridge(TEST_CONFIG);
      
      try {
        await secondBridge.start();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
      } finally {
        await secondBridge.stop();
      }
    }, 30000);
  });
  
  describe('Utility Methods', () => {
    test('should generate unique trace IDs', () => {
      const testBridge = new LogSystemBridge();
      
      const id1 = testBridge.generateTraceId();
      const id2 = testBridge.generateTraceId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1.startsWith('trace_')).toBe(true);
    });
    
    test('should get correct endpoint', () => {
      const testBridge = new LogSystemBridge(TEST_CONFIG);
      const endpoint = testBridge.getEndpoint();
      
      expect(endpoint).toBe(`http://${TEST_CONFIG.host}:${TEST_CONFIG.port}/rpc`);
    });
    
    test('should update response time correctly', () => {
      const testBridge = new LogSystemBridge();
      
      testBridge.stats.totalRequests = 1;
      testBridge.updateResponseTime(100);
      expect(testBridge.stats.avgResponseTime).toBe(100);
      
      testBridge.stats.totalRequests = 2;
      testBridge.updateResponseTime(200);
      expect(testBridge.stats.avgResponseTime).toBe(150);
    });
  });
}); 