// ============================================
// 키보드 네비게이션 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../core/EventManager.js';
import { ComponentFactory } from '../../utils/component-factory.js';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: string;
  description: string;
  category: 'global' | 'sidebar' | 'app';
  handler: (event: KeyboardEvent) => void;
}

export interface FocusableElement {
  element: HTMLElement;
  id: string;
  type: 'tab' | 'button' | 'input' | 'content';
  priority: number;
  isVisible: boolean;
}

export class KeyboardNavigationSystem {
  private element: HTMLElement;
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private focusableElements: FocusableElement[] = [];
  private currentFocusIndex = -1;
  private isNavigationMode = false;
  private helpModal: HTMLElement | null = null;
  private announcement: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.announcement = this.createAriaAnnouncement();
    this.setupDefaultShortcuts();
    this.setupEventListeners();
  }

  private createAriaAnnouncement(): HTMLElement {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.id = 'keyboard-announcements';
    document.body.appendChild(announcement);
    return announcement;
  }

  private setupDefaultShortcuts(): void {
    // 전역 단축키
    this.registerShortcut({
      key: 'b',
      ctrlKey: true,
      action: 'toggle-sidebar',
      description: 'Toggle right sidebar',
      category: 'global',
      handler: () => {
        eventManager.emit('rightsidebar:toggle' as any, {});
        this.announce('Sidebar toggled');
      }
    });

    this.registerShortcut({
      key: 'Escape',
      action: 'close-sidebar',
      description: 'Close sidebar',
      category: 'global',
      handler: () => {
        eventManager.emit('rightsidebar:hide' as any, {});
        this.announce('Sidebar closed');
      }
    });

    this.registerShortcut({
      key: '?',
      shiftKey: true,
      action: 'show-help',
      description: 'Show keyboard shortcuts',
      category: 'global',
      handler: () => this.showHelpModal()
    });

    // 사이드바 내 단축키
    this.registerShortcut({
      key: 'Tab',
      action: 'navigate-forward',
      description: 'Navigate to next element',
      category: 'sidebar',
      handler: (event) => this.handleTabNavigation(event, 1)
    });

    this.registerShortcut({
      key: 'Tab',
      shiftKey: true,
      action: 'navigate-backward',
      description: 'Navigate to previous element',
      category: 'sidebar',
      handler: (event) => this.handleTabNavigation(event, -1)
    });

    this.registerShortcut({
      key: 'ArrowDown',
      action: 'next-tab',
      description: 'Switch to next app tab',
      category: 'sidebar',
      handler: (event) => this.handleAppNavigation(event, 1)
    });

    this.registerShortcut({
      key: 'ArrowUp',
      action: 'previous-tab',
      description: 'Switch to previous app tab',
      category: 'sidebar',
      handler: (event) => this.handleAppNavigation(event, -1)
    });

    this.registerShortcut({
      key: 'Enter',
      action: 'activate-focused',
      description: 'Activate focused element',
      category: 'sidebar',
      handler: (event) => this.handleActivation(event)
    });

    this.registerShortcut({
      key: ' ',
      action: 'activate-focused-space',
      description: 'Activate focused element (space)',
      category: 'sidebar',
      handler: (event) => this.handleActivation(event)
    });

    // 앱별 단축키
    this.registerShortcut({
      key: 'r',
      ctrlKey: true,
      action: 'refresh-app',
      description: 'Refresh current app',
      category: 'app',
      handler: () => {
        eventManager.emit('app:refresh' as any, {});
        this.announce('App refreshed');
      }
    });

    this.registerShortcut({
      key: 'f',
      ctrlKey: true,
      action: 'focus-search',
      description: 'Focus search input',
      category: 'app',
      handler: () => this.focusSearchInput()
    });

    // 숫자 키로 앱 전환 (1-9)
    for (let i = 1; i <= 9; i++) {
      this.registerShortcut({
        key: i.toString(),
        altKey: true,
        action: `switch-to-app-${i}`,
        description: `Switch to app ${i}`,
        category: 'sidebar',
        handler: () => this.switchToAppByIndex(i - 1)
      });
    }
  }

  private setupEventListeners(): void {
    // 키보드 이벤트
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.element.addEventListener('focusin', this.handleFocusIn.bind(this));
    this.element.addEventListener('focusout', this.handleFocusOut.bind(this));

    // 포커스 트래킹
    this.element.addEventListener('click', this.handleClick.bind(this));

    // DOM 변경 감지 (포커스 가능한 요소 업데이트)
    const observer = new MutationObserver(() => {
      this.updateFocusableElements();
    });

    observer.observe(this.element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tabindex', 'disabled', 'aria-hidden']
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const shortcutKey = this.getShortcutKey(event);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut) {
      // 사이드바가 열려있을 때만 사이드바 단축키 실행
      if (shortcut.category === 'sidebar' || shortcut.category === 'app') {
        const isVisible = this.element.getAttribute('data-visible') === 'true';
        if (!isVisible) return;
      }

      event.preventDefault();
      event.stopPropagation();
      shortcut.handler(event);
    }
  }

  private handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    const focusableIndex = this.focusableElements.findIndex(
      el => el.element === target || el.element.contains(target)
    );

    if (focusableIndex !== -1) {
      this.currentFocusIndex = focusableIndex;
      this.isNavigationMode = true;
      this.highlightFocusedElement(target);
    }
  }

  private handleFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    this.removeFocusHighlight(target);
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const focusableIndex = this.focusableElements.findIndex(
      el => el.element === target || el.element.contains(target)
    );

    if (focusableIndex !== -1) {
      this.currentFocusIndex = focusableIndex;
    }
  }

  private handleTabNavigation(event: KeyboardEvent, direction: number): void {
    event.preventDefault();
    this.updateFocusableElements();

    if (this.focusableElements.length === 0) return;

    let newIndex = this.currentFocusIndex + direction;

    // 순환 네비게이션
    if (newIndex >= this.focusableElements.length) {
      newIndex = 0;
    } else if (newIndex < 0) {
      newIndex = this.focusableElements.length - 1;
    }

    this.focusElementAtIndex(newIndex);
  }

  private handleAppNavigation(event: KeyboardEvent, direction: number): void {
    event.preventDefault();
    
    const tabs = this.element.querySelectorAll('.rightsidebar__tab');
    if (tabs.length === 0) return;

    const currentTab = this.element.querySelector('.rightsidebar__tab.active') as HTMLElement;
    let currentIndex = 0;

    if (currentTab) {
      currentIndex = Array.from(tabs).indexOf(currentTab);
    }

    let newIndex = currentIndex + direction;

    // 순환 네비게이션
    if (newIndex >= tabs.length) {
      newIndex = 0;
    } else if (newIndex < 0) {
      newIndex = tabs.length - 1;
    }

    const newTab = tabs[newIndex] as HTMLElement;
    newTab.click();
    newTab.focus();

    const appId = newTab.getAttribute('data-app-id');
    this.announce(`Switched to ${appId || 'app'}`);
  }

  private handleActivation(event: KeyboardEvent): void {
    event.preventDefault();
    
    const focused = document.activeElement as HTMLElement;
    if (!focused) return;

    // 버튼이나 링크인 경우 클릭
    if (focused.tagName === 'BUTTON' || focused.tagName === 'A') {
      focused.click();
      return;
    }

    // 입력 필드인 경우 편집 모드로
    if (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') {
      return; // 기본 동작 허용
    }

    // 커스텀 요소인 경우 클릭 이벤트 발생
    if (focused.hasAttribute('data-clickable')) {
      focused.click();
    }
  }

  private focusSearchInput(): void {
    const searchInputs = this.element.querySelectorAll('input[type="text"], input[placeholder*="search"], .search-filter');
    const visibleSearch = Array.from(searchInputs).find(input => {
      const element = input as HTMLElement;
      return element.offsetParent !== null; // 보이는 요소인지 확인
    }) as HTMLInputElement;

    if (visibleSearch) {
      visibleSearch.focus();
      visibleSearch.select();
      this.announce('Search input focused');
    }
  }

  private switchToAppByIndex(index: number): void {
    const tabs = this.element.querySelectorAll('.rightsidebar__tab');
    if (index < tabs.length) {
      const tab = tabs[index] as HTMLElement;
      tab.click();
      tab.focus();
      
      const appId = tab.getAttribute('data-app-id');
      this.announce(`Switched to app ${index + 1}: ${appId || 'unknown'}`);
    }
  }

  private updateFocusableElements(): void {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[data-focusable="true"]'
    ];

    const elements = this.element.querySelectorAll(focusableSelectors.join(', '));
    
    this.focusableElements = Array.from(elements)
      .map((element, index) => {
        const htmlElement = element as HTMLElement;
        return {
          element: htmlElement,
          id: htmlElement.id || `focusable-${index}`,
          type: this.getElementType(htmlElement),
          priority: this.getElementPriority(htmlElement),
          isVisible: this.isElementVisible(htmlElement)
        };
      })
      .filter(el => el.isVisible)
      .sort((a, b) => b.priority - a.priority);
  }

  private getElementType(element: HTMLElement): 'tab' | 'button' | 'input' | 'content' {
    if (element.classList.contains('rightsidebar__tab')) return 'tab';
    if (element.tagName === 'BUTTON') return 'button';
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return 'input';
    return 'content';
  }

  private getElementPriority(element: HTMLElement): number {
    // 우선순위: 탭 > 버튼 > 입력 > 기타
    if (element.classList.contains('rightsidebar__tab')) return 100;
    if (element.tagName === 'BUTTON') return 80;
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return 60;
    return 40;
  }

  private isElementVisible(element: HTMLElement): boolean {
    return element.offsetParent !== null && 
           !element.hasAttribute('disabled') &&
           element.getAttribute('aria-hidden') !== 'true';
  }

  private focusElementAtIndex(index: number): void {
    if (index < 0 || index >= this.focusableElements.length) return;

    const focusableElement = this.focusableElements[index];
    this.currentFocusIndex = index;
    
    focusableElement.element.focus();
    
    // 스크롤하여 요소가 보이도록 함
    focusableElement.element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });

    this.announce(`Focused ${focusableElement.type}: ${this.getElementDescription(focusableElement.element)}`);
  }

  private getElementDescription(element: HTMLElement): string {
    // 요소 설명 생성
    const text = element.textContent?.trim() || 
                 element.getAttribute('aria-label') || 
                 element.getAttribute('title') || 
                 element.getAttribute('placeholder') || 
                 'unlabeled element';
    
    return text.substring(0, 50); // 최대 50자
  }

  private highlightFocusedElement(element: HTMLElement): void {
    element.classList.add('keyboard-focused');
    
    // 기존 하이라이트 제거
    this.element.querySelectorAll('.keyboard-focused').forEach(el => {
      if (el !== element) {
        el.classList.remove('keyboard-focused');
      }
    });
  }

  private removeFocusHighlight(element: HTMLElement): void {
    element.classList.remove('keyboard-focused');
  }

  private showHelpModal(): void {
    if (this.helpModal) {
      this.helpModal.remove();
    }

    this.helpModal = ComponentFactory.createModal({
      title: 'Keyboard Shortcuts',
      width: '600px',
      closable: true
    });

    const modalBody = this.helpModal.querySelector('.modal__body')!;
    modalBody.innerHTML = this.generateHelpContent();

    // 닫기 이벤트
    const closeBtn = this.helpModal.querySelector('.modal__close');
    closeBtn?.addEventListener('click', () => {
      this.helpModal?.remove();
      this.helpModal = null;
    });

    // Escape 키로 닫기
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.helpModal?.remove();
        this.helpModal = null;
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(this.helpModal);
    
    // 포커스 설정
    const firstFocusable = this.helpModal.querySelector('button, [tabindex]:not([tabindex="-1"])') as HTMLElement;
    firstFocusable?.focus();
  }

  private generateHelpContent(): string {
    const categories = this.groupShortcutsByCategory();
    
    let content = '<div class="keyboard-help">';
    
    Object.entries(categories).forEach(([category, shortcuts]) => {
      content += `
        <div class="help-category">
          <h3 class="help-category-title">${this.getCategoryTitle(category)}</h3>
          <div class="help-shortcuts">
      `;
      
      shortcuts.forEach(shortcut => {
        content += `
          <div class="help-shortcut">
            <div class="help-keys">
              ${this.formatShortcutKeys(shortcut)}
            </div>
            <div class="help-description">
              ${shortcut.description}
            </div>
          </div>
        `;
      });
      
      content += '</div></div>';
    });
    
    content += '</div>';
    return content;
  }

  private groupShortcutsByCategory(): Record<string, KeyboardShortcut[]> {
    const categories: Record<string, KeyboardShortcut[]> = {};
    
    this.shortcuts.forEach(shortcut => {
      if (!categories[shortcut.category]) {
        categories[shortcut.category] = [];
      }
      categories[shortcut.category].push(shortcut);
    });
    
    return categories;
  }

  private getCategoryTitle(category: string): string {
    const titles: Record<string, string> = {
      global: 'Global Shortcuts',
      sidebar: 'Sidebar Navigation',
      app: 'App Controls'
    };
    return titles[category] || category;
  }

  private formatShortcutKeys(shortcut: KeyboardShortcut): string {
    const keys: string[] = [];
    
    if (shortcut.ctrlKey) keys.push('Ctrl');
    if (shortcut.altKey) keys.push('Alt');
    if (shortcut.shiftKey) keys.push('Shift');
    if (shortcut.metaKey) keys.push('Cmd');
    
    keys.push(this.formatKey(shortcut.key));
    
    return keys.map(key => `<kbd>${key}</kbd>`).join(' + ');
  }

  private formatKey(key: string): string {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Enter': 'Enter',
      'Escape': 'Esc',
      'Tab': 'Tab'
    };
    
    return keyMap[key] || key.toUpperCase();
  }

  private getShortcutKey(event: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    
    parts.push(event.key.toLowerCase());
    
    return parts.join('+');
  }

  private announce(message: string): void {
    this.announcement.textContent = message;
    
    // 짧은 지연 후 메시지 클리어 (스크린 리더가 읽을 시간 확보)
    setTimeout(() => {
      this.announcement.textContent = '';
    }, 1000);
  }

  // ============================================================================
  // 🎯 Public API
  // ============================================================================

  public registerShortcut(shortcut: KeyboardShortcut): void {
    const key = this.createShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  public unregisterShortcut(key: string, modifiers?: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): void {
    const shortcutKey = modifiers ? 
      this.createShortcutKeyFromParts(key, modifiers) : 
      key;
    this.shortcuts.delete(shortcutKey);
  }

  public enableNavigation(): void {
    this.isNavigationMode = true;
    this.updateFocusableElements();
    this.element.classList.add('keyboard-navigation-enabled');
  }

  public disableNavigation(): void {
    this.isNavigationMode = false;
    this.element.classList.remove('keyboard-navigation-enabled');
  }

  public focusFirstElement(): void {
    this.updateFocusableElements();
    if (this.focusableElements.length > 0) {
      this.focusElementAtIndex(0);
    }
  }

  public focusLastElement(): void {
    this.updateFocusableElements();
    if (this.focusableElements.length > 0) {
      this.focusElementAtIndex(this.focusableElements.length - 1);
    }
  }

  public getCurrentFocusedElement(): HTMLElement | null {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableElements.length) {
      return this.focusableElements[this.currentFocusIndex].element;
    }
    return null;
  }

  public getFocusableElements(): FocusableElement[] {
    this.updateFocusableElements();
    return [...this.focusableElements];
  }

  private createShortcutKey(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    
    if (shortcut.ctrlKey) parts.push('ctrl');
    if (shortcut.altKey) parts.push('alt');
    if (shortcut.shiftKey) parts.push('shift');
    if (shortcut.metaKey) parts.push('meta');
    
    parts.push(shortcut.key.toLowerCase());
    
    return parts.join('+');
  }

  private createShortcutKeyFromParts(key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): string {
    const parts: string[] = [];
    
    if (modifiers.ctrlKey) parts.push('ctrl');
    if (modifiers.altKey) parts.push('alt');
    if (modifiers.shiftKey) parts.push('shift');
    if (modifiers.metaKey) parts.push('meta');
    
    parts.push(key.toLowerCase());
    
    return parts.join('+');
  }

  public destroy(): void {
    // 이벤트 리스너 정리
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    
    // DOM 요소 정리
    if (this.helpModal) {
      this.helpModal.remove();
    }
    
    if (this.announcement) {
      this.announcement.remove();
    }
    
    // 하이라이트 제거
    this.element.querySelectorAll('.keyboard-focused').forEach(el => {
      el.classList.remove('keyboard-focused');
    });
    
    this.shortcuts.clear();
    this.focusableElements = [];
  }
}