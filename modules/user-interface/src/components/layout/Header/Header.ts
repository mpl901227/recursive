// SCSS 스타일 import
import './Header.scss';

import { BaseComponent, ComponentOptions } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';
import { ConnectionStatus, ConnectionState } from './ConnectionStatus.js';

export interface HeaderProps extends ComponentProps {
  showLogo?: boolean;
  showConnectionStatus?: boolean;
  showToggleButtons?: boolean;
  logoText?: string;
  logoIcon?: string;
  enableThemeToggle?: boolean;
}

export interface HeaderElements {
  headerLeft: HTMLElement | null;
  headerRight: HTMLElement | null;
  logo: HTMLAnchorElement | null;
  logoIcon: HTMLElement | null;
  logoText: HTMLElement | null;
  leftToggleBtn: HTMLButtonElement | null;
  rightToggleBtn: HTMLButtonElement | null;
  themeToggleBtn: HTMLButtonElement | null;
  connectionStatusContainer: HTMLElement | null;
}

export class Header extends BaseComponent<HTMLElement, HeaderProps> {
  private elements: HeaderElements = {
    headerLeft: null,
    headerRight: null,
    logo: null,
    logoIcon: null,
    logoText: null,
    leftToggleBtn: null,
    rightToggleBtn: null,
    themeToggleBtn: null,
    connectionStatusContainer: null
  };

  private connectionStatus: ConnectionStatus | null = null;
  private isMobile = false;

  // 이벤트 핸들러들을 미리 바인딩하여 중복 방지
  private readonly boundHandlers = {
    leftToggle: this.handleLeftToggle.bind(this),
    rightToggle: this.handleRightToggle.bind(this),
    themeToggle: this.handleThemeToggle.bind(this),
    logoClick: this.handleLogoClick.bind(this),
    webSocketConnected: this.handleWebSocketConnected.bind(this),
    webSocketDisconnected: this.handleWebSocketDisconnected.bind(this),
    webSocketReconnecting: this.handleWebSocketReconnecting.bind(this),
    themeChanged: this.handleThemeChanged.bind(this),
    sidebarToggled: this.handleSidebarToggled.bind(this),
    aiSidebarToggled: this.handleAISidebarToggled.bind(this),
    windowResize: this.handleWindowResize.bind(this)
  };

  constructor(
    element: HTMLElement | string,
    props: HeaderProps = {},
    eventManager: EventManager,
    options: ComponentOptions = {}
  ) {
    const defaultProps: HeaderProps = {
      showLogo: true,
      showConnectionStatus: true,
      showToggleButtons: true,
      logoText: 'Recursive',
      logoIcon: 'R',
      enableThemeToggle: true,
      ...props
    };

    console.log('🏗️ Header 생성자 호출됨:', { element, props, options });
    super(element, defaultProps, eventManager, options);
  }

  async initialize(): Promise<void> {
    // 이미 초기화된 경우 중복 방지
    if (this.isInitialized) {
      console.warn('⚠️ Header 컴포넌트가 이미 초기화되어 있습니다.');
      return;
    }
    
    await super.initialize();
    
    this.setupDOM();
    await this.initializeChildComponents();
    this.setupEventListeners();
    this.updateState();

    console.info('Header component initialized');
  }

  render(): void {
    this.element.innerHTML = `
      <div class="header-left">
        <button id="leftToggleBtn" class="toggle-btn menu-toggle" aria-label="메뉴 토글" type="button"></button>
        ${this.props.showLogo ? this.renderLogo() : ''}
      </div>
      
      <div class="header-right">
        ${this.props.showConnectionStatus ? '<div id="connectionStatus" class="connection-status disconnected"></div>' : ''}
        ${this.props.enableThemeToggle ? this.renderThemeToggle() : ''}
        <button id="rightToggleBtn" class="toggle-btn settings-toggle desktop-only" aria-label="설정 패널 토글" type="button"></button>
      </div>
    `;

    this.findDOMElements();
  }

  private renderLogo(): string {
    return `
      <a href="#" class="logo">
        <div class="logo-icon">${this.props.logoIcon}</div>
        <span>${this.props.logoText}</span>
      </a>
    `;
  }

  private renderThemeToggle(): string {
    return `
      <button id="themeToggleBtn" class="toggle-btn theme-toggle" aria-label="테마 전환" type="button">
        <span class="theme-icon light-icon">☀️</span>
        <span class="theme-icon dark-icon hidden">🌙</span>
      </button>
    `;
  }

