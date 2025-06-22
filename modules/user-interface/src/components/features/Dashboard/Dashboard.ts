/**
 * @fileoverview Dashboard Component
 * @description 대시보드 레이아웃과 위젯 시스템을 관리하는 메인 Feature 컴포넌트
 * @version 2.0.0
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';

/**
 * 위젯 타입 정의
 */
export type WidgetType = 'metric' | 'chart' | 'status' | 'activity' | 'custom';

/**
 * 위젯 크기
 */
export type WidgetSize = 'small' | 'medium' | 'large' | 'extra-large';

/**
 * 위젯 설정
 */
export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: { x: number; y: number; w: number; h: number };
  refreshInterval?: number;
  dataSource?: string;
  customRenderer?: (data: any) => HTMLElement;
  visible: boolean;
  movable: boolean;
  resizable: boolean;
}

/**
 * 대시보드 속성
 */
export interface DashboardProps extends ComponentProps {
  /** 위젯 레이아웃 설정 */
  layout?: 'grid' | 'masonry' | 'flex';
  /** 그리드 컬럼 수 */
  gridColumns?: number;
  /** 자동 새로고침 활성화 */
  autoRefresh?: boolean;
  /** 새로고침 간격 (ms) */
  refreshInterval?: number;
  /** 사용자 정의 가능 여부 */
  customizable?: boolean;
  /** 드래그 앤 드롭 활성화 */
  enableDragDrop?: boolean;
  /** 기본 위젯들 */
  defaultWidgets?: WidgetConfig[];
  /** 테마 */
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * 위젯 데이터
 */
interface WidgetData {
  id: string;
  timestamp: number;
  data: any;
  error?: string;
}

/**
 * Dashboard DOM 요소들
 */
interface DashboardElements {
  container: HTMLElement | null;
  header: HTMLElement | null;
  toolbar: HTMLElement | null;
  widgetGrid: HTMLElement | null;
  addWidgetBtn: HTMLElement | null;
  layoutBtn: HTMLElement | null;
  refreshBtn: HTMLElement | null;
  settingsBtn: HTMLElement | null;
  loadingIndicator: HTMLElement | null;
}

/**
 * 대시보드 컴포넌트
 * 
 * @example
 * ```typescript
 * const dashboard = new Dashboard('#dashboard', {
 *   layout: 'grid',
 *   gridColumns: 4,
 *   autoRefresh: true,
 *   refreshInterval: 30000,
 *   customizable: true,
 *   enableDragDrop: true
 * }, eventManager);
 * 
 * // 위젯 추가
 * dashboard.addWidget({
 *   id: 'cpu-metric',
 *   type: 'metric',
 *   title: 'CPU Usage',
 *   size: 'medium',
 *   position: { x: 0, y: 0, w: 2, h: 1 },
 *   dataSource: 'system.cpu_usage'
 * });
 * ```
 */
export class Dashboard extends BaseComponent<HTMLElement, DashboardProps> {
  private elements: DashboardElements = {
    container: null,
    header: null,
    toolbar: null,
    widgetGrid: null,
    addWidgetBtn: null,
    layoutBtn: null,
    refreshBtn: null,
    settingsBtn: null,
    loadingIndicator: null
  };

  private widgets = new Map<string, WidgetConfig>();
  private widgetInstances = new Map<string, HTMLElement>();
  private widgetData = new Map<string, WidgetData>();
  private refreshTimers = new Map<string, number>();
  private globalRefreshTimer: number | null = null;

  // 드래그 앤 드롭 관련 (향후 구현)
  // private draggedWidget: string | null = null;
  // private isDragging = false;
  // private dragStartPosition = { x: 0, y: 0 };

  // 레이아웃 관련
  private currentLayout: 'grid' | 'masonry' | 'flex' = 'grid';
  private gridColumns = 4;
  private isEditMode = false;

