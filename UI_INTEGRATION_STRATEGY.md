# 🚀 User Interface V4 통합 전략 및 구조 개선 계획

## 📋 개요

이 문서는 `user-interface-v4`를 recursive 플랫폼의 메인 UI로 통합하기 위한 종합적인 전략과 구조 개선 계획을 제시합니다.

## 🎯 목표

1. **UI 통합**: user-interface-v4를 메인 UI로 설정
2. **구조 표준화**: 전체 프로젝트의 구조적 일관성 확보
3. **성능 최적화**: 모듈 간 효율적인 통신 체계 구축
4. **확장성 확보**: 향후 개발을 위한 유연한 아키텍처 구축

---

## 📊 현재 상황 분석

### 🔍 기존 UI 모듈 현황

| 모듈 | 기술스택 | 포트 | 상태 | 권장사항 |
|------|---------|------|------|----------|
| user-interface | Vite + TypeScript | 3001 | 활성 | 단계적 폐기 |
| user-interface-v2 | Vite + TypeScript | 3000 | 활성 | 백업 유지 |
| user-interface-v3 | Next.js + React | 3000 | 신규 | 참고용 유지 |
| **user-interface-v4** | **Next.js + React** | **3000** | **신규** | **메인 UI로 채택** |

### ⚠️ 식별된 문제점

