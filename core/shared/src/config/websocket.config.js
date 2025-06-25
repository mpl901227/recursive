module.exports = {
  server: {
    port: process.env.WS_PORT || 3001,
    host: process.env.WS_HOST || 'localhost',
    maxConnections: process.env.WS_MAX_CONNECTIONS || 1000,
    gracefulShutdownTimeout: process.env.WS_SHUTDOWN_TIMEOUT || 30000
  },
  
  websocket: {
    // 핑퐁 설정
    heartbeat: {
      interval: 30000, // 30초마다 핑 전송
      timeout: 5000,   // 5초 내 응답 없으면 연결 끊기
      maxMissed: 3     // 3번 연속 놓치면 연결 끊기
    },
    
    // 재연결 설정
    reconnection: {
      enabled: true,
      maxAttempts: 5,
      backoffBase: 1000,    // 1초
      backoffMax: 30000,    // 최대 30초
      backoffMultiplier: 1.5
    },
    
    // 메시지 큐 설정
    messageQueue: {
      maxSize: 100,
      persistOfflineMessages: true,
      offlineMessageTtl: 3600000 // 1시간
    },
    
    // 연결 제한 - 개발 중에는 비활성화
    rateLimiting: {
      enabled: false,        // 개발 중에는 rate limiting 비활성화
      windowSize: 1000,      // 1초 윈도우
      maxRequests: 100,      // 1초에 100개 메시지 허용
      banDuration: 5000      // 5초 밴
    },
    
    // 보안 설정
    security: {
      enableCors: true,
      allowedOrigins: ['http://localhost:3000', 'https://localhost:3000'],
      enableCompression: true,
      maxPayloadLength: 1024 * 1024 // 1MB
    }
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableMetrics: true,
    metricsInterval: 60000 // 1분마다 메트릭 로깅
  }
}; 