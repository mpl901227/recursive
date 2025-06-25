# 🚀 Recursive Platform - Modular Web Application

> **AI-powered, modular web application platform with enterprise-grade WebSocket communication and intelligent analysis tools**

## 📋 **개요**

Recursive Platform은 **모듈형 아키텍처**를 기반으로 한 차세대 웹 애플리케이션 플랫폼입니다. AI 기반 분석 도구, 실시간 WebSocket 통신, MCP(Model Context Protocol) 지원을 통해 확장 가능하고 지능적인 웹 서비스를 제공합니다.

## 🏗️ **아키텍처 개요**

### **모듈형 모노레포 구조**
```
recursive/
├── 📦 core/                    # 핵심 인프라
│   └── shared/                 # 공통 라이브러리 및 유틸리티
│       ├── src/
│       │   ├── interfaces/     # 표준 인터페이스
│       │   ├── utils/          # 공통 유틸리티
│       │   └── config/         # 설정 관리
│       └── package.json
│
├── 🧩 modules/                 # 기능별 모듈
│   └── ai-analysis/            # AI 분석 모듈
│       ├── src/
│       │   ├── tools/          # AI 도구들
│       │   └── utils/          # Python 유틸리티 (40+ 도구)
│       ├── tests/
│       ├── package.json
│       └── README.md
│
├── 🌐 websocket-server/        # 메인 웹 서버
│   ├── src/                    # 서버 로직
│   ├── public/                 # 프론트엔드
│   ├── middleware/             # 미들웨어
│   └── config/                 # 서버 설정
│

```

## ✨ **주요 기능**

### **🧠 AI 분석 모듈 (`@recursive/ai-analysis`)**
- ✅ **복잡도 분석**: 프로젝트/코드의 복잡도를 AI로 분석
- ✅ **워크플로우 생성**: 요구사항 기반 자동 워크플로우 생성
- ✅ **코드 분석**: 코드 구조 및 품질 분석
- ✅ **시스템 건강 상태 분석**: 메트릭 기반 시스템 상태 분석
- 🔧 **40+ Python 유틸리티**: 보안, 성능, 분석 도구들

### **🌐 WebSocket 서버**
- ✅ **실시간 통신**: 고성능 WebSocket 서버
- ✅ **MCP 프로토콜**: Model Context Protocol 지원
- ✅ **자동 재연결**: 지능형 재연결 핸들러
- ✅ **보안**: Helmet, CORS, Rate Limiting
- ✅ **모니터링**: 실시간 메트릭 및 헬스 체크

### **🔧 공통 라이브러리 (`@recursive/shared`)**
- ✅ **이벤트 버스**: 모듈 간 통신
- ✅ **설정 관리**: 중앙화된 설정 시스템
- ✅ **유틸리티**: 공통 헬퍼 함수들
- ✅ **인터페이스**: 표준화된 API 인터페이스

## 🚀 **빠른 시작**

### **1. 설치**
```bash
# 저장소 클론
git clone https://github.com/recursive-team/recursive.git
cd recursive

# 모든 의존성 설치
npm install

# 워크스페이스 설치
npm run install:all
```

### **2. 개발 서버 시작**
```bash
# 통합 서버 시작 (메인 서버 + Python 로그 서버)
npm run dev

# 또는 개별 실행
npm run dev:server    # 메인 서버만
npm run dev:logs      # Python 로그 서버만

# 모든 모듈 개발 모드
npm run dev:all
```

> **💡 통합 서버 기능**: 메인 서버 실행 시 Python 로그 서버가 자동으로 함께 시작됩니다.
> - 🐍 **Python 로그 서버**: `http://localhost:8888`
> - 📝 **로그 시스템 API**: `http://localhost:8888/rpc`
> - 🔍 **헬스체크**: `http://localhost:8888/health`

### **3. 접속**
- 🌐 **웹 대시보드**: http://localhost:3000
- 📊 **헬스 체크**: http://localhost:3000/health
- 📈 **메트릭**: http://localhost:3000/api/metrics

## 📚 **모듈별 문서**

### **AI 분석 모듈**
```javascript
const { getDefaultInstance } = require('@recursive/ai-analysis');

const aiAnalysis = getDefaultInstance();
await aiAnalysis.initialize();

// 복잡도 분석
const result = await aiAnalysis.analyzeComplexity('코드 또는 프로젝트 설명');
console.log(result.complexity); // 'simple', 'medium', 'complex'
```

### **공통 라이브러리**
```javascript
const { eventBus, utils, config } = require('@recursive/shared');

// 모듈 간 통신
eventBus.registerModule('my-module', myModuleInstance);
eventBus.sendToModule('ai-analysis', 'analyze', data);

// 유틸리티 사용
const cloned = utils.deepClone(originalObject);
const result = await utils.retry(someAsyncFunction, 3);
```

### **WebSocket 클라이언트**
```javascript
const ws = new WebSocket('ws://localhost:3000');

// 복잡도 분석 요청
ws.send(JSON.stringify({
  type: 'complexity_analysis',
  data: '분석할 내용'
}));

// 결과 수신
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'complexity_result') {
    console.log('분석 결과:', message.data);
  }
};
```

## 🛠️ **개발 가이드**

