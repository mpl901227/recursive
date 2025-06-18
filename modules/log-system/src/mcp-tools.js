/**
 * MCP 로그 도구 구현
 * LOG_SYSTEM_INTEGRATION_PLAN.md Phase 3.1 구현
 * Recursive 플랫폼의 로그 시스템을 위한 MCP 도구들
 */

const logTools = [
  {
    name: "get_recent_errors",
    description: "최근 에러 로그 조회 및 분석",
    inputSchema: {
      type: "object",
      properties: {
        minutes: { 
          type: "number", 
          default: 30, 
          description: "조회할 시간 범위 (분)" 
        },
        sources: { 
          type: "array", 
          items: { type: "string" }, 
          description: "특정 소스만 조회 (예: ['mcp_calls', 'http_traffic'])" 
        },
        limit: {
          type: "number",
          default: 100,
          description: "최대 조회할 에러 수"
        }
      }
    },
    handler: async (params, logSystem) => {
      const result = await logSystem.query({
        levels: ['ERROR', 'FATAL'],
        since: `${params.minutes || 30}m`,
        sources: params.sources,
        limit: params.limit || 100
      });
      
      // 에러 분류 및 통계
      const errorsBySource = {};
      const errorsByType = {};
      const recentErrors = [];
      
      result.logs.forEach(log => {
        // 소스별 분류
        if (!errorsBySource[log.source]) {
          errorsBySource[log.source] = 0;
        }
        errorsBySource[log.source]++;
        
        // 에러 타입별 분류
        const errorType = log.metadata?.error?.name || log.metadata?.name || 'UnknownError';
        if (!errorsByType[errorType]) {
          errorsByType[errorType] = 0;
        }
        errorsByType[errorType]++;
        
        // 최근 에러 정보
        recentErrors.push({
          timestamp: log.timestamp,
          source: log.source,
          level: log.level,
          message: log.message,
          error_type: errorType,
          stack: log.metadata?.stack || log.metadata?.error?.stack,
          trace_id: log.trace_id,
          metadata: log.metadata
        });
      });
      
      return {
        summary: {
          total_errors: result.count,
          timerange: `${params.minutes || 30}m`,
          query_timestamp: new Date().toISOString()
        },
        statistics: {
          by_source: errorsBySource,
          by_type: errorsByType,
          top_error_sources: Object.entries(errorsBySource)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5),
          top_error_types: Object.entries(errorsByType)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
        },
        recent_errors: recentErrors.slice(0, 20)
      };
    }
  },
  
  {
    name: "analyze_performance",
    description: "성능 분석 및 슬로우 쿼리/요청 탐지",
    inputSchema: {
      type: "object", 
      properties: {
        timerange: { 
          type: "string", 
          default: "1h", 
          description: "분석 시간 범위 (예: '1h', '30m', '24h')" 
        },
        threshold_ms: { 
          type: "number", 
          default: 1000, 
          description: "느린 요청 임계값 (밀리초)" 
        },
        include_percentiles: {
          type: "boolean",
          default: true,
          description: "백분위수 통계 포함 여부"
        }
      }
    },
    handler: async (params, logSystem) => {
      const timerange = params.timerange || "1h";
      const threshold = params.threshold_ms || 1000;
      
      const [httpLogs, dbLogs, mcpLogs, stats] = await Promise.all([
        logSystem.query({
          sources: ['http_traffic'],
          since: timerange,
          limit: 1000
        }),
        logSystem.query({
          sources: ['database'],
          since: timerange,
          limit: 1000
        }),
        logSystem.query({
          sources: ['mcp_calls'],
          since: timerange,
          limit: 1000
        }),
        logSystem.getStats(timerange)
      ]);
      
      // 성능 분석 로직
      const httpDurations = httpLogs.logs
        .filter(log => log.metadata?.duration_ms)
        .map(log => log.metadata.duration_ms);
      
      const slowHttpRequests = httpLogs.logs.filter(log => 
        log.metadata?.duration_ms > threshold
      );
      
      const dbDurations = dbLogs.logs
        .filter(log => log.metadata?.duration_ms)
        .map(log => log.metadata.duration_ms);
        
      const slowDbQueries = dbLogs.logs.filter(log =>
        log.metadata?.duration_ms > threshold
      );
      
      const mcpDurations = mcpLogs.logs
        .filter(log => log.metadata?.duration_ms)
        .map(log => log.metadata.duration_ms);
        
      const slowMcpCalls = mcpLogs.logs.filter(log =>
        log.metadata?.duration_ms > threshold
      );
      
      // 백분위수 계산
      const calculatePercentiles = (durations) => {
        if (durations.length === 0) return null;
        
        const sorted = durations.sort((a, b) => a - b);
        return {
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p90: sorted[Math.floor(sorted.length * 0.9)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)],
          min: sorted[0],
          max: sorted[sorted.length - 1],
          avg: sorted.reduce((a, b) => a + b, 0) / sorted.length
        };
      };
      
      const result = {
        summary: {
          timerange,
          threshold_ms: threshold,
          analysis_timestamp: new Date().toISOString(),
          total_requests: httpLogs.count + dbLogs.count + mcpLogs.count
        },
        http_performance: {
          total_requests: httpLogs.count,
          slow_requests: slowHttpRequests.length,
          slow_percentage: httpLogs.count > 0 ? 
            ((slowHttpRequests.length / httpLogs.count) * 100).toFixed(2) + '%' : '0%',
          slowest_requests: slowHttpRequests
            .sort((a, b) => (b.metadata?.duration_ms || 0) - (a.metadata?.duration_ms || 0))
            .slice(0, 10)
            .map(log => ({
              timestamp: log.timestamp,
              method: log.metadata?.method,
              path: log.metadata?.path,
              duration_ms: log.metadata?.duration_ms,
              status: log.metadata?.status,
              trace_id: log.trace_id
            }))
        },
        database_performance: {
          total_queries: dbLogs.count,
          slow_queries: slowDbQueries.length,
          slow_percentage: dbLogs.count > 0 ? 
            ((slowDbQueries.length / dbLogs.count) * 100).toFixed(2) + '%' : '0%',
          slowest_queries: slowDbQueries
            .sort((a, b) => (b.metadata?.duration_ms || 0) - (a.metadata?.duration_ms || 0))
            .slice(0, 10)
            .map(log => ({
              timestamp: log.timestamp,
              query: log.metadata?.query || log.message,
              duration_ms: log.metadata?.duration_ms,
              trace_id: log.trace_id
            }))
        },
        mcp_performance: {
          total_calls: mcpLogs.count,
          slow_calls: slowMcpCalls.length,
          slow_percentage: mcpLogs.count > 0 ? 
            ((slowMcpCalls.length / mcpLogs.count) * 100).toFixed(2) + '%' : '0%',
          slowest_calls: slowMcpCalls
            .sort((a, b) => (b.metadata?.duration_ms || 0) - (a.metadata?.duration_ms || 0))
            .slice(0, 10)
            .map(log => ({
              timestamp: log.timestamp,
              method: log.metadata?.method,
              duration_ms: log.metadata?.duration_ms,
              trace_id: log.trace_id
            }))
        },
        system_stats: stats
      };
      
      if (params.include_percentiles) {
        result.percentiles = {
          http: calculatePercentiles(httpDurations),
          database: calculatePercentiles(dbDurations),
          mcp: calculatePercentiles(mcpDurations)
        };
      }
      
      return result;
    }
  },
  
  {
    name: "debug_session",
    description: "종합 디버깅 세션 데이터 수집 및 분석",
    inputSchema: {
      type: "object",
      properties: {
        since: { 
          type: "string", 
          default: "5m", 
          description: "수집 시간 범위" 
        },
        include_trace: { 
          type: "string", 
          description: "특정 trace_id 포함하여 추적" 
        },
        include_context: {
          type: "boolean",
          default: true,
          description: "컨텍스트 정보 포함 여부"
        },
        max_logs_per_source: {
          type: "number",
          default: 50,
          description: "소스별 최대 로그 수"
        }
      }
    },
    handler: async (params, logSystem) => {
      const since = params.since || "5m";
      const maxLogs = params.max_logs_per_source || 50;
      const queries = [];
      
      queries.push(
        logSystem.query({ levels: ['ERROR', 'FATAL'], since, limit: maxLogs }),
        logSystem.query({ sources: ['http_traffic'], since, limit: maxLogs }),
        logSystem.query({ sources: ['mcp_calls'], since, limit: maxLogs }),
        logSystem.query({ sources: ['ai_analysis'], since, limit: maxLogs }),
        logSystem.query({ sources: ['websocket'], since, limit: maxLogs }),
        logSystem.getStats(since)
      );
      
      if (params.include_trace) {
        queries.push(
          logSystem.search(`trace_id:${params.include_trace}`, since)
        );
      }
      
      const [errors, httpLogs, mcpLogs, aiLogs, wsLogs, stats, traceLogs] = await Promise.all(queries);
      
      const sessionSummary = {
        session_id: `debug_${Date.now()}`,
        timestamp: new Date().toISOString(),
        timerange: since,
        trace_id: params.include_trace || null,
        total_logs: stats.total_logs,
        error_count: errors.count,
        sources_active: Object.keys(stats.by_source || {}).length
      };
      
      // 이슈 탐지
      const issues = [];
      
      const errorRate = stats.total_logs > 0 ? (errors.count / stats.total_logs) * 100 : 0;
      if (errorRate > 5) {
        issues.push({
          type: 'high_error_rate',
          severity: errorRate > 15 ? 'critical' : 'warning',
          description: `높은 에러율 감지: ${errorRate.toFixed(2)}%`,
          affected_count: errors.count
        });
      }
      
      const slowHttpRequests = httpLogs.logs.filter(log => 
        log.metadata?.duration_ms > 2000
      );
      if (slowHttpRequests.length > 0) {
        issues.push({
          type: 'slow_requests',
          severity: slowHttpRequests.length > 10 ? 'warning' : 'info',
          description: `느린 HTTP 요청 감지: ${slowHttpRequests.length}개`,
          affected_count: slowHttpRequests.length
        });
      }
      
      const failedMcpCalls = mcpLogs.logs.filter(log => 
        log.level === 'ERROR' || log.metadata?.error
      );
      if (failedMcpCalls.length > 0) {
        issues.push({
          type: 'mcp_failures',
          severity: failedMcpCalls.length > 5 ? 'warning' : 'info',
          description: `MCP 호출 실패 감지: ${failedMcpCalls.length}개`,
          affected_count: failedMcpCalls.length
        });
      }
      
      const result = {
        session_info: sessionSummary,
        issues_detected: issues,
        errors: {
          count: errors.count,
          recent: errors.logs.slice(0, 10).map(log => ({
            timestamp: log.timestamp,
            source: log.source,
            level: log.level,
            message: log.message,
            error_type: log.metadata?.error?.name || 'UnknownError',
            trace_id: log.trace_id
          }))
        },
        http_traffic: {
          count: httpLogs.count,
          recent: httpLogs.logs.slice(0, 20).map(log => ({
            timestamp: log.timestamp,
            method: log.metadata?.method,
            path: log.metadata?.path,
            status: log.metadata?.status,
            duration_ms: log.metadata?.duration_ms,
            trace_id: log.trace_id
          }))
        },
        mcp_calls: {
          count: mcpLogs.count,
          recent: mcpLogs.logs.slice(0, 15).map(log => ({
            timestamp: log.timestamp,
            method: log.metadata?.method,
            duration_ms: log.metadata?.duration_ms,
            success: log.level !== 'ERROR' && !log.metadata?.error,
            trace_id: log.trace_id
          }))
        },
        ai_analysis: {
          count: aiLogs.count,
          recent: aiLogs.logs.slice(0, 10).map(log => ({
            timestamp: log.timestamp,
            analysis_type: log.metadata?.analysis_type,
            duration_ms: log.metadata?.duration_ms,
            input_size: log.metadata?.input_size,
            result_size: log.metadata?.result_size,
            trace_id: log.trace_id
          }))
        },
        websocket: {
          count: wsLogs.count,
          recent: wsLogs.logs.slice(0, 10).map(log => ({
            timestamp: log.timestamp,
            event: log.metadata?.event,
            connection_id: log.metadata?.connection_id,
            message_type: log.metadata?.type
          }))
        },
        trace_logs: traceLogs ? {
          count: traceLogs.count,
          logs: traceLogs.logs
        } : null,
        system_stats: stats
      };
      
      if (params.include_context) {
        result.context = {
          active_connections: wsLogs.logs.filter(log => 
            log.metadata?.event === 'connection'
          ).length,
          unique_sources: [...new Set([
            ...httpLogs.logs.map(log => log.source),
            ...mcpLogs.logs.map(log => log.source),
            ...aiLogs.logs.map(log => log.source)
          ])],
          time_distribution: analyzeTimeDistribution([
            ...errors.logs,
            ...httpLogs.logs,
            ...mcpLogs.logs
          ])
        };
      }
      
      return result;
    }
  },
  
  {
    name: "search_logs",
    description: "로그 전문 검색 및 필터링",
    inputSchema: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "검색 쿼리 (전문 검색 지원)" 
        },
        timerange: { 
          type: "string", 
          default: "1h", 
          description: "검색 시간 범위" 
        },
        sources: { 
          type: "array", 
          items: { type: "string" }, 
          description: "검색할 소스들" 
        },
        levels: {
          type: "array",
          items: { type: "string" },
          description: "검색할 로그 레벨들 (DEBUG, INFO, WARN, ERROR, FATAL)"
        },
        context: { 
          type: "number", 
          default: 3, 
          description: "전후 컨텍스트 라인 수" 
        },
        limit: {
          type: "number",
          default: 100,
          description: "최대 검색 결과 수"
        }
      }
    },
    handler: async (params, logSystem) => {
      if (!params.query) {
        throw new Error("검색 쿼리가 필요합니다");
      }
      
      const timerange = params.timerange || "1h";
      const context = params.context || 3;
      const limit = params.limit || 100;
      
      const searchResult = await logSystem.search(
        params.query,
        timerange,
        context
      );
      
      let filteredLogs = searchResult.logs;
      
      if (params.sources && params.sources.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          params.sources.includes(log.source)
        );
      }
      
      if (params.levels && params.levels.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          params.levels.includes(log.level)
        );
      }
      
      filteredLogs = filteredLogs.slice(0, limit);
      
      const sourceDistribution = {};
      const levelDistribution = {};
      const timeDistribution = {};
      
      filteredLogs.forEach(log => {
        sourceDistribution[log.source] = (sourceDistribution[log.source] || 0) + 1;
        levelDistribution[log.level] = (levelDistribution[log.level] || 0) + 1;
        
        const hour = new Date(log.timestamp).getHours();
        timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
      });
      
      return {
        search_info: {
          query: params.query,
          timerange,
          context_lines: context,
          total_matches: searchResult.count,
          filtered_matches: filteredLogs.length,
          search_timestamp: new Date().toISOString()
        },
        filters_applied: {
          sources: params.sources || null,
          levels: params.levels || null,
          limit
        },
        statistics: {
          by_source: sourceDistribution,
          by_level: levelDistribution,
          by_hour: timeDistribution,
          top_sources: Object.entries(sourceDistribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
        },
        matches: filteredLogs.map(log => ({
          timestamp: log.timestamp,
          source: log.source,
          level: log.level,
          message: log.message,
          metadata: log.metadata,
          trace_id: log.trace_id,
          context: log.context || null,
          highlight: log.highlight || null
        }))
      };
    }
  },
  
  {
    name: "get_log_stats",
    description: "로그 통계 및 트렌드 분석",
    inputSchema: {
      type: "object",
      properties: {
        timerange: { 
          type: "string", 
          default: "1h", 
          description: "분석 시간 범위" 
        },
        group_by: { 
          type: "string", 
          enum: ["source", "level", "hour", "minute"], 
          default: "source",
          description: "그룹화 기준" 
        },
        include_trends: {
          type: "boolean",
          default: true,
          description: "트렌드 분석 포함 여부"
        },
        compare_previous: {
          type: "boolean",
          default: false,
          description: "이전 기간과 비교 분석"
        }
      }
    },
    handler: async (params, logSystem) => {
      const timerange = params.timerange || "1h";
      const groupBy = params.group_by || "source";
      
      const currentStats = await logSystem.getStats(timerange);
      
      let previousStats = null;
      if (params.compare_previous) {
        const previousTimerange = calculatePreviousTimerange(timerange);
        try {
          previousStats = await logSystem.getStats(previousTimerange);
        } catch (error) {
          console.warn('이전 기간 통계 조회 실패:', error.message);
        }
      }
      
      let trendData = null;
      if (params.include_trends) {
        const recentLogs = await logSystem.query({
          since: timerange,
          limit: 10000
        });
        
        trendData = analyzeTrends(recentLogs.logs, groupBy, timerange);
      }
      
      const totalLogs = currentStats.total_logs || 0;
      const errorCount = currentStats.by_level?.ERROR || 0;
      const warningCount = currentStats.by_level?.WARN || 0;
      const errorRate = totalLogs > 0 ? ((errorCount / totalLogs) * 100).toFixed(2) : 0;
      
      const result = {
        summary: {
          timerange,
          group_by: groupBy,
          analysis_timestamp: new Date().toISOString(),
          total_logs: totalLogs,
          error_rate: `${errorRate}%`,
          warning_count: warningCount,
          active_sources: Object.keys(currentStats.by_source || {}).length
        },
        current_period: {
          total_logs: totalLogs,
          by_source: currentStats.by_source || {},
          by_level: currentStats.by_level || {},
          top_sources: Object.entries(currentStats.by_source || {})
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10),
          level_distribution: Object.entries(currentStats.by_level || {})
            .sort(([,a], [,b]) => b - a)
        },
        health_indicators: {
          error_rate: parseFloat(errorRate),
          warning_rate: totalLogs > 0 ? 
            ((warningCount / totalLogs) * 100).toFixed(2) : 0,
          most_active_source: Object.entries(currentStats.by_source || {})
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none',
          log_volume_status: assessLogVolume(totalLogs, timerange)
        }
      };
      
      if (previousStats) {
        const previousTotal = previousStats.total_logs || 0;
        const previousErrors = previousStats.by_level?.ERROR || 0;
        
        result.comparison = {
          previous_period: previousStats,
          changes: {
            total_logs: {
              current: totalLogs,
              previous: previousTotal,
              change: totalLogs - previousTotal,
              percentage: previousTotal > 0 ? 
                (((totalLogs - previousTotal) / previousTotal) * 100).toFixed(2) : 'N/A'
            },
            error_count: {
              current: errorCount,
              previous: previousErrors,
              change: errorCount - previousErrors,
              percentage: previousErrors > 0 ? 
                (((errorCount - previousErrors) / previousErrors) * 100).toFixed(2) : 'N/A'
            }
          }
        };
      }
      
      if (trendData) {
        result.trends = trendData;
      }
      
      return result;
    }
  }
];

