// =============================================================================
// ⚙️ Recursive UI Module - Configuration Management System
// =============================================================================

import type {
  Config,
  AppConfig,
  WebSocketConfig,
  MCPConfig,
  APIConfig,
  UIConfig,
  LoggingConfig,
  Environment,
  DeepPartial
} from '../types/index';

import type { LogSystemConfig } from '../types/log-system';

// -----------------------------------------------------------------------------
// 🏗️ Default Configuration Values
// -----------------------------------------------------------------------------

/**
 * 기본 애플리케이션 설정
 */
const DEFAULT_APP_CONFIG: AppConfig = {
  name: 'Recursive UI',
  version: '2.0.0',
  environment: 'development',
  debug: true,
  locale: 'ko',
  theme: 'auto'
};

/**
 * 기본 WebSocket 설정
 */
const DEFAULT_WEBSOCKET_CONFIG: WebSocketConfig = {
  enabled: true,
  autoStart: true,
  retryCount: 3,
  timeout: 10000,
  url: 'ws://localhost:3000/ws',
  protocols: ['recursive-protocol'],
  heartbeatInterval: 30000,
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  messageQueue: {
    maxSize: 1000,
    usePriority: true,
    messageTTL: 60000
  }
};

/**
 * 기본 MCP 설정
 */
const DEFAULT_MCP_CONFIG: MCPConfig = {
  enabled: true,
  autoStart: true,
  retryCount: 3,
  timeout: 15000,
  serverUrl: 'http://localhost:3000/mcp',
  clientId: 'recursive-ui-client',
  requestQueue: {
    maxConcurrent: 10,
    requestInterval: 100,
    batchSize: 5,
    usePriority: true
  },
  tools: {
    autoLoad: true,
    toolTimeout: 30000
  }
};

/**
 * 기본 API 설정
 */
const DEFAULT_API_CONFIG: APIConfig = {
  enabled: true,
  autoStart: true,
  retryCount: 3,
  timeout: 10000,
  baseURL: 'http://localhost:3000/api',
  version: 'v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  interceptors: {
    useRequestInterceptor: true,
    useResponseInterceptor: true,
    useErrorInterceptor: true
  }
};

/**
 * 기본 UI 설정
 */
const DEFAULT_UI_CONFIG: UIConfig = {
  theme: 'auto',
  locale: 'ko',
  animations: true,
  accessibility: true,
  layout: {
    sidebarWidth: 280,
    headerHeight: 60,
    aiSidebarWidth: 320,
    breakpoints: {
      mobile: 768,
      tablet: 1024,
      desktop: 1440
    }
  },
  components: {
    modal: {
      closeOnBackdrop: true,
      closeOnEscape: true,
      trapFocus: true
    },
    toast: {
      duration: 4000,
      maxToasts: 5,
      position: 'top-right'
    },
    loader: {
      type: 'spinner',
      size: 'medium',
      color: '#007bff'
    }
  }
};

/**
 * 기본 로깅 설정
 */
const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  console: true,
  remote: false,
  format: 'structured',
  filters: [
    {
      name: 'debug-filter',
      pattern: /DEBUG:/,
      exclude: false
    }
  ]
};

/**
 * 기본 로그 시스템 설정
 */
const DEFAULT_LOG_SYSTEM_CONFIG: LogSystemConfig = {
  enabled: true,
  autoStart: true,
  retryCount: 3,
  timeout: 10000,
  bridgeEndpoint: 'http://localhost:8888',
  autoConnect: true,
  retryAttempts: 5,
  bufferSize: 1000,
  realTimeEnabled: true,
  websocket: {
    url: 'ws://localhost:8888/ws',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },
  cache: {
    enabled: true,
    ttl: 300000,
    maxSize: 1000
  }
};

/**
 * 기본 전체 설정
 */
const DEFAULT_CONFIG: Config = {
  app: DEFAULT_APP_CONFIG,
  websocket: DEFAULT_WEBSOCKET_CONFIG,
  mcp: DEFAULT_MCP_CONFIG,
  api: DEFAULT_API_CONFIG,
  ui: DEFAULT_UI_CONFIG,
  logging: DEFAULT_LOGGING_CONFIG,
  logSystem: DEFAULT_LOG_SYSTEM_CONFIG
};

