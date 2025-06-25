import { LogDashboard } from '../pages/LogDashboard.js';
import { PlannerChat } from '../pages/PlannerChat.js';
import { LLMChat } from '../pages/LLMChat.js';

export interface Route {
  path: string;
  component: string;
  title?: string;
}

export class MainContent {
  private element: HTMLElement;
  private currentRoute: string = '/';
  private routes: Map<string, Route> = new Map();
  private boundNavigateHandler: (event: CustomEvent) => void;
  private logDashboard: LogDashboard;
  private plannerChat: PlannerChat;
  private llmChat: LLMChat;

  constructor(
    element: HTMLElement | string,
    logDashboard: LogDashboard,
    plannerChat: PlannerChat,
    llmChat: LLMChat
  ) {
    this.element = typeof element === 'string' 
      ? document.querySelector(element) as HTMLElement 
      : element;
    
    this.logDashboard = logDashboard;
    this.plannerChat = plannerChat;
    this.llmChat = llmChat;
    
    // 이벤트 핸들러 바인딩
    this.boundNavigateHandler = (event: CustomEvent) => {
      this.navigateTo(event.detail.path);
    };

    this.setupRoutes();
    this.setupEventListeners();
  }

  private setupRoutes(): void {
    this.routes.set('/', {
      path: '/',
      component: 'LLMChat',
      title: 'LLM 채팅'
    });

    this.routes.set('logs', {
      path: 'logs',
      component: 'LogDashboard',
      title: '로그 대시보드'
    });

    this.routes.set('planner', {
      path: 'planner',
      component: 'PlannerChat',
      title: 'Recursive Loop'
    });

    this.routes.set('llm-chat', {
      path: 'llm-chat',
      component: 'LLMChat',
      title: 'LLM 채팅'
    });
  }

  private setupEventListeners(): void {
    window.addEventListener('navigate', this.boundNavigateHandler as EventListener);
    window.addEventListener('hashchange', () => {
      const path = window.location.hash.slice(1) || '/';
      this.navigateTo(path, false);
    });
  }

