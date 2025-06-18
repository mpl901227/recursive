#!/usr/bin/env python3
"""
Code Intelligence Utilities
코드 이해 및 분석을 위한 AI 지원 유틸리티

주요 기능:
- 함수 의도 추출 및 분석
- 코드 패턴 자동 탐지
- 개선 제안 및 최적화 힌트
- 복잡한 코드 설명 생성
- 코드 품질 측정 및 분석
- 디자인 패턴 인식
- 안티패턴 탐지
- 리팩토링 제안
"""

import ast
import re
import inspect
import hashlib
import statistics
from typing import (
    Dict, List, Any, Optional, Union, Tuple, Set, 
    Callable, Iterator, NamedTuple, TypeVar, Generic
)
from dataclasses import dataclass, field
from enum import Enum, auto
from collections import defaultdict, Counter
from pathlib import Path
import logging
import time
import json
from abc import ABC, abstractmethod
import keyword
import builtins

# 타입 변수
T = TypeVar('T')

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class CodeComplexity(Enum):
    """코드 복잡도 레벨"""
    TRIVIAL = "trivial"
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    VERY_COMPLEX = "very_complex"


class PatternType(Enum):
    """패턴 유형"""
    DESIGN_PATTERN = "design_pattern"
    ANTI_PATTERN = "anti_pattern"
    IDIOM = "idiom"
    ALGORITHM = "algorithm"
    ARCHITECTURAL = "architectural"


class ImprovementType(Enum):
    """개선 유형"""
    PERFORMANCE = "performance"
    READABILITY = "readability"
    MAINTAINABILITY = "maintainability"
    SECURITY = "security"
    MEMORY = "memory"
    ERROR_HANDLING = "error_handling"


class Language(Enum):
    """지원 언어"""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    JAVA = "java"
    CPP = "cpp"
    UNKNOWN = "unknown"


# 데이터 클래스들
@dataclass
class CodeMetrics:
    """코드 메트릭"""
    lines_of_code: int
    cyclomatic_complexity: int
    cognitive_complexity: int
    nesting_depth: int
    halstead_volume: float
    maintainability_index: float
    
    @property
    def complexity_level(self) -> CodeComplexity:
        """복잡도 레벨 결정"""
        if self.cyclomatic_complexity <= 5:
            return CodeComplexity.SIMPLE
        elif self.cyclomatic_complexity <= 10:
            return CodeComplexity.MODERATE
        elif self.cyclomatic_complexity <= 20:
            return CodeComplexity.COMPLEX
        else:
            return CodeComplexity.VERY_COMPLEX


@dataclass
class Intent:
    """함수/클래스 의도"""
    primary_purpose: str
    secondary_purposes: List[str]
    inputs: List[Dict[str, Any]]
    outputs: List[Dict[str, Any]]
    side_effects: List[str]
    assumptions: List[str]
    constraints: List[str]
    confidence: float = 0.0


@dataclass
class Pattern:
    """코드 패턴"""
    name: str
    type: PatternType
    description: str
    confidence: float
    location: Dict[str, int]  # start_line, end_line
    examples: List[str]
    related_patterns: List[str]
    benefits: List[str]
    drawbacks: List[str]


@dataclass
class Improvement:
    """개선 제안"""
    type: ImprovementType
    title: str
    description: str
    severity: str  # low, medium, high, critical
    effort: str    # trivial, easy, moderate, hard
    impact: str    # low, medium, high
    before_code: str
    after_code: str
    reasoning: str
    resources: List[str]  # 참고 자료


@dataclass
class Explanation:
    """코드 설명"""
    summary: str
    detailed_explanation: str
    key_concepts: List[str]
    step_by_step: List[str]
    complexity_explanation: str
    potential_issues: List[str]
    learning_resources: List[str]


@dataclass
class CodeElement:
    """코드 요소"""
    name: str
    type: str
    line_start: int
    line_end: int
    signature: str
    docstring: Optional[str]
    complexity: int
    dependencies: List[str]
    used_by: List[str]


