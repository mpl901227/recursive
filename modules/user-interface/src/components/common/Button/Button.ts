/**
 * @fileoverview Button Component - 재사용 가능한 버튼 컴포넌트
 * @description 다양한 스타일과 상태를 지원하는 버튼 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent, type ComponentOptions } from '../../base/component.js';
import type { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';

// =============================================================================
// 🎯 Button Types & Constants
// =============================================================================

/**
 * 버튼 변형 타입
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning' | 'info';

/**
 * 버튼 크기
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * 버튼 타입
 */
export type ButtonType = 'button' | 'submit' | 'reset';

/**
 * 버튼 상태
 */
export interface ButtonState {
  /** 로딩 상태 */
  loading: boolean;
  /** 비활성화 상태 */
  disabled: boolean;
  /** 활성 상태 */
  active: boolean;
  /** 포커스 상태 */
  focused: boolean;
  /** 호버 상태 */
  hovered: boolean;
}

/**
 * 버튼 아이콘 설정
 */
export interface ButtonIcon {
  /** 아이콘 HTML 또는 텍스트 */
  content: string;
  /** 위치 */
  position: 'left' | 'right' | 'only';
  /** 로딩 시 아이콘 숨김 여부 */
  hideOnLoading?: boolean;
}

/**
 * 버튼 Props 인터페이스
 */
export interface ButtonProps extends ComponentProps {
  /** 버튼 텍스트 */
  text?: string;
  /** 버튼 변형 */
  variant?: ButtonVariant;
  /** 버튼 크기 */
  size?: ButtonSize;
  /** 버튼 타입 */
  type?: ButtonType;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 로딩 상태 */
  loading?: boolean;
  /** 활성 상태 */
  active?: boolean;
  /** 아이콘 설정 */
  icon?: ButtonIcon | undefined;
  /** 전체 너비 사용 */
  fullWidth?: boolean;
  /** 원형 버튼 */
  rounded?: boolean;
  /** HTML content (text보다 우선) */
  html?: string;
  /** CSS 클래스 추가 */
  className?: string;
  /** 로딩 메시지 */
  loadingText?: string;
  /** 로딩 아이콘 */
  loadingIcon?: string;
  /** 클릭 핸들러 */
  onClick?: (event: Event) => void | Promise<void>;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** 툴팁 텍스트 */
  title?: string;
  /** 탭 인덱스 */
  tabIndex?: number;
  /** 키보드 단축키 */
  accessKey?: string;
  /** 로딩 시 자동 비활성화 */
  disableOnLoading?: boolean;
  /** 클릭 후 자동 포커스 해제 */
  blurOnClick?: boolean;
  /** 리플 효과 */
  ripple?: boolean;
  /** 애니메이션 지속시간 (ms) */
  animationDuration?: number;
}

// =============================================================================
// 🎯 Button Component
// =============================================================================

export class Button extends BaseComponent<HTMLElement, ButtonProps> {
  // DOM 요소들
  private buttonElement!: HTMLButtonElement;
  // Note: Element references are managed through DOM queries when needed
  private rippleContainer: HTMLDivElement | undefined;

  // 상태 관리
  private buttonState: ButtonState = {
    loading: false,
    disabled: false,
    active: false,
    focused: false,
    hovered: false
  };

  // 기본 아이콘
  private static readonly DEFAULT_LOADING_ICON = `
    <svg class="loading-spinner" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="60" stroke-dashoffset="60" stroke-linecap="round">
        <animate attributeName="stroke-dashoffset" dur="1s" values="60;0" repeatCount="indefinite"/>
        <animateTransform attributeName="transform" type="rotate" dur="1s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
      </circle>
    </svg>
  `;

  // 기본 설정값
  private static readonly DEFAULT_PROPS: Partial<ButtonProps> = {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    active: false,
    fullWidth: false,
    rounded: false,
    disableOnLoading: true,
    blurOnClick: false,
    ripple: true,
    animationDuration: 300,
    loadingIcon: Button.DEFAULT_LOADING_ICON,
    tabIndex: 0
  };

