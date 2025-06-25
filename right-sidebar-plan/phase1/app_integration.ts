// ============================================
// App.ts에 RightSidebar 통합
// 기존 App.ts 파일에 추가할 내용
// ============================================

// import 섹션에 추가
import { RightSidebar } from './components/layout/RightSidebar/RightSidebar.js';

export class App {
  // 기존 속성들...
  private rightSidebar!: RightSidebar;

  private async initializeComponents(): Promise<void> {
    try {
      // ... 기존 컴포넌트들

      // RightSidebar 초기화
      this.rightSidebar = new RightSidebar('#rightSidebar', {
        initialWidth: 320,
        minWidth: 280,
        maxWidth: 600,
        resizable: true
      });

      // 컴포넌트 초기화
      await Promise.all([
        // ... 기존 초기화들
        this.rightSidebar.initialize()
      ]);

      console.log('✅ 모든 컴포넌트 초기화 완료 (RightSidebar 포함)');
    } catch (error) {
      console.error('❌ 컴포넌트 초기화 실패:', error);
      throw error;
    }
  }

  public getComponents() {
    return {
      // ... 기존 컴포넌트들
      rightSidebar: this.rightSidebar
    };
  }

  public async destroy(): Promise<void> {
    try {
      // ... 기존 정리 작업들
      if (this.rightSidebar) {
        this.rightSidebar.destroy();
      }
    } catch (error) {
      console.error('앱 종료 중 오류:', error);
    }
  }

  // 키보드 단축키 추가 (setupEventListeners 메서드에 추가)
  private setupGlobalKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Ctrl+B로 RightSidebar 토글
      if (event.ctrlKey && event.key === 'b') {
        event.preventDefault();
        this.rightSidebar.toggle();
      }
      
      // Escape로 RightSidebar 닫기
      if (event.key === 'Escape' && this.rightSidebar) {
        this.rightSidebar.hide();
      }
    });
  }
}