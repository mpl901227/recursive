/**
 * @fileoverview Input Component - 재사용 가능한 입력 컴포넌트
 * @description 다양한 타입과 검증 상태를 지원하는 입력 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent, type ComponentOptions } from '../../base/component.js';
import type { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';

// =============================================================================
// 🎯 Input Types & Constants
// =============================================================================

/**
 * 입력 타입
 */
export type InputType = 
  | 'text' | 'email' | 'password' | 'tel' | 'url' | 'search'
  | 'number' | 'range' | 'date' | 'datetime-local' | 'time' | 'month' | 'week'
  | 'color' | 'file' | 'hidden' | 'checkbox' | 'radio';

/**
 * 입력 크기
 */
export type InputSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * 검증 상태
 */
export type ValidationState = 'idle' | 'valid' | 'invalid' | 'warning' | 'loading';

/**
 * 자동 완성 타입
 */
export type AutoCompleteType = 
  | 'off' | 'on' | 'name' | 'email' | 'username' | 'current-password' | 'new-password'
  | 'one-time-code' | 'organization-title' | 'organization' | 'street-address'
  | 'address-line1' | 'address-line2' | 'address-level1' | 'address-level2'
  | 'country' | 'country-name' | 'postal-code' | 'cc-name' | 'cc-number'
  | 'cc-exp' | 'cc-exp-month' | 'cc-exp-year' | 'cc-csc' | 'cc-type'
  | 'transaction-currency' | 'transaction-amount' | 'language' | 'bday'
  | 'bday-day' | 'bday-month' | 'bday-year' | 'sex' | 'tel' | 'url';

/**
 * 입력 상태
 */
export interface InputState {
  /** 포커스 상태 */
  focused: boolean;
  /** 비활성화 상태 */
  disabled: boolean;
  /** 읽기 전용 상태 */
  readonly: boolean;
  /** 필수 입력 상태 */
  required: boolean;
  /** 검증 중 상태 */
  validating: boolean;
  /** 값 존재 여부 */
  hasValue: boolean;
  /** 변경된 상태 */
  dirty: boolean;
  /** 터치된 상태 */
  touched: boolean;
}

/**
 * 검증 규칙
 */
export interface ValidationRule {
  /** 규칙 이름 */
  name: string;
  /** 검증 함수 */
  validator: (value: string, props: InputProps) => boolean | Promise<boolean>;
  /** 에러 메시지 */
  message: string;
  /** 즉시 검증 여부 */
  immediate?: boolean;
}

/**
 * 검증 결과
 */
export interface ValidationResult {
  /** 검증 상태 */
  state: ValidationState;
  /** 에러 메시지들 */
  errors: string[];
  /** 경고 메시지들 */
  warnings: string[];
  /** 검증 성공 여부 */
  isValid: boolean;
}

/**
 * 아이콘 설정
 */
export interface InputIcon {
  /** 아이콘 HTML 또는 텍스트 */
  content: string;
  /** 위치 */
  position: 'left' | 'right';
  /** 클릭 가능 여부 */
  clickable?: boolean;
  /** 클릭 핸들러 */
  onClick?: (event: Event) => void;
  /** 아이콘 제목 */
  title?: string;
}

/**
 * 입력 Props 인터페이스
 */
