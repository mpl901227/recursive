/**
 * WebSocket Client for Recursive Dashboard
 * TypeScript 마이그레이션 버전 - 타입 안전성 강화
 */

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp?: number;
}

export interface ConnectionStatus {
  isConnected: boolean;
  readyState: number;
  url: string;
  reconnectAttempts: number;
  lastPong: number | null;
}

export interface DisconnectEvent {
  code: number;
  reason: string;
  wasClean?: boolean;
}

export interface ReconnectEvent {
  attempt: number;
  max: number;
}

export type WebSocketEventType = 
  | 'connect' 
  | 'disconnect' 
  | 'message' 
  | 'error' 
  | 'reconnecting' 
  | 'ping' 
  | 'pong' 
  | 'connection-unstable'
  | 'maxRetriesReached';

export type WebSocketEventListener<T = any> = (data?: T) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelay: number;
  private readonly heartbeatInterval: number;
  private readonly heartbeatTimeout: number;
  
  protected isConnected: boolean = false;
  private eventListeners: Map<WebSocketEventType, WebSocketEventListener[]> = new Map();
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private heartbeatTimeoutId: NodeJS.Timeout | null = null;
  private lastPong: number | null = null;

  constructor(private readonly config: WebSocketConfig) {
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.reconnectDelay = config.reconnectDelay ?? 1000;
    this.heartbeatInterval = config.heartbeatInterval ?? 15000;
    this.heartbeatTimeout = config.heartbeatTimeout ?? 30000;
    
    // 기본 이벤트 리스너 맵 초기화
    this.initializeEventListeners();
  }

  /**
   * 기본 이벤트 리스너 맵 초기화
   */
  private initializeEventListeners(): void {
    const eventTypes: WebSocketEventType[] = [
      'connect', 'disconnect', 'message', 'error', 
      'reconnecting', 'ping', 'pong', 'connection-unstable'
    ];
    
    eventTypes.forEach(eventType => {
      this.eventListeners.set(eventType, []);
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  on<T = any>(event: WebSocketEventType, callback: WebSocketEventListener<T>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event)!.push(callback);
    
    // 리스너 제거 함수 반환
    return () => this.off(event, callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  off<T = any>(event: WebSocketEventType, callback: WebSocketEventListener<T>): void {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event)!;
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 한 번만 실행되는 이벤트 리스너 등록
   */
  once<T = any>(event: WebSocketEventType, callback: WebSocketEventListener<T>): void {
    const onceWrapper = (data?: T) => {
      callback(data);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  /**
   * 이벤트 발생
   */
  private emit<T = any>(event: WebSocketEventType, data?: T): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      });
    }
  }

  /**
   * 하트비트 시작
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // 기존 하트비트 정리
    
    this.heartbeatIntervalId = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        try {
          // 마지막 pong으로부터 설정된 시간이 지났으면 연결 불안정으로 판단
          if (this.lastPong) {
            const timeSinceLastPong = Date.now() - this.lastPong;
            if (timeSinceLastPong > this.heartbeatTimeout) {
              console.warn(`No pong received for ${this.heartbeatTimeout}ms, connection may be unstable`);
              this.emit('connection-unstable');
            }
          }
          
          // ping 메시지 전송
          const pingMessage: WebSocketMessage = {
            type: 'ping',
            timestamp: Date.now()
          };
          
          this.ws.send(JSON.stringify(pingMessage));
          this.emit('ping');
          
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
          this.handleConnectionError();
        }
      } else {
        this.handleConnectionError();
      }
    }, this.heartbeatInterval);
  }

  /**
   * 하트비트 중지
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  /**
   * 연결 오류 처리
   */
  private handleConnectionError(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.stopHeartbeat();
      
      const disconnectEvent: DisconnectEvent = {
        code: 1006,
        reason: 'Connection lost'
      };
      
      this.emit('disconnect', disconnectEvent);
      
      // 자동 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    }
  }

  /**
   * 재연결 시도
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      const reconnectEvent: ReconnectEvent = {
        attempt: this.reconnectAttempts,
        max: this.maxReconnectAttempts
      };
      
      this.emit('reconnecting', reconnectEvent);
      
      const delay = this.reconnectDelay * this.reconnectAttempts;
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('error', { 
        type: 'max_reconnect_attempts', 
        message: 'Failed to reconnect after maximum attempts' 
      });
    }
  }

  /**
   * WebSocket 연결
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastPong = Date.now();
          this.startHeartbeat();
          this.emit('connect');
          resolve();
        };
        
        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            
            // pong 메시지 특별 처리
            if (data.type === 'pong') {
              this.lastPong = Date.now();
              this.emit('pong', data);
              return;
            }
            
            this.emit('message', data);
          } catch (error) {
            // JSON이 아닌 메시지도 처리
            const textMessage: WebSocketMessage = {
              type: 'text',
              data: event.data
            };
            this.emit('message', textMessage);
          }
        };
        
        this.ws.onclose = (event: CloseEvent) => {
          this.isConnected = false;
          this.stopHeartbeat();
          
          const disconnectEvent: DisconnectEvent = {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          };
          
          this.emit('disconnect', disconnectEvent);
          
          // 자동 재연결 시도 (정상 종료가 아닌 경우)
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };
        
        this.ws.onerror = (error: Event) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        this.emit('error', error);
        reject(error);
      }
    });
  }

  /**
   * 메시지 전송
   */
  send(data: WebSocketMessage | string | object): boolean {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws.send(message);
        return true;
      } catch (error) {
        console.error('Failed to send message:', error);
        this.emit('error', error);
        return false;
      }
    }
    return false;
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * 연결 상태 확인
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      isConnected: this.isConnected,
      readyState: this.ws?.readyState ?? WebSocket.CLOSED,
      url: this.config.url,
      reconnectAttempts: this.reconnectAttempts,
      lastPong: this.lastPong
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }
} 