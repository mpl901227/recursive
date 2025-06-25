/**
 * Log System Service Module
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.4 구현
 * 완전한 서비스 인덱스 파일
 */

// =============================================================================
// 📝 타입 정의 re-export
// =============================================================================
export type * from '../../types/log-system';

// =============================================================================
// 🔧 LogClient 관련 exports
// =============================================================================
export {
  LogClient,
  LogClientError,
  type LogClientStats
} from './log-client';

// =============================================================================
// 🏢 LogSystemService 관련 exports  
// =============================================================================
export {
  LogSystemService,
  LogSystemServiceError,
  type LogSystemServiceStatus,
  type LogSystemConnectionStatus,
  type ReconnectionConfig,
  type HealthCheckConfig
} from './log-service';

// =============================================================================
// 🌊 LogStreamService 관련 exports
// =============================================================================
export {
  LogStreamService,
  createLogStreamService
} from './log-stream-service';

// =============================================================================
// 🔗 MCP 통합
// =============================================================================
export {
  LogMCPTools,
  createLogMCPTools
} from '../mcp/log-mcp-tools';

export type {
  MCPLogTool,
  UIRoute
} from '../mcp/log-mcp-tools';

// =============================================================================
// 🏭 팩토리 함수들
// =============================================================================

import type { LogSystemConfig } from '../../types/log-system';
import type { EventManager } from '../../types/index';
import { LogClient } from './log-client';
import { LogSystemService } from './log-service';

/**
 * LogClient 팩토리 함수
 * @param config - LogClient 설정
 * @returns LogClient 인스턴스
 */
export function createLogClientInstance(config: LogSystemConfig): LogClient {
  return new LogClient(config);
}

/**
 * LogSystemService 팩토리 함수  
 * @param config - LogSystemService 설정
 * @param eventManager - EventManager 인스턴스 (선택사항)
 * @returns LogSystemService 인스턴스
 */
export function createLogSystemServiceInstance(
  config: LogSystemConfig,
  eventManager?: EventManager
): LogSystemService {
  return new LogSystemService(config, eventManager);
}

/**
 * 통합 로그 시스템 팩토리 함수
 * LogSystemService와 LogClient를 함께 생성하여 반환
 * @param config - 로그 시스템 설정
 * @param eventManager - EventManager 인스턴스 (선택사항)
 * @returns 통합 로그 시스템 객체
 */
export function createLogSystem(
  config: LogSystemConfig,
  eventManager?: EventManager
) {
  const service = createLogSystemServiceInstance(config, eventManager);
  const client = createLogClientInstance(config);
  
  return {
    service,
    client,
    config,
    
    // 편의 메서드들
    async initialize() {
      await service.initialize();
      return this;
    },
    
    async destroy() {
      await service.destroy();
      await client.destroy();
      return this;
    },
    
    isConnected() {
      return service.isConnected();
    },
    
    getStatus() {
      return service.getServiceStatus();
    },
    
    getStats() {
      return client.getClientStats();
    }
  };
}

// =============================================================================
// 📦 기본 내보내기
// =============================================================================

// 기본 내보내기는 통합 로그 시스템 생성 함수
export { createLogSystem as default };

// =============================================================================
// 🔮 향후 확장을 위한 구조
// =============================================================================

// 향후 Phase 2, 3에서 추가될 모듈들을 위한 예약된 구조
// export { LogAnalyticsService } from './log-analytics-service';
// export { LogSearchService } from './log-search-service';
// export { LogWebSocketService } from './log-websocket-service';
// export { LogDashboardService } from './log-dashboard-service';

// =============================================================================
// 📊 유틸리티 함수들
// =============================================================================

/**
 * 기본 LogSystemConfig 생성 유틸리티
 * @param overrides - 기본값을 오버라이드할 설정
 * @returns 완전한 LogSystemConfig 객체
 */
export function createDefaultLogSystemConfig(
  overrides: Partial<LogSystemConfig> = {}
): LogSystemConfig {
  const defaultConfig: LogSystemConfig = {
    enabled: true,
    autoStart: true,
    retryCount: 3,
    timeout: 30000,
    bridgeEndpoint: 'http://localhost:8888',
    autoConnect: true,
    retryAttempts: 3,
    bufferSize: 1000,
    realTimeEnabled: true,
    websocket: {
      url: 'ws://localhost:8888/ws',
      reconnectInterval: 5000,
      maxReconnectAttempts: 5
    },
    cache: {
      enabled: true,
      ttl: 300000, // 5분
      maxSize: 100
    }
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * 환경별 LogSystemConfig 생성 유틸리티
 * @param environment - 환경 ('development', 'production', 'test')
 * @param overrides - 추가 설정 오버라이드
 * @returns 환경에 맞는 LogSystemConfig
 */
export function createEnvironmentLogSystemConfig(
  environment: 'development' | 'production' | 'test' = 'development',
  overrides: Partial<LogSystemConfig> = {}
): LogSystemConfig {
  const baseConfig = createDefaultLogSystemConfig();
  
  const environmentConfigs: Record<string, Partial<LogSystemConfig>> = {
    development: {
      bridgeEndpoint: 'http://localhost:8888',
      websocket: {
        url: 'ws://localhost:8888/ws',
        reconnectInterval: baseConfig.websocket?.reconnectInterval || 5000,
        maxReconnectAttempts: baseConfig.websocket?.maxReconnectAttempts || 5
      },
      cache: {
        enabled: baseConfig.cache?.enabled || true,
        ttl: 60000, // 1분 (개발용 짧은 캐시)
        maxSize: baseConfig.cache?.maxSize || 100
      }
    },
    production: {
      bridgeEndpoint: 'http://log-system:8888',
      websocket: {
        url: 'ws://log-system:8888/ws',
        reconnectInterval: baseConfig.websocket?.reconnectInterval || 5000,
        maxReconnectAttempts: 10
      },
      cache: {
        enabled: baseConfig.cache?.enabled || true,
        ttl: 600000, // 10분
        maxSize: 500
      },
      timeout: 60000 // 1분
    },
    test: {
      bridgeEndpoint: 'http://localhost:8888',  // 테스트도 동일한 포트 사용
      websocket: {
        url: 'ws://localhost:8888/ws',
        reconnectInterval: baseConfig.websocket?.reconnectInterval || 5000,
        maxReconnectAttempts: baseConfig.websocket?.maxReconnectAttempts || 5
      },
      cache: {
        enabled: false, // 테스트에서는 캐시 비활성화
        ttl: baseConfig.cache?.ttl || 300000,
        maxSize: baseConfig.cache?.maxSize || 100
      },
      realTimeEnabled: false, // 테스트에서는 실시간 기능 비활성화
      timeout: 5000 // 5초 (빠른 테스트)
    }
  };

  return {
    ...baseConfig,
    ...environmentConfigs[environment],
    ...overrides
  };
} 