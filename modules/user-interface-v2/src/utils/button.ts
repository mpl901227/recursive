// ========================================
// Button - 간단한 버튼 컴포넌트 (V2 최적화)
// ========================================

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: (event: Event) => void | Promise<void>;
}

export class Button {
  private element: HTMLButtonElement;
  private options: Required<ButtonOptions>;
  private isLoading = false;
  private originalText = '';

  constructor(element: HTMLButtonElement | string, options: ButtonOptions = {}) {
    this.element = typeof element === 'string' 
      ? document.querySelector(element) as HTMLButtonElement
      : element;

    if (!this.element) {
      throw new Error('Button element not found');
    }

    this.options = {
      variant: 'secondary',
      size: 'md',
      disabled: false,
      loading: false,
      fullWidth: false,
      onClick: () => {},
      ...options
    };

    this.originalText = this.element.textContent || '';
    this.initialize();
  }

  private initialize(): void {
    this.updateClasses();
    this.updateStyles();
    this.bindEvents();
    this.updateState();
  }

  private updateClasses(): void {
    const baseClass = 'btn';
    const variantClass = `btn-${this.options.variant}`;
    const sizeClass = `btn-${this.options.size}`;
    
    this.element.className = [
      baseClass,
      variantClass,
      sizeClass,
      this.options.fullWidth ? 'btn-full' : '',
      this.isLoading ? 'btn-loading' : '',
      this.options.disabled ? 'btn-disabled' : ''
    ].filter(Boolean).join(' ');
  }

  private updateStyles(): void {
    // 기본 스타일
    const baseStyles = `
      border: none;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      outline: none;
      box-sizing: border-box;
    `;

    // 크기별 스타일
    const sizeStyles = {
      sm: 'padding: 0.5rem 0.75rem; font-size: 0.875rem;',
      md: 'padding: 0.625rem 1rem; font-size: 1rem;',
      lg: 'padding: 0.75rem 1.25rem; font-size: 1.125rem;'
    };

    // 변형별 스타일
    const variantStyles = {
      primary: `
        background-color: #3b82f6;
        color: white;
      `,
      secondary: `
        background-color: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
      `,
      danger: `
        background-color: #ef4444;
        color: white;
      `,
      success: `
        background-color: #10b981;
        color: white;
      `
    };

    // 전체 너비
    const fullWidthStyle = this.options.fullWidth ? 'width: 100%;' : '';

    // 비활성화/로딩 스타일
    const disabledStyle = (this.options.disabled || this.isLoading) ? `
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: none;
    ` : '';

    this.element.style.cssText = [
      baseStyles,
      sizeStyles[this.options.size],
      variantStyles[this.options.variant],
      fullWidthStyle,
      disabledStyle
    ].join('');

    // 호버 효과 (CSS로 추가)
    this.addHoverStyles();
  }

  private addHoverStyles(): void {
    const styleId = 'btn-hover-styles';
    if (document.querySelector(`#${styleId}`)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .btn:not(.btn-disabled):not(.btn-loading):hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      
      .btn:not(.btn-disabled):not(.btn-loading):active {
        transform: translateY(0);
      }
      
      .btn-primary:not(.btn-disabled):not(.btn-loading):hover {
        background-color: #2563eb;
      }
      
      .btn-secondary:not(.btn-disabled):not(.btn-loading):hover {
        background-color: #e5e7eb;
      }
      
      .btn-danger:not(.btn-disabled):not(.btn-loading):hover {
        background-color: #dc2626;
      }
      
      .btn-success:not(.btn-disabled):not(.btn-loading):hover {
        background-color: #059669;
      }
    `;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    this.element.addEventListener('click', this.handleClick.bind(this));
  }

  private async handleClick(event: Event): Promise<void> {
    if (this.options.disabled || this.isLoading) {
      event.preventDefault();
      return;
    }

    if (this.options.onClick) {
      try {
        await this.options.onClick(event);
      } catch (error) {
        console.error('Button click handler error:', error);
      }
    }
  }

  private updateState(): void {
    this.element.disabled = this.options.disabled || this.isLoading;
    this.updateClasses();
    this.updateStyles();
  }

  // 공용 메서드들
  setLoading(loading: boolean, loadingText = '로딩 중...'): void {
    this.isLoading = loading;
    
    if (loading) {
      this.element.innerHTML = `
        <span style="
          display: inline-block;
          width: 1rem;
          height: 1rem;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></span>
        ${loadingText}
      `;
      
      // 스핀 애니메이션 추가
      this.addSpinAnimation();
    } else {
      this.element.textContent = this.originalText;
    }
    
    this.updateState();
  }

  private addSpinAnimation(): void {
    const styleId = 'btn-spin-animation';
    if (document.querySelector(`#${styleId}`)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(style);
  }

  setDisabled(disabled: boolean): void {
    this.options.disabled = disabled;
    this.updateState();
  }

  setVariant(variant: ButtonVariant): void {
    this.options.variant = variant;
    this.updateClasses();
    this.updateStyles();
  }

  setText(text: string): void {
    this.originalText = text;
    if (!this.isLoading) {
      this.element.textContent = text;
    }
  }

  click(): void {
    this.element.click();
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    this.element.removeEventListener('click', this.handleClick.bind(this));
  }

  // 편의 메서드들
  async executeWithLoading<T>(asyncFn: () => Promise<T>, loadingText?: string): Promise<T> {
    this.setLoading(true, loadingText);
    try {
      return await asyncFn();
    } finally {
      this.setLoading(false);
    }
  }
}

// 편의 함수들
export const createButton = (element: HTMLButtonElement | string, options?: ButtonOptions): Button => {
  return new Button(element, options);
};

export const createPrimaryButton = (element: HTMLButtonElement | string, options?: Omit<ButtonOptions, 'variant'>): Button => {
  return new Button(element, { ...options, variant: 'primary' });
};

export const createDangerButton = (element: HTMLButtonElement | string, options?: Omit<ButtonOptions, 'variant'>): Button => {
  return new Button(element, { ...options, variant: 'danger' });
}; 