// =============================================================================
// 🎯 Recursive UI Module - Core Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// 🏗️ Component Types
// -----------------------------------------------------------------------------

/**
 * 기본 컴포넌트 인터페이스
 */
export interface Component {
  /** 컴포넌트 고유 ID */
  readonly id: string;
  /** 컴포넌트 이름 */
  readonly name: string;
  /** DOM 엘리먼트 */
  readonly element: HTMLElement;
  /** 초기화 여부 */
  isInitialized: boolean;
  /** 활성 상태 */
  isActive: boolean;
  
  /** 컴포넌트 렌더링 */
  render(): void;
  /** 컴포넌트 제거 */
  destroy(): void;
  /** 이벤트 바인딩 */
  bindEvents(): void;
  /** 이벤트 언바인딩 */
  unbindEvents(): void;
}

/**
 * 컴포넌트 생성자 타입
 */
export type ComponentConstructor<T extends Component = Component> = new (
  element: HTMLElement | string,
  props?: any,
  eventManager?: any,
  options?: any
) => T;

/**
 * 컴포넌트 속성 기본 타입
 */
export interface ComponentProps {
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
}

/**
 * 컴포넌트 상태 타입
 */
export type ComponentState = 'idle' | 'loading' | 'ready' | 'error' | 'destroyed';

// -----------------------------------------------------------------------------
// 🔧 Service Types
// -----------------------------------------------------------------------------

/**
 * 기본 서비스 인터페이스
 */
export interface Service {
  /** 서비스 이름 */
  name: string;
  /** 서비스 버전 */
  version: string;
  /** 초기화 여부 */
  isInitialized: boolean;
  /** 서비스 상태 */
  status: ServiceStatus;
  
  /** 서비스 초기화 */
  initialize(): Promise<void>;
  /** 서비스 종료 */
  destroy(): Promise<void>;
  /** 서비스 상태 확인 */
  getStatus(): ServiceStatus;
}

/**
 * 서비스 상태 타입
 */
export type ServiceStatus = 'pending' | 'initializing' | 'ready' | 'error' | 'destroyed';

/**
 * 서비스 설정 기본 타입
 */
export interface ServiceConfig {
  /** 서비스 활성화 여부 */
  enabled: boolean;
  /** 자동 시작 여부 */
  autoStart: boolean;
  /** 재시도 횟수 */
  retryCount: number;
  /** 타임아웃 (ms) */
  timeout: number;
}

/**
 * 서비스 레지스트리 타입
 */
export interface ServiceRegistry {
  /** 서비스 등록 */
  register<T extends Service>(name: string, service: T): void;
  /** 서비스 조회 */
  get<T extends Service>(name: string): T | undefined;
  /** 서비스 존재 확인 */
  has(name: string): boolean;
  /** 서비스 제거 */
  unregister(name: string): boolean;
  /** 모든 서비스 목록 */
  getAll(): Map<string, Service>;
}

// -----------------------------------------------------------------------------
// ⚙️ Configuration Types
// -----------------------------------------------------------------------------

/**
 * 애플리케이션 설정 인터페이스
 */
export interface Config {
  /** 애플리케이션 정보 */
  app: AppConfig;
  /** WebSocket 설정 */
  websocket: WebSocketConfig;
  /** MCP 설정 */
  mcp: MCPConfig;
  /** API 설정 */
  api: APIConfig;
  /** UI 설정 */
  ui: UIConfig;
  /** 로깅 설정 */
  logging: LoggingConfig;
}

/**
 * 애플리케이션 기본 설정
 */
export interface AppConfig {
  /** 애플리케이션 이름 */
  name: string;
  /** 버전 */
  version: string;
  /** 환경 (development, production, test) */
  environment: Environment;
  /** 디버그 모드 */
  debug: boolean;
  /** 기본 언어 */
  locale: string;
  /** 기본 테마 */
  theme: Theme;
}

/**
 * 환경 타입
 */
export type Environment = 'development' | 'production' | 'test';

/**
 * 테마 타입
 */
export type Theme = 'light' | 'dark' | 'auto';

// -----------------------------------------------------------------------------
// 📡 Event System Types
// -----------------------------------------------------------------------------

