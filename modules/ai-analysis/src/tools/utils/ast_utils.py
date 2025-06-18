#!/usr/bin/env python3
"""
Enhanced AST Analysis Utilities
고도화된 Python AST 기반 코드 분석 도구들

주요 개선사항:
- 타입 안정성 강화 (Pydantic 모델)
- 성능 최적화 (캐싱, 병렬 처리)
- 고급 분석 기능 (보안, 품질 메트릭, 패턴 탐지)
- 에러 처리 개선
- 확장성 향상 (플러그인 시스템)
"""

import ast
import sys
import hashlib
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from typing import List, Dict, Any, Optional, Union, Set, Tuple, Protocol, TypeVar
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache, wraps
import logging
from contextlib import contextmanager

# 서드파티 의존성 (선택적)
try:
    from pydantic import BaseModel, Field, validator
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False

try:
    import networkx as nx
    NETWORKX_AVAILABLE = True
except ImportError:
    NETWORKX_AVAILABLE = False

# 로깅 설정
logger = logging.getLogger(__name__)

# 타입 정의
T = TypeVar('T')


class AnalysisError(Exception):
    """분석 관련 예외"""
    pass


class SecurityIssueType(Enum):
    """보안 이슈 유형"""
    HARDCODED_SECRET = "hardcoded_secret"
    SQL_INJECTION = "sql_injection"
    EVAL_USAGE = "eval_usage"
    EXEC_USAGE = "exec_usage"
    SHELL_INJECTION = "shell_injection"
    UNSAFE_PICKLE = "unsafe_pickle"
    WEAK_CRYPTO = "weak_crypto"


class CodeQualityMetric(Enum):
    """코드 품질 메트릭"""
    CYCLOMATIC_COMPLEXITY = "cyclomatic_complexity"
    COGNITIVE_COMPLEXITY = "cognitive_complexity"
    HALSTEAD_COMPLEXITY = "halstead_complexity"
    MAINTAINABILITY_INDEX = "maintainability_index"
    TECHNICAL_DEBT = "technical_debt"


if PYDANTIC_AVAILABLE:
    class SecurityIssue(BaseModel):
        """보안 이슈 정보"""
        type: SecurityIssueType
        severity: str = Field(..., regex="^(low|medium|high|critical)$")
        line: int = Field(..., ge=1)
        column: int = Field(..., ge=0)
        message: str
        context: Optional[str] = None
        remediation: Optional[str] = None

    class FunctionInfo(BaseModel):
        """함수 정보"""
        name: str
        parameters: List[Dict[str, Any]] = Field(default_factory=list)
        return_annotation: Optional[str] = None
        docstring: Optional[str] = None
        line_start: int = Field(..., ge=1)
        line_end: int = Field(..., ge=1)
        complexity: int = Field(..., ge=1)
        is_method: bool = False
        is_async: bool = False
        is_generator: bool = False
        decorators: List[str] = Field(default_factory=list)
        calls_made: List[str] = Field(default_factory=list)
        variables_used: List[str] = Field(default_factory=list)

    class ClassInfo(BaseModel):
        """클래스 정보"""
        name: str
        bases: List[str] = Field(default_factory=list)
        metaclass: Optional[str] = None
        docstring: Optional[str] = None
        line_start: int = Field(..., ge=1)
        line_end: int = Field(..., ge=1)
        methods: List[str] = Field(default_factory=list)
        class_variables: List[str] = Field(default_factory=list)
        instance_variables: List[str] = Field(default_factory=list)
        is_abstract: bool = False
        design_patterns: List[str] = Field(default_factory=list)

    class ImportInfo(BaseModel):
        """Import 정보"""
        type: str = Field(..., regex="^(import|from_import|relative_import)$")
        module: str
        name: Optional[str] = None
        alias: Optional[str] = None
        line: int = Field(..., ge=1)
        is_standard_library: bool = False
        is_third_party: bool = False
        is_local: bool = False

    class AnalysisResult(BaseModel):
        """종합 분석 결과"""
        file_path: str
        file_hash: str
        analysis_time: float
        functions: List[FunctionInfo] = Field(default_factory=list)
        classes: List[ClassInfo] = Field(default_factory=list)
        imports: List[ImportInfo] = Field(default_factory=list)
        variables: List[Dict[str, Any]] = Field(default_factory=list)
        constants: List[Dict[str, Any]] = Field(default_factory=list)
        security_issues: List[SecurityIssue] = Field(default_factory=list)
        quality_metrics: Dict[str, Any] = Field(default_factory=dict)
        complexity_score: int = Field(..., ge=0)
        line_count: int = Field(..., ge=0)
        maintainability_score: float = Field(..., ge=0.0, le=100.0)
        test_coverage_estimate: float = Field(default=0.0, ge=0.0, le=100.0)

