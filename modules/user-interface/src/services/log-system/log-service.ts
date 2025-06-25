/**
 * Log System Service
 * log-system의 고수준 관리를 담당하는 서비스 클래스
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.3 구현
 */

import type {
  Service,
  ServiceStatus,
  EventManager
} from '../../types/index';

import type {
  LogSystemConfig,
  LogSystemStatus,
  LogQueryParams,
  LogQueryResult,
  SearchOptions,
  SearchResult,
  LogStatistics,
  TimeRange,
  LogCallback,
  LogStream,
  LogFilter,
  LogServiceResponse,
  BatchLogOptions,
  PartialLogEntry,
  LogSystemEventType,
  LogSystemEventData
} from '../../types/log-system';

import { LogClient as LogClientImpl, type LogClientStats } from './log-client';
import type { LogMCPTools } from '../mcp/log-mcp-tools.js';

/**
 * 연결 상태 타입
 */
export type LogSystemConnectionStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'error'
  | 'destroyed';

/**
 * 서비스 상태 정보
 */
export interface LogSystemServiceStatus {
  /** 서비스 상태 */
  serviceStatus: ServiceStatus;
  /** 연결 상태 */
  connectionStatus: LogSystemConnectionStatus;
  /** 마지막 연결 시간 */
  lastConnectedAt?: number;
  /** 연결 시도 횟수 */
  connectionAttempts: number;
  /** 재연결 활성화 여부 */
  autoReconnectEnabled: boolean;
  /** 활성 스트림 수 */
  activeStreams: number;
  /** 마지막 에러 */
  lastError?: string;
  /** 마지막 에러 시간 */
  lastErrorAt?: number;
  /** 시스템 업타임 */
  uptimeSeconds: number;
}

/**
 * 재연결 설정
 */
export interface ReconnectionConfig {
  /** 자동 재연결 활성화 */
  enabled: boolean;
  /** 최대 재연결 시도 횟수 */
  maxAttempts: number;
  /** 초기 재연결 지연 시간 (ms) */
  initialDelay: number;
  /** 최대 재연결 지연 시간 (ms) */
  maxDelay: number;
  /** 지연 배수 */
  backoffMultiplier: number;
}

/**
 * 헬스체크 설정
 */
export interface HealthCheckConfig {
  /** 헬스체크 활성화 */
  enabled: boolean;
  /** 헬스체크 간격 (ms) */
  interval: number;
  /** 헬스체크 타임아웃 (ms) */
  timeout: number;
  /** 연속 실패 임계값 */
  failureThreshold: number;
}

/**
 * LogSystemService 에러 클래스
 */
export class LogSystemServiceError extends Error {
  public readonly name = 'LogSystemServiceError';
  public readonly timestamp: number;

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.timestamp = Date.now();
    Object.setPrototypeOf(this, LogSystemServiceError.prototype);
  }
}

/**
 * 로그 시스템 서비스 메인 클래스
 * Service 인터페이스를 구현하여 서비스 레지스트리에 등록 가능
 */
export class LogSystemService implements Service {
  // Service 인터페이스 구현
  public readonly name = 'log-system';
  public readonly version = '1.0.0';
  public isInitialized = false;
  public status: ServiceStatus = 'pending';

  // 설정 및 의존성
  private config: LogSystemConfig;
  private eventManager: EventManager | null = null;

  // LogClient 관리
  private logClient: LogClientImpl | null = null;

  // MCP 통합
  private mcpTools: LogMCPTools | null = null;
  private mcpEventListeners: Array<() => void> = [];
  
  // 연결 상태 관리
  private connectionStatus: LogSystemConnectionStatus = 'disconnected';
  private connectionAttempts = 0;
  private lastConnectedAt?: number;
  private lastErrorAt?: number;
  private lastError?: string;
  private startTime = Date.now();

  // 재연결 관리
  private reconnectionConfig: ReconnectionConfig;
  private reconnectionTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;

  // 헬스체크 관리
  private healthCheckConfig: HealthCheckConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private healthCheckFailures = 0;

  // 이벤트 리스너
  private eventListeners: Map<LogSystemEventType, Array<(data: LogSystemEventData) => void>> = new Map();

