# 🔍 Recursive 플랫폼 로그 시스템 통합 계획서

## 📋 **프로젝트 개요**

### **목표**
기존 Recursive 플랫폼에 JSON-RPC 2.0 기반 통합 로그 수집 시스템을 도입하여 개발 생산성 향상 및 실시간 모니터링 기능 제공

### **핵심 전략**
- **Python Core**: 검증된 540줄의 고품질 Python 구현체 활용
- **Node.js Bridge**: 기존 Recursive 시스템과 완벽 통합
- **하이브리드 아키텍처**: Python 성능 + JavaScript 생태계 장점 결합

---

## 🏗️ **아키텍처 설계**

### **전체 구조**
```
recursive/
├── modules/
│   └── log-system/                 # 🆕 새로 추가
│       ├── python/                 # Python 핵심 구현
│       │   ├── server.py          # JSON-RPC 2.0 서버
│       │   ├── storage.py         # SQLite 저장소
│       │   ├── collectors.py      # 로그 수집기들
│       │   ├── analyzer.py        # 실시간 분석 엔진
│       │   └── main.py            # 독립 실행 엔트리
│       ├── src/                    # Node.js 래퍼 & 통합
│       │   ├── log-system-bridge.js    # Python 서버 브릿지
│       │   ├── mcp-tools.js            # MCP 도구들
│       │   ├── collectors/             # JS 수집기들
│       │   │   ├── recursive-collectors.js
│       │   │   ├── mcp-collector.js
│       │   │   ├── websocket-collector.js
│       │   │   └── ai-analysis-collector.js
│       │   ├── utils/                  # 유틸리티들
│       │   └── index.js                # 메인 exports
│       ├── config/                 # 설정 파일들
│       │   ├── default.yaml       # 기본 설정
│       │   ├── recursive.yaml     # Recursive 특화 설정
│       │   └── schema.json        # 설정 스키마
│       ├── tests/                  # 테스트
│       ├── docs/                   # 문서
│       └── package.json
│
├── core/
│   ├── server/
│   │   └── server.js              # 🔄 로그 시스템 통합
│   └── shared/
│       └── src/
│           └── index.js           # 🔄 로그 브릿지 export
│
└── modules/
    └── mcp-protocol/
        └── src/
            └── tools.js           # 🔄 로그 MCP 도구 추가
```

### **데이터 흐름**
```
[로그 소스들] → [JS 수집기] → [Python 서버] → [SQLite] → [MCP 도구] → [사용자]
     ↓              ↓              ↓            ↓          ↓
[콘솔/HTTP]    [브릿지 통신]   [실시간 분석]  [저장소]   [AI 분석]
[파일 변경]    [JSON-RPC]     [패턴 탐지]   [검색]     [워크플로우]
[MCP 호출]     [WebSocket]    [알림 생성]   [통계]     [디버깅]
```

---

## 🎯 **Phase별 구현 계획**

### **📌 Phase 1: 기본 인프라 구축 (1주차)**

#### **1.1 모듈 구조 생성**
```bash
# 1. 기본 폴더 구조 생성
mkdir -p modules/log-system/{python,src,config,tests,docs}
mkdir -p modules/log-system/src/{collectors,utils}

# 2. package.json 생성
cd modules/log-system
npm init -y
```

#### **1.2 Python 코어 이식**
```bash
# 기존 검증된 Python 코드 복사
cp log-system-spec/core/server_py.py modules/log-system/python/server.py
cp log-system-spec/core/storage_py.py modules/log-system/python/storage.py
cp log-system-spec/core/collectors_py.py modules/log-system/python/collectors.py
cp log-system-spec/config/* modules/log-system/config/
```

#### **1.3 Python 의존성 설정**
```bash
# requirements.txt 업데이트
cat >> requirements.txt << EOF
# Log System Dependencies
aiohttp>=3.8.0
aiohttp-cors>=0.7.0
sqlite3  # Built-in
asyncio  # Built-in
dataclasses  # Built-in (Python 3.7+)
EOF
```

