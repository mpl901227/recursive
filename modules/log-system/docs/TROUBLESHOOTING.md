# 🔧 Recursive 로그 시스템 트러블슈팅 가이드

## 📋 **목차**
- [일반적인 문제들](#일반적인-문제들)
- [연결 문제](#연결-문제)
- [성능 문제](#성능-문제)
- [데이터 문제](#데이터-문제)
- [설정 문제](#설정-문제)
- [디버깅 도구](#디버깅-도구)
- [로그 분석](#로그-분석)

---

## 🚨 **일반적인 문제들**

### **문제: 로그 시스템이 시작되지 않음**

#### **증상**
```
Error: Failed to start log system
    at LogSystemBridge.start (/path/to/log-system-bridge.js:45:11)
```

#### **원인 및 해결방법**

1. **Python 서버 시작 실패**
```bash
# Python 경로 확인
which python
python --version

# 의존성 확인
pip list | grep -E "(aiohttp|jsonrpc)"

# 수동 Python 서버 시작 테스트
cd modules/log-system/python
python main.py
```

2. **포트 충돌**
```bash
# 포트 사용 상태 확인
netstat -an | grep 8888
lsof -i :8888

# 다른 포트로 시작
LOG_PORT=8889 npm run logs:start
```

3. **권한 문제**
```bash
# 로그 디렉토리 권한 확인
ls -la modules/log-system/logs/
chmod 755 modules/log-system/logs/

# 데이터베이스 파일 권한
ls -la modules/log-system/python/*.db
chmod 644 modules/log-system/python/*.db
```

### **문제: 로그가 기록되지 않음**

#### **증상**
- `logSystem.log()` 호출 후 성공 응답을 받지만 데이터베이스에 저장되지 않음
- 쿼리 결과가 비어있음

#### **해결방법**

1. **시스템 상태 확인**
```javascript
const status = await logSystem.getSystemStatus();
console.log('System Status:', status);

// Python 서버 상태 확인
if (status.python_server.status !== 'running') {
  await logSystem.restartPythonServer();
}
```

2. **수집기 상태 확인**
```javascript
const collectors = logSystem.getCollectors();
const collectorStats = collectors.getCollectorStats();
console.log('Collector Stats:', collectorStats);

// 비활성화된 수집기 활성화
Object.keys(collectorStats).forEach(name => {
  if (!collectorStats[name].enabled) {
    collectors.enableCollector(name);
  }
});
```

3. **데이터베이스 직접 확인**
```bash
# SQLite 데이터베이스 확인
sqlite3 modules/log-system/python/dev_logs.db
.tables
SELECT COUNT(*) FROM logs;
SELECT * FROM logs ORDER BY timestamp DESC LIMIT 5;
.exit
```

---

## 🔗 **연결 문제**

### **문제: JSON-RPC 연결 실패**

#### **증상**
```
Error: ECONNREFUSED 127.0.0.1:8888
```

#### **해결방법**

1. **연결 상태 진단**
```javascript
// 연결 테스트 함수
async function testConnection() {
  try {
    const response = await fetch('http://localhost:8888/health');
    const data = await response.json();
    console.log('Health Check:', data);
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

testConnection();
```

2. **수동 재연결**
```javascript
// 강제 재연결
await logSystem.disconnect();
await new Promise(resolve => setTimeout(resolve, 2000));
await logSystem.connect();
```

3. **네트워크 설정 확인**
```bash
# 방화벽 설정 확인 (Linux)
sudo ufw status
sudo iptables -L

# Windows 방화벽 확인
netsh advfirewall show allprofiles
```

### **문제: 연결이 자주 끊어짐**

#### **해결방법**

1. **하트비트 설정 조정**
```yaml
# config/development.yaml
server:
  heartbeat_interval: 30000  # 30초
  connection_timeout: 60000  # 60초
  max_reconnect_attempts: 10
```

2. **연결 풀 설정**
```javascript
const logSystem = new LogSystemBridge({
  connectionPool: {
    max: 5,
    min: 1,
    idle: 30000,
    acquire: 60000
  }
});
```

---

## ⚡ **성능 문제**

### **문제: 로그 처리 속도가 느림**

#### **증상**
- 로그 기록 시 응답 시간이 1초 이상
- 높은 CPU 사용률
- 메모리 사용량 지속적 증가

#### **해결방법**

1. **배치 처리 활성화**
```javascript
// 개별 로그 대신 배치 처리 사용
const logs = [];
for (let i = 0; i < 100; i++) {
  logs.push({
    level: 'INFO',
    message: `Batch log ${i}`,
    source: 'batch_test'
  });
}

await logSystem.logBatch(logs, true); // 압축 활성화
```

2. **버퍼 크기 조정**
```yaml
# config/development.yaml
collectors:
  buffer_size: 1000      # 기본 100에서 증가
  flush_interval: 2000   # 2초마다 플러시
  compression: true      # 압축 활성화
```

3. **데이터베이스 최적화**
```bash
# SQLite 데이터베이스 최적화
sqlite3 modules/log-system/python/dev_logs.db
VACUUM;
ANALYZE;
PRAGMA optimize;
.exit
```

### **문제: 메모리 사용량 과다**

#### **해결방법**

1. **메모리 모니터링**
```javascript
// 메모리 사용량 모니터링
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory Usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
  });
}, 30000);
```

2. **가비지 컬렉션 강제 실행**
```javascript
// 메모리 임계값 도달 시 GC 실행
if (process.memoryUsage().heapUsed > 100 * 1024 * 1024) { // 100MB
  if (global.gc) {
    global.gc();
  }
}
```

3. **버퍼 크기 제한**
```javascript
class MemoryOptimizedCollector extends CustomCollector {
  constructor(name, config) {
    super(name, {
      buffer_size: 500,        // 버퍼 크기 제한
      max_memory_mb: 50,       // 최대 메모리 사용량
      ...config
    });
  }
}
```

---

## 📊 **데이터 문제**

### **문제: 로그 데이터 손실**

#### **증상**
- 일부 로그가 데이터베이스에 저장되지 않음
- 통계에서 누락된 데이터 발견

#### **해결방법**

1. **데이터 무결성 검사**
```javascript
async function checkDataIntegrity() {
  const stats = await logSystem.getStats('24h');
  const dbCount = await logSystem.query({ since: '24h', limit: 1 });
  
  console.log('Stats total:', stats.total_logs);
  console.log('DB total:', dbCount.total);
  
  if (stats.total_logs !== dbCount.total) {
    console.warn('Data integrity issue detected!');
  }
}
```

2. **트랜잭션 로그 확인**
```bash
# SQLite WAL 모드 확인
sqlite3 modules/log-system/python/dev_logs.db
PRAGMA journal_mode;
PRAGMA synchronous;
.exit
```

3. **백업 및 복구**
```bash
# 데이터베이스 백업
cp modules/log-system/python/dev_logs.db modules/log-system/python/dev_logs.db.backup

# 손상된 데이터베이스 복구
sqlite3 modules/log-system/python/dev_logs.db
.recover
.exit
```

### **문제: 중복 로그 엔트리**

#### **해결방법**

1. **중복 검사 활성화**
```yaml
# config/development.yaml
storage:
  check_duplicates: true
  duplicate_window: 1000  # 1초 내 중복 체크
```

2. **중복 제거 쿼리**
```sql
-- 중복 로그 찾기
SELECT message, source, COUNT(*) as count
FROM logs 
WHERE timestamp > datetime('now', '-1 hour')
GROUP BY message, source, level
HAVING count > 1;

-- 중복 로그 제거 (주의: 백업 후 실행)
DELETE FROM logs 
WHERE rowid NOT IN (
  SELECT MIN(rowid) 
  FROM logs 
  GROUP BY timestamp, message, source, level
);
```

---

## ⚙️ **설정 문제**

### **문제: 설정 파일 로드 실패**

#### **증상**
```
Error: Configuration file not found: config/development.yaml
```

#### **해결방법**

1. **설정 파일 경로 확인**
```bash
# 설정 파일 존재 확인
ls -la modules/log-system/config/
find . -name "*.yaml" -type f

# 기본 설정으로 복사
cp modules/log-system/config/default.yaml modules/log-system/config/development.yaml
```

2. **설정 검증**
```javascript
const { validateConfig } = require('./src/utils/config-manager');

try {
  const config = await validateConfig('./config/development.yaml');
  console.log('Config validation passed');
} catch (error) {
  console.error('Config validation failed:', error.message);
}
```

3. **환경 변수 설정**
```bash
# 환경 변수로 설정 오버라이드
export LOG_SYSTEM_CONFIG_PATH=/path/to/config.yaml
export LOG_SYSTEM_PORT=8889
export LOG_SYSTEM_DB_PATH=/path/to/logs.db
```

---

## 🔍 **디버깅 도구**

### **디버그 모드 활성화**

```bash
# 상세 로깅 활성화
DEBUG=log-system:* npm run logs:dev

# 또는 환경 변수 설정
export DEBUG=log-system:*
export LOG_LEVEL=DEBUG
npm start
```

### **내부 상태 검사**

```javascript
// 시스템 진단 함수
async function diagnoseSystem() {
  console.log('=== System Diagnosis ===');
  
  // 1. 시스템 상태
  const status = await logSystem.getSystemStatus();
  console.log('System Status:', status.status);
  console.log('Python Server:', status.python_server);
  console.log('Database:', status.database);
  
  // 2. 수집기 상태
  const collectors = logSystem.getCollectors();
  console.log('Collectors:', collectors.getCollectorStats());
  
  // 3. 최근 에러
  const mcpTools = logSystem.getMCPTools();
  const errors = await mcpTools.get_recent_errors({ minutes: 30 });
  console.log('Recent Errors:', errors.summary);
  
  // 4. 성능 메트릭
  const performance = await mcpTools.analyze_performance({ timerange: '1h' });
  console.log('Performance:', performance.summary);
}

diagnoseSystem().catch(console.error);
```

### **네트워크 진단**

```bash
# 포트 연결 테스트
telnet localhost 8888

# HTTP 엔드포인트 테스트
curl -X POST http://localhost:8888/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"health_check","params":{},"id":1}'

# 연결 상태 모니터링
netstat -an | grep 8888 | watch -n 1
```

---

## 📋 **로그 분석**

### **로그 파일 위치**

```bash
# Node.js 로그
tail -f modules/log-system/logs/bridge.log
tail -f modules/log-system/logs/error.log

# Python 서버 로그
tail -f modules/log-system/python/logs/server.log
tail -f modules/log-system/python/logs/error.log

# 시스템 로그 (Linux)
tail -f /var/log/syslog | grep log-system
```

### **로그 패턴 분석**

```bash
# 에러 패턴 찾기
grep -E "(ERROR|FATAL)" modules/log-system/logs/*.log | tail -20

# 성능 이슈 찾기
grep -E "slow|timeout|performance" modules/log-system/logs/*.log

# 연결 문제 찾기
grep -E "connection|reconnect|disconnect" modules/log-system/logs/*.log
```

### **자동 문제 감지**

```javascript
// 자동 문제 감지 스크립트
async function autoDetectIssues() {
  const issues = [];
  
  // 1. 에러율 체크
  const stats = await logSystem.getStats('1h');
  const errorRate = (stats.by_level.ERROR || 0) / stats.total_logs * 100;
  if (errorRate > 5) {
    issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
  }
  
  // 2. 메모리 사용량 체크
  const status = await logSystem.getSystemStatus();
  if (status.python_server.memory_mb > 200) {
    issues.push(`High memory usage: ${status.python_server.memory_mb}MB`);
  }
  
  // 3. 응답 시간 체크
  if (status.performance.avg_response_time > 1000) {
    issues.push(`Slow response time: ${status.performance.avg_response_time}ms`);
  }
  
  // 4. 데이터베이스 크기 체크
  if (status.database.size_mb > 1000) {
    issues.push(`Large database: ${status.database.size_mb}MB`);
  }
  
  return issues;
}

// 주기적 체크
setInterval(async () => {
  const issues = await autoDetectIssues();
  if (issues.length > 0) {
    console.warn('Issues detected:', issues);
  }
}, 300000); // 5분마다
```

---

## 🆘 **긴급 복구 절차**

### **시스템 완전 재시작**

```bash
# 1. 모든 프로세스 정지
npm run logs:stop
pkill -f "python.*main.py"

# 2. 임시 파일 정리
rm -f modules/log-system/python/*.pid
rm -f modules/log-system/logs/*.lock

# 3. 데이터베이스 체크
sqlite3 modules/log-system/python/dev_logs.db "PRAGMA integrity_check;"

# 4. 시스템 재시작
npm run logs:start
```

### **데이터베이스 복구**

```bash
# 백업에서 복구
cp modules/log-system/python/dev_logs.db.backup modules/log-system/python/dev_logs.db

# 또는 새 데이터베이스 생성
rm modules/log-system/python/dev_logs.db
npm run logs:setup:db
```

---

## 📞 **지원 요청**

문제가 해결되지 않을 경우:

1. **로그 수집**: 관련 로그 파일들을 수집
2. **환경 정보**: OS, Node.js, Python 버전 정보
3. **재현 단계**: 문제 재현 방법 기록
4. **설정 파일**: 사용 중인 설정 파일들

### **진단 정보 수집 스크립트**

```bash
#!/bin/bash
# collect-diagnostics.sh

echo "=== Recursive Log System Diagnostics ===" > diagnostics.txt
echo "Date: $(date)" >> diagnostics.txt
echo "OS: $(uname -a)" >> diagnostics.txt
echo "Node.js: $(node --version)" >> diagnostics.txt
echo "Python: $(python --version)" >> diagnostics.txt
echo "" >> diagnostics.txt

echo "=== System Status ===" >> diagnostics.txt
curl -s http://localhost:8888/health >> diagnostics.txt 2>&1
echo "" >> diagnostics.txt

echo "=== Recent Logs ===" >> diagnostics.txt
tail -50 modules/log-system/logs/*.log >> diagnostics.txt 2>&1

echo "=== Configuration ===" >> diagnostics.txt
cat modules/log-system/config/development.yaml >> diagnostics.txt 2>&1

echo "Diagnostics collected in diagnostics.txt" 