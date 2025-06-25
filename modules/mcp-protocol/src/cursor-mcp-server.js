#!/usr/bin/env node

/**
 * Cursor MCP Server - stdio 기반 MCP 서버
 * Cursor IDE에서 직접 사용할 수 있는 MCP 서버
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

class CursorMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'recursive-log-system',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.activeSessions = new Map();
    this.setupHandlers();
  }

  setupHandlers() {
    // 도구 목록 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'interactive_diagnosis',
            description: '대화형 프로젝트 진단 및 워크플로우 추천 도구',
            inputSchema: {
              type: 'object',
              properties: {
                initial_input: {
                  type: 'string',
                  description: '초기 프로젝트 요구사항이나 문제 설명'
                },
                model: {
                  type: 'string',
                  description: '사용할 AI 모델 (claude-3.5-sonnet, gpt-4 등)',
                  default: 'claude-3.5-sonnet'
                },
                complexity_mode: {
                  type: 'string',
                  enum: ['simple', 'detailed', 'comprehensive'],
                  description: '진단 복잡도 모드',
                  default: 'simple'
                },
                mode: {
                  type: 'string',
                  enum: ['kickoff', 'analysis', 'troubleshooting'],
                  description: '진단 모드',
                  default: 'kickoff'
                }
              },
              required: ['initial_input']
            }
          },
          {
            name: 'complexity_analysis',
            description: '프로젝트 복잡도 분석',
            inputSchema: {
              type: 'object',
              properties: {
                project_description: {
                  type: 'string',
                  description: '프로젝트 설명'
                }
              },
              required: ['project_description']
            }
          },
          {
            name: 'workflow_recommendation',
            description: '워크플로우 추천',
            inputSchema: {
              type: 'object',
              properties: {
                project_type: {
                  type: 'string',
                  description: '프로젝트 유형'
                },
                complexity_level: {
                  type: 'string',
                  description: '복잡도 수준'
                }
              },
              required: ['project_type', 'complexity_level']
            }
          },
          {
            name: 'show_recent_errors',
            description: '최근 에러 로그 표시',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: '표시할 에러 개수 (기본값: 10)',
                  minimum: 1,
                  maximum: 100
                },
                timeRange: {
                  type: 'string',
                  description: '시간 범위 (1h, 6h, 24h, 7d)',
                  enum: ['1h', '6h', '24h', '7d']
                }
              }
            }
          },
          {
            name: 'get_recent_errors',
            description: '최근 에러 로그 조회 및 분석 (분 단위 시간 지정)',
            inputSchema: {
              type: 'object',
              properties: {
                minutes: {
                  type: 'number',
                  description: '조회할 시간 범위 (분, 기본값: 30)',
                  minimum: 1,
                  maximum: 1440
                },
                sources: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '특정 소스만 조회 (예: ["mcp_calls", "http_traffic"])'
                },
                limit: {
                  type: 'number',
                  description: '최대 조회할 에러 수 (기본값: 100)',
                  minimum: 1,
                  maximum: 500
                }
              }
            }
          },
          {
            name: 'get_recent_logs',
            description: '최근 로그 조회 (모든 레벨 - INFO, WARN, ERROR 등)',
            inputSchema: {
              type: 'object',
              properties: {
                minutes: {
                  type: 'number',
                  description: '조회할 시간 범위 (분, 기본값: 30)',
                  minimum: 1,
                  maximum: 1440
                },
                limit: {
                  type: 'number',
                  description: '최대 조회할 로그 수 (기본값: 50)',
                  minimum: 1,
                  maximum: 200
                },
                levels: {
                  type: 'array',
                  items: { 
                    type: 'string',
                    enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
                  },
                  description: '필터링할 로그 레벨 (예: ["INFO", "WARN", "ERROR"])'
                },
                sources: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '필터링할 소스 (예: ["mcp_calls", "http_traffic"])'
                }
              }
            }
          },
          {
            name: 'open_log_search',
            description: '로그 검색 인터페이스 열기',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '미리 입력할 검색 쿼리'
                },
                filters: {
                  type: 'object',
                  description: '미리 적용할 필터'
                }
              }
            }
          },
          {
            name: 'jump_to_trace',
            description: '특정 트레이스 ID로 이동',
            inputSchema: {
              type: 'object',
              properties: {
                traceId: {
                  type: 'string',
                  description: '검색할 트레이스 ID',
                  minLength: 1
                }
              },
              required: ['traceId']
            }
          },
          {
            name: 'create_log_dashboard',
            description: '로그 대시보드 생성',
            inputSchema: {
              type: 'object',
              properties: {
                widgets: {
                  type: 'array',
                  description: '대시보드에 포함할 위젯',
                  items: {
                    type: 'string',
                    enum: ['system-status', 'error-chart', 'recent-errors', 'log-stream']
                  }
                }
              }
            }
          },
          {
            name: 'analyze_ui_screenshot',
            description: 'UI 스크린샷을 촬영하고 LLM으로 분석하여 UI 요소 정보 제공',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '분석하고 싶은 UI 요소나 질문 (예: "toolbar의 높이는?", "버튼 위치는?", "색상은?")'
                },
                url: {
                  type: 'string',
                  description: '스크린샷을 찍을 URL',
                  default: 'http://localhost:3001'
                },
                action: {
                  type: 'string',
                  description: '분석 유형',
                  enum: ['screenshot', 'element', 'measure', 'interact'],
                  default: 'screenshot'
                },
                selector: {
                  type: 'string',
                  description: '특정 요소만 캡처할 CSS 셀렉터 (선택사항)'
                },
                wait_for: {
                  type: 'string',
                  description: '대기할 셀렉터 (선택사항)'
                },
                full_page: {
                  type: 'boolean',
                  description: '전체 페이지 스크린샷 여부',
                  default: false
                },
                model: {
                  type: 'string',
                  description: '사용할 LLM 모델',
                  enum: ['claude-3-5-sonnet-20241022', 'gpt-4o', 'gpt-4o-mini'],
                  default: 'claude-3-5-sonnet-20241022'
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    // 도구 호출 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      console.error(`🔧 Tool called: ${name}`); // stderr로 로그 출력
      
      try {
        let result;
        
        switch (name) {
          case 'interactive_diagnosis':
            result = await this.handleInteractiveDiagnosis(args);
            break;
          case 'complexity_analysis':
            result = await this.handleComplexityAnalysis(args);
            break;
          case 'workflow_recommendation':
            result = await this.handleWorkflowRecommendation(args);
            break;
          case 'show_recent_errors':
            result = await this.handleShowRecentErrors(args);
            break;
          case 'get_recent_errors':
            result = await this.handleGetRecentErrors(args);
            break;
          case 'get_recent_logs':
            result = await this.handleGetRecentLogs(args);
            break;
          case 'open_log_search':
            result = await this.handleOpenLogSearch(args);
            break;
          case 'jump_to_trace':
            result = await this.handleJumpToTrace(args);
            break;
          case 'create_log_dashboard':
            result = await this.handleCreateLogDashboard(args);
            break;
          case 'analyze_ui_screenshot':
            result = await this.handleAnalyzeUIScreenshot(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`Tool execution error (${name}):`, error);
        throw error;
      }
    });
  }

  // 도구 구현 메서드들
  async handleInteractiveDiagnosis(args) {
    const { initial_input, model = 'claude-3.5-sonnet', complexity_mode = 'simple', mode = 'kickoff' } = args;
    
    if (!initial_input) {
      throw new Error('initial_input is required');
    }
    
    const sessionId = this.generateSessionId();
    const analysis = {
      session_id: sessionId,
      project_analysis: {
        description: initial_input,
        estimated_complexity: this.estimateComplexity(initial_input),
        recommended_approach: this.recommendApproach(initial_input),
        suggested_technologies: this.suggestTechnologies(initial_input)
      },
      next_steps: [
        '프로젝트 구조 설계',
        '기술 스택 선정',
        '개발 환경 구성',
        '초기 프로토타입 개발'
      ]
    };
    
    this.activeSessions.set(sessionId, {
      id: sessionId,
      status: 'active',
      createdAt: new Date().toISOString(),
      analysis: analysis
    });
    
    return analysis;
  }

  async handleComplexityAnalysis(args) {
    const { project_description } = args;
    
    if (!project_description) {
      throw new Error('project_description is required');
    }
    
    return {
      complexity_level: this.estimateComplexity(project_description),
      factors: [
        'Technology stack complexity',
        'Integration requirements',
        'Team size and experience',
        'Timeline constraints'
      ],
      estimated_duration: this.estimateDuration(project_description),
      recommended_team_size: this.recommendTeamSize(project_description),
      recommendations: [
        'Start with MVP approach',
        'Set up CI/CD pipeline early',
        'Plan regular code reviews',
        'Implement proper testing strategy'
      ]
    };
  }

  async handleWorkflowRecommendation(args) {
    const { project_type, complexity_level } = args;
    
    if (!project_type || !complexity_level) {
      throw new Error('project_type and complexity_level are required');
    }
    
    return {
      recommended_methodology: complexity_level === 'high' ? 'Agile Scrum' : 'Kanban',
      phases: [
        {
          name: 'Planning',
          duration: '1-2 weeks',
          activities: ['Requirements gathering', 'Architecture design', 'Task breakdown']
        },
        {
          name: 'Development',
          duration: '4-8 weeks',
          activities: ['Feature implementation', 'Testing', 'Code reviews']
        },
        {
          name: 'Deployment',
          duration: '1 week',
          activities: ['Production setup', 'Testing', 'Go-live']
        }
      ],
      tools: ['Git', 'Issue tracker', 'CI/CD pipeline'],
      team_structure: {
        recommended_size: this.recommendTeamSize(complexity_level),
        roles: ['Developer', 'DevOps', 'QA']
      }
    };
  }

  async handleShowRecentErrors(args) {
    const { count = 10, timeRange = '24h' } = args;
    
    try {
      // Python 로그 서버에서 에러 로그 조회
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 서버 사이드 에러 로그 조회
      const serverErrors = await client.call('query', {
        levels: ['ERROR', 'FATAL'],
        since: timeRange,
        limit: Math.ceil(count * 0.7)
      });
      
      // 클라이언트 사이드 에러 로그 조회 (client- 소스 필터)
      const clientErrors = await client.call('query', {
        levels: ['ERROR', 'WARN'],
        sources: ['client-ClientError', 'client-LogStreamService', 'client-LogDashboard'],
        since: timeRange,
        limit: Math.ceil(count * 0.3)
      });
      
      // 결과 통합
      const allErrors = [...(serverErrors.logs || []), ...(clientErrors.logs || [])]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, count);

      return {
        success: true,
        message: `최근 ${timeRange} 동안의 에러 ${allErrors.length}개를 조회했습니다.`,
        total_errors: allErrors.length,
        server_errors: serverErrors.logs?.length || 0,
        client_errors: clientErrors.logs?.length || 0,
        time_range: timeRange,
        errors: allErrors.map(log => ({
          timestamp: log.timestamp,
          level: log.level,
          source: log.source,
          message: log.message,
          type: log.source?.startsWith('client-') ? '🌐 Client' : '🖥️ Server',
          trace_id: log.trace_id,
          metadata: log.metadata
        }))
      };

    } catch (error) {
      console.error('Error showing recent errors:', error);
    return {
        success: false,
        message: `로그 서버 연결 실패: ${error.message}`,
        error: error.message,
        fallback_data: {
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Log server connection failed',
          trace_id: 'fallback-error'
        },
        parameters: { count, timeRange }
      };
    }
  }

  async handleGetRecentErrors(args) {
    const { minutes = 30, sources = null, limit = 100 } = args;
    
    try {
      // Python 로그 서버에서 에러 로그 조회
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 시간 범위 계산 (분을 시간으로 변환)
      const timeRange = minutes < 60 ? `${minutes}m` : 
                       minutes < 1440 ? `${Math.floor(minutes/60)}h` : 
                       `${Math.floor(minutes/1440)}d`;
      
      // 에러 로그 조회 파라미터 구성
      const queryParams = {
        levels: ['ERROR', 'FATAL'],
        since: timeRange,
        limit: limit
      };
      
      // 소스 필터가 있으면 추가
      if (sources && sources.length > 0) {
        queryParams.sources = sources;
      }
      
      // 로그 조회
      const result = await client.call('query', queryParams);
      const errors = result.logs || [];
      
      // 에러 분석
      const errorSources = {};
      const errorTypes = {};
      
      errors.forEach(log => {
        // 소스별 카운트
        const source = log.source || 'unknown';
        errorSources[source] = (errorSources[source] || 0) + 1;
        
        // 에러 타입별 카운트
        const errorType = log.metadata?.error?.name || log.metadata?.error_type || 'UnknownError';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      });
      
      // 권장사항 생성
      const recommendations = [];
      if (errors.length > 10) {
        recommendations.push(`${minutes}분간 ${errors.length}개 에러 발생. 긴급 조치가 필요합니다.`);
      }
      
      const mostCommonSource = Object.entries(errorSources).sort(([,a], [,b]) => b - a)[0];
      if (mostCommonSource && mostCommonSource[1] > errors.length * 0.5) {
        recommendations.push(`'${mostCommonSource[0]}' 소스에서 에러가 집중되고 있습니다.`);
      }
      
      return {
        success: true,
        count: errors.length,
        timerange_minutes: minutes,
        analysis: {
          total_errors: errors.length,
          timerange_minutes: minutes,
          error_by_source: Object.fromEntries(
            Object.entries(errorSources).sort(([,a], [,b]) => b - a).slice(0, 5)
          ),
          error_by_type: Object.fromEntries(
            Object.entries(errorTypes).sort(([,a], [,b]) => b - a).slice(0, 5)
          ),
          most_recent: errors[0] || null,
          recommendations: recommendations
        },
        errors: errors.map(log => ({
          timestamp: log.timestamp,
          source: log.source,
          level: log.level,
          message: log.message,
          error_type: log.metadata?.error?.name || log.metadata?.error_type || 'UnknownError',
          trace_id: log.trace_id,
          metadata: log.metadata
        }))
      };

    } catch (error) {
      console.error('Error getting recent errors:', error);
      return {
        success: false,
        error: `Failed to get recent errors: ${error.message}`,
        count: 0,
        parameters: { minutes, sources, limit }
      };
    }
  }

  async handleGetRecentLogs(args) {
    const { minutes = 30, levels = null, sources = null, limit = 100 } = args;
    
    try {
      // Python 로그 서버에서 로그 조회
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 시간 범위 계산 (분을 시간으로 변환)
      const timeRange = minutes < 60 ? `${minutes}m` : 
                       minutes < 1440 ? `${Math.floor(minutes/60)}h` : 
                       `${Math.floor(minutes/1440)}d`;
      
      // 로그 조회 파라미터 구성
      const queryParams = {
        since: timeRange,
        limit: limit
      };
      
      // 레벨 필터가 있으면 추가
      if (levels && levels.length > 0) {
        queryParams.levels = levels;
      }
      
      // 소스 필터가 있으면 추가
      if (sources && sources.length > 0) {
        queryParams.sources = sources;
      }
      
      // 로그 조회
      const result = await client.call('query', queryParams);
      const logs = result.logs || [];
      
      // 로그 분석
      const logSources = {};
      const logLevels = {};
      
      logs.forEach(log => {
        // 소스별 카운트
        const source = log.source || 'unknown';
        logSources[source] = (logSources[source] || 0) + 1;
        
        // 레벨별 카운트
        const level = log.level || 'UNKNOWN';
        logLevels[level] = (logLevels[level] || 0) + 1;
      });
      
      // 최근 활동 분석
      const recentActivity = [];
      if (logs.length > 0) {
        const now = new Date();
        const recent = logs.filter(log => {
          const logTime = new Date(log.timestamp);
          return (now - logTime) < 5 * 60 * 1000; // 최근 5분
        });
        
        if (recent.length > 0) {
          recentActivity.push(`최근 5분간 ${recent.length}개 로그 활동`);
        }
      }
      
      return {
        success: true,
        count: logs.length,
        timerange_minutes: minutes,
        analysis: {
          total_logs: logs.length,
          timerange_minutes: minutes,
          logs_by_source: Object.fromEntries(
            Object.entries(logSources).sort(([,a], [,b]) => b - a).slice(0, 10)
          ),
          logs_by_level: Object.fromEntries(
            Object.entries(logLevels).sort(([,a], [,b]) => b - a)
          ),
          most_recent: logs[0] || null,
          recent_activity: recentActivity
        },
        logs: logs.map(log => ({
          timestamp: log.timestamp,
          source: log.source,
          level: log.level,
          message: log.message,
          trace_id: log.trace_id,
          metadata: log.metadata
        }))
      };

    } catch (error) {
      console.error('Error getting recent logs:', error);
      return {
        success: false,
        error: `Failed to get recent logs: ${error.message}`,
        count: 0,
        parameters: { minutes, levels, sources, limit }
      };
    }
  }

  async handleOpenLogSearch(args) {
    const { query = '', filters = {} } = args;
    
    try {
      // 로그 시스템 상태 확인
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 간단한 상태 확인 쿼리
      const statusCheck = await client.call('query', {
        limit: 1
      });
    
    return {
        success: true,
      message: '로그 검색 인터페이스를 열었습니다.',
      search_params: {
        query,
        filters,
          timestamp: new Date().toISOString(),
          log_system_status: 'connected',
          available_logs: statusCheck.count || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        message: '로그 검색 인터페이스를 열었습니다 (오프라인 모드).',
        search_params: {
          query,
          filters,
          timestamp: new Date().toISOString(),
          log_system_status: 'disconnected',
          error: error.message
      }
    };
    }
  }

  async handleJumpToTrace(args) {
    const { traceId } = args;
    
    try {
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 특정 트레이스 ID로 로그 검색
      const traceResults = await client.call('query', {
        trace_ids: [traceId],
        limit: 100
      });
    
    return {
        success: true,
      message: `트레이스 ID ${traceId}로 이동했습니다.`,
      trace_info: {
        id: traceId,
          found: traceResults.logs && traceResults.logs.length > 0,
          log_count: traceResults.logs?.length || 0,
          timestamp: new Date().toISOString(),
          logs: traceResults.logs?.slice(0, 10) || []
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `트레이스 ID ${traceId} 검색 중 오류가 발생했습니다.`,
        trace_info: {
          id: traceId,
          found: false,
          error: error.message,
        timestamp: new Date().toISOString()
      }
    };
    }
  }

  async handleCreateLogDashboard(args) {
    const { widgets = ['system-status', 'error-chart', 'recent-errors'] } = args;
    
    try {
      const JSONRPCClient = require('../../../core/shared/src/utils/JSONRPCClient.js');
      const client = new JSONRPCClient('http://localhost:8888/rpc');
      
      // 대시보드용 기본 데이터 수집
      const [recentLogs, errorLogs] = await Promise.all([
        client.call('query', { limit: 50 }),
        client.call('query', { levels: ['ERROR', 'FATAL'], limit: 20 })
      ]);
    
    return {
        success: true,
      message: '로그 대시보드를 생성했습니다.',
      dashboard_config: {
        widgets,
        created_at: new Date().toISOString(),
          dashboard_id: `dashboard-${Date.now()}`,
          data_summary: {
            total_logs: recentLogs.count || 0,
            recent_errors: errorLogs.count || 0,
            log_system_status: 'connected'
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: '로그 대시보드를 생성했습니다 (제한된 모드).',
        dashboard_config: {
          widgets,
          created_at: new Date().toISOString(),
          dashboard_id: `dashboard-${Date.now()}`,
          data_summary: {
            log_system_status: 'disconnected',
            error: error.message
          }
      }
    };
    }
  }

  async handleAnalyzeUIScreenshot(args) {
    const { 
      query, 
      url = 'http://localhost:3001',
      action = 'screenshot',
      selector,
      wait_for,
      full_page = false,
      model = 'claude-3-5-sonnet-20241022'
    } = args;
    
    if (!query) {
      throw new Error('Query parameter is required');
    }
    
    try {
      console.error(`🖼️ UI 분석 요청: ${query}`);
      
      // Python UI 분석 서버로 요청 전송
      const axios = require('axios');
      
      const analysisParams = {
        query,
        url,
        action,
        selector,
        wait_for,
        full_page,
        model,
        trace_id: this.generateSessionId()
      };
      
      const response = await axios.post('http://localhost:8888/api/ui-analysis', analysisParams, {
        timeout: 60000, // 60초 타임아웃 (스크린샷 + LLM 분석 시간 고려)
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.status === 'success') {
        const result = response.data.result;
        
        return {
          success: true,
          query,
          analysis: result.analysis,
          metadata: result.metadata,
          screenshot_info: {
            size: result.screenshot_size,
            action: result.metadata?.action,
            url: result.metadata?.url
          },
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error(response.data.message || 'UI 분석 실패');
      }
      
    } catch (error) {
      console.error('UI 분석 에러:', error.message);
      
      // 에러 상황에서도 유용한 정보 제공
      return {
        success: false,
        error: error.message,
        query,
        fallback_info: {
          message: '스크린샷 분석에 실패했습니다.',
          possible_causes: [
            'Python UI 분석 서버가 실행되지 않음',
            'Playwright 브라우저 설치 필요',
            'LLM API 키 설정 필요 (ANTHROPIC_API_KEY 또는 OPENAI_API_KEY)',
            '대상 URL에 접근할 수 없음'
          ],
          setup_instructions: [
            '1. pip install playwright aiohttp',
            '2. playwright install chromium',
            '3. 환경변수 설정: ANTHROPIC_API_KEY 또는 OPENAI_API_KEY',
            '4. Python 로그 서버 실행 확인'
          ]
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  // 유틸리티 메서드들
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  estimateComplexity(description) {
    const keywords = description.toLowerCase();
    if (keywords.includes('ai') || keywords.includes('machine learning') || keywords.includes('microservice')) {
      return 'high';
    } else if (keywords.includes('api') || keywords.includes('database') || keywords.includes('integration')) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  recommendApproach(description) {
    const complexity = this.estimateComplexity(description);
    switch (complexity) {
      case 'high':
        return 'Agile with proper architecture planning';
      case 'medium':
        return 'Iterative development with regular reviews';
      default:
        return 'Simple linear development';
    }
  }

  suggestTechnologies(description) {
    const keywords = description.toLowerCase();
    const technologies = [];
    
    if (keywords.includes('web') || keywords.includes('frontend')) {
      technologies.push('React', 'Vue.js', 'Angular');
    }
    if (keywords.includes('api') || keywords.includes('backend')) {
      technologies.push('Node.js', 'Express', 'FastAPI');
    }
    if (keywords.includes('database')) {
      technologies.push('PostgreSQL', 'MongoDB', 'Redis');
    }
    
    return technologies.length > 0 ? technologies : ['To be determined based on requirements'];
  }

  estimateDuration(description) {
    const complexity = this.estimateComplexity(description);
    switch (complexity) {
      case 'high':
        return '3-6 months';
      case 'medium':
        return '1-3 months';
      default:
        return '2-4 weeks';
    }
  }

  recommendTeamSize(complexityOrDescription) {
    const complexity = typeof complexityOrDescription === 'string' && 
      ['low', 'medium', 'high'].includes(complexityOrDescription) 
      ? complexityOrDescription 
      : this.estimateComplexity(complexityOrDescription);
      
    switch (complexity) {
      case 'high':
        return '5-8 people';
      case 'medium':
        return '3-5 people';
      default:
        return '2-3 people';
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 Recursive MCP Server for Cursor started'); // stderr로 로그 출력
  }
}

// 서버 실행
if (require.main === module) {
  const server = new CursorMCPServer();
  server.run().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = CursorMCPServer; 