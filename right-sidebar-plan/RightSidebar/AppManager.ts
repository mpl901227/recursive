// ============================================
// RightSidebar V2 - AppManager Implementation
// ============================================

import { eventManager } from '../../../core/EventManager';
import type { AppInfo, AppState, RightSidebarEventMap } from './types';

export class AppManager {
  private apps = new Map<string, AppInfo>();
  private appStates = new Map<string, AppState>();
  private activeAppId: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ AppManager initialized');
  }

  registerApp(appInfo: AppInfo): void {
    this.apps.set(appInfo.id, appInfo);
    this.appStates.set(appInfo.id, {
      id: appInfo.id,
      active: false,
      element: null,
      lastAccessed: 0
    });
    
    eventManager.emit('rightsidebar:app:registered', { app: appInfo });
    console.log(`📱 App registered: ${appInfo.id}`);
  }

  async activateApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      console.warn(`App not found: ${appId}`);
      return;
    }

    // Deactivate previous app
    if (this.activeAppId) {
      const prevState = this.appStates.get(this.activeAppId);
      if (prevState) {
        prevState.active = false;
      }
    }

    // Activate new app
    const state = this.appStates.get(appId)!;
    state.active = true;
    state.lastAccessed = Date.now();
    
    // Render app
    if (!state.element) {
      try {
        state.element = await app.render();
      } catch (error) {
        console.error(`App rendering failed: ${appId}`, error);
        return;
      }
    }

    this.activeAppId = appId;
    
    eventManager.emit('rightsidebar:app:activated', {
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

  on<K extends keyof RightSidebarEventMap>(
    event: K, 
    callback: (data: RightSidebarEventMap[K]) => void
  ): void {
    eventManager.on(event as any, callback);
  }

  destroy(): void {
    this.apps.clear();
    this.appStates.clear();
    this.activeAppId = null;
  }
} 