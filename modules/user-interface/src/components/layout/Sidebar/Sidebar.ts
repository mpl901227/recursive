/**
 * @fileoverview Sidebar Component
 * @description 사이드바 네비게이션 컴포넌트
 * @version 2.0.0
 */

// SCSS 스타일 import
import './Sidebar.scss';

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps, ComponentState } from '../../../types/index.js';
import { MenuManager } from './MenuManager.js';
import { ResizeHandler } from './ResizeHandler.js';

export interface SidebarProps extends ComponentProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  mobileBreakpoint?: number;
  persistState?: boolean;
  autoCollapse?: boolean;
  resizable?: boolean;
  collapsible?: boolean;
  animationDuration?: number;
}

export type SidebarState = 'open' | 'closed' | 'collapsed' | 'transitioning';
export type SidebarMode = 'desktop' | 'mobile';

export interface SidebarElements {
  content: HTMLElement | null;
  overlay: HTMLElement | null;
  toggleButton: HTMLButtonElement | null;
  resizeHandle: HTMLElement | null;
  widthIndicator: HTMLElement | null;
}

export class Sidebar extends BaseComponent<HTMLElement, SidebarProps> {
  private elements: SidebarElements = {
    content: null,
    overlay: null,
    toggleButton: null,
    resizeHandle: null,
    widthIndicator: null
  };

  private currentState: SidebarState = 'open';
  private currentMode: SidebarMode = 'desktop';
  private currentWidth: number;
  private targetState: SidebarState = 'open'; // transitioning 중 목표 상태
  private menuManager: MenuManager | null = null;
  private resizeHandler: ResizeHandler | null = null;
  private saveStateTimeout: number | null = null;

  constructor(
    element: HTMLElement | string,
    props: SidebarProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: SidebarProps = {
      defaultWidth: 280,
      minWidth: 240,
      maxWidth: 500,
      mobileBreakpoint: 768,
      persistState: true,
      autoCollapse: false,
      resizable: true,
      collapsible: true,
      animationDuration: 250,
      ...props
    };

    super(element, defaultProps, eventManager);
    this.currentWidth = this.props.defaultWidth || 280;
    this.loadPersistedState();
  }

  async initialize(): Promise<void> {
    await super.initialize();
    
    this.findDOMElements();
    await this.initializeManagers();
    this.setupEventListeners();
    this.applyInitialState();
    this.updateMode();

    console.info('Sidebar component initialized');
  }

  render(): void {
    this.element.innerHTML = `
      <div class="sidebar-content">
        <div class="sidebar-header">
          <h2 class="sidebar-title">메뉴</h2>
        </div>
        <ul class="sidebar-menu">
          <!-- Navigation items will be populated by MenuManager -->
        </ul>
      </div>
      ${this.props.resizable ? '<div id="resizeHandle" class="resize-handle"></div>' : ''}
    `;

    this.findDOMElements();
  }

  private findDOMElements(): void {
    this.elements.content = this.element.querySelector('.sidebar-content');
    this.elements.overlay = document.getElementById('sidebarOverlay');
    this.elements.toggleButton = document.querySelector('#leftToggleBtn') as HTMLButtonElement;
    this.elements.resizeHandle = this.element.querySelector('#resizeHandle');
    this.elements.widthIndicator = document.getElementById('widthIndicator'); // Optional element

    if (!this.elements.content) {
      throw new Error('Sidebar content element not found');
    }

    if (!this.elements.toggleButton) {
      console.warn('Toggle button (#leftToggleBtn) not found - sidebar toggle functionality may be limited');
    }
  }

