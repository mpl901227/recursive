#!/usr/bin/env python3
"""
Enhanced Cache Management Utilities
고도화된 캐시 관리 유틸리티 - 다양한 캐시 전략, 분산 캐시, 메트릭 수집 지원
"""

import time
import threading
import asyncio
import json
import hashlib
import pickle
import logging
from typing import Any, Optional, Dict, Generic, TypeVar, Callable, List, Union, Tuple
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import weakref
from pathlib import Path
import redis
from pydantic import BaseModel, Field
import psutil


K = TypeVar('K')  # Key type
V = TypeVar('V')  # Value type

logger = logging.getLogger(__name__)


class CacheStrategy(Enum):
    """캐시 전략 열거형"""
    LRU = "lru"          # Least Recently Used
    LFU = "lfu"          # Least Frequently Used
    FIFO = "fifo"        # First In, First Out
    LIFO = "lifo"        # Last In, First Out
    ARC = "arc"          # Adaptive Replacement Cache
    TWO_Q = "2q"         # 2Q Algorithm


class EvictionReason(Enum):
    """퇴거 이유"""
    SIZE_LIMIT = "size_limit"
    TTL_EXPIRED = "ttl_expired"
    EXPLICIT_DELETE = "explicit_delete"
    MEMORY_PRESSURE = "memory_pressure"
    CACHE_CLEAR = "cache_clear"


@dataclass
class CacheEntry:
    """캐시 항목 데이터 클래스"""
    value: Any
    timestamp: float = field(default_factory=time.time)
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    size: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if self.size == 0:
            self.size = self._calculate_size()
    
    def _calculate_size(self) -> int:
        """객체 크기 계산"""
        try:
            return len(pickle.dumps(self.value))
        except Exception:
            return len(str(self.value).encode('utf-8'))
    
    def access(self):
        """접근 시 호출"""
        self.access_count += 1
        self.last_accessed = time.time()
    
    def is_expired(self, ttl: Optional[int]) -> bool:
        """TTL 만료 확인"""
        if ttl is None:
            return False
        return time.time() - self.timestamp > ttl


