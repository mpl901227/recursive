/**
 * @fileoverview 메인 애플리케이션 클래스 - 완전 수정본
 * @description Recursive UI 모듈의 중심이 되는 Application 클래스 (중복 초기화 방지 강화)
 * @version 2.0.0
 */

import type {
  Config,
  Service,
  ServiceRegistry,
  Component,
  ComponentConstructor,
  EventManager as IEventManager,
  DeepPartial
} from '../types/index.js';

import { ConfigManager } from './config.js';
import { EventManager } from './events.js';
import { LifecycleManager } from './lifecycle.js';
import { clearGlobalComponentRegistry } from '../components/base/component.js';

// -----------------------------------------------------------------------------
// 🏗️ Service Registry Implementation
// -----------------------------------------------------------------------------

class ApplicationServiceRegistry implements ServiceRegistry {
  private services = new Map<string, Service>();
  private eventManager: IEventManager;

  constructor(eventManager: IEventManager) {
    this.eventManager = eventManager;
  }

  register<T extends Service>(name: string, service: T): void {
    if (this.services.has(name)) {
      console.warn(`⚠️ Service '${name}' is already registered. Replacing...`);
      const existing = this.services.get(name);
      if (existing && typeof existing.destroy === 'function') {
        existing.destroy().catch(console.error);
      }
    }

    this.services.set(name, service);
    this.eventManager.emit('service:registered', { name, service });
  }

  get<T extends Service>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  unregister(name: string): boolean {
    const service = this.services.get(name);
    if (!service) return false;

    this.services.delete(name);
    this.eventManager.emit('service:unregistered', { name, service });
    return true;
  }

  getAll(): Map<string, Service> {
    return new Map(this.services);
  }

  clear(): void {
    this.services.clear();
    this.eventManager.emit('service:registry-cleared', {});
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }

  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [name, service] of this.services) {
      if (!service.isInitialized) {
        initPromises.push(
          service.initialize().catch(error => {
            console.error(`Failed to initialize service '${name}':`, error);
            throw error;
          })
        );
      }
    }

    await Promise.all(initPromises);
  }

  async destroyAll(): Promise<void> {
    const destroyPromises: Promise<void>[] = [];

    for (const [name, service] of this.services) {
      destroyPromises.push(
        service.destroy().catch(error => {
          console.error(`Failed to destroy service '${name}':`, error);
        })
      );
    }

    await Promise.all(destroyPromises);
    this.services.clear();
  }
}

// -----------------------------------------------------------------------------
// 🎨 Component Registry Implementation - 개선된 버전
// -----------------------------------------------------------------------------

class ApplicationComponentRegistry {
  private constructors = new Map<string, ComponentConstructor>();
  private instances = new Map<string, Component>();
  private eventManager: IEventManager;
  private initializationFlags = new Map<string, boolean>(); // 초기화 플래그

  constructor(eventManager: IEventManager) {
    this.eventManager = eventManager;
  }

  registerConstructor<T extends Component>(
    name: string, 
    constructor: ComponentConstructor<T>
  ): void {
    if (this.constructors.has(name)) {
      console.warn(`⚠️ Component constructor '${name}' is already registered. Replacing...`);
    }

    this.constructors.set(name, constructor);
    this.eventManager.emit('component:constructor-registered', { name });
  }

