# 통합 로그 수집기 실용적 기능 명세서

## 1. 개요
개인 개발자를 위한 JSON-RPC 2.0 기반 로그 수집 시스템으로, 실용적이고 확장 가능하며 LLM 연동이 용이한 구조

## 2. 실용적 아키텍처
```
[로그 소스들] → [경량 에이전트] → [중앙 서버] → [SQLite/파일] → [MCP Interface]
                                      ↓
                              [실시간 분석] → [알림]
```

## 3. 핵심 컴포넌트

### 3.1 중앙 로그 서버
- **프로토콜**: JSON-RPC 2.0 over HTTP/WebSocket
- **포트**: 8888 (기본값)
- **경량**: 단일 바이너리로 실행

### 3.2 스마트 에이전트
- 각 로그 소스별 독립 프로세스
- 자동 재연결 및 버퍼링
- CPU/메모리 사용량 최소화

## 4. 개발자 필수 로그 소스

### 4.1 코드 실행 관련
| 소스 | 설명 | 우선순위 |
|------|------|----------|
| Console Output | 앱 stdout/stderr | 필수 |
| Application Log | 코드 내 로깅 | 필수 |
| Error Trace | 예외/스택 트레이스 | 필수 |
| Test Results | 테스트 실행 결과 | 중요 |

### 4.2 시스템 & 네트워크
| 소스 | 설명 | 우선순위 |
|------|------|----------|
| HTTP Traffic | API 요청/응답 | 필수 |
| File Changes | 코드/설정 파일 변경 | 중요 |
| Process Monitor | CPU/메모리 사용량 | 보통 |
| Port Activity | 로컬 서버 포트 상태 | 보통 |

### 4.3 데이터베이스
| 소스 | 설명 | 우선순위 |
|------|------|----------|
| SQL Query | 쿼리 실행 로그 | 필수 |
| Connection | DB 연결 상태 | 중요 |
| Performance | 슬로우 쿼리 탐지 | 중요 |

### 4.4 개발 도구
| 소스 | 설명 | 우선순위 |
|------|------|----------|
| Git Activity | 커밋, 브랜치 변경 | 보통 |
| Build Process | 빌드/배포 로그 | 중요 |
| Docker/Container | 컨테이너 로그 | 중요 |

## 5. 실용적 JSON-RPC API

### 5.1 기본 로그 수집
```json
{
  "jsonrpc": "2.0",
  "method": "log",
  "params": {
    "source": "http_traffic",
    "level": "INFO",
    "message": "GET /api/users - 200 OK",
    "metadata": {
      "method": "GET",
      "url": "/api/users", 
      "status": 200,
      "duration": 150
    }
  },
  "id": 1
}
```

### 5.2 배치 수집 (성능 최적화)
```json
{
  "jsonrpc": "2.0", 
  "method": "log_batch",
  "params": {
    "logs": [...],
    "compress": true
  },
  "id": 2
}
```

### 5.3 실시간 조회
```json
{
  "jsonrpc": "2.0",
  "method": "query",
  "params": {
    "sources": ["error_logs", "http_traffic"],
    "since": "5m",
    "level": ["ERROR", "WARN"],
    "limit": 50
  },
  "id": 3
}
```

### 5.4 패턴 검색
```json
{
  "jsonrpc": "2.0",
  "method": "search",
  "params": {
    "query": "database timeout",
    "timerange": "1h",
    "context": 5
  },
  "id": 4
}
```

## 6. 간단한 데이터 구조

### 6.1 표준 로그 스키마
```json
{
  "id": "uuid",
  "source": "source_name", 
  "level": "DEBUG|INFO|WARN|ERROR|FATAL",
  "timestamp": "2025-06-18T10:30:00Z",
  "message": "human readable message",
  "metadata": {
    // 소스별 구조화된 데이터
  },
  "tags": ["api", "database"],
  "trace_id": "optional_for_correlation"
}
```

### 6.2 실용적 메타데이터

**HTTP 요청**
```json
"metadata": {
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration_ms": 150,
  "ip": "127.0.0.1"
}
```

**DB 쿼리**
```json
"metadata": {
  "query": "SELECT * FROM users WHERE id = ?",
  "duration_ms": 25,
  "rows": 1,
  "db": "myapp_dev"
}
```

**에러**
```json
"metadata": {
  "exception": "ValueError",
  "file": "app.py",
  "line": 42,
  "stack_trace": "..."
}
```

## 7. 효율적 저장소

### 7.1 기본 저장소
- **SQLite**: 개발용 (기본값)
- **단일 파일**: 이식성 좋음
- **자동 인덱싱**: 자주 검색하는 필드

### 7.2 저장 최적화
```yaml
storage:
  type: "sqlite"
  path: "./dev_logs.db"
  rotation:
    max_size: "500MB"
    max_days: 7
  indexes:
    - ["timestamp", "source"]
    - ["level", "timestamp"] 
    - ["message"] # FTS
```

