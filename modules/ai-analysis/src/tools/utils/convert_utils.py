#!/usr/bin/env python3
"""
Enhanced Type Conversion Utilities
고도화된 타입 변환 유틸리티 모듈

주요 기능:
- 스마트 타입 변환 (자동 타입 감지 및 변환)
- 검증과 함께하는 안전한 변환
- 배치 변환 및 병렬 처리
- 커스텀 변환기 등록 시스템
- 성능 최적화 및 캐싱
- 변환 파이프라인 구축
- 다양한 데이터 형식 지원
"""

import asyncio
import json
import re
import logging
import time
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from enum import Enum
from functools import wraps, lru_cache
from pathlib import Path
from threading import RLock
from typing import (
    Any, Dict, List, Optional, Union, Callable, Type, TypeVar, Generic,
    get_type_hints, get_origin, get_args, Tuple, Set
)
import warnings

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False
    pd = None

# 타입 변수 정의
T = TypeVar('T')
SourceType = TypeVar('SourceType')
TargetType = TypeVar('TargetType')

# 로깅 설정
logger = logging.getLogger(__name__)


class ConversionError(Exception):
    """변환 관련 기본 예외"""
    def __init__(self, message: str, source_value: Any = None, 
                 target_type: Type = None, details: Dict[str, Any] = None):
        super().__init__(message)
        self.source_value = source_value
        self.target_type = target_type
        self.details = details or {}


class ValidationError(ConversionError):
    """검증 실패 예외"""
    pass


class TypeNotSupportedError(ConversionError):
    """지원하지 않는 타입 예외"""
    pass


class ConversionMode(Enum):
    """변환 모드"""
    STRICT = "strict"          # 엄격한 변환 (실패시 예외)
    SAFE = "safe"             # 안전한 변환 (실패시 기본값)
    BEST_EFFORT = "best_effort"  # 최선의 노력 (부분 변환 허용)
    SILENT = "silent"         # 조용한 변환 (오류 무시)


@dataclass
class ConversionRule:
    """변환 규칙 정의"""
    source_type: Type
    target_type: Type
    converter: Callable
    validator: Optional[Callable] = None
    priority: int = 0
    description: str = ""


@dataclass
class ConversionOptions:
    """변환 옵션"""
    mode: ConversionMode = ConversionMode.SAFE
    use_cache: bool = True
    parallel: bool = False
    max_workers: int = 4
    timeout: Optional[float] = None
    encoding: str = "utf-8"
    date_format: Optional[str] = None
    decimal_places: Optional[int] = None
    null_values: Set[Any] = field(default_factory=lambda: {None, "", "null", "None"})
    custom_rules: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversionResult(Generic[T]):
    """변환 결과"""
    success: bool
    value: Optional[T] = None
    error: Optional[Exception] = None
    original_value: Any = None
    conversion_time: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchConversionResult:
    """배치 변환 결과"""
    total_count: int
    success_count: int
    error_count: int
    results: List[ConversionResult]
    total_time: float
    errors: List[Tuple[int, Exception]] = field(default_factory=list)


class BaseConverter(ABC, Generic[SourceType, TargetType]):
    """기본 변환기 추상 클래스"""
    
    def __init__(self, name: str, priority: int = 0):
        self.name = name
        self.priority = priority
        self.conversion_count = 0
        self.error_count = 0
        self.total_time = 0.0
        self._lock = RLock()
    
    @abstractmethod
    def can_convert(self, value: Any, target_type: Type) -> bool:
        """변환 가능 여부 확인"""
        pass
    
    @abstractmethod
    def convert(self, value: SourceType, target_type: Type, 
               options: ConversionOptions) -> TargetType:
        """실제 변환 수행"""
        pass
    
    def validate(self, value: Any, target_type: Type, 
                options: ConversionOptions) -> bool:
        """변환 전 검증"""
        return True
    
    def get_stats(self) -> Dict[str, Any]:
        """변환기 통계 반환"""
        with self._lock:
            return {
                "name": self.name,
                "conversions": self.conversion_count,
                "errors": self.error_count,
                "total_time": self.total_time,
                "avg_time": self.total_time / max(self.conversion_count, 1),
                "success_rate": (self.conversion_count - self.error_count) / max(self.conversion_count, 1)
            }
    
    def _record_conversion(self, duration: float, success: bool = True):
        """변환 기록"""
        with self._lock:
            self.conversion_count += 1
            self.total_time += duration
            if not success:
                self.error_count += 1


class StringConverter(BaseConverter[Any, str]):
    """문자열 변환기"""
    
    def __init__(self):
        super().__init__("string", priority=1)
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return target_type == str or target_type == type(str)
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> str:
        if value is None or value in options.null_values:
            return ""
        
        if isinstance(value, bytes):
            try:
                return value.decode(options.encoding)
            except UnicodeDecodeError as e:
                raise ConversionError(f"Failed to decode bytes: {e}")
        
        if isinstance(value, (datetime, date)):
            format_str = options.date_format or "%Y-%m-%d %H:%M:%S"
            return value.strftime(format_str)
        
        if hasattr(value, '__str__'):
            return str(value)
        
        return repr(value)


