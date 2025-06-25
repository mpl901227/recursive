// ========================================
// Recursive v2 - 메인 앱 클래스 (단순화)
// ========================================

import type { 
  AppConfig, 
  Theme, 
  PageRoute, 
  ConnectionState,
  EventListener,
  AppEvent,
  EventMap
} from './types/index.js';

import { AIAnalysisServiceImpl } from './services/AIAnalysisService.js';
import { LogServiceImpl } from './services/LogService.js';
import { WebSocketServiceImpl } from './services/WebSocketService.js';

import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { Footer } from './components/layout/Footer';
import { RightSidebar, RightSidebarAppHelper } from './components/layout/RightSidebar';

import { LogDashboard } from './components/pages/LogDashboard';
import { PlannerChat } from './components/pages/PlannerChat';
import { LLMChat } from './components/pages/LLMChat';
import { domManager } from './core/DOMManager';
import { eventManager } from './core/EventManager';
import { toast } from './utils/toast';
import { errorHandler, reportError } from './utils/error-handler';
import { initializeDemo, setupKeyboardShortcuts, showHelp } from './utils/demo';

export class App {
  private config: AppConfig;
  private currentRoute: PageRoute = 'llm-chat';
  private sidebarOpen = false;
  private initialized = false;
  
  // 서비스들
  private aiService: AIAnalysisServiceImpl;
  private logService: LogServiceImpl;
  private wsService: WebSocketServiceImpl;
  
  // 컴포넌트들
  private header!: Header;
  private sidebar!: Sidebar;
  private mainContent!: MainContent;
  private footer!: Footer;
  private rightSidebar!: RightSidebar;
  
  // 페이지들
  private logDashboard: LogDashboard;
  private plannerChat: PlannerChat;
  private llmChat: LLMChat;
  
  // 이벤트 리스너들
  private eventListeners = new Map<string, Set<EventListener>>();
  
  constructor(config: AppConfig) {
    this.config = config;
    
    // 서비스 인스턴스 생성 (초기화는 나중에)
    this.aiService = new AIAnalysisServiceImpl();
    this.logService = new LogServiceImpl();
    this.wsService = new WebSocketServiceImpl();
    
    // 페이지 인스턴스 생성 (서비스 주입)
    this.logDashboard = new LogDashboard(this.logService);
    this.plannerChat = new PlannerChat(this.aiService);
    this.llmChat = new LLMChat();
    
    // 컴포넌트 인스턴스 생성
    this.header = new Header('#header');
    this.sidebar = new Sidebar('#sidebar');
    this.mainContent = new MainContent(
      '#mainContent',
      this.logDashboard,
      this.plannerChat,
      this.llmChat
    );
    this.footer = new Footer({
      showSettings: true
    });
    
    // RightSidebar 인스턴스 생성 및 기본 앱들 등록
    this.rightSidebar = new RightSidebar('#rightSidebar', {
      width: '320px',
      resizable: true,
      apps: [
        RightSidebarAppHelper.createLogViewerApp(),
        RightSidebarAppHelper.createAIChatApp(),
        RightSidebarAppHelper.createMetricsApp()
      ]
    });
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('앱이 이미 초기화되어 있습니다.');
      return;
    }

    console.log('🚀 앱 초기화 시작');

