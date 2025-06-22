/**
 * API Client Tests
 * FRONTEND_REFACTORING_PLAN.md Phase 4.5 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIClient } from '@/services/api/api-client';
import type { APIConfig } from '@/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventManager (간단한 모의 객체로 변경)
const createMockEventManager = () => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  listenerCount: vi.fn().mockReturnValue(0)
});

describe('APIClient', () => {
  let apiClient: APIClient;
  let mockEventManager: any;
  let mockConfig: Partial<APIConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventManager = createMockEventManager();
    mockConfig = {
      baseURL: 'http://localhost:3000',
      timeout: 5000,
      retryCount: 3,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    apiClient = new APIClient(mockConfig);
    apiClient.setEventManager(mockEventManager);
  });

  afterEach(async () => {
    await apiClient.destroy();
  });

  describe('Service Interface Implementation', () => {
    it('should implement Service interface correctly', () => {
      expect(apiClient.name).toBe('api-client');
      expect(apiClient.version).toBe('1.0.0');
      expect(typeof apiClient.isInitialized).toBe('boolean');
      expect(['pending', 'initializing', 'ready', 'error', 'destroyed']).toContain(apiClient.status);
    });

    it('should initialize properly', async () => {
      await apiClient.initialize();
      
      expect(apiClient.isInitialized).toBe(true);
      expect(apiClient.status).toBe('ready');
    });

    it('should destroy properly', async () => {
      await apiClient.initialize();
      await apiClient.destroy();
      
      expect(apiClient.status).toBe('destroyed');
      expect(apiClient.isInitialized).toBe(false);
    });

    it('should get status correctly', () => {
      const status = apiClient.getStatus();
      expect(status).toBe('pending');
      expect(['pending', 'initializing', 'ready', 'error', 'destroyed']).toContain(status);
    });
  });

  describe('HTTP Methods', () => {
    beforeEach(async () => {
      await apiClient.initialize();
    });

    it('should have GET method', () => {
      expect(typeof apiClient.get).toBe('function');
    });

    it('should have POST method', () => {
      expect(typeof apiClient.post).toBe('function');
    });

    it('should have PUT method', () => {
      expect(typeof apiClient.put).toBe('function');
    });

    it('should have DELETE method', () => {
      expect(typeof apiClient.delete).toBe('function');
    });
  });
});