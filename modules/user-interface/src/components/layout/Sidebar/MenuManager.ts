import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';

export interface MenuManagerProps extends ComponentProps {
  menuItems?: MenuItemConfig[];
  allowMultipleExpanded?: boolean;
  defaultExpanded?: string[];
  autoCollapse?: boolean;
}

export interface MenuItemConfig {
  id: string;
  title: string;
  icon?: string;
  url?: string;
  children?: MenuItemConfig[];
  disabled?: boolean;
  badge?: string | number;
  target?: '_blank' | '_self';
  onClick?: () => void;
}

export class MenuManager extends BaseComponent<HTMLElement, MenuManagerProps> {
  private menuItems: MenuItemConfig[] = [];
  private expandedItems = new Set<string>();

  constructor(
    element: HTMLElement | string,
    props: MenuManagerProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: MenuManagerProps = {
      menuItems: [
        {
          id: 'dashboard',
          title: '대시보드',
          icon: '📊',
          url: '#/dashboard'
        },
        {
          id: 'chat',
          title: '채팅',
          icon: '💬',
          children: [
            { id: 'new-chat', title: '새 채팅', url: '#/chat/new' },
            { id: 'chat-history', title: '채팅 기록', url: '#/chat/history' }
          ]
        },
        {
          id: 'tools',
          title: '도구',
          icon: '🔧',
          children: [
            { id: 'mcp-tools', title: 'MCP 도구', url: '#/tools/mcp' },
            { id: 'file-manager', title: '파일 관리', url: '#/tools/files' }
          ]
        },
        {
          id: 'settings',
          title: '설정',
          icon: '⚙️',
          url: '#/settings'
        }
      ],
      allowMultipleExpanded: true,
      defaultExpanded: ['chat', 'tools'],
      autoCollapse: false,
      ...props
    };

    super(element, defaultProps, eventManager);
    this.menuItems = this.props.menuItems || [];
    
    // Set default expanded items
    if (this.props.defaultExpanded) {
      this.props.defaultExpanded.forEach(id => this.expandedItems.add(id));
    }
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.render();
    this.setupEventListeners();
    
    // 초기 expanded 상태 동기화
    this.syncInitialExpandedState();
    
    console.debug('MenuManager component initialized');
  }

  private syncInitialExpandedState(): void {
    // 렌더링 후 DOM이 준비되면 초기 expanded 상태를 동기화
    requestAnimationFrame(() => {
      this.expandedItems.forEach(itemId => {
        const itemElement = this.element.querySelector(`[data-menu-item="${itemId}"]`);
        const childrenContainer = itemElement?.querySelector('.menu-children') as HTMLElement;
        
        if (childrenContainer && childrenContainer.classList.contains('expanded')) {
          // 이미 expanded 클래스가 있지만 height가 설정되지 않은 경우
          childrenContainer.style.height = 'auto';
          console.log(`🔧 MenuManager: Synced initial expanded state for ${itemId}`);
        }
      });
    });
  }

  render(): void {
    this.element.innerHTML = this.renderMenuItems(this.menuItems);
  }

  private renderMenuItems(items: MenuItemConfig[], level = 0): string {
    return items.map(item => this.renderMenuItem(item, level)).join('');
  }

  private renderMenuItem(item: MenuItemConfig, level = 0): string {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = this.expandedItems.has(item.id);
    const isDisabled = item.disabled;
    // CSS 변수를 사용한 레벨 기반 indentation 제거 - CSS에서 처리
    const levelClass = level > 0 ? ` level-${level}` : '';

    let itemClass = 'menu-item';
    if (hasChildren) itemClass += ' has-children';
    if (isExpanded) itemClass += ' expanded';
    if (isDisabled) itemClass += ' disabled';
    if (level > 0) itemClass += ' sub-item';
    itemClass += levelClass;

    const badge = item.badge ? `<span class="menu-badge">${item.badge}</span>` : '';
    const icon = item.icon ? `<span class="menu-icon">${item.icon}</span>` : '';
    const expandIcon = hasChildren ? `<span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>` : '';

    let content = '';
    if (item.url && !hasChildren) {
      content = `
        <a href="${item.url}" 
           class="menu-link" 
           ${item.target ? `target="${item.target}"` : ''}
           data-item-id="${item.id}"
           ${isDisabled ? 'tabindex="-1"' : ''}>
          ${icon}
          <span class="menu-text">${item.title}</span>
          ${badge}
        </a>
      `;
    } else {
      content = `
        <button class="menu-button" 
                data-item-id="${item.id}"
                ${isDisabled ? 'disabled' : ''}
                ${hasChildren ? 'aria-expanded="' + isExpanded + '"' : ''}>
          ${expandIcon}
          ${icon}
          <span class="menu-text">${item.title}</span>
          ${badge}
        </button>
      `;
    }

    let childrenHtml = '';
    if (hasChildren) {
      // 자식 메뉴 컨테이너를 항상 생성하되, 초기 상태에 따라 클래스를 설정
      const childrenClass = `menu-children ${isExpanded ? 'expanded' : 'collapsed'}`;
      childrenHtml = `
        <ul class="${childrenClass}" data-parent="${item.id}">
          ${this.renderMenuItems(item.children!, level + 1)}
        </ul>
      `;
    }

    return `
      <li class="${itemClass}" data-menu-item="${item.id}">
        ${content}
        ${childrenHtml}
      </li>
    `;
  }

