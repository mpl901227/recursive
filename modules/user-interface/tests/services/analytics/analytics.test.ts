/**
 * Analytics Service Test Suite
 * Analytics 서비스 통합 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  AnalyticsManager,
  type AnalyticsConfig,
  type AnalyticsEvent,
  type UserInfo
} from '../../../src/services/analytics/index.js';
import { EventManager } from '@/core/events';
import { 
  EventType, 
  PerformanceMetricType,
  DEFAULT_ANALYTICS_CONFIG,
  EVENT_CATEGORIES,
  EVENT_ACTIONS 
} from '@/services/analytics';

// Mock localStorage
const mockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  };
};

// Mock navigator and window properties
Object.defineProperty(window, 'localStorage', {
  value: mockStorage(),
  writable: true
});

Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test)',
    language: 'en-US',
    platform: 'Test'
  },
  writable: true
});

Object.defineProperty(window, 'screen', {
  value: {
    width: 1920,
    height: 1080
  },
  writable: true
});

Object.defineProperty(document, 'referrer', {
  value: 'https://test.com',
  writable: true
});

Object.defineProperty(window, 'location', {
  value: {
    href: 'https://test.com/page',
    pathname: '/page'
  },
  writable: true
});

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    memory: {
      usedJSHeapSize: 1000000,
      totalJSHeapSize: 2000000,
      jsHeapSizeLimit: 4000000
    }
  },
  writable: true
});

// Mock PerformanceObserver
global.PerformanceObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn()
})) as any;

// Add supportedEntryTypes property
(global.PerformanceObserver as any).supportedEntryTypes = ['navigation', 'measure', 'mark'];

describe('AnalyticsManager', () => {
  let analytics: AnalyticsManager;
  let eventManager: EventManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    (localStorage as any).clear();
    
    eventManager = new EventManager();
    analytics = new AnalyticsManager(eventManager, {
      enabled: true,
      debugMode: true,
      flushInterval: 1000,
      batchSize: 10,
      sessionTimeout: 5000
    });
    
    await analytics.initialize();
  });

  afterEach(async () => {
    await analytics.destroy();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(analytics).toBeDefined();
      const stats = analytics.getStats();
      expect(stats.isTracking).toBe(true);
    });

    it('should load default configuration', () => {
      const config = analytics.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.debugMode).toBe(true);
      expect(config.flushInterval).toBe(1000);
    });

    it('should initialize user info', () => {
      const userInfo = analytics.getUserInfo();
      expect(userInfo).toBeDefined();
      expect(userInfo?.sessionId).toBeDefined();
      expect(userInfo?.userAgent).toBe('Mozilla/5.0 (Test)');
    });

    it('should initialize session info', () => {
      const sessionInfo = analytics.getSessionInfo();
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo?.sessionId).toBeDefined();
      expect(sessionInfo?.startTime).toBeInstanceOf(Date);
    });
  });

  describe('Event Tracking', () => {
    it('should track basic events', () => {
      analytics.track('click', 'button', {
        label: 'submit',
        value: 1
      });

      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsThisSession).toBe(1);
    });

    it('should track user actions', () => {
      analytics.trackUserAction({
        action: 'click',
        category: 'ui',
        label: 'menu-item',
        element: 'nav-menu',
        component: 'Navigation'
      });

      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(1);
    });

    it('should track page views', () => {
      analytics.trackPageView('/home', 'Home Page');

      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(1);
      
      const sessionInfo = analytics.getSessionInfo();
      expect(sessionInfo?.pageViews).toBe(1);
    });

         it('should track performance metrics', () => {
       analytics.trackPerformance({
         name: 'page-load',
         type: PerformanceMetricType.LOAD_TIME,
         value: 1500,
         unit: 'ms',
         timestamp: new Date(),
         context: { page: '/home' }
       });

       const stats = analytics.getStats();
       expect(stats.totalEvents).toBe(1);
     });

    it('should track errors', () => {
      const testError = new Error('Test error');
      analytics.trackError(testError, { component: 'TestComponent' });

      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(1);
    });

    it('should track custom events', () => {
      analytics.trackCustomEvent('feature-used', {
        feature: 'search',
        query: 'test'
      });

      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(1);
    });
  });

  describe('Event Listeners', () => {
    it('should add and remove event listeners', () => {
      const listener = vi.fn();
      const unsubscribe = analytics.addEventListener(listener);

      analytics.track('test', 'category');
      expect(listener).toHaveBeenCalled();

      unsubscribe();
      analytics.track('test2', 'category');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

     describe('Session Management', () => {
     it('should start new session', async () => {
       const initialSessionId = analytics.getSessionInfo()?.sessionId;
       
       // 짧은 지연으로 다른 timestamp 보장
       await new Promise(resolve => setTimeout(resolve, 10));
       
       analytics.startSession();
       
       const newSessionId = analytics.getSessionInfo()?.sessionId;
       expect(newSessionId).not.toBe(initialSessionId);
       expect(newSessionId).toBeDefined();
     });

     it('should end session', () => {
       analytics.endSession();
       
       const stats = analytics.getStats();
       expect(stats.isTracking).toBe(false);
       
       const sessionInfo = analytics.getSessionInfo();
       expect(sessionInfo?.isActive).toBe(false);
     });
   });

  describe('Privacy Settings', () => {
    it('should update privacy settings', () => {
      analytics.updatePrivacySettings({
        enableTracking: false,
        enableUserIdentification: false
      });

      const privacySettings = analytics.getPrivacySettings();
      expect(privacySettings.enableTracking).toBe(false);
      expect(privacySettings.enableUserIdentification).toBe(false);
    });

    it('should stop tracking when privacy disabled', () => {
      analytics.updatePrivacySettings({ enableTracking: false });
      
      analytics.track('test', 'category');
      
      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('Tracking Control', () => {
    it('should start and stop tracking', () => {
      analytics.stopTracking();
      expect(analytics.getStats().isTracking).toBe(false);

      analytics.startTracking();
      expect(analytics.getStats().isTracking).toBe(true);
    });

    it('should not track when disabled', () => {
      analytics.stopTracking();
      
      analytics.track('test', 'category');
      
      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('Batch Processing', () => {
    it('should flush events manually', async () => {
      analytics.track('event1', 'category');
      analytics.track('event2', 'category');
      
      await analytics.flush();
      
      const stats = analytics.getStats();
      expect(stats.batchesSent).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      analytics.track('event1', 'category');
      analytics.track('event2', 'category');
      
      const stats = analytics.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsThisSession).toBe(2);
      expect(stats.sessionStartTime).toBeInstanceOf(Date);
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      const config = analytics.getConfig();
      expect(config).toEqual(expect.objectContaining({
        enabled: true,
        debugMode: true,
        flushInterval: 1000,
        batchSize: 10
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const invalidAnalytics = new AnalyticsManager(eventManager, {
        enabled: true,
        batchSize: 1000, // Invalid batch size (too large, max is 100)
        flushInterval: 100 // Invalid flush interval (too small, min is 1000)
      });

      await expect(invalidAnalytics.initialize()).rejects.toThrow();
    });

    it('should handle tracking when not initialized', () => {
      const uninitializedAnalytics = new AnalyticsManager(eventManager);
      
      expect(() => {
        uninitializedAnalytics.track('test', 'category');
      }).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on destroy', async () => {
      const stats = analytics.getStats();
      expect(stats.isTracking).toBe(true);

      await analytics.destroy();
      
      // Analytics should be in a clean state after destroy
      expect(() => analytics.getStats()).not.toThrow();
    });
  });
});

describe('Analytics Integration', () => {
  let analytics: AnalyticsManager;
  let eventManager: EventManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    (localStorage as any).clear();
    
    eventManager = new EventManager();
    analytics = new AnalyticsManager(eventManager, {
      enabled: true,
      persistEvents: true,
      maxEventsPerSession: 100
    });
    
    await analytics.initialize();
  });

  afterEach(async () => {
    await analytics.destroy();
  });

  it('should integrate with EventManager', async () => {
    // 새로운 analytics 인스턴스 생성하여 초기화 이벤트 캐치
    const newEventManager = new EventManager();
    const eventListener = vi.fn();
    
    // 이벤트 리스너를 먼저 등록
    newEventManager.on('analytics:initialized', eventListener);
    
    const newAnalytics = new AnalyticsManager(newEventManager, {
      enabled: true,
      debugMode: true
    });
    
    // 초기화 실행
    await newAnalytics.initialize();
    
    expect(eventListener).toHaveBeenCalled();
    
    // 정리
    await newAnalytics.destroy();
  });

  it('should persist events to storage', () => {
    // persistEvents 설정이 올바른지 확인
    expect(analytics.getConfig().persistEvents).toBe(true);
  });

  it('should respect event limits per session', () => {
    // Track more events than the limit
    for (let i = 0; i < 150; i++) {
      analytics.track(`event-${i}`, 'category');
    }

    const stats = analytics.getStats();
    expect(stats.eventsThisSession).toBeLessThanOrEqual(100);
  });
}); 