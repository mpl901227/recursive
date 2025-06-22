/**
 * API Interceptors
 * API 요청/응답 처리를 위한 인터셉터 모음
 * FRONTEND_REFACTORING_PLAN.md Phase 4.6 구현
 */

import type { 
  RequestConfig, 
  APIResponse, 
  APIError, 
  RequestInterceptor, 
  ResponseInterceptor, 
  ErrorInterceptor 
} from './api-client.js';

/**
 * 인증 토큰 관리자
 */
export class AuthTokenManager {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenType: string = 'Bearer';
  private tokenKey: string = 'auth_token';
  private refreshTokenKey: string = 'refresh_token';

  constructor() {
    this.loadTokensFromStorage();
  }

  /**
   * 스토리지에서 토큰 로드
   */
  private loadTokensFromStorage(): void {
    try {
      this.token = localStorage.getItem(this.tokenKey);
      this.refreshToken = localStorage.getItem(this.refreshTokenKey);
    } catch (error) {
      console.warn('Failed to load tokens from storage:', error);
    }
  }

  /**
   * 토큰 설정
   */
  setToken(token: string, refreshToken?: string): void {
    this.token = token;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    this.saveTokensToStorage();
  }

  /**
   * 토큰 가져오기
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * 리프레시 토큰 가져오기
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * 토큰 유효성 검사
   */
  isTokenValid(): boolean {
    if (!this.token) return false;
    
    try {
      // JWT 토큰 파싱 (간단한 유효성 검사)
      const tokenParts = this.token.split('.');
      if (tokenParts.length !== 3) return false;
      
      const payload = JSON.parse(atob(tokenParts[1] || ''));
      const exp = payload.exp * 1000; // seconds to milliseconds
      return Date.now() < exp;
    } catch (error) {
      console.warn('Invalid token format:', error);
      return false;
    }
  }

  /**
   * 토큰 제거
   */
  clearTokens(): void {
    this.token = null;
    this.refreshToken = null;
    this.removeTokensFromStorage();
  }

  /**
   * 스토리지에 토큰 저장
   */
  private saveTokensToStorage(): void {
    try {
      if (this.token) {
        localStorage.setItem(this.tokenKey, this.token);
      }
      if (this.refreshToken) {
        localStorage.setItem(this.refreshTokenKey, this.refreshToken);
      }
    } catch (error) {
      console.warn('Failed to save tokens to storage:', error);
    }
  }

  /**
   * 스토리지에서 토큰 제거
   */
  private removeTokensFromStorage(): void {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshTokenKey);
    } catch (error) {
      console.warn('Failed to remove tokens from storage:', error);
    }
  }

  /**
   * Authorization 헤더 값 생성
   */
  getAuthHeader(): string | null {
    if (!this.token) return null;
    return `${this.tokenType} ${this.token}`;
  }
}

/**
 * 요청 로거
 */
export class RequestLogger {
  private isEnabled: boolean = true;
  private _logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  constructor(enabled: boolean = true, logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.isEnabled = enabled;
    this._logLevel = logLevel;
  }

  /**
   * 요청 로그
   */
  logRequest(config: RequestConfig): void {
    if (!this.isEnabled) return;

    const logData = {
      requestId: config.requestId,
      method: config.method,
      url: config.url,
      headers: this.sanitizeHeaders(config.headers),
      data: this.sanitizeData(config.data),
      timestamp: new Date().toISOString()
    };

    console.group(`🔵 API Request [${config.method}] ${config.url}`);
    console.log('Config:', logData);
    console.groupEnd();
  }

  /**
   * 응답 로그
   */
  logResponse(response: APIResponse): void {
    if (!this.isEnabled) return;

    const logData = {
      requestId: response.config.requestId,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: this.sanitizeData(response.data),
      duration: response.duration,
      timestamp: new Date().toISOString()
    };

    const statusColor = response.status >= 400 ? '🔴' : '🟢';
    console.group(`${statusColor} API Response [${response.status}] ${response.config.url}`);
    console.log('Response:', logData);
    console.groupEnd();
  }

