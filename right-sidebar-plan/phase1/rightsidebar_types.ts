// ============================================
// RightSidebar V2 - 타입 정의
// ============================================

export interface RightSidebarConfig {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  defaultApp?: string;
  position?: 'right' | 'left';
}

export interface AppInfo {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  category?: string;
  render: () => HTMLElement | Promise<HTMLElement>;
}

export interface AppState {
  id: string;
  active: boolean;
  element: HTMLElement | null;
  lastAccessed: number;
}
