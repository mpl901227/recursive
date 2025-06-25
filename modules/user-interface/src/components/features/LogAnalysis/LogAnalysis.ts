/**
 * @fileoverview LogAnalysis Component
 * @description 로그 분석 컴포넌트 - 패턴 분석, 성능 분석, 트렌드 분석 기능
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 3.1 구현
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import type { ComponentProps } from '../../../types/index.js';
import type { 
  LogAnalysisProps,
  LogAnalysisResult,
  AnomalyDetection,
  Recommendation,
  TimeRange
} from '../../../types/log-system.js';

// SCSS 스타일 import
import './LogAnalysis.scss';

/**
 * LogAnalysis DOM 요소들
 */
interface LogAnalysisElements {
  container: HTMLElement | null;
  header: HTMLElement | null;
  toolbar: HTMLElement | null;
  analysisGrid: HTMLElement | null;
  analysisTypeSelect: HTMLElement | null;
  timeRangeSelect: HTMLElement | null;
  refreshButton: HTMLElement | null;
  exportButton: HTMLElement | null;
  analysisCards: Map<string, HTMLElement>;
  chartContainers: Map<string, HTMLElement>;
}

/**
 * LogAnalysis 상태
 */
interface LogAnalysisState {
  analysisType: 'performance' | 'errors' | 'patterns' | 'trends';
  timeRange: TimeRange;
  refreshInterval: number;
  isAutoRefresh: boolean;
  currentAnalysis: LogAnalysisResult | null;
  isLoading: boolean;
  lastUpdated: number;
  refreshTimer: number | null;
  charts: Map<string, any>;
}

/**
 * LogAnalysis 컴포넌트
 * 
 * @example
 * ```typescript
 * const analysis = new LogAnalysis('#analysis', {
 *   analysisType: 'errors',
 *   timeRange: '24h',
 *   autoRefresh: true,
 *   refreshInterval: 60000
 * }, eventManager);
 * 
 * await analysis.initialize();
 * ```
 */
export class LogAnalysis extends BaseComponent<HTMLElement, ComponentProps> {
  private elements: LogAnalysisElements = {
    container: null,
    header: null,
    toolbar: null,
    analysisGrid: null,
    analysisTypeSelect: null,
    timeRangeSelect: null,
    refreshButton: null,
    exportButton: null,
    analysisCards: new Map(),
    chartContainers: new Map()
  };

  private analysisState: LogAnalysisState = {
    analysisType: 'errors',
    timeRange: '24h',
    refreshInterval: 60000,
    isAutoRefresh: true,
    currentAnalysis: null,
    isLoading: false,
    lastUpdated: 0,
    refreshTimer: null,
    charts: new Map()
  };

  // 타입 안전한 props 접근을 위한 getter
  private get analysisProps(): LogAnalysisProps {
    return this.props as LogAnalysisProps;
  }

  constructor(
    element: HTMLElement | string,
    props: LogAnalysisProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: LogAnalysisProps = {
      analysisType: 'errors',
      timeRange: '24h',
      autoRefresh: true,
      refreshInterval: 60000,
      chartType: 'line',
      alertSettings: {
        enabled: true,
        thresholds: {
          error_rate: 5.0,
          response_time: 1000,
          anomaly_score: 0.8
        }
      },
      ...props
    };

    // ComponentProps로 캐스팅하여 타입 호환성 문제 해결
    super(element, defaultProps as ComponentProps, eventManager);

    // 초기 상태 설정
    this.analysisState.analysisType = this.analysisProps.analysisType ?? 'errors';
    this.analysisState.timeRange = this.analysisProps.timeRange ?? '24h';
    this.analysisState.refreshInterval = this.analysisProps.refreshInterval ?? 60000;
    this.analysisState.isAutoRefresh = this.analysisProps.autoRefresh ?? true;
  }