  /**
   * 에러 로그
   */
  logError(error: APIError): void {
    if (!this.isEnabled) return;

    const logData = {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      url: error.url,
      data: error.data,
      duration: error.duration,
      timestamp: new Date().toISOString()
    };

    console.group(`🔴 API Error [${error.status}] ${error.url}`);
    console.error('Error:', logData);
    console.groupEnd();
  }

  /**
   * 헤더 정리 (민감한 정보 제거)
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};

    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
      if (sanitized[header.toLowerCase()]) {
        sanitized[header.toLowerCase()] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * 데이터 정리 (민감한 정보 제거)
   */
  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    try {
      const sanitized = JSON.parse(JSON.stringify(data));
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

      this.redactSensitiveFields(sanitized, sensitiveFields);
      return sanitized;
    } catch (error) {
      return '[Unable to sanitize data]';
    }
  }

  /**
   * 민감한 필드 제거
   */
  private redactSensitiveFields(obj: any, sensitiveFields: string[]): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.redactSensitiveFields(obj[key], sensitiveFields);
      }
    });
  }

  /**
   * 로깅 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * 로그 레벨 설정
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this._logLevel = level;
  }
}

/**
 * 캐시 헤더 매니저
 */
export class CacheHeaderManager {
  /**
   * 캐시 헤더 추가
   */
  static addCacheHeaders(config: RequestConfig): RequestConfig {
    if (!config.headers) {
      config.headers = {};
    }

    // GET 요청에 대한 캐시 설정
    if (config.method === 'GET') {
      // 캐시 비활성화가 명시적으로 설정된 경우
      if (config.cache === false) {
        config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        config.headers['Pragma'] = 'no-cache';
        config.headers['Expires'] = '0';
      } else {
        // 기본 캐시 정책
        config.headers['Cache-Control'] = 'public, max-age=300'; // 5분
      }
    } else {
      // POST, PUT, DELETE 요청은 캐시하지 않음
      config.headers['Cache-Control'] = 'no-cache';
    }

    // ETag 지원 (확장된 설정에서 확인)
    const extendedConfig = config as any;
    if (extendedConfig.etag !== false) {
      config.headers['If-None-Match'] = config.headers['If-None-Match'] || '*';
    }

    return config;
  }

  /**
   * 조건부 요청 헤더 추가
   */
  static addConditionalHeaders(config: RequestConfig): RequestConfig {
    if (!config.headers) {
      config.headers = {};
    }

    const extendedConfig = config as any;

    // Last-Modified 기반 조건부 요청
    if (extendedConfig.lastModified) {
      config.headers['If-Modified-Since'] = extendedConfig.lastModified;
    }

    // ETag 기반 조건부 요청
    if (extendedConfig.etag) {
      config.headers['If-None-Match'] = extendedConfig.etag;
    }

    return config;
  }
}

/**
 * CORS 헤더 매니저
 */
export class CORSHeaderManager {
  /**
   * CORS 헤더 추가
   */
  static addCORSHeaders(config: RequestConfig): RequestConfig {
    if (!config.headers) {
      config.headers = {};
    }

    // 기본 CORS 헤더
    config.headers['Access-Control-Request-Method'] = config.method;
    
    // 사용자 정의 헤더가 있는 경우
    const customHeaders = Object.keys(config.headers).filter(header => 
      !['content-type', 'accept', 'authorization'].includes(header.toLowerCase())
    );

    if (customHeaders.length > 0) {
      config.headers['Access-Control-Request-Headers'] = customHeaders.join(', ');
    }

    // Credentials 포함 설정
    const extendedConfig = config as any;
    if (extendedConfig.withCredentials !== false) {
      extendedConfig.credentials = 'include';
    }

    return config;
  }

  /**
   * Preflight 요청 여부 확인
   */
  static requiresPreflight(config: RequestConfig): boolean {
    const simpleHeaders = ['accept', 'accept-language', 'content-language', 'content-type'];
    const simpleContentTypes = [
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];

    // 단순하지 않은 메서드
    if (!['GET', 'HEAD', 'POST'].includes(config.method)) {
      return true;
    }

    // 사용자 정의 헤더 확인
    if (config.headers) {
      const hasCustomHeaders = Object.keys(config.headers).some(header =>
        !simpleHeaders.includes(header.toLowerCase())
      );
      if (hasCustomHeaders) return true;
    }

    // Content-Type 확인
    const contentType = config.headers?.['content-type'] || config.headers?.['Content-Type'];
    if (contentType && !simpleContentTypes.some(type => contentType.startsWith(type))) {
      return true;
    }

    return false;
  }
}

