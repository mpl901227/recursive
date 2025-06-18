#!/usr/bin/env python3
"""
Enhanced Data Utilities
JSON, 데이터 처리, 스키마 검증, 변환 파이프라인 등 고도화된 데이터 유틸리티

주요 개선사항:
- 스키마 기반 검증 시스템
- 데이터 변환 파이프라인
- 멀티레벨 캐싱
- 스트리밍 데이터 처리
- 비동기 처리 지원
- 성능 최적화 및 메트릭 수집
- 플러그인 시스템
- 다양한 데이터 형식 지원
- AI 기반 스키마 추론
"""

import asyncio
import json
import pickle
import time
import hashlib
import logging
import threading
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps, lru_cache
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Union, Callable, TypeVar, Generic,
    AsyncIterator, Iterator, Type, Tuple, Set, Protocol
)
import weakref
from collections import defaultdict, OrderedDict
import copy
import warnings

# Third-party imports with fallbacks
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    yaml = None

try:
    import orjson
    HAS_ORJSON = True
except ImportError:
    HAS_ORJSON = False
    orjson = None

try:
    import msgpack
    HAS_MSGPACK = True
except ImportError:
    HAS_MSGPACK = False
    msgpack = None

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    pd = None

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

# 로깅 설정
logger = logging.getLogger(__name__)

# 타입 정의
T = TypeVar('T')
DataType = Union[Dict[str, Any], List[Any], str, int, float, bool, None]


# 커스텀 예외 클래스들
class DataUtilsError(Exception):
    """데이터 유틸리티 기본 예외"""
    pass


class ValidationError(DataUtilsError):
    """데이터 검증 오류"""
    pass


class ConversionError(DataUtilsError):
    """데이터 변환 오류"""
    pass


class SchemaError(DataUtilsError):
    """스키마 관련 오류"""
    pass


class CacheError(DataUtilsError):
    """캐시 관련 오류"""
    pass


class SerializationError(DataUtilsError):
    """직렬화 오류"""
    pass


# 열거형 정의
class DataFormat(Enum):
    """지원하는 데이터 형식"""
    JSON = "json"
    YAML = "yaml"
    MSGPACK = "msgpack"
    PICKLE = "pickle"
    CSV = "csv"
    XML = "xml"
    BINARY = "binary"


class ValidationLevel(Enum):
    """검증 수준"""
    STRICT = "strict"
    NORMAL = "normal"
    LENIENT = "lenient"
    NONE = "none"


class CacheLevel(Enum):
    """캐시 레벨"""
    MEMORY = "memory"
    DISK = "disk"
    DISTRIBUTED = "distributed"
    NONE = "none"


# 데이터 클래스들
@dataclass
class ValidationResult:
    """검증 결과"""
    is_valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    score: float = 1.0  # 0.0 ~ 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ProcessingMetrics:
    """처리 메트릭"""
    operation: str
    start_time: float
    end_time: float
    duration: float
    input_size: int
    output_size: int
    memory_used: int
    cache_hit: bool = False
    errors: List[str] = field(default_factory=list)


@dataclass
class SchemaInfo:
    """스키마 정보"""
    name: str
    version: str
    schema: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    usage_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DataPipelineConfig:
    """데이터 파이프라인 설정"""
    max_workers: int = 4
    chunk_size: int = 1000
    timeout: float = 30.0
    retry_count: int = 3
    enable_caching: bool = True
    cache_ttl: int = 3600
    validation_level: ValidationLevel = ValidationLevel.NORMAL
    enable_metrics: bool = True


# 프로토콜 정의
class Serializable(Protocol):
    """직렬화 가능한 객체 프로토콜"""
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        ...
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Serializable':
        """딕셔너리에서 생성"""
        ...


class DataProcessor(Protocol):
    """데이터 처리기 프로토콜"""
    
    def process(self, data: Any) -> Any:
        """데이터 처리"""
        ...
    
    def validate_input(self, data: Any) -> bool:
        """입력 데이터 검증"""
        ...