# 패턴 탐지기 클래스들
class BasePatternDetector(ABC):
    """패턴 탐지기 기본 클래스"""
    
    @abstractmethod
    def detect(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """패턴 탐지"""
        pass


class DesignPatternDetector(BasePatternDetector):
    """디자인 패턴 탐지기"""
    
    def __init__(self):
        self.patterns = {
            "singleton": self._detect_singleton,
            "factory": self._detect_factory,
            "observer": self._detect_observer,
            "decorator": self._detect_decorator,
            "adapter": self._detect_adapter,
            "strategy": self._detect_strategy,
            "command": self._detect_command,
            "builder": self._detect_builder
        }
    
    def detect(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """디자인 패턴 탐지"""
        detected_patterns = []
        
        for pattern_name, detector in self.patterns.items():
            try:
                patterns = detector(code, ast_tree)
                detected_patterns.extend(patterns)
            except Exception as e:
                logger.warning(f"Pattern detection failed for {pattern_name}: {e}")
        
        return detected_patterns
    
    def _detect_singleton(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """싱글톤 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                # __new__ 메서드 확인
                has_new_method = any(
                    isinstance(item, ast.FunctionDef) and item.name == "__new__"
                    for item in node.body
                )
                
                # 인스턴스 변수 확인
                has_instance_var = any(
                    isinstance(item, ast.Assign) and
                    any(isinstance(target, ast.Name) and 
                        target.id in ["_instance", "instance", "_instances"]
                        for target in item.targets)
                    for item in node.body
                )
                
                if has_new_method or has_instance_var:
                    patterns.append(Pattern(
                        name="Singleton",
                        type=PatternType.DESIGN_PATTERN,
                        description="Ensures a class has only one instance",
                        confidence=0.8 if has_new_method and has_instance_var else 0.6,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["Factory", "Registry"],
                        benefits=["Controlled access to sole instance", "Reduced namespace"],
                        drawbacks=["Difficult to test", "Violates Single Responsibility Principle"]
                    ))
        
        return patterns
    
    def _detect_factory(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """팩토리 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                # 함수명에 'create', 'make', 'factory' 포함
                if any(keyword in node.name.lower() for keyword in ['create', 'make', 'factory', 'build']):
                    # 반환문에서 클래스 인스턴스 생성 확인
                    has_instance_creation = False
                    for child in ast.walk(node):
                        if isinstance(child, ast.Return) and isinstance(child.value, ast.Call):
                            has_instance_creation = True
                            break
                    
                    if has_instance_creation:
                        patterns.append(Pattern(
                            name="Factory Method",
                            type=PatternType.DESIGN_PATTERN,
                            description="Creates objects without specifying exact classes",
                            confidence=0.7,
                            location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                            examples=[f"def {node.name}(...)"],
                            related_patterns=["Abstract Factory", "Builder"],
                            benefits=["Loose coupling", "Flexible object creation"],
                            drawbacks=["Increased complexity", "More classes"]
                        ))
        
        return patterns
    
    def _detect_observer(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """옵저버 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                methods = [item.name for item in node.body if isinstance(item, ast.FunctionDef)]
                
                # 옵저버 패턴의 특징적 메서드들
                observer_methods = {'attach', 'detach', 'notify', 'subscribe', 'unsubscribe'}
                subject_methods = {'add_observer', 'remove_observer', 'notify_observers'}
                
                if (observer_methods.intersection(methods) or 
                    subject_methods.intersection(methods)):
                    
                    confidence = 0.8 if len(observer_methods.intersection(methods)) >= 2 else 0.6
                    
                    patterns.append(Pattern(
                        name="Observer",
                        type=PatternType.DESIGN_PATTERN,
                        description="Defines one-to-many dependency between objects",
                        confidence=confidence,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["Mediator", "Publisher-Subscriber"],
                        benefits=["Loose coupling", "Dynamic relationships"],
                        drawbacks=["Unexpected updates", "Memory leaks possible"]
                    ))
        
        return patterns
    
    def _detect_decorator(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """데코레이터 패턴 탐지"""
        patterns = []
        
        # Python 데코레이터 (@) 확인
        decorator_functions = []
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef) and node.decorator_list:
                decorator_functions.append(node)
        
        if decorator_functions:
            patterns.append(Pattern(
                name="Decorator (Python)",
                type=PatternType.DESIGN_PATTERN,
                description="Adds behavior to objects dynamically",
                confidence=0.9,
                location={"start_line": decorator_functions[0].lineno, "end_line": decorator_functions[0].lineno},
                examples=[f"@decorator"],
                related_patterns=["Wrapper", "Proxy"],
                benefits=["Runtime behavior modification", "Clean separation"],
                drawbacks=["Can be complex to debug", "Performance overhead"]
            ))
        
        return patterns
    
    def _detect_adapter(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """어댑터 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                # 클래스명에 'Adapter', 'Wrapper' 포함
                if any(keyword in node.name for keyword in ['Adapter', 'Wrapper']):
                    patterns.append(Pattern(
                        name="Adapter",
                        type=PatternType.DESIGN_PATTERN,
                        description="Allows incompatible interfaces to work together",
                        confidence=0.7,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["Facade", "Bridge"],
                        benefits=["Interface compatibility", "Reuse existing code"],
                        drawbacks=["Additional complexity", "Indirection"]
                    ))
        
        return patterns
    
    def _detect_strategy(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """전략 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                # 전략 인터페이스나 구현체 확인
                if any(keyword in node.name.lower() for keyword in ['strategy', 'algorithm']):
                    patterns.append(Pattern(
                        name="Strategy",
                        type=PatternType.DESIGN_PATTERN,
                        description="Defines family of algorithms and makes them interchangeable",
                        confidence=0.6,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["State", "Template Method"],
                        benefits=["Algorithm flexibility", "Runtime selection"],
                        drawbacks=["Increased number of classes", "Client awareness"]
                    ))
        
        return patterns
    
    def _detect_command(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """커맨드 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                methods = [item.name for item in node.body if isinstance(item, ast.FunctionDef)]
                
                # 커맨드 패턴의 특징적 메서드들
                if 'execute' in methods or 'do' in methods:
                    patterns.append(Pattern(
                        name="Command",
                        type=PatternType.DESIGN_PATTERN,
                        description="Encapsulates a request as an object",
                        confidence=0.7,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["Memento", "Macro Command"],
                        benefits=["Decouples invoker and receiver", "Undo functionality"],
                        drawbacks=["Increased complexity", "More objects"]
                    ))
        
        return patterns
    
    def _detect_builder(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """빌더 패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                methods = [item.name for item in node.body if isinstance(item, ast.FunctionDef)]
                
                # 빌더 패턴의 특징
                has_build_method = 'build' in methods
                has_fluent_interface = any(
                    self._is_fluent_method(item) for item in node.body 
                    if isinstance(item, ast.FunctionDef)
                )
                
                if has_build_method or has_fluent_interface:
                    patterns.append(Pattern(
                        name="Builder",
                        type=PatternType.DESIGN_PATTERN,
                        description="Constructs complex objects step by step",
                        confidence=0.8 if has_build_method and has_fluent_interface else 0.6,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name}"],
                        related_patterns=["Factory", "Abstract Factory"],
                        benefits=["Control construction process", "Different representations"],
                        drawbacks=["Increased complexity", "Must create all products"]
                    ))
        
        return patterns
    
    def _is_fluent_method(self, method_node: ast.FunctionDef) -> bool:
        """플루언트 인터페이스 메서드 확인"""
        for child in ast.walk(method_node):
            if isinstance(child, ast.Return):
                if isinstance(child.value, ast.Name) and child.value.id == 'self':
                    return True
        return False


class AntiPatternDetector(BasePatternDetector):
    """안티패턴 탐지기"""
    
    def detect(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """안티패턴 탐지"""
        patterns = []
        
        patterns.extend(self._detect_god_class(ast_tree))
        patterns.extend(self._detect_long_method(ast_tree))
        patterns.extend(self._detect_long_parameter_list(ast_tree))
        patterns.extend(self._detect_duplicate_code(code, ast_tree))
        patterns.extend(self._detect_dead_code(ast_tree))
        patterns.extend(self._detect_magic_numbers(ast_tree))
        patterns.extend(self._detect_god_object(ast_tree))
        
        return patterns
    
    def _detect_god_class(self, ast_tree: ast.AST) -> List[Pattern]:
        """갓 클래스 안티패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                method_count = sum(1 for item in node.body if isinstance(item, ast.FunctionDef))
                line_count = getattr(node, 'end_lineno', node.lineno) - node.lineno
                
                if method_count > 20 or line_count > 500:
                    patterns.append(Pattern(
                        name="God Class",
                        type=PatternType.ANTI_PATTERN,
                        description="Class that knows too much or does too much",
                        confidence=0.8 if method_count > 30 else 0.6,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name} with {method_count} methods"],
                        related_patterns=["Large Class", "Long Method"],
                        benefits=[],
                        drawbacks=["Hard to understand", "Difficult to maintain", "Low cohesion"]
                    ))
        
        return patterns
    
    def _detect_long_method(self, ast_tree: ast.AST) -> List[Pattern]:
        """긴 메서드 안티패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                line_count = getattr(node, 'end_lineno', node.lineno) - node.lineno
                
                if line_count > 50:
                    patterns.append(Pattern(
                        name="Long Method",
                        type=PatternType.ANTI_PATTERN,
                        description="Method that is too long and does too many things",
                        confidence=0.9 if line_count > 100 else 0.7,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"def {node.name}() with {line_count} lines"],
                        related_patterns=["God Method", "Complex Method"],
                        benefits=[],
                        drawbacks=["Hard to understand", "Difficult to test", "Low reusability"]
                    ))
        
        return patterns
    
    def _detect_long_parameter_list(self, ast_tree: ast.AST) -> List[Pattern]:
        """긴 매개변수 목록 안티패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                param_count = len(node.args.args)
                
                if param_count > 5:
                    patterns.append(Pattern(
                        name="Long Parameter List",
                        type=PatternType.ANTI_PATTERN,
                        description="Method with too many parameters",
                        confidence=0.8 if param_count > 8 else 0.6,
                        location={"start_line": node.lineno, "end_line": node.lineno},
                        examples=[f"def {node.name}() with {param_count} parameters"],
                        related_patterns=["Data Clumps", "Primitive Obsession"],
                        benefits=[],
                        drawbacks=["Hard to remember", "Coupling", "Error-prone"]
                    ))
        
        return patterns
    
    def _detect_duplicate_code(self, code: str, ast_tree: ast.AST) -> List[Pattern]:
        """중복 코드 안티패턴 탐지"""
        patterns = []
        
        # 간단한 중복 탐지 (동일한 라인이 3번 이상 반복)
        lines = code.split('\n')
        line_counts = Counter(line.strip() for line in lines if line.strip())
        
        duplicates = {line: count for line, count in line_counts.items() 
                     if count >= 3 and len(line) > 10}
        
        if duplicates:
            patterns.append(Pattern(
                name="Duplicate Code",
                type=PatternType.ANTI_PATTERN,
                description="Identical or very similar code exists in multiple places",
                confidence=0.7,
                location={"start_line": 1, "end_line": len(lines)},
                examples=[f"{len(duplicates)} duplicate lines found"],
                related_patterns=["Copy-Paste Programming", "Shotgun Surgery"],
                benefits=[],
                drawbacks=["Maintenance overhead", "Inconsistency risk", "Bloated code"]
            ))
        
        return patterns
    
    def _detect_dead_code(self, ast_tree: ast.AST) -> List[Pattern]:
        """데드 코드 안티패턴 탐지"""
        patterns = []
        
        # 간단한 데드 코드 탐지 (사용되지 않는 함수/클래스)
        defined_names = set()
        used_names = set()
        
        for node in ast.walk(ast_tree):
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                defined_names.add(node.name)
            elif isinstance(node, ast.Name):
                used_names.add(node.id)
        
        unused_names = defined_names - used_names - set(dir(builtins))
        
        if unused_names:
            patterns.append(Pattern(
                name="Dead Code",
                type=PatternType.ANTI_PATTERN,
                description="Code that is never executed or used",
                confidence=0.6,  # 낮은 신뢰도 (false positive 가능)
                location={"start_line": 1, "end_line": 1},
                examples=[f"Potentially unused: {', '.join(list(unused_names)[:3])}"],
                related_patterns=["Unreachable Code", "Unused Variables"],
                benefits=[],
                drawbacks=["Code bloat", "Confusion", "Maintenance overhead"]
            ))
        
        return patterns
    
    def _detect_magic_numbers(self, ast_tree: ast.AST) -> List[Pattern]:
        """매직 넘버 안티패턴 탐지"""
        patterns = []
        
        magic_numbers = []
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                # 일반적으로 허용되는 숫자들 제외
                if node.value not in [0, 1, -1, 2, 10, 100]:
                    magic_numbers.append((node.value, node.lineno))
        
        if len(magic_numbers) > 3:
            patterns.append(Pattern(
                name="Magic Numbers",
                type=PatternType.ANTI_PATTERN,
                description="Unexplained numeric literals in code",
                confidence=0.7,
                location={"start_line": magic_numbers[0][1], "end_line": magic_numbers[-1][1]},
                examples=[f"Numbers like {magic_numbers[0][0]}, {magic_numbers[1][0]}..."],
                related_patterns=["Hard-coded Values", "Primitive Obsession"],
                benefits=[],
                drawbacks=["Hard to understand", "Difficult to maintain", "Error-prone"]
            ))
        
        return patterns
    
    def _detect_god_object(self, ast_tree: ast.AST) -> List[Pattern]:
        """갓 오브젝트 안티패턴 탐지"""
        patterns = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                # 너무 많은 인스턴스 변수
                instance_vars = set()
                for item in ast.walk(node):
                    if isinstance(item, ast.Attribute) and isinstance(item.value, ast.Name) and item.value.id == 'self':
                        instance_vars.add(item.attr)
                
                if len(instance_vars) > 15:
                    patterns.append(Pattern(
                        name="God Object",
                        type=PatternType.ANTI_PATTERN,
                        description="Object that knows about too many other objects",
                        confidence=0.7,
                        location={"start_line": node.lineno, "end_line": getattr(node, 'end_lineno', node.lineno)},
                        examples=[f"class {node.name} with {len(instance_vars)} instance variables"],
                        related_patterns=["God Class", "Large Class"],
                        benefits=[],
                        drawbacks=["High coupling", "Low cohesion", "Hard to test"]
                    ))
        
        return patterns


class CodeIntelligenceEngine:
    """코드 인텔리전스 엔진"""
    
    def __init__(self):
        self.pattern_detectors = [
            DesignPatternDetector(),
            AntiPatternDetector()
        ]
        self.language_detector = self._create_language_detector()
        self.metrics_calculator = CodeMetricsCalculator()
        self.intent_analyzer = IntentAnalyzer()
        self.improvement_suggester = ImprovementSuggester()
        self.code_explainer = CodeExplainer()
    
    def _create_language_detector(self) -> Callable[[str], Language]:
        """언어 탐지기 생성"""
        def detect_language(code: str) -> Language:
            if 'def ' in code and ':' in code and 'import ' in code:
                return Language.PYTHON
            elif ('function' in code or '=>' in code) and ('{' in code and '}' in code):
                if 'interface' in code or ': string' in code or ': number' in code:
                    return Language.TYPESCRIPT
                else:
                    return Language.JAVASCRIPT
            elif 'public class' in code and 'public static void main' in code:
                return Language.JAVA
            elif '#include' in code and ('int main' in code or 'void main' in code):
                return Language.CPP
            else:
                return Language.UNKNOWN
        
        return detect_language
    
    def analyze_code(self, code: str, file_path: Optional[str] = None) -> Dict[str, Any]:
        """종합 코드 분석"""
        try:
            # 언어 탐지
            language = self.language_detector(code)
            
            # Python 코드인 경우 AST 분석
            ast_tree = None
            if language == Language.PYTHON:
                try:
                    ast_tree = ast.parse(code)
                except SyntaxError as e:
                    logger.warning(f"AST parsing failed: {e}")
            
            # 각종 분석 수행
            analysis_result = {
                "language": language.value,
                "file_path": file_path,
                "timestamp": time.time(),
                "metrics": self.metrics_calculator.calculate(code, ast_tree),
                "patterns": self.detect_patterns(code, ast_tree),
                "intent": self.intent_analyzer.analyze(code, ast_tree),
                "improvements": self.improvement_suggester.suggest(code, ast_tree),
                "explanation": self.code_explainer.explain(code, ast_tree),
                "elements": self._extract_code_elements(code, ast_tree)
            }
            
            return analysis_result
            
        except Exception as e:
            logger.error(f"Code analysis failed: {e}")
            return {
                "error": str(e),
                "language": "unknown",
                "timestamp": time.time()
            }
    
    def detect_patterns(self, code: str, ast_tree: Optional[ast.AST]) -> List[Dict[str, Any]]:
        """패턴 탐지"""
        if ast_tree is None:
            return []
        
        all_patterns = []
        for detector in self.pattern_detectors:
            try:
                patterns = detector.detect(code, ast_tree)
                all_patterns.extend([self._pattern_to_dict(p) for p in patterns])
            except Exception as e:
                logger.warning(f"Pattern detection failed: {e}")
        
        # 신뢰도 순으로 정렬
        all_patterns.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        
        return all_patterns
    
    def _pattern_to_dict(self, pattern: Pattern) -> Dict[str, Any]:
        """패턴을 딕셔너리로 변환"""
        return {
            "name": pattern.name,
            "type": pattern.type.value,
            "description": pattern.description,
            "confidence": pattern.confidence,
            "location": pattern.location,
            "examples": pattern.examples,
            "related_patterns": pattern.related_patterns,
            "benefits": pattern.benefits,
            "drawbacks": pattern.drawbacks
        }
    
    def _extract_code_elements(self, code: str, ast_tree: Optional[ast.AST]) -> List[Dict[str, Any]]:
        """코드 요소 추출"""
        if ast_tree is None:
            return []
        
        elements = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                elements.append({
                    "name": node.name,
                    "type": "function",
                    "line_start": node.lineno,
                    "line_end": getattr(node, 'end_lineno', node.lineno),
                    "signature": self._get_function_signature(node),
                    "docstring": ast.get_docstring(node),
                    "complexity": self._calculate_function_complexity(node),
                    "parameters": [arg.arg for arg in node.args.args],
                    "is_async": isinstance(node, ast.AsyncFunctionDef)
                })
            elif isinstance(node, ast.ClassDef):
                elements.append({
                    "name": node.name,
                    "type": "class",
                    "line_start": node.lineno,
                    "line_end": getattr(node, 'end_lineno', node.lineno),
                    "signature": f"class {node.name}",
                    "docstring": ast.get_docstring(node),
                    "methods": [item.name for item in node.body if isinstance(item, ast.FunctionDef)],
                    "base_classes": [self._get_base_class_name(base) for base in node.bases]
                })
        
        return elements
    
    def _get_function_signature(self, node: ast.FunctionDef) -> str:
        """함수 시그니처 추출"""
        args = []
        for arg in node.args.args:
            if arg.annotation:
                args.append(f"{arg.arg}: {ast.unparse(arg.annotation)}")
            else:
                args.append(arg.arg)
        
        signature = f"def {node.name}({', '.join(args)})"
        
        if node.returns:
            signature += f" -> {ast.unparse(node.returns)}"
        
        return signature
    
    def _get_base_class_name(self, base: ast.expr) -> str:
        """기본 클래스 이름 추출"""
        if isinstance(base, ast.Name):
            return base.id
        elif isinstance(base, ast.Attribute):
            return ast.unparse(base)
        else:
            return str(base)
    
    def _calculate_function_complexity(self, node: ast.FunctionDef) -> int:
        """함수 복잡도 계산"""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(child, ast.ExceptHandler):
                complexity += 1
            elif isinstance(child, (ast.And, ast.Or)):
                complexity += 1
        return complexity


class CodeMetricsCalculator:
    """코드 메트릭 계산기"""
    
    def calculate(self, code: str, ast_tree: Optional[ast.AST]) -> Dict[str, Any]:
        """종합 메트릭 계산"""
        metrics = {
            "lines_of_code": len([line for line in code.split('\n') if line.strip()]),
            "total_lines": len(code.split('\n')),
            "comment_lines": self._count_comment_lines(code),
            "blank_lines": len([line for line in code.split('\n') if not line.strip()])
        }
        
        if ast_tree:
            metrics.update({
                "cyclomatic_complexity": self._calculate_cyclomatic_complexity(ast_tree),
                "cognitive_complexity": self._calculate_cognitive_complexity(ast_tree),
                "nesting_depth": self._calculate_nesting_depth(ast_tree),
                "halstead_volume": self._calculate_halstead_volume(ast_tree),
                "maintainability_index": self._calculate_maintainability_index(code, ast_tree)
            })
        
        return metrics
    
    def _count_comment_lines(self, code: str) -> int:
        """주석 라인 수 계산"""
        comment_count = 0
        in_multiline_comment = False
        
        for line in code.split('\n'):
            stripped = line.strip()
            if stripped.startswith('#'):
                comment_count += 1
            elif '"""' in stripped or "'''" in stripped:
                if not in_multiline_comment:
                    in_multiline_comment = True
                    comment_count += 1
                else:
                    in_multiline_comment = False
            elif in_multiline_comment:
                comment_count += 1
        
        return comment_count
    
    def _calculate_cyclomatic_complexity(self, ast_tree: ast.AST) -> int:
        """순환 복잡도 계산"""
        complexity = 1
        
        for node in ast.walk(ast_tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(node, ast.ExceptHandler):
                complexity += 1
            elif isinstance(node, (ast.And, ast.Or)):
                complexity += 1
            elif isinstance(node, ast.comprehension):
                complexity += 1
        
        return complexity
    
    def _calculate_cognitive_complexity(self, ast_tree: ast.AST) -> int:
        """인지 복잡도 계산"""
        complexity = 0
        nesting_level = 0
        
        def calculate_recursive(node, level=0):
            nonlocal complexity
            
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1 + level
                level += 1
            elif isinstance(node, ast.ExceptHandler):
                complexity += 1 + level
            elif isinstance(node, (ast.And, ast.Or)):
                complexity += 1
            
            for child in ast.iter_child_nodes(node):
                calculate_recursive(child, level)
        
        calculate_recursive(ast_tree)
        return complexity
    
    def _calculate_nesting_depth(self, ast_tree: ast.AST) -> int:
        """중첩 깊이 계산"""
        max_depth = 0
        
        def calculate_depth(node, current_depth=0):
            nonlocal max_depth
            max_depth = max(max_depth, current_depth)
            
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor, ast.With, ast.Try)):
                current_depth += 1
            
            for child in ast.iter_child_nodes(node):
                calculate_depth(child, current_depth)
        
        calculate_depth(ast_tree)
        return max_depth
    
    def _calculate_halstead_volume(self, ast_tree: ast.AST) -> float:
        """할스테드 볼륨 계산"""
        operators = set()
        operands = set()
        operator_count = 0
        operand_count = 0
        
        for node in ast.walk(ast_tree):
            if isinstance(node, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)):
                operators.add(type(node).__name__)
                operator_count += 1
            elif isinstance(node, (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)):
                operators.add(type(node).__name__)
                operator_count += 1
            elif isinstance(node, ast.Name):
                operands.add(node.id)
                operand_count += 1
            elif isinstance(node, ast.Constant):
                operands.add(str(node.value))
                operand_count += 1
        
        n1 = len(operators)  # 고유 연산자 수
        n2 = len(operands)   # 고유 피연산자 수
        N1 = operator_count  # 총 연산자 수
        N2 = operand_count   # 총 피연산자 수
        
        if n1 == 0 or n2 == 0:
            return 0.0
        
        import math
        vocabulary = n1 + n2
        length = N1 + N2
        volume = length * math.log2(vocabulary) if vocabulary > 0 else 0
        
        return volume
    
    def _calculate_maintainability_index(self, code: str, ast_tree: ast.AST) -> float:
        """유지보수성 지수 계산"""
        halstead_volume = self._calculate_halstead_volume(ast_tree)
        cyclomatic_complexity = self._calculate_cyclomatic_complexity(ast_tree)
        lines_of_code = len([line for line in code.split('\n') if line.strip()])
        
        if lines_of_code == 0 or halstead_volume == 0:
            return 100.0
        
        import math
        
        # 간단한 유지보수성 지수 계산
        mi = max(0, 171 - 5.2 * math.log(halstead_volume) - 
                 0.23 * cyclomatic_complexity - 16.2 * math.log(lines_of_code))
        
        return min(100, max(0, mi))


class IntentAnalyzer:
    """의도 분석기"""
    
    def analyze(self, code: str, ast_tree: Optional[ast.AST]) -> Dict[str, Any]:
        """코드 의도 분석"""
        if ast_tree is None:
            return self._analyze_text_based(code)
        
        intents = []
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                intent = self._analyze_function_intent(node, code)
                if intent:
                    intents.append(intent)
            elif isinstance(node, ast.ClassDef):
                intent = self._analyze_class_intent(node, code)
                if intent:
                    intents.append(intent)
        
        return {"intents": intents}
    
    def _analyze_function_intent(self, node: ast.FunctionDef, code: str) -> Optional[Dict[str, Any]]:
        """함수 의도 분석"""
        # 함수명 분석
        name_analysis = self._analyze_function_name(node.name)
        
        # 독스트링 분석
        docstring = ast.get_docstring(node)
        docstring_analysis = self._analyze_docstring(docstring) if docstring else {}
        
        # 매개변수 분석
        param_analysis = self._analyze_parameters(node.args)
        
        # 반환값 분석
        return_analysis = self._analyze_return_statements(node)
        
        # 사이드 이펙트 분석
        side_effects = self._analyze_side_effects(node)
        
        return {
            "type": "function",
            "name": node.name,
            "primary_purpose": name_analysis.get("purpose", "Unknown"),
            "secondary_purposes": name_analysis.get("secondary", []),
            "inputs": param_analysis,
            "outputs": return_analysis,
            "side_effects": side_effects,
            "assumptions": docstring_analysis.get("assumptions", []),
            "constraints": docstring_analysis.get("constraints", []),
            "confidence": self._calculate_intent_confidence(name_analysis, docstring_analysis)
        }
    
    def _analyze_function_name(self, name: str) -> Dict[str, Any]:
        """함수명으로부터 의도 추출"""
        name_lower = name.lower()
        
        # 동작 키워드 매핑
        action_keywords = {
            "get": "데이터 조회/반환",
            "set": "데이터 설정/할당",
            "create": "객체/데이터 생성",
            "make": "객체/데이터 생성",
            "build": "복잡한 객체 구성",
            "generate": "동적 생성/계산",
            "calculate": "수치 계산",
            "compute": "복잡한 계산",
            "process": "데이터 처리/변환",
            "transform": "데이터 변환",
            "convert": "형식 변환",
            "parse": "구문 분석",
            "validate": "유효성 검증",
            "check": "조건 확인",
            "find": "검색/탐색",
            "search": "검색/탐색",
            "filter": "데이터 필터링",
            "sort": "데이터 정렬",
            "update": "데이터 갱신",
            "delete": "데이터 삭제",
            "remove": "요소 제거",
            "add": "요소 추가",
            "insert": "데이터 삽입",
            "save": "데이터 저장",
            "load": "데이터 로드",
            "read": "데이터 읽기",
            "write": "데이터 쓰기",
            "send": "데이터 전송",
            "receive": "데이터 수신",
            "handle": "이벤트/예외 처리",
            "manage": "관리/제어",
            "initialize": "초기화",
            "setup": "설정/준비",
            "cleanup": "정리/해제",
            "format": "형식 조정",
            "render": "렌더링/출력"
        }
        
        purpose = "Unknown"
        secondary = []
        
        for keyword, description in action_keywords.items():
            if keyword in name_lower:
                if purpose == "Unknown":
                    purpose = description
                else:
                    secondary.append(description)
        
        # 특수 패턴 분석
        if name.startswith('_'):
            secondary.append("내부 사용 함수")
        if name.startswith('__') and name.endswith('__'):
            secondary.append("매직 메서드")
        if 'test' in name_lower:
            purpose = "테스트 함수"
        
        return {
            "purpose": purpose,
            "secondary": secondary
        }
    
    def _analyze_docstring(self, docstring: str) -> Dict[str, Any]:
        """독스트링 분석"""
        if not docstring:
            return {}
        
        lines = docstring.split('\n')
        analysis = {
            "assumptions": [],
            "constraints": [],
            "description": ""
        }
        
        # 간단한 키워드 기반 분석
        for line in lines:
            line_lower = line.lower().strip()
            if any(keyword in line_lower for keyword in ['assume', 'suppose', 'expect']):
                analysis["assumptions"].append(line.strip())
            elif any(keyword in line_lower for keyword in ['must', 'should', 'require', 'constraint']):
                analysis["constraints"].append(line.strip())
            elif line.strip() and not analysis["description"]:
                analysis["description"] = line.strip()
        
        return analysis
    
    def _analyze_parameters(self, args: ast.arguments) -> List[Dict[str, Any]]:
        """매개변수 분석"""
        parameters = []
        
        for arg in args.args:
            param_info = {
                "name": arg.arg,
                "type": "Any",
                "purpose": self._infer_parameter_purpose(arg.arg)
            }
            
            if arg.annotation:
                param_info["type"] = ast.unparse(arg.annotation)
            
            parameters.append(param_info)
        
        return parameters
    
    def _infer_parameter_purpose(self, param_name: str) -> str:
        """매개변수 이름으로부터 목적 추론"""
        name_lower = param_name.lower()
        
        purpose_map = {
            "data": "처리할 데이터",
            "value": "처리할 값",
            "input": "입력 데이터",
            "output": "출력 위치",
            "path": "파일/디렉토리 경로",
            "url": "웹 주소",
            "name": "이름/식별자",
            "id": "고유 식별자",
            "key": "키 값",
            "index": "인덱스/위치",
            "size": "크기/개수",
            "count": "개수",
            "flag": "플래그/옵션",
            "option": "옵션/설정",
            "config": "설정 정보",
            "callback": "콜백 함수",
            "handler": "핸들러 함수"
        }
        
        for keyword, purpose in purpose_map.items():
            if keyword in name_lower:
                return purpose
        
        return "범용 매개변수"
    
    def _analyze_return_statements(self, node: ast.FunctionDef) -> List[Dict[str, Any]]:
        """반환문 분석"""
        returns = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Return):
                return_info = {
                    "type": "Any",
                    "description": "함수 반환값"
                }
                
                if child.value:
                    if isinstance(child.value, ast.Constant):
                        return_info["type"] = type(child.value.value).__name__
                        return_info["example"] = str(child.value.value)
                    elif isinstance(child.value, ast.Name):
                        return_info["variable"] = child.value.id
                
                returns.append(return_info)
        
        return returns
    
    def _analyze_side_effects(self, node: ast.FunctionDef) -> List[str]:
        """사이드 이펙트 분석"""
        side_effects = []
        
        for child in ast.walk(node):
            # 파일 I/O
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                if child.func.id in ['open', 'write', 'read']:
                    side_effects.append("파일 I/O 작업")
                elif child.func.id in ['print', 'input']:
                    side_effects.append("콘솔 I/O 작업")
            
            # 글로벌 변수 수정
            elif isinstance(child, ast.Global):
                side_effects.append("전역 변수 수정")
            
            # 예외 발생
            elif isinstance(child, ast.Raise):
                side_effects.append("예외 발생 가능")
        
        return list(set(side_effects))
    
    def _analyze_class_intent(self, node: ast.ClassDef, code: str) -> Optional[Dict[str, Any]]:
        """클래스 의도 분석"""
        docstring = ast.get_docstring(node)
        
        # 클래스 이름 분석
        name_analysis = self._analyze_class_name(node.name)
        
        # 메서드 분석
        methods = [item for item in node.body if isinstance(item, ast.FunctionDef)]
        method_purposes = [self._analyze_function_name(method.name)["purpose"] for method in methods]
        
        return {
            "type": "class",
            "name": node.name,
            "primary_purpose": name_analysis.get("purpose", "Unknown"),
            "responsibilities": method_purposes,
            "pattern_hints": name_analysis.get("patterns", []),
            "confidence": 0.7
        }
    
    def _analyze_class_name(self, name: str) -> Dict[str, Any]:
        """클래스명 분석"""
        name_lower = name.lower()
        
        # 일반적인 클래스 패턴
        class_patterns = {
            "manager": "관리자 클래스",
            "handler": "핸들러 클래스",
            "processor": "처리기 클래스",
            "builder": "빌더 패턴",
            "factory": "팩토리 패턴",
            "singleton": "싱글톤 패턴",
            "adapter": "어댑터 패턴",
            "wrapper": "래퍼 클래스",
            "controller": "컨트롤러 클래스",
            "service": "서비스 클래스",
            "repository": "저장소 클래스",
            "model": "데이터 모델",
            "entity": "엔티티 클래스",
            "utils": "유틸리티 클래스",
            "helper": "헬퍼 클래스"
        }
        
        purpose = "범용 클래스"
        patterns = []
        
        for pattern, description in class_patterns.items():
            if pattern in name_lower:
                purpose = description
                patterns.append(pattern)
        
        return {
            "purpose": purpose,
            "patterns": patterns
        }
    
    def _analyze_text_based(self, code: str) -> Dict[str, Any]:
        """텍스트 기반 간단 분석"""
        lines = code.split('\n')
        
        # 키워드 빈도 분석
        keywords = ['def', 'class', 'if', 'for', 'while', 'try', 'import']
        keyword_counts = {kw: sum(line.count(kw) for line in lines) for kw in keywords}
        
        # 주석 비율
        comment_lines = sum(1 for line in lines if line.strip().startswith('#'))
        total_lines = len([line for line in lines if line.strip()])
        comment_ratio = comment_lines / total_lines if total_lines > 0 else 0
        
        return {
            "keyword_analysis": keyword_counts,
            "comment_ratio": comment_ratio,
            "estimated_complexity": "high" if keyword_counts.get('if', 0) > 10 else "medium" if keyword_counts.get('if', 0) > 5 else "low"
        }
    
    def _calculate_intent_confidence(self, name_analysis: Dict, docstring_analysis: Dict) -> float:
        """의도 분석 신뢰도 계산"""
        confidence = 0.5  # 기본값
        
        if name_analysis.get("purpose") != "Unknown":
            confidence += 0.3
        
        if docstring_analysis.get("description"):
            confidence += 0.2
        
        if docstring_analysis.get("assumptions"):
            confidence += 0.1
        
        return min(1.0, confidence)


class ImprovementSuggester:
    """개선 제안기"""
    
    def suggest(self, code: str, ast_tree: Optional[ast.AST]) -> List[Dict[str, Any]]:
        """개선 제안 생성"""
        suggestions = []
        
        if ast_tree:
            suggestions.extend(self._suggest_performance_improvements(ast_tree))
            suggestions.extend(self._suggest_readability_improvements(ast_tree))
            suggestions.extend(self._suggest_maintainability_improvements(ast_tree))
            suggestions.extend(self._suggest_security_improvements(ast_tree))
        
        suggestions.extend(self._suggest_text_based_improvements(code))
        
        # 우선순위 정렬 (심각도 + 영향도)
        priority_map = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        suggestions.sort(key=lambda x: (
            priority_map.get(x.get("severity", "low"), 1) +
            priority_map.get(x.get("impact", "low"), 1)
        ), reverse=True)
        
        return suggestions[:10]  # 상위 10개만 반환
    
    def _suggest_performance_improvements(self, ast_tree: ast.AST) -> List[Dict[str, Any]]:
        """성능 개선 제안"""
        suggestions = []
        
        # 중첩 루프 탐지
        for node in ast.walk(ast_tree):
            if isinstance(node, (ast.For, ast.While)):
                nested_loops = sum(1 for child in ast.walk(node) 
                                 if isinstance(child, (ast.For, ast.While)) and child != node)
                
                if nested_loops >= 2:
                    suggestions.append({
                        "type": ImprovementType.PERFORMANCE.value,
                        "title": "중첩 루프 최적화",
                        "description": "깊게 중첩된 루프가 성능 저하를 일으킬 수 있습니다",
                        "severity": "medium",
                        "effort": "moderate",
                        "impact": "high",
                        "before_code": f"# 중첩 루프 at line {node.lineno}",
                        "after_code": "# 리스트 컴프리헨션이나 벡터화 연산 고려",
                        "reasoning": "중첩 루프는 시간 복잡도를 크게 증가시킵니다",
                        "resources": ["https://docs.python.org/3/tutorial/datastructures.html#list-comprehensions"]
                    })
        
        # 문자열 연결 최적화
        string_concat_count = 0
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.AugAssign) and isinstance(node.op, ast.Add):
                if isinstance(node.target, ast.Name):
                    string_concat_count += 1
        
        if string_concat_count > 3:
            suggestions.append({
                "type": ImprovementType.PERFORMANCE.value,
                "title": "문자열 연결 최적화",
                "description": "반복적인 문자열 연결은 비효율적입니다",
                "severity": "medium",
                "effort": "easy",
                "impact": "medium",
                "before_code": "result += string",
                "after_code": "result = ''.join(string_list)",
                "reasoning": "문자열은 불변객체이므로 연결시마다 새 객체를 생성합니다",
                "resources": ["https://docs.python.org/3/library/stdtypes.html#str.join"]
            })
        
        return suggestions
    
    def _suggest_readability_improvements(self, ast_tree: ast.AST) -> List[Dict[str, Any]]:
        """가독성 개선 제안"""
        suggestions = []
        
        # 긴 함수 탐지
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                line_count = getattr(node, 'end_lineno', node.lineno) - node.lineno
                
                if line_count > 50:
                    suggestions.append({
                        "type": ImprovementType.READABILITY.value,
                        "title": "함수 분해",
                        "description": f"함수 '{node.name}'이 너무 깁니다 ({line_count} 줄)",
                        "severity": "medium",
                        "effort": "moderate",
                        "impact": "high",
                        "before_code": f"def {node.name}():  # {line_count} lines",
                        "after_code": "# 여러 개의 작은 함수로 분해",
                        "reasoning": "긴 함수는 이해하고 테스트하기 어렵습니다",
                        "resources": ["https://refactoring.guru/extract-method"]
                    })
        
        # 복잡한 조건문 탐지
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.If):
                condition_complexity = self._count_boolean_operators(node.test)
                
                if condition_complexity > 3:
                    suggestions.append({
                        "type": ImprovementType.READABILITY.value,
                        "title": "복잡한 조건문 단순화",
                        "description": "조건문이 너무 복잡합니다",
                        "severity": "low",
                        "effort": "easy",
                        "impact": "medium",
                        "before_code": "if complex_condition_with_many_operators:",
                        "after_code": "is_valid = check_validity()\\nif is_valid:",
                        "reasoning": "복잡한 조건문은 이해하기 어렵고 오류가 발생하기 쉽습니다",
                        "resources": ["https://refactoring.guru/decompose-conditional"]
                    })
        
        return suggestions
    
    def _suggest_maintainability_improvements(self, ast_tree: ast.AST) -> List[Dict[str, Any]]:
        """유지보수성 개선 제안"""
        suggestions = []
        
        # 매직 넘버 탐지
        magic_numbers = []
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                if node.value not in [0, 1, -1, 2, 10, 100]:
                    magic_numbers.append(node.value)
        
        if len(magic_numbers) > 3:
            suggestions.append({
                "type": ImprovementType.MAINTAINABILITY.value,
                "title": "매직 넘버 제거",
                "description": "의미를 알 수 없는 숫자가 코드에 직접 사용되고 있습니다",
                "severity": "low",
                "effort": "easy",
                "impact": "medium",
                "before_code": f"numbers like {magic_numbers[0]}, {magic_numbers[1]}...",
                "after_code": "MAX_RETRY_COUNT = 3\\nTIMEOUT_SECONDS = 30",
                "reasoning": "매직 넘버는 코드의 의미를 불명확하게 만들고 수정을 어렵게 합니다",
                "resources": ["https://refactoring.guru/replace-magic-number-with-symbolic-constant"]
            })
        
        # 중복 코드 탐지 (간단한 버전)
        function_bodies = []
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                body_text = ast.unparse(node)
                function_bodies.append((node.name, body_text))
        
        # 유사한 함수 체크 (간단한 해시 기반)
        similar_functions = []
        for i, (name1, body1) in enumerate(function_bodies):
            for name2, body2 in function_bodies[i+1:]:
                similarity = self._calculate_similarity(body1, body2)
                if similarity > 0.8:
                    similar_functions.append((name1, name2))
        
        if similar_functions:
            suggestions.append({
                "type": ImprovementType.MAINTAINABILITY.value,
                "title": "중복 코드 제거",
                "description": f"유사한 함수들이 발견되었습니다: {similar_functions[0]}",
                "severity": "medium",
                "effort": "moderate",
                "impact": "high",
                "before_code": f"Similar functions: {similar_functions[0][0]}, {similar_functions[0][1]}",
                "after_code": "# 공통 기능을 별도 함수로 추출",
                "reasoning": "중복 코드는 유지보수 비용을 증가시키고 일관성 문제를 야기합니다",
                "resources": ["https://refactoring.guru/extract-method"]
            })
        
        return suggestions
    
    def _suggest_security_improvements(self, ast_tree: ast.AST) -> List[Dict[str, Any]]:
        """보안 개선 제안"""
        suggestions = []
        
        # SQL 인젝션 위험
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in ['execute', 'executemany']:
                    # 문자열 포매팅을 사용한 SQL 쿼리 탐지
                    for arg in node.args:
                        if isinstance(arg, ast.JoinedStr) or isinstance(arg, ast.BinOp):
                            suggestions.append({
                                "type": ImprovementType.SECURITY.value,
                                "title": "SQL 인젝션 방지",
                                "description": "동적 SQL 쿼리 구성이 보안 위험을 초래할 수 있습니다",
                                "severity": "high",
                                "effort": "easy",
                                "impact": "critical",
                                "before_code": "cursor.execute(f\"SELECT * FROM users WHERE id = {user_id}\")",
                                "after_code": "cursor.execute(\"SELECT * FROM users WHERE id = ?\", (user_id,))",
                                "reasoning": "동적 쿼리는 SQL 인젝션 공격에 취약합니다",
                                "resources": ["https://owasp.org/www-community/attacks/SQL_Injection"]
                            })
        
        # eval/exec 사용 탐지
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in ['eval', 'exec']:
                    suggestions.append({
                        "type": ImprovementType.SECURITY.value,
                        "title": "위험한 함수 사용",
                        "description": f"{node.func.id} 함수 사용은 보안 위험을 초래합니다",
                        "severity": "critical",
                        "effort": "moderate",
                        "impact": "critical",
                        "before_code": f"{node.func.id}(user_input)",
                        "after_code": "# 안전한 대안 메서드 사용",
                        "reasoning": "eval/exec은 임의 코드 실행을 허용하여 매우 위험합니다",
                        "resources": ["https://docs.python.org/3/library/functions.html#eval"]
                    })
        
        return suggestions
    
    def _suggest_text_based_improvements(self, code: str) -> List[Dict[str, Any]]:
        """텍스트 기반 개선 제안"""
        suggestions = []
        
        lines = code.split('\n')
        
        # 긴 라인 탐지
        long_lines = [(i+1, line) for i, line in enumerate(lines) if len(line) > 100]
        if len(long_lines) > 3:
            suggestions.append({
                "type": ImprovementType.READABILITY.value,
                "title": "긴 라인 분할",
                "description": f"{len(long_lines)}개의 긴 라인이 발견되었습니다",
                "severity": "low",
                "effort": "easy",
                "impact": "low",
                "before_code": f"Line {long_lines[0][0]}: {long_lines[0][1][:50]}...",
                "after_code": "# 라인을 적절히 분할",
                "reasoning": "긴 라인은 가독성을 저해합니다",
                "resources": ["https://pep8.org/#maximum-line-length"]
            })
        
        # 주석 부족 탐지
        comment_lines = sum(1 for line in lines if line.strip().startswith('#'))
        code_lines = len([line for line in lines if line.strip() and not line.strip().startswith('#')])
        
        if code_lines > 50 and comment_lines / code_lines < 0.1:
            suggestions.append({
                "type": ImprovementType.READABILITY.value,
                "title": "주석 추가",
                "description": "코드에 충분한 주석이 없습니다",
                "severity": "low",
                "effort": "easy",
                "impact": "medium",
                "before_code": "# 주석 비율이 낮음",
                "after_code": "# 복잡한 로직에 설명 주석 추가",
                "reasoning": "주석은 코드의 이해를 돕고 유지보수를 용이하게 합니다",
                "resources": ["https://pep8.org/#comments"]
            })
        
        return suggestions
    
    def _count_boolean_operators(self, node: ast.expr) -> int:
        """불린 연산자 개수 계산"""
        count = 0
        for child in ast.walk(node):
            if isinstance(child, (ast.And, ast.Or, ast.Not)):
                count += 1
        return count
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """텍스트 유사도 계산 (간단한 버전)"""
        words1 = set(text1.split())
        words2 = set(text2.split())
        
        if not words1 and not words2:
            return 1.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0.0