class NumberConverter(BaseConverter[Any, Union[int, float, Decimal]]):
    """숫자 변환기"""
    
    def __init__(self):
        super().__init__("number", priority=2)
        self.number_patterns = {
            'integer': re.compile(r'^[+-]?\d+$'),
            'float': re.compile(r'^[+-]?\d*\.\d+([eE][+-]?\d+)?$'),
            'scientific': re.compile(r'^[+-]?\d+\.?\d*[eE][+-]?\d+$'),
            'percentage': re.compile(r'^[+-]?\d*\.?\d+%$'),
            'currency': re.compile(r'^[+-]?[\$€£¥₹]\s*[\d,]+\.?\d*$')
        }
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return target_type in (int, float, Decimal) or target_type in (type(int), type(float))
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> Union[int, float, Decimal]:
        if value is None or value in options.null_values:
            return target_type(0)
        
        if isinstance(value, (int, float, Decimal)):
            return target_type(value)
        
        if isinstance(value, bool):
            return target_type(1 if value else 0)
        
        if isinstance(value, str):
            return self._convert_string_to_number(value.strip(), target_type, options)
        
        # 다른 타입들 시도
        try:
            return target_type(value)
        except (ValueError, TypeError) as e:
            raise ConversionError(f"Cannot convert {type(value).__name__} to {target_type.__name__}: {e}")
    
    def _convert_string_to_number(self, value: str, target_type: Type, options: ConversionOptions) -> Union[int, float, Decimal]:
        if not value:
            return target_type(0)
        
        # 퍼센트 처리
        if value.endswith('%'):
            num_str = value[:-1]
            base_value = float(num_str) / 100
            return target_type(base_value)
        
        # 통화 기호 제거
        cleaned = re.sub(r'[^\d\.\-\+eE]', '', value)
        
        if not cleaned:
            raise ConversionError(f"No numeric content found in '{value}'")
        
        try:
            if target_type == int:
                return int(float(cleaned))  # 소수점 있는 경우 float로 먼저 변환
            elif target_type == float:
                return float(cleaned)
            elif target_type == Decimal:
                result = Decimal(cleaned)
                if options.decimal_places is not None:
                    return result.quantize(Decimal('0.1') ** options.decimal_places)
                return result
            else:
                return target_type(cleaned)
        except (ValueError, InvalidOperation) as e:
            raise ConversionError(f"Failed to convert '{value}' to {target_type.__name__}: {e}")


class BooleanConverter(BaseConverter[Any, bool]):
    """불린 변환기"""
    
    def __init__(self):
        super().__init__("boolean", priority=1)
        self.true_values = {'true', '1', 'yes', 'on', 'y', 't', 'enabled', 'active'}
        self.false_values = {'false', '0', 'no', 'off', 'n', 'f', 'disabled', 'inactive'}
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return target_type == bool or target_type == type(bool)
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> bool:
        if value is None or value in options.null_values:
            return False
        
        if isinstance(value, bool):
            return value
        
        if isinstance(value, (int, float, Decimal)):
            return bool(value)
        
        if isinstance(value, str):
            cleaned = value.lower().strip()
            if cleaned in self.true_values:
                return True
            elif cleaned in self.false_values:
                return False
            else:
                # 숫자 문자열인 경우
                try:
                    return bool(float(cleaned))
                except ValueError:
                    pass
        
        # 기본 불린 변환
        return bool(value)


class ListConverter(BaseConverter[Any, List]):
    """리스트 변환기"""
    
    def __init__(self):
        super().__init__("list", priority=3)
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return (target_type == list or target_type == type(list) or 
                (hasattr(target_type, '__origin__') and target_type.__origin__ == list))
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> List:
        if value is None or value in options.null_values:
            return []
        
        if isinstance(value, (list, tuple, set)):
            return list(value)
        
        if isinstance(value, str):
            # JSON 문자열 시도
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
                
            # 쉼표 구분 문자열
            if ',' in value:
                return [item.strip() for item in value.split(',') if item.strip()]
            
            # 단일 문자열을 리스트로
            return [value]
        
        if hasattr(value, '__iter__') and not isinstance(value, (str, bytes, dict)):
            return list(value)
        
        return [value]


