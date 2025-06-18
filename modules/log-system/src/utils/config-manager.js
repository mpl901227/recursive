/**
 * 로그 시스템 설정 관리자
 * YAML 설정 로드, 병합, 환경별 오버라이드 지원
 * LOG_SYSTEM_INTEGRATION_PLAN.md Phase 2.5 구현
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
  constructor() {
    super();
    this.config = {};
    this.configPaths = [];
    this.environment = process.env.NODE_ENV || 'development';
    this.watchedFiles = new Set();
    this.watchers = new Map();
  }

  /**
   * 설정 로드 및 병합
   * @param {Object} options - 로드 옵션
   * @returns {Object} 병합된 설정
   */
  async loadConfig(options = {}) {
    const {
      configPath,
      environment = this.environment,
      watchForChanges = false,
      validateSchema = true
    } = options;

    try {
      // 기본 설정 경로들 정의
      const basePaths = this.getConfigPaths(configPath);
      
      // 설정 파일들 순서대로 로드 및 병합
      let mergedConfig = {};
      
      for (const configFile of basePaths) {
        if (fs.existsSync(configFile)) {
          const fileConfig = await this.loadConfigFile(configFile);
          mergedConfig = this.deepMerge(mergedConfig, fileConfig);
          this.configPaths.push(configFile);
          
          if (watchForChanges) {
            this.watchConfigFile(configFile);
          }
        }
      }
      
      // 환경별 오버라이드 적용
      if (mergedConfig[environment]) {
        mergedConfig = this.deepMerge(mergedConfig, mergedConfig[environment]);
        delete mergedConfig[environment]; // 환경 섹션 제거
      }
      
      // 환경 변수 치환
      mergedConfig = this.substituteEnvironmentVariables(mergedConfig);
      
      // 스키마 검증
      if (validateSchema) {
        this.validateConfig(mergedConfig);
      }
      
      this.config = mergedConfig;
      this.environment = environment;
      
      this.emit('config:loaded', {
        config: this.config,
        environment: this.environment,
        paths: this.configPaths
      });
      
      return this.config;
      
    } catch (error) {
      this.emit('config:error', error);
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * 설정 파일 경로들 생성
   * @param {string} customPath - 사용자 지정 경로
   * @returns {Array} 설정 파일 경로 배열
   */
  getConfigPaths(customPath) {
    const configDir = path.join(__dirname, '../../config');
    const paths = [];
    
    // 테스트 환경에서는 기본 설정 파일들을 로드하지 않음
    if (this.environment !== 'test') {
      // 1. 기본 설정 (가장 낮은 우선순위)
      paths.push(path.join(configDir, 'default.yaml'));
      
      // 2. Recursive 특화 설정
      paths.push(path.join(configDir, 'recursive.yaml'));
      
      // 3. 환경별 설정
      if (this.environment !== 'development') {
        paths.push(path.join(configDir, `${this.environment}.yaml`));
      }
      
      // 4. 로컬 설정 (git ignore)
      paths.push(path.join(configDir, 'local.yaml'));
    }
    
    // 5. 사용자 지정 설정 (가장 높은 우선순위)
    if (customPath) {
      if (path.isAbsolute(customPath)) {
        paths.push(customPath);
      } else {
        paths.push(path.resolve(customPath));
      }
    }
    
    return paths;
  }

  /**
   * 개별 설정 파일 로드
   * @param {string} filePath - 파일 경로
   * @returns {Object} 파싱된 설정 객체
   */
  async loadConfigFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const config = yaml.load(content);
      
      this.emit('config:file_loaded', {
        path: filePath,
        config: config
      });
      
      return config || {};
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load config file ${filePath}: ${error.message}`);
      }
      return {};
    }
  }

  /**
   * 깊은 객체 병합
   * @param {Object} target - 대상 객체
   * @param {Object} source - 소스 객체
   * @returns {Object} 병합된 객체
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this.isObject(source[key]) && this.isObject(result[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
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
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 환경 변수 치환
   * @param {Object} config - 설정 객체
   * @returns {Object} 치환된 설정 객체
   */
  substituteEnvironmentVariables(config) {
    const substitute = (obj) => {
      if (typeof obj === 'string') {
        return obj.replace(/\${([^}]+)}/g, (match, envVar) => {
          const [varName, defaultValue] = envVar.split(':-');
          return process.env[varName] || defaultValue || match;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(substitute);
      } else if (this.isObject(obj)) {
        const result = {};
        for (const key in obj) {
          result[key] = substitute(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    return substitute(config);
  }

  /**
   * 설정 스키마 검증
   * @param {Object} config - 검증할 설정
   */
  validateConfig(config) {
    const errors = [];
    
    // 필수 필드 검증
    const requiredFields = [
      'project_name',
      'server.host',
      'server.port',
      'storage.db_path'
    ];
    
    for (const field of requiredFields) {
      if (!this.getNestedValue(config, field)) {
        errors.push(`Required field missing: ${field}`);
      }
    }
    
    // 타입 검증
    const typeValidations = {
      'server.port': 'number',
      'server.auto_start': 'boolean',
      'storage.max_size_mb': 'number',
      'storage.max_days': 'number'
    };
    
    for (const [field, expectedType] of Object.entries(typeValidations)) {
      const value = this.getNestedValue(config, field);
      if (value !== undefined && typeof value !== expectedType) {
        errors.push(`Field ${field} should be of type ${expectedType}, got ${typeof value}`);
      }
    }
    
    // 범위 검증
    const rangeValidations = {
      'server.port': [1, 65535],
      'storage.max_size_mb': [1, 100000],
      'storage.max_days': [1, 3650]
    };
    
    for (const [field, [min, max]] of Object.entries(rangeValidations)) {
      const value = this.getNestedValue(config, field);
      if (typeof value === 'number' && (value < min || value > max)) {
        errors.push(`Field ${field} should be between ${min} and ${max}, got ${value}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * 중첩된 객체 값 가져오기
   * @param {Object} obj - 객체
   * @param {string} path - 점으로 구분된 경로
   * @returns {*} 값
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 설정 파일 변경 감지
   * @param {string} filePath - 감시할 파일 경로
   */
  watchConfigFile(filePath) {
    if (this.watchedFiles.has(filePath)) {
      return;
    }
    
    try {
      const watcher = fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          this.emit('config:file_changed', {
            path: filePath,
            timestamp: curr.mtime
          });
          
          // 설정 자동 재로드
          this.reloadConfig().catch(error => {
            this.emit('config:reload_error', error);
          });
        }
      });
      
      this.watchers.set(filePath, watcher);
      this.watchedFiles.add(filePath);
      
    } catch (error) {
      this.emit('config:watch_error', { path: filePath, error });
    }
  }

  /**
   * 설정 재로드
   */
  async reloadConfig() {
    try {
      const oldConfig = { ...this.config };
      await this.loadConfig({
        environment: this.environment,
        watchForChanges: false,
        validateSchema: true
      });
      
      this.emit('config:reloaded', {
        oldConfig,
        newConfig: this.config,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.emit('config:reload_error', error);
      throw error;
    }
  }

  /**
   * 특정 설정 값 가져오기
   * @param {string} path - 설정 경로
   * @param {*} defaultValue - 기본값
   * @returns {*} 설정 값
   */
  get(path, defaultValue = undefined) {
    return this.getNestedValue(this.config, path) ?? defaultValue;
  }

  /**
   * 설정 값 설정 (런타임)
   * @param {string} path - 설정 경로
   * @param {*} value - 설정할 값
   */
  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || !this.isObject(current[keys[i]])) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    this.emit('config:value_changed', {
      path,
      value,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 현재 설정 반환
   * @returns {Object} 현재 설정
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 환경 정보 반환
   * @returns {Object} 환경 정보
   */
  getEnvironmentInfo() {
    return {
      environment: this.environment,
      configPaths: [...this.configPaths],
      watchedFiles: [...this.watchedFiles],
      nodeEnv: process.env.NODE_ENV,
      loadedAt: new Date().toISOString()
    };
  }

  /**
   * 감시 중지
   */
  stopWatching() {
    for (const [filePath, watcher] of this.watchers) {
      fs.unwatchFile(filePath);
    }
    
    this.watchers.clear();
    this.watchedFiles.clear();
    
    this.emit('config:watch_stopped');
  }

  /**
   * 설정을 JSON 스키마로 내보내기
   * @returns {Object} JSON 스키마
   */
  exportSchema() {
    const generateSchema = (obj, path = '') => {
      const schema = {
        type: 'object',
        properties: {}
      };
      
      for (const key in obj) {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (this.isObject(value)) {
          schema.properties[key] = generateSchema(value, currentPath);
        } else if (Array.isArray(value)) {
          schema.properties[key] = {
            type: 'array',
            items: { type: typeof value[0] || 'string' }
          };
        } else {
          schema.properties[key] = {
            type: typeof value,
            example: value
          };
        }
      }
      
      return schema;
    };
    
    return generateSchema(this.config);
  }
}

// 싱글톤 인스턴스
let instance = null;

/**
 * ConfigManager 싱글톤 인스턴스 반환
 * @returns {ConfigManager} 설정 관리자 인스턴스
 */
function getConfigManager() {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

/**
 * 설정 로드 편의 함수
 * @param {Object} options - 로드 옵션
 * @returns {Object} 로드된 설정
 */
async function loadConfig(options = {}) {
  const manager = getConfigManager();
  return await manager.loadConfig(options);
}

module.exports = {
  ConfigManager,
  getConfigManager,
  loadConfig
};
