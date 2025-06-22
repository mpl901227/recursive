/**
 * Logger - 통합 로깅 시스템
 * console, file, remote 로깅을 지원하는 Logger 클래스
 * TypeScript 버전 - 타입 안전성과 향상된 기능 제공
 */

// 로그 레벨 열거형
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

// 로그 레벨 이름 매핑
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.FATAL]: 'FATAL'
};

// 로그 엔트리 인터페이스
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

// 로그 필터 인터페이스
export interface LogFilter {
    level?: string;
    since?: string | Date;
    until?: string | Date;
    limit?: number;
    logger?: string;
    search?: string;
}

// 로거 옵션 인터페이스
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

// 성능 측정 인터페이스
export interface PerformanceEntry {
    label: string;
    startTime: number;
    endTime?: number;
    duration?: number;
}

// 로그 통계 인터페이스
export interface LogStats {
    total: number;
    byLevel: Record<string, number>;
    byLogger: Record<string, number>;
    timeRange: {
        start: string;
        end: string;
    };
}

/**
 * Logger 클래스 - 통합 로깅 시스템
 */
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
    private performanceTimers: Map<string, PerformanceEntry> = new Map();
    private batchSize: number;
    private batchInterval: number;
    private logBatch: LogEntry[] = [];
    private batchTimer: number | undefined;

    constructor(options: LoggerOptions = {}) {
        this.name = options.name ?? 'App';
        this.level = options.level ?? LogLevel.INFO;
        this.enableConsole = options.enableConsole ?? true;
        this.enableFile = options.enableFile ?? false;
        this.enableRemote = options.enableRemote ?? false;
        this.remoteEndpoint = options.remoteEndpoint ?? null;
        this.maxLogs = options.maxLogs ?? 1000;
        this.includeStack = options.includeStack ?? false;
        this.includeUrl = options.includeUrl ?? false;
        this.includeUserAgent = options.includeUserAgent ?? false;
        this.userId = options.userId ?? undefined;
        this.sessionId = options.sessionId ?? undefined;
        this.batchSize = options.batchSize ?? 10;
        this.batchInterval = options.batchInterval ?? 5000;
        
        // 기본 색상 설정
        this.colors = {
            DEBUG: '#6c757d',
            INFO: '#007bff',
            WARN: '#ffc107',
            ERROR: '#dc3545',
            FATAL: '#8b0000',
            ...options.colors
        };
    }

    /**
     * 현재 시간을 ISO 형식으로 반환
     */
    private getTimestamp(): string {
        return new Date().toISOString();
    }

    /**
     * 브라우저 정보 수집
     */
    private getBrowserInfo(): { url?: string; userAgent?: string } {
        const info: { url?: string; userAgent?: string } = {};
        
        if (typeof window !== 'undefined') {
            if (this.includeUrl) {
                info.url = window.location.href;
            }
            if (this.includeUserAgent) {
                info.userAgent = navigator.userAgent;
            }
        }
        
        return info;
    }

    /**
     * 스택 트레이스 추출
     */
    private getStackTrace(): string | undefined {
        if (!this.includeStack) return undefined;
        
        try {
            throw new Error();
        } catch (error) {
            if (error instanceof Error && error.stack) {
                // Logger 클래스 내부 호출 스택 제거
                const stack = error.stack.split('\n');
                return stack.slice(3).join('\n');
            }
        }
        
        return undefined;
    }

    /**
     * 로그 메시지 포매팅
     */
    private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
        const timestamp = this.getTimestamp();
        const levelName = LOG_LEVEL_NAMES[level];
        const browserInfo = this.getBrowserInfo();
        const stack = this.getStackTrace();
        
        const logEntry: LogEntry = {
            timestamp,
            level: levelName,
            logger: this.name,
            message,
            ...(browserInfo.url && { url: browserInfo.url }),
            ...(browserInfo.userAgent && { userAgent: browserInfo.userAgent }),
            ...(data !== undefined && { data }),
            ...(stack && { stack }),
            ...(this.userId && { userId: this.userId }),
            ...(this.sessionId && { sessionId: this.sessionId })
        };

        return logEntry;
    }

    /**
     * 로그 출력 여부 확인
     */
    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    /**
     * 콘솔에 로그 출력
     */
    private logToConsole(logEntry: LogEntry): void {
        if (!this.enableConsole) return;

        const { timestamp, level, logger, message, data } = logEntry;
        const color = this.colors[level] || '#000000';
        const prefix = `%c[${timestamp}] ${level} [${logger}]`;
        
        const consoleMethod = this.getConsoleMethod(level);

        if (data !== undefined) {
            consoleMethod(prefix, `color: ${color}; font-weight: bold;`, message, data);
        } else {
            consoleMethod(prefix, `color: ${color}; font-weight: bold;`, message);
        }
    }

    /**
     * 로그 레벨에 따른 콘솔 메서드 반환
     */
    private getConsoleMethod(level: string): (...args: any[]) => void {
        switch (level) {
            case 'DEBUG':
                return console.debug;
            case 'INFO':
                return console.info;
            case 'WARN':
                return console.warn;
            case 'ERROR':
            case 'FATAL':
                return console.error;
            default:
                return console.log;
        }
    }

    /**
     * 파일에 로그 저장 (LocalStorage 활용)
     */
    private logToFile(logEntry: LogEntry): void {
        if (!this.enableFile || typeof localStorage === 'undefined') return;

        try {
            const storageKey = `logs_${this.name}`;
            const existingLogsStr = localStorage.getItem(storageKey);
            let existingLogs: LogEntry[] = existingLogsStr ? JSON.parse(existingLogsStr) : [];
            
            existingLogs.push(logEntry);
            
            // 최대 로그 수 제한
            if (existingLogs.length > this.maxLogs) {
                existingLogs = existingLogs.slice(-this.maxLogs);
            }
            
            localStorage.setItem(storageKey, JSON.stringify(existingLogs));
        } catch (error) {
            console.error('Failed to save log to localStorage:', error);
        }
    }

    /**
     * 원격 서버에 로그 전송 (배치 처리)
     */
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

    /**
     * 로그 배치 전송
     */
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
            
            const response = await fetch(this.remoteEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ logs: batch })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to send log batch to remote:', error);
            // 실패한 로그를 다시 배치에 추가 (재시도 로직)
            this.logBatch.unshift(...batch);
        }
    }

    /**
     * 내부 로그 저장
     */
    private storeLog(logEntry: LogEntry): void {
        this.logs.push(logEntry);
        
        // 메모리 사용량 제한
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }

    /**
     * 통합 로그 메서드
     */
    private log(level: LogLevel, message: string, data?: any): void {
        if (!this.shouldLog(level)) return;

        const logEntry = this.formatMessage(level, message, data);
        
        // 다양한 출력 방법으로 로그 전송
        this.logToConsole(logEntry);
        this.logToFile(logEntry);
        this.logToRemote(logEntry);
        this.storeLog(logEntry);
    }

    /**
     * DEBUG 레벨 로그
     */
    public debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    /**
     * INFO 레벨 로그
     */
    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }

    /**
     * WARN 레벨 로그
     */
    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, data);
    }

    /**
     * ERROR 레벨 로그
     */
    public error(message: string, data?: any): void {
        this.log(LogLevel.ERROR, message, data);
    }

    /**
     * FATAL 레벨 로그
     */
    public fatal(message: string, data?: any): void {
        this.log(LogLevel.FATAL, message, data);
    }

    /**
     * 로그 레벨 설정
     */
    public setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * 로그 레벨 반환
     */
    public getLevel(): LogLevel {
        return this.level;
    }

    /**
     * 사용자 ID 설정
     */
    public setUserId(userId: string): void {
        this.userId = userId;
    }

    /**
     * 세션 ID 설정
     */
    public setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * 자식 로거 생성
     */
    public createChild(childName: string): Logger {
        const fullName = this.name ? `${this.name}:${childName}` : childName;
        
        return new Logger({
            name: fullName,
            level: this.level,
            enableConsole: this.enableConsole,
            enableFile: this.enableFile,
            enableRemote: this.enableRemote,
            remoteEndpoint: this.remoteEndpoint,
            maxLogs: this.maxLogs,
            includeStack: this.includeStack,
            includeUrl: this.includeUrl,
            includeUserAgent: this.includeUserAgent,
            userId: this.userId,
            sessionId: this.sessionId,
            colors: this.colors,
            batchSize: this.batchSize,
            batchInterval: this.batchInterval
        });
    }

    /**
     * 저장된 로그 조회
     */
    public getLogs(filter: LogFilter = {}): LogEntry[] {
        let filteredLogs = [...this.logs];

        if (filter.level) {
            filteredLogs = filteredLogs.filter(log => log.level === filter.level);
        }

        if (filter.logger) {
            filteredLogs = filteredLogs.filter(log => log.logger.includes(filter.logger!));
        }

        if (filter.search) {
            const searchTerm = filter.search.toLowerCase();
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(searchTerm) ||
                (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm))
            );
        }

        if (filter.since) {
            const sinceDate = new Date(filter.since);
            filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= sinceDate);
        }

        if (filter.until) {
            const untilDate = new Date(filter.until);
            filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= untilDate);
        }

        if (filter.limit) {
            filteredLogs = filteredLogs.slice(-filter.limit);
        }

        return filteredLogs;
    }

    /**
     * 로그 통계 조회
     */
    public getStats(): LogStats {
        const stats: LogStats = {
            total: this.logs.length,
            byLevel: {},
            byLogger: {},
            timeRange: {
                start: '',
                end: ''
            }
        };

        if (this.logs.length > 0) {
            stats.timeRange.start = this.logs[0]!.timestamp;
            stats.timeRange.end = this.logs[this.logs.length - 1]!.timestamp;

            this.logs.forEach(log => {
                // 레벨별 통계
                stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
                
                // 로거별 통계
                stats.byLogger[log.logger] = (stats.byLogger[log.logger] || 0) + 1;
            });
        }

        return stats;
    }

    /**
     * 로그 내보내기
     */
    public exportLogs(format: 'json' | 'csv' | 'txt' = 'json'): string {
        switch (format) {
            case 'json':
                return JSON.stringify(this.logs, null, 2);
            
            case 'csv':
                if (this.logs.length === 0) return '';
                
                const headers = ['timestamp', 'level', 'logger', 'message', 'data'];
                const csvContent = [
                    headers.join(','),
                    ...this.logs.map(log => [
                        log.timestamp,
                        log.level,
                        log.logger,
                        `"${log.message.replace(/"/g, '""')}"`,
                        log.data ? `"${JSON.stringify(log.data).replace(/"/g, '""')}"` : ''
                    ].join(','))
                ].join('\n');
                
                return csvContent;
            
            case 'txt':
                return this.logs.map(log => 
                    `[${log.timestamp}] ${log.level} [${log.logger}] ${log.message}${
                        log.data ? ` | Data: ${JSON.stringify(log.data)}` : ''
                    }`
                ).join('\n');
            
            default:
                return JSON.stringify(this.logs, null, 2);
        }
    }

    /**
     * 로그 지우기
     */
    public clearLogs(): void {
        this.logs = [];
        
        if (this.enableFile && typeof localStorage !== 'undefined') {
            try {
                localStorage.removeItem(`logs_${this.name}`);
            } catch (error) {
                console.error('Failed to clear logs from localStorage:', error);
            }
        }
    }

    /**
     * 성능 측정 시작
     */
    public time(label: string): void {
        const entry: PerformanceEntry = {
            label,
            startTime: performance.now()
        };
        
        this.performanceTimers.set(label, entry);
        console.time(`${this.name}_${label}`);
    }

    /**
     * 성능 측정 종료
     */
    public timeEnd(label: string): number | undefined {
        const entry = this.performanceTimers.get(label);
        if (!entry) {
            this.warn(`Performance timer '${label}' was not started`);
            return undefined;
        }

        const endTime = performance.now();
        const duration = endTime - entry.startTime;
        
        entry.endTime = endTime;
        entry.duration = duration;
        
        console.timeEnd(`${this.name}_${label}`);
        this.info(`Performance: ${label} completed in ${duration.toFixed(2)}ms`);
        
        this.performanceTimers.delete(label);
        return duration;
    }

    /**
     * 성능 측정 결과 조회
     */
    public getPerformanceTimers(): PerformanceEntry[] {
        return Array.from(this.performanceTimers.values());
    }

    /**
     * 로거 설정 업데이트
     */
    public updateConfig(options: Partial<LoggerOptions>): void {
        if (options.level !== undefined) this.level = options.level;
        if (options.enableConsole !== undefined) this.enableConsole = options.enableConsole;
        if (options.enableFile !== undefined) this.enableFile = options.enableFile;
        if (options.enableRemote !== undefined) this.enableRemote = options.enableRemote;
        if (options.remoteEndpoint !== undefined) this.remoteEndpoint = options.remoteEndpoint;
        if (options.maxLogs !== undefined) this.maxLogs = options.maxLogs;
        if (options.includeStack !== undefined) this.includeStack = options.includeStack;
        if (options.includeUrl !== undefined) this.includeUrl = options.includeUrl;
        if (options.includeUserAgent !== undefined) this.includeUserAgent = options.includeUserAgent;
        if (options.userId !== undefined) this.userId = options.userId;
        if (options.sessionId !== undefined) this.sessionId = options.sessionId;
        if (options.colors !== undefined) this.colors = { ...this.colors, ...options.colors };
        if (options.batchSize !== undefined) this.batchSize = options.batchSize;
        if (options.batchInterval !== undefined) this.batchInterval = options.batchInterval;
    }

    /**
     * 리소스 정리
     */
    public destroy(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
        
        // 남은 로그 배치 전송
        if (this.logBatch.length > 0) {
            this.flushLogBatch();
        }
        
        this.performanceTimers.clear();
        this.logs = [];
        this.logBatch = [];
    }
}

