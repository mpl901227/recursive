/**
 * Local Storage Wrapper
 * 브라우저 로컬 스토리지를 안전하게 관리하는 클래스
 */

import type { 
  StorageConfig, 
  StorageOptions, 
  StorageStats, 
  StorageEvent, 
  StorageEventListener, 
  TTLData, 
  CacheEntry,
  IStorage 
} from './types';
import { STORAGE_EVENTS, DEFAULT_CONFIG, STORAGE_LIMITS } from './constants';

/**
 * 로컬 스토리지 래퍼 클래스
 */
export class LocalStorageWrapper implements IStorage {
  private config: Required<StorageConfig>;
  private eventListeners = new Map<string, Set<StorageEventListener>>();
  private cache = new Map<string, CacheEntry>();
  private isSupported = false;
  private stats = {
    reads: 0,
    writes: 0,
    errors: 0,
    cacheHits: 0,
    cleanups: 0
  };
  private cleanupTimer?: number;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isSupported = this.checkSupport();
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    if (!this.isSupported) {
      console.warn('localStorage is not supported');
      return;
    }

    // 브라우저 스토리지 이벤트 리스너
    if (this.config.enableEvents) {
      window.addEventListener('storage', this.handleStorageEvent as EventListener);
    }

    // 자동 정리 스케줄
    if (this.config.autoCleanup) {
      this.scheduleCleanup();
    }

    // 기존 데이터 검증
    this.validateExistingData();