  private async initializeManagers(): Promise<void> {
    if (!this.elements.content) return;

    // Initialize MenuManager with sample menu items
    this.menuManager = new MenuManager(
      this.elements.content.querySelector('.sidebar-menu') as HTMLElement,
      {
        menuItems: [
          {
            id: 'dashboard',
            title: '대시보드',
            icon: '📊',
            url: '/dashboard'
          },
          {
            id: 'chat',
            title: '채팅',
            icon: '💬',
            children: [
              {
                id: 'chat-general',
                title: '일반 채팅',
                icon: '💭',
                url: '/chat/general'
              },
              {
                id: 'chat-ai',
                title: 'AI 채팅',
                icon: '🤖',
                url: '/chat/ai'
              }
            ]
          },
          {
            id: 'tools',
            title: '도구',
            icon: '🛠️',
            children: [
              {
                id: 'tools-analyzer',
                title: '분석기',
                icon: '🔍',
                url: '/tools/analyzer'
              },
              {
                id: 'tools-generator',
                title: '생성기',
                icon: '⚡',
                url: '/tools/generator'
              },
              {
                id: 'tools-settings',
                title: '설정',
                icon: '⚙️',
                children: [
                  {
                    id: 'tools-settings-general',
                    title: '일반 설정',
                    icon: '📋',
                    url: '/tools/settings/general'
                  },
                  {
                    id: 'tools-settings-advanced',
                    title: '고급 설정',
                    icon: '🔧',
                    url: '/tools/settings/advanced'
                  }
                ]
              }
            ]
          },
          {
            id: 'analytics',
            title: '분석',
            icon: '📈',
            url: '/analytics',
            badge: '새로움'
          }
        ]
      },
      this.eventManager
    );
    await this.menuManager.initialize();
    this.addChild(this.menuManager as unknown as BaseComponent<HTMLElement, ComponentProps>);

    // Initialize ResizeHandler if resizable
    if (this.props.resizable && this.elements.resizeHandle) {
      this.resizeHandler = new ResizeHandler(
        this.elements.resizeHandle,
        {
          minWidth: this.props.minWidth || 240,
          maxWidth: this.props.maxWidth || 500,
          currentWidth: this.currentWidth,
          widthIndicator: this.elements.widthIndicator
        },
        this.eventManager
      );
      await this.resizeHandler.initialize();
      this.addChild(this.resizeHandler as unknown as BaseComponent<HTMLElement, ComponentProps>);

      // Listen to resize events using the public 'on' method
      this.resizeHandler.on('widthChanged', this.handleWidthChanged.bind(this));
      this.resizeHandler.on('resizeStart', this.handleResizeStart.bind(this));
      this.resizeHandler.on('resizeEnd', this.handleResizeEnd.bind(this));
    }
  }

  private setupEventListeners(): void {
    // Toggle button
    if (this.elements.toggleButton) {
      console.log('🔗 Sidebar: Setting up toggle button event listener');
      this.addDOMEventListener(this.elements.toggleButton, 'click', this.handleToggleClick.bind(this));
    } else {
      console.warn('🔗 Sidebar: Toggle button not found, skipping direct click listener');
    }

    // Overlay click (mobile)
    if (this.elements.overlay) {
      this.addDOMEventListener(this.elements.overlay, 'click', this.handleOverlayClick.bind(this));
    }

    // Global events - 이벤트 매니저를 통한 글로벌 이벤트 리스닝
    console.log('🔗 Sidebar: Setting up global event listeners');
    this.addEventListener('sidebar:toggle', this.handleToggleEvent.bind(this));
    this.addEventListener('sidebar:open', () => this.open());
    this.addEventListener('sidebar:close', () => this.close());
    this.addEventListener('escape:pressed', this.handleEscapeKey.bind(this));

    // Window resize
    this.addDOMEventListener(window, 'resize', this.handleWindowResize.bind(this));

    // Transition end
    this.addDOMEventListener(this.element, 'transitionend', this.handleTransitionEnd.bind(this) as EventListener);

    // Keyboard navigation
    this.addDOMEventListener(document, 'keydown', this.handleKeyDown.bind(this) as EventListener);
  }

  private applyInitialState(): void {
    console.log(`🔧 Sidebar: Applying initial state - currentState: ${this.currentState}, currentWidth: ${this.currentWidth}`);
    
    // targetState를 현재 상태와 동일하게 설정
    this.targetState = this.currentState;
    
    // CSS Grid 시스템에서는 width 직접 조작 대신 클래스와 CSS 변수 사용
    // 모바일에서만 width 직접 조작
    if (this.currentMode === 'mobile') {
      if (this.currentState === 'open') {
        this.element.style.width = `${this.currentWidth}px`;
        console.log(`🔧 Sidebar: (Mobile) Setting initial width to ${this.currentWidth}px`);
      } else {
        this.element.style.width = '0px';
        console.log('🔧 Sidebar: (Mobile) Setting initial width to 0px (closed)');
      }
    } else {
      // 데스크톱에서는 CSS Grid 시스템이 width 제어
      this.element.style.width = '';
      console.log('🔧 Sidebar: (Desktop) Clearing width - Grid system will control');
    }
    
    this.updateClasses();
    this.updateAppLayout();
    
    console.log(`🔧 Sidebar: Initial state applied - element classes: ${this.element.className}`);
  }

