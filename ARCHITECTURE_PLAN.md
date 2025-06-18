# 🏗️ Recursive 웹앱 아키텍처 개선 계획

## ✅ **완료된 모듈화 작업**

### **🎯 Phase 1: 기본 모듈 분리 (완료)**
- ✅ **AI 분석 모듈 분리**: `modules/ai-analysis/`
- ✅ **공통 라이브러리 생성**: `core/shared/`
- ✅ **모노레포 구조 설정**: npm workspaces 적용
- ✅ **표준 인터페이스 정의**: AI 분석 인터페이스
- ✅ **이벤트 버스 구현**: 모듈 간 통신 시스템
- ✅ **WebSocket 서버 통합**: 새로운 모듈 구조와 연동

### **📊 개선 결과**
- **모듈 수**: 2개 (AI 분석, 공통 라이브러리)
- **파일 분산**: AI 도구 40+ 개 별도 모듈로 분리
- **재사용성**: 공통 유틸리티 중앙화
- **확장성**: 새 모듈 추가 용이
- **유지보수성**: 모듈별 독립적 개발 가능

## 📋 **이전 문제점 (해결됨)**

### **문제점 (해결됨)**
- ~~4,695개 파일이 하나의 폴더에 집중~~ → **모듈별 분리 완료**
- ~~모놀리식 구조로 인한 확장성 제한~~ → **모듈형 아키텍처 적용**
- ~~팀 개발 시 충돌 가능성 높음~~ → **모듈별 독립 개발 가능**
- ~~특정 기능 장애 시 전체 시스템 영향~~ → **모듈 격리 및 폴백 구현**

### **유지된 장점**
- ✅ 통합된 배포 및 관리 (모노레포)
- ✅ 단일 진입점 (WebSocket 서버)
- ✅ 공통 유틸리티 공유 (core/shared)
- ✅ 개발 초기 단계의 빠른 프로토타이핑

---

## 🎯 **제안하는 새 구조: 하이브리드 모듈 아키텍처**

### **1단계: 도메인 분리 (현재 → 3개월 후)**

```
recursive/
├── core/                           # 핵심 인프라
│   ├── server/                     # 메인 서버 (Express + WebSocket)
│   ├── shared/                     # 공통 유틸리티
│   ├── config/                     # 전역 설정
│   └── gateway/                    # API 게이트웨이
│
├── modules/                        # 기능별 모듈
│   ├── ai-analysis/               # AI 분석 기능
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── websocket-communication/   # WebSocket 통신
│   ├── mcp-protocol/             # MCP 서버
│   ├── file-management/          # 파일 관리
│   ├── user-interface/           # 프론트엔드
│   └── workflow-engine/          # 워크플로우 엔진
│
├── services/                      # 독립 서비스 (선택적)
│   ├── log-collector/            # 로그 수집 서비스
│   ├── notification-service/     # 알림 서비스
│   └── analytics-service/        # 분석 서비스
│
├── deployment/                    # 배포 관련
│   ├── docker/
│   ├── kubernetes/
│   └── scripts/
│
└── docs/                         # 문서화
    ├── api/
    ├── architecture/
    └── development/
```

### **2단계: 마이크로 프론트엔드 (6개월 후)**

```
modules/user-interface/
├── shell/                        # 메인 셸 애플리케이션
├── dashboard/                    # 대시보드 마이크로앱
├── ai-workspace/                 # AI 작업공간
├── file-explorer/                # 파일 탐색기
└── settings/                     # 설정 패널
```

---

## 🔄 **마이그레이션 전략**

### **Phase 1: 점진적 모듈화 (1개월)**
1. **AI 분석 모듈** 분리
   - `src/tools/` → `modules/ai-analysis/`
   - 독립적인 package.json 생성
   - API 인터페이스 정의

2. **프론트엔드 모듈** 분리
   - `public/` → `modules/user-interface/`
   - 컴포넌트 기반 구조로 전환