  private setupDOM(): void {
    this.render();
    this.applyVisibilitySettings();
  }

  private findDOMElements(): void {
    this.elements.headerLeft = this.element.querySelector('.header-left');
    this.elements.headerRight = this.element.querySelector('.header-right');
    this.elements.leftToggleBtn = this.element.querySelector('#leftToggleBtn') as HTMLButtonElement;
    this.elements.rightToggleBtn = this.element.querySelector('#rightToggleBtn') as HTMLButtonElement;
    this.elements.themeToggleBtn = this.element.querySelector('#themeToggleBtn') as HTMLButtonElement;
    this.elements.logo = this.element.querySelector('.logo') as HTMLAnchorElement;
    this.elements.connectionStatusContainer = this.element.querySelector('#connectionStatus');

    // 디버깅: DOM 요소 존재 여부 확인
    console.log('🔍 DOM 요소 확인:', {
      headerLeft: !!this.elements.headerLeft,
      headerRight: !!this.elements.headerRight,
      leftToggleBtn: !!this.elements.leftToggleBtn,
      rightToggleBtn: !!this.elements.rightToggleBtn,
      themeToggleBtn: !!this.elements.themeToggleBtn,
      logo: !!this.elements.logo,
      connectionStatus: !!this.elements.connectionStatusContainer,
      enableThemeToggle: this.props.enableThemeToggle
    });

    if (this.elements.logo) {
      this.elements.logoIcon = this.elements.logo.querySelector('.logo-icon');
      this.elements.logoText = this.elements.logo.querySelector('span');
    }
  }

  private applyVisibilitySettings(): void {
    if (!this.props.showLogo && this.elements.logo) {
      this.elements.logo.style.display = 'none';
    }

    if (!this.props.showConnectionStatus && this.elements.connectionStatusContainer) {
      this.elements.connectionStatusContainer.style.display = 'none';
    }

    if (!this.props.showToggleButtons) {
      if (this.elements.leftToggleBtn) {
        this.elements.leftToggleBtn.style.display = 'none';
      }
      if (this.elements.rightToggleBtn) {
        this.elements.rightToggleBtn.style.display = 'none';
      }
    }

    if (!this.props.enableThemeToggle && this.elements.themeToggleBtn) {
      this.elements.themeToggleBtn.style.display = 'none';
    }
  }

  private async initializeChildComponents(): Promise<void> {
    if (this.props.showConnectionStatus && this.elements.connectionStatusContainer) {
      // 기존 ConnectionStatus 인스턴스가 있는지 확인
      if (this.connectionStatus && this.connectionStatus.isInitialized) {
        console.log('⚠️ ConnectionStatus가 이미 초기화되어 있습니다. 건너뜁니다.');
        return;
      }
      
      // 기존 인스턴스가 있다면 정리
      if (this.connectionStatus) {
        console.log('🔄 기존 ConnectionStatus 인스턴스를 정리합니다.');
        await this.connectionStatus.destroy();
        this.connectionStatus = null;
      }
      
      this.connectionStatus = new ConnectionStatus(
        this.elements.connectionStatusContainer,
        { autoUpdate: true },
        this.eventManager,
        { autoRender: false } // 자동 렌더링 비활성화하여 수동 초기화만 사용
      );
      await this.connectionStatus.initialize();
      this.addChild(this.connectionStatus as BaseComponent<HTMLElement, ComponentProps>);
    }
  }

  private setupEventListeners(): void {
    if (this.elements.leftToggleBtn) {
      this.addDOMEventListener(this.elements.leftToggleBtn, 'click', this.boundHandlers.leftToggle);
    }

    if (this.elements.rightToggleBtn) {
      this.addDOMEventListener(this.elements.rightToggleBtn, 'click', this.boundHandlers.rightToggle);
    }

    if (this.elements.themeToggleBtn) {
      this.addDOMEventListener(this.elements.themeToggleBtn, 'click', this.boundHandlers.themeToggle);
    }

    if (this.elements.logo) {
      this.addDOMEventListener(this.elements.logo, 'click', this.boundHandlers.logoClick);
    }

    // Global event listeners - 미리 바인딩된 핸들러 사용
    this.addEventListener('websocket:connected', this.boundHandlers.webSocketConnected);
    this.addEventListener('websocket:disconnected', this.boundHandlers.webSocketDisconnected);
    this.addEventListener('websocket:reconnecting', this.boundHandlers.webSocketReconnecting);
    this.addEventListener('theme:changed', this.boundHandlers.themeChanged);
    this.addEventListener('sidebar:toggled', this.boundHandlers.sidebarToggled);
    this.addEventListener('ai-sidebar:toggled', this.boundHandlers.aiSidebarToggled);

    // Window resize
    this.addDOMEventListener(window, 'resize', this.boundHandlers.windowResize);
  }

