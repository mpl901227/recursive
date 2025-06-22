/**
 * @fileoverview Base Component Class - 완전 수정본
 * @description 모든 UI 컴포넌트의 기본 클래스 (중복 방지 강화)
 * @version 2.0.0
 */

import type { 
  Component, 
  ComponentProps, 
  ComponentState, 
  EventHandler 
} from '../../types/index.js';
import { EventManager } from '../../core/events.js';

// 전역 컴포넌트 인스턴스 레지스트리 - 개선된 버전
const GLOBAL_COMPONENT_REGISTRY = new Map<string, BaseComponent>();
const COMPONENT_INITIALIZATION_LOCKS = new Map<string, Promise<void>>();

/**
 * 컴포넌트 옵션
 */
export interface ComponentOptions {
  /** 자동 렌더링 여부 */
  autoRender?: boolean;
  /** 자동 이벤트 바인딩 여부 */
  autoBindEvents?: boolean;
  /** 컴포넌트 태그 */
  tag?: string;
  /** 자식 컴포넌트 자동 관리 */
  autoManageChildren?: boolean;
  /** 강제 재초기화 허용 */
  allowReinit?: boolean;
}

/**
 * 이벤트 리스너 정보
 */
interface EventListenerInfo {
  unsubscribe: () => void;
  event: string;
  handler: EventHandler;
  timestamp: number;
}

/**
 * DOM 이벤트 리스너 정보
 */
interface DOMEventListenerInfo {
  element: Element | Window | Document;
  event: string;
  handler: EventListener;
  options?: AddEventListenerOptions | undefined;
  timestamp: number;
}

/**
 * 모든 UI 컴포넌트의 기본 추상 클래스 - 완전 수정본
 * 
 * @template TProps - 컴포넌트 속성 타입
 * @template TElement - DOM 엘리먼트 타입
 */
export abstract class BaseComponent<
  TElement extends HTMLElement = HTMLElement,
  TProps extends ComponentProps = ComponentProps
