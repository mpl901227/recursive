const WebSocket = require('ws');
const EventEmitter = require('events');
const ConnectionHandler = require('./handlers/connection');
const HeartbeatHandler = require('./handlers/heartbeat');
const ReconnectionMiddleware = require('./middleware/reconnection');
const MessageUtils = require('./utils/message');

class WebSocketProtocolServer extends EventEmitter {
  constructor(server, customConfig = {}) {
    super();
    
    this.config = customConfig;
    this.server = server;
    this.wss = null;
    
    // 핸들러들 초기화
    this.connectionHandler = new ConnectionHandler(this.config.websocket || {});
    this.heartbeatHandler = new HeartbeatHandler(this.config.websocket?.heartbeat || {});
    this.reconnectionMiddleware = new ReconnectionMiddleware(this.config.websocket?.reconnection || {});
    
    // 개발 중: 밴된 IP들 초기화
    this.connectionHandler.clearBannedIPs();
    
    // 메트릭 수집 인터벌
    this.metricsInterval = null;
    
    // Graceful shutdown
    this.isShuttingDown = false;
    
    this.setupEventHandlers();
  }

  start() {
    try {
      // WebSocket 서버 생성
      this.wss = new WebSocket.Server({
        server: this.server,
        perMessageDeflate: this.config.websocket?.security?.enableCompression || false,
        maxPayload: this.config.websocket?.security?.maxPayloadLength || 1024 * 1024,
        clientTracking: false // 우리가 직접 관리
      });

      this.setupWebSocketHandlers();
      this.heartbeatHandler.start();
      this.startMetricsCollection();

      console.log('[WebSocketProtocolServer] Server started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('[WebSocketProtocolServer] Failed to start:', error);
      this.emit('error', error);
      throw error;
    }
  }

  stop() {
    return new Promise((resolve) => {
      console.log('[WebSocketProtocolServer] Initiating graceful shutdown...');
      this.isShuttingDown = true;

      // 새로운 연결 거부
      if (this.wss) {
        this.wss.close();
      }

      // 하트비트 핸들러 중지
      this.heartbeatHandler.stop();

      // 메트릭 수집 중지
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // 기존 연결들에게 종료 알림
      this.connectionHandler.broadcast({
        type: 'server_shutdown',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString()
      });

      // 연결 정리 대기
      setTimeout(() => {
        console.log('[WebSocketProtocolServer] Shutdown completed');
        this.emit('stopped');
        resolve();
      }, this.config.server?.gracefulShutdownTimeout || 5000);
    });
  }

  setupEventHandlers() {
    // Connection Handler 이벤트
    this.connectionHandler.on('connectionAdded', (connectionId, connectionInfo) => {
      this.heartbeatHandler.addConnection(connectionId, connectionInfo.ws);
      this.emit('connectionAdded', connectionId, connectionInfo);
    });

    this.connectionHandler.on('connectionRemoved', (connectionId, connectionInfo) => {
      this.heartbeatHandler.removeConnection(connectionId);
      this.reconnectionMiddleware.handleDisconnection(connectionId);
      this.emit('connectionRemoved', connectionId, connectionInfo);
    });

    this.connectionHandler.on('messageReceived', (connectionId, message, connectionInfo) => {
      this.handleMessage(connectionId, message, connectionInfo);
    });

    // Heartbeat Handler 이벤트
    this.heartbeatHandler.on('connectionDead', (connectionId, ws) => {
      console.log(`[WebSocketProtocolServer] Connection ${connectionId} declared dead, terminating`);
      ws.terminate();
      this.connectionHandler.removeConnection(connectionId);
    });

    this.heartbeatHandler.on('ping', (connectionId) => {
      // 핑 전송 로깅 (필요시)
    });

    this.heartbeatHandler.on('pong', (connectionId) => {
      // 퐁 수신 로깅 (필요시)
    });
  }

  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, request) => {
      if (this.isShuttingDown) {
        ws.close(1012, 'Server restarting');
        return;
      }

      const connectionId = this.connectionHandler.addConnection(ws, request);
      if (!connectionId) {
        // Connection rejected (banned IP, server overload, etc.)
        return;
      }

      // WebSocket 이벤트 핸들러 설정
      ws.on('message', (data) => {
        try {
          const message = data.toString();
          this.connectionHandler.handleMessage(connectionId, message);
        } catch (error) {
          console.error(`[WebSocketProtocolServer] Error handling message from ${connectionId}:`, error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[WebSocketProtocolServer] Connection ${connectionId} closed: ${code} ${reason}`);
        this.connectionHandler.removeConnection(connectionId);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocketProtocolServer] WebSocket error for ${connectionId}:`, error);
        this.connectionHandler.removeConnection(connectionId);
      });

      // 재연결 시 큐된 메시지 전송
      this.connectionHandler.flushMessageQueue(connectionId);
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocketProtocolServer] WebSocket Server error:', error);
      this.emit('error', error);
    });
  }

  handleMessage(connectionId, message, connectionInfo) {
    try {
      const parsedMessage = MessageUtils.parseMessage(message);

      // 메시지 유효성 검증
      const validation = MessageUtils.validateMessage(parsedMessage);
      if (!validation.valid) {
        console.warn(`[WebSocketProtocolServer] Invalid message from ${connectionId}:`, validation.errors);
        this.connectionHandler.sendMessage(connectionId, 
          MessageUtils.createError('Invalid message format', 'VALIDATION_ERROR', validation.errors)
        );
        return;
      }

      // 메시지 타입별 처리
      switch (parsedMessage.type) {
        case 'authenticate':
          this.handleAuthentication(connectionId, parsedMessage);
          break;
          
        case 'ping':
          this.handlePing(connectionId);
          break;
          
        case 'reconnect':
          this.handleReconnection(connectionId, parsedMessage);
          break;
          
        default:
          // 일반 메시지 - 애플리케이션 레벨로 전달
          this.emit('message', {
            connectionId,
            message: parsedMessage,
            connectionInfo
          });
      }
      
    } catch (error) {
      console.error(`[WebSocketProtocolServer] Error processing message from ${connectionId}:`, error);
      
      this.connectionHandler.sendMessage(connectionId, 
        MessageUtils.createError('Failed to process message', 'PROCESSING_ERROR')
      );
    }
  }

  handleAuthentication(connectionId, message) {
    try {
      // 토큰 검증 (실제 구현에서는 JWT 등 사용)
      const isValid = this.validateAuthToken(message.token);
      
      if (isValid) {
        // 사용자 ID 추출 (실제로는 토큰에서 추출)
        const userId = message.userId || 'user_' + Date.now();
        
        this.connectionHandler.authenticateConnection(connectionId, userId, message.metadata);
        
        this.connectionHandler.sendMessage(connectionId, {
          type: 'auth_success',
          userId,
          timestamp: new Date().toISOString()
        });
      } else {
        this.connectionHandler.sendMessage(connectionId, 
          MessageUtils.createError('Authentication failed', 'AUTH_FAILED')
        );
      }
    } catch (error) {
      console.error(`[WebSocketProtocolServer] Authentication error for ${connectionId}:`, error);
      this.connectionHandler.sendMessage(connectionId, 
        MessageUtils.createError('Authentication error', 'AUTH_ERROR')
      );
    }
  }

  handlePing(connectionId) {
    this.connectionHandler.sendMessage(connectionId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  handleReconnection(connectionId, message) {
    try {
      const sessionResult = this.reconnectionMiddleware.handleConnection(
        connectionId, 
        message.sessionId, 
        message.connectionInfo
      );

      this.connectionHandler.sendMessage(connectionId, {
        type: 'reconnect_response',
        ...sessionResult,
        timestamp: new Date().toISOString()
      });

      // 큐된 메시지가 있으면 전송
      if (sessionResult.queuedMessages && sessionResult.queuedMessages.length > 0) {
        sessionResult.queuedMessages.forEach(queuedMsg => {
          this.connectionHandler.sendMessage(connectionId, queuedMsg.message);
        });
      }
    } catch (error) {
      console.error(`[WebSocketProtocolServer] Reconnection error for ${connectionId}:`, error);
      this.connectionHandler.sendMessage(connectionId, 
        MessageUtils.createError('Reconnection failed', 'RECONNECT_ERROR')
      );
    }
  }

  validateAuthToken(token) {
    // 실제 구현에서는 JWT 검증 등
    return token && token.length > 0;
  }

  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();
      this.emit('metrics', metrics);
    }, this.config.server?.metricsInterval || 30000);
  }

  // Public API methods
  sendToConnection(connectionId, message) {
    return this.connectionHandler.sendMessage(connectionId, message);
  }

  sendToUser(userId, message) {
    return this.connectionHandler.sendMessageToUser(userId, message);
  }

  broadcast(message, excludeConnectionIds = []) {
    return this.connectionHandler.broadcast(message, excludeConnectionIds);
  }

  getConnectionInfo(connectionId) {
    return this.connectionHandler.getConnectionInfo(connectionId);
  }

  getUserConnections(userId) {
    return this.connectionHandler.getUserConnections(userId);
  }

  getMetrics() {
    return {
      ...this.connectionHandler.getMetrics(),
      heartbeat: this.heartbeatHandler.getConnectionStats(),
      reconnection: this.reconnectionMiddleware.getStats()
    };
  }

  cleanup() {
    this.connectionHandler.cleanup();
    this.heartbeatHandler.stop();
    this.reconnectionMiddleware.cleanupExpiredSessions();
  }
}

module.exports = WebSocketProtocolServer; 