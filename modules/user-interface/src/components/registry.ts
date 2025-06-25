/**
 * @fileoverview Component Registry
 * @description 컴포넌트 등록, 생성, 관리를 담당하는 레지스트리 시스템
 * @version 2.0.0
 */

import type { 
  ComponentConstructor,
  ComponentProps,
  EventManager,
  Component
} from '../types/index.js';
import { BaseComponent, ComponentOptions } from './base/component.js';

// Feature Components
import { LogViewer, createLogViewerComponent } from './features/LogViewer/LogViewer.js';
import { LogSearch, createLogSearchComponent } from './features/LogSearch/LogSearch.js';
import { LogDashboard, createLogDashboardComponent } from './features/LogDashboard/LogDashboard.js';
import { LogAnalysis, createLogAnalysisComponent } from './features/LogAnalysis/LogAnalysis.js';

/**
 * 컴포넌트 메타데이터
 */
interface ComponentMetadata {
  /** 컴포넌트 이름 */
  name: string;
  /** 컴포넌트 생성자 */
  constructor: ComponentConstructor;
  /** 컴포넌트 버전 */
  version?: string;
  /** 컴포넌트 설명 */
  description?: string;
  /** 컴포넌트 태그 */
  tags?: string[];
  /** 의존성 */
  dependencies?: string[];
  /** 등록 시간 */
  registeredAt: number;
}

/**
 * 컴포넌트 인스턴스 정보
 */
interface ComponentInstance {
  /** 인스턴스 ID */
  id: string;
  /** 컴포넌트 이름 */
  name: string;
  /** 컴포넌트 인스턴스 */
  instance: BaseComponent;
  /** 생성 시간 */
  createdAt: number;
  /** DOM 엘리먼트 */
  element: HTMLElement;
  /** 부모 컴포넌트 ID */
  parentId: string | undefined;
  /** 자식 컴포넌트 ID 목록 */
  childrenIds: string[];
}

/**
 * 컴포넌트 생성 옵션
 */
interface CreateComponentOptions extends ComponentOptions {
  /** 부모 컴포넌트 ID */
  parentId?: string;
  /** 자동 등록 여부 */
  autoRegister?: boolean;
  /** 컴포넌트 인스턴스 추적 여부 */
  trackInstance?: boolean;
}

/**
 * 레지스트리 통계
 */
interface RegistryStats {
  /** 등록된 컴포넌트 수 */
  registeredComponents: number;
  /** 생성된 인스턴스 수 */
  createdInstances: number;
  /** 활성 인스턴스 수 */
  activeInstances: number;
  /** 제거된 인스턴스 수 */
  destroyedInstances: number;
  /** 메모리 사용량 추정치 */
  estimatedMemoryUsage: number;
}

/**
 * 애플리케이션 전체의 컴포넌트 등록 및 관리를 담당하는 클래스
 * 
 * @example
 * ```typescript
 * // 컴포넌트 등록
 * ComponentRegistry.register('Header', Header, {
 *   version: '1.0.0',
 *   description: '애플리케이션 헤더 컴포넌트'
 * });
 * 
 * // 컴포넌트 생성
 * const header = ComponentRegistry.create('Header', '#header', props, eventManager);
 * 
 * // 인스턴스 조회
 * const headerInstance = ComponentRegistry.getInstance(header.id);
 * ```
 */
export class ComponentRegistry {
  private static components = new Map<string, ComponentMetadata>();
  private static instances = new Map<string, ComponentInstance>();
  private static eventManager: EventManager | null = null;
  private static instanceCounter = 0;
  
  /**
   * 이벤트 매니저 설정
   * 
   * @param eventManager - 이벤트 매니저 인스턴스
   */
  static setEventManager(eventManager: EventManager): void {
    ComponentRegistry.eventManager = eventManager;
  }
  
  /**
   * 컴포넌트를 레지스트리에 등록합니다
   * 
   * @param name - 컴포넌트 이름 (고유해야 함)
   * @param constructor - 컴포넌트 생성자
   * @param metadata - 컴포넌트 메타데이터
   */
  static register<T extends BaseComponent>(
    name: string,
    constructor: ComponentConstructor<T>,
    metadata: Partial<Omit<ComponentMetadata, 'name' | 'constructor' | 'registeredAt'>> = {}
  ): void {
    if (ComponentRegistry.components.has(name)) {
      console.warn(`⚠️ Component '${name}' is already registered. Overwriting...`);
    }
    
    const componentMetadata: ComponentMetadata = {
      name,
      constructor: constructor as ComponentConstructor,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      registeredAt: Date.now()
    };
    
    ComponentRegistry.components.set(name, componentMetadata);
    
    // 등록 이벤트 발생
    ComponentRegistry.eventManager?.emit('component:registered', {
      name,
      metadata: componentMetadata
    });
    
    console.log(`✅ Component '${name}' registered successfully`);
  }
  
