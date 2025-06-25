/**
 * @fileoverview LogViewer Component
 * @description 로그 엔트리를 표시하고 관리하는 메인 Feature 컴포넌트
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 2.1 구현
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
// import { ComponentProps } from '../../../types/index.js';
import type { 
  LogEntry, 
  LogQueryParams, 
  LogQueryResult, 
  LogLevel,
  LogViewerProps,
  LogSystemService,
  LogStream,
  LogFilter
} from '../../../types/log-system.js';
import { LogStreamService } from '../../../services/log-system/log-stream-service.js';

// SCSS 스타일 import
import './LogViewer.scss';

/**
 * LogViewer DOM 요소들
 */
interface LogViewerElements {
  container: HTMLElement | null;
  header: HTMLElement | null;
  toolbar: HTMLElement | null;
  searchInput: HTMLElement | null;
  filterPanel: HTMLElement | null;
  logList: HTMLElement | null;
  pagination: HTMLElement | null;
  statusBar: HTMLElement | null;
  loadingIndicator: HTMLElement | null;
  refreshBtn: HTMLElement | null;
  settingsBtn: HTMLElement | null;
  realTimeToggle: HTMLElement | null;
}

/**
 * LogViewer 상태
 */
interface LogViewerState {
  logs: LogEntry[];
  currentQuery: LogQueryParams;
  isLoading: boolean;
  isRealTimeMode: boolean;
  currentPage: number;
  totalPages: number;
  totalLogs: number;
  selectedLevels: LogLevel[];
  searchQuery: string;
  lastRefresh: number;
}

/**
 * LogViewer 컴포넌트
 * 
 * @example
 * ```typescript
 * const logViewer = new LogViewer('#log-viewer', {
 *   autoRefresh: true,
 *   pageSize: 50,
 *   showFilters: true,
 *   showSearch: true,
 *   realTimeMode: false
 * }, eventManager);
 * 
 * await logViewer.initialize();
 * ```
 */
export class LogViewer extends BaseComponent<HTMLElement, LogViewerProps> {
  private elements: LogViewerElements = {
    container: null,
    header: null,
    toolbar: null,
    searchInput: null,
    filterPanel: null,
    logList: null,
    pagination: null,
    statusBar: null,
    loadingIndicator: null,
    refreshBtn: null,
    settingsBtn: null,
    realTimeToggle: null
  };

  private logViewerState: LogViewerState = {
    logs: [],
    currentQuery: { limit: 50, offset: 0 },
    isLoading: false,
    isRealTimeMode: false,
    currentPage: 1,
    totalPages: 1,
    totalLogs: 0,
    selectedLevels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    searchQuery: '',
    lastRefresh: 0
  };

  private logSystemService: LogSystemService | null = null;
  private logStreamService: LogStreamService | null = null;
  private refreshTimer: number | null = null;
  private realTimeStream: LogStream | null = null;

  constructor(
    element: HTMLElement | string,
    props: LogViewerProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: LogViewerProps = {
      autoRefresh: true,
      pageSize: 50,
      showFilters: true,
      showSearch: true,
      realTimeMode: false,
      initialQuery: { limit: 50, offset: 0 },
      visibleColumns: ['timestamp', 'level', 'source', 'message'],
      virtualScrolling: false,
      compact: false,
      ...props
    };

    super(element, defaultProps, eventManager);

    // 초기 쿼리 설정
    if (this.props.initialQuery) {
      this.logViewerState.currentQuery = { ...this.logViewerState.currentQuery, ...this.props.initialQuery };
    }

    // 페이지 크기 설정
    if (this.props.pageSize) {
      this.logViewerState.currentQuery.limit = this.props.pageSize;
    }

    // 실시간 모드 설정
    this.logViewerState.isRealTimeMode = this.props.realTimeMode || false;
  }

