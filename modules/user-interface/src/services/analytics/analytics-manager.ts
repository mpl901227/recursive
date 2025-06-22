// Analytics Manager - 분석 데이터 수집 및 관리

import { EventManager } from '../../core/events';
import {
  AnalyticsConfig,
  AnalyticsEvent,
  EventType,
  EventContext,
  UserInfo,
  SessionInfo,
  UserAction,
  PerformanceMetric,
  PerformanceMetricType,
  AnalyticsStats,
  AnalyticsEventListener,
  PrivacySettings
} from './types';
import {
  DEFAULT_ANALYTICS_CONFIG,
  DEFAULT_PRIVACY_SETTINGS,
  EVENT_CATEGORIES,
  EVENT_ACTIONS,
  PERFORMANCE_METRICS,
  STORAGE_KEYS,
  PERFORMANCE_THRESHOLDS,
  PRIVACY_CONSTANTS,
  BATCH_CONSTANTS,
  ERROR_MESSAGES,
  DEBUG_CONSTANTS
} from './constants.js';

export class AnalyticsManager {
  private config: AnalyticsConfig;
  private privacySettings: PrivacySettings;
  private eventManager: EventManager;
  private isInitialized = false;
  private isTracking = false;
  
  // 사용자 및 세션 정보
  private userInfo: UserInfo | null = null;
  private sessionInfo: SessionInfo | null = null;
  
  // 이벤트 큐 및 배치 처리
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimer: number | null = null;
  private batchInProgress = false;
  
  // 성능 모니터링
  private performanceObserver: PerformanceObserver | null = null;
  private memoryMonitorTimer: number | null = null;
  
  // 이벤트 리스너
  private eventListeners: Set<AnalyticsEventListener> = new Set();
  
  // 통계
  private stats: AnalyticsStats = {
    totalEvents: 0,
    eventsThisSession: 0,
    sessionStartTime: new Date(),
    batchesSent: 0,
    failedRequests: 0,
    storageSize: 0,
    isTracking: false,
    privacyMode: false
  };

  constructor(eventManager: EventManager, config: Partial<AnalyticsConfig> = {}) {
    this.eventManager = eventManager;
    this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
    this.privacySettings = { ...DEFAULT_PRIVACY_SETTINGS };
    
    this.bindMethods();
    console.log('Analytics Manager created');
  }

  /**
   * Analytics Manager 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 설정 검증
      this.validateConfig();
      
      // 개인정보 보호 설정 로드
      await this.loadPrivacySettings();
      
      // 사용자 정보 초기화
      await this.initializeUserInfo();
      
      // 세션 정보 초기화
      await this.initializeSession();
      
      // 이벤트 큐 복원
      await this.restoreEventQueue();
      
      // 성능 모니터링 시작
      if (this.config.enablePerformanceTracking) {
        this.startPerformanceMonitoring();
      }
      
      // 브라우저 이벤트 리스너 등록
      this.setupBrowserEventListeners();
      
      // 배치 플러시 타이머 시작
      this.startFlushTimer();
      
      // 추적 시작
      if (this.config.enabled && this.privacySettings.enableTracking) {
        this.startTracking();
      }
      
      this.isInitialized = true;
      this.log('Analytics Manager initialized');
      
      // 초기화 완료 이벤트 발생
      this.eventManager.emit('analytics:initialized', {
        config: this.config,
        userInfo: this.userInfo,
        sessionInfo: this.sessionInfo
      });
      
    } catch (error) {
      this.error('Failed to initialize Analytics Manager:', error);
      throw error;
    }
  }

  /**
   * 이벤트 추적
   */
  track(action: string, category: string, options: {
    label?: string | undefined;
    value?: number | undefined;
    properties?: Record<string, any> | undefined;
    type?: EventType | undefined;
  } = {}): void {
    if (!this.canTrack()) return;

    const event: AnalyticsEvent = {
      id: this.generateEventId(),
      type: options.type || EventType.USER_ACTION,
      category,
      action,
      label: options.label,
      value: options.value,
      timestamp: new Date(),
      sessionId: this.sessionInfo?.sessionId || '',
      userId: this.userInfo?.userId,
      properties: options.properties,
      context: this.createEventContext()
    };

    this.addEvent(event);
  }

  /**
   * 사용자 액션 추적
   */
  trackUserAction(userAction: UserAction): void {
    this.track(userAction.action, userAction.category, {
      label: userAction.label || undefined,
      value: userAction.value || undefined,
      properties: {
        element: userAction.element || undefined,
        component: userAction.component || undefined,
        ...(userAction.properties || {})
      }
    });
  }

