/**
 * @fileoverview AI Sidebar Component
 * @description AI 어시스턴트 사이드바 컴포넌트 - 시스템 상태, 활동 로그, AI 채팅 인터페이스 제공
 * @version 2.0.0
 */

// SCSS 스타일 import
import './AISidebar.scss';

import { BaseComponent } from '../../base/component.js';
import type { ComponentProps } from '../../../types/index.js';
import type { EventManager } from '../../../core/events.js';
import { SystemStatus } from './SystemStatus';
import { ActivityLog } from './ActivityLog';
import { AIChatInterface } from './AIChatInterface';

/**
 * AISidebar 컴포넌트 속성
 */
export interface AISidebarProps extends ComponentProps {
  /** 사이드바 너비 */
  width?: number;
  /** 최소 너비 */
  minWidth?: number;
  /** 최대 너비 */
  maxWidth?: number;
  /** 리사이즈 가능 여부 */
  resizable?: boolean;
  /** 접기 가능 여부 */
  collapsible?: boolean;
  /** 상태 저장 여부 */
  persistState?: boolean;
  /** 데스크톱에서만 표시 */
  showOnDesktopOnly?: boolean;
  /** 자동 새로고침 */
  autoRefresh?: boolean;
  /** 새로고침 간격 (ms) */
  refreshInterval?: number;
  /** 초기 접힘 상태 */
  collapsed?: boolean;
}

/**
 * AISidebar 상태
 */
interface AISidebarState {
  isCollapsed: boolean;
  isVisible: boolean;
  currentWidth: number;
  isResizing: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  mcpStatus: 'active' | 'inactive' | 'error';
}

/**
 * AI 어시스턴트 사이드바 컴포넌트
 * 
 * @example
 * ```typescript
 * const aiSidebar = new AISidebar(
 *   '#ai-sidebar',
 *   { width: 360, resizable: true },
 *   eventManager
 * );
 * ```
 */
export class AISidebar extends BaseComponent<HTMLElement, AISidebarProps> {
  private internalState: AISidebarState;
  private resizeHandle: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private refreshTimer: number | null = null;
  
  // 자식 컴포넌트들
  private systemStatus: SystemStatus | null = null;
  private activityLog: ActivityLog | null = null;
  private chatInterface: AIChatInterface | null = null;
  
  // 바인드된 이벤트 핸들러들
  private boundHandlers = {
    resize: this.handleResize.bind(this),
    windowResize: this.handleWindowResize.bind(this),
    keydown: this.handleKeydown.bind(this),
    visibilityChange: this.handleVisibilityChange.bind(this),
    refresh: this.handleRefresh.bind(this),
    settings: this.handleSettings.bind(this),
    toggle: this.handleToggle.bind(this),
    startDiagnosis: this.handleStartDiagnosis.bind(this),
    connectionChange: this.handleConnectionChange.bind(this),
    mcpResponse: this.handleMCPResponse.bind(this),
    sidebarToggle: this.handleSidebarToggle.bind(this)
  };

  constructor(
    element: HTMLElement | string,
    props: AISidebarProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: AISidebarProps = {
      className: '',
      style: {},
      dataset: {},
      ariaLabel: 'AI Sidebar',
      role: 'complementary',
      width: 360,
      minWidth: 300,
      maxWidth: 500,
      resizable: true,
      collapsible: true,
      persistState: true,
      showOnDesktopOnly: true,
      autoRefresh: true,
      refreshInterval: 30000,
      collapsed: false
    };

    super(element, { ...defaultProps, ...props }, eventManager);

    // 내부 상태 초기화
    this.internalState = {
      isCollapsed: this.props.collapsed!,
      isVisible: true,
      currentWidth: this.props.width!,
      isResizing: false,
      connectionStatus: 'disconnected',
      mcpStatus: 'inactive'
    };

    this.logger.debug('AISidebar instance created');
  }

  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    this.logger.info('Rendering AI Sidebar...');
    
    // 기존 내용 정리
    this.element.innerHTML = '';
    
    // 메인 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'ai-sidebar-content';
    
    // 헤더 섹션 생성
    this.createHeader(container);
    
    // 콘텐츠 영역 생성
    this.createMainContent(container);
    