  /**
   * 컴포넌트 초기화
   */
  async initialize(): Promise<void> {
    this.logger.info('LogViewer 초기화 시작');

    try {
      // LogSystemService 가져오기
      await this.getLogSystemService();
      
      // LogStreamService 초기화
      await this.initializeLogStreamService();

      // 기본 렌더링
      this.render();

      // DOM 요소 찾기
      this.findDOMElements();

      // 이벤트 바인딩
      this.bindEvents();

      // 초기 로그 로드
      await this.loadLogs();

      // 자동 새로고침 시작
      if (this.props.autoRefresh && !this.logViewerState.isRealTimeMode) {
        this.startAutoRefresh();
      }

      // 실시간 모드 시작
      if (this.logViewerState.isRealTimeMode) {
        await this.startRealTimeMode();
      }

      this.logger.info('LogViewer 초기화 완료');
    } catch (error) {
      this.handleError(error as Error, 'initialize');
      throw error;
    }
  }

  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    this.element.innerHTML = `
      <div class="log-viewer" data-component="LogViewer">
        ${this.renderHeader()}
        ${this.renderToolbar()}
        ${this.props.showFilters ? this.renderFilterPanel() : ''}
        ${this.renderStatusBar()}
        <div class="log-viewer__content">
          ${this.renderLogList()}
          ${this.renderPagination()}
        </div>
        ${this.renderLoadingIndicator()}
      </div>
    `;

