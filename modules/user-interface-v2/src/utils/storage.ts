// ========================================
// Storage - 간단한 스토리지 래퍼 (V2 최적화)
// ========================================

export type StorageType = 'localStorage' | 'sessionStorage';

export interface StorageItem<T = any> {
  value: T;
  timestamp: number;
  expires?: number;
}

export interface StorageOptions {
  expires?: number; // 만료 시간 (밀리초)
  prefix?: string;  // 키 접두사
}

class StorageWrapper {
  private storage: Storage;
  private prefix: string;

  constructor(type: StorageType = 'localStorage', prefix = '') {
    this.storage = type === 'localStorage' ? window.localStorage : window.sessionStorage;
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  private isExpired(item: StorageItem): boolean {
    if (!item.expires) return false;
    return Date.now() > item.expires;
  }

  set<T>(key: string, value: T, options: StorageOptions = {}): boolean {
    try {
      const item: StorageItem<T> = {
        value,
        timestamp: Date.now(),
        expires: options.expires ? Date.now() + options.expires : undefined
      };

      this.storage.setItem(this.getKey(key), JSON.stringify(item));
      return true;
    } catch (error) {
      console.warn('Storage set failed:', error);
      return false;
    }
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const data = this.storage.getItem(this.getKey(key));
      if (!data) return defaultValue;

      const item: StorageItem<T> = JSON.parse(data);
      
      // 만료 체크
      if (this.isExpired(item)) {
        this.remove(key);
        return defaultValue;
      }

      return item.value;
    } catch (error) {
      console.warn('Storage get failed:', error);
      return defaultValue;
    }
  }

  has(key: string): boolean {
    try {
      const data = this.storage.getItem(this.getKey(key));
      if (!data) return false;

      const item: StorageItem = JSON.parse(data);
      if (this.isExpired(item)) {
        this.remove(key);
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      this.storage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      console.warn('Storage remove failed:', error);
      return false;
    }
  }

  clear(): boolean {
    try {
      if (this.prefix) {
        // 접두사가 있는 경우 해당 키들만 제거
        const keys = this.getKeys();
        keys.forEach(key => this.remove(key));
      } else {
        this.storage.clear();
      }
      return true;
    } catch (error) {
      console.warn('Storage clear failed:', error);
      return false;
    }
  }

  getKeys(): string[] {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key) {
          if (this.prefix) {
            if (key.startsWith(`${this.prefix}:`)) {
              keys.push(key.substring(this.prefix.length + 1));
            }
          } else {
            keys.push(key);
          }
        }
      }
      return keys;
    } catch (error) {
      console.warn('Storage getKeys failed:', error);
      return [];
    }
  }

  getSize(): number {
    try {
      let size = 0;
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key) {
          const value = this.storage.getItem(key);
          if (value) {
            size += key.length + value.length;
          }
        }
      }
      return size;
    } catch (error) {
      return 0;
    }
  }

  // 유틸리티 메서드들
  increment(key: string, amount = 1): number {
    const current = this.get<number>(key, 0) || 0;
    const newValue = current + amount;
    this.set(key, newValue);
    return newValue;
  }

  decrement(key: string, amount = 1): number {
    return this.increment(key, -amount);
  }

  toggle(key: string): boolean {
    const current = this.get<boolean>(key, false);
    const newValue = !current;
    this.set(key, newValue);
    return newValue;
  }

  // 배열 조작
  pushToArray<T>(key: string, item: T): T[] {
    const array = this.get<T[]>(key, []) || [];
    array.push(item);
    this.set(key, array);
    return array;
  }

  removeFromArray<T>(key: string, predicate: (item: T, index: number) => boolean): T[] {
    const array = this.get<T[]>(key, []) || [];
    const filtered = array.filter((item, index) => !predicate(item, index));
    this.set(key, filtered);
    return filtered;
  }

  // 객체 조작
  setProperty<T extends Record<string, any>>(key: string, property: keyof T, value: T[keyof T]): T {
    const obj = this.get<T>(key, {} as T) || ({} as T);
    obj[property] = value;
    this.set(key, obj);
    return obj;
  }

  getProperty<T extends Record<string, any>, K extends keyof T>(
    key: string, 
    property: K, 
    defaultValue?: T[K]
  ): T[K] | undefined {
    const obj = this.get<T>(key);
    return obj ? obj[property] : defaultValue;
  }

  // 만료된 항목 정리
  cleanup(): number {
    let cleaned = 0;
    const keys = this.getKeys();
    
    for (const key of keys) {
      try {
        const data = this.storage.getItem(this.getKey(key));
        if (!data) continue;

        const item: StorageItem = JSON.parse(data);
        if (this.isExpired(item)) {
          this.remove(key);
          cleaned++;
        }
      } catch (error) {
        // 파싱 실패한 항목도 제거
        this.remove(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  // 스토리지 정보
  getInfo() {
    return {
      type: this.storage === window.localStorage ? 'localStorage' : 'sessionStorage',
      prefix: this.prefix,
      keys: this.getKeys().length,
      size: this.getSize(),
      available: this.isAvailable()
    };
  }

  isAvailable(): boolean {
    try {
      const testKey = '__test_storage__';
      this.storage.setItem(testKey, 'test');
      this.storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

// 전역 인스턴스들
export const localStorage = new StorageWrapper('localStorage');
export const sessionStorage = new StorageWrapper('sessionStorage');

// 앱별 스토리지 (접두사 포함)
export const createAppStorage = (appName: string, type: StorageType = 'localStorage'): StorageWrapper => {
  return new StorageWrapper(type, appName);
};

// 편의 함수들 - 기본 localStorage 사용
export const setItem = <T>(key: string, value: T, options?: StorageOptions): boolean => {
  return localStorage.set(key, value, options);
};

export const getItem = <T>(key: string, defaultValue?: T): T | undefined => {
  return localStorage.get(key, defaultValue);
};

export const removeItem = (key: string): boolean => {
  return localStorage.remove(key);
};

export const hasItem = (key: string): boolean => {
  return localStorage.has(key);
};

export const clearStorage = (): boolean => {
  return localStorage.clear();
};

// 사용자 설정 관리를 위한 특별한 스토리지
export const userSettings = createAppStorage('userSettings');
export const appData = createAppStorage('appData');

// 자동 정리 - 1시간마다 만료된 항목 정리
let cleanupInterval: number | undefined;

export const startAutoCleanup = (intervalMs = 60 * 60 * 1000): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = window.setInterval(() => {
    const cleaned = localStorage.cleanup() + sessionStorage.cleanup();
    if (cleaned > 0) {
      console.log(`Storage cleanup: removed ${cleaned} expired items`);
    }
  }, intervalMs);
};

export const stopAutoCleanup = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }
};

// 페이지 로드 시 자동 정리 시작
if (typeof window !== 'undefined') {
  startAutoCleanup();
} 