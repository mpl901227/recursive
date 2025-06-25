// ============================================
// RightSidebar.test.ts - 기본 테스트
// modules/user-interface-v2/test/components/layout/RightSidebar/RightSidebar.test.ts
// ============================================

import { RightSidebar } from '../../../../src/components/layout/RightSidebar/RightSidebar';
import { domManager } from '../../../../src/core/DOMManager';

// DOM 환경 모킹
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => '',
  }),
});

describe('RightSidebar', () => {
  let container: HTMLElement;
  let mainContent: HTMLElement;
  let sidebar: RightSidebar;

  beforeEach(() => {
    // 테스트 컨테이너 설정
    document.body.innerHTML = `
      <div id="test-rightsidebar" class="rightsidebar" data-visible="false"></div>
      <div id="mainContent" class="main-content"></div>
    `;
    
    container = document.getElementById('test-rightsidebar')!;
    mainContent = document.getElementById('mainContent')!;
    
    // DOMManager 모킹
    jest.spyOn(domManager, 'getElement').mockImplementation((id) => {
      if (id === 'mainContent') return mainContent;
      return null;
    });
    
    sidebar = new RightSidebar('#test-rightsidebar');
  });

  afterEach(() => {
    if (sidebar) {
      sidebar.destroy();
    }
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('초기화', () => {
    test('초기화가 올바르게 작동함', async () => {
      await sidebar.initialize();
      
      expect(container.classList.contains('rightsidebar')).toBe(true);
      expect(container.querySelector('.rightsidebar__header')).toBeTruthy();
      expect(container.querySelector('.rightsidebar__content')).toBeTruthy();
      expect(container.querySelector('.rightsidebar__resize-handle')).toBeTruthy();
    });

    test('중복 초기화를 방지함', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await sidebar.initialize();
      await sidebar.initialize(); // 두 번째 호출
      
      // 초기화 로그가 한 번만 출력되어야 함
      const initLogs = consoleSpy.mock.calls.filter(call => 
        call[0].includes('RightSidebar 초기화 완료')
      );
      expect(initLogs).toHaveLength(1);
    });
  });

  describe('가시성 제어', () => {
    beforeEach(async () => {
      await sidebar.initialize();
    });

    test('show가 올바르게 작동함', () => {
      sidebar.show();
      
      expect(container.getAttribute('data-visible')).toBe('true');
      expect(mainContent.style.marginRight).toBeTruthy();
    });

    test('hide가 올바르게 작동함', () => {
      sidebar.show();
      sidebar.hide();
      
      expect(container.getAttribute('data-visible')).toBe('false');
      expect(mainContent.style.marginRight).toBe('0px');
    });

    test('toggle이 올바르게 작동함', () => {
      // 첫 번째 토글: 보이기
      sidebar.toggle();
      expect(container.getAttribute('data-visible')).toBe('true');
      
      // 두 번째 토글: 숨김
      sidebar.toggle();
      expect(container.getAttribute('data-visible')).toBe('false');
    });
  });

  describe('앱 관리', () => {
    beforeEach(async () => {
      await sidebar.initialize();
    });

    test('앱 등록이 올바르게 작동함', () => {
      const mockApp = {
        id: 'test-app',
        title: 'Test App',
        icon: '🧪',
        render: () => {
          const div = document.createElement('div');
          div.textContent = 'Test App Content';
          return div;
        }
      };

      sidebar.registerApp(mockApp);
      
      // 탭이 생성되었는지 확인
      const tab = container.querySelector('.rightsidebar__tab');
      expect(tab).toBeTruthy();
      expect(tab?.textContent).toContain('Test App');
    });

    test('앱 활성화가 올바르게 작동함', async () => {
      const mockApp = {
        id: 'test-app',
        title: 'Test App',
        icon: '🧪',
        render: () => {
          const div = document.createElement('div');
          div.textContent = 'Test App Content';
          return div;
        }
      };

      sidebar.registerApp(mockApp);
      await sidebar.activateApp('test-app');
      
      // 앱 콘텐츠가 표시되었는지 확인
      const appContent = container.querySelector('.rightsidebar__app');
      expect(appContent).toBeTruthy();
      expect(appContent?.textContent).toContain('Test App Content');
    });
  });

  describe('기본 앱', () => {
    beforeEach(async () => {
      await sidebar.initialize();
    });

    test('기본 앱들이 등록됨', () => {
      const tabs = container.querySelectorAll('.rightsidebar__tab');
      expect(tabs.length).toBe(2); // 로그 앱 + MCP 앱
      
      const tabTexts = Array.from(tabs).map(tab => tab.textContent);
      expect(tabTexts.some(text => text?.includes('Logs'))).toBe(true);
      expect(tabTexts.some(text => text?.includes('MCP Tools'))).toBe(true);
    });

    test('로그 앱이 올바르게 렌더링됨', async () => {
      await sidebar.activateApp('log-dashboard');
      
      const logContent = container.querySelector('.rightsidebar__app');
      expect(logContent?.textContent).toContain('Recent Logs');
      expect(logContent?.textContent).toContain('System healthy');
    });

    test('MCP 앱이 올바르게 렌더링됨', async () => {
      await sidebar.activateApp('mcp-tools');
      
      const mcpContent = container.querySelector('.rightsidebar__app');
      expect(mcpContent?.textContent).toContain('MCP Tools');
      expect(mcpContent?.textContent).toContain('Log Analysis');
    });
  });

  describe('리사이즈 기능', () => {
    beforeEach(async () => {
      await sidebar.initialize();
    });

    test('키보드 리사이즈가 작동함', () => {
      const resizeHandle = container.querySelector('.rightsidebar__resize-handle')!;
      const initialWidth = parseInt(container.style.width);
      
      // ArrowRight 키 이벤트 시뮬레이션
      const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      resizeHandle.dispatchEvent(keyEvent);
      
      const newWidth = parseInt(container.style.width);
      expect(newWidth).toBeGreaterThan(initialWidth);
    });

    test('최소/최대 너비 제한이 작동함', () => {
      const testSidebar = new RightSidebar('#test-rightsidebar', {
        minWidth: 200,
        maxWidth: 400,
        initialWidth: 300
      });
      
      expect(container.style.width).toBe('300px');
    });
  });

  describe('정리', () => {
    test('destroy가 올바르게 작동함', async () => {
      await sidebar.initialize();
      sidebar.show();
      
      sidebar.destroy();
      
      // MainContent 마진이 복원되었는지 확인
      expect(mainContent.style.marginRight).toBe('0px');
    });
  });
});

// 통합 테스트
describe('RightSidebar 통합 테스트', () => {
  test('전체 워크플로우가 올바르게 작동함', async () => {
    document.body.innerHTML = `
      <div id="rightsidebar" class="rightsidebar" data-visible="false"></div>
      <div id="mainContent" class="main-content"></div>
    `;
    
    const sidebar = new RightSidebar('#rightsidebar');
    
    // 1. 초기화
    await sidebar.initialize();
    expect(document.querySelector('.rightsidebar__header')).toBeTruthy();
    
    // 2. 앱 등록
    sidebar.registerApp({
      id: 'custom-app',
      title: 'Custom App',
      render: () => {
        const div = document.createElement('div');
        div.textContent = 'Custom Content';
        return div;
      }
    });
    
    // 3. 사이드바 표시 및 앱 활성화
    sidebar.show('custom-app');
    expect(document.querySelector('[data-visible="true"]')).toBeTruthy();
    
    // 4. 앱 콘텐츠 확인
    await new Promise(resolve => setTimeout(resolve, 100)); // 비동기 렌더링 대기
    const appContent = document.querySelector('.rightsidebar__app');
    expect(appContent?.textContent).toContain('Custom Content');
    
    // 5. 정리
    sidebar.destroy();
  });
});
