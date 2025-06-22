/**
 * Debounce and Throttle Utilities
 * 함수 호출 빈도를 제어하는 TypeScript 유틸리티 함수들
 */

// 타입 정의
export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number | null;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface IdleCallbackOptions {
  timeout?: number;
}

export interface AdaptiveDebounceOptions {
  factor?: number;
  resetThreshold?: number;
}

export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
  pending: () => boolean;
}

export interface AsyncDebouncedFunction<T extends (...args: any[]) => Promise<any>> {
  (...args: Parameters<T>): Promise<ReturnType<T>>;
  cancel: () => void;
  flush: () => Promise<ReturnType<T> | undefined>;
  pending: () => boolean;
}

export interface BatchDebouncedFunction<T> {
  (item: T): void;
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
}

/**
 * 디바운스 함수
 * 연속된 함수 호출을 지연시켜 마지막 호출만 실행
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
  options: DebounceOptions = {}
): DebouncedFunction<T> => {
  const {
    leading = false,
    trailing = true,
    maxWait = null
  } = options;

  let timeoutId: number | undefined;
  let maxTimeoutId: number | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: any;
  let result: ReturnType<T> | undefined;

  function invokeFunc(time: number): ReturnType<T> {
    const args = lastArgs!;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result as ReturnType<T>;
  }

  function leadingEdge(time: number): ReturnType<T> | undefined {
    lastInvokeTime = time;
    timeoutId = window.setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time: number): number {
    const timeSinceLastCall = time - lastCallTime!;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return maxWait !== null
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - (lastCallTime || 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (lastCallTime === undefined || 
            (timeSinceLastCall >= wait) ||
            (timeSinceLastCall < 0) ||
            (maxWait !== null && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired(): ReturnType<T> | undefined {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeoutId = window.setTimeout(timerExpired, remainingWait(time));
    return undefined;
  }

  function trailingEdge(time: number): ReturnType<T> | undefined {
    timeoutId = undefined;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel(): void {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId !== undefined) {
      clearTimeout(maxTimeoutId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeoutId = maxTimeoutId = undefined;
  }

  function flush(): ReturnType<T> | undefined {
    return timeoutId === undefined ? result : trailingEdge(Date.now());
  }

  function pending(): boolean {
    return timeoutId !== undefined;
  }

  function debounced(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxWait !== null) {
        timeoutId = window.setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timeoutId === undefined) {
      timeoutId = window.setTimeout(timerExpired, wait);
    }
    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
};

/**
 * 스로틀 함수
 * 지정된 시간 간격으로 함수 실행을 제한
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
  options: ThrottleOptions = {}
): DebouncedFunction<T> => {
  const {
    leading = true,
    trailing = true
  } = options;

  return debounce(func, wait, {
    leading,
    trailing,
    maxWait: wait
  });
};

/**
 * 애니메이션 프레임 기반 스로틀
 */
export const throttleAnimationFrame = <T extends (...args: any[]) => any>(
  func: T
): DebouncedFunction<T> => {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;

  function throttled(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    lastArgs = args;
    lastThis = this;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs !== null) {
          func.apply(lastThis, lastArgs);
        }
        rafId = null;
        lastArgs = null;
        lastThis = null;
      });
    }
    return undefined;
  }

  throttled.cancel = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastArgs = null;
      lastThis = null;
    }
  };

  throttled.flush = (): ReturnType<T> | undefined => {
    if (rafId !== null && lastArgs !== null) {
      throttled.cancel();
      return func.apply(lastThis, lastArgs);
    }
    return undefined;
  };

  throttled.pending = (): boolean => rafId !== null;

  return throttled;
};

/**
 * Idle 콜백 기반 스로틀
 */
export const throttleIdleCallback = <T extends (...args: any[]) => any>(
  func: T,
  idleOptions: IdleCallbackOptions = {}
): DebouncedFunction<T> => {
  const { timeout = 5000 } = idleOptions;
  let idleId: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;

  function throttled(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    lastArgs = args;
    lastThis = this;

    if (idleId === null) {
      const callback = (deadline: IdleDeadline) => {
        if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
          if (lastArgs !== null) {
            func.apply(lastThis, lastArgs);
          }
          idleId = null;
          lastArgs = null;
          lastThis = null;
        } else {
          idleId = requestIdleCallback(callback, { timeout });
        }
      };

      idleId = requestIdleCallback(callback, { timeout });
    }
    return undefined;
  }

  throttled.cancel = (): void => {
    if (idleId !== null) {
      cancelIdleCallback(idleId);
      idleId = null;
      lastArgs = null;
      lastThis = null;
    }
  };

  throttled.flush = (): ReturnType<T> | undefined => {
    if (idleId !== null && lastArgs !== null) {
      throttled.cancel();
      return func.apply(lastThis, lastArgs);
    }
    return undefined;
  };

  throttled.pending = (): boolean => idleId !== null;

  return throttled;
};