#### **1.4 독립 실행 확인**
```python
# modules/log-system/python/main.py
#!/usr/bin/env python3
import asyncio
import sys
import os
sys.path.append(os.path.dirname(__file__))

from server import LogCollectorServer

async def main():
    server = LogCollectorServer('localhost', 8888)
    await server.start()
    
    try:
        await asyncio.Event().wait()  # 무한 대기
    except KeyboardInterrupt:
        print("서버 종료")

if __name__ == '__main__':
    asyncio.run(main())
```

#### **1.5 테스트 실행**
```bash
# Python 서버 독립 실행 테스트
cd modules/log-system/python
python main.py

# 다른 터미널에서 테스트
curl -X POST http://localhost:8888/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"log","params":{"source":"test","level":"INFO","message":"Hello"},"id":1}'
```

### **📌 Phase 2: Node.js 브릿지 구현 (2주차)**

#### **2.1 JSON-RPC 클라이언트 구현**
```javascript
// modules/log-system/src/utils/json-rpc-client.js
const axios = require('axios');

class JSONRPCClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.requestId = 0;
  }
  
  async call(method, params = {}) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this.requestId
    };
    
    try {
      const response = await axios.post(this.endpoint, payload);
      if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message}`);
      }
      return response.data.result;
    } catch (error) {
      throw new Error(`RPC Call Failed: ${error.message}`);
    }
  }
}

module.exports = JSONRPCClient;
```

#### **2.2 로그 시스템 브릿지 구현**
```javascript
// modules/log-system/src/log-system-bridge.js
const { spawn } = require('child_process');
const path = require('path');
const JSONRPCClient = require('./utils/json-rpc-client');

class LogSystemBridge {
  constructor(config = {}) {
    this.config = {
      host: 'localhost',
      port: 8888,
      pythonPath: 'python',
      autoStart: true,
      ...config
    };
    
    this.pythonProcess = null;
    this.client = null;
    this.isReady = false;
  }
  
  async start() {
    if (this.config.autoStart) {
      await this.startPythonServer();
    }
    
    // JSON-RPC 클라이언트 초기화
    const endpoint = `http://${this.config.host}:${this.config.port}/rpc`;
    this.client = new JSONRPCClient(endpoint);
    
    // 서버 준비 대기
    await this.waitForServer();
    this.isReady = true;
    
    console.log(`✅ Log System Bridge Ready: ${endpoint}`);
  }
  
  async startPythonServer() {
    const pythonScript = path.join(__dirname, '../python/main.py');
    
    this.pythonProcess = spawn(this.config.pythonPath, [
      pythonScript,
      '--host', this.config.host,
      '--port', this.config.port.toString()
    ]);
    
    this.pythonProcess.stdout.on('data', (data) => {
      console.log(`[Log Server] ${data.toString().trim()}`);
    });
    
    this.pythonProcess.stderr.on('data', (data) => {
      console.error(`[Log Server Error] ${data.toString().trim()}`);
    });
    
    this.pythonProcess.on('close', (code) => {
      console.log(`Log server exited with code ${code}`);
      this.isReady = false;
    });
  }
  
  async waitForServer(maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.client.call('get_stats', { timerange: '1m' });
        return; // 성공
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Log server failed to start');
  }
  
  // 로그 수집 메서드들
  async log(entry) {
    if (!this.isReady) throw new Error('Log system not ready');
    return await this.client.call('log', entry);
  }
  
  async logBatch(entries, compress = false) {
    if (!this.isReady) throw new Error('Log system not ready');
    return await this.client.call('log_batch', { logs: entries, compress });
  }
  
  async query(params) {
    if (!this.isReady) throw new Error('Log system not ready');
    return await this.client.call('query', params);
  }
  
