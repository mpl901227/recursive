const http = require('http');
const https = require('https');
const { URL } = require('url');

class JSONRPCClient {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint;
    this.timeout = options.timeout || 5000;
    this.retryAttempts = options.retryAttempts || 0;
    this.retryDelay = options.retryDelay || 1000;
    this.userAgent = options.userAgent || 'JSONRPCClient/1.0';
  }

  async call(method, params = {}, options = {}) {
    const requestOptions = { ...options };
    const maxAttempts = requestOptions.retryAttempts || this.retryAttempts;
    
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        return await this._makeRequest(method, params, requestOptions);
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        // 재시도 전 대기
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  async _makeRequest(method, params, options) {
    const url = new URL(this.endpoint);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestData = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: Date.now()
    });

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'User-Agent': this.userAgent
      },
      timeout: options.timeout || this.timeout
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.error) {
              reject(new Error(`JSON-RPC Error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse JSON response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(requestData);
      req.end();
    });
  }

  async ping() {
    try {
      const result = await this.call('ping');
      return result && result.pong;
    } catch (error) {
      return false;
    }
  }
}

module.exports = JSONRPCClient; 