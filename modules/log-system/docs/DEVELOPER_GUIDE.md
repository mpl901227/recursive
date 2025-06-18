# 🔧 Recursive 로그 시스템 개발자 가이드

## 📋 **목차**
- [아키텍처 개요](#아키텍처-개요)
- [개발 환경 설정](#개발-환경-설정)
- [코드 구조](#코드-구조)
- [커스텀 수집기 개발](#커스텀-수집기-개발)
- [MCP 도구 개발](#mcp-도구-개발)
- [테스트 작성](#테스트-작성)

---

## 🏗️ **아키텍처 개요**

### **시스템 구성 요소**

```
┌─────────────────────────────────────────────────────────────┐
│                    Recursive Platform                       │
├─────────────────────────────────────────────────────────────┤
│  Node.js Application Layer                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │   MCP Tools     │ │   Collectors    │ │  Web Server  │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Log System Bridge (Node.js)                               │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ JSON-RPC Client │ │ Config Manager  │ │ Event System │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Python Log Server                                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ JSON-RPC Server │ │ Storage Engine  │ │ Query Engine │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  SQLite Database                                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │   Log Entries   │ │   Full-Text     │ │   Indexes    │   │
│  │     Table       │ │   Search        │ │              │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### **데이터 흐름**

```
Application → Collectors → Bridge → Python Server → SQLite
     ↓              ↓         ↓           ↓           ↓
   MCP Tools ←── Query API ←──┴─── JSON-RPC ←── Storage
```

---

## 🚀 **개발 환경 설정**

### **필수 요구사항**

- Node.js 16+ 
- Python 3.8+
- SQLite 3.35+

### **개발 환경 구축**

```bash
# 1. 의존성 설치
cd modules/log-system
npm install
pip install -r ../../requirements.txt

# 2. 개발 환경 설정
npm run logs:setup:dev

# 3. 테스트 실행
npm test

# 4. 개발 서버 시작
npm run logs:dev
```

---

## 📁 **코드 구조**

### **디렉토리 구조**

```
modules/log-system/
├── src/                     # Node.js 소스 코드
│   ├── index.js            # 메인 진입점
│   ├── log-system-bridge.js # Python 서버 브릿지
│   ├── mcp-handler.js      # MCP 핸들러
│   ├── mcp-tools.js        # MCP 도구 정의
│   ├── collectors/         # 로그 수집기
│   └── utils/              # 유틸리티
├── python/                 # Python 서버 코드
│   ├── main.py            # Python 진입점
│   ├── server.py          # HTTP/JSON-RPC 서버
│   ├── storage.py         # 데이터 저장 엔진
│   └── collectors.py      # Python 수집기
├── config/                # 설정 파일
├── tests/                 # 테스트 파일
└── docs/                  # 문서
```

### **주요 클래스**

#### **LogSystemBridge**

```javascript
class LogSystemBridge extends EventEmitter {
  constructor(config) {
    // 브릿지 초기화
  }
  
  async start() {
    // 시스템 시작
  }
  
  async log(entry) {
    // 로그 기록
  }
  
  async query(params) {
    // 로그 조회
  }
}
```

---

## 🔌 **커스텀 수집기 개발**

### **기본 수집기 구조**

```javascript
class CustomCollector extends EventEmitter {
  constructor(name, config = {}) {
    super();
    this.name = name;
    this.config = {
      enabled: true,
      buffer_size: 100,
      flush_interval: 5000,
      ...config
    };
    
    this.buffer = [];
    this.stats = {
      collected: 0,
      errors: 0,
      last_collection: null
    };
  }
  
  async initialize(logSystem) {
    this.logSystem = logSystem;
    this.startBufferFlush();
  }
  
  async collect(data) {
    try {
      const logEntry = this.transformData(data);
      this.buffer.push(logEntry);
      this.stats.collected++;
      this.stats.last_collection = new Date();
      
      if (this.buffer.length >= this.config.buffer_size) {
        await this.flush();
      }
      
      this.emit('collected', logEntry);
    } catch (error) {
      this.stats.errors++;
      this.emit('error', error);
    }
  }
  
  transformData(data) {
    return {
      level: 'INFO',
      message: `Custom data: ${JSON.stringify(data)}`,
      source: this.name,
      metadata: data,
      timestamp: new Date().toISOString()
    };
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
```

### **수집기 등록**

```javascript
const { RecursiveCollectors } = require('@recursive/log-system');

// 커스텀 수집기 생성
const customCollector = new CustomCollector('my_custom_collector', {
  enabled: true,
  buffer_size: 50,
  flush_interval: 3000
});

// 수집기 등록
collectors.registerCollector('my_custom_collector', customCollector);

// 데이터 수집
customCollector.collect({ user_id: 123, action: 'login' });
```

### **특화된 수집기 예제**

#### **데이터베이스 쿼리 수집기**

```javascript
class DatabaseCollector extends CustomCollector {
  constructor(config) {
    super('database_queries', config);
  }
  
  transformData(queryData) {
    return {
      level: queryData.duration > 1000 ? 'WARN' : 'DEBUG',
      message: `DB Query: ${queryData.query}`,
      source: 'database',
      metadata: {
        query: queryData.query,
        duration_ms: queryData.duration,
        rows_affected: queryData.rowsAffected,
        table: queryData.table
      }
    };
  }
}
```

---

## 🛠️ **MCP 도구 개발**

### **MCP 도구 구조**

```javascript
const customTool = {
  name: "custom_analysis",
  description: "커스텀 로그 분석 도구",
  inputSchema: {
    type: "object",
    properties: {
      timerange: {
        type: "string",
        default: "1h",
        description: "분석할 시간 범위"
      },
      custom_filter: {
        type: "string",
        description: "커스텀 필터 조건"
      }
    }
  },
  handler: async (params, logSystem) => {
    // 도구 로직 구현
    const logs = await logSystem.query({
      since: params.timerange,
      // 커스텀 필터 적용
    });
    
    // 분석 로직
    const analysis = performCustomAnalysis(logs);
    
    return {
      summary: {
        timerange: params.timerange,
        total_analyzed: logs.count,
        analysis_timestamp: new Date().toISOString()
      },
      results: analysis
    };
  }
};
```

### **도구 등록**

```javascript
// MCP 도구 배열에 추가
const logTools = [
  // 기존 도구들...
  customTool
];

// 또는 런타임에 추가
logSystem.addMCPTool(customTool);
```

---

## 🧪 **테스트 작성**

### **단위 테스트**

```javascript
// tests/custom-collector.test.js
const CustomCollector = require('../src/collectors/custom-collector');

describe('CustomCollector', () => {
  let collector;
  let mockLogSystem;
  
  beforeEach(() => {
    mockLogSystem = {
      logBatch: jest.fn().mockResolvedValue({ success: true })
    };
    
    collector = new CustomCollector('test_collector', {
      buffer_size: 3,
      flush_interval: 1000
    });
    
    collector.initialize(mockLogSystem);
  });
  
  test('should collect and transform data', async () => {
    const testData = { user: 'test', action: 'login' };
    
    await collector.collect(testData);
    
    expect(collector.buffer).toHaveLength(1);
    expect(collector.buffer[0]).toMatchObject({
      level: 'INFO',
      source: 'test_collector',
      metadata: testData
    });
  });
});
```

### **통합 테스트**

```javascript
// tests/integration/full-workflow.test.js
const { createLogSystemFromConfig } = require('../src/index');

describe('Full Workflow Integration', () => {
  let logSystem;
  
  beforeAll(async () => {
    logSystem = await createLogSystemFromConfig({
      server: { port: 8889 },
      storage: { db_path: ':memory:' }
    });
    
    await logSystem.start();
  });
  
  afterAll(async () => {
    await logSystem.stop();
  });
  
  test('should handle complete log workflow', async () => {
    // 1. 로그 기록
    const result = await logSystem.log({
      level: 'INFO',
      message: 'Integration test log',
      source: 'test'
    });
    expect(result.success).toBe(true);
    
    // 2. 로그 조회
    const query = await logSystem.query({
      sources: ['test'],
      since: '1m'
    });
    
    expect(query.logs).toHaveLength(1);
  });
});
```

---

## 📚 **추가 리소스**

- [API 참조](./API_REFERENCE.md)
- [사용자 가이드](./USER_GUIDE.md)
- [트러블슈팅 가이드](./TROUBLESHOOTING.md)
- [환경 설정 가이드](./ENVIRONMENT_SETUP.md) 