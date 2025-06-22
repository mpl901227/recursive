/**
 * MCP Tool Registry for Recursive Dashboard
 * 
 * MCP 도구들의 동적 로딩, 메타데이터 관리, 권한 및 보안 검사, 버전 관리를 담당합니다.
 * - 도구 등록 및 해제
 * - 동적 도구 로딩 및 캐싱
 * - 권한 기반 접근 제어
 * - 도구 버전 호환성 관리
 * - 사용 통계 및 성능 모니터링
 */

import { EventManager } from '../../core/events.js';
import type { MCPTool } from './mcp-client.js';
import type { Tool, ToolPermission, JSONSchema } from '../../types/index.js';

/**
 * 도구 메타데이터 정의
 */
export interface ToolMetadata {
  /** 도구 고유 ID */
  id: string;
  /** 도구 이름 */
  name: string;
  /** 도구 설명 */
  description: string;
  /** 입력 스키마 */
  inputSchema: JSONSchema;
  /** 도구 버전 */
  version: string;
  /** 도구 카테고리 */
  category: string;
  /** 권한 레벨 */
  permissions: ToolPermission[];
  /** 등록 시간 */
  registeredAt: number;
  /** 마지막 사용 시간 */
  lastUsedAt: number;
  /** 사용 횟수 */
  usageCount: number;
  /** 평균 실행 시간 (ms) */
  averageExecutionTime: number;
  /** 성공 횟수 */
  successCount: number;
  /** 실패 횟수 */
  errorCount: number;
  /** 활성 상태 */
  isEnabled: boolean;
  /** 로딩 상태 */
  isLoaded: boolean;
  /** 검증 상태 */
  isValidated: boolean;
  /** 태그들 */
  tags: string[];
  /** 의존성들 */
  dependencies: string[];
  /** 제공자 정보 */
  provider: ToolProvider;
  /** 보안 정책 */
  security: SecurityPolicy;
}

/**
 * 도구 제공자 정보
 */
export interface ToolProvider {
  /** 제공자 이름 */
  name: string;
  /** 제공자 버전 */
  version: string;
  /** 제공자 URL */
  url?: string;
  /** 검증된 제공자 여부 */
  verified: boolean;
  /** 신뢰 수준 */
  trustLevel: TrustLevel;
}

/**
 * 신뢰 수준 타입
 */
export type TrustLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'system';

/**
 * 보안 정책 정의
 */
export interface SecurityPolicy {
  /** 필요한 권한들 */
  requiredPermissions: ToolPermission[];
  /** 허용된 사용자 역할들 */
  allowedRoles: string[];
  /** 액세스 제한 */
  accessRestrictions: AccessRestriction[];
  /** 감사 로깅 필요 여부 */
  requiresAuditing: boolean;
  /** 승인 필요 여부 */
  requiresApproval: boolean;
  /** 샌드박스 실행 필요 여부 */
  requiresSandbox: boolean;
}

/**
 * 액세스 제한 타입
 */
export interface AccessRestriction {
  /** 제한 타입 */
  type: 'time' | 'usage' | 'rate' | 'location' | 'user';
  /** 제한 값 */
  value: any;
  /** 제한 설명 */
  description: string;
}

/**
 * 도구 등록 옵션
 */
export interface ToolRegistrationOptions {
  /** 자동 로드 여부 */
  autoLoad?: boolean;
  /** 검증 건너뛰기 */
  skipValidation?: boolean;
  /** 기존 도구 덮어쓰기 */
  overwrite?: boolean;
  /** 태그들 */
  tags?: string[];
  /** 커스텀 보안 정책 */
  customSecurity?: Partial<SecurityPolicy>;
}

/**
 * 도구 실행 컨텍스트
 */
export interface ToolExecutionContext {
  /** 실행 ID */
  executionId: string;
  /** 사용자 ID */
  userId?: string;
  /** 사용자 역할 */
  userRole?: string;
  /** 실행 환경 */
  environment: 'development' | 'staging' | 'production';
  /** 요청 시간 */
  requestedAt: number;
  /** 세션 ID */
  sessionId?: string;
  /** 추가 컨텍스트 */
  metadata: Record<string, any>;
}