    // CSS 클래스 추가
    this.element.classList.add('recursive-log-viewer');
    if (this.props.compact) {
      this.element.classList.add('log-viewer--compact');
    }
  }

  /**
   * 헤더 렌더링
   */
  private renderHeader(): string {
    return `
      <div class="log-viewer__header">
        <div>
          <h2>
          Log Viewer
          <span class="log-viewer__count">(${this.logViewerState.totalLogs} logs)</span>
        </h2>
          <p>Real-time log monitoring and analysis</p>
        </div>
        <div class="log-viewer__controls">
          <button class="log-viewer__refresh-btn log-viewer__clear-btn log-viewer__export-btn" title="Settings">
            ⚙️ Settings
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 툴바 렌더링
   */
  private renderToolbar(): string {
    return `
      <div class="log-viewer__toolbar">
        ${this.props.showSearch ? this.renderSearchInput() : ''}
        <div class="log-viewer__controls">
          <button class="log-viewer__refresh-btn" title="Refresh">
            🔄 Refresh
          </button>
          <button class="log-viewer__clear-btn" title="Clear">
            🗑️ Clear
          </button>
          <button class="log-viewer__export-btn" title="Export">
            📥 Export
          </button>
          <div class="log-viewer__realtime-toggle">
            <input type="checkbox" id="realtime-toggle" ${this.logViewerState.isRealTimeMode ? 'checked' : ''}>
            <label for="realtime-toggle">Real-time</label>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 검색 입력 렌더링
   */
  private renderSearchInput(): string {
    return `
      <div class="log-viewer__search-group">
        <input 
          type="text" 
          class="log-viewer__search-input" 
          placeholder="Search logs..." 
          value="${this.logViewerState.searchQuery}"
        >
        <button class="log-viewer__search-btn">
          🔍 Search
        </button>
      </div>
    `;
  }

  /**
   * 필터 패널 렌더링
   */
  private renderFilterPanel(): string {
    return `
      <div class="log-viewer__filters">
        <div class="log-viewer__filter-group">
          <label>Log Levels:</label>
          <div class="log-viewer__level-filters">
            ${this.renderLevelFilters()}
          </div>
        </div>
        <div class="log-viewer__filter-group">
          <label>Time Range:</label>
          <select class="log-viewer__time-range">
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h" selected>Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>
    `;
  }

  /**
   * 로그 레벨 필터 렌더링
   */
  private renderLevelFilters(): string {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    return levels.map(level => `
      <label class="log-viewer__level-filter">
        <input 
          type="checkbox" 
          value="${level}" 
          ${this.logViewerState.selectedLevels.includes(level) ? 'checked' : ''}
        >
        <span class="log-level log-level--${level.toLowerCase()}">${level}</span>
      </label>
    `).join('');
  }

  /**
   * 로그 목록 렌더링
   */
  private renderLogList(): string {
    return `
      <div class="log-viewer__log-container">
        <div class="log-viewer__log-list">
          ${this.logViewerState.logs.length > 0 ? this.renderLogEntries() : this.renderEmptyState()}
        </div>
      </div>
    `;
  }

  /**
   * 목록 헤더 렌더링
   */
  private renderListHeader(): string {
    const columns = this.props.visibleColumns || ['timestamp', 'level', 'source', 'message'];
    return `
      <div class="log-viewer__log-entry log-viewer__log-entry--header">
        ${columns.map(column => `
          <div class="log-viewer__log-${column}">
            ${column.charAt(0).toUpperCase() + column.slice(1)}
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 로그 엔트리들 렌더링
   */
  private renderLogEntries(): string {
    return this.logViewerState.logs.map((log: LogEntry) => this.renderLogEntry(log)).join('');
  }

  /**
   * 단일 로그 엔트리 렌더링
   */
  private renderLogEntry(log: LogEntry): string {
    const timestamp = new Date(log.timestamp).toLocaleString();
    
    return `
      <div class="log-viewer__log-entry log-viewer__log-entry--${log.level.toLowerCase()}" data-log-id="${log.id}">
        <div class="log-viewer__log-timestamp">${timestamp}</div>
        <div class="log-viewer__log-level">
          <span class="log-level log-level--${log.level.toLowerCase()}">${log.level}</span>
        </div>
        <div class="log-viewer__log-source">${log.source}</div>
        <div class="log-viewer__log-message">${this.escapeHtml(log.message)}</div>
        ${log.trace_id ? `<div class="log-viewer__log-trace" title="Trace ID: ${log.trace_id}"><i class="icon-link"></i></div>` : ''}
      </div>
    `;
  }

  /**
   * 빈 상태 렌더링
   */
  private renderEmptyState(): string {
    return `
      <div class="log-viewer__empty-state">
        <div class="log-viewer__empty-state__icon">📋</div>
        <div class="log-viewer__empty-state__title">No logs found</div>
        <div class="log-viewer__empty-state__message">Try adjusting your filters or search query.</div>
      </div>
    `;
  }

  /**
   * 페이지네이션 렌더링
   */
  private renderPagination(): string {
    if (this.logViewerState.totalPages <= 1) return '';

    return `
      <div class="log-viewer__pagination">
        <div class="log-viewer__pagination-info">
          Page ${this.logViewerState.currentPage} of ${this.logViewerState.totalPages}
          (${this.logViewerState.totalLogs} total logs)
        </div>
        <div class="log-viewer__pagination-controls">
          <button class="log-viewer__pagination-btn" ${this.logViewerState.currentPage <= 1 ? 'disabled' : ''} data-action="prev-page">
            ← Previous
          </button>
          <button class="log-viewer__pagination-btn" ${this.logViewerState.currentPage >= this.logViewerState.totalPages ? 'disabled' : ''} data-action="next-page">
            Next →
        </button>
        </div>
        <div class="log-viewer__page-size">
          <label>Show:</label>
          <select data-action="page-size">
            <option value="25" ${this.props.pageSize === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${this.props.pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${this.props.pageSize === 100 ? 'selected' : ''}>100</option>
          </select>
        </div>
      </div>
    `;
  }

  /**
   * 상태바 렌더링
   */
  private renderStatusBar(): string {
    const lastRefreshTime = this.logViewerState.lastRefresh ? new Date(this.logViewerState.lastRefresh).toLocaleTimeString() : 'Never';
    
    return `
      <div class="log-viewer__stats">
        <div class="log-viewer__stats-left">
          <span class="log-viewer__total-count">
          ${this.logViewerState.totalLogs} logs
        </span>
          <span>Last refresh: ${lastRefreshTime}</span>
        </div>
        <div class="log-viewer__stats-right">
        ${this.logViewerState.isRealTimeMode ? `
            <span class="log-viewer__realtime-status">
              🔴 Real-time active
          </span>
        ` : ''}
          <label class="log-viewer__auto-refresh">
            <input type="checkbox" ${this.props.autoRefresh ? 'checked' : ''} data-action="auto-refresh">
            Auto-refresh
          </label>
        </div>
      </div>
    `;
  }

  /**
   * 로딩 인디케이터 렌더링
   */
  private renderLoadingIndicator(): string {
    return `
      <div class="log-viewer__loading ${this.logViewerState.isLoading ? 'log-viewer__loading--visible' : ''}" style="display: ${this.logViewerState.isLoading ? 'flex' : 'none'}">
        <span>Loading logs...</span>
      </div>
    `;
  }

  /**
   * DOM 요소 찾기
   */
  private findDOMElements(): void {
    this.elements.container = this.element.querySelector('.log-viewer');
    this.elements.header = this.element.querySelector('.log-viewer__header');
    this.elements.toolbar = this.element.querySelector('.log-viewer__toolbar');
    this.elements.searchInput = this.element.querySelector('.log-viewer__search-input');
    this.elements.filterPanel = this.element.querySelector('.log-viewer__filters');
    this.elements.logList = this.element.querySelector('.log-viewer__log-list');
    this.elements.pagination = this.element.querySelector('.log-viewer__pagination');
    this.elements.statusBar = this.element.querySelector('.log-viewer__stats');
    this.elements.loadingIndicator = this.element.querySelector('.log-viewer__loading');
    this.elements.refreshBtn = this.element.querySelector('.log-viewer__refresh-btn');
    this.elements.settingsBtn = this.element.querySelector('.log-viewer__controls button');
    this.elements.realTimeToggle = this.element.querySelector('#realtime-toggle');
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents(): void {
    // 새로고침 버튼
    if (this.elements.refreshBtn) {
      this.addDOMEventListener(this.elements.refreshBtn, 'click', () => {
        this.refreshLogs();
      });
    }

    // 실시간 토글
    if (this.elements.realTimeToggle) {
      this.addDOMEventListener(this.elements.realTimeToggle, 'change', (event) => {
        const target = event.target as HTMLInputElement;
        this.toggleRealTimeMode(target.checked);
      });
    }

    // 검색 입력
    if (this.elements.searchInput) {
      this.addDOMEventListener(this.elements.searchInput, 'input', (event) => {
        const target = event.target as HTMLInputElement;
        this.handleSearchInput(target.value);
      });
    }

    // 페이지네이션
    if (this.elements.pagination) {
      this.addDOMEventListener(this.elements.pagination, 'click', (event) => {
        const target = event.target as HTMLElement;
        const button = target.closest('[data-action]') as HTMLElement;
        if (button) {
          const action = button.getAttribute('data-action');
          this.handlePaginationAction(action);
        }
      });
    }

    // 로그 레벨 필터
    if (this.elements.filterPanel) {
      this.addDOMEventListener(this.elements.filterPanel, 'change', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.type === 'checkbox' && target.closest('.log-viewer__level-filter')) {
          this.handleLevelFilterChange(target.value as LogLevel, target.checked);
        }
      });
    }

    // 페이지네이션 버튼
    if (this.elements.pagination) {
      this.addDOMEventListener(this.elements.pagination, 'click', (event) => {
        const target = event.target as HTMLElement;
        const action = target.getAttribute('data-action');
        if (action) {
          this.handlePaginationAction(action);
        }
      });

      this.addDOMEventListener(this.elements.pagination, 'change', (event) => {
        const target = event.target as HTMLSelectElement;
        const action = target.getAttribute('data-action');
        if (action === 'page-size') {
          this.handlePageSizeChange(parseInt(target.value));
        }
      });
    }

    // 상태바 체크박스
    if (this.elements.statusBar) {
      this.addDOMEventListener(this.elements.statusBar, 'change', (event) => {
        const target = event.target as HTMLInputElement;
        const action = target.getAttribute('data-action');
        if (action === 'auto-refresh') {
          this.handleAutoRefreshToggle(target.checked);
        }
      });
    }

    // 로그 엔트리 클릭 (상세 보기)
    if (this.elements.logList) {
      this.addDOMEventListener(this.elements.logList, 'click', (event) => {
        const target = event.target as HTMLElement;
        const logEntry = target.closest('.log-viewer__log-entry') as HTMLElement;
        if (logEntry && !logEntry.classList.contains('log-viewer__log-entry--header')) {
          const logId = logEntry.getAttribute('data-log-id');
          if (logId) {
            this.handleLogEntryClick(logId);
          }
        }
      });
    }
  }

  /**
   * LogSystemService 가져오기
   */
  private async getLogSystemService(): Promise<void> {
    try {
      // 전역 앱 인스턴스에서 서비스 레지스트리 가져오기
      const app = (window as any).app;
      if (app && app.serviceRegistry) {
        this.logSystemService = app.serviceRegistry.get('log-system');
      }
      
      // 서비스가 없으면 전역에서 다시 시도
      if (!this.logSystemService) {
        this.logSystemService = (window as any).logSystemService;
      }

      if (this.logSystemService) {
      this.logger.info('LogSystemService 연결 완료');
        
        // 서비스가 연결되어 있지 않으면 연결 시도
        if (typeof (this.logSystemService as any).isConnected === 'function' && !(this.logSystemService as any).isConnected()) {
          try {
            if (typeof (this.logSystemService as any).connect === 'function') {
              await (this.logSystemService as any).connect();
            }
            this.logger.info('LogSystemService 연결 성공');
          } catch (error) {
            this.logger.warn('LogSystemService 연결 실패, 목업 데이터 사용:', error);
            this.logSystemService = null;
          }
        }
      } else {
        this.logger.warn('LogSystemService를 찾을 수 없습니다. 목업 데이터를 사용합니다.');
      }
    } catch (error) {
      this.logger.error('LogSystemService 연결 실패:', error);
      this.logSystemService = null;
    }
  }

  /**
   * LogStreamService 초기화
   */
  private async initializeLogStreamService(): Promise<void> {
    try {
      if (!this.logSystemService) {
        throw new Error('LogSystemService가 초기화되지 않았습니다');
      }

      // LogSystemService에서 올바른 설정 가져오기
      const config = (this.logSystemService as any).getConfig();
      if (config) {
        // 설정 확인 및 수정
        console.log('LogViewer LogStreamService 초기화 전 설정:', config);
        
        // 8888 포트 강제 설정
        const correctedConfig = {
          ...config,
          bridgeEndpoint: 'http://localhost:8888',
          websocket: {
            ...config.websocket,
            url: 'ws://localhost:8888/ws'
          }
        };
        
        console.log('LogViewer LogStreamService 수정된 설정:', correctedConfig);
        
        this.logStreamService = new LogStreamService(correctedConfig);
        this.logger.info('LogStreamService 초기화 완료', { websocketUrl: correctedConfig.websocket.url });
      }
    } catch (error) {
      this.logger.error('LogStreamService 초기화 실패:', error);
    }
  }

  /**
   * 로그 로드 (실제 서비스 또는 목업 데이터)
   */
  private async loadLogs(): Promise<void> {
    this.setLoading(true);

    try {
      if (this.logSystemService) {
        // 실제 로그 시스템 사용
      const result: LogQueryResult = await this.logSystemService.query(this.logViewerState.currentQuery);
      
      this.logViewerState.logs = result.logs;
      this.logViewerState.totalLogs = result.count;
      this.logViewerState.totalPages = Math.ceil(result.count / (this.logViewerState.currentQuery.limit || 50));
      this.logViewerState.lastRefresh = Date.now();

        this.logger.info(`실제 로그 ${result.logs.length}개 로드 완료`);
      } else {
        // 목업 데이터 생성
        const mockLogs = this.generateMockLogs();
        this.logViewerState.logs = mockLogs;
        this.logViewerState.totalLogs = mockLogs.length;
        this.logViewerState.totalPages = Math.ceil(mockLogs.length / (this.logViewerState.currentQuery.limit || 50));
        this.logViewerState.lastRefresh = Date.now();

        this.logger.info(`목업 로그 ${mockLogs.length}개 로드 완료`);
      }

      this.updateLogList();
      this.updateStatusBar();
      this.updatePagination();

      this.emit('logs:loaded', { count: this.logViewerState.logs.length, total: this.logViewerState.totalLogs });

    } catch (error) {
      this.logger.error('로그 로드 실패:', error);
      this.handleError(error as Error, 'loadLogs');
      
      // 에러 발생 시 목업 데이터로 폴백
      const mockLogs = this.generateMockLogs();
      this.logViewerState.logs = mockLogs;
      this.logViewerState.totalLogs = mockLogs.length;
      this.logViewerState.totalPages = Math.ceil(mockLogs.length / (this.logViewerState.currentQuery.limit || 50));
      this.updateLogList();
      this.updateStatusBar();
      this.updatePagination();
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * 목업 로그 데이터 생성
   */
  private generateMockLogs(): LogEntry[] {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const sources = ['mcp-server', 'ui-component', 'log-system', 'websocket', 'api-client'];
    const messages = [
      'System startup completed successfully',
      'User authentication successful',
      'Database connection established',
      'Cache miss for key: user_session_123',
      'API request processed in 45ms',
      'WebSocket connection established',
      'Component mounted: LogViewer',
      'Configuration loaded from environment',
      'Memory usage: 234MB / 512MB',
      'Error processing request: timeout',
      'Warning: High CPU usage detected',
      'Debug: Processing batch of 50 items',
      'Fatal error: Database connection lost',
      'Info: Background task completed'
    ];

    const mockLogs: LogEntry[] = [];
    const now = Date.now();

    for (let i = 0; i < 25; i++) {
      const level = levels[Math.floor(Math.random() * levels.length)] as LogLevel;
      const source = sources[Math.floor(Math.random() * sources.length)] as string;
      const message = messages[Math.floor(Math.random() * messages.length)] as string;
      const timestamp = new Date(now - (i * 60000 + Math.random() * 60000)).toISOString();

      mockLogs.push({
        id: `mock-${i}`,
        level,
        source,
        message,
        timestamp,
        metadata: {
          component: source,
          environment: 'development',
          version: '1.0.0'
        },
        tags: [level.toLowerCase(), source],
        trace_id: `trace-${Math.random().toString(36).substr(2, 9)}`
      });
    }

    return mockLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * 로그 새로고침
   */
  private async refreshLogs(): Promise<void> {
    this.logger.info('로그 새로고침 시작');
    await this.loadLogs();
  }

  /**
   * 실시간 모드 토글
   */
  private async toggleRealTimeMode(enabled: boolean): Promise<void> {
    this.logViewerState.isRealTimeMode = enabled;

    if (enabled) {
      this.stopAutoRefresh();
      await this.startRealTimeMode();
    } else {
      await this.stopRealTimeMode();
      if (this.props.autoRefresh) {
        this.startAutoRefresh();
      }
    }

    this.updateStatusBar();
    this.emit('realtime:toggled', { enabled });
  }

  /**
   * 실시간 모드 시작
   */
  private async startRealTimeMode(): Promise<void> {
    this.logger.info('실시간 모드 시작');

    try {
      if (!this.logStreamService) {
        throw new Error('LogStreamService가 초기화되지 않았습니다');
      }

      // 필터 생성
      const filters: LogFilter = {
        levels: this.logViewerState.selectedLevels
      };
      
      if (this.logViewerState.searchQuery) {
        filters.pattern = this.logViewerState.searchQuery;
      }

      // 실시간 스트림 시작
      this.realTimeStream = await this.logStreamService.startStream(
        (entry: LogEntry) => {
          this.handleNewLogEntry(entry);
        },
        filters,
        { useBuffer: true }
      );

      this.logger.info('실시간 스트림 시작됨', { streamId: this.realTimeStream?.id });

    } catch (error) {
      this.logger.error('실시간 모드 시작 실패:', error);
      this.handleError(error as Error, 'startRealTimeMode');
    }
  }

  /**
   * 실시간 모드 중지
   */
  private async stopRealTimeMode(): Promise<void> {
    if (this.realTimeStream) {
      try {
        await this.realTimeStream.stop();
        this.realTimeStream = null;
        this.logger.info('실시간 모드 중지');
      } catch (error) {
        this.logger.error('실시간 모드 중지 실패:', error);
      }
    }
  }

  /**
   * 자동 새로고침 시작
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    const interval = 30000; // 30초
    this.refreshTimer = window.setInterval(() => {
      if (!this.logViewerState.isRealTimeMode) {
        this.refreshLogs();
      }
    }, interval);

    this.logger.info(`자동 새로고침 시작 (${interval}ms 간격)`);
  }

  /**
   * 자동 새로고침 중지
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.logger.info('자동 새로고침 중지');
    }
  }

  /**
   * 검색 입력 처리
   */
  private handleSearchInput(query: string): void {
    this.logViewerState.searchQuery = query;
    if (query) {
      this.logViewerState.currentQuery.search = query;
    } else {
      delete this.logViewerState.currentQuery.search;
    }
    this.logViewerState.currentQuery.offset = 0; // 검색 시 첫 페이지로
    this.logViewerState.currentPage = 1;

    // 디바운스 처리
    clearTimeout((this as any).searchTimeout);
    (this as any).searchTimeout = setTimeout(() => {
      this.loadLogs();
    }, 500);
  }

  /**
   * 로그 레벨 필터 변경 처리
   */
  private handleLevelFilterChange(level: LogLevel, checked: boolean): void {
    if (checked) {
      if (!this.logViewerState.selectedLevels.includes(level)) {
        this.logViewerState.selectedLevels.push(level);
      }
    } else {
      this.logViewerState.selectedLevels = this.logViewerState.selectedLevels.filter(l => l !== level);
    }

    if (this.logViewerState.selectedLevels.length > 0) {
      this.logViewerState.currentQuery.levels = this.logViewerState.selectedLevels;
    } else {
      delete this.logViewerState.currentQuery.levels;
    }
    this.logViewerState.currentQuery.offset = 0;
    this.logViewerState.currentPage = 1;

    this.loadLogs();
  }

  /**
   * 페이지네이션 액션 처리
   */
  private handlePaginationAction(action: string | null): void {
    if (!action) return;

    switch (action) {
      case 'prev-page':
        if (this.logViewerState.currentPage > 1) {
          this.logViewerState.currentPage--;
          this.logViewerState.currentQuery.offset = (this.logViewerState.currentPage - 1) * (this.logViewerState.currentQuery.limit || 50);
          this.loadLogs();
        }
        break;
      case 'next-page':
        if (this.logViewerState.currentPage < this.logViewerState.totalPages) {
          this.logViewerState.currentPage++;
          this.logViewerState.currentQuery.offset = (this.logViewerState.currentPage - 1) * (this.logViewerState.currentQuery.limit || 50);
          this.loadLogs();
        }
        break;
    }
  }

  /**
   * 페이지 크기 변경 처리
   */
  private handlePageSizeChange(pageSize: number): void {
    this.logViewerState.currentQuery.limit = pageSize;
    this.logViewerState.currentQuery.offset = 0;
    this.logViewerState.currentPage = 1;
    this.loadLogs();
  }

  /**
   * 자동 새로고침 토글 처리
   */
  private handleAutoRefreshToggle(enabled: boolean): void {
    if (enabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  /**
   * 로그 엔트리 클릭 처리
   */
  private handleLogEntryClick(logId: string): void {
    const log = this.logViewerState.logs.find(l => l.id === logId);
    if (log) {
      this.emit('log:selected', log);
      // 상세 모달 표시 또는 사이드 패널 열기 등
    }
  }

  /**
   * 새 로그 엔트리 처리 (실시간 모드)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleNewLogEntry(entry: LogEntry): void {
    // 새 로그를 목록 맨 위에 추가
    this.logViewerState.logs.unshift(entry);
    
    // 최대 개수 제한
    const maxLogs = this.logViewerState.currentQuery.limit || 50;
    if (this.logViewerState.logs.length > maxLogs) {
      this.logViewerState.logs = this.logViewerState.logs.slice(0, maxLogs);
    }

    this.updateLogList();
    this.emit('log:new', entry);
  }

  /**
   * 로딩 상태 설정
   */
  private setLoading(loading: boolean): void {
    this.logViewerState.isLoading = loading;
    
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.classList.toggle('log-viewer__loading--visible', loading);
    }
  }

  /**
   * 로그 목록 업데이트
   */
  private updateLogList(): void {
    if (this.elements.logList) {
      this.elements.logList.innerHTML = this.logViewerState.logs.length > 0 ? 
        this.renderLogEntries() : 
        this.renderEmptyState();
    }
  }

  /**
   * 상태바 업데이트
   */
  private updateStatusBar(): void {
    if (this.elements.statusBar) {
      this.elements.statusBar.innerHTML = this.renderStatusBar().replace(/<div class="log-viewer__status">|<\/div>/g, '');
    }
  }

  /**
   * 페이지네이션 업데이트
   */
  private updatePagination(): void {
    if (this.elements.pagination) {
      this.elements.pagination.innerHTML = this.renderPagination().replace(/<div class="log-viewer__pagination">|<\/div>/g, '');
    }
  }

  /**
   * HTML 이스케이프
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 컴포넌트 정리
   */
  async destroy(): Promise<void> {
    this.logger.info('LogViewer 정리 시작');

    // 타이머 정리
    this.stopAutoRefresh();
    
    // 실시간 스트림 정리
    await this.stopRealTimeMode();

    // LogStreamService 정리
    if (this.logStreamService) {
      await this.logStreamService.disconnect();
      this.logStreamService = null;
    }

    // 부모 클래스 정리
    await super.destroy();

    this.logger.info('LogViewer 정리 완료');
  }
}

/**
 * LogViewer 컴포넌트 팩토리 함수
 */
export function createLogViewerComponent(
  element: HTMLElement | string,
  props: LogViewerProps = {},
  eventManager: EventManager
): LogViewer {
  return new LogViewer(element, props, eventManager);
}