  async search(query, timerange = '1h', context = 0) {
    if (!this.isReady) throw new Error('Log system not ready');
    return await this.client.call('search', { query, timerange, context });
  }
  
  async getStats(timerange = '1h') {
    if (!this.isReady) throw new Error('Log system not ready');
    return await this.client.call('get_stats', { timerange });
  }
  
  async stop() {
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
    }
    this.isReady = false;
  }
}

module.exports = LogSystemBridge;
```

#### **2.3 패키지 메인 export**
```javascript
// modules/log-system/src/index.js
const LogSystemBridge = require('./log-system-bridge');
const JSONRPCClient = require('./utils/json-rpc-client');

// 설정 로드
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

function loadConfig(configPath) {
  const defaultConfigPath = path.join(__dirname, '../config/default.yaml');
  const recursiveConfigPath = path.join(__dirname, '../config/recursive.yaml');
  
  let config = {};
  
  // 기본 설정 로드
  if (fs.existsSync(defaultConfigPath)) {
    config = yaml.load(fs.readFileSync(defaultConfigPath, 'utf8'));
  }
  
  // Recursive 특화 설정 로드
  if (fs.existsSync(recursiveConfigPath)) {
    const recursiveConfig = yaml.load(fs.readFileSync(recursiveConfigPath, 'utf8'));
    config = { ...config, ...recursiveConfig };
  }
  
  // 사용자 설정 로드
  if (configPath && fs.existsSync(configPath)) {
    const userConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...userConfig };
  }
  
  return config;
}

// 전역 인스턴스
let globalLogSystem = null;

