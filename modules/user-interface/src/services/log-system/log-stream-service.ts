/**
 * @fileoverview LogStreamService - 실시간 로그 스트리밍 서비스
 * @description WebSocket 기반 실시간 로그 스트리밍 관리
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 3.2 구현
 */

import type { 
  LogEntry, 
  LogFilter, 
  LogCallback, 
  LogStream,
  LogSystemConfig,
  LogSystemEventType,
  LogSystemEventData
} from '../../types/log-system';
import { Logger } from '../../utils/logger';

/**
 * WebSocket 메시지 타입
 */
interface WebSocketMessage {
  type: 'start_stream' | 'stop_stream' | 'update_filters' | 'log_entry' | 'ping' | 'pong' | 'error' | 'stream_started' | 'stream_stopped';
  data?: any;
  stream_id?: string;
  timestamp?: string;
}

/**
 * 스트림 상태
 */
type StreamStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * 연결 복구 설정
 */
interface ReconnectionConfig {
  enabled: boolean;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

/**
 * 스트림 통계
 */
interface StreamStats {
  totalStreams: number;
  activeStreams: number;
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  reconnectionAttempts: number;
  lastReconnectionAt?: string;
  uptime: number;
  startTime: number;
}

/**
 * 버퍼 관리자
 */
class LogBufferManager {
  private buffer: LogEntry[] = [];
  private maxSize: number;
  private batchSize: number;
  private flushInterval: number;
  private flushTimer: number | undefined;
  private onFlush: (entries: LogEntry[]) => void;

  constructor(
    maxSize: number = 1000,
    batchSize: number = 50,
    flushInterval: number = 1000,
    onFlush: (entries: LogEntry[]) => void
  ) {
    this.maxSize = maxSize;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.onFlush = onFlush;
    this.startFlushTimer();
  }

  addEntry(entry: LogEntry): void {
    this.buffer.push(entry);

    // 버퍼 크기 관리
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }

    // 배치 크기 도달 시 즉시 플러시
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];
    this.onFlush(entries);
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = window.setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush(); // 마지막 플러시
  }
}

/**
 * 로그 스트림 구현
 */
class LogStreamImpl implements LogStream {
  public readonly id: string;
  public status: StreamStatus = 'connecting';
  public readonly filters: LogFilter;
  public readonly started_at: string;
  public received_count: number = 0;

  private callback: LogCallback;
  private streamService: LogStreamService;
  private bufferManager?: LogBufferManager;

  constructor(
    id: string,
    filters: LogFilter,
    callback: LogCallback,
    streamService: LogStreamService,
    useBuffer: boolean = false
  ) {
    this.id = id;
    this.filters = filters;
    this.callback = callback;
    this.streamService = streamService;
    this.started_at = new Date().toISOString();

    if (useBuffer) {
      this.bufferManager = new LogBufferManager(
        1000, 50, 1000,
        (entries) => {
          entries.forEach(entry => this.callback(entry));
        }
      );
    }
  }

  async stop(): Promise<void> {
    await this.streamService.stopStream(this.id);
    if (this.bufferManager) {
      this.bufferManager.destroy();
    }
  }

  async updateFilters(filters: LogFilter): Promise<void> {
    await this.streamService.updateStreamFilters(this.id, filters);
  }

  handleMessage(entry: LogEntry): void {
    this.received_count++;
    
    if (this.bufferManager) {
      this.bufferManager.addEntry(entry);
    } else {
      this.callback(entry);
    }
  }

  setStatus(status: StreamStatus): void {
    this.status = status;
  }
}

/**
 * 실시간 로그 스트리밍 서비스
 */
export class LogStreamService {
  private config: LogSystemConfig;
  private logger: Logger;
  private websocket: WebSocket | null = null;
  private activeStreams: Map<string, LogStreamImpl> = new Map();
  private reconnectionConfig: ReconnectionConfig;
  private reconnectionAttempts: number = 0;
  private reconnectionTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private stats: StreamStats;
  private eventListeners: Map<LogSystemEventType, Array<(data: LogSystemEventData) => void>> = new Map();

  constructor(config: LogSystemConfig) {
    this.config = config;
    this.logger = new Logger({ name: 'LogStreamService' });
    
    this.reconnectionConfig = {
      enabled: true,
      maxAttempts: config.websocket?.maxReconnectAttempts || 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2
    };

    this.stats = {
      totalStreams: 0,
      activeStreams: 0,
      totalMessages: 0,
      messagesPerSecond: 0,
      averageLatency: 0,
      reconnectionAttempts: 0,
      uptime: 0,
      startTime: Date.now()
    };

    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // 이벤트 리스너 초기화
  }

