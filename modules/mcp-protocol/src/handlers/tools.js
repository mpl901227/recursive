/**
 * MCP Server Tools Handlers
 */
const MCPUtils = require('./utils');

class MCPToolsHandlers {
    constructor(server) {
        this.server = server;
    }

    /**
     * 도구 호출 메인 핸들러
     */
    async handleToolsCall(ws, message) {
        const { name, arguments: args } = message.params;
        
        console.log(`🔧 Tool called: ${name}`);
        
        try {
            let result;
            
            switch (name) {
                case 'interactive_diagnosis':
                    result = await this.handleInteractiveDiagnosis(ws, args);
                    break;
                case 'complexity_analysis':
                    result = await this.handleComplexityAnalysis(ws, args);
                    break;
                case 'workflow_recommendation':
                    result = await this.handleWorkflowRecommendation(ws, args);
                    break;
                case 'update_project_understanding':
                    result = await this.handleUpdateProjectUnderstanding(ws, args);
                    break;
                case 'analyze_uploaded_file':
                    result = await this.handleAnalyzeUploadedFile(ws, args);
                    break;
                case 'generate_architecture_diagram':
                    result = await this.handleGenerateArchitectureDiagram(ws, args);
                    break;
                case 'generate_workflow_diagram':
                    result = await this.handleGenerateWorkflowDiagram(ws, args);
                    break;
                case 'generate_timeline_diagram':
                    result = await this.handleGenerateTimelineDiagram(ws, args);
                    break;
                // 로그 시스템 MCP 도구들
                case 'show_recent_errors':
                    result = await this.handleShowRecentErrors(ws, args);
                    break;
                case 'open_log_search':
                    result = await this.handleOpenLogSearch(ws, args);
                    break;
                case 'jump_to_trace':
                    result = await this.handleJumpToTrace(ws, args);
                    break;
                case 'create_log_dashboard':
                    result = await this.handleCreateLogDashboard(ws, args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            
            MCPUtils.sendResponse(ws, message.id, {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            });
        } catch (error) {
            console.error(`Tool execution error (${name}):`, error);
            MCPUtils.sendError(ws, message.id, -32603, `Tool execution failed: ${error.message}`);
        }
    }

    /**
     * 대화형 진단 핸들러
     */
    async handleInteractiveDiagnosis(ws, args) {
        const { initial_input, model = 'claude-3.5-sonnet', complexity_mode = 'simple', mode = 'kickoff' } = args;
        
        if (!initial_input) {
            throw new Error('initial_input is required');
        }
        
        console.log(`🔍 Starting interactive diagnosis:`, {
            input: initial_input.slice(0, 100) + '...',
            model,
            complexity_mode,
            mode
        });
        
        // AI Understanding Analyzer를 통한 분석 시작
        const sessionId = MCPUtils.generateSessionId();
        const analysis = await this.server.aiUnderstandingAnalyzer.startInteractiveDiagnosis(
            initial_input, 
            model, 
            complexity_mode, 
            mode
        );
        
        // 세션 저장
        this.server.activeSessions.set(sessionId, {
            id: sessionId,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            analysis: analysis,
            mode: mode,
            complexity_mode: complexity_mode
        });
        
        return {
            session_id: sessionId,
            analysis: analysis,
            next_action: analysis.next_question ? 'answer_question' : 'finalize'
        };
    }

    /**
     * 복잡도 분석 핸들러
     */
    async handleComplexityAnalysis(ws, args) {
        const { project_description } = args;
        
        if (!project_description) {
            throw new Error('project_description is required');
        }
        
        // 기본 복잡도 분석 로직
        const analysis = {
            complexity_level: 'medium',
            factors: [
                'Technology stack complexity',
                'Integration requirements',
                'Team size and experience'
            ],
            estimated_duration: MCPUtils.estimateDuration('medium'),
            recommended_team_size: MCPUtils.recommendTeamSize('medium'),
            recommendations: [
                'Start with MVP approach',
                'Set up CI/CD pipeline early',
                'Plan regular code reviews'
            ]
        };
        
        return analysis;
    }

    /**
     * 워크플로우 추천 핸들러
     */
    async handleWorkflowRecommendation(ws, args) {
        const { project_type, complexity_level } = args;
        
        if (!project_type || !complexity_level) {
            throw new Error('project_type and complexity_level are required');
        }
        
        const workflow = {
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
                recommended_size: MCPUtils.recommendTeamSize(complexity_level),
                roles: ['Developer', 'DevOps', 'QA']
            }
        };
        
        return workflow;
    }

    /**
     * 프로젝트 이해도 업데이트 핸들러
     */
    async handleUpdateProjectUnderstanding(ws, args) {
        const { session_id, new_information } = args;
        
        if (!session_id || !new_information) {
            throw new Error('session_id and new_information are required');
        }
        
        const session = this.server.activeSessions.get(session_id);
        if (!session) {
            throw new Error(`Session ${session_id} not found`);
        }
        
        // 세션 정보 업데이트
        session.lastActivity = new Date().toISOString();
        session.understanding = {
            ...session.understanding,
            ...new_information
        };
        
        return {
            session_id: session_id,
            status: 'updated',
            updated_understanding: session.understanding
        };
    }

    /**
     * 업로드된 파일 분석 핸들러
     */
    async handleAnalyzeUploadedFile(ws, args) {
        const { file_content, file_name, analysis_type = 'general' } = args;
        
        if (!file_content || !file_name) {
            throw new Error('file_content and file_name are required');
        }
        
        const analysis = {
            file_name: file_name,
            file_type: file_name.split('.').pop() || 'unknown',
            analysis_type: analysis_type,
            size: file_content.length,
            structure_analysis: {
                lines: file_content.split('\n').length,
                non_empty_lines: file_content.split('\n').filter(line => line.trim()).length
            },
            insights: [
                `File contains ${file_content.split('\n').length} lines`,
                `Analysis type: ${analysis_type}`,
                'File structure appears well-organized'
            ],
            recommendations: [
                'Consider adding documentation if missing',
                'Review code formatting and consistency'
            ]
        };
        
        return analysis;
    }

    /**
     * 아키텍처 다이어그램 생성 핸들러
     */
    async handleGenerateArchitectureDiagram(ws, args) {
        const { project_info, diagram_type = 'system' } = args;
        
        if (!project_info) {
            throw new Error('project_info is required');
        }
        
        const diagram = {
            type: diagram_type,
            format: 'mermaid',
            content: `graph TD
    A[Client] --> B[API Gateway]
    B --> C[Authentication Service]
    B --> D[Business Logic]
    D --> E[Database]
    D --> F[External APIs]`,
            description: `${diagram_type} architecture diagram`,
            components_identified: [
                'Client Layer',
                'API Gateway',
                'Authentication Service',
                'Business Logic',
                'Database',
                'External APIs'
            ]
        };
        
        return diagram;
    }

    /**
     * 워크플로우 다이어그램 생성 핸들러
     */
    async handleGenerateWorkflowDiagram(ws, args) {
        const { workflow_steps, diagram_style = 'flowchart' } = args;
        
        if (!workflow_steps) {
            throw new Error('workflow_steps are required');
        }
        
        const diagram = {
            style: diagram_style,
            format: 'mermaid',
            content: `flowchart TD
    Start([Start]) --> Plan[Planning]
    Plan --> Dev[Development]
    Dev --> Test[Testing]
    Test --> Deploy[Deployment]
    Deploy --> End([End])`,
            description: `${diagram_style} workflow diagram`,
            steps_count: Array.isArray(workflow_steps) ? workflow_steps.length : 0
        };
        
        return diagram;
    }

    /**
     * 타임라인 다이어그램 생성 핸들러
     */
    async handleGenerateTimelineDiagram(ws, args) {
        const { milestones, timeline_type = 'gantt' } = args;
        
        if (!milestones) {
            throw new Error('milestones are required');
        }
        
        const diagram = {
            type: timeline_type,
            format: 'mermaid',
            content: `gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements    :active, req, 2024-01-01, 2024-01-14
    section Development
    Implementation  :dev, after req, 30d
    section Testing
    QA Testing      :test, after dev, 14d`,
            description: `${timeline_type} timeline diagram`,
            milestones_count: Array.isArray(milestones) ? milestones.length : 0
        };
        
        return diagram;
    }

    // =============================================================================
    // 🔧 로그 시스템 MCP 도구 핸들러들
    // =============================================================================

    /**
     * 최근 에러 표시 핸들러
     */
    async handleShowRecentErrors(ws, args) {
        const { count = 10, timeRange = '24h' } = args;
        
        console.log(`🔍 Showing recent errors: count=${count}, timeRange=${timeRange}`);
        
        try {
            // Python 로그 서버에서 에러 로그 조회
            const JSONRPCClient = require('../../../shared/src/utils/JSONRPCClient.js');
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

            // UI 이벤트도 발송
            this.server.wsServer.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'mcp_ui_action',
                        action: 'show_recent_errors',
                        data: { count, timeRange, errors: allErrors }
                    }));
                }
            });

            return {
                success: true,
                total_errors: allErrors.length,
                server_errors: serverErrors.logs?.length || 0,
                client_errors: clientErrors.logs?.length || 0,
                time_range: timeRange,
                errors: allErrors.map(log => ({
                    timestamp: log.timestamp,
                    level: log.level,
                    source: log.source,
                    message: log.message,
                    type: log.source.startsWith('client-') ? '🌐 Client' : '🖥️ Server',
                    metadata: log.metadata
                }))
            };

        } catch (error) {
            console.error('Error showing recent errors:', error);
            return {
                success: false,
                error: `Failed to show recent errors: ${error.message}`,
                parameters: { count, timeRange }
            };
        }
    }

    /**
     * 로그 검색 열기 핸들러
     */
    async handleOpenLogSearch(ws, args) {
        const { query = '', filters = {} } = args;
        
        console.log(`🔍 Opening log search: query="${query}"`);
        
        try {
            // UI 이벤트 발송
            this.server.wsServer.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'mcp_ui_action',
                        action: 'open_log_search',
                        data: { query, filters }
                    }));
                }
            });

            return {
                success: true,
                message: 'Log search opened successfully',
                action: 'navigated_to_search',
                parameters: { query, filters }
            };

        } catch (error) {
            console.error('Error opening log search:', error);
            return {
                success: false,
                error: `Failed to open log search: ${error.message}`,
                parameters: { query, filters }
            };
        }
    }

    /**
     * 트레이스 ID로 이동 핸들러
     */
    async handleJumpToTrace(ws, args) {
        const { traceId } = args;
        
        console.log(`🔍 Jumping to trace: ${traceId}`);
        
        try {
            // UI 이벤트 발송
            this.server.wsServer.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'mcp_ui_action',
                        action: 'jump_to_trace',
                        data: { traceId }
                    }));
                }
            });

            return {
                success: true,
                message: `Jumped to trace ${traceId}`,
                action: 'navigated_to_viewer',
                parameters: { traceId }
            };

        } catch (error) {
            console.error('Error jumping to trace:', error);
            return {
                success: false,
                error: `Failed to jump to trace: ${error.message}`,
                parameters: { traceId }
            };
        }
    }

    /**
     * 로그 대시보드 생성 핸들러
     */
    async handleCreateLogDashboard(ws, args) {
        const { widgets = ['system-status', 'error-chart', 'recent-errors'] } = args;
        
        console.log(`🔍 Creating log dashboard with widgets:`, widgets);
        
        try {
            // UI 이벤트 발송
            this.server.wsServer.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'mcp_ui_action',
                        action: 'create_log_dashboard',
                        data: { widgets }
                    }));
                }
            });

            return {
                success: true,
                message: 'Log dashboard configured successfully',
                action: 'navigated_to_dashboard',
                parameters: { widgets }
            };

        } catch (error) {
            console.error('Error creating log dashboard:', error);
            return {
                success: false,
                error: `Failed to create log dashboard: ${error.message}`,
                parameters: { widgets }
            };
        }
    }
}

module.exports = MCPToolsHandlers; 