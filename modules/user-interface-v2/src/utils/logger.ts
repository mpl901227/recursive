// 브라우저 콘솔 로그를 원격 서버로 전송하는 완전한 로거 시스템
// user-interface v1의 Logger 시스템을 기반으로 구현

// 전역 Window 인터페이스 확장
declare global {
  interface Window {
    browserLogger: any;
    Logger: typeof Logger;
    logger: Logger;
    loggerManager: LoggerManager;
    LogLevel: typeof LogLevel;
  }
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  data?: any;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
}

export interface LoggerOptions {
  name?: string;
  level?: LogLevel;
  enableConsole?: boolean;
  enableFile?: boolean;
  enableRemote?: boolean;
  remoteEndpoint?: string | null;
  maxLogs?: number;
  includeStack?: boolean;
  includeUrl?: boolean;
  includeUserAgent?: boolean;
  userId?: string | undefined;
  sessionId?: string | undefined;
  colors?: Record<string, string>;
  batchSize?: number;
  batchInterval?: number;
}

export class Logger {
  private name: string;
  private level: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private enableRemote: boolean;
  private remoteEndpoint: string | null;
  private maxLogs: number;
  private logs: LogEntry[] = [];
  private includeStack: boolean;
  private includeUrl: boolean;
  private includeUserAgent: boolean;
  private userId: string | undefined;
  private sessionId: string | undefined;
  private colors: Record<string, string>;
  private batchSize: number;
  private batchInterval: number;
  private logBatch: LogEntry[] = [];
  private batchTimer: number | undefined;

  constructor(options: LoggerOptions = {}) {
    this.name = options.name || 'Logger';
    this.level = options.level ?? LogLevel.INFO;
    this.enableConsole = options.enableConsole ?? true;
    this.enableFile = options.enableFile ?? false;
    this.enableRemote = options.enableRemote ?? false;
    this.remoteEndpoint = options.remoteEndpoint ?? null;
    this.maxLogs = options.maxLogs ?? 1000;
    this.includeStack = options.includeStack ?? false;
    this.includeUrl = options.includeUrl ?? true;
    this.includeUserAgent = options.includeUserAgent ?? true;
    this.userId = options.userId;
    this.sessionId = options.sessionId;
    this.colors = options.colors ?? {
      DEBUG: '#6B7280',
      INFO: '#3B82F6',
      WARN: '#F59E0B',
      ERROR: '#EF4444',
      FATAL: '#7C2D12'
    };
    this.batchSize = options.batchSize ?? 10;
    this.batchInterval = options.batchInterval ?? 5000;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private getBrowserInfo(): { url?: string; userAgent?: string } {
    if (typeof window === 'undefined') return {};
    
    return {
      url: this.includeUrl ? window.location.href : undefined,
      userAgent: this.includeUserAgent ? navigator.userAgent : undefined
    };
  }

  private getStackTrace(): string | undefined {
    if (!this.includeStack) return undefined;
    
    try {
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split('\n');
        return lines.slice(3).join('\n'); // 로거 내부 스택 제거
      }
    } catch (e) {
      // 스택 추적 실패 시 무시
    }
    return undefined;
  }

  private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
    const browserInfo = this.getBrowserInfo();
    
    return {
      timestamp: this.getTimestamp(),
      level: LogLevel[level],
      logger: this.name,
      message,
      data,
      stack: this.getStackTrace(),
      url: browserInfo.url,
      userAgent: browserInfo.userAgent,
      userId: this.userId,
      sessionId: this.sessionId
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private logToConsole(logEntry: LogEntry): void {
    if (!this.enableConsole) return;
    
    const consoleMethod = this.getConsoleMethod(logEntry.level);
    const color = this.colors[logEntry.level] || '#000000';
    
    if (logEntry.data) {
      consoleMethod(
        `%c[${logEntry.timestamp}] ${logEntry.logger} ${logEntry.level}:`,
        `color: ${color}; font-weight: bold`,
        logEntry.message,
        logEntry.data
      );
    } else {
      consoleMethod(
        `%c[${logEntry.timestamp}] ${logEntry.logger} ${logEntry.level}: ${logEntry.message}`,
        `color: ${color}; font-weight: bold`
      );
    }
  }

  private getConsoleMethod(level: string): (...args: any[]) => void {
    switch (level) {
      case 'DEBUG':
        return console.debug;
      case 'WARN':
        return console.warn;
      case 'ERROR':
      case 'FATAL':
        return console.error;
      default:
        return console.log;
    }
  }

  private async logToRemote(logEntry: LogEntry): Promise<void> {
    if (!this.enableRemote || !this.remoteEndpoint) return;

    this.logBatch.push(logEntry);

    if (this.logBatch.length >= this.batchSize) {
      await this.flushLogBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = window.setTimeout(() => {
        this.flushLogBatch();
      }, this.batchInterval);
    }
  }

  private async flushLogBatch(): Promise<void> {
    if (this.logBatch.length === 0) return;

    const batch = [...this.logBatch];
    this.logBatch = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    try {
      if (!this.remoteEndpoint) return;
      
      // user-interface-v2에서는 JSON-RPC 형태로 전송
      const payload = {
        jsonrpc: '2.0',
        method: 'log_batch',
        params: {
          logs: batch.map(entry => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            source: `client-${entry.logger}`,
            level: entry.level,
            timestamp: entry.timestamp,
            message: entry.message,
            metadata: {
              url: entry.url,
              userAgent: entry.userAgent,
              userId: entry.userId,
              sessionId: entry.sessionId,
              stack: entry.stack,
              data: entry.data
            },
            tags: ['browser', 'console'],
            trace_id: null
          })),
          compress: false
        },
        id: Date.now().toString()
      };
      
      const response = await fetch(this.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // 원본 console.error 사용하여 무한 루프 방지
      const originalError = (console as any).__originalError || console.error;
      originalError('Failed to send log batch to remote:', error);
    }
  }