// 헬퍼 함수들
function analyzeTimeDistribution(logs) {
  const distribution = {};
  logs.forEach(log => {
    const hour = new Date(log.timestamp).getHours();
    distribution[hour] = (distribution[hour] || 0) + 1;
  });
  return distribution;
}

function calculatePreviousTimerange(timerange) {
  const match = timerange.match(/(\d+)([mhd])/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    return `${value}${unit}`;
  }
  return timerange;
}

function analyzeTrends(logs, groupBy, timerange) {
  const intervals = createTimeIntervals(timerange);
  const trendData = {};
  
  intervals.forEach(interval => {
    trendData[interval] = {};
  });
  
  logs.forEach(log => {
    const interval = getTimeInterval(log.timestamp, timerange);
    const groupKey = getGroupKey(log, groupBy);
    
    if (!trendData[interval]) {
      trendData[interval] = {};
    }
    if (!trendData[interval][groupKey]) {
      trendData[interval][groupKey] = 0;
    }
    trendData[interval][groupKey]++;
  });
  
  return trendData;
}

function createTimeIntervals(timerange) {
  const now = new Date();
  const intervals = [];
  
  if (timerange.includes('h')) {
    const hours = parseInt(timerange);
    for (let i = hours; i >= 0; i--) {
      const time = new Date(now.getTime() - (i * 60 * 60 * 1000));
      intervals.push(time.toISOString().slice(0, 13) + ':00');
    }
  } else if (timerange.includes('m')) {
    const minutes = parseInt(timerange);
    for (let i = minutes; i >= 0; i -= 5) {
      const time = new Date(now.getTime() - (i * 60 * 1000));
      intervals.push(time.toISOString().slice(0, 16) + ':00');
    }
  }
  
  return intervals;
}

function getTimeInterval(timestamp, timerange) {
  const date = new Date(timestamp);
  if (timerange.includes('h')) {
    return date.toISOString().slice(0, 13) + ':00';
  } else {
    return date.toISOString().slice(0, 16) + ':00';
  }
}

function getGroupKey(log, groupBy) {
  switch (groupBy) {
    case 'source':
      return log.source;
    case 'level':
      return log.level;
    case 'hour':
      return new Date(log.timestamp).getHours().toString();
    case 'minute':
      return new Date(log.timestamp).getMinutes().toString();
    default:
      return log.source;
  }
}

function assessLogVolume(totalLogs, timerange) {
  const timeInMinutes = parseTimerangeToMinutes(timerange);
  const logsPerMinute = totalLogs / timeInMinutes;
  
  if (logsPerMinute > 100) return 'high';
  if (logsPerMinute > 50) return 'medium';
  if (logsPerMinute > 10) return 'normal';
  return 'low';
}

function parseTimerangeToMinutes(timerange) {
  const match = timerange.match(/(\d+)([mhd])/);
  if (!match) return 60;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 60 * 24;
    default: return 60;
  }
}

module.exports = logTools;
