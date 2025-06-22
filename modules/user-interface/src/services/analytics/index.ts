// Analytics 서비스 메인 export

export { AnalyticsManager } from './analytics-manager';
export * from './types';
export * from './constants';

// 기본 인스턴스 생성 헬퍼
import { EventManager } from '../../core/events';
import { AnalyticsManager } from './analytics-manager';
import { AnalyticsConfig } from './types';

/**
 * Analytics 서비스 인스턴스 생성
 */
export function createAnalyticsService(
  eventManager: EventManager, 
  config?: Partial<AnalyticsConfig>
): AnalyticsManager {
  return new AnalyticsManager(eventManager, config);
}

// 기본 내보내기
export default AnalyticsManager; 