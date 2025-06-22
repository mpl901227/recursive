import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import { ComponentProps } from '../../../types/index.js';

export interface ResizeHandlerProps extends ComponentProps {
  minWidth?: number;
  maxWidth?: number;
  currentWidth?: number;
  widthIndicator?: HTMLElement | null;
  snapThreshold?: number;
  snapToSize?: number[];
}

export class ResizeHandler extends BaseComponent<HTMLElement, ResizeHandlerProps> {
  private isResizing = false;
  private startX = 0;
  private startWidth = 0;
  private currentWidth = 0;
  private widthIndicator: HTMLElement | null = null;

  constructor(
    element: HTMLElement | string,
    props: ResizeHandlerProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: ResizeHandlerProps = {
      minWidth: 240,
      maxWidth: 500,
      currentWidth: 280,
      snapThreshold: 20,
      snapToSize: [240, 280, 320, 360, 400],
      ...props
    };

    super(element, defaultProps, eventManager);
    this.currentWidth = this.props.currentWidth || 280;
    this.widthIndicator = this.props.widthIndicator || null;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.setupEventListeners();
    this.setupResizeHandle();
    console.debug('ResizeHandler component initialized');
  }

  render(): void {
    // The element is already the resize handle, so we just need to style it
    this.element.className = 'resize-handle';
    this.element.setAttribute('aria-label', 'Resize sidebar');
    this.element.setAttribute('role', 'separator');
    this.element.setAttribute('aria-orientation', 'vertical');
  }

  private setupResizeHandle(): void {
    this.element.style.cursor = 'col-resize';
    this.element.style.width = '4px';
    this.element.style.position = 'absolute';
    this.element.style.right = '0';
    this.element.style.top = '0';
    this.element.style.bottom = '0';
    this.element.style.backgroundColor = 'transparent';
    this.element.style.zIndex = '10';
  }

  private setupEventListeners(): void {
    // Mouse events
    this.addDOMEventListener(this.element, 'mousedown', this.handleMouseDown.bind(this) as EventListener);
    this.addDOMEventListener(document, 'mousemove', this.handleMouseMove.bind(this) as EventListener);
    this.addDOMEventListener(document, 'mouseup', this.handleMouseUp.bind(this) as EventListener);

    // Touch events for mobile (with passive option for better performance)
    this.addDOMEventListener(this.element, 'touchstart', this.handleTouchStart.bind(this) as EventListener, { passive: false });
    this.addDOMEventListener(document, 'touchmove', this.handleTouchMove.bind(this) as EventListener, { passive: false });
    this.addDOMEventListener(document, 'touchend', this.handleTouchEnd.bind(this) as EventListener, { passive: false });

    // Keyboard events
    this.addDOMEventListener(this.element, 'keydown', this.handleKeyDown.bind(this) as EventListener);

    // Double-click to reset
    this.addDOMEventListener(this.element, 'dblclick', this.handleDoubleClick.bind(this) as EventListener);

    // Global resize events
    this.on('resize:set-width', this.handleSetWidth.bind(this));
    this.on('resize:reset', this.handleReset.bind(this));
  }

