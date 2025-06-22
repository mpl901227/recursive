/**
 * Session Storage Wrapper
 * 브라우저 세션 스토리지를 안전하게 관리하는 클래스
 */

import type { 
  StorageConfig, 
  StorageOptions, 
  StorageStats, 
  StorageEvent, 
  StorageEventListener, 
  TTLData, 
  CacheEntry,
  IStorage,
  SessionInfo
} from './types';
import { STORAGE_EVENTS, SESSION_DEFAULT_CONFIG, STORAGE_LIMITS, SYSTEM_KEYS } from './constants';

/**
 * 세션 스토리지 래퍼 클래스
 */
export class SessionStorageWrapper implements IStorage {
  private config: Required<StorageConfig>;
  private eventListeners = new Map<string, Set<StorageEventListener>>();
  private cache = new Map<string, CacheEntry>();
  private ttlTimers = new Map<string, number>();
  private isSupported = false;
  private stats = {
    reads: 0,
    writes: 0,
    errors: 0,
    cacheHits: 0,
    cleanups: 0,
    sessionStart: Date.now()
  };
  private sessionId: string;
  private windowId: string;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = { ...SESSION_DEFAULT_CONFIG, ...config };
    this.isSupported = this.checkSupport();
    this.sessionId = this.generateSessionId();
    this.windowId = this.generateWindowId();
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    if (!this.isSupported) {
      console.warn('sessionStorage is not supported');
      return;
    }

    // 세션 정보 저장
    this.saveSessionInfo();

    // 브라우저 이벤트 리스너
    if (this.config.enableEvents) {
      window.addEventListener('storage', this.handleStorageEvent.bind(this));
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
      window.addEventListener('unload', this.handleUnload.bind(this));
    }

    // 기존 만료된 데이터 정리
    if (this.config.enableTTL) {
      this.cleanupExpiredItems();
    }

