#!/usr/bin/env python3
"""
Performance Profiling Utilities
AI 어시스티드 코딩을 위한 성능 분석 및 최적화 도구들

주요 기능:
- 코드 실행 성능 프로파일링
- 메모리 사용량 분석
- 알고리즘 복잡도 분석
- 성능 최적화 제안
- 벤치마킹 및 비교 분석
- 실시간 성능 모니터링
- AI 기반 성능 예측 및 개선 제안
"""

import ast
import asyncio
import cProfile
import gc
import inspect
import io
import linecache
import memory_profiler
import pstats
import psutil
import sys
import time
import threading
import tracemalloc
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps, lru_cache
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Tuple, Union, Callable, 
    Iterator, Set, NamedTuple, Protocol, runtime_checkable
)
import logging
import json
import statistics
import warnings
import weakref

# 외부 라이브러리 (선택적 import)
try:
    import matplotlib.pyplot as plt
    import numpy as np
    HAS_PLOTTING = True
except ImportError:
    HAS_PLOTTING = False

try:
    import line_profiler
    HAS_LINE_PROFILER = True
except ImportError:
    HAS_LINE_PROFILER = False

try:
    import py_spy
    HAS_PY_SPY = True
except ImportError:
    HAS_PY_SPY = False

# 로깅 설정
logger = logging.getLogger(__name__)


# 예외 클래스들
class ProfilingError(Exception):
    """프로파일링 관련 기본 예외"""
    pass


class InstrumentationError(ProfilingError):
    """코드 계측 오류"""
    pass


class AnalysisError(ProfilingError):
    """분석 오류"""
    pass


class OptimizationError(ProfilingError):
    """최적화 오류"""
    pass


# 열거형 정의
class ProfileType(Enum):
    CPU = "cpu"
    MEMORY = "memory"
    LINE_BY_LINE = "line_by_line"
    STATISTICAL = "statistical"
    REALTIME = "realtime"


class OptimizationLevel(Enum):
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"


class ComplexityClass(Enum):
    CONSTANT = "O(1)"
    LOGARITHMIC = "O(log n)"
    LINEAR = "O(n)"
    LINEARITHMIC = "O(n log n)"
    QUADRATIC = "O(n²)"
    CUBIC = "O(n³)"
    EXPONENTIAL = "O(2^n)"
    FACTORIAL = "O(n!)"
    UNKNOWN = "O(?)"


# 데이터 클래스들
@dataclass
class PerformanceMetric:
    """성능 메트릭"""
    name: str
    value: float
    unit: str
    timestamp: datetime = field(default_factory=datetime.now)
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FunctionProfile:
    """함수 프로파일 정보"""
    function_name: str
    module_name: str
    filename: str
    line_number: int
    call_count: int
    total_time: float
    cumulative_time: float
    per_call_time: float
    memory_usage: Optional[float] = None
    memory_peak: Optional[float] = None
    complexity_estimate: ComplexityClass = ComplexityClass.UNKNOWN


@dataclass
class LineProfile:
    """라인별 프로파일 정보"""
    line_number: int
    hits: int
    time_per_hit: float
    total_time: float
    line_contents: str
    percentage: float


@dataclass
class MemorySnapshot:
    """메모리 스냅샷"""
    timestamp: datetime
    total_memory: float
    used_memory: float
    available_memory: float
    peak_memory: float
    gc_stats: Dict[str, Any]
    top_allocations: List[Tuple[str, int, float]]


@dataclass
class OptimizationSuggestion:
    """최적화 제안"""
    type: str
    priority: str  # HIGH, MEDIUM, LOW
    function_name: str
    line_number: Optional[int]
    description: str
    suggested_fix: str
    expected_improvement: float  # 예상 성능 향상 (%)
    confidence: float  # 제안 신뢰도 (0-1)
    code_example: Optional[str] = None


@dataclass
class BenchmarkResult:
    """벤치마크 결과"""
    name: str
    execution_times: List[float]
    mean_time: float
    median_time: float
    std_deviation: float
    min_time: float
    max_time: float
    operations_per_second: float
    memory_usage: Optional[float] = None


@dataclass
class ProfileReport:
    """종합 프로파일 보고서"""
    session_id: str
    start_time: datetime
    end_time: datetime
    total_execution_time: float
    function_profiles: List[FunctionProfile]
    line_profiles: List[LineProfile]
    memory_snapshots: List[MemorySnapshot]
    optimization_suggestions: List[OptimizationSuggestion]
    benchmark_results: List[BenchmarkResult]
    metadata: Dict[str, Any] = field(default_factory=dict)


# 프로토콜 정의
@runtime_checkable
class Profilable(Protocol):
    """프로파일링 가능한 객체"""
    def __call__(self, *args, **kwargs) -> Any: ...


class PerformanceTimer:
    """고정밀 성능 타이머"""
    
    def __init__(self):
        self.start_time = None
        self.end_time = None
        self.elapsed_times = []
        self.is_running = False
    
    def start(self) -> None:
        """타이머 시작"""
        if self.is_running:
            raise ProfilingError("Timer is already running")
        
        self.start_time = time.perf_counter()
        self.is_running = True
    
    def stop(self) -> float:
        """타이머 정지"""
        if not self.is_running:
            raise ProfilingError("Timer is not running")
        
        self.end_time = time.perf_counter()
        elapsed = self.end_time - self.start_time
        self.elapsed_times.append(elapsed)
        self.is_running = False
        
        return elapsed
    
    def lap(self) -> float:
        """랩 타임 측정"""
        if not self.is_running:
            raise ProfilingError("Timer is not running")
        
        current_time = time.perf_counter()
        elapsed = current_time - self.start_time
        return elapsed
    
    @contextmanager
    def measure(self):
        """컨텍스트 매니저로 시간 측정"""
        self.start()
        try:
            yield self
        finally:
            self.stop()
    
    def get_statistics(self) -> Dict[str, float]:
        """통계 정보 반환"""
        if not self.elapsed_times:
            return {}
        
        return {
            "count": len(self.elapsed_times),
            "total": sum(self.elapsed_times),
            "mean": statistics.mean(self.elapsed_times),
            "median": statistics.median(self.elapsed_times),
            "std_dev": statistics.stdev(self.elapsed_times) if len(self.elapsed_times) > 1 else 0,
            "min": min(self.elapsed_times),
            "max": max(self.elapsed_times)
        }


class MemoryProfiler:
    """메모리 프로파일러"""
    
    def __init__(self):
        self.snapshots = []
        self.trace_started = False
        self.baseline_memory = None
    
    def start_tracing(self) -> None:
        """메모리 추적 시작"""
        if not self.trace_started:
            tracemalloc.start()
            self.trace_started = True
            self.baseline_memory = self.get_current_memory()
    
    def stop_tracing(self) -> None:
        """메모리 추적 중지"""
        if self.trace_started:
            tracemalloc.stop()
            self.trace_started = False
    
    def get_current_memory(self) -> MemorySnapshot:
        """현재 메모리 상태 스냅샷"""
        process = psutil.Process()
        memory_info = process.memory_info()
        
        # GC 통계
        gc_stats = {
            f"generation_{i}": gc.get_count()[i] for i in range(len(gc.get_count()))
        }
        
        # tracemalloc 정보
        top_allocations = []
        if self.trace_started:
            snapshot = tracemalloc.take_snapshot()
            top_stats = snapshot.statistics('lineno')[:10]
            
            for stat in top_stats:
                top_allocations.append((
                    f"{stat.traceback.format()[-1]}",
                    stat.count,
                    stat.size / 1024 / 1024  # MB
                ))
        
        return MemorySnapshot(
            timestamp=datetime.now(),
            total_memory=memory_info.rss / 1024 / 1024,  # MB
            used_memory=memory_info.rss / 1024 / 1024,
            available_memory=psutil.virtual_memory().available / 1024 / 1024,
            peak_memory=memory_info.peak_wss / 1024 / 1024 if hasattr(memory_info, 'peak_wss') else 0,
            gc_stats=gc_stats,
            top_allocations=top_allocations
        )
    
    def take_snapshot(self) -> MemorySnapshot:
        """메모리 스냅샷 생성"""
        snapshot = self.get_current_memory()
        self.snapshots.append(snapshot)
        return snapshot
    
    def get_memory_delta(self, start_snapshot: MemorySnapshot, 
                        end_snapshot: MemorySnapshot) -> float:
        """메모리 사용량 차이 계산"""
        return end_snapshot.used_memory - start_snapshot.used_memory
    
    @contextmanager
    def monitor_memory(self):
        """메모리 모니터링 컨텍스트"""
        self.start_tracing()
        start_snapshot = self.take_snapshot()
        
        try:
            yield self
        finally:
            end_snapshot = self.take_snapshot()
            delta = self.get_memory_delta(start_snapshot, end_snapshot)
            logger.debug(f"Memory delta: {delta:.2f} MB")


