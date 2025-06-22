/**
 * DOM Utilities
 * DOM 조작 및 이벤트 처리를 위한 TypeScript 유틸리티 함수들
 */

// 타입 정의
export interface ElementOptions {
  className?: string;
  id?: string;
  textContent?: string;
  innerHTML?: string;
  attributes?: Record<string, string | number | boolean>;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  events?: Record<string, EventListener>;
}

export interface AnimationOptions {
  duration?: number;
  easing?: string;
  fill?: FillMode;
}

export interface Position {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ScrollPosition {
  x: number;
  y: number;
}

export interface DraggableOptions {
  handle?: string | HTMLElement;
  containment?: string | HTMLElement;
  axis?: 'x' | 'y' | 'both';
  onStart?: (event: MouseEvent) => void;
  onDrag?: (event: MouseEvent, position: Position) => void;
  onStop?: (event: MouseEvent, position: Position) => void;
}

export interface ResizableOptions {
  handles?: ('n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw')[];
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: boolean;
  onStart?: (event: MouseEvent) => void;
  onResize?: (event: MouseEvent, size: { width: number; height: number }) => void;
  onStop?: (event: MouseEvent, size: { width: number; height: number }) => void;
}

/**
 * 요소 선택
 */
export const $ = <T extends HTMLElement = HTMLElement>(
  selector: string, 
  context: Document | HTMLElement = document
): T | null => {
  return context.querySelector<T>(selector);
};

export const $$ = <T extends HTMLElement = HTMLElement>(
  selector: string, 
  context: Document | HTMLElement = document
): T[] => {
  return Array.from(context.querySelectorAll<T>(selector));
};

/**
 * 요소 생성
 */
export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {}
): HTMLElementTagNameMap[K] => {
  const {
    className,
    id,
    textContent,
    innerHTML,
    attributes = {},
    style = {},
    dataset = {},
    events = {}
  } = options;

  const element = document.createElement(tag);

  // 클래스 설정
  if (className) {
    element.className = className;
  }

  // ID 설정
  if (id) {
    element.id = id;
  }

  // 텍스트 내용 설정
  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  // HTML 내용 설정
  if (innerHTML !== undefined) {
    element.innerHTML = innerHTML;
  }

  // 속성 설정
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  // 스타일 설정
  Object.entries(style).forEach(([key, value]) => {
    if (value !== undefined) {
      (element.style as any)[key] = value;
    }
  });

  // 데이터 속성 설정
  Object.entries(dataset).forEach(([key, value]) => {
    element.dataset[key] = value;
  });

  // 이벤트 리스너 추가
  Object.entries(events).forEach(([event, handler]) => {
    element.addEventListener(event, handler);
  });

  return element;
};

/**
 * 요소를 특정 위치에 삽입
 */
export const insertElement = (
  element: HTMLElement,
  target: HTMLElement,
  position: InsertPosition = 'beforeend'
): void => {
  target.insertAdjacentElement(position, element);
};

/**
 * HTML 문자열을 요소로 변환
 */
export const htmlToElement = <T extends HTMLElement = HTMLElement>(html: string): T | null => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild as T | null;
};

/**
 * 클래스 관련 유틸리티
 */
export const addClass = (element: HTMLElement, ...classes: string[]): void => {
  element.classList.add(...classes);
};

export const removeClass = (element: HTMLElement, ...classes: string[]): void => {
  element.classList.remove(...classes);
};

export const toggleClass = (element: HTMLElement, className: string, force?: boolean): boolean => {
  return element.classList.toggle(className, force);
};

export const hasClass = (element: HTMLElement, className: string): boolean => {
  return element.classList.contains(className);
};

/**
 * 스타일 관련 유틸리티
 */
export const setStyle = (
  element: HTMLElement,
  styles: string | Partial<CSSStyleDeclaration>
): void => {
  if (typeof styles === 'string') {
    element.style.cssText = styles;
  } else {
    Object.assign(element.style, styles);
  }
};