    console.debug('LocalStorageWrapper initialized');
  }

  /**
   * 스토리지 지원 확인
   */
  private checkSupport(): boolean {
    try {
      const testKey = '__localStorage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.error('localStorage not supported:', error);
      return false;
    }
  }

  /**
   * 아이템 저장
   */
  set(key: string, value: any, options: StorageOptions = {}): boolean {
    if (!this.isSupported) {
      console.warn('localStorage not supported');
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
      localStorage.setItem(fullKey, data);
      
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
        options 
      });
      
      console.debug(`Item saved: ${key}`);
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to save item ${key}:`, error);
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
        const now = Date.now();
        
        // 캐시 자체의 TTL 확인
        const cacheExpired = now - cached.timestamp >= this.config.cacheTimeout;
        
        // 데이터의 TTL 확인
        const dataExpired = this.config.enableTTL && cached.ttl && 
                           now - cached.timestamp >= cached.ttl;
        
        if (cacheExpired || dataExpired) {
          this.cache.delete(key);
          if (dataExpired) {
            // 실제 스토리지에서도 제거
            this.remove(key);
            return defaultValue as T;
          }
        } else {
          this.stats.cacheHits++;
          this.stats.reads++; // 캐시에서 읽어도 읽기 통계 증가
          return this.deepClone(cached.value);
        }
      }

      const fullKey = this.getFullKey(key);
      const rawData = localStorage.getItem(fullKey);
      
      if (rawData === null) {
        return defaultValue as T;
      }
      
      const parsedData = this.parseData(rawData);
      
      // 만료 확인
      if (this.config.enableTTL && this.isExpired(parsedData)) {
        // console.log(`TTL expired for key ${key}, removing...`);
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
      
      console.debug(`Item retrieved: ${key}`);
      return value;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to retrieve item ${key}:`, error);
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
      const rawData = localStorage.getItem(fullKey);
      
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
      console.error(`Failed to check item ${key}:`, error);
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
      const existed = localStorage.getItem(fullKey) !== null;
      
      localStorage.removeItem(fullKey);
      
      // 캐시에서도 제거
      if (this.config.cacheEnabled) {
        this.cache.delete(key);
      }
      
      if (existed) {
        this.emitEvent(STORAGE_EVENTS.ITEM_REMOVED, { key });
        console.debug(`Item removed: ${key}`);
      }
      
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to remove item ${key}:`, error);
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
        localStorage.removeItem(key);
      });
      
      // 캐시 클리어
      if (this.config.cacheEnabled) {
        this.cache.clear();
      }
      
      this.emitEvent(STORAGE_EVENTS.CLEARED, { removedCount: keys.length });
      
      console.info(`Local storage cleared: ${keys.length} items removed`);
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.error('Failed to clear local storage:', error);
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
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      });
      
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate storage size:', error);
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
    if (!this.isSupported) return;
    
    try {
      const keys = this.keys();
      let cleanedCount = 0;
      
      keys.forEach(key => {
        const fullKey = this.getFullKey(key);
        const rawData = localStorage.getItem(fullKey);
        
        if (rawData) {
          try {
            const parsedData = this.parseData(rawData);
            
            // TTL 만료 확인
            if (this.config.enableTTL && this.isExpired(parsedData)) {
              localStorage.removeItem(fullKey);
              this.cache.delete(key);
              cleanedCount++;
            }
            // 최대 나이 확인
            else if (this.config.autoCleanup && parsedData.timestamp) {
              const age = Date.now() - parsedData.timestamp;
              if (age > this.config.maxAge) {
                localStorage.removeItem(fullKey);
                this.cache.delete(key);
                cleanedCount++;
              }
            }
          } catch (error) {
            // 파싱 실패한 데이터 제거
            localStorage.removeItem(fullKey);
            cleanedCount++;
          }
        }
      });
      
      this.stats.cleanups++;
      
      if (cleanedCount > 0) {
        console.info(`Cleaned up ${cleanedCount} expired items`);
      }
      
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
    }
  }

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    if (!this.isSupported) {
      console.warn('💾 LocalStorage not supported');
      return;
    }

    console.group('💾 LocalStorage Debug');
    console.log('Configuration:', this.config);
    console.log('Stats:', this.getStats());
    console.log('All Items:', this.getAll());
    console.log('Cache:', Object.fromEntries(this.cache));
    console.groupEnd();
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    if (this.config.enableEvents) {
      window.removeEventListener('storage', this.handleStorageEvent as EventListener);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cache.clear();
    this.eventListeners.clear();
    
    console.info('LocalStorageWrapper destroyed');
  }

  // Private methods

  private getFullKey(key: string): string {
    return `${this.config.prefix}${key}`;
  }

  private getAllKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
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
    const now = Date.now();
    const elapsed = now - data.timestamp;
    const isExpired = elapsed > data.ttl;
    // console.log(`TTL check: now=${now}, timestamp=${data.timestamp}, elapsed=${elapsed}, ttl=${data.ttl}, expired=${isExpired}`);
    return isExpired;
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
          console.error(`Error in storage event listener for ${event}:`, error);
        }
      });
    }
  }

  private handleStorageEvent = (event: Event): void => {
    const storageEvent = event as globalThis.StorageEvent;
    if (storageEvent.key && storageEvent.key.startsWith(this.config.prefix)) {
      const key = storageEvent.key.substring(this.config.prefix.length);
      
      // 캐시 무효화
      if (this.config.cacheEnabled) {
        this.cache.delete(key);
      }
      
      console.debug(`Storage event: ${storageEvent.type} for key ${key}`);
    }
  };

  private handleQuotaExceeded(key: string): void {
    console.warn(`Storage quota exceeded for key: ${key}`);
    
    // 자동 정리 시도
    if (this.config.autoCleanup) {
      this.cleanup();
      console.info('Attempted automatic cleanup due to quota exceeded');
    }
  }

  private validateExistingData(): void {
    if (!this.isSupported || !this.config.enableTTL) return;
    
    try {
      const keys = this.keys();
      let invalidCount = 0;
      
      keys.forEach(key => {
        try {
          const fullKey = this.getFullKey(key);
          const rawData = localStorage.getItem(fullKey);
          if (rawData) {
            this.parseData(rawData);
          }
        } catch (error) {
          // 유효하지 않은 데이터 제거
          this.remove(key);
          invalidCount++;
        }
      });
      
      if (invalidCount > 0) {
        console.info(`Removed ${invalidCount} invalid data entries`);
      }
    } catch (error) {
      console.error('Failed to validate existing data:', error);
    }
  }

  private scheduleCleanup(): void {
    if (!this.config.autoCleanup) return;
    
    // 1시간마다 정리 작업 실행
    this.cleanupTimer = window.setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
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