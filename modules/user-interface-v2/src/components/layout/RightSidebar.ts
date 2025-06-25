import { ComponentFactory } from '../../utils/component-factory.js';

export interface RightSidebarApp {
  id: string;
  title: string;
  icon?: string;
  component: HTMLElement;
  enabled?: boolean;
  order?: number;
}

export interface RightSidebarProps {
  width?: string;
  position?: 'right' | 'left';
  resizable?: boolean;
  apps?: RightSidebarApp[];
}

export class RightSidebar {
  private element: HTMLElement;
  private props: RightSidebarProps;
  private isInitialized = false;
  private isOpen = false;
  private apps: Map<string, RightSidebarApp> = new Map();
  private activeAppId: string | null = null;
  private appContainer: HTMLElement | null = null;
  private tabContainer: HTMLElement | null = null;

  constructor(element: HTMLElement | string, props: RightSidebarProps = {}) {
    this.element = typeof element === 'string' 
      ? document.querySelector(element) as HTMLElement 
      : element;
      
    if (!this.element) {
      throw new Error('RightSidebar element not found');
    }
    
    this.props = {
      width: '300px',
      position: 'right',
      resizable: true,
      apps: [],
      ...props
    };

    // 기본 앱들 등록
    if (this.props.apps) {
      this.props.apps.forEach(app => this.registerApp(app));
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.render();
    this.setupEventListeners();
    this.isInitialized = true;
  }

  private render(): void {
    // 기본 구조 생성
    this.element.className = 'right-sidebar';
    this.element.innerHTML = `
      <div class="right-sidebar__header">
        <div class="right-sidebar__tabs"></div>
        <div class="right-sidebar__controls">
          <button class="right-sidebar__close" aria-label="사이드바 닫기">×</button>
        </div>
      </div>
      <div class="right-sidebar__content">
        <div class="right-sidebar__app-container"></div>
      </div>
    `;

    // 컨테이너 참조 저장
    this.tabContainer = this.element.querySelector('.right-sidebar__tabs');
    this.appContainer = this.element.querySelector('.right-sidebar__app-container');

    // 앱 탭들 렌더링
    this.renderTabs();

    // 첫 번째 앱을 활성화
    const firstApp = Array.from(this.apps.values()).find(app => app.enabled !== false);
    if (firstApp) {
      this.activateApp(firstApp.id);
    }
  }

  private renderTabs(): void {
    if (!this.tabContainer) return;

    this.tabContainer.innerHTML = '';

    // 앱들을 order 순서로 정렬
    const sortedApps = Array.from(this.apps.values())
      .filter(app => app.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedApps.forEach(app => {
      const tab = ComponentFactory.createButton({
        children: app.icon ? `${app.icon} ${app.title}` : app.title,
        variant: 'ghost',
        size: 'sm',
        className: `right-sidebar__tab`,
        attributes: { 
          'data-app-id': app.id,
          'aria-label': `${app.title} 앱 열기`
        },
        onClick: () => this.activateApp(app.id)
      });

      this.tabContainer!.appendChild(tab);
    });
  }

  private setupEventListeners(): void {
    // 닫기 버튼
    const closeButton = this.element.querySelector('.right-sidebar__close');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.close());
    }

    // 리사이즈 기능
    if (this.props.resizable) {
      this.setupResize();
    }
  }