  private handleLeftToggle(event: Event): void {
    event.preventDefault();
    this.logger.info('🔘 Left toggle button clicked - emitting sidebar:toggle event');
    this.eventManager.emit('sidebar:toggle', { source: 'header' });
    this.updateToggleButtonState('left');
  }

  private handleRightToggle(event: Event): void {
    event.preventDefault();
    console.log('🔘 Right toggle button clicked - emitting ai-sidebar:toggle event');
    this.eventManager.emit('ai-sidebar:toggle', { source: 'header' });
    this.updateToggleButtonState('right');
  }

  private handleThemeToggle(event: Event): void {
    event.preventDefault();
    console.log('🎨 Theme toggle clicked');
    
    // 현재 테마 확인
    const currentTheme = this.getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    console.log(`🎨 Theme toggle: ${currentTheme} → ${newTheme}`);
    
    // 테마 적용
    this.applyTheme(newTheme);
    
    // 테마 변경 이벤트 발생
    this.eventManager.emit('theme:changed', { 
      theme: newTheme, 
      previousTheme: currentTheme,
      source: 'header' 
    });
  }

  private handleLogoClick(event: Event): void {
    event.preventDefault();
    this.eventManager.emit('navigation:home', { source: 'header' });
  }

  private handleWebSocketConnected(): void {
    this.updateConnectionStatus('connected', '연결됨');
  }

  private handleWebSocketDisconnected(): void {
    this.updateConnectionStatus('disconnected', '연결 끊김');
  }

  private handleWebSocketReconnecting(): void {
    this.updateConnectionStatus('reconnecting', '재연결 중');
  }

  private handleThemeChanged(eventData: any): void {
    console.log('📡 Header: theme:changed 이벤트 수신:', eventData);
    
    const theme = eventData?.theme || eventData?.payload?.theme || 'auto';
    this.updateThemeIcon(theme);
  }

  private handleSidebarToggled(eventData: any): void {
    console.log('📡 Header: sidebar:toggled 이벤트 수신:', eventData);
    
    // EventManager를 통한 이벤트는 eventData 객체로 직접 전달됨
    const isOpen = eventData?.isOpen || eventData?.payload?.isOpen || false;
    this.updateToggleButtonActive('left', isOpen);
  }

  private handleAISidebarToggled(eventData: any): void {
    console.log('📡 Header: ai-sidebar:toggled 이벤트 수신:', eventData);
    
    // EventManager를 통한 이벤트는 eventData 객체로 직접 전달됨
    const isOpen = eventData?.isOpen || eventData?.payload?.isOpen || false;
    this.updateToggleButtonActive('right', isOpen);
  }

  private handleWindowResize(): void {
    this.updateMobileState();
  }

  private updateState(): void {
    this.updateMobileState();
    this.updateToggleButtonStates();
    this.initializeTheme();
  }

  /**
   * 테마 초기화
   */
  private initializeTheme(): void {
    const savedTheme = this.getCurrentTheme();
    this.applyTheme(savedTheme);
    console.log(`🎨 Theme initialized: ${savedTheme}`);
  }

  private updateMobileState(): void {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;

    if (wasMobile !== this.isMobile) {
      this.eventManager.emit('header:mobile-state-changed', { 
        isMobile: this.isMobile 
      });
    }

    this.element.classList.toggle('mobile', this.isMobile);
  }

  private updateToggleButtonStates(): void {
    // Get current states from other components
    // This would typically come from a state manager
    this.updateToggleButtonActive('left', false); // Default to closed
    this.updateToggleButtonActive('right', false); // Default to closed
  }

  private updateToggleButtonState(side: 'left' | 'right'): void {
    const button = side === 'left' ? this.elements.leftToggleBtn : this.elements.rightToggleBtn;
    if (button) {
      button.classList.toggle('active');
    }
  }