  public toggle(options: { force?: boolean; animated?: boolean } = {}): void {
    const { force, animated = true } = options;
    
    console.log(`🔄 Sidebar: Toggle called - current state: ${this.currentState}, force: ${force}, animated: ${animated}`);
    
    if (force !== undefined) {
      if (force) {
        this.open({ animated });
      } else {
        this.close({ animated });
      }
      return;
    }

    // transitioning 상태에서는 토글 무시
    if (this.currentState === 'transitioning') {
      console.log('🔄 Sidebar: Currently transitioning, ignoring toggle request');
      return;
    }

    // 현재 상태에 따라 토글
    if (this.currentState === 'open') {
      console.log('🔄 Sidebar: Currently open, closing...');
      this.close({ animated });
    } else if (this.currentState === 'closed') {
      console.log('🔄 Sidebar: Currently closed, opening...');
      this.open({ animated });
    } else {
      console.log(`🔄 Sidebar: Unknown state: ${this.currentState}, attempting to open`);
      this.open({ animated });
    }
  }

  public open(options: { animated?: boolean } = {}): void {
    const { animated = true } = options;
    
    console.log(`📂 Sidebar: Opening - current state: ${this.currentState}, animated: ${animated}`);
    
    if (this.currentState === 'open' || (this.currentState === 'transitioning' && this.targetState === 'open')) {
      console.log('📂 Sidebar: Already open or transitioning to open, skipping');
      return;
    }

    const oldState = this.currentState;
    this.targetState = 'open';
    this.currentState = animated ? 'transitioning' : 'open';

    // Update classes and layout
    this.updateClasses();
    this.updateAppLayout();

    if (animated) {
      // Add transition class
      this.element.classList.add('transitioning');
      
      // Set width only for mobile mode
      if (this.currentMode === 'mobile') {
        this.element.style.width = `${this.currentWidth}px`;
        console.log(`📂 Sidebar: (Mobile) Setting width to ${this.currentWidth}px with animation`);
      } else {
        console.log('📂 Sidebar: (Desktop) Using CSS Grid for width control');
      }
      
      // Remove transition class after animation
      setTimeout(() => {
        this.currentState = 'open';
        this.targetState = 'open';
        this.element.classList.remove('transitioning');
        this.updateClasses();
        this.onStateChanged(oldState, 'open');
        console.log('📂 Sidebar: Animation complete, state set to open');
      }, this.props.animationDuration || 250);
    } else {
      if (this.currentMode === 'mobile') {
        this.element.style.width = `${this.currentWidth}px`;
      }
      this.currentState = 'open';
      this.targetState = 'open';
      this.updateClasses();
      this.onStateChanged(oldState, 'open');
      console.log('📂 Sidebar: Immediately set to open state');
    }

    // Show overlay in mobile mode
    if (this.currentMode === 'mobile' && this.elements.overlay) {
      this.elements.overlay.classList.add('active');
      console.log('📂 Sidebar: Mobile overlay activated');
    }
  }

