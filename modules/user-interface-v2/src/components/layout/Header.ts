import { ComponentFactory } from '../../utils/component-factory.js';
import { WebSocketService } from '../../services/WebSocketService';
import { ConnectionState } from '../../types';
import { RightSidebar } from './RightSidebar.js';

export interface HeaderProps {
  logoText?: string;
  logoIcon?: string;
  showConnectionStatus?: boolean;
  wsService?: WebSocketService;
  rightSidebar?: RightSidebar;
}

export class Header {
  private theme: 'light' | 'dark' = 'dark';
  private isInitialized = false;
  private element: HTMLElement;
  private props: HeaderProps;
  private wsService: WebSocketService | null = null;
  private connectionStatusInterval: NodeJS.Timeout | null = null;
  private connectionStatusElement: HTMLElement | null = null;
  private logServiceStatusElement: HTMLElement | null = null;
  private aiServiceStatusElement: HTMLElement | null = null;
  private rightSidebar: RightSidebar | null = null;

  constructor(element: HTMLElement | string, props: HeaderProps = {}) {
    this.element = typeof element === 'string' 
      ? document.querySelector(element) as HTMLElement 
      : element;
      
    if (!this.element) {
      throw new Error('Header element not found');
    }
    
    this.props = props;
    this.wsService = props.wsService || null;
    this.rightSidebar = props.rightSidebar || null;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    // 기존 이벤트 리스너 중복 방지
    const existingListeners = this.element.querySelectorAll('.sidebar-toggle');
    existingListeners.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode?.replaceChild(newBtn, btn);
    });
    
    this.setupSidebarToggle();
    this.setupRightSidebarToggle();
    this.setupThemeToggle();
    this.loadTheme();
    this.setupLogo();
    this.setupConnectionStatus();
    this.setupEventListeners();
    
    // WebSocket 연결 상태 주기적 체크 시작
    if (this.props.showConnectionStatus) {
      this.startConnectionStatusCheck();
    }
    
    this.isInitialized = true;
  }

  private setupSidebarToggle() {
    // ComponentFactory를 사용하여 토글 버튼이 없으면 생성
    let toggleButton = this.element.querySelector('.sidebar-toggle') as HTMLButtonElement;
    
    if (!toggleButton) {
      // 기존 헤더에 토글 버튼 추가
      const headerLeft = this.element.querySelector('.header-left');
      if (headerLeft) {
        toggleButton = ComponentFactory.createButton({
          children: '☰',
          variant: 'ghost',
          size: 'sm',
          className: 'sidebar-toggle',
          attributes: { 'aria-label': '사이드바 토글' }
        });
        headerLeft.insertBefore(toggleButton, headerLeft.firstChild);
      }
    }
    
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    const appBody = document.querySelector('.app-body') as HTMLElement;
    
    if (!toggleButton || !sidebar || !appBody) {
      return;
    }

    toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isCurrentlyOpen = sidebar.classList.contains('open');
      
      if (isCurrentlyOpen) {
        sidebar.classList.remove('open');
        appBody.classList.remove('sidebar-open');
        sidebar.style.width = '0';
        sidebar.style.minWidth = '0';
        sidebar.style.overflow = 'hidden';
      } else {
        sidebar.classList.add('open');
        appBody.classList.add('sidebar-open');
        sidebar.style.width = '220px';
        sidebar.style.minWidth = '220px';
        sidebar.style.overflow = 'auto';
      }
    });
  }

  private setupRightSidebarToggle() {
    // ComponentFactory를 사용하여 오른쪽 사이드바 토글 버튼 생성
    let toggleButton = this.element.querySelector('.right-sidebar-toggle') as HTMLButtonElement;
    
    if (!toggleButton) {
      // 기존 헤더에 토글 버튼 추가
      const headerRight = this.element.querySelector('.header-right');
      if (headerRight) {
        toggleButton = ComponentFactory.createButton({
          children: '←',
          variant: 'ghost',
          size: 'sm',
          className: 'right-sidebar-toggle',
          attributes: { 'aria-label': '오른쪽 사이드바 토글' }
        });
        
        // 테마 토글 버튼 앞에 삽입 (있다면)
        const themeToggle = headerRight.querySelector('.theme-toggle');
        if (themeToggle) {
          headerRight.insertBefore(toggleButton, themeToggle);
        } else {
          headerRight.appendChild(toggleButton);
        }
      }
    }

    if (!toggleButton || !this.rightSidebar) {
      return;
    }

    // 기존 이벤트 리스너 중복 방지
    const newToggleButton = toggleButton.cloneNode(true) as HTMLButtonElement;
    toggleButton.parentNode?.replaceChild(newToggleButton, toggleButton);

    newToggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.rightSidebar) {
        this.rightSidebar.toggle();
      }
    });
  }

  private setupThemeToggle() {
    // HTML에 이미 있는 테마 토글 버튼 사용
    let themeToggle = this.element.querySelector('.theme-toggle') as HTMLButtonElement;
    
    if (!themeToggle) {
      // HTML에 없을 경우에만 ComponentFactory로 생성
      const headerRight = this.element.querySelector('.header-right');
      if (headerRight) {
        themeToggle = ComponentFactory.createButton({
          children: this.theme === 'light' ? '🌙' : '☀️',
          variant: 'ghost',
          size: 'sm',
          className: 'theme-toggle',
          attributes: { 'aria-label': '테마 전환' }
        });
        headerRight.appendChild(themeToggle);
      }
    } else {
      // 기존 HTML 버튼의 아이콘 업데이트
      this.updateThemeIcon();
    }

    if (!themeToggle) {
      return;
    }

    // 기존 이벤트 리스너 제거 후 새로 추가
    const newThemeToggle = themeToggle.cloneNode(true) as HTMLButtonElement;
    themeToggle.parentNode?.replaceChild(newThemeToggle, themeToggle);

    newThemeToggle.addEventListener('click', () => {
      this.toggleTheme();
    });
  }

  private toggleTheme(): void {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    
    // App.ts의 테마 변경 메서드 호출
    if ((window as any).recursiveApp) {
      (window as any).recursiveApp.setTheme(this.theme);
    } else {
      // 백업: 직접 DOM 업데이트
      document.documentElement.setAttribute('data-theme', this.theme);
      localStorage.setItem('recursive-v2-theme', this.theme);
    }
    
    // CSS 변수 직접 설정 (근본적 해결책)
    this.setCSSVariables(this.theme);
    
    // 버튼 아이콘 업데이트
    this.updateThemeIcon();
  }

  private setCSSVariables(theme: string): void {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    
    if (isDark) {
      // 다크 테마 CSS 변수 설정
      root.style.setProperty('--color-background', '#1f2937');
      root.style.setProperty('--color-background-secondary', '#111827');
      root.style.setProperty('--color-background-disabled', '#374151');
      root.style.setProperty('--color-background-code', '#374151');
      root.style.setProperty('--color-text', '#f9fafb');
      root.style.setProperty('--color-text-secondary', '#9ca3af');
      root.style.setProperty('--color-text-placeholder', '#6b7280');
      root.style.setProperty('--color-border', '#374151');
      root.style.setProperty('--color-border-secondary', '#4b5563');
      root.style.setProperty('--color-shadow', 'rgba(0, 0, 0, 0.3)');
    } else {
      // 라이트 테마 CSS 변수 설정
      root.style.setProperty('--color-background', '#ffffff');
      root.style.setProperty('--color-background-secondary', '#f9fafb');
      root.style.setProperty('--color-background-disabled', '#f3f4f6');
      root.style.setProperty('--color-background-code', '#f3f4f6');
      root.style.setProperty('--color-text', '#1f2937');
      root.style.setProperty('--color-text-secondary', '#6b7280');
      root.style.setProperty('--color-text-placeholder', '#9ca3af');
      root.style.setProperty('--color-border', '#e5e7eb');
      root.style.setProperty('--color-border-secondary', '#d1d5db');
      root.style.setProperty('--color-shadow', 'rgba(0, 0, 0, 0.1)');
    }
  }

  private updateThemeIcon(): void {
    const themeToggle = this.element.querySelector('.theme-toggle') as HTMLButtonElement;
    if (themeToggle) {
      const themeIcon = themeToggle.querySelector('.theme-icon');
      if (themeIcon) {
        // HTML 구조에 .theme-icon이 있는 경우
        themeIcon.textContent = this.theme === 'light' ? '🌙' : '☀️';
      } else {
        // .theme-icon이 없으면 버튼 전체 텍스트 업데이트
        themeToggle.textContent = this.theme === 'light' ? '🌙' : '☀️';
      }
    }
  }

  private loadTheme(): void {
    const savedTheme = localStorage.getItem('recursive-v2-theme') as 'light' | 'dark' | null;
    const theme = savedTheme || 'dark';
    
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    // CSS 변수 직접 설정 (근본적 해결책)
    this.setCSSVariables(theme);
    
    // 테마 버튼 아이콘 업데이트
    this.updateThemeIcon();
  }

  private setupLogo(): void {
    const { logoText = 'Recursive', logoIcon = 'R' } = this.props;
    const logoContainer = this.element.querySelector('.logo-container');
    
    if (logoContainer) {
      logoContainer.innerHTML = `
        <span class="logo-icon">${logoIcon}</span>
        <span class="logo-text">${logoText}</span>
      `;
    }
  }

  private setupConnectionStatus(): void {
    if (!this.props.showConnectionStatus) {
      return;
    }

    const headerRight = this.element.querySelector('.header-right');
    if (!headerRight) {
      return;
    }

    // WebSocket 연결 상태 표시
    this.connectionStatusElement = document.createElement('div');
    this.connectionStatusElement.className = 'connection-status';
    this.connectionStatusElement.textContent = '연결 중...';
    this.connectionStatusElement.setAttribute('data-status', 'connecting');

    // 로그 서비스 상태 표시
    this.logServiceStatusElement = document.createElement('div');
    this.logServiceStatusElement.className = 'log-service-status';
    this.logServiceStatusElement.textContent = '로그 서비스: 연결 중...';
    this.logServiceStatusElement.setAttribute('data-status', 'connecting');

    // AI 서비스 상태 표시
    this.aiServiceStatusElement = document.createElement('div');
    this.aiServiceStatusElement.className = 'ai-service-status';
    this.aiServiceStatusElement.textContent = 'AI 서비스: 준비 중...';
    this.aiServiceStatusElement.setAttribute('data-status', 'initializing');

    // 상태 표시 요소들 추가
    headerRight.appendChild(this.connectionStatusElement);
    headerRight.appendChild(this.logServiceStatusElement);
    headerRight.appendChild(this.aiServiceStatusElement);
  }

  private checkConnectionStatus(): void {
    if (!this.wsService) {
      this.updateConnectionStatus('disconnected');
      return;
    }

    const isConnected = this.wsService.isConnected();
    this.updateConnectionStatus(isConnected ? 'connected' : 'disconnected');
  }

  private startConnectionStatusCheck(): void {
    // 이전 인터벌이 있다면 정리
    if (this.connectionStatusInterval) {
      clearInterval(this.connectionStatusInterval);
    }

    // 2초마다 연결 상태 체크
    this.connectionStatusInterval = setInterval(() => {
      this.checkConnectionStatus();
    }, 2000);
  }

  public updateConnectionStatus(state: ConnectionState): void {
    if (!this.connectionStatusElement) {
      return;
    }

    let statusText = '';
    let statusClass = '';

    switch (state) {
      case 'connected':
        statusText = '연결됨';
        statusClass = 'connected';
        break;
      case 'disconnected':
        statusText = '연결 끊김';
        statusClass = 'disconnected';
        break;
      case 'connecting':
        statusText = '연결 중...';
        statusClass = 'connecting';
        break;
      case 'error':
        statusText = '연결 오류';
        statusClass = 'error';
        break;
    }

    this.connectionStatusElement.textContent = statusText;
    this.connectionStatusElement.setAttribute('data-status', statusClass);
  }

  public updateLogServiceStatus(connected: boolean): void {
    if (!this.logServiceStatusElement) {
      return;
    }

    const statusText = connected ? '로그 서비스: 연결됨' : '로그 서비스: 연결 끊김';
    const statusClass = connected ? 'connected' : 'disconnected';

    this.logServiceStatusElement.textContent = statusText;
    this.logServiceStatusElement.setAttribute('data-status', statusClass);
  }

  public updateAIServiceStatus(status: string): void {
    if (!this.aiServiceStatusElement) {
      return;
    }

    this.aiServiceStatusElement.textContent = `AI 서비스: ${status}`;
    this.aiServiceStatusElement.setAttribute('data-status', status.toLowerCase());
  }

  private setupEventListeners(): void {
    const menuToggle = this.element.querySelector('.menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('sidebar:toggle', {
          detail: { open: undefined }
        }));
      });
    }

    // WebSocket 서비스 이벤트 리스너
    if (this.wsService) {
      this.wsService.onConnect(() => {
        this.updateConnectionStatus('connected');
      });

      this.wsService.onDisconnect(() => {
        this.updateConnectionStatus('disconnected');
      });
    }
  }

  public setWebSocketService(wsService: WebSocketService): void {
    this.wsService = wsService;
    this.setupEventListeners();
    this.checkConnectionStatus();
  }

  public setRightSidebar(rightSidebar: RightSidebar): void {
    this.rightSidebar = rightSidebar;
    this.props.rightSidebar = rightSidebar;
    
    // 토글 버튼 다시 설정
    if (this.isInitialized) {
      this.setupRightSidebarToggle();
    }
  }

  public destroy(): void {
    // 이벤트 리스너 정리
    if (this.connectionStatusInterval) {
      clearInterval(this.connectionStatusInterval);
      this.connectionStatusInterval = null;
    }
  }
} 