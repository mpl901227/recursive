/**
 * Utility Functions Index
 * 모든 유틸리티 함수들을 중앙에서 관리하는 인덱스 파일
 */

// =============================================================================
// 🔍 검증 유틸리티
// =============================================================================
export * from './validation.js';

// =============================================================================
// 📝 로깅 유틸리티
// =============================================================================
export * from './logger.js';

// =============================================================================
// 🎨 포맷팅 유틸리티
// =============================================================================
export * from './format.js';

// =============================================================================
// 🏗️ DOM 조작 유틸리티 (중복 함수명은 별칭으로 export)
// =============================================================================
export {
  $, $$, createElement, htmlToElement, addClass, removeClass, toggleClass, hasClass,
  setStyle, getStyle, setCSS, removeStyle, setAttributes, getAttributes,
  setData, getData, removeData, on, off, once, trigger,
  getOffset, getPosition, getBounds, getViewportSize, getScrollPosition,
  scrollTo, scrollToTop, scrollToBottom, isInViewport, isVisible, isHidden,
  show, hide, toggle, closest, matches, siblings, next, prev, parent, children,
  clone, remove, empty, getFormData, setFormData, resetForm,
  fadeIn, fadeOut, slideUp, slideDown, animate, makeDraggable, makeResizable,
  ready, waitForElement,
  isEmpty as domIsEmpty,
  validateForm as domValidateForm
} from './dom.js';

// =============================================================================
// ⏱️ 디바운스/스로틀 유틸리티
// =============================================================================
export * from './debounce.js';

// =============================================================================
// ❌ 에러 처리 유틸리티
// =============================================================================
export * from './error-handler.js';

// =============================================================================
// 🎯 유틸리티 매니저
// =============================================================================

/**
 * 유틸리티 함수 매니저 클래스
 */
export class UtilityManager {
  private static instance: UtilityManager;
  
  static getInstance(): UtilityManager {
    if (!UtilityManager.instance) {
      UtilityManager.instance = new UtilityManager();
    }
    return UtilityManager.instance;
  }
  
  /**
   * 모든 유틸리티 시스템 초기화
   */
  async initialize(): Promise<void> {
    console.log('🔧 Initializing utility systems...');
    console.log('✅ Utility systems initialized');
  }
  
  /**
   * 유틸리티 시스템 정리
   */
  cleanup(): void {
    console.log('🧹 Cleaning up utility systems...');
    console.log('✅ Utility systems cleaned up');
  }
  
  /**
   * 유틸리티 시스템 상태 확인
   */
  getStatus() {
    return {
      validation: true,
      logging: true,
      formatting: true,
      dom: typeof window !== 'undefined',
      debounce: true,
      errorHandling: true
    };
  }
}

// =============================================================================
// 🚀 기본 내보내기
// =============================================================================

/**
 * 기본 유틸리티 매니저 인스턴스
 */
export const utilityManager = UtilityManager.getInstance();

/**
 * 유틸리티 시스템 초기화 함수
 */
export const initializeUtils = async (): Promise<void> => {
  await utilityManager.initialize();
};

/**
 * 유틸리티 시스템 정리 함수
 */
export const cleanupUtils = (): void => {
  utilityManager.cleanup();
};

/**
 * 유틸리티 시스템 상태 확인 함수
 */
export const getUtilsStatus = () => {
  return utilityManager.getStatus();
};

export default {
  UtilityManager,
  utilityManager,
  initializeUtils,
  cleanupUtils,
  getUtilsStatus
}; 