/**
 * 도구 실행 결과
 */
export interface ToolExecutionResult {
  /** 성공 여부 */
  success: boolean;
  /** 결과 데이터 */
  result?: any;
  /** 오류 정보 */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** 실행 시간 (ms) */
  executionTime: number;
  /** 메모리 사용량 (bytes) */
  memoryUsage?: number;
  /** 경고 메시지들 */
  warnings?: string[];
}

/**
 * 버전 호환성 정보
 */
export interface VersionCompatibility {
  /** 현재 버전 */
  current: string;
  /** 최소 호환 버전 */
  minimum: string;
  /** 최대 호환 버전 */
  maximum?: string;
  /** 호환성 상태 */
  status: 'compatible' | 'deprecated' | 'incompatible' | 'unknown';
  /** 마이그레이션 가이드 */
  migrationGuide?: string;
}

/**
 * 도구 필터 조건
 */
export interface ToolFilter {
  /** 이름 패턴 */
  namePattern?: string | RegExp;
  /** 카테고리 */
  category?: string;
  /** 태그들 */
  tags?: string[];
  /** 권한 */
  permissions?: ToolPermission[];
  /** 활성 상태 */
  enabled?: boolean;
  /** 신뢰 수준 */
  trustLevel?: TrustLevel;
  /** 제공자 */
  provider?: string;
}

/**
 * 도구 정렬 기준
 */
export type ToolSortBy = 'name' | 'category' | 'usageCount' | 'lastUsed' | 'registeredAt' | 'trustLevel';

/**
 * 도구 로더 인터페이스
 */
export interface ToolLoader {
  /** 도구 로드 */
  load(toolId: string): Promise<MCPTool>;
  /** 도구 언로드 */
  unload(toolId: string): Promise<void>;
  /** 로드 가능한 도구 목록 */
  listAvailable(): Promise<string[]>;
  /** 로더 타입 */
  type: string;
}

/**
 * 기본 도구 로더 (MCP 서버에서 로드)
 */
class MCPToolLoader implements ToolLoader {
  readonly type = 'mcp';
  
  constructor(private mcpClient: any) {}
  
  async load(toolId: string): Promise<MCPTool> {
    const tools = await this.mcpClient.listTools();
    if (!tools || !Array.isArray(tools)) {
      throw new Error('MCP client returned invalid tools list');
    }
    const tool = tools.find((t: MCPTool) => t.name === toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }
    return tool;
  }
  
  async unload(_toolId: string): Promise<void> {
    // MCP 도구는 서버에서 관리되므로 별도 언로드 불필요
  }
  
  async listAvailable(): Promise<string[]> {
    const tools = await this.mcpClient.listTools();
    if (!tools || !Array.isArray(tools)) {
      return [];
    }
    return tools.map((t: MCPTool) => t.name);
  }
}

/**
 * 실행 통계 타입
 */
interface ExecutionStats {
  totalExecutions: number;
  totalTime: number;
  errors: number;
  lastExecution: number;
}

/**
 * 도구 레지스트리 클래스
 */
export class ToolRegistry {
  private readonly eventManager: EventManager;
  
  // 도구 저장소
  private readonly tools = new Map<string, ToolMetadata>();
  private readonly loaders = new Map<string, ToolLoader>();
  
  // 캐시 및 인덱스
  private readonly categoryIndex = new Map<string, Set<string>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly permissionIndex = new Map<ToolPermission, Set<string>>();
  
  // 실행 통계
  private readonly executionStats = new Map<string, ExecutionStats>();
  
  // 설정
  private readonly config: {
    maxCacheSize: number;
    defaultTrustLevel: TrustLevel;
    autoCleanup: boolean;
    auditLogging: boolean;
    validationTimeout: number;
  };
  