1. **패키지 매니저 혼재**: npm(기존) vs pnpm(v4)
2. **네임스페이스 불일치**: @recursive/* 누락
3. **포트 충돌 위험**: 여러 UI가 동일 포트 사용
4. **빌드 시스템 분리**: Vite vs Next.js

---

## 🛠️ 구조 개선 계획

### Phase 1: 기본 구조 표준화 (1-2일)

#### 1.1 네임스페이스 통일
```json
// modules/user-interface-v4/package.json
{
  "name": "@recursive/user-interface-v4",
  "version": "1.0.0",
  "description": "Recursive UI Module - Advanced Next.js implementation with system admin",
  "main": "src/app.tsx"
}
```

#### 1.2 패키지 매니저 표준화
```bash
# v4에서 pnpm 제거, npm 사용으로 통일
cd modules/user-interface-v4
rm pnpm-lock.yaml
npm install
```

#### 1.3 포트 구성 체계화
```javascript
// 포트 할당 계획
const portConfig = {
  server: 3000,      // 메인 HTTP 서버
  websocket: 3001,   // WebSocket 서버
  ui_v4: 3002,       // user-interface-v4 (개발)
  logs: 8888,        // Python 로그 서버
  ui_legacy: 3003    // 기존 UI (필요시)
}
```

#### 1.4 워크스페이스 스크립트 업데이트
```json
// 루트 package.json 수정
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:ui-v4\"",
    "dev:ui-v4": "cd modules/user-interface-v4 && npm run dev -- --port 3002",
    "build": "npm run build:server && npm run build:ui-v4",
    "build:ui-v4": "cd modules/user-interface-v4 && npm run build",
    "start:production": "NODE_ENV=production npm run start:server && npm run start:ui-v4"
  }
}
```

### Phase 2: 백엔드 통합 (2-3일)

#### 2.1 WebSocket 클라이언트 수정
```typescript
// modules/user-interface-v4/lib/websocket-client.ts
export class WebSocketClient {
  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      url: config.url || 'ws://localhost:3001', // recursive WebSocket 서버
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
    }
  }
}
```

#### 2.2 MCP 프로토콜 통합
```typescript
// modules/user-interface-v4/components/mcp-provider.tsx
import { MCPClient } from '@recursive/mcp-protocol'
import { WebSocketClient } from '@recursive/websocket-protocol'

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null)
  
  useEffect(() => {
    // 기존 recursive MCP 시스템과 연동
    const wsClient = new WebSocketClient({
      url: 'ws://localhost:3001'
    })
    
    const mcp = new MCPClient(wsClient, eventManager)
    setMcpClient(mcp)
    
    return () => {
      mcp.destroy()
      wsClient.disconnect()
    }
  }, [])
}
```

#### 2.3 로그 시스템 연동
```typescript
// modules/user-interface-v4/components/system-admin.tsx
const LogSystemClient = {
  async getLogs() {
    const response = await fetch('http://localhost:8888/api/logs/recent')
    return await response.json()
  },
  
  async getServerStatus() {
    const response = await fetch('http://localhost:8888/api/status')
    return await response.json()
  }
}
```

### Phase 3: 기존 모듈 정리 (1일)

#### 3.1 모듈 마이그레이션 전략
```
우선순위 1: user-interface-v4 → 메인 UI
우선순위 2: user-interface-v2 → 백업/개발용 유지  
우선순위 3: user-interface → 단계적 폐기
우선순위 4: user-interface-v3 → 참고용 보관
```

#### 3.2 의존성 정리
```json
// 기존 의존성 중복 제거
{
  "workspaces": [
    "core/*",
    "modules/user-interface-v4",    // 메인
    "modules/user-interface-v2",    // 백업
    "modules/log-system",
    "modules/ai-analysis",
    "modules/mcp-protocol",
    "modules/websocket-protocol"
  ]
}
```

### Phase 4: 프로덕션 설정 (1일)

#### 4.1 Next.js 프로덕션 빌드 통합
```javascript
// modules/user-interface-v4/next.config.mjs
const nextConfig = {
  output: 'standalone',
  distDir: '../../dist/ui',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: '/api/websocket/:path*',
        destination: 'http://localhost:3001/:path*'
      },
      {
        source: '/api/logs/:path*', 
        destination: 'http://localhost:8888/api/:path*'
      }
    ]
  }
}
```

#### 4.2 Express 서버 정적 파일 서빙
```javascript
// core/server/server.js 추가
app.use(express.static(path.join(__dirname, '../../dist/ui')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/ui/index.html'))
})
```

---

## 📈 성능 최적화 계획

### 1. 번들 최적화
```javascript
// 코드 스플리팅 적용
const SystemAdmin = lazy(() => import('./components/system-admin'))
const LogViewer = lazy(() => import('./components/log-viewer'))
```

### 2. 캐싱 전략
```typescript
// SWR을 활용한 데이터 캐싱
export function useLogData() {
  return useSWR('/api/logs/recent', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false
  })
}
```

### 3. 메모리 사용량 최적화
```typescript
// React.memo를 활용한 불필요한 리렌더링 방지
export const SystemMetrics = memo(({ data }: { data: MetricsData }) => {
  return <div>...</div>
})
```

---

## 🔒 보안 고려사항

### 1. API 인증
```typescript
// JWT 토큰 기반 인증
const apiClient = {
  async request(url: string, options: RequestOptions) {
    const token = localStorage.getItem('auth_token')
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    })
  }
}
```

### 2. CORS 설정
```javascript
// core/server/server.js
app.use(cors({
  origin: [
    'http://localhost:3002', // UI v4
    'http://localhost:3000'  // 프로덕션
  ],
  credentials: true
}))
```

---

## 📋 마이그레이션 체크리스트

### ✅ Phase 1: 기본 구조 (1-2일)
- [ ] 네임스페이스 @recursive/user-interface-v4로 변경
- [ ] pnpm → npm 패키지 매니저 통일
- [ ] 포트 3002로 변경 (개발환경)
- [ ] 루트 package.json 스크립트 업데이트
- [ ] 워크스페이스 설정 정리

### ✅ Phase 2: 백엔드 통합 (2-3일)
- [ ] WebSocket 클라이언트 recursive 서버 연동
- [ ] MCP 프로토콜 실제 구현체 연결
- [ ] 로그 시스템 Python 서버 API 연동
- [ ] 실시간 데이터 스트리밍 구현
- [ ] 에러 처리 및 재연결 로직 강화

### ✅ Phase 3: 기존 모듈 정리 (1일)
- [ ] user-interface (v1) 비활성화
- [ ] user-interface-v2 백업용 유지
- [ ] user-interface-v3 참고용 보관
- [ ] 중복 의존성 제거
- [ ] 워크스페이스 정리

### ✅ Phase 4: 프로덕션 설정 (1일)
- [ ] Next.js standalone 빌드 설정
- [ ] Express 서버 정적 파일 서빙
- [ ] 프로덕션 환경 변수 설정
- [ ] 성능 최적화 적용
- [ ] 보안 설정 강화

---

## 📊 예상 성과

### 📈 개발 효율성
- **통합된 개발 환경**: 단일 UI 시스템으로 집중
- **향상된 개발자 경험**: 현대적인 Next.js + TypeScript 스택
- **실시간 시스템 모니터링**: 통합된 관리자 패널

### 🚀 성능 향상
- **번들 크기 최적화**: 코드 스플리팅 적용
- **로딩 속도 개선**: Next.js 최적화 활용
- **메모리 사용량 감소**: 효율적인 상태 관리

### 🔧 유지보수성
- **코드 중복 제거**: 단일 UI 시스템
- **표준화된 구조**: 일관된 개발 패턴
- **확장 가능한 아키텍처**: 모듈형 설계

---

## 🎯 향후 발전 방향

### 1. 기능 확장
- 고급 대시보드 위젯 추가
- 실시간 코드 편집기 통합
- AI 어시스턴트 채팅 인터페이스 강화

### 2. 성능 개선
- 서버 사이드 렌더링 (SSR) 적용
- 엣지 캐싱 전략 도입
- 프로그레시브 웹 앱 (PWA) 기능

### 3. 사용자 경험
- 다크 모드 지원
- 접근성 (a11y) 개선
- 모바일 반응형 최적화

---

## 📞 지원 및 문의

이 통합 계획에 대한 질문이나 제안사항이 있으시면 언제든지 연락해 주세요.

**작성일**: 2024년 12월 19일  
**최종 수정**: 2024년 12월 19일  
**상태**: 승인 대기  
**우선순위**: 높음  

---

*이 문서는 recursive 플랫폼의 UI 통합 전략을 위한 공식 계획서입니다.* 