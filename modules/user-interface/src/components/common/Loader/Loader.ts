/**
 * @fileoverview Loader Component - 로딩 상태 표시
 * @description 다양한 타입의 로딩 스피너와 오버레이를 제공하는 로더 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent, type ComponentOptions } from '../../base/component.js';
import type { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';

// =============================================================================
// 🎯 Loader Types & Constants
// =============================================================================

/**
 * 로더 타입
 */
export type LoaderType = 'spinner' | 'dots' | 'pulse' | 'progress' | 'skeleton' | 'bars' | 'ring';

/**
 * 로더 크기
 */
export type LoaderSize = 'small' | 'medium' | 'large';

/**
 * 오버레이 타입
 */
export type OverlayType = 'inline' | 'overlay' | 'full' | 'none';

/**
 * 로더 색상 테마
 */
export type LoaderTheme = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

// =============================================================================
// 🎯 Interfaces
// =============================================================================

/**
 * 로더 컴포넌트 속성
 */
export interface LoaderProps extends ComponentProps {
  /** 로더 타입 */
  type?: LoaderType;
  /** 로더 크기 */
  size?: LoaderSize;
  /** 오버레이 타입 */
  overlay?: OverlayType;
  /** 로딩 메시지 */
  message?: string;
  /** 메시지 표시 여부 */
  showMessage?: boolean;
  /** 색상 테마 */
  theme?: LoaderTheme;
  /** 배경색 (오버레이 모드) */
  backgroundColor?: string;
  /** z-index 값 */
  zIndex?: number;
  /** 타임아웃 (밀리초, 0 = 무제한) */
  timeout?: number;
  /** 진행률 (0-100) */
  progress?: number;
  /** 진행률 표시 여부 */
  showProgress?: boolean;
  /** 타겟 엘리먼트 (오버레이 모드) */
  target?: HTMLElement | string;
}

/**
 * 로더 콜백 함수들
 */
export interface LoaderCallbacks {
  /** 로더 표시 시 콜백 */
  onShow?: () => void;
  /** 로더 숨김 시 콜백 */
  onHide?: () => void;
  /** 타임아웃 발생 시 콜백 */
  onTimeout?: () => void;
  /** 진행률 업데이트 시 콜백 */
  onProgress?: (progress: number) => void;
}

/**
 * 로더 상태
 */
export interface LoaderState {
  isVisible: boolean;
  isDestroyed: boolean;
  progress: number;
  startTime: number | null;
  timeoutId: number | null;
}

// =============================================================================
// 🎯 Loader Component
// =============================================================================

/**
 * 로더 컴포넌트 클래스
 * 다양한 타입의 로딩 표시기를 제공하며 오버레이 모드 지원
 */
export class Loader extends BaseComponent<HTMLElement, LoaderProps> {
  // 상태 관리
  private loaderState: LoaderState = {
    isVisible: false,
    isDestroyed: false,
    progress: 0,
    startTime: null,
    timeoutId: null
  };

  // DOM 요소들
  private contentElement?: HTMLElement;
  private messageElement?: HTMLElement;
  private progressElement?: HTMLElement;
  private progressBar?: HTMLElement;
  private targetElement?: HTMLElement;

  // 콜백 함수들
  private callbacks: LoaderCallbacks;

  /**
   * Loader 생성자
   */
  constructor(
    element: HTMLElement | string,
    props: LoaderProps = {},
    eventManager: EventManager,
    callbacks: LoaderCallbacks = {},
    options: ComponentOptions = {}
  ) {
    const defaultProps: LoaderProps = {
      type: 'spinner',
      size: 'medium',
      overlay: 'inline',
      message: '로딩 중...',
      showMessage: true,
      theme: 'primary',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 1000,
      timeout: 0,
      progress: 0,
      showProgress: false,
      ...props
    };

    super(element, defaultProps, eventManager, {
      autoRender: false,
      ...options
    });

    this.callbacks = callbacks;
    this.loaderState.progress = this.props.progress || 0;

    this.setupTargetElement();
  }

