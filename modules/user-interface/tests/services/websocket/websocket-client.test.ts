/**
 * WebSocketClient 기본 테스트
 * 간소화된 버전 - 핵심 기능만 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../../src/services/websocket/websocket-client';

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    client = new WebSocketClient({
      url: 'ws://localhost:8080',
      maxReconnectAttempts: 3,
      reconnectDelay: 1000,
    });
  });

  afterEach(() => {
    client.destroy();
  });

  describe('기본 기능', () => {
    it('클라이언트를 생성할 수 있다', () => {
      expect(client).toBeDefined();
      expect(client.getConnectionStatus).toBeDefined();
      expect(client.connect).toBeDefined();
      expect(client.disconnect).toBeDefined();
      expect(client.send).toBeDefined();
    });

    it('연결 상태 정보를 반환한다', () => {
      const status = client.getConnectionStatus();
      
      expect(status).toHaveProperty('isConnected');
      expect(status).toHaveProperty('readyState');
      expect(status).toHaveProperty('url');
      expect(status).toHaveProperty('reconnectAttempts');
      expect(status).toHaveProperty('lastPong');
      
      // 초기 상태 확인
      expect(status.isConnected).toBe(false);
      expect(status.url).toBe('ws://localhost:8080');
      expect(status.reconnectAttempts).toBe(0);
    });

    it('이벤트 리스너를 등록할 수 있다', () => {
      const callback = () => {};
      
      expect(() => {
        client.on('connect', callback);
        client.on('disconnect', callback);
        client.on('message', callback);
        client.on('error', callback);
      }).not.toThrow();
    });

    it('이벤트 리스너를 제거할 수 있다', () => {
      const callback = () => {};
      
      client.on('connect', callback);
      
      expect(() => {
        client.off('connect', callback);
      }).not.toThrow();
    });

    it('한 번만 실행되는 이벤트 리스너를 등록할 수 있다', () => {
      const callback = () => {};
      
      expect(() => {
        client.once('connect', callback);
      }).not.toThrow();
    });

    it('리스너 해제 함수가 작동한다', () => {
      const callback = () => {};
      const unsubscribe = client.on('connect', callback);
      
      expect(typeof unsubscribe).toBe('function');
      
      // 해제 함수 호출
      expect(() => {
        unsubscribe();
      }).not.toThrow();
    });
  });

  describe('연결 관리', () => {
    it('connect 메서드가 Promise를 반환한다', () => {
      const connectPromise = client.connect();
      expect(connectPromise).toBeInstanceOf(Promise);
      
      // Promise를 정리하기 위해 catch 추가
      connectPromise.catch(() => {
        // 연결 실패는 예상되는 동작
      });
    });

    it('연결을 해제할 수 있다', () => {
      expect(() => {
        client.disconnect();
      }).not.toThrow();
      
      // 연결 상태 확인
      const status = client.getConnectionStatus();
      expect(status.isConnected).toBe(false);
    });

    it('destroy 메서드가 작동한다', () => {
      expect(() => {
        client.destroy();
      }).not.toThrow();
    });
  });

  describe('메시지 전송', () => {
    it('연결되지 않은 상태에서는 메시지 전송이 실패한다', () => {
      const result = client.send({ type: 'test' });
      expect(result).toBe(false);
    });

    it('send 메서드가 boolean을 반환한다', () => {
      const result = client.send('test message');
      expect(typeof result).toBe('boolean');
    });

    it('다양한 타입의 메시지를 받을 수 있다', () => {
      expect(() => {
        client.send({ type: 'object' });
        client.send('string message');
        client.send({ custom: 'data', nested: { value: 123 } });
      }).not.toThrow();
    });
  });
}); 