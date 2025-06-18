/**
 * 설정 관리 데모 스크립트
 * ConfigManager와 설정 기반 LogSystemBridge 사용 예제
 */

const { 
  loadConfig, 
  initializeLogSystem, 
  createLogSystemFromConfig,
  getConfigManagerInstance, 
  getCurrentConfig,
  getSystemStatus,
  quickLog,
  logError
} = require('../src/index');
const path = require('path');

async function runConfigDemo() {
  console.log('🚀 Configuration Management Demo Started\n');
  
  try {
    // 1. 설정 로드 테스트
    console.log('📁 Step 1: Loading configuration...');
    const configPath = path.join(__dirname, '../config/recursive.yaml');
    
    const config = await loadConfig({
      configPath: configPath,
      environment: 'development',
      watchForChanges: false,
      validateSchema: true
    });
    
    console.log('✅ Configuration loaded successfully');
    console.log('   Environment:', config.environment);
    console.log('   Project:', config.project_name);
    console.log('   Server:', `${config.server.host}:${config.server.port}`);
    console.log('   Storage:', config.storage.db_path);
    console.log();
    
    // 2. ConfigManager 직접 사용
    console.log('⚙️  Step 2: Using ConfigManager directly...');
    const configManager = getConfigManagerInstance();
    
    // 특정 값 가져오기
    const serverHost = configManager.get('server.host', 'localhost');
    const serverPort = configManager.get('server.port', 8888);
    const debugMode = configManager.get('server.debug', false);
    
    console.log('✅ Configuration values retrieved:');
    console.log(`   Host: ${serverHost}`);
    console.log(`   Port: ${serverPort}`);
    console.log(`   Debug: ${debugMode}`);
    
    // 런타임 설정 변경
    configManager.set('server.debug', true);
    configManager.set('custom.demo_value', 'Hello from demo!');
    
    console.log('✅ Runtime configuration updated');
    console.log(`   Debug mode: ${configManager.get('server.debug')}`);
    console.log(`   Custom value: ${configManager.get('custom.demo_value')}`);
    console.log();
    
    // 3. 환경 정보 확인
    console.log('🌍 Step 3: Environment information...');
    const envInfo = configManager.getEnvironmentInfo();
    console.log('✅ Environment info:');
    console.log(`   Environment: ${envInfo.environment}`);
    console.log(`   Node ENV: ${envInfo.nodeEnv}`);
    console.log(`   Config paths: ${envInfo.configPaths.length} files`);
    console.log(`   Loaded at: ${envInfo.loadedAt}`);
    console.log();
    
    // 4. 설정 기반 로그 시스템 초기화
    console.log('🎯 Step 4: Initializing log system with configuration...');
    
    const logSystem = await initializeLogSystem({
      environment: 'development',
      watchForChanges: false
    });
    
    console.log('✅ Log system initialized with configuration');
    console.log(`   Ready: ${logSystem.isReady}`);
    console.log(`   Python process: ${logSystem.pythonProcess ? 'Running' : 'Not running'}`);
    console.log();
    
    // 5. 시스템 상태 확인
    console.log('📊 Step 5: System status check...');
    const status = getSystemStatus();
    console.log('✅ System status:');
    console.log(`   Initialized: ${status.initialized}`);
    console.log(`   Ready: ${status.ready}`);
    console.log(`   Config loaded: ${status.config_loaded}`);
    console.log(`   Environment: ${status.environment}`);
    console.log(`   Server: ${status.server.host}:${status.server.port}`);
    console.log(`   Storage: ${status.storage.db_path}`);
    console.log();
    
    // 6. 편의 함수 테스트
    console.log('🔧 Step 6: Testing convenience functions...');
    
    await quickLog('info', 'Configuration demo started', {
      demo_step: 6,
      timestamp: new Date().toISOString()
    });
    
    await quickLog('debug', 'Debug log from config demo', {
      config_loaded: true,
      environment: config.environment
    });
    
    // 에러 로깅 테스트
    try {
      throw new Error('Demo error for testing');
    } catch (error) {
      await logError(error, {
        demo_context: 'Configuration demo error test',
        step: 6
      });
    }
    
    console.log('✅ Convenience functions tested successfully');
    console.log();
    
    // 7. 설정 스키마 내보내기
    console.log('📋 Step 7: Exporting configuration schema...');
    const schema = configManager.exportSchema();
    console.log('✅ Configuration schema exported');
    console.log(`   Schema type: ${schema.type}`);
    console.log(`   Properties count: ${Object.keys(schema.properties).length}`);
    console.log('   Main sections:', Object.keys(schema.properties).slice(0, 5).join(', '));
    console.log();
    
    // 8. 이벤트 리스너 테스트
    console.log('🎧 Step 8: Testing configuration events...');
    
    let eventCount = 0;
    
    configManager.on('config:value_changed', (event) => {
      eventCount++;
      console.log(`   📢 Config changed: ${event.path} = ${event.value}`);
    });
    
    // 몇 가지 설정 변경으로 이벤트 트리거
    configManager.set('demo.event_test', 'value1');
    configManager.set('demo.event_test', 'value2');
    configManager.set('demo.another_setting', 42);
    
    console.log(`✅ Configuration events tested (${eventCount} events fired)`);
    console.log();
    
    // 9. 다른 환경 설정 테스트
    console.log('🔄 Step 9: Testing different environment configuration...');
    
    const prodConfig = await loadConfig({
      configPath: configPath,
      environment: 'production',
      validateSchema: false
    });
    
    console.log('✅ Production configuration loaded');
    console.log(`   Debug mode: ${prodConfig.server?.debug || false}`);
    console.log(`   Verbose: ${prodConfig.server?.verbose || false}`);
    console.log(`   Storage size: ${prodConfig.storage?.max_size_mb || 'default'}MB`);
    console.log();
    
    // 10. 설정 파일에서 직접 로그 시스템 생성
    console.log('🏗️  Step 10: Creating log system directly from config file...');
    
    const directLogSystem = await createLogSystemFromConfig(configPath, {
      environment: 'development',
      autoStart: false // 이미 하나가 실행 중이므로 시작하지 않음
    });
    
    console.log('✅ Log system created directly from config file');
    console.log(`   Host: ${directLogSystem.config.host}`);
    console.log(`   Port: ${directLogSystem.config.port}`);
    console.log(`   Debug: ${directLogSystem.config.debug}`);
    console.log();
    
    // 정리
    console.log('🧹 Cleaning up...');
    await logSystem.stop();
    configManager.stopWatching();
    
    console.log('✅ Configuration Management Demo Completed Successfully! 🎉');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 데모 실행
if (require.main === module) {
  runConfigDemo().catch(console.error);
}

module.exports = { runConfigDemo };