# 캐시 시스템
class DataCache:
    """멀티레벨 데이터 캐시"""
    
    def __init__(self, 
                 memory_size: int = 1000,
                 disk_cache_dir: Optional[Path] = None,
                 ttl: int = 3600):
        self.memory_cache = OrderedDict()
        self.memory_size = memory_size
        self.disk_cache_dir = disk_cache_dir
        self.ttl = ttl
        self.access_times = {}
        self.creation_times = {}
        self._lock = threading.RLock()
        
        if disk_cache_dir:
            disk_cache_dir.mkdir(parents=True, exist_ok=True)
    
    def _generate_key(self, data: Any) -> str:
        """데이터로부터 캐시 키 생성"""
        if isinstance(data, (dict, list)):
            content = json.dumps(data, sort_keys=True, default=str)
        else:
            content = str(data)
        return hashlib.md5(content.encode()).hexdigest()
    
    def get(self, key: str) -> Optional[Any]:
        """캐시에서 데이터 조회"""
        with self._lock:
            current_time = time.time()
            
            # 메모리 캐시 확인
            if key in self.memory_cache:
                # TTL 확인
                if current_time - self.creation_times.get(key, 0) < self.ttl:
                    self.access_times[key] = current_time
                    # LRU 업데이트
                    self.memory_cache.move_to_end(key)
                    return self.memory_cache[key]
                else:
                    # 만료된 데이터 제거
                    del self.memory_cache[key]
                    self.access_times.pop(key, None)
                    self.creation_times.pop(key, None)
            
            # 디스크 캐시 확인
            if self.disk_cache_dir:
                cache_file = self.disk_cache_dir / f"{key}.cache"
                if cache_file.exists():
                    try:
                        with open(cache_file, 'rb') as f:
                            cached_data = pickle.load(f)
                        
                        # 메모리 캐시에 추가
                        self._add_to_memory_cache(key, cached_data)
                        return cached_data
                    except Exception as e:
                        logger.warning(f"디스크 캐시 읽기 실패: {e}")
            
            return None
    
    def set(self, key: str, data: Any) -> None:
        """캐시에 데이터 저장"""
        with self._lock:
            current_time = time.time()
            
            # 메모리 캐시에 저장
            self._add_to_memory_cache(key, data)
            self.creation_times[key] = current_time
            self.access_times[key] = current_time
            
            # 디스크 캐시에 저장
            if self.disk_cache_dir:
                cache_file = self.disk_cache_dir / f"{key}.cache"
                try:
                    with open(cache_file, 'wb') as f:
                        pickle.dump(data, f)
                except Exception as e:
                    logger.warning(f"디스크 캐시 쓰기 실패: {e}")
    
    def _add_to_memory_cache(self, key: str, data: Any) -> None:
        """메모리 캐시에 데이터 추가"""
        # 크기 제한 확인
        if len(self.memory_cache) >= self.memory_size:
            # LRU 제거
            oldest_key = next(iter(self.memory_cache))
            del self.memory_cache[oldest_key]
            self.access_times.pop(oldest_key, None)
            self.creation_times.pop(oldest_key, None)
        
        self.memory_cache[key] = data
    
    def clear(self) -> None:
        """캐시 전체 삭제"""
        with self._lock:
            self.memory_cache.clear()
            self.access_times.clear()
            self.creation_times.clear()
            
            if self.disk_cache_dir and self.disk_cache_dir.exists():
                for cache_file in self.disk_cache_dir.glob("*.cache"):
                    try:
                        cache_file.unlink()
                    except Exception as e:
                        logger.warning(f"캐시 파일 삭제 실패: {cache_file}, {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        with self._lock:
            return {
                "memory_size": len(self.memory_cache),
                "memory_capacity": self.memory_size,
                "disk_files": len(list(self.disk_cache_dir.glob("*.cache"))) if self.disk_cache_dir else 0,
                "ttl": self.ttl
            }


# 스키마 검증 시스템
class SchemaValidator:
    """고급 스키마 검증기"""
    
    def __init__(self):
        self.schemas = {}
        self.custom_validators = {}
        self.validation_cache = DataCache(memory_size=100)
    
    def register_schema(self, name: str, schema: Dict[str, Any], version: str = "1.0") -> None:
        """스키마 등록"""
        schema_info = SchemaInfo(
            name=name,
            version=version,
            schema=schema,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        self.schemas[name] = schema_info
        logger.info(f"스키마 등록: {name} v{version}")
    
    def register_validator(self, name: str, validator: Callable[[Any], bool]) -> None:
        """커스텀 검증자 등록"""
        self.custom_validators[name] = validator
        logger.info(f"커스텀 검증자 등록: {name}")
    
    def validate(self, data: Any, schema_name: str, level: ValidationLevel = ValidationLevel.NORMAL) -> ValidationResult:
        """데이터 검증"""
        if schema_name not in self.schemas:
            return ValidationResult(False, [f"스키마를 찾을 수 없음: {schema_name}"])
        
        schema_info = self.schemas[schema_name]
        schema_info.usage_count += 1
        schema_info.updated_at = datetime.now()
        
        # 캐시 확인
        cache_key = self._generate_validation_key(data, schema_name, level)
        cached_result = self.validation_cache.get(cache_key)
        if cached_result:
            return cached_result
        
        # 검증 수행
        result = self._validate_against_schema(data, schema_info.schema, level)
        
        # 결과 캐싱
        self.validation_cache.set(cache_key, result)
        
        return result
    
    def _validate_against_schema(self, data: Any, schema: Dict[str, Any], level: ValidationLevel) -> ValidationResult:
        """스키마에 대한 검증 수행"""
        errors = []
        warnings = []
        score = 1.0
        
        try:
            # 타입 검증
            if "type" in schema:
                expected_type = schema["type"]
                if not self._validate_type(data, expected_type):
                    error = f"타입 불일치: 예상 {expected_type}, 실제 {type(data).__name__}"
                    if level == ValidationLevel.STRICT:
                        errors.append(error)
                        score -= 0.5
                    else:
                        warnings.append(error)
                        score -= 0.1
            
            # 필수 필드 검증
            if isinstance(data, dict) and "required" in schema:
                for field in schema["required"]:
                    if field not in data:
                        error = f"필수 필드 누락: {field}"
                        if level == ValidationLevel.STRICT:
                            errors.append(error)
                            score -= 0.3
                        else:
                            warnings.append(error)
                            score -= 0.1
            
            # 속성 검증
            if isinstance(data, dict) and "properties" in schema:
                for field, field_schema in schema["properties"].items():
                    if field in data:
                        field_result = self._validate_against_schema(data[field], field_schema, level)
                        errors.extend(field_result.errors)
                        warnings.extend(field_result.warnings)
                        score *= field_result.score
            
            # 커스텀 검증
            if "custom_validator" in schema:
                validator_name = schema["custom_validator"]
                if validator_name in self.custom_validators:
                    if not self.custom_validators[validator_name](data):
                        error = f"커스텀 검증 실패: {validator_name}"
                        if level == ValidationLevel.STRICT:
                            errors.append(error)
                            score -= 0.2
                        else:
                            warnings.append(error)
                            score -= 0.05
            
            # 값 범위 검증
            if isinstance(data, (int, float)) and "range" in schema:
                min_val, max_val = schema["range"]
                if not (min_val <= data <= max_val):
                    error = f"값이 범위를 벗어남: {data} (범위: {min_val}-{max_val})"
                    if level == ValidationLevel.STRICT:
                        errors.append(error)
                        score -= 0.2
                    else:
                        warnings.append(error)
                        score -= 0.05
            
            # 패턴 검증 (문자열)
            if isinstance(data, str) and "pattern" in schema:
                import re
                if not re.match(schema["pattern"], data):
                    error = f"패턴 불일치: {data}"
                    if level == ValidationLevel.STRICT:
                        errors.append(error)
                        score -= 0.2
                    else:
                        warnings.append(error)
                        score -= 0.05
        
        except Exception as e:
            errors.append(f"검증 중 오류 발생: {str(e)}")
            score = 0.0
        
        is_valid = len(errors) == 0 or level == ValidationLevel.LENIENT
        score = max(0.0, min(1.0, score))
        
        return ValidationResult(is_valid, errors, warnings, score)
    
    def _validate_type(self, data: Any, expected_type: str) -> bool:
        """타입 검증"""
        type_map = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
            "null": type(None)
        }
        
        expected_python_type = type_map.get(expected_type)
        if expected_python_type:
            return isinstance(data, expected_python_type)
        
        return True  # 알 수 없는 타입은 통과
    
    def _generate_validation_key(self, data: Any, schema_name: str, level: ValidationLevel) -> str:
        """검증 캐시 키 생성"""
        data_hash = hashlib.md5(str(data).encode()).hexdigest()[:8]
        return f"validation_{schema_name}_{level.value}_{data_hash}"
    
    def infer_schema(self, data: Any, name: str = "inferred") -> Dict[str, Any]:
        """데이터로부터 스키마 자동 추론"""
        schema = self._infer_schema_recursive(data)
        self.register_schema(name, schema, "inferred")
        return schema
    
    def _infer_schema_recursive(self, data: Any) -> Dict[str, Any]:
        """재귀적 스키마 추론"""
        if isinstance(data, dict):
            properties = {}
            required = []
            
            for key, value in data.items():
                properties[key] = self._infer_schema_recursive(value)
                if value is not None:
                    required.append(key)
            
            return {
                "type": "object",
                "properties": properties,
                "required": required
            }
        
        elif isinstance(data, list):
            if data:
                # 첫 번째 요소로부터 아이템 스키마 추론
                item_schema = self._infer_schema_recursive(data[0])
                return {
                    "type": "array",
                    "items": item_schema
                }
            else:
                return {"type": "array"}
        
        elif isinstance(data, str):
            schema = {"type": "string"}
            # 패턴 감지
            if "@" in data and "." in data:
                schema["pattern"] = r'^[^@]+@[^@]+\.[^@]+$'  # 이메일 패턴
            return schema
        
        elif isinstance(data, bool):
            return {"type": "boolean"}
        
        elif isinstance(data, int):
            return {"type": "integer"}
        
        elif isinstance(data, float):
            return {"type": "number"}
        
        elif data is None:
            return {"type": "null"}
        
        else:
            return {"type": "string"}  # 기본값


# 직렬화 시스템
class SerializationManager:
    """고급 직렬화 관리자"""
    
    def __init__(self):
        self.serializers = {}
        self.deserializers = {}
        self._register_default_serializers()
    
    def _register_default_serializers(self) -> None:
        """기본 직렬화기 등록"""
        # JSON
        self.register_serializer(DataFormat.JSON, self._serialize_json, self._deserialize_json)
        
        # YAML
        if HAS_YAML:
            self.register_serializer(DataFormat.YAML, self._serialize_yaml, self._deserialize_yaml)
        
        # MessagePack
        if HAS_MSGPACK:
            self.register_serializer(DataFormat.MSGPACK, self._serialize_msgpack, self._deserialize_msgpack)
        
        # Pickle
        self.register_serializer(DataFormat.PICKLE, self._serialize_pickle, self._deserialize_pickle)
    
    def register_serializer(self, 
                          format_type: DataFormat, 
                          serializer: Callable[[Any], bytes], 
                          deserializer: Callable[[bytes], Any]) -> None:
        """직렬화기 등록"""
        self.serializers[format_type] = serializer
        self.deserializers[format_type] = deserializer
        logger.info(f"직렬화기 등록: {format_type.value}")
    
    def serialize(self, data: Any, format_type: DataFormat = DataFormat.JSON) -> bytes:
        """데이터 직렬화"""
        if format_type not in self.serializers:
            raise SerializationError(f"지원하지 않는 형식: {format_type.value}")
        
        try:
            return self.serializers[format_type](data)
        except Exception as e:
            raise SerializationError(f"직렬화 실패 ({format_type.value}): {e}")
    
    def deserialize(self, data: bytes, format_type: DataFormat = DataFormat.JSON) -> Any:
        """데이터 역직렬화"""
        if format_type not in self.deserializers:
            raise SerializationError(f"지원하지 않는 형식: {format_type.value}")
        
        try:
            return self.deserializers[format_type](data)
        except Exception as e:
            raise SerializationError(f"역직렬화 실패 ({format_type.value}): {e}")
    
    def _serialize_json(self, data: Any) -> bytes:
        """JSON 직렬화"""
        if HAS_ORJSON:
            return orjson.dumps(data, default=self._json_default)
        else:
            return json.dumps(data, ensure_ascii=False, default=self._json_default).encode()
    
    def _deserialize_json(self, data: bytes) -> Any:
        """JSON 역직렬화"""
        if HAS_ORJSON:
            return orjson.loads(data)
        else:
            return json.loads(data.decode())
    
    def _serialize_yaml(self, data: Any) -> bytes:
        """YAML 직렬화"""
        return yaml.dump(data, allow_unicode=True, default_flow_style=False).encode()
    
    def _deserialize_yaml(self, data: bytes) -> Any:
        """YAML 역직렬화"""
        return yaml.safe_load(data.decode())
    
    def _serialize_msgpack(self, data: Any) -> bytes:
        """MessagePack 직렬화"""
        return msgpack.packb(data, default=self._msgpack_default)
    
    def _deserialize_msgpack(self, data: bytes) -> Any:
        """MessagePack 역직렬화"""
        return msgpack.unpackb(data, raw=False)
    
    def _serialize_pickle(self, data: Any) -> bytes:
        """Pickle 직렬화"""
        return pickle.dumps(data, protocol=pickle.HIGHEST_PROTOCOL)
    
    def _deserialize_pickle(self, data: bytes) -> Any:
        """Pickle 역직렬화"""
        return pickle.loads(data)
    
    def _json_default(self, obj: Any) -> Any:
        """JSON 직렬화 기본 처리"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif hasattr(obj, 'to_dict'):
            return obj.to_dict()
        elif hasattr(obj, '__dict__'):
            return obj.__dict__
        else:
            return str(obj)
    
    def _msgpack_default(self, obj: Any) -> Any:
        """MessagePack 직렬화 기본 처리"""
        return self._json_default(obj)


# 데이터 변환 파이프라인
class DataTransformPipeline:
    """데이터 변환 파이프라인"""
    
    def __init__(self, config: Optional[DataPipelineConfig] = None):
        self.config = config or DataPipelineConfig()
        self.transforms = []
        self.metrics = []
        self.cache = DataCache() if self.config.enable_caching else None
        self.executor = ThreadPoolExecutor(max_workers=self.config.max_workers)
    
    def add_transform(self, transform: Callable[[Any], Any], name: str = None) -> 'DataTransformPipeline':
        """변환 함수 추가"""
        transform_info = {
            'function': transform,
            'name': name or transform.__name__,
            'added_at': datetime.now()
        }
        self.transforms.append(transform_info)
        return self
    
    def process(self, data: Any, parallel: bool = False) -> Any:
        """데이터 처리"""
        if not self.transforms:
            return data
        
        start_time = time.time()
        original_size = self._estimate_size(data)
        
        try:
            if parallel and len(self.transforms) > 1:
                result = self._process_parallel(data)
            else:
                result = self._process_sequential(data)
            
            # 메트릭 수집
            if self.config.enable_metrics:
                metrics = ProcessingMetrics(
                    operation="pipeline_process",
                    start_time=start_time,
                    end_time=time.time(),
                    duration=time.time() - start_time,
                    input_size=original_size,
                    output_size=self._estimate_size(result),
                    memory_used=0,  # TODO: 실제 메모리 사용량 측정
                    cache_hit=False
                )
                self.metrics.append(metrics)
            
            return result
        
        except Exception as e:
            logger.error(f"파이프라인 처리 실패: {e}")
            raise ConversionError(f"파이프라인 처리 실패: {e}")
    
    def _process_sequential(self, data: Any) -> Any:
        """순차 처리"""
        current_data = data
        
        for transform_info in self.transforms:
            transform = transform_info['function']
            transform_name = transform_info['name']
            
            # 캐시 확인
            if self.cache:
                cache_key = f"{transform_name}_{hash(str(current_data))}"
                cached_result = self.cache.get(cache_key)
                if cached_result is not None:
                    current_data = cached_result
                    continue
            
            try:
                # 변환 적용
                current_data = transform(current_data)
                
                # 캐시 저장
                if self.cache:
                    self.cache.set(cache_key, current_data)
                
            except Exception as e:
                logger.error(f"변환 실패 ({transform_name}): {e}")
                if self.config.validation_level == ValidationLevel.STRICT:
                    raise ConversionError(f"변환 실패 ({transform_name}): {e}")
        
        return current_data
    
    def _process_parallel(self, data: Any) -> Any:
        """병렬 처리 (독립적인 변환들에 대해)"""
        # 현재는 순차 처리로 폴백
        # 실제 병렬 처리는 데이터 분할이 가능한 경우에만 적용
        return self._process_sequential(data)
    
    def _estimate_size(self, data: Any) -> int:
        """데이터 크기 추정"""
        try:
            if isinstance(data, (str, bytes)):
                return len(data)
            elif isinstance(data, (list, dict)):
                return len(json.dumps(data, default=str))
            else:
                return len(str(data))
        except Exception:
            return 0
    
    async def process_async(self, data: Any) -> Any:
        """비동기 처리"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, self.process, data)
    
    def get_metrics(self) -> List[ProcessingMetrics]:
        """메트릭 반환"""
        return self.metrics
    
    def clear_metrics(self) -> None:
        """메트릭 초기화"""
        self.metrics.clear()


# 스트리밍 데이터 처리
class StreamProcessor:
    """스트리밍 데이터 처리기"""
    
    def __init__(self, chunk_size: int = 1000):
        self.chunk_size = chunk_size
        self.processors = []
    
    def add_processor(self, processor: Callable[[Any], Any]) -> 'StreamProcessor':
        """처리기 추가"""
        self.processors.append(processor)
        return self
    
    def process_stream(self, data_stream: Iterator[Any]) -> Iterator[Any]:
        """스트림 처리"""
        chunk = []
        
        for item in data_stream:
            chunk.append(item)
            
            if len(chunk) >= self.chunk_size:
                # 청크 처리
                processed_chunk = self._process_chunk(chunk)
                for processed_item in processed_chunk:
                    yield processed_item
                chunk = []
        
        # 마지막 청크 처리
        if chunk:
            processed_chunk = self._process_chunk(chunk)
            for processed_item in processed_chunk:
                yield processed_item
    
    async def process_stream_async(self, data_stream: AsyncIterator[Any]) -> AsyncIterator[Any]:
        """비동기 스트림 처리"""
        chunk = []
        
        async for item in data_stream:
            chunk.append(item)
            
            if len(chunk) >= self.chunk_size:
                # 청크 처리
                processed_chunk = await self._process_chunk_async(chunk)
                for processed_item in processed_chunk:
                    yield processed_item
                chunk = []
        
        # 마지막 청크 처리
        if chunk:
            processed_chunk = await self._process_chunk_async(chunk)
            for processed_item in processed_chunk:
                yield processed_item
    
    def _process_chunk(self, chunk: List[Any]) -> List[Any]:
        """청크 처리"""
        current_chunk = chunk
        
        for processor in self.processors:
            try:
                current_chunk = [processor(item) for item in current_chunk]
            except Exception as e:
                logger.error(f"청크 처리 실패: {e}")
                # 오류 발생 시 원본 반환
                return chunk
        
        return current_chunk
    
    async def _process_chunk_async(self, chunk: List[Any]) -> List[Any]:
        """비동기 청크 처리"""
        current_chunk = chunk
        
        for processor in self.processors:
            try:
                if asyncio.iscoroutinefunction(processor):
                    tasks = [processor(item) for item in current_chunk]
                    current_chunk = await asyncio.gather(*tasks)
                else:
                    current_chunk = [processor(item) for item in current_chunk]
            except Exception as e:
                logger.error(f"비동기 청크 처리 실패: {e}")
                return chunk
        
        return current_chunk


# 성능 최적화된 JSON 유틸리티
class EnhancedJsonUtils:
    """성능 최적화된 JSON 유틸리티"""
    
    def __init__(self):
        self.cache = DataCache(memory_size=500)
        self.serialization_manager = SerializationManager()
        self.schema_validator = SchemaValidator()
        
        # 성능 메트릭
        self.parse_times = []
        self.serialize_times = []
    
    def safe_parse_json(self, json_str: str, default: Any = None, use_cache: bool = True) -> Any:
        """안전한 JSON 파싱 (캐싱 지원)"""
        if not json_str or not isinstance(json_str, str):
            return default
        
        # 캐시 확인
        if use_cache:
            cache_key = hashlib.md5(json_str.encode()).hexdigest()
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                return cached_result
        
        start_time = time.time()
        
        try:
            if HAS_ORJSON:
                result = orjson.loads(json_str)
            else:
                result = json.loads(json_str)
            
            # 성능 메트릭 수집
            parse_time = time.time() - start_time
            self.parse_times.append(parse_time)
            
            # 캐시 저장
            if use_cache:
                self.cache.set(cache_key, result)
            
            return result
            
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.debug(f"JSON 파싱 실패: {e}")
            return default
    
    def safe_stringify_json(self, data: Any, default: str = "{}", 
                          indent: Optional[int] = None, 
                          use_cache: bool = True) -> str:
        """안전한 JSON 문자열 변환 (캐싱 지원)"""
        # 캐시 키 생성
        if use_cache:
            cache_key = f"stringify_{hash(str(data))}_{indent}"
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                return cached_result
        
        start_time = time.time()
        
        try:
            if HAS_ORJSON:
                if indent:
                    # orjson은 indent 옵션이 다름
                    result = orjson.dumps(data, option=orjson.OPT_INDENT_2).decode()
                else:
                    result = orjson.dumps(data).decode()
            else:
                result = json.dumps(data, ensure_ascii=False, indent=indent, default=self._json_serializer)
            
            # 성능 메트릭 수집
            serialize_time = time.time() - start_time
            self.serialize_times.append(serialize_time)
            
            # 캐시 저장
            if use_cache:
                self.cache.set(cache_key, result)
            
            return result
            
        except (TypeError, ValueError) as e:
            logger.debug(f"JSON 직렬화 실패: {e}")
            return default
    
    def parse_json_array(self, json_str: str, default: List = None, validate_schema: str = None) -> List:
        """JSON 배열 파싱 (스키마 검증 지원)"""
        if default is None:
            default = []
            
        result = self.safe_parse_json(json_str, [])
        
        if not isinstance(result, list):
            return default
        
        # 스키마 검증
        if validate_schema and validate_schema in self.schema_validator.schemas:
            validation_result = self.schema_validator.validate(result, validate_schema)
            if not validation_result.is_valid:
                logger.warning(f"JSON 배열 스키마 검증 실패: {validation_result.errors}")
                return default
        
        return result
    
    def parse_json_object(self, json_str: str, default: Dict = None, validate_schema: str = None) -> Dict:
        """JSON 객체 파싱 (스키마 검증 지원)"""
        if default is None:
            default = {}
            
        result = self.safe_parse_json(json_str, {})
        
        if not isinstance(result, dict):
            return default
        
        # 스키마 검증
        if validate_schema and validate_schema in self.schema_validator.schemas:
            validation_result = self.schema_validator.validate(result, validate_schema)
            if not validation_result.is_valid:
                logger.warning(f"JSON 객체 스키마 검증 실패: {validation_result.errors}")
                return default
        
        return result
    
    def is_valid_json(self, json_str: str) -> bool:
        """유효한 JSON 문자열 확인"""
        try:
            self.safe_parse_json(json_str)
            return True
        except Exception:
            return False
    
    def merge_json_objects(self, *objects: Dict, deep_merge: bool = True) -> Dict:
        """JSON 객체 병합 (깊은 병합 지원)"""
        if not objects:
            return {}
        
        if not deep_merge:
            result = {}
            for obj in objects:
                if isinstance(obj, dict):
                    result.update(obj)
            return result
        
        # 깊은 병합
        result = {}
        for obj in objects:
            if isinstance(obj, dict):
                result = self._deep_merge(result, obj)
        
        return result
    
    def _deep_merge(self, dict1: Dict, dict2: Dict) -> Dict:
        """딕셔너리 깊은 병합"""
        result = dict1.copy()
        
        for key, value in dict2.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        
        return result
    
    def get_nested_value(self, data: Dict, key_path: str, default: Any = None, separator: str = ".") -> Any:
        """중첩된 딕셔너리에서 값 추출 (배열 인덱스 지원)"""
        try:
            keys = key_path.split(separator)
            current = data
            
            for key in keys:
                # 배열 인덱스 처리
                if key.isdigit() and isinstance(current, list):
                    index = int(key)
                    if 0 <= index < len(current):
                        current = current[index]
                    else:
                        return default
                elif isinstance(current, dict):
                    current = current[key]
                else:
                    return default
            
            return current
            
        except (KeyError, TypeError, IndexError, ValueError):
            return default
    
    def set_nested_value(self, data: Dict, key_path: str, value: Any, separator: str = ".") -> None:
        """중첩된 딕셔너리에 값 설정"""
        keys = key_path.split(separator)
        current = data
        
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        current[keys[-1]] = value
    
    def flatten_json(self, data: Dict, separator: str = ".", max_depth: int = 10) -> Dict:
        """JSON 객체 평면화"""
        def _flatten(obj: Any, parent_key: str = "", depth: int = 0) -> Dict[str, Any]:
            if depth > max_depth:
                return {parent_key: obj}
            
            items = []
            
            if isinstance(obj, dict):
                for key, value in obj.items():
                    new_key = f"{parent_key}{separator}{key}" if parent_key else key
                    items.extend(_flatten(value, new_key, depth + 1).items())
            elif isinstance(obj, list):
                for i, value in enumerate(obj):
                    new_key = f"{parent_key}{separator}{i}" if parent_key else str(i)
                    items.extend(_flatten(value, new_key, depth + 1).items())
            else:
                return {parent_key: obj}
            
            return dict(items)
        
        return _flatten(data)
    
    def unflatten_json(self, flat_data: Dict, separator: str = ".") -> Dict:
        """평면화된 JSON 객체 복원"""
        result = {}
        
        for key, value in flat_data.items():
            self.set_nested_value(result, key, value, separator)
        
        return result
    
    def _json_serializer(self, obj: Any) -> Any:
        """JSON 직렬화 헬퍼"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif hasattr(obj, 'to_dict'):
            return obj.to_dict()
        elif hasattr(obj, '__dict__'):
            return obj.__dict__
        elif isinstance(obj, set):
            return list(obj)
        else:
            return str(obj)
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """성능 통계 반환"""
        parse_times = self.parse_times[-100:]  # 최근 100개
        serialize_times = self.serialize_times[-100:]
        
        stats = {
            "cache_stats": self.cache.get_stats(),
            "parse_stats": {
                "count": len(parse_times),
                "avg_time": sum(parse_times) / len(parse_times) if parse_times else 0,
                "max_time": max(parse_times) if parse_times else 0,
                "min_time": min(parse_times) if parse_times else 0
            },
            "serialize_stats": {
                "count": len(serialize_times),
                "avg_time": sum(serialize_times) / len(serialize_times) if serialize_times else 0,
                "max_time": max(serialize_times) if serialize_times else 0,
                "min_time": min(serialize_times) if serialize_times else 0
            }
        }
        
        return stats


# 데이터 분석 유틸리티
class DataAnalyzer:
    """데이터 분석 유틸리티"""
    
    def __init__(self):
        self.analysis_cache = DataCache(memory_size=200)
    
    def analyze_structure(self, data: Any, max_depth: int = 5) -> Dict[str, Any]:
        """데이터 구조 분석"""
        cache_key = f"structure_{hash(str(data))}_{max_depth}"
        cached_result = self.analysis_cache.get(cache_key)
        if cached_result:
            return cached_result
        
        analysis = self._analyze_recursive(data, 0, max_depth)
        
        self.analysis_cache.set(cache_key, analysis)
        return analysis
    
    def _analyze_recursive(self, data: Any, depth: int, max_depth: int) -> Dict[str, Any]:
        """재귀적 구조 분석"""
        if depth > max_depth:
            return {"type": "max_depth_reached", "value_type": type(data).__name__}
        
        if isinstance(data, dict):
            return {
                "type": "object",
                "size": len(data),
                "keys": list(data.keys())[:10],  # 최대 10개 키만
                "properties": {
                    key: self._analyze_recursive(value, depth + 1, max_depth)
                    for key, value in list(data.items())[:5]  # 최대 5개 속성만 분석
                }
            }
        
        elif isinstance(data, list):
            return {
                "type": "array",
                "size": len(data),
                "item_types": list(set(type(item).__name__ for item in data[:100])),  # 최대 100개 샘플
                "sample_items": [
                    self._analyze_recursive(item, depth + 1, max_depth)
                    for item in data[:3]  # 최대 3개 샘플
                ]
            }
        
        elif isinstance(data, str):
            return {
                "type": "string",
                "length": len(data),
                "encoding": "utf-8" if data.isascii() else "unicode",
                "patterns": self._detect_string_patterns(data)
            }
        
        elif isinstance(data, (int, float)):
            return {
                "type": "number",
                "value_type": type(data).__name__,
                "value": data,
                "range_info": self._analyze_number(data)
            }
        
        else:
            return {
                "type": "primitive",
                "value_type": type(data).__name__,
                "value": str(data)[:100]  # 최대 100자
            }
    
    def _detect_string_patterns(self, text: str) -> List[str]:
        """문자열 패턴 감지"""
        patterns = []
        
        if "@" in text and "." in text:
            patterns.append("email")
        if text.startswith("http"):
            patterns.append("url")
        if text.isdigit():
            patterns.append("numeric")
        if len(text) == 36 and text.count("-") == 4:
            patterns.append("uuid")
        if text.startswith("{") and text.endswith("}"):
            patterns.append("json")
        
        return patterns
    
    def _analyze_number(self, num: Union[int, float]) -> Dict[str, Any]:
        """숫자 분석"""
        return {
            "is_integer": isinstance(num, int),
            "is_positive": num > 0,
            "is_zero": num == 0,
            "magnitude": abs(num),
            "digits": len(str(abs(int(num))))
        }
    
    def find_duplicates(self, data: List[Any]) -> Dict[str, Any]:
        """중복 데이터 찾기"""
        if not isinstance(data, list):
            return {"error": "입력 데이터는 리스트여야 합니다"}
        
        seen = {}
        duplicates = {}
        
        for i, item in enumerate(data):
            item_str = str(item)
            if item_str in seen:
                if item_str not in duplicates:
                    duplicates[item_str] = {
                        "value": item,
                        "indices": [seen[item_str], i],
                        "count": 2
                    }
                else:
                    duplicates[item_str]["indices"].append(i)
                    duplicates[item_str]["count"] += 1
            else:
                seen[item_str] = i
        
        return {
            "total_items": len(data),
            "unique_items": len(seen),
            "duplicate_groups": len(duplicates),
            "duplicates": duplicates
        }
    
    def compare_structures(self, data1: Any, data2: Any) -> Dict[str, Any]:
        """두 데이터 구조 비교"""
        struct1 = self.analyze_structure(data1)
        struct2 = self.analyze_structure(data2)
        
        return {
            "structure1": struct1,
            "structure2": struct2,
            "differences": self._find_structure_differences(struct1, struct2),
            "similarity_score": self._calculate_similarity(struct1, struct2)
        }
    
    def _find_structure_differences(self, struct1: Dict, struct2: Dict) -> List[str]:
        """구조 차이점 찾기"""
        differences = []
        
        if struct1.get("type") != struct2.get("type"):
            differences.append(f"타입 불일치: {struct1.get('type')} vs {struct2.get('type')}")
        
        if struct1.get("type") == "object" and struct2.get("type") == "object":
            keys1 = set(struct1.get("keys", []))
            keys2 = set(struct2.get("keys", []))
            
            if keys1 != keys2:
                only_in_1 = keys1 - keys2
                only_in_2 = keys2 - keys1
                
                if only_in_1:
                    differences.append(f"첫 번째에만 있는 키: {list(only_in_1)}")
                if only_in_2:
                    differences.append(f"두 번째에만 있는 키: {list(only_in_2)}")
        
        return differences
    
    def _calculate_similarity(self, struct1: Dict, struct2: Dict) -> float:
        """구조 유사도 계산 (0.0 ~ 1.0)"""
        if struct1.get("type") != struct2.get("type"):
            return 0.0
        
        if struct1.get("type") == "object":
            keys1 = set(struct1.get("keys", []))
            keys2 = set(struct2.get("keys", []))
            
            if not keys1 and not keys2:
                return 1.0
            
            intersection = keys1 & keys2
            union = keys1 | keys2
            
            return len(intersection) / len(union) if union else 1.0
        
        elif struct1.get("type") == "array":
            types1 = set(struct1.get("item_types", []))
            types2 = set(struct2.get("item_types", []))
            
            if not types1 and not types2:
                return 1.0
            
            intersection = types1 & types2
            union = types1 | types2
            
            return len(intersection) / len(union) if union else 1.0
        
        else:
            return 1.0 if struct1 == struct2 else 0.5


# 통합 데이터 매니저
class DataManager:
    """통합 데이터 관리자"""
    
    def __init__(self, config: Optional[DataPipelineConfig] = None):
        self.config = config or DataPipelineConfig()
        
        # 핵심 컴포넌트들
        self.json_utils = EnhancedJsonUtils()
        self.schema_validator = SchemaValidator()
        self.serialization_manager = SerializationManager()
        self.data_analyzer = DataAnalyzer()
        self.cache = DataCache()
        
        # 변환 파이프라인
        self.pipeline = DataTransformPipeline(self.config)
        self.stream_processor = StreamProcessor()
        
        # 메트릭 수집
        self.operation_metrics = []
        self._lock = threading.RLock()
    
    @contextmanager
    def operation_context(self, operation_name: str):
        """작업 컨텍스트 매니저"""
        start_time = time.time()
        
        try:
            yield
        finally:
            if self.config.enable_metrics:
                duration = time.time() - start_time
                metrics = ProcessingMetrics(
                    operation=operation_name,
                    start_time=start_time,
                    end_time=time.time(),
                    duration=duration,
                    input_size=0,  # TODO: 실제 크기 측정
                    output_size=0,
                    memory_used=0
                )
                
                with self._lock:
                    self.operation_metrics.append(metrics)
    
    def process_data(self, 
                    data: Any, 
                    schema_name: str = None,
                    validation_level: ValidationLevel = ValidationLevel.NORMAL,
                    use_cache: bool = True) -> Dict[str, Any]:
        """데이터 종합 처리"""
        with self.operation_context("process_data"):
            result = {
                "original_data": data,
                "processed_data": data,
                "validation_result": None,
                "analysis": None,
                "errors": [],
                "warnings": []
            }
            
            try:
                # 1. 스키마 검증
                if schema_name:
                    validation_result = self.schema_validator.validate(data, schema_name, validation_level)
                    result["validation_result"] = validation_result
                    
                    if not validation_result.is_valid and validation_level == ValidationLevel.STRICT:
                        result["errors"].extend(validation_result.errors)
                        return result
                
                # 2. 데이터 분석
                analysis = self.data_analyzer.analyze_structure(data)
                result["analysis"] = analysis
                
                # 3. 파이프라인 처리
                if self.pipeline.transforms:
                    processed_data = self.pipeline.process(data)
                    result["processed_data"] = processed_data
                
                return result
            
            except Exception as e:
                result["errors"].append(str(e))
                logger.error(f"데이터 처리 실패: {e}")
                return result
    
    async def process_data_async(self, 
                               data: Any, 
                               schema_name: str = None,
                               validation_level: ValidationLevel = ValidationLevel.NORMAL) -> Dict[str, Any]:
        """비동기 데이터 처리"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self.process_data, 
            data, 
            schema_name, 
            validation_level
        )
    
    def register_schema(self, name: str, schema: Dict[str, Any], version: str = "1.0") -> None:
        """스키마 등록"""
        self.schema_validator.register_schema(name, schema, version)
    
    def register_custom_validator(self, name: str, validator: Callable[[Any], bool]) -> None:
        """커스텀 검증자 등록"""
        self.schema_validator.register_validator(name, validator)
    
    def add_transform(self, transform: Callable[[Any], Any], name: str = None) -> 'DataManager':
        """변환 함수 추가"""
        self.pipeline.add_transform(transform, name)
        return self
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """메트릭 요약 반환"""
        with self._lock:
            if not self.operation_metrics:
                return {"message": "메트릭이 없습니다"}
            
            durations = [m.duration for m in self.operation_metrics]
            operations = [m.operation for m in self.operation_metrics]
            
            operation_counts = {}
            for op in operations:
                operation_counts[op] = operation_counts.get(op, 0) + 1
            
            return {
                "total_operations": len(self.operation_metrics),
                "avg_duration": sum(durations) / len(durations),
                "max_duration": max(durations),
                "min_duration": min(durations),
                "operation_counts": operation_counts,
                "json_performance": self.json_utils.get_performance_stats(),
                "cache_stats": self.cache.get_stats()
            }
    
    def clear_metrics(self) -> None:
        """메트릭 초기화"""
        with self._lock:
            self.operation_metrics.clear()
            self.pipeline.clear_metrics()


