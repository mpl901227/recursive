// ============================================
// 고도화된 로그 앱 - RightSidebar용
// ============================================

import { ComponentFactory } from '../../../utils/component-factory.ts';
import { eventManager } from '../../../core/EventManager.ts';
import { withStateManagement } from './AppStateManager.ts';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  source: string;
  message: string;
  details?: any;
}

export interface LogAppState {
  logs: LogEntry[];
  activeLevel: string;
  isConnected: boolean;
  lastSync: string;
  autoRefresh: boolean;
}

@withStateManagement('enhanced-log-app')
export class EnhancedLogApp {
  private container: HTMLElement;
  private state: LogAppState;
  private logsContainer: HTMLElement | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'enhanced-log-app p-4 h-full flex flex-col';
    
    this.state = {
      logs: [],
      activeLevel: 'all',
      isConnected: true,
      lastSync: new Date().toISOString(),
      autoRefresh: true
    };
  }

  render(): HTMLElement {
    this.container.innerHTML = '';
    
    const header = this.createHeader();
    this.container.appendChild(header);
    
    const levelFilter = this.createLevelFilter();
    this.container.appendChild(levelFilter);
    
    const logsList = this.createLogsList();
    this.container.appendChild(logsList);
    
    this.setupEventListeners();
    this.loadLogs();
    
    if (this.state.autoRefresh) {
      this.startAutoRefresh();
    }
    
    return this.container;
  }

  private createHeader(): HTMLElement {
    const header = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'sm',
      className: 'mb-4'
    });

    const headerBody = header.querySelector('.card__body')!;
    headerBody.innerHTML = `
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="text-xl">📊</span>
          <h3 class="text-lg font-semibold">System Logs</h3>
          <div class="connection-status ${this.state.isConnected ? 'connected' : 'disconnected'}">
            <span class="status-dot"></span>
            <span class="text-sm">${this.state.isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="auto-refresh-toggle btn btn--sm ${this.state.autoRefresh ? 'btn--primary' : 'btn--ghost'}" 
                  title="Auto Refresh">
            ${this.state.autoRefresh ? '⏸️' : '▶️'}
          </button>
          <button class="refresh-logs btn btn--sm">🔄 Refresh</button>
          <button class="clear-logs btn btn--sm btn--ghost">🗑️ Clear</button>
        </div>
      </div>
      
      <div class="mt-3 text-sm text-gray-600">
        <div class="flex justify-between">
          <span>Total Logs: <strong>${this.state.logs.length}</strong></span>
          <span>Last Sync: <strong>${this.formatTime(this.state.lastSync)}</strong></span>
        </div>
      </div>
    `;

    return header;
  }

  private createLevelFilter(): HTMLElement {
    const filterCard = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'sm',
      className: 'mb-4'
    });

    const levels = [
      { id: 'all', name: 'All', icon: '📁', color: 'gray' },
      { id: 'DEBUG', name: 'Debug', icon: '🔍', color: 'blue' },
      { id: 'INFO', name: 'Info', icon: 'ℹ️', color: 'green' },
      { id: 'WARN', name: 'Warning', icon: '⚠️', color: 'yellow' },
      { id: 'ERROR', name: 'Error', icon: '❌', color: 'red' },
      { id: 'FATAL', name: 'Fatal', icon: '💀', color: 'red' }
    ];

    const filterBody = filterCard.querySelector('.card__body')!;
    filterBody.innerHTML = `
      <div class="level-tabs flex gap-2 overflow-x-auto">
        ${levels.map(level => `
          <button class="level-tab btn btn--sm ${this.state.activeLevel === level.id ? 'btn--primary' : 'btn--ghost'}" 
                  data-level="${level.id}">
            ${level.icon} ${level.name}
          </button>
        `).join('')}
      </div>
    `;

    return filterCard;
  }

  private createLogsList(): HTMLElement {
    const logsCard = ComponentFactory.createCard({
      variant: 'elevated',
      padding: 'none',
      className: 'flex-1 overflow-hidden'
    });

    const logsBody = logsCard.querySelector('.card__body')!;
    logsBody.innerHTML = `
      <div class="logs-container h-full overflow-y-auto" id="logs-container">
        <div class="logs-list" id="logs-list">
          ${this.state.logs.length === 0 ? this.createEmptyState() : ''}
        </div>
      </div>
    `;

    this.logsContainer = logsBody.querySelector('#logs-list')!;
    return logsCard;
  }

  private createEmptyState(): string {
    return `
      <div class="empty-state text-center py-8 text-gray-500">
        <div class="text-4xl mb-4">📊</div>
        <h3 class="text-lg font-medium mb-2">No Logs Available</h3>
        <p class="text-sm">Logs will appear here when the system generates them.</p>
        <button class="btn btn--primary mt-4" id="refresh-logs">Refresh Logs</button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const refreshBtn = this.container.querySelector('.refresh-logs');
    refreshBtn?.addEventListener('click', () => this.loadLogs());

    const clearBtn = this.container.querySelector('.clear-logs');
    clearBtn?.addEventListener('click', () => this.clearLogs());

    const autoRefreshBtn = this.container.querySelector('.auto-refresh-toggle');
    autoRefreshBtn?.addEventListener('click', () => this.toggleAutoRefresh());

    const levelTabs = this.container.querySelectorAll('.level-tab');
    levelTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const level = (e.target as HTMLElement).dataset.level || 'all';
        this.setActiveLevel(level);
      });
    });

    this.container.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'refresh-logs') {
        this.loadLogs();
      }
    });
  }

  private async loadLogs(): Promise<void> {
    try {
      // 실제 환경에서는 로그 시스템과 연결
      const mockLogs: LogEntry[] = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          level: 'INFO',
          source: 'system',
          message: 'Application started successfully'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          level: 'WARN',
          source: 'memory',
          message: 'High memory usage detected: 85%'
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 120000).toISOString(),
          level: 'ERROR',
          source: 'network',
          message: 'Connection timeout to external service'
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 180000).toISOString(),
          level: 'DEBUG',
          source: 'database',
          message: 'Query executed in 45ms'
        }
      ];

      this.state.logs = mockLogs;
      this.state.lastSync = new Date().toISOString();
      this.updateLogsDisplay();
      
    } catch (error) {
      console.error('로그 로드 실패:', error);
      this.state.isConnected = false;
      this.render();
    }
  }

  private updateLogsDisplay(): void {
    if (!this.logsContainer) return;

    const filteredLogs = this.state.activeLevel === 'all'
      ? this.state.logs
      : this.state.logs.filter(log => log.level === this.state.activeLevel);

    this.logsContainer.innerHTML = filteredLogs.length === 0
      ? this.createEmptyState()
      : `
        <div class="divide-y divide-gray-200">
          ${filteredLogs.map(log => `
            <div class="log-entry p-3 hover:bg-gray-50 transition-colors">
              <div class="flex items-start gap-3">
                <div class="log-level-badge ${this.getLevelBadgeClass(log.level)}">
                  ${this.getLevelIcon(log.level)}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-gray-900">${log.source}</span>
                    <span class="text-xs text-gray-500">${this.formatRelativeTime(log.timestamp)}</span>
                  </div>
                  <p class="text-sm text-gray-700 break-words">${log.message}</p>
                  ${log.details ? `
                    <details class="mt-2">
                      <summary class="text-xs text-gray-500 cursor-pointer">Show details</summary>
                      <pre class="text-xs text-gray-600 mt-1 bg-gray-100 p-2 rounded overflow-x-auto">${JSON.stringify(log.details, null, 2)}</pre>
                    </details>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
  }

  private getLevelBadgeClass(level: string): string {
    const classes = {
      'DEBUG': 'bg-blue-100 text-blue-800',
      'INFO': 'bg-green-100 text-green-800',
      'WARN': 'bg-yellow-100 text-yellow-800',
      'ERROR': 'bg-red-100 text-red-800',
      'FATAL': 'bg-red-200 text-red-900'
    };
    return `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${classes[level as keyof typeof classes] || 'bg-gray-100 text-gray-800'}`;
  }

  private getLevelIcon(level: string): string {
    const icons = {
      'DEBUG': '🔍',
      'INFO': 'ℹ️',
      'WARN': '⚠️',
      'ERROR': '❌',
      'FATAL': '💀'
    };
    return icons[level as keyof typeof icons] || '📝';
  }

  private setActiveLevel(level: string): void {
    this.state.activeLevel = level;
    this.updateLogsDisplay();
    this.render(); // Re-render to update active tab
  }

  private clearLogs(): void {
    this.state.logs = [];
    this.updateLogsDisplay();
  }

  private toggleAutoRefresh(): void {
    this.state.autoRefresh = !this.state.autoRefresh;
    
    if (this.state.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
    
    this.render(); // Re-render to update button state
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh(); // Clear existing interval
    this.refreshInterval = setInterval(() => {
      this.loadLogs();
    }, 5000); // Refresh every 5 seconds
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private formatTime(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  private formatRelativeTime(isoString: string): string {
    const now = Date.now();
    const timestamp = new Date(isoString).getTime();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  onStateRestored(state: LogAppState): void {
    this.state = state;
    this.updateLogsDisplay();
  }

  destroy(): void {
    this.stopAutoRefresh();
    this.container.remove();
  }
} 