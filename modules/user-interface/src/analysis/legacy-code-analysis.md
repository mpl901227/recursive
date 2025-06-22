# 🔍 Legacy Code Analysis Report

## 📋 분석 개요

**분석 대상**: `core/server/public/` 디렉토리의 기존 프론트엔드 코드  
**분석 일시**: 2024년 현재  
**분석 목적**: TypeScript 모듈형 아키텍처로의 마이그레이션 준비  

---

## 📁 파일 구조 분석

### 현재 구조
```
core/server/public/
├── index.html (1,720줄)
├── js/
│   ├── websocket-client.js (221줄)
│   ├── mcp-client.js (271줄)
│   └── modules/
│       └── mcp-client.js (478줄)
```

### 문제점
- **모놀리식 구조**: 모든 코드가 하나의 HTML 파일에 집중
- **인라인 코드**: CSS(~800줄)와 JavaScript(~500줄)가 HTML에 포함
- **모듈화 부족**: 기능별 분리가 되어있지 않음
- **타입 안전성 없음**: JavaScript로만 작성되어 런타임 오류 위험

---

## 🎨 CSS 분석

### 현재 상태 (인라인 CSS ~800줄)

**1. 디자인 시스템**
```css
:root {
  /* Modern Design System */
  --primary-500: #3b82f6;
  --gray-50: #f9fafb;
  /* Layout Variables */
  --header-height: 64px;
  --sidebar-width: 280px;
  --ai-sidebar-width: 360px;
}
```

**2. 레이아웃 시스템**
- **Grid Layout**: 3-column grid (sidebar + main + ai-sidebar)
- **Responsive**: Mobile-first approach
- **Flexible**: 사이드바 접기/펼치기 기능

**3. 컴포넌트 스타일**
- Header, Sidebar, Main Content, AI Sidebar
- Button, Input, Card, Modal 등 기본 컴포넌트
- 상태별 스타일 (hover, active, disabled)

**마이그레이션 전략**:
- CSS Modules 또는 Styled Components 사용
- 디자인 토큰을 TypeScript 상수로 변환
- 컴포넌트별 스타일 파일 분리

---

## 🔧 JavaScript 분석

### 1. WebSocket Client (`websocket-client.js` - 221줄)

**주요 기능**:
- WebSocket 연결 관리
- 자동 재연결 (최대 5회)
- 하트비트 시스템 (15초 간격)
- 이벤트 기반 아키텍처

**클래스 구조**:
```javascript
class WebSocketClient {
  constructor(url)
  on(event, callback)
  emit(event, data)
  connect()
  send(data)
  disconnect()
  getConnectionStatus()
}
```

**마이그레이션 계획**:
- TypeScript 인터페이스 정의
- `modules/user-interface/src/services/websocket/` 로 이동
- 기존 EventManager와 통합

### 2. MCP Client (`mcp-client.js` - 271줄)

**주요 기능**:
- MCP (Model Context Protocol) WebSocket 통신
- JSON-RPC 2.0 프로토콜 지원
- Tool 호출 시스템
- 비동기 요청/응답 관리

**클래스 구조**:
```javascript
class MCPClient {
  constructor(wsUrl)
  connect()
  sendMessage(message)
  callTool(toolName, args)
  startInteractiveDiagnosis(params)
  respondToDiagnosis(sessionId, params)
}
```

**마이그레이션 계획**:
- TypeScript 인터페이스 정의
- `modules/user-interface/src/services/mcp/` 로 이동
- 타입 안전성 강화

### 3. 인라인 JavaScript (~500줄)

**주요 기능들**:

**A. 레이아웃 관리**
```javascript
// 사이드바 토글
function toggleLeftSidebar()
function toggleRightSidebar()
function handleLayoutResize()

// 반응형 레이아웃
function initializeLayout()
function setupEventListeners()
```

**B. 섹션 관리**
```javascript
function showSection(sectionName)
// WebSocket Demo, MCP Tools, Settings 등
```

**C. WebSocket 데모**
```javascript
function initializeWebSocket()
function sendMessage()
function sendEcho()
function sendBroadcast()
function refreshMetrics()
```

**D. 유틸리티 함수**
```javascript
function logMessage(message, type)
function debounce(func, wait)
function logPerformanceMetrics()
```

**마이그레이션 계획**:
- 기능별로 모듈 분리
- TypeScript 클래스/인터페이스로 변환
- 컴포넌트 기반 아키텍처로 재구성

---

## 🏗️ 아키텍처 분석