  constructor(
    element: HTMLElement | string,
    props: DashboardProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: DashboardProps = {
      layout: 'grid',
      gridColumns: 4,
      autoRefresh: true,
      refreshInterval: 30000, // 30초
      customizable: true,
      enableDragDrop: true,
      theme: 'auto',
      defaultWidgets: [
        {
          id: 'system-overview',
          type: 'status',
          title: 'System Overview',
          size: 'large',
          position: { x: 0, y: 0, w: 4, h: 2 },
          dataSource: 'system.overview',
          visible: true,
          movable: true,
          resizable: true
        },
        {
          id: 'cpu-metric',
          type: 'metric',
          title: 'CPU Usage',
          size: 'medium',
          position: { x: 0, y: 2, w: 2, h: 1 },
          dataSource: 'system.cpu_usage',
          refreshInterval: 5000,
          visible: true,
          movable: true,
          resizable: true
        },
        {
          id: 'memory-metric',
          type: 'metric',
          title: 'Memory Usage',
          size: 'medium',
          position: { x: 2, y: 2, w: 2, h: 1 },
          dataSource: 'system.memory_usage',
          refreshInterval: 5000,
          visible: true,
          movable: true,
          resizable: true
        },
        {
          id: 'websocket-chart',
          type: 'chart',
          title: 'WebSocket Activity',
          size: 'large',
          position: { x: 0, y: 3, w: 4, h: 2 },
          dataSource: 'websocket.activity',
          refreshInterval: 10000,
          visible: true,
          movable: true,
          resizable: true
        }
      ],
      ...props
    };

    super(element, defaultProps, eventManager);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    
    this.setupLayout();
    this.setupEventListeners();
    this.loadWidgets();
    this.startAutoRefresh();
    this.restoreUserLayout();

    console.info('Dashboard component initialized');
  }

  render(): void {
    this.element.innerHTML = `
      <div class="dashboard-container">
        <!-- Dashboard Header -->
        <header class="dashboard-header" id="dashboardHeader">
          <div class="dashboard-title">
            <h1>Dashboard</h1>
            <span class="dashboard-subtitle">Real-time system overview</span>
          </div>
          
          <!-- Dashboard Toolbar -->
          <div class="dashboard-toolbar" id="dashboardToolbar">
            <div class="toolbar-group">
              <button class="btn btn-outline" id="addWidgetBtn" title="Add Widget">
                <span class="btn-icon">➕</span>
                <span class="btn-text">Add Widget</span>
              </button>
              
              <button class="btn btn-outline" id="layoutBtn" title="Change Layout">
                <span class="btn-icon">⊞</span>
                <span class="btn-text">Layout</span>
              </button>
              
              <button class="btn btn-outline" id="refreshBtn" title="Refresh All">
                <span class="btn-icon">🔄</span>
                <span class="btn-text">Refresh</span>
              </button>
            </div>
            
            <div class="toolbar-group">
              <button class="btn btn-ghost edit-toggle" id="editModeBtn" title="Edit Mode">
                <span class="btn-icon">✏️</span>
                <span class="btn-text">Edit</span>
              </button>
              
              <button class="btn btn-ghost" id="settingsBtn" title="Settings">
                <span class="btn-icon">⚙️</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Widget Grid Container -->
        <main class="dashboard-content">
          <div class="widget-grid ${this.currentLayout}" id="widgetGrid" 
               style="--grid-columns: ${this.gridColumns}">
            <!-- 위젯들이 동적으로 추가됩니다 -->
          </div>

          <!-- Loading Indicator -->
          <div class="loading-indicator hidden" id="loadingIndicator">
            <div class="loading-spinner"></div>
            <span>Loading dashboard data...</span>
          </div>

          <!-- Empty State -->
          <div class="empty-state hidden" id="emptyState">
            <div class="empty-icon">📊</div>
            <h3>No widgets configured</h3>
            <p>Add your first widget to get started</p>
            <button class="btn btn-primary" onclick="document.getElementById('addWidgetBtn').click()">
              Add Widget
            </button>
          </div>
        </main>

        <!-- Widget Template (Hidden) -->
        <template id="widgetTemplate">
          <div class="dashboard-widget" data-widget-id="">
            <header class="widget-header">
              <h3 class="widget-title"></h3>
              <div class="widget-controls">
                <button class="widget-btn refresh-btn" title="Refresh">🔄</button>
                <button class="widget-btn settings-btn" title="Settings">⚙️</button>
                <button class="widget-btn remove-btn" title="Remove">✕</button>
              </div>
            </header>
            <div class="widget-content">
              <div class="widget-loading">
                <div class="loading-spinner"></div>
              </div>
              <div class="widget-data"></div>
              <div class="widget-error hidden">
                <div class="error-icon">⚠️</div>
                <span class="error-message"></span>
              </div>
            </div>
          </div>
        </template>
      </div>
    `;

    this.findDOMElements();
  }

