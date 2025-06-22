import { BaseComponent } from '../../base/component.js';
import type { ComponentProps, ComponentState } from '../../../types/index.js';

export interface SystemStatusProps extends ComponentProps {
  className?: string;
}

export class SystemStatus extends BaseComponent<HTMLElement, SystemStatusProps> {
  protected state: ComponentState = 'idle';
  
  private systemMetrics = {
    status: 'online' as 'online' | 'offline' | 'connecting',
    lastUpdate: new Date(),
    metrics: {
      cpu: 0,
      memory: 0,
      network: 0
    }
  };

  private updateInterval: number | null = null;

  constructor(container: HTMLElement, props: SystemStatusProps = {}, eventManager?: any) {
    super(container, props, eventManager);
    this.startMetricsUpdate();
  }

  protected createMarkup(): string {
    const { status, lastUpdate, metrics } = this.systemMetrics;
    const statusClass = `status-${status}`;
    
    return `
      <div class="system-status ${this.props.className || ''}">
        <div class="status-header">
          <div class="status-indicator ${statusClass}">
            <span class="status-dot"></span>
            <span class="status-text">${this.getStatusText(status)}</span>
          </div>
          <div class="last-update">
            Updated: ${this.formatTime(lastUpdate)}
          </div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">CPU</span>
            <div class="metric-bar">
              <div class="metric-fill" style="width: ${metrics.cpu}%"></div>
            </div>
            <span class="metric-value">${metrics.cpu}%</span>
          </div>
          
          <div class="metric-item">
            <span class="metric-label">Memory</span>
            <div class="metric-bar">
              <div class="metric-fill" style="width: ${metrics.memory}%"></div>
            </div>
            <span class="metric-value">${metrics.memory}%</span>
          </div>
          
          <div class="metric-item">
            <span class="metric-label">Network</span>
            <div class="metric-bar">
              <div class="metric-fill" style="width: ${metrics.network}%"></div>
            </div>
            <span class="metric-value">${metrics.network}%</span>
          </div>
        </div>
      </div>
    `;
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'connecting': return 'Connecting...';
      default: return 'Unknown';
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString();
  }

  private startMetricsUpdate(): void {
    this.updateInterval = window.setInterval(() => {
      this.updateMetrics();
    }, 5000);
  }

  private updateMetrics(): void {
    // Simulate metrics update
    this.systemMetrics.metrics = {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      network: Math.random() * 100
    };
    this.systemMetrics.lastUpdate = new Date();
    this.render();
  }

  public render(): void {
    if (!this.element) return;
    this.element.innerHTML = this.createMarkup();
  }

  public updateStatus(status: 'online' | 'offline' | 'connecting'): void {
    this.systemMetrics.status = status;
    this.systemMetrics.lastUpdate = new Date();
    this.render();
  }

  public getMetrics() {
    return { ...this.systemMetrics.metrics };
  }

  public async destroy(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    await super.destroy();
  }
} 