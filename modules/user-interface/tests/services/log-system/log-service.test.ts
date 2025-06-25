/**
 * LogSystemService 기본 테스트
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.7 구현
 * 기본적인 서비스 테스트부터 시작하여 점진적으로 확장
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogSystemService, LogSystemServiceError } from '../../../src/services/log-system/log-service.js';
import type { LogSystemConfig } from '../../../src/types/log-system.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LogSystemService - 기본 테스트', () => {
  let logService: LogSystemService;
  let basicConfig: LogSystemConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 기본적인 테스트 설정
    basicConfig = {
      enabled: true,
      autoStart: false, // 자동 시작 비활성화로 테스트 제어
      retryCount: 1,
      timeout: 5000,
      bridgeEndpoint: 'http://localhost:8888',
      autoConnect: false,
      retryAttempts: 0,
      bufferSize: 100,
      realTimeEnabled: false,
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
    if (logService) {
      await logService.destroy();
    }
  });

  describe('1. 기본 초기화 테스트', () => {
    it('LogSystemService가 올바른 설정으로 생성되어야 함', () => {
      logService = new LogSystemService(basicConfig);
      
      expect(logService).toBeDefined();
      expect(logService).toBeInstanceOf(LogSystemService);
    });

    it('Service 속성들이 올바르게 설정되어야 함', () => {
      logService = new LogSystemService(basicConfig);
      
      expect(logService.name).toBe('log-system');
      expect(logService.version).toBe('1.0.0');
      expect(logService.isInitialized).toBe(false);
      expect(logService.status).toBe('pending');
    });

    it('초기 상태가 올바르게 설정되어야 함', () => {
      logService = new LogSystemService(basicConfig);
      const status = logService.getServiceStatus();
      
      expect(status.serviceStatus).toBe('pending');
      expect(status.connectionStatus).toBe('disconnected');
      expect(status.connectionAttempts).toBe(0);
    });
  });

  describe('2. 서비스 인터페이스 테스트', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('필수 Service 인터페이스 메서드들이 존재해야 함', () => {
      expect(typeof logService.initialize).toBe('function');
      expect(typeof logService.destroy).toBe('function');
      expect(typeof logService.getStatus).toBe('function');
    });

    it('LogSystem 전용 메서드들이 존재해야 함', () => {
      expect(typeof logService.isConnected).toBe('function');
      expect(typeof logService.getServiceStatus).toBe('function');
      expect(typeof logService.query).toBe('function');
      expect(typeof logService.search).toBe('function');
    });

    it('getStatus()가 올바른 값을 반환해야 함', () => {
      const status = logService.getStatus();
      expect(['pending', 'ready', 'destroyed', 'error']).toContain(status);
    });
  });

  describe('3. 서비스 생명주기 테스트', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('initialize() 호출 시 초기화되어야 함', async () => {
      // 건강 상태 체크를 위한 성공 응답 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      await logService.initialize();
      
      expect(logService.isInitialized).toBe(true);
      expect(logService.status).toBe('ready');
    });

    it('destroy() 호출 시 정리되어야 함', async () => {
      await logService.initialize();
      await logService.destroy();
      
      expect(logService.isInitialized).toBe(false);
      expect(logService.status).toBe('destroyed');
    });

    it('중복 initialize() 호출 시 안전해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      await logService.initialize();
      await logService.initialize(); // 중복 호출
      
      expect(logService.isInitialized).toBe(true);
    });
  });

  describe('4. 연결 상태 테스트', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('초기 연결 상태가 false여야 함', () => {
      expect(logService.isConnected()).toBe(false);
    });

    it('서비스 상태 정보를 반환해야 함', () => {
      const status = logService.getServiceStatus();
      
      expect(status).toBeDefined();
      expect(typeof status.serviceStatus).toBe('string');
      expect(typeof status.connectionStatus).toBe('string');
      expect(typeof status.connectionAttempts).toBe('number');
      expect(typeof status.autoReconnectEnabled).toBe('boolean');
      expect(typeof status.activeStreams).toBe('number');
      expect(typeof status.uptimeSeconds).toBe('number');
    });
  });

  describe('5. API 메서드 존재 확인', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('query() 메서드가 존재해야 함', () => {
      expect(typeof logService.query).toBe('function');
    });

    it('search() 메서드가 존재해야 함', () => {
      expect(typeof logService.search).toBe('function');
    });

    it('getStats() 메서드가 존재해야 함', () => {
      expect(typeof logService.getStats).toBe('function');
    });

    it('connect() 메서드가 존재해야 함', () => {
      expect(typeof logService.connect).toBe('function');
    });
  });

  describe('6. 설정 관리 테스트', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('설정 업데이트가 가능해야 함', () => {
      expect(() => {
        logService.updateConfig({ bufferSize: 200 });
      }).not.toThrow();
    });

    it('설정 조회가 가능해야 함', () => {
      const config = logService.getConfig();
      expect(config).toBeDefined();
      expect(config.bridgeEndpoint).toBe('http://localhost:8888');
    });
  });

  describe('7. 에러 처리 테스트', () => {
    beforeEach(() => {
      logService = new LogSystemService(basicConfig);
    });

    it('네트워크 오류 시 적절히 처리해야 함', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // 초기화 시 네트워크 오류가 발생해도 예외가 발생하지 않아야 함
      await expect(logService.initialize()).resolves.not.toThrow();
    });

    it('잘못된 설정으로 생성 시에도 동작해야 함', () => {
      const invalidConfig = {
        ...basicConfig,
        bridgeEndpoint: '' // 잘못된 엔드포인트
      };

      expect(() => new LogSystemService(invalidConfig)).not.toThrow();
    });
  });
}); 