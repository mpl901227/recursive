/**
 * @fileoverview MainContent Component
 * @description 메인 콘텐츠 영역을 관리하는 컴포넌트
 * @version 2.0.0
 */

// SCSS 스타일 import
import './MainContent.scss';

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { RouteContext } from '../../../core/router.js';
import { ComponentProps } from '../../../types/index.js';

/**
 * MainContent 컴포넌트 속성
 */
export interface MainContentProps extends ComponentProps {
  /** 기본 콘텐츠 */
  defaultContent?: string;
  /** 로딩 메시지 */
  loadingMessage?: string;
  /** 에러 메시지 */
  errorMessage?: string;
  /** 라우터 연동 활성화 */
  enableRouting?: boolean;
  /** 애니메이션 활성화 */
  enableAnimations?: boolean;
  /** 스크롤 복원 */
  restoreScroll?: boolean;
}

/**
 * 콘텐츠 유형
 */
export type ContentType = 'html' | 'text' | 'component' | 'external';

/**
 * 콘텐츠 로더 함수
 */
export type ContentLoader = () => Promise<string | HTMLElement>;

/**
 * 로딩 상태
 */
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * MainContent DOM 요소들
 */
interface MainContentElements {
  container: HTMLElement | null;
  content: HTMLElement | null;
  loadingOverlay: HTMLElement | null;
  errorContainer: HTMLElement | null;
  breadcrumb: HTMLElement | null;
}

/**
 * 에러 정보
 */
interface ErrorInfo {
  message: string;
  stack?: string;
  timestamp: number;
  context?: string;
}

/**
 * 메인 콘텐츠 컴포넌트
 * 
 * @example
 * ```typescript
 * const mainContent = new MainContent('#main-content', {
 *   enableRouting: true,
 *   enableAnimations: true,
 *   defaultContent: '<h1>Welcome to Recursive</h1>'
 * }, eventManager);
 * 
 * // 콘텐츠 로드
 * await mainContent.loadContent('<div>New Content</div>');
 * 
 * // 컴포넌트 로드
 * await mainContent.loadComponent('Dashboard');
 * ```
 */
export class MainContent extends BaseComponent<HTMLElement, MainContentProps> {
  private elements: MainContentElements = {
    container: null,
    content: null,
    loadingOverlay: null,
    errorContainer: null,
    breadcrumb: null
  };

  private currentRoute: RouteContext | null = null;
  private loadingState: LoadingState = 'idle';
  private contentHistory: string[] = [];
  private scrollPositions = new Map<string, number>();
  private contentLoaders = new Map<string, ContentLoader>();
  private errorInfo: ErrorInfo | null = null;

  constructor(
    element: HTMLElement | string,
    props: MainContentProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: MainContentProps = {
      defaultContent: '<div class="welcome-message"><h1>Welcome to Recursive</h1><p>Select an option from the sidebar to get started.</p></div>',
      loadingMessage: 'Loading content...',
      errorMessage: 'Failed to load content',
      enableRouting: true,
      enableAnimations: true,
      restoreScroll: true,
      ...props
    };

    super(element, defaultProps, eventManager);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    
    this.setupRouter();
    this.setupEventListeners();
    this.restoreState();
    this.initializeBreadcrumb();

    console.info('MainContent component initialized');
  }

