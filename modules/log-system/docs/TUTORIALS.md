# 📚 Recursive 로그 시스템 튜토리얼

## 📋 **목차**
- [기본 튜토리얼](#기본-튜토리얼)
- [고급 사용법](#고급-사용법)
- [실제 사용 사례](#실제-사용-사례)
- [성능 최적화](#성능-최적화)
- [모니터링 설정](#모니터링-설정)

---

## 🚀 **기본 튜토리얼**

### **1단계: 설치 및 설정**

```bash
# 프로젝트 디렉토리로 이동
cd recursive/modules/log-system

# 의존성 설치
npm install
pip install -r ../../requirements.txt

# 개발 환경 설정
npm run logs:setup:dev
```

### **2단계: 첫 번째 로그 기록**

```javascript
// tutorial-basic.js
const { getLogSystem } = require('./src/index');

async function basicLogging() {
  // 로그 시스템 초기화
  const logSystem = await getLogSystem();
  
  // 기본 로그 기록
  await logSystem.log({
    level: 'INFO',
    message: '첫 번째 로그입니다!',
    source: 'tutorial',
    metadata: {
      user: 'developer',
      action: 'learning'
    }
  });
  
  console.log('로그가 기록되었습니다!');
}

basicLogging().catch(console.error);
```

### **3단계: 로그 조회**

```javascript
// 최근 로그 조회
const recentLogs = await logSystem.query({
  since: '1h',
  limit: 10
});

console.log('최근 로그:', recentLogs.logs);

// 특정 소스의 로그만 조회
const tutorialLogs = await logSystem.query({
  source: 'tutorial',
  since: '1h'
});

console.log('튜토리얼 로그:', tutorialLogs.logs);
```

### **4단계: 로그 검색**

```javascript
// 텍스트 검색
const searchResults = await logSystem.search('첫 번째', '1h');
console.log('검색 결과:', searchResults.logs);

// 메타데이터 검색
const userLogs = await logSystem.query({
  since: '1h',
  metadata_filter: { user: 'developer' }
});
console.log('사용자별 로그:', userLogs.logs);
```

---

## 🔧 **고급 사용법**

### **커스텀 수집기 만들기**

```javascript
// custom-collector-tutorial.js
const { EventEmitter } = require('events');

class WebAnalyticsCollector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.name = 'web_analytics';
    this.config = {
      enabled: true,
      buffer_size: 100,
      flush_interval: 5000,
      ...config
    };
    
    this.buffer = [];
    this.stats = {
      page_views: 0,
      user_actions: 0,
      errors: 0
    };
  }
  
  async initialize(logSystem) {
    this.logSystem = logSystem;
    this.startBufferFlush();
    console.log('웹 분석 수집기가 초기화되었습니다.');
  }
  
  // 페이지 뷰 수집
  trackPageView(data) {
    this.collect({
      type: 'page_view',
      page: data.page,
      user_id: data.user_id,
      timestamp: new Date(),
      metadata: {
        referrer: data.referrer,
        user_agent: data.user_agent,
        session_id: data.session_id
      }
    });
    this.stats.page_views++;
  }
  
  // 사용자 액션 수집
  trackUserAction(data) {
    this.collect({
      type: 'user_action',
      action: data.action,
      target: data.target,
      user_id: data.user_id,
      timestamp: new Date(),
      metadata: {
        position: data.position,
        value: data.value,
        session_id: data.session_id
      }
    });
    this.stats.user_actions++;
  }
  
  async collect(data) {
    try {
      const logEntry = {
        level: this.getLogLevel(data.type),
        message: `${data.type}: ${data.page || data.action}`,
        source: this.name,
        metadata: {
          type: data.type,
          ...data.metadata,
          collected_at: new Date().toISOString()
        }
      };
      
      this.buffer.push(logEntry);
      
      if (this.buffer.length >= this.config.buffer_size) {
        await this.flush();
      }
      
      this.emit('collected', logEntry);
    } catch (error) {
      this.stats.errors++;
      this.emit('error', error);
    }
  }
  
  getLogLevel(type) {
    switch (type) {
      case 'error': return 'ERROR';
      case 'warning': return 'WARN';
      case 'page_view': return 'INFO';
      case 'user_action': return 'DEBUG';
      default: return 'INFO';
    }
  }
  
  async flush() {
    if (this.buffer.length === 0) return;
    
    const entries = this.buffer.splice(0);
    await this.logSystem.logBatch(entries);
    this.emit('flushed', entries.length);
  }
  
  startBufferFlush() {
    setInterval(() => {
      this.flush().catch(error => this.emit('error', error));
    }, this.config.flush_interval);
  }
  
  getStats() {
    return { ...this.stats };
  }
}

// 사용 예제
async function webAnalyticsTutorial() {
  const logSystem = await getLogSystem();
  const webCollector = new WebAnalyticsCollector();
  
  // 수집기 등록
  const collectors = logSystem.getCollectors();
  collectors.registerCollector('web_analytics', webCollector);
  
  // 페이지 뷰 추적
  webCollector.trackPageView({
    page: '/dashboard',
    user_id: 'user123',
    referrer: '/login',
    user_agent: 'Mozilla/5.0...',
    session_id: 'sess_abc123'
  });
  
  // 사용자 액션 추적
  webCollector.trackUserAction({
    action: 'button_click',
    target: 'save_button',
    user_id: 'user123',
    position: { x: 150, y: 200 },
    session_id: 'sess_abc123'
  });
  
  // 통계 확인
  setTimeout(() => {
    console.log('웹 분석 통계:', webCollector.getStats());
  }, 6000);
}

webAnalyticsTutorial().catch(console.error);
```

### **MCP 도구 개발하기**

```javascript
// custom-mcp-tool-tutorial.js
const webAnalyticsTool = {
  name: "web_analytics_report",
  description: "웹 분석 리포트 생성",
  inputSchema: {
    type: "object",
    properties: {
      timerange: {
        type: "string",
        default: "24h",
        description: "분석 기간"
      },
      report_type: {
        type: "string",
        enum: ["summary", "detailed", "user_behavior"],
        default: "summary",
        description: "리포트 타입"
      }
    }
  },
  handler: async (params, logSystem) => {
    // 웹 분석 로그 조회
    const logs = await logSystem.query({
      source: 'web_analytics',
      since: params.timerange,
      limit: 10000
    });
    
    const analytics = {
      total_events: logs.count,
      page_views: 0,
      user_actions: 0,
      unique_users: new Set(),
      popular_pages: {}
    };
    
    // 로그 분석
    logs.logs.forEach(log => {
      const metadata = log.metadata;
      
      if (metadata.type === 'page_view') {
        analytics.page_views++;
        analytics.popular_pages[log.message] = 
          (analytics.popular_pages[log.message] || 0) + 1;
      } else if (metadata.type === 'user_action') {
        analytics.user_actions++;
      }
      
      if (metadata.user_id) {
        analytics.unique_users.add(metadata.user_id);
      }
    });
    
    // 인기 페이지 정렬
    const sortedPages = Object.entries(analytics.popular_pages)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    return {
      timerange: params.timerange,
      summary: {
        total_events: analytics.total_events,
        page_views: analytics.page_views,
        user_actions: analytics.user_actions,
        unique_users: analytics.unique_users.size,
        avg_events_per_user: analytics.total_events / analytics.unique_users.size
      },
      popular_pages: sortedPages,
      generated_at: new Date().toISOString()
    };
  }
};

// MCP 도구 등록 및 사용
async function mcpToolTutorial() {
  const logSystem = await getLogSystem();
  
  // 도구 등록
  logSystem.addMCPTool(webAnalyticsTool);
  
  // 도구 사용
  const report = await logSystem.callMCPTool('web_analytics_report', {
    timerange: '1h',
    report_type: 'summary'
  });
  
  console.log('웹 분석 리포트:', report);
}
```

---

## 🎯 **실제 사용 사례**

### **사례 1: 전자상거래 주문 추적**

```javascript
// ecommerce-logging-tutorial.js
class EcommerceLogger {
  constructor(logSystem) {
    this.logSystem = logSystem;
  }
  
  async trackOrder(orderData) {
    await this.logSystem.log({
      level: 'INFO',
      message: `주문 생성: ${orderData.order_id}`,
      source: 'ecommerce_orders',
      metadata: {
        order_id: orderData.order_id,
        user_id: orderData.user_id,
        total_amount: orderData.total_amount,
        items_count: orderData.items.length,
        payment_method: orderData.payment_method,
        order_status: 'created'
      }
    });
  }
  
  async trackPayment(paymentData) {
    await this.logSystem.log({
      level: paymentData.success ? 'INFO' : 'ERROR',
      message: `결제 ${paymentData.success ? '성공' : '실패'}: ${paymentData.order_id}`,
      source: 'ecommerce_payments',
      metadata: {
        order_id: paymentData.order_id,
        payment_id: paymentData.payment_id,
        amount: paymentData.amount,
        success: paymentData.success,
        processing_time_ms: paymentData.processing_time
      }
    });
  }
}

// 사용 예제
async function ecommerceTutorial() {
  const logSystem = await getLogSystem();
  const ecommerceLogger = new EcommerceLogger(logSystem);
  
  // 주문 생성
  await ecommerceLogger.trackOrder({
    order_id: 'ORD-2024-001',
    user_id: 'user123',
    total_amount: 89.99,
    items: [
      { product_id: 'PROD-001', quantity: 2, price: 29.99 }
    ],
    payment_method: 'credit_card'
  });
  
  // 결제 처리
  await ecommerceLogger.trackPayment({
    order_id: 'ORD-2024-001',
    payment_id: 'PAY-2024-001',
    amount: 89.99,
    success: true,
    processing_time: 1250
  });
}
```

### **사례 2: API 성능 모니터링**

```javascript
// api-monitoring-tutorial.js
class APIMonitor {
  constructor(logSystem) {
    this.logSystem = logSystem;
  }
  
  createMiddleware() {
    return async (req, res, next) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || this.generateId();
      
      // 요청 시작 로그
      await this.logSystem.log({
        level: 'DEBUG',
        message: `API 요청 시작: ${req.method} ${req.path}`,
        source: 'api_monitor',
        metadata: {
          request_id: requestId,
          method: req.method,
          path: req.path,
          user_agent: req.headers['user-agent'],
          ip: req.ip
        }
      });
      
      // 응답 완료 시 로그
      res.on('finish', async () => {
        const duration = Date.now() - startTime;
        const level = this.getLogLevel(res.statusCode, duration);
        
        await this.logSystem.log({
          level,
          message: `API 요청 완료: ${req.method} ${req.path} [${res.statusCode}] ${duration}ms`,
          source: 'api_monitor',
          metadata: {
            request_id: requestId,
            status_code: res.statusCode,
            duration_ms: duration,
            is_error: res.statusCode >= 400,
            is_slow: duration > 1000
          }
        });
      });
      
      next();
    };
  }
  
  getLogLevel(statusCode, duration) {
    if (statusCode >= 500) return 'ERROR';
    if (statusCode >= 400) return 'WARN';
    if (duration > 2000) return 'WARN';
    return 'INFO';
  }
  
  generateId() {
    return 'req_' + Math.random().toString(36).substr(2, 9);
  }
}
```

---

## ⚡ **성능 최적화**

### **배치 처리 최적화**

```javascript
// batch-optimization-tutorial.js
class OptimizedBatchLogger {
  constructor(logSystem, options = {}) {
    this.logSystem = logSystem;
    this.options = {
      batchSize: 1000,
      flushInterval: 5000,
      maxMemoryMB: 100,
      compressionEnabled: true,
      ...options
    };
    
    this.buffer = [];
    this.stats = {
      batches_sent: 0,
      logs_processed: 0
    };
    
    this.startAutoFlush();
  }
  
  async log(entry) {
    this.buffer.push(entry);
    this.stats.logs_processed++;
    
    // 메모리 사용량 체크
    if (this.getMemoryUsageMB() > this.options.maxMemoryMB) {
      await this.flush();
    }
    
    // 배치 크기 체크
    if (this.buffer.length >= this.options.batchSize) {
      await this.flush();
    }
  }
  
  async flush() {
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer.splice(0);
    
    try {
      await this.logSystem.logBatch(batch, this.options.compressionEnabled);
      this.stats.batches_sent++;
      console.log(`배치 전송 완료: ${batch.length}개 로그`);
    } catch (error) {
      console.error('배치 전송 실패:', error);
      this.buffer.unshift(...batch);
    }
  }
  
  startAutoFlush() {
    setInterval(() => {
      this.flush().catch(console.error);
    }, this.options.flushInterval);
  }
  
  getMemoryUsageMB() {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }
}

// 사용 예제
async function batchOptimizationTutorial() {
  const logSystem = await getLogSystem();
  const batchLogger = new OptimizedBatchLogger(logSystem, {
    batchSize: 500,
    flushInterval: 3000
  });
  
  // 대량 로그 생성
  console.log('대량 로그 생성 시작...');
  const startTime = Date.now();
  
  for (let i = 0; i < 10000; i++) {
    await batchLogger.log({
      level: 'INFO',
      message: `배치 테스트 로그 ${i}`,
      source: 'batch_test',
      metadata: {
        batch_id: Math.floor(i / 100),
        sequence: i
      }
    });
  }
  
  const duration = Date.now() - startTime;
  console.log(`배치 처리 완료: ${duration}ms`);
}
```

---

## 📊 **모니터링 설정**

### **대시보드 생성**

```javascript
// monitoring-dashboard-tutorial.js
class LoggingDashboard {
  constructor(logSystem) {
    this.logSystem = logSystem;
  }
  
  async generateDashboard(timerange = '24h') {
    const [stats, errors, performance, topSources] = await Promise.all([
      this.getBasicStats(timerange),
      this.getErrorAnalysis(timerange),
      this.getPerformanceMetrics(timerange),
      this.getTopSources(timerange)
    ]);
    
    return {
      timerange,
      generated_at: new Date().toISOString(),
      basic_stats: stats,
      error_analysis: errors,
      performance: performance,
      top_sources: topSources,
      health_score: this.calculateHealthScore(stats, errors, performance)
    };
  }
  
  async getBasicStats(timerange) {
    const logs = await this.logSystem.query({
      since: timerange,
      limit: 1
    });
    
    const levelStats = await this.logSystem.query({
      since: timerange,
      group_by: 'level'
    });
    
    return {
      total_logs: logs.total,
      by_level: levelStats.groups || {},
      logs_per_hour: Math.round(logs.total / this.getHours(timerange))
    };
  }
  
  async getErrorAnalysis(timerange) {
    const errors = await this.logSystem.query({
      since: timerange,
      level: 'ERROR',
      limit: 1000
    });
    
    const errorPatterns = {};
    errors.logs.forEach(log => {
      const key = log.message.split(':')[0]; // 에러 타입 추출
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    });
    
    return {
      total_errors: errors.count,
      error_rate: (errors.count / (await this.getBasicStats(timerange)).total_logs * 100).toFixed(2) + '%',
      top_error_patterns: Object.entries(errorPatterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }
  
  async getPerformanceMetrics(timerange) {
    const status = await this.logSystem.getSystemStatus();
    
    return {
      avg_response_time: status.performance?.avg_response_time || 0,
      memory_usage_mb: status.python_server?.memory_mb || 0,
      database_size_mb: status.database?.size_mb || 0,
      active_connections: status.connections?.active || 0
    };
  }
  
  async getTopSources(timerange) {
    const sources = await this.logSystem.query({
      since: timerange,
      group_by: 'source'
    });
    
    return Object.entries(sources.groups || {})
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
  }
  
  calculateHealthScore(stats, errors, performance) {
    let score = 100;
    
    // 에러율 패널티
    const errorRate = parseFloat(errors.error_rate);
    if (errorRate > 5) score -= 30;
    else if (errorRate > 1) score -= 10;
    
    // 성능 패널티
    if (performance.avg_response_time > 2000) score -= 20;
    else if (performance.avg_response_time > 1000) score -= 10;
    
    // 메모리 사용량 패널티
    if (performance.memory_usage_mb > 500) score -= 15;
    else if (performance.memory_usage_mb > 200) score -= 5;
    
    return Math.max(0, score);
  }
  
  getHours(timerange) {
    const match = timerange.match(/(\d+)([hd])/);
    if (!match) return 24;
    
    const [, num, unit] = match;
    return unit === 'h' ? parseInt(num) : parseInt(num) * 24;
  }
  
  async generateReport() {
    const dashboard = await this.generateDashboard();
    
    console.log('\n=== 로그 시스템 대시보드 ===');
    console.log(`생성 시간: ${dashboard.generated_at}`);
    console.log(`분석 기간: ${dashboard.timerange}`);
    console.log(`\n📊 기본 통계:`);
    console.log(`  총 로그 수: ${dashboard.basic_stats.total_logs.toLocaleString()}`);
    console.log(`  시간당 로그: ${dashboard.basic_stats.logs_per_hour.toLocaleString()}`);
    console.log(`  레벨별 분포:`, dashboard.basic_stats.by_level);
    
    console.log(`\n🚨 에러 분석:`);
    console.log(`  총 에러 수: ${dashboard.error_analysis.total_errors}`);
    console.log(`  에러율: ${dashboard.error_analysis.error_rate}`);
    console.log(`  주요 에러 패턴:`, dashboard.error_analysis.top_error_patterns);
    
    console.log(`\n⚡ 성능 메트릭:`);
    console.log(`  평균 응답 시간: ${dashboard.performance.avg_response_time}ms`);
    console.log(`  메모리 사용량: ${dashboard.performance.memory_usage_mb}MB`);
    console.log(`  DB 크기: ${dashboard.performance.database_size_mb}MB`);
    
    console.log(`\n🏆 상위 로그 소스:`);
    dashboard.top_sources.forEach(([source, count], index) => {
      console.log(`  ${index + 1}. ${source}: ${count.toLocaleString()}`);
    });
    
    console.log(`\n💚 시스템 건강도: ${dashboard.health_score}/100`);
    
    return dashboard;
  }
}

// 사용 예제
async function monitoringTutorial() {
  const logSystem = await getLogSystem();
  const dashboard = new LoggingDashboard(logSystem);
  
  // 대시보드 생성
  await dashboard.generateReport();
  
  // 주기적 모니터링 설정
  setInterval(async () => {
    const healthScore = (await dashboard.generateDashboard()).health_score;
    
    if (healthScore < 70) {
      console.warn(`⚠️ 시스템 건강도 경고: ${healthScore}/100`);
      
      // 알림 또는 자동 복구 로직
      if (healthScore < 50) {
        console.error('🚨 심각한 시스템 문제 감지! 관리자에게 알림 발송');
      }
    }
  }, 300000); // 5분마다 체크
}

monitoringTutorial().catch(console.error);
```

---

## 🎓 **다음 단계**

1. **[API 참조](./API_REFERENCE.md)**: 상세한 API 문서 확인
2. **[개발자 가이드](./DEVELOPER_GUIDE.md)**: 고급 개발 기법 학습
3. **[트러블슈팅](./TROUBLESHOOTING.md)**: 문제 해결 방법 숙지
4. **[성능 튜닝](./PERFORMANCE_TUNING.md)**: 시스템 최적화 방법

### **커뮤니티 및 지원**

- GitHub Issues: 버그 리포트 및 기능 요청
- 개발자 포럼: 질문 및 토론
- 문서 기여: 개선사항 제안

---

**축하합니다! 🎉** 
Recursive 로그 시스템의 기본 및 고급 사용법을 모두 학습하셨습니다! 이제 프로덕션 환경에서 강력한 로깅 시스템을 구축할 준비가 되었습니다! 