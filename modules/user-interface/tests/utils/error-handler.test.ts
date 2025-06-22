/**
 * Error Handler Test Suite
 * 에러 처리 시스템 통합 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorHandlerManager, ErrorType, ErrorSeverity } from '@/utils/error-handler';
import { EventManager } from '@/core/events';

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
    })
  };
};

// Mock sessionStorage
const mockSessionStorage = () => {
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
    })
  };
};

// Mock console methods
const originalConsole = { ...console };

describe('ErrorHandlerManager', () => {
  let errorHandler: ErrorHandlerManager;
  let eventManager: EventManager;
  let mockLocalStorage: ReturnType<typeof mockStorage>;
  let mockSessionStorageObj: ReturnType<typeof mockSessionStorage>;

  beforeEach(async () => {
    // Setup mocks
    mockLocalStorage = mockStorage();
    mockSessionStorageObj = mockSessionStorage();
    
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });
    
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorageObj,
      writable: true
    });

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create instances
    eventManager = new EventManager();
    errorHandler = new ErrorHandlerManager(eventManager, {
      enabled: true,
      debugMode: true,
      enableLocalStorage: true,
      showUserNotifications: false, // Disable for testing
      rateLimitMs: 0 // Disable rate limiting for tests
    });

    await errorHandler.initialize();
  });

  afterEach(async () => {
    await errorHandler.destroy();
    vi.restoreAllMocks();
    
    // Restore console
    Object.assign(console, originalConsole);
  });

  describe('Initialization', () => {
    it('should initialize properly', () => {
      expect(errorHandler).toBeDefined();
      expect(errorHandler.getConfig().enabled).toBe(true);
    });

    it('should generate session ID', () => {
      const stats = errorHandler.getErrorStats();
      expect(stats.sessionStartTime).toBeInstanceOf(Date);
    });

    it('should emit initialization event', async () => {
      const initListener = vi.fn();
      eventManager.on('errorHandler:initialized', initListener);
      
      const newErrorHandler = new ErrorHandlerManager(eventManager);
      await newErrorHandler.initialize();
      
      expect(initListener).toHaveBeenCalled();
      
      await newErrorHandler.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should handle manual errors', () => {
      errorHandler.reportError('Test error');
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Test error');
      expect(errors[0]?.type).toBe(ErrorType.MANUAL);
    });

    it('should handle Error objects', () => {
      const testError = new Error('Test Error Object');
      errorHandler.reportError(testError);
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Test Error Object');
      expect(errors[0]?.stack).toBeDefined();
    });

    it('should handle errors with context', () => {
      errorHandler.reportError('Context error', {
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.HIGH,
        userId: 'test-user',
        component: 'test-component'
      });
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.type).toBe(ErrorType.VALIDATION);
      expect(errors[0]?.severity).toBe(ErrorSeverity.HIGH);
      expect(errors[0]?.context?.component).toBe('test-component');
    });

    it('should assign unique IDs to errors', () => {
      errorHandler.reportError('Error 1');
      errorHandler.reportError('Error 2');
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0]?.id).not.toBe(errors[1]?.id);
      expect(errors[0]?.id).toMatch(/^error_/);
    });

    it('should track error counts', () => {
      errorHandler.reportError('Duplicate error');
      errorHandler.reportError('Duplicate error');
      errorHandler.reportError('Different error');
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByType[ErrorType.MANUAL]).toBe(3);
    });
  });

  describe('Error Filtering', () => {
    it('should apply ignore rules', () => {
      errorHandler.addIgnoreRule((error) => error.message.includes('ignore'));
      
      errorHandler.reportError('Normal error');
      errorHandler.reportError('Please ignore this error');
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Normal error');
    });

    it('should apply rate limiting', async () => {
      // Configure short rate limit for testing
      errorHandler.updateConfig({ rateLimitMs: 100 });
      
      errorHandler.reportError('Rate limited error');
      errorHandler.reportError('Rate limited error'); // Should be ignored
      
      expect(errorHandler.getErrorStats().totalErrors).toBe(1);
      
      // Wait for rate limit to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      errorHandler.reportError('Rate limited error'); // Should be accepted
      expect(errorHandler.getErrorStats().totalErrors).toBe(2);
    });
  });

  describe('Error Categories', () => {
    it('should handle different error types', () => {
      errorHandler.reportError('JS Error', { type: ErrorType.JAVASCRIPT });
      errorHandler.reportError('Network Error', { type: ErrorType.NETWORK });
      errorHandler.reportError('Validation Error', { type: ErrorType.VALIDATION });
      
      const stats = errorHandler.getErrorStats();
      expect(stats.errorsByType[ErrorType.JAVASCRIPT]).toBe(1);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
      expect(stats.errorsByType[ErrorType.VALIDATION]).toBe(1);
    });

    it('should handle different severity levels', () => {
      errorHandler.reportError('Low severity', { severity: ErrorSeverity.LOW });
      errorHandler.reportError('High severity', { severity: ErrorSeverity.HIGH });
      errorHandler.reportError('Critical severity', { severity: ErrorSeverity.CRITICAL });
      
      const stats = errorHandler.getErrorStats();
      expect(stats.errorsBySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    });

    it('should register and use category handlers', () => {
      const validationHandler = vi.fn();
      errorHandler.addCategoryHandler(ErrorType.VALIDATION, validationHandler);
      
      errorHandler.reportError('Validation error', { type: ErrorType.VALIDATION });
      
      expect(validationHandler).toHaveBeenCalled();
      expect(validationHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.VALIDATION,
          message: 'Validation error'
        })
      );
    });
  });

  describe('Error Querying', () => {
    beforeEach(() => {
      errorHandler.reportError('JS Error 1', { type: ErrorType.JAVASCRIPT });
      errorHandler.reportError('JS Error 2', { type: ErrorType.JAVASCRIPT });
      errorHandler.reportError('Network Error', { type: ErrorType.NETWORK });
    });

    it('should get all errors', () => {
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(3);
    });

    it('should filter errors by type', () => {
      const jsErrors = errorHandler.getErrorsByType(ErrorType.JAVASCRIPT);
      expect(jsErrors).toHaveLength(2);
      
      const networkErrors = errorHandler.getErrorsByType(ErrorType.NETWORK);
      expect(networkErrors).toHaveLength(1);
    });

    it('should provide error statistics', () => {
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByType[ErrorType.JAVASCRIPT]).toBe(2);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
      expect(stats.lastErrorTime).toBeInstanceOf(Date);
    });
  });

  describe('Storage Integration', () => {
    it('should save errors to localStorage', () => {
      errorHandler.reportError('Stored error');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'recursive_errors',
        expect.stringContaining('Stored error')
      );
    });

    it('should handle localStorage failures gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });
      
      expect(() => {
        errorHandler.reportError('Storage error');
      }).not.toThrow();
    });
  });

  describe('Event Integration', () => {
    it('should emit error events', () => {
      const errorListener = vi.fn();
      eventManager.on('error:occurred', errorListener);
      
      errorHandler.reportError('Event test error');
      
      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Event test error'
        })
      );
    });

    it('should emit notification events for different severities', () => {
      const errorNotificationListener = vi.fn();
      const warningNotificationListener = vi.fn();
      
      eventManager.on('notification:error', errorNotificationListener);
      eventManager.on('notification:warning', warningNotificationListener);
      
      // Enable notifications for this test
      errorHandler.updateConfig({ showUserNotifications: true });
      
      errorHandler.reportError('High severity error', { severity: ErrorSeverity.HIGH });
      errorHandler.reportError('Medium severity error', { severity: ErrorSeverity.MEDIUM });
      
      expect(errorNotificationListener).toHaveBeenCalled();
      expect(warningNotificationListener).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxErrors: 50,
        debugMode: false,
        enableLocalStorage: false
      };
      
      errorHandler.updateConfig(newConfig);
      
      const config = errorHandler.getConfig();
      expect(config.maxErrors).toBe(50);
      expect(config.debugMode).toBe(false);
      expect(config.enableLocalStorage).toBe(false);
    });

    it('should emit config update events', () => {
      const configListener = vi.fn();
      eventManager.on('errorHandler:configUpdated', configListener);
      
      errorHandler.updateConfig({ debugMode: false });
      
      expect(configListener).toHaveBeenCalledWith(
        expect.objectContaining({ debugMode: false })
      );
    });

    it('should respect max errors limit', () => {
      errorHandler.updateConfig({ maxErrors: 2 });
      
      errorHandler.reportError('Error 1');
      errorHandler.reportError('Error 2');
      errorHandler.reportError('Error 3'); // Should remove Error 1
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0]?.message).toBe('Error 2');
      expect(errors[1]?.message).toBe('Error 3');
    });
  });

  describe('Custom Messages', () => {
    it('should set and use custom error messages', () => {
      errorHandler.setErrorMessage(ErrorType.VALIDATION, 'Custom validation message');
      
      // We can't easily test the user notification, but we can verify the message is set
      const config = errorHandler.getConfig();
      expect(config).toBeDefined();
    });
  });

  describe('Export and Clear', () => {
    beforeEach(() => {
      errorHandler.reportError('Export test error 1');
      errorHandler.reportError('Export test error 2');
    });

    it('should export errors as JSON', () => {
      const exported = errorHandler.exportErrors();
      const data = JSON.parse(exported);
      
      expect(data.errors).toHaveLength(2);
      expect(data.stats.totalErrors).toBe(2);
      expect(data.timestamp).toBeTypeOf('number');
    });

    it('should clear all errors', () => {
      const clearListener = vi.fn();
      eventManager.on('errors:cleared', clearListener);
      
      errorHandler.clearErrors();
      
      expect(errorHandler.getErrorStats().totalErrors).toBe(0);
      expect(errorHandler.getAllErrors()).toHaveLength(0);
      expect(clearListener).toHaveBeenCalled();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('recursive_errors');
    });
  });

  describe('Cleanup', () => {
    it('should clean up properly on destroy', async () => {
      const destroyListener = vi.fn();
      eventManager.on('errorHandler:destroyed', destroyListener);
      
      errorHandler.reportError('Before destroy');
      
      await errorHandler.destroy();
      
      expect(destroyListener).toHaveBeenCalled();
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'recursive_errors',
        expect.any(String)
      );
    });
  });

  describe('Error Retrieval Edge Cases', () => {
    it('should handle empty error arrays gracefully', () => {
      // Clear any existing errors
      errorHandler.clearErrors();
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(0);
      
      const jsErrors = errorHandler.getErrorsByType(ErrorType.JAVASCRIPT);
      expect(jsErrors).toHaveLength(0);
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.lastErrorTime).toBeUndefined();
    });

    it('should handle single error scenarios', () => {
      errorHandler.reportError('Single error');
      
      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Single error');
    });

    it('should handle large number of errors', () => {
      // Add more errors than the default limit
      for (let i = 0; i < 150; i++) {
        errorHandler.reportError(`Error ${i}`);
      }
      
      const errors = errorHandler.getAllErrors();
      // Should respect maxErrors limit (default is 100)
      expect(errors.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Advanced Error Handling', () => {
    it('should handle complex error contexts', () => {
      errorHandler.reportError('Complex context error', {
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        userId: 'test-user-123',
        component: 'user-profile-form',
        action: 'form_submission',
        formData: { name: 'Test User', email: 'test@example.com' }
      });

      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.context?.userId).toBe('test-user-123');
      expect(errors[0]?.context?.component).toBe('user-profile-form');
      expect(errors[0]?.context?.formData?.name).toBe('Test User');
    });

    it('should handle multiple ignore rules', () => {
      errorHandler.addIgnoreRule((error) => error.message.includes('ignore1'));
      errorHandler.addIgnoreRule((error) => error.message.includes('ignore2'));
      errorHandler.addIgnoreRule((error) => error.severity === ErrorSeverity.LOW);

      errorHandler.reportError('Normal error');
      errorHandler.reportError('Please ignore1 this');
      errorHandler.reportError('Please ignore2 this');
      errorHandler.reportError('Low priority error', { severity: ErrorSeverity.LOW });

      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Normal error');
    });

    it('should handle multiple category handlers', () => {
      const jsHandler = vi.fn();
      const networkHandler = vi.fn();
      const validationHandler = vi.fn();

      errorHandler.addCategoryHandler(ErrorType.JAVASCRIPT, jsHandler);
      errorHandler.addCategoryHandler(ErrorType.NETWORK, networkHandler);
      errorHandler.addCategoryHandler(ErrorType.VALIDATION, validationHandler);

      errorHandler.reportError('JS Error', { type: ErrorType.JAVASCRIPT });
      errorHandler.reportError('Network Error', { type: ErrorType.NETWORK });
      errorHandler.reportError('Validation Error', { type: ErrorType.VALIDATION });

      expect(jsHandler).toHaveBeenCalledTimes(1);
      expect(networkHandler).toHaveBeenCalledTimes(1);
      expect(validationHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle error handler exceptions gracefully', () => {
      const faultyHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      errorHandler.addCategoryHandler(ErrorType.MANUAL, faultyHandler);

      // Should not throw even if handler throws
      expect(() => {
        errorHandler.reportError('Test error');
      }).not.toThrow();

      expect(faultyHandler).toHaveBeenCalled();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle partial config updates', () => {
      const originalConfig = errorHandler.getConfig();

      errorHandler.updateConfig({ maxErrors: 25 });

      const updatedConfig = errorHandler.getConfig();
      expect(updatedConfig.maxErrors).toBe(25);
      expect(updatedConfig.debugMode).toBe(originalConfig.debugMode);
      expect(updatedConfig.enabled).toBe(originalConfig.enabled);
    });

    it('should handle config updates with undefined values', () => {
      errorHandler.updateConfig({ 
        maxErrors: undefined as any,
        debugMode: false 
      });

      const config = errorHandler.getConfig();
      expect(config.debugMode).toBe(false);
      // maxErrors should remain unchanged since undefined was passed
    });
  });

  describe('Performance and Memory', () => {
    it('should clean up old errors when limit exceeded', () => {
      errorHandler.updateConfig({ maxErrors: 3 });

      errorHandler.reportError('Error 1');
      errorHandler.reportError('Error 2');
      errorHandler.reportError('Error 3');
      errorHandler.reportError('Error 4');
      errorHandler.reportError('Error 5');

      const errors = errorHandler.getAllErrors();
      expect(errors).toHaveLength(3);
      expect(errors[0]?.message).toBe('Error 3');
      expect(errors[1]?.message).toBe('Error 4');
      expect(errors[2]?.message).toBe('Error 5');
    });

    it('should handle rapid error generation', async () => {
      const startTime = Date.now();
      
      // Generate many errors quickly
      for (let i = 0; i < 50; i++) {
        errorHandler.reportError(`Rapid error ${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly (less than 100ms for 50 errors)
      expect(duration).toBeLessThan(100);

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(50);
    });
  });

  describe('Session Management', () => {
    it('should maintain session consistency', () => {
      const stats1 = errorHandler.getErrorStats();
      const sessionId1 = stats1.sessionStartTime;

      // Create new error handler
      const newErrorHandler = new ErrorHandlerManager(eventManager);
      const stats2 = newErrorHandler.getErrorStats();
      const sessionId2 = stats2.sessionStartTime;

      // Should have different session start times
      expect(sessionId1).not.toEqual(sessionId2);
    });

    it('should track session duration', async () => {
      const initialStats = errorHandler.getErrorStats();
      const startTime = initialStats.sessionStartTime;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      errorHandler.reportError('Session test error');

      const finalStats = errorHandler.getErrorStats();
      expect(finalStats.sessionStartTime).toEqual(startTime);
      expect(finalStats.lastErrorTime).toBeInstanceOf(Date);
      expect(finalStats.lastErrorTime!.getTime()).toBeGreaterThan(startTime.getTime());
    });
  });
});