  /**
   * 실시간 로그 스트리밍 시작
   */
  async startStream(
    callback: LogCallback, 
    filters: LogFilter = {},
    options: { useBuffer?: boolean } = {}
  ): Promise<LogStream> {
    if (!this.config.realTimeEnabled) {
      throw new Error('Real-time streaming is disabled');
    }

    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stream = new LogStreamImpl(
      streamId, 
      filters, 
      callback, 
      this,
      options.useBuffer
    );

    try {
      // WebSocket 연결 확인/생성
      await this.ensureWebSocketConnection();

      // 스트림 시작 메시지 전송
      const message: WebSocketMessage = {
        type: 'start_stream',
        stream_id: streamId,
        data: { filters },
        timestamp: new Date().toISOString()
      };

      this.sendMessage(message);

      // 스트림 등록
      this.activeStreams.set(streamId, stream);
      this.stats.totalStreams++;
      this.stats.activeStreams = this.activeStreams.size;

      stream.setStatus('connected');
      this.emit('stream:started', { streamId, filters });

      this.logger.info(`스트림 시작됨: ${streamId}`, { filters });
      return stream;

    } catch (error) {
      stream.setStatus('error');
      this.logger.error(`스트림 시작 실패: ${streamId}`, error);
      throw error;
    }
  }

