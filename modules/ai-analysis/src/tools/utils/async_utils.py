#!/usr/bin/env python3
"""
Enhanced Async Utilities
비동기 처리, 배치 작업, 동시성 제어 및 분산 처리 고도화 버전
"""

import asyncio
import time
import logging
import threading
import weakref
from typing import List, Callable, Any, Optional, Dict, Union, Awaitable, TypeVar, Generic
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from functools import wraps, partial
from contextlib import asynccontextmanager
from enum import Enum, auto
import json
import hashlib
import psutil
from collections import defaultdict, deque
import random
import math

# Pydantic for configuration validation
try:
    from pydantic import BaseModel, Field, validator
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False

T = TypeVar('T')
R = TypeVar('R')

# Configuration
class AsyncConfig(BaseModel if PYDANTIC_AVAILABLE else object):
    """비동기 처리 설정"""
    max_concurrency: int = Field(default=10, ge=1, le=1000)
    default_timeout: float = Field(default=30.0, gt=0)
    retry_attempts: int = Field(default=3, ge=0, le=10)
    backoff_factor: float = Field(default=2.0, ge=1.0, le=10.0)
    enable_circuit_breaker: bool = Field(default=True)
    circuit_breaker_threshold: int = Field(default=5, ge=1)
    circuit_breaker_timeout: float = Field(default=60.0, gt=0)
    enable_metrics: bool = Field(default=True)
    metrics_window_size: int = Field(default=1000, ge=100)
    rate_limit_enabled: bool = Field(default=False)
    rate_limit_calls_per_second: float = Field(default=10.0, gt=0)
    bulkhead_enabled: bool = Field(default=False)
    bulkhead_max_workers: int = Field(default=5, ge=1)
    
    if not PYDANTIC_AVAILABLE:
        def __init__(self, **kwargs):
            # Set defaults
            defaults = {
                'max_concurrency': 10,
                'default_timeout': 30.0,
                'retry_attempts': 3,
                'backoff_factor': 2.0,
                'enable_circuit_breaker': True,
                'circuit_breaker_threshold': 5,
                'circuit_breaker_timeout': 60.0,
                'enable_metrics': True,
                'metrics_window_size': 1000,
                'rate_limit_enabled': False,
                'rate_limit_calls_per_second': 10.0,
                'bulkhead_enabled': False,
                'bulkhead_max_workers': 5
            }
            
            for key, default_value in defaults.items():
                setattr(self, key, kwargs.get(key, default_value))

# Custom exceptions
class AsyncUtilsError(Exception):
    """비동기 유틸리티 관련 예외"""
    pass

class CircuitBreakerOpenError(AsyncUtilsError):
    """회로 차단기 열림 예외"""
    pass

class RateLimitExceededError(AsyncUtilsError):
    """요청 한도 초과 예외"""
    pass

class BulkheadFullError(AsyncUtilsError):
    """격벽 풀 예외"""
    pass

class TimeoutError(AsyncUtilsError):
    """타임아웃 예외"""
    pass

# Enums
class CircuitBreakerState(Enum):
    CLOSED = auto()
    OPEN = auto()
    HALF_OPEN = auto()

class TaskState(Enum):
    PENDING = auto()
    RUNNING = auto()
    COMPLETED = auto()
    FAILED = auto()
    CANCELLED = auto()