export interface InputProps extends ComponentProps {
  /** 입력 타입 */
  type?: InputType;
  /** 입력 값 */
  value?: string | number;
  /** 기본값 */
  defaultValue?: string | number;
  /** 플레이스홀더 */
  placeholder?: string;
  /** 레이블 텍스트 */
  label?: string;
  /** 도움말 텍스트 */
  helpText?: string;
  /** 에러 메시지 */
  errorMessage?: string;
  /** 경고 메시지 */
  warningMessage?: string;
  /** 성공 메시지 */
  successMessage?: string;
  /** 입력 크기 */
  size?: InputSize;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 읽기 전용 여부 */
  readonly?: boolean;
  /** 필수 입력 여부 */
  required?: boolean;
  /** 자동 포커스 */
  autofocus?: boolean;
  /** 자동 완성 */
  autocomplete?: AutoCompleteType;
  /** 최소 길이 */
  minLength?: number;
  /** 최대 길이 */
  maxLength?: number;
  /** 최소값 (number, range, date 타입) */
  min?: string | number;
  /** 최대값 (number, range, date 타입) */
  max?: string | number;
  /** 스텝 (number, range 타입) */
  step?: string | number;
  /** 패턴 정규식 */
  pattern?: string;
  /** 다중 선택 (file, email 타입) */
  multiple?: boolean;
  /** 허용 파일 타입 (file 타입) */
  accept?: string;
  /** 아이콘 설정 */
  icon?: InputIcon;
  /** 전체 너비 사용 */
  fullWidth?: boolean;
  /** CSS 클래스 추가 */
  className?: string;
  /** 입력 이름 */
  name?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** 접근성 설명 */
  ariaDescribedBy?: string;
  /** 탭 인덱스 */
  tabIndex?: number;
  /** 검증 규칙들 */
  validationRules?: ValidationRule[];
  /** 실시간 검증 여부 */
  validateOnInput?: boolean;
  /** 포커스 아웃 시 검증 여부 */
  validateOnBlur?: boolean;
  /** 디바운스 시간 (ms) */
  debounceTime?: number;
  /** 값 변경 핸들러 */
  onChange?: (value: string, event: Event) => void;
  /** 입력 핸들러 */
  onInput?: (value: string, event: Event) => void;
  /** 포커스 핸들러 */
  onFocus?: (event: FocusEvent) => void;
  /** 블러 핸들러 */
  onBlur?: (event: FocusEvent) => void;
  /** 검증 핸들러 */
  onValidation?: (result: ValidationResult) => void;
  /** 키 다운 핸들러 */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** 키 업 핸들러 */
  onKeyUp?: (event: KeyboardEvent) => void;
  /** 엔터 핸들러 */
  onEnter?: (value: string, event: KeyboardEvent) => void;
  /** 이스케이프 핸들러 */
  onEscape?: (event: KeyboardEvent) => void;
}

// =============================================================================
// 🎯 Input Component
// =============================================================================

export class Input extends BaseComponent<HTMLElement, InputProps> {
  // DOM 요소들
  private containerElement!: HTMLDivElement;
  private inputElement!: HTMLInputElement;
  private labelElement!: HTMLLabelElement | undefined;
  private helpTextElement!: HTMLSpanElement | undefined;
  private messageElement!: HTMLSpanElement | undefined;
  private iconElement!: HTMLSpanElement | undefined;

  // 상태 관리
  private inputState: InputState = {
    focused: false,
    disabled: false,
    readonly: false,
    required: false,
    validating: false,
    hasValue: false,
    dirty: false,
    touched: false
  };

  // 검증 관리
  private validationResult: ValidationResult = {
    state: 'idle',
    errors: [],
    warnings: [],
    isValid: true
  };

  // 디바운스 타이머
  private debounceTimer: number | undefined;
  private validationTimer: number | undefined;

  // 기본 설정값
  public static readonly DEFAULT_PROPS: Partial<InputProps> = {
    type: 'text',
    size: 'md',
    disabled: false,
    readonly: false,
    required: false,
    autofocus: false,
    autocomplete: 'off',
    fullWidth: false,
    validateOnInput: true,
    validateOnBlur: true,
    debounceTime: 300,
    tabIndex: 0
  };

  /**
   * 컴포넌트 생성자
   */
  constructor(element: HTMLElement, props: InputProps, eventManager: EventManager, options: ComponentOptions = {}) {
    super(element, props, eventManager, options);
    this.props = { ...Input.DEFAULT_PROPS, ...props };
    this.initializeInput();
  }

  /**
   * 입력 초기화
   */
  private initializeInput(): void {
    // 컨테이너 설정
    this.setupContainer();
    
    // 입력 요소 설정
    this.setupInputElement();
    
    // 초기 상태 설정
    this.updateInputState();
  }