  /**
   * 컴포넌트 생성자
   */
  constructor(element: HTMLElement, props: ButtonProps, eventManager: EventManager, options: ComponentOptions = {}) {
    super(element, props, eventManager, options);
    this.props = { ...Button.DEFAULT_PROPS, ...props };
    this.initializeButton();
  }

  /**
   * 버튼 초기화
   */
  private initializeButton(): void {
    // 기존 버튼 요소 확인
    if (this.element.tagName === 'BUTTON') {
      this.buttonElement = this.element as HTMLButtonElement;
    } else {
      // div나 다른 요소인 경우 버튼으로 변환
      const button = document.createElement('button');
      button.className = this.element.className;
      button.innerHTML = this.element.innerHTML;
      this.element.parentNode?.replaceChild(button, this.element);
      // element는 readonly이므로 buttonElement만 설정
      this.buttonElement = button;
    }

    // 초기 상태 설정
    this.updateButtonState();
  }

  /**
   * 렌더링
   */
  render(): void {
    // 버튼 속성 설정
    this.setButtonAttributes();
    
    // 버튼 내용 생성
    this.buttonElement.innerHTML = this.createButtonHTML();
    
    // DOM 요소 참조 저장
    this.findButtonElements();
    
    // CSS 클래스 설정
    this.updateButtonClasses();
    
    // 리플 컨테이너 생성
    if (this.props.ripple) {
      this.createRippleContainer();
    }
  }

  /**
   * 이벤트 바인딩
   */
  public bindEvents(): void {
    // 클릭 이벤트
    this.addDOMEventListener(this.buttonElement, 'click', this.handleClick.bind(this));
    
    // 포커스 이벤트
    this.addDOMEventListener(this.buttonElement, 'focus', this.handleFocus.bind(this));
    this.addDOMEventListener(this.buttonElement, 'blur', this.handleBlur.bind(this));
    
    // 마우스 이벤트
    this.addDOMEventListener(this.buttonElement, 'mouseenter', this.handleMouseEnter.bind(this));
    this.addDOMEventListener(this.buttonElement, 'mouseleave', this.handleMouseLeave.bind(this));
    this.addDOMEventListener(this.buttonElement, 'mousedown', this.handleMouseDown.bind(this));
    this.addDOMEventListener(this.buttonElement, 'mouseup', this.handleMouseUp.bind(this));
    
    // 키보드 이벤트
    this.addDOMEventListener(this.buttonElement, 'keydown', ((event: KeyboardEvent) => this.handleKeyDown(event)) as EventListener);
    this.addDOMEventListener(this.buttonElement, 'keyup', ((event: KeyboardEvent) => this.handleKeyUp(event)) as EventListener);
    
    // 리플 효과
    if (this.props.ripple) {
      this.addDOMEventListener(this.buttonElement, 'mousedown', ((event: MouseEvent) => this.handleRipple(event)) as EventListener);
    }
  }

  // =============================================================================
  // 🎯 Public API
  // =============================================================================

  /**
   * 버튼 텍스트 설정
   */
  setText(text: string): void {
    this.props.text = text;
    this.updateButtonContent();
  }

  /**
   * 로딩 상태 설정
   */
  setLoading(loading: boolean, loadingText?: string): void {
    this.props.loading = loading;
    if (loadingText) {
      this.props.loadingText = loadingText;
    }
    
    this.buttonState.loading = loading;
    this.updateButtonState();
    this.updateButtonContent();
    
    // 이벤트 발생
    this.emit('loading-change', { loading, component: this });
  }

  /**
   * 비활성화 상태 설정
   */
  setDisabled(disabled: boolean): void {
    this.props.disabled = disabled;
    this.buttonState.disabled = disabled;
    this.updateButtonState();
    
    // 이벤트 발생
    this.emit('disabled-change', { disabled, component: this });
  }

  /**
   * 활성 상태 설정
   */
  setActive(active: boolean): void {
    this.props.active = active;
    this.buttonState.active = active;
    this.updateButtonClasses();
    
    // 이벤트 발생
    this.emit('active-change', { active, component: this });
  }

