// ============================================
// 동적 앱 로딩 시스템 - RightSidebar용
// ============================================

import { ComponentFactory } from '../../../utils/component-factory.js';
import { eventManager } from '../../../core/EventManager.js';
import { appStateManager } from './AppStateManager.js';
import type { AppInfo } from './types.js';

export interface AppLoadingState {
  appId: string;
  status: 'loading' | 'loaded' | 'error' | 'unloaded';
  progress?: number;
  error?: string;
  loadedAt?: number;
  module?: any;
}

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: string;
  author?: string;
  dependencies?: string[];
  permissions?: string[];
  entry: string;
  lazy?: boolean;
  preload?: boolean;
}

export class DynamicAppLoader {
  private static instance: DynamicAppLoader;
  private loadingStates = new Map<string, AppLoadingState>();
  private loadedModules = new Map<string, any>();
  private appManifests = new Map<string, AppManifest>();
  private loadingQueue: string[] = [];
  private maxConcurrentLoads = 3;
  private currentLoads = 0;

  private constructor() {
    this.setupEventListeners();
  }

  static getInstance(): DynamicAppLoader {
    if (!DynamicAppLoader.instance) {
      DynamicAppLoader.instance = new DynamicAppLoader();
    }
    return DynamicAppLoader.instance;
  }

  registerAppManifest(manifest: AppManifest): void {
    this.appManifests.set(manifest.id, manifest);
    
    if (manifest.preload) {
      this.preloadApp(manifest.id);
    }
    
    console.log(`📱 앱 매니페스트 등록: ${manifest.name} (${manifest.id})`);
    eventManager.emit('app:manifest:registered' as any, { manifest });
  }

  async loadApp(appId: string): Promise<AppInfo | null> {
    const manifest = this.appManifests.get(appId);
    if (!manifest) {
      console.error(`앱 매니페스트를 찾을 수 없음: ${appId}`);
      return null;
    }

    if (this.loadingStates.get(appId)?.status === 'loaded') {
      return this.createAppInfoFromModule(appId);
    }

    if (this.loadingStates.get(appId)?.status === 'loading') {
      return this.waitForAppLoad(appId);
    }

    try {
      this.currentLoads++;
      
      if (manifest.dependencies && manifest.dependencies.length > 0) {
        await this.loadDependencies(manifest.dependencies);
        this.updateLoadingProgress(appId, 30);
      }

      this.updateLoadingProgress(appId, 50);
      const module = await this.loadModule(manifest.entry);
      this.updateLoadingProgress(appId, 80);

      if (!this.validateModule(module)) {
        throw new Error('Invalid app module structure');
      }

      this.loadedModules.set(appId, module);
      this.setLoadingState(appId, {
        appId,
        status: 'loaded',
        progress: 100,
        loadedAt: Date.now(),
        module
      });

      this.currentLoads--;
      this.processQueue();

      const appInfo = this.createAppInfoFromModule(appId);
      eventManager.emit('app:loaded' as any, { appId, appInfo });
      
      return appInfo;

    } catch (error) {
      this.currentLoads--;
      this.setLoadingState(appId, {
        appId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      console.error(`앱 로딩 실패: ${appId}`, error);
      eventManager.emit('app:load-error' as any, { appId, error });
      
      this.processQueue();
      return null;
    }
  }

  private async loadDependencies(dependencies: string[]): Promise<void> {
    const promises = dependencies.map(async (depId) => {
      if (!this.loadedModules.has(depId)) {
        await this.loadApp(depId);
      }
    });

    await Promise.all(promises);
  }

  private async loadModule(entryPath: string): Promise<any> {
    try {
      const module = await import(entryPath);
      return module;
    } catch (error) {
      return this.loadModuleViaScript(entryPath);
    }
  }

  private loadModuleViaScript(scriptPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptPath;
      script.type = 'text/javascript';
      
      script.onload = () => {
        const moduleName = this.extractModuleName(scriptPath);
        const module = (window as any)[moduleName];
        
        if (module) {
          resolve(module);
        } else {
          reject(new Error(`Module ${moduleName} not found in global scope`));
        }
        
        document.head.removeChild(script);
      };
      
      script.onerror = () => {
        reject(new Error(`Failed to load script: ${scriptPath}`));
        document.head.removeChild(script);
      };
      
      document.head.appendChild(script);
    });
  }