  /**
   * 컨테이너 설정
   */
  private setupContainer(): void {
    if (this.element.classList.contains('input-container')) {
      this.containerElement = this.element as HTMLDivElement;
      this.inputElement = this.containerElement.querySelector('input') as HTMLInputElement;
    } else if (this.element.tagName === 'INPUT') {
      // input 요소를 컨테이너로 감싸기
      this.inputElement = this.element as HTMLInputElement;
      this.containerElement = document.createElement('div');
      this.containerElement.className = 'input-container';
      
      this.inputElement.parentNode?.insertBefore(this.containerElement, this.inputElement);
      this.containerElement.appendChild(this.inputElement);
    } else {
      throw new Error('Input component requires an input element or input-container');
    }
  }

  /**
   * 입력 요소 설정
   */
  private setupInputElement(): void {
    if (!this.inputElement) {
      this.inputElement = document.createElement('input');
      this.containerElement.appendChild(this.inputElement);
    }

    // 기본 클래스 추가
    this.inputElement.classList.add('input-field');
    
    // 고유 ID 설정
    if (!this.inputElement.id) {
      this.inputElement.id = `${this.id}-input`;
    }
  }

  /**
   * 렌더링
   */
  render(): void {
    // 컨테이너 속성 설정
    this.setContainerAttributes();
    
    // 입력 속성 설정
    this.setInputAttributes();
    
    // 레이블 렌더링
    this.renderLabel();
    
    // 아이콘 렌더링
    this.renderIcon();
    
    // 도움말/메시지 렌더링
    this.renderMessages();
    
    // CSS 클래스 설정
    this.updateContainerClasses();
    
    // 초기값 설정
    this.setValue(this.props.value || this.props.defaultValue || '');
  }

  /**
   * 이벤트 바인딩
   */
  public bindEvents(): void {
    // 입력 이벤트
    this.inputElement.addEventListener('input', this.handleInput.bind(this));
    this.inputElement.addEventListener('change', this.handleChange.bind(this));
    this.inputElement.addEventListener('focus', this.handleFocus.bind(this));
    this.inputElement.addEventListener('blur', this.handleBlur.bind(this));
    this.inputElement.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.inputElement.addEventListener('keyup', this.handleKeyUp.bind(this));

    // 아이콘 클릭 이벤트
    if (this.iconElement && this.props.icon?.clickable) {
      this.iconElement.addEventListener('click', this.handleIconClick.bind(this));
    }

    // 레이블 클릭 이벤트
    if (this.labelElement) {
      this.labelElement.addEventListener('click', this.handleLabelClick.bind(this));
    }
  }

  /**
   * 이벤트 해제
   */
  public unbindEvents(): void {
    this.inputElement.removeEventListener('input', this.handleInput.bind(this));
    this.inputElement.removeEventListener('change', this.handleChange.bind(this));
    this.inputElement.removeEventListener('focus', this.handleFocus.bind(this));
    this.inputElement.removeEventListener('blur', this.handleBlur.bind(this));
    this.inputElement.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.inputElement.removeEventListener('keyup', this.handleKeyUp.bind(this));

    if (this.iconElement && this.props.icon?.clickable) {
      this.iconElement.removeEventListener('click', this.handleIconClick.bind(this));
    }

    if (this.labelElement) {
      this.labelElement.removeEventListener('click', this.handleLabelClick.bind(this));
    }
  }

  // =============================================================================
  // 🎯 Public API
  // =============================================================================

  /**
   * 값 설정
   */
  setValue(value: string | number): void {
    const stringValue = String(value || '');
    this.inputElement.value = stringValue;
    this.inputState.hasValue = stringValue.length > 0;
    this.updateContainerClasses();
    this.emit('value:changed', { value: stringValue, component: this });
  }

  /**
   * 값 가져오기
   */
  getValue(): string {
    return this.inputElement.value;
  }

  /**
   * 포커스 설정
   */
  focus(): void {
    this.inputElement.focus();
  }

  /**
   * 블러 설정
   */
  blur(): void {
    this.inputElement.blur();
  }

  /**
   * 선택
   */
  select(): void {
    this.inputElement.select();
  }

  /**
   * 지우기
   */
  clear(): void {
    this.setValue('');
    this.inputState.dirty = false;
    this.inputState.touched = false;
    this.clearValidation();
  }