    try {
      // DOM 매니저 초기화
      await domManager.initialize();
      console.log('✅ DOM 매니저 초기화 완료');

      // 이벤트 매니저 초기화
      eventManager.initialize();
      console.log('✅ 이벤트 매니저 초기화 완료');

      // 서비스 초기화
      await this.initializeServices();
      
      // 컴포넌트 초기화
      await this.initializeComponents();
      
      // 이벤트 리스너 설정
      this.setupEventListeners();
      
      // 라우팅 설정
      this.setupInitialRouting();
      
      this.initialized = true;
      console.log('✅ 앱 초기화 완료');
      
      // Phase 1 기능 초기화 완료 알림
      toast.success('앱이 성공적으로 초기화되었습니다!', { duration: 3000 });
      
      // Phase 1 & 2 데모 초기화
      initializeDemo();
      setupKeyboardShortcuts();
      
      // 앱 준비 완료
      this.onAppReady();
    } catch (error) {
      console.error('❌ 앱 초기화 실패:', error);
      reportError(error as Error, { context: 'app_initialization' });
      toast.error('앱 초기화 중 오류가 발생했습니다.');
      throw error;
    }
  }
  
  private async initializeServices(): Promise<void> {
    console.log('🔧 서비스 초기화 중...');
    
    try {
      // 서비스 초기화 (병렬)
      await Promise.all([
        this.aiService.initialize(),
        this.logService.initialize(),
        this.wsService.initialize()
      ]);
      
      // WebSocket 연결 (순차)
      if (this.config.wsUrl) {
        await this.wsService.connect(this.config.wsUrl);
        console.log('✅ WebSocket 연결 완료');
      }
      
      console.log('✅ 모든 서비스 초기화 완료');
    } catch (error) {
      console.error('❌ 서비스 초기화 실패:', error);
      throw error;
    }
  }
  
  private async initializeComponents(): Promise<void> {
    try {
      // 컴포넌트 생성 (constructor에서 이미 생성됨)
      // 페이지 컴포넌트 초기화
      await Promise.all([
        this.logDashboard.initialize(),
        this.plannerChat.initialize(),
        this.llmChat.initialize()
      ]);

      // UI 컴포넌트 초기화
      await Promise.all([
        this.header.initialize(),
        this.sidebar.initialize(),
        this.mainContent.initialize(),
        this.footer.initialize(),
        this.rightSidebar.initialize()
      ]);

      // Header와 RightSidebar 연결
      this.header.setRightSidebar(this.rightSidebar);

      // 사이드바 기본 상태 설정
      this.sidebarOpen = true;
      this.sidebar.setOpen(true);

      console.log('✅ 모든 컴포넌트 초기화 완료');
    } catch (error) {
      console.error('❌ 컴포넌트 초기화 실패:', error);
      throw error;
    }
  }
  
  private setupEventListeners(): void {
    // WebSocket 연결 상태 변경 이벤트
    this.wsService.on('connectionStateChange', (state: ConnectionState) => {
      this.header.updateConnectionStatus(state);
    });
    
    // 로그 서비스 상태 변경 이벤트
    this.logService.on('connectionStateChange', (connected: boolean) => {
      this.header.updateLogServiceStatus(connected);
    });
    
    // AI 서비스 상태 변경 이벤트
    this.aiService.on('statusChange', (status: string) => {
      this.header.updateAIServiceStatus(status);
    });
  }
  
  private onAppReady(): void {
    const app = document.getElementById('app');
    const loadingScreen = document.getElementById('loadingScreen');

    if (app && loadingScreen) {
      app.classList.add('ready');
      loadingScreen.style.display = 'none';
    }
    
    console.log('✅ 애플리케이션이 성공적으로 시작되었습니다.');
  }
  
  private setupInitialRouting(): void {
    // MainContent.ts에서 라우팅을 처리하도록 위임
    // 초기 해시가 없으면 llm-chat으로 설정
    if (!window.location.hash) {
      window.location.hash = 'llm-chat';
    }
  }
  
  public async navigateToPage(route: PageRoute): Promise<void> {
    // MainContent.ts의 라우팅 시스템을 사용하도록 위임
    window.location.hash = route;
    
    // 사이드바 활성 메뉴 업데이트
    this.sidebar.setActive(route);
    
    this.currentRoute = route;
    this.emit('route:change', { route });
  }
  
  public toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebar.setOpen(this.sidebarOpen);
    this.emit('sidebar:toggle', { open: this.sidebarOpen });
  }
  
  public setTheme(theme: Theme): void {
    this._setTheme(theme);
    this.emit('theme:change', { theme });
  }

  private _setTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('recursive-v2-theme', theme);
    this.config.theme = theme;
  }
  
  public getConnectionState(): ConnectionState {
    return this.wsService.getConnectionState();
  }
  
  // 이벤트 시스템 (단순화)
  public on<K extends keyof EventMap>(type: K, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }
  
  public off<K extends keyof EventMap>(type: K, listener: EventListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  
  public emit<K extends keyof EventMap>(type: K, data: any): void {
    const event: AppEvent = {
      type,
      data,
      timestamp: Date.now()
    };
    
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`이벤트 리스너 에러 (${type}):`, error);
        }
      });
    }
  }
  
  public async destroy(): Promise<void> {
    // 서비스 정리
    await Promise.all([
      this.aiService.destroy(),
      this.logService.destroy(),
      this.wsService.destroy()
    ]);
    
    // 컴포넌트 정리
    this.header.destroy();
    this.sidebar.destroy();
    this.mainContent.destroy();
    this.footer.destroy();
    this.rightSidebar.destroy();
    this.logDashboard.destroy();
    this.plannerChat.destroy();
    
    // 이벤트 리스너 정리
    this.eventListeners.clear();
    
    this.initialized = false;
  }
  
  // 디버깅용 메서드들
  public getConfig(): AppConfig {
    return { ...this.config };
  }
  
  public getServices() {
    return {
      ai: this.aiService,
      log: this.logService,
      ws: this.wsService
    };
  }
  
  public getComponents() {
    return {
      header: this.header,
      sidebar: this.sidebar,
      mainContent: this.mainContent,
      footer: this.footer,
      rightSidebar: this.rightSidebar
    };
  }
  
  public getPages() {
    return {
      logDashboard: this.logDashboard,
      plannerChat: this.plannerChat
    };
  }


} 