/**
 * @fileoverview 라우터 시스템 구현
 * @description SPA 라우팅을 위한 클라이언트 사이드 라우터 (동적 import 지원)
 * @version 2.0.0
 */

import type { 
  EventData, 
  EventManager 
} from '../types/index.js';

/**
 * 라우트 매개변수 타입
 */
export interface RouteParams {
  [key: string]: string;
}

/**
 * 쿼리 파라미터 타입
 */
export interface QueryParams {
  [key: string]: string | string[];
}

/**
 * 라우트 컨텍스트
 */
export interface RouteContext {
  path: string;
  params: RouteParams;
  query: QueryParams;
  hash: string;
  state?: any;
}

/**
 * 라우트 핸들러 타입
 */
export type RouteHandler = (context: RouteContext) => Promise<void> | void;

/**
 * 🎯 Phase 5.2: 동적 import를 위한 지연 로딩 핸들러 타입
 */
export type LazyRouteHandler = () => Promise<{
  default: RouteHandler;
} | RouteHandler>;

/**
 * 라우트 가드 타입
 */
export type RouteGuard = (
  to: RouteContext,
  from: RouteContext | null
) => Promise<boolean> | boolean;

/**
 * 라우트 정의 (동적 import 지원)
 */
export interface Route {
  path: string;
  handler?: RouteHandler;
  lazyHandler?: LazyRouteHandler; // 🎯 지연 로딩 핸들러
  guards?: RouteGuard[];
  name?: string;
  meta?: Record<string, any>;
  preload?: boolean; // 🔧 사전 로딩 옵션
}

/**
 * 라우터 설정
 */
export interface RouterConfig {
  mode?: 'hash' | 'history';
  base?: string;
  fallback?: string;
  caseSensitive?: boolean;
  strict?: boolean;
  preloadDelay?: number; // 🔧 사전 로딩 지연 시간
}

/**
 * 네비게이션 이벤트 데이터
 */
export interface NavigationEventData extends EventData {
  type: 'router:before-navigate' | 'router:after-navigate' | 'router:error' | 'router:loading';
  timestamp: number;
  source: 'Router';
  payload: {
    to?: RouteContext;
    from?: RouteContext;
    error?: Error;
    cancelled?: boolean;
    loading?: boolean; // 🔧 로딩 상태
  };
}

/**
 * 라우트 매칭 결과
 */
interface RouteMatch {
  route: Route;
  params: RouteParams;
}

/**
 * 클라이언트 사이드 라우터 클래스 (동적 import 지원)
 * 
 * @example
 * ```typescript
 * const router = new Router(eventManager, {
 *   mode: 'history',
 *   base: '/app',
 *   preloadDelay: 2000
 * });
 * 
 * // 정적 라우트 등록
 * router.addRoute({
 *   path: '/home',
 *   handler: async (context) => {
 *     console.log('Home page');
 *   }
 * });
 * 
 * // 동적 import 라우트 등록
 * router.addRoute({
 *   path: '/users/:id',
 *   lazyHandler: () => import('@/components/features/UserDetail'),
 *   preload: true
 * });
 * 
 * // 라우터 시작
 * await router.start();
 * ```
 */
export class Router {
  private routes: Route[] = [];
  private currentRoute: RouteContext | null = null;
  private eventManager: EventManager;
  private config: Required<RouterConfig>;
  private isStarted = false;
  
  // 가드 관리
  private globalGuards: RouteGuard[] = [];
  
  // 히스토리 관리
  private isNavigating = false;
  private navigationQueue: Array<() => Promise<void>> = [];
  
  // 🎯 Phase 5.2: 동적 import 캐시
  private handlerCache = new Map<string, RouteHandler>();
  private preloadPromises = new Map<string, Promise<RouteHandler>>();
  
