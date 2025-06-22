/**
 * API Services Module
 * API 관련 서비스들의 진입점
 * FRONTEND_REFACTORING_PLAN.md Phase 4.5 구현
 */

import { APIClient } from './api-client.js';
import type { APIConfig, ServiceRegistry, EventManager } from '@/types';

/**
 * API 서비스 팩토리
 */
export class APIServiceFactory {
  /**
   * API 클라이언트 인스턴스를 생성합니다
   */
  static createAPIClient(config?: Partial<APIConfig>): APIClient {
    return new APIClient(config);
  }

  /**
   * API 클라이언트를 서비스 레지스트리에 등록합니다
   */
  static registerAPIClient(
    serviceRegistry: ServiceRegistry,
    eventManager?: EventManager,
    config?: Partial<APIConfig>
  ): APIClient {
    const apiClient = this.createAPIClient(config);
    
    // 이벤트 매니저 설정
    if (eventManager) {
      apiClient.setEventManager(eventManager);
    }
    
    // 서비스 레지스트리에 등록
    serviceRegistry.register('api-client', apiClient);
    
    console.info('✅ API Client registered to service registry');
    
    return apiClient;
  }

  /**
   * 기본 API 클라이언트 설정을 반환합니다
   */
  static getDefaultConfig(): Partial<APIConfig> {
    return {
      enabled: true,
      autoStart: true,
      retryCount: 3,
      timeout: 10000,
      baseURL: '/api',
      version: '1.0',
      headers: {
        'Content-Type': 'application/json'
      },
      interceptors: {
        useRequestInterceptor: true,
        useResponseInterceptor: true,
        useErrorInterceptor: true
      }
    };
  }
}

/**
 * API 서비스 설정 헬퍼
 */
export class APIServiceConfig {
  /**
   * 개발 환경용 설정
   */
  static development(): Partial<APIConfig> {
    return {
      ...APIServiceFactory.getDefaultConfig(),
      baseURL: 'http://localhost:3000/api',
      timeout: 15000,
      retryCount: 2
    };
  }

  /**
   * 프로덕션 환경용 설정
   */
  static production(): Partial<APIConfig> {
    return {
      ...APIServiceFactory.getDefaultConfig(),
      baseURL: '/api',
      timeout: 8000,
      retryCount: 1
    };
  }

  /**
   * 테스트 환경용 설정
   */
  static test(): Partial<APIConfig> {
    return {
      ...APIServiceFactory.getDefaultConfig(),
      baseURL: 'http://localhost:3001/api',
      timeout: 5000,
      retryCount: 0,
      enabled: false // 테스트에서는 기본적으로 비활성화
    };
  }
}

// 기본 내보내기
export { APIClient } from './api-client.js';
export * from './api-client.js';

// 인터셉터 모듈 내보내기
export { 
  AuthTokenManager, 
  RequestLogger, 
  CacheHeaderManager, 
  CORSHeaderManager, 
  DefaultInterceptors, 
  InterceptorManager 
} from './interceptors.js';

// 편의 함수들
export const createAPIClient = APIServiceFactory.createAPIClient;
export const registerAPIClient = APIServiceFactory.registerAPIClient;
export const getAPIConfig = APIServiceConfig;

// 인터셉터 데모 (개발용)
export { runInterceptorsDemo } from './interceptors-demo.js'; 