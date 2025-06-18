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

// Import log system
const { getLogSystem, initializeLogSystem } = require('../../modules/log-system/src/index');
const RecursiveCollectors = require('../../modules/log-system/src/collectors/recursive-collectors');

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
      // 로그 시스템 초기화
      this.logSystem = await initializeLogSystem({
        configPath: './modules/log-system/config/recursive.yaml',
        environment: process.env.NODE_ENV || 'development',
        watchForChanges: true
      });
      
      console.log('✅ Log system bridge initialized');
      
      // Recursive 특화 수집기 시작
      this.logCollectors = new RecursiveCollectors(this.logSystem, {
        autoRegister: true,
        enableAll: true
      });
      
      await this.logCollectors.start();
      console.log('✅ Log collectors started');
      
      // 이벤트 버스에 로그 시스템 등록
      eventBus.registerModule('log-system', this.logSystem);
      eventBus.registerModule('log-collectors', this.logCollectors);
      
      // 기존 로거를 로그 시스템으로 연결
      this.connectLoggerToLogSystem();
      
      console.log('✅ Log system integration completed');
      
    } catch (error) {
      console.error('❌ Failed to setup log system:', error);
      // 로그 시스템 실패해도 메인 서버는 계속 실행
      this.logSystem = null;
      this.logCollectors = null;
    }
  }

  connectLoggerToLogSystem() {
    if (!this.logSystem || !this.logger) return;
    
    // 기존 로거의 이벤트를 로그 시스템으로 전달
    const originalLog = this.logger.log.bind(this.logger);
    
    this.logger.log = (level, message, metadata = {}) => {
      // 기존 로깅 수행
      originalLog(level, message, metadata);
      
      // 로그 시스템으로도 전송
      if (this.logSystem) {
        this.logSystem.log({
          source: 'recursive_server',
          level: level.toUpperCase(),
          message: typeof message === 'string' ? message : JSON.stringify(message),
          metadata: {
            component: 'server',
            ...metadata
          },
          tags: ['server', 'main']
        }).catch(err => {
          // 로그 시스템 오류가 메인 서버에 영향을 주지 않도록
          console.warn('Log system error:', err.message);
        });
      }
    };
    
    // 편의 메서드들도 연결
    ['info', 'warn', 'error', 'debug'].forEach(level => {
      if (this.logger[level]) {
        const originalMethod = this.logger[level].bind(this.logger);
        this.logger[level] = (message, metadata) => {
          originalMethod(message, metadata);
          
          if (this.logSystem) {
            this.logSystem.log({
              source: 'recursive_server',
              level: level.toUpperCase(),
              message: typeof message === 'string' ? message : JSON.stringify(message),
              metadata: {
                component: 'server',
                ...metadata
              },
              tags: ['server', 'main', level]
            }).catch(() => {}); // 에러 무시
          }
        };
      }
    });
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

    // 정적 파일 서빙
    this.app.use(express.static(path.join(__dirname, 'public')));
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

    // 메인 대시보드
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public/index.html'));
    });

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
    } catch (error) {
      this.logger.warn('LLM Client not available:', error.message);
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

        // 로그 시스템 정리
        if (this.logCollectors) {
          await this.logCollectors.gracefulShutdown();
          this.logger.info('Log collectors stopped');
        }
        
        if (this.logSystem) {
          await this.logSystem.gracefulShutdown();
          this.logger.info('Log system stopped');
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