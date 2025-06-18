#!/usr/bin/env python3
"""
AI Prompt Engineering Utilities
AI 어시스티드 코딩을 위한 프롬프트 최적화 및 관리 도구들

주요 기능:
- 코딩 작업별 최적화된 프롬프트 템플릿
- 동적 컨텍스트 인젝션
- 체인 오브 소트(Chain of Thought) 프롬프트 생성
- 프롬프트 성능 분석 및 최적화
- 다양한 AI 모델별 프롬프트 적응
- 사용자 맞춤형 프롬프트 생성
"""

import json
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Union, Callable, 
    Protocol, TypeVar, Generic, Tuple
)
import logging
import hashlib
from functools import lru_cache, wraps
from collections import defaultdict
import yaml

# 로깅 설정
logger = logging.getLogger(__name__)

# 타입 변수
T = TypeVar('T')


# 열거형 정의
class CodingTaskType(Enum):
    """코딩 작업 유형"""
    FUNCTION_GENERATION = "function_generation"
    CLASS_GENERATION = "class_generation"
    BUG_FIX = "bug_fix"
    CODE_REFACTORING = "code_refactoring"
    TEST_GENERATION = "test_generation"
    DOCUMENTATION = "documentation"
    CODE_REVIEW = "code_review"
    OPTIMIZATION = "optimization"
    API_INTEGRATION = "api_integration"
    DATABASE_QUERY = "database_query"
    ERROR_HANDLING = "error_handling"
    ALGORITHM_IMPLEMENTATION = "algorithm_implementation"


class PromptComplexity(Enum):
    """프롬프트 복잡도"""
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    EXPERT = "expert"


class AIModel(Enum):
    """지원하는 AI 모델"""
    GPT_4 = "gpt-4"
    GPT_3_5 = "gpt-3.5-turbo"
    CLAUDE_3_5 = "claude-3-5-sonnet"
    CLAUDE_3 = "claude-3-haiku"
    CODELLAMA = "codellama"
    CUSTOM = "custom"


class PromptStrategy(Enum):
    """프롬프트 전략"""
    DIRECT = "direct"
    CHAIN_OF_THOUGHT = "chain_of_thought"
    FEW_SHOT = "few_shot"
    ZERO_SHOT = "zero_shot"
    ROLE_PLAYING = "role_playing"
    STEP_BY_STEP = "step_by_step"
    SOCRATIC = "socratic"


# 데이터 클래스들
@dataclass
class CodeContext:
    """코드 컨텍스트 정보"""
    file_path: str
    language: str
    function_name: Optional[str] = None
    class_name: Optional[str] = None
    imports: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    existing_code: Optional[str] = None
    related_functions: List[str] = field(default_factory=list)
    project_structure: Dict[str, Any] = field(default_factory=dict)
    coding_style: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PromptTemplate:
    """프롬프트 템플릿"""
    name: str
    template: str
    variables: List[str]
    task_type: CodingTaskType
    complexity: PromptComplexity
    strategy: PromptStrategy
    model_compatibility: List[AIModel]
    metadata: Dict[str, Any] = field(default_factory=dict)
    performance_score: float = 0.0
    usage_count: int = 0
    success_rate: float = 0.0


@dataclass
class PromptResult:
    """프롬프트 실행 결과"""
    prompt: str
    response: Optional[str] = None
    success: bool = False
    execution_time: float = 0.0
    token_count: int = 0
    cost_estimate: float = 0.0
    quality_score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OptimizationSuggestion:
    """프롬프트 최적화 제안"""
    suggestion_type: str
    description: str
    expected_improvement: float
    confidence: float
    implementation: str


# 프로토콜 정의
class PromptOptimizer(Protocol):
    """프롬프트 최적화 프로토콜"""
    
    def optimize(self, prompt: str, context: Dict[str, Any]) -> str:
        """프롬프트 최적화"""
        ...
    
    def evaluate(self, prompt: str, result: PromptResult) -> float:
        """프롬프트 성능 평가"""
        ...