/**
 * 로거 매니저 클래스
 */
export class LoggerManager {
    private static instance: LoggerManager;
    private loggers: Map<string, Logger> = new Map();
    private defaultOptions: LoggerOptions = {
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
        enableRemote: false
    };

    private constructor() {}

    public static getInstance(): LoggerManager {
        if (!LoggerManager.instance) {
            LoggerManager.instance = new LoggerManager();
        }
        return LoggerManager.instance;
    }

    /**
     * 기본 옵션 설정
     */
    public setDefaultOptions(options: Partial<LoggerOptions>): void {
        this.defaultOptions = { ...this.defaultOptions, ...options };
    }

    /**
     * 로거 생성 또는 조회
     */
    public getLogger(name: string, options?: Partial<LoggerOptions>): Logger {
        if (!this.loggers.has(name)) {
            const loggerOptions = { ...this.defaultOptions, name, ...options };
            const logger = new Logger(loggerOptions);
            this.loggers.set(name, logger);
        }
        const logger = this.loggers.get(name);
        if (!logger) {
            throw new Error(`Failed to create logger: ${name}`);
        }
        return logger;
    }

    /**
     * 모든 로거 조회
     */
    public getAllLoggers(): Logger[] {
        return Array.from(this.loggers.values());
    }

    /**
     * 로거 제거
     */
    public removeLogger(name: string): boolean {
        const logger = this.loggers.get(name);
        if (logger) {
            logger.destroy();
            return this.loggers.delete(name);
        }
        return false;
    }

