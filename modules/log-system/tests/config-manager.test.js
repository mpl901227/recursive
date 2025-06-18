/**
 * ConfigManager 단위 테스트
 * 설정 로드, 병합, 환경별 오버라이드 테스트
 */

const { ConfigManager, getConfigManager, loadConfig } = require('../src/utils/config-manager');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 테스트용 임시 설정 파일들
const TEST_CONFIG_DIR = path.join(__dirname, '../test_configs');
const TEST_BASE_CONFIG = {
  project_name: 'test-project',
  server: {
    host: 'localhost',
    port: 8888,
    debug: false
  },
  storage: {
    db_path: './test.db',
    max_size_mb: 100
  },
  development: {
    server: {
      debug: true,
      verbose: true
    }
  },
  production: {
    server: {
      debug: false,
      verbose: false
    },
    storage: {
      max_size_mb: 1000
    }
  }
};

describe('ConfigManager', () => {
  let configManager;
  let testConfigPath;
  
  beforeAll(() => {
    // 테스트 설정 디렉토리 생성
    if (!fs.existsSync(TEST_CONFIG_DIR)) {
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    
    // 테스트 설정 파일 생성
    testConfigPath = path.join(TEST_CONFIG_DIR, 'test.yaml');
    fs.writeFileSync(testConfigPath, yaml.dump(TEST_BASE_CONFIG));
  });
  
  beforeEach(() => {
    configManager = new ConfigManager();
  });
  
  afterAll(() => {
    // 테스트 설정 파일 정리
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    test('기본 설정으로 초기화되어야 함', () => {
      expect(configManager.config).toEqual({});
      expect(configManager.configPaths).toEqual([]);
      expect(configManager.environment).toBe('test'); // Jest 환경
      expect(configManager.watchedFiles.size).toBe(0);
    });
  });

  describe('loadConfig', () => {
    test('설정 파일을 로드하고 병합해야 함', async () => {
      const config = await configManager.loadConfig({
        configPath: testConfigPath,
        validateSchema: false
      });
      
      expect(config.project_name).toBe('test-project');
      expect(config.server.host).toBe('localhost');
      expect(config.server.port).toBe(8888);
      expect(config.storage.db_path).toBe('./test.db');
    });

    test('환경별 오버라이드가 적용되어야 함', async () => {
      const config = await configManager.loadConfig({
        configPath: testConfigPath,
        environment: 'development',
        validateSchema: false
      });
      
      expect(config.server.debug).toBe(true);
      expect(config.server.verbose).toBe(true);
      expect(config.server.host).toBe('localhost'); // 기본값 유지
    });

    test('프로덕션 환경 설정이 적용되어야 함', async () => {
      const config = await configManager.loadConfig({
        configPath: testConfigPath,
        environment: 'production',
        validateSchema: false
      });
      
      expect(config.server.debug).toBe(false);
      expect(config.server.verbose).toBe(false);
      expect(config.storage.max_size_mb).toBe(1000);
    });

    test('존재하지 않는 파일은 무시되어야 함', async () => {
      // 새로운 ConfigManager 인스턴스로 테스트 (기본 설정 파일 영향 제거)
      const isolatedManager = new ConfigManager();
      const config = await isolatedManager.loadConfig({
        configPath: './completely_nonexistent_file.yaml',
        validateSchema: false
      });
      
      // 기본 설정 파일들이 없는 상태에서는 빈 객체가 반환되어야 함
      expect(Object.keys(config).length).toBe(0);
    });
  });

  describe('deepMerge', () => {
    test('중첩된 객체를 올바르게 병합해야 함', () => {
      const target = {
        server: {
          host: 'localhost',
          port: 8888
        },
        storage: {
          db_path: './test.db'
        }
      };
      
      const source = {
        server: {
          port: 9999,
          debug: true
        },
        logging: {
          level: 'INFO'
        }
      };
      
      const result = configManager.deepMerge(target, source);
      
      expect(result.server.host).toBe('localhost');
      expect(result.server.port).toBe(9999);
      expect(result.server.debug).toBe(true);
      expect(result.storage.db_path).toBe('./test.db');
      expect(result.logging.level).toBe('INFO');
    });

    test('배열은 덮어써야 함', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };
      
      const result = configManager.deepMerge(target, source);
      
      expect(result.items).toEqual([4, 5]);
    });
  });

  describe('substituteEnvironmentVariables', () => {
    beforeEach(() => {
      process.env.TEST_VAR = 'test_value';
      process.env.TEST_PORT = '9999';
    });
    
    afterEach(() => {
      delete process.env.TEST_VAR;
      delete process.env.TEST_PORT;
    });

    test('환경 변수를 치환해야 함', () => {
      const config = {
        database_url: '${TEST_VAR}',
        server: {
          port: '${TEST_PORT}'
        }
      };
      
      const result = configManager.substituteEnvironmentVariables(config);
      
      expect(result.database_url).toBe('test_value');
      expect(result.server.port).toBe('9999');
    });

    test('기본값을 사용해야 함', () => {
      const config = {
        missing_var: '${MISSING_VAR:-default_value}',
        existing_var: '${TEST_VAR:-default_value}'
      };
      
      const result = configManager.substituteEnvironmentVariables(config);
      
      expect(result.missing_var).toBe('default_value');
      expect(result.existing_var).toBe('test_value');
    });

    test('중첩된 객체와 배열에서 치환해야 함', () => {
      const config = {
        server: {
          host: '${TEST_VAR}',
          ports: ['${TEST_PORT}', '8080']
        }
      };
      
      const result = configManager.substituteEnvironmentVariables(config);
      
      expect(result.server.host).toBe('test_value');
      expect(result.server.ports[0]).toBe('9999');
      expect(result.server.ports[1]).toBe('8080');
    });
  });

  describe('validateConfig', () => {
    test('유효한 설정은 통과해야 함', () => {
      const validConfig = {
        project_name: 'test',
        server: {
          host: 'localhost',
          port: 8888,
          auto_start: true
        },
        storage: {
          db_path: './test.db',
          max_size_mb: 100,
          max_days: 30
        }
      };
      
      expect(() => {
        configManager.validateConfig(validConfig);
      }).not.toThrow();
    });

    test('필수 필드가 없으면 오류를 발생시켜야 함', () => {
      const invalidConfig = {
        server: {
          host: 'localhost'
          // port 누락
        }
      };
      
      expect(() => {
        configManager.validateConfig(invalidConfig);
      }).toThrow('Required field missing');
    });

    test('잘못된 타입이면 오류를 발생시켜야 함', () => {
      const invalidConfig = {
        project_name: 'test',
        server: {
          host: 'localhost',
          port: 'invalid_port', // 숫자여야 함
          auto_start: true
        },
        storage: {
          db_path: './test.db'
        }
      };
      
      expect(() => {
        configManager.validateConfig(invalidConfig);
      }).toThrow('should be of type number');
    });

    test('범위를 벗어나면 오류를 발생시켜야 함', () => {
      const invalidConfig = {
        project_name: 'test',
        server: {
          host: 'localhost',
          port: 99999, // 범위 초과
          auto_start: true
        },
        storage: {
          db_path: './test.db'
        }
      };
      
      expect(() => {
        configManager.validateConfig(invalidConfig);
      }).toThrow('should be between');
    });
  });

  describe('get/set methods', () => {
    beforeEach(async () => {
      await configManager.loadConfig({
        configPath: testConfigPath,
        validateSchema: false
      });
    });

    test('중첩된 값을 가져올 수 있어야 함', () => {
      const host = configManager.get('server.host');
      const port = configManager.get('server.port');
      
      expect(host).toBe('localhost');
      expect(port).toBe(8888); // 테스트 설정 파일의 실제 값
    });

    test('존재하지 않는 값에 기본값을 반환해야 함', () => {
      const missing = configManager.get('missing.value', 'default');
      
      expect(missing).toBe('default');
    });

    test('값을 설정할 수 있어야 함', () => {
      configManager.set('server.timeout', 5000);
      
      const timeout = configManager.get('server.timeout');
      expect(timeout).toBe(5000);
    });

    test('새로운 중첩 경로를 생성할 수 있어야 함', () => {
      configManager.set('new.nested.value', 'test');
      
      const value = configManager.get('new.nested.value');
      expect(value).toBe('test');
    });
  });

  describe('Events', () => {
    test('설정 로드 시 이벤트를 발생시켜야 함', async () => {
      const loadedHandler = jest.fn();
      configManager.on('config:loaded', loadedHandler);
      
      await configManager.loadConfig({
        configPath: testConfigPath,
        validateSchema: false
      });
      
      expect(loadedHandler).toHaveBeenCalledWith({
        config: expect.any(Object),
        environment: expect.any(String),
        paths: expect.any(Array)
      });
    });

    test('설정 변경 시 이벤트를 발생시켜야 함', () => {
      const changedHandler = jest.fn();
      configManager.on('config:value_changed', changedHandler);
      
      configManager.set('test.value', 'new_value');
      
      expect(changedHandler).toHaveBeenCalledWith({
        path: 'test.value',
        value: 'new_value',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Singleton', () => {
    test('getConfigManager는 같은 인스턴스를 반환해야 함', () => {
      const instance1 = getConfigManager();
      const instance2 = getConfigManager();
      
      expect(instance1).toBe(instance2);
    });

    test('loadConfig 편의 함수가 작동해야 함', async () => {
      const config = await loadConfig({
        configPath: testConfigPath,
        validateSchema: false
      });
      
      expect(config.project_name).toBe('test-project');
    });
  });

  describe('exportSchema', () => {
    test('설정에서 JSON 스키마를 생성해야 함', async () => {
      await configManager.loadConfig({
        configPath: testConfigPath,
        validateSchema: false
      });
      
      const schema = configManager.exportSchema();
      
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('project_name');
      expect(schema.properties).toHaveProperty('server');
      expect(schema.properties.server.type).toBe('object');
    });
  });
}); 