class DictConverter(BaseConverter[Any, Dict]):
    """딕셔너리 변환기"""
    
    def __init__(self):
        super().__init__("dict", priority=3)
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return (target_type == dict or target_type == type(dict) or
                (hasattr(target_type, '__origin__') and target_type.__origin__ == dict))
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> Dict:
        if value is None or value in options.null_values:
            return {}
        
        if isinstance(value, dict):
            return value
        
        if isinstance(value, str):
            # JSON 문자열 시도
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
            
            # key=value 형식 파싱
            if '=' in value:
                result = {}
                for pair in value.split(','):
                    if '=' in pair:
                        key, val = pair.split('=', 1)
                        result[key.strip()] = val.strip()
                return result
        
        # 객체의 속성을 딕셔너리로
        if hasattr(value, '__dict__'):
            return vars(value)
        
        raise ConversionError(f"Cannot convert {type(value).__name__} to dict")


class DateTimeConverter(BaseConverter[Any, Union[datetime, date]]):
    """날짜/시간 변환기"""
    
    def __init__(self):
        super().__init__("datetime", priority=4)
        self.date_formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%d-%m-%Y",
            "%Y/%m/%d"
        ]
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        return target_type in (datetime, date)
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> Union[datetime, date]:
        if value is None or value in options.null_values:
            raise ConversionError("Cannot convert null value to datetime")
        
        if isinstance(value, datetime):
            return value.date() if target_type == date else value
        
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time()) if target_type == datetime else value
        
        if isinstance(value, (int, float)):
            # Unix timestamp
            dt = datetime.fromtimestamp(value)
            return dt.date() if target_type == date else dt
        
        if isinstance(value, str):
            return self._parse_date_string(value, target_type, options)
        
        raise ConversionError(f"Cannot convert {type(value).__name__} to {target_type.__name__}")
    
    def _parse_date_string(self, value: str, target_type: Type, options: ConversionOptions) -> Union[datetime, date]:
        value = value.strip()
        
        # 사용자 지정 형식 우선 시도
        if options.date_format:
            try:
                dt = datetime.strptime(value, options.date_format)
                return dt.date() if target_type == date else dt
            except ValueError:
                pass
        
        # 기본 형식들 시도
        for fmt in self.date_formats:
            try:
                dt = datetime.strptime(value, fmt)
                return dt.date() if target_type == date else dt
            except ValueError:
                continue
        
        # ISO 형식 시도
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.date() if target_type == date else dt
        except ValueError:
            pass
        
        raise ConversionError(f"Unable to parse date string: '{value}'")


class NumpyConverter(BaseConverter[Any, Any]):
    """NumPy 배열 변환기"""
    
    def __init__(self):
        super().__init__("numpy", priority=5)
        self.enabled = HAS_NUMPY
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        if not self.enabled:
            return False
        return (hasattr(target_type, '__module__') and 
                target_type.__module__ == 'numpy' and
                target_type.__name__ == 'ndarray')
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> Any:
        if not self.enabled:
            raise TypeNotSupportedError("NumPy not available")
        
        try:
            return np.array(value)
        except Exception as e:
            raise ConversionError(f"Failed to convert to numpy array: {e}")


