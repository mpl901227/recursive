// Error Handler - 전역 에러 핸들링 시스템
// 에러 감지, 로깅, 리포팅, 사용자 친화적 메시지 표시를 담당하는 클래스

import { EventManager } from '../core/events';

export interface ErrorInfo {
  id: string;
  type: ErrorType;
  subType?: string | undefined;
  message: string;
  timestamp: Date;
  stack?: string | undefined;
  filename?: string | undefined;
  lineno?: number | undefined;
  colno?: number | undefined;
  url?: string | undefined;
  status?: number | undefined;
  statusText?: string | undefined;
  element?: string | undefined;
  source?: string | undefined;
  context?: Record<string, any> | undefined;
  severity: ErrorSeverity;
  userAgent: string;
  sessionId: string;
  userId?: string | undefined;
  count: number;
}

export enum ErrorType {
  JAVASCRIPT = 'javascript',
  PROMISE = 'promise',
  RESOURCE = 'resource',
  NETWORK = 'network',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  STORAGE = 'storage',
  MANUAL = 'manual',
  SYSTEM = 'system'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorHandlerConfig {
  enabled: boolean;
  reportToServer: boolean;
  serverEndpoint?: string;
  showUserNotifications: boolean;
  maxErrors: number;
  enableStackTrace: boolean;
  enableConsoleLogging: boolean;
  enableLocalStorage: boolean;
  rateLimitMs: number;
  maxErrorsPerType: number;
  debugMode: boolean;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  recentErrors: number;
  sessionStartTime: Date;
  lastErrorTime?: Date | undefined;
}

export type ErrorHandler = (errorInfo: ErrorInfo) => void;
export type ErrorFilter = (errorInfo: ErrorInfo) => boolean;

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  enabled: true,
  reportToServer: false,
  showUserNotifications: true,
  maxErrors: 100,
  enableStackTrace: true,
  enableConsoleLogging: true,
  enableLocalStorage: true,
  rateLimitMs: 1000,
  maxErrorsPerType: 10,
  debugMode: false
};

export class ErrorHandlerManager {
  private config: ErrorHandlerConfig;
  private eventManager: EventManager;
  private errors: ErrorInfo[] = [];
  private errorCounts = new Map<string, number>();
  private categoryHandlers = new Map<ErrorType, ErrorHandler>();
  private errorMessages = new Map<string, string>();
  private ignoreRules: ErrorFilter[] = [];
  private lastErrorTimes = new Map<string, number>();
  private sessionId: string;
  private sessionStartTime: Date;
  private isInitialized = false;

  constructor(eventManager: EventManager, config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventManager = eventManager;
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();
    
    this.setupDefaultMessages();
    
    if (this.config.enabled) {
      this.initialize();
    }

    console.log('Error Handler created');
  }