  private handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startResize(event.clientX);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    event.preventDefault();
    this.updateResize(event.clientX);
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.isResizing) return;
    event.preventDefault();
    this.endResize();
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    if (touch) {
      this.startResize(touch.clientX);
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.isResizing) return;
    event.preventDefault();
    const touch = event.touches[0];
    if (touch) {
      this.updateResize(touch.clientX);
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    if (!this.isResizing) return;
    event.preventDefault();
    this.endResize();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const step = 10;
    let newWidth = this.currentWidth;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        newWidth = Math.max(this.props.minWidth || 240, this.currentWidth - step);
        break;
        
      case 'ArrowRight':
        event.preventDefault();
        newWidth = Math.min(this.props.maxWidth || 500, this.currentWidth + step);
        break;
        
      case 'Home':
        event.preventDefault();
        newWidth = this.props.minWidth || 240;
        break;
        
      case 'End':
        event.preventDefault();
        newWidth = this.props.maxWidth || 500;
        break;
        
      case 'Enter':
      case ' ':
        event.preventDefault();
        newWidth = this.props.currentWidth || 280; // Reset to default
        break;
    }

    if (newWidth !== this.currentWidth) {
      this.setWidth(newWidth);
    }
  }

  private handleDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    const defaultWidth = this.props.currentWidth || 280;
    this.setWidth(defaultWidth);
  }

  private handleSetWidth(event: any): void {
    this.setWidth(event.width);
  }

  private handleReset(_event: any): void {
    const defaultWidth = this.props.currentWidth || 280;
    this.setWidth(defaultWidth);
  }

  private startResize(clientX: number): void {
    this.isResizing = true;
    this.startX = clientX;
    this.startWidth = this.currentWidth;
    
    // Add visual feedback
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    this.element.classList.add('resizing');
    
    // Show width indicator
    this.showWidthIndicator();
    
    this.emit('resizeStart', { width: this.currentWidth });
  }

  private updateResize(clientX: number): void {
    if (!this.isResizing) return;

    const deltaX = clientX - this.startX;
    let newWidth = this.startWidth + deltaX;

    // Apply constraints
    const minWidth = this.props.minWidth || 240;
    const maxWidth = this.props.maxWidth || 500;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    // Apply snapping
    newWidth = this.applySnapping(newWidth);

    if (newWidth !== this.currentWidth) {
      this.currentWidth = newWidth;
      this.updateWidthIndicator();
      this.emit('widthChanged', { width: this.currentWidth });
    }
  }

  private endResize(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    
    // Remove visual feedback
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.element.classList.remove('resizing');
    
    // Hide width indicator
    this.hideWidthIndicator();
    
    this.emit('resizeEnd', { width: this.currentWidth });
  }

  private applySnapping(width: number): number {
    const snapThreshold = this.props.snapThreshold || 20;
    const snapSizes = this.props.snapToSize || [240, 280, 320, 360, 400];

    for (const snapSize of snapSizes) {
      if (Math.abs(width - snapSize) <= snapThreshold) {
        return snapSize;
      }
    }

    return width;
  }

  private showWidthIndicator(): void {
    if (!this.widthIndicator) {
      this.createWidthIndicator();
    }

    if (this.widthIndicator) {
      this.widthIndicator.style.display = 'block';
      this.updateWidthIndicator();
    }
  }

  private hideWidthIndicator(): void {
    if (this.widthIndicator) {
      this.widthIndicator.style.display = 'none';
    }
  }

  private createWidthIndicator(): void {
    this.widthIndicator = document.createElement('div');
    this.widthIndicator.id = 'widthIndicator';
    this.widthIndicator.className = 'width-indicator';
    this.widthIndicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      z-index: 9999;
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(this.widthIndicator);
  }

  private updateWidthIndicator(): void {
    if (this.widthIndicator) {
      this.widthIndicator.textContent = `${Math.round(this.currentWidth)}px`;
    }
  }

  public setWidth(width: number): void {
    const minWidth = this.props.minWidth || 240;
    const maxWidth = this.props.maxWidth || 500;
    
    this.currentWidth = Math.max(minWidth, Math.min(maxWidth, width));
    this.emit('widthChanged', { width: this.currentWidth });
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public getMinWidth(): number {
    return this.props.minWidth || 240;
  }

  public getMaxWidth(): number {
    return this.props.maxWidth || 500;
  }

  public isCurrentlyResizing(): boolean {
    return this.isResizing;
  }

  public resetToDefault(): void {
    const defaultWidth = this.props.currentWidth || 280;
    this.setWidth(defaultWidth);
  }

  public setSnapSizes(sizes: number[]): void {
    this.props.snapToSize = sizes;
  }

  public getSnapSizes(): number[] {
    return this.props.snapToSize || [240, 280, 320, 360, 400];
  }

  async destroy(): Promise<void> {
    if (this.isResizing) {
      this.endResize();
    }

    // Clean up width indicator
    if (this.widthIndicator && this.widthIndicator.parentNode) {
      this.widthIndicator.parentNode.removeChild(this.widthIndicator);
    }

    console.debug('ResizeHandler component destroyed');
    await super.destroy();
  }
} 