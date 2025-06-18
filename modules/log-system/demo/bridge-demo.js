#!/usr/bin/env node

/**
 * LogSystemBridge 데모 스크립트
 * 브릿지의 모든 기능을 순차적으로 테스트하고 시연
 */

const LogSystemBridge = require('../src/log-system-bridge');
const path = require('path');

// 데모 설정
const DEMO_CONFIG = {
  host: 'localhost',
  port: 8890, // 데모용 포트
  dbPath: './demo_logs/bridge_demo.db',
  verbose: true,
  debug: false,
  autoStart: true,
  autoRestart: true
};

class BridgeDemo {
  constructor() {
    this.bridge = null;
    this.demoStats = {
      startTime: Date.now(),
      testsCompleted: 0,
      totalTests: 8,
      errors: []
    };
  }
  
  /**
   * 데모 실행
   */
  async run() {
    console.log('🔍 LogSystemBridge 데모 시작\n');
    console.log('=' .repeat(50));
    
    try {
      await this.test1_InitializeBridge();
      await this.test2_SystemStatus();
      await this.test3_SingleLogEntry();
      await this.test4_BatchLogEntries();
      await this.test5_QueryLogs();
      await this.test6_SearchLogs();
      await this.test7_GetStatistics();
      await this.test8_EventHandling();
      
      await this.showFinalResults();
      
    } catch (error) {
      console.error('❌ 데모 실행 중 오류:', error.message);
      this.demoStats.errors.push(error.message);
    } finally {
      await this.cleanup();
    }
  }
  
