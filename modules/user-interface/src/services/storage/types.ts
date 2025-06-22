/**
 * Storage Service Types
 * 스토리지 서비스에서 사용하는 타입 정의
 */

/**
 * 압축 타입
 */
export type CompressionType = 'none' | 'gzip' | 'lz';

/**
 * 암호화 타입
 */
export type EncryptionType = 'none' | 'aes' | 'base64';

/**
 * 스토리지 설정
 */
export interface StorageConfig {
  prefix?: string;
  maxSize?: number;
  compression?: CompressionType;
  encryption?: EncryptionType;
  enableEvents?: boolean;
  autoCleanup?: boolean;
  maxAge?: number;
  cacheEnabled?: boolean;
  cacheTimeout?: number;
  enableTTL?: boolean;
}

/**
 * 스토리지 옵션 (개별 아이템용)
 */
export interface StorageOptions {
  ttl?: number;
  compress?: boolean;
  encrypt?: boolean;
  system?: boolean;
}

/**
 * TTL 데이터 구조
 */
export interface TTLData {
  value: any;
  timestamp: number;
  ttl?: number;
  metadata?: Record<string, any>;
}

/**
 * 캐시 엔트리
 */
export interface CacheEntry {
  value: any;
  timestamp: number;
  ttl?: number;
}

/**
 * 스토리지 통계
 */
export interface StorageStats {
  reads: number;
  writes: number;
  errors: number;
  cacheHits: number;
  cleanups: number;
  isSupported: boolean;
  usedSize: number;
  itemCount: number;
  cacheSize: number;
  maxSize: number;
}

/**
 * 스토리지 이벤트 데이터
 */
export interface StorageEvent {
  key: string;
  value?: any;
  oldValue?: any;
  options?: StorageOptions;
  error?: Error;
  operation?: string;
  timestamp?: number;
  size?: number;
  removedCount?: number;
  sessionId?: string;
  windowId?: string;
}

/**
 * 이벤트 리스너 타입
 */
export type StorageEventListener = (event: StorageEvent) => void;

/**
 * 스토리지 인터페이스
 */
export interface IStorage {
  set(key: string, value: any, options?: StorageOptions): boolean;
  get<T = any>(key: string, defaultValue?: T, options?: StorageOptions): T;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): boolean;
  keys(): string[];
  getAll(): Record<string, any>;
  getUsedSize(): number;
  getStats(): StorageStats;
  on(event: string, listener: StorageEventListener): () => void;
  off(event: string, listener: StorageEventListener): boolean;
  destroy(): void;
}

/**
 * 세션 정보
 */
export interface SessionInfo {
  sessionId: string;
  windowId: string;
  startTime: number;
  duration: number;
  itemCount: number;
  usedSize: number;
} 