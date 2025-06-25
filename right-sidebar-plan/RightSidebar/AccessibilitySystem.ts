import { eventManager } from '../../../core/EventManager.js';

export interface AccessibilityConfig {
  enableScreenReader: boolean;
  enableHighContrast: boolean;
  enableLargeText: boolean;
  enableReducedMotion: boolean;
  announceStateChanges: boolean;
  keyboardOnly: boolean;
}

export interface AccessibilityFeature {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  activate: () => void;
  deactivate: () => void;
}

export class AccessibilitySystem {
  private element: HTMLElement;
  private config: AccessibilityConfig;
  private announcer: HTMLElement;
  private features: Map<string, AccessibilityFeature> = new Map();
  private preferredColorScheme: 'light' | 'dark' | 'auto' = 'auto';
  private observers: MutationObserver[] = [];

  constructor(element: HTMLElement, config: Partial<AccessibilityConfig> = {}) {
    this.element = element;
    this.config = {
      enableScreenReader: true,
      enableHighContrast: false,
      enableLargeText: false,
      enableReducedMotion: false,
      announceStateChanges: true,
      keyboardOnly: false,
      ...config
    };

    this.announcer = this.createLiveRegion();
    this.setupAccessibilityFeatures();
    this.detectUserPreferences();
    this.setupEventListeners();
    this.enhanceExistingElements();
  }

  private createLiveRegion(): HTMLElement {
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    announcer.id = 'accessibility-announcer';
    
    // 추가 live region (긴급 알림용)
    const assertiveAnnouncer = document.createElement('div');
    assertiveAnnouncer.setAttribute('aria-live', 'assertive');
    assertiveAnnouncer.setAttribute('aria-atomic', 'true');
    assertiveAnnouncer.className = 'sr-only';
    assertiveAnnouncer.id = 'accessibility-announcer-assertive';
    
    document.body.appendChild(announcer);
    document.body.appendChild(assertiveAnnouncer);
    
    return announcer;
  }

  private setupAccessibilityFeatures(): void {
    // 고대비 모드
    this.features.set('high-contrast', {
      id: 'high-contrast',
      name: 'High Contrast Mode',
      description: 'Increase contrast for better visibility',
      enabled: this.config.enableHighContrast,
      activate: () => this.activateHighContrast(),
      deactivate: () => this.deactivateHighContrast()
    });

    // 큰 텍스트 모드
    this.features.set('large-text', {
      id: 'large-text',
      name: 'Large Text Mode',
      description: 'Increase text size for better readability',
      enabled: this.config.enableLargeText,
      activate: () => this.activateLargeText(),
      deactivate: () => this.deactivateLargeText()
    });

    // 모션 감소 모드
    this.features.set('reduced-motion', {
      id: 'reduced-motion',
      name: 'Reduced Motion',
      description: 'Reduce animations and transitions',
      enabled: this.config.enableReducedMotion,
      activate: () => this.activateReducedMotion(),
      deactivate: () => this.deactivateReducedMotion()
    });

    // 키보드 전용 모드
    this.features.set('keyboard-only', {
      id: 'keyboard-only',
      name: 'Keyboard Only Mode',
      description: 'Optimize interface for keyboard navigation',
      enabled: this.config.keyboardOnly,
      activate: () => this.activateKeyboardOnly(),
      deactivate: () => this.deactivateKeyboardOnly()
    });

    // 스크린 리더 최적화
    this.features.set('screen-reader', {
      id: 'screen-reader',
      name: 'Screen Reader Optimization',
      description: 'Optimize for screen reader users',
      enabled: this.config.enableScreenReader,
      activate: () => this.activateScreenReaderMode(),
      deactivate: () => this.deactivateScreenReaderMode()
    });
  }

