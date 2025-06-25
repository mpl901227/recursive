// ========================================
// Recursive v2 - 단순화된 타입 시스템
// ========================================

// === 기본 타입 ===
export type Theme = 'light' | 'dark';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type PageRoute = 'logs' | 'planner' | 'llm-chat';

// === 이벤트 타입 ===
export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface EventMap {
  'log:new': LogEntry;
  'log:clear': void;
  'log:filter': { type: string; value: string };
  'route:change': { route: PageRoute };
  'sidebar:toggle': { open: boolean };
  'theme:change': { theme: Theme };
  'connection:change': { state: ConnectionState };
  'settings:open': void;
}

export type EventListener<T = any> = (data: T) => void;

export type AppEvent<K extends keyof EventMap = keyof EventMap> = {
  type: K;
  data: EventMap[K];
  timestamp: number;
}

// === 컴포넌트 타입 ===
export interface ComponentProps {
  [key: string]: any;
}

export interface Component {
  initialize(): Promise<void>;
  render(): string;
  destroy(): void;
  isInitialized: boolean;
}

// === 로그 시스템 타입 ===
export interface LogFilter {
  level?: string[];
  source?: string[];
  search?: string;
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface LogDashboardData {
  recentLogs: LogEntry[];
  errorCount: number;
  warningCount: number;
  systemHealth: 'good' | 'warning' | 'critical';
  topSources: Array<{
    source: string;
    count: number;
  }>;
}

// === AI 분석 타입 ===
export interface AIAnalysisRequest {
  type: 'complexity' | 'workflow' | 'health';
  data: any;
}

export interface AIAnalysisResponse {
  success: boolean;
  result: any;
  error?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// === 서비스 타입 ===
export interface Service {
  initialize(): Promise<void>;
  destroy(): void;
  isInitialized: boolean;
}

export interface AIAnalysisService extends Service {
  analyzeComplexity(description: string): Promise<AIAnalysisResponse>;
  generateWorkflow(requirements: any): Promise<AIAnalysisResponse>;
  analyzeSystemHealth(metrics: any): Promise<AIAnalysisResponse>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

export interface LogService extends Service {
  getLogs(filter?: LogFilter): Promise<LogEntry[]>;
  streamLogs(callback: (log: LogEntry) => void): void;
  getDashboardData(): Promise<LogDashboardData>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

export interface WebSocketService extends Service {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(message: any): void;
  onMessage(callback: (message: any) => void): void;
  getConnectionState(): ConnectionState;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

// === 앱 설정 타입 ===
export interface AppConfig {
  theme?: Theme;
  apiBaseUrl?: string;
  wsUrl?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  debug?: boolean;
  name?: string;
  version: string;
  gitHash: string;
  api?: {
    logSystem: string;
    websocket: string;
  };
}

// === API 응답 타입 ===
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// === 유틸리티 타입 ===
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

export type Required<T> = {
  [P in keyof T]-?: T[P];
};

// === 서비스 상태 타입 ===
export interface ServiceStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: string;
  details?: string;
} 