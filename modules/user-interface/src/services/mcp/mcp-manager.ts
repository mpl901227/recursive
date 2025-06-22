/**
 * MCP Manager for Recursive Dashboard
 * 
 * MCP 서비스의 고수준 관리를 담당하는 매니저 클래스입니다.
 * - 도구 레지스트리 관리
 * - 요청 큐 관리  
 * - 배치 요청 지원
 * - 에러 처리 및 재시도
 * - 통계 및 모니터링
 */

import { EventManager } from '../../core/events.js';
import { MCPClient, type MCPClientConfig, type MCPTool, type MCPResource, type MCPPrompt } from './mcp-client.js';
import { ToolRegistry, type ToolMetadata, type ToolExecutionContext, type ToolExecutionResult, createToolRegistry } from './tool_registry.js';
import { MCPRequestQueue, RequestPriority, type QueuedRequest } from './request_queue.js';
import type { WebSocketClient } from '../websocket/websocket-client.js';

// Re-export types for external use
export { RequestPriority, type QueuedRequest } from './request_queue.js';

/**
 * 도구 레지스트리 엔트리 (기존 호환성 유지용)
 * @deprecated ToolRegistry의 ToolMetadata를 사용하세요
 */
export interface ToolRegistryEntry {
  tool: MCPTool;
  lastUsed: number;
  usageCount: number;
  averageResponseTime: number;
  errorCount: number;
  isEnabled: boolean;
}

/**
 * 배치 요청 설정
 */
export interface BatchRequestConfig {
  maxBatchSize?: number;
  batchTimeout?: number;
  enableParallel?: boolean;
  maxParallel?: number;
}

/**
 * 레거시 요청 큐 아이템 (기존 호환성 유지용)
 * @deprecated RequestQueue의 QueuedRequest를 사용하세요
 */
export interface LegacyQueuedRequest {
  id: string;
  method: string;
  params: any;
  priority: RequestPriority;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * 에러 처리 전략
 */
export interface ErrorHandlingStrategy {
  shouldRetry: (error: Error, attempt: number) => boolean;
  getRetryDelay: (attempt: number) => number;
  maxRetries: number;
  timeout: number;
}

/**
 * MCP 매니저 설정
 */
export interface MCPManagerConfig {
  clientConfig?: MCPClientConfig;
  batchConfig?: BatchRequestConfig;
  errorHandling?: Partial<ErrorHandlingStrategy>;
  enableToolRegistry?: boolean;
  enableRequestQueue?: boolean;
  enableStatistics?: boolean;
  queueMaxSize?: number;
  queueProcessInterval?: number;
  toolRegistryConfig?: any; // ToolRegistry 설정
}

/**
 * MCP 통계
 */
export interface MCPStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  queueSize: number;
  activeRequests: number;
  toolsRegistered: number;
  resourcesAvailable: number;
  promptsAvailable: number;
  connectionUptime: number;
  lastError: string | null;
  lastErrorTime: number | null;
}

/**
 * 기본 에러 처리 전략
 */
class DefaultErrorHandlingStrategy implements ErrorHandlingStrategy {
  maxRetries = 3;
  timeout = 30000;

  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    
    // 네트워크 오류나 타임아웃은 재시도
    if (error.message.includes('timeout') || 
        error.message.includes('network') ||
        error.message.includes('Connection lost')) {
      return true;
    }
    
    // MCP 프로토콜 오류는 재시도하지 않음
    if (error.message.includes('MCP Error')) {
      return false;
    }
    
    return true;
  }

  getRetryDelay(attempt: number): number {
    // 지수 백오프: 1초, 2초, 4초, 8초...
    return Math.min(1000 * Math.pow(2, attempt), 10000);
  }
}

/**
 * MCP 매니저 클래스
 */
export class MCPManager {
  private readonly config: Required<MCPManagerConfig>;
  private readonly eventManager: EventManager;
  private readonly mcpClient: MCPClient;
  private readonly errorStrategy: ErrorHandlingStrategy;
  
  // 새로운 도구 레지스트리
  private readonly toolRegistry: ToolRegistry;
  
