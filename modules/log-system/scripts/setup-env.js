#!/usr/bin/env node

/**
 * Recursive 로그 시스템 환경 설정 스크립트
 * 환경별 최적화된 설정을 자동으로 생성합니다.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 환경별 기본 설정
const ENV_CONFIGS = {
  development: {
    NODE_ENV: 'development',
    LOG_HOST: 'localhost',
    LOG_PORT: '8888',
    LOG_LEVEL: 'DEBUG',
    PYTHON_PATH: 'python',
    LOG_DB_PATH: './logs/dev_logs.db',
    LOG_MAX_SIZE_MB: '100',
    LOG_RETENTION_DAYS: '7',
    LOG_BATCH_SIZE: '10',
    LOG_FLUSH_INTERVAL: '1000',
    LOG_RATE_LIMIT: '0',
    ALERT_ERROR_THRESHOLD: '1',
    ALERT_ERROR_WINDOW: '60',
    ALERT_COOLDOWN: '60',
    ALERT_SLOW_THRESHOLD: '500',
    LOG_SQL_QUERIES: 'true',
    INCLUDE_STACK_TRACES: 'true',
    ENABLE_PROFILING: 'true'
  },
  
  production: {
    NODE_ENV: 'production',
    LOG_HOST: '0.0.0.0',
    LOG_PORT: '8888',
    LOG_LEVEL: 'WARN',
    PYTHON_PATH: 'python3',
    LOG_DB_PATH: '/var/log/recursive/prod_logs.db',
    LOG_MAX_SIZE_MB: '5000',
    LOG_RETENTION_DAYS: '90',
    LOG_BATCH_SIZE: '500',
    LOG_FLUSH_INTERVAL: '2000',
    LOG_RATE_LIMIT: '200',
    LOG_BURST_LIMIT: '1000',
    MAX_MEMORY_MB: '300',
    ALLOWED_IPS: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
    API_KEY_REQUIRED: 'true',
    LOG_API_KEY: 'your-secure-api-key-here',
    ENCRYPT_LOGS: 'true',
    LOG_ENCRYPTION_KEY: 'your-encryption-key-here',
    ALERT_ERROR_THRESHOLD: '50',
    ALERT_ERROR_WINDOW: '300',
    ALERT_COOLDOWN: '1800',
    ALERT_SLOW_THRESHOLD: '5000',
    ALERT_MEMORY_THRESHOLD: '200',
    LOG_BACKUP_INTERVAL: '12h',
    LOG_BACKUP_PATH: '/var/backups/recursive/logs',
    BACKUP_RETENTION: '30'
  },
  
  test: {
    NODE_ENV: 'test',
    LOG_HOST: 'localhost',
    LOG_PORT: '8889',
    LOG_LEVEL: 'ERROR',
    PYTHON_PATH: 'python',
    LOG_DB_PATH: './logs/test_logs.db',
    LOG_MAX_SIZE_MB: '10',
    LOG_RETENTION_DAYS: '1',
    LOG_BATCH_SIZE: '1',
    LOG_FLUSH_INTERVAL: '100',
    LOG_RATE_LIMIT: '0',
    ALERT_ERROR_THRESHOLD: '999999',
    WEBHOOK_ALERTS_ENABLED: 'false',
    EMAIL_ALERTS_ENABLED: 'false',
    AUTO_CLEANUP: 'true',
    MOCK_DATA_ENABLED: 'true'
  }
};

// 컬러 출력을 위한 ANSI 코드
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function generateEnvFile(environment, customConfig = {}) {
  const config = { ...ENV_CONFIGS[environment], ...customConfig };
  
  let envContent = `# Recursive 로그 시스템 - ${environment.toUpperCase()} 환경 설정\n`;
  envContent += `# 자동 생성됨: ${new Date().toISOString()}\n\n`;
  
  // 환경별 설명 추가
  const descriptions = {
    development: '# 개발 환경 - 디버깅과 개발 생산성에 최적화',
    production: '# 프로덕션 환경 - 성능, 보안, 안정성에 최적화',
    test: '# 테스트 환경 - 격리와 테스트 속도에 최적화'
  };
  
  envContent += descriptions[environment] + '\n\n';
  
  // 설정 그룹별로 분류
  const groups = {
    '# 기본 설정': ['NODE_ENV', 'LOG_HOST', 'LOG_PORT', 'LOG_LEVEL', 'PYTHON_PATH'],
    '# 데이터베이스': ['LOG_DB_PATH', 'LOG_MAX_SIZE_MB', 'LOG_RETENTION_DAYS'],
    '# 성능 설정': ['LOG_BATCH_SIZE', 'LOG_FLUSH_INTERVAL', 'LOG_RATE_LIMIT', 'LOG_BURST_LIMIT', 'MAX_MEMORY_MB'],
    '# 보안 설정': ['ALLOWED_IPS', 'API_KEY_REQUIRED', 'LOG_API_KEY', 'ENCRYPT_LOGS', 'LOG_ENCRYPTION_KEY'],
    '# 알림 설정': ['ALERT_ERROR_THRESHOLD', 'ALERT_ERROR_WINDOW', 'ALERT_COOLDOWN', 'ALERT_SLOW_THRESHOLD', 'ALERT_MEMORY_THRESHOLD'],
    '# 알림 채널': ['WEBHOOK_ALERTS_ENABLED', 'WEBHOOK_URL', 'EMAIL_ALERTS_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'ALERT_EMAIL_TO'],
    '# 백업 설정': ['LOG_BACKUP_INTERVAL', 'LOG_BACKUP_PATH', 'BACKUP_RETENTION', 'REMOTE_BACKUP_ENABLED'],
    '# 개발 전용': ['LOG_SQL_QUERIES', 'INCLUDE_STACK_TRACES', 'ENABLE_PROFILING'],
    '# 테스트 전용': ['AUTO_CLEANUP', 'MOCK_DATA_ENABLED']
  };
  
  for (const [groupName, keys] of Object.entries(groups)) {
    const groupVars = keys.filter(key => config[key] !== undefined);
    if (groupVars.length > 0) {
      envContent += `${groupName}\n`;
      groupVars.forEach(key => {
        envContent += `${key}=${config[key]}\n`;
      });
      envContent += '\n';
    }
  }
  
  return envContent;
}

async function createDirectories(environment) {
  const dirs = {
    development: ['./logs'],
    production: ['/var/log/recursive', '/var/backups/recursive/logs'],
    test: ['./logs']
  };
  
  if (dirs[environment]) {
    for (const dir of dirs[environment]) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(colorize('green', `✅ 디렉토리 생성: ${dir}`));
        }
      } catch (error) {
        console.log(colorize('yellow', `⚠️  디렉토리 생성 실패 (권한 필요할 수 있음): ${dir}`));
        if (environment === 'production') {
          console.log(colorize('cyan', `   수동 실행: sudo mkdir -p ${dir} && sudo chown -R $USER:$USER ${dir}`));
        }
      }
    }
  }
}

function validateConfig(environment, config) {
  const errors = [];
  
  // 필수 설정 검증
  const required = ['NODE_ENV', 'LOG_HOST', 'LOG_PORT', 'LOG_LEVEL'];
  required.forEach(key => {
    if (!config[key]) {
      errors.push(`필수 설정 누락: ${key}`);
    }
  });
  
  // 프로덕션 환경 보안 검증
  if (environment === 'production') {
    if (config.LOG_API_KEY === 'your-secure-api-key-here') {
      errors.push('프로덕션 환경에서는 안전한 API 키를 설정해야 합니다');
    }
    if (config.LOG_ENCRYPTION_KEY === 'your-encryption-key-here') {
      errors.push('프로덕션 환경에서는 안전한 암호화 키를 설정해야 합니다');
    }
  }
  
  // 포트 번호 검증
  const port = parseInt(config.LOG_PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('유효하지 않은 포트 번호');
  }
  
  return errors;
}

async function interactiveSetup() {
  console.log(colorize('bold', '\n🔧 Recursive 로그 시스템 환경 설정\n'));
  
  // 환경 선택
  console.log('설정할 환경을 선택하세요:');
  console.log('1. development (개발)');
  console.log('2. production (프로덕션)');
  console.log('3. test (테스트)');
  console.log('4. 모든 환경');
  
  const envChoice = await question('\n선택 (1-4): ');
  
  const environments = {
    '1': ['development'],
    '2': ['production'],
    '3': ['test'],
    '4': ['development', 'production', 'test']
  };
  
  const selectedEnvs = environments[envChoice];
  if (!selectedEnvs) {
    console.log(colorize('red', '❌ 잘못된 선택입니다.'));
    process.exit(1);
  }
  
  for (const environment of selectedEnvs) {
    console.log(colorize('bold', `\n📋 ${environment.toUpperCase()} 환경 설정`));
    
    const config = { ...ENV_CONFIGS[environment] };
    
    // 기본 설정 확인
    const useDefaults = await question(`기본 설정을 사용하시겠습니까? (y/n) [y]: `);
    
    if (useDefaults.toLowerCase() !== 'n') {
      // 기본 설정 사용
      console.log(colorize('green', '✅ 기본 설정 사용'));
    } else {
      // 커스텀 설정
      console.log('\n커스텀 설정 (Enter로 기본값 유지):');
      
      const customFields = ['LOG_HOST', 'LOG_PORT', 'LOG_LEVEL'];
      if (environment === 'production') {
        customFields.push('LOG_API_KEY', 'LOG_ENCRYPTION_KEY');
      }
      
      for (const field of customFields) {
        const currentValue = config[field];
        const newValue = await question(`${field} [${currentValue}]: `);
        if (newValue.trim()) {
          config[field] = newValue.trim();
        }
      }
    }
    
    // 설정 검증
    const errors = validateConfig(environment, config);
    if (errors.length > 0) {
      console.log(colorize('red', '\n❌ 설정 오류:'));
             errors.forEach(error => console.log(colorize('red', `   - ${error}`)));
      
      const proceed = await question('\n계속 진행하시겠습니까? (y/n) [n]: ');
      if (proceed.toLowerCase() !== 'y') {
        continue;
      }
    }
    
    // 디렉토리 생성
    console.log(colorize('blue', '\n📁 필요한 디렉토리 생성 중...'));
    await createDirectories(environment);
    
    // .env 파일 생성
    const envContent = generateEnvFile(environment, config);
    const envFile = `.env.${environment}`;
    
    try {
      fs.writeFileSync(envFile, envContent);
      console.log(colorize('green', `✅ 설정 파일 생성: ${envFile}`));
      
      // 현재 .env로 복사할지 확인
      if (selectedEnvs.length === 1) {
        const copyToCurrent = await question(`현재 .env 파일로 복사하시겠습니까? (y/n) [y]: `);
        if (copyToCurrent.toLowerCase() !== 'n') {
          fs.writeFileSync('.env', envContent);
          console.log(colorize('green', '✅ .env 파일 업데이트'));
        }
      }
      
    } catch (error) {
      console.log(colorize('red', `❌ 파일 생성 실패: ${error.message}`));
    }
  }
  
  // 완료 메시지 및 다음 단계
  console.log(colorize('bold', '\n🎉 환경 설정 완료!'));
  console.log('\n다음 단계:');
  console.log('1. 설정 파일 검토 및 필요시 수정');
  console.log('2. 로그 시스템 시작: npm run logs:start');
  console.log('3. 상태 확인: npm run logs:status');
  console.log(colorize('cyan', '\n📖 자세한 가이드: modules/log-system/docs/ENVIRONMENT_SETUP.md'));
}

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      // 대화형 모드
      await interactiveSetup();
    } else {
      // 명령행 모드
      const environment = args[0];
      
      if (!ENV_CONFIGS[environment]) {
        console.log(colorize('red', `❌ 지원하지 않는 환경: ${environment}`));
        console.log('지원 환경: development, production, test');
        process.exit(1);
      }
      
      console.log(colorize('bold', `🔧 ${environment.toUpperCase()} 환경 설정 생성`));
      
      const config = ENV_CONFIGS[environment];
      const envContent = generateEnvFile(environment, config);
      const envFile = `.env.${environment}`;
      
      await createDirectories(environment);
      fs.writeFileSync(envFile, envContent);
      
      console.log(colorize('green', `✅ ${envFile} 생성 완료`));
    }
    
  } catch (error) {
    console.error(colorize('red', `❌ 오류: ${error.message}`));
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  main();
}

module.exports = {
  generateEnvFile,
  ENV_CONFIGS,
  validateConfig
}; 