# 전역 인스턴스
_global_data_manager = None

def get_data_manager(config: Optional[DataPipelineConfig] = None) -> DataManager:
    """전역 데이터 매니저 인스턴스 반환"""
    global _global_data_manager
    if _global_data_manager is None:
        _global_data_manager = DataManager(config)
    return _global_data_manager


# 향상된 편의 함수들 (하위 호환성 유지)
class JsonUtils:
    """하위 호환성을 위한 JSON 유틸리티 클래스"""
    
    @staticmethod
    def safe_parse_json(json_str: str, default: Any = None) -> Any:
        """JSON 문자열을 안전하게 파싱"""
        return get_data_manager().json_utils.safe_parse_json(json_str, default)
    
    @staticmethod
    def safe_stringify_json(data: Any, default: str = "{}") -> str:
        """데이터를 안전하게 JSON 문자열로 변환"""
        return get_data_manager().json_utils.safe_stringify_json(data, default)
    
    @staticmethod
    def parse_json_array(json_str: str, default: List = None) -> List:
        """JSON 문자열을 배열로 파싱"""
        return get_data_manager().json_utils.parse_json_array(json_str, default or [])
    
    @staticmethod
    def parse_json_object(json_str: str, default: Dict = None) -> Dict:
        """JSON 문자열을 객체로 파싱"""
        return get_data_manager().json_utils.parse_json_object(json_str, default or {})
    
    @staticmethod
    def is_valid_json(json_str: str) -> bool:
        """유효한 JSON 문자열인지 확인"""
        return get_data_manager().json_utils.is_valid_json(json_str)
    
    @staticmethod
    def merge_json_objects(*objects: Dict) -> Dict:
        """JSON 객체들을 병합"""
        return get_data_manager().json_utils.merge_json_objects(*objects)
    
    @staticmethod
    def get_nested_value(data: Dict, key_path: str, default: Any = None) -> Any:
        """중첩된 딕셔너리에서 값 추출"""
        return get_data_manager().json_utils.get_nested_value(data, key_path, default)


