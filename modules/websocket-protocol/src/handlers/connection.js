const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class ConnectionHandler extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // 디버깅: Rate limiting 설정 확인
    console.log('[ConnectionHandler] Rate limiting config:', {
      enabled: config.rateLimiting?.enabled,
      rateLimiting: config.rateLimiting
    });
    
    this.connections = new Map(); // connectionId -> connection info
    this.userConnections = new Map(); // userId -> Set of connectionIds
    this.messageQueues = new Map(); // connectionId -> message queue
    this.rateLimiters = new Map(); // connectionId -> rate limit info
    this.bannedConnections = new Set(); // IP addresses
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      reconnections: 0,
      rateLimitViolations: 0
    };
  }

  addConnection(ws, request) {
    const connectionId = uuidv4();
    const clientIp = this.getClientIp(request);
    
    // IP 밴 체크 (개발 중에는 비활성화)
    if (this.config.rateLimiting.enabled && this.bannedConnections.has(clientIp)) {
      ws.close(1008, 'IP banned');
      return null;
    }

    // 최대 연결 수 체크
    if (this.connections.size >= this.config.maxConnections) {
      ws.close(1013, 'Server overloaded');
      return null;
    }

    const connectionInfo = {
      id: connectionId,
      ws,
      clientIp,
      userAgent: request.headers['user-agent'],
      connectedAt: new Date(),
      lastActivity: new Date(),
      isAuthenticated: false,
      userId: null,
      metadata: {}
    };

    this.connections.set(connectionId, connectionInfo);
    
    // Rate limiting이 활성화된 경우에만 초기화
    if (this.config.rateLimiting?.enabled) {
      this.initializeRateLimiter(connectionId);
    }
    
    this.initializeMessageQueue(connectionId);

    this.metrics.totalConnections++;
    this.metrics.activeConnections++;

    console.log(`[ConnectionHandler] New connection: ${connectionId} from ${clientIp}`);
    this.emit('connectionAdded', connectionId, connectionInfo);

    return connectionId;
  }

  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // 사용자 연결 맵에서 제거
    if (connection.userId) {
      const userConnections = this.userConnections.get(connection.userId);
      if (userConnections) {
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // 정리
    this.connections.delete(connectionId);
    this.messageQueues.delete(connectionId);
    this.rateLimiters.delete(connectionId);

    this.metrics.activeConnections--;

    console.log(`[ConnectionHandler] Connection removed: ${connectionId}`);
    this.emit('connectionRemoved', connectionId, connection);
  }

  authenticateConnection(connectionId, userId, metadata = {}) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    connection.isAuthenticated = true;
    connection.userId = userId;
    connection.metadata = { ...connection.metadata, ...metadata };

    // 사용자 연결 맵에 추가
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(connectionId);

    console.log(`[ConnectionHandler] Connection authenticated: ${connectionId} -> ${userId}`);
    this.emit('connectionAuthenticated', connectionId, userId);

    return true;
  }

  sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    
    if (!connection || connection.ws.readyState !== connection.ws.OPEN) {
      // 오프라인 메시지 큐에 저장
      this.queueMessage(connectionId, message);
      return false;
    }

    try {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      connection.ws.send(messageStr);
      connection.lastActivity = new Date();
      this.metrics.messagesSent++;
      return true;
    } catch (error) {
      console.error(`[ConnectionHandler] Failed to send message to ${connectionId}:`, error);
      return false;
    }
  }

  sendMessageToUser(userId, message) {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) return 0;

    let sentCount = 0;
    for (const connectionId of userConnections) {
      if (this.sendMessage(connectionId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  broadcast(message, excludeConnectionIds = []) {
    let sentCount = 0;
    const excludeSet = new Set(excludeConnectionIds);

    for (const [connectionId, connection] of this.connections) {
      if (excludeSet.has(connectionId)) continue;
      
      if (connection.ws.readyState === connection.ws.OPEN) {
        if (this.sendMessage(connectionId, message)) {
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  handleMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // 디버깅 로그
    console.log(`[ConnectionHandler] Handling message for ${connectionId}, rateLimitingEnabled: ${this.config.rateLimiting?.enabled}`);

    // Rate limiting 체크 (비활성화된 경우 건너뛰기)
    if (this.config.rateLimiting?.enabled && !this.checkRateLimit(connectionId)) {
      console.warn(`[ConnectionHandler] Rate limit exceeded for ${connectionId}`);
      this.metrics.rateLimitViolations++;
      
      // 일시적으로 IP 밴
      this.bannedConnections.add(connection.clientIp);
      setTimeout(() => {
        this.bannedConnections.delete(connection.clientIp);
      }, this.config.rateLimiting.banDuration);

      connection.ws.close(1008, 'Rate limit exceeded');
      return false;
    }

    connection.lastActivity = new Date();
    this.metrics.messagesReceived++;

    this.emit('messageReceived', connectionId, message, connection);
    return true;
  }

  initializeRateLimiter(connectionId) {
    this.rateLimiters.set(connectionId, {
      windowStart: Date.now(),
      requestCount: 0,
      windowSize: this.config.rateLimiting.windowSize,
      maxRequests: this.config.rateLimiting.maxRequests
    });
  }

  checkRateLimit(connectionId) {
    // Rate limiting이 비활성화되어 있으면 항상 허용
    if (!this.config.rateLimiting?.enabled) {
      return true;
    }
    
    const limiter = this.rateLimiters.get(connectionId);
    if (!limiter) return true;

    const now = Date.now();
    
    // 윈도우 리셋 체크
    if (now - limiter.windowStart >= limiter.windowSize) {
      limiter.windowStart = now;
      limiter.requestCount = 0;
    }

    limiter.requestCount++;
    return limiter.requestCount <= limiter.maxRequests;
  }

  initializeMessageQueue(connectionId) {
    this.messageQueues.set(connectionId, []);
  }

  queueMessage(connectionId, message) {
    const queue = this.messageQueues.get(connectionId);
    if (!queue) return;

    const queuedMessage = {
      message,
      timestamp: Date.now(),
      id: uuidv4()
    };

    queue.push(queuedMessage);

    // 큐 크기 제한
    const maxQueueSize = this.config.maxQueueSize || 100;
    if (queue.length > maxQueueSize) {
      queue.shift(); // 가장 오래된 메시지 제거
    }
  }

  flushMessageQueue(connectionId) {
    const queue = this.messageQueues.get(connectionId);
    const connection = this.connections.get(connectionId);
    
    if (!queue || !connection || connection.ws.readyState !== connection.ws.OPEN) {
      return;
    }

    const messagesToSend = [...queue];
    queue.length = 0; // 큐 비우기

    messagesToSend.forEach(queuedMessage => {
      try {
        this.sendMessage(connectionId, queuedMessage.message);
      } catch (error) {
        console.error(`[ConnectionHandler] Failed to send queued message:`, error);
      }
    });

    console.log(`[ConnectionHandler] Flushed ${messagesToSend.length} queued messages for ${connectionId}`);
  }

  getClientIp(request) {
    return request.headers['x-forwarded-for']?.split(',')[0] ||
           request.headers['x-real-ip'] ||
           request.connection.remoteAddress ||
           request.socket.remoteAddress ||
           'unknown';
  }

  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  getConnectionInfo(connectionId) {
    const connection = this.connections.get(connectionId);
    return connection ? { ...connection, ws: undefined } : null;
  }

  getUserConnections(userId) {
    const connectionIds = this.userConnections.get(userId);
    return connectionIds ? Array.from(connectionIds) : [];
  }

  getMetrics() {
    return {
      ...this.metrics,
      queuedMessages: Array.from(this.messageQueues.values()).reduce((sum, queue) => sum + queue.length, 0)
    };
  }

  cleanup() {
    this.connections.clear();
    this.userConnections.clear();
    this.messageQueues.clear();
    this.rateLimiters.clear();
    this.bannedConnections.clear();
  }

  clearBannedIPs() {
    this.bannedConnections.clear();
    console.log('[ConnectionHandler] Cleared all banned IPs');
  }
}

module.exports = ConnectionHandler; 