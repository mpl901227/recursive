# 🔍 Recursive 로그 시스템 UI 통합 계획서

## 📋 **프로젝트 개요**

### **목표**
기존 Recursive 플랫폼의 `@recursive/log-system`을 `@recursive/user-interface`와 완전 통합하여 실시간 로그 모니터링, 분석, 디버깅 기능을 갖춘 통합 UI 환경 구축

### **핵심 전략**
- **기존 시스템 활용**: 완성된 log-system 백엔드(80% 완료) 활용
- **TypeScript 우선**: UI 모듈의 TypeScript 아키텍처와 완벽 통합
- **모듈형 설계**: 기존 컴포넌트 구조와 서비스 패턴 준수
- **실시간 체험**: WebSocket 기반 실시간 로그 스트리밍
- **개발자 경험**: MCP 도구와 연동된 강력한 디버깅 환경

### **현재 상황 분석**

#### **Log System 현황 (80% 완료)**
- ✅ Python 백엔드 (JSON-RPC 2.0 서버)
- ✅ Node.js 브릿지 완료
- ✅ 설정 관리 시스템
- ✅ 4개 수집기 구현 (MCP, WebSocket, AI, HTTP)
- ✅ 통합 테스트 완료 (12/15 통과)
- ⚠️ UI 컴포넌트 부재

#### **User Interface 현황**
- ✅ TypeScript 기반 모듈형 아키텍처
- ✅ Vite 빌드 시스템
- ✅ 서비스 레지스트리 시스템
- ✅ 컴포넌트 레지스트리 시스템
- ✅ 이벤트 관리 시스템
- ✅ 기존 대시보드 컴포넌트
- ⚠️ 로그 관련 기능 부재

---

## 🏗️ **아키텍처 설계**

### **전체 구조**
```
recursive/
├── modules/
│   ├── log-system/                     # 기존 백엔드 (완료)
│   │   ├── python/                     # Python JSON-RPC 서버
│   │   ├── src/                        # Node.js 브릿지
│   │   └── config/                     # 설정 파일들
│   │
│   └── user-interface/                 # UI 모듈 확장
│       ├── src/
│       │   ├── services/
│       │   │   └── log-system/         # 🆕 로그 시스템 서비스
│       │   │       ├── log-service.ts
│       │   │       ├── log-client.ts
│       │   │       └── index.ts
│       │   │
│       │   ├── components/
│       │   │   └── features/
│       │   │       ├── LogDashboard/   # 🆕 로그 대시보드
│       │   │       ├── LogViewer/      # 🆕 로그 뷰어
│       │   │       ├── LogSearch/      # 🆕 로그 검색
│       │   │       └── LogAnalysis/    # 🆕 로그 분석
│       │   │
│       │   └── types/
│       │       └── log-system.ts       # 🆕 타입 정의
│       │
│       └── public/
│           └── log-assets/             # 🆕 로그 관련 에셋
```

### **데이터 흐름**
```
[Python 로그 서버] ←→ [Node.js 브릿지] ←→ [LogService] ←→ [UI 컴포넌트들]
       ↓                    ↓                 ↓              ↓
   [SQLite DB]      [JSON-RPC Client]   [Event System]  [Real-time UI]
   [실시간 분석]     [WebSocket]         [State Mgmt]    [대시보드]
```

### **서비스 계층**
```typescript
// 서비스 통합 구조
Application
├── LogSystemService     (메인 로그 서비스)
├── LogAnalyticsService  (분석 서비스)
├── LogSearchService     (검색 서비스)
└── LogWebSocketService  (실시간 스트리밍)
```

---

## 🎯 **Phase별 구현 계획**

### **📌 Phase 1: 서비스 계층 구축 (1주차)**

#### **1.1 LogSystemService 구현**
**목표**: TypeScript 기반 로그 시스템 서비스 생성

