// ============================================
// RightSidebar V2 - Type Definitions
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

// Event types
export type RightSidebarEventMap = {
  'rightsidebar:show': { appId?: string };
  'rightsidebar:hide': void;
  'rightsidebar:visibility:change': { visible: boolean };
  'rightsidebar:app:registered': { app: AppInfo };
  'rightsidebar:app:activated': { appId: string; element: HTMLElement };
  'rightsidebar:resize': { width: number };
}; 