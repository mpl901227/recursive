import type { LogService } from '../../services/LogService.js';
import type { LogEntry, EventMap } from '../../types/index.js';
import { ComponentFactory } from '../../utils/component-factory.js';
import { eventManager } from '../../core/EventManager.js';
import { domManager } from '../../core/DOMManager.js';

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  errorRate: number;
}

export class LogDashboard {
  private _element: HTMLElement | null = null;
  private logService: LogService;
  private isStreaming = false;
  private logs: LogEntry[] = [];
  private filteredLogs: LogEntry[] = [];
  private filters = {
    level: 'ALL',
    source: 'ALL',
    timeRange: '1h',
    search: ''
  };

  // 헤더만 다시 그리기
  private headerElement: HTMLElement | null = null;
  private statsSection: HTMLElement | null = null;
  private filtersSection: HTMLElement | null = null;
  private contentSection: HTMLElement | null = null;

  private initialized = false;
  private boundHandleNewLog: (log: LogEntry) => void;
  private boundClearLogs: () => void;
  private boundHandleFilter: (data: EventMap['log:filter']) => void;

  constructor(logService: LogService) {
    this.logService = logService;
    
    // 이벤트 핸들러 바인딩
    this.boundHandleNewLog = this.handleNewLog.bind(this);
    this.boundClearLogs = () => this.clearLogs();
    this.boundHandleFilter = (data: EventMap['log:filter']) => {
      this.setFilter(data.type, data.value);
    };
  }

  private handleNewLog(log: LogEntry): void {
    if (!this.isStreaming) return;
    
    this.logs.unshift({
      ...log,
      metadata: {
        ...log.metadata,
        realtime: true,
        received_at: new Date().toISOString()
      }
    });
    
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }
    
    this.applyFilters();
    this.updateLogDisplay();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 이벤트 리스너 등록
    eventManager.on('log:new', this.boundHandleNewLog);
    eventManager.on('log:clear', this.boundClearLogs);
    eventManager.on('log:filter', this.boundHandleFilter);
    
