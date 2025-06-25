// ============================================
// RightSidebar V2 - 메인 클래스 구현
// ============================================

import { ComponentFactory } from '../../utils/component-factory.js';
import { domManager } from '../../core/DOMManager.js';
import { eventManager } from '../../core/EventManager.js';
import { AppManager } from './AppManager.js';
import type { RightSidebarConfig, AppInfo } from './types.js';

export class RightSidebar {
  private config: RightSidebarConfig;
  private element: HTMLElement;
  private appManager: AppManager;
  private isInitialized = false;
  private isVisible = false;
  private currentWidth: number;
  private isResizing = false;

  constructor(selector: string, config: RightSidebarConfig = {}) {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`RightSidebar element not found: ${selector}`);
    }

    this.element = element;
    this.config = {
      initialWidth: 320,
      minWidth: 280,
      maxWidth: 600,
      resizable: true,
      position: 'right',
      ...config
    };
    
    this.currentWidth = this.config.initialWidth!;
    this.appManager = new AppManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // DOM 구조 생성
      this.render();
      
      // 앱 매니저 초기화
      await this.appManager.initialize();
      
      // 이벤트 설정
      this.setupEventListeners();
      
      // 기본 앱 등록
      this.registerDefaultApps();
      
      // 레이아웃 조정
      this.adjustLayout();
      
      this.isInitialized = true;
      console.log('✅ RightSidebar 초기화 완료');
      
    } catch (error) {
      console.error('❌ RightSidebar 초기화 실패:', error);
      throw error;
    }
  }

  // ============================================================================
  // 🎨 DOM 렌더링 메서드들
  // ============================================================================

  private render(): void {
    // ComponentFactory를 사용한 표준화된 UI 생성
    const header = this.createHeader();
    const content = this.createContent();
    const resizeHandle = this.createResizeHandle();

    this.element.className = 'rightsidebar';
    this.element.style.width = `${this.currentWidth}px`;
    this.element.appendChild(resizeHandle);
    this.element.appendChild(header);
    this.element.appendChild(content);
  }

  private createHeader(): HTMLElement {
    const header = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'sm',
      className: 'rightsidebar__header'
    });

    // 제목과 닫기 버튼
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex justify-between items-center';
    
    const title = document.createElement('h3');
    title.textContent = 'Apps';
    title.className = 'text-lg font-semibold';
    
    const closeBtn = ComponentFactory.createButton({
      children: '×',
      variant: 'ghost',
      size: 'sm',
      className: 'rightsidebar__close',
      onClick: () => this.hide()
    });

    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);

    // 앱 탭 네비게이션
    const tabContainer = document.createElement('div');
    tabContainer.className = 'rightsidebar__tabs flex gap-2 mt-3';
    tabContainer.id = 'rightsidebar-tabs';

    const headerBody = header.querySelector('.card__body')!;
    headerBody.appendChild(titleContainer);
    headerBody.appendChild(tabContainer);

    return header;
  }

  private createContent(): HTMLElement {
    const content = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'none',
      className: 'rightsidebar__content flex-1'
    });

    const contentBody = content.querySelector('.card__body')!;
    contentBody.id = 'rightsidebar-app-container';
    contentBody.className = 'h-full overflow-auto';

    // 빈 상태
    const emptyState = this.createEmptyState();
    emptyState.id = 'rightsidebar-empty-state';
    contentBody.appendChild(emptyState);

    return content;
  }

  private createEmptyState(): HTMLElement {
    const emptyCard = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'lg',
      className: 'text-center'
    });

    const emptyBody = emptyCard.querySelector('.card__body')!;
    emptyBody.innerHTML = `
      <div class="text-4xl mb-4">📱</div>
      <h3 class="text-lg font-semibold mb-2">No App Selected</h3>
      <p class="text-gray-600">Choose an app from the tabs to get started.</p>
    `;

    return emptyCard;
  }

  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'rightsidebar__resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('tabindex', '0');
    handle.innerHTML = '<div class="rightsidebar__resize-grip"></div>';
    
    return handle;
  }

  // ============================================================================
  // 🎛️ 이벤트 및 상호작용 처리
  // ============================================================================

  private setupEventListeners(): void {
    // 리사이즈 핸들 이벤트
    const resizeHandle = this.element.querySelector('.rightsidebar__resize-handle');
    if (resizeHandle && this.config.resizable) {
      resizeHandle.addEventListener('mousedown', this.handleResizeStart.bind(this));
      resizeHandle.addEventListener('keydown', this.handleKeyboardResize.bind(this));
    }

    // 앱 매니저 이벤트
    this.appManager.on('app:registered', this.updateTabs.bind(this));
    this.appManager.on('app:activated', this.handleAppActivation.bind(this));

    // 전역 이벤트
    eventManager.on('rightsidebar:toggle' as any, () => this.toggle());
    eventManager.on('rightsidebar:show' as any, (data: any) => this.show(data?.appId));
    eventManager.on('rightsidebar:hide' as any, () => this.hide());
  }

  private handleResizeStart(event: MouseEvent): void {
    if (!this.config.resizable) return;
    
    event.preventDefault();
    this.isResizing = true;
    
    const startX = event.clientX;
    const startWidth = this.currentWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX; // 오른쪽에서 왼쪽으로
      const newWidth = Math.max(
        this.config.minWidth!,
        Math.min(this.config.maxWidth!, startWidth + deltaX)
      );
      
      this.currentWidth = newWidth;
      this.element.style.width = `${newWidth}px`;
      this.adjustLayout();
    };
    
    const handleMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  private handleKeyboardResize(event: KeyboardEvent): void {
    if (!this.config.resizable) return;
    
    const step = 10;
    let newWidth = this.currentWidth;
    
    switch (event.key) {
      case 'ArrowLeft':
        newWidth = Math.max(this.config.minWidth!, newWidth - step);
        break;
      case 'ArrowRight':
        newWidth = Math.min(this.config.maxWidth!, newWidth + step);
        break;
      default:
        return;
    }
    
    event.preventDefault();
    this.currentWidth = newWidth;
    this.element.style.width = `${newWidth}px`;
    this.adjustLayout();
  }

  private updateTabs(): void {
    const tabContainer = document.getElementById('rightsidebar-tabs');
    if (!tabContainer) return;

    const apps = this.appManager.getRegisteredApps();
    const activeAppId = this.appManager.getActiveAppId();

    tabContainer.innerHTML = '';
    
    apps.forEach(app => {
      const tab = ComponentFactory.createButton({
        children: `${app.icon || '📱'} ${app.title}`,
        variant: activeAppId === app.id ? 'primary' : 'ghost',
        size: 'sm',
        className: 'rightsidebar__tab',
        onClick: () => this.activateApp(app.id)
      });
      
      tabContainer.appendChild(tab);
    });
  }

  private handleAppActivation(data: { appId: string; element: HTMLElement }): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    
    if (container && emptyState) {
      // 빈 상태 숨기기
      emptyState.style.display = 'none';
      
      // 기존 앱 제거
      const existingApps = container.querySelectorAll('.rightsidebar__app');
      existingApps.forEach(app => app.remove());
      
      // 새 앱 추가
      data.element.className = 'rightsidebar__app h-full';
      container.appendChild(data.element);
      
      // 탭 업데이트
      this.updateTabs();
    }
  }

  // ============================================================================
  // 📱 기본 앱 구현
  // ============================================================================

  private registerDefaultApps(): void {
    // 로그 시스템 앱
    this.registerApp({
      id: 'log-dashboard',
      title: 'Logs',
      icon: '📊',
      description: 'System logs and monitoring',
      category: 'system',
      render: () => this.createLogApp()
    });

    // MCP 도구 앱
    this.registerApp({
      id: 'mcp-tools', 
      title: 'MCP Tools',
      icon: '🔧',
      description: 'Model Context Protocol tools',
      category: 'tools',
      render: () => this.createMCPApp()
    });
  }

  private createLogApp(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-4';
    
    const card = ComponentFactory.createCard({
      header: 'Recent Logs',
      variant: 'elevated',
      padding: 'md'
    });
    
    const cardBody = card.querySelector('.card__body')!;
    cardBody.innerHTML = `
      <div class="space-y-2">
        <div class="text-sm text-green-600">✅ System healthy</div>
        <div class="text-sm text-yellow-600">⚠️ High memory usage</div>
        <div class="text-sm text-red-600">❌ Network timeout</div>
      </div>
    `;
    
    container.appendChild(card);
    return container;
  }

  private createMCPApp(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-4';
    
    const card = ComponentFactory.createCard({
      header: 'MCP Tools',
      variant: 'elevated',
      padding: 'md'
    });
    
    const cardBody = card.querySelector('.card__body')!;
    cardBody.innerHTML = `
      <div class="space-y-3">
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          🔍 Log Analysis
        </button>
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          📊 System Health
        </button>
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          🛠️ Diagnostics
        </button>
      </div>
    `;
    
    container.appendChild(card);
    return container;
  }

  // ============================================================================
  // 🎯 Public API
  // ============================================================================

  public show(appId?: string): void {
    this.isVisible = true;
    this.element.setAttribute('data-visible', 'true');
    this.adjustLayout();
    
    if (appId) {
      this.activateApp(appId);
    }
    
    eventManager.emit('rightsidebar:visibility:change' as any, { visible: true });
  }

  public hide(): void {
    this.isVisible = false;
    this.element.setAttribute('data-visible', 'false');
    this.adjustLayout();
    
    eventManager.emit('rightsidebar:visibility:change' as any, { visible: false });
  }

  public toggle(appId?: string): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(appId);
    }
  }

  public registerApp(appInfo: AppInfo): void {
    this.appManager.registerApp(appInfo);
  }

  public activateApp(appId: string): void {
    this.appManager.activateApp(appId);
    if (!this.isVisible) {
      this.show();
    }
  }

  // ============================================================================
  // 🔧 레이아웃 조정
  // ============================================================================

  private adjustLayout(): void {
    const mainContent = domManager.getElement('mainContent');
    if (mainContent) {
      if (this.isVisible) {
        mainContent.style.marginRight = `${this.currentWidth}px`;
        mainContent.style.transition = 'margin-right 0.3s ease';
      } else {
        mainContent.style.marginRight = '0';
      }
    }
  }

  public destroy(): void {
    this.appManager.destroy();
    this.adjustLayout(); // MainContent 복원
    console.log('RightSidebar destroyed');
  }
}