  private async navigateTo(path: string, pushState: boolean = true): Promise<void> {
    // 해시와 선행 슬래시 제거
    const cleanPath = path.replace(/^[/#]+/, '');
    console.log(`Navigating to: "${cleanPath}", available routes:`, Array.from(this.routes.keys()));
    
    const route = this.routes.get(cleanPath || '/');
    
    if (!route) {
      console.warn(`Route not found: ${cleanPath}`);
      console.log('Available routes:', Array.from(this.routes.entries()));
      
      // 기본 라우트로 리다이렉트
      const defaultRoute = this.routes.get('/');
      if (defaultRoute) {
        console.log('Redirecting to default route:', defaultRoute);
        await this.loadComponent(defaultRoute.component);
      } else {
        console.error('No default route found!');
      }
      return;
    }

    this.currentRoute = cleanPath;
    
    if (pushState) {
      history.pushState({ path: cleanPath }, route.title || '', `#${cleanPath}`);
    }

    this.updatePageTitle(route.title || '');
    await this.loadComponent(route.component);
  }

  private updatePageTitle(title: string): void {
    document.title = `Recursive - ${title}`;
  }

  private async loadComponent(componentName: string): Promise<void> {
    if (!this.element) return;

    try {
      console.log(`Loading component: ${componentName}`);
      this.element.innerHTML = '';
      let instance;
      
      // 공유된 페이지 인스턴스 사용
      if (componentName === 'LogDashboard') {
        instance = this.logDashboard;
        console.log('LogDashboard instance:', instance);
      } else if (componentName === 'PlannerChat') {
        instance = this.plannerChat;
        console.log('PlannerChat instance:', instance);
      } else if (componentName === 'LLMChat') {
        instance = this.llmChat;
        console.log('LLMChat instance:', instance);
      }
      
      if (!instance) {
        throw new Error(`Component instance not found for: ${componentName}`);
      }
      
      if (!instance.render) {
        throw new Error(`Component ${componentName} does not have a render method`);
      }
      
      console.log(`Rendering component: ${componentName}`);
      const rendered = await instance.render();
      
      if (rendered instanceof HTMLElement) {
        console.log(`Appending HTMLElement for: ${componentName}`);
        console.log('Rendered element:', rendered);
        console.log('Rendered element children count:', rendered.children.length);
        console.log('Rendered element innerHTML length:', rendered.innerHTML.length);
        console.log('Main element:', this.element);
        console.log('Main element current children:', this.element.children.length);
        
        this.element.appendChild(rendered);
        
        console.log('After appendChild - Main element children:', this.element.children.length);
        console.log('After appendChild - Last child:', this.element.lastElementChild);
        
        // DOM에 실제로 추가되었는지 즉시 확인 (해당 컴포넌트 클래스로 확인)
        const expectedClass = componentName === 'LogDashboard' ? '.log-dashboard' : 
                              componentName === 'PlannerChat' ? '.planner-chat' : 
                              componentName === 'LLMChat' ? '.llm-chat' : '';
        
        if (expectedClass) {
          const addedElement = this.element.querySelector(expectedClass) as HTMLElement;
          console.log(`🔍 DOM query result for ${expectedClass}:`, addedElement);
          
          if (addedElement) {
            const styles = window.getComputedStyle(addedElement);
            console.log(`🎨 ${componentName} element styles:`, {
              display: styles.display,
              visibility: styles.visibility,
              opacity: styles.opacity,
              height: styles.height,
              width: styles.width,
              position: styles.position,
              zIndex: styles.zIndex,
              overflow: styles.overflow
            });
            console.log(`📏 ${componentName} element dimensions:`, {
              offsetWidth: addedElement.offsetWidth,
              offsetHeight: addedElement.offsetHeight,
              scrollHeight: addedElement.scrollHeight,
              clientHeight: addedElement.clientHeight
            });
            
            // 부모 요소도 확인
            const parentStyles = window.getComputedStyle(this.element);
            console.log('👨‍👩‍👧‍👦 Parent main-content styles:', {
              display: parentStyles.display,
              height: parentStyles.height,
              overflow: parentStyles.overflow,
              position: parentStyles.position
            });
          } else {
            console.error(`❌ ${componentName} element not found in DOM immediately after appendChild!`);
          }
        }
        
      } else if (typeof rendered === 'string') {
        console.log(`Setting innerHTML for: ${componentName}`);
        this.element.innerHTML = rendered;
      } else {
        throw new Error(`Invalid render result from ${componentName}: ${typeof rendered}`);
      }
      
      console.log(`Component ${componentName} loaded successfully`);

    } catch (error) {
      console.error(`Failed to load component ${componentName}:`, error);
      this.element.innerHTML = `
        <div class="error-message">
          <h2>컴포넌트 로딩 실패</h2>
          <p>컴포넌트를 로드하는 중 오류가 발생했습니다: ${componentName}</p>
          <details>
            <summary>오류 상세 정보</summary>
            <pre>${error instanceof Error ? error.message : String(error)}</pre>
          </details>
          <button onclick="location.reload()">새로고침</button>
        </div>
      `;
    }
  }

  public async initialize(): Promise<void> {
    // 초기 라우트 로드
    const path = window.location.hash.slice(1) || 'llm-chat';
    await this.navigateTo(path, false);
  }

  public getCurrentRoute(): string {
    return this.currentRoute;
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    window.removeEventListener('navigate', this.boundNavigateHandler as EventListener);
    
    if (this.element) {
      this.element.innerHTML = '';
    }
  }

  setContent(content: string | HTMLElement): void {
    if (this.element) {
      if (typeof content === 'string') {
        this.element.innerHTML = content;
      } else {
        this.element.innerHTML = '';
        this.element.appendChild(content);
      }
    }
  }
} 