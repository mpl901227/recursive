/**
 * AI Understanding Analyzer Tool
 * 대화 내용을 분석하여 AI의 프로젝트 이해도를 업데이트하고 관리하는 도구
 */

class AIUnderstandingAnalyzer {
    constructor() {
        this.name = 'ai-understanding-analyzer';
        this.templates = this.initializeTemplates();
        this.analysisHistory = [];
    }

    initializeTemplates() {
        return {
            debugging: {
                keywords: ['버그', '오류', '에러', '문제', '해결', '수정', '디버그'],
                confidence_factors: {
                    problem_description: 0.3,
                    symptoms: 0.2,
                    environment: 0.15,
                    reproduction_steps: 0.2,
                    expected_behavior: 0.15
                }
            },
            new_development: {
                keywords: ['새로운', '개발', '프로젝트', '만들기', '구축', '설계'],
                confidence_factors: {
                    concept: 0.25,
                    target_users: 0.15,
                    main_features: 0.25,
                    tech_stack: 0.2,
                    timeline: 0.1,
                    team_size: 0.05
                }
            },
            feature_addition: {
                keywords: ['기능', '추가', '확장', '개선', '업그레이드'],
                confidence_factors: {
                    new_feature: 0.3,
                    existing_system: 0.25,
                    integration_points: 0.2,
                    impact_analysis: 0.15,
                    testing_strategy: 0.1
                }
            }
        };
    }

    async analyzeConversationUnderstanding(args) {
        const { user_message, ai_response, current_understanding } = args;
        
        try {
            // 프로젝트 타입 자동 감지
            const detectedType = this.detectProjectType(user_message, ai_response);
            
            // 키 정보 추출
            const extractedInfo = this.extractKeyInformation(user_message, ai_response, detectedType);
            
            // 신뢰도 계산
            const confidence = this.calculateConfidence(extractedInfo, detectedType);
            
            // 이해도 업데이트
            const updatedUnderstanding = {
                ...current_understanding,
                projectType: detectedType !== 'unknown' ? detectedType : current_understanding.projectType,
                confidence: Math.min(100, Math.max(0, confidence)),
                ...extractedInfo,
                lastUpdated: new Date().toISOString()
            };

            // 분석 히스토리 저장
            this.analysisHistory.push({
                timestamp: new Date().toISOString(),
                user_message,
                ai_response,
                detected_type: detectedType,
                confidence_change: confidence - (current_understanding.confidence || 0),
                extracted_info: extractedInfo
            });

            return {
                success: true,
                updated_understanding: updatedUnderstanding,
                analysis_summary: {
                    detected_type: detectedType,
                    confidence_change: confidence - (current_understanding.confidence || 0),
                    key_insights: this.generateInsights(extractedInfo, detectedType)
                }
            };
        } catch (error) {
            console.error('대화 분석 실패:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    detectProjectType(userMessage, aiResponse) {
        const combinedText = (userMessage + ' ' + aiResponse).toLowerCase();
        
        let maxScore = 0;
        let detectedType = 'unknown';
        
        for (const [type, template] of Object.entries(this.templates)) {
            let score = 0;
            for (const keyword of template.keywords) {
                if (combinedText.includes(keyword)) {
                    score += 1;
                }
            }
            
            if (score > maxScore) {
                maxScore = score;
                detectedType = type;
            }
        }
        
        return maxScore > 0 ? detectedType : 'unknown';
    }

    extractKeyInformation(userMessage, aiResponse, projectType) {
        const extractedInfo = {};
        
        // 기본 정보 추출
        if (userMessage.length > 10) {
            if (!extractedInfo.concept) {
                extractedInfo.concept = this.extractConcept(userMessage, aiResponse);
            }
        }
        
        // 요구사항 추출
        const requirements = this.extractRequirements(userMessage, aiResponse);
        if (requirements.length > 0) {
            extractedInfo.requirements = requirements;
        }
        
        return extractedInfo;
    }

    extractConcept(userMessage, aiResponse) {
        // 간단한 컨셉 추출 로직
        const sentences = userMessage.split(/[.!?]/).filter(s => s.trim().length > 10);
        return sentences[0]?.trim() || '프로젝트 컨셉 분석 중...';
    }

    extractRequirements(userMessage, aiResponse) {
        const requirements = [];
        const patterns = [
            /필요한?\s*(.+)/g,
            /요구사항.*?:?\s*(.+)/g,
            /해야\s*(.+)/g,
            /만들어?\s*(.+)/g
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(userMessage)) !== null) {
                if (match[1] && match[1].trim().length > 5) {
                    requirements.push(match[1].trim());
                }
            }
        }
        
        return requirements.slice(0, 5); // 최대 5개
    }

