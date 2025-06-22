/**
 * @fileoverview Modal Component
 * @description 재사용 가능한 모달 다이얼로그 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent } from '../../base/component.js';
import type { ComponentProps, ComponentState } from '../../../types/index.js';

/**
 * 모달 타입 정의
 */
export const MODAL_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning', 
  ERROR: 'error',
  CONFIRM: 'confirm',
  CUSTOM: 'custom'
} as const;

export type ModalType = typeof MODAL_TYPES[keyof typeof MODAL_TYPES];

/**
 * 모달 크기
 */
export const MODAL_SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  FULL: 'full',
  FULLSCREEN: 'fullscreen'
} as const;

export type ModalSize = typeof MODAL_SIZES[keyof typeof MODAL_SIZES];

/**
 * 애니메이션 타입
 */
export const ANIMATION_TYPES = {
  FADE: 'fade',
  SLIDE_DOWN: 'slide-down',
  SLIDE_UP: 'slide-up',
  ZOOM: 'zoom',
  BOUNCE: 'bounce'
} as const;

export type AnimationType = typeof ANIMATION_TYPES[keyof typeof ANIMATION_TYPES];

/**
 * 버튼 설정 인터페이스
 */
export interface ModalButton {
  text: string;
  action?: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  className?: string;
}

/**
 * 모달 콘텐츠 인터페이스
 */
export interface ModalContent {
  title?: string;
  message?: string;
  html?: string;
  buttons?: ModalButton[];
}

/**
 * Modal 컴포넌트 속성
 */
export interface ModalProps extends ComponentProps {
  type?: ModalType;
  size?: ModalSize;
  animation?: AnimationType;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  backdrop?: boolean;
  centered?: boolean;
  scrollable?: boolean;
  persistent?: boolean;
  zIndex?: number;
  content?: ModalContent;
  onShow?: () => void;
  onShown?: () => void;
  onHide?: () => void;
  onHidden?: () => void;
}

/**
 * Modal 컴포넌트
 */
export class Modal extends BaseComponent<HTMLElement, ModalProps> {
  protected state: ComponentState = 'idle';
  
  private isOpen: boolean = false;
  private isClosing: boolean = false;
  private focusableElements: HTMLElement[] = [];
  private previousActiveElement: HTMLElement | null = null;

  private modalContent: HTMLElement | null = null;
  private modalHeader: HTMLElement | null = null;
  private modalBody: HTMLElement | null = null;
  private modalFooter: HTMLElement | null = null;
  private closeButton: HTMLElement | null = null;

  private boundHandlers = {
    backdropClick: this.handleBackdropClick.bind(this),
    keydown: this.handleKeydown.bind(this),
    resize: this.handleResize.bind(this),
    closeClick: this.handleCloseClick.bind(this)
  };

  constructor(container: HTMLElement, props: ModalProps = {}, eventManager?: any) {
    const defaultProps: ModalProps = {
      className: '',
      style: {},
      dataset: {},
      ariaLabel: 'Modal',
      role: 'dialog',
      type: MODAL_TYPES.INFO,
      size: MODAL_SIZES.MEDIUM,
      animation: ANIMATION_TYPES.FADE,
      closeOnBackdrop: true,
      closeOnEscape: true,
      showCloseButton: true,
      backdrop: true,
      centered: true,
      scrollable: false,
      persistent: false,
      zIndex: 1050,
      ...props
    };

    super(container, defaultProps, eventManager);
  }