  /**
   * 페이지 뷰 추적
   */
  trackPageView(page: string, title?: string): void {
    if (!this.canTrack()) return;

    this.track(EVENT_ACTIONS.PAGE_VIEW, EVENT_CATEGORIES.NAVIGATION, {
      label: page,
      properties: {
        title,
        referrer: document.referrer,
        url: window.location.href
      },
      type: EventType.PAGE_VIEW
    });

    // 세션 페이지 뷰 카운트 증가
    if (this.sessionInfo) {
      this.sessionInfo.pageViews++;
      this.updateSessionActivity();
    }
  }

  /**
   * 성능 메트릭 추적
   */
  trackPerformance(metric: PerformanceMetric): void {
    if (!this.config.enablePerformanceTracking || !this.canTrack()) return;

    this.track(metric.name, EVENT_CATEGORIES.PERFORMANCE, {
      value: metric.value,
      properties: {
        unit: metric.unit,
        type: metric.type,
        ...metric.context
      },
      type: EventType.PERFORMANCE
    });

    // 성능 임계값 확인 및 경고
    this.checkPerformanceThresholds(metric);
  }

  /**
   * 에러 추적
   */
  trackError(error: Error, context?: Record<string, any>): void {
    if (!this.config.enableErrorTracking || !this.canTrack()) return;

    this.track(EVENT_ACTIONS.ERROR_OCCURRED, EVENT_CATEGORIES.ERROR, {
      label: error.message,
      properties: {
        name: error.name,
        stack: error.stack,
        ...context
      },
      type: EventType.ERROR
    });
  }

  /**
   * 커스텀 이벤트 추적
   */
  trackCustomEvent(name: string, properties?: Record<string, any> | undefined): void {
    if (!this.config.enableCustomEvents || !this.canTrack()) return;

    this.track(name, EVENT_CATEGORIES.CUSTOM, {
      properties: properties || undefined,
      type: EventType.CUSTOM
    });
  }

  /**
   * 세션 시작
   */
  startSession(): void {
    // 기존 세션 종료
    if (this.sessionInfo) {
      this.endSession();
    }

    // 새 세션 생성
    this.sessionInfo = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      lastActivity: new Date(),
      duration: 0,
      pageViews: 0,
      events: 0,
      isActive: true,
      referrer: document.referrer,
      entryPage: window.location.pathname
    };

    // 사용자 정보에도 새 세션 ID 설정
    if (this.userInfo) {
      this.userInfo.sessionId = this.sessionInfo.sessionId;
    }

    // 세션 시작 이벤트 추적
    this.track(EVENT_ACTIONS.SESSION_START, EVENT_CATEGORIES.SYSTEM, {
      properties: {
        sessionId: this.sessionInfo.sessionId,
        isFirstVisit: this.userInfo?.isFirstVisit,
        referrer: document.referrer
      },
      type: EventType.SYSTEM
    });

