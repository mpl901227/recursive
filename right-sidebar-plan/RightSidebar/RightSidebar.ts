// ============================================
// RightSidebar V2 - Phase 2 강화 업데이트
// ============================================

import { ComponentFactory } from '../../../utils/component-factory.ts';
import { domManager } from '../../../core/DOMManager.ts';
import { eventManager } from '../../../core/EventManager.ts';
import { AppManager } from './AppManager.ts';
import { EnhancedLogApp } from './EnhancedLogApp.ts';
import { EnhancedMCPApp } from './EnhancedMCPApp.ts';
import { appStateManager, AppStateHelper } from './AppStateManager.ts';
import { dynamicAppLoader, AppLoadingIndicator } from './DynamicAppLoader.ts';
import type { RightSidebarConfig, AppInfo } from './types.ts';
import { EnhancedResizeSystem } from './EnhancedResizeSystem.ts';
import { KeyboardNavigationSystem } from './KeyboardNavigationSystem.ts';
import { AccessibilitySystem } from './AccessibilitySystem.ts';
import { PerformanceOptimizer } from './PerformanceOptimizer.ts';

export class RightSidebar {
  private config: RightSidebarConfig;
  private element: HTMLElement;
  private appManager: AppManager;
  private isInitialized = false;
  private isVisible = false;
  private currentWidth: number;
  private stateHelper: AppStateHelper;
  private lastActiveApp: string | null = null;

  // Phase 3 시스템들
  private resizeSystem!: EnhancedResizeSystem;
  private keyboardNav!: KeyboardNavigationSystem;
  private accessibility!: AccessibilitySystem;
  private performance!: PerformanceOptimizer;

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
      
      // Phase 3 시스템들 초기화
      this.resizeSystem = new EnhancedResizeSystem(this.element, {
        minWidth: this.config.minWidth!,
        maxWidth: this.config.maxWidth!,
        snapPoints: [280, 320, 400, 500],
        enableSnapping: true,
        showPreview: true
      });

      this.keyboardNav = new KeyboardNavigationSystem(this.element);
      
      this.accessibility = new AccessibilitySystem(this.element, {
        enableScreenReader: true,
        announceStateChanges: true
      });

      this.performance = new PerformanceOptimizer(this.element, {
        enableVirtualScrolling: true,
        enableLazyLoading: true,
        enableMemoization: true,
        maxCachedApps: 5
      });

