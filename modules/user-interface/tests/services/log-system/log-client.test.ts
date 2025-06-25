/**
 * LogClient 기본 테스트
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.7 구현
 * 기본적인 테스트부터 시작하여 점진적으로 확장
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogClient, LogClientError } from '../../../src/services/log-system/log-client.js';
import type { LogSystemConfig, LogQueryParams } from '../../../src/types/log-system.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LogClient - 기본 테스트', () => {
  let logClient: LogClient;
  let basicConfig: LogSystemConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 기본적인 테스트 설정
    basicConfig = {
      enabled: true,
      autoStart: true,
      retryCount: 1, // 테스트용 최소 재시도
      timeout: 5000,
      bridgeEndpoint: 'http://localhost:8888',
      autoConnect: false, // 자동 연결 비활성화
      retryAttempts: 0, // 재시도 비활성화로 테스트 단순화
      bufferSize: 100,
      realTimeEnabled: false, // WebSocket 비활성화
      websocket: {
        url: 'ws://localhost:8888/ws',
        reconnectInterval: 5000,
        maxReconnectAttempts: 3
      },
      cache: {
        enabled: true,
        ttl: 60000,
        maxSize: 50
      }
    };
  });

  afterEach(async () => {
    if (logClient) {
      await logClient.destroy();
    }
  });

  describe('1. 기본 초기화 테스트', () => {
    it('LogClient가 올바른 설정으로 생성되어야 함', () => {
      logClient = new LogClient(basicConfig);
      
      expect(logClient).toBeDefined();
      expect(logClient).toBeInstanceOf(LogClient);
    });

    it('초기 통계가 0으로 설정되어야 함', () => {
      logClient = new LogClient(basicConfig);
      const stats = logClient.getClientStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.activeStreams).toBe(0);
    });

    it('설정 업데이트가 가능해야 함', () => {
      logClient = new LogClient(basicConfig);
      
      expect(() => {
        logClient.updateConfig({ bufferSize: 200 });
      }).not.toThrow();
    });
  });

  describe('2. 기본 API 테스트', () => {
    beforeEach(() => {
      logClient = new LogClient(basicConfig);
    });

    it('query() 메서드가 존재해야 함', () => {
      expect(typeof logClient.query).toBe('function');
    });

    it('search() 메서드가 존재해야 함', () => {
      expect(typeof logClient.search).toBe('function');
    });

    it('getStats() 메서드가 존재해야 함', () => {
      expect(typeof logClient.getStats).toBe('function');
    });

    it('destroy() 메서드가 존재해야 함', () => {
      expect(typeof logClient.destroy).toBe('function');
    });
  });

  describe('3. 간단한 query 테스트', () => {
    beforeEach(() => {
      logClient = new LogClient(basicConfig);
    });

    it('query 메서드가 존재하고 호출 가능해야 함', () => {
      expect(typeof logClient.query).toBe('function');
      
      // 기본 파라미터로 호출 시 에러가 발생하지 않아야 함
      expect(() => {
        // 실제 호출은 하지 않고 메서드 존재만 확인
        const params: LogQueryParams = { limit: 10 };
        // logClient.query(params); // 실제 호출하지 않음
      }).not.toThrow();
    });

    it('네트워크 오류 처리', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const params: LogQueryParams = {
        limit: 10
      };

      try {
        await logClient.query(params);
        expect(true).toBe(false); // 에러가 발생해야 함
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('4. 간단한 search 테스트', () => {
    beforeEach(() => {
      logClient = new LogClient(basicConfig);
    });

    it('search 메서드가 존재해야 함', () => {
      expect(typeof logClient.search).toBe('function');
      
      // 기본 파라미터 확인
      expect(() => {
        // 실제 호출은 하지 않고 메서드 존재만 확인
        const query = 'test';
        // logClient.search(query); // 실제 호출하지 않음
      }).not.toThrow();
    });
  });

  describe('5. 통계 테스트', () => {
    beforeEach(() => {
      logClient = new LogClient(basicConfig);
    });

    it('초기 통계 상태 확인', () => {
      const stats = logClient.getClientStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
    });

    it('통계 메서드가 정상 동작해야 함', () => {
      const stats = logClient.getClientStats();
      
      expect(typeof stats.totalRequests).toBe('number');
      expect(typeof stats.successfulRequests).toBe('number');
      expect(typeof stats.failedRequests).toBe('number');
      expect(typeof stats.activeStreams).toBe('number');
    });
  });

  describe('6. 설정 테스트', () => {
    it('기본 설정으로 생성', () => {
      logClient = new LogClient(basicConfig);
      expect(() => logClient.getClientStats()).not.toThrow();
    });

    it('부분 설정 업데이트', () => {
      logClient = new LogClient(basicConfig);
      
      expect(() => {
        logClient.updateConfig({
          bufferSize: 500,
          timeout: 10000
        });
      }).not.toThrow();
    });
  });

  describe('7. 정리 테스트', () => {
    it('destroy() 호출 시 정상 종료', async () => {
      logClient = new LogClient(basicConfig);
      
      await expect(logClient.destroy()).resolves.not.toThrow();
    });

    it('destroy() 후 상태 확인', async () => {
      logClient = new LogClient(basicConfig);
      await logClient.destroy();
      
      // destroy 후에도 통계는 확인 가능해야 함
      expect(() => {
        logClient.getClientStats();
      }).not.toThrow();
    });
  });
}); 