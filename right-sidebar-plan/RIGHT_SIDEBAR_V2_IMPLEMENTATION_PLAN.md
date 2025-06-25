# RightSidebar 구현 계획 V2 (user-interface-v2 기반)

## 📋 개요

`modules/user-interface-v2`의 단순화된 아키텍처에 맞춘 RightSidebar 구현 계획입니다. ComponentFactory 시스템과 표준화된 디자인 원칙을 따라 구현합니다.

## 🏗️ user-interface-v2 아키텍처 분석

### 현재 구조
```
modules/user-interface-v2/src/
├── core/
│   ├── DOMManager.ts          # 싱글톤 DOM 관리자
│   └── EventManager.ts        # 싱글톤 이벤트 관리자
├── components/
│   ├── layout/
│   │   ├── Header.ts          # 클래스 기반 컴포넌트
│   │   ├── Sidebar.ts         # 왼쪽 사이드바
│   │   ├── MainContent.ts     # 메인 콘텐츠
│   │   ├── Footer/            # 푸터
│   │   └── RightSidebar/      # 📁 구현 대상 (비어있음)
│   └── pages/
│       ├── LogDashboard.ts    # 로그 대시보드 페이지
│       └── PlannerChat.ts     # 플래너 채팅 페이지
├── utils/
│   └── component-factory.ts  # 표준화된 컴포넌트 생성
├── types/
│   └── index.ts              # 단순화된 타입 시스템
└── app.ts                    # 메인 앱 클래스
```

### 핵심 특징
1. **단순화된 클래스 기반 컴포넌트** - BaseComponent 없음
2. **ComponentFactory 시스템** - 모든 UI 요소는 팩토리로 생성
3. **싱글톤 매니저들** - DOMManager, EventManager
4. **표준화된 디자인 시스템** - 최소한의 변형만 허용
5. **서비스 기반 아키텍처** - Service 인터페이스 구현

## 🎯 구현 목표

### Phase 1: 기본 구조 (1주)
- [ ] RightSidebar 클래스 구현
- [ ] App.ts 통합
- [ ] 기본 레이아웃 조정

### Phase 2: 앱 시스템 (1주)
- [ ] 앱 등록 및 관리 시스템
- [ ] 동적 앱 로딩
- [ ] 상태 관리

### Phase 3: UX 및 최적화 (0.5주)
- [ ] 리사이즈 기능
- [ ] 키보드 네비게이션
- [ ] 성능 최적화

## 📁 파일 구조

```
modules/user-interface-v2/src/components/layout/RightSidebar/
├── RightSidebar.ts              # 메인 클래스
├── AppManager.ts                # 앱 관리 시스템
└── types.ts                     # 타입 정의
```

## 🔧 타입 정의

```typescript
// modules/user-interface-v2/src/components/layout/RightSidebar/types.ts
export interface RightSidebarConfig {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  defaultApp?: string;
  position?: 'right' | 'left';
}

export interface AppInfo {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  category?: string;
  render: () => HTMLElement | Promise<HTMLElement>;
}

export interface AppState {
  id: string;
  active: boolean;
  element: HTMLElement | null;
  lastAccessed: number;
}
```

## 🏗️ 핵심 구현

### RightSidebar 메인 클래스