  /**
   * 테스트 1: 브릿지 초기화
   */
  async test1_InitializeBridge() {
    console.log('\n📋 테스트 1: 브릿지 초기화');
    console.log('-'.repeat(30));
    
    try {
      this.bridge = new LogSystemBridge(DEMO_CONFIG);
      
      // 이벤트 리스너 설정
      this.setupEventListeners();
      
      console.log('⏳ Python 서버 시작 중...');
      const startTime = Date.now();
      
      await this.bridge.start();
      
      const duration = Date.now() - startTime;
      console.log(`✅ 브릿지 초기화 완료 (${duration}ms)`);
      console.log(`📍 엔드포인트: ${this.bridge.getEndpoint()}`);
      console.log(`🆔 Python PID: ${this.bridge.pythonProcess?.pid}`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 브릿지 초기화 실패:', error.message);
      this.demoStats.errors.push(`Test 1: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 테스트 2: 시스템 상태 확인
   */
  async test2_SystemStatus() {
    console.log('\n📊 테스트 2: 시스템 상태 확인');
    console.log('-'.repeat(30));
    
    try {
      const status = await this.bridge.getSystemStatus();
      
      console.log('시스템 상태:');
      console.log(`  • 준비 상태: ${status.isReady ? '✅' : '❌'}`);
      console.log(`  • Python 프로세스: ${status.pythonProcess.running ? '✅' : '❌'} (PID: ${status.pythonProcess.pid})`);
      console.log(`  • 클라이언트 연결: ${status.client.connected ? '✅' : '❌'}`);
      console.log(`  • 응답 시간: ${status.client.responseTime || 'N/A'}ms`);
      console.log(`  • 총 요청 수: ${status.stats.totalRequests}`);
      console.log(`  • 실패 요청 수: ${status.stats.failedRequests}`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 시스템 상태 확인 실패:', error.message);
      this.demoStats.errors.push(`Test 2: ${error.message}`);
    }
  }
  
  /**
   * 테스트 3: 단일 로그 엔트리
   */
  async test3_SingleLogEntry() {
    console.log('\n📝 테스트 3: 단일 로그 엔트리');
    console.log('-'.repeat(30));
    
    try {
      const logEntry = {
        source: 'bridge_demo',
        level: 'INFO',
        message: 'Bridge demo single log entry',
        metadata: {
          test_id: 'single_log_test',
          timestamp: new Date().toISOString(),
          demo_version: '1.0'
        },
        tags: ['demo', 'single', 'test']
      };
      
      console.log('📤 로그 전송 중...');
      const result = await this.bridge.log(logEntry);
      
      console.log('✅ 로그 전송 성공:');
      console.log(`  • 상태: ${result.status}`);
      console.log(`  • ID: ${result.id}`);
      console.log(`  • 메시지: "${logEntry.message}"`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 단일 로그 전송 실패:', error.message);
      this.demoStats.errors.push(`Test 3: ${error.message}`);
    }
  }
  
  /**
   * 테스트 4: 배치 로그 엔트리
   */
  async test4_BatchLogEntries() {
    console.log('\n📦 테스트 4: 배치 로그 엔트리');
    console.log('-'.repeat(30));
    
    try {
      const batchEntries = [
        {
          source: 'bridge_demo',
          level: 'INFO',
          message: 'Batch log entry 1',
          metadata: { batch_index: 1 }
        },
        {
          source: 'bridge_demo',
          level: 'WARN',
          message: 'Batch log entry 2',
          metadata: { batch_index: 2 }
        },
        {
          source: 'bridge_demo',
          level: 'ERROR',
          message: 'Batch log entry 3',
          metadata: { batch_index: 3 }
        },
        {
          source: 'bridge_demo',
          level: 'DEBUG',
          message: 'Batch log entry 4',
          metadata: { batch_index: 4 }
        },
        {
          source: 'bridge_demo',
          level: 'INFO',
          message: 'Batch log entry 5',
          metadata: { batch_index: 5 }
        }
      ];
      
      console.log(`📤 ${batchEntries.length}개 로그 배치 전송 중...`);
      const result = await this.bridge.logBatch(batchEntries, false);
      
      console.log('✅ 배치 로그 전송 성공:');
      console.log(`  • 상태: ${result.status}`);
      console.log(`  • 처리된 로그 수: ${result.count}`);
      console.log(`  • 배치 ID: ${result.batch_id || 'N/A'}`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 배치 로그 전송 실패:', error.message);
      this.demoStats.errors.push(`Test 4: ${error.message}`);
    }
  }
  
  /**
   * 테스트 5: 로그 쿼리
   */
  async test5_QueryLogs() {
    console.log('\n🔍 테스트 5: 로그 쿼리');
    console.log('-'.repeat(30));
    
    try {
      // 최근 로그 쿼리
      console.log('📋 최근 로그 조회 중...');
      const recentLogs = await this.bridge.query({
        sources: ['bridge_demo'],
        since: '5m',
        limit: 10
      });
      
      console.log('✅ 최근 로그 조회 성공:');
      console.log(`  • 총 로그 수: ${recentLogs.count}`);
      console.log(`  • 반환된 로그 수: ${recentLogs.logs.length}`);
      
      if (recentLogs.logs.length > 0) {
        console.log('  • 최신 로그:');
        const latest = recentLogs.logs[0];
        console.log(`    - 시간: ${latest.timestamp}`);
        console.log(`    - 레벨: ${latest.level}`);
        console.log(`    - 메시지: "${latest.message}"`);
      }
      
      // 에러 로그만 쿼리
      console.log('\n🚨 에러 로그 조회 중...');
      const errorLogs = await this.bridge.query({
        sources: ['bridge_demo'],
        levels: ['ERROR', 'FATAL'],
        since: '5m',
        limit: 5
      });
      
      console.log('✅ 에러 로그 조회 성공:');
      console.log(`  • 에러 로그 수: ${errorLogs.count}`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 로그 쿼리 실패:', error.message);
      this.demoStats.errors.push(`Test 5: ${error.message}`);
    }
  }
  
  /**
   * 테스트 6: 로그 검색
   */
  async test6_SearchLogs() {
    console.log('\n🔎 테스트 6: 로그 검색');
    console.log('-'.repeat(30));
    
    try {
      // 텍스트 검색
      console.log('🔍 "demo" 키워드 검색 중...');
      const searchResults = await this.bridge.search('demo', '5m', 2);
      
      console.log('✅ 검색 성공:');
      console.log(`  • 매칭된 로그 수: ${searchResults.count}`);
      console.log(`  • 반환된 결과 수: ${searchResults.logs.length}`);
      
      if (searchResults.logs.length > 0) {
        console.log('  • 검색 결과 예시:');
        const example = searchResults.logs[0];
        console.log(`    - 소스: ${example.source}`);
        console.log(`    - 메시지: "${example.message}"`);
        console.log(`    - 매칭 위치: ${example.match_context || 'N/A'}`);
      }
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 로그 검색 실패:', error.message);
      this.demoStats.errors.push(`Test 6: ${error.message}`);
    }
  }
  
  /**
   * 테스트 7: 통계 조회
   */
  async test7_GetStatistics() {
    console.log('\n📈 테스트 7: 통계 조회');
    console.log('-'.repeat(30));
    
    try {
      console.log('📊 시스템 통계 조회 중...');
      const stats = await this.bridge.getStats('1h');
      
      console.log('✅ 통계 조회 성공:');
      console.log(`  • 총 로그 수: ${stats.total_logs}`);
      console.log('  • 소스별 분포:');
      for (const [source, count] of Object.entries(stats.by_source || {})) {
        console.log(`    - ${source}: ${count}개`);
      }
      console.log('  • 레벨별 분포:');
      for (const [level, count] of Object.entries(stats.by_level || {})) {
        console.log(`    - ${level}: ${count}개`);
      }
      
      // 에러율 계산
      const errorCount = (stats.by_level.ERROR || 0) + (stats.by_level.FATAL || 0);
      const errorRate = stats.total_logs > 0 ? ((errorCount / stats.total_logs) * 100).toFixed(2) : 0;
      console.log(`  • 에러율: ${errorRate}%`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 통계 조회 실패:', error.message);
      this.demoStats.errors.push(`Test 7: ${error.message}`);
    }
  }
  
  /**
   * 테스트 8: 이벤트 처리
   */
  async test8_EventHandling() {
    console.log('\n🎭 테스트 8: 이벤트 처리');
    console.log('-'.repeat(30));
    
    try {
      console.log('📡 이벤트 리스너 테스트...');
      
      // 이벤트 카운터
      let eventCount = 0;
      const eventPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 3000); // 3초 타임아웃
        
        this.bridge.once('log:success', (data) => {
          eventCount++;
          console.log(`  ✅ log:success 이벤트 수신 (로그 ID: ${data.result.id})`);
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // 테스트 로그 전송
      await this.bridge.log({
        source: 'bridge_demo',
        level: 'INFO',
        message: 'Event handling test log',
        metadata: { test_type: 'event_test' }
      });
      
      // 이벤트 대기
      await eventPromise;
      
      console.log('✅ 이벤트 처리 테스트 완료');
      console.log(`  • 수신된 이벤트 수: ${eventCount}`);
      
      this.demoStats.testsCompleted++;
      
    } catch (error) {
      console.error('❌ 이벤트 처리 테스트 실패:', error.message);
      this.demoStats.errors.push(`Test 8: ${error.message}`);
    }
  }
  
  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    this.bridge.on('ready', () => {
      console.log('🎉 브릿지 준비 완료 이벤트 수신');
    });
    
    this.bridge.on('python:stdout', (output) => {
      if (this.bridge.config.verbose) {
        console.log(`[PYTHON] ${output}`);
      }
    });
    
    this.bridge.on('python:stderr', (error) => {
      console.log(`[PYTHON ERROR] ${error}`);
    });
    
    this.bridge.on('request:start', (data) => {
      if (this.bridge.config.debug) {
        console.log(`🚀 RPC 요청 시작: ${data.method}`);
      }
    });
    
    this.bridge.on('request:complete', (data) => {
      if (this.bridge.config.debug) {
        console.log(`✅ RPC 요청 완료: ${data.method} (${data.duration}ms)`);
      }
    });
    
    this.bridge.on('error', (error) => {
      console.error(`❌ 브릿지 에러: ${error.message}`);
    });
  }
  
  /**
   * 최종 결과 표시
   */
  async showFinalResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🎯 데모 완료 - 최종 결과');
    console.log('='.repeat(50));
    
    const duration = Date.now() - this.demoStats.startTime;
    const successRate = ((this.demoStats.testsCompleted / this.demoStats.totalTests) * 100).toFixed(1);
    
    console.log(`⏱️  총 실행 시간: ${duration}ms`);
    console.log(`✅ 완료된 테스트: ${this.demoStats.testsCompleted}/${this.demoStats.totalTests}`);
    console.log(`📊 성공률: ${successRate}%`);
    
    if (this.demoStats.errors.length > 0) {
      console.log(`❌ 오류 수: ${this.demoStats.errors.length}`);
      console.log('오류 목록:');
      this.demoStats.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    } else {
      console.log('🎉 모든 테스트가 성공적으로 완료되었습니다!');
    }
    
    // 최종 시스템 상태
    if (this.bridge && this.bridge.isReady) {
      console.log('\n📊 최종 시스템 상태:');
      const finalStatus = await this.bridge.getSystemStatus();
      console.log(`  • 총 요청 수: ${finalStatus.stats.totalRequests}`);
      console.log(`  • 실패 요청 수: ${finalStatus.stats.failedRequests}`);
      console.log(`  • 평균 응답 시간: ${finalStatus.stats.avgResponseTime.toFixed(2)}ms`);
      console.log(`  • 재시작 횟수: ${finalStatus.stats.restartCount}`);
    }
  }
  
  /**
   * 정리 작업
   */
  async cleanup() {
    console.log('\n🧹 정리 작업 중...');
    
    if (this.bridge) {
      try {
        await this.bridge.stop();
        console.log('✅ 브릿지 정상 종료');
      } catch (error) {
        console.error('❌ 브릿지 종료 중 오류:', error.message);
      }
    }
    
    console.log('👋 데모 종료');
  }
}

// 데모 실행
if (require.main === module) {
  const demo = new BridgeDemo();
  
  // Ctrl+C 처리
  process.on('SIGINT', async () => {
    console.log('\n⚠️  데모 중단 신호 수신');
    await demo.cleanup();
    process.exit(0);
  });
  
  // 에러 처리
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
    demo.cleanup().then(() => process.exit(1));
  });
  
  demo.run().catch((error) => {
    console.error('❌ 데모 실행 실패:', error);
    process.exit(1);
  });
}

module.exports = BridgeDemo; 