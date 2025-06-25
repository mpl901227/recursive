import { eventManager } from '../../../core/EventManager.js';

export interface ResizeConfig {
  minWidth: number;
  maxWidth: number;
  step?: number;
  snapPoints?: number[];
  smoothResize?: boolean;
  showPreview?: boolean;
  enableSnapping?: boolean;
}

export interface ResizeState {
  isResizing: boolean;
  startX: number;
  startWidth: number;
  currentWidth: number;
  isKeyboardResize: boolean;
  snapToPoint?: number;
}

export class EnhancedResizeSystem {
  private element: HTMLElement;
  private config: ResizeConfig;
  private state: ResizeState;
  private handle: HTMLElement;
  private previewLine: HTMLElement | null = null;
  private snapIndicators: HTMLElement[] = [];
  private animationFrame: number | null = null;
  private onResizeCallback?: (width: number) => void;

  constructor(element: HTMLElement, config: ResizeConfig) {
    this.element = element;
    this.config = {
      step: 10,
      smoothResize: true,
      showPreview: true,
      enableSnapping: true,
      snapPoints: [280, 320, 400, 500],
      ...config
    };

    this.state = {
      isResizing: false,
      startX: 0,
      startWidth: 0,
      currentWidth: config.minWidth,
      isKeyboardResize: false
    };

    this.handle = this.createResizeHandle();
    this.element.appendChild(this.handle);
    
    this.setupEventListeners();
    this.createSnapIndicators();
    
    if (this.config.showPreview) {
      this.createPreviewLine();
    }
  }

  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'enhanced-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Resize sidebar');
    handle.setAttribute('aria-valuemin', this.config.minWidth.toString());
    handle.setAttribute('aria-valuemax', this.config.maxWidth.toString());
    handle.setAttribute('aria-valuenow', this.state.currentWidth.toString());

    handle.innerHTML = `
      <div class="resize-grip">
        <div class="grip-line"></div>
        <div class="grip-line"></div>
        <div class="grip-line"></div>
      </div>
      <div class="resize-tooltip" id="resize-tooltip">
        <span class="tooltip-text">${this.state.currentWidth}px</span>
        <div class="tooltip-shortcuts">
          <div>← → Arrow keys to resize</div>
          <div>Double-click to auto-fit</div>
        </div>
      </div>
    `;

    return handle;
  }

  private createPreviewLine(): void {
    this.previewLine = document.createElement('div');
    this.previewLine.className = 'resize-preview-line';
    this.previewLine.style.display = 'none';
    document.body.appendChild(this.previewLine);
  }

  private createSnapIndicators(): void {
    if (!this.config.snapPoints || !this.config.enableSnapping) return;

    this.config.snapPoints.forEach(snapPoint => {
      const indicator = document.createElement('div');
      indicator.className = 'snap-indicator';
      indicator.style.right = `${snapPoint}px`;
      indicator.innerHTML = `<span class="snap-label">${snapPoint}px</span>`;
      document.body.appendChild(indicator);
      this.snapIndicators.push(indicator);
    });
  }

  private setupEventListeners(): void {
    // 마우스 이벤트
    this.handle.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.handle.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // 키보드 이벤트
    this.handle.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.handle.addEventListener('focus', this.handleFocus.bind(this));
    this.handle.addEventListener('blur', this.handleBlur.bind(this));

    // 터치 이벤트 (모바일 지원)
    this.handle.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });

    // 전역 이벤트
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // 윈도우 리사이즈 이벤트
    window.addEventListener('resize', this.handleWindowResize.bind(this));
  }

  private handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startResize(event.clientX, false);
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    this.startResize(touch.clientX, false);
  }

  private startResize(clientX: number, isKeyboard: boolean): void {
    this.state.isResizing = true;
    this.state.startX = clientX;
    this.state.startWidth = this.state.currentWidth;
    this.state.isKeyboardResize = isKeyboard;

    // 시각적 피드백
    this.handle.classList.add('resizing');
    document.body.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    // 스냅 인디케이터 표시
    if (this.config.enableSnapping) {
      this.showSnapIndicators();
    }

    // 미리보기 라인 표시
    if (this.previewLine) {
      this.previewLine.style.display = 'block';
      this.updatePreviewLine(this.state.currentWidth);
    }

    // 이벤트 발생
    eventManager.emit('resize:start' as any, {
      startWidth: this.state.startWidth,
      isKeyboard: isKeyboard
    });
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.state.isResizing || this.state.isKeyboardResize) return;
    this.performResize(event.clientX);
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.state.isResizing || this.state.isKeyboardResize) return;
    event.preventDefault();
    const touch = event.touches[0];
    this.performResize(touch.clientX);
  }

  private performResize(clientX: number): void {
    const deltaX = this.state.startX - clientX;
    let newWidth = this.state.startWidth + deltaX;

    // 범위 제한
    newWidth = Math.max(this.config.minWidth, Math.min(this.config.maxWidth, newWidth));

    // 스냅 기능
    if (this.config.enableSnapping && this.config.snapPoints) {
      const snapPoint = this.findNearestSnapPoint(newWidth);
      if (snapPoint !== null) {
        newWidth = snapPoint;
        this.highlightSnapIndicator(snapPoint);
      } else {
        this.clearSnapHighlight();
      }
    }

    this.updateWidth(newWidth, false);
  }

  private findNearestSnapPoint(width: number): number | null {
    if (!this.config.snapPoints) return null;

    const snapThreshold = 10;
    let nearestPoint = null;
    let minDistance = snapThreshold;

    for (const point of this.config.snapPoints) {
      const distance = Math.abs(width - point);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  private handleMouseUp(): void {
    this.endResize();
  }

  private handleTouchEnd(): void {
    this.endResize();
  }

  private endResize(): void {
    if (!this.state.isResizing) return;

    this.state.isResizing = false;
    this.handle.classList.remove('resizing');
    document.body.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 스냅 인디케이터 숨기기
    if (this.config.enableSnapping) {
      this.hideSnapIndicators();
    }

    // 미리보기 라인 숨기기
    if (this.previewLine) {
      this.previewLine.style.display = 'none';
    }

    // 최종 크기 적용
    this.applyFinalSize();

    // 이벤트 발생
    eventManager.emit('resize:end' as any, {
      finalWidth: this.state.currentWidth
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let newWidth = this.state.currentWidth;
    const step = event.shiftKey ? this.config.step! * 5 : this.config.step!;

    switch (event.key) {
      case 'ArrowLeft':
        newWidth -= step;
        break;
      case 'ArrowRight':
        newWidth += step;
        break;
      case 'Home':
        newWidth = this.config.minWidth;
        break;
      case 'End':
        newWidth = this.config.maxWidth;
        break;
      case 'PageUp':
        newWidth += step * 5;
        break;
      case 'PageDown':
        newWidth -= step * 5;
        break;
    }

    this.updateWidth(newWidth, true);
  }

  private handleDoubleClick(): void {
    const optimalWidth = this.calculateOptimalWidth();
    this.animateToWidth(optimalWidth);
  }

  private calculateOptimalWidth(): number {
    // 콘텐츠 기반 최적 너비 계산
    const contentWidth = this.element.scrollWidth;
    const optimalWidth = Math.max(
      this.config.minWidth,
      Math.min(this.config.maxWidth, contentWidth)
    );

    return optimalWidth;
  }

  private updateWidth(width: number, smooth: boolean = false): void {
    const newWidth = Math.max(
      this.config.minWidth,
      Math.min(this.config.maxWidth, width)
    );

    if (smooth && this.config.smoothResize) {
      this.animateToWidth(newWidth);
    } else {
      this.element.style.width = `${newWidth}px`;
      this.state.currentWidth = newWidth;
      this.handle.setAttribute('aria-valuenow', newWidth.toString());

      if (this.previewLine) {
        this.updatePreviewLine(newWidth);
      }

      if (this.onResizeCallback) {
        this.onResizeCallback(newWidth);
      }
    }
  }

  private animateToWidth(targetWidth: number): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    const startWidth = this.state.currentWidth;
    const startTime = performance.now();
    const duration = 300;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this.easeInOutCubic(progress);
      const currentWidth = startWidth + (targetWidth - startWidth) * eased;

      this.updateWidth(currentWidth, false);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private updatePreviewLine(width: number): void {
    if (!this.previewLine) return;
    this.previewLine.style.right = `${width}px`;
  }

  private showSnapIndicators(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.style.opacity = '1';
    });
  }

  private hideSnapIndicators(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.style.opacity = '0';
    });
  }

  private highlightSnapIndicator(snapPoint: number): void {
    this.snapIndicators.forEach(indicator => {
      if (parseInt(indicator.style.right) === snapPoint) {
        indicator.classList.add('active');
      } else {
        indicator.classList.remove('active');
      }
    });
  }

  private clearSnapHighlight(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.classList.remove('active');
    });
  }

  public onResize(callback: (width: number) => void): void {
    this.onResizeCallback = callback;
  }

  public destroy(): void {
    // 이벤트 리스너 제거
    this.handle.remove();
    this.previewLine?.remove();
    this.snapIndicators.forEach(indicator => indicator.remove());

    // 애니메이션 프레임 취소
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private handleFocus(): void {
    this.handle.classList.add('focused');
    this.showTooltip();
  }

  private handleBlur(): void {
    this.handle.classList.remove('focused');
    this.hideTooltip();
  }

  private handleWindowResize(): void {
    // 윈도우 리사이즈 시 사이드바 크기 조정
    if (this.state.currentWidth > this.config.maxWidth) {
      this.updateWidth(this.config.maxWidth, true);
    }
  }

  private applyFinalSize(): void {
    // 최종 크기 적용 (스냅 포인트 고려)
    if (this.config.enableSnapping && this.config.snapPoints) {
      const snapPoint = this.findNearestSnapPoint(this.state.currentWidth);
      if (snapPoint !== null) {
        this.updateWidth(snapPoint, true);
      }
    }
  }

  private showTooltip(): void {
    const tooltip = this.handle.querySelector('#resize-tooltip');
    if (tooltip) {
      (tooltip as HTMLElement).style.opacity = '1';
    }
  }

  private hideTooltip(): void {
    const tooltip = this.handle.querySelector('#resize-tooltip');
    if (tooltip) {
      (tooltip as HTMLElement).style.opacity = '0';
    }
  }
} 