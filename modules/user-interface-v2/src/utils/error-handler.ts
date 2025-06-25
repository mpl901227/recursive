// ========================================
// Error Handler - 간단한 에러 핸들링 (V2 최적화)
// ========================================

import { toast } from './toast';

export type ErrorType = 'javascript' | 'promise' | 'network' | 'manual';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorInfo {
  id: string;
  type: ErrorType;
  message: string;
  timestamp: Date;
  stack?: string;
  url?: string;
  severity: ErrorSeverity;
  count: number;
  context?: Record<string, any>;
}

export interface ErrorHandlerConfig {
  enabled: boolean;
  showToasts: boolean;
  logToConsole: boolean;
  maxErrors: number;
  rateLimitMs: number;
}

class ErrorHandlerManager {
  private config: ErrorHandlerConfig;
  private errors: ErrorInfo[] = [];
  private errorCounts = new Map<string, number>();
  private lastErrorTimes = new Map<string, number>();
  private isInitialized = false;
  private errorCounter = 0;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enabled: true,
      showToasts: true,
      logToConsole: true,
      maxErrors: 50,
      rateLimitMs: 1000,
      ...config
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.isInitialized) return;

    // JavaScript 런타임 에러
    window.addEventListener('error', (event) => {
      this.handleError({
        type: 'javascript',
        message: event.message,
        stack: event.error?.stack,
        url: event.filename,
        severity: 'high'
      });
    });

    // Promise rejection 에러
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: 'promise',
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        severity: 'high',
        context: { reason: event.reason }
      });
    });

    this.isInitialized = true;
  }

  handleError(errorData: Partial<ErrorInfo>): void {
    if (!this.config.enabled) return;

    const errorInfo: ErrorInfo = {
      id: `error-${++this.errorCounter}`,
      type: errorData.type || 'manual',
      message: errorData.message || 'Unknown error',
      timestamp: new Date(),
      stack: errorData.stack,
      url: errorData.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      severity: errorData.severity || 'medium',
      count: 1,
      context: errorData.context
    };

    // 중복 에러 체크
    const errorKey = `${errorInfo.type}:${errorInfo.message}`;
    if (this.errorCounts.has(errorKey)) {
      // 속도 제한 체크
      const lastTime = this.lastErrorTimes.get(errorKey) || 0;
      if (Date.now() - lastTime < this.config.rateLimitMs) {
        return;
      }
      
      errorInfo.count = (this.errorCounts.get(errorKey) || 0) + 1;
    }

    this.errorCounts.set(errorKey, errorInfo.count);
    this.lastErrorTimes.set(errorKey, Date.now());

    // 에러 저장
    this.storeError(errorInfo);

    // 콘솔 로깅
    if (this.config.logToConsole) {
      this.logToConsole(errorInfo);
    }

    // 사용자 알림
    if (this.config.showToasts) {
      this.showToast(errorInfo);
    }
  }

  private storeError(errorInfo: ErrorInfo): void {
    this.errors.unshift(errorInfo);
    
    // 최대 에러 수 제한
    if (this.errors.length > this.config.maxErrors) {
      this.errors = this.errors.slice(0, this.config.maxErrors);
    }
  }

  private logToConsole(errorInfo: ErrorInfo): void {
    const prefix = `[${errorInfo.type.toUpperCase()}] ${errorInfo.timestamp.toISOString()}`;
    
    switch (errorInfo.severity) {
      case 'critical':
      case 'high':
        console.error(prefix, errorInfo.message, errorInfo);
        break;
      case 'medium':
        console.warn(prefix, errorInfo.message, errorInfo);
        break;
      default:
        console.log(prefix, errorInfo.message, errorInfo);
    }
  }

  private showToast(errorInfo: ErrorInfo): void {
    // 중복 에러는 토스트 표시 안 함
    if (errorInfo.count > 1) return;

    const message = this.getUserFriendlyMessage(errorInfo);
    
    switch (errorInfo.severity) {
      case 'critical':
      case 'high':
        toast.error(message, { duration: 8000 });
        break;
      case 'medium':
        toast.warning(message, { duration: 5000 });
        break;
      default:
        toast.info(message, { duration: 3000 });
    }
  }

  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    const commonMessages: Record<string, string> = {
      'Script error.': '스크립트 실행 중 오류가 발생했습니다.',
      'Network Error': '네트워크 연결에 문제가 있습니다.',
      'Failed to fetch': '서버에 연결할 수 없습니다.',
      'Permission denied': '권한이 부족합니다.',
      'Unhandled Promise Rejection': '처리되지 않은 오류가 발생했습니다.'
    };

    return commonMessages[errorInfo.message] || 
           (errorInfo.message.length > 100 ? 
            errorInfo.message.substring(0, 100) + '...' : 
            errorInfo.message);
  }

  // 공용 메서드들
  reportError(error: Error | string, context: Record<string, any> = {}): void {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    this.handleError({
      type: 'manual',
      message,
      stack,
      severity: 'medium',
      context
    });
  }

  getErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  getErrorStats() {
    const now = Date.now();
    const recentErrors = this.errors.filter(e => 
      now - e.timestamp.getTime() < 5 * 60 * 1000 // 5분 이내
    );

    return {
      total: this.errors.length,
      recent: recentErrors.length,
      byType: this.groupBy(this.errors, 'type'),
      bySeverity: this.groupBy(this.errors, 'severity')
    };
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((acc, item) => {
      const value = String(item[key]);
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
    this.lastErrorTimes.clear();
  }

  updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  destroy(): void {
    this.clearErrors();
    // 이벤트 리스너는 제거할 수 없으므로 config.enabled로 제어
    this.config.enabled = false;
  }
}

// 전역 인스턴스
export const errorHandler = new ErrorHandlerManager();

// 전역 에러 리포트 함수
export const reportError = (error: Error | string, context?: Record<string, any>) => {
  errorHandler.reportError(error, context);
};

// 타입 가드
export const isError = (value: unknown): value is Error => {
  return value instanceof Error;
}; 