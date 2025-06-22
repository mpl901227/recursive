import { BaseComponent } from '../../base/component.js';
import type { ComponentProps, ComponentState } from '../../../types/index.js';

export interface ActivityLogProps extends ComponentProps {
  className?: string;
  maxEntries?: number;
}

export interface ActivityEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: string;
}

export class ActivityLog extends BaseComponent<HTMLElement, ActivityLogProps> {
  protected state: ComponentState = 'idle';
  
  private activityEntries: ActivityEntry[] = [];
  private isAutoScroll: boolean = true;
  private logContainer: HTMLElement | null = null;

  constructor(container: HTMLElement, props: ActivityLogProps = {}, eventManager?: any) {
    super(container, props, eventManager);
    this.props.maxEntries = this.props.maxEntries || 100;
  }

  protected createMarkup(): string {
    const entries = this.activityEntries;
    
    return `
      <div class="activity-log ${this.props.className || ''}">
        <div class="log-header">
          <span class="log-title">Activity Log</span>
          <div class="log-controls">
            <button class="clear-log-btn" type="button">Clear</button>
            <button class="auto-scroll-btn ${this.isAutoScroll ? 'active' : ''}" type="button">
              Auto Scroll
            </button>
          </div>
        </div>
        
        <div class="log-container">
          ${entries.length === 0 ? 
            '<div class="log-empty">No activity yet</div>' : 
            entries.map(entry => this.createLogEntryHTML(entry)).join('')
          }
        </div>
      </div>
    `;
  }

  private createLogEntryHTML(entry: ActivityEntry): string {
    const timeStr = entry.timestamp.toLocaleTimeString();
    const hasDetails = entry.details && entry.details.trim().length > 0;
    
    return `
      <div class="log-entry log-${entry.type}" data-id="${entry.id}">
        <div class="log-entry-header">
          <span class="log-time">${timeStr}</span>
          <span class="log-type">${entry.type.toUpperCase()}</span>
          ${hasDetails ? '<span class="log-expand">▼</span>' : ''}
        </div>
        <div class="log-message">${this.escapeHtml(entry.message)}</div>
        ${hasDetails ? `
          <div class="log-details" style="display: none;">
            <pre>${this.escapeHtml(entry.details!)}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public render(): void {
    if (!this.element) return;
    
    this.element.innerHTML = this.createMarkup();
    this.logContainer = this.element.querySelector('.log-container');
    this.bindEvents();
    
    if (this.isAutoScroll) {
      this.scrollToBottom();
    }
  }

  public bindEvents(): void {
    if (!this.element) return;

    // Clear log button
    const clearBtn = this.element.querySelector('.clear-log-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearLog());
    }

    // Auto scroll toggle
    const autoScrollBtn = this.element.querySelector('.auto-scroll-btn');
    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => this.toggleAutoScroll());
    }

    // Expandable log entries
    const expandBtns = this.element.querySelectorAll('.log-expand');
    expandBtns.forEach((btn: Element) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const entry = target.closest('.log-entry');
        if (entry) {
          this.toggleLogEntryDetails(entry as HTMLElement);
        }
      });
    });
  }

  private toggleLogEntryDetails(entry: HTMLElement): void {
    const details = entry.querySelector('.log-details') as HTMLElement;
    const expandBtn = entry.querySelector('.log-expand') as HTMLElement;
    
    if (details && expandBtn) {
      const isExpanded = details.style.display !== 'none';
      details.style.display = isExpanded ? 'none' : 'block';
      expandBtn.textContent = isExpanded ? '▼' : '▲';
    }
  }

  private clearLog(): void {
    this.activityEntries = [];
    this.render();
  }

  private toggleAutoScroll(): void {
    this.isAutoScroll = !this.isAutoScroll;
    this.render();
  }

  private scrollToBottom(): void {
    if (this.logContainer) {
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
  }

  public addEntry(type: ActivityEntry['type'], message: string, details?: string): void {
    const entry: ActivityEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      type,
      message,
      ...(details !== undefined && { details })
    };

    this.activityEntries.push(entry);

    // Limit entries
    if (this.activityEntries.length > (this.props.maxEntries || 100)) {
      this.activityEntries.shift();
    }

    this.render();
  }

  public addInfo(message: string, details?: string): void {
    this.addEntry('info', message, details);
  }

  public addWarning(message: string, details?: string): void {
    this.addEntry('warning', message, details);
  }

  public addError(message: string, details?: string): void {
    this.addEntry('error', message, details);
  }

  public addSuccess(message: string, details?: string): void {
    this.addEntry('success', message, details);
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getEntries(): ActivityEntry[] {
    return [...this.activityEntries];
  }

  public async destroy(): Promise<void> {
    this.activityEntries = [];
    await super.destroy();
  }
} 