// -----------------------------------------------------------------------------
// 🔧 Configuration Manager Class
// -----------------------------------------------------------------------------

/**
 * 설정 관리자 클래스
 * 애플리케이션의 모든 설정을 중앙에서 관리
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private config: Config;
  private listeners: Map<string, Set<(config: Config) => void>> = new Map();

  /**
   * ConfigManager 생성자
   */
  private constructor(initialConfig?: DeepPartial<Config>) {
    this.config = this.mergeConfigs(DEFAULT_CONFIG, initialConfig || {});
  }

  /**
   * ConfigManager 싱글톤 인스턴스 반환
   */
  static getInstance(initialConfig?: DeepPartial<Config>): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(initialConfig);
    }
    return ConfigManager.instance;
  }

  /**
   * 전체 설정 반환
   */
  getConfig(): Config {
    return this.deepClone(this.config);
  }

  /**
   * 애플리케이션 설정 반환
   */
  getAppConfig(): AppConfig {
    return this.deepClone(this.config.app);
  }

  /**
   * WebSocket 설정 반환
   */
  getWebSocketConfig(): WebSocketConfig {
    return this.deepClone(this.config.websocket);
  }

  /**
   * MCP 설정 반환
   */
  getMCPConfig(): MCPConfig {
    return this.deepClone(this.config.mcp);
  }

  /**
   * API 설정 반환
   */
  getAPIConfig(): APIConfig {
    return this.deepClone(this.config.api);
  }

  /**
   * UI 설정 반환
   */
  getUIConfig(): UIConfig {
    return this.deepClone(this.config.ui);
  }

  /**
   * 로깅 설정 반환
   */
  getLoggingConfig(): LoggingConfig {
    return this.deepClone(this.config.logging);
  }

  /**
   * 로그 시스템 설정 반환
   */
  getLogSystemConfig(): LogSystemConfig | undefined {
    return this.config.logSystem ? this.deepClone(this.config.logSystem) : undefined;
  }

  /**
   * 특정 설정 값 반환
   */
  get<T = any>(path: string): T | undefined {
    return this.getValueByPath(this.config, path);
  }

  /**
   * 설정 업데이트
   */
  updateConfig(updates: DeepPartial<Config>): void {
    const oldConfig = this.deepClone(this.config);
    this.config = this.mergeConfigs(this.config, updates);
    
    // 리스너들에게 변경 알림
    this.notifyListeners(oldConfig, this.config);
  }

  /**
   * 특정 경로의 설정 값 업데이트
   */
  set(path: string, value: any): void {
    const updates = this.createNestedObject(path, value);
    this.updateConfig(updates);
  }

  /**
   * 설정 변경 리스너 등록
   */
  onChange(callback: (config: Config) => void): () => void {
    if (!this.listeners.has('config-change')) {
      this.listeners.set('config-change', new Set());
    }
    
    const wrappedCallback = (config: Config) => {
      try {
        callback(config);
      } catch (error) {
        console.error('Error in config change listener:', error);
      }
    };
    
    this.listeners.get('config-change')!.add(wrappedCallback);
    
    // 제거 함수 반환
    return () => {
      this.listeners.get('config-change')?.delete(wrappedCallback);
    };
  }

  /**
   * 설정을 로컬 스토리지에 저장
   */
  saveToStorage(): void {
    try {
      const configToSave = this.deepClone(this.config);
      localStorage.setItem('recursive-ui-config', JSON.stringify(configToSave));
    } catch (error) {
      console.warn('Failed to save config to localStorage:', error);
    }
  }

  /**
   * 로컬 스토리지에서 설정 로드
   */
  loadFromStorage(): boolean {
    try {
      const saved = localStorage.getItem('recursive-ui-config');
      if (saved) {
        const savedConfig = JSON.parse(saved) as DeepPartial<Config>;
        this.updateConfig(savedConfig);
        return true;
      }
    } catch (error) {
      console.warn('Failed to load config from localStorage:', error);
    }
    return false;
  }

  /**
   * 설정을 기본값으로 리셋
   */
  reset(): void {
    const oldConfig = this.deepClone(this.config);
    this.config = this.deepClone(DEFAULT_CONFIG);
    this.notifyListeners(oldConfig, this.config);
  }

  /**
   * 현재 환경 반환
   */
  getEnvironment(): Environment {
    return this.config.app.environment;
  }

  /**
   * 환경 변경
   */
  setEnvironment(environment: Environment): void {
    if (this.config.app.environment !== environment) {
      this.updateConfig({
        app: {
          environment,
          debug: environment === 'development'
        }
      });
    }
  }

  // -----------------------------------------------------------------------------
  // 🔧 Private Helper Methods
  // -----------------------------------------------------------------------------

  /**
   * 깊은 객체 병합
   */
  private mergeConfigs<T extends Record<string, any>>(target: T, source: DeepPartial<T>): T {
    const result = this.deepClone(target);
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = result[key];
        
        if (sourceValue !== undefined) {
          if (this.isObject(sourceValue) && this.isObject(targetValue)) {
            result[key] = this.mergeConfigs(targetValue, sourceValue);
          } else {
            result[key] = sourceValue as T[Extract<keyof T, string>];
          }
        }
      }
    }
    
    return result;
  }

  /**
   * 깊은 복사
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    
    if (typeof obj === 'object') {
      const cloned = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    
    return obj;
  }

  /**
   * 경로로 값 가져오기
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 중첩 객체 생성
   */
  private createNestedObject(path: string, value: any): any {
    const keys = path.split('.');
    const result: any = {};
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key) {
        current[key] = {};
        current = current[key];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
    return result;
  }

  /**
   * 객체 타입 확인
   */
  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * 리스너들에게 변경 알림
   */
  private notifyListeners(_oldConfig: Config, newConfig: Config): void {
    const listeners = this.listeners.get('config-change');
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(newConfig);
        } catch (error) {
          console.error('Error in config change listener:', error);
        }
      });
    }
  }
}

