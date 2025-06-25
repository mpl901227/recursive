// ============================================
// Component Factory - 유형화된 컴포넌트 시스템
// ============================================

export interface ComponentConfig {
  variant?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  className?: string;
  attributes?: Record<string, string>;
  children?: string | HTMLElement | HTMLElement[];
}

export interface ButtonConfig extends ComponentConfig {
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  onClick?: () => void;
}

export interface CardConfig extends ComponentConfig {
  header?: string;
  footer?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface InputConfig extends ComponentConfig {
  type?: string;
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface ModalConfig extends ComponentConfig {
  title?: string;
  closable?: boolean;
  backdrop?: boolean;
  width?: string;
}

export interface StatCardConfig extends ComponentConfig {
  value: string | number;
  label: string;
  icon?: string;
}

export interface FilterConfig extends ComponentConfig {
  label: string;
  options: Array<{ value: string; text: string }>;
  onChange?: (value: string) => void;
}

export interface TextareaConfig extends ComponentConfig {
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
}

export interface MessageConfig extends ComponentConfig {
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  avatar?: string;
  metadata?: any;
}

export class ComponentFactory {
  private static baseClasses = {
    button: 'btn',
    card: 'card',
    input: 'input',
    modal: 'modal',
    badge: 'badge',
    alert: 'alert',
    loader: 'loader',
    statCard: 'stat-card',
    filter: 'filter-group',
    textarea: 'textarea',
    message: 'message'
  };

  /**
   * 버튼 컴포넌트 생성
   */
  static createButton(config: ButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    
    // 기본 클래스 설정
    const classes = [this.baseClasses.button];
    
    // 변형 클래스 추가
    if (config.variant) classes.push(`btn--${config.variant}`);
    if (config.size) classes.push(`btn--${config.size}`);
    if (config.color) classes.push(`btn--${config.color}`);
    if (config.className) classes.push(config.className);
    
    button.className = classes.join(' ');
    
    // 속성 설정
    button.type = config.type || 'button';
    if (config.disabled) button.disabled = true;
    
    // 내용 설정
    let content = '';
    
    if (config.loading) {
      content += '<span class="btn__loader"></span>';
    }
    
    if (config.icon && config.iconPosition !== 'right') {
      content += `<span class="btn__icon">${config.icon}</span>`;
    }
    
    if (typeof config.children === 'string') {
      content += `<span class="btn__text">${config.children}</span>`;
    }
    
    if (config.icon && config.iconPosition === 'right') {
      content += `<span class="btn__icon">${config.icon}</span>`;
    }
    
    button.innerHTML = content;
    
    // 추가 속성 설정
    if (config.attributes) {
      Object.entries(config.attributes).forEach(([key, value]) => {
        button.setAttribute(key, value);
      });
    }
    
    // 클릭 이벤트 설정
    if (config.onClick) {
      button.addEventListener('click', config.onClick);
    }
    
    return button;
  }

  /**
   * 카드 컴포넌트 생성
   */
  static createCard(config: CardConfig): HTMLDivElement {
    const card = document.createElement('div');
    
    const classes = [this.baseClasses.card];
    if (config.variant) classes.push(`card--${config.variant}`);
    if (config.size) classes.push(`card--${config.size}`);
    if (config.padding) classes.push(`card--padding-${config.padding}`);
    if (config.className) classes.push(config.className);
    
    card.className = classes.join(' ');
    
    let content = '';
    
    if (config.header) {
      content += `<div class="card__header">${config.header}</div>`;
    }
    
    content += '<div class="card__body">';
    if (typeof config.children === 'string') {
      content += config.children;
    }
    content += '</div>';
    
    if (config.footer) {
      content += `<div class="card__footer">${config.footer}</div>`;
    }
    
    card.innerHTML = content;
    
    // HTMLElement나 HTMLElement[] 처리
    if (config.children instanceof HTMLElement) {
      const body = card.querySelector('.card__body')!;
      body.innerHTML = '';
      body.appendChild(config.children);
    } else if (Array.isArray(config.children)) {
      const body = card.querySelector('.card__body')!;
      body.innerHTML = '';
      config.children.forEach(child => body.appendChild(child));
    }
    
    return card;
  }

  /**
   * 입력 필드 컴포넌트 생성
   */
  static createInput(config: InputConfig): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';
    
    let content = '';
    
    if (config.label) {
      content += `<label class="input__label">${config.label}${config.required ? ' *' : ''}</label>`;
    }
    
    const classes = [this.baseClasses.input];
    if (config.size) classes.push(`input--${config.size}`);
    if (config.variant) classes.push(`input--${config.variant}`);
    if (config.error) classes.push('input--error');
    if (config.disabled) classes.push('input--disabled');
    if (config.className) classes.push(config.className);
    
    content += `<input 
      type="${config.type || 'text'}"
      class="${classes.join(' ')}"
      ${config.placeholder ? `placeholder="${config.placeholder}"` : ''}
      ${config.required ? 'required' : ''}
      ${config.disabled ? 'disabled' : ''}
    />`;
    
    if (config.error) {
      content += `<div class="input__error">${config.error}</div>`;
    }
    
    wrapper.innerHTML = content;
    
    if (config.attributes) {
      const input = wrapper.querySelector('input')!;
      Object.entries(config.attributes).forEach(([key, value]) => {
        input.setAttribute(key, value);
      });
    }
    
    return wrapper;
  }

  /**
   * 모달 컴포넌트 생성
   */
  static createModal(config: ModalConfig): HTMLDivElement {
    const modal = document.createElement('div');
    
    const classes = [this.baseClasses.modal];
    if (config.size) classes.push(`modal--${config.size}`);
    if (config.className) classes.push(config.className);
    
    modal.className = classes.join(' ');
    
    let content = `
      ${config.backdrop !== false ? '<div class="modal__backdrop"></div>' : ''}
      <div class="modal__dialog" ${config.width ? `style="width: ${config.width}"` : ''}>
        <div class="modal__content">
    `;
    
    if (config.title || config.closable !== false) {
      content += '<div class="modal__header">';
      if (config.title) {
        content += `<h3 class="modal__title">${config.title}</h3>`;
      }
      if (config.closable !== false) {
        content += '<button class="modal__close" type="button">&times;</button>';
      }
      content += '</div>';
    }
    
    content += '<div class="modal__body">';
    if (typeof config.children === 'string') {
      content += config.children;
    }
    content += '</div>';
    
    content += '</div></div>';
    
    modal.innerHTML = content;
    
    // HTMLElement나 HTMLElement[] 처리
    if (config.children instanceof HTMLElement) {
      const body = modal.querySelector('.modal__body')!;
      body.innerHTML = '';
      body.appendChild(config.children);
    } else if (Array.isArray(config.children)) {
      const body = modal.querySelector('.modal__body')!;
      body.innerHTML = '';
      config.children.forEach(child => body.appendChild(child));
    }
    
    // 닫기 기능 추가
    if (config.closable !== false) {
      const closeBtn = modal.querySelector('.modal__close');
      const backdrop = modal.querySelector('.modal__backdrop');
      
      const closeModal = () => modal.remove();
      
      closeBtn?.addEventListener('click', closeModal);
      if (config.backdrop !== false) {
        backdrop?.addEventListener('click', closeModal);
      }
    }
    
    return modal;
  }

  /**
   * 배지 컴포넌트 생성
   */
  static createBadge(text: string, config: ComponentConfig = {}): HTMLSpanElement {
    const badge = document.createElement('span');
    
    const classes = [this.baseClasses.badge];
    if (config.variant) classes.push(`badge--${config.variant}`);
    if (config.size) classes.push(`badge--${config.size}`);
    if (config.color) classes.push(`badge--${config.color}`);
    if (config.className) classes.push(config.className);
    
    badge.className = classes.join(' ');
    badge.textContent = text;
    
    return badge;
  }

  /**
   * 알림 컴포넌트 생성
   */
  static createAlert(message: string, config: ComponentConfig = {}): HTMLDivElement {
    const alert = document.createElement('div');
    
    const classes = [this.baseClasses.alert];
    if (config.variant) classes.push(`alert--${config.variant}`);
    if (config.color) classes.push(`alert--${config.color}`);
    if (config.className) classes.push(config.className);
    
    alert.className = classes.join(' ');
    
    let content = `<div class="alert__content">${message}</div>`;
    
    if (config.variant !== 'simple') {
      content += '<button class="alert__close" type="button">&times;</button>';
      
      // 자동 닫기 기능
      setTimeout(() => {
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 300);
      }, 5000);
    }
    
    alert.innerHTML = content;
    
    // 닫기 버튼 기능
    const closeBtn = alert.querySelector('.alert__close');
    closeBtn?.addEventListener('click', () => {
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 300);
    });
    