  /**
   * 비활성화 설정
   */
  setDisabled(disabled: boolean): void {
    this.props.disabled = disabled;
    this.inputState.disabled = disabled;
    this.inputElement.disabled = disabled;
    this.updateContainerClasses();
  }

  /**
   * 읽기 전용 설정
   */
  setReadonly(readonly: boolean): void {
    this.props.readonly = readonly;
    this.inputState.readonly = readonly;
    this.inputElement.readOnly = readonly;
    this.updateContainerClasses();
  }

  /**
   * 필수 입력 설정
   */
  setRequired(required: boolean): void {
    this.props.required = required;
    this.inputState.required = required;
    this.inputElement.required = required;
    this.updateContainerClasses();
  }

  /**
   * 검증 수행
   */
  async validate(): Promise<ValidationResult> {
    if (!this.props.validationRules || this.props.validationRules.length === 0) {
      this.validationResult = {
        state: 'valid',
        errors: [],
        warnings: [],
        isValid: true
      };
      return this.validationResult;
    }

    this.inputState.validating = true;
    this.validationResult.state = 'loading';
    this.updateContainerClasses();

    const value = this.getValue();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      for (const rule of this.props.validationRules) {
        const isValid = await rule.validator(value, this.props);
        if (!isValid) {
          if (rule.name.includes('warning')) {
            warnings.push(rule.message);
          } else {
            errors.push(rule.message);
          }
        }
      }

      this.validationResult = {
        state: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid',
        errors,
        warnings,
        isValid: errors.length === 0
      };

    } catch (error) {
      this.validationResult = {
        state: 'invalid',
        errors: ['검증 중 오류가 발생했습니다.'],
        warnings: [],
        isValid: false
      };
    }

    this.inputState.validating = false;
    this.updateContainerClasses();
    this.updateMessageDisplay();

    // 검증 이벤트 발생
    this.props.onValidation?.(this.validationResult);
    this.emit('validation:complete', { result: this.validationResult, component: this });

