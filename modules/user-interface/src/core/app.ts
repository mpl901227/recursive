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
import { registerDefaultComponents } from '../components/registry.js';
import { LoggerManager, LogLevel } from '../utils/logger';

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
      
      // 원격 로깅 설정
      this.setupRemoteLogging();
      
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
      
      // 0. 기본 컴포넌트들 등록
      registerDefaultComponents();
      
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
    // 전역 에러 핸들러
    window.addEventListener('error', (event) => {
      this.handleError(new Error(`Global error: ${event.message}`));
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(`Unhandled promise rejection: ${event.reason}`));
    });

    // 앱 전역 접근
    (window as any).app = this;
    
    // RecursiveApp 전역 객체 설정 (컴포넌트에서 접근 가능)
    (window as any).RecursiveApp = {
      serviceRegistry: this.serviceRegistry,
      componentRegistry: this.componentRegistry,
      eventManager: this.eventManager,
      configManager: this.configManager,
      app: this
    };

    // 개발 모드에서 디버그 정보 노출
    if (this.options.debug) {
      (window as any).debugApp = () => ({
        state: this.state,
        services: Array.from(this.serviceRegistry.getAll().keys()),
        components: this.componentRegistry.getRegisteredConstructors(),
        config: this.configManager.getConfig()
      });
    }

    // 로그 시스템 라우트 설정
    this.setupLogSystemRoutes();

    // Logger 원격 전송 설정
    this.setupRemoteLogging();
  }

  /**
   * 로그 시스템 라우트 설정
   */
  private async setupLogSystemRoutes(): Promise<void> {
    try {
      const { Router } = await import('./router.js');
      const router = new Router(this.eventManager, {
        mode: 'hash',
        base: '',
        fallback: '/'
      });

      // 로그 대시보드 라우트
      router.addRoute({
        path: '/logs/dashboard',
        handler: async (context) => {
          await this.loadLogComponent('LogDashboard', context);
        },
        name: 'log-dashboard'
      });

      // 로그 뷰어 라우트
      router.addRoute({
        path: '/logs/viewer',
        handler: async (context) => {
          await this.loadLogComponent('LogViewer', context);
        },
        name: 'log-viewer'
      });

      // 로그 검색 라우트
      router.addRoute({
        path: '/logs/search',
        handler: async (context) => {
          await this.loadLogComponent('LogSearch', context);
        },
        name: 'log-search'
      });

      // 로그 분석 라우트
      router.addRoute({
        path: '/logs/analysis',
        handler: async (context) => {
          await this.loadLogComponent('LogAnalysis', context);
        },
        name: 'log-analysis'
      });

      // 기본 대시보드 라우트
      router.addRoute({
        path: '/dashboard',
        handler: async (context) => {
          await this.loadDashboardComponent(context);
        },
        name: 'dashboard'
      });

      // 기본 라우트
      router.addRoute({
        path: '/',
        handler: async () => {
          await this.loadDefaultContent();
        },
        name: 'home'
      });

      await router.start();
      console.info('✅ Router initialized with log system routes');
    } catch (error) {
      console.error('❌ Failed to setup log system routes:', error);
    }
  }

  /**
   * 로그 컴포넌트 로드
   */
  private async loadLogComponent(componentName: string, context: any): Promise<void> {
    try {
      const mainContent = document.getElementById('mainContent');
      if (!mainContent) {
        console.error('Main content container not found');
        return;
      }

      // 로딩 상태 표시
      mainContent.innerHTML = `
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <p>로딩 중...</p>
        </div>
      `;

      // 로그 시스템 서비스 확인
      const logService = this.serviceRegistry.get('log-system');
      if (!logService) {
        throw new Error('LogSystem service not found');
      }

      // 컴포넌트 생성
      const { createComponent } = await import('../components/registry.js');
      
      let title = '';
      let description = '';

      // mainContent를 초기화 (로딩 상태 제거)
      mainContent.innerHTML = '';

      switch (componentName) {
        case 'LogDashboard':
          title = '로그 대시보드';
          description = '시스템 로그 현황을 한눈에 확인하세요';
          const dashboardComponent = createComponent('LogDashboard', mainContent, {
            timeRange: '1h',
            refreshInterval: 30000
          }, this.eventManager);
          
          // 강제 초기화 및 렌더링
          if (dashboardComponent && typeof dashboardComponent.initialize === 'function') {
            await dashboardComponent.initialize();
            if (typeof dashboardComponent.render === 'function') {
              dashboardComponent.render();
            }
            console.info(`🎨 LogDashboard component rendered`);
          }
          break;

        case 'LogViewer':
          title = '로그 뷰어';
          description = '실시간 로그를 확인하고 필터링하세요';
          const viewerComponent = createComponent('LogViewer', mainContent, {
            pageSize: 50,
            realTimeMode: true,
            showFilters: true
          }, this.eventManager);
          
          // 강제 초기화 및 렌더링
          if (viewerComponent && typeof viewerComponent.initialize === 'function') {
            await viewerComponent.initialize();
            if (typeof viewerComponent.render === 'function') {
              viewerComponent.render();
            }
            console.info(`🎨 LogViewer component rendered`);
          }
          break;

        case 'LogSearch':
          title = '로그 검색';
          description = '고급 검색 기능으로 원하는 로그를 찾아보세요';
          const searchComponent = createComponent('LogSearch', mainContent, {
            enableAdvancedSearch: true,
            enableAutoComplete: true
          }, this.eventManager);
          
          // 강제 초기화 및 렌더링
          if (searchComponent && typeof searchComponent.initialize === 'function') {
            await searchComponent.initialize();
            if (typeof searchComponent.render === 'function') {
              searchComponent.render();
            }
            console.info(`🎨 LogSearch component rendered`);
          }
          break;

        case 'LogAnalysis':
          title = '로그 분석';
          description = '로그 패턴, 성능, 트렌드를 분석하세요';
          const analysisComponent = createComponent('LogAnalysis', mainContent, {
            timeRange: '24h'
          }, this.eventManager);
          
          // 강제 초기화 및 렌더링
          if (analysisComponent && typeof analysisComponent.initialize === 'function') {
            await analysisComponent.initialize();
            if (typeof analysisComponent.render === 'function') {
              analysisComponent.render();
            }
            console.info(`🎨 LogAnalysis component rendered`);
          }
          break;

        default:
          throw new Error(`Unknown log component: ${componentName}`);
      }

      // 페이지 제목 업데이트
      this.updatePageTitle(title, description);

      // 네비게이션 이벤트 발생
      this.eventManager.emit('navigation:changed', {
        path: context.path,
        component: componentName,
        title
      });

      console.info(`✅ ${componentName} loaded successfully`);
    } catch (error) {
      console.error(`❌ Failed to load ${componentName}:`, error);
      await this.loadErrorContent(error as Error);
    }
  }

  /**
   * 대시보드 컴포넌트 로드
   */
  private async loadDashboardComponent(_context: any): Promise<void> {
    try {
      const mainContent = document.getElementById('mainContent');
      if (!mainContent) return;

      mainContent.innerHTML = `
        <div class="dashboard-container">
          <div class="dashboard-header">
            <h1>시스템 대시보드</h1>
            <p>Recursive 시스템 현황을 확인하세요</p>
          </div>
          
          <div class="dashboard-grid">
            <div class="dashboard-card">
              <h3>로그 시스템</h3>
              <p>최근 로그 활동을 확인하세요</p>
              <a href="#/logs/dashboard" class="btn btn-primary">로그 대시보드 열기</a>
            </div>
            
            <div class="dashboard-card">
              <h3>실시간 모니터링</h3>
              <p>시스템 상태를 실시간으로 모니터링</p>
              <a href="#/logs/viewer" class="btn btn-primary">로그 뷰어 열기</a>
            </div>
            
            <div class="dashboard-card">
              <h3>로그 검색</h3>
              <p>고급 검색으로 특정 로그 찾기</p>
              <a href="#/logs/search" class="btn btn-primary">로그 검색 열기</a>
            </div>
            
            <div class="dashboard-card">
              <h3>로그 분석</h3>
              <p>로그 패턴, 성능, 트렌드를 심층 분석</p>
              <a href="#/logs/analysis" class="btn btn-primary">로그 분석 열기</a>
            </div>
          </div>
        </div>
      `;

      this.updatePageTitle('대시보드', 'Recursive 시스템 현황');
    } catch (error) {
      console.error('❌ Failed to load dashboard:', error);
    }
  }

  /**
   * 기본 콘텐츠 로드
   */
  private async loadDefaultContent(): Promise<void> {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    mainContent.innerHTML = `
      <div class="welcome-container">
        <div class="welcome-header">
          <h1>🔄 Recursive에 오신 것을 환영합니다</h1>
          <p>통합 로그 시스템과 AI 도구를 활용한 개발 환경</p>
        </div>
        
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>로그 대시보드</h3>
            <p>시스템 로그를 시각적으로 분석하고 모니터링하세요</p>
            <a href="#/logs/dashboard" class="btn btn-outline">시작하기</a>
          </div>
          
          <div class="feature-card">
            <div class="feature-icon">👁️</div>
            <h3>실시간 로그 뷰어</h3>
            <p>실시간으로 발생하는 로그를 실시간으로 확인하세요</p>
            <a href="#/logs/viewer" class="btn btn-outline">시작하기</a>
          </div>
          
          <div class="feature-card">
            <div class="feature-icon">🔍</div>
            <h3>로그 검색</h3>
            <p>강력한 검색 기능으로 원하는 로그를 빠르게 찾아보세요</p>
            <a href="#/logs/search" class="btn btn-outline">시작하기</a>
          </div>
          
          <div class="feature-card">
            <div class="feature-icon">📈</div>
            <h3>로그 분석</h3>
            <p>AI 기반 로그 분석으로 패턴과 트렌드를 발견하세요</p>
            <a href="#/logs/analysis" class="btn btn-outline">시작하기</a>
          </div>
        </div>
      </div>
    `;

    this.updatePageTitle('환영합니다', 'Recursive 통합 개발 환경');
  }

  /**
   * 에러 콘텐츠 로드
   */
  private async loadErrorContent(error: Error): Promise<void> {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    mainContent.innerHTML = `
      <div class="error-container">
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <h2>오류가 발생했습니다</h2>
          <p class="error-message">${error.message}</p>
          <div class="error-actions">
            <button onclick="window.location.reload()" class="btn btn-primary">페이지 새로고침</button>
            <a href="#/" class="btn btn-outline">홈으로 돌아가기</a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 페이지 제목 업데이트
   */
  private updatePageTitle(title: string, description?: string): void {
    document.title = `${title} - Recursive`;
    
    // 메타 description 업데이트
    if (description) {
      let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = description;
    }
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
      // 핵심 서비스들을 병렬로 등록 (서로 독립적)
      const serviceRegistrations = [
        this.registerAPIClient(),
        this.registerWebSocketService(),
        this.registerLogSystemService()
      ];
      
      // 병렬 등록 실행 (실패한 서비스가 있어도 다른 서비스는 계속 등록)
      const results = await Promise.allSettled(serviceRegistrations);
      
      // 실패한 서비스 로그 출력
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const serviceName = ['API Client', 'WebSocket', 'LogSystem'][index];
          console.warn(`⚠️ Failed to register ${serviceName} service:`, result.reason);
        }
      });
      
      // 기본 서비스들 등록
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to register default services:', errorMessage);
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

  private async registerLogSystemService(): Promise<void> {
    try {
      const { 
        createLogSystemServiceInstance, 
        createEnvironmentLogSystemConfig 
      } = await import('../services/log-system/index.js');
      
      // ConfigManager에서 로그 시스템 설정 가져오기
      let logSystemConfig = this.configManager.getLogSystemConfig();
      
      // 설정이 없으면 환경별 기본 설정 생성
      if (!logSystemConfig) {
        // 강제로 development 환경 사용 (8888 포트)
        const environment = 'development';
        logSystemConfig = createEnvironmentLogSystemConfig(environment);
        
        // ConfigManager에 설정 저장
        this.configManager.updateConfig({
          logSystem: logSystemConfig
        });
      }
      
      // 설정이 비활성화된 경우 서비스 등록하지 않음
      if (!logSystemConfig.enabled) {
        console.info('⚠️ LogSystem service is disabled in configuration');
        return;
      }
      
      // LogSystemService 생성
      const logSystemService = createLogSystemServiceInstance(logSystemConfig, this.eventManager);
      
      // 서비스 등록
      this.serviceRegistry.register('log-system', logSystemService);
      
      // 자동 시작이 활성화된 경우에만 초기화 시도
      if (logSystemConfig.autoStart) {
        try {
          await logSystemService.initialize();
          console.info('✅ LogSystem service initialized and connected');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn('⚠️ LogSystem service registered but failed to connect:', errorMessage);
          // 연결 실패해도 서비스는 유지 (나중에 재연결 시도 가능)
        }
      }
      
      console.info('✅ LogSystem service registered');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to register LogSystem service:', errorMessage);
      // LogSystem 서비스 등록 실패는 앱 전체를 중단시키지 않음
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

  // Logger 원격 전송 설정 추가
  private setupRemoteLogging(): void {
    try {
      // 클라이언트 로그를 서버로 전송하도록 설정
      const loggerManager = LoggerManager.getInstance();
      loggerManager.setDefaultOptions({
        enableRemote: true,
        remoteEndpoint: 'http://localhost:8888/api/client-logs',
        level: LogLevel.INFO, // INFO 레벨 이상만 전송 (DEBUG 제외)
        batchSize: 10,
        batchInterval: 5000, // 배치 간격을 늘림
        includeUrl: true,
        includeUserAgent: true,
        includeStack: false, // 스택 트레이스 비활성화로 성능 향상
        enableConsole: false // 무한 루프 방지를 위해 콘솔 출력 비활성화
      });

      // 원본 console 메서드 저장
      const originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console)
      };

      // 로그 수집 제외할 패턴들
      const excludePatterns = [
        /🚀 Emitting event/,
        /Emitting event:/,
        /Event emitted:/,
        /Logger/,
        /BrowserConsole/,
        /Remote logging/,
        /LogSystem/,
        /%c\[.*?\]/  // 색상 코드가 포함된 로그
      ];

      // 메시지가 제외 패턴에 해당하는지 확인
      const shouldExcludeMessage = (message: string): boolean => {
        return excludePatterns.some(pattern => pattern.test(message));
      };

      // 브라우저 콘솔 로그를 캐치하는 로거 (콘솔 출력 비활성화)
      const consoleLogger = loggerManager.getLogger('BrowserConsole', {
        enableConsole: false,
        enableRemote: true
      });

      // console.error만 캐치 (가장 중요한 로그만)
      console.error = (...args: any[]) => {
        originalConsole.error(...args);
        try {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          
          if (!shouldExcludeMessage(message)) {
            consoleLogger.error(message);
          }
        } catch (e) {
          // 로그 전송 실패 시 무시
        }
      };

      // console.warn만 캐치
      console.warn = (...args: any[]) => {
        originalConsole.warn(...args);
        try {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          
          if (!shouldExcludeMessage(message)) {
            consoleLogger.warn(message);
          }
        } catch (e) {
          // 로그 전송 실패 시 무시
        }
      };

      // console.log, console.info, console.debug는 오버라이드하지 않음 (성능상 이유)

      // 글로벌 에러 핸들러에서도 로그 전송
      window.addEventListener('error', (event) => {
        try {
          const logger = loggerManager.getLogger('ClientError', { enableConsole: false });
          logger.error('JavaScript Error', {
            message: event.error?.message || event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack,
            url: window.location.href
          });
        } catch (e) {
          // 에러 핸들링 실패 시 무시
        }
      });

      // Promise rejection 에러도 캐치
      window.addEventListener('unhandledrejection', (event) => {
        try {
          const logger = loggerManager.getLogger('ClientError', { enableConsole: false });
          logger.error('Unhandled Promise Rejection', {
            reason: event.reason,
            url: window.location.href
          });
        } catch (e) {
          // 에러 핸들링 실패 시 무시
        }
      });

      // DOM 이벤트 리스너 중복 등록 감지를 위한 패치
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const eventListenerMap = new WeakMap<EventTarget, Map<string, Set<EventListener>>>();

      EventTarget.prototype.addEventListener = function(type: string, listener: EventListener | EventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        if (listener) {
          try {
            // 이벤트 리스너 추적
            if (!eventListenerMap.has(this)) {
              eventListenerMap.set(this, new Map());
            }
            const elementMap = eventListenerMap.get(this)!;
            
            if (!elementMap.has(type)) {
              elementMap.set(type, new Set());
            }
            const listenersSet = elementMap.get(type)!;
            
            // 중복 등록 확인
            if (listenersSet.has(listener as EventListener)) {
              const logger = loggerManager.getLogger('DOMEvents', { enableConsole: false });
              logger.warn('DOM 이벤트 리스너가 이미 등록됨', {
                eventType: type,
                element: this.constructor.name,
                elementId: (this as any).id || 'unknown',
                elementClass: (this as any).className || 'unknown',
                listenerCount: listenersSet.size
              });
            } else {
              listenersSet.add(listener as EventListener);
            }
          } catch (e) {
            // 이벤트 리스너 추적 실패 시 무시
          }
        }
        
        return originalAddEventListener.call(this, type, listener, options);
      };
      
      // 원본 console.log를 사용하여 설정 완료 메시지 출력
      originalConsole.log('✅ Remote logging enabled - Only errors and warnings will be sent to server');
    } catch (error) {
      console.warn('⚠️ Failed to setup remote logging:', error);
    }
  }
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