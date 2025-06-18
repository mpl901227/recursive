const fs = require('fs');
const path = require('path');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile || false,
      logDir: config.logDir || './logs',
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles || 5,
      enableTimestamp: config.enableTimestamp !== false,
      enableColors: config.enableColors !== false,
      ...config
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[37m', // White
      reset: '\x1b[0m'
    };

    this.currentLogFile = null;
    this.fileWriteStream = null;

    if (this.config.enableFile) {
      this.initializeFileLogging();
    }
  }

  initializeFileLogging() {
    try {
      if (!fs.existsSync(this.config.logDir)) {
        fs.mkdirSync(this.config.logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().split('T')[0];
      this.currentLogFile = path.join(this.config.logDir, `app-${timestamp}.log`);
      
      this.fileWriteStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
      
      this.fileWriteStream.on('error', (error) => {
        console.error('[Logger] File write error:', error);
      });

    } catch (error) {
      console.error('[Logger] Failed to initialize file logging:', error);
      this.config.enableFile = false;
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.config.level];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = this.config.enableTimestamp ? 
      new Date().toISOString() : '';
    
    const metaStr = Object.keys(meta).length > 0 ? 
      ` ${JSON.stringify(meta)}` : '';

    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  formatConsoleMessage(level, message, meta = {}) {
    if (!this.config.enableColors) {
      return this.formatMessage(level, message, meta);
    }

    const color = this.colors[level] || this.colors.reset;
    const timestamp = this.config.enableTimestamp ? 
      `${this.colors.reset}${new Date().toISOString()}` : '';
    
    const metaStr = Object.keys(meta).length > 0 ? 
      ` ${this.colors.reset}${JSON.stringify(meta)}` : '';

    return `${timestamp} ${color}[${level.toUpperCase()}]${this.colors.reset} ${message}${metaStr}`;
  }

  writeToFile(formattedMessage) {
    if (!this.config.enableFile || !this.fileWriteStream) return;

    try {
      // 파일 크기 체크 및 로테이션
      const stats = fs.statSync(this.currentLogFile);
      if (stats.size > this.config.maxFileSize) {
        this.rotateLogFile();
      }

      this.fileWriteStream.write(formattedMessage + '\n');
    } catch (error) {
      console.error('[Logger] Failed to write to file:', error);
    }
  }

  rotateLogFile() {
    try {
      if (this.fileWriteStream) {
        this.fileWriteStream.end();
      }

      // 기존 로그 파일들 이름 변경
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFileName = path.join(
        this.config.logDir, 
        `app-${timestamp}.log`
      );
      
      fs.renameSync(this.currentLogFile, rotatedFileName);

      // 오래된 로그 파일 삭제
      this.cleanupOldLogFiles();

      // 새 로그 파일 생성
      this.initializeFileLogging();

    } catch (error) {
      console.error('[Logger] Failed to rotate log file:', error);
    }
  }

  cleanupOldLogFiles() {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(file => file.startsWith('app-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.config.logDir, file),
          time: fs.statSync(path.join(this.config.logDir, file)).mtime
        }))
        .sort((a, b) => b.time - a.time);

      // 최대 파일 수를 초과하는 파일들 삭제
      if (files.length > this.config.maxFiles) {
        const filesToDelete = files.slice(this.config.maxFiles);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`[Logger] Deleted old log file: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('[Logger] Failed to cleanup old log files:', error);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    const consoleMessage = this.formatConsoleMessage(level, message, meta);

    if (this.config.enableConsole) {
      console.log(consoleMessage);
    }

    if (this.config.enableFile) {
      this.writeToFile(formattedMessage);
    }
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  // WebSocket 전용 로깅 메서드들
  logConnection(connectionId, clientIp, userAgent) {
    this.info('New WebSocket connection', {
      connectionId,
      clientIp,
      userAgent,
      timestamp: new Date().toISOString()
    });
  }

  logDisconnection(connectionId, code, reason) {
    this.info('WebSocket disconnection', {
      connectionId,
      code,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  logMessage(connectionId, messageType, messageSize) {
    this.debug('WebSocket message', {
      connectionId,
      messageType,
      messageSize,
      timestamp: new Date().toISOString()
    });
  }

  logError(connectionId, error, context = {}) {
    this.error('WebSocket error', {
      connectionId,
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }

  logMetrics(metrics) {
    this.info('Server metrics', {
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }

  close() {
    if (this.fileWriteStream) {
      this.fileWriteStream.end();
      this.fileWriteStream = null;
    }
  }
}

// 싱글톤 인스턴스
let defaultLogger = null;

function createLogger(config) {
  return new Logger(config);
}

function getDefaultLogger() {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

module.exports = {
  Logger,
  createLogger,
  getDefaultLogger
}; 