  // =============================================================================
  // 🎯 Public Methods
  // =============================================================================

  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    this.element.innerHTML = '';
    this.element.className = this.getLoaderClasses();
    
    // 오버레이 모드 스타일 설정
    this.applyOverlayStyles();

    // 접근성 속성 설정
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-label', this.props.message || '로딩 중');

    // 로더 콘텐츠 생성
    this.contentElement = this.createLoaderContent();
    this.element.appendChild(this.contentElement);

    // 메시지 생성
    if (this.props.showMessage && this.props.message) {
      this.messageElement = this.createMessageElement();
      this.element.appendChild(this.messageElement);
    }

    // 진행률 바 생성
    if (this.props.showProgress || this.props.type === 'progress') {
      this.progressElement = this.createProgressElement();
      this.element.appendChild(this.progressElement);
    }
  }

  /**
   * 로더 표시
   */
  show(target?: HTMLElement | string): void {
    if (this.loaderState.isVisible) return;

    // 타겟 설정
    if (target) {
      this.setupTargetElement(target);
    }

    // 렌더링
    if (!this.isInitialized) {
      this.render();
    }

    // 표시
    this.element.style.display = '';
    this.element.classList.remove('hidden');
    
    // 상태 업데이트
    this.loaderState.isVisible = true;
    this.loaderState.startTime = Date.now();

    // 타임아웃 설정
    if (this.props.timeout && this.props.timeout > 0) {
      this.loaderState.timeoutId = window.setTimeout(() => {
        this.handleTimeout();
      }, this.props.timeout);
    }

    // 콜백 실행
    this.callbacks.onShow?.();
    this.emit('loader:show');
  }

  /**
   * 로더 숨김
   */
  hide(): void {
    if (!this.loaderState.isVisible) return;

    // 타임아웃 정리
    if (this.loaderState.timeoutId) {
      clearTimeout(this.loaderState.timeoutId);
      this.loaderState.timeoutId = null;
    }

    // 숨김
    this.element.classList.add('hidden');
    setTimeout(() => {
      if (!this.loaderState.isDestroyed) {
        this.element.style.display = 'none';
      }
    }, 300);

    // 상태 업데이트
    this.loaderState.isVisible = false;
    this.loaderState.startTime = null;

    // 콜백 실행
    this.callbacks.onHide?.();
    this.emit('loader:hide');
  }

  /**
   * 진행률 업데이트
   */
  updateProgress(progress: number): void {
    this.loaderState.progress = Math.max(0, Math.min(100, progress));
    
    if (this.progressBar) {
      this.progressBar.style.width = `${this.loaderState.progress}%`;
      this.progressBar.setAttribute('aria-valuenow', this.loaderState.progress.toString());
    }

    this.callbacks.onProgress?.(this.loaderState.progress);
    this.emit('loader:progress', { progress: this.loaderState.progress });
  }

  /**
   * 메시지 업데이트
   */
  updateMessage(message: string): void {
    this.props.message = message;
    
    if (this.messageElement) {
      this.messageElement.textContent = message;
    }

    this.element.setAttribute('aria-label', message);
    this.emit('loader:message-updated', { message });
  }

  /**
   * 로더 타입 변경
   */
  updateType(type: LoaderType): void {
    this.props.type = type;
    this.render();
    this.emit('loader:type-updated', { type });
  }

  /**
   * 현재 로더 상태 조회
   */
  getLoaderState(): LoaderState {
    return { ...this.loaderState };
  }

  /**
   * 진행률 조회
   */
  getProgress(): number {
    return this.loaderState.progress;
  }

  /**
   * 표시 여부 조회
   */
  isVisible(): boolean {
    return this.loaderState.isVisible;
  }

  // =============================================================================
  // 🎯 Protected Methods
  // =============================================================================

  /**
   * 이벤트 바인딩
   */
  public bindEvents(): void {
    // ESC 키로 닫기 (설정에 따라)
    this.addDOMEventListener(document, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.props.overlay !== 'inline') {
        this.hide();
      }
    }) as EventListener);
  }

  /**
   * 컴포넌트 제거
   */
  async destroy(): Promise<void> {
    this.hide();
    this.loaderState.isDestroyed = true;
    
    // 타임아웃 정리
    if (this.loaderState.timeoutId) {
      clearTimeout(this.loaderState.timeoutId);
    }

    await super.destroy();
  }

  // =============================================================================
  // 🎯 Private Methods
  // =============================================================================

  /**
   * 로더 클래스 생성
   */
  private getLoaderClasses(): string {
    const classes = [
      'loader',
      `loader-${this.props.type}`,
      `loader-${this.props.size}`,
      `loader-${this.props.overlay}`,
      `loader-${this.props.theme}`,
      'hidden'
    ];

    return classes.join(' ');
  }

  /**
   * 오버레이 스타일 적용
   */
  private applyOverlayStyles(): void {
    if (this.props.overlay === 'none' || this.props.overlay === 'inline') {
      return;
    }

    Object.assign(this.element.style, {
      position: this.props.overlay === 'full' ? 'fixed' : 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: this.props.backgroundColor,
      zIndex: this.props.zIndex?.toString() || '1000'
    });
  }

  /**
   * 로더 콘텐츠 생성
   */
  private createLoaderContent(): HTMLElement {
    const content = document.createElement('div');
    content.className = 'loader-content';

    switch (this.props.type) {
      case 'spinner':
        content.innerHTML = this.createSpinner();
        break;
      case 'dots':
        content.innerHTML = this.createDots();
        break;
      case 'pulse':
        content.innerHTML = this.createPulse();
        break;
      case 'progress':
        content.innerHTML = this.createProgress();
        break;
      case 'skeleton':
        content.innerHTML = this.createSkeleton();
        break;
      case 'bars':
        content.innerHTML = this.createBars();
        break;
      case 'ring':
        content.innerHTML = this.createRing();
        break;
      default:
        content.innerHTML = this.createSpinner();
    }

    return content;
  }

  /**
   * 스피너 생성
   */
  private createSpinner(): string {
    return `
      <div class="spinner" role="progressbar" aria-label="로딩 중">
        <div class="spinner-border">
          <span class="sr-only">로딩 중...</span>
        </div>
      </div>
    `;
  }

  /**
   * 점 애니메이션 생성
   */
  private createDots(): string {
    return `
      <div class="dots-loader" role="progressbar" aria-label="로딩 중">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
  }

  /**
   * 펄스 애니메이션 생성
   */
  private createPulse(): string {
    return `
      <div class="pulse-loader" role="progressbar" aria-label="로딩 중">
        <div class="pulse-circle"></div>
      </div>
    `;
  }

  /**
   * 진행 바 생성
   */
  private createProgress(): string {
    return `
      <div class="progress-loader">
        <div class="progress-bar" role="progressbar" 
             aria-valuenow="${this.loaderState.progress}" 
             aria-valuemin="0" 
             aria-valuemax="100">
          <div class="progress-fill" style="width: ${this.loaderState.progress}%"></div>
        </div>
      </div>
    `;
  }

  /**
   * 스켈레톤 로더 생성
   */
  private createSkeleton(): string {
    return `
      <div class="skeleton-loader" role="progressbar" aria-label="콘텐츠 로딩 중">
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line skeleton-line-text"></div>
        <div class="skeleton-line skeleton-line-text short"></div>
      </div>
    `;
  }

  /**
   * 바 애니메이션 생성
   */
  private createBars(): string {
    return `
      <div class="bars-loader" role="progressbar" aria-label="로딩 중">
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
      </div>
    `;
  }

  /**
   * 링 애니메이션 생성
   */
  private createRing(): string {
    return `
      <div class="ring-loader" role="progressbar" aria-label="로딩 중">
        <div class="ring"></div>
        <div class="ring"></div>
        <div class="ring"></div>
        <div class="ring"></div>
      </div>
    `;
  }

  /**
   * 메시지 요소 생성
   */
  private createMessageElement(): HTMLElement {
    const message = document.createElement('div');
    message.className = 'loader-message';
    message.textContent = this.props.message || '';
    message.setAttribute('aria-live', 'polite');
    return message;
  }

  /**
   * 진행률 요소 생성
   */
  private createProgressElement(): HTMLElement {
    const progress = document.createElement('div');
    progress.className = 'loader-progress';
    
    progress.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar" role="progressbar" 
             aria-valuenow="${this.loaderState.progress}" 
             aria-valuemin="0" 
             aria-valuemax="100">
          <div class="progress-fill" style="width: ${this.loaderState.progress}%"></div>
        </div>
        <span class="progress-text">${this.loaderState.progress}%</span>
      </div>
    `;

    this.progressBar = progress.querySelector('.progress-fill') as HTMLElement;
    return progress;
  }

  /**
   * 타겟 엘리먼트 설정
   */
  private setupTargetElement(target?: HTMLElement | string): void {
    if (target) {
      this.targetElement = typeof target === 'string' 
        ? document.querySelector(target) as HTMLElement
        : target;
    } else if (this.props.target) {
      this.targetElement = typeof this.props.target === 'string'
        ? document.querySelector(this.props.target) as HTMLElement
        : this.props.target;
    }

    // 오버레이 모드에서 타겟에 추가
    if (this.targetElement && (this.props.overlay === 'overlay' || this.props.overlay === 'full')) {
      this.targetElement.style.position = 'relative';
      this.targetElement.appendChild(this.element);
    }
  }

  /**
   * 타임아웃 처리
   */
  private handleTimeout(): void {
    this.callbacks.onTimeout?.();
    this.emit('loader:timeout');
    this.hide();
  }
}