export const getStyle = (element: HTMLElement, property: string): string => {
  return window.getComputedStyle(element).getPropertyValue(property);
};

export const setCSS = (element: HTMLElement, property: string, value: string): void => {
  element.style.setProperty(property, value);
};

export const removeStyle = (element: HTMLElement, ...properties: string[]): void => {
  properties.forEach(prop => {
    element.style.removeProperty(prop);
  });
};

/**
 * 속성 관련 유틸리티
 */
export const setAttributes = (
  element: HTMLElement,
  attributes: Record<string, string | number | boolean | null | undefined>
): void => {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
    }
  });
};

export const getAttributes = (element: HTMLElement): Record<string, string> => {
  const attrs: Record<string, string> = {};
  Array.from(element.attributes).forEach(attr => {
    attrs[attr.name] = attr.value;
  });
  return attrs;
};

/**
 * 데이터 속성 유틸리티
 */
export const setData = (element: HTMLElement, key: string, value: string): void => {
  element.dataset[key] = value;
};

export const getData = (element: HTMLElement, key: string): string | undefined => {
  return element.dataset[key];
};

export const removeData = (element: HTMLElement, key: string): void => {
  delete element.dataset[key];
};

/**
 * 이벤트 관련 유틸리티
 */
export const on = (
  element: HTMLElement,
  event: string,
  handler: EventListener,
  options: AddEventListenerOptions = {}
): (() => void) => {
  element.addEventListener(event, handler, options);
  return () => element.removeEventListener(event, handler, options);
};

export const off = (
  element: HTMLElement,
  event: string,
  handler: EventListener,
  options: EventListenerOptions = {}
): void => {
  element.removeEventListener(event, handler, options);
};

export const once = (
  element: HTMLElement,
  event: string,
  handler: EventListener,
  options: AddEventListenerOptions = {}
): (() => void) => {
  const onceHandler = (e: Event) => {
    handler(e);
    element.removeEventListener(event, onceHandler, options);
  };
  element.addEventListener(event, onceHandler, options);
  return () => element.removeEventListener(event, onceHandler, options);
};

export const trigger = (
  element: HTMLElement,
  eventType: string,
  detail: any = {}
): boolean => {
  const event = new CustomEvent(eventType, {
    detail,
    bubbles: true,
    cancelable: true
  });
  return element.dispatchEvent(event);
};

/**
 * 위치 및 크기 관련 유틸리티
 */
export const getOffset = (element: HTMLElement): Position => {
  const rect = element.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  return {
    top: rect.top + scrollTop,
    left: rect.left + scrollLeft,
    width: rect.width,
    height: rect.height
  };
};

export const getPosition = (element: HTMLElement): Position => {
  return {
    top: element.offsetTop,
    left: element.offsetLeft,
    width: element.offsetWidth,
    height: element.offsetHeight
  };
};

export const getBounds = (element: HTMLElement): DOMRect => {
  return element.getBoundingClientRect();
};

export const getViewportSize = (): ViewportSize => {
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight
  };
};

export const getScrollPosition = (): ScrollPosition => {
  return {
    x: window.pageXOffset || document.documentElement.scrollLeft,
    y: window.pageYOffset || document.documentElement.scrollTop
  };
};

/**
 * 스크롤 관련 유틸리티
 */
export const scrollTo = (
  element: HTMLElement,
  options: ScrollToOptions = {}
): void => {
  element.scrollTo(options);
};

export const scrollToTop = (smooth: boolean = true): void => {
  window.scrollTo({
    top: 0,
    behavior: smooth ? 'smooth' : 'auto'
  });
};

export const scrollToBottom = (smooth: boolean = true): void => {
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
};

export const isInViewport = (element: HTMLElement, threshold: number = 0): boolean => {
  const rect = element.getBoundingClientRect();
  const viewport = getViewportSize();
  
  return (
    rect.top >= -threshold &&
    rect.left >= -threshold &&
    rect.bottom <= viewport.height + threshold &&
    rect.right <= viewport.width + threshold
  );
};