**구현 내용**:
```typescript
// modules/user-interface/src/services/log-system/log-service.ts
export interface LogSystemConfig extends ServiceConfig {
  bridgeEndpoint: string;
  autoConnect: boolean;
  retryAttempts: number;
  bufferSize: number;
  realTimeEnabled: boolean;
}

export class LogSystemService implements Service {
  // 기본 서비스 인터페이스 구현
  // log-system 브릿지와의 통신
  // 실시간 업데이트 처리
  // 에러 처리 및 재연결
}
```

**체크리스트**:
- [ ] LogSystemService 클래스 구현
- [ ] log-system 브릿지와 HTTP/WebSocket 통신
- [ ] 서비스 생명주기 관리
- [ ] 에러 처리 및 재연결 로직
- [ ] 타입 정의 완료

#### **1.2 LogClient 구현**
**목표**: 백엔드 API와의 통신 클라이언트

**구현 내용**:
```typescript
// modules/user-interface/src/services/log-system/log-client.ts
export class LogClient {
  async query(params: LogQueryParams): Promise<LogQueryResult>
  async search(query: string, options: SearchOptions): Promise<SearchResult>
  async getStats(timeRange: TimeRange): Promise<LogStatistics>
  async streamLogs(callback: LogCallback): Promise<LogStream>
}
```

**체크리스트**:
- [ ] HTTP API 클라이언트 구현
- [ ] WebSocket 스트리밍 클라이언트
- [ ] 요청/응답 타입 정의
- [ ] 에러 처리 및 재시도
- [ ] 배치 요청 지원

#### **1.3 Application 통합**
**목표**: 메인 애플리케이션에 로그 서비스 등록

**구현 내용**:
```typescript
// app.ts의 registerDefaultServices에 추가
private async registerLogSystemService(): Promise<void> {
  const config = this.configManager.get('services.logSystem', {
    enabled: true,
    bridgeEndpoint: 'http://localhost:8888',
    autoConnect: true,
    realTimeEnabled: true
  });
  
  const logService = new LogSystemService(config, this.eventManager);
  this.serviceRegistry.register('log-system', logService);
}
```

**체크리스트**:
- [ ] 서비스 등록 로직 구현
- [ ] 설정 관리 통합
- [ ] 의존성 주입 설정
- [ ] 초기화 순서 관리

---

### **📌 Phase 2: 기본 컴포넌트 구현 (2주차)**

#### **2.1 LogViewer 컴포넌트**
**목표**: 기본 로그 뷰잉 기능

**구현 내용**:
```typescript
// modules/user-interface/src/components/features/LogViewer/LogViewer.ts
export interface LogViewerProps extends ComponentProps {
  autoRefresh?: boolean;
  pageSize?: number;
  showFilters?: boolean;
  showSearch?: boolean;
  realTimeMode?: boolean;
}

export class LogViewer extends BaseComponent<HTMLElement, LogViewerProps> {
  // 로그 엔트리 렌더링
  // 페이지네이션
  // 필터링 기능
  // 실시간 업데이트
}
```

**체크리스트**:
- [ ] 기본 로그 렌더링
- [ ] 페이지네이션 구현
- [ ] 레벨별 색상 코딩
- [ ] 시간 포맷팅
- [ ] 메타데이터 표시
- [ ] 무한 스크롤 지원

#### **2.2 LogSearch 컴포넌트**
**목표**: 로그 검색 및 필터링

**구현 내용**:
```typescript
// modules/user-interface/src/components/features/LogSearch/LogSearch.ts
export class LogSearch extends BaseComponent {
  // 텍스트 검색
  // 고급 필터링 (날짜, 레벨, 소스)
  // 정규식 지원
  // 검색 히스토리
}
```

**체크리스트**:
- [ ] 검색 입력 UI
- [ ] 필터 패널 구현
- [ ] 자동완성 기능
- [ ] 검색 결과 하이라이트
- [ ] 저장된 검색 쿼리

#### **2.3 LogDashboard 컴포넌트**
**목표**: 로그 시스템 대시보드

