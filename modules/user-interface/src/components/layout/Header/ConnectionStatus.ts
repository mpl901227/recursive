import { BaseComponent, ComponentOptions } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';

export interface ConnectionStatusProps extends ComponentProps {
  autoUpdate?: boolean;
  showMessage?: boolean;
  updateInterval?: number;
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'connecting';

export class ConnectionStatus extends BaseComponent<HTMLElement, ConnectionStatusProps> {
  private currentStatus: ConnectionState = 'disconnected';
  private currentMessage = '연결 끊김';
  private statusText: HTMLElement | null = null;
  private updateTimer: number | null = null;

  // 이벤트 핸들러들을 미리 바인딩하여 중복 방지
  private readonly boundHandlers = {
    webSocketConnected: this.handleWebSocketConnected.bind(this),
    webSocketDisconnected: this.handleWebSocketDisconnected.bind(this),
    webSocketReconnecting: this.handleWebSocketReconnecting.bind(this),
    webSocketConnecting: this.handleWebSocketConnecting.bind(this),
    connectionStatusUpdate: this.handleConnectionStatusUpdate.bind(this)
  };

  constructor(
    element: HTMLElement | string,
    props: ConnectionStatusProps = {},
    eventManager: EventManager,
    options: ComponentOptions = {}
  ) {
    const defaultProps: ConnectionStatusProps = {
      autoUpdate: true,
      showMessage: true,
      updateInterval: 1000,
      ...props
    };

    super(element, defaultProps, eventManager, options);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.render();
    this.setupEventListeners();
    
    // 초기 상태 확인 (조금 지연 후)
    setTimeout(() => {
      this.checkConnectionStatus();
    }, 500);
    
    if (this.props.autoUpdate) {
      this.startAutoUpdate();
    }

    console.debug('ConnectionStatus component initialized');
  }

  render(): void {
    this.element.className = `connection-status ${this.currentStatus}`;
    this.element.innerHTML = `
      <div class="status-dot"></div>
      ${this.props.showMessage ? `<span class="status-text">${this.currentMessage}</span>` : ''}
    `;

                this.statusText = this.element.querySelector('.status-text');
  }

  private setupEventListeners(): void {
    // Listen for WebSocket events - 미리 바인딩된 핸들러 사용으로 중복 방지
    this.addEventListener('websocket:connected', this.boundHandlers.webSocketConnected);
    this.addEventListener('websocket:disconnected', this.boundHandlers.webSocketDisconnected);
    this.addEventListener('websocket:reconnecting', this.boundHandlers.webSocketReconnecting);
    this.addEventListener('websocket:connecting', this.boundHandlers.webSocketConnecting);
    this.addEventListener('connection-status:update', this.boundHandlers.connectionStatusUpdate);
  }

  private handleWebSocketConnected(): void {
    this.setStatus('connected', '연결됨');
  }

  private handleWebSocketDisconnected(): void {
    this.setStatus('disconnected', '연결 끊김');
  }

  private handleWebSocketReconnecting(): void {
    this.setStatus('reconnecting', '재연결 중');
  }

  private handleWebSocketConnecting(): void {
    this.setStatus('connecting', '연결 중');
  }

  private handleConnectionStatusUpdate(event: any): void {
    this.setStatus(event.status, event.message);
  }

  public setStatus(status: ConnectionState, message?: string): void {
    const oldStatus = this.currentStatus;
    this.currentStatus = status;
    
    if (message) {
      this.currentMessage = message;
    } else {
      this.currentMessage = this.getDefaultMessage(status);
    }

    this.updateUI();

    // Emit status change event
    if (oldStatus !== status) {
      this.eventManager.emit('connection-status:changed', {
        oldStatus,
        newStatus: status,
        message: this.currentMessage
      });
    }

    console.debug(`Connection status changed: ${oldStatus} → ${status}`);
  }

  private getDefaultMessage(status: ConnectionState): string {
    switch (status) {
      case 'connected':
        return '연결됨';
      case 'disconnected':
        // 개발 환경에서 더 자세한 메시지 제공
        if (process.env.NODE_ENV === 'development') {
          return '서버 연결 끊김 (서버 시작: npm run server)';
        }
        return '연결 끊김';
      case 'reconnecting':
        return '재연결 시도 중...';
      case 'connecting':
        return '연결 중...';
      default:
        return '알 수 없음';
    }
  }

  private updateUI(): void {
    if (!this.element) return;

    // Update classes
    this.element.className = `connection-status ${this.currentStatus}`;
    
    // Update text
    if (this.statusText && this.props.showMessage) {
      this.statusText.textContent = this.currentMessage;
    }

    // Update ARIA attributes
    this.element.setAttribute('aria-label', `연결 상태: ${this.currentMessage}`);
    this.element.setAttribute('title', this.currentMessage);
  }

  private startAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = window.setInterval(() => {
      this.checkConnectionStatus();
    }, this.props.updateInterval || 1000);
  }

  private stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private checkConnectionStatus(): void {
    // WebSocket 서비스를 통해 실제 연결 상태 확인
    try {
      // 글로벌 애플리케이션 인스턴스에서 WebSocket 서비스 가져오기
      if (typeof window !== 'undefined' && (window as any).RecursiveUI) {
        const app = (window as any).RecursiveUI.getApplication();
        const webSocketService = app.getService('websocket');
        
        if (webSocketService && webSocketService.manager) {
          const isConnected = webSocketService.manager.isConnected;
          const newStatus = isConnected ? 'connected' : 'disconnected';
          
          if (this.currentStatus !== newStatus) {
            this.setStatus(newStatus);
          }
        } else {
          // WebSocket 서비스가 없거나 초기화되지 않은 경우
          if (this.currentStatus !== 'disconnected') {
            this.setStatus('disconnected', 'WebSocket 서비스 없음');
          }
        }
      } else {
        // 개발 모드에서 상태 체크 이벤트 발생
        this.eventManager.emit('connection-status:check-requested');
      }
    } catch (error) {
      console.debug('Connection status check failed:', error);
      // 에러 발생 시 기본 동작 수행
      this.eventManager.emit('connection-status:check-requested');
    }
  }

  public getCurrentStatus(): ConnectionState {
    return this.currentStatus;
  }

  public getCurrentMessage(): string {
    return this.currentMessage;
  }

  public isConnected(): boolean {
    return this.currentStatus === 'connected';
  }

  public isDisconnected(): boolean {
    return this.currentStatus === 'disconnected';
  }

  public isReconnecting(): boolean {
    return this.currentStatus === 'reconnecting';
  }

  public isConnecting(): boolean {
    return this.currentStatus === 'connecting';
  }

  public setAutoUpdate(enabled: boolean): void {
    this.props.autoUpdate = enabled;
    
    if (enabled) {
      this.startAutoUpdate();
    } else {
      this.stopAutoUpdate();
    }
  }

  async destroy(): Promise<void> {
    this.stopAutoUpdate();
    console.debug('ConnectionStatus component destroyed');
    await super.destroy();
  }
} 