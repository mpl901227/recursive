// ============================================
// 강화된 리사이즈 시스템 - RightSidebar용
// ============================================

import { eventManager } from '../../core/EventManager.js';
import { ComponentFactory } from '../../utils/component-factory.js';

export interface ResizeConfig {
  minWidth: number;
  maxWidth: number;
  step: number;
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
    const deltaX = this.state.startX - clientX; // 오른쪽에서 왼쪽으로
    let newWidth = this.state.startWidth + deltaX;

    // 범위 제한
    newWidth = Math.max(this.config.minWidth, Math.min(this.config.maxWidth, newWidth));

    // 스냅 포인트 체크
    if (this.config.enableSnapping && this.config.snapPoints) {
      const snapThreshold = 15; // 15px 임계값
      for (const snapPoint of this.config.snapPoints) {
        if (Math.abs(newWidth - snapPoint) < snapThreshold) {
          newWidth = snapPoint;
          this.state.snapToPoint = snapPoint;
          this.highlightSnapIndicator(snapPoint);
          break;
        } else {
          this.state.snapToPoint = undefined;
          this.clearSnapHighlight();
        }
      }
    }

    this.updateWidth(newWidth, false);
  }

  private handleMouseUp(): void {
    if (!this.state.isResizing) return;
    this.endResize();
  }

  private handleTouchEnd(): void {
    if (!this.state.isResizing) return;
    this.endResize();
  }

  private endResize(): void {
    this.state.isResizing = false;
    this.state.isKeyboardResize = false;

    // 시각적 피드백 제거
    this.handle.classList.remove('resizing');
    document.body.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 스냅 인디케이터 숨김
    this.hideSnapIndicators();

    // 미리보기 라인 숨김
    if (this.previewLine) {
      this.previewLine.style.display = 'none';
    }

    // 최종 크기 적용
    this.applyFinalSize();

    // 이벤트 발생
    eventManager.emit('resize:end' as any, {
      finalWidth: this.state.currentWidth,
      snapPoint: this.state.snapToPoint
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    let handled = false;
    let newWidth = this.state.currentWidth;

    switch (event.key) {
      case 'ArrowLeft':
        newWidth = Math.max(this.config.minWidth, newWidth - this.config.step);
        handled = true;
        break;
      case 'ArrowRight':
        newWidth = Math.min(this.config.maxWidth, newWidth + this.config.step);
        handled = true;
        break;
      case 'Home':
        newWidth = this.config.minWidth;
        handled = true;
        break;
      case 'End':
        newWidth = this.config.maxWidth;
        handled = true;
        break;
      case 'PageUp':
        newWidth = Math.max(this.config.minWidth, newWidth - this.config.step * 5);
        handled = true;
        break;
      case 'PageDown':
        newWidth = Math.min(this.config.maxWidth, newWidth + this.config.step * 5);
        handled = true;
        break;
      case 'Enter':
      case ' ':
        this.handleDoubleClick();
        handled = true;
        break;
    }

    if (handled) {
      event.preventDefault();
      this.updateWidth(newWidth, true);
      this.applyFinalSize();
    }
  }

  private handleDoubleClick(): void {
    // 자동 크기 조정 (콘텐츠에 맞춤)
    const optimalWidth = this.calculateOptimalWidth();
    this.animateToWidth(optimalWidth);
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
    // 윈도우 크기 변경 시 최대 너비 조정
    const maxPossibleWidth = window.innerWidth * 0.6; // 화면의 60%까지
    if (this.state.currentWidth > maxPossibleWidth) {
      this.updateWidth(maxPossibleWidth, true);
      this.applyFinalSize();
    }
  }

  private updateWidth(width: number, smooth: boolean): void {
    this.state.currentWidth = width;

    if (smooth && this.config.smoothResize) {
      this.element.style.transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      this.element.style.transition = '';
    }

    this.element.style.width = `${width}px`;

    // ARIA 값 업데이트
    this.handle.setAttribute('aria-valuenow', width.toString());

    // 툴팁 업데이트
    this.updateTooltip(width);

    // 미리보기 라인 업데이트
    if (this.previewLine && this.state.isResizing) {
      this.updatePreviewLine(width);
    }

    // 콜백 호출
    if (this.onResizeCallback) {
      this.onResizeCallback(width);
    }

    // 이벤트 발생
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.animationFrame = requestAnimationFrame(() => {
      eventManager.emit('resize:change' as any, { width });
    });
  }

  private applyFinalSize(): void {
    this.element.style.transition = '';
    
    // 저장된 크기 업데이트 (localStorage 등)
    try {
      localStorage.setItem('rightsidebar-width', this.state.currentWidth.toString());
    } catch (error) {
      console.warn('Failed to save sidebar width:', error);
    }
  }

  private animateToWidth(targetWidth: number): void {
    const startWidth = this.state.currentWidth;
    const duration = 300; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out 애니메이션
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentWidth = startWidth + (targetWidth - startWidth) * easeProgress;
      
      this.updateWidth(currentWidth, false);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.applyFinalSize();
      }
    };

    requestAnimationFrame(animate);
  }

  private calculateOptimalWidth(): number {
    const content = this.element.querySelector('.rightsidebar__content');
    if (!content) return this.config.minWidth;

    // 콘텐츠의 최적 너비 계산
    const scrollWidth = content.scrollWidth;
    const padding = 32; // 패딩 고려
    const optimalWidth = Math.min(
      Math.max(scrollWidth + padding, this.config.minWidth),
      this.config.maxWidth
    );

    // 스냅 포인트에 맞춤
    if (this.config.enableSnapping && this.config.snapPoints) {
      const closestSnap = this.config.snapPoints.reduce((prev, curr) => 
        Math.abs(curr - optimalWidth) < Math.abs(prev - optimalWidth) ? curr : prev
      );
      return closestSnap;
    }

    return optimalWidth;
  }

  private showSnapIndicators(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.classList.add('visible');
    });
  }

  private hideSnapIndicators(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.classList.remove('visible', 'highlighted');
    });
  }

  private highlightSnapIndicator(snapPoint: number): void {
    this.snapIndicators.forEach(indicator => {
      if (indicator.style.right === `${snapPoint}px`) {
        indicator.classList.add('highlighted');
      } else {
        indicator.classList.remove('highlighted');
      }
    });
  }

  private clearSnapHighlight(): void {
    this.snapIndicators.forEach(indicator => {
      indicator.classList.remove('highlighted');
    });
  }

  private updatePreviewLine(width: number): void {
    if (!this.previewLine) return;

    const rect = this.element.getBoundingClientRect();
    this.previewLine.style.left = `${rect.right - width}px`;
    this.previewLine.style.top = `${rect.top}px`;
    this.previewLine.style.height = `${rect.height}px`;
  }

  private showTooltip(): void {
    const tooltip = this.handle.querySelector('.resize-tooltip');
    if (tooltip) {
      tooltip.classList.add('visible');
    }
  }

  private hideTooltip(): void {
    const tooltip = this.handle.querySelector('.resize-tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  private updateTooltip(width: number): void {
    const tooltipText = this.handle.querySelector('.tooltip-text');
    if (tooltipText) {
      tooltipText.textContent = `${Math.round(width)}px`;
    }
  }

  // ============================================================================
  // 🎯 Public API
  // ============================================================================

  public setWidth(width: number, animate: boolean = true): void {
    width = Math.max(this.config.minWidth, Math.min(this.config.maxWidth, width));
    
    if (animate) {
      this.animateToWidth(width);
    } else {
      this.updateWidth(width, false);
      this.applyFinalSize();
    }
  }

  public getWidth(): number {
    return this.state.currentWidth;
  }

  public resetToDefault(): void {
    this.animateToWidth(this.config.minWidth);
  }

  public fitToContent(): void {
    const optimalWidth = this.calculateOptimalWidth();
    this.animateToWidth(optimalWidth);
  }

  public onResize(callback: (width: number) => void): void {
    this.onResizeCallback = callback;
  }

  public updateConfig(newConfig: Partial<ResizeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // ARIA 값 업데이트
    this.handle.setAttribute('aria-valuemin', this.config.minWidth.toString());
    this.handle.setAttribute('aria-valuemax', this.config.maxWidth.toString());
  }

  public enable(): void {
    this.handle.style.display = 'flex';
    this.handle.setAttribute('tabindex', '0');
  }

  public disable(): void {
    this.handle.style.display = 'none';
    this.handle.setAttribute('tabindex', '-1');
  }

  public destroy(): void {
    // 이벤트 리스너 정리
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    document.removeEventListener('touchmove', this.handleTouchMove.bind(this));
    document.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    window.removeEventListener('resize', this.handleWindowResize.bind(this));

    // DOM 요소 정리
    if (this.previewLine) {
      this.previewLine.remove();
    }

    this.snapIndicators.forEach(indicator => indicator.remove());
    this.snapIndicators = [];

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}