class CodeProfiler:
    """코드 프로파일러"""
    
    def __init__(self):
        self.profiler = None
        self.profile_data = None
        self.timer = PerformanceTimer()
        self.memory_profiler = MemoryProfiler()
    
    def profile_function(self, func: Callable, *args, **kwargs) -> Tuple[Any, FunctionProfile]:
        """함수 프로파일링"""
        # cProfile 설정
        profiler = cProfile.Profile()
        
        # 메모리 프로파일링 시작
        with self.memory_profiler.monitor_memory():
            start_snapshot = self.memory_profiler.take_snapshot()
            
            # 실행 시간 측정 및 프로파일링
            with self.timer.measure():
                profiler.enable()
                try:
                    result = func(*args, **kwargs)
                finally:
                    profiler.disable()
            
            end_snapshot = self.memory_profiler.take_snapshot()
        
        # 프로파일 데이터 분석
        stats = pstats.Stats(profiler)
        
        # 함수 정보 추출
        func_name = func.__name__
        module_name = func.__module__
        filename = inspect.getfile(func)
        line_number = inspect.getsourcelines(func)[1]
        
        # 통계 추출
        func_stats = None
        for (filename_stat, line_stat, func_stat), (cc, nc, tt, ct, callers) in stats.stats.items():
            if func_stat == func_name:
                func_stats = (cc, nc, tt, ct)
                break
        
        if func_stats:
            call_count, _, total_time, cumulative_time = func_stats
            per_call_time = total_time / call_count if call_count > 0 else 0
        else:
            call_count = 1
            total_time = self.timer.elapsed_times[-1] if self.timer.elapsed_times else 0
            cumulative_time = total_time
            per_call_time = total_time
        
        # 메모리 사용량
        memory_delta = self.memory_profiler.get_memory_delta(start_snapshot, end_snapshot)
        
        function_profile = FunctionProfile(
            function_name=func_name,
            module_name=module_name,
            filename=filename,
            line_number=line_number,
            call_count=call_count,
            total_time=total_time,
            cumulative_time=cumulative_time,
            per_call_time=per_call_time,
            memory_usage=memory_delta,
            memory_peak=end_snapshot.peak_memory
        )
        
        return result, function_profile
    
    def profile_code_block(self, code: str, globals_dict: Dict = None, 
                          locals_dict: Dict = None) -> ProfileReport:
        """코드 블록 프로파일링"""
        if globals_dict is None:
            globals_dict = {}
        if locals_dict is None:
            locals_dict = {}
        
        # 고유 세션 ID 생성
        session_id = f"profile_{int(time.time() * 1000)}"
        start_time = datetime.now()
        
        # cProfile 설정
        profiler = cProfile.Profile()
        
        # 메모리 추적 시작
        self.memory_profiler.start_tracing()
        start_snapshot = self.memory_profiler.take_snapshot()
        
        try:
            # 코드 실행 및 프로파일링
            profiler.enable()
            exec(code, globals_dict, locals_dict)
            profiler.disable()
            
        except Exception as e:
            logger.error(f"Code execution failed: {e}")
            raise AnalysisError(f"Failed to execute code: {e}")
        
        finally:
            end_snapshot = self.memory_profiler.take_snapshot()
            self.memory_profiler.stop_tracing()
        
        end_time = datetime.now()
        total_execution_time = (end_time - start_time).total_seconds()
        
        # 프로파일 데이터 분석
        function_profiles = self._analyze_profile_data(profiler)
        
        # 최적화 제안 생성
        optimization_suggestions = self._generate_optimization_suggestions(
            function_profiles, code
        )
        
        return ProfileReport(
            session_id=session_id,
            start_time=start_time,
            end_time=end_time,
            total_execution_time=total_execution_time,
            function_profiles=function_profiles,
            line_profiles=[],  # 라인별 프로파일링은 별도 메서드에서
            memory_snapshots=[start_snapshot, end_snapshot],
            optimization_suggestions=optimization_suggestions,
            benchmark_results=[]
        )
    
    def _analyze_profile_data(self, profiler: cProfile.Profile) -> List[FunctionProfile]:
        """프로파일 데이터 분석"""
        stats = pstats.Stats(profiler)
        function_profiles = []
        
        for (filename, line_number, func_name), (cc, nc, tt, ct, callers) in stats.stats.items():
            per_call_time = tt / cc if cc > 0 else 0
            
            function_profile = FunctionProfile(
                function_name=func_name,
                module_name="<string>",  # exec으로 실행된 코드
                filename=filename,
                line_number=line_number,
                call_count=cc,
                total_time=tt,
                cumulative_time=ct,
                per_call_time=per_call_time
            )
            
            function_profiles.append(function_profile)
        
        # 총 시간 기준으로 정렬
        function_profiles.sort(key=lambda x: x.total_time, reverse=True)
        
        return function_profiles
    
    def _generate_optimization_suggestions(self, function_profiles: List[FunctionProfile],
                                         code: str) -> List[OptimizationSuggestion]:
        """최적화 제안 생성"""
        suggestions = []
        
        # 시간이 오래 걸리는 함수들 분석
        for profile in function_profiles[:5]:  # 상위 5개 함수만
            if profile.total_time > 0.01:  # 10ms 이상인 함수
                suggestions.extend(self._analyze_function_for_optimization(profile, code))
        
        return suggestions
    
    def _analyze_function_for_optimization(self, profile: FunctionProfile, 
                                         code: str) -> List[OptimizationSuggestion]:
        """개별 함수 최적화 분석"""
        suggestions = []
        
        # 호출 횟수가 많은 함수
        if profile.call_count > 1000:
            suggestions.append(OptimizationSuggestion(
                type="high_call_count",
                priority="HIGH",
                function_name=profile.function_name,
                line_number=profile.line_number,
                description=f"Function called {profile.call_count} times",
                suggested_fix="Consider caching results or reducing call frequency",
                expected_improvement=20.0,
                confidence=0.7
            ))
        
        # 호출당 시간이 긴 함수
        if profile.per_call_time > 0.001:  # 1ms 이상
            suggestions.append(OptimizationSuggestion(
                type="slow_function",
                priority="MEDIUM",
                function_name=profile.function_name,
                line_number=profile.line_number,
                description=f"Function takes {profile.per_call_time*1000:.2f}ms per call",
                suggested_fix="Profile function internals for bottlenecks",
                expected_improvement=15.0,
                confidence=0.6
            ))
        
        return suggestions


class LineByLineProfiler:
    """라인별 프로파일러"""
    
    def __init__(self):
        self.line_profiler = None
        self.enabled = HAS_LINE_PROFILER
    
    def profile_function_lines(self, func: Callable) -> List[LineProfile]:
        """함수의 라인별 프로파일링"""
        if not self.enabled:
            logger.warning("line_profiler not available")
            return []
        
        try:
            profiler = line_profiler.LineProfiler()
            profiler.add_function(func)
            
            # 함수 실행
            profiler.enable_by_count()
            func()
            profiler.disable_by_count()
            
            # 결과 분석
            return self._analyze_line_profile(profiler, func)
            
        except Exception as e:
            logger.error(f"Line profiling failed: {e}")
            return []
    
    def _analyze_line_profile(self, profiler, func: Callable) -> List[LineProfile]:
        """라인 프로파일 결과 분석"""
        line_profiles = []
        
        try:
            # 프로파일 결과를 문자열로 캡처
            string_io = io.StringIO()
            profiler.print_stats(string_io)
            profile_output = string_io.getvalue()
            
            # 결과 파싱 (간단한 파싱 예제)
            lines = profile_output.split('\n')
            for line in lines:
                if line.strip() and not line.startswith('Line'):
                    parts = line.split()
                    if len(parts) >= 6:
                        try:
                            line_number = int(parts[0])
                            hits = int(parts[1])
                            time_per_hit = float(parts[2]) if parts[2] != '' else 0.0
                            total_time = float(parts[3]) if parts[3] != '' else 0.0
                            percentage = float(parts[4]) if parts[4] != '' else 0.0
                            line_contents = ' '.join(parts[5:])
                            
                            line_profile = LineProfile(
                                line_number=line_number,
                                hits=hits,
                                time_per_hit=time_per_hit,
                                total_time=total_time,
                                line_contents=line_contents,
                                percentage=percentage
                            )
                            
                            line_profiles.append(line_profile)
                            
                        except (ValueError, IndexError):
                            continue
            
        except Exception as e:
            logger.error(f"Failed to analyze line profile: {e}")
        
        return line_profiles


