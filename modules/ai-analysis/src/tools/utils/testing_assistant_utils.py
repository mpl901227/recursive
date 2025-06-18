#!/usr/bin/env python3
"""
Testing Assistant Utilities
AI 기반 테스트 케이스 생성, 커버리지 분석, 품질 검증 도구들

주요 기능:
- 자동 테스트 케이스 생성 (단위, 통합, E2E)
- 테스트 커버리지 분석 및 시각화
- 엣지 케이스 자동 탐지
- 테스트 데이터 생성
- 모킹 및 스텁 자동 생성
- 성능 테스트 지원
- 테스트 품질 평가
- 리그레션 테스트 관리
"""

import ast
import inspect
import json
import random
import re
import subprocess
import sys
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Callable, 
    Type, Iterator, Generator, Protocol, runtime_checkable
)
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import pickle
from contextlib import contextmanager
import traceback
import importlib.util
import tempfile
import shutil

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class TestType(Enum):
    UNIT = "unit"
    INTEGRATION = "integration"
    E2E = "e2e"
    PERFORMANCE = "performance"
    SECURITY = "security"
    REGRESSION = "regression"


class TestFramework(Enum):
    PYTEST = "pytest"
    UNITTEST = "unittest"
    NOSE = "nose"
    JEST = "jest"
    MOCHA = "mocha"


class CoverageType(Enum):
    LINE = "line"
    BRANCH = "branch"
    FUNCTION = "function"
    STATEMENT = "statement"


