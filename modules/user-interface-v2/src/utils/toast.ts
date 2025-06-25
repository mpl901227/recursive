// ========================================
// Toast - 간단한 알림 시스템 (V2 최적화)
// ========================================

export type ToastType = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  position?: ToastPosition;
  closable?: boolean;
  showIcon?: boolean;
}

export interface ToastConfig extends ToastOptions {
  message: string;
  id: string;
}

class ToastManager {
  private toasts = new Map<string, HTMLElement>();
  private container: HTMLElement | null = null;
  private counter = 0;

  private getOrCreateContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.style.cssText = `
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 9999;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  private getIcon(type: ToastType): string {
    const icons = {
      info: '🔵',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type];
  }

  private getTypeClass(type: ToastType): string {
    return `toast-${type}`;
  }

  show(message: string, options: ToastOptions = {}): string {
    const id = `toast-${++this.counter}`;
    const config: ToastConfig = {
      message,
      id,
      type: options.type || 'info',
      duration: options.duration || 4000,
      position: options.position || 'top-right',
      closable: options.closable !== false,
      showIcon: options.showIcon !== false
    };

    const toastElement = this.createToastElement(config);
    const container = this.getOrCreateContainer();
    
    container.appendChild(toastElement);
    this.toasts.set(id, toastElement);

    // 애니메이션 트리거
    requestAnimationFrame(() => {
      toastElement.classList.add('toast-show');
    });

    // 자동 제거
    if (config.duration && config.duration > 0) {
      setTimeout(() => this.hide(id), config.duration);
    }

    return id;
  }

  private createToastElement(config: ToastConfig): HTMLElement {
    const toast = document.createElement('div');
    const safeType = config.type || 'info';
    toast.className = `toast ${this.getTypeClass(safeType)}`;
    toast.style.cssText = `
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      padding: 1rem;
      margin-bottom: 0.5rem;
      pointer-events: auto;
      transform: translateX(100%);
      transition: all 0.3s ease;
      opacity: 0;
      max-width: 400px;
      border-left: 4px solid;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    `;

    // 타입별 색상
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    toast.style.borderLeftColor = colors[safeType];

    let html = '';
    
    if (config.showIcon) {
      html += `<span class="toast-icon">${this.getIcon(safeType)}</span>`;
    }

    html += `<span class="toast-message" style="flex: 1;">${config.message}</span>`;

    if (config.closable) {
      html += `<button class="toast-close" style="
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        opacity: 0.5;
        padding: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
      ">×</button>`;
    }

    toast.innerHTML = html;

    // 닫기 버튼 이벤트
    if (config.closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn?.addEventListener('click', () => this.hide(config.id));
    }

    return toast;
  }

  hide(id: string): void {
    const toast = this.toasts.get(id);
    if (!toast) return;

    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts.delete(id);
    }, 300);
  }

  // 편의 메서드들
  info(message: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(message, { ...options, type: 'info' });
  }

  success(message: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(message, { ...options, type: 'success' });
  }

  warning(message: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(message, { ...options, type: 'warning' });
  }

  error(message: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(message, { ...options, type: 'error' });
  }

  clear(): void {
    this.toasts.forEach((toast, id) => this.hide(id));
  }

  destroy(): void {
    this.clear();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// 전역 인스턴스
export const toast = new ToastManager();

// CSS 추가 (동적으로)
const addToastStyles = () => {
  if (document.querySelector('#toast-styles')) return;

  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    .toast-show {
      transform: translateX(0) !important;
      opacity: 1 !important;
    }
    
    .toast:hover {
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }
  `;
  document.head.appendChild(style);
};

// DOM이 준비되면 스타일 추가
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addToastStyles);
} else {
  addToastStyles();
} 