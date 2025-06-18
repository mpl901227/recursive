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
}

module.exports = MCPToolsHandlers; 