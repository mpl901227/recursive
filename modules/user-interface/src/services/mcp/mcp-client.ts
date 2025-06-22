/**
 * MCP Client for Recursive Dashboard
 * 
 * Model Context Protocol 클라이언트 구현
 * - WebSocket을 통한 MCP 서버 통신
 * - 도구 호출 및 리소스 관리
 * - 세션 관리 및 상태 추적
 * - 에러 처리 및 재시도 로직
 */

import { EventManager } from '../../core/events.js';
import type { WebSocketClient } from '../websocket/websocket-client.js';

/**
 * MCP 연결 상태
 */
export enum MCPConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error'
}

/**
 * MCP 세션 상태
 */
export enum MCPSessionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  DIAGNOSING = 'diagnosing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/**
 * MCP 메시지 타입
 */
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP 도구 정의
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP 리소스 정의
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP 프롬프트 정의
 */
export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: {
    name: string;
    description: string;
    required?: boolean;
  }[];
}

/**
 * MCP 서버 능력
 */
export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, any>;
}

/**
 * MCP 클라이언트 설정
 */
export interface MCPClientConfig {
  protocolVersion?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  maxQueueSize?: number;
  initTimeout?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
  capabilities?: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
    sampling?: Record<string, any>;
  };
}

/**
 * 레거시 MCP 요청 큐 아이템 (기존 호환성 유지용)
 * @deprecated RequestQueue의 QueuedRequest를 사용하세요
 */
interface LegacyMCPQueuedRequest {
  message: MCPMessage;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * MCP 세션 데이터
 */
interface SessionData {
  id: string;
  state: MCPSessionState;
  startTime: number;
  lastActivity: number;
  data: Map<string, any>;
}

/**
 * MCP 클라이언트 클래스
 */
export class MCPClient {
  private readonly config: Required<MCPClientConfig>;
  private readonly eventManager: EventManager;
  private readonly websocketClient: WebSocketClient;
  
  // 연결 상태
  private connectionState: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  private isInitialized = false;
  private serverCapabilities: MCPServerCapabilities | null = null;
  
  // 세션 관리
  private currentSessionId: string | null = null;
  private sessionState: MCPSessionState = MCPSessionState.IDLE;
  private sessions = new Map<string, SessionData>();
  
  // 요청 관리
  private messageId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    timestamp: number;
  }>();
  
  // 캐시
  private toolsCache = new Map<string, MCPTool>();
  private resourcesCache = new Map<string, MCPResource>();
  private promptsCache = new Map<string, MCPPrompt>();
  
  // 레거시 요청 큐
  private requestQueue: LegacyMCPQueuedRequest[] = [];
  private _connectionRetries = 0;
  
  constructor(
    websocketClient: WebSocketClient,
    eventManager: EventManager,
    config: MCPClientConfig = {}
  ) {
    this.websocketClient = websocketClient;
    this.eventManager = eventManager;
    
    // 기본값으로 설정 완성
    this.config = {
      protocolVersion: '2025-03-26',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      maxQueueSize: 100,
      initTimeout: 10000,
      clientInfo: {
        name: 'Recursive Dashboard Client',
        version: '2.0.0'
      },
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        sampling: {}
      },
      ...config
    };
    
