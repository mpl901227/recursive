/**
 * @recursive/shared
 * Shared utilities and configurations for Recursive platform
 */

// 유틸리티들
const Logger = require('./utils/Logger');

// 클라이언트들
const LLMClient = require('./clients/llm-client');

// AI 분석 인터페이스는 제거됨 - 직접 구현체 사용

// 설정들
const websocketConfig = require('./config/websocket.config');

// Templates
const templates = require('./templates');

// 이벤트 버스 (모듈 간 통신용)
const EventEmitter = require('events');

// Log System Integration
let logSystemModule = null;
try {
  const path = require('path');
  const logSystemPath = path.resolve(__dirname, '../../../modules/log-system/src/index');
  logSystemModule = require(logSystemPath);
} catch (error) {
  console.warn('Log system module not available:', error.message);
}

class RecursiveEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // 많은 모듈이 연결될 수 있음
    this.modules = new Map();
  }

  // 모듈 등록
  registerModule(name, module) {
    this.modules.set(name, module);
    this.emit('module:registered', { name, module });
    console.log(`📦 Module registered: ${name}`);
  }

  // 모듈 해제
  unregisterModule(name) {
    const module = this.modules.get(name);
    if (module) {
      this.modules.delete(name);
      this.emit('module:unregistered', { name, module });
      console.log(`📦 Module unregistered: ${name}`);
    }
  }

  // 등록된 모듈 목록
  getRegisteredModules() {
    return Array.from(this.modules.keys());
  }

  // 모듈 간 메시지 전송
  sendToModule(targetModule, event, data) {
    if (this.modules.has(targetModule)) {
      this.emit(`module:${targetModule}:${event}`, data);
    } else {
      console.warn(`⚠️ Module ${targetModule} not found`);
    }
  }

  // 브로드캐스트 (모든 모듈에게)
  broadcast(event, data) {
    this.modules.forEach((module, name) => {
      this.emit(`module:${name}:${event}`, data);
    });
  }
}

// 글로벌 이벤트 버스 인스턴스
const globalEventBus = new RecursiveEventBus();

