// =============================================================================
// 🎯 Recursive UI Module - Log System Type Definitions
// =============================================================================
// LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 1.1 구현
// 기존 log-system 백엔드와 user-interface의 TypeScript 시스템을 통합

import type { ComponentProps } from './index.js';

// -----------------------------------------------------------------------------
// 🏷️ Core Log Types
// -----------------------------------------------------------------------------

/**
 * 로그 레벨 타입 (Python 서버와 동일)
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * 로그 레벨 우선순위 매핑
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * 표준 로그 엔트리 인터페이스 (Python LogEntry와 호환)
 */
export interface LogEntry {
  /** 로그 고유 ID */
  id: string;
  /** 로그 발생 시간 (ISO 8601 형식) */
  timestamp: string;
  /** 로그 레벨 */
  level: LogLevel;
  /** 로그 소스 (예: 'mcp_calls', 'http_traffic', 'database') */
  source: string;
  /** 로그 메시지 */
  message: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
  /** 로그 태그 */
  tags?: string[];
  /** 분산 추적 ID */
  trace_id?: string;
  /** 실제 생성 시간 (타임스탬프) */
  created_at?: number;
  /** 로그 엔트리 크기 (바이트) */
  size_bytes?: number;
}

/**
 * 시간 범위 타입
 */
export type TimeRange = {
  /** 시작 시간 (ISO 8601 또는 상대 시간) */
  since?: string;
  /** 종료 시간 (ISO 8601) */
  until?: string;
} | string; // '1h', '30m', '24h' 등

// -----------------------------------------------------------------------------
// 🔍 Query & Search Types
// -----------------------------------------------------------------------------

/**
 * 로그 쿼리 매개변수
 */
export interface LogQueryParams {
  /** 필터링할 소스 목록 */
  sources?: string[];
  /** 필터링할 로그 레벨 */
  levels?: LogLevel[];
  /** 시작 시간 (ISO 8601 또는 상대 시간) */
  since?: string;
  /** 종료 시간 (ISO 8601) */
  until?: string;
  /** 결과 제한 수 */
  limit?: number;
  /** 오프셋 (페이지네이션용) */
  offset?: number;
  /** 전문 검색 쿼리 */
  search?: string | undefined;
  /** 특정 trace_id로 필터링 */
  trace_id?: string;
  /** 아카이브된 로그 포함 여부 */
  include_archived?: boolean;
}

/**
 * 로그 쿼리 결과
 */
export interface LogQueryResult {
  /** 로그 엔트리 목록 */
  logs: LogEntry[];
  /** 총 개수 */
  count: number;
  /** 쿼리 실행 시간 (ms) */
  query_time?: number;
  /** 다음 페이지 오프셋 */
  next_offset?: number;
  /** 더 많은 결과 존재 여부 */
  has_more?: boolean;
}

/**
 * 검색 옵션
 */
export interface SearchOptions {
  /** 검색할 시간 범위 */
  timerange?: TimeRange;
  /** 검색 컨텍스트 (전후 로그 포함) */
  context?: number;
  /** 하이라이트 활성화 */
  highlight?: boolean;
  /** 최대 결과 수 */
  max_results?: number;
  /** 검색 대상 필드 */
  fields?: ('message' | 'metadata')[];
}

/**
 * 검색 결과
 */
export interface SearchResult {
  /** 검색된 로그 엔트리 */
  logs: LogEntry[];
  /** 총 매치 수 */
  total_matches: number;
  /** 검색 쿼리 */
  query: string;
  /** 검색 옵션 */
  options: SearchOptions;
  /** 검색 실행 시간 (ms) */
  search_time: number;
  /** 하이라이트된 결과 */
  highlights?: Array<{
    log_id: string;
    field: string;
    highlighted_text: string;
  }>;
}

// -----------------------------------------------------------------------------
// 📊 Statistics & Analytics Types
// -----------------------------------------------------------------------------

/**
 * 로그 통계
 */