  constructor(eventManager: EventManager, config: RouterConfig = {}) {
    this.eventManager = eventManager;
    this.config = {
      mode: config.mode || 'history',
      base: config.base || '',
      fallback: config.fallback || '/',
      caseSensitive: config.caseSensitive || false,
      strict: config.strict || false,
      preloadDelay: config.preloadDelay || 2000
    };
    
    this.bindEvents();
    this.setupPreloading();
  }

  /**
   * 라우트를 등록합니다
   */
  addRoute(route: Route): void {
    // 핸들러 검증
    if (!route.handler && !route.lazyHandler) {
      throw new Error(`Route ${route.path} must have either handler or lazyHandler`);
    }
    
    // 경로 정규화
    const normalizedPath = this.normalizePath(route.path);
    
    this.routes.push({
      ...route,
      path: normalizedPath
    });
    
    // 우선순위 정렬 (구체적인 라우트가 먼저)
    this.routes.sort((a, b) => {
      const aSpecificity = this.getRouteSpecificity(a.path);
      const bSpecificity = this.getRouteSpecificity(b.path);
      return bSpecificity - aSpecificity;
    });
    
    // 🔧 사전 로딩 스케줄링
    if (route.preload && route.lazyHandler) {
      this.schedulePreload(route.path, route.lazyHandler);
    }
  }

  /**
   * 여러 라우트를 한 번에 등록합니다
   */
  addRoutes(routes: Route[]): void {
    routes.forEach(route => this.addRoute(route));
  }

  /**
   * 글로벌 가드를 추가합니다
   */
  addGuard(guard: RouteGuard): () => void {
    this.globalGuards.push(guard);
    
    // 제거 함수 반환
    return () => {
      const index = this.globalGuards.indexOf(guard);
      if (index > -1) {
        this.globalGuards.splice(index, 1);
      }
    };
  }

  /**
   * 🎯 Phase 5.2: 라우트 핸들러를 사전 로딩합니다
   */
  async preloadRoute(path: string): Promise<void> {
    const match = this.matchRoute(path);
    if (!match || !match.route.lazyHandler) {
      return;
    }

    const cacheKey = match.route.path;
    if (this.handlerCache.has(cacheKey)) {
      return; // 이미 로딩됨
    }

    if (this.preloadPromises.has(cacheKey)) {
      await this.preloadPromises.get(cacheKey);
      return;
    }

    const loadPromise = this.loadHandler(match.route.lazyHandler, cacheKey);
    this.preloadPromises.set(cacheKey, loadPromise);
    await loadPromise;
  }

  /**
   * 라우트를 시작합니다
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    
    // 현재 경로로 초기 네비게이션
    const currentPath = this.getCurrentPath();
    await this.navigate(currentPath, { replace: true });
    
    console.log('🧭 Router started');
  }

  /**
   * 라우트를 중지합니다
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    this.unbindEvents();
    
    console.log('🛑 Router stopped');
  }

  /**
   * 새 경로로 네비게이션합니다 (히스토리에 추가)
   */
  async push(path: string, state?: any): Promise<void> {
    await this.navigate(path, { state, replace: false });
  }

  /**
   * 현재 경로를 교체합니다 (히스토리 교체)
   */
  async replace(path: string, state?: any): Promise<void> {
    await this.navigate(path, { state, replace: true });
  }

  /**
   * 히스토리에서 뒤로 이동합니다
   */
  back(): void {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }

  /**
   * 히스토리에서 앞으로 이동합니다
   */
  forward(): void {
    if (typeof window !== 'undefined') {
      window.history.forward();
    }
  }

  /**
   * 히스토리에서 특정 단계만큼 이동합니다
   */
  go(delta: number): void {
    if (typeof window !== 'undefined') {
      window.history.go(delta);
    }
  }

  /**
   * 현재 라우트 컨텍스트를 반환합니다
   */
  getCurrentRoute(): RouteContext | null {
    return this.currentRoute;
  }