  /**
   * 등록된 컴포넌트를 제거합니다
   * 
   * @param name - 제거할 컴포넌트 이름
   * @returns 제거 성공 여부
   */
  static unregister(name: string): boolean {
    if (!ComponentRegistry.components.has(name)) {
      console.warn(`⚠️ Component '${name}' is not registered`);
      return false;
    }
    
    // 해당 컴포넌트의 모든 인스턴스 제거
    const instancesToRemove: string[] = [];
    ComponentRegistry.instances.forEach((instance, id) => {
      if (instance.name === name) {
        instance.instance.destroy();
        instancesToRemove.push(id);
      }
    });
    
    instancesToRemove.forEach(id => {
      ComponentRegistry.instances.delete(id);
    });
    
    ComponentRegistry.components.delete(name);
    
    // 등록 해제 이벤트 발생
    ComponentRegistry.eventManager?.emit('component:unregistered', {
      name,
      destroyedInstances: instancesToRemove.length
    });
    
    console.log(`🗑️ Component '${name}' unregistered successfully`);
    return true;
  }
  
  /**
   * 컴포넌트 인스턴스를 생성합니다
   * 
   * @param name - 생성할 컴포넌트 이름
   * @param element - DOM 엘리먼트 또는 선택자
   * @param props - 컴포넌트 속성
   * @param eventManager - 이벤트 매니저 (선택적)
   * @param options - 생성 옵션
   * @returns 생성된 컴포넌트 인스턴스
   */
  static create<T extends BaseComponent>(
    name: string,
    element: HTMLElement | string,
    props?: ComponentProps,
    eventManager?: EventManager,
    options: CreateComponentOptions = {}
  ): T {
    const metadata = ComponentRegistry.components.get(name);
    if (!metadata) {
      throw new Error(`Component '${name}' is not registered`);
    }
    
    const finalEventManager = eventManager || ComponentRegistry.eventManager;
    if (!finalEventManager) {
      throw new Error('EventManager is required for component creation');
    }
    
    // 의존성 체크
    if (metadata.dependencies?.length) {
      for (const dependency of metadata.dependencies) {
        if (!ComponentRegistry.components.has(dependency)) {
          throw new Error(`Dependency '${dependency}' for component '${name}' is not registered`);
        }
      }
    }
    
    try {
      // 인스턴스 생성
      const instance = new metadata.constructor(
        element,
        props,
        finalEventManager,
        options
      ) as T;
      
      const instanceId = ComponentRegistry.generateInstanceId();
      
      // 인스턴스 정보 저장
      if (options.trackInstance !== false) {
        const instanceInfo: ComponentInstance = {
          id: instanceId,
          name,
          instance,
          createdAt: Date.now(),
          element: instance.element,
          parentId: options.parentId,
          childrenIds: []
        };
        
        ComponentRegistry.instances.set(instanceId, instanceInfo);
        
        // 부모-자식 관계 설정
        if (options.parentId) {
          const parent = ComponentRegistry.instances.get(options.parentId);
          if (parent) {
            parent.childrenIds.push(instanceId);
          }
        }
        
        // 인스턴스에 ID 설정
        (instance as any)._registryId = instanceId;
      }
      
      // 생성 이벤트 발생
      ComponentRegistry.eventManager?.emit('component:created', {
        name,
        instanceId,
        instance
      });
      
      console.log(`🎯 Component '${name}' instance created with ID: ${instanceId}`);
      
      return instance;
      
    } catch (error) {
      console.error(`❌ Failed to create component '${name}':`, error);
      
      // 생성 실패 이벤트 발생
      ComponentRegistry.eventManager?.emit('component:creation-failed', {
        name,
        error: error as Error
      });
      
      throw error;
    }
  }
  
