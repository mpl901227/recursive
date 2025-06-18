/**
 * LLM API Client
 * Claude와 OpenAI API를 지원하는 통합 클라이언트
 */
const axios = require('axios');

class LLMClient {
    constructor() {
        this.claudeApiKey = process.env.ANTHROPIC_API_KEY;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        
        // API 엔드포인트
        this.claudeEndpoint = 'https://api.anthropic.com/v1/messages';
        this.openaiEndpoint = 'https://api.openai.com/v1/chat/completions';
        
        // 기본 설정
        this.defaultTimeout = 30000; // 30초
        this.maxRetries = 3;
    }

    /**
     * 모델에 따라 적절한 API 호출
     * @param {Object} params - 매개변수 객체
     * @param {string} params.model - 사용할 모델명
     * @param {Array} params.messages - 메시지 배열
     * @param {number} params.max_tokens - 최대 토큰 수
     * @param {number} params.temperature - 온도 설정
     * @param {number} params.timeout - 타임아웃
     */
    async chat(params) {
        // 매개변수 추출 및 기본값 설정
        const { 
            model, 
            messages, 
            max_tokens: maxTokens = 2000, 
            temperature = 0.7, 
            timeout = this.defaultTimeout 
        } = params;
        
        if (!model || !messages) {
            throw new Error('Model and messages are required parameters');
        }
        
        console.log('🔄 LLM API call with params:', { model, messageCount: messages.length, maxTokens });
        
        if (model.startsWith('claude')) {
            return await this.callClaude(model, messages, { temperature, maxTokens, timeout });
        } else if (model.startsWith('gpt')) {
            return await this.callOpenAI(model, messages, { temperature, maxTokens, timeout });
        } else {
            throw new Error(`Unsupported model: ${model}`);
        }
    }

    /**
     * Claude API 호출
     */
    async callClaude(model, messages, options = {}) {
        if (!this.claudeApiKey) {
            throw new Error('ANTHROPIC_API_KEY not found in environment variables');
        }

        const { temperature, maxTokens, timeout } = options;
        
        // 메시지 포맷 변환 (Claude 형식)
        const claudeMessages = this.convertToClaudeFormat(messages);
        
        const requestData = {
            model: this.mapClaudeModel(model),
            max_tokens: maxTokens,
            temperature,
            messages: claudeMessages
        };

        try {
            const response = await axios.post(this.claudeEndpoint, requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.claudeApiKey,
                    'anthropic-version': '2023-06-01'
                },
                timeout
            });

            return {
                success: true,
                content: response.data.content[0].text,
                usage: response.data.usage,
                model: response.data.model
            };
        } catch (error) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                requestData: requestData
            };
            console.error('🚫 Claude API error 상세:', errorDetails);
            throw new Error(`Claude API error (${error.response?.status || 'unknown'}): ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * OpenAI API 호출
     */
    async callOpenAI(model, messages, options = {}) {
        if (!this.openaiApiKey) {
            throw new Error('OPENAI_API_KEY not found in environment variables');
        }

        const { temperature, maxTokens, timeout } = options;
        
        const requestData = {
            model: this.mapOpenAIModel(model),
            messages: messages,
            temperature,
            max_tokens: maxTokens
        };

        try {
            const response = await axios.post(this.openaiEndpoint, requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiApiKey}`
                },
                timeout
            });

            return {
                success: true,
                content: response.data.choices[0].message.content,
                usage: response.data.usage,
                model: response.data.model
            };
        } catch (error) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                requestData: requestData
            };
            console.error('🚫 OpenAI API error 상세:', errorDetails);
            throw new Error(`OpenAI API error (${error.response?.status || 'unknown'}): ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * 메시지를 Claude 형식으로 변환
     */
    convertToClaudeFormat(messages) {
        return messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.content
        }));
    }

    /**
     * Claude 모델명 매핑
     */
    mapClaudeModel(model) {
        const modelMap = {
            'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
            'claude-3-haiku': 'claude-3-haiku-20240307',
            'claude-3-opus': 'claude-3-opus-20240229'
        };
        return modelMap[model] || model;
    }

    /**
     * OpenAI 모델명 매핑
     */
    mapOpenAIModel(model) {
        const modelMap = {
            'gpt-4': 'gpt-4-turbo-preview',
            'gpt-3.5-turbo': 'gpt-3.5-turbo'
        };
        return modelMap[model] || model;
    }

    /**
     * 사용 가능한 모델 목록
     */
    getAvailableModels() {
        const models = [];
        
        if (this.claudeApiKey) {
            models.push('claude-3.5-sonnet', 'claude-3-haiku', 'claude-3-opus');
        }
        
        if (this.openaiApiKey) {
            models.push('gpt-4', 'gpt-3.5-turbo');
        }
        
        return models;
    }

    /**
     * API 키 설정 상태 확인
     */
    getStatus() {
        return {
            claude: !!this.claudeApiKey,
            openai: !!this.openaiApiKey,
            availableModels: this.getAvailableModels()
        };
    }
}

module.exports = LLMClient; 