module.exports = {
  LogSystemBridge,
  JSONRPCClient,
  loadConfig,
  
  // 팩토리 함수
  createLogSystem: (config) => new LogSystemBridge(config),
  
  // 전역 인스턴스 관리
  getLogSystem: (config) => {
    if (!globalLogSystem) {
      const finalConfig = loadConfig(config?.configPath);
      globalLogSystem = new LogSystemBridge({ ...finalConfig.server, ...config });
    }
    return globalLogSystem;
  },
  
  // 편의 함수들
  async initializeLogSystem(config = {}) {
    const logSystem = this.getLogSystem(config);
    await logSystem.start();
    return logSystem;
  }
};
```

#### **2.4 패키지 설정**
```json
// modules/log-system/package.json
{
  "name": "@recursive/log-system",
  "version": "1.0.0",
  "description": "Integrated log collection system for Recursive platform",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "start:python": "python python/main.py",
    "test": "jest",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "js-yaml": "^4.1.0",
    "ws": "^8.14.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.0.0"
  },
  "keywords": ["logging", "json-rpc", "recursive", "monitoring"],
  "author": "Recursive Team",
  "license": "MIT"
}
```

### **📌 Phase 3: MCP 도구 통합 (3주차)**

#### **3.1 MCP 로그 도구 구현**
```javascript
// modules/log-system/src/mcp-tools.js
const logTools = [
  {
    name: "get_recent_errors",
    description: "최근 에러 로그 조회",
    inputSchema: {
      type: "object",
      properties: {
        minutes: { type: "number", default: 30, description: "조회할 시간 범위 (분)" },
        sources: { type: "array", items: { type: "string" }, description: "특정 소스만 조회" }
      }
    },
    handler: async (params, logSystem) => {
      const result = await logSystem.query({
        levels: ['ERROR', 'FATAL'],
        since: `${params.minutes || 30}m`,
        sources: params.sources,
        limit: 100
      });
      
      return {
        total_errors: result.count,
        errors: result.logs.map(log => ({
          timestamp: log.timestamp,
          source: log.source,
          message: log.message,
          metadata: log.metadata,
          trace_id: log.trace_id
        }))
      };
    }
  },
  
  {
    name: "analyze_performance",
    description: "성능 분석 및 슬로우 쿼리/요청 탐지",
    inputSchema: {
      type: "object", 
      properties: {
        timerange: { type: "string", default: "1h", description: "분석 시간 범위" },
        threshold_ms: { type: "number", default: 1000, description: "느린 요청 임계값 (ms)" }
      }
    },
    handler: async (params, logSystem) => {
      const [httpLogs, dbLogs, stats] = await Promise.all([
        logSystem.query({
          sources: ['http_traffic'],
          since: params.timerange,
          limit: 1000
        }),
        logSystem.query({
          sources: ['database'],
          since: params.timerange,
          limit: 1000
        }),
        logSystem.getStats(params.timerange)
      ]);
      
      const slowRequests = httpLogs.logs.filter(log => 
        log.metadata.duration_ms > (params.threshold_ms || 1000)
      );
      
      const slowQueries = dbLogs.logs.filter(log =>
        log.metadata.duration_ms > (params.threshold_ms || 1000)
      );
      
      return {
        summary: {
          total_requests: httpLogs.count,
          slow_requests: slowRequests.length,
          total_queries: dbLogs.count,
          slow_queries: slowQueries.length,
          timerange: params.timerange
        },
        slow_requests: slowRequests.slice(0, 10),
        slow_queries: slowQueries.slice(0, 10),
        stats: stats
      };
    }
  },
  
  {
    name: "debug_session",
    description: "종합 디버깅 세션 데이터 수집",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", default: "5m", description: "수집 시간 범위" },
        include_trace: { type: "string", description: "특정 trace_id 포함" }
      }
    },
    handler: async (params, logSystem) => {
      const since = params.since || "5m";
      const queries = [];
      
      // 기본 쿼리들
      queries.push(
        logSystem.query({ levels: ['ERROR', 'FATAL'], since, limit: 50 }),
        logSystem.query({ sources: ['http_traffic'], since, limit: 100 }),
        logSystem.query({ sources: ['mcp_calls'], since, limit: 50 }),
        logSystem.query({ sources: ['ai_analysis'], since, limit: 30 }),
        logSystem.getStats(since)
      );
      
      // trace_id가 있으면 추가 쿼리
      if (params.include_trace) {
        queries.push(
          logSystem.search(`trace_id:${params.include_trace}`, since)
        );
      }
      
      const [errors, httpLogs, mcpLogs, aiLogs, stats, traceLogs] = await Promise.all(queries);
      
      return {
        session_info: {
          timestamp: new Date().toISOString(),
          timerange: since,
          trace_id: params.include_trace
        },
        errors: {
          count: errors.count,
          recent: errors.logs.slice(0, 10)
        },
        http_traffic: {
          count: httpLogs.count,
          recent: httpLogs.logs.slice(0, 20)
        },
        mcp_calls: {
          count: mcpLogs.count,
          recent: mcpLogs.logs.slice(0, 15)
        },
        ai_analysis: {
          count: aiLogs.count,
          recent: aiLogs.logs.slice(0, 10)
        },
        trace_logs: traceLogs || null,
        system_stats: stats
      };
    }
  },
  
  {
    name: "search_logs",
    description: "로그 전문 검색",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 쿼리" },
        timerange: { type: "string", default: "1h", description: "검색 시간 범위" },
        sources: { type: "array", items: { type: "string" }, description: "검색할 소스들" },
        context: { type: "number", default: 3, description: "전후 컨텍스트 라인 수" }
      }
    },
    handler: async (params, logSystem) => {
      if (!params.query) {
        throw new Error("검색 쿼리가 필요합니다");
      }
      
      const result = await logSystem.search(
        params.query,
        params.timerange || "1h",
        params.context || 3
      );
      
      return {
        query: params.query,
        timerange: params.timerange,
        total_matches: result.count,
        matches: result.logs,
        sources_found: [...new Set(result.logs.map(log => log.source))]
      };
    }
  },
  
  {
    name: "get_log_stats",
    description: "로그 통계 및 트렌드 분석",
    inputSchema: {
      type: "object",
      properties: {
        timerange: { type: "string", default: "1h", description: "분석 시간 범위" },
        group_by: { type: "string", enum: ["source", "level", "hour"], default: "source" }
      }
    },
    handler: async (params, logSystem) => {
      const stats = await logSystem.getStats(params.timerange || "1h");
      
      return {
        timerange: params.timerange,
        total_logs: stats.total_logs,
        by_source: stats.by_source,
        by_level: stats.by_level,
        top_sources: Object.entries(stats.by_source)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10),
        error_rate: stats.by_level.ERROR ? 
          ((stats.by_level.ERROR / stats.total_logs) * 100).toFixed(2) + '%' : '0%'
      };
    }
  }
];