### 현재 아키텍처
```
┌─────────────────────────────────────┐
│           index.html                │
│  ┌─────────────────────────────────┐│
│  │        Inline CSS              ││
│  │     (~800 lines)               ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │      Inline JavaScript         ││
│  │     (~500 lines)               ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │     External Scripts           ││
│  │  - websocket-client.js         ││
│  │  - mcp-client.js               ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### 문제점
1. **단일 파일 의존성**: 모든 코드가 하나의 HTML 파일에 의존
2. **전역 네임스페이스 오염**: 모든 함수가 전역 스코프에 존재
3. **모듈 간 의존성 불분명**: 암시적 의존성으로 인한 유지보수 어려움
4. **타입 안전성 부족**: 런타임 오류 위험
5. **테스트 불가능**: 단위 테스트 작성 어려움

### 목표 아키텍처
```
┌─────────────────────────────────────┐
│        TypeScript Modules           │
│  ┌─────────────────────────────────┐│
│  │         Core System             ││
│  │  - App, Config, Events, etc.    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │        Components               ││
│  │  - Layout, Common, Features     ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │         Services                ││
│  │  - WebSocket, MCP, API, etc.    ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## 📊 복잡도 분석

### 코드 메트릭스

| 파일 | 라인 수 | 함수 수 | 클래스 수 | 복잡도 |
|------|---------|---------|-----------|--------|
| index.html | 1,720 | ~25 | 0 | 높음 |
| websocket-client.js | 221 | 15 | 1 | 중간 |
| mcp-client.js | 271 | 12 | 1 | 중간 |
| **총합** | **2,212** | **~52** | **2** | **높음** |

### 위험도 평가

**🔴 높은 위험**:
- 인라인 코드로 인한 유지보수성 저하
- 전역 변수 사용으로 인한 네임스페이스 충돌
- 타입 안전성 부족

**🟡 중간 위험**:
- 모듈 간 의존성 불분명
- 테스트 코드 부재

**🟢 낮은 위험**:
- 기존 기능은 안정적으로 동작
- 코드 품질은 양호한 편

---

## 🎯 마이그레이션 우선순위

### Phase 1: 핵심 시스템 (완료)
- [x] 타입 정의
- [x] 설정 관리
- [x] 이벤트 시스템
- [x] 생명주기 관리
- [x] 라우터 시스템
- [x] 메인 애플리케이션 클래스

### Phase 2: 서비스 레이어 (다음 단계)
- [ ] WebSocket 서비스 마이그레이션
- [ ] MCP 서비스 마이그레이션
- [ ] API 서비스 구현

### Phase 3: 컴포넌트 레이어
- [ ] 레이아웃 컴포넌트
- [ ] 공통 컴포넌트
- [ ] 기능별 컴포넌트

### Phase 4: 통합 및 최적화
- [ ] 기존 코드와의 호환성 확보
- [ ] 성능 최적화
- [ ] 테스트 코드 작성

---

## 🔄 호환성 전략

### 점진적 마이그레이션
1. **Dual Mode**: 기존 코드와 새 코드 동시 지원
2. **Feature Flag**: 기능별 전환 가능
3. **Backward Compatibility**: 기존 API 유지

### 전환 계획
```javascript
// 기존 코드 (레거시)
window.WebSocketClient = WebSocketClient;

// 새 코드 (TypeScript 모듈)
import { WebSocketService } from './services/websocket';

// 호환성 브리지
window.WebSocketClient = WebSocketService.createLegacyClient();
```

---

## 📝 마이그레이션 체크리스트

### 즉시 해결 필요
- [ ] 전역 변수 정리
- [ ] 함수 모듈화
- [ ] 타입 정의 추가

### 단계적 해결
- [ ] CSS 모듈화
- [ ] 컴포넌트 분리
- [ ] 테스트 코드 작성

### 장기 계획
- [ ] 성능 최적화
- [ ] 접근성 개선
- [ ] PWA 기능 추가

---

## 🎉 결론

기존 코드는 **기능적으로는 안정적**이지만, **구조적으로는 개선이 필요**합니다. 

**주요 강점**:
- 완성도 높은 기능들
- 반응형 디자인
- 좋은 사용자 경험

**주요 약점**:
- 모놀리식 구조
- 타입 안전성 부족
- 테스트 어려움

**마이그레이션 전략**:
- **점진적 전환**: 기존 기능 유지하면서 단계적 개선
- **타입 안전성**: TypeScript로 완전 전환
- **모듈화**: 기능별 독립적인 모듈로 분리

이 분석을 바탕으로 **Phase 3: 서비스 구현**을 시작할 준비가 완료되었습니다. 