### **Phase 2: 서비스 분리 (2개월)**
1. **MCP 서버** 독립화
   - `src/mcp-server.js` → `modules/mcp-protocol/`
   - 독립적인 프로세스로 실행 가능

2. **WebSocket 통신** 모듈화
   - `src/websocket/` → `modules/websocket-communication/`

### **Phase 3: 마이크로서비스 준비 (3개월)**
1. **API 게이트웨이** 도입
2. **서비스 디스커버리** 구현
3. **독립 배포** 파이프라인 구축

---

## 🛠️ **구현 방법**

### **1. 모노레포 도구 도입**
```json
// package.json (루트)
{
  "name": "recursive-monorepo",
  "workspaces": [
    "core/*",
    "modules/*",
    "services/*"
  ],
  "scripts": {
    "dev": "lerna run dev --parallel",
    "build": "lerna run build",
    "test": "lerna run test"
  }
}
```

### **2. 공통 의존성 관리**
```json
// core/shared/package.json
{
  "name": "@recursive/shared",
  "exports": {
    "./utils": "./src/utils/index.js",
    "./config": "./src/config/index.js",
    "./types": "./src/types/index.js"
  }
}
```

### **3. 모듈 간 통신**
```javascript
// 이벤트 버스 패턴
const EventBus = require('@recursive/shared/event-bus');

// AI 분석 모듈에서
EventBus.emit('analysis:completed', { result });

// 웹소켓 모듈에서
EventBus.on('analysis:completed', (data) => {
  wsServer.broadcast('analysis_result', data);
});
```

---

## 🎯 **단기 실행 계획 (1주일 내)**

### **Step 1: AI 분석 모듈 분리**
```bash
# 1. 새 모듈 폴더 생성
mkdir -p modules/ai-analysis/{src,tests,config}

# 2. AI 관련 파일 이동
mv websocket-server/src/tools/ modules/ai-analysis/src/
mv websocket-server/src/ai-understanding-analyzer.js modules/ai-analysis/src/

# 3. 독립적인 package.json 생성
cd modules/ai-analysis
npm init -y
```

### **Step 2: 공통 유틸리티 분리**
```bash
# 1. 공통 라이브러리 생성
mkdir -p core/shared/{src,types}

# 2. 공통 유틸리티 이동
mv websocket-server/utils/ core/shared/src/
mv websocket-server/config/ core/shared/src/
```

### **Step 3: API 인터페이스 정의**
```javascript
// core/shared/src/interfaces/ai-analysis.js
class AIAnalysisInterface {
  async analyzeComplexity(input) { throw new Error('Not implemented'); }
  async generateWorkflow(data) { throw new Error('Not implemented'); }
}

module.exports = AIAnalysisInterface;
```

---

## 📊 **예상 효과**

### **개발 효율성**
- ✅ 팀별 독립 개발 가능
- ✅ 빌드 시간 단축 (모듈별 빌드)
- ✅ 테스트 범위 명확화
- ✅ 코드 리뷰 효율성 증대

### **운영 안정성**
- ✅ 장애 격리 (모듈별)
- ✅ 독립적인 스케일링
- ✅ 점진적 배포 가능
- ✅ 롤백 용이성

### **확장성**
- ✅ 새 기능 추가 용이
- ✅ 외부 개발자 참여 가능
- ✅ 오픈소스 생태계 구축
- ✅ 플러그인 아키텍처 가능

---

## 🚀 **다음 단계**

1. **즉시 시작**: AI 분석 모듈 분리
2. **1주일 내**: 공통 유틸리티 분리
3. **2주일 내**: 프론트엔드 모듈화
4. **1개월 내**: MCP 서버 독립화
5. **3개월 내**: 마이크로서비스 준비

이 계획을 통해 **현재의 개발 속도를 유지**하면서도 **미래의 확장성**을 확보할 수 있습니다. 