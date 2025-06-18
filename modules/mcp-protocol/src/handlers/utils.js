/**
 * MCP Server Utility Functions
 */

class MCPUtils {
    /**
     * MCP 응답 전송
     */
    static sendResponse(ws, id, result) {
        const response = {
            jsonrpc: '2.0',
            id: id,
            result: result
        };
        
        try {
            const message = JSON.stringify(response);
            
            if (ws.readyState === ws.OPEN) {
                ws.send(message);
                console.log(`📤 MCP Response sent (ID: ${id}):`, JSON.stringify(result, null, 2));
            } else {
                console.warn(`⚠️ WebSocket not open, cannot send response (ID: ${id})`);
            }
        } catch (error) {
            console.error('Failed to send MCP response:', error);
        }
    }

    /**
     * MCP 에러 전송
     */
    static sendError(ws, id, code, message, data = null) {
        const error = {
            code: code,
            message: message
        };
        
        if (data !== null) {
            error.data = data;
        }
        
        const response = {
            jsonrpc: '2.0',
            id: id,
            error: error
        };
        
        try {
            const errorMessage = JSON.stringify(response);
            
            if (ws.readyState === ws.OPEN) {
                ws.send(errorMessage);
                console.error(`📤 MCP Error sent (ID: ${id}):`, error);
            } else {
                console.warn(`⚠️ WebSocket not open, cannot send error (ID: ${id})`);
            }
        } catch (sendError) {
            console.error('Failed to send MCP error:', sendError);
        }
    }

    /**
     * MCP 알림 전송
     */
    static sendNotification(ws, method, params = {}) {
        const notification = {
            jsonrpc: '2.0',
            method: method,
            params: params
        };
        
        try {
            const message = JSON.stringify(notification);
            
            if (ws.readyState === ws.OPEN) {
                ws.send(message);
                console.log(`📤 MCP Notification sent (${method}):`, params);
            } else {
                console.warn(`⚠️ WebSocket not open, cannot send notification (${method})`);
            }
        } catch (error) {
            console.error('Failed to send MCP notification:', error);
        }
    }

    /**
     * 세션 ID 생성
     */
    static generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 기간 예측 (복잡도 기반)
     */
    static estimateDuration(complexityLevel) {
        const durations = {
            'very_low': { min: 1, max: 3, unit: 'hours' },
            'low': { min: 4, max: 8, unit: 'hours' },
            'medium': { min: 1, max: 3, unit: 'days' },
            'high': { min: 1, max: 2, unit: 'weeks' },
            'very_high': { min: 2, max: 4, unit: 'weeks' }
        };
        return durations[complexityLevel] || durations['medium'];
    }

    /**
     * 팀 크기 추천 (복잡도 기반)
     */
    static recommendTeamSize(complexityLevel) {
        const teamSizes = {
            'very_low': 1,
            'low': '1-2',
            'medium': '2-3',
            'high': '3-5',
            'very_high': '5-8'
        };
        return teamSizes[complexityLevel] || '2-3';
    }

    /**
     * 기본 진행률 생성
     */
    static generateBasicGatheringProgress(conversationHistory, understanding) {
        const totalQuestions = 5; // 기본적으로 5개의 질문 영역
        const answeredQuestions = Math.min(conversationHistory.length, totalQuestions);
        const progressPercentage = Math.round((answeredQuestions / totalQuestions) * 100);
        
        return {
            percentage: progressPercentage,
            answeredQuestions: answeredQuestions,
            totalQuestions: totalQuestions,
            currentPhase: progressPercentage < 50 ? 'gathering' : 'analyzing',
            nextSteps: progressPercentage >= 100 ? 
                ['Generate final recommendations', 'Create action plan'] :
                ['Continue gathering requirements', 'Ask follow-up questions']
        };
    }
}

module.exports = MCPUtils; 