/**
 * 이벤트 데이터 기본 인터페이스
 */
export interface EventData {
  /** 이벤트 타입 */
  type: string;
  /** 이벤트 발생 시간 */
  timestamp: number;
  /** 이벤트 소스 */
  source?: string;
  /** 이벤트 대상 */
  target?: string;
  /** 추가 데이터 */
  payload?: any;
  /** 이벤트 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 이벤트 핸들러 타입
 */
export type EventHandler<T = any> = (data: T) => void | Promise<void>;

/**
 * 이벤트 리스너 옵션
 */
export interface EventListenerOptions {
  /** 한 번만 실행 */
  once?: boolean;
  /** 우선순위 (높을수록 먼저 실행) */
  priority?: number;
  /** 비동기 실행 */
  async?: boolean;
  /** 에러 시 계속 진행 */
  continueOnError?: boolean;
}

/**
 * 이벤트 매니저 타입 (실제 구현은 core/events.ts에 있음)
 */
export type { EventManager } from '../core/events.js';

// -----------------------------------------------------------------------------
// 🌐 WebSocket Types
// -----------------------------------------------------------------------------

/**
 * WebSocket 메시지 기본 인터페이스
 */
export interface Message {
  /** 메시지 ID */
  id: string;
  /** 메시지 타입 */
  type: MessageType;
  /** 메시지 데이터 */
  data: any;
  /** 발송 시간 */
  timestamp: number;
  /** 메시지 우선순위 */
  priority?: MessagePriority;
  /** 응답 필요 여부 */
  requiresResponse?: boolean;
  /** 타임아웃 (ms) */
  timeout?: number;
}

/**
 * 메시지 타입
 */
export type MessageType = 
  | 'request' 
  | 'response' 
  | 'notification' 
  | 'error' 
  | 'heartbeat'
  | 'system';

/**
 * 메시지 우선순위
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * WebSocket 연결 상태
 */
export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'error'
  | 'closing';

/**
 * WebSocket 연결 인터페이스
 */
export interface Connection {
  /** 연결 ID */
  id: string;
  /** 연결 URL */
  url: string;
  /** 연결 상태 */
  state: ConnectionState;
  /** 연결 시간 */
  connectedAt?: number;
  /** 마지막 활동 시간 */
  lastActivity: number;
  /** 재연결 시도 횟수 */
  reconnectAttempts: number;
  /** 지연 시간 (ms) */
  latency?: number;
  