  /**
   * 여러 컴포넌트를 일괄 생성합니다
   * 
   * @param definitions - 컴포넌트 정의 배열
   * @returns 생성된 컴포넌트 인스턴스 맵
   */
  static createBatch(definitions: Array<{
    name: string;
    element: HTMLElement | string;
    props?: ComponentProps;
    options?: CreateComponentOptions;
  }>): Map<string, BaseComponent> {
    const results = new Map<string, BaseComponent>();
    const errors: Array<{ name: string; error: Error }> = [];
    
    for (const def of definitions) {
      try {
        const instance = ComponentRegistry.create(
          def.name,
          def.element,
          def.props,
          ComponentRegistry.eventManager!,
          def.options
        );
        results.set(def.name, instance);
      } catch (error) {
        errors.push({ name: def.name, error: error as Error });
      }
    }
    
    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} components failed to create:`, errors);
    }
    
    return results;
  }
  
  /**
   * 인스턴스 ID로 컴포넌트를 조회합니다
   * 
   * @param instanceId - 인스턴스 ID
   * @returns 컴포넌트 인스턴스 정보
   */
  static getInstance(instanceId: string): ComponentInstance | undefined {
    return ComponentRegistry.instances.get(instanceId);
  }
  
  /**
   * 이름으로 모든 인스턴스를 조회합니다
   * 
   * @param name - 컴포넌트 이름
   * @returns 컴포넌트 인스턴스 배열
   */
  static getInstancesByName(name: string): ComponentInstance[] {
    const instances: ComponentInstance[] = [];
    ComponentRegistry.instances.forEach(instance => {
      if (instance.name === name) {
        instances.push(instance);
      }
    });
    return instances;
  }
  
  /**
   * DOM 엘리먼트로 인스턴스를 조회합니다
   * 
   * @param element - DOM 엘리먼트
   * @returns 컴포넌트 인스턴스 정보
   */
  static getInstanceByElement(element: HTMLElement): ComponentInstance | undefined {
    for (const instance of ComponentRegistry.instances.values()) {
      if (instance.element === element) {
        return instance;
      }
    }
    return undefined;
  }
  
  /**
   * 인스턴스를 제거합니다
   * 
   * @param instanceId - 제거할 인스턴스 ID
   * @returns 제거 성공 여부
   */
  static destroyInstance(instanceId: string): boolean {
    const instance = ComponentRegistry.instances.get(instanceId);
    if (!instance) {
      console.warn(`⚠️ Instance '${instanceId}' not found`);
      return false;
    }
    
    try {
      // 자식 인스턴스들 먼저 제거
      for (const childId of instance.childrenIds) {
        ComponentRegistry.destroyInstance(childId);
      }
      
      // 부모에서 자식 관계 제거
      if (instance.parentId) {
        const parent = ComponentRegistry.instances.get(instance.parentId);
        if (parent) {
          const index = parent.childrenIds.indexOf(instanceId);
          if (index > -1) {
            parent.childrenIds.splice(index, 1);
          }
        }
      }
      
      // 인스턴스 제거
      instance.instance.destroy();
      ComponentRegistry.instances.delete(instanceId);
      
      // 제거 이벤트 발생
      ComponentRegistry.eventManager?.emit('component:destroyed', {
        instanceId,
        name: instance.name
      });
      
      console.log(`🗑️ Component instance '${instanceId}' destroyed`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to destroy instance '${instanceId}':`, error);
      return false;
    }
  }
  
  /**
   * 등록된 모든 컴포넌트 목록을 조회합니다
   * 
   * @returns 컴포넌트 메타데이터 맵
   */
  static getRegisteredComponents(): Map<string, ComponentMetadata> {
    return new Map(ComponentRegistry.components);
  }
  
  /**
   * 컴포넌트가 등록되어 있는지 확인합니다
   * 
   * @param name - 컴포넌트 이름
   * @returns 등록 여부
   */
  static isRegistered(name: string): boolean {
    return ComponentRegistry.components.has(name);
  }
  
  /**
   * 모든 인스턴스 목록을 조회합니다
   * 
   * @returns 인스턴스 정보 맵
   */
  static getAllInstances(): Map<string, ComponentInstance> {
    return new Map(ComponentRegistry.instances);
  }
  
  /**
   * 활성 인스턴스 개수를 조회합니다
   * 
   * @returns 활성 인스턴스 수
   */
  static getActiveInstanceCount(): number {
    let count = 0;
    ComponentRegistry.instances.forEach(instance => {
      if (instance.instance.isActive) {
        count++;
      }
    });
    return count;
  }
  
  /**
   * 레지스트리 통계를 조회합니다
   * 
   * @returns 레지스트리 통계
   */
  static getStats(): RegistryStats {
    const activeInstances = ComponentRegistry.getActiveInstanceCount();
    
    return {
      registeredComponents: ComponentRegistry.components.size,
      createdInstances: ComponentRegistry.instances.size,
      activeInstances,
      destroyedInstances: ComponentRegistry.instanceCounter - ComponentRegistry.instances.size,
      estimatedMemoryUsage: ComponentRegistry.instances.size * 1024 // 대략적인 추정치
    };
  }
  
  /**
   * 레지스트리를 초기화합니다 (모든 컴포넌트와 인스턴스 제거)
   */
  static clear(): void {
    // 모든 인스턴스 제거
    const instanceIds = Array.from(ComponentRegistry.instances.keys());
    instanceIds.forEach(id => ComponentRegistry.destroyInstance(id));
    
    // 등록된 컴포넌트 제거
    ComponentRegistry.components.clear();
    ComponentRegistry.instances.clear();
    ComponentRegistry.instanceCounter = 0;
    
    // 초기화 이벤트 발생
    ComponentRegistry.eventManager?.emit('registry:cleared', {
      timestamp: Date.now()
    });
    
    console.log('🧹 Component registry cleared');
  }
  
  /**
   * 고유한 인스턴스 ID 생성
   * 
   * @returns 고유 인스턴스 ID
   */
  private static generateInstanceId(): string {
    ComponentRegistry.instanceCounter++;
    return `instance-${ComponentRegistry.instanceCounter}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 전역 컴포넌트 레지스트리
 */
export const GLOBAL_COMPONENT_REGISTRY = new Map<string, Component>();

/**
 * 전역 컴포넌트 레지스트리 인스턴스
 * 
 * @example
 * ```typescript
 * import { registry } from '@/components/registry';
 * 
 * registry.register('MyComponent', MyComponent);
 * const instance = registry.create('MyComponent', '#element', props, eventManager);
 * ```
 */
export const registry = ComponentRegistry;

/**
 * 컴포넌트 데코레이터 (실험적)
 * 
 * @param name - 컴포넌트 이름
 * @param metadata - 메타데이터
 * @returns 클래스 데코레이터
 */
export function RegisterComponent(
  name: string, 
  metadata?: Partial<Omit<ComponentMetadata, 'name' | 'constructor' | 'registeredAt'>>
) {
  return function<T extends new (...args: any[]) => BaseComponent>(constructor: T) {
    ComponentRegistry.register(name, constructor as any, metadata);
    return constructor;
  };
}

// =============================================================================
// 🎯 Default Component Registration
// =============================================================================

/**
 * 기본 컴포넌트들을 레지스트리에 자동 등록
 */
export function registerDefaultComponents(): void {
  console.log('🔧 Registering default components...');

  // Feature Components
  ComponentRegistry.register('LogViewer', LogViewer as any, {
    version: '1.0.0',
    description: '로그 엔트리를 표시하고 관리하는 로그 뷰어 컴포넌트',
    tags: ['feature', 'log-system', 'viewer'],
    dependencies: ['LogSystemService']
  });

  ComponentRegistry.register('LogSearch', LogSearch as any, {
    version: '1.0.0',
    description: '로그 검색 및 필터링을 위한 검색 컴포넌트',
    tags: ['feature', 'log-system', 'search'],
    dependencies: ['LogSystemService']
  });

  ComponentRegistry.register('LogDashboard', LogDashboard as any, {
    version: '1.0.0',
    description: '로그 시스템 대시보드 컴포넌트',
    tags: ['feature', 'log-system', 'dashboard'],
    dependencies: ['LogSystemService']
  });

  ComponentRegistry.register('LogAnalysis', LogAnalysis as any, {
    version: '1.0.0',
    description: '로그 분석 컴포넌트 - 패턴 분석, 성능 분석, 트렌드 분석',
    tags: ['feature', 'log-system', 'analysis'],
    dependencies: ['LogSystemService']
  });

  console.log('✅ Default components registered successfully');
}

/**
 * 컴포넌트 팩토리 함수들
 */
export const COMPONENT_FACTORIES = {
  LogViewer: createLogViewerComponent,
  LogSearch: createLogSearchComponent,
  LogDashboard: createLogDashboardComponent,
  LogAnalysis: createLogAnalysisComponent,
} as const;

/**
 * 컴포넌트 생성 헬퍼 함수
 */
export function createComponent<K extends keyof typeof COMPONENT_FACTORIES>(
  name: K,
  element: HTMLElement | string,
  props?: ComponentProps,
  eventManager?: EventManager
): ReturnType<typeof COMPONENT_FACTORIES[K]> {
  const factory = COMPONENT_FACTORIES[name];
  if (!factory) {
    throw new Error(`Component factory for '${name}' not found`);
  }
  
  return factory(element, props as any, eventManager!) as any;
}