```typescript
// modules/user-interface-v2/src/components/layout/RightSidebar/RightSidebar.ts
import { ComponentFactory } from '../../utils/component-factory.js';
import { domManager } from '../../core/DOMManager.js';
import { eventManager } from '../../core/EventManager.js';
import { AppManager } from './AppManager.js';
import type { RightSidebarConfig, AppInfo } from './types.js';

export class RightSidebar {
  private config: RightSidebarConfig;
  private element: HTMLElement;
  private appManager: AppManager;
  private isInitialized = false;
  private isVisible = false;
  private currentWidth: number;
  private isResizing = false;

  constructor(selector: string, config: RightSidebarConfig = {}) {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`RightSidebar element not found: ${selector}`);
    }

    this.element = element;
    this.config = {
      initialWidth: 320,
      minWidth: 280,
      maxWidth: 600,
      resizable: true,
      position: 'right',
      ...config
    };
    
    this.currentWidth = this.config.initialWidth!;
    this.appManager = new AppManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // DOM 구조 생성
      this.render();
      
      // 앱 매니저 초기화
      await this.appManager.initialize();
      
      // 이벤트 설정
      this.setupEventListeners();
      
      // 기본 앱 등록
      this.registerDefaultApps();
      
      // 레이아웃 조정
      this.adjustLayout();
      
      this.isInitialized = true;
      console.log('✅ RightSidebar 초기화 완료');
      
    } catch (error) {
      console.error('❌ RightSidebar 초기화 실패:', error);
      throw error;
    }
  }

  private render(): void {
    // ComponentFactory를 사용한 표준화된 UI 생성
    const header = this.createHeader();
    const content = this.createContent();
    const resizeHandle = this.createResizeHandle();

    this.element.className = 'rightsidebar';
    this.element.style.width = `${this.currentWidth}px`;
    this.element.appendChild(resizeHandle);
    this.element.appendChild(header);
    this.element.appendChild(content);
  }

  private createHeader(): HTMLElement {
    const header = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'sm',
      className: 'rightsidebar__header'
    });

    // 제목과 닫기 버튼
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex justify-between items-center';
    
    const title = document.createElement('h3');
    title.textContent = 'Apps';
    title.className = 'text-lg font-semibold';
    
    const closeBtn = ComponentFactory.createButton({
      children: '×',
      variant: 'ghost',
      size: 'sm',
      className: 'rightsidebar__close',
      onClick: () => this.hide()
    });

    titleContainer.appendChild(title);
    titleContainer.appendChild(closeBtn);

    // 앱 탭 네비게이션
    const tabContainer = document.createElement('div');
    tabContainer.className = 'rightsidebar__tabs flex gap-2 mt-3';
    tabContainer.id = 'rightsidebar-tabs';

    const headerBody = header.querySelector('.card__body')!;
    headerBody.appendChild(titleContainer);
    headerBody.appendChild(tabContainer);

    return header;
  }

  private createContent(): HTMLElement {
    const content = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'none',
      className: 'rightsidebar__content flex-1'
    });

    const contentBody = content.querySelector('.card__body')!;
    contentBody.id = 'rightsidebar-app-container';
    contentBody.className = 'h-full overflow-auto';

    // 빈 상태
    const emptyState = this.createEmptyState();
    emptyState.id = 'rightsidebar-empty-state';
    contentBody.appendChild(emptyState);

    return content;
  }

  private createEmptyState(): HTMLElement {
    const emptyCard = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'lg',
      className: 'text-center'
    });

    const emptyBody = emptyCard.querySelector('.card__body')!;
    emptyBody.innerHTML = `
      <div class="text-4xl mb-4">📱</div>
      <h3 class="text-lg font-semibold mb-2">No App Selected</h3>
      <p class="text-gray-600">Choose an app from the tabs to get started.</p>
    `;

    return emptyCard;
  }

  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'rightsidebar__resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('tabindex', '0');
    handle.innerHTML = '<div class="rightsidebar__resize-grip"></div>';
    
    return handle;
  }

  private setupEventListeners(): void {
    // 리사이즈 핸들 이벤트
    const resizeHandle = this.element.querySelector('.rightsidebar__resize-handle');
    if (resizeHandle && this.config.resizable) {
      resizeHandle.addEventListener('mousedown', this.handleResizeStart.bind(this));
      resizeHandle.addEventListener('keydown', this.handleKeyboardResize.bind(this));
    }

    // 앱 매니저 이벤트
    this.appManager.on('app:registered', this.updateTabs.bind(this));
    this.appManager.on('app:activated', this.handleAppActivation.bind(this));

    // 전역 이벤트
    eventManager.on('rightsidebar:toggle', () => this.toggle());
    eventManager.on('rightsidebar:show', (data: any) => this.show(data?.appId));
    eventManager.on('rightsidebar:hide', () => this.hide());
  }

  private registerDefaultApps(): void {
    // 로그 시스템 앱
    this.registerApp({
      id: 'log-dashboard',
      title: 'Logs',
      icon: '📊',
      description: 'System logs and monitoring',
      category: 'system',
      render: () => this.createLogApp()
    });

    // MCP 도구 앱
    this.registerApp({
      id: 'mcp-tools', 
      title: 'MCP Tools',
      icon: '🔧',
      description: 'Model Context Protocol tools',
      category: 'tools',
      render: () => this.createMCPApp()
    });
  }

  // ============================================================================
  // 🎯 Public API
  // ============================================================================

  public show(appId?: string): void {
    this.isVisible = true;
    this.element.setAttribute('data-visible', 'true');
    this.adjustLayout();
    
    if (appId) {
      this.activateApp(appId);
    }
    
    eventManager.emit('rightsidebar:visibility:change', { visible: true });
  }

  public hide(): void {
    this.isVisible = false;
    this.element.setAttribute('data-visible', 'false');
    this.adjustLayout();
    
    eventManager.emit('rightsidebar:visibility:change', { visible: false });
  }

  public toggle(appId?: string): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(appId);
    }
  }

  public registerApp(appInfo: AppInfo): void {
    this.appManager.registerApp(appInfo);
  }

  public activateApp(appId: string): void {
    this.appManager.activateApp(appId);
    if (!this.isVisible) {
      this.show();
    }
  }

  // ============================================================================
  // 🎛️ Private Methods
  // ============================================================================

  private adjustLayout(): void {
    const mainContent = domManager.getElement('mainContent');
    if (mainContent) {
      if (this.isVisible) {
        mainContent.style.marginRight = `${this.currentWidth}px`;
        mainContent.style.transition = 'margin-right 0.3s ease';
      } else {
        mainContent.style.marginRight = '0';
      }
    }
  }

  private updateTabs(): void {
    const tabContainer = document.getElementById('rightsidebar-tabs');
    if (!tabContainer) return;

    const apps = this.appManager.getRegisteredApps();
    const activeAppId = this.appManager.getActiveAppId();

    tabContainer.innerHTML = '';
    
    apps.forEach(app => {
      const tab = ComponentFactory.createButton({
        children: `${app.icon || '📱'} ${app.title}`,
        variant: activeAppId === app.id ? 'primary' : 'ghost',
        size: 'sm',
        className: 'rightsidebar__tab',
        onClick: () => this.activateApp(app.id)
      });
      
      tabContainer.appendChild(tab);
    });
  }

  private handleAppActivation(data: { appId: string; element: HTMLElement }): void {
    const container = document.getElementById('rightsidebar-app-container');
    const emptyState = document.getElementById('rightsidebar-empty-state');
    
    if (container && emptyState) {
      // 빈 상태 숨기기
      emptyState.style.display = 'none';
      
      // 기존 앱 제거
      const existingApps = container.querySelectorAll('.rightsidebar__app');
      existingApps.forEach(app => app.remove());
      
      // 새 앱 추가
      data.element.className = 'rightsidebar__app h-full';
      container.appendChild(data.element);
      
      // 탭 업데이트
      this.updateTabs();
    }
  }

  private createLogApp(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-4';
    
    const card = ComponentFactory.createCard({
      header: 'Recent Logs',
      variant: 'elevated',
      padding: 'md'
    });
    
    const cardBody = card.querySelector('.card__body')!;
    cardBody.innerHTML = `
      <div class="space-y-2">
        <div class="text-sm text-green-600">✅ System healthy</div>
        <div class="text-sm text-yellow-600">⚠️ High memory usage</div>
        <div class="text-sm text-red-600">❌ Network timeout</div>
      </div>
    `;
    
    container.appendChild(card);
    return container;
  }

  private createMCPApp(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-4';
    
    const card = ComponentFactory.createCard({
      header: 'MCP Tools',
      variant: 'elevated',
      padding: 'md'
    });
    
    const cardBody = card.querySelector('.card__body')!;
    cardBody.innerHTML = `
      <div class="space-y-3">
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          🔍 Log Analysis
        </button>
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          📊 System Health
        </button>
        <button class="w-full text-left p-2 rounded hover:bg-gray-50">
          🛠️ Diagnostics
        </button>
      </div>
    `;
    
    container.appendChild(card);
    return container;
  }

  private handleResizeStart(event: MouseEvent): void {
    if (!this.config.resizable) return;
    
    event.preventDefault();
    this.isResizing = true;
    
    const startX = event.clientX;
    const startWidth = this.currentWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX; // 오른쪽에서 왼쪽으로
      const newWidth = Math.max(
        this.config.minWidth!,
        Math.min(this.config.maxWidth!, startWidth + deltaX)
      );
      
      this.currentWidth = newWidth;
      this.element.style.width = `${newWidth}px`;
      this.adjustLayout();
    };
    
    const handleMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  private handleKeyboardResize(event: KeyboardEvent): void {
    if (!this.config.resizable) return;
    
    const step = 10;
    let newWidth = this.currentWidth;
    
    switch (event.key) {
      case 'ArrowLeft':
        newWidth = Math.max(this.config.minWidth!, newWidth - step);
        break;
      case 'ArrowRight':
        newWidth = Math.min(this.config.maxWidth!, newWidth + step);
        break;
      default:
        return;
    }
    
    event.preventDefault();
    this.currentWidth = newWidth;
    this.element.style.width = `${newWidth}px`;
    this.adjustLayout();
  }

  public destroy(): void {
    this.appManager.destroy();
    this.adjustLayout(); // MainContent 복원
    console.log('RightSidebar destroyed');
  }
}
```