/**
 * 가시성 관련 유틸리티
 */
export const isVisible = (element: HTMLElement): boolean => {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
};

export const isHidden = (element: HTMLElement): boolean => {
  return !isVisible(element);
};

export const isEmpty = (element: HTMLElement): boolean => {
  return !element.innerHTML.trim();
};

export const show = (element: HTMLElement, display: string = ''): void => {
  element.style.display = display;
};

export const hide = (element: HTMLElement): void => {
  element.style.display = 'none';
};

export const toggle = (element: HTMLElement, force?: boolean): boolean => {
  if (force !== undefined) {
    if (force) {
      show(element);
      return true;
    } else {
      hide(element);
      return false;
    }
  }
  
  if (isVisible(element)) {
    hide(element);
    return false;
  } else {
    show(element);
    return true;
  }
};

/**
 * DOM 탐색 유틸리티
 */
export const closest = (element: HTMLElement, selector: string): HTMLElement | null => {
  return element.closest(selector);
};

export const matches = (element: HTMLElement, selector: string): boolean => {
  return element.matches(selector);
};

export const siblings = (element: HTMLElement): HTMLElement[] => {
  return Array.from(element.parentNode?.children || [])
    .filter((child): child is HTMLElement => child !== element && child instanceof HTMLElement);
};

export const next = (element: HTMLElement, selector?: string): HTMLElement | null => {
  let sibling = element.nextElementSibling as HTMLElement | null;
  if (!selector) return sibling;
  
  while (sibling) {
    if (sibling.matches(selector)) return sibling;
    sibling = sibling.nextElementSibling as HTMLElement | null;
  }
  return null;
};

export const prev = (element: HTMLElement, selector?: string): HTMLElement | null => {
  let sibling = element.previousElementSibling as HTMLElement | null;
  if (!selector) return sibling;
  
  while (sibling) {
    if (sibling.matches(selector)) return sibling;
    sibling = sibling.previousElementSibling as HTMLElement | null;
  }
  return null;
};

export const parent = (element: HTMLElement, selector?: string): HTMLElement | null => {
  if (!selector) return element.parentElement;
  return element.closest(selector);
};

export const children = (element: HTMLElement, selector?: string): HTMLElement[] => {
  const kids = Array.from(element.children) as HTMLElement[];
  return selector ? kids.filter(child => child.matches(selector)) : kids;
};

/**
 * DOM 조작 유틸리티
 */
export const clone = (element: HTMLElement, deep: boolean = true): HTMLElement => {
  return element.cloneNode(deep) as HTMLElement;
};

export const remove = (element: HTMLElement): void => {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
};

export const empty = (element: HTMLElement): void => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

/**
 * 폼 관련 유틸리티
 */
export const getFormData = (form: HTMLFormElement): Record<string, any> => {
  const formData = new FormData(form);
  const data: Record<string, any> = {};
  
  // FormData.entries() 이터레이터를 배열로 변환
  const entries = Array.from(formData.entries());
  
  for (const [key, value] of entries) {
    if (data[key]) {
      // 이미 존재하는 키인 경우 배열로 변환
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }
  
  return data;
};

export const setFormData = (form: HTMLFormElement, data: Record<string, any>): void => {
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (field) {
      if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        field.checked = !!value;
      } else {
        field.value = String(value);
      }
    }
  });
};

export const resetForm = (form: HTMLFormElement): void => {
  form.reset();
};

export const validateForm = (form: HTMLFormElement): boolean => {
  return form.checkValidity();
};

/**
 * 애니메이션 유틸리티
 */
export const fadeIn = (element: HTMLElement, duration: number = 300): Promise<void> => {
  element.style.opacity = '0';
  element.style.display = '';
  
  return animate(element, [
    { opacity: '0' },
    { opacity: '1' }
  ], { duration });
};

