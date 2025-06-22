/**
 * API Client
 * 서버와의 HTTP 통신을 담당하는 범용 API 클라이언트
 * FRONTEND_REFACTORING_PLAN.md Phase 4.5 구현
 */

import type { 
  APIConfig, 
  RequestOptions, 
  HTTPMethod, 
  ServiceStatus,
  EventManager,
  Service
} from '@/types';

/**
 * HTTP 메서드 상수
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS'
} as const;

/**
 * 응답 타입 상수
 */
export const RESPONSE_TYPES = {
  JSON: 'json',
  TEXT: 'text',
  BLOB: 'blob',
  ARRAY_BUFFER: 'arrayBuffer',
  FORM_DATA: 'formData'
} as const;

export type ResponseType = typeof RESPONSE_TYPES[keyof typeof RESPONSE_TYPES];

/**
 * API 에러 클래스
 */
export class APIError extends Error {
  public readonly name = 'APIError';
  public readonly timestamp: number;
  public duration?: number; // mutable로 변경

  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly data: any = null,
    public readonly url: string = '',
    duration?: number
  ) {
    super(message);
    this.timestamp = Date.now();
    if (duration !== undefined) {
      this.duration = duration;
    }
    
    // Error 프로토타입 체인 복원
    Object.setPrototypeOf(this, APIError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      data: this.data,
      url: this.url,
      timestamp: this.timestamp,
      duration: this.duration
    };
  }
}

/**
 * API 응답 인터페이스
 */
export interface APIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: RequestConfig;
  duration?: number;
}

/**
 * 요청 설정 인터페이스
 */
export interface RequestConfig extends RequestOptions {
  method: HTTPMethod;
  url: string;
  data?: any;
  responseType?: ResponseType;
  validateStatus?: (status: number) => boolean;
  requestId?: string;
  showGlobalLoader?: boolean;
  loadingTarget?: string | HTMLElement;
  loadingMessage?: string;
  showLoading?: boolean;
}

/**
 * 요청 인터셉터 타입
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;

/**
 * 응답 인터셉터 타입
 */
export type ResponseInterceptor = (response: APIResponse) => APIResponse | Promise<APIResponse>;

/**
 * 에러 인터셉터 타입
 */
export type ErrorInterceptor = (error: APIError) => APIError | Promise<APIError>;

/**
 * 캐시 설정 인터페이스
 */
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in milliseconds
  maxSize: number;
}

/**
 * 진행 중인 요청 정보
 */
interface PendingRequest {
  url: string;
  method: string;
  abortController: AbortController;
  startTime: number;
}

/**
 * 캐시 엔트리
 */
interface CacheEntry {
  data: APIResponse;
  timestamp: number;
  ttl: number;
}

/**
 * API 통계 정보
 */
export interface APIStats {
  requests: number;
  responses: number;
  errors: number;
  cacheHits: number;
  cacheMisses: number;
  totalTime: number;
  averageTime: number;
  startTime: number;
}

/**
 * API 클라이언트 클래스
 * Service 인터페이스 구현으로 서비스 레지스트리에 등록 가능
 */
export class APIClient implements Service {
  // Service 인터페이스 구현
  public readonly name = 'api-client';
  public readonly version = '1.0.0';
  public isInitialized = false;
  public status: ServiceStatus = 'pending';
  private config: APIConfig & { 
    validateStatus: (status: number) => boolean;
    cache: CacheConfig;
  };
  private eventManager: EventManager | null = null;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private cache = new Map<string, CacheEntry>();
  private stats: APIStats;

  constructor(config: Partial<APIConfig> = {}) {
    // 기본 설정 병합
    this.config = {
      enabled: true,
      autoStart: true,
      retryCount: 3,
      timeout: 10000,
      baseURL: '/api',
      version: '1.0',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      interceptors: {
        useRequestInterceptor: true,
        useResponseInterceptor: true,
        useErrorInterceptor: true,
        ...config.interceptors
      },
      validateStatus: (status: number) => status >= 200 && status < 300,
      cache: {
        enabled: false,
        ttl: 300000, // 5분
        maxSize: 100
      },
      ...config
    };

    // 통계 초기화
    this.stats = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTime: 0,
      averageTime: 0,
      startTime: Date.now()
    };

