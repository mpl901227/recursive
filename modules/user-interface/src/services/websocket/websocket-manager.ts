/**
 * WebSocket Manager for Recursive Dashboard
 * 
 * WebSocket 서비스의 고수준 관리를 담당하는 매니저 클래스입니다.
 * - 연결 풀 관리
 * - 재연결 전략 구현
 * - 하트비트 메커니즘
 * - 이벤트 시스템 통합
 * - 통계 및 모니터링
 */

import type { EventManager } from '../../core/events.js';
import { WebSocketClient, type WebSocketConfig, type WebSocketMessage, type ConnectionStatus } from './websocket-client.js';

/**
 * 재연결 전략 인터페이스
 */
export interface ReconnectStrategy {
  /**
   * 다음 재연결 지연 시간을 계산합니다
   * @param attempt - 현재 시도 횟수 (0부터 시작)
   * @returns 밀리초 단위의 지연 시간
   */
  getNextDelay(attempt: number): number;
  
  /**
   * 재연결을 중단해야 하는지 판단합니다
   * @param attempt - 현재 시도 횟수
   * @returns 중단 여부
   */
  shouldStop(attempt: number): boolean;
  
  /**
   * 전략을 초기화합니다
   */
  reset(): void;
}

/**
 * 지수 백오프 재연결 전략
 */
export class ExponentialBackoffReconnect implements ReconnectStrategy {
  constructor(
    private readonly baseDelay: number = 1000,        // 기본 지연 시간 (1초)
    private readonly maxDelay: number = 30000,        // 최대 지연 시간 (30초)
    private readonly maxAttempts: number = 10,        // 최대 시도 횟수
    private readonly backoffFactor: number = 1.5      // 백오프 배수
  ) {}

  getNextDelay(attempt: number): number {
    const delay = this.baseDelay * Math.pow(this.backoffFactor, attempt);
    return Math.min(delay, this.maxDelay);
  }

  shouldStop(attempt: number): boolean {
    return attempt >= this.maxAttempts;
  }

  reset(): void {
    // 상태가 없으므로 아무것도 하지 않음
  }
}

/**
 * 선형 백오프 재연결 전략
 */
export class LinearBackoffReconnect implements ReconnectStrategy {
  constructor(
    private readonly baseDelay: number = 2000,        // 기본 지연 시간 (2초)
    private readonly increment: number = 1000,        // 증가분 (1초)
    private readonly maxDelay: number = 30000,        // 최대 지연 시간 (30초)
    private readonly maxAttempts: number = 15         // 최대 시도 횟수
  ) {}

  getNextDelay(attempt: number): number {
    const delay = this.baseDelay + (this.increment * attempt);
    return Math.min(delay, this.maxDelay);
  }

  shouldStop(attempt: number): boolean {
    return attempt >= this.maxAttempts;
  }

  reset(): void {
    // 상태가 없으므로 아무것도 하지 않음
  }
}

/**
 * WebSocket 연결 풀 관리
 */
export interface ConnectionPool {
  primary: WebSocketClient | null;
  fallback: WebSocketClient[] | null;
  activeConnection: WebSocketClient | null;
}

/**
 * WebSocket 매니저 설정
 */
export interface WebSocketManagerConfig extends WebSocketConfig {
  enableConnectionPool?: boolean;
  fallbackUrls?: string[];
  healthCheckInterval?: number;
  statisticsInterval?: number;
  enableAutoReconnect?: boolean;
  reconnectStrategy?: ReconnectStrategy;
}

/**
 * WebSocket 통계 정보
 */
export interface WebSocketStatistics {
  totalConnections: number;
  totalDisconnections: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  uptime: number;
  averageLatency: number;
  errors: number;
}

/**
 * WebSocket 헬스체크 결과
 */
export interface HealthCheck {
  isHealthy: boolean;
  latency: number;
  lastCheck: number;
  errors: string[];
}

/**
 * WebSocket 서비스 매니저
 * 
 * 고수준의 WebSocket 연결 관리와 모니터링을 담당합니다.
 * 
 * @example
 * ```typescript
 * const manager = new WebSocketManager({
 *   url: 'ws://localhost:3000',
 *   enableConnectionPool: true,
 *   fallbackUrls: ['ws://backup.localhost:3001']
 * }, eventManager);
 * 
 * await manager.initialize();
 * await manager.connect();
 * 
 * manager.send({ type: 'message', data: 'Hello' });
 * ```
 */
