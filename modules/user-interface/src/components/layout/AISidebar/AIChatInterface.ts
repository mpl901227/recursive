import { BaseComponent } from '../../base/component.js';
import type { ComponentProps, ComponentState } from '../../../types/index.js';

export interface AIChatInterfaceProps extends ComponentProps {
  className?: string;
  placeholder?: string;
  maxHistoryLength?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AIChatInterface extends BaseComponent<HTMLElement, AIChatInterfaceProps> {
  protected state: ComponentState = 'idle';
  
  private messages: ChatMessage[] = [];
  private isLoading: boolean = false;
  private inputValue: string = '';
  private messagesContainer: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;

  constructor(container: HTMLElement, props: AIChatInterfaceProps = {}, eventManager?: any) {
    super(container, props, eventManager);
    this.props.placeholder = this.props.placeholder || 'Ask me anything...';
    this.props.maxHistoryLength = this.props.maxHistoryLength || 100;
  }

  protected createMarkup(): string {
    const messages = this.messages;
    const isLoading = this.isLoading;
    
    return `
      <div class="ai-chat-interface ${this.props.className || ''}">
        <div class="chat-header">
          <span class="chat-title">AI Assistant</span>
          <div class="chat-controls">
            <button class="clear-chat-btn" type="button">Clear</button>
            <button class="export-chat-btn" type="button">Export</button>
          </div>
        </div>
        
        <div class="messages-container">
          ${messages.length === 0 ? 
            '<div class="chat-empty">Start a conversation with the AI assistant</div>' : 
            messages.map(message => this.createMessageHTML(message)).join('')
          }
          ${isLoading ? '<div class="typing-indicator">AI is typing...</div>' : ''}
        </div>
        
        <div class="input-container">
          <textarea 
            class="message-input" 
            placeholder="${this.props.placeholder}"
            rows="3"
            ${isLoading ? 'disabled' : ''}
          ></textarea>
          <button 
            class="send-button" 
            type="button"
            ${isLoading ? 'disabled' : ''}
          >
            ${isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    `;
  }

  private createMessageHTML(message: ChatMessage): string {
    const timeStr = message.timestamp.toLocaleTimeString();
    const roleClass = `message-${message.role}`;
    
    return `
      <div class="chat-message ${roleClass}" data-id="${message.id}">
        <div class="message-header">
          <span class="message-role">${this.getRoleDisplayName(message.role)}</span>
          <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-content">${this.formatMessageContent(message.content)}</div>
        ${message.metadata ? `
          <div class="message-metadata">
            <details>
              <summary>Details</summary>
              <pre>${JSON.stringify(message.metadata, null, 2)}</pre>
            </details>
          </div>
        ` : ''}
      </div>
    `;
  }

  private getRoleDisplayName(role: string): string {
    switch (role) {
      case 'user': return 'You';
      case 'assistant': return 'AI';
      case 'system': return 'System';
      default: return role;
    }
  }

  private formatMessageContent(content: string): string {
    // Basic markdown-like formatting
    return this.escapeHtml(content)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public render(): void {
    if (!this.element) return;
    
    this.element.innerHTML = this.createMarkup();
    this.messagesContainer = this.element.querySelector('.messages-container');
    this.inputElement = this.element.querySelector('.message-input');
    this.sendButton = this.element.querySelector('.send-button');
    
    this.bindEvents();
    this.scrollToBottom();
    
    if (this.inputElement) {
      this.inputElement.value = this.inputValue;
      this.inputElement.focus();
    }
  }

  public bindEvents(): void {
    if (!this.element) return;

    // Send button
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => this.handleSend());
    }

    // Input textarea
    if (this.inputElement) {
      this.inputElement.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;
        this.inputValue = target.value;
        this.updateSendButtonState();
      });

      this.inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });

      // Auto-resize textarea
      this.inputElement.addEventListener('input', () => {
        this.autoResizeTextarea();
      });
    }

    // Clear chat button
    const clearBtn = this.element.querySelector('.clear-chat-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearChat());
    }

    // Export chat button
    const exportBtn = this.element.querySelector('.export-chat-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportChat());
    }
  }

  private autoResizeTextarea(): void {
    if (!this.inputElement) return;
    
    this.inputElement.style.height = 'auto';
    this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 150) + 'px';
  }

  private updateSendButtonState(): void {
    if (this.sendButton) {
      const hasText = this.inputValue.trim().length > 0;
      this.sendButton.disabled = !hasText || this.isLoading;
    }
  }

  private async handleSend(): Promise<void> {
    const message = this.inputValue.trim();
    if (!message || this.isLoading) return;

    // Add user message
    this.addMessage('user', message);
    this.inputValue = '';
    this.isLoading = true;
    this.render();

    try {
      // Emit message event for processing
      this.eventManager?.emit('ai-chat:send-message', {
        message,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      this.addMessage('system', 'Error: Failed to send message');
      this.isLoading = false;
      this.render();
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  private clearChat(): void {
    this.messages = [];
    this.render();
  }

  private exportChat(): void {
    const chatData = {
      timestamp: new Date().toISOString(),
      messages: this.messages
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public addMessage(role: ChatMessage['role'], content: string, metadata?: Record<string, any>): void {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      ...(metadata && { metadata })
    };

    this.messages.push(message);

    // Limit history
    if (this.messages.length > (this.props.maxHistoryLength || 100)) {
      this.messages.shift();
    }

    this.render();
  }

  public addUserMessage(content: string): void {
    this.addMessage('user', content);
  }

  public addAssistantMessage(content: string, metadata?: Record<string, any>): void {
    this.addMessage('assistant', content, metadata);
    this.isLoading = false;
    this.render();
  }

  public addSystemMessage(content: string): void {
    this.addMessage('system', content);
  }

  public setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.render();
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public async destroy(): Promise<void> {
    this.messages = [];
    this.messagesContainer = null;
    this.inputElement = null;
    this.sendButton = null;
    await super.destroy();
  }
} 