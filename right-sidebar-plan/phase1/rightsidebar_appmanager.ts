// ============================================
// RightSidebar V2 - AppManager 구현
// ============================================

import { eventManager } from '../../core/EventManager.js';
import type { AppInfo, AppState } from './types.js';

export class AppManager {
  private apps = new Map<string, AppInfo>();
  private appStates = new Map<string, AppState>();
  private activeAppId: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ AppManager 초기화 완료');
  }

  registerApp(appInfo: AppInfo): void {
    this.apps.set(appInfo.id, appInfo);
    this.appStates.set(appInfo.id, {
      id: appInfo.id,
      active: false,
      element: null,
      lastAccessed: 0
    });
    
    eventManager.emit('app:registered' as any, { app: appInfo });
    console.log(`📱 앱 등록: ${appInfo.id}`);
  }

  async activateApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      console.warn(`앱을 찾을 수 없음: ${appId}`);
      return;
    }

    // 이전 앱 비활성화
    if (this.activeAppId) {
      const prevState = this.appStates.get(this.activeAppId);
      if (prevState) {
        prevState.active = false;
      }
    }

    // 새 앱 활성화
    const state = this.appStates.get(appId)!;
    state.active = true;
    state.lastAccessed = Date.now();
    
    // 앱 렌더링
    if (!state.element) {
      try {
        state.element = await app.render();
      } catch (error) {
        console.error(`앱 렌더링 실패: ${appId}`, error);
        return;
      }
    }

    this.activeAppId = appId;
    
    eventManager.emit('app:activated' as any, {
      appId,
      element: state.element
    });
  }

  getRegisteredApps(): AppInfo[] {
    return Array.from(this.apps.values());
  }

  getActiveAppId(): string | null {
    return this.activeAppId;
  }

  on(event: string, callback: (data: any) => void): void {
    eventManager.on(event as any, callback);
  }

  destroy(): void {
    this.apps.clear();
    this.appStates.clear();
    this.activeAppId = null;
  }
}
