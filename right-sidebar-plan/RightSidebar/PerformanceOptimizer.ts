import { eventManager } from '../../../core/EventManager.js';

export interface PerformanceConfig {
  enableVirtualScrolling: boolean;
  enableLazyLoading: boolean;
  enableMemoization: boolean;
  maxCachedApps: number;
  debounceDelay?: number;
  throttleDelay?: number;
  intersectionThreshold?: number;
  virtualScrollingChunkSize?: number;
}

export interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  loadTime: number;
  renderTime: number;
  interactionDelay: number;
}

export class PerformanceOptimizer {
  private element: HTMLElement;
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private observers: IntersectionObserver[] = [];
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsHistory: number[] = [];
  private memoCache = new Map<string, any>();
  private virtualScrollingEnabled = false;
  private isMonitoring = false;
  private loadStartTime = 0;
  private renderStartTime = 0;
  private interactionStartTime = 0;

  constructor(element: HTMLElement, config: Partial<PerformanceConfig> = {}) {
    this.element = element;
    this.config = {
      enableVirtualScrolling: true,
      enableLazyLoading: true,
      enableMemoization: true,
      maxCachedApps: 5,
      debounceDelay: 250,
      throttleDelay: 100,
      intersectionThreshold: 0.1,
      virtualScrollingChunkSize: 20,
      ...config
    };

    this.metrics = {
      fps: 0,
      memoryUsage: 0,
      loadTime: 0,
      renderTime: 0,
      interactionDelay: 0
    };

    this.initialize();
  }

  private initialize(): void {
    this.setupPerformanceMonitoring();
    this.setupLazyLoading();
    this.setupVirtualScrolling();
    this.setupEventListeners();
    this.startMetricsCollection();
  }