class CodeExplainer:
    """코드 설명기"""
    
    def explain(self, code: str, ast_tree: Optional[ast.AST]) -> Dict[str, Any]:
        """코드 설명 생성"""
        if ast_tree is None:
            return self._explain_text_based(code)
        
        explanation = {
            "summary": self._generate_summary(code, ast_tree),
            "detailed_explanation": self._generate_detailed_explanation(ast_tree),
            "key_concepts": self._identify_key_concepts(ast_tree),
            "step_by_step": self._generate_step_by_step(ast_tree),
            "complexity_explanation": self._explain_complexity(ast_tree),
            "potential_issues": self._identify_potential_issues(ast_tree),
            "learning_resources": self._suggest_learning_resources(ast_tree)
        }
        
        return explanation
    
    def _generate_summary(self, code: str, ast_tree: ast.AST) -> str:
        """코드 요약 생성"""
        elements = []
        
        # 함수 개수
        functions = [node for node in ast.walk(ast_tree) if isinstance(node, ast.FunctionDef)]
        if functions:
            elements.append(f"{len(functions)}개의 함수")
        
        # 클래스 개수
        classes = [node for node in ast.walk(ast_tree) if isinstance(node, ast.ClassDef)]
        if classes:
            elements.append(f"{len(classes)}개의 클래스")
        
        # Import 개수
        imports = [node for node in ast.walk(ast_tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
        if imports:
            elements.append(f"{len(imports)}개의 import문")
        
        # 복잡도 추정
        complexity_nodes = [node for node in ast.walk(ast_tree) 
                          if isinstance(node, (ast.If, ast.For, ast.While, ast.Try))]
        
        if len(complexity_nodes) > 10:
            complexity = "복잡한"
        elif len(complexity_nodes) > 5:
            complexity = "중간 복잡도의"
        else:
            complexity = "단순한"
        
        if elements:
            return f"{complexity} 코드로, {', '.join(elements)}를 포함합니다."
        else:
            return f"{complexity} 코드입니다."
    
    def _generate_detailed_explanation(self, ast_tree: ast.AST) -> str:
        """상세 설명 생성"""
        explanations = []
        
        # 주요 구성요소 설명
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.ClassDef):
                methods = [item.name for item in node.body if isinstance(item, ast.FunctionDef)]
                explanations.append(
                    f"클래스 '{node.name}'는 {len(methods)}개의 메서드를 가지며, "
                    f"주요 메서드로는 {', '.join(methods[:3])}가 있습니다."
                )
            elif isinstance(node, ast.FunctionDef):
                param_count = len(node.args.args)
                explanations.append(
                    f"함수 '{node.name}'는 {param_count}개의 매개변수를 받습니다."
                )
        
        return " ".join(explanations[:5])  # 최대 5개 설명
    
    def _identify_key_concepts(self, ast_tree: ast.AST) -> List[str]:
        """핵심 개념 식별"""
        concepts = set()
        
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                concepts.add("함수 정의")
                if isinstance(node, ast.AsyncFunctionDef):
                    concepts.add("비동기 프로그래밍")
                if node.decorator_list:
                    concepts.add("데코레이터")
            elif isinstance(node, ast.ClassDef):
                concepts.add("클래스 정의")
                if node.bases:
                    concepts.add("상속")
            elif isinstance(node, ast.Try):
                concepts.add("예외 처리")
            elif isinstance(node, ast.With):
                concepts.add("컨텍스트 매니저")
            elif isinstance(node, ast.comprehension):
                concepts.add("리스트 컴프리헨션")
            elif isinstance(node, ast.Lambda):
                concepts.add("람다 함수")
            elif isinstance(node, ast.Yield):
                concepts.add("제너레이터")
        
        return sorted(list(concepts))
    
    def _generate_step_by_step(self, ast_tree: ast.AST) -> List[str]:
        """단계별 설명 생성"""
        steps = []
        
        # 최상위 요소들을 순서대로 설명
        for i, node in enumerate(ast_tree.body[:5]):  # 최대 5개
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
                steps.append(f"단계 {i+1}: {', '.join(modules)} 모듈을 가져옵니다")
            elif isinstance(node, ast.ImportFrom):
                steps.append(f"단계 {i+1}: {node.module}에서 필요한 요소들을 가져옵니다")
            elif isinstance(node, ast.ClassDef):
                steps.append(f"단계 {i+1}: '{node.name}' 클래스를 정의합니다")
            elif isinstance(node, ast.FunctionDef):
                steps.append(f"단계 {i+1}: '{node.name}' 함수를 정의합니다")
            elif isinstance(node, ast.Assign):
                if isinstance(node.targets[0], ast.Name):
                    steps.append(f"단계 {i+1}: '{node.targets[0].id}' 변수를 설정합니다")
        
        return steps
    
    def _explain_complexity(self, ast_tree: ast.AST) -> str:
        """복잡도 설명"""
        # 복잡도 요소 계산
        control_structures = len([node for node in ast.walk(ast_tree) 
                                if isinstance(node, (ast.If, ast.For, ast.While))])
        nesting_levels = self._calculate_max_nesting(ast_tree)
        
        if control_structures > 15:
            return f"높은 복잡도: {control_structures}개의 제어 구조와 최대 {nesting_levels}단계 중첩을 가집니다. 이해하기 어려울 수 있습니다."
        elif control_structures > 8:
            return f"중간 복잡도: {control_structures}개의 제어 구조를 가집니다. 적절한 수준의 복잡도입니다."
        else:
            return f"낮은 복잡도: {control_structures}개의 제어 구조를 가집니다. 이해하기 쉬운 코드입니다."
    
    def _calculate_max_nesting(self, ast_tree: ast.AST) -> int:
        """최대 중첩 레벨 계산"""
        max_depth = 0
        
        def calculate_depth(node, current_depth=0):
            nonlocal max_depth
            max_depth = max(max_depth, current_depth)
            
            if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.Try)):
                current_depth += 1
            
            for child in ast.iter_child_nodes(node):
                calculate_depth(child, current_depth)
        
        calculate_depth(ast_tree)
        return max_depth
    
    def _identify_potential_issues(self, ast_tree: ast.AST) -> List[str]:
        """잠재적 문제 식별"""
        issues = []
        
        # 깊은 중첩
        max_nesting = self._calculate_max_nesting(ast_tree)
        if max_nesting > 4:
            issues.append(f"중첩이 너무 깊습니다 ({max_nesting}단계). 코드 분해를 고려해보세요.")
        
        # 긴 함수
        for node in ast.walk(ast_tree):
            if isinstance(node, ast.FunctionDef):
                line_count = getattr(node, 'end_lineno', node.lineno) - node.lineno
                if line_count > 50:
                    issues.append(f"함수 '{node.name}'이 너무 깁니다 ({line_count}줄). 분해를 고려해보세요.")
        
        # 예외 처리 부족
        try_blocks = len([node for node in ast.walk(ast_tree) if isinstance(node, ast.Try)])
        risky_calls = len([node for node in ast.walk(ast_tree) 
                          if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) 
                          and node.func.id in ['open', 'int', 'float']])
        
        if risky_calls > 3 and try_blocks == 0:
            issues.append("예외가 발생할 수 있는 연산들이 있지만 예외 처리가 없습니다.")
        
        return issues
    
    def _suggest_learning_resources(self, ast_tree: ast.AST) -> List[str]:
        """학습 리소스 제안"""
        resources = []
        concepts = self._identify_key_concepts(ast_tree)
        
        resource_map = {
            "함수 정의": "https://docs.python.org/3/tutorial/controlflow.html#defining-functions",
            "클래스 정의": "https://docs.python.org/3/tutorial/classes.html",
            "상속": "https://docs.python.org/3/tutorial/classes.html#inheritance",
            "예외 처리": "https://docs.python.org/3/tutorial/errors.html",
            "데코레이터": "https://docs.python.org/3/glossary.html#term-decorator",
            "비동기 프로그래밍": "https://docs.python.org/3/library/asyncio.html",
            "컨텍스트 매니저": "https://docs.python.org/3/reference/datamodel.html#context-managers",
            "리스트 컴프리헨션": "https://docs.python.org/3/tutorial/datastructures.html#list-comprehensions",
            "제너레이터": "https://docs.python.org/3/tutorial/classes.html#generators"
        }
        
        for concept in concepts:
            if concept in resource_map:
                resources.append(resource_map[concept])
        
        return resources[:5]  # 최대 5개
    
    def _explain_text_based(self, code: str) -> Dict[str, Any]:
        """텍스트 기반 설명"""
        lines = code.split('\n')
        code_lines = [line for line in lines if line.strip() and not line.strip().startswith('#')]
        
        return {
            "summary": f"{len(code_lines)}줄의 코드입니다.",
            "detailed_explanation": "AST 분석을 사용할 수 없어 상세 분석이 제한됩니다.",
            "key_concepts": ["텍스트 분석"],
            "step_by_step": ["코드를 라인별로 확인하세요"],
            "complexity_explanation": "복잡도 분석을 위해서는 올바른 구문이 필요합니다.",
            "potential_issues": ["구문 오류가 있을 수 있습니다"],
            "learning_resources": ["https://docs.python.org/3/tutorial/"]
        }