else:
    # Pydantic이 없을 때의 fallback 클래스들
    @dataclass
    class SecurityIssue:
        type: SecurityIssueType
        severity: str
        line: int
        column: int
        message: str
        context: Optional[str] = None
        remediation: Optional[str] = None

    @dataclass
    class FunctionInfo:
        name: str
        parameters: List[Dict[str, Any]] = field(default_factory=list)
        return_annotation: Optional[str] = None
        docstring: Optional[str] = None
        line_start: int = 0
        line_end: int = 0
        complexity: int = 1
        is_method: bool = False
        is_async: bool = False
        is_generator: bool = False
        decorators: List[str] = field(default_factory=list)
        calls_made: List[str] = field(default_factory=list)
        variables_used: List[str] = field(default_factory=list)

    @dataclass
    class ClassInfo:
        name: str
        bases: List[str] = field(default_factory=list)
        metaclass: Optional[str] = None
        docstring: Optional[str] = None
        line_start: int = 0
        line_end: int = 0
        methods: List[str] = field(default_factory=list)
        class_variables: List[str] = field(default_factory=list)
        instance_variables: List[str] = field(default_factory=list)
        is_abstract: bool = False
        design_patterns: List[str] = field(default_factory=list)

    @dataclass
    class ImportInfo:
        type: str
        module: str
        name: Optional[str] = None
        alias: Optional[str] = None
        line: int = 0
        is_standard_library: bool = False
        is_third_party: bool = False
        is_local: bool = False

    @dataclass
    class AnalysisResult:
        file_path: str
        file_hash: str
        analysis_time: float
        functions: List[FunctionInfo] = field(default_factory=list)
        classes: List[ClassInfo] = field(default_factory=list)
        imports: List[ImportInfo] = field(default_factory=list)
        variables: List[Dict[str, Any]] = field(default_factory=list)
        constants: List[Dict[str, Any]] = field(default_factory=list)
        security_issues: List[SecurityIssue] = field(default_factory=list)
        quality_metrics: Dict[str, Any] = field(default_factory=dict)
        complexity_score: int = 0
        line_count: int = 0
        maintainability_score: float = 0.0
        test_coverage_estimate: float = 0.0


class AnalysisPlugin(Protocol):
    """분석 플러그인 프로토콜"""
    
    def analyze(self, tree: ast.AST, source_lines: List[str]) -> Dict[str, Any]:
        """분석 실행"""
        ...
    
    def get_name(self) -> str:
        """플러그인 이름 반환"""
        ...


class AnalysisCache:
    """분석 결과 캐시"""
    
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._cache: Dict[str, AnalysisResult] = {}
        self._access_times: Dict[str, float] = {}
    
    def get(self, file_hash: str) -> Optional[AnalysisResult]:
        """캐시에서 분석 결과 조회"""
        if file_hash in self._cache:
            self._access_times[file_hash] = time.time()
            return self._cache[file_hash]
        return None
    
    def set(self, file_hash: str, result: AnalysisResult) -> None:
        """캐시에 분석 결과 저장"""
        if len(self._cache) >= self.max_size:
            self._evict_lru()
        
        self._cache[file_hash] = result
        self._access_times[file_hash] = time.time()
    
    def _evict_lru(self) -> None:
        """LRU 알고리즘으로 캐시 항목 제거"""
        if not self._access_times:
            return
        
        lru_key = min(self._access_times.keys(), key=lambda k: self._access_times[k])
        del self._cache[lru_key]
        del self._access_times[lru_key]
    
    def clear(self) -> None:
        """캐시 전체 삭제"""
        self._cache.clear()
        self._access_times.clear()


