// ============================================
// 앱 상태 관리 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../../core/EventManager.js';
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
  private isOpen = false;

  private constructor() {
    this.loadFromStorage();
    this.setupAutosave();
    this.setupEventListeners();
  }

  static getInstance(): AppStateManager {
    if (!AppStateManager.instance) {
      AppStateManager.instance = new AppStateManager();
    }
    return AppStateManager.instance;
  }

  private setupEventListeners(): void {
    eventManager.on('rightsidebar:toggle' as any, () => {
      this.toggleSidebar();
    });

    eventManager.on('rightsidebar:open' as any, () => {
      this.openSidebar();
    });

    eventManager.on('rightsidebar:close' as any, () => {
      this.closeSidebar();
    });
  }

  private toggleSidebar(): void {
    if (this.isOpen) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  private openSidebar(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.classList.add('rightsidebar-open');
    eventManager.emit('rightsidebar:opened' as any, {});
  }

  private closeSidebar(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('rightsidebar-open');
    eventManager.emit('rightsidebar:closed' as any, {});
  }

  saveAppState(appId: string, stateData: AppStateData): void {
    const storedState: StoredAppState = {
      appId,
      lastAccessed: Date.now(),
      stateData,
      version: this.STATE_VERSION
    };

    this.stateStorage.set(appId, storedState);
    this.cleanupOldStates();
    
    eventManager.emit('app:state:saved' as any, { appId, stateData });
  }

  restoreAppState(appId: string): AppStateData | null {
    const storedState = this.stateStorage.get(appId);
    
    if (!storedState) {
      return null;
    }

    if (storedState.version !== this.STATE_VERSION) {
      console.warn(`State version mismatch for app ${appId}. Ignoring stored state.`);
      this.stateStorage.delete(appId);
      return null;
    }

    storedState.lastAccessed = Date.now();
    
    eventManager.emit('app:state:restored' as any, { appId, stateData: storedState.stateData });
    
    return storedState.stateData;
  }

  clearAppState(appId: string): void {
    this.stateStorage.delete(appId);
    eventManager.emit('app:state:cleared' as any, { appId });
  }

  clearAllStates(): void {
    this.stateStorage.clear();
    this.saveToStorage();
    eventManager.emit('app:state:all-cleared' as any, {});
  }

  getStoredApps(): string[] {
    return Array.from(this.stateStorage.keys());
  }

  getLastAccessed(appId: string): number | null {
    const storedState = this.stateStorage.get(appId);
    return storedState ? storedState.lastAccessed : null;
  }

  getRecentApps(limit: number = 5): string[] {
    return Array.from(this.stateStorage.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, limit)
      .map(state => state.appId);
  }

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

  private saveToStorage(): void {
    try {
      const states = Array.from(this.stateStorage.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(states));
    } catch (error) {
      console.error('❌ 앱 상태 저장 실패:', error);
    }
  }

  private cleanupOldStates(): void {
    if (this.stateStorage.size <= this.MAX_STORED_STATES) {
      return;
    }

    const states = Array.from(this.stateStorage.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed);

    const toRemove = states.slice(this.MAX_STORED_STATES);
    toRemove.forEach(state => {
      this.stateStorage.delete(state.appId);
    });

    console.log(`🧹 오래된 앱 상태 ${toRemove.length}개 정리됨`);
  }

  private setupAutosave(): void {
    this.autosaveInterval = setInterval(() => {
      this.saveToStorage();
    }, 30000);

    window.addEventListener('beforeunload', () => {
      this.saveToStorage();
    });
  }

  destroy(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }
    this.saveToStorage();
    this.stateStorage.clear();
  }
}

export class AppStateHelper {
  private appId: string;
  private stateManager: AppStateManager;
  private currentState: AppStateData = {};

  constructor(appId: string) {
    this.appId = appId;
    this.stateManager = AppStateManager.getInstance();
    this.loadState();
  }

  private loadState(): void {
    const savedState = this.stateManager.restoreAppState(this.appId);
    if (savedState) {
      this.currentState = savedState;
    }
  }

  saveScrollPosition(position: number): void {
    this.currentState.scrollPosition = position;
    this.saveState();
  }

  restoreScrollPosition(): number {
    return this.currentState.scrollPosition || 0;
  }

  saveFormData(data: Record<string, any>): void {
    this.currentState.formData = data;
    this.saveState();
  }

  restoreFormData(): Record<string, any> {
    return this.currentState.formData || {};
  }

  saveFilters(filters: Record<string, any>): void {
    this.currentState.filters = filters;
    this.saveState();
  }

  restoreFilters(): Record<string, any> {
    return this.currentState.filters || {};
  }

  saveSelectedItems(items: string[]): void {
    this.currentState.selectedItems = items;
    this.saveState();
  }

  restoreSelectedItems(): string[] {
    return this.currentState.selectedItems || [];
  }

  saveExpandedSections(sections: string[]): void {
    this.currentState.expandedSections = sections;
    this.saveState();
  }

  restoreExpandedSections(): string[] {
    return this.currentState.expandedSections || [];
  }

  saveCustomData(data: any): void {
    this.currentState.customData = data;
    this.saveState();
  }

  restoreCustomData(): any {
    return this.currentState.customData;
  }

  getState(): AppStateData {
    return { ...this.currentState };
  }

  setState(state: AppStateData): void {
    this.currentState = { ...state };
    this.saveState();
  }

  private saveState(): void {
    this.stateManager.saveAppState(this.appId, this.currentState);
  }

  clearState(): void {
    this.currentState = {};
    this.stateManager.clearAppState(this.appId);
  }
}

// 데코레이터 유틸리티
export function withStateManagement(appId: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      private stateHelper: AppStateHelper;

      constructor(...args: any[]) {
        super(...args);
        this.stateHelper = new AppStateHelper(appId);
        this.restoreState();
      }

      private restoreState(): void {
        const state = this.stateHelper.getState();
        if (Object.keys(state).length > 0) {
          // @ts-ignore
          if (typeof this.onStateRestored === 'function') {
            // @ts-ignore
            this.onStateRestored(state);
          }
        }
      }

      getStateHelper(): AppStateHelper {
        return this.stateHelper;
      }
    };
  };
}

// 싱글톤 인스턴스 export
export const appStateManager = AppStateManager.getInstance(); 