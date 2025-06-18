#!/usr/bin/env python3
"""
Enhanced Collection Utilities - Unified Version
리스트, 딕셔너리, 집합 등 컬렉션 관련 고도화된 유틸리티 함수들 (통합 버전)

주요 개선사항:
- 함수형 프로그래밍 패턴 지원
- 성능 최적화 (병렬 처리, 메모리 효율성)
- 타입 안전성 강화
- 고급 컬렉션 조작 기능
- 지연 평가 (Lazy evaluation) 지원
- 스트리밍 데이터 처리
- 통계 및 분석 기능
- 검증 및 에러 처리 개선
- 캐싱 및 지속성 관리
- 메모리 최적화 도구
- 고성능 병렬 연산

통합된 기능:
- 두 버전의 모든 유틸리티 함수
- 고급 분석 및 캐싱 시스템
- 메모리 효율적인 컬렉션 구현
- 함수형 프로그래밍 도구
- 성능 벤치마킹 및 최적화
"""

import asyncio
import itertools
import operator
import statistics
import random
import gzip
import tempfile
from collections import (
    defaultdict, deque, Counter, OrderedDict, 
    ChainMap, UserDict, UserList
)
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import reduce, partial, wraps, lru_cache
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Iterator, 
    Callable, TypeVar, Generic, Iterable, Mapping, Sequence,
    Protocol, runtime_checkable, overload
)
import heapq
import bisect
import operator
from dataclasses import dataclass, field
from enum import Enum
import logging
import time
import json
from pathlib import Path
import pickle
import threading
from contextlib import contextmanager
import weakref
import copy

# 타입 변수 정의
T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')
R = TypeVar('R')

# 로깅 설정
logger = logging.getLogger(__name__)


# 커스텀 예외 클래스들
class CollectionError(Exception):
    """컬렉션 관련 기본 예외"""
    pass


class EmptyCollectionError(CollectionError):
    """빈 컬렉션 오류"""
    pass


class InvalidOperationError(CollectionError):
    """잘못된 연산 오류"""
    pass


class IndexOutOfRangeError(CollectionError):
    """인덱스 범위 초과 오류"""
    pass


# 프로토콜 정의
@runtime_checkable
class Comparable(Protocol):
    def __lt__(self, other: Any) -> bool: ...


@runtime_checkable
class Hashable(Protocol):
    def __hash__(self) -> int: ...


# 열거형 정의
class SortOrder(Enum):
    ASC = "ascending"
    DESC = "descending"


class MergeStrategy(Enum):
    OVERWRITE = "overwrite"
    KEEP_FIRST = "keep_first"
    MERGE_VALUES = "merge_values"
    CUSTOM = "custom"


# 데이터 클래스들
@dataclass
class CollectionStats:
    """컬렉션 통계 정보"""
    size: int
    memory_usage: int
    operation_count: int = 0
    last_accessed: Optional[float] = None
    
    def __post_init__(self):
        if self.last_accessed is None:
            self.last_accessed = time.time()


@dataclass
class ChunkResult(Generic[T]):
    """청크 처리 결과"""
    chunk: List[T]
    index: int
    size: int
    processing_time: float
    success: bool
    error: Optional[str] = None


@dataclass
class GroupByResult(Generic[K, V]):
    """그룹화 결과"""
    groups: Dict[K, List[V]]
    group_count: int
    total_items: int
    key_function: Optional[Callable] = None


