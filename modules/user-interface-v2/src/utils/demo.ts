// ========================================
// Demo - Phase 1 & 2 기능 테스트 데모
// ========================================

import { toast } from './toast';
import { reportError } from './error-handler';
import { createButton } from './button';
import { showGlobalLoader, hideGlobalLoader } from './loader';
import { setItem, getItem, removeItem } from './storage';

export function initializeDemo(): void {
  console.log('🚀 Phase 1 & 2 데모 초기화 중...');

  // 데모 기능 테스트 함수들
  setupToastDemo();
  setupErrorDemo();
  setupButtonDemo();
  setupLoaderDemo();
  setupStorageDemo();

  console.log('✅ 데모 초기화 완료!');
}

function setupToastDemo(): void {
  // 전역에서 사용할 수 있도록 window 객체에 추가
  (window as any).testToast = {
    info: () => toast.info('정보 메시지입니다!'),
    success: () => toast.success('성공적으로 완료되었습니다!'),
    warning: () => toast.warning('주의가 필요한 작업입니다.'),
    error: () => toast.error('오류가 발생했습니다!'),
    custom: () => toast.show('사용자 정의 메시지', { 
      duration: 6000, 
      closable: true 
    })
  };
}

function setupErrorDemo(): void {
  (window as any).testError = {
    javascript: () => {
      // 의도적으로 에러 발생
      throw new Error('테스트용 JavaScript 에러');
    },
    promise: () => {
      // Promise rejection 에러
      Promise.reject(new Error('테스트용 Promise 에러'));
    },
    manual: () => {
      reportError('수동으로 발생시킨 에러', { 
        context: 'demo_test',
        userId: 'demo_user'
      });
    },
    network: () => {
      // 네트워크 에러 시뮬레이션
      fetch('/api/non-existent-endpoint')
        .catch(error => reportError(error, { type: 'network_test' }));
    }
  };
}

function setupButtonDemo(): void {
  // 동적으로 버튼 생성 예제
  (window as any).createDemoButton = (container: string) => {
    const containerEl = document.querySelector(container);
    if (!containerEl) return;

    const buttonEl = document.createElement('button');
    buttonEl.textContent = '데모 버튼';
    containerEl.appendChild(buttonEl);

    const button = createButton(buttonEl, {
      variant: 'primary',
      size: 'md',
      onClick: async () => {
        await button.executeWithLoading(async () => {
          // 2초 대기 시뮬레이션
          await new Promise(resolve => setTimeout(resolve, 2000));
          toast.success('버튼 작업 완료!');
        }, '처리 중...');
      }
    });

    return button;
  };
}

function setupLoaderDemo(): void {
  (window as any).testLoader = {
    show: (message?: string) => {
      showGlobalLoader(message || '로딩 중...');
      // 3초 후 자동 숨김
      setTimeout(() => hideGlobalLoader(), 3000);
    },
    hide: () => hideGlobalLoader(),
    withProgress: async () => {
      const messages = [
        '초기화 중...',
        '데이터 로딩 중...',
        '컴포넌트 렌더링 중...',
        '완료!'
      ];

      for (let i = 0; i < messages.length; i++) {
        showGlobalLoader(messages[i]);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      hideGlobalLoader();
      toast.success('로딩 시퀀스 완료!');
    }
  };
}

function setupStorageDemo(): void {
  (window as any).testStorage = {
    save: () => {
      const data = {
        name: 'Recursive V2',
        version: '1.0.0',
        features: ['toast', 'error-handler', 'button', 'loader', 'storage'],
        timestamp: new Date().toISOString()
      };
      
      const success = setItem('demo_data', data);
      if (success) {
        toast.success('데이터가 저장되었습니다!');
      } else {
        toast.error('데이터 저장에 실패했습니다.');
      }
    },
    load: () => {
      const data = getItem('demo_data');
      if (data) {
        console.log('로드된 데이터:', data);
        toast.info('데이터를 로드했습니다. 콘솔을 확인하세요.');
      } else {
        toast.warning('저장된 데이터가 없습니다.');
      }
    },
    clear: () => {
      const success = removeItem('demo_data');
      if (success) {
        toast.success('데이터가 삭제되었습니다!');
      } else {
        toast.error('데이터 삭제에 실패했습니다.');
      }
    },
    tempSave: () => {
      // 5초 후 만료되는 데이터
      const success = setItem('temp_data', '임시 데이터', { expires: 5000 });
      if (success) {
        toast.info('5초 후 만료되는 임시 데이터를 저장했습니다.');
      }
    }
  };
}

// 키보드 단축키 설정
export function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (event) => {
    // Ctrl + Shift + 조합
    if (event.ctrlKey && event.shiftKey) {
      switch (event.key) {
        case 'T':
          event.preventDefault();
          toast.info('단축키로 토스트 표시!');
          break;
        case 'E':
          event.preventDefault();
          reportError('단축키로 발생시킨 에러');
          break;
        case 'L':
          event.preventDefault();
          (window as any).testLoader.show('단축키로 로더 표시');
          break;
        case 'S':
          event.preventDefault();
          (window as any).testStorage.save();
          break;
      }
    }
  });

  console.log('키보드 단축키 활성화:');
  console.log('- Ctrl + Shift + T: 토스트 표시');
  console.log('- Ctrl + Shift + E: 에러 발생');
  console.log('- Ctrl + Shift + L: 로더 표시');
  console.log('- Ctrl + Shift + S: 데이터 저장');
}

// 콘솔에서 사용할 수 있는 도움말 함수
export function showHelp(): void {
  console.log(`
🚀 Recursive V2 - Phase 1 & 2 기능 테스트

📱 Toast 알림:
  - testToast.info()     // 정보 토스트
  - testToast.success()  // 성공 토스트
  - testToast.warning()  // 경고 토스트
  - testToast.error()    // 에러 토스트
  - testToast.custom()   // 사용자 정의 토스트

❌ 에러 핸들링:
  - testError.javascript() // JS 에러 발생
  - testError.promise()    // Promise 에러
  - testError.manual()     // 수동 에러 보고
  - testError.network()    // 네트워크 에러

🔲 버튼:
  - createDemoButton('#container') // 동적 버튼 생성

⏳ 로더:
  - testLoader.show()         // 로더 표시
  - testLoader.hide()         // 로더 숨김
  - testLoader.withProgress() // 진행 상황 시뮬레이션

💾 스토리지:
  - testStorage.save()     // 데이터 저장
  - testStorage.load()     // 데이터 로드
  - testStorage.clear()    // 데이터 삭제
  - testStorage.tempSave() // 임시 데이터 저장

⌨️ 키보드 단축키:
  - Ctrl + Shift + T: 토스트 표시
  - Ctrl + Shift + E: 에러 발생
  - Ctrl + Shift + L: 로더 표시
  - Ctrl + Shift + S: 데이터 저장
  `);
}

// 전역에서 도움말 접근 가능
(window as any).showHelp = showHelp; 