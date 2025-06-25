// ============================================
// 고도화된 MCP 앱 - RightSidebar용
// ============================================

import { ComponentFactory } from '../../../utils/component-factory.ts';
import { eventManager } from '../../../core/EventManager.ts';
import { withStateManagement } from './AppStateManager.ts';

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'analysis' | 'diagnostic' | 'monitoring' | 'utility';
  status: 'available' | 'running' | 'error';
  lastUsed?: string;
  results?: any;
}

export interface MCPAppState {
  tools: MCPTool[];
  activeCategory: string;
  isConnected: boolean;
  lastSync: string;
}

@withStateManagement('enhanced-mcp-app')
export class EnhancedMCPApp {
  private container: HTMLElement;
  private state: MCPAppState;
  private toolsContainer: HTMLElement | null = null;
  private statusContainer: HTMLElement | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'enhanced-mcp-app p-4 h-full flex flex-col';
    
    this.state = {
      tools: [],
      activeCategory: 'all',
      isConnected: true,
      lastSync: new Date().toISOString()
    };
  }

  render(): HTMLElement {
    this.container.innerHTML = '';
    
    const header = this.createHeader();
    this.container.appendChild(header);
    
    const categoryFilter = this.createCategoryFilter();
    this.container.appendChild(categoryFilter);
    
    const toolsList = this.createToolsList();
    this.container.appendChild(toolsList);
    
    this.setupEventListeners();
    this.loadMCPTools();
    
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
          <span class="text-xl">🔧</span>
          <h3 class="text-lg font-semibold">MCP Tools</h3>
          <div class="connection-status ${this.state.isConnected ? 'connected' : 'disconnected'}">
            <span class="status-dot"></span>
            <span class="text-sm">${this.state.isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="refresh-tools btn btn--sm">🔄 Sync</button>
          <button class="settings-tools btn btn--sm">⚙️ Settings</button>
        </div>
      </div>
      
      <div class="mt-3 text-sm text-gray-600" id="status-info">
        <div class="flex justify-between">
          <span>Tools Available: <strong>${this.state.tools.length}</strong></span>
          <span>Last Sync: <strong>${this.formatTime(this.state.lastSync)}</strong></span>
        </div>
      </div>
    `;

    this.statusContainer = headerBody.querySelector('#status-info')!;
    return header;
  }

  private createCategoryFilter(): HTMLElement {
    const filterCard = ComponentFactory.createCard({
      variant: 'flat',
      padding: 'sm',
      className: 'mb-4'
    });

    const categories = [
      { id: 'all', name: 'All Tools', icon: '📁' },
      { id: 'analysis', name: 'Analysis', icon: '📊' },
      { id: 'diagnostic', name: 'Diagnostic', icon: '🔍' },
      { id: 'monitoring', name: 'Monitoring', icon: '📈' },
      { id: 'utility', name: 'Utilities', icon: '🛠️' }
    ];

    const filterBody = filterCard.querySelector('.card__body')!;
    filterBody.innerHTML = `
      <div class="category-tabs flex gap-2 overflow-x-auto">
        ${categories.map(cat => `
          <button class="category-tab btn btn--sm ${this.state.activeCategory === cat.id ? 'btn--primary' : 'btn--ghost'}" 
                  data-category="${cat.id}">
            ${cat.icon} ${cat.name}
          </button>
        `).join('')}
      </div>
    `;

    return filterCard;
  }

  private createToolsList(): HTMLElement {
    const toolsCard = ComponentFactory.createCard({
      variant: 'elevated',
      padding: 'none',
      className: 'flex-1 overflow-hidden'
    });

    const toolsBody = toolsCard.querySelector('.card__body')!;
    toolsBody.innerHTML = `
      <div class="tools-container h-full overflow-y-auto" id="tools-container">
        <div class="tools-grid" id="tools-grid">
          ${this.state.tools.length === 0 ? this.createEmptyState() : ''}
        </div>
      </div>
    `;

    this.toolsContainer = toolsBody.querySelector('#tools-grid')!;
    return toolsCard;
  }

  private createEmptyState(): string {
    return `
      <div class="empty-state text-center py-8 text-gray-500">
        <div class="text-4xl mb-4">🔧</div>
        <h3 class="text-lg font-medium mb-2">No MCP Tools Available</h3>
        <p class="text-sm">Connect to MCP servers to see available tools.</p>
        <button class="btn btn--primary mt-4" id="connect-mcp">Connect to MCP</button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const refreshBtn = this.container.querySelector('.refresh-tools');
    refreshBtn?.addEventListener('click', () => this.syncTools());

    const settingsBtn = this.container.querySelector('.settings-tools');
    settingsBtn?.addEventListener('click', () => this.openSettings());

    const categoryTabs = this.container.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const category = (e.target as HTMLElement).dataset.category || 'all';
        this.setActiveCategory(category);
      });
    });

    this.container.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'connect-mcp') {
        this.connectToMCP();
      }
    });
  }

  private async loadMCPTools(): Promise<void> {
    const mockTools: MCPTool[] = [
      {
        id: 'log-analyzer',
        name: 'Log Analyzer',
        description: 'Analyze system logs for patterns and anomalies',
        icon: '📊',
        category: 'analysis',
        status: 'available'
      },
      {
        id: 'system-monitor',
        name: 'System Monitor',
        description: 'Real-time system performance monitoring',
        icon: '📈',
        category: 'monitoring',
        status: 'available'
      },
      {
        id: 'error-diagnostic',
        name: 'Error Diagnostic',
        description: 'Diagnose and troubleshoot system errors',
        icon: '🔍',
        category: 'diagnostic',
        status: 'available'
      }
    ];

    this.state.tools = mockTools;
    this.state.lastSync = new Date().toISOString();
    this.updateToolsDisplay();
  }

  private updateToolsDisplay(): void {
    if (!this.toolsContainer) return;

    const filteredTools = this.state.activeCategory === 'all'
      ? this.state.tools
      : this.state.tools.filter(tool => tool.category === this.state.activeCategory);

    this.toolsContainer.innerHTML = filteredTools.length === 0
      ? this.createEmptyState()
      : `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          ${filteredTools.map(tool => `
            <div class="tool-card" data-tool-id="${tool.id}">
              <div class="flex items-start p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div class="text-2xl mr-3">${tool.icon}</div>
                <div class="flex-1">
                  <h4 class="font-medium mb-1">${tool.name}</h4>
                  <p class="text-sm text-gray-600 mb-2">${tool.description}</p>
                  <div class="flex items-center justify-between">
                    <span class="text-xs px-2 py-1 rounded ${
                      tool.status === 'available' ? 'bg-green-100 text-green-800' :
                      tool.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }">
                      ${tool.status.charAt(0).toUpperCase() + tool.status.slice(1)}
                    </span>
                    <button class="btn btn--sm btn--primary launch-tool" data-tool-id="${tool.id}">
                      Launch
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

    // 도구 실행 이벤트 리스너 추가
    this.toolsContainer.querySelectorAll('.launch-tool').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const toolId = (e.target as HTMLElement).dataset.toolId;
        if (toolId) this.launchTool(toolId);
      });
    });
  }

  private async launchTool(toolId: string): Promise<void> {
    const tool = this.state.tools.find(t => t.id === toolId);
    if (!tool) return;

    try {
      tool.status = 'running';
      this.updateToolsDisplay();

      // 실제 환경에서는 MCP 서버와 통신
      await new Promise(resolve => setTimeout(resolve, 1000));

      eventManager.emit('mcp:tool:launched' as any, { toolId, tool });
      
      tool.lastUsed = new Date().toISOString();
      tool.status = 'available';
      
    } catch (error) {
      console.error(`도구 실행 실패: ${toolId}`, error);
      tool.status = 'error';
      
    } finally {
      this.updateToolsDisplay();
    }
  }

  private async syncTools(): Promise<void> {
    try {
      // 실제 환경에서는 MCP 서버와 동기화
      await this.loadMCPTools();
      
    } catch (error) {
      console.error('도구 동기화 실패:', error);
      this.state.isConnected = false;
      this.render();
    }
  }

  private setActiveCategory(category: string): void {
    this.state.activeCategory = category;
    this.updateToolsDisplay();
  }

  private async connectToMCP(): Promise<void> {
    try {
      // 실제 환경에서는 MCP 서버 연결
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.state.isConnected = true;
      await this.loadMCPTools();
      
    } catch (error) {
      console.error('MCP 연결 실패:', error);
      this.state.isConnected = false;
      this.render();
    }
  }

  private openSettings(): void {
    // 설정 모달 구현
  }

  private formatTime(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  onStateRestored(state: MCPAppState): void {
    this.state = state;
    this.updateToolsDisplay();
  }

  destroy(): void {
    // 이벤트 리스너 정리
    this.container.remove();
  }
} 