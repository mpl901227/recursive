// ============================================
// RightSidebar V2 - Phase 2 강화 업데이트
// 기존 RightSidebar.ts 파일을 다음 내용으로 업데이트
// ============================================

import { ComponentFactory } from '../../utils/component-factory.js';
import { domManager } from '../../core/DOMManager.js';
import { eventManager } from '../../core/EventManager.js';
import { AppManager } from './AppManager.js';
import { EnhancedLogApp } from './EnhancedLogApp.js';
import { EnhancedMCPApp } from './EnhancedMCPApp.js';
import { appStateManager, AppStateHelper } from './AppStateManager.js';
import { dynamicAppLoader, AppLoadingIndicator } from './DynamicAppLoader.js';
import type { RightSidebarConfig, AppInfo } from './types.js';

export class RightSidebar {
  private config: RightSidebarConfig;
  private element: HTMLElement;
  private appManager: AppManager;
  private isInitialized = false;
  private isVisible = false;
  private currentWidth: number;
  private isResizing = false;
  private stateHelper: AppStateHelper;
  private lastActiveApp: string | null = null;

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
    this.stateHelper = new AppStateHelper('rightsidebar-main');
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
      await this.registerDefaultApps();
      
      // 동적 앱 매니페스트 등록
      this.registerDynamicApps();
      
      // 상태 복원
      this.restoreState();
      
      // 레이아웃 조정
      this.adjustLayout();
      
