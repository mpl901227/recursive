/**
 * JSON-RPC 2.0 클라이언트 구현
 * Recursive 로그 시스템과 Python 서버 간 통신을 위한 클라이언트
 */

const axios = require('axios');
const EventEmitter = require('events');

class JSONRPCError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'JSONRPCError';
    this.code = code;
    this.data = data;
  }
}

class JSONRPCClient extends EventEmitter {
  constructor(endpoint, options = {}) {
    super();
    
    this.endpoint = endpoint;
    this.requestId = 0;
    
    // 기본 설정
    this.config = {
      timeout: 30000,           // 30초 타임아웃
      retryAttempts: 3,         // 최대 3회 재시도
      retryDelay: 1000,         // 1초 재시도 간격
      retryBackoff: 2,          // 백오프 배수
      maxRetryDelay: 10000,     // 최대 재시도 간격
      userAgent: 'Recursive-LogSystem/1.0',
      ...options
    };
    
    // Axios 인스턴스 생성
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.config.userAgent
      }
    });
    
    // 통계
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0
    };
  }
  
  /**
   * JSON-RPC 2.0 요청 생성
   */
  createRequest(method, params) {
    const request = {
      jsonrpc: '2.0',
      method,
      id: ++this.requestId
    };
    
    // params가 있을 때만 추가 (JSON-RPC 2.0 스펙)
    if (params !== null && params !== undefined && arguments.length > 1) {
      request.params = params;
    }
    
    return request;
  }
  
  /**
   * 응답 검증
   */
  validateResponse(response, requestId) {
    if (!response || typeof response !== 'object') {
      throw new JSONRPCError(-32700, 'Parse error', 'Invalid response format');
    }
    
        if (response.jsonrpc !== '2.0') {
      throw new JSONRPCError(-32600, 'Invalid JSON-RPC version');
    }

    if (response.id !== requestId) {
      throw new JSONRPCError(-32600, 'Response ID mismatch');
    }
    
    if (response.error) {
      throw new JSONRPCError(
        response.error.code,
        response.error.message,
        response.error.data
      );
    }
    
    return response.result;
  }
  
  /**
   * 재시도 로직
   */
  async executeWithRetry(operation, context = {}) {
    let lastError;
    let delay = this.config.retryDelay;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const responseTime = Date.now() - startTime;
        
        // 통계 업데이트
        this.updateStats(true, responseTime, attempt);
        
        // 성공 이벤트 발생
        this.emit('request:success', {
          method: context.method,
          attempt: attempt + 1,
          responseTime,
          ...context
        });
        
        return result;
        
      } catch (error) {
        lastError = error;
        this.stats.totalRetries += attempt;
        
        // 재시도 가능한 에러인지 확인
        if (attempt < this.config.retryAttempts && this.isRetriableError(error)) {
          // 재시도 이벤트 발생
          this.emit('request:retry', {
            method: context.method,
            attempt: attempt + 1,
            error: error.message,
            nextDelay: delay,
            ...context
          });
          
          // 지연 후 재시도
          await this.sleep(delay);
          delay = Math.min(delay * this.config.retryBackoff, this.config.maxRetryDelay);
          
        } else {
          // 최종 실패
          this.updateStats(false, 0, attempt);
          
          this.emit('request:failed', {
            method: context.method,
            totalAttempts: attempt + 1,
            error: error.message,
            ...context
          });
          
          break;
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 재시도 가능한 에러인지 판단
   */
  isRetriableError(error) {
    // 네트워크 에러
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET') {
      return true;
    }
    
    // HTTP 상태 코드 기반
    if (error.response && error.response.status) {
      const status = error.response.status;
      // 5xx 서버 에러는 재시도 가능
      // 429 Too Many Requests도 재시도 가능
      return status >= 500 || status === 429;
    }
    
    // JSON-RPC 에러 중 일부는 재시도 불가
    if (error instanceof JSONRPCError) {
      // -32700: Parse error (재시도 불가)
      // -32600: Invalid Request (재시도 불가)
      // -32601: Method not found (재시도 불가)
      // -32602: Invalid params (재시도 불가)
      // -32603: Internal error (재시도 가능)
      return error.code === -32603;
    }
    
    return false;
  }
  
  /**
   * 메인 호출 메서드
   */
  async call(method, params = {}, options = {}) {
    const callOptions = { ...this.config, ...options };
    const request = this.createRequest(method, params);
    
    const context = {
      method,
      requestId: request.id,
      timestamp: new Date().toISOString()
    };
    
    // 요청 시작 이벤트
    this.emit('request:start', context);
    
    const operation = async () => {
      try {
        const response = await this.httpClient.post(this.endpoint, request, {
          timeout: callOptions.timeout
        });
        
        return this.validateResponse(response.data, request.id);
        
      } catch (error) {
        // Axios 에러를 표준화
        if (error.response) {
          // 서버가 응답했지만 에러 상태
          const serverError = new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
          serverError.response = error.response;
          throw serverError;
        } else if (error.request) {
          // 요청이 전송되었지만 응답 없음
          const networkError = new Error('Network error: No response received');
          networkError.code = error.code;
          throw networkError;
        } else {
          // 요청 설정 중 에러
          throw error;
        }
      }
    };
    
    return await this.executeWithRetry(operation, context);
  }
  
  /**
   * 배치 요청 (JSON-RPC 2.0 배치 호출)
   */
  async callBatch(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Batch requests must be a non-empty array');
    }
    
    const batchRequest = requests.map(({ method, params }) => 
      this.createRequest(method, params)
    );
    
    const context = {
      method: 'batch',
      batchSize: requests.length,
      timestamp: new Date().toISOString()
    };
    
    this.emit('request:start', context);
    
    const operation = async () => {
      try {
        const response = await this.httpClient.post(this.endpoint, batchRequest);
        
        if (!Array.isArray(response.data)) {
          throw new JSONRPCError(-32700, 'Parse error', 'Invalid batch response format');
        }
        
        return response.data.map((res, index) => {
          try {
            return this.validateResponse(res, batchRequest[index].id);
          } catch (error) {
            return { error: error.message, index };
          }
        });
        
      } catch (error) {
        if (error.response) {
          const serverError = new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
          serverError.response = error.response;
          throw serverError;
        }
        throw error;
      }
    };
    
    return await this.executeWithRetry(operation, context);
  }
  
  /**
   * 알림 요청 (응답 없음)
   */
  async notify(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params
    };
    // id 없음 = 알림
    
    try {
      await this.httpClient.post(this.endpoint, request);
      this.emit('notification:sent', { method, params });
    } catch (error) {
      this.emit('notification:failed', { method, params, error: error.message });
      throw error;
    }
  }
  
  /**
   * 연결 상태 확인
   */
  async ping() {
    try {
      const result = await this.call('ping', {}, { timeout: 5000, retryAttempts: 1 });
      return result && result.pong === true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 헬스 체크
   */
  async healthCheck() {
    try {
      const result = await this.call('get_stats', { timerange: '1m' }, { 
        timeout: 10000, 
        retryAttempts: 2 
      });
      
      return {
        healthy: true,
        stats: result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * 통계 업데이트
   */
  updateStats(success, responseTime, retries) {
    this.stats.totalRequests++;
    
    if (success) {
      this.stats.successfulRequests++;
      // 평균 응답 시간 계산
      const total = this.stats.averageResponseTime * (this.stats.successfulRequests - 1);
      this.stats.averageResponseTime = (total + responseTime) / this.stats.successfulRequests;
    } else {
      this.stats.failedRequests++;
    }
    
    this.stats.totalRetries += retries;
  }
  
  /**
   * 통계 조회
   */
  getStats() {
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)
      : '0.00';
    
    return {
      ...this.stats,
      successRate: `${successRate}%`,
      averageRetries: this.stats.totalRequests > 0 
        ? (this.stats.totalRetries / this.stats.totalRequests).toFixed(2)
        : '0.00'
    };
  }
  
  /**
   * 통계 초기화
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0
    };
  }
  
  /**
   * 유틸리티: 슬립
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 클라이언트 종료
   */
  destroy() {
    this.removeAllListeners();
    // Axios 인스턴스는 자동으로 정리됨
  }
}

module.exports = {
  JSONRPCClient,
  JSONRPCError
}; 