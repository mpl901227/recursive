// ============================================
// 성능 최적화 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../core/EventManager.js';

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  eventListeners: number;
  domNodes: number;
  appLoadTime: Record<string, number>;
  resizeFramerate: number;
  scrollFramerate: number;
}

export interface OptimizationConfig {
  enableVirtualScrolling: boolean;
  enableLazyLoading: boolean;
  enableMemoization: boolean;
  enableDebouncing: boolean;
  maxCachedApps: number;
  maxDOMNodes: number;
  targetFramerate: number;
}

export class PerformanceOptimizer {
  private element: HTMLElement;
  private config: OptimizationConfig;
  private metrics: PerformanceMetrics;
  private cache: Map<string, any> = new Map();
  private observers: Map<string, any> = new Map();
  private scheduledTasks: Set<number> = new Set();
  private animationFrames: Set<number> = new Set();
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private perfObserver: PerformanceObserver | null = null;

  constructor(element: HTMLElement, config: Partial<OptimizationConfig> = {}) {
    this.element = element;
    this.config = {
      enableVirtualScrolling: true,
      enableLazyLoading: true,
      enableMemoization: true,
      enableDebouncing: true,
      maxCachedApps: 5,
      maxDOMNodes: 1000,
      targetFramerate: 60,
      ...config
    };

    this.metrics = {
      renderTime: 0,
      memoryUsage: 0,
      eventListeners: 0,
      domNodes: 0,
      appLoadTime: {},
      resizeFramerate: 0,
      scrollFramerate: 0
    };

    this.initialize();
  }

  private initialize(): void {
    this.setupPerformanceMonitoring();
    this.setupOptimizations();
    this.startMetricsCollection();
  }

  // ============================================================================
  // 성능 모니터링
  // ============================================================================