    return this.validationResult;
  }

  /**
   * 검증 초기화
   */
  clearValidation(): void {
    this.validationResult = {
      state: 'idle',
      errors: [],
      warnings: [],
      isValid: true
    };
    this.updateContainerClasses();
    this.updateMessageDisplay();
  }

  /**
   * 입력 상태 가져오기
   */
  getInputState(): InputState {
    return { ...this.inputState };
  }

  /**
   * 검증 결과 가져오기
   */
  getValidationResult(): ValidationResult {
    return { ...this.validationResult };
  }

  /**
   * 상호작용 가능 여부
   */
  isInteractable(): boolean {
    return !this.inputState.disabled && !this.inputState.readonly;
  }

  // =============================================================================
  // 🎯 Event Handlers
  // =============================================================================

  private handleInput(event: Event): void {
    const value = this.getValue();
    
    this.inputState.hasValue = value.length > 0;
    this.inputState.dirty = true;
    this.updateContainerClasses();

    // 입력 이벤트 발생
    this.props.onInput?.(value, event);
    this.emit('input', { value, event, component: this });

    // 실시간 검증
    if (this.props.validateOnInput) {
      this.scheduleValidation();
    }
  }

  private handleChange(event: Event): void {
    const value = this.getValue();
    
    // 변경 이벤트 발생
    this.props.onChange?.(value, event);
    this.emit('change', { value, event, component: this });
  }

  private handleFocus(event: FocusEvent): void {
    this.inputState.focused = true;
    this.inputState.touched = true;
    this.updateContainerClasses();

    // 포커스 이벤트 발생
    this.props.onFocus?.(event);
    this.emit('focus', { event, component: this });
  }

  private handleBlur(event: FocusEvent): void {
    this.inputState.focused = false;
    this.updateContainerClasses();

    // 블러 시 검증
    if (this.props.validateOnBlur && this.inputState.dirty) {
      this.validate();
    }

    // 블러 이벤트 발생
    this.props.onBlur?.(event);
    this.emit('blur', { event, component: this });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // 엔터 키 처리
    if (event.key === 'Enter') {
      this.props.onEnter?.(this.getValue(), event);
      this.emit('enter', { value: this.getValue(), event, component: this });
    }

    // 이스케이프 키 처리
    if (event.key === 'Escape') {
      this.props.onEscape?.(event);
      this.emit('escape', { event, component: this });
    }

    // 키 다운 이벤트 발생
    this.props.onKeyDown?.(event);
    this.emit('keydown', { event, component: this });
  }

  private handleKeyUp(event: KeyboardEvent): void {
    // 키 업 이벤트 발생
    this.props.onKeyUp?.(event);
    this.emit('keyup', { event, component: this });
  }

  private handleIconClick(event: Event): void {
    if (this.props.icon?.clickable && this.props.icon.onClick) {
      this.props.icon.onClick(event);
    }
    this.emit('icon:click', { event, component: this });
  }

  private handleLabelClick(): void {
    this.focus();
  }

  // =============================================================================
  // 🎯 Private Methods
  // =============================================================================

  private setContainerAttributes(): void {
    this.containerElement.className = 'input-container recursive-component input';
    
    if (this.props.className) {
      this.containerElement.classList.add(...this.props.className.split(' '));
    }
  }

  private setInputAttributes(): void {
    const input = this.inputElement;
    
    // 기본 속성
    input.type = this.props.type || 'text';
    input.disabled = this.props.disabled || false;
    input.readOnly = this.props.readonly || false;
    input.required = this.props.required || false;
    input.placeholder = this.props.placeholder || '';
    
    // 이름과 ID
    if (this.props.name) {
      input.name = this.props.name;
    }
    
    // 자동 완성
    if (this.props.autocomplete) {
      input.setAttribute('autocomplete', this.props.autocomplete);
    }
    
    // 길이 제한
    if (this.props.minLength !== undefined) {
      input.minLength = this.props.minLength;
    }
    if (this.props.maxLength !== undefined) {
      input.maxLength = this.props.maxLength;
    }
    
    // 숫자/날짜 관련 속성
    if (this.props.min !== undefined) {
      input.min = String(this.props.min);
    }
    if (this.props.max !== undefined) {
      input.max = String(this.props.max);
    }
    if (this.props.step !== undefined) {
      input.step = String(this.props.step);
    }
    
    // 패턴
    if (this.props.pattern) {
      input.pattern = this.props.pattern;
    }
    
    // 다중 선택
    if (this.props.multiple) {
      input.multiple = this.props.multiple;
    }
    
    // 파일 타입
    if (this.props.accept) {
      input.accept = this.props.accept;
    }
    
    // 접근성
    if (this.props.ariaLabel) {
      input.setAttribute('aria-label', this.props.ariaLabel);
    }
    if (this.props.ariaDescribedBy) {
      input.setAttribute('aria-describedby', this.props.ariaDescribedBy);
    }
    
    // 탭 인덱스
    if (this.props.tabIndex !== undefined) {
      input.tabIndex = this.props.tabIndex;
    }
    
    // 자동 포커스
    if (this.props.autofocus) {
      input.autofocus = true;
    }
  }

  private renderLabel(): void {
    if (!this.props.label) {
      if (this.labelElement) {
        this.labelElement.remove();
        this.labelElement = undefined;
      }
      return;
    }

    if (!this.labelElement) {
      this.labelElement = document.createElement('label');
      this.labelElement.className = 'input-label';
      this.containerElement.insertBefore(this.labelElement, this.inputElement);
    }

    this.labelElement.textContent = this.props.label;
    this.labelElement.htmlFor = this.inputElement.id;
    
    // 필수 표시
    if (this.props.required) {
      this.labelElement.classList.add('required');
      if (!this.labelElement.querySelector('.required-mark')) {
        const mark = document.createElement('span');
        mark.className = 'required-mark';
        mark.textContent = ' *';
        mark.setAttribute('aria-label', '필수 입력');
        this.labelElement.appendChild(mark);
      }
    } else {
      this.labelElement.classList.remove('required');
      const mark = this.labelElement.querySelector('.required-mark');
      if (mark) {
        mark.remove();
      }
    }
  }

  private renderIcon(): void {
    if (!this.props.icon) {
      if (this.iconElement) {
        this.iconElement.remove();
        this.iconElement = undefined;
      }
      return;
    }

    if (!this.iconElement) {
      this.iconElement = document.createElement('span');
      this.iconElement.className = 'input-icon';
      
      if (this.props.icon.position === 'left') {
        this.containerElement.insertBefore(this.iconElement, this.inputElement);
      } else {
        this.containerElement.appendChild(this.iconElement);
      }
    }

    this.iconElement.innerHTML = this.props.icon.content;
    this.iconElement.className = `input-icon icon-${this.props.icon.position}`;
    
    if (this.props.icon.clickable) {
      this.iconElement.classList.add('clickable');
      this.iconElement.setAttribute('role', 'button');
      this.iconElement.setAttribute('tabindex', '0');
    }
    
    if (this.props.icon.title) {
      this.iconElement.title = this.props.icon.title;
    }
  }

  private renderMessages(): void {
    const messages = this.getDisplayMessages();
    
    if (messages.length === 0) {
      if (this.messageElement) {
        this.messageElement.remove();
        this.messageElement = undefined;
      }
      if (this.helpTextElement) {
        this.helpTextElement.remove();
        this.helpTextElement = undefined;
      }
      return;
    }

    // 도움말 텍스트
    if (this.props.helpText && this.validationResult.state === 'idle') {
      if (!this.helpTextElement) {
        this.helpTextElement = document.createElement('span');
        this.helpTextElement.className = 'input-help-text';
        this.containerElement.appendChild(this.helpTextElement);
      }
      this.helpTextElement.textContent = this.props.helpText;
      this.helpTextElement.id = `${this.inputElement.id}-help`;
      this.inputElement.setAttribute('aria-describedby', this.helpTextElement.id);
    } else if (this.helpTextElement) {
      this.helpTextElement.remove();
      this.helpTextElement = undefined;
    }

    // 검증 메시지
    if (messages.length > 0) {
      if (!this.messageElement) {
        this.messageElement = document.createElement('span');
        this.messageElement.className = 'input-message';
        this.containerElement.appendChild(this.messageElement);
      }
      
      this.messageElement.textContent = messages[0] || '';
      this.messageElement.className = `input-message message-${this.validationResult.state}`;
      this.messageElement.id = `${this.inputElement.id}-message`;
      
      const ariaDescribedBy = [this.messageElement.id];
      if (this.helpTextElement) {
        ariaDescribedBy.push(this.helpTextElement.id);
      }
      this.inputElement.setAttribute('aria-describedby', ariaDescribedBy.join(' '));
      
      // 접근성 속성 설정
      if (this.validationResult.state === 'invalid') {
        this.inputElement.setAttribute('aria-invalid', 'true');
      } else {
        this.inputElement.removeAttribute('aria-invalid');
      }
    } else if (this.messageElement) {
      this.messageElement.remove();
      this.messageElement = undefined;
    }
  }

  private getDisplayMessages(): string[] {
    const messages: string[] = [];
    
    // 커스텀 메시지 우선
    if (this.props.errorMessage && this.validationResult.state === 'invalid') {
      messages.push(this.props.errorMessage);
    } else if (this.props.warningMessage && this.validationResult.state === 'warning') {
      messages.push(this.props.warningMessage);
    } else if (this.props.successMessage && this.validationResult.state === 'valid') {
      messages.push(this.props.successMessage);
    } else {
      // 검증 결과 메시지
      messages.push(...this.validationResult.errors, ...this.validationResult.warnings);
    }
    
    return messages;
  }

  private updateContainerClasses(): void {
    const container = this.containerElement;
    const classList = ['input-container', 'recursive-component', 'input'];
    
    // 크기
    if (this.props.size) {
      classList.push(`input-${this.props.size}`);
    }
    
    // 상태
    if (this.inputState.focused) classList.push('focused');
    if (this.inputState.disabled) classList.push('disabled');
    if (this.inputState.readonly) classList.push('readonly');
    if (this.inputState.required) classList.push('required');
    if (this.inputState.hasValue) classList.push('has-value');
    if (this.inputState.dirty) classList.push('dirty');
    if (this.inputState.touched) classList.push('touched');
    if (this.inputState.validating) classList.push('validating');
    
    // 검증 상태
    if (this.validationResult.state !== 'idle') {
      classList.push(`validation-${this.validationResult.state}`);
    }
    
    // 전체 너비
    if (this.props.fullWidth) {
      classList.push('full-width');
    }
    
    // 아이콘
    if (this.props.icon) {
      classList.push('has-icon', `icon-${this.props.icon.position}`);
    }
    
    // 커스텀 클래스
    if (this.props.className) {
      classList.push(...this.props.className.split(' '));
    }
    
    container.className = classList.join(' ');
  }

  private updateInputState(): void {
    this.inputState = {
      focused: document.activeElement === this.inputElement,
      disabled: this.props.disabled || false,
      readonly: this.props.readonly || false,
      required: this.props.required || false,
      validating: this.inputState.validating,
      hasValue: this.getValue().length > 0,
      dirty: this.inputState.dirty,
      touched: this.inputState.touched
    };
  }

  private updateMessageDisplay(): void {
    this.renderMessages();
  }

  private scheduleValidation(): void {
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
    }
    
    this.validationTimer = window.setTimeout(() => {
      this.validate();
    }, this.props.debounceTime || 300);
  }

  /**
   * 에러 처리
   */
  protected handleError(error: Error, context: string): void {
    console.error(`[Input] Error in ${context}:`, error);
    this.emit('error', { error, context, component: this });
  }

  /**
   * 정리
   */
  async destroy(): Promise<void> {
    // 타이머 정리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
    }

    // 이벤트 해제
    this.unbindEvents();

    await super.destroy();
  }
}