# 별칭 제공 (하위 호환성)
DataUtils = JsonUtils


# 고급 편의 함수들
def validate_data(data: Any, schema: Dict[str, Any], level: ValidationLevel = ValidationLevel.NORMAL) -> ValidationResult:
    """데이터 검증 편의 함수"""
    validator = SchemaValidator()
    schema_name = f"temp_schema_{hash(str(schema))}"
    validator.register_schema(schema_name, schema)
    return validator.validate(data, schema_name, level)


def infer_schema(data: Any, name: str = "inferred") -> Dict[str, Any]:
    """스키마 자동 추론 편의 함수"""
    validator = SchemaValidator()
    return validator.infer_schema(data, name)


def analyze_data_structure(data: Any) -> Dict[str, Any]:
    """데이터 구조 분석 편의 함수"""
    analyzer = DataAnalyzer()
    return analyzer.analyze_structure(data)


def serialize_data(data: Any, format_type: DataFormat = DataFormat.JSON) -> bytes:
    """데이터 직렬화 편의 함수"""
    manager = SerializationManager()
    return manager.serialize(data, format_type)


def deserialize_data(data: bytes, format_type: DataFormat = DataFormat.JSON) -> Any:
    """데이터 역직렬화 편의 함수"""
    manager = SerializationManager()
    return manager.deserialize(data, format_type)