  // 기존 레지스트리들
  private resourceRegistry = new Map<string, MCPResource>();
  private promptRegistry = new Map<string, MCPPrompt>();
  
  // 새로운 요청 큐 시스템
  private requestQueue: MCPRequestQueue;
  
  // 레거시 배치 요청 관리 (점진적 제거 예정)
  private batchQueue: LegacyQueuedRequest[] = [];
  private batchProcessor: NodeJS.Timeout | null = null;
  
  // 큐 프로세서 관리
  private queueProcessorInterval: NodeJS.Timeout | null = null;
  
  // 활성 요청 관리 (Map으로 변경)
  private activeRequestsMap = new Map<string, QueuedRequest>();
  
  // 통계
  private statistics: MCPStatistics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    queueSize: 0,
    activeRequests: 0,
    toolsRegistered: 0,
    resourcesAvailable: 0,
    promptsAvailable: 0,
    connectionUptime: 0,
    lastError: null,
    lastErrorTime: null
  };
  
  private startTime = Date.now();
  private requestId = 0;
  private isDestroyed = false; // 파괴 상태 추적
  
  constructor(
    websocketClient: WebSocketClient,
    eventManager: EventManager,
    config: MCPManagerConfig = {}
  ) {
    this.eventManager = eventManager;
    
    // 기본값으로 설정 완성
    this.config = {
      clientConfig: {},
      batchConfig: {
        maxBatchSize: 10,
        batchTimeout: 100,
        enableParallel: true,
        maxParallel: 5
      },
      errorHandling: {},
      enableToolRegistry: true,
      enableRequestQueue: true,
      enableStatistics: true,
      queueMaxSize: 1000,
      queueProcessInterval: 50,
      toolRegistryConfig: undefined,
      ...config
    };
    
    // 에러 처리 전략 설정
    const defaultStrategy = new DefaultErrorHandlingStrategy();
    this.errorStrategy = {
      shouldRetry: this.config.errorHandling.shouldRetry || defaultStrategy.shouldRetry.bind(defaultStrategy),
      getRetryDelay: this.config.errorHandling.getRetryDelay || defaultStrategy.getRetryDelay.bind(defaultStrategy),
      maxRetries: this.config.errorHandling.maxRetries ?? defaultStrategy.maxRetries,
      timeout: this.config.errorHandling.timeout ?? defaultStrategy.timeout
    };
    
    // MCP 클라이언트 생성
    this.mcpClient = new MCPClient(
      websocketClient,
      eventManager,
      this.config.clientConfig
    );
    
    // 새로운 도구 레지스트리 생성
    this.toolRegistry = createToolRegistry(eventManager, this.config.toolRegistryConfig);
    
    // MCP 클라이언트를 도구 레지스트리에 설정
    this.toolRegistry.setMCPClient(this.mcpClient);
    
    // 새로운 요청 큐 초기화
    this.requestQueue = new MCPRequestQueue(
      this.eventManager,
      this.mcpClient,
      {
        maxSize: this.config.queueMaxSize,
        maxConcurrent: this.config.batchConfig.maxParallel || 5,
        processInterval: this.config.queueProcessInterval,
        enablePriority: true,
        enableRateLimit: false,
        enableStatistics: this.config.enableStatistics,
        enableDebugging: false,
        requestTimeout: this.config.errorHandling.timeout || 30000
      }
    );
    
    this.setupEventListeners();
  }
  
  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // MCP 클라이언트 이벤트
    this.eventManager.on('mcp:ready', () => {
      this.handleMCPReady();
    });
    
    this.eventManager.on('mcp:disconnected', () => {
      this.handleMCPDisconnected();
    });
    
    this.eventManager.on('mcp:error', (event: any) => {
      this.handleMCPError(event.error || event);
    });
    
    // 도구/리소스/프롬프트 업데이트 이벤트
    this.eventManager.on('mcp:tools-updated', () => {
      this.refreshToolRegistry();
    });
    
    this.eventManager.on('mcp:resources-updated', () => {
      this.refreshResourceRegistry();
    });
    
    this.eventManager.on('mcp:prompts-updated', () => {
      this.refreshPromptRegistry();
    });
    
    // 도구 레지스트리 이벤트
    this.eventManager.on('tool-registry:tool-registered', (event: any) => {
      this.statistics.toolsRegistered++;
      this.eventManager.emit('mcp-manager:tool-registered', event);
    });
    
    this.eventManager.on('tool-registry:execution-logged', (event: any) => {
      this.eventManager.emit('mcp-manager:tool-executed', event);
    });
  }
  
  /**
   * MCP 준비 이벤트 핸들러
   */
  private async handleMCPReady(): Promise<void> {
    console.log('✅ MCP Manager: MCP client is ready');
    
    try {
      // 도구, 리소스, 프롬프트 레지스트리 초기화
      if (this.config.enableToolRegistry) {
        await this.initializeRegistries();
      }
      
      // 요청 큐 프로세서 시작
      if (this.config.enableRequestQueue) {
        this.startQueueProcessor();
      }
      
      // 배치 프로세서 시작
      if (this.config.batchConfig.enableParallel) {
        this.startBatchProcessor();
      }
      
      this.eventManager.emit('mcp-manager:ready');
      
    } catch (error) {
      console.error('❌ MCP Manager: Failed to initialize:', error);
      this.eventManager.emit('mcp-manager:error', { error });
    }
  }
  
  /**
   * MCP 연결 해제 이벤트 핸들러
   */
  private handleMCPDisconnected(): void {
    console.log('📡 MCP Manager: MCP client disconnected');
    
    // 프로세서 중지
    this.stopQueueProcessor();
    this.stopBatchProcessor();
    
    // 활성 요청들 실패 처리
    this.failActiveRequests(new Error('MCP connection lost'));
    
    this.eventManager.emit('mcp-manager:disconnected');
  }
  
  /**
   * MCP 에러 이벤트 핸들러
   */
  private handleMCPError(error: Error): void {
    console.error('❌ MCP Manager: MCP error:', error);
    
    this.statistics.lastError = error.message;
    this.statistics.lastErrorTime = Date.now();
    
    this.eventManager.emit('mcp-manager:error', { error });
  }
  
  /**
   * 레지스트리 초기화
   */
  private async initializeRegistries(): Promise<void> {
    await Promise.all([
      this.refreshToolRegistry(),
      this.refreshResourceRegistry(),
      this.refreshPromptRegistry()
    ]);
  }
  
  /**
   * 도구 레지스트리 새로고침 (테스트에서 접근 가능하도록 public으로 변경)
   */
  public async refreshToolRegistry(): Promise<void> {
    try {
      const tools = await this.mcpClient.listTools(false); // 캐시 무시
      
      // 기존 등록된 도구들의 ID 목록
      const currentToolIds = this.toolRegistry.getRegisteredTools();
      
      // 새 도구들 등록
      for (const tool of tools) {
        try {
          await this.toolRegistry.registerTool(tool, {
            autoLoad: true,
            overwrite: true
          });
        } catch (error) {
          console.warn(`Failed to register tool ${tool.name}:`, error);
        }
      }
      
      // 더 이상 존재하지 않는 도구들 제거
      const newToolNames = new Set(tools.map(t => t.name));
      for (const toolId of currentToolIds) {
        const metadata = this.toolRegistry.getToolMetadata(toolId);
        if (metadata && !newToolNames.has(metadata.name)) {
          await this.toolRegistry.unregisterTool(toolId);
        }
      }
      
      const stats = this.toolRegistry.getRegistryStatistics();
      this.statistics.toolsRegistered = stats.totalTools;
      console.log(`🔧 MCP Manager: Registered ${stats.totalTools} tools`);
      
    } catch (error) {
      console.error('❌ MCP Manager: Failed to refresh tool registry:', error);
    }
  }
  
  /**
   * 리소스 레지스트리 새로고침
   */
  private async refreshResourceRegistry(): Promise<void> {
    try {
      const resources = await this.mcpClient.listResources(false);
      
      this.resourceRegistry.clear();
      for (const resource of resources) {
        this.resourceRegistry.set(resource.uri, resource);
      }
      
      this.statistics.resourcesAvailable = this.resourceRegistry.size;
      console.log(`📁 MCP Manager: Registered ${this.resourceRegistry.size} resources`);
      
    } catch (error) {
      console.error('❌ MCP Manager: Failed to refresh resource registry:', error);
    }
  }
  
  /**
   * 프롬프트 레지스트리 새로고침
   */
  private async refreshPromptRegistry(): Promise<void> {
    try {
      const prompts = await this.mcpClient.listPrompts(false);
      
      this.promptRegistry.clear();
      for (const prompt of prompts) {
        this.promptRegistry.set(prompt.name, prompt);
      }
      
      this.statistics.promptsAvailable = this.promptRegistry.size;
      console.log(`💬 MCP Manager: Registered ${this.promptRegistry.size} prompts`);
      
    } catch (error) {
      console.error('❌ MCP Manager: Failed to refresh prompt registry:', error);
    }
  }
  
  /**
   * 요청 큐 프로세서 시작
   */
  private startQueueProcessor(): void {
    if (this.queueProcessorInterval || this.isDestroyed) return;
    
    this.queueProcessorInterval = setInterval(() => {
      this.processRequestQueue();
    }, this.config.queueProcessInterval);
  }
  
  /**
   * 요청 큐 프로세서 중지
   */
  private stopQueueProcessor(): void {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
      this.queueProcessorInterval = null;
    }
  }
  
  /**
   * 배치 프로세서 시작
   */
  private startBatchProcessor(): void {
    if (this.batchProcessor || this.isDestroyed) return;
    
    this.batchProcessor = setInterval(() => {
      this.processBatchQueue();
    }, this.config.batchConfig.batchTimeout);
  }
  
  /**
   * 배치 프로세서 중지
   */
  private stopBatchProcessor(): void {
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
      this.batchProcessor = null;
    }
  }
  
  /**
   * 요청 큐 처리 (빈 큐를 사용하여 구현)
   */
  private async processRequestQueue(): Promise<void> {
    // 실제 요청 큐 처리는 MCPRequestQueue에서 처리됨
    // 여기서는 통계만 업데이트
    const queueStatus = this.requestQueue.getStatus();
    this.statistics.queueSize = queueStatus.queueSize;
    this.statistics.activeRequests = queueStatus.activeRequests;
  }
  
  /**
   * 배치 큐 처리
   */
  private async processBatchQueue(): Promise<void> {
    if (this.batchQueue.length === 0 || this.isDestroyed) return;
    
    const batchSize = Math.min(
      this.batchQueue.length,
      this.config.batchConfig.maxBatchSize || 10
    );
    
    const batch = this.batchQueue.splice(0, batchSize);
    
    // 배치 요청을 병렬로 처리
    const promises = batch.map(request => this.processLegacyRequest(request));
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('❌ MCP Manager: Batch processing error:', error);
    }
  }
  
  /**
   * 레거시 요청 처리
   */
  private async processLegacyRequest(request: LegacyQueuedRequest): Promise<void> {
    if (this.isDestroyed) {
      request.reject(new Error('Manager destroyed'));
      return;
    }
    
    // QueuedRequest로 변환하여 activeRequestsMap에 추가
    const queuedRequest: QueuedRequest = {
      ...request,
      status: RequestPriority.NORMAL as any, // 임시 변환
      tags: [],
    };
    
    this.activeRequestsMap.set(request.id, queuedRequest);
    
    const startTime = Date.now();
    
    try {
      let result: any;
      
      switch (request.method) {
        case 'tools/call':
          result = await this.mcpClient.callTool(
            request.params.name,
            request.params.arguments || {}
          );
          break;
        case 'resources/read':
          result = await this.mcpClient.readResource(request.params.uri);
          break;
        case 'prompts/get':
          result = await this.mcpClient.getPrompt(
            request.params.name,
            request.params.arguments || {}
          );
          break;
        default:
          throw new Error(`Unsupported method: ${request.method}`);
      }
      
      const responseTime = Date.now() - startTime;
      this.updateStatistics(true, responseTime);
      this.updateToolStatistics(request.params.name, responseTime, false);
      
      request.resolve(result);
      
    } catch (error) {
      const shouldRetry = this.errorStrategy.shouldRetry(
        error as Error,
        request.retryCount
      );
      
      if (shouldRetry && request.retryCount < request.maxRetries && !this.isDestroyed) {
        // 재시도
        request.retryCount++;
        const delay = this.errorStrategy.getRetryDelay(request.retryCount);
        
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.batchQueue.push(request);
          }
        }, delay);
        
        console.log(`🔄 MCP Manager: Retrying request ${request.id} (attempt ${request.retryCount})`);
        
      } else {
        // 최종 실패
        this.updateStatistics(false, Date.now() - startTime);
        this.updateToolStatistics(request.params.name, 0, true);
        
        request.reject(error as Error);
      }
    } finally {
      this.activeRequestsMap.delete(request.id);
    }
  }
  
  /**
   * 통계 업데이트
   */
  private updateStatistics(success: boolean, responseTime: number): void {
    this.statistics.totalRequests++;
    
    if (success) {
      this.statistics.successfulRequests++;
      
      // 평균 응답 시간 계산
      const total = this.statistics.averageResponseTime * (this.statistics.successfulRequests - 1);
      this.statistics.averageResponseTime = (total + responseTime) / this.statistics.successfulRequests;
    } else {
      this.statistics.failedRequests++;
    }
    
    this.statistics.connectionUptime = Date.now() - this.startTime;
  }
  
  /**
   * 도구 통계 업데이트
   */
  private updateToolStatistics(toolName: string, responseTime: number, isError: boolean): void {
    // 도구 ID로 메타데이터 찾기
    const tools = this.toolRegistry.findTools({ namePattern: toolName });
    const toolMetadata = tools.find(t => t.name === toolName);
    
    if (toolMetadata) {
      // ToolRegistry의 recordExecution 메서드 사용
      const context: ToolExecutionContext = {
        executionId: this.generateRequestId(),
        environment: 'production',
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result: ToolExecutionResult = {
        success: !isError,
        executionTime: responseTime,
        ...(isError && { 
          error: { 
            code: 'EXECUTION_ERROR', 
            message: 'Tool execution failed' 
          } 
        })
      };
      
      this.toolRegistry.recordExecution(toolMetadata.id, context, result);
    }
  }
  
  /**
   * 활성 요청들 실패 처리
   */
  private failActiveRequests(error: Error): void {
    for (const request of this.activeRequestsMap.values()) {
      request.reject(error);
    }
    this.activeRequestsMap.clear();
    
    // 레거시 배치 큐에 있는 요청들도 실패 처리
    for (const request of this.batchQueue) {
      request.reject(error);
    }
    this.batchQueue = [];
  }
  
  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${++this.requestId}_${Date.now()}`;
  }
  
  // Public API
  
  /**
   * 도구 호출 (새로운 RequestQueue 사용)
   */
  async callTool(
    name: string,
    args: Record<string, any> = {},
    options: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
      useBatch?: boolean;
    } = {}
  ): Promise<any> {
    if (this.isDestroyed) {
      throw new Error('Manager destroyed');
    }
    
    // 도구가 등록되어 있는지 확인
    if (this.config.enableToolRegistry) {
      const tools = this.toolRegistry.findTools({ namePattern: name });
      const tool = tools.find(t => t.name === name);
      
      if (!tool) {
        throw new Error(`Tool '${name}' is not registered`);
      }
      
      // 도구가 비활성화되어 있는지 확인
      if (!tool.isEnabled) {
        throw new Error(`Tool '${name}' is disabled`);
      }
    }
    
    // 큐가 비활성화된 경우 직접 실행
    if (!this.config.enableRequestQueue) {
      return await this.mcpClient.callTool(name, args);
    }
    
    // exactOptionalPropertyTypes 호환을 위한 옵션 객체 생성
    const queueOptions: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
    } = {
      priority: options.priority || RequestPriority.NORMAL,
      tags: ['tool-call', name]
    };
    
    // undefined가 아닌 경우에만 속성 추가
    if (options.timeout !== undefined) {
      queueOptions.timeout = options.timeout;
    }
    
    if (options.maxRetries !== undefined) {
      queueOptions.maxRetries = options.maxRetries;
    }
    
    // 새로운 RequestQueue 사용
    try {
      const result = await this.requestQueue.enqueue(
        'tools/call',
        { name, arguments: args },
        queueOptions
      );
      
      this.statistics.totalRequests++;
      this.statistics.successfulRequests++;
      this.updateStatistics(true, 0);
      
      return result;
    } catch (error) {
      this.statistics.totalRequests++;
      this.statistics.failedRequests++;
      this.updateStatistics(false, 0);
      throw error;
    }
  }
  
  /**
   * 리소스 읽기 (새로운 RequestQueue 사용)
   */
  async readResource(
    uri: string,
    options: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<any> {
    if (this.isDestroyed) {
      throw new Error('Manager destroyed');
    }
    
    // 큐가 비활성화된 경우 직접 실행
    if (!this.config.enableRequestQueue) {
      return await this.mcpClient.readResource(uri);
    }
    
    // exactOptionalPropertyTypes 호환을 위한 옵션 객체 생성
    const queueOptions: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
    } = {
      priority: options.priority || RequestPriority.NORMAL,
      tags: ['resource-read', uri]
    };
    
    // undefined가 아닌 경우에만 속성 추가
    if (options.timeout !== undefined) {
      queueOptions.timeout = options.timeout;
    }
    
    if (options.maxRetries !== undefined) {
      queueOptions.maxRetries = options.maxRetries;
    }
    
    // 새로운 RequestQueue 사용
    try {
      const result = await this.requestQueue.enqueue(
        'resources/read',
        { uri },
        queueOptions
      );
      
      this.statistics.totalRequests++;
      this.statistics.successfulRequests++;
      this.updateStatistics(true, 0);
      
      return result;
    } catch (error) {
      this.statistics.totalRequests++;
      this.statistics.failedRequests++;
      this.updateStatistics(false, 0);
      throw error;
    }
  }
  
  /**
   * 프롬프트 가져오기 (새로운 RequestQueue 사용)
   */
  async getPrompt(
    name: string,
    args: Record<string, any> = {},
    options: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<any> {
    if (this.isDestroyed) {
      throw new Error('Manager destroyed');
    }
    
    // 큐가 비활성화된 경우 직접 실행
    if (!this.config.enableRequestQueue) {
      return await this.mcpClient.getPrompt(name, args);
    }
    
    // exactOptionalPropertyTypes 호환을 위한 옵션 객체 생성
    const queueOptions: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
    } = {
      priority: options.priority || RequestPriority.NORMAL,
      tags: ['prompt-get', name]
    };
    
    // undefined가 아닌 경우에만 속성 추가
    if (options.timeout !== undefined) {
      queueOptions.timeout = options.timeout;
    }
    
    if (options.maxRetries !== undefined) {
      queueOptions.maxRetries = options.maxRetries;
    }
    
    // 새로운 RequestQueue 사용
    try {
      const result = await this.requestQueue.enqueue(
        'prompts/get',
        { name, arguments: args },
        queueOptions
      );
      
      this.statistics.totalRequests++;
      this.statistics.successfulRequests++;
      this.updateStatistics(true, 0);
      
      return result;
    } catch (error) {
      this.statistics.totalRequests++;
      this.statistics.failedRequests++;
      this.updateStatistics(false, 0);
      throw error;
    }
  }
  
  /**
   * 배치 요청 실행
   */
  async executeBatch(requests: Array<{
    method: 'tools/call' | 'resources/read' | 'prompts/get';
    params: any;
    priority?: RequestPriority;
  }>): Promise<Array<{ success: boolean; result?: any; error?: Error }>> {
    const promises = requests.map(req => {
      const options = req.priority !== undefined ? { priority: req.priority } : {};
      
      switch (req.method) {
        case 'tools/call':
          return this.callTool(
            req.params.name,
            req.params.arguments,
            { ...options, useBatch: true }
          );
        case 'resources/read':
          return this.readResource(req.params.uri, options);
        case 'prompts/get':
          return this.getPrompt(
            req.params.name,
            req.params.arguments,
            options
          );
        default:
          return Promise.reject(new Error(`Unsupported method: ${req.method}`));
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return { success: true, result: result.value };
      } else {
        return { success: false, error: result.reason };
      }
    });
  }
  
  /**
   * 도구 목록 가져오기 (ToolRegistry API 사용)
   */
  getRegisteredTools(): ToolRegistryEntry[] {
    // ToolRegistry에서 ToolMetadata를 가져와서 ToolRegistryEntry로 변환
    const tools = this.toolRegistry.findTools();
    return tools.map(metadata => this.convertToToolRegistryEntry(metadata));
  }
  
  /**
   * ToolMetadata를 ToolRegistryEntry로 변환하는 헬퍼 메서드
   */
  private convertToToolRegistryEntry(metadata: ToolMetadata): ToolRegistryEntry {
    // MCPTool 형식으로 변환 - inputSchema 타입 호환성 보장
    const tool: MCPTool = {
      name: metadata.name,
      description: metadata.description,
      inputSchema: {
        type: metadata.inputSchema.type || 'object',
        properties: metadata.inputSchema.properties || {},
        ...(metadata.inputSchema.required && { required: metadata.inputSchema.required })
      }
    };
    
    return {
      tool,
      lastUsed: metadata.lastUsedAt,
      usageCount: metadata.usageCount,
      averageResponseTime: metadata.averageExecutionTime,
      errorCount: metadata.errorCount,
      isEnabled: metadata.isEnabled
    };
  }
  
  /**
   * 리소스 목록 가져오기
   */
  getAvailableResources(): MCPResource[] {
    return Array.from(this.resourceRegistry.values());
  }
  
  /**
   * 프롬프트 목록 가져오기
   */
  getAvailablePrompts(): MCPPrompt[] {
    return Array.from(this.promptRegistry.values());
  }
  
  /**
   * 도구 활성화/비활성화
   */
  setToolEnabled(toolName: string, enabled: boolean): boolean {
    // 이름으로 도구를 찾아서 활성화/비활성화
    const tools = this.toolRegistry.findTools({ namePattern: toolName });
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) return false;
    
    return this.toolRegistry.setToolEnabled(tool.id, enabled);
  }
  
  /**
   * 도구 레지스트리 접근 (호환성 유지용 - 테스트용)
   * @deprecated 새로운 ToolRegistry API를 사용하세요
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
  
  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.mcpClient.isConnected();
  }
  
  /**
   * 준비 상태 확인
   */
  isReady(): boolean {
    return this.mcpClient.isReady();
  }
  
  /**
   * 통계 정보 가져오기
   */
  getStatistics(): MCPStatistics {
    const queueStatus = this.requestQueue.getStatus();
    return {
      ...this.statistics,
      queueSize: queueStatus.queueSize,
      activeRequests: queueStatus.activeRequests
    };
  }
  
  /**
   * MCP 클라이언트 가져오기 (직접 접근용)
   */
  getClient(): MCPClient {
    return this.mcpClient;
  }
  
  /**
   * 큐 지우기
   */
  clearQueue(): void {
    // 새로운 요청 큐 지우기
    this.requestQueue.clear();
    
    // 레거시 배치 큐 지우기
    const error = new Error('Queue cleared');
    for (const request of this.batchQueue) {
      request.reject(error);
    }
    this.batchQueue = [];
    
    this.statistics.queueSize = 0;
  }
  
  /**
   * 리소스 정리
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stopQueueProcessor();
    this.stopBatchProcessor();
    this.failActiveRequests(new Error('Manager destroyed'));
    this.requestQueue.destroy();
    this.toolRegistry.destroy();
    this.resourceRegistry.clear();
    this.promptRegistry.clear();
    this.mcpClient.destroy();
  }
}

/**
 * MCP 매니저 생성 헬퍼 함수
 */
export function createMCPManager(
  websocketClient: WebSocketClient,
  eventManager: EventManager,
  config?: MCPManagerConfig
): MCPManager {
  return new MCPManager(websocketClient, eventManager, config);
}