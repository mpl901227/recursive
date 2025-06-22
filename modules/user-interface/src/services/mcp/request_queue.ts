/**
 * MCP 요청 큐 시스템
 * 
 * FRONTEND_REFACTORING_PLAN.md Phase 4.4에 따른 구현
 * - 우선순위 큐 지원
 * - 요청 제한 (rate limiting)
 * - 재시도 로직
 * - 통계 수집
 */

import { EventManager } from '../../core/events.js';

/**
 * 요청 우선순위
 */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * 요청 상태
 */
export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

/**
 * 큐에 저장되는 요청 아이템
 */
export interface QueuedRequest {
  id: string;
  method: string;
  params: any;
  priority: RequestPriority;
  status: RequestStatus;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  delay?: number;
  tags?: string[];
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * Rate Limiting 설정
 */
export interface RateLimitConfig {
  maxRequests: number;    // 시간 윈도우당 최대 요청 수
  windowMs: number;       // 시간 윈도우 (밀리초)
  skipSuccessful?: boolean; // 성공한 요청은 카운트에서 제외
  skipFailed?: boolean;   // 실패한 요청은 카운트에서 제외
}

/**
 * 재시도 전략
 */
export interface RetryStrategy {
  shouldRetry: (error: Error, attempt: number, request: QueuedRequest) => boolean;
  getDelay: (attempt: number, request: QueuedRequest) => number;
  maxRetries: number;
}

/**
 * 요청 큐 설정
 */
export interface RequestQueueConfig {
  maxSize?: number;
  maxConcurrent?: number;
  processInterval?: number;
  enablePriority?: boolean;
  enableRateLimit?: boolean;
  rateLimitConfig?: RateLimitConfig;
  defaultRetryStrategy?: RetryStrategy;
  enableStatistics?: boolean;
  enableDebugging?: boolean;
  requestTimeout?: number;
}

/**
 * 요청 큐 통계
 */
export interface QueueStatistics {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  timeoutRequests: number;
  averageWaitTime: number;
  averageProcessTime: number;
  queueSize: number;
  activeRequests: number;
  rateLimitHits: number;
  retryCount: number;
  priorityDistribution: Record<RequestPriority, number>;
  errorDistribution: Record<string, number>;
}

/**
 * 기본 재시도 전략 (지수 백오프)
 */
export class ExponentialBackoffRetryStrategy implements RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;

  constructor(options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    jitter?: boolean;
  } = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.jitter = options.jitter !== false;
  }

  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;

    // 특정 에러 타입은 재시도하지 않음 (클라이언트 에러)
    if (error.message.includes('Validation Error') ||
        error.message.includes('Authentication Failed') ||
        error.message.includes('Permission Denied') ||
        error.message.includes('Unsupported MCP method') ||
        error.message.includes('Unsupported method')) {
      return false;
    }

    // 네트워크 관련 오류나 일시적 오류는 재시도
    if (error.message.includes('timeout') ||
        error.message.includes('Connection') ||
        error.message.includes('Network') ||
        error.message.includes('Temporary') ||
        error.message.includes('Service Unavailable') ||
        error.message.includes('Internal Server Error')) {
      return true;
    }

    // 기본적으로 재시도하지 않음
    return false;
  }

  getDelay(attempt: number): number {
    let delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
    
    // Jitter 추가로 thundering herd 방지
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }
}

/**
 * Rate Limiter 클래스
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 요청이 rate limit에 걸리는지 확인
   */
  isAllowed(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 윈도우 밖의 요청들 제거
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);

    // 현재 요청 수가 제한을 초과하는지 확인
    return this.requests.length < this.config.maxRequests;
  }

  /**
   * 요청 기록
   */
  record(): void {
    this.requests.push(Date.now());
  }

  /**
   * 다음 허용 시간까지의 대기 시간 (밀리초)
   */
  getWaitTime(): number {
    if (this.requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...this.requests);
    const waitTime = this.config.windowMs - (Date.now() - oldestRequest);
    
    return Math.max(0, waitTime);
  }

  /**
   * 현재 사용량
   */
  getUsage(): { current: number; limit: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);

    return {
      current: this.requests.length,
      limit: this.config.maxRequests,
      resetTime: this.requests.length > 0 ? Math.min(...this.requests) + this.config.windowMs : now
    };
  }
}

/**
 * 요청 큐 클래스
 */
export class RequestQueue {
  private readonly config: Required<RequestQueueConfig>;
  private readonly eventManager: EventManager;
  private readonly rateLimiter?: RateLimiter;
  private readonly retryStrategy: RetryStrategy;

  // 큐와 활성 요청
  private queue: QueuedRequest[] = [];
  private activeRequests = new Map<string, QueuedRequest>();
  private completedRequests: QueuedRequest[] = [];