// =============================================================================
// 🎯 Loader Manager
// =============================================================================

/**
 * 로더 매니저 클래스
 * 여러 로더를 중앙에서 관리
 */
export class LoaderManager {
  private eventManager: EventManager;
  private loaders = new Map<string, Loader>();
  private globalLoader: Loader | undefined;
  private defaultOptions: Partial<LoaderProps>;

  constructor(eventManager: EventManager, defaultOptions: Partial<LoaderProps> = {}) {
    this.eventManager = eventManager;
    this.defaultOptions = {
      type: 'spinner',
      size: 'medium',
      theme: 'primary',
      ...defaultOptions
    };
  }

  /**
   * 로더 생성 및 표시
   */
  show(target: HTMLElement | string | null, options: Partial<LoaderProps> = {}): Loader {
    const id = this.generateId();
    const element = document.createElement('div');
    
    const loader = new Loader(
      element,
      { ...this.defaultOptions, ...options },
      this.eventManager
    );

    this.loaders.set(id, loader);
    loader.show(target || undefined);

    return loader;
  }

  /**
   * 전역 로더 표시
   */
  showGlobal(message = '로딩 중...', options: Partial<LoaderProps> = {}): Loader {
    if (this.globalLoader) {
      this.globalLoader.updateMessage(message);
      return this.globalLoader;
    }

    const element = document.createElement('div');
    this.globalLoader = new Loader(
      element,
      {
        ...this.defaultOptions,
        ...options,
        overlay: 'full',
        message,
        showMessage: true
      },
      this.eventManager,
      {
        onHide: () => {
          this.globalLoader = undefined;
        }
      }
    );

    document.body.appendChild(element);
    this.globalLoader.show();

    return this.globalLoader;
  }

