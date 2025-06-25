// AI 분석 서비스 인터페이스
export interface AIAnalysisService {
  initialize(): Promise<void>;
  analyzeComplexity(description: string): Promise<ComplexityAnalysis>;
  generateWorkflow(requirements: WorkflowRequirements): Promise<WorkflowResult>;
  analyzeSystemHealth(metrics: SystemMetrics): Promise<HealthAnalysis>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

export interface ComplexityAnalysis {
  overallScore: number;
  codeComplexity: 'Low' | 'Medium' | 'High';
  architectureComplexity: 'Low' | 'Medium' | 'High';
  dependencyComplexity: 'Low' | 'Medium' | 'High';
  recommendations: string[];
  details: {
    cyclomaticComplexity: number;
    nestingDepth: number;
    lineCount: number;
    functionCount: number;
  };
}

export interface WorkflowRequirements {
  description: string;
  projectType: string;
  complexity: 'low' | 'medium' | 'high';
  teamSize?: number;
  timeline?: string;
}

export interface WorkflowResult {
  name: string;
  description: string;
  steps: WorkflowStep[];
  estimatedTime: string;
  benefits: string[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  duration: string;
  dependencies: string[];
  tools: string[];
}

export interface SystemMetrics {
  logs: any[];
  metrics: Record<string, any>;
  timeRange: string;
}

export interface HealthAnalysis {
  overallHealth: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  cpuUsage: string;
  memoryUsage: string;
  errorRate: string;
  responseTime: string;
  recommendations: string[];
  alerts: HealthAlert[];
}

export interface HealthAlert {
  level: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

// AI 분석 서비스 구현
export class AIAnalysisServiceImpl implements AIAnalysisService {
  private aiModule: any = null;
  private initialized = false;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // ai-analysis 모듈 동적 로드 시도
      try {
        // 실제 환경에서는 이 모듈을 사용
        // const { AIAnalysisModule } = await import('@recursive/ai-analysis');
        // this.aiModule = new AIAnalysisModule();
        // await this.aiModule.initialize();
        
        // 개발 환경에서는 mock 데이터 사용
        this.aiModule = new MockAIAnalysisModule();
        await this.aiModule.initialize();
        
        this.initialized = true;
        this.emit('statusChange', 'ready');
        
      } catch (error) {
        console.warn('AI 분석 모듈 로드 실패, Mock 모듈을 사용합니다:', error);
        this.aiModule = new MockAIAnalysisModule();
        await this.aiModule.initialize();
        
        this.initialized = true;
        this.emit('statusChange', 'ready (mock)');
      }
      
    } catch (error) {
      console.error('AI 분석 서비스 초기화 실패:', error);
      this.emit('statusChange', 'error');
      throw error;
    }
  }

  // 이벤트 관련 메서드
  public on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  public off(event: string, callback: (data: any) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  async analyzeComplexity(description: string): Promise<ComplexityAnalysis> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.aiModule.analyzeComplexity({
        description,
        includeRecommendations: true
      });
    } catch (error) {
      console.error('복잡도 분석 실패:', error);
      throw new Error('복잡도 분석 중 오류가 발생했습니다.');
    }
  }

  async generateWorkflow(requirements: WorkflowRequirements): Promise<WorkflowResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.aiModule.generateWorkflow(requirements);
    } catch (error) {
      console.error('워크플로우 생성 실패:', error);
      throw new Error('워크플로우 생성 중 오류가 발생했습니다.');
    }
  }

  async analyzeSystemHealth(metrics: SystemMetrics): Promise<HealthAnalysis> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.aiModule.analyzeSystemHealth(metrics);
    } catch (error) {
      console.error('시스템 건강도 분석 실패:', error);
      throw new Error('시스템 건강도 분석 중 오류가 발생했습니다.');
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async destroy(): Promise<void> {
    if (this.aiModule && this.aiModule.destroy) {
      await this.aiModule.destroy();
    }
    this.initialized = false;
    this.emit('statusChange', 'destroyed');
    this.eventListeners.clear();
  }
}