// =============================================================================
// 🎯 Input Manager
// =============================================================================

export class InputManager {
  private eventManager: EventManager;
  private inputs = new Map<string, Input>();
  private forms = new Map<string, Set<string>>();
  private defaultOptions: Partial<InputProps>;

  constructor(eventManager: EventManager, defaultOptions: Partial<InputProps> = {}) {
    this.eventManager = eventManager;
    this.defaultOptions = { ...Input.DEFAULT_PROPS, ...defaultOptions };
  }

  /**
   * 입력 생성 및 등록
   */
  create(id: string, element: HTMLElement, options: ComponentOptions = {}): Input {
    const mergedProps = { ...this.defaultOptions, ...(options as any).props };

    const input = new Input(element, mergedProps as InputProps, this.eventManager, options);
    this.inputs.set(id, input);

    return input;
  }

  /**
   * 입력 가져오기
   */
  get(id: string): Input | undefined {
    return this.inputs.get(id);
  }

  /**
   * 폼 그룹 생성
   */
  createForm(formId: string, inputIds: string[]): void {
    this.forms.set(formId, new Set(inputIds));
  }

  /**
   * 폼 검증
   */
  async validateForm(formId: string): Promise<{ isValid: boolean; results: Record<string, ValidationResult> }> {
    const inputIds = this.forms.get(formId);
    if (!inputIds) {
      throw new Error(`Form not found: ${formId}`);
    }

    const results: Record<string, ValidationResult> = {};
    let isValid = true;

    for (const inputId of inputIds) {
      const input = this.inputs.get(inputId);
      if (input) {
        const result = await input.validate();
        results[inputId] = result;
        if (!result.isValid) {
          isValid = false;
        }
      }
    }

    return { isValid, results };
  }

