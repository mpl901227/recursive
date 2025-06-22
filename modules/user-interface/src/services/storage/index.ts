/**
 * Storage Services
 * 브라우저 스토리지를 안전하게 관리하는 서비스들
 */

export { StorageManager } from './storage-manager';
export { LocalStorageWrapper } from './local-storage-wrapper';
export { SessionStorageWrapper } from './session-storage-wrapper';

export type {
  StorageConfig,
  StorageOptions,
  StorageStats,
  StorageEvent,
  CompressionType,
  EncryptionType,
  TTLData,
  CacheEntry
} from './types';

export {
  STORAGE_EVENTS,
  COMPRESSION_TYPE,
  ENCRYPTION_TYPE,
  DEFAULT_CONFIG
} from './constants'; 