  private detectUserPreferences(): void {
    // 시스템 설정 감지
    if (window.matchMedia) {
      // 고대비 선호도
      const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
      if (prefersHighContrast.matches) {
        this.toggleFeature('high-contrast', true);
      }

      // 모션 감소 선호도
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (prefersReducedMotion.matches) {
        this.toggleFeature('reduced-motion', true);
      }

      // 색상 스키마 선호도
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      this.preferredColorScheme = prefersDark.matches ? 'dark' : 'light';

      // 변경 감지
      prefersHighContrast.addEventListener('change', (e) => {
        this.toggleFeature('high-contrast', e.matches);
      });

      prefersReducedMotion.addEventListener('change', (e) => {
        this.toggleFeature('reduced-motion', e.matches);
      });

      prefersDark.addEventListener('change', (e) => {
        this.preferredColorScheme = e.matches ? 'dark' : 'light';
        this.updateColorScheme();
      });
    }

    // 저장된 설정 복원
    this.loadSavedPreferences();
  }

  private setupEventListeners(): void {
    // 포커스 이벤트
    this.element.addEventListener('focusin', this.handleFocusIn.bind(this));
    this.element.addEventListener('focusout', this.handleFocusOut.bind(this));

    // 상태 변경 이벤트
    eventManager.on('rightsidebar:visibility:change' as any, this.handleVisibilityChange.bind(this));
    eventManager.on('app:activated' as any, this.handleAppActivation.bind(this));
    eventManager.on('app:loading-state-changed' as any, this.handleLoadingStateChange.bind(this));

    // 키보드 이벤트
    document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
  }

  private enhanceExistingElements(): void {
    this.enhanceButtons();
    this.enhanceInputs();
    this.enhanceTabs();
    this.enhanceContent();
    this.setupLiveRegions();
    this.addLandmarks();
  }

  private enhanceButtons(): void {
    const buttons = this.element.querySelectorAll('button');
    buttons.forEach(button => {
      // ARIA 라벨이 없는 버튼에 추가
      if (!button.hasAttribute('aria-label') && !button.hasAttribute('aria-labelledby')) {
        const text = button.textContent?.trim();
        if (text) {
          button.setAttribute('aria-label', text);
        }
      }

      // 토글 버튼 상태 표시
      if (button.classList.contains('toggle') || button.hasAttribute('data-toggle')) {
        const isPressed = button.classList.contains('active') || button.hasAttribute('data-pressed');
        button.setAttribute('aria-pressed', isPressed.toString());
      }
    });
  }