export class WebSocketManager {
  private client: WebSocketClient | null = null;
  private connectionPool: ConnectionPool;
  private reconnectStrategy: ReconnectStrategy;
  private isInitialized: boolean = false;
  private isConnecting: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private statisticsInterval: NodeJS.Timeout | null = null;
  private statistics: WebSocketStatistics;
  private connectionStartTime: number | null = null;
  private readonly config: WebSocketManagerConfig & {
    enableConnectionPool: boolean;
    fallbackUrls: string[];
    healthCheckInterval: number;
    statisticsInterval: number;
    enableAutoReconnect: boolean;
    reconnectStrategy: ReconnectStrategy;
    maxReconnectAttempts: number;
    reconnectDelay: number;
    heartbeatInterval: number;
    heartbeatTimeout: number;
  };

  constructor(
    config: WebSocketManagerConfig,
    private readonly eventManager: EventManager
  ) {
    // 기본값으로 설정 완성
    this.config = {
      ...config,
      enableConnectionPool: config.enableConnectionPool ?? false,
      fallbackUrls: config.fallbackUrls ?? [],
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30초
      statisticsInterval: config.statisticsInterval ?? 60000,   // 1분
      enableAutoReconnect: config.enableAutoReconnect ?? true,
      reconnectStrategy: config.reconnectStrategy ?? new ExponentialBackoffReconnect(),
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
      heartbeatInterval: config.heartbeatInterval ?? 15000,
      heartbeatTimeout: config.heartbeatTimeout ?? 30000
    };

    this.reconnectStrategy = this.config.reconnectStrategy;
    this.connectionPool = {
      primary: null,
      fallback: null,
      activeConnection: null
    };

    this.statistics = this.initializeStatistics();
  }

  /**
   * 매니저를 초기화합니다
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('WebSocketManager is already initialized');
      return;
    }

    console.log('🔌 Initializing WebSocketManager...');

    try {
      // 메인 클라이언트 생성
      this.client = new WebSocketClient(this.config);
      this.connectionPool.primary = this.client;
      this.connectionPool.activeConnection = this.client;

      // ✅ 이벤트 설정을 클라이언트 생성 후에 호출
      this.setupEventIntegration();

      // 폴백 연결 풀 설정 (옵션)
      if (this.config.enableConnectionPool && this.config.fallbackUrls.length > 0) {
        await this.initializeConnectionPool();
      }

      // 정기적인 헬스체크 시작
      this.startHealthCheck();

      // 통계 수집 시작
      this.startStatisticsCollection();

      this.isInitialized = true;
      this.eventManager.emit('websocket-manager:initialized');

      console.log('✅ WebSocketManager initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize WebSocketManager:', error);
      this.eventManager.emit('websocket-manager:error', { 
        type: 'initialization_failed', 
        error 
      });
      throw error;
    }
  }

  /**
   * WebSocket 연결을 시작합니다
   */
  async connect(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('WebSocketManager must be initialized before connecting');
    }

    if (this.isConnecting) {
      console.warn('Connection already in progress');
      return;
    }

    if (this.isConnected) {
      console.warn('Already connected');
      return;
    }

    this.isConnecting = true;
    this.connectionStartTime = Date.now();

    try {
      console.log('🔌 Connecting to WebSocket...');
      
      await this.connectWithFallback();
      
      this.isConnecting = false;
      this.statistics.totalConnections++;
      this.statistics.lastConnectedAt = Date.now();
      
      console.log('✅ WebSocket connected successfully');
      this.eventManager.emit('websocket-manager:connected');

    } catch (error) {
      this.isConnecting = false;
      this.statistics.errors++;
      
      console.error('❌ Failed to connect WebSocket:', error);
      this.eventManager.emit('websocket-manager:connection-failed', { error });
      
      // 자동 재연결 시도
      if (this.config.enableAutoReconnect) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * WebSocket 연결을 해제합니다
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting WebSocket...');
    
    if (this.client) {
      this.client.disconnect();
      this.statistics.totalDisconnections++;
      this.statistics.lastDisconnectedAt = Date.now();
    }

    this.stopHealthCheck();
    this.eventManager.emit('websocket-manager:disconnected');
    
    console.log('✅ WebSocket disconnected');
  }

  /**
   * 메시지를 전송합니다
   */
  send(message: WebSocketMessage | string | object): boolean {
    if (!this.isConnected || !this.connectionPool.activeConnection) {
      console.warn('Cannot send message: not connected');
      this.eventManager.emit('websocket-manager:send-failed', { 
        reason: 'not_connected',
        message 
      });
      return false;
    }

    try {
      const success = this.connectionPool.activeConnection.send(message);
      
      if (success) {
        this.statistics.totalMessagesSent++;
        this.eventManager.emit('websocket-manager:message-sent', { message });
      } else {
        this.eventManager.emit('websocket-manager:send-failed', { 
          reason: 'send_error',
          message 
        });
      }
      
      return success;
    } catch (error) {
      console.error('Failed to send message:', error);
      this.statistics.errors++;
      this.eventManager.emit('websocket-manager:send-failed', { 
        reason: 'exception',
        message,
        error 
      });
      return false;
    }
  }

