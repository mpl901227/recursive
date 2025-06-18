/**
 * @recursive/ai-analysis
 * AI-powered analysis and understanding tools for Recursive platform
 */

const { AIUnderstandingAnalyzer } = require('./tools/ai-understanding-analyzer');

// Python 유틸리티들 (필요시 동적 로드)
const loadPythonUtils = () => {
  try {
    // Python 유틸리티들을 필요에 따라 로드
    const utils = {};
    
    // 주요 유틸리티들
    const utilityModules = [
      'analysis_utils',
      'code_intelligence_utils',
      'intelligent_solution_generator',
      'holistic_system_analyzer',
      'continuous_learning_engine',
      'security_threat_analyzer',
      'performance_profiling_utils'
    ];

    utilityModules.forEach(moduleName => {
      try {
        // Python 스크립트 실행을 위한 래퍼 (추후 구현)
        utils[moduleName] = {
          available: true,
          path: `./tools/utils/${moduleName}.py`
        };
      } catch (error) {
        utils[moduleName] = {
          available: false,
          error: error.message
        };
      }
    });

    return utils;
  } catch (error) {
    console.warn('Python utilities not available:', error.message);
    return {};
  }
};

class AIAnalysisModule {
  constructor(options = {}) {
    this.options = {
      enablePythonUtils: true,
      logLevel: 'info',
      ...options
    };

    // AI Understanding Analyzer 초기화
    this.analyzer = new AIUnderstandingAnalyzer();
    
    // Python 유틸리티 로드
    this.pythonUtils = this.options.enablePythonUtils ? loadPythonUtils() : {};
    
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // AI 분석기 초기화
      if (this.analyzer.initialize) {
        await this.analyzer.initialize();
      }

      this.initialized = true;
      console.log('✅ AI Analysis Module initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize AI Analysis Module:', error);
      throw error;
    }
  }

  // AI 복잡도 분석
  async analyzeComplexity(input, options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      return await this.analyzer.analyzeComplexity(input, options);
    } catch (error) {
      console.error('Complexity analysis failed:', error);
      throw error;
    }
  }

  // 워크플로우 생성
  async generateWorkflow(requirements, options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      return await this.analyzer.generateWorkflow(requirements, options);
    } catch (error) {
      console.error('Workflow generation failed:', error);
      throw error;
    }
  }

  // 코드 분석
  async analyzeCode(codeContent, language = 'javascript', options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      return await this.analyzer.analyzeCode(codeContent, language, options);
    } catch (error) {
      console.error('Code analysis failed:', error);
      throw error;
    }
  }

  // 시스템 건강 상태 분석
  async analyzeSystemHealth(metrics, options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      // 기본 분석 로직
      const analysis = {
        timestamp: new Date().toISOString(),
        overall_health: 'good',
        metrics: metrics,
        recommendations: [],
        alerts: []
      };

      // 메트릭 기반 분석
      if (metrics.memory_usage > 0.8) {
        analysis.alerts.push({
          type: 'warning',
          message: 'High memory usage detected',
          value: metrics.memory_usage
        });
      }

      if (metrics.cpu_usage > 0.9) {
        analysis.alerts.push({
          type: 'critical',
          message: 'Critical CPU usage',
          value: metrics.cpu_usage
        });
      }

      return analysis;
    } catch (error) {
      console.error('System health analysis failed:', error);
      throw error;
    }
  }

  // 사용 가능한 Python 유틸리티 목록
  getAvailableUtils() {
    return Object.keys(this.pythonUtils).filter(
      key => this.pythonUtils[key].available
    );
  }

  // 모듈 상태 정보
  getStatus() {
    return {
      initialized: this.initialized,
      analyzer: !!this.analyzer,
      pythonUtils: Object.keys(this.pythonUtils).length,
      availableUtils: this.getAvailableUtils().length
    };
  }

  // 정리
  async destroy() {
    if (this.analyzer && this.analyzer.destroy) {
      await this.analyzer.destroy();
    }
    this.initialized = false;
    console.log('🧹 AI Analysis Module destroyed');
  }
}

// 메인 모듈 exports
module.exports = {
  AIAnalysisModule,
  AIUnderstandingAnalyzer,
  
  // 팩토리 함수
  createAnalysisModule: (options) => new AIAnalysisModule(options),
  
  // 유틸리티 함수들
  utils: {
    loadPythonUtils
  }
};

// 기본 인스턴스 (싱글톤 패턴)
let defaultInstance = null;

module.exports.getDefaultInstance = (options = {}) => {
  if (!defaultInstance) {
    defaultInstance = new AIAnalysisModule(options);
  }
  return defaultInstance;
}; 