# 편의 함수들
def analyze_code_intelligence(code: str, file_path: Optional[str] = None) -> Dict[str, Any]:
    """코드 인텔리전스 분석 (편의 함수)"""
    engine = CodeIntelligenceEngine()
    return engine.analyze_code(code, file_path)

def extract_function_intent(function_code: str) -> Dict[str, Any]:
    """함수 의도 추출 (편의 함수)"""
    try:
        ast_tree = ast.parse(function_code)
        analyzer = IntentAnalyzer()
        return analyzer.analyze(function_code, ast_tree)
    except SyntaxError:
        return {"error": "Invalid Python syntax"}

def detect_code_patterns(code: str) -> List[Dict[str, Any]]:
    """코드 패턴 탐지 (편의 함수)"""
    try:
        ast_tree = ast.parse(code)
        engine = CodeIntelligenceEngine()
        return engine.detect_patterns(code, ast_tree)
    except SyntaxError:
        return []

def suggest_improvements(code: str) -> List[Dict[str, Any]]:
    """개선 제안 (편의 함수)"""
    try:
        ast_tree = ast.parse(code)
        suggester = ImprovementSuggester()
        return suggester.suggest(code, ast_tree)
    except SyntaxError:
        suggester = ImprovementSuggester()
        return suggester._suggest_text_based_improvements(code)

