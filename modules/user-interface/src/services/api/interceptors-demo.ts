/**
 * API Interceptors Demo
 * 인터셉터 사용법 예제 및 데모 코드
 */

import { APIClient } from './api-client.js';
import { 
  AuthTokenManager, 
  InterceptorManager, 
  DefaultInterceptors,
  setupAPIInterceptors,
  getAuthManager 
} from './interceptors.js';

/**
 * 기본 인터셉터 설정 예제
 */
export function demoBasicInterceptorSetup() {
  console.log('🔧 기본 인터셉터 설정 데모');
  
  // API 클라이언트 생성
  const apiClient = new APIClient({
    baseURL: '/api',
    timeout: 10000
  });

  // 기본 인터셉터 자동 설정
  setupAPIInterceptors(apiClient);
  
  console.log('✅ 기본 인터셉터가 설정되었습니다:');
  console.log('- 공통 헤더 추가');
  console.log('- 인증 토큰 자동 추가');
  console.log('- 캐시 헤더 관리');
  console.log('- CORS 헤더 처리');
  console.log('- 요청/응답 로깅');
  console.log('- 에러 처리');
  
  return apiClient;
}

/**
 * 커스텀 인터셉터 설정 예제
 */
export function demoCustomInterceptorSetup() {
  console.log('🛠️ 커스텀 인터셉터 설정 데모');
  
  const apiClient = new APIClient();
  
  // 커스텀 인터셉터 설정
  InterceptorManager.setupCustomInterceptors(apiClient, {
    authEnabled: true,      // 인증 토큰 사용
    loggingEnabled: false,  // 로깅 비활성화
    cacheEnabled: true,     // 캐시 헤더 사용
    corsEnabled: false,     // CORS 헤더 비활성화
    customRequestInterceptors: [
      // 커스텀 요청 인터셉터
      (config) => {
        config.headers = config.headers || {};
        config.headers['X-Custom-Header'] = 'MyApp';
        console.log('🔵 커스텀 요청 인터셉터 실행:', config.url);
        return config;
      }
    ],
    customResponseInterceptors: [
      // 커스텀 응답 인터셉터
      (response) => {
        console.log('🟢 커스텀 응답 인터셉터 실행:', response.status);
        return response;
      }
    ]
  });
  
  console.log('✅ 커스텀 인터셉터가 설정되었습니다');
  return apiClient;
}

/**
 * 인증 토큰 관리 예제
 */
export function demoAuthTokenManagement() {
  console.log('🔐 인증 토큰 관리 데모');
  
  // AuthTokenManager 직접 사용
  const authManager = new AuthTokenManager();
  
  // 토큰 설정
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.Lql4sKaGaiQQU5MhCduMNgYcAs3JNaUjdpOKd1_4LWE';
  authManager.setToken(sampleToken, 'refresh-token-123');
  
  console.log('토큰 설정됨:', authManager.getToken()?.substring(0, 20) + '...');
  console.log('토큰 유효성:', authManager.isTokenValid());
  console.log('Authorization 헤더:', authManager.getAuthHeader());
  
  // 글로벌 AuthManager 사용
  const globalAuthManager = getAuthManager();
  globalAuthManager.setToken(sampleToken);
  
  console.log('✅ 인증 토큰 관리 설정 완료');
  return authManager;
}

/**
 * 실제 API 요청 테스트 예제
 */
export async function demoAPIRequestWithInterceptors() {
  console.log('📡 인터셉터가 적용된 API 요청 데모');
  
  // API 클라이언트 설정
  const apiClient = demoBasicInterceptorSetup();
  
  // 인증 토큰 설정
  const authManager = getAuthManager();
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.Lql4sKaGaiQQU5MhCduMNgYcAs3JNaUjdpOKd1_4LWE';
  authManager.setToken(sampleToken);
  
  try {
    console.log('🔵 GET 요청 실행...');
    
    // GET 요청 (인터셉터가 자동으로 처리됨)
    const response = await apiClient.get('/users/me', {
      cache: true  // 캐시 헤더 추가됨
    });
    
    console.log('🟢 응답 수신:', response.status);
    console.log('📊 요청 통계:', apiClient.getStats());
    
  } catch (error) {
    console.log('🔴 에러 발생:', error instanceof Error ? error.message : String(error));
    console.log('🛠️ 에러 인터셉터가 자동으로 처리했습니다');
  }
}

/**
 * 개별 인터셉터 테스트
 */
export function demoIndividualInterceptors() {
  console.log('🧪 개별 인터셉터 테스트');
  
  const apiClient = new APIClient();
  
  // 개별 인터셉터 등록
  apiClient.addRequestInterceptor(DefaultInterceptors.authInterceptor);
  apiClient.addRequestInterceptor(DefaultInterceptors.commonHeadersInterceptor);
  apiClient.addResponseInterceptor(DefaultInterceptors.responseLoggingInterceptor);
  apiClient.addErrorInterceptor(DefaultInterceptors.errorHandlingInterceptor);
  
  console.log('✅ 개별 인터셉터 등록 완료');
  return apiClient;
}

/**
 * 전체 데모 실행
 */
export async function runInterceptorsDemo() {
  console.log('🎯 API 인터셉터 종합 데모 시작');
  console.log('='.repeat(50));
  
  try {
    // 1. 기본 설정 데모
    demoBasicInterceptorSetup();
    console.log();
    
    // 2. 커스텀 설정 데모
    demoCustomInterceptorSetup();
    console.log();
    
    // 3. 인증 관리 데모
    demoAuthTokenManagement();
    console.log();
    
    // 4. 개별 인터셉터 데모
    demoIndividualInterceptors();
    console.log();
    
    // 5. 실제 요청 데모 (주석 처리 - 실제 서버 필요)
    // await demoAPIRequestWithInterceptors();
    
    console.log('🎉 모든 인터셉터 데모가 완료되었습니다!');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ 데모 실행 중 오류:', error);
  }
}

// 자동 실행 (개발 환경에서만)
if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
  // 페이지 로드 후 데모 실행
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
      runInterceptorsDemo();
    });
  }
} 