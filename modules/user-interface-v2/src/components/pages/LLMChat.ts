import { ComponentFactory } from '../../utils/component-factory.js';
import { eventManager } from '../../core/EventManager.js';
import { domManager } from '../../core/DOMManager.js';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  images?: string[];
  metadata?: {
    model?: string;
    mode?: string;
    error?: string;
  };
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  provider: string;
}

export interface ModeOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export class LLMChat {
  private _element: HTMLElement | null = null;
  private messages: ChatMessage[] = [];
  private isProcessing = false;
  private messageIdCounter = 0;
  private selectedModel = 'gpt-4';
  private selectedMode = 'ask';
  private attachedImages: File[] = [];

  private readonly models: ModelOption[] = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      description: '가장 강력한 범용 모델',
      provider: 'OpenAI'
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: '빠르고 효율적인 모델',
      provider: 'OpenAI'
    },
    {
      id: 'claude-3',
      name: 'Claude 3',
      description: '창의적이고 분석적인 모델',
      provider: 'Anthropic'
    },
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      description: '다중 모달 모델',
      provider: 'Google'
    }
  ];

  private readonly modes: ModeOption[] = [
    {
      id: 'ask',
      name: 'Ask Mode',
      description: '일반적인 질문과 답변',
      icon: '💬'
    },
    {
      id: 'agent',
      name: 'Agent Mode',
      description: '자율적인 작업 수행',
      icon: '🤖'
    }
  ];

  constructor() {
    // constructor에서는 기본 상태만 설정
  }

  async initialize(): Promise<void> {
    // 환영 메시지 추가
    this.addMessage({
      type: 'system',
      content: `안녕하세요! LLM 채팅에 오신 것을 환영합니다. 🚀

현재 설정:
• 모델: ${this.getModelName(this.selectedModel)}
• 모드: ${this.getModeName(this.selectedMode)}

질문하거나 이미지를 첨부해서 대화를 시작해보세요!`
    });
  }

  async render(): Promise<HTMLElement> {
    console.log('🎨 LLMChat render() 시작');
    
    const container = domManager.createElement('div', {
      className: 'llm-chat'
    });
    
    // 기본 fallback 스타일 추가 (CSS가 로드되지 않았을 때를 위해)
    container.style.cssText = `
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 500px !important;
      background: #ffffff !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
      overflow: visible !important;
      border: 2px solid #3b82f6 !important;
      position: relative !important;
      z-index: 10 !important;
      margin: 0 !important;
      padding: 0 !important;
    `;
    
    console.log('📦 Container created:', container);
    console.log('📦 Container className:', container.className);
    console.log('📦 Container styles applied');
    
    this._element = container;

    console.log('🏗️ Building LLM Chat components...');
    
    try {
      // 헤더 생성
      console.log('📋 Creating header...');
      const header = this.createHeader();
      console.log('✅ Header created:', header);
      container.appendChild(header);

      // 메인 채팅 영역
      console.log('💬 Creating chat body...');
      const chatBody = this.createChatBody();
      console.log('✅ Chat body created:', chatBody);
      container.appendChild(chatBody);

      // 입력 영역
      console.log('⌨️ Creating input area...');
      const inputArea = this.createInputArea();
      console.log('✅ Input area created:', inputArea);
      container.appendChild(inputArea);
      
      console.log('🎉 All components created successfully');
      
    } catch (error) {
      console.error('❌ Error creating LLM Chat components:', error);
      
      // 오류 발생 시 간단한 fallback UI
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; background: #fee2e2; color: #dc2626; border-radius: 8px; margin: 20px;">
          <h2 style="margin: 0 0 10px 0;">⚠️ 컴포넌트 렌더링 오류</h2>
          <p style="margin: 0; font-size: 14px;">LLM 채팅 컴포넌트를 생성하는 중 오류가 발생했습니다.</p>
          <details style="margin-top: 10px; text-align: left;">
            <summary style="cursor: pointer;">오류 세부사항</summary>
            <pre style="background: #fef2f2; padding: 10px; border-radius: 4px; margin-top: 5px; font-size: 12px;">${error}</pre>
          </details>
        </div>
      `;
    }

    return container;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'chat-header';
    
    // 강제 스타일 추가
    header.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 20px !important;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
      color: white !important;
      border-bottom: 1px solid #e5e7eb !important;
      min-height: 80px !important;
    `;
    
    // 왼쪽 영역 - 제목과 상태
    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';
    
    const title = document.createElement('h1');
    title.innerHTML = '🧠 LLM Chat';
    headerLeft.appendChild(title);
    
    // 상태 표시
    console.log('🔧 Creating status badge...');
    try {
      const statusIndicator = ComponentFactory.createBadge(
        this.isProcessing ? '생각 중...' : '대기 중',
        {
          color: this.isProcessing ? 'warning' : 'success',
          className: 'status-indicator'
        }
      );
      console.log('✅ Status badge created:', statusIndicator);
      headerLeft.appendChild(statusIndicator);
    } catch (error) {
      console.error('❌ Failed to create status badge:', error);
      // Fallback 텍스트
      const fallbackText = document.createElement('span');
      fallbackText.textContent = this.isProcessing ? '생각 중...' : '대기 중';
      fallbackText.className = 'status-indicator';
      headerLeft.appendChild(fallbackText);
    }
    
    // 오른쪽 영역 - 설정과 액션
    const headerRight = document.createElement('div');
    headerRight.className = 'header-right';
    
    // 모델 선택
    const modelSelect = this.createModelSelect();
    headerRight.appendChild(modelSelect);
    
    // 모드 선택
    const modeSelect = this.createModeSelect();
    headerRight.appendChild(modeSelect);
    
    // 액션 버튼들
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    
    console.log('🔧 Creating action buttons...');
    
    // 안전한 버튼 생성 함수
    const createSafeButton = (text: string, onClick: () => void, className = '') => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.className = `btn btn--secondary btn--outline btn--sm ${className}`;
      btn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid #64748b;
        background: transparent;
        color: #64748b;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
      `;
      btn.addEventListener('click', onClick);
      return btn;
    };
    
    const clearBtn = createSafeButton('대화 지우기', () => this.clearChat());
    const exportBtn = createSafeButton('내보내기', () => this.exportChat());
    
    ComponentFactory.appendTo(actions, clearBtn, exportBtn);
    headerRight.appendChild(actions);
    
    ComponentFactory.appendTo(header, headerLeft, headerRight);
    
    return header;
  }

  private createModelSelect(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'model-select-container';
    
    const label = document.createElement('label');
    label.textContent = '모델';
    label.className = 'select-label';
    
    const select = document.createElement('select');
    select.className = 'model-select';
    select.value = this.selectedModel;
    
    this.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} (${model.provider})`;
      select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
      this.selectedModel = (e.target as HTMLSelectElement).value;
      this.updateModelInfo();
    });
    
    ComponentFactory.appendTo(container, label, select);
    
    return container;
  }

  private createModeSelect(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'mode-select-container';
    
    const label = document.createElement('label');
    label.textContent = '모드';
    label.className = 'select-label';
    
    const modeGroup = document.createElement('div');
    modeGroup.className = 'mode-group';
    
    this.modes.forEach(mode => {
      const modeBtn = document.createElement('button');
      modeBtn.className = `mode-btn ${this.selectedMode === mode.id ? 'active' : ''}`;
      modeBtn.innerHTML = `${mode.icon} ${mode.name}`;
      modeBtn.title = mode.description;
      
      modeBtn.addEventListener('click', () => {
        this.selectedMode = mode.id;
        // 모든 버튼에서 active 클래스 제거
        modeGroup.querySelectorAll('.mode-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        // 현재 버튼에 active 클래스 추가
        modeBtn.classList.add('active');
        this.updateModeInfo();
      });
      
      modeGroup.appendChild(modeBtn);
    });
    
    ComponentFactory.appendTo(container, label, modeGroup);
    
    return container;
  }

  private createChatBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'chat-body';
    
    // 메시지 컨테이너
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'messages-container';
    messagesContainer.id = 'messagesContainer';
    
    // 메시지 렌더링
    this.renderMessages(messagesContainer);
    
    body.appendChild(messagesContainer);
    
    return body;
  }

  private createInputArea(): HTMLElement {
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    
    // 첨부된 이미지 미리보기
    const imagePreviewContainer = document.createElement('div');
    imagePreviewContainer.className = 'image-preview-container';
    imagePreviewContainer.id = 'imagePreviewContainer';
    
    // 메인 입력 컨테이너
    const inputContainer = document.createElement('div');
    inputContainer.className = 'input-container';
    
    // 파일 입력 (숨김)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.id = 'fileInput';
    
    fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        Array.from(files).forEach(file => {
          this.attachedImages.push(file);
        });
        this.updateImagePreview();
      }
    });
    
    // 텍스트 입력
    const textInput = document.createElement('textarea');
    textInput.className = 'chat-input';
    textInput.placeholder = '메시지를 입력하세요... (Shift+Enter로 줄바꿈, Enter로 전송)';
    textInput.rows = 1;
    textInput.id = 'chatInput';
    
    // 자동 높이 조절
    textInput.addEventListener('input', () => {
      textInput.style.height = 'auto';
      textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
    });
    
    // 키보드 이벤트
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // 입력 액션 버튼들
    const inputActions = document.createElement('div');
    inputActions.className = 'input-actions';
    
    // 이미지 첨부 버튼
    const attachBtn = document.createElement('button');
    attachBtn.className = 'attach-btn';
    attachBtn.innerHTML = '📎';
    attachBtn.title = '이미지 첨부';
    attachBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    // 전송 버튼 (화살표)
    const sendBtn = document.createElement('button');
    sendBtn.className = 'send-btn';
    sendBtn.innerHTML = '➤';
    sendBtn.title = '메시지 전송';
    sendBtn.disabled = this.isProcessing;
    sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });
    
    ComponentFactory.appendTo(inputActions, attachBtn, sendBtn);
    ComponentFactory.appendTo(inputContainer, textInput, inputActions);
    ComponentFactory.appendTo(inputArea, imagePreviewContainer, inputContainer, fileInput);
    
    return inputArea;
  }

  private renderMessages(container: HTMLElement): void {
    container.innerHTML = '';
    
    this.messages.forEach(message => {
      const messageElement = this.createMessageElement(message);
      container.appendChild(messageElement);
    });
    
    // 스크롤을 맨 아래로
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message--${message.type}`;
    
    // 메시지 내용
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // 시스템 메시지는 다르게 처리
    if (message.type === 'system') {
      content.innerHTML = `<div class="system-message">${message.content.replace(/\n/g, '<br>')}</div>`;
      messageDiv.appendChild(content);
      return messageDiv;
    }
    
    // 사용자 메시지의 경우
    if (message.type === 'user') {
      // 첨부된 이미지들
      if (message.images && message.images.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'message-images';
        
        message.images.forEach(imageUrl => {
          const img = document.createElement('img');
          img.src = imageUrl;
          img.className = 'message-image';
          imagesContainer.appendChild(img);
        });
        
        content.appendChild(imagesContainer);
      }
    }
    
    // 텍스트 내용
    const textContent = document.createElement('div');
    textContent.className = 'message-text';
    textContent.innerHTML = message.content.replace(/\n/g, '<br>');
    content.appendChild(textContent);
    
    // 메타데이터 (모델, 모드 정보)
    if (message.metadata && (message.metadata.model || message.metadata.mode)) {
      const metaInfo = document.createElement('div');
      metaInfo.className = 'message-meta';
      
      if (message.metadata.model) {
        const modelInfo = document.createElement('span');
        modelInfo.textContent = this.getModelName(message.metadata.model);
        modelInfo.className = 'meta-model';
        metaInfo.appendChild(modelInfo);
      }
      
      if (message.metadata.mode) {
        const modeInfo = document.createElement('span');
        modeInfo.textContent = this.getModeName(message.metadata.mode);
        modeInfo.className = 'meta-mode';
        metaInfo.appendChild(modeInfo);
      }
      
      content.appendChild(metaInfo);
    }
    
    // 타임스탬프
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = this.formatTimestamp(message.timestamp);
    content.appendChild(timestamp);
    
    messageDiv.appendChild(content);
    
    return messageDiv;
  }

  private addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${++this.messageIdCounter}`,
      timestamp: new Date().toISOString()
    };
    
    this.messages.push(newMessage);
    this.updateMessageDisplay();
    
    return newMessage;
  }

  private async sendMessage(): Promise<void> {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const content = input.value.trim();
    
    if (!content && this.attachedImages.length === 0) return;
    if (this.isProcessing) return;
    
    // 이미지를 데이터 URL로 변환
    const imageUrls: string[] = [];
    for (const file of this.attachedImages) {
      const dataUrl = await this.fileToDataUrl(file);
      imageUrls.push(dataUrl);
    }
    
    // 사용자 메시지 추가
    this.addMessage({
      type: 'user',
      content: content || '(이미지)',
      images: imageUrls.length > 0 ? imageUrls : undefined,
      metadata: {
        model: this.selectedModel,
        mode: this.selectedMode
      }
    });
    
    // 입력 필드 초기화
    input.value = '';
    input.style.height = 'auto';
    this.attachedImages = [];
    this.updateImagePreview();
    
    // AI 응답 처리
    await this.processAIResponse(content, imageUrls);
  }

  private async processAIResponse(userMessage: string, images: string[]): Promise<void> {
    this.isProcessing = true;
    this.updateProcessingState();
    
    try {
      // 로딩 메시지 추가
      const loadingMessage = this.addMessage({
        type: 'assistant',
        content: '생각하고 있습니다...'
      });
      
      // 실제 AI 호출 시뮬레이션 (나중에 실제 API로 교체)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 로딩 메시지 제거
      this.messages = this.messages.filter(msg => msg.id !== loadingMessage.id);
      
      // 실제 응답 생성 (시뮬레이션)
      const response = await this.generateMockResponse(userMessage, images);
      
      this.addMessage({
        type: 'assistant',
        content: response,
        metadata: {
          model: this.selectedModel,
          mode: this.selectedMode
        }
      });
      
    } catch (error) {
      this.addMessage({
        type: 'assistant',
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.',
        metadata: {
          error: error instanceof Error ? error.message : '알 수 없는 오류'
        }
      });
    } finally {
      this.isProcessing = false;
      this.updateProcessingState();
    }
  }

  private async generateMockResponse(userMessage: string, images: string[]): Promise<string> {
    // 모드에 따른 다른 응답 스타일
    const isAgentMode = this.selectedMode === 'agent';
    
    let response = '';
    
    if (images.length > 0) {
      response += `이미지 ${images.length}개를 확인했습니다. `;
    }
    
    if (isAgentMode) {
      response += `[Agent Mode] 요청을 분석하고 자율적으로 작업을 수행하겠습니다.\n\n`;
      response += `1. 요청 분석: "${userMessage}"\n`;
      response += `2. 작업 계획 수립\n`;
      response += `3. 단계별 실행\n`;
      response += `4. 결과 검증\n\n`;
      response += `현재 ${this.getModelName(this.selectedModel)} 모델을 사용하여 최적의 결과를 제공하겠습니다.`;
    } else {
      response += `안녕하세요! ${this.getModelName(this.selectedModel)}으로 답변드리겠습니다.\n\n`;
      response += `"${userMessage}"에 대한 답변:\n\n`;
      response += `이것은 시뮬레이션된 응답입니다. 실제 구현 시에는 선택하신 모델의 API를 호출하여 실제 답변을 생성합니다.`;
    }
    
    return response;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private updateImagePreview(): void {
    const container = document.getElementById('imagePreviewContainer') as HTMLElement;
    
    if (this.attachedImages.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = '';
    
    this.attachedImages.forEach((file, index) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'image-preview-item';
      
      const img = document.createElement('img');
      img.className = 'preview-image';
      
      // 파일을 데이터 URL로 변환해서 미리보기
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
      
      // 제거 버튼
      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-remove-btn';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => {
        this.attachedImages.splice(index, 1);
        this.updateImagePreview();
      });
      
      ComponentFactory.appendTo(previewItem, img, removeBtn);
      container.appendChild(previewItem);
    });
  }

  private updateMessageDisplay(): void {
    const container = document.getElementById('messagesContainer');
    if (container) {
      this.renderMessages(container);
    }
  }

  private updateProcessingState(): void {
    // 상태 표시 업데이트
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = this.isProcessing ? '생각 중...' : '대기 중';
      statusIndicator.className = `status-indicator ${this.isProcessing ? 'warning' : 'success'}`;
    }
    
    // 전송 버튼 상태 업데이트
    const sendBtn = document.querySelector('.send-btn') as HTMLButtonElement;
    if (sendBtn) {
      sendBtn.disabled = this.isProcessing;
      sendBtn.innerHTML = this.isProcessing ? '⏳' : '➤';
    }
  }

  private updateModelInfo(): void {
    // 모델 변경 시 추가 로직 (예: UI 업데이트)
    console.log(`모델 변경: ${this.getModelName(this.selectedModel)}`);
  }

  private updateModeInfo(): void {
    // 모드 변경 시 추가 로직 (예: UI 업데이트)
    console.log(`모드 변경: ${this.getModeName(this.selectedMode)}`);
  }

  private getModelName(modelId: string): string {
    const model = this.models.find(m => m.id === modelId);
    return model ? model.name : modelId;
  }

  private getModeName(modeId: string): string {
    const mode = this.modes.find(m => m.id === modeId);
    return mode ? mode.name : modeId;
  }

  private clearChat(): void {
    this.messages = [];
    this.attachedImages = [];
    this.updateImagePreview();
    this.updateMessageDisplay();
    
    // 환영 메시지 다시 추가
    this.initialize();
  }

  private async exportChat(): Promise<void> {
    const chatData = {
      messages: this.messages,
      settings: {
        model: this.selectedModel,
        mode: this.selectedMode
      },
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  public destroy(): void {
    // 정리 작업
    this.messages = [];
    this.attachedImages = [];
    this._element?.remove();
    this._element = null;
  }
} 