// Analytics 서비스 상수 정의

import { AnalyticsConfig, PrivacySettings } from './types';

// 기본 설정
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: true,
  sessionTimeout: 30 * 60 * 1000, // 30분
  batchSize: 50,
  flushInterval: 10000, // 10초
  enableUserTracking: true,
  enablePerformanceTracking: true,
  enableErrorTracking: true,
  enableCustomEvents: true,
  privacyMode: false,
  debugMode: false,
  sampleRate: 1.0, // 100%
  maxEventsPerSession: 1000,
  persistEvents: true
};

// 개인정보 보호 기본 설정
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  enableTracking: true,
  enableUserIdentification: false,
  enableLocationTracking: false,
  enableDeviceTracking: true,
  dataRetentionDays: 30,
  allowedDomains: [],
  blockedEvents: []
};

// 이벤트 카테고리
export const EVENT_CATEGORIES = {
  NAVIGATION: 'navigation',
  USER_INTERACTION: 'user_interaction',
  PERFORMANCE: 'performance',
  ERROR: 'error',
  SYSTEM: 'system',
  CUSTOM: 'custom'
} as const;

// 표준 이벤트 액션
export const EVENT_ACTIONS = {
  // Navigation
  PAGE_VIEW: 'page_view',
  ROUTE_CHANGE: 'route_change',
  
  // User Interaction
  CLICK: 'click',
  SUBMIT: 'submit',
  SCROLL: 'scroll',
  FOCUS: 'focus',
  BLUR: 'blur',
  HOVER: 'hover',
  
  // Performance
  LOAD_START: 'load_start',
  LOAD_END: 'load_end',
  RENDER_START: 'render_start',
  RENDER_END: 'render_end',
  
  // Error
  ERROR_OCCURRED: 'error_occurred',
  ERROR_HANDLED: 'error_handled',
  
  // System
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  VISIBILITY_CHANGE: 'visibility_change'
} as const;

// 성능 메트릭 이름
export const PERFORMANCE_METRICS = {
  // 로딩 성능
  DOM_CONTENT_LOADED: 'dom_content_loaded',
  LOAD_COMPLETE: 'load_complete',
  FIRST_PAINT: 'first_paint',
  FIRST_CONTENTFUL_PAINT: 'first_contentful_paint',
  LARGEST_CONTENTFUL_PAINT: 'largest_contentful_paint',
  
  // 상호작용 성능
  FIRST_INPUT_DELAY: 'first_input_delay',
  TIME_TO_INTERACTIVE: 'time_to_interactive',
  
  // 메모리 및 리소스
  MEMORY_USAGE: 'memory_usage',
  BUNDLE_SIZE: 'bundle_size',
  NETWORK_LATENCY: 'network_latency',
  
  // 사용자 정의
  COMPONENT_RENDER_TIME: 'component_render_time',
  API_RESPONSE_TIME: 'api_response_time',
  WEBSOCKET_LATENCY: 'websocket_latency'
} as const;

// 저장소 키
export const STORAGE_KEYS = {
  ANALYTICS_CONFIG: 'recursive_analytics_config',
  USER_ID: 'recursive_user_id',
  SESSION_ID: 'recursive_session_id',
  EVENTS_QUEUE: 'recursive_analytics_events',
  PRIVACY_SETTINGS: 'recursive_privacy_settings',
  LAST_VISIT: 'recursive_last_visit',
  VISIT_COUNT: 'recursive_visit_count',
  SESSION_START: 'recursive_session_start'
} as const;

// 이벤트 타입별 색상 (UI 표시용)
export const EVENT_TYPE_COLORS = {
  page_view: '#3b82f6',
  user_action: '#10b981',
  performance: '#f59e0b',
  error: '#ef4444',
  custom: '#8b5cf6',
  system: '#6b7280'
} as const;

// 성능 임계값
export const PERFORMANCE_THRESHOLDS = {
  LOAD_TIME_WARNING: 3000, // 3초
  LOAD_TIME_CRITICAL: 5000, // 5초
  MEMORY_WARNING: 100 * 1024 * 1024, // 100MB
  MEMORY_CRITICAL: 200 * 1024 * 1024, // 200MB
  FPS_WARNING: 30,
  FPS_CRITICAL: 15,
  BUNDLE_SIZE_WARNING: 1024 * 1024, // 1MB
  BUNDLE_SIZE_CRITICAL: 2 * 1024 * 1024 // 2MB
} as const;

// 개인정보 보호 관련 상수
export const PRIVACY_CONSTANTS = {
  ANONYMOUS_USER_ID: 'anonymous',
  MASKED_VALUE: '[MASKED]',
  CONSENT_COOKIE_NAME: 'recursive_analytics_consent',
  CONSENT_EXPIRY_DAYS: 365
} as const;

// 배치 처리 상수
export const BATCH_CONSTANTS = {
  MIN_BATCH_SIZE: 1,
  MAX_BATCH_SIZE: 100,
  MIN_FLUSH_INTERVAL: 1000, // 1초
  MAX_FLUSH_INTERVAL: 60000, // 60초
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1초
} as const;

// 세션 관리 상수
export const SESSION_CONSTANTS = {
  MIN_SESSION_TIMEOUT: 5 * 60 * 1000, // 5분
  MAX_SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24시간
  ACTIVITY_PING_INTERVAL: 60 * 1000, // 1분
  HEARTBEAT_INTERVAL: 5 * 60 * 1000 // 5분
} as const;

// 에러 메시지
export const ERROR_MESSAGES = {
  ANALYTICS_DISABLED: 'Analytics tracking is disabled',
  INVALID_CONFIG: 'Invalid analytics configuration',
  STORAGE_UNAVAILABLE: 'Local storage is not available',
  NETWORK_ERROR: 'Failed to send analytics data',
  PRIVACY_BLOCKED: 'Event blocked by privacy settings',
  QUOTA_EXCEEDED: 'Analytics event quota exceeded',
  INVALID_EVENT: 'Invalid analytics event format'
} as const;

// 디버그 모드 상수
export const DEBUG_CONSTANTS = {
  LOG_PREFIX: '[Analytics]',
  VERBOSE_LOGGING: false,
  SHOW_PERFORMANCE_WARNINGS: true,
  HIGHLIGHT_TRACKED_ELEMENTS: false
} as const; 