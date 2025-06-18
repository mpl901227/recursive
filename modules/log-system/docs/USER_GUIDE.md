# 📖 Recursive 로그 시스템 사용자 가이드

## 📋 **목차**
- [시작하기](#시작하기)
- [기본 사용법](#기본-사용법)
- [고급 기능](#고급-기능)
- [MCP 도구 활용](#mcp-도구-활용)
- [모니터링 및 분석](#모니터링-및-분석)
- [문제 해결](#문제-해결)

---

## 🚀 **시작하기**

### **설치 및 설정**

1. **의존성 설치**
```bash
cd modules/log-system
npm install
pip install -r ../../requirements.txt
```

2. **환경 설정**
```bash
# 개발 환경 설정
npm run logs:setup:dev

# 또는 수동 설정
cp config/development.yaml config/local.yaml
```

3. **로그 시스템 시작**
```bash
# 전체 시스템 시작
npm run logs:start

# 또는 개발 모드
npm run logs:dev
```

### **첫 번째 로그 기록**

```javascript
const { getLogSystem } = require('@recursive/log-system');

async function firstLog() {
  const logSystem = await getLogSystem();
  
  await logSystem.log({
    level: 'INFO',
    message: '첫 번째 로그입니다!',
    source: 'tutorial',
    metadata: { 
      user: 'developer',
      action: 'learning'
    }
  });
  
  console.log('로그가 성공적으로 기록되었습니다!');
}

firstLog().catch(console.error);
```

---

## 📝 **기본 사용법**

### **로그 레벨**

로그 시스템은 5가지 레벨을 지원합니다:

- **DEBUG**: 디버깅 정보 (개발 중에만 사용)
- **INFO**: 일반 정보 (정상 동작 기록)
- **WARN**: 경고 (문제가 될 수 있는 상황)
- **ERROR**: 에러 (처리된 오류)
- **FATAL**: 치명적 에러 (시스템 중단 수준)

```javascript
// 다양한 레벨의 로그 기록
await logSystem.log({ level: 'DEBUG', message: '디버그 정보', source: 'app' });
await logSystem.log({ level: 'INFO', message: '사용자 로그인', source: 'auth' });
await logSystem.log({ level: 'WARN', message: '메모리 사용량 높음', source: 'system' });
await logSystem.log({ level: 'ERROR', message: 'DB 연결 실패', source: 'database' });
await logSystem.log({ level: 'FATAL', message: '시스템 크래시', source: 'core' });
```

### **로그 소스**

로그의 출처를 명확히 하기 위해 소스를 지정합니다:

```javascript
// 권장 소스 명명 규칙
await logSystem.log({ 
  level: 'INFO', 
  message: 'API 요청 처리', 
  source: 'http_traffic' 
});

await logSystem.log({ 
  level: 'DEBUG', 
  message: 'MCP 도구 호출', 
  source: 'mcp_calls' 
});

await logSystem.log({ 
  level: 'INFO', 
  message: 'AI 분석 완료', 
  source: 'ai_analysis' 
});
```

### **메타데이터 활용**

로그에 구조화된 데이터를 포함시킬 수 있습니다:

```javascript
await logSystem.log({
  level: 'INFO',
  message: '사용자 주문 처리',
  source: 'ecommerce',
  metadata: {
    user_id: 12345,
    order_id: 'ORD-2024-001',
    amount: 99.99,
    currency: 'USD',
    items: ['item1', 'item2'],
    processing_time_ms: 234,
    ip_address: '192.168.1.100'
  }
});
```

### **배치 로그 기록**

대량의 로그를 효율적으로 처리:

```javascript
const logs = [
  { level: 'INFO', message: '배치 처리 시작', source: 'batch' },
  { level: 'DEBUG', message: '아이템 1 처리', source: 'batch' },
  { level: 'DEBUG', message: '아이템 2 처리', source: 'batch' },
  { level: 'INFO', message: '배치 처리 완료', source: 'batch' }
];

await logSystem.logBatch(logs, true); // 압축 활성화
```

---

## 🔍 **로그 조회 및 검색**

### **기본 조회**

```javascript
// 최근 1시간의 모든 로그
const recentLogs = await logSystem.query({
  since: '1h',
  limit: 100
});

// 특정 레벨의 로그만 조회
const errorLogs = await logSystem.query({
  levels: ['ERROR', 'FATAL'],
  since: '24h'
});

// 특정 소스의 로그만 조회
const authLogs = await logSystem.query({
  sources: ['auth', 'login'],
  since: '6h'
});
```

### **시간 범위 지정**

```javascript
// 다양한 시간 형식 지원
await logSystem.query({ since: '30m' });    // 30분
await logSystem.query({ since: '2h' });     // 2시간
await logSystem.query({ since: '1d' });     // 1일
await logSystem.query({ since: '1w' });     // 1주일

// 특정 시간 범위
await logSystem.query({
  since: '2024-01-15T09:00:00Z',
  until: '2024-01-15T17:00:00Z'
});
```

### **전문 검색**

```javascript
// 메시지 내용 검색
const searchResults = await logSystem.search(
  '데이터베이스 연결',  // 검색어
  '24h',               // 시간 범위
  3                    // 컨텍스트 라인 수
);

// 복잡한 검색 쿼리
const complexSearch = await logSystem.search(
  'ERROR AND (timeout OR connection)',
  '1d'
);
```

### **페이지네이션**

```javascript
// 첫 번째 페이지
const page1 = await logSystem.query({
  since: '1d',
  limit: 50,
  offset: 0
});

// 두 번째 페이지
const page2 = await logSystem.query({
  since: '1d',
  limit: 50,
  offset: 50
});
```

---

## 🔧 **고급 기능**

### **추적 ID 활용**

관련된 로그들을 연결하여 추적:

```javascript
const traceId = 'trace_' + Date.now();

// 요청 시작
await logSystem.log({
  level: 'INFO',
  message: 'API 요청 시작',
  source: 'api',
  trace_id: traceId,
  metadata: { endpoint: '/users/profile' }
});

// 중간 처리
await logSystem.log({
  level: 'DEBUG',
  message: '데이터베이스 조회',
  source: 'database',
  trace_id: traceId,
  metadata: { query: 'SELECT * FROM users WHERE id = ?' }
});

// 요청 완료
await logSystem.log({
  level: 'INFO',
  message: 'API 요청 완료',
  source: 'api',
  trace_id: traceId,
  metadata: { duration_ms: 156, status: 200 }
});
```

### **수집기 활용**

자동 로그 수집을 위한 수집기 설정:

```javascript
const { RecursiveCollectors } = require('@recursive/log-system');

// 수집기 초기화
const collectors = new RecursiveCollectors(logSystem, {
  autoRegister: true,
  enableAll: true
});

// HTTP 요청 자동 수집 (Express 미들웨어)
app.use(collectors.getCollector('recursive_http').middleware());

// 커스텀 수집기 등록
collectors.registerCollector('database', {
  name: 'database',
  collect: async (query, duration) => {
    await logSystem.log({
      level: 'DEBUG',
      message: `DB Query: ${query}`,
      source: 'database',
      metadata: { duration_ms: duration, query }
    });
  }
});
```

### **설정 관리**

런타임에 설정 변경:

```javascript
// 설정 값 조회
const currentLogLevel = logSystem.getConfigValue('logging.default_level');

// 설정 값 변경
logSystem.updateConfig('logging.default_level', 'DEBUG');

// 설정 변경 이벤트 리스닝
logSystem.on('config:value_changed', (path, newValue, oldValue) => {
  console.log(`설정 변경: ${path} = ${newValue} (이전: ${oldValue})`);
});
```

---

## 🛠️ **MCP 도구 활용**

### **최근 에러 분석**

```javascript
// MCP 도구로 최근 에러 분석
const mcpTools = logSystem.getMCPTools();

const errorAnalysis = await mcpTools.get_recent_errors({
  minutes: 30,
  sources: ['api', 'database'],
  limit: 50
});

console.log('에러 요약:', errorAnalysis.summary);
console.log('소스별 에러:', errorAnalysis.statistics.by_source);
console.log('최근 에러들:', errorAnalysis.recent_errors);
```

### **성능 분석**

```javascript
// 성능 분석 및 슬로우 쿼리 탐지
const performance = await mcpTools.analyze_performance({
  timerange: '1h',
  threshold_ms: 1000,
  include_percentiles: true
});

console.log('HTTP 성능:', performance.http_performance);
console.log('DB 성능:', performance.database_performance);
console.log('느린 요청들:', performance.http_performance.slowest_requests);
```

### **시스템 모니터링**

```javascript
// 시스템 상태 모니터링
const systemStatus = await mcpTools.monitor_system({
  check_memory: true,
  check_disk: true,
  check_connections: true
});

console.log('시스템 상태:', systemStatus.status);
console.log('메모리 사용량:', systemStatus.memory);
console.log('디스크 사용량:', systemStatus.disk);
```

### **요청 추적**

```javascript
// 특정 요청의 전체 흐름 추적
const trace = await mcpTools.trace_request({
  trace_id: 'trace_12345',
  include_related: true,
  max_depth: 10
});

console.log('추적 결과:', trace.timeline);
console.log('관련 로그들:', trace.related_logs);
```

---

## 📊 **모니터링 및 분석**

### **실시간 통계**

```javascript
// 시간대별 통계 조회
const stats = await logSystem.getStats('24h');

console.log('총 로그 수:', stats.total_logs);
console.log('레벨별 분포:', stats.by_level);
console.log('소스별 분포:', stats.by_source);
console.log('상위 에러들:', stats.top_errors);
```

### **트렌드 분석**

```javascript
// 로그 트렌드 분석
const trends = await mcpTools.analyze_trends({
  timerange: '24h',
  group_by: 'hour',
  compare_with_previous: true
});

console.log('시간별 트렌드:', trends.hourly_trends);
console.log('이전 기간 대비:', trends.comparison);
```

### **알림 설정**

```javascript
// 에러 임계값 도달 시 알림
logSystem.on('alert:error_threshold', (alert) => {
  console.log('에러 알림:', alert);
  // 외부 알림 시스템으로 전송
  sendSlackNotification(alert);
});

// 성능 저하 알림
logSystem.on('alert:performance', (alert) => {
  console.log('성능 알림:', alert);
  // 이메일 알림 전송
  sendEmailAlert(alert);
});
```

---

## 🔧 **문제 해결**

### **일반적인 문제들**

#### **Python 서버 연결 실패**
```javascript
// 연결 상태 확인
const status = await logSystem.getSystemStatus();
console.log('Python 서버 상태:', status.python_server);

// 수동 재시작
if (status.python_server.status !== 'running') {
  await logSystem.restartPythonServer();
}
```

#### **로그 누락**
```javascript
// 수집기 상태 확인
const collectorStats = collectors.getCollectorStats();
console.log('수집기 상태:', collectorStats);

// 비활성화된 수집기 활성화
collectors.enableCollector('recursive_http');
```

#### **성능 저하**
```javascript
// 시스템 리소스 확인
const systemStatus = await logSystem.getSystemStatus();
console.log('메모리 사용량:', systemStatus.python_server.memory_mb);
console.log('평균 응답시간:', systemStatus.performance.avg_response_time);

// 데이터베이스 최적화
await logSystem.optimizeDatabase();
```

### **디버깅 모드**

```javascript
// 디버그 로깅 활성화
logSystem.updateConfig('logging.default_level', 'DEBUG');
logSystem.updateConfig('server.verbose', true);

// SQL 쿼리 로깅 활성화 (개발 환경)
process.env.LOG_SQL_QUERIES = 'true';
```

### **로그 파일 확인**

```bash
# Python 서버 로그
tail -f modules/log-system/logs/server.log

# Node.js 브릿지 로그
tail -f modules/log-system/logs/bridge.log

# 에러 로그
tail -f modules/log-system/logs/error.log
```

---

## 📚 **추가 리소스**

- [API 참조](./API_REFERENCE.md)
- [개발자 가이드](./DEVELOPER_GUIDE.md)
- [환경 설정 가이드](./ENVIRONMENT_SETUP.md)
- [트러블슈팅 가이드](./TROUBLESHOOTING.md)
- [설정 스키마](../config/schema.json)

---

## 💡 **팁과 모범 사례**

### **로그 메시지 작성**
- 명확하고 구체적인 메시지 작성
- 액션과 결과를 포함
- 사용자 정보는 익명화

### **메타데이터 활용**
- 구조화된 데이터로 검색 용이성 향상
- 민감한 정보는 마스킹
- 일관된 필드명 사용

### **성능 최적화**
- 배치 로그 기록 활용
- 적절한 로그 레벨 설정
- 정기적인 데이터베이스 정리

### **보안 고려사항**
- 비밀번호, API 키 등 민감 정보 로깅 금지
- 적절한 접근 권한 설정
- 로그 데이터 암호화 (프로덕션 환경) 