export const fadeOut = (element: HTMLElement, duration: number = 300): Promise<void> => {
  return animate(element, [
    { opacity: '1' },
    { opacity: '0' }
  ], { duration }).then(() => {
    element.style.display = 'none';
  });
};

export const slideUp = (element: HTMLElement, duration: number = 300): Promise<void> => {
  const elementHeight = element.offsetHeight;
  element.style.overflow = 'hidden';
  
  return animate(element, [
    { height: `${elementHeight}px` },
    { height: '0px' }
  ], { duration }).then(() => {
    element.style.display = 'none';
    element.style.height = '';
    element.style.overflow = '';
  });
};

export const slideDown = (element: HTMLElement, duration: number = 300): Promise<void> => {
  element.style.display = '';
  const scrollHeight = element.scrollHeight;
  element.style.height = '0';
  element.style.overflow = 'hidden';
  
  return animate(element, [
    { height: '0px' },
    { height: `${scrollHeight}px` }
  ], { duration }).then(() => {
    element.style.height = '';
    element.style.overflow = '';
  });
};

export const animate = (
  element: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: AnimationOptions = {}
): Promise<void> => {
  const { duration = 300, easing = 'ease', fill = 'forwards' } = options;
  
  return new Promise(resolve => {
    const animation = element.animate(keyframes, {
      duration,
      easing,
      fill
    });
    
    animation.addEventListener('finish', () => resolve());
  });
};

/**
 * 드래그 앤 드롭 유틸리티
 */
export const makeDraggable = (element: HTMLElement, options: DraggableOptions = {}): (() => void) => {
  const {
    handle,
    containment,
    axis = 'both',
    onStart,
    onDrag,
    onStop
  } = options;

  const handleElement = handle
    ? (typeof handle === 'string' ? element.querySelector(handle) as HTMLElement : handle)
    : element;

  if (!handleElement) return () => {};

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let elementX = 0;
  let elementY = 0;

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = element.getBoundingClientRect();
    elementX = rect.left;
    elementY = rect.top;
    
    element.style.position = 'absolute';
    element.style.zIndex = '1000';
    
    onStart?.(e);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newX = elementX + deltaX;
    let newY = elementY + deltaY;
    
    // 축 제한
    if (axis === 'x') {
      newY = elementY;
    } else if (axis === 'y') {
      newX = elementX;
    }
    
    // 컨테이너 제한
    if (containment) {
      const container = typeof containment === 'string'
        ? document.querySelector(containment) as HTMLElement
        : containment;
      
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        newX = Math.max(containerRect.left, Math.min(newX, containerRect.right - elementRect.width));
        newY = Math.max(containerRect.top, Math.min(newY, containerRect.bottom - elementRect.height));
      }
    }
    
    element.style.left = newX + 'px';
    element.style.top = newY + 'px';
    
    const position: Position = { top: newY, left: newX, width: element.offsetWidth, height: element.offsetHeight };
    onDrag?.(e, position);
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!isDragging) return;
    
    isDragging = false;
    
    const position: Position = {
      top: element.offsetTop,
      left: element.offsetLeft,
      width: element.offsetWidth,
      height: element.offsetHeight
    };
    
    onStop?.(e, position);
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  handleElement.addEventListener('mousedown', handleMouseDown);

  // 정리 함수 반환
  return () => {
    handleElement.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
};

/**
 * 리사이즈 가능한 요소 만들기
 */
