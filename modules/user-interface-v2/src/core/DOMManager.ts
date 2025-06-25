type DOMElements = {
  header: HTMLElement | null;
  sidebar: HTMLElement | null;
  mainContent: HTMLElement | null;
  footer: HTMLElement | null;
  logContainer: HTMLElement | null;
};

class DOMManager {
  private static instance: DOMManager;
  private elements: DOMElements = {
    header: null,
    sidebar: null,
    mainContent: null,
    footer: null,
    logContainer: null
  };
  private initialized = false;

  private constructor() {}

  static getInstance(): DOMManager {
    if (!DOMManager.instance) {
      DOMManager.instance = new DOMManager();
    }
    return DOMManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // DOM 요소가 로드될 때까지 최대 3초 대기
    for (let i = 0; i < 30; i++) {
      this.elements.header = document.getElementById('header');
      this.elements.sidebar = document.getElementById('sidebar');
      this.elements.mainContent = document.getElementById('mainContent');
      this.elements.footer = document.getElementById('footer');
      this.elements.logContainer = document.getElementById('logContainer');

      if (this.elements.header && 
          this.elements.sidebar && 
          this.elements.mainContent && 
          this.elements.footer) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.elements.header || 
        !this.elements.sidebar || 
        !this.elements.mainContent || 
        !this.elements.footer) {
      console.error('Missing DOM elements:', {
        header: !!this.elements.header,
        sidebar: !!this.elements.sidebar,
        mainContent: !!this.elements.mainContent,
        footer: !!this.elements.footer
      });
      throw new Error('필수 DOM 요소를 찾을 수 없습니다.');
    }

    console.log('✅ DOM 요소 확인 완료');
    this.initialized = true;
  }

  getElement<K extends keyof DOMElements>(id: K): DOMElements[K] {
    if (!this.initialized) {
      throw new Error('DOMManager가 초기화되지 않았습니다.');
    }
    return this.elements[id];
  }

  createElement(tag: string, options: {
    className?: string;
    id?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  } = {}): HTMLElement {
    const element = document.createElement(tag);
    
    if (options.className) element.className = options.className;
    if (options.id) element.id = options.id;
    if (options.textContent) element.textContent = options.textContent;
    
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
    
    return element;
  }

  cleanup(): void {
    Object.keys(this.elements).forEach(key => {
      this.elements[key as keyof DOMElements] = null;
    });
    this.initialized = false;
  }
}

export const domManager = DOMManager.getInstance(); 