    return alert;
  }

  /**
   * 로더 컴포넌트 생성
   */
  static createLoader(config: ComponentConfig = {}): HTMLDivElement {
    const loader = document.createElement('div');
    
    const classes = [this.baseClasses.loader];
    if (config.size) classes.push(`loader--${config.size}`);
    if (config.variant) classes.push(`loader--${config.variant}`);
    if (config.className) classes.push(config.className);
    
    loader.className = classes.join(' ');
    
    if (config.variant === 'overlay') {
      loader.innerHTML = `
        <div class="loader__backdrop"></div>
        <div class="loader__spinner"></div>
      `;
    } else {
      loader.innerHTML = '<div class="loader__spinner"></div>';
    }
    
    return loader;
  }

  /**
   * 통계 카드 컴포넌트 생성
   */
  static createStatCard(config: StatCardConfig): HTMLDivElement {
    const card = document.createElement('div');
    
    const classes = [this.baseClasses.statCard];
    if (config.variant) classes.push(`stat-card--${config.variant}`);
    if (config.color) classes.push(`stat-card--${config.color}`);
    if (config.className) classes.push(config.className);
    
    card.className = classes.join(' ');
    
    let content = '';
    
    if (config.icon) {
      content += `<div class="stat-card__icon">${config.icon}</div>`;
    }
    
    content += `
      <div class="stat-card__content">
        <div class="stat-card__value">${config.value}</div>
        <div class="stat-card__label">${config.label}</div>
      </div>
    `;
    
    card.innerHTML = content;
    return card;
  }

  /**
   * 필터 셀렉트 컴포넌트 생성
   */
  static createFilter(config: FilterConfig): HTMLDivElement {
    const wrapper = document.createElement('div');
    
    const classes = [this.baseClasses.filter];
    if (config.className) classes.push(config.className);
    
    wrapper.className = classes.join(' ');
    
    let content = `<label class="filter__label">${config.label}:</label>`;
    
    const selectClasses = ['filter__select'];
    if (config.size) selectClasses.push(`filter__select--${config.size}`);
    
    content += `<select class="${selectClasses.join(' ')}">`;
    
    config.options.forEach(option => {
      content += `<option value="${option.value}">${option.text}</option>`;
    });
    
    content += '</select>';
    
    wrapper.innerHTML = content;
    
    // 이벤트 리스너 추가
    if (config.onChange) {
      const select = wrapper.querySelector('select')!;
      select.addEventListener('change', (e) => {
        config.onChange!((e.target as HTMLSelectElement).value);
      });
    }
    
    return wrapper;
  }

  /**
   * 텍스트에어리어 컴포넌트 생성
   */
  static createTextarea(config: TextareaConfig): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    
    const classes = [this.baseClasses.textarea];
    if (config.size) classes.push(`textarea--${config.size}`);
    if (config.variant) classes.push(`textarea--${config.variant}`);
    if (config.className) classes.push(config.className);
    
    textarea.className = classes.join(' ');
    
    if (config.placeholder) textarea.placeholder = config.placeholder;
    if (config.rows) textarea.rows = config.rows;
    if (config.disabled) textarea.disabled = config.disabled;
    
    // 이벤트 리스너 추가
    if (config.onKeyDown) {
      textarea.addEventListener('keydown', config.onKeyDown);
    }
    
    // 추가 속성 설정
    if (config.attributes) {
      Object.entries(config.attributes).forEach(([key, value]) => {
        textarea.setAttribute(key, value);
      });
    }
    
    return textarea;
  }

  /**
   * 메시지 컴포넌트 생성
   */
  static createMessage(config: MessageConfig): HTMLDivElement {
    const message = document.createElement('div');
    
    const classes = [this.baseClasses.message, `message--${config.type}`];
    if (config.className) classes.push(config.className);
    
    message.className = classes.join(' ');
    
    const avatar = config.avatar || this.getDefaultAvatar(config.type);
    const senderName = this.getSenderName(config.type);
    const formattedTime = this.formatTimestamp(config.timestamp);
    
    let content = `
      <div class="message__header">
        <div class="message__avatar">${avatar}</div>
        <div class="message__info">
          <div class="message__sender">${senderName}</div>
          <div class="message__time">${formattedTime}</div>
        </div>
      </div>
      <div class="message__content">${this.formatMessageContent(config.content)}</div>
    `;
    
    if (config.metadata) {
      content += this.renderMetadata(config.metadata);
    }
    
    message.innerHTML = content;
    return message;
  }

  /**
   * 헬퍼 메서드들
   */
  private static getDefaultAvatar(type: string): string {
    switch (type) {
      case 'user': return '👤';
      case 'assistant': return '🧠';
      case 'system': return '💡';
      default: return '💬';
    }
  }

  private static getSenderName(type: string): string {
    switch (type) {
      case 'user': return '사용자';
      case 'assistant': return 'AI 플래너';
      case 'system': return '시스템';
      default: return '알 수 없음';
    }
  }

  private static formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private static formatMessageContent(content: string): string {
    // 마크다운 형식을 간단한 HTML로 변환
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n/g, '<br>')
      .replace(/^• (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  }

  private static renderMetadata(metadata: any): string {
    let metadataHtml = '';
    
    if (metadata.analysis) {
      metadataHtml += `
        <div class="message__metadata">
          <div class="metadata__title">📊 분석 결과</div>
          <div class="metadata__content">${JSON.stringify(metadata.analysis, null, 2)}</div>
        </div>
      `;
    }
    
    if (metadata.workflow) {
      metadataHtml += `
        <div class="message__metadata">
          <div class="metadata__title">🔄 워크플로우</div>
          <div class="metadata__content">${this.renderWorkflow(metadata.workflow)}</div>
        </div>
      `;
    }
    
    if (metadata.error) {
      metadataHtml += `
        <div class="message__error">
          <div class="error__title">⚠️ 오류</div>
          <div class="error__message">${metadata.error}</div>
        </div>
      `;
    }
    
    return metadataHtml;
  }

  private static renderWorkflow(workflow: any): string {
    if (!workflow.steps) return '';
    
    return workflow.steps.map((step: any, index: number) => `
      <div class="workflow__step">
        <div class="step__number">${index + 1}</div>
        <div class="step__content">
          <div class="step__title">${step.name}</div>
          <div class="step__description">${step.description}</div>
        </div>
      </div>
    `).join('<div class="workflow__arrow">↓</div>');
  }

  /**
   * 유틸리티: 여러 컴포넌트를 컨테이너에 추가
   */
  static appendTo(container: HTMLElement, ...components: HTMLElement[]): void {
    components.forEach(component => container.appendChild(component));
  }

  /**
   * 유틸리티: 컴포넌트에 이벤트 리스너 추가
   */
  static addEventListeners(element: HTMLElement, events: Record<string, EventListener>): void {
    Object.entries(events).forEach(([event, listener]) => {
      element.addEventListener(event, listener);
    });
  }
} 