**구현 내용**:
```typescript
// modules/user-interface/src/components/features/LogDashboard/LogDashboard.ts
export class LogDashboard extends BaseComponent {
  // 시스템 상태 위젯
  // 에러율 차트
  // 최근 에러 목록
  // 실시간 로그 스트림
}
```

**체크리스트**:
- [ ] 위젯 기반 레이아웃
- [ ] 실시간 통계 차트
- [ ] 시스템 상태 모니터링
- [ ] 알림 및 경고 표시
- [ ] 사용자 정의 가능한 레이아웃

#### **2.4 컴포넌트 등록**
**목표**: 컴포넌트 레지스트리에 등록

**구현 내용**:
```typescript
// components/registry.ts에 추가
import { createLogViewerComponent } from './features/LogViewer/LogViewer.js';
import { createLogSearchComponent } from './features/LogSearch/LogSearch.js';
import { createLogDashboardComponent } from './features/LogDashboard/LogDashboard.js';

export const COMPONENT_REGISTRY = {
  // 기존 컴포넌트들...
  'LogViewer': createLogViewerComponent,
  'LogSearch': createLogSearchComponent,
  'LogDashboard': createLogDashboardComponent,
};
```

**체크리스트**:
- [ ] 컴포넌트 팩토리 함수 생성
- [ ] 레지스트리 등록
- [ ] 타입 정의 업데이트
- [ ] JSDoc 문서화

---

## 🔧 **기술적 고려사항**

### **타입 안정성**
```typescript
// modules/user-interface/src/types/log-system.ts
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, any>;
  trace_id?: string;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogQueryParams {
  sources?: string[];
  levels?: LogLevel[];
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}
```

### **성능 최적화**
- **가상 스크롤링**: 대량 로그 처리
- **지연 로딩**: 메타데이터 on-demand 로드
- **캐싱 전략**: 최근 검색 결과 캐시
- **배치 요청**: 여러 API 호출 최적화

### **사용자 경험**
- **로딩 상태**: 모든 비동기 작업에 로딩 표시
- **에러 처리**: 친화적인 에러 메시지
- **반응형 디자인**: 다양한 화면 크기 지원
- **키보드 단축키**: 파워 유저를 위한 단축키

---

## 📊 **성공 지표**

### **기능적 목표**
- [ ] 실시간 로그 스트리밍 (< 500ms 지연)
- [ ] 로그 검색 응답 시간 (< 200ms)
- [ ] 대량 로그 처리 (10,000+ 엔트리)
- [ ] 멀티 소스 필터링
- [ ] MCP 도구 연동

### **성능 목표**
- [ ] 초기 로드 시간 < 2초
- [ ] 메모리 사용량 < 100MB
- [ ] CPU 사용률 < 10%
- [ ] 네트워크 효율성 최적화

### **사용성 목표**
- [ ] 직관적인 UI/UX
- [ ] 접근성 준수 (WCAG 2.1)
- [ ] 모바일 지원
- [ ] 키보드 내비게이션

---

### **📌 Phase 3: 고급 기능 구현 (3주차)**

#### **3.1 LogAnalysis 컴포넌트**
**목표**: 로그 패턴 분석 및 인사이트

**구현 내용**:
```typescript
export class LogAnalysis extends BaseComponent {
  // 에러 패턴 분석
  // 성능 트렌드 차트
  // 비정상 패턴 탐지
  // AI 기반 추천
}
```

**체크리스트**:
- [ ] 에러 발생 패턴 분석
- [ ] 성능 지표 시각화
- [ ] 트렌드 차트 (Chart.js 또는 D3.js)
- [ ] 자동 알림 규칙 설정
- [ ] 보고서 생성 기능

#### **3.2 실시간 스트리밍**
**목표**: WebSocket 기반 실시간 로그 스트리밍