    // 리사이즈 핸들 생성
    if (this.props.resizable) {
      this.createResizeHandle();
    }
    
    // 컨테이너를 엘리먼트에 추가
    this.element.appendChild(container);
    
    // CSS 클래스 설정
    this.element.classList.add('ai-sidebar');
    if (this.internalState.isCollapsed) {
      this.element.classList.add('ai-sidebar-collapsed');
    }
    
    // 초기 너비 설정
    this.setWidth(this.internalState.currentWidth);
  }

  /**
   * 헤더 섹션 생성
   */
  private createHeader(container: HTMLElement): void {
    const header = document.createElement('div');
    header.className = 'ai-sidebar-header';
    header.innerHTML = `
      <h3 class="ai-section-title">📊 AI 어시스턴트</h3>
      <div class="ai-sidebar-controls">
        <button class="ai-control-btn refresh-btn" aria-label="새로고침" title="새로고침">
          🔄
        </button>
        <button class="ai-control-btn settings-btn" aria-label="설정" title="설정">
          ⚙️
        </button>
        ${this.props.collapsible ? `
          <button class="ai-control-btn toggle-btn" aria-label="토글" title="사이드바 토글">
            ${this.internalState.isCollapsed ? '◀' : '▶'}
          </button>
        ` : ''}
      </div>
    `;
    
    container.appendChild(header);
  }

  /**
   * 메인 콘텐츠 영역 생성
   */
  private createMainContent(container: HTMLElement): void {
    const content = document.createElement('div');
    content.className = 'ai-sidebar-main';
    
    // 시스템 상태 섹션
    const statusSection = document.createElement('div');
    statusSection.id = 'ai-system-status';
    statusSection.className = 'ai-section';
    
    // 활동 로그 섹션
    const activitySection = document.createElement('div');
    activitySection.id = 'ai-activity-log';
    activitySection.className = 'ai-section';
    
    // AI 채팅 섹션
    const chatSection = document.createElement('div');
    chatSection.id = 'ai-chat-interface';
    chatSection.className = 'ai-section';
    
    // AI 진단 섹션
    const diagnosticsSection = document.createElement('div');
    diagnosticsSection.id = 'ai-diagnostics';
    diagnosticsSection.className = 'ai-section';
    diagnosticsSection.innerHTML = `
      <div class="status-card">
        <h4 class="status-card-title">🤖 AI 진단</h4>
        <div class="ai-diagnostics-content">
          <button class="btn btn-primary start-diagnosis-btn">
            진단 시작
          </button>
          <div class="diagnosis-status" style="display: none;">
            <div class="loading-spinner"></div>
            <span>진단 중...</span>
          </div>
        </div>
      </div>
    `;
    
    // 조립
    content.appendChild(statusSection);
    content.appendChild(activitySection);
    content.appendChild(chatSection);
    content.appendChild(diagnosticsSection);
    
    container.appendChild(content);
  }

  /**
   * 리사이즈 핸들 생성
   */
  private createResizeHandle(): void {
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'ai-resize-handle';
    resizeHandle.innerHTML = '<div class="resize-indicator"></div>';
    
    this.element.appendChild(resizeHandle);
    this.resizeHandle = resizeHandle;
  }

  /**
   * 이벤트 바인딩
   */
  public bindEvents(): void {
    // 부모 클래스의 이벤트 바인딩
    super.bindEvents();
    
    // 컨트롤 버튼 이벤트
    this.addDOMEventListener(
      this.element.querySelector('.refresh-btn')!,
      'click',
      this.boundHandlers.refresh
    );
    
    this.addDOMEventListener(
      this.element.querySelector('.settings-btn')!,
      'click',
      this.boundHandlers.settings
    );
    
    if (this.props.collapsible) {
      this.addDOMEventListener(
        this.element.querySelector('.toggle-btn')!,
        'click',
        this.boundHandlers.toggle
      );
    }
    
    // 진단 버튼 이벤트
    this.addDOMEventListener(
      this.element.querySelector('.start-diagnosis-btn')!,
      'click',
      this.boundHandlers.startDiagnosis as EventListener
    );
    
    // 리사이즈 이벤트
    if (this.props.resizable && this.resizeHandle) {
      this.setupResizeEvents();
    }
    
    // 윈도우 이벤트
    this.addDOMEventListener(window, 'resize', this.boundHandlers.windowResize);
    this.addDOMEventListener(document, 'keydown', this.boundHandlers.keydown as EventListener);
    this.addDOMEventListener(document, 'visibilitychange', this.boundHandlers.visibilityChange);
    
    // 커스텀 이벤트 구독
    this.addEventListener('websocket:connected', this.boundHandlers.connectionChange);
    this.addEventListener('websocket:disconnected', this.boundHandlers.connectionChange);
    this.addEventListener('mcp:response', this.boundHandlers.mcpResponse);
    this.addEventListener('ai-sidebar:toggle', this.boundHandlers.sidebarToggle);
    
    console.log('🔗 AISidebar: Event listeners set up, listening for ai-sidebar:toggle');
  }

  /**
   * 마운트 후 처리
   */
  protected async afterMount(): Promise<void> {
    await this.initializeChildComponents();
    
    // 상태 복원
    if (this.props.persistState) {
      this.restoreState();
    }
    
    // 반응형 처리
    this.handleResponsive();
    
    // 자동 새로고침 시작
    if (this.props.autoRefresh) {
      this.startAutoRefresh();
    }
    
    // 초기 데이터 로드
    await this.loadInitialData();
    
    this.logger.info('AI Sidebar mounted successfully');
  }

  /**
   * 자식 컴포넌트 초기화
   */
  private async initializeChildComponents(): Promise<void> {
    try {
      // 시스템 상태 컴포넌트
      const statusElement = this.element.querySelector('#ai-system-status') as HTMLElement;
      if (statusElement) {
        this.systemStatus = new SystemStatus(statusElement, {}, this.eventManager);
        this.addChild(this.systemStatus as unknown as BaseComponent<HTMLElement, ComponentProps>, 'systemStatus');
      }
      
      // 활동 로그 컴포넌트
      const logElement = this.element.querySelector('#ai-activity-log') as HTMLElement;
      if (logElement) {
        this.activityLog = new ActivityLog(logElement, { maxEntries: 50 }, this.eventManager);
        this.addChild(this.activityLog as unknown as BaseComponent<HTMLElement, ComponentProps>, 'activityLog');
      }
      
      // AI 채팅 인터페이스
      const chatElement = this.element.querySelector('#ai-chat-interface') as HTMLElement;
      if (chatElement) {
        this.chatInterface = new AIChatInterface(chatElement, {}, this.eventManager);
        this.addChild(this.chatInterface as unknown as BaseComponent<HTMLElement, ComponentProps>, 'chatInterface');
      }
      
      this.logger.debug('Child components initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize child components:', error);
      throw error;
    }
  }

  /**
   * 리사이즈 이벤트 설정
   */
  private setupResizeEvents(): void {
    if (!this.resizeHandle) return;
    
    let startX = 0;
    let startWidth = 0;
    
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = this.internalState.currentWidth;
      this.internalState.isResizing = true;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      this.element.classList.add('resizing');
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!this.internalState.isResizing) return;
      
      const deltaX = startX - e.clientX; // 좌측으로 끌면 증가
      const newWidth = Math.max(
        this.props.minWidth!,
        Math.min(this.props.maxWidth!, startWidth + deltaX)
      );
      
      this.setWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      this.internalState.isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      this.element.classList.remove('resizing');
      
      // 상태 저장
      if (this.props.persistState) {
        this.saveState();
      }
      
      this.emit('resize', { width: this.internalState.currentWidth });
    };
    
    this.addDOMEventListener(this.resizeHandle, 'mousedown', handleMouseDown as EventListener);
  }

  /**
   * 너비 설정
   */
  private setWidth(width: number): void {
    const clampedWidth = Math.max(
      this.props.minWidth!,
      Math.min(this.props.maxWidth!, width)
    );
    
    this.internalState.currentWidth = clampedWidth;
    this.element.style.width = `${clampedWidth}px`;
    
    // Grid 레이아웃 업데이트
    this.updateAppLayout();
    
    this.emit('width-changed', { width: clampedWidth });
  }

  /**
   * 토글 기능
   */
  public toggle(): void {
    console.log(`🔄 AISidebar: Toggle called - current collapsed state: ${this.internalState.isCollapsed}`);
    
    if (this.internalState.isCollapsed) {
      console.log('🔄 AISidebar: Currently collapsed, expanding...');
      this.expand();
    } else {
      console.log('🔄 AISidebar: Currently expanded, collapsing...');
      this.collapse();
    }
  }

  /**
   * 사이드바 접기
   */
  public collapse(): void {
    console.log('🔽 AISidebar: Collapsing...');
    this.internalState.isCollapsed = true;
    this.element.classList.add('ai-sidebar-collapsed');
    
    // Grid 레이아웃 업데이트
    this.updateAppLayout();
    
    // 토글 버튼 아이콘 변경
    const toggleBtn = this.element.querySelector('.toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = '◀';
    }
    
    this.pauseAutoRefresh();
    this.emit('collapsed');
    // Header가 기대하는 이벤트 추가 발생
    this.eventManager.emit('ai-sidebar:toggled', { isOpen: false, source: 'ai-sidebar' });
    
    if (this.props.persistState) {
      this.saveState();
    }
    
    console.log('✅ AISidebar: Collapsed');
  }

  /**
   * 사이드바 펼치기
   */
  public expand(): void {
    console.log('🔼 AISidebar: Expanding...');
    this.internalState.isCollapsed = false;
    this.element.classList.remove('ai-sidebar-collapsed');
    
    // Grid 레이아웃 업데이트
    this.updateAppLayout();
    
    // 토글 버튼 아이콘 변경
    const toggleBtn = this.element.querySelector('.toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = '▶';
    }
    
    this.resumeAutoRefresh();
    this.emit('expanded');
    // Header가 기대하는 이벤트 추가 발생
    this.eventManager.emit('ai-sidebar:toggled', { isOpen: true, source: 'ai-sidebar' });
    
    if (this.props.persistState) {
      this.saveState();
    }
    
    console.log('✅ AISidebar: Expanded');
  }

  /**
   * Grid 레이아웃 업데이트
   */
  private updateAppLayout(): void {
    // Grid 레이아웃을 위한 올바른 CSS 셀렉터와 클래스 조작
    const appMainElement = document.querySelector('.app-main') as HTMLElement;
    if (!appMainElement) {
      console.warn('⚠️ AISidebar: .app-main element not found');
      return;
    }

    // Grid 레이아웃 클래스 조작
    if (!this.internalState.isCollapsed) {
      appMainElement.classList.remove('right-collapsed');
      // CSS 변수 업데이트
      document.documentElement.style.setProperty('--ai-sidebar-width', `${this.internalState.currentWidth}px`);
      console.log(`🔧 AISidebar: Layout opened, width set to ${this.internalState.currentWidth}px`);
    } else {
      appMainElement.classList.add('right-collapsed');
      // CSS 변수를 0으로 설정
      document.documentElement.style.setProperty('--ai-sidebar-width', '0px');
      console.log('🔧 AISidebar: Layout collapsed');
    }
  }

  /**
   * 초기 데이터 로드
   */
  private async loadInitialData(): Promise<void> {
    try {
      // 연결 상태 확인
      this.updateConnectionStatus();
      
      // MCP 상태 확인
      this.updateMCPStatus();
      
      this.logger.debug('Initial data loaded');
      
    } catch (error) {
      this.logger.error('Failed to load initial data:', error);
    }
  }

  /**
   * 자동 새로고침 시작
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = window.setInterval(() => {
      if (!this.internalState.isCollapsed && document.visibilityState === 'visible') {
        this.refresh();
      }
    }, this.props.refreshInterval!);
  }

  /**
   * 자동 새로고침 일시정지
   */
  private pauseAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 자동 새로고침 재개
   */
  private resumeAutoRefresh(): void {
    if (this.props.autoRefresh && !this.refreshTimer) {
      this.startAutoRefresh();
    }
  }

  /**
   * 데이터 새로고침
   */
  private async refresh(): Promise<void> {
    try {
      this.updateConnectionStatus();
      this.updateMCPStatus();
      
      // 자식 컴포넌트들 새로고침
      if (this.systemStatus) {
        // SystemStatus 컴포넌트에는 refresh 메서드가 없으므로 render 호출
        this.systemStatus.render();
      }
      
      if (this.activityLog) {
        // ActivityLog 컴포넌트에는 refresh 메서드가 없으므로 render 호출
        this.activityLog.render();
      }
      
      this.emit('refreshed');
      
    } catch (error) {
      this.logger.error('Failed to refresh:', error);
    }
  }

  /**
   * 연결 상태 업데이트
   */
  private updateConnectionStatus(): void {
    // WebSocket 서비스에서 상태 가져오기
    // 실제 구현에서는 서비스 레이어를 통해 상태를 가져옴
    const isConnected = true; // 임시값
    
    this.internalState.connectionStatus = isConnected ? 'connected' : 'disconnected';
    this.emit('connection-status-changed', { status: this.internalState.connectionStatus });
  }

  /**
   * MCP 상태 업데이트
   */
  private updateMCPStatus(): void {
    // MCP 서비스에서 상태 가져오기
    const isActive = true; // 임시값
    
    this.internalState.mcpStatus = isActive ? 'active' : 'inactive';
    this.emit('mcp-status-changed', { status: this.internalState.mcpStatus });
  }

  /**
   * 반응형 처리
   */
  private handleResponsive(): void {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (this.props.showOnDesktopOnly) {
        if (e.matches) {
          // 모바일에서 숨김
          this.hide();
        } else {
          // 데스크톱에서 표시
          this.show();
        }
      }
    };
    
    mediaQuery.addEventListener('change', handleMediaChange);
    handleMediaChange(mediaQuery as any);
  }

  /**
   * 사이드바 숨기기
   */
  public hide(): void {
    this.internalState.isVisible = false;
    this.element.style.display = 'none';
    this.pauseAutoRefresh();
    this.emit('hidden');
  }

  /**
   * 사이드바 표시
   */
  public show(): void {
    this.internalState.isVisible = true;
    this.element.style.display = '';
    this.resumeAutoRefresh();
    this.emit('shown');
  }

  /**
   * 상태 저장
   */
  private saveState(): void {
    try {
      const state = {
        isCollapsed: this.internalState.isCollapsed,
        currentWidth: this.internalState.currentWidth,
        timestamp: Date.now()
      };
      
      localStorage.setItem('ai-sidebar-state', JSON.stringify(state));
      
    } catch (error) {
      this.logger.warn('Failed to save state:', error);
    }
  }

  /**
   * 상태 복원
   */
  private restoreState(): void {
    try {
      const saved = localStorage.getItem('ai-sidebar-state');
      if (!saved) return;
      
      const state = JSON.parse(saved);
      
      // 24시간 이상 된 상태는 무시
      if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('ai-sidebar-state');
        return;
      }
      
      this.internalState.isCollapsed = state.isCollapsed;
      this.internalState.currentWidth = state.currentWidth;
      
      if (this.internalState.isCollapsed) {
        this.collapse();
      } else {
        this.expand();
      }
      
      this.setWidth(this.internalState.currentWidth);
      
    } catch (error) {
      this.logger.warn('Failed to restore state:', error);
    }
  }

  // =============================================================================
  // 이벤트 핸들러들
  // =============================================================================

  private handleResize(_entries: ResizeObserverEntry[]): void {
    // 리사이즈 관찰자 처리
  }

  private handleWindowResize(): void {
    this.handleResponsive();
  }

  private handleKeydown(event: KeyboardEvent): void {
    // ESC 키로 사이드바 토글
    if (event.key === 'Escape' && event.ctrlKey) {
      this.toggle();
    }
  }

  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.resumeAutoRefresh();
    } else {
      this.pauseAutoRefresh();
    }
  }

  private handleRefresh(): void {
    this.refresh();
  }

  private handleSettings(): void {
    this.emit('settings-requested');
  }

  private handleToggle(): void {
    this.toggle();
  }

  private async handleStartDiagnosis(): Promise<void> {
    const button = this.element.querySelector('.start-diagnosis-btn') as HTMLButtonElement;
    const status = this.element.querySelector('.diagnosis-status') as HTMLElement;
    
    try {
      button.style.display = 'none';
      status.style.display = 'flex';
      
      // AI 진단 실행 (MCP 서비스 호출)
      const result = await this.performDiagnosis();
      
      this.showDiagnosisResult(result);
      
    } catch (error) {
      this.showDiagnosisError(error as Error);
    } finally {
      button.style.display = '';
      status.style.display = 'none';
    }
  }

  private async performDiagnosis(): Promise<any> {
    // 실제 구현에서는 MCP 서비스를 통해 AI 진단 수행
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { status: 'healthy', score: 95 };
  }

  private showDiagnosisResult(result: any): void {
    const content = this.element.querySelector('.ai-diagnostics-content')!;
    content.innerHTML = `
      <div class="diagnosis-result">
        <div class="diagnosis-score">점수: ${result.score}/100</div>
        <div class="diagnosis-status-text">상태: ${result.status}</div>
        <button class="btn btn-secondary restart-diagnosis-btn">다시 진단</button>
      </div>
    `;
    
    // 다시 진단 버튼 이벤트 추가
    this.addDOMEventListener(
      content.querySelector('.restart-diagnosis-btn')!,
      'click',
      () => {
        content.innerHTML = `
          <button class="btn btn-primary start-diagnosis-btn">진단 시작</button>
          <div class="diagnosis-status" style="display: none;">
            <div class="loading-spinner"></div>
            <span>진단 중...</span>
          </div>
        `;
        
        this.addDOMEventListener(
          content.querySelector('.start-diagnosis-btn')!,
          'click',
          this.handleStartDiagnosis.bind(this)
        );
      }
    );
  }

  private showDiagnosisError(error: Error): void {
    const content = this.element.querySelector('.ai-diagnostics-content')!;
    content.innerHTML = `
      <div class="diagnosis-error">
        <div class="error-message">진단 실패: ${error.message}</div>
        <button class="btn btn-primary retry-diagnosis-btn">다시 시도</button>
      </div>
    `;
    
    this.addDOMEventListener(
      content.querySelector('.retry-diagnosis-btn')!,
      'click',
      this.handleStartDiagnosis.bind(this)
    );
  }

  private handleConnectionChange(event: any): void {
    const isConnected = event.detail?.connected ?? false;
    this.internalState.connectionStatus = isConnected ? 'connected' : 'disconnected';
    
    // UI 업데이트
    if (this.systemStatus) {
      this.systemStatus.updateStatus(isConnected ? 'online' : 'offline');
    }
  }

  private handleMCPResponse(event: any): void {
    // MCP 응답 처리
    if (this.activityLog) {
      this.activityLog.addInfo('MCP 응답 수신', JSON.stringify(event.detail));
    }
  }

  private handleSidebarToggle(event: any): void {
    console.log('📡 AISidebar: Received ai-sidebar:toggle event', event);
    this.toggle();
    
    // 상태 변경 이벤트 발생
    this.eventManager.emit('ai-sidebar:toggled', {
      isOpen: !this.internalState.isCollapsed,
      source: 'ai-sidebar'
    });
    
    // 상태 변경 이벤트 발생
    this.eventManager.emit('ai-sidebar:toggled', {
      isOpen: !this.internalState.isCollapsed,
      source: 'ai-sidebar'
    });
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * 현재 상태 반환
   */
  public getAISidebarState(): AISidebarState {
    return { ...this.internalState };
  }

  /**
   * 접힘 상태 확인
   */
  public isCollapsed(): boolean {
    return this.internalState.isCollapsed;
  }

  /**
   * 표시 상태 확인
   */
  public isVisible(): boolean {
    return this.internalState.isVisible;
  }

  /**
   * 현재 너비 반환
   */
  public getWidth(): number {
    return this.internalState.currentWidth;
  }

  /**
   * 컴포넌트 제거
   */
  async destroy(): Promise<void> {
    // 자동 새로고침 정지
    this.pauseAutoRefresh();
    
    // 리사이즈 관찰자 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    // 부모 클래스의 destroy 호출
    await super.destroy();
    
    this.logger.info('AI Sidebar destroyed');
  }
} 