# 성능 측정 데코레이터
def measure_performance(func):
    """성능 측정 데코레이터"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            logger.debug(f"{func.__name__} executed in {execution_time:.4f}s")
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"{func.__name__} failed after {execution_time:.4f}s: {e}")
            raise
    return wrapper


class LazyList(Generic[T]):
    """지연 평가 리스트"""
    
    def __init__(self, generator: Callable[[], Iterator[T]]):
        self._generator = generator
        self._cache: List[T] = []
        self._exhausted = False
        self._iterator = None
    
    def _ensure_iterator(self):
        """이터레이터 초기화"""
        if self._iterator is None:
            self._iterator = self._generator()
    
    def __iter__(self) -> Iterator[T]:
        """이터레이터 반환"""
        yield from self._cache
        if not self._exhausted:
            self._ensure_iterator()
            for item in self._iterator:
                self._cache.append(item)
                yield item
            self._exhausted = True
    
    def __getitem__(self, index: int) -> T:
        """인덱스 접근"""
        if index < len(self._cache):
            return self._cache[index]
        
        if self._exhausted:
            raise IndexError("Index out of range")
        
        self._ensure_iterator()
        try:
            while len(self._cache) <= index:
                item = next(self._iterator)
                self._cache.append(item)
            return self._cache[index]
        except StopIteration:
            self._exhausted = True
            raise IndexError("Index out of range")
    
    def take(self, n: int) -> List[T]:
        """처음 n개 항목 반환"""
        result = []
        for i, item in enumerate(self):
            if i >= n:
                break
            result.append(item)
        return result
    
    def to_list(self) -> List[T]:
        """전체 리스트로 변환"""
        return list(self)


class StreamProcessor(Generic[T]):
    """스트림 데이터 처리기"""
    
    def __init__(self, data: Iterable[T]):
        self._data = data
        self._operations: List[Callable] = []
    
    def map(self, func: Callable[[T], R]) -> 'StreamProcessor[R]':
        """맵 연산 추가"""
        new_processor = StreamProcessor(self._data)
        new_processor._operations = self._operations + [partial(map, func)]
        return new_processor
    
    def filter(self, predicate: Callable[[T], bool]) -> 'StreamProcessor[T]':
        """필터 연산 추가"""
        new_processor = StreamProcessor(self._data)
        new_processor._operations = self._operations + [partial(filter, predicate)]
        return new_processor
    
    def reduce(self, func: Callable[[T, T], T], initial: Optional[T] = None) -> T:
        """리듀스 연산 실행"""
        stream = self._apply_operations()
        if initial is not None:
            return reduce(func, stream, initial)
        return reduce(func, stream)
    
    def group_by(self, key_func: Callable[[T], K]) -> Dict[K, List[T]]:
        """그룹화"""
        groups = defaultdict(list)
        for item in self._apply_operations():
            key = key_func(item)
            groups[key].append(item)
        return dict(groups)
    
    def collect(self) -> List[T]:
        """결과 수집"""
        return list(self._apply_operations())
    
    def _apply_operations(self) -> Iterator[T]:
        """모든 연산 적용"""
        result = self._data
        for operation in self._operations:
            result = operation(result)
        return result 


class EnhancedListUtils:
    """고도화된 리스트 유틸리티 클래스 (통합 버전)"""
    
    @staticmethod
    @measure_performance
    def safe_get_item(items: Sequence[T], index: int, default: T = None) -> T:
        """안전한 리스트 아이템 접근"""
        if not isinstance(items, (list, tuple)):
            items = list(items) if hasattr(items, '__iter__') else [items]
        
        try:
            if not items:
                return default
            
            # 음수 인덱스 지원
            if index < 0:
                index = len(items) + index
            
            return items[index] if 0 <= index < len(items) else default
        except (TypeError, IndexError, AttributeError):
            return default
    
    @staticmethod
    def safe_get_slice(items: Sequence[T], start: int, end: Optional[int] = None, 
                      step: int = 1, default: List[T] = None) -> List[T]:
        """안전한 슬라이싱"""
        if default is None:
            default = []
        
        try:
            if not items:
                return default
            
            return list(items[start:end:step])
        except (TypeError, ValueError):
            return default
    
    @staticmethod
    @measure_performance
    def chunk_list(items: Sequence[T], chunk_size: int, 
                  fill_value: Optional[T] = None) -> Iterator[List[T]]:
        """리스트를 지정된 크기로 분할"""
        if not items or chunk_size <= 0:
            return iter([])
        
        iterator = iter(items)
        
        while True:
            chunk = list(itertools.islice(iterator, chunk_size))
            if not chunk:
                break
            
            # 마지막 청크가 부족한 경우 채우기
            if fill_value is not None and len(chunk) < chunk_size:
                chunk.extend([fill_value] * (chunk_size - len(chunk)))
            
            yield chunk
    
    @staticmethod
    def chunk_by_condition(items: Sequence[T], 
                          condition: Callable[[T], bool]) -> Iterator[List[T]]:
        """조건에 따른 청킹"""
        if not items:
            return iter([])
        
        current_chunk = []
        
        for item in items:
            if condition(item) and current_chunk:
                yield current_chunk
                current_chunk = [item]
            else:
                current_chunk.append(item)
        
        if current_chunk:
            yield current_chunk
    
    @staticmethod
    def sliding_window(items: Sequence[T], window_size: int, 
                      step: int = 1) -> Iterator[List[T]]:
        """슬라이딩 윈도우"""
        if window_size <= 0 or step <= 0:
            return iter([])
        
        for i in range(0, len(items) - window_size + 1, step):
            yield list(items[i:i + window_size])
    
    @staticmethod
    def flatten_list(nested_list: Iterable[Any], max_depth: Optional[int] = None) -> List[Any]:
        """중첩 리스트를 평면화"""
        def _flatten(obj: Any, depth: int = 0) -> Iterator[Any]:
            if max_depth is not None and depth >= max_depth:
                yield obj
                return
            
            try:
                # 문자열은 이터러블이지만 분해하지 않음
                if isinstance(obj, (str, bytes)):
                    yield obj
                    return
                
                # 이터러블 객체 처리
                for item in obj:
                    yield from _flatten(item, depth + 1)
            except TypeError:
                # 이터러블이 아닌 객체
                yield obj
        
        return list(_flatten(nested_list))
    
    @staticmethod
    def remove_duplicates(items: Sequence[T], key: Optional[Callable[[T], Any]] = None,
                         preserve_order: bool = True) -> List[T]:
        """중복 제거"""
        if not items:
            return []
        
        if key is None:
            if preserve_order:
                seen = set()
                result = []
                for item in items:
                    # 해시 가능한 타입 확인
                    try:
                        hash(item)
                        if item not in seen:
                            seen.add(item)
                            result.append(item)
                    except TypeError:
                        # 해시 불가능한 객체는 선형 검색
                        if item not in result:
                            result.append(item)
                return result
            else:
                try:
                    return list(set(items))
                except TypeError:
                    # 해시 불가능한 객체들
                    result = []
                    for item in items:
                        if item not in result:
                            result.append(item)
                    return result
        else:
            # 키 함수 기반 중복 제거
            seen = set()
            result = []
            for item in items:
                item_key = key(item)
                if item_key not in seen:
                    seen.add(item_key)
                    result.append(item)
            return result
    
    @staticmethod
    def filter_none(items: Sequence[Optional[T]]) -> List[T]:
        """None 값 필터링"""
        return [item for item in items if item is not None]
    
    @staticmethod
    def filter_empty(items: Sequence[Any]) -> List[Any]:
        """빈 값 필터링 (None, 빈 문자열, 빈 컬렉션)"""
        def is_not_empty(item):
            if item is None:
                return False
            if isinstance(item, (str, list, dict, set, tuple)):
                return len(item) > 0
            return True
        
        return [item for item in items if is_not_empty(item)]
    
    @staticmethod
    def partition(items: Sequence[T], predicate: Callable[[T], bool]) -> Tuple[List[T], List[T]]:
        """조건에 따라 리스트 분할"""
        true_items = []
        false_items = []
        
        for item in items:
            if predicate(item):
                true_items.append(item)
            else:
                false_items.append(item)
        
        return true_items, false_items
    
    @staticmethod
    def group_by(items: Sequence[T], key: Callable[[T], K]) -> GroupByResult[K, T]:
        """그룹화"""
        groups = defaultdict(list)
        
        for item in items:
            group_key = key(item)
            groups[group_key].append(item)
        
        return GroupByResult(
            groups=dict(groups),
            group_count=len(groups),
            total_items=len(items),
            key_function=key
        )
    
    @staticmethod
    def find_first(items: Sequence[T], predicate: Callable[[T], bool], 
                  default: Optional[T] = None) -> Optional[T]:
        """조건을 만족하는 첫 번째 항목 찾기"""
        for item in items:
            if predicate(item):
                return item
        return default
    
    @staticmethod
    def find_last(items: Sequence[T], predicate: Callable[[T], bool], 
                 default: Optional[T] = None) -> Optional[T]:
        """조건을 만족하는 마지막 항목 찾기"""
        result = default
        for item in items:
            if predicate(item):
                result = item
        return result
    
    @staticmethod
    def find_all_indices(items: Sequence[T], predicate: Callable[[T], bool]) -> List[int]:
        """조건을 만족하는 모든 인덱스 찾기"""
        return [i for i, item in enumerate(items) if predicate(item)]
    
    @staticmethod
    def interleave(*sequences: Sequence[T]) -> List[T]:
        """여러 시퀀스를 교대로 배치"""
        result = []
        iterators = [iter(seq) for seq in sequences]
        
        while iterators:
            for it in iterators[:]:
                try:
                    result.append(next(it))
                except StopIteration:
                    iterators.remove(it)
        
        return result
    
    @staticmethod
    async def process_chunks_async(items: Sequence[T], chunk_size: int,
                                  processor: Callable[[List[T]], R],
                                  max_workers: int = 4) -> List[ChunkResult[R]]:
        """청크 비동기 병렬 처리"""
        chunks = list(EnhancedListUtils.chunk_list(items, chunk_size))
        results = []
        
        async def process_chunk(chunk: List[T], index: int) -> ChunkResult[R]:
            start_time = time.time()
            try:
                if asyncio.iscoroutinefunction(processor):
                    result = await processor(chunk)
                else:
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(None, processor, chunk)
                
                return ChunkResult(
                    chunk=result,
                    index=index,
                    size=len(chunk),
                    processing_time=time.time() - start_time,
                    success=True
                )
            except Exception as e:
                return ChunkResult(
                    chunk=chunk,
                    index=index,
                    size=len(chunk),
                    processing_time=time.time() - start_time,
                    success=False,
                    error=str(e)
                )
        
        semaphore = asyncio.Semaphore(max_workers)
        
        async def bounded_process(chunk: List[T], index: int) -> ChunkResult[R]:
            async with semaphore:
                return await process_chunk(chunk, index)
        
        tasks = [bounded_process(chunk, i) for i, chunk in enumerate(chunks)]
        results = await asyncio.gather(*tasks)
        
        return results
    
    @staticmethod
    def create_lazy_list(generator: Callable[[], Iterator[T]]) -> LazyList[T]:
        """지연 평가 리스트 생성"""
        return LazyList(generator)
    
    @staticmethod
    def stream(items: Iterable[T]) -> StreamProcessor[T]:
        """스트림 처리기 생성"""
        return StreamProcessor(items)
    
    @staticmethod
    def moving_average(numbers: Sequence[Union[int, float]], window_size: int) -> List[float]:
        """이동 평균 계산"""
        if not numbers or window_size <= 0:
            return []
        
        if window_size > len(numbers):
            window_size = len(numbers)
        
        result = []
        for i in range(len(numbers) - window_size + 1):
            window = numbers[i:i + window_size]
            avg = sum(window) / len(window)
            result.append(avg)
        
        return result
    
    @staticmethod
    def percentile(numbers: Sequence[Union[int, float]], p: float) -> float:
        """백분위수 계산"""
        if not numbers:
            raise EmptyCollectionError("Cannot calculate percentile of empty collection")
        
        sorted_numbers = sorted(numbers)
        return statistics.quantiles(sorted_numbers, n=100)[int(p) - 1] if p > 0 else sorted_numbers[0]
    
    @staticmethod
    def mode_with_count(items: Sequence[T]) -> Tuple[T, int]:
        """최빈값과 횟수 반환"""
        if not items:
            raise EmptyCollectionError("Cannot find mode of empty collection")
        
        counter = Counter(items)
        mode_item, count = counter.most_common(1)[0]
        return mode_item, count
    
    @staticmethod
    def binary_search(sorted_items: Sequence[T], target: T, 
                     key: Optional[Callable[[T], Any]] = None) -> int:
        """이진 검색"""
        if key is None:
            return bisect.bisect_left(sorted_items, target)
        else:
            keys = [key(item) for item in sorted_items]
            index = bisect.bisect_left(keys, key(target))
            return index if index < len(sorted_items) and keys[index] == key(target) else -1 


class EnhancedDictUtils:
    """고도화된 딕셔너리 유틸리티 클래스 (통합 버전)"""
    
    @staticmethod
    @measure_performance
    def safe_get_nested(data: Mapping[str, Any], keys: Union[str, List[str]], 
                       default: Any = None, separator: str = ".") -> Any:
        """중첩 딕셔너리에서 안전한 값 접근"""
        if isinstance(keys, str):
            keys = keys.split(separator)
        
        try:
            result = data
            for key in keys:
                if isinstance(result, Mapping):
                    result = result[key]
                elif hasattr(result, '__getitem__'):
                    # 리스트나 튜플에서 인덱스 접근
                    try:
                        index = int(key)
                        result = result[index]
                    except (ValueError, IndexError, TypeError):
                        return default
                else:
                    return default
            return result
        except (KeyError, TypeError, AttributeError):
            return default
    
    @staticmethod
    def safe_set_nested(data: Dict[str, Any], keys: Union[str, List[str]], 
                       value: Any, separator: str = ".", create_missing: bool = True) -> bool:
        """중첩 딕셔너리에 안전한 값 설정"""
        if isinstance(keys, str):
            keys = keys.split(separator)
        
        if not keys:
            return False
        
        try:
            current = data
            for key in keys[:-1]:
                if key not in current:
                    if create_missing:
                        current[key] = {}
                    else:
                        return False
                current = current[key]
                if not isinstance(current, dict):
                    return False
            
            current[keys[-1]] = value
            return True
        except (TypeError, AttributeError):
            return False
    
    @staticmethod
    def flatten_dict(data: Mapping[str, Any], separator: str = ".", 
                    max_depth: Optional[int] = None) -> Dict[str, Any]:
        """중첩 딕셔너리를 평면화"""
        def _flatten(obj: Any, parent_key: str = "", depth: int = 0) -> Dict[str, Any]:
            items = []
            
            if max_depth is not None and depth >= max_depth:
                return {parent_key: obj} if parent_key else {"root": obj}
            
            if isinstance(obj, Mapping):
                for key, value in obj.items():
                    new_key = f"{parent_key}{separator}{key}" if parent_key else key
                    items.extend(_flatten(value, new_key, depth + 1).items())
            elif isinstance(obj, (list, tuple)) and parent_key:
                for i, value in enumerate(obj):
                    new_key = f"{parent_key}{separator}{i}"
                    items.extend(_flatten(value, new_key, depth + 1).items())
            else:
                return {parent_key: obj} if parent_key else {"value": obj}
            
            return dict(items)
        
        return _flatten(data)
    
    @staticmethod
    def unflatten_dict(flat_data: Dict[str, Any], separator: str = ".") -> Dict[str, Any]:
        """평면화된 딕셔너리를 중첩 구조로 복원"""
        result = {}
        
        for flat_key, value in flat_data.items():
            keys = flat_key.split(separator)
            current = result
            
            for key in keys[:-1]:
                # 숫자인 키는 리스트 인덱스로 처리
                if key.isdigit():
                    key = int(key)
                    # 현재 위치가 리스트가 아니면 리스트로 변환
                    if not isinstance(current, list):
                        current = []
                    # 리스트 크기 확장
                    while len(current) <= key:
                        current.append({})
                    if not isinstance(current[key], dict):
                        current[key] = {}
                    current = current[key]
                else:
                    if key not in current:
                        current[key] = {}
                    current = current[key]
            
            final_key = keys[-1]
            if final_key.isdigit():
                final_key = int(final_key)
                if not isinstance(current, list):
                    current = []
                while len(current) <= final_key:
                    current.append(None)
                current[final_key] = value
            else:
                current[final_key] = value
        
        return result
    
    @staticmethod
    def filter_dict(data: Mapping[str, Any], keys: Optional[List[str]] = None,
                   predicate: Optional[Callable[[str, Any], bool]] = None) -> Dict[str, Any]:
        """딕셔너리 필터링"""
        if keys is not None:
            return {key: data[key] for key in keys if key in data}
        
        if predicate is not None:
            return {key: value for key, value in data.items() if predicate(key, value)}
        
        # 둘 다 None이면 빈 딕셔너리 반환
        return {}
    
    @staticmethod
    def exclude_dict_keys(data: Mapping[str, Any], keys: List[str]) -> Dict[str, Any]:
        """지정된 키를 제외한 딕셔너리 생성"""
        if not keys:
            return dict(data)
        
        exclude_set = set(keys)
        return {key: value for key, value in data.items() if key not in exclude_set}
    
    @staticmethod
    def merge_dicts(*dicts: Mapping[str, Any], strategy: MergeStrategy = MergeStrategy.OVERWRITE,
                   custom_merger: Optional[Callable[[Any, Any], Any]] = None) -> Dict[str, Any]:
        """여러 딕셔너리 병합"""
        if not dicts:
            return {}
        
        result = {}
        
        for d in dicts:
            if not isinstance(d, Mapping):
                continue
            
            for key, value in d.items():
                if key not in result:
                    result[key] = value
                else:
                    if strategy == MergeStrategy.OVERWRITE:
                        result[key] = value
                    elif strategy == MergeStrategy.KEEP_FIRST:
                        pass  # 기존 값 유지
                    elif strategy == MergeStrategy.MERGE_VALUES:
                        if isinstance(result[key], dict) and isinstance(value, dict):
                            result[key] = EnhancedDictUtils.merge_dicts(result[key], value, strategy)
                        elif isinstance(result[key], list) and isinstance(value, list):
                            result[key] = result[key] + value
                        else:
                            result[key] = value
                    elif strategy == MergeStrategy.CUSTOM and custom_merger:
                        result[key] = custom_merger(result[key], value)
        
        return result
    
    @staticmethod
    def deep_copy(data: Dict[str, Any]) -> Dict[str, Any]:
        """딕셔너리 깊은 복사"""
        return copy.deepcopy(data)
    
    @staticmethod
    def diff_dicts(dict1: Mapping[str, Any], dict2: Mapping[str, Any]) -> Dict[str, Any]:
        """두 딕셔너리의 차이점 분석"""
        result = {
            "added": {},
            "removed": {},
            "modified": {},
            "unchanged": {}
        }
        
        all_keys = set(dict1.keys()) | set(dict2.keys())
        
        for key in all_keys:
            if key in dict1 and key in dict2:
                if dict1[key] == dict2[key]:
                    result["unchanged"][key] = dict1[key]
                else:
                    result["modified"][key] = {
                        "old": dict1[key],
                        "new": dict2[key]
                    }
            elif key in dict1:
                result["removed"][key] = dict1[key]
            else:
                result["added"][key] = dict2[key]
        
        return result
    
    @staticmethod
    def invert_dict(data: Dict[K, V], handle_duplicates: str = "keep_first") -> Dict[V, K]:
        """딕셔너리 키-값 반전"""
        result = {}
        
        for key, value in data.items():
            # 값이 해시 가능한지 확인
            try:
                hash(value)
            except TypeError:
                continue
            
            if value in result:
                if handle_duplicates == "keep_first":
                    continue
                elif handle_duplicates == "keep_last":
                    result[value] = key
                elif handle_duplicates == "make_list":
                    if not isinstance(result[value], list):
                        result[value] = [result[value]]
                    result[value].append(key)
            else:
                result[value] = key
        
        return result
    
    @staticmethod
    def group_dict_by_value(data: Dict[K, V]) -> Dict[V, List[K]]:
        """값에 따라 키 그룹화"""
        result = defaultdict(list)
        
        for key, value in data.items():
            # 값이 해시 가능한지 확인
            try:
                hash(value)
                result[value].append(key)
            except TypeError:
                # 해시 불가능한 값은 문자열로 변환
                str_value = str(value)
                result[str_value].append(key)
        
        return dict(result)
    
    # 첫 번째 파일에서 온 함수들
    @staticmethod
    def map_dict_values(data: Dict[K, V], mapper: Callable[[V], R]) -> Dict[K, R]:
        """딕셔너리 값에 함수 적용"""
        return {key: mapper(value) for key, value in data.items()}
    
    @staticmethod
    def map_dict_keys(data: Dict[K, V], mapper: Callable[[K], R]) -> Dict[R, V]:
        """딕셔너리 키에 함수 적용"""
        return {mapper(key): value for key, value in data.items()}
    
    @staticmethod
    def sort_dict_by_keys(data: Dict[K, V], reverse: bool = False) -> Dict[K, V]:
        """키로 딕셔너리 정렬"""
        try:
            sorted_items = sorted(data.items(), key=lambda x: x[0], reverse=reverse)
            return dict(sorted_items)
        except TypeError:
            # 비교 불가능한 키들은 문자열로 변환하여 정렬
            sorted_items = sorted(data.items(), key=lambda x: str(x[0]), reverse=reverse)
            return dict(sorted_items)
    
    @staticmethod
    def sort_dict_by_values(data: Dict[K, V], reverse: bool = False) -> Dict[K, V]:
        """값으로 딕셔너리 정렬"""
        try:
            sorted_items = sorted(data.items(), key=lambda x: x[1], reverse=reverse)
            return dict(sorted_items)
        except TypeError:
            # 비교 불가능한 값들은 문자열로 변환하여 정렬
            sorted_items = sorted(data.items(), key=lambda x: str(x[1]), reverse=reverse)
            return dict(sorted_items)
    
    @staticmethod
    def get_dict_paths(data: Dict[str, Any], separator: str = ".") -> List[str]:
        """딕셔너리의 모든 경로 반환"""
        paths = []
        
        def _collect_paths(obj: Any, current_path: str = ""):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    new_path = f"{current_path}{separator}{key}" if current_path else key
                    paths.append(new_path)
                    _collect_paths(value, new_path)
            elif isinstance(obj, (list, tuple)):
                for i, value in enumerate(obj):
                    new_path = f"{current_path}{separator}{i}" if current_path else str(i)
                    paths.append(new_path)
                    _collect_paths(value, new_path)
        
        _collect_paths(data)
        return paths
    
    @staticmethod
    def validate_dict_schema(data: Dict[str, Any], schema: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """딕셔너리 스키마 검증"""
        errors = []
        
        def _validate(obj: Any, schema_obj: Any, path: str = ""):
            if isinstance(schema_obj, dict):
                if not isinstance(obj, dict):
                    errors.append(f"Path '{path}': Expected dict, got {type(obj).__name__}")
                    return
                
                # 필수 키 검사
                required_keys = {k for k, v in schema_obj.items() 
                               if not isinstance(v, dict) or v.get('required', True)}
                missing_keys = required_keys - set(obj.keys())
                if missing_keys:
                    errors.append(f"Path '{path}': Missing required keys: {missing_keys}")
                
                # 각 키 검증
                for key, schema_value in schema_obj.items():
                    if key in obj:
                        new_path = f"{path}.{key}" if path else key
                        _validate(obj[key], schema_value, new_path)
            
            elif isinstance(schema_obj, type):
                if not isinstance(obj, schema_obj):
                    errors.append(f"Path '{path}': Expected {schema_obj.__name__}, got {type(obj).__name__}")
            
            elif callable(schema_obj):
                try:
                    if not schema_obj(obj):
                        errors.append(f"Path '{path}': Custom validation failed")
                except Exception as e:
                    errors.append(f"Path '{path}': Validation error: {e}")
        
        _validate(data, schema)
        return len(errors) == 0, errors
    
    # 두 번째 파일에서 온 추가 함수들
    @staticmethod
    def sort_dict(data: Dict[K, V], by: str = "key", 
                 reverse: bool = False, key_func: Optional[Callable] = None) -> Dict[K, V]:
        """딕셔너리 정렬 (통합 버전)"""
        if by == "key":
            sort_key = lambda item: item[0] if key_func is None else key_func(item[0])
        elif by == "value":
            sort_key = lambda item: item[1] if key_func is None else key_func(item[1])
        else:
            raise ValueError("'by' parameter must be 'key' or 'value'")
        
        try:
            sorted_items = sorted(data.items(), key=sort_key, reverse=reverse)
            return dict(sorted_items)
        except TypeError:
            # 비교 불가능한 경우 문자열로 변환
            str_sort_key = lambda item: str(sort_key(item))
            sorted_items = sorted(data.items(), key=str_sort_key, reverse=reverse)
            return dict(sorted_items)
    
    @staticmethod
    def transform_values(data: Dict[K, V], transformer: Callable[[V], R]) -> Dict[K, R]:
        """딕셔너리 값 변환"""
        return {key: transformer(value) for key, value in data.items()}
    
    @staticmethod
    def transform_keys(data: Dict[K, V], transformer: Callable[[K], R]) -> Dict[R, V]:
        """딕셔너리 키 변환"""
        return {transformer(key): value for key, value in data.items()}
    
    @staticmethod
    def pick_random(data: Dict[K, V], count: int = 1) -> Dict[K, V]:
        """딕셔너리에서 랜덤 항목 선택"""
        if count >= len(data):
            return dict(data)
        
        selected_keys = random.sample(list(data.keys()), count)
        return {key: data[key] for key in selected_keys}
    
    @staticmethod
    def find_key_by_value(data: Dict[K, V], target_value: V) -> Optional[K]:
        """값으로 키 찾기"""
        for key, value in data.items():
            if value == target_value:
                return key
        return None
    
    @staticmethod
    def find_all_keys_by_value(data: Dict[K, V], target_value: V) -> List[K]:
        """값으로 모든 키 찾기"""
        return [key for key, value in data.items() if value == target_value]
    
    @staticmethod
    def create_index(data: Dict[K, V], index_func: Callable[[V], Any]) -> Dict[Any, List[K]]:
        """인덱스 생성"""
        index = defaultdict(list)
        
        for key, value in data.items():
            index_key = index_func(value)
            index[index_key].append(key)
        
        return dict(index)


class EnhancedSetUtils:
    """고도화된 집합 유틸리티 클래스 (통합 버전)"""
    
    @staticmethod
    def safe_union(*sets: Set[T]) -> Set[T]:
        """안전한 합집합 (개선된 버전)"""
        result = set()
        for s in sets:
            if isinstance(s, (set, frozenset)):
                result.update(s)
            elif hasattr(s, '__iter__') and s is not None:
                result.update(set(s))
        return result
    
    @staticmethod
    def safe_intersection(*sets: Set[T]) -> Set[T]:
        """안전한 교집합 (개선된 버전)"""
        if not sets:
            return set()
        
        result = set(sets[0]) if isinstance(sets[0], (set, frozenset)) else set(sets[0])
        
        for s in sets[1:]:
            if isinstance(s, (set, frozenset)):
                result.intersection_update(s)
            elif hasattr(s, '__iter__'):
                result.intersection_update(set(s))
        
        return result
    
    @staticmethod
    def safe_difference(set1: Set[T], *sets: Set[T]) -> Set[T]:
        """안전한 차집합 (개선된 버전)"""
        result = set(set1) if isinstance(set1, (set, frozenset)) else set(set1)
        
        for s in sets:
            if isinstance(s, (set, frozenset)):
                result.difference_update(s)
            elif hasattr(s, '__iter__'):
                result.difference_update(set(s))
        
        return result
    
    @staticmethod
    def symmetric_difference(*sets: Set[T]) -> Set[T]:
        """대칭 차집합 (개선된 버전)"""
        if not sets:
            return set()
        
        result = set(sets[0]) if isinstance(sets[0], (set, frozenset)) else set(sets[0])
        
        for s in sets[1:]:
            if isinstance(s, (set, frozenset)):
                result.symmetric_difference_update(s)
            elif hasattr(s, '__iter__'):
                result.symmetric_difference_update(set(s))
        
        return result
    
    @staticmethod
    def powerset(s: Set[T]) -> Iterator[Set[T]]:
        """멱집합 생성 (비트 연산 기반)"""
        items = list(s)
        n = len(items)
        
        for i in range(2**n):
            subset = set()
            for j in range(n):
                if i & (1 << j):
                    subset.add(items[j])
            yield subset
    
    @staticmethod
    def power_set_limited(s: Set[T], max_size: Optional[int] = None) -> Iterator[Set[T]]:
        """크기 제한이 있는 멱집합 생성"""
        elements = list(s)
        max_size = min(max_size or len(elements), len(elements))
        
        for r in range(max_size + 1):
            for combination in itertools.combinations(elements, r):
                yield set(combination)
    
    @staticmethod
    def cartesian_product(*sets: Set[T]) -> Iterator[Tuple[T, ...]]:
        """데카르트 곱"""
        return itertools.product(*sets)
    
    @staticmethod
    def jaccard_similarity(set1: Set[T], set2: Set[T]) -> float:
        """자카드 유사도 계산"""
        union = set1.union(set2)
        if not union:
            return 1.0  # 둘 다 빈 집합인 경우
        
        intersection = set1.intersection(set2)
        return len(intersection) / len(union)
    
    @staticmethod
    def cosine_similarity(set1: Set[T], set2: Set[T]) -> float:
        """코사인 유사도 계산 (집합)"""
        intersection = len(set1 & set2)
        magnitude_product = (len(set1) * len(set2)) ** 0.5
        
        return intersection / magnitude_product if magnitude_product > 0 else 0.0
    
    @staticmethod
    def find_set_partitions(s: Set[T], num_partitions: int) -> List[List[Set[T]]]:
        """집합을 지정된 수의 부분집합으로 분할하는 모든 방법"""
        if num_partitions <= 0 or num_partitions > len(s):
            return []
        
        elements = list(s)
        partitions = []
        
        def _partition(elements: List[T], k: int) -> Iterator[List[Set[T]]]:
            if k == 1:
                yield [set(elements)]
                return
            
            if not elements or k > len(elements):
                return
            
            first = elements[0]
            rest = elements[1:]
            
            # 첫 번째 원소를 새로운 부분집합에 추가
            for smaller in _partition(rest, k - 1):
                yield [{first}] + smaller
            
            # 첫 번째 원소를 기존 부분집합들에 추가
            for smaller in _partition(rest, k):
                for i in range(len(smaller)):
                    new_partition = [subset.copy() for subset in smaller]
                    new_partition[i].add(first)
                    yield new_partition
        
        return list(_partition(elements, num_partitions))


class CollectionAnalyzer:
    """컬렉션 분석 도구 (첫 번째 파일 버전)"""
    
    @staticmethod
    def analyze_list_performance(items: List[Any]) -> Dict[str, Any]:
        """리스트 성능 분석"""
        if not items:
            return {"error": "Empty list"}
        
        # 메모리 사용량 추정
        memory_usage = sum(len(str(item).encode('utf-8')) for item in items)
        
        # 타입 분포
        type_counter = Counter(type(item).__name__ for item in items)
        
        # 중복률
        unique_items = len(set(str(item) for item in items))
        duplicate_ratio = 1 - (unique_items / len(items))
        
        return {
            "size": len(items),
            "memory_usage_bytes": memory_usage,
            "type_distribution": dict(type_counter),
            "duplicate_ratio": duplicate_ratio,
            "unique_items": unique_items,
            "has_none_values": None in items,
            "is_homogeneous": len(type_counter) == 1
        }
    
    @staticmethod
    def analyze_dict_structure(data: Dict[str, Any]) -> Dict[str, Any]:
        """딕셔너리 구조 분석"""
        if not data:
            return {"error": "Empty dictionary"}
        
        # 깊이 분석
        def _get_max_depth(obj: Any, current_depth: int = 0) -> int:
            if isinstance(obj, dict):
                if not obj:
                    return current_depth
                return max(_get_max_depth(value, current_depth + 1) for value in obj.values())
            elif isinstance(obj, (list, tuple)):
                if not obj:
                    return current_depth
                return max(_get_max_depth(item, current_depth + 1) for item in obj)
            return current_depth
        
        max_depth = _get_max_depth(data)
        
        # 키 분석
        all_keys = []
        
        def _collect_keys(obj: Any):
            if isinstance(obj, dict):
                all_keys.extend(obj.keys())
                for value in obj.values():
                    _collect_keys(value)
            elif isinstance(obj, (list, tuple)):
                for item in obj:
                    _collect_keys(item)
        
        _collect_keys(data)
        
        # 값 타입 분석
        value_types = Counter()
        
        def _collect_value_types(obj: Any):
            if isinstance(obj, dict):
                for value in obj.values():
                    value_types[type(value).__name__] += 1
                    _collect_value_types(value)
            elif isinstance(obj, (list, tuple)):
                for item in obj:
                    _collect_value_types(item)
        
        _collect_value_types(data)
        
        return {
            "total_keys": len(data),
            "max_depth": max_depth,
            "all_keys_count": len(all_keys),
            "unique_keys": len(set(all_keys)),
            "value_type_distribution": dict(value_types),
            "has_circular_references": False,  # 간단한 구현을 위해 False로 설정
            "memory_estimation_bytes": len(json.dumps(data, default=str).encode('utf-8'))
        }


class AdvancedCollectionAnalyzer:
    """고급 컬렉션 분석기 (두 번째 파일 버전)"""
    
    @staticmethod
    def analyze_collection(data: Any) -> Dict[str, Any]:
        """컬렉션 분석"""
        analysis = {
            "type": type(data).__name__,
            "size": 0,
            "memory_usage": 0,
            "is_nested": False,
            "max_depth": 0,
            "element_types": Counter(),
            "statistics": {}
        }
        
        try:
            analysis["size"] = len(data)
            analysis["memory_usage"] = data.__sizeof__()
        except (TypeError, AttributeError):
            pass
        
        # 중첩 구조 분석
        def analyze_depth(obj, current_depth=0):
            max_d = current_depth
            
            if isinstance(obj, (dict, list, tuple, set)):
                analysis["is_nested"] = True
                
                if isinstance(obj, dict):
                    for value in obj.values():
                        max_d = max(max_d, analyze_depth(value, current_depth + 1))
                elif isinstance(obj, (list, tuple, set)):
                    for item in obj:
                        max_d = max(max_d, analyze_depth(item, current_depth + 1))
            
            return max_d
        
        analysis["max_depth"] = analyze_depth(data)
        
        # 요소 타입 분석
        def count_types(obj):
            if isinstance(obj, dict):
                for value in obj.values():
                    analysis["element_types"][type(value).__name__] += 1
                    count_types(value)
            elif isinstance(obj, (list, tuple, set)):
                for item in obj:
                    analysis["element_types"][type(item).__name__] += 1
                    count_types(item)
        
        count_types(data)
        
        # 숫자 데이터 통계
        if isinstance(data, (list, tuple)) and all(isinstance(x, (int, float)) for x in data):
            try:
                analysis["statistics"] = {
                    "min": min(data),
                    "max": max(data),
                    "mean": statistics.mean(data),
                    "median": statistics.median(data),
                    "std_dev": statistics.stdev(data) if len(data) > 1 else 0
                }
            except (ValueError, statistics.StatisticsError):
                pass
        
        return analysis
    
    @staticmethod
    def suggest_optimizations(data: Any) -> List[str]:
        """최적화 제안"""
        suggestions = []
        analysis = AdvancedCollectionAnalyzer.analyze_collection(data)
        
        # 크기 기반 제안
        if analysis["size"] > 10000:
            suggestions.append("Large collection detected. Consider using generators or chunking.")
        
        # 중첩 구조 제안
        if analysis["max_depth"] > 5:
            suggestions.append("Deep nesting detected. Consider flattening or restructuring.")
        
        # 타입 다양성 제안
        if len(analysis["element_types"]) > 5:
            suggestions.append("Multiple element types detected. Consider using specialized containers.")
        
        # 메모리 사용량 제안
        if analysis["memory_usage"] > 1000000:  # 1MB
            suggestions.append("High memory usage detected. Consider compression or lazy loading.")
        
        return suggestions
    
    @staticmethod
    def benchmark_operations(data: Any, operations: List[str]) -> Dict[str, float]:
        """연산 성능 벤치마킹"""
        results = {}
        
        for op_name in operations:
            start_time = time.time()
            
            try:
                if op_name == "iterate":
                    for _ in data:
                        pass
                elif op_name == "len":
                    len(data)
                elif op_name == "copy":
                    if hasattr(data, 'copy'):
                        data.copy()
                    else:
                        list(data) if hasattr(data, '__iter__') else data
                elif op_name == "sort" and isinstance(data, list):
                    sorted(data)
                elif op_name == "reverse" and isinstance(data, list):
                    list(reversed(data))
                
                execution_time = time.time() - start_time
                results[op_name] = execution_time
                
            except Exception as e:
                results[op_name] = float('inf')  # 실패한 연산
        
        return results


class CollectionCache:
    """컬렉션 캐시"""
    
    def __init__(self, max_size: int = 1000, ttl: Optional[float] = None):
        self.max_size = max_size
        self.ttl = ttl
        self._cache = OrderedDict()
        self._timestamps = {}
        self._lock = threading.RLock()
    
    def get(self, key: str) -> Optional[Any]:
        """캐시에서 값 가져오기"""
        with self._lock:
            if key not in self._cache:
                return None
            
            # TTL 확인
            if self.ttl and key in self._timestamps:
                if time.time() - self._timestamps[key] > self.ttl:
                    self._remove_key(key)
                    return None
            
            # LRU 업데이트
            self._cache.move_to_end(key)
            return self._cache[key]
    
    def set(self, key: str, value: Any) -> None:
        """캐시에 값 설정"""
        with self._lock:
            # 크기 제한 확인
            if len(self._cache) >= self.max_size and key not in self._cache:
                # 가장 오래된 항목 제거
                oldest_key = next(iter(self._cache))
                self._remove_key(oldest_key)
            
            self._cache[key] = value
            if self.ttl:
                self._timestamps[key] = time.time()
            
            # 최신으로 이동
            self._cache.move_to_end(key)
    
    def _remove_key(self, key: str) -> None:
        """키 제거"""
        self._cache.pop(key, None)
        self._timestamps.pop(key, None)
    
    def clear(self) -> None:
        """캐시 정리"""
        with self._lock:
            self._cache.clear()
            self._timestamps.clear()
    
    def stats(self) -> Dict[str, Any]:
        """캐시 통계"""
        with self._lock:
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "ttl": self.ttl,
                "memory_usage": sum(value.__sizeof__() for value in self._cache.values())
            }


class CollectionPersistence:
    """컬렉션 지속성 관리"""
    
    @staticmethod
    def save_to_json(data: Any, filepath: Union[str, Path], 
                    indent: int = 2, ensure_ascii: bool = False) -> bool:
        """JSON으로 저장"""
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii, default=str)
            return True
        except Exception as e:
            logger.error(f"Failed to save to JSON: {e}")
            return False
    
    @staticmethod
    def load_from_json(filepath: Union[str, Path]) -> Optional[Any]:
        """JSON에서 로드"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load from JSON: {e}")
            return None
    
    @staticmethod
    def save_to_pickle(data: Any, filepath: Union[str, Path]) -> bool:
        """Pickle로 저장"""
        try:
            with open(filepath, 'wb') as f:
                pickle.dump(data, f)
            return True
        except Exception as e:
            logger.error(f"Failed to save to pickle: {e}")
            return False
    
    @staticmethod
    def load_from_pickle(filepath: Union[str, Path]) -> Optional[Any]:
        """Pickle에서 로드"""
        try:
            with open(filepath, 'rb') as f:
                return pickle.load(f)
        except Exception as e:
            logger.error(f"Failed to load from pickle: {e}")
            return None