  private setupPerformanceMonitoring(): void {
    // FPS 모니터링
    this.startFPSMonitoring();
    // Memory usage monitoring
    if ((performance as any).memory) {
      setInterval(() => {
        this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
      }, 1000);
    }

    // 로드 타임 측정
    this.loadStartTime = performance.now();
    window.addEventListener('load', () => {
      this.metrics.loadTime = performance.now() - this.loadStartTime;
    });

    // 렌더링 타임 측정
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
          this.metrics.renderTime = entry.startTime;
          observer.disconnect();
        }
      }
    });

    observer.observe({ entryTypes: ['paint'] });
  }

  private setupLazyLoading(): void {
    if (!this.config.enableLazyLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            this.loadLazyContent(element);
            observer.unobserve(element);
          }
        });
      },
      {
        root: this.element,
        threshold: this.config.intersectionThreshold
      }
    );

    // 지연 로딩이 필요한 요소들 관찰
    const lazyElements = this.element.querySelectorAll('[data-lazy]');
    lazyElements.forEach(element => observer.observe(element));

    this.observers.push(observer);
  }

  private setupVirtualScrolling(): void {
    if (!this.config.enableVirtualScrolling) return;

    const container = this.element.querySelector('.virtual-scroll-container') as HTMLElement;
    if (!container) return;

    let items: HTMLElement[] = [];
    let visibleItems: HTMLElement[] = [];
    let itemHeight = 0;
    let totalItems = 0;
    let scrollTop = 0;

    const updateVisibleItems = () => {
      const containerHeight = container.clientHeight;
      scrollTop = container.scrollTop;

      // 보이는 영역의 시작과 끝 인덱스 계산
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / itemHeight),
        totalItems
      );

      // 버퍼 추가 (위아래로 추가 아이템 렌더링)
      const bufferSize = Math.ceil(containerHeight / itemHeight);
      const bufferedStartIndex = Math.max(0, startIndex - bufferSize);
      const bufferedEndIndex = Math.min(totalItems, endIndex + bufferSize);

      // 보이는 아이템 업데이트
      visibleItems = items.slice(bufferedStartIndex, bufferedEndIndex);
      this.renderVisibleItems(visibleItems, bufferedStartIndex);
    };

    // 스크롤 이벤트 처리
    const handleScroll = this.throttle(() => {
      requestAnimationFrame(updateVisibleItems);
    }, this.config.throttleDelay!);

    container.addEventListener('scroll', handleScroll);

    // 초기 설정
    const initializeVirtualScrolling = () => {
      items = Array.from(container.querySelectorAll('.virtual-scroll-item')) as HTMLElement[];
      if (items.length === 0) return;

      itemHeight = items[0].offsetHeight;
      totalItems = items.length;

      // 컨테이너 크기 설정
      const totalHeight = totalItems * itemHeight;
      container.style.height = `${totalHeight}px`;

      updateVisibleItems();
    };

    initializeVirtualScrolling();
    this.virtualScrollingEnabled = true;
  }

  private setupEventListeners(): void {
    // 성능 관련 이벤트 리스너
    window.addEventListener('resize', this.debounce(() => {
      this.optimizeForResize();
    }, this.config.debounceDelay!));

    // 상호작용 지연 측정
    this.element.addEventListener('click', () => {
      this.interactionStartTime = performance.now();
      this.measureInteractionDelay();
    });

    // 앱 활성화/비활성화 이벤트
    eventManager.on('app:activated' as any, this.handleAppActivation.bind(this));
    eventManager.on('app:deactivated' as any, this.handleAppDeactivation.bind(this));
  }

  private startMetricsCollection(): void {
    this.isMonitoring = true;
    this.collectMetrics();
  }

  private collectMetrics(): void {
    if (!this.isMonitoring) return;

    // FPS 업데이트
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= 1000) {
      this.metrics.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsHistory.push(this.metrics.fps);
      
      if (this.fpsHistory.length > 60) {
        this.fpsHistory.shift();
      }
      
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
    
    this.frameCount++;

    // 다음 프레임에서 메트릭 수집 계속
    this.rafId = requestAnimationFrame(() => this.collectMetrics());
  }

  private startFPSMonitoring(): void {
    let lastTime = performance.now();
    let frames = 0;

    const measure = () => {
      const now = performance.now();
      frames++;

      if (now >= lastTime + 1000) {
        this.metrics.fps = Math.round((frames * 1000) / (now - lastTime));
        frames = 0;
        lastTime = now;
      }

      this.rafId = requestAnimationFrame(measure);
    };

    this.rafId = requestAnimationFrame(measure);
  }

  private loadLazyContent(element: HTMLElement): void {
    const src = element.getAttribute('data-lazy');
    if (!src) return;

    if (element instanceof HTMLImageElement) {
      element.src = src;
    } else if (element instanceof HTMLIFrameElement) {
      element.src = src;
    } else {
      // 다른 유형의 콘텐츠 로딩
      fetch(src)
        .then(response => response.text())
        .then(content => {
          element.innerHTML = content;
          element.removeAttribute('data-lazy');
        })
        .catch(error => {
          console.error('Failed to load lazy content:', error);
        });
    }
  }

  private renderVisibleItems(items: HTMLElement[], startIndex: number): void {
    const container = this.element.querySelector('.virtual-scroll-container');
    if (!container) return;

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const clone = item.cloneNode(true) as HTMLElement;
      clone.style.transform = `translateY(${(startIndex + index) * item.offsetHeight}px)`;
      fragment.appendChild(clone);
    });

    // 기존 내용 제거 후 새로운 내용 추가
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  private optimizeForResize(): void {
    // 리사이즈 중 성능 최적화
    if (this.virtualScrollingEnabled) {
      this.updateVirtualScrolling();
    }

    // 캐시된 크기 정보 초기화
    this.memoCache.clear();

    // 레이아웃 재계산 최소화
    this.element.style.willChange = 'transform';
    requestAnimationFrame(() => {
      this.element.style.willChange = 'auto';
    });
  }

  private updateVirtualScrolling(): void {
    const container = this.element.querySelector('.virtual-scroll-container');
    if (!container) return;

    // 보이는 영역 재계산
    const visibleItems = Array.from(container.children) as HTMLElement[];
    const itemHeight = visibleItems[0]?.offsetHeight || 0;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    // 필요한 아이템만 렌더링
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight),
      visibleItems.length
    );

    this.renderVisibleItems(
      visibleItems.slice(startIndex, endIndex),
      startIndex
    );
  }

  private measureInteractionDelay(): void {
    const interactionEnd = performance.now();
    this.metrics.interactionDelay = interactionEnd - this.interactionStartTime;

    // 상호작용 지연이 크면 최적화 수행
    if (this.metrics.interactionDelay > 100) {
      this.optimizeInteractions();
    }
  }

  private optimizeInteractions(): void {
    // 이벤트 핸들러 최적화
    this.debounceEventHandlers();

    // 불필요한 렌더링 방지
    this.element.style.containIntrinsicSize = 'auto';
    this.element.style.contain = 'content';

    // 애니메이션 최적화
    this.element.style.willChange = 'transform';
    requestAnimationFrame(() => {
      this.element.style.willChange = 'auto';
    });
  }

  private debounceEventHandlers(): void {
    // 스크롤 이벤트 디바운스
    const scrollHandler = this.debounce(() => {
      this.handleScroll();
    }, this.config.debounceDelay!);

    this.element.removeEventListener('scroll', this.handleScroll as any);
    this.element.addEventListener('scroll', scrollHandler);

    // 리사이즈 이벤트 디바운스
    const resizeHandler = this.debounce(() => {
      this.handleResize();
    }, this.config.debounceDelay!);

    window.removeEventListener('resize', this.handleResize as any);
    window.addEventListener('resize', resizeHandler);
  }

  private handleScroll(): void {
    if (this.virtualScrollingEnabled) {
      this.updateVirtualScrolling();
    }
  }

  private handleResize(): void {
    this.optimizeForResize();
  }

  private handleAppActivation(data: { appId: string }): void {
    // 앱 활성화 시 성능 최적화
    this.preloadAppResources(data.appId);
    this.clearUnusedCache();
  }

  private handleAppDeactivation(data: { appId: string }): void {
    // 비활성화된 앱의 리소스 정리
    this.cleanupAppResources(data.appId);
  }

  private preloadAppResources(appId: string): void {
    // 앱 리소스 미리 로딩
    const appContainer = this.element.querySelector(`[data-app-id="${appId}"]`);
    if (!appContainer) return;

    // 이미지 프리로딩
    const images = appContainer.querySelectorAll('img[data-src]');
    images.forEach(img => {
      const src = img.getAttribute('data-src');
      if (src) {
        const preloadImage = new Image();
        preloadImage.src = src;
      }
    });

    // 스크립트 프리로딩
    const scripts = appContainer.querySelectorAll('script[data-src]');
    scripts.forEach(script => {
      const src = script.getAttribute('data-src');
      if (src) {
        const preloadLink = document.createElement('link');
        preloadLink.rel = 'preload';
        preloadLink.as = 'script';
        preloadLink.href = src;
        document.head.appendChild(preloadLink);
      }
    });
  }

  private cleanupAppResources(appId: string): void {
    // 캐시에서 앱 관련 데이터 제거
    const cacheKeys = Array.from(this.memoCache.keys());
    cacheKeys.forEach(key => {
      if (key.startsWith(`app:${appId}`)) {
        this.memoCache.delete(key);
      }
    });

    // 사용하지 않는 DOM 요소 정리
    const appContainer = this.element.querySelector(`[data-app-id="${appId}"]`);
    if (appContainer) {
      appContainer.innerHTML = '';
    }
  }

  private clearUnusedCache(): void {
    if (this.memoCache.size > this.config.maxCachedApps) {
      const keys = Array.from(this.memoCache.keys());
      const keysToDelete = keys.slice(0, keys.length - this.config.maxCachedApps);
      keysToDelete.forEach(key => this.memoCache.delete(key));
    }
  }

  public memoize<T>(key: string, callback: () => T): T {
    if (!this.config.enableMemoization) {
      return callback();
    }

    if (this.memoCache.has(key)) {
      return this.memoCache.get(key);
    }

    const result = callback();
    this.memoCache.set(key, result);
    return result;
  }

  public clearCache(): void {
    this.memoCache.clear();
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public generatePerformanceReport(): {
    metrics: PerformanceMetrics;
    recommendations: string[];
  } {
    const recommendations: string[] = [];

    // FPS 분석
    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    if (avgFps < 30) {
      recommendations.push('Consider reducing animations and transitions');
      recommendations.push('Optimize DOM operations and layout calculations');
    }

    // 메모리 사용량 분석
    if (this.metrics.memoryUsage > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Memory usage is high. Consider implementing cleanup routines');
      recommendations.push('Review memory leaks and resource management');
    }

    // 로드 타임 분석
    if (this.metrics.loadTime > 3000) { // 3초
      recommendations.push('Implement code splitting and lazy loading');
      recommendations.push('Optimize resource loading and initial render');
    }

    // 상호작용 지연 분석
    if (this.metrics.interactionDelay > 100) { // 100ms
      recommendations.push('Optimize event handlers and debounce/throttle events');
      recommendations.push('Review blocking operations in the main thread');
    }

    return {
      metrics: this.getMetrics(),
      recommendations
    };
  }

  public optimizeNow(): void {
    // 즉시 최적화 수행
    this.clearUnusedCache();
    this.optimizeInteractions();
    this.updateVirtualScrolling();
  }

  private debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  private throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  public destroy(): void {
    // 성능 모니터링 중지
    this.isMonitoring = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    // Intersection Observer 정리
    this.observers.forEach(observer => observer.disconnect());

    // 캐시 정리
    this.memoCache.clear();

    // 이벤트 리스너 제거
    window.removeEventListener('resize', this.handleResize as any);
    this.element.removeEventListener('scroll', this.handleScroll as any);

    // 스타일 정리
    this.element.style.willChange = '';
    this.element.style.contain = '';
    this.element.style.containIntrinsicSize = '';
  }
} 