/**
 * 로그 시스템 메인 엔트리 포인트
 * LOG_SYSTEM_INTEGRATION_PLAN.md Phase 2.6 구현
 * ConfigManager 통합 및 설정 기반 초기화 지원
 */

const LogSystemBridge = require('./log-system-bridge');
const JSONRPCClient = require('./utils/json-rpc-client');
const { getConfigManager, loadConfig: loadConfigFile } = require('./utils/config-manager');
const fs = require('fs');
const path = require('path');

/**
 * 설정 로드 (ConfigManager 통합)
 * @param {Object} options - 로드 옵션
 * @returns {Object} 로드된 설정
 */
async function loadConfig(options = {}) {
  const {
    configPath,
    environment = process.env.NODE_ENV || 'development',
    watchForChanges = false,
    validateSchema = true,
    mergeWithDefaults = true
  } = options;

  try {
    // ConfigManager를 통해 설정 로드
    const config = await loadConfigFile({
      configPath,
      environment,
      watchForChanges,
      validateSchema
    });

    // 기본 설정과 병합 (필요시)
    if (mergeWithDefaults) {
      const defaultConfig = getDefaultConfig();
      return deepMerge(defaultConfig, config);
    }

    return config;

  } catch (error) {
    console.warn(`Failed to load configuration: ${error.message}`);
    return getDefaultConfig();
  }
}

/**
 * 기본 설정 반환
 * @returns {Object} 기본 설정
 */
function getDefaultConfig() {
  return {
    project_name: 'recursive-platform',
    project_type: 'webapp',
    environment: 'development',
    server: {
      host: 'localhost',
      port: 8888,
      auto_start: true,
      auto_restart: true,
      max_restart_attempts: 5,
      restart_delay: 2000,
      startup_timeout: 30000,
      shutdown_timeout: 10000,
      python_path: 'python',
      verbose: false,
      debug: false
    },
    storage: {
      db_path: './logs/recursive_logs.db',
      max_size_mb: 1000,
      max_days: 30,
      compression_enabled: true,
      backup_enabled: true
    },
    collectors: {
      recursive_mcp: { enabled: true },
      recursive_websocket: { enabled: true },
      recursive_ai: { enabled: true },
      recursive_http: { enabled: true }
    },
    logging: {
      default_level: 'INFO'
    },
    alerts: {
      enabled: true
    }
  };
}

/**
 * 깊은 객체 병합 유틸리티
 * @param {Object} target - 대상 객체
 * @param {Object} source - 소스 객체
 * @returns {Object} 병합된 객체
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (isObject(source[key]) && isObject(result[key])) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

/**
 * 객체 타입 확인
 * @param {*} item - 확인할 아이템
 * @returns {boolean} 객체 여부
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// 전역 인스턴스 관리
let globalLogSystem = null;
let globalConfig = null;

/**
 * LogSystemBridge 팩토리 함수
 * @param {Object} config - 설정 객체
 * @returns {LogSystemBridge} 로그 시스템 브릿지 인스턴스
 */
function createLogSystem(config = {}) {
  return new LogSystemBridge(config);
}

/**
 * 전역 LogSystemBridge 인스턴스 반환 (싱글톤)
 * @param {Object} options - 초기화 옵션
 * @returns {LogSystemBridge} 전역 로그 시스템 인스턴스
 */
function getLogSystem(options = {}) {
  if (!globalLogSystem) {
    // 설정이 로드되지 않았으면 기본 설정 사용
    const config = globalConfig || getDefaultConfig();
    const bridgeConfig = {
      ...config.server,
      configPath: options.configPath,
      dbPath: config.storage?.db_path
    };
    
    globalLogSystem = new LogSystemBridge(bridgeConfig);
  }
  return globalLogSystem;
}

/**
 * 로그 시스템 초기화 (설정 로드 포함)
 * @param {Object} options - 초기화 옵션
 * @returns {Promise<LogSystemBridge>} 초기화된 로그 시스템
 */
async function initializeLogSystem(options = {}) {
  try {
    // 1. 설정 로드
    globalConfig = await loadConfig(options);
    
    // 2. 로그 시스템 생성
    const bridgeConfig = {
      ...globalConfig.server,
      configPath: options.configPath,
      dbPath: globalConfig.storage?.db_path
    };
    
    globalLogSystem = new LogSystemBridge(bridgeConfig);
    
    // 3. 설정 로드 (ConfigManager 통합)
    await globalLogSystem.loadConfiguration({
      environment: options.environment,
      watchForChanges: options.watchForChanges
    });
    
    // 4. 시작
    await globalLogSystem.start();
    
    console.log(`✅ Log System initialized with environment: ${globalConfig.environment}`);
    
    return globalLogSystem;
    
  } catch (error) {
    console.error(`❌ Failed to initialize log system: ${error.message}`);
    throw error;
  }
}

