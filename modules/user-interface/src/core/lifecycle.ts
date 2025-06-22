/**
 * @fileoverview 애플리케이션 생명주기 관리 시스템
 * @description 애플리케이션의 초기화, 실행, 종료 과정을 체계적으로 관리
 * @version 2.0.0
 */

import type { 
  EventData, 
  EventManager 
} from '../types/index.js';

/**
 * 생명주기 단계 열거형
 */
export enum LifecyclePhase {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSING = 'pausing',
  PAUSED = 'paused',
  RESUMING = 'resuming',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  DESTROYING = 'destroying',
  DESTROYED = 'destroyed',
  ERROR = 'error'
}

/**
 * 생명주기 훅 타입 정의
 */
export type LifecycleHook = () => Promise<void> | void;

/**
 * 생명주기 이벤트 데이터
 */
export interface LifecycleEventData extends EventData {
  type: 'lifecycle:phase-change' | 'lifecycle:error' | 'lifecycle:hook-executed';
  timestamp: number;
  source: 'LifecycleManager';
  payload: {
    phase?: LifecyclePhase;
    previousPhase?: LifecyclePhase;
    error?: Error;
    hookName?: string;
    duration?: number;
  };
}

/**
 * 리소스 정리 인터페이스
 */
export interface Disposable {
  dispose(): Promise<void> | void;
}

/**
 * 생명주기 통계 정보
 */
export interface LifecycleMetrics {
  startTime: number;
  currentPhase: LifecyclePhase;
  phaseHistory: Array<{
    phase: LifecyclePhase;
    timestamp: number;
    duration: number;
  }>;
  totalUptime: number;
  hookExecutions: Map<string, {
    count: number;
    totalDuration: number;
    averageDuration: number;
    lastExecution: number;
  }>;
  errors: Array<{
    phase: LifecyclePhase;
    error: Error;
    timestamp: number;
  }>;
}

/**
 * 애플리케이션 생명주기를 관리하는 클래스
 * 
 * @example
 * ```typescript
 * const lifecycle = new LifecycleManager(eventManager);
 * 
 * // 초기화 훅 등록
 * lifecycle.addHook('beforeInit', async () => {
 *   console.log('애플리케이션 초기화 시작');
 * });
 * 
 * // 생명주기 시작
 * await lifecycle.initialize();
 * await lifecycle.start();
 * 
 * // 리소스 등록
 * lifecycle.registerResource(webSocketClient);
 * 
 * // 종료
 * await lifecycle.stop();
 * ```
 */
export class LifecycleManager {
  private currentPhase: LifecyclePhase = LifecyclePhase.UNINITIALIZED;
  private previousPhase: LifecyclePhase | null = null;
  private eventManager: EventManager;
  
  // 생명주기 훅들
  private hooks = new Map<string, Set<LifecycleHook>>();
  
  // 리소스 관리
  private resources = new Set<Disposable>();
  private resourceCleanupOrder: Disposable[] = [];
  
  // 상태 추적
  private metrics: LifecycleMetrics;
  private phaseStartTime: number = 0;
  
  // 에러 처리
  private errorHandlers = new Set<(error: Error, phase: LifecyclePhase) => void>();
  
  // 설정
  private readonly config = {
    maxPhaseTransitionTime: 30000, // 30초
    enableMetrics: true,
    enableHookTimeout: true,
    hookTimeout: 10000 // 10초
  };

  constructor(eventManager: EventManager) {
    this.eventManager = eventManager;
    this.metrics = this.initializeMetrics();
    this.setupDefaultHooks();
    this.bindEvents();
  }

  /**
   * 현재 생명주기 단계를 반환합니다
   */
  getCurrentPhase(): LifecyclePhase {
    return this.currentPhase;
  }

  /**
   * 생명주기가 특정 단계인지 확인합니다
   */
  isPhase(phase: LifecyclePhase): boolean {
    return this.currentPhase === phase;
  }

