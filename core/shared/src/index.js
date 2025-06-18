/**
 * @recursive/shared
 * Shared utilities and configurations for Recursive platform
 */

// 유틸리티들
const Logger = require('./utils/Logger');

// 인터페이스들
const {
  AIAnalysisInterface,
  AnalysisResult,
  COMPLEXITY_LEVELS,
  ANALYSIS_TYPES,
  SUPPORTED_LANGUAGES
} = require('./interfaces/ai-analysis');

// 설정들
const websocketConfig = require('./config/websocket.config');

// Templates
const templates = require('./templates');

// 이벤트 버스 (모듈 간 통신용)
const EventEmitter = require('events');

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
    // 기본 설정들 로드
    this.configs.set('websocket', websocketConfig);
    this.configs.set('app', {
      name: 'Recursive Platform',
      version: '1.0.0',
      environment: utils.getEnv('NODE_ENV', 'development'),
      port: parseInt(utils.getEnv('PORT', '3000')),
      debug: utils.getEnv('DEBUG', 'false') === 'true'
    });
  }

  get(key, defaultValue = null) {
    return this.configs.get(key) || defaultValue;
  }

  set(key, value) {
    this.configs.set(key, value);
  }

  merge(key, value) {
    const existing = this.configs.get(key) || {};
    this.configs.set(key, utils.deepMerge({}, existing, value));
  }

  getAll() {
    return Object.fromEntries(this.configs);
  }
}

// 글로벌 설정 관리자 인스턴스
const globalConfig = new ConfigManager();

// Import clients
const LLMClient = require('./clients/llm-client');

// 메인 exports
module.exports = {
  // 클래스들
  Logger,
  RecursiveEventBus,
  ConfigManager,
  
  // 인터페이스들
  AIAnalysisInterface,
  AnalysisResult,
  
  // 상수들
  COMPLEXITY_LEVELS,
  ANALYSIS_TYPES,
  SUPPORTED_LANGUAGES,
  
  // 유틸리티들
  utils,
  
  // Templates
  templates,
  
  // Clients
  clients: {
    LLMClient
  },
  
  // 글로벌 인스턴스들
  eventBus: globalEventBus,
  config: globalConfig,
  
  // 팩토리 함수들
  createEventBus: () => new RecursiveEventBus(),
  createConfigManager: () => new ConfigManager(),
  createLogger: (options) => new Logger(options)
}; 