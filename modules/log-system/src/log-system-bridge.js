/**
 * 로그 시스템 브릿지 - Python 서버와 Node.js 간 통신 관리
 * Recursive 플랫폼의 로그 수집 시스템을 위한 브릿지 구현
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { JSONRPCClient } = require('./utils/json-rpc-client');
const { getConfigManager } = require('./utils/config-manager');
const MCPHandler = require('./mcp-handler');

class LogSystemBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // ConfigManager 인스턴스 가져오기
    this.configManager = getConfigManager();
    
    // 기본 설정 정의
    this.defaultConfig = {
      host: 'localhost',
      port: 8888,
      pythonPath: 'python',
      autoStart: true,
      autoRestart: true,
      maxRestartAttempts: 5,
      restartDelay: 2000,
      healthCheckInterval: 30000,
      startupTimeout: 30000,
      shutdownTimeout: 10000,
      dbPath: './logs/recursive_logs.db',
      configPath: null,
      verbose: false,
      debug: false
    };
    
    // 설정 병합 (우선순위: 파라미터 > 설정파일 > 기본값)
    this.config = { ...this.defaultConfig, ...config };
    
    this.pythonProcess = null;
    this.client = null;
    this.isReady = false;
    this.isStarting = false;
    this.isStopping = false;
    this.isReconnecting = false;
    this.restartAttempts = 0;
    this.healthCheckTimer = null;
    this.startupTimer = null;
    
    // 통계 추적
    this.stats = {
      startTime: null,
      restartCount: 0,
      lastError: null,
      totalRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0
    };
    
    // MCP 핸들러 초기화
    this.mcpHandler = null;
    
    // 프로세스 종료 시 정리
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('exit', () => this.cleanup());
  }
  
  /**
   * 로그 시스템 시작
   */
  async start() {
    if (this.isReady) {
      this._log('info', 'Log system already running');
      return;
    }
    
    if (this.isStarting) {
      this._log('warn', 'Log system already starting');
      return;
    }
    
    this.isStarting = true;
    this._log('info', 'Starting log system bridge...');
    
    try {
      // 로그 디렉토리 생성
      await this.ensureLogDirectory();
      
      // Python 서버 시작 (autoStart가 true인 경우)
      if (this.config.autoStart) {
        await this.startPythonServer();
      }
      
      // JSON-RPC 클라이언트 초기화
      await this.initializeClient();
      
      // 서버 준비 상태 확인
      await this.waitForServer();
      
      // 헬스체크 시작
      this.startHealthCheck();
      
      // MCP 핸들러 초기화
      this.initializeMCPHandler();
      
      this.isReady = true;
      this.isStarting = false;
      this.stats.startTime = new Date();
      
      this._log('success', `Log system bridge ready: ${this.getEndpoint()}`);
      this.emit('ready');
      
    } catch (error) {
      this.isStarting = false;
      this.stats.lastError = error.message;
      this._log('error', `Failed to start log system: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Python 서버 프로세스 시작
   */
  async startPythonServer() {
    if (this.pythonProcess) {
      this._log('warn', 'Python server already running');
      return;
    }
    
    this._log('info', 'Starting Python log server...');
    
    const pythonScript = path.join(__dirname, '../python/main.py');
    
    // Python 스크립트 존재 확인
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found: ${pythonScript}`);
    }
    
    // 실행 인자 구성
    const args = [
      pythonScript,
      '--host', this.config.host,
      '--port', this.config.port.toString(),
      '--db', this.config.dbPath
    ];
    
    if (this.config.verbose) args.push('--verbose');
    if (this.config.debug) args.push('--debug');
    if (this.config.configPath) {
      args.push('--config', this.config.configPath);
    }
    
    // Python 프로세스 시작
    this.pythonProcess = spawn(this.config.pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(pythonScript),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    // 프로세스 이벤트 핸들러 설정
    this.setupProcessHandlers();
    
    this._log('info', `Python server started with PID: ${this.pythonProcess.pid}`);
  }
  
  /**
   * 프로세스 이벤트 핸들러 설정
   */
  setupProcessHandlers() {
    if (!this.pythonProcess) return;
    
    // 표준 출력 처리
    this.pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this._log('python', output);
        this.emit('python:stdout', output);
        
        // 서버 준비 신호 감지
        if (output.includes('Ready to collect logs') || output.includes('[SUCCESS]')) {
          this.emit('python:ready');
        }
      }
    });
    
    // 표준 에러 처리
    this.pythonProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        this._log('error', `Python: ${error}`);
        this.emit('python:stderr', error);
      }
    });
    
    // 프로세스 종료 처리
    this.pythonProcess.on('close', (code, signal) => {
      this._log('warn', `Python server exited with code ${code}, signal: ${signal}`);
      this.pythonProcess = null;
      this.isReady = false;
      
      this.emit('python:exit', { code, signal });
      
      // 자동 재시작 처리
      if (this.config.autoRestart && !this.isStopping && this.restartAttempts < this.config.maxRestartAttempts) {
        this.scheduleRestart();
      } else if (this.restartAttempts >= this.config.maxRestartAttempts) {
        this._log('error', 'Max restart attempts reached. Manual intervention required.');
        this.emit('fatal', new Error('Max restart attempts exceeded'));
      }
    });
    
    // 프로세스 에러 처리
    this.pythonProcess.on('error', (error) => {
      this._log('error', `Python server error: ${error.message}`);
      this.stats.lastError = error.message;
      this.emit('python:error', error);
    });
  }
  
  /**
   * JSON-RPC 클라이언트 초기화
   */
  async initializeClient() {
    const endpoint = this.getEndpoint();
    
    this.client = new JSONRPCClient(endpoint, {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      userAgent: 'Recursive-LogSystem-Bridge/1.0'
    });
    
    // 클라이언트 이벤트 연결
    this.client.on('request:start', (data) => {
      this.stats.totalRequests++;
      this.emit('request:start', data);
    });
    
    this.client.on('request:complete', (data) => {
      this.updateResponseTime(data.duration);
      this.emit('request:complete', data);
    });
    
    this.client.on('request:error', (data) => {
      this.stats.failedRequests++;
      this.emit('request:error', data);
    });
    
    this._log('info', `JSON-RPC client initialized: ${endpoint}`);
  }
  
  /**
   * 서버 준비 상태 대기
   */
  async waitForServer(maxRetries = 30) {
    this._log('info', 'Waiting for Python server to be ready...');
    
    return new Promise((resolve, reject) => {
      let retries = 0;
      
      // 타임아웃 설정
      this.startupTimer = setTimeout(() => {
        reject(new Error(`Server startup timeout after ${this.config.startupTimeout}ms`));
      }, this.config.startupTimeout);
      
      const checkServer = async () => {
        try {
          // ping 메서드로 서버 상태 확인
          const result = await this.client.call('ping', {}, { timeout: 5000, retryAttempts: 1 });
          
          if (result && result.pong) {
            clearTimeout(this.startupTimer);
            this._log('success', 'Python server is ready');
            resolve();
            return;
          }
        } catch (error) {
          // 연결 실패는 예상된 상황
        }
        
        retries++;
        if (retries >= maxRetries) {
          clearTimeout(this.startupTimer);
          reject(new Error(`Server failed to respond after ${maxRetries} attempts`));
          return;
        }
        
        // 1초 후 재시도
        setTimeout(checkServer, 1000);
      };
      
      // Python 서버가 준비되었다는 신호를 받으면 즉시 확인
      this.once('python:ready', () => {
        setTimeout(checkServer, 500); // 약간의 지연 후 확인
      });
      
      // 즉시 첫 번째 확인 시작
      setTimeout(checkServer, 2000); // 2초 후 시작
    });
  }
  
  /**
   * 헬스체크 시작
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        const isHealthy = await this.client.ping();
        if (!isHealthy) {
          this._log('warn', 'Health check failed - server not responding');
          this.emit('health:failed');
        }
      } catch (error) {
        this._log('warn', `Health check error: ${error.message}`);
        this.emit('health:error', error);
      }
    }, this.config.healthCheckInterval);
  }
  
  /**
   * 자동 재시작 스케줄링
   */
  scheduleRestart() {
    this.restartAttempts++;
    this.stats.restartCount++;
    
    const delay = this.config.restartDelay * Math.pow(2, this.restartAttempts - 1); // 지수 백오프
    
    this._log('info', `Scheduling restart attempt ${this.restartAttempts}/${this.config.maxRestartAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        this._log('info', `Restart attempt ${this.restartAttempts} starting...`);
        await this.restart();
        this.restartAttempts = 0; // 성공 시 재시도 카운터 리셋
      } catch (error) {
        this._log('error', `Restart attempt ${this.restartAttempts} failed: ${error.message}`);
      }
    }, delay);
  }
  
  /**
   * 서버 재시작
   */
  async restart() {
    this._log('info', 'Restarting log system...');
    this.emit('restarting');
    
    // 기존 프로세스 종료
    await this.stopPythonServer();
    
    // 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 새로 시작
    this.isReady = false;
    await this.startPythonServer();
    await this.waitForServer();
    
    this.isReady = true;
    this._log('success', 'Log system restarted successfully');
    this.emit('restarted');
  }

  /**
   * Python 서버만 재시작 (테스트용)
   */
  async restartPythonServer() {
    this._log('info', 'Restarting Python server...');
    
    try {
      // Python 서버 종료
      await this.stopPythonServer();
      
      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Python 서버 재시작
      await this.startPythonServer();
      
      // 클라이언트 재초기화
      await this.initializeClient();
      
      this.isReady = true;
      
      this._log('success', 'Python server restarted successfully');
      this.emit('python_restarted');
      
    } catch (error) {
      this._log('error', `Python server restart failed: ${error.message}`);
      this.emit('python_restart_failed', error);
      throw error;
    }
  }

  /**
   * 네트워크 연결 재시도 (테스트용)
   */
  async reconnect() {
    this._log('info', 'Attempting to reconnect...');
    
    try {
      // 기존 클라이언트 정리
      if (this.client) {
        try {
          this.client.destroy();
        } catch (destroyError) {
          this._log('warn', `Error destroying client: ${destroyError.message}`);
        }
        this.client = null;
      }
      
      // 서버 연결 확인
      await this.waitForServer(10);
      
      // 클라이언트 재초기화
      await this.initializeClient();
      
      this.isReady = true;
      
      this._log('success', 'Reconnected successfully');
      this.emit('reconnected');
      
    } catch (error) {
      this._log('error', `Reconnection failed: ${error.message}`);
      this.emit('reconnection_failed', error);
      throw error;
    }
  }

  /**
   * 응급 재연결 (클라이언트가 null인 경우)
   */
  async attemptEmergencyReconnection() {
    if (this.isReconnecting) {
      this._log('warn', 'Emergency reconnection already in progress');
      return;
    }
    
    this.isReconnecting = true;
    this._log('warn', 'Starting emergency reconnection...');
    
    try {
      // 시스템 상태 초기화
      this.isReady = false;
      this.client = null;
      
      // Python 서버 상태 확인
      if (!this.pythonProcess || this.pythonProcess.killed) {
        this._log('warn', 'Python server not running, restarting...');
        await this.startPythonServer();
      }
      
      // 서버 연결 대기
      await this.waitForServer(15);
      
      // 클라이언트 재초기화
      await this.initializeClient();
      
      this.isReady = true;
      this.isReconnecting = false;
      
      this._log('success', 'Emergency reconnection completed');
      this.emit('emergency_reconnected');
      
    } catch (error) {
      this.isReconnecting = false;
      this._log('error', `Emergency reconnection failed: ${error.message}`);
      this.emit('emergency_reconnection_failed', error);
      throw error;
    }
  }
  
  /**
   * 로그 수집 메서드들
   */
  async logEntry(entry) {
    this.ensureReady();
    
    // 기본 필드 추가
    const logEntry = {
      timestamp: new Date().toISOString(),
      trace_id: this.generateTraceId(),
      ...entry
    };
    
    try {
      const result = await this.client.call('log', logEntry);
      this.emit('log:success', { entry: logEntry, result });
      return result;
    } catch (error) {
      this.emit('log:error', { entry: logEntry, error });
      throw error;
    }
  }
  
  // 호환성을 위한 별칭
  async log(entry) {
    return this.logEntry(entry);
  }
  
  async logBatch(entries, compress = false) {
    this.ensureReady();
    
    // 배치 엔트리 전처리
    const processedEntries = entries.map(entry => ({
      timestamp: new Date().toISOString(),
      trace_id: entry.trace_id || this.generateTraceId(),
      ...entry
    }));
    
    try {
      const result = await this.client.call('log_batch', { 
        logs: processedEntries, 
        compress 
      });
      this.emit('logBatch:success', { entries: processedEntries, result });
      return result;
    } catch (error) {
      this.emit('logBatch:error', { entries: processedEntries, error });
      throw error;
    }
  }
  
  async query(params) {
    this.ensureReady();
    
    try {
      const result = await this.client.call('query', params);
      this.emit('query:success', { params, result });
      return result;
    } catch (error) {
      this.emit('query:error', { params, error });
      throw error;
    }
  }
  
  async search(query, timerange = '1h', context = 0) {
    this.ensureReady();
    
    const params = { query, timerange, context };
    
    try {
      const result = await this.client.call('search', params);
      this.emit('search:success', { params, result });
      return result;
    } catch (error) {
      this.emit('search:error', { params, error });
      throw error;
    }
  }
  
  async getStats(timerange = '1h') {
    this.ensureReady();
    
    try {
      const result = await this.client.call('get_stats', { timerange });
      this.emit('stats:success', { timerange, result });
      return result;
    } catch (error) {
      this.emit('stats:error', { timerange, error });
      throw error;
    }
  }
  
  /**
   * 시스템 상태 확인
   */
  async getSystemStatus() {
    const status = {
      isReady: this.isReady,
      isStarting: this.isStarting,
      isStopping: this.isStopping,
      pythonProcess: {
        running: !!this.pythonProcess,
        pid: this.pythonProcess?.pid || null
      },
      client: {
        connected: this.client && this.isReady,
        endpoint: this.getEndpoint()
      },
      stats: { ...this.stats },
      config: {
        host: this.config.host,
        port: this.config.port,
        autoRestart: this.config.autoRestart,
        restartAttempts: this.restartAttempts,
        maxRestartAttempts: this.config.maxRestartAttempts
      }
    };
    
    // 서버 응답 시간 테스트
    if (this.isReady) {
      try {
        const start = Date.now();
        await this.client.ping();
        status.client.responseTime = Date.now() - start;
        status.client.healthy = true;
      } catch (error) {
        status.client.healthy = false;
        status.client.lastError = error.message;
      }
    }
    
    return status;
  }
  
  /**
   * 정리 및 종료 메서드들
   */
  async stop() {
    if (this.isStopping) {
      this._log('warn', 'Already stopping');
      return;
    }
    
    this.isStopping = true;
    this._log('info', 'Stopping log system bridge...');
    
    try {
      // 모든 진행 중인 작업 중지
      this.isReady = false;
      this.isReconnecting = false;
      
      // 헬스체크 중지
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
      
      // 시작 타이머 중지
      if (this.startupTimer) {
        clearTimeout(this.startupTimer);
        this.startupTimer = null;
      }
      
      // 클라이언트 안전하게 정리
      if (this.client) {
        try {
          this.client.destroy();
        } catch (clientError) {
          this._log('warn', `Error destroying client: ${clientError.message}`);
        }
        this.client = null;
      }
      
      // Python 서버 종료
      await this.stopPythonServer();
      
      // 상태 완전 초기화
      this.pythonProcess = null;
      this.restartAttempts = 0;
      this.isStopping = false;
      
      this._log('info', 'Log system bridge stopped completely');
      this.emit('stopped');
      
    } catch (error) {
      this.isStopping = false;
      this._log('error', `Error stopping log system: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }
  
  async stopPythonServer() {
    if (!this.pythonProcess) return;
    
    this._log('info', 'Stopping Python server...');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pythonProcess) {
          this._log('warn', 'Force killing Python server');
          this.pythonProcess.kill('SIGKILL');
        }
        resolve();
      }, this.config.shutdownTimeout);
      
      this.pythonProcess.once('close', () => {
        clearTimeout(timeout);
        this._log('info', 'Python server stopped');
        resolve();
      });
      
      // SIGTERM으로 정상 종료 시도
      this.pythonProcess.kill('SIGTERM');
    });
  }
  
  async gracefulShutdown() {
    this._log('info', 'Graceful shutdown initiated...');
    await this.stop();
    process.exit(0);
  }
  
  cleanup() {
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGKILL');
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
    }
  }
  
  /**
   * 유틸리티 메서드들
   */
  ensureReady() {
    if (!this.isReady) {
      throw new Error('Log system not ready. Call start() first.');
    }
    
    if (!this.client) {
      this._log('error', 'Client is null, attempting emergency reconnection...');
      // 비동기 재연결 시도
      this.attemptEmergencyReconnection().catch(error => {
        this._log('error', `Emergency reconnection failed: ${error.message}`);
      });
      throw new Error('Log system client is not initialized. Emergency reconnection in progress.');
    }
  }
  
  getEndpoint() {
    return `http://${this.config.host}:${this.config.port}/rpc`;
  }
  
  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  updateResponseTime(duration) {
    const total = this.stats.totalRequests;
    this.stats.avgResponseTime = ((this.stats.avgResponseTime * (total - 1)) + duration) / total;
  }
  
  async ensureLogDirectory() {
    const logDir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      this._log('info', `Created log directory: ${logDir}`);
    }
  }
  
  _log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [LOG-BRIDGE] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'success':
        console.log(`${prefix} ✅ ${message}`);
        break;
      case 'python':
        if (this.config.verbose) {
          console.log(`[${timestamp}] [PYTHON] ${message}`);
        }
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  /**
   * 설정 로드 및 초기화
   * @param {Object} options - 로드 옵션
   */
  async loadConfiguration(options = {}) {
    try {
      // ConfigManager를 통해 설정 로드
      const loadedConfig = await this.configManager.loadConfig({
        configPath: this.config.configPath,
        environment: options.environment || process.env.NODE_ENV || 'development',
        watchForChanges: options.watchForChanges !== false,
        validateSchema: options.validateSchema !== false
      });
      
      // 서버 설정만 추출하여 병합
      if (loadedConfig.server) {
        this.config = { ...this.config, ...loadedConfig.server };
      }
      
      // 저장소 설정 병합
      if (loadedConfig.storage && loadedConfig.storage.db_path) {
        this.config.dbPath = loadedConfig.storage.db_path;
      }
      
      // 전체 설정을 내부에 저장 (다른 컴포넌트에서 사용)
      this.fullConfig = loadedConfig;
      
      this._log('info', `Configuration loaded: ${this.configManager.getEnvironmentInfo().environment}`);
      this.emit('config:loaded', { 
        config: this.config, 
        fullConfig: this.fullConfig 
      });
      
      return this.config;
      
    } catch (error) {
      this._log('warn', `Failed to load configuration: ${error.message}`);
      this.emit('config:error', error);
      // 설정 로드 실패 시 기본 설정 사용
      return this.config;
    }
  }

  /**
   * 런타임 설정 업데이트
   * @param {string} path - 설정 경로
   * @param {*} value - 새 값
   */
  updateConfig(path, value) {
    try {
      // ConfigManager에 업데이트
      this.configManager.set(path, value);
      
      // 로컬 설정도 업데이트 (서버 관련 설정만)
      if (path.startsWith('server.')) {
        const serverKey = path.replace('server.', '');
        if (this.config.hasOwnProperty(serverKey)) {
          this.config[serverKey] = value;
        }
      }
      
      this._log('info', `Configuration updated: ${path} = ${value}`);
      this.emit('config:updated', { path, value });
      
    } catch (error) {
      this._log('error', `Failed to update configuration: ${error.message}`);
      this.emit('config:update_error', { path, value, error });
    }
  }

  /**
   * 설정 값 가져오기
   * @param {string} path - 설정 경로
   * @param {*} defaultValue - 기본값
   * @returns {*} 설정 값
   */
  getConfigValue(path, defaultValue) {
    return this.configManager.get(path, defaultValue);
  }

  /**
   * 전체 설정 반환
   * @returns {Object} 전체 설정
   */
  getFullConfig() {
    return {
      bridge: { ...this.config },
      full: this.configManager.getConfig(),
      environment: this.configManager.getEnvironmentInfo()
    };
  }

  /**
   * 설정 스키마 내보내기
   * @returns {Object} JSON 스키마
   */
  exportConfigSchema() {
    return this.configManager.exportSchema();
  }

  /**
   * MCP 핸들러 초기화
   */
  initializeMCPHandler() {
    try {
      this.mcpHandler = new MCPHandler(this);
      
      // MCP 이벤트 연결
      this.mcpHandler.on('tool_call_success', (data) => {
        this.emit('mcp:tool_call_success', data);
      });
      
      this.mcpHandler.on('tool_call_error', (data) => {
        this.emit('mcp:tool_call_error', data);
      });
      
      this._log('info', `MCP 핸들러 초기화 완료: ${this.mcpHandler.tools.size}개 도구`);
    } catch (error) {
      this._log('error', `MCP 핸들러 초기화 실패: ${error.message}`);
    }
  }

  /**
   * MCP 도구 목록 반환
   * @returns {Array} 도구 목록
   */
  getMCPTools() {
    if (!this.mcpHandler) {
      throw new Error('MCP handler not initialized');
    }
    return this.mcpHandler.getToolsList();
  }

  /**
   * MCP 도구 호출
   * @param {string} toolName - 도구명
   * @param {Object} params - 매개변수
   * @returns {Object} 실행 결과
   */
  async callMCPTool(toolName, params = {}) {
    if (!this.mcpHandler) {
      throw new Error('MCP handler not initialized');
    }
    return await this.mcpHandler.handleToolCall(toolName, params);
  }

  /**
   * MCP 도구 정보 반환
   * @param {string} toolName - 도구명
   * @returns {Object|null} 도구 정보
   */
  getMCPToolInfo(toolName) {
    if (!this.mcpHandler) {
      throw new Error('MCP handler not initialized');
    }
    return this.mcpHandler.getToolInfo(toolName);
  }

  /**
   * MCP 사용량 통계 반환
   * @param {string} timerange - 시간 범위
   * @returns {Object} 사용량 통계
   */
  async getMCPUsageStats(timerange = '1h') {
    if (!this.mcpHandler) {
      throw new Error('MCP handler not initialized');
    }
    return await this.mcpHandler.getUsageStats(timerange);
  }

  /**
   * MCP 핸들러 통계 반환
   * @returns {Object} 핸들러 통계
   */
  getMCPStats() {
    if (!this.mcpHandler) {
      return { error: 'MCP handler not initialized' };
    }
    return this.mcpHandler.getStats();
  }
}

module.exports = LogSystemBridge; 