  /**
   * 폼 값 가져오기
   */
  getFormValues(formId: string): Record<string, string> {
    const inputIds = this.forms.get(formId);
    if (!inputIds) {
      throw new Error(`Form not found: ${formId}`);
    }

    const values: Record<string, string> = {};
    for (const inputId of inputIds) {
      const input = this.inputs.get(inputId);
      if (input) {
        values[inputId] = input.getValue();
      }
    }

    return values;
  }

  /**
   * 폼 값 설정
   */
  setFormValues(formId: string, values: Record<string, string | number>): void {
    const inputIds = this.forms.get(formId);
    if (!inputIds) {
      throw new Error(`Form not found: ${formId}`);
    }

    for (const inputId of inputIds) {
      const input = this.inputs.get(inputId);
      if (input && values[inputId] !== undefined) {
        input.setValue(values[inputId]);
      }
    }
  }

  /**
   * 폼 초기화
   */
  clearForm(formId: string): void {
    const inputIds = this.forms.get(formId);
    if (!inputIds) {
      throw new Error(`Form not found: ${formId}`);
    }

    for (const inputId of inputIds) {
      const input = this.inputs.get(inputId);
      if (input) {
        input.clear();
      }
    }
  }

  /**
   * 정리
   */
  destroy(): void {
    this.inputs.forEach(input => input.destroy());
    this.inputs.clear();
    this.forms.clear();
  }
}