/**
 * 비동기 디바운스
 */
export const debounceAsync = <T extends (...args: any[]) => Promise<any>>(
  func: T,
  wait: number = 300
): AsyncDebouncedFunction<T> => {
  let timeoutId: number | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: any;
  let pendingPromise: Promise<ReturnType<T>> | null = null;
  let resolvePending: ((value: ReturnType<T>) => void) | null = null;

  function invokeFunc(): Promise<ReturnType<T>> {
    const args = lastArgs!;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    return func.apply(thisArg, args);
  }

  function cancel(): void {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (resolvePending) {
      resolvePending = null;
    }
    pendingPromise = null;
    lastArgs = lastThis = undefined;
  }

  function flush(): Promise<ReturnType<T> | undefined> {
    if (timeoutId === undefined) {
      return Promise.resolve(undefined);
    }
    clearTimeout(timeoutId);
    timeoutId = undefined;
    return lastArgs ? invokeFunc() : Promise.resolve(undefined);
  }

  function pending(): boolean {
    return timeoutId !== undefined;
  }

  function debounced(this: unknown, ...args: Parameters<T>): Promise<ReturnType<T>> {
    lastArgs = args;
    lastThis = this;

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    if (!pendingPromise) {
      pendingPromise = new Promise<ReturnType<T>>((resolve) => {
        resolvePending = resolve;
      });
    }

    timeoutId = window.setTimeout(async () => {
      try {
        const result = await invokeFunc();
        if (resolvePending) {
          resolvePending(result);
          resolvePending = null;
          pendingPromise = null;
        }
      } catch (error) {
        if (resolvePending) {
          resolvePending = null;
          pendingPromise = null;
        }
        throw error;
      }
    }, wait);

    return pendingPromise;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
};

/**
 * 배치 디바운스
 */
export const debounceBatch = <T>(
  func: (items: T[]) => void,
  wait: number = 300,
  maxBatch: number = 10
): BatchDebouncedFunction<T> => {
  let timeoutId: number | undefined;
  let batch: T[] = [];

  function processBatch(): void {
    if (batch.length > 0) {
      const currentBatch = [...batch];
      batch = [];
      func(currentBatch);
    }
  }

  function batched(item: T): void {
    batch.push(item);

    if (batch.length >= maxBatch) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      processBatch();
    } else {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        processBatch();
        timeoutId = undefined;
      }, wait);
    }
  }

  batched.cancel = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    batch = [];
  };

  batched.flush = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    processBatch();
  };

  batched.pending = (): boolean => timeoutId !== undefined || batch.length > 0;

  return batched;
};

/**
 * 적응형 디바운스
 */
export const debounceAdaptive = <T extends (...args: any[]) => any>(
  func: T,
  minWait: number = 100,
  maxWait: number = 1000,
  options: AdaptiveDebounceOptions = {}
): DebouncedFunction<T> => {
  const { factor = 1.5, resetThreshold = 5000 } = options;
  
  let currentWait = minWait;
  let consecutiveCalls = 0;
  let lastCallTime = 0;
  let debouncedFunc = debounce(func, currentWait);

  function updateWait(): void {
    const now = Date.now();
    if (now - lastCallTime > resetThreshold) {
      consecutiveCalls = 0;
      currentWait = minWait;
    } else {
      consecutiveCalls++;
      currentWait = Math.min(maxWait, currentWait * factor);
    }
    lastCallTime = now;
    
    // 새로운 wait time으로 debounced 함수 재생성
    debouncedFunc.cancel();
    debouncedFunc = debounce(func, currentWait);
  }

  function adaptive(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    updateWait();
    return debouncedFunc.apply(this, args);
  }

  adaptive.cancel = (): void => debouncedFunc.cancel();
  adaptive.flush = (): ReturnType<T> | undefined => debouncedFunc.flush();
  adaptive.pending = (): boolean => debouncedFunc.pending();

  return adaptive;
};

/**
 * 그룹별 디바운스
 */