class ComplexityAnalyzer:
    """알고리즘 복잡도 분석기"""
    
    def __init__(self):
        self.loop_patterns = {
            'for': r'for\s+\w+\s+in\s+',
            'while': r'while\s+',
            'nested_for': r'for\s+\w+\s+in\s+.*?for\s+\w+\s+in\s+',
        }
    
    def analyze_complexity(self, code: str) -> ComplexityClass:
        """코드의 시간 복잡도 분석"""
        try:
            tree = ast.parse(code)
            complexity = self._analyze_ast_complexity(tree)
            return self._classify_complexity(complexity)
        except SyntaxError:
            logger.error("Failed to parse code for complexity analysis")
            return ComplexityClass.UNKNOWN
    
    def _analyze_ast_complexity(self, node: ast.AST, depth: int = 0) -> int:
        """AST 기반 복잡도 분석"""
        complexity_score = 0
        
        for child in ast.walk(node):
            if isinstance(child, ast.For):
                # 중첩 루프 확인
                nested_loops = sum(1 for nested in ast.walk(child) 
                                 if isinstance(nested, (ast.For, ast.While)) and nested != child)
                complexity_score += 1 + nested_loops
                
            elif isinstance(child, ast.While):
                complexity_score += 1
                
            elif isinstance(child, ast.FunctionDef):
                # 재귀 함수 확인
                if self._is_recursive_function(child):
                    complexity_score += 2
        
        return complexity_score
    
    def _is_recursive_function(self, func_node: ast.FunctionDef) -> bool:
        """재귀 함수 여부 확인"""
        func_name = func_node.name
        
        for node in ast.walk(func_node):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == func_name:
                    return True
        
        return False
    
    def _classify_complexity(self, score: int) -> ComplexityClass:
        """복잡도 점수를 클래스로 분류"""
        if score == 0:
            return ComplexityClass.CONSTANT
        elif score == 1:
            return ComplexityClass.LINEAR
        elif score == 2:
            return ComplexityClass.QUADRATIC
        elif score == 3:
            return ComplexityClass.CUBIC
        elif score > 3:
            return ComplexityClass.EXPONENTIAL
        else:
            return ComplexityClass.UNKNOWN
    
    def estimate_runtime_complexity(self, func: Callable, input_sizes: List[int]) -> Dict[str, Any]:
        """실행 시간 기반 복잡도 추정"""
        timer = PerformanceTimer()
        measurements = []
        
        for size in input_sizes:
            # 입력 데이터 생성 (간단한 예제)
            test_data = list(range(size))
            
            with timer.measure():
                try:
                    func(test_data)
                except Exception as e:
                    logger.warning(f"Function failed with size {size}: {e}")
                    continue
            
            measurements.append((size, timer.elapsed_times[-1]))
        
        # 복잡도 추정
        complexity_estimate = self._estimate_complexity_from_measurements(measurements)
        
        return {
            "measurements": measurements,
            "estimated_complexity": complexity_estimate,
            "r_squared": self._calculate_r_squared(measurements, complexity_estimate)
        }
    
    def _estimate_complexity_from_measurements(self, measurements: List[Tuple[int, float]]) -> ComplexityClass:
        """측정값으로부터 복잡도 추정"""
        if len(measurements) < 3:
            return ComplexityClass.UNKNOWN
        
        # 간단한 복잡도 추정 (비율 기반)
        ratios = []
        for i in range(1, len(measurements)):
            size_ratio = measurements[i][0] / measurements[i-1][0]
            time_ratio = measurements[i][1] / measurements[i-1][1]
            ratios.append(time_ratio / size_ratio)
        
        avg_ratio = statistics.mean(ratios)
        
        if avg_ratio < 1.2:
            return ComplexityClass.CONSTANT
        elif avg_ratio < 2.0:
            return ComplexityClass.LINEAR
        elif avg_ratio < 4.0:
            return ComplexityClass.LINEARITHMIC
        elif avg_ratio < 8.0:
            return ComplexityClass.QUADRATIC
        else:
            return ComplexityClass.EXPONENTIAL
    
    def _calculate_r_squared(self, measurements: List[Tuple[int, float]], 
                           complexity: ComplexityClass) -> float:
        """R² 값 계산 (적합도 측정)"""
        if len(measurements) < 2:
            return 0.0
        
        try:
            sizes = [m[0] for m in measurements]
            times = [m[1] for m in measurements]
            
            # 단순화된 R² 계산
            mean_time = statistics.mean(times)
            total_variance = sum((t - mean_time) ** 2 for t in times)
            
            if total_variance == 0:
                return 1.0
            
            # 복잡도별 예측 모델 (간단한 버전)
            if complexity == ComplexityClass.LINEAR:
                # 선형 회귀
                n = len(measurements)
                sum_xy = sum(s * t for s, t in measurements)
                sum_x = sum(sizes)
                sum_y = sum(times)
                sum_x2 = sum(s * s for s in sizes)
                
                slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
                intercept = (sum_y - slope * sum_x) / n
                
                predicted_times = [slope * s + intercept for s in sizes]
                residual_variance = sum((t - p) ** 2 for t, p in zip(times, predicted_times))
                
                return 1 - (residual_variance / total_variance)
            
            return 0.5  # 기본값
            
        except (ValueError, ZeroDivisionError):
            return 0.0