// Mock AI 분석 모듈 (개발/테스트용)
class MockAIAnalysisModule {
  async initialize(): Promise<void> {
    // Mock 초기화
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async analyzeComplexity(params: any): Promise<ComplexityAnalysis> {
    // 실제 분석을 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 설명 텍스트 기반으로 복잡도 계산 (간단한 휴리스틱)
    const description = params.description.toLowerCase();
    let score = 5; // 기본 점수

    if (description.includes('복잡') || description.includes('어려움')) score += 2;
    if (description.includes('간단') || description.includes('쉬움')) score -= 2;
    if (description.includes('대규모') || description.includes('많은')) score += 1;
    if (description.includes('소규모') || description.includes('적은')) score -= 1;

    score = Math.max(1, Math.min(10, score));

    return {
      overallScore: score,
      codeComplexity: score > 7 ? 'High' : score > 4 ? 'Medium' : 'Low',
      architectureComplexity: score > 6 ? 'High' : score > 3 ? 'Medium' : 'Low',
      dependencyComplexity: score > 5 ? 'High' : score > 2 ? 'Medium' : 'Low',
      recommendations: [
        '단일 책임 원칙을 적용하여 클래스와 함수를 분리해보세요',
        '중복 코드를 제거하고 재사용 가능한 컴포넌트를 만들어보세요',
        '의존성 주입을 활용하여 결합도를 낮춰보세요',
        '복잡한 로직은 작은 단위로 분해해보세요'
      ],
      details: {
        cyclomaticComplexity: Math.floor(score * 1.5),
        nestingDepth: Math.floor(score / 2),
        lineCount: score * 100,
        functionCount: score * 5
      }
    };
  }

  async generateWorkflow(requirements: WorkflowRequirements): Promise<WorkflowResult> {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const steps: WorkflowStep[] = [
      {
        id: 'planning',
        name: '계획 수립',
        description: '프로젝트 요구사항 분석 및 설계',
        duration: '2-3일',
        dependencies: [],
        tools: ['Figma', 'Miro', 'Confluence']
      },
      {
        id: 'development',
        name: '개발',
        description: '코드 작성 및 기능 구현',
        duration: '1-2주',
        dependencies: ['planning'],
        tools: ['VS Code', 'Git', 'Docker']
      },
      {
        id: 'testing',
        name: '테스트',
        description: '단위 테스트 및 통합 테스트',
        duration: '2-3일',
        dependencies: ['development'],
        tools: ['Jest', 'Cypress', 'Postman']
      },
      {
        id: 'deployment',
        name: '배포',
        description: 'CI/CD 파이프라인을 통한 배포',
        duration: '1일',
        dependencies: ['testing'],
        tools: ['GitHub Actions', 'Docker', 'AWS']
      }
    ];

    return {
      name: `${requirements.projectType} 개발 워크플로우`,
      description: `${requirements.complexity} 복잡도의 ${requirements.projectType} 프로젝트를 위한 최적화된 워크플로우`,
      steps,
      estimatedTime: '2-3주',
      benefits: [
        '개발 효율성 향상',
        '코드 품질 보장',
        '배포 자동화',
        '팀 협업 개선'
      ]
    };
  }

  async analyzeSystemHealth(metrics: SystemMetrics): Promise<HealthAnalysis> {
    await new Promise(resolve => setTimeout(resolve, 800));

    // 간단한 건강도 분석 시뮬레이션
    const errorCount = metrics.logs.filter((log: any) => log.level === 'ERROR').length;
    const totalLogs = metrics.logs.length;
    const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;

    let overallHealth: HealthAnalysis['overallHealth'] = 'Good';
    if (errorRate > 10) overallHealth = 'Poor';
    else if (errorRate > 5) overallHealth = 'Fair';
    else if (errorRate < 1) overallHealth = 'Excellent';

    const alerts: HealthAlert[] = [];
    if (errorRate > 5) {
      alerts.push({
        level: 'warning',
        message: `높은 에러 발생률: ${errorRate.toFixed(1)}%`,
        timestamp: new Date().toISOString()
      });
    }

    return {
      overallHealth,
      cpuUsage: '45%',
      memoryUsage: '62%',
      errorRate: `${errorRate.toFixed(1)}%`,
      responseTime: '125ms',
      recommendations: [
        '에러 로그를 정기적으로 모니터링하세요',
        '응답 시간이 느린 API를 최적화하세요',
        '메모리 사용량을 주기적으로 확인하세요',
        '알림 시스템을 설정하여 이상 징후를 빠르게 감지하세요'
      ],
      alerts
    };
  }

  async destroy(): Promise<void> {
    // Mock 정리
  }
} 