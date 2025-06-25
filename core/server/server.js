const path = require('path');

// 환경변수 로드 (가장 먼저)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import our modularized WebSocket components
const { WebSocketProtocolServer } = require('@recursive/websocket-protocol');
const { Logger: { createLogger } } = require('@recursive/shared');
// 모듈화된 shared config 사용
const { config: configManager } = require('@recursive/shared');
const config = configManager.get('websocket');
const { MCPServer } = require('@recursive/mcp-protocol');

// Import modularized AI analysis
const { getDefaultInstance: getAIAnalysis } = require('@recursive/ai-analysis');

// Import shared utilities
const { eventBus, config: sharedConfig, utils } = require('@recursive/shared');

// 로그 시스템은 직접 Python 서버로 통신

// Import Python server management
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

class RecursiveServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wsServer = null;
    this.mcpServer = null;
    this.logger = null;
    this.aiAnalysis = null;
    this.isShuttingDown = false;
    
    // 로그 시스템 관련 속성 추가
    this.logSystem = null;
    this.logCollectors = null;
    this.pythonLogServer = null;
    this.pythonServerPort = process.env.PYTHON_LOG_SERVER_PORT || 8888;
    this.pythonServerHost = process.env.PYTHON_LOG_SERVER_HOST || 'localhost';
  }

  async initialize() {
    // Logger 초기화
    this.logger = createLogger({
      level: config.logging.level,
      enableFile: true,
      logDir: './logs'
    });

    // 로그 시스템 초기화 (AI 분석 모듈보다 먼저)
    await this.setupLogSystem();

    // AI 분석 모듈 초기화
    await this.setupAIAnalysis();

    // Express 미들웨어 설정
    this.setupExpressMiddleware();
    
    // 라우트 설정
    this.setupRoutes();
    
    // WebSocket 서버 초기화
    this.setupWebSocketServer();
    
    // Graceful shutdown 핸들러
    this.setupGracefulShutdown();
  }

  async setupLogSystem() {
    console.log('🔍 Setting up integrated log system...');
    
    try {
      // Python 로그 서버 시작
      await this.startPythonLogServer();
      
      // Python 서버가 시작되었는지 확인
      if (this.pythonLogServer || await this.testPythonServerHealth()) {
        console.log('✅ Python log server is running');
        
        // 간단한 로그 클라이언트만 초기화 (복잡한 브리지 없이)
        const JSONRPCClient = require('../shared/src/utils/JSONRPCClient');
        this.logClient = new JSONRPCClient(`http://localhost:${this.pythonServerPort}/rpc`);
        
        console.log('✅ Log system client initialized');
        
        // 기존 로거를 로그 시스템으로 연결
        this.connectLoggerToLogSystem();
        
        console.log('✅ Log system integration completed');
      } else {
        console.warn('⚠️ Python log server not available, skipping log system integration');
      }
      
    } catch (error) {
      console.error('❌ Failed to setup log system:', error);
      // 로그 시스템 실패해도 메인 서버는 계속 실행
      this.logSystem = null;
      this.logCollectors = null;
    }
  }

  async startPythonLogServer() {
    console.log('🐍 Starting Python log server...');
    
    try {
      // 포트가 이미 사용 중인지 확인
      const isPortInUse = await this.checkPortInUse(this.pythonServerPort);
      if (isPortInUse) {
        console.log(`📝 Python log server already running on port ${this.pythonServerPort}`);
        // 기존 서버가 정상 작동하는지 확인
        const isHealthy = await this.testPythonServerHealth();
        if (isHealthy) {
          console.log('✅ Existing Python log server is healthy');
          return;
        } else {
          console.log('⚠️ Existing server is not responding, attempting to restart...');
          // 기존 프로세스 종료 시도
          await this.killProcessOnPort(this.pythonServerPort);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
        }
      }
      
      // Python 서버 실행 경로 확인 (main.py 사용)
      const pythonServerPath = path.join(__dirname, '../../modules/log-system/python/main.py');
      if (!fs.existsSync(pythonServerPath)) {
        throw new Error(`Python server not found at: ${pythonServerPath}`);
      }
      
      // Python 서버 실행
      this.pythonLogServer = spawn('python', [
        pythonServerPath,
        '--host', this.pythonServerHost,
        '--port', this.pythonServerPort.toString(),
        '--db', './logs/recursive_logs.db'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '../../modules/log-system'),
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      
      // 서버 출력 로깅
      this.pythonLogServer.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`🐍 [PYTHON] ${output}`);
        }
      });
      
      this.pythonLogServer.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`🐍 [PYTHON ERROR] ${error}`);
        }
      });
      
      this.pythonLogServer.on('error', (error) => {
        console.error('❌ Failed to start Python log server:', error);
        this.pythonLogServer = null;
      });
      
      this.pythonLogServer.on('exit', (code, signal) => {
        if (code !== 0 && !this.isShuttingDown) {
          console.error(`🐍 Python log server exited with code ${code}, signal ${signal}`);
        } else {
          console.log('🐍 Python log server stopped gracefully');
        }
        this.pythonLogServer = null;
      });
      
      // 서버 시작 대기
      await this.waitForPythonServer();
      console.log(`✅ Python log server started on ${this.pythonServerHost}:${this.pythonServerPort}`);
      
    } catch (error) {
      console.error('❌ Failed to start Python log server:', error);
      // Python 서버 실패해도 메인 서버는 계속 실행
      this.pythonLogServer = null;
    }
  }
  
  async checkPortInUse(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, (err) => {
        if (err) {
          resolve(true); // 포트가 사용 중
        } else {
          server.once('close', () => {
            resolve(false); // 포트가 사용 가능
          });
          server.close();
        }
      });
      
      server.on('error', () => {
        resolve(true); // 포트가 사용 중
      });
    });
  }
  
  async waitForPythonServer(maxAttempts = 30, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.testPythonServerHealth();
        if (response) {
          return true;
        }
      } catch (error) {
        // 연결 실패, 재시도
      }
      
      if (attempt < maxAttempts) {
        console.log(`🐍 Waiting for Python server... (${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Python log server failed to start within timeout');
  }
  
  async testPythonServerHealth() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: this.pythonServerHost,
        port: this.pythonServerPort,
        path: '/health',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      
      req.end();
    });
  }

  async killProcessOnPort(port) {
    try {
      if (process.platform === 'win32') {
        // Windows에서 포트를 사용하는 프로세스 종료
        const { exec } = require('child_process');
        return new Promise((resolve) => {
          exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
            if (stdout) {
              const lines = stdout.split('\n').filter(line => line.includes(`LISTENING`));
              lines.forEach(line => {
                const pid = line.trim().split(/\s+/).pop();
                if (pid && pid !== '0') {
                  exec(`taskkill /F /PID ${pid}`, () => {
                    console.log(`🔪 Killed process ${pid} using port ${port}`);
                  });
                }
              });
            }
            resolve();
          });
        });
      } else {
        // Unix/Linux에서 포트를 사용하는 프로세스 종료
        const { exec } = require('child_process');
        return new Promise((resolve) => {
          exec(`lsof -ti:${port}`, (error, stdout) => {
            if (stdout) {
              const pids = stdout.trim().split('\n');
              pids.forEach(pid => {
                if (pid) {
                  exec(`kill -9 ${pid}`, () => {
                    console.log(`🔪 Killed process ${pid} using port ${port}`);
                  });
                }
              });
            }
            resolve();
          });
        });
      }
    } catch (error) {
      console.warn(`⚠️ Failed to kill process on port ${port}:`, error.message);
    }
  }

  connectLoggerToLogSystem() {
    if (!this.logger) return;
    
    // 편의 메서드들 연결
    ['info', 'warn', 'error', 'debug'].forEach(level => {
      if (this.logger[level]) {
        const originalMethod = this.logger[level].bind(this.logger);
        this.logger[level] = (message, metadata = {}) => {
          // 기존 로깅 수행
          originalMethod(message, metadata);
          
          // Python 서버로 로그 전송 (비동기, 에러 무시)
          if (this.logClient) {
            this.sendLogToPythonServer({
              source: 'recursive_server',
              level: level.toUpperCase(),
              message: typeof message === 'string' ? message : JSON.stringify(message),
              metadata: {
                component: 'server',
                ...metadata
              },
              tags: ['server', 'main']
            });
          }
        };
      }
    });
  }

  async sendLogToPythonServer(logEntry) {
    try {
      const response = await this.logClient.call('log', {
        ...logEntry,
        timestamp: new Date().toISOString()
      });
      // 성공적으로 전송됨
    } catch (error) {
      // 로그 전송 실패해도 메인 서버에는 영향 없음
    }
  }

  async setupAIAnalysis() {
    try {
      this.aiAnalysis = getAIAnalysis({
        enablePythonUtils: true,
        logLevel: config.logging.level
      });
      
      await this.aiAnalysis.initialize();
      
      // 이벤트 버스에 등록
      eventBus.registerModule('ai-analysis', this.aiAnalysis);
      
      this.logger.info('✅ AI Analysis module initialized and registered');
    } catch (error) {
      this.logger.error('❌ Failed to initialize AI Analysis module:', error);
      // AI 분석 없이도 서버가 동작할 수 있도록 함
      this.aiAnalysis = null;
    }
  }

  setupExpressMiddleware() {
    // HTTP 로그 수집기 미들웨어 추가 (가장 먼저)
    if (this.logCollectors && this.logCollectors.collectors.has('recursive_http')) {
      const httpCollector = this.logCollectors.collectors.get('recursive_http');
      const httpMiddleware = httpCollector.createMiddleware();
      this.app.use(httpMiddleware);
      console.log('✅ HTTP logging middleware registered');
    }

    // 보안 헤더
    this.app.use(helmet({
      frameguard: { action: 'sameorigin' }, // X-Frame-Options를 HTTP 헤더로 설정
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", "ws:", "wss:"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      }
    }));

    // CORS 설정
    this.app.use(cors({
      origin: config.websocket.security.allowedOrigins,
      credentials: true
    }));

    // 압축
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15분
      max: 100, // 요청 제한
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);

    // JSON 파싱
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // 정적 파일 서빙 - Public Directory
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // User Interface 빌드 결과물 서빙 (assets, fonts, icons 등)
    this.app.use('/assets', express.static(path.join(__dirname, '../../modules/user-interface/build/assets')));
    this.app.use('/fonts', express.static(path.join(__dirname, '../../modules/user-interface/build/fonts')));
    this.app.use('/icons', express.static(path.join(__dirname, '../../modules/user-interface/build/icons')));
    this.app.use('/images', express.static(path.join(__dirname, '../../modules/user-interface/build/images')));
    
    // favicon 직접 서빙
    this.app.get('/favicon.ico', (req, res) => {
      res.sendFile(path.join(__dirname, '../../modules/user-interface/build/favicon.ico'));
    });
    
    // 메인 UI 라우팅 (SPA 지원)
    this.app.get('/ui', (req, res) => {
      res.sendFile(path.join(__dirname, '../../modules/user-interface/build/index.html'));
    });
    
    // SPA 라우팅 지원 (모든 UI 경로를 index.html로 리다이렉트)
    this.app.get('/ui/*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../modules/user-interface/build/index.html'));
    });
  }

  setupRoutes() {
    // 헬스 체크
    this.app.get('/health', (req, res) => {
      const metrics = this.wsServer ? this.wsServer.getMetrics() : null;
      const logSystemStatus = this.logSystem ? this.logSystem.getSystemStatus() : null;
      const collectorsStatus = this.logCollectors ? this.logCollectors.getStatus() : null;
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        websocket: metrics,
        logSystem: {
          enabled: !!this.logSystem,
          status: logSystemStatus,
          collectors: collectorsStatus
        }
      });
    });

    // API 헬스 체크 (프론트엔드에서 기대하는 엔드포인트)
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });

    // 메트릭 API 헬스 체크
    this.app.get('/api/metrics/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'metrics',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // WebSocket 메트릭
    this.app.get('/api/metrics', (req, res) => {
      if (!this.wsServer) {
        return res.status(503).json({ error: 'WebSocket server not initialized' });
      }

      const metrics = this.wsServer.getMetrics();

      res.json({
        websocket: metrics,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    });

    // 실시간 메트릭 데이터 (프론트엔드에서 기대하는 형식)
    this.app.get('/api/metrics/data', (req, res) => {
      const metrics = this.wsServer ? this.wsServer.getMetrics() : {};
      const memoryUsage = process.memoryUsage();
      
      res.json({
        timestamp: new Date().toISOString(),
        connections: {
          active: metrics.connections?.active || 0,
          total: metrics.connections?.total || 0
        },
        messages: {
          sent: metrics.messages?.sent || 0,
          received: metrics.messages?.received || 0,
          errors: metrics.messages?.errors || 0
        },
        performance: {
          uptime: process.uptime(),
          cpu: process.cpuUsage(),
          memory: {
            used: memoryUsage.heapUsed,
            total: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss
          }
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      });
    });

    // API 서버 기능들
    this.app.get('/api/status', (req, res) => {
      res.json({
        api: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services: {
          websocket: !!this.wsServer,
          mcp: !!this.mcpServer,
          logSystem: !!this.logSystem,
          aiAnalysis: !!this.aiAnalysis
        }
      });
    });

    // 시스템 정보 API
    this.app.get('/api/system/info', (req, res) => {
      res.json({
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime()
        },
        memory: process.memoryUsage(),
        env: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    });

    // 연결 정보 API
    this.app.get('/api/connections', (req, res) => {
      if (!this.wsServer) {
        return res.status(503).json({ error: 'WebSocket server not available' });
      }

      const connections = this.wsServer.connectionHandler.getAllConnections();
      const connectionInfo = Object.entries(connections).map(([id, conn]) => ({
        id,
        connected: conn.readyState === 1,
        connectTime: conn.connectTime || new Date().toISOString(),
        lastActivity: conn.lastActivity || new Date().toISOString()
      }));

      res.json({
        total: connectionInfo.length,
        active: connectionInfo.filter(c => c.connected).length,
        connections: connectionInfo
      });
    });

    // 메시지 전송 API
    this.app.post('/api/broadcast', (req, res) => {
      if (!this.wsServer) {
        return res.status(503).json({ error: 'WebSocket server not available' });
      }

      const { message, type = 'broadcast' } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const broadcastData = {
        type,
        data: message,
        from: 'api',
        timestamp: new Date().toISOString()
      };

      const sentCount = this.wsServer.broadcast(broadcastData);
      
      res.json({
        success: true,
        sentTo: sentCount,
        message: broadcastData,
        timestamp: new Date().toISOString()
      });
    });
  
    // 클라이언트 라이브러리 다운로드
    this.app.get('/api/client-library', (req, res) => {
      res.sendFile(path.join(__dirname, 'public/js/websocket-client.js'));
    });

    // 로그 시스템 API 라우트들
    this.app.get('/api/logs/status', (req, res) => {
      if (!this.logSystem) {
        return res.status(503).json({ error: 'Log system not available' });
      }
      
      const status = this.logSystem.getSystemStatus();
      const collectorsStatus = this.logCollectors ? this.logCollectors.getStatus() : null;
      
      res.json({
        logSystem: status,
        collectors: collectorsStatus,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/logs/stats', async (req, res) => {
      if (!this.logSystem) {
        return res.status(503).json({ error: 'Log system not available' });
      }
      
      try {
        const timerange = req.query.timerange || '1h';
        const stats = await this.logSystem.getStats(timerange);
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/logs/search', async (req, res) => {
      if (!this.logSystem) {
        return res.status(503).json({ error: 'Log system not available' });
      }
      
      try {
        const { query, timerange = '1h', context = 3 } = req.body;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter required' });
        }
        
        const results = await this.logSystem.search(query, timerange, context);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 🎨 Phase 5.1: UI Module Integration - V2 ONLY MODE
    console.log('🎨 Setting up User Interface V2 (V1 temporarily disabled)...');
    
    // 🎨 User Interface V2 - 메인 도메인에서 직접 서빙
    console.log('🎯 V2 UI now serving on main domain (localhost:3001)');
    
    // V2 정적 파일 서빙 (메인 도메인에서)
    this.app.use('/', express.static(
      path.join(__dirname, '../../modules/user-interface-v2/dist'),
      { 
        index: false,  // 자동 인덱스 파일 서빙 비활성화
        fallthrough: true  // 파일이 없으면 다음 미들웨어로 넘어감
      }
    ));
    
    // 메인 페이지와 모든 SPA 라우트를 V2 index.html로 서빙
    this.app.get('/', (req, res) => {
      console.log(`🎯 V2 Main Route: ${req.url}`);
      res.sendFile(path.join(__dirname, '../../modules/user-interface-v2/dist/index.html'));
    });
    
    // SPA 라우팅 지원 (해시 라우팅이므로 메인 페이지에서 처리)
    this.app.get('*', (req, res) => {
      // API 경로가 아닌 경우에만 V2 UI 서빙
      if (!req.path.startsWith('/api/')) {
        console.log(`🎯 V2 SPA Route: ${req.url}`);
        res.sendFile(path.join(__dirname, '../../modules/user-interface-v2/dist/index.html'));
      }
    });
    
    // V1 UI 임시 비활성화 (접근 시 V2로 리다이렉트)
    // this.app.use('/ui', express.static(
    //   path.join(__dirname, '../../modules/user-interface/build')
    // ));
    this.app.get('/ui', (req, res) => {
      console.log('🔄 V1 UI access redirected to V2');
      res.redirect('/');
    });
    
    this.app.get('/v2', (req, res) => {
      console.log('🔄 /v2 access redirected to main domain');
      res.redirect('/');
    });
    
    // API 라우트들
    this.app.use('/api/v2', (req, res, next) => {
      res.json({
        message: 'UI V2 API endpoint ready',
        version: '2.0.0',
        features: ['simplified-ui', 'log-dashboard', 'ai-planner'],
        timestamp: new Date().toISOString()
      });
    });
    
    // 레거시 UI 접근 (호환성 유지)
    this.app.get('/legacy', (req, res) => {
      res.sendFile(path.join(__dirname, 'public/index.html'));
    });
    
    console.log('✅ Modular UI system ready');

    // 404 핸들러
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // 에러 핸들러
    this.app.use((error, req, res, next) => {
      this.logger.error('Express error:', { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
  }

  setupWebSocketServer() {
    // WebSocket 서버 초기화 (재연결 핸들러는 이제 모듈에 내장됨)
    // 주의: HTTP 서버가 시작된 후에 WebSocket 서버를 시작해야 함
    this.wsServer = new WebSocketProtocolServer(this.server, config);
    
    // WebSocket 서버 시작
    this.wsServer.start();

    // MCP 서버 초기화 (LLM 클라이언트 전달)
    let llmClient = null;
    try {
      const { clients: { LLMClient } } = require('@recursive/shared');
      llmClient = new LLMClient();
      this.logger.info('✅ LLM Client initialized successfully');
    } catch (error) {
      this.logger.warn('⚠️ LLM Client not available:', error.message);
      // LLM Client가 없어도 서버는 계속 실행
    }
    
    this.mcpServer = new MCPServer(this.wsServer, llmClient);
    this.logger.info('MCP Server initialized');

    // WebSocket 이벤트 핸들러
    this.wsServer.on('connectionAdded', (connectionId, connectionInfo) => {
      this.logger.logConnection(connectionId, connectionInfo.clientIp, connectionInfo.userAgent);
      
      // 세션 정보 생성 (재연결 핸들러는 이제 모듈에 내장됨)
      const sessionId = require('crypto').randomUUID();
      
      // 클라이언트에게 세션 정보 전송
      this.wsServer.sendToConnection(connectionId, {
        type: 'session_created',
        sessionId: sessionId,
        isReconnection: false, // 모듈에서 처리됨
        timestamp: new Date().toISOString()
      });
    });

    this.wsServer.on('connectionRemoved', (connectionId, connectionInfo) => {
      this.logger.logDisconnection(connectionId, 'unknown', 'Connection removed');
      // 재연결 핸들러는 이제 모듈에서 자동으로 처리됨
    });

    this.wsServer.on('message', ({ connectionId, message, connectionInfo }) => {
      this.logger.logMessage(connectionId, message.type, JSON.stringify(message).length);
      
      // 애플리케이션 레벨 메시지 처리
      this.handleApplicationMessage(connectionId, message, connectionInfo);
    });

    this.wsServer.on('userAuthenticated', (connectionId, userId) => {
      this.logger.info('User authenticated', { connectionId, userId });
    });

    this.wsServer.on('metrics', (metrics) => {
      this.logger.logMetrics(metrics);
    });

    this.wsServer.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
    });
  }

  handleApplicationMessage(connectionId, message, connectionInfo) {
    try {
      switch (message.type) {
        case 'chat':
          this.handleChatMessage(connectionId, message);
          break;
          
        case 'broadcast':
          this.handleBroadcastMessage(connectionId, message);
          break;
          
        case 'echo':
          this.handleEchoMessage(connectionId, message);
          break;
          
        case 'complexity_analysis':
          this.handleComplexityAnalysis(connectionId, message);
          break;
          
        case 'mcp_request':
        case 'mcp_notification':
          // MCP 메시지를 MCP 서버로 전달
          this.handleMCPMessage(connectionId, message);
          break;
          
        default:
          this.logger.warn('Unknown message type:', { 
            connectionId, 
            type: message.type 
          });
      }
    } catch (error) {
      this.logger.logError(connectionId, error, { message });
      
      this.wsServer.sendToConnection(connectionId, {
        type: 'error',
        message: 'Failed to process message',
        timestamp: new Date().toISOString()
      });
    }
  }

  handleMCPMessage(connectionId, message) {
    // console.log('Server handleMCPMessage called with:', {
    //   connectionId,
    //   messageType: typeof message,
    //   messageData: message
    // });
    
    // WebSocket 객체를 찾아서 MCP 서버로 전달
    const ws = this.wsServer.connectionHandler.getConnection(connectionId);
    if (ws && this.mcpServer) {
      // MCP 응답을 위해 connectionId를 WebSocket 객체에 저장
      ws.connectionId = connectionId;
      ws.serverInstance = this;
      this.mcpServer.handleMCPMessage(ws, message);
    } else {
      this.logger.error('Cannot handle MCP message: WebSocket or MCP server not available', {
        connectionId,
        hasWs: !!ws,
        hasMcpServer: !!this.mcpServer
      });
    }
  }

  handleChatMessage(connectionId, message) {
    const response = {
      type: 'chat_response',
      data: {
        originalMessage: message.data,
        response: `Echo: ${message.data}`,
        timestamp: new Date().toISOString(),
        connectionId
      }
    };

    this.wsServer.sendToConnection(connectionId, response);
  }

  handleBroadcastMessage(connectionId, message) {
    const broadcastData = {
      type: 'broadcast',
      data: message.data,
      from: connectionId,
      timestamp: new Date().toISOString()
    };

    const sentCount = this.wsServer.broadcast(broadcastData, [connectionId]);
    
    this.wsServer.sendToConnection(connectionId, {
      type: 'broadcast_status',
      sentTo: sentCount,
      timestamp: new Date().toISOString()
    });
  }

  handleEchoMessage(connectionId, message) {
    this.wsServer.sendToConnection(connectionId, {
      type: 'echo_response',
      data: message.data,
      timestamp: new Date().toISOString()
    });
  }

  async handleComplexityAnalysis(connectionId, message) {
    try {
      // 분석 시작 알림
      this.wsServer.sendToConnection(connectionId, {
        type: 'complexity_analysis_started',
        data: {
          message: 'AI 복잡도 분석을 시작합니다...',
          timestamp: new Date().toISOString()
        }
      });

      let analysisResult;

      if (this.aiAnalysis) {
        // 실제 AI 분석 모듈 사용
        this.logger.info('Starting AI complexity analysis', { connectionId, input: message.data });
        
        analysisResult = await this.aiAnalysis.analyzeComplexity(message.data, {
          includeRecommendations: true,
          includeMetrics: true,
          analysisDepth: 'detailed'
        });

        this.logger.info('AI complexity analysis completed', { 
          connectionId, 
          complexity: analysisResult.complexity 
        });
      } else {
        // 폴백: 기본 분석
        this.logger.warn('AI analysis module not available, using fallback analysis');
        
        analysisResult = {
          complexity: 'medium',
          confidence: 0.7,
          recommendations: [
            '코드 모듈화 권장',
            '단위 테스트 추가 필요',
            '문서화 개선 권장',
            'AI 분석 모듈이 비활성화되어 기본 분석을 사용했습니다.'
          ],
          metrics: {
            linesOfCode: Math.floor(Math.random() * 1000) + 100,
            cyclomaticComplexity: Math.floor(Math.random() * 20) + 1,
            maintainabilityIndex: Math.floor(Math.random() * 100),
            estimatedDevelopmentTime: '2-4 시간'
          },
          analysis: {
            method: 'fallback',
            aiAvailable: false,
            timestamp: new Date().toISOString()
          }
        };
      }

      // 결과 전송
      const response = {
        type: 'complexity_result',
        data: {
          ...analysisResult,
          inputData: message.data,
          processingTime: Date.now() - Date.parse(new Date().toISOString()),
          timestamp: new Date().toISOString()
        }
      };

      this.wsServer.sendToConnection(connectionId, response);

      // 이벤트 버스로 분석 완료 알림
      eventBus.emit('complexity:analysis:completed', {
        connectionId,
        result: analysisResult,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Complexity analysis failed:', { 
        connectionId, 
        error: error.message,
        stack: error.stack 
      });

      // 에러 응답
      this.wsServer.sendToConnection(connectionId, {
        type: 'complexity_error',
        data: {
          error: 'AI 복잡도 분석 중 오류가 발생했습니다.',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // WebSocket 서버 종료
        if (this.wsServer) {
          await this.wsServer.stop();
        }

        // Python 로그 서버 종료
        if (this.pythonLogServer) {
          this.logger.info('Stopping Python log server...');
          this.pythonLogServer.kill('SIGTERM');
          
          // 강제 종료 대기
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              if (this.pythonLogServer) {
                this.pythonLogServer.kill('SIGKILL');
                this.logger.warn('Python log server force killed');
              }
              resolve();
            }, 5000);
            
            if (this.pythonLogServer) {
              this.pythonLogServer.on('exit', () => {
                clearTimeout(timeout);
                resolve();
              });
            } else {
              clearTimeout(timeout);
              resolve();
            }
          });
          
          this.logger.info('Python log server stopped');
        }

        // 로그 클라이언트 정리
        if (this.logClient) {
          this.logClient = null;
          this.logger.info('Log client disconnected');
        }

        // HTTP 서버 종료
        this.server.close(() => {
          this.logger.info('HTTP server closed');
          
          // Logger 종료
          if (this.logger) {
            this.logger.close();
          }
          
          process.exit(0);
        });

        // 강제 종료 타이머
        setTimeout(() => {
          this.logger.error('Forced shutdown due to timeout');
          process.exit(1);
        }, 30000);

      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      console.error('🚨 UNCAUGHT EXCEPTION:', error);
      console.error('Stack trace:', error.stack);
      this.logger.error('Uncaught exception:', { 
        message: error.message, 
        stack: error.stack,
        name: error.name 
      });
      
      // LLM Client 관련 오류는 서버를 종료하지 않음
      if (error.message && error.message.includes('LLMClient')) {
        this.logger.warn('LLM Client related error, continuing operation...');
        return;
      }
      
      // 다른 심각한 오류만 서버 종료
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.logger.error('Unhandled rejection:', { reason, promise });
      
      // MCP 관련 오류는 서버를 종료하지 않음
      if (reason && reason.message && reason.message.includes('MCP')) {
        this.logger.warn('MCP-related rejection, continuing operation...');
        return;
      }
      
      // 다른 심각한 오류만 서버 종료
      this.logger.warn('Unhandled rejection detected, but continuing operation...');
      // shutdown('unhandledRejection');
    });
  }

  start() {
    const port = config.server.port;
    const host = config.server.host;

    this.server.listen(port, host, () => {
      this.logger.info(`🚀 Recursive WebSocket Server started successfully`);
      this.logger.info(`📡 HTTP Server: http://${host}:${port}`);
      this.logger.info(`🔌 WebSocket Server: ws://${host}:${port}`);
      this.logger.info(`📊 Health Check: http://${host}:${port}/health`);
      this.logger.info(`📈 Metrics: http://${host}:${port}/api/metrics`);
      
      if (this.pythonLogServer) {
        this.logger.info(`🐍 Python Log Server: http://${this.pythonServerHost}:${this.pythonServerPort}`);
        this.logger.info(`📝 Log System API: http://${this.pythonServerHost}:${this.pythonServerPort}/rpc`);
      }
    });

    this.server.on('error', (error) => {
      this.logger.error('Server error:', error);
      process.exit(1);
    });
  }
}

// 서버 시작
if (require.main === module) {
  (async () => {
    try {
      const server = new RecursiveServer();
      await server.initialize(); // 비동기 초기화 대기
      server.start();
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  })();
}

module.exports = RecursiveServer; 