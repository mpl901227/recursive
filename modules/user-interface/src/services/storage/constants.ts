/**
 * Storage Service Constants
 * 스토리지 서비스에서 사용하는 상수 정의
 */

import type { CompressionType, EncryptionType, StorageConfig } from './types';

/**
 * 스토리지 이벤트 타입
 */
export const STORAGE_EVENTS = {
  ITEM_SET: 'storage:item:set',
  ITEM_REMOVED: 'storage:item:removed',
  CLEARED: 'storage:cleared',
  ERROR: 'storage:error',
  QUOTA_EXCEEDED: 'storage:quota:exceeded'
} as const;

/**
 * 압축 타입
 */
export const COMPRESSION_TYPE: Record<string, CompressionType> = {
  NONE: 'none',
  GZIP: 'gzip',
  LZ: 'lz'
} as const;

/**
 * 암호화 타입
 */
export const ENCRYPTION_TYPE: Record<string, EncryptionType> = {
  NONE: 'none',
  AES: 'aes',
  BASE64: 'base64'
} as const;

/**
 * 기본 설정
 */
export const DEFAULT_CONFIG: Required<StorageConfig> = {
  prefix: 'app_',
  maxSize: 5 * 1024 * 1024, // 5MB
  compression: 'none' as CompressionType,
  encryption: 'none' as EncryptionType,
  enableEvents: true,
  autoCleanup: true,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
  cacheEnabled: true,
  cacheTimeout: 5 * 60 * 1000, // 5분
  enableTTL: true
} as const;

/**
 * 세션 스토리지 기본 설정
 */
export const SESSION_DEFAULT_CONFIG: Required<StorageConfig> = {
  ...DEFAULT_CONFIG,
  prefix: 'session_',
  maxAge: 24 * 60 * 60 * 1000, // 24시간
  autoCleanup: false // 세션은 자동으로 정리됨
} as const;

/**
 * 스토리지 크기 제한
 */
export const STORAGE_LIMITS = {
  LOCAL_STORAGE_MAX: 10 * 1024 * 1024, // 10MB
  SESSION_STORAGE_MAX: 5 * 1024 * 1024, // 5MB
  CACHE_MAX_ITEMS: 1000,
  TTL_MIN: 1000, // 1초
  TTL_MAX: 365 * 24 * 60 * 60 * 1000 // 1년
} as const;

/**
 * 시스템 키 접두사
 */
export const SYSTEM_KEYS = {
  SESSION_INFO: '__session_info__',
  LAST_CLEANUP: '__last_cleanup__',
  LAST_HIDDEN: '__last_hidden__',
  LAST_VISIBLE: '__last_visible__',
  STORAGE_VERSION: '__storage_version__'
} as const; 