export const debounceGrouped = <T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
  keyExtractor: (...args: Parameters<T>) => string = (...args) => String(args[0])
): ((...args: Parameters<T>) => ReturnType<T> | undefined) & {
  cancel: (key?: string) => void;
  flush: (key?: string) => ReturnType<T> | undefined;
  pending: (key?: string) => boolean;
} => {
  const debouncedFunctions = new Map<string, DebouncedFunction<T>>();

  function grouped(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const key = keyExtractor(...args);
    
    if (!debouncedFunctions.has(key)) {
      debouncedFunctions.set(key, debounce(func, wait));
    }
    
    const debouncedFunc = debouncedFunctions.get(key);
    return debouncedFunc ? debouncedFunc.apply(this, args) : undefined;
  }

  grouped.cancel = (key?: string): void => {
    if (key) {
      const debouncedFunc = debouncedFunctions.get(key);
      if (debouncedFunc) {
        debouncedFunc.cancel();
        debouncedFunctions.delete(key);
      }
    } else {
      debouncedFunctions.forEach(debouncedFunc => debouncedFunc.cancel());
      debouncedFunctions.clear();
    }
  };

  grouped.flush = (key?: string): ReturnType<T> | undefined => {
    if (key) {
      const debouncedFunc = debouncedFunctions.get(key);
      return debouncedFunc ? debouncedFunc.flush() : undefined;
    } else {
      let lastResult: ReturnType<T> | undefined;
      debouncedFunctions.forEach(debouncedFunc => {
        lastResult = debouncedFunc.flush();
      });
      return lastResult;
    }
  };

  grouped.pending = (key?: string): boolean => {
    if (key) {
      const debouncedFunc = debouncedFunctions.get(key);
      return debouncedFunc ? debouncedFunc.pending() : false;
    } else {
      return Array.from(debouncedFunctions.values()).some(debouncedFunc => debouncedFunc.pending());
    }
  };

  return grouped;
};

/**
 * 조건부 디바운스
 */
export const debounceConditional = <T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
  condition: (...args: Parameters<T>) => boolean = () => true
): DebouncedFunction<T> => {
  const debouncedFunc = debounce(func, wait);

  function conditional(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    if (condition(...args)) {
      return debouncedFunc.apply(this, args);
    } else {
      return func.apply(this, args);
    }
  }

  conditional.cancel = (): void => debouncedFunc.cancel();
  conditional.flush = (): ReturnType<T> | undefined => debouncedFunc.flush();
  conditional.pending = (): boolean => debouncedFunc.pending();

  return conditional;
};

/**
 * 다단계 디바운스
 */
export const debounceMultiLevel = <T extends (...args: any[]) => any>(
  func: T,
  waits: number[] = [100, 300, 1000]
): DebouncedFunction<T> => {
  if (waits.length === 0) {
    waits = [300]; // 기본값 설정
  }
  
  let level = 0;
  let lastCallTime = 0;
  let currentDebounced = debounce(func, waits[0]!);

  function multiLevel(this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    
    // level이 유효한 범위인지 확인
    if (level >= waits.length) {
      level = waits.length - 1;
    }
    if (level < 0) {
      level = 0;
    }

    const currentWait = waits[level]!; // 위에서 범위를 체크했으므로 안전
    
    // 빠른 연속 호출인 경우 레벨 증가
    if (timeSinceLastCall < currentWait * 2 && level < waits.length - 1) {
      level++;
      currentDebounced.cancel();
      currentDebounced = debounce(func, waits[level]!);
    } else if (timeSinceLastCall > currentWait * 5 && level > 0) {
      // 오랜 시간 후 호출인 경우 레벨 감소
      level = 0;
      currentDebounced.cancel();
      currentDebounced = debounce(func, waits[level]!);
    }

    lastCallTime = now;
    return currentDebounced.apply(this, args);
  }

  multiLevel.cancel = (): void => currentDebounced.cancel();
  multiLevel.flush = (): ReturnType<T> | undefined => currentDebounced.flush();
  multiLevel.pending = (): boolean => currentDebounced.pending();

  return multiLevel;
};

/**
 * 이벤트 리스너에 디바운스 적용
 */
export const addDebouncedListener = <K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  wait: number = 300,
  options: DebounceOptions & AddEventListenerOptions = {}
): (() => void) => {
  const { leading, trailing, maxWait, ...listenerOptions } = options;
  
  // undefined 값들을 필터링하여 DebounceOptions에 전달
  const debounceOptions: DebounceOptions = {};
  if (leading !== undefined) debounceOptions.leading = leading;
  if (trailing !== undefined) debounceOptions.trailing = trailing;
  if (maxWait !== undefined) debounceOptions.maxWait = maxWait;
  
  const debouncedHandler = debounce(handler, wait, debounceOptions);
  
  element.addEventListener(event, debouncedHandler, listenerOptions);
  
  return () => {
    element.removeEventListener(event, debouncedHandler, listenerOptions);
    debouncedHandler.cancel();
  };
};