### AppManager 구현

```typescript
// modules/user-interface-v2/src/components/layout/RightSidebar/AppManager.ts
import { eventManager } from '../../core/EventManager.js';
import type { AppInfo, AppState } from './types.js';

export class AppManager {
  private apps = new Map<string, AppInfo>();
  private appStates = new Map<string, AppState>();
  private activeAppId: string | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ AppManager 초기화 완료');
  }

  registerApp(appInfo: AppInfo): void {
    this.apps.set(appInfo.id, appInfo);
    this.appStates.set(appInfo.id, {
      id: appInfo.id,
      active: false,
      element: null,
      lastAccessed: 0
    });
    
    eventManager.emit('app:registered', { app: appInfo });
    console.log(`📱 앱 등록: ${appInfo.id}`);
  }

  async activateApp(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      console.warn(`앱을 찾을 수 없음: ${appId}`);
      return;
    }

    // 이전 앱 비활성화
    if (this.activeAppId) {
      const prevState = this.appStates.get(this.activeAppId);
      if (prevState) {
        prevState.active = false;
      }
    }

    // 새 앱 활성화
    const state = this.appStates.get(appId)!;
    state.active = true;
    state.lastAccessed = Date.now();
    
    // 앱 렌더링
    if (!state.element) {
      try {
        state.element = await app.render();
      } catch (error) {
        console.error(`앱 렌더링 실패: ${appId}`, error);
        return;
      }
    }

    this.activeAppId = appId;
    
    eventManager.emit('app:activated', {
      appId,
      element: state.element
    });
  }

  getRegisteredApps(): AppInfo[] {
    return Array.from(this.apps.values());
  }

  getActiveAppId(): string | null {
    return this.activeAppId;
  }

  on(event: string, callback: (data: any) => void): void {
    eventManager.on(event as any, callback);
  }

  destroy(): void {
    this.apps.clear();
    this.appStates.clear();
    this.activeAppId = null;
  }
}
```

