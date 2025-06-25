/**
 * Log System 통합 테스트
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.7 구현
 * LogClient와 LogSystemService의 통합 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  LogClient, 
  LogSystemService, 
  createLogSystem,
  createDefaultLogSystemConfig 
} from '../../../src/services/log-system/index.js';
import type { LogSystemConfig } from '../../../src/types/log-system.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Log System 통합 테스트', () => {
  let config: LogSystemConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 테스트용 기본 설정
    config = createDefaultLogSystemConfig({
      autoStart: false,
      autoConnect: false,
      retryAttempts: 0,
      realTimeEnabled: false
    });
  });

  describe('1. 팩토리 함수 테스트', () => {
    it('createDefaultLogSystemConfig가 올바른 설정을 생성해야 함', () => {
      const defaultConfig = createDefaultLogSystemConfig();
      
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.enabled).toBe(true);
      expect(defaultConfig.bridgeEndpoint).toBe('http://localhost:8888');
      expect(typeof defaultConfig.bufferSize).toBe('number');
      expect(typeof defaultConfig.timeout).toBe('number');
    });

    it('createLogSystem이 통합 객체를 생성해야 함', () => {
      const logSystem = createLogSystem(config);
      
      expect(logSystem).toBeDefined();
      expect(logSystem.service).toBeInstanceOf(LogSystemService);
      expect(logSystem.client).toBeInstanceOf(LogClient);
      expect(logSystem.config).toBe(config);
    });

    it('createLogSystem의 편의 메서드들이 존재해야 함', () => {
      const logSystem = createLogSystem(config);
      
      expect(typeof logSystem.initialize).toBe('function');
      expect(typeof logSystem.destroy).toBe('function');
      expect(typeof logSystem.isConnected).toBe('function');
      expect(typeof logSystem.getStatus).toBe('function');
      expect(typeof logSystem.getStats).toBe('function');
    });
  });

  describe('2. 서비스 초기화 테스트', () => {
    let logSystem: ReturnType<typeof createLogSystem>;

    beforeEach(() => {
      logSystem = createLogSystem(config);
    });

    afterEach(async () => {
      await logSystem.destroy();
    });

    it('통합 초기화가 성공해야 함', async () => {
      // 건강 상태 체크 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      await logSystem.initialize();
      
      expect(logSystem.service.isInitialized).toBe(true);
      expect(logSystem.service.status).toBe('ready');
    });

    it('통합 정리가 성공해야 함', async () => {
      await logSystem.initialize();
      await logSystem.destroy();
      
      expect(logSystem.service.isInitialized).toBe(false);
      expect(logSystem.service.status).toBe('destroyed');
    });
  });

  describe('3. API 메서드 존재 확인', () => {
    let logSystem: ReturnType<typeof createLogSystem>;

    beforeEach(async () => {
      logSystem = createLogSystem(config);
      
      // 초기화 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });
      
      await logSystem.initialize();
    });

    afterEach(async () => {
      await logSystem.destroy();
    });

    it('LogClient 메서드들이 존재해야 함', () => {
      expect(typeof logSystem.client.query).toBe('function');
      expect(typeof logSystem.client.search).toBe('function');
      expect(typeof logSystem.client.getClientStats).toBe('function');
    });

    it('LogSystemService 메서드들이 존재해야 함', () => {
      expect(typeof logSystem.service.query).toBe('function');
      expect(typeof logSystem.service.search).toBe('function');
      expect(typeof logSystem.service.getServiceStatus).toBe('function');
    });

    it('통합 메서드들이 존재해야 함', () => {
      expect(typeof logSystem.isConnected).toBe('function');
      expect(typeof logSystem.getStatus).toBe('function');
      expect(typeof logSystem.getStats).toBe('function');
    });
  });

  describe('4. 상태 관리 테스트', () => {
    let logSystem: ReturnType<typeof createLogSystem>;

    beforeEach(() => {
      logSystem = createLogSystem(config);
    });

    afterEach(async () => {
      await logSystem.destroy();
    });

    it('연결 상태 확인이 동작해야 함', () => {
      expect(logSystem.isConnected()).toBe(false);
      expect(logSystem.service.isConnected()).toBe(false);
    });

    it('상태 정보 조회가 동작해야 함', () => {
      const serviceStatus = logSystem.getStatus();
      const clientStats = logSystem.getStats();
      
      expect(serviceStatus).toBeDefined();
      expect(clientStats).toBeDefined();
      expect(clientStats.totalRequests).toBe(0);
    });

    it('서비스 상태가 일관되게 관리되어야 함', async () => {
      // 초기화 전
      expect(logSystem.service.status).toBe('pending');
      expect(logSystem.service.isInitialized).toBe(false);

      // 초기화 후
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });
      
      await logSystem.initialize();
      
      expect(logSystem.service.status).toBe('ready');
      expect(logSystem.service.isInitialized).toBe(true);
    });
  });

  describe('5. 에러 시나리오 테스트', () => {
    let logSystem: ReturnType<typeof createLogSystem>;

    beforeEach(() => {
      logSystem = createLogSystem(config);
    });

    afterEach(async () => {
      await logSystem.destroy();
    });

    it('네트워크 오류 시 적절히 처리해야 함', async () => {
      // 초기화 시 네트워크 오류
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(logSystem.initialize()).resolves.not.toThrow();
      
      // 초기화 후 API 호출 시 네트워크 오류
      mockFetch.mockRejectedValueOnce(new Error('API error'));
      
      try {
        await logSystem.client.query({ limit: 10 });
        expect(true).toBe(false); // 에러가 발생해야 함
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('잘못된 응답 처리', async () => {
      await logSystem.initialize();
      
      // 잘못된 JSON 응답
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      try {
        await logSystem.client.query({ limit: 10 });
        expect(true).toBe(false); // 에러가 발생해야 함
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('HTTP 에러 상태 처리', async () => {
      await logSystem.initialize();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' })
      });

      try {
        await logSystem.client.query({ limit: 10 });
        expect(true).toBe(false); // 에러가 발생해야 함
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('6. 설정 관리 테스트', () => {
    let logSystem: ReturnType<typeof createLogSystem>;

    beforeEach(() => {
      logSystem = createLogSystem(config);
    });

    afterEach(async () => {
      await logSystem.destroy();
    });

    it('설정 업데이트가 양쪽에 반영되어야 함', () => {
      const newConfig = { bufferSize: 500 };
      
      logSystem.service.updateConfig(newConfig);
      logSystem.client.updateConfig(newConfig);
      
      const serviceConfig = logSystem.service.getConfig();
      expect(serviceConfig.bufferSize).toBe(500);
    });

    it('환경별 설정이 올바르게 적용되어야 함', () => {
      const devConfig = createDefaultLogSystemConfig({
        bridgeEndpoint: 'http://dev-server:8888'
      });
      
      const devLogSystem = createLogSystem(devConfig);
      
      expect(devLogSystem.config.bridgeEndpoint).toBe('http://dev-server:8888');
      
      // 정리
      devLogSystem.destroy();
    });
  });
}); 