**구현 내용**:
```typescript
export class LogStreamService {
  private websocket: WebSocket;
  private buffer: LogEntry[] = [];
  
  async startStream(filters: LogFilter[]): Promise<void>
  async stopStream(): Promise<void>
  onLogEntry(callback: (entry: LogEntry) => void): void
}
```

**체크리스트**:
- [ ] WebSocket 연결 관리
- [ ] 실시간 필터링
- [ ] 버퍼링 및 배치 처리
- [ ] 연결 복구 로직
- [ ] 성능 최적화

#### **3.3 MCP 도구 통합**
**목표**: 기존 MCP 시스템과 로그 UI 연동

**구현 내용**:
```typescript
// MCP 도구에서 호출 가능한 UI 액션
export const logMCPTools = [
  'show_recent_errors',
  'open_log_search', 
  'jump_to_trace',
  'create_log_dashboard'
];
```

**체크리스트**:
- [ ] MCP 도구에서 UI 제어
- [ ] 로그 검색 결과를 MCP 응답
- [ ] trace_id 기반 컨텍스트 전환
- [ ] 디버깅 워크플로우 자동화

---

### **📌 Phase 4: 통합 및 최적화 (4주차)**

#### **4.1 성능 최적화**

**가상 스크롤링 구현**:
```typescript
export class VirtualScrollManager {
  private visibleStart = 0;
  private visibleEnd = 50;
  private itemHeight = 40;
  
  updateVisibleRange(scrollTop: number, containerHeight: number): void
  renderVisibleItems(): HTMLElement[]
}
```

**메모리 관리**:
```typescript
export class LogBufferManager {
  private maxBufferSize = 10000;
  private buffer: LogEntry[] = [];
  
  addEntry(entry: LogEntry): void
  pruneOldEntries(): void
  searchInBuffer(query: string): LogEntry[]
}
```

**체크리스트**:
- [ ] 가상 스크롤링 구현
- [ ] 메모리 사용량 최적화
- [ ] 검색 인덱싱
- [ ] 캐싱 전략 구현
- [ ] 배치 렌더링

#### **4.2 UI/UX 개선**

**테마 지원**:
```scss
// LogViewer.scss
.log-viewer {
  &--dark-theme {
    background: var(--color-bg-dark);
    color: var(--color-text-dark);
  }
  
  &--light-theme {
    background: var(--color-bg-light);
    color: var(--color-text-light);
  }
}
```

**반응형 디자인**:
```scss
@include mobile {
  .log-viewer {
    &__entry { font-size: 12px; }
    &__metadata { display: none; }
  }
}
```

**체크리스트**:
- [ ] 다크/라이트 테마 지원
- [ ] 반응형 레이아웃
- [ ] 키보드 단축키
- [ ] 접근성 개선 (ARIA)
- [ ] 로딩 및 에러 상태 개선

#### **4.3 설정 관리**

**사용자 설정**:
```typescript
export interface LogUISettings {
  theme: 'light' | 'dark' | 'auto';
  pageSize: number;
  autoRefresh: boolean;
  showMetadata: boolean;
  fontSize: 'small' | 'medium' | 'large';
  savedSearches: SavedSearch[];
}
```

**체크리스트**:
- [ ] 사용자 설정 저장/복원
- [ ] 설정 내보내기/가져오기
- [ ] 기본값 복원
- [ ] 설정 검증
- [ ] 설정 마이그레이션

---

### **📌 Phase 5: 배포 및 검증 (5주차)**

#### **5.1 패키지 통합**

**의존성 업데이트**:
```json
// modules/user-interface/package.json
{
  "dependencies": {
    "@recursive/log-system": "^1.0.0",
    "chart.js": "^4.0.0",
    "date-fns": "^3.0.0"
  }
}
```

**빌드 설정**:
```typescript
// vite.config.js 업데이트
export default defineConfig({
  resolve: {
    alias: {
      '@log-system': path.resolve(__dirname, '../log-system/src')
    }
  }
});
```