  public close(options: { animated?: boolean } = {}): void {
    const { animated = true } = options;
    
    console.log(`📁 Sidebar: Closing - current state: ${this.currentState}, animated: ${animated}`);
    
    if (this.currentState === 'closed' || (this.currentState === 'transitioning' && this.targetState === 'closed')) {
      console.log('📁 Sidebar: Already closed or transitioning to closed, skipping');
      return;
    }

    const oldState = this.currentState;
    this.targetState = 'closed';
    this.currentState = animated ? 'transitioning' : 'closed';

    // Update classes and layout immediately
    this.updateClasses();
    this.updateAppLayout();

    if (animated) {
      // Add transition class
      this.element.classList.add('transitioning');
      
      // Set width to 0 only for mobile mode
      if (this.currentMode === 'mobile') {
        this.element.style.width = '0px';
        console.log('📁 Sidebar: (Mobile) Setting width to 0px with animation');
      } else {
        console.log('📁 Sidebar: (Desktop) Using CSS Grid for width control');
      }
      
      // Remove transition class after animation
      setTimeout(() => {
        this.currentState = 'closed';
        this.targetState = 'closed';
        this.element.classList.remove('transitioning');
        this.updateClasses();
        this.onStateChanged(oldState, 'closed');
        console.log('📁 Sidebar: Animation complete, state set to closed');
      }, this.props.animationDuration || 250);
    } else {
      if (this.currentMode === 'mobile') {
        this.element.style.width = '0px';
      }
      this.currentState = 'closed';
      this.targetState = 'closed';
      this.updateClasses();
      this.onStateChanged(oldState, 'closed');
      console.log('📁 Sidebar: Immediately set to closed state');
    }

    // Hide overlay
    if (this.elements.overlay) {
      this.elements.overlay.classList.remove('active');
      console.log('📁 Sidebar: Overlay deactivated');
    }
  }

  public setWidth(width: number): void {
    const minWidth = this.props.minWidth || 240;
    const maxWidth = this.props.maxWidth || 500;
    
    this.currentWidth = Math.max(minWidth, Math.min(maxWidth, width));
    
    if (this.isOpen()) {
      // CSS Grid 호환: 모바일에서만 직접 width 조작
      if (this.currentMode === 'mobile') {
        this.element.style.width = `${this.currentWidth}px`;
      }
      this.updateAppLayout();
    }

    this.saveState();
    this.emit('sidebar:width-changed', { width: this.currentWidth });
  }

  private updateMode(): void {
    const oldMode = this.currentMode;
    this.currentMode = window.innerWidth <= (this.props.mobileBreakpoint || 768) ? 'mobile' : 'desktop';

    if (oldMode !== this.currentMode) {
      this.handleModeChange(oldMode, this.currentMode);
    }

    this.element.classList.toggle('mobile', this.currentMode === 'mobile');
    this.element.classList.toggle('desktop', this.currentMode === 'desktop');
  }

  private handleModeChange(oldMode: SidebarMode, newMode: SidebarMode): void {
    console.debug(`Sidebar mode changed: ${oldMode} → ${newMode}`);

    if (newMode === 'mobile' && this.isOpen()) {
      // Show overlay in mobile mode
      if (this.elements.overlay) {
        this.elements.overlay.classList.add('active');
      }
    } else if (newMode === 'desktop') {
      // Hide overlay in desktop mode
      if (this.elements.overlay) {
        this.elements.overlay.classList.remove('active');
      }
    }

    this.updateAppLayout();
    this.emit('sidebar:mode-changed', { oldMode, newMode });
  }

  private updateAppLayout(): void {
    // Grid 레이아웃을 위한 올바른 CSS 셀렉터와 클래스 조작
    const appMainElement = document.querySelector('.app-main') as HTMLElement;
    if (!appMainElement) {
      console.warn('⚠️ Sidebar: .app-main element not found');
      return;
    }

    // transitioning 중일 때는 targetState를 기준으로 판단
    const shouldBeOpen = this.currentState === 'open' || (this.currentState === 'transitioning' && this.targetState === 'open');
    console.log(`🔧 Sidebar: Updating layout - state: ${this.currentState}, target: ${this.targetState}, mode: ${this.currentMode}, shouldBeOpen: ${shouldBeOpen}`);

    // Grid 레이아웃 클래스 조작
    if (shouldBeOpen && this.currentMode === 'desktop') {
      appMainElement.classList.remove('left-collapsed');
      // CSS 변수 업데이트
      document.documentElement.style.setProperty('--sidebar-width', `${this.currentWidth}px`);
      console.log(`🔧 Sidebar: Layout opened, width set to ${this.currentWidth}px`);
    } else if (this.currentMode === 'desktop') {
      appMainElement.classList.add('left-collapsed');
      // CSS 변수를 0으로 설정
      document.documentElement.style.setProperty('--sidebar-width', '0px');
      console.log('🔧 Sidebar: Layout collapsed');
    } else {
      // 모바일 모드에서는 Grid 시스템 제어하지 않음
      console.log('🔧 Sidebar: Mobile mode - not controlling Grid layout');
    }
  }