  /**
   * 변형 변경
   */
  setVariant(variant: ButtonVariant): void {
    this.props.variant = variant;
    this.updateButtonClasses();
  }

  /**
   * 크기 변경
   */
  setSize(size: ButtonSize): void {
    this.props.size = size;
    this.updateButtonClasses();
  }

  /**
   * 아이콘 설정
   */
  setIcon(icon: ButtonIcon | null): void {
    if (icon === null) {
      this.props.icon = undefined;
    } else {
      this.props.icon = icon;
    }
    this.updateButtonContent();
  }

  /**
   * 클릭 시뮬레이션
   */
  click(): void {
    if (!this.isInteractable()) return;
    this.buttonElement.click();
  }

  /**
   * 포커스 설정
   */
  focus(): void {
    this.buttonElement.focus();
  }

  /**
   * 포커스 해제
   */
  blur(): void {
    this.buttonElement.blur();
  }

  /**
   * Promise 기반 로딩 처리
   */
  async executeWithLoading<T>(
    asyncFunction: () => Promise<T>,
    loadingText?: string
  ): Promise<T> {
    this.setLoading(true, loadingText);
    
    try {
      const result = await asyncFunction();
      return result;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * 현재 상태 조회
   */
  getButtonState(): ButtonState {
    return { ...this.buttonState };
  }

  /**
   * 상호작용 가능한지 확인
   */
  isInteractable(): boolean {
    return !this.buttonState.disabled && !this.buttonState.loading;
  }

  // =============================================================================
  // 🎯 Event Handlers
  // =============================================================================

  private async handleClick(event: Event): Promise<void> {
    if (!this.isInteractable()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // 리플 효과
    if (this.props.ripple && event instanceof MouseEvent) {
      this.createRippleEffect(event);
    }

    // 포커스 해제
    if (this.props.blurOnClick) {
      setTimeout(() => this.blur(), 100);
    }

    try {
      // onClick 핸들러 실행
      if (this.props.onClick) {
        await this.props.onClick(event);
      }

      // 이벤트 발생
      this.emit('click', { event, component: this });
    } catch (error) {
      this.handleError(error as Error, 'button-click');
    }
  }

  private handleFocus(): void {
    this.buttonState.focused = true;
    this.updateButtonClasses();
    this.emit('focus', { component: this });
  }

  private handleBlur(): void {
    this.buttonState.focused = false;
    this.updateButtonClasses();
    this.emit('blur', { component: this });
  }

  private handleMouseEnter(): void {
    this.buttonState.hovered = true;
    this.updateButtonClasses();
    this.emit('hover', { hovered: true, component: this });
  }

  private handleMouseLeave(): void {
    this.buttonState.hovered = false;
    this.updateButtonClasses();
    this.emit('hover', { hovered: false, component: this });
  }

  private handleMouseDown(): void {
    if (!this.isInteractable()) return;
    this.buttonElement.classList.add('btn-pressed');
  }

  private handleMouseUp(): void {
    this.buttonElement.classList.remove('btn-pressed');
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isInteractable()) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.buttonElement.classList.add('btn-pressed');
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.buttonElement.classList.remove('btn-pressed');

    if (!this.isInteractable()) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.handleClick(event);
    }
  }

  private handleRipple(event: MouseEvent): void {
    if (!this.isInteractable() || !this.props.ripple) return;
    this.createRippleEffect(event);
  }

  // =============================================================================
  // 🎯 Private Methods
  // =============================================================================

  /**
   * 버튼 속성 설정
   */
  private setButtonAttributes(): void {
    const { type, disabled, loading, ariaLabel, title, tabIndex, accessKey } = this.props;

    this.buttonElement.type = type || 'button';
    this.buttonElement.disabled = disabled || loading || false;

    if (ariaLabel) {
      this.buttonElement.setAttribute('aria-label', ariaLabel);
    }

    if (title) {
      this.buttonElement.title = title;
    }

    if (tabIndex !== undefined) {
      this.buttonElement.tabIndex = tabIndex;
    }

    if (accessKey) {
      this.buttonElement.accessKey = accessKey;
    }

    // 로딩 상태 ARIA
    if (loading) {
      this.buttonElement.setAttribute('aria-busy', 'true');
    } else {
      this.buttonElement.removeAttribute('aria-busy');
    }

    // 활성 상태 ARIA
    if (this.props.active) {
      this.buttonElement.setAttribute('aria-pressed', 'true');
    } else {
      this.buttonElement.removeAttribute('aria-pressed');
    }
  }

  /**
   * 버튼 HTML 생성
   */
  private createButtonHTML(): string {
    const { text, html, icon, loading } = this.props;

    // 로딩 상태
    if (loading) {
      return this.createLoadingHTML();
    }

    // HTML 우선
    if (html) {
      return html;
    }

    // 아이콘만
    if (icon?.position === 'only') {
      return `<span class="btn-icon btn-icon-only">${icon.content}</span>`;
    }

    // 텍스트 + 아이콘
    const iconHTML = icon ? `<span class="btn-icon btn-icon-${icon.position}">${icon.content}</span>` : '';
    const textHTML = text ? `<span class="btn-text">${text}</span>` : '';

    if (icon?.position === 'right') {
      return `${textHTML}${iconHTML}`;
    } else {
      return `${iconHTML}${textHTML}`;
    }
  }

  /**
   * 로딩 HTML 생성
   */
  private createLoadingHTML(): string {
    const { loadingText, loadingIcon, text } = this.props;
    const displayText = loadingText || text || 'Loading...';
    
    return `
      <span class="btn-loading">
        <span class="btn-loading-icon">${loadingIcon}</span>
        <span class="btn-loading-text">${displayText}</span>
      </span>
    `;
  }

  /**
   * DOM 요소 참조 저장
   */
  private findButtonElements(): void {
    // Elements are queried dynamically when needed to avoid maintaining references
    // This reduces memory usage and simplifies the component lifecycle
  }

  /**
   * 버튼 CSS 클래스 업데이트
   */
  private updateButtonClasses(): void {
    const { variant, size, fullWidth, rounded, className } = this.props;
    const { loading, disabled, active, focused, hovered } = this.buttonState;

    // 기본 클래스들
    const classes = [
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      ...(fullWidth ? ['btn-full-width'] : []),
      ...(rounded ? ['btn-rounded'] : []),
      ...(loading ? ['btn-loading'] : []),
      ...(disabled ? ['btn-disabled'] : []),
      ...(active ? ['btn-active'] : []),
      ...(focused ? ['btn-focused'] : []),
      ...(hovered ? ['btn-hovered'] : []),
      ...(className ? [className] : [])
    ];

    this.buttonElement.className = classes.join(' ');
  }

  /**
   * 버튼 상태 업데이트
   */
  private updateButtonState(): void {
    const { disabled, loading, disableOnLoading } = this.props;

    this.buttonState.disabled = disabled || (disableOnLoading && loading) || false;
    this.buttonState.loading = loading || false;

    this.setButtonAttributes();
    this.updateButtonClasses();
  }

  /**
   * 버튼 내용 업데이트
   */
  private updateButtonContent(): void {
    this.buttonElement.innerHTML = this.createButtonHTML();
    this.findButtonElements();
  }

  /**
   * 리플 컨테이너 생성
   */
  private createRippleContainer(): void {
    if (this.rippleContainer) return;

    this.rippleContainer = document.createElement('div');
    this.rippleContainer.className = 'btn-ripple-container';
    this.buttonElement.appendChild(this.rippleContainer);
  }

  /**
   * 리플 효과 생성
   */
  private createRippleEffect(event: MouseEvent): void {
    if (!this.rippleContainer) return;

    const rect = this.buttonElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const ripple = document.createElement('div');
    ripple.className = 'btn-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    this.rippleContainer.appendChild(ripple);

    // 애니메이션 후 제거
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, this.props.animationDuration || 300);
  }