    await this.loadInitialData();
    this.initialized = true;
  }

  async render(): Promise<HTMLElement> {
    if (!this.initialized) {
      await this.initialize();
    }

    const container = domManager.createElement('div', {
      className: 'log-dashboard'
    });
    this._element = container;

    // 헤더, 통계, 필터, 컨텐츠 영역 생성 및 추가
    this.headerElement = this.createHeader();
    container.appendChild(this.headerElement);
    this.statsSection = this.createStatsSection(this.calculateStats());
    container.appendChild(this.statsSection);
    this.filtersSection = this.createFiltersSection(this.calculateStats());
    container.appendChild(this.filtersSection);
    this.contentSection = this.createContentSection();
    container.appendChild(this.contentSection);

    return container;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    // 왼쪽 영역
    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';
    
    const title = document.createElement('h1');
    title.textContent = '로그 대시보드';
    headerLeft.appendChild(title);
    
    // 연결 상태 표시
    const indicator = ComponentFactory.createBadge(
      this.isStreaming && this.logService.isConnected() ? '실시간 수신 중' : '수신 중지됨',
      {
        color: this.isStreaming && this.logService.isConnected() ? 'success' : 'secondary',
        className: 'connection-indicator'
      }
    );
    headerLeft.appendChild(indicator);
    
    // 오른쪽 액션 버튼들
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    
    const toggleBtn = ComponentFactory.createButton({
      children: this.isStreaming ? '중지' : '시작',
      color: this.isStreaming ? 'warning' : 'success',
      onClick: () => this.toggleStream()
    });
    
    const clearBtn = ComponentFactory.createButton({
      children: '지우기',
      color: 'secondary',
      variant: 'outline',
      onClick: () => this.clearLogs()
    });
    
    const exportBtn = ComponentFactory.createButton({
      children: '내보내기',
      color: 'primary',
      variant: 'outline',
      onClick: () => this.exportLogs()
    });
    
    ComponentFactory.appendTo(headerActions, toggleBtn, clearBtn, exportBtn);
    ComponentFactory.appendTo(header, headerLeft, headerActions);
    
    return header;
  }

  private createStatsSection(stats: LogStats): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dashboard-stats';
    
    const totalCard = ComponentFactory.createStatCard({
      value: stats.total,
      label: '총 로그',
      variant: 'default'
    });
    
    const errorCard = ComponentFactory.createStatCard({
      value: stats.byLevel.ERROR || 0,
      label: '에러',
      color: 'error'
    });
    
    const warnCard = ComponentFactory.createStatCard({
      value: stats.byLevel.WARN || 0,
      label: '경고',
      color: 'warning'
    });
    
    const infoCard = ComponentFactory.createStatCard({
      value: stats.byLevel.INFO || 0,
      label: '정보',
      color: 'success'
    });
    
    ComponentFactory.appendTo(section, totalCard, errorCard, warnCard, infoCard);
    
    return section;
  }

  private createFiltersSection(stats: LogStats): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dashboard-filters';
    
    // 레벨 필터
    const levelFilter = ComponentFactory.createFilter({
      label: '레벨',
      options: [
        { value: 'ALL', text: '전체' },
        { value: 'ERROR', text: 'ERROR' },
        { value: 'WARN', text: 'WARN' },
        { value: 'INFO', text: 'INFO' },
        { value: 'DEBUG', text: 'DEBUG' }
      ],
      onChange: (value) => this.setFilter('level', value)
    });
    
    // 소스 필터
    const sourceOptions = [{ value: 'ALL', text: '전체' }];
    Object.keys(stats.bySource).forEach(source => {
      sourceOptions.push({ value: source, text: source });
    });
    
    const sourceFilter = ComponentFactory.createFilter({
      label: '소스',
      options: sourceOptions,
      onChange: (value) => this.setFilter('source', value)
    });
    
    // 시간 필터
    const timeFilter = ComponentFactory.createFilter({
      label: '시간',
      options: [
        { value: '1h', text: '최근 1시간' },
        { value: '6h', text: '최근 6시간' },
        { value: '24h', text: '최근 24시간' },
        { value: '7d', text: '최근 7일' }
      ],
      onChange: (value) => this.setFilter('timeRange', value)
    });
    
    // 검색 필터
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'filter-group search';
    
    const searchInput = ComponentFactory.createInput({
      type: 'text',
      placeholder: '메시지 검색...',
      label: '검색'
    });
    
    // 검색 입력 이벤트 리스너 추가
    const inputElement = searchInput.querySelector('input') as HTMLInputElement;
    if (inputElement) {
      inputElement.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.setFilter('search', target.value);
      });
    }
    
    searchWrapper.appendChild(searchInput);
    
    ComponentFactory.appendTo(section, levelFilter, sourceFilter, timeFilter, searchWrapper);
    
    return section;
  }

  private createContentSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dashboard-content';
    
    // 로그 스트림 섹션
    const logStreamCard = ComponentFactory.createCard({
      header: '실시간 로그 스트림',
      children: this.createLogContainer(),
      variant: 'elevated',
      className: 'log-stream'
    });
    
    // 분석 섹션
    const analysisCard = ComponentFactory.createCard({
      header: '로그 분석',
      children: this.createAnalysisCharts(),
      variant: 'elevated',
      className: 'log-analysis'
    });
    
    ComponentFactory.appendTo(section, logStreamCard, analysisCard);
    
    return section;
  }

  private createLogContainer(): HTMLElement {
    const container = document.createElement('div');
    
    // 스트림 컨트롤
    const controls = document.createElement('div');
    controls.className = 'stream-controls';
    
    const scrollBtn = ComponentFactory.createButton({
      children: '맨 아래로',
      size: 'sm',
      variant: 'outline',
      onClick: () => this.scrollToBottom()
    });
    
    const autoScrollWrapper = document.createElement('label');
    autoScrollWrapper.className = 'auto-scroll';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.isStreaming;
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.setAutoScroll(target.checked);
    });
    
    const label = document.createElement('span');
    label.textContent = '자동 스크롤';
    
    autoScrollWrapper.appendChild(checkbox);
    autoScrollWrapper.appendChild(label);
    
    ComponentFactory.appendTo(controls, scrollBtn, autoScrollWrapper);
    
    // 로그 컨테이너
    const logContainer = document.createElement('div');
    logContainer.className = 'log-container';
    logContainer.id = 'logContainer';
    logContainer.innerHTML = this.renderLogs();
    
    ComponentFactory.appendTo(container, controls, logContainer);
    
    return container;
  }

  private createAnalysisCharts(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'analysis-charts';
    
    // 레벨별 분포 차트
    const levelChartContainer = document.createElement('div');
    levelChartContainer.className = 'chart-container';
    
    const levelCanvas = document.createElement('canvas');
    levelCanvas.id = 'levelChart';
    levelCanvas.width = 200;
    levelCanvas.height = 150;
    
    const levelTitle = document.createElement('div');
    levelTitle.className = 'chart-title';
    levelTitle.textContent = '레벨별 분포';
    
    ComponentFactory.appendTo(levelChartContainer, levelCanvas, levelTitle);
    
    // 시간별 추이 차트
    const timeChartContainer = document.createElement('div');
    timeChartContainer.className = 'chart-container';
    
    const timeCanvas = document.createElement('canvas');
    timeCanvas.id = 'timeChart';
    timeCanvas.width = 300;
    timeCanvas.height = 150;
    
    const timeTitle = document.createElement('div');
    timeTitle.className = 'chart-title';
    timeTitle.textContent = '시간별 추이';
    
    ComponentFactory.appendTo(timeChartContainer, timeCanvas, timeTitle);
    ComponentFactory.appendTo(container, levelChartContainer, timeChartContainer);
    
    return container;
  }

  private renderLogs(): string {
    if (this.filteredLogs.length === 0) {
      return '<div class="no-logs">표시할 로그가 없습니다.</div>';
    }

    return this.filteredLogs.slice(-100).map(log => `
      <div class="log-entry ${log.level.toLowerCase()}" data-level="${log.level}">
        <div class="log-timestamp">${this.formatTimestamp(log.timestamp)}</div>
        <div class="log-level">${log.level}</div>
        <div class="log-source">${log.source}</div>
        <div class="log-message">${this.escapeHtml(log.message)}</div>
        ${log.metadata ? `<div class="log-metadata">${JSON.stringify(log.metadata, null, 2)}</div>` : ''}
      </div>
    `).join('');
  }

  private async loadInitialData(): Promise<void> {
    try {
      console.log('로그 대시보드 초기 데이터 로딩 중...');
      
      // 로그 서비스 초기화
      await this.logService.initialize();
      
      // 최근 로그 가져오기
      const recentLogs = await this.logService.getRecentLogs({
        limit: 100,
        timeRange: this.filters.timeRange
      });
      
      console.log(`${recentLogs.length}개의 최근 로그를 가져왔습니다.`);
      this.logs = recentLogs;
      this.applyFilters();
      
      // 통계 업데이트
      this.updateStats();
      
      // UI 업데이트
      this.updateLogDisplay();
      
      // MCP 로그 도구를 통한 추가 로그 수집
      await this.fetchMCPLogs();
      
    } catch (error) {
      console.error('초기 데이터 로딩 실패:', error);
      
      // 실패 시 기본 시스템 로그 생성
      this.generateFallbackLogs();
    }
  }

  private async fetchMCPLogs(): Promise<void> {
    try {
      console.log('MCP 도구를 통한 로그 수집 중...');
      
      // window.mcpTools가 있다면 사용
      if (typeof window !== 'undefined' && (window as any).mcpTools) {
        const mcpTools = (window as any).mcpTools;
        
        // 최근 에러 로그 수집
        const errorLogs = await mcpTools.get_recent_errors({
          minutes: 30,
          limit: 20
        });
        
        if (errorLogs && errorLogs.recent_errors) {
          const mcpErrorLogs = errorLogs.recent_errors.map((error: any) => ({
            id: error.trace_id || this.generateId(),
            timestamp: error.timestamp,
            level: 'ERROR' as const,
            source: error.source || 'mcp-system',
            message: error.message,
            metadata: {
              error_type: error.error_type,
              stack: error.stack,
              trace_id: error.trace_id,
              ...error.metadata
            },
            traceId: error.trace_id
          }));
          
          this.logs.unshift(...mcpErrorLogs);
          console.log(`MCP를 통해 ${mcpErrorLogs.length}개의 에러 로그 추가됨`);
        }
        
        // 최근 일반 로그 수집
        const recentLogs = await mcpTools.get_recent_logs({
          minutes: 10,
          limit: 30,
          levels: ['INFO', 'WARN', 'ERROR']
        });
        
        if (recentLogs && recentLogs.logs) {
          const mcpLogs = recentLogs.logs.map((log: any) => ({
            id: log.id || this.generateId(),
            timestamp: log.timestamp,
            level: log.level || 'INFO',
            source: log.source || 'mcp-system',
            message: log.message,
            metadata: log.metadata || {},
            traceId: log.trace_id || log.traceId
          }));
          
          this.logs.unshift(...mcpLogs);
          console.log(`MCP를 통해 ${mcpLogs.length}개의 일반 로그 추가됨`);
        }
        
        // 중복 제거 및 정렬
        this.deduplicateAndSortLogs();
        this.applyFilters();
        this.updateLogDisplay();
        
      } else {
        console.log('MCP 도구를 사용할 수 없음, 대체 로그 생성');
        this.generateSystemStatusLogs();
      }
      
    } catch (error) {
      console.warn('MCP 로그 수집 실패:', error);
      this.generateSystemStatusLogs();
    }
  }

  private generateSystemStatusLogs(): void {
    // 실제 시스템 상태 기반 로그 생성
    const systemLogs: LogEntry[] = [];
    const now = new Date();
    
    // 브라우저 성능 메트릭
    if (performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const memoryLimit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      
      systemLogs.push({
        id: this.generateId(),
        timestamp: now.toISOString(),
        level: memoryUsage > memoryLimit * 0.8 ? 'WARN' : 'INFO',
        source: 'browser-performance',
        message: `JavaScript heap usage: ${memoryUsage}MB / ${memoryLimit}MB (${Math.round(memoryUsage/memoryLimit*100)}%)`,
        metadata: {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          usage_percentage: Math.round(memoryUsage/memoryLimit*100)
        }
      });
    }
    
    // 네트워크 연결 상태
    systemLogs.push({
      id: this.generateId(),
      timestamp: now.toISOString(),
      level: navigator.onLine ? 'INFO' : 'ERROR',
      source: 'network-status',
      message: `Network status: ${navigator.onLine ? 'Online' : 'Offline'}`,
      metadata: {
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform
      }
    });
    
    // 로컬 스토리지 사용량 체크
    try {
      const storageUsed = JSON.stringify(localStorage).length;
      const storageUsedKB = Math.round(storageUsed / 1024);
      
      systemLogs.push({
        id: this.generateId(),
        timestamp: now.toISOString(),
        level: storageUsedKB > 5000 ? 'WARN' : 'INFO',
        source: 'storage-monitor',
        message: `Local storage usage: ${storageUsedKB}KB`,
        metadata: {
          storage_bytes: storageUsed,
          storage_kb: storageUsedKB,
          item_count: localStorage.length
        }
      });
    } catch (error) {
      systemLogs.push({
        id: this.generateId(),
        timestamp: now.toISOString(),
        level: 'ERROR',
        source: 'storage-monitor',
        message: `Failed to check storage usage: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
    }
    
    // UI 컴포넌트 상태
    systemLogs.push({
      id: this.generateId(),
      timestamp: now.toISOString(),
      level: 'INFO',
      source: 'ui-dashboard',
      message: `Dashboard initialized with ${this.logs.length} logs, filters: ${JSON.stringify(this.filters)}`,
      metadata: {
        total_logs: this.logs.length,
        filtered_logs: this.filteredLogs.length,
        filters: this.filters,
        streaming: this.isStreaming
      }
    });
    
    this.logs.unshift(...systemLogs);
    console.log(`${systemLogs.length}개의 시스템 상태 로그 생성됨`);
  }

  private deduplicateAndSortLogs(): void {
    // ID 기반 중복 제거
    const seen = new Set();
    this.logs = this.logs.filter(log => {
      if (seen.has(log.id)) {
        return false;
      }
      seen.add(log.id);
      return true;
    });
    
    // 시간순 정렬 (최신 순)
    this.logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // 최대 로그 수 제한
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }
  }

  private generateFallbackLogs(): void {
    console.log('백업 로그 생성 중...');
    
    const fallbackLogs: LogEntry[] = [];
    const now = Date.now();
    
    // 지난 1시간 동안의 샘플 로그 생성
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(now - Math.random() * 3600000); // 1시간
      
      fallbackLogs.push({
        id: this.generateId(),
        timestamp: timestamp.toISOString(),
        level: this.getRandomLevel(),
        source: this.getRandomSource(),
        message: this.getRandomMessage(),
        metadata: {
          generated: true,
          fallback: true,
          index: i
        }
      });
    }
    
    this.logs = fallbackLogs;
    this.applyFilters();
    this.updateLogDisplay();
  }

  private getRandomLevel(): LogEntry['level'] {
    const levels: LogEntry['level'][] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const weights = [0.3, 0.5, 0.15, 0.05]; // INFO가 가장 많고, ERROR가 가장 적음
    
    const random = Math.random();
    let sum = 0;
    
    for (let i = 0; i < levels.length; i++) {
      sum += weights[i];
      if (random <= sum) {
        return levels[i];
      }
    }
    
    return 'INFO';
  }

  private getRandomSource(): string {
    const sources = [
      'ui-dashboard', 'log-service', 'websocket-client', 'api-client',
      'component-factory', 'event-manager', 'storage-manager', 'router'
    ];
    return sources[Math.floor(Math.random() * sources.length)];
  }

  private getRandomMessage(): string {
    const messages = [
      'Component initialized successfully',
      'Data loaded from cache',
      'WebSocket connection established',
      'User interaction processed',
      'State synchronized',
      'API request completed',
      'Event handler registered',
      'Route navigation completed',
      'Configuration updated',
      'Cleanup performed'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private generateId(): string {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private startLogStream(): void {
    if (!this.isStreaming) return;
    
    console.log('로그 스트림 시작');
    
    // 실시간 로그 콜백 등록
    this.logService.onNewLog((log: LogEntry) => {
      console.log('새 로그 수신:', log);
      
      // 새 로그를 맨 앞에 추가
      this.logs.unshift({
        ...log,
        metadata: {
          ...log.metadata,
          realtime: true,
          received_at: new Date().toISOString()
        }
      });
      
      // 최대 로그 수 제한
      if (this.logs.length > 1000) {
        this.logs = this.logs.slice(0, 1000);
      }
      
      this.applyFilters();
      this.updateLogDisplay();
      
      // 자동 스크롤이 활성화된 경우 맨 위로 스크롤
      if (document.querySelector('.log-container')) {
        this.scrollToTop();
      }
    });
    
    // 주기적으로 MCP를 통한 로그 수집
    this.startMCPLogCollection();
  }

  private mcpCollectionInterval: NodeJS.Timeout | null = null;

  private startMCPLogCollection(): void {
    if (this.mcpCollectionInterval) {
      clearInterval(this.mcpCollectionInterval);
    }
    
    this.mcpCollectionInterval = setInterval(async () => {
      if (this.isStreaming) {
        await this.fetchMCPLogs();
      }
    }, 30000); // 30초마다
  }

  private scrollToTop(): void {
    const container = document.querySelector('.log-container');
    if (container) {
      container.scrollTop = 0;
    }
  }

  private applyFilters(): void {
    this.filteredLogs = this.logs.filter(log => {
      // 레벨 필터
      if (this.filters.level !== 'ALL' && log.level !== this.filters.level) {
        return false;
      }
      
      // 소스 필터
      if (this.filters.source !== 'ALL' && log.source !== this.filters.source) {
        return false;
      }
      
      // 검색 필터
      if (this.filters.search && !log.message.toLowerCase().includes(this.filters.search.toLowerCase())) {
        return false;
      }
      
      // 시간 필터
      const logTime = new Date(log.timestamp).getTime();
      const now = Date.now();
      const timeRange = this.getTimeRangeMs(this.filters.timeRange);
      
      if (now - logTime > timeRange) {
        return false;
      }
      
      return true;
    });
  }

  private updateLogDisplay(): void {
    const container = document.getElementById('logContainer');
    if (container) {
      container.innerHTML = this.renderLogs();
      
      // 자동 스크롤
      if (this.isStreaming) {
        container.scrollTop = container.scrollHeight;
      }
    }
    
    // 통계 업데이트
    this.updateStats();
  }

  private updateStats(): void {
    const stats = this.calculateStats();
    
    // 통계 카드 업데이트 (ComponentFactory 구조에 맞게 수정)
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 4) {
      const totalValueEl = statCards[0].querySelector('.stat-card__value') as HTMLElement;
      const errorValueEl = statCards[1].querySelector('.stat-card__value') as HTMLElement;
      const warnValueEl = statCards[2].querySelector('.stat-card__value') as HTMLElement;
      const infoValueEl = statCards[3].querySelector('.stat-card__value') as HTMLElement;
      
      if (totalValueEl) totalValueEl.textContent = stats.total.toString();
      if (errorValueEl) errorValueEl.textContent = (stats.byLevel.ERROR || 0).toString();
      if (warnValueEl) warnValueEl.textContent = (stats.byLevel.WARN || 0).toString();
      if (infoValueEl) infoValueEl.textContent = (stats.byLevel.INFO || 0).toString();
    }
    
    // 차트 업데이트
    this.updateCharts();
  }

  private calculateStats(): LogStats {
    const byLevel: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    
    this.filteredLogs.forEach(log => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      bySource[log.source] = (bySource[log.source] || 0) + 1;
    });
    
    const errorCount = (byLevel.ERROR || 0) + (byLevel.FATAL || 0);
    const errorRate = this.filteredLogs.length > 0 ? (errorCount / this.filteredLogs.length) * 100 : 0;
    
    return {
      total: this.filteredLogs.length,
      byLevel,
      bySource,
      errorRate
    };
  }

  private updateCharts(): void {
    // 간단한 차트 업데이트 (실제로는 Chart.js 등 사용)
    this.drawLevelChart();
    this.drawTimeChart();
  }

  private drawLevelChart(): void {
    const canvas = document.getElementById('levelChart') as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const stats = this.calculateStats();
    const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#6b7280'];
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 간단한 바 차트
    const maxValue = Math.max(...levels.map(level => stats.byLevel[level] || 0));
    
    levels.forEach((level, index) => {
      const value = stats.byLevel[level] || 0;
      const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
      const x = index * 45 + 10;
      const y = 120 - height;
      
      ctx.fillStyle = colors[index];
      ctx.fillRect(x, y, 35, height);
      
      // 레이블
      ctx.fillStyle = '#374151';
      ctx.font = '10px sans-serif';
      ctx.fillText(level, x, 140);
      ctx.fillText(value.toString(), x + 5, y - 5);
    });
  }

  private drawTimeChart(): void {
    const canvas = document.getElementById('timeChart') as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 시간별 로그 수 계산 (최근 24시간을 24개 구간으로)
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const buckets = new Array(24).fill(0);
    
    this.filteredLogs.forEach(log => {
      const logTime = new Date(log.timestamp).getTime();
      const hoursAgo = Math.floor((now - logTime) / hour);
      if (hoursAgo >= 0 && hoursAgo < 24) {
        buckets[23 - hoursAgo]++;
      }
    });
    
    const maxValue = Math.max(...buckets);
    
    // 선 그래프
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    buckets.forEach((value, index) => {
      const x = (index / 23) * 280 + 10;
      const y = maxValue > 0 ? 130 - (value / maxValue) * 100 : 130;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  }

  // 헤더 버튼 이벤트 바인딩
  private bindHeaderEvents(): void {
    if (!this.headerElement) return;
    const toggleBtn = this.headerElement.querySelector('.btn--success, .btn--warning');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleStream());
    }
    const clearBtn = this.headerElement.querySelector('.btn--secondary');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearLogs());
    }
    const exportBtn = this.headerElement.querySelector('.btn--primary');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportLogs());
    }
  }

  // toggleStream 등 상태 변화 시 헤더 갱신
  public toggleStream(): void {
    this.isStreaming = !this.isStreaming;
    
    if (this.isStreaming) {
      this.startLogStream();
    } else {
      this.logService.stopLogStream();
    }
    
    this.updateHeader();
  }

  public clearLogs(): void {
    this.logs = [];
    this.filteredLogs = [];
    this.updateLogDisplay();
    this.updateHeader();
  }

  public setFilter(type: string, value: string): void {
    (this.filters as any)[type] = value;
    this.applyFilters();
    this.updateLogDisplay();
  }

  public scrollToBottom(): void {
    const container = document.getElementById('logContainer');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  public setAutoScroll(enabled: boolean): void {
    this.isStreaming = enabled;
  }

  public async exportLogs(): Promise<void> {
    // 내보내기 로직 구현
    alert('로그 내보내기 기능은 아직 구현되지 않았습니다.');
  }

  private formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getTimeRangeMs(range: string): number {
    switch (range) {
      case '1h': return 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    eventManager.off('log:new', this.boundHandleNewLog);
    eventManager.off('log:clear', this.boundClearLogs);
    eventManager.off('log:filter', this.boundHandleFilter);
    
    // 스트리밍 중지
    if (this.isStreaming) {
      this.toggleStream();
    }
    
    // DOM 요소 정리
    if (this._element) {
      this._element.remove();
      this._element = null;
    }
    
    this.headerElement = null;
    this.statsSection = null;
    this.filtersSection = null;
    this.contentSection = null;
    
    this.initialized = false;
    this.logs = [];
    this.filteredLogs = [];
  }

  // 헤더만 다시 그리기
  private updateHeader(): void {
    if (!this._element) return;
    const oldHeader = this.headerElement;
    const newHeader = this.createHeader();
    this.headerElement = newHeader;
    if (oldHeader && oldHeader.parentNode) {
      oldHeader.parentNode.replaceChild(newHeader, oldHeader);
    }
    this.bindHeaderEvents();
  }
} 