  /**
   * 진행률과 함께 로더 표시
   */
  showProgress(target: HTMLElement | string | null, options: Partial<LoaderProps> = {}): Loader {
    return this.show(target, {
      ...options,
      type: 'progress',
      showProgress: true
    });
  }

  /**
   * 로더 숨김
   */
  hide(loader: Loader): void {
    loader.hide();
    
    // Map에서 제거
    for (const [id, l] of this.loaders.entries()) {
      if (l === loader) {
        this.loaders.delete(id);
        break;
      }
    }
  }

  /**
   * 전역 로더 숨김
   */
  hideGlobal(): void {
    if (this.globalLoader) {
      this.globalLoader.hide();
    }
  }

  /**
   * 모든 로더 숨김
   */
  hideAll(): void {
    this.loaders.forEach(loader => loader.hide());
    this.loaders.clear();
    this.hideGlobal();
  }

  /**
   * Promise와 함께 로더 사용
   */
  async withLoader<T>(
    promise: Promise<T>,
    target: HTMLElement | string | null = null,
    options: Partial<LoaderProps> = {}
  ): Promise<T> {
    const loader = this.show(target, options);
    
    try {
      const result = await promise;
      this.hide(loader);
      return result;
    } catch (error) {
      this.hide(loader);
      throw error;
    }
  }

