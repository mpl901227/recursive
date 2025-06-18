/**
 * Python Utilities Index
 * Node.js wrapper for Python AI utilities
 */

const { spawn } = require('child_process');
const path = require('path');

// Python 유틸리티 실행을 위한 헬퍼 클래스
class PythonUtilityRunner {
  constructor(scriptPath, pythonPath = 'python') {
    this.scriptPath = scriptPath;
    this.pythonPath = pythonPath;
  }

  async execute(functionName, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const pythonArgs = [
        this.scriptPath,
        functionName,
        JSON.stringify(args),
        JSON.stringify(options)
      ];

      const pythonProcess = spawn(this.pythonPath, pythonArgs);
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (error) {
            resolve({ output, raw: true });
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }
}

// 사용 가능한 Python 유틸리티들
const PYTHON_UTILITIES = {
  analysis_utils: {
    name: 'Analysis Utils',
    description: 'General analysis utilities',
    functions: ['analyze_data', 'statistical_analysis', 'pattern_detection']
  },
  code_intelligence_utils: {
    name: 'Code Intelligence Utils',
    description: 'Code analysis and intelligence tools',
    functions: ['analyze_code_structure', 'detect_patterns', 'suggest_improvements']
  },
  intelligent_solution_generator: {
    name: 'Intelligent Solution Generator',
    description: 'AI-powered solution generation',
    functions: ['generate_solution', 'optimize_approach', 'validate_solution']
  },
  holistic_system_analyzer: {
    name: 'Holistic System Analyzer',
    description: 'Comprehensive system analysis',
    functions: ['analyze_system', 'identify_bottlenecks', 'recommend_optimizations']
  },
  continuous_learning_engine: {
    name: 'Continuous Learning Engine',
    description: 'Machine learning and adaptation',
    functions: ['learn_from_data', 'update_models', 'predict_outcomes']
  },
  security_threat_analyzer: {
    name: 'Security Threat Analyzer',
    description: 'Security analysis and threat detection',
    functions: ['scan_vulnerabilities', 'assess_risks', 'recommend_mitigations']
  },
  performance_profiling_utils: {
    name: 'Performance Profiling Utils',
    description: 'Performance analysis and optimization',
    functions: ['profile_performance', 'identify_slowdowns', 'suggest_optimizations']
  }
};

// Python 유틸리티 래퍼 클래스들
class PythonUtilityWrapper {
  constructor(utilityName) {
    this.utilityName = utilityName;
    this.utilityInfo = PYTHON_UTILITIES[utilityName];
    this.scriptPath = path.join(__dirname, `${utilityName}.py`);
    this.runner = new PythonUtilityRunner(this.scriptPath);
    this.available = false;
    this.checkAvailability();
  }

  async checkAvailability() {
    try {
      // 간단한 테스트 실행으로 가용성 확인
      await this.runner.execute('test', []);
      this.available = true;
    } catch (error) {
      this.available = false;
      console.warn(`Python utility ${this.utilityName} not available:`, error.message);
    }
  }

  async execute(functionName, args = [], options = {}) {
    if (!this.available) {
      throw new Error(`Python utility ${this.utilityName} is not available`);
    }
    return await this.runner.execute(functionName, args, options);
  }

  getInfo() {
    return {
      ...this.utilityInfo,
      available: this.available,
      scriptPath: this.scriptPath
    };
  }
}

// 유틸리티 인스턴스들 생성
const utilities = {};
Object.keys(PYTHON_UTILITIES).forEach(utilityName => {
  utilities[utilityName] = new PythonUtilityWrapper(utilityName);
});

// 메인 Python Utils 클래스
class PythonUtils {
  constructor() {
    this.utilities = utilities;
  }

  // 특정 유틸리티 가져오기
  getUtility(name) {
    return this.utilities[name];
  }

  // 사용 가능한 유틸리티들 목록
  getAvailableUtilities() {
    return Object.keys(this.utilities).filter(
      name => this.utilities[name].available
    );
  }

  // 모든 유틸리티 정보
  getAllUtilities() {
    const result = {};
    Object.keys(this.utilities).forEach(name => {
      result[name] = this.utilities[name].getInfo();
    });
    return result;
  }

  // 유틸리티 실행 (간편 메서드)
  async execute(utilityName, functionName, args = [], options = {}) {
    const utility = this.getUtility(utilityName);
    if (!utility) {
      throw new Error(`Unknown utility: ${utilityName}`);
    }
    return await utility.execute(functionName, args, options);
  }

  // 코드 분석 (자주 사용되는 기능)
  async analyzeCode(code, language = 'javascript') {
    try {
      return await this.execute('code_intelligence_utils', 'analyze_code_structure', [code, language]);
    } catch (error) {
      // 폴백: 기본 분석
      return {
        language,
        lines: code.split('\n').length,
        characters: code.length,
        analysis: 'Basic analysis (Python utils not available)',
        timestamp: new Date().toISOString()
      };
    }
  }

  // 보안 스캔 (자주 사용되는 기능)
  async scanSecurity(target, options = {}) {
    try {
      return await this.execute('security_threat_analyzer', 'scan_vulnerabilities', [target], options);
    } catch (error) {
      // 폴백: 기본 보안 체크
      return {
        target,
        status: 'scan_unavailable',
        message: 'Python security scanner not available',
        basic_checks: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  // 성능 분석 (자주 사용되는 기능)
  async analyzePerformance(metrics, options = {}) {
    try {
      return await this.execute('performance_profiling_utils', 'profile_performance', [metrics], options);
    } catch (error) {
      // 폴백: 기본 성능 분석
      return {
        metrics,
        analysis: 'Basic performance analysis (Python utils not available)',
        recommendations: [],
        timestamp: new Date().toISOString()
      };
    }
  }
}

// 싱글톤 인스턴스
let pythonUtilsInstance = null;

module.exports = {
  PythonUtils,
  PythonUtilityWrapper,
  PythonUtilityRunner,
  PYTHON_UTILITIES,
  
  // 싱글톤 인스턴스 가져오기
  getPythonUtils: () => {
    if (!pythonUtilsInstance) {
      pythonUtilsInstance = new PythonUtils();
    }
    return pythonUtilsInstance;
  },

  // 개별 유틸리티들 (편의를 위해)
  ...utilities
}; 