// -----------------------------------------------------------------------------
// 🎯 Utility Functions
// -----------------------------------------------------------------------------

/**
 * 환경 변수에서 설정 로드
 */
export function loadConfigFromEnvironment(): DeepPartial<Config> {
  const config: DeepPartial<Config> = {};

  // 개발 환경에서만 환경 변수 로드 (브라우저에서는 제한적)
  try {
    const app: DeepPartial<AppConfig> = {};
    
    // 기본 환경 설정
    app.environment = 'development';
    
    if (Object.keys(app).length > 0) {
      config.app = app;
    }

    // 기본 WebSocket 설정
    config.websocket = {
      url: 'ws://localhost:3000/ws'
    };

    // 기본 API 설정
    config.api = {
      baseURL: 'http://localhost:3000/api'
    };
  } catch (error) {
    console.warn('Failed to load environment config:', error);
  }

  return config;
}

/**
 * 브라우저 기본 설정 감지
 */
export function detectBrowserDefaults(): DeepPartial<UIConfig> {
  if (typeof window === 'undefined') {
    return {};
  }

  const config: DeepPartial<UIConfig> = {};

  // 다크 모드 감지
  if (window.matchMedia) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    config.theme = prefersDark ? 'dark' : 'light';
  }

  // 언어 감지
  const language = navigator.language || 'en';
  if (language.startsWith('ko')) {
    config.locale = 'ko';
  } else if (language.startsWith('en')) {
    config.locale = 'en';
  }

  // 애니메이션 선호도 감지
  if (window.matchMedia) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    config.animations = !prefersReducedMotion;
  }

  return config;
}

// -----------------------------------------------------------------------------
// 🎯 Exports
// -----------------------------------------------------------------------------

// 기본 설정 내보내기
export {
  DEFAULT_CONFIG,
  DEFAULT_APP_CONFIG,
  DEFAULT_WEBSOCKET_CONFIG,
  DEFAULT_MCP_CONFIG,
  DEFAULT_API_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_LOGGING_CONFIG
};

// 싱글톤 인스턴스 생성 및 내보내기
export const config = ConfigManager.getInstance();

// 타입 재내보내기
export type {
  Config,
  AppConfig,
  Environment
} from '@/types'; 