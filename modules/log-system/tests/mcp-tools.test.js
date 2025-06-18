/**
 * MCP 도구 테스트
 * Phase 3.1 MCP 로그 도구 구현 검증
 */

const mcpTools = require('../src/mcp-tools');

describe('MCP Tools Phase 3.1', () => {
  
  test('모든 필수 MCP 도구가 구현되어 있어야 함', () => {
    const expectedTools = [
      'get_recent_errors',
      'analyze_performance', 
      'debug_session',
      'search_logs',
      'get_log_stats'
    ];
    
    const toolNames = mcpTools.map(tool => tool.name);
    
    expectedTools.forEach(expectedTool => {
      expect(toolNames).toContain(expectedTool);
    });
    
    expect(mcpTools).toHaveLength(5);
  });

  test('각 도구는 필수 속성을 가져야 함', () => {
    mcpTools.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool).toHaveProperty('handler');
      
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.inputSchema).toBe('object');
      expect(typeof tool.handler).toBe('function');
    });
  });

  test('get_recent_errors 도구 스키마 검증', () => {
    const tool = mcpTools.find(t => t.name === 'get_recent_errors');
    
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.properties).toHaveProperty('minutes');
    expect(tool.inputSchema.properties).toHaveProperty('sources');
    expect(tool.inputSchema.properties).toHaveProperty('limit');
    
    expect(tool.inputSchema.properties.minutes.default).toBe(30);
    expect(tool.inputSchema.properties.limit.default).toBe(100);
  });

  test('analyze_performance 도구 스키마 검증', () => {
    const tool = mcpTools.find(t => t.name === 'analyze_performance');
    
    expect(tool.inputSchema.properties).toHaveProperty('timerange');
    expect(tool.inputSchema.properties).toHaveProperty('threshold_ms');
    expect(tool.inputSchema.properties).toHaveProperty('include_percentiles');
    
    expect(tool.inputSchema.properties.timerange.default).toBe('1h');
    expect(tool.inputSchema.properties.threshold_ms.default).toBe(1000);
    expect(tool.inputSchema.properties.include_percentiles.default).toBe(true);
  });

  test('debug_session 도구 스키마 검증', () => {
    const tool = mcpTools.find(t => t.name === 'debug_session');
    
    expect(tool.inputSchema.properties).toHaveProperty('since');
    expect(tool.inputSchema.properties).toHaveProperty('include_trace');
    expect(tool.inputSchema.properties).toHaveProperty('include_context');
    expect(tool.inputSchema.properties).toHaveProperty('max_logs_per_source');
    
    expect(tool.inputSchema.properties.since.default).toBe('5m');
    expect(tool.inputSchema.properties.include_context.default).toBe(true);
    expect(tool.inputSchema.properties.max_logs_per_source.default).toBe(50);
  });

  test('search_logs 도구 스키마 검증', () => {
    const tool = mcpTools.find(t => t.name === 'search_logs');
    
    expect(tool.inputSchema.properties).toHaveProperty('query');
    expect(tool.inputSchema.properties).toHaveProperty('timerange');
    expect(tool.inputSchema.properties).toHaveProperty('sources');
    expect(tool.inputSchema.properties).toHaveProperty('context');
    
    expect(tool.inputSchema.properties.timerange.default).toBe('1h');
    expect(tool.inputSchema.properties.context.default).toBe(3);
  });

  test('get_log_stats 도구 스키마 검증', () => {
    const tool = mcpTools.find(t => t.name === 'get_log_stats');
    
    expect(tool.inputSchema.properties).toHaveProperty('timerange');
    expect(tool.inputSchema.properties).toHaveProperty('group_by');
    expect(tool.inputSchema.properties).toHaveProperty('include_trends');
    expect(tool.inputSchema.properties).toHaveProperty('compare_previous');
    
    expect(tool.inputSchema.properties.timerange.default).toBe('1h');
    expect(tool.inputSchema.properties.group_by.default).toBe('source');
    expect(tool.inputSchema.properties.include_trends.default).toBe(true);
    expect(tool.inputSchema.properties.compare_previous.default).toBe(false);
  });

  test('도구 핸들러는 올바른 매개변수를 받아야 함', () => {
    mcpTools.forEach(tool => {
      const handler = tool.handler;
      
      // 핸들러는 최소 2개의 매개변수를 받아야 함 (params, logSystem)
      expect(handler.length).toBeGreaterThanOrEqual(2);
    });
  });

});

// Mock LogSystem for testing handlers
class MockLogSystem {
  async query(params) {
    return {
      count: 10,
      logs: [
        {
          timestamp: new Date().toISOString(),
          source: 'test',
          level: 'INFO',
          message: 'Test log message',
          metadata: { duration_ms: 500 },
          trace_id: 'test_trace_123'
        }
      ]
    };
  }

  async search(query, timerange, context) {
    return {
      count: 5,
      logs: [
        {
          timestamp: new Date().toISOString(),
          source: 'test',
          level: 'INFO', 
          message: `Search result for: ${query}`,
          trace_id: 'search_trace_456'
        }
      ]
    };
  }

  async getStats(timerange) {
    return {
      total_logs: 100,
      by_source: { test: 50, http: 30, mcp: 20 },
      by_level: { INFO: 70, WARN: 20, ERROR: 10 },
      timerange: timerange
    };
  }

  async log(entry) {
    return { success: true, id: Date.now() };
  }
}

describe('MCP Tools Handler Integration', () => {
  let mockLogSystem;

  beforeEach(() => {
    mockLogSystem = new MockLogSystem();
  });

  test('get_recent_errors 핸들러 실행 테스트', async () => {
    const tool = mcpTools.find(t => t.name === 'get_recent_errors');
    const result = await tool.handler({ minutes: 30 }, mockLogSystem);
    
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('statistics');
    expect(result).toHaveProperty('recent_errors');
    
    expect(result.summary.timerange).toBe('30m');
    expect(typeof result.summary.total_errors).toBe('number');
  });

  test('search_logs 핸들러 실행 테스트', async () => {
    const tool = mcpTools.find(t => t.name === 'search_logs');
    const result = await tool.handler({ query: 'test' }, mockLogSystem);
    
    expect(result).toHaveProperty('search_info');
    expect(result.search_info).toHaveProperty('query');
    expect(result).toHaveProperty('matches');
    expect(result).toHaveProperty('statistics');
  });

  test('get_log_stats 핸들러 실행 테스트', async () => {
    const tool = mcpTools.find(t => t.name === 'get_log_stats');
    const result = await tool.handler({ timerange: '1h' }, mockLogSystem);
    
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('current_period');
    expect(result.current_period).toHaveProperty('by_source');
    expect(result.current_period).toHaveProperty('by_level');
    expect(result).toHaveProperty('health_indicators');
    
    expect(result.summary.timerange).toBe('1h');
    expect(typeof result.summary.total_logs).toBe('number');
  });

}); 