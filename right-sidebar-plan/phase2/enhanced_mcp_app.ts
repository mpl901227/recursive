// ============================================
// 고도화된 MCP 앱 - RightSidebar용
// ============================================

import { ComponentFactory } from '../../utils/component-factory.js';
import { eventManager } from '../../core/EventManager.js';

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
    
    // 헤더 및 상태
    const header = this.createHeader();
    this.container.appendChild(header);
    
    // 카테고리 필터
    const categoryFilter = this.createCategoryFilter();
    this.container.appendChild(categoryFilter);
    
    // 도구 목록
    const toolsList = this.createToolsList();
    this.container.appendChild(toolsList);
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
    
    // 초기 도구 로드
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
    // 새로고침
    const refreshBtn = this.container.querySelector('.refresh-tools');
    refreshBtn?.addEventListener('click', () => this.syncTools());

    // 설정
    const settingsBtn = this.container.querySelector('.settings-tools');
    settingsBtn?.addEventListener('click', () => this.openSettings());

    // 카테고리 필터
    const categoryTabs = this.container.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const category = (e.target as HTMLElement).dataset.category || 'all';
        this.setActiveCategory(category);
      });
    });

    // MCP 연결 (빈 상태에서)
    this.container.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'connect-mcp') {
        this.connectToMCP();
      }
    });
  }

  private loadMCPTools(): void {
    // 실제 환경에서는 MCP 서버에서 도구 목록을 가져옴
    const mockTools: MCPTool[] = [
      {
        id: 'log-analyzer',
        name: 'Log Analyzer',
        description: 'Analyze system logs for patterns and anomalies',
        icon: '📊',
        category: 'analysis',
        status: 'available',
        lastUsed: new Date(Date.now() - 1000 * 60 * 30).toISOString()
      },
      {
        id: 'health-checker',
        name: 'System Health Check',
        description: 'Comprehensive system health diagnostics',
        icon: '🏥',
        category: 'diagnostic',
        status: 'available'
      },
      {
        id: 'performance-monitor',
        name: 'Performance Monitor',
        description: 'Real-time system performance monitoring',
        icon: '📈',
        category: 'monitoring',
        status: 'running',
        lastUsed: new Date(Date.now() - 1000 * 60 * 5).toISOString()
      },
      {
        id: 'memory-profiler',
        name: 'Memory Profiler',
        description: 'Profile memory usage and detect leaks',
        icon: '🧠',
        category: 'diagnostic',
        status: 'available'
      },
      {
        id: 'network-tracer',
        name: 'Network Tracer',
        description: 'Trace network requests and connections',
        icon: '🌐',
        category: 'monitoring',
        status: 'error',
        lastUsed: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      },
      {
        id: 'config-validator',
        name: 'Config Validator',
        description: 'Validate system configuration files',
        icon: '✅',
        category: 'utility',
        status: 'available'
      },
      {
        id: 'dependency-scanner',
        name: 'Dependency Scanner',
        description: 'Scan for outdated or vulnerable dependencies',
        icon: '🔍',
        category: 'analysis',
        status: 'available'
      },
      {
        id: 'backup-manager',
        name: 'Backup Manager',
        description: 'Manage system backups and recovery',
        icon: '💾',
        category: 'utility',
        status: 'available',
        lastUsed: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      },
      {
        id: 'security-audit',
        name: 'Security Auditor',
        description: 'Perform security audits and vulnerability checks',
        icon: '🔒',
        category: 'analysis',
        status: 'available'
      },
      {
        id: 'disk-cleaner',
        name: 'Disk Cleaner',
        description: 'Clean up disk space and temporary files',
        icon: '🧹',
        category: 'utility',
        status: 'available'
      }
    ];

    this.state.tools = mockTools;
    this.updateToolsDisplay();
    this.updateStatusInfo();
  }

  private updateToolsDisplay(): void {
    if (!this.toolsContainer) return;

    const filteredTools = this.getFilteredTools();
    
    if (filteredTools.length === 0) {
      this.toolsContainer.innerHTML = this.createEmptyState();
      return;
    }

    this.toolsContainer.innerHTML = `
      <div class="tools-grid grid gap-3 p-3">
        ${filteredTools.map(tool => this.createToolCard(tool)).join('')}
      </div>
    `;

    // 도구 카드 클릭 이벤트
    this.toolsContainer.querySelectorAll('.tool-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const toolId = (e.currentTarget as HTMLElement).dataset.toolId;
        if (toolId) {
          this.runTool(toolId);
        }
      });
    });
  }

  private createToolCard(tool: MCPTool): string {
    const statusClass = `status-${tool.status}`;
    const statusIcon = this.getStatusIcon(tool.status);
    
    return `
      <div class="tool-card ${statusClass} border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow" 
           data-tool-id="${tool.id}">
        <div class="tool-header flex justify-between items-start mb-2">
          <div class="tool-icon text-2xl">${tool.icon}</div>
          <div class="tool-status flex items-center gap-1">
            <span class="status-indicator">${statusIcon}</span>
            <span class="status-text text-xs capitalize">${tool.status}</span>
          </div>
        