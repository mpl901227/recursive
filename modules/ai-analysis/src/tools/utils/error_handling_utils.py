#!/usr/bin/env python3
"""
Enhanced Error Handling Utilities
지능형 에러 처리, 디버깅, 분석 및 AI 기반 에러 수정 제안 도구들

주요 기능:
- 에러 패턴 분석 및 분류
- AI 기반 에러 수정 제안
- 자동 에러 처리 코드 생성
- 에러 예측 및 예방
- 컨텍스트 기반 디버깅 지원
- 에러 로그 분석 및 시각화
- 성능 영향 분석
- 자동 복구 메커니즘
"""

import ast
import asyncio
import inspect
import logging
import re
import sys
import traceback
import time
import threading
import json
from collections import defaultdict, Counter, deque
from contextlib import contextmanager, asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum, auto
from functools import wraps, lru_cache
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Iterator, 
    Callable, Type, TypeVar, Generic, Protocol, runtime_checkable
)
import warnings
from concurrent.futures import ThreadPoolExecutor
import weakref

# 타입 변수
T = TypeVar('T')
ExceptionType = TypeVar('ExceptionType', bound=BaseException)

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class ErrorSeverity(Enum):
    """에러 심각도"""
    TRACE = "trace"
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    FATAL = "fatal"


class ErrorCategory(Enum):
    """에러 카테고리"""
    SYNTAX = auto()
    RUNTIME = auto()
    LOGIC = auto()
    PERFORMANCE = auto()
    SECURITY = auto()
    NETWORK = auto()
    IO = auto()
    MEMORY = auto()
    CONCURRENCY = auto()
    DATABASE = auto()
    API = auto()
    CONFIGURATION = auto()
    DEPENDENCY = auto()
    UNKNOWN = auto()


class RecoveryStrategy(Enum):
    """복구 전략"""
    RETRY = auto()
    FALLBACK = auto()
    IGNORE = auto()
    FAIL_FAST = auto()
    CIRCUIT_BREAKER = auto()
    BULKHEAD = auto()
    TIMEOUT = auto()
    CUSTOM = auto()


class ErrorPattern(Enum):
    """에러 패턴"""
    FREQUENT = auto()           # 빈번한 에러
    CASCADING = auto()          # 연쇄 에러
    INTERMITTENT = auto()       # 간헐적 에러
    PERFORMANCE_DEGRADATION = auto()  # 성능 저하
    RESOURCE_EXHAUSTION = auto()      # 리소스 고갈
    DEPENDENCY_FAILURE = auto()       # 의존성 실패


# 데이터 클래스들
@dataclass
class ErrorContext:
    """에러 컨텍스트 정보"""
    timestamp: datetime
    thread_id: int
    process_id: int
    function_name: str
    file_path: str
    line_number: int
    local_variables: Dict[str, Any]
    call_stack: List[str]
    system_info: Dict[str, Any]
    user_context: Optional[Dict[str, Any]] = None


@dataclass
class ErrorMetrics:
    """에러 메트릭"""
    count: int = 0
    first_occurrence: Optional[datetime] = None
    last_occurrence: Optional[datetime] = None
    frequency: float = 0.0
    impact_score: float = 0.0
    resolution_time: Optional[float] = None
    success_rate: float = 1.0


@dataclass
class ErrorSuggestion:
    """에러 수정 제안"""
    suggestion_id: str
    title: str
    description: str
    code_fix: Optional[str]
    confidence: float
    category: str
    estimated_effort: str  # "low", "medium", "high"
    references: List[str]
    examples: List[str]


@dataclass
class ErrorAnalysis:
    """에러 분석 결과"""
    error_type: str
    category: ErrorCategory
    severity: ErrorSeverity
    pattern: ErrorPattern
    root_cause: str
    suggestions: List[ErrorSuggestion]
    similar_errors: List[str]
    impact_assessment: Dict[str, Any]
    prevention_measures: List[str]


@dataclass
class RecoveryAction:
    """복구 작업"""
    strategy: RecoveryStrategy
    action: Callable
    max_attempts: int
    backoff_factor: float
    timeout: Optional[float]
    conditions: List[Callable[[Exception], bool]]


# 커스텀 예외 클래스들
class ErrorHandlingError(Exception):
    """에러 처리 관련 기본 예외"""
    pass


class RecoveryFailedException(ErrorHandlingError):
    """복구 실패 예외"""
    def __init__(self, original_error: Exception, recovery_attempts: int):
        self.original_error = original_error
        self.recovery_attempts = recovery_attempts
        super().__init__(f"Recovery failed after {recovery_attempts} attempts: {original_error}")


class CircuitBreakerOpenException(ErrorHandlingError):
    """서킷 브레이커 오픈 예외"""
    pass


# 프로토콜 정의
@runtime_checkable
class ErrorReporter(Protocol):
    """에러 리포터 프로토콜"""
    
    def report_error(self, error: Exception, context: ErrorContext) -> None:
        """에러 보고"""
        ...
    
    def report_recovery(self, error: Exception, strategy: RecoveryStrategy) -> None:
        """복구 보고"""
        ...