/**
 * 설정 기반 로그 시스템 생성
 * @param {string|Object} configPathOrObject - 설정 파일 경로 또는 설정 객체
 * @param {Object} options - 추가 옵션
 * @returns {Promise<LogSystemBridge>} 설정된 로그 시스템
 */
async function createLogSystemFromConfig(configPathOrObject, options = {}) {
  let config;
  
  if (typeof configPathOrObject === 'string') {
    // 파일 경로인 경우
    config = await loadConfig({
      configPath: configPathOrObject,
      ...options
    });
  } else {
    // 설정 객체인 경우
    config = configPathOrObject;
  }
  
  const bridgeConfig = {
    ...config.server,
    dbPath: config.storage?.db_path,
    ...options
  };
  
  const logSystem = new LogSystemBridge(bridgeConfig);
  
  if (options.autoStart !== false) {
    await logSystem.start();
  }
  
  return logSystem;
}

/**
 * 현재 설정 반환
 * @returns {Object} 현재 로드된 설정
 */
function getCurrentConfig() {
  return globalConfig ? { ...globalConfig } : getDefaultConfig();
}

/**
 * 설정 관리자 반환
 * @returns {ConfigManager} 설정 관리자 인스턴스
 */
function getConfigManagerInstance() {
  return getConfigManager();
}

/**
 * 편의 함수: 빠른 로그 수집
 * @param {string} level - 로그 레벨
 * @param {string} message - 메시지
 * @param {Object} metadata - 메타데이터
 * @returns {Promise} 로그 수집 결과
 */
async function quickLog(level, message, metadata = {}) {
  const logSystem = getLogSystem();
  
  if (!logSystem.isReady) {
    console.warn('Log system not ready, falling back to console');
    console.log(`[${level}] ${message}`, metadata);
    return;
  }
  
  return await logSystem.log({
    source: 'recursive_quick',
    level: level.toUpperCase(),
    message,
    metadata,
    tags: ['quick_log'],
    timestamp: Date.now()
  });
}

/**
 * 편의 함수: 에러 로깅
 * @param {Error} error - 에러 객체
 * @param {Object} context - 추가 컨텍스트
 * @returns {Promise} 로그 수집 결과
 */
async function logError(error, context = {}) {
  const logSystem = getLogSystem();
  
  if (!logSystem.isReady) {
    console.error('Log system not ready, falling back to console');
    console.error(error, context);
    return;
  }
  
  return await logSystem.log({
    source: 'recursive_error',
    level: 'ERROR',
    message: error.message,
    metadata: {
      stack: error.stack,
      name: error.name,
      code: error.code,
      ...context
    },
    tags: ['error', 'exception'],
    timestamp: Date.now()
  });
}

/**
 * 로그 시스템 상태 확인
 * @returns {Object} 상태 정보
 */
function getSystemStatus() {
  const logSystem = globalLogSystem;
  const config = globalConfig;
  const configManager = getConfigManagerInstance();
  
  return {
    initialized: !!logSystem,
    ready: logSystem?.isReady || false,
    config_loaded: !!config,
    environment: config?.environment || 'unknown',
    server: {
      host: config?.server?.host || 'unknown',
      port: config?.server?.port || 'unknown',
      auto_start: config?.server?.auto_start || false
    },
    storage: {
      db_path: config?.storage?.db_path || 'unknown',
      max_size_mb: config?.storage?.max_size_mb || 'unknown'
    },
    config_manager: {
      environment: configManager.getEnvironmentInfo()
    }
  };
}

// 메인 exports
module.exports = {
  // 클래스들
  LogSystemBridge,
  JSONRPCClient,
  
  // 설정 관리
  loadConfig,
  getDefaultConfig,
  getCurrentConfig,
  getConfigManagerInstance,
  
  // 팩토리 함수들
  createLogSystem,
  createLogSystemFromConfig,
  
  // 전역 인스턴스 관리
  getLogSystem,
  initializeLogSystem,
  
  // 편의 함수들
  quickLog,
  logError,
  getSystemStatus,
  
  // 유틸리티
  deepMerge,
  isObject
}; 