/**
 * 기본 인터셉터들
 */
export class DefaultInterceptors {
  private static authManager = new AuthTokenManager();
  private static logger = new RequestLogger();

  /**
   * 인증 토큰 인터셉터
   */
  static authInterceptor: RequestInterceptor = (config: RequestConfig) => {
    // 인증이 필요한 엔드포인트인지 확인
    const extendedConfig = config as any;
    if (extendedConfig.skipAuth) {
      return config;
    }

    const authHeader = DefaultInterceptors.authManager.getAuthHeader();
    if (authHeader) {
      if (!config.headers) {
        config.headers = {};
      }
      config.headers['Authorization'] = authHeader;
    }

    return config;
  };

  /**
   * 요청 로깅 인터셉터
   */
  static requestLoggingInterceptor: RequestInterceptor = (config: RequestConfig) => {
    DefaultInterceptors.logger.logRequest(config);
    return config;
  };

  /**
   * 응답 로깅 인터셉터
   */
  static responseLoggingInterceptor: ResponseInterceptor = (response: APIResponse) => {
    DefaultInterceptors.logger.logResponse(response);
    return response;
  };

  /**
   * 에러 로깅 인터셉터
   */
  static errorLoggingInterceptor: ErrorInterceptor = (error: APIError) => {
    DefaultInterceptors.logger.logError(error);
    return error;
  };

  /**
   * 캐시 헤더 인터셉터
   */
  static cacheHeaderInterceptor: RequestInterceptor = (config: RequestConfig) => {
    return CacheHeaderManager.addCacheHeaders(config);
  };

  /**
   * CORS 헤더 인터셉터
   */
  static corsHeaderInterceptor: RequestInterceptor = (config: RequestConfig) => {
    return CORSHeaderManager.addCORSHeaders(config);
  };

  /**
   * 에러 처리 인터셉터
   */
  static errorHandlingInterceptor: ErrorInterceptor = async (error: APIError) => {
    // 401 Unauthorized - 토큰 갱신 시도
    if (error.status === 401) {
      const refreshToken = DefaultInterceptors.authManager.getRefreshToken();
      if (refreshToken) {
        try {
          // 토큰 갱신 로직 (실제 구현은 API에 따라 다름)
          console.info('Attempting token refresh...');
          // 여기서 토큰 갱신 API 호출
          
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          DefaultInterceptors.authManager.clearTokens();
          // 로그인 페이지로 리다이렉트
          window.location.href = '/login';
        }
      } else {
        DefaultInterceptors.authManager.clearTokens();
        window.location.href = '/login';
      }
    }

    // 403 Forbidden - 권한 없음
    if (error.status === 403) {
      console.warn('Access forbidden:', error.url);
      // 권한 없음 알림 표시
    }

    // 404 Not Found
    if (error.status === 404) {
      console.warn('Resource not found:', error.url);
    }

    // 429 Too Many Requests - 요청 제한
    if (error.status === 429) {
      console.warn('Rate limit exceeded:', error.url);
      const retryAfter = error.data?.retryAfter || 60;
      console.info(`Retry after ${retryAfter} seconds`);
    }

    // 5xx Server Errors
    if (error.status >= 500) {
      console.error('Server error:', error);
      // 서버 오류 알림 표시
    }

    return error;
  };

  /**
   * 공통 헤더 추가 인터셉터
   */
  static commonHeadersInterceptor: RequestInterceptor = (config: RequestConfig) => {
    if (!config.headers) {
      config.headers = {};
    }

    // 기본 헤더 추가
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    config.headers['Accept'] = config.headers['Accept'] || 'application/json, text/plain, */*';
    
    // 클라이언트 정보
    config.headers['X-Client-Version'] = '2.0.0';
    config.headers['X-Client-Type'] = 'web';
    
    // 타임스탬프
    config.headers['X-Request-Time'] = new Date().toISOString();
    
    // 요청 ID가 없으면 생성
    if (!config.requestId) {
      config.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      config.headers['X-Request-ID'] = config.requestId;
    }

    return config;
  };