  private extractModuleName(path: string): string {
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.[^/.]+$/, '');
  }

  private validateModule(module: any): boolean {
    return module && typeof module === 'object' && 
           typeof module.render === 'function';
  }

  private createAppInfoFromModule(appId: string): AppInfo | null {
    const manifest = this.appManifests.get(appId);
    const module = this.loadedModules.get(appId);
    
    if (!manifest || !module) {
      return null;
    }

    return {
      id: manifest.id,
      title: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      category: manifest.category,
      render: () => module.render()
    };
  }

  private async waitForAppLoad(appId: string): Promise<AppInfo | null> {
    return new Promise((resolve) => {
      const checkStatus = () => {
        const state = this.loadingStates.get(appId);
        if (!state) return resolve(null);

        switch (state.status) {
          case 'loaded':
            resolve(this.createAppInfoFromModule(appId));
            break;
          case 'error':
            resolve(null);
            break;
          case 'loading':
            setTimeout(checkStatus, 100);
            break;
          default:
            resolve(null);
        }
      };

      checkStatus();
    });
  }

  private async preloadApp(appId: string): Promise<void> {
    const manifest = this.appManifests.get(appId);
    if (!manifest || manifest.lazy) return;

    if (this.loadingQueue.includes(appId)) return;
    
    this.loadingQueue.push(appId);
    this.processQueue();
  }

  private setLoadingState(appId: string, state: AppLoadingState): void {
    this.loadingStates.set(appId, state);
    eventManager.emit('app:loading:state:change' as any, { appId, state });
  }

  private updateLoadingProgress(appId: string, progress: number): void {
    const state = this.loadingStates.get(appId);
    if (state) {
      state.progress = progress;
      this.setLoadingState(appId, state);
    }
  }

  private processQueue(): void {
    while (this.currentLoads < this.maxConcurrentLoads && this.loadingQueue.length > 0) {
      const nextAppId = this.loadingQueue.shift();
      if (nextAppId) {
        this.loadApp(nextAppId);
      }
    }
  }

  unloadApp(appId: string): void {
    const module = this.loadedModules.get(appId);
    if (module && typeof module.destroy === 'function') {
      try {
        module.destroy();
      } catch (error) {
        console.warn(`앱 정리 중 오류 발생: ${appId}`, error);
      }
    }

    this.loadedModules.delete(appId);
    this.loadingStates.set(appId, {
      appId,
      status: 'unloaded'
    });

    eventManager.emit('app:unloaded' as any, { appId });
  }

  getLoadingState(appId: string): AppLoadingState | null {
    return this.loadingStates.get(appId) || null;
  }

  getRegisteredManifests(): AppManifest[] {
    return Array.from(this.appManifests.values());
  }

  getLoadedApps(): string[] {
    return Array.from(this.loadingStates.entries())
      .filter(([_, state]) => state.status === 'loaded')
      .map(([appId]) => appId);
  }

  getLoadingApps(): string[] {
    return Array.from(this.loadingStates.entries())
      .filter(([_, state]) => state.status === 'loading')
      .map(([appId]) => appId);
  }

  optimizeMemory(): void {
    const recentApps = appStateManager.getRecentApps();
    const loadedApps = this.getLoadedApps();
    
    loadedApps.forEach(appId => {
      if (!recentApps.includes(appId)) {
        this.unloadApp(appId);
      }
    });
  }

  private setupEventListeners(): void {
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.optimizeMemory();
      }
    });
  }

  destroy(): void {
    const loadedApps = this.getLoadedApps();
    loadedApps.forEach(appId => this.unloadApp(appId));
    
    this.loadingStates.clear();
    this.loadedModules.clear();
    this.appManifests.clear();
    this.loadingQueue = [];
  }
}

export class AppLoadingIndicator {
  private container: HTMLElement;
  private appId: string;

  constructor(appId: string) {
    this.appId = appId;
    this.container = this.createLoadingUI();
    this.setupProgressTracking();
  }

  private createLoadingUI(): HTMLElement {
    const container = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'md',
      className: 'loading-indicator'
    });

    const body = container.querySelector('.card__body')!;
    body.innerHTML = `
      <div class="flex flex-col items-center">
        <div class="spinner mb-3"></div>
        <div class="text-sm text-gray-600">Loading ${this.appId}...</div>
        <div class="progress-bar mt-2 w-full h-2 bg-gray-200 rounded">
          <div class="progress-fill h-full bg-primary rounded" style="width: 0%"></div>
        </div>
      </div>
    `;

    return container;
  }

  private setupProgressTracking(): void {
    eventManager.on('app:loading:state:change' as any, (data: { appId: string; state: AppLoadingState }) => {
      if (data.appId === this.appId) {
        this.updateProgress(data.state);
      }
    });
  }

  private updateProgress(state: AppLoadingState): void {
    const progressFill = this.container.querySelector('.progress-fill') as HTMLElement;
    const progressText = this.container.querySelector('.text-sm') as HTMLElement;

    if (state.status === 'error') {
      this.showError(state.error || 'Unknown error');
      return;
    }

    if (progressFill && progressText) {
      const progress = state.progress || 0;
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `Loading ${this.appId}... ${progress}%`;
    }
  }

  private showError(error: string): void {
    const body = this.container.querySelector('.card__body')!;
    body.innerHTML = `
      <div class="flex flex-col items-center text-red-500">
        <div class="text-3xl mb-2">❌</div>
        <div class="text-sm font-medium mb-1">Failed to load ${this.appId}</div>
        <div class="text-xs text-gray-500">${error}</div>
        <button class="btn btn--sm btn--primary mt-3" onclick="location.reload()">
          Try Again
        </button>
      </div>
    `;
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

// 싱글톤 인스턴스 export
export const dynamicAppLoader = DynamicAppLoader.getInstance(); 