// =============================================================================
// 🎯 Utility Functions
// =============================================================================

/**
 * 입력 컴포넌트 생성 헬퍼
 */
export function createInput(
  element: HTMLElement | string,
  options: Partial<InputProps> & { eventManager?: EventManager } = {}
): Input {
  const { eventManager, ...props } = options;
  const targetElement = typeof element === 'string' 
    ? document.querySelector(element) as HTMLElement
    : element;

  if (!targetElement) {
    throw new Error('Input element not found');
  }

  const mockEventManager = eventManager || { 
    emit: () => {}, 
    on: () => {}, 
    off: () => {}, 
    once: () => {} 
  } as unknown as EventManager;

  return new Input(targetElement, props as InputProps, mockEventManager, {});
}

/**
 * 폼 그룹 생성 헬퍼
 */
export function createInputForm(
  inputs: Array<{ element: HTMLElement; options?: Partial<InputProps> }>,
  formOptions: { eventManager?: EventManager } = {}
): Input[] {
  const { eventManager } = formOptions;
  const inputInstances: Input[] = [];

  inputs.forEach(({ element, options = {} }) => {
    const input = createInput(element, { ...options, ...(eventManager && { eventManager }) });
    inputInstances.push(input);
  });

  return inputInstances;
}

// =============================================================================
// 🎯 Common Validation Rules
// =============================================================================

/**
 * 공통 검증 규칙들
 */
export const ValidationRules = {
  /**
   * 필수 입력 검증
   */
  required: (message: string = '필수 입력 항목입니다.'): ValidationRule => ({
    name: 'required',
    validator: (value: string) => value.trim().length > 0,
    message
  }),

  /**
   * 최소 길이 검증
   */
  minLength: (length: number, message?: string): ValidationRule => ({
    name: 'minLength',
    validator: (value: string) => value.length >= length,
    message: message || `최소 ${length}자 이상 입력해주세요.`
  }),

  /**
   * 최대 길이 검증
   */
  maxLength: (length: number, message?: string): ValidationRule => ({
    name: 'maxLength',
    validator: (value: string) => value.length <= length,
    message: message || `최대 ${length}자까지 입력 가능합니다.`
  }),

  /**
   * 이메일 검증
   */
  email: (message: string = '유효한 이메일 주소를 입력해주세요.'): ValidationRule => ({
    name: 'email',
    validator: (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return !value || emailRegex.test(value);
    },
    message
  }),

  /**
   * 숫자 검증
   */
  numeric: (message: string = '숫자만 입력 가능합니다.'): ValidationRule => ({
    name: 'numeric',
    validator: (value: string) => {
      return !value || /^\d+$/.test(value);
    },
    message
  }),

  /**
   * 패턴 검증
   */
  pattern: (regex: RegExp, message: string): ValidationRule => ({
    name: 'pattern',
    validator: (value: string) => !value || regex.test(value),
    message
  }),

  /**
   * 비밀번호 강도 검증
   */
  passwordStrength: (message: string = '비밀번호는 8자 이상이며, 대소문자, 숫자, 특수문자를 포함해야 합니다.'): ValidationRule => ({
    name: 'passwordStrength',
    validator: (value: string) => {
      const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      return !value || strongRegex.test(value);
    },
    message
  })
}; 