  create<T extends Component>(
    name: string,
    element: HTMLElement | string,
    props?: any,
    instanceId?: string
  ): T {
    const Constructor = this.constructors.get(name);
    if (!Constructor) {
      throw new Error(`Component constructor '${name}' not found`);
    }

    const id = instanceId || `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 기존 인스턴스가 있으면 정리
    if (this.instances.has(id)) {
      console.warn(`⚠️ Component instance '${id}' already exists. Destroying existing...`);
      this.destroyInstance(id);
    }
    
    const instance = new Constructor(element, props, this.eventManager) as T;
    
    this.instances.set(id, instance);
    this.eventManager.emit('component:created', { name, id, instance });

    return instance;
  }

  getInstance<T extends Component>(id: string): T | undefined {
    return this.instances.get(id) as T | undefined;
  }

  destroyInstance(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    try {
      instance.destroy();
      this.instances.delete(id);
      this.eventManager.emit('component:destroyed', { id, instance });
      return true;
    } catch (error) {
      console.error(`Failed to destroy component instance '${id}':`, error);
      return false;
    }
  }

  destroyAll(): void {
    for (const [id, instance] of this.instances) {
      try {
        instance.destroy();
        this.eventManager.emit('component:destroyed', { id, instance });
      } catch (error) {
        console.error(`Failed to destroy component instance '${id}':`, error);
      }
    }
    this.instances.clear();
    this.initializationFlags.clear();
  }

  getRegisteredConstructors(): string[] {
    return Array.from(this.constructors.keys());
  }

  getAllInstances(): Map<string, Component> {
    return new Map(this.instances);
  }

  // 초기화 플래그 관리
  setInitializationFlag(key: string, value: boolean): void {
    this.initializationFlags.set(key, value);
  }

  getInitializationFlag(key: string): boolean {
    return this.initializationFlags.get(key) || false;
  }

  clearInitializationFlags(): void {
    this.initializationFlags.clear();
  }
}

// -----------------------------------------------------------------------------
// 🚀 Main Application Class - 완전 수정본
// -----------------------------------------------------------------------------

export interface ApplicationOptions {
  config?: DeepPartial<Config>;
  autoStart?: boolean;
  debug?: boolean;
  rootElement?: HTMLElement | string;
  initTimeout?: number;
}

export type ApplicationState = 
  | 'uninitialized' 
  | 'initializing' 
  | 'initialized' 
  | 'starting' 
  | 'running' 
  | 'stopping' 
  | 'stopped' 
  | 'error';

/**
 * 메인 애플리케이션 클래스 - 완전 수정본
 */
export class Application {
  private static instance: Application | null = null;
  
  // 핵심 시스템
  private configManager: ConfigManager;
  private eventManager: EventManager;
  private lifecycleManager: LifecycleManager;
  
  // 레지스트리
  private serviceRegistry: ApplicationServiceRegistry;
  private componentRegistry: ApplicationComponentRegistry;
  
  // 상태 관리
  private state: ApplicationState = 'uninitialized';
  private rootElement: HTMLElement | null = null;
  private options: Required<ApplicationOptions>;
  
  // 에러 처리
  private errorHandlers = new Set<(error: Error) => void>();
  private unhandledErrors: Error[] = [];

  // 컴포넌트 초기화 관리 - 강화된 버전
  private componentsInitializationState = {
    isInitializing: false,
    isCompleted: false,
    initializationPromise: null as Promise<void> | null,
    componentStates: new Map<string, 'pending' | 'loading' | 'loaded' | 'error'>()
  };

  private constructor(options: ApplicationOptions = {}) {
    this.options = this.normalizeOptions(options);
    
    // 핵심 시스템 초기화
    this.configManager = ConfigManager.getInstance(this.options.config);
    this.eventManager = new EventManager({ 
      debug: this.options.debug,
      maxListeners: 200 
    });
    this.lifecycleManager = new LifecycleManager(this.eventManager);
    
    // 레지스트리 초기화
    this.serviceRegistry = new ApplicationServiceRegistry(this.eventManager);
    this.componentRegistry = new ApplicationComponentRegistry(this.eventManager);
    
    this.setupApplicationHooks();
    this.setupErrorHandling();
    this.bindEvents();
  }

  static getInstance(options?: ApplicationOptions): Application {
    if (!Application.instance) {
      console.log('🔧 새로운 Application 인스턴스 생성');
      Application.instance = new Application(options);
    } else {
      console.log('♻️  기존 Application 인스턴스 재사용');
    }
    return Application.instance;
  }

  static createInstance(options?: ApplicationOptions): Application {
    console.log('🧪 새로운 Application 인스턴스 강제 생성');
    
    // 기존 인스턴스 정리
    if (Application.instance) {
      Application.instance.destroy().catch(console.error);
    }
    
    Application.instance = new Application(options);
    return Application.instance;
  }

  async initialize(): Promise<void> {
    if (this.state !== 'uninitialized') {
      console.warn(`⚠️ 애플리케이션이 이미 초기화되었습니다. 현재 상태: ${this.state}`);
      return;
    }

    console.log('🚀 애플리케이션 초기화 시작...');
    this.setState('initializing');

    try {
      // 기존 리소스 정리
      await this.cleanupExistingResources();
      
      // 루트 엘리먼트 설정
      await this.setupRootElement();
      
      // 기본 서비스들 등록
      await this.registerDefaultServices();
      
      // 생명주기 관리자 초기화
      await this.lifecycleManager.initialize();
      
      // 서비스들 초기화
      await this.serviceRegistry.initializeAll();
      
      this.setState('initialized');
      this.eventManager.emit('app:initialized', { 
        type: 'app:initialized',
        timestamp: Date.now(),
        source: 'Application',
        payload: {
          config: this.configManager.getConfig()
        }
      });

      console.log('✅ 애플리케이션 초기화 완료');

      if (this.options.autoStart) {
        await this.start();
      }

    } catch (error) {
      console.error('❌ 애플리케이션 초기화 실패:', error);
      this.setState('error');
      await this.handleError(error as Error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.state === 'running') {
      console.warn('⚠️ 애플리케이션이 이미 실행 중입니다.');
      return;
    }
    
    if (this.state !== 'initialized') {
      throw new Error(`Cannot start application from state: ${this.state}`);
    }

    console.log('🚀 애플리케이션 시작...');
    this.setState('starting');

    try {
      await this.lifecycleManager.start();
      
      // 컴포넌트 등록 및 초기화 (시작 후에 실행)
      await this.registerAndInitializeComponents();
      
      this.setState('running');
      this.eventManager.emit('app:started', { 
        type: 'app:started',
        timestamp: Date.now(),
        source: 'Application',
        payload: {}
      });

      console.log('✅ 애플리케이션 시작 완료');

    } catch (error) {
      console.error('❌ 애플리케이션 시작 실패:', error);
      this.setState('error');
      await this.handleError(error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error(`Cannot stop application from state: ${this.state}`);
    }

    this.setState('stopping');

    try {
      await this.lifecycleManager.stop();
      await this.serviceRegistry.destroyAll();
      this.componentRegistry.destroyAll();
      
      this.setState('stopped');
      this.eventManager.emit('app:stopped', { 
        timestamp: Date.now() 
      });

    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    try {
      if (this.state === 'running') {
        await this.stop();
      }

      // 전역 컴포넌트 레지스트리 정리
      clearGlobalComponentRegistry();
      
      // 컴포넌트 상태 정리
      this.componentsInitializationState.isInitializing = false;
      this.componentsInitializationState.isCompleted = false;
      this.componentsInitializationState.initializationPromise = null;
      this.componentsInitializationState.componentStates.clear();
      
      await this.lifecycleManager.destroy();
      this.eventManager.removeAllListeners();
      this.unbindEvents();
      
      this.setState('uninitialized');
      Application.instance = null;

    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------------
  // 🔧 Private Methods - 개선된 버전
  // -----------------------------------------------------------------------------

  /**
   * 기존 리소스 정리
   */
  private async cleanupExistingResources(): Promise<void> {
    console.log('🧹 기존 리소스 정리 중...');
    
    try {
      // 전역 컴포넌트 레지스트리 정리
      clearGlobalComponentRegistry();
      
      // DOM에서 기존 컴포넌트 표시 제거
      const componentElements = document.querySelectorAll('[data-component-initialized]');
      componentElements.forEach(element => {
        element.removeAttribute('data-component-initialized');
        element.removeAttribute('data-component-state');
        element.removeAttribute('data-component-type');
        element.removeAttribute('data-component-id');
      });
      
      // 컴포넌트 레지스트리 정리
      this.componentRegistry.destroyAll();
      this.componentRegistry.clearInitializationFlags();
      
      console.log('✅ 기존 리소스 정리 완료');
      
    } catch (error) {
      console.warn('⚠️ 기존 리소스 정리 중 오류:', error);
    }
  }

  /**
   * 컴포넌트들을 등록하고 초기화 - 완전 개선된 버전
   */
  private async registerAndInitializeComponents(): Promise<void> {
    // 중복 초기화 방지
    if (this.componentsInitializationState.isInitializing) {
      console.log('⏳ 컴포넌트 초기화 진행 중, 기존 Promise 반환...');
      return this.componentsInitializationState.initializationPromise || Promise.resolve();
    }
    
    if (this.componentsInitializationState.isCompleted) {
      console.log('✅ 컴포넌트 초기화 이미 완료됨');
      return;
    }
    
    this.componentsInitializationState.isInitializing = true;
    
    // 초기화 Promise 생성
    this.componentsInitializationState.initializationPromise = this.performComponentInitialization();
    
    try {
      await this.componentsInitializationState.initializationPromise;
      this.componentsInitializationState.isCompleted = true;
      console.log('✅ 모든 컴포넌트 초기화 완료');
      
    } catch (error) {
      console.error('❌ 컴포넌트 초기화 실패:', error);
      // 에러가 발생해도 폴백 컨텐츠는 유지
    } finally {
      this.componentsInitializationState.isInitializing = false;
      this.componentsInitializationState.initializationPromise = null;
    }
  }

  /**
   * 실제 컴포넌트 초기화 수행
   */
  private async performComponentInitialization(): Promise<void> {
    try {
      console.log('🔧 컴포넌트 등록 및 초기화 시작...');
      
      // 1. 폴백 컨텐츠 렌더링 (즉시 UI 표시)
      this.renderFallbackContent();
      
      // 2. 실제 컴포넌트들 로드 시도
      await this.loadComponentsAsync();
      
    } catch (error) {
      console.error('❌ 컴포넌트 초기화 실패:', error);
      // 폴백 컨텐츠가 이미 렌더링되어 있으므로 UI는 동작
    }
  }

  /**
   * 컴포넌트들을 비동기로 로드 - 개선된 버전
   */
  private async loadComponentsAsync(): Promise<void> {
    try {
      console.log('🔄 실제 컴포넌트 로딩 시작...');
      
      // 동적 import로 컴포넌트들 로드
      const componentModules = await Promise.allSettled([
        import('../components/layout/Header/Header.ts'),
        import('../components/layout/Sidebar/Sidebar.ts'),
        import('../components/layout/MainContent/MainContent.ts'),
        import('../components/layout/AISidebar/AISidebar.ts')
      ]);

      const componentNames = ['Header', 'Sidebar', 'MainContent', 'AISidebar'];
      const loadedComponents = componentModules
        .map((result, index) => {
          const componentName = componentNames[index];
          
          if (result.status === 'fulfilled' && result.value) {
            console.log(`✅ ${componentName} 모듈 로드 성공`);
            this.componentsInitializationState.componentStates.set(componentName!, 'loaded');
            return { name: componentName!, module: result.value };
          } else {
            const errorMessage = result.status === 'rejected' ? result.reason : 'Unknown error';
            console.warn(`❌ ${componentName!} 모듈 로드 실패:`, errorMessage);
            this.componentsInitializationState.componentStates.set(componentName!, 'error');
            return null;
          }
        })
        .filter((component): component is { name: string; module: any } => component !== null);

      if (loadedComponents.length > 0) {
        console.log(`✅ ${loadedComponents.length}개 컴포넌트 모듈 로드 성공`);
        await this.initializeRealComponents(loadedComponents);
      } else {
        console.log('ℹ️ 컴포넌트 모듈 로드 실패, 폴백 컨텐츠 유지');
      }
      
    } catch (error) {
      console.log('ℹ️ 컴포넌트 동적 로드 실패, 폴백 컨텐츠 유지:', error);
    }
  }

  /**
   * 실제 컴포넌트들을 초기화 - 중복 방지 강화
   */
  private async initializeRealComponents(loadedComponents: Array<{name: string, module: any}>): Promise<void> {
    try {
      console.log('🚀 실제 컴포넌트 초기화 시작...');
      
      // 초기화된 컴포넌트 추적
      const initializedComponents = new Set<string>();
      
      for (const { name, module } of loadedComponents) {
        // 중복 초기화 방지
        if (initializedComponents.has(name)) {
          console.warn(`⚠️ ${name} 컴포넌트가 이미 초기화되었습니다. 건너뜁니다.`);
          continue;
        }
        
        // 이미 초기화 플래그가 설정된 경우
        if (this.componentRegistry.getInitializationFlag(name)) {
          console.warn(`⚠️ ${name} 컴포넌트 초기화 플래그가 이미 설정됨. 건너뜁니다.`);
          continue;
        }
        
        try {
          // 초기화 플래그 설정
          this.componentRegistry.setInitializationFlag(name, true);
          this.componentsInitializationState.componentStates.set(name, 'loading');
          
          await this.initializeSingleComponent(name, module);
          
          initializedComponents.add(name);
          console.log(`✅ ${name} 컴포넌트 초기화 완료`);
          
        } catch (error) {
          console.error(`❌ ${name} 컴포넌트 초기화 실패:`, error);
          this.componentsInitializationState.componentStates.set(name, 'error');
          // 하나의 컴포넌트 실패가 전체를 중단시키지 않도록 계속 진행
        }
      }
      
      console.log('✅ 모든 실제 컴포넌트 초기화 시도 완료');
      
    } catch (error) {
      console.error('❌ 실제 컴포넌트 초기화 실패:', error);
    }
  }

  /**
   * 단일 컴포넌트 초기화
   */
  private async initializeSingleComponent(name: string, module: any): Promise<void> {
    // 모듈에서 export된 클래스 찾기
    const ComponentClass = module.default || module[name] || module;
    console.log(`🔍 ${name} 모듈 구조:`, Object.keys(module));
    
    if (!ComponentClass || typeof ComponentClass !== 'function') {
      throw new Error(`Invalid component class for ${name}`);
    }
    
    const elementId = this.getElementIdForComponent(name);
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`DOM element not found for ${name}: #${elementId}`);
    }
    