  /**
   * 경로에서 라우트 컨텍스트를 생성합니다
   */
  resolve(path: string): RouteContext | null {
    const { pathname, search, hash } = this.parsePath(path);
    const query = this.parseQuery(search);
    
    const match = this.matchRoute(pathname);
    if (!match) {
      return null;
    }

    return {
      path: pathname,
      params: match.params,
      query,
      hash
    };
  }

  /**
   * 라우트 URL을 생성합니다
   */
  buildPath(name: string, params?: RouteParams, query?: QueryParams): string {
    const route = this.routes.find(r => r.name === name);
    if (!route) {
      throw new Error(`Route with name "${name}" not found`);
    }

    let path = route.path;
    
    // 매개변수 치환
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        path = path.replace(`:${key}`, encodeURIComponent(value));
      });
    }

    // 쿼리 파라미터 추가
    if (query && Object.keys(query).length > 0) {
      const queryString = this.buildQuery(query);
      path += `?${queryString}`;
    }

    return path;
  }

  /**
   * 네비게이션을 처리합니다
   */
  private async navigate(
    path: string, 
    options: { state?: any; replace?: boolean } = {}
  ): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Router not started');
    }

    // 네비게이션 큐에 추가
    return new Promise((resolve, reject) => {
      this.navigationQueue.push(async () => {
        try {
          await this.performNavigation(path, options);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      this.processNavigationQueue();
    });
  }

  /**
   * 실제 네비게이션을 수행합니다
   */
  private async performNavigation(
    path: string,
    options: { state?: any; replace?: boolean }
  ): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const { pathname, search, hash } = this.parsePath(normalizedPath);
    const query = this.parseQuery(search);
    
    // 라우트 매칭
    const match = this.matchRoute(pathname);
    if (!match) {
      // 폴백 라우트로 리다이렉트
      if (pathname !== this.config.fallback) {
        await this.navigate(this.config.fallback, { replace: true });
        return;
      }
      throw new Error(`No route found for path: ${pathname}`);
    }

    const to: RouteContext = {
      path: pathname,
      params: match.params,
      query,
      hash,
      state: options.state
    };

    const from = this.currentRoute;

    // 네비게이션 이벤트 발생
    this.eventManager.emit('router:before-navigate', {
      type: 'router:before-navigate',
      timestamp: Date.now(),
      source: 'Router',
      payload: { to, from }
    } as NavigationEventData);

    try {
      // 가드 실행
      const canNavigate = await this.runGuards(to, from);
      if (!canNavigate) {
        this.eventManager.emit('router:before-navigate', {
          type: 'router:before-navigate',
          timestamp: Date.now(),
          source: 'Router',
          payload: { to, from, cancelled: true }
        } as NavigationEventData);
        return;
      }

      // 히스토리 업데이트
      this.updateHistory(normalizedPath, options.state, options.replace);

      // 현재 라우트 업데이트
      this.currentRoute = to;

      // 라우트 핸들러 실행
      await this.runHandler(to);

      // 네비게이션 완료 이벤트
      this.eventManager.emit('router:after-navigate', {
        type: 'router:after-navigate',
        timestamp: Date.now(),
        source: 'Router',
        payload: { to, from }
      } as NavigationEventData);

    } catch (error) {
      // 에러 이벤트 발생
      this.eventManager.emit('router:error', {
        type: 'router:error',
        timestamp: Date.now(),
        source: 'Router',
        payload: { to, from, error: error as Error }
      } as NavigationEventData);

      console.error('❌ Navigation error:', error);
      throw error;
    }
  }

  /**
   * 네비게이션 큐를 처리합니다
   */
  private async processNavigationQueue(): Promise<void> {
    if (this.isNavigating || this.navigationQueue.length === 0) {
      return;
    }

    this.isNavigating = true;

    try {
      while (this.navigationQueue.length > 0) {
        const navigation = this.navigationQueue.shift()!;
        await navigation();
      }
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * 가드들을 실행합니다
   */
  private async runGuards(to: RouteContext, from: RouteContext | null): Promise<boolean> {
    // 글로벌 가드 실행
    for (const guard of this.globalGuards) {
      const result = await guard(to, from);
      if (!result) {
        return false;
      }
    }

    // 라우트별 가드 실행
    const match = this.matchRoute(to.path);
    if (match?.route.guards) {
      for (const guard of match.route.guards) {
        const result = await guard(to, from);
        if (!result) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 라우트를 매칭합니다
   */
  private matchRoute(path: string): RouteMatch | null {
    for (const route of this.routes) {
      const params = this.matchPath(route.path, path);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  /**
   * 경로 패턴을 매칭합니다
   */
  private matchPath(pattern: string, path: string): RouteParams | null {
    const patternSegments = pattern.split('/').filter(Boolean);
    const pathSegments = path.split('/').filter(Boolean);

    if (!this.config.strict && patternSegments.length !== pathSegments.length) {
      return null;
    }

    const params: RouteParams = {};

    for (let i = 0; i < patternSegments.length; i++) {
      const patternSegment = patternSegments[i];
      const pathSegment = pathSegments[i];

      // patternSegment는 배열 인덱스로 접근하므로 존재 확인
      if (!patternSegment) {
        return null;
      }

      if (!pathSegment && !patternSegment.startsWith(':')) {
        return null;
      }

      if (patternSegment.startsWith(':')) {
        // 동적 파라미터
        const paramName = patternSegment.slice(1);
        params[paramName] = decodeURIComponent(pathSegment || '');
      } else if (patternSegment === '*') {
        // 와일드카드
        params['*'] = pathSegments.slice(i).map(decodeURIComponent).join('/');
        break;
      } else {
        // 정적 세그먼트 - pathSegment 존재 확인
        if (!pathSegment) {
          return null;
        }
        
        const matches = this.config.caseSensitive
          ? patternSegment === pathSegment
          : patternSegment.toLowerCase() === pathSegment.toLowerCase();
        
        if (!matches) {
          return null;
        }
      }
    }

    return params;
  }

  /**
   * 경로를 정규화합니다
   */
  private normalizePath(path: string): string {
    // 베이스 경로 제거
    if (this.config.base && path.startsWith(this.config.base)) {
      path = path.slice(this.config.base.length);
    }

    // 시작 슬래시 보장
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // 이중 슬래시 제거
    path = path.replace(/\/+/g, '/');

    return path;
  }

  /**
   * 경로를 파싱합니다
   */
  private parsePath(path: string): { pathname: string; search: string; hash: string } {
    const hashIndex = path.indexOf('#');
    const hash = hashIndex >= 0 ? path.slice(hashIndex + 1) : '';
    
    const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
    const searchIndex = pathWithoutHash.indexOf('?');
    
    const pathname = searchIndex >= 0 ? pathWithoutHash.slice(0, searchIndex) : pathWithoutHash;
    const search = searchIndex >= 0 ? pathWithoutHash.slice(searchIndex + 1) : '';

    return { pathname, search, hash };
  }

  /**
   * 쿼리 문자열을 파싱합니다
   */
  private parseQuery(search: string): QueryParams {
    const query: QueryParams = {};
    
    if (!search) {
      return query;
    }

    const params = new URLSearchParams(search);
    
    for (const [key, value] of params.entries()) {
      if (query[key]) {
        // 배열로 변환
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value);
        } else {
          query[key] = [query[key] as string, value];
        }
      } else {
        query[key] = value;
      }
    }

    return query;
  }

  /**
   * 쿼리 파라미터를 문자열로 변환합니다
   */
  private buildQuery(query: QueryParams): string {
    const params = new URLSearchParams();
    
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else {
        params.append(key, value);
      }
    });

    return params.toString();
  }

  /**
   * 라우트의 구체성을 계산합니다 (매칭 우선순위용)
   */
  private getRouteSpecificity(path: string): number {
    const segments = path.split('/').filter(Boolean);
    let specificity = 0;

    segments.forEach(segment => {
      if (segment === '*') {
        specificity += 1; // 와일드카드는 가장 낮은 우선순위
      } else if (segment.startsWith(':')) {
        specificity += 10; // 동적 파라미터
      } else {
        specificity += 100; // 정적 세그먼트가 가장 높은 우선순위
      }
    });

    return specificity;
  }

  /**
   * 현재 경로를 가져옵니다
   */
  private getCurrentPath(): string {
    if (typeof window === 'undefined') {
      return this.config.fallback;
    }

    if (this.config.mode === 'hash') {
      return window.location.hash.slice(1) || this.config.fallback;
    } else {
      return window.location.pathname + window.location.search + window.location.hash;
    }
  }

  /**
   * 히스토리를 업데이트합니다
   */
  private updateHistory(path: string, state?: any, replace = false): void {
    if (typeof window === 'undefined') {
      return;
    }

    const fullPath = this.config.base + path;

    if (this.config.mode === 'hash') {
      const hashPath = '#' + path;
      if (replace) {
        window.location.replace(hashPath);
      } else {
        window.location.hash = hashPath;
      }
    } else {
      if (replace) {
        window.history.replaceState(state, '', fullPath);
      } else {
        window.history.pushState(state, '', fullPath);
      }
    }
  }

  /**
   * 브라우저 이벤트를 바인딩합니다
   */
  private bindEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.config.mode === 'hash') {
      window.addEventListener('hashchange', this.handleHashChange);
    } else {
      window.addEventListener('popstate', this.handlePopState);
    }

    // 링크 클릭 가로채기
    document.addEventListener('click', this.handleLinkClick);
  }

  /**
   * 브라우저 이벤트를 언바인딩합니다
   */
  private unbindEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.removeEventListener('hashchange', this.handleHashChange);
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('click', this.handleLinkClick);
  }

  /**
   * 해시 변경 이벤트 핸들러
   */
  private handleHashChange = (): void => {
    const path = window.location.hash.slice(1) || this.config.fallback;
    this.navigate(path, { replace: true }).catch(console.error);
  };

  /**
   * popstate 이벤트 핸들러
   */
  private handlePopState = (event: PopStateEvent): void => {
    const path = window.location.pathname + window.location.search + window.location.hash;
    this.navigate(path, { state: event.state, replace: true }).catch(console.error);
  };

  /**
   * 링크 클릭 이벤트 핸들러
   */
  private handleLinkClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const link = target.closest('a[href]') as HTMLAnchorElement;
    
    if (!link || !this.shouldInterceptLink(link, event)) {
      return;
    }

    event.preventDefault();
    
    const href = link.getAttribute('href')!;
    this.push(href).catch(console.error);
  };

  /**
   * 링크를 가로채야 하는지 확인합니다
   */
  private shouldInterceptLink(link: HTMLAnchorElement, event: MouseEvent): boolean {
    // 수정 키가 눌렸으면 가로채지 않음
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }

    // 마우스 중간 버튼이면 가로채지 않음
    if (event.button !== 0) {
      return false;
    }

    // target이 _blank이면 가로채지 않음
    if (link.target === '_blank') {
      return false;
    }

    // 외부 링크면 가로채지 않음
    if (link.hostname !== window.location.hostname) {
      return false;
    }

    // 다운로드 링크면 가로채지 않음
    if (link.hasAttribute('download')) {
      return false;
    }

    return true;
  }

  /**
   * 🎯 Phase 5.2: 라우트 핸들러를 실행합니다
   */
  private async runHandler(context: RouteContext): Promise<void> {
    const match = this.matchRoute(context.path);
    if (!match) {
      throw new Error(`Route ${context.path} not found`);
    }

    const route = match.route;
    
    if (route.handler) {
      await route.handler(context);
    } else if (route.lazyHandler) {
      // 로딩 상태 이벤트
      this.eventManager.emit('router:loading', {
        type: 'router:loading',
        timestamp: Date.now(),
        source: 'Router',
        payload: { to: context, loading: true }
      });

      const handler = await this.loadHandler(route.lazyHandler, route.path);
      await handler(context);
    }
  }

  /**
   * 🎯 Phase 5.2: 지연 로딩 핸들러를 로드합니다
   */
  private async loadHandler(lazyHandler: LazyRouteHandler, cacheKey: string): Promise<RouteHandler> {
    if (this.handlerCache.has(cacheKey)) {
      return this.handlerCache.get(cacheKey)!;
    }

    try {
      const handlerModule = await lazyHandler();
      let handler: RouteHandler;

      // ES 모듈 형태인지 확인
      if (typeof handlerModule === 'function') {
        handler = handlerModule;
      } else if (handlerModule && typeof handlerModule.default === 'function') {
        handler = handlerModule.default;
      } else {
        throw new Error(`Invalid handler format for route ${cacheKey}`);
      }

      this.handlerCache.set(cacheKey, handler);
      return handler;
    } catch (error) {
      console.error(`Failed to load handler for route ${cacheKey}:`, error);
      throw error;
    }
  }

  /**
   * 🔧 Phase 5.2: 사전 로딩 시스템을 설정합니다
   */
  private setupPreloading(): void {
    // 지연된 사전 로딩 스케줄링
    setTimeout(() => {
      this.routes.forEach(route => {
        if (route.preload && route.lazyHandler) {
          this.schedulePreload(route.path, route.lazyHandler);
        }
      });
    }, this.config.preloadDelay);
  }

  /**
   * 🔧 Phase 5.2: 지연 로딩 핸들러를 사전 로딩합니다
   */
  private schedulePreload(path: string, lazyHandler: LazyRouteHandler): void {
    if (this.handlerCache.has(path) || this.preloadPromises.has(path)) {
      return; // 이미 로딩되었거나 스케줄링됨
    }

    const loadPromise = this.loadHandler(lazyHandler, path);
    this.preloadPromises.set(path, loadPromise);
    
    // 에러 처리 (사전 로딩 실패는 치명적이지 않음)
    loadPromise.catch(error => {
      console.warn(`Preload failed for route ${path}:`, error);
      this.preloadPromises.delete(path);
    });
  }
}