  /**
   * 생명주기가 실행 중인지 확인합니다
   */
  isRunning(): boolean {
    return this.currentPhase === LifecyclePhase.RUNNING;
  }

  /**
   * 생명주기가 초기화되었는지 확인합니다
   */
  isInitialized(): boolean {
    return this.currentPhase !== LifecyclePhase.UNINITIALIZED && 
           this.currentPhase !== LifecyclePhase.DESTROYED;
  }

  /**
   * 애플리케이션을 초기화합니다
   */
  async initialize(): Promise<void> {
    if (this.currentPhase !== LifecyclePhase.UNINITIALIZED) {
      throw new Error(`Cannot initialize from phase: ${this.currentPhase}`);
    }

    await this.transitionToPhase(LifecyclePhase.INITIALIZING);

    try {
      // 초기화 전 훅 실행
      await this.executeHooks('beforeInit');

      // 초기화 로직
      await this.executeHooks('init');

      // 초기화 후 훅 실행
      await this.executeHooks('afterInit');

      await this.transitionToPhase(LifecyclePhase.INITIALIZED);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.INITIALIZING);
      throw error;
    }
  }

  /**
   * 애플리케이션을 시작합니다
   */
  async start(): Promise<void> {
    if (this.currentPhase !== LifecyclePhase.INITIALIZED) {
      throw new Error(`Cannot start from phase: ${this.currentPhase}`);
    }

    await this.transitionToPhase(LifecyclePhase.STARTING);

    try {
      // 시작 전 훅 실행
      await this.executeHooks('beforeStart');

      // 시작 로직
      await this.executeHooks('start');

      // 시작 후 훅 실행
      await this.executeHooks('afterStart');

      await this.transitionToPhase(LifecyclePhase.RUNNING);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.STARTING);
      throw error;
    }
  }

  /**
   * 애플리케이션을 일시정지합니다
   */
  async pause(): Promise<void> {
    if (this.currentPhase !== LifecyclePhase.RUNNING) {
      throw new Error(`Cannot pause from phase: ${this.currentPhase}`);
    }

    await this.transitionToPhase(LifecyclePhase.PAUSING);

    try {
      await this.executeHooks('beforePause');
      await this.executeHooks('pause');
      await this.executeHooks('afterPause');

      await this.transitionToPhase(LifecyclePhase.PAUSED);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.PAUSING);
      throw error;
    }
  }

  /**
   * 애플리케이션을 재개합니다
   */
  async resume(): Promise<void> {
    if (this.currentPhase !== LifecyclePhase.PAUSED) {
      throw new Error(`Cannot resume from phase: ${this.currentPhase}`);
    }

    await this.transitionToPhase(LifecyclePhase.RESUMING);

    try {
      await this.executeHooks('beforeResume');
      await this.executeHooks('resume');
      await this.executeHooks('afterResume');

      await this.transitionToPhase(LifecyclePhase.RUNNING);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.RESUMING);
      throw error;
    }
  }

  /**
   * 애플리케이션을 중지합니다
   */
  async stop(): Promise<void> {
    if (this.currentPhase === LifecyclePhase.STOPPED || 
        this.currentPhase === LifecyclePhase.DESTROYED) {
      return;
    }

    await this.transitionToPhase(LifecyclePhase.STOPPING);

    try {
      // 중지 전 훅 실행
      await this.executeHooks('beforeStop');

      // 리소스 정리
      await this.cleanupResources();

      // 중지 로직
      await this.executeHooks('stop');

      // 중지 후 훅 실행
      await this.executeHooks('afterStop');

      await this.transitionToPhase(LifecyclePhase.STOPPED);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.STOPPING);
      throw error;
    }
  }

  /**
   * 애플리케이션을 완전히 파괴합니다
   */
  async destroy(): Promise<void> {
    if (this.currentPhase === LifecyclePhase.DESTROYED) {
      return;
    }

    // 먼저 중지
    if (this.currentPhase !== LifecyclePhase.STOPPED) {
      await this.stop();
    }

    await this.transitionToPhase(LifecyclePhase.DESTROYING);

    try {
      // 파괴 전 훅 실행
      await this.executeHooks('beforeDestroy');

      // 모든 리소스 정리
      await this.cleanupAllResources();

      // 이벤트 리스너 정리
      this.unbindEvents();

      // 파괴 로직
      await this.executeHooks('destroy');

      // 파괴 후 훅 실행
      await this.executeHooks('afterDestroy');

      await this.transitionToPhase(LifecyclePhase.DESTROYED);
    } catch (error) {
      await this.handleError(error as Error, LifecyclePhase.DESTROYING);
      throw error;
    }
  }

  /**
   * 생명주기 훅을 등록합니다
   */
  addHook(hookName: string, hook: LifecycleHook): () => void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, new Set());
    }

    const hookSet = this.hooks.get(hookName)!;
    hookSet.add(hook);

    // 제거 함수 반환
    return () => {
      hookSet.delete(hook);
    };
  }

  /**
   * 리소스를 등록합니다 (자동 정리를 위해)
   */
  registerResource(resource: Disposable, _priority: number = 0): void {
    this.resources.add(resource);
    
    // 우선순위에 따라 정리 순서 결정 (높은 우선순위가 먼저 정리됨)
    this.resourceCleanupOrder.push(resource);
    this.resourceCleanupOrder.sort((a, b) => {
      // 우선순위 정보가 있다면 사용, 없으면 기본값 0
      const priorityA = (a as any).priority || 0;
      const priorityB = (b as any).priority || 0;
      return priorityB - priorityA;
    });
  }

  /**
   * 리소스 등록을 해제합니다
   */
  unregisterResource(resource: Disposable): void {
    this.resources.delete(resource);
    const index = this.resourceCleanupOrder.indexOf(resource);
    if (index > -1) {
      this.resourceCleanupOrder.splice(index, 1);
    }
  }

  /**
   * 에러 핸들러를 등록합니다
   */
  addErrorHandler(handler: (error: Error, phase: LifecyclePhase) => void): () => void {
    this.errorHandlers.add(handler);
    
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * 생명주기 통계를 반환합니다
   */
  getMetrics(): LifecycleMetrics {
    const currentTime = Date.now();
    
    return {
      ...this.metrics,
      totalUptime: currentTime - this.metrics.startTime,
      currentPhase: this.currentPhase
    };
  }

  /**
   * 특정 단계까지 대기합니다
   */
  async waitForPhase(targetPhase: LifecyclePhase, timeout?: number): Promise<void> {
    if (this.currentPhase === targetPhase) {
      return;
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const checkPhase = () => {
        if (this.currentPhase === targetPhase) {
          cleanup();
          resolve();
        } else if (this.currentPhase === LifecyclePhase.ERROR) {
          cleanup();
          reject(new Error(`Lifecycle entered error state while waiting for ${targetPhase}`));
        }
      };

      // 이벤트 리스너 등록
      const unsubscribe = this.eventManager.on('lifecycle:phase-change', checkPhase);

      // 타임아웃 설정
      if (timeout) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for phase ${targetPhase}`));
        }, timeout);
      }

      // 즉시 한 번 확인
      checkPhase();
    });
  }

  /**
   * 생명주기 단계를 전환합니다
   */
  private async transitionToPhase(newPhase: LifecyclePhase): Promise<void> {
    const startTime = Date.now();
    this.previousPhase = this.currentPhase;
    this.currentPhase = newPhase;
    
    // 메트릭 업데이트
    if (this.config.enableMetrics) {
      this.updatePhaseMetrics(newPhase, startTime);
    }

    // 이벤트 발생
    this.eventManager.emit('lifecycle:phase-change', {
      type: 'lifecycle:phase-change',
      timestamp: startTime,
      source: 'LifecycleManager',
      payload: {
        phase: newPhase,
        previousPhase: this.previousPhase
      }
    } as LifecycleEventData);

    console.log(`🔄 Lifecycle: ${this.previousPhase} → ${newPhase}`);
  }

  /**
   * 생명주기 훅들을 실행합니다
   */
  private async executeHooks(hookName: string): Promise<void> {
    const hooks = this.hooks.get(hookName);
    if (!hooks || hooks.size === 0) {
      return;
    }

    const startTime = Date.now();
    
    try {
      // 모든 훅을 병렬로 실행
      const hookPromises = Array.from(hooks).map(async (hook) => {
        if (this.config.enableHookTimeout) {
          return this.executeHookWithTimeout(hook, this.config.hookTimeout);
        } else {
          return hook();
        }
      });

      await Promise.all(hookPromises);

      // 메트릭 업데이트
      if (this.config.enableMetrics) {
        this.updateHookMetrics(hookName, Date.now() - startTime);
      }

      // 이벤트 발생
      this.eventManager.emit('lifecycle:hook-executed', {
        type: 'lifecycle:hook-executed',
        timestamp: Date.now(),
        source: 'LifecycleManager',
        payload: {
          hookName,
          duration: Date.now() - startTime
        }
      } as LifecycleEventData);

    } catch (error) {
      console.error(`❌ Error executing hooks for ${hookName}:`, error);
      throw error;
    }
  }

  /**
   * 타임아웃과 함께 훅을 실행합니다
   */
  private async executeHookWithTimeout(hook: LifecycleHook, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Hook execution timeout after ${timeout}ms`));
      }, timeout);

      Promise.resolve(hook()).then(() => {
        clearTimeout(timeoutId);
        resolve();
      }).catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 리소스들을 정리합니다
   */
  private async cleanupResources(): Promise<void> {
    const errors: Error[] = [];

    // 등록된 순서의 역순으로 정리 (LIFO)
    for (const resource of [...this.resourceCleanupOrder].reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        console.error('❌ Error disposing resource:', error);
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Failed to cleanup ${errors.length} resources`);
    }
  }

  /**
   * 모든 리소스를 정리합니다
   */
  private async cleanupAllResources(): Promise<void> {
    await this.cleanupResources();
    this.resources.clear();
    this.resourceCleanupOrder.length = 0;
  }

  /**
   * 에러를 처리합니다
   */
  private async handleError(error: Error, phase: LifecyclePhase): Promise<void> {
    console.error(`❌ Lifecycle error in phase ${phase}:`, error);

    // 메트릭에 에러 기록
    if (this.config.enableMetrics) {
      this.metrics.errors.push({
        phase,
        error,
        timestamp: Date.now()
      });
    }

    // 에러 핸들러들 실행
    this.errorHandlers.forEach(handler => {
      try {
        handler(error, phase);
      } catch (handlerError) {
        console.error('❌ Error in error handler:', handlerError);
      }
    });

    // 에러 이벤트 발생
    this.eventManager.emit('lifecycle:error', {
      type: 'lifecycle:error',
      timestamp: Date.now(),
      source: 'LifecycleManager',
      payload: {
        phase,
        error
      }
    } as LifecycleEventData);

    // 에러 상태로 전환
    await this.transitionToPhase(LifecyclePhase.ERROR);
  }

  /**
   * 기본 훅들을 설정합니다
   */
  private setupDefaultHooks(): void {
    // 기본 초기화 훅
    this.addHook('init', () => {
      console.log('🚀 Application initializing...');
    });

    // 기본 시작 훅
    this.addHook('start', () => {
      console.log('▶️ Application starting...');
    });

    // 기본 중지 훅
    this.addHook('stop', () => {
      console.log('⏹️ Application stopping...');
    });

    // 기본 파괴 훅
    this.addHook('destroy', () => {
      console.log('💥 Application destroying...');
    });
  }

  /**
   * 이벤트를 바인딩합니다
   */
  private bindEvents(): void {
    // 브라우저 종료 시 정리
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.stop().catch(console.error);
      });

      window.addEventListener('unload', () => {
        this.destroy().catch(console.error);
      });
    }

    // 프로세스 종료 시 정리 (Node.js 환경)
    if (typeof process !== 'undefined') {
      process.on('SIGTERM', () => {
        this.stop().then(() => process.exit(0)).catch(() => process.exit(1));
      });

      process.on('SIGINT', () => {
        this.stop().then(() => process.exit(0)).catch(() => process.exit(1));
      });
    }
  }

  /**
   * 이벤트 바인딩을 해제합니다
   */
  private unbindEvents(): void {
    // 브라우저 이벤트 정리는 페이지 언로드 시 자동으로 처리됨
  }

  /**
   * 메트릭을 초기화합니다
   */
  private initializeMetrics(): LifecycleMetrics {
    return {
      startTime: Date.now(),
      currentPhase: LifecyclePhase.UNINITIALIZED,
      phaseHistory: [],
      totalUptime: 0,
      hookExecutions: new Map(),
      errors: []
    };
  }

  /**
   * 단계 메트릭을 업데이트합니다
   */
  private updatePhaseMetrics(phase: LifecyclePhase, timestamp: number): void {
    const duration = this.phaseStartTime ? timestamp - this.phaseStartTime : 0;
    
    this.metrics.phaseHistory.push({
      phase,
      timestamp,
      duration
    });

    this.phaseStartTime = timestamp;
  }

  /**
   * 훅 메트릭을 업데이트합니다
   */
  private updateHookMetrics(hookName: string, duration: number): void {
    const existing = this.metrics.hookExecutions.get(hookName);
    
    if (existing) {
      existing.count++;
      existing.totalDuration += duration;
      existing.averageDuration = existing.totalDuration / existing.count;
      existing.lastExecution = Date.now();
    } else {
      this.metrics.hookExecutions.set(hookName, {
        count: 1,
        totalDuration: duration,
        averageDuration: duration,
        lastExecution: Date.now()
      });
    }
  }
}

/**
 * 전역 생명주기 매니저 인스턴스
 */
let globalLifecycleManager: LifecycleManager | null = null;

/**
 * 전역 생명주기 매니저를 가져오거나 생성합니다
 */
export function getLifecycleManager(eventManager?: EventManager): LifecycleManager {
  if (!globalLifecycleManager && eventManager) {
    globalLifecycleManager = new LifecycleManager(eventManager);
  }
  
  if (!globalLifecycleManager) {
    throw new Error('LifecycleManager not initialized. Please provide EventManager.');
  }
  
  return globalLifecycleManager;
}

/**
 * 생명주기 관리를 위한 유틸리티 함수들
 */
export const LifecycleUtils = {
  /**
   * 리소스를 생명주기에 자동 등록하는 데코레이터
   */
  autoDispose: (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      const result = originalMethod.apply(this, args);
      
      if (result && typeof result.dispose === 'function') {
        const lifecycle = getLifecycleManager();
        lifecycle.registerResource(result);
      }
      
      return result;
    };
    
    return descriptor;
  },

  /**
   * 생명주기 단계를 기다리는 Promise를 생성합니다
   */
  waitForPhase: (phase: LifecyclePhase, timeout?: number): Promise<void> => {
    const lifecycle = getLifecycleManager();
    return lifecycle.waitForPhase(phase, timeout);
  },

  /**
   * 현재 생명주기 단계를 확인합니다
   */
  getCurrentPhase: (): LifecyclePhase => {
    const lifecycle = getLifecycleManager();
    return lifecycle.getCurrentPhase();
  },

  /**
   * 애플리케이션이 실행 중인지 확인합니다
   */
  isRunning: (): boolean => {
    const lifecycle = getLifecycleManager();
    return lifecycle.isRunning();
  }
};

export default LifecycleManager; 