  private updateToggleButtonActive(side: 'left' | 'right', active: boolean): void {
    const button = side === 'left' ? this.elements.leftToggleBtn : this.elements.rightToggleBtn;
    if (button) {
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active.toString());
    }
  }

  private updateConnectionStatus(status: ConnectionState, message: string): void {
    if (this.connectionStatus) {
      this.connectionStatus.setStatus(status, message);
    }
  }

  private updateThemeIcon(theme: string): void {
    if (!this.elements.themeToggleBtn) {
      console.warn('⚠️ themeToggleBtn이 존재하지 않습니다.');
      return;
    }

    const lightIcon = this.elements.themeToggleBtn.querySelector('.light-icon') as HTMLElement;
    const darkIcon = this.elements.themeToggleBtn.querySelector('.dark-icon') as HTMLElement;

    console.log('🎨 아이콘 업데이트:', { theme, lightIcon: !!lightIcon, darkIcon: !!darkIcon });

    if (lightIcon && darkIcon) {
      if (theme === 'dark') {
        lightIcon.classList.add('hidden');
        darkIcon.classList.remove('hidden');
      } else {
        lightIcon.classList.remove('hidden');
        darkIcon.classList.add('hidden');
      }
      console.log('✅ 아이콘 업데이트 완료:', { 
        lightHidden: lightIcon.classList.contains('hidden'),
        darkHidden: darkIcon.classList.contains('hidden')
      });
    } else {
      console.error('❌ 테마 아이콘을 찾을 수 없습니다.');
    }
  }

  /**
   * 현재 테마 확인
   */
  private getCurrentTheme(): 'light' | 'dark' {
    // 1순위: localStorage에서 명시적으로 설정된 테마 확인
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      console.log(`🎨 getCurrentTheme: localStorage = ${savedTheme}`);
      return savedTheme as 'light' | 'dark';
    }
    
    // 2순위: document.documentElement에서 현재 적용된 테마 확인
    if (document.documentElement.classList.contains('theme-dark')) {
      console.log('🎨 getCurrentTheme: DOM class = dark');
      return 'dark';
    }
    
    // 3순위: 기본값 (시스템 설정은 사용하지 않고 명시적 설정만 사용)
    console.log('🎨 getCurrentTheme: 기본값 = light');
    return 'light';
  }

  /**
   * 테마 적용
   */
  private applyTheme(theme: 'light' | 'dark'): void {
    console.log(`🎨 Applying theme: ${theme}`);
    
    // HTML 요소에 테마 클래스 적용
    const htmlElement = document.documentElement;
    console.log('🔍 적용 전 HTML 클래스:', htmlElement.className);
    
    if (theme === 'dark') {
      htmlElement.classList.add('theme-dark');
    } else {
      htmlElement.classList.remove('theme-dark');
    }
    
    console.log('🔍 적용 후 HTML 클래스:', htmlElement.className);
    
    // 디버깅: 실제 DOM 클래스 확인
    const computedStyle = getComputedStyle(document.documentElement);
    console.log('🔍 DOM 클래스 상태:', {
      documentElement: document.documentElement.className,
      hasThemeDark: document.documentElement.classList.contains('theme-dark'),
      computedBackgroundPrimary: computedStyle.getPropertyValue('--color-background-primary').trim(),
      computedTextPrimary: computedStyle.getPropertyValue('--color-text-primary').trim(),
      computedGray900: computedStyle.getPropertyValue('--color-gray-900').trim(),
      computedGray100: computedStyle.getPropertyValue('--color-gray-100').trim()
    });
    
    // localStorage에 테마 저장
    localStorage.setItem('theme', theme);
    
    // 아이콘 업데이트
    this.updateThemeIcon(theme);
    
    console.log(`✅ Theme applied: ${theme}`);
  }

  public updateLogo(icon?: string, text?: string): void {
    if (icon && this.elements.logoIcon) {
      this.elements.logoIcon.textContent = icon;
      this.props.logoIcon = icon;
    }

    if (text && this.elements.logoText) {
      this.elements.logoText.textContent = text;
      this.props.logoText = text;
    }
  }

  public setToggleButtonActive(side: 'left' | 'right', active: boolean): void {
    this.updateToggleButtonActive(side, active);
  }

  public getConnectionStatus(): ConnectionStatus | null {
    return this.connectionStatus;
  }

  public isMobileMode(): boolean {
    return this.isMobile;
  }

  async destroy(): Promise<void> {
    this.logger.info('Destroying Header component');
    await super.destroy();
  }
}