  /**
   * Auth 매니저 가져오기
   */
  static getAuthManager(): AuthTokenManager {
    return DefaultInterceptors.authManager;
  }

  /**
   * 로거 가져오기
   */
  static getLogger(): RequestLogger {
    return DefaultInterceptors.logger;
  }
}

/**
 * 인터셉터 설정 헬퍼
 */
export class InterceptorManager {
  /**
   * 기본 인터셉터들을 API 클라이언트에 등록
   */
  static setupDefaultInterceptors(apiClient: any): void {
    // 요청 인터셉터 등록 (실행 순서 중요)
    apiClient.addRequestInterceptor(DefaultInterceptors.commonHeadersInterceptor);
    apiClient.addRequestInterceptor(DefaultInterceptors.authInterceptor);
    apiClient.addRequestInterceptor(DefaultInterceptors.cacheHeaderInterceptor);
    apiClient.addRequestInterceptor(DefaultInterceptors.corsHeaderInterceptor);
    apiClient.addRequestInterceptor(DefaultInterceptors.requestLoggingInterceptor);

    // 응답 인터셉터 등록
    apiClient.addResponseInterceptor(DefaultInterceptors.responseLoggingInterceptor);

    // 에러 인터셉터 등록
    apiClient.addErrorInterceptor(DefaultInterceptors.errorHandlingInterceptor);
    apiClient.addErrorInterceptor(DefaultInterceptors.errorLoggingInterceptor);

    console.info('✅ Default interceptors registered');
  }

  /**
   * 커스텀 인터셉터 등록
   */
  static setupCustomInterceptors(
    apiClient: any,
    options: {
      authEnabled?: boolean;
      loggingEnabled?: boolean;
      cacheEnabled?: boolean;
      corsEnabled?: boolean;
      customRequestInterceptors?: RequestInterceptor[];
      customResponseInterceptors?: ResponseInterceptor[];
      customErrorInterceptors?: ErrorInterceptor[];
    } = {}
  ): void {
    // 공통 헤더는 항상 추가
    apiClient.addRequestInterceptor(DefaultInterceptors.commonHeadersInterceptor);

    // 선택적 인터셉터 등록
    if (options.authEnabled !== false) {
      apiClient.addRequestInterceptor(DefaultInterceptors.authInterceptor);
    }

    if (options.cacheEnabled !== false) {
      apiClient.addRequestInterceptor(DefaultInterceptors.cacheHeaderInterceptor);
    }

    if (options.corsEnabled !== false) {
      apiClient.addRequestInterceptor(DefaultInterceptors.corsHeaderInterceptor);
    }

    if (options.loggingEnabled !== false) {
      apiClient.addRequestInterceptor(DefaultInterceptors.requestLoggingInterceptor);
      apiClient.addResponseInterceptor(DefaultInterceptors.responseLoggingInterceptor);
      apiClient.addErrorInterceptor(DefaultInterceptors.errorLoggingInterceptor);
    }

    // 커스텀 인터셉터 등록
    options.customRequestInterceptors?.forEach(interceptor => {
      apiClient.addRequestInterceptor(interceptor);
    });

    options.customResponseInterceptors?.forEach(interceptor => {
      apiClient.addResponseInterceptor(interceptor);
    });

    options.customErrorInterceptors?.forEach(interceptor => {
      apiClient.addErrorInterceptor(interceptor);
    });

    // 기본 에러 핸들링은 항상 마지막에
    apiClient.addErrorInterceptor(DefaultInterceptors.errorHandlingInterceptor);

    console.info('✅ Custom interceptors registered');
  }
}

// 편의 함수들
export const setupAPIInterceptors = InterceptorManager.setupDefaultInterceptors;
export const setupCustomAPIInterceptors = InterceptorManager.setupCustomInterceptors;
export const getAuthManager = DefaultInterceptors.getAuthManager;
export const getRequestLogger = DefaultInterceptors.getLogger;

// 개별 인터셉터 내보내기
export const {
  authInterceptor,
  requestLoggingInterceptor,
  responseLoggingInterceptor,
  errorLoggingInterceptor,
  cacheHeaderInterceptor,
  corsHeaderInterceptor,
  errorHandlingInterceptor,
  commonHeadersInterceptor
} = DefaultInterceptors; 