export interface LogStatistics {
  /** 통계 시간 범위 */
  timerange: string;
  /** 총 로그 수 */
  total_logs: number;
  /** 소스별 통계 */
  by_source: Record<string, number>;
  /** 레벨별 통계 */
  by_level: Record<LogLevel, number>;
  /** 시간별 분포 */
  time_distribution: Array<{
    timestamp: string;
    count: number;
    levels: Record<LogLevel, number>;
  }>;
  /** 에러율 */
  error_rate: number;
  /** 최근 에러 수 */
  recent_errors: number;
  /** 통계 생성 시간 */
  generated_at: string;
}

/**
 * 성능 분석 결과
 */
export interface PerformanceAnalysis {
  /** 분석 시간 범위 */
  timerange: string;
  /** 느린 요청 임계값 (ms) */
  threshold_ms: number;
  /** HTTP 성능 분석 */
  http_performance: {
    total_requests: number;
    slow_requests: number;
    slow_percentage: string;
    slowest_requests: Array<{
      timestamp: string;
      method?: string;
      path?: string;
      duration_ms: number;
      status?: number;
      trace_id?: string;
    }>;
    percentiles?: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      avg: number;
    };
  };
  /** 데이터베이스 성능 분석 */
  db_performance: {
    total_queries: number;
    slow_queries: number;
    slow_percentage: string;
    slowest_queries: Array<{
      timestamp: string;
      query?: string;
      duration_ms: number;
      trace_id?: string;
    }>;
  };
  /** MCP 성능 분석 */
  mcp_performance: {
    total_calls: number;
    slow_calls: number;
    slow_percentage: string;
    slowest_calls: Array<{
      timestamp: string;
      tool_name?: string;
      duration_ms: number;
      trace_id?: string;
    }>;
  };
}

// -----------------------------------------------------------------------------
// 🔄 Streaming & Real-time Types
// -----------------------------------------------------------------------------

/**
 * 로그 콜백 함수 타입
 */
export type LogCallback = (entry: LogEntry) => void | Promise<void>;

/**
 * 로그 스트림 인터페이스
 */
export interface LogStream {
  /** 스트림 ID */
  id: string;
  /** 스트림 상태 */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** 필터 조건 */
  filters: LogFilter;
  /** 스트림 시작 시간 */
  started_at: string;
  /** 받은 로그 수 */
  received_count: number;
  /** 스트림 중지 */
  stop(): Promise<void>;
  /** 필터 업데이트 */
  updateFilters(filters: LogFilter): Promise<void>;
}

/**
 * 로그 필터 인터페이스
 */
export interface LogFilter {
  /** 필터 이름 */
  name?: string;
  /** 필터 패턴 (문자열 또는 정규식) */
  pattern?: string | RegExp;
  /** 제외 여부 */
  exclude?: boolean;
  /** 소스 필터 */
  sources?: string[];
  /** 레벨 필터 */
  levels?: LogLevel[];
  /** 최소 레벨 */
  min_level?: LogLevel;
  /** 태그 필터 */
  tags?: string[];
  /** 메타데이터 필터 */
  metadata_filters?: Record<string, any>;
}

// -----------------------------------------------------------------------------
// ⚙️ Configuration Types
// -----------------------------------------------------------------------------

/**
 * 로그 시스템 서비스 설정 (ServiceConfig 확장)
 */
