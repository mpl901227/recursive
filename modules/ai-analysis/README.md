# 🧠 @recursive/ai-analysis

AI-powered analysis and understanding tools for the Recursive platform.

## 📋 **개요**

이 모듈은 Recursive 플랫폼의 AI 기반 분석 기능을 제공합니다. 복잡도 분석, 워크플로우 생성, 코드 분석, 시스템 건강 상태 분석 등의 기능을 포함합니다.

## 🚀 **주요 기능**

### **JavaScript/Node.js 기능**
- ✅ **AI 복잡도 분석**: 프로젝트나 작업의 복잡도를 AI로 분석
- ✅ **워크플로우 생성**: 요구사항 기반 자동 워크플로우 생성
- ✅ **코드 분석**: 코드 구조 및 품질 분석
- ✅ **시스템 건강 상태 분석**: 메트릭 기반 시스템 상태 분석

### **Python 유틸리티 (40+ 도구)**
- 🔍 **분석 도구**: 데이터 분석, 패턴 인식, 통계 분석
- 🛡️ **보안 분석**: 취약점 스캔, 위험 평가, 보안 권장사항
- ⚡ **성능 분석**: 성능 프로파일링, 병목 지점 식별, 최적화 제안
- 🧠 **지능형 솔루션**: AI 기반 솔루션 생성 및 최적화
- 📊 **전체적 시스템 분석**: 종합적인 시스템 분석 및 권장사항

## 📦 **설치 및 사용**

### **설치**
```bash
cd modules/ai-analysis
npm install
```

### **기본 사용법**
```javascript
const { AIAnalysisModule } = require('@recursive/ai-analysis');

// 모듈 초기화
const aiModule = new AIAnalysisModule({
  enablePythonUtils: true,
  logLevel: 'info'
});

await aiModule.initialize();

// 복잡도 분석
const complexityResult = await aiModule.analyzeComplexity({
  description: "새로운 웹 애플리케이션 개발",
  requirements: ["사용자 인증", "데이터베이스 연동", "실시간 통신"]
});

// 워크플로우 생성
const workflow = await aiModule.generateWorkflow({
  project_type: "web_application",
  features: ["authentication", "real-time-chat", "file-upload"]
});

// 코드 분석
const codeAnalysis = await aiModule.analyzeCode(`
function complexFunction() {
  // 복잡한 로직...
}
`, 'javascript');

// 시스템 건강 상태 분석
const healthAnalysis = await aiModule.analyzeSystemHealth({
  memory_usage: 0.75,
  cpu_usage: 0.45,
  disk_usage: 0.60
});
```

### **Python 유틸리티 사용**
```javascript
const { getPythonUtils } = require('@recursive/ai-analysis/utils');

const pythonUtils = getPythonUtils();

// 사용 가능한 유틸리티 확인
const availableUtils = pythonUtils.getAvailableUtilities();
console.log('Available Python utilities:', availableUtils);

// 코드 분석 (Python 유틸리티 사용)
const analysis = await pythonUtils.analyzeCode(`
def complex_algorithm():
    # 복잡한 알고리즘...
    pass
`, 'python');

// 보안 스캔
const securityScan = await pythonUtils.scanSecurity({
  target: 'web_application',
  scan_type: 'vulnerability'
});

// 성능 분석
const performanceAnalysis = await pythonUtils.analyzePerformance({
  response_time: 150,
  throughput: 1000,
  error_rate: 0.01
});
```

## 🏗️ **모듈 구조**

```
modules/ai-analysis/
├── src/
│   ├── index.js                    # 메인 진입점
│   └── tools/
│       ├── ai-understanding-analyzer.js  # AI 이해 분석기
│       └── utils/
│           ├── index.js            # Python 유틸리티 래퍼
│           ├── analysis_utils.py   # 분석 유틸리티
│           ├── code_intelligence_utils.py
│           ├── security_threat_analyzer.py
│           ├── performance_profiling_utils.py
│           └── ... (40+ Python 유틸리티들)
├── tests/
│   ├── unit/
│   └── integration/
├── config/
├── package.json
└── README.md
```

## 🔧 **개발 스크립트**

```bash
# 개발 모드 실행
npm run dev

# 테스트 실행
npm test

# 테스트 (watch 모드)
npm run test:watch

# 린팅
npm run lint

# 린팅 자동 수정
npm run lint:fix
```

## 🧪 **테스트**

```bash
# 모든 테스트 실행
npm test

# 특정 테스트 파일 실행
npm test -- --testPathPattern=analyzer

# 커버리지 포함 테스트
npm test -- --coverage
```

## 📊 **API 문서**

### **AIAnalysisModule**

#### **constructor(options)**
- `options.enablePythonUtils` (boolean): Python 유틸리티 활성화 (기본값: true)
- `options.logLevel` (string): 로그 레벨 (기본값: 'info')

#### **async initialize()**
모듈을 초기화합니다.

#### **async analyzeComplexity(input, options)**
복잡도를 분석합니다.
- `input`: 분석할 입력 데이터
- `options`: 분석 옵션

#### **async generateWorkflow(requirements, options)**
워크플로우를 생성합니다.
- `requirements`: 요구사항 객체
- `options`: 생성 옵션

#### **async analyzeCode(codeContent, language, options)**
코드를 분석합니다.
- `codeContent`: 분석할 코드
- `language`: 프로그래밍 언어 (기본값: 'javascript')
- `options`: 분석 옵션

#### **async analyzeSystemHealth(metrics, options)**
시스템 건강 상태를 분석합니다.
- `metrics`: 시스템 메트릭 객체
- `options`: 분석 옵션

#### **getStatus()**
모듈 상태 정보를 반환합니다.

#### **async destroy()**
모듈을 정리합니다.

## 🔗 **다른 모듈과의 통합**

이 모듈은 다음과 같이 다른 모듈들과 통합됩니다:

```javascript
// 메인 서버에서 사용
const { getDefaultInstance } = require('@recursive/ai-analysis');

class RecursiveServer {
  constructor() {
    this.aiAnalysis = getDefaultInstance();
  }

  async setupRoutes() {
    // AI 분석 API 엔드포인트
    this.app.post('/api/ai/analyze', async (req, res) => {
      const result = await this.aiAnalysis.analyzeComplexity(req.body);
      res.json(result);
    });
  }
}
```

## 🚨 **주의사항**

1. **Python 의존성**: Python 유틸리티를 사용하려면 Python 3.7+ 설치 필요
2. **메모리 사용량**: 대용량 분석 시 메모리 사용량 주의
3. **비동기 처리**: 모든 분석 함수는 비동기로 동작

## 🔄 **업데이트 로그**

### v1.0.0 (2024-06-18)
- ✅ 초기 모듈 생성
- ✅ AI 복잡도 분석 기능
- ✅ Python 유틸리티 통합
- ✅ 기본 API 구조 완성

## 🤝 **기여하기**

1. 이슈 등록
2. 기능 브랜치 생성
3. 변경사항 커밋
4. 테스트 실행
5. 풀 리퀘스트 생성

## 📄 **라이선스**

MIT License - 자세한 내용은 [LICENSE](../../LICENSE) 참조 