> implements Component {
  
  // 식별자
  public readonly id: string;
  public readonly name: string;
  public readonly element: TElement;
  protected props: TProps;
  protected eventManager: EventManager;
  
  // 상태 관리
  public isInitialized: boolean = false;
  public isActive: boolean = false;
  protected state: ComponentState = 'idle';
  
  // 계층 구조
  protected children: BaseComponent[] = [];
  protected childrenMap = new Map<string, BaseComponent>();
  
  // 이벤트 시스템 - 개선된 버전
  private eventListeners = new Map<string, EventListenerInfo>();
  private domEventListeners = new Map<string, DOMEventListenerInfo>();
  
  // 설정
  protected options: ComponentOptions;
  
  // 업데이트 관련
  private updateScheduled: boolean = false;
  
  // 컴포넌트 전역 고유 키
  private globalKey: string;
  
  // 초기화 관련
  private initializationPromise: Promise<void> | null = null;
  
  /**
   * BaseComponent 생성자
   */
  constructor(
    element: TElement | string,
    props: TProps = {} as TProps,
    eventManager: EventManager,
    options: ComponentOptions = {}
  ) {
    // 엘리먼트 해결
    this.element = this.resolveElement(element);
    
    // 프로퍼티 초기화
    this.props = props;
    this.eventManager = eventManager;
    this.options = {
      autoRender: true,
      autoBindEvents: true,
      autoManageChildren: true,
      allowReinit: false,
      ...options
    };
    
    // 고유 ID 생성
    this.id = this.generateId();
    this.name = this.constructor.name;
    
    // 전역 고유 키 생성 (더 견고하게)
    this.globalKey = this.generateGlobalKey();
    
    // 엘리먼트 유효성 검사
    if (!this.element) {
      throw new Error(`Element not found: ${element}`);
    }
    
    // 컴포넌트 ID 설정 및 마킹
    if (!this.element.id) {
      this.element.id = this.id;
    }
    this.element.setAttribute('data-component-type', this.name);
    this.element.setAttribute('data-component-id', this.id);
    
    // 컴포넌트 클래스 추가
    this.element.classList.add('recursive-component', this.name.toLowerCase());
    
    // 중복 체크 및 등록
    this.handleComponentRegistration();
    
    // 자동 초기화 (디버깅을 위해 임시 비활성화)
    if (this.options.autoRender) {
      console.log(`🚫 ${this.name}: 자동 초기화가 요청되었지만 수동 초기화를 위해 건너뜁니다.`);
      // 다음 틱에 초기화 (생성자에서 즉시 실행 방지)
      // Promise.resolve().then(() => {
      //   if (!this.isInitialized) {
      //     this.initialize().catch(error => {
      //       this.handleError(error, 'auto-initialize');
      //     });
      //   }
      // });
    }
  }
  
  /**
   * 전역 키 생성 (더 고유하게)
   */
  private generateGlobalKey(): string {
    const elementId = this.element.id || 'no-id';
    const elementClass = this.element.className || 'no-class';
    const elementTag = this.element.tagName.toLowerCase();
    
    // 요소의 위치를 포함한 더 고유한 키 생성
    const elementPath = this.getElementPath(this.element);
    
    return `${this.constructor.name}_${elementTag}_${elementId}_${elementPath}`;
  }
  
  /**
   * 요소의 DOM 경로 생성
   */
  private getElementPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      }
      if (current.className) {
        selector += `.${current.className.split(' ').join('.')}`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.slice(-3).join('_'); // 마지막 3개 레벨만 사용
  }
  
  /**
   * 컴포넌트 등록 처리 (중복 방지 강화)
   */
  private handleComponentRegistration(): void {
    const existing = GLOBAL_COMPONENT_REGISTRY.get(this.globalKey);
    
    if (existing && existing !== this) {
      if (!this.options.allowReinit) {
        console.error(`❌ 중복 컴포넌트 감지: ${this.globalKey}`);
        console.error('기존 인스턴스:', existing);
        console.error('새 인스턴스:', this);
        
        // 기존 인스턴스 강제 정리
        try {
          existing.destroy();
          GLOBAL_COMPONENT_REGISTRY.delete(this.globalKey);
          console.warn(`🔄 기존 컴포넌트 인스턴스를 강제로 정리했습니다: ${this.globalKey}`);
        } catch (error) {
          console.error('❌ 기존 인스턴스 정리 실패:', error);
        }
      } else {
        console.warn(`⚠️ 컴포넌트 재초기화가 허용됨: ${this.globalKey}`);
      }
    }
    
    // 새 인스턴스 등록
    GLOBAL_COMPONENT_REGISTRY.set(this.globalKey, this);
    console.log(`📝 ${this.name} 컴포넌트가 전역 레지스트리에 등록되었습니다. (총 ${GLOBAL_COMPONENT_REGISTRY.size}개)`);
  }
  
  /**
   * 컴포넌트 초기화 - 강화된 중복 방지
   */
  async initialize(): Promise<void> {
    // 이미 초기화된 경우
    if (this.isInitialized) {
      console.warn(`⚠️ 컴포넌트 ${this.name}(${this.globalKey})이 이미 초기화되었습니다.`);
      return;
    }
    
    // 초기화 진행 중인 경우 기존 Promise 반환
    if (this.initializationPromise) {
      console.log(`⏳ 컴포넌트 ${this.name}(${this.globalKey}) 초기화 대기 중...`);
      return this.initializationPromise;
    }
    
    // 전역 초기화 락 확인
    const globalLock = COMPONENT_INITIALIZATION_LOCKS.get(this.globalKey);
    if (globalLock) {
      console.log(`🔒 전역 초기화 락 대기 중: ${this.globalKey}`);
      return globalLock;
    }
    
    // 초기화 Promise 생성 및 락 설정
    this.initializationPromise = this.performInitialization();
    COMPONENT_INITIALIZATION_LOCKS.set(this.globalKey, this.initializationPromise);
    
    try {
      await this.initializationPromise;
    } catch (error) {
      console.error(`❌ ${this.name}(${this.globalKey}) 초기화 실패:`, error);
      throw error;
    } finally {
      // 정리
      this.initializationPromise = null;
      COMPONENT_INITIALIZATION_LOCKS.delete(this.globalKey);
    }
  }
  
  /**
   * 실제 초기화 수행
   */
  private async performInitialization(): Promise<void> {
    console.log(`🚀 ${this.name}(${this.globalKey}) 컴포넌트 초기화 시작...`);
    
    try {
      this.state = 'loading';
      this.element.setAttribute('data-component-state', 'loading');
      
      // 기존 이벤트 리스너 정리 (중복 방지)
      this.unbindEvents();
      
      // 생명주기: beforeMount
      await this.beforeMount?.();
      
      // 렌더링
      this.render();
      
      // 이벤트 바인딩
      if (this.options.autoBindEvents) {
        this.bindEvents();
      }
      
      // 상태 업데이트
      this.isInitialized = true;
      this.isActive = true;
      this.state = 'ready';
      this.element.setAttribute('data-component-state', 'ready');
      this.element.setAttribute('data-component-initialized', 'true');
      
      // 생명주기: afterMount
      await this.afterMount?.();
      
      // 초기화 이벤트 발생
      this.emit('component:initialized', { component: this });
      
      console.log(`✅ ${this.name}(${this.globalKey}) 컴포넌트 초기화 완료`);
      
    } catch (error) {
      console.error(`❌ ${this.name}(${this.globalKey}) 컴포넌트 초기화 실패:`, error);
      this.state = 'error';
      this.element.setAttribute('data-component-state', 'error');
      this.handleError(error as Error, 'initialize');
      throw error;
    }
  }
  
  // =============================================================================
  // 추상 메서드 (자식 클래스에서 구현 필수)
  // =============================================================================
  
  /**
   * 컴포넌트 렌더링 (자식 클래스에서 구현)
   */
  abstract render(): void;
  
  /**
   * 컴포넌트 제거 (자식 클래스에서 확장 가능)
   */
  async destroy(): Promise<void> {
    await this.performDestroy();
  }
  
  // =============================================================================
  // 생명주기 메서드 (자식 클래스에서 선택적 구현)
  // =============================================================================
  
  protected beforeMount?(): void | Promise<void>;
  protected afterMount?(): void | Promise<void>;
  protected beforeUpdate?(prevProps: TProps): void | Promise<void>;
  protected afterUpdate?(prevProps: TProps): void | Promise<void>;
  protected beforeDestroy?(): void | Promise<void>;
  protected afterDestroy?(): void | Promise<void>;
  
  // =============================================================================
  // 이벤트 시스템 - 완전 개선
  // =============================================================================
  
  /**
   * 이벤트 바인딩 (자식 클래스에서 구현)
   */
  bindEvents(): void {
    // 기본 구현 - 자식 클래스에서 오버라이드
  }
  
  /**
   * 이벤트 언바인딩
   */
  unbindEvents(): void {
    // 글로벌 이벤트 리스너 해제
    this.eventListeners.forEach((listenerInfo, key) => {
      try {
        listenerInfo.unsubscribe();
      } catch (error) {
        console.warn(`⚠️ 이벤트 리스너 해제 실패: ${key}`, error);
      }
    });
    this.eventListeners.clear();
    
    // DOM 이벤트 리스너 해제
    this.domEventListeners.forEach((listenerInfo, key) => {
      try {
        listenerInfo.element.removeEventListener(listenerInfo.event, listenerInfo.handler, listenerInfo.options);
      } catch (error) {
        console.warn(`⚠️ DOM 이벤트 리스너 해제 실패: ${key}`, error);
      }
    });
    this.domEventListeners.clear();
    
    console.log(`🔓 ${this.name}: 모든 이벤트 리스너 해제 완료`);
  }
  
  /**
   * 이벤트 리스너 등록 - 완전한 중복 방지
   */
  public on<T = any>(event: string, handler: EventHandler<T>): () => void {
    // 고유 키 생성 (핸들러 함수 기반 + 컴포넌트 ID)
    const handlerSignature = handler.toString().slice(0, 100); // 처음 100자만 사용
    const handlerKey = `${event}_${this.id}_${this.hashCode(handlerSignature)}`;
    
    // 이미 등록된 동일한 리스너가 있는지 확인
    if (this.eventListeners.has(handlerKey)) {
      console.warn(`⚠️ ${this.name}: 동일한 이벤트 리스너가 이미 등록됨 - ${event} (중복 등록 차단)`);
      return this.eventListeners.get(handlerKey)!.unsubscribe;
    }
    
    // 새 리스너 등록 (중복이 아닌 경우에만)
    const unsubscribe = this.eventManager.on(event, handler);
    const listenerInfo: EventListenerInfo = {
      unsubscribe,
      event,
      handler: handler as EventHandler,
      timestamp: Date.now()
    };
    
    this.eventListeners.set(handlerKey, listenerInfo);
    
    // 같은 이벤트에 대한 기존 리스너 수 확인 (디버깅용)
    const existingCount = Array.from(this.eventListeners.keys())
      .filter(key => key.startsWith(`${event}_`)).length;
    
    console.log(`🔗 ${this.name}: 이벤트 리스너 등록 - '${event}' (컴포넌트 내: ${this.eventListeners.size}개, 이 이벤트: ${existingCount}개)`);
    
    if (existingCount > 3) {
      console.warn(`⚠️ ${this.name}: 이벤트 '${event}'에 대한 리스너가 ${existingCount}개나 등록되어 있습니다. 중복 등록을 확인하세요.`);
    }
    
    return () => {
      try {
        unsubscribe();
        this.eventListeners.delete(handlerKey);
        console.log(`🔓 ${this.name}: 이벤트 리스너 해제 - '${event}' (남은: ${this.eventListeners.size}개)`);
      } catch (error) {
        console.warn(`⚠️ 이벤트 리스너 해제 실패: ${handlerKey}`, error);
      }
    };
  }
  
  /**
   * 문자열 해시 생성
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    return Math.abs(hash);
  }
  
  /**
   * 한 번만 실행되는 이벤트 리스너 등록
   */
  protected once<T = any>(event: string, handler: EventHandler<T>): void {
    this.eventManager.once(event, handler);
  }
  
  /**
   * 이벤트 발생
   */
  protected emit<T = any>(event: string, data?: T): boolean {
    return this.eventManager.emit(event, data);
  }
  
  /**
   * 전역 이벤트 리스너 등록 (EventManager를 통한)
   */
  protected addEventListener<T = any>(event: string, handler: EventHandler<T>): () => void {
    return this.on(event, handler);
  }

  /**
   * DOM 이벤트 리스너 등록 - 완전한 중복 방지
   */
  protected addDOMEventListener(
    element: Element | Window | Document,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    // 요소 식별자 생성
    const elementId = this.getElementIdentifier(element);
    const handlerSignature = handler.toString().slice(0, 100);
    const listenerKey = `${elementId}_${event}_${this.id}_${this.hashCode(handlerSignature)}`;
    
    // 중복 등록 방지
    if (this.domEventListeners.has(listenerKey)) {
      console.warn(`⚠️ ${this.name}: DOM 이벤트 리스너가 이미 등록됨 - ${elementId}.${event} (중복 등록 차단)`);
      return;
    }
    
    // 이벤트 리스너 등록 (중복이 아닌 경우에만)
    try {
      element.addEventListener(event, handler, options);
      
      const listenerInfo: DOMEventListenerInfo = {
        element: element as Element,
        event,
        handler,
        options: options ?? undefined,
        timestamp: Date.now()
      };
      
      this.domEventListeners.set(listenerKey, listenerInfo);
      
      // 같은 요소의 같은 이벤트에 대한 기존 리스너 수 확인
      const existingCount = Array.from(this.domEventListeners.keys())
        .filter(key => key.startsWith(`${elementId}_${event}_`)).length;
      
      console.log(`🔗 ${this.name}: DOM 이벤트 리스너 등록 - ${elementId}.${event} (컴포넌트 내: ${this.domEventListeners.size}개, 이 요소: ${existingCount}개)`);
      
      if (existingCount > 2) {
        console.warn(`⚠️ ${this.name}: DOM 이벤트 '${event}'에 대한 리스너가 ${existingCount}개나 등록되어 있습니다. 중복 등록을 확인하세요.`);
      }
      
    } catch (error) {
      console.error(`❌ DOM 이벤트 리스너 등록 실패: ${listenerKey}`, error);
    }
  }
  
  /**
   * 요소 식별자 생성 - 개선된 버전
   */
  private getElementIdentifier(element: Element | Window | Document): string {
    if (element === window) return 'Window';
    if (element === document) return 'Document';
    
    const el = element as Element;
    
    // 더 정확한 식별자 생성
    let identifier = el.tagName;
    
    // ID가 있으면 추가
    if (el.id) {
      identifier += `#${el.id}`;
    }
    
    // 클래스가 있으면 추가 (모든 클래스 포함)
    if (el.className) {
      const classes = el.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        identifier += `.${classes.join('.')}`;
      }
    }
    
    // 요소의 고유성을 높이기 위해 DOM path와 timestamp 추가
    const path = this.getElementPath(el);
    const timestamp = Date.now();
    const elementHash = this.hashCode(path + timestamp);
    
    return `${identifier}_${elementHash}`;
  }

  /**
   * 컴포넌트 로거
   */
  protected get logger() {
    return {
      debug: (message: string, ...args: any[]) => console.debug(`[${this.name}] ${message}`, ...args),
      info: (message: string, ...args: any[]) => console.info(`[${this.name}] ${message}`, ...args),
      warn: (message: string, ...args: any[]) => console.warn(`[${this.name}] ${message}`, ...args),
      error: (message: string, ...args: any[]) => console.error(`[${this.name}] ${message}`, ...args)
    };
  }
  
  // =============================================================================
  // 자식 컴포넌트 관리
  // =============================================================================
  
  protected addChild(child: BaseComponent, key?: string): void {
    this.children.push(child);
    
    if (key) {
      this.childrenMap.set(key, child);
    }
    
    if (!child.isInitialized && this.options.autoManageChildren) {
      child.initialize().catch(error => {
        console.error(`❌ 자식 컴포넌트 초기화 실패: ${child.name}`, error);
      });
    }
  }
  
  protected removeChild(child: BaseComponent | string): boolean {
    if (typeof child === 'string') {
      const component = this.childrenMap.get(child);
      if (component) {
        this.childrenMap.delete(child);
        const index = this.children.indexOf(component);
        if (index > -1) {
          this.children.splice(index, 1);
          if (this.options.autoManageChildren) {
            component.destroy().catch(error => {
              console.error(`❌ 자식 컴포넌트 제거 실패: ${component.name}`, error);
            });
          }
          return true;
        }
      }
      return false;
    } else {
      const index = this.children.indexOf(child);
      if (index > -1) {
        this.children.splice(index, 1);
        
        for (const [key, component] of this.childrenMap) {
          if (component === child) {
            this.childrenMap.delete(key);
            break;
          }
        }
        
        if (this.options.autoManageChildren) {
          child.destroy().catch(error => {
            console.error(`❌ 자식 컴포넌트 제거 실패: ${child.name}`, error);
          });
        }
        return true;
      }
      return false;
    }
  }
  
  protected getChild<T extends BaseComponent = BaseComponent>(key: string): T | undefined {
    return this.childrenMap.get(key) as T;
  }
  
  protected getChildren(): BaseComponent[] {
    return [...this.children];
  }
  
  // =============================================================================
  // Props 관리
  // =============================================================================
  
  async updateProps(newProps: Partial<TProps>, forceUpdate: boolean = false): Promise<void> {
    const prevProps = { ...this.props };
    const hasChanges = this.hasPropsChanged(prevProps, newProps);
    
    if (!hasChanges && !forceUpdate) {
      return;
    }
    
    try {
      await this.beforeUpdate?.(prevProps);
      
      this.props = { ...this.props, ...newProps };
      
      if (!this.updateScheduled) {
        this.scheduleUpdate();
      }
      
      await this.afterUpdate?.(prevProps);
      
      this.emit('component:updated', { 
        component: this, 
        prevProps, 
        newProps: this.props 
      });
      
    } catch (error) {
      this.handleError(error as Error, 'updateProps');
      throw error;
    }
  }
  
  private hasPropsChanged(prevProps: TProps, newProps: Partial<TProps>): boolean {
    for (const key in newProps) {
      if (prevProps[key] !== newProps[key]) {
        return true;
      }
    }
    return false;
  }
  
  private scheduleUpdate(): void {
    if (this.updateScheduled) return;
    
    this.updateScheduled = true;
    
    Promise.resolve().then(() => {
      if (this.isInitialized && !this.isDestroyed()) {
        this.render();
      }
      this.updateScheduled = false;
    });
  }
  
  // =============================================================================
  // 상태 관리
  // =============================================================================
  
  getState(): ComponentState {
    return this.state;
  }
  
  activate(): void {
    if (!this.isActive) {
      this.isActive = true;
      this.element.classList.remove('inactive');
      this.element.classList.add('active');
      this.element.setAttribute('data-component-active', 'true');
      this.emit('component:activated', { component: this });
    }
  }
  
  deactivate(): void {
    if (this.isActive) {
      this.isActive = false;
      this.element.classList.remove('active');
      this.element.classList.add('inactive');
      this.element.setAttribute('data-component-active', 'false');
      this.emit('component:deactivated', { component: this });
    }
  }
  
  isDestroyed(): boolean {
    return this.state === 'destroyed';
  }
  
  // =============================================================================
  // 유틸리티 메서드
  // =============================================================================
  
  private resolveElement(element: TElement | string): TElement {
    if (typeof element === 'string') {
      const resolved = document.querySelector(element) as TElement;
      if (!resolved) {
        throw new Error(`Element not found with selector: ${element}`);
      }
      return resolved;
    }
    return element;
  }
  
  private generateId(): string {
    return `component-${this.constructor.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  protected handleError(error: Error, context: string): void {
    console.error(`❌ Error in ${this.name}#${context}:`, error);
    
    this.emit('component:error', {
      component: this,
      error,
      context
    });
  }
  
  /**
   * 강화된 destroy 구현
   */
  protected async performDestroy(): Promise<void> {
    if (this.isDestroyed()) {
      console.warn(`⚠️ ${this.name}(${this.globalKey}) 컴포넌트가 이미 제거되었습니다.`);
      return;
    }

    console.log(`🗑️ ${this.name}(${this.globalKey}) 컴포넌트 제거 시작...`);

    try {
      this.state = 'destroyed';
      this.element.setAttribute('data-component-state', 'destroyed');
      
      await this.beforeDestroy?.();

      // 이벤트 언바인딩
      this.unbindEvents();

      // 자식 컴포넌트들 제거
      if (this.options.autoManageChildren) {
        const destroyPromises = this.children.map(child => 
          child.destroy().catch(error => {
            console.error(`❌ 자식 컴포넌트 제거 실패: ${child.name}`, error);
          })
        );
        await Promise.all(destroyPromises);
      }
      this.children.length = 0;
      this.childrenMap.clear();

      // 상태 업데이트
      this.isActive = false;
      this.isInitialized = false;

      // DOM 정리
      this.element.removeAttribute('data-component-initialized');
      this.element.removeAttribute('data-component-active');
      this.element.removeAttribute('data-component-type');
      this.element.removeAttribute('data-component-id');
      this.element.classList.remove('recursive-component', this.name.toLowerCase());

      // 전역 레지스트리에서 제거
      GLOBAL_COMPONENT_REGISTRY.delete(this.globalKey);
      
      console.log(`🗑️ ${this.name} 컴포넌트가 전역 레지스트리에서 제거되었습니다. (남은: ${GLOBAL_COMPONENT_REGISTRY.size}개)`);

      await this.afterDestroy?.();

      // 제거 이벤트 발생
      this.emit('component:destroyed', { component: this });

      console.log(`✅ ${this.name}(${this.globalKey}) 컴포넌트 제거 완료`);

    } catch (error) {
      console.error(`❌ ${this.name}(${this.globalKey}) 컴포넌트 제거 실패:`, error);
      this.handleError(error as Error, 'destroy');
      throw error;
    }
  }
}