  constructor(eventManager: EventManager, config: Partial<typeof ToolRegistry.prototype.config> = {}) {
    this.eventManager = eventManager;
    this.config = {
      maxCacheSize: 1000,
      defaultTrustLevel: 'medium',
      autoCleanup: true,
      auditLogging: true,
      validationTimeout: 5000,
      ...config
    };
    
    this.setupEventListeners();
  }
  
  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 정리 이벤트 (주기적으로 사용하지 않는 도구 정리)
    if (this.config.autoCleanup) {
      setInterval(() => {
        this.performCleanup();
      }, 60000); // 1분마다
    }
  }
  
  /**
   * 도구 로더 등록
   */
  registerLoader(type: string, loader: ToolLoader): void {
    this.loaders.set(type, loader);
    this.eventManager.emit('tool-registry:loader-registered', { type, loader });
  }
  
  /**
   * MCP 클라이언트 설정 (기본 로더 등록)
   */
  setMCPClient(mcpClient: any): void {
    const mcpLoader = new MCPToolLoader(mcpClient);
    this.registerLoader('mcp', mcpLoader);
  }
  
  /**
   * 도구가 Tool 타입인지 확인하는 타입 가드
   */
  private isToolType(tool: MCPTool | Tool): tool is Tool {
    return 'version' in tool || 'category' in tool || 'permissions' in tool;
  }
  
  /**
   * 도구 등록
   */
  async registerTool(
    tool: MCPTool | Tool, 
    options: ToolRegistrationOptions = {}
  ): Promise<string> {
    const toolId = this.generateToolId(tool.name);
    
    // 기존 도구 확인 - overwrite 옵션이 false일 때만 에러 발생
    const existingToolId = this.findExistingToolId(tool.name);
    if (existingToolId && !options.overwrite) {
      throw new Error(`Tool with name ${tool.name} already exists`);
    }
    
    // 타입에 따른 속성 추출
    const version = this.isToolType(tool) ? (tool.version || '1.0.0') : '1.0.0';
    const category = this.isToolType(tool) ? (tool.category || 'general') : 'general';
    const permissions = this.isToolType(tool) ? (tool.permissions || []) : [];
    
    // 도구 메타데이터 생성 - 모든 옵셔널 속성에 기본값 제공
    const metadata: ToolMetadata = {
      id: toolId,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version,
      category,
      permissions,
      registeredAt: Date.now(),
      lastUsedAt: 0,
      usageCount: 0,
      averageExecutionTime: 0,
      successCount: 0,
      errorCount: 0,
      isEnabled: true,
      isLoaded: false,
      isValidated: false,
      tags: options.tags || [],
      dependencies: [],
      provider: {
        name: 'mcp',
        version: '1.0.0',
        verified: true,
        trustLevel: this.config.defaultTrustLevel
      },
      security: {
        requiredPermissions: permissions,
        allowedRoles: ['user', 'admin'],
        accessRestrictions: [],
        requiresAuditing: this.config.auditLogging,
        requiresApproval: false,
        requiresSandbox: false,
        ...options.customSecurity
      }
    };
    
    // 검증 수행
    if (!options.skipValidation) {
      await this.validateTool(metadata, options);
      metadata.isValidated = true;
    }
    
    // 기존 도구가 있으면 제거
    if (existingToolId) {
      await this.unregisterTool(existingToolId);
    }
    
    // 도구 등록
    this.tools.set(toolId, metadata);
    
    // 인덱스 업데이트
    this.updateIndexes(toolId, metadata);
    
    // 자동 로드
    if (options.autoLoad) {
      try {
        await this.loadTool(toolId);
        // 로딩 성공시 메타데이터 업데이트
        const updatedMetadata = this.tools.get(toolId);
        if (updatedMetadata) {
          updatedMetadata.isLoaded = true;
        }
      } catch (error) {
        console.warn(`Failed to auto-load tool ${toolId}:`, error);
        // 로딩 실패시 메타데이터 업데이트
        const updatedMetadata = this.tools.get(toolId);
        if (updatedMetadata) {
          updatedMetadata.isLoaded = false;
        }
      }
    }
    
    // 이벤트 발생
    this.eventManager.emit('tool-registry:tool-registered', {
      toolId,
      metadata,
      options
    });
    
    return toolId;
  }
  
  /**
   * 기존 도구 ID 찾기
   */
  private findExistingToolId(toolName: string): string | undefined {
    for (const [id, metadata] of this.tools.entries()) {
      if (metadata.name === toolName) {
        return id;
      }
    }
    return undefined;
  }
  
  /**
   * 도구 제거
   */
  async unregisterTool(toolId: string): Promise<boolean> {
    const metadata = this.tools.get(toolId);
    if (!metadata) {
      return false;
    }
    
    // 로드된 도구면 언로드
    if (metadata.isLoaded) {
      await this.unloadTool(toolId);
    }
    
    // 도구 제거
    this.tools.delete(toolId);
    
    // 인덱스에서 제거
    this.removeFromIndexes(toolId, metadata);
    
    // 실행 통계 제거
    this.executionStats.delete(toolId);
    
    // 이벤트 발생
    this.eventManager.emit('tool-registry:tool-unregistered', {
      toolId,
      metadata
    });
    
    return true;
  }
  
  /**
   * 도구 동적 로딩
   */
  async loadTool(toolId: string): Promise<boolean> {
    const metadata = this.tools.get(toolId);
    if (!metadata) {
      throw new Error(`Tool ${toolId} not found`);
    }
    
    if (metadata.isLoaded) {
      return true;
    }
    
    try {
      // 적절한 로더 찾기
      const loader = this.loaders.get(metadata.provider.name);
      if (!loader) {
        throw new Error(`No loader found for provider ${metadata.provider.name}`);
      }
      
      // 도구 로드
      await loader.load(metadata.name);
      
      // 상태 업데이트
      metadata.isLoaded = true;
      
      // 이벤트 발생
      this.eventManager.emit('tool-registry:tool-loaded', {
        toolId,
        metadata
      });
      
      return true;
    } catch (error) {
      metadata.isLoaded = false;
      this.eventManager.emit('tool-registry:tool-load-error', {
        toolId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * 도구 언로딩
   */
  async unloadTool(toolId: string): Promise<boolean> {
    const metadata = this.tools.get(toolId);
    if (!metadata || !metadata.isLoaded) {
      return false;
    }
    
    try {
      const loader = this.loaders.get(metadata.provider.name);
      if (loader) {
        await loader.unload(metadata.name);
      }
      
      metadata.isLoaded = false;
      
      this.eventManager.emit('tool-registry:tool-unloaded', {
        toolId,
        metadata
      });
      
      return true;
    } catch (error) {
      this.eventManager.emit('tool-registry:tool-unload-error', {
        toolId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * 도구 권한 검사
   */
  checkPermissions(
    toolId: string, 
    context: ToolExecutionContext
  ): { allowed: boolean; reasons: string[] } {
    const metadata = this.tools.get(toolId);
    if (!metadata) {
      return { allowed: false, reasons: ['Tool not found'] };
    }
    
    const reasons: string[] = [];
    let allowed = true;
    
    // 도구 활성 상태 확인
    if (!metadata.isEnabled) {
      allowed = false;
      reasons.push('Tool is disabled');
    }
    
    // 신뢰 수준 확인
    if (metadata.provider.trustLevel === 'untrusted') {
      allowed = false;
      reasons.push('Tool provider is untrusted');
    }
    
    // 역할 기반 권한 확인 - context.userRole이 있고 allowedRoles가 비어있지 않을 때만 검사
    const security = metadata.security;
    if (context.userRole && security.allowedRoles.length > 0) {
      if (!security.allowedRoles.includes(context.userRole)) {
        allowed = false;
        reasons.push(`User role ${context.userRole} not allowed`);
      }
    }
    
    // 액세스 제한 확인
    for (const restriction of security.accessRestrictions) {
      if (!this.checkAccessRestriction(restriction, context)) {
        allowed = false;
        reasons.push(`Access restriction violated: ${restriction.description}`);
      }
    }
    
    return { allowed, reasons };
  }
  
  /**
   * 도구 실행 기록
   */
  recordExecution(
    toolId: string,
    context: ToolExecutionContext,
    result: ToolExecutionResult
  ): void {
    const metadata = this.tools.get(toolId);
    if (!metadata) return;
    
    // 메타데이터 업데이트
    metadata.lastUsedAt = Date.now();
    metadata.usageCount++;
    
    if (result.success) {
      metadata.successCount++;
    } else {
      metadata.errorCount++;
    }
    
    // 평균 실행 시간 업데이트
    metadata.averageExecutionTime = (
      (metadata.averageExecutionTime * (metadata.usageCount - 1) + result.executionTime) /
      metadata.usageCount
    );
    
    // 실행 통계 업데이트
    let stats = this.executionStats.get(toolId);
    if (!stats) {
      stats = {
        totalExecutions: 0,
        totalTime: 0,
        errors: 0,
        lastExecution: 0
      };
      this.executionStats.set(toolId, stats);
    }
    
    stats.totalExecutions++;
    stats.totalTime += result.executionTime;
    stats.lastExecution = Date.now();
    
    if (!result.success) {
      stats.errors++;
    }
    
    // 감사 로깅
    if (metadata.security.requiresAuditing) {
      this.eventManager.emit('tool-registry:execution-logged', {
        toolId,
        context,
        result,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 도구 검색
   */
  findTools(filter: ToolFilter = {}): ToolMetadata[] {
    let results = Array.from(this.tools.values());
    
    // 이름 패턴 필터
    if (filter.namePattern) {
      const pattern = typeof filter.namePattern === 'string' 
        ? new RegExp(filter.namePattern, 'i')
        : filter.namePattern;
      results = results.filter(tool => pattern.test(tool.name));
    }
    
    // 카테고리 필터
    if (filter.category) {
      results = results.filter(tool => tool.category === filter.category);
    }
    
    // 태그 필터
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(tool => 
        filter.tags!.some(tag => tool.tags.includes(tag))
      );
    }
    
    // 권한 필터
    if (filter.permissions && filter.permissions.length > 0) {
      results = results.filter(tool =>
        filter.permissions!.some(perm => tool.permissions.includes(perm))
      );
    }
    
    // 활성 상태 필터
    if (filter.enabled !== undefined) {
      results = results.filter(tool => tool.isEnabled === filter.enabled);
    }
    
    // 신뢰 수준 필터
    if (filter.trustLevel) {
      results = results.filter(tool => tool.provider.trustLevel === filter.trustLevel);
    }
    
    // 제공자 필터
    if (filter.provider) {
      results = results.filter(tool => tool.provider.name === filter.provider);
    }
    
    return results;
  }
  
  /**
   * 도구 목록 정렬
   */
  sortTools(tools: ToolMetadata[], sortBy: ToolSortBy, descending = false): ToolMetadata[] {
    const sorted = [...tools].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'usageCount':
          comparison = a.usageCount - b.usageCount;
          break;
        case 'lastUsed':
          comparison = a.lastUsedAt - b.lastUsedAt;
          break;
        case 'registeredAt':
          comparison = a.registeredAt - b.registeredAt;
          break;
        case 'trustLevel':
          const trustOrder = { untrusted: 0, low: 1, medium: 2, high: 3, system: 4 };
          comparison = trustOrder[a.provider.trustLevel] - trustOrder[b.provider.trustLevel];
          break;
      }
      
      return descending ? -comparison : comparison;
    });
    
    return sorted;
  }
  
  /**
   * 도구 메타데이터 조회
   */
  getToolMetadata(toolId: string): ToolMetadata | undefined {
    return this.tools.get(toolId);
  }
  
  /**
   * 등록된 도구 목록
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }
  
  /**
   * 카테고리별 도구 목록
   */
  getToolsByCategory(category: string): ToolMetadata[] {
    const toolIds = this.categoryIndex.get(category);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((tool): tool is ToolMetadata => tool !== undefined);
  }
  
  /**
   * 태그별 도구 목록
   */
  getToolsByTag(tag: string): ToolMetadata[] {
    const toolIds = this.tagIndex.get(tag);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((tool): tool is ToolMetadata => tool !== undefined);
  }
  
  /**
   * 권한별 도구 목록
   */
  getToolsByPermission(permission: ToolPermission): ToolMetadata[] {
    const toolIds = this.permissionIndex.get(permission);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((tool): tool is ToolMetadata => tool !== undefined);
  }
  
  /**
   * 도구 통계 조회
   */
  getToolStatistics(toolId: string): ExecutionStats | undefined {
    return this.executionStats.get(toolId);
  }
  
  /**
   * 전체 레지스트리 통계
   */
  getRegistryStatistics(): {
    totalTools: number;
    loadedTools: number;
    enabledTools: number;
    categories: number;
    tags: number;
    totalExecutions: number;
    totalErrors: number;
  } {
    const stats = {
      totalTools: this.tools.size,
      loadedTools: 0,
      enabledTools: 0,
      categories: this.categoryIndex.size,
      tags: this.tagIndex.size,
      totalExecutions: 0,
      totalErrors: 0
    };
    
    for (const metadata of this.tools.values()) {
      if (metadata.isLoaded) stats.loadedTools++;
      if (metadata.isEnabled) stats.enabledTools++;
    }
    
    for (const execStats of this.executionStats.values()) {
      stats.totalExecutions += execStats.totalExecutions;
      stats.totalErrors += execStats.errors;
    }
    
    return stats;
  }
  
  /**
   * 버전 호환성 확인
   */
  checkVersionCompatibility(toolId: string, requiredVersion: string): VersionCompatibility {
    const metadata = this.tools.get(toolId);
    if (!metadata) {
      return {
        current: 'unknown',
        minimum: requiredVersion,
        status: 'unknown'
      };
    }
    
    // 단순한 버전 비교 (실제로는 semver 같은 라이브러리 사용 권장)
    const currentVersion = metadata.version;
    const isCompatible = this.compareVersions(currentVersion, requiredVersion) >= 0;
    
    return {
      current: currentVersion,
      minimum: requiredVersion,
      status: isCompatible ? 'compatible' : 'incompatible'
    };
  }
  
  /**
   * 도구 활성화/비활성화
   */
  setToolEnabled(toolId: string, enabled: boolean): boolean {
    const metadata = this.tools.get(toolId);
    if (!metadata) return false;
    
    metadata.isEnabled = enabled;
    
    this.eventManager.emit('tool-registry:tool-status-changed', {
      toolId,
      enabled,
      metadata
    });
    
    return true;
  }
  
  /**
   * 레지스트리 정리
   */
  private performCleanup(): void {
    const now = Date.now();
    const cleanupThreshold = 24 * 60 * 60 * 1000; // 24시간
    
    for (const [toolId, metadata] of this.tools.entries()) {
      // 오랫동안 사용하지 않은 도구 언로드
      if (metadata.isLoaded && 
          metadata.lastUsedAt > 0 && 
          now - metadata.lastUsedAt > cleanupThreshold) {
        this.unloadTool(toolId).catch(() => {
          // 언로드 실패는 로그만 남기고 계속 진행
        });
      }
    }
    
    // 캐시 크기 제한 확인
    if (this.tools.size > this.config.maxCacheSize) {
      // 사용 빈도가 낮은 도구들 제거
      const sortedTools = this.sortTools(
        Array.from(this.tools.values()),
        'lastUsed'
      );
      
      const toRemove = sortedTools.slice(0, this.tools.size - this.config.maxCacheSize);
      for (const tool of toRemove) {
        this.unregisterTool(tool.id);
      }
    }
  }
  
  /**
   * 도구 검증
   */
  private async validateTool(metadata: ToolMetadata, options: ToolRegistrationOptions = {}): Promise<void> {
    // 스키마 검증
    if (!this.validateSchema(metadata.inputSchema)) {
      throw new Error(`Invalid input schema for tool ${metadata.name}`);
    }
    
    // 보안 정책 검증
    if (!this.validateSecurityPolicy(metadata.security)) {
      throw new Error(`Invalid security policy for tool ${metadata.name}`);
    }
    
    // 이름 중복 검사 - overwrite 옵션이 false일 때만 검사
    if (!options.overwrite) {
      const existingTool = Array.from(this.tools.values())
        .find(tool => tool.name === metadata.name && tool.id !== metadata.id);
      
      if (existingTool) {
        throw new Error(`Tool ${metadata.name} already exists`);
      }
    }
  }
  
  /**
   * 스키마 검증
   */
  private validateSchema(schema: JSONSchema): boolean {
    // 기본적인 스키마 검증
    return !!(schema && schema.type && typeof schema.type === 'string');
  }
  
  /**
   * 보안 정책 검증
   */
  private validateSecurityPolicy(policy: SecurityPolicy): boolean {
    return !!(policy && Array.isArray(policy.requiredPermissions));
  }
  
  /**
   * 액세스 제한 확인
   */
  private checkAccessRestriction(
    restriction: AccessRestriction,
    _context: ToolExecutionContext
  ): boolean {
    switch (restriction.type) {
      case 'time':
        // 시간 기반 제한 (예: 업무시간만 허용)
        return true; // 구현 필요
      case 'usage':
        // 사용량 기반 제한
        return true; // 구현 필요
      case 'rate':
        // 비율 기반 제한
        return true; // 구현 필요
      case 'location':
        // 위치 기반 제한
        return true; // 구현 필요
      case 'user':
        // 사용자 기반 제한
        return true; // 구현 필요
      default:
        return true;
    }
  }
  
  /**
   * 인덱스 업데이트
   */
  private updateIndexes(toolId: string, metadata: ToolMetadata): void {
    // 카테고리 인덱스
    if (!this.categoryIndex.has(metadata.category)) {
      this.categoryIndex.set(metadata.category, new Set());
    }
    this.categoryIndex.get(metadata.category)!.add(toolId);
    
    // 태그 인덱스
    for (const tag of metadata.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(toolId);
    }
    
    // 권한 인덱스
    for (const permission of metadata.permissions) {
      if (!this.permissionIndex.has(permission)) {
        this.permissionIndex.set(permission, new Set());
      }
      this.permissionIndex.get(permission)!.add(toolId);
    }
  }
  
  /**
   * 인덱스에서 제거
   */
  private removeFromIndexes(toolId: string, metadata: ToolMetadata): void {
    // 카테고리 인덱스에서 제거
    const categorySet = this.categoryIndex.get(metadata.category);
    if (categorySet) {
      categorySet.delete(toolId);
      if (categorySet.size === 0) {
        this.categoryIndex.delete(metadata.category);
      }
    }
    
    // 태그 인덱스에서 제거
    for (const tag of metadata.tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(toolId);
        if (tagSet.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
    
    // 권한 인덱스에서 제거
    for (const permission of metadata.permissions) {
      const permissionSet = this.permissionIndex.get(permission);
      if (permissionSet) {
        permissionSet.delete(toolId);
        if (permissionSet.size === 0) {
          this.permissionIndex.delete(permission);
        }
      }
    }
  }
  
  /**
   * 도구 ID 생성
   */
  private generateToolId(name: string): string {
    return `tool_${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 버전 비교 (간단한 구현)
   */
  private compareVersions(version1: string, version2: string): number {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    
    return 0;
  }
  
  /**
   * 레지스트리 정리
   */
  destroy(): void {
    // 모든 도구 언로드
    for (const toolId of this.tools.keys()) {
      this.unloadTool(toolId).catch(() => {
        // 언로드 실패는 무시
      });
    }
    
    // 데이터 정리
    this.tools.clear();
    this.categoryIndex.clear();
    this.tagIndex.clear();
    this.permissionIndex.clear();
    this.executionStats.clear();
    this.loaders.clear();
  }
}

/**
 * 도구 레지스트리 생성 팩토리
 */
export function createToolRegistry(
  eventManager: EventManager,
  config?: Partial<ConstructorParameters<typeof ToolRegistry>[1]>
): ToolRegistry {
  return new ToolRegistry(eventManager, config);
}