  private setupResize(): void {
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'right-sidebar__resize-handle';
    this.element.prepend(resizeHandle);

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(window.getComputedStyle(this.element).width, 10);
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const diff = startX - e.clientX; // 왼쪽으로 드래그하면 양수
      const newWidth = startWidth + diff;
      
      // 최소/최대 너비 제한
      if (newWidth >= 200 && newWidth <= 600) {
        this.element.style.width = `${newWidth}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.body.style.cursor = '';
    });
  }

  public registerApp(app: RightSidebarApp): void {
    if (this.apps.has(app.id)) {
      console.warn(`App with id "${app.id}" is already registered`);
      return;
    }

    this.apps.set(app.id, {
      enabled: true,
      order: this.apps.size,
      ...app
    });

    // 이미 초기화된 경우 탭을 다시 렌더링
    if (this.isInitialized) {
      this.renderTabs();
    }
  }

  public unregisterApp(appId: string): void {
    if (!this.apps.has(appId)) {
      console.warn(`App with id "${appId}" is not registered`);
      return;
    }

    // 활성 앱이 제거되는 경우
    if (this.activeAppId === appId) {
      this.activeAppId = null;
      if (this.appContainer) {
        this.appContainer.innerHTML = '';
      }
    }

    this.apps.delete(appId);

    // 이미 초기화된 경우 탭을 다시 렌더링
    if (this.isInitialized) {
      this.renderTabs();
    }
  }

  public activateApp(appId: string): void {
    const app = this.apps.get(appId);
    if (!app || !this.appContainer) {
      console.warn(`App "${appId}" not found or container not ready`);
      return;
    }

    // 기존 활성 탭 비활성화
    this.element.querySelectorAll('.right-sidebar__tab').forEach(tab => {
      tab.classList.remove('right-sidebar__tab--active');
    });

    // 새 탭 활성화
    const newTab = this.element.querySelector(`[data-app-id="${appId}"]`);
    if (newTab) {
      newTab.classList.add('right-sidebar__tab--active');
    }

    // 앱 컨테이너 업데이트
    this.appContainer.innerHTML = '';
    this.appContainer.appendChild(app.component);

    this.activeAppId = appId;
  }

  public open(): void {
    if (this.isOpen) return;

    this.element.classList.add('right-sidebar--open');
    this.isOpen = true;

    // 앱 바디에 클래스 추가 (메인 컨텐츠 조정용)
    const appBody = document.querySelector('.app-body');
    if (appBody) {
      appBody.classList.add('right-sidebar-open');
    }

    // 커스텀 이벤트 발생
    this.element.dispatchEvent(new CustomEvent('rightsidebar:open'));
  }

  public close(): void {
    if (!this.isOpen) return;

    this.element.classList.remove('right-sidebar--open');
    this.isOpen = false;

    // 앱 바디에서 클래스 제거
    const appBody = document.querySelector('.app-body');
    if (appBody) {
      appBody.classList.remove('right-sidebar-open');
    }

    // 커스텀 이벤트 발생
    this.element.dispatchEvent(new CustomEvent('rightsidebar:close'));
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getActiveApp(): RightSidebarApp | null {
    return this.activeAppId ? this.apps.get(this.activeAppId) || null : null;
  }

  public getRegisteredApps(): RightSidebarApp[] {
    return Array.from(this.apps.values());
  }

  public isAppRegistered(appId: string): boolean {
    return this.apps.has(appId);
  }

  public destroy(): void {
    this.apps.clear();
    this.activeAppId = null;
    this.appContainer = null;
    this.tabContainer = null;
    this.isInitialized = false;
    this.isOpen = false;

    // 앱 바디에서 클래스 제거
    const appBody = document.querySelector('.app-body');
    if (appBody) {
      appBody.classList.remove('right-sidebar-open');
    }
  }
}

// 기본 앱 생성 헬퍼 함수들
export class RightSidebarAppHelper {
  static createPlaceholderApp(id: string, title: string, icon?: string): RightSidebarApp {
    const container = ComponentFactory.createCard({
      children: `
        <div class="text-center p-4">
          <div class="text-2xl mb-2">${icon || '📦'}</div>
          <h3 class="font-medium mb-2">${title}</h3>
          <p class="text-sm text-secondary">이 앱은 아직 개발 중입니다.</p>
        </div>
      `,
      variant: 'flat',
      padding: 'none'
    });

    return {
      id,
      title,
      icon,
      component: container,
      enabled: true
    };
  }

  static createLogViewerApp(): RightSidebarApp {
    const container = ComponentFactory.createCard({
      children: `
        <div class="p-4">
          <h3 class="font-medium mb-3">📊 로그 뷰어</h3>
          <div class="space-y-2">
            <div class="p-2 bg-secondary rounded text-sm">로그 데이터를 로드하는 중...</div>
            <div class="p-2 bg-secondary rounded text-sm">연결 상태를 확인하는 중...</div>
          </div>
        </div>
      `,
      variant: 'flat',
      padding: 'none'
    });

    return {
      id: 'log-viewer',
      title: '로그 뷰어',
      icon: '📊',
      component: container,
      enabled: true,
      order: 1
    };
  }

  static createAIChatApp(): RightSidebarApp {
    const container = ComponentFactory.createCard({
      children: `
        <div class="p-4">
          <h3 class="font-medium mb-3">🤖 AI 채팅</h3>
          <div class="space-y-2">
            <div class="p-2 bg-secondary rounded text-sm">AI 서비스에 연결하는 중...</div>
          </div>
        </div>
      `,
      variant: 'flat',
      padding: 'none'
    });

    return {
      id: 'ai-chat',
      title: 'AI 채팅',
      icon: '🤖',
      component: container,
      enabled: true,
      order: 2
    };
  }

  static createMetricsApp(): RightSidebarApp {
    const container = ComponentFactory.createCard({
      children: `
        <div class="p-4">
          <h3 class="font-medium mb-3">📈 메트릭스</h3>
          <div class="space-y-2">
            <div class="p-2 bg-secondary rounded text-sm">시스템 메트릭을 수집하는 중...</div>
          </div>
        </div>
      `,
      variant: 'flat',
      padding: 'none'
    });

    return {
      id: 'metrics',
      title: '메트릭스',
      icon: '📈',
      component: container,
      enabled: true,
      order: 3
    };
  }
} 