class SmartConverter:
    """
    스마트 타입 변환기 - 메인 클래스
    자동 타입 감지 및 변환, 검증, 배치 처리 등 제공
    """
    
    def __init__(self, options: Optional[ConversionOptions] = None):
        self.options = options or ConversionOptions()
        self.converters: List[BaseConverter] = []
        self.custom_rules: Dict[Tuple[Type, Type], ConversionRule] = {}
        self.conversion_history: List[Dict[str, Any]] = []
        self.cache: Dict[str, Any] = {}
        self.cache_lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=self.options.max_workers)
        
        # 기본 변환기들 등록
        self._register_default_converters()
        
        # 성능 통계
        self.total_conversions = 0
        self.total_time = 0.0
        self.cache_hits = 0
    
    def _register_default_converters(self):
        """기본 변환기들 등록"""
        self.converters = [
            StringConverter(),
            NumberConverter(),
            BooleanConverter(),
            ListConverter(),
            DictConverter(),
            DateTimeConverter(),
        ]
        
        if HAS_NUMPY:
            self.converters.append(NumpyConverter())
        
        # 우선순위로 정렬
        self.converters.sort(key=lambda x: x.priority, reverse=True)
    
    def register_converter(self, converter: BaseConverter):
        """커스텀 변환기 등록"""
        self.converters.append(converter)
        self.converters.sort(key=lambda x: x.priority, reverse=True)
    
    def register_rule(self, rule: ConversionRule):
        """커스텀 변환 규칙 등록"""
        key = (rule.source_type, rule.target_type)
        self.custom_rules[key] = rule
    
    @contextmanager
    def conversion_context(self, **options):
        """변환 컨텍스트 관리자"""
        old_options = self.options
        try:
            # 옵션 병합
            new_options = ConversionOptions(**{
                **old_options.__dict__,
                **options
            })
            self.options = new_options
            yield self
        finally:
            self.options = old_options
    
    def convert(self, value: Any, target_type: Type, 
               options: Optional[ConversionOptions] = None) -> ConversionResult[Any]:
        """단일 값 변환"""
        start_time = time.time()
        opts = options or self.options
        
        try:
            # 캐시 확인
            if opts.use_cache:
                cache_key = self._get_cache_key(value, target_type, opts)
                cached_result = self._get_from_cache(cache_key)
                if cached_result is not None:
                    self.cache_hits += 1
                    return cached_result
            
            # 이미 목표 타입인 경우
            if isinstance(value, target_type):
                result = ConversionResult(
                    success=True,
                    value=value,
                    original_value=value,
                    conversion_time=time.time() - start_time
                )
                self._cache_result(cache_key if opts.use_cache else None, result)
                return result
            
            # 커스텀 규칙 확인
            custom_rule = self._find_custom_rule(type(value), target_type)
            if custom_rule:
                converted_value = self._apply_custom_rule(value, custom_rule, opts)
                result = ConversionResult(
                    success=True,
                    value=converted_value,
                    original_value=value,
                    conversion_time=time.time() - start_time
                )
                self._cache_result(cache_key if opts.use_cache else None, result)
                return result
            
            # 적절한 변환기 찾기
            converter = self._find_converter(value, target_type)
            if not converter:
                raise TypeNotSupportedError(f"No converter found for {type(value).__name__} -> {target_type.__name__}")
            
            # 검증
            if not converter.validate(value, target_type, opts):
                raise ValidationError(f"Validation failed for {value}")
            
            # 변환 수행
            converted_value = converter.convert(value, target_type, opts)
            conversion_time = time.time() - start_time
            
            # 통계 업데이트
            converter._record_conversion(conversion_time, True)
            self.total_conversions += 1
            self.total_time += conversion_time
            
            result = ConversionResult(
                success=True,
                value=converted_value,
                original_value=value,
                conversion_time=conversion_time
            )
            
            # 캐시 저장
            self._cache_result(cache_key if opts.use_cache else None, result)
            
            return result
            
        except Exception as e:
            conversion_time = time.time() - start_time
            
            # 실패 모드에 따른 처리
            if opts.mode == ConversionMode.STRICT:
                raise e
            elif opts.mode == ConversionMode.SAFE:
                result = ConversionResult(
                    success=False,
                    value=self._get_default_value(target_type),
                    error=e,
                    original_value=value,
                    conversion_time=conversion_time
                )
            elif opts.mode == ConversionMode.SILENT:
                result = ConversionResult(
                    success=False,
                    value=value,  # 원본 값 반환
                    error=e,
                    original_value=value,
                    conversion_time=conversion_time
                )
            else:  # BEST_EFFORT
                result = ConversionResult(
                    success=False,
                    value=self._attempt_best_effort_conversion(value, target_type),
                    error=e,
                    original_value=value,
                    conversion_time=conversion_time
                )
            
            # 실패 통계 업데이트
            converter = self._find_converter(value, target_type)
            if converter:
                converter._record_conversion(conversion_time, False)
            
            return result
    
    def convert_batch(self, values: List[Any], target_type: Type,
                     options: Optional[ConversionOptions] = None) -> BatchConversionResult:
        """배치 변환"""
        start_time = time.time()
        opts = options or self.options
        
        if opts.parallel and len(values) > 10:  # 병렬 처리 임계값
            return self._convert_batch_parallel(values, target_type, opts, start_time)
        else:
            return self._convert_batch_sequential(values, target_type, opts, start_time)
    
    def _convert_batch_sequential(self, values: List[Any], target_type: Type,
                                opts: ConversionOptions, start_time: float) -> BatchConversionResult:
        """순차 배치 변환"""
        results = []
        errors = []
        
        for i, value in enumerate(values):
            try:
                result = self.convert(value, target_type, opts)
                results.append(result)
                if not result.success:
                    errors.append((i, result.error))
            except Exception as e:
                result = ConversionResult(
                    success=False,
                    error=e,
                    original_value=value
                )
                results.append(result)
                errors.append((i, e))
        
        success_count = sum(1 for r in results if r.success)
        
        return BatchConversionResult(
            total_count=len(values),
            success_count=success_count,
            error_count=len(values) - success_count,
            results=results,
            total_time=time.time() - start_time,
            errors=errors
        )
    
    def _convert_batch_parallel(self, values: List[Any], target_type: Type,
                              opts: ConversionOptions, start_time: float) -> BatchConversionResult:
        """병렬 배치 변환"""
        futures = {}
        
        for i, value in enumerate(values):
            future = self.executor.submit(self.convert, value, target_type, opts)
            futures[future] = i
        
        results = [None] * len(values)
        errors = []
        
        for future in as_completed(futures, timeout=opts.timeout):
            i = futures[future]
            try:
                result = future.result()
                results[i] = result
                if not result.success:
                    errors.append((i, result.error))
            except Exception as e:
                result = ConversionResult(
                    success=False,
                    error=e,
                    original_value=values[i]
                )
                results[i] = result
                errors.append((i, e))
        
        success_count = sum(1 for r in results if r and r.success)
        
        return BatchConversionResult(
            total_count=len(values),
            success_count=success_count,
            error_count=len(values) - success_count,
            results=results,
            total_time=time.time() - start_time,
            errors=errors
        )
    
    def auto_convert(self, value: Any, hint_type: Optional[Type] = None) -> Any:
        """자동 타입 감지 및 변환"""
        if hint_type:
            result = self.convert(value, hint_type)
            return result.value if result.success else value
        
        # 타입 감지
        detected_type = self._detect_type(value)
        if detected_type and detected_type != type(value):
            result = self.convert(value, detected_type)
            return result.value if result.success else value
        
        return value
    
    def create_pipeline(self, *steps: Tuple[Type, Optional[ConversionOptions]]) -> 'ConversionPipeline':
        """변환 파이프라인 생성"""
        return ConversionPipeline(self, steps)
    
    def _detect_type(self, value: Any) -> Optional[Type]:
        """값의 타입 자동 감지"""
        if not isinstance(value, str):
            return None
        
        value = value.strip()
        if not value:
            return str
        
        # 불린 값 감지
        if value.lower() in {'true', 'false', 'yes', 'no', '1', '0'}:
            return bool
        
        # 숫자 감지
        try:
            if '.' in value or 'e' in value.lower():
                float(value)
                return float
            else:
                int(value)
                return int
        except ValueError:
            pass
        
        # 날짜 감지
        for fmt in ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"]:
            try:
                datetime.strptime(value, fmt)
                return datetime
            except ValueError:
                continue
        
        # JSON 감지
        try:
            parsed = json.loads(value)
            return type(parsed)
        except json.JSONDecodeError:
            pass
        
        return str
    
    def _find_converter(self, value: Any, target_type: Type) -> Optional[BaseConverter]:
        """적절한 변환기 찾기"""
        for converter in self.converters:
            if converter.can_convert(value, target_type):
                return converter
        return None
    
    def _find_custom_rule(self, source_type: Type, target_type: Type) -> Optional[ConversionRule]:
        """커스텀 변환 규칙 찾기"""
        key = (source_type, target_type)
        return self.custom_rules.get(key)
    
    def _apply_custom_rule(self, value: Any, rule: ConversionRule, 
                          options: ConversionOptions) -> Any:
        """커스텀 규칙 적용"""
        if rule.validator and not rule.validator(value):
            raise ValidationError(f"Custom validation failed for {value}")
        
        return rule.converter(value, options)
    
    def _get_cache_key(self, value: Any, target_type: Type, options: ConversionOptions) -> str:
        """캐시 키 생성"""
        import hashlib
        key_data = f"{type(value).__name__}:{value}:{target_type.__name__}:{options.mode.value}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def _get_from_cache(self, cache_key: str) -> Optional[ConversionResult]:
        """캐시에서 결과 조회"""
        with self.cache_lock:
            return self.cache.get(cache_key)
    
    def _cache_result(self, cache_key: Optional[str], result: ConversionResult):
        """결과 캐시 저장"""
        if cache_key is None:
            return
        
        with self.cache_lock:
            # 캐시 크기 제한 (LRU)
            if len(self.cache) > 1000:
                # 가장 오래된 항목 제거
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
            
            self.cache[cache_key] = result
    
    def _get_default_value(self, target_type: Type) -> Any:
        """타입별 기본값 반환"""
        defaults = {
            str: "",
            int: 0,
            float: 0.0,
            bool: False,
            list: [],
            dict: {},
            set: set(),
            tuple: (),
        }
        
        return defaults.get(target_type, None)
    
    def _attempt_best_effort_conversion(self, value: Any, target_type: Type) -> Any:
        """최선의 노력 변환 시도"""
        try:
            # 기본 파이썬 변환 시도
            return target_type(value)
        except:
            # 문자열로 변환 후 시도
            try:
                str_value = str(value)
                return target_type(str_value)
            except:
                return self._get_default_value(target_type)
    
    def get_conversion_stats(self) -> Dict[str, Any]:
        """변환 통계 반환"""
        converter_stats = [conv.get_stats() for conv in self.converters]
        
        return {
            "total_conversions": self.total_conversions,
            "total_time": self.total_time,
            "average_time": self.total_time / max(self.total_conversions, 1),
            "cache_hits": self.cache_hits,
            "cache_hit_rate": self.cache_hits / max(self.total_conversions, 1),
            "cache_size": len(self.cache),
            "converters": converter_stats
        }
    
    def clear_cache(self):
        """캐시 정리"""
        with self.cache_lock:
            self.cache.clear()
    
    def validate_and_convert(self, value: Any, target_type: Type, 
                           validation_rules: Dict[str, Any],
                           options: Optional[ConversionOptions] = None) -> ConversionResult:
        """검증과 함께 변환"""
        opts = options or self.options
        
        # 사전 검증
        validation_result = self._validate_with_rules(value, validation_rules)
        if not validation_result.get('valid', True):
            return ConversionResult(
                success=False,
                error=ValidationError(validation_result.get('message', 'Validation failed')),
                original_value=value
            )
        
        # 변환 수행
        result = self.convert(value, target_type, opts)
        
        # 사후 검증 (변환된 값에 대해)
        if result.success and result.value is not None:
            post_validation = self._validate_with_rules(result.value, validation_rules)
            if not post_validation.get('valid', True):
                return ConversionResult(
                    success=False,
                    error=ValidationError(f"Post-conversion validation failed: {post_validation.get('message', '')}"),
                    original_value=value
                )
        
        return result
    
    def _validate_with_rules(self, value: Any, rules: Dict[str, Any]) -> Dict[str, Any]:
        """규칙 기반 검증"""
        if not rules:
            return {'valid': True}
        
        # 최소/최대 값 검증
        if 'min' in rules and hasattr(value, '__lt__'):
            if value < rules['min']:
                return {'valid': False, 'message': f'Value {value} is less than minimum {rules["min"]}'}
        
        if 'max' in rules and hasattr(value, '__gt__'):
            if value > rules['max']:
                return {'valid': False, 'message': f'Value {value} is greater than maximum {rules["max"]}'}
        
        # 길이 검증
        if 'min_length' in rules and hasattr(value, '__len__'):
            if len(value) < rules['min_length']:
                return {'valid': False, 'message': f'Length {len(value)} is less than minimum {rules["min_length"]}'}
        
        if 'max_length' in rules and hasattr(value, '__len__'):
            if len(value) > rules['max_length']:
                return {'valid': False, 'message': f'Length {len(value)} is greater than maximum {rules["max_length"]}'}
        
        # 정규식 검증
        if 'pattern' in rules and isinstance(value, str):
            import re
            if not re.match(rules['pattern'], value):
                return {'valid': False, 'message': f'Value does not match pattern {rules["pattern"]}'}
        
        # 허용값 검증
        if 'allowed_values' in rules:
            if value not in rules['allowed_values']:
                return {'valid': False, 'message': f'Value {value} not in allowed values {rules["allowed_values"]}'}
        
        # 커스텀 검증자
        if 'custom_validator' in rules:
            validator = rules['custom_validator']
            if callable(validator):
                try:
                    if not validator(value):
                        return {'valid': False, 'message': 'Custom validation failed'}
                except Exception as e:
                    return {'valid': False, 'message': f'Custom validation error: {e}'}
        
        return {'valid': True}
    
    def __del__(self):
        """소멸자"""
        try:
            self.executor.shutdown(wait=False)
        except:
            pass