class SecurityAnalyzer:
    """보안 분석기"""
    
    def __init__(self):
        self.security_patterns = {
            SecurityIssueType.HARDCODED_SECRET: [
                r'password\s*=\s*["\'][^"\']+["\']',
                r'api_key\s*=\s*["\'][^"\']+["\']',
                r'secret\s*=\s*["\'][^"\']+["\']',
                r'token\s*=\s*["\'][^"\']+["\']',
            ],
            SecurityIssueType.SQL_INJECTION: [
                r'execute\s*\(\s*["\'].*%.*["\']',
                r'query\s*\(\s*["\'].*\+.*["\']',
            ],
        }
        
        self.dangerous_functions = {
            'eval': SecurityIssueType.EVAL_USAGE,
            'exec': SecurityIssueType.EXEC_USAGE,
            'compile': SecurityIssueType.EVAL_USAGE,
            'subprocess.call': SecurityIssueType.SHELL_INJECTION,
            'os.system': SecurityIssueType.SHELL_INJECTION,
            'pickle.loads': SecurityIssueType.UNSAFE_PICKLE,
        }
    
    def analyze(self, tree: ast.AST, source_lines: List[str]) -> List[SecurityIssue]:
        """보안 분석 실행"""
        issues = []
        
        for node in ast.walk(tree):
            # 위험한 함수 호출 체크
            if isinstance(node, ast.Call):
                func_name = self._get_function_name(node.func)
                if func_name in self.dangerous_functions:
                    issue_type = self.dangerous_functions[func_name]
                    issues.append(SecurityIssue(
                        type=issue_type,
                        severity=self._get_severity(issue_type),
                        line=node.lineno,
                        column=node.col_offset,
                        message=f"Dangerous function call: {func_name}",
                        context=source_lines[node.lineno - 1].strip() if node.lineno <= len(source_lines) else None,
                        remediation=self._get_remediation(issue_type)
                    ))
            
            # 하드코딩된 문자열 체크
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                if self._looks_like_secret(node.value):
                    issues.append(SecurityIssue(
                        type=SecurityIssueType.HARDCODED_SECRET,
                        severity="high",
                        line=node.lineno,
                        column=node.col_offset,
                        message="Potential hardcoded secret detected",
                        context=source_lines[node.lineno - 1].strip() if node.lineno <= len(source_lines) else None,
                        remediation="Move secrets to environment variables or secure configuration"
                    ))
        
        return issues
    
    def _get_function_name(self, node: ast.AST) -> str:
        """함수 호출 노드에서 함수 이름 추출"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            base = self._get_function_name(node.value)
            return f"{base}.{node.attr}"
        return ""
    
    def _looks_like_secret(self, value: str) -> bool:
        """문자열이 시크릿처럼 보이는지 확인"""
        if len(value) < 8:
            return False
        
        # API 키 패턴들
        secret_patterns = [
            r'^sk-[a-zA-Z0-9]{48}$',  # OpenAI API key
            r'^sk-ant-api\d{2}-[a-zA-Z0-9\-_]{95}$',  # Anthropic API key
            r'^[a-fA-F0-9]{32}$',  # MD5-like hex
            r'^[a-zA-Z0-9]{20,}$',  # Long alphanumeric strings
        ]
        
        import re
        for pattern in secret_patterns:
            if re.match(pattern, value):
                return True
        
        return False
    
    def _get_severity(self, issue_type: SecurityIssueType) -> str:
        """이슈 유형에 따른 심각도 반환"""
        severity_map = {
            SecurityIssueType.HARDCODED_SECRET: "high",
            SecurityIssueType.SQL_INJECTION: "critical",
            SecurityIssueType.EVAL_USAGE: "high",
            SecurityIssueType.EXEC_USAGE: "high",
            SecurityIssueType.SHELL_INJECTION: "critical",
            SecurityIssueType.UNSAFE_PICKLE: "medium",
            SecurityIssueType.WEAK_CRYPTO: "medium",
        }
        return severity_map.get(issue_type, "medium")
    
    def _get_remediation(self, issue_type: SecurityIssueType) -> str:
        """이슈 유형에 따른 해결 방안 제안"""
        remediation_map = {
            SecurityIssueType.HARDCODED_SECRET: "Use environment variables or secure configuration management",
            SecurityIssueType.SQL_INJECTION: "Use parameterized queries or ORM",
            SecurityIssueType.EVAL_USAGE: "Avoid eval() - use safer alternatives like ast.literal_eval()",
            SecurityIssueType.EXEC_USAGE: "Avoid exec() - restructure code to avoid dynamic execution",
            SecurityIssueType.SHELL_INJECTION: "Use subprocess with shell=False and validate inputs",
            SecurityIssueType.UNSAFE_PICKLE: "Use safer serialization formats like JSON",
            SecurityIssueType.WEAK_CRYPTO: "Use strong cryptographic libraries and algorithms",
        }
        return remediation_map.get(issue_type, "Review and apply security best practices")


class QualityAnalyzer:
    """코드 품질 분석기"""
    
    def analyze(self, tree: ast.AST, source_lines: List[str]) -> Dict[str, Any]:
        """품질 메트릭 분석"""
        metrics = {}
        
        # 사이클로매틱 복잡도
        metrics['cyclomatic_complexity'] = self._calculate_cyclomatic_complexity(tree)
        
        # 인지적 복잡도
        metrics['cognitive_complexity'] = self._calculate_cognitive_complexity(tree)
        
        # 할스테드 복잡도
        metrics['halstead_metrics'] = self._calculate_halstead_metrics(tree)
        
        # 유지보수성 지수
        metrics['maintainability_index'] = self._calculate_maintainability_index(
            metrics['cyclomatic_complexity'],
            metrics['halstead_metrics']['volume'],
            len(source_lines)
        )
        
        # 중복도
        metrics['duplication_ratio'] = self._calculate_duplication_ratio(source_lines)
        
        # 테스트 커버리지 추정
        metrics['test_coverage_estimate'] = self._estimate_test_coverage(tree)
        
        return metrics
    
    def _calculate_cyclomatic_complexity(self, tree: ast.AST) -> int:
        """사이클로매틱 복잡도 계산"""
        complexity = 1
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(node, ast.ExceptHandler):
                complexity += 1
            elif isinstance(node, (ast.And, ast.Or)):
                complexity += 1
            elif isinstance(node, ast.comprehension):
                complexity += 1
        
        return complexity
    
    def _calculate_cognitive_complexity(self, tree: ast.AST) -> int:
        """인지적 복잡도 계산 (더 정확한 복잡도 측정)"""
        complexity = 0
        nesting_level = 0
        
        class CognitiveComplexityVisitor(ast.NodeVisitor):
            def __init__(self):
                self.complexity = 0
                self.nesting_level = 0
            
            def visit_If(self, node):
                self.complexity += 1 + self.nesting_level
                self.nesting_level += 1
                self.generic_visit(node)
                self.nesting_level -= 1
            
            def visit_While(self, node):
                self.complexity += 1 + self.nesting_level
                self.nesting_level += 1
                self.generic_visit(node)
                self.nesting_level -= 1
            
            def visit_For(self, node):
                self.complexity += 1 + self.nesting_level
                self.nesting_level += 1
                self.generic_visit(node)
                self.nesting_level -= 1
        
        visitor = CognitiveComplexityVisitor()
        visitor.visit(tree)
        
        return visitor.complexity
    
    def _calculate_halstead_metrics(self, tree: ast.AST) -> Dict[str, float]:
        """할스테드 복잡도 메트릭 계산"""
        operators = set()
        operands = set()
        operator_count = 0
        operand_count = 0
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)):
                operators.add(type(node).__name__)
                operator_count += 1
            elif isinstance(node, (ast.And, ast.Or, ast.Not)):
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
        
        vocabulary = n1 + n2
        length = N1 + N2
        
        if n2 == 0:
            volume = 0
            difficulty = 0
            effort = 0
        else:
            import math
            volume = length * math.log2(vocabulary) if vocabulary > 0 else 0
            difficulty = (n1 / 2) * (N2 / n2) if n2 > 0 else 0
            effort = difficulty * volume
        
        return {
            'vocabulary': vocabulary,
            'length': length,
            'volume': volume,
            'difficulty': difficulty,
            'effort': effort
        }
    
    def _calculate_maintainability_index(self, cyclomatic: int, halstead_volume: float, loc: int) -> float:
        """유지보수성 지수 계산"""
        import math
        
        if loc == 0 or halstead_volume == 0:
            return 0.0
        
        # Microsoft의 유지보수성 지수 공식
        mi = 171 - 5.2 * math.log(halstead_volume) - 0.23 * cyclomatic - 16.2 * math.log(loc)
        
        # 0-100 범위로 정규화
        return max(0.0, min(100.0, mi))
    
    def _calculate_duplication_ratio(self, source_lines: List[str]) -> float:
        """코드 중복도 계산 (단순한 라인 기반)"""
        if not source_lines:
            return 0.0
        
        # 빈 줄과 주석 제거
        cleaned_lines = []
        for line in source_lines:
            stripped = line.strip()
            if stripped and not stripped.startswith('#'):
                cleaned_lines.append(stripped)
        
        if len(cleaned_lines) < 2:
            return 0.0
        
        # 중복 라인 수 계산
        unique_lines = set(cleaned_lines)
        duplication_ratio = (len(cleaned_lines) - len(unique_lines)) / len(cleaned_lines)
        
        return duplication_ratio * 100
    
    def _estimate_test_coverage(self, tree: ast.AST) -> float:
        """테스트 커버리지 추정 (휴리스틱 기반)"""
        test_indicators = 0
        total_functions = 0
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                total_functions += 1
                
                # 테스트 함수인지 확인
                if node.name.startswith('test_') or 'test' in node.name.lower():
                    test_indicators += 1
                
                # assert 문이 있는지 확인
                for child in ast.walk(node):
                    if isinstance(child, ast.Assert):
                        test_indicators += 0.5
                        break
        
        if total_functions == 0:
            return 0.0
        
        # 간단한 추정식
        coverage_estimate = min(100.0, (test_indicators / total_functions) * 50)
        return coverage_estimate


class PatternDetector:
    """디자인 패턴 탐지기"""
    
    def detect_patterns(self, tree: ast.AST) -> List[str]:
        """코드에서 디자인 패턴 탐지"""
        patterns = []
        
        # 싱글톤 패턴 탐지
        if self._detect_singleton(tree):
            patterns.append("Singleton")
        
        # 팩토리 패턴 탐지
        if self._detect_factory(tree):
            patterns.append("Factory")
        
        # 옵서버 패턴 탐지
        if self._detect_observer(tree):
            patterns.append("Observer")
        
        # 데코레이터 패턴 탐지
        if self._detect_decorator_pattern(tree):
            patterns.append("Decorator")
        
        return patterns
    
    def _detect_singleton(self, tree: ast.AST) -> bool:
        """싱글톤 패턴 탐지"""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # __new__ 메서드 확인
                for method in node.body:
                    if (isinstance(method, ast.FunctionDef) and 
                        method.name == '__new__'):
                        return True
        return False
    
    def _detect_factory(self, tree: ast.AST) -> bool:
        """팩토리 패턴 탐지"""
        factory_indicators = ['create', 'build', 'make', 'factory']
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if any(indicator in node.name.lower() for indicator in factory_indicators):
                    # 클래스 인스턴스를 반환하는지 확인
                    for child in ast.walk(node):
                        if isinstance(child, ast.Return) and isinstance(child.value, ast.Call):
                            return True
        return False
    
    def _detect_observer(self, tree: ast.AST) -> bool:
        """옵서버 패턴 탐지"""
        observer_methods = ['notify', 'update', 'subscribe', 'unsubscribe']
        
        method_count = 0
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if any(method in node.name.lower() for method in observer_methods):
                    method_count += 1
        
        return method_count >= 2
    
    def _detect_decorator_pattern(self, tree: ast.AST) -> bool:
        """데코레이터 패턴 탐지"""
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.decorator_list:
                    return True
        return False


class EnhancedASTAnalyzer:
    """고도화된 AST 분석기"""
    
    def __init__(self, 
                 enable_caching: bool = True,
                 enable_parallel: bool = True,
                 max_workers: int = 4,
                 cache_size: int = 1000):
        self.enable_caching = enable_caching
        self.enable_parallel = enable_parallel
        self.max_workers = max_workers
        
        self.cache = AnalysisCache(cache_size) if enable_caching else None
        self.security_analyzer = SecurityAnalyzer()
        self.quality_analyzer = QualityAnalyzer()
        self.pattern_detector = PatternDetector()
        self.plugins: List[AnalysisPlugin] = []
        
        # 표준 라이브러리 모듈 목록 (간소화)
        self.stdlib_modules = {
            'os', 'sys', 'json', 'time', 'datetime', 're', 'math', 'random',
            'collections', 'itertools', 'functools', 'pathlib', 'typing',
            'asyncio', 'threading', 'multiprocessing', 'subprocess'
        }
    
    def add_plugin(self, plugin: AnalysisPlugin) -> None:
        """분석 플러그인 추가"""
        self.plugins.append(plugin)
        logger.info(f"Added analysis plugin: {plugin.get_name()}")
    
    def analyze_file(self, 
                    file_path: Union[str, Path], 
                    content: Optional[str] = None,
                    include_security: bool = True,
                    include_quality: bool = True,
                    include_patterns: bool = True) -> AnalysisResult:
        """파일 분석 (동기 버전)"""
        file_path = Path(file_path)
        
        if content is None:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                raise AnalysisError(f"Failed to read file {file_path}: {e}")
        
        # 파일 해시 계산
        file_hash = self._calculate_file_hash(content)
        
        # 캐시 확인
        if self.cache:
            cached_result = self.cache.get(file_hash)
            if cached_result:
                logger.debug(f"Using cached analysis for {file_path}")
                return cached_result
        
        start_time = time.time()
        
        try:
            source_lines = content.splitlines()
            tree = ast.parse(content)
            
            result = self._perform_analysis(
                tree, source_lines, str(file_path), file_hash,
                include_security, include_quality, include_patterns
            )
            
            result.analysis_time = time.time() - start_time
            
            # 캐시에 저장
            if self.cache:
                self.cache.set(file_hash, result)
            
            logger.info(f"Analysis completed for {file_path} in {result.analysis_time:.2f}s")
            return result
            
        except SyntaxError as e:
            raise AnalysisError(f"Syntax error in {file_path}: {e}")
        except Exception as e:
            raise AnalysisError(f"Analysis failed for {file_path}: {e}")
    
    async def analyze_file_async(self, 
                                file_path: Union[str, Path], 
                                content: Optional[str] = None,
                                include_security: bool = True,
                                include_quality: bool = True,
                                include_patterns: bool = True) -> AnalysisResult:
        """파일 분석 (비동기 버전)"""
        loop = asyncio.get_event_loop()
        
        # CPU 집약적 작업을 별도 스레드에서 실행
        return await loop.run_in_executor(
            None, 
            self.analyze_file,
            file_path, content, include_security, include_quality, include_patterns
        )
    
    async def analyze_files_batch(self, 
                                 file_paths: List[Union[str, Path]],
                                 include_security: bool = True,
                                 include_quality: bool = True,
                                 include_patterns: bool = True) -> List[AnalysisResult]:
        """여러 파일 병렬 분석"""
        if not self.enable_parallel:
            # 순차 처리
            results = []
            for file_path in file_paths:
                try:
                    result = await self.analyze_file_async(
                        file_path, None, include_security, include_quality, include_patterns
                    )
                    results.append(result)
                except AnalysisError as e:
                    logger.error(f"Failed to analyze {file_path}: {e}")
                    continue
            return results
        
        # 병렬 처리
        semaphore = asyncio.Semaphore(self.max_workers)
        
        async def analyze_with_semaphore(file_path):
            async with semaphore:
                try:
                    return await self.analyze_file_async(
                        file_path, None, include_security, include_quality, include_patterns
                    )
                except AnalysisError as e:
                    logger.error(f"Failed to analyze {file_path}: {e}")
                    return None
        
        tasks = [analyze_with_semaphore(fp) for fp in file_paths]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        
        # None 결과 필터링
        return [r for r in results if r is not None]
    
    def _perform_analysis(self, 
                         tree: ast.AST, 
                         source_lines: List[str], 
                         file_path: str,
                         file_hash: str,
                         include_security: bool,
                         include_quality: bool,
                         include_patterns: bool) -> AnalysisResult:
        """실제 분석 수행"""
        visitor = EnhancedCodeVisitor(file_path, source_lines)
        visitor.visit(tree)
        
        # 보안 분석
        security_issues = []
        if include_security:
            security_issues = self.security_analyzer.analyze(tree, source_lines)
        
        # 품질 분석
        quality_metrics = {}
        maintainability_score = 0.0
        if include_quality:
            quality_metrics = self.quality_analyzer.analyze(tree, source_lines)
            maintainability_score = quality_metrics.get('maintainability_index', 0.0)
        
        # 패턴 탐지
        detected_patterns = []
        if include_patterns:
            detected_patterns = self.pattern_detector.detect_patterns(tree)
        
        # 클래스에 패턴 정보 추가
        for class_info in visitor.classes:
            class_info.design_patterns = detected_patterns
        
        # 플러그인 실행
        plugin_results = {}
        for plugin in self.plugins:
            try:
                plugin_result = plugin.analyze(tree, source_lines)
                plugin_results[plugin.get_name()] = plugin_result
            except Exception as e:
                logger.warning(f"Plugin {plugin.get_name()} failed: {e}")
        
        # 전체 복잡도 계산
        total_complexity = sum(func.complexity for func in visitor.functions)
        
        # 테스트 커버리지 추정
        test_coverage = quality_metrics.get('test_coverage_estimate', 0.0) if include_quality else 0.0
        
        return AnalysisResult(
            file_path=file_path,
            file_hash=file_hash,
            analysis_time=0.0,  # 호출자에서 설정
            functions=visitor.functions,
            classes=visitor.classes,
            imports=visitor.imports,
            variables=visitor.variables,
            constants=visitor.constants,
            security_issues=security_issues,
            quality_metrics={**quality_metrics, **plugin_results},
            complexity_score=total_complexity,
            line_count=len(source_lines),
            maintainability_score=maintainability_score,
            test_coverage_estimate=test_coverage
        )
    
    def _calculate_file_hash(self, content: str) -> str:
        """파일 내용의 해시 계산"""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def extract_api_contracts(self, tree: ast.AST) -> List[Dict[str, Any]]:
        """API 계약 정보 추출 (OpenAPI 스펙 생성용)"""
        contracts = []
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # 데코레이터에서 라우트 정보 추출
                route_info = self._extract_route_info(node)
                if route_info:
                    contract = {
                        'function_name': node.name,
                        'route': route_info,
                        'parameters': self._extract_parameters(node),
                        'return_type': self._extract_return_type(node),
                        'docstring': ast.get_docstring(node),
                        'line': node.lineno
                    }
                    contracts.append(contract)
        
        return contracts
    
    def _extract_route_info(self, node: ast.FunctionDef) -> Optional[Dict[str, Any]]:
        """함수에서 라우트 정보 추출"""
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call):
                if isinstance(decorator.func, ast.Attribute):
                    if decorator.func.attr in ['get', 'post', 'put', 'delete', 'patch']:
                        method = decorator.func.attr.upper()
                        path = None
                        
                        if decorator.args and isinstance(decorator.args[0], ast.Constant):
                            path = decorator.args[0].value
                        
                        return {'method': method, 'path': path}
        return None
    
    def _extract_parameters(self, node: ast.FunctionDef) -> List[Dict[str, Any]]:
        """함수 매개변수 정보 추출"""
        parameters = []
        
        for arg in node.args.args:
            param_info = {
                'name': arg.arg,
                'type': self._ast_to_string(arg.annotation) if arg.annotation else None,
                'required': True
            }
            parameters.append(param_info)
        
        # 기본값이 있는 매개변수들
        defaults = node.args.defaults
        if defaults:
            # 기본값이 있는 매개변수들을 선택사항으로 표시
            default_start = len(node.args.args) - len(defaults)
            for i in range(default_start, len(node.args.args)):
                parameters[i]['required'] = False
                parameters[i]['default'] = self._ast_to_string(defaults[i - default_start])
        
        return parameters
    
    def _extract_return_type(self, node: ast.FunctionDef) -> Optional[str]:
        """함수 반환 타입 추출"""
        if node.returns:
            return self._ast_to_string(node.returns)
        return None
    
    def generate_dependency_graph(self, analysis_results: List[AnalysisResult]) -> Optional[Any]:
        """의존성 그래프 생성"""
        if not NETWORKX_AVAILABLE:
            logger.warning("NetworkX not available, skipping dependency graph generation")
            return None
        
        graph = nx.DiGraph()
        
        # 모든 모듈을 노드로 추가
        for result in analysis_results:
            module_name = Path(result.file_path).stem
            graph.add_node(module_name, file_path=result.file_path)
        
        # 의존성을 엣지로 추가
        for result in analysis_results:
            source_module = Path(result.file_path).stem
            
            for import_info in result.imports:
                if import_info.is_local:
                    target_module = import_info.module
                    graph.add_edge(source_module, target_module)
        
        return graph
    
    def find_circular_dependencies(self, dependency_graph) -> List[List[str]]:
        """순환 의존성 탐지"""
        if not NETWORKX_AVAILABLE or dependency_graph is None:
            return []
        
        try:
            cycles = list(nx.simple_cycles(dependency_graph))
            return cycles
        except Exception as e:
            logger.error(f"Failed to detect circular dependencies: {e}")
            return []
    
    def suggest_refactoring(self, analysis_result: AnalysisResult) -> List[Dict[str, Any]]:
        """리팩토링 제안 생성"""
        suggestions = []
        
        # 복잡도가 높은 함수
        for func in analysis_result.functions:
            if func.complexity > 10:
                suggestions.append({
                    'type': 'high_complexity',
                    'target': f"Function '{func.name}'",
                    'line': func.line_start,
                    'message': f"Function has high complexity ({func.complexity}). Consider breaking it down.",
                    'priority': 'high' if func.complexity > 15 else 'medium'
                })
        
        # 긴 함수
        for func in analysis_result.functions:
            func_length = func.line_end - func.line_start
            if func_length > 50:
                suggestions.append({
                    'type': 'long_function',
                    'target': f"Function '{func.name}'",
                    'line': func.line_start,
                    'message': f"Function is too long ({func_length} lines). Consider extracting smaller functions.",
                    'priority': 'medium'
                })
        
        # 너무 많은 매개변수
        for func in analysis_result.functions:
            if len(func.parameters) > 5:
                suggestions.append({
                    'type': 'too_many_parameters',
                    'target': f"Function '{func.name}'",
                    'line': func.line_start,
                    'message': f"Function has too many parameters ({len(func.parameters)}). Consider using a parameter object.",
                    'priority': 'low'
                })
        
        # 코드 중복
        if analysis_result.quality_metrics.get('duplication_ratio', 0) > 20:
            suggestions.append({
                'type': 'code_duplication',
                'target': 'File',
                'line': 0,
                'message': f"High code duplication detected ({analysis_result.quality_metrics['duplication_ratio']:.1f}%). Consider extracting common code.",
                'priority': 'medium'
            })
        
        return suggestions
    
    def _ast_to_string(self, node: ast.AST) -> str:
        """AST 노드를 문자열로 변환"""
        try:
            return ast.unparse(node) if hasattr(ast, 'unparse') else str(node)
        except Exception:
            return str(node)


class EnhancedCodeVisitor(ast.NodeVisitor):
    """고도화된 AST 방문자 클래스"""
    
    def __init__(self, file_path: str, source_lines: List[str]):
        self.file_path = file_path
        self.source_lines = source_lines
        self.functions: List[FunctionInfo] = []
        self.classes: List[ClassInfo] = []
        self.imports: List[ImportInfo] = []
        self.variables: List[Dict[str, Any]] = []
        self.constants: List[Dict[str, Any]] = []
        self.current_class = None
        
        # 표준 라이브러리 모듈 (간소화)
        self.stdlib_modules = {
            'os', 'sys', 'json', 'time', 'datetime', 're', 'math', 'random',
            'collections', 'itertools', 'functools', 'pathlib', 'typing'
        }
    
    def visit_FunctionDef(self, node: ast.FunctionDef):
        """함수 정의 방문"""
        self._process_function(node, is_async=False)
        self.generic_visit(node)
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        """비동기 함수 정의 방문"""
        self._process_function(node, is_async=True)
        self.generic_visit(node)
    
    def visit_ClassDef(self, node: ast.ClassDef):
        """클래스 정의 방문"""
        old_class = self.current_class
        self.current_class = node.name
        
        # 메타클래스 추출
        metaclass = None
        for keyword in node.keywords:
            if keyword.arg == 'metaclass':
                metaclass = self._ast_to_string(keyword.value)
        
        # 추상 클래스 여부 확인
        is_abstract = self._is_abstract_class(node)
        
        # 클래스 변수와 인스턴스 변수 수집
        class_vars, instance_vars = self._collect_class_variables(node)
        
        # 메서드 수집
        methods = []
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append(item.name)
        
        class_info = ClassInfo(
            name=node.name,
            bases=[self._ast_to_string(base) for base in node.bases],
            metaclass=metaclass,
            docstring=ast.get_docstring(node),
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno),
            methods=methods,
            class_variables=class_vars,
            instance_variables=instance_vars,
            is_abstract=is_abstract,
            design_patterns=[]  # 나중에 채워짐
        )
        
        self.classes.append(class_info)
        self.generic_visit(node)
        self.current_class = old_class
    
    def visit_Import(self, node: ast.Import):
        """import 문 방문"""
        for alias in node.names:
            import_info = ImportInfo(
                type="import",
                module=alias.name,
                alias=alias.asname,
                line=node.lineno,
                is_standard_library=alias.name.split('.')[0] in self.stdlib_modules,
                is_third_party=self._is_third_party_module(alias.name),
                is_local=self._is_local_module(alias.name)
            )
            self.imports.append(import_info)
    
    def visit_ImportFrom(self, node: ast.ImportFrom):
        """from import 문 방문"""
        module = node.module or ""
        is_relative = node.level > 0
        
        import_type = "relative_import" if is_relative else "from_import"
        
        for alias in node.names:
            import_info = ImportInfo(
                type=import_type,
                module=module,
                name=alias.name,
                alias=alias.asname,
                line=node.lineno,
                is_standard_library=module.split('.')[0] in self.stdlib_modules if module else False,
                is_third_party=self._is_third_party_module(module) if module else False,
                is_local=self._is_local_module(module) or is_relative if module else is_relative
            )
            self.imports.append(import_info)
    
    def visit_Assign(self, node: ast.Assign):
        """변수 할당 방문"""
        for target in node.targets:
            if isinstance(target, ast.Name):
                var_info = {
                    "name": target.id,
                    "line": node.lineno,
                    "value": self._get_value_string(node.value),
                    "type": self._infer_type(node.value),
                    "scope": "class" if self.current_class else "module"
                }
                
                # 상수 판별
                if target.id.isupper():
                    self.constants.append(var_info)
                else:
                    self.variables.append(var_info)
    
    def _process_function(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef], is_async: bool):
        """함수 처리"""
        is_method = self.current_class is not None
        is_generator = self._is_generator_function(node)
        
        # 매개변수 정보 추출
        parameters = []
        for arg in node.args.args:
            param_info = {
                "name": arg.arg,
                "annotation": self._ast_to_string(arg.annotation) if arg.annotation else None,
                "default": None
            }
            parameters.append(param_info)
        
        # 기본값 추가
        defaults = node.args.defaults
        if defaults:
            default_start = len(parameters) - len(defaults)
            for i, default in enumerate(defaults):
                parameters[default_start + i]["default"] = self._ast_to_string(default)
        
        # 함수가 호출하는 다른 함수들
        calls_made = self._extract_function_calls(node)
        
        # 함수에서 사용하는 변수들
        variables_used = self._extract_variables_used(node)
        
        # 복잡도 계산
        complexity = self._calculate_function_complexity(node)
        
        func_info = FunctionInfo(
            name=node.name,
            parameters=parameters,
            return_annotation=self._ast_to_string(node.returns) if node.returns else None,
            docstring=ast.get_docstring(node),
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno),
            complexity=complexity,
            is_method=is_method,
            is_async=is_async,
            is_generator=is_generator,
            decorators=[self._ast_to_string(d) for d in node.decorator_list],
            calls_made=calls_made,
            variables_used=variables_used
        )
        
        self.functions.append(func_info)
    
    def _is_abstract_class(self, node: ast.ClassDef) -> bool:
        """추상 클래스 여부 확인"""
        # ABC를 상속하는지 확인
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id == 'ABC':
                return True
            elif isinstance(base, ast.Attribute) and base.attr == 'ABC':
                return True
        
        # @abstractmethod 데코레이터가 있는 메서드가 있는지 확인
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for decorator in item.decorator_list:
                    if isinstance(decorator, ast.Name) and decorator.id == 'abstractmethod':
                        return True
                    elif isinstance(decorator, ast.Attribute) and decorator.attr == 'abstractmethod':
                        return True
        
        return False
    
    def _collect_class_variables(self, node: ast.ClassDef) -> Tuple[List[str], List[str]]:
        """클래스 변수와 인스턴스 변수 수집"""
        class_vars = []
        instance_vars = []
        
        for item in node.body:
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        class_vars.append(target.id)
            
            elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if item.name == '__init__':
                    # __init__ 메서드에서 인스턴스 변수 추출
                    for child in ast.walk(item):
                        if isinstance(child, ast.Assign):
                            for target in child.targets:
                                if (isinstance(target, ast.Attribute) and
                                    isinstance(target.value, ast.Name) and
                                    target.value.id == 'self'):
                                    instance_vars.append(target.attr)
        
        return class_vars, instance_vars
    
    def _is_generator_function(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> bool:
        """제너레이터 함수인지 확인"""
        for child in ast.walk(node):
            if isinstance(child, (ast.Yield, ast.YieldFrom)):
                return True
        return False
    
    def _extract_function_calls(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> List[str]:
        """함수에서 호출되는 다른 함수들 추출"""
        calls = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                func_name = self._get_function_name(child.func)
                if func_name:
                    calls.append(func_name)
        
        return list(set(calls))  # 중복 제거
    
    def _extract_variables_used(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> List[str]:
        """함수에서 사용되는 변수들 추출"""
        variables = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
                variables.append(child.id)
        
        return list(set(variables))  # 중복 제거
    
    def _calculate_function_complexity(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> int:
        """함수의 사이클로매틱 복잡도 계산"""
        complexity = 1
        
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(child, ast.ExceptHandler):
                complexity += 1
            elif isinstance(child, (ast.And, ast.Or)):
                complexity += 1
            elif isinstance(child, ast.comprehension):
                complexity += 1
        
        return complexity
    
    def _get_function_name(self, node: ast.AST) -> Optional[str]:
        """함수 호출 노드에서 함수 이름 추출"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            base = self._get_function_name(node.value)
            if base:
                return f"{base}.{node.attr}"
            else:
                return node.attr
        return None
    
    def _is_third_party_module(self, module_name: str) -> bool:
        """서드파티 모듈인지 확인"""
        # 간단한 휴리스틱: 표준 라이브러리가 아니고 로컬 모듈도 아니면 서드파티
        root_module = module_name.split('.')[0]
        return (root_module not in self.stdlib_modules and 
                not self._is_local_module(module_name))
    
    def _is_local_module(self, module_name: str) -> bool:
        """로컬 모듈인지 확인"""
        # 현재 파일과 같은 디렉토리에 있는 모듈인지 확인
        if not module_name:
            return False
        
        current_dir = Path(self.file_path).parent
        potential_paths = [
            current_dir / f"{module_name.replace('.', '/')}.py",
            current_dir / f"{module_name.replace('.', '/')}" / "__init__.py"
        ]
        
        return any(path.exists() for path in potential_paths)
    
    def _infer_type(self, node: ast.AST) -> str:
        """노드에서 타입 추론"""
        if isinstance(node, ast.Constant):
            return type(node.value).__name__
        elif isinstance(node, ast.List):
            return "list"
        elif isinstance(node, ast.Dict):
            return "dict"
        elif isinstance(node, ast.Set):
            return "set"
        elif isinstance(node, ast.Tuple):
            return "tuple"
        elif isinstance(node, ast.Call):
            func_name = self._get_function_name(node.func)
            if func_name in ['int', 'str', 'float', 'bool', 'list', 'dict', 'set']:
                return func_name
        return "unknown"
    
    def _get_value_string(self, node: ast.AST) -> str:
        """값 노드를 문자열로 변환"""
        try:
            if isinstance(node, ast.Constant):
                return repr(node.value)
            elif isinstance(node, ast.Name):
                return node.id
            else:
                return self._ast_to_string(node)
        except Exception:
            return "..."
    
    def _ast_to_string(self, node: ast.AST) -> str:
        """AST 노드를 문자열로 변환"""
        try:
            return ast.unparse(node) if hasattr(ast, 'unparse') else str(node)
        except Exception:
            return str(node)


