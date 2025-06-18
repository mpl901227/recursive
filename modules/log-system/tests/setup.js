// Jest 테스트 설정 파일
// 메모리 누수 방지와 전역 정리를 담당

// 전역 타임아웃 설정
jest.setTimeout(30000);

// 각 테스트 후 전역 정리
afterEach(() => {
  // 모든 타이머 정리
  jest.clearAllTimers();
  
  // 모든 mock 정리
  jest.clearAllMocks();
  
  // 전역 EventBus 정리
  if (global.mockEventBus) {
    try {
      global.mockEventBus.removeAllListeners();
      delete global.mockEventBus;
    } catch (error) {
      // 무시
    }
  }
  
  // Node.js 이벤트 루프 정리
  if (process.listenerCount('uncaughtException') > 0) {
    process.removeAllListeners('uncaughtException');
  }
  
  if (process.listenerCount('unhandledRejection') > 0) {
    process.removeAllListeners('unhandledRejection');
  }
});

// 모든 테스트 완료 후 정리
afterAll(() => {
  // 강제 가비지 컬렉션 (가능한 경우)
  if (global.gc) {
    global.gc();
  }
  
  // 프로세스 정리
  if (process.env.NODE_ENV === 'test') {
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }
});

// 처리되지 않은 예외 처리
process.on('uncaughtException', (error) => {
  console.warn('Uncaught Exception in test:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection in test:', reason);
}); 