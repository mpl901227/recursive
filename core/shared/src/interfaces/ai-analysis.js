/**
 * AI Analysis Interface
 * 모든 AI 분석 모듈이 구현해야 하는 표준 인터페이스
 */

class AIAnalysisInterface {
  /**
   * AI 분석 모듈 초기화
   * @param {Object} options - 초기화 옵션
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    throw new Error('initialize method must be implemented');
  }

  /**
   * 복잡도 분석
   * @param {Object|string} input - 분석할 입력 데이터
   * @param {Object} options - 분석 옵션
   * @returns {Promise<Object>} 복잡도 분석 결과
   */
  async analyzeComplexity(input, options = {}) {
    throw new Error('analyzeComplexity method must be implemented');
  }

  /**
   * 워크플로우 생성
   * @param {Object} requirements - 요구사항
   * @param {Object} options - 생성 옵션
   * @returns {Promise<Object>} 생성된 워크플로우
   */
  async generateWorkflow(requirements, options = {}) {
    throw new Error('generateWorkflow method must be implemented');
  }

  /**
   * 코드 분석
   * @param {string} codeContent - 분석할 코드
   * @param {string} language - 프로그래밍 언어
   * @param {Object} options - 분석 옵션
   * @returns {Promise<Object>} 코드 분석 결과
   */
  async analyzeCode(codeContent, language = 'javascript', options = {}) {
    throw new Error('analyzeCode method must be implemented');
  }

  /**
   * 시스템 건강 상태 분석
   * @param {Object} metrics - 시스템 메트릭
   * @param {Object} options - 분석 옵션
   * @returns {Promise<Object>} 건강 상태 분석 결과
   */
  async analyzeSystemHealth(metrics, options = {}) {
    throw new Error('analyzeSystemHealth method must be implemented');
  }

  /**
   * 모듈 상태 정보 반환
   * @returns {Object} 상태 정보
   */
  getStatus() {
    throw new Error('getStatus method must be implemented');
  }

  /**
   * 모듈 정리
   * @returns {Promise<void>}
   */
  async destroy() {
    throw new Error('destroy method must be implemented');
  }
}

/**
 * 표준 분석 결과 형식
 */
class AnalysisResult {
  constructor(data = {}) {
    this.timestamp = data.timestamp || new Date().toISOString();
    this.success = data.success !== undefined ? data.success : true;
    this.data = data.data || {};
    this.metadata = data.metadata || {};
    this.errors = data.errors || [];
    this.warnings = data.warnings || [];
  }

  /**
   * 성공 결과 생성
   * @param {*} data - 결과 데이터
   * @param {Object} metadata - 메타데이터
   * @returns {AnalysisResult}
   */
  static success(data, metadata = {}) {
    return new AnalysisResult({
      success: true,
      data,
      metadata
    });
  }

  /**
   * 실패 결과 생성
   * @param {string|Error} error - 에러 정보
   * @param {Object} metadata - 메타데이터
   * @returns {AnalysisResult}
   */
  static failure(error, metadata = {}) {
    const errorMessage = error instanceof Error ? error.message : error;
    return new AnalysisResult({
      success: false,
      errors: [errorMessage],
      metadata
    });
  }

  /**
   * 경고가 있는 성공 결과 생성
   * @param {*} data - 결과 데이터
   * @param {Array<string>} warnings - 경고 메시지들
   * @param {Object} metadata - 메타데이터
   * @returns {AnalysisResult}
   */
  static successWithWarnings(data, warnings = [], metadata = {}) {
    return new AnalysisResult({
      success: true,
      data,
      warnings,
      metadata
    });
  }
}

/**
 * 복잡도 레벨 상수
 */
const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple',
  MEDIUM: 'medium',
  COMPLEX: 'complex',
  VERY_COMPLEX: 'very_complex'
};

/**
 * 분석 타입 상수
 */
const ANALYSIS_TYPES = {
  COMPLEXITY: 'complexity',
  WORKFLOW: 'workflow',
  CODE: 'code',
  SYSTEM_HEALTH: 'system_health',
  SECURITY: 'security',
  PERFORMANCE: 'performance'
};

/**
 * 언어 지원 상수
 */
const SUPPORTED_LANGUAGES = {
  JAVASCRIPT: 'javascript',
  TYPESCRIPT: 'typescript',
  PYTHON: 'python',
  JAVA: 'java',
  CSHARP: 'csharp',
  GO: 'go',
  RUST: 'rust',
  PHP: 'php'
};

module.exports = {
  AIAnalysisInterface,
  AnalysisResult,
  COMPLEXITY_LEVELS,
  ANALYSIS_TYPES,
  SUPPORTED_LANGUAGES
}; 