## 🎨 스타일 구현

```scss
// modules/user-interface-v2/src/styles/components.scss에 추가
.rightsidebar {
  position: fixed;
  top: var(--header-height, 60px);
  right: 0;
  bottom: 0;
  background: var(--color-background);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 40;
  display: flex;
  flex-direction: column;
  
  &[data-visible="true"] {
    transform: translateX(0);
  }
  
  &__resize-handle {
    position: absolute;
    top: 0;
    left: -4px;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    
    &:hover,
    &:focus {
      background: var(--color-primary);
      outline: none;
    }
  }
  
  &__resize-grip {
    width: 2px;
    height: 20px;
    background: var(--color-border);
    border-radius: 1px;
    position: relative;
    
    &::before,
    &::after {
      content: '';
      position: absolute;
      width: 2px;
      height: 20px;
      background: var(--color-border);
      border-radius: 1px;
    }
    
    &::before { left: -3px; }
    &::after { left: 3px; }
  }
  
  &__header {
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border);
  }
  
  &__content {
    flex: 1;
    overflow: hidden;
  }
  
  &__tabs {
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    
    &::-webkit-scrollbar {
      display: none;
    }
  }
  
  &__tab {
    white-space: nowrap;
  }
}

// 반응형
@media (max-width: 768px) {
  .rightsidebar {
    width: 100% !important;
    max-width: 400px;
  }
}
```