module.exports = logTools;
```

#### **3.2 기존 MCP 서버에 통합**
```javascript
// modules/mcp-protocol/src/tools.js에 추가
const logTools = require('@recursive/log-system/src/mcp-tools');
const { getLogSystem } = require('@recursive/log-system');

class MCPToolHandler {
  constructor() {
    this.logSystem = null;
    this.tools = [
      ...this.existingTools,
      ...this.createLogTools()
    ];
  }
  
  async initializeLogSystem() {
    if (!this.logSystem) {
      this.logSystem = getLogSystem();
      await this.logSystem.start();
    }
  }
  
  createLogTools() {
    return logTools.map(tool => ({
      ...tool,
      handler: async (params) => {
        await this.initializeLogSystem();
        return await tool.handler(params, this.logSystem);
      }
    }));
  }
}
```

### **📌 Phase 4: 수집기 구현 (4주차)**

#### **4.1 Recursive 특화 수집기들**
```javascript
// modules/log-system/src/collectors/recursive-collectors.js
const EventEmitter = require('events');

class RecursiveCollectors extends EventEmitter {
  constructor(logSystem) {
    super();
    this.logSystem = logSystem;
    this.collectors = new Map();
  }
  
  async start() {
    await Promise.all([
      this.startMCPCollector(),
      this.startWebSocketCollector(),
      this.startAIAnalysisCollector(),
      this.startHTTPCollector()
    ]);
  }
  
  async startMCPCollector() {
    const { eventBus } = require('@recursive/shared');
    
    eventBus.on('mcp:request', (data) => {
      this.logSystem.log({
        source: 'mcp_calls',
        level: 'INFO',
        message: `MCP ${data.method} called`,
        metadata: {
          method: data.method,
          params: data.params,
          request_id: data.id,
          timestamp: Date.now()
        },
        tags: ['mcp', 'api'],
        trace_id: data.trace_id
      });
    });
    
    eventBus.on('mcp:response', (data) => {
      this.logSystem.log({
        source: 'mcp_calls',
        level: data.error ? 'ERROR' : 'INFO',
        message: `MCP ${data.method} ${data.error ? 'failed' : 'completed'}`,
        metadata: {
          method: data.method,
          duration_ms: data.duration,
          error: data.error,
          request_id: data.id
        },
        tags: ['mcp', 'api', data.error ? 'error' : 'success'],
        trace_id: data.trace_id
      });
    });
  }
  
  async startWebSocketCollector() {
    const { eventBus } = require('@recursive/shared');
    
    eventBus.on('websocket:connection', (data) => {
      this.logSystem.log({
        source: 'websocket',
        level: 'INFO',
        message: `WebSocket connection ${data.event}`,
        metadata: {
          event: data.event,
          connection_id: data.connectionId,
          ip: data.ip,
          user_agent: data.userAgent
        },
        tags: ['websocket', 'connection']
      });
    });
    
    eventBus.on('websocket:message', (data) => {
      this.logSystem.log({
        source: 'websocket',
        level: 'DEBUG',
        message: `WebSocket message: ${data.type}`,
        metadata: {
          type: data.type,
          size: data.size,
          connection_id: data.connectionId
        },
        tags: ['websocket', 'message']
      });
    });
  }
  