class BenchmarkSuite:
    """벤치마크 테스트 스위트"""
    
    def __init__(self):
        self.timer = PerformanceTimer()
        self.memory_profiler = MemoryProfiler()
        self.results = []
    
    def benchmark_function(self, func: Callable, *args, 
                          iterations: int = 100, 
                          warmup_iterations: int = 10,
                          name: Optional[str] = None, **kwargs) -> BenchmarkResult:
        """함수 벤치마킹"""
        function_name = name or func.__name__
        
        # 워밍업
        for _ in range(warmup_iterations):
            try:
                func(*args, **kwargs)
            except Exception:
                pass
        
        # 실제 측정
        execution_times = []
        memory_usage = 0
        
        for i in range(iterations):
            # 메모리 측정 (일부 반복에서만)
            if i % (iterations // 10 + 1) == 0:
                with self.memory_profiler.monitor_memory():
                    start_snapshot = self.memory_profiler.take_snapshot()
                    
                    with self.timer.measure():
                        func(*args, **kwargs)
                    
                    end_snapshot = self.memory_profiler.take_snapshot()
                    memory_usage += self.memory_profiler.get_memory_delta(start_snapshot, end_snapshot)
            else:
                with self.timer.measure():
                    func(*args, **kwargs)
            
            execution_times.append(self.timer.elapsed_times[-1])
        
        # 통계 계산
        mean_time = statistics.mean(execution_times)
        median_time = statistics.median(execution_times)
        std_deviation = statistics.stdev(execution_times) if len(execution_times) > 1 else 0
        min_time = min(execution_times)
        max_time = max(execution_times)
        operations_per_second = 1.0 / mean_time if mean_time > 0 else 0
        avg_memory_usage = memory_usage / max(1, iterations // 10)
        
        result = BenchmarkResult(
            name=function_name,
            execution_times=execution_times,
            mean_time=mean_time,
            median_time=median_time,
            std_deviation=std_deviation,
            min_time=min_time,
            max_time=max_time,
            operations_per_second=operations_per_second,
            memory_usage=avg_memory_usage
        )
        
        self.results.append(result)
        return result
    
    def compare_implementations(self, implementations: Dict[str, Callable], 
                              test_args: Tuple = (), test_kwargs: Dict = None,
                              iterations: int = 100) -> Dict[str, BenchmarkResult]:
        """여러 구현체 성능 비교"""
        if test_kwargs is None:
            test_kwargs = {}
        
        results = {}
        
        for name, func in implementations.items():
            try:
                result = self.benchmark_function(
                    func, *test_args, 
                    iterations=iterations, 
                    name=name, 
                    **test_kwargs
                )
                results[name] = result
                logger.info(f"Benchmarked {name}: {result.mean_time*1000:.2f}ms avg")
            except Exception as e:
                logger.error(f"Benchmark failed for {name}: {e}")
                # 실패한 구현체도 기록
                results[name] = BenchmarkResult(
                    name=name,
                    execution_times=[],
                    mean_time=float('inf'),
                    median_time=float('inf'),
                    std_deviation=0,
                    min_time=float('inf'),
                    max_time=float('inf'),
                    operations_per_second=0,
                    memory_usage=None
                )
        
        return results
    
    def benchmark_with_different_inputs(self, func: Callable, 
                                      input_generator: Callable[[int], Tuple],
                                      input_sizes: List[int],
                                      iterations: int = 50) -> Dict[int, BenchmarkResult]:
        """다양한 입력 크기로 벤치마킹"""
        results = {}
        
        for size in input_sizes:
            try:
                test_input = input_generator(size)
                result = self.benchmark_function(
                    func, *test_input,
                    iterations=iterations,
                    name=f"{func.__name__}_size_{size}"
                )
                results[size] = result
                logger.info(f"Size {size}: {result.mean_time*1000:.2f}ms avg")
            except Exception as e:
                logger.error(f"Benchmark failed for size {size}: {e}")
        
        return results


class RealTimeMonitor:
    """실시간 성능 모니터"""
    
    def __init__(self, monitoring_interval: float = 1.0):
        self.monitoring_interval = monitoring_interval
        self.is_monitoring = False
        self.metrics_history = []
        self.monitor_thread = None
        self.stop_event = threading.Event()
        self.callbacks = []
    
    def add_callback(self, callback: Callable[[PerformanceMetric], None]) -> None:
        """메트릭 콜백 추가"""
        self.callbacks.append(callback)
    
    def start_monitoring(self) -> None:
        """모니터링 시작"""
        if self.is_monitoring:
            return
        
        self.is_monitoring = True
        self.stop_event.clear()
        self.monitor_thread = threading.Thread(target=self._monitor_loop)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
        
        logger.info("Real-time monitoring started")
    
    def stop_monitoring(self) -> None:
        """모니터링 중지"""
        if not self.is_monitoring:
            return
        
        self.is_monitoring = False
        self.stop_event.set()
        
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5.0)
        
        logger.info("Real-time monitoring stopped")
    
    def _monitor_loop(self) -> None:
        """모니터링 루프"""
        while not self.stop_event.wait(self.monitoring_interval):
            try:
                # 시스템 메트릭 수집
                process = psutil.Process()
                
                # CPU 사용률
                cpu_metric = PerformanceMetric(
                    name="cpu_percent",
                    value=process.cpu_percent(),
                    unit="%"
                )
                
                # 메모리 사용률
                memory_info = process.memory_info()
                memory_metric = PerformanceMetric(
                    name="memory_usage",
                    value=memory_info.rss / 1024 / 1024,  # MB
                    unit="MB"
                )
                
                # 스레드 수
                thread_metric = PerformanceMetric(
                    name="thread_count",
                    value=process.num_threads(),
                    unit="count"
                )
                
                # 파일 디스크립터 수 (Unix 시스템에서만)
                try:
                    fd_metric = PerformanceMetric(
                        name="file_descriptors",
                        value=process.num_fds(),
                        unit="count"
                    )
                    metrics = [cpu_metric, memory_metric, thread_metric, fd_metric]
                except AttributeError:
                    metrics = [cpu_metric, memory_metric, thread_metric]
                
                # 메트릭 저장 및 콜백 호출
                for metric in metrics:
                    self.metrics_history.append(metric)
                    for callback in self.callbacks:
                        try:
                            callback(metric)
                        except Exception as e:
                            logger.error(f"Metric callback failed: {e}")
                
                # 히스토리 크기 제한 (최근 1000개만 유지)
                if len(self.metrics_history) > 1000:
                    self.metrics_history = self.metrics_history[-1000:]
                    
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
    
    def get_recent_metrics(self, metric_name: str, 
                          duration_seconds: int = 60) -> List[PerformanceMetric]:
        """최근 메트릭 조회"""
        cutoff_time = datetime.now() - timedelta(seconds=duration_seconds)
        
        return [
            metric for metric in self.metrics_history
            if metric.name == metric_name and metric.timestamp >= cutoff_time
        ]
    
    def get_average_metric(self, metric_name: str, 
                         duration_seconds: int = 60) -> Optional[float]:
        """평균 메트릭 값 계산"""
        recent_metrics = self.get_recent_metrics(metric_name, duration_seconds)
        
        if not recent_metrics:
            return None
        
        return statistics.mean(metric.value for metric in recent_metrics)


class OptimizationEngine:
    """최적화 엔진"""
    
    def __init__(self):
        self.optimization_rules = self._load_optimization_rules()
        self.complexity_analyzer = ComplexityAnalyzer()
    
    def _load_optimization_rules(self) -> Dict[str, Dict]:
        """최적화 규칙 로드"""
        return {
            "loop_optimization": {
                "patterns": [
                    r"for\s+\w+\s+in\s+range\(len\([^)]+\)\)",  # range(len()) 패턴
                    r"for\s+\w+\s+in\s+\w+:\s*if\s+",  # 루프 내 조건문
                ],
                "suggestions": [
                    "Use enumerate() instead of range(len())",
                    "Consider list comprehension with condition"
                ]
            },
            "data_structure_optimization": {
                "patterns": [
                    r"list\(\w+\.keys\(\)\)",  # list(dict.keys())
                    r"\w+\s*\+=\s*\[.*?\]",   # list concatenation with +=
                ],
                "suggestions": [
                    "Direct dictionary iteration is more efficient",
                    "Use list.extend() instead of += for better performance"
                ]
            },
            "function_call_optimization": {
                "patterns": [
                    r"(\w+)\([^)]*\).*\1\([^)]*\)",  # 중복 함수 호출
                    r"len\(\w+\)\s*>\s*0",           # len() > 0 패턴
                ],
                "suggestions": [
                    "Cache function results to avoid repeated calls",
                    "Use 'if sequence:' instead of 'if len(sequence) > 0:'"
                ]
            }
        }
    
    def analyze_code_for_optimization(self, code: str) -> List[OptimizationSuggestion]:
        """코드 최적화 분석"""
        suggestions = []
        lines = code.split('\n')
        
        # 패턴 기반 최적화 검사
        for rule_name, rule_data in self.optimization_rules.items():
            patterns = rule_data["patterns"]
            rule_suggestions = rule_data["suggestions"]
            
            for i, pattern in enumerate(patterns):
                for line_no, line in enumerate(lines, 1):
                    if re.search(pattern, line):
                        suggestion = OptimizationSuggestion(
                            type=rule_name,
                            priority="MEDIUM",
                            function_name="<unknown>",
                            line_number=line_no,
                            description=f"Pattern detected: {pattern}",
                            suggested_fix=rule_suggestions[min(i, len(rule_suggestions)-1)],
                            expected_improvement=10.0,
                            confidence=0.7,
                            code_example=self._generate_optimization_example(pattern, line)
                        )
                        suggestions.append(suggestion)
        
        # 복잡도 기반 최적화 검사
        complexity = self.complexity_analyzer.analyze_complexity(code)
        if complexity in [ComplexityClass.QUADRATIC, ComplexityClass.CUBIC, ComplexityClass.EXPONENTIAL]:
            suggestions.append(OptimizationSuggestion(
                type="algorithmic_complexity",
                priority="HIGH",
                function_name="<code_block>",
                line_number=None,
                description=f"High algorithmic complexity detected: {complexity.value}",
                suggested_fix="Consider using more efficient algorithms or data structures",
                expected_improvement=50.0,
                confidence=0.8
            ))
        
        return suggestions
    
    def _generate_optimization_example(self, pattern: str, original_line: str) -> str:
        """최적화 예제 생성"""
        examples = {
            r"for\s+\w+\s+in\s+range\(len\([^)]+\)\)": {
                "before": "for i in range(len(items)):",
                "after": "for i, item in enumerate(items):"
            },
            r"list\(\w+\.keys\(\)\)": {
                "before": "for key in list(dict.keys()):",
                "after": "for key in dict:"
            },
            r"len\(\w+\)\s*>\s*0": {
                "before": "if len(sequence) > 0:",
                "after": "if sequence:"
            }
        }
        
        for regex, example in examples.items():
            if re.search(regex, original_line):
                return f"Before: {example['before']}\nAfter: {example['after']}"
        
        return f"Original: {original_line.strip()}\nConsider optimization"
    
    def suggest_data_structure_optimization(self, operations: List[str]) -> List[OptimizationSuggestion]:
        """데이터 구조 최적화 제안"""
        suggestions = []
        
        # 연산 패턴 분석
        operation_count = Counter(operations)
        
        # 빈번한 검색이 있으면 dict 또는 set 제안
        if operation_count.get("lookup", 0) > operation_count.get("append", 0):
            suggestions.append(OptimizationSuggestion(
                type="data_structure",
                priority="MEDIUM",
                function_name="<data_operations>",
                line_number=None,
                description="Frequent lookup operations detected",
                suggested_fix="Consider using dict or set for O(1) lookup time",
                expected_improvement=30.0,
                confidence=0.8
            ))
        
        # 빈번한 삽입/삭제가 있으면 deque 제안
        if operation_count.get("insert", 0) + operation_count.get("delete", 0) > 10:
            suggestions.append(OptimizationSuggestion(
                type="data_structure",
                priority="MEDIUM",
                function_name="<data_operations>",
                line_number=None,
                description="Frequent insert/delete operations detected",
                suggested_fix="Consider using collections.deque for O(1) operations at both ends",
                expected_improvement=25.0,
                confidence=0.7
            ))
        
        return suggestions
    
    def apply_automatic_optimizations(self, code: str, 
                                    optimization_level: OptimizationLevel = OptimizationLevel.CONSERVATIVE) -> str:
        """자동 최적화 적용"""
        optimized_code = code
        
        if optimization_level in [OptimizationLevel.CONSERVATIVE, OptimizationLevel.MODERATE, OptimizationLevel.AGGRESSIVE]:
            # 안전한 최적화: range(len()) -> enumerate()
            optimized_code = re.sub(
                r'for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):',
                r'for \1, _ in enumerate(\2):',
                optimized_code
            )
        
        if optimization_level in [OptimizationLevel.MODERATE, OptimizationLevel.AGGRESSIVE]:
            # 중간 최적화: len() > 0 -> 직접 체크
            optimized_code = re.sub(
                r'len\((\w+)\)\s*>\s*0',
                r'\1',
                optimized_code
            )
        
        if optimization_level == OptimizationLevel.AGGRESSIVE:
            # 적극적 최적화: list comprehension 변환
            optimized_code = re.sub(
                r'(\w+)\s*=\s*\[\]\s*\nfor\s+(\w+)\s+in\s+(\w+):\s*\n\s*\1\.append\(([^)]+)\)',
                r'\1 = [\4 for \2 in \3]',
                optimized_code,
                flags=re.MULTILINE
            )
        
        return optimized_code


class ReportGenerator:
    """프로파일링 보고서 생성기"""
    
    def __init__(self):
        self.template_dir = Path(__file__).parent / "templates"
    
    def generate_html_report(self, profile_report: ProfileReport, 
                           output_path: Optional[Path] = None) -> str:
        """HTML 보고서 생성"""
        if output_path is None:
            output_path = Path(f"profile_report_{profile_report.session_id}.html")
        
        html_content = self._create_html_template(profile_report)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        logger.info(f"HTML report generated: {output_path}")
        return str(output_path)
    
    def _create_html_template(self, report: ProfileReport) -> str:
        """HTML 템플릿 생성"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <title>Performance Profile Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .header {{ background: #f0f0f0; padding: 20px; border-radius: 5px; }}
        .metric {{ margin: 10px 0; }}
        .function-profile {{ border: 1px solid #ddd; margin: 10px 0; padding: 15px; }}
        .optimization {{ background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px 0; }}
        .high-priority {{ border-left: 5px solid #e74c3c; }}
        .medium-priority {{ border-left: 5px solid #f39c12; }}
        .low-priority {{ border-left: 5px solid #27ae60; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Profile Report</h1>
        <div class="metric">Session ID: {report.session_id}</div>
        <div class="metric">Duration: {report.total_execution_time:.4f} seconds</div>
        <div class="metric">Generated: {report.end_time.strftime('%Y-%m-%d %H:%M:%S')}</div>
    </div>
    
    <h2>Function Profiles</h2>
    {self._generate_function_profiles_html(report.function_profiles)}
    
    <h2>Optimization Suggestions</h2>
    {self._generate_optimization_suggestions_html(report.optimization_suggestions)}
    
    <h2>Memory Analysis</h2>
    {self._generate_memory_analysis_html(report.memory_snapshots)}
    
    <h2>Benchmark Results</h2>
    {self._generate_benchmark_results_html(report.benchmark_results)}
</body>
</html>
        """
    
    def _generate_function_profiles_html(self, profiles: List[FunctionProfile]) -> str:
        """함수 프로파일 HTML 생성"""
        if not profiles:
            return "<p>No function profiles available.</p>"
        
        html = "<table><tr><th>Function</th><th>Calls</th><th>Total Time</th><th>Per Call</th><th>Memory</th></tr>"
        
        for profile in profiles[:20]:  # 상위 20개만
            memory_str = f"{profile.memory_usage:.2f} MB" if profile.memory_usage else "N/A"
            html += f"""
            <tr>
                <td>{profile.function_name}</td>
                <td>{profile.call_count}</td>
                <td>{profile.total_time:.6f}s</td>
                <td>{profile.per_call_time:.6f}s</td>
                <td>{memory_str}</td>
            </tr>
            """
        
        html += "</table>"
        return html
    
    def _generate_optimization_suggestions_html(self, suggestions: List[OptimizationSuggestion]) -> str:
        """최적화 제안 HTML 생성"""
        if not suggestions:
            return "<p>No optimization suggestions available.</p>"
        
        html = ""
        for suggestion in suggestions:
            priority_class = f"{suggestion.priority.lower()}-priority"
            html += f"""
            <div class="optimization {priority_class}">
                <h4>{suggestion.type} - {suggestion.priority} Priority</h4>
                <p><strong>Function:</strong> {suggestion.function_name}</p>
                <p><strong>Description:</strong> {suggestion.description}</p>
                <p><strong>Suggested Fix:</strong> {suggestion.suggested_fix}</p>
                <p><strong>Expected Improvement:</strong> {suggestion.expected_improvement:.1f}%</p>
                {f'<pre>{suggestion.code_example}</pre>' if suggestion.code_example else ''}
            </div>
            """
        
        return html
    
    def _generate_memory_analysis_html(self, snapshots: List[MemorySnapshot]) -> str:
        """메모리 분석 HTML 생성"""
        if not snapshots:
            return "<p>No memory snapshots available.</p>"
        
        html = "<table><tr><th>Timestamp</th><th>Used Memory</th><th>Peak Memory</th><th>Available</th></tr>"
        
        for snapshot in snapshots:
            html += f"""
            <tr>
                <td>{snapshot.timestamp.strftime('%H:%M:%S')}</td>
                <td>{snapshot.used_memory:.2f} MB</td>
                <td>{snapshot.peak_memory:.2f} MB</td>
                <td>{snapshot.available_memory:.2f} MB</td>
            </tr>
            """
        
        html += "</table>"
        return html
    
    def _generate_benchmark_results_html(self, results: List[BenchmarkResult]) -> str:
        """벤치마크 결과 HTML 생성"""
        if not results:
            return "<p>No benchmark results available.</p>"
        
        html = "<table><tr><th>Name</th><th>Mean Time</th><th>Std Dev</th><th>Ops/sec</th><th>Memory</th></tr>"
        
        for result in results:
            memory_str = f"{result.memory_usage:.2f} MB" if result.memory_usage else "N/A"
            html += f"""
            <tr>
                <td>{result.name}</td>
                <td>{result.mean_time*1000:.2f} ms</td>
                <td>{result.std_deviation*1000:.2f} ms</td>
                <td>{result.operations_per_second:.0f}</td>
                <td>{memory_str}</td>
            </tr>
            """
        
        html += "</table>"
        return html
    
    def generate_json_report(self, profile_report: ProfileReport, 
                           output_path: Optional[Path] = None) -> str:
        """JSON 보고서 생성"""
        if output_path is None:
            output_path = Path(f"profile_report_{profile_report.session_id}.json")
        
        # 데이터클래스를 딕셔너리로 변환
        report_dict = {
            "session_id": profile_report.session_id,
            "start_time": profile_report.start_time.isoformat(),
            "end_time": profile_report.end_time.isoformat(),
            "total_execution_time": profile_report.total_execution_time,
            "function_profiles": [
                {
                    "function_name": fp.function_name,
                    "module_name": fp.module_name,
                    "filename": fp.filename,
                    "line_number": fp.line_number,
                    "call_count": fp.call_count,
                    "total_time": fp.total_time,
                    "cumulative_time": fp.cumulative_time,
                    "per_call_time": fp.per_call_time,
                    "memory_usage": fp.memory_usage,
                    "memory_peak": fp.memory_peak,
                    "complexity_estimate": fp.complexity_estimate.value
                }
                for fp in profile_report.function_profiles
            ],
            "optimization_suggestions": [
                {
                    "type": os.type,
                    "priority": os.priority,
                    "function_name": os.function_name,
                    "line_number": os.line_number,
                    "description": os.description,
                    "suggested_fix": os.suggested_fix,
                    "expected_improvement": os.expected_improvement,
                    "confidence": os.confidence,
                    "code_example": os.code_example
                }
                for os in profile_report.optimization_suggestions
            ],
            "benchmark_results": [
                {
                    "name": br.name,
                    "mean_time": br.mean_time,
                    "median_time": br.median_time,
                    "std_deviation": br.std_deviation,
                    "min_time": br.min_time,
                    "max_time": br.max_time,
                    "operations_per_second": br.operations_per_second,
                    "memory_usage": br.memory_usage
                }
                for br in profile_report.benchmark_results
            ],
            "metadata": profile_report.metadata
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report_dict, f, indent=2, ensure_ascii=False)
        
        logger.info(f"JSON report generated: {output_path}")
        return str(output_path)


# 통합 성능 분석기
class PerformanceAnalyzer:
    """통합 성능 분석기"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.code_profiler = CodeProfiler()
        self.line_profiler = LineByLineProfiler()
        self.complexity_analyzer = ComplexityAnalyzer()
        self.benchmark_suite = BenchmarkSuite()
        self.optimization_engine = OptimizationEngine()
        self.report_generator = ReportGenerator()
        self.realtime_monitor = RealTimeMonitor()
    
    def analyze_function(self, func: Callable, *args, 
                        include_line_profile: bool = False,
                        include_complexity: bool = True,
                        benchmark_iterations: int = 100, **kwargs) -> ProfileReport:
        """함수 종합 분석"""
        session_id = f"func_analysis_{int(time.time() * 1000)}"
        start_time = datetime.now()
        
        # 기본 프로파일링
        result, function_profile = self.code_profiler.profile_function(func, *args, **kwargs)
        
        # 라인별 프로파일링
        line_profiles = []
        if include_line_profile:
            line_profiles = self.line_profiler.profile_function_lines(func)
        
        # 복잡도 분석
        complexity_suggestions = []
        if include_complexity:
            try:
                source_code = inspect.getsource(func)
                complexity_suggestions = self.optimization_engine.analyze_code_for_optimization(source_code)
            except Exception as e:
                logger.warning(f"Could not analyze complexity: {e}")
        
        # 벤치마킹
        benchmark_result = self.benchmark_suite.benchmark_function(
            func, *args, iterations=benchmark_iterations, **kwargs
        )
        
        end_time = datetime.now()
        total_time = (end_time - start_time).total_seconds()
        
        return ProfileReport(
            session_id=session_id,
            start_time=start_time,
            end_time=end_time,
            total_execution_time=total_time,
            function_profiles=[function_profile],
            line_profiles=line_profiles,
            memory_snapshots=self.code_profiler.memory_profiler.snapshots[-2:],
            optimization_suggestions=complexity_suggestions,
            benchmark_results=[benchmark_result]
        )
    
    def analyze_code_snippet(self, code: str, 
                           globals_dict: Optional[Dict] = None,
                           locals_dict: Optional[Dict] = None,
                           optimize: bool = True) -> ProfileReport:
        """코드 스니펫 분석"""
        # 기본 프로파일링
        profile_report = self.code_profiler.profile_code_block(
            code, globals_dict, locals_dict
        )
        
        # 최적화 분석
        if optimize:
            optimization_suggestions = self.optimization_engine.analyze_code_for_optimization(code)
            profile_report.optimization_suggestions.extend(optimization_suggestions)
        
        return profile_report
    
    def compare_algorithms(self, algorithms: Dict[str, Callable],
                         test_data_generator: Callable,
                         input_sizes: List[int] = None) -> Dict[str, Any]:
        """알고리즘 성능 비교"""
        if input_sizes is None:
            input_sizes = [100, 500, 1000, 5000]
        
        results = {}
        
        for size in input_sizes:
            test_data = test_data_generator(size)
            size_results = self.benchmark_suite.compare_implementations(
                algorithms, test_args=(test_data,)
            )
            results[size] = size_results
        
        # 복잡도 분석
        complexity_analysis = {}
        for name, algorithm in algorithms.items():
            try:
                complexity_result = self.complexity_analyzer.estimate_runtime_complexity(
                    algorithm, input_sizes
                )
                complexity_analysis[name] = complexity_result
            except Exception as e:
                logger.warning(f"Complexity analysis failed for {name}: {e}")
                complexity_analysis[name] = {"estimated_complexity": ComplexityClass.UNKNOWN}
        
        return {
            "benchmark_results": results,
            "complexity_analysis": complexity_analysis,
            "recommendations": self._generate_algorithm_recommendations(results, complexity_analysis)
        }
    
    def _generate_algorithm_recommendations(self, benchmark_results: Dict,
                                          complexity_analysis: Dict) -> List[str]:
        """알고리즘 추천 생성"""
        recommendations = []
        
        # 가장 빠른 알고리즘 찾기
        fastest_times = {}
        for size, results in benchmark_results.items():
            fastest_algo = min(results.keys(), key=lambda k: results[k].mean_time)
            fastest_times[size] = (fastest_algo, results[fastest_algo].mean_time)
        
        # 일관성 있게 빠른 알고리즘 확인
        algorithm_wins = Counter(algo for algo, _ in fastest_times.values())
        most_consistent = algorithm_wins.most_common(1)
        if most_consistent:
            best_algo, wins = most_consistent[0]
            recommendations.append(f"Algorithm '{best_algo}' performs best in {wins}/{len(benchmark_results)} test cases")
        
        # 복잡도 기반 추천
        for algo_name, analysis in complexity_analysis.items():
            complexity = analysis.get("estimated_complexity", ComplexityClass.UNKNOWN)
            if complexity in [ComplexityClass.QUADRATIC, ComplexityClass.CUBIC, ComplexityClass.EXPONENTIAL]:
                recommendations.append(f"Algorithm '{algo_name}' has high complexity ({complexity.value}) - consider optimization for large inputs")
            elif complexity in [ComplexityClass.CONSTANT, ComplexityClass.LINEAR]:
                recommendations.append(f"Algorithm '{algo_name}' has good complexity ({complexity.value}) - suitable for large datasets")
        
        return recommendations
    
    def start_realtime_monitoring(self, callback: Optional[Callable] = None) -> None:
        """실시간 모니터링 시작"""
        if callback:
            self.realtime_monitor.add_callback(callback)
        
        self.realtime_monitor.start_monitoring()
    
    def stop_realtime_monitoring(self) -> Dict[str, Any]:
        """실시간 모니터링 중지 및 결과 반환"""
        self.realtime_monitor.stop_monitoring()
        
        # 최근 1분간의 평균 메트릭 계산
        metrics_summary = {}
        for metric_name in ["cpu_percent", "memory_usage", "thread_count"]:
            avg_value = self.realtime_monitor.get_average_metric(metric_name, 60)
            if avg_value is not None:
                metrics_summary[metric_name] = avg_value
        
        return {
            "monitoring_duration": len(self.realtime_monitor.metrics_history),
            "average_metrics": metrics_summary,
            "peak_memory": max(
                (m.value for m in self.realtime_monitor.metrics_history if m.name == "memory_usage"),
                default=0
            )
        }
    
    def generate_comprehensive_report(self, profile_report: ProfileReport,
                                    output_format: str = "html") -> str:
        """종합 보고서 생성"""
        if output_format.lower() == "html":
            return self.report_generator.generate_html_report(profile_report)
        elif output_format.lower() == "json":
            return self.report_generator.generate_json_report(profile_report)
        else:
            raise ValueError(f"Unsupported output format: {output_format}")


# 데코레이터들
def profile_performance(include_memory: bool = True, 
                       include_line_profile: bool = False,
                       benchmark_iterations: int = 10):
    """성능 프로파일링 데코레이터"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            analyzer = PerformanceAnalyzer()
            
            # 프로파일링 실행
            report = analyzer.analyze_function(
                func, *args,
                include_line_profile=include_line_profile,
                benchmark_iterations=benchmark_iterations,
                **kwargs
            )
            
            # 결과 로깅
            function_profile = report.function_profiles[0]
            logger.info(f"Function {func.__name__} profile:")
            logger.info(f"  Execution time: {function_profile.total_time:.6f}s")
            logger.info(f"  Memory usage: {function_profile.memory_usage:.2f}MB")
            
            # 최적화 제안이 있으면 경고
            if report.optimization_suggestions:
                logger.warning(f"Optimization suggestions available for {func.__name__}")
                for suggestion in report.optimization_suggestions[:3]:  # 상위 3개만
                    logger.warning(f"  {suggestion.description}")
            
            # 원본 함수 실행 결과 반환
            return analyzer.code_profiler.profile_function(func, *args, **kwargs)[0]
        
        # 프로파일링 결과에 접근할 수 있도록 속성 추가
        wrapper._last_profile_report = None
        return wrapper
    
    return decorator


def benchmark_compare(*functions):
    """함수들을 벤치마킹 비교하는 데코레이터"""
    def decorator(test_func: Callable) -> Callable:
        @wraps(test_func)
        def wrapper(*args, **kwargs):
            # 테스트 데이터 생성
            test_data = test_func(*args, **kwargs)
            
            # 함수들을 딕셔너리로 변환
            func_dict = {f.__name__: f for f in functions}
            
            # 벤치마킹 실행
            analyzer = PerformanceAnalyzer()
            results = analyzer.benchmark_suite.compare_implementations(
                func_dict, test_args=(test_data,)
            )
            
            # 결과 출력
            print(f"\nBenchmark Results for {test_func.__name__}:")
            print("-" * 50)
            for name, result in sorted(results.items(), key=lambda x: x[1].mean_time):
                print(f"{name:20}: {result.mean_time*1000:8.2f}ms avg ({result.operations_per_second:8.0f} ops/sec)")
            
            return results
        
        return wrapper
    
    return decorator


def monitor_memory(threshold_mb: float = 100.0):
    """메모리 사용량 모니터링 데코레이터"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            profiler = MemoryProfiler()
            
            with profiler.monitor_memory():
                start_snapshot = profiler.take_snapshot()
                result = func(*args, **kwargs)
                end_snapshot = profiler.take_snapshot()
            
            memory_delta = profiler.get_memory_delta(start_snapshot, end_snapshot)
            
            if memory_delta > threshold_mb:
                logger.warning(f"High memory usage in {func.__name__}: {memory_delta:.2f}MB")
            
            logger.debug(f"Memory delta for {func.__name__}: {memory_delta:.2f}MB")
            
            return result
        
        return wrapper
    
    return decorator


# 컨텍스트 매니저들
@contextmanager
def performance_context(name: str = "operation"):
    """성능 측정 컨텍스트 매니저"""
    timer = PerformanceTimer()
    profiler = MemoryProfiler()
    
    logger.info(f"Starting performance measurement: {name}")
    
    with profiler.monitor_memory():
        start_snapshot = profiler.take_snapshot()
        
        with timer.measure():
            yield {
                'timer': timer,
                'profiler': profiler
            }
        
        end_snapshot = profiler.take_snapshot()
    
    execution_time = timer.elapsed_times[-1]
    memory_delta = profiler.get_memory_delta(start_snapshot, end_snapshot)
    
    logger.info(f"Performance measurement complete: {name}")
    logger.info(f"  Execution time: {execution_time:.6f}s")
    logger.info(f"  Memory delta: {memory_delta:.2f}MB")


@contextmanager
def benchmark_context(name: str = "benchmark", iterations: int = 100):
    """벤치마킹 컨텍스트 매니저"""
    suite = BenchmarkSuite()
    results = []
    
    def add_benchmark(func: Callable, *args, **kwargs):
        result = suite.benchmark_function(func, *args, iterations=iterations, **kwargs)
        results.append(result)
        return result
    
    yield add_benchmark
    
    # 결과 출력
    if results:
        print(f"\nBenchmark Results: {name}")
        print("-" * 50)
        for result in sorted(results, key=lambda x: x.mean_time):
            print(f"{result.name:20}: {result.mean_time*1000:8.2f}ms avg")


# 편의 함수들
def quick_profile(func: Callable, *args, **kwargs) -> Dict[str, Any]:
    """빠른 프로파일링"""
    analyzer = PerformanceAnalyzer()
    report = analyzer.analyze_function(func, *args, **kwargs)
    
    function_profile = report.function_profiles[0]
    
    return {
        "execution_time": function_profile.total_time,
        "memory_usage": function_profile.memory_usage,
        "call_count": function_profile.call_count,
        "operations_per_second": 1.0 / function_profile.per_call_time if function_profile.per_call_time > 0 else 0,
        "optimization_suggestions": len(report.optimization_suggestions)
    }


def compare_functions(functions: Dict[str, Callable], test_data: Any, 
                     iterations: int = 100) -> Dict[str, BenchmarkResult]:
    """함수들 성능 비교"""
    suite = BenchmarkSuite()
    return suite.compare_implementations(functions, test_args=(test_data,), iterations=iterations)


def analyze_complexity(func: Callable, input_sizes: List[int] = None) -> Dict[str, Any]:
    """함수 복잡도 분석"""
    if input_sizes is None:
        input_sizes = [10, 50, 100, 500, 1000]
    
    analyzer = ComplexityAnalyzer()
    return analyzer.estimate_runtime_complexity(func, input_sizes)


def optimize_code(code: str, level: OptimizationLevel = OptimizationLevel.CONSERVATIVE) -> str:
    """코드 자동 최적화"""
    engine = OptimizationEngine()
    return engine.apply_automatic_optimizations(code, level)


def get_optimization_suggestions(code: str) -> List[OptimizationSuggestion]:
    """최적화 제안 획득"""
    engine = OptimizationEngine()
    return engine.analyze_code_for_optimization(code)


# 시각화 함수들 (matplotlib 사용 가능 시)
def plot_benchmark_results(results: Dict[str, BenchmarkResult], 
                          title: str = "Benchmark Results"):
    """벤치마크 결과 시각화"""
    if not HAS_PLOTTING:
        logger.warning("matplotlib not available for plotting")
        return
    
    names = list(results.keys())
    times = [result.mean_time * 1000 for result in results.values()]  # ms 변환
    errors = [result.std_deviation * 1000 for result in results.values()]
    
    plt.figure(figsize=(10, 6))
    bars = plt.bar(names, times, yerr=errors, capsize=5)
    plt.title(title)
    plt.ylabel('Execution Time (ms)')
    plt.xlabel('Implementation')
    plt.xticks(rotation=45, ha='right')
    
    # 값 표시
    for bar, time in zip(bars, times):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + max(errors)/20,
                f'{time:.2f}ms', ha='center', va='bottom')
    
    plt.tight_layout()
    plt.show()


def plot_complexity_analysis(measurements: List[Tuple[int, float]], 
                           complexity: ComplexityClass,
                           title: str = "Runtime Complexity Analysis"):
    """복잡도 분석 결과 시각화"""
    if not HAS_PLOTTING:
        logger.warning("matplotlib not available for plotting")
        return
    
    sizes = [m[0] for m in measurements]
    times = [m[1] * 1000 for m in measurements]  # ms 변환
    
    plt.figure(figsize=(10, 6))
    plt.plot(sizes, times, 'bo-', label='Measured')
    
    # 이론적 복잡도 곡선 그리기
    if complexity != ComplexityClass.UNKNOWN:
        theoretical_times = []
        base_time = times[0] / max(1, sizes[0]) if sizes else 1
        
        for size in sizes:
            if complexity == ComplexityClass.CONSTANT:
                theoretical_times.append(base_time)
            elif complexity == ComplexityClass.LINEAR:
                theoretical_times.append(base_time * size)
            elif complexity == ComplexityClass.QUADRATIC:
                theoretical_times.append(base_time * size * size / sizes[0])
            elif complexity == ComplexityClass.EXPONENTIAL:
                theoretical_times.append(base_time * (2 ** (size / sizes[0])) if sizes else base_time)
            else:
                theoretical_times.append(base_time * size)
        
        plt.plot(sizes, theoretical_times, 'r--', label=f'Theoretical {complexity.value}')
    
    plt.title(title)
    plt.xlabel('Input Size')
    plt.ylabel('Execution Time (ms)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.show()


def plot_memory_usage(snapshots: List[MemorySnapshot], 
                     title: str = "Memory Usage Over Time"):
    """메모리 사용량 시각화"""
    if not HAS_PLOTTING:
        logger.warning("matplotlib not available for plotting")
        return
    
    if not snapshots:
        logger.warning("No memory snapshots to plot")
        return
    
    timestamps = [(s.timestamp - snapshots[0].timestamp).total_seconds() for s in snapshots]
    memory_usage = [s.used_memory for s in snapshots]
    
    plt.figure(figsize=(12, 6))
    plt.plot(timestamps, memory_usage, 'b-', linewidth=2, label='Memory Usage')
    plt.fill_between(timestamps, memory_usage, alpha=0.3)
    
    plt.title(title)
    plt.xlabel('Time (seconds)')
    plt.ylabel('Memory Usage (MB)')
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.show()


# 전역 인스턴스 및 설정
_global_analyzer = None

def get_performance_analyzer(config: Optional[Dict[str, Any]] = None) -> PerformanceAnalyzer:
    """전역 성능 분석기 인스턴스 반환"""
    global _global_analyzer
    if _global_analyzer is None:
        _global_analyzer = PerformanceAnalyzer(config)
    return _global_analyzer


# 설정 클래스
@dataclass
class ProfilingConfig:
    """프로파일링 설정"""
    enable_memory_profiling: bool = True
    enable_line_profiling: bool = False
    enable_realtime_monitoring: bool = False
    benchmark_iterations: int = 100
    optimization_level: OptimizationLevel = OptimizationLevel.CONSERVATIVE
    report_format: str = "html"
    output_directory: Path = Path("./profiling_reports")
    max_memory_snapshots: int = 1000
    monitoring_interval: float = 1.0


# 메인 실행부 (예제 및 테스트)
if __name__ == "__main__":
    import doctest
    
    # 예제 함수들
    def fibonacci_recursive(n):
        """재귀 피보나치 (비효율적)"""
        if n <= 1:
            return n
        return fibonacci_recursive(n-1) + fibonacci_recursive(n-2)
    
    def fibonacci_iterative(n):
        """반복 피보나치 (효율적)"""
        if n <= 1:
            return n
        a, b = 0, 1
        for _ in range(2, n + 1):
            a, b = b, a + b
        return b
    
    def bubble_sort(arr):
        """버블 정렬 (O(n²))"""
        arr = arr.copy()
        n = len(arr)
        for i in range(n):
            for j in range(0, n - i - 1):
                if arr[j] > arr[j + 1]:
                    arr[j], arr[j + 1] = arr[j + 1], arr[j]
        return arr
    
    def quick_sort(arr):
        """퀵 정렬 (평균 O(n log n))"""
        if len(arr) <= 1:
            return arr
        pivot = arr[len(arr) // 2]
        left = [x for x in arr if x < pivot]
        middle = [x for x in arr if x == pivot]
        right = [x for x in arr if x > pivot]
        return quick_sort(left) + middle + quick_sort(right)
    
    # 성능 분석 예제
    print("=== Performance Profiling Utilities Demo ===\n")
    
    # 1. 빠른 프로파일링
    print("1. Quick profiling:")
    result = quick_profile(fibonacci_iterative, 30)
    print(f"Fibonacci(30) profile: {result}")
    print()
    
    # 2. 함수 비교
    print("2. Comparing algorithms:")
    test_data = [5, 2, 8, 1, 9, 3, 7, 4, 6]
    sorting_algorithms = {
        "bubble_sort": bubble_sort,
        "quick_sort": quick_sort,
        "python_sort": lambda x: sorted(x)
    }
    
    comparison_results = compare_functions(sorting_algorithms, test_data, iterations=50)
    print("Sorting algorithm comparison:")
    for name, result in sorted(comparison_results.items(), key=lambda x: x[1].mean_time):
        print(f"  {name:15}: {result.mean_time*1000:8.2f}ms avg")
    print()
    
    # 3. 복잡도 분석
    print("3. Complexity analysis:")
    complexity_result = analyze_complexity(fibonacci_iterative, [10, 15, 20, 25, 30])
    print(f"Fibonacci complexity: {complexity_result['estimated_complexity'].value}")
    print()
    
    # 4. 코드 최적화 제안
    print("4. Code optimization suggestions:")
    sample_code = """
def inefficient_function(items):
    result = []
    for i in range(len(items)):
        if len(items[i]) > 0:
            result += [items[i]]
    return result
"""
    
    suggestions = get_optimization_suggestions(sample_code)
    for suggestion in suggestions:
        print(f"  - {suggestion.description}")
        print(f"    Fix: {suggestion.suggested_fix}")
    print()
    
    # 5. 최적화된 코드 생성
    print("5. Automatic code optimization:")
    optimized_code = optimize_code(sample_code, OptimizationLevel.MODERATE)
    print("Optimized code:")
    print(optimized_code)
    print()
    
    # 6. 데코레이터 사용 예제
    print("6. Decorator usage:")
    
    @profile_performance(benchmark_iterations=10)
    def test_function(n):
        return sum(range(n))
    
    result = test_function(10000)
    print(f"Test function result: {result}")
    print()
    
    # 7. 컨텍스트 매니저 사용 예제
    print("7. Context manager usage:")
    with performance_context("matrix multiplication"):
        import random
        matrix_a = [[random.random() for _ in range(100)] for _ in range(100)]
        matrix_b = [[random.random() for _ in range(100)] for _ in range(100)]
        
        # 단순한 행렬 곱셈
        result_matrix = []
        for i in range(len(matrix_a)):
            row = []
            for j in range(len(matrix_b[0])):
                sum_val = sum(matrix_a[i][k] * matrix_b[k][j] for k in range(len(matrix_b)))
                row.append(sum_val)
            result_matrix.append(row)
    
    print("Matrix multiplication completed!")
    print()
    
    # 8. 종합 분석 보고서 생성
    print("8. Comprehensive analysis report:")
    analyzer = get_performance_analyzer()
    
    # 함수 분석
    comprehensive_report = analyzer.analyze_function(
        fibonacci_iterative, 25,
        include_line_profile=False,
        benchmark_iterations=50
    )
    
    # 보고서 생성
    report_path = analyzer.generate_comprehensive_report(comprehensive_report, "json")
    print(f"Comprehensive report generated: {report_path}")
    
    print("\n=== Demo completed ===")
    print("Check the generated reports for detailed analysis results.")