class ConversionPipeline:
    """변환 파이프라인"""
    
    def __init__(self, converter: SmartConverter, steps: List[Tuple[Type, Optional[ConversionOptions]]]):
        self.converter = converter
        self.steps = steps
        self.results_history: List[List[ConversionResult]] = []
    
    def process(self, value: Any) -> Any:
        """파이프라인 처리"""
        current_value = value
        step_results = []
        
        for target_type, options in self.steps:
            result = self.converter.convert(current_value, target_type, options)
            step_results.append(result)
            
            if not result.success:
                self.results_history.append(step_results)
                raise ConversionError(f"Pipeline failed at step {len(step_results)}: {result.error}")
            
            current_value = result.value
        
        self.results_history.append(step_results)
        return current_value
    
    def process_batch(self, values: List[Any]) -> List[Any]:
        """배치 파이프라인 처리"""
        results = []
        for value in values:
            try:
                processed = self.process(value)
                results.append(processed)
            except ConversionError as e:
                results.append(None)  # 또는 에러 핸들링 전략에 따라
        return results
    
    def get_pipeline_stats(self) -> Dict[str, Any]:
        """파이프라인 통계"""
        if not self.results_history:
            return {"total_runs": 0}
        
        total_runs = len(self.results_history)
        successful_runs = sum(1 for history in self.results_history 
                            if all(result.success for result in history))
        
        step_success_rates = []
        for step_idx in range(len(self.steps)):
            step_successes = sum(1 for history in self.results_history 
                               if len(history) > step_idx and history[step_idx].success)
            step_success_rates.append(step_successes / total_runs)
        
        return {
            "total_runs": total_runs,
            "successful_runs": successful_runs,
            "success_rate": successful_runs / total_runs,
            "step_success_rates": step_success_rates,
            "avg_steps_completed": sum(len(history) for history in self.results_history) / total_runs
        }


