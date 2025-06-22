/**
 * @fileoverview Toast Component - 사용자 알림 메시지 표시
 * @description 다양한 타입의 알림 메시지를 표시하는 토스트 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent, type ComponentOptions } from '../../base/component.js';
import type { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';

// =============================================================================
// 🎯 Toast Types & Constants
// =============================================================================

/**
 * 토스트 타입
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'loading';

/**
 * 토스트 위치
 */
export type ToastPosition = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * 토스트 애니메이션
 */
export type ToastAnimation = 'fade' | 'slide' | 'bounce' | 'flip';

/**
 * 토스트 크기
 */
export type ToastSize = 'small' | 'medium' | 'large';

// =============================================================================
// 🎯 Toast Interfaces
// =============================================================================

/**
 * 토스트 컴포넌트 속성
 */
export interface ToastProps extends ComponentProps {
  /** 토스트 메시지 */
  message: string;
  /** 토스트 제목 */
  title?: string;
  /** 토스트 타입 */
  type?: ToastType;
  /** 표시 지속 시간 (ms) */
  duration?: number;
  /** 자동 닫기 */
  autoClose?: boolean;
  /** 닫기 버튼 표시 */
  closable?: boolean;
  /** 마우스 호버 시 일시정지 */
  pauseOnHover?: boolean;
  /** 진행 바 표시 */
  showProgress?: boolean;
  /** 사운드 재생 */
  enableSound?: boolean;
  /** 지속 표시 (autoClose 무시) */
  persistent?: boolean;
  /** 최대 너비 */
  maxWidth?: number;
  /** 위치 */
  position?: ToastPosition;
  /** 애니메이션 */
  animation?: ToastAnimation;
  /** 크기 */
  size?: ToastSize;
  /** 아이콘 표시 */
  showIcon?: boolean;
  /** 커스텀 아이콘 */
  customIcon?: string;
  /** 액션 버튼들 */
  actions?: ToastAction[];
}

/**
 * 토스트 액션 버튼
 */
export interface ToastAction {
  /** 라벨 */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 스타일 */
  style?: 'primary' | 'secondary' | 'danger';
}

/**
 * 토스트 콜백 함수들
 */
export interface ToastCallbacks {
  /** 표시 시 */
  onShow?: () => void;
  /** 숨김 시 */
  onHide?: () => void;
  /** 클릭 시 */
  onClick?: () => void;
  /** 진행 완료 시 */
  onProgressComplete?: () => void;
}

// =============================================================================
// 🎯 Toast Component
// =============================================================================

/**
 * Toast 컴포넌트 클래스
 * 사용자에게 간단한 알림 메시지를 표시하는 컴포넌트
 * 
 * @example
 * ```typescript
 * const toast = new Toast(container, {
 *   message: 'Hello World!',
 *   type: 'success',
 *   duration: 3000
 * }, eventManager);
 * toast.show();
 * ```
 */
export class Toast extends BaseComponent<HTMLElement, ToastProps> {
  
  // 상태 관리
  public isVisible: boolean = false;
  private isPaused: boolean = false;
  private remainingTime: number;
  
  // DOM 요소들
  private progressBar: HTMLElement | null = null;
  private closeButton: HTMLElement | null = null;
  private iconElement: HTMLElement | null = null;
  private titleElement: HTMLElement | null = null;
  private messageElement: HTMLElement | null = null;
  private actionsContainer: HTMLElement | null = null;
  
  // 타이머 관리
  private startTime: number | null = null;
  private animationFrame: number | null = null;
  
  // 콜백 함수들
  private callbacks: ToastCallbacks;
  
  /**
   * 기본 아이콘 맵
   */
  private static readonly DEFAULT_ICONS: Record<ToastType, string> = {
    info: '🔵',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    loading: '⏳'
  };
  
  /**
   * Toast 생성자
   */
  constructor(
    element: HTMLElement | string,
    props: ToastProps,
    eventManager: EventManager,
    options: ComponentOptions = {},
    callbacks: ToastCallbacks = {}
  ) {
    // 기본 props 설정
    const defaultProps: Partial<ToastProps> = {
      type: 'info',
      duration: 5000,
      autoClose: true,
      closable: true,
      pauseOnHover: true,
      showProgress: true,
      enableSound: false,
      persistent: false,
      maxWidth: 400,
      position: 'top-right',
      animation: 'slide',
      size: 'medium',
      showIcon: true,
      actions: []
    };
    
    super(element, { ...defaultProps, ...props }, eventManager, {
      autoRender: false, // 수동 렌더링
      ...options
    });
    
    this.callbacks = callbacks;
    this.remainingTime = this.props.duration || 5000;
    
    // 컴포넌트 클래스 추가
    this.element.classList.add('toast-component');
  }
  