## 8. 실시간 분석 (경량)

### 8.1 간단한 패턴 탐지
- **에러율 급증**: 5분간 에러 20% 이상 증가
- **응답시간 지연**: 평소 대비 3배 이상 느림
- **반복 에러**: 동일 에러 1분간 10회 이상

### 8.2 스마트 알림
```python
alerts:
  error_spike:
    condition: "error_count > avg(error_count, 1h) * 3"
    cooldown: "10m"
    action: "desktop_notification"
  
  slow_query:
    condition: "db_query.duration > 1000ms"
    action: "log_highlight"
    
  build_failure:
    condition: "build_status == 'failed'"
    action: "urgent_notification"
```

## 9. 개발자 친화적 설정

### 9.1 프로젝트별 설정
```yaml
# project_logs.yaml
project: "my-web-app"
sources:
  http:
    enabled: true
    port: 8080
    ignore_paths: ["/health", "/metrics"]
  
  database:
    enabled: true
    connection: "postgresql://localhost/myapp_dev"
    slow_query_threshold: "100ms"
    
  files:
    enabled: true
    watch_paths: ["./src", "./config"]
    ignore_patterns: ["*.pyc", "node_modules"]
    
  console:
    enabled: true
    commands: 
      - "python manage.py runserver"
      - "npm run dev"
```

### 9.2 IDE 통합
```json
// vscode settings.json
{
  "log-collector.server": "http://localhost:8888",
  "log-collector.auto-start": true,
  "log-collector.project-config": "./project_logs.yaml"
}
```

## 10. 간편한 실행

### 10.1 원클릭 시작
```bash
# 프로젝트 디렉토리에서
log-collector start

# 특정 설정으로
log-collector start --config ./my-config.yaml

# 백그라운드 실행
log-collector daemon
```

### 10.2 자동 설정
```bash
# 프로젝트 초기화 (설정 파일 생성)
log-collector init --type webapp

# 프레임워크별 자동 설정
log-collector init --framework django
log-collector init --framework express
log-collector init --framework spring
```

## 11. Python SDK (간단)

### 11.1 자동 통합
```python
# 한 줄로 모든 로깅 활성화
from log_collector import enable_auto_logging
enable_auto_logging()

# 선택적 활성화
from log_collector import enable_http_logging, enable_db_logging
enable_http_logging(port=8080)
enable_db_logging("postgresql://localhost/myapp")
```

### 11.2 수동 로깅
```python
from log_collector import log

# 간단 로깅
log.info("User login", user_id=123)
log.error("Database connection failed", db="users", error=str(e))

# 컨텍스트 로깅
with log.context(trace_id="abc123"):
    log.info("Processing order", order_id=456)
```

## 12. 실용적 MCP 연동

### 12.1 핵심 MCP 도구
```python
@mcp_tool
def get_recent_errors(minutes: int = 30) -> List[Dict]:
    """최근 에러 로그 조회"""

@mcp_tool  
def find_slow_queries(threshold_ms: int = 1000) -> List[Dict]:
    """슬로우 쿼리 찾기"""

@mcp_tool
def trace_request(trace_id: str) -> Dict:
    """요청 추적 (HTTP -> DB -> 응답)"""

@mcp_tool
def analyze_error_pattern(error_message: str) -> Dict:
    """유사한 에러 패턴 분석"""
```

### 12.2 개발자 워크플로우 지원
```python
@mcp_tool
def debug_session(since: str = "5m") -> Dict:
    """디버깅용 종합 로그 수집"""
    return {
        "errors": get_recent_errors(),
        "slow_queries": find_slow_queries(),
        "http_traffic": get_recent_requests(),
        "system_metrics": get_system_status()
    }
```

## 13. 성능 목표 (개인용)

### 13.1 리소스 사용량
- **메모리**: 기본 50MB 이하
- **CPU**: 유휴시 1% 이하  
- **디스크**: 로그 압축으로 공간 절약
- **네트워크**: 로컬 우선, 최소 대역폭

### 13.2 응답성
- **로그 수집**: 100ms 이내 처리
- **검색**: 1초 이내 결과 반환
- **실시간**: WebSocket으로 즉시 스트리밍

## 14. 확장 포인트

### 14.1 플러그인 시스템 (간단)
```python
# custom_parser.py
def parse_nginx_log(line: str) -> Dict:
    # nginx 로그 파싱 로직
    return parsed_data

# 플러그인 등록
log_collector.register_parser("nginx", parse_nginx_log)
```

### 14.2 향후 확장 대비
- **원격 저장소**: PostgreSQL, ClickHouse 추가 가능
- **클러스터링**: 필요시 수평 확장
- **고급 분석**: ML 모델 추가 가능
- **외부 연동**: Slack, Discord 알림

이제 개인 개발에 딱 맞는 실용적인 스펙이 되었네요! 오버엔지니어링 없이 진짜 필요한 기능들만 담았습니다.