# 편의 함수들
def analyze_python_file(file_path: Union[str, Path], 
                       enable_caching: bool = True,
                       include_security: bool = True,
                       include_quality: bool = True) -> AnalysisResult:
    """Python 파일 분석 (편의 함수)"""
    analyzer = EnhancedASTAnalyzer(enable_caching=enable_caching)
    return analyzer.analyze_file(file_path, None, include_security, include_quality)


async def analyze_python_files_async(file_paths: List[Union[str, Path]],
                                    max_workers: int = 4,
                                    include_security: bool = True,
                                    include_quality: bool = True) -> List[AnalysisResult]:
    """여러 Python 파일 비동기 분석 (편의 함수)"""
    analyzer = EnhancedASTAnalyzer(max_workers=max_workers)
    return await analyzer.analyze_files_batch(file_paths, include_security, include_quality)


def extract_security_issues(file_path: Union[str, Path]) -> List[SecurityIssue]:
    """보안 이슈만 추출 (편의 함수)"""
    result = analyze_python_file(file_path, include_quality=False, include_security=True)
    return result.security_issues


def calculate_code_quality_score(file_path: Union[str, Path]) -> float:
    """코드 품질 점수 계산 (편의 함수)"""
    result = analyze_python_file(file_path, include_security=False, include_quality=True)
    return result.maintainability_score