  /** 연결 */
  connect(): Promise<void>;
  /** 연결 해제 */
  disconnect(): Promise<void>;
  /** 메시지 전송 */
  send(message: Message): Promise<void>;
  /** 연결 상태 확인 */
  isConnected(): boolean;
}

/**
 * WebSocket 설정
 */
export interface WebSocketConfig extends ServiceConfig {
  /** WebSocket URL */
  url: string;
  /** 프로토콜 */
  protocols?: string[];
  /** 하트비트 간격 (ms) */
  heartbeatInterval: number;
  /** 재연결 설정 */
  reconnect: ReconnectConfig;
  /** 메시지 큐 설정 */
  messageQueue: MessageQueueConfig;
}

/**
 * 재연결 설정
 */
export interface ReconnectConfig {
  /** 자동 재연결 */
  enabled: boolean;
  /** 최대 재연결 시도 */
  maxAttempts: number;
  /** 초기 지연 시간 (ms) */
  initialDelay: number;
  /** 최대 지연 시간 (ms) */
  maxDelay: number;
  /** 지연 배수 */
  backoffMultiplier: number;
}

/**
 * 메시지 큐 설정
 */
export interface MessageQueueConfig {
  /** 최대 큐 크기 */
  maxSize: number;
  /** 우선순위 큐 사용 */
  usePriority: boolean;
  /** 메시지 TTL (ms) */
  messageTTL: number;
}

// -----------------------------------------------------------------------------
// 🔧 MCP (Model Context Protocol) Types
// -----------------------------------------------------------------------------

/**
 * MCP 요청 인터페이스
 */
export interface Request {
  /** 요청 ID */
  id: string;
  /** JSON-RPC 버전 */
  jsonrpc: '2.0';
  /** 메서드 이름 */
  method: string;
  /** 매개변수 */
  params?: any;
  /** 요청 시간 */
  timestamp: number;
  /** 타임아웃 (ms) */
  timeout?: number;
}

/**
 * MCP 응답 인터페이스
 */
export interface Response {
  /** 요청 ID */
  id: string;
  /** JSON-RPC 버전 */
  jsonrpc: '2.0';
  /** 응답 결과 (성공 시) */
  result?: any;
  /** 오류 정보 (실패 시) */
  error?: RPCError;
  /** 응답 시간 */
  timestamp: number;
}

/**
 * RPC 오류 인터페이스
 */
export interface RPCError {
  /** 오류 코드 */
  code: number;
  /** 오류 메시지 */
  message: string;
  /** 추가 데이터 */
  data?: any;
}

/**
 * MCP 도구 인터페이스
 */
export interface Tool {
  /** 도구 이름 */
  name: string;
  /** 도구 설명 */
  description: string;
  /** 입력 스키마 */
  inputSchema: JSONSchema;
  /** 도구 버전 */
  version?: string;
  /** 도구 카테고리 */
  category?: string;
  /** 권한 레벨 */
  permissions?: ToolPermission[];
}

/**
 * JSON 스키마 타입
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  description?: string;
}

/**
 * 도구 권한 타입
 */
export type ToolPermission = 'read' | 'write' | 'execute' | 'admin';

/**
 * MCP 설정
 */
export interface MCPConfig extends ServiceConfig {
  /** 서버 URL */
  serverUrl: string;
  /** 클라이언트 ID */
  clientId: string;
  /** API 키 */
  apiKey?: string;
  /** 요청 큐 설정 */
  requestQueue: RequestQueueConfig;
  /** 도구 설정 */
  tools: ToolConfig;
}

/**
 * 요청 큐 설정
 */
export interface RequestQueueConfig {
  /** 최대 동시 요청 */
  maxConcurrent: number;
  /** 요청 간격 (ms) */
  requestInterval: number;
  /** 배치 크기 */
  batchSize: number;
  /** 우선순위 큐 사용 */
  usePriority: boolean;
}

/**
 * 도구 설정
 */
export interface ToolConfig {
  /** 자동 로드 */
  autoLoad: boolean;
  /** 허용된 도구 목록 */
  allowedTools?: string[];
  /** 금지된 도구 목록 */
  blockedTools?: string[];
  /** 도구 타임아웃 (ms) */
  toolTimeout: number;
}

// -----------------------------------------------------------------------------
// 🌐 API Types
// -----------------------------------------------------------------------------

/**
 * API 설정
 */
export interface APIConfig extends ServiceConfig {
  /** 기본 URL */
  baseURL: string;
  /** API 버전 */
  version: string;
  /** 인증 토큰 */
  token?: string;
  /** 요청 헤더 */
  headers: Record<string, string>;
  /** 인터셉터 설정 */
  interceptors: InterceptorConfig;
}

/**
 * 인터셉터 설정
 */
export interface InterceptorConfig {
  /** 요청 인터셉터 사용 */
  useRequestInterceptor: boolean;
  /** 응답 인터셉터 사용 */
  useResponseInterceptor: boolean;
  /** 에러 인터셉터 사용 */
  useErrorInterceptor: boolean;
}

/**
 * HTTP 메서드 타입
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 요청 옵션
 */
export interface RequestOptions {
  /** 추가 헤더 */
  headers?: Record<string, string>;
  /** 요청 타임아웃 */
  timeout?: number;
  /** 재시도 횟수 */
  retries?: number;
  /** 캐시 사용 */
  cache?: boolean;
  /** Abort Signal */
  signal?: AbortSignal;
}

// -----------------------------------------------------------------------------
// 🎨 UI Types
// -----------------------------------------------------------------------------

/**
 * UI 설정
 */
export interface UIConfig {
  /** 기본 테마 */
  theme: Theme;
  /** 언어 */
  locale: string;
  /** 애니메이션 사용 */
  animations: boolean;
  /** 접근성 모드 */
  accessibility: boolean;
  /** 레이아웃 설정 */
  layout: LayoutConfig;
  /** 컴포넌트 설정 */
  components: ComponentConfig;
}

/**
 * 레이아웃 설정
 */
export interface LayoutConfig {
  /** 사이드바 너비 */
  sidebarWidth: number;
  /** 헤더 높이 */
  headerHeight: number;
  /** AI 사이드바 너비 */
  aiSidebarWidth: number;
  /** 반응형 브레이크포인트 */
  breakpoints: Record<string, number>;
}

/**
 * 컴포넌트 설정
 */
export interface ComponentConfig {
  /** 모달 설정 */
  modal: ModalConfig;
  /** 토스트 설정 */
  toast: ToastConfig;
  /** 로더 설정 */
  loader: LoaderConfig;
}

/**
 * 모달 설정
 */
export interface ModalConfig {
  /** 배경 클릭으로 닫기 */
  closeOnBackdrop: boolean;
  /** ESC 키로 닫기 */
  closeOnEscape: boolean;
  /** 포커스 트랩 */
  trapFocus: boolean;
}

/**
 * 토스트 설정
 */
export interface ToastConfig {
  /** 기본 표시 시간 (ms) */
  duration: number;
  /** 최대 토스트 수 */
  maxToasts: number;
  /** 위치 */
  position: ToastPosition;
}

/**
 * 토스트 위치
 */
export type ToastPosition = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * 로더 설정
 */
export interface LoaderConfig {
  /** 기본 타입 */
  type: LoaderType;
  /** 크기 */
  size: LoaderSize;
  /** 색상 */
  color: string;
}

/**
 * 로더 타입
 */
export type LoaderType = 'spinner' | 'dots' | 'pulse' | 'skeleton';

/**
 * 로더 크기
 */
export type LoaderSize = 'small' | 'medium' | 'large';

// -----------------------------------------------------------------------------
// 📝 Logging Types
// -----------------------------------------------------------------------------

/**
 * 로깅 설정
 */
export interface LoggingConfig {
  /** 로그 레벨 */
  level: LogLevel;
  /** 콘솔 출력 */
  console: boolean;
  /** 원격 로깅 */
  remote: boolean;
  /** 로그 포맷 */
  format: LogFormat;
  /** 필터 */
  filters: LogFilter[];
}

/**
 * 로그 레벨
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * 로그 포맷
 */
export type LogFormat = 'json' | 'text' | 'structured';

/**
 * 로그 필터
 */
export interface LogFilter {
  /** 필터 이름 */
  name: string;
  /** 필터 패턴 */
  pattern: string | RegExp;
  /** 제외 여부 */
  exclude: boolean;
}

// -----------------------------------------------------------------------------
// 🔧 Utility Types
// -----------------------------------------------------------------------------

/**
 * 깊은 부분 타입
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * 필수 속성 타입
 */
export type RequiredProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * 선택적 속성 타입
 */
export type OptionalProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 값 타입 추출
 */
export type ValueOf<T> = T[keyof T];

/**
 * 함수 매개변수 타입 추출
 */
export type Parameters<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * 함수 반환 타입 추출
 */
export type ReturnType<T extends (...args: any[]) => any> = T extends (...args: any[]) => infer R ? R : any;

/**
 * Promise 언랩 타입
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// -----------------------------------------------------------------------------
// 🎯 Type Summary & Documentation
// -----------------------------------------------------------------------------

/**
 * 🎯 Recursive UI Module Core Types
 * 
 * 이 모듈은 Recursive UI 시스템의 모든 핵심 타입 정의를 포함합니다.
 * 
 * 📋 주요 타입 카테고리:
 * - Component Types: UI 컴포넌트 관련 타입
 * - Service Types: 서비스 아키텍처 타입
 * - Configuration Types: 설정 관련 타입
 * - Event Types: 이벤트 시스템 타입
 * - WebSocket Types: 실시간 통신 타입
 * - MCP Types: Model Context Protocol 타입
 * - API Types: REST API 관련 타입
 * - UI Types: 사용자 인터페이스 타입
 * - Logging Types: 로깅 시스템 타입
 * - Utility Types: 유틸리티 및 헬퍼 타입
 * 
 * 🔧 사용법:
 * ```typescript
 * import type { Component, Service, Config } from '@/types';
 * import type { Message, Connection } from '@/types';
 * ```
 */ 