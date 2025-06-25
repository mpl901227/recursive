// ========================================
// Loader - 간단한 로딩 인디케이터 (V2 최적화)
// ========================================

export type LoaderType = 'spinner' | 'dots' | 'pulse';
export type LoaderSize = 'sm' | 'md' | 'lg';

export interface LoaderOptions {
  type?: LoaderType;
  size?: LoaderSize;
  color?: string;
  message?: string;
  overlay?: boolean;
}

export class Loader {
  private container: HTMLElement;
  private element: HTMLElement;
  private options: Required<LoaderOptions>;
  private isVisible = false;

  constructor(container: HTMLElement | string, options: LoaderOptions = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) as HTMLElement
      : container;

    if (!this.container) {
      throw new Error('Loader container not found');
    }

    this.options = {
      type: 'spinner',
      size: 'md',
      color: '#3b82f6',
      message: '',
      overlay: false,
      ...options
    };

    this.element = this.createElement();
    this.addStyles();
  }

  private createElement(): HTMLElement {
    const loader = document.createElement('div');
    loader.className = `loader loader-${this.options.type} loader-${this.options.size}`;
    
    if (this.options.overlay) {
      loader.classList.add('loader-overlay');
    }

    loader.innerHTML = this.createContent();
    loader.style.display = 'none';

    return loader;
  }

  private createContent(): string {
    const loaderContent = this.createLoaderContent();
    const message = this.options.message ? 
      `<div class="loader-message">${this.options.message}</div>` : '';

    return `
      <div class="loader-content">
        ${loaderContent}
        ${message}
      </div>
    `;
  }

  private createLoaderContent(): string {
    switch (this.options.type) {
      case 'spinner':
        return `<div class="spinner" style="border-top-color: ${this.options.color}"></div>`;
      
      case 'dots':
        return `
          <div class="dots">
            <div class="dot" style="background-color: ${this.options.color}"></div>
            <div class="dot" style="background-color: ${this.options.color}"></div>
            <div class="dot" style="background-color: ${this.options.color}"></div>
          </div>
        `;
      
      case 'pulse':
        return `<div class="pulse" style="background-color: ${this.options.color}"></div>`;
      
      default:
        return this.createLoaderContent();
    }
  }

  private addStyles(): void {
    const styleId = 'loader-styles';
    if (document.querySelector(`#${styleId}`)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .loader {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }

      .loader-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.9);
        z-index: 1000;
      }

      .loader-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
      }

      .loader-message {
        font-size: 0.875rem;
        color: #6b7280;
        text-align: center;
      }

      /* Spinner */
      .spinner {
        border: 2px solid #f3f4f6;
        border-radius: 50%;
        border-top: 2px solid #3b82f6;
        animation: spin 1s linear infinite;
      }

      .loader-sm .spinner {
        width: 1rem;
        height: 1rem;
      }

      .loader-md .spinner {
        width: 2rem;
        height: 2rem;
      }

      .loader-lg .spinner {
        width: 3rem;
        height: 3rem;
      }

      /* Dots */
      .dots {
        display: flex;
        gap: 0.25rem;
      }

      .dot {
        border-radius: 50%;
        background-color: #3b82f6;
        animation: dot-bounce 1.4s ease-in-out infinite both;
      }

      .loader-sm .dot {
        width: 0.5rem;
        height: 0.5rem;
      }

      .loader-md .dot {
        width: 0.75rem;
        height: 0.75rem;
      }

      .loader-lg .dot {
        width: 1rem;
        height: 1rem;
      }

      .dot:nth-child(1) { animation-delay: -0.32s; }
      .dot:nth-child(2) { animation-delay: -0.16s; }
      .dot:nth-child(3) { animation-delay: 0s; }

      /* Pulse */
      .pulse {
        border-radius: 50%;
        background-color: #3b82f6;
        animation: pulse 2s ease-in-out infinite;
      }

      .loader-sm .pulse {
        width: 2rem;
        height: 2rem;
      }

      .loader-md .pulse {
        width: 3rem;
        height: 3rem;
      }

      .loader-lg .pulse {
        width: 4rem;
        height: 4rem;
      }

      /* Animations */
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @keyframes dot-bounce {
        0%, 80%, 100% {
          transform: scale(0);
        }
        40% {
          transform: scale(1);
        }
      }

      @keyframes pulse {
        0% {
          transform: scale(0);
          opacity: 1;
        }
        100% {
          transform: scale(1);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  show(): void {
    if (this.isVisible) return;

    this.container.appendChild(this.element);
    this.element.style.display = 'flex';
    this.isVisible = true;
  }

  hide(): void {
    if (!this.isVisible) return;

    this.element.style.display = 'none';
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.isVisible = false;
  }

  setMessage(message: string): void {
    this.options.message = message;
    const messageElement = this.element.querySelector('.loader-message');
    
    if (message) {
      if (messageElement) {
        messageElement.textContent = message;
      } else {
        const content = this.element.querySelector('.loader-content');
        if (content) {
          content.innerHTML += `<div class="loader-message">${message}</div>`;
        }
      }
    } else if (messageElement) {
      messageElement.remove();
    }
  }

  setType(type: LoaderType): void {
    this.options.type = type;
    this.element.className = `loader loader-${type} loader-${this.options.size}`;
    if (this.options.overlay) {
      this.element.classList.add('loader-overlay');
    }
    
    const content = this.element.querySelector('.loader-content');
    if (content) {
      content.innerHTML = this.createLoaderContent() + 
        (this.options.message ? `<div class="loader-message">${this.options.message}</div>` : '');
    }
  }

  isShowing(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    this.hide();
  }
}

// 편의 클래스 - 전역 로더 관리
class LoaderManager {
  private loaders = new Map<string, Loader>();
  private globalLoader: Loader | null = null;

  createLoader(id: string, container: HTMLElement | string, options?: LoaderOptions): Loader {
    const loader = new Loader(container, options);
    this.loaders.set(id, loader);
    return loader;
  }

  getLoader(id: string): Loader | undefined {
    return this.loaders.get(id);
  }

  showLoader(id: string): void {
    const loader = this.loaders.get(id);
    if (loader) {
      loader.show();
    }
  }

  hideLoader(id: string): void {
    const loader = this.loaders.get(id);
    if (loader) {
      loader.hide();
    }
  }

  // 전역 로더 (페이지 전체 오버레이)
  showGlobalLoader(message?: string): void {
    if (!this.globalLoader) {
      this.globalLoader = new Loader(document.body, {
        overlay: true,
        message: message || '로딩 중...',
        size: 'lg'
      });
    } else if (message) {
      this.globalLoader.setMessage(message);
    }
    
    this.globalLoader.show();
  }

  hideGlobalLoader(): void {
    if (this.globalLoader) {
      this.globalLoader.hide();
    }
  }

  // 모든 로더 정리
  destroyAll(): void {
    this.loaders.forEach(loader => loader.destroy());
    this.loaders.clear();
    
    if (this.globalLoader) {
      this.globalLoader.destroy();
      this.globalLoader = null;
    }
  }
}

// 전역 인스턴스
export const loaderManager = new LoaderManager();

// 편의 함수들
export const createLoader = (container: HTMLElement | string, options?: LoaderOptions): Loader => {
  return new Loader(container, options);
};

export const showGlobalLoader = (message?: string): void => {
  loaderManager.showGlobalLoader(message);
};

export const hideGlobalLoader = (): void => {
  loaderManager.hideGlobalLoader();
}; 