  // 처리 상태
  private isProcessing = false;
  private isDestroyed = false;
  private processingInterval: ReturnType<typeof setInterval> | undefined = undefined;
  private requestIdCounter = 0;

  // 통계
  private statistics: QueueStatistics = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    timeoutRequests: 0,
    averageWaitTime: 0,
    averageProcessTime: 0,
    queueSize: 0,
    activeRequests: 0,
    rateLimitHits: 0,
    retryCount: 0,
    priorityDistribution: {
      [RequestPriority.LOW]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.HIGH]: 0,
      [RequestPriority.CRITICAL]: 0
    },
    errorDistribution: {}
  };

  constructor(eventManager: EventManager, config: RequestQueueConfig = {}) {
    this.eventManager = eventManager;
    
    // 설정 완성
    this.config = {
      maxSize: 1000,
      maxConcurrent: 5,
      processInterval: 100,
      enablePriority: true,
      enableRateLimit: false,
      rateLimitConfig: {
        maxRequests: 10,
        windowMs: 1000
      },
      defaultRetryStrategy: new ExponentialBackoffRetryStrategy(),
      enableStatistics: true,
      enableDebugging: false,
      requestTimeout: 30000,
      ...config
    };

    this.retryStrategy = this.config.defaultRetryStrategy;

    // Rate Limiter 초기화
    if (this.config.enableRateLimit && this.config.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(this.config.rateLimitConfig);
    }

    this.startProcessing();
  }

  /**
   * 요청을 큐에 추가
   */
  enqueue<T = any>(
    method: string,
    params: any,
    options: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
      delay?: number;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // destroyed 상태 확인
      if (this.isDestroyed) {
        const error = new Error('Request queue has been destroyed');
        reject(error);
        return;
      }

      // 큐 크기 확인
      if (this.queue.length >= this.config.maxSize) {
        const error = new Error('Request queue is full');
        this.recordError(error.message);
        reject(error);
        return;
      }

      const request: QueuedRequest = {
        id: this.generateRequestId(),
        method,
        params,
        priority: options.priority || RequestPriority.NORMAL,
        status: RequestStatus.PENDING,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: options.maxRetries || this.retryStrategy.maxRetries,
        timeout: options.timeout || this.config.requestTimeout,
        ...(options.delay !== undefined ? { delay: options.delay } : {}),
        ...(options.tags !== undefined ? { tags: options.tags } : {}),
        resolve,
        reject
      };

      this.queue.push(request);
      this.updateStatistics();

      if (this.config.enableDebugging) {
        console.log(`📥 RequestQueue: Added request ${request.id} (${method})`);
      }

      this.eventManager.emit('request-queue:enqueued', { request });
    });
  }

  /**
   * 요청 취소
   */
  cancel(requestId: string): boolean {
    // 큐에서 찾기
    const queueIndex = this.queue.findIndex(req => req.id === requestId);
    if (queueIndex !== -1) {
      const request = this.queue[queueIndex];
      if (request) {
        request.status = RequestStatus.CANCELLED;
        request.reject(new Error('Request cancelled'));
        this.queue.splice(queueIndex, 1);
        this.statistics.cancelledRequests++;
        this.updateStatistics();
        
        this.eventManager.emit('request-queue:cancelled', { requestId });
        return true;
      }
    }

    // 활성 요청에서 찾기
    const activeRequest = this.activeRequests.get(requestId);
    if (activeRequest) {
      activeRequest.status = RequestStatus.CANCELLED;
      activeRequest.reject(new Error('Request cancelled'));
      this.activeRequests.delete(requestId);
      this.statistics.cancelledRequests++;
      this.updateStatistics();
      
      this.eventManager.emit('request-queue:cancelled', { requestId });
      return true;
    }

    return false;
  }

  /**
   * 큐 처리 시작
   */
  private startProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.processInterval);

    if (this.config.enableDebugging) {
      console.log('🚀 RequestQueue: Started processing');
    }
  }

  /**
   * 큐 처리 중지
   */
  private stopProcessing(): void {
    if (!this.isProcessing) return;

    this.isProcessing = false;
    if (this.processingInterval !== undefined) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    if (this.config.enableDebugging) {
      console.log('⏹️ RequestQueue: Stopped processing');
    }
  }

  /**
   * 큐 처리 메인 로직
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    if (this.activeRequests.size >= this.config.maxConcurrent) return;

    // Rate Limiting 확인
    if (this.rateLimiter && !this.rateLimiter.isAllowed()) {
      this.statistics.rateLimitHits++;
      if (this.config.enableDebugging) {
        console.log('⚠️ RequestQueue: Rate limit hit, waiting...');
      }
      return;
    }

    // 우선순위 정렬
    if (this.config.enablePriority) {
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // 높은 우선순위 먼저
        }
        return a.timestamp - b.timestamp; // 같은 우선순위면 FIFO
      });
    }

    // 지연된 요청들 필터링
    const now = Date.now();
    const readyRequests = this.queue.filter(req => 
      !req.delay || (req.timestamp + req.delay <= now)
    );

    if (readyRequests.length === 0) return;

    // 처리할 요청 선택
    const availableSlots = this.config.maxConcurrent - this.activeRequests.size;
    const requestsToProcess = readyRequests.slice(0, availableSlots);

    // 큐에서 제거하고 처리 시작
    for (const request of requestsToProcess) {
      const index = this.queue.indexOf(request);
      if (index !== -1) {
        this.queue.splice(index, 1);
        this.processRequest(request);
      }
    }

    this.updateStatistics();
  }

  /**
   * 개별 요청 처리
   */
  private async processRequest(request: QueuedRequest): Promise<void> {
    request.status = RequestStatus.PROCESSING;
    this.activeRequests.set(request.id, request);

    // Rate Limiter 기록
    if (this.rateLimiter) {
      this.rateLimiter.record();
    }

    const startTime = Date.now();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      // 타임아웃 설정
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, request.timeout);
      });

      // 실제 요청 처리는 외부 핸들러에게 위임
      const resultPromise = this.executeRequest(request);
      
      const result = await Promise.race([resultPromise, timeoutPromise]);

      // 성공 처리
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      request.status = RequestStatus.COMPLETED;
      const processTime = Date.now() - startTime;
      
      this.statistics.completedRequests++;
      this.updateAverageProcessTime(processTime);
      
      request.resolve(result);

      if (this.config.enableDebugging) {
        console.log(`✅ RequestQueue: Completed request ${request.id} in ${processTime}ms`);
      }

      this.eventManager.emit('request-queue:completed', { request, result, processTime });

    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      const isTimeout = error instanceof Error && error.message === 'Request timeout';
      
      if (isTimeout) {
        request.status = RequestStatus.TIMEOUT;
        this.statistics.timeoutRequests++;
      } else {
        request.status = RequestStatus.FAILED;
        this.statistics.failedRequests++;
        this.recordError(error instanceof Error ? error.message : String(error));
      }

      // 재시도 로직
      if (!isTimeout && this.shouldRetry(request, error as Error)) {
        await this.retryRequest(request, error as Error);
      } else {
        request.reject(error as Error);
        
        if (this.config.enableDebugging) {
          console.log(`❌ RequestQueue: Failed request ${request.id}:`, error);
        }

        this.eventManager.emit('request-queue:failed', { 
          request, 
          error: error as Error,
          isTimeout 
        });
      }
    } finally {
      this.activeRequests.delete(request.id);
      this.completedRequests.push(request);
      
      // 완료된 요청 기록 정리 (메모리 관리)
      if (this.completedRequests.length > 1000) {
        this.completedRequests = this.completedRequests.slice(-500);
      }
      
      this.updateStatistics();
    }
  }

  /**
   * 요청 실행 (하위 클래스에서 구현)
   */
  protected async executeRequest(request: QueuedRequest): Promise<any> {
    // 기본 구현: 이벤트를 통해 외부 핸들러에게 위임
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No request handler available'));
      }, 1000);

      this.eventManager.once(`request-queue:execute:${request.method}`, (handler) => {
        clearTimeout(timeout);
        handler(request)
          .then(resolve)
          .catch(reject);
      });

      this.eventManager.emit('request-queue:execute', { request, resolve, reject });
    });
  }

  /**
   * 재시도 판단
   */
  private shouldRetry(request: QueuedRequest, error: Error): boolean {
    if (request.retryCount >= request.maxRetries) return false;
    return this.retryStrategy.shouldRetry(error, request.retryCount, request);
  }

  /**
   * 재시도 처리
   */
  private async retryRequest(request: QueuedRequest, error: Error): Promise<void> {
    request.retryCount++;
    this.statistics.retryCount++;
    
    const delay = this.retryStrategy.getDelay(request.retryCount, request);
    request.delay = delay;
    request.timestamp = Date.now();
    request.status = RequestStatus.PENDING;

    // 큐에 다시 추가
    this.queue.push(request);

    if (this.config.enableDebugging) {
      console.log(`🔄 RequestQueue: Retrying request ${request.id} (attempt ${request.retryCount}/${request.maxRetries}) after ${delay}ms`);
    }

    this.eventManager.emit('request-queue:retry', { request, attempt: request.retryCount, delay, error });
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * 통계 업데이트
   */
  private updateStatistics(): void {
    this.statistics.queueSize = this.queue.length;
    this.statistics.activeRequests = this.activeRequests.size;
    this.statistics.totalRequests = this.statistics.completedRequests + 
                                   this.statistics.failedRequests + 
                                   this.statistics.cancelledRequests + 
                                   this.statistics.timeoutRequests + 
                                   this.queue.length + 
                                   this.activeRequests.size;

    // 우선순위 분포 업데이트
    this.statistics.priorityDistribution = {
      [RequestPriority.LOW]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.HIGH]: 0,
      [RequestPriority.CRITICAL]: 0
    };

    for (const request of this.queue) {
      this.statistics.priorityDistribution[request.priority]++;
    }

    for (const request of this.activeRequests.values()) {
      this.statistics.priorityDistribution[request.priority]++;
    }
  }

  /**
   * 평균 처리 시간 업데이트
   */
  private updateAverageProcessTime(processTime: number): void {
    const total = this.statistics.averageProcessTime * (this.statistics.completedRequests - 1) + processTime;
    this.statistics.averageProcessTime = total / this.statistics.completedRequests;
  }

  /**
   * 에러 기록
   */
  private recordError(errorMessage: string): void {
    if (!this.statistics.errorDistribution[errorMessage]) {
      this.statistics.errorDistribution[errorMessage] = 0;
    }
    this.statistics.errorDistribution[errorMessage]++;
  }

  /**
   * 공개 API
   */

  /**
   * 현재 통계 반환
   */
  getStatistics(): QueueStatistics {
    return { ...this.statistics };
  }

  /**
   * 큐 상태 반환
   */
  getStatus(): {
    isProcessing: boolean;
    queueSize: number;
    activeRequests: number;
    rateLimitUsage?: { current: number; limit: number; resetTime: number };
  } {
    const status = {
      isProcessing: this.isProcessing,
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size,
    };

    // rateLimitUsage를 조건부로 추가
    if (this.rateLimiter) {
      return {
        ...status,
        rateLimitUsage: this.rateLimiter.getUsage()
      };
    }

    return status;
  }

  /**
   * 큐 비우기
   */
  clear(): void {
    // 대기 중인 요청들 취소
    const error = new Error('Queue cleared');
    for (const request of this.queue) {
      request.status = RequestStatus.CANCELLED;
      request.reject(error);
    }
    this.queue = [];

    // 활성 요청들 취소
    for (const request of this.activeRequests.values()) {
      request.status = RequestStatus.CANCELLED;
      request.reject(error);
    }
    this.activeRequests.clear();

    this.updateStatistics();
    this.eventManager.emit('request-queue:cleared');
  }

  /**
   * 큐 일시 정지
   */
  pause(): void {
    this.stopProcessing();
    this.eventManager.emit('request-queue:paused');
  }

  /**
   * 큐 재개
   */
  resume(): void {
    this.startProcessing();
    this.eventManager.emit('request-queue:resumed');
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stopProcessing();
    this.clear();
    this.completedRequests = [];
    this.eventManager.emit('request-queue:destroyed');
  }

  /**
   * 특정 태그를 가진 요청들 찾기
   */
  findByTags(tags: string[]): QueuedRequest[] {
    const allRequests = [
      ...this.queue,
      ...Array.from(this.activeRequests.values())
    ];

    return allRequests.filter(request => 
      request.tags && tags.some(tag => request.tags!.includes(tag))
    );
  }

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    console.group('🔍 RequestQueue Debug Info');
    console.log('Config:', this.config);
    console.log('Statistics:', this.statistics);
    console.log('Queue:', this.queue.map(r => ({ id: r.id, method: r.method, priority: r.priority })));
    console.log('Active Requests:', Array.from(this.activeRequests.keys()));
    console.log('Rate Limiter Usage:', this.rateLimiter?.getUsage());
    console.groupEnd();
  }
}

/**
 * MCP 전용 요청 큐
 */
export class MCPRequestQueue extends RequestQueue {
  constructor(
    eventManager: EventManager,
    private mcpClient: any,
    config: RequestQueueConfig = {}
  ) {
    super(eventManager, config);
  }

  /**
   * MCP 요청 실행
   */
  protected async executeRequest(request: QueuedRequest): Promise<any> {
    switch (request.method) {
      case 'tools/call':
        return await this.mcpClient.callTool(
          request.params.name,
          request.params.arguments || {}
        );
      
      case 'tools/list':
        return await this.mcpClient.listTools(request.params.useCache !== false);
      
      case 'resources/read':
        return await this.mcpClient.readResource(request.params.uri);
      
      case 'resources/list':
        return await this.mcpClient.listResources(request.params.useCache !== false);
      
      case 'prompts/get':
        return await this.mcpClient.getPrompt(
          request.params.name,
          request.params.arguments || {}
        );
      
      case 'prompts/list':
        return await this.mcpClient.listPrompts(request.params.useCache !== false);
      
      default:
        throw new Error(`Unsupported MCP method: ${request.method}`);
    }
  }
}