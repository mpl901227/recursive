import { eventManager } from '../../../core/EventManager.js';
import { ComponentFactory } from '../../../utils/component-factory.js';

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
      event.preventDefault();
      shortcut.handler(event);
    }
  }

  private handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    const index = this.focusableElements.findIndex(item => item.element === target);
    
    if (index !== -1) {
      this.currentFocusIndex = index;
      this.highlightFocusedElement(target);
      this.announce(this.getElementDescription(target));
    }
  }

  private handleFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    this.removeFocusHighlight(target);
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const index = this.focusableElements.findIndex(item => item.element === target);
    
    if (index !== -1) {
      this.currentFocusIndex = index;
    }
  }

  private handleTabNavigation(event: KeyboardEvent, direction: number): void {
    event.preventDefault();
    
    const visibleElements = this.focusableElements.filter(item => item.isVisible);
    if (visibleElements.length === 0) return;

    let nextIndex = this.currentFocusIndex + direction;
    
    if (nextIndex >= visibleElements.length) {
      nextIndex = 0;
    } else if (nextIndex < 0) {
      nextIndex = visibleElements.length - 1;
    }

    this.focusElementAtIndex(nextIndex);
  }

  private handleAppNavigation(event: KeyboardEvent, direction: number): void {
    event.preventDefault();
    
    const tabs = this.focusableElements.filter(item => item.type === 'tab' && item.isVisible);
    if (tabs.length === 0) return;

    const currentTabIndex = tabs.findIndex(item => item.element === document.activeElement);
    let nextIndex = currentTabIndex + direction;
    
    if (nextIndex >= tabs.length) {
      nextIndex = 0;
    } else if (nextIndex < 0) {
      nextIndex = tabs.length - 1;
    }

    const nextTab = tabs[nextIndex].element;
    nextTab.focus();
    nextTab.click();
  }

  private handleActivation(event: KeyboardEvent): void {
    event.preventDefault();
    
    const target = document.activeElement as HTMLElement;
    if (!target || !this.element.contains(target)) return;

    // 버튼이나 탭 활성화
    if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'tab') {
      target.click();
      return;
    }

    // 입력 필드 포커스
    if (target.tagName === 'INPUT') {
      (target as HTMLInputElement).focus();
      return;
    }
  }

  private focusSearchInput(): void {
    const searchInput = this.element.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      this.announce('Search input focused');
    }
  }

  private switchToAppByIndex(index: number): void {
    const tabs = this.focusableElements.filter(item => item.type === 'tab' && item.isVisible);
    if (index >= 0 && index < tabs.length) {
      const tab = tabs[index].element;
      tab.focus();
      tab.click();
      this.announce(`Switched to ${this.getElementDescription(tab)}`);
    }
  }

  private updateFocusableElements(): void {
    const elements = Array.from(this.element.querySelectorAll(
      'button, [role="tab"], input, [tabindex="0"]'
    )) as HTMLElement[];

    this.focusableElements = elements
      .filter(element => !element.hasAttribute('disabled') && !element.hasAttribute('aria-hidden'))
      .map(element => ({
        element,
        id: element.id || this.generateElementId(element),
        type: this.getElementType(element),
        priority: this.getElementPriority(element),
        isVisible: this.isElementVisible(element)
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  private generateElementId(element: HTMLElement): string {
    const type = this.getElementType(element);
    const text = element.textContent?.trim() || '';
    return `${type}-${text.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  private getElementType(element: HTMLElement): 'tab' | 'button' | 'input' | 'content' {
    if (element.getAttribute('role') === 'tab') return 'tab';
    if (element.tagName === 'BUTTON') return 'button';
    if (element.tagName === 'INPUT') return 'input';
    return 'content';
  }

  private getElementPriority(element: HTMLElement): number {
    switch (this.getElementType(element)) {
      case 'tab': return 1;
      case 'button': return 2;
      case 'input': return 3;
      default: return 4;
    }
  }

  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  private focusElementAtIndex(index: number): void {
    const element = this.focusableElements[index]?.element;
    if (element) {
      element.focus();
      this.currentFocusIndex = index;
      this.announce(this.getElementDescription(element));
    }
  }

  private getElementDescription(element: HTMLElement): string {
    const type = this.getElementType(element);
    const text = element.textContent?.trim() || '';
    const ariaLabel = element.getAttribute('aria-label');
    
    return ariaLabel || `${type} ${text}`;
  }

  private highlightFocusedElement(element: HTMLElement): void {
    element.classList.add('keyboard-focused');
    
    // 포커스 링 스타일
    element.style.outline = '2px solid var(--color-primary)';
    element.style.outlineOffset = '2px';
  }

  private removeFocusHighlight(element: HTMLElement): void {
    element.classList.remove('keyboard-focused');
    element.style.outline = '';
    element.style.outlineOffset = '';
  }

  private showHelpModal(): void {
    if (this.helpModal) {
      this.helpModal.remove();
    }

    this.helpModal = ComponentFactory.createCard({
      variant: 'elevated',
      padding: 'lg',
      className: 'keyboard-help-modal'
    });

    const content = this.generateHelpContent();
    this.helpModal.innerHTML = content;

    // 모달 위치 설정
    this.helpModal.style.position = 'fixed';
    this.helpModal.style.top = '50%';
    this.helpModal.style.left = '50%';
    this.helpModal.style.transform = 'translate(-50%, -50%)';
    this.helpModal.style.zIndex = '9999';
    this.helpModal.style.maxHeight = '80vh';
    this.helpModal.style.overflowY = 'auto';

    document.body.appendChild(this.helpModal);

    // ESC로 닫기
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.helpModal?.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };

    document.addEventListener('keydown', handleEscape);
  }

  private generateHelpContent(): string {
    const shortcuts = this.groupShortcutsByCategory();
    let content = '<h2 class="text-xl font-bold mb-4">Keyboard Shortcuts</h2>';

    Object.entries(shortcuts).forEach(([category, categoryShortcuts]) => {
      content += `
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-2">${this.getCategoryTitle(category)}</h3>
          <div class="grid gap-2">
            ${categoryShortcuts.map(shortcut => `
              <div class="flex justify-between items-center">
                <span class="text-gray-700">${shortcut.description}</span>
                <kbd class="px-2 py-1 bg-gray-100 rounded">${this.formatShortcutKeys(shortcut)}</kbd>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    return content;
  }

  private groupShortcutsByCategory(): Record<string, KeyboardShortcut[]> {
    const groups: Record<string, KeyboardShortcut[]> = {
      global: [],
      sidebar: [],
      app: []
    };

    this.shortcuts.forEach(shortcut => {
      groups[shortcut.category].push(shortcut);
    });

    return groups;
  }

  private getCategoryTitle(category: string): string {
    switch (category) {
      case 'global': return 'Global Shortcuts';
      case 'sidebar': return 'Sidebar Navigation';
      case 'app': return 'App Controls';
      default: return category;
    }
  }

  private formatShortcutKeys(shortcut: KeyboardShortcut): string {
    const keys: string[] = [];
    
    if (shortcut.ctrlKey) keys.push('Ctrl');
    if (shortcut.altKey) keys.push('Alt');
    if (shortcut.shiftKey) keys.push('Shift');
    if (shortcut.metaKey) keys.push('Meta');
    
    keys.push(this.formatKey(shortcut.key));
    
    return keys.join(' + ');
  }

  private formatKey(key: string): string {
    switch (key) {
      case ' ': return 'Space';
      case 'ArrowUp': return '↑';
      case 'ArrowDown': return '↓';
      case 'ArrowLeft': return '←';
      case 'ArrowRight': return '→';
      default: return key.length === 1 ? key.toUpperCase() : key;
    }
  }

  private getShortcutKey(event: KeyboardEvent): string {
    const parts = [];
    
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    
    parts.push(event.key.toLowerCase());
    
    return parts.join('+');
  }

  private announce(message: string): void {
    this.announcement.textContent = message;
    
    // 2초 후 메시지 제거
    setTimeout(() => {
      if (this.announcement.textContent === message) {
        this.announcement.textContent = '';
      }
    }, 2000);
  }

  public registerShortcut(shortcut: KeyboardShortcut): void {
    const key = this.createShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  public unregisterShortcut(key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}): void {
    const shortcutKey = this.createShortcutKeyFromParts(key, modifiers);
    this.shortcuts.delete(shortcutKey);
  }

  public enableNavigation(): void {
    this.isNavigationMode = true;
    this.updateFocusableElements();
  }

  public disableNavigation(): void {
    this.isNavigationMode = false;
  }

  public focusFirstElement(): void {
    if (this.focusableElements.length > 0) {
      this.focusElementAtIndex(0);
    }
  }

  public focusLastElement(): void {
    if (this.focusableElements.length > 0) {
      this.focusElementAtIndex(this.focusableElements.length - 1);
    }
  }

  public getCurrentFocusedElement(): HTMLElement | null {
    return this.focusableElements[this.currentFocusIndex]?.element || null;
  }

  public getFocusableElements(): FocusableElement[] {
    return this.focusableElements;
  }

  private createShortcutKey(shortcut: KeyboardShortcut): string {
    return this.createShortcutKeyFromParts(shortcut.key, {
      ctrlKey: shortcut.ctrlKey,
      altKey: shortcut.altKey,
      shiftKey: shortcut.shiftKey,
      metaKey: shortcut.metaKey
    });
  }

  private createShortcutKeyFromParts(key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): string {
    const parts = [];
    
    if (modifiers.ctrlKey) parts.push('ctrl');
    if (modifiers.altKey) parts.push('alt');
    if (modifiers.shiftKey) parts.push('shift');
    if (modifiers.metaKey) parts.push('meta');
    
    parts.push(key.toLowerCase());
    
    return parts.join('+');
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.element.removeEventListener('focusin', this.handleFocusIn.bind(this));
    this.element.removeEventListener('focusout', this.handleFocusOut.bind(this));
    this.element.removeEventListener('click', this.handleClick.bind(this));

    // 도움말 모달 제거
    this.helpModal?.remove();

    // ARIA 알림 요소 제거
    this.announcement.remove();
  }
} 