class CollectionFactory:
    """컬렉션 팩토리"""
    
    @staticmethod
    def create_list(items: Iterable[T] = None, lazy: bool = False) -> Union[List[T], LazyList[T]]:
        """리스트 생성"""
        if lazy and items is not None:
            return LazyList(lambda: iter(items))
        return list(items) if items is not None else []
    
    @staticmethod
    def create_dict(items: Optional[Iterable[Tuple[K, V]]] = None, 
                   ordered: bool = False) -> Union[Dict[K, V], OrderedDict]:
        """딕셔너리 생성"""
        if ordered:
            return OrderedDict(items) if items is not None else OrderedDict()
        return dict(items) if items is not None else {}
    
    @staticmethod
    def create_defaultdict(default_factory: Callable, 
                          items: Optional[Iterable[Tuple[K, V]]] = None) -> defaultdict:
        """기본값 딕셔너리 생성"""
        dd = defaultdict(default_factory)
        if items is not None:
            dd.update(items)
        return dd
    
    @staticmethod
    def create_counter(items: Optional[Iterable[T]] = None) -> Counter:
        """카운터 생성"""
        return Counter(items) if items is not None else Counter()
    
    @staticmethod
    def create_chainmap(*mappings: Mapping) -> ChainMap:
        """체인맵 생성"""
        return ChainMap(*mappings)


