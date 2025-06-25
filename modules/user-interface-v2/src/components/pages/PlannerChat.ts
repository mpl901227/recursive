import type { AIAnalysisService } from '../../services/AIAnalysisService.js';
import { ComponentFactory } from '../../utils/component-factory.js';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    analysis?: any;
    workflow?: any;
    error?: string;
  };
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  prompt: string;
}

export class PlannerChat {
  private _element: HTMLElement | null = null;
  private aiService: AIAnalysisService;
  private messages: ChatMessage[] = [];
  private isProcessing = false;
  private messageIdCounter = 0;

  private quickActions: QuickAction[] = [
    {
      id: 'complexity',
      title: '복잡도 분석',
      description: '프로젝트 복잡도를 분석하고 개선 방안을 제시합니다',
      icon: '📊',
      prompt: '현재 프로젝트의 복잡도를 분석해주세요. 코드 구조, 의존성, 유지보수성을 중심으로 평가하고 개선 방안을 제시해주세요.'
    },
    {
      id: 'workflow',
      title: '워크플로우 생성',
      description: '효율적인 개발 워크플로우를 자동 생성합니다',
      icon: '🔄',
      prompt: '현재 프로젝트에 최적화된 개발 워크플로우를 생성해주세요. CI/CD, 코드 리뷰, 테스팅 프로세스를 포함해주세요.'
    },
    {
      id: 'system-health',
      title: '시스템 상태 분석',
      description: '시스템 성능과 안정성을 종합 분석합니다',
      icon: '💚',
      prompt: '시스템의 현재 상태를 분석해주세요. 성능 지표, 에러 발생률, 리소스 사용량을 종합하여 건강도를 평가해주세요.'
    },
    {
      id: 'optimization',
      title: '성능 최적화',
      description: '시스템 성능 최적화 방안을 제안합니다',
      icon: '⚡',
      prompt: '현재 시스템의 성능을 분석하고 최적화 방안을 제시해주세요. 병목 지점 파악과 개선 방법을 포함해주세요.'
    }
  ];

  constructor(aiService: AIAnalysisService) {
    this.aiService = aiService;
  }

  async initialize(): Promise<void> {
    // 환영 메시지 추가
    this.addMessage({
      type: 'system',
      content: `안녕하세요! AI 플래너입니다. 🧠

프로젝트 계획과 분석을 도와드리겠습니다. 다음과 같은 기능을 제공합니다:

• 📊 **복잡도 분석**: 코드와 아키텍처 복잡도 평가
• 🔄 **워크플로우 생성**: 개발 프로세스 자동화 제안
• 💚 **시스템 건강 분석**: 성능 및 안정성 진단
• ⚡ **최적화 제안**: 성능 개선 방안 도출

아래 퀵 액션을 사용하거나 직접 질문해주세요!`
    });
  }

  async render(): Promise<string> {
    // 메인 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'planner-chat';
    
    // 헤더 섹션
    const header = this.createHeader();
    container.appendChild(header);
    
    // 채팅 바디 섹션
    const body = this.createChatBody();
    container.appendChild(body);
    
    // 입력 영역 섹션
    const inputArea = this.createInputArea();
    container.appendChild(inputArea);
    
    return container.outerHTML;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'chat-header';
    
    // 왼쪽 영역
    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';
    
    const title = document.createElement('h1');
    title.textContent = '🧠 AI 플래너';
    headerLeft.appendChild(title);
    
    // 상태 표시
    const statusIndicator = ComponentFactory.createBadge(
      this.isProcessing ? '분석 중...' : '대기 중',
      {
        color: this.isProcessing ? 'warning' : 'success',
        className: 'status-indicator'
      }
    );
    headerLeft.appendChild(statusIndicator);
    
    // 오른쪽 액션 버튼들
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    
    const clearBtn = ComponentFactory.createButton({
      children: '대화 지우기',
      color: 'secondary',
      variant: 'outline',
      onClick: () => this.clearChat()
    });
    
    const exportBtn = ComponentFactory.createButton({
      children: '대화 내보내기',
      color: 'primary',
      variant: 'outline',
      onClick: () => this.exportChat()
    });
    
    ComponentFactory.appendTo(headerActions, clearBtn, exportBtn);
    ComponentFactory.appendTo(header, headerLeft, headerActions);
    
    return header;
  }