  // =============================================================================
  // 🎯 Public Getters (props 접근을 위한)
  // =============================================================================
  
  /**
   * 토스트 타입 조회
   */
  get toastType(): ToastType {
    return this.props.type!;
  }
  
  /**
   * 토스트 위치 조회
   */
  get toastPosition(): ToastPosition {
    return this.props.position!;
  }
  
  /**
   * 토스트 메시지 조회
   */
  get toastMessage(): string {
    return this.props.message;
  }
  
  // =============================================================================
  // 🎯 Lifecycle Methods
  // =============================================================================
  
  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    // 기본 클래스 설정
    this.element.className = [
      'toast',
      `toast-${this.props.type}`,
      `toast-${this.props.animation}`,
      `toast-${this.props.size}`,
      this.props.className || ''
    ].filter(Boolean).join(' ');
    
    // 스타일 설정
    if (this.props.maxWidth) {
      this.element.style.maxWidth = `${this.props.maxWidth}px`;
    }
    
    // 접근성 속성
    this.element.setAttribute('role', 'alert');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');
    
    // HTML 구조 생성
    this.element.innerHTML = this.createToastHTML();
    
    // DOM 요소 참조 저장
    this.cacheElements();
    
    // 이벤트 리스너 바인딩
    this.bindEvents();
  }
  
  /**
   * 이벤트 바인딩 (public으로 변경)
   */
  public bindEvents(): void {
    // 마우스 이벤트 (일시정지/재개)
    if (this.props.pauseOnHover) {
      this.addDOMEventListener(this.element, 'mouseenter', this.handleMouseEnter.bind(this));
      this.addDOMEventListener(this.element, 'mouseleave', this.handleMouseLeave.bind(this));
    }
    
    // 클릭 이벤트
    this.addDOMEventListener(this.element, 'click', this.handleClick.bind(this));
    
    // 닫기 버튼
    if (this.closeButton) {
      this.addDOMEventListener(this.closeButton, 'click', this.handleCloseClick.bind(this));
    }
    
    // 액션 버튼들
    if (this.actionsContainer) {
      this.actionsContainer.querySelectorAll('[data-action]').forEach((button, index) => {
        this.addDOMEventListener(button, 'click', () => {
          const action = this.props.actions?.[index];
          if (action) {
            action.onClick();
          }
        });
      });
    }
    
    // 키보드 이벤트 (ESC로 닫기)
    if (this.props.closable) {
      this.addDOMEventListener(document, 'keydown', this.handleKeyDown.bind(this) as EventListener);
    }
  }
  
  /**
   * 컴포넌트 제거
   */
  async destroy(): Promise<void> {
    this.hide();
    await super.destroy();
  }
  
  // =============================================================================
  // 🎯 Public Methods
  // =============================================================================
  
  /**
   * 토스트 표시
   */
  show(): this {
    if (this.isVisible) {
      this.updateContent();
      return this;
    }
    
    // 렌더링 (아직 안 되어 있다면)
    if (!this.isInitialized) {
      this.render();
    }
    
    // 컨테이너에 추가
    const container = this.getOrCreateContainer();
    container.appendChild(this.element);
    
    // 애니메이션으로 표시
    requestAnimationFrame(() => {
      this.element.classList.add('toast-show');
      this.isVisible = true;
      
      // 표시 이벤트
      this.callbacks.onShow?.();
      this.emit('toast:show', { toast: this });
      
      // 자동 닫기 타이머 시작
      if (this.props.autoClose && !this.props.persistent && this.props.duration! > 0) {
        this.startTimer();
      }
      
      // 사운드 재생
      if (this.props.enableSound) {
        this.playSound();
      }
    });
    
    return this;
  }
  
  /**
   * 토스트 숨김
   */
  hide(): void {
    if (!this.isVisible) return;
    
    // 타이머 정지
    this.stopTimer();
    
    // 애니메이션으로 숨김
    this.element.classList.add('toast-hide');
    this.element.classList.remove('toast-show');
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
      if (this.element?.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.isVisible = false;
      
      // 숨김 이벤트
      this.callbacks.onHide?.();
      this.emit('toast:hide', { toast: this });
    }, 300);
  }
  
  /**
   * 일시정지
   */
  pause(): void {
    if (!this.isVisible || this.isPaused) return;
    
    this.isPaused = true;
    this.stopTimer();
    this.element.classList.add('toast-paused');
    
    this.emit('toast:pause', { toast: this });
  }
  
  /**
   * 재개
   */
  resume(): void {
    if (!this.isVisible || !this.isPaused) return;
    
    this.isPaused = false;
    this.element.classList.remove('toast-paused');
    
    if (this.props.autoClose && !this.props.persistent) {
      this.startTimer();
    }
    
    this.emit('toast:resume', { toast: this });
  }
  
  /**
   * 내용 업데이트
   */
  updateContent(message?: string, title?: string): void {
    if (message !== undefined) {
      this.props.message = message;
      if (this.messageElement) {
        this.messageElement.innerHTML = message;
      }
    }
    
    if (title !== undefined) {
      this.props.title = title;
      if (this.titleElement) {
        this.titleElement.textContent = title;
      } else if (title && !this.titleElement) {
        // 제목 요소가 없으면 생성
        this.render();
      }
    }
    
    // 타이머 리셋
    if (this.props.autoClose && !this.props.persistent) {
      this.remainingTime = this.props.duration!;
      this.stopTimer();
      this.startTimer();
    }
    
    this.emit('toast:update', { toast: this, message, title });
  }
  
  /**
   * 타입 변경
   */
  setType(type: ToastType): void {
    // 기존 타입 클래스 제거
    this.element.classList.remove(`toast-${this.props.type}`);
    
    // 새 타입 설정
    this.props.type = type;
    this.element.classList.add(`toast-${type}`);
    
    // 아이콘 업데이트
    if (this.iconElement && this.props.showIcon) {
      this.iconElement.textContent = this.props.customIcon || Toast.DEFAULT_ICONS[type];
    }
    
    this.emit('toast:type-change', { toast: this, type });
  }
  
  /**
   * 남은 시간 조회
   */
  getRemainingTime(): number {
    return this.remainingTime;
  }
  
  /**
   * 진행률 조회 (0-1)
   */
  getProgress(): number {
    if (!this.props.duration) return 0;
    return Math.max(0, Math.min(1, (this.props.duration - this.remainingTime) / this.props.duration));
  }
  
  // =============================================================================
  // 🎯 Private Methods
  // =============================================================================
  
  /**
   * HTML 구조 생성
   */
  private createToastHTML(): string {
    const { title, message, showIcon, customIcon, type, actions, closable, showProgress } = this.props;
    
    // 아이콘
    const icon = showIcon ? `
      <div class="toast-icon">
        ${customIcon || Toast.DEFAULT_ICONS[type!]}
      </div>
    ` : '';
    
    // 제목
    const titleHTML = title ? `
      <div class="toast-title">${title}</div>
    ` : '';
    
    // 액션 버튼들
    const actionsHTML = actions && actions.length > 0 ? `
      <div class="toast-actions">
        ${actions.map((action, index) => `
          <button type="button" class="toast-action-btn toast-action-${action.style || 'secondary'}" data-action="${index}">
            ${action.label}
          </button>
        `).join('')}
      </div>
    ` : '';
    
    // 닫기 버튼
    const closeButtonHTML = closable ? `
      <button type="button" class="toast-close" aria-label="닫기">
        <span aria-hidden="true">&times;</span>
      </button>
    ` : '';
    
    // 진행 바
    const progressBarHTML = showProgress && this.props.autoClose && !this.props.persistent ? `
      <div class="toast-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
    ` : '';
    
    return `
      ${icon}
      <div class="toast-content">
        ${titleHTML}
        <div class="toast-message">${message}</div>
        ${actionsHTML}
      </div>
      ${closeButtonHTML}
      ${progressBarHTML}
    `;
  }
  
  /**
   * DOM 요소 참조 캐시
   */
  private cacheElements(): void {
    this.iconElement = this.element.querySelector('.toast-icon');
    this.titleElement = this.element.querySelector('.toast-title');
    this.messageElement = this.element.querySelector('.toast-message');
    this.actionsContainer = this.element.querySelector('.toast-actions');
    this.closeButton = this.element.querySelector('.toast-close');
    this.progressBar = this.element.querySelector('.toast-progress-bar');
  }
  
  /**
   * 컨테이너 조회 또는 생성
   */
  private getOrCreateContainer(): HTMLElement {
    const position = this.props.position!;
    let container = document.querySelector(`.toast-container[data-position="${position}"]`) as HTMLElement;
    
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('data-position', position);
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', '알림 메시지');
      
      // 위치별 CSS 클래스 추가
      container.classList.add(`toast-container-${position}`);
      
      document.body.appendChild(container);
    }
    
    return container;
  }
  
  /**
   * 타이머 시작
   */
  private startTimer(): void {
    if (!this.props.duration || this.props.persistent) return;
    
    this.startTime = Date.now();
    
    const updateProgress = () => {
      if (!this.isVisible || this.isPaused) return;
      
      const elapsed = Date.now() - this.startTime!;
      this.remainingTime = Math.max(0, this.props.duration! - elapsed);
      
      // 진행 바 업데이트
      if (this.progressBar) {
        const progress = this.getProgress() * 100;
        this.progressBar.style.width = `${progress}%`;
        this.progressBar.setAttribute('aria-valuenow', progress.toString());
      }
      
      if (this.remainingTime <= 0) {
        this.callbacks.onProgressComplete?.();
        this.hide();
      } else {
        this.animationFrame = requestAnimationFrame(updateProgress);
      }
    };
    
    this.animationFrame = requestAnimationFrame(updateProgress);
  }
  
  /**
   * 타이머 정지
   */
  private stopTimer(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  
  /**
   * 사운드 재생
   */
  private playSound(): void {
    try {
      // Web Audio API를 사용한 간단한 알림음
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // 타입별 주파수
      const frequencies: Record<ToastType, number> = {
        success: 800,
        info: 600,
        warning: 500,
        error: 400,
        loading: 700
      };
      
      oscillator.frequency.setValueAtTime(frequencies[this.props.type!], audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      // 사운드 재생 실패는 무시
      console.debug('Toast sound playback failed:', error);
    }
  }
  
  // =============================================================================
  // 🎯 Event Handlers
  // =============================================================================
  
  /**
   * 마우스 진입 핸들러
   */
  private handleMouseEnter(): void {
    if (this.props.pauseOnHover) {
      this.pause();
    }
  }
  
  /**
   * 마우스 떠남 핸들러
   */
  private handleMouseLeave(): void {
    if (this.props.pauseOnHover) {
      this.resume();
    }
  }
  
  /**
   * 클릭 핸들러
   */
  private handleClick(event: Event): void {
    // 닫기 버튼이나 액션 버튼 클릭은 무시
    const target = event.target as HTMLElement;
    if (target.closest('.toast-close') || target.closest('.toast-action-btn')) {
      return;
    }
    
    this.callbacks.onClick?.();
    this.emit('toast:click', { toast: this, event });
  }
  
  /**
   * 닫기 버튼 클릭 핸들러
   */
  private handleCloseClick(event: Event): void {
    event.stopPropagation();
    this.hide();
  }
  
  /**
   * 키보드 이벤트 핸들러
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isVisible) {
      this.hide();
    }
  }
}

// =============================================================================
// 🎯 Toast Manager
// =============================================================================

/**
 * Toast 관리 클래스
 * 여러 토스트를 효율적으로 관리하고 제어
 */
export class ToastManager {
  private toasts = new Map<string, Toast>();
  private eventManager: EventManager;
  private defaultOptions: Partial<ToastProps>;
  private maxToasts: number = 5;
  
  constructor(eventManager: EventManager, defaultOptions: Partial<ToastProps> = {}) {
    this.eventManager = eventManager;
    this.defaultOptions = {
      position: 'top-right',
      duration: 5000,
      ...defaultOptions
    };
  }
  
  /**
   * 토스트 표시
   */
  show(message: string, options: Partial<ToastProps> = {}): Toast {
    const props = { ...this.defaultOptions, ...options, message };
    
    // 최대 토스트 수 체크
    this.enforceMaxToasts();
    
    // 토스트 생성
    const container = document.createElement('div');
    const toast = new Toast(container, props, this.eventManager);
    
    // 토스트 등록
    this.toasts.set(toast.id, toast);
    
    // 자동 제거 이벤트 리스너
    toast.on('toast:hide', () => {
      this.toasts.delete(toast.id);
    });
    
    // 표시
    toast.show();
    
    return toast;
  }
  
  /**
   * 편의 메서드들
   */
  info(message: string, options: Partial<ToastProps> = {}): Toast {
    return this.show(message, { ...options, type: 'info' });
  }
  
  success(message: string, options: Partial<ToastProps> = {}): Toast {
    return this.show(message, { ...options, type: 'success' });
  }
  
  warning(message: string, options: Partial<ToastProps> = {}): Toast {
    return this.show(message, { ...options, type: 'warning' });
  }
  
  error(message: string, options: Partial<ToastProps> = {}): Toast {
    return this.show(message, { 
      ...options, 
      type: 'error',
      duration: options.duration || 8000 // 에러는 좀 더 오래 표시
    });
  }
  
  loading(message: string, options: Partial<ToastProps> = {}): Toast {
    return this.show(message, { 
      ...options, 
      type: 'loading',
      persistent: true,
      autoClose: false
    });
  }
  
  /**
   * 토스트 조회
   */
  find(id: string): Toast | undefined {
    return this.toasts.get(id);
  }
  
  /**
   * 모든 토스트 조회
   */
  getAll(): Toast[] {
    return Array.from(this.toasts.values());
  }
  
  /**
   * 위치별 토스트 조회
   */
  getByPosition(position: ToastPosition): Toast[] {
    return this.getAll().filter(toast => toast.toastPosition === position);
  }
  
  /**
   * 타입별 토스트 조회
   */
  getByType(type: ToastType): Toast[] {
    return this.getAll().filter(toast => toast.toastType === type);
  }
  
  /**
   * 토스트 숨김
   */
  hide(id: string): boolean {
    const toast = this.toasts.get(id);
    if (toast) {
      toast.hide();
      return true;
    }
    return false;
  }
  
  /**
   * 모든 토스트 숨김
   */
  hideAll(): void {
    this.toasts.forEach(toast => toast.hide());
  }
  
  /**
   * 위치별 토스트 숨김
   */
  hideByPosition(position: ToastPosition): void {
    this.getByPosition(position).forEach(toast => toast.hide());
  }
  
  /**
   * 타입별 토스트 숨김
   */
  hideByType(type: ToastType): void {
    this.getByType(type).forEach(toast => toast.hide());
  }
  
  /**
   * 모든 토스트 일시정지
   */
  pauseAll(): void {
    this.toasts.forEach(toast => toast.pause());
  }
  
  /**
   * 모든 토스트 재개
   */
  resumeAll(): void {
    this.toasts.forEach(toast => toast.resume());
  }
  
  /**
   * 기본 옵션 업데이트
   */
  updateDefaults(options: Partial<ToastProps>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }
  
  /**
   * 최대 토스트 수 설정
   */
  setMaxToasts(max: number): void {
    this.maxToasts = max;
    this.enforceMaxToasts();
  }
  
  /**
   * 통계 정보
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      visible: all.filter(t => t.isVisible).length,
      byType: {
        info: this.getByType('info').length,
        success: this.getByType('success').length,
        warning: this.getByType('warning').length,
        error: this.getByType('error').length,
        loading: this.getByType('loading').length
      },
      byPosition: Object.fromEntries(
        (['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as ToastPosition[])
          .map(pos => [pos, this.getByPosition(pos).length])
      )
    };
  }
  
  /**
   * 디버그 정보
   */
  debug(): void {
    console.group('🍞 Toast Manager Debug');
    console.log('Stats:', this.getStats());
    console.log('Active toasts:', this.getAll().map(t => ({
      id: t.id,
      type: t.toastType,
      message: t.toastMessage,
      visible: t.isVisible
    })));
    console.groupEnd();
  }
  
  /**
   * 매니저 정리
   */
  destroy(): void {
    this.hideAll();
    this.toasts.clear();
  }
  
  /**
   * 최대 토스트 수 강제
   */
  private enforceMaxToasts(): void {
    const visible = this.getAll().filter(t => t.isVisible);
    if (visible.length >= this.maxToasts) {
      // 가장 오래된 토스트부터 제거
      visible.slice(0, visible.length - this.maxToasts + 1).forEach(toast => {
        toast.hide();
      });
    }
  }
}

// =============================================================================
// 🎯 Exports
// =============================================================================

export default Toast;