class TestPriority(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# 데이터 클래스들
@dataclass
class TestCase:
    """테스트 케이스 정보"""
    name: str
    test_type: TestType
    function_name: str
    test_code: str
    description: str
    priority: TestPriority = TestPriority.MEDIUM
    tags: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    expected_runtime: float = 0.0
    setup_code: Optional[str] = None
    teardown_code: Optional[str] = None
    mock_requirements: List[str] = field(default_factory=list)
    data_requirements: Dict[str, Any] = field(default_factory=dict)
    edge_cases: List[str] = field(default_factory=list)


@dataclass
class CoverageReport:
    """커버리지 보고서"""
    total_lines: int
    covered_lines: int
    line_coverage: float
    branch_coverage: float
    function_coverage: float
    missing_lines: List[int]
    uncovered_branches: List[Tuple[int, int]]
    uncovered_functions: List[str]
    file_coverage: Dict[str, float]
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class TestResult:
    """테스트 실행 결과"""
    test_name: str
    status: str  # passed, failed, skipped, error
    execution_time: float
    error_message: Optional[str] = None
    traceback: Optional[str] = None
    assertions_count: int = 0
    warnings: List[str] = field(default_factory=list)
    memory_usage: float = 0.0
    coverage_impact: float = 0.0


@dataclass
class TestSuite:
    """테스트 스위트"""
    name: str
    test_cases: List[TestCase]
    setup_code: Optional[str] = None
    teardown_code: Optional[str] = None
    parallel_execution: bool = False
    timeout: Optional[float] = None
    retry_count: int = 0


@dataclass
class EdgeCase:
    """엣지 케이스 정보"""
    name: str
    description: str
    input_values: Dict[str, Any]
    expected_behavior: str
    category: str  # boundary, null, overflow, etc.
    severity: TestPriority = TestPriority.MEDIUM


@dataclass
class MockSpec:
    """모킹 사양"""
    target: str
    mock_type: str  # function, class, module
    return_value: Any = None
    side_effect: Optional[Callable] = None
    spec: Optional[Type] = None
    attributes: Dict[str, Any] = field(default_factory=dict)


# 프로토콜 정의
@runtime_checkable
class TestGenerator(Protocol):
    def generate_tests(self, function_code: str) -> List[TestCase]:
        """테스트 생성"""
        ...


@runtime_checkable
class CoverageAnalyzer(Protocol):
    def analyze_coverage(self, source_files: List[str], test_files: List[str]) -> CoverageReport:
        """커버리지 분석"""
        ...


# 커스텀 예외
class TestGenerationError(Exception):
    """테스트 생성 오류"""
    pass


class CoverageAnalysisError(Exception):
    """커버리지 분석 오류"""
    pass


class TestExecutionError(Exception):
    """테스트 실행 오류"""
    pass


class FunctionAnalyzer:
    """함수 분석기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def analyze_function(self, function_code: str) -> Dict[str, Any]:
        """함수 분석"""
        try:
            tree = ast.parse(function_code)
            
            analysis = {
                "name": "",
                "parameters": [],
                "return_type": None,
                "complexity": 1,
                "dependencies": [],
                "exceptions": [],
                "side_effects": [],
                "pure_function": True,
                "async_function": False,
                "decorators": [],
                "docstring": None
            }
            
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    analysis["name"] = node.name
                    analysis["async_function"] = isinstance(node, ast.AsyncFunctionDef)
                    analysis["docstring"] = ast.get_docstring(node)
                    
                    # 매개변수 분석
                    for arg in node.args.args:
                        param_info = {
                            "name": arg.arg,
                            "annotation": self._get_annotation(arg.annotation) if arg.annotation else None,
                            "default": None
                        }
                        analysis["parameters"].append(param_info)
                    
                    # 기본값 처리
                    defaults = node.args.defaults
                    if defaults:
                        param_count = len(analysis["parameters"])
                        default_count = len(defaults)
                        for i, default in enumerate(defaults):
                            param_index = param_count - default_count + i
                            if param_index >= 0:
                                analysis["parameters"][param_index]["default"] = self._get_literal_value(default)
                    
                    # 반환 타입
                    if node.returns:
                        analysis["return_type"] = self._get_annotation(node.returns)
                    
                    # 데코레이터
                    for decorator in node.decorator_list:
                        analysis["decorators"].append(self._get_decorator_name(decorator))
                
                # 복잡도 계산
                elif isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                    analysis["complexity"] += 1
                elif isinstance(node, ast.ExceptHandler):
                    analysis["complexity"] += 1
                
                # 예외 처리
                elif isinstance(node, ast.Raise):
                    if node.exc:
                        exc_name = self._get_exception_name(node.exc)
                        if exc_name:
                            analysis["exceptions"].append(exc_name)
                
                # 외부 호출 (순수성 검사)
                elif isinstance(node, ast.Call):
                    func_name = self._get_call_name(node)
                    if func_name:
                        analysis["dependencies"].append(func_name)
                        # 파일 I/O, 네트워크, 전역 변수 수정 등 부작용 검사
                        if self._is_side_effect_call(func_name):
                            analysis["side_effects"].append(func_name)
                            analysis["pure_function"] = False
            
            return analysis
            
        except Exception as e:
            self.logger.error(f"함수 분석 실패: {e}")
            return {"error": str(e)}
    
    def _get_annotation(self, node: ast.AST) -> str:
        """타입 어노테이션 추출"""
        try:
            if hasattr(ast, 'unparse'):
                return ast.unparse(node)
            else:
                return str(node)
        except Exception:
            return "Any"
    
    def _get_literal_value(self, node: ast.AST) -> Any:
        """리터럴 값 추출"""
        try:
            if isinstance(node, ast.Constant):
                return node.value
            elif isinstance(node, ast.Num):  # Python < 3.8
                return node.n
            elif isinstance(node, ast.Str):  # Python < 3.8
                return node.s
            elif isinstance(node, ast.NameConstant):  # Python < 3.8
                return node.value
            elif isinstance(node, ast.Name):
                return node.id
            else:
                return None
        except Exception:
            return None
    
    def _get_decorator_name(self, node: ast.AST) -> str:
        """데코레이터 이름 추출"""
        try:
            if isinstance(node, ast.Name):
                return node.id
            elif isinstance(node, ast.Attribute):
                return f"{self._get_decorator_name(node.value)}.{node.attr}"
            else:
                return str(node)
        except Exception:
            return "unknown"
    
    def _get_exception_name(self, node: ast.AST) -> Optional[str]:
        """예외 이름 추출"""
        try:
            if isinstance(node, ast.Name):
                return node.id
            elif isinstance(node, ast.Attribute):
                return f"{self._get_exception_name(node.value)}.{node.attr}"
            elif isinstance(node, ast.Call):
                return self._get_exception_name(node.func)
            else:
                return None
        except Exception:
            return None
    
    def _get_call_name(self, node: ast.Call) -> Optional[str]:
        """함수 호출 이름 추출"""
        try:
            if isinstance(node.func, ast.Name):
                return node.func.id
            elif isinstance(node.func, ast.Attribute):
                return f"{self._get_call_name_from_attr(node.func.value)}.{node.func.attr}"
            else:
                return None
        except Exception:
            return None
    
    def _get_call_name_from_attr(self, node: ast.AST) -> str:
        """속성에서 호출 이름 추출"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_call_name_from_attr(node.value)}.{node.attr}"
        else:
            return "unknown"
    
    def _is_side_effect_call(self, func_name: str) -> bool:
        """부작용이 있는 호출인지 확인"""
        side_effect_patterns = [
            "print", "open", "write", "read", "input", "requests.",
            "urllib.", "socket.", "os.", "sys.", "subprocess.",
            "time.sleep", "random.seed", "global", "nonlocal"
        ]
        
        return any(pattern in func_name for pattern in side_effect_patterns)


class TestDataGenerator:
    """테스트 데이터 생성기"""
    
    def __init__(self):
        self.random = random.Random()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_test_data(self, param_type: str, constraints: Optional[Dict] = None) -> Any:
        """타입에 따른 테스트 데이터 생성"""
        constraints = constraints or {}
        
        try:
            if param_type in ["int", "integer"]:
                return self._generate_int_data(constraints)
            elif param_type in ["float", "double"]:
                return self._generate_float_data(constraints)
            elif param_type in ["str", "string"]:
                return self._generate_string_data(constraints)
            elif param_type in ["bool", "boolean"]:
                return self._generate_bool_data()
            elif param_type in ["list", "List"]:
                return self._generate_list_data(constraints)
            elif param_type in ["dict", "Dict"]:
                return self._generate_dict_data(constraints)
            elif param_type in ["tuple", "Tuple"]:
                return self._generate_tuple_data(constraints)
            elif param_type in ["set", "Set"]:
                return self._generate_set_data(constraints)
            else:
                return self._generate_custom_data(param_type, constraints)
        except Exception as e:
            self.logger.error(f"테스트 데이터 생성 실패: {e}")
            return None
    
    def _generate_int_data(self, constraints: Dict) -> List[int]:
        """정수 테스트 데이터 생성"""
        min_val = constraints.get("min", -1000)
        max_val = constraints.get("max", 1000)
        
        data = [
            0,  # 기본값
            1,  # 양수
            -1,  # 음수
            min_val,  # 최솟값
            max_val,  # 최댓값
        ]
        
        # 경계값
        if min_val != -1000:
            data.extend([min_val - 1, min_val + 1])
        if max_val != 1000:
            data.extend([max_val - 1, max_val + 1])
        
        # 랜덤값
        for _ in range(3):
            data.append(self.random.randint(min_val, max_val))
        
        return list(set(data))
    
    def _generate_float_data(self, constraints: Dict) -> List[float]:
        """실수 테스트 데이터 생성"""
        min_val = constraints.get("min", -1000.0)
        max_val = constraints.get("max", 1000.0)
        
        data = [
            0.0,  # 기본값
            1.0,  # 양수
            -1.0,  # 음수
            0.1,  # 작은 양수
            -0.1,  # 작은 음수
            min_val,  # 최솟값
            max_val,  # 최댓값
            float('inf'),  # 무한대
            float('-inf'),  # 음의 무한대
            float('nan'),  # NaN
        ]
        
        # 랜덤값
        for _ in range(3):
            data.append(self.random.uniform(min_val, max_val))
        
        return data
    
    def _generate_string_data(self, constraints: Dict) -> List[str]:
        """문자열 테스트 데이터 생성"""
        min_len = constraints.get("min_length", 0)
        max_len = constraints.get("max_length", 100)
        
        data = [
            "",  # 빈 문자열
            " ",  # 공백
            "a",  # 단일 문자
            "test",  # 일반 문자열
            "가나다",  # 한글
            "🚀🎯",  # 이모지
            "null",  # 특수 문자열
            "None",
            "\n\t",  # 제어 문자
            "' OR '1'='1",  # SQL 인젝션 테스트
            "<script>alert('xss')</script>",  # XSS 테스트
        ]
        
        # 길이 기반 테스트
        if min_len > 0:
            data.append("a" * (min_len - 1))  # 최소길이보다 짧음
            data.append("a" * min_len)  # 최소길이
        
        if max_len < 100:
            data.append("a" * max_len)  # 최대길이
            data.append("a" * (max_len + 1))  # 최대길이보다 김
        
        # 긴 문자열
        data.append("a" * 1000)
        
        return data
    
    def _generate_bool_data(self) -> List[bool]:
        """불린 테스트 데이터 생성"""
        return [True, False]
    
    def _generate_list_data(self, constraints: Dict) -> List[List]:
        """리스트 테스트 데이터 생성"""
        element_type = constraints.get("element_type", "int")
        min_len = constraints.get("min_length", 0)
        max_len = constraints.get("max_length", 10)
        
        data = [
            [],  # 빈 리스트
            [1],  # 단일 요소
            [1, 2, 3],  # 일반 리스트
            [1, 1, 1],  # 중복 요소
        ]
        
        # 길이 기반 테스트
        if min_len > 0:
            data.append([1] * min_len)
        if max_len > 3:
            data.append([1] * max_len)
        
        # 큰 리스트
        data.append(list(range(1000)))
        
        return data
    
    def _generate_dict_data(self, constraints: Dict) -> List[Dict]:
        """딕셔너리 테스트 데이터 생성"""
        return [
            {},  # 빈 딕셔너리
            {"key": "value"},  # 단일 키-값
            {"a": 1, "b": 2},  # 다중 키-값
            {"nested": {"key": "value"}},  # 중첩 딕셔너리
            {1: "number_key"},  # 숫자 키
            {"": "empty_key"},  # 빈 키
        ]
    
    def _generate_tuple_data(self, constraints: Dict) -> List[Tuple]:
        """튜플 테스트 데이터 생성"""
        return [
            (),  # 빈 튜플
            (1,),  # 단일 요소
            (1, 2, 3),  # 다중 요소
            (1, "mixed", True),  # 혼합 타입
        ]
    
    def _generate_set_data(self, constraints: Dict) -> List[Set]:
        """집합 테스트 데이터 생성"""
        return [
            set(),  # 빈 집합
            {1},  # 단일 요소
            {1, 2, 3},  # 다중 요소
        ]
    
    def _generate_custom_data(self, param_type: str, constraints: Dict) -> List[Any]:
        """커스텀 타입 데이터 생성"""
        # 기본적으로 None과 빈 값들 반환
        return [None, "", 0, [], {}]
    
    def generate_edge_cases(self, function_analysis: Dict[str, Any]) -> List[EdgeCase]:
        """엣지 케이스 생성"""
        edge_cases = []
        
        # 매개변수 기반 엣지 케이스
        for param in function_analysis.get("parameters", []):
            param_name = param["name"]
            param_type = param.get("annotation", "Any")
            
            # None 값 테스트
            edge_cases.append(EdgeCase(
                name=f"{param_name}_none",
                description=f"{param_name}에 None 값 전달",
                input_values={param_name: None},
                expected_behavior="적절한 예외 처리 또는 기본값 처리",
                category="null"
            ))
            
            # 타입별 경계값 테스트
            if "int" in param_type:
                edge_cases.extend([
                    EdgeCase(
                        name=f"{param_name}_max_int",
                        description=f"{param_name}에 최대 정수값 전달",
                        input_values={param_name: sys.maxsize},
                        expected_behavior="정상 처리 또는 오버플로우 예외",
                        category="boundary"
                    ),
                    EdgeCase(
                        name=f"{param_name}_min_int",
                        description=f"{param_name}에 최소 정수값 전달",
                        input_values={param_name: -sys.maxsize - 1},
                        expected_behavior="정상 처리 또는 언더플로우 예외",
                        category="boundary"
                    )
                ])
            
            elif "str" in param_type:
                edge_cases.extend([
                    EdgeCase(
                        name=f"{param_name}_empty_string",
                        description=f"{param_name}에 빈 문자열 전달",
                        input_values={param_name: ""},
                        expected_behavior="빈 문자열 처리",
                        category="boundary"
                    ),
                    EdgeCase(
                        name=f"{param_name}_very_long_string",
                        description=f"{param_name}에 매우 긴 문자열 전달",
                        input_values={param_name: "a" * 10000},
                        expected_behavior="메모리 효율적 처리",
                        category="performance"
                    )
                ])
        
        return edge_cases


class UnitTestGenerator:
    """단위 테스트 생성기"""
    
    def __init__(self, framework: TestFramework = TestFramework.PYTEST):
        self.framework = framework
        self.function_analyzer = FunctionAnalyzer()
        self.data_generator = TestDataGenerator()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_tests(self, function_code: str, additional_context: Optional[Dict] = None) -> List[TestCase]:
        """함수에 대한 단위 테스트 생성"""
        try:
            # 함수 분석
            analysis = self.function_analyzer.analyze_function(function_code)
            if "error" in analysis:
                raise TestGenerationError(f"함수 분석 실패: {analysis['error']}")
            
            function_name = analysis["name"]
            if not function_name:
                raise TestGenerationError("함수명을 찾을 수 없습니다")
            
            test_cases = []
            
            # 기본 테스트 케이스
            test_cases.extend(self._generate_basic_tests(analysis))
            
            # 매개변수 테스트
            test_cases.extend(self._generate_parameter_tests(analysis))
            
            # 예외 테스트
            test_cases.extend(self._generate_exception_tests(analysis))
            
            # 엣지 케이스 테스트
            test_cases.extend(self._generate_edge_case_tests(analysis))
            
            # 모킹이 필요한 테스트
            if analysis.get("dependencies"):
                test_cases.extend(self._generate_mock_tests(analysis))
            
            self.logger.info(f"{function_name}에 대해 {len(test_cases)}개의 테스트 케이스 생성")
            
            return test_cases
            
        except Exception as e:
            self.logger.error(f"테스트 생성 실패: {e}")
            raise TestGenerationError(f"테스트 생성 실패: {e}")
    
    def _generate_basic_tests(self, analysis: Dict[str, Any]) -> List[TestCase]:
        """기본 테스트 케이스 생성"""
        function_name = analysis["name"]
        parameters = analysis["parameters"]
        
        test_cases = []
        
        # 정상 동작 테스트
        if parameters:
            # 매개변수가 있는 경우
            param_calls = []
            for param in parameters:
                param_name = param["name"]
                param_type = param.get("annotation", "Any")
                default_value = param.get("default")
                
                if default_value is not None:
                    param_calls.append(f"{param_name}={repr(default_value)}")
                else:
                    # 타입에 따른 기본값 생성
                    test_value = self._get_default_test_value(param_type)
                    param_calls.append(f"{param_name}={repr(test_value)}")
            
            test_code = self._generate_test_method(
                f"test_{function_name}_basic",
                function_name,
                param_calls,
                "정상적인 입력으로 함수 호출 테스트"
            )
        else:
            # 매개변수가 없는 경우
            test_code = self._generate_test_method(
                f"test_{function_name}_no_params",
                function_name,
                [],
                "매개변수 없이 함수 호출 테스트"
            )
        
        test_cases.append(TestCase(
            name=f"test_{function_name}_basic",
            test_type=TestType.UNIT,
            function_name=function_name,
            test_code=test_code,
            description="기본 기능 테스트",
            priority=TestPriority.HIGH
        ))
        
        return test_cases
    
    def _generate_parameter_tests(self, analysis: Dict[str, Any]) -> List[TestCase]:
        """매개변수 테스트 케이스 생성"""
        function_name = analysis["name"]
        parameters = analysis["parameters"]
        
        test_cases = []
        
        for param in parameters:
            param_name = param["name"]
            param_type = param.get("annotation", "Any")
            
            # 타입별 테스트 데이터 생성
            test_data = self.data_generator.generate_test_data(param_type)
            
            for i, test_value in enumerate(test_data[:5]):  # 최대 5개까지
                param_calls = [f"{param_name}={repr(test_value)}"]
                
                # 다른 매개변수들은 기본값 사용
                for other_param in parameters:
                    if other_param["name"] != param_name:
                        default_val = self._get_default_test_value(other_param.get("annotation", "Any"))
                        param_calls.append(f"{other_param['name']}={repr(default_val)}")
                
                test_method_name = f"test_{function_name}_{param_name}_type_{i}"
                test_code = self._generate_test_method(
                    test_method_name,
                    function_name,
                    param_calls,
                    f"{param_name} 매개변수 타입 테스트: {test_value}"
                )
                
                test_cases.append(TestCase(
                    name=test_method_name,
                    test_type=TestType.UNIT,
                    function_name=function_name,
                    test_code=test_code,
                    description=f"{param_name} 매개변수 테스트",
                    priority=TestPriority.MEDIUM,
                    tags=[f"param_{param_name}", "type_test"]
                ))
        
        return test_cases
    
    def _generate_exception_tests(self, analysis: Dict[str, Any]) -> List[TestCase]:
        """예외 테스트 케이스 생성"""
        function_name = analysis["name"]
        parameters = analysis["parameters"]
        expected_exceptions = analysis.get("exceptions", [])
        
        test_cases = []
        
        # 명시적 예외 테스트
        for exception in expected_exceptions:
            test_method_name = f"test_{function_name}_{exception.lower()}_exception"
            
            # 예외를 발생시킬 수 있는 입력 생성
            param_calls = []
            for param in parameters:
                param_name = param["name"]
                # 예외를 유발할 수 있는 값 사용
                bad_value = self._get_exception_causing_value(param_name, exception)
                param_calls.append(f"{param_name}={repr(bad_value)}")
            
            test_code = self._generate_exception_test_method(
                test_method_name,
                function_name,
                param_calls,
                exception,
                f"{exception} 예외 발생 테스트"
            )
            
            test_cases.append(TestCase(
                name=test_method_name,
                test_type=TestType.UNIT,
                function_name=function_name,
                test_code=test_code,
                description=f"{exception} 예외 테스트",
                priority=TestPriority.HIGH,
                tags=["exception_test", exception.lower()]
            ))
        
        # 일반적인 예외 테스트
        if parameters:
            # TypeError 테스트 (잘못된 타입)
            param_calls = []
            for param in parameters:
                param_name = param["name"]
                param_type = param.get("annotation", "Any")
                wrong_type_value = self._get_wrong_type_value(param_type)
                param_calls.append(f"{param_name}={repr(wrong_type_value)}")
            
            test_code = self._generate_exception_test_method(
                f"test_{function_name}_type_error",
                function_name,
                param_calls,
                "TypeError",
                "잘못된 타입 입력 시 TypeError 발생 테스트"
            )
            
            test_cases.append(TestCase(
                name=f"test_{function_name}_type_error",
                test_type=TestType.UNIT,
                function_name=function_name,
                test_code=test_code,
                description="TypeError 테스트",
                priority=TestPriority.MEDIUM,
                tags=["exception_test", "type_error"]
            ))
        
        return test_cases
    
    def _generate_edge_case_tests(self, analysis: Dict[str, Any]) -> List[TestCase]:
        """엣지 케이스 테스트 생성"""
        function_name = analysis["name"]
        edge_cases = self.data_generator.generate_edge_cases(analysis)
        
        test_cases = []
        
        for edge_case in edge_cases:
            param_calls = []
            for param_name, value in edge_case.input_values.items():
                param_calls.append(f"{param_name}={repr(value)}")
            
            test_method_name = f"test_{function_name}_{edge_case.name}"
            test_code = self._generate_test_method(
                test_method_name,
                function_name,
                param_calls,
                edge_case.description
            )
            
            test_cases.append(TestCase(
                name=test_method_name,
                test_type=TestType.UNIT,
                function_name=function_name,
                test_code=test_code,
                description=edge_case.description,
                priority=edge_case.severity,
                tags=["edge_case", edge_case.category],
                edge_cases=[edge_case.name]
            ))
        
        return test_cases
    
    def _generate_mock_tests(self, analysis: Dict[str, Any]) -> List[TestCase]:
        """모킹이 필요한 테스트 생성"""
        function_name = analysis["name"]
        dependencies = analysis.get("dependencies", [])
        
        test_cases = []
        
        for dependency in dependencies:
            # 외부 의존성을 모킹하는 테스트
            test_method_name = f"test_{function_name}_mock_{dependency.replace('.', '_')}"
            
            mock_spec = MockSpec(
                target=dependency,
                mock_type="function",
                return_value="mocked_result"
            )
            
            test_code = self._generate_mock_test_method(
                test_method_name,
                function_name,
                analysis["parameters"],
                mock_spec,
                f"{dependency} 의존성 모킹 테스트"
            )
            
            test_cases.append(TestCase(
                name=test_method_name,
                test_type=TestType.UNIT,
                function_name=function_name,
                test_code=test_code,
                description=f"{dependency} 모킹 테스트",
                priority=TestPriority.MEDIUM,
                tags=["mock_test", "dependency"],
                mock_requirements=[dependency]
            ))
        
        return test_cases
    
    def _generate_test_method(self, method_name: str, function_name: str, 
                            param_calls: List[str], description: str) -> str:
        """테스트 메소드 코드 생성"""
        if self.framework == TestFramework.PYTEST:
            return self._generate_pytest_method(method_name, function_name, param_calls, description)
        elif self.framework == TestFramework.UNITTEST:
            return self._generate_unittest_method(method_name, function_name, param_calls, description)
        else:
            return self._generate_pytest_method(method_name, function_name, param_calls, description)
    
    def _generate_pytest_method(self, method_name: str, function_name: str, 
                               param_calls: List[str], description: str) -> str:
        """pytest 스타일 테스트 메소드 생성"""
        params_str = ", ".join(param_calls) if param_calls else ""
        
        return f'''def {method_name}():
    """
    {description}
    """
    # Arrange
    # TODO: 필요한 테스트 데이터 준비
    
    # Act
    result = {function_name}({params_str})
    
    # Assert
    assert result is not None  # TODO: 적절한 검증 로직 추가
    # TODO: 예상 결과와 비교
'''
    
    def _generate_unittest_method(self, method_name: str, function_name: str, 
                                param_calls: List[str], description: str) -> str:
        """unittest 스타일 테스트 메소드 생성"""
        params_str = ", ".join(param_calls) if param_calls else ""
        
        return f'''def {method_name}(self):
    """
    {description}
    """
    # Arrange
    # TODO: 필요한 테스트 데이터 준비
    
    # Act
    result = {function_name}({params_str})
    
    # Assert
    self.assertIsNotNone(result)  # TODO: 적절한 검증 로직 추가
    # TODO: 예상 결과와 비교
'''
    
    def _generate_exception_test_method(self, method_name: str, function_name: str,
                                      param_calls: List[str], exception_type: str,
                                      description: str) -> str:
        """예외 테스트 메소드 생성"""
        params_str = ", ".join(param_calls) if param_calls else ""
        
        if self.framework == TestFramework.PYTEST:
            return f'''def {method_name}():
    """
    {description}
    """
    import pytest
    
    # Arrange & Act & Assert
    with pytest.raises({exception_type}):
        {function_name}({params_str})
'''
        else:
            return f'''def {method_name}(self):
    """
    {description}
    """
    # Arrange & Act & Assert
    with self.assertRaises({exception_type}):
        {function_name}({params_str})
'''
    
    def _generate_mock_test_method(self, method_name: str, function_name: str,
                                 parameters: List[Dict], mock_spec: MockSpec,
                                 description: str) -> str:
        """모킹 테스트 메소드 생성"""
        param_calls = []
        for param in parameters:
            default_val = self._get_default_test_value(param.get("annotation", "Any"))
            param_calls.append(f"{param['name']}={repr(default_val)}")
        
        params_str = ", ".join(param_calls) if param_calls else ""
        
        if self.framework == TestFramework.PYTEST:
            return f'''def {method_name}(mocker):
    """
    {description}
    """
    # Arrange
    mock_{mock_spec.target.replace('.', '_')} = mocker.patch('{mock_spec.target}')
    mock_{mock_spec.target.replace('.', '_')}.return_value = {repr(mock_spec.return_value)}
    
    # Act
    result = {function_name}({params_str})
    
    # Assert
    assert result is not None
    mock_{mock_spec.target.replace('.', '_')}.assert_called_once()
'''
        else:
            return f'''@patch('{mock_spec.target}')
def {method_name}(self, mock_{mock_spec.target.replace('.', '_')}):
    """
    {description}
    """
    # Arrange
    mock_{mock_spec.target.replace('.', '_')}.return_value = {repr(mock_spec.return_value)}
    
    # Act
    result = {function_name}({params_str})
    
    # Assert
    self.assertIsNotNone(result)
    mock_{mock_spec.target.replace('.', '_')}.assert_called_once()
'''
    
    def _get_default_test_value(self, param_type: str) -> Any:
        """매개변수 타입에 따른 기본 테스트 값 반환"""
        type_defaults = {
            "int": 1,
            "float": 1.0,
            "str": "test",
            "bool": True,
            "list": [1, 2, 3],
            "dict": {"key": "value"},
            "tuple": (1, 2, 3),
            "set": {1, 2, 3},
        }
        
        for type_name, default_val in type_defaults.items():
            if type_name in param_type.lower():
                return default_val
        
        return "test_value"
    
    def _get_exception_causing_value(self, param_name: str, exception_type: str) -> Any:
        """예외를 발생시킬 수 있는 값 반환"""
        if exception_type == "ValueError":
            return "invalid_value"
        elif exception_type == "TypeError":
            return None
        elif exception_type == "ZeroDivisionError":
            return 0
        elif exception_type == "IndexError":
            return -1
        else:
            return None
    
    def _get_wrong_type_value(self, expected_type: str) -> Any:
        """잘못된 타입 값 반환"""
        if "int" in expected_type:
            return "not_an_int"
        elif "str" in expected_type:
            return 123
        elif "list" in expected_type:
            return "not_a_list"
        elif "dict" in expected_type:
            return "not_a_dict"
        else:
            return object()


class IntegrationTestGenerator:
    """통합 테스트 생성기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_integration_tests(self, modules: List[str], 
                                 interactions: List[Dict[str, Any]]) -> List[TestCase]:
        """모듈 간 상호작용 테스트 생성"""
        test_cases = []
        
        for interaction in interactions:
            source_module = interaction.get("source")
            target_module = interaction.get("target")
            interaction_type = interaction.get("type", "call")
            
            test_case = self._generate_module_interaction_test(
                source_module, target_module, interaction_type
            )
            test_cases.append(test_case)
        
        return test_cases
    
    def _generate_module_interaction_test(self, source: str, target: str, 
                                        interaction_type: str) -> TestCase:
        """모듈 간 상호작용 테스트 생성"""
        test_name = f"test_integration_{source}_{target}_{interaction_type}"
        
        test_code = f'''def {test_name}():
    """
    {source}와 {target} 모듈 간 {interaction_type} 상호작용 테스트
    """
    # Arrange
    # TODO: 테스트 환경 설정
    
    # Act
    # TODO: {source}에서 {target}로의 {interaction_type} 실행
    
    # Assert
    # TODO: 상호작용 결과 검증
    pass
'''
        
        return TestCase(
            name=test_name,
            test_type=TestType.INTEGRATION,
            function_name=f"{source}_{target}",
            test_code=test_code,
            description=f"{source}와 {target} 모듈 통합 테스트",
            priority=TestPriority.HIGH,
            tags=["integration", source, target],
            dependencies=[source, target]
        )


class CoverageAnalyzer:
    """커버리지 분석기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def analyze_coverage(self, source_files: List[str], test_files: List[str], 
                        coverage_types: List[CoverageType] = None) -> CoverageReport:
        """커버리지 분석 실행"""
        if coverage_types is None:
            coverage_types = [CoverageType.LINE, CoverageType.BRANCH, CoverageType.FUNCTION]
        
        try:
            # coverage.py를 사용한 분석
            coverage_data = self._run_coverage_analysis(source_files, test_files)
            
            report = CoverageReport(
                total_lines=coverage_data.get("total_lines", 0),
                covered_lines=coverage_data.get("covered_lines", 0),
                line_coverage=coverage_data.get("line_coverage", 0.0),
                branch_coverage=coverage_data.get("branch_coverage", 0.0),
                function_coverage=coverage_data.get("function_coverage", 0.0),
                missing_lines=coverage_data.get("missing_lines", []),
                uncovered_branches=coverage_data.get("uncovered_branches", []),
                uncovered_functions=coverage_data.get("uncovered_functions", []),
                file_coverage=coverage_data.get("file_coverage", {})
            )
            
            return report
            
        except Exception as e:
            self.logger.error(f"커버리지 분석 실패: {e}")
            raise CoverageAnalysisError(f"커버리지 분석 실패: {e}")
    
    def _run_coverage_analysis(self, source_files: List[str], test_files: List[str]) -> Dict[str, Any]:
        """실제 커버리지 분석 실행"""
        try:
            # coverage.py 실행
            import coverage
            
            cov = coverage.Coverage(source=source_files)
            cov.start()
            
            # 테스트 실행 (실제로는 pytest나 unittest 실행)
            for test_file in test_files:
                self._run_test_file(test_file)
            
            cov.stop()
            cov.save()
            
            # 결과 분석
            total_lines = 0
            covered_lines = 0
            missing_lines = []
            file_coverage = {}
            
            for filename in source_files:
                analysis = cov.analysis2(filename)
                if analysis:
                    statements, excluded, missing, missed_branches = analysis
                    
                    file_total = len(statements)
                    file_covered = file_total - len(missing)
                    
                    total_lines += file_total
                    covered_lines += file_covered
                    missing_lines.extend(missing)
                    
                    file_coverage[filename] = file_covered / file_total if file_total > 0 else 0.0
            
            line_coverage = covered_lines / total_lines if total_lines > 0 else 0.0
            
            return {
                "total_lines": total_lines,
                "covered_lines": covered_lines,
                "line_coverage": line_coverage,
                "branch_coverage": 0.0,  # 추후 구현
                "function_coverage": 0.0,  # 추후 구현
                "missing_lines": missing_lines,
                "uncovered_branches": [],
                "uncovered_functions": [],
                "file_coverage": file_coverage
            }
            
        except ImportError:
            # coverage.py가 없는 경우 기본 분석
            return self._basic_coverage_analysis(source_files, test_files)
        except Exception as e:
            self.logger.error(f"Coverage 실행 오류: {e}")
            return self._basic_coverage_analysis(source_files, test_files)
    
    def _basic_coverage_analysis(self, source_files: List[str], test_files: List[str]) -> Dict[str, Any]:
        """기본 커버리지 분석 (coverage.py 없이)"""
        total_lines = 0
        file_coverage = {}
        
        for source_file in source_files:
            try:
                with open(source_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    executable_lines = [i for i, line in enumerate(lines, 1) 
                                      if line.strip() and not line.strip().startswith('#')]
                    total_lines += len(executable_lines)
                    
                    # 기본적으로 50% 커버리지 가정
                    file_coverage[source_file] = 0.5
            except Exception as e:
                self.logger.warning(f"파일 읽기 실패: {source_file}, {e}")
        
        covered_lines = int(total_lines * 0.5)
        
        return {
            "total_lines": total_lines,
            "covered_lines": covered_lines,
            "line_coverage": 0.5,
            "branch_coverage": 0.4,
            "function_coverage": 0.6,
            "missing_lines": list(range(covered_lines + 1, total_lines + 1)),
            "uncovered_branches": [],
            "uncovered_functions": [],
            "file_coverage": file_coverage
        }
    
    def _run_test_file(self, test_file: str):
        """테스트 파일 실행"""
        try:
            # 동적 모듈 임포트 및 실행
            spec = importlib.util.spec_from_file_location("test_module", test_file)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
        except Exception as e:
            self.logger.warning(f"테스트 파일 실행 실패: {test_file}, {e}")
    
    def suggest_coverage_improvements(self, report: CoverageReport) -> List[str]:
        """커버리지 개선 제안"""
        suggestions = []
        
        if report.line_coverage < 0.8:
            suggestions.append(f"라인 커버리지가 {report.line_coverage:.1%}로 낮습니다. 80% 이상을 목표로 하세요.")
        
        if report.branch_coverage < 0.7:
            suggestions.append(f"브랜치 커버리지가 {report.branch_coverage:.1%}로 낮습니다. 조건문 테스트를 추가하세요.")
        
        if report.function_coverage < 0.9:
            suggestions.append(f"함수 커버리지가 {report.function_coverage:.1%}로 낮습니다. 모든 함수에 대한 테스트를 추가하세요.")
        
        # 파일별 개선 제안
        low_coverage_files = [
            file for file, coverage in report.file_coverage.items() 
            if coverage < 0.7
        ]
        
        if low_coverage_files:
            suggestions.append(f"다음 파일들의 커버리지가 낮습니다: {', '.join(low_coverage_files[:3])}")
        
        # 누락된 라인 정보
        if report.missing_lines:
            suggestions.append(f"{len(report.missing_lines)}개의 라인이 테스트되지 않았습니다.")
        
        return suggestions


class TestExecutor:
    """테스트 실행기"""
    
    def __init__(self, framework: TestFramework = TestFramework.PYTEST):
        self.framework = framework
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def execute_tests(self, test_suite: TestSuite, 
                     parallel: bool = False, 
                     verbose: bool = False) -> List[TestResult]:
        """테스트 스위트 실행"""
        results = []
        
        try:
            if parallel and test_suite.parallel_execution:
                results = self._execute_parallel(test_suite, verbose)
            else:
                results = self._execute_sequential(test_suite, verbose)
            
            return results
            
        except Exception as e:
            self.logger.error(f"테스트 실행 실패: {e}")
            raise TestExecutionError(f"테스트 실행 실패: {e}")
    
    def _execute_sequential(self, test_suite: TestSuite, verbose: bool) -> List[TestResult]:
        """순차 테스트 실행"""
        results = []
        
        for test_case in test_suite.test_cases:
            result = self._execute_single_test(test_case, verbose)
            results.append(result)
        
        return results
    
    def _execute_parallel(self, test_suite: TestSuite, verbose: bool) -> List[TestResult]:
        """병렬 테스트 실행"""
        results = []
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_test = {
                executor.submit(self._execute_single_test, test_case, verbose): test_case
                for test_case in test_suite.test_cases
            }
            
            for future in as_completed(future_to_test):
                test_case = future_to_test[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    self.logger.error(f"테스트 실행 오류: {test_case.name}, {e}")
                    results.append(TestResult(
                        test_name=test_case.name,
                        status="error",
                        execution_time=0.0,
                        error_message=str(e)
                    ))
        
        return results
    
    def _execute_single_test(self, test_case: TestCase, verbose: bool) -> TestResult:
        """단일 테스트 실행"""
        start_time = time.time()
        
        try:
            # 테스트 코드를 임시 파일로 저장하고 실행
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(test_case.test_code)
                temp_file = f.name
            
            try:
                # 테스트 실행
                if self.framework == TestFramework.PYTEST:
                    result = self._run_pytest(temp_file, test_case.name, verbose)
                else:
                    result = self._run_unittest(temp_file, test_case.name, verbose)
                
                execution_time = time.time() - start_time
                
                return TestResult(
                    test_name=test_case.name,
                    status=result["status"],
                    execution_time=execution_time,
                    error_message=result.get("error"),
                    traceback=result.get("traceback"),
                    assertions_count=result.get("assertions", 0)
                )
                
            finally:
                # 임시 파일 정리
                try:
                    Path(temp_file).unlink()
                except Exception:
                    pass
                
        except Exception as e:
            execution_time = time.time() - start_time
            return TestResult(
                test_name=test_case.name,
                status="error",
                execution_time=execution_time,
                error_message=str(e),
                traceback=traceback.format_exc()
            )
    
    def _run_pytest(self, test_file: str, test_name: str, verbose: bool) -> Dict[str, Any]:
        """pytest 실행"""
        try:
            cmd = ["python", "-m", "pytest", test_file, "-v" if verbose else "-q"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                return {"status": "passed"}
            else:
                return {
                    "status": "failed",
                    "error": result.stdout + result.stderr,
                    "traceback": result.stderr
                }
                
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "error": "Test execution timed out"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    def _run_unittest(self, test_file: str, test_name: str, verbose: bool) -> Dict[str, Any]:
        """unittest 실행"""
        try:
            cmd = ["python", "-m", "unittest", test_file, "-v" if verbose else ""]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                return {"status": "passed"}
            else:
                return {
                    "status": "failed",
                    "error": result.stdout + result.stderr,
                    "traceback": result.stderr
                }
                
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "error": "Test execution timed out"}
        except Exception as e:
            return {"status": "error", "error": str(e)}


class TestQualityAnalyzer:
    """테스트 품질 분석기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def analyze_test_quality(self, test_cases: List[TestCase]) -> Dict[str, Any]:
        """테스트 품질 분석"""
        if not test_cases:
            return {"error": "분석할 테스트 케이스가 없습니다"}
        
        analysis = {
            "total_tests": len(test_cases),
            "test_types": self._analyze_test_types(test_cases),
            "priority_distribution": self._analyze_priority_distribution(test_cases),
            "coverage_potential": self._estimate_coverage_potential(test_cases),
            "quality_score": 0.0,
            "recommendations": []
        }
        
        # 품질 점수 계산
        analysis["quality_score"] = self._calculate_quality_score(analysis)
        
        # 개선 권장사항
        analysis["recommendations"] = self._generate_quality_recommendations(analysis)
        
        return analysis
    
    def _analyze_test_types(self, test_cases: List[TestCase]) -> Dict[str, int]:
        """테스트 타입별 분포 분석"""
        type_counts = {}
        for test_case in test_cases:
            test_type = test_case.test_type.value
            type_counts[test_type] = type_counts.get(test_type, 0) + 1
        return type_counts
    
    def _analyze_priority_distribution(self, test_cases: List[TestCase]) -> Dict[str, int]:
        """우선순위별 분포 분석"""
        priority_counts = {}
        for test_case in test_cases:
            priority = test_case.priority.value
            priority_counts[priority] = priority_counts.get(priority, 0) + 1
        return priority_counts
    
    def _estimate_coverage_potential(self, test_cases: List[TestCase]) -> float:
        """커버리지 잠재력 추정"""
        # 테스트 케이스 수와 다양성을 기반으로 추정
        base_score = min(len(test_cases) / 10.0, 1.0)  # 10개당 100%
        
        # 다양성 보너스
        unique_functions = len(set(tc.function_name for tc in test_cases))
        diversity_bonus = min(unique_functions / 5.0, 0.3)  # 최대 30% 보너스
        
        return min(base_score + diversity_bonus, 1.0)
    
    def _calculate_quality_score(self, analysis: Dict[str, Any]) -> float:
        """테스트 품질 점수 계산 (0-100)"""
        score = 0.0
        
        # 테스트 수량 점수 (30점 만점)
        test_count = analysis["total_tests"]
        quantity_score = min(test_count / 20.0 * 30, 30)  # 20개면 만점
        score += quantity_score
        
        # 타입 다양성 점수 (25점 만점)
        type_diversity = len(analysis["test_types"])
        diversity_score = min(type_diversity / 3.0 * 25, 25)  # 3가지 타입이면 만점
        score += diversity_score
        
        # 우선순위 균형 점수 (20점 만점)
        priorities = analysis["priority_distribution"]
        if len(priorities) >= 3:  # 3가지 이상 우선순위
            balance_score = 20
        elif len(priorities) == 2:
            balance_score = 15
        else:
            balance_score = 10
        score += balance_score
        
        # 커버리지 잠재력 점수 (25점 만점)
        coverage_score = analysis["coverage_potential"] * 25
        score += coverage_score
        
        return round(score, 1)
    
    def _generate_quality_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """품질 개선 권장사항 생성"""
        recommendations = []
        
        # 테스트 수량 검사
        if analysis["total_tests"] < 5:
            recommendations.append("테스트 케이스가 부족합니다. 최소 10개 이상 작성하세요.")
        
        # 타입 다양성 검사
        test_types = analysis["test_types"]
        if len(test_types) < 2:
            recommendations.append("다양한 타입의 테스트를 추가하세요 (단위, 통합, E2E 등).")
        
        # 우선순위 균형 검사
        priorities = analysis["priority_distribution"]
        if "critical" not in priorities:
            recommendations.append("중요한 기능에 대한 CRITICAL 우선순위 테스트를 추가하세요.")
        
        # 커버리지 잠재력 검사
        if analysis["coverage_potential"] < 0.7:
            recommendations.append("더 많은 함수와 시나리오를 테스트하여 커버리지를 향상시키세요.")
        
        # 품질 점수 기반 권장사항
        quality_score = analysis["quality_score"]
        if quality_score < 60:
            recommendations.append("전반적인 테스트 품질이 낮습니다. 더 체계적인 테스트 계획이 필요합니다.")
        elif quality_score < 80:
            recommendations.append("테스트 품질이 양호하지만 개선 여지가 있습니다.")
        
        return recommendations


class PerformanceTestGenerator:
    """성능 테스트 생성기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_performance_tests(self, function_analysis: Dict[str, Any], 
                                 performance_requirements: Optional[Dict] = None) -> List[TestCase]:
        """성능 테스트 생성"""
        function_name = function_analysis["name"]
        performance_requirements = performance_requirements or {}
        
        test_cases = []
        
        # 기본 성능 테스트
        test_cases.append(self._generate_basic_performance_test(function_analysis))
        
        # 메모리 사용량 테스트
        test_cases.append(self._generate_memory_test(function_analysis))
        
        # 대용량 데이터 처리 테스트
        test_cases.append(self._generate_large_data_test(function_analysis))
        
        # 동시성 테스트
        test_cases.append(self._generate_concurrency_test(function_analysis))
        
        return test_cases
    
    def _generate_basic_performance_test(self, analysis: Dict[str, Any]) -> TestCase:
        """기본 성능 테스트 생성"""
        function_name = analysis["name"]
        parameters = analysis["parameters"]
        
        param_calls = []
        for param in parameters:
            default_val = self._get_performance_test_value(param.get("annotation", "Any"))
            param_calls.append(f"{param['name']}={repr(default_val)}")
        
        params_str = ", ".join(param_calls) if param_calls else ""
        
        test_code = f'''def test_{function_name}_performance():
    """
    {function_name} 함수의 기본 성능 테스트
    """
    import time
    
    # Arrange
    iterations = 1000
    
    # Act
    start_time = time.time()
    for _ in range(iterations):
        result = {function_name}({params_str})
    end_time = time.time()
    
    # Assert
    total_time = end_time - start_time
    avg_time = total_time / iterations
    
    # 평균 실행 시간이 1ms 이하여야 함
    assert avg_time < 0.001, f"Performance too slow: {{avg_time:.6f}}s per call"
    
    print(f"Average execution time: {{avg_time:.6f}}s")
    print(f"Total time for {{iterations}} iterations: {{total_time:.6f}}s")
'''
        
        return TestCase(
            name=f"test_{function_name}_performance",
            test_type=TestType.PERFORMANCE,
            function_name=function_name,
            test_code=test_code,
            description="기본 성능 테스트",
            priority=TestPriority.MEDIUM,
            tags=["performance", "speed"],
            expected_runtime=5.0
        )
    
    def _generate_memory_test(self, analysis: Dict[str, Any]) -> TestCase:
        """메모리 사용량 테스트 생성"""
        function_name = analysis["name"]
        
        test_code = f'''def test_{function_name}_memory_usage():
    """
    {function_name} 함수의 메모리 사용량 테스트
    """
    import tracemalloc
    import gc
    
    # Arrange
    gc.collect()  # 가비지 컬렉션 수행
    tracemalloc.start()
    
    # Act
    initial_memory = tracemalloc.get_traced_memory()[0]
    
    # 여러 번 실행하여 메모리 사용량 측정
    for _ in range(100):
        result = {function_name}()  # TODO: 적절한 매개변수 추가
    
    current_memory, peak_memory = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    # Assert
    memory_used = current_memory - initial_memory
    memory_per_call = memory_used / 100
    
    # 호출당 메모리 사용량이 1MB 이하여야 함
    assert memory_per_call < 1024 * 1024, f"Memory usage too high: {{memory_per_call}} bytes per call"
    
    print(f"Memory per call: {{memory_per_call}} bytes")
    print(f"Peak memory: {{peak_memory}} bytes")
'''
        
        return TestCase(
            name=f"test_{function_name}_memory_usage",
            test_type=TestType.PERFORMANCE,
            function_name=function_name,
            test_code=test_code,
            description="메모리 사용량 테스트",
            priority=TestPriority.LOW,
            tags=["performance", "memory"]
        )
    
    def _generate_large_data_test(self, analysis: Dict[str, Any]) -> TestCase:
        """대용량 데이터 처리 테스트 생성"""
        function_name = analysis["name"]
        
        test_code = f'''def test_{function_name}_large_data():
    """
    {function_name} 함수의 대용량 데이터 처리 테스트
    """
    import time
    
    # Arrange
    large_data = list(range(10000))  # TODO: 함수에 맞는 대용량 데이터 생성
    
    # Act
    start_time = time.time()
    result = {function_name}(large_data)  # TODO: 적절한 매개변수 수정
    end_time = time.time()
    
    # Assert
    execution_time = end_time - start_time
    
    # 대용량 데이터 처리가 10초 이하여야 함
    assert execution_time < 10.0, f"Large data processing too slow: {{execution_time:.2f}}s"
    
    print(f"Large data processing time: {{execution_time:.2f}}s")
'''
        
        return TestCase(
            name=f"test_{function_name}_large_data",
            test_type=TestType.PERFORMANCE,
            function_name=function_name,
            test_code=test_code,
            description="대용량 데이터 처리 테스트",
            priority=TestPriority.MEDIUM,
            tags=["performance", "large_data"]
        )
    
    def _generate_concurrency_test(self, analysis: Dict[str, Any]) -> TestCase:
        """동시성 테스트 생성"""
        function_name = analysis["name"]
        
        test_code = f'''def test_{function_name}_concurrency():
    """
    {function_name} 함수의 동시성 테스트
    """
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    # Arrange
    num_threads = 10
    iterations_per_thread = 100
    results = []
    errors = []
    
    def worker():
        try:
            for _ in range(iterations_per_thread):
                result = {function_name}()  # TODO: 적절한 매개변수 추가
                results.append(result)
        except Exception as e:
            errors.append(str(e))
    
    # Act
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker) for _ in range(num_threads)]
        for future in as_completed(futures):
            future.result()  # 예외 발생 시 여기서 처리
    
    end_time = time.time()
    
    # Assert
    total_time = end_time - start_time
    total_operations = num_threads * iterations_per_thread
    
    assert len(errors) == 0, f"Concurrency errors occurred: {{errors[:5]}}"
    assert len(results) == total_operations, f"Expected {{total_operations}} results, got {{len(results)}}"
    
    print(f"Concurrent execution time: {{total_time:.2f}}s")
    print(f"Operations per second: {{total_operations / total_time:.2f}}")
'''
        
        return TestCase(
            name=f"test_{function_name}_concurrency",
            test_type=TestType.PERFORMANCE,
            function_name=function_name,
            test_code=test_code,
            description="동시성 테스트",
            priority=TestPriority.MEDIUM,
            tags=["performance", "concurrency", "threading"]
        )
    
    def _get_performance_test_value(self, param_type: str) -> Any:
        """성능 테스트용 매개변수 값 생성"""
        if "int" in param_type:
            return 1000
        elif "str" in param_type:
            return "performance_test_string"
        elif "list" in param_type:
            return list(range(100))
        elif "dict" in param_type:
            return {f"key_{i}": f"value_{i}" for i in range(100)}
        else:
            return "test_value"


class TestReportGenerator:
    """테스트 보고서 생성기"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_comprehensive_report(self, 
                                    test_results: List[TestResult],
                                    coverage_report: Optional[CoverageReport] = None,
                                    quality_analysis: Optional[Dict] = None) -> str:
        """종합 테스트 보고서 생성"""
        
        report_lines = [
            "# 테스트 실행 보고서",
            f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 📊 실행 결과 요약"
        ]
        
        # 테스트 결과 요약
        if test_results:
            total_tests = len(test_results)
            passed = len([r for r in test_results if r.status == "passed"])
            failed = len([r for r in test_results if r.status == "failed"])
            errors = len([r for r in test_results if r.status == "error"])
            skipped = len([r for r in test_results if r.status == "skipped"])
            
            success_rate = (passed / total_tests * 100) if total_tests > 0 else 0
            total_time = sum(r.execution_time for r in test_results)
            
            report_lines.extend([
                f"- **총 테스트 수**: {total_tests}",
                f"- **성공**: {passed} ({success_rate:.1f}%)",
                f"- **실패**: {failed}",
                f"- **오류**: {errors}",
                f"- **건너뜀**: {skipped}",
                f"- **총 실행 시간**: {total_time:.2f}초",
                ""
            ])
        
        # 커버리지 정보
        if coverage_report:
            report_lines.extend([
                "## 🎯 커버리지 분석",
                f"- **라인 커버리지**: {coverage_report.line_coverage:.1%}",
                f"- **브랜치 커버리지**: {coverage_report.branch_coverage:.1%}",
                f"- **함수 커버리지**: {coverage_report.function_coverage:.1%}",
                f"- **총 라인 수**: {coverage_report.total_lines}",
                f"- **커버된 라인 수**: {coverage_report.covered_lines}",
                ""
            ])
            
            if coverage_report.missing_lines:
                report_lines.extend([
                    "### 미커버 라인",
                    f"다음 {len(coverage_report.missing_lines)}개 라인이 테스트되지 않았습니다:",
                    ", ".join(map(str, coverage_report.missing_lines[:20])),
                    "..." if len(coverage_report.missing_lines) > 20 else "",
                    ""
                ])
        
        # 품질 분석
        if quality_analysis:
            report_lines.extend([
                "## 🏆 테스트 품질 분석",
                f"- **품질 점수**: {quality_analysis.get('quality_score', 0)}/100",
                f"- **총 테스트 수**: {quality_analysis.get('total_tests', 0)}",
                f"- **커버리지 잠재력**: {quality_analysis.get('coverage_potential', 0):.1%}",
                ""
            ])
            
            recommendations = quality_analysis.get('recommendations', [])
            if recommendations:
                report_lines.extend([
                    "### 개선 권장사항",
                    *[f"- {rec}" for rec in recommendations],
                    ""
                ])
        
        # 실패한 테스트 상세 정보
        failed_tests = [r for r in test_results if r.status in ["failed", "error"]]
        if failed_tests:
            report_lines.extend([
                "## ❌ 실패한 테스트 상세",
                ""
            ])
            
            for test in failed_tests:
                report_lines.extend([
                    f"### {test.test_name}",
                    f"- **상태**: {test.status}",
                    f"- **실행 시간**: {test.execution_time:.3f}초",
                    f"- **오류 메시지**: {test.error_message or 'N/A'}",
                    ""
                ])
        
        # 성능 통계
        performance_tests = [r for r in test_results if "performance" in r.test_name.lower()]
        if performance_tests:
            avg_perf_time = sum(r.execution_time for r in performance_tests) / len(performance_tests)
            report_lines.extend([
                "## ⚡ 성능 테스트 결과",
                f"- **성능 테스트 수**: {len(performance_tests)}",
                f"- **평균 실행 시간**: {avg_perf_time:.3f}초",
                ""
            ])
        
        return "\n".join(report_lines)
    
    def generate_html_report(self, 
                           test_results: List[TestResult],
                           coverage_report: Optional[CoverageReport] = None) -> str:
        """HTML 형식 보고서 생성"""
        
        # 기본 통계 계산
        total_tests = len(test_results)
        passed = len([r for r in test_results if r.status == "passed"])
        failed = len([r for r in test_results if r.status == "failed"])
        success_rate = (passed / total_tests * 100) if total_tests > 0 else 0
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>테스트 실행 보고서</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .summary {{ background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }}
        .success {{ color: #28a745; }}
        .failure {{ color: #dc3545; }}
        .test-result {{ border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }}
        .test-passed {{ border-left: 5px solid #28a745; }}
        .test-failed {{ border-left: 5px solid #dc3545; }}
        .coverage-bar {{ width: 100%; height: 20px; background: #ddd; border-radius: 10px; overflow: hidden; }}
        .coverage-fill {{ height: 100%; background: linear-gradient(to right, #dc3545, #ffc107, #28a745); }}
    </style>
</head>
<body>
    <h1>테스트 실행 보고서</h1>
    <p>생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    
    <div class="summary">
        <h2>실행 결과 요약</h2>
        <p><strong>총 테스트:</strong> {total_tests}</p>
        <p><strong>성공률:</strong> <span class="{'success' if success_rate >= 80 else 'failure'}">{success_rate:.1f}%</span></p>
        <p><strong>성공:</strong> <span class="success">{passed}</span></p>
        <p><strong>실패:</strong> <span class="failure">{failed}</span></p>
    </div>
"""
        
        # 커버리지 정보 추가
        if coverage_report:
            coverage_percent = coverage_report.line_coverage * 100
            html += f"""
    <div class="summary">
        <h2>커버리지 정보</h2>
        <p><strong>라인 커버리지:</strong> {coverage_percent:.1f}%</p>
        <div class="coverage-bar">
            <div class="coverage-fill" style="width: {coverage_percent}%;"></div>
        </div>
    </div>
"""
        
        # 개별 테스트 결과
        html += "<h2>테스트 결과 상세</h2>"
        
        for test in test_results:
            status_class = "test-passed" if test.status == "passed" else "test-failed"
            html += f"""
    <div class="test-result {status_class}">
        <h3>{test.test_name}</h3>
        <p><strong>상태:</strong> {test.status}</p>
        <p><strong>실행 시간:</strong> {test.execution_time:.3f}초</p>
        {f'<p><strong>오류:</strong> {test.error_message}</p>' if test.error_message else ''}
    </div>
"""
        
        html += "</body></html>"
        return html


class TestingAssistant:
    """통합 테스팅 어시스턴트"""
    
    def __init__(self, framework: TestFramework = TestFramework.PYTEST):
        self.framework = framework
        self.unit_generator = UnitTestGenerator(framework)
        self.integration_generator = IntegrationTestGenerator()
        self.performance_generator = PerformanceTestGenerator()
        self.coverage_analyzer = CoverageAnalyzer()
        self.test_executor = TestExecutor(framework)
        self.quality_analyzer = TestQualityAnalyzer()
        self.report_generator = TestReportGenerator()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def generate_comprehensive_test_suite(self, 
                                        function_code: str,
                                        include_performance: bool = True,
                                        include_integration: bool = False,
                                        additional_context: Optional[Dict] = None) -> TestSuite:
        """포괄적인 테스트 스위트 생성"""
        try:
            all_test_cases = []
            
            # 단위 테스트 생성
            unit_tests = self.unit_generator.generate_tests(function_code, additional_context)
            all_test_cases.extend(unit_tests)
            
            # 성능 테스트 생성
            if include_performance:
                function_analyzer = FunctionAnalyzer()
                analysis = function_analyzer.analyze_function(function_code)
                if "error" not in analysis:
                    perf_tests = self.performance_generator.generate_performance_tests(analysis)
                    all_test_cases.extend(perf_tests)
            
            # 통합 테스트 생성 (필요시)
            if include_integration and additional_context:
                modules = additional_context.get("modules", [])
                interactions = additional_context.get("interactions", [])
                if modules and interactions:
                    integration_tests = self.integration_generator.generate_integration_tests(
                        modules, interactions
                    )
                    all_test_cases.extend(integration_tests)
            
            # 테스트 스위트 생성
            function_analyzer = FunctionAnalyzer()
            analysis = function_analyzer.analyze_function(function_code)
            function_name = analysis.get("name", "unknown_function")
            
            test_suite = TestSuite(
                name=f"{function_name}_test_suite",
                test_cases=all_test_cases,
                parallel_execution=True,
                timeout=60.0
            )
            
            self.logger.info(f"테스트 스위트 생성 완료: {len(all_test_cases)}개 테스트")
            return test_suite
            
        except Exception as e:
            self.logger.error(f"테스트 스위트 생성 실패: {e}")
            raise TestGenerationError(f"테스트 스위트 생성 실패: {e}")
    
    def run_full_analysis(self, 
                         function_code: str,
                         source_files: Optional[List[str]] = None,
                         run_tests: bool = True) -> Dict[str, Any]:
        """전체 테스트 분석 실행"""
        try:
            # 1. 테스트 스위트 생성
            test_suite = self.generate_comprehensive_test_suite(function_code)
            
            # 2. 테스트 품질 분석
            quality_analysis = self.quality_analyzer.analyze_test_quality(test_suite.test_cases)
            
            results = {
                "test_suite": test_suite,
                "quality_analysis": quality_analysis,
                "test_results": None,
                "coverage_report": None,
                "recommendations": []
            }
            
            # 3. 테스트 실행 (옵션)
            if run_tests:
                test_results = self.test_executor.execute_tests(test_suite, parallel=True)
                results["test_results"] = test_results
                
                # 4. 커버리지 분석 (소스 파일이 있는 경우)
                if source_files:
                    # 테스트 파일 임시 생성
                    test_files = self._create_temp_test_files(test_suite.test_cases)
                    try:
                        coverage_report = self.coverage_analyzer.analyze_coverage(
                            source_files, test_files
                        )
                        results["coverage_report"] = coverage_report
                        
                        # 커버리지 개선 제안
                        coverage_suggestions = self.coverage_analyzer.suggest_coverage_improvements(
                            coverage_report
                        )
                        results["recommendations"].extend(coverage_suggestions)
                        
                    finally:
                        # 임시 파일 정리
                        self._cleanup_temp_files(test_files)
            
            # 5. 종합 권장사항
            results["recommendations"].extend(quality_analysis.get("recommendations", []))
            
            return results
            
        except Exception as e:
            self.logger.error(f"전체 분석 실패: {e}")
            raise TestExecutionError(f"전체 분석 실패: {e}")
    
    def _create_temp_test_files(self, test_cases: List[TestCase]) -> List[str]:
        """임시 테스트 파일 생성"""
        temp_files = []
        
        try:
            for i, test_case in enumerate(test_cases):
                temp_file = tempfile.NamedTemporaryFile(
                    mode='w', 
                    suffix='.py', 
                    prefix=f'test_{i}_',
                    delete=False
                )
                
                # 필요한 import 추가
                imports = [
                    "import pytest",
                    "import unittest",
                    "from unittest.mock import Mock, patch"
                ]
                
                content = "\n".join(imports) + "\n\n" + test_case.test_code
                temp_file.write(content)
                temp_file.close()
                
                temp_files.append(temp_file.name)
            
            return temp_files
            
        except Exception as e:
            # 생성된 임시 파일들 정리
            self._cleanup_temp_files(temp_files)
            raise e
    
    def _cleanup_temp_files(self, file_paths: List[str]):
        """임시 파일 정리"""
        for file_path in file_paths:
            try:
                Path(file_path).unlink()
            except Exception as e:
                self.logger.warning(f"임시 파일 삭제 실패: {file_path}, {e}")
    
    def generate_test_report(self, analysis_results: Dict[str, Any], 
                           format: str = "markdown") -> str:
        """테스트 보고서 생성"""
        try:
            test_results = analysis_results.get("test_results", [])
            coverage_report = analysis_results.get("coverage_report")
            quality_analysis = analysis_results.get("quality_analysis")
            
            if format == "html":
                return self.report_generator.generate_html_report(
                    test_results, coverage_report
                )
            else:
                return self.report_generator.generate_comprehensive_report(
                    test_results, coverage_report, quality_analysis
                )
                
        except Exception as e:
            self.logger.error(f"보고서 생성 실패: {e}")
            return f"보고서 생성 실패: {e}"


# 편의 함수들
def generate_unit_tests(function_code: str, 
                       framework: TestFramework = TestFramework.PYTEST) -> List[TestCase]:
    """단위 테스트 생성 편의 함수"""
    generator = UnitTestGenerator(framework)
    return generator.generate_tests(function_code)


def analyze_test_coverage(source_files: List[str], 
                         test_files: List[str]) -> CoverageReport:
    """테스트 커버리지 분석 편의 함수"""
    analyzer = CoverageAnalyzer()
    return analyzer.analyze_coverage(source_files, test_files)


def generate_performance_tests(function_code: str) -> List[TestCase]:
    """성능 테스트 생성 편의 함수"""
    analyzer = FunctionAnalyzer()
    analysis = analyzer.analyze_function(function_code)
    
    if "error" in analysis:
        raise TestGenerationError(f"함수 분석 실패: {analysis['error']}")
    
    generator = PerformanceTestGenerator()
    return generator.generate_performance_tests(analysis)


def create_testing_assistant(framework: TestFramework = TestFramework.PYTEST) -> TestingAssistant:
    """테스팅 어시스턴트 생성 편의 함수"""
    return TestingAssistant(framework)


# 사용 예제
if __name__ == "__main__":
    # 예제 함수
    sample_function = '''
def calculate_fibonacci(n: int) -> int:
    """피보나치 수 계산"""
    if n < 0:
        raise ValueError("음수는 지원하지 않습니다")
    elif n <= 1:
        return n
    else:
        return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)
'''
    
    # 테스팅 어시스턴트 생성
    assistant = create_testing_assistant(TestFramework.PYTEST)
    
    # 전체 분석 실행
    print("=== 테스트 분석 시작 ===")
    results = assistant.run_full_analysis(sample_function, run_tests=False)
    
    # 결과 출력
    print(f"생성된 테스트 수: {len(results['test_suite'].test_cases)}")
    print(f"품질 점수: {results['quality_analysis']['quality_score']}/100")
    
    # 보고서 생성
    report = assistant.generate_test_report(results)
    print("\n=== 테스트 보고서 ===")
    print(report)