  private findDOMElements(): void {
    this.elements.container = this.element.querySelector('.dashboard-container');
    this.elements.header = this.element.querySelector('#dashboardHeader');
    this.elements.toolbar = this.element.querySelector('#dashboardToolbar');
    this.elements.widgetGrid = this.element.querySelector('#widgetGrid');
    this.elements.addWidgetBtn = this.element.querySelector('#addWidgetBtn');
    this.elements.layoutBtn = this.element.querySelector('#layoutBtn');
    this.elements.refreshBtn = this.element.querySelector('#refreshBtn');
    this.elements.settingsBtn = this.element.querySelector('#settingsBtn');
    this.elements.loadingIndicator = this.element.querySelector('#loadingIndicator');
  }

  private setupLayout(): void {
    this.currentLayout = this.props.layout || 'grid';
    this.gridColumns = this.props.gridColumns || 4;
    
    if (this.elements.widgetGrid) {
      this.elements.widgetGrid.className = `widget-grid ${this.currentLayout}`;
      this.elements.widgetGrid.style.setProperty('--grid-columns', this.gridColumns.toString());
    }
  }

  private setupEventListeners(): void {
    // Toolbar 이벤트
    if (this.elements.addWidgetBtn) {
      this.addDOMEventListener(this.elements.addWidgetBtn, 'click', this.handleAddWidget.bind(this));
    }

    if (this.elements.layoutBtn) {
      this.addDOMEventListener(this.elements.layoutBtn, 'click', this.handleLayoutChange.bind(this));
    }

    if (this.elements.refreshBtn) {
      this.addDOMEventListener(this.elements.refreshBtn, 'click', this.handleRefreshAll.bind(this));
    }

    if (this.elements.settingsBtn) {
      this.addDOMEventListener(this.elements.settingsBtn, 'click', this.handleSettings.bind(this));
    }

    const editModeBtn = this.element.querySelector('#editModeBtn');
    if (editModeBtn) {
      this.addDOMEventListener(editModeBtn, 'click', this.handleEditModeToggle.bind(this));
    }

    // 드래그 앤 드롭 이벤트 (활성화된 경우)
    if (this.props.enableDragDrop) {
      this.setupDragDropEvents();
    }

    // 전역 이벤트
    this.addEventListener('dashboard:widget-added', this.handleWidgetAdded.bind(this));
    this.addEventListener('dashboard:widget-removed', this.handleWidgetRemoved.bind(this));
    this.addEventListener('dashboard:data-updated', this.handleDataUpdated.bind(this));
  }

  private loadWidgets(): void {
    // 기본 위젯들 로드
    if (this.props.defaultWidgets) {
      this.props.defaultWidgets.forEach(widget => {
        this.addWidget(widget);
      });
    }

    // 빈 상태 확인
    this.checkEmptyState();
  }