class CircuitBreaker:
    """서킷 브레이커 패턴 구현"""
    
    def __init__(self, failure_threshold: int = 5, timeout: float = 60.0, 
                 expected_exception: Type[Exception] = Exception):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        self._lock = threading.RLock()
    
    def __call__(self, func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            with self._lock:
                if self.state == "OPEN":
                    if self._should_attempt_reset():
                        self.state = "HALF_OPEN"
                    else:
                        raise CircuitBreakerOpenException("Circuit breaker is OPEN")
                
                try:
                    result = func(*args, **kwargs)
                    self._on_success()
                    return result
                except self.expected_exception as e:
                    self._on_failure()
                    raise
        
        return wrapper
    
    def _should_attempt_reset(self) -> bool:
        """리셋 시도 여부 판단"""
        return (self.last_failure_time and 
                time.time() - self.last_failure_time >= self.timeout)
    
    def _on_success(self) -> None:
        """성공 시 처리"""
        self.failure_count = 0
        self.state = "CLOSED"
    
    def _on_failure(self) -> None:
        """실패 시 처리"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"


class ErrorTracker:
    """에러 추적기"""
    
    def __init__(self, max_errors: int = 10000):
        self.max_errors = max_errors
        self._errors: deque = deque(maxlen=max_errors)
        self._error_counts: Counter = Counter()
        self._error_metrics: Dict[str, ErrorMetrics] = defaultdict(ErrorMetrics)
        self._lock = threading.RLock()
    
    def track_error(self, error: Exception, context: ErrorContext) -> None:
        """에러 추적"""
        with self._lock:
            error_key = f"{type(error).__name__}:{str(error)}"
            timestamp = datetime.now()
            
            # 에러 저장
            self._errors.append({
                'error': error,
                'context': context,
                'timestamp': timestamp,
                'key': error_key
            })
            
            # 카운트 증가
            self._error_counts[error_key] += 1
            
            # 메트릭 업데이트
            metrics = self._error_metrics[error_key]
            metrics.count += 1
            
            if metrics.first_occurrence is None:
                metrics.first_occurrence = timestamp
            metrics.last_occurrence = timestamp
            
            # 빈도 계산 (에러/시간)
            if metrics.first_occurrence:
                time_diff = (timestamp - metrics.first_occurrence).total_seconds()
                metrics.frequency = metrics.count / max(time_diff, 1.0)
    
    def get_error_patterns(self, window_hours: int = 24) -> Dict[ErrorPattern, List[Dict]]:
        """에러 패턴 분석"""
        cutoff_time = datetime.now() - timedelta(hours=window_hours)
        recent_errors = [
            err for err in self._errors 
            if err['timestamp'] > cutoff_time
        ]
        
        patterns = {
            ErrorPattern.FREQUENT: [],
            ErrorPattern.CASCADING: [],
            ErrorPattern.INTERMITTENT: [],
            ErrorPattern.PERFORMANCE_DEGRADATION: [],
            ErrorPattern.RESOURCE_EXHAUSTION: [],
            ErrorPattern.DEPENDENCY_FAILURE: []
        }
        
        # 빈번한 에러 탐지
        error_counts = Counter(err['key'] for err in recent_errors)
        for error_key, count in error_counts.most_common(10):
            if count > len(recent_errors) * 0.1:  # 10% 이상
                patterns[ErrorPattern.FREQUENT].append({
                    'error_key': error_key,
                    'count': count,
                    'percentage': count / len(recent_errors) * 100
                })
        
        # 연쇄 에러 탐지
        cascading_groups = self._detect_cascading_errors(recent_errors)
        patterns[ErrorPattern.CASCADING] = cascading_groups
        
        # 리소스 고갈 에러 탐지
        resource_errors = [
            err for err in recent_errors
            if any(keyword in str(err['error']).lower() 
                  for keyword in ['memory', 'disk', 'cpu', 'connection', 'timeout'])
        ]
        patterns[ErrorPattern.RESOURCE_EXHAUSTION] = resource_errors
        
        return patterns
    
    def _detect_cascading_errors(self, errors: List[Dict]) -> List[Dict]:
        """연쇄 에러 탐지"""
        cascading_groups = []
        
        # 시간순 정렬
        sorted_errors = sorted(errors, key=lambda x: x['timestamp'])
        
        # 5분 내에 발생한 에러들을 그룹화
        current_group = []
        group_start_time = None
        
        for error in sorted_errors:
            if not current_group:
                current_group = [error]
                group_start_time = error['timestamp']
            else:
                time_diff = (error['timestamp'] - group_start_time).total_seconds()
                if time_diff <= 300:  # 5분
                    current_group.append(error)
                else:
                    if len(current_group) >= 3:  # 3개 이상이면 연쇄로 판단
                        cascading_groups.append({
                            'errors': current_group,
                            'duration': (current_group[-1]['timestamp'] - current_group[0]['timestamp']).total_seconds(),
                            'count': len(current_group)
                        })
                    current_group = [error]
                    group_start_time = error['timestamp']
        
        # 마지막 그룹 처리
        if len(current_group) >= 3:
            cascading_groups.append({
                'errors': current_group,
                'duration': (current_group[-1]['timestamp'] - current_group[0]['timestamp']).total_seconds(),
                'count': len(current_group)
            })
        
        return cascading_groups
    
    def get_error_statistics(self) -> Dict[str, Any]:
        """에러 통계 반환"""
        with self._lock:
            total_errors = len(self._errors)
            
            if total_errors == 0:
                return {"total_errors": 0}
            
            # 최근 24시간 에러
            recent_cutoff = datetime.now() - timedelta(hours=24)
            recent_errors = sum(1 for err in self._errors if err['timestamp'] > recent_cutoff)
            
            # 가장 빈번한 에러
            most_common = self._error_counts.most_common(5)
            
            return {
                "total_errors": total_errors,
                "recent_24h": recent_errors,
                "most_common_errors": most_common,
                "error_rate_per_hour": recent_errors / 24.0,
                "unique_error_types": len(self._error_counts),
                "avg_errors_per_type": total_errors / len(self._error_counts) if self._error_counts else 0
            }


class ErrorAnalyzer:
    """에러 분석기"""
    
    def __init__(self):
        self.error_patterns = self._load_error_patterns()
        self.fix_suggestions = self._load_fix_suggestions()
    
    def _load_error_patterns(self) -> Dict[str, Dict[str, Any]]:
        """에러 패턴 데이터 로드"""
        return {
            "ImportError": {
                "category": ErrorCategory.DEPENDENCY,
                "severity": ErrorSeverity.ERROR,
                "common_causes": ["Missing package", "Incorrect import path", "Virtual environment issue"],
                "detection_patterns": [r"No module named '(.+)'", r"cannot import name '(.+)'"]
            },
            "KeyError": {
                "category": ErrorCategory.LOGIC,
                "severity": ErrorSeverity.ERROR,
                "common_causes": ["Missing dictionary key", "Incorrect key name", "Empty dictionary"],
                "detection_patterns": [r"KeyError: '(.+)'"]
            },
            "FileNotFoundError": {
                "category": ErrorCategory.IO,
                "severity": ErrorSeverity.ERROR,
                "common_causes": ["Incorrect file path", "File deleted", "Permission issue"],
                "detection_patterns": [r"No such file or directory: '(.+)'"]
            },
            "ConnectionError": {
                "category": ErrorCategory.NETWORK,
                "severity": ErrorSeverity.WARNING,
                "common_causes": ["Network connectivity", "Service unavailable", "Timeout"],
                "detection_patterns": [r"Connection refused", r"Network is unreachable"]
            },
            "MemoryError": {
                "category": ErrorCategory.MEMORY,
                "severity": ErrorSeverity.CRITICAL,
                "common_causes": ["Insufficient memory", "Memory leak", "Large data processing"],
                "detection_patterns": [r"MemoryError"]
            },
            "RecursionError": {
                "category": ErrorCategory.LOGIC,
                "severity": ErrorSeverity.ERROR,
                "common_causes": ["Infinite recursion", "Deep recursion", "Missing base case"],
                "detection_patterns": [r"maximum recursion depth exceeded"]
            }
        }
    
    def _load_fix_suggestions(self) -> Dict[str, List[ErrorSuggestion]]:
        """수정 제안 데이터 로드"""
        return {
            "ImportError": [
                ErrorSuggestion(
                    suggestion_id="import_install_package",
                    title="패키지 설치",
                    description="누락된 패키지를 설치하세요",
                    code_fix="pip install {package_name}",
                    confidence=0.9,
                    category="dependency",
                    estimated_effort="low",
                    references=["https://pip.pypa.io/en/stable/"],
                    examples=["pip install requests", "pip install numpy"]
                ),
                ErrorSuggestion(
                    suggestion_id="import_check_path",
                    title="임포트 경로 확인",
                    description="임포트 경로가 올바른지 확인하세요",
                    code_fix="# Check if the module path is correct\nimport sys\nprint(sys.path)",
                    confidence=0.7,
                    category="configuration",
                    estimated_effort="low",
                    references=["https://docs.python.org/3/tutorial/modules.html"],
                    examples=["from mypackage.mymodule import MyClass"]
                )
            ],
            "KeyError": [
                ErrorSuggestion(
                    suggestion_id="keyerror_use_get",
                    title="dict.get() 사용",
                    description="dict.get()을 사용하여 안전하게 키에 접근하세요",
                    code_fix="value = my_dict.get('{key}', default_value)",
                    confidence=0.95,
                    category="logic",
                    estimated_effort="low",
                    references=["https://docs.python.org/3/library/stdtypes.html#dict.get"],
                    examples=["name = user.get('name', 'Unknown')"]
                ),
                ErrorSuggestion(
                    suggestion_id="keyerror_check_key",
                    title="키 존재 여부 확인",
                    description="키가 존재하는지 먼저 확인하세요",
                    code_fix="if '{key}' in my_dict:\n    value = my_dict['{key}']",
                    confidence=0.8,
                    category="logic",
                    estimated_effort="low",
                    references=["https://docs.python.org/3/tutorial/datastructures.html#dictionaries"],
                    examples=["if 'email' in user_data:\n    email = user_data['email']"]
                )
            ],
            "FileNotFoundError": [
                ErrorSuggestion(
                    suggestion_id="file_check_exists",
                    title="파일 존재 여부 확인",
                    description="파일이 존재하는지 먼저 확인하세요",
                    code_fix="import os\nif os.path.exists('{file_path}'):\n    with open('{file_path}', 'r') as f:\n        content = f.read()",
                    confidence=0.9,
                    category="io",
                    estimated_effort="low",
                    references=["https://docs.python.org/3/library/os.path.html#os.path.exists"],
                    examples=["if os.path.exists('config.json'):"]
                ),
                ErrorSuggestion(
                    suggestion_id="file_use_pathlib",
                    title="pathlib 사용",
                    description="pathlib을 사용하여 더 안전하게 파일을 처리하세요",
                    code_fix="from pathlib import Path\nfile_path = Path('{file_path}')\nif file_path.exists():\n    content = file_path.read_text()",
                    confidence=0.85,
                    category="io",
                    estimated_effort="medium",
                    references=["https://docs.python.org/3/library/pathlib.html"],
                    examples=["Path('data.txt').read_text()"]
                )
            ]
        }
    
    def analyze_error(self, error: Exception, context: ErrorContext) -> ErrorAnalysis:
        """에러 분석"""
        error_type = type(error).__name__
        error_message = str(error)
        
        # 패턴 매칭으로 카테고리 결정
        pattern_info = self.error_patterns.get(error_type, {})
        category = pattern_info.get("category", ErrorCategory.UNKNOWN)
        severity = pattern_info.get("severity", ErrorSeverity.ERROR)
        
        # 패턴 분석
        pattern = self._detect_error_pattern(error, context)
        
        # 근본 원인 분석
        root_cause = self._analyze_root_cause(error, context, pattern_info)
        
        # 수정 제안 생성
        suggestions = self._generate_suggestions(error_type, error_message, context)
        
        # 유사 에러 찾기
        similar_errors = self._find_similar_errors(error_type, error_message)
        
        # 영향 평가
        impact_assessment = self._assess_impact(error, context)
        
        # 예방 조치
        prevention_measures = self._suggest_prevention_measures(error_type, root_cause)
        
        return ErrorAnalysis(
            error_type=error_type,
            category=category,
            severity=severity,
            pattern=pattern,
            root_cause=root_cause,
            suggestions=suggestions,
            similar_errors=similar_errors,
            impact_assessment=impact_assessment,
            prevention_measures=prevention_measures
        )
    
    def _detect_error_pattern(self, error: Exception, context: ErrorContext) -> ErrorPattern:
        """에러 패턴 탐지"""
        # 간단한 패턴 탐지 로직
        error_message = str(error).lower()
        
        if "memory" in error_message or isinstance(error, MemoryError):
            return ErrorPattern.RESOURCE_EXHAUSTION
        elif "connection" in error_message or "network" in error_message:
            return ErrorPattern.DEPENDENCY_FAILURE
        elif "recursion" in error_message:
            return ErrorPattern.CASCADING
        else:
            return ErrorPattern.FREQUENT
    
    def _analyze_root_cause(self, error: Exception, context: ErrorContext, 
                           pattern_info: Dict[str, Any]) -> str:
        """근본 원인 분석"""
        common_causes = pattern_info.get("common_causes", [])
        error_message = str(error)
        
        # 패턴 매칭으로 구체적 원인 추출
        detection_patterns = pattern_info.get("detection_patterns", [])
        for pattern in detection_patterns:
            match = re.search(pattern, error_message)
            if match:
                extracted_info = match.group(1) if match.groups() else ""
                return f"{common_causes[0] if common_causes else 'Unknown cause'}: {extracted_info}"
        
        return common_causes[0] if common_causes else "Unknown root cause"
    
    def _generate_suggestions(self, error_type: str, error_message: str, 
                            context: ErrorContext) -> List[ErrorSuggestion]:
        """수정 제안 생성"""
        base_suggestions = self.fix_suggestions.get(error_type, [])
        
        # 컨텍스트 기반 제안 커스터마이징
        customized_suggestions = []
        for suggestion in base_suggestions:
            customized = ErrorSuggestion(
                suggestion_id=suggestion.suggestion_id,
                title=suggestion.title,
                description=suggestion.description,
                code_fix=self._customize_code_fix(suggestion.code_fix, error_message, context),
                confidence=suggestion.confidence,
                category=suggestion.category,
                estimated_effort=suggestion.estimated_effort,
                references=suggestion.references,
                examples=suggestion.examples
            )
            customized_suggestions.append(customized)
        
        return customized_suggestions
    
    def _customize_code_fix(self, code_fix: str, error_message: str, 
                          context: ErrorContext) -> str:
        """코드 수정 제안 커스터마이징"""
        if not code_fix:
            return ""
        
        # 에러 메시지에서 정보 추출
        customizations = {}
        
        # 파일 경로 추출
        if "No such file or directory" in error_message:
            file_match = re.search(r"'([^']+)'", error_message)
            if file_match:
                customizations["file_path"] = file_match.group(1)
        
        # 모듈명 추출
        if "No module named" in error_message:
            module_match = re.search(r"No module named '([^']+)'", error_message)
            if module_match:
                customizations["package_name"] = module_match.group(1)
        
        # 키 이름 추출
        if "KeyError" in error_message:
            key_match = re.search(r"KeyError: '([^']+)'", error_message)
            if key_match:
                customizations["key"] = key_match.group(1)
        
        # 템플릿 변수 치환
        for key, value in customizations.items():
            code_fix = code_fix.replace(f"{{{key}}}", value)
        
        return code_fix
    
    def _find_similar_errors(self, error_type: str, error_message: str) -> List[str]:
        """유사 에러 찾기"""
        # 간단한 유사 에러 매칭
        similar_errors = []
        
        if error_type == "ImportError":
            similar_errors = ["ModuleNotFoundError", "AttributeError"]
        elif error_type == "KeyError":
            similar_errors = ["AttributeError", "IndexError"]
        elif error_type == "FileNotFoundError":
            similar_errors = ["PermissionError", "IsADirectoryError", "OSError"]
        
        return similar_errors
    
    def _assess_impact(self, error: Exception, context: ErrorContext) -> Dict[str, Any]:
        """영향 평가"""
        return {
            "severity_score": self._calculate_severity_score(error),
            "business_impact": self._assess_business_impact(error, context),
            "performance_impact": self._assess_performance_impact(error, context),
            "user_impact": self._assess_user_impact(error, context)
        }
    
    def _calculate_severity_score(self, error: Exception) -> float:
        """심각도 점수 계산 (0.0 ~ 1.0)"""
        error_type = type(error).__name__
        
        severity_scores = {
            "MemoryError": 0.9,
            "SystemExit": 0.95,
            "KeyboardInterrupt": 0.3,
            "RecursionError": 0.8,
            "SyntaxError": 0.7,
            "ImportError": 0.6,
            "ConnectionError": 0.5,
            "FileNotFoundError": 0.4,
            "KeyError": 0.3,
            "ValueError": 0.3,
            "TypeError": 0.4
        }
        
        return severity_scores.get(error_type, 0.5)
    
    def _assess_business_impact(self, error: Exception, context: ErrorContext) -> str:
        """비즈니스 영향 평가"""
        error_type = type(error).__name__
        
        if error_type in ["MemoryError", "SystemExit"]:
            return "high"
        elif error_type in ["ConnectionError", "ImportError"]:
            return "medium"
        else:
            return "low"
    
    def _assess_performance_impact(self, error: Exception, context: ErrorContext) -> str:
        """성능 영향 평가"""
        error_type = type(error).__name__
        
        if error_type in ["MemoryError", "RecursionError"]:
            return "high"
        elif error_type in ["ConnectionError"]:
            return "medium"
        else:
            return "low"
    
    def _assess_user_impact(self, error: Exception, context: ErrorContext) -> str:
        """사용자 영향 평가"""
        # 함수명으로 사용자 대면 기능인지 판단
        function_name = context.function_name.lower()
        
        if any(keyword in function_name for keyword in ["api", "endpoint", "handler", "view", "controller"]):
            return "high"
        elif any(keyword in function_name for keyword in ["process", "worker", "task"]):
            return "medium"
        else:
            return "low"
    
    def _suggest_prevention_measures(self, error_type: str, root_cause: str) -> List[str]:
        """예방 조치 제안"""
        prevention_measures = {
            "ImportError": [
                "requirements.txt 파일을 최신 상태로 유지",
                "가상 환경 사용 권장",
                "CI/CD 파이프라인에서 의존성 검증"
            ],
            "KeyError": [
                "입력 데이터 검증 강화",
                "기본값 제공하는 dict.get() 사용",
                "API 응답 스키마 검증"
            ],
            "FileNotFoundError": [
                "파일 존재 여부 사전 확인",
                "설정 파일 경로 검증",
                "파일 권한 확인"
            ],
            "MemoryError": [
                "메모리 사용량 모니터링",
                "데이터 스트리밍 처리",
                "가비지 컬렉션 최적화"
            ]
        }
        
        return prevention_measures.get(error_type, ["코드 리뷰 강화", "단위 테스트 추가"])


class ErrorRecoveryManager:
    """에러 복구 관리자"""
    
    def __init__(self):
        self.recovery_strategies: Dict[str, List[RecoveryAction]] = defaultdict(list)
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        self.retry_counts: Dict[str, int] = defaultdict(int)
        self.recovery_history: List[Dict[str, Any]] = []
        self._lock = threading.RLock()
    
    def register_recovery_strategy(self, error_type: str, action: RecoveryAction) -> None:
        """복구 전략 등록"""
        with self._lock:
            self.recovery_strategies[error_type].append(action)
    
    def register_circuit_breaker(self, operation_name: str, 
                               circuit_breaker: CircuitBreaker) -> None:
        """서킷 브레이커 등록"""
        with self._lock:
            self.circuit_breakers[operation_name] = circuit_breaker
    
    async def attempt_recovery(self, error: Exception, context: ErrorContext) -> Optional[Any]:
        """복구 시도"""
        error_type = type(error).__name__
        recovery_actions = self.recovery_strategies.get(error_type, [])
        
        for action in recovery_actions:
            if self._should_attempt_recovery(action, error):
                try:
                    result = await self._execute_recovery_action(action, error, context)
                    self._record_recovery_success(error, action)
                    return result
                except Exception as recovery_error:
                    self._record_recovery_failure(error, action, recovery_error)
                    continue
        
        # 모든 복구 시도 실패
        raise RecoveryFailedException(error, len(recovery_actions))
    
    def _should_attempt_recovery(self, action: RecoveryAction, error: Exception) -> bool:
        """복구 시도 여부 판단"""
        # 조건 확인
        for condition in action.conditions:
            if not condition(error):
                return False
        
        # 최대 시도 횟수 확인
        error_key = f"{type(error).__name__}:{action.strategy.name}"
        return self.retry_counts[error_key] < action.max_attempts
    
    async def _execute_recovery_action(self, action: RecoveryAction, 
                                     error: Exception, context: ErrorContext) -> Any:
        """복구 작업 실행"""
        error_key = f"{type(error).__name__}:{action.strategy.name}"
        attempt_count = self.retry_counts[error_key]
        
        # 백오프 적용
        if attempt_count > 0:
            delay = action.backoff_factor ** attempt_count
            await asyncio.sleep(delay)
        
        self.retry_counts[error_key] += 1
        
        # 타임아웃 적용
        if action.timeout:
            return await asyncio.wait_for(
                self._call_recovery_action(action, error, context),
                timeout=action.timeout
            )
        else:
            return await self._call_recovery_action(action, error, context)
    
    async def _call_recovery_action(self, action: RecoveryAction, 
                                  error: Exception, context: ErrorContext) -> Any:
        """복구 함수 호출"""
        if asyncio.iscoroutinefunction(action.action):
            return await action.action(error, context)
        else:
            return action.action(error, context)
    
    def _record_recovery_success(self, error: Exception, action: RecoveryAction) -> None:
        """복구 성공 기록"""
        with self._lock:
            self.recovery_history.append({
                'timestamp': datetime.now(),
                'error_type': type(error).__name__,
                'error_message': str(error),
                'strategy': action.strategy.name,
                'success': True,
                'attempts': self.retry_counts.get(f"{type(error).__name__}:{action.strategy.name}", 0)
            })
            
            # 성공 시 카운트 리셋
            error_key = f"{type(error).__name__}:{action.strategy.name}"
            self.retry_counts[error_key] = 0
    
    def _record_recovery_failure(self, error: Exception, action: RecoveryAction, 
                               recovery_error: Exception) -> None:
        """복구 실패 기록"""
        with self._lock:
            self.recovery_history.append({
                'timestamp': datetime.now(),
                'error_type': type(error).__name__,
                'error_message': str(error),
                'strategy': action.strategy.name,
                'success': False,
                'recovery_error': str(recovery_error),
                'attempts': self.retry_counts.get(f"{type(error).__name__}:{action.strategy.name}", 0)
            })
    
    def get_recovery_statistics(self) -> Dict[str, Any]:
        """복구 통계 반환"""
        with self._lock:
            if not self.recovery_history:
                return {}
            
            total_attempts = len(self.recovery_history)
            successful_recoveries = sum(1 for r in self.recovery_history if r['success'])
            
            # 전략별 통계
            strategy_stats = defaultdict(lambda: {'attempts': 0, 'successes': 0})
            for record in self.recovery_history:
                strategy = record['strategy']
                strategy_stats[strategy]['attempts'] += 1
                if record['success']:
                    strategy_stats[strategy]['successes'] += 1
            
            return {
                'total_attempts': total_attempts,
                'successful_recoveries': successful_recoveries,
                'success_rate': successful_recoveries / total_attempts,
                'strategy_statistics': dict(strategy_stats)
            }


class ErrorCodeGenerator:
    """에러 처리 코드 자동 생성기"""
    
    def __init__(self):
        self.templates = self._load_code_templates()
    
    def _load_code_templates(self) -> Dict[str, str]:
        """코드 템플릿 로드"""
        return {
            "try_catch_basic": '''try:
    {original_code}
except {exception_type} as e:
    {error_handling_code}''',
            
            "try_catch_with_logging": '''import logging
logger = logging.getLogger(__name__)

try:
    {original_code}
except {exception_type} as e:
    logger.error(f"Error in {function_name}: {{e}}")
    {error_handling_code}''',
            
            "retry_with_backoff": '''import time
import random

def retry_with_backoff(func, max_retries=3, base_delay=1):
    for attempt in range(max_retries):
        try:
            return func()
        except {exception_type} as e:
            if attempt == max_retries - 1:
                raise e
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)

# Usage:
result = retry_with_backoff(lambda: {original_code})''',
            
            "circuit_breaker": '''class SimpleCircuitBreaker:
    def __init__(self, failure_threshold=3, timeout=60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"
    
    def call(self, func):
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.timeout:
                self.state = "HALF_OPEN"
            else:
                raise Exception("Circuit breaker is OPEN")
        
        try:
            result = func()
            if self.state == "HALF_OPEN":
                self.state = "CLOSED"
                self.failure_count = 0
            return result
        except {exception_type} as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
            raise e

# Usage:
circuit_breaker = SimpleCircuitBreaker()
result = circuit_breaker.call(lambda: {original_code})''',
            
            "validation_wrapper": '''def validate_input(func):
    def wrapper(*args, **kwargs):
        # Add your validation logic here
        {validation_code}
        return func(*args, **kwargs)
    return wrapper

@validate_input
def {function_name}({parameters}):
    {original_code}''',
            
            "safe_dict_access": '''def safe_get(dictionary, key, default=None):
    """Safely get value from dictionary"""
    return dictionary.get(key, default)

# Replace: dictionary['{key}']
# With: safe_get(dictionary, '{key}', {default_value})''',
            
            "file_handling": '''import os
from pathlib import Path

def safe_file_operation(file_path, operation="read"):
    """Safely handle file operations"""
    path = Path(file_path)
    
    if not path.exists():
        raise FileNotFoundError(f"File not found: {{file_path}}")
    
    if not path.is_file():
        raise ValueError(f"Path is not a file: {{file_path}}")
    
    try:
        if operation == "read":
            return path.read_text(encoding='utf-8')
        elif operation == "write":
            # Add write logic here
            pass
    except PermissionError:
        raise PermissionError(f"Permission denied: {{file_path}}")
    except Exception as e:
        raise Exception(f"Error processing file {{file_path}}: {{e}}")

# Usage:
content = safe_file_operation("{file_path}", "read")'''
        }
    
    def generate_error_handling_code(self, error: Exception, context: ErrorContext, 
                                   strategy: str = "try_catch_basic") -> str:
        """에러 처리 코드 생성"""
        error_type = type(error).__name__
        template = self.templates.get(strategy, self.templates["try_catch_basic"])
        
        # 컨텍스트에서 정보 추출
        function_name = context.function_name
        file_path = context.file_path
        
        # 원본 코드 추출 (간단한 버전)
        original_code = self._extract_original_code(context)
        
        # 에러 처리 코드 생성
        error_handling_code = self._generate_error_handling_logic(error, context)
        
        # 검증 코드 생성
        validation_code = self._generate_validation_code(error, context)
        
        # 매개변수 추출
        parameters = self._extract_function_parameters(context)
        
        # 템플릿 변수 치환
        replacements = {
            'original_code': original_code,
            'exception_type': error_type,
            'error_handling_code': error_handling_code,
            'function_name': function_name,
            'file_path': file_path,
            'validation_code': validation_code,
            'parameters': parameters
        }
        
        # KeyError 특화 처리
        if error_type == "KeyError":
            key_match = re.search(r"KeyError: '([^']+)'", str(error))
            if key_match:
                key = key_match.group(1)
                replacements['key'] = key
                replacements['default_value'] = 'None'
        
        # 템플릿 적용
        generated_code = template
        for key, value in replacements.items():
            generated_code = generated_code.replace(f'{{{key}}}', str(value))
        
        return generated_code
    
    def _extract_original_code(self, context: ErrorContext) -> str:
        """원본 코드 추출"""
        # 실제 구현에서는 AST나 소스 코드 파싱을 통해 추출
        return "# Original code here"
    
    def _generate_error_handling_logic(self, error: Exception, context: ErrorContext) -> str:
        """에러 처리 로직 생성"""
        error_type = type(error).__name__
        
        if error_type == "KeyError":
            return "# Handle missing key\nreturn None  # or appropriate default value"
        elif error_type == "FileNotFoundError":
            return "# Handle missing file\nlogger.warning(f'File not found: {e}')\nreturn None"
        elif error_type == "ConnectionError":
            return "# Handle connection error\nlogger.error(f'Connection failed: {e}')\nraise"
        else:
            return "# Handle error\nlogger.error(f'Unexpected error: {e}')\nraise"
    
    def _generate_validation_code(self, error: Exception, context: ErrorContext) -> str:
        """검증 코드 생성"""
        error_type = type(error).__name__
        
        if error_type == "TypeError":
            return "# Validate input types\nif not isinstance(args[0], expected_type):\n    raise TypeError('Invalid input type')"
        elif error_type == "ValueError":
            return "# Validate input values\nif not args or args[0] < 0:\n    raise ValueError('Invalid input value')"
        else:
            return "# Add input validation here"
    
    def _extract_function_parameters(self, context: ErrorContext) -> str:
        """함수 매개변수 추출"""
        # 실제 구현에서는 inspect나 AST를 사용
        return "*args, **kwargs"
    
    def generate_prevention_code(self, error_analysis: ErrorAnalysis) -> str:
        """예방 코드 생성"""
        prevention_templates = {
            ErrorCategory.IO: '''# File I/O Prevention
def safe_file_read(file_path):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except PermissionError:
        logger.error(f"Permission denied: {file_path}")
        raise
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        raise''',
            
            ErrorCategory.NETWORK: '''# Network Error Prevention
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_robust_session():
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

# Usage:
session = create_robust_session()
response = session.get(url, timeout=30)''',
            
            ErrorCategory.LOGIC: '''# Logic Error Prevention
def validate_and_process(data):
    # Input validation
    if not isinstance(data, dict):
        raise TypeError("Expected dictionary input")
    
    required_keys = ['key1', 'key2']
    missing_keys = [key for key in required_keys if key not in data]
    if missing_keys:
        raise KeyError(f"Missing required keys: {missing_keys}")
    
    # Process with validation
    result = {}
    for key, value in data.items():
        if value is not None:
            result[key] = process_value(value)
    
    return result'''
        }
        
        return prevention_templates.get(error_analysis.category, "# Add prevention measures here")


class ErrorReportingSystem:
    """에러 보고 시스템"""
    
    def __init__(self):
        self.reporters: List[ErrorReporter] = []
        self.report_queue: asyncio.Queue = asyncio.Queue()
        self.is_running = False
        self._worker_task: Optional[asyncio.Task] = None
    
    def add_reporter(self, reporter: ErrorReporter) -> None:
        """에러 리포터 추가"""
        self.reporters.append(reporter)
    
    async def start(self) -> None:
        """에러 보고 시스템 시작"""
        if not self.is_running:
            self.is_running = True
            self._worker_task = asyncio.create_task(self._report_worker())
    
    async def stop(self) -> None:
        """에러 보고 시스템 중지"""
        if self.is_running:
            self.is_running = False
            if self._worker_task:
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
    
    async def report_error_async(self, error: Exception, context: ErrorContext) -> None:
        """비동기 에러 보고"""
        await self.report_queue.put(('error', error, context))
    
    def report_error_sync(self, error: Exception, context: ErrorContext) -> None:
        """동기 에러 보고"""
        try:
            asyncio.create_task(self.report_error_async(error, context))
        except RuntimeError:
            # 이벤트 루프가 없는 경우 직접 보고
            for reporter in self.reporters:
                try:
                    reporter.report_error(error, context)
                except Exception as e:
                    logger.error(f"Error in reporter: {e}")
    
    async def report_recovery_async(self, error: Exception, strategy: RecoveryStrategy) -> None:
        """비동기 복구 보고"""
        await self.report_queue.put(('recovery', error, strategy))
    
    async def _report_worker(self) -> None:
        """에러 보고 워커"""
        while self.is_running:
            try:
                report_type, *args = await asyncio.wait_for(
                    self.report_queue.get(), timeout=1.0
                )
                
                if report_type == 'error':
                    error, context = args
                    for reporter in self.reporters:
                        try:
                            if hasattr(reporter, 'report_error_async'):
                                await reporter.report_error_async(error, context)
                            else:
                                reporter.report_error(error, context)
                        except Exception as e:
                            logger.error(f"Error in async reporter: {e}")
                
                elif report_type == 'recovery':
                    error, strategy = args
                    for reporter in self.reporters:
                        try:
                            if hasattr(reporter, 'report_recovery_async'):
                                await reporter.report_recovery_async(error, strategy)
                            else:
                                reporter.report_recovery(error, strategy)
                        except Exception as e:
                            logger.error(f"Error in async recovery reporter: {e}")
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error in report worker: {e}")


class ConsoleErrorReporter:
    """콘솔 에러 리포터"""
    
    def report_error(self, error: Exception, context: ErrorContext) -> None:
        """콘솔에 에러 보고"""
        print(f"[ERROR] {datetime.now().isoformat()}")
        print(f"Type: {type(error).__name__}")
        print(f"Message: {error}")
        print(f"Function: {context.function_name}")
        print(f"File: {context.file_path}:{context.line_number}")
        print("-" * 50)
    
    def report_recovery(self, error: Exception, strategy: RecoveryStrategy) -> None:
        """콘솔에 복구 보고"""
        print(f"[RECOVERY] {datetime.now().isoformat()}")
        print(f"Error: {type(error).__name__}")
        print(f"Strategy: {strategy.name}")
        print("-" * 50)


class FileErrorReporter:
    """파일 에러 리포터"""
    
    def __init__(self, log_file: str):
        self.log_file = Path(log_file)
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
    
    def report_error(self, error: Exception, context: ErrorContext) -> None:
        """파일에 에러 보고"""
        error_data = {
            'timestamp': datetime.now().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'function_name': context.function_name,
            'file_path': context.file_path,
            'line_number': context.line_number,
            'thread_id': context.thread_id,
            'process_id': context.process_id
        }
        
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(error_data) + '\n')
    
    def report_recovery(self, error: Exception, strategy: RecoveryStrategy) -> None:
        """파일에 복구 보고"""
        recovery_data = {
            'timestamp': datetime.now().isoformat(),
            'event_type': 'recovery',
            'error_type': type(error).__name__,
            'strategy': strategy.name
        }
        
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(recovery_data) + '\n')


class EnhancedErrorHandler:
    """통합 에러 핸들러"""
    
    def __init__(self):
        self.tracker = ErrorTracker()
        self.analyzer = ErrorAnalyzer()
        self.recovery_manager = ErrorRecoveryManager()
        self.code_generator = ErrorCodeGenerator()
        self.reporting_system = ErrorReportingSystem()
        
        # 기본 리포터 추가
        self.reporting_system.add_reporter(ConsoleErrorReporter())
        
        # 기본 복구 전략 등록
        self._register_default_recovery_strategies()
    
    def _register_default_recovery_strategies(self) -> None:
        """기본 복구 전략 등록"""
        # ConnectionError 복구
        connection_retry = RecoveryAction(
            strategy=RecoveryStrategy.RETRY,
            action=self._retry_connection,
            max_attempts=3,
            backoff_factor=2.0,
            timeout=30.0,
            conditions=[lambda e: isinstance(e, ConnectionError)]
        )
        self.recovery_manager.register_recovery_strategy("ConnectionError", connection_retry)
        
        # FileNotFoundError 복구
        file_fallback = RecoveryAction(
            strategy=RecoveryStrategy.FALLBACK,
            action=self._create_default_file,
            max_attempts=1,
            backoff_factor=1.0,
            timeout=None,
            conditions=[lambda e: isinstance(e, FileNotFoundError)]
        )
        self.recovery_manager.register_recovery_strategy("FileNotFoundError", file_fallback)
    
    async def _retry_connection(self, error: Exception, context: ErrorContext) -> Any:
        """연결 재시도"""
        # 실제 구현에서는 원본 함수를 재실행
        await asyncio.sleep(1)  # 간단한 지연
        return "Connection recovered"
    
    async def _create_default_file(self, error: Exception, context: ErrorContext) -> Any:
        """기본 파일 생성"""
        # 실제 구현에서는 기본 파일을 생성
        return "Default file created"
    
    async def handle_error_async(self, error: Exception, context: ErrorContext) -> Optional[Any]:
        """비동기 에러 처리"""
        # 1. 에러 추적
        self.tracker.track_error(error, context)
        
        # 2. 에러 분석
        analysis = self.analyzer.analyze_error(error, context)
        
        # 3. 에러 보고
        await self.reporting_system.report_error_async(error, context)
        
        # 4. 복구 시도
        try:
            result = await self.recovery_manager.attempt_recovery(error, context)
            await self.reporting_system.report_recovery_async(error, RecoveryStrategy.RETRY)
            return result
        except RecoveryFailedException:
            # 복구 실패 시 분석 결과와 함께 재발생
            logger.error(f"Recovery failed for {type(error).__name__}: {error}")
            logger.info(f"Error analysis: {analysis}")
            raise error
    
    def handle_error_sync(self, error: Exception, context: ErrorContext) -> None:
        """동기 에러 처리"""
        # 1. 에러 추적
        self.tracker.track_error(error, context)
        
        # 2. 에러 분석
        analysis = self.analyzer.analyze_error(error, context)
        
        # 3. 에러 보고
        self.reporting_system.report_error_sync(error, context)
        
        # 4. 분석 결과 로깅
        logger.error(f"Error handled: {type(error).__name__}: {error}")
        logger.info(f"Suggestions: {[s.title for s in analysis.suggestions]}")
    
    def generate_error_handling_code(self, error: Exception, context: ErrorContext, 
                                   strategy: str = "try_catch_basic") -> str:
        """에러 처리 코드 생성"""
        return self.code_generator.generate_error_handling_code(error, context, strategy)
    
    def get_error_dashboard_data(self) -> Dict[str, Any]:
        """에러 대시보드 데이터 반환"""
        patterns = self.tracker.get_error_patterns()
        statistics = self.tracker.get_error_statistics()
        recovery_stats = self.recovery_manager.get_recovery_statistics()
        
        return {
            'error_statistics': statistics,
            'error_patterns': patterns,
            'recovery_statistics': recovery_stats,
            'top_errors': self.tracker._error_counts.most_common(10),
            'recent_errors': list(self.tracker._errors)[-10:]  # 최근 10개
        }


# 데코레이터들
def error_handler(handler: Optional[EnhancedErrorHandler] = None, 
                 recovery: bool = True, 
                 report: bool = True):
    """에러 처리 데코레이터"""
    if handler is None:
        handler = EnhancedErrorHandler()
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                context = _create_error_context(e, func)
                
                if report:
                    handler.handle_error_sync(e, context)
                
                raise e
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                else:
                    return func(*args, **kwargs)
            except Exception as e:
                context = _create_error_context(e, func)
                
                if recovery:
                    try:
                        result = await handler.handle_error_async(e, context)
                        if result is not None:
                            return result
                    except RecoveryFailedException:
                        pass
                
                if report:
                    await handler.reporting_system.report_error_async(e, context)
                
                raise e
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def circuit_breaker(failure_threshold: int = 5, timeout: float = 60.0, 
                   expected_exception: Type[Exception] = Exception):
    """서킷 브레이커 데코레이터"""
    breaker = CircuitBreaker(failure_threshold, timeout, expected_exception)
    return breaker


@contextmanager
def error_context(operation_name: str, **context_data):
    """에러 컨텍스트 매니저"""
    start_time = time.time()
    try:
        yield
    except Exception as e:
        execution_time = time.time() - start_time
        context = ErrorContext(
            timestamp=datetime.now(),
            thread_id=threading.get_ident(),
            process_id=os.getpid(),
            function_name=operation_name,
            file_path="<context_manager>",
            line_number=0,
            local_variables=context_data,
            call_stack=traceback.format_stack(),
            system_info={'execution_time': execution_time}
        )
        
        # 전역 에러 핸들러가 있으면 사용
        if hasattr(error_context, '_global_handler'):
            error_context._global_handler.handle_error_sync(e, context)
        
        raise


# 유틸리티 함수들
def _create_error_context(error: Exception, func: Callable) -> ErrorContext:
    """에러 컨텍스트 생성"""
    frame = inspect.currentframe()
    try:
        # 호출 스택에서 실제 에러 발생 위치 찾기
        while frame:
            if frame.f_code.co_name == func.__name__:
                break
            frame = frame.f_back
        
        if frame:
            file_path = frame.f_code.co_filename
            line_number = frame.f_lineno
            local_vars = dict(frame.f_locals)
        else:
            file_path = "<unknown>"
            line_number = 0
            local_vars = {}
        
        return ErrorContext(
            timestamp=datetime.now(),
            thread_id=threading.get_ident(),
            process_id=os.getpid(),
            function_name=func.__name__,
            file_path=file_path,
            line_number=line_number,
            local_variables=local_vars,
            call_stack=traceback.format_stack(),
            system_info={
                'python_version': sys.version,
                'platform': sys.platform,
                'memory_usage': _get_memory_usage()
            }
        )
    finally:
        del frame


def _get_memory_usage() -> Dict[str, float]:
    """메모리 사용량 반환"""
    try:
        import psutil
        process = psutil.Process()
        memory_info = process.memory_info()
        return {
            'rss_mb': memory_info.rss / 1024 / 1024,
            'vms_mb': memory_info.vms / 1024 / 1024,
            'percent': process.memory_percent()
        }
    except ImportError:
        return {'rss_mb': 0, 'vms_mb': 0, 'percent': 0}


def safe_execute(func: Callable[..., T], *args, default: T = None, 
                log_errors: bool = True, **kwargs) -> T:
    """안전한 함수 실행"""
    try:
        return func(*args, **kwargs)
    except Exception as e:
        if log_errors:
            logger.error(f"Error in {func.__name__}: {e}")
        return default


async def safe_execute_async(func: Callable[..., T], *args, default: T = None,
                           log_errors: bool = True, **kwargs) -> T:
    """안전한 비동기 함수 실행"""
    try:
        if asyncio.iscoroutinefunction(func):
            return await func(*args, **kwargs)
        else:
            return func(*args, **kwargs)
    except Exception as e:
        if log_errors:
            logger.error(f"Error in {func.__name__}: {e}")
        return default


class ErrorPredictor:
    """에러 예측기"""
    
    def __init__(self):
        self.error_history: List[Dict[str, Any]] = []
        self.patterns: Dict[str, List[str]] = defaultdict(list)
        self.thresholds: Dict[str, float] = {
            'memory_usage': 0.8,  # 80%
            'error_frequency': 0.1,  # 10% 에러율
            'response_time': 5.0  # 5초
        }
    
    def record_execution(self, func_name: str, success: bool, 
                        execution_time: float, memory_usage: float) -> None:
        """실행 기록"""
        record = {
            'timestamp': datetime.now(),
            'function': func_name,
            'success': success,
            'execution_time': execution_time,
            'memory_usage': memory_usage
        }
        self.error_history.append(record)
        
        # 최근 1000개 기록만 유지
        if len(self.error_history) > 1000:
            self.error_history.pop(0)
    
    def predict_error_probability(self, func_name: str) -> float:
        """에러 확률 예측"""
        recent_records = [
            r for r in self.error_history[-100:]  # 최근 100개
            if r['function'] == func_name
        ]
        
        if not recent_records:
            return 0.0
        
        # 최근 실패율
        failure_rate = sum(1 for r in recent_records if not r['success']) / len(recent_records)
        
        # 메모리 사용량 증가 추세
        memory_trend = self._calculate_trend([r['memory_usage'] for r in recent_records])
        
        # 응답 시간 증가 추세
        time_trend = self._calculate_trend([r['execution_time'] for r in recent_records])
        
        # 종합 위험도 계산
        risk_score = (
            failure_rate * 0.5 +
            max(0, memory_trend) * 0.3 +
            max(0, time_trend) * 0.2
        )
        
        return min(1.0, risk_score)
    
    def _calculate_trend(self, values: List[float]) -> float:
        """값의 증가/감소 추세 계산"""
        if len(values) < 2:
            return 0.0
        
        # 간단한 선형 회귀로 기울기 계산
        n = len(values)
        x_values = list(range(n))
        
        x_mean = sum(x_values) / n
        y_mean = sum(values) / n
        
        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, values))
        denominator = sum((x - x_mean) ** 2 for x in x_values)
        
        if denominator == 0:
            return 0.0
        
        slope = numerator / denominator
        return slope
    
    def get_risk_assessment(self) -> Dict[str, Any]:
        """위험 평가 반환"""
        if not self.error_history:
            return {'status': 'no_data'}
        
        recent_records = self.error_history[-100:]
        
        # 전체 에러율
        error_rate = sum(1 for r in recent_records if not r['success']) / len(recent_records)
        
        # 평균 메모리 사용량
        avg_memory = sum(r['memory_usage'] for r in recent_records) / len(recent_records)
        
        # 평균 응답 시간
        avg_response_time = sum(r['execution_time'] for r in recent_records) / len(recent_records)
        
        # 위험 수준 결정
        risk_level = 'low'
        if (error_rate > self.thresholds['error_frequency'] or 
            avg_memory > self.thresholds['memory_usage'] or
            avg_response_time > self.thresholds['response_time']):
            risk_level = 'high'
        elif (error_rate > self.thresholds['error_frequency'] * 0.5 or
              avg_memory > self.thresholds['memory_usage'] * 0.7):
            risk_level = 'medium'
        
        return {
            'status': 'assessed',
            'risk_level': risk_level,
            'error_rate': error_rate,
            'avg_memory_usage': avg_memory,
            'avg_response_time': avg_response_time,
            'recommendations': self._generate_recommendations(risk_level, error_rate, avg_memory, avg_response_time)
        }
    
    def _generate_recommendations(self, risk_level: str, error_rate: float, 
                                avg_memory: float, avg_response_time: float) -> List[str]:
        """권장사항 생성"""
        recommendations = []
        
        if risk_level == 'high':
            recommendations.append("즉시 시스템 점검이 필요합니다.")
        
        if error_rate > self.thresholds['error_frequency']:
            recommendations.append(f"에러율이 {error_rate:.1%}로 높습니다. 에러 처리 강화가 필요합니다.")
        
        if avg_memory > self.thresholds['memory_usage']:
            recommendations.append(f"메모리 사용량이 {avg_memory:.1%}입니다. 메모리 최적화를 고려하세요.")
        
        if avg_response_time > self.thresholds['response_time']:
            recommendations.append(f"평균 응답시간이 {avg_response_time:.2f}초입니다. 성능 최적화가 필요합니다.")
        
        if not recommendations:
            recommendations.append("현재 시스템이 안정적으로 운영되고 있습니다.")
        
        return recommendations


class ErrorDashboard:
    """에러 대시보드"""
    
    def __init__(self, error_handler: EnhancedErrorHandler):
        self.error_handler = error_handler
        self.predictor = ErrorPredictor()
    
    def generate_dashboard_html(self) -> str:
        """대시보드 HTML 생성"""
        dashboard_data = self.error_handler.get_error_dashboard_data()
        risk_assessment = self.predictor.get_risk_assessment()
        
        html_template = '''
<!DOCTYPE html>
<html>
<head>
    <title>Error Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .error { background: #ffe6e6; }
        .warning { background: #fff3cd; }
        .success { background: #d4edda; }
        .chart { width: 100%; height: 300px; background: white; border: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Error Dashboard</h1>
    
    <div class="metric {risk_class}">
        <h2>System Health</h2>
        <p>Risk Level: <strong>{risk_level}</strong></p>
        <p>Error Rate: {error_rate:.2%}</p>
        <p>Total Errors: {total_errors}</p>
    </div>
    
    <div class="metric">
        <h2>Recent Error Patterns</h2>
        <ul>
            {error_patterns}
        </ul>
    </div>
    
    <div class="metric">
        <h2>Top Errors</h2>
        <table>
            <tr><th>Error Type</th><th>Count</th><th>Percentage</th></tr>
            {top_errors_table}
        </table>
    </div>
    
    <div class="metric">
        <h2>Recovery Statistics</h2>
        <p>Total Recovery Attempts: {recovery_attempts}</p>
        <p>Success Rate: {recovery_success_rate:.1%}</p>
    </div>
    
    <div class="metric">
        <h2>Recommendations</h2>
        <ul>
            {recommendations}
        </ul>
    </div>
    
    <div class="metric">
        <h2>Recent Errors</h2>
        <table>
            <tr><th>Time</th><th>Type</th><th>Function</th><th>Message</th></tr>
            {recent_errors_table}
        </table>
    </div>
</body>
</html>
        '''
        
        # 위험 수준에 따른 CSS 클래스
        risk_classes = {'low': 'success', 'medium': 'warning', 'high': 'error'}
        risk_class = risk_classes.get(risk_assessment.get('risk_level', 'low'), 'success')
        
        # 에러 패턴 HTML
        patterns = dashboard_data.get('error_patterns', {})
        pattern_items = []
        for pattern_type, pattern_list in patterns.items():
            if pattern_list:
                pattern_items.append(f"<li>{pattern_type.name}: {len(pattern_list)} occurrences</li>")
        error_patterns_html = '\n'.join(pattern_items) if pattern_items else "<li>No significant patterns detected</li>"
        
        # 상위 에러 테이블
        top_errors = dashboard_data.get('top_errors', [])
        total_error_count = sum(count for _, count in top_errors) if top_errors else 1
        top_errors_rows = []
        for error_key, count in top_errors[:10]:
            percentage = count / total_error_count * 100
            top_errors_rows.append(f"<tr><td>{error_key}</td><td>{count}</td><td>{percentage:.1f}%</td></tr>")
        top_errors_table = '\n'.join(top_errors_rows)
        
        # 최근 에러 테이블
        recent_errors = dashboard_data.get('recent_errors', [])
        recent_errors_rows = []
        for error_data in recent_errors[-10:]:
            timestamp = error_data.get('timestamp', datetime.now()).strftime('%H:%M:%S')
            error_type = error_data.get('error', {}).get('__class__', {}).get('__name__', 'Unknown')
            function_name = error_data.get('context', {}).get('function_name', 'Unknown')
            message = str(error_data.get('error', ''))[:50] + '...' if len(str(error_data.get('error', ''))) > 50 else str(error_data.get('error', ''))
            recent_errors_rows.append(f"<tr><td>{timestamp}</td><td>{error_type}</td><td>{function_name}</td><td>{message}</td></tr>")
        recent_errors_table = '\n'.join(recent_errors_rows)
        
        # 권장사항
        recommendations = risk_assessment.get('recommendations', [])
        recommendations_html = '\n'.join(f"<li>{rec}</li>" for rec in recommendations)
        
        # 복구 통계
        recovery_stats = dashboard_data.get('recovery_statistics', {})
        recovery_attempts = recovery_stats.get('total_attempts', 0)
        recovery_success_rate = recovery_stats.get('success_rate', 0.0)
        
        return html_template.format(
            risk_class=risk_class,
            risk_level=risk_assessment.get('risk_level', 'Unknown').upper(),
            error_rate=risk_assessment.get('error_rate', 0.0),
            total_errors=dashboard_data.get('error_statistics', {}).get('total_errors', 0),
            error_patterns=error_patterns_html,
            top_errors_table=top_errors_table,
            recovery_attempts=recovery_attempts,
            recovery_success_rate=recovery_success_rate,
            recommendations=recommendations_html,
            recent_errors_table=recent_errors_table
        )
    
    def save_dashboard(self, file_path: str = "error_dashboard.html") -> None:
        """대시보드를 파일로 저장"""
        html_content = self.generate_dashboard_html()
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        logger.info(f"Dashboard saved to {file_path}")


# AI 기반 에러 분석 (확장 가능)
class AIErrorAnalyzer:
    """AI 기반 에러 분석기"""
    
    def __init__(self):
        self.knowledge_base = self._load_knowledge_base()
        self.ml_model = None  # 실제 구현에서는 ML 모델 로드
    
    def _load_knowledge_base(self) -> Dict[str, Any]:
        """지식 베이스 로드"""
        return {
            "common_patterns": [
                {
                    "pattern": "frequent_import_errors",
                    "indicators": ["ImportError", "ModuleNotFoundError"],
                    "solutions": ["Check virtual environment", "Install missing packages", "Update requirements.txt"]
                },
                {
                    "pattern": "memory_leaks",
                    "indicators": ["MemoryError", "increasing_memory_usage"],
                    "solutions": ["Use generators", "Clear references", "Optimize data structures"]
                }
            ],
            "best_practices": [
                {
                    "category": "error_handling",
                    "practices": [
                        "Use specific exception types",
                        "Log errors with context",
                        "Implement graceful degradation"
                    ]
                }
            ]
        }
    
    def analyze_error_context(self, error: Exception, context: ErrorContext) -> Dict[str, Any]:
        """AI 기반 에러 컨텍스트 분석"""
        # 실제 구현에서는 ML 모델이나 LLM을 사용
        analysis = {
            "confidence": 0.8,
            "root_cause_analysis": self._analyze_root_cause_with_ai(error, context),
            "code_suggestions": self._generate_ai_code_suggestions(error, context),
            "similar_cases": self._find_similar_cases(error, context),
            "prevention_strategy": self._suggest_prevention_strategy(error, context)
        }
        return analysis
    
    def _analyze_root_cause_with_ai(self, error: Exception, context: ErrorContext) -> str:
        """AI 기반 근본 원인 분석"""
        # 간단한 휴리스틱 기반 분석 (실제로는 LLM 사용)
        error_message = str(error).lower()
        function_name = context.function_name.lower()
        
        if "import" in error_message and "module" in error_message:
            return "Missing dependency or incorrect import path. The module may not be installed or the import statement may have a typo."
        elif "key" in error_message and "dict" in function_name:
            return "Dictionary key access without validation. The key may not exist in the dictionary."
        elif "file" in error_message and "not found" in error_message:
            return "File path issue. The file may have been moved, deleted, or the path may be incorrect."
        else:
            return "General error that requires further investigation. Check the input parameters and function logic."
    
    def _generate_ai_code_suggestions(self, error: Exception, context: ErrorContext) -> List[str]:
        """AI 기반 코드 제안"""
        error_type = type(error).__name__
        
        suggestions = {
            "KeyError": [
                "Use dict.get() method with default value",
                "Check if key exists before accessing",
                "Validate input data structure"
            ],
            "FileNotFoundError": [
                "Use pathlib.Path for robust path handling",
                "Check file existence before operations",
                "Implement fallback file creation"
            ],
            "ImportError": [
                "Verify package installation",
                "Check virtual environment activation",
                "Update requirements.txt"
            ]
        }
        
        return suggestions.get(error_type, ["Add proper error handling", "Validate inputs", "Add logging"])
    
    def _find_similar_cases(self, error: Exception, context: ErrorContext) -> List[str]:
        """유사 사례 찾기"""
        # 실제 구현에서는 벡터 검색이나 유사도 계산 사용
        return [
            "Similar error occurred in user_service.py line 45",
            "Related issue found in data_processor.py",
            "Common pattern in API handlers"
        ]
    
    def _suggest_prevention_strategy(self, error: Exception, context: ErrorContext) -> Dict[str, Any]:
        """예방 전략 제안"""
        return {
            "immediate_actions": [
                "Add input validation",
                "Implement error handling",
                "Add unit tests"
            ],
            "long_term_improvements": [
                "Code review process",
                "Static analysis tools",
                "Monitoring and alerting"
            ],
            "architectural_changes": [
                "Consider circuit breaker pattern",
                "Implement retry mechanisms",
                "Add health checks"
            ]
        }


# 전역 에러 핸들러 인스턴스
_global_error_handler = None

def get_global_error_handler() -> EnhancedErrorHandler:
    """전역 에러 핸들러 반환"""
    global _global_error_handler
    if _global_error_handler is None:
        _global_error_handler = EnhancedErrorHandler()
    return _global_error_handler

def set_global_error_handler(handler: EnhancedErrorHandler) -> None:
    """전역 에러 핸들러 설정"""
    global _global_error_handler
    _global_error_handler = handler
    error_context._global_handler = handler

# 편의 함수들
def handle_error(error: Exception, context: Optional[ErrorContext] = None) -> None:
    """에러 처리 편의 함수"""
    if context is None:
        # 호출 스택에서 컨텍스트 생성
        frame = inspect.currentframe().f_back
        context = ErrorContext(
            timestamp=datetime.now(),
            thread_id=threading.get_ident(),
            process_id=os.getpid(),
            function_name=frame.f_code.co_name if frame else "<unknown>",
            file_path=frame.f_code.co_filename if frame else "<unknown>",
            line_number=frame.f_lineno if frame else 0,
            local_variables={},
            call_stack=traceback.format_stack(),
            system_info={}
        )
    
    handler = get_global_error_handler()
    handler.handle_error_sync(error, context)

async def handle_error_async(error: Exception, context: Optional[ErrorContext] = None) -> Optional[Any]:
    """비동기 에러 처리 편의 함수"""
    if context is None:
        frame = inspect.currentframe().f_back
        context = ErrorContext(
            timestamp=datetime.now(),
            thread_id=threading.get_ident(),
            process_id=os.getpid(),
            function_name=frame.f_code.co_name if frame else "<unknown>",
            file_path=frame.f_code.co_filename if frame else "<unknown>",
            line_number=frame.f_lineno if frame else 0,
            local_variables={},
            call_stack=traceback.format_stack(),
            system_info={}
        )
    
    handler = get_global_error_handler()
    return await handler.handle_error_async(error, context)

def create_error_report(error: Exception, include_suggestions: bool = True) -> str:
    """에러 보고서 생성"""
    frame = inspect.currentframe().f_back
    context = _create_error_context(error, lambda: None)
    
    analyzer = ErrorAnalyzer()
    analysis = analyzer.analyze_error(error, context)
    
    report = f"""
Error Report
============
Time: {datetime.now().isoformat()}
Type: {type(error).__name__}
Message: {str(error)}
Function: {context.function_name}
File: {context.file_path}:{context.line_number}

Category: {analysis.category.name}
Severity: {analysis.severity.value}
Pattern: {analysis.pattern.name}

Root Cause:
{analysis.root_cause}

Impact Assessment:
{analysis.impact_assessment}
"""
    
    if include_suggestions and analysis.suggestions:
        report += "\nSuggestions:\n"
        for i, suggestion in enumerate(analysis.suggestions, 1):
            report += f"{i}. {suggestion.title}\n"
            report += f"   {suggestion.description}\n"
            if suggestion.code_fix:
                report += f"   Code: {suggestion.code_fix}\n"
            report += f"   Confidence: {suggestion.confidence:.1%}\n\n"
    
    if analysis.prevention_measures:
        report += "Prevention Measures:\n"
        for measure in analysis.prevention_measures:
            report += f"- {measure}\n"
    
    return report

# 시스템 에러 후킹
def install_global_error_hook() -> None:
    """전역 에러 후크 설치"""
    original_excepthook = sys.excepthook
    
    def enhanced_excepthook(exc_type, exc_value, exc_traceback):
        if exc_type is KeyboardInterrupt:
            # Ctrl+C는 정상 처리
            original_excepthook(exc_type, exc_value, exc_traceback)
            return
        
        # 에러 컨텍스트 생성
        context = ErrorContext(
            timestamp=datetime.now(),
            thread_id=threading.get_ident(),
            process_id=os.getpid(),
            function_name="<main>",
            file_path=exc_traceback.tb_frame.f_code.co_filename if exc_traceback else "<unknown>",
            line_number=exc_traceback.tb_lineno if exc_traceback else 0,
            local_variables={},
            call_stack=traceback.format_exception(exc_type, exc_value, exc_traceback),
            system_info={}
        )
        
        # 전역 핸들러로 처리
        handler = get_global_error_handler()
        handler.handle_error_sync(exc_value, context)
        
        # 원본 훅도 호출
        original_excepthook(exc_type, exc_value, exc_traceback)
    
    sys.excepthook = enhanced_excepthook

# 사용 예제
if __name__ == "__main__":
    # 에러 핸들러 설정
    handler = EnhancedErrorHandler()
    set_global_error_handler(handler)
    
    # 파일 리포터 추가
    file_reporter = FileErrorReporter("error_log.jsonl")
    handler.reporting_system.add_reporter(file_reporter)
    
    # 에러 핸들러 시작
    asyncio.run(handler.reporting_system.start())
    
    # 전역 에러 후크 설치
    install_global_error_hook()
    
    # 예제 함수들
    @error_handler(handler)
    def example_function_with_error():
        """에러가 발생하는 예제 함수"""
        data = {"name": "John"}
        return data["age"]  # KeyError 발생
    
    @circuit_breaker(failure_threshold=2, timeout=10.0)
    def unreliable_function():
        """불안정한 함수"""
        import random
        if random.random() < 0.7:
            raise ConnectionError("Network error")
        return "Success"
    
    # 에러 테스트
    try:
        example_function_with_error()
    except KeyError as e:
        print(f"Caught error: {e}")
        
        # 에러 보고서 생성
        report = create_error_report(e)
        print(report)
    
    # 서킷 브레이커 테스트
    for i in range(5):
        try:
            result = unreliable_function()
            print(f"Attempt {i+1}: {result}")
        except Exception as e:
            print(f"Attempt {i+1} failed: {e}")
    
    # 대시보드 생성
    dashboard = ErrorDashboard(handler)
    dashboard.save_dashboard("error_dashboard.html")
    print("Dashboard saved to error_dashboard.html")
    
    # 에러 핸들러 정지
    asyncio.run(handler.reporting_system.stop())