**체크리스트**:
- [ ] package.json 의존성 추가
- [ ] 빌드 설정 업데이트
- [ ] 타입 정의 내보내기
- [ ] 번들 크기 최적화

#### **5.2 테스트 구현**

**단위 테스트**:
```typescript
// LogViewer.test.ts
describe('LogViewer Component', () => {
  test('should render log entries', () => {
    // 컴포넌트 렌더링 테스트
  });
  
  test('should handle real-time updates', () => {
    // 실시간 업데이트 테스트
  });
});
```

**통합 테스트**:
```typescript
// log-system-integration.test.ts
describe('Log System Integration', () => {
  test('should connect to log service', () => {
    // 서비스 연결 테스트
  });
});
```

**체크리스트**:
- [ ] 컴포넌트 단위 테스트
- [ ] 서비스 테스트
- [ ] 통합 테스트
- [ ] E2E 테스트
- [ ] 성능 테스트

#### **5.3 문서화**

**API 문서**:
```markdown
## LogSystemService API

### Methods
- `query(params: LogQueryParams): Promise<LogQueryResult>`
- `search(query: string): Promise<SearchResult>`
- `getStats(): Promise<LogStatistics>`
```

**사용자 가이드**:
```markdown
## 로그 시스템 사용법

1. 대시보드에서 로그 상태 확인
2. 로그 뷰어에서 실시간 로그 모니터링
3. 검색 기능으로 특정 로그 찾기
4. 분석 도구로 패턴 파악
```

**체크리스트**:
- [ ] API 문서 작성
- [ ] 사용자 가이드 작성
- [ ] 개발자 가이드 작성
- [ ] 트러블슈팅 가이드
- [ ] README 업데이트

---

## 🧪 **테스트 전략**

### **테스트 피라미드**
```
E2E Tests (10%)        ← 전체 워크플로우
  ↑
Integration Tests (20%) ← 서비스 간 통합
  ↑
Unit Tests (70%)       ← 개별 컴포넌트/서비스
```

### **성능 테스트**
- **로그 처리량**: 1,000 logs/second
- **메모리 사용량**: < 100MB
- **UI 응답성**: 60fps 유지
- **검색 속도**: < 200ms

### **브라우저 호환성**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 📋 **완료 체크리스트**

### **Phase 1: 서비스 계층 ✅**
- [ ] LogSystemService 구현
- [ ] LogClient 구현  
- [ ] Application 통합
- [ ] 타입 정의 완료

### **Phase 2: 기본 컴포넌트 ✅**
- [ ] LogViewer 컴포넌트
- [ ] LogSearch 컴포넌트
- [ ] LogDashboard 컴포넌트
- [ ] 컴포넌트 등록

### **Phase 3: 고급 기능 ✅**
- [ ] LogAnalysis 컴포넌트
- [ ] 실시간 스트리밍
- [ ] MCP 도구 통합

### **Phase 4: 최적화 ✅**
- [ ] 성능 최적화
- [ ] UI/UX 개선
- [ ] 설정 관리

### **Phase 5: 배포 ✅**
- [ ] 패키지 통합
- [ ] 테스트 구현
- [ ] 문서화

---

## 🚀 **예상 결과**

### **개발 기간**: 5주
### **필요 리소스**: 개발자 1명 풀타임
### **위험도**: 중간 (기존 시스템 통합)

### **완료 후 기대 효과**
- **디버깅 효율성 70% 향상**
- **문제 발견 시간 60% 단축**
- **개발 생산성 50% 향상**
- **시스템 가시성 대폭 개선**

---

## 🎯 **다음 단계**

완료 후 다음 기능들을 추가 개발할 수 있습니다:

1. **고급 분석**: ML 기반 이상 탐지
2. **알림 시스템**: Slack/Teams 연동
3. **보고서 생성**: PDF/Excel 내보내기
4. **외부 연동**: ELK Stack, Grafana 연동
5. **모바일 앱**: React Native 기반

---

**🚀 이제 Phase 1부터 단계별로 구현을 시작하세요!** 