  /**
   * 연결 상태를 확인합니다
   */
  get isConnected(): boolean {
    return this.connectionPool.activeConnection?.getConnectionStatus().isConnected ?? false;
  }

  /**
   * 연결 상태 정보를 가져옵니다
   */
  getConnectionStatus(): ConnectionStatus | null {
    return this.connectionPool.activeConnection?.getConnectionStatus() ?? null;
  }

  /**
   * 통계 정보를 가져옵니다
   */
  getStatistics(): WebSocketStatistics {
    // 현재 업타임 계산
    if (this.connectionStartTime && this.isConnected) {
      this.statistics.uptime = Date.now() - this.connectionStartTime;
    }
    
    return { ...this.statistics };
  }

  /**
   * 헬스체크를 수행합니다
   */
  async performHealthCheck(): Promise<HealthCheck> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      if (!this.isConnected) {
        errors.push('Not connected');
        return {
          isHealthy: false,
          latency: -1,
          lastCheck: startTime,
          errors
        };
      }

      // 간단한 ping 테스트
      const pingPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Health check timeout'));
        }, 5000);

        const onPong = () => {
          clearTimeout(timeout);
          this.client?.off('pong', onPong);
          resolve();
        };

        this.client?.once('pong', onPong);
        this.send({ type: 'ping', timestamp: Date.now() });
      });

      await pingPromise;
      
      const latency = Date.now() - startTime;
      this.statistics.averageLatency = (this.statistics.averageLatency + latency) / 2;

      return {
        isHealthy: true,
        latency,
        lastCheck: startTime,
        errors
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.statistics.errors++;
      
      return {
        isHealthy: false,
        latency: Date.now() - startTime,
        lastCheck: startTime,
        errors
      };
    }
  }

  /**
   * 매니저를 종료하고 모든 리소스를 정리합니다
   */
  destroy(): void {
    console.log('🗑️ Destroying WebSocketManager...');
    
    this.stopHealthCheck();
    this.stopStatisticsCollection();
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }

    // 폴백 연결들도 정리
    if (this.connectionPool.fallback) {
      this.connectionPool.fallback.forEach(client => client.destroy());
      this.connectionPool.fallback = null;
    }

    this.connectionPool.primary = null;
    this.connectionPool.activeConnection = null;
    this.isInitialized = false;
    
    this.eventManager.emit('websocket-manager:destroyed');
    console.log('✅ WebSocketManager destroyed');
  }

  // === 내부 구현 메서드들 ===

  /**
   * 통계 초기화
   */
  private initializeStatistics(): WebSocketStatistics {
    return {
      totalConnections: 0,
      totalDisconnections: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      uptime: 0,
      averageLatency: 0,
      errors: 0
    };
  }

  /**
   * 이벤트 시스템 통합 설정
   */
  private setupEventIntegration(): void {
    // WebSocketClient의 이벤트를 매니저 이벤트로 전파
    const setupClientEvents = (client: WebSocketClient) => {
      client.on('connect', () => {
        this.eventManager.emit('websocket:connected');
      });

      client.on('disconnect', (event) => {
        this.eventManager.emit('websocket:disconnected', event);
      });

      client.on('message', (message) => {
        this.statistics.totalMessagesReceived++;
        this.eventManager.emit('websocket:message', message);
      });

      client.on('error', (error) => {
        this.statistics.errors++;
        this.eventManager.emit('websocket:error', error);
      });

      client.on('reconnecting', (event) => {
        this.statistics.reconnectAttempts++;
        this.eventManager.emit('websocket:reconnecting', event);
      });

      client.on('ping', () => {
        this.eventManager.emit('websocket:ping');
      });

      client.on('pong', (data) => {
        this.eventManager.emit('websocket:pong', data);
      });

      client.on('connection-unstable', () => {
        this.eventManager.emit('websocket:connection-unstable');
      });
    };

    // ✅ 메인 클라이언트에 이벤트 설정 (클라이언트가 존재할 때만)
    if (this.client) {
      setupClientEvents(this.client);
    }

    // ✅ 폴백 클라이언트들에도 이벤트 설정
    if (this.connectionPool.fallback) {
      this.connectionPool.fallback.forEach(client => {
        setupClientEvents(client);
      });
    }
  }

  /**
   * 연결 풀 초기화
   */
  private async initializeConnectionPool(): Promise<void> {
    if (!this.config.fallbackUrls.length) return;

    console.log('🔗 Initializing connection pool...');
    
    this.connectionPool.fallback = [];
    
    for (const url of this.config.fallbackUrls) {
      try {
        const fallbackClient = new WebSocketClient({
          ...this.config,
          url
        });
        
        // ✅ 폴백 클라이언트에도 이벤트 설정
        this.setupFallbackClientEvents(fallbackClient);
        
        this.connectionPool.fallback.push(fallbackClient);
        console.log(`✅ Fallback connection prepared: ${url}`);
      } catch (error) {
        console.warn(`⚠️ Failed to prepare fallback connection: ${url}`, error);
      }
    }
  }

  /**
   * 폴백 클라이언트 이벤트 설정
   */
  private setupFallbackClientEvents(client: WebSocketClient): void {
    client.on('connect', () => {
      this.eventManager.emit('websocket:connected');
    });

    client.on('disconnect', (event) => {
      this.eventManager.emit('websocket:disconnected', event);
    });

    client.on('message', (message) => {
      this.statistics.totalMessagesReceived++;
      this.eventManager.emit('websocket:message', message);
    });

    client.on('error', (error) => {
      this.statistics.errors++;
      this.eventManager.emit('websocket:error', error);
    });

    client.on('reconnecting', (event) => {
      this.statistics.reconnectAttempts++;
      this.eventManager.emit('websocket:reconnecting', event);
    });

    client.on('ping', () => {
      this.eventManager.emit('websocket:ping');
    });

    client.on('pong', (data) => {
      this.eventManager.emit('websocket:pong', data);
    });

    client.on('connection-unstable', () => {
      this.eventManager.emit('websocket:connection-unstable');
    });
  }

  /**
   * 폴백을 포함한 연결 시도
   */
  private async connectWithFallback(): Promise<void> {
    let lastError: Error | null = null;
    
    // 메인 연결 시도
    if (this.connectionPool.primary) {
      try {
        await this.connectionPool.primary.connect();
        this.connectionPool.activeConnection = this.connectionPool.primary;
        return;
      } catch (error) {
        console.warn('Primary connection failed, trying fallbacks...', error);
        lastError = error as Error;
      }
    }

    // 폴백 연결 시도
    if (this.connectionPool.fallback) {
      for (const fallbackClient of this.connectionPool.fallback) {
        try {
          await fallbackClient.connect();
          this.connectionPool.activeConnection = fallbackClient;
          console.log('✅ Connected using fallback connection');
          return;
        } catch (error) {
          console.warn('Fallback connection failed, trying next...', error);
          lastError = error as Error;
        }
      }
    }

    // 모든 연결 실패
    throw lastError || new Error('All connection attempts failed');
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnect(): void {
    const attempt = this.statistics.reconnectAttempts;
    
    if (this.reconnectStrategy.shouldStop(attempt)) {
      console.error('❌ Max reconnection attempts reached');
      this.eventManager.emit('websocket-manager:max-retries-reached');
      return;
    }

    const delay = this.reconnectStrategy.getNextDelay(attempt);
    
    console.log(`🔄 Scheduling reconnect attempt ${attempt + 1} in ${delay}ms`);
    this.eventManager.emit('websocket-manager:reconnect-scheduled', { 
      attempt: attempt + 1, 
      delay 
    });

    setTimeout(async () => {
      try {
        await this.connect();
        this.reconnectStrategy.reset();
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        // 다음 재연결은 connect() 메서드에서 자동으로 스케줄됨
      }
    }, delay);
  }

  /**
   * 헬스체크 시작
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        this.eventManager.emit('websocket-manager:health-check', health);
        
        if (!health.isHealthy) {
          console.warn('⚠️ WebSocket health check failed:', health.errors);
        }
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 헬스체크 중지
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 통계 수집 시작
   */
  private startStatisticsCollection(): void {
    if (this.statisticsInterval) return;

    this.statisticsInterval = setInterval(() => {
      const stats = this.getStatistics();
      this.eventManager.emit('websocket-manager:statistics', stats);
    }, this.config.statisticsInterval);
  }

  /**
   * 통계 수집 중지
   */
  private stopStatisticsCollection(): void {
    if (this.statisticsInterval) {
      clearInterval(this.statisticsInterval);
      this.statisticsInterval = null;
    }
  }
}

/**
 * WebSocketManager 팩토리 함수
 */
export function createWebSocketManager(
  config: WebSocketManagerConfig,
  eventManager: EventManager
): WebSocketManager {
  return new WebSocketManager(config, eventManager);
}