class Priority(Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4

# Data classes
@dataclass
class BatchResult:
    """배치 처리 결과"""
    success_count: int
    error_count: int
    total_count: int
    results: List[Any]
    errors: List[Exception]
    execution_time: float
    memory_usage_mb: float
    throughput: float
    
    @property
    def success_rate(self) -> float:
        """성공률"""
        return (self.success_count / self.total_count * 100) if self.total_count > 0 else 0.0

@dataclass
class TaskMetrics:
    """작업 메트릭"""
    task_id: str
    start_time: float
    end_time: Optional[float] = None
    duration: Optional[float] = None
    memory_start: int = 0
    memory_end: int = 0
    memory_peak: int = 0
    retry_count: int = 0
    state: TaskState = TaskState.PENDING
    error: Optional[Exception] = None
    
    def complete(self):
        """작업 완료 처리"""
        self.end_time = time.time()
        self.duration = self.end_time - self.start_time
        self.state = TaskState.COMPLETED
    
    def fail(self, error: Exception):
        """작업 실패 처리"""
        self.end_time = time.time()
        self.duration = self.end_time - self.start_time
        self.state = TaskState.FAILED
        self.error = error

@dataclass
class WorkerStats:
    """워커 통계"""
    worker_id: str
    tasks_completed: int = 0
    tasks_failed: int = 0
    total_duration: float = 0.0
    last_activity: float = field(default_factory=time.time)
    
    @property
    def success_rate(self) -> float:
        """성공률"""
        total = self.tasks_completed + self.tasks_failed
        return (self.tasks_completed / total * 100) if total > 0 else 0.0
    
    @property
    def avg_duration(self) -> float:
        """평균 처리 시간"""
        return (self.total_duration / self.tasks_completed) if self.tasks_completed > 0 else 0.0

# Circuit Breaker Pattern
class CircuitBreaker:
    """회로 차단기 패턴 구현"""
    
    def __init__(self, failure_threshold: int = 5, timeout: float = 60.0, 
                 recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.recovery_timeout = recovery_timeout
        
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0
        self._next_attempt_time = 0
        self._lock = threading.RLock()
        
        self._success_count = 0
        self._total_requests = 0
        
    @property
    def state(self) -> CircuitBreakerState:
        """현재 상태"""
        return self._state
    
    @property
    def failure_rate(self) -> float:
        """실패율"""
        return (self._failure_count / self._total_requests * 100) if self._total_requests > 0 else 0.0
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """회로 차단기를 통한 함수 호출"""
        with self._lock:
            self._total_requests += 1
            
            if self._state == CircuitBreakerState.OPEN:
                if time.time() < self._next_attempt_time:
                    raise CircuitBreakerOpenError("Circuit breaker is open")
                else:
                    self._state = CircuitBreakerState.HALF_OPEN
            
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                
                self._on_success()
                return result
                
            except Exception as e:
                self._on_failure()
                raise e
    
    def _on_success(self):
        """성공 처리"""
        with self._lock:
            self._failure_count = 0
            self._success_count += 1
            
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._state = CircuitBreakerState.CLOSED
    
    def _on_failure(self):
        """실패 처리"""
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitBreakerState.OPEN
                self._next_attempt_time = time.time() + self.timeout
    
    def reset(self):
        """회로 차단기 리셋"""
        with self._lock:
            self._state = CircuitBreakerState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._total_requests = 0

# Rate Limiter
class RateLimiter:
    """요청 빈도 제한기"""
    
    def __init__(self, calls_per_second: float, burst_size: Optional[int] = None):
        self.calls_per_second = calls_per_second
        self.burst_size = burst_size or int(calls_per_second * 2)
        self.tokens = self.burst_size
        self.last_refill = time.time()
        self.lock = threading.RLock()
    
    def acquire(self, tokens: int = 1) -> bool:
        """토큰 획득"""
        with self.lock:
            now = time.time()
            elapsed = now - self.last_refill
            
            # 토큰 리필
            self.tokens = min(
                self.burst_size,
                self.tokens + elapsed * self.calls_per_second
            )
            self.last_refill = now
            
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            
            return False
    
    async def wait_for_token(self, tokens: int = 1):
        """토큰 대기"""
        while not self.acquire(tokens):
            # 다음 토큰까지 대기 시간 계산
            wait_time = (tokens - self.tokens) / self.calls_per_second
            await asyncio.sleep(min(wait_time, 0.1))

# Bulkhead Pattern
class Bulkhead:
    """격벽 패턴 (리소스 격리)"""
    
    def __init__(self, max_workers: int, name: str = "default"):
        self.max_workers = max_workers
        self.name = name
        self.semaphore = asyncio.Semaphore(max_workers)
        self.active_tasks = 0
        self.completed_tasks = 0
        self.failed_tasks = 0
        self.lock = threading.RLock()
    
    @asynccontextmanager
    async def acquire(self):
        """리소스 획득"""
        try:
            await self.semaphore.acquire()
            with self.lock:
                self.active_tasks += 1
            
            yield
            
        finally:
            with self.lock:
                self.active_tasks -= 1
                self.completed_tasks += 1
            self.semaphore.release()
    
    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """격벽을 통한 함수 실행"""
        if self.semaphore.locked() and self.active_tasks >= self.max_workers:
            raise BulkheadFullError(f"Bulkhead {self.name} is full")
        
        async with self.acquire():
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                else:
                    loop = asyncio.get_event_loop()
                    return await loop.run_in_executor(None, func, *args, **kwargs)
            except Exception as e:
                with self.lock:
                    self.failed_tasks += 1
                raise e
    
    def get_stats(self) -> Dict[str, Any]:
        """격벽 통계"""
        with self.lock:
            total_tasks = self.completed_tasks + self.failed_tasks
            return {
                "name": self.name,
                "max_workers": self.max_workers,
                "active_tasks": self.active_tasks,
                "completed_tasks": self.completed_tasks,
                "failed_tasks": self.failed_tasks,
                "success_rate": (self.completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0,
                "utilization": (self.active_tasks / self.max_workers * 100)
            }

# Metrics Collection
class MetricsCollector:
    """메트릭 수집기"""
    
    def __init__(self, window_size: int = 1000):
        self.window_size = window_size
        self.metrics = deque(maxlen=window_size)
        self.counters = defaultdict(int)
        self.gauges = {}
        self.histograms = defaultdict(list)
        self.lock = threading.RLock()
    
    def record_metric(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        """메트릭 기록"""
        with self.lock:
            metric = {
                'name': name,
                'value': value,
                'timestamp': time.time(),
                'tags': tags or {}
            }
            self.metrics.append(metric)
    
    def increment_counter(self, name: str, value: int = 1):
        """카운터 증가"""
        with self.lock:
            self.counters[name] += value
    
    def set_gauge(self, name: str, value: float):
        """게이지 설정"""
        with self.lock:
            self.gauges[name] = value
    
    def record_histogram(self, name: str, value: float):
        """히스토그램 기록"""
        with self.lock:
            self.histograms[name].append(value)
            # 윈도우 크기 유지
            if len(self.histograms[name]) > self.window_size:
                self.histograms[name] = self.histograms[name][-self.window_size:]
    
    def get_summary(self) -> Dict[str, Any]:
        """메트릭 요약"""
        with self.lock:
            summary = {
                'counters': dict(self.counters),
                'gauges': dict(self.gauges),
                'histograms': {}
            }
            
            # 히스토그램 통계 계산
            for name, values in self.histograms.items():
                if values:
                    summary['histograms'][name] = {
                        'count': len(values),
                        'min': min(values),
                        'max': max(values),
                        'mean': sum(values) / len(values),
                        'p50': self._percentile(values, 50),
                        'p95': self._percentile(values, 95),
                        'p99': self._percentile(values, 99)
                    }
            
            return summary
    
    def _percentile(self, values: List[float], percentile: int) -> float:
        """백분위수 계산"""
        if not values:
            return 0.0
        
        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile / 100)
        return sorted_values[min(index, len(sorted_values) - 1)]

# Enhanced Async Utils
class EnhancedAsyncUtils:
    """향상된 비동기 처리 유틸리티"""
    
    def __init__(self, config: Optional[AsyncConfig] = None):
        self.config = config or AsyncConfig()
        self.logger = self._setup_logger()
        
        # Core components
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=self.config.circuit_breaker_threshold,
            timeout=self.config.circuit_breaker_timeout
        ) if self.config.enable_circuit_breaker else None
        
        self.rate_limiter = RateLimiter(
            calls_per_second=self.config.rate_limit_calls_per_second
        ) if self.config.rate_limit_enabled else None
        
        self.bulkhead = Bulkhead(
            max_workers=self.config.bulkhead_max_workers,
            name="main"
        ) if self.config.bulkhead_enabled else None
        
        self.metrics = MetricsCollector(
            window_size=self.config.metrics_window_size
        ) if self.config.enable_metrics else None
        
        # Task tracking
        self.active_tasks = {}
        self.task_history = deque(maxlen=1000)
        self.task_counter = 0
        self.lock = threading.RLock()
    
    def _setup_logger(self) -> logging.Logger:
        """로거 설정"""
        logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _generate_task_id(self) -> str:
        """작업 ID 생성"""
        with self.lock:
            self.task_counter += 1
            return f"task_{self.task_counter}_{int(time.time() * 1000)}"
    
    async def safe_operation(self, operation: Callable, *args, 
                           timeout: Optional[float] = None,
                           context: Optional[Dict[str, Any]] = None,
                           **kwargs) -> Dict[str, Any]:
        """안전한 비동기 작업 래퍼"""
        task_id = self._generate_task_id()
        start_time = time.time()
        initial_memory = psutil.Process().memory_info().rss
        
        # 작업 메트릭 초기화
        task_metrics = TaskMetrics(
            task_id=task_id,
            start_time=start_time,
            memory_start=initial_memory
        )
        
        with self.lock:
            self.active_tasks[task_id] = task_metrics
        
        try:
            # Rate limiting
            if self.rate_limiter:
                await self.rate_limiter.wait_for_token()
            
            # Circuit breaker
            if self.circuit_breaker:
                operation = partial(self.circuit_breaker.call, operation)
            
            # Bulkhead
            if self.bulkhead:
                result = await self.bulkhead.execute(operation, *args, **kwargs)
            else:
                # Timeout wrapper
                timeout_duration = timeout or self.config.default_timeout
                
                if asyncio.iscoroutinefunction(operation):
                    result = await asyncio.wait_for(
                        operation(*args, **kwargs), 
                        timeout=timeout_duration
                    )
                else:
                    loop = asyncio.get_event_loop()
                    future = loop.run_in_executor(None, operation, *args, **kwargs)
                    result = await asyncio.wait_for(future, timeout=timeout_duration)
            
            # 성공 처리
            duration = time.time() - start_time
            final_memory = psutil.Process().memory_info().rss
            memory_delta = final_memory - initial_memory
            
            task_metrics.complete()
            task_metrics.memory_end = final_memory
            
            # 메트릭 기록
            if self.metrics:
                self.metrics.record_metric('operation_duration', duration, {'operation': operation.__name__})
                self.metrics.record_metric('memory_usage', memory_delta, {'operation': operation.__name__})
                self.metrics.increment_counter('operations_success')
            
            self.logger.debug(f"Operation {operation.__name__} completed successfully in {duration:.2f}s")
            
            return {
                'success': True,
                'result': result,
                'task_id': task_id,
                'duration': duration,
                'memory_delta_mb': memory_delta / 1024 / 1024,
                'context': context or {}
            }
            
        except asyncio.TimeoutError:
            error_msg = f"Operation timed out after {timeout or self.config.default_timeout}s"
            self._handle_operation_error(task_metrics, TimeoutError(error_msg), start_time)
            raise TimeoutError(error_msg)
            
        except Exception as error:
            self._handle_operation_error(task_metrics, error, start_time)
            raise error
            
        finally:
            # 작업 완료 후 정리
            with self.lock:
                if task_id in self.active_tasks:
                    completed_task = self.active_tasks.pop(task_id)
                    self.task_history.append(completed_task)
    
    def _handle_operation_error(self, task_metrics: TaskMetrics, error: Exception, start_time: float):
        """작업 에러 처리"""
        duration = time.time() - start_time
        task_metrics.fail(error)
        
        if self.metrics:
            self.metrics.increment_counter('operations_failed')
            self.metrics.record_metric('operation_duration', duration, {'status': 'failed'})
        
        self.logger.error(f"Operation failed after {duration:.2f}s: {str(error)}")
    
    async def process_files_in_batches(
        self,
        files: List[str],
        processor: Callable,
        batch_size: int = 10,
        max_concurrency: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> BatchResult:
        """파일을 배치로 처리"""
        start_time = time.time()
        initial_memory = psutil.Process().memory_info().rss
        concurrency = max_concurrency or self.config.max_concurrency
        
        # 배치로 분할
        batches = [files[i:i + batch_size] for i in range(0, len(files), batch_size)]
        
        success_count = 0
        error_count = 0
        results = []
        errors = []
        processed_files = 0
        
        # 세마포어로 동시성 제어
        semaphore = asyncio.Semaphore(concurrency)
        
        async def process_batch(batch: List[str]) -> List[Any]:
            async with semaphore:
                batch_results = []
                for file_path in batch:
                    try:
                        result = await self.safe_operation(processor, file_path)
                        batch_results.append(result['result'])
                    except Exception as error:
                        batch_results.append(None)
                        errors.append(error)
                        self.logger.error(f"Error processing {file_path}: {str(error)}")
                return batch_results
        
        # 진행률 콜백
        if progress_callback:
            progress_callback(0, len(files))
        
        # 모든 배치를 동시에 처리
        tasks = []
        for batch in batches:
            task = asyncio.create_task(process_batch(batch))
            tasks.append(task)
        
        # 배치별로 완료를 기다리며 진행률 업데이트
        for completed_task in asyncio.as_completed(tasks):
            batch_results = await completed_task
            
            for item in batch_results:
                if item is not None:
                    results.append(item)
                    success_count += 1
                else:
                    error_count += 1
                
                processed_files += 1
                
                # 진행률 업데이트
                if progress_callback:
                    progress_callback(processed_files, len(files))
        
        execution_time = time.time() - start_time
        final_memory = psutil.Process().memory_info().rss
        memory_usage_mb = (final_memory - initial_memory) / 1024 / 1024
        throughput = len(files) / execution_time if execution_time > 0 else 0
        
        # 메트릭 기록
        if self.metrics:
            self.metrics.record_metric('batch_processing_duration', execution_time)
            self.metrics.record_metric('batch_throughput', throughput)
            self.metrics.set_gauge('batch_success_rate', success_count / len(files) * 100)
        
        self.logger.info(
            f"Batch processing completed: {success_count} success, {error_count} errors "
            f"in {execution_time:.2f}s (throughput: {throughput:.2f} files/sec)"
        )
        
        return BatchResult(
            success_count=success_count,
            error_count=error_count,
            total_count=len(files),
            results=results,
            errors=errors,
            execution_time=execution_time,
            memory_usage_mb=memory_usage_mb,
            throughput=throughput
        )
    
    async def concurrent_map(
        self,
        func: Callable,
        items: List[Any],
        max_concurrency: Optional[int] = None,
        preserve_order: bool = True
    ) -> List[Any]:
        """동시 맵핑 처리"""
        concurrency = max_concurrency or self.config.max_concurrency
        semaphore = asyncio.Semaphore(concurrency)
        
        async def bounded_func(item, index=None):
            async with semaphore:
                result = await self.safe_operation(func, item)
                return (index, result['result']) if preserve_order and index is not None else result['result']
        
        if preserve_order:
            tasks = [bounded_func(item, i) for i, item in enumerate(items)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 순서 복원 및 예외 처리
            ordered_results = [None] * len(items)
            for result in results:
                if isinstance(result, Exception):
                    continue
                if isinstance(result, tuple):
                    index, value = result
                    ordered_results[index] = value
            
            return ordered_results
        else:
            tasks = [bounded_func(item) for item in items]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return [r for r in results if not isinstance(r, Exception)]
    
    async def retry_with_backoff(
        self,
        operation: Callable,
        max_retries: Optional[int] = None,
        initial_delay: float = 1.0,
        backoff_factor: Optional[float] = None,
        max_delay: float = 60.0,
        jitter: bool = True,
        *args,
        **kwargs
    ) -> Any:
        """지수 백오프와 지터를 사용한 재시도"""
        max_retries = max_retries or self.config.retry_attempts
        backoff_factor = backoff_factor or self.config.backoff_factor
        
        delay = initial_delay
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                result = await self.safe_operation(operation, *args, **kwargs)
                return result['result']
                
            except Exception as error:
                last_exception = error
                
                if attempt == max_retries:
                    break
                
                # 지터 추가 (랜덤성)
                actual_delay = delay
                if jitter:
                    actual_delay *= (0.5 + random.random() * 0.5)
                
                actual_delay = min(actual_delay, max_delay)
                
                self.logger.warning(
                    f"Attempt {attempt + 1}/{max_retries + 1} failed, "
                    f"retrying in {actual_delay:.2f}s: {str(error)}"
                )
                
                await asyncio.sleep(actual_delay)
                delay *= backoff_factor
        
        # 메트릭 기록
        if self.metrics:
            self.metrics.increment_counter('retry_exhausted')
        
        raise last_exception
    
    def throttle(self, calls_per_second: float, burst_size: Optional[int] = None):
        """호출 빈도 제한 데코레이터"""
        rate_limiter = RateLimiter(calls_per_second, burst_size)
        
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                await rate_limiter.wait_for_token()
                return await self.safe_operation(func, *args, **kwargs)
            return wrapper
        return decorator
    
    def debounce(self, delay: float):
        """디바운스 데코레이터"""
        timers = {}
        
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                key = f"{func.__name__}_{hash(args)}_{hash(tuple(sorted(kwargs.items())))}"
                
                # 기존 타이머 취소
                if key in timers:
                    timers[key].cancel()
                
                async def delayed_call():
                    await asyncio.sleep(delay)
                    try:
                        result = await self.safe_operation(func, *args, **kwargs)
                        return result['result']
                    finally:
                        timers.pop(key, None)
                
                timer = asyncio.create_task(delayed_call())
                timers[key] = timer
                return await timer
                
            return wrapper
        return decorator
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 정보 반환"""
        with self.lock:
            active_task_count = len(self.active_tasks)
            completed_task_count = len([t for t in self.task_history if t.state == TaskState.COMPLETED])
            failed_task_count = len([t for t in self.task_history if t.state == TaskState.FAILED])
            
            stats = {
                'active_tasks': active_task_count,
                'completed_tasks': completed_task_count,
                'failed_tasks': failed_task_count,
                'total_processed': completed_task_count + failed_task_count,
                'success_rate': (completed_task_count / (completed_task_count + failed_task_count) * 100) 
                               if (completed_task_count + failed_task_count) > 0 else 0.0,
                'config': self.config.__dict__ if hasattr(self.config, '__dict__') else str(self.config)
            }
            
            # Circuit breaker stats
            if self.circuit_breaker:
                stats['circuit_breaker'] = {
                    'state': self.circuit_breaker.state.name,
                    'failure_rate': self.circuit_breaker.failure_rate
                }
            
            # Bulkhead stats
            if self.bulkhead:
                stats['bulkhead'] = self.bulkhead.get_stats()
            
            # Metrics
            if self.metrics:
                stats['metrics'] = self.metrics.get_summary()
            
            return stats


# Enhanced Task Queue
class EnhancedTaskQueue:
    """향상된 비동기 작업 큐"""
    
    def __init__(self, max_workers: int = 5, name: str = "default"):
        self.max_workers = max_workers
        self.name = name
        self.queue = asyncio.PriorityQueue()
        self.workers = []
        self.running = False
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # Worker stats
        self.worker_stats = {}
        self.lock = threading.RLock()
        
        # Task tracking
        self.pending_tasks = 0
        self.completed_tasks = 0
        self.failed_tasks = 0
        
    async def start(self):
        """큐 시작"""
        if self.running:
            return
        
        self.running = True
        
        # 워커별 통계 초기화
        for i in range(self.max_workers):
            worker_id = f"{self.name}_worker_{i}"
            self.worker_stats[worker_id] = WorkerStats(worker_id)
        
        # 워커 시작
        self.workers = [
            asyncio.create_task(self._worker(f"{self.name}_worker_{i}"))
            for i in range(self.max_workers)
        ]
        
        self.logger.info(f"Started task queue '{self.name}' with {self.max_workers} workers")
    
    async def stop(self, timeout: float = 30.0):
        """큐 중지"""
        if not self.running:
            return
        
        self.running = False
        
        # 모든 워커에 중지 신호 전송
        for _ in self.workers:
            await self.queue.put((Priority.CRITICAL.value, None, None, None))
        
        # 워커들이 완료될 때까지 대기 (타임아웃 포함)
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.workers, return_exceptions=True),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            self.logger.warning(f"Some workers did not stop within {timeout}s, forcing shutdown")
            for worker in self.workers:
                if not worker.done():
                    worker.cancel()
        
        self.workers = []
        
        self.logger.info(f"Task queue '{self.name}' stopped")
    
    async def _worker(self, worker_id: str):
        """워커 함수"""
        stats = self.worker_stats[worker_id]
        
        while self.running:
            try:
                # 우선순위 큐에서 작업 가져오기 (타임아웃 포함)
                try:
                    priority, func, args_kwargs, future = await asyncio.wait_for(
                        self.queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue
                
                if func is None:  # 중지 신호
                    break
                
                args, kwargs = args_kwargs
                start_time = time.time()
                
                try:
                    if asyncio.iscoroutinefunction(func):
                        result = await func(*args, **kwargs)
                    else:
                        loop = asyncio.get_event_loop()
                        result = await loop.run_in_executor(None, func, *args, **kwargs)
                    
                    if not future.cancelled():
                        future.set_result(result)
                    
                    # 성공 통계 업데이트
                    duration = time.time() - start_time
                    stats.tasks_completed += 1
                    stats.total_duration += duration
                    stats.last_activity = time.time()
                    
                    with self.lock:
                        self.completed_tasks += 1
                
                except Exception as error:
                    if not future.cancelled():
                        future.set_exception(error)
                    
                    # 실패 통계 업데이트
                    stats.tasks_failed += 1
                    stats.last_activity = time.time()
                    
                    with self.lock:
                        self.failed_tasks += 1
                    
                    self.logger.error(f"Worker {worker_id} task failed: {str(error)}")
                
                finally:
                    self.queue.task_done()
                    with self.lock:
                        self.pending_tasks -= 1
                    
            except Exception as error:
                self.logger.error(f"Worker {worker_id} error: {str(error)}")
    
    async def submit(self, func: Callable, *args, priority: Priority = Priority.NORMAL, **kwargs) -> Any:
        """작업 제출"""
        if not self.running:
            await self.start()
        
        future = asyncio.Future()
        
        with self.lock:
            self.pending_tasks += 1
        
        await self.queue.put((priority.value, func, (args, kwargs), future))
        return await future
    
    async def submit_batch(self, tasks: List[tuple], priority: Priority = Priority.NORMAL) -> List[Any]:
        """배치 작업 제출"""
        futures = []
        
        for task in tasks:
            if len(task) == 1:
                func = task[0]
                args, kwargs = (), {}
            elif len(task) == 2:
                func, args = task
                kwargs = {}
            else:
                func, args, kwargs = task
            
            future = asyncio.Future()
            futures.append(future)
            
            with self.lock:
                self.pending_tasks += 1
            
            await self.queue.put((priority.value, func, (args, kwargs), future))
        
        # 모든 작업 완료 대기
        return await asyncio.gather(*futures, return_exceptions=True)
    
    def get_stats(self) -> Dict[str, Any]:
        """큐 통계"""
        with self.lock:
            total_processed = self.completed_tasks + self.failed_tasks
            
            return {
                'name': self.name,
                'max_workers': self.max_workers,
                'running': self.running,
                'pending_tasks': self.pending_tasks,
                'completed_tasks': self.completed_tasks,
                'failed_tasks': self.failed_tasks,
                'total_processed': total_processed,
                'success_rate': (self.completed_tasks / total_processed * 100) if total_processed > 0 else 0.0,
                'queue_size': self.queue.qsize(),
                'worker_stats': {worker_id: {
                    'tasks_completed': stats.tasks_completed,
                    'tasks_failed': stats.tasks_failed,
                    'success_rate': stats.success_rate,
                    'avg_duration': stats.avg_duration,
                    'last_activity': stats.last_activity
                } for worker_id, stats in self.worker_stats.items()}
            }


# Distributed Task Processing
class DistributedTaskProcessor:
    """분산 작업 처리기"""
    
    def __init__(self, redis_url: Optional[str] = None, namespace: str = "async_utils"):
        self.namespace = namespace
        self.redis_url = redis_url
        self.redis_client = None
        self.local_queue = EnhancedTaskQueue(name="distributed_local")
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # Redis 연결 시도
        if redis_url:
            self._init_redis()
    
    def _init_redis(self):
        """Redis 연결 초기화"""
        try:
            import redis.asyncio as redis
            self.redis_client = redis.from_url(self.redis_url)
            self.logger.info("Redis connection initialized")
        except ImportError:
            self.logger.warning("Redis not available, using local queue only")
        except Exception as e:
            self.logger.error(f"Failed to connect to Redis: {e}")
    
    async def submit_distributed(self, func: Callable, *args, 
                               ttl: int = 3600, 
                               priority: Priority = Priority.NORMAL,
                               **kwargs) -> str:
        """분산 작업 제출"""
        if not self.redis_client:
            # Redis 없으면 로컬 큐 사용
            result = await self.local_queue.submit(func, *args, priority=priority, **kwargs)
            return f"local_{hash(str(result))}"
        
        # 작업을 직렬화하여 Redis에 저장
        task_id = f"{self.namespace}:task:{int(time.time() * 1000)}:{random.randint(1000, 9999)}"
        
        task_data = {
            'func_name': func.__name__,
            'module': func.__module__,
            'args': args,
            'kwargs': kwargs,
            'priority': priority.value,
            'created_at': time.time(),
            'ttl': ttl
        }
        
        try:
            # Redis에 작업 저장
            await self.redis_client.hset(task_id, mapping={
                'data': json.dumps(task_data, default=str),
                'status': 'pending'
            })
            
            # TTL 설정
            await self.redis_client.expire(task_id, ttl)
            
            # 작업 큐에 추가
            queue_key = f"{self.namespace}:queue:{priority.name.lower()}"
            await self.redis_client.lpush(queue_key, task_id)
            
            self.logger.debug(f"Submitted distributed task: {task_id}")
            return task_id
            
        except Exception as e:
            self.logger.error(f"Failed to submit distributed task: {e}")
            # 폴백: 로컬 큐 사용
            result = await self.local_queue.submit(func, *args, priority=priority, **kwargs)
            return f"local_{hash(str(result))}"
    
    async def get_task_result(self, task_id: str, timeout: float = 30.0) -> Any:
        """작업 결과 조회"""
        if task_id.startswith("local_"):
            raise ValueError("Local task results are not retrievable")
        
        if not self.redis_client:
            raise RuntimeError("Redis not available")
        
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                task_data = await self.redis_client.hgetall(task_id)
                
                if not task_data:
                    raise ValueError(f"Task {task_id} not found")
                
                status = task_data.get('status', b'').decode()
                
                if status == 'completed':
                    result_data = task_data.get('result', b'').decode()
                    return json.loads(result_data)
                elif status == 'failed':
                    error_data = task_data.get('error', b'').decode()
                    raise Exception(f"Task failed: {error_data}")
                elif status == 'pending' or status == 'running':
                    await asyncio.sleep(0.5)
                    continue
                else:
                    raise ValueError(f"Unknown task status: {status}")
                    
            except Exception as e:
                if "not found" in str(e):
                    raise e
                self.logger.error(f"Error checking task result: {e}")
                await asyncio.sleep(1.0)
        
        raise asyncio.TimeoutError(f"Task {task_id} did not complete within {timeout}s")
    
    async def start_worker(self, worker_id: Optional[str] = None):
        """분산 워커 시작"""
        if not self.redis_client:
            self.logger.warning("Redis not available, starting local worker only")
            await self.local_queue.start()
            return
        
        worker_id = worker_id or f"worker_{int(time.time())}"
        self.logger.info(f"Starting distributed worker: {worker_id}")
        
        # 우선순위 큐들
        priority_queues = [
            f"{self.namespace}:queue:critical",
            f"{self.namespace}:queue:high", 
            f"{self.namespace}:queue:normal",
            f"{self.namespace}:queue:low"
        ]
        
        while True:
            try:
                # 우선순위 순서로 작업 확인
                task_id = None
                for queue_key in priority_queues:
                    result = await self.redis_client.brpop(queue_key, timeout=1)
                    if result:
                        _, task_id = result
                        task_id = task_id.decode()
                        break
                
                if not task_id:
                    continue
                
                # 작업 데이터 조회
                task_data = await self.redis_client.hgetall(task_id)
                if not task_data:
                    continue
                
                # 작업 상태를 running으로 변경
                await self.redis_client.hset(task_id, 'status', 'running')
                await self.redis_client.hset(task_id, 'worker_id', worker_id)
                
                # 작업 실행
                try:
                    data = json.loads(task_data['data'].decode())
                    
                    # 함수 동적 로딩 (보안상 주의 필요)
                    module = __import__(data['module'])
                    func = getattr(module, data['func_name'])
                    
                    start_time = time.time()
                    
                    if asyncio.iscoroutinefunction(func):
                        result = await func(*data['args'], **data['kwargs'])
                    else:
                        loop = asyncio.get_event_loop()
                        result = await loop.run_in_executor(None, func, *data['args'], **data['kwargs'])
                    
                    duration = time.time() - start_time
                    
                    # 결과 저장
                    await self.redis_client.hset(task_id, mapping={
                        'status': 'completed',
                        'result': json.dumps(result, default=str),
                        'completed_at': time.time(),
                        'duration': duration
                    })
                    
                    self.logger.debug(f"Completed task {task_id} in {duration:.2f}s")
                    
                except Exception as e:
                    # 오류 저장
                    await self.redis_client.hset(task_id, mapping={
                        'status': 'failed',
                        'error': str(e),
                        'failed_at': time.time()
                    })
                    
                    self.logger.error(f"Task {task_id} failed: {str(e)}")
                
            except Exception as e:
                self.logger.error(f"Worker {worker_id} error: {str(e)}")
                await asyncio.sleep(1.0)


# Load Balancer
class LoadBalancer:
    """로드 밸런서"""
    
    def __init__(self, backends: List[str], strategy: str = "round_robin"):
        self.backends = backends
        self.strategy = strategy
        self.current_index = 0
        self.backend_stats = {backend: {'requests': 0, 'failures': 0, 'avg_response_time': 0.0} 
                             for backend in backends}
        self.lock = threading.Lock()
    
    def get_backend(self) -> str:
        """백엔드 선택"""
        if self.strategy == "round_robin":
            return self._round_robin()
        elif self.strategy == "least_connections":
            return self._least_connections()
        elif self.strategy == "weighted_response_time":
            return self._weighted_response_time()
        else:
            return self._round_robin()
    
    def _round_robin(self) -> str:
        """라운드 로빈 선택"""
        with self.lock:
            backend = self.backends[self.current_index]
            self.current_index = (self.current_index + 1) % len(self.backends)
            return backend
    
    def _least_connections(self) -> str:
        """최소 연결 선택"""
        with self.lock:
            return min(self.backends, key=lambda b: self.backend_stats[b]['requests'])
    
    def _weighted_response_time(self) -> str:
        """가중 응답 시간 기반 선택"""
        with self.lock:
            # 응답 시간이 빠른 백엔드를 우선 선택
            return min(self.backends, key=lambda b: self.backend_stats[b]['avg_response_time'])
    
    def record_request(self, backend: str, response_time: float, success: bool):
        """요청 기록"""
        with self.lock:
            stats = self.backend_stats[backend]
            stats['requests'] += 1
            
            if not success:
                stats['failures'] += 1
            
            # 평균 응답 시간 업데이트 (지수 이동 평균)
            alpha = 0.1
            stats['avg_response_time'] = (alpha * response_time + 
                                        (1 - alpha) * stats['avg_response_time'])
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 반환"""
        with self.lock:
            return {
                'strategy': self.strategy,
                'backends': self.backends,
                'backend_stats': dict(self.backend_stats)
            }


# Health Check
class HealthChecker:
    """헬스 체크"""
    
    def __init__(self, check_interval: float = 30.0):
        self.check_interval = check_interval
        self.health_checks = {}
        self.running = False
        self.task = None
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def register_check(self, name: str, check_func: Callable[[], Awaitable[bool]], 
                      timeout: float = 5.0):
        """헬스 체크 등록"""
        self.health_checks[name] = {
            'func': check_func,
            'timeout': timeout,
            'last_check': 0,
            'status': 'unknown',
            'error': None
        }
    
    async def start(self):
        """헬스 체크 시작"""
        if self.running:
            return
        
        self.running = True
        self.task = asyncio.create_task(self._check_loop())
        self.logger.info("Health checker started")
    
    async def stop(self):
        """헬스 체크 중지"""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Health checker stopped")
    
    async def _check_loop(self):
        """헬스 체크 루프"""
        while self.running:
            try:
                await self._perform_checks()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Health check loop error: {e}")
                await asyncio.sleep(self.check_interval)
    
    async def _perform_checks(self):
        """헬스 체크 수행"""
        tasks = []
        
        for name, check_info in self.health_checks.items():
            task = asyncio.create_task(self._single_check(name, check_info))
            tasks.append(task)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _single_check(self, name: str, check_info: Dict):
        """개별 헬스 체크"""
        try:
            check_func = check_info['func']
            timeout = check_info['timeout']
            
            start_time = time.time()
            
            result = await asyncio.wait_for(check_func(), timeout=timeout)
            
            check_info['last_check'] = time.time()
            check_info['status'] = 'healthy' if result else 'unhealthy'
            check_info['error'] = None
            check_info['response_time'] = time.time() - start_time
            
        except asyncio.TimeoutError:
            check_info['last_check'] = time.time()
            check_info['status'] = 'timeout'
            check_info['error'] = f"Check timed out after {check_info['timeout']}s"
            
        except Exception as e:
            check_info['last_check'] = time.time()
            check_info['status'] = 'error'
            check_info['error'] = str(e)
    
    def get_health_status(self) -> Dict[str, Any]:
        """헬스 상태 반환"""
        overall_healthy = all(
            check['status'] == 'healthy' 
            for check in self.health_checks.values()
        )
        
        return {
            'overall_status': 'healthy' if overall_healthy else 'unhealthy',
            'checks': dict(self.health_checks),
            'last_updated': time.time()
        }


# 전역 인스턴스들
_default_async_utils = None
_default_task_queue = None
_default_distributed_processor = None

def get_async_utils(config: Optional[AsyncConfig] = None) -> EnhancedAsyncUtils:
    """기본 EnhancedAsyncUtils 인스턴스 반환"""
    global _default_async_utils
    if _default_async_utils is None:
        _default_async_utils = EnhancedAsyncUtils(config)
    return _default_async_utils

def get_task_queue(max_workers: int = 5, name: str = "default") -> EnhancedTaskQueue:
    """기본 EnhancedTaskQueue 인스턴스 반환"""
    global _default_task_queue
    if _default_task_queue is None:
        _default_task_queue = EnhancedTaskQueue(max_workers, name)
    return _default_task_queue

def get_distributed_processor(redis_url: Optional[str] = None, 
                            namespace: str = "async_utils") -> DistributedTaskProcessor:
    """기본 DistributedTaskProcessor 인스턴스 반환"""
    global _default_distributed_processor
    if _default_distributed_processor is None:
        _default_distributed_processor = DistributedTaskProcessor(redis_url, namespace)
    return _default_distributed_processor


# 편의 함수들
async def safe_operation(operation: Callable, *args, **kwargs) -> Dict[str, Any]:
    """안전한 작업 실행 편의 함수"""
    return await get_async_utils().safe_operation(operation, *args, **kwargs)

async def process_files_in_batches(
    files: List[str],
    processor: Callable,
    batch_size: int = 10,
    max_concurrency: int = 5,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> BatchResult:
    """파일 배치 처리 편의 함수"""
    return await get_async_utils().process_files_in_batches(
        files, processor, batch_size, max_concurrency, progress_callback
    )

async def concurrent_map(
    func: Callable,
    items: List[Any],
    max_concurrency: int = 5,
    preserve_order: bool = True
) -> List[Any]:
    """동시 맵핑 편의 함수"""
    return await get_async_utils().concurrent_map(func, items, max_concurrency, preserve_order)

async def retry_with_backoff(
    operation: Callable,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    *args,
    **kwargs
) -> Any:
    """재시도 편의 함수"""
    return await get_async_utils().retry_with_backoff(
        operation, max_retries, initial_delay, backoff_factor, *args, **kwargs
    )

def throttle(calls_per_second: float, burst_size: Optional[int] = None):
    """스로틀 데코레이터 편의 함수"""
    return get_async_utils().throttle(calls_per_second, burst_size)

def debounce(delay: float):
    """디바운스 데코레이터 편의 함수"""
    return get_async_utils().debounce(delay)

async def submit_task(func: Callable, *args, priority: Priority = Priority.NORMAL, **kwargs) -> Any:
    """작업 제출 편의 함수"""
    return await get_task_queue().submit(func, *args, priority=priority, **kwargs)

async def submit_distributed_task(func: Callable, *args, 
                                 redis_url: Optional[str] = None,
                                 priority: Priority = Priority.NORMAL,
                                 **kwargs) -> str:
    """분산 작업 제출 편의 함수"""
    processor = get_distributed_processor(redis_url)
    return await processor.submit_distributed(func, *args, priority=priority, **kwargs)

# 설정 헬퍼
def create_async_config(**kwargs) -> AsyncConfig:
    """비동기 설정 생성 헬퍼"""
    return AsyncConfig(**kwargs)

# 컨텍스트 매니저들
@asynccontextmanager
async def managed_task_queue(max_workers: int = 5, name: str = "managed"):
    """관리되는 작업 큐 컨텍스트 매니저"""
    queue = EnhancedTaskQueue(max_workers, name)
    try:
        await queue.start()
        yield queue
    finally:
        await queue.stop()

@asynccontextmanager
async def managed_health_checker(check_interval: float = 30.0):
    """관리되는 헬스 체커 컨텍스트 매니저"""
    checker = HealthChecker(check_interval)
    try:
        await checker.start()
        yield checker
    finally:
        await checker.stop()

# 고성능 배치 처리
async def high_performance_batch_process(
    items: List[Any],
    processor: Callable,
    batch_size: int = 100,
    max_concurrency: int = 20,
    memory_limit_mb: int = 1000,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> List[Any]:
    """고성능 배치 처리"""
    
    async_utils = get_async_utils(create_async_config(
        max_concurrency=max_concurrency,
        enable_metrics=True,
        enable_circuit_breaker=True
    ))
    
    # 메모리 모니터링
    process = psutil.Process()
    initial_memory = process.memory_info().rss / 1024 / 1024
    
    results = []
    processed = 0
    
    # 배치 단위로 처리
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        
        # 메모리 체크
        current_memory = process.memory_info().rss / 1024 / 1024
        if current_memory - initial_memory > memory_limit_mb:
            # 가비지 컬렉션 강제 실행
            import gc
            gc.collect()
            
            # 동시성 줄이기
            max_concurrency = max(1, max_concurrency // 2)
            async_utils.config.max_concurrency = max_concurrency
        
        # 배치 처리
        batch_results = await async_utils.concurrent_map(
            processor, batch, max_concurrency, preserve_order=True
        )
        
        results.extend(batch_results)
        processed += len(batch)
        
        # 진행률 업데이트
        if progress_callback:
            progress_callback(processed, len(items))
    
    return results


# 성능 프로파일러
class AsyncProfiler:
    """비동기 성능 프로파일러"""
    
    def __init__(self):
        self.profiles = {}
        self.active_profiles = {}
        self.lock = threading.Lock()
    
    def start_profile(self, name: str) -> str:
        """프로파일링 시작"""
        profile_id = f"{name}_{int(time.time() * 1000)}"
        
        with self.lock:
            self.active_profiles[profile_id] = {
                'name': name,
                'start_time': time.time(),
                'start_memory': psutil.Process().memory_info().rss,
                'cpu_start': psutil.Process().cpu_percent()
            }
        
        return profile_id
    
    def end_profile(self, profile_id: str) -> Dict[str, Any]:
        """프로파일링 종료"""
        with self.lock:
            if profile_id not in self.active_profiles:
                return {}
            
            profile = self.active_profiles.pop(profile_id)
            
            end_time = time.time()
            end_memory = psutil.Process().memory_info().rss
            cpu_end = psutil.Process().cpu_percent()
            
            result = {
                'name': profile['name'],
                'duration': end_time - profile['start_time'],
                'memory_delta_mb': (end_memory - profile['start_memory']) / 1024 / 1024,
                'cpu_usage_delta': cpu_end - profile['cpu_start'],
                'start_time': profile['start_time'],
                'end_time': end_time
            }
            
            # 프로파일 저장
            name = profile['name']
            if name not in self.profiles:
                self.profiles[name] = []
            
            self.profiles[name].append(result)
            
            return result
    
    def get_profile_summary(self, name: str) -> Dict[str, Any]:
        """프로파일 요약"""
        with self.lock:
            if name not in self.profiles:
                return {}
            
            profiles = self.profiles[name]
            if not profiles:
                return {}
            
            durations = [p['duration'] for p in profiles]
            memory_deltas = [p['memory_delta_mb'] for p in profiles]
            
            return {
                'name': name,
                'count': len(profiles),
                'avg_duration': sum(durations) / len(durations),
                'min_duration': min(durations),
                'max_duration': max(durations),
                'avg_memory_delta_mb': sum(memory_deltas) / len(memory_deltas),
                'total_duration': sum(durations)
            }


# 프로파일링 데코레이터
def profile_async(name: str):
    """비동기 함수 프로파일링 데코레이터"""
    profiler = AsyncProfiler()
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            profile_id = profiler.start_profile(name)
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                profile_result = profiler.end_profile(profile_id)
                logging.getLogger(__name__).debug(
                    f"Profile {name}: {profile_result['duration']:.3f}s, "
                    f"Memory: {profile_result['memory_delta_mb']:.2f}MB"
                )
        return wrapper
    return decorator


# 이벤트 기반 처리
class EventBus:
    """이벤트 버스"""
    
    def __init__(self):
        self.subscribers = defaultdict(list)
        self.lock = threading.RLock()
        self.event_history = deque(maxlen=1000)
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def subscribe(self, event_type: str, handler: Callable, priority: int = 0):
        """이벤트 구독"""
        with self.lock:
            self.subscribers[event_type].append({
                'handler': handler,
                'priority': priority
            })
            # 우선순위 정렬
            self.subscribers[event_type].sort(key=lambda x: x['priority'], reverse=True)
    
    def unsubscribe(self, event_type: str, handler: Callable):
        """이벤트 구독 해제"""
        with self.lock:
            self.subscribers[event_type] = [
                sub for sub in self.subscribers[event_type]
                if sub['handler'] != handler
            ]
    
    async def emit(self, event_type: str, data: Any = None, wait_for_all: bool = True):
        """이벤트 발생"""
        event = {
            'type': event_type,
            'data': data,
            'timestamp': time.time(),
            'id': f"{event_type}_{int(time.time() * 1000)}"
        }
        
        with self.lock:
            self.event_history.append(event)
            handlers = self.subscribers.get(event_type, [])
        
        if not handlers:
            return
        
        self.logger.debug(f"Emitting event {event_type} to {len(handlers)} handlers")
        
        # 핸들러 실행
        tasks = []
        for subscriber in handlers:
            handler = subscriber['handler']
            
            if asyncio.iscoroutinefunction(handler):
                task = asyncio.create_task(handler(event))
            else:
                # 동기 함수를 비동기로 실행
                loop = asyncio.get_event_loop()
                task = asyncio.create_task(
                    loop.run_in_executor(None, handler, event)
                )
            
            tasks.append(task)
        
        if wait_for_all:
            # 모든 핸들러 완료 대기
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 에러 로깅
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    handler_name = handlers[i]['handler'].__name__
                    self.logger.error(f"Handler {handler_name} failed for event {event_type}: {result}")
        else:
            # 백그라운드에서 실행
            for task in tasks:
                asyncio.create_task(task)
    
    def get_event_history(self, event_type: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """이벤트 히스토리 조회"""
        with self.lock:
            if event_type:
                events = [e for e in self.event_history if e['type'] == event_type]
            else:
                events = list(self.event_history)
            
            return events[-limit:] if limit else events


# 워크플로우 엔진
class WorkflowEngine:
    """워크플로우 실행 엔진"""
    
    def __init__(self, async_utils: Optional[EnhancedAsyncUtils] = None):
        self.async_utils = async_utils or get_async_utils()
        self.event_bus = EventBus()
        self.workflows = {}
        self.executions = {}
        self.lock = threading.RLock()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def register_workflow(self, name: str, steps: List[Dict[str, Any]]):
        """워크플로우 등록"""
        workflow = {
            'name': name,
            'steps': steps,
            'created_at': time.time()
        }
        
        with self.lock:
            self.workflows[name] = workflow
        
        self.logger.info(f"Registered workflow: {name} with {len(steps)} steps")
    
    async def execute_workflow(self, workflow_name: str, 
                             initial_data: Any = None,
                             execution_id: Optional[str] = None) -> Dict[str, Any]:
        """워크플로우 실행"""
        if workflow_name not in self.workflows:
            raise ValueError(f"Workflow {workflow_name} not found")
        
        execution_id = execution_id or f"{workflow_name}_{int(time.time() * 1000)}"
        workflow = self.workflows[workflow_name]
        
        execution = {
            'id': execution_id,
            'workflow_name': workflow_name,
            'status': 'running',
            'start_time': time.time(),
            'end_time': None,
            'current_step': 0,
            'steps_completed': 0,
            'steps_failed': 0,
            'data': initial_data,
            'step_results': [],
            'error': None
        }
        
        with self.lock:
            self.executions[execution_id] = execution
        
        # 실행 시작 이벤트
        await self.event_bus.emit('workflow.started', {
            'execution_id': execution_id,
            'workflow_name': workflow_name
        })
        
        try:
            for i, step in enumerate(workflow['steps']):
                execution['current_step'] = i
                
                # 스텝 시작 이벤트
                await self.event_bus.emit('workflow.step_started', {
                    'execution_id': execution_id,
                    'step_index': i,
                    'step': step
                })
                
                try:
                    result = await self._execute_step(step, execution['data'])
                    
                    execution['steps_completed'] += 1
                    execution['step_results'].append({
                        'step_index': i,
                        'step_name': step.get('name', f'step_{i}'),
                        'result': result,
                        'status': 'completed',
                        'duration': 0  # 실제로는 측정
                    })
                    
                    # 다음 스텝으로 데이터 전달
                    if step.get('pass_result', True):
                        execution['data'] = result
                    
                    # 스텝 완료 이벤트
                    await self.event_bus.emit('workflow.step_completed', {
                        'execution_id': execution_id,
                        'step_index': i,
                        'result': result
                    })
                    
                except Exception as e:
                    execution['steps_failed'] += 1
                    execution['step_results'].append({
                        'step_index': i,
                        'step_name': step.get('name', f'step_{i}'),
                        'result': None,
                        'status': 'failed',
                        'error': str(e)
                    })
                    
                    # 스텝 실패 이벤트
                    await self.event_bus.emit('workflow.step_failed', {
                        'execution_id': execution_id,
                        'step_index': i,
                        'error': str(e)
                    })
                    
                    # 실패 시 중단 여부 확인
                    if step.get('continue_on_error', False):
                        continue
                    else:
                        raise e
            
            # 성공 완료
            execution['status'] = 'completed'
            execution['end_time'] = time.time()
            
            await self.event_bus.emit('workflow.completed', {
                'execution_id': execution_id,
                'result': execution['data']
            })
            
            return execution
            
        except Exception as e:
            # 실패 완료
            execution['status'] = 'failed'
            execution['end_time'] = time.time()
            execution['error'] = str(e)
            
            await self.event_bus.emit('workflow.failed', {
                'execution_id': execution_id,
                'error': str(e)
            })
            
            raise e
    
    async def _execute_step(self, step: Dict[str, Any], data: Any) -> Any:
        """개별 스텝 실행"""
        step_type = step.get('type', 'function')
        
        if step_type == 'function':
            func = step['function']
            args = step.get('args', [])
            kwargs = step.get('kwargs', {})
            
            # 데이터를 첫 번째 인수로 전달
            if step.get('pass_data', True):
                args = [data] + args
            
            return await self.async_utils.safe_operation(func, *args, **kwargs)
        
        elif step_type == 'parallel':
            # 병렬 실행
            substeps = step['steps']
            tasks = []
            
            for substep in substeps:
                task = asyncio.create_task(self._execute_step(substep, data))
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return results
        
        elif step_type == 'condition':
            # 조건부 실행
            condition_func = step['condition']
            
            if await self.async_utils.safe_operation(condition_func, data):
                return await self._execute_step(step['if_true'], data)
            elif 'if_false' in step:
                return await self._execute_step(step['if_false'], data)
            else:
                return data
        
        else:
            raise ValueError(f"Unknown step type: {step_type}")
    
    def get_execution_status(self, execution_id: str) -> Optional[Dict[str, Any]]:
        """실행 상태 조회"""
        with self.lock:
            return self.executions.get(execution_id)
    
    def list_executions(self, workflow_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """실행 목록 조회"""
        with self.lock:
            executions = list(self.executions.values())
            
            if workflow_name:
                executions = [e for e in executions if e['workflow_name'] == workflow_name]
            
            return sorted(executions, key=lambda x: x['start_time'], reverse=True)


# 모니터링 대시보드 데이터
class MonitoringCollector:
    """모니터링 데이터 수집기"""
    
    def __init__(self, async_utils: Optional[EnhancedAsyncUtils] = None):
        self.async_utils = async_utils or get_async_utils()
        self.start_time = time.time()
        self.system_metrics_history = deque(maxlen=1000)
        self.collecting = False
        self.collection_task = None
        
    async def start_collection(self, interval: float = 5.0):
        """메트릭 수집 시작"""
        if self.collecting:
            return
        
        self.collecting = True
        self.collection_task = asyncio.create_task(self._collection_loop(interval))
    
    async def stop_collection(self):
        """메트릭 수집 중지"""
        if not self.collecting:
            return
        
        self.collecting = False
        if self.collection_task:
            self.collection_task.cancel()
            try:
                await self.collection_task
            except asyncio.CancelledError:
                pass
    
    async def _collection_loop(self, interval: float):
        """메트릭 수집 루프"""
        while self.collecting:
            try:
                metrics = self._collect_system_metrics()
                self.system_metrics_history.append(metrics)
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logging.getLogger(__name__).error(f"Metrics collection error: {e}")
                await asyncio.sleep(interval)
    
    def _collect_system_metrics(self) -> Dict[str, Any]:
        """시스템 메트릭 수집"""
        process = psutil.Process()
        
        return {
            'timestamp': time.time(),
            'cpu_percent': process.cpu_percent(),
            'memory_mb': process.memory_info().rss / 1024 / 1024,
            'memory_percent': process.memory_percent(),
            'num_threads': process.num_threads(),
            'num_fds': process.num_fds() if hasattr(process, 'num_fds') else 0,
            'uptime': time.time() - self.start_time
        }
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """대시보드 데이터 반환"""
        # 시스템 메트릭
        current_metrics = self._collect_system_metrics()
        
        # 비동기 유틸리티 통계
        async_stats = self.async_utils.get_stats()
        
        # 최근 시스템 메트릭 히스토리
        recent_metrics = list(self.system_metrics_history)[-100:]  # 최근 100개
        
        return {
            'current_metrics': current_metrics,
            'async_stats': async_stats,
            'metrics_history': recent_metrics,
            'summary': {
                'uptime_hours': current_metrics['uptime'] / 3600,
                'avg_cpu_percent': sum(m['cpu_percent'] for m in recent_metrics) / len(recent_metrics) if recent_metrics else 0,
                'avg_memory_mb': sum(m['memory_mb'] for m in recent_metrics) / len(recent_metrics) if recent_metrics else 0,
                'peak_memory_mb': max(m['memory_mb'] for m in recent_metrics) if recent_metrics else 0
            }
        }


# 설정 기반 초기화 헬퍼
def initialize_async_system(config_dict: Dict[str, Any]) -> Dict[str, Any]:
    """설정 기반 비동기 시스템 초기화"""
    
    # 비동기 유틸리티 설정
    async_config = AsyncConfig(**config_dict.get('async', {}))
    async_utils = EnhancedAsyncUtils(async_config)
    
    # 작업 큐 설정
    queue_config = config_dict.get('queue', {})
    task_queue = EnhancedTaskQueue(
        max_workers=queue_config.get('max_workers', 5),
        name=queue_config.get('name', 'main')
    )
    
    # 분산 처리기 설정 (Redis URL이 있는 경우)
    distributed_processor = None
    if 'redis_url' in config_dict:
        distributed_processor = DistributedTaskProcessor(
            redis_url=config_dict['redis_url'],
            namespace=config_dict.get('namespace', 'async_utils')
        )
    
    # 헬스 체커 설정
    health_checker = None
    if config_dict.get('enable_health_check', False):
        health_checker = HealthChecker(
            check_interval=config_dict.get('health_check_interval', 30.0)
        )
    
    # 모니터링 설정
    monitoring_collector = None
    if config_dict.get('enable_monitoring', False):
        monitoring_collector = MonitoringCollector(async_utils)
    
    return {
        'async_utils': async_utils,
        'task_queue': task_queue,
        'distributed_processor': distributed_processor,
        'health_checker': health_checker,
        'monitoring_collector': monitoring_collector,
        'config': async_config
    }


# 고급 패턴들
class SagaPattern:
    """사가 패턴 (분산 트랜잭션)"""
    
    def __init__(self, async_utils: Optional[EnhancedAsyncUtils] = None):
        self.async_utils = async_utils or get_async_utils()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    async def execute_saga(self, steps: List[Dict[str, Any]], 
                          initial_data: Any = None) -> Dict[str, Any]:
        """사가 실행"""
        completed_steps = []
        current_data = initial_data
        
        try:
            # Forward execution
            for i, step in enumerate(steps):
                action = step['action']
                
                result = await self.async_utils.safe_operation(action, current_data)
                
                completed_steps.append({
                    'step_index': i,
                    'action': action,
                    'compensation': step.get('compensation'),
                    'result': result['result'],
                    'data_before': current_data
                })
                
                current_data = result['result']
            
            return {
                'success': True,
                'result': current_data,
                'completed_steps': completed_steps
            }
            
        except Exception as e:
            self.logger.error(f"Saga failed at step {len(completed_steps)}: {e}")
            
            # Compensation (rollback)
            await self._compensate(completed_steps)
            
            return {
                'success': False,
                'error': str(e),
                'completed_steps': completed_steps
            }
    
    async def _compensate(self, completed_steps: List[Dict[str, Any]]):
        """보상 트랜잭션 실행"""
        # 역순으로 보상 실행
        for step in reversed(completed_steps):
            compensation = step.get('compensation')
            if compensation:
                try:
                    await self.async_utils.safe_operation(
                        compensation, 
                        step['data_before'], 
                        step['result']
                    )
                    self.logger.info(f"Compensated step {step['step_index']}")
                except Exception as e:
                    self.logger.error(f"Compensation failed for step {step['step_index']}: {e}")


# 캐시 통합 비동기 유틸리티
class CachedAsyncUtils(EnhancedAsyncUtils):
    """캐시 통합 비동기 유틸리티"""
    
    def __init__(self, config: Optional[AsyncConfig] = None, cache=None):
        super().__init__(config)
        self.cache = cache
    
    async def cached_operation(self, operation: Callable, *args, 
                             cache_key: Optional[str] = None,
                             ttl: int = 3600,
                             **kwargs) -> Dict[str, Any]:
        """캐시된 작업 실행"""
        if not self.cache:
            return await self.safe_operation(operation, *args, **kwargs)
        
        # 캐시 키 생성
        if cache_key is None:
            cache_key = f"{operation.__name__}:{hash((args, tuple(sorted(kwargs.items()))))}"
        
        # 캐시에서 확인
        cached_result = self.cache.get(cache_key)
        if cached_result is not None:
            return {
                'success': True,
                'result': cached_result,
                'from_cache': True,
                'cache_key': cache_key
            }
        
        # 캐시 미스 시 실행
        result = await self.safe_operation(operation, *args, **kwargs)
        
        if result['success']:
            # 결과 캐싱
            self.cache.set(cache_key, result['result'])
        
        result['from_cache'] = False
        result['cache_key'] = cache_key
        
        return result


# 최종 통합 클래스
class AsyncUtilsManager:
    """비동기 유틸리티 통합 관리자"""
    
    def __init__(self, config_file: Optional[str] = None, config_dict: Optional[Dict] = None):
        # 설정 로드
        if config_file:
            with open(config_file, 'r') as f:
                import yaml
                config = yaml.safe_load(f)
        elif config_dict:
            config = config_dict
        else:
            config = {}
        
        # 시스템 초기화
        self.components = initialize_async_system(config)
        self.config = config
        self.started = False
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    async def start(self):
        """모든 컴포넌트 시작"""
        if self.started:
            return
        
        try:
            # 작업 큐 시작
            await self.components['task_queue'].start()
            
            # 헬스 체커 시작
            if self.components['health_checker']:
                await self.components['health_checker'].start()
            
            # 모니터링 시작
            if self.components['monitoring_collector']:
                await self.components['monitoring_collector'].start_collection(
                    interval=self.config.get('monitoring_interval', 5.0)
                )
            
            self.started = True
            self.logger.info("AsyncUtilsManager started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start AsyncUtilsManager: {e}")
            raise
    
    async def stop(self):
        """모든 컴포넌트 중지"""
        if not self.started:
            return
        
        try:
            # 모니터링 중지
            if self.components['monitoring_collector']:
                await self.components['monitoring_collector'].stop_collection()
            
            # 헬스 체커 중지
            if self.components['health_checker']:
                await self.components['health_checker'].stop()
            
            # 작업 큐 중지
            await self.components['task_queue'].stop()
            
            self.started = False
            self.logger.info("AsyncUtilsManager stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping AsyncUtilsManager: {e}")
    
    def get_component(self, name: str):
        """컴포넌트 반환"""
        return self.components.get(name)
    
    def get_stats(self) -> Dict[str, Any]:
        """전체 시스템 통계"""
        stats = {
            'started': self.started,
            'config': self.config
        }
        
        for name, component in self.components.items():
            if component and hasattr(component, 'get_stats'):
                stats[name] = component.get_stats()
        
        # 모니터링 데이터
        if self.components['monitoring_collector']:
            stats['monitoring'] = self.components['monitoring_collector'].get_dashboard_data()
        
        return stats
    
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        await self.stop()


# 최종 편의 함수
async def create_async_manager(config: Optional[Dict] = None) -> AsyncUtilsManager:
    """비동기 매니저 생성 및 시작"""
    manager = AsyncUtilsManager(config_dict=config)
    await manager.start()
    return manager


# 예제 사용법
async def example_usage():
    """사용 예제"""
    
    # 1. 기본 사용법
    async_utils = get_async_utils()
    
    async def sample_task(data):
        await asyncio.sleep(0.1)
        return f"Processed: {data}"
    
    # 안전한 작업 실행
    result = await async_utils.safe_operation(sample_task, "test data")
    print(f"Result: {result}")
    
    # 2. 배치 처리
    files = [f"file_{i}.txt" for i in range(100)]
    
    async def process_file(filename):
        await asyncio.sleep(0.01)  # 파일 처리 시뮬레이션
        return f"processed_{filename}"
    
    batch_result = await async_utils.process_files_in_batches(
        files, process_file, batch_size=10, max_concurrency=5
    )
    
    print(f"Batch processing: {batch_result.success_count} successes, "
          f"{batch_result.error_count} errors")
    
    # 3. 통합 관리자 사용
    config = {
        'async': {
            'max_concurrency': 10,
            'enable_circuit_breaker': True,
            'enable_metrics': True
        },
        'queue': {
            'max_workers': 5
        },
        'enable_monitoring': True,
        'monitoring_interval': 5.0
    }
    
    async with AsyncUtilsManager(config_dict=config) as manager:
        # 작업 제출
        task_queue = manager.get_component('task_queue')
        result = await task_queue.submit(sample_task, "managed task")
        
        # 통계 확인
        stats = manager.get_stats()
        print(f"System stats: {stats}")


if __name__ == "__main__":
    asyncio.run(example_usage())