  /**
   * 컴포넌트 초기화
   */
  async initialize(): Promise<void> {
    this.logger.info('LogAnalysis 초기화 시작');

    try {
      // 기본 렌더링
      this.render();

      // DOM 요소 찾기
      this.findDOMElements();

      // 이벤트 바인딩
      this.bindEvents();

      // 초기 분석 실행
      await this.runAnalysis();

      // 자동 새로고침 시작
      if (this.analysisState.isAutoRefresh) {
        this.startAutoRefresh();
      }

      this.logger.info('LogAnalysis 초기화 완료');
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
      <div class="log-analysis" data-component="LogAnalysis">
        ${this.renderHeader()}
        ${this.renderToolbar()}
        ${this.renderAnalysisGrid()}
      </div>
    `;

    // CSS 클래스 추가
    this.element.classList.add('recursive-log-analysis');
  }

  /**
   * 분석 헤더 렌더링
   */
  private renderHeader(): string {
    return `
      <div class="log-analysis__header">
        <div class="log-analysis__title">
          <h2>로그 분석</h2>
          <span class="log-analysis__subtitle">
            ${this.getAnalysisTypeText(this.analysisState.analysisType)} 분석
          </span>
        </div>
        <div class="log-analysis__status">
          <span class="log-analysis__last-updated">
            마지막 업데이트: ${this.formatLastUpdated()}
          </span>
          ${this.renderAnalysisStatus()}
        </div>
      </div>
    `;
  }

  /**
   * 툴바 렌더링
   */
  private renderToolbar(): string {
    return `
      <div class="log-analysis__toolbar">
        <div class="log-analysis__controls">
          <div class="log-analysis__control-group">
            <label for="analysis-type-select">분석 타입:</label>
            <select id="analysis-type-select" class="log-analysis__select">
              <option value="errors" ${this.analysisState.analysisType === 'errors' ? 'selected' : ''}>에러 분석</option>
              <option value="performance" ${this.analysisState.analysisType === 'performance' ? 'selected' : ''}>성능 분석</option>
              <option value="patterns" ${this.analysisState.analysisType === 'patterns' ? 'selected' : ''}>패턴 분석</option>
              <option value="trends" ${this.analysisState.analysisType === 'trends' ? 'selected' : ''}>트렌드 분석</option>
            </select>
          </div>
          
          <div class="log-analysis__control-group">
            <label for="time-range-select">시간 범위:</label>
            <select id="time-range-select" class="log-analysis__select">
              <option value="1h" ${this.analysisState.timeRange === '1h' ? 'selected' : ''}>1시간</option>
              <option value="6h" ${this.analysisState.timeRange === '6h' ? 'selected' : ''}>6시간</option>
              <option value="24h" ${this.analysisState.timeRange === '24h' ? 'selected' : ''}>24시간</option>
              <option value="7d" ${this.analysisState.timeRange === '7d' ? 'selected' : ''}>7일</option>
              <option value="30d" ${this.analysisState.timeRange === '30d' ? 'selected' : ''}>30일</option>
            </select>
          </div>
        </div>
        
        <div class="log-analysis__actions">
          <button id="refresh-analysis" class="log-analysis__button log-analysis__button--primary">
            <i class="icon-refresh"></i>
            분석 실행
          </button>
          <button id="export-analysis" class="log-analysis__button log-analysis__button--secondary">
            <i class="icon-download"></i>
            내보내기
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 분석 그리드 렌더링
   */
  private renderAnalysisGrid(): string {
    if (this.analysisState.isLoading) {
      return this.renderLoadingState();
    }

    if (!this.analysisState.currentAnalysis) {
      return this.renderEmptyState();
    }

    return `
      <div class="log-analysis__grid">
        ${this.renderAnalysisCards()}
      </div>
    `;
  }

  /**
   * 분석 카드들 렌더링
   */
  private renderAnalysisCards(): string {
    const analysis = this.analysisState.currentAnalysis;
    if (!analysis) return '';

    let cards = '';

    switch (this.analysisState.analysisType) {
      case 'errors':
        cards = this.renderErrorAnalysisCards(analysis);
        break;
      case 'performance':
        cards = this.renderPerformanceAnalysisCards(analysis);
        break;
      case 'patterns':
        cards = this.renderPatternAnalysisCards();
        break;
      case 'trends':
        cards = this.renderTrendAnalysisCards(analysis);
        break;
    }

    return cards;
  }

  /**
   * 에러 분석 카드들 렌더링
   */
  private renderErrorAnalysisCards(analysis: LogAnalysisResult): string {
    const errorPatterns = analysis.error_patterns;
    if (!errorPatterns) return this.renderNoDataCard();

    return `
      <div class="analysis-card" data-card="error-frequency">
        <div class="analysis-card__header">
          <h3>시간대별 에러 빈도</h3>
          <div class="analysis-card__actions">
            <button class="card-action" data-action="expand">
              <i class="icon-expand"></i>
            </button>
          </div>
        </div>
        <div class="analysis-card__content">
          <div class="chart-container" id="error-frequency-chart">
            ${this.renderErrorFrequencyChart(errorPatterns.hourly_frequency)}
          </div>
        </div>
      </div>

      <div class="analysis-card" data-card="message-clusters">
        <div class="analysis-card__header">
          <h3>에러 메시지 클러스터</h3>
          <span class="analysis-card__badge">${errorPatterns.message_clusters.length}개</span>
        </div>
        <div class="analysis-card__content">
          ${this.renderMessageClusters(errorPatterns.message_clusters)}
        </div>
      </div>

      <div class="analysis-card" data-card="recurring-patterns">
        <div class="analysis-card__header">
          <h3>반복 패턴</h3>
          <span class="analysis-card__badge">${errorPatterns.recurring_patterns.length}개</span>
        </div>
        <div class="analysis-card__content">
          ${this.renderRecurringPatterns(errorPatterns.recurring_patterns)}
        </div>
      </div>

      ${analysis.anomaly_detection ? this.renderAnomalyDetectionCard(analysis.anomaly_detection) : ''}
      ${analysis.recommendations ? this.renderRecommendationsCard(analysis.recommendations) : ''}
    `;
  }

  /**
   * 성능 분석 카드들 렌더링
   */
  private renderPerformanceAnalysisCards(analysis: LogAnalysisResult): string {
    const perfAnalysis = analysis.performance_analysis;
    if (!perfAnalysis) return this.renderNoDataCard();

    return `
      <div class="analysis-card analysis-card--large" data-card="http-performance">
        <div class="analysis-card__header">
          <h3>HTTP 성능 분석</h3>
          <div class="analysis-card__stats">
            <span class="stat">
              <span class="stat__label">총 요청:</span>
              <span class="stat__value">${this.formatNumber(perfAnalysis.http_performance.total_requests)}</span>
            </span>
            <span class="stat">
              <span class="stat__label">느린 요청:</span>
              <span class="stat__value stat__value--warning">${perfAnalysis.http_performance.slow_percentage}</span>
            </span>
          </div>
        </div>
        <div class="analysis-card__content">
          ${this.renderHttpPerformanceChart(perfAnalysis.http_performance)}
          ${this.renderSlowestRequests(perfAnalysis.http_performance.slowest_requests)}
        </div>
      </div>

      <div class="analysis-card" data-card="db-performance">
        <div class="analysis-card__header">
          <h3>데이터베이스 성능</h3>
          <span class="analysis-card__badge analysis-card__badge--${this.getPerformanceBadgeType(perfAnalysis.db_performance.slow_percentage)}">
            ${perfAnalysis.db_performance.slow_percentage} 느림
          </span>
        </div>
        <div class="analysis-card__content">
          ${this.renderDbPerformance(perfAnalysis.db_performance)}
        </div>
      </div>

      <div class="analysis-card" data-card="mcp-performance">
        <div class="analysis-card__header">
          <h3>MCP 성능</h3>
          <span class="analysis-card__badge analysis-card__badge--${this.getPerformanceBadgeType(perfAnalysis.mcp_performance.slow_percentage)}">
            ${perfAnalysis.mcp_performance.slow_percentage} 느림
          </span>
        </div>
        <div class="analysis-card__content">
          ${this.renderMcpPerformance(perfAnalysis.mcp_performance)}
        </div>
      </div>
    `;
  }

  /**
   * DOM 요소 찾기
   */
  private findDOMElements(): void {
    this.elements.container = this.element.querySelector('.log-analysis');
    this.elements.header = this.element.querySelector('.log-analysis__header');
    this.elements.toolbar = this.element.querySelector('.log-analysis__toolbar');
    this.elements.analysisGrid = this.element.querySelector('.log-analysis__grid');
    this.elements.analysisTypeSelect = this.element.querySelector('#analysis-type-select');
    this.elements.timeRangeSelect = this.element.querySelector('#time-range-select');
    this.elements.refreshButton = this.element.querySelector('#refresh-analysis');
    this.elements.exportButton = this.element.querySelector('#export-analysis');

    // 분석 카드들 찾기
    this.elements.analysisCards.clear();
    this.element.querySelectorAll('.analysis-card').forEach((card, index) => {
      const cardId = card.getAttribute('data-card') || `card-${index}`;
      this.elements.analysisCards.set(cardId, card as HTMLElement);
    });

    // 차트 컨테이너들 찾기
    this.elements.chartContainers.clear();
    this.element.querySelectorAll('.chart-container').forEach((container, index) => {
      const containerId = container.id || `chart-${index}`;
      this.elements.chartContainers.set(containerId, container as HTMLElement);
    });
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents(): void {
    // 분석 타입 변경
    this.elements.analysisTypeSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.analysisState.analysisType = target.value as any;
      this.runAnalysis();
    });

    // 시간 범위 변경
    this.elements.timeRangeSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.analysisState.timeRange = target.value as TimeRange;
      this.runAnalysis();
    });