  render(): void {
    this.element.innerHTML = `
      <div class="main-content-container">
        <!-- Breadcrumb Navigation -->
        <nav class="breadcrumb" id="breadcrumb" aria-label="Breadcrumb navigation">
          <ol class="breadcrumb-list"></ol>
        </nav>

        <!-- Main Content Area -->
        <main class="content-area" id="contentArea" role="main">
          ${this.props.defaultContent || ''}
        </main>

        <!-- Loading Overlay -->
        <div class="loading-overlay hidden" id="loadingOverlay" role="status" aria-live="polite">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <span class="loading-message">${this.props.loadingMessage}</span>
          </div>
        </div>

        <!-- Error Container -->
        <div class="error-container hidden" id="errorContainer" role="alert" aria-live="assertive">
          <div class="error-content">
            <div class="error-icon">⚠️</div>
            <div class="error-details">
              <h3 class="error-title">Content Load Error</h3>
              <p class="error-message"></p>
              <div class="error-actions">
                <button class="btn-retry" id="retryBtn">Retry</button>
                <button class="btn-reload" id="reloadBtn">Reload Page</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.findDOMElements();
  }

  private findDOMElements(): void {
    this.elements.container = this.element.querySelector('.main-content-container');
    this.elements.content = this.element.querySelector('#contentArea');
    this.elements.loadingOverlay = this.element.querySelector('#loadingOverlay');
    this.elements.errorContainer = this.element.querySelector('#errorContainer');
    this.elements.breadcrumb = this.element.querySelector('#breadcrumb');
  }

  private setupRouter(): void {
    if (!this.props.enableRouting) return;

    // Router는 Application에서 주입받거나 전역에서 가져올 수 있습니다
    // 여기서는 이벤트를 통해 라우터와 통신합니다
    this.addEventListener('router:navigation', this.handleRouteChange.bind(this));
    this.addEventListener('router:before-navigate', this.handleBeforeNavigate.bind(this));
  }

  private setupEventListeners(): void {
    // Window 이벤트
    this.addDOMEventListener(window, 'beforeunload', this.handleBeforeUnload.bind(this));
    this.addDOMEventListener(window, 'popstate', this.handlePopState.bind(this) as EventListener);

    // 에러 관련 이벤트
    const retryBtn = this.element.querySelector('#retryBtn');
    const reloadBtn = this.element.querySelector('#reloadBtn');

    if (retryBtn) {
      this.addDOMEventListener(retryBtn, 'click', this.handleRetry.bind(this));
    }

    if (reloadBtn) {
      this.addDOMEventListener(reloadBtn, 'click', this.handleReload.bind(this));
    }

    // Global events
    this.addEventListener('content:load', this.handleContentLoad.bind(this));
    this.addEventListener('content:error', this.handleContentError.bind(this));
    this.addEventListener('sidebar:selection', this.handleSidebarSelection.bind(this));
    this.addEventListener('ai-sidebar:request', this.handleAIRequest.bind(this));
  }

  // =============================================================================
  // 콘텐츠 로딩 메서드
  // =============================================================================

  /**
   * HTML 콘텐츠를 로드합니다
   */
  async loadContent(content: string, type: ContentType = 'html'): Promise<void> {
    try {
      this.setLoadingState('loading');
      this.hideError();

      await this.performContentLoad(content, type);
      
      this.setLoadingState('loaded');
      this.addToHistory(content);
      
      // 콘텐츠 로드 이벤트 발생
      this.emit('content:loaded', { content, type });

    } catch (error) {
      this.handleLoadError(error as Error);
    }
  }

  /**
   * 외부 URL에서 콘텐츠를 로드합니다
   */
  async loadFromURL(url: string): Promise<void> {
    try {
      this.setLoadingState('loading');
      this.hideError();

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      await this.performContentLoad(content, 'html');
      
      this.setLoadingState('loaded');
      this.addToHistory(content);

      this.emit('content:loaded', { content, type: 'external', url });

    } catch (error) {
      this.handleLoadError(error as Error, `Failed to load content from ${url}`);
    }
  }

  /**
   * 컴포넌트를 로드합니다
   */
  async loadComponent(componentName: string, props?: any): Promise<void> {
    try {
      this.setLoadingState('loading');
      this.hideError();

      // 컴포넌트 로더 실행
      const loader = this.contentLoaders.get(componentName);
      if (!loader) {
        throw new Error(`Component loader not found: ${componentName}`);
      }

      const result = await loader();
      
      if (typeof result === 'string') {
        await this.performContentLoad(result, 'component');
      } else if (result instanceof HTMLElement) {
        await this.performElementLoad(result);
      }

      this.setLoadingState('loaded');
      this.emit('component:loaded', { componentName, props });

    } catch (error) {
      this.handleLoadError(error as Error, `Failed to load component: ${componentName}`);
    }
  }

  /**
   * 콘텐츠 로더를 등록합니다
   */
  registerContentLoader(name: string, loader: ContentLoader): void {
    this.contentLoaders.set(name, loader);
  }

  /**
   * 콘텐츠 로더를 제거합니다
   */
  unregisterContentLoader(name: string): boolean {
    return this.contentLoaders.delete(name);
  }

  // =============================================================================
  // 라우터 연동 메서드
  // =============================================================================

  private async handleRouteChange(event: CustomEvent): Promise<void> {
    const { route } = event.detail;
    this.currentRoute = route;

    try {
      await this.loadRouteContent(route);
      this.updateBreadcrumb(route);
    } catch (error) {
      this.handleLoadError(error as Error, `Failed to load route: ${route.path}`);
    }
  }

  private async handleBeforeNavigate(event: CustomEvent): Promise<void> {
    // event.detail.payload에서 to, from을 가져옴
    const payload = event.detail?.payload || {};
    const { to: _to, from } = payload;
    
    // 스크롤 위치 저장
    if (from && this.props.restoreScroll) {
      this.saveScrollPosition(from.path);
    }
  }

  private async loadRouteContent(route: RouteContext): Promise<void> {
    // 라우트별 콘텐츠 로딩 로직
    const contentLoader = this.contentLoaders.get(route.path);
    
    if (contentLoader) {
      const content = await contentLoader();
      if (typeof content === 'string') {
        await this.performContentLoad(content, 'component');
      } else {
        await this.performElementLoad(content);
      }
    } else {
      // 기본 라우트 처리
      await this.loadDefaultRouteContent(route);
    }

    // 스크롤 위치 복원
    if (this.props.restoreScroll) {
      this.restoreScrollPosition(route.path);
    }
  }

  private async loadDefaultRouteContent(route: RouteContext): Promise<void> {
    const content = `
      <div class="route-content">
        <h1>Route: ${route.path}</h1>
        <p>This is the default content for the route.</p>
        <pre>${JSON.stringify(route, null, 2)}</pre>
      </div>
    `;
    
    await this.performContentLoad(content, 'html');
  }

  // =============================================================================
  // 로딩 상태 관리
  // =============================================================================

  private setLoadingState(state: LoadingState): void {
    this.loadingState = state;

    switch (state) {
      case 'loading':
        this.showLoading();
        break;
      case 'loaded':
        this.hideLoading();
        break;
      case 'error':
        this.hideLoading();
        this.showError();
        break;
      case 'idle':
        this.hideLoading();
        this.hideError();
        break;
    }

    this.emit('loading-state:changed', { state });
  }

  private showLoading(): void {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.remove('hidden');
      this.elements.loadingOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  private hideLoading(): void {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.loadingOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  // =============================================================================
  // 에러 처리
  // =============================================================================

  private showError(message?: string): void {
    if (!this.elements.errorContainer) return;

    const errorMessage = this.elements.errorContainer.querySelector('.error-message');
    if (errorMessage) {
      errorMessage.textContent = message || this.errorInfo?.message || this.props.errorMessage || 'An error occurred';
    }

    this.elements.errorContainer.classList.remove('hidden');
    this.elements.errorContainer.setAttribute('aria-hidden', 'false');
  }

  private hideError(): void {
    if (this.elements.errorContainer) {
      this.elements.errorContainer.classList.add('hidden');
      this.elements.errorContainer.setAttribute('aria-hidden', 'true');
    }
    this.errorInfo = null;
  }

  private handleLoadError(error: Error, context?: string): void {
    this.errorInfo = {
      message: error.message,
      ...(error.stack && { stack: error.stack }),
      timestamp: Date.now(),
      ...(context && { context })
    };

    this.setLoadingState('error');
    
    // 에러 로깅
    console.error('MainContent load error:', this.errorInfo);
    
    // 에러 이벤트 발생
    this.emit('content:error', this.errorInfo);
  }

  private async handleRetry(): Promise<void> {
    if (this.currentRoute) {
      await this.loadRouteContent(this.currentRoute);
    } else if (this.contentHistory.length > 0) {
      const lastContent = this.contentHistory[this.contentHistory.length - 1];
      if (lastContent) {
        await this.loadContent(lastContent);
      }
    }
  }

  private handleReload(): void {
    window.location.reload();
  }

  // =============================================================================
  // 콘텐츠 처리 헬퍼 메서드
  // =============================================================================

  private async performContentLoad(content: string, _type: ContentType): Promise<void> {
    if (!this.elements.content) {
      throw new Error('Content area not found');
    }

    if (this.props.enableAnimations) {
      await this.animateContentChange(() => {
        this.elements.content!.innerHTML = content;
      });
    } else {
      this.elements.content.innerHTML = content;
    }

    // 스크립트 태그 실행
    this.executeScripts(this.elements.content);
  }

  private async performElementLoad(element: HTMLElement): Promise<void> {
    if (!this.elements.content) {
      throw new Error('Content area not found');
    }

    if (this.props.enableAnimations) {
      await this.animateContentChange(() => {
        this.elements.content!.innerHTML = '';
        this.elements.content!.appendChild(element);
      });
    } else {
      this.elements.content.innerHTML = '';
      this.elements.content.appendChild(element);
    }
  }

  private async animateContentChange(changeCallback: () => void): Promise<void> {
    if (!this.elements.content) return;

    // Fade out
    this.elements.content.style.opacity = '0';
    this.elements.content.style.transform = 'translateY(10px)';

    await new Promise(resolve => setTimeout(resolve, 150));

    // Content change
    changeCallback();

    // Fade in
    this.elements.content.style.opacity = '1';
    this.elements.content.style.transform = 'translateY(0)';
  }

  private executeScripts(container: HTMLElement): void {
    const scripts = container.querySelectorAll('script');
    
    scripts.forEach(script => {
      if (script.src) {
        // 외부 스크립트
        const newScript = document.createElement('script');
        newScript.src = script.src;
        newScript.async = true;
        newScript.onerror = (error) => {
          console.error('Failed to load external script:', script.src, error);
        };
        document.head.appendChild(newScript);
      } else {
        // 인라인 스크립트 - eval 대신 안전한 방식 사용
        try {
          const scriptContent = script.textContent || '';
          if (scriptContent.trim()) {
            // Function constructor 사용 (더 안전함)
            const scriptFunction = new Function(scriptContent);
            scriptFunction();
          }
        } catch (error) {
          console.error('Script execution error:', error);
        }
      }
    });
  }

  // =============================================================================
  // 히스토리 및 상태 관리
  // =============================================================================

  private addToHistory(content: string): void {
    this.contentHistory.push(content);
    
    // 히스토리 크기 제한 (최대 50개)
    if (this.contentHistory.length > 50) {
      this.contentHistory.shift();
    }
  }

  private saveScrollPosition(path: string): void {
    if (this.elements.content) {
      this.scrollPositions.set(path, this.elements.content.scrollTop);
    }
  }

  private restoreScrollPosition(path: string): void {
    const position = this.scrollPositions.get(path);
    if (position !== undefined && this.elements.content) {
      setTimeout(() => {
        this.elements.content!.scrollTop = position;
      }, 100);
    }
  }

  private restoreState(): void {
    // 세션 스토리지에서 상태 복원
    try {
      const savedState = sessionStorage.getItem('mainContent.state');
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.scrollPositions) {
          this.scrollPositions = new Map(state.scrollPositions);
        }
      }
    } catch (error) {
      console.warn('Failed to restore MainContent state:', error);
    }
  }

  private saveState(): void {
    // 세션 스토리지에 상태 저장
    try {
      const state = {
        scrollPositions: Array.from(this.scrollPositions.entries())
      };
      sessionStorage.setItem('mainContent.state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save MainContent state:', error);
    }
  }

  // =============================================================================
  // 브레드크럼 관리
  // =============================================================================

  /**
   * 기본 브레드크럼 초기화
   */
  private initializeBreadcrumb(): void {
    if (!this.elements.breadcrumb) return;

    const breadcrumbList = this.elements.breadcrumb.querySelector('.breadcrumb-list');
    if (!breadcrumbList) return;

    // 기본 홈 브레드크럼 설정
    breadcrumbList.innerHTML = `
      <li class="breadcrumb-item active">
        <span aria-current="page">대시보드</span>
      </li>
    `;

    console.log('✅ Breadcrumb 초기화 완료');
  }

  private updateBreadcrumb(route: RouteContext): void {
    if (!this.elements.breadcrumb) return;

    const breadcrumbList = this.elements.breadcrumb.querySelector('.breadcrumb-list');
    if (!breadcrumbList) return;

    const pathSegments = route.path.split('/').filter(segment => segment);
    const items = ['홈', ...pathSegments.map(segment => 
      segment.charAt(0).toUpperCase() + segment.slice(1)
    )];

    breadcrumbList.innerHTML = items.map((item, index) => {
      const isLast = index === items.length - 1;
      const path = index === 0 ? '/' : '/' + pathSegments.slice(0, index).join('/');
      
      return `
        <li class="breadcrumb-item ${isLast ? 'active' : ''}">
          ${isLast ? 
            `<span aria-current="page">${item}</span>` :
            `<a href="${path}">${item}</a>`
          }
        </li>
      `;
    }).join('');

    console.log('🍞 Breadcrumb 업데이트:', items.join(' > '));
  }

  // =============================================================================
  // 이벤트 핸들러
  // =============================================================================

  private handleBeforeUnload(): void {
    this.saveState();
  }

  private handlePopState(_event: PopStateEvent): void {
    // 브라우저 뒤로가기/앞으로가기 처리
    if (this.props.enableRouting) {
      this.emit('router:navigate', { path: window.location.pathname });
    }
  }

  private async handleContentLoad(event: CustomEvent): Promise<void> {
    const { content, type } = event.detail;
    await this.loadContent(content, type);
  }

  private handleContentError(event: CustomEvent): void {
    const { error, context } = event.detail;
    this.handleLoadError(error, context);
  }

  private async handleSidebarSelection(event: CustomEvent): Promise<void> {
    const { selection } = event.detail;
    
    // 사이드바 선택에 따른 콘텐츠 로드
    const loader = this.contentLoaders.get(selection);
    if (loader) {
      await this.loadComponent(selection);
    } else {
      // 기본 콘텐츠 생성
      const content = `
        <div class="sidebar-selection-content">
          <h1>${selection}</h1>
          <p>Content for ${selection} will be loaded here.</p>
        </div>
      `;
      await this.loadContent(content);
    }
  }

  private async handleAIRequest(event: CustomEvent): Promise<void> {
    const { request } = event.detail;
    
    // AI 요청에 대한 응답 표시
    const content = `
      <div class="ai-response-content">
        <h2>AI Response</h2>
        <div class="request-info">
          <strong>Request:</strong> ${request}
        </div>
        <div class="response-area">
          <p>Processing your request...</p>
        </div>
      </div>
    `;
    
    await this.loadContent(content);
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * 현재 로딩 상태를 반환합니다
   */
  getLoadingState(): LoadingState {
    return this.loadingState;
  }

  /**
   * 현재 라우트를 반환합니다
   */
  getCurrentRoute(): RouteContext | null {
    return this.currentRoute;
  }

  /**
   * 콘텐츠 영역을 클리어합니다
   */
  clearContent(): void {
    if (this.elements.content) {
      this.elements.content.innerHTML = '';
    }
    this.hideError();
    this.setLoadingState('idle');
  }

  /**
   * 마지막 에러 정보를 반환합니다
   */
  getLastError(): ErrorInfo | null {
    return this.errorInfo;
  }

  /**
   * 콘텐츠 히스토리를 반환합니다
   */
  getContentHistory(): string[] {
    return [...this.contentHistory];
  }

  async destroy(): Promise<void> {
    this.saveState();
    this.contentLoaders.clear();
    this.scrollPositions.clear();
    this.contentHistory.length = 0;
    
    await super.destroy();
  }
} 