export interface LogSystemConfig {
  /** 서비스 활성화 여부 */
  enabled: boolean;
  /** 자동 시작 여부 */
  autoStart: boolean;
  /** 재시도 횟수 */
  retryCount: number;
  /** 타임아웃 (ms) */
  timeout: number;
  /** 브릿지 엔드포인트 URL */
  bridgeEndpoint: string;
  /** 자동 연결 여부 */
  autoConnect: boolean;
  /** 재시도 시도 횟수 */
  retryAttempts: number;
  /** 버퍼 크기 */
  bufferSize: number;
  /** 실시간 모드 활성화 */
  realTimeEnabled: boolean;
  /** WebSocket 설정 */
  websocket?: {
    /** WebSocket URL */
    url: string;
    /** 재연결 간격 (ms) */
    reconnectInterval: number;
    /** 최대 재연결 시도 */
    maxReconnectAttempts: number;
  };
  /** 캐시 설정 */
  cache?: {
    /** 캐시 활성화 */
    enabled: boolean;
    /** 캐시 TTL (ms) */
    ttl: number;
    /** 최대 캐시 크기 */
    maxSize: number;
  };
}

/**
 * 로그 UI 설정
 */
export interface LogUISettings {
  /** 테마 */
  theme: 'light' | 'dark' | 'auto';
  /** 페이지 크기 */
  pageSize: number;
  /** 자동 새로고침 */
  autoRefresh: boolean;
  /** 새로고침 간격 (ms) */
  refreshInterval: number;
  /** 메타데이터 표시 */
  showMetadata: boolean;
  /** 글꼴 크기 */
  fontSize: 'small' | 'medium' | 'large';
  /** 저장된 검색 */
  savedSearches: SavedSearch[];
  /** 타임스탬프 형식 */
  timestampFormat: 'relative' | 'absolute' | 'iso';
  /** 컬럼 표시 설정 */
  visibleColumns: string[];
  /** 실시간 스트리밍 활성화 */
  enableRealtimeStream: boolean;
  /** 알림 설정 */
  notifications?: {
    /** 에러 알림 */
    errorAlerts: boolean;
    /** 알림 임계값 */
    errorThreshold: number;
    /** 알림 방식 */
    alertMethods: ('toast' | 'sound' | 'desktop')[];
  };
}

/**
 * 저장된 검색 쿼리
 */
export interface SavedSearch {
  /** 검색 ID */
  id: string;
  /** 검색 이름 */
  name: string;
  /** 검색 쿼리 */
  query: string;
  /** 검색 옵션 */
  options: SearchOptions;
  /** 생성 시간 */
  created_at: string;
  /** 마지막 사용 시간 */
  last_used?: string;
  /** 사용 횟수 */
  usage_count: number;
  /** 태그 */
  tags?: string[];
}

// -----------------------------------------------------------------------------
// 🎛️ Component Props Types
// -----------------------------------------------------------------------------

/**
 * LogViewer 컴포넌트 속성
 */
export interface LogViewerProps {
  /** CSS 클래스 */
  className?: string;
  /** 인라인 스타일 */
  style?: Partial<CSSStyleDeclaration>;
  /** 데이터 속성 */
  dataset?: Record<string, string>;
  /** 접근성 속성 */
  ariaLabel?: string;
  /** 접근성 역할 */
  role?: string;
  /** 자동 새로고침 활성화 */
  autoRefresh?: boolean;
  /** 페이지 크기 */
  pageSize?: number;
  /** 필터 패널 표시 */
  showFilters?: boolean;
  /** 검색 패널 표시 */
  showSearch?: boolean;
  /** 실시간 모드 */
  realTimeMode?: boolean;
  /** 초기 쿼리 */
  initialQuery?: LogQueryParams;
  /** 표시할 컬럼 */
  visibleColumns?: string[];
  /** 가상 스크롤링 활성화 */
  virtualScrolling?: boolean;
  /** 컴팩트 모드 */
  compact?: boolean;
}

/**
 * LogSearch 컴포넌트 속성
 */
export interface LogSearchProps extends ComponentProps {
  /** 초기 검색 쿼리 */
  initialQuery?: string;
  /** 고급 검색 활성화 */
  enableAdvancedSearch?: boolean;
  /** 자동완성 활성화 */
  enableAutoComplete?: boolean;
  /** 검색 히스토리 저장 */
  saveSearchHistory?: boolean;
  /** 실시간 검색 (타이핑 중) */
  liveSearch?: boolean;
  /** 검색 결과 콜백 */
  onSearchResults?: ((results: SearchResult) => void) | undefined;
}