  /**
   * 에러 처리
   */
  protected handleError(error: Error, context: string): void {
    console.error(`[Button] Error in ${context}:`, error);
    this.emit('error', { error, context, component: this });
  }

  /**
   * 정리
   */
  async destroy(): Promise<void> {
    // 리플 컨테이너 제거
    if (this.rippleContainer) {
      this.rippleContainer.remove();
    }

    await super.destroy();
  }
}

// =============================================================================
// 🎯 Button Manager
// =============================================================================

/**
 * 버튼 매니저 클래스
 */
export class ButtonManager {
  private eventManager: EventManager;
  private buttons = new Map<string, Button>();
  private groups = new Map<string, Set<string>>();
  private defaultOptions: Partial<ButtonProps>;

  constructor(eventManager: EventManager, defaultOptions: Partial<ButtonProps> = {}) {
    this.eventManager = eventManager;
    this.defaultOptions = defaultOptions;
  }

  /**
   * 버튼 생성 및 등록
   */
  create(id: string, element: HTMLElement, options: ComponentOptions = {}): Button {
    const mergedProps = { ...this.defaultOptions, ...(options as any).props };

    const button = new Button(element, mergedProps as ButtonProps, this.eventManager, options);
    this.buttons.set(id, button);

    return button;
  }

  /**
   * 버튼 조회
   */
  get(id: string): Button | undefined {
    return this.buttons.get(id);
  }

