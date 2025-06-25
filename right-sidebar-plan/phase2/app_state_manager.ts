// ============================================
// 앱 상태 관리 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../core/EventManager.js';
import type { AppInfo, AppState } from './types.js';

export interface AppStateData {
  scrollPosition?: number;
  formData?: Record<string, any>;
  filters?: Record<string, any>;
  selectedItems?: string[];
  expandedSections?: string[];
  customData?: any;
}

export interface StoredAppState {
  appId: string;
  lastAccessed: number;
  stateData: AppStateData;
  version: string;
}

export class AppStateManager {
  private static instance: AppStateManager;
  private stateStorage = new Map<string, StoredAppState>();
  private readonly STORAGE_KEY = 'rightsidebar-app-states';
  private readonly STATE_VERSION = '1.0.0';
  private readonly MAX_STORED_STATES = 10;
  private autosaveInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadFromStorage();
    this.setupAutosave();
  }

  static getInstance(): AppStateManager {
    if (!AppStateManager.instance) {
      AppStateManager.instance = new AppStateManager();
    }
    return AppStateManager.instance;
  }

  /**
   * 앱 상태 저장
   */
  saveAppState(appId: string, stateData: AppStateData): void {
    const storedState: StoredAppState = {
      appId,
      lastAccessed: Date.now(),
      stateData,
      version: this.STATE_VERSION
    };

    this.stateStorage.set(appId, storedState);
    this.cleanupOldStates();
    
    // 이벤트 발생
    eventManager.emit('app:state:saved' as any, { appId, stateData });
  }

  /**
   * 앱 상태 복원
   */
  restoreAppState(appId: string): AppStateData | null {
    const storedState = this.stateStorage.get(appId);
    
    if (!storedState) {
      return null;
    }

    // 상태 버전 체크
    if (storedState.version !== this.STATE_VERSION) {
      console.warn(`State version mismatch for app ${appId}. Ignoring stored state.`);
      this.stateStorage.delete(appId);
      return null;
    }

    // 마지막 접근 시간 업데이트
    storedState.lastAccessed = Date.now();
    
    // 이벤트 발생
    eventManager.emit('app:state:restored' as any, { appId, stateData: storedState.stateData });
    
    return storedState.stateData;
  }

  /**
   * 앱 상태 삭제
   */
  clearAppState(appId: string): void {
    this.stateStorage.delete(appId);
    eventManager.emit('app:state:cleared' as any, { appId });
  }

  /**
   * 모든 앱 상태 삭제
   */
  clearAllStates(): void {
    this.stateStorage.clear();
    this.saveToStorage();
    eventManager.emit('app:state:all-cleared' as any, {});
  }

  /**
   * 저장된 앱 목록 반환
   */
  getStoredApps(): string[] {
    return Array.from(this.stateStorage.keys());
  }

  /**
   * 앱 마지막 접근 시간 반환
   */
  getLastAccessed(appId: string): number | null {
    const storedState = this.stateStorage.get(appId);
    return storedState ? storedState.lastAccessed : null;
  }

  /**
   * 최근 사용한 앱 목록 반환
   */
  getRecentApps(limit: number = 5): string[] {
    return Array.from(this.stateStorage.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, limit)
      .map(state => state.appId);
  }

  /**
   * 로컬 스토리지에서 상태 로드
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredAppState[];
        parsed.forEach(state => {
          this.stateStorage.set(state.appId, state);
        });
        console.log(`✅ 앱 상태 ${parsed.length}개 로드됨`);
      }
    } catch (error) {
      console.error('❌ 앱 상태 로드 실패:', error);
      this.stateStorage.clear();
    }
  }

  /**
   * 로컬 스토리지에 상태 저장
   */
  private saveToStorage(): void {
    try {
      const states = Array.from(this.stateStorage.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(states));
    } catch (error) {
      console.error('❌ 앱 상태 저장 실패:', error);
    }
  }

  /**
   * 오래된 상태 정리
   */
  private cleanupOldStates(): void {
    if (this.stateStorage.size <= this.MAX_STORED_STATES) {
      return;
    }

    const states = Array.from(this.stateStorage.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed);

    // 가장 오래된 상태들 제거
    const toRemove = states.slice(this.MAX_STORED_STATES);
    toRemove.forEach(state => {
      this.stateStorage.delete(state.appId);
    });

    console.log(`🧹 오래된 앱 상태 ${toRemove.length}개 정리됨`);
  }

  /**
   * 자동 저장 설정
   */
  private setupAutosave(): void {
    // 30초마다 자동 저장
    this.autosaveInterval = setInterval(() => {
      this.saveToStorage();
    }, 30000);

    // 페이지 종료 시 저장
    window.addEventListener('beforeunload', () => {
      this.saveToStorage();
    });
  }

  /**
   * 정리
   */
  destroy(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
    this.saveToStorage();
  }
}