class MemoryEfficientCollections:
    """메모리 효율적인 컬렉션 도구"""
    
    @staticmethod
    def create_memory_mapped_list(items: List[T], temp_dir: Optional[str] = None) -> 'MemoryMappedList[T]':
        """메모리 매핑된 리스트 생성"""
        return MemoryMappedList(items, temp_dir)
    
    @staticmethod
    def create_compressed_dict(data: Dict[str, Any]) -> 'CompressedDict':
        """압축된 딕셔너리 생성"""
        return CompressedDict(data)
    
    @staticmethod
    @contextmanager
    def temporary_collection(collection_type: str = "list"):
        """임시 컬렉션 컨텍스트 매니저"""
        temp_collection = [] if collection_type == "list" else {}
        try:
            yield temp_collection
        finally:
            temp_collection.clear()


class MemoryMappedList(Generic[T]):
    """메모리 매핑된 리스트 (대용량 데이터용)"""
    
    def __init__(self, items: List[T], temp_dir: Optional[str] = None):
        self._temp_file = None
        self._size = len(items)
        self._temp_dir = temp_dir or "."
        
        # 임시 파일에 데이터 저장
        self._temp_file = tempfile.NamedTemporaryFile(
            dir=self._temp_dir, 
            delete=False, 
            suffix='.pkl'
        )
        
        with open(self._temp_file.name, 'wb') as f:
            pickle.dump(items, f)
        
        self._temp_file.close()
    
    def __len__(self) -> int:
        return self._size
    
    def __getitem__(self, index: int) -> T:
        with open(self._temp_file.name, 'rb') as f:
            items = pickle.load(f)
            return items[index]
    
    def __iter__(self) -> Iterator[T]:
        with open(self._temp_file.name, 'rb') as f:
            items = pickle.load(f)
            yield from items
    
    def chunk_iterator(self, chunk_size: int) -> Iterator[List[T]]:
        """청크 단위로 데이터 반환"""
        with open(self._temp_file.name, 'rb') as f:
            items = pickle.load(f)
            for i in range(0, len(items), chunk_size):
                yield items[i:i + chunk_size]
    
    def __del__(self):
        """소멸자에서 임시 파일 정리"""
        if self._temp_file and hasattr(self._temp_file, 'name'):
            try:
                Path(self._temp_file.name).unlink(missing_ok=True)
            except:
                pass