/**
 * LogDashboard 컴포넌트 속성
 */
export interface LogDashboardProps extends Omit<ComponentProps, 'timeRange'> {
  /** 대시보드 레이아웃 */
  layout?: 'grid' | 'masonry' | 'flex';
  /** 표시할 위젯 */
  widgets?: string[];
  /** 자동 새로고침 간격 (ms) */
  refreshInterval?: number;
  /** 시간 범위 */
  timeRange?: TimeRange;
  /** 커스텀 위젯 */
  customWidgets?: Array<{
    id: string;
    title: string;
    component: string;
    props?: any;
  }>;
  /** 위젯 설정 변경 콜백 */
  onWidgetConfigChange?: (widgetId: string, config: any) => void;
  /** 레이아웃 변경 콜백 */
  onLayoutChange?: (layout: any) => void;
}

/**
 * 대시보드 위젯 기본 인터페이스
 */
export interface DashboardWidget {
  /** 위젯 ID */
  id: string;
  /** 위젯 제목 */
  title: string;
  /** 위젯 타입 */
  type: 'system-status' | 'error-chart' | 'recent-errors' | 'log-stream' | 'stats-overview';
  /** 위젯 크기 */
  size: 'small' | 'medium' | 'large' | 'full';
  /** 위젯 위치 */
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** 위젯 설정 */
  config?: Record<string, any>;
  /** 위젯 표시 여부 */
  visible: boolean;
  /** 새로고침 간격 (ms) */
  refreshInterval?: number;
}

/**
 * 시스템 상태 위젯 데이터
 */
export interface SystemStatusData {
  /** 로그 시스템 연결 상태 */
  log_system_connected: boolean;
  /** Python 서버 상태 */
  python_server_status: 'running' | 'stopped' | 'error';
  /** 수집기 상태 */
  collectors: {
    mcp: { active: boolean; last_activity?: string };
    websocket: { active: boolean; last_activity?: string };
    ai: { active: boolean; last_activity?: string };
    http: { active: boolean; last_activity?: string };
  };
  /** 전체 로그 수량 */
  total_logs: number;
  /** 데이터베이스 크기 */
  database_size_mb: number;
  /** 메모리 사용량 */
  memory_usage_mb: number;
  /** 업타임 */
  uptime_seconds: number;
}

/**
 * 에러율 차트 데이터
 */
export interface ErrorChartData {
  /** 시간별 에러율 데이터 */
  time_series: Array<{
    timestamp: string;
    error_count: number;
    total_count: number;
    error_rate: number;
  }>;
  /** 소스별 에러 분포 */
  by_source: Array<{
    source: string;
    error_count: number;
    percentage: number;
  }>;
  /** 레벨별 에러 분포 */
  by_level: Array<{
    level: LogLevel;
    count: number;
    percentage: number;
  }>;
}

/**
 * 최근 에러 목록 데이터
 */
export interface RecentErrorsData {
  /** 최근 에러 로그 목록 */
  errors: LogEntry[];
  /** 총 에러 수 */
  total_count: number;
  /** 에러율 */
  error_rate: number;
  /** 마지막 업데이트 시간 */
  last_updated: string;
}

/**
 * 실시간 로그 스트림 데이터
 */
export interface LogStreamData {
  /** 실시간 로그 엔트리 */
  logs: LogEntry[];
  /** 스트림 상태 */
  stream_status: 'connected' | 'disconnected' | 'reconnecting';
  /** 초당 로그 수 */
  logs_per_second: number;
  /** 활성 필터 */
  active_filters: LogFilter[];
  /** 버퍼 크기 */
  buffer_size: number;
  /** 최대 버퍼 크기 */
  max_buffer_size: number;
}

/**
 * LogAnalysis 컴포넌트 속성
 */