    this.setupWebSocketEvents();
  }
  
  /**
   * WebSocket 이벤트 설정
   */
  private setupWebSocketEvents(): void {
    this.websocketClient.on('connect', () => {
      this.handleWebSocketConnect();
    });
    
    this.websocketClient.on('disconnect', (event) => {
      this.handleWebSocketDisconnect(event);
    });
    
    this.websocketClient.on('message', (message) => {
      this.handleWebSocketMessage(message);
    });
    
    this.websocketClient.on('error', (error) => {
      this.handleWebSocketError(error);
    });
  }
  
  /**
   * WebSocket 연결 이벤트 핸들러
   */
  private async handleWebSocketConnect(): Promise<void> {
    console.log('🔗 MCP: WebSocket connected, performing handshake...');
    this.connectionState = MCPConnectionState.CONNECTED;
    this.eventManager.emit('mcp:websocket-connected');
    
    try {
      await this.performHandshake();
      await this.processRequestQueue();
    } catch (error) {
      console.error('❌ MCP: Handshake failed:', error);
      this.connectionState = MCPConnectionState.ERROR;
      this.eventManager.emit('mcp:handshake-failed', { error });
    }
  }
  
  /**
   * WebSocket 연결 해제 이벤트 핸들러
   */
  private handleWebSocketDisconnect(event: any): void {
    console.log('📡 MCP: WebSocket disconnected');
    this.connectionState = MCPConnectionState.DISCONNECTED;
    this.isInitialized = false;
    this.serverCapabilities = null;
    
    // 모든 대기 중인 요청 거부
    this.rejectPendingRequests(new Error('Connection lost'));
    
    this.eventManager.emit('mcp:disconnected', { event });
  }
  
  /**
   * WebSocket 메시지 이벤트 핸들러
   */
  private async handleWebSocketMessage(message: any): Promise<void> {
    try {
      // MCP 메시지인지 확인
      if (message.type === 'mcp_response' || message.type === 'mcp_notification') {
        await this.handleMCPMessage(message.data);
      }
    } catch (error) {
      console.error('❌ MCP: Error handling message:', error);
      this.eventManager.emit('mcp:message-error', { error, message });
    }
  }
  
  /**
   * WebSocket 에러 이벤트 핸들러
   */
  private handleWebSocketError(error: any): void {
    console.error('❌ MCP: WebSocket error:', error);
    this.connectionState = MCPConnectionState.ERROR;
    this.eventManager.emit('mcp:websocket-error', { error });
  }
  
  /**
   * MCP 핸드셰이크 수행
   */
  private async performHandshake(): Promise<void> {
    this.connectionState = MCPConnectionState.INITIALIZING;
    
    const initMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'initialize',
      params: {
        protocolVersion: this.config.protocolVersion,
        capabilities: this.config.capabilities,
        clientInfo: this.config.clientInfo
      }
    };
    
    try {
      const result = await this.sendRequest(initMessage);
      
      this.serverCapabilities = result.capabilities;
      this.isInitialized = true;
      this.connectionState = MCPConnectionState.READY;
      
      console.log('✅ MCP: Handshake completed successfully');
      this.eventManager.emit('mcp:ready', {
        capabilities: this.serverCapabilities,
        clientInfo: this.config.clientInfo
      });
      
      // initialized 알림 전송
      await this.sendNotification({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
      
    } catch (error) {
      console.error('❌ MCP: Handshake failed:', error);
      this.connectionState = MCPConnectionState.ERROR;
      throw error;
    }
  }
  
  /**
   * MCP 메시지 처리
   */
  private async handleMCPMessage(message: MCPMessage): Promise<void> {
    if (message.id && this.pendingRequests.has(message.id)) {
      // 응답 메시지
      this.handleResponse(message);
    } else if (message.method) {
      // 요청 또는 알림 메시지
      if (message.id) {
        await this.handleRequest(message);
      } else {
        await this.handleNotification(message);
      }
    }
  }
  
  /**
   * 응답 메시지 처리
   */
  private handleResponse(message: MCPMessage): void {
    const request = this.pendingRequests.get(message.id!);
    if (!request) return;
    
    clearTimeout(request.timeout);
    this.pendingRequests.delete(message.id!);
    
    if (message.error) {
      request.reject(new Error(`MCP Error ${message.error.code}: ${message.error.message}`));
    } else {
      request.resolve(message.result);
    }
  }
  
  /**
   * 요청 메시지 처리
   */
  private async handleRequest(message: MCPMessage): Promise<void> {
    // 서버에서 온 요청 처리 (예: sampling 요청)
    console.log('📨 MCP: Received request:', message.method);
    this.eventManager.emit('mcp:request-received', { message });
  }
  
  /**
   * 알림 메시지 처리
   */
  private async handleNotification(message: MCPMessage): Promise<void> {
    console.log('🔔 MCP: Received notification:', message.method);
    
    switch (message.method) {
      case 'notifications/progress':
        this.handleProgressNotification(message.params);
        break;
      case 'notifications/cancelled':
        this.handleCancelledNotification(message.params);
        break;
      case 'notifications/resources/updated':
        this.handleResourcesUpdatedNotification(message.params);
        break;
      case 'notifications/prompts/updated':
        this.handlePromptsUpdatedNotification(message.params);
        break;
      default:
        this.eventManager.emit('mcp:notification', { method: message.method, params: message.params });
    }
  }
  
  /**
   * 진행 상황 알림 처리
   */
  private handleProgressNotification(params: any): void {
    this.eventManager.emit('mcp:progress', params);
  }
  
  /**
   * 취소 알림 처리
   */
  private handleCancelledNotification(params: any): void {
    this.eventManager.emit('mcp:cancelled', params);
  }
  
  /**
   * 리소스 업데이트 알림 처리
   */
  private handleResourcesUpdatedNotification(params: any): void {
    this.resourcesCache.clear();
    this.eventManager.emit('mcp:resources-updated', params);
  }
  
  /**
   * 프롬프트 업데이트 알림 처리
   */
  private handlePromptsUpdatedNotification(params: any): void {
    this.promptsCache.clear();
    this.eventManager.emit('mcp:prompts-updated', params);
  }
  
  /**
   * 요청 전송
   */
  private async sendRequest(message: MCPMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.websocketClient.getConnectionStatus().isConnected) {
        // 연결되지 않은 경우 큐에 추가
        if (this.requestQueue.length >= this.config.maxQueueSize) {
          reject(new Error('Request queue is full'));
          return;
        }
        
        this.requestQueue.push({
          message,
          resolve,
          reject,
          timestamp: Date.now()
        });
        return;
      }
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id!);
        reject(new Error('Request timeout'));
      }, this.config.timeout);
      
      this.pendingRequests.set(message.id!, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      });
      
      this.websocketClient.send({
        type: 'mcp_request',
        data: message
      });
    });
  }
  
  /**
   * 알림 전송
   */
  private async sendNotification(message: MCPMessage): Promise<void> {
    if (!this.websocketClient.getConnectionStatus().isConnected) {
      throw new Error('WebSocket not connected');
    }
    
    this.websocketClient.send({
      type: 'mcp_notification',
      data: message
    });
  }
  
  /**
   * 요청 큐 처리
   */
  private async processRequestQueue(): Promise<void> {
    const queue = [...this.requestQueue];
    this.requestQueue = [];
    
    for (const queuedRequest of queue) {
      try {
        const result = await this.sendRequest(queuedRequest.message);
        queuedRequest.resolve(result);
      } catch (error) {
        queuedRequest.reject(error as Error);
      }
    }
  }
  
  /**
   * 대기 중인 요청들 거부
   */
  private rejectPendingRequests(error: Error): void {
    for (const [_id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pendingRequests.clear();
    
    // 큐에 있는 요청들도 거부
    for (const queuedRequest of this.requestQueue) {
      queuedRequest.reject(error);
    }
    this.requestQueue = [];
  }
  
  /**
   * 메시지 ID 생성
   */
  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`;
  }
  
  // Public API
  
  /**
   * 도구 목록 조회
   */
  async listTools(useCache = true): Promise<MCPTool[]> {
    if (useCache && this.toolsCache.size > 0) {
      return Array.from(this.toolsCache.values());
    }
    
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'tools/list'
    };
    
    const result = await this.sendRequest(message);
    const tools = result.tools || [];
    
    // 캐시 업데이트
    this.toolsCache.clear();
    for (const tool of tools) {
      this.toolsCache.set(tool.name, tool);
    }
    
    return tools;
  }
  
  /**
   * 도구 호출
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };
    
    return this.sendRequest(message);
  }
  
  /**
   * 리소스 목록 조회
   */
  async listResources(useCache = true): Promise<MCPResource[]> {
    if (useCache && this.resourcesCache.size > 0) {
      return Array.from(this.resourcesCache.values());
    }
    
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'resources/list'
    };
    
    const result = await this.sendRequest(message);
    const resources = result.resources || [];
    
    // 캐시 업데이트
    this.resourcesCache.clear();
    for (const resource of resources) {
      this.resourcesCache.set(resource.uri, resource);
    }
    
    return resources;
  }
  
  /**
   * 리소스 읽기
   */
  async readResource(uri: string): Promise<any> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'resources/read',
      params: { uri }
    };
    
    return this.sendRequest(message);
  }
  
  /**
   * 프롬프트 목록 조회
   */
  async listPrompts(useCache = true): Promise<MCPPrompt[]> {
    if (useCache && this.promptsCache.size > 0) {
      return Array.from(this.promptsCache.values());
    }
    
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'prompts/list'
    };
    
    const result = await this.sendRequest(message);
    const prompts = result.prompts || [];
    
    // 캐시 업데이트
    this.promptsCache.clear();
    for (const prompt of prompts) {
      this.promptsCache.set(prompt.name, prompt);
    }
    
    return prompts;
  }
  
  /**
   * 프롬프트 가져오기
   */
  async getPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.generateMessageId(),
      method: 'prompts/get',
      params: {
        name,
        arguments: args
      }
    };
    
    return this.sendRequest(message);
  }
  
  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.connectionState === MCPConnectionState.READY;
  }
  
  /**
   * 초기화 상태 확인
   */
  isReady(): boolean {
    return this.isInitialized && this.connectionState === MCPConnectionState.READY;
  }
  
  /**
   * 서버 능력 확인
   */
  hasCapability(capability: string): boolean {
    if (!this.serverCapabilities) return false;
    
    const parts = capability.split('.');
    let current: any = this.serverCapabilities;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }
    
    return !!current;
  }
  
  /**
   * 연결 상태 가져오기
   */
  getConnectionState(): MCPConnectionState {
    return this.connectionState;
  }
  
  /**
   * 서버 능력 가져오기
   */
  getServerCapabilities(): MCPServerCapabilities | null {
    return this.serverCapabilities;
  }
  
  /**
   * 캐시 지우기
   */
  clearCache(): void {
    this.toolsCache.clear();
    this.resourcesCache.clear();
    this.promptsCache.clear();
  }
  
  /**
   * 통계 정보 가져오기
   */
  getStatistics() {
    return {
      connectionState: this.connectionState,
      isInitialized: this.isInitialized,
      pendingRequests: this.pendingRequests.size,
      queuedRequests: this.requestQueue.length,
      cachedTools: this.toolsCache.size,
      cachedResources: this.resourcesCache.size,
      cachedPrompts: this.promptsCache.size,
      activeSessions: this.sessions.size,
      currentSessionId: this.currentSessionId,
      sessionState: this.sessionState,
      serverCapabilities: this.serverCapabilities
    };
  }
  
  /**
   * 리소스 정리
   */
  destroy(): void {
    this.rejectPendingRequests(new Error('Client destroyed'));
    this.clearCache();
    this.sessions.clear();
    this.connectionState = MCPConnectionState.DISCONNECTED;
    this.isInitialized = false;
    this.serverCapabilities = null;
  }
} 