class CompressedDict:
    """압축된 딕셔너리 (메모리 절약용)"""
    
    def __init__(self, data: Dict[str, Any]):
        self._compressed_data = gzip.compress(json.dumps(data, default=str).encode('utf-8'))
        self._keys = list(data.keys())
    
    def get(self, key: str, default: Any = None) -> Any:
        """키로 값 조회"""
        data = self._decompress()
        return data.get(key, default)
    
    def keys(self):
        """키 목록 반환"""
        return self._keys
    
    def items(self):
        """아이템 이터레이터"""
        data = self._decompress()
        return data.items()
    
    def _decompress(self) -> Dict[str, Any]:
        """데이터 압축 해제"""
        decompressed = gzip.decompress(self._compressed_data).decode('utf-8')
        return json.loads(decompressed)
    
    def memory_usage(self) -> Dict[str, int]:
        """메모리 사용량 정보"""
        return {
            "compressed_size": len(self._compressed_data),
            "estimated_uncompressed": len(json.dumps(self._decompress()).encode('utf-8')),
            "compression_ratio": len(self._compressed_data) / len(json.dumps(self._decompress()).encode('utf-8'))
        }


class FunctionalUtils:
    """함수형 프로그래밍 유틸리티"""
    
    @staticmethod
    def curry(func: Callable) -> Callable:
        """함수 커링"""
        @wraps(func)
        def curried(*args, **kwargs):
            if len(args) + len(kwargs) >= func.__code__.co_argcount:
                return func(*args, **kwargs)
            return lambda *more_args, **more_kwargs: curried(*(args + more_args), **{**kwargs, **more_kwargs})
        return curried
    
    @staticmethod
    def compose(*functions: Callable) -> Callable:
        """함수 합성"""
        def _compose(f, g):
            return lambda x: f(g(x))
        
        return reduce(_compose, functions, lambda x: x)
    
    @staticmethod
    def pipe(value: Any, *functions: Callable) -> Any:
        """파이프라인 처리"""
        result = value
        for func in functions:
            result = func(result)
        return result
    
    @staticmethod
    def memoize(maxsize: int = 128) -> Callable:
        """메모이제이션 데코레이터"""
        return lru_cache(maxsize=maxsize)
    
    @staticmethod
    def throttle(seconds: float) -> Callable:
        """스로틀링 데코레이터"""
        def decorator(func):
            last_called = [0.0]
            
            @wraps(func)
            def wrapper(*args, **kwargs):
                now = time.time()
                if now - last_called[0] >= seconds:
                    last_called[0] = now
                    return func(*args, **kwargs)
                return None
            return wrapper
        return decorator
    
    @staticmethod
    def debounce(seconds: float) -> Callable:
        """디바운싱 데코레이터"""
        def decorator(func):
            timer = [None]
            
            @wraps(func)
            def wrapper(*args, **kwargs):
                def call_func():
                    timer[0] = None
                    return func(*args, **kwargs)
                
                if timer[0]:
                    timer[0].cancel()
                
                timer[0] = threading.Timer(seconds, call_func)
                timer[0].start()
            
            return wrapper
        return decorator


