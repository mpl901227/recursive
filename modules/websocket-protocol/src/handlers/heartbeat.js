const EventEmitter = require('events');

class HeartbeatHandler extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connections = new Map(); // connectionId -> { ws, lastPong, missedPings }
    this.pingInterval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.pingInterval = setInterval(() => {
      this.sendPings();
    }, this.config.interval);
    
    console.log(`[HeartbeatHandler] Started with ${this.config.interval}ms interval`);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    console.log('[HeartbeatHandler] Stopped');
  }

  addConnection(connectionId, ws) {
    this.connections.set(connectionId, {
      ws,
      lastPong: Date.now(),
      missedPings: 0,
      isAlive: true
    });

    // 클라이언트로부터 pong 메시지 수신 처리
    ws.on('pong', () => {
      this.handlePong(connectionId);
    });

    console.log(`[HeartbeatHandler] Added connection: ${connectionId}`);
  }

  removeConnection(connectionId) {
    if (this.connections.has(connectionId)) {
      this.connections.delete(connectionId);
      console.log(`[HeartbeatHandler] Removed connection: ${connectionId}`);
    }
  }

  handlePong(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPong = Date.now();
      connection.missedPings = 0;
      connection.isAlive = true;
      
      this.emit('pong', connectionId);
    }
  }

  sendPings() {
    const now = Date.now();
    const connectionsToRemove = [];

    for (const [connectionId, connection] of this.connections) {
      const { ws, lastPong, missedPings } = connection;

      // 연결 상태 확인
      if (ws.readyState !== ws.OPEN) {
        connectionsToRemove.push(connectionId);
        continue;
      }

      // 마지막 pong 이후 시간 확인
      const timeSinceLastPong = now - lastPong;
      
      if (timeSinceLastPong > this.config.timeout) {
        connection.missedPings++;
        
        if (connection.missedPings >= this.config.maxMissed) {
          // 최대 허용 횟수 초과 - 연결 종료
          console.log(`[HeartbeatHandler] Connection ${connectionId} missed ${connection.missedPings} pings, terminating`);
          
          this.emit('connectionDead', connectionId, connection.ws);
          connectionsToRemove.push(connectionId);
          continue;
        }
      }

      // ping 전송
      try {
        ws.ping();
        this.emit('ping', connectionId);
      } catch (error) {
        console.error(`[HeartbeatHandler] Failed to ping ${connectionId}:`, error);
        connectionsToRemove.push(connectionId);
      }
    }

    // 죽은 연결들 제거
    connectionsToRemove.forEach(connectionId => {
      this.removeConnection(connectionId);
    });
  }

  getConnectionStats() {
    const stats = {
      totalConnections: this.connections.size,
      aliveConnections: 0,
      deadConnections: 0
    };

    for (const connection of this.connections.values()) {
      if (connection.isAlive) {
        stats.aliveConnections++;
      } else {
        stats.deadConnections++;
      }
    }

    return stats;
  }

  isConnectionAlive(connectionId) {
    const connection = this.connections.get(connectionId);
    return connection ? connection.isAlive : false;
  }
}

module.exports = HeartbeatHandler; 