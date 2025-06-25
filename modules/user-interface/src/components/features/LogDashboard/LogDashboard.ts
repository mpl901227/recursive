/**
 * @fileoverview LogDashboard Component
 * @description 로그 시스템 대시보드 컴포넌트
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 2.3 구현
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';
import type { 
  LogDashboardProps,
  DashboardWidget,
  SystemStatusData,
  ErrorChartData,
  RecentErrorsData,
  LogStreamData,
  LogSystemService,
  LogFilter,
  LogLevel,
  TimeRange,
  LogStream,
  LogEntry
} from '../../../types/log-system.js';
import { LogStreamService } from '../../../services/log-system/log-stream-service.js';

// SCSS 스타일 import
import './LogDashboard.scss';

/**
 * LogDashboard DOM 요소들
 */
interface LogDashboardElements {
  container: HTMLElement | null;
  header: HTMLElement | null;
  toolbar: HTMLElement | null;
  widgetGrid: HTMLElement | null;
  refreshButton: HTMLElement | null;
  timeRangeSelect: HTMLElement | null;
  layoutToggle: HTMLElement | null;
  settingsButton: HTMLElement | null;
  widgets: Map<string, HTMLElement>;
}

/**
 * LogDashboard 상태
 */
interface LogDashboardState {
  layout: 'grid' | 'masonry' | 'flex';
  timeRange: TimeRange;
  refreshInterval: number;
  isAutoRefresh: boolean;
  widgets: Map<string, DashboardWidget>;
  widgetData: Map<string, any>;
  isLoading: boolean;
  lastUpdated: number;
  refreshTimer: number | null;
}

/**
 * LogDashboard 컴포넌트
 * 
 * @example
 * ```typescript
 * const dashboard = new LogDashboard('#dashboard', {
 *   layout: 'grid',
 *   widgets: ['system-status', 'error-chart', 'recent-errors', 'log-stream'],
 *   refreshInterval: 30000,
 *   timeRange: '1h'
 * }, eventManager);
 * 
 * await dashboard.initialize();
 * ```
 */
export class LogDashboard extends BaseComponent<HTMLElement, LogDashboardProps & ComponentProps> {
  private elements: LogDashboardElements = {
    container: null,
    header: null,
    toolbar: null,
    widgetGrid: null,
    refreshButton: null,
    timeRangeSelect: null,
    layoutToggle: null,
    settingsButton: null,
    widgets: new Map()
  };

  private dashboardState: LogDashboardState = {
    layout: 'grid',
    timeRange: '1h',
    refreshInterval: 30000,
    isAutoRefresh: true,
    widgets: new Map(),
    widgetData: new Map(),
    isLoading: false,
    lastUpdated: 0,
    refreshTimer: null
  };

  private logSystemService: LogSystemService | null = null;
  private logStreamService: LogStreamService | null = null;
  private logStreamFilters: LogFilter[] = [];
  private activeLogStream: LogStream | null = null;

  // LogDashboardProps 타입의 속성들을 별도로 관리
  private dashboardProps: LogDashboardProps;

  constructor(
    element: HTMLElement | string,
    props: LogDashboardProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: LogDashboardProps = {
      layout: 'grid',
      widgets: ['system-status', 'error-chart', 'recent-errors', 'log-stream'],
      refreshInterval: 30000,
      timeRange: '1h',
      customWidgets: [],
      ...props
    };

    // ComponentProps 호환 버전으로 변환
    const componentProps: ComponentProps = {
      ...defaultProps,
      timeRange: typeof defaultProps.timeRange === 'string' ? defaultProps.timeRange : '1h'
    };

    super(element, componentProps, eventManager);

    // LogDashboardProps 저장
    this.dashboardProps = defaultProps;

    // 초기 상태 설정
    this.dashboardState.layout = this.dashboardProps.layout ?? 'grid';
    this.dashboardState.timeRange = this.dashboardProps.timeRange ?? '1h';
    this.dashboardState.refreshInterval = this.dashboardProps.refreshInterval ?? 30000;

    // 기본 위젯 설정
    this.initializeDefaultWidgets();
  }

  /**
   * 컴포넌트 초기화
   */
  async initialize(): Promise<void> {
    this.logger.info('LogDashboard 초기화 시작');

    try {
      // 기본 렌더링 먼저 수행
      this.render();

      // DOM 요소 찾기
      this.findDOMElements();

      // 이벤트 바인딩
      this.bindEvents();

      // MCP 이벤트 리스너 설정
      this.setupMCPEventListeners();

      // LogSystemService 가져오기 (실패해도 계속 진행)
      try {
        await this.getLogSystemService();
        
        // LogStreamService 초기화
        await this.initializeLogStreamService();

      // 초기 데이터 로드
      await this.loadInitialData();
        
        this.logger.info('LogSystemService 연결 성공');
      } catch (serviceError) {
        this.logger.warn('LogSystemService 연결 실패, 오프라인 모드로 동작:', serviceError);
        
        // 연결 실패 시 기본 데이터로 위젯 초기화
        await this.loadFallbackData();
      }

      // 자동 새로고침 시작
      if (this.dashboardState.isAutoRefresh) {
        this.startAutoRefresh();
      }

      this.logger.info('LogDashboard 초기화 완료');
    } catch (error) {
      this.handleError(error as Error, 'initialize');
      // 초기화 실패 시에도 기본 UI는 표시
      this.render();
      this.findDOMElements();
      this.bindEvents();
      await this.loadFallbackData();
    }
  }

  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    this.element.innerHTML = `
      <div class="log-dashboard" data-component="LogDashboard">
        ${this.renderHeader()}
        ${this.renderToolbar()}
        ${this.renderWidgetGrid()}
      </div>
    `;

