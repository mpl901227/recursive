// WebSocket 서비스 인터페이스
export interface WebSocketService {
  initialize(): Promise<void>;
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(message: any): void;
  onMessage(callback: (message: any) => void): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  getConnectionState(): ConnectionState;
  isConnected(): boolean;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

// WebSocket 서비스 구현
export class WebSocketServiceImpl implements WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private connectionState: ConnectionState = 'disconnected';
  private initialized = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  // 이벤트 콜백들
  private messageCallbacks: ((message: any) => void)[] = [];
  private connectCallbacks: (() => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.initialized = true;
      this.emit('connectionStateChange', this.connectionState);
      
    } catch (error) {
      console.error('WebSocket 서비스 초기화 실패:', error);
      throw error;
    }
  }

  async connect(url: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.url = url;
    this.connectionState = 'connecting';
    this.emit('connectionStateChange', this.connectionState);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('✅ WebSocket 연결 성공:', url);
          this.connectionState = 'connected';
          this.emit('connectionStateChange', this.connectionState);
          this.reconnectAttempts = 0;
          
          this.startHeartbeat();
          this.connectCallbacks.forEach(callback => callback());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('WebSocket 메시지 파싱 실패:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket 연결 종료:', event.code, event.reason);
          this.connectionState = 'disconnected';
          this.emit('connectionStateChange', this.connectionState);
          this.stopHeartbeat();
          
          this.disconnectCallbacks.forEach(callback => callback());
          
          // 자동 재연결 시도
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket 에러:', error);
          this.connectionState = 'error';
          this.emit('connectionStateChange', this.connectionState);
          
          const wsError = new Error('WebSocket connection error');
          this.errorCallbacks.forEach(callback => callback(wsError));
          reject(wsError);
        };

        // 연결 타임아웃 설정
        setTimeout(() => {
          if (this.connectionState === 'connecting') {
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10초 타임아웃

      } catch (error) {
        this.connectionState = 'error';
        this.emit('connectionStateChange', this.connectionState);
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 지수 백오프
    
    console.log(`WebSocket 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts} (${delay}ms 후)`);
    
    setTimeout(() => {
      if (this.connectionState === 'disconnected') {
        this.connect(this.url).catch(error => {
          console.error('WebSocket 재연결 실패:', error);
        });
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        });
      }
    }, 30000); // 30초마다 heartbeat
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleMessage(message: any): void {
    // 시스템 메시지 처리
    if (message.type === 'heartbeat') {
      // heartbeat 응답 처리
      return;
    }

    // 일반 메시지 처리
    this.messageCallbacks.forEach(callback => callback(message));
  }

  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.connectionState = 'disconnected';
  }

  send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const wsMessage: WebSocketMessage = {
      type: message.type || 'message',
      data: message.data || message,
      timestamp: new Date().toISOString()
    };

    try {
      this.ws.send(JSON.stringify(wsMessage));
    } catch (error) {
      console.error('WebSocket 메시지 전송 실패:', error);
      throw error;
    }
  }

  onMessage(callback: (message: any) => void): void {
    this.messageCallbacks.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.ws !== null && 
           this.ws.readyState === WebSocket.OPEN;
  }

  // 특정 타입의 메시지만 수신하는 편의 메서드
  public onMessageType(type: string, callback: (data: any) => void): void {
    this.onMessage((message) => {
      if (message.type === type) {
        callback(message.data);
      }
    });
  }

  // 특정 타입의 메시지 전송 편의 메서드
  public sendMessage(type: string, data: any): void {
    this.send({
      type,
      data
    });
  }

  // 연결 통계 정보
  public getConnectionInfo(): {
    state: ConnectionState;
    url: string;
    reconnectAttempts: number;
    isConnected: boolean;
  } {
    return {
      state: this.connectionState,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts,
      isConnected: this.isConnected()
    };
  }

  // 이벤트 관련 메서드
  public on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  public off(event: string, callback: (data: any) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  // 서비스 정리
  public async destroy(): Promise<void> {
    console.log('🔌 WebSocket 서비스 종료...');
    
    this.disconnect();
    
    this.eventListeners.clear();
    this.messageCallbacks = [];
    this.connectCallbacks = [];
    this.disconnectCallbacks = [];
    this.errorCallbacks = [];
    
    this.initialized = false;
  }
} 