  /**
   * 스트림 중지
   */
  async stopStream(streamId: string): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      this.logger.warn(`스트림을 찾을 수 없음: ${streamId}`);
      return;
    }

    try {
      // 스트림 중지 메시지 전송
      const message: WebSocketMessage = {
        type: 'stop_stream',
        stream_id: streamId,
        timestamp: new Date().toISOString()
      };

      this.sendMessage(message);

      // 스트림 제거
      this.activeStreams.delete(streamId);
      this.stats.activeStreams = this.activeStreams.size;

      stream.setStatus('disconnected');
      this.emit('stream:stopped', { streamId });

      this.logger.info(`스트림 중지됨: ${streamId}`);

    } catch (error) {
      this.logger.error(`스트림 중지 실패: ${streamId}`, error);
      throw error;
    }
  }

  /**
   * 스트림 필터 업데이트
   */
  async updateStreamFilters(streamId: string, filters: LogFilter): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    try {
      const message: WebSocketMessage = {
        type: 'update_filters',
        stream_id: streamId,
        data: { filters },
        timestamp: new Date().toISOString()
      };

      this.sendMessage(message);
      this.emit('stream:filters_updated', { streamId, filters });

      this.logger.info(`스트림 필터 업데이트: ${streamId}`, { filters });

    } catch (error) {
      this.logger.error(`스트림 필터 업데이트 실패: ${streamId}`, error);
      throw error;
    }
  }

  /**
   * WebSocket 연결 확인/생성
   */
  private async ensureWebSocketConnection(): Promise<void> {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.websocket?.url || 
          this.config.bridgeEndpoint.replace('http', 'ws').replace('https', 'wss') + '/ws';

        this.logger.info(`WebSocket 연결 시도: ${wsUrl}`);
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          this.logger.info('WebSocket 연결 성공');
          this.reconnectionAttempts = 0;
          this.startHeartbeat();
          this.emit('websocket:connected', {});
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.websocket.onerror = (error) => {
          this.logger.error('WebSocket 에러:', error);
          this.emit('websocket:error', { error });
          reject(error);
        };

        this.websocket.onclose = (event) => {
          this.logger.warn('WebSocket 연결 종료', { code: event.code, reason: event.reason });
          this.stopHeartbeat();
          this.emit('websocket:disconnected', { code: event.code, reason: event.reason });
          
          // 자동 재연결
          if (this.reconnectionConfig.enabled) {
            this.scheduleReconnection();
          }
        };

      } catch (error) {
        this.logger.error('WebSocket 연결 생성 실패:', error);
        reject(error);
      }
    });
  }

  /**
   * WebSocket 메시지 처리
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.stats.totalMessages++;

      switch (message.type) {
        case 'log_entry':
          this.handleLogEntry(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        case 'stream_started':
          this.handleStreamStarted(message);
          break;
        case 'stream_stopped':
          this.handleStreamStopped(message);
          break;
        default:
          this.logger.warn('알 수 없는 메시지 타입:', message.type);
      }

    } catch (error) {
      this.logger.error('WebSocket 메시지 파싱 실패:', error);
    }
  }

  /**
   * 로그 엔트리 처리
   */
  private handleLogEntry(message: WebSocketMessage): void {
    if (!message.data || !message.stream_id) {
      this.logger.warn('잘못된 로그 엔트리 메시지:', message);
      return;
    }

    const stream = this.activeStreams.get(message.stream_id);
    if (!stream) {
      this.logger.warn(`스트림을 찾을 수 없음: ${message.stream_id}`);
      return;
    }

    try {
      const logEntry: LogEntry = message.data;
      stream.handleMessage(logEntry);
      this.emit('log:received', { streamId: message.stream_id, entry: logEntry });

    } catch (error) {
      this.logger.error('로그 엔트리 처리 실패:', error);
    }
  }

  /**
   * Pong 메시지 처리 (하트비트)
   */
  private handlePong(message: WebSocketMessage): void {
    // 하트비트 응답 처리
    this.logger.debug('Pong 수신');
  }

  /**
   * 에러 메시지 처리
   */
  private handleError(message: WebSocketMessage): void {
    this.logger.error('서버 에러:', message.data);
    this.emit('stream:error', { error: message.data });
  }

  /**
   * 스트림 시작 확인 메시지 처리
   */
  private handleStreamStarted(message: WebSocketMessage): void {
    if (!message.stream_id) {
      this.logger.warn('stream_started 메시지에 stream_id가 없음');
      return;
    }

    const stream = this.activeStreams.get(message.stream_id);
    if (stream) {
      stream.setStatus('connected');
      this.logger.info(`스트림 시작됨: ${message.stream_id}`);
      this.emit('stream:started', { streamId: message.stream_id });
    } else {
      this.logger.warn(`알 수 없는 스트림 ID: ${message.stream_id}`);
    }
  }

  /**
   * 스트림 중지 확인 메시지 처리
   */
  private handleStreamStopped(message: WebSocketMessage): void {
    if (!message.stream_id) {
      this.logger.warn('stream_stopped 메시지에 stream_id가 없음');
      return;
    }

    const stream = this.activeStreams.get(message.stream_id);
    if (stream) {
      stream.setStatus('disconnected');
      this.logger.info(`스트림 중지됨: ${message.stream_id}`);
      this.emit('stream:stopped', { streamId: message.stream_id });
    } else {
      this.logger.warn(`알 수 없는 스트림 ID: ${message.stream_id}`);
    }
  }

  /**
   * 메시지 전송
   */
  private sendMessage(message: WebSocketMessage): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.websocket.send(JSON.stringify(message));
  }

  /**
   * 하트비트 시작
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = window.setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type: 'ping',
          timestamp: new Date().toISOString()
        };
        this.sendMessage(message);
      }
    }, 30000); // 30초마다 ping
  }

  /**
   * 하트비트 중지
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnection(): void {
    if (this.reconnectionAttempts >= this.reconnectionConfig.maxAttempts) {
      this.logger.error('최대 재연결 시도 횟수 초과');
      this.emit('reconnection:failed', { attempts: this.reconnectionAttempts });
      return;
    }

    const delay = Math.min(
      this.reconnectionConfig.baseDelay * Math.pow(this.reconnectionConfig.backoffFactor, this.reconnectionAttempts),
      this.reconnectionConfig.maxDelay
    );

    this.logger.info(`${delay}ms 후 재연결 시도 (${this.reconnectionAttempts + 1}/${this.reconnectionConfig.maxAttempts})`);

    this.reconnectionTimer = window.setTimeout(async () => {
      this.reconnectionAttempts++;
      this.stats.reconnectionAttempts++;
      this.stats.lastReconnectionAt = new Date().toISOString();

      try {
        await this.ensureWebSocketConnection();
        
        // 기존 스트림들 재시작
        for (const [streamId, stream] of this.activeStreams) {
          const message: WebSocketMessage = {
            type: 'start_stream',
            stream_id: streamId,
            data: { filters: stream.filters },
            timestamp: new Date().toISOString()
          };
          this.sendMessage(message);
          stream.setStatus('connected');
        }

        this.emit('reconnection:success', { attempts: this.reconnectionAttempts });

      } catch (error) {
        this.logger.error('재연결 실패:', error);
        this.scheduleReconnection(); // 다시 스케줄링
      }
    }, delay);
  }

  /**
   * 모든 스트림 중지
   */
  async stopAllStreams(): Promise<void> {
    const streamIds = Array.from(this.activeStreams.keys());
    
    for (const streamId of streamIds) {
      await this.stopStream(streamId);
    }

    this.logger.info(`모든 스트림 중지됨 (${streamIds.length}개)`);
  }

  /**
   * 연결 해제
   */
  async disconnect(): Promise<void> {
    // 모든 스트림 중지
    await this.stopAllStreams();

    // 타이머 정리
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = undefined;
    }

    this.stopHeartbeat();

    // WebSocket 연결 해제
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    this.logger.info('LogStreamService 연결 해제됨');
  }

  /**
   * 통계 정보 반환
   */
  getStats(): StreamStats {
    const now = Date.now();
    this.stats.uptime = now - this.stats.startTime;
    
    // 초당 메시지 수 계산
    const uptimeSeconds = this.stats.uptime / 1000;
    this.stats.messagesPerSecond = uptimeSeconds > 0 ? this.stats.totalMessages / uptimeSeconds : 0;

    return { ...this.stats };
  }

  /**
   * 활성 스트림 목록 반환
   */
  getActiveStreams(): LogStream[] {
    return Array.from(this.activeStreams.values());
  }

  /**
   * 이벤트 발생
   */
  private emit(eventType: LogSystemEventType, data: LogSystemEventData): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.logger.error(`이벤트 리스너 에러 (${eventType}):`, error);
        }
      });
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  on(eventType: LogSystemEventType, listener: (data: LogSystemEventData) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(eventType: LogSystemEventType, listener: (data: LogSystemEventData) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
}

/**
 * LogStreamService 팩토리 함수
 */
export function createLogStreamService(config: LogSystemConfig): LogStreamService {
  return new LogStreamService(config);
}

export default LogStreamService;