class PromptTemplateManager:
    """프롬프트 템플릿 관리자"""
    
    def __init__(self, template_dir: Optional[str] = None):
        self.template_dir = Path(template_dir) if template_dir else Path(__file__).parent / "prompt_templates"
        self.templates: Dict[str, PromptTemplate] = {}
        self.performance_history: Dict[str, List[PromptResult]] = defaultdict(list)
        self._load_builtin_templates()
        self._load_custom_templates()
    
    def _load_builtin_templates(self):
        """내장 템플릿 로드"""
        builtin_templates = {
            # 함수 생성 템플릿
            "function_generation_basic": PromptTemplate(
                name="function_generation_basic",
                template="""You are an expert Python developer. Create a function based on the following specification:

**Task**: {task_description}
**Function Name**: {function_name}
**Parameters**: {parameters}
**Return Type**: {return_type}
**Requirements**: {requirements}

**Context**:
{code_context}

**Coding Style Guidelines**:
{style_guidelines}

Please generate a complete, well-documented function that:
1. Follows Python best practices
2. Includes comprehensive docstring
3. Handles edge cases appropriately
4. Is production-ready and efficient

```python
# Your function implementation here
```""",
                variables=["task_description", "function_name", "parameters", "return_type", "requirements", "code_context", "style_guidelines"],
                task_type=CodingTaskType.FUNCTION_GENERATION,
                complexity=PromptComplexity.MODERATE,
                strategy=PromptStrategy.DIRECT,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5, AIModel.GPT_3_5]
            ),
            
            # 체인 오브 소트 함수 생성
            "function_generation_cot": PromptTemplate(
                name="function_generation_cot",
                template="""You are an expert Python developer. I need you to create a function using a step-by-step approach.

**Task**: {task_description}

Let's think through this step by step:

1. **Understanding the Problem**:
   - What exactly does this function need to do?
   - What are the inputs and expected outputs?
   - What edge cases should I consider?

2. **Planning the Implementation**:
   - What algorithm or approach should I use?
   - What data structures are most appropriate?
   - How can I make this efficient and readable?

3. **Implementation Strategy**:
   - Break down the problem into smaller steps
   - Consider error handling and validation
   - Think about testing scenarios

4. **Code Generation**:
   Based on the analysis above, generate the complete function.

**Context**:
{code_context}

**Requirements**:
{requirements}

Please work through each step and then provide the final implementation.""",
                variables=["task_description", "code_context", "requirements"],
                task_type=CodingTaskType.FUNCTION_GENERATION,
                complexity=PromptComplexity.COMPLEX,
                strategy=PromptStrategy.CHAIN_OF_THOUGHT,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5]
            ),
            
            # 버그 수정 템플릿
            "bug_fix_diagnosis": PromptTemplate(
                name="bug_fix_diagnosis",
                template="""You are a senior software engineer specializing in debugging. Help me fix this bug:

**Problematic Code**:
```{language}
{buggy_code}
```

**Error Message**:
{error_message}

**Expected Behavior**:
{expected_behavior}

**Actual Behavior**:
{actual_behavior}

**Context**:
{code_context}

Please follow this debugging process:

1. **Error Analysis**: What is the root cause of this error?
2. **Code Review**: Identify all issues in the code
3. **Solution Strategy**: Plan the fix approach
4. **Implementation**: Provide the corrected code
5. **Prevention**: Suggest how to prevent similar issues

Provide the fixed code with clear explanations of what was changed and why.""",
                variables=["language", "buggy_code", "error_message", "expected_behavior", "actual_behavior", "code_context"],
                task_type=CodingTaskType.BUG_FIX,
                complexity=PromptComplexity.COMPLEX,
                strategy=PromptStrategy.STEP_BY_STEP,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5, AIModel.GPT_3_5]
            ),
            
            # 코드 리뷰 템플릿
            "code_review_comprehensive": PromptTemplate(
                name="code_review_comprehensive",
                template="""You are a senior code reviewer at a top tech company. Please review this code:

**Code to Review**:
```{language}
{code_to_review}
```

**Review Criteria**:
{review_criteria}

**Project Context**:
{project_context}

Please provide a comprehensive code review covering:

## 🔍 Code Quality Analysis
- **Readability**: Is the code easy to understand?
- **Maintainability**: How easy would this be to modify?
- **Performance**: Are there any performance concerns?
- **Security**: Any security vulnerabilities?

## 📋 Specific Issues
List specific issues with line numbers and explanations.

## ✅ Strengths
What does this code do well?

## 🚀 Improvement Suggestions
Concrete suggestions for improvement.

## 📝 Refactored Code (if needed)
If significant changes are needed, provide refactored version.

Rate this code from 1-10 and explain your reasoning.""",
                variables=["language", "code_to_review", "review_criteria", "project_context"],
                task_type=CodingTaskType.CODE_REVIEW,
                complexity=PromptComplexity.EXPERT,
                strategy=PromptStrategy.ROLE_PLAYING,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5]
            ),
            
            # 테스트 생성 템플릿
            "test_generation_comprehensive": PromptTemplate(
                name="test_generation_comprehensive",
                template="""You are a test automation expert. Generate comprehensive tests for this function:

**Function to Test**:
```{language}
{function_code}
```

**Testing Framework**: {testing_framework}
**Coverage Requirements**: {coverage_requirements}

Please generate tests that cover:

1. **Happy Path Tests**: Normal expected usage
2. **Edge Case Tests**: Boundary conditions and edge cases
3. **Error Handling Tests**: Invalid inputs and error conditions
4. **Performance Tests**: If applicable
5. **Integration Tests**: If the function interacts with other components

**Test Structure**:
- Use descriptive test names
- Include setup and teardown if needed
- Add comments explaining complex test scenarios
- Ensure good test isolation

```{language}
# Your comprehensive test suite here
```

Also provide:
- Test coverage analysis
- Additional test scenarios to consider
- Testing best practices for this specific function""",
                variables=["language", "function_code", "testing_framework", "coverage_requirements"],
                task_type=CodingTaskType.TEST_GENERATION,
                complexity=PromptComplexity.COMPLEX,
                strategy=PromptStrategy.DIRECT,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5, AIModel.GPT_3_5]
            ),
            
            # 리팩토링 템플릿
            "refactoring_systematic": PromptTemplate(
                name="refactoring_systematic",
                template="""You are a refactoring expert. Help me improve this code systematically:

**Original Code**:
```{language}
{original_code}
```

**Refactoring Goals**: {refactoring_goals}
**Constraints**: {constraints}
**Performance Requirements**: {performance_requirements}

Please follow this systematic refactoring approach:

## 📊 Current Code Analysis
1. **Code Smells Identified**: What issues do you see?
2. **Complexity Analysis**: Cyclomatic complexity, nesting depth, etc.
3. **Design Pattern Opportunities**: What patterns could help?

## 🔄 Refactoring Plan
1. **Priority Order**: What should be refactored first?
2. **Risk Assessment**: What are the risks of each change?
3. **Testing Strategy**: How to ensure correctness?

## 🛠 Implementation
Provide the refactored code with:
- Clear explanations of each change
- Before/after comparisons for key sections
- Performance impact analysis

## ✅ Verification
- How to verify the refactoring maintains correctness
- Suggested tests to run
- Metrics to monitor

```{language}
# Refactored code here
```""",
                variables=["language", "original_code", "refactoring_goals", "constraints", "performance_requirements"],
                task_type=CodingTaskType.CODE_REFACTORING,
                complexity=PromptComplexity.EXPERT,
                strategy=PromptStrategy.STEP_BY_STEP,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5]
            ),
            
            # 문서화 템플릿
            "documentation_generator": PromptTemplate(
                name="documentation_generator",
                template="""You are a technical documentation expert. Create comprehensive documentation for this code:

**Code to Document**:
```{language}
{code_to_document}
```

**Documentation Type**: {doc_type}
**Audience**: {target_audience}
**Format**: {output_format}

Please create documentation that includes:

## 📖 Overview
- Purpose and functionality
- Key features and benefits
- When to use this code

## 🔧 API Reference
- Function/class signatures
- Parameter descriptions
- Return value details
- Exception handling

## 💡 Usage Examples
- Basic usage patterns
- Advanced use cases
- Common pitfalls and how to avoid them

## 🏗 Implementation Details
- Algorithm explanation (if complex)
- Design decisions and rationale
- Performance characteristics

## 🧪 Testing
- How to test this code
- Example test cases
- Integration testing considerations

## 🔄 Maintenance
- How to extend or modify
- Dependencies and requirements
- Backward compatibility notes

Format the documentation in {output_format} with proper formatting and structure.""",
                variables=["language", "code_to_document", "doc_type", "target_audience", "output_format"],
                task_type=CodingTaskType.DOCUMENTATION,
                complexity=PromptComplexity.MODERATE,
                strategy=PromptStrategy.DIRECT,
                model_compatibility=[AIModel.GPT_4, AIModel.CLAUDE_3_5, AIModel.GPT_3_5]
            )
        }
        
        for template_id, template in builtin_templates.items():
            self.templates[template_id] = template
    
    def _load_custom_templates(self):
        """사용자 정의 템플릿 로드"""
        if not self.template_dir.exists():
            self.template_dir.mkdir(parents=True, exist_ok=True)
            return
        
        for template_file in self.template_dir.glob("*.yaml"):
            try:
                with open(template_file, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                
                template = PromptTemplate(
                    name=data['name'],
                    template=data['template'],
                    variables=data['variables'],
                    task_type=CodingTaskType(data['task_type']),
                    complexity=PromptComplexity(data['complexity']),
                    strategy=PromptStrategy(data['strategy']),
                    model_compatibility=[AIModel(model) for model in data['model_compatibility']],
                    metadata=data.get('metadata', {})
                )
                
                self.templates[template.name] = template
                logger.info(f"Loaded custom template: {template.name}")
                
            except Exception as e:
                logger.error(f"Failed to load template {template_file}: {e}")
    
    def get_template(self, template_name: str) -> Optional[PromptTemplate]:
        """템플릿 가져오기"""
        return self.templates.get(template_name)
    
    def list_templates(self, task_type: Optional[CodingTaskType] = None,
                      complexity: Optional[PromptComplexity] = None,
                      model: Optional[AIModel] = None) -> List[PromptTemplate]:
        """조건에 맞는 템플릿 목록 반환"""
        filtered_templates = []
        
        for template in self.templates.values():
            if task_type == CodingTaskType.FUNCTION_GENERATION and "constraint" not in prompt.lower():
            prompt += constraints
        
        return prompt
    
    def analyze_prompt_quality(self, prompt: str) -> Dict[str, float]:
        """프롬프트 품질 분석"""
        analysis = {
            'clarity_score': self._calculate_clarity_score(prompt),
            'specificity_score': self._calculate_specificity_score(prompt),
            'structure_score': self._calculate_structure_score(prompt),
            'completeness_score': self._calculate_completeness_score(prompt),
            'overall_score': 0.0
        }
        
        # 전체 점수 계산 (가중 평균)
        weights = {'clarity_score': 0.3, 'specificity_score': 0.3, 'structure_score': 0.2, 'completeness_score': 0.2}
        analysis['overall_score'] = sum(analysis[key] * weight for key, weight in weights.items())
        
        return analysis
    
    def _calculate_clarity_score(self, prompt: str) -> float:
        """명확성 점수 계산"""
        # 모호한 단어 수 계산
        vague_words = ['some', 'maybe', 'probably', 'might', 'could', 'should', 'thing', 'stuff']
        word_count = len(prompt.split())
        vague_count = sum(1 for word in vague_words if word in prompt.lower())
        
        return max(0.0, 1.0 - (vague_count / word_count * 10))
    
    def _calculate_specificity_score(self, prompt: str) -> float:
        """구체성 점수 계산"""
        # 구체적 키워드 존재 여부
        specific_keywords = ['implement', 'create', 'generate', 'fix', 'optimize', 'test', 'document']
        has_specifics = sum(1 for keyword in specific_keywords if keyword in prompt.lower())
        
        return min(1.0, has_specifics / 3.0)
    
    def _calculate_structure_score(self, prompt: str) -> float:
        """구조 점수 계산"""
        score = 0.0
        
        # 구조화 요소 확인
        if any(marker in prompt for marker in ['**', '##', '###', '1.', '2.', '-']):
            score += 0.4
        if '```' in prompt:
            score += 0.3
        if ':' in prompt:
            score += 0.3
        
        return min(1.0, score)
    
    def _calculate_completeness_score(self, prompt: str) -> float:
        """완성도 점수 계산"""
        # 필수 요소 확인
        essential_elements = ['task', 'requirement', 'context', 'format']
        present_elements = sum(1 for element in essential_elements 
                             if element in prompt.lower() or 
                             any(synonym in prompt.lower() for synonym in [element + 's', element + 'ion']))
        
        return present_elements / len(essential_elements)
    
    def suggest_optimizations(self, prompt: str, task_type: CodingTaskType) -> List[OptimizationSuggestion]:
        """최적화 제안 생성"""
        suggestions = []
        analysis = self.analyze_prompt_quality(prompt)
        
        # 점수가 낮은 영역에 대한 제안
        if analysis['clarity_score'] < 0.7:
            suggestions.append(OptimizationSuggestion(
                suggestion_type="clarity",
                description="Remove vague language and add specific instructions",
                expected_improvement=0.2,
                confidence=0.8,
                implementation="Replace words like 'some', 'maybe' with specific requirements"
            ))
        
        if analysis['specificity_score'] < 0.7:
            suggestions.append(OptimizationSuggestion(
                suggestion_type="specificity",
                description="Add more specific requirements and constraints",
                expected_improvement=0.25,
                confidence=0.9,
                implementation="Include specific output formats, error handling requirements, and performance criteria"
            ))
        
        if analysis['structure_score'] < 0.7:
            suggestions.append(OptimizationSuggestion(
                suggestion_type="structure",
                description="Improve prompt structure with clear sections",
                expected_improvement=0.15,
                confidence=0.7,
                implementation="Use headers, bullet points, and code blocks to organize information"
            ))
        
        if '```' not in prompt:
            suggestions.append(OptimizationSuggestion(
                suggestion_type="format",
                description="Add code block formatting instructions",
                expected_improvement=0.1,
                confidence=0.95,
                implementation="Request output in ```language code blocks"
            ))
        
        return suggestions


class ChainOfThoughtBuilder:
    """체인 오브 소트 프롬프트 빌더"""
    
    @staticmethod
    def build_cot_prompt(task_description: str, task_type: CodingTaskType,
                        complexity: PromptComplexity = PromptComplexity.MODERATE) -> str:
        """체인 오브 소트 프롬프트 생성"""
        
        base_structure = f"""Let's approach this coding task step by step:

**Task**: {task_description}

## Step 1: Understanding the Problem
- What exactly needs to be accomplished?
- What are the inputs and expected outputs?
- What constraints or requirements must be considered?

## Step 2: Planning the Solution
- What approach or algorithm should be used?
- What data structures are most appropriate?
- How can we ensure efficiency and readability?

## Step 3: Implementation Strategy
- Break down the problem into smaller, manageable parts
- Consider edge cases and error handling
- Think about testing and validation

## Step 4: Code Implementation
Based on the analysis above, provide the complete implementation.

## Step 5: Verification and Testing
- How can we verify the solution works correctly?
- What test cases should be considered?
- Any potential improvements or optimizations?

Please work through each step thoughtfully and provide your reasoning."""

        # 작업 유형별 특화 단계 추가
        task_specific_steps = {
            CodingTaskType.BUG_FIX: """
## Additional Step: Root Cause Analysis
- What is the underlying cause of the bug?
- How did this bug likely occur?
- What can prevent similar issues in the future?""",
            
            CodingTaskType.OPTIMIZATION: """
## Additional Step: Performance Analysis
- What are the current performance bottlenecks?
- What optimization techniques apply here?
- How to measure improvement?""",
            
            CodingTaskType.TEST_GENERATION: """
## Additional Step: Test Strategy
- What testing patterns are most appropriate?
- How to achieve comprehensive coverage?
- What are the most critical scenarios to test?"""
        }
        
        if task_type in task_specific_steps:
            base_structure += task_specific_steps[task_type]
        
        return base_structure
    
    @staticmethod
    def build_socratic_prompt(task_description: str, domain: str = "software_development") -> str:
        """소크라테스식 질문 프롬프트 생성"""
        return f"""I need help with: {task_description}

Instead of giving me the answer directly, please guide me through the thinking process by asking probing questions that help me:

1. **Clarify the problem**: What questions help me better understand what I'm trying to solve?

2. **Explore approaches**: What different ways could this be approached? What are the trade-offs?

3. **Consider implications**: What are the consequences of different design decisions?

4. **Think about edge cases**: What scenarios might I not have considered?

5. **Evaluate solutions**: How can I determine if my approach is optimal?

Please start by asking me 2-3 thoughtful questions that will help me think more deeply about this problem."""


class PromptPersonalizer:
    """개인화된 프롬프트 생성기"""
    
    def __init__(self):
        self.user_preferences = {}
        self.learning_history = defaultdict(list)
    
    def learn_user_preference(self, user_id: str, task_type: CodingTaskType,
                            prompt_style: str, success_rate: float):
        """사용자 선호도 학습"""
        if user_id not in self.user_preferences:
            self.user_preferences[user_id] = {
                'preferred_styles': defaultdict(list),
                'complexity_preference': PromptComplexity.MODERATE,
                'detail_level': 'moderate',
                'example_preference': True,
                'explanation_depth': 'moderate'
            }
        
        self.user_preferences[user_id]['preferred_styles'][task_type].append({
            'style': prompt_style,
            'success_rate': success_rate,
            'timestamp': datetime.now()
        })
        
        self.learning_history[user_id].append({
            'task_type': task_type,
            'style': prompt_style,
            'success_rate': success_rate,
            'timestamp': datetime.now()
        })
    
    def get_personalized_template(self, user_id: str, task_type: CodingTaskType) -> Optional[str]:
        """개인화된 템플릿 반환"""
        if user_id not in self.user_preferences:
            return None
        
        prefs = self.user_preferences[user_id]
        
        # 사용자의 선호 스타일 분석
        if task_type in prefs['preferred_styles']:
            styles = prefs['preferred_styles'][task_type]
            if styles:
                # 성공률이 높은 스타일 선택
                best_style = max(styles, key=lambda x: x['success_rate'])
                return self._generate_personalized_prompt(best_style['style'], prefs)
        
        return None
    
    def _generate_personalized_prompt(self, base_style: str, preferences: Dict) -> str:
        """개인화 요소를 반영한 프롬프트 생성"""
        # 기본 템플릿에 개인화 요소 추가
        personalization_elements = []
        
        if preferences['example_preference']:
            personalization_elements.append("Please include concrete examples in your explanation.")
        
        if preferences['detail_level'] == 'high':
            personalization_elements.append("Provide detailed step-by-step explanations.")
        elif preferences['detail_level'] == 'low':
            personalization_elements.append("Keep explanations concise and to the point.")
        
        if preferences['explanation_depth'] == 'deep':
            personalization_elements.append("Explain the reasoning behind each design decision.")
        
        personalization_text = " ".join(personalization_elements)
        return f"{base_style}\n\nPersonalization: {personalization_text}"


class PromptExecutor:
    """프롬프트 실행 및 결과 분석기"""
    
    def __init__(self, template_manager: PromptTemplateManager):
        self.template_manager = template_manager
        self.execution_history = []
    
    def execute_prompt(self, template_name: str, variables: Dict[str, Any],
                      model: AIModel = AIModel.GPT_4) -> PromptResult:
        """프롬프트 실행"""
        start_time = time.time()
        
        try:
            template = self.template_manager.get_template(template_name)
            if not template:
                raise ValueError(f"Template '{template_name}' not found")
            
            # 변수 치환
            prompt = self._fill_template(template.template, variables)
            
            # 모델 호환성 확인
            if model not in template.model_compatibility:
                logger.warning(f"Model {model.value} may not be compatible with template {template_name}")
            
            # 실제 AI 모델 호출은 여기서 구현 (예시로 더미 응답)
            response = self._call_ai_model(prompt, model)
            
            execution_time = time.time() - start_time
            
            # 결과 분석
            quality_score = self._analyze_response_quality(prompt, response)
            
            result = PromptResult(
                prompt=prompt,
                response=response,
                success=True,
                execution_time=execution_time,
                token_count=len(prompt.split()) + len(response.split()),
                quality_score=quality_score
            )
            
            # 템플릿 성능 업데이트
            self.template_manager.update_template_performance(template_name, result)
            self.execution_history.append(result)
            
            return result
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Prompt execution failed: {e}")
            
            return PromptResult(
                prompt=variables.get('prompt', ''),
                success=False,
                execution_time=execution_time,
                metadata={'error': str(e)}
            )
    
    def _fill_template(self, template: str, variables: Dict[str, Any]) -> str:
        """템플릿에 변수 치환"""
        try:
            return template.format(**variables)
        except KeyError as e:
            missing_var = str(e).strip("'")
            logger.error(f"Missing variable in template: {missing_var}")
            # 누락된 변수를 빈 문자열로 대체
            variables[missing_var] = f"[{missing_var} not provided]"
            return template.format(**variables)
    
    def _call_ai_model(self, prompt: str, model: AIModel) -> str:
        """AI 모델 호출 (실제 구현 필요)"""
        # 이 부분은 실제 AI API 호출로 구현해야 함
        # 예시로 더미 응답 반환
        return """```python
def example_function(param1: str, param2: int) -> str:
    \"\"\"Example function generated by AI.
    
    Args:
        param1: First parameter
        param2: Second parameter
        
    Returns:
        Formatted string result
    \"\"\"
    return f"{param1}_{param2}"
```"""
    
    def _analyze_response_quality(self, prompt: str, response: str) -> float:
        """응답 품질 분석"""
        quality_score = 0.0
        
        # 코드 블록 존재 여부
        if '```' in response:
            quality_score += 0.3
        
        # 적절한 길이
        if 100 <= len(response) <= 2000:
            quality_score += 0.2
        
        # 구조화된 응답
        if any(marker in response for marker in ['##', '**', '1.', '2.', '-']):
            quality_score += 0.2
        
        # 설명 포함
        if any(word in response.lower() for word in ['because', 'reason', 'since', 'therefore']):
            quality_score += 0.1
        
        # 에러 처리 언급
        if any(word in response.lower() for word in ['error', 'exception', 'try', 'catch', 'handle']):
            quality_score += 0.1
        
        # 문서화 포함
        if '"""' in response or "'''" in response:
            quality_score += 0.1
        
        return min(1.0, quality_score)
    
    def get_execution_stats(self) -> Dict[str, Any]:
        """실행 통계 반환"""
        if not self.execution_history:
            return {}
        
        successful_executions = [r for r in self.execution_history if r.success]
        
        return {
            'total_executions': len(self.execution_history),
            'successful_executions': len(successful_executions),
            'success_rate': len(successful_executions) / len(self.execution_history),
            'average_execution_time': sum(r.execution_time for r in self.execution_history) / len(self.execution_history),
            'average_quality_score': sum(r.quality_score for r in successful_executions) / len(successful_executions) if successful_executions else 0,
            'total_tokens': sum(r.token_count for r in self.execution_history)
        }


class PromptLibrary:
    """프롬프트 라이브러리 - 통합 인터페이스"""
    
    def __init__(self, template_dir: Optional[str] = None):
        self.template_manager = PromptTemplateManager(template_dir)
        self.optimizer = PromptOptimizer()
        self.personalizer = PromptPersonalizer()
        self.executor = PromptExecutor(self.template_manager)
        self.context_extractor = ContextExtractor()
    
    def create_optimized_prompt(self, task_type: CodingTaskType, 
                              task_description: str,
                              context: Optional[CodeContext] = None,
                              user_id: Optional[str] = None,
                              model: AIModel = AIModel.GPT_4,
                              complexity: PromptComplexity = PromptComplexity.MODERATE,
                              strategy: PromptStrategy = PromptStrategy.DIRECT) -> str:
        """최적화된 프롬프트 생성"""
        
        # 1. 적절한 템플릿 선택
        templates = self.template_manager.list_templates(task_type, complexity, model)
        
        if not templates:
            # 기본 템플릿 사용
            base_template = self._get_default_template(task_type, strategy)
        else:
            # 성능이 가장 좋은 템플릿 선택
            base_template = templates[0].template
        
        # 2. 개인화 적용
        if user_id:
            personalized = self.personalizer.get_personalized_template(user_id, task_type)
            if personalized:
                base_template = personalized
        
        # 3. 컨텍스트 주입
        variables = {
            'task_description': task_description,
            'language': context.language if context else 'python',
            'code_context': self._format_context(context) if context else '',
            'requirements': '',
            'style_guidelines': 'Follow best practices and clean code principles.'
        }
        
        prompt = base_template.format(**variables)
        
        # 4. 최적화 적용
        if strategy == PromptStrategy.CHAIN_OF_THOUGHT:
            prompt = ChainOfThoughtBuilder.build_cot_prompt(task_description, task_type, complexity)
        elif strategy == PromptStrategy.SOCRATIC:
            prompt = ChainOfThoughtBuilder.build_socratic_prompt(task_description)
        else:
            prompt = self.optimizer.optimize_prompt(prompt, task_type, model)
        
        return prompt
    
    def _get_default_template(self, task_type: CodingTaskType, strategy: PromptStrategy) -> str:
        """기본 템플릿 반환"""
        if strategy == PromptStrategy.CHAIN_OF_THOUGHT:
            return """Let's solve this step by step:

Task: {task_description}

Step 1: Understand the requirements
Step 2: Plan the implementation 
Step 3: Write the code
Step 4: Verify and test

Please work through each step."""
        
        return """You are an expert developer. Please help with this task:

{task_description}

Context: {code_context}
Language: {language}

Requirements: {requirements}
Style: {style_guidelines}

Please provide a complete, well-documented solution."""
    
    def _format_context(self, context: CodeContext) -> str:
        """컨텍스트 포맷팅"""
        formatted = f"File: {context.file_path}\nLanguage: {context.language}\n"
        
        if context.imports:
            formatted += f"Imports: {', '.join(context.imports[:5])}\n"
        
        if context.function_name:
            formatted += f"Current function: {context.function_name}\n"
        
        if context.class_name:
            formatted += f"Current class: {context.class_name}\n"
        
        return formatted
    
    def analyze_and_improve_prompt(self, prompt: str, task_type: CodingTaskType) -> Dict[str, Any]:
        """프롬프트 분석 및 개선 제안"""
        quality_analysis = self.optimizer.analyze_prompt_quality(prompt)
        suggestions = self.optimizer.suggest_optimizations(prompt, task_type)
        
        return {
            'quality_analysis': quality_analysis,
            'optimization_suggestions': suggestions,
            'improved_prompt': self.optimizer.optimize_prompt(prompt, task_type)
        }
    
    def execute_task(self, task_type: CodingTaskType, task_description: str,
                    context: Optional[CodeContext] = None, user_id: Optional[str] = None,
                    model: AIModel = AIModel.GPT_4) -> PromptResult:
        """완전한 작업 실행"""
        
        # 최적화된 프롬프트 생성
        prompt = self.create_optimized_prompt(
            task_type, task_description, context, user_id, model
        )
        
        # 실행
        variables = {'prompt': prompt}
        result = self.executor.execute_prompt('custom', variables, model)
        
        # 학습 (사용자 피드백이 있다면)
        if user_id and result.success:
            self.personalizer.learn_user_preference(
                user_id, task_type, 'optimized', result.quality_score
            )
        
        return result
    
    def get_statistics(self) -> Dict[str, Any]:
        """라이브러리 통계"""
        return {
            'templates': {
                'total_templates': len(self.template_manager.templates),
                'templates_by_type': {
                    task_type.value: len([t for t in self.template_manager.templates.values() 
                                        if t.task_type == task_type])
                    for task_type in CodingTaskType
                }
            },
            'execution_stats': self.executor.get_execution_stats(),
            'users': len(self.personalizer.user_preferences)
        }


# 편의 함수들
def create_coding_prompt(task_description: str, task_type: CodingTaskType = CodingTaskType.FUNCTION_GENERATION,
                        language: str = "python", context: Optional[str] = None) -> str:
    """간단한 코딩 프롬프트 생성"""
    library = PromptLibrary()
    
    code_context = None
    if context:
        code_context = CodeContext(
            file_path="current_file",
            language=language,
            existing_code=context
        )
    
    return library.create_optimized_prompt(task_type, task_description, code_context)


def optimize_existing_prompt(prompt: str, task_type: CodingTaskType = CodingTaskType.FUNCTION_GENERATION) -> str:
    """기존 프롬프트 최적화"""
    optimizer = PromptOptimizer()
    return optimizer.optimize_prompt(prompt, task_type)


def analyze_prompt_quality(prompt: str) -> Dict[str, float]:
    """프롬프트 품질 분석"""
    optimizer = PromptOptimizer()
    return optimizer.analyze_prompt_quality(prompt)


# 사용 예제 및 테스트
if __name__ == "__main__":
    # 프롬프트 라이브러리 초기화
    library = PromptLibrary()
    
    print("=== Prompt Engineering Utils Demo ===\n")
    
    # 1. 기본 프롬프트 생성
    task_description = "Create a function that calculates the moving average of a list of numbers"
    basic_prompt = create_coding_prompt(task_description, CodingTaskType.FUNCTION_GENERATION)
    print("1. Basic Prompt:")
    print(basic_prompt[:300] + "...\n")
    
    # 2. Chain of Thought 프롬프트
    cot_prompt = ChainOfThoughtBuilder.build_cot_prompt(task_description, CodingTaskType.FUNCTION_GENERATION)
    print("2. Chain of Thought Prompt:")
    print(cot_prompt[:300] + "...\n")
    
    # 3. 프롬프트 품질 분석
    quality_analysis = analyze_prompt_quality(basic_prompt)
    print("3. Prompt Quality Analysis:")
    for metric, score in quality_analysis.items():
        print(f"   {metric}: {score:.2f}")
    print()
    
    # 4. 최적화 제안
    optimizer = PromptOptimizer()
    suggestions = optimizer.suggest_optimizations(basic_prompt, CodingTaskType.FUNCTION_GENERATION)
    print("4. Optimization Suggestions:")
    for suggestion in suggestions:
        print(f"   - {suggestion.suggestion_type}: {suggestion.description}")
    print()
    
    # 5. 통계 정보
    stats = library.get_statistics()
    print("5. Library Statistics:")
    print(f"   Total templates: {stats['templates']['total_templates']}")
    print(f"   Function generation templates: {stats['templates']['templates_by_type'].get('function_generation', 0)}")
type and template.task_type != task_type:
                continue
            if complexity and template.complexity != complexity:
                continue
            if model and model not in template.model_compatibility:
                continue
            
            filtered_templates.append(template)
        
        # 성능 점수로 정렬
        return sorted(filtered_templates, key=lambda t: t.performance_score, reverse=True)
    
    def add_template(self, template: PromptTemplate) -> bool:
        """새 템플릿 추가"""
        try:
            self.templates[template.name] = template
            
            # 파일에 저장
            template_file = self.template_dir / f"{template.name}.yaml"
            template_data = {
                'name': template.name,
                'template': template.template,
                'variables': template.variables,
                'task_type': template.task_type.value,
                'complexity': template.complexity.value,
                'strategy': template.strategy.value,
                'model_compatibility': [model.value for model in template.model_compatibility],
                'metadata': template.metadata
            }
            
            with open(template_file, 'w', encoding='utf-8') as f:
                yaml.dump(template_data, f, default_flow_style=False, allow_unicode=True)
            
            logger.info(f"Added new template: {template.name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add template {template.name}: {e}")
            return False
    
    def update_template_performance(self, template_name: str, result: PromptResult):
        """템플릿 성능 업데이트"""
        if template_name not in self.templates:
            return
        
        template = self.templates[template_name]
        template.usage_count += 1
        
        # 성공률 업데이트
        if result.success:
            success_count = template.success_rate * (template.usage_count - 1) + 1
            template.success_rate = success_count / template.usage_count
        else:
            success_count = template.success_rate * (template.usage_count - 1)
            template.success_rate = success_count / template.usage_count
        
        # 품질 점수 업데이트 (이동 평균)
        alpha = 0.2  # 학습률
        template.performance_score = (
            alpha * result.quality_score + 
            (1 - alpha) * template.performance_score
        )
        
        # 성능 히스토리 저장
        self.performance_history[template_name].append(result)
        
        # 최근 100개 결과만 유지
        if len(self.performance_history[template_name]) > 100:
            self.performance_history[template_name] = self.performance_history[template_name][-100:]


class ContextExtractor:
    """코드 컨텍스트 추출기"""
    
    @staticmethod
    def extract_from_file(file_path: str) -> CodeContext:
        """파일에서 컨텍스트 추출"""
        try:
            file_path_obj = Path(file_path)
            language = ContextExtractor._detect_language(file_path_obj)
            
            with open(file_path_obj, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return CodeContext(
                file_path=str(file_path_obj),
                language=language,
                existing_code=content,
                imports=ContextExtractor._extract_imports(content, language),
                function_name=ContextExtractor._extract_current_function(content, language),
                class_name=ContextExtractor._extract_current_class(content, language)
            )
            
        except Exception as e:
            logger.error(f"Failed to extract context from {file_path}: {e}")
            return CodeContext(file_path=file_path, language="unknown")
    
    @staticmethod
    def _detect_language(file_path: Path) -> str:
        """파일 확장자로 언어 감지"""
        extension_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin'
        }
        
        return extension_map.get(file_path.suffix.lower(), 'unknown')
    
    @staticmethod
    def _extract_imports(content: str, language: str) -> List[str]:
        """임포트 문 추출"""
        imports = []
        
        if language == 'python':
            import_patterns = [
                r'^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)',
                r'^\s*from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import'
            ]
        elif language in ['javascript', 'typescript']:
            import_patterns = [
                r'^\s*import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]',
                r'^\s*const\s+.*?\s*=\s*require\([\'"]([^\'"]+)[\'"]\)'
            ]
        else:
            return imports
        
        for pattern in import_patterns:
            matches = re.finditer(pattern, content, re.MULTILINE)
            for match in matches:
                imports.append(match.group(1))
        
        return imports
    
    @staticmethod
    def _extract_current_function(content: str, language: str) -> Optional[str]:
        """현재 함수명 추출 (간단한 구현)"""
        if language == 'python':
            match = re.search(r'def\s+([a-zA-Z_][a-zA-Z0-9_]*)', content)
            return match.group(1) if match else None
        elif language in ['javascript', 'typescript']:
            match = re.search(r'function\s+([a-zA-Z_][a-zA-Z0-9_]*)', content)
            return match.group(1) if match else None
        
        return None
    
    @staticmethod
    def _extract_current_class(content: str, language: str) -> Optional[str]:
        """현재 클래스명 추출 (간단한 구현)"""
        if language == 'python':
            match = re.search(r'class\s+([a-zA-Z_][a-zA-Z0-9_]*)', content)
            return match.group(1) if match else None
        elif language in ['javascript', 'typescript']:
            match = re.search(r'class\s+([a-zA-Z_][a-zA-Z0-9_]*)', content)
            return match.group(1) if match else None
        
        return None


class PromptOptimizer:
    """프롬프트 최적화기"""
    
    def __init__(self):
        self.optimization_rules = self._load_optimization_rules()
        self.performance_cache = {}
    
    def _load_optimization_rules(self) -> Dict[str, Callable]:
        """최적화 규칙 로드"""
        return {
            'clarity': self._improve_clarity,
            'specificity': self._improve_specificity,
            'context': self._enhance_context,
            'structure': self._improve_structure,
            'examples': self._add_examples,
            'constraints': self._add_constraints
        }
    
    def optimize_prompt(self, prompt: str, task_type: CodingTaskType,
                       model: AIModel = AIModel.GPT_4,
                       optimization_level: str = "moderate") -> str:
        """프롬프트 최적화"""
        optimized = prompt
        
        # 최적화 수준에 따른 규칙 적용
        if optimization_level == "basic":
            rules = ['clarity', 'structure']
        elif optimization_level == "moderate":
            rules = ['clarity', 'specificity', 'structure', 'constraints']
        else:  # advanced
            rules = list(self.optimization_rules.keys())
        
        for rule_name in rules:
            if rule_name in self.optimization_rules:
                optimized = self.optimization_rules[rule_name](optimized, task_type, model)
        
        return optimized
    
    def _improve_clarity(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """명확성 개선"""
        # 모호한 표현 개선
        replacements = {
            r'\bcode\b': 'implementation',
            r'\bfunction\b': 'Python function' if 'python' in prompt.lower() else 'function',
            r'\bimplement\b': 'create and implement',
            r'\bhandle\b': 'properly handle and manage'
        }
        
        for pattern, replacement in replacements.items():
            prompt = re.sub(pattern, replacement, prompt, flags=re.IGNORECASE)
        
        return prompt
    
    def _improve_specificity(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """구체성 개선"""
        # 작업 유형별 구체적 요구사항 추가
        specificity_additions = {
            CodingTaskType.FUNCTION_GENERATION: "\n\nSpecific Requirements:\n- Include type hints\n- Add comprehensive error handling\n- Optimize for readability and performance",
            CodingTaskType.BUG_FIX: "\n\nDebugging Requirements:\n- Identify root cause\n- Provide step-by-step analysis\n- Suggest prevention strategies",
            CodingTaskType.TEST_GENERATION: "\n\nTesting Requirements:\n- Achieve 100% line coverage\n- Include edge case testing\n- Use descriptive test names"
        }
        
        if task_type in specificity_additions:
            prompt += specificity_additions[task_type]
        
        return prompt
    
    def _enhance_context(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """컨텍스트 강화"""
        # 모델별 컨텍스트 최적화
        if model == AIModel.CLAUDE_3_5:
            prompt = "Think step by step and be thorough in your analysis.\n\n" + prompt
        elif model == AIModel.GPT_4:
            prompt = "You are an expert software engineer with 10+ years of experience.\n\n" + prompt
        
        return prompt
    
    def _improve_structure(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """구조 개선"""
        # 구조화된 출력 요청 추가
        if "```" not in prompt:
            prompt += "\n\nPlease provide your response in the following format:\n```python\n# Your code here\n```"
        
        return prompt
    
    def _add_examples(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """예제 추가"""
        # Few-shot 예제 추가 (간단한 구현)
        examples = {
            CodingTaskType.FUNCTION_GENERATION: """
Example:
Input: Create a function to calculate factorial
Output:
```python
def factorial(n: int) -> int:
    \"\"\"Calculate factorial of a positive integer.
    
    Args:
        n: A positive integer
        
    Returns:
        The factorial of n
        
    Raises:
        ValueError: If n is negative
    \"\"\"
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```"""
        }
        
        if task_type in examples and len(prompt) < 1000:  # 짧은 프롬프트에만 예제 추가
            prompt = examples[task_type] + "\n\n" + prompt
        
        return prompt
    
    def _add_constraints(self, prompt: str, task_type: CodingTaskType, model: AIModel) -> str:
        """제약사항 추가"""
        constraints = "\n\nConstraints:\n- Follow PEP 8 style guidelines\n- Use meaningful variable names\n- Keep functions focused and single-purpose\n- Maximum function length: 50 lines"
        
        if task_