    // 페이지 포커스/블러 이벤트
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    console.debug('SessionStorageWrapper initialized', {
      sessionId: this.sessionId,
      windowId: this.windowId
    });
  }

  /**
   * 스토리지 지원 확인
   */
  private checkSupport(): boolean {
    try {
      const testKey = '__sessionStorage_test__';
      sessionStorage.setItem(testKey, 'test');
      sessionStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.error('sessionStorage not supported:', error);
      return false;
    }
  }

  /**
   * 아이템 저장
   */
  set(key: string, value: any, options: StorageOptions = {}): boolean {
    if (!this.isSupported) {
      console.warn('sessionStorage not supported');
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);
      const data = this.prepareData(value, options);
      
      // 크기 검사
      if (this.checkSize(data)) {
        console.error(`Data too large for key: ${key}`);
        this.emitEvent(STORAGE_EVENTS.QUOTA_EXCEEDED, { key, size: data.length });
        return false;
      }

      // 스토리지에 저장
      sessionStorage.setItem(fullKey, data);
      
      // TTL 타이머 설정
      if (this.config.enableTTL && options.ttl) {
        this.setTTLTimer(key, options.ttl);
      }
      
      // 캐시 업데이트
      if (this.config.cacheEnabled) {
        this.updateCache(key, value, options);
      }
      
      // 통계 업데이트
      this.stats.writes++;
      
      // 이벤트 발생
      this.emitEvent(STORAGE_EVENTS.ITEM_SET, { 
        key, 
        value: this.deepClone(value), 
        options,
        sessionId: this.sessionId,
        windowId: this.windowId
      });
      
      console.debug(`Session item saved: ${key}`);
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to save session item ${key}:`, error);
      this.emitEvent(STORAGE_EVENTS.ERROR, { key, error: error as Error, operation: 'set' });
      
      // 쿼터 초과 에러 처리
      if ((error as Error).name === 'QuotaExceededError') {
        this.handleQuotaExceeded(key);
      }
      
      return false;
    }
  }

  /**
   * 아이템 가져오기
   */
  get<T = any>(key: string, defaultValue: T | null = null, _options: StorageOptions = {}): T {
    if (!this.isSupported) {
      return defaultValue as T;
    }

    try {
      // 캐시에서 먼저 확인
      if (this.config.cacheEnabled && this.cache.has(key)) {
        const cached = this.cache.get(key)!;
        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
          this.stats.cacheHits++;
          return this.deepClone(cached.value);
        } else {
          this.cache.delete(key);
        }
      }

      const fullKey = this.getFullKey(key);
      const rawData = sessionStorage.getItem(fullKey);
      
      if (rawData === null) {
        return defaultValue as T;
      }
      
      const parsedData = this.parseData(rawData);
      
      // 만료 확인
      if (this.config.enableTTL && this.isExpired(parsedData)) {
        this.remove(key);
        return defaultValue as T;
      }
      
      const value = parsedData.value;
      
      // 캐시 업데이트
      if (this.config.cacheEnabled) {
        this.updateCache(key, value);
      }
      
      // 통계 업데이트
      this.stats.reads++;
      
      console.debug(`Session item retrieved: ${key}`);
      return value;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to retrieve session item ${key}:`, error);
      this.emitEvent(STORAGE_EVENTS.ERROR, { key, error: error as Error, operation: 'get' });
      return defaultValue as T;
    }
  }

  /**
   * 아이템 존재 확인
   */
  has(key: string): boolean {
    if (!this.isSupported) return false;
    
    try {
      const fullKey = this.getFullKey(key);
      const rawData = sessionStorage.getItem(fullKey);
      
      if (rawData === null) return false;
      
      // TTL 확인
      if (this.config.enableTTL) {
        const parsedData = this.parseData(rawData);
        if (this.isExpired(parsedData)) {
          this.remove(key);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to check session item ${key}:`, error);
      return false;
    }
  }

  /**
   * 아이템 제거
   */
  remove(key: string): boolean {
    if (!this.isSupported) return false;

    try {
      const fullKey = this.getFullKey(key);
      const existed = sessionStorage.getItem(fullKey) !== null;
      
      sessionStorage.removeItem(fullKey);
      
      // TTL 타이머 제거
      this.clearTTLTimer(key);
      
      // 캐시에서도 제거
      if (this.config.cacheEnabled) {
        this.cache.delete(key);
      }
      
      if (existed) {
        this.emitEvent(STORAGE_EVENTS.ITEM_REMOVED, { 
          key,
          sessionId: this.sessionId,
          windowId: this.windowId
        });
        console.debug(`Session item removed: ${key}`);
      }
      
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to remove session item ${key}:`, error);
      this.emitEvent(STORAGE_EVENTS.ERROR, { key, error: error as Error, operation: 'remove' });
      return false;
    }
  }

  /**
   * 모든 아이템 제거
   */
  clear(): boolean {
    if (!this.isSupported) return false;

    try {
      const keys = this.getAllKeys();
      
      // 프리픽스가 일치하는 키들만 제거
      keys.forEach(key => {
        sessionStorage.removeItem(key);
      });
      
      // 모든 TTL 타이머 제거
      this.clearAllTTLTimers();
      
      // 캐시 클리어
      if (this.config.cacheEnabled) {
        this.cache.clear();
      }
      
      this.emitEvent(STORAGE_EVENTS.CLEARED, { 
        removedCount: keys.length,
        sessionId: this.sessionId,
        windowId: this.windowId
      });
      
      console.info(`Session storage cleared: ${keys.length} items removed`);
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error('Failed to clear session storage:', error);
      this.emitEvent(STORAGE_EVENTS.ERROR, { error: error as Error, operation: 'clear' });
      return false;
    }
  }

  /**
   * 모든 키 반환
   */
  keys(): string[] {
    if (!this.isSupported) return [];
    
    return this.getAllKeys().map(fullKey => 
      fullKey.substring(this.config.prefix.length)
    );
  }

  /**
   * 모든 데이터 반환
   */
  getAll(): Record<string, any> {
    if (!this.isSupported) return {};
    
    const result: Record<string, any> = {};
    const keys = this.keys();
    
    keys.forEach(key => {
      const value = this.get(key);
      if (value !== null) {
        result[key] = value;
      }
    });
    
    return result;
  }

  /**
   * 사용된 스토리지 크기 반환
   */
  getUsedSize(): number {
    if (!this.isSupported) return 0;
    
    try {
      let totalSize = 0;
      const keys = this.getAllKeys();
      
      keys.forEach(key => {
        const value = sessionStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      });
      
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate session storage size:', error);
      return 0;
    }
  }

  /**
   * 통계 반환
   */
  getStats(): StorageStats {
    return {
      ...this.stats,
      isSupported: this.isSupported,
      usedSize: this.getUsedSize(),
      itemCount: this.keys().length,
      cacheSize: this.cache.size,
      maxSize: this.config.maxSize
    };
  }

  /**
   * 이벤트 리스너 등록
   */
  on(event: string, listener: StorageEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    
    // 제거 함수 반환
    return () => this.off(event, listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(event: string, listener: StorageEventListener): boolean {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      return listeners.delete(listener);
    }
    return false;
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    this.cleanupExpiredItems();
  }

  /**
   * 세션 정보 반환
   */
  getSessionInfo(): SessionInfo {
    return {
      sessionId: this.sessionId,
      windowId: this.windowId,
      startTime: this.stats.sessionStart,
      duration: Date.now() - this.stats.sessionStart,
      itemCount: this.keys().length,
      usedSize: this.getUsedSize()
    };
  }

  /**
   * 윈도우별 데이터 저장
   */
  setForWindow(key: string, value: any, options: StorageOptions = {}): boolean {
    const windowKey = this.getWindowKey(key, true);
    return this.set(windowKey, value, options);
  }

  /**
   * 윈도우별 데이터 가져오기
   */
  getForWindow<T = any>(key: string, defaultValue: T | null = null): T {
    const windowKey = this.getWindowKey(key, true); // 윈도우 ID 포함해야 함
    return this.get(windowKey, defaultValue);
  }

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    if (!this.isSupported) {
      console.warn('🎫 SessionStorage not supported');
      return;
    }

    console.group('🎫 SessionStorage Debug');
    console.log('Session Info:', this.getSessionInfo());
    console.log('Stats:', this.getStats());
    console.log('All Items:', this.getAll());
    console.log('Cache:', Object.fromEntries(this.cache));
    console.log('TTL Timers:', this.ttlTimers.size);
    console.log('Configuration:', {
      prefix: this.config.prefix,
      maxSize: this.config.maxSize,
      compression: this.config.compression,
      encryption: this.config.encryption,
      enableTTL: this.config.enableTTL
    });
    console.groupEnd();
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    // 이벤트 리스너 제거
    if (this.config.enableEvents) {
      window.removeEventListener('storage', this.handleStorageEvent);
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      window.removeEventListener('unload', this.handleUnload);
    }
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    // 모든 TTL 타이머 정리
    this.clearAllTTLTimers();
    
    // 캐시 정리
    this.cache.clear();
    this.eventListeners.clear();
    
    console.info('SessionStorageWrapper destroyed');
  }

  // Private methods

  private getFullKey(key: string): string {
    return `${this.config.prefix}${key}`;
  }

  private getWindowKey(key: string, includeWindow: boolean): string {
    return includeWindow ? `${key}_${this.windowId}` : key;
  }

  private getAllKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.config.prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private prepareData(value: any, options: StorageOptions = {}): string {
    const data: TTLData = {
      value,
      timestamp: Date.now(),
      ...(options.ttl && { ttl: options.ttl }),
      ...(options.system && { system: true })
    };
    
    return JSON.stringify(data);
  }

  private parseData(rawData: string): TTLData {
    try {
      return JSON.parse(rawData);
    } catch (error) {
      // 레거시 데이터 처리
      return {
        value: rawData,
        timestamp: Date.now()
      };
    }
  }

  private isExpired(data: TTLData): boolean {
    if (!data.ttl) return false;
    return Date.now() - data.timestamp > data.ttl;
  }

  private checkSize(data: string): boolean {
    return data.length > this.config.maxSize;
  }

  private updateCache(key: string, value: any, options: StorageOptions = {}): void {
    if (!this.config.cacheEnabled) return;
    
    this.cache.set(key, {
      value: this.deepClone(value),
      timestamp: Date.now(),
      ...(options.ttl && { ttl: options.ttl })
    });
    
    // 캐시 크기 제한
    if (this.cache.size > STORAGE_LIMITS.CACHE_MAX_ITEMS) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  private setTTLTimer(key: string, ttl: number): void {
    // 기존 타이머 제거
    this.clearTTLTimer(key);
    
    // 새 타이머 설정
    const timerId = window.setTimeout(() => {
      this.remove(key);
      this.ttlTimers.delete(key);
    }, ttl);
    
    this.ttlTimers.set(key, timerId);
  }

  private clearTTLTimer(key: string): void {
    const timerId = this.ttlTimers.get(key);
    if (timerId) {
      clearTimeout(timerId);
      this.ttlTimers.delete(key);
    }
  }

  private clearAllTTLTimers(): void {
    this.ttlTimers.forEach(timerId => clearTimeout(timerId));
    this.ttlTimers.clear();
  }

  private cleanupExpiredItems(): void {
    if (!this.isSupported || !this.config.enableTTL) return;
    
    try {
      const keys = this.keys();
      let cleanedCount = 0;
      
      keys.forEach(key => {
        const fullKey = this.getFullKey(key);
        const rawData = sessionStorage.getItem(fullKey);
        
        if (rawData) {
          try {
            const parsedData = this.parseData(rawData);
            
            if (this.isExpired(parsedData)) {
              sessionStorage.removeItem(fullKey);
              this.clearTTLTimer(key);
              this.cache.delete(key);
              cleanedCount++;
            }
          } catch (error) {
            // 파싱 실패한 데이터 제거
            sessionStorage.removeItem(fullKey);
            cleanedCount++;
          }
        }
      });
      
      this.stats.cleanups++;
      
      if (cleanedCount > 0) {
        console.info(`Cleaned up ${cleanedCount} expired session items`);
      }
      
    } catch (error) {
      console.error('Failed to cleanup session storage:', error);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWindowId(): string {
    return `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private saveSessionInfo(): void {
    const sessionInfo = {
      sessionId: this.sessionId,
      windowId: this.windowId,
      startTime: this.stats.sessionStart,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    this.set(SYSTEM_KEYS.SESSION_INFO, sessionInfo, { system: true });
  }

  private emitEvent(event: string, data: Partial<StorageEvent>): void {
    if (!this.config.enableEvents) return;
    
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const eventData: StorageEvent = {
        ...data,
        timestamp: Date.now()
      } as StorageEvent;
      
      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          console.error(`Error in session storage event listener for ${event}:`, error);
        }
      });
    }
  }

  private handleStorageEvent = (event: Event): void => {
    const storageEvent = event as globalThis.StorageEvent;
    // sessionStorage는 같은 탭에서만 동작하므로 일반적으로 이 이벤트는 발생하지 않음
    if (storageEvent.key && storageEvent.key.startsWith(this.config.prefix)) {
      const key = storageEvent.key.substring(this.config.prefix.length);
      
      // 캐시 무효화
      if (this.config.cacheEnabled) {
        this.cache.delete(key);
      }
      
      console.debug(`Session storage event: ${storageEvent.type} for key ${key}`);
    }
  };

  private handleBeforeUnload = (): void => {
    this.set(SYSTEM_KEYS.LAST_HIDDEN, Date.now(), { system: true });
  };

  private handleUnload = (): void => {
    // 세션 종료 시 정리 작업
    this.clearAllTTLTimers();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      // 페이지가 숨겨질 때
      this.set(SYSTEM_KEYS.LAST_HIDDEN, Date.now(), { system: true });
    } else {
      // 페이지가 다시 보일 때
      this.set(SYSTEM_KEYS.LAST_VISIBLE, Date.now(), { system: true });
      
      // 만료된 아이템 정리
      if (this.config.enableTTL) {
        this.cleanupExpiredItems();
      }
    }
  };

  private handleQuotaExceeded(key: string): void {
    console.warn(`Session storage quota exceeded for key: ${key}`);
    
    // 자동 정리 시도
    if (this.config.enableTTL) {
      this.cleanupExpiredItems();
      console.info('Attempted automatic cleanup due to quota exceeded');
    }
  }

  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T;
    if (typeof obj === 'object') {
      const cloned = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  }
} 