/**
 * 컴포넌트 팩토리 함수
 */
export function createComponent<T extends BaseComponent>(
  constructor: new (...args: any[]) => T,
  element: HTMLElement | string,
  props?: any,
  eventManager?: EventManager,
  options?: ComponentOptions
): T {
  if (!eventManager) {
    throw new Error('EventManager is required for component creation');
  }
  
  return new constructor(element, props, eventManager, options);
}

/**
 * 전역 레지스트리 정리 함수 (디버깅/테스트용)
 */
export function clearGlobalComponentRegistry(): void {
  console.log('🧹 전역 컴포넌트 레지스트리 정리...');
  
  // 모든 컴포넌트 destroy
  const destroyPromises = Array.from(GLOBAL_COMPONENT_REGISTRY.values()).map(component =>
    component.destroy().catch(error => {
      console.error(`❌ 컴포넌트 정리 실패: ${component.name}`, error);
    })
  );
  
  Promise.all(destroyPromises).then(() => {
    GLOBAL_COMPONENT_REGISTRY.clear();
    COMPONENT_INITIALIZATION_LOCKS.clear();
    console.log('✅ 전역 컴포넌트 레지스트리 정리 완료');
  });
}

/**
 * 전역 레지스트리 상태 조회 (디버깅용)
 */
export function getGlobalComponentRegistryState(): {
  components: string[];
  locks: string[];
  total: number;
} {
  return {
    components: Array.from(GLOBAL_COMPONENT_REGISTRY.keys()),
    locks: Array.from(COMPONENT_INITIALIZATION_LOCKS.keys()),
    total: GLOBAL_COMPONENT_REGISTRY.size
  };
}

export type ComponentMixin = (target: typeof BaseComponent) => void;

export function applyMixins(target: typeof BaseComponent, ...mixins: ComponentMixin[]): void {
  mixins.forEach(mixin => mixin(target));
}