class DataFrameConverter(BaseConverter[Any, Any]):
    """pandas DataFrame 변환기"""
    
    def __init__(self):
        super().__init__("dataframe", priority=6)
        self.enabled = HAS_PANDAS
    
    def can_convert(self, value: Any, target_type: Type) -> bool:
        if not self.enabled:
            return False
        return (hasattr(target_type, '__module__') and 
                target_type.__module__ == 'pandas.core.frame' and
                target_type.__name__ == 'DataFrame')
    
    def convert(self, value: Any, target_type: Type, options: ConversionOptions) -> Any:
        if not self.enabled:
            raise TypeNotSupportedError("pandas not available")
        
        try:
            if isinstance(value, dict):
                return pd.DataFrame(value)
            elif isinstance(value, list):
                if value and isinstance(value[0], dict):
                    return pd.DataFrame(value)
                else:
                    return pd.DataFrame(value, columns=['value'])
            elif isinstance(value, str):
                # CSV 문자열 파싱 시도
                from io import StringIO
                try:
                    return pd.read_csv(StringIO(value))
                except:
                    # JSON 문자열 시도
                    import json
                    data = json.loads(value)
                    return pd.DataFrame(data)
            else:
                return pd.DataFrame([value])
        except Exception as e:
            raise ConversionError(f"Failed to convert to DataFrame: {e}")


