/**
 * @fileoverview Metrics Component
 * @description 시스템 메트릭과 성능 데이터를 실시간으로 시각화하는 Feature 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';

/**
 * 메트릭 타입 정의
 */
export enum MetricType {
  SYSTEM = 'system',
  WEBSOCKET = 'websocket',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  API = 'api',
  ERROR = 'error',
  CUSTOM = 'custom'
}

/**
 * 차트 타입 정의
 */
export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  GAUGE = 'gauge',
  PIE = 'pie',
  AREA = 'area',
  SPARKLINE = 'sparkline'
}

/**
 * 집계 기간 정의
 */
export enum AggregationPeriod {
  REALTIME = 'realtime',
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month'
}

/**
 * 메트릭 데이터 포인트
 */
export interface MetricDataPoint {
  value: number;
  timestamp: number;
  label?: string;
}

/**
 * 메트릭 정의
 */
export interface MetricDefinition {
  id: string;
  type: MetricType;
  name: string;
  displayName: string;
  unit: string;
  description?: string;
  chartType: ChartType;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  format?: 'number' | 'bytes' | 'percent' | 'duration' | 'custom';
  customFormatter?: (value: number) => string;
  refreshInterval?: number;
  historicalData?: MetricDataPoint[];
  current?: number;
  trend?: 'up' | 'down' | 'stable';
  isVisible?: boolean;
  order?: number;
}

/**
 * 메트릭 필터 옵션
 */
export interface MetricFilter {
  types?: MetricType[];
  search?: string;
  showAlerts?: boolean;
  sortBy?: 'name' | 'value' | 'type' | 'updated';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 메트릭 내보내기 옵션
 */
export interface ExportOptions {
  format: 'csv' | 'json' | 'pdf';
  period?: AggregationPeriod;
  metrics?: string[];
  includeHistory?: boolean;
}

/**
 * Metrics 컴포넌트 속성
 */
export interface MetricsProps extends ComponentProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  maxHistoryLength?: number;
  enableRealtime?: boolean;
  enableExport?: boolean;
  enableFiltering?: boolean;
  defaultView?: 'grid' | 'table' | 'charts';
  visibleMetrics?: string[];
  alertThresholds?: Record<string, { warning?: number; critical?: number }>;
}

/**
 * 메트릭 컴포넌트 상태
 */
interface MetricsState {
  isLoading: boolean;
  currentView: 'grid' | 'table' | 'charts';
  editMode: boolean;
  selectedMetrics: Set<string>;
  filterText: string;
  sortBy: 'name' | 'value' | 'type' | 'updated';
  sortOrder: 'asc' | 'desc';
}

/**
 * Metrics 컴포넌트
 */
export class Metrics extends BaseComponent<HTMLElement, MetricsProps> {
  private metrics: Map<string, MetricDefinition> = new Map();
  private metricsHistory: Map<string, MetricDataPoint[]> = new Map();
  private charts: Map<string, any> = new Map(); // 차트 인스턴스들
  private refreshTimers: Map<string, number> = new Map();
  private globalRefreshTimer: number | null = null;
  private isAutoRefreshEnabled = true;
  private currentFilter: MetricFilter = {};
  private alerts: Array<{ metric: string; level: 'warning' | 'critical'; message: string; timestamp: number }> = [];
  private lastUpdate: number | null = null;
  private apiClient: any = null;
  private componentState: MetricsState;

  constructor(element: HTMLElement | string, props: MetricsProps = {}, eventManager: EventManager) {
    super(element, {
      autoRefresh: true,
      refreshInterval: 5000,
      maxHistoryLength: 100,
      enableRealtime: true,
      enableExport: true,
      enableFiltering: true,
      defaultView: 'grid',
      ...props
    }, eventManager);

    this.isAutoRefreshEnabled = this.props.autoRefresh ?? true;
    this.componentState = this.getDefaultComponentState();
  }

  private getDefaultComponentState(): MetricsState {
    return {
      isLoading: false,
      currentView: this.props.defaultView || 'grid',
      editMode: false,
      selectedMetrics: new Set<string>(),
      filterText: '',
      sortBy: 'name',
      sortOrder: 'asc'
    };
  }