  private createChatBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'chat-body';
    
    // 메시지 컨테이너
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'messages-container';
    messagesContainer.id = 'messagesContainer';
    messagesContainer.innerHTML = this.renderMessages();
    
    // 퀵 액션 패널
    const quickActionsPanel = this.createQuickActionsPanel();
    
    ComponentFactory.appendTo(body, messagesContainer, quickActionsPanel);
    
    return body;
  }

  private createQuickActionsPanel(): HTMLElement {
    const panel = ComponentFactory.createCard({
      header: '🚀 퀵 액션',
      children: this.createQuickActionsGrid(),
      variant: 'elevated',
      className: 'quick-actions-panel'
    });
    
    return panel;
  }

  private createQuickActionsGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'quick-actions-grid';
    
    this.quickActions.forEach(action => {
      const actionBtn = ComponentFactory.createButton({
        children: this.createQuickActionContent(action),
        variant: 'outline',
        className: 'quick-action-btn',
        onClick: () => this.executeQuickAction(action.id)
      });
      
      grid.appendChild(actionBtn);
    });
    
    return grid;
  }

  private createQuickActionContent(action: QuickAction): string {
    return `
      <div class="action-icon">${action.icon}</div>
      <div class="action-content">
        <div class="action-title">${action.title}</div>
        <div class="action-description">${action.description}</div>
      </div>
    `;
  }

  private createInputArea(): HTMLElement {
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    
    // 입력 컨테이너
    const inputContainer = this.createInputContainer();
    
    // 제안 사항
    const suggestions = this.createSuggestions();
    
    ComponentFactory.appendTo(inputArea, inputContainer, suggestions);
    
    return inputArea;
  }

  private createInputContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'input-container';
    
    // 텍스트에어리어
    const textarea = ComponentFactory.createTextarea({
      placeholder: 'AI 플래너에게 질문하거나 요청사항을 입력하세요...',
      rows: 3,
      className: 'chat-input',
      attributes: { id: 'chatInput' },
      onKeyDown: (event) => this.handleKeyDown(event)
    });
    
    // 액션 버튼들
    const actions = document.createElement('div');
    actions.className = 'input-actions';
    
    const sendBtn = ComponentFactory.createButton({
      children: '📤 전송',
      color: 'primary',
      disabled: this.isProcessing,
      onClick: () => this.sendMessage()
    });
    
    actions.appendChild(sendBtn);
    
    ComponentFactory.appendTo(container, textarea, actions);
    
    return container;
  }

  private createSuggestions(): HTMLElement {
    const suggestions = document.createElement('div');
    suggestions.className = 'input-suggestions';
    
    const suggestionTexts = [
      '프로젝트 아키텍처를 개선하려면 어떻게 해야 할까요?',
      '현재 코드의 기술 부채를 어떻게 해결할 수 있을까요?',
      '팀 개발 효율성을 높이는 방법은?'
    ];
    
    suggestionTexts.forEach(text => {
      const suggestionBtn = ComponentFactory.createButton({
        children: `"${text}"`,
        variant: 'ghost',
        size: 'sm',
        className: 'suggestion-item',
        onClick: () => this.useSuggestion(text)
      });
      
      suggestions.appendChild(suggestionBtn);
    });
    
    return suggestions;
  }

  private renderMessages(): string {
    if (this.messages.length === 0) {
      return '<div class="no-messages">아직 메시지가 없습니다.</div>';
    }

    return this.messages.map(message => {
      const messageEl = ComponentFactory.createMessage({
        type: message.type,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata
      });
      return messageEl.outerHTML;
    }).join('');
  }



  private addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const fullMessage: ChatMessage = {
      ...message,
      id: (++this.messageIdCounter).toString(),
      timestamp: new Date().toISOString()
    };
    
    this.messages.push(fullMessage);
    return fullMessage;
  }

  public async sendMessage(): Promise<void> {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (!input || !input.value.trim() || this.isProcessing) return;
    
    const userMessage = input.value.trim();
    input.value = '';
    
    // 사용자 메시지 추가
    this.addMessage({
      type: 'user',
      content: userMessage
    });
    
    this.updateMessageDisplay();
    
    // AI 응답 처리
    await this.processAIResponse(userMessage);
  }

  private async processAIResponse(userMessage: string): Promise<void> {
    this.isProcessing = true;
    this.updateProcessingState();
    
    try {
      // 메시지 분석하여 적절한 AI 서비스 호출
      const response = await this.analyzeAndRespond(userMessage);
      
      this.addMessage({
        type: 'assistant',
        content: response.content,
        metadata: response.metadata
      });
      
    } catch (error) {
      console.error('AI 응답 처리 실패:', error);
      
      this.addMessage({
        type: 'assistant',
        content: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요.',
        metadata: {
          error: error instanceof Error ? error.message : '알 수 없는 오류'
        }
      });
      
    } finally {
      this.isProcessing = false;
      this.updateProcessingState();
      this.updateMessageDisplay();
    }
  }

  private async analyzeAndRespond(message: string): Promise<{ content: string; metadata?: any }> {
    const lowerMessage = message.toLowerCase();
    
    // 복잡도 분석 요청
    if (lowerMessage.includes('복잡도') || lowerMessage.includes('complexity')) {
      const analysis = await this.aiService.analyzeComplexity(message);
      return {
        content: this.generateComplexityResponse(analysis),
        metadata: { analysis }
      };
    }
    
    // 워크플로우 생성 요청
    if (lowerMessage.includes('워크플로우') || lowerMessage.includes('workflow') || lowerMessage.includes('프로세스')) {
      const workflow = await this.aiService.generateWorkflow({
        description: message,
        projectType: 'web-application',
        complexity: 'medium'
      });
      return {
        content: this.generateWorkflowResponse(workflow),
        metadata: { workflow }
      };
    }
    
    // 시스템 건강도 분석 요청
    if (lowerMessage.includes('시스템') || lowerMessage.includes('건강') || lowerMessage.includes('상태')) {
      const healthAnalysis = await this.aiService.analyzeSystemHealth({
        logs: [], // 실제로는 로그 데이터 전달
        metrics: {},
        timeRange: '24h'
      });
      return {
        content: this.generateHealthResponse(healthAnalysis),
        metadata: { analysis: healthAnalysis }
      };
    }
    
    // 일반적인 개발 상담
    return {
      content: await this.generateGeneralResponse(message)
    };
  }

  private generateComplexityResponse(analysis: any): string {
    return `📊 **복잡도 분석 결과**

**전체 복잡도 점수**: ${analysis.overallScore || 'N/A'}/10

**주요 발견사항**:
• 코드 복잡도: ${analysis.codeComplexity || 'Medium'}
• 아키텍처 복잡도: ${analysis.architectureComplexity || 'Medium'}  
• 의존성 복잡도: ${analysis.dependencyComplexity || 'Low'}

**개선 권장사항**:
• 함수와 클래스의 크기를 줄여보세요
• 중복 코드를 제거하고 재사용 가능한 컴포넌트로 리팩터링하세요
• 의존성 주입 패턴을 활용해 결합도를 낮춰보세요

더 자세한 분석이 필요하시면 말씀해주세요!`;
  }

  private generateWorkflowResponse(workflow: any): string {
    return `🔄 **개발 워크플로우 제안**

효율적인 개발을 위한 워크플로우를 생성했습니다:

**주요 단계**:
${workflow.steps ? workflow.steps.map((step: any, index: number) => 
  `${index + 1}. **${step.name}**: ${step.description}`
).join('\n') : '워크플로우 단계를 생성 중입니다...'}

**예상 효과**:
• 개발 속도 향상
• 버그 발생률 감소
• 코드 품질 개선
• 팀 협업 효율성 증대

이 워크플로우를 프로젝트에 적용해보시겠어요?`;
  }

  private generateHealthResponse(analysis: any): string {
    return `💚 **시스템 건강도 분석**

**전체 건강도**: ${analysis.overallHealth || '양호'} 

**주요 지표**:
• CPU 사용률: ${analysis.cpuUsage || '정상'}
• 메모리 사용률: ${analysis.memoryUsage || '정상'}
• 에러 발생률: ${analysis.errorRate || '낮음'}
• 응답 시간: ${analysis.responseTime || '양호'}

**권장사항**:
• 정기적인 로그 모니터링을 유지하세요
• 리소스 사용량을 주기적으로 점검하세요
• 알림 시스템을 설정하여 이상 상황에 대비하세요

추가적인 분석이나 모니터링 설정이 필요하시면 도와드리겠습니다!`;
  }

  private async generateGeneralResponse(_message: string): Promise<string> {
    // 일반적인 개발 관련 응답 생성
    const responses = [
      `좋은 질문이네요! 개발 프로젝트에서 이런 고민은 자주 발생합니다.

몇 가지 관점에서 접근해보겠습니다:

• **기술적 측면**: 현재 사용 중인 기술 스택과 아키텍처를 고려해야 합니다
• **비즈니스 측면**: 프로젝트의 목표와 제약사항을 파악하는 것이 중요합니다
• **팀 측면**: 팀의 역량과 리소스를 고려한 현실적인 계획이 필요합니다

더 구체적인 상황을 알려주시면 맞춤형 조언을 드릴 수 있습니다!`,
      
      `흥미로운 주제입니다! 이런 상황에서는 단계별 접근이 효과적입니다.

**1단계**: 현재 상황 분석
**2단계**: 목표와 우선순위 설정  
**3단계**: 구체적인 실행 계획 수립
**4단계**: 진행상황 모니터링 및 조정

각 단계에 대해 더 자세히 알고 싶으시거나, 특정 부분에 대한 도움이 필요하시면 언제든 말씀해주세요!`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private updateMessageDisplay(): void {
    const container = document.getElementById('messagesContainer');
    if (container) {
      container.innerHTML = this.renderMessages();
      container.scrollTop = container.scrollHeight;
    }
  }

  private updateProcessingState(): void {
    // ComponentFactory로 생성된 badge 구조에 맞게 수정
    const statusBadge = document.querySelector('.status-indicator');
    const sendButton = document.querySelector('.btn') as HTMLButtonElement;
    
    if (statusBadge) {
      // badge 내용 업데이트
      statusBadge.textContent = this.isProcessing ? '분석 중...' : '대기 중';
      // badge 색상 클래스 업데이트
      statusBadge.className = `badge status-indicator ${this.isProcessing ? 'badge--warning' : 'badge--success'}`;
    }
    
    if (sendButton) {
      sendButton.disabled = this.isProcessing;
    }
  }

  public executeQuickAction(actionId: string): void {
    const action = this.quickActions.find(a => a.id === actionId);
    if (action) {
      const input = document.getElementById('chatInput') as HTMLTextAreaElement;
      if (input) {
        input.value = action.prompt;
        input.focus();
      }
    }
  }

  public handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  public useSuggestion(suggestion: string): void {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (input) {
      input.value = suggestion;
      input.focus();
    }
  }

  public clearChat(): void {
    this.messages = [];
    this.messageIdCounter = 0;
    this.initialize(); // 환영 메시지 다시 추가
    this.updateMessageDisplay();
  }

  public async exportChat(): Promise<void> {
    const chatData = {
      timestamp: new Date().toISOString(),
      messages: this.messages
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  private formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  public destroy(): void {
    this.messages = [];
    this.isProcessing = false;
  }
} 