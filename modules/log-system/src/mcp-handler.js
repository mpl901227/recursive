/**
 * MCP 도구 핸들러
 * LOG_SYSTEM_INTEGRATION_PLAN.md Phase 3.1 구현
 * MCP 프로토콜에 따른 도구 등록 및 요청 처리
 */

const logTools = require('./mcp-tools');
const { EventEmitter } = require('events');

class MCPHandler extends EventEmitter {
  constructor(logSystem) {
    super();
    this.logSystem = logSystem;
    this.tools = new Map();
    this.requestCount = 0;
    
    // 도구 등록
    this.registerTools();
  }

  /**
   * 도구들을 등록
   */
  registerTools() {
    logTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
    
    console.log(`✅ MCP 도구 ${this.tools.size}개 등록 완료`);
  }

  /**
   * 등록된 도구 목록 반환
   * @returns {Array} 도구 목록
   */
  getToolsList() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * 특정 도구 정보 반환
   * @param {string} toolName - 도구명
   * @returns {Object|null} 도구 정보
   */
  getToolInfo(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) return null;
    
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };
  }

  /**
   * MCP 도구 요청 처리
   * @param {string} toolName - 도구명
   * @param {Object} params - 매개변수
   * @returns {Object} 처리 결과
   */
  async handleToolCall(toolName, params = {}) {
    const startTime = Date.now();
    const requestId = ++this.requestCount;
    const traceId = `mcp_${requestId}_${Date.now()}`;
    
    try {
      // 요청 로깅
      await this.logSystem.log({
        source: 'mcp_calls',
        level: 'INFO',
        message: `MCP 도구 호출: ${toolName}`,
        trace_id: traceId,
        metadata: {
          tool_name: toolName,
          params: params,
          request_id: requestId,
          start_time: startTime
        }
      });

      // 도구 존재 확인
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`알 수 없는 도구: ${toolName}`);
      }

      // 매개변수 검증
      const validatedParams = this.validateParams(tool.inputSchema, params);

      // 도구 실행
      const result = await tool.handler(validatedParams, this.logSystem);
      
      const duration = Date.now() - startTime;

      // 성공 로깅
      await this.logSystem.log({
        source: 'mcp_calls',
        level: 'INFO',
        message: `MCP 도구 완료: ${toolName}`,
        trace_id: traceId,
        metadata: {
          tool_name: toolName,
          request_id: requestId,
          duration_ms: duration,
          success: true,
          result_size: JSON.stringify(result).length
        }
      });

      // 이벤트 발생
      this.emit('tool_call_success', {
        toolName,
        params: validatedParams,
        result,
        duration,
        traceId
      });

      return {
        success: true,
        tool: toolName,
        request_id: requestId,
        trace_id: traceId,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        data: result
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // 에러 로깅
      await this.logSystem.log({
        source: 'mcp_calls',
        level: 'ERROR',
        message: `MCP 도구 실패: ${toolName} - ${error.message}`,
        trace_id: traceId,
        metadata: {
          tool_name: toolName,
          request_id: requestId,
          duration_ms: duration,
          success: false,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        }
      });

      // 이벤트 발생
      this.emit('tool_call_error', {
        toolName,
        params,
        error,
        duration,
        traceId
      });

      return {
        success: false,
        tool: toolName,
        request_id: requestId,
        trace_id: traceId,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          code: this.getErrorCode(error)
        }
      };
    }
  }

  /**
   * 매개변수 검증
   * @param {Object} schema - 입력 스키마
   * @param {Object} params - 매개변수
   * @returns {Object} 검증된 매개변수
   */
  validateParams(schema, params) {
    const validated = { ...params };
    
    // 기본값 적용
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, prop]) => {
        if (validated[key] === undefined && prop.default !== undefined) {
          validated[key] = prop.default;
        }
      });
    }

    // 간단한 타입 검증
    if (schema.properties) {
      Object.entries(validated).forEach(([key, value]) => {
        const prop = schema.properties[key];
        if (prop && prop.type) {
          this.validateParamType(key, value, prop);
        }
      });
    }

    return validated;
  }

  /**
   * 매개변수 타입 검증
   * @param {string} key - 매개변수 키
   * @param {*} value - 값
   * @param {Object} prop - 속성 정의
   */
  validateParamType(key, value, prop) {
    if (value === null || value === undefined) return;

    switch (prop.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`매개변수 '${key}'는 문자열이어야 합니다`);
        }
        if (prop.enum && !prop.enum.includes(value)) {
          throw new Error(`매개변수 '${key}'는 다음 중 하나여야 합니다: ${prop.enum.join(', ')}`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          throw new Error(`매개변수 '${key}'는 숫자여야 합니다`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`매개변수 '${key}'는 불린값이어야 합니다`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`매개변수 '${key}'는 배열이어야 합니다`);
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`매개변수 '${key}'는 객체여야 합니다`);
        }
        break;
    }
  }

  /**
   * 에러 코드 반환
   * @param {Error} error - 에러 객체
   * @returns {string} 에러 코드
   */
  getErrorCode(error) {
    if (error.message.includes('알 수 없는 도구')) {
      return 'TOOL_NOT_FOUND';
    }
    if (error.message.includes('매개변수')) {
      return 'INVALID_PARAMS';
    }
    if (error.message.includes('검색 쿼리가 필요')) {
      return 'MISSING_QUERY';
    }
    return 'INTERNAL_ERROR';
  }

  /**
   * 통계 정보 반환
   * @returns {Object} 핸들러 통계
   */
  getStats() {
    return {
      total_tools: this.tools.size,
      total_requests: this.requestCount,
      tools_list: Array.from(this.tools.keys()),
      uptime: process.uptime()
    };
  }

  /**
   * 도구 사용량 통계
   * @param {string} timerange - 시간 범위
   * @returns {Object} 사용량 통계
   */
  async getUsageStats(timerange = '1h') {
    try {
      const mcpLogs = await this.logSystem.query({
        sources: ['mcp_calls'],
        since: timerange,
        limit: 10000
      });

      const toolUsage = {};
      const successCount = {};
      const errorCount = {};
      const totalDuration = {};

      mcpLogs.logs.forEach(log => {
        const toolName = log.metadata?.tool_name;
        if (!toolName) return;

        if (!toolUsage[toolName]) {
          toolUsage[toolName] = 0;
          successCount[toolName] = 0;
          errorCount[toolName] = 0;
          totalDuration[toolName] = 0;
        }

        toolUsage[toolName]++;

        if (log.metadata?.success === true) {
          successCount[toolName]++;
        } else if (log.metadata?.success === false) {
          errorCount[toolName]++;
        }

        if (log.metadata?.duration_ms) {
          totalDuration[toolName] += log.metadata.duration_ms;
        }
      });

      // 평균 응답 시간 계산
      const avgDuration = {};
      Object.keys(totalDuration).forEach(tool => {
        avgDuration[tool] = toolUsage[tool] > 0 ? 
          Math.round(totalDuration[tool] / toolUsage[tool]) : 0;
      });

      return {
        timerange,
        total_calls: mcpLogs.count,
        tool_usage: toolUsage,
        success_count: successCount,
        error_count: errorCount,
        average_duration_ms: avgDuration,
        most_used_tools: Object.entries(toolUsage)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5),
        slowest_tools: Object.entries(avgDuration)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
      };
    } catch (error) {
      console.error('사용량 통계 조회 실패:', error);
      return {
        timerange,
        error: error.message
      };
    }
  }
}

module.exports = MCPHandler; 