def explain_complex_code(code: str) -> Dict[str, Any]:
    """복잡한 코드 설명 (편의 함수)"""
    try:
        ast_tree = ast.parse(code)
        explainer = CodeExplainer()
        return explainer.explain(code, ast_tree)
    except SyntaxError:
        explainer = CodeExplainer()
        return explainer._explain_text_based(code)

def calculate_code_metrics(code: str) -> Dict[str, Any]:
    """코드 메트릭 계산 (편의 함수)"""
    try:
        ast_tree = ast.parse(code)
        calculator = CodeMetricsCalculator()
        return calculator.calculate(code, ast_tree)
    except SyntaxError:
        return {"error": "Invalid Python syntax"}

# 메인 실행 예제
if __name__ == "__main__":
    # 샘플 코드로 테스트
    sample_code = '''
def calculate_fibonacci(n):
    """Calculate fibonacci number"""
    if n <= 1:
        return n
    else:
        return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

class DataProcessor:
    def __init__(self):
        self.data = []
    
    def process_data(self, input_data):
        for item in input_data:
            if item > 0:
                self.data.append(item * 2)
        return self.data
'''
    
    print("=== Code Intelligence Analysis ===")
    result = analyze_code_intelligence(sample_code)
    
    print(f"Language: {result.get('language')}")
    print(f"Patterns found: {len(result.get('patterns', []))}")
    print(f"Improvements suggested: {len(result.get('improvements', []))}")
    print(f"Summary: {result.get('explanation', {}).get('summary', 'N/A')}")
 