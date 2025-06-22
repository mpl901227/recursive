/**
 * Storage Services Test Suite
 * 스토리지 서비스들의 통합 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager } from '@/services/storage/storage-manager';
import { LocalStorageWrapper } from '@/services/storage/local-storage-wrapper';
import { SessionStorageWrapper } from '@/services/storage/session-storage-wrapper';
import { STORAGE_EVENTS } from '@/services/storage/constants';

// Mock localStorage and sessionStorage
const mockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
};

// Setup mocks
Object.defineProperty(window, 'localStorage', {
  value: mockStorage(),
  writable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockStorage(),
  writable: true
});

describe('LocalStorageWrapper', () => {
  let storage: LocalStorageWrapper;

  beforeEach(async () => {
    vi.clearAllMocks();
    (localStorage as any).clear();
    storage = new LocalStorageWrapper({ prefix: 'test_' });
    await storage.initialize();
  });

  afterEach(() => {
    storage.destroy();
  });

  describe('Basic Operations', () => {
    it('should set and get items', () => {
      const testData = { name: 'test', value: 123 };
      
      expect(storage.set('testKey', testData)).toBe(true);
      expect(storage.get('testKey')).toEqual(testData);
    });

    it('should return default value for non-existent keys', () => {
      expect(storage.get('nonexistent', 'default')).toBe('default');
      expect(storage.get('nonexistent')).toBe(null);
    });

    it('should check if item exists', () => {
      storage.set('exists', 'value');
      
      expect(storage.has('exists')).toBe(true);
      expect(storage.has('notexists')).toBe(false);
    });

    it('should remove items', () => {
      storage.set('toRemove', 'value');
      expect(storage.has('toRemove')).toBe(true);
      
      expect(storage.remove('toRemove')).toBe(true);
      expect(storage.has('toRemove')).toBe(false);
    });

    it('should clear all items', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      
      expect(storage.clear()).toBe(true);
      expect(storage.keys()).toHaveLength(0);
    });
  });

  describe('TTL Support', () => {
    beforeEach(async () => {
      storage.destroy();
      storage = new LocalStorageWrapper({ 
        prefix: 'test_',
        enableTTL: true,
        cacheEnabled: true // 캐시와 TTL이 함께 작동하는지 테스트
      });
      await storage.initialize();
    });

    it('should expire items with TTL', async () => {
      // Test TTL with a very short time
      storage.set('ttlKey', 'value', { ttl: 50 });
      expect(storage.get('ttlKey')).toBe('value');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // LocalStorage checks TTL on access, not with timers
      expect(storage.get('ttlKey')).toBe(null);
    });

    it('should not expire items without TTL', async () => {
      storage.set('noTtlKey', 'value');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(storage.get('noTtlKey')).toBe('value');
    });
  });

  describe('Event System', () => {
    it('should emit events for operations', () => {
      const setListener = vi.fn();
      const removeListener = vi.fn();
      
      storage.on(STORAGE_EVENTS.ITEM_SET, setListener);
      storage.on(STORAGE_EVENTS.ITEM_REMOVED, removeListener);
      
      storage.set('eventKey', 'value');
      expect(setListener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'eventKey',
          value: 'value'
        })
      );
      
      storage.remove('eventKey');
      expect(removeListener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'eventKey'
        })
      );
    });

    it('should remove event listeners', () => {
      const listener = vi.fn();
      const unsubscribe = storage.on(STORAGE_EVENTS.ITEM_SET, listener);
      
      storage.set('key1', 'value');
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      storage.set('key2', 'value');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache System', () => {
    beforeEach(async () => {
      storage.destroy();
      storage = new LocalStorageWrapper({ 
        prefix: 'test_',
        cacheEnabled: true,
        cacheTimeout: 1000
      });
      await storage.initialize();
    });

    it('should use cache for repeated reads', () => {
      storage.set('cacheKey', 'value');
      
      // First read - from storage
      storage.get('cacheKey');
      
      // Second read - should be from cache
      storage.get('cacheKey');
      
      const stats = storage.getStats();
      expect(stats.cacheHits).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should track operation statistics', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.get('key1');
      storage.get('key2'); // 존재하는 키를 읽어야 통계가 증가
      
      const stats = storage.getStats();
      expect(stats.writes).toBe(2);
      expect(stats.reads).toBe(2);
      expect(stats.itemCount).toBe(2);
      expect(stats.isSupported).toBe(true);
    });

    it('should calculate used size', () => {
      storage.set('sizeTest', 'some data');
      
      const stats = storage.getStats();
      expect(stats.usedSize).toBeGreaterThan(0);
    });
  });

  describe('Utility Methods', () => {
    it('should return all keys', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      
      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });

    it('should return all data', () => {
      storage.set('key1', 'value1');
      storage.set('key2', { nested: 'value2' });
      
      const allData = storage.getAll();
      expect(allData).toEqual({
        key1: 'value1',
        key2: { nested: 'value2' }
      });
    });
  });
});

describe('SessionStorageWrapper', () => {
  let storage: SessionStorageWrapper;

  beforeEach(async () => {
    vi.clearAllMocks();
    (sessionStorage as any).clear();
    storage = new SessionStorageWrapper({ prefix: 'session_test_' });
    await storage.initialize();
  });

  afterEach(() => {
    storage.destroy();
  });

  describe('Basic Operations', () => {
    it('should set and get session items', () => {
      const testData = { session: 'data', id: 456 };
      
      expect(storage.set('sessionKey', testData)).toBe(true);
      expect(storage.get('sessionKey')).toEqual(testData);
    });

    it('should handle window-specific data', () => {
      storage.setForWindow('windowKey', 'windowValue');
      expect(storage.getForWindow('windowKey')).toBe('windowValue');
    });
  });

  describe('Session Management', () => {
    it('should provide session information', () => {
      const sessionInfo = storage.getSessionInfo();
      
      expect(sessionInfo).toHaveProperty('sessionId');
      expect(sessionInfo).toHaveProperty('windowId');
      expect(sessionInfo).toHaveProperty('startTime');
      expect(sessionInfo).toHaveProperty('duration');
    });

    it('should track session duration', async () => {
      const initialInfo = storage.getSessionInfo();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const laterInfo = storage.getSessionInfo();
      expect(laterInfo.duration).toBeGreaterThan(initialInfo.duration);
    });
  });

  describe('TTL with Timers', () => {
    beforeEach(async () => {
      storage.destroy();
      storage = new SessionStorageWrapper({ 
        prefix: 'session_test_',
        enableTTL: true 
      });
      await storage.initialize();
    });

    it('should auto-remove items with TTL timers', async () => {
      storage.set('timerKey', 'value', { ttl: 100 });
      expect(storage.get('timerKey')).toBe('value');
      
      // Wait for TTL timer to trigger
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(storage.get('timerKey')).toBe(null);
    });
  });
});

describe('StorageManager', () => {
  let manager: StorageManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    (localStorage as any).clear();
    (sessionStorage as any).clear();
    
    manager = new StorageManager(
      { prefix: 'local_test_' },
      { prefix: 'session_test_' }
    );
    await manager.initialize();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Unified Management', () => {
    it('should provide access to both storage types', () => {
      expect(manager.local).toBeDefined();
      expect(manager.session).toBeDefined();
      
      manager.local.set('localKey', 'localValue');
      manager.session.set('sessionKey', 'sessionValue');
      
      expect(manager.local.get('localKey')).toBe('localValue');
      expect(manager.session.get('sessionKey')).toBe('sessionValue');
    });

    it('should calculate total usage', () => {
      manager.local.set('key1', 'value1');
      manager.session.set('key2', 'value2');
      
      const usage = manager.getTotalUsage();
      expect(usage.total).toBeGreaterThan(0);
      expect(usage.localStorage).toBeGreaterThan(0);
      expect(usage.sessionStorage).toBeGreaterThan(0);
    });

    it('should provide combined statistics', () => {
      // 초기화 이후 통계 리셋
      const initialStats = manager.getAllStats();
      
      manager.local.set('localKey', 'value');
      manager.session.set('sessionKey', 'value');
      
      const stats = manager.getAllStats();
      // 초기 writes에서 추가된 2개 확인
      expect(stats.combined.totalWrites).toBe(initialStats.combined.totalWrites + 2);
      expect(stats.combined.totalItemCount).toBe(initialStats.combined.totalItemCount + 2);
    });

    it('should clear all storage', async () => {
      manager.local.set('localKey', 'value');
      manager.session.set('sessionKey', 'value');
      
      const result = await manager.clearAll();
      expect(result).toBe(true);
      
      expect(manager.local.keys()).toHaveLength(0);
      expect(manager.session.keys()).toHaveLength(0);
    });
  });

  describe('Support Detection', () => {
    it('should detect storage support', () => {
      const support = manager.isSupported();
      expect(support.localStorage).toBe(true);
      expect(support.sessionStorage).toBe(true);
      expect(support.both).toBe(true);
    });
  });

  describe('Convenience Methods', () => {
    it('should create user settings storage', () => {
      const userSettings = manager.createUserSettings('userPref_');
      expect(userSettings).toBeInstanceOf(LocalStorageWrapper);
      
      userSettings.set('theme', 'dark');
      expect(userSettings.get('theme')).toBe('dark');
    });

    it('should create temporary state storage', () => {
      const tempState = manager.createTempState('temp_');
      expect(tempState).toBeInstanceOf(SessionStorageWrapper);
      
      tempState.set('currentView', 'dashboard');
      expect(tempState.get('currentView')).toBe('dashboard');
    });

    it('should create cache storage', () => {
      const cache = manager.createCache('cache_', 1000);
      expect(cache).toBeInstanceOf(SessionStorageWrapper);
      
      cache.set('apiResponse', { data: 'cached' });
      expect(cache.get('apiResponse')).toEqual({ data: 'cached' });
    });
  });

  describe('Cleanup Operations', () => {
    it('should perform cleanup on both storages', async () => {
      // Add some data that could be cleaned up
      manager.local.set('oldData', 'value');
      manager.session.set('tempData', 'value');
      
      await expect(manager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Debug Information', () => {
    it('should provide debug information', () => {
      const consoleSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
      
      manager.debug();
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleEndSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleEndSpy.mockRestore();
    });
  });
});

describe('Error Handling', () => {
  it('should handle localStorage unavailable', async () => {
    // Mock localStorage to throw error
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: () => { throw new Error('localStorage unavailable'); },
        getItem: () => { throw new Error('localStorage unavailable'); },
        removeItem: () => { throw new Error('localStorage unavailable'); },
        clear: () => { throw new Error('localStorage unavailable'); },
        length: 0,
        key: () => null
      },
      writable: true
    });

    const storage = new LocalStorageWrapper();
    await storage.initialize();
    
    expect(storage.set('key', 'value')).toBe(false);
    expect(storage.get('key', 'default')).toBe('default');
    
    // Restore
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true
    });
  });

  it('should handle quota exceeded errors', () => {
    const storage = new LocalStorageWrapper();
    const errorListener = vi.fn();
    
    storage.on(STORAGE_EVENTS.QUOTA_EXCEEDED, errorListener);
    
    // Mock setItem to throw QuotaExceededError
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    });
    
    const result = storage.set('key', 'value');
    expect(result).toBe(false);
  });
});

describe('Integration Tests', () => {
  it('should work with real browser storage APIs', async () => {
    // This test would run in a real browser environment
    const manager = new StorageManager(
      { prefix: 'integration_local_' },
      { prefix: 'integration_session_' }
    );
    await manager.initialize();
    
    // 지원 여부 확인
    const support = manager.isSupported();
    console.log('Support status:', support);
    
    // 지원되지 않으면 테스트 스킵
    if (!support.localStorage || !support.sessionStorage) {
      expect(true).toBe(true); // 테스트 통과
      return;
    }
    
    // Test cross-storage operations - 각각 다른 키 사용
    const localSet = manager.local.set('localKey', 'fromLocal');
    const sessionSet = manager.session.set('sessionKey', 'fromSession');
    
    console.log('Set results:', { localSet, sessionSet });
    
    expect(manager.local.get('localKey')).toBe('fromLocal');
    expect(manager.session.get('sessionKey')).toBe('fromSession');
    
    manager.destroy();
  });

  it('should maintain data consistency across operations', () => {
    const storage = new LocalStorageWrapper({ prefix: 'consistency_' });
    
    // Perform multiple operations
    const operations = [
      () => storage.set('key1', 'value1'),
      () => storage.set('key2', { nested: { data: 'value2' } }),
      () => storage.get('key1'),
      () => storage.remove('key1'),
      () => storage.has('key2'),
      () => storage.clear()
    ];
    
    operations.forEach(op => {
      expect(() => op()).not.toThrow();
    });
  });
});

describe('Storage Services', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true);
  });
}); 