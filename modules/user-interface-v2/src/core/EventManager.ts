import type { EventMap, EventListener } from '../types';

class EventManager {
  private static instance: EventManager;
  private eventListeners = new Map<string, Set<EventListener>>();
  private initialized = false;

  private constructor() {}

  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  initialize(): void {
    if (this.initialized) return;
    
    // 전역 이벤트 리스너 설정
    window.addEventListener('unload', () => this.cleanup());
    
    this.initialized = true;
  }

  on<K extends keyof EventMap>(type: K, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)?.add(listener);
  }

  off<K extends keyof EventMap>(type: K, listener: EventListener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  emit<K extends keyof EventMap>(type: K, data: any): void {
    this.eventListeners.get(type)?.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${type}:`, error);
      }
    });
  }

  cleanup(): void {
    this.eventListeners.clear();
  }
}

export const eventManager = EventManager.getInstance(); 