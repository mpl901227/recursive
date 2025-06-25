/**
 * @fileoverview Log System MCP Tools
 * @description MCP 도구를 통한 로그 시스템 UI 제어
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 3.3 구현
 */

import type { EventManager } from '../../core/events.js';
import type { Application } from '../../core/app.js';
import type { 
  LogEntry, 
  LogFilter, 
  LogSystemService,
  TimeRange
} from '../../types/log-system.js';

/**
 * MCP 도구 정의 타입
 */
export interface MCPLogTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: Record<string, any>) => Promise<any>;
}

/**
 * UI 네비게이션 타입
 */
export type UIRoute = 
  | '/logs/dashboard'
  | '/logs/viewer' 
  | '/logs/search'
  | '/logs/analysis';

/**
 * 로그 시스템 MCP 도구 클래스
 */
export class LogMCPTools {
  private application: Application;
  private eventManager: EventManager;
  private logSystemService: LogSystemService | null = null;

  constructor(application: Application, eventManager: EventManager) {
    this.application = application;
    this.eventManager = eventManager;
    this.initializeLogSystemService();
  }

  /**
   * LogSystemService 초기화
   */
  private async initializeLogSystemService(): Promise<void> {
    try {
      this.logSystemService = this.application.getService<LogSystemService>('log-system') || null;
      if (!this.logSystemService) {
        console.warn('[LogMCPTools] LogSystemService not found');
      }
    } catch (error) {
      console.error('[LogMCPTools] Failed to initialize LogSystemService:', error);
      this.logSystemService = null;
    }
  }

  /**
   * 모든 MCP 도구 정의 반환
   */
  getTools(): MCPLogTool[] {
    return [
      this.getShowRecentErrorsTool(),
      this.getOpenLogSearchTool(),
      this.getJumpToTraceTool(),
      this.getCreateLogDashboardTool()
    ];
  }

  /**
   * 최근 에러 표시 도구
   */
  private getShowRecentErrorsTool(): MCPLogTool {
    return {
      name: 'show_recent_errors',
      description: 'Show recent error logs in the UI and navigate to error dashboard',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of recent errors to show (default: 10)',
            minimum: 1,
            maximum: 100
          },
          timeRange: {
            type: 'string',
            description: 'Time range for errors (1h, 6h, 24h, 7d)',
            enum: ['1h', '6h', '24h', '7d']
          }
        }
      },
      handler: this.handleShowRecentErrors.bind(this)
    };
  }

  /**
   * 로그 검색 열기 도구
   */
  private getOpenLogSearchTool(): MCPLogTool {
    return {
      name: 'open_log_search',
      description: 'Open log search interface with optional pre-filled query',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Pre-filled search query'
          },
          filters: {
            type: 'object',
            description: 'Pre-applied filters'
          }
        }
      },
      handler: this.handleOpenLogSearch.bind(this)
    };
  }

  /**
   * 트레이스 ID로 이동 도구
   */
  private getJumpToTraceTool(): MCPLogTool {
    return {
      name: 'jump_to_trace',
      description: 'Navigate to logs with specific trace ID',
      inputSchema: {
        type: 'object',
        properties: {
          traceId: {
            type: 'string',
            description: 'Trace ID to search for',
            minLength: 1
          }
        },
        required: ['traceId']
      },
      handler: this.handleJumpToTrace.bind(this)
    };
  }

  /**
   * 로그 대시보드 생성 도구
   */
  private getCreateLogDashboardTool(): MCPLogTool {
    return {
      name: 'create_log_dashboard',
      description: 'Create or navigate to log dashboard with specific configuration',
      inputSchema: {
        type: 'object',
        properties: {
          widgets: {
            type: 'array',
            description: 'Widgets to include in dashboard',
            items: {
              type: 'string',
              enum: ['system-status', 'error-chart', 'recent-errors', 'log-stream']
            }
          }
        }
      },
      handler: this.handleCreateLogDashboard.bind(this)
    };
  }

  // 핸들러 구현
  private async handleShowRecentErrors(args: any): Promise<any> {
    const { count = 10, timeRange = '24h' } = args;
    
    try {
      await this.navigateToRoute('/logs/dashboard');
      
      this.eventManager.emit('log-dashboard:show-errors', {
        type: 'log-dashboard:show-errors',
        timestamp: Date.now(),
        source: 'mcp-tools',
        payload: { count, timeRange }
      });

      return {
        success: true,
        message: `Showing ${count} recent errors from ${timeRange}`,
        ui_action: 'navigated_to_dashboard'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to show recent errors: ${error}`
      };
    }
  }

  private async handleOpenLogSearch(args: any): Promise<any> {
    const { query = '', filters = {} } = args;
    
    try {
      await this.navigateToRoute('/logs/search');
      
      this.eventManager.emit('log-search:set-query', {
        type: 'log-search:set-query',
        timestamp: Date.now(),
        source: 'mcp-tools',
        payload: { query, filters }
      });

      return {
        success: true,
        message: 'Log search opened',
        ui_action: 'navigated_to_search'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open log search: ${error}`
      };
    }
  }

  private async handleJumpToTrace(args: any): Promise<any> {
    const { traceId } = args;
    
    try {
      await this.navigateToRoute('/logs/viewer');
      
      this.eventManager.emit('log-viewer:jump-to-trace', {
        type: 'log-viewer:jump-to-trace',
        timestamp: Date.now(),
        source: 'mcp-tools',
        payload: { traceId }
      });

      return {
        success: true,
        message: `Jumped to trace ${traceId}`,
        ui_action: 'navigated_to_viewer'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to jump to trace: ${error}`
      };
    }
  }

  private async handleCreateLogDashboard(args: any): Promise<any> {
    const { widgets = ['system-status', 'error-chart', 'recent-errors'] } = args;
    
    try {
      await this.navigateToRoute('/logs/dashboard');
      
      this.eventManager.emit('log-dashboard:configure', {
        type: 'log-dashboard:configure',
        timestamp: Date.now(),
        source: 'mcp-tools',
        payload: { widgets }
      });

      return {
        success: true,
        message: 'Log dashboard configured',
        ui_action: 'navigated_to_dashboard'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create dashboard: ${error}`
      };
    }
  }

  private async navigateToRoute(route: UIRoute): Promise<void> {
    const router = (this.application as any).router;
    if (router && typeof router.push === 'function') {
      await router.push(route);
    }
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    const tools = this.getTools();
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    return await tool.handler(args);
  }
}

export function createLogMCPTools(
  application: Application, 
  eventManager: EventManager
): LogMCPTools {
  return new LogMCPTools(application, eventManager);
} 