      // 리사이즈 콜백 연결
      this.resizeSystem.onResize((width: number) => {
        this.currentWidth = width;
        this.adjustLayout();
        this.saveState();
      });
      
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
      console.log('✅ RightSidebar Phase 3 초기화 완료');
      
    } catch (error) {
      console.error('❌ RightSidebar 초기화 실패:', error);
      throw error;
    }
  }

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

  private setupEventListeners(): void {
    // 리사이즈 핸들 이벤트
    const resizeHandle = this.element.querySelector('.rightsidebar__resize-handle');
    if (resizeHandle && this.config.resizable) {
      resizeHandle.addEventListener('mousedown', (event: Event) => {
        this.handleResizeStart(event as MouseEvent);
      });
      resizeHandle.addEventListener('keydown', (event: Event) => {
        this.handleKeyboardResize(event as KeyboardEvent);
      });
    }

    // 새로고침 버튼
    const refreshBtn = this.element.querySelector('.refresh-apps');
    refreshBtn?.addEventListener('click', () => this.refreshApps());

    // 닫기 버튼
    const closeBtn = this.element.querySelector('.rightsidebar__close');
    closeBtn?.addEventListener('click', () => this.hide());

    // 빈 상태 버튼들
    const quickLogsBtn = this.element.querySelector('#quick-logs');
    quickLogsBtn?.addEventListener('click', () => this.show('enhanced-log-dashboard'));

    const quickMcpBtn = this.element.querySelector('#quick-mcp');
    quickMcpBtn?.addEventListener('click', () => this.show('enhanced-mcp-tools'));

    // 앱 로딩 상태 변경 이벤트
    eventManager.on('app:loading:state:change' as any, this.handleLoadingStateChange.bind(this));
    eventManager.on('app:loaded' as any, this.handleAppLoaded.bind(this));
    eventManager.on('app:load-error' as any, this.handleAppLoadError.bind(this));
  }

  private handleLoadingStateChange(data: { appId: string; state: any }): void {
    if (data.appId === this.lastActiveApp) {
      this.showLoadingState(data.appId);
    }
  }

  private handleAppLoaded(data: { appId: string; appInfo: AppInfo }): void {
    if (data.appId === this.lastActiveApp) {
      this.activateApp(data.appId);
    }
  }

  private handleAppLoadError(data: { appId: string; error: any }): void {
    if (data.appId === this.lastActiveApp) {
      this.showErrorState(data.appId, data.error);
    }
  }

  private async registerDefaultApps(): Promise<void> {
    // 로그 앱 등록
    this.registerApp({
      id: 'enhanced-log-dashboard',
      title: 'Logs',
      icon: '📊',
      description: 'System logs and monitoring',
      category: 'system',
      render: () => new EnhancedLogApp().render()
    });

    // MCP 도구 앱 등록
    this.registerApp({
      id: 'enhanced-mcp-tools',
      title: 'MCP Tools',
      icon: '🔧',
      description: 'Model Context Protocol tools',
      category: 'tools',
      render: () => new EnhancedMCPApp().render()
    });
  }

  private registerDynamicApps(): void {
    // 이미 구현된 앱들을 직접 등록
    console.log('📱 구현된 앱들을 등록합니다...');
    
    // 동적 앱 로딩 대신 직접 클래스 임포트 및 등록 사용
    this.registerBuiltInApps();
  }

  private async registerBuiltInApps(): Promise<void> {
    try {
      // EnhancedLogApp 등록
      const { EnhancedLogApp } = await import('./EnhancedLogApp.ts');
      const logApp = new EnhancedLogApp();
      
      this.registerApp({
        id: 'enhanced-log-dashboard',
        title: 'Enhanced Log Dashboard',
        description: 'Advanced log analysis and monitoring',
        icon: '📊',
        category: 'analysis',
        render: () => logApp.render()
      });

      // EnhancedMCPApp 등록
      const { EnhancedMCPApp } = await import('./EnhancedMCPApp.ts');
      const mcpApp = new EnhancedMCPApp();
      
      this.registerApp({
        id: 'enhanced-mcp-tools',
        title: 'Enhanced MCP Tools',
        description: 'Advanced MCP tool management',
        icon: '🔧',
        category: 'tools',
        render: () => mcpApp.render()
      });

      console.log('📱 App registered: enhanced-log-dashboard');
      console.log('📱 App registered: enhanced-mcp-tools');
      
    } catch (error) {
      console.error('❌ 빌트인 앱 등록 실패:', error);
    }
  }

  private async loadDynamicApp(appId: string): Promise<void> {
    this.showLoadingState(appId);

    try {
      const appInfo = await dynamicAppLoader.loadApp(appId);
      if (appInfo) {
        this.registerApp(appInfo);
        await this.activateApp(appId);
      } else {
        throw new Error('Failed to load app');
      }
    } catch (error) {
      this.showErrorState(appId, error);
    }
  }

  public async show(appId?: string): Promise<void> {
    this.isVisible = true;
    this.element.setAttribute('data-visible', 'true');
    this.adjustLayout();
    
    if (appId) {
      await this.activateApp(appId);
    }
    
    eventManager.emit('rightsidebar:visibility:change' as any, { visible: true });
  }

  public hide(): void {
    this.isVisible = false;
    this.element.setAttribute('data-visible', 'false');
    this.adjustLayout();
    
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
    this.updateTabs();
  }

  public async activateApp(appId: string): Promise<void> {
    const app = this.appManager.getRegisteredApps().find(a => a.id === appId);
    
    if (!app) {
      // 동적 앱 로드 시도
      await this.loadDynamicApp(appId);
      return;
    }

    try {
      const element = await app.render();
      this.handleAppActivation({ appId, element });
      this.lastActiveApp = appId;
      
      // 상태 저장
      this.stateHelper.saveCustomData({ lastActiveApp: appId });
      
    } catch (error) {
      console.error(`앱 활성화 실패: ${appId}`, error);
      this.showErrorState(appId, error);
    }
  }

  private updateTabs(): void {
    const tabContainer = document.getElementById('rightsidebar-tabs');
    if (!tabContainer) return;

    const apps = this.appManager.getRegisteredApps();
    const activeAppId = this.lastActiveApp;

    tabContainer.innerHTML = apps.map(app => `
      <button class="tab-button btn btn--sm ${activeAppId === app.id ? 'btn--primary' : 'btn--ghost'}"
              data-app-id="${app.id}"
              title="${app.description || app.title}">
        <span class="tab-icon">${app.icon}</span>
        <span class="tab-title">${app.title}</span>
      </button>
    `).join('');

    // 탭 클릭 이벤트 리스너
    tabContainer.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const buttonElement = (e.target as HTMLElement).closest('.tab-button') as HTMLElement;
        const appId = buttonElement?.dataset.appId;
        if (appId) this.activateApp(appId);
      });
    });

    this.updateAppCount();
  }

  private handleAppActivation(data: { appId: string; element: HTMLElement }): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    const appContent = document.getElementById('rightsidebar-app-content');
    
    if (container && emptyState && loadingState && appContent) {
      // 모든 상태 숨기기
      emptyState.classList.add('hidden');
      loadingState.classList.add('hidden');
      
      // 앱 콘텐츠 표시
      appContent.classList.remove('hidden');
      appContent.innerHTML = '';
      appContent.appendChild(data.element);
      
      // 탭 및 상태 업데이트
      this.updateTabs();
      this.updateActiveAppInfo(data.appId);
    }
  }

  private showLoadingState(appId: string): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    const appContent = document.getElementById('rightsidebar-app-content');
    
    if (container && emptyState && loadingState && appContent) {
      emptyState.classList.add('hidden');
      appContent.classList.add('hidden');
      loadingState.classList.remove('hidden');
      
      const loadingIndicator = new AppLoadingIndicator(appId);
      loadingState.innerHTML = '';
      loadingState.appendChild(loadingIndicator.getElement());
    }
  }

  private showErrorState(appId: string, error: any): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    const appContent = document.getElementById('rightsidebar-app-content');
    
    if (container && emptyState && loadingState && appContent) {
      emptyState.classList.add('hidden');
      loadingState.classList.add('hidden');
      appContent.classList.remove('hidden');
      
      appContent.innerHTML = `
        <div class="error-state text-center py-8">
          <div class="text-4xl mb-4">❌</div>
          <h3 class="text-lg font-semibold mb-2">App Error</h3>
          <p class="text-red-600 mb-4">${error instanceof Error ? error.message : 'Unknown error'}</p>
          <div class="error-actions flex gap-2 justify-center">
            <button class="btn btn--sm btn--primary retry-app" data-app-id="${appId}">
              Try Again
            </button>
            <button class="btn btn--sm btn--ghost close-error">
              Close
            </button>
          </div>
        </div>
      `;
      
      // 에러 상태 버튼 이벤트 리스너
      const retryBtn = appContent.querySelector('.retry-app');
      retryBtn?.addEventListener('click', () => this.activateApp(appId));
      
      const closeBtn = appContent.querySelector('.close-error');
      closeBtn?.addEventListener('click', () => this.showEmptyState());
    }
  }

  private showEmptyState(): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    const loadingState = document.getElementById('rightsidebar-loading-state');
    const appContent = document.getElementById('rightsidebar-app-content');
    
    if (container && emptyState && loadingState && appContent) {
      emptyState.classList.remove('hidden');
      loadingState.classList.add('hidden');
      appContent.classList.add('hidden');
      this.lastActiveApp = null;
      this.updateActiveAppInfo(null);
    }
  }

  private updateActiveAppInfo(appId: string | null): void {
    const activeAppInfo = document.getElementById('active-app-info');
    const lastUsedInfo = document.getElementById('last-used-info');
    
    if (activeAppInfo && lastUsedInfo) {
      if (appId) {
        const app = this.appManager.getRegisteredApps().find(a => a.id === appId);
        if (app) {
          activeAppInfo.textContent = `Active: ${app.title}`;
          
          const lastAccessed = appStateManager.getLastAccessed(appId);
          if (lastAccessed) {
            lastUsedInfo.textContent = `Last used: ${this.formatRelativeTime(lastAccessed)}`;
          } else {
            lastUsedInfo.textContent = '';
          }
        }
      } else {
        activeAppInfo.textContent = 'No app selected';
        lastUsedInfo.textContent = '';
      }
    }
  }

  private updateAppCount(): void {
    const appCount = document.getElementById('app-count');
    if (appCount) {
      const count = this.appManager.getRegisteredApps().length;
      appCount.textContent = count.toString();
    }
  }

  private refreshApps(): void {
    // 현재 활성 앱 새로고침
    if (this.lastActiveApp) {
      this.activateApp(this.lastActiveApp);
    }
    
    // 동적 앱 매니페스트 다시 로드
    this.registerDynamicApps();
    
    // 탭 업데이트
    this.updateTabs();
  }

  private saveState(): void {
    this.stateHelper.saveCustomData({
      lastActiveApp: this.lastActiveApp,
      width: this.currentWidth,
      visible: this.isVisible
    });
  }

  private restoreState(): void {
    const state = this.stateHelper.restoreCustomData();
    if (state) {
      this.currentWidth = state.width || this.config.initialWidth!;
      this.isVisible = state.visible || false;
      
      if (state.lastActiveApp) {
        this.activateApp(state.lastActiveApp);
      }
    }
  }

  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  private handleResizeStart(event: MouseEvent): void {
    if (!this.config.resizable) return;
    
    event.preventDefault();
    
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
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // 상태 저장
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

  public getAppManager(): AppManager {
    return this.appManager;
  }

  public getStateHelper(): AppStateHelper {
    return this.stateHelper;
  }

  public getActiveAppId(): string | null {
    return this.lastActiveApp;
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
    return dynamicAppLoader.getLoadingState(appId)?.status === 'loaded';
  }

  public async preloadApp(appId: string): Promise<void> {
    await dynamicAppLoader.loadApp(appId);
  }

  public unloadApp(appId: string): void {
    dynamicAppLoader.unloadApp(appId);
  }

  public clearAppStates(): void {
    appStateManager.clearAllStates();
  }

  public destroy(): void {
    this.appManager.destroy();
    this.stateHelper.clearState();
    dynamicAppLoader.destroy();
    this.adjustLayout();

    // Phase 3 시스템들 정리
    this.resizeSystem.destroy();
    this.keyboardNav.destroy();
    this.accessibility.destroy();
    this.performance.destroy();

    console.log('RightSidebar destroyed');
  }

  // Phase 3 Public API 추가
  public getPerformanceReport() {
    return this.performance.generatePerformanceReport();
  }

  public enableAccessibilityFeature(feature: string, enabled: boolean = true) {
    this.accessibility.toggleFeature(feature, enabled);
  }

  public optimizePerformance() {
    this.performance.optimizeNow();
  }
}