  private updateClasses(): void {
    // CSS와 일치하는 클래스명 사용
    this.element.classList.toggle('sidebar-open', this.currentState === 'open');
    this.element.classList.toggle('sidebar-collapsed', this.currentState === 'closed');
    this.element.classList.toggle('transitioning', this.currentState === 'transitioning');
    
    // 레거시 클래스명도 유지 (다른 코드와의 호환성)
    this.element.classList.toggle('open', this.currentState === 'open');
    this.element.classList.toggle('closed', this.currentState === 'closed');
  }

  // Event Handlers
  private handleToggleClick(event: Event): void {
    event.preventDefault();
    console.log('🔘 Sidebar: Direct toggle button clicked');
    this.toggle();
  }

  private handleOverlayClick(event: Event): void {
    event.preventDefault();
    console.log('🔘 Sidebar: Overlay clicked - closing sidebar');
    this.close();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen() && this.currentMode === 'mobile') {
      this.close();
    }
  }

  private handleWindowResize(): void {
    this.updateMode();
  }

  private handleTransitionEnd(event: TransitionEvent): void {
    if (event.target === this.element && event.propertyName === 'width') {
      this.element.classList.remove('transitioning');
    }
  }

  private handleToggleEvent(_event: any): void {
    console.log('📡 Sidebar: Received sidebar:toggle event');
    this.toggle();
    
    // 상태 변경 이벤트 발생
    this.eventManager.emit('sidebar:toggled', {
      isOpen: this.currentState === 'open',
      source: 'sidebar'
    });
  }

  private handleEscapeKey(_event: any): void {
    if (this.isOpen() && this.currentMode === 'mobile') {
      this.close();
    }
  }

  private handleWidthChanged(event: any): void {
    this.setWidth(event.width);
  }

  private handleResizeStart(_event: any): void {
    this.element.classList.add('resizing');
  }

  private handleResizeEnd(_event: any): void {
    this.element.classList.remove('resizing');
  }

  private onStateChanged(oldState: SidebarState, newState: SidebarState): void {
    console.debug(`Sidebar state changed: ${oldState} → ${newState}`);
    
    this.saveState();
    this.emit('sidebar:state-changed', { oldState, newState });
    this.emit('sidebar:toggled', { isOpen: this.isOpen() });
  }

  private saveState(): void {
    if (!this.props.persistState) return;

    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }

    this.saveStateTimeout = window.setTimeout(() => {
      try {
        const state = {
          isOpen: this.isOpen(),
          width: this.currentWidth,
          timestamp: Date.now()
        };
        localStorage.setItem('sidebar-state', JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to save sidebar state:', error);
      }
    }, 100);
  }

  private loadPersistedState(): void {
    if (!this.props.persistState) return;

    try {
      const saved = localStorage.getItem('sidebar-state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.width) {
          this.currentWidth = state.width;
        }
        if (state.isOpen) {
          this.currentState = 'open';
        }
      }
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
    }
  }

  // Public API
  public getState(): ComponentState {
    // SidebarState를 ComponentState로 매핑
    const stateMap: Record<SidebarState, ComponentState> = {
      'open': 'ready',
      'closed': 'idle',
      'collapsed': 'idle', 
      'transitioning': 'loading'
    };
    return stateMap[this.currentState];
  }
  
  public getSidebarState(): SidebarState {
    return this.currentState;
  }

  public getMode(): SidebarMode {
    return this.currentMode;
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public getMenuManager(): MenuManager | null {
    return this.menuManager;
  }

  public getResizeHandler(): ResizeHandler | null {
    return this.resizeHandler;
  }

  public isOpen(): boolean {
    return this.currentState === 'open';
  }

  public isClosed(): boolean {
    return this.currentState === 'closed';
  }

  public isTransitioning(): boolean {
    return this.currentState === 'transitioning';
  }

  public isMobileMode(): boolean {
    return this.currentMode === 'mobile';
  }

  async destroy(): Promise<void> {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }
    
    console.info('Sidebar component destroyed');
    await super.destroy();
  }
}