  protected createMarkup(): string {
    const { type, size, centered, scrollable } = this.props;
    
    const modalClasses = [
      'modal',
      `modal-${type}`,
      `modal-${size}`,
      centered ? 'modal-centered' : '',
      scrollable ? 'modal-scrollable' : ''
    ].filter(Boolean).join(' ');

    const closeButton = this.props.showCloseButton 
      ? '<button class="modal-close" type="button" aria-label="닫기">&times;</button>'
      : '';

    return `
      <div class="${modalClasses}" style="display: none; z-index: ${this.props.zIndex}">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <div class="modal-icon"></div>
              <h3 class="modal-title"></h3>
              ${closeButton}
            </div>
            <div class="modal-body">
              <div class="modal-message"></div>
            </div>
            <div class="modal-footer">
              <!-- 버튼들이 동적으로 추가됩니다 -->
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render(): void {
    try {
      this.element.innerHTML = this.createMarkup();
      this.cacheElements();
      this.updateContent();
      this.updateClasses();
    } catch (error) {
      this.handleError(error as Error, 'render');
    }
  }

  public bindEvents(): void {
    if (!this.element) return;

    // 백드롭 클릭
    if (this.props.closeOnBackdrop) {
      this.addDOMEventListener(this.element, 'click', this.boundHandlers.backdropClick);
    }

    // ESC 키
    if (this.props.closeOnEscape) {
      this.addDOMEventListener(document, 'keydown', this.boundHandlers.keydown as EventListener);
    }

    // 닫기 버튼
    if (this.closeButton) {
      this.addDOMEventListener(this.closeButton, 'click', this.boundHandlers.closeClick as EventListener);
    }

    // 창 크기 변경
    this.addDOMEventListener(window, 'resize', this.boundHandlers.resize as EventListener);
  }

  private cacheElements(): void {
    this.modalContent = this.element.querySelector('.modal-content');
    this.modalHeader = this.element.querySelector('.modal-header');
    this.modalBody = this.element.querySelector('.modal-body .modal-message');
    this.modalFooter = this.element.querySelector('.modal-footer');
    this.closeButton = this.element.querySelector('.modal-close');
  }

  private updateContent(): void {
    if (!this.props.content) return;

    const { title, message, html, buttons } = this.props.content;

    // 제목 설정
    if (title && this.modalHeader) {
      const titleElement = this.modalHeader.querySelector('.modal-title');
      if (titleElement) {
        titleElement.textContent = title;
      }
    }

    // 내용 설정
    if (this.modalBody) {
      if (html) {
        this.modalBody.innerHTML = html;
      } else if (message) {
        this.modalBody.textContent = message;
      }
    }

    // 버튼 설정
    if (buttons && this.modalFooter) {
      this.setButtons(buttons);
    }

    // 아이콘 설정
    this.updateIcon();
  }

  private updateIcon(): void {
    const iconElement = this.modalHeader?.querySelector('.modal-icon');
    if (!iconElement) return;

    const iconMap: Record<string, string> = {
      [MODAL_TYPES.INFO]: 'icon-info',
      [MODAL_TYPES.SUCCESS]: 'icon-success',
      [MODAL_TYPES.WARNING]: 'icon-warning',
      [MODAL_TYPES.ERROR]: 'icon-error',
      [MODAL_TYPES.CONFIRM]: 'icon-question'
    };

    const iconClass = iconMap[this.props.type!];
    if (iconClass) {
      iconElement.className = `modal-icon ${iconClass}`;
    }
  }

  private updateClasses(): void {
    const { type, size, animation, backdrop } = this.props;
    
    this.element.className = [
      'modal',
      `modal-${type}`,
      `modal-${size}`,
      animation ? `animation-${animation}` : '',
      backdrop ? 'modal-backdrop' : '',
      this.props.className || ''
    ].filter(Boolean).join(' ');
  }

  private setButtons(buttons: ModalButton[]): void {
    if (!this.modalFooter) return;

    this.modalFooter.innerHTML = '';

    buttons.forEach((button, index) => {
      const buttonElement = this.createButton(button, index);
      this.modalFooter!.appendChild(buttonElement);
    });
  }

  private createButton(config: ModalButton, index: number): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = config.text;
    button.className = [
      'btn',
      `btn-${config.variant || 'secondary'}`,
      config.className || ''
    ].filter(Boolean).join(' ');

    if (config.disabled) {
      button.disabled = true;
    }

    // 버튼 클릭 이벤트
    button.addEventListener('click', async () => {
      try {
        if (config.action) {
          await config.action();
        }
        
        // 기본적으로 모달을 닫음 (persistent가 아닌 경우)
        if (!this.props.persistent) {
          await this.hide();
        }
      } catch (error) {
        this.handleError(error as Error, `button-${index}-click`);
      }
    });

    return button;
  }

  /**
   * 모달 표시
   */
  async show(content?: ModalContent): Promise<void> {
    if (this.isOpen) return;

    try {
      this.state = 'loading';
      
      // 콘텐츠 업데이트
      if (content) {
        this.props.content = content;
        this.updateContent();
      }

      // 이전 포커스 저장
      this.previousActiveElement = document.activeElement as HTMLElement;

      // onShow 콜백
      this.props.onShow?.();

      // 모달 표시
      this.element.style.display = 'flex';
      this.element.setAttribute('aria-hidden', 'false');
      
      // 포커스 관리
      this.updateFocusableElements();
      this.manageFocus();

      // 애니메이션
      await this.animate('show');

      this.isOpen = true;
      this.state = 'ready';

      // onShown 콜백
      this.props.onShown?.();

      // 이벤트 발생
      this.emit('modal:shown', { modal: this });

    } catch (error) {
      this.state = 'error';
      this.handleError(error as Error, 'show');
      throw error;
    }
  }

  /**
   * 모달 숨김
   */
  async hide(): Promise<void> {
    if (!this.isOpen || this.isClosing) return;

    try {
      this.isClosing = true;
      this.state = 'loading';

      // onHide 콜백
      this.props.onHide?.();

      // 애니메이션
      await this.animate('hide');

      // 모달 숨김
      this.element.style.display = 'none';
      this.element.setAttribute('aria-hidden', 'true');

      // 포커스 복원
      if (this.previousActiveElement) {
        this.previousActiveElement.focus();
        this.previousActiveElement = null;
      }

      this.isOpen = false;
      this.isClosing = false;
      this.state = 'idle';

      // onHidden 콜백
      this.props.onHidden?.();

      // 이벤트 발생
      this.emit('modal:hidden', { modal: this });

    } catch (error) {
      this.state = 'error';
      this.isClosing = false;
      this.handleError(error as Error, 'hide');
      throw error;
    }
  }

  private async animate(direction: 'show' | 'hide'): Promise<void> {
    const { animation } = this.props;
    if (!animation || !this.modalContent) return;

    return new Promise<void>((resolve) => {
      const animationClass = direction === 'show' ? 'entering' : 'exiting';
      
      this.element.classList.add(animationClass);

      const handleAnimationEnd = () => {
        this.element.classList.remove(animationClass);
        this.modalContent!.removeEventListener('animationend', handleAnimationEnd);
        resolve();
      };

      this.modalContent?.addEventListener('animationend', handleAnimationEnd);

      // 애니메이션이 없는 경우 대비
      setTimeout(() => {
        if (this.element.classList.contains(animationClass)) {
          handleAnimationEnd();
        }
      }, 300);
    });
  }

  private manageFocus(): void {
    if (this.focusableElements.length > 0) {
      this.focusableElements[0]?.focus();
    } else if (this.modalContent) {
      this.modalContent.focus();
    }
  }

  private updateFocusableElements(): void {
    if (!this.modalContent) return;

    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    this.focusableElements = Array.from(
      this.modalContent.querySelectorAll(focusableSelectors)
    ) as HTMLElement[];
  }

  private handleBackdropClick(event: Event): void {
    if (event.target === this.element && this.props.closeOnBackdrop) {
      this.hide().catch(error => {
        this.handleError(error, 'backdrop-click');
      });
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    if (event.key === 'Escape' && this.props.closeOnEscape) {
      event.preventDefault();
      this.hide().catch(error => {
        this.handleError(error, 'escape-key');
      });
    }

    if (event.key === 'Tab') {
      this.handleTabKey(event);
    }
  }

  private handleTabKey(event: KeyboardEvent): void {
    if (this.focusableElements.length === 0) return;

    const firstElement = this.focusableElements[0];
    const lastElement = this.focusableElements[this.focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }

  private handleCloseClick(_event: Event): void {
    this.hide().catch(error => {
      this.handleError(error, 'close-button');
    });
  }

  private handleResize(): void {
    // 모달이 열려있을 때만 처리
    if (this.isOpen) {
      this.centerModal();
    }
  }

  private centerModal(): void {
    // CSS로 처리되므로 별도 작업 불필요
    // 필요시 JavaScript로 위치 조정 가능
  }

  /**
   * 모달 상태 확인
   */
  isVisible(): boolean {
    return this.isOpen;
  }

  /**
   * 콘텐츠 업데이트
   */
  setContent(content: ModalContent): void {
    this.props.content = content;
    this.updateContent();
  }

  async destroy(): Promise<void> {
    if (this.isOpen) {
      await this.hide();
    }
    await super.destroy();
  }
}

/**
 * 모달 매니저 클래스
 */
export class ModalManager {
  private modals: Modal[] = [];
  private eventManager: any = null;

  setEventManager(eventManager: any): void {
    this.eventManager = eventManager;
  }

  /**
   * 새 모달 생성
   */
  create(options: ModalProps = {}): Modal {
    // 모달 컨테이너 생성
    const container = document.createElement('div');
    container.id = `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    document.body.appendChild(container);

    const modal = new Modal(container, options, this.eventManager);
    this.modals.push(modal);

    return modal;
  }

  /**
   * 모든 모달 닫기
   */
  async closeAll(): Promise<void> {
    const openModals = this.modals.filter(modal => modal.isVisible());
    await Promise.all(openModals.map(modal => modal.hide()));
  }

  /**
   * 활성 모달 반환
   */
  getActiveModals(): Modal[] {
    return this.modals.filter(modal => modal.isVisible());
  }

  /**
   * 매니저 정리
   */
  async destroy(): Promise<void> {
    await Promise.all(this.modals.map(modal => modal.destroy()));
    this.modals = [];
  }
}

// 기본 모달 매니저 인스턴스
export const modalManager = new ModalManager(); 