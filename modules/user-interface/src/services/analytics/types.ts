// Analytics 서비스 타입 정의

export interface AnalyticsConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  sessionTimeout: number;
  batchSize: number;
  flushInterval: number;
  enableUserTracking: boolean;
  enablePerformanceTracking: boolean;
  enableErrorTracking: boolean;
  enableCustomEvents: boolean;
  privacyMode: boolean;
  debugMode: boolean;
  sampleRate: number;
  maxEventsPerSession: number;
  persistEvents: boolean;
}

export interface UserInfo {
  userId?: string | undefined;
  sessionId: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  isFirstVisit: boolean;
  lastVisit?: Date | undefined;
  visitCount: number;
}

export interface SessionInfo {
  sessionId: string;
  startTime: Date;
  lastActivity: Date;
  duration: number;
  pageViews: number;
  events: number;
  isActive: boolean;
  referrer?: string;
  entryPage: string;
  exitPage?: string;
}

export interface AnalyticsEvent {
  id: string;
  type: EventType;
  category: string;
  action: string;
  label?: string | undefined;
  value?: number | undefined;
  timestamp: Date;
  sessionId: string;
  userId?: string | undefined;
  properties?: Record<string, any> | undefined;
  context?: EventContext | undefined;
}

export enum EventType {
  PAGE_VIEW = 'page_view',
  USER_ACTION = 'user_action',
  PERFORMANCE = 'performance',
  ERROR = 'error',
  CUSTOM = 'custom',
  SYSTEM = 'system'
}

export interface EventContext {
  page: string;
  component?: string;
  element?: string;
  route?: string;
  referrer?: string;
  userAgent: string;
  timestamp: Date;
  viewport: {
    width: number;
    height: number;
  };
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  type: PerformanceMetricType;
  context?: Record<string, any>;
}

export enum PerformanceMetricType {
  LOAD_TIME = 'load_time',
  RENDER_TIME = 'render_time',
  INTERACTION_TIME = 'interaction_time',
  NETWORK_REQUEST = 'network_request',
  MEMORY_USAGE = 'memory_usage',
  FPS = 'fps',
  BUNDLE_SIZE = 'bundle_size',
  CUSTOM = 'custom'
}

export interface UserAction {
  action: string;
  category: string;
  label?: string | undefined;
  value?: number | undefined;
  element?: string | undefined;
  component?: string | undefined;
  properties?: Record<string, any> | undefined;
}

export interface AnalyticsFilter {
  type?: EventType[];
  category?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  userId?: string;
  sessionId?: string;
}

export interface AnalyticsReport {
  totalEvents: number;
  uniqueUsers: number;
  sessions: number;
  averageSessionDuration: number;
  topActions: Array<{
    action: string;
    count: number;
    percentage: number;
  }>;
  topPages: Array<{
    page: string;
    views: number;
    percentage: number;
  }>;
  performanceMetrics: {
    averageLoadTime: number;
    averageRenderTime: number;
    errorRate: number;
    bounceRate: number;
  };
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface AnalyticsStorage {
  saveEvent(event: AnalyticsEvent): Promise<void>;
  getEvents(filter?: AnalyticsFilter): Promise<AnalyticsEvent[]>;
  clearEvents(olderThan?: Date): Promise<void>;
  getEventCount(): Promise<number>;
  exportEvents(): Promise<AnalyticsEvent[]>;
}

export interface AnalyticsProvider {
  initialize(config: AnalyticsConfig): Promise<void>;
  track(event: AnalyticsEvent): Promise<void>;
  trackBatch(events: AnalyticsEvent[]): Promise<void>;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

export interface PrivacySettings {
  enableTracking: boolean;
  enableUserIdentification: boolean;
  enableLocationTracking: boolean;
  enableDeviceTracking: boolean;
  dataRetentionDays: number;
  allowedDomains?: string[];
  blockedEvents?: string[];
}

export interface AnalyticsEventListener {
  (event: AnalyticsEvent): void;
}

export interface AnalyticsStats {
  totalEvents: number;
  eventsThisSession: number;
  lastEventTime?: Date | undefined;
  sessionStartTime: Date;
  batchesSent: number;
  failedRequests: number;
  storageSize: number;
  isTracking: boolean;
  privacyMode: boolean;
} 