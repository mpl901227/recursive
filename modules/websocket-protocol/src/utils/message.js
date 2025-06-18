/**
 * WebSocket 메시지 처리 유틸리티
 */
class MessageUtils {
  /**
   * 메시지 파싱
   */
  static parseMessage(data) {
    try {
      if (typeof data === 'string') {
        return JSON.parse(data);
      } else if (Buffer.isBuffer(data)) {
        return JSON.parse(data.toString());
      }
      return data;
    } catch (error) {
      // JSON 파싱 실패 시 텍스트 메시지로 처리
      return {
        type: 'text',
        data: data.toString(),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 메시지 직렬화
   */
  static serializeMessage(message) {
    if (typeof message === 'string') {
      return message;
    }
    
    try {
      return JSON.stringify(message);
    } catch (error) {
      console.error('[MessageUtils] Failed to serialize message:', error);
      return JSON.stringify({
        type: 'error',
        message: 'Failed to serialize message',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 메시지 타입별 처리기 매핑
   */
  static getMessageHandler(type) {
    const handlers = {
      'authenticate': 'handleAuthentication',
      'ping': 'handlePing',
      'pong': 'handlePong',
      'reconnect': 'handleReconnection',
      'subscribe': 'handleSubscription',
      'unsubscribe': 'handleUnsubscription',
      'broadcast': 'handleBroadcast',
      'direct': 'handleDirectMessage',
      'system': 'handleSystemMessage'
    };

    return handlers[type] || 'handleGenericMessage';
  }

  /**
   * 응답 메시지 생성
   */
  static createResponse(originalMessage, data, success = true) {
    return {
      type: 'response',
      requestId: originalMessage.id || originalMessage.requestId,
      success,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 에러 메시지 생성
   */
  static createError(message, code = 'UNKNOWN_ERROR', details = null) {
    return {
      type: 'error',
      code,
      message,
      details,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 시스템 메시지 생성
   */
  static createSystemMessage(type, data) {
    return {
      type: 'system',
      systemType: type,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 브로드캐스트 메시지 생성
   */
  static createBroadcast(data, excludeConnectionIds = []) {
    return {
      type: 'broadcast',
      data,
      excludeConnectionIds,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 메시지 유효성 검증
   */
  static validateMessage(message) {
    const errors = [];

    if (!message || typeof message !== 'object') {
      errors.push('Message must be an object');
      return { valid: false, errors };
    }

    if (!message.type || typeof message.type !== 'string') {
      errors.push('Message must have a type field');
    }

    // 타입별 추가 검증
    switch (message.type) {
      case 'authenticate':
        if (!message.token && !message.credentials) {
          errors.push('Authentication message must contain token or credentials');
        }
        break;
      
      case 'subscribe':
      case 'unsubscribe':
        if (!message.channel) {
          errors.push('Subscription message must contain channel');
        }
        break;
      
      case 'direct':
        if (!message.targetId) {
          errors.push('Direct message must contain targetId');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 메시지 크기 제한 확인
   */
  static checkMessageSize(message, maxSize = 1024 * 1024) { // 1MB 기본값
    const serialized = this.serializeMessage(message);
    const size = Buffer.byteLength(serialized, 'utf8');
    
    return {
      size,
      valid: size <= maxSize,
      maxSize
    };
  }

  /**
   * 메시지 압축 (필요시)
   */
  static compressMessage(message) {
    // 실제 구현에서는 zlib 등을 사용
    // 여기서는 간단한 문자열 압축 시뮬레이션
    const serialized = this.serializeMessage(message);
    
    if (serialized.length > 1000) {
      return {
        compressed: true,
        data: serialized, // 실제로는 압축된 데이터
        originalSize: serialized.length
      };
    }
    
    return {
      compressed: false,
      data: serialized,
      originalSize: serialized.length
    };
  }

  /**
   * 메시지 압축 해제
   */
  static decompressMessage(compressedData) {
    if (compressedData.compressed) {
      // 실제 구현에서는 압축 해제 로직
      return this.parseMessage(compressedData.data);
    }
    
    return this.parseMessage(compressedData.data);
  }
}

module.exports = MessageUtils; 