### **새 모듈 추가**
```bash
# 새 모듈 폴더 생성
mkdir modules/my-new-module
cd modules/my-new-module

# package.json 생성
npm init -y

# 모듈 개발...
```

### **테스트 실행**
```bash
# 모든 모듈 테스트
npm test

# 특정 모듈 테스트
npm test --workspace=@recursive/ai-analysis
```

### **빌드 및 배포**
```bash
# 모든 모듈 빌드
npm run build

# 프로덕션 시작
npm run start:production
```

## 📊 **성능 및 확장성**

### **현재 규모**
- **총 파일 수**: 4,700+ 개
- **AI 유틸리티**: 40+ Python 도구
- **모듈 수**: 2개 (확장 예정)
- **지원 언어**: JavaScript, TypeScript, Python

### **확장 계획**
- 🔄 **마이크로서비스 분리**: 독립적인 서비스 모듈
- 🎨 **마이크로 프론트엔드**: 독립적인 UI 컴포넌트
- 🐳 **컨테이너화**: Docker 기반 배포
- ☁️ **클라우드 네이티브**: Kubernetes 지원

## 🔧 **설정**

### **환경 변수**
```bash
# .env 파일 생성
NODE_ENV=development
PORT=3000
DEBUG=true

# AI 분석 설정
AI_ANALYSIS_ENABLED=true
PYTHON_PATH=python3

# WebSocket 설정
WS_MAX_CONNECTIONS=1000
WS_HEARTBEAT_INTERVAL=30000
```

### **고급 설정**
자세한 설정은 각 모듈의 README를 참조하세요:
- [AI 분석 모듈](./modules/ai-analysis/README.md)
- [WebSocket 서버](./websocket-server/README.md)
- [개발 가이드](./websocket-server/DEVELOPMENT_GUIDE.md)

## 🤝 **기여하기**

1. **Fork** 저장소
2. **Feature 브랜치** 생성: `git checkout -b feature/amazing-feature`
3. **커밋**: `git commit -m 'Add amazing feature'`
4. **Push**: `git push origin feature/amazing-feature`
5. **Pull Request** 생성

## 📄 **라이센스**

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 🔗 **링크**

- 📖 **문서**: [GitHub Wiki](https://github.com/recursive-team/recursive/wiki)
- 🐛 **버그 리포트**: [Issues](https://github.com/recursive-team/recursive/issues)
- 💬 **토론**: [Discussions](https://github.com/recursive-team/recursive/discussions)
- 📧 **이메일**: recursive-team@example.com

---

**Recursive Platform** - *AI와 함께하는 차세대 웹 개발* 🚀 

# Recursive 모노레포 프로젝트

## 📋 **프로젝트 개요**
Recursive는 AI 분석 기능을 갖춘 모듈화된 웹 애플리케이션 플랫폼입니다.

## 🏗️ **아키텍처**

```
recursive/
├── 📦 core/
│   ├── 🖥️ server/              # Express.js 메인 서버
│   └── 🔗 shared/              # 공통 유틸리티 및 설정
├── 📚 modules/
│   ├── 🤖 ai-analysis/         # AI 분석 모듈 (Python + Node.js)
│   ├── 🔌 mcp-protocol/        # MCP 통신 프로토콜
│   └── 🌐 websocket-protocol/  # WebSocket 통신 프로토콜
├── 📄 package.json             # 루트 패키지 관리
├── 📄 requirements.txt         # Python 의존성 관리
└── 📄 README.md
```

## 🚀 **설치 및 실행**

### **1. Node.js 의존성 설치**
```bash
npm install
```

### **2. Python 의존성 설치**
```bash
# Python 가상환경 생성 (권장)
python -m venv venv

# 가상환경 활성화
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Python 패키지 설치
pip install -r requirements.txt
```

### **3. 환경변수 설정**
루트 디렉토리에 `.env` 파일을 생성하고 필요한 환경변수를 설정하세요.

### **4. 서버 실행**
```bash
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 📦 **워크스페이스 구조**

### **Core 패키지**
- `@recursive/server` - Express.js 메인 서버
- `@recursive/shared` - 공통 유틸리티, 템플릿, 클라이언트

### **Module 패키지**  
- `@recursive/ai-analysis` - AI 분석 도구 (Python + Node.js 하이브리드)
- `@recursive/mcp-protocol` - MCP 통신 프로토콜 핸들러
- `@recursive/websocket-protocol` - WebSocket 통신 프로토콜 핸들러

## 🔧 **개발 환경**

### **필수 요구사항**
- Node.js 16+ 
- Python 3.8+
- npm 또는 yarn

### **개발 도구**
- ESLint (JavaScript 린팅)
- Black, Flake8, MyPy (Python 린팅)
- Jest (JavaScript 테스팅)
- Pytest (Python 테스팅)

## 🧪 **테스트**
```bash
# JavaScript 테스트
npm test

# Python 테스트
pytest
```

## 📊 **주요 기능**
- 🤖 AI 기반 코드 분석
- 🔌 MCP 프로토콜 지원
- 🌐 실시간 WebSocket 통신
- 📈 성능 모니터링
- 🔒 보안 분석
- 📝 자동 문서화

## 🤝 **기여하기**
1. Fork 프로젝트
2. Feature 브랜치 생성
3. 변경사항 커밋
4. Pull Request 생성

## 📄 **라이센스**
MIT License 