  async initialize(): Promise<void> {
    try {
      // API 클라이언트 설정 (서비스에서 가져오기)
      this.setupAPIClients();

      // DOM 구조 생성
      this.render();

      // 이벤트 설정
      this.setupEventListeners();

      // 기본 메트릭 정의 설정
      this.setupDefaultMetrics();

      // 초기 데이터 로드
      await this.loadMetrics();

      // 실시간 구독 설정
      if (this.props.enableRealtime) {
        this.setupRealtimeSubscriptions();
      }

      // 자동 새로고침 시작
      if (this.isAutoRefreshEnabled) {
        this.startAutoRefresh();
      }

      this.emit('metrics:initialized');
    } catch (error) {
      console.error('Failed to initialize Metrics component:', error);
      this.showError('메트릭 컴포넌트를 초기화할 수 없습니다.');
    }
  }

  render(): void {
    this.element.innerHTML = `
      <div class="metrics-container">
        <header class="metrics-header">
          <div class="metrics-title-section">
            <h2 class="metrics-title">
              <span class="title-icon">📊</span>
              시스템 메트릭
            </h2>
            <div class="metrics-status">
              <span class="status-item">
                <span class="status-label">마지막 업데이트:</span>
                <span class="last-update" data-timestamp="">-</span>
              </span>
              <span class="status-item">
                <span class="status-label">총 메트릭:</span>
                <span class="total-metrics">0</span>
              </span>
              <span class="status-item alerts-status">
                <span class="status-label">알림:</span>
                <span class="alert-count">0</span>
              </span>
            </div>
          </div>

          <div class="metrics-controls">
            <div class="control-group">
              <button class="btn btn-primary refresh-btn" title="새로고침">
                <span class="btn-icon">🔄</span>
                새로고침
              </button>
              <button class="btn btn-outline export-btn" title="내보내기">
                <span class="btn-icon">📤</span>
                내보내기
              </button>
              <button class="btn btn-outline settings-btn" title="설정">
                <span class="btn-icon">⚙️</span>
                설정
              </button>
            </div>
            
            <div class="control-group">
              <label class="auto-refresh-toggle">
                <input type="checkbox" class="auto-refresh-checkbox" ${this.isAutoRefreshEnabled ? 'checked' : ''}>
                <span class="toggle-text">자동 새로고침 (${(this.props.refreshInterval || 5000) / 1000}초)</span>
              </label>
            </div>
          </div>
        </header>

        <div class="metrics-filters" ${!this.props.enableFiltering ? 'style="display: none;"' : ''}>
          <div class="filter-group">
            <input type="text" class="filter-search" placeholder="메트릭 검색..." value="">
            <select class="filter-type">
              <option value="">모든 타입</option>
              <option value="system">시스템</option>
              <option value="websocket">WebSocket</option>
              <option value="performance">성능</option>
              <option value="network">네트워크</option>
              <option value="api">API</option>
              <option value="error">에러</option>
            </select>
            <select class="sort-select">
              <option value="name">이름순</option>
              <option value="value">값순</option>
              <option value="type">타입순</option>
              <option value="updated">업데이트순</option>
            </select>
            <button class="btn btn-sm sort-order-btn" title="정렬 순서">↑</button>
          </div>
          
          <div class="view-controls">
            <div class="view-toggle" role="tablist">
              <button class="view-tab active" data-view="grid" role="tab">그리드</button>
              <button class="view-tab" data-view="table" role="tab">테이블</button>
              <button class="view-tab" data-view="charts" role="tab">차트</button>
            </div>
          </div>
        </div>

        <main class="metrics-content">
          <div class="loading-indicator" style="display: none;">
            <div class="loading-spinner"></div>
            <span>메트릭을 로드하는 중...</span>
          </div>

          <div class="error-message" style="display: none;">
            <div class="error-icon">⚠️</div>
            <div class="error-text"></div>
            <button class="btn btn-sm retry-btn">다시 시도</button>
          </div>

          <div class="metrics-grid view-content" data-view="grid">
            <!-- 메트릭 카드들이 여기에 동적으로 생성됩니다 -->
          </div>

          <div class="metrics-table view-content" data-view="table" style="display: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>메트릭</th>
                  <th>타입</th>
                  <th>현재값</th>
                  <th>단위</th>
                  <th>트렌드</th>
                  <th>상태</th>
                  <th>업데이트</th>
                </tr>
              </thead>
              <tbody class="metrics-table-body">
                <!-- 테이블 행들이 여기에 동적으로 생성됩니다 -->
              </tbody>
            </table>
          </div>

          <div class="metrics-charts view-content" data-view="charts" style="display: none;">
            <div class="charts-grid">
              <!-- 차트들이 여기에 동적으로 생성됩니다 -->
            </div>
          </div>
        </main>
      </div>

      <!-- 설정 모달 -->
      <div class="modal settings-modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>메트릭 설정</h3>
            <button class="modal-close">×</button>
          </div>
          <div class="modal-body">
            <div class="settings-section">
              <h4>새로고침 설정</h4>
              <label>
                <span>새로고침 간격 (초):</span>
                <input type="number" class="refresh-interval-input" min="1" max="300" value="${(this.props.refreshInterval || 5000) / 1000}">
              </label>
              <label>
                <input type="checkbox" class="auto-refresh-setting" ${this.isAutoRefreshEnabled ? 'checked' : ''}>
                자동 새로고침 활성화
              </label>
            </div>
            
            <div class="settings-section">
              <h4>표시 설정</h4>
              <label>
                <span>히스토리 크기:</span>
                <input type="number" class="history-length-input" min="10" max="1000" value="${this.props.maxHistoryLength || 100}">
              </label>
              <label>
                <input type="checkbox" class="realtime-setting" ${this.props.enableRealtime ? 'checked' : ''}>
                실시간 업데이트 활성화
              </label>
            </div>

            <div class="settings-section">
              <h4>보이는 메트릭</h4>
              <div class="metrics-visibility-list">
                <!-- 메트릭 가시성 토글들이 여기에 동적으로 생성됩니다 -->
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline modal-cancel">취소</button>
            <button class="btn btn-primary settings-save">저장</button>
          </div>
        </div>
      </div>

      <!-- 내보내기 모달 -->
      <div class="modal export-modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>메트릭 내보내기</h3>
            <button class="modal-close">×</button>
          </div>
          <div class="modal-body">
            <div class="export-options">
              <label>
                <span>형식:</span>
                <select class="export-format">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>
              <label>
                <span>기간:</span>
                <select class="export-period">
                  <option value="realtime">현재</option>
                  <option value="hour">1시간</option>
                  <option value="day">1일</option>
                  <option value="week">1주</option>
                </select>
              </label>
              <label>
                <input type="checkbox" class="export-history" checked>
                히스토리 데이터 포함
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline modal-cancel">취소</button>
            <button class="btn btn-primary export-download">다운로드</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupAPIClients(): void {
    // 실제 서비스에서 API 클라이언트를 가져와야 함
    // 현재는 mock으로 처리
    this.apiClient = {
      get: async (_endpoint: string, _options?: any) => {
        // Mock API 응답
        return { data: this.generateMockMetrics() };
      }
    };
  }

  private setupDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        id: 'system.cpu_usage',
        type: MetricType.SYSTEM,
        name: 'cpu_usage',
        displayName: 'CPU 사용률',
        unit: '%',
        chartType: ChartType.GAUGE,
        format: 'percent',
        thresholds: { warning: 70, critical: 90 },
        refreshInterval: 1000
      },
      {
        id: 'system.memory_usage',
        type: MetricType.SYSTEM,
        name: 'memory_usage',
        displayName: '메모리 사용률',
        unit: '%',
        chartType: ChartType.GAUGE,
        format: 'percent',
        thresholds: { warning: 80, critical: 95 }
      },
      {
        id: 'system.disk_usage',
        type: MetricType.SYSTEM,
        name: 'disk_usage',
        displayName: '디스크 사용률',
        unit: '%',
        chartType: ChartType.BAR,
        format: 'percent',
        thresholds: { warning: 85, critical: 95 }
      },
      {
        id: 'websocket.connections',
        type: MetricType.WEBSOCKET,
        name: 'connections',
        displayName: 'WebSocket 연결',
        unit: '개',
        chartType: ChartType.LINE,
        format: 'number'
      },
      {
        id: 'websocket.messages_sent',
        type: MetricType.WEBSOCKET,
        name: 'messages_sent',
        displayName: '전송된 메시지',
        unit: '개',
        chartType: ChartType.SPARKLINE,
        format: 'number'
      },
      {
        id: 'performance.response_time',
        type: MetricType.PERFORMANCE,
        name: 'response_time',
        displayName: '응답 시간',
        unit: 'ms',
        chartType: ChartType.LINE,
        format: 'duration',
        thresholds: { warning: 1000, critical: 3000 }
      }
    ];

    defaultMetrics.forEach(metric => {
      this.metrics.set(metric.id, metric);
      this.metricsHistory.set(metric.id, []);
    });
  }

  private setupEventListeners(): void {
    // 새로고침 버튼
    this.element.querySelector('.refresh-btn')?.addEventListener('click', () => {
      this.refreshMetrics();
    });

    // 내보내기 버튼
    this.element.querySelector('.export-btn')?.addEventListener('click', () => {
      this.showExportModal();
    });

    // 설정 버튼
    this.element.querySelector('.settings-btn')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // 자동 새로고침 토글
    this.element.querySelector('.auto-refresh-checkbox')?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.toggleAutoRefresh(target.checked);
    });

    // 필터링 이벤트
    this.element.querySelector('.filter-search')?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.updateFilter({ search: target.value });
    });

    this.element.querySelector('.filter-type')?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const filter: Partial<MetricFilter> = {};
      if (target.value) {
        filter.types = [target.value as MetricType];
      }
      this.updateFilter(filter);
    });

    this.element.querySelector('.sort-select')?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.updateFilter({ sortBy: target.value as any });
    });

    this.element.querySelector('.sort-order-btn')?.addEventListener('click', () => {
      const currentOrder = this.currentFilter.sortOrder || 'asc';
      const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
      this.updateFilter({ sortOrder: newOrder });
      this.updateSortOrderButton(newOrder);
    });

    // 뷰 전환
    this.element.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const view = target.dataset?.view;
        if (view) {
          this.switchView(view as 'grid' | 'table' | 'charts');
        }
      });
    });

    // 모달 이벤트
    this.setupModalEvents();
  }

  private setupModalEvents(): void {
    // 모달 닫기 이벤트
    this.element.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = (e.target as HTMLElement).closest('.modal') as HTMLElement;
        if (modal) {
          modal.style.display = 'none';
        }
      });
    });

    // 설정 저장
    this.element.querySelector('.settings-save')?.addEventListener('click', () => {
      this.saveSettings();
    });

    // 내보내기 다운로드
    this.element.querySelector('.export-download')?.addEventListener('click', () => {
      this.downloadExport();
    });
  }

  private setupRealtimeSubscriptions(): void {
    // WebSocket 연결을 통한 실시간 메트릭 구독
    this.on('websocket:message', (data: any) => {
      if (data.type === 'metrics_update') {
        this.processMetricsData(data.payload);
        this.updateUI();
      }
    });
  }

  private startAutoRefresh(): void {
    if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
    }

    this.globalRefreshTimer = window.setInterval(() => {
      if (this.isAutoRefreshEnabled) {
        this.loadMetrics();
      }
    }, this.props.refreshInterval || 5000);
  }

  private async loadMetrics(): Promise<void> {
    try {
      this.setState({ isLoading: true });
      this.showLoading(true);

      const data = await this.apiClient.get('/metrics');
      this.processMetricsData(data.data);
      
      this.lastUpdate = Date.now();
      this.updateUI();
      this.emit('metrics:loaded');

    } catch (error) {
      console.error('Failed to load metrics:', error);
      this.showError('메트릭을 로드할 수 없습니다.');
    } finally {
      this.setState({ isLoading: false });
      this.showLoading(false);
    }
  }

  private setState(newState: Partial<MetricsState>): void {
    this.componentState = { ...this.componentState, ...newState };
  }

  private showLoading(show: boolean): void {
    const loadingElement = this.element.querySelector('.loading-indicator') as HTMLElement;
    if (loadingElement) {
      loadingElement.style.display = show ? 'flex' : 'none';
    }
  }

  private showError(message: string): void {
    const errorElement = this.element.querySelector('.error-message') as HTMLElement;
    const errorText = this.element.querySelector('.error-text') as HTMLElement;
    
    if (errorElement && errorText) {
      errorText.textContent = message;
      errorElement.style.display = 'flex';
    }
  }

  private refreshMetrics(): void {
    this.loadMetrics();
  }

  private showExportModal(): void {
    const modal = this.element.querySelector('.export-modal') as HTMLElement;
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  private showSettingsModal(): void {
    const modal = this.element.querySelector('.settings-modal') as HTMLElement;
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  private toggleAutoRefresh(enabled: boolean): void {
    this.isAutoRefreshEnabled = enabled;
    if (enabled) {
      this.startAutoRefresh();
    } else if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
      this.globalRefreshTimer = null;
    }
  }

  private updateFilter(filter: Partial<MetricFilter>): void {
    this.currentFilter = { ...this.currentFilter, ...filter };
    this.updateMetricsView();
  }

  private updateSortOrderButton(order: 'asc' | 'desc'): void {
    const button = this.element.querySelector('.sort-order-btn') as HTMLElement;
    if (button) {
      button.textContent = order === 'asc' ? '↑' : '↓';
      button.classList.toggle('desc', order === 'desc');
    }
  }

  private switchView(view: 'grid' | 'table' | 'charts'): void {
    this.setState({ currentView: view });
    
    // 탭 활성화 업데이트
    this.element.querySelectorAll('.view-tab').forEach(tab => {
      const tabElement = tab as HTMLElement;
      tab.classList.toggle('active', tabElement.dataset?.view === view);
    });

    // 뷰 콘텐츠 표시/숨김
    this.element.querySelectorAll('.view-content').forEach(content => {
      const element = content as HTMLElement;
      const contentView = element.dataset?.view;
      element.style.display = contentView === view ? 'block' : 'none';
    });

    this.updateMetricsView();
  }

  private saveSettings(): void {
    // 설정 저장 로직
    const modal = this.element.querySelector('.settings-modal') as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
    }
  }

  private downloadExport(): void {
    // 내보내기 로직
    const modal = this.element.querySelector('.export-modal') as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
    }
  }

  private processMetricsData(data: any): void {
    Object.entries(data).forEach(([type, metrics]) => {
      if (typeof metrics === 'object' && metrics !== null) {
        Object.entries(metrics as Record<string, any>).forEach(([name, value]) => {
          const metricId = `${type}.${name}`;
          const metric = this.metrics.get(metricId);
          
          if (metric) {
            const numericValue = typeof value === 'object' && value.current !== undefined 
              ? value.current 
              : typeof value === 'number' 
                ? value 
                : 0;
            
            metric.current = numericValue;
            this.addToHistory(metricId, numericValue);
            this.checkThresholds(metric);
          }
        });
      }
    });
  }

  private addToHistory(metricId: string, value: number): void {
    const history = this.metricsHistory.get(metricId) || [];
    const dataPoint: MetricDataPoint = {
      value,
      timestamp: Date.now()
    };
    
    history.push(dataPoint);
    
    // 히스토리 크기 제한
    const maxLength = this.props.maxHistoryLength || 100;
    if (history.length > maxLength) {
      history.shift();
    }
    
    this.metricsHistory.set(metricId, history);
  }

  private checkThresholds(metric: MetricDefinition): void {
    if (!metric.thresholds || metric.current === undefined) return;

    const value = metric.current;
    const { warning, critical } = metric.thresholds;

    // 기존 알림 제거
    this.alerts = this.alerts.filter(alert => alert.metric !== metric.id);

    if (critical !== undefined && value >= critical) {
      this.alerts.push({
        metric: metric.id,
        level: 'critical',
        message: `${metric.displayName}이(가) 임계값(${critical}${metric.unit})을 초과했습니다: ${value}${metric.unit}`,
        timestamp: Date.now()
      });
    } else if (warning !== undefined && value >= warning) {
      this.alerts.push({
        metric: metric.id,
        level: 'warning',
        message: `${metric.displayName}이(가) 경고값(${warning}${metric.unit})을 초과했습니다: ${value}${metric.unit}`,
        timestamp: Date.now()
      });
    }
  }

  private updateUI(): void {
    this.updateStatus();
    this.updateMetricsView();
    this.updateAlerts();
  }

  private updateStatus(): void {
    const totalMetrics = this.metrics.size;
    const alertCount = this.alerts.length;
    
    const totalMetricsEl = this.element.querySelector('.total-metrics');
    const alertCountEl = this.element.querySelector('.alert-count');
    const lastUpdateEl = this.element.querySelector('.last-update');
    
    if (totalMetricsEl) totalMetricsEl.textContent = totalMetrics.toString();
    if (alertCountEl) alertCountEl.textContent = alertCount.toString();
    if (lastUpdateEl && this.lastUpdate) {
      lastUpdateEl.textContent = new Date(this.lastUpdate).toLocaleTimeString();
      lastUpdateEl.setAttribute('data-timestamp', this.lastUpdate.toString());
    }
  }

  private updateMetricsView(): void {
    const currentView = this.componentState.currentView;
    
    switch (currentView) {
      case 'grid':
        this.updateGridView();
        break;
      case 'table':
        this.updateTableView();
        break;
      case 'charts':
        this.updateChartsView();
        break;
    }
  }

  private updateGridView(): void {
    const container = this.element.querySelector('.metrics-grid');
    if (!container) return;

    const filteredMetrics = this.getFilteredMetrics();
    container.innerHTML = '';

    filteredMetrics.forEach(metric => {
      const card = this.createMetricCard(metric);
      container.appendChild(card);
    });
  }

  private updateTableView(): void {
    const tbody = this.element.querySelector('.metrics-table-body');
    if (!tbody) return;

    const filteredMetrics = this.getFilteredMetrics();
    tbody.innerHTML = '';

    filteredMetrics.forEach(metric => {
      const row = this.createMetricTableRow(metric);
      tbody.appendChild(row);
    });
  }

  private updateChartsView(): void {
    const container = this.element.querySelector('.charts-grid');
    if (!container) return;

    const filteredMetrics = this.getFilteredMetrics();
    container.innerHTML = '';

    filteredMetrics.forEach(metric => {
      const chartContainer = this.createChartContainer(metric);
      container.appendChild(chartContainer);
    });
  }

  private updateAlerts(): void {
    const alertCountEl = this.element.querySelector('.alert-count');
    const alertsStatusEl = this.element.querySelector('.alerts-status .status-value');
    
    if (alertCountEl) {
      alertCountEl.textContent = this.alerts.length.toString();
      alertCountEl.setAttribute('data-count', this.alerts.length.toString());
    }
    
    if (alertsStatusEl) {
      alertsStatusEl.textContent = this.alerts.length.toString();
      alertsStatusEl.setAttribute('data-count', this.alerts.length.toString());
    }
  }

  private createMetricCard(metric: MetricDefinition): HTMLElement {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.dataset.metricId = metric.id;

    const value = metric.current ?? 0;
    const formattedValue = this.formatValue(value, metric.format);
    const alertLevel = this.getAlertLevel(metric);
    const trend = this.calculateTrend(metric.id);

    card.innerHTML = `
      <div class="metric-header">
        <h4 class="metric-name">${metric.displayName}</h4>
        <span class="metric-type">${this.getTypeDisplay(metric.type)}</span>
      </div>
      <div class="metric-value-section">
        <div class="metric-value ${alertLevel}">${formattedValue}</div>
        <div class="metric-unit">${metric.unit}</div>
        ${trend ? `<div class="metric-trend ${trend.direction}">${this.getTrendIcon(trend.direction)}</div>` : ''}
      </div>
      <div class="metric-chart-mini">
        ${this.createMiniChart(metric.id)}
      </div>
      ${metric.description ? `<div class="metric-description">${metric.description}</div>` : ''}
    `;

    return card;
  }

  private createMetricTableRow(metric: MetricDefinition): HTMLElement {
    const row = document.createElement('tr');
    const value = metric.current ?? 0;
    const formattedValue = this.formatValue(value, metric.format);
    const alertLevel = this.getAlertLevel(metric);
    const trend = this.calculateTrend(metric.id);
    const lastHistory = this.metricsHistory.get(metric.id);
    const lastUpdate = lastHistory && lastHistory.length > 0 
      ? new Date(lastHistory[lastHistory.length - 1]?.timestamp ?? 0).toLocaleTimeString()
      : '-';

    row.innerHTML = `
      <td>${metric.displayName}</td>
      <td>${this.getTypeDisplay(metric.type)}</td>
      <td class="metric-value-cell ${alertLevel}">${formattedValue}</td>
      <td>${metric.unit}</td>
      <td class="metric-trend-cell ${trend?.direction || 'stable'}">${this.getTrendIcon(trend?.direction || 'stable')}</td>
      <td><span class="alert-badge ${alertLevel}">${this.getStatusText(alertLevel)}</span></td>
      <td>${lastUpdate}</td>
    `;

    return row;
  }

  private createChartContainer(metric: MetricDefinition): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.dataset.metricId = metric.id;

    container.innerHTML = `
      <div class="chart-header">
        <h4 class="chart-title">${metric.displayName}</h4>
        <div class="chart-controls">
          <button class="btn btn-sm" title="새로고침">🔄</button>
          <button class="btn btn-sm" title="설정">⚙️</button>
        </div>
      </div>
      <div class="chart-content">
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
          차트 구현 예정
        </div>
      </div>
    `;

    return container;
  }

  private getFilteredMetrics(): MetricDefinition[] {
    const metrics = Array.from(this.metrics.values());
    const filter = this.currentFilter;

    let filtered = metrics;

    // 타입 필터
    if (filter.types && filter.types.length > 0) {
      filtered = filtered.filter(metric => filter.types!.includes(metric.type));
    }

    // 검색 필터
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(metric => 
        metric.displayName.toLowerCase().includes(searchLower) ||
        metric.name.toLowerCase().includes(searchLower)
      );
    }

    // 정렬
    const sortBy = filter.sortBy || 'name';
    const sortOrder = filter.sortOrder || 'asc';
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'value':
          comparison = (a.current ?? 0) - (b.current ?? 0);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'updated':
          const historyA = this.metricsHistory.get(a.id);
          const historyB = this.metricsHistory.get(b.id);
          const lastA = historyA && historyA.length > 0 ? historyA[historyA.length - 1]?.timestamp ?? 0 : 0;
          const lastB = historyB && historyB.length > 0 ? historyB[historyB.length - 1]?.timestamp ?? 0 : 0;
          comparison = lastA - lastB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }

  private getAlertLevel(metric: MetricDefinition): string {
    if (!metric.thresholds || metric.current === undefined) return 'normal';

    const value = metric.current;
    const { warning, critical } = metric.thresholds;

    if (critical !== undefined && value >= critical) {
      return 'critical';
    } else if (warning !== undefined && value >= warning) {
      return 'warning';
    }

    return 'normal';
  }

  private calculateTrend(metricId: string): { direction: 'up' | 'down' | 'stable'; value: number } | null {
    const history = this.metricsHistory.get(metricId);
    if (!history || history.length < 2) return null;

    const current = history[history.length - 1]?.value ?? 0;
    const previous = history[history.length - 2]?.value ?? 0;
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    if (Math.abs(changePercent) < 1) {
      return { direction: 'stable', value: changePercent };
    }

    return {
      direction: change > 0 ? 'up' : 'down',
      value: changePercent
    };
  }

  private getTypeDisplay(type: MetricType): string {
    const typeMap: Record<MetricType, string> = {
      [MetricType.SYSTEM]: '시스템',
      [MetricType.WEBSOCKET]: 'WebSocket',
      [MetricType.PERFORMANCE]: '성능',
      [MetricType.NETWORK]: '네트워크',
      [MetricType.API]: 'API',
      [MetricType.ERROR]: '에러',
      [MetricType.CUSTOM]: '사용자정의'
    };

    return typeMap[type] || type;
  }

  private getTrendIcon(direction: 'up' | 'down' | 'stable'): string {
    const iconMap = {
      up: '📈',
      down: '📉',
      stable: '➡️'
    };

    return iconMap[direction] || '➡️';
  }

  private createMiniChart(metricId: string): string {
    const history = this.metricsHistory.get(metricId);
    if (!history || history.length === 0) {
      return '<span style="color: #999;">데이터 없음</span>';
    }

    // 간단한 미니 차트 HTML (실제로는 Canvas나 SVG 사용)
    return '<span style="color: #666;">미니 차트</span>';
  }

  private getStatusText(alertLevel: string): string {
    const statusMap: Record<string, string> = {
      normal: '정상',
      warning: '경고',
      critical: '위험'
    };

    return statusMap[alertLevel] || '알 수 없음';
  }

  private generateMockMetrics(): any {
    return {
      system: {
        cpu_usage: Math.random() * 100,
        memory_usage: Math.random() * 100,
        disk_usage: Math.random() * 100
      },
      websocket: {
        connections: Math.floor(Math.random() * 50),
        messages_sent: Math.floor(Math.random() * 1000),
        messages_received: Math.floor(Math.random() * 1000)
      },
      performance: {
        response_time: Math.random() * 2000,
        throughput: Math.random() * 1000
      }
    };
  }

  private formatValue(value: number, format?: string): string {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}`;
      case 'bytes':
        return this.formatBytes(value);
      case 'duration':
        return `${value.toFixed(0)}`;
      case 'number':
        return value.toLocaleString();
      default:
        return value.toString();
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }

  async destroy(): Promise<void> {
    // 타이머 정리
    this.refreshTimers.forEach(timer => clearInterval(timer));
    this.refreshTimers.clear();
    
    if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
    }

    // 차트 정리
    this.charts.forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts.clear();

    await super.destroy();
  }
}