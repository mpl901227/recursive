/**
 * Tool Registry Tests
 * 
 * 도구 레지스트리의 모든 기능을 테스트합니다:
 * - 도구 등록/해제
 * - 동적 로딩/언로딩
 * - 권한 검사
 * - 통계 추적
 * - 검색 및 필터링
 * - 버전 호환성
 * - 에러 처리
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventManager } from '../../../src/core/events.js';
import { 
  ToolRegistry, 
  createToolRegistry,
  type ToolMetadata,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistrationOptions,
  type TrustLevel
} from '../../../src/services/mcp/tool_registry.js';
import type { MCPTool } from '../../../src/services/mcp/mcp-client.js';

// Mock MCP Client with proper return values
const mockMCPClient = {
  listTools: vi.fn().mockResolvedValue([
    {
      name: 'mock-tool',
      description: 'Mock tool for testing',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    }
  ]),
  callTool: vi.fn().mockResolvedValue({ result: 'success' })
};

// Mock Tool Loader
class MockToolLoader {
  readonly type = 'mock';
  
  async load(toolId: string): Promise<MCPTool> {
    return { 
      name: toolId, 
      description: 'Mock tool', 
      inputSchema: { 
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    };
  }
  
  async unload(_toolId: string): Promise<void> {
    // Mock unload
  }
  
  async listAvailable(): Promise<string[]> {
    return ['mock-tool-1', 'mock-tool-2'];
  }
}

// 테스트용 도구 데이터
const createMockTool = (name: string, overrides: Partial<MCPTool> = {}): MCPTool => ({
  name,
  description: `Test tool ${name}`,
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  ...overrides
});

const createMockToolWithExtensions = (name: string, overrides: any = {}) => ({
  ...createMockTool(name),
  version: '1.0.0',
  category: 'test',
  permissions: [],
  ...overrides
});

describe('ToolRegistry', () => {
  let eventManager: EventManager;
  let toolRegistry: ToolRegistry;

  beforeEach(async () => {
    // Mock 초기화
    vi.clearAllMocks();
    mockMCPClient.listTools.mockResolvedValue([
      {
        name: 'mock-tool',
        description: 'Mock tool for testing',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        }
      }
    ]);

    eventManager = new EventManager();
    toolRegistry = createToolRegistry(eventManager, {
      maxCacheSize: 100,
      defaultTrustLevel: 'medium' as TrustLevel,
      autoCleanup: false, // 테스트에서는 비활성화
      auditLogging: true,
      validationTimeout: 1000
    });
    
    // MCP 클라이언트 설정 및 초기화 대기
    toolRegistry.setMCPClient(mockMCPClient);
    await new Promise(resolve => setTimeout(resolve, 10)); // 초기화 대기
  });

  afterEach(() => {
    toolRegistry.destroy();
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register a basic MCP tool successfully', async () => {
      const tool = createMockTool('test-tool');
      
      const toolId = await toolRegistry.registerTool(tool);
      
      expect(toolId).toBeDefined();
      expect(typeof toolId).toBe('string');
      expect(toolId).toMatch(/^tool_test-tool_\d+_[a-z0-9]+$/);
      
      const metadata = toolRegistry.getToolMetadata(toolId);
      expect(metadata).toBeDefined();
      expect(metadata!.name).toBe('test-tool');
      expect(metadata!.isValidated).toBe(true);
    });

    it('should register an extended tool with additional properties', async () => {
      const tool = createMockToolWithExtensions('advanced-tool', {
        version: '2.1.0',
        category: 'advanced',
        permissions: ['read', 'write']
      });
      
      const toolId = await toolRegistry.registerTool(tool);
      const metadata = toolRegistry.getToolMetadata(toolId);
      
      expect(metadata!.version).toBe('2.1.0');
      expect(metadata!.category).toBe('advanced');
      expect(metadata!.permissions).toEqual(['read', 'write']);
    });

    it('should apply registration options correctly', async () => {
      // Mock loader 등록 (autoLoad를 위해 필요)
      const mockLoader = new MockToolLoader();
      toolRegistry.registerLoader('mcp', mockLoader);
      
      const tool = createMockTool('option-tool');
      const options: ToolRegistrationOptions = {
        autoLoad: true,
        tags: ['test', 'demo'],
        customSecurity: {
          requiresApproval: true,
          allowedRoles: ['admin']
        }
      };
      
      const toolId = await toolRegistry.registerTool(tool, options);
      const metadata = toolRegistry.getToolMetadata(toolId);
      
      expect(metadata!.isLoaded).toBe(true); // autoLoad 적용
      expect(metadata!.tags).toEqual(['test', 'demo']);
      expect(metadata!.security.requiresApproval).toBe(true);
      expect(metadata!.security.allowedRoles).toEqual(['admin']);
    });

    it('should reject duplicate tool registration without overwrite', async () => {
      const tool = createMockTool('duplicate-tool');
      
      await toolRegistry.registerTool(tool);
      
      await expect(
        toolRegistry.registerTool(tool)
      ).rejects.toThrow('Tool with name duplicate-tool already exists');
    });

    it('should allow overwriting existing tool with overwrite option', async () => {
      const tool1 = createMockTool('overwrite-tool');
      const tool2 = createMockToolWithExtensions('overwrite-tool', {
        description: 'Updated description'
      });
      
      const toolId1 = await toolRegistry.registerTool(tool1);
      const toolId2 = await toolRegistry.registerTool(tool2, { overwrite: true });
      
      // 새로운 ID가 생성되어야 함
      expect(toolId1).not.toBe(toolId2);
      
      // 이전 도구는 제거되고 새 도구가 등록됨
      expect(toolRegistry.getToolMetadata(toolId1)).toBeUndefined();
      
      const metadata = toolRegistry.getToolMetadata(toolId2);
      expect(metadata!.description).toBe('Updated description');
    });

    it('should emit registration events', async () => {
      const eventSpy = vi.fn();
      eventManager.on('tool-registry:tool-registered', eventSpy);
      
      const tool = createMockTool('event-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId,
          metadata: expect.objectContaining({ name: 'event-tool' }),
          options: expect.any(Object)
        })
      );
    });
  });

  describe('Tool Unregistration', () => {
    it('should unregister a tool successfully', async () => {
      const tool = createMockTool('unregister-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      const result = await toolRegistry.unregisterTool(toolId);
      
      expect(result).toBe(true);
      expect(toolRegistry.getToolMetadata(toolId)).toBeUndefined();
    });

    it('should return false for non-existent tool', async () => {
      const result = await toolRegistry.unregisterTool('non-existent-id');
      expect(result).toBe(false);
    });

    it('should emit unregistration events', async () => {
      const eventSpy = vi.fn();
      eventManager.on('tool-registry:tool-unregistered', eventSpy);
      
      const tool = createMockTool('event-unregister-tool');
      const toolId = await toolRegistry.registerTool(tool);
      await toolRegistry.unregisterTool(toolId);
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId,
          metadata: expect.objectContaining({ name: 'event-unregister-tool' })
        })
      );
    });
  });

  describe('Tool Loading and Unloading', () => {
    it('should load a tool successfully', async () => {
      const tool = createMockTool('load-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      // Mock loader 등록
      const mockLoader = new MockToolLoader();
      toolRegistry.registerLoader('mock', mockLoader);
      
      // 도구 메타데이터 업데이트 (provider 변경)
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      metadata.provider.name = 'mock';
      
      const result = await toolRegistry.loadTool(toolId);
      
      expect(result).toBe(true);
      expect(metadata.isLoaded).toBe(true);
    });

    it('should unload a loaded tool', async () => {
      const tool = createMockTool('unload-tool');
      const toolId = await toolRegistry.registerTool(tool, { autoLoad: false });
      
      const mockLoader = new MockToolLoader();
      toolRegistry.registerLoader('mock', mockLoader);
      
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      metadata.provider.name = 'mock';
      
      await toolRegistry.loadTool(toolId);
      expect(metadata.isLoaded).toBe(true);
      
      const result = await toolRegistry.unloadTool(toolId);
      expect(result).toBe(true);
      expect(metadata.isLoaded).toBe(false);
    });

    it('should handle loading errors gracefully', async () => {
      const tool = createMockTool('error-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      // 실패하는 로더 등록
      const failingLoader = {
        type: 'failing',
        load: vi.fn().mockRejectedValue(new Error('Load failed')),
        unload: vi.fn(),
        listAvailable: vi.fn()
      };
      toolRegistry.registerLoader('failing', failingLoader);
      
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      metadata.provider.name = 'failing';
      
      await expect(toolRegistry.loadTool(toolId)).rejects.toThrow('Load failed');
      expect(metadata.isLoaded).toBe(false);
    });
  });

  describe('Permission Checking', () => {
    it('should allow access for valid permissions', async () => {
      const tool = createMockToolWithExtensions('permission-tool', {
        permissions: ['read']
      });
      const toolId = await toolRegistry.registerTool(tool);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-1',
        userId: 'user123',
        userRole: 'user',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result = toolRegistry.checkPermissions(toolId, context);
      
      expect(result.allowed).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should deny access for disabled tools', async () => {
      const tool = createMockTool('disabled-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      // 도구 비활성화
      toolRegistry.setToolEnabled(toolId, false);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-2',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result = toolRegistry.checkPermissions(toolId, context);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Tool is disabled');
    });

    it('should deny access for untrusted providers', async () => {
      const tool = createMockTool('untrusted-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      // 신뢰 수준을 untrusted로 변경
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      metadata.provider.trustLevel = 'untrusted';
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-3',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result = toolRegistry.checkPermissions(toolId, context);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('Tool provider is untrusted');
    });

    it('should deny access for unauthorized roles', async () => {
      const tool = createMockTool('role-restricted-tool');
      const options: ToolRegistrationOptions = {
        customSecurity: {
          allowedRoles: ['admin'],
          requiredPermissions: [],
          accessRestrictions: [],
          requiresAuditing: false,
          requiresApproval: false,
          requiresSandbox: false
        }
      };
      const toolId = await toolRegistry.registerTool(tool, options);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-4',
        userRole: 'user', // admin이 아님
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result = toolRegistry.checkPermissions(toolId, context);
      
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('User role user not allowed');
    });
  });

  describe('Execution Recording', () => {
    it('should record successful execution', async () => {
      const tool = createMockTool('record-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-5',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result: ToolExecutionResult = {
        success: true,
        result: 'test result',
        executionTime: 150
      };
      
      toolRegistry.recordExecution(toolId, context, result);
      
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      expect(metadata.usageCount).toBe(1);
      expect(metadata.successCount).toBe(1);
      expect(metadata.errorCount).toBe(0);
      expect(metadata.averageExecutionTime).toBe(150);
      expect(metadata.lastUsedAt).toBeGreaterThan(0);
    });

    it('should record failed execution', async () => {
      const tool = createMockTool('error-record-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-6',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result: ToolExecutionResult = {
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error'
        },
        executionTime: 100
      };
      
      toolRegistry.recordExecution(toolId, context, result);
      
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      expect(metadata.usageCount).toBe(1);
      expect(metadata.successCount).toBe(0);
      expect(metadata.errorCount).toBe(1);
      expect(metadata.averageExecutionTime).toBe(100);
    });

    it('should calculate average execution time correctly', async () => {
      const tool = createMockTool('average-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-7',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      // 첫 번째 실행: 100ms
      toolRegistry.recordExecution(toolId, context, {
        success: true,
        executionTime: 100
      });
      
      // 두 번째 실행: 200ms
      toolRegistry.recordExecution(toolId, { ...context, executionId: 'test-exec-8' }, {
        success: true,
        executionTime: 200
      });
      
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      expect(metadata.averageExecutionTime).toBe(150); // (100 + 200) / 2
      expect(metadata.usageCount).toBe(2);
    });

    it('should emit execution logged events for audited tools', async () => {
      const eventSpy = vi.fn();
      eventManager.on('tool-registry:execution-logged', eventSpy);
      
      const tool = createMockTool('audit-tool');
      const options: ToolRegistrationOptions = {
        customSecurity: {
          requiresAuditing: true,
          requiredPermissions: [],
          allowedRoles: [],
          accessRestrictions: [],
          requiresApproval: false,
          requiresSandbox: false
        }
      };
      const toolId = await toolRegistry.registerTool(tool, options);
      
      const context: ToolExecutionContext = {
        executionId: 'test-exec-9',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result: ToolExecutionResult = {
        success: true,
        executionTime: 100
      };
      
      toolRegistry.recordExecution(toolId, context, result);
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId,
          context,
          result,
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Tool Search and Filtering', () => {
    beforeEach(async () => {
      // 테스트용 도구들 등록
      await toolRegistry.registerTool(createMockToolWithExtensions('search-tool-1', {
        category: 'utility',
        permissions: []
      }), { tags: ['test', 'search'] });
      
      await toolRegistry.registerTool(createMockToolWithExtensions('search-tool-2', {
        category: 'analysis',
        permissions: []
      }), { tags: ['test', 'data'] });
      
      await toolRegistry.registerTool(createMockToolWithExtensions('search-tool-3', {
        category: 'utility',
        permissions: ['admin']
      }), { tags: ['production'] });
    });

    it('should find tools by name pattern', () => {
      const results = toolRegistry.findTools({ namePattern: /search-tool-[12]/ });
      
      expect(results).toHaveLength(2);
      expect(results.map(t => t.name)).toEqual(
        expect.arrayContaining(['search-tool-1', 'search-tool-2'])
      );
    });

    it('should find tools by category', () => {
      const results = toolRegistry.findTools({ category: 'utility' });
      
      expect(results).toHaveLength(2);
      expect(results.every(t => t.category === 'utility')).toBe(true);
    });

    it('should find tools by tags', () => {
      const results = toolRegistry.findTools({ tags: ['test'] });
      
      expect(results).toHaveLength(2);
      expect(results.every(t => t.tags.includes('test'))).toBe(true);
    });

    it('should find tools by permissions', () => {
      const results = toolRegistry.findTools({ permissions: ['admin'] });
      
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('search-tool-3');
    });

    it('should find tools by enabled status', () => {
      // 하나의 도구 비활성화
      const allTools = toolRegistry.findTools();
      const firstTool = allTools[0];
      if (!firstTool) {
        throw new Error('No tools found for test');
      }
      
      toolRegistry.setToolEnabled(firstTool.id, false);
      
      const enabledResults = toolRegistry.findTools({ enabled: true });
      const disabledResults = toolRegistry.findTools({ enabled: false });
      
      expect(enabledResults).toHaveLength(2);
      expect(disabledResults).toHaveLength(1);
      expect(disabledResults[0]?.id).toBe(firstTool.id);
    });

    it('should combine multiple filters', () => {
      const results = toolRegistry.findTools({ 
        category: 'utility',
        tags: ['test']
      });
      
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('search-tool-1');
    });
  });

  describe('Tool Sorting', () => {
    let tools: ToolMetadata[];

    beforeEach(async () => {
      // 테스트용 도구들 등록 및 사용 기록
      const _toolId1 = await toolRegistry.registerTool(createMockTool('sort-tool-z'));
      const toolId2 = await toolRegistry.registerTool(createMockTool('sort-tool-a'));
      const toolId3 = await toolRegistry.registerTool(createMockTool('sort-tool-m'));
      
      // 사용 횟수 차이 생성
      const context: ToolExecutionContext = {
        executionId: 'test',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      const result: ToolExecutionResult = { success: true, executionTime: 100 };
      
      // tool-a: 3회 사용
      toolRegistry.recordExecution(toolId2, context, result);
      await new Promise(resolve => setTimeout(resolve, 5)); // 시간 간격
      toolRegistry.recordExecution(toolId2, context, result);
      await new Promise(resolve => setTimeout(resolve, 5)); // 시간 간격
      toolRegistry.recordExecution(toolId2, context, result);
      await new Promise(resolve => setTimeout(resolve, 5)); // 시간 간격
      
      // tool-m: 1회 사용
      toolRegistry.recordExecution(toolId3, context, result);
      await new Promise(resolve => setTimeout(resolve, 5)); // 시간 간격
      
      // tool-z: 사용 안함
      
      tools = toolRegistry.findTools();
    });

    it('should sort tools by name ascending', () => {
      const sorted = toolRegistry.sortTools(tools, 'name');
      
      expect(sorted.map(t => t.name)).toEqual([
        'sort-tool-a',
        'sort-tool-m', 
        'sort-tool-z'
      ]);
    });

    it('should sort tools by name descending', () => {
      const sorted = toolRegistry.sortTools(tools, 'name', true);
      
      expect(sorted.map(t => t.name)).toEqual([
        'sort-tool-z',
        'sort-tool-m',
        'sort-tool-a'
      ]);
    });

    it('should sort tools by usage count', () => {
      const sorted = toolRegistry.sortTools(tools, 'usageCount', true);
      
      expect(sorted[0]?.name).toBe('sort-tool-a'); // 3회
      expect(sorted[1]?.name).toBe('sort-tool-m'); // 1회
      expect(sorted[2]?.name).toBe('sort-tool-z'); // 0회
    });

    it('should sort tools by last used time', () => {
      const sorted = toolRegistry.sortTools(tools, 'lastUsed', true);
      
      // 최근 사용된 순서대로 정렬 - 0이 아닌 값들만 비교
      const usedTools = sorted.filter(t => t.lastUsedAt > 0);
      if (usedTools.length >= 2) {
        expect(usedTools[0]?.lastUsedAt).toBeGreaterThanOrEqual(usedTools[1]?.lastUsedAt || 0);
      }
      
      // 사용되지 않은 도구는 마지막에 위치
      const unusedTools = sorted.filter(t => t.lastUsedAt === 0);
      expect(unusedTools).toHaveLength(1);
      expect(unusedTools[0]?.name).toBe('sort-tool-z');
    });
  });

  describe('Registry Statistics', () => {
    it('should provide accurate registry statistics', async () => {
      // 여러 도구 등록
      await toolRegistry.registerTool(createMockTool('stats-tool-1'));
      const toolId2 = await toolRegistry.registerTool(createMockTool('stats-tool-2'));
      await toolRegistry.registerTool(createMockTool('stats-tool-3'));
      
      // 하나의 도구 비활성화
      toolRegistry.setToolEnabled(toolId2, false);
      
      // 하나의 도구 로드
      const mockLoader = new MockToolLoader();
      toolRegistry.registerLoader('mock', mockLoader);
      const metadata = toolRegistry.getToolMetadata(toolId2)!;
      metadata.provider.name = 'mock';
      await toolRegistry.loadTool(toolId2);
      
      // 실행 기록 추가
      const context: ToolExecutionContext = {
        executionId: 'stats-test',
        environment: 'development' as const,
        requestedAt: Date.now(),
        metadata: {}
      };
      
      toolRegistry.recordExecution(toolId2, context, { success: true, executionTime: 100 });
      toolRegistry.recordExecution(toolId2, context, { 
        success: false, 
        executionTime: 50, 
        error: { code: 'ERROR', message: 'Test error' } 
      });
      
      const stats = toolRegistry.getRegistryStatistics();
      
      expect(stats.totalTools).toBe(3);
      expect(stats.loadedTools).toBe(1);
      expect(stats.enabledTools).toBe(2); // 하나가 비활성화됨
      expect(stats.totalExecutions).toBe(2);
      expect(stats.totalErrors).toBe(1);
    });
  });

  describe('Version Compatibility', () => {
    it('should check version compatibility correctly', async () => {
      const tool = createMockToolWithExtensions('version-tool', {
        version: '2.1.0'
      });
      const toolId = await toolRegistry.registerTool(tool);
      
      // 호환 가능한 버전
      const compatible = toolRegistry.checkVersionCompatibility(toolId, '2.0.0');
      expect(compatible.status).toBe('compatible');
      expect(compatible.current).toBe('2.1.0');
      expect(compatible.minimum).toBe('2.0.0');
      
      // 호환 불가능한 버전
      const incompatible = toolRegistry.checkVersionCompatibility(toolId, '3.0.0');
      expect(incompatible.status).toBe('incompatible');
    });

    it('should handle unknown tool version check', () => {
      const result = toolRegistry.checkVersionCompatibility('non-existent', '1.0.0');
      
      expect(result.status).toBe('unknown');
      expect(result.current).toBe('unknown');
    });
  });

  describe('Tool Enable/Disable', () => {
    it('should enable and disable tools', async () => {
      const tool = createMockTool('toggle-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      expect(toolRegistry.getToolMetadata(toolId)!.isEnabled).toBe(true);
      
      const disableResult = toolRegistry.setToolEnabled(toolId, false);
      expect(disableResult).toBe(true);
      expect(toolRegistry.getToolMetadata(toolId)!.isEnabled).toBe(false);
      
      const enableResult = toolRegistry.setToolEnabled(toolId, true);
      expect(enableResult).toBe(true);
      expect(toolRegistry.getToolMetadata(toolId)!.isEnabled).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      const result = toolRegistry.setToolEnabled('non-existent', false);
      expect(result).toBe(false);
    });

    it('should emit status change events', async () => {
      const eventSpy = vi.fn();
      eventManager.on('tool-registry:tool-status-changed', eventSpy);
      
      const tool = createMockTool('status-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      toolRegistry.setToolEnabled(toolId, false);
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId,
          enabled: false,
          metadata: expect.objectContaining({ name: 'status-tool' })
        })
      );
    });
  });

  describe('Category and Tag Management', () => {
    beforeEach(async () => {
      await toolRegistry.registerTool(createMockToolWithExtensions('cat-tool-1', {
        category: 'utility'
      }), { tags: ['helper', 'test'] });
      
      await toolRegistry.registerTool(createMockToolWithExtensions('cat-tool-2', {
        category: 'utility'
      }), { tags: ['helper', 'production'] });
      
      await toolRegistry.registerTool(createMockToolWithExtensions('cat-tool-3', {
        category: 'analysis'
      }), { tags: ['data', 'test'] });
    });

    it('should get tools by category', () => {
      const utilityTools = toolRegistry.getToolsByCategory('utility');
      const analysisTools = toolRegistry.getToolsByCategory('analysis');
      
      expect(utilityTools).toHaveLength(2);
      expect(analysisTools).toHaveLength(1);
      expect(utilityTools.every(t => t.category === 'utility')).toBe(true);
      expect(analysisTools[0]?.category).toBe('analysis');
    });

    it('should get tools by tag', () => {
      const helperTools = toolRegistry.getToolsByTag('helper');
      const testTools = toolRegistry.getToolsByTag('test');
      
      expect(helperTools).toHaveLength(2);
      expect(testTools).toHaveLength(2);
      expect(helperTools.every(t => t.tags.includes('helper'))).toBe(true);
      expect(testTools.every(t => t.tags.includes('test'))).toBe(true);
    });

    it('should return empty array for non-existent category/tag', () => {
      const nonExistentCat = toolRegistry.getToolsByCategory('non-existent');
      const nonExistentTag = toolRegistry.getToolsByTag('non-existent');
      
      expect(nonExistentCat).toHaveLength(0);
      expect(nonExistentTag).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors during registration', async () => {
      const invalidTool = {
        name: 'invalid-tool',
        description: 'Invalid tool',
        inputSchema: null as any // 잘못된 스키마
      };
      
      await expect(
        toolRegistry.registerTool(invalidTool)
      ).rejects.toThrow();
    });

    it('should handle loader registration errors', async () => {
      const tool = createMockTool('loader-error-tool');
      const toolId = await toolRegistry.registerTool(tool);
      
      // 존재하지 않는 로더로 설정
      const metadata = toolRegistry.getToolMetadata(toolId)!;
      metadata.provider.name = 'non-existent-loader';
      
      await expect(
        toolRegistry.loadTool(toolId)
      ).rejects.toThrow('No loader found for provider non-existent-loader');
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should clean up resources on destroy', async () => {
      const tool = createMockTool('cleanup-tool');
      await toolRegistry.registerTool(tool);
      
      expect(toolRegistry.getRegisteredTools()).toHaveLength(1);
      
      toolRegistry.destroy();
      
      expect(toolRegistry.getRegisteredTools()).toHaveLength(0);
    });
  });

  describe('Integration with MCP Client', () => {
    it('should set MCP client correctly', () => {
      const newRegistry = createToolRegistry(eventManager);
      
      expect(() => {
        newRegistry.setMCPClient(mockMCPClient);
      }).not.toThrow();
    });
  });
});

describe('createToolRegistry Factory', () => {
  let eventManager: EventManager;

  beforeEach(() => {
    eventManager = new EventManager();
  });

  it('should create a tool registry with default config', () => {
    const registry = createToolRegistry(eventManager);
    
    expect(registry).toBeInstanceOf(ToolRegistry);
    expect(registry.getRegistryStatistics().totalTools).toBe(0);
  });

  it('should create a tool registry with custom config', () => {
    const config = {
      maxCacheSize: 50,
      defaultTrustLevel: 'high' as TrustLevel,
      autoCleanup: false
    };
    
    const registry = createToolRegistry(eventManager, config);
    
    expect(registry).toBeInstanceOf(ToolRegistry);
    // 설정이 올바르게 적용되었는지는 내부 동작으로 확인하기 어려우므로
    // 기본적인 생성 확인만 수행
  });
});