export interface LogAnalysisProps extends Omit<ComponentProps, 'timeRange'> {
  /** 분석 타입 */
  analysisType?: 'performance' | 'errors' | 'patterns' | 'trends';
  /** 분석 시간 범위 */
  timeRange?: TimeRange;
  /** 차트 타입 */
  chartType?: 'line' | 'bar' | 'pie' | 'heatmap';
  /** 자동 새로고침 */
  autoRefresh?: boolean;
  /** 새로고침 간격 (ms) */
  refreshInterval?: number;
  /** 알림 설정 */
  alertSettings?: {
    enabled: boolean;
    thresholds: Record<string, number>;
  };
  /** 분석 결과 콜백 */
  onAnalysisComplete?: (analysis: LogAnalysisResult) => void;
  /** 패턴 감지 콜백 */
  onPatternDetected?: (pattern: DetectedPattern) => void;
}

/**
 * 로그 분석 결과
 */
export interface LogAnalysisResult {
  /** 분석 ID */
  id: string;
  /** 분석 타입 */
  type: 'performance' | 'errors' | 'patterns' | 'trends';
  /** 분석 시간 범위 */
  timerange: string;
  /** 분석 완료 시간 */
  completed_at: string;
  /** 분석 실행 시간 (ms) */
  execution_time: number;
  /** 에러 패턴 분석 */
  error_patterns?: ErrorPatternAnalysis;
  /** 성능 분석 */
  performance_analysis?: PerformanceAnalysis;
  /** 트렌드 분석 */
  trend_analysis?: TrendAnalysis;
  /** 이상 탐지 결과 */
  anomaly_detection?: AnomalyDetection;
  /** 추천 사항 */
  recommendations?: Recommendation[];
}

/**
 * 에러 패턴 분석
 */
export interface ErrorPatternAnalysis {
  /** 시간대별 에러 빈도 */
  hourly_frequency: Array<{
    hour: number;
    error_count: number;
    error_rate: number;
  }>;
  /** 에러 메시지 클러스터링 */
  message_clusters: Array<{
    cluster_id: string;
    pattern: string;
    count: number;
    examples: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  /** 반복 패턴 */
  recurring_patterns: Array<{
    pattern: string;
    frequency: number;
    interval_minutes: number;
    confidence: number;
  }>;
  /** 에러 전파 분석 */
  error_propagation: Array<{
    source: string;
    affected_components: string[];
    cascade_delay_ms: number;
  }>;
}

/**
 * 트렌드 분석
 */
export interface TrendAnalysis {
  /** 로그 볼륨 트렌드 */
  volume_trend: {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    change_percentage: number;
    confidence: number;
  };
  /** 에러율 트렌드 */
  error_rate_trend: {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    change_percentage: number;
    confidence: number;
  };
  /** 성능 트렌드 */
  performance_trend: {
    response_time_trend: 'improving' | 'degrading' | 'stable';
    throughput_trend: 'increasing' | 'decreasing' | 'stable';
  };
  /** 예측 */
  predictions: Array<{
    metric: string;
    predicted_value: number;
    confidence_interval: [number, number];
    time_horizon: string;
  }>;
}

/**
 * 이상 탐지
 */
export interface AnomalyDetection {
  /** 감지된 이상 */
  anomalies: Array<{
    id: string;
    type: 'spike' | 'drop' | 'pattern_break' | 'threshold_breach';
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: string;
    metric: string;
    actual_value: number;
    expected_value: number;
    deviation_score: number;
    description: string;
  }>;
  /** 이상 점수 */
  overall_anomaly_score: number;
  /** 시스템 건강도 */
  health_score: number;
}

/**
 * 감지된 패턴
 */
export interface DetectedPattern {
  /** 패턴 ID */
  id: string;
  /** 패턴 타입 */
  type: 'error_burst' | 'performance_degradation' | 'resource_exhaustion' | 'cascade_failure';
  /** 패턴 이름 */
  name: string;
  /** 설명 */
  description: string;
  /** 심각도 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 신뢰도 */
  confidence: number;
  /** 발생 시간 */
  detected_at: string;
  /** 영향받은 컴포넌트 */
  affected_components: string[];
  /** 관련 로그 엔트리 */
  related_logs: LogEntry[];
  /** 추천 액션 */
  recommended_actions: string[];
}

/**
 * 추천 사항
 */
export interface Recommendation {
  /** 추천 ID */
  id: string;
  /** 추천 타입 */
  type: 'optimization' | 'alert_rule' | 'monitoring' | 'maintenance';
  /** 우선순위 */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** 제목 */
  title: string;
  /** 설명 */
  description: string;
  /** 예상 효과 */
  expected_impact: string;
  /** 구현 난이도 */
  implementation_effort: 'low' | 'medium' | 'high';
  /** 관련 메트릭 */
  related_metrics: string[];
}

// -----------------------------------------------------------------------------
// 🔌 Service & Client Types
// -----------------------------------------------------------------------------

/**
 * LogSystemService 인터페이스
 */
export interface LogSystemService {
  /** 서비스 이름 */
  name: string;
  /** 서비스 버전 */
  version: string;
  /** 초기화 여부 */
  isInitialized: boolean;
  /** 서비스 상태 */
  status: 'pending' | 'initializing' | 'ready' | 'error' | 'destroyed';
  