  /**
   * 에러 핸들러 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.setupGlobalHandlers();
    this.loadStoredErrors();
    
    this.isInitialized = true;
    this.eventManager.emit('errorHandler:initialized');
    
    this.log('ErrorHandler initialized');
  }

  /**
   * 전역 에러 핸들러 설정
   */
  private setupGlobalHandlers(): void {
    // JavaScript 런타임 에러
    window.addEventListener('error', (event) => {
      this.handleError({
        type: ErrorType.JAVASCRIPT,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        severity: ErrorSeverity.HIGH
      });
    });

    // Promise rejection 에러
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: ErrorType.PROMISE,
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        severity: ErrorSeverity.HIGH,
        context: { reason: event.reason }
      });
    });

    // Resource loading 에러
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        const target = event.target as HTMLElement;
        this.handleError({
          type: ErrorType.RESOURCE,
          message: `Failed to load resource: ${(target as any).src || (target as any).href}`,
          element: target.tagName,
          source: (target as any).src || (target as any).href,
          severity: ErrorSeverity.MEDIUM
        });
      }
    }, true);

    // 네트워크 에러 인터셉터 설정
    this.setupNetworkErrorHandlers();
  }

  /**
   * 네트워크 에러 핸들러 설정
   */
  private setupNetworkErrorHandlers(): void {
    // Fetch API 에러 핸들링
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      try {
        const response = await originalFetch(...args);
        
        if (!response.ok) {
          this.handleError({
            type: ErrorType.NETWORK,
            subType: 'fetch',
            message: `HTTP ${response.status}: ${response.statusText}`,
            url: args[0] as string,
            status: response.status,
            statusText: response.statusText,
            severity: response.status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM
          });
        }
        
        return response;
      } catch (error) {
        this.handleError({
          type: ErrorType.NETWORK,
          subType: 'fetch',
          message: `Network request failed: ${(error as Error).message}`,
          url: args[0] as string,
          stack: (error as Error).stack,
          severity: ErrorSeverity.HIGH
        });
        throw error;
      }
    };
  }

  /**
   * 기본 에러 메시지 설정
   */
  private setupDefaultMessages(): void {
    this.errorMessages.set(ErrorType.JAVASCRIPT, 'An unexpected error occurred. Please refresh the page and try again.');
    this.errorMessages.set(ErrorType.PROMISE, 'A background operation failed. Some features might not work properly.');
    this.errorMessages.set(ErrorType.RESOURCE, 'Failed to load required resources. Please check your internet connection.');
    this.errorMessages.set(ErrorType.NETWORK, 'Network request failed. Please check your internet connection and try again.');
    this.errorMessages.set(ErrorType.VALIDATION, 'Invalid input detected. Please check your data and try again.');
    this.errorMessages.set(ErrorType.PERMISSION, 'Permission denied. You may not have access to this feature.');
    this.errorMessages.set(ErrorType.STORAGE, 'Local storage operation failed. Your browser may be in private mode.');
  }

  /**
   * 에러 처리 메인 함수
   */
  handleError(errorData: Partial<ErrorInfo>): void {
    // 기본 정보 설정
    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      type: errorData.type || ErrorType.MANUAL,
      subType: errorData.subType,
      message: errorData.message || 'Unknown error',
      timestamp: new Date(),
      stack: errorData.stack,
      filename: errorData.filename,
      lineno: errorData.lineno,
      colno: errorData.colno,
      url: errorData.url,
      status: errorData.status,
      statusText: errorData.statusText,
      element: errorData.element,
      source: errorData.source,
      context: errorData.context,
      severity: errorData.severity || ErrorSeverity.MEDIUM,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: errorData.userId,
      count: 1
    };

    // 필터링 규칙 적용
    if (this.shouldIgnoreError(errorInfo)) {
      return;
    }

    // Rate limiting 적용
    if (!this.checkRateLimit(errorInfo)) {
      return;
    }

    // 에러 저장
    this.storeError(errorInfo);
    
    // 카테고리별 처리
    this.processByCategory(errorInfo);
    
    // 사용자 알림
    if (this.config.showUserNotifications) {
      this.notifyUser(errorInfo);
    }
    
    // 서버 리포팅
    if (this.config.reportToServer) {
      this.reportToRemote(errorInfo);
    }
    
    // 콘솔 로깅
    if (this.config.enableConsoleLogging) {
      this.logToConsole(errorInfo);
    }

    // 이벤트 발생
    this.eventManager.emit('error:occurred', errorInfo);
  }

  /**
   * 프로그래밍 방식 에러 리포팅
   */
  reportError(error: Error | string, context: Record<string, any> = {}): void {
    let errorInfo: Partial<ErrorInfo>;
    
    if (error instanceof Error) {
      errorInfo = {
        type: context.type || ErrorType.MANUAL,
        message: error.message,
        stack: error.stack,
        context,
        severity: context.severity || ErrorSeverity.MEDIUM
      };
    } else if (typeof error === 'string') {
      errorInfo = {
        type: context.type || ErrorType.MANUAL,
        message: error,
        context,
        severity: context.severity || ErrorSeverity.MEDIUM
      };
    } else {
      errorInfo = {
        type: context.type || ErrorType.MANUAL,
        message: 'Unknown error occurred',
        context: { ...context, data: error },
        severity: context.severity || ErrorSeverity.MEDIUM
      };
    }
    
    this.handleError(errorInfo);
  }

  /**
   * 에러 저장
   */
  private storeError(errorInfo: ErrorInfo): void {
    // 중복 에러 확인
    const errorKey = `${errorInfo.type}:${errorInfo.message}`;
    const existingCount = this.errorCounts.get(errorKey) || 0;
    errorInfo.count = existingCount + 1;
    
    this.errors.push(errorInfo);
    this.errorCounts.set(errorKey, errorInfo.count);
    
    // 최대 에러 수 제한
    if (this.errors.length > this.config.maxErrors) {
      this.errors = this.errors.slice(-this.config.maxErrors);
    }
    
    // LocalStorage에 저장
    if (this.config.enableLocalStorage) {
      this.saveToLocalStorage();
    }
  }

  /**
   * 카테고리별 에러 처리
   */
  private processByCategory(errorInfo: ErrorInfo): void {
    const handler = this.categoryHandlers.get(errorInfo.type);
    if (handler) {
      try {
        handler(errorInfo);
      } catch (handlerError) {
        console.error('Error in category handler:', handlerError);
      }
    }
  }

  /**
   * 사용자 알림
   */
  private notifyUser(errorInfo: ErrorInfo): void {
    const message = this.getUserFriendlyMessage(errorInfo);
    
    // 심각도에 따른 알림 방식 결정
    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
        this.eventManager.emit('notification:error', {
          title: 'Critical Error',
          message,
          persistent: true,
          actions: [
            { label: 'Reload Page', action: () => window.location.reload() },
            { label: 'Report Issue', action: () => this.showErrorDetails(errorInfo) }
          ]
        });
        break;
        
      case ErrorSeverity.HIGH:
        this.eventManager.emit('notification:error', {
          title: 'Error',
          message,
          duration: 10000
        });
        break;
        
      case ErrorSeverity.MEDIUM:
        this.eventManager.emit('notification:warning', {
          title: 'Warning',
          message,
          duration: 5000
        });
        break;
        
      case ErrorSeverity.LOW:
        if (this.config.debugMode) {
          this.eventManager.emit('notification:info', {
            title: 'Info',
            message,
            duration: 3000
          });
        }
        break;
    }
  }

  /**
   * 사용자 친화적 메시지 생성
   */
  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    // 커스텀 메시지 우선
    const customMessage = this.errorMessages.get(`${errorInfo.type}:${errorInfo.message}`);
    if (customMessage) {
      return customMessage;
    }
    
    // 타입별 기본 메시지
    const typeMessage = this.errorMessages.get(errorInfo.type);
    if (typeMessage) {
      return typeMessage;
    }
    
    // 기본 메시지
    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * 서버 리포팅
   */
  private async reportToRemote(errorInfo: ErrorInfo): Promise<void> {
    if (!this.config.serverEndpoint) return;
    
    try {
      await fetch(this.config.serverEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: errorInfo,
          metadata: {
            version: this.getAppVersion(),
            build: this.getBuildInfo(),
            sessionId: this.sessionId
          }
        })
      });
    } catch (error) {
      console.error('Failed to report error to server:', error);
    }
  }

  /**
   * 콘솔 로깅
   */
  private logToConsole(errorInfo: ErrorInfo): void {
    const message = `[ErrorHandler] ${errorInfo.type}: ${errorInfo.message}`;
    
    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(message, errorInfo);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(message, errorInfo);
        break;
      case ErrorSeverity.LOW:
        if (this.config.debugMode) {
          console.log(message, errorInfo);
        }
        break;
    }
  }

  /**
   * Rate limiting 확인
   */
  private checkRateLimit(errorInfo: ErrorInfo): boolean {
    const errorKey = `${errorInfo.type}:${errorInfo.message}`;
    const now = Date.now();
    const lastTime = this.lastErrorTimes.get(errorKey) || 0;
    
    if (now - lastTime < this.config.rateLimitMs) {
      return false;
    }
    
    this.lastErrorTimes.set(errorKey, now);
    return true;
  }

  /**
   * 에러 필터링 규칙 확인
   */
  private shouldIgnoreError(errorInfo: ErrorInfo): boolean {
    return this.ignoreRules.some(rule => rule(errorInfo));
  }

  /**
   * LocalStorage 저장
   */
  private saveToLocalStorage(): void {
    try {
      const recentErrors = this.errors.slice(-10);
      localStorage.setItem('recursive_errors', JSON.stringify({
        timestamp: Date.now(),
        sessionId: this.sessionId,
        errors: recentErrors
      }));
    } catch (error) {
      // LocalStorage 실패 시 무시
    }
  }

  /**
   * LocalStorage에서 에러 로드
   */
  private loadStoredErrors(): void {
    if (!this.config.enableLocalStorage) return;
    
    try {
      const stored = localStorage.getItem('recursive_errors');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.sessionId !== this.sessionId && data.errors) {
          // 이전 세션의 에러들을 복구 (선택적)
          this.log('Loaded stored errors from previous session', data.errors.length);
        }
      }
    } catch (error) {
      // 파싱 실패 시 무시
    }
  }

  /**
   * 카테고리 핸들러 등록
   */
  addCategoryHandler(type: ErrorType, handler: ErrorHandler): void {
    this.categoryHandlers.set(type, handler);
  }

  /**
   * 커스텀 에러 메시지 설정
   */
  setErrorMessage(key: string, message: string): void {
    this.errorMessages.set(key, message);
  }

  /**
   * 필터 규칙 추가
   */
  addIgnoreRule(rule: ErrorFilter): void {
    this.ignoreRules.push(rule);
  }

  /**
   * 에러 통계 조회
   */
  getErrorStats(): ErrorStats {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentErrors = this.errors.filter(error => 
      error.timestamp.getTime() > oneHourAgo
    ).length;

    const errorsByType: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};

    this.errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    return {
      totalErrors: this.errors.length,
      errorsByType,
      errorsBySeverity,
      recentErrors,
      sessionStartTime: this.sessionStartTime,
      lastErrorTime: this.errors.length > 0 ? this.errors[this.errors.length - 1]?.timestamp : undefined
    };
  }

  /**
   * 모든 에러 조회
   */
  getAllErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  /**
   * 에러 필터링 조회
   */
  getErrorsByType(type: ErrorType): ErrorInfo[] {
    return this.errors.filter(error => error.type === type);
  }

  /**
   * 에러 초기화
   */
  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
    this.lastErrorTimes.clear();
    
    if (this.config.enableLocalStorage) {
      try {
        localStorage.removeItem('recursive_errors');
      } catch (error) {
        // 무시
      }
    }
    
    this.eventManager.emit('errors:cleared');
  }

  /**
   * 에러 상세 정보 표시
   */
  showErrorDetails(errorInfo: ErrorInfo): void {
    this.eventManager.emit('modal:show', {
      title: 'Error Details',
      content: `
        <div class="error-details">
          <h4>Error Information</h4>
          <p><strong>Type:</strong> ${errorInfo.type}</p>
          <p><strong>Message:</strong> ${errorInfo.message}</p>
          <p><strong>Severity:</strong> ${errorInfo.severity}</p>
          <p><strong>Timestamp:</strong> ${errorInfo.timestamp.toISOString()}</p>
          ${errorInfo.stack ? `<h4>Stack Trace</h4><pre>${errorInfo.stack}</pre>` : ''}
          ${errorInfo.context ? `<h4>Context</h4><pre>${JSON.stringify(errorInfo.context, null, 2)}</pre>` : ''}
        </div>
      `,
      size: 'large',
      actions: [
        {
          label: 'Copy to Clipboard',
          action: () => navigator.clipboard?.writeText(JSON.stringify(errorInfo, null, 2))
        },
        {
          label: 'Report Issue',
          action: () => this.reportToRemote(errorInfo)
        }
      ]
    });
  }

  /**
   * 에러 내보내기
   */
  exportErrors(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      sessionId: this.sessionId,
      stats: this.getErrorStats(),
      errors: this.errors,
      counts: Array.from(this.errorCounts.entries())
    }, null, 2);
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.eventManager.emit('errorHandler:configUpdated', this.config);
  }

  /**
   * 설정 조회
   */
  getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }

  /**
   * 정리
   */
  async destroy(): Promise<void> {
    if (this.config.enableLocalStorage) {
      this.saveToLocalStorage();
    }
    
    this.errors = [];
    this.errorCounts.clear();
    this.categoryHandlers.clear();
    this.lastErrorTimes.clear();
    
    this.isInitialized = false;
    this.eventManager.emit('errorHandler:destroyed');
  }

  // 유틸리티 메서드들
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    let sessionId = sessionStorage.getItem('recursive_errorHandler_sessionId');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('recursive_errorHandler_sessionId', sessionId);
    }
    return sessionId;
  }

  private getAppVersion(): string {
    return (window as any).APP_VERSION || '2.0.0';
  }

  private getBuildInfo(): string {
    return (window as any).BUILD_INFO || 'development';
  }

  private log(message: string, data?: any): void {
    if (this.config.debugMode) {
      console.log(`[ErrorHandler] ${message}`, data || '');
    }
  }
}

// 기본 인스턴스 생성 헬퍼
export function createErrorHandler(
  eventManager: EventManager,
  config?: Partial<ErrorHandlerConfig>
): ErrorHandlerManager {
  return new ErrorHandlerManager(eventManager, config);
}

// 기본 내보내기
export default ErrorHandlerManager; 