  /**
   * 진행률과 함께 Promise 처리
   */
  async withProgress<T>(
    promise: Promise<T> & { onProgress?: (callback: (progress: number) => void) => void },
    target: HTMLElement | string | null = null,
    options: Partial<LoaderProps> = {}
  ): Promise<T> {
    const loader = this.showProgress(target, options);
    
    try {
      // 진행률 콜백 설정
      if (typeof promise.onProgress === 'function') {
        promise.onProgress((progress: number) => {
          loader.updateProgress(progress);
        });
      }
      
      const result = await promise;
      loader.updateProgress(100);
      
      // 완료 후 잠시 대기
      setTimeout(() => this.hide(loader), 500);
      
      return result;
    } catch (error) {
      this.hide(loader);
      throw error;
    }
  }

  /**
   * 활성 로더 수 조회
   */
  getActiveCount(): number {
    return this.loaders.size + (this.globalLoader ? 1 : 0);
  }

  /**
   * 모든 로더 제거
   */
  async destroy(): Promise<void> {
    await Promise.all([
      ...Array.from(this.loaders.values()).map(loader => loader.destroy()),
      this.globalLoader?.destroy()
    ]);
    
    this.loaders.clear();
    this.globalLoader = undefined;
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `loader-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// 🎯 Utility Functions
// =============================================================================

/**
 * 간단한 로더 생성
 */
export function createSimpleLoader(message = '로딩 중...'): {
  hide: () => void;
  updateMessage: (message: string) => void;
} {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    "></div>
    <div style="
      color: #666;
      font-size: 14px;
      text-align: center;
    ">${message}</div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(overlay);
  
  return {
    hide: () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    },
    updateMessage: (newMessage: string) => {
      const messageEl = overlay.querySelector('div:last-child');
      if (messageEl) {
        messageEl.textContent = newMessage;
      }
    }
  };
}

/**
 * Promise에 로더 연결
 */
export function withLoader<T>(
  promise: Promise<T>,
  options: {
    target?: HTMLElement | string | null;
    message?: string;
    type?: LoaderType;
    overlay?: OverlayType;
  } = {}
): Promise<T> {
  const {
    target = null,
    message = '로딩 중...',
    type = 'spinner',
    overlay = 'full'
  } = options;
  
  const element = document.createElement('div');
  const eventManager = { 
    emit: () => {}, 
    on: () => {}, 
    off: () => {}, 
    once: () => {} 
  } as unknown as EventManager;
  
  const loader = new Loader(
    element,
    { type, overlay, message, showMessage: true },
    eventManager
  );
  
  if (overlay === 'full') {
    document.body.appendChild(element);
  }
  
  loader.show(target || undefined);
  
  return promise
    .then(result => {
      loader.hide();
      setTimeout(() => loader.destroy(), 500);
      return result;
    })
    .catch(error => {
      loader.hide();
      setTimeout(() => loader.destroy(), 500);
      throw error;
    });
}

// =============================================================================
// 🎯 Exports
// =============================================================================

export default Loader;