  /** 서비스 초기화 */
  initialize(): Promise<void>;
  /** 서비스 종료 */
  destroy(): Promise<void>;
  /** 서비스 상태 확인 */
  getStatus(): 'pending' | 'initializing' | 'ready' | 'error' | 'destroyed';
  
  /** 로그 쿼리 */
  query(params: LogQueryParams): Promise<LogQueryResult>;
  /** 로그 검색 */
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  /** 로그 통계 */
  getStats(timeRange?: TimeRange): Promise<LogStatistics>;
  /** 실시간 로그 스트림 */
  streamLogs(callback: LogCallback): Promise<LogStream>;
  /** 시스템 상태 확인 */
  getSystemStatus(): Promise<LogSystemStatus>;
  /** 로그 엔트리 추가 */
  logEntry(entry: PartialLogEntry): Promise<void>;
  /** 배치 로그 추가 */
  logBatch(entries: PartialLogEntry[], options?: BatchLogOptions): Promise<void>;
}

/**
 * LogSystemService 메소드 결과 타입들
 */
export interface LogServiceResponse<T = any> {
  /** 응답 데이터 */
  data: T;
  /** 성공 여부 */
  success: boolean;
  /** 오류 메시지 */
  error?: string;
  /** 응답 시간 (ms) */
  response_time?: number;
  /** 요청 ID */
  request_id?: string;
}

/**
 * 로그 시스템 상태
 */
export interface LogSystemStatus {
  /** 서비스 상태 */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'maintenance';
  /** 브릿지 연결 상태 */
  bridge_connected: boolean;
  /** Python 서버 상태 */
  python_server_status: 'running' | 'stopped' | 'error';
  /** 데이터베이스 상태 */
  database_status: 'connected' | 'disconnected' | 'error';
  /** 총 로그 수 */
  total_logs: number;
  /** 디스크 사용량 */
  disk_usage_mb: number;
  /** 메모리 사용량 */
  memory_usage_mb: number;
  /** 업타임 */
  uptime_seconds: number;
  /** 마지막 상태 확인 시간 */
  last_check: string;
  /** 버전 정보 */
  version?: {
    bridge: string;
    python_server: string;
    database_schema: string;
  };
}

/**
 * 배치 로그 처리 옵션
 */
export interface BatchLogOptions {
  /** 압축 사용 여부 */
  compress?: boolean;
  /** 배치 크기 */
  batchSize?: number;
  /** 배치 타임아웃 (ms) */
  timeout?: number;
  /** 진행률 콜백 */
  onProgress?: (processed: number, total: number) => void;
}

// -----------------------------------------------------------------------------
// 🎯 Event Types
// -----------------------------------------------------------------------------

/**
 * 로그 시스템 이벤트 타입
 */
export type LogSystemEventType = 
  | 'log:new'           // 새 로그 수신
  | 'log:batch'         // 배치 로그 수신
  | 'log:error'         // 로그 처리 오류
  | 'log:received'      // 로그 수신 (스트림)
  | 'stream:connected'  // 스트림 연결
  | 'stream:disconnected' // 스트림 연결 해제
  | 'stream:started'    // 스트림 시작
  | 'stream:stopped'    // 스트림 중지
  | 'stream:error'      // 스트림 에러
  | 'stream:filters_updated' // 스트림 필터 업데이트
  | 'websocket:connected'    // WebSocket 연결
  | 'websocket:disconnected' // WebSocket 연결 해제
  | 'websocket:error'        // WebSocket 에러
  | 'reconnection:success'   // 재연결 성공
  | 'reconnection:failed'    // 재연결 실패
  | 'filter:changed'    // 필터 변경
  | 'search:completed'  // 검색 완료
  | 'analysis:updated'  // 분석 결과 업데이트
  | 'system:status'     // 시스템 상태 변경
  | 'config:changed';   // 설정 변경

/**
 * 로그 시스템 이벤트 데이터
 */
export interface LogSystemEventData {
  /** 이벤트 타입 */
  type?: LogSystemEventType;
  /** 이벤트 페이로드 */
  payload?: any;
  /** 이벤트 발생 시간 */
  timestamp?: string;
  /** 이벤트 소스 */
  source?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
  /** 스트림 ID (스트림 관련 이벤트) */
  streamId?: string;
  /** 필터 정보 (필터 관련 이벤트) */
  filters?: LogFilter;
  /** 로그 엔트리 (로그 관련 이벤트) */
  entry?: LogEntry;
  /** 에러 정보 (에러 관련 이벤트) */
  error?: any;
  /** 재연결 시도 횟수 (재연결 관련 이벤트) */
  attempts?: number;
  /** WebSocket 종료 코드 */
  code?: number;
  /** WebSocket 종료 이유 */
  reason?: string;
}

// -----------------------------------------------------------------------------
// 🛠️ Utility Types
// -----------------------------------------------------------------------------

/**
 * 부분적 로그 엔트리 (생성 시 사용)
 */
export type PartialLogEntry = Omit<LogEntry, 'id' | 'timestamp' | 'created_at'> & {
  id?: string;
  timestamp?: string;
  created_at?: number;
};

/**
 * 로그 레벨 필터 유니온 타입
 */
export type LogLevelFilter = LogLevel | LogLevel[] | 'all';

/**
 * 정렬 옵션
 */
export interface SortOptions {
  /** 정렬 필드 */
  field: 'timestamp' | 'level' | 'source' | 'message';
  /** 정렬 방향 */
  direction: 'asc' | 'desc';
}

/**
 * 페이지네이션 정보
 */
export interface PaginationInfo {
  /** 현재 페이지 */
  current_page: number;
  /** 페이지 크기 */
  page_size: number;
  /** 총 페이지 수 */
  total_pages: number;
  /** 총 항목 수 */
  total_items: number;
  /** 다음 페이지 존재 여부 */
  has_next: boolean;
  /** 이전 페이지 존재 여부 */
  has_prev: boolean;
}

// -----------------------------------------------------------------------------
// 🎪 Re-exports from existing types (compatibility)
// -----------------------------------------------------------------------------

// 기존 user-interface 타입과의 호환성을 위한 재내보내기
export type { Service, ServiceConfig, ServiceStatus, ComponentProps } from './index.js';

// 기존 Logger와의 호환성을 위한 타입 별칭
export type UILogLevel = LogLevel;
export type UILogEntry = LogEntry;
export type UILogFilter = LogFilter;