// 공통 유틸리티 함수들
const utils = {
  /**
   * 안전한 JSON 파싱
   * @param {string} jsonString - JSON 문자열
   * @param {*} defaultValue - 파싱 실패 시 기본값
   * @returns {*} 파싱된 객체 또는 기본값
   */
  safeJsonParse: (jsonString, defaultValue = null) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return defaultValue;
    }
  },

  /**
   * 딥 클론
   * @param {*} obj - 복사할 객체
   * @returns {*} 복사된 객체
   */
  deepClone: (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => utils.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = utils.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  },

  /**
   * 지연 실행
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise<void>}
   */
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * 재시도 로직
   * @param {Function} fn - 실행할 함수
   * @param {number} maxRetries - 최대 재시도 횟수
   * @param {number} delayMs - 재시도 간격
   * @returns {Promise<*>}
   */
  retry: async (fn, maxRetries = 3, delayMs = 1000) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          await utils.delay(delayMs * Math.pow(2, i)); // 지수 백오프
        }
      }
    }
    throw lastError;
  },

  /**
   * 객체 병합 (깊은 병합)
   * @param {Object} target - 대상 객체
   * @param {...Object} sources - 소스 객체들
   * @returns {Object} 병합된 객체
   */
  deepMerge: (target, ...sources) => {
    if (!sources.length) return target;
    const source = sources.shift();

    if (utils.isObject(target) && utils.isObject(source)) {
      for (const key in source) {
        if (utils.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          utils.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return utils.deepMerge(target, ...sources);
  },

  /**
   * 객체 여부 확인
   * @param {*} item - 확인할 항목
   * @returns {boolean}
   */
  isObject: (item) => {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  /**
   * UUID 생성 (간단한 버전)
   * @returns {string} UUID
   */
  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * 환경 변수 가져오기 (기본값 포함)
   * @param {string} key - 환경 변수 키
   * @param {*} defaultValue - 기본값
   * @returns {*} 환경 변수 값 또는 기본값
   */
  getEnv: (key, defaultValue = null) => {
    return process.env[key] || defaultValue;
  }
};

// 설정 관리자
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.loadDefaultConfigs();
  }

  loadDefaultConfigs() {
    // WebSocket 설정 로드
    this.set('websocket', websocketConfig);
  }

  get(key, defaultValue = null) {
    return this.configs.get(key) || defaultValue;
  }

  set(key, value) {
    this.configs.set(key, value);
  }

  merge(key, value) {
    const existing = this.get(key, {});
    this.set(key, utils.deepMerge(existing, value));
  }

  getAll() {
    return Object.fromEntries(this.configs);
  }
}

// 글로벌 설정 관리자 인스턴스
const globalConfigManager = new ConfigManager();

// Log System Integration (Phase 5.2)
const LogSystem = {
  // Core functions from log system module
  getLogSystem: logSystemModule ? logSystemModule.getLogSystem : () => null,
  createLogSystem: logSystemModule ? logSystemModule.createLogSystem : () => null,
  initializeLogSystem: logSystemModule ? logSystemModule.initializeLogSystem : () => Promise.resolve(null),
  
  /**
   * 빠른 로그 전송 편의 함수
   * @param {string} level - 로그 레벨 (INFO, WARN, ERROR, DEBUG)
   * @param {string} message - 로그 메시지
   * @param {Object} metadata - 추가 메타데이터
   * @returns {Promise<Object>} 로그 전송 결과
   */
  async logInfo(message, metadata = {}) {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return await logSystem.log({
        source: 'recursive_shared',
        level: 'INFO',
        message,
        metadata: {
          component: 'shared',
          ...metadata
        },
        tags: ['shared', 'info']
      });
    } catch (error) {
      console.warn('Failed to send log:', error.message);
      return null;
    }
  },

  async logWarn(message, metadata = {}) {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return await logSystem.log({
        source: 'recursive_shared',
        level: 'WARN',
        message,
        metadata: {
          component: 'shared',
          ...metadata
        },
        tags: ['shared', 'warning']
      });
    } catch (error) {
      console.warn('Failed to send log:', error.message);
      return null;
    }
  },

  async logDebug(message, metadata = {}) {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return await logSystem.log({
        source: 'recursive_shared',
        level: 'DEBUG',
        message,
        metadata: {
          component: 'shared',
          ...metadata
        },
        tags: ['shared', 'debug']
      });
    } catch (error) {
      console.warn('Failed to send log:', error.message);
      return null;
    }
  },

  async logServerEvent(event, data = {}) {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return await logSystem.log({
        source: 'recursive_server_events',
        level: 'INFO',
        message: `Server event: ${event}`,
        metadata: {
          component: 'server',
          event,
          ...data
        },
        tags: ['server', 'event', event]
      });
    } catch (error) {
      console.warn('Failed to send log:', error.message);
      return null;
    }
  },

  /**
   * 에러 로깅 편의 함수
   * @param {Error} error - 에러 객체
   * @param {Object} context - 추가 컨텍스트 정보
   * @returns {Promise<Object>} 로그 전송 결과
   */
  async logError(error, context = {}) {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return await logSystem.log({
        source: 'recursive_error',
        level: 'ERROR',
        message: error.message || 'Unknown error',
        metadata: {
          component: 'shared',
          error_name: error.name,
          error_stack: error.stack,
          error_code: error.code,
          ...context
        },
        tags: ['error', 'exception', 'shared']
      });
    } catch (logError) {
      console.warn('Failed to send error log:', logError.message);
      return null;
    }
  },

  /**
   * 로그 시스템 상태 확인
   * @returns {Object|null} 로그 시스템 상태
   */
  getSystemStatus() {
    if (!logSystemModule) return null;
    try {
      const logSystem = logSystemModule.getLogSystem();
      if (!logSystem) return null;
      
      return logSystem.getSystemStatus();
    } catch (error) {
      console.warn('Failed to get log system status:', error.message);
      return null;
    }
  }
};

// 메인 exports
module.exports = {
  // Core utilities
  Logger,
  
  // Clients
  clients: {
    LLMClient
  },
  
  // AI Analysis interfaces - 제거됨 (직접 구현체 사용)
  
  // Configuration
  config: globalConfigManager,
  websocketConfig,
  
  // Templates
  templates,
  
  // Event system
  eventBus: globalEventBus,
  
  // Common utilities
  utils,
  
  // Log System (Phase 5.2 Integration)
  LogSystem
}; 