  private enhanceInputs(): void {
    const inputs = this.element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const element = input as HTMLElement;
      
      // 라벨 연결
      const label = this.findLabelForInput(element as HTMLInputElement);
      if (label) {
        if (!element.id) {
          element.id = `input-${Math.random().toString(36).substr(2, 9)}`;
        }
        label.setAttribute('for', element.id);
      }

      // 필수 입력 필드 표시
      if (element.hasAttribute('required')) {
        element.setAttribute('aria-required', 'true');
      }

      // 에러 메시지 연결
      const errorElement = this.findErrorForInput(element as HTMLInputElement);
      if (errorElement) {
        if (!errorElement.id) {
          errorElement.id = `error-${element.id || Math.random().toString(36).substr(2, 9)}`;
        }
        element.setAttribute('aria-errormessage', errorElement.id);
      }
    });
  }

  private enhanceTabs(): void {
    const tabList = this.element.querySelector('[role="tablist"]');
    if (!tabList) return;

    const tabs = tabList.querySelectorAll('[role="tab"]');
    const panels = this.element.querySelectorAll('[role="tabpanel"]');

    tabs.forEach((tab, index) => {
      const panel = panels[index];
      if (!panel) return;

      // 탭과 패널 연결
      if (!panel.id) {
        panel.id = `panel-${Math.random().toString(36).substr(2, 9)}`;
      }
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('aria-labelledby', tab.id);

      // 선택 상태 표시
      const isSelected = tab.classList.contains('active');
      tab.setAttribute('aria-selected', isSelected.toString());
      (panel as HTMLElement).hidden = !isSelected;
    });
  }

  private enhanceContent(): void {
    // 랜드마크 역할 추가
    this.element.setAttribute('role', 'complementary');
    this.element.setAttribute('aria-label', 'Right Sidebar');

    // 헤딩 레벨 확인
    const headings = this.element.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;
    headings.forEach(heading => {
      const level = parseInt(heading.tagName[1]);
      if (level - lastLevel > 1) {
        console.warn(`Heading level skip detected: ${lastLevel} to ${level}`);
      }
      lastLevel = level;
    });
  }

  private setupLiveRegions(): void {
    // 상태 업데이트용 live region
    const statusRegion = document.createElement('div');
    statusRegion.setAttribute('aria-live', 'polite');
    statusRegion.setAttribute('aria-atomic', 'true');
    statusRegion.className = 'sr-only';
    statusRegion.id = 'status-announcer';
    this.element.appendChild(statusRegion);

    // 알림용 live region
    const alertRegion = document.createElement('div');
    alertRegion.setAttribute('role', 'alert');
    alertRegion.className = 'sr-only';
    alertRegion.id = 'alert-announcer';
    this.element.appendChild(alertRegion);
  }

  private addLandmarks(): void {
    // 주요 영역에 랜드마크 역할 추가
    const header = this.element.querySelector('header');
    if (header) {
      header.setAttribute('role', 'banner');
    }

    const nav = this.element.querySelector('nav');
    if (nav) {
      nav.setAttribute('role', 'navigation');
      nav.setAttribute('aria-label', 'App navigation');
    }

    const main = this.element.querySelector('main');
    if (main) {
      main.setAttribute('role', 'main');
    }
  }

  private activateHighContrast(): void {
    document.documentElement.classList.add('high-contrast');
    this.announce('High contrast mode enabled');
  }

  private deactivateHighContrast(): void {
    document.documentElement.classList.remove('high-contrast');
    this.announce('High contrast mode disabled');
  }

  private activateLargeText(): void {
    document.documentElement.classList.add('large-text');
    this.announce('Large text mode enabled');
  }

  private deactivateLargeText(): void {
    document.documentElement.classList.remove('large-text');
    this.announce('Large text mode disabled');
  }

  private activateReducedMotion(): void {
    document.documentElement.classList.add('reduced-motion');
    this.announce('Reduced motion mode enabled');
  }

  private deactivateReducedMotion(): void {
    document.documentElement.classList.remove('reduced-motion');
    this.announce('Reduced motion mode disabled');
  }

  private activateKeyboardOnly(): void {
    document.documentElement.classList.add('keyboard-only');
    this.showFocusIndicators();
    this.announce('Keyboard only mode enabled');
  }

  private deactivateKeyboardOnly(): void {
    document.documentElement.classList.remove('keyboard-only');
    this.hideFocusIndicators();
    this.announce('Keyboard only mode disabled');
  }

  private activateScreenReaderMode(): void {
    this.addScreenReaderDescriptions();
    this.announce('Screen reader optimizations enabled');
  }

  private deactivateScreenReaderMode(): void {
    this.removeScreenReaderDescriptions();
    this.announce('Screen reader optimizations disabled');
  }

  private showFocusIndicators(): void {
    const style = document.createElement('style');
    style.id = 'keyboard-focus-styles';
    style.textContent = `
      *:focus {
        outline: 2px solid var(--color-primary) !important;
        outline-offset: 2px !important;
      }
      
      *:focus:not(:focus-visible) {
        outline: none !important;
      }
      
      *:focus-visible {
        outline: 2px solid var(--color-primary) !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  private hideFocusIndicators(): void {
    const style = document.getElementById('keyboard-focus-styles');
    if (style) {
      style.remove();
    }
  }

  private addScreenReaderDescriptions(): void {
    const buttons = this.element.querySelectorAll('button');
    buttons.forEach(button => {
      const description = this.generateButtonDescription(button);
      if (description) {
        const descId = `desc-${Math.random().toString(36).substr(2, 9)}`;
        const descElement = document.createElement('span');
        descElement.id = descId;
        descElement.className = 'sr-only';
        descElement.textContent = description;
        button.parentNode?.insertBefore(descElement, button.nextSibling);
        button.setAttribute('aria-describedby', descId);
      }
    });
  }

  private removeScreenReaderDescriptions(): void {
    const descriptions = this.element.querySelectorAll('.sr-only[id^="desc-"]');
    descriptions.forEach(desc => desc.remove());
  }

  private generateButtonDescription(button: HTMLElement): string | null {
    const action = button.getAttribute('data-action');
    const target = button.getAttribute('data-target');
    const state = button.getAttribute('aria-pressed');
    
    let description = '';
    
    if (action) {
      description += `Performs ${action}. `;
    }
    
    if (target) {
      description += `Affects ${target}. `;
    }
    
    if (state) {
      description += `Currently ${state === 'true' ? 'pressed' : 'not pressed'}. `;
    }
    
    if (button.classList.contains('disabled') || button.hasAttribute('disabled')) {
      description += 'This button is currently disabled. ';
    }
    
    return description || null;
  }

  private updateColorScheme(): void {
    document.documentElement.setAttribute('data-theme', this.preferredColorScheme);
  }

  private findLabelForInput(input: HTMLInputElement): HTMLElement | null {
    // 명시적 라벨
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label as HTMLElement;
    }

    // 암시적 라벨
    let parent = input.parentElement;
    while (parent) {
      if (parent.tagName === 'LABEL') {
        return parent;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  private findErrorForInput(input: HTMLInputElement): HTMLElement | null {
    // aria-errormessage로 연결된 요소
    const errorId = input.getAttribute('aria-errormessage');
    if (errorId) {
      return document.getElementById(errorId);
    }

    // 인접한 에러 메시지 요소
    const sibling = input.nextElementSibling;
    if (sibling?.classList.contains('error-message')) {
      return sibling as HTMLElement;
    }

    return null;
  }

  private handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (this.config.keyboardOnly) {
      target.classList.add('keyboard-focus');
    }
  }

  private handleFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    target.classList.remove('keyboard-focus');
  }

  private handleVisibilityChange(data: { visible: boolean }): void {
    if (this.config.announceStateChanges) {
      const message = data.visible
        ? 'Right sidebar opened'
        : 'Right sidebar closed';
      
      this.announce(message);
    }
  }

  private handleAppActivation(data: { appId: string }): void {
    if (this.config.announceStateChanges) {
      let appName = data.appId;
      
      // 앱 이름을 더 읽기 좋게 변환
      appName = appName
        .replace(/-/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();
      
      this.announce(`${appName} app activated`);
    }
  }

  private handleLoadingStateChange(data: { appId: string; state: any }): void {
    if (!this.config.announceStateChanges) return;

    const appName = data.appId.replace(/-/g, ' ');
    let message = '';

    switch (data.state) {
      case 'loading':
        message = `Loading ${appName}`;
        break;
      case 'loaded':
        message = `${appName} loaded successfully`;
        break;
      case 'error':
        message = `Error loading ${appName}`;
        break;
      default:
        return;
    }

    this.announce(message, data.state === 'error' ? 'assertive' : 'polite');
  }

  private handleGlobalKeyDown(event: KeyboardEvent): void {
    // Ctrl + Alt + A: 접근성 설정 패널 열기
    if (event.ctrlKey && event.altKey && event.key === 'a') {
      event.preventDefault();
      this.showAccessibilityPanel();
    }
  }

  private showAccessibilityPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'accessibility-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Accessibility Settings');

    panel.innerHTML = this.generateAccessibilityControls();
    document.body.appendChild(panel);

    // 패널 포커스
    const firstControl = panel.querySelector('button, input') as HTMLElement;
    if (firstControl) {
      firstControl.focus();
    }

    this.setupAccessibilityPanelEvents(panel);
  }

  private generateAccessibilityControls(): string {
    let html = `
      <div class="accessibility-panel-content">
        <h2>Accessibility Settings</h2>
        <div class="features-list">
    `;

    this.features.forEach(feature => {
      html += `
        <div class="feature-item">
          <label class="feature-label">
            <input type="checkbox" 
              ${feature.enabled ? 'checked' : ''}
              data-feature="${feature.id}"
            >
            <span class="feature-name">${feature.name}</span>
          </label>
          <p class="feature-description">${feature.description}</p>
        </div>
      `;
    });

    html += `
        </div>
        <div class="panel-actions">
          <button class="save-button">Save Settings</button>
          <button class="close-button">Close</button>
        </div>
      </div>
    `;

    return html;
  }

  private setupAccessibilityPanelEvents(panel: HTMLElement): void {
    // 체크박스 이벤트
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const featureId = target.getAttribute('data-feature');
        if (featureId) {
          this.toggleFeature(featureId, target.checked);
        }
      });
    });

    // 저장 버튼
    const saveButton = panel.querySelector('.save-button');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.savePreferences();
        panel.remove();
        this.announce('Accessibility settings saved');
      });
    }

    // 닫기 버튼
    const closeButton = panel.querySelector('.close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        panel.remove();
      });
    }

    // ESC로 닫기
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        panel.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };

    document.addEventListener('keydown', handleEscape);
  }

  private savePreferences(): void {
    const preferences: Record<string, boolean> = {};
    
    this.features.forEach((feature, id) => {
      preferences[id] = feature.enabled;
    });
    
    try {
      localStorage.setItem('accessibility-preferences', JSON.stringify(preferences));
    } catch (error) {
      console.error('Failed to save accessibility preferences:', error);
    }
  }

  private loadSavedPreferences(): void {
    try {
      const saved = localStorage.getItem('accessibility-preferences');
      if (saved) {
        const preferences = JSON.parse(saved);
        
        Object.entries(preferences).forEach(([id, enabled]) => {
          this.toggleFeature(id, enabled as boolean);
        });
      }
    } catch (error) {
      console.error('Failed to load accessibility preferences:', error);
    }
  }

  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcer = priority === 'assertive'
      ? document.getElementById('accessibility-announcer-assertive')
      : this.announcer;

    if (announcer) {
      announcer.textContent = message;
      
      // 2초 후 메시지 제거
      setTimeout(() => {
        if (announcer.textContent === message) {
          announcer.textContent = '';
        }
      }, 2000);
    }
  }

  public toggleFeature(featureId: string, enabled?: boolean): void {
    const feature = this.features.get(featureId);
    if (!feature) return;

    const newState = enabled ?? !feature.enabled;
    
    if (newState !== feature.enabled) {
      feature.enabled = newState;
      if (newState) {
        feature.activate();
      } else {
        feature.deactivate();
      }
    }
  }

  public getFeatureState(featureId: string): boolean {
    return this.features.get(featureId)?.enabled ?? false;
  }

  public getAllFeatures(): AccessibilityFeature[] {
    return Array.from(this.features.values());
  }

  public updateConfig(newConfig: Partial<AccessibilityConfig>): void {
    Object.assign(this.config, newConfig);
  }

  public checkCompliance(): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // 이미지 대체 텍스트 검사
    const images = this.element.querySelectorAll('img');
    images.forEach(img => {
      if (!img.alt) {
        issues.push(`Image missing alt text: ${img.src}`);
        score -= 5;
      }
    });

    // 색상 대비 검사 (간단한 버전)
    const elements = this.element.querySelectorAll('*');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      const backgroundColor = style.backgroundColor;
      const color = style.color;
      
      if (backgroundColor !== 'transparent' && color !== 'transparent') {
        // 여기서 실제 색상 대비 검사를 수행할 수 있습니다
      }
    });

    // ARIA 레이블 검사
    const interactiveElements = this.element.querySelectorAll('button, a, input, select, textarea');
    interactiveElements.forEach(el => {
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        issues.push(`Interactive element missing ARIA label: ${el.tagName}`);
        score -= 3;
      }
    });

    return {
      score: Math.max(0, score),
      issues
    };
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    this.element.removeEventListener('focusin', this.handleFocusIn.bind(this));
    this.element.removeEventListener('focusout', this.handleFocusOut.bind(this));
    document.removeEventListener('keydown', this.handleGlobalKeyDown.bind(this));

    // MutationObserver 정리
    this.observers.forEach(observer => observer.disconnect());

    // ARIA 요소들 제거
    this.announcer.remove();
    document.getElementById('accessibility-announcer-assertive')?.remove();
    document.getElementById('status-announcer')?.remove();
    document.getElementById('alert-announcer')?.remove();

    // 스타일 제거
    document.getElementById('keyboard-focus-styles')?.remove();

    // 기능 비활성화
    this.features.forEach(feature => {
      if (feature.enabled) {
        feature.deactivate();
      }
    });
  }
} 