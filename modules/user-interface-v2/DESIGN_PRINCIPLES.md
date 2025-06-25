# Recursive v2 - 디자인 원칙 및 컴포넌트 시스템

## 🎯 핵심 원칙

### 1. **최소화 원칙**
- 특별한 디자인은 최대한 만들지 않는다
- 모든 UI 요소는 표준화된 컴포넌트 팩토리를 사용한다
- 일관성 > 독창성

### 2. **표준화 원칙**
- 모든 컴포넌트는 `ComponentFactory`를 통해 생성
- 디자인 토큰(CSS 변수)만 사용
- BEM 방식의 클래스 네이밍 준수

### 3. **확장성 원칙**
- 새로운 변형이 필요하면 기존 컴포넌트에 variant 추가
- 새로운 컴포넌트 타입이 필요한 경우에만 팩토리에 추가
- 전역 설정 변경으로 전체 디자인 조정 가능

## 🎨 디자인 토큰

### 색상 시스템 (8개만)
```scss
--color-primary: #3b82f6;      // 주요 액션
--color-secondary: #64748b;    // 보조 요소
--color-success: #10b981;      // 성공 상태
--color-warning: #f59e0b;      // 경고 상태
--color-error: #ef4444;        // 에러 상태
--color-background: #ffffff;   // 배경색
--color-text: #1f2937;         // 텍스트
--color-border: #e5e7eb;       // 테두리
```

### 크기 시스템 (3단계만)
- `sm`: 작은 크기
- `md`: 기본 크기 (기본값)
- `lg`: 큰 크기

### 간격 시스템
```scss
--spacing-base: 1rem;          // 기본 간격
--radius-base: 0.5rem;         // 기본 모서리
```

## 🧱 컴포넌트 사용법

### 버튼 컴포넌트
```typescript
import { ComponentFactory } from '../utils/component-factory';

// 기본 버튼
const button = ComponentFactory.createButton({
  children: '클릭하세요',
  color: 'primary',
  size: 'md'
});

// 아이콘 버튼
const iconButton = ComponentFactory.createButton({
  children: '저장',
  color: 'success',
  icon: '💾',
  iconPosition: 'left'
});

// 로딩 버튼
const loadingButton = ComponentFactory.createButton({
  children: '처리중...',
  loading: true,
  disabled: true
});
```

### 카드 컴포넌트
```typescript
// 기본 카드
const card = ComponentFactory.createCard({
  header: '제목',
  children: '내용',
  footer: '푸터',
  variant: 'elevated'
});

// 심플 카드
const simpleCard = ComponentFactory.createCard({
  children: '내용만 있는 카드',
  padding: 'lg',
  variant: 'flat'
});
```

### 입력 필드
```typescript
// 라벨과 에러가 있는 입력
const input = ComponentFactory.createInput({
  label: '이메일',
  type: 'email',
  placeholder: 'email@example.com',
  required: true,
  error: '올바른 이메일을 입력하세요'
});
```

### 모달
```typescript
// 기본 모달
const modal = ComponentFactory.createModal({
  title: '확인',
  children: '정말 삭제하시겠습니까?',
  size: 'sm'
});

document.body.appendChild(modal);
```

### 알림
```typescript
// 성공 알림
const alert = ComponentFactory.createAlert('저장되었습니다', {
  color: 'success'
});

document.body.appendChild(alert);
```

## 📐 레이아웃 가이드라인

### 1. **컨테이너 구조**
```html
<div class="flex flex-col gap-4 p-4">
  <!-- 컴포넌트들 -->
</div>
```

### 2. **그리드 레이아웃**
```html
<div class="flex gap-4">
  <div class="flex-1">왼쪽 영역</div>
  <div class="flex-1">오른쪽 영역</div>
</div>
```

### 3. **카드 기반 섹션**
```typescript
const section = ComponentFactory.createCard({
  header: '섹션 제목',
  children: content,
  variant: 'elevated'
});
```

## 🚫 금지사항

### 1. **커스텀 스타일 작성 금지**
```scss
// ❌ 이런 식으로 하지 마세요
.my-custom-button {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  border-radius: 25px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}
```

### 2. **인라인 스타일 금지**
```html
<!-- ❌ 이런 식으로 하지 마세요 -->
<button style="background: red; padding: 20px;">버튼</button>
```

### 3. **하드코딩된 색상/크기 금지**
```scss
// ❌ 이런 식으로 하지 마세요
.element {
  color: #ff0000;
  padding: 15px;
  margin: 23px;
}

// ✅ 이렇게 하세요
.element {
  color: var(--color-error);
  padding: var(--spacing-base);
  margin: var(--spacing-base);
}
```

## ✅ 권장사항

### 1. **컴포넌트 팩토리 우선 사용**
```typescript
// ✅ 항상 팩토리를 먼저 고려
const element = ComponentFactory.createButton({...});

// ❌ 직접 HTML 생성 지양
const element = document.createElement('button');
```

### 2. **유틸리티 클래스 활용**
```html
<!-- ✅ 유틸리티 클래스 조합 -->
<div class="flex items-center gap-2 p-4 rounded shadow">
  <!-- 내용 -->
</div>
```

### 3. **의미있는 변형만 추가**
```typescript
// ✅ 의미있는 변형
variant: 'outline' | 'ghost' | 'elevated'

// ❌ 너무 구체적인 변형
variant: 'redButtonWithShadowAndGradient'
```

## 🔄 확장 가이드라인

### 새로운 변형 추가 시
1. **기존 컴포넌트에 추가 가능한지 먼저 확인**
2. **디자인 토큰으로 표현 가능한지 확인**
3. **재사용성이 있는지 확인**

### 새로운 컴포넌트 추가 시
1. **기존 컴포넌트 조합으로 불가능한지 확인**
2. **최소 3곳 이상에서 사용될지 확인**
3. **표준 인터페이스 패턴 준수**

## 📝 코딩 컨벤션

### TypeScript 인터페이스
```typescript
export interface ComponentConfig {
  variant?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  className?: string;
  attributes?: Record<string, string>;
  children?: string | HTMLElement | HTMLElement[];
}
```

### CSS 클래스 네이밍
```scss
// BEM 방식 준수
.component {}
.component--variant {}
.component__element {}
.component__element--modifier {}
```

### 파일 구조
```
src/
├── utils/
│   └── component-factory.ts    // 모든 컴포넌트 생성 로직
├── styles/
│   ├── variables.scss          // 디자인 토큰
│   ├── design-system.scss      // 컴포넌트 스타일
│   └── globals.scss            // 글로벌 스타일
└── components/
    └── [기존 컴포넌트들을 팩토리로 마이그레이션]
```

## 🎯 마이그레이션 전략

### 1단계: 기존 컴포넌트 식별
- 현재 사용 중인 모든 UI 요소 목록화
- 팩토리로 대체 가능한 요소 분류

### 2단계: 점진적 교체
- 새로운 기능부터 팩토리 사용
- 기존 컴포넌트는 리팩토링 시점에 교체

### 3단계: 스타일 정리
- 사용하지 않는 CSS 제거
- 커스텀 스타일을 디자인 토큰으로 변환

## 📊 성과 측정

### 코드 품질 지표
- 커스텀 CSS 라인 수 감소
- 컴포넌트 재사용률 증가
- 디자인 일관성 점수

### 개발 효율성
- 새 UI 요소 개발 시간 단축
- 디자인 변경 시 수정 범위 최소화
- 코드 리뷰 시간 단축

---

**기억하세요**: 이 시스템의 목표는 **일관성과 효율성**입니다. 특별한 디자인보다는 **표준화된 아름다움**을 추구합니다. 