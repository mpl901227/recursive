export interface MenuItem {
  id: string;
  title: string;
  icon: string;
  path: string;
  children?: MenuItem[];
}

export interface SidebarProps {
  menuItems?: MenuItem[];
}

export class Sidebar {
  private isOpen = false;
  private activeItem: string | null = null;
  private element: HTMLElement;

  constructor(element: HTMLElement | string, props: SidebarProps = {}) {
    this.element = typeof element === 'string' 
      ? document.querySelector(element) as HTMLElement 
      : element;
      
    if (!this.element) {
      throw new Error('Sidebar element not found');
    }

    // 기존 nav-menu가 있다면 제거
    const existingNavMenu = this.element.querySelector('.nav-menu');
    if (existingNavMenu) {
      existingNavMenu.remove();
    }
    
    // 기본 메뉴 아이템 설정
    const defaultMenuItems: MenuItem[] = [
      {
        id: 'planner',
        title: 'Looper',
        icon: '🔄',
        path: '#/planner'
      },
      {
        id: 'llm-chat',
        title: 'LLM Chat',
        icon: '🧠',
        path: '#/llm-chat'
      },
      {
        id: 'logs',
        title: 'Logs',
        icon: '📊',
        path: '#/logs'
      }
    ];
    
    this.createMenuItems(props.menuItems || defaultMenuItems);
  }

  public async initialize(): Promise<void> {
    // 초기화 로직이 필요한 경우 여기에 추가
  }

  public setActive(itemId: string): void {
    this.setActiveItem(itemId);
  }

  public setOpen(open: boolean): void {
    this.isOpen = open;
    if (this.isOpen) {
      this.element.classList.add('open');
    } else {
      this.element.classList.remove('open');
    }
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    const navItems = this.element.querySelector('.nav-menu')?.querySelectorAll('.nav-item');
    navItems?.forEach(item => {
      const clone = item.cloneNode(true);
      item.parentNode?.replaceChild(clone, item);
    });
    
    // DOM 요소 정리
    if (this.element) {
      this.element.innerHTML = '';
    }
  }

  private createMenuItems(menuItems: MenuItem[] = []): void {
    const navMenu = document.createElement('nav');
    navMenu.className = 'nav-menu';
    
    menuItems.forEach(item => {
      const menuItem = document.createElement('a');
      menuItem.className = 'nav-item';
      menuItem.href = item.path;
      menuItem.dataset.page = item.id;
      
      if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'nav-icon';
        icon.textContent = item.icon;
        menuItem.appendChild(icon);
      }
      
      const title = document.createElement('span');
      title.className = 'nav-title';
      title.textContent = item.title;
      
      menuItem.appendChild(title);
      navMenu.appendChild(menuItem);
    });
    
    this.element.innerHTML = '';
    this.element.appendChild(navMenu);
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const navItems = this.element.querySelector('.nav-menu')?.querySelectorAll('.nav-item');
    
    navItems?.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = (item as HTMLElement).dataset.page;
        const href = (item as HTMLElement).getAttribute('href');
        
        if (page && href) {
          this.setActiveItem(page);
          window.location.hash = href.replace('#', '');
        }
      });
    });
  }

  private setActiveItem(itemId: string): void {
    const prevActive = this.element.querySelector('.nav-item.active');
    prevActive?.classList.remove('active');

    const newActive = this.element.querySelector(`[data-page="${itemId}"]`);
    newActive?.classList.add('active');

    this.activeItem = itemId;
  }
} 