    /**
     * 모든 로거 정리
     */
    public destroyAll(): void {
        this.loggers.forEach(logger => logger.destroy());
        this.loggers.clear();
    }
}

// 기본 logger 인스턴스 생성
export const logger = new Logger({
    name: 'App',
    level: LogLevel.INFO,
    enableConsole: true,
    enableFile: true,
    enableRemote: false
});

// 로거 매니저 인스턴스
export const loggerManager = LoggerManager.getInstance();

// 전역에서 사용할 수 있도록 설정
declare global {
    interface Window {
        Logger: typeof Logger;
        logger: Logger;
        loggerManager: LoggerManager;
        LogLevel: typeof LogLevel;
    }
}

if (typeof window !== 'undefined') {
    window.Logger = Logger;
    window.logger = logger;
    window.loggerManager = loggerManager;
    window.LogLevel = LogLevel;
}

// 유틸리티 함수들
export const createLogger = (name: string, options?: Partial<LoggerOptions>): Logger => {
    return loggerManager.getLogger(name, options);
};

export const setGlobalLogLevel = (level: LogLevel): void => {
    loggerManager.setDefaultOptions({ level });
    loggerManager.getAllLoggers().forEach(logger => logger.setLevel(level));
};

export const enableRemoteLogging = (endpoint: string): void => {
    loggerManager.setDefaultOptions({ 
        enableRemote: true, 
        remoteEndpoint: endpoint 
    });
};

export const disableConsoleLogging = (): void => {
    loggerManager.setDefaultOptions({ enableConsole: false });
};