  /**
   * 버튼 그룹 생성
   */
  createGroup(groupId: string, buttonIds: string[]): void {
    this.groups.set(groupId, new Set(buttonIds));
  }

  /**
   * 그룹 내 모든 버튼 비활성화
   */
  disableGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    group.forEach(buttonId => {
      const button = this.buttons.get(buttonId);
      if (button) {
        button.setDisabled(true);
      }
    });
  }

  /**
   * 그룹 내 모든 버튼 활성화
   */
  enableGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    group.forEach(buttonId => {
      const button = this.buttons.get(buttonId);
      if (button) {
        button.setDisabled(false);
      }
    });
  }

  /**
   * 라디오 그룹 (하나만 활성)
   */
  setRadioGroup(groupId: string, activeButtonId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    group.forEach(buttonId => {
      const button = this.buttons.get(buttonId);
      if (button) {
        button.setActive(buttonId === activeButtonId);
      }
    });
  }

  /**
   * 모든 버튼 제거
   */
  destroy(): void {
    this.buttons.forEach(button => button.destroy());
    this.buttons.clear();
    this.groups.clear();
  }
}

// =============================================================================
// 🎯 Utility Functions
// =============================================================================

/**
 * 간편한 버튼 생성 함수
 */
export function createButton(
  element: HTMLElement | string,
  options: Partial<ButtonProps> & { eventManager?: EventManager } = {}
): Button {
  const { eventManager, ...props } = options;
  const targetElement = typeof element === 'string' 
    ? document.querySelector(element) as HTMLElement
    : element;

  if (!targetElement) {
    throw new Error('Button element not found');
  }

  const mockEventManager = eventManager || { 
    emit: () => {}, 
    on: () => {}, 
    off: () => {}, 
    once: () => {} 
  } as unknown as EventManager;

  return new Button(targetElement, props as ButtonProps, mockEventManager, {});
}

/**
 * 버튼 그룹 생성 유틸리티
 */
export function createButtonGroup(
  buttons: Array<{ element: HTMLElement; options?: Partial<ButtonProps> }>,
  groupOptions: { eventManager?: EventManager; radioMode?: boolean } = {}
): Button[] {
  const { eventManager, radioMode } = groupOptions;
  const buttonInstances: Button[] = [];

  buttons.forEach(({ element, options = {} }) => {
    const button = createButton(element, { ...options, ...(eventManager && { eventManager }) });
    buttonInstances.push(button);

    // 라디오 모드 처리
    if (radioMode) {
      button.on('click', () => {
        buttonInstances.forEach(btn => {
          btn.setActive(btn === button);
        });
      });
    }
  });

  return buttonInstances;
}

export default Button; 