  /**
   * 위젯 추가
   */
  addWidget(config: WidgetConfig): void {
    if (this.widgets.has(config.id)) {
      console.warn(`Widget with id '${config.id}' already exists`);
      return;
    }

    this.widgets.set(config.id, config);
    this.createWidgetElement(config);
    this.startWidgetRefresh(config);
    this.checkEmptyState();

    // 이벤트 발생
    this.emit('widget:added', { widgetId: config.id, config });
  }

  /**
   * 위젯 제거
   */
  removeWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    // 타이머 정리
    this.stopWidgetRefresh(widgetId);

    // DOM 요소 제거
    const element = this.widgetInstances.get(widgetId);
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }

    // 데이터 정리
    this.widgets.delete(widgetId);
    this.widgetInstances.delete(widgetId);
    this.widgetData.delete(widgetId);

    this.checkEmptyState();

    // 이벤트 발생
    this.emit('widget:removed', { widgetId });
  }

  private createWidgetElement(config: WidgetConfig): HTMLElement {
    const template = this.element.querySelector('#widgetTemplate') as HTMLTemplateElement;
    if (!template) {
      throw new Error('Widget template not found');
    }

    const widgetElement = template.content.cloneNode(true) as DocumentFragment;
    const widget = widgetElement.querySelector('.dashboard-widget') as HTMLElement;

    if (!widget) {
      throw new Error('Widget element not found in template');
    }

    // 위젯 설정
    widget.setAttribute('data-widget-id', config.id);
    widget.classList.add(`widget-${config.type}`, `widget-${config.size}`);

    // 위치 및 크기 설정
    this.setWidgetPosition(widget, config.position);

    // 제목 설정
    const titleElement = widget.querySelector('.widget-title');
    if (titleElement) {
      titleElement.textContent = config.title;
    }

    // 컨트롤 이벤트 설정
    this.setupWidgetControls(widget, config);

    // 그리드에 추가
    if (this.elements.widgetGrid) {
      this.elements.widgetGrid.appendChild(widget);
    }

    // 인스턴스 저장
    this.widgetInstances.set(config.id, widget);

    // 초기 데이터 로드
    this.loadWidgetData(config.id);

    return widget;
  }

  private setWidgetPosition(element: HTMLElement, position: { x: number; y: number; w: number; h: number }): void {
    if (this.currentLayout === 'grid') {
      element.style.gridColumn = `${position.x + 1} / span ${position.w}`;
      element.style.gridRow = `${position.y + 1} / span ${position.h}`;
    }
  }

  private setupWidgetControls(widget: HTMLElement, config: WidgetConfig): void {
    const refreshBtn = widget.querySelector('.refresh-btn');
    const settingsBtn = widget.querySelector('.settings-btn');
    const removeBtn = widget.querySelector('.remove-btn');

    if (refreshBtn) {
      this.addDOMEventListener(refreshBtn, 'click', () => this.refreshWidget(config.id));
    }

    if (settingsBtn) {
      this.addDOMEventListener(settingsBtn, 'click', () => this.showWidgetSettings(config.id));
    }

    if (removeBtn) {
      this.addDOMEventListener(removeBtn, 'click', () => this.confirmRemoveWidget(config.id));
    }
  }

  private async loadWidgetData(widgetId: string): Promise<void> {
    const config = this.widgets.get(widgetId);
    const element = this.widgetInstances.get(widgetId);

    if (!config || !element) return;

    try {
      // 로딩 상태 표시
      this.setWidgetLoading(element, true);

      // 데이터 소스에 따른 데이터 로드
      let data: any;
      if (config.dataSource) {
        data = await this.fetchWidgetData(config.dataSource);
      } else {
        data = this.generateMockData(config.type);
      }

      // 데이터 저장
      const widgetData: WidgetData = {
        id: widgetId,
        timestamp: Date.now(),
        data
      };
      this.widgetData.set(widgetId, widgetData);

      // 위젯 렌더링
      this.renderWidgetData(element, config, data);

    } catch (error) {
      console.error(`Failed to load data for widget ${widgetId}:`, error);
      this.setWidgetError(element, error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      this.setWidgetLoading(element, false);
    }
  }

  private async fetchWidgetData(dataSource: string): Promise<any> {
    // 실제 구현에서는 서비스를 통해 데이터를 가져옴
    // 여기서는 시뮬레이션
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.generateMockData(dataSource));
      }, 100 + Math.random() * 500);
    });
  }

  private generateMockData(type: string): any {
    const baseData = {
      timestamp: Date.now(),
      source: type
    };

    switch (type) {
      case 'system.cpu_usage':
        return {
          ...baseData,
          value: Math.round(Math.random() * 100),
          unit: '%',
          trend: Math.random() > 0.5 ? 'up' : 'down',
          history: Array.from({ length: 10 }, () => Math.round(Math.random() * 100))
        };

      case 'system.memory_usage':
        return {
          ...baseData,
          value: Math.round(Math.random() * 100),
          unit: '%',
          used: Math.round(Math.random() * 16),
          total: 16,
          available: Math.round(Math.random() * 8)
        };

      case 'websocket.activity':
        return {
          ...baseData,
          connections: Math.round(Math.random() * 50),
          messages: Math.round(Math.random() * 1000),
          errors: Math.round(Math.random() * 10),
          chartData: Array.from({ length: 24 }, () => Math.round(Math.random() * 100))
        };

      case 'system.overview':
        return {
          ...baseData,
          uptime: '2d 14h 32m',
          status: Math.random() > 0.8 ? 'warning' : 'healthy',
          services: {
            running: 12,
            stopped: 1,
            total: 13
          },
          load: Math.random() * 2
        };

      default:
        return {
          ...baseData,
          value: Math.round(Math.random() * 100),
          status: 'ok'
        };
    }
  }

  private renderWidgetData(element: HTMLElement, config: WidgetConfig, data: any): void {
    const contentArea = element.querySelector('.widget-data');
    if (!contentArea) return;

    // 커스텀 렌더러가 있는 경우
    if (config.customRenderer) {
      const customElement = config.customRenderer(data);
      contentArea.innerHTML = '';
      contentArea.appendChild(customElement);
      return;
    }

    // 기본 렌더러
    switch (config.type) {
      case 'metric':
        this.renderMetricWidget(contentArea, data);
        break;
      case 'chart':
        this.renderChartWidget(contentArea, data);
        break;
      case 'status':
        this.renderStatusWidget(contentArea, data);
        break;
      case 'activity':
        this.renderActivityWidget(contentArea, data);
        break;
      default:
        contentArea.innerHTML = '<div class="widget-placeholder">Widget type not implemented</div>';
    }
  }

  private renderMetricWidget(container: Element, data: any): void {
    const trendIcon = data.trend === 'up' ? '📈' : '📉';
    
    container.innerHTML = `
      <div class="metric-widget">
        <div class="metric-primary">
          <span class="metric-value">${data.value}</span>
          <span class="metric-unit">${data.unit || ''}</span>
          <span class="metric-trend">${trendIcon}</span>
        </div>
        ${data.history ? `
          <div class="metric-sparkline">
            ${data.history.map((val: number, idx: number) => 
              `<div class="spark-bar" style="height: ${val}%; animation-delay: ${idx * 50}ms"></div>`
            ).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderChartWidget(container: Element, data: any): void {
    container.innerHTML = `
      <div class="chart-widget">
        <div class="chart-stats">
          <div class="stat">
            <span class="stat-label">Connections</span>
            <span class="stat-value">${data.connections || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Messages</span>
            <span class="stat-value">${data.messages || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Errors</span>
            <span class="stat-value">${data.errors || 0}</span>
          </div>
        </div>
        <div class="chart-area">
          ${data.chartData ? this.createSimpleChart(data.chartData) : '<div class="no-chart">No chart data</div>'}
        </div>
      </div>
    `;
  }

  private renderStatusWidget(container: Element, data: any): void {
    const statusClass = data.status === 'healthy' ? 'status-good' : 'status-warning';
    
    container.innerHTML = `
      <div class="status-widget">
        <div class="status-overview ${statusClass}">
          <div class="status-indicator"></div>
          <span class="status-text">${data.status || 'unknown'}</span>
        </div>
        <div class="status-details">
          <div class="detail-item">
            <span class="detail-label">Uptime</span>
            <span class="detail-value">${data.uptime || 'N/A'}</span>
          </div>
          ${data.services ? `
            <div class="detail-item">
              <span class="detail-label">Services</span>
              <span class="detail-value">${data.services.running}/${data.services.total}</span>
            </div>
          ` : ''}
          ${data.load ? `
            <div class="detail-item">
              <span class="detail-label">Load</span>
              <span class="detail-value">${data.load.toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderActivityWidget(container: Element, data: any): void {
    container.innerHTML = `
      <div class="activity-widget">
        <div class="activity-list">
          <div class="activity-item">
            <span class="activity-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
            <span class="activity-desc">System activity logged</span>
          </div>
        </div>
      </div>
    `;
  }

  private createSimpleChart(data: number[]): string {
    const max = Math.max(...data);
    const bars = data.map((value, index) => {
      const height = max > 0 ? (value / max) * 100 : 0;
      return `<div class="chart-bar" style="height: ${height}%; animation-delay: ${index * 20}ms"></div>`;
    }).join('');

    return `<div class="simple-chart">${bars}</div>`;
  }

  private setWidgetLoading(element: HTMLElement, loading: boolean): void {
    const loadingElement = element.querySelector('.widget-loading');
    const dataElement = element.querySelector('.widget-data');

    if (loadingElement && dataElement) {
      if (loading) {
        loadingElement.classList.remove('hidden');
        dataElement.classList.add('hidden');
      } else {
        loadingElement.classList.add('hidden');
        dataElement.classList.remove('hidden');
      }
    }
  }

  private setWidgetError(element: HTMLElement, message: string): void {
    const errorElement = element.querySelector('.widget-error');
    const messageElement = element.querySelector('.error-message');

    if (errorElement && messageElement) {
      messageElement.textContent = message;
      errorElement.classList.remove('hidden');
    }
  }

  private startWidgetRefresh(config: WidgetConfig): void {
    if (!config.refreshInterval) return;

    const timer = window.setInterval(() => {
      this.loadWidgetData(config.id);
    }, config.refreshInterval);

    this.refreshTimers.set(config.id, timer);
  }

  private stopWidgetRefresh(widgetId: string): void {
    const timer = this.refreshTimers.get(widgetId);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(widgetId);
    }
  }

  private startAutoRefresh(): void {
    if (!this.props.autoRefresh || !this.props.refreshInterval) return;

    this.globalRefreshTimer = window.setInterval(() => {
      this.refreshAllWidgets();
    }, this.props.refreshInterval);
  }

  private stopAutoRefresh(): void {
    if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
      this.globalRefreshTimer = null;
    }
  }

  private refreshAllWidgets(): void {
    this.widgets.forEach((_, widgetId) => {
      this.loadWidgetData(widgetId);
    });
  }

  private refreshWidget(widgetId: string): void {
    this.loadWidgetData(widgetId);
  }

  private checkEmptyState(): void {
    const emptyState = this.element.querySelector('#emptyState');
    if (!emptyState) return;

    if (this.widgets.size === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }
  }

  // Event Handlers
  private handleAddWidget(): void {
    // 위젯 추가 모달 표시 (향후 구현)
    console.log('Add widget clicked');
    this.emit('dashboard:add-widget-requested');
  }

  private handleLayoutChange(): void {
    const layouts: Array<'grid' | 'masonry' | 'flex'> = ['grid', 'masonry', 'flex'];
    const currentIndex = layouts.indexOf(this.currentLayout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    
    this.currentLayout = layouts[nextIndex]!; // Non-null assertion since nextIndex is always valid
    this.setupLayout();
  }

  private handleRefreshAll(): void {
    this.refreshAllWidgets();
  }

  private handleSettings(): void {
    console.log('Settings clicked');
    this.emit('dashboard:settings-requested');
  }

  private handleEditModeToggle(): void {
    this.isEditMode = !this.isEditMode;
    const editBtn = this.element.querySelector('#editModeBtn');
    
    if (editBtn) {
      if (this.isEditMode) {
        editBtn.classList.add('active');
        this.element.classList.add('edit-mode');
      } else {
        editBtn.classList.remove('active');
        this.element.classList.remove('edit-mode');
      }
    }
  }

  private setupDragDropEvents(): void {
    // 드래그 앤 드롭 구현 (향후 구현)
    console.log('Drag & drop setup');
  }

  private showWidgetSettings(widgetId: string): void {
    console.log(`Widget settings for ${widgetId}`);
    this.emit('widget:settings-requested', { widgetId });
  }

  private confirmRemoveWidget(widgetId: string): void {
    if (confirm('Are you sure you want to remove this widget?')) {
      this.removeWidget(widgetId);
    }
  }

  private restoreUserLayout(): void {
    // 사용자 레이아웃 복원 (향후 구현)
    console.log('Restore user layout');
  }

  private saveUserLayout(): void {
    // 사용자 레이아웃 저장 (향후 구현)
    console.log('Save user layout');
  }

  // Event Handlers
  private handleWidgetAdded(event: CustomEvent): void {
    console.log('Widget added:', event.detail);
  }

  private handleWidgetRemoved(event: CustomEvent): void {
    console.log('Widget removed:', event.detail);
  }

  private handleDataUpdated(event: CustomEvent): void {
    const { widgetId, data } = event.detail;
    const element = this.widgetInstances.get(widgetId);
    const config = this.widgets.get(widgetId);

    if (element && config) {
      this.renderWidgetData(element, config, data);
    }
  }

  // Public API
  getWidget(widgetId: string): WidgetConfig | undefined {
    return this.widgets.get(widgetId);
  }

  getAllWidgets(): WidgetConfig[] {
    return Array.from(this.widgets.values());
  }

  getWidgetData(widgetId: string): WidgetData | undefined {
    return this.widgetData.get(widgetId);
  }

  updateWidget(widgetId: string, updates: Partial<WidgetConfig>): void {
    const existing = this.widgets.get(widgetId);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.widgets.set(widgetId, updated);
      
      // 필요한 경우 위젯 재렌더링
      if (updates.title || updates.size || updates.position) {
        const element = this.widgetInstances.get(widgetId);
        if (element) {
          // 위젯 업데이트 로직
          this.updateWidgetElement(element, updated);
        }
      }
    }
  }

  private updateWidgetElement(element: HTMLElement, config: WidgetConfig): void {
    // 제목 업데이트
    const titleElement = element.querySelector('.widget-title');
    if (titleElement) {
      titleElement.textContent = config.title;
    }

    // 크기 클래스 업데이트
    element.className = element.className
      .replace(/widget-\w+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    element.classList.add(`widget-${config.type}`, `widget-${config.size}`);

    // 위치 업데이트
    this.setWidgetPosition(element, config.position);
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.element.setAttribute('data-theme', theme);
  }

  async destroy(): Promise<void> {
    // 모든 타이머 정리
    this.refreshTimers.forEach(timer => clearInterval(timer));
    this.refreshTimers.clear();

    // 자동 새로고침 중지
    this.stopAutoRefresh();

    // 사용자 레이아웃 저장
    this.saveUserLayout();

    // 부모 destroy 호출
    await super.destroy();

    console.info('Dashboard component destroyed');
  }
}

