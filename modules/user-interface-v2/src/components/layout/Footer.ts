import { ComponentFactory } from '../../utils/component-factory';
import { domManager } from '../../core/DOMManager';
import { eventManager } from '../../core/EventManager';

export interface FooterProps {
  showSettings?: boolean;
}

export class Footer {
  private props: FooterProps;
  private isInitialized = false;

  constructor(props: FooterProps = {}) {
    this.props = {
      showSettings: true,
      ...props
    };
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const footerElement = domManager.getElement('footer');
    if (!footerElement) {
      throw new Error('Footer element not found');
    }

    this.setupFooterContent(footerElement);
    this.isInitialized = true;
  }

  private setupFooterContent(element: HTMLElement): void {
    // 푸터 컨테이너
    const footerContainer = domManager.createElement('div', {
      className: 'footer__container'
    });

    // 오른쪽 영역 (설정 버튼)
    const settingsButton = ComponentFactory.createButton({
      children: '⚙️',
      variant: 'ghost',
      size: 'sm',
      className: 'footer__settings-button',
      attributes: {
        'aria-label': '설정'
      }
    });

    settingsButton.addEventListener('click', () => {
      // 해시 라우팅을 사용하여 로그 대시보드로 이동
      window.location.hash = '#/logs';
      // 이벤트 발생
      eventManager.emit('route:change', { path: '/logs' });
    });

    footerContainer.appendChild(settingsButton);
    element.innerHTML = '';
    element.appendChild(footerContainer);
  }

  public destroy(): void {
    this.isInitialized = false;
  }
} 