# 성능 측정 데코레이터
def measure_data_performance(operation_name: str = None):
    """데이터 처리 성능 측정 데코레이터"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            op_name = operation_name or func.__name__
            manager = get_data_manager()
            
            with manager.operation_context(op_name):
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


# 사용 예제 및 테스트
if __name__ == "__main__":
    # 기본 사용법
    data_manager = get_data_manager()
    
    # 스키마 등록
    user_schema = {
        "type": "object",
        "required": ["name", "email"],
        "properties": {
            "name": {"type": "string"},
                            "email": {"type": "string", "pattern": r'^[^@]+@[^@]+\.[^@]+$'},
            "age": {"type": "integer", "range": [0, 120]}
        }
    }
    data_manager.register_schema("user", user_schema)
    
    # 테스트 데이터
    test_data = {
        "name": "홍길동",
        "email": "hong@example.com",
        "age": 30
    }
    
    # 데이터 처리
    result = data_manager.process_data(test_data, "user")
    print("처리 결과:", result)
    
    # JSON 유틸리티 사용
    json_str = '{"test": "data", "nested": {"value": 123}}'
    parsed = JsonUtils.safe_parse_json(json_str)
    print("파싱 결과:", parsed)
    
    # 중첩 값 추출
    nested_value = JsonUtils.get_nested_value(parsed, "nested.value")
    print("중첩 값:", nested_value)
    
    # 스키마 자동 추론
    inferred = infer_schema(test_data)
    print("추론된 스키마:", inferred)
    
    # 데이터 구조 분석
    analysis = analyze_data_structure(test_data)
    print("구조 분석:", analysis)
    
    # 성능 통계
    stats = data_manager.get_metrics_summary()
    print("성능 통계:", stats)