  private storeLog(logEntry: LogEntry): void {
    this.logs.push(logEntry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatMessage(level, message, data);
    
    this.logToConsole(logEntry);
    this.logToRemote(logEntry);
    this.storeLog(logEntry);
  }

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  public error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  public fatal(message: string, data?: any): void {
    this.log(LogLevel.FATAL, message, data);
  }

  public destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // 남은 로그 전송
    if (this.logBatch.length > 0) {
      this.flushLogBatch();
    }
  }
}

export class LoggerManager {
  private static instance: LoggerManager;
  private loggers: Map<string, Logger> = new Map();
  private defaultOptions: LoggerOptions = {
    level: LogLevel.INFO,
    enableConsole: true,
    enableRemote: true,
    remoteEndpoint: 'http://localhost:8888/rpc'
  };

  private constructor() {}

  public static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  public getLogger(name: string, options?: Partial<LoggerOptions>): Logger {
    if (!this.loggers.has(name)) {
      const mergedOptions = { ...this.defaultOptions, ...options, name };
      this.loggers.set(name, new Logger(mergedOptions));
    }
    
    return this.loggers.get(name)!;
  }

  public setDefaultOptions(options: Partial<LoggerOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }
}

// 브라우저 콘솔 캡처 설정
function setupBrowserConsoleCapture() {
  if (typeof window === 'undefined') return;

  const loggerManager = LoggerManager.getInstance();
  
  // 원본 console 메서드 저장
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  // 원본 메서드를 보존
  (console as any).__originalLog = originalConsole.log;
  (console as any).__originalInfo = originalConsole.info;
  (console as any).__originalWarn = originalConsole.warn;
  (console as any).__originalError = originalConsole.error;
  (console as any).__originalDebug = originalConsole.debug;

  // 로그 수집 제외할 패턴들 (최소화)
  const excludePatterns = [
    /Remote logging/,
    /LogSystem/,
    /%c\[.*?\] BrowserConsole/  // 자기 자신의 로그만 제외
  ];

  // 메시지가 제외 패턴에 해당하는지 확인
  const shouldExcludeMessage = (message: string): boolean => {
    return excludePatterns.some(pattern => pattern.test(message));
  };

  // 브라우저 콘솔 로그를 캐치하는 로거 (콘솔 출력 비활성화)
  const consoleLogger = loggerManager.getLogger('BrowserConsole', {
    enableConsole: false,
    enableRemote: true
  });

  // console.log 캐치 (INFO 레벨)
  console.log = (...args: any[]) => {
    originalConsole.log(...args);
    try {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (!shouldExcludeMessage(message)) {
        consoleLogger.info(message);
      }
    } catch (e) {
      // 로그 전송 실패 시 무시
    }
  };

  // console.info 캐치 (INFO 레벨)
  console.info = (...args: any[]) => {
    originalConsole.info(...args);
    try {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (!shouldExcludeMessage(message)) {
        consoleLogger.info(message);
      }
    } catch (e) {
      // 로그 전송 실패 시 무시
    }
  };

  // console.debug 캐치 (DEBUG 레벨)
  console.debug = (...args: any[]) => {
    originalConsole.debug(...args);
    try {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (!shouldExcludeMessage(message)) {
        consoleLogger.debug(message);
      }
    } catch (e) {
      // 로그 전송 실패 시 무시
    }
  };

  // console.warn 캐치 (WARN 레벨)
  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
    try {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (!shouldExcludeMessage(message)) {
        consoleLogger.warn(message);
      }
    } catch (e) {
      // 로그 전송 실패 시 무시
    }
  };

  // console.error 캐치 (ERROR 레벨)
  console.error = (...args: any[]) => {
    originalConsole.error(...args);
    try {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (!shouldExcludeMessage(message)) {
        consoleLogger.error(message);
      }
    } catch (e) {
      // 로그 전송 실패 시 무시
    }
  };

  // 글로벌 에러 핸들러에서도 로그 전송
  window.addEventListener('error', (event) => {
    try {
      const logger = loggerManager.getLogger('ClientError', { enableConsole: false });
      logger.error('JavaScript Error', {
        message: event.error?.message || event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        url: window.location.href
      });
    } catch (e) {
      // 에러 핸들링 실패 시 무시
    }
  });

  // Promise rejection 에러도 캐치
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const logger = loggerManager.getLogger('ClientError', { enableConsole: false });
      logger.error('Unhandled Promise Rejection', {
        reason: event.reason,
        url: window.location.href
      });
    } catch (e) {
      // 에러 핸들링 실패 시 무시
    }
  });

  // 원본 console.log를 사용하여 설정 완료 메시지 출력
  originalConsole.log('✅ Remote logging enabled - ALL console logs will be sent to server');
}

// 전역으로 로거 초기화
if (typeof window !== 'undefined') {
  const loggerManager = LoggerManager.getInstance();
  window.loggerManager = loggerManager;
  window.Logger = Logger;
  window.logger = loggerManager.getLogger('App');
  window.LogLevel = LogLevel;
  
  // 브라우저 콘솔 캡처 설정
  setupBrowserConsoleCapture();
} 