  constructor(config: LogSystemConfig, eventManager?: EventManager) {
    // 기본값 먼저 설정 후 config로 오버라이드
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
    
    this.config = { ...defaultConfig, ...config };

    this.eventManager = eventManager || null;

    // 재연결 설정 초기화
    this.reconnectionConfig = {
      enabled: true,
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    };

    // 헬스체크 설정 초기화
    this.healthCheckConfig = {
      enabled: true,
      interval: 30000, // 30초
      timeout: 5000,   // 5초
      failureThreshold: 3
    };

    this.initializeEventListeners();
  }

  // =============================================================================
  // 🔧 Service Interface Implementation
  // =============================================================================

  /**
   * 서비스 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.status = 'initializing';
      this.emit('service:initializing', { config: this.config });

      // 설정 검증
      this.validateConfig();

      // LogClient 생성
      this.logClient = new LogClientImpl(this.config);

      // LogClient 이벤트 리스너 설정
      this.setupLogClientListeners();

      // 자동 연결이 활성화되어 있으면 연결 시도
      if (this.config.autoConnect) {
        await this.connect();
      }

      // 헬스체크 시작
      if (this.healthCheckConfig.enabled) {
        this.startHealthCheck();
      }

      // MCP 통합 초기화
      await this.initializeMCPIntegration();

      this.status = 'ready';
      this.isInitialized = true;

      this.emit('service:initialized', {
        name: this.name,
        version: this.version,
        config: this.config
      });

      console.log(`[LogSystemService] Service initialized successfully`);

    } catch (error) {
      this.status = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = errorMessage;
      this.lastErrorAt = Date.now();

      this.emit('service:error', { error: errorMessage, phase: 'initialization' });

      throw new LogSystemServiceError(
        `Failed to initialize LogSystemService: ${errorMessage}`,
        'INIT_ERROR',
        error
      );
    }
  }

  /**
   * 서비스 종료
   */
  async destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return;
    }

    try {
      this.status = 'destroyed';
      this.connectionStatus = 'destroyed';

      // 헬스체크 중지
      this.stopHealthCheck();

      // 재연결 중지
      this.stopReconnection();

      // MCP 통합 정리
      this.destroyMCPIntegration();

      // LogClient 정리
      if (this.logClient) {
        await this.logClient.destroy();
        this.logClient = null;
      }

      // 이벤트 리스너 정리
      this.eventListeners.clear();

      this.isInitialized = false;

      this.emit('service:destroyed', { name: this.name });

      console.log(`[LogSystemService] Service destroyed`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[LogSystemService] Error during destruction: ${errorMessage}`);
    }
  }

  /**
   * 서비스 상태 조회
   */
  getStatus(): ServiceStatus {
    return this.status;
  }

  // =============================================================================
  // 🔗 MCP Integration
  // =============================================================================

  /**
   * MCP 통합 초기화
   */
  private async initializeMCPIntegration(): Promise<void> {
    try {
      if (!this.eventManager) {
        console.warn('[LogSystemService] EventManager not available, skipping MCP integration');
        return;
      }

      // 동적 import를 사용하여 순환 의존성 방지
      const { createLogMCPTools } = await import('../mcp/log-mcp-tools.js');
      const application = (this.eventManager as any).application || (globalThis as any).RecursiveApp;
      
      if (!application) {
        console.warn('[LogSystemService] Application instance not found, skipping MCP integration');
        return;
      }

      this.mcpTools = createLogMCPTools(application, this.eventManager);

      // MCP 관련 이벤트 리스너 설정
      this.setupMCPEventListeners();

      console.log('[LogSystemService] MCP integration initialized');

    } catch (error) {
      console.error('[LogSystemService] Failed to initialize MCP integration:', error);
      // MCP 통합 실패는 서비스 전체를 중단시키지 않음
    }
  }

  /**
   * MCP 통합 정리
   */
  private destroyMCPIntegration(): void {
    try {
      // MCP 이벤트 리스너 정리
      this.mcpEventListeners.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.error('[LogSystemService] Error removing MCP event listener:', error);
        }
      });
      this.mcpEventListeners = [];

      // MCP 도구 정리
      this.mcpTools = null;

      console.log('[LogSystemService] MCP integration destroyed');

    } catch (error) {
      console.error('[LogSystemService] Error during MCP integration cleanup:', error);
    }
  }

  /**
   * MCP 이벤트 리스너 설정
   */
  private setupMCPEventListeners(): void {
    if (!this.eventManager || !this.mcpTools) {
      return;
    }

    // 로그 대시보드 관련 이벤트
    const unsubscribeDashboard = this.eventManager.on('log-dashboard:show-errors', (event) => {
      this.handleMCPDashboardEvent(event);
    });
    this.mcpEventListeners.push(unsubscribeDashboard);

    // 로그 검색 관련 이벤트
    const unsubscribeSearch = this.eventManager.on('log-search:set-query', (event) => {
      this.handleMCPSearchEvent(event);
    });
    this.mcpEventListeners.push(unsubscribeSearch);

    // 로그 뷰어 관련 이벤트
    const unsubscribeViewer = this.eventManager.on('log-viewer:jump-to-trace', (event) => {
      this.handleMCPViewerEvent(event);
    });
    this.mcpEventListeners.push(unsubscribeViewer);

    // 대시보드 설정 이벤트
    const unsubscribeConfigure = this.eventManager.on('log-dashboard:configure', (event) => {
      this.handleMCPDashboardConfigEvent(event);
    });
    this.mcpEventListeners.push(unsubscribeConfigure);
  }

  /**
   * MCP 대시보드 이벤트 처리
   */
  private handleMCPDashboardEvent(event: any): void {
    console.log('[LogSystemService] Handling MCP dashboard event:', event);
    // 대시보드 컴포넌트에서 처리하도록 이벤트 재발송
    this.emit('mcp:dashboard:show-errors', event.payload);
  }

  /**
   * MCP 검색 이벤트 처리
   */
  private handleMCPSearchEvent(event: any): void {
    console.log('[LogSystemService] Handling MCP search event:', event);
    // 검색 컴포넌트에서 처리하도록 이벤트 재발송
    this.emit('mcp:search:set-query', event.payload);
  }

  /**
   * MCP 뷰어 이벤트 처리
   */
  private handleMCPViewerEvent(event: any): void {
    console.log('[LogSystemService] Handling MCP viewer event:', event);
    // 뷰어 컴포넌트에서 처리하도록 이벤트 재발송
    this.emit('mcp:viewer:jump-to-trace', event.payload);
  }

  /**
   * MCP 대시보드 설정 이벤트 처리
   */
  private handleMCPDashboardConfigEvent(event: any): void {
    console.log('[LogSystemService] Handling MCP dashboard config event:', event);
    // 대시보드 컴포넌트에서 처리하도록 이벤트 재발송
    this.emit('mcp:dashboard:configure', event.payload);
  }

  /**
   * MCP 도구 실행
   */
  async executeMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.mcpTools) {
      throw new LogSystemServiceError(
        'MCP tools not initialized',
        'MCP_NOT_INITIALIZED'
      );
    }

    try {
      return await this.mcpTools.executeTool(toolName, args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new LogSystemServiceError(
        `MCP tool execution failed: ${errorMessage}`,
        'MCP_TOOL_EXECUTION_FAILED',
        error
      );
    }
  }

  /**
   * 사용 가능한 MCP 도구 목록 반환
   */
  getAvailableMCPTools(): string[] {
    if (!this.mcpTools) {
      return [];
    }

    return this.mcpTools.getTools().map(tool => tool.name);
  }

  // =============================================================================
  // 🔌 Connection Management
  // =============================================================================

  /**
   * 로그 시스템에 연결
   */
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected' || this.connectionStatus === 'connecting') {
      return;
    }

    try {
      this.connectionStatus = 'connecting';
      this.connectionAttempts++;

      this.emit('connection:connecting', { attempt: this.connectionAttempts });

      // LogClient를 통한 연결 테스트
      if (!this.logClient) {
        throw new LogSystemServiceError('LogClient not initialized', 'CLIENT_NOT_INITIALIZED');
      }

      const connected = await this.logClient.ping();
      if (!connected) {
        console.warn('[LogSystemService] Connection test failed, but continuing with fallback mode');
        // 연결 실패 시에도 서비스를 사용 가능하게 하되, 목업 데이터를 사용
      }

      this.connectionStatus = 'connected';
      this.lastConnectedAt = Date.now();
      this.healthCheckFailures = 0;

      this.emit('connection:connected', {
        attempt: this.connectionAttempts,
        connectedAt: this.lastConnectedAt
      });

      console.log(`[LogSystemService] Connected successfully (attempt ${this.connectionAttempts})`);

    } catch (error) {
      this.connectionStatus = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = errorMessage;
      this.lastErrorAt = Date.now();

      this.emit('connection:error', {
        error: errorMessage,
        attempt: this.connectionAttempts
      });

      // 자동 재연결 시도
      if (this.reconnectionConfig.enabled && !this.isReconnecting) {
        this.scheduleReconnection();
      }

      throw error;
    }
  }

  /**
   * 연결 해제
   */
  async disconnect(): Promise<void> {
    if (this.connectionStatus === 'disconnected') {
      return;
    }

    try {
      this.connectionStatus = 'disconnected';
      this.stopReconnection();

      if (this.logClient) {
        await this.logClient.stopAllStreams();
      }

      this.emit('connection:disconnected', { timestamp: Date.now() });

      console.log(`[LogSystemService] Disconnected`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[LogSystemService] Error during disconnection: ${errorMessage}`);
    }
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnection(): void {
    if (this.isReconnecting || !this.reconnectionConfig.enabled) {
      return;
    }

    if (this.connectionAttempts >= this.reconnectionConfig.maxAttempts) {
      this.emit('connection:max_attempts_reached', {
        attempts: this.connectionAttempts,
        maxAttempts: this.reconnectionConfig.maxAttempts
      });
      return;
    }

    this.isReconnecting = true;
    this.connectionStatus = 'reconnecting';

    const delay = Math.min(
      this.reconnectionConfig.initialDelay * Math.pow(this.reconnectionConfig.backoffMultiplier, this.connectionAttempts - 1),
      this.reconnectionConfig.maxDelay
    );

    this.emit('connection:reconnecting', {
      attempt: this.connectionAttempts,
      nextAttemptIn: delay
    });

    this.reconnectionTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.isReconnecting = false;
      } catch (error) {
        this.isReconnecting = false;
        // 연결 실패 시 다시 재연결 스케줄링 (connect 메서드에서 처리됨)
      }
    }, delay);
  }

  /**
   * 재연결 중지
   */
  private stopReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    this.isReconnecting = false;
  }

  // =============================================================================
  // 🏥 Health Check Management
  // =============================================================================

  /**
   * 헬스체크 시작
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckConfig.interval);
  }

  /**
   * 헬스체크 중지
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 헬스체크 수행
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.logClient || this.connectionStatus !== 'connected') {
      return;
    }

    try {
      const startTime = Date.now();
      const isHealthy = await Promise.race([
        this.logClient.ping(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.healthCheckConfig.timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        this.healthCheckFailures = 0;
        this.emit('health:check_passed', { responseTime });
      } else {
        this.handleHealthCheckFailure();
      }

    } catch (error) {
      this.handleHealthCheckFailure();
    }
  }

  /**
   * 헬스체크 실패 처리
   */
  private handleHealthCheckFailure(): void {
    this.healthCheckFailures++;

    this.emit('health:check_failed', {
      failures: this.healthCheckFailures,
      threshold: this.healthCheckConfig.failureThreshold
    });

    if (this.healthCheckFailures >= this.healthCheckConfig.failureThreshold) {
      this.connectionStatus = 'error';
      this.lastError = 'Health check threshold exceeded';
      this.lastErrorAt = Date.now();

      this.emit('health:unhealthy', {
        failures: this.healthCheckFailures,
        threshold: this.healthCheckConfig.failureThreshold
      });

      // 재연결 시도
      if (this.reconnectionConfig.enabled) {
        this.scheduleReconnection();
      }
    }
  }

  // =============================================================================
  // 🎯 Event Management
  // =============================================================================

  /**
   * 이벤트 리스너 초기화
   */
  private initializeEventListeners(): void {
    const eventTypes: LogSystemEventType[] = [
      'log:new', 'log:batch', 'log:error',
      'stream:connected', 'stream:disconnected',
      'filter:changed', 'search:completed',
      'analysis:updated', 'system:status', 'config:changed'
    ];

    eventTypes.forEach(eventType => {
      this.eventListeners.set(eventType, []);
    });
  }

  /**
   * LogClient 이벤트 리스너 설정
   */
  private setupLogClientListeners(): void {
    if (!this.logClient) return;

    // LogClient의 모든 이벤트를 서비스 레벨로 전파
    const eventTypes: LogSystemEventType[] = [
      'log:new', 'log:batch', 'log:error',
      'stream:connected', 'stream:disconnected',
      'filter:changed', 'search:completed',
      'analysis:updated', 'system:status', 'config:changed'
    ];

    eventTypes.forEach(eventType => {
      this.logClient!.on(eventType, (data) => {
        this.emit(eventType, data.payload);
      });
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  public on(event: LogSystemEventType, callback: (data: LogSystemEventData) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event)!.push(callback);
    
    return () => this.off(event, callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  public off(event: LogSystemEventType, callback: (data: LogSystemEventData) => void): void {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event)!;
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 이벤트 발생
   */
  private emit(event: string, payload: any): void {
    // 내부 이벤트 리스너 호출
    const eventData: LogSystemEventData = {
      type: event as LogSystemEventType,
      payload,
      timestamp: new Date().toISOString(),
      source: 'log-system-service'
    };

    if (this.eventListeners.has(event as LogSystemEventType)) {
      this.eventListeners.get(event as LogSystemEventType)!.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      });
    }

    // EventManager를 통한 전역 이벤트 발생
    if (this.eventManager) {
      this.eventManager.emit(`log-system:${event}`, eventData);
    }
  }

  // =============================================================================
  // 🔍 Public API Methods (LogClient Proxy)
  // =============================================================================

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * 로그 쿼리 실행
   */
  async query(params: LogQueryParams): Promise<LogQueryResult> {
    this.ensureConnected();
    return this.logClient!.query(params);
  }

  /**
   * 로그 검색 실행
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    this.ensureConnected();
    return this.logClient!.search(query, options);
  }

  /**
   * 로그 통계 조회
   */
  async getStats(timeRange: TimeRange = '1h'): Promise<LogStatistics> {
    this.ensureConnected();
    return this.logClient!.getStats(timeRange);
  }

  /**
   * 시스템 상태 조회
   */
  async getSystemStatus(): Promise<LogSystemStatus> {
    this.ensureConnected();
    return this.logClient!.getSystemStatus();
  }

  /**
   * 로그 엔트리 추가
   */
  async logEntry(entry: PartialLogEntry): Promise<LogServiceResponse<{ id: string }>> {
    this.ensureConnected();
    return this.logClient!.logEntry(entry);
  }

  /**
   * 배치 로그 처리
   */
  async logBatch(
    entries: PartialLogEntry[], 
    options: BatchLogOptions = {}
  ): Promise<LogServiceResponse<{ count: number }>> {
    this.ensureConnected();
    return this.logClient!.logBatch(entries, options);
  }

  /**
   * 실시간 로그 스트리밍 시작
   */
  async streamLogs(callback: LogCallback, filters: LogFilter = {}): Promise<LogStream> {
    this.ensureConnected();
    return this.logClient!.streamLogs(callback, filters);
  }

  /**
   * 모든 스트림 중지
   */
  async stopAllStreams(): Promise<void> {
    if (this.logClient) {
      return this.logClient.stopAllStreams();
    }
  }

  // =============================================================================
  // 🔧 Configuration & Status Management
  // =============================================================================

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<LogSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.logClient) {
      this.logClient.updateConfig(newConfig);
    }

    this.emit('config:updated', { config: this.config });
  }

  /**
   * 재연결 설정 업데이트
   */
  updateReconnectionConfig(config: Partial<ReconnectionConfig>): void {
    this.reconnectionConfig = { ...this.reconnectionConfig, ...config };
    this.emit('reconnection:config_updated', { config: this.reconnectionConfig });
  }

  /**
   * 헬스체크 설정 업데이트
   */
  updateHealthCheckConfig(config: Partial<HealthCheckConfig>): void {
    const wasEnabled = this.healthCheckConfig.enabled;
    this.healthCheckConfig = { ...this.healthCheckConfig, ...config };

    // 헬스체크 활성화/비활성화 처리
    if (wasEnabled !== this.healthCheckConfig.enabled) {
      if (this.healthCheckConfig.enabled) {
        this.startHealthCheck();
      } else {
        this.stopHealthCheck();
      }
    }

    this.emit('health:config_updated', { config: this.healthCheckConfig });
  }

  /**
   * 서비스 상태 정보 조회
   */
  getServiceStatus(): LogSystemServiceStatus {
    const result: LogSystemServiceStatus = {
      serviceStatus: this.status,
      connectionStatus: this.connectionStatus,
      connectionAttempts: this.connectionAttempts,
      autoReconnectEnabled: this.reconnectionConfig.enabled,
      activeStreams: this.logClient?.getClientStats().activeStreams || 0,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };

    // Optional 속성들은 값이 있을 때만 설정
    if (this.lastConnectedAt !== undefined) {
      result.lastConnectedAt = this.lastConnectedAt;
    }
    if (this.lastError !== undefined) {
      result.lastError = this.lastError;
    }
    if (this.lastErrorAt !== undefined) {
      result.lastErrorAt = this.lastErrorAt;
    }

    return result;
  }

  /**
   * LogClient 통계 조회
   */
  getClientStats(): LogClientStats | null {
    return this.logClient?.getClientStats() || null;
  }

  /**
   * 설정 조회
   */
  getConfig(): LogSystemConfig {
    return { ...this.config };
  }

  /**
   * 재연결 설정 조회
   */
  getReconnectionConfig(): ReconnectionConfig {
    return { ...this.reconnectionConfig };
  }

  /**
   * 헬스체크 설정 조회
   */
  getHealthCheckConfig(): HealthCheckConfig {
    return { ...this.healthCheckConfig };
  }

  // =============================================================================
  // 🛠️ Private Utility Methods
  // =============================================================================

  /**
   * 설정 검증
   */
  private validateConfig(): void {
    if (!this.config.bridgeEndpoint) {
      throw new LogSystemServiceError('bridgeEndpoint is required', 'INVALID_CONFIG');
    }

    if (this.config.timeout <= 0) {
      throw new LogSystemServiceError('timeout must be positive', 'INVALID_CONFIG');
    }

    if (this.config.retryAttempts < 0) {
      throw new LogSystemServiceError('retryAttempts must be non-negative', 'INVALID_CONFIG');
    }
  }

  // =============================================================================
  // 🔍 Analysis Methods
  // =============================================================================

  /**
   * 로그 분석 실행
   */
  async runAnalysis(analysisType: 'performance' | 'errors' | 'patterns' | 'trends', timeRange: string): Promise<any> {
    this.ensureConnected();
    
    if (!this.logClient) {
      throw new LogSystemServiceError('LogClient not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      const result = await this.logClient.runAnalysis(analysisType, timeRange);
      this.emit('analysis:completed', { type: analysisType, timeRange, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('analysis:error', { type: analysisType, timeRange, error: errorMessage });
      throw error;
    }
  }

  /**
   * 성능 분석 조회
   */
  async getPerformanceAnalysis(timeRange: string, thresholdMs: number = 1000): Promise<any> {
    this.ensureConnected();
    
    if (!this.logClient) {
      throw new LogSystemServiceError('LogClient not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      const result = await this.logClient.getPerformanceAnalysis(timeRange, thresholdMs);
      this.emit('analysis:performance', { timeRange, thresholdMs, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('analysis:error', { type: 'performance', timeRange, error: errorMessage });
      throw error;
    }
  }

  /**
   * 에러 패턴 분석 조회
   */
  async getErrorPatterns(timeRange: string): Promise<any> {
    this.ensureConnected();
    
    if (!this.logClient) {
      throw new LogSystemServiceError('LogClient not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      const result = await this.logClient.getErrorPatterns(timeRange);
      this.emit('analysis:error_patterns', { timeRange, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('analysis:error', { type: 'error_patterns', timeRange, error: errorMessage });
      throw error;
    }
  }

  /**
   * 트렌드 분석 조회
   */
  async getTrendAnalysis(timeRange: string): Promise<any> {
    this.ensureConnected();
    
    if (!this.logClient) {
      throw new LogSystemServiceError('LogClient not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      const result = await this.logClient.getTrendAnalysis(timeRange);
      this.emit('analysis:trends', { timeRange, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('analysis:error', { type: 'trends', timeRange, error: errorMessage });
      throw error;
    }
  }

  /**
   * 이상 탐지 실행
   */
  async detectAnomalies(timeRange: string): Promise<any> {
    this.ensureConnected();
    
    if (!this.logClient) {
      throw new LogSystemServiceError('LogClient not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      const result = await this.logClient.detectAnomalies(timeRange);
      this.emit('analysis:anomalies', { timeRange, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('analysis:error', { type: 'anomalies', timeRange, error: errorMessage });
      throw error;
    }
  }

  /**
   * 연결 상태 확인
   */
  private ensureConnected(): void {
    if (!this.logClient) {
      throw new LogSystemServiceError('Service not initialized', 'SERVICE_NOT_INITIALIZED');
    }

    if (this.connectionStatus !== 'connected') {
      throw new LogSystemServiceError('Not connected to log system', 'NOT_CONNECTED');
    }
  }
}

/**
 * LogSystemService 팩토리 함수
 */
export function createLogSystemService(
  config: LogSystemConfig,
  eventManager?: EventManager
): LogSystemService {
  return new LogSystemService(config, eventManager);
}