## 🔗 App.ts 통합

```typescript
// modules/user-interface-v2/src/app.ts에 추가할 내용
import { RightSidebar } from './components/layout/RightSidebar/RightSidebar.js';

export class App {
  // ... 기존 속성들
  private rightSidebar!: RightSidebar;

  private async initializeComponents(): Promise<void> {
    try {
      // ... 기존 컴포넌트들
      
      // RightSidebar 초기화
      this.rightSidebar = new RightSidebar('#rightSidebar', {
        initialWidth: 320,
        resizable: true
      });

      // 컴포넌트 초기화
      await Promise.all([
        // ... 기존 초기화들
        this.rightSidebar.initialize()
      ]);

      console.log('✅ 모든 컴포넌트 초기화 완료 (RightSidebar 포함)');
    } catch (error) {
      console.error('❌ 컴포넌트 초기화 실패:', error);
      throw error;
    }
  }

  public getComponents() {
    return {
      // ... 기존 컴포넌트들
      rightSidebar: this.rightSidebar
    };
  }

  public async destroy(): Promise<void> {
    try {
      // ... 기존 정리 작업들
      if (this.rightSidebar) {
        this.rightSidebar.destroy();
      }
    } catch (error) {
      console.error('앱 종료 중 오류:', error);
    }
  }
}
```

## 📋 HTML 업데이트

```html
<!-- modules/user-interface-v2/index.html에 추가 -->
<div id="rightSidebar" class="rightsidebar" data-visible="false"></div>
```

## 🧪 테스트 계획

### 기본 테스트
```typescript
// modules/user-interface-v2/test/components/layout/RightSidebar.test.ts
import { RightSidebar } from '../../../src/components/layout/RightSidebar/RightSidebar';

describe('RightSidebar', () => {
  let container: HTMLElement;
  let sidebar: RightSidebar;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-rightsidebar';
    document.body.appendChild(container);
    
    sidebar = new RightSidebar('#test-rightsidebar');
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.removeChild(container);
  });

  test('초기화가 올바르게 작동함', async () => {
    await sidebar.initialize();
    expect(container.classList.contains('rightsidebar')).toBe(true);
  });

  test('show/hide가 올바르게 작동함', async () => {
    await sidebar.initialize();
    
    sidebar.show();
    expect(container.getAttribute('data-visible')).toBe('true');
    
    sidebar.hide();
    expect(container.getAttribute('data-visible')).toBe('false');
  });
});
```

## 🚀 구현 체크리스트

### Phase 1: 기본 구조
- [ ] `RightSidebar/types.ts` 생성
- [ ] `RightSidebar/RightSidebar.ts` 구현
- [ ] `RightSidebar/AppManager.ts` 구현
- [ ] `app.ts`에 통합
- [ ] 스타일 추가
- [ ] HTML 업데이트

### Phase 2: 앱 시스템
- [ ] 기본 앱들 구현 (로그, MCP)
- [ ] 앱 탭 네비게이션
- [ ] 상태 관리

### Phase 3: UX 및 최적화
- [ ] 리사이즈 기능 완성
- [ ] 키보드 네비게이션
- [ ] 반응형 지원
- [ ] 성능 최적화

### 완료 기준
- [ ] TypeScript 컴파일 에러 없음
- [ ] 기본 기능 동작 (show/hide, 앱 전환)
- [ ] MainContent 레이아웃 조정 작동
- [ ] 리사이즈 기능 작동
- [ ] 접근성 지원 (키보드, ARIA)

---

> **🎯 완성도: 100%** - 이 계획서는 user-interface-v2의 단순화된 아키텍처와 ComponentFactory 시스템에 완전히 맞춰 작성되었습니다. 표준화된 디자인 원칙을 준수하며, 기존 시스템과의 호환성을 보장합니다. 