    // 새로고침 버튼
    this.elements.refreshButton?.addEventListener('click', () => {
      this.runAnalysis();
    });

    // 내보내기 버튼
    this.elements.exportButton?.addEventListener('click', () => {
      this.exportAnalysis();
    });

    // 카드 액션 이벤트
    this.bindCardEvents();
  }

  /**
   * 카드 이벤트 바인딩
   */
  private bindCardEvents(): void {
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      const card = target.closest('.analysis-card') as HTMLElement;

      if (!action || !card) return;

      switch (action) {
        case 'expand':
          this.toggleCardExpansion(card);
          break;
        case 'export-card':
          this.exportCard(card);
          break;
      }
    });
  }

  /**
   * 분석 실행
   */
  private async runAnalysis(): Promise<void> {
    this.logger.info('분석 실행 시작');
    
    try {
      this.analysisState.isLoading = true;
      this.updateLoadingState();

      // 분석 데이터 로드
      const analysisResult = await this.loadAnalysisData();
      this.analysisState.currentAnalysis = analysisResult;
      this.analysisState.lastUpdated = Date.now();

      // 분석 결과 렌더링
      this.renderAnalysisCards();

      this.logger.info('분석 실행 완료');
    } catch (error) {
      this.handleError(error as Error, 'runAnalysis');
    } finally {
      this.analysisState.isLoading = false;
      this.updateLoadingState();
    }
  }

  /**
   * 분석 데이터 로드
   */
  private async loadAnalysisData(): Promise<LogAnalysisResult> {
    const analysisType = this.analysisState.analysisType;
    const timeRange = typeof this.analysisState.timeRange === 'string' 
      ? this.analysisState.timeRange 
      : '24h';

    try {
      // LogSystemService를 통해 실제 분석 실행 시도
      const logSystemService = this.getLogSystemService();
      
      if (logSystemService) {
        this.logger.info(`실제 ${analysisType} 분석 실행 시도`, { timeRange });
        
        // 분석 타입에 따라 적절한 메서드 호출
        let analysisData;
        switch (analysisType) {
          case 'errors':
            this.logger.info('getErrorPatterns 호출 중...');
            analysisData = await logSystemService.getErrorPatterns(timeRange);
            this.logger.info('getErrorPatterns 응답:', analysisData);
            break;
          case 'performance':
            this.logger.info('getPerformanceAnalysis 호출 중...');
            analysisData = await logSystemService.getPerformanceAnalysis(timeRange, 1000);
            this.logger.info('getPerformanceAnalysis 응답:', analysisData);
            break;
          case 'trends':
            this.logger.info('getTrendAnalysis 호출 중...');
            analysisData = await logSystemService.getTrendAnalysis(timeRange);
            this.logger.info('getTrendAnalysis 응답:', analysisData);
            break;
          case 'patterns':
            // 패턴 분석은 에러 패턴과 유사하게 처리
            this.logger.info('getErrorPatterns (패턴) 호출 중...');
            analysisData = await logSystemService.getErrorPatterns(timeRange);
            this.logger.info('getErrorPatterns (패턴) 응답:', analysisData);
            break;
          default:
            this.logger.info('runAnalysis 호출 중...');
            analysisData = await logSystemService.runAnalysis(analysisType, timeRange);
            this.logger.info('runAnalysis 응답:', analysisData);
        }

        // 실제 데이터를 LogAnalysisResult 형식으로 변환
        const result: LogAnalysisResult = {
          id: `analysis_${Date.now()}`,
          type: analysisType,
          timerange: timeRange,
          completed_at: new Date().toISOString(),
          execution_time: 500, // 실제 실행 시간은 서버에서 제공되어야 함
          recommendations: this.generateMockRecommendations() // 추천사항은 아직 목업 사용
        };

        // 분석 타입에 따라 실제 데이터 할당
        if (analysisType === 'errors' && analysisData) {
          result.error_patterns = analysisData;
        } else if (analysisType === 'performance' && analysisData) {
          result.performance_analysis = analysisData;
        } else if (analysisType === 'trends' && analysisData) {
          result.trend_analysis = analysisData;
        }

        this.logger.info(`실제 ${analysisType} 분석 완료`, { result });
        return result;
      } else {
        this.logger.warn('LogSystemService를 찾을 수 없음');
      }
    } catch (error) {
      this.logger.error(`실제 분석 실행 실패, 목업 데이터 사용:`, error);
    }

    // 실패 시 목업 데이터 생성
    this.logger.info(`목업 ${analysisType} 분석 데이터 생성`);
    const mockResult: LogAnalysisResult = {
      id: `analysis_${Date.now()}`,
      type: analysisType,
      timerange: timeRange,
      completed_at: new Date().toISOString(),
      execution_time: Math.floor(Math.random() * 1000) + 500,
      recommendations: this.generateMockRecommendations()
    };

    // 분석 타입에 따라 해당 분석 결과만 추가
    if (analysisType === 'errors') {
      mockResult.error_patterns = {
        hourly_frequency: this.generateMockHourlyFrequency(),
        message_clusters: this.generateMockMessageClusters(),
        recurring_patterns: this.generateMockRecurringPatterns(),
        error_propagation: []
      };
    } else if (analysisType === 'performance') {
      mockResult.performance_analysis = {
        timerange: timeRange,
        threshold_ms: 1000,
        http_performance: this.generateMockHttpPerformance(),
        db_performance: this.generateMockDbPerformance(),
        mcp_performance: this.generateMockMcpPerformance()
      };
    }

    return mockResult;
  }

  /**
   * LogSystemService 가져오기
   */
  private getLogSystemService(): any {
    try {
      // ServiceRegistry를 통해 LogSystemService 가져오기
      const app = (window as any).RecursiveApp;
      if (app && app.serviceRegistry) {
        const logSystemService = app.serviceRegistry.get('log-system');
        this.logger.info('LogSystemService 상태:', {
          service: !!logSystemService,
          isInitialized: logSystemService?.isInitialized,
          methods: logSystemService ? Object.getOwnPropertyNames(Object.getPrototypeOf(logSystemService)) : []
        });
        
        if (logSystemService) {
          // 초기화 상태와 관계없이 서비스가 있으면 반환
          return logSystemService;
        }
      }
    } catch (error) {
      this.logger.warn('LogSystemService 가져오기 실패:', error);
    }
    return null;
  }

  // 헬퍼 메서드들...
  private generateMockHourlyFrequency() {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      error_count: Math.floor(Math.random() * 50) + 5,
      error_rate: Math.random() * 10 + 1
    }));
  }

  private generateMockMessageClusters() {
    return [
      {
        cluster_id: 'cluster-1',
        pattern: 'Database connection timeout',
        count: 45,
        examples: ['Connection timeout to database', 'DB connection failed'],
        severity: 'high' as const
      },
      {
        cluster_id: 'cluster-2', 
        pattern: 'API rate limit exceeded',
        count: 23,
        examples: ['Rate limit exceeded for API', 'Too many requests'],
        severity: 'medium' as const
      }
    ];
  }

  private generateMockRecurringPatterns() {
    return [
      {
        pattern: 'Memory usage spike every 30 minutes',
        frequency: 48,
        interval_minutes: 30,
        confidence: 0.92
      }
    ];
  }

  private generateMockHttpPerformance() {
    return {
      total_requests: 15420,
      slow_requests: 234,
      slow_percentage: '1.5%',
      slowest_requests: [
        {
          timestamp: '2024-01-15T10:30:00Z',
          method: 'POST',
          path: '/api/data/process',
          duration_ms: 3500,
          status: 200,
          trace_id: 'trace-123'
        }
      ],
      percentiles: {
        p50: 120,
        p90: 450,
        p95: 800,
        p99: 2100,
        min: 15,
        max: 3500,
        avg: 185
      }
    };
  }

  private generateMockDbPerformance() {
    return {
      total_queries: 8934,
      slow_queries: 67,
      slow_percentage: '0.7%',
      slowest_queries: [
        {
          timestamp: '2024-01-15T11:15:00Z',
          query: 'SELECT * FROM logs WHERE timestamp > ?',
          duration_ms: 2300,
          trace_id: 'trace-456'
        }
      ]
    };
  }

  private generateMockMcpPerformance() {
    return {
      total_calls: 1234,
      slow_calls: 23,
      slow_percentage: '1.9%',
      slowest_calls: [
        {
          timestamp: '2024-01-15T12:00:00Z',
          tool_name: 'ai-understanding-analyzer',
          duration_ms: 4500,
          trace_id: 'trace-789'
        }
      ]
    };
  }

  private generateMockRecommendations(): Recommendation[] {
    return [
      {
        id: 'rec-1',
        type: 'optimization',
        priority: 'high',
        title: '데이터베이스 연결 풀 최적화',
        description: '데이터베이스 연결 타임아웃이 자주 발생하고 있습니다. 연결 풀 크기를 늘리는 것을 권장합니다.',
        expected_impact: '에러율 30% 감소 예상',
        implementation_effort: 'low',
        related_metrics: ['db_connection_errors', 'response_time']
      }
    ];
  }

  // 렌더링 헬퍼 메서드들...
  private renderLoadingState(): string {
    return `
      <div class="log-analysis__loading">
        <div class="loading-spinner"></div>
        <p>분석 실행 중...</p>
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="log-analysis__empty">
        <p>분석을 실행하려면 '분석 실행' 버튼을 클릭하세요.</p>
      </div>
    `;
  }

  private renderNoDataCard(): string {
    return `
      <div class="analysis-card analysis-card--empty">
        <p>분석할 데이터가 없습니다.</p>
      </div>
    `;
  }

  private renderAnalysisStatus(): string {
    if (this.analysisState.isLoading) {
      return '<span class="status status--loading">분석 중</span>';
    }
    if (this.analysisState.currentAnalysis) {
      return '<span class="status status--success">완료</span>';
    }
    return '<span class="status status--idle">대기</span>';
  }

  private getAnalysisTypeText(type: string): string {
    const typeMap = {
      'errors': '에러',
      'performance': '성능',
      'patterns': '패턴',
      'trends': '트렌드'
    };
    return typeMap[type as keyof typeof typeMap] || type;
  }

  private formatLastUpdated(): string {
    if (!this.analysisState.lastUpdated) return '없음';
    return new Date(this.analysisState.lastUpdated).toLocaleString('ko-KR');
  }

  private formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('ko-KR');
  }

  private updateLoadingState(): void {
    if (this.elements.analysisGrid) {
      this.elements.analysisGrid.innerHTML = this.renderLoadingState();
    }
  }

  private startAutoRefresh(): void {
    if (this.analysisState.refreshTimer) {
      clearInterval(this.analysisState.refreshTimer);
    }

    this.analysisState.refreshTimer = window.setInterval(() => {
      this.runAnalysis();
    }, this.analysisState.refreshInterval);
  }

  private stopAutoRefresh(): void {
    if (this.analysisState.refreshTimer) {
      clearInterval(this.analysisState.refreshTimer);
      this.analysisState.refreshTimer = null;
    }
  }

  private toggleCardExpansion(card: HTMLElement): void {
    card.classList.toggle('analysis-card--expanded');
  }

  private exportCard(card: HTMLElement): void {
    // 카드 내용 내보내기 구현
    this.logger.info('카드 내보내기:', card.getAttribute('data-card'));
  }

  private exportAnalysis(): void {
    if (!this.analysisState.currentAnalysis) return;

    const data = JSON.stringify(this.analysisState.currentAnalysis, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `log-analysis-${this.analysisState.analysisType}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 차트 렌더링 메서드들 (간단한 구현)
  private renderErrorFrequencyChart(data: any[]): string {
    const maxCount = Math.max(...data.map(d => d.error_count));
    const bars = data.map((d, index) => {
      const height = (d.error_count / maxCount) * 100;
      return `
        <div class="bar-container">
          <div class="bar" style="height: ${height}%" title="${d.hour}시: ${d.error_count}개"></div>
          <div class="bar-label">${d.hour}시</div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="chart-with-axes">
        <div class="y-axis">
          <div class="y-axis-label">에러 수</div>
          <div class="y-axis-ticks">
            <span class="tick">0</span>
            <span class="tick">${Math.round(maxCount * 0.25)}</span>
            <span class="tick">${Math.round(maxCount * 0.5)}</span>
            <span class="tick">${Math.round(maxCount * 0.75)}</span>
            <span class="tick">${maxCount}</span>
          </div>
        </div>
        <div class="chart-area">
          <div class="simple-bar-chart">${bars}</div>
          <div class="x-axis">
            <div class="x-axis-label">시간 (24시간)</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderMessageClusters(clusters: any[]): string {
    return clusters.map(cluster => `
      <div class="cluster-item cluster-item--${cluster.severity}">
        <div class="cluster-header">
          <span class="cluster-pattern">${cluster.pattern}</span>
          <span class="cluster-count">${cluster.count}회</span>
        </div>
        <div class="cluster-examples">
          ${cluster.examples.slice(0, 2).map((ex: string) => `<span class="example">${ex}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  private renderRecurringPatterns(patterns: any[]): string {
    return patterns.map(pattern => `
      <div class="pattern-item">
        <div class="pattern-description">${pattern.pattern}</div>
        <div class="pattern-stats">
          <span>빈도: ${pattern.frequency}회</span>
          <span>간격: ${pattern.interval_minutes}분</span>
          <span>신뢰도: ${Math.round(pattern.confidence * 100)}%</span>
        </div>
      </div>
    `).join('');
  }

  private renderAnomalyDetectionCard(anomaly: AnomalyDetection): string {
    return `
      <div class="analysis-card" data-card="anomaly-detection">
        <div class="analysis-card__header">
          <h3>이상 탐지</h3>
          <div class="health-score health-score--${this.getHealthScoreClass(anomaly.health_score)}">
            건강도: ${Math.round(anomaly.health_score * 100)}%
          </div>
        </div>
        <div class="analysis-card__content">
          <div class="anomaly-summary">
            <p>이상 점수: ${anomaly.overall_anomaly_score.toFixed(2)}</p>
            <p>감지된 이상: ${anomaly.anomalies.length}개</p>
          </div>
        </div>
      </div>
    `;
  }

  private renderRecommendationsCard(recommendations: Recommendation[]): string {
    return `
      <div class="analysis-card" data-card="recommendations">
        <div class="analysis-card__header">
          <h3>추천 사항</h3>
          <span class="analysis-card__badge">${recommendations.length}개</span>
        </div>
        <div class="analysis-card__content">
          ${recommendations.map(rec => `
            <div class="recommendation-item recommendation-item--${rec.priority}">
              <div class="recommendation-header">
                <h4>${rec.title}</h4>
                <span class="priority-badge priority-badge--${rec.priority}">${rec.priority}</span>
              </div>
              <p class="recommendation-description">${rec.description}</p>
              <div class="recommendation-impact">${rec.expected_impact}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderHttpPerformanceChart(httpPerf: any): string {
    if (!httpPerf.percentiles) return '<p>성능 데이터 없음</p>';
    
    const percentiles = httpPerf.percentiles;
    return `
      <div class="performance-chart">
        <div class="percentile-bars">
          <div class="percentile-bar">
            <label>P50</label>
            <div class="bar" style="width: ${(percentiles.p50 / percentiles.max) * 100}%"></div>
            <span>${percentiles.p50}ms</span>
          </div>
          <div class="percentile-bar">
            <label>P90</label>
            <div class="bar" style="width: ${(percentiles.p90 / percentiles.max) * 100}%"></div>
            <span>${percentiles.p90}ms</span>
          </div>
          <div class="percentile-bar">
            <label>P95</label>
            <div class="bar" style="width: ${(percentiles.p95 / percentiles.max) * 100}%"></div>
            <span>${percentiles.p95}ms</span>
          </div>
          <div class="percentile-bar">
            <label>P99</label>
            <div class="bar" style="width: ${(percentiles.p99 / percentiles.max) * 100}%"></div>
            <span>${percentiles.p99}ms</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderSlowestRequests(requests: any[]): string {
    return `
      <div class="slowest-requests">
        <h4>가장 느린 요청들</h4>
        ${requests.slice(0, 5).map(req => `
          <div class="slow-request-item">
            <div class="request-info">
              <span class="method">${req.method}</span>
              <span class="path">${req.path}</span>
            </div>
            <div class="request-duration">${req.duration_ms}ms</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderDbPerformance(dbPerf: any): string {
    return `
      <div class="db-performance">
        <div class="performance-stats">
          <div class="stat">
            <label>총 쿼리:</label>
            <span>${this.formatNumber(dbPerf.total_queries)}</span>
          </div>
          <div class="stat">
            <label>느린 쿼리:</label>
            <span>${this.formatNumber(dbPerf.slow_queries)}</span>
          </div>
        </div>
        ${dbPerf.slowest_queries.length > 0 ? `
          <div class="slowest-queries">
            <h4>가장 느린 쿼리들</h4>
            ${dbPerf.slowest_queries.slice(0, 3).map((query: any) => `
              <div class="slow-query-item">
                <div class="query-text">${this.truncateText(query.query || 'Unknown query', 50)}</div>
                <div class="query-duration">${query.duration_ms}ms</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderMcpPerformance(mcpPerf: any): string {
    return `
      <div class="mcp-performance">
        <div class="performance-stats">
          <div class="stat">
            <label>총 호출:</label>
            <span>${this.formatNumber(mcpPerf.total_calls)}</span>
          </div>
          <div class="stat">
            <label>느린 호출:</label>
            <span>${this.formatNumber(mcpPerf.slow_calls)}</span>
          </div>
        </div>
        ${mcpPerf.slowest_calls.length > 0 ? `
          <div class="slowest-calls">
            <h4>가장 느린 호출들</h4>
            ${mcpPerf.slowest_calls.slice(0, 3).map((call: any) => `
              <div class="slow-call-item">
                <div class="tool-name">${call.tool_name}</div>
                <div class="call-duration">${call.duration_ms}ms</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 패턴 분석 카드 렌더링
   */
  private renderPatternAnalysisCards(): string {
    return `
      <div class="analysis-card" data-card="patterns">
        <div class="analysis-card__header">
          <h3>패턴 분석</h3>
          <span class="analysis-card__status">완료</span>
        </div>
        <div class="analysis-card__content">
          <p>패턴 분석 기능은 개발 중입니다.</p>
        </div>
      </div>
    `;
  }

  private renderTrendAnalysisCards(analysis: LogAnalysisResult): string {
    const trends = analysis.trend_analysis;
    if (!trends) return this.renderNoDataCard();

    return `
      <div class="analysis-card" data-card="volume-trend">
        <div class="analysis-card__header">
          <h3>로그 볼륨 트렌드</h3>
          <span class="trend-indicator trend-indicator--${trends.volume_trend.direction}">
            ${this.getTrendText(trends.volume_trend.direction)} ${Math.abs(trends.volume_trend.change_percentage)}%
          </span>
        </div>
        <div class="analysis-card__content">
          <div class="trend-details">
            <p>신뢰도: ${Math.round(trends.volume_trend.confidence * 100)}%</p>
          </div>
        </div>
      </div>

      <div class="analysis-card" data-card="error-rate-trend">
        <div class="analysis-card__header">
          <h3>에러율 트렌드</h3>
          <span class="trend-indicator trend-indicator--${trends.error_rate_trend.direction}">
            ${this.getTrendText(trends.error_rate_trend.direction)} ${Math.abs(trends.error_rate_trend.change_percentage)}%
          </span>
        </div>
        <div class="analysis-card__content">
          <div class="trend-details">
            <p>신뢰도: ${Math.round(trends.error_rate_trend.confidence * 100)}%</p>
          </div>
        </div>
      </div>

      <div class="analysis-card" data-card="performance-trend">
        <div class="analysis-card__header">
          <h3>성능 트렌드</h3>
        </div>
        <div class="analysis-card__content">
          <div class="performance-trends">
            <div class="trend-item">
              <label>응답 시간:</label>
              <span class="trend-value trend-value--${trends.performance_trend.response_time_trend}">
                ${this.getPerformanceTrendText(trends.performance_trend.response_time_trend)}
              </span>
            </div>
            <div class="trend-item">
              <label>처리량:</label>
              <span class="trend-value trend-value--${trends.performance_trend.throughput_trend}">
                ${this.getTrendText(trends.performance_trend.throughput_trend)}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 유틸리티 메서드들
  private getPerformanceBadgeType(percentage: string): string {
    const num = parseFloat(percentage);
    if (num > 5) return 'danger';
    if (num > 2) return 'warning';
    return 'success';
  }

  private getHealthScoreClass(score: number): string {
    if (score > 0.8) return 'good';
    if (score > 0.6) return 'warning';
    return 'danger';
  }

  private getTrendText(direction: string): string {
    const trendMap = {
      'increasing': '증가',
      'decreasing': '감소',
      'stable': '안정',
      'volatile': '불안정'
    };
    return trendMap[direction as keyof typeof trendMap] || direction;
  }

  private getPerformanceTrendText(trend: string): string {
    const trendMap = {
      'improving': '개선',
      'degrading': '악화',
      'stable': '안정'
    };
    return trendMap[trend as keyof typeof trendMap] || trend;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 컴포넌트 정리
   */
  async destroy(): Promise<void> {
    this.stopAutoRefresh();
    
    // 차트 정리
    this.analysisState.charts.forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.analysisState.charts.clear();

    await super.destroy();
  }
}

/**
 * LogAnalysis 컴포넌트 팩토리 함수
 */
export function createLogAnalysisComponent(
  element: HTMLElement | string,
  props: LogAnalysisProps = {},
  eventManager: EventManager
): LogAnalysis {
  return new LogAnalysis(element, props, eventManager);
} 