/**
 * 스크롤 이벤트에 디바운스 적용
 */
export const addDebouncedScrollListener = (
  handler: (event: Event) => void,
  wait: number = 100,
  element: Window | HTMLElement = window
): (() => void) => {
  const debouncedHandler = debounce(handler, wait);
  
  element.addEventListener('scroll', debouncedHandler, { passive: true });
  
  return () => {
    element.removeEventListener('scroll', debouncedHandler);
    debouncedHandler.cancel();
  };
};

/**
 * 리사이즈 이벤트에 디바운스 적용
 */
export const addDebouncedResizeListener = (
  handler: (event: Event) => void,
  wait: number = 250
): (() => void) => {
  const debouncedHandler = debounce(handler, wait);
  
  window.addEventListener('resize', debouncedHandler, { passive: true });
  
  return () => {
    window.removeEventListener('resize', debouncedHandler);
    debouncedHandler.cancel();
  };
};

/**
 * 입력 이벤트에 디바운스 적용
 */
export const addDebouncedInputListener = (
  element: HTMLInputElement | HTMLTextAreaElement,
  handler: (event: Event) => void,
  wait: number = 300
): (() => void) => {
  const debouncedHandler = debounce(handler, wait);
  
  element.addEventListener('input', debouncedHandler);
  
  return () => {
    element.removeEventListener('input', debouncedHandler);
    debouncedHandler.cancel();
  };
};

/**
 * 디바운스 매니저 클래스
 */
export class DebounceManager {
  private debouncedFunctions = new Map<string, DebouncedFunction<any>>();

  /**
   * 디바운스 함수 추가
   */
  add<T extends (...args: any[]) => any>(
    key: string,
    func: T,
    wait: number = 300,
    options: DebounceOptions = {}
  ): void {
    const existingFunc = this.debouncedFunctions.get(key);
    if (existingFunc) {
      existingFunc.cancel();
    }
    this.debouncedFunctions.set(key, debounce(func, wait, options));
  }

  /**
   * 디바운스 함수 호출
   */
  call<T extends any[]>(key: string, ...args: T): any {
    const debouncedFunc = this.debouncedFunctions.get(key);
    if (!debouncedFunc) {
      throw new Error(`Debounced function with key "${key}" not found`);
    }
    return debouncedFunc(...args);
  }

  /**
   * 특정 디바운스 함수 취소
   */
  cancel(key: string): boolean {
    const debouncedFunc = this.debouncedFunctions.get(key);
    if (debouncedFunc) {
      debouncedFunc.cancel();
      return true;
    }
    return false;
  }

  /**
   * 모든 디바운스 함수 취소
   */
  cancelAll(): void {
    this.debouncedFunctions.forEach(debouncedFunc => debouncedFunc.cancel());
  }

  /**
   * 특정 디바운스 함수 즉시 실행
   */
  flush(key: string): any {
    const debouncedFunc = this.debouncedFunctions.get(key);
    if (debouncedFunc) {
      return debouncedFunc.flush();
    }
    return undefined;
  }

  /**
   * 모든 디바운스 함수 즉시 실행
   */
  flushAll(): any[] {
    const results: any[] = [];
    this.debouncedFunctions.forEach(debouncedFunc => {
      results.push(debouncedFunc.flush());
    });
    return results;
  }

  /**
   * 디바운스 함수 제거
   */
  remove(key: string): boolean {
    const debouncedFunc = this.debouncedFunctions.get(key);
    if (debouncedFunc) {
      debouncedFunc.cancel();
      this.debouncedFunctions.delete(key);
      return true;
    }
    return false;
  }

  /**
   * 모든 디바운스 함수 제거
   */
  clear(): void {
    this.cancelAll();
    this.debouncedFunctions.clear();
  }

  /**
   * 등록된 키 목록 반환
   */
  keys(): string[] {
    return Array.from(this.debouncedFunctions.keys());
  }

  /**
   * 등록된 함수 개수 반환
   */
  size(): number {
    return this.debouncedFunctions.size;
  }

  /**
   * 특정 키가 존재하는지 확인
   */
  has(key: string): boolean {
    return this.debouncedFunctions.has(key);
  }

  /**
   * 특정 디바운스 함수가 대기 중인지 확인
   */
  pending(key: string): boolean {
    const debouncedFunc = this.debouncedFunctions.get(key);
    return debouncedFunc ? debouncedFunc.pending() : false;
  }

  /**
   * 대기 중인 디바운스 함수가 있는지 확인
   */
  hasPending(): boolean {
    return Array.from(this.debouncedFunctions.values()).some(func => func.pending());
  }
}