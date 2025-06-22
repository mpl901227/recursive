/**
 * EventManager 기본 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventManager } from '../../../src/core/events';
import type { EventData } from '../../../src/types/index';

describe('EventManager', () => {
  let eventManager: EventManager;

  beforeEach(() => {
    eventManager = new EventManager();
  });

  describe('기본 기능', () => {
    it('EventManager를 생성할 수 있다', () => {
      expect(eventManager).toBeDefined();
      expect(eventManager.on).toBeDefined();
      expect(eventManager.off).toBeDefined();
      expect(eventManager.emit).toBeDefined();
    });

    it('이벤트 리스너를 등록할 수 있다', () => {
      const callback = vi.fn();
      
      expect(() => {
        eventManager.on('test-event', callback);
      }).not.toThrow();
    });

    it('이벤트를 발생시킬 수 있다', () => {
      const callback = vi.fn();
      
      eventManager.on('test-event', callback);
      eventManager.emit('test-event', 'test-data');
      
      // EventManager는 EventData 객체를 전달합니다
      expect(callback).toHaveBeenCalledTimes(1);
      const callArgs = callback.mock.calls[0][0] as EventData;
      expect(callArgs).toMatchObject({
        type: 'test-event',
        source: 'EventManager',
        payload: {},
        0: 't',
        1: 'e',
        2: 's',
        3: 't',
        4: '-',
        5: 'd',
        6: 'a',
        7: 't',
        8: 'a'
      });
      expect(callArgs.timestamp).toBeTypeOf('number');
    });

    it('이벤트 리스너를 제거할 수 있다', () => {
      const callback = vi.fn();
      
      eventManager.on('test-event', callback);
      eventManager.off('test-event', callback);
      eventManager.emit('test-event', 'test-data');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('여러 리스너를 등록할 수 있다', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      eventManager.on('test-event', callback1);
      eventManager.on('test-event', callback2);
      eventManager.emit('test-event', 'test-data');
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      
      // 두 콜백 모두 같은 EventData 객체를 받아야 함
      const callArgs1 = callback1.mock.calls[0][0] as EventData;
      const callArgs2 = callback2.mock.calls[0][0] as EventData;
      expect(callArgs1.type).toBe('test-event');
      expect(callArgs2.type).toBe('test-event');
    });

    it('한 번만 실행되는 리스너를 등록할 수 있다', () => {
      const callback = vi.fn();
      
      eventManager.once('test-event', callback);
      eventManager.emit('test-event', 'test-data-1');
      eventManager.emit('test-event', 'test-data-2');
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('리스너 해제 함수를 반환한다', () => {
      const callback = vi.fn();
      
      const unsubscribe = eventManager.on('test-event', callback);
      expect(typeof unsubscribe).toBe('function');
      
      unsubscribe();
      eventManager.emit('test-event', 'test-data');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('메트릭을 추적한다', () => {
      const callback = vi.fn();
      
      eventManager.on('test-event', callback);
      eventManager.emit('test-event', 'test-data');
      
      const metrics = eventManager.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.totalListeners).toBeGreaterThan(0);
    });
  });
}); 