/**
 * 전역 라우터 인스턴스
 */
let globalRouter: Router | null = null;

/**
 * 전역 라우터를 가져오거나 생성합니다
 */
export function getRouter(eventManager?: EventManager, config?: RouterConfig): Router {
  if (!globalRouter && eventManager) {
    globalRouter = new Router(eventManager, config);
  }
  
  if (!globalRouter) {
    throw new Error('Router not initialized. Please provide EventManager.');
  }
  
  return globalRouter;
}

/**
 * 라우터 유틸리티 함수들
 */
export const RouterUtils = {
  /**
   * 인증 가드 예제
   */
  createAuthGuard: (isAuthenticated: () => boolean, loginPath = '/login') => {
    return (to: RouteContext): boolean => {
      if (!isAuthenticated() && to.path !== loginPath) {
        const router = getRouter();
        router.push(loginPath).catch(console.error);
        return false;
      }
      return true;
    };
  },

  /**
   * 권한 가드 예제
   */
  createPermissionGuard: (hasPermission: (path: string) => boolean) => {
    return (to: RouteContext): boolean => {
      return hasPermission(to.path);
    };
  },

  /**
   * 로딩 가드 예제
   */
  createLoadingGuard: (showLoading: () => void, hideLoading: () => void) => {
    return async (): Promise<boolean> => {
      showLoading();
      
      // 라우트 변경 후 로딩 숨김
      setTimeout(hideLoading, 100);
      
      return true;
    };
  }
};

export default Router; 