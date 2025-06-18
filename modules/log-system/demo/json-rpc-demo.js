/**
 * JSON-RPC 클라이언트 데모 스크립트
 * Python 로그 서버와의 통신을 시연합니다.
 */

const { JSONRPCClient } = require('../src/utils/json-rpc-client');
const { spawn } = require('child_process');
const path = require('path');

class LogSystemDemo {
  constructor() {
    this.client = null;
    this.pythonServer = null;
    this.serverEndpoint = 'http://localhost:8888/rpc';
  }

  async startPythonServer() {
    console.log('[DEMO] Python 로그 서버 시작 중...');
    
    const pythonPath = path.join(__dirname, '../python/main.py');
    this.pythonServer = spawn('python', [
      pythonPath, 
      '--dev', 
      '--host', 'localhost', 
      '--port', '8888',
      '--verbose'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(pythonPath)
    });

    // 서버 출력 모니터링
    this.pythonServer.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[PYTHON] ${output.trim()}`);
    });

    this.pythonServer.stderr.on('data', (data) => {
      console.log(`[PYTHON ERROR] ${data.toString().trim()}`);
    });

    // 서버가 준비될 때까지 대기
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('서버 시작 타임아웃'));
      }, 15000);

      this.pythonServer.stdout.on('data', (data) => {
        if (data.toString().includes('Ready to collect logs')) {
          clearTimeout(timeout);
          console.log('[DEMO] Python 서버가 준비되었습니다!');
          resolve();
        }
      });
    });
  }

  async initializeClient() {
    console.log('[DEMO] JSON-RPC 클라이언트 초기화 중...');
    
    this.client = new JSONRPCClient(this.serverEndpoint, {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    });

    // 이벤트 리스너 등록
    this.client.on('request:sent', (data) => {
      console.log(`[CLIENT] 요청 전송: ${data.method}`);
    });

    this.client.on('request:success', (data) => {
      console.log(`[CLIENT] 요청 성공: ${data.method} (${data.duration}ms)`);
    });

    this.client.on('request:retry', (data) => {
      console.log(`[CLIENT] 재시도: ${data.method} (시도 ${data.attempt})`);
    });

    this.client.on('request:failed', (data) => {
      console.log(`[CLIENT] 요청 실패: ${data.method} (총 ${data.totalAttempts}회 시도)`);
    });
  }

  async runDemo() {
    try {
      console.log('='.repeat(60));
      console.log('🚀 JSON-RPC 클라이언트 데모 시작');
      console.log('='.repeat(60));

      // 1. 서버 시작
      await this.startPythonServer();
      
      // 2. 클라이언트 초기화
      await this.initializeClient();
      
      // 3. 연결 테스트
      console.log('\\n📡 연결 테스트...');
      const isHealthy = await this.client.ping();
      console.log(`연결 상태: ${isHealthy ? '✅ 정상' : '❌ 실패'}`);

      // 4. 헬스 체크
      console.log('\\n🔍 헬스 체크...');
      const health = await this.client.healthCheck();
      console.log(`서버 상태: ${health.healthy ? '✅ 정상' : '❌ 비정상'}`);
      if (health.stats) {
        console.log(`총 로그 수: ${health.stats.total_logs || 0}`);
      }

      // 5. 단일 로그 전송
      console.log('\\n📝 단일 로그 전송...');
      const logResult = await this.client.call('log', {
        source: 'demo-client',
        level: 'INFO',
        message: 'JSON-RPC 클라이언트 데모 로그입니다',
        metadata: {
          demo_step: 'single_log',
          timestamp: new Date().toISOString(),
          client_version: '1.0.0'
        }
      });
      console.log(`로그 ID: ${logResult.log_id}`);

      // 6. 배치 로그 전송
      console.log('\\n📦 배치 로그 전송...');
      const batchRequests = [
        {
          method: 'log',
          params: {
            source: 'demo-batch',
            level: 'DEBUG',
            message: '배치 로그 1번'
          }
        },
        {
          method: 'log',
          params: {
            source: 'demo-batch',
            level: 'WARN',
            message: '배치 로그 2번'
          }
        },
        {
          method: 'log',
          params: {
            source: 'demo-batch',
            level: 'ERROR',
            message: '배치 로그 3번'
          }
        }
      ];

      const batchResults = await this.client.callBatch(batchRequests);
      console.log(`배치 처리 결과: ${batchResults.length}개 처리됨`);

      // 7. 로그 조회
      console.log('\\n🔎 로그 조회...');
      const queryResults = await this.client.call('query', {
        source: 'demo-client',
        limit: 5,
        timerange: '1h'
      });
      console.log(`조회된 로그: ${queryResults.length}개`);
      if (queryResults.length > 0) {
        console.log(`최신 로그: ${queryResults[0].message}`);
      }

      // 8. 통계 조회
      console.log('\\n📊 통계 조회...');
      const stats = await this.client.call('get_stats', {
        timerange: '1h'
      });
      console.log(`총 로그 수: ${stats.total_logs}`);
      console.log(`소스 수: ${stats.sources.length}`);
      console.log(`레벨별 분포:`, stats.levels);

      // 9. 알림 전송 (응답 없음)
      console.log('\\n🔔 알림 전송...');
      await this.client.notify('heartbeat', {
        client_id: 'demo-client',
        timestamp: new Date().toISOString(),
        status: 'demo_completed'
      });
      console.log('알림 전송 완료');

      // 10. 클라이언트 통계
      console.log('\\n📈 클라이언트 통계...');
      const clientStats = this.client.getStats();
      console.log(`총 요청: ${clientStats.totalRequests}`);
      console.log(`성공률: ${clientStats.successRate}`);
      console.log(`평균 응답시간: ${clientStats.averageResponseTime}ms`);

      console.log('\\n✅ 데모 완료!');

    } catch (error) {
      console.error('❌ 데모 실행 중 오류:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    console.log('\\n🧹 정리 중...');
    
    if (this.client) {
      this.client.destroy();
      console.log('클라이언트 정리 완료');
    }

    if (this.pythonServer) {
      this.pythonServer.kill('SIGTERM');
      
      await new Promise((resolve) => {
        this.pythonServer.on('exit', () => {
          console.log('Python 서버 종료 완료');
          resolve();
        });
        setTimeout(resolve, 3000); // 최대 3초 대기
      });
    }
  }
}

// 데모 실행
if (require.main === module) {
  const demo = new LogSystemDemo();
  demo.runDemo().catch(console.error);
}

module.exports = LogSystemDemo; 