// ============================================
// 접근성 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../core/EventManager.js';

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

      // 로딩 상태 표시
      if (button.hasAttribute('data-loading')) {
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-describedby', 'loading-description');
      }
    });
  }

  private enhanceInputs(): void {
    const inputs = this.element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const htmlInput = input as HTMLInputElement;
      
      // 라벨 연결
      if (!htmlInput.hasAttribute('aria-label') && !htmlInput.hasAttribute('aria-labelledby')) {
        const label = this.findLabelForInput(htmlInput);
        if (label) {
          const labelId = label.id || `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          label.id = labelId;
          htmlInput.setAttribute('aria-labelledby', labelId);
        }
      }

      // 오류 메시지 연결
      const errorElement = this.findErrorForInput(htmlInput);
      if (errorElement) {
        const errorId = errorElement.id || `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        errorElement.id = errorId;
        htmlInput.setAttribute('aria-describedby', errorId);
        htmlInput.setAttribute('aria-invalid', 'true');
      }

      // 필수 입력 표시
      if (htmlInput.hasAttribute('required')) {
        htmlInput.setAttribute('aria-required', 'true');
      }
    });
  }

  private enhanceTabs(): void {
    const tabContainer = this.element.querySelector('.rightsidebar__tabs');
    if (!tabContainer) return;

    tabContainer.setAttribute('role', 'tablist');
    tabContainer.setAttribute('aria-label', 'Application tabs');

    const tabs = tabContainer.querySelectorAll('.rightsidebar__tab');
    tabs.forEach((tab, index) => {
      const htmlTab = tab as HTMLElement;
      
      htmlTab.setAttribute('role', 'tab');
      htmlTab.setAttribute('tabindex', index === 0 ? '0' : '-1');
      
      const appId = htmlTab.getAttribute('data-app-id') || `app-${index}`;
      htmlTab.setAttribute('id', `tab-${appId}`);
      htmlTab.setAttribute('aria-controls', `panel-${appId}`);
      
      const isActive = htmlTab.classList.contains('active');
      htmlTab.setAttribute('aria-selected', isActive.toString());
      
      if (!htmlTab.hasAttribute('aria-label')) {
        const text = htmlTab.textContent?.trim();
        if (text) {
          htmlTab.setAttribute('aria-label', `${text} tab`);
        }
      }
    });
  }

  private enhanceContent(): void {
    const contentArea = this.element.querySelector('.rightsidebar__content');
    if (contentArea) {
      contentArea.setAttribute('role', 'tabpanel');
      contentArea.setAttribute('aria-live', 'polite');
      
      const activeTab = this.element.querySelector('.rightsidebar__tab.active');
      if (activeTab) {
        const appId = activeTab.getAttribute('data-app-id');
        if (appId) {
          contentArea.setAttribute('id', `panel-${appId}`);
          contentArea.setAttribute('aria-labelledby', `tab-${appId}`);
        }
      }
    }
  }

  private setupLiveRegions(): void {
    // 상태 알림 영역
    const statusRegion = document.createElement('div');
    statusRegion.setAttribute('aria-live', 'polite');
    statusRegion.setAttribute('aria-atomic', 'true');
    statusRegion.className = 'sr-only';
    statusRegion.id = 'sidebar-status';
    this.element.appendChild(statusRegion);

    // 에러 알림 영역
    const errorRegion = document.createElement('div');
    errorRegion.setAttribute('aria-live', 'assertive');
    errorRegion.setAttribute('aria-atomic', 'true');
    errorRegion.className = 'sr-only';
    errorRegion.id = 'sidebar-errors';
    this.element.appendChild(errorRegion);
  }

  private addLandmarks(): void {
    // 메인 사이드바 랜드마크
    this.element.setAttribute('role', 'complementary');
    this.element.setAttribute('aria-label', 'Application sidebar');

    // 헤더 랜드마크
    const header = this.element.querySelector('.rightsidebar__header');
    if (header) {
      header.setAttribute('role', 'banner');
      header.setAttribute('aria-label', 'Sidebar header');
    }

    // 네비게이션 랜드마크
    const tabContainer = this.element.querySelector('.rightsidebar__tabs');
    if (tabContainer) {
      tabContainer.setAttribute('role', 'navigation');
      tabContainer.setAttribute('aria-label', 'Application navigation');
    }
  }

  // ============================================================================
  // 접근성 기능 구현
  // ============================================================================

  private activateHighContrast(): void {
    document.body.classList.add('high-contrast');
    this.element.classList.add('high-contrast');
    this.announce('High contrast mode enabled');
  }

  private deactivateHighContrast(): void {
    document.body.classList.remove('high-contrast');
    this.element.classList.remove('high-contrast');
    this.announce('High contrast mode disabled');
  }

  private activateLargeText(): void {
    document.body.classList.add('large-text');
    this.element.classList.add('large-text');
    this.announce('Large text mode enabled');
  }

  private deactivateLargeText(): void {
    document.body.classList.remove('large-text');
    this.element.classList.remove('large-text');
    this.announce('Large text mode disabled');
  }

  private activateReducedMotion(): void {
    document.body.classList.add('reduced-motion');
    this.element.classList.add('reduced-motion');
    this.announce('Reduced motion enabled');
  }

  private deactivateReducedMotion(): void {
    document.body.classList.remove('reduced-motion');
    this.element.classList.remove('reduced-motion');
    this.announce('Reduced motion disabled');
  }

  private activateKeyboardOnly(): void {
    document.body.classList.add('keyboard-only');
    this.element.classList.add('keyboard-only');
    this.showFocusIndicators();
    this.announce('Keyboard only mode enabled');
  }

  private deactivateKeyboardOnly(): void {
    document.body.classList.remove('keyboard-only');
    this.element.classList.remove('keyboard-only');
    this.hideFocusIndicators();
    this.announce('Keyboard only mode disabled');
  }

  private activateScreenReaderMode(): void {
    this.element.classList.add('screen-reader-optimized');
    this.addScreenReaderDescriptions();
    this.announce('Screen reader optimization enabled');
  }

  private deactivateScreenReaderMode(): void {
    this.element.classList.remove('screen-reader-optimized');
    this.removeScreenReaderDescriptions();
    this.announce('Screen reader optimization disabled');
  }

  private showFocusIndicators(): void {
    const style = document.createElement('style');
    style.id = 'keyboard-focus-indicators';
    style.textContent = `
      .keyboard-only *:focus {
        outline: 3px solid var(--color-primary) !important;
        outline-offset: 2px !important;
      }
      .keyboard-only .focus-indicator {
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  private hideFocusIndicators(): void {
    const style = document.getElementById('keyboard-focus-indicators');
    if (style) {
      style.remove();
    }
  }

  private addScreenReaderDescriptions(): void {
    // 상세한 설명 추가
    const buttons = this.element.querySelectorAll('button');
    buttons.forEach(button => {
      if (!button.hasAttribute('aria-describedby')) {
        const description = this.generateButtonDescription(button);
        if (description) {
          const descId = `desc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const descElement = document.createElement('span');
          descElement.id = descId;
          descElement.className = 'sr-only';
          descElement.textContent = description;
          button.parentNode?.insertBefore(descElement, button.nextSibling);
          button.setAttribute('aria-describedby', descId);
        }
      }
    });
  }

  private removeScreenReaderDescriptions(): void {
    const descriptions = this.element.querySelectorAll('[id^="desc-"]');
    descriptions.forEach(desc => desc.remove());
  }

  private generateButtonDescription(button: HTMLElement): string {
    const classList = button.className;
    const text = button.textContent?.trim();
    
    // 특정 버튼 타입에 대한 설명 생성
    if (classList.includes('rightsidebar__close')) {
      return 'Closes the sidebar and returns focus to main content';
    }
    if (classList.includes('rightsidebar__tab')) {
      return `Switches to ${text} application tab`;
    }
    if (classList.includes('refresh')) {
      return 'Refreshes the current application data';
    }
    if (classList.includes('toggle')) {
      const isPressed = button.getAttribute('aria-pressed') === 'true';
      return `Toggle button, currently ${isPressed ? 'pressed' : 'not pressed'}`;
    }
    
    return '';
  }

  private updateColorScheme(): void {
    document.documentElement.setAttribute('data-color-scheme', this.preferredColorScheme);
  }

  private findLabelForInput(input: HTMLInputElement): HTMLElement | null {
    // ID로 연결된 라벨 찾기
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label as HTMLElement;
    }
    
    // 부모 요소에서 라벨 찾기
    const parent = input.closest('.input-group, .form-group');
    if (parent) {
      const label = parent.querySelector('label');
      if (label) return label;
    }
    
    // 이전 형제 요소에서 라벨 찾기
    let sibling = input.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === 'LABEL') {
        return sibling as HTMLElement;
      }
      sibling = sibling.previousElementSibling;
    }
    
    return null;
  }

  private findErrorForInput(input: HTMLInputElement): HTMLElement | null {
    const parent = input.closest('.input-group, .form-group');
    if (parent) {
      const error = parent.querySelector('.error, .input__error, [role="alert"]');
      if (error) return error as HTMLElement;
    }
    return null;
  }

  // ============================================================================
  // 이벤트 핸들러
  // ============================================================================

  private handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    
    // 포커스된 요소 정보 알림
    if (this.config.enableScreenReader) {
      const description = this.describeFocusedElement(target);
      if (description) {
        this.announce(description);
      }
    }
    
    // 포커스 트래킹
    target.classList.add('has-focus');
  }

  private handleFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    target.classList.remove('has-focus');
  }

  private handleVisibilityChange(data: { visible: boolean }): void {
    if (this.config.announceStateChanges) {
      this.announce(data.visible ? 'Sidebar opened' : 'Sidebar closed');
    }
    
    // ARIA 상태 업데이트
    this.element.setAttribute('aria-hidden', (!data.visible).toString());
    
    if (data.visible) {
      // 사이드바가 열릴 때 첫 번째 포커스 가능한 요소로 포커스 이동
      setTimeout(() => {
        const firstFocusable = this.element.querySelector('button, [tabindex]:not([tabindex="-1"])') as HTMLElement;
        firstFocusable?.focus();
      }, 100);
    }
  }

  private handleAppActivation(data: { appId: string }): void {
    if (this.config.announceStateChanges) {
      this.announce(`Activated ${data.appId} application`);
    }
    
    // 탭 상태 업데이트
    const tabs = this.element.querySelectorAll('.rightsidebar__tab');
    tabs.forEach(tab => {
      const isActive = tab.getAttribute('data-app-id') === data.appId;
      tab.setAttribute('aria-selected', isActive.toString());
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    
    // 콘텐츠 패널 업데이트
    const contentArea = this.element.querySelector('.rightsidebar__content');
    if (contentArea) {
      contentArea.setAttribute('aria-labelledby', `tab-${data.appId}`);
      contentArea.setAttribute('id', `panel-${data.appId}`);
    }
  }

  private handleLoadingStateChange(data: { appId: string; state: any }): void {
    if (this.config.announceStateChanges) {
      let message = '';
      switch (data.state.status) {
        case 'loading':
          message = `Loading ${data.appId} application`;
          break;
        case 'loaded':
          message = `${data.appId} application loaded successfully`;
          break;
        case 'error':
          message = `Failed to load ${data.appId} application`;
          break;
      }
      
      if (message) {
        this.announce(message);
      }
    }
  }

  private handleGlobalKeyDown(event: KeyboardEvent): void {
    // Ctrl+Alt+A: 접근성 설정 열기
    if (event.ctrlKey && event.altKey && event.key === 'a') {
      event.preventDefault();
      this.showAccessibilityPanel();
    }
  }

  private describeFocusedElement(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const label = element.getAttribute('aria-label') || element.textContent?.trim();
    
    let description = '';
    
    if (role) {
      description += `${role}, `;
    } else {
      description += `${tagName}, `;
    }
    
    if (label) {
      description += label;
    }
    
    // 상태 정보 추가
    if (element.hasAttribute('aria-pressed')) {
      const pressed = element.getAttribute('aria-pressed') === 'true';
      description += `, ${pressed ? 'pressed' : 'not pressed'}`;
    }
    
    if (element.hasAttribute('aria-selected')) {
      const selected = element.getAttribute('aria-selected') === 'true';
      description += `, ${selected ? 'selected' : 'not selected'}`;
    }
    
    if (element.hasAttribute('aria-expanded')) {
      const expanded = element.getAttribute('aria-expanded') === 'true';
      description += `, ${expanded ? 'expanded' : 'collapsed'}`;
    }
    
    return description;
  }

  // ============================================================================
  // 접근성 패널
  // ============================================================================

  private showAccessibilityPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'accessibility-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'a11y-panel-title');
    panel.setAttribute('aria-modal', 'true');
    
    panel.innerHTML = `
      <div class="accessibility-panel__backdrop"></div>
      <div class="accessibility-panel__content">
        <div class="accessibility-panel__header">
          <h2 id="a11y-panel-title">Accessibility Settings</h2>
          <button class="accessibility-panel__close" aria-label="Close accessibility settings">×</button>
        </div>
        <div class="accessibility-panel__body">
          ${this.generateAccessibilityControls()}
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 이벤트 리스너 설정
    this.setupAccessibilityPanelEvents(panel);
    
    // 포커스 관리
    const firstControl = panel.querySelector('input, button, select') as HTMLElement;
    firstControl?.focus();
    
    this.announce('Accessibility settings opened');
  }

  private generateAccessibilityControls(): string {
    let html = '<div class="accessibility-controls">';
    
    this.features.forEach(feature => {
      html += `
        <div class="accessibility-control">
          <label class="accessibility-control__label">
            <input type="checkbox" 
                   class="accessibility-control__checkbox" 
                   data-feature="${feature.id}"
                   ${feature.enabled ? 'checked' : ''}>
            <span class="accessibility-control__name">${feature.name}</span>
          </label>
          <p class="accessibility-control__description">${feature.description}</p>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  private setupAccessibilityPanelEvents(panel: HTMLElement): void {
    // 닫기 버튼
    const closeBtn = panel.querySelector('.accessibility-panel__close');
    closeBtn?.addEventListener('click', () => {
      panel.remove();
      this.announce('Accessibility settings closed');
    });
    
    // 백드롭 클릭
    const backdrop = panel.querySelector('.accessibility-panel__backdrop');
    backdrop?.addEventListener('click', () => {
      panel.remove();
    });
    
    // 체크박스 변경
    const checkboxes = panel.querySelectorAll('.accessibility-control__checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const featureId = target.getAttribute('data-feature');
        if (featureId) {
          this.toggleFeature(featureId, target.checked);
        }
      });
    });
    
    // ESC 키로 닫기
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        panel.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  // ============================================================================
  // 설정 저장/복원
  // ============================================================================

  private savePreferences(): void {
    const preferences: Record<string, boolean> = {};
    this.features.forEach((feature, id) => {
      preferences[id] = feature.enabled;
    });
    
    try {
      localStorage.setItem('accessibility-preferences', JSON.stringify(preferences));
    } catch (error) {
      console.warn('Failed to save accessibility preferences:', error);
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
      console.warn('Failed to load accessibility preferences:', error);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcer = priority === 'assertive' ? 
      document.getElementById('accessibility-announcer-assertive') : 
      this.announcer;
    
    if (announcer) {
      announcer.textContent = message;
      
      // 메시지 클리어
      setTimeout(() => {
        announcer.textContent = '';
      }, 1000);
    }
  }

  public toggleFeature(featureId: string, enabled?: boolean): void {
    const feature = this.features.get(featureId);
    if (!feature) return;
    
    const newState = enabled !== undefined ? enabled : !feature.enabled;
    
    if (newState !== feature.enabled) {
      feature.enabled = newState;
      
      if (newState) {
        feature.activate();
      } else {
        feature.deactivate();
      }
      
      this.savePreferences();
    }
  }

  public getFeatureState(featureId: string): boolean {
    const feature = this.features.get(featureId);
    return feature ? feature.enabled : false;
  }

  public getAllFeatures(): AccessibilityFeature[] {
    return Array.from(this.features.values());
  }

  public updateConfig(newConfig: Partial<AccessibilityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public checkCompliance(): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;
    
    // 기본 접근성 체크
    const buttonsWithoutLabels = this.element.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
    if (buttonsWithoutLabels.length > 0) {
      issues.push(`${buttonsWithoutLabels.length} buttons without accessible labels`);
      score -= 10;
    }
    
    const imagesWithoutAlt = this.element.querySelectorAll('img:not([alt])');
    if (imagesWithoutAlt.length > 0) {
      issues.push(`${imagesWithoutAlt.length} images without alt text`);
      score -= 15;
    }
    
    const inputsWithoutLabels = this.element.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
    if (inputsWithoutLabels.length > 0) {
      issues.push(`${inputsWithoutLabels.length} inputs without labels`);
      score -= 20;
    }
    
    return { score: Math.max(0, score), issues };
  }

  public destroy(): void {
    // 이벤트 리스너 정리
    this.observers.forEach(observer => observer.disconnect());
    
    // DOM 요소 정리
    this.announcer.remove();
    const assertiveAnnouncer = document.getElementById('accessibility-announcer-assertive');
    assertiveAnnouncer?.remove();
    
    // 클래스 제거
    document.body.classList.remove('high-contrast', 'large-text', 'reduced-motion', 'keyboard-only');
    this.element.classList.remove('high-contrast', 'large-text', 'reduced-motion', 'keyboard-only', 'screen-reader-optimized');
    
    // 포커스 인디케이터 제거
    const focusStyle = document.getElementById('keyboard-focus-indicators');
    focusStyle?.remove();
    
    this.features.clear();
  }
}