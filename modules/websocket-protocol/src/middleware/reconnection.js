class ReconnectionMiddleware {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      maxAttempts: config.maxAttempts || 5,
      backoffBase: config.backoffBase || 1000,
      backoffMax: config.backoffMax || 30000,
      backoffMultiplier: config.backoffMultiplier || 1.5,
      jitterEnabled: config.jitterEnabled !== false,
      ...config
    };
    
    this.sessions = new Map(); // sessionId -> session info
    this.connectionSessions = new Map(); // connectionId -> sessionId
  }

  // 세션 생성 또는 복구
  handleConnection(connectionId, sessionId = null, connectionInfo = {}) {
    if (sessionId && this.sessions.has(sessionId)) {
      // 기존 세션 복구
      return this.restoreSession(connectionId, sessionId, connectionInfo);
    } else {
      // 새 세션 생성
      return this.createSession(connectionId, connectionInfo);
    }
  }

  createSession(connectionId, connectionInfo) {
    const sessionId = this.generateSessionId();
    
    const session = {
      id: sessionId,
      connectionId,
      createdAt: new Date(),
      lastConnectedAt: new Date(),
      reconnectCount: 0,
      userData: {},
      queuedMessages: [],
      ...connectionInfo
    };

    this.sessions.set(sessionId, session);
    this.connectionSessions.set(connectionId, sessionId);

    console.log(`[ReconnectionMiddleware] Created new session: ${sessionId} for connection: ${connectionId}`);
    
    return {
      sessionId,
      isReconnection: false,
      queuedMessages: []
    };
  }

  restoreSession(connectionId, sessionId, connectionInfo) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // 세션이 없으면 새로 생성
      return this.createSession(connectionId, connectionInfo);
    }

    // 이전 연결 정리
    if (session.connectionId) {
      this.connectionSessions.delete(session.connectionId);
    }

    // 세션 업데이트
    session.connectionId = connectionId;
    session.lastConnectedAt = new Date();
    session.reconnectCount++;

    this.connectionSessions.set(connectionId, sessionId);

    console.log(`[ReconnectionMiddleware] Restored session: ${sessionId} for connection: ${connectionId} (reconnect #${session.reconnectCount})`);

    // 큐된 메시지 반환
    const queuedMessages = [...session.queuedMessages];
    session.queuedMessages = []; // 큐 비우기

    return {
      sessionId,
      isReconnection: true,
      reconnectCount: session.reconnectCount,
      queuedMessages,
      userData: session.userData
    };
  }

  handleDisconnection(connectionId) {
    const sessionId = this.connectionSessions.get(connectionId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.connectionId = null;
      session.disconnectedAt = new Date();
      
      console.log(`[ReconnectionMiddleware] Connection ${connectionId} disconnected, session ${sessionId} preserved`);
    }

    this.connectionSessions.delete(connectionId);
  }

  queueMessage(connectionId, message) {
    const sessionId = this.connectionSessions.get(connectionId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const queuedMessage = {
      message,
      timestamp: new Date(),
      id: this.generateMessageId()
    };

    session.queuedMessages.push(queuedMessage);

    // 큐 크기 제한
    const maxQueueSize = 100;
    if (session.queuedMessages.length > maxQueueSize) {
      session.queuedMessages.shift(); // 가장 오래된 메시지 제거
    }

    return true;
  }

  getSession(connectionId) {
    const sessionId = this.connectionSessions.get(connectionId);
    return sessionId ? this.sessions.get(sessionId) : null;
  }

  getSessionById(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateSessionData(connectionId, userData) {
    const session = this.getSession(connectionId);
    if (session) {
      session.userData = { ...session.userData, ...userData };
      return true;
    }
    return false;
  }

  // 만료된 세션 정리
  cleanupExpiredSessions(maxAge = 24 * 60 * 60 * 1000) { // 24시간
    const now = new Date();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      const lastActivity = session.disconnectedAt || session.lastConnectedAt;
      if (now - lastActivity > maxAge) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      const session = this.sessions.get(sessionId);
      if (session && session.connectionId) {
        this.connectionSessions.delete(session.connectionId);
      }
      this.sessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      console.log(`[ReconnectionMiddleware] Cleaned up ${expiredSessions.length} expired sessions`);
    }

    return expiredSessions.length;
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.connectionId).length,
      inactiveSessions: Array.from(this.sessions.values()).filter(s => !s.connectionId).length,
      totalQueuedMessages: Array.from(this.sessions.values()).reduce((sum, s) => sum + s.queuedMessages.length, 0)
    };
  }
}

module.exports = ReconnectionMiddleware; 