/**
 * JSON-RPC 클라이언트 테스트
 */

const { JSONRPCClient, JSONRPCError } = require('../src/utils/json-rpc-client');

// Mock axios
jest.mock('axios');
const axios = require('axios');

describe('JSONRPCClient', () => {
  let client;
  const mockEndpoint = 'http://localhost:8888/rpc';
  
  beforeEach(() => {
    client = new JSONRPCClient(mockEndpoint, {
      retryAttempts: 2,
      retryDelay: 100,
      timeout: 5000
    });
    
    // Reset axios mock
    axios.create.mockReturnValue({
      post: jest.fn()
    });
  });
  
  afterEach(() => {
    client.destroy();
    jest.clearAllMocks();
  });
  
  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const defaultClient = new JSONRPCClient(mockEndpoint);
      expect(defaultClient.endpoint).toBe(mockEndpoint);
      expect(defaultClient.config.timeout).toBe(30000);
      expect(defaultClient.config.retryAttempts).toBe(3);
    });
    
    test('should override default config with options', () => {
      const customClient = new JSONRPCClient(mockEndpoint, {
        timeout: 10000,
        retryAttempts: 5
      });
      
      expect(customClient.config.timeout).toBe(10000);
      expect(customClient.config.retryAttempts).toBe(5);
    });
  });
  
  describe('createRequest', () => {
    test('should create valid JSON-RPC 2.0 request', () => {
      const request = client.createRequest('test_method', { param1: 'value1' });
      
      expect(request).toEqual({
        jsonrpc: '2.0',
        method: 'test_method',
        params: { param1: 'value1' },
        id: 1
      });
    });
    
    test('should increment request ID', () => {
      const request1 = client.createRequest('method1');
      const request2 = client.createRequest('method2');
      
      expect(request1.id).toBe(1);
      expect(request2.id).toBe(2);
    });
    
    test('should omit params when null or undefined', () => {
      const request1 = client.createRequest('method', null);
      const request2 = client.createRequest('method', undefined);
      const request3 = client.createRequest('method');
      
      expect(request1).not.toHaveProperty('params');
      expect(request2).not.toHaveProperty('params');
      expect(request3).not.toHaveProperty('params');
    });
  });
  
  describe('validateResponse', () => {
    test('should validate successful response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: { success: true }
      };
      
      const result = client.validateResponse(response, 1);
      expect(result).toEqual({ success: true });
    });
    
    test('should throw JSONRPCError for error response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      };
      
      expect(() => client.validateResponse(response, 1))
        .toThrow(JSONRPCError);
    });
    
    test('should throw error for invalid JSON-RPC version', () => {
      const response = {
        jsonrpc: '1.0',
        id: 1,
        result: {}
      };
      
      expect(() => client.validateResponse(response, 1))
        .toThrow('Invalid JSON-RPC version');
    });
    
    test('should throw error for ID mismatch', () => {
      const response = {
        jsonrpc: '2.0',
        id: 2,
        result: {}
      };
      
      expect(() => client.validateResponse(response, 1))
        .toThrow('Response ID mismatch');
    });
  });
  
  describe('isRetriableError', () => {
    test('should identify network errors as retriable', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ENOTFOUND' },
        { code: 'ETIMEDOUT' },
        { code: 'ECONNRESET' }
      ];
      
      networkErrors.forEach(error => {
        expect(client.isRetriableError(error)).toBe(true);
      });
    });
    
    test('should identify 5xx HTTP errors as retriable', () => {
      const serverError = {
        response: { status: 500 }
      };
      
      expect(client.isRetriableError(serverError)).toBe(true);
    });
    
    test('should identify 429 as retriable', () => {
      const rateLimitError = {
        response: { status: 429 }
      };
      
      expect(client.isRetriableError(rateLimitError)).toBe(true);
    });
    
    test('should not retry 4xx client errors', () => {
      const clientError = {
        response: { status: 404 }
      };
      
      expect(client.isRetriableError(clientError)).toBe(false);
    });
    
    test('should not retry most JSON-RPC errors', () => {
      const parseError = new JSONRPCError(-32700, 'Parse error');
      const methodNotFound = new JSONRPCError(-32601, 'Method not found');
      const internalError = new JSONRPCError(-32603, 'Internal error');
      
      expect(client.isRetriableError(parseError)).toBe(false);
      expect(client.isRetriableError(methodNotFound)).toBe(false);
      expect(client.isRetriableError(internalError)).toBe(true);
    });
  });
  
  describe('call', () => {
    test('should make successful RPC call', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { status: 'success' }
        }
      };
      
      client.httpClient.post.mockResolvedValue(mockResponse);
      
      const result = await client.call('test_method', { param: 'value' });
      
      expect(result).toEqual({ status: 'success' });
      expect(client.httpClient.post).toHaveBeenCalledWith(
        mockEndpoint,
        {
          jsonrpc: '2.0',
          method: 'test_method',
          params: { param: 'value' },
          id: 1
        },
        { timeout: 5000 }
      );
    });
    
    test('should emit events during request lifecycle', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { status: 'success' }
        }
      };
      
      client.httpClient.post.mockResolvedValue(mockResponse);
      
      const startSpy = jest.fn();
      const successSpy = jest.fn();
      
      client.on('request:start', startSpy);
      client.on('request:success', successSpy);
      
      await client.call('test_method');
      
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'test_method',
          requestId: 1
        })
      );
      
      expect(successSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'test_method',
          attempt: 1
        })
      );
    });
    
    test('should retry on retriable errors', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNREFUSED';
      
      // 요청 ID를 동적으로 처리
      let expectedId;
      client.httpClient.post
        .mockRejectedValueOnce(networkError)
        .mockImplementationOnce((url, data) => {
          expectedId = data.id;
          return Promise.resolve({
            data: {
              jsonrpc: '2.0',
              id: expectedId,
              result: { status: 'success' }
            }
          });
        });
      
      const retrySpy = jest.fn();
      client.on('request:retry', retrySpy);
      
      const result = await client.call('test_method');
      
      expect(result).toEqual({ status: 'success' });
      expect(client.httpClient.post).toHaveBeenCalledTimes(2);
      expect(retrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'test_method',
          attempt: 1,
          error: 'Network error'
        })
      );
    });
    
    test('should fail after max retry attempts', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNREFUSED';
      
      client.httpClient.post.mockRejectedValue(networkError);
      
      const failedSpy = jest.fn();
      client.on('request:failed', failedSpy);
      
      await expect(client.call('test_method')).rejects.toThrow('Network error');
      
      // retryAttempts = 2, so total attempts = 3
      expect(client.httpClient.post).toHaveBeenCalledTimes(3);
      expect(failedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'test_method',
          totalAttempts: 3
        })
      );
    });
  });
  
  describe('callBatch', () => {
    test('should make batch RPC call', async () => {
      const requests = [
        { method: 'method1', params: { a: 1 } },
        { method: 'method2', params: { b: 2 } }
      ];
      
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 1, result: { result1: true } },
          { jsonrpc: '2.0', id: 2, result: { result2: true } }
        ]
      };
      
      client.httpClient.post.mockResolvedValue(mockResponse);
      
      const results = await client.callBatch(requests);
      
      expect(results).toEqual([
        { result1: true },
        { result2: true }
      ]);
    });
    
    test('should handle mixed success/error in batch', async () => {
      const requests = [
        { method: 'method1', params: {} },
        { method: 'method2', params: {} }
      ];
      
      const mockResponse = {
        data: [
          { jsonrpc: '2.0', id: 1, result: { success: true } },
          { 
            jsonrpc: '2.0', 
            id: 2, 
            error: { code: -32601, message: 'Method not found' }
          }
        ]
      };
      
      client.httpClient.post.mockResolvedValue(mockResponse);
      
      const results = await client.callBatch(requests);
      
      expect(results).toEqual([
        { success: true },
        { error: 'Method not found', index: 1 }
      ]);
    });
  });
  
  describe('notify', () => {
    test('should send notification without ID', async () => {
      client.httpClient.post.mockResolvedValue({});
      
      const sentSpy = jest.fn();
      client.on('notification:sent', sentSpy);
      
      await client.notify('notify_method', { param: 'value' });
      
      expect(client.httpClient.post).toHaveBeenCalledWith(
        mockEndpoint,
        {
          jsonrpc: '2.0',
          method: 'notify_method',
          params: { param: 'value' }
        }
      );
      
      expect(sentSpy).toHaveBeenCalledWith({
        method: 'notify_method',
        params: { param: 'value' }
      });
    });
  });
  
  describe('healthCheck', () => {
    test('should return healthy status on success', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { total_logs: 100 }
        }
      };
      
      client.httpClient.post.mockResolvedValue(mockResponse);
      
      const health = await client.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.stats).toEqual({ total_logs: 100 });
      expect(health.timestamp).toBeDefined();
    });
    
    test('should return unhealthy status on error', async () => {
      client.httpClient.post.mockRejectedValue(new Error('Connection failed'));
      
      const health = await client.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Connection failed');
      expect(health.timestamp).toBeDefined();
    });
  });
  
  describe('stats', () => {
    test('should track request statistics', async () => {
      // 요청 ID를 동적으로 처리
      client.httpClient.post.mockImplementation((url, data) => {
        return Promise.resolve({
          data: {
            jsonrpc: '2.0',
            id: data.id,
            result: {}
          }
        });
      });
      
      await client.call('method1');
      await client.call('method2');
      
      const stats = client.getStats();
      
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
      expect(stats.successRate).toBe('100.00%');
    });
    
    test('should reset statistics', () => {
      client.stats.totalRequests = 10;
      client.stats.successfulRequests = 8;
      
      client.resetStats();
      
      const stats = client.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
    });
  });
}); 