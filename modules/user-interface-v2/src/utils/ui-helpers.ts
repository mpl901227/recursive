// UI 헬퍼 함수들
import { ComponentFactory } from './component-factory.ts';

// 시작하기 버튼 생성 함수
export function createStartButton() {
  return ComponentFactory.createButton({
    children: '시작하기',
    color: 'primary',
    size: 'lg',
    onClick: () => {
      location.reload();
    }
  });
}

// DOM이 로드된 후 버튼 추가
export function initializeWelcomeButton() {
  document.addEventListener('DOMContentLoaded', () => {
    const welcomeContainer = document.querySelector('.welcome-container');
    if (welcomeContainer) {
      const startButton = createStartButton();
      welcomeContainer.appendChild(startButton);
    }
  });
} 