      this.isInitialized = true;
      console.log('✅ RightSidebar Phase 2 초기화 완료');
      
    } catch (error) {
      console.error('❌ RightSidebar 초기화 실패:', error);
      throw error;
    }
  }

  // ============================================================================
  // 🎨 DOM 렌더링 메서드들 (업데이트됨)
  // ============================================================================

  private render(): void {
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

    const headerBody = header.querySelector('.card__body')!;
    headerBody.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">📱</span>
          <h3 class="text-lg font-semibold">Apps</h3>
          <div class="app-count-badge badge badge--sm badge--primary" id="app-count">
            ${this.appManager.getRegisteredApps().length}
          </div>
        </div>
        <div class="header-actions flex gap-1">
          <button class="refresh-apps btn btn--sm btn--ghost" title="Refresh Apps">🔄</button>
          <button class="rightsidebar__close btn btn--sm btn--ghost" title="Close Sidebar">×</button>
        </div>
      </div>
      
      <!-- 탭 네비게이션 개선 -->
      <div class="tab-navigation">
        <div class="rightsidebar__tabs flex gap-1 overflow-x-auto scrollbar-hidden" id="rightsidebar-tabs">
          <!-- 탭들이 여기에 동적으로 추가됨 -->
        </div>
        <div class="tab-indicators mt-2">
          <div class="flex justify-between items-center text-xs text-gray-500">
            <span class="active-app-info" id="active-app-info">No app selected</span>
            <span class="last-used-info" id="last-used-info"></span>
          </div>
        </div>
      </div>
    `;

    return header;
  }

  private createContent(): HTMLElement {
    const content = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'none',
      className: 'rightsidebar__content flex-1'
    });

    const contentBody = content.querySelector('.card__body')!;
    contentBody.innerHTML = `
      <div class="app-container h-full" id="rightsidebar-app-container">
        <!-- 빈 상태 -->
        <div class="empty-state text-center py-8" id="rightsidebar-empty-state">
          <div class="text-4xl mb-4">📱</div>
          <h3 class="text-lg font-semibold mb-2">No App Selected</h3>
          <p class="text-gray-600 mb-4">Choose an app from the tabs to get started.</p>
          <div class="quick-actions flex gap-2 justify-center">
            <button class="btn btn--sm btn--primary" id="quick-logs">📊 View Logs</button>
            <button class="btn btn--sm btn--primary" id="quick-mcp">🔧 MCP Tools</button>
          </div>
        </div>
        
        <!-- 로딩 상태 -->
        <div class="loading-state hidden" id="rightsidebar-loading-state">
          <div class="loading-indicator"></div>
        </div>
        
        <!-- 앱 콘텐츠 -->
        <div class="app-content hidden" id="rightsidebar-app-content">
          <!-- 활성 앱 콘텐츠가 여기에 로드됨 -->
        </div>
      </div>
    `;

    return content;
  }

  // ============================================================================
  // 🎛️ 이벤트 및 상호작용 처리 (강화됨)
  // ============================================================================

  private setupEventListeners(): void {
    // 기존 이벤트들...
    const resizeHandle = this.element.querySelector('.rightsidebar__resize-handle');
    if (resizeHandle && this.config.resizable) {
      resizeHandle.addEventListener('mousedown', this.handleResizeStart.bind(this));
      resizeHandle.addEventListener('keydown', this.handleKeyboardResize.bind(this));
    }

    // 새로운 이벤트들
    const refreshBtn = this.element.querySelector('.refresh-apps');
    refreshBtn?.addEventListener('click', () => this.refreshApps());

    const closeBtn = this.element.querySelector('.rightsidebar__close');
    closeBtn?.addEventListener('click', () => this.hide());

    // 빈 상태 버튼들
    const quickLogsBtn = this.element.querySelector('#quick-logs');
    quickLogsBtn?.addEventListener('click', () => this.show('enhanced-log-dashboard'));

    const quickMcpBtn = this.element.querySelector('#quick-mcp');
    quickMcpBtn?.addEventListener('click', () => this.show('enhanced-mcp-tools'));

    // 앱 매니저 이벤트
    this.appManager.on('app:registered', this.updateTabs.bind(this));
    this.appManager.on('app:activated', this.handleAppActivation.bind(this));

    // 동적 로딩 이벤트
    eventManager.on('app:loading-state-changed' as any, this.handleLoadingStateChange.bind(this));
    eventManager.on('app:loaded' as any, this.handleAppLoaded.bind(this));
    eventManager.on('app:load-error' as any, this.handleAppLoadError.bind(this));

    // 전역 이벤트
    eventManager.on('rightsidebar:toggle' as any, () => this.toggle());
    eventManager.on('rightsidebar:show' as any, (data: any) => this.show(data?.appId));
    eventManager.on('rightsidebar:hide' as any, () => this.hide());
  }

  private handleLoadingStateChange(data: { appId: string; state: any }): void {
    if (data.state.status === 'loading') {
      this.showLoadingState(data.appId);
    }
  }

  private handleAppLoaded(data: { appId: string; appInfo: AppInfo }): void {
    // 동적으로 로드된 앱을 등록
    this.appManager.registerApp(data.appInfo);
    
    // 현재 활성화 대기 중인 앱이라면 활성화
    if (this.lastActiveApp === data.appId) {
      this.activateApp(data.appId);
    }
  }

  private handleAppLoadError(data: { appId: string; error: any }): void {
    this.showErrorState(data.appId, data.error);
  }

  // ============================================================================
  // 📱 강화된 앱 시스템
  // ============================================================================

  private async registerDefaultApps(): Promise<void> {
    try {
      // 강화된 로그 앱
      const enhancedLogApp = new EnhancedLogApp();
      this.registerApp({
        id: 'enhanced-log-dashboard',
        title: 'System Logs',
        icon: '📊',
        description: 'Advanced system logs with filtering and analysis',
        category: 'system',
        render: () => enhancedLogApp.render()
      });

      // 강화된 MCP 앱
      const enhancedMcpApp = new EnhancedMCPApp();
      this.registerApp({
        id: 'enhanced-mcp-tools',
        title: 'MCP Tools',
        icon: '🔧',
        description: 'Model Context Protocol tools and diagnostics',
        category: 'tools',
        render: () => enhancedMcpApp.render()
      });

      console.log('✅ 기본 앱 등록 완료');
    } catch (error) {
      console.error('❌ 기본 앱 등록 실패:', error);
    }
  }

  private registerDynamicApps(): void {
    // 예시: 동적 앱 매니페스트 등록
    const dynamicApps = [
      {
        id: 'file-explorer',
        name: 'File Explorer',
        version: '1.0.0',
        description: 'Browse and manage files',
        icon: '📁',
        category: 'utility',
        entry: '/apps/file-explorer/index.js',
        lazy: true
      },
      {
        id: 'system-monitor',
        name: 'System Monitor',
        version: '1.0.0',
        description: 'Monitor system resources',
        icon: '📈',
        category: 'monitoring',
        entry: '/apps/system-monitor/index.js',
        lazy: true
      },
      {
        id: 'task-manager',
        name: 'Task Manager',
        version: '1.0.0',
        description: 'Manage running processes',
        icon: '⚙️',
        category: 'system',
        entry: '/apps/task-manager/index.js',
        lazy: true
      }
    ];

    dynamicApps.forEach(manifest => {
      dynamicAppLoader.registerAppManifest(manifest);
    });
  }

  private async loadDynamicApp(appId: string): Promise<void> {
    try {
      this.showLoadingState(appId);
      const appInfo = await dynamicAppLoader.loadApp(appId);
      
      if (appInfo) {
        this.appManager.registerApp(appInfo);
        await this.activateApp(appId);
      } else {
        this.showErrorState(appId, 'Failed to load app');
      }
    } catch (error) {
      this.showErrorState(appId, error);
    }
  }

  // ============================================================================
  // 🎯 강화된 Public API
  // ============================================================================

  public async show(appId?: string): Promise<void> {
    this.isVisible = true;
    this.element.setAttribute('data-visible', 'true');
    this.adjustLayout();
    
    if (appId) {
      await this.activateApp(appId);
    }
    
    this.saveState();
    eventManager.emit('rightsidebar:visibility:change' as any, { visible: true });
  }

  public hide(): void {
    this.isVisible = false;
    this.element.setAttribute('data-visible', 'false');
    this.adjustLayout();
    
    this.saveState();
    eventManager.emit('rightsidebar:visibility:change' as any, { visible: false });
  }

  public async toggle(appId?: string): Promise<void> {
    if (this.isVisible) {
      this.hide();
    } else {
      await this.show(appId);
    }
  }

  public registerApp(appInfo: AppInfo): void {
    this.appManager.registerApp(appInfo);
    this.updateAppCount();
  }

  public async activateApp(appId: string): Promise<void> {
    this.lastActiveApp = appId;
    
    // 동적 앱인지 확인
    const manifest = dynamicAppLoader.getRegisteredManifests().find(m => m.id === appId);
    if (manifest && !this.appManager.getRegisteredApps().find(a => a.id === appId)) {
      await this.loadDynamicApp(appId);
      return;
    }
    
    // 일반 앱 활성화
    await this.appManager.activateApp(appId);
    
    if (!this.isVisible) {
      this.show();
    }
    
    this.updateActiveAppInfo(appId);
    this.saveState();
  }

  // ============================================================================
  // 🔧 UI 업데이트 메서드들
  // ============================================================================

  private updateTabs(): void {
    const tabContainer = document.getElementById('rightsidebar-tabs');
    if (!tabContainer) return;

    const apps = this.appManager.getRegisteredApps();
    const activeAppId = this.appManager.getActiveAppId();

    tabContainer.innerHTML = '';
    
    apps.forEach(app => {
      const isActive = activeAppId === app.id;
      const tab = ComponentFactory.createButton({
        children: `${app.icon || '📱'} ${app.title}`,
        variant: isActive ? 'primary' : 'ghost',
        size: 'sm',
        className: `rightsidebar__tab ${isActive ? 'active' : ''}`,
        onClick: () => this.activateApp(app.id)
      });
      
      // 탭에 추가 정보 표시
      tab.setAttribute('title', `${app.title}\n${app.description || ''}`);
      tab.setAttribute('data-app-id', app.id);
      
      tabContainer.appendChild(tab);
    });

    // 동적 앱 탭 추가
    const dynamicManifests = dynamicAppLoader.getRegisteredManifests();
    dynamicManifests.forEach(manifest => {
      // 이미 로드된 앱은 건너뛰기
      if (apps.find(a => a.id === manifest.id)) return;
      
      const tab = ComponentFactory.createButton({
        children: `${manifest.icon} ${manifest.name}`,
        variant: 'ghost',
        size: 'sm',
        className: 'rightsidebar__tab dynamic-tab',
        onClick: () => this.activateApp(manifest.id)
      });
      
      tab.setAttribute('title', `${manifest.name} (Dynamic)\n${manifest.description}`);
      tab.setAttribute('data-app-id', manifest.id);
      
      tabContainer.appendChild(tab);
    });

    this.updateAppCount();
  }

  private handleAppActivation(data: { appId: string; element: HTMLElement }): void {
    const container = document.getElementById('rightsidebar-app-content');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    
    if (container && emptyState && loadingState) {
      // 상태 변경
      emptyState.classList.add('hidden');
      loadingState.classList.add('hidden');
      container.classList.remove('hidden');
      
      // 기존 앱 제거
      container.innerHTML = '';
      
      // 새 앱 추가
      data.element.className = 'rightsidebar__app h-full overflow-y-auto';
      container.appendChild(data.element);
      
      // 탭 업데이트
      this.updateTabs();
      this.updateActiveAppInfo(data.appId);
    }
  }

  private showLoadingState(appId: string): void {
    const container = document.getElementById('rightsidebar-app-content');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    
    if (container && emptyState && loadingState) {
      emptyState.classList.add('hidden');
      container.classList.add('hidden');
      loadingState.classList.remove('hidden');
      
      // 로딩 인디케이터 생성
      const loadingIndicator = new AppLoadingIndicator(appId);
      loadingState.innerHTML = '';
      loadingState.appendChild(loadingIndicator.getElement());
    }
  }

  private showErrorState(appId: string, error: any): void {
    const container = document.getElementById('rightsidebar-app-content');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    
    if (container && emptyState && loadingState) {
      emptyState.classList.add('hidden');
      loadingState.classList.add('hidden');
      container.classList.remove('hidden');
      
      // 에러 상태 표시
      const errorCard = ComponentFactory.createCard({
        variant: 'flat',
        padding: 'lg',
        className: 'text-center'
      });

      const errorBody = errorCard.querySelector('.card__body')!;
      errorBody.innerHTML = `
        <div class="error-state">
          <div class="text-4xl mb-4">❌</div>
          <h3 class="text-lg font-semibold mb-2 text-red-600">Failed to Load App</h3>
          <p class="text-sm text-gray-600 mb-4">${error.message || error}</p>
          <div class="flex gap-2 justify-center">
            <button class="btn btn--primary retry-btn" data-app-id="${appId}">Retry</button>
            <button class="btn btn--ghost close-btn">Close</button>
          </div>
        </div>
      `;

      container.innerHTML = '';
      container.appendChild(errorCard);

      // 에러 상태 버튼 이벤트
      const retryBtn = container.querySelector('.retry-btn');
      retryBtn?.addEventListener('click', () => {
        this.activateApp(appId);
      });

      const closeBtn = container.querySelector('.close-btn');
      closeBtn?.addEventListener('click', () => {
        this.showEmptyState();
      });
    }
  }

  private showEmptyState(): void {
    const container = document.getElementById('rightsidebar-app-content');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    
    if (container && emptyState && loadingState) {
      container.classList.add('hidden');
      loadingState.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }
    
    this.updateActiveAppInfo(null);
  }

  private updateActiveAppInfo(appId: string | null): void {
    const activeAppInfo = document.getElementById('active-app-info');
    const lastUsedInfo = document.getElementById('last-used-info');
    
    if (activeAppInfo) {
      if (appId) {
        const app = this.appManager.getRegisteredApps().find(a => a.id === appId);
        activeAppInfo.textContent = app ? `Active: ${app.title}` : 'Unknown app';
      } else {
        activeAppInfo.textContent = 'No app selected';
      }
    }
    
    if (lastUsedInfo) {
      const recentApps = appStateManager.getRecentApps(1);
      if (recentApps.length > 0 && recentApps[0] !== appId) {
        const lastUsed = recentApps[0];
        const lastUsedTime = appStateManager.getLastAccessed(lastUsed);
        if (lastUsedTime) {
          const timeAgo = this.formatRelativeTime(lastUsedTime);
          lastUsedInfo.textContent = `Last used: ${lastUsed} (${timeAgo})`;
        }
      } else {
        lastUsedInfo.textContent = '';
      }
    }
  }

  private updateAppCount(): void {
    const appCountBadge = document.getElementById('app-count');
    if (appCountBadge) {
      const totalApps = this.appManager.getRegisteredApps().length + 
                       dynamicAppLoader.getRegisteredManifests().filter(m => 
                         !this.appManager.getRegisteredApps().find(a => a.id === m.id)
                       ).length;
      appCountBadge.textContent = totalApps.toString();
    }
  }

  private refreshApps(): void {
    // 앱 목록 새로고침
    this.updateTabs();
    this.updateAppCount();
    
    // 성공 알림
    const refreshAlert = ComponentFactory.createAlert(
      'Apps refreshed successfully',
      { variant: 'success' }
    );
    
    this.element.appendChild(refreshAlert);
    setTimeout(() => refreshAlert.remove(), 2000);
  }

  // ============================================================================
  // 💾 상태 관리
  // ============================================================================

  private saveState(): void {
    const state = {
      isVisible: this.isVisible,
      currentWidth: this.currentWidth,
      lastActiveApp: this.lastActiveApp,
      activeAppId: this.appManager.getActiveAppId()
    };
    
    this.stateHelper.saveCustomData(state);
  }

  private restoreState(): void {
    const state = this.stateHelper.restoreCustomData();
    
    if (state) {
      if (state.isVisible) {
        this.element.setAttribute('data-visible', 'true');
        this.isVisible = true;
        this.adjustLayout();
      }
      
      if (state.currentWidth) {
        this.currentWidth = state.currentWidth;
        this.element.style.width = `${this.currentWidth}px`;
      }
      
      if (state.lastActiveApp) {
        this.lastActiveApp = state.lastActiveApp;
        // 지연 로드로 앱 복원
        setTimeout(() => {
          if (this.isVisible && this.lastActiveApp) {
            this.activateApp(this.lastActiveApp);
          }
        }, 100);
      }
    }
  }

  // ============================================================================
  // 🔧 유틸리티 메서드들
  // ============================================================================

  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  private handleResizeStart(event: MouseEvent): void {
    if (!this.config.resizable) return;
    
    event.preventDefault();
    this.isResizing = true;
    
    const startX = event.clientX;
    const startWidth = this.currentWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX;
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
      this.saveState();
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
    this.saveState();
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

  // ============================================================================
  // 🎯 Enhanced Public API
  // ============================================================================

  public getAppManager(): AppManager {
    return this.appManager;
  }

  public getStateHelper(): AppStateHelper {
    return this.stateHelper;
  }

  public getActiveAppId(): string | null {
    return this.appManager.getActiveAppId();
  }

  public getRegisteredApps(): AppInfo[] {
    return this.appManager.getRegisteredApps();
  }

  public getDynamicApps(): any[] {
    return dynamicAppLoader.getRegisteredManifests();
  }

  public getRecentApps(limit: number = 5): string[] {
    return appStateManager.getRecentApps(limit);
  }

  public isAppLoaded(appId: string): boolean {
    return this.appManager.getRegisteredApps().some(app => app.id === appId);
  }

  public async preloadApp(appId: string): Promise<void> {
    await dynamicAppLoader.loadApp(appId);
  }

  public unloadApp(appId: string): void {
    dynamicAppLoader.unloadApp(appId);
    // 앱 매니저에서도 제거 필요시 구현
  }

  public clearAppStates(): void {
    appStateManager.clearAllStates();
  }

  public destroy(): void {
    // 상태 저장
    this.saveState();
    
    // 앱 매니저 정리
    this.appManager.destroy();
    
    // 상태 관리자 정리
    appStateManager.destroy();
    
    // 레이아웃 복원
    this.adjustLayout();
    
    console.log('RightSidebar destroyed');
  }
}