    console.debug('APIClient initialized', this.config);
  }

  /**
   * 서비스 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.status = 'initializing';
    
    try {
      console.info('APIClient initializing...');
      
      // 기본 인터셉터 설정
      this.setupDefaultInterceptors();
      
      // 네트워크 상태 모니터링 설정
      this.setupNetworkMonitoring();
      
      this.isInitialized = true;
      this.status = 'ready';
      
      console.info('APIClient initialized successfully');
      
      // 이벤트 발생
      this.eventManager?.emit('api:initialized', { timestamp: Date.now() });
      
    } catch (error) {
      this.status = 'error';
      console.error('APIClient initialization failed:', error);
      throw error;
    }
  }

  /**
   * 서비스 종료
   */
  async destroy(): Promise<void> {
    console.info('APIClient destroying...');
    
    // 모든 진행 중인 요청 취소
    this.cancelAllRequests();
    
    // 캐시 정리
    this.clearCache();
    
    // 인터셉터 정리
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
    
    this.isInitialized = false;
    this.status = 'destroyed';
    
    console.info('APIClient destroyed');
    
    // 이벤트 발생
    this.eventManager?.emit('api:destroyed', { timestamp: Date.now() });
  }

  /**
   * 서비스 상태 조회
   */
  getStatus(): ServiceStatus {
    return this.status;
  }

  /**
   * 이벤트 매니저 설정
   */
  setEventManager(eventManager: EventManager): void {
    this.eventManager = eventManager;
  }

  /**
   * 기본 인터셉터 설정
   */
  private setupDefaultInterceptors(): void {
    if (!this.config.interceptors.useRequestInterceptor) return;

    // 요청 로깅 인터셉터
    this.addRequestInterceptor((config) => {
      console.debug(`API Request: ${config.method} ${config.url}`, config);
      this.stats.requests++;
      
      // 글로벌 로더 표시
      if (config.showGlobalLoader && (window as any).loader) {
        (window as any).loader.showGlobal(`${config.method} 요청 중...`, {
          id: `api-global-${config.requestId || 'request'}`,
          timeout: config.timeout || 30000
        });
      }
      
      // 타겟 요소 로더 표시
      if (config.loadingTarget && (window as any).loader) {
        const target = typeof config.loadingTarget === 'string' 
          ? document.querySelector(config.loadingTarget)
          : config.loadingTarget;
          
        if (target) {
          (window as any).loader.show(target, {
            id: `api-element-${config.requestId || 'request'}`,
            type: 'spinner',
            message: config.loadingMessage || '로딩 중...',
            overlay: 'element'
          });
        }
      }
      
      // 토스트 표시
      if (config.showLoading && (window as any).toast) {
        (window as any).toast.loading('데이터를 로드하는 중...', {
          id: `api-${config.requestId || 'request'}`,
          duration: 0,
          closable: false
        });
      }
      
      // 이벤트 발생
      this.eventManager?.emit('api:request:start', {
        method: config.method,
        url: config.url,
        timestamp: Date.now()
      });
      
      return config;
    });

    // 응답 처리 인터셉터
    this.addResponseInterceptor((response) => {
      console.debug(`API Response: ${response.status} ${response.config.url}`, response);
      this.stats.responses++;
      
      if (response.duration) {
        this.stats.totalTime += response.duration;
        this.stats.averageTime = this.stats.totalTime / this.stats.responses;
      }
      
      // 로더 숨기기
      this.hideLoaders(response.config);
      
      // 이벤트 발생
      this.eventManager?.emit('api:request:success', {
        method: response.config.method,
        url: response.config.url,
        status: response.status,
        duration: response.duration,
        timestamp: Date.now()
      });
      
      return response;
    });

    // 에러 처리 인터셉터
    this.addErrorInterceptor((error) => {
      console.error(`API Error: ${error.status} ${error.url}`, error);
      this.stats.errors++;
      
      // 로더 숨기기
      if (error.url) {
        this.hideLoaders({ url: error.url } as RequestConfig);
      }
      
      // 에러 토스트 표시
      if ((window as any).toast) {
        (window as any).toast.error(`요청 실패: ${error.message}`, {
          duration: 5000
        });
      }
      
      // 이벤트 발생
      this.eventManager?.emit('api:request:error', {
        url: error.url,
        status: error.status,
        message: error.message,
        timestamp: Date.now()
      });
      
      return error;
    });
  }

  /**
   * 네트워크 상태 모니터링 설정
   */
  private setupNetworkMonitoring(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.info('Network connection restored');
      this.eventManager?.emit('api:network:online', { timestamp: Date.now() });
    });

    window.addEventListener('offline', () => {
      console.warn('Network connection lost');
      this.eventManager?.emit('api:network:offline', { timestamp: Date.now() });
    });
  }

  /**
   * 로더 숨기기
   */
  private hideLoaders(config: RequestConfig): void {
    // 글로벌 로더 숨기기
    if (config.showGlobalLoader && (window as any).loader) {
      (window as any).loader.hideGlobal(`api-global-${config.requestId || 'request'}`);
    }
    
    // 타겟 로더 숨기기
    if (config.loadingTarget && (window as any).loader) {
      (window as any).loader.hide(`api-element-${config.requestId || 'request'}`);
    }
    
    // 토스트 숨기기
    if (config.showLoading && (window as any).toast) {
      (window as any).toast.hide(`api-${config.requestId || 'request'}`);
    }
  }

  /**
   * HTTP 요청 실행
   */
  async request<T = any>(config: RequestConfig): Promise<APIResponse<T>> {
    const startTime = performance.now();
    
    // 설정 병합
    const fullConfig = this.mergeConfig(config);
    
    // 요청 ID 생성
    const requestId = this.generateRequestId();
    fullConfig.requestId = requestId;

    try {
      // 캐시 확인
      if (this.shouldUseCache(fullConfig)) {
        const cachedResponse = this.getFromCache<T>(fullConfig);
        if (cachedResponse) {
          this.stats.cacheHits++;
          console.debug(`Cache hit for ${fullConfig.url}`);
          return cachedResponse;
        }
        this.stats.cacheMisses++;
      }

      // 요청 인터셉터 실행
      const processedConfig = await this.runRequestInterceptors(fullConfig);
      
      // 실제 HTTP 요청
      const response = await this.executeRequest<T>(processedConfig);
      
      // 응답 처리
      response.duration = performance.now() - startTime;
      response.config = processedConfig;

      // 응답 인터셉터 실행
      const processedResponse = await this.runResponseInterceptors(response);

      // 캐시 저장
      if (this.shouldCache(processedConfig, processedResponse)) {
        this.saveToCache(processedConfig, processedResponse);
      }

      return processedResponse;

    } catch (error) {
      // 에러 처리
      const apiError = this.createAPIError(error, fullConfig);
      apiError.duration = performance.now() - startTime;
      
      // 재시도 로직
      if (this.shouldRetry(apiError, fullConfig)) {
        return this.retryRequest<T>(fullConfig, apiError);
      }

      // 에러 인터셉터 실행
      await this.runErrorInterceptors(apiError);
      throw apiError;
      
    } finally {
      // 진행 중인 요청에서 제거
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * GET 요청
   */
  async get<T = any>(url: string, config: Partial<RequestConfig> = {}): Promise<APIResponse<T>> {
    return this.request<T>({
      ...config,
      method: 'GET',
      url
    });
  }

  /**
   * POST 요청
   */
  async post<T = any>(url: string, data?: any, config: Partial<RequestConfig> = {}): Promise<APIResponse<T>> {
    return this.request<T>({
      ...config,
      method: 'POST',
      url,
      data
    });
  }

  /**
   * PUT 요청
   */
  async put<T = any>(url: string, data?: any, config: Partial<RequestConfig> = {}): Promise<APIResponse<T>> {
    return this.request<T>({
      ...config,
      method: 'PUT',
      url,
      data
    });
  }

  /**
   * DELETE 요청
   */
  async delete<T = any>(url: string, config: Partial<RequestConfig> = {}): Promise<APIResponse<T>> {
    return this.request<T>({
      ...config,
      method: 'DELETE',
      url
    });
  }

  /**
   * PATCH 요청
   */
  async patch<T = any>(url: string, data?: any, config: Partial<RequestConfig> = {}): Promise<APIResponse<T>> {
    return this.request<T>({
      ...config,
      method: 'PATCH',
      url,
      data
    });
  }

  /**
   * 실제 HTTP 요청 실행
   */
  private async executeRequest<T>(config: RequestConfig): Promise<APIResponse<T>> {
    const {
      method,
      url,
      data,
      headers,
      timeout,
      responseType = RESPONSE_TYPES.JSON,
      signal
    } = config;

    // AbortController 설정
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout || this.config.timeout);

    // 진행 중인 요청 추가
    this.pendingRequests.set(config.requestId!, {
      url,
      method,
      abortController,
      startTime: Date.now()
    });

    try {
      // Fetch 옵션 구성
      const fetchOptions: RequestInit = {
        method,
        headers: headers || this.config.headers,
        credentials: 'same-origin',
        signal: signal || abortController.signal
      };

      // 데이터 처리
      if (data) {
        if (data instanceof FormData) {
          fetchOptions.body = data;
          // FormData일 때는 Content-Type 헤더 제거
          const headersObj = { ...fetchOptions.headers } as Record<string, string>;
          delete headersObj['Content-Type'];
          fetchOptions.headers = headersObj;
        } else if (typeof data === 'object') {
          fetchOptions.body = JSON.stringify(data);
        } else {
          fetchOptions.body = data;
        }
      }

      // 요청 실행
      const response = await fetch(url, fetchOptions);
      
      clearTimeout(timeoutId);

      // 상태 검증
      if (!this.config.validateStatus(response.status)) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 응답 데이터 파싱
      let responseData: T;
      try {
        switch (responseType) {
          case RESPONSE_TYPES.JSON:
            responseData = await response.json();
            break;
          case RESPONSE_TYPES.TEXT:
            responseData = await response.text() as T;
            break;
          case RESPONSE_TYPES.BLOB:
            responseData = await response.blob() as T;
            break;
          case RESPONSE_TYPES.ARRAY_BUFFER:
            responseData = await response.arrayBuffer() as T;
            break;
          case RESPONSE_TYPES.FORM_DATA:
            responseData = await response.formData() as T;
            break;
          default:
            responseData = await response.json();
        }
      } catch (parseError) {
        // 파싱 실패시 텍스트로 대체
        responseData = await response.text() as T;
      }

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers),
        config
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * 설정 병합
   */
  private mergeConfig(config: RequestConfig): RequestConfig {
    return {
      ...config,
      url: this.buildUrl(config.url),
      headers: {
        ...this.config.headers,
        ...config.headers
      },
      timeout: config.timeout || this.config.timeout,
      retries: config.retries || this.config.retryCount,
      validateStatus: config.validateStatus || this.config.validateStatus
    };
  }

  /**
   * URL 빌드
   */
  private buildUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    const baseURL = this.config.baseURL.endsWith('/') 
      ? this.config.baseURL.slice(0, -1) 
      : this.config.baseURL;
    const path = url.startsWith('/') ? url : `/${url}`;
    
    return `${baseURL}${path}`;
  }

  /**
   * 헤더 파싱
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * API 에러 생성
   */
  private createAPIError(error: any, config: RequestConfig): APIError {
    if (error instanceof APIError) {
      return error;
    }

    let status = 0;
    let statusText = 'Unknown Error';
    let message = error.message || 'An error occurred';
    let data = null;

    if (error.response) {
      status = error.response.status;
      statusText = error.response.statusText;
      data = error.response.data;
    } else if (error.name === 'AbortError') {
      status = 408;
      statusText = 'Request Timeout';
      message = 'Request timeout';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      status = 0;
      statusText = 'Network Error';
      message = 'Network connection failed';
    }

    return new APIError(message, status, statusText, data, config.url);
  }

  /**
   * 재시도 여부 판단
   */
  private shouldRetry(error: APIError, config: RequestConfig): boolean {
    const retries = config.retries || 0;
    const retryAttempts = (config as any).retryAttempts || 0;
    
    if (retryAttempts >= retries) {
      return false;
    }

    // 네트워크 오류나 5xx 서버 오류만 재시도
    return error.status === 0 || error.status >= 500;
  }

  /**
   * 요청 재시도
   */
  private async retryRequest<T>(config: RequestConfig, _lastError: APIError): Promise<APIResponse<T>> {
    const retryAttempts = ((config as any).retryAttempts || 0) + 1;
    const delay = Math.min(1000 * Math.pow(2, retryAttempts - 1), 10000); // 지수 백오프
    
    console.warn(`Retrying request (${retryAttempts}/${config.retries}) after ${delay}ms:`, config.url);
    
    await this.delay(delay);
    
    return this.request<T>({
      ...config,
      retryAttempts
    } as RequestConfig);
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 캐시 사용 여부 판단
   */
  private shouldUseCache(config: RequestConfig): boolean {
    return this.config.cache.enabled && 
           config.method === 'GET' && 
           config.cache !== false;
  }

  /**
   * 캐시 저장 여부 판단
   */
  private shouldCache(config: RequestConfig, response: APIResponse): boolean {
    return this.shouldUseCache(config) && 
           response.status >= 200 && 
           response.status < 300;
  }

  /**
   * 캐시 키 생성
   */
  private getCacheKey(config: RequestConfig): string {
    return `${config.method}:${config.url}`;
  }

  /**
   * 캐시에서 조회
   */
  private getFromCache<T>(config: RequestConfig): APIResponse<T> | null {
    const key = this.getCacheKey(config);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // TTL 확인
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as APIResponse<T>;
  }

  /**
   * 캐시에 저장
   */
  private saveToCache(config: RequestConfig, response: APIResponse): void {
    const key = this.getCacheKey(config);
    
    // 캐시 크기 제한
    if (this.cache.size >= this.config.cache.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      data: response,
      timestamp: Date.now(),
      ttl: this.config.cache.ttl
    });
  }

  /**
   * 요청 인터셉터 추가
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * 응답 인터셉터 추가
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * 에러 인터셉터 추가
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * 요청 인터셉터 실행
   */
  private async runRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let processedConfig = config;
    
    for (const interceptor of this.requestInterceptors) {
      try {
        const result = await interceptor(processedConfig);
        processedConfig = result || processedConfig;
      } catch (error) {
        console.error('Request interceptor error:', error);
        throw error;
      }
    }
    
    return processedConfig;
  }

  /**
   * 응답 인터셉터 실행
   */
  private async runResponseInterceptors(response: APIResponse): Promise<APIResponse> {
    let processedResponse = response;
    
    for (const interceptor of this.responseInterceptors) {
      try {
        const result = await interceptor(processedResponse);
        processedResponse = result || processedResponse;
      } catch (error) {
        console.error('Response interceptor error:', error);
        throw error;
      }
    }
    
    return processedResponse;
  }

  /**
   * 에러 인터셉터 실행
   */
  private async runErrorInterceptors(error: APIError): Promise<APIError> {
    let processedError = error;
    
    for (const interceptor of this.errorInterceptors) {
      try {
        const result = await interceptor(processedError);
        processedError = result || processedError;
      } catch (interceptorError) {
        console.error('Error interceptor error:', interceptorError);
        // 인터셉터 에러는 원본 에러를 유지
      }
    }
    
    return processedError;
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 요청 취소
   */
  cancelRequest(requestId: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      request.abortController.abort();
      this.pendingRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * 모든 요청 취소
   */
  cancelAllRequests(): void {
    for (const [, request] of this.pendingRequests) {
      request.abortController.abort();
    }
    this.pendingRequests.clear();
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cache.clear();
    console.debug('API cache cleared');
  }

  /**
   * 통계 조회
   */
  getStats(): APIStats {
    return { ...this.stats };
  }

  /**
   * 헬스 체크
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get('/health', { 
        timeout: 5000,
        cache: false 
      });
      return response.status === 200;
    } catch (error) {
      console.warn('Health check failed:', error);
      return false;
    }
  }

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    console.group('APIClient Debug Info');
    console.log('Configuration:', this.config);
    console.log('Statistics:', this.stats);
    console.log('Pending Requests:', this.pendingRequests.size);
    console.log('Cache Size:', this.cache.size);
    console.log('Interceptors:', {
      request: this.requestInterceptors.length,
      response: this.responseInterceptors.length,
      error: this.errorInterceptors.length
    });
    console.groupEnd();
  }
}

// 기본 인스턴스 생성 및 내보내기
export const apiClient = new APIClient(); 