  async startAIAnalysisCollector() {
    const { eventBus } = require('@recursive/shared');
    
    eventBus.on('ai:analysis:start', (data) => {
      this.logSystem.log({
        source: 'ai_analysis',
        level: 'INFO',
        message: `AI analysis started: ${data.type}`,
        metadata: {
          analysis_type: data.type,
          input_size: data.inputSize,
          analysis_id: data.id
        },
        tags: ['ai', 'analysis', 'start'],
        trace_id: data.trace_id
      });
    });
    
    eventBus.on('ai:analysis:complete', (data) => {
      this.logSystem.log({
        source: 'ai_analysis',
        level: 'INFO',
        message: `AI analysis completed: ${data.type}`,
        metadata: {
          analysis_type: data.type,
          duration_ms: data.duration,
          result_size: data.resultSize,
          analysis_id: data.id
        },
        tags: ['ai', 'analysis', 'complete'],
        trace_id: data.trace_id
      });
    });
  }
  
  async startHTTPCollector() {
    // Express 미들웨어로 HTTP 요청 로깅
    const middleware = (req, res, next) => {
      const startTime = Date.now();
      const originalSend = res.send;
      
      res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // 로그 수집
        this.logSystem.log({
          source: 'http_traffic',
          level: res.statusCode >= 400 ? 'ERROR' : 'INFO',
          message: `${req.method} ${req.path} - ${res.statusCode}`,
          metadata: {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration,
            ip: req.ip,
            user_agent: req.get('User-Agent'),
            content_length: data ? data.length : 0
          },
          tags: ['http', req.method.toLowerCase(), res.statusCode >= 400 ? 'error' : 'success']
        }).catch(console.error);
        
        return originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
    
    return middleware;
  }
}

module.exports = RecursiveCollectors;
```

#### **4.2 자동 수집기 설정**
```yaml
# modules/log-system/config/recursive.yaml
project_name: "recursive-platform"
project_type: "webapp"

server:
  host: "localhost"
  port: 8888
  auto_start: true

storage:
  db_path: "./logs/recursive_logs.db"
  max_size_mb: 1000
  max_days: 30

collectors:
  recursive_mcp:
    enabled: true
    auto_trace: true
    
  recursive_websocket:
    enabled: true
    log_messages: false  # 너무 많은 로그 방지
    
  recursive_ai:
    enabled: true
    log_python_calls: true
    
  recursive_http:
    enabled: true
    ignore_paths:
      - "/health"
      - "/favicon.ico"
      - "/static"
    capture_body: false

alerts:
  enabled: true
  error_spike_threshold: 20
  error_spike_window: 300  # 5분
  channels:
    - "console"
```

### **📌 Phase 5: 기존 시스템 통합 (5주차)**

#### **5.1 메인 서버 통합**
```javascript
// core/server/server.js에 추가
const { getLogSystem } = require('@recursive/log-system');
const RecursiveCollectors = require('@recursive/log-system/src/collectors/recursive-collectors');

class RecursiveServer {
  constructor() {
    // ... 기존 코드 ...
    this.logSystem = null;
    this.logCollectors = null;
  }
  
  async setupLogSystem() {
    console.log('🔍 Setting up integrated log system...');
    
    try {
      // 로그 시스템 초기화
      this.logSystem = getLogSystem({
        configPath: './modules/log-system/config/recursive.yaml'
      });
      
      await this.logSystem.start();
      
      // Recursive 특화 수집기 시작
      this.logCollectors = new RecursiveCollectors(this.logSystem);
      await this.logCollectors.start();
      
      // HTTP 수집기 미들웨어 추가
      const httpCollector = this.logCollectors.startHTTPCollector();
      this.app.use(httpCollector);
      
      // 기존 로거를 로그 시스템으로 연결
      this.logger.on('log', (entry) => {
        this.logSystem.log({
          source: 'recursive_server',
          level: entry.level.toUpperCase(),
          message: entry.message,
          metadata: entry.metadata || {},
          tags: ['server']
        }).catch(console.error);
      });
      
      console.log('✅ Log system integration completed');
      
    } catch (error) {
      console.error('❌ Failed to setup log system:', error);
      // 로그 시스템 실패해도 메인 서버는 계속 실행
    }
  }
  
