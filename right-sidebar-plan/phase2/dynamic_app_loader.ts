// ============================================
// 동적 앱 로딩 시스템 - RightSidebar용
// ============================================

import { ComponentFactory } from '../../utils/component-factory.js';
import { eventManager } from '../../core/EventManager.js';
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
  entry: string; // 진입점 파일 경로
  lazy?: boolean; // 지연 로딩 여부
  preload?: boolean; // 사전 로딩 여부
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

  /**
   * 앱 매니페스트 등록
   */
  registerAppManifest(manifest: AppManifest): void {
    this.appManifests.set(manifest.id, manifest);
    
    // 사전 로딩이 필요한 앱 체크
    if (manifest.preload) {
      this.preloadApp(manifest.id);
    }
    
    console.log(`📱 앱 매니페스트 등록: ${manifest.name} (${manifest.id})`);
    eventManager.emit('app:manifest:registered' as any, { manifest });
  }

  /**
   * 앱 동적 로딩
   */
  async loadApp(appId: string): Promise<AppInfo | null> {
    const manifest = this.appManifests.get(appId);
    if (!manifest) {
      console.error(`앱 매니페스트를 찾을 수 없음: ${appId}`);
      return null;
    }

    // 이미 로드된 경우
    if (this.loadingStates.get(appId)?.status === 'loaded') {
      return this.createAppInfoFromModule(appId);
    }

    // 로딩 중인 경우 대기
    if (this.loadingStates.get(appId)?.status === 'loading') {
              return this.waitForAppLoad(appId);
      }

      this.currentLoads++;
      
      // 의존성 체크 및 로딩
      if (manifest.dependencies && manifest.dependencies.length > 0) {
        await this.loadDependencies(manifest.dependencies);
        this.updateLoadingProgress(appId, 30);
      }

      // 모듈 로딩
      this.updateLoadingProgress(appId, 50);
      const module = await this.loadModule(manifest.entry);
      this.updateLoadingProgress(appId, 80);

      // 모듈 검증
      if (!this.validateModule(module)) {
        throw new Error('Invalid app module structure');
      }

      // 로딩 완료
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

  /**
   * 의존성 로딩
   */
  private async loadDependencies(dependencies: string[]): Promise<void> {
    const promises = dependencies.map(async (depId) => {
      if (!this.loadedModules.has(depId)) {
        await this.loadApp(depId);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 모듈 파일 로딩
   */
  private async loadModule(entryPath: string): Promise<any> {
    try {
      // ES6 모듈 동적 import
      const module = await import(entryPath);
      return module;
    } catch (error) {
      // 폴백: 스크립트 태그로 로딩 (UMD 모듈용)
      return this.loadModuleViaScript(entryPath);
    }
  }

  /**
   * 스크립트 태그로 모듈 로딩 (폴백)
   */
  private loadModuleViaScript(scriptPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptPath;
      script.type = 'text/javascript';
      
      script.onload = () => {
        // 글로벌 객체에서 모듈 찾기
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

  /**
   * 모듈 이름 추출
   */
  private extractModuleName(path: string): string {
    const filename = path.split('/').pop() || '';
    return filename.replace(/\.(js|ts)$/, '');
  }

  /**
   * 모듈 구조 검증
   */
  private validateModule(module: any): boolean {
    // 기본적으로 default export나 특정 구조가 있는지 확인
    return module && (
      module.default || 
      module.createApp || 
      module.AppComponent ||
      typeof module.render === 'function'
    );
  }

  /**
   * 모듈에서 AppInfo 생성
   */
  private createAppInfoFromModule(appId: string): AppInfo | null {
    const module = this.loadedModules.get(appId);
    const manifest = this.appManifests.get(appId);
    
    if (!module || !manifest) {
      return null;
    }

    // 모듈에서 앱 클래스나 함수 추출
    const AppClass = module.default || module.createApp || module.AppComponent;
    
    return {
      id: appId,
      title: manifest.name,
      icon: manifest.icon,
      description: manifest.description,
      category: manifest.category,
      render: async () => {
        if (typeof AppClass === 'function') {
          // 클래스인 경우 인스턴스 생성
          if (AppClass.prototype && AppClass.prototype.constructor === AppClass) {
            const instance = new AppClass();
            return instance.render ? await instance.render() : instance.element || document.createElement('div');
          }
          // 함수인 경우 직접 호출
          return await AppClass();
        } else if (AppClass && typeof AppClass.render === 'function') {
          // 객체에 render 메서드가 있는 경우
          return await AppClass.render();
        } else {
          // 폴백: 기본 컨테이너
          const container = document.createElement('div');
          container.innerHTML = `<p>앱을 로드할 수 없습니다: ${manifest.name}</p>`;
          return container;
        }
      }
    };
  }

  /**
   * 앱 로딩 대기
   */
  private async waitForAppLoad(appId: string): Promise<AppInfo | null> {
    return new Promise((resolve) => {
      const checkStatus = () => {
        const state = this.loadingStates.get(appId);
        if (state?.status === 'loaded') {
          resolve(this.createAppInfoFromModule(appId));
        } else if (state?.status === 'error') {
          resolve(null);
        } else {
          setTimeout(checkStatus, 100);
        }
      };
      checkStatus();
    });
  }

  /**
   * 사전 로딩
   */
  private async preloadApp(appId: string): Promise<void> {
    try {
      await this.loadApp(appId);
      console.log(`✅ 앱 사전 로딩 완료: ${appId}`);
    } catch (error) {
      console.warn(`⚠️ 앱 사전 로딩 실패: ${appId}`, error);
    }
  }

  /**
   * 로딩 상태 설정
   */
  private setLoadingState(appId: string, state: AppLoadingState): void {
    this.loadingStates.set(appId, state);
    eventManager.emit('app:loading-state-changed' as any, { appId, state });
  }

  /**
   * 로딩 진행률 업데이트
   */
  private updateLoadingProgress(appId: string, progress: number): void {
    const state = this.loadingStates.get(appId);
    if (state) {
      state.progress = progress;
      this.setLoadingState(appId, state);
    }
  }

  /**
   * 큐 처리
   */
  private processQueue(): void {
    if (this.loadingQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
      const nextAppId = this.loadingQueue.shift()!;
      const manifest = this.appManifests.get(nextAppId);
      if (manifest) {
        this.performAppLoad(nextAppId, manifest);
      }
    }
  }

  /**
   * 앱 언로드
   */
  unloadApp(appId: string): void {
    const module = this.loadedModules.get(appId);
    
    // 정리 메서드 호출
    if (module && typeof module.destroy === 'function') {
      module.destroy();
    }
    
    this.loadedModules.delete(appId);
    this.setLoadingState(appId, {
      appId,
      status: 'unloaded'
    });
    
    console.log(`🗑️ 앱 언로드: ${appId}`);
    eventManager.emit('app:unloaded' as any, { appId });
  }

  /**
   * 로딩 상태 조회
   */
  getLoadingState(appId: string): AppLoadingState | null {
    return this.loadingStates.get(appId) || null;
  }

  /**
   * 등록된 매니페스트 목록
   */
  getRegisteredManifests(): AppManifest[] {
    return Array.from(this.appManifests.values());
  }

  /**
   * 로딩된 앱 목록
   */
  getLoadedApps(): string[] {
    return Array.from(this.loadedModules.keys());
  }

  /**
   * 로딩 진행 중인 앱 목록
   */
  getLoadingApps(): string[] {
    return Array.from(this.loadingStates.entries())
      .filter(([_, state]) => state.status === 'loading')
      .map(([appId]) => appId);
  }

  /**
   * 메모리 사용량 최적화
   */
  optimizeMemory(): void {
    const now = Date.now();
    const maxIdleTime = 30 * 60 * 1000; // 30분
    
    for (const [appId, state] of this.loadingStates) {
      if (state.status === 'loaded' && state.loadedAt) {
        const idleTime = now - state.loadedAt;
        if (idleTime > maxIdleTime) {
          this.unloadApp(appId);
        }
      }
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 메모리 최적화 주기적 실행
    setInterval(() => {
      this.optimizeMemory();
    }, 10 * 60 * 1000); // 10분마다
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
      this.destroy();
    });
  }

  /**
   * 정리
   */
  destroy(): void {
    // 모든 로딩된 앱 언로드
    for (const appId of this.loadedModules.keys()) {
      this.unloadApp(appId);
    }
    
    this.loadingStates.clear();
    this.appManifests.clear();
    this.loadingQueue.length = 0;
  }
}

// ============================================
// 로딩 UI 컴포넌트
// ============================================

export class AppLoadingIndicator {
  private container: HTMLElement;
  private appId: string;

  constructor(appId: string) {
    this.appId = appId;
    this.container = this.createLoadingUI();
    this.setupProgressTracking();
  }

  private createLoadingUI(): HTMLElement {
    const loader = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'lg',
      className: 'app-loading-indicator text-center'
    });

    const loaderBody = loader.querySelector('.card__body')!;
    loaderBody.innerHTML = `
      <div class="loading-spinner mb-4">
        <div class="animate-spin">⚙️</div>
      </div>
      <h3 class="text-lg font-semibold mb-2">Loading App...</h3>
      <p class="text-sm text-gray-600 mb-4">Please wait while we load the application.</p>
      <div class="progress-bar bg-gray-200 rounded-full h-2 mb-2">
        <div class="progress-fill bg-blue-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
      </div>
      <div class="progress-text text-xs text-gray-500">0%</div>
    `;

    return loader;
  }

  private setupProgressTracking(): void {
    const loader = DynamicAppLoader.getInstance();
    
    eventManager.on('app:loading-state-changed' as any, (data: any) => {
      if (data.appId === this.appId) {
        this.updateProgress(data.state);
      }
    });
  }

  private updateProgress(state: AppLoadingState): void {
    const progressFill = this.container.querySelector('.progress-fill') as HTMLElement;
    const progressText = this.container.querySelector('.progress-text') as HTMLElement;
    
    if (progressFill && progressText && state.progress !== undefined) {
      progressFill.style.width = `${state.progress}%`;
      progressText.textContent = `${state.progress}%`;
    }

    if (state.status === 'error') {
      this.showError(state.error || 'Unknown error');
    }
  }

  private showError(error: string): void {
    const loaderBody = this.container.querySelector('.card__body')!;
    loaderBody.innerHTML = `
      <div class="error-state text-center">
        <div class="text-4xl mb-4">❌</div>
        <h3 class="text-lg font-semibold mb-2 text-red-600">Loading Failed</h3>
        <p class="text-sm text-gray-600 mb-4">${error}</p>
        <button class="btn btn--primary retry-btn">Retry</button>
      </div>
    `;

    // 재시도 버튼 이벤트
    const retryBtn = this.container.querySelector('.retry-btn');
    retryBtn?.addEventListener('click', () => {
      const loader = DynamicAppLoader.getInstance();
      loader.loadApp(this.appId);
      this.container.replaceWith(new AppLoadingIndicator(this.appId).getElement());
    });
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

// 싱글톤 인스턴스 내보내기
export const dynamicAppLoader = DynamicAppLoader.getInstance();
    }

    return this.performAppLoad(appId, manifest);
  }

  /**
   * 앱 로딩 수행
   */
  private async performAppLoad(appId: string, manifest: AppManifest): Promise<AppInfo | null> {
    // 로딩 상태 설정
    this.setLoadingState(appId, {
      appId,
      status: 'loading',
      progress: 0
    });

    try {
      // 동시 로딩 제한 체크
      if (this.currentLoads >= this.maxConcurrentLoads) {
        this.loadingQueue.push(appId);
        return this.waitForApp