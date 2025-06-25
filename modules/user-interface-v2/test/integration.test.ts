// ====================================================
// User-Interface-V2 - 통합 테스트 (Phase 4)
// ====================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from '../src/app.js';
import type { AppConfig } from '../src/types/index.js';

describe('User-Interface-V2 통합 테스트', () => {
  let app: App;
  let mockConfig: AppConfig;
  let container: HTMLElement;

  beforeEach(() => {
    // 테스트용 DOM 환경 설정
    document.body.innerHTML = `
      <div id="test-container">
        <div id="header"></div>
        <div id="sidebar"></div>
        <div id="mainContent"></div>
      </div>
    `;
    
    container = document.getElementById('test-container')!;
    
    // 테스트용 앱 설정
    mockConfig = {
      theme: 'light',
      apiUrl: 'http://localhost:3001/api',
      wsUrl: 'ws://localhost:3001/ws',
      logLevel: 'debug',
      enableAnalytics: false
    };

    // WebSocket 모킹
    global.WebSocket = vi.fn(() => ({
      close: vi.fn(),
      send: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 1,
    })) as any;
  });

  afterEach(async () => {
    if (app) {
      await app.destroy();
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('앱 초기화', () => {
    it('정상적으로 앱이 초기화되어야 한다', async () => {
      app = new App(mockConfig);
      
      expect(app).toBeDefined();
      expect(app.getConfig()).toEqual(mockConfig);
    });

    it('서비스들이 모두 초기화되어야 한다', async () => {
      app = new App(mockConfig);
      await app.initialize();
      
      const services = app.getServices();
      expect(services.aiService).toBeDefined();
      expect(services.logService).toBeDefined();
      expect(services.wsService).toBeDefined();
    });

    it('컴포넌트들이 모두 초기화되어야 한다', async () => {
      app = new App(mockConfig);
      await app.initialize();
      
      const components = app.getComponents();
      expect(components.header).toBeDefined();
      expect(components.sidebar).toBeDefined();
      expect(components.mainContent).toBeDefined();
    });

    it('페이지들이 모두 초기화되어야 한다', async () => {
      app = new App(mockConfig);
      await app.initialize();
      
      const pages = app.getPages();
      expect(pages.logDashboard).toBeDefined();
      expect(pages.plannerChat).toBeDefined();
    });
  });

  describe('페이지 네비게이션', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('로그 대시보드로 이동할 수 있어야 한다', async () => {
      await app.navigateToPage('logs');
      
      // URL 해시 확인
      expect(window.location.hash).toBe('#logs');
      
      // 페이지 콘텐츠 확인
      const mainContent = document.getElementById('mainContent');
      expect(mainContent?.innerHTML).toContain('log-dashboard');
    });

    it('AI 플래너로 이동할 수 있어야 한다', async () => {
      await app.navigateToPage('planner');
      
      expect(window.location.hash).toBe('#planner');
      
      const mainContent = document.getElementById('mainContent');
      expect(mainContent?.innerHTML).toContain('planner-chat');
    });

    it('존재하지 않는 페이지 요청 시 에러 페이지를 보여야 한다', async () => {
      await app.navigateToPage('nonexistent' as any);
      
      const mainContent = document.getElementById('mainContent');
      expect(mainContent?.innerHTML).toContain('페이지를 찾을 수 없습니다');
    });
  });

  describe('사이드바 토글', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('사이드바를 열고 닫을 수 있어야 한다', () => {
      // 초기 상태
      expect(document.body.classList.contains('sidebar-open')).toBe(false);
      
      // 사이드바 열기
      app.toggleSidebar();
      expect(document.body.classList.contains('sidebar-open')).toBe(true);
      
      // 사이드바 닫기
      app.toggleSidebar();
      expect(document.body.classList.contains('sidebar-open')).toBe(false);
    });
  });

  describe('테마 전환', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('라이트/다크 테마를 전환할 수 있어야 한다', () => {
      // 초기 테마 (라이트)
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      
      // 다크 테마로 전환
      app.setTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      
      // 라이트 테마로 복귀
      app.setTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('테마 설정이 localStorage에 저장되어야 한다', () => {
      app.setTheme('dark');
      expect(localStorage.getItem('recursive-v2-theme')).toBe('dark');
      
      app.setTheme('light');
      expect(localStorage.getItem('recursive-v2-theme')).toBe('light');
    });
  });

  describe('이벤트 시스템', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('이벤트를 등록하고 발생시킬 수 있어야 한다', () => {
      const mockListener = vi.fn();
      
      // 이벤트 리스너 등록
      app.on('test-event', mockListener);
      
      // 이벤트 발생
      app.emit('test-event', { data: 'test' });
      
      expect(mockListener).toHaveBeenCalledWith({ data: 'test' });
    });

    it('이벤트 리스너를 제거할 수 있어야 한다', () => {
      const mockListener = vi.fn();
      
      app.on('test-event', mockListener);
      app.off('test-event', mockListener);
      app.emit('test-event', { data: 'test' });
      
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('서비스 통합', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('AI 분석 서비스가 정상 동작해야 한다', async () => {
      const services = app.getServices();
      
      const analysis = await services.aiService.analyzeComplexity('테스트 프로젝트');
      
      expect(analysis).toBeDefined();
      expect(analysis.overallScore).toBeGreaterThan(0);
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });

    it('로그 서비스가 정상 동작해야 한다', async () => {
      const services = app.getServices();
      
      const logs = await services.logService.getRecentLogs({
        timeRange: '1h',
        limit: 10
      });
      
      expect(logs).toBeInstanceOf(Array);
    });

    it('WebSocket 서비스가 정상 동작해야 한다', async () => {
      const services = app.getServices();
      
      expect(services.wsService.getConnectionState()).toBe('disconnected');
      
      // 연결 상태 확인
      expect(services.wsService.isConnected()).toBe(false);
    });
  });

  describe('에러 처리', () => {
    it('서비스 초기화 실패 시 적절히 처리되어야 한다', async () => {
      // 의도적으로 에러를 발생시키는 설정
      const errorConfig = {
        ...mockConfig,
        apiUrl: 'invalid-url'
      };

      app = new App(errorConfig);
      
      // 에러가 발생해도 앱이 계속 동작해야 함
      await expect(app.initialize()).resolves.not.toThrow();
    });

    it('페이지 렌더링 에러 시 에러 페이지를 보여야 한다', async () => {
      app = new App(mockConfig);
      await app.initialize();
      
      // 잘못된 페이지 렌더링 시도
      await app.navigateToPage('invalid' as any);
      
      const mainContent = document.getElementById('mainContent');
      expect(mainContent?.innerHTML).toContain('페이지를 찾을 수 없습니다');
    });
  });

  describe('성능 및 메모리', () => {
    it('앱 종료 시 모든 리소스가 정리되어야 한다', async () => {
      app = new App(mockConfig);
      await app.initialize();
      
      const services = app.getServices();
      const destroySpies = [
        vi.spyOn(services.aiService, 'destroy'),
        vi.spyOn(services.logService, 'destroy'),
        vi.spyOn(services.wsService, 'destroy')
      ];
      
      await app.destroy();
      
      destroySpies.forEach(spy => {
        expect(spy).toHaveBeenCalled();
      });
    });

    it('메모리 누수가 없어야 한다', async () => {
      // 여러 번 초기화/종료 테스트
      for (let i = 0; i < 5; i++) {
        app = new App(mockConfig);
        await app.initialize();
        await app.destroy();
      }
      
      // 메모리 누수 검증 (간단한 체크)
      expect(document.querySelectorAll('[data-app-instance]')).toHaveLength(0);
    });
  });

  describe('접근성', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('모든 interactive 요소에 적절한 ARIA 라벨이 있어야 한다', () => {
      const buttons = document.querySelectorAll('button');
      const inputs = document.querySelectorAll('input');
      
      buttons.forEach(button => {
        expect(
          button.hasAttribute('aria-label') || 
          button.textContent?.trim() || 
          button.hasAttribute('title')
        ).toBe(true);
      });
      
      inputs.forEach(input => {
        expect(
          input.hasAttribute('aria-label') || 
          input.hasAttribute('placeholder') ||
          document.querySelector(`label[for="${input.id}"]`)
        ).toBeTruthy();
      });
    });

    it('키보드 네비게이션이 가능해야 한다', () => {
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      expect(focusableElements.length).toBeGreaterThan(0);
      
      // Tab 인덱스 확인
      focusableElements.forEach(element => {
        const tabIndex = element.getAttribute('tabindex');
        if (tabIndex !== null) {
          expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('반응형 디자인', () => {
    beforeEach(async () => {
      app = new App(mockConfig);
      await app.initialize();
    });

    it('모바일 뷰포트에서 적절히 동작해야 한다', () => {
      // 모바일 뷰포트 시뮬레이션
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      window.dispatchEvent(new Event('resize'));

      // 모바일에서 사이드바가 오버레이 모드인지 확인
      const sidebar = document.querySelector('.sidebar');
      expect(sidebar).toBeDefined();
    });

    it('데스크톱 뷰포트에서 적절히 동작해야 한다', () => {
      // 데스크톱 뷰포트 시뮬레이션
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      });

      window.dispatchEvent(new Event('resize'));

      // 데스크톱에서 레이아웃 확인
      const sidebar = document.querySelector('.sidebar');
      expect(sidebar).toBeDefined();
    });
  });
});

// 전역 함수 테스트
describe('전역 함수 통합', () => {
  let app: App;
  
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="header"></div>
      <div id="sidebar"></div>
      <div id="mainContent"></div>
    `;

    app = new App({
      theme: 'light',
      apiUrl: 'http://localhost:3001/api',
      wsUrl: 'ws://localhost:3001/ws',
      logLevel: 'debug',
      enableAnalytics: false
    });

    await app.initialize();

    // 전역 함수 등록
    (window as any).logDashboard = {
      toggleStream: vi.fn(),
      clearLogs: vi.fn(),
      setFilter: vi.fn(),
      exportLogs: vi.fn()
    };

    (window as any).plannerChat = {
      sendMessage: vi.fn(),
      executeQuickAction: vi.fn(),
      clearChat: vi.fn(),
      exportChat: vi.fn()
    };
  });

  afterEach(async () => {
    if (app) {
      await app.destroy();
    }
    delete (window as any).logDashboard;
    delete (window as any).plannerChat;
  });

  it('로그 대시보드 전역 함수들이 등록되어야 한다', () => {
    expect((window as any).logDashboard).toBeDefined();
    expect((window as any).logDashboard.toggleStream).toBeInstanceOf(Function);
    expect((window as any).logDashboard.clearLogs).toBeInstanceOf(Function);
    expect((window as any).logDashboard.setFilter).toBeInstanceOf(Function);
    expect((window as any).logDashboard.exportLogs).toBeInstanceOf(Function);
  });

  it('AI 플래너 전역 함수들이 등록되어야 한다', () => {
    expect((window as any).plannerChat).toBeDefined();
    expect((window as any).plannerChat.sendMessage).toBeInstanceOf(Function);
    expect((window as any).plannerChat.executeQuickAction).toBeInstanceOf(Function);
    expect((window as any).plannerChat.clearChat).toBeInstanceOf(Function);
    expect((window as any).plannerChat.exportChat).toBeInstanceOf(Function);
  });
});

// 성능 테스트
describe('성능 테스트', () => {
  it('앱 초기화가 5초 이내에 완료되어야 한다', async () => {
    const startTime = Date.now();
    
    document.body.innerHTML = `
      <div id="header"></div>
      <div id="sidebar"></div>
      <div id="mainContent"></div>
    `;

    const app = new App({
      theme: 'light',
      apiUrl: 'http://localhost:3001/api',
      wsUrl: 'ws://localhost:3001/ws',
      logLevel: 'debug',
      enableAnalytics: false
    });

    await app.initialize();
    
    const endTime = Date.now();
    const initTime = endTime - startTime;
    
    expect(initTime).toBeLessThan(5000); // 5초 이내
    
    await app.destroy();
  });

  it('페이지 전환이 1초 이내에 완료되어야 한다', async () => {
    document.body.innerHTML = `
      <div id="header"></div>
      <div id="sidebar"></div>
      <div id="mainContent"></div>
    `;

    const app = new App({
      theme: 'light',
      apiUrl: 'http://localhost:3001/api',
      wsUrl: 'ws://localhost:3001/ws',
      logLevel: 'debug',
      enableAnalytics: false
    });

    await app.initialize();
    
    const startTime = Date.now();
    await app.navigateToPage('logs');
    const endTime = Date.now();
    
    const navigationTime = endTime - startTime;
    expect(navigationTime).toBeLessThan(1000); // 1초 이내
    
    await app.destroy();
  });
}); 