  async start() {
    // ... 기존 시작 코드 ...
    
    // 로그 시스템 설정 (다른 시스템들 이후)
    await this.setupLogSystem();
    
    // ... 나머지 시작 코드 ...
  }
  
  async shutdown() {
    // ... 기존 종료 코드 ...
    
    // 로그 시스템 정리
    if (this.logSystem) {
      await this.logSystem.stop();
    }
  }
}
```

#### **5.2 Shared 패키지 통합**
```javascript
// core/shared/src/index.js에 추가
const { getLogSystem, createLogSystem } = require('@recursive/log-system');

module.exports = {
  // ... 기존 exports ...
  
  // Log System
  LogSystem: {
    getLogSystem,
    createLogSystem,
    
    // 편의 함수들
    async quickLog(level, message, metadata = {}) {
      const logSystem = getLogSystem();
      return await logSystem.log({
        source: 'recursive_shared',
        level: level.toUpperCase(),
        message,
        metadata,
        tags: ['shared']
      });
    },
    
    async logError(error, context = {}) {
      const logSystem = getLogSystem();
      return await logSystem.log({
        source: 'recursive_error',
        level: 'ERROR',
        message: error.message,
        metadata: {
          stack: error.stack,
          name: error.name,
          ...context
        },
        tags: ['error', 'exception']
      });
    }
  }
};
```

---

## 🧪 **테스트 계획**

### **단위 테스트**
```javascript
// modules/log-system/tests/bridge.test.js
const LogSystemBridge = require('../src/log-system-bridge');

describe('LogSystemBridge', () => {
  let bridge;
  
  beforeAll(async () => {
    bridge = new LogSystemBridge({ autoStart: false });
    // 테스트용 Python 서버 시작
  });
  
  test('should log entry successfully', async () => {
    const result = await bridge.log({
      source: 'test',
      level: 'INFO',
      message: 'Test message'
    });
    
    expect(result.status).toBe('received');
    expect(result.id).toBeDefined();
  });
  
  test('should query logs', async () => {
    const result = await bridge.query({
      sources: ['test'],
      since: '1m'
    });
    
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
  });
});
```

### **통합 테스트**
```javascript
// modules/log-system/tests/integration.test.js
const request = require('supertest');
const RecursiveServer = require('../../core/server/server');

describe('Log System Integration', () => {
  let server;
  
  beforeAll(async () => {
    server = new RecursiveServer();
    await server.start();
  });
  
  test('should collect HTTP logs', async () => {
    await request(server.app)
      .get('/health')
      .expect(200);
    
    // 로그가 수집되었는지 확인
    const logSystem = server.logSystem;
    const logs = await logSystem.query({
      sources: ['http_traffic'],
      since: '1m'
    });
    
    expect(logs.logs.length).toBeGreaterThan(0);
  });
});
```

---

## 📊 **성능 및 모니터링**

### **성능 목표**
- **메모리 사용량**: Python 서버 50MB 이하
- **응답 시간**: 로그 수집 100ms 이하
- **처리량**: 초당 1000개 로그 처리 가능
- **저장소**: 자동 압축으로 공간 효율성

### **모니터링 지표**
```javascript
// 성능 모니터링 대시보드 데이터
const performanceMetrics = {
  logIngestionRate: 'logs/second',
  queryResponseTime: 'milliseconds',
  storageSize: 'MB',
  errorRate: 'percentage',
  systemMemory: 'MB',
  pythonProcessHealth: 'boolean'
};
```

---

## 🚀 **배포 및 운영**

### **개발 환경 설정**
```bash
# 1. 의존성 설치
npm install
pip install -r requirements.txt

# 2. 로그 시스템 시작
npm run dev:logs

# 3. 메인 서버 시작 (로그 시스템 자동 연동)
npm start
```

### **프로덕션 배포**
```bash
# 1. 빌드
npm run build

# 2. PM2로 프로세스 관리
pm2 start ecosystem.config.js

# 3. 로그 로테이션 설정
logrotate /etc/logrotate.d/recursive-logs
```

### **운영 체크리스트**
- [ ] Python 서버 프로세스 상태 확인
- [ ] SQLite 데이터베이스 크기 모니터링
- [ ] 로그 수집 지연 시간 확인
- [ ] 에러율 임계값 설정
- [ ] 백업 및 복구 절차 수립

---

## 📈 **향후 확장 계획**

### **단기 (1-3개월)**
- [ ] 웹 기반 로그 뷰어 UI
- [ ] Slack/Discord 알림 연동
- [ ] 로그 압축 및 아카이빙
- [ ] 성능 최적화

### **중기 (3-6개월)**
- [ ] 머신러닝 기반 이상 탐지
- [ ] 분산 로그 수집 (클러스터)
- [ ] 외부 시스템 연동 (ELK, Grafana)
- [ ] 고급 분석 대시보드

### **장기 (6개월+)**
- [ ] 클라우드 네이티브 배포
- [ ] 마이크로서비스 로그 추적
- [ ] AI 기반 자동 디버깅
- [ ] 엔터프라이즈 기능 (RBAC, 감사)

---

## 🎯 **핵심 장점**

### **1. 검증된 기술 스택**
- 540줄의 완성된 Python 코드 활용
- JSON-RPC 2.0 표준 준수
- SQLite 기반 안정성

### **2. 완벽한 통합**
- 기존 Recursive 시스템과 seamless 연동
- 모듈화된 구조로 점진적 도입 가능
- 기존 워크플로우 방해 없음

### **3. 확장성**
- 모듈화된 아키텍처
- 플러그인 방식 수집기
- 설정 기반 관리

### **4. 개발자 경험**
- MCP 도구로 강력한 디버깅 지원
- 실시간 로그 분석
- AI 기반 인사이트

### **5. 성능 최적화**
- Python + Node.js 하이브리드 장점
- 비동기 처리
- 효율적인 저장소 관리

---

## 📝 **구현 우선순위**

### **High Priority (필수)**
1. **기본 로그 수집**: HTTP, MCP, WebSocket
2. **MCP 도구 통합**: 에러 조회, 디버깅 세션
3. **Python 서버 안정성**: 자동 재시작, 헬스체크

### **Medium Priority (중요)**
1. **실시간 분석**: 패턴 탐지, 알림
2. **성능 모니터링**: 메트릭 수집, 대시보드
3. **설정 관리**: YAML 기반, 동적 설정

### **Low Priority (선택)**
1. **고급 검색**: 복잡한 쿼리, 인덱싱
2. **외부 연동**: 타사 도구 통합
3. **UI 개발**: 웹 기반 뷰어

---

## 📋 **예상 결과**

### **개발 기간**: 5주
### **필요 리소스**: 개발자 1명 풀타임
### **위험도**: 낮음 (검증된 코드 기반)

### **완료 후 기대 효과**
- **디버깅 시간 50% 단축**
- **문제 발견 시간 80% 단축**
- **시스템 안정성 30% 향상**
- **개발 생산성 40% 향상**

이제 실제 구현을 시작하시겠습니까? 어떤 Phase부터 시작할지 알려주시면 상세한 구현 가이드를 제공하겠습니다! 