// ============================================
// 앱별 상태 관리 헬퍼 클래스
// ============================================

export class AppStateHelper {
  private appId: string;
  private stateManager: AppStateManager;
  private currentState: AppStateData = {};

  constructor(appId: string) {
    this.appId = appId;
    this.stateManager = AppStateManager.getInstance();
    this.loadState();
  }

  /**
   * 상태 로드
   */
  private loadState(): void {
    const restored = this.stateManager.restoreAppState(this.appId);
    if (restored) {
      this.currentState = restored;
    }
  }

  /**
   * 스크롤 위치 저장
   */
  saveScrollPosition(position: number): void {
    this.currentState.scrollPosition = position;
    this.saveState();
  }

  /**
   * 스크롤 위치 복원
   */
  restoreScrollPosition(): number {
    return this.currentState.scrollPosition || 0;
  }

  /**
   * 폼 데이터 저장
   */
  saveFormData(data: Record<string, any>): void {
    this.currentState.formData = { ...this.currentState.formData, ...data };
    this.saveState();
  }

  /**
   * 폼 데이터 복원
   */
  restoreFormData(): Record<string, any> {
    return this.currentState.formData || {};
  }

  /**
   * 필터 상태 저장
   */
  saveFilters(filters: Record<string, any>): void {
    this.currentState.filters = filters;
    this.saveState();
  }

  /**
   * 필터 상태 복원
   */
  restoreFilters(): Record<string, any> {
    return this.currentState.filters || {};
  }

  /**
   * 선택된 아이템 저장
   */
  saveSelectedItems(items: string[]): void {
    this.currentState.selectedItems = items;
    this.saveState();
  }

  /**
   * 선택된 아이템 복원
   */
  restoreSelectedItems(): string[] {
    return this.currentState.selectedItems || [];
  }

  /**
   * 확장된 섹션 저장
   */
  saveExpandedSections(sections: string[]): void {
    this.currentState.expandedSections = sections;
    this.saveState();
  }

  /**
   * 확장된 섹션 복원
   */
  restoreExpandedSections(): string[] {
    return this.currentState.expandedSections || [];
  }

  /**
   * 커스텀 데이터 저장
   */
  saveCustomData(data: any): void {
    this.currentState.customData = data;
    this.saveState();
  }

  /**
   * 커스텀 데이터 복원
   */
  restoreCustomData(): any {
    return this.currentState.customData;
  }

  /**
   * 전체 상태 가져오기
   */
  getState(): AppStateData {
    return { ...this.currentState };
  }

  /**
   * 전체 상태 설정
   */
  setState(state: AppStateData): void {
    this.currentState = { ...state };
    this.saveState();
  }

  /**
   * 상태 저장 (내부 메서드)
   */
  private saveState(): void {
    this.stateManager.saveAppState(this.appId, this.currentState);
  }

  /**
   * 상태 클리어
   */
  clearState(): void {
    this.currentState = {};
    this.stateManager.clearAppState(this.appId);
  }
}

// ============================================
// 상태 자동 저장 데코레이터 (옵션)
// ============================================

export function withStateManagement(appId: string) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      private stateHelper: AppStateHelper;

      constructor(...args: any[]) {
        super(...args);
        this.stateHelper = new AppStateHelper(appId);
        
        // 초기 상태 복원
        this.restoreState();
      }

      private restoreState(): void {
        // 스크롤 위치 복원
        const scrollPosition = this.stateHelper.restoreScrollPosition();
        if (scrollPosition > 0) {
          setTimeout(() => {
            const container = (this as any).container?.querySelector('.overflow-y-auto');
            if (container) {
              container.scrollTop = scrollPosition;
            }
          }, 100);
        }
      }

      // 상태 헬퍼 접근 메서드
      getStateHelper(): AppStateHelper {
        return this.stateHelper;
      }
    };
  };
}

// 싱글톤 인스턴스 내보내기
export const appStateManager = AppStateManager.getInstance();