def suggest_code_improvements(file_path: Union[str, Path]) -> List[Dict[str, Any]]:
    """코드 개선 제안 (편의 함수)"""
    analyzer = EnhancedASTAnalyzer()
    result = analyzer.analyze_file(file_path)
    return analyzer.suggest_refactoring(result)


@contextmanager
def analysis_timer():
    """분석 시간 측정 컨텍스트 매니저"""
    start_time = time.time()
    try:
        yield
    finally:
        end_time = time.time()
        logger.info(f"Analysis completed in {end_time - start_time:.2f} seconds")


# 메모리 효율적인 대용량 파일 분석
def analyze_large_file_streaming(file_path: Union[str, Path], 
                                chunk_size: int = 1024 * 1024) -> AnalysisResult:
    """대용량 파일을 스트리밍 방식으로 분석"""
    file_path = Path(file_path)
    
    # 파일 크기 확인
    file_size = file_path.stat().st_size
    if file_size < chunk_size:
        # 작은 파일은 일반 분석
        return analyze_python_file(file_path)
    
    logger.info(f"Large file detected ({file_size} bytes), using streaming analysis")
    
    # 큰 파일은 청크별로 읽어서 처리
    content_chunks = []
    with open(file_path, 'r', encoding='utf-8') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            content_chunks.append(chunk)
    
    content = ''.join(content_chunks)
    analyzer = EnhancedASTAnalyzer()
    return analyzer.analyze_file(file_path, content)


if __name__ == "__main__":
    # 사용 예제
    import sys
    
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        
        with analysis_timer():
            result = analyze_python_file(file_path)
            
        print(f"Analysis Results for {file_path}:")
        print(f"- Functions: {len(result.functions)}")
        print(f"- Classes: {len(result.classes)}")
        print(f"- Imports: {len(result.imports)}")
        print(f"- Security Issues: {len(result.security_issues)}")
        print(f"- Complexity Score: {result.complexity_score}")
        print(f"- Maintainability Score: {result.maintainability_score:.1f}")
        
        if result.security_issues:
            print("\nSecurity Issues:")
            for issue in result.security_issues:
                print(f"  - Line {issue.line}: {issue.message} [{issue.severity}]")
        
        # 리팩토링 제안
        analyzer = EnhancedASTAnalyzer()
        suggestions = analyzer.suggest_refactoring(result)
        if suggestions:
            print("\nRefactoring Suggestions:")
            for suggestion in suggestions[:5]:  # 최대 5개만 표시
                print(f"  - {suggestion['target']}: {suggestion['message']}")
    else:
        print("Usage: python ast_utils.py <python_file>")
        print("Example: python ast_utils.py my_script.py")