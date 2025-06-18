# 🔌 Recursive 로그 시스템 API 참조 문서

## 📋 **목차**
- [개요](#개요)
- [Node.js 브릿지 API](#nodejs-브릿지-api)
- [Python JSON-RPC API](#python-json-rpc-api)
- [MCP 도구 API](#mcp-도구-api)
- [수집기 API](#수집기-api)
- [설정 관리 API](#설정-관리-api)
- [에러 처리](#에러-처리)
- [예제](#예제)

---

## 🎯 **개요**

Recursive 로그 시스템은 다층 아키텍처로 구성되어 있으며, 각 계층별로 다양한 API를 제공합니다:

- **Node.js 브릿지 API**: 메인 인터페이스, Python 서버와의 통신 관리
- **Python JSON-RPC API**: 핵심 로그 처리 및 저장 엔진
- **MCP 도구 API**: 로그 분석 및 디버깅 도구
- **수집기 API**: 다양한 소스에서 로그 수집
- **설정 관리 API**: 동적 설정 관리

---

## 🌉 **Node.js 브릿지 API**

### **LogSystemBridge 클래스**

#### **생성자**

```javascript
const bridge = new LogSystemBridge(config);
```

**매개변수:**
- `config` (Object): 브릿지 설정
  - `host` (string): Python 서버 호스트 (기본값: 'localhost')
  - `port` (number): Python 서버 포트 (기본값: 8888)
  - `pythonPath` (string): Python 실행 경로 (기본값: 'python')
  - `autoStart` (boolean): 자동 시작 여부 (기본값: true)
  - `autoRestart` (boolean): 자동 재시작 여부 (기본값: true)
  - `maxRestartAttempts` (number): 최대 재시작 시도 횟수 (기본값: 5)
  - `dbPath` (string): 데이터베이스 파일 경로

#### **라이프사이클 메서드**

##### **start()**
```javascript
await bridge.start();
```
로그 시스템을 시작합니다.

**반환값:** Promise<void>

**예외:**
- `Error`: 시작 실패 시

##### **stop()**
```javascript
await bridge.stop();
```
로그 시스템을 정지합니다.

**반환값:** Promise<void>

##### **restart()**
```javascript
await bridge.restart();
```
로그 시스템을 재시작합니다.

**반환값:** Promise<void>

#### **로그 수집 메서드**

##### **log(entry)**
```javascript
await bridge.log({
  level: 'INFO',
  message: '사용자 로그인',
  source: 'auth',
  metadata: { userId: 123 }
});
```

**매개변수:**
- `entry` (Object): 로그 엔트리
  - `level` (string): 로그 레벨 (DEBUG, INFO, WARN, ERROR, FATAL)
  - `message` (string): 로그 메시지
  - `source` (string): 로그 소스
  - `metadata` (Object): 추가 메타데이터
  - `timestamp` (string, optional): 타임스탬프 (ISO 8601)
  - `trace_id` (string, optional): 추적 ID

**반환값:** Promise<Object>
```javascript
{
  success: true,
  entry_id: "log_12345",
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

##### **logBatch(entries, compress)**
```javascript
await bridge.logBatch([entry1, entry2, entry3], true);
```

**매개변수:**
- `entries` (Array): 로그 엔트리 배열
- `compress` (boolean): 압축 여부 (기본값: false)

**반환값:** Promise<Object>
```javascript
{
  success: true,
  processed_count: 3,
  failed_count: 0,
  batch_id: "batch_12345"
}
```

#### **로그 조회 메서드**

##### **query(params)**
```javascript
const result = await bridge.query({
  levels: ['ERROR', 'WARN'],
  sources: ['auth', 'api'],
  since: '1h',
  limit: 100
});
```

**매개변수:**
- `params` (Object): 쿼리 매개변수
  - `levels` (Array): 로그 레벨 필터
  - `sources` (Array): 소스 필터
  - `since` (string): 시간 범위 ('1h', '30m', '24h')
  - `until` (string): 종료 시간
  - `limit` (number): 최대 결과 수
  - `offset` (number): 결과 오프셋
  - `sort` (string): 정렬 방식 ('asc', 'desc')

**반환값:** Promise<Object>
```javascript
{
  logs: [
    {
      id: "log_12345",
      timestamp: "2024-01-15T10:30:00.000Z",
      level: "ERROR",
      message: "데이터베이스 연결 실패",
      source: "database",
      metadata: { error: "Connection timeout" },
      trace_id: "trace_67890"
    }
  ],
  count: 1,
  total: 1,
  page: 1,
  has_more: false
}
```

##### **search(query, timerange, context)**
```javascript
const result = await bridge.search(
  "데이터베이스 연결",
  "1h",
  2
);
```

**매개변수:**
- `query` (string): 검색 쿼리 (전문 검색)
- `timerange` (string): 시간 범위 (기본값: '1h')
- `context` (number): 컨텍스트 라인 수 (기본값: 0)

**반환값:** Promise<Object> (query와 동일한 형식)

##### **getStats(timerange)**
```javascript
const stats = await bridge.getStats('24h');
```

**매개변수:**
- `timerange` (string): 통계 시간 범위 (기본값: '1h')

**반환값:** Promise<Object>
```javascript
{
  timerange: "24h",
  total_logs: 15420,
  by_level: {
    "DEBUG": 8500,
    "INFO": 5200,
    "WARN": 1500,
    "ERROR": 200,
    "FATAL": 20
  },
  by_source: {
    "http_traffic": 6000,
    "mcp_calls": 4000,
    "database": 3000,
    "auth": 2420
  },
  top_errors: [
    {
      message: "Connection timeout",
      count: 15,
      last_seen: "2024-01-15T10:30:00.000Z"
    }
  ],
  performance: {
    avg_response_time: 145.2,
    slow_queries: 12,
    error_rate: 1.3
  }
}
```

#### **시스템 상태 메서드**

##### **getSystemStatus()**
```javascript
const status = await bridge.getSystemStatus();
```

**반환값:** Promise<Object>
```javascript
{
  status: "running",
  uptime: 3600000,
  python_server: {
    pid: 12345,
    status: "running",
    memory_mb: 45.2,
    cpu_percent: 2.1
  },
  database: {
    size_mb: 125.8,
    connections: 3,
    last_vacuum: "2024-01-15T09:00:00.000Z"
  },
  performance: {
    total_requests: 15420,
    failed_requests: 12,
    avg_response_time: 145.2,
    uptime_percentage: 99.92
  },
  collectors: {
    "recursive_mcp": { status: "active", collected: 4000 },
    "recursive_http": { status: "active", collected: 6000 },
    "recursive_ai": { status: "active", collected: 2500 },
    "recursive_websocket": { status: "active", collected: 2920 }
  }
}
```

---

## 🐍 **Python JSON-RPC API**

### **엔드포인트**
- **URL**: `http://localhost:8888/jsonrpc`
- **Method**: POST
- **Content-Type**: application/json

### **JSON-RPC 2.0 형식**

```javascript
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": { /* parameters */ },
  "id": 1
}
```

### **메서드 목록**

#### **log_entry**
단일 로그 엔트리를 저장합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "log_entry",
  "params": {
    "level": "INFO",
    "message": "사용자 로그인",
    "source": "auth",
    "metadata": { "userId": 123 },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "trace_id": "trace_12345"
  },
  "id": 1
}
```

#### **log_batch**
다중 로그 엔트리를 배치로 저장합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "log_batch",
  "params": {
    "entries": [/* 로그 엔트리 배열 */],
    "compress": false
  },
  "id": 2
}
```

#### **query_logs**
로그를 조회합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "query_logs",
  "params": {
    "levels": ["ERROR", "WARN"],
    "sources": ["auth", "api"],
    "since": "1h",
    "limit": 100,
    "offset": 0,
    "sort": "desc"
  },
  "id": 3
}
```

#### **search_logs**
전문 검색을 수행합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "search_logs",
  "params": {
    "query": "데이터베이스 연결",
    "timerange": "1h",
    "context": 2
  },
  "id": 4
}
```

#### **get_stats**
통계를 조회합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "get_stats",
  "params": {
    "timerange": "24h"
  },
  "id": 5
}
```

#### **health_check**
서버 상태를 확인합니다.

```javascript
{
  "jsonrpc": "2.0",
  "method": "health_check",
  "params": {},
  "id": 6
}
```

---

## 🛠️ **MCP 도구 API**

### **도구 목록**

#### **get_recent_errors**
최근 에러 로그를 조회하고 분석합니다.

```javascript
{
  "name": "get_recent_errors",
  "params": {
    "minutes": 30,
    "sources": ["mcp_calls", "http_traffic"],
    "limit": 100
  }
}
```

**반환값:**
```javascript
{
  "summary": {
    "total_errors": 25,
    "timerange": "30m",
    "query_timestamp": "2024-01-15T10:30:00.000Z"
  },
  "statistics": {
    "by_source": { "mcp_calls": 15, "http_traffic": 10 },
    "by_type": { "ConnectionError": 12, "TimeoutError": 8, "ValidationError": 5 },
    "top_error_sources": [["mcp_calls", 15], ["http_traffic", 10]],
    "top_error_types": [["ConnectionError", 12], ["TimeoutError", 8]]
  },
  "recent_errors": [/* 최근 에러 목록 */]
}
```

#### **analyze_performance**
성능을 분석하고 슬로우 쿼리를 탐지합니다.

```javascript
{
  "name": "analyze_performance",
  "params": {
    "timerange": "1h",
    "threshold_ms": 1000,
    "include_percentiles": true
  }
}
```

#### **monitor_system**
시스템 상태를 모니터링합니다.

```javascript
{
  "name": "monitor_system",
  "params": {
    "check_memory": true,
    "check_disk": true,
    "check_connections": true
  }
}
```

#### **trace_request**
특정 요청을 추적합니다.

```javascript
{
  "name": "trace_request",
  "params": {
    "trace_id": "trace_12345",
    "include_related": true,
    "max_depth": 10
  }
}
```

#### **analyze_trends**
로그 트렌드를 분석합니다.

```javascript
{
  "name": "analyze_trends",
  "params": {
    "timerange": "24h",
    "group_by": "hour",
    "compare_with_previous": true
  }
}
```

---

## 📊 **수집기 API**

### **RecursiveCollectors 클래스**

#### **생성자**

```javascript
const collectors = new RecursiveCollectors(logSystem, config);
```

#### **수집기 관리**

##### **registerCollector(name, collector)**
```javascript
collectors.registerCollector('custom_collector', {
  name: 'custom_collector',
  collect: async (data) => { /* 수집 로직 */ }
});
```

##### **enableCollector(name)**
```javascript
collectors.enableCollector('recursive_mcp');
```

##### **disableCollector(name)**
```javascript
collectors.disableCollector('recursive_http');
```

##### **getCollectorStats()**
```javascript
const stats = collectors.getCollectorStats();
```

### **개별 수집기**

#### **MCP 수집기**
MCP 프로토콜 이벤트를 수집합니다.

```javascript
// 이벤트 리스닝
mcpCollector.on('mcp:request', (data) => {
  // MCP 요청 로깅
});

mcpCollector.on('mcp:response', (data) => {
  // MCP 응답 로깅
});
```

#### **HTTP 수집기**
HTTP 요청/응답을 수집합니다.

```javascript
// Express 미들웨어로 사용
app.use(httpCollector.middleware());
```

#### **WebSocket 수집기**
WebSocket 연결 및 메시지를 수집합니다.

```javascript
// WebSocket 서버에 연결
wsCollector.attachToServer(wsServer);
```

#### **AI 분석 수집기**
AI 분석 과정을 수집합니다.

```javascript
// AI 분석 시작 로깅
aiCollector.logAnalysisStart(analysisId, type, input);

// AI 분석 완료 로깅
aiCollector.logAnalysisComplete(analysisId, result, duration);
```

---

## ⚙️ **설정 관리 API**

### **ConfigManager 클래스**

#### **설정 로드**

```javascript
const config = await configManager.loadConfig({
  environment: 'development',
  watchForChanges: true
});
```

#### **설정 값 조회**

```javascript
const value = configManager.get('server.port', 8888);
```

#### **설정 값 변경**

```javascript
configManager.set('server.port', 9999);
```

#### **설정 이벤트**

```javascript
configManager.on('config:loaded', (config) => {
  console.log('설정이 로드되었습니다:', config);
});

configManager.on('config:value_changed', (path, newValue, oldValue) => {
  console.log(`설정 변경: ${path} = ${newValue} (이전: ${oldValue})`);
});
```

---

## ❌ **에러 처리**

### **에러 타입**

#### **LogSystemError**
기본 로그 시스템 에러입니다.

```javascript
{
  name: 'LogSystemError',
  message: '에러 메시지',
  code: 'ERROR_CODE',
  details: { /* 추가 정보 */ }
}
```

#### **ConnectionError**
Python 서버 연결 에러입니다.

```javascript
{
  name: 'ConnectionError',
  message: 'Python 서버에 연결할 수 없습니다',
  code: 'CONN_FAILED',
  details: { host: 'localhost', port: 8888 }
}
```

#### **ValidationError**
데이터 검증 에러입니다.

```javascript
{
  name: 'ValidationError',
  message: '필수 필드가 누락되었습니다',
  code: 'VALIDATION_FAILED',
  details: { field: 'level', value: null }
}
```

### **에러 응답 형식**

```javascript
{
  success: false,
  error: {
    name: 'LogSystemError',
    message: '에러 메시지',
    code: 'ERROR_CODE',
    details: { /* 추가 정보 */ },
    timestamp: '2024-01-15T10:30:00.000Z',
    trace_id: 'trace_12345'
  }
}
```

---

## 💡 **예제**

### **기본 사용법**

```javascript
const { getLogSystem } = require('@recursive/log-system');

async function main() {
  // 로그 시스템 초기화
  const logSystem = await getLogSystem();
  await logSystem.start();
  
  // 로그 기록
  await logSystem.log({
    level: 'INFO',
    message: '애플리케이션 시작',
    source: 'app',
    metadata: { version: '1.0.0' }
  });
  
  // 로그 조회
  const recentLogs = await logSystem.query({
    since: '1h',
    limit: 10
  });
  
  console.log('최근 로그:', recentLogs.logs);
}

main().catch(console.error);
```

### **고급 사용법**

```javascript
const { createLogSystemFromConfig, RecursiveCollectors } = require('@recursive/log-system');

async function advancedUsage() {
  // 설정 파일로 초기화
  const logSystem = await createLogSystemFromConfig('./config/production.yaml');
  
  // 수집기 설정
  const collectors = new RecursiveCollectors(logSystem, {
    autoRegister: true,
    enableAll: true
  });
  
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
  
  // MCP 도구 사용
  const mcpTools = logSystem.getMCPTools();
  const errors = await mcpTools.get_recent_errors({
    minutes: 30,
    limit: 50
  });
  
  console.log('최근 에러:', errors.recent_errors);
}
```

---

## 📚 **추가 리소스**

- [사용자 가이드](./USER_GUIDE.md)
- [개발자 가이드](./DEVELOPER_GUIDE.md)
- [설정 스키마](../config/schema.json)
- [환경 설정 가이드](./ENVIRONMENT_SETUP.md)
- [트러블슈팅 가이드](./TROUBLESHOOTING.md) 