@dataclass
class CacheMetrics:
    """캐시 메트릭"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    writes: int = 0
    deletes: int = 0
    size: int = 0
    memory_usage: int = 0
    avg_access_time: float = 0.0
    hit_rate: float = 0.0
    eviction_reasons: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    
    def calculate_hit_rate(self):
        """적중률 계산"""
        total = self.hits + self.misses
        self.hit_rate = (self.hits / total * 100) if total > 0 else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        self.calculate_hit_rate()
        return {
            'hits': self.hits,
            'misses': self.misses,
            'evictions': self.evictions,
            'writes': self.writes,
            'deletes': self.deletes,
            'size': self.size,
            'memory_usage': self.memory_usage,
            'avg_access_time': self.avg_access_time,
            'hit_rate': round(self.hit_rate, 2),
            'eviction_reasons': dict(self.eviction_reasons)
        }


class CacheConfig(BaseModel):
    """캐시 설정"""
    max_size: int = Field(default=1000, ge=1)
    ttl: Optional[int] = Field(default=None, ge=1)
    strategy: CacheStrategy = CacheStrategy.LRU
    max_memory_mb: Optional[int] = Field(default=None, ge=1)
    cleanup_interval: int = Field(default=300, ge=10)  # 5분
    enable_metrics: bool = True
    enable_persistence: bool = False
    persistence_path: Optional[str] = None
    compression: bool = False
    
    class Config:
        use_enum_values = True


class BaseCacheStrategy(ABC, Generic[K, V]):
    """캐시 전략 기본 클래스"""
    
    def __init__(self, config: CacheConfig):
        self.config = config
        self.cache: Dict[K, CacheEntry] = {}
        self.metrics = CacheMetrics()
        self.lock = threading.RLock()
        self._access_times = []
    
    @abstractmethod
    def get(self, key: K) -> Optional[V]:
        """값 가져오기"""
        pass
    
    @abstractmethod
    def set(self, key: K, value: V) -> None:
        """값 설정"""
        pass
    
    @abstractmethod
    def _should_evict(self) -> bool:
        """퇴거 필요 여부 확인"""
        pass
    
    @abstractmethod
    def _select_eviction_candidate(self) -> Optional[K]:
        """퇴거 대상 선택"""
        pass
    
    def has(self, key: K) -> bool:
        """키 존재 확인"""
        with self.lock:
            if key not in self.cache:
                return False
            
            entry = self.cache[key]
            if entry.is_expired(self.config.ttl):
                self._evict_key(key, EvictionReason.TTL_EXPIRED)
                return False
            
            return True
    
    def delete(self, key: K) -> bool:
        """키 삭제"""
        with self.lock:
            if key in self.cache:
                self._evict_key(key, EvictionReason.EXPLICIT_DELETE)
                return True
            return False
    
    def clear(self) -> None:
        """캐시 전체 삭제"""
        with self.lock:
            self.cache.clear()
            self.metrics.eviction_reasons[EvictionReason.CACHE_CLEAR.value] += len(self.cache)
            self.metrics.size = 0
            self.metrics.memory_usage = 0
    
    def size(self) -> int:
        """캐시 크기"""
        return len(self.cache)
    
    def get_metrics(self) -> Dict[str, Any]:
        """메트릭 반환"""
        with self.lock:
            self.metrics.size = len(self.cache)
            self.metrics.memory_usage = sum(entry.size for entry in self.cache.values())
            
            if self._access_times:
                self.metrics.avg_access_time = sum(self._access_times) / len(self._access_times)
            
            return self.metrics.to_dict()
    
    def cleanup_expired(self) -> int:
        """만료된 항목 정리"""
        if not self.config.ttl:
            return 0
        
        with self.lock:
            expired_keys = []
            for key, entry in self.cache.items():
                if entry.is_expired(self.config.ttl):
                    expired_keys.append(key)
            
            for key in expired_keys:
                self._evict_key(key, EvictionReason.TTL_EXPIRED)
            
            return len(expired_keys)
    
    def _evict_key(self, key: K, reason: EvictionReason) -> None:
        """키 퇴거"""
        if key in self.cache:
            del self.cache[key]
            self.metrics.evictions += 1
            self.metrics.eviction_reasons[reason.value] += 1
    
    def _check_memory_pressure(self) -> bool:
        """메모리 압박 상황 확인"""
        if not self.config.max_memory_mb:
            return False
        
        current_memory = sum(entry.size for entry in self.cache.values())
        return current_memory > self.config.max_memory_mb * 1024 * 1024
    
    def _record_access_time(self, duration: float) -> None:
        """접근 시간 기록"""
        self._access_times.append(duration)
        if len(self._access_times) > 1000:  # 최근 1000개만 유지
            self._access_times = self._access_times[-1000:]


class LRUCacheStrategy(BaseCacheStrategy[K, V]):
    """LRU 캐시 전략"""
    
    def __init__(self, config: CacheConfig):
        super().__init__(config)
        self.access_order: OrderedDict[K, None] = OrderedDict()
    
    def get(self, key: K) -> Optional[V]:
        start_time = time.time()
        
        with self.lock:
            if key not in self.cache:
                self.metrics.misses += 1
                return None
            
            entry = self.cache[key]
            
            # TTL 확인
            if entry.is_expired(self.config.ttl):
                self._evict_key(key, EvictionReason.TTL_EXPIRED)
                self.metrics.misses += 1
                return None
            
            # LRU 업데이트
            self.access_order.move_to_end(key)
            entry.access()
            
            self.metrics.hits += 1
            self._record_access_time(time.time() - start_time)
            
            return entry.value
    
    def set(self, key: K, value: V) -> None:
        with self.lock:
            # 기존 키 업데이트
            if key in self.cache:
                self.cache[key] = CacheEntry(value)
                self.access_order.move_to_end(key)
                return
            
            # 용량 확인 및 퇴거
            while self._should_evict():
                evict_key = self._select_eviction_candidate()
                if evict_key:
                    self._evict_key(evict_key, EvictionReason.SIZE_LIMIT)
                else:
                    break
            
            # 새 항목 추가
            self.cache[key] = CacheEntry(value)
            self.access_order[key] = None
            self.metrics.writes += 1
    
    def _should_evict(self) -> bool:
        return (len(self.cache) >= self.config.max_size or 
                self._check_memory_pressure())
    
    def _select_eviction_candidate(self) -> Optional[K]:
        if not self.access_order:
            return None
        return next(iter(self.access_order))
    
    def _evict_key(self, key: K, reason: EvictionReason) -> None:
        super()._evict_key(key, reason)
        self.access_order.pop(key, None)


class LFUCacheStrategy(BaseCacheStrategy[K, V]):
    """LFU 캐시 전략"""
    
    def __init__(self, config: CacheConfig):
        super().__init__(config)
        self.frequency_map: Dict[int, List[K]] = defaultdict(list)
        self.key_frequency: Dict[K, int] = {}
        self.min_frequency = 0
    
    def get(self, key: K) -> Optional[V]:
        start_time = time.time()
        
        with self.lock:
            if key not in self.cache:
                self.metrics.misses += 1
                return None
            
            entry = self.cache[key]
            
            if entry.is_expired(self.config.ttl):
                self._evict_key(key, EvictionReason.TTL_EXPIRED)
                self.metrics.misses += 1
                return None
            
            # 빈도 업데이트
            self._update_frequency(key)
            entry.access()
            
            self.metrics.hits += 1
            self._record_access_time(time.time() - start_time)
            
            return entry.value
    
    def set(self, key: K, value: V) -> None:
        with self.lock:
            if key in self.cache:
                self.cache[key] = CacheEntry(value)
                self._update_frequency(key)
                return
            
            while self._should_evict():
                evict_key = self._select_eviction_candidate()
                if evict_key:
                    self._evict_key(evict_key, EvictionReason.SIZE_LIMIT)
                else:
                    break
            
            self.cache[key] = CacheEntry(value)
            self.key_frequency[key] = 1
            self.frequency_map[1].append(key)
            self.min_frequency = 1
            self.metrics.writes += 1
    
    def _should_evict(self) -> bool:
        return (len(self.cache) >= self.config.max_size or 
                self._check_memory_pressure())
    
    def _select_eviction_candidate(self) -> Optional[K]:
        if not self.frequency_map[self.min_frequency]:
            return None
        return self.frequency_map[self.min_frequency][0]
    
    def _update_frequency(self, key: K) -> None:
        """키의 빈도 업데이트"""
        old_freq = self.key_frequency[key]
        new_freq = old_freq + 1
        
        # 이전 빈도에서 제거
        self.frequency_map[old_freq].remove(key)
        if not self.frequency_map[old_freq] and old_freq == self.min_frequency:
            self.min_frequency += 1
        
        # 새 빈도에 추가
        self.key_frequency[key] = new_freq
        self.frequency_map[new_freq].append(key)
    
    def _evict_key(self, key: K, reason: EvictionReason) -> None:
        if key in self.cache:
            freq = self.key_frequency[key]
            self.frequency_map[freq].remove(key)
            del self.key_frequency[key]
        super()._evict_key(key, reason)


class AdaptiveCache(Generic[K, V]):
    """적응형 캐시 - 사용 패턴에 따라 전략 변경"""
    
    def __init__(self, config: CacheConfig):
        self.config = config
        self.current_strategy = self._create_strategy(config.strategy)
        self.strategy_performance: Dict[CacheStrategy, float] = {}
        self.evaluation_window = 1000
        self.request_count = 0
        self.lock = threading.RLock()
    
    def _create_strategy(self, strategy: CacheStrategy) -> BaseCacheStrategy:
        """전략 생성"""
        if strategy == CacheStrategy.LRU:
            return LRUCacheStrategy(self.config)
        elif strategy == CacheStrategy.LFU:
            return LFUCacheStrategy(self.config)
        else:
            return LRUCacheStrategy(self.config)  # 기본값
    
    def get(self, key: K) -> Optional[V]:
        with self.lock:
            result = self.current_strategy.get(key)
            self.request_count += 1
            
            # 주기적으로 성능 평가
            if self.request_count % self.evaluation_window == 0:
                self._evaluate_and_adapt()
            
            return result
    
    def set(self, key: K, value: V) -> None:
        with self.lock:
            self.current_strategy.set(key, value)
    
    def _evaluate_and_adapt(self) -> None:
        """성능 평가 및 전략 적응"""
        current_metrics = self.current_strategy.get_metrics()
        current_hit_rate = current_metrics['hit_rate']
        
        # 현재 전략 성능 기록
        self.strategy_performance[self.config.strategy] = current_hit_rate
        
        # 다른 전략과 비교 (간단한 휴리스틱)
        if current_hit_rate < 70:  # 70% 미만이면 전략 변경 고려
            if self.config.strategy == CacheStrategy.LRU:
                self._switch_strategy(CacheStrategy.LFU)
            elif self.config.strategy == CacheStrategy.LFU:
                self._switch_strategy(CacheStrategy.LRU)
    
    def _switch_strategy(self, new_strategy: CacheStrategy) -> None:
        """전략 변경"""
        old_cache_data = dict(self.current_strategy.cache)
        self.config.strategy = new_strategy
        self.current_strategy = self._create_strategy(new_strategy)
        
        # 데이터 마이그레이션
        for key, entry in old_cache_data.items():
            self.current_strategy.set(key, entry.value)
        
        logger.info(f"Cache strategy switched to {new_strategy.value}")
    
    def get_metrics(self) -> Dict[str, Any]:
        return self.current_strategy.get_metrics()
    
    def __getattr__(self, name):
        """다른 메서드들을 현재 전략에 위임"""
        return getattr(self.current_strategy, name)


class DistributedCache:
    """분산 캐시 (Redis 기반)"""
    
    def __init__(self, config: CacheConfig, redis_config: Dict[str, Any]):
        self.config = config
        self.redis_client = redis.Redis(**redis_config)
        self.local_cache = LRUCacheStrategy(config)
        self.metrics = CacheMetrics()
        self.lock = threading.RLock()
    
    def get(self, key: K) -> Optional[V]:
        start_time = time.time()
        
        with self.lock:
            # 로컬 캐시 먼저 확인
            local_result = self.local_cache.get(key)
            if local_result is not None:
                self.metrics.hits += 1
                self._record_access_time(time.time() - start_time)
                return local_result
            
            # Redis에서 확인
            try:
                redis_key = self._serialize_key(key)
                redis_value = self.redis_client.get(redis_key)
                
                if redis_value:
                    value = pickle.loads(redis_value)
                    # 로컬 캐시에도 저장
                    self.local_cache.set(key, value)
                    self.metrics.hits += 1
                    self._record_access_time(time.time() - start_time)
                    return value
                    
            except Exception as e:
                logger.error(f"Redis get error: {e}")
            
            self.metrics.misses += 1
            return None
    
    def set(self, key: K, value: V) -> None:
        with self.lock:
            try:
                # Redis에 저장
                redis_key = self._serialize_key(key)
                redis_value = pickle.dumps(value)
                
                if self.config.ttl:
                    self.redis_client.setex(redis_key, self.config.ttl, redis_value)
                else:
                    self.redis_client.set(redis_key, redis_value)
                
                # 로컬 캐시에도 저장
                self.local_cache.set(key, value)
                self.metrics.writes += 1
                
            except Exception as e:
                logger.error(f"Redis set error: {e}")
                # Redis 실패 시 로컬 캐시만 사용
                self.local_cache.set(key, value)
    
    def _serialize_key(self, key: K) -> str:
        """키 직렬화"""
        if isinstance(key, str):
            return key
        return hashlib.md5(str(key).encode()).hexdigest()
    
    def _record_access_time(self, duration: float) -> None:
        """접근 시간 기록"""
        # 간단한 구현
        pass


class CacheManager:
    """고도화된 캐시 매니저"""
    
    def __init__(self):
        self.caches: Dict[str, Union[BaseCacheStrategy, AdaptiveCache, DistributedCache]] = {}
        self.cleanup_tasks: Dict[str, threading.Timer] = {}
        self.metrics_collectors: Dict[str, Callable] = {}
        self.logger = logging.getLogger(__name__)
        
        # 기본 캐시들 생성
        self._create_default_caches()
        
        # 백그라운드 정리 작업 시작
        self._start_cleanup_tasks()
    
    def _create_default_caches(self) -> None:
        """기본 캐시들 생성"""
        configs = {
            'file': CacheConfig(max_size=500, ttl=3600, strategy=CacheStrategy.LRU),
            'function': CacheConfig(max_size=200, ttl=1800, strategy=CacheStrategy.LFU),
            'dependency': CacheConfig(max_size=100, ttl=3600, strategy=CacheStrategy.LRU),
            'result': CacheConfig(max_size=100, ttl=600, strategy=CacheStrategy.LRU),
            'adaptive': CacheConfig(max_size=1000, ttl=3600, strategy=CacheStrategy.LRU)
        }
        
        for name, config in configs.items():
            if name == 'adaptive':
                self.caches[name] = AdaptiveCache(config)
            else:
                self.caches[name] = LRUCacheStrategy(config)
    
    def create_cache(self, name: str, config: CacheConfig, 
                    cache_type: str = 'lru') -> Union[BaseCacheStrategy, AdaptiveCache]:
        """새 캐시 생성"""
        if cache_type == 'adaptive':
            cache = AdaptiveCache(config)
        elif cache_type == 'lfu':
            cache = LFUCacheStrategy(config)
        else:
            cache = LRUCacheStrategy(config)
        
        self.caches[name] = cache
        self._start_cleanup_task(name)
        return cache
    
    def create_distributed_cache(self, name: str, config: CacheConfig, 
                               redis_config: Dict[str, Any]) -> DistributedCache:
        """분산 캐시 생성"""
        cache = DistributedCache(config, redis_config)
        self.caches[name] = cache
        return cache
    
    def get_cache(self, name: str) -> Optional[Union[BaseCacheStrategy, AdaptiveCache, DistributedCache]]:
        """캐시 인스턴스 가져오기"""
        return self.caches.get(name)
    
    def _start_cleanup_tasks(self) -> None:
        """정리 작업 시작"""
        for name in self.caches:
            self._start_cleanup_task(name)
    
    def _start_cleanup_task(self, cache_name: str) -> None:
        """개별 캐시 정리 작업 시작"""
        def cleanup():
            cache = self.caches.get(cache_name)
            if cache and hasattr(cache, 'cleanup_expired'):
                try:
                    expired_count = cache.cleanup_expired()
                    if expired_count > 0:
                        self.logger.debug(f"Cleaned up {expired_count} expired items from {cache_name}")
                except Exception as e:
                    self.logger.error(f"Cleanup error for {cache_name}: {e}")
            
            # 다음 정리 작업 예약
            if cache_name in self.caches:
                config = getattr(cache, 'config', None)
                interval = config.cleanup_interval if config else 300
                self.cleanup_tasks[cache_name] = threading.Timer(interval, cleanup)
                self.cleanup_tasks[cache_name].start()
        
        # 첫 번째 정리 작업 시작
        cache = self.caches.get(cache_name)
        if cache:
            config = getattr(cache, 'config', None)
            interval = config.cleanup_interval if config else 300
            self.cleanup_tasks[cache_name] = threading.Timer(interval, cleanup)
            self.cleanup_tasks[cache_name].start()
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """모든 캐시 메트릭 수집"""
        metrics = {}
        for name, cache in self.caches.items():
            try:
                metrics[name] = cache.get_metrics()
            except Exception as e:
                self.logger.error(f"Failed to get metrics for {name}: {e}")
                metrics[name] = {'error': str(e)}
        return metrics
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """시스템 메트릭 수집"""
        try:
            memory_info = psutil.virtual_memory()
            return {
                'system_memory_total': memory_info.total,
                'system_memory_available': memory_info.available,
                'system_memory_percent': memory_info.percent,
                'cache_count': len(self.caches),
                'total_cache_size': sum(cache.size() for cache in self.caches.values() if hasattr(cache, 'size'))
            }
        except Exception as e:
            self.logger.error(f"Failed to get system metrics: {e}")
            return {'error': str(e)}
    
    def optimize_all_caches(self) -> Dict[str, Any]:
        """모든 캐시 최적화"""
        results = {}
        for name, cache in self.caches.items():
            try:
                if hasattr(cache, 'cleanup_expired'):
                    expired = cache.cleanup_expired()
                    results[name] = {'expired_cleaned': expired}
                else:
                    results[name] = {'status': 'no_cleanup_needed'}
            except Exception as e:
                results[name] = {'error': str(e)}
        return results
    
    def shutdown(self) -> None:
        """캐시 매니저 종료"""
        # 정리 작업 중지
        for timer in self.cleanup_tasks.values():
            timer.cancel()
        
        # 캐시 데이터 정리
        for cache in self.caches.values():
            if hasattr(cache, 'clear'):
                cache.clear()
        
        self.logger.info("Cache manager shutdown completed")


class CacheDecorator:
    """고도화된 캐시 데코레이터"""
    
    def __init__(self, cache: BaseCacheStrategy, 
                 key_func: Optional[Callable] = None,
                 condition: Optional[Callable] = None,
                 unless: Optional[Callable] = None):
        self.cache = cache
        self.key_func = key_func or self._default_key_func
        self.condition = condition
        self.unless = unless
    
    def _default_key_func(self, *args, **kwargs) -> str:
        """기본 키 생성 함수"""
        key_parts = []
        key_parts.extend(str(arg) for arg in args)
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
        return hashlib.md5("|".join(key_parts).encode()).hexdigest()
    
    def __call__(self, func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            # 조건 확인
            if self.condition and not self.condition(*args, **kwargs):
                return func(*args, **kwargs)
            
            # 캐시 키 생성
            cache_key = self.key_func(*args, **kwargs)
            
            # 캐시에서 결과 확인
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                # unless 조건 확인
                if self.unless and self.unless(cached_result):
                    result = func(*args, **kwargs)
                    self.cache.set(cache_key, result)
                    return result
                return cached_result
            
            # 함수 실행 및 결과 캐싱
            result = func(*args, **kwargs)
            
            # unless 조건 확인
            if not (self.unless and self.unless(result)):
                self.cache.set(cache_key, result)
            
            return result
        
        wrapper._cache = self.cache  # 캐시 인스턴스 참조 저장
        return wrapper


# 전역 캐시 매니저
_global_cache_manager = None

def get_cache_manager() -> CacheManager:
    """전역 캐시 매니저 반환"""
    global _global_cache_manager
    if _global_cache_manager is None:
        _global_cache_manager = CacheManager()
    return _global_cache_manager


# 편의 함수들
def get_cache(name: str) -> Optional[BaseCacheStrategy]:
    """캐시 인스턴스 반환"""
    return get_cache_manager().get_cache(name)

def create_lru_cache(max_size: int = 1000, ttl: Optional[int] = None) -> LRUCacheStrategy:
    """LRU 캐시 생성"""
    config = CacheConfig(max_size=max_size, ttl=ttl, strategy=CacheStrategy.LRU)
    return LRUCacheStrategy(config)

def create_lfu_cache(max_size: int = 1000, ttl: Optional[int] = None) -> LFUCacheStrategy:
    """LFU 캐시 생성"""
    config = CacheConfig(max_size=max_size, ttl=ttl, strategy=CacheStrategy.LFU)
    return LFUCacheStrategy(config)

def create_adaptive_cache(max_size: int = 1000, ttl: Optional[int] = None) -> AdaptiveCache:
    """적응형 캐시 생성"""
    config = CacheConfig(max_size=max_size, ttl=ttl, strategy=CacheStrategy.LRU)
    return AdaptiveCache(config)

def cache_result(cache_name: str = 'result', 
                key_func: Optional[Callable] = None,
                condition: Optional[Callable] = None,
                unless: Optional[Callable] = None):
    """결과 캐싱 데코레이터"""
    cache = get_cache(cache_name)
    if not cache:
        # 기본 캐시 생성
        cache = create_lru_cache()
        get_cache_manager().caches[cache_name] = cache
    
    return CacheDecorator(cache, key_func, condition, unless)

def memoize(max_size: int = 128, ttl: Optional[int] = None):
    """함수 결과 메모이제이션 데코레이터"""
    cache = create_lru_cache(max_size, ttl)
    return CacheDecorator(cache)

def timed_cache(ttl: int):
    """시간 기반 캐시 데코레이터"""
    cache = create_lru_cache(ttl=ttl)
    return CacheDecorator(cache)


class CacheWarming:
    """캐시 워밍 기능"""
    
    def __init__(self, cache_manager: CacheManager):
        self.cache_manager = cache_manager
        self.warming_tasks: Dict[str, threading.Thread] = {}
        self.logger = logging.getLogger(__name__)
    
    def warm_cache(self, cache_name: str, data_loader: Callable, 
                   keys: List[Any], batch_size: int = 10) -> Dict[str, Any]:
        """캐시 워밍 실행"""
        cache = self.cache_manager.get_cache(cache_name)
        if not cache:
            return {'error': f'Cache {cache_name} not found'}
        
        results = {'loaded': 0, 'errors': 0, 'skipped': 0}
        
        def warm_batch(batch_keys):
            for key in batch_keys:
                try:
                    # 이미 캐시에 있으면 스킵
                    if cache.has(key):
                        results['skipped'] += 1
                        continue
                    
                    # 데이터 로드 및 캐시 저장
                    value = data_loader(key)
                    if value is not None:
                        cache.set(key, value)
                        results['loaded'] += 1
                    
                except Exception as e:
                    self.logger.error(f"Cache warming error for key {key}: {e}")
                    results['errors'] += 1
        
        # 배치 단위로 처리
        for i in range(0, len(keys), batch_size):
            batch = keys[i:i + batch_size]
            warm_batch(batch)
        
        return results
    
    def schedule_warming(self, cache_name: str, data_loader: Callable,
                        keys: List[Any], interval: int = 3600) -> str:
        """주기적 캐시 워밍 스케줄링"""
        task_id = f"{cache_name}_warming_{int(time.time())}"
        
        def warming_task():
            while task_id in self.warming_tasks:
                try:
                    self.warm_cache(cache_name, data_loader, keys)
                    self.logger.info(f"Cache warming completed for {cache_name}")
                except Exception as e:
                    self.logger.error(f"Cache warming failed for {cache_name}: {e}")
                
                time.sleep(interval)
        
        thread = threading.Thread(target=warming_task, name=f"CacheWarming-{task_id}")
        thread.daemon = True
        self.warming_tasks[task_id] = thread
        thread.start()
        
        return task_id
    
    def stop_warming(self, task_id: str) -> bool:
        """캐시 워밍 중지"""
        if task_id in self.warming_tasks:
            del self.warming_tasks[task_id]
            return True
        return False


class CachePersistence:
    """캐시 영속성 관리"""
    
    def __init__(self, base_path: str = "./cache_data"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True, parents=True)
        self.logger = logging.getLogger(__name__)
    
    def save_cache(self, cache_name: str, cache: BaseCacheStrategy) -> bool:
        """캐시를 파일에 저장"""
        try:
            cache_file = self.base_path / f"{cache_name}.cache"
            
            cache_data = {
                'metadata': {
                    'cache_name': cache_name,
                    'timestamp': time.time(),
                    'size': cache.size(),
                    'config': cache.config.dict() if hasattr(cache.config, 'dict') else {}
                },
                'entries': {}
            }
            
            # 캐시 항목들 직렬화
            with cache.lock:
                for key, entry in cache.cache.items():
                    try:
                        cache_data['entries'][str(key)] = {
                            'value': entry.value,
                            'timestamp': entry.timestamp,
                            'access_count': entry.access_count,
                            'last_accessed': entry.last_accessed,
                            'metadata': entry.metadata
                        }
                    except Exception as e:
                        self.logger.warning(f"Failed to serialize cache entry {key}: {e}")
            
            # 파일에 저장
            with open(cache_file, 'wb') as f:
                pickle.dump(cache_data, f)
            
            self.logger.info(f"Cache {cache_name} saved to {cache_file}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to save cache {cache_name}: {e}")
            return False
    
    def load_cache(self, cache_name: str, cache: BaseCacheStrategy) -> bool:
        """파일에서 캐시 로드"""
        try:
            cache_file = self.base_path / f"{cache_name}.cache"
            
            if not cache_file.exists():
                return False
            
            with open(cache_file, 'rb') as f:
                cache_data = pickle.load(f)
            
            # 메타데이터 검증
            metadata = cache_data.get('metadata', {})
            saved_time = metadata.get('timestamp', 0)
            
            # 너무 오래된 캐시는 로드하지 않음 (기본 7일)
            if time.time() - saved_time > 7 * 24 * 3600:
                self.logger.info(f"Cache {cache_name} is too old, skipping load")
                return False
            
            # 캐시 항목들 복원
            loaded_count = 0
            with cache.lock:
                for key_str, entry_data in cache_data.get('entries', {}).items():
                    try:
                        # TTL 확인
                        if cache.config.ttl:
                            if time.time() - entry_data['timestamp'] > cache.config.ttl:
                                continue
                        
                        # 캐시 항목 복원
                        entry = CacheEntry(
                            value=entry_data['value'],
                            timestamp=entry_data['timestamp'],
                            access_count=entry_data.get('access_count', 0),
                            last_accessed=entry_data.get('last_accessed', entry_data['timestamp']),
                            metadata=entry_data.get('metadata', {})
                        )
                        
                        # 키 타입 추론 및 설정
                        try:
                            # 숫자 키 시도
                            if key_str.isdigit():
                                key = int(key_str)
                            else:
                                key = key_str
                        except:
                            key = key_str
                        
                        cache.cache[key] = entry
                        loaded_count += 1
                        
                    except Exception as e:
                        self.logger.warning(f"Failed to restore cache entry {key_str}: {e}")
            
            self.logger.info(f"Cache {cache_name} loaded: {loaded_count} entries")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to load cache {cache_name}: {e}")
            return False
    
    def cleanup_old_files(self, max_age_days: int = 7) -> int:
        """오래된 캐시 파일 정리"""
        cleaned = 0
        cutoff_time = time.time() - (max_age_days * 24 * 3600)
        
        for cache_file in self.base_path.glob("*.cache"):
            try:
                if cache_file.stat().st_mtime < cutoff_time:
                    cache_file.unlink()
                    cleaned += 1
                    self.logger.info(f"Cleaned up old cache file: {cache_file}")
            except Exception as e:
                self.logger.error(f"Failed to cleanup {cache_file}: {e}")
        
        return cleaned


class CacheMonitor:
    """캐시 모니터링 및 알림"""
    
    def __init__(self, cache_manager: CacheManager):
        self.cache_manager = cache_manager
        self.thresholds = {
            'hit_rate_low': 50.0,      # 50% 미만
            'memory_usage_high': 80.0,  # 80% 이상
            'eviction_rate_high': 10.0  # 10% 이상
        }
        self.alerts: List[Dict[str, Any]] = []
        self.logger = logging.getLogger(__name__)
    
    def check_health(self) -> Dict[str, Any]:
        """캐시 건강 상태 확인"""
        health_report = {
            'overall_status': 'healthy',
            'cache_status': {},
            'system_status': {},
            'alerts': [],
            'recommendations': []
        }
        
        try:
            # 시스템 메트릭 확인
            system_metrics = self.cache_manager.get_system_metrics()
            health_report['system_status'] = system_metrics
            
            # 개별 캐시 상태 확인
            all_metrics = self.cache_manager.get_all_metrics()
            
            for cache_name, metrics in all_metrics.items():
                if 'error' in metrics:
                    health_report['cache_status'][cache_name] = 'error'
                    health_report['alerts'].append({
                        'type': 'error',
                        'cache': cache_name,
                        'message': metrics['error']
                    })
                    health_report['overall_status'] = 'degraded'
                    continue
                
                cache_status = self._analyze_cache_metrics(cache_name, metrics)
                health_report['cache_status'][cache_name] = cache_status['status']
                health_report['alerts'].extend(cache_status['alerts'])
                health_report['recommendations'].extend(cache_status['recommendations'])
                
                if cache_status['status'] != 'healthy':
                    health_report['overall_status'] = 'degraded'
            
            return health_report
            
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return {
                'overall_status': 'error',
                'error': str(e)
            }
    
    def _analyze_cache_metrics(self, cache_name: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """개별 캐시 메트릭 분석"""
        status = 'healthy'
        alerts = []
        recommendations = []
        
        # Hit Rate 확인
        hit_rate = metrics.get('hit_rate', 0)
        if hit_rate < self.thresholds['hit_rate_low']:
            status = 'warning'
            alerts.append({
                'type': 'warning',
                'cache': cache_name,
                'metric': 'hit_rate',
                'value': hit_rate,
                'threshold': self.thresholds['hit_rate_low'],
                'message': f'Low hit rate: {hit_rate}%'
            })
            recommendations.append(f'{cache_name}: Consider increasing cache size or TTL')
        
        # Memory Usage 확인
        memory_usage = metrics.get('memory_usage', 0)
        if memory_usage > 0:
            # 시스템 메모리와 비교하여 사용률 계산
            system_metrics = self.cache_manager.get_system_metrics()
            total_memory = system_metrics.get('system_memory_total', 1)
            usage_percent = (memory_usage / total_memory) * 100
            
            if usage_percent > self.thresholds['memory_usage_high']:
                status = 'warning'
                alerts.append({
                    'type': 'warning',
                    'cache': cache_name,
                    'metric': 'memory_usage',
                    'value': usage_percent,
                    'threshold': self.thresholds['memory_usage_high'],
                    'message': f'High memory usage: {usage_percent:.1f}%'
                })
                recommendations.append(f'{cache_name}: Consider reducing cache size or implementing LRU eviction')
        
        # Eviction Rate 확인
        total_operations = metrics.get('hits', 0) + metrics.get('misses', 0) + metrics.get('writes', 0)
        if total_operations > 0:
            eviction_rate = (metrics.get('evictions', 0) / total_operations) * 100
            if eviction_rate > self.thresholds['eviction_rate_high']:
                status = 'warning'
                alerts.append({
                    'type': 'warning',
                    'cache': cache_name,
                    'metric': 'eviction_rate',
                    'value': eviction_rate,
                    'threshold': self.thresholds['eviction_rate_high'],
                    'message': f'High eviction rate: {eviction_rate:.1f}%'
                })
                recommendations.append(f'{cache_name}: Cache size may be too small for the workload')
        
        return {
            'status': status,
            'alerts': alerts,
            'recommendations': recommendations
        }
    
    def get_performance_report(self, time_window: int = 3600) -> Dict[str, Any]:
        """성능 리포트 생성"""
        try:
            all_metrics = self.cache_manager.get_all_metrics()
            system_metrics = self.cache_manager.get_system_metrics()
            
            report = {
                'timestamp': time.time(),
                'time_window_seconds': time_window,
                'summary': {
                    'total_caches': len(all_metrics),
                    'total_cache_size': sum(m.get('size', 0) for m in all_metrics.values()),
                    'total_memory_usage': sum(m.get('memory_usage', 0) for m in all_metrics.values()),
                    'average_hit_rate': 0,
                    'total_operations': 0
                },
                'cache_details': all_metrics,
                'system_info': system_metrics,
                'top_performers': [],
                'improvement_opportunities': []
            }
            
            # 평균 hit rate 계산
            valid_caches = [m for m in all_metrics.values() if 'hit_rate' in m]
            if valid_caches:
                report['summary']['average_hit_rate'] = sum(m['hit_rate'] for m in valid_caches) / len(valid_caches)
            
            # 총 작업 수 계산
            report['summary']['total_operations'] = sum(
                m.get('hits', 0) + m.get('misses', 0) + m.get('writes', 0)
                for m in all_metrics.values()
            )
            
            # 성능 순위
            sorted_caches = sorted(
                [(name, metrics) for name, metrics in all_metrics.items() if 'hit_rate' in metrics],
                key=lambda x: x[1]['hit_rate'],
                reverse=True
            )
            report['top_performers'] = sorted_caches[:3]
            
            # 개선 기회
            low_performers = [
                (name, metrics) for name, metrics in sorted_caches
                if metrics['hit_rate'] < 70
            ]
            report['improvement_opportunities'] = low_performers
            
            return report
            
        except Exception as e:
            self.logger.error(f"Failed to generate performance report: {e}")
            return {'error': str(e)}


# 고급 편의 함수들
def setup_distributed_cache(redis_host: str = 'localhost', redis_port: int = 6379,
                           redis_db: int = 0, redis_password: Optional[str] = None) -> str:
    """분산 캐시 설정"""
    redis_config = {
        'host': redis_host,
        'port': redis_port,
        'db': redis_db,
        'decode_responses': False
    }
    if redis_password:
        redis_config['password'] = redis_password
    
    cache_config = CacheConfig(max_size=1000, ttl=3600)
    cache_name = 'distributed_default'
    
    cache_manager = get_cache_manager()
    cache_manager.create_distributed_cache(cache_name, cache_config, redis_config)
    
    return cache_name

def enable_cache_persistence(cache_names: List[str] = None, 
                           base_path: str = "./cache_data") -> CachePersistence:
    """캐시 영속성 활성화"""
    persistence = CachePersistence(base_path)
    cache_manager = get_cache_manager()
    
    if cache_names is None:
        cache_names = list(cache_manager.caches.keys())
    
    # 기존 캐시 로드
    for name in cache_names:
        cache = cache_manager.get_cache(name)
        if cache:
            persistence.load_cache(name, cache)
    
    # 주기적 저장 설정 (예: 매 5분마다)
    def save_periodically():
        while True:
            time.sleep(300)  # 5분
            for name in cache_names:
                cache = cache_manager.get_cache(name)
                if cache:
                    persistence.save_cache(name, cache)
    
    thread = threading.Thread(target=save_periodically, daemon=True)
    thread.start()
    
    return persistence

def monitor_caches() -> CacheMonitor:
    """캐시 모니터링 시작"""
    cache_manager = get_cache_manager()
    monitor = CacheMonitor(cache_manager)
    return monitor


# 모듈 초기화 시 기본 설정
def initialize_enhanced_cache():
    """고도화된 캐시 시스템 초기화"""
    cache_manager = get_cache_manager()
    
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger.info("Enhanced cache system initialized")
    return cache_manager


# 자동 초기화
_cache_manager = initialize_enhanced_cache()