    calculateConfidence(extractedInfo, projectType) {
        if (projectType === 'unknown') return 10;
        
        const template = this.templates[projectType];
        if (!template) return 20;
        
        let totalWeight = 0;
        let achievedWeight = 0;
        
        for (const [factor, weight] of Object.entries(template.confidence_factors)) {
            totalWeight += weight;
            if (extractedInfo[factor] && extractedInfo[factor].length > 0) {
                achievedWeight += weight;
            }
        }
        
        const baseConfidence = (achievedWeight / totalWeight) * 80; // 최대 80%
        const bonusConfidence = Math.min(20, (extractedInfo.requirements?.length || 0) * 4); // 요구사항 보너스
        
        return Math.round(baseConfidence + bonusConfidence);
    }

    generateInsights(extractedInfo, projectType) {
        const insights = [];
        
        if (projectType !== 'unknown') {
            insights.push(`프로젝트 타입이 '${projectType}'로 식별되었습니다.`);
        }
        
        if (extractedInfo.concept) {
            insights.push(`핵심 컨셉: ${extractedInfo.concept}`);
        }
        
        if (extractedInfo.requirements && extractedInfo.requirements.length > 0) {
            insights.push(`${extractedInfo.requirements.length}개의 요구사항이 식별되었습니다.`);
        }
        
        return insights;
    }

    generateArchitectureMermaid(understanding) {
        const { projectType } = understanding;
        
        let mermaidCode = 'graph TB\n';
        
        switch (projectType) {
            case 'new_development':
                mermaidCode += `
    A[사용자] --> B[프론트엔드]
    B --> C[API 게이트웨이]
    C --> D[백엔드 서비스]
    D --> E[데이터베이스]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
                `;
                break;
                
            case 'feature_addition':
                mermaidCode += `
    A[기존 시스템] --> B[새 기능 모듈]
    B --> C[통합 레이어]
    C --> D[기존 데이터베이스]
    B --> E[새 데이터 소스]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
                `;
                break;
                
            case 'debugging':
                mermaidCode += `
    A[문제 발생] --> B[로그 분석]
    B --> C[원인 파악]
    C --> D[수정 방안]
    D --> E[테스트]
    E --> F[배포]
    
    style A fill:#ffebee
    style B fill:#e1f5fe
    style C fill:#f3e5f5
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#fce4ec
                `;
                break;
                
            default:
                mermaidCode += `
    A[입력] --> B[처리]
    B --> C[출력]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
                `;
        }
        
        return mermaidCode;
    }

    generateWorkflowMermaid(understanding) {
        const { projectType } = understanding;
        
        let mermaidCode = 'flowchart TD\n';
        
        switch (projectType) {
            case 'new_development':
                mermaidCode += `
    A[요구사항 분석] --> B[설계]
    B --> C[개발]
    C --> D[테스트]
    D --> E[배포]
    E --> F[운영]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
    style F fill:#f1f8e9
                `;
                break;
                
            case 'debugging':
                mermaidCode += `
    A[문제 보고] --> B[재현]
    B --> C[분석]
    C --> D[수정]
    D --> E[검증]
    E --> F[배포]
    
    style A fill:#ffebee
    style B fill:#e1f5fe
    style C fill:#f3e5f5
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#fce4ec
                `;
                break;
                
            default:
                mermaidCode += `
    A[시작] --> B[계획]
    B --> C[실행]
    C --> D[검토]
    D --> E[완료]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#fff3e0
    style E fill:#fce4ec
                `;
        }
        
        return mermaidCode;
    }
}

module.exports = { AIUnderstandingAnalyzer };