    // CSS 클래스 추가
    this.element.classList.add('recursive-log-dashboard');
  }

  /**
   * 대시보드 헤더 렌더링
   */
  private renderHeader(): string {
    return `
      <div class="log-dashboard__header">
        <div class="log-dashboard__title">
          <h2>로그 시스템 대시보드</h2>
          <span class="log-dashboard__last-updated">
            마지막 업데이트: ${this.formatLastUpdated()}
          </span>
        </div>
        <div class="log-dashboard__status">
          ${this.renderConnectionStatus()}
        </div>
      </div>
    `;
  }

  /**
   * 툴바 렌더링
   */
  private renderToolbar(): string {
    return `
      <div class="log-dashboard__toolbar">
        <div class="log-dashboard__controls">
          <select class="log-dashboard__time-range">
            <option value="15m" ${this.dashboardState.timeRange === '15m' ? 'selected' : ''}>15분</option>
            <option value="1h" ${this.dashboardState.timeRange === '1h' ? 'selected' : ''}>1시간</option>
            <option value="6h" ${this.dashboardState.timeRange === '6h' ? 'selected' : ''}>6시간</option>
            <option value="24h" ${this.dashboardState.timeRange === '24h' ? 'selected' : ''}>24시간</option>
            <option value="7d" ${this.dashboardState.timeRange === '7d' ? 'selected' : ''}>7일</option>
          </select>
          
          <button class="log-dashboard__refresh-btn" title="새로고침">
            <span class="icon-refresh"></span>
            새로고침
          </button>
          
          <button class="log-dashboard__layout-toggle" title="레이아웃 변경">
            <span class="icon-grid"></span>
            ${this.dashboardState.layout}
          </button>
          
          <button class="log-dashboard__settings-btn" title="설정">
            <span class="icon-settings"></span>
            설정
          </button>
        </div>
        
        <div class="log-dashboard__auto-refresh">
          <label class="log-dashboard__auto-refresh-toggle">
            <input type="checkbox" ${this.dashboardState.isAutoRefresh ? 'checked' : ''}>
            <span>자동 새로고침 (${this.dashboardState.refreshInterval / 1000}초)</span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * 위젯 그리드 렌더링
   */
  private renderWidgetGrid(): string {
    return `
      <div class="log-dashboard__widget-grid log-dashboard__widget-grid--${this.dashboardState.layout}">
        ${Array.from(this.dashboardState.widgets.values())
          .filter(widget => widget.visible)
          .map(widget => this.renderWidget(widget))
          .join('')}
      </div>
    `;
  }

  /**
   * 개별 위젯 렌더링
   */
  private renderWidget(widget: DashboardWidget): string {
    const data = this.dashboardState.widgetData.get(widget.id);
    
    return `
      <div class="log-dashboard__widget log-dashboard__widget--${widget.type} log-dashboard__widget--${widget.size}" 
           data-widget-id="${widget.id}"
           data-widget-type="${widget.type}">
        <div class="log-dashboard__widget-header">
          <h3 class="log-dashboard__widget-title">${widget.title}</h3>
          <div class="log-dashboard__widget-actions">
            <button class="log-dashboard__widget-refresh" title="새로고침">
              <span class="icon-refresh"></span>
            </button>
            <button class="log-dashboard__widget-config" title="설정">
              <span class="icon-settings"></span>
            </button>
          </div>
        </div>
        <div class="log-dashboard__widget-content">
          ${this.renderWidgetContent(widget, data)}
        </div>
      </div>
    `;
  }

  /**
   * 위젯 콘텐츠 렌더링
   */
  private renderWidgetContent(widget: DashboardWidget, data: any): string {
    if (!data) {
      return this.renderWidgetLoading();
    }

    switch (widget.type) {
      case 'system-status':
        return this.renderSystemStatusWidget(data as SystemStatusData);
      case 'error-chart':
        return this.renderErrorChartWidget(data as ErrorChartData);
      case 'recent-errors':
        return this.renderRecentErrorsWidget(data as RecentErrorsData);
      case 'log-stream':
        return this.renderLogStreamWidget(data as LogStreamData);
      case 'stats-overview':
        return this.renderStatsOverviewWidget(data);
      default:
        return '<div class="widget-error">알 수 없는 위젯 타입</div>';
    }
  }

  /**
   * 시스템 상태 위젯 렌더링
   */
  private renderSystemStatusWidget(data: SystemStatusData): string {
    return `
      <div class="system-status-widget">
        <div class="system-status__overview">
          <div class="status-item status-item--${data.log_system_connected ? 'connected' : 'disconnected'}">
            <span class="status-icon"></span>
            <span class="status-label">로그 시스템</span>
            <span class="status-value">${data.log_system_connected ? '연결됨' : '연결 끊김'}</span>
          </div>
          
          <div class="status-item status-item--${data.python_server_status === 'running' ? 'running' : 'stopped'}">
            <span class="status-icon"></span>
            <span class="status-label">Python 서버</span>
            <span class="status-value">${this.getServerStatusText(data.python_server_status)}</span>
          </div>
        </div>
        
        <div class="system-status__collectors">
          <h4>수집기 상태</h4>
          <div class="collectors-grid">
            ${Object.entries(data.collectors || {}).map(([name, status]) => `
              <div class="collector-item collector-item--${status?.active ? 'active' : 'inactive'}">
                <span class="collector-icon"></span>
                <span class="collector-name">${name.toUpperCase()}</span>
                <span class="collector-status">${status?.active ? '활성' : '비활성'}</span>
                ${status?.last_activity ? `<span class="collector-activity">${this.formatRelativeTime(status.last_activity)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="system-status__metrics">
          <div class="metric-item">
            <span class="metric-label">총 로그 수</span>
            <span class="metric-value">${this.formatNumber(data.total_logs)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">DB 크기</span>
            <span class="metric-value">${this.formatNumber(data.database_size_mb || 0)} MB</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">메모리 사용량</span>
            <span class="metric-value">${this.formatNumber(data.memory_usage_mb || 0)} MB</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">업타임</span>
            <span class="metric-value">${this.formatUptime(data.uptime_seconds || 0)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 에러 차트 위젯 렌더링
   */
  private renderErrorChartWidget(data: ErrorChartData): string {
    return `
      <div class="error-chart-widget">
        <div class="error-chart__time-series">
          <h4>시간별 에러율</h4>
          <div class="chart-container" id="error-time-chart">
            ${this.renderSimpleLineChart(data.time_series)}
          </div>
        </div>
        
        <div class="error-chart__distribution">
          <div class="error-chart__by-source">
            <h4>소스별 에러 분포</h4>
            <div class="distribution-list">
              ${(data.by_source || []).map(item => `
                <div class="distribution-item">
                  <span class="distribution-label">${item?.source || 'Unknown'}</span>
                  <span class="distribution-bar">
                    <span class="distribution-fill" style="width: ${item?.percentage || 0}%"></span>
                  </span>
                  <span class="distribution-value">${this.formatNumber(item?.error_count || 0)} (${this.formatNumber(item?.percentage || 0)}%)</span>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="error-chart__by-level">
            <h4>레벨별 에러 분포</h4>
            <div class="level-distribution">
              ${(data.by_level || []).map(item => `
                <div class="level-item level-item--${(item?.level || 'unknown').toLowerCase()}">
                  <span class="level-badge">${item?.level || 'UNKNOWN'}</span>
                  <span class="level-count">${this.formatNumber(item?.count || 0)}</span>
                  <span class="level-percentage">${this.formatNumber(item?.percentage || 0)}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 최근 에러 목록 위젯 렌더링
   */
  private renderRecentErrorsWidget(data: RecentErrorsData): string {
    return `
      <div class="recent-errors-widget">
        <div class="recent-errors__summary">
          <div class="error-summary-item">
            <span class="summary-label">총 에러 수</span>
            <span class="summary-value">${this.formatNumber(data.total_count || 0)}</span>
          </div>
          <div class="error-summary-item">
            <span class="summary-label">에러율</span>
            <span class="summary-value">${this.formatNumber((data.error_rate || 0) * 100)}%</span>
          </div>
        </div>
        
        <div class="recent-errors__list">
          ${(data.errors || []).length === 0 ? 
            '<div class="no-errors">최근 에러가 없습니다.</div>' :
            (data.errors || []).map(error => `
              <div class="error-item" data-log-id="${error?.id || ''}">
                <div class="error-item__header">
                  <span class="error-level error-level--${(error?.level || 'unknown').toLowerCase()}">${error?.level || 'UNKNOWN'}</span>
                  <span class="error-source">${error?.source || 'Unknown'}</span>
                  <span class="error-time">${error?.timestamp ? this.formatRelativeTime(error.timestamp) : '알 수 없음'}</span>
                </div>
                <div class="error-item__message">${this.truncateText(error?.message || '메시지 없음', 100)}</div>
                ${error?.trace_id ? `
                  <div class="error-item__trace">
                    <span class="trace-label">Trace ID:</span>
                    <span class="trace-id" data-trace-id="${error.trace_id}">${error.trace_id}</span>
                  </div>
                ` : ''}
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  /**
   * 실시간 로그 스트림 위젯 렌더링
   */
  private renderLogStreamWidget(data: LogStreamData): string {
    return `
      <div class="log-stream-widget">
        <div class="log-stream__controls">
          <div class="stream-status stream-status--${data.stream_status}">
            <span class="status-indicator"></span>
            <span class="status-text">${this.getStreamStatusText(data.stream_status)}</span>
          </div>
          
          <div class="stream-metrics">
            <span class="metric">
              <span class="metric-label">로그/초:</span>
              <span class="metric-value">${this.formatNumber(data.logs_per_second || 0)}</span>
            </span>
            <span class="metric">
              <span class="metric-label">버퍼:</span>
              <span class="metric-value">${this.formatNumber(data.buffer_size || 0)}/${this.formatNumber(data.max_buffer_size || 0)}</span>
            </span>
          </div>
          
          <div class="stream-actions">
            <button class="stream-pause-btn" title="일시정지/재생">
              <span class="icon-pause"></span>
            </button>
            <button class="stream-clear-btn" title="화면 지우기">
              <span class="icon-clear"></span>
            </button>
            <button class="stream-filter-btn" title="필터 설정">
              <span class="icon-filter"></span>
            </button>
          </div>
        </div>
        
        <div class="log-stream__content">
          <div class="log-stream__list">
            ${(data.logs || []).map(log => `
              <div class="stream-log-item stream-log-item--${(log?.level || 'unknown').toLowerCase()}">
                <span class="log-time">${log?.timestamp ? this.formatTime(log.timestamp) : '알 수 없음'}</span>
                <span class="log-level">${log?.level || 'UNKNOWN'}</span>
                <span class="log-source">${log?.source || 'Unknown'}</span>
                <span class="log-message">${this.escapeHtml(log?.message || '메시지 없음')}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 통계 개요 위젯 렌더링
   */
  private renderStatsOverviewWidget(data: any): string {
    return `
      <div class="stats-overview-widget">
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-icon icon-logs"></span>
            <span class="stat-label">총 로그</span>
            <span class="stat-value">${this.formatNumber(data.total_logs || 0)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon icon-error"></span>
            <span class="stat-label">에러</span>
            <span class="stat-value">${this.formatNumber(data.error_count || 0)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon icon-warning"></span>
            <span class="stat-label">경고</span>
            <span class="stat-value">${this.formatNumber(data.warning_count || 0)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon icon-info"></span>
            <span class="stat-label">정보</span>
            <span class="stat-value">${this.formatNumber(data.info_count || 0)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 위젯 로딩 상태 렌더링
   */
  private renderWidgetLoading(): string {
    return `
      <div class="widget-loading">
        <div class="loading-spinner"></div>
        <span class="loading-text">데이터를 불러오는 중...</span>
      </div>
    `;
  }

  /**
   * 연결 상태 렌더링
   */
  private renderConnectionStatus(): string {
    const isConnected = this.logSystemService?.status === 'ready' || false;
    return `
      <div class="connection-status connection-status--${isConnected ? 'connected' : 'disconnected'}">
        <span class="connection-indicator"></span>
        <span class="connection-text">${isConnected ? '연결됨' : '연결 끊김'}</span>
      </div>
    `;
  }

  /**
   * DOM 요소 찾기
   */
  private findDOMElements(): void {
    const container = this.element.querySelector('.log-dashboard');
    if (!container) return;

    this.elements = {
      container: container as HTMLElement,
      header: container.querySelector('.log-dashboard__header'),
      toolbar: container.querySelector('.log-dashboard__toolbar'),
      widgetGrid: container.querySelector('.log-dashboard__widget-grid'),
      refreshButton: container.querySelector('.log-dashboard__refresh-btn'),
      timeRangeSelect: container.querySelector('.log-dashboard__time-range'),
      layoutToggle: container.querySelector('.log-dashboard__layout-toggle'),
      settingsButton: container.querySelector('.log-dashboard__settings-btn'),
      widgets: new Map()
    };

    // 개별 위젯 요소들 찾기
    container.querySelectorAll('.log-dashboard__widget').forEach(widget => {
      const widgetId = widget.getAttribute('data-widget-id');
      if (widgetId) {
        this.elements.widgets.set(widgetId, widget as HTMLElement);
      }
    });
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents(): void {
    // 새로고침 버튼
    if (this.elements.refreshButton) {
      this.addDOMEventListener(this.elements.refreshButton, 'click', () => {
        this.refreshAllWidgets();
      });
    }

    // 시간 범위 변경
    if (this.elements.timeRangeSelect) {
      this.addDOMEventListener(this.elements.timeRangeSelect, 'change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.dashboardState.timeRange = target.value as TimeRange;
        this.refreshAllWidgets();
      });
    }

    // 레이아웃 토글
    if (this.elements.layoutToggle) {
      this.addDOMEventListener(this.elements.layoutToggle, 'click', () => {
        this.toggleLayout();
      });
    }

    // 자동 새로고침 토글
    const autoRefreshToggle = this.element.querySelector('.log-dashboard__auto-refresh input[type="checkbox"]');
    if (autoRefreshToggle) {
      this.addDOMEventListener(autoRefreshToggle, 'change', (e) => {
        const target = e.target as HTMLInputElement;
        this.dashboardState.isAutoRefresh = target.checked;
        if (target.checked) {
          this.startAutoRefresh();
        } else {
          this.stopAutoRefresh();
        }
      });
    }

    // 위젯별 이벤트 바인딩
    this.bindWidgetEvents();
  }

  /**
   * 위젯별 이벤트 바인딩 (전체)
   * BaseComponent의 중복 방지 기능을 활용
   */
  private bindWidgetEvents(): void {
    
    // 위젯 새로고침 버튼
    this.element.querySelectorAll('.log-dashboard__widget-refresh').forEach(button => {
      this.addDOMEventListener(button, 'click', (e) => {
        const widget = (e.target as HTMLElement).closest('.log-dashboard__widget');
        const widgetId = widget?.getAttribute('data-widget-id');
        if (widgetId) {
          this.refreshWidget(widgetId);
        }
      });
    });

    // 에러 항목 클릭
    this.element.querySelectorAll('.error-item').forEach(item => {
      this.addDOMEventListener(item, 'click', (e) => {
        const logId = (e.currentTarget as HTMLElement).getAttribute('data-log-id');
        if (logId) {
          this.emit('error:clicked', { logId });
        }
      });
    });

    // 트레이스 ID 클릭
    this.element.querySelectorAll('.trace-id').forEach(trace => {
      this.addDOMEventListener(trace, 'click', (e) => {
        const traceId = (e.target as HTMLElement).getAttribute('data-trace-id');
        if (traceId) {
          this.emit('trace:clicked', { traceId });
        }
      });
    });
  }

  /**
   * 특정 위젯의 새로운 요소에만 이벤트 바인딩
   */
  private bindSpecificWidgetEvents(widgetElement: HTMLElement): void {
    // 위젯 새로고침 버튼
    const refreshButton = widgetElement.querySelector('.log-dashboard__widget-refresh');
    if (refreshButton) {
      this.addDOMEventListener(refreshButton, 'click', (e) => {
        const widget = (e.target as HTMLElement).closest('.log-dashboard__widget');
        const widgetId = widget?.getAttribute('data-widget-id');
        if (widgetId) {
          this.refreshWidget(widgetId);
        }
      });
    }

    // 에러 항목 클릭
    widgetElement.querySelectorAll('.error-item').forEach(item => {
      this.addDOMEventListener(item, 'click', (e) => {
        const logId = (e.currentTarget as HTMLElement).getAttribute('data-log-id');
        if (logId) {
          this.emit('error:clicked', { logId });
        }
      });
    });

    // 트레이스 ID 클릭
    widgetElement.querySelectorAll('.trace-id').forEach(trace => {
      this.addDOMEventListener(trace, 'click', (e) => {
        const traceId = (e.target as HTMLElement).getAttribute('data-trace-id');
        if (traceId) {
          this.emit('trace:clicked', { traceId });
        }
      });
    });
  }

  /**
   * 동적으로 생성된 요소에만 이벤트 바인딩 (새로고침 버튼 제외)
   */
  private bindDynamicWidgetEvents(widgetElement: HTMLElement): void {
    // 에러 항목 클릭
    widgetElement.querySelectorAll('.error-item').forEach(item => {
      this.addDOMEventListener(item, 'click', (e) => {
        const logId = (e.currentTarget as HTMLElement).getAttribute('data-log-id');
        if (logId) {
          this.emit('error:clicked', { logId });
        }
      });
    });

    // 트레이스 ID 클릭
    widgetElement.querySelectorAll('.trace-id').forEach(trace => {
      this.addDOMEventListener(trace, 'click', (e) => {
        const traceId = (e.target as HTMLElement).getAttribute('data-trace-id');
        if (traceId) {
          this.emit('trace:clicked', { traceId });
        }
      });
    });
  }

  /**
   * LogSystemService 가져오기
   */
  private async getLogSystemService(): Promise<void> {
    try {
      const serviceRegistry = (window as any).app?.serviceRegistry;
      if (serviceRegistry) {
        this.logSystemService = serviceRegistry.get('log-system');
        if (!this.logSystemService) {
          this.logger.warn('LogSystemService not found in registry');
        }
      } else {
        this.logger.warn('Service registry not available');
      }
    } catch (error) {
      this.logger.error('Failed to get LogSystemService:', error);
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
        console.log('LogStreamService 초기화 전 설정:', config);
        
        // 8888 포트 강제 설정
        const correctedConfig = {
          ...config,
          bridgeEndpoint: 'http://localhost:8888',
          websocket: {
            ...config.websocket,
            url: 'ws://localhost:8888/ws'
          }
        };
        
        console.log('LogStreamService 수정된 설정:', correctedConfig);
        
        this.logStreamService = new LogStreamService(correctedConfig);
        this.logger.info('LogStreamService 초기화 완료', { websocketUrl: correctedConfig.websocket.url });
        
        // 로그 스트림 위젯을 위한 실시간 스트림 시작
        await this.startLogStreamForWidget();
      }
    } catch (error) {
      this.logger.error('LogStreamService 초기화 실패:', error);
    }
  }

  /**
   * 로그 스트림 위젯을 위한 실시간 스트림 시작
   */
  private async startLogStreamForWidget(): Promise<void> {
    if (!this.logStreamService) return;

    try {
      // 기본 필터 (ERROR 레벨 이상)
      const filters: LogFilter = {
        levels: ['ERROR', 'FATAL'],
        min_level: 'ERROR'
      };

      this.activeLogStream = await this.logStreamService.startStream(
        (entry: LogEntry) => {
          this.handleNewLogEntry(entry);
        },
        filters,
        { useBuffer: true }
      );

      this.logger.info('대시보드 로그 스트림 시작됨', { streamId: this.activeLogStream.id });

    } catch (error) {
      this.logger.error('대시보드 로그 스트림 시작 실패:', error);
    }
  }

  /**
   * 새 로그 엔트리 처리 (실시간 업데이트)
   */
  private handleNewLogEntry(entry: LogEntry): void {
    // 로그 스트림 위젯 데이터 업데이트
    const streamData = this.dashboardState.widgetData.get('log-stream');
    if (streamData) {
      // 새 로그를 맨 앞에 추가
      streamData.logs.unshift(entry);
      
      // 최대 50개로 제한
      if (streamData.logs.length > 50) {
        streamData.logs = streamData.logs.slice(0, 50);
      }

      // 초당 로그 수 업데이트 (간단한 계산)
      streamData.logs_per_second = streamData.logs.length / 60; // 1분 기준

      // 위젯 업데이트
      this.updateWidgetDisplay('log-stream', this.dashboardState.widgets.get('log-stream')!, streamData);
    }

    // 최근 에러 위젯 업데이트 (ERROR/FATAL 레벨인 경우)
    if (['ERROR', 'FATAL'].includes(entry.level)) {
      const errorData = this.dashboardState.widgetData.get('recent-errors');
      if (errorData) {
        errorData.errors.unshift(entry);
        if (errorData.errors.length > 10) {
          errorData.errors = errorData.errors.slice(0, 10);
        }
        errorData.total_count++;
        errorData.last_updated = new Date().toISOString();

        this.updateWidgetDisplay('recent-errors', this.dashboardState.widgets.get('recent-errors')!, errorData);
      }
    }

    this.emit('log:new', entry);
  }

  /**
   * 기본 위젯 초기화
   */
  private initializeDefaultWidgets(): void {
    const defaultWidgets: DashboardWidget[] = [
      {
        id: 'system-status',
        title: '시스템 상태',
        type: 'system-status',
        size: 'medium',
        position: { x: 0, y: 0, w: 6, h: 4 },
        visible: true,
        refreshInterval: 30000
      },
      {
        id: 'error-chart',
        title: '에러율 차트',
        type: 'error-chart',
        size: 'large',
        position: { x: 6, y: 0, w: 6, h: 4 },
        visible: true,
        refreshInterval: 60000
      },
      {
        id: 'recent-errors',
        title: '최근 에러 목록',
        type: 'recent-errors',
        size: 'medium',
        position: { x: 0, y: 4, w: 6, h: 4 },
        visible: true,
        refreshInterval: 15000
      },
      {
        id: 'log-stream',
        title: '실시간 로그 스트림',
        type: 'log-stream',
        size: 'large',
        position: { x: 6, y: 4, w: 6, h: 4 },
        visible: true,
        refreshInterval: 5000
      }
    ];

    // props에서 지정된 위젯만 활성화
    const activeWidgetIds = this.props.widgets || [];
    defaultWidgets.forEach(widget => {
      if (activeWidgetIds.includes(widget.id)) {
        this.dashboardState.widgets.set(widget.id, widget);
      }
    });
  }

  /**
   * 초기 데이터 로드
   */
  private async loadInitialData(): Promise<void> {
    this.dashboardState.isLoading = true;
    
    try {
      await this.refreshAllWidgets();
    } catch (error) {
      this.logger.error('Failed to load initial data:', error);
    } finally {
      this.dashboardState.isLoading = false;
    }
  }

  /**
   * 모든 위젯 새로고침
   */
  private async refreshAllWidgets(): Promise<void> {
    if (!this.logSystemService) {
      this.logger.warn('LogSystemService not available');
      return;
    }

    const refreshPromises = Array.from(this.dashboardState.widgets.keys()).map(widgetId => 
      this.refreshWidget(widgetId)
    );

    try {
      await Promise.allSettled(refreshPromises);
      this.dashboardState.lastUpdated = Date.now();
      this.updateLastUpdatedDisplay();
    } catch (error) {
      this.logger.error('Failed to refresh widgets:', error);
    }
  }

  /**
   * 개별 위젯 새로고침
   */
  private async refreshWidget(widgetId: string): Promise<void> {
    const widget = this.dashboardState.widgets.get(widgetId);
    if (!widget || !this.logSystemService) return;

    try {
      let data: any;

      switch (widget.type) {
        case 'system-status':
          data = await this.loadSystemStatusData();
          break;
        case 'error-chart':
          data = await this.loadErrorChartData();
          break;
        case 'recent-errors':
          data = await this.loadRecentErrorsData();
          break;
        case 'log-stream':
          data = await this.loadLogStreamData();
          break;
        case 'stats-overview':
          data = await this.loadStatsOverviewData();
          break;
        default:
          this.logger.warn(`Unknown widget type: ${widget.type}`);
          return;
      }

      this.dashboardState.widgetData.set(widgetId, data);
      this.updateWidgetDisplay(widgetId, widget, data);

    } catch (error) {
      this.logger.error(`Failed to refresh widget ${widgetId}:`, error);
    }
  }

  /**
   * 시스템 상태 데이터 로드
   */
  private async loadSystemStatusData(): Promise<SystemStatusData> {
    const systemStatus = await this.logSystemService!.getSystemStatus();

    return {
      log_system_connected: this.logSystemService!.status === 'ready',
      python_server_status: systemStatus?.python_server_status || 'unknown',
      collectors: {
        mcp: { active: true, last_activity: new Date().toISOString() },
        websocket: { active: true, last_activity: new Date().toISOString() },
        ai: { active: true, last_activity: new Date().toISOString() },
        http: { active: true, last_activity: new Date().toISOString() }
      },
      total_logs: systemStatus?.total_logs || 0,
      database_size_mb: systemStatus?.disk_usage_mb || 0,
      memory_usage_mb: systemStatus?.memory_usage_mb || 0,
      uptime_seconds: systemStatus?.uptime_seconds || 0
    };
  }

  /**
   * 에러 차트 데이터 로드
   */
  private async loadErrorChartData(): Promise<ErrorChartData> {
    const timeRange = typeof this.dashboardState.timeRange === 'string' 
      ? this.dashboardState.timeRange 
      : '1h';
    const stats = await this.logSystemService!.getStats(timeRange);

    // 안전한 데이터 접근을 위한 기본값 설정
    const timeDistribution = stats.time_distribution || [];
    const bySource = stats.by_source || {};
    const byLevel = stats.by_level || {};
    const totalLogs = stats.total_logs || 0;

    return {
      time_series: timeDistribution.map(item => ({
        timestamp: item.timestamp,
        error_count: (item.levels?.ERROR || 0) + (item.levels?.FATAL || 0),
        total_count: item.count || 0,
        error_rate: item.count > 0 ? ((item.levels?.ERROR || 0) + (item.levels?.FATAL || 0)) / item.count : 0
      })),
      by_source: Object.entries(bySource).map(([source, count]) => ({
        source,
        error_count: count as number,
        percentage: totalLogs > 0 ? ((count as number) / totalLogs) * 100 : 0
      })),
      by_level: Object.entries(byLevel).map(([level, count]) => ({
        level: level as LogLevel,
        count: count as number,
        percentage: totalLogs > 0 ? ((count as number) / totalLogs) * 100 : 0
      }))
    };
  }

  /**
   * 최근 에러 데이터 로드
   */
  private async loadRecentErrorsData(): Promise<RecentErrorsData> {
    try {
    const timeRange = typeof this.dashboardState.timeRange === 'string' 
      ? this.dashboardState.timeRange 
      : '1h';
      
      if (!this.logSystemService) {
        this.logger.warn('LogSystemService가 초기화되지 않음');
        return {
          errors: [],
          total_count: 0,
          error_rate: 0,
          last_updated: new Date().toISOString()
        };
      }

      const errorQuery = await this.logSystemService.query({
      levels: ['ERROR', 'FATAL'],
      since: timeRange,
      limit: 10
    });

      const stats = await this.logSystemService.getStats(timeRange);

    return {
        errors: Array.isArray(errorQuery.logs) ? errorQuery.logs : [],
      total_count: errorQuery.count || 0,
      error_rate: stats.error_rate || 0,
      last_updated: new Date().toISOString()
    };
    } catch (error) {
      this.logger.error('최근 에러 데이터 로드 실패:', error);
      return {
        errors: [],
        total_count: 0,
        error_rate: 0,
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * 로그 스트림 데이터 로드
   */
  private async loadLogStreamData(): Promise<LogStreamData> {
    try {
      if (!this.logSystemService) {
        this.logger.warn('LogSystemService가 초기화되지 않음');
        return {
          logs: [],
          stream_status: 'disconnected',
          logs_per_second: 0,
          active_filters: [],
          buffer_size: 0,
          max_buffer_size: 1000
        };
      }

      const recentLogs = await this.logSystemService.query({
      since: '5m',
      limit: 50
    });

      const logs = Array.isArray(recentLogs.logs) ? recentLogs.logs : [];

    return {
      logs: logs,
      stream_status: 'connected',
      logs_per_second: logs.length / 300, // 5분간 평균
        active_filters: this.logStreamFilters || [],
      buffer_size: logs.length,
        max_buffer_size: 1000
      };
    } catch (error) {
      this.logger.error('로그 스트림 데이터 로드 실패:', error);
             return {
         logs: [],
         stream_status: 'disconnected',
         logs_per_second: 0,
         active_filters: [],
         buffer_size: 0,
      max_buffer_size: 1000
    };
    }
  }

  /**
   * 통계 개요 데이터 로드
   */
  private async loadStatsOverviewData(): Promise<any> {
    try {
    const timeRange = typeof this.dashboardState.timeRange === 'string' 
      ? this.dashboardState.timeRange 
      : '1h';
      
      if (!this.logSystemService) {
        this.logger.warn('LogSystemService가 초기화되지 않음');
        return {
          total_logs: 0,
          error_count: 0,
          warning_count: 0,
          info_count: 0
        };
      }

      const stats = await this.logSystemService.getStats(timeRange);
    const byLevel = stats.by_level || {};

    return {
      total_logs: stats.total_logs || 0,
      error_count: byLevel.ERROR || 0,
      warning_count: byLevel.WARN || 0,
      info_count: byLevel.INFO || 0
    };
    } catch (error) {
      this.logger.error('통계 개요 데이터 로드 실패:', error);
      return {
        total_logs: 0,
        error_count: 0,
        warning_count: 0,
        info_count: 0
      };
    }
  }

  /**
   * 위젯 표시 업데이트
   */
  private updateWidgetDisplay(widgetId: string, widget: DashboardWidget, data: any): void {
    const widgetElement = this.elements.widgets.get(widgetId);
    if (!widgetElement) return;

    const contentElement = widgetElement.querySelector('.log-dashboard__widget-content');
    if (contentElement) {
      contentElement.innerHTML = this.renderWidgetContent(widget, data);
      // 새로 생성된 동적 요소에만 이벤트 바인딩 (새로고침 버튼은 제외 - 이미 바인딩됨)
      this.bindDynamicWidgetEvents(widgetElement);
    }
  }

  /**
   * 자동 새로고침 시작
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh(); // 기존 타이머 정리
    
    this.dashboardState.refreshTimer = window.setInterval(() => {
      this.refreshAllWidgets();
    }, this.dashboardState.refreshInterval);
  }

  /**
   * 자동 새로고침 중지
   */
  private stopAutoRefresh(): void {
    if (this.dashboardState.refreshTimer) {
      clearInterval(this.dashboardState.refreshTimer);
      this.dashboardState.refreshTimer = null;
    }
  }

  /**
   * 레이아웃 토글
   */
  private toggleLayout(): void {
    const layouts: Array<'grid' | 'masonry' | 'flex'> = ['grid', 'masonry', 'flex'];
    const currentIndex = layouts.indexOf(this.dashboardState.layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    const nextLayout = layouts[nextIndex];
    if (nextLayout) {
      this.dashboardState.layout = nextLayout;
    }
    
    if (this.elements.widgetGrid) {
      this.elements.widgetGrid.className = `log-dashboard__widget-grid log-dashboard__widget-grid--${this.dashboardState.layout}`;
    }

    if (this.elements.layoutToggle) {
      this.elements.layoutToggle.innerHTML = `
        <span class="icon-grid"></span>
        ${this.dashboardState.layout}
      `;
    }

    // 레이아웃 변경 콜백 호출
    if (this.props.onLayoutChange) {
      this.props.onLayoutChange(this.dashboardState.layout);
    }
  }

  /**
   * 마지막 업데이트 시간 표시 업데이트
   */
  private updateLastUpdatedDisplay(): void {
    const lastUpdatedElement = this.element.querySelector('.log-dashboard__last-updated');
    if (lastUpdatedElement) {
      lastUpdatedElement.textContent = `마지막 업데이트: ${this.formatLastUpdated()}`;
    }
  }

  // 유틸리티 메서드들

  private formatLastUpdated(): string {
    if (this.dashboardState.lastUpdated === 0) {
      return '없음';
    }
    return new Date(this.dashboardState.lastUpdated).toLocaleTimeString('ko-KR');
  }

  private getServerStatusText(status: string): string {
    switch (status) {
      case 'running': return '실행 중';
      case 'healthy': return '정상';
      case 'stopped': return '중지됨';
      case 'error': return '오류';
      default: return '알 수 없음';
    }
  }

  private getStreamStatusText(status: string): string {
    switch (status) {
      case 'connected': return '연결됨';
      case 'disconnected': return '연결 끊김';
      case 'reconnecting': return '재연결 중';
      default: return '알 수 없음';
    }
  }

  private formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    return `${Math.floor(diff / 86400000)}일 전`;
  }

  private formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private formatNumber(num: number | string | undefined | null): string {
    // 안전한 숫자 변환
    const numValue = typeof num === 'number' ? num : 
                    typeof num === 'string' ? parseFloat(num) : 
                    0;
    
    // NaN 체크
    if (isNaN(numValue)) {
      return '0';
    }
    
    return numValue.toLocaleString('ko-KR');
  }

  private formatUptime(seconds: number | string | undefined | null): string {
    // 안전한 숫자 변환
    const numValue = typeof seconds === 'number' ? seconds : 
                    typeof seconds === 'string' ? parseFloat(seconds) : 
                    0;
    
    // NaN 또는 음수 체크
    if (isNaN(numValue) || numValue < 0) {
      return '0분';
    }
    
    const days = Math.floor(numValue / 86400);
    const hours = Math.floor((numValue % 86400) / 3600);
    const minutes = Math.floor((numValue % 3600) / 60);
    
    if (days > 0) return `${days}일 ${hours}시간`;
    if (hours > 0) return `${hours}시간 ${minutes}분`;
    return `${minutes}분`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private renderSimpleLineChart(data: any[]): string {
    // 간단한 SVG 기반 라인 차트 (나중에 Chart.js로 교체 가능)
    if (data.length === 0) return '<div class="no-chart-data">데이터가 없습니다</div>';
    
    const maxValue = Math.max(...data.map(d => d.error_rate));
    if (maxValue === 0) return '<div class="no-chart-data">에러가 없습니다</div>';
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.error_rate / maxValue) * 100;
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg viewBox="0 0 100 50" class="simple-chart">
        <polyline points="${points}" fill="none" stroke="var(--color-error, #dc3545)" stroke-width="2"/>
      </svg>
    `;
  }

  // =============================================================================
  // 🔗 MCP Integration
  // =============================================================================

  /**
   * MCP 이벤트 리스너 설정
   */
  private setupMCPEventListeners(): void {
    if (!this.eventManager) {
      return;
    }

    // MCP 대시보드 에러 표시 이벤트
    this.eventManager.on('mcp:dashboard:show-errors', (event) => {
      this.handleMCPShowErrors(event);
    });

    // MCP 대시보드 설정 이벤트
    this.eventManager.on('mcp:dashboard:configure', (event) => {
      this.handleMCPConfigure(event);
    });

    // WebSocket MCP 이벤트 (MCP 서버에서 오는 UI 액션)
    this.eventManager.on('websocket:message', (event) => {
      if (event.data?.type === 'mcp_ui_action') {
        this.handleWebSocketMCPAction(event.data);
      }
    });

    this.logger.info('MCP 이벤트 리스너 설정 완료');
  }

  /**
   * MCP 에러 표시 이벤트 처리
   */
  private async handleMCPShowErrors(event: any): Promise<void> {
    try {
      const { count = 10, timeRange = '24h' } = event;
      
      this.logger.info(`MCP: 최근 에러 표시 요청 - count: ${count}, timeRange: ${timeRange}`);

      // 시간 범위 업데이트
      if (timeRange !== this.dashboardState.timeRange) {
        this.dashboardState.timeRange = timeRange as TimeRange;
        
        // 시간 범위 선택기 업데이트
        const timeRangeSelect = this.element.querySelector('.log-dashboard__time-range') as HTMLSelectElement;
        if (timeRangeSelect) {
          timeRangeSelect.value = timeRange;
        }
      }

      // 에러 관련 위젯 강조 및 새로고침
      await this.refreshWidget('recent-errors');
      await this.refreshWidget('error-chart');

      // 에러 위젯 하이라이트
      const errorWidget = this.elements.widgets.get('recent-errors');
      if (errorWidget) {
        errorWidget.classList.add('log-dashboard__widget--highlighted');
        setTimeout(() => {
          errorWidget.classList.remove('log-dashboard__widget--highlighted');
        }, 3000);
      }

    } catch (error) {
      this.logger.error('MCP 에러 표시 처리 실패:', error);
    }
  }

  /**
   * MCP 대시보드 설정 이벤트 처리
   */
  private async handleMCPConfigure(event: any): Promise<void> {
    try {
      const { widgets = [] } = event;
      
      this.logger.info(`MCP: 대시보드 설정 요청 - widgets:`, widgets);

      // 요청된 위젯들만 표시하도록 설정
      if (widgets.length > 0) {
        this.dashboardState.widgets.forEach(widget => {
          widget.visible = widgets.includes(widget.type);
        });

        // 대시보드 재렌더링
        this.render();
        this.findDOMElements();
        this.bindEvents();
        
        // 표시된 위젯들 데이터 로드
        await this.refreshAllWidgets();
      }

    } catch (error) {
      this.logger.error('MCP 대시보드 설정 처리 실패:', error);
    }
  }

  /**
   * WebSocket MCP 액션 처리
   */
  private async handleWebSocketMCPAction(data: any): Promise<void> {
    try {
      const { action, data: actionData } = data;
      
      this.logger.info(`WebSocket MCP 액션 수신: ${action}`, actionData);

      switch (action) {
        case 'show_recent_errors':
          await this.handleMCPShowErrors(actionData);
          break;
        case 'create_log_dashboard':
          await this.handleMCPConfigure(actionData);
          break;
        default:
          this.logger.warn(`알 수 없는 MCP 액션: ${action}`);
      }

    } catch (error) {
      this.logger.error('WebSocket MCP 액션 처리 실패:', error);
    }
  }

  /**
   * 컴포넌트 정리
   */
  async destroy(): Promise<void> {
    // 자동 새로고침 중지
    this.stopAutoRefresh();
    
    // 실시간 로그 스트림 정리
    if (this.activeLogStream) {
      await this.activeLogStream.stop();
      this.activeLogStream = null;
    }
    
    // LogStreamService 정리
    if (this.logStreamService) {
      await this.logStreamService.disconnect();
      this.logStreamService = null;
    }

    // 부모 클래스 정리
    await super.destroy();
  }

  /**
   * 연결 실패 시 기본 데이터 로드
   */
  private async loadFallbackData(): Promise<void> {
    this.logger.info('기본 데이터로 위젯 초기화');
    
    // 각 위젯에 대해 기본 데이터 설정
    for (const [widgetId, widget] of this.dashboardState.widgets) {
      let fallbackData: any = {};
      
      switch (widget.type) {
        case 'system-status':
          fallbackData = {
            log_system_connected: false,
            python_server_status: 'error',
            collectors: {
              mcp: { active: false },
              websocket: { active: false },
              ai: { active: false },
              http: { active: false }
            },
            total_logs: 0,
            database_size_mb: 0,
            memory_usage_mb: 0,
            uptime_seconds: 0
          };
          break;
          
        case 'recent-errors':
          fallbackData = {
            errors: [],
            total_count: 0,
            error_rate: 0,
            last_updated: new Date().toISOString()
          };
          break;
          
        case 'log-stream':
          fallbackData = {
            logs: [],
            stream_status: 'disconnected',
            logs_per_second: 0,
            active_filters: [],
            buffer_size: 0,
            max_buffer_size: 1000
          };
          break;
          
        case 'error-chart':
          fallbackData = {
            time_series: [],
            by_source: [],
            by_level: []
          };
          break;
          
        case 'stats-overview':
          fallbackData = {
            total_logs: 0,
            error_count: 0,
            warning_count: 0,
            info_count: 0
          };
          break;
      }
      
      this.dashboardState.widgetData.set(widgetId, fallbackData);
      this.updateWidgetDisplay(widgetId, widget, fallbackData);
    }
    
    this.dashboardState.lastUpdated = Date.now();
    this.updateLastUpdatedDisplay();
  }
}

/**
 * LogDashboard 컴포넌트 팩토리 함수
 */
export function createLogDashboardComponent(
  element: HTMLElement | string,
  props: LogDashboardProps = {},
  eventManager: EventManager
): LogDashboard {
  return new LogDashboard(element, props, eventManager);
} 