    // 통계 업데이트
    this.stats.sessionStartTime = new Date();
    this.stats.eventsThisSession = 0;
  }

  /**
   * 세션 종료
   */
  endSession(): void {
    if (!this.sessionInfo) return;

    // 세션 정보 업데이트
    this.sessionInfo.duration = Date.now() - this.sessionInfo.startTime.getTime();
    this.sessionInfo.isActive = false;
    this.sessionInfo.exitPage = window.location.pathname;

    this.track(EVENT_ACTIONS.SESSION_END, EVENT_CATEGORIES.SYSTEM, {
      properties: {
        sessionId: this.sessionInfo.sessionId,
        duration: this.sessionInfo.duration,
        pageViews: this.sessionInfo.pageViews,
        events: this.sessionInfo.events
      },
      type: EventType.SYSTEM
    });

    // 추적 중지
    this.stopTracking();

    // 즉시 플러시
    this.flush();
  }

  /**
   * 이벤트 리스너 추가
   */
  addEventListener(listener: AnalyticsEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * 즉시 플러시
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || this.batchInProgress) return;

    this.batchInProgress = true;
    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendEventBatch(events);
      this.stats.batchesSent++;
      this.log(`Flushed ${events.length} events`);
    } catch (error) {
      // 실패한 이벤트를 다시 큐에 추가
      this.eventQueue.unshift(...events);
      this.stats.failedRequests++;
      this.error('Failed to flush events:', error);
    } finally {
      this.batchInProgress = false;
    }
  }

  /**
   * 추적 시작
   */
  startTracking(): void {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.stats.isTracking = true;
    this.log('Analytics tracking started');
    
    this.eventManager.emit('analytics:tracking-started');
  }

  /**
   * 추적 중지
   */
  stopTracking(): void {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    this.stats.isTracking = false;
    this.log('Analytics tracking stopped');
    
    this.eventManager.emit('analytics:tracking-stopped');
  }

  /**
   * 개인정보 보호 설정 업데이트
   */
  updatePrivacySettings(settings: Partial<PrivacySettings>): void {
    this.privacySettings = { ...this.privacySettings, ...settings };
    this.savePrivacySettings();
    
    this.stats.privacyMode = !this.privacySettings.enableTracking;
    
    if (!this.privacySettings.enableTracking) {
      this.stopTracking();
    } else if (this.config.enabled) {
      this.startTracking();
    }
    
    this.eventManager.emit('analytics:privacy-updated', this.privacySettings);
  }

  /**
   * 통계 정보 조회
   */
  getStats(): AnalyticsStats {
    return {
      ...this.stats,
      storageSize: this.getStorageSize(),
      lastEventTime: this.stats.totalEvents > 0 ? this.stats.lastEventTime : undefined
    };
  }

  /**
   * 사용자 정보 조회
   */
  getUserInfo(): UserInfo | null {
    return this.userInfo;
  }

  /**
   * 세션 정보 조회
   */
  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * 설정 정보 조회
   */
  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  /**
   * 개인정보 보호 설정 조회
   */
  getPrivacySettings(): PrivacySettings {
    return { ...this.privacySettings };
  }

  /**
   * 정리 및 종료
   */
  async destroy(): Promise<void> {
    this.log('Destroying Analytics Manager');
    
    // 세션 종료
    this.endSession();
    
    // 추적 중지
    this.stopTracking();
    
    // 타이머 정리
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
    }
    
    // 성능 모니터링 중지
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    // 브라우저 이벤트 리스너 제거
    this.removeBrowserEventListeners();
    
    // 이벤트 리스너 정리
    this.eventListeners.clear();
    
    // 남은 이벤트 저장
    await this.saveEventQueue();
    
    this.isInitialized = false;
    this.eventManager.emit('analytics:destroyed');
  }

  // === Private Methods ===

  private bindMethods(): void {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleUnload = this.handleUnload.bind(this);
  }

  private validateConfig(): void {
    if (!this.config.enabled) return;
    
    if (this.config.batchSize < BATCH_CONSTANTS.MIN_BATCH_SIZE || 
        this.config.batchSize > BATCH_CONSTANTS.MAX_BATCH_SIZE) {
      throw new Error(ERROR_MESSAGES.INVALID_CONFIG);
    }
    
    if (this.config.flushInterval < BATCH_CONSTANTS.MIN_FLUSH_INTERVAL || 
        this.config.flushInterval > BATCH_CONSTANTS.MAX_FLUSH_INTERVAL) {
      throw new Error(ERROR_MESSAGES.INVALID_CONFIG);
    }
  }

  private async loadPrivacySettings(): Promise<void> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PRIVACY_SETTINGS);
      if (stored) {
        this.privacySettings = { ...DEFAULT_PRIVACY_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      this.warn('Failed to load privacy settings:', error);
    }
  }

  private savePrivacySettings(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PRIVACY_SETTINGS, JSON.stringify(this.privacySettings));
    } catch (error) {
      this.warn('Failed to save privacy settings:', error);
    }
  }

  private async initializeUserInfo(): Promise<void> {
    const isFirstVisit = !localStorage.getItem(STORAGE_KEYS.LAST_VISIT);
    const visitCount = parseInt(localStorage.getItem(STORAGE_KEYS.VISIT_COUNT) || '0') + 1;
    
    let userId: string | undefined;
    if (this.privacySettings.enableUserIdentification) {
      userId = localStorage.getItem(STORAGE_KEYS.USER_ID) || undefined;
      if (!userId) {
        userId = this.generateUserId();
        localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
      }
    }

    this.userInfo = {
      userId,
      sessionId: this.generateSessionId(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${screen.width}x${screen.height}`,
      isFirstVisit,
      lastVisit: isFirstVisit ? undefined : new Date(localStorage.getItem(STORAGE_KEYS.LAST_VISIT)!),
      visitCount
    };

    // 방문 정보 업데이트
    localStorage.setItem(STORAGE_KEYS.LAST_VISIT, new Date().toISOString());
    localStorage.setItem(STORAGE_KEYS.VISIT_COUNT, visitCount.toString());
  }

  private async initializeSession(): Promise<void> {
    const sessionId = this.userInfo!.sessionId;
    const startTime = new Date();
    
    this.sessionInfo = {
      sessionId,
      startTime,
      lastActivity: startTime,
      duration: 0,
      pageViews: 0,
      events: 0,
      isActive: true,
      referrer: document.referrer,
      entryPage: window.location.pathname
    };

    localStorage.setItem(STORAGE_KEYS.SESSION_START, startTime.toISOString());
    this.startSession();
  }

  private async restoreEventQueue(): Promise<void> {
    if (!this.config.persistEvents) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.EVENTS_QUEUE);
      if (stored) {
        const events = JSON.parse(stored);
        this.eventQueue = events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        }));
        this.log(`Restored ${this.eventQueue.length} events from storage`);
      }
    } catch (error) {
      this.warn('Failed to restore event queue:', error);
    }
  }

  private async saveEventQueue(): Promise<void> {
    if (!this.config.persistEvents || this.eventQueue.length === 0) return;

    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS_QUEUE, JSON.stringify(this.eventQueue));
    } catch (error) {
      this.warn('Failed to save event queue:', error);
    }
  }

  private canTrack(): boolean {
    return this.isInitialized && 
           this.isTracking && 
           this.config.enabled && 
           this.privacySettings.enableTracking &&
           this.stats.eventsThisSession < this.config.maxEventsPerSession;
  }

  private addEvent(event: AnalyticsEvent): void {
    // 개인정보 보호 필터링
    if (this.isEventBlocked(event)) {
      this.log('Event blocked by privacy settings:', event.action);
      return;
    }

    // 샘플링
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    this.eventQueue.push(event);
    this.stats.totalEvents++;
    this.stats.eventsThisSession++;
    this.stats.lastEventTime = event.timestamp;

    // 세션 이벤트 카운트 증가
    if (this.sessionInfo) {
      this.sessionInfo.events++;
      this.updateSessionActivity();
    }

    // 이벤트 리스너들에게 알림
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.error('Error in event listener:', error);
      }
    });

    // 배치 크기 확인
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }

    this.eventManager.emit('analytics:event-tracked', event);
  }

  private isEventBlocked(event: AnalyticsEvent): boolean {
    if (this.privacySettings.blockedEvents?.includes(event.action)) {
      return true;
    }

    if (this.config.privacyMode) {
      // 개인정보 보호 모드에서는 민감한 데이터 마스킹
      if (event.properties) {
        event.properties = this.maskSensitiveData(event.properties);
      }
    }

    return false;
  }

  private maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['email', 'phone', 'address', 'name', 'id'];
    const masked = { ...data };
    
    sensitiveKeys.forEach(key => {
      if (masked[key]) {
        masked[key] = PRIVACY_CONSTANTS.MASKED_VALUE;
      }
    });
    
    return masked;
  }

  private createEventContext(): EventContext {
    return {
      page: window.location.pathname,
      route: window.location.hash,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      timestamp: new Date(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  private updateSessionActivity(): void {
    if (this.sessionInfo) {
      this.sessionInfo.lastActivity = new Date();
      this.sessionInfo.duration = this.sessionInfo.lastActivity.getTime() - this.sessionInfo.startTime.getTime();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  private async sendEventBatch(events: AnalyticsEvent[]): Promise<void> {
    if (!this.config.endpoint) {
      this.log('No endpoint configured, events will be logged only');
      this.logEvents(events);
      return;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify({
        events,
        userInfo: this.userInfo,
        sessionInfo: this.sessionInfo
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private logEvents(events: AnalyticsEvent[]): void {
    if (this.config.debugMode) {
      console.group(`${DEBUG_CONSTANTS.LOG_PREFIX} Event Batch (${events.length})`);
      events.forEach(event => {
        console.log(`${event.type}:${event.category}:${event.action}`, event);
      });
      console.groupEnd();
    }
  }

  private startPerformanceMonitoring(): void {
    // Web Vitals 모니터링
    this.observeWebVitals();
    
    // 메모리 모니터링
    this.startMemoryMonitoring();
    
    // 네트워크 요청 모니터링
    this.observeNetworkRequests();
  }

  private observeWebVitals(): void {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.processPerformanceEntry(entry);
        });
      });

      try {
        this.performanceObserver.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'first-input'] });
      } catch (error) {
        this.warn('Failed to observe performance entries:', error);
      }
    }
  }

  private processPerformanceEntry(entry: PerformanceEntry): void {
    let metricName: string;
    let value: number;

    switch (entry.entryType) {
      case 'paint':
        metricName = entry.name === 'first-paint' ? 
          PERFORMANCE_METRICS.FIRST_PAINT : 
          PERFORMANCE_METRICS.FIRST_CONTENTFUL_PAINT;
        value = entry.startTime;
        break;
      case 'largest-contentful-paint':
        metricName = PERFORMANCE_METRICS.LARGEST_CONTENTFUL_PAINT;
        value = entry.startTime;
        break;
      case 'first-input':
        metricName = PERFORMANCE_METRICS.FIRST_INPUT_DELAY;
        value = (entry as any).processingStart - entry.startTime;
        break;
      default:
        return;
    }

    this.trackPerformance({
      name: metricName,
      value,
      unit: 'ms',
      timestamp: new Date(),
      type: PerformanceMetricType.LOAD_TIME
    });
  }

  private startMemoryMonitoring(): void {
    if ('memory' in performance) {
      this.memoryMonitorTimer = window.setInterval(() => {
        const memory = (performance as any).memory;
        this.trackPerformance({
          name: PERFORMANCE_METRICS.MEMORY_USAGE,
          value: memory.usedJSHeapSize,
          unit: 'bytes',
          timestamp: new Date(),
          type: PerformanceMetricType.MEMORY_USAGE,
          context: {
            total: memory.totalJSHeapSize,
            limit: memory.jsHeapSizeLimit
          }
        });
      }, 30000); // 30초마다
    }
  }

  private observeNetworkRequests(): void {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
            this.trackPerformance({
              name: PERFORMANCE_METRICS.NETWORK_LATENCY,
              value: entry.duration,
              unit: 'ms',
              timestamp: new Date(),
              type: PerformanceMetricType.NETWORK_REQUEST,
              context: {
                name: entry.name,
                type: entry.entryType
              }
            });
          }
        });
      });

      try {
        observer.observe({ entryTypes: ['navigation', 'resource'] });
      } catch (error) {
        this.warn('Failed to observe network requests:', error);
      }
    }
  }

  private checkPerformanceThresholds(metric: PerformanceMetric): void {
    if (!DEBUG_CONSTANTS.SHOW_PERFORMANCE_WARNINGS) return;

    let threshold: number | undefined;
    
    switch (metric.name) {
      case PERFORMANCE_METRICS.LOAD_COMPLETE:
        threshold = PERFORMANCE_THRESHOLDS.LOAD_TIME_WARNING;
        break;
      case PERFORMANCE_METRICS.MEMORY_USAGE:
        threshold = PERFORMANCE_THRESHOLDS.MEMORY_WARNING;
        break;
    }

    if (threshold && metric.value > threshold) {
      this.warn(`Performance threshold exceeded for ${metric.name}: ${metric.value}${metric.unit} > ${threshold}${metric.unit}`);
    }
  }

  private setupBrowserEventListeners(): void {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('unload', this.handleUnload);
  }

  private removeBrowserEventListeners(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('unload', this.handleUnload);
  }

  private handleVisibilityChange(): void {
    const isVisible = !document.hidden;
    
    this.track(EVENT_ACTIONS.VISIBILITY_CHANGE, EVENT_CATEGORIES.SYSTEM, {
      properties: { visible: isVisible },
      type: EventType.SYSTEM
    });

    if (isVisible) {
      this.updateSessionActivity();
    }
  }

  private handleBeforeUnload(): void {
    this.endSession();
  }

  private handleUnload(): void {
    if (navigator.sendBeacon && this.eventQueue.length > 0) {
      // Beacon API를 사용하여 페이지 언로드 시에도 이벤트 전송
      const data = JSON.stringify({
        events: this.eventQueue,
        userInfo: this.userInfo,
        sessionInfo: this.sessionInfo
      });
      
      if (this.config.endpoint) {
        navigator.sendBeacon(this.config.endpoint, data);
      }
    }
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getStorageSize(): number {
    try {
      let total = 0;
      for (const key in localStorage) {
        if (key.startsWith('recursive_analytics_')) {
          total += localStorage.getItem(key)?.length || 0;
        }
      }
      return total;
    } catch (error) {
      return 0;
    }
  }

  private log(...args: any[]): void {
    if (this.config.debugMode) {
      console.log(DEBUG_CONSTANTS.LOG_PREFIX, ...args);
    }
  }

  private warn(...args: any[]): void {
    if (this.config.debugMode) {
      console.warn(DEBUG_CONSTANTS.LOG_PREFIX, ...args);
    }
  }

  private error(...args: any[]): void {
    console.error(DEBUG_CONSTANTS.LOG_PREFIX, ...args);
  }
} 