  private setupEventListeners(): void {
    // Menu item clicks
    this.addDOMEventListener(this.element, 'click', this.handleMenuItemClick.bind(this));
    
    // Keyboard navigation
    this.addDOMEventListener(this.element, 'keydown', ((event: Event) => {
      this.handleKeyDown(event as KeyboardEvent);
    }) as EventListener);

    // Global navigation events
    this.on('navigation:select', this.handleNavigationSelect.bind(this));
    this.on('menu:expand', this.handleMenuExpand.bind(this));
    this.on('menu:collapse', this.handleMenuCollapse.bind(this));
  }

  private handleMenuItemClick(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest('.menu-button') as HTMLButtonElement;
    const link = target.closest('.menu-link') as HTMLAnchorElement;

    if (button) {
      event.preventDefault();
      const itemId = button.dataset.itemId;
      if (itemId) {
        this.toggleItem(itemId);
      }
    } else if (link) {
      const itemId = link.dataset.itemId;
      if (itemId) {
        this.selectItem(itemId);
        
        // Custom onClick handler
        const item = this.findMenuItem(itemId);
        if (item?.onClick) {
          event.preventDefault();
          item.onClick();
        }
      }
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    
    switch (event.key) {
      case 'Enter':
      case ' ':
        if (target.classList.contains('menu-button')) {
          event.preventDefault();
          target.click();
        }
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        this.focusNextItem(target);
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        this.focusPreviousItem(target);
        break;
        
      case 'ArrowRight':
        if (target.classList.contains('menu-button')) {
          const itemId = target.dataset.itemId;
          if (itemId) {
            this.expandItem(itemId);
          }
        }
        break;
        
      case 'ArrowLeft':
        if (target.classList.contains('menu-button')) {
          const itemId = target.dataset.itemId;
          if (itemId) {
            this.collapseItem(itemId);
          }
        }
        break;
    }
  }

  private handleNavigationSelect(event: any): void {
    this.selectItem(event.itemId);
  }

  private handleMenuExpand(event: any): void {
    this.expandItem(event.itemId);
  }

  private handleMenuCollapse(event: any): void {
    this.collapseItem(event.itemId);
  }

  public toggleItem(itemId: string): void {
    const wasExpanded = this.expandedItems.has(itemId);
    console.log(`🔄 MenuManager: Toggle item ${itemId} - was expanded: ${wasExpanded}`);
    
    if (wasExpanded) {
      this.collapseItem(itemId);
    } else {
      this.expandItem(itemId);
    }
  }

  public expandItem(itemId: string): void {
    const item = this.findMenuItem(itemId);
    if (!item || !item.children) {
      console.log(`🚫 MenuManager: Cannot expand ${itemId} - item not found or no children`);
      return;
    }

    console.log(`📂 MenuManager: Expanding ${itemId} - allowMultiple: ${this.props.allowMultipleExpanded}`);

    // Auto-collapse other items if not allowing multiple
    if (!this.props.allowMultipleExpanded) {
      console.log(`🧹 MenuManager: Clearing other expanded items`);
      this.expandedItems.clear();
    }

    this.expandedItems.add(itemId);
    console.log(`✅ MenuManager: Added ${itemId} to expanded set. Current set:`, Array.from(this.expandedItems));
    
    this.updateItemDisplay(itemId);
    
    this.emit('menu:item-expanded', { itemId });
  }

  public collapseItem(itemId: string): void {
    console.log(`📁 MenuManager: Collapsing ${itemId}`);
    this.expandedItems.delete(itemId);
    console.log(`✅ MenuManager: Removed ${itemId} from expanded set. Current set:`, Array.from(this.expandedItems));
    
    this.updateItemDisplay(itemId);
    
    this.emit('menu:item-collapsed', { itemId });
  }

  public selectItem(itemId: string): void {
    // Remove previous selection
    const previousSelected = this.element.querySelector('.menu-item.selected');
    if (previousSelected) {
      previousSelected.classList.remove('selected');
    }

    // Add selection to current item
    const itemElement = this.element.querySelector(`[data-menu-item="${itemId}"]`);
    if (itemElement) {
      itemElement.classList.add('selected');
    }

    this.emit('menu:item-selected', { itemId });
  }

  private updateItemDisplay(itemId: string): void {
    const itemElement = this.element.querySelector(`[data-menu-item="${itemId}"]`);
    if (!itemElement) {
      console.warn(`MenuManager: Item element not found for ID: ${itemId}`);
      return;
    }

    const isExpanded = this.expandedItems.has(itemId);
    const button = itemElement.querySelector('.menu-button');
    const expandIcon = itemElement.querySelector('.expand-icon');
    const childrenContainer = itemElement.querySelector('.menu-children');

    console.log(`🔧 MenuManager: Updating item display - ${itemId}, expanded: ${isExpanded}, childrenContainer found: ${!!childrenContainer}`);

    // Update classes
    itemElement.classList.toggle('expanded', isExpanded);

    // Update button aria-expanded
    if (button) {
      button.setAttribute('aria-expanded', isExpanded.toString());
    }

    // Update expand icon
    if (expandIcon) {
      expandIcon.textContent = isExpanded ? '▼' : '▶';
    }

    // Show/hide children with simplified height animation
    if (childrenContainer) {
      const container = childrenContainer as HTMLElement;
      
      if (isExpanded) {
        // 펼칠 때: 자연스러운 높이 애니메이션
        container.classList.remove('collapsed');
        container.classList.add('expanded');
        
        // 높이 측정 및 설정
        container.style.height = 'auto';
        const targetHeight = container.scrollHeight;
        container.style.height = '0px';
        
        // 다음 프레임에서 높이 적용 (smooth transition)
        requestAnimationFrame(() => {
          container.style.height = `${targetHeight}px`;
          
          // 애니메이션 완료 후 auto로 변경
          setTimeout(() => {
            if (container.classList.contains('expanded')) {
              container.style.height = 'auto';
            }
          }, 300);
        });
      } else {
        // 접을 때: 현재 높이에서 0으로
        container.classList.remove('expanded');
        container.classList.add('collapsed');
        
        const currentHeight = container.scrollHeight;
        container.style.height = `${currentHeight}px`;
        
        requestAnimationFrame(() => {
          container.style.height = '0px';
        });
      }
      
      console.log(`🔧 MenuManager: Updated children container - expanded: ${isExpanded}, height animation applied`);
    } else {
      console.warn(`MenuManager: Children container not found for item: ${itemId}`);
    }
  }

  private focusNextItem(currentElement: HTMLElement): void {
    const allFocusable = Array.from(
      this.element.querySelectorAll('.menu-button, .menu-link:not([tabindex="-1"])')
    ) as HTMLElement[];
    
    if (allFocusable.length === 0) return;
    
    const currentIndex = allFocusable.indexOf(currentElement);
    if (currentIndex === -1) return; // 현재 엘리먼트가 목록에 없는 경우
    
    const nextIndex = (currentIndex + 1) % allFocusable.length;
    const nextElement = allFocusable[nextIndex];
    if (nextElement && typeof nextElement.focus === 'function') {
      nextElement.focus();
    }
  }

  private focusPreviousItem(currentElement: HTMLElement): void {
    const allFocusable = Array.from(
      this.element.querySelectorAll('.menu-button, .menu-link:not([tabindex="-1"])')
    ) as HTMLElement[];
    
    if (allFocusable.length === 0) return;
    
    const currentIndex = allFocusable.indexOf(currentElement);
    if (currentIndex === -1) return; // 현재 엘리먼트가 목록에 없는 경우
    
    const prevIndex = currentIndex === 0 ? allFocusable.length - 1 : currentIndex - 1;
    const prevElement = allFocusable[prevIndex];
    if (prevElement && typeof prevElement.focus === 'function') {
      prevElement.focus();
    }
  }

  private findMenuItem(itemId: string): MenuItemConfig | null {
    const search = (items: MenuItemConfig[]): MenuItemConfig | null => {
      for (const item of items) {
        if (item.id === itemId) {
          return item;
        }
        if (item.children) {
          const found = search(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this.menuItems);
  }

  public updateMenuItems(items: MenuItemConfig[]): void {
    this.menuItems = items;
    this.render();
  }

  public addMenuItem(item: MenuItemConfig, parentId?: string): void {
    if (parentId) {
      const parent = this.findMenuItem(parentId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children?.push(item);
      }
    } else {
      this.menuItems.push(item);
    }
    this.render();
  }

  public removeMenuItem(itemId: string): void {
    const removeFromItems = (items: MenuItemConfig[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue; // Skip if item is undefined
        
        if (item.id === itemId) {
          items.splice(i, 1);
          return true;
        }
        if (item.children && removeFromItems(item.children)) {
          return true;
        }
      }
      return false;
    };

    if (removeFromItems(this.menuItems)) {
      this.expandedItems.delete(itemId);
      this.render();
    }
  }

  public getExpandedItems(): string[] {
    return Array.from(this.expandedItems);
  }

  public setExpandedItems(itemIds: string[]): void {
    this.expandedItems.clear();
    itemIds.forEach(id => this.expandedItems.add(id));
    this.render();
  }

  async destroy(): Promise<void> {
    console.debug('MenuManager component destroyed');
    await super.destroy();
  }
}