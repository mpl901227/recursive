/**
 * MCP Server Core Protocol Handlers
 */
const MCPUtils = require('./utils');

class MCPCoreHandlers {
    constructor(server) {
        this.server = server;
    }

    /**
     * MCP 초기화 핸들러
     */
    async handleInitialize(ws, message) {
        const { capabilities, clientInfo } = message.params || {};
        
        console.log('MCP Client connected:', clientInfo);
        
        // 클라이언트 정보 저장
        ws.mcpClientInfo = clientInfo;
        ws.mcpCapabilities = capabilities;
        
        MCPUtils.sendResponse(ws, message.id, {
            protocolVersion: '2025-03-26',
            capabilities: this.server.capabilities,
            serverInfo: this.server.serverInfo
        });
    }

    /**
     * 초기화 완료 알림 핸들러
     */
    async handleInitialized(ws, message) {
        console.log('MCP Client initialization completed');
        // 초기화 완료 후 추가 작업 수행 가능
    }

    /**
     * 도구 목록 조회 핸들러
     */
    async handleToolsList(ws, message) {
        const tools = [
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
                name: 'update_project_understanding',
                description: '프로젝트 이해도 업데이트',
                inputSchema: {
                    type: 'object',
                    properties: {
                        session_id: {
                            type: 'string',
                            description: '세션 ID'
                        },
                        new_information: {
                            type: 'object',
                            description: '새로운 프로젝트 정보'
                        }
                    },
                    required: ['session_id', 'new_information']
                }
            },
            // 로그 시스템 MCP 도구들
            {
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
                }
            },
            {
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
                }
            },
            {
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
                }
            },
            {
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
                }
            }
        ];

        MCPUtils.sendResponse(ws, message.id, { tools });
    }

    /**
     * 프롬프트 목록 조회 핸들러
     */
    async handlePromptsList(ws, message) {
        const prompts = [
            {
                name: 'project_kickoff',
                description: '프로젝트 킥오프를 위한 표준 프롬프트',
                arguments: [
                    {
                        name: 'project_name',
                        description: '프로젝트 이름',
                        required: true
                    }
                ]
            }
        ];

        MCPUtils.sendResponse(ws, message.id, { prompts });
    }

    /**
     * 프롬프트 조회 핸들러
     */
    async handlePromptsGet(ws, message) {
        const { name, arguments: args } = message.params;
        
        if (name === 'project_kickoff') {
            const prompt = `프로젝트 "${args?.project_name || 'Unknown'}"에 대한 킥오프 진단을 시작합니다.`;

            MCPUtils.sendResponse(ws, message.id, {
                description: '프로젝트 킥오프 프롬프트',
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: prompt
                        }
                    }
                ]
            });
        } else {
            MCPUtils.sendError(ws, message.id, -32602, `Unknown prompt: ${name}`);
        }
    }

    /**
     * 리소스 목록 조회 핸들러
     */
    async handleResourcesList(ws, message) {
        const resources = [
            {
                uri: 'recursive://diagnosis/sessions',
                name: '진단 세션 목록',
                description: '활성 진단 세션들의 목록',
                mimeType: 'application/json'
            }
        ];

        MCPUtils.sendResponse(ws, message.id, { resources });
    }

    /**
     * 리소스 읽기 핸들러
     */
    async handleResourcesRead(ws, message) {
        const { uri } = message.params;
        
        if (uri === 'recursive://diagnosis/sessions') {
            const sessions = Array.from(this.server.activeSessions.entries()).map(([id, session]) => ({
                id,
                status: session.status,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity
            }));
            
            MCPUtils.sendResponse(ws, message.id, {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(sessions, null, 2)
                    }
                ]
            });
        } else {
            MCPUtils.sendError(ws, message.id, -32602, `Unknown resource: ${uri}`);
        }
    }
}

module.exports = MCPCoreHandlers; 