  private setupPerformanceMonitoring(): void {
    // Performance Observer 설정
    if ('PerformanceObserver' in window) {
      this.perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.processPerformanceEntry(entry);
        }
      });

      this.perfObserver.observe({ 
        entryTypes: ['measure', 'navigation', 'resource', 'paint'] 
      });
    }

    // Memory API 모니터링
    if ('memory' in performance) {
      setInterval(() => {
        this.updateMemoryMetrics();
      }, 5000);
    }

    // DOM 변경 모니터링
    const domObserver = new MutationObserver(() => {
      this.updateDOMMetrics();
    });

    domObserver.observe(this.element, {
      childList: true,
      subtree: true,
      attributes: false
    });

    this.observers.set('dom', domObserver);
  }

  private processPerformanceEntry(entry: PerformanceEntry): void {
    switch (entry.entryType) {
      case 'measure':
        if (entry.name.startsWith('app-load-')) {
          const appId = entry.name.replace('app-load-', '');
          this.metrics.appLoadTime[appId] = entry.duration;
        }
        break;
      
      case 'paint':
        if (entry.name === 'first-contentful-paint') {
          this.metrics.renderTime = entry.startTime;
        }
        break;
    }
  }

  private updateMemoryMetrics(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize;
      
      // 메모리 사용량이 임계값을 초과하면 정리
      if (memory.usedJSHeapSize > memory.totalJSHeapSize * 0.8) {
        this.performMemoryCleanup();
      }
    }
  }

  private updateDOMMetrics(): void {
    this.metrics.domNodes = this.element.querySelectorAll('*').length;
    
    // DOM 노드 수가 임계값을 초과하면 정리
    if (this.metrics.domNodes > this.config.maxDOMNodes) {
      this.performDOMCleanup();
    }
  }

  // ============================================================================
  // 최적화 기능들
  // ============================================================================

  private setupOptimizations(): void {
    if (this.config.enableVirtualScrolling) {
      this.setupVirtualScrolling();
    }

    if (this.config.enableLazyLoading) {
      this.setupLazyLoading();
    }

    if (this.config.enableDebouncing) {
      this.setupDebouncedEvents();
    }

    this.setupRAFOptimizations();
    this.setupEventOptimizations();
  }

  private setupVirtualScrolling(): void {
    const scrollableElements = this.element.querySelectorAll('.overflow-y-auto, .log-container');
    
    scrollableElements.forEach(container => {
      this.implementVirtualScrolling(container as HTMLElement);
    });
  }

  private implementVirtualScrolling(container: HTMLElement): void {
    const itemHeight = 40; // 예상 아이템 높이
    const containerHeight = container.clientHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // 버퍼 포함
    
    let scrollTop = 0;
    let startIndex = 0;
    let endIndex = visibleCount;
    
    const updateVisibleItems = this.throttle(() => {
      const newScrollTop = container.scrollTop;
      const newStartIndex = Math.floor(newScrollTop / itemHeight);
      const newEndIndex = Math.min(newStartIndex + visibleCount, container.children.length);
      
      if (newStartIndex !== startIndex || newEndIndex !== endIndex) {
        startIndex = newStartIndex;
        endIndex = newEndIndex;
        
        // 가상 스크롤링 구현 (실제 구현에서는 더 복잡한 로직 필요)
        this.renderVisibleItems(container, startIndex, endIndex);
      }
      
      scrollTop = newScrollTop;
    }, 16); // 60fps

    container.addEventListener('scroll', updateVisibleItems, { passive: true });
  }

  private renderVisibleItems(container: HTMLElement, startIndex: number, endIndex: number): void {
    // 실제 구현에서는 아이템 데이터를 기반으로 DOM 업데이트
    // 현재는 기본 구현만 제공
    const items = Array.from(container.children);
    
    items.forEach((item, index) => {
      const htmlItem = item as HTMLElement;
      if (index >= startIndex && index <= endIndex) {
        htmlItem.style.display = '';
      } else {
        htmlItem.style.display = 'none';
      }
    });
  }

  private setupLazyLoading(): void {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadLazyContent(entry.target as HTMLElement);
          }
        });
      }, {
        root: this.element,
        rootMargin: '50px',
        threshold: 0.1
      });

      // 지연 로딩 대상 요소들 관찰
      this.element.querySelectorAll('[data-lazy]').forEach(el => {
        this.intersectionObserver?.observe(el);
      });
    }
  }

  private loadLazyContent(element: HTMLElement): void {
    const lazyType = element.getAttribute('data-lazy');
    
    switch (lazyType) {
      case 'image':
        this.loadLazyImage(element);
        break;
      case 'content':
        this.loadLazyContentBlock(element);
        break;
      case 'app':
        this.loadLazyApp(element);
        break;
    }
    
    element.removeAttribute('data-lazy');
    this.intersectionObserver?.unobserve(element);
  }

  private loadLazyImage(element: HTMLElement): void {
    const img = element as HTMLImageElement;
    const src = img.getAttribute('data-src');
    if (src) {
      img.src = src;
      img.removeAttribute('data-src');
    }
  }

  private loadLazyContentBlock(element: HTMLElement): void {
    const contentLoader = element.getAttribute('data-content-loader');
    if (contentLoader && typeof (window as any)[contentLoader] === 'function') {
      (window as any)[contentLoader](element);
    }
  }

  private loadLazyApp(element: HTMLElement): void {
    const appId = element.getAttribute('data-app-id');
    if (appId) {
      eventManager.emit('app:lazy-load' as any, { appId, element });
    }
  }

  private setupDebouncedEvents(): void {
    // 리사이즈 이벤트 디바운싱
    const debouncedResize = this.debounce(() => {
      eventManager.emit('resize:debounced' as any, {});
    }, 250);

    window.addEventListener('resize', debouncedResize);

    // 입력 이벤트 디바운싱
    this.element.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        this.handleDebouncedInput(target);
      }
    });
  }

  private handleDebouncedInput(input: HTMLInputElement): void {
    const inputId = input.id || input.name || 'anonymous';
    const key = `input-${inputId}`;
    
    // 기존 타이머 클리어
    if (this.scheduledTasks.has(key as any)) {
      clearTimeout(key as any);
      this.scheduledTasks.delete(key as any);
    }
    
    // 새 타이머 설정
    const timerId = setTimeout(() => {
      eventManager.emit('input:debounced' as any, {
        input,
        value: input.value
      });
      this.scheduledTasks.delete(timerId);
    }, 300) as any;
    
    this.scheduledTasks.add(timerId);
  }

  private setupRAFOptimizations(): void {
    // 애니메이션 프레임 기반 최적화
    let rafId: number;
    let lastTime = 0;
    
    const optimizedRender = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime >= 1000 / this.config.targetFramerate) {
        this.performScheduledUpdates();
        lastTime = currentTime;
      }
      
      rafId = requestAnimationFrame(optimizedRender);
    };
    
    rafId = requestAnimationFrame(optimizedRender);
    this.animationFrames.add(rafId);
  }

  private performScheduledUpdates(): void {
    // 예약된 UI 업데이트 수행
    const updates = this.cache.get('scheduled-updates') || [];
    
    updates.forEach((update: () => void) => {
      try {
        update();
      } catch (error) {
        console.error('Scheduled update failed:', error);
      }
    });
    
    this.cache.set('scheduled-updates', []);
  }

  private setupEventOptimizations(): void {
    // 이벤트 위임 사용
    this.element.addEventListener('click', this.handleDelegatedClick.bind(this));
    this.element.addEventListener('keydown', this.handleDelegatedKeydown.bind(this));
    
    // 패시브 리스너 사용
    this.element.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    this.element.addEventListener('wheel', this.handleWheel.bind(this), { passive: true });
  }

  private handleDelegatedClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // 버튼 클릭 처리
    if (target.matches('button, [role="button"]')) {
      this.handleButtonClick(target, event);
    }
    
    // 탭 클릭 처리
    if (target.matches('.rightsidebar__tab')) {
      this.handleTabClick(target, event);
    }
  }

  private handleDelegatedKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    
    // 공통 키보드 처리
    if (event.key === 'Enter' || event.key === ' ') {
      if (target.matches('[role="button"], [tabindex]:not(input):not(textarea)')) {
        event.preventDefault();
        target.click();
      }
    }
  }

  private handleButtonClick(button: HTMLElement, event: Event): void {
    // 버튼 클릭 최적화 처리
    const action = button.getAttribute('data-action');
    if (action) {
      this.scheduleUpdate(() => {
        eventManager.emit(`button:${action}` as any, { button, event });
      });
    }
  }

  private handleTabClick(tab: HTMLElement, event: Event): void {
    // 탭 전환 최적화
    const appId = tab.getAttribute('data-app-id');
    if (appId) {
      this.scheduleUpdate(() => {
        eventManager.emit('tab:switch' as any, { appId, tab, event });
      });
    }
  }

  private handleScroll(event: Event): void {
    const target = event.target as HTMLElement;
    
    // 스크롤 성능 모니터링
    this.measureFramerate('scroll');
    
    // 가상 스크롤링 업데이트
    if (target.hasAttribute('data-virtual-scroll')) {
      this.scheduleUpdate(() => {
        this.updateVirtualScrolling(target);
      });
    }
  }

  private handleWheel(event: WheelEvent): void {
    // 휠 이벤트 최적화 처리
    this.measureFramerate('scroll');
  }

  // ============================================================================
  // 메모이제이션 및 캐싱
  // ============================================================================

  private memoize<T extends (...args: any[]) => any>(fn: T, keyGenerator?: (...args: Parameters<T>) => string): T {
    const cache = new Map();
    
    return ((...args: Parameters<T>): ReturnType<T> => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      const result = fn(...args);
      cache.set(key, result);
      
      // 캐시 