class HighPerformanceOps:
    """고성능 컬렉션 연산"""
    
    @staticmethod
    def parallel_map(func: Callable[[T], R], items: List[T], 
                    max_workers: Optional[int] = None) -> List[R]:
        """병렬 맵 처리"""
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            return list(executor.map(func, items))
    
    @staticmethod
    def parallel_filter(predicate: Callable[[T], bool], items: List[T],
                       max_workers: Optional[int] = None) -> List[T]:
        """병렬 필터 처리"""
        def _filter_chunk(chunk):
            return [item for item in chunk if predicate(item)]
        
        chunk_size = max(1, len(items) // (max_workers or 4))
        chunks = list(EnhancedListUtils.chunk_list(items, chunk_size))
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            filtered_chunks = list(executor.map(_filter_chunk, chunks))
        
        return EnhancedListUtils.flatten_list(filtered_chunks)
    
    @staticmethod
    def parallel_reduce(func: Callable[[T, T], T], items: List[T],
                       initial: Optional[T] = None, max_workers: Optional[int] = None) -> T:
        """병렬 리듀스 처리"""
        if not items:
            if initial is not None:
                return initial
            raise EmptyCollectionError("Cannot reduce empty collection without initial value")
        
        if len(items) == 1:
            return items[0] if initial is None else func(initial, items[0])
        
        chunk_size = max(1, len(items) // (max_workers or 4))
        chunks = list(EnhancedListUtils.chunk_list(items, chunk_size))
        
        def _reduce_chunk(chunk):
            return reduce(func, chunk)
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            chunk_results = list(executor.map(_reduce_chunk, chunks))
        
        result = reduce(func, chunk_results)
        return result if initial is None else func(initial, result)


# 전역 캐시 인스턴스
_global_cache = CollectionCache()

# 편의 함수들
def get_cache() -> CollectionCache:
    """전역 캐시 반환"""
    return _global_cache

@lru_cache(maxsize=128)
def memoized_operation(operation_name: str, data_hash: str, *args):
    """메모화된 연산 (함수 레벨 캐싱)"""
    # 실제 구현에서는 operation_name에 따라 적절한 연산 수행
    pass

# 컨텍스트 매니저
@contextmanager
def collection_timer(operation_name: str):
    """컬렉션 연산 시간 측정"""
    start_time = time.time()
    try:
        yield
    finally:
        execution_time = time.time() - start_time
        logger.info(f"{operation_name} completed in {execution_time:.4f}s")

# 메인 API 클래스들의 별칭 (하위 호환성)
ListUtils = EnhancedListUtils
DictUtils = EnhancedDictUtils
SetUtils = EnhancedSetUtils

# 편의 함수들 (하위 호환성)
def safe_get_item(items: Sequence[T], index: int, default: T = None) -> T:
    """하위 호환성을 위한 함수"""
    return EnhancedListUtils.safe_get_item(items, index, default)

def chunk_list(items: Sequence[T], chunk_size: int) -> Iterator[List[T]]:
    """하위 호환성을 위한 함수"""
    return EnhancedListUtils.chunk_list(items, chunk_size)

def flatten_list(nested_list: Iterable[Any]) -> List[Any]:
    """하위 호환성을 위한 함수"""
    return EnhancedListUtils.flatten_list(nested_list)

def remove_duplicates(items: Sequence[T], preserve_order: bool = True) -> List[T]:
    """하위 호환성을 위한 함수"""
    return EnhancedListUtils.remove_duplicates(items, preserve_order=preserve_order)

def filter_none(items: Sequence[Optional[T]]) -> List[T]:
    """하위 호환성을 위한 함수"""
    return EnhancedListUtils.filter_none(items)

def safe_get_nested(data: Mapping[str, Any], keys: List[str], default: Any = None) -> Any:
    """하위 호환성을 위한 함수"""
    return EnhancedDictUtils.safe_get_nested(data, keys, default)

def flatten_dict(data: Mapping[str, Any], separator: str = ".") -> Dict[str, Any]:
    """하위 호환성을 위한 함수"""
    return EnhancedDictUtils.flatten_dict(data, separator)

def filter_dict(data: Mapping[str, Any], keys: List[str]) -> Dict[str, Any]:
    """하위 호환성을 위한 함수"""
    return EnhancedDictUtils.filter_dict(data, keys=keys)

def exclude_dict_keys(data: Mapping[str, Any], keys: List[str]) -> Dict[str, Any]:
    """하위 호환성을 위한 함수"""
    return EnhancedDictUtils.exclude_dict_keys(data, keys)

def merge_dicts(*dicts: Mapping[str, Any]) -> Dict[str, Any]:
    """하위 호환성을 위한 함수"""
    return EnhancedDictUtils.merge_dicts(*dicts)


def example_usage():
    """통합 버전 사용 예제"""
    print("=== Enhanced Collection Utils - Unified Version Examples ===")
    
    # 1. 리스트 유틸리티 예제
    print("\n1. 리스트 유틸리티:")
    sample_list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    
    # 안전한 접근
    print(f"안전한 접근 (인덱스 15): {EnhancedListUtils.safe_get_item(sample_list, 15, 'default')}")
    
    # 청킹
    chunks = list(EnhancedListUtils.chunk_list(sample_list, 3))
    print(f"청킹 (크기 3): {chunks}")
    
    # 중복 제거
    duplicate_list = [1, 2, 2, 3, 3, 3, 4, 4, 5]
    unique_list = EnhancedListUtils.remove_duplicates(duplicate_list)
    print(f"중복 제거: {unique_list}")
    
    # 스트림 처리
    result = (EnhancedListUtils.stream(sample_list)
             .filter(lambda x: x % 2 == 0)
             .map(lambda x: x * 2)
             .collect())
    print(f"스트림 처리 (짝수 * 2): {result}")
    
    # 2. 딕셔너리 유틸리티 예제
    print("\n2. 딕셔너리 유틸리티:")
    sample_dict = {
        "user": {
            "name": "홍길동",
            "age": 30,
            "address": {
                "city": "서울",
                "district": "강남구"
            }
        },
        "settings": {
            "theme": "dark",
            "notifications": True
        }
    }
    
    # 중첩 접근
    name = EnhancedDictUtils.safe_get_nested(sample_dict, ["user", "name"])
    city = EnhancedDictUtils.safe_get_nested(sample_dict, "user.address.city")
    print(f"중첩 접근 - 이름: {name}, 도시: {city}")
    
    # 평면화
    flat_dict = EnhancedDictUtils.flatten_dict(sample_dict)
    print(f"평면화: {flat_dict}")
    
    # 랜덤 선택
    random_items = EnhancedDictUtils.pick_random(sample_dict, 1)
    print(f"랜덤 선택: {random_items}")
    
    # 3. 집합 유틸리티 예제
    print("\n3. 집합 유틸리티:")
    set1 = {1, 2, 3, 4, 5}
    set2 = {4, 5, 6, 7, 8}
    
    union_result = EnhancedSetUtils.safe_union(set1, set2)
    intersection_result = EnhancedSetUtils.safe_intersection(set1, set2)
    similarity = EnhancedSetUtils.jaccard_similarity(set1, set2)
    
    print(f"합집합: {union_result}")
    print(f"교집합: {intersection_result}")
    print(f"자카드 유사도: {similarity:.2f}")
    
    # 4. 함수형 프로그래밍 예제
    print("\n4. 함수형 프로그래밍:")
    
    # 커링
    @FunctionalUtils.curry
    def add_three_numbers(a, b, c):
        return a + b + c
    
    add_10 = add_three_numbers(10)
    add_10_20 = add_10(20)
    result = add_10_20(30)
    print(f"커링 결과 (10 + 20 + 30): {result}")
    
    # 함수 합성
    def multiply_by_2(x):
        return x * 2
    
    def add_1(x):
        return x + 1
    
    composed = FunctionalUtils.compose(multiply_by_2, add_1)
    print(f"함수 합성 결과 (5 + 1) * 2: {composed(5)}")
    
    # 파이프라인
    pipeline_result = FunctionalUtils.pipe(
        [1, 2, 3, 4, 5],
        lambda lst: [x * 2 for x in lst],
        lambda lst: [x for x in lst if x > 4],
        sum
    )
    print(f"파이프라인 결과: {pipeline_result}")
    
    # 5. 성능 최적화 예제
    print("\n5. 성능 최적화:")
    large_list = list(range(100))
    
    # 병렬 처리
    parallel_result = HighPerformanceOps.parallel_map(
        lambda x: x ** 2, 
        large_list[:10]  # 예제를 위해 작은 크기 사용
    )
    print(f"병렬 맵 결과 (처음 10개): {parallel_result}")
    
    # 6. 캐시 예제
    print("\n6. 캐시 시스템:")
    cache = CollectionCache(max_size=5, ttl=1.0)
    cache.set("key1", "value1")
    cache.set("key2", "value2")
    
    print(f"캐시에서 가져오기: {cache.get('key1')}")
    print(f"캐시 통계: {cache.stats()}")
    
    # 7. 분석 기능
    print("\n7. 컬렉션 분석:")
    
    # 기본 분석
    basic_analysis = CollectionAnalyzer.analyze_list_performance(large_list)
    print(f"기본 분석: {basic_analysis}")
    
    # 고급 분석
    advanced_analysis = AdvancedCollectionAnalyzer.analyze_collection(sample_dict)
    print(f"고급 분석: {advanced_analysis}")
    
    # 최적화 제안
    suggestions = AdvancedCollectionAnalyzer.suggest_optimizations(large_list)
    print(f"최적화 제안: {suggestions}")
    
    # 8. 지속성 관리
    print("\n8. 지속성 관리:")
    
    # JSON 저장/로드 예제 (파일 경로는 실제 환경에 맞게 조정)
    test_data = {"test": "data", "numbers": [1, 2, 3]}
    save_success = CollectionPersistence.save_to_json(test_data, "test_data.json")
    print(f"JSON 저장 성공: {save_success}")
    
    if save_success:
        loaded_data = CollectionPersistence.load_from_json("test_data.json")
        print(f"JSON 로드 결과: {loaded_data}")
    
    print("\n=== 통합 버전 예제 완료 ===")


if __name__ == "__main__":
    example_usage() 