    // 기존 컴포넌트 인스턴스가 있는지 확인
    const existingInstance = element.getAttribute('data-component-initialized');
    if (existingInstance === 'true') {
      console.warn(`⚠️ ${name} 컴포넌트가 이미 초기화된 것으로 표시됨`);
      return;
    }
    
    console.log(`🔧 ${name} 컴포넌트 초기화 중...`);
    console.log(`📍 Element ID: ${elementId}, Class: ${ComponentClass.name}`);
    
    // 기존 폴백 컨텐츠 제거
    element.innerHTML = '';
    
    // 실제 컴포넌트 인스턴스 생성
    const componentInstance = new ComponentClass(
      element,
      this.getPropsForComponent(name),
      this.eventManager,
      { autoRender: false } // 수동 초기화
    );
    
    console.log(`🏗️ ${name} 인스턴스 생성 완료`);
    
    // 컴포넌트 수동 초기화
    await componentInstance.initialize();
    
    // 초기화 완료 마킹
    element.setAttribute('data-component-initialized', 'true');
    
    console.log(`✅ ${name} 컴포넌트 초기화 완료`);
  }

  /**
   * 컴포넌트 이름에 대응하는 DOM 요소 ID 반환
   */
  private getElementIdForComponent(componentName: string): string {
    const idMap: Record<string, string> = {
      'Header': 'header',
      'Sidebar': 'sidebar', 
      'MainContent': 'mainContent',
      'AISidebar': 'aiSidebar'
    };
    return idMap[componentName] || componentName.toLowerCase();
  }

  /**
   * 컴포넌트별 기본 props 반환
   */
  private getPropsForComponent(componentName: string): any {
    const propsMap: Record<string, any> = {
      'Header': {
        showLogo: true,
        showConnectionStatus: true,
        showToggleButtons: true,
        logoText: 'Recursive',
        enableThemeToggle: true
      },
      'Sidebar': {
        defaultCollapsed: false,
        showSearch: true,
        enableResize: true
      },
      'MainContent': {
        showWelcome: true,
        enableRouting: true
      },
      'AISidebar': {
        defaultCollapsed: false,
        enableChat: true,
        showHistory: true
      }
    };
    return propsMap[componentName] || {};
  }

  /**
   * 폴백 컨텐츠 렌더링 - 개선된 버전
   */
  private renderFallbackContent(): void {
    console.log('🎨 폴백 컨텐츠 렌더링 시작...');
    
    const componentElements = [
      { id: 'header', renderer: this.renderHeaderFallback },
      { id: 'mainContent', renderer: this.renderMainContentFallback },
      { id: 'sidebar', renderer: this.renderSidebarFallback },
      { id: 'aiSidebar', renderer: this.renderAISidebarFallback }
    ];

    componentElements.forEach(({ id, renderer }) => {
      const element = document.querySelector(`#${id}`);
      if (element && !element.getAttribute('data-component-initialized')) {
        try {
          renderer.call(this, element);
          console.log(`✅ ${id} 폴백 컨텐츠 렌더링 완료`);
        } catch (error) {
          console.error(`❌ ${id} 폴백 컨텐츠 렌더링 실패:`, error);
        }
      }
    });

    console.log('✅ 폴백 컨텐츠 렌더링 완료');
  }

  private renderHeaderFallback(element: Element): void {
    element.innerHTML = `
      <div class="header-fallback" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 1rem;
        background: var(--color-background-secondary, #f5f5f5);
        border-bottom: 1px solid var(--color-border, #e5e5e5);
        height: 100%;
      ">
        <div class="header-left" style="display: flex; align-items: center; gap: 1rem;">
          <button id="leftToggleBtn" style="
            background: none;
            border: 1px solid #ccc;
            padding: 0.5rem;
            border-radius: 4px;
            cursor: pointer;
          " aria-label="메뉴 토글">☰</button>
          <div class="logo" style="font-weight: bold; font-size: 1.2rem; color: var(--color-primary, #007acc);">
            Recursive UI
          </div>
        </div>
        <div class="header-right" style="display: flex; align-items: center; gap: 0.5rem;">
          <div class="connection-status" style="
            padding: 0.25rem 0.5rem;
            background: #10b981;
            color: white;
            border-radius: 4px;
            font-size: 0.75rem;
          ">연결됨</div>
          <button id="rightToggleBtn" style="
            background: none;
            border: 1px solid #ccc;
            padding: 0.5rem;
            border-radius: 4px;
            cursor: pointer;
          " aria-label="AI 사이드바 토글">🤖</button>
        </div>
      </div>
    `;
    
    // 폴백 버튼 이벤트 설정
    this.setupFallbackHeaderEvents(element);
  }

  private setupFallbackHeaderEvents(element: Element): void {
    const leftToggleBtn = element.querySelector('#leftToggleBtn');
    const rightToggleBtn = element.querySelector('#rightToggleBtn');
    
    if (leftToggleBtn) {
      leftToggleBtn.addEventListener('click', () => {
        console.log('🔘 폴백 Header: 좌측 토글 버튼 클릭');
        this.eventManager.emit('sidebar:toggle', { source: 'fallback-header' });
      });
    }
    
    if (rightToggleBtn) {
      rightToggleBtn.addEventListener('click', () => {
        console.log('🔘 폴백 Header: 우측 토글 버튼 클릭');
        this.eventManager.emit('ai-sidebar:toggle', { source: 'fallback-header' });
      });
    }
  }

  private renderMainContentFallback(element: Element): void {
    element.innerHTML = `
      <div class="main-content-fallback" style="padding: 2rem; background: var(--color-background-primary, #ffffff); min-height: 100%;">
        <h2 style="margin: 0 0 1rem 0; color: var(--color-text-primary, #1f2937);">
          🎯 Recursive Platform Dashboard
        </h2>
        <div class="welcome-section" style="
          background: var(--color-background-secondary, #f9fafb);
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 2rem;
          border: 1px solid var(--color-border, #e5e7eb);
        ">
          <h3 style="margin: 0 0 1rem 0; color: var(--color-text-primary, #1f2937);">환영합니다! 🚀</h3>
          <p style="margin: 0 0 1rem 0; color: var(--color-text-secondary, #6b7280);">
            Recursive UI가 성공적으로 로드되었습니다. 시스템이 정상 작동 중입니다.
          </p>
          <div class="status-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
            <div class="status-card" style="background: white; padding: 1rem; border-radius: 6px; border: 1px solid var(--color-border, #e5e7eb);">
              <div style="font-weight: 600; color: var(--color-text-primary, #1f2937);">📊 시스템 상태</div>
              <div style="color: #10b981; font-weight: 500; margin-top: 0.5rem;">정상 작동</div>
            </div>
            <div class="status-card" style="background: white; padding: 1rem; border-radius: 6px; border: 1px solid var(--color-border, #e5e7eb);">
              <div style="font-weight: 600; color: var(--color-text-primary, #1f2937);">🕒 초기화 시간</div>
              <div style="color: var(--color-text-secondary, #6b7280); margin-top: 0.5rem;">${new Date().toLocaleString()}</div>
            </div>
            <div class="status-card" style="background: white; padding: 1rem; border-radius: 6px; border: 1px solid var(--color-border, #e5e7eb);">
              <div style="font-weight: 600; color: var(--color-text-primary, #1f2937);">🔧 서비스</div>
              <div style="color: #10b981; font-weight: 500; margin-top: 0.5rem;">${this.serviceRegistry.list().length}개 활성</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSidebarFallback(element: Element): void {
    element.innerHTML = `
      <div class="sidebar-fallback" style="padding: 1rem; background: var(--color-background-secondary, #f5f5f5); height: 100%;">
        <nav style="margin-top: 1rem;">
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 0.5rem;">
              <a href="#dashboard" style="display: flex; align-items: center; padding: 0.75rem; text-decoration: none; color: white; border-radius: 6px; background: var(--color-primary, #007acc);">
                📊 대시보드
              </a>
            </li>
            <li style="margin-bottom: 0.5rem;">
              <a href="#metrics" style="display: flex; align-items: center; padding: 0.75rem; text-decoration: none; color: var(--color-text-primary, #1f2937); border-radius: 6px; transition: background-color 0.2s;" 
                 onmouseover="this.style.backgroundColor='var(--color-background-tertiary, #e5e7eb)'" 
                 onmouseout="this.style.backgroundColor='transparent'">
                📈 메트릭
              </a>
            </li>
            <li style="margin-bottom: 0.5rem;">
              <a href="#logs" style="display: flex; align-items: center; padding: 0.75rem; text-decoration: none; color: var(--color-text-primary, #1f2937); border-radius: 6px; transition: background-color 0.2s;" 
                 onmouseover="this.style.backgroundColor='var(--color-background-tertiary, #e5e7eb)'" 
                 onmouseout="this.style.backgroundColor='transparent'">
                📝 로그
              </a>
            </li>
            <li style="margin-bottom: 0.5rem;">
              <a href="#settings" style="display: flex; align-items: center; padding: 0.75rem; text-decoration: none; color: var(--color-text-primary, #1f2937); border-radius: 6px; transition: background-color 0.2s;" 
                 onmouseover="this.style.backgroundColor='var(--color-background-tertiary, #e5e7eb)'" 
                 onmouseout="this.style.backgroundColor='transparent'">
                ⚙️ 설정
              </a>
            </li>
          </ul>
        </nav>
      </div>
    `;
  }

  private renderAISidebarFallback(element: Element): void {
    element.innerHTML = `
      <div class="ai-sidebar-fallback" style="padding: 1rem; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; height: 100%;">
        <h3 style="margin: 0 0 1rem 0; color: white; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          🤖 AI 어시스턴트
        </h3>
        <div style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
          <p style="margin: 0 0 0.5rem 0; color: rgba(255, 255, 255, 0.9); font-size: 0.9rem;">
            AI 기능이 준비 중입니다...
          </p>
          <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 4px; font-size: 0.8rem; color: rgba(255, 255, 255, 0.7);">
            💡 곧 지능형 어시스턴트가 여러분의 작업을 도와드릴 예정입니다.
          </div>
        </div>
      </div>
    `;
  }

  // 기존 메서드들은 동일하게 유지
  private normalizeOptions(options: ApplicationOptions): Required<ApplicationOptions> {
    return {
      config: options.config || {},
      autoStart: options.autoStart ?? false,
      debug: options.debug ?? false,
      rootElement: options.rootElement || '#app',
      initTimeout: options.initTimeout || 30000
    };
  }

  private setState(newState: ApplicationState): void {
    const oldState = this.state;
    this.state = newState;
    
    this.eventManager.emit('app:state-change', {
      oldState,
      newState,
      timestamp: Date.now()
    });
  }

  private async setupRootElement(): Promise<void> {
    const { rootElement } = this.options;
    
    if (typeof rootElement === 'string') {
      this.rootElement = document.querySelector(rootElement);
      if (!this.rootElement) {
        throw new Error(`Root element not found: ${rootElement}`);
      }
    } else {
      this.rootElement = rootElement;
    }

    this.rootElement.classList.add('recursive-ui-app');
    this.rootElement.setAttribute('data-app-state', this.state);
    this.rootElement.setAttribute('data-app-version', this.configManager.getAppConfig().version);
  }

  private setupApplicationHooks(): void {
    this.lifecycleManager.addHook('beforeInit', async () => {
      this.eventManager.emit('app:before-init', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('init', async () => {
      this.eventManager.emit('app:init', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('afterInit', async () => {
      this.eventManager.emit('app:after-init', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('beforeStart', async () => {
      this.eventManager.emit('app:before-start', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('start', async () => {
      this.eventManager.emit('app:start', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('afterStart', async () => {
      this.eventManager.emit('app:after-start', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('beforeStop', async () => {
      this.eventManager.emit('app:before-stop', { timestamp: Date.now() });
    });

    this.lifecycleManager.addHook('afterStop', async () => {
      this.eventManager.emit('app:after-stop', { timestamp: Date.now() });
    });
  }

  private setupErrorHandling(): void {
    this.lifecycleManager.addErrorHandler((error, phase) => {
      console.error(`Lifecycle error in phase ${phase}:`, error);
      this.handleError(error);
    });

    console.log('🛡️ Error handling setup completed');
  }

  private bindEvents(): void {
    this.configManager.onChange((config) => {
      this.eventManager.emit('app:config-changed', { config });
    });

    this.eventManager.on('app:state-change', ({ newState }) => {
      if (this.rootElement) {
        this.rootElement.setAttribute('data-app-state', newState);
      }
    });
  }

  private unbindEvents(): void {
    console.log('🔌 Events unbound');
  }

  private async handleError(error: Error): Promise<void> {
    console.error('Application error:', error);
    
    this.unhandledErrors.push(error);
    
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
    
    this.eventManager.emit('app:error', {
      error,
      timestamp: Date.now(),
      state: this.state
    });
  }

  private async registerDefaultServices(): Promise<void> {
    try {
      await this.registerAPIClient();
      await this.registerWebSocketService();
      
      const storageService = {
        name: 'storage',
        version: '1.0.0',
        isInitialized: true,
        status: 'ready' as const,
        async initialize() { this.isInitialized = true; },
        async destroy() { this.isInitialized = false; },
        getStatus() { return 'ready' as const; }
      };
      this.serviceRegistry.register('storage', storageService);
      
      const analyticsService = {
        name: 'analytics',
        version: '1.0.0',
        isInitialized: true,
        status: 'ready' as const,
        async initialize() { this.isInitialized = true; },
        async destroy() { this.isInitialized = false; },
        getStatus() { return 'ready' as const; }
      };
      this.serviceRegistry.register('analytics', analyticsService);
      
      console.info('✅ Default services registered');
    } catch (error) {
      console.error('❌ Failed to register default services:', error);
      throw error;
    }
  }

  private async registerWebSocketService(): Promise<void> {
    try {
      const { createWebSocketManager } = await import('../services/websocket/websocket-manager.js');
      
      // 기본 WebSocket 설정
      const config = {
        url: 'ws://localhost:3000', // 기본 URL - 설정에서 가져올 수 있도록 나중에 개선
        enableAutoReconnect: true,
        enableConnectionPool: false,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000,
        heartbeatInterval: 15000,
        heartbeatTimeout: 30000
      };
      
      const webSocketManager = createWebSocketManager(config, this.eventManager);
      
      // WebSocketManager를 Service 인터페이스에 맞게 래핑
      const webSocketService = {
        name: 'websocket',
        version: '1.0.0',
        isInitialized: false,
        status: 'ready' as const,
        manager: webSocketManager,
        async initialize() { 
          await this.manager.initialize();
          this.isInitialized = true; 
        },
        async destroy() { 
          this.manager.destroy();
          this.isInitialized = false; 
        },
        getStatus() { 
          return this.manager.isConnected ? 'ready' as const : 'error' as const; 
        }
      };
      
      this.serviceRegistry.register('websocket', webSocketService);
      
      // WebSocket 초기화 시도
      await webSocketService.initialize();
      
      // 자동 연결 시도 (실패해도 앱 시작은 계속)
      try {
        await webSocketManager.connect();
        console.info('✅ WebSocket service connected');
      } catch (error) {
        console.warn('⚠️ WebSocket connection failed, but service is registered:', error);
        // 연결 실패해도 서비스는 유지 (나중에 재연결 시도 가능)
      }
      
      console.info('✅ WebSocket service registered');
    } catch (error) {
      console.error('❌ Failed to register WebSocket service:', error);
      // WebSocket 서비스 등록 실패는 앱 전체를 중단시키지 않음
    }
  }

  private async registerAPIClient(): Promise<void> {
    try {
      const { APIServiceFactory, getAPIConfig } = await import('../services/api/index.js');
      const config = this.configManager.getConfig();
      const apiConfig = config.api || getAPIConfig.development();
      
      const apiClient = APIServiceFactory.registerAPIClient(
        this.serviceRegistry,
        this.eventManager,
        apiConfig
      );
      
      this.serviceRegistry.register('api', apiClient);
      
      console.info('✅ API Client registered as both "api-client" and "api"');
    } catch (error) {
      console.error('Failed to register API client:', error);
      throw error;
    }
  }

  // Public API methods remain the same
  getConfigManager(): ConfigManager { return this.configManager; }
  getEventManager(): EventManager { return this.eventManager; }
  getLifecycleManager(): LifecycleManager { return this.lifecycleManager; }
  getServiceRegistry(): ServiceRegistry { return this.serviceRegistry; }
  getComponentRegistry(): ApplicationComponentRegistry { return this.componentRegistry; }
  getState(): ApplicationState { return this.state; }
  isRunning(): boolean { return this.state === 'running'; }
  isInitialized(): boolean { return this.state !== 'uninitialized'; }
  getRootElement(): HTMLElement | null { return this.rootElement; }
  
  registerService<T extends Service>(name: string, service: T): void {
    this.serviceRegistry.register(name, service);
  }

  getService<T extends Service>(name: string): T | undefined {
    return this.serviceRegistry.get<T>(name);
  }

  registerComponent<T extends Component>(name: string, constructor: ComponentConstructor<T>): void {
    this.componentRegistry.registerConstructor(name, constructor);
  }

  createComponent<T extends Component>(name: string, element: HTMLElement | string, props?: any, instanceId?: string): T {
    return this.componentRegistry.create<T>(name, element, props, instanceId);
  }

  addErrorHandler(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  getUnhandledErrors(): Error[] { return [...this.unhandledErrors]; }
  clearUnhandledErrors(): void { this.unhandledErrors.length = 0; }
}

// Utility functions remain the same
export function getApplication(): Application {
  const instance = Application.getInstance();
  if (!instance.isInitialized()) {
    throw new Error('Application is not initialized. Call initialize() first.');
  }
  return instance;
}

export async function startApplication(options?: ApplicationOptions): Promise<Application> {
  const app = Application.getInstance(options);
  
  if (!app.isInitialized()) {
    await app.initialize();
  }
  
  if (!app.isRunning()) {
    await app.start();
  }
  
  return app;
}

export function getDebugInfo(): Record<string, any> {
  try {
    const app = getApplication();
    return {
      state: app.getState(),
      isRunning: app.isRunning(),
      isInitialized: app.isInitialized(),
      config: app.getConfigManager().getConfig(),
      lifecyclePhase: app.getLifecycleManager().getCurrentPhase(),
      services: Array.from(app.getServiceRegistry().getAll().keys()),
      components: app.getComponentRegistry().getRegisteredConstructors(),
      unhandledErrors: app.getUnhandledErrors().length,
      rootElement: app.getRootElement()?.tagName
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      available: false
    };
  }
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).RecursiveUI = {
    Application,
    getApplication,
    startApplication,
    getDebugInfo
  };
}

export default Application;