class ConversionUtils:
    """
    편의 함수들을 제공하는 유틸리티 클래스 (하위 호환성)
    """
    
    def __init__(self):
        self._converter = SmartConverter()
    
    def to_string(self, value: Any, default: str = "") -> str:
        """문자열로 안전 변환"""
        result = self._converter.convert(value, str, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def to_int(self, value: Any, default: int = 0) -> int:
        """정수로 안전 변환"""
        result = self._converter.convert(value, int, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def to_float(self, value: Any, default: float = 0.0) -> float:
        """실수로 안전 변환"""
        result = self._converter.convert(value, float, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def to_bool(self, value: Any, default: bool = False) -> bool:
        """불린으로 안전 변환"""
        result = self._converter.convert(value, bool, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def to_list(self, value: Any, default: List = None) -> List:
        """리스트로 안전 변환"""
        if default is None:
            default = []
        result = self._converter.convert(value, list, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def to_dict(self, value: Any, default: Dict = None) -> Dict:
        """딕셔너리로 안전 변환"""
        if default is None:
            default = {}
        result = self._converter.convert(value, dict, 
                                       ConversionOptions(mode=ConversionMode.SAFE))
        return result.value if result.success else default
    
    def smart_convert(self, value: Any, target_type: Type, **options) -> Any:
        """스마트 변환"""
        opts = ConversionOptions(**options)
        result = self._converter.convert(value, target_type, opts)
        if result.success:
            return result.value
        else:
            raise result.error or ConversionError("Conversion failed")


# 전역 인스턴스들
_default_converter = None
_default_utils = None

def get_converter(options: Optional[ConversionOptions] = None) -> SmartConverter:
    """기본 SmartConverter 인스턴스 반환"""
    global _default_converter
    if _default_converter is None or options is not None:
        _default_converter = SmartConverter(options)
    return _default_converter

def get_conversion_utils() -> ConversionUtils:
    """기본 ConversionUtils 인스턴스 반환"""
    global _default_utils
    if _default_utils is None:
        _default_utils = ConversionUtils()
    return _default_utils


# 편의 함수들 (하위 호환성)
def to_string(value: Any, default: str = "") -> str:
    """문자열로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_string(value, default)

def to_int(value: Any, default: int = 0) -> int:
    """정수로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_int(value, default)

def to_float(value: Any, default: float = 0.0) -> float:
    """실수로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_float(value, default)

def to_bool(value: Any, default: bool = False) -> bool:
    """불린으로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_bool(value, default)

def to_list(value: Any, default: List = None) -> List:
    """리스트로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_list(value, default)

def to_dict(value: Any, default: Dict = None) -> Dict:
    """딕셔너리로 안전 변환 (편의 함수)"""
    return get_conversion_utils().to_dict(value, default)

def smart_convert(value: Any, target_type: Type, **options) -> Any:
    """스마트 변환 (편의 함수)"""
    return get_conversion_utils().smart_convert(value, target_type, **options)

def convert_batch(values: List[Any], target_type: Type, **options) -> BatchConversionResult:
    """배치 변환 (편의 함수)"""
    opts = ConversionOptions(**options)
    return get_converter().convert_batch(values, target_type, opts)

def auto_convert(value: Any, hint_type: Optional[Type] = None) -> Any:
    """자동 변환 (편의 함수)"""
    return get_converter().auto_convert(value, hint_type)

def create_pipeline(*steps: Tuple[Type, Optional[Dict]]) -> ConversionPipeline:
    """변환 파이프라인 생성 (편의 함수)"""
    pipeline_steps = []
    for step in steps:
        if isinstance(step, tuple) and len(step) == 2:
            target_type, options_dict = step
            options = ConversionOptions(**options_dict) if options_dict else None
            pipeline_steps.append((target_type, options))
        else:
            pipeline_steps.append((step, None))
    
    return get_converter().create_pipeline(*pipeline_steps)

def register_custom_converter(converter: BaseConverter):
    """커스텀 변환기 등록 (편의 함수)"""
    get_converter().register_converter(converter)

def register_conversion_rule(source_type: Type, target_type: Type, 
                           converter_func: Callable, 
                           validator_func: Optional[Callable] = None,
                           priority: int = 0, description: str = ""):
    """변환 규칙 등록 (편의 함수)"""
    rule = ConversionRule(
        source_type=source_type,
        target_type=target_type,
        converter=converter_func,
        validator=validator_func,
        priority=priority,
        description=description
    )
    get_converter().register_rule(rule)

def get_conversion_stats() -> Dict[str, Any]:
    """변환 통계 조회 (편의 함수)"""
    return get_converter().get_conversion_stats()

def clear_conversion_cache():
    """변환 캐시 정리 (편의 함수)"""
    get_converter().clear_cache()


# 고급 변환 예제들
def example_custom_converter():
    """커스텀 변환기 사용 예제"""
    
    # 1. 커스텀 변환기 정의
    class ColorConverter(BaseConverter[str, tuple]):
        def __init__(self):
            super().__init__("color", priority=7)
        
        def can_convert(self, value: Any, target_type: Type) -> bool:
            return (isinstance(value, str) and 
                   target_type == tuple and
                   (value.startswith('#') or value.startswith('rgb')))
        
        def convert(self, value: str, target_type: Type, options: ConversionOptions) -> tuple:
            if value.startswith('#'):
                # HEX to RGB
                hex_value = value.lstrip('#')
                return tuple(int(hex_value[i:i+2], 16) for i in (0, 2, 4))
            elif value.startswith('rgb'):
                # rgb(r,g,b) to tuple
                import re
                matches = re.findall(r'\d+', value)
                return tuple(int(m) for m in matches[:3])
            else:
                raise ConversionError(f"Unknown color format: {value}")
    
    # 2. 변환기 등록 및 사용
    converter = get_converter()
    converter.register_converter(ColorConverter())
    
    # 사용 예제
    result1 = converter.convert("#FF0000", tuple)  # (255, 0, 0)
    result2 = converter.convert("rgb(0, 255, 0)", tuple)  # (0, 255, 0)
    
    print(f"HEX to RGB: {result1.value}")
    print(f"RGB to tuple: {result2.value}")

def example_validation_conversion():
    """검증과 함께하는 변환 예제"""
    converter = get_converter()
    
    # 검증 규칙 정의
    validation_rules = {
        'min': 0,
        'max': 100,
        'custom_validator': lambda x: x % 2 == 0  # 짝수만 허용
    }
    
    # 검증과 함께 변환
    result = converter.validate_and_convert("42", int, validation_rules)
    print(f"Validated conversion: {result.value}")  # 42
    
    # 실패 케이스
    result_fail = converter.validate_and_convert("43", int, validation_rules)
    print(f"Validation failed: {result_fail.success}")  # False

def example_pipeline():
    """변환 파이프라인 예제"""
    # 문자열 -> 정수 -> 실수 -> 문자열 파이프라인
    pipeline = create_pipeline(
        (int, None),
        (float, None),
        (str, {"mode": "strict"})
    )
    
    result = pipeline.process("42")
    print(f"Pipeline result: {result}")  # "42.0"
    
    # 배치 처리
    batch_results = pipeline.process_batch(["1", "2", "3", "4", "5"])
    print(f"Batch pipeline results: {batch_results}")


# 별칭 제공 (하위 호환성)
ConvertUtils = ConversionUtils


if __name__ == "__main__":
    # 사용 예제 실행
    print("=== Enhanced Convert Utils Examples ===")
    
    # 기본 변환 예제
    converter = get_converter()
    
    print("\n1. Basic Conversions:")
    print(f"String to int: {to_int('42')}")
    print(f"String to float: {to_float('3.14')}")
    print(f"String to bool: {to_bool('true')}")
    print(f"CSV to list: {to_list('a,b,c,d')}")
    
    print("\n2. Smart Conversions:")
    print(f"Auto detect number: {auto_convert('123')}")
    print(f"Auto detect boolean: {auto_convert('false')}")
    print(f"Auto detect list: {auto_convert('[1,2,3]')}")
    
    print("\n3. Batch Conversion:")
    values = ["1", "2.5", "true", "hello", "[1,2,3]"]
    batch_result = convert_batch(values, str)
    print(f"Batch conversion success rate: {batch_result.success_count}/{batch_result.total_count}")
    
    print("\n4. Conversion Stats:")
    stats = get_conversion_stats()
    print(f"Total conversions: {stats['total_conversions']}")
    print(f"Cache hit rate: {stats['cache_hit_rate']:.2%}")
    
    # 고급 예제들 실행
    print("\n5. Advanced Examples:")
    try:
        example_custom_converter()
        example_validation_conversion()
        example_pipeline()
    except Exception as e:
        print(f"Advanced example error: {e}")
