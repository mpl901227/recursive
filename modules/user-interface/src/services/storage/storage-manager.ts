/**
 * Storage Manager
 * LocalStorage와 SessionStorage를 통합 관리하는 클래스
 */

import { LocalStorageWrapper } from './local-storage-wrapper';
import { SessionStorageWrapper } from './session-storage-wrapper';
import type { StorageConfig, StorageStats, IStorage } from './types';
import { DEFAULT_CONFIG, SESSION_DEFAULT_CONFIG } from './constants';

/**
 * 스토리지 매니저 클래스
 * LocalStorage와 SessionStorage를 통합하여 관리
 */
export class StorageManager {
  private localStorageWrapper: LocalStorageWrapper;
  private sessionStorageWrapper: SessionStorageWrapper;
  private isInitialized = false;

  constructor(
    localConfig: Partial<StorageConfig> = {},
    sessionConfig: Partial<StorageConfig> = {}
  ) {
    // LocalStorage 래퍼 초기화
    this.localStorageWrapper = new LocalStorageWrapper({
      ...DEFAULT_CONFIG,
      ...localConfig
    });

    // SessionStorage 래퍼 초기화
    this.sessionStorageWrapper = new SessionStorageWrapper({
      ...SESSION_DEFAULT_CONFIG,
      ...sessionConfig
    });
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await Promise.all([
        this.localStorageWrapper.initialize(),
        this.sessionStorageWrapper.initialize()
      ]);

      this.isInitialized = true;
      console.debug('StorageManager initialized');
    } catch (error) {
      console.error('Failed to initialize StorageManager:', error);
      throw error;
    }
  }

  /**
   * LocalStorage 인스턴스 반환
   */
  get local(): IStorage {
    return this.localStorageWrapper;
  }

  /**
   * SessionStorage 인스턴스 반환
   */
  get session(): IStorage {
    return this.sessionStorageWrapper;
  }

  /**
   * 전체 스토리지 사용량 조회
   */
  getTotalUsage(): {
    localStorage: number;
    sessionStorage: number;
    total: number;
  } {
    const localUsage = this.localStorageWrapper.getUsedSize();
    const sessionUsage = this.sessionStorageWrapper.getUsedSize();

    return {
      localStorage: localUsage,
      sessionStorage: sessionUsage,
      total: localUsage + sessionUsage
    };
  }

  /**
   * 전체 통계 조회
   */
  getAllStats(): {
    localStorage: StorageStats;
    sessionStorage: StorageStats;
    combined: {
      totalReads: number;
      totalWrites: number;
      totalErrors: number;
      totalCacheHits: number;
      totalCleanups: number;
      totalUsedSize: number;
      totalItemCount: number;
    };
  } {
    const localStats = this.localStorageWrapper.getStats();
    const sessionStats = this.sessionStorageWrapper.getStats();

    return {
      localStorage: localStats,
      sessionStorage: sessionStats,
      combined: {
        totalReads: localStats.reads + sessionStats.reads,
        totalWrites: localStats.writes + sessionStats.writes,
        totalErrors: localStats.errors + sessionStats.errors,
        totalCacheHits: localStats.cacheHits + sessionStats.cacheHits,
        totalCleanups: localStats.cleanups + sessionStats.cleanups,
        totalUsedSize: localStats.usedSize + sessionStats.usedSize,
        totalItemCount: localStats.itemCount + sessionStats.itemCount
      }
    };
  }

  /**
   * 모든 스토리지 정리
   */
  async clearAll(): Promise<boolean> {
    try {
      const results = await Promise.all([
        this.localStorageWrapper.clear(),
        this.sessionStorageWrapper.clear()
      ]);

      return results.every(result => result);
    } catch (error) {
      console.error('Failed to clear all storage:', error);
      return false;
    }
  }

  /**
   * 만료된 데이터 정리
   */
  async cleanup(): Promise<void> {
    try {
      await Promise.all([
        this.localStorageWrapper.cleanup?.(),
        this.sessionStorageWrapper.cleanup?.()
      ]);
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
    }
  }

  /**
   * 스토리지 지원 여부 확인
   */
  isSupported(): {
    localStorage: boolean;
    sessionStorage: boolean;
    both: boolean;
  } {
    const localSupported = this.localStorageWrapper.getStats().isSupported;
    const sessionSupported = this.sessionStorageWrapper.getStats().isSupported;

    return {
      localStorage: localSupported,
      sessionStorage: sessionSupported,
      both: localSupported && sessionSupported
    };
  }

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    console.group('🗄️ StorageManager Debug');
    console.log('Initialization Status:', this.isInitialized);
    console.log('Support Status:', this.isSupported());
    console.log('Total Usage:', this.getTotalUsage());
    console.log('All Stats:', this.getAllStats());
    console.groupEnd();

    // 개별 스토리지 디버그 정보
    this.localStorageWrapper.debug();
    this.sessionStorageWrapper.debug();
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    try {
      this.localStorageWrapper.destroy();
      this.sessionStorageWrapper.destroy();
      this.isInitialized = false;
      console.debug('StorageManager destroyed');
    } catch (error) {
      console.error('Failed to destroy StorageManager:', error);
    }
  }

  /**
   * 편의 메서드: 사용자 설정용 LocalStorage
   */
  createUserSettings(prefix = 'userSettings_'): LocalStorageWrapper {
    return new LocalStorageWrapper({
      ...DEFAULT_CONFIG,
      prefix,
      enableEvents: true,
      autoCleanup: true,
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90일
    });
  }

  /**
   * 편의 메서드: 임시 상태용 SessionStorage
   */
  createTempState(prefix = 'tempState_'): SessionStorageWrapper {
    return new SessionStorageWrapper({
      ...SESSION_DEFAULT_CONFIG,
      prefix,
      enableEvents: true,
      enableTTL: true
    });
  }

  /**
   * 편의 메서드: 캐시용 SessionStorage
   */
  createCache(prefix = 'cache_', ttl = 5 * 60 * 1000): SessionStorageWrapper {
    return new SessionStorageWrapper({
      ...SESSION_DEFAULT_CONFIG,
      prefix,
      enableTTL: true,
      cacheTimeout: ttl
    });
  }
} 