export const makeResizable = (element: HTMLElement, options: ResizableOptions = {}): (() => void) => {
  const {
    handles = ['se'],
    minWidth = 50,
    minHeight = 50,
    maxWidth,
    maxHeight,
    aspectRatio = false,
    onStart,
    onResize,
    onStop
  } = options;

  const cleanupFunctions: (() => void)[] = [];

  handles.forEach(handle => {
    const handleElement = document.createElement('div');
    handleElement.className = `resize-handle resize-${handle}`;
    handleElement.style.cssText = getHandleStyle(handle);
    
    element.appendChild(handleElement);
    element.style.position = 'relative';

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = element.offsetWidth;
      startHeight = element.offsetHeight;
      
      onStart?.(e);
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      
      // 핸들 방향에 따른 크기 조정
      if (handle.includes('e')) newWidth = startWidth + deltaX;
      if (handle.includes('w')) newWidth = startWidth - deltaX;
      if (handle.includes('s')) newHeight = startHeight + deltaY;
      if (handle.includes('n')) newHeight = startHeight - deltaY;
      
      // 최소/최대 크기 제한
      newWidth = Math.max(minWidth, newWidth);
      newHeight = Math.max(minHeight, newHeight);
      
      if (maxWidth) newWidth = Math.min(maxWidth, newWidth);
      if (maxHeight) newHeight = Math.min(maxHeight, newHeight);
      
      // 비율 유지
      if (aspectRatio) {
        const ratio = startWidth / startHeight;
        if (handle.includes('e') || handle.includes('w')) {
          newHeight = newWidth / ratio;
        } else {
          newWidth = newHeight * ratio;
        }
      }
      
      element.style.width = newWidth + 'px';
      element.style.height = newHeight + 'px';
      
      onResize?.(e, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isResizing) return;
      
      isResizing = false;
      
      onStop?.(e, { width: element.offsetWidth, height: element.offsetHeight });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    handleElement.addEventListener('mousedown', handleMouseDown);
    
    cleanupFunctions.push(() => {
      handleElement.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (handleElement.parentNode) {
        handleElement.parentNode.removeChild(handleElement);
      }
    });
  });

  // 정리 함수 반환
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
};

const getHandleStyle = (handle: string): string => {
  const baseStyle = 'position: absolute; background: #007cba; border: 1px solid #005a87;';
  
  switch (handle) {
    case 'n': return baseStyle + 'top: -3px; left: 50%; width: 20px; height: 6px; margin-left: -10px; cursor: n-resize;';
    case 's': return baseStyle + 'bottom: -3px; left: 50%; width: 20px; height: 6px; margin-left: -10px; cursor: s-resize;';
    case 'e': return baseStyle + 'right: -3px; top: 50%; width: 6px; height: 20px; margin-top: -10px; cursor: e-resize;';
    case 'w': return baseStyle + 'left: -3px; top: 50%; width: 6px; height: 20px; margin-top: -10px; cursor: w-resize;';
    case 'ne': return baseStyle + 'top: -3px; right: -3px; width: 6px; height: 6px; cursor: ne-resize;';
    case 'nw': return baseStyle + 'top: -3px; left: -3px; width: 6px; height: 6px; cursor: nw-resize;';
    case 'se': return baseStyle + 'bottom: -3px; right: -3px; width: 6px; height: 6px; cursor: se-resize;';
    case 'sw': return baseStyle + 'bottom: -3px; left: -3px; width: 6px; height: 6px; cursor: sw-resize;';
    default: return baseStyle;
  }
};

/**
 * DOM 준비 상태 확인
 */
export const ready = (callback: () => void): void => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
};

/**
 * 요소가 나타날 때까지 대기
 */
export const waitForElement = (
  selector: string,
  timeout: number = 10000
): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
};

/**
 * 로딩 화면을 숨깁니다
 */
export function hideLoadingScreen(): void {
  const loadingScreen = document.querySelector('#loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }
}

/**
 * 메인 앱 UI를 표시합니다
 */
export function showApp(): void {
  const appRoot = document.querySelector('#app');
  if (appRoot) {
    appRoot.classList.remove('hidden');
  }
}

/**
 * 에러 화면을 표시합니다
 */
export function showErrorScreen(error: Error): void {
  const errorScreen = document.querySelector('#error-screen');
  if (errorScreen) {
    errorScreen.classList.remove('hidden');
    const errorMessage = errorScreen.querySelector('.error-message');
    if (errorMessage) {
      errorMessage.textContent = error.message;
    }
  }
}