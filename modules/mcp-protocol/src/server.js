/**
 * MCP Server Implementation - Modularized
 */
const EventEmitter = require('events');
const { MCPCoreHandlers, MCPToolsHandlers, MCPUtils } = require('./handlers');
const { AIUnderstandingAnalyzer } = require('@recursive/ai-analysis');

class MCPServer extends EventEmitter {
    constructor(wsServer, llmClient) {
        super();
        this.wsServer = wsServer;
        this.llmClient = llmClient;
        this.capabilities = {
            tools: { listChanged: true },
            resources: { subscribe: true, listChanged: true },
            prompts: { listChanged: true }
        };
        
        this.serverInfo = {
            name: 'Recursive MCP Server',
            version: '1.0.0'
        };

        this.activeSessions = new Map();
        this.coreHandlers = new MCPCoreHandlers(this);
        this.toolsHandlers = new MCPToolsHandlers(this);
        this.aiUnderstandingAnalyzer = new AIUnderstandingAnalyzer();
        
        if (this.llmClient) {
            this.checkLLMClientStatus();
        }
        
        this.setupSessionCleanup();
    }

    async checkLLMClientStatus() {
        try {
            const status = this.llmClient.getStatus();
            console.log('🔍 LLM Client Status:', status);
        } catch (error) {
            console.error('🚫 Failed to check LLM client status:', error.message);
        }
    }

    async handleMCPMessage(ws, messageData) {
        try {
            const message = this.parseMessage(messageData);
            if (!message) return;

            switch (message.method) {
                case 'initialize':
                    await this.coreHandlers.handleInitialize(ws, message);
                    break;
                case 'tools/list':
                    await this.coreHandlers.handleToolsList(ws, message);
                    break;
                case 'tools/call':
                    await this.toolsHandlers.handleToolsCall(ws, message);
                    break;
                default:
                    MCPUtils.sendError(ws, message.id, -32601, `Method not found: ${message.method}`);
            }
        } catch (error) {
            console.error('MCP message handling error:', error);
            MCPUtils.sendError(ws, null, -32603, 'Internal error');
        }
    }

    parseMessage(messageData) {
        try {
            if (!messageData) return null;
            const rawMessage = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
            let message = rawMessage.type === 'mcp_request' ? rawMessage.data : rawMessage;
            
            if (!message.jsonrpc) message.jsonrpc = '2.0';
            if (!message.id && message.method) message.id = Date.now();

            return message;
        } catch (error) {
            return null;
        }
    }

    setupSessionCleanup() {
        setInterval(() => this.cleanupSessions(), 60 * 60 * 1000);
    }

    cleanupSessions() {
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000;
        
        for (const [sessionId, session] of this.activeSessions.entries()) {
            const sessionTime = new Date(session.createdAt);
            if (now - sessionTime > maxAge) {
                this.activeSessions.delete(sessionId);
            }
        }
    }

    cleanup() {
        this.cleanupSessions();
        this.removeAllListeners();
    }
}

module.exports = MCPServer; 