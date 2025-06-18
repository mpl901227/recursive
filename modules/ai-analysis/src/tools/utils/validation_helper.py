#!/usr/bin/env python3
"""
Enhanced Validation Helpers
고도화된 검증 로직 통합 헬퍼 클래스들

주요 개선사항:
- 스키마 기반 검증 시스템
- 비동기 검증 지원
- 커스텀 검증자 등록
- 다국어 오류 메시지
- 조건부 검증 (conditional validation)
- 배치 검증 지원
- 성능 최적화 및 캐싱
- 검증 결과 상세 분석
- 플러그인 시스템
"""

import asyncio
import json
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any, Dict, List, Optional, Union, Callable, Set, Type, TypeVar, Generic
from dataclasses import dataclass, field
from collections import defaultdict
import logging
from functools import wraps
import uuid
import hashlib
from concurrent.futures import ThreadPoolExecutor
import threading
from pathlib import Path

# 타입 변수 정의
T = TypeVar('T')
ValidatorFunc = Callable[[Any], bool]
AsyncValidatorFunc = Callable[[Any], bool]


# 열거형 정의
class ValidationSeverity(Enum):
    """검증 오류 심각도"""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationMode(Enum):
    """검증 모드"""
    STRICT = "strict"      # 모든 검증 실패시 중단
    PERMISSIVE = "permissive"  # 가능한 많이 검증
    FAST_FAIL = "fast_fail"    # 첫 번째 실패시 즉시 중단


# 데이터 클래스들
@dataclass
class ValidationError:
    """검증 오류 정보"""
    field: str
    value: Any
    rule: str
    message: str
    severity: ValidationSeverity = ValidationSeverity.ERROR
    code: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ValidationResult:
    """검증 결과"""
    is_valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    execution_time: float = 0.0
    validated_fields: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_error(self, error: ValidationError):
        """오류 추가"""
        if error.severity == ValidationSeverity.ERROR:
            self.errors.append(error)
            self.is_valid = False
        elif error.severity == ValidationSeverity.WARNING:
            self.warnings.append(error)
    
    def has_errors(self) -> bool:
        """오류 존재 여부"""
        return len(self.errors) > 0
    
    def has_warnings(self) -> bool:
        """경고 존재 여부"""
        return len(self.warnings) > 0
    
    def get_error_messages(self) -> List[str]:
        """오류 메시지 목록"""
        return [error.message for error in self.errors]
    
    def get_warning_messages(self) -> List[str]:
        """경고 메시지 목록"""
        return [warning.message for warning in self.warnings]
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return {
            'is_valid': self.is_valid,
            'errors': [
                {
                    'field': error.field,
                    'message': error.message,
                    'code': error.code,
                    'severity': error.severity.value
                }
                for error in self.errors
            ],
            'warnings': [
                {
                    'field': warning.field,
                    'message': warning.message,
                    'code': warning.code,
                    'severity': warning.severity.value
                }
                for warning in self.warnings
            ],
            'execution_time': self.execution_time,
            'validated_fields': list(self.validated_fields),
            'metadata': self.metadata
        }


@dataclass
class ValidationRule:
    """검증 규칙"""
    name: str
    validator: Union[ValidatorFunc, AsyncValidatorFunc]
    message: str
    severity: ValidationSeverity = ValidationSeverity.ERROR
    code: Optional[str] = None
    depends_on: List[str] = field(default_factory=list)
    conditions: Dict[str, Any] = field(default_factory=dict)
    is_async: bool = False


@dataclass
class ValidationSchema:
    """검증 스키마"""
    fields: Dict[str, List[ValidationRule]] = field(default_factory=dict)
    required_fields: Set[str] = field(default_factory=set)
    optional_fields: Set[str] = field(default_factory=set)
    global_rules: List[ValidationRule] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_field_rule(self, field_name: str, rule: ValidationRule):
        """필드별 규칙 추가"""
        if field_name not in self.fields:
            self.fields[field_name] = []
        self.fields[field_name].append(rule)
    
    def add_required_field(self, field_name: str):
        """필수 필드 추가"""
        self.required_fields.add(field_name)
    
    def add_optional_field(self, field_name: str):
        """선택 필드 추가"""
        self.optional_fields.add(field_name)


# 커스텀 예외 클래스들
class ValidationException(Exception):
    """검증 관련 기본 예외"""
    def __init__(self, message: str, validation_result: Optional[ValidationResult] = None):
        super().__init__(message)
        self.validation_result = validation_result


class SchemaValidationException(ValidationException):
    """스키마 검증 예외"""
    pass


class ValidatorRegistrationException(ValidationException):
    """검증자 등록 예외"""
    pass


# 기본 검증자들
class BaseValidator(ABC):
    """기본 검증자 추상 클래스"""
    
    def __init__(self, message: Optional[str] = None, code: Optional[str] = None):
        self.message = message
        self.code = code
    
    @abstractmethod
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        """검증 수행"""
        pass
    
    def get_error_message(self, field: str, value: Any) -> str:
        """오류 메시지 생성"""
        return self.message or f"Validation failed for field '{field}'"


class RequiredValidator(BaseValidator):
    """필수 값 검증자"""
    
    def __init__(self, message: Optional[str] = None):
        super().__init__(message or "This field is required", "REQUIRED")
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        if isinstance(value, (list, dict, tuple)) and len(value) == 0:
            return False
        return True


class TypeValidator(BaseValidator):
    """타입 검증자"""
    
    def __init__(self, expected_type: Type, message: Optional[str] = None):
        self.expected_type = expected_type
        super().__init__(
            message or f"Expected type {expected_type.__name__}",
            "TYPE_MISMATCH"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        return isinstance(value, self.expected_type)


class RangeValidator(BaseValidator):
    """범위 검증자"""
    
    def __init__(self, min_val: Optional[Union[int, float]] = None,
                 max_val: Optional[Union[int, float]] = None,
                 message: Optional[str] = None):
        self.min_val = min_val
        self.max_val = max_val
        super().__init__(
            message or f"Value must be between {min_val} and {max_val}",
            "OUT_OF_RANGE"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if not isinstance(value, (int, float, Decimal)):
            return False
        
        if self.min_val is not None and value < self.min_val:
            return False
        if self.max_val is not None and value > self.max_val:
            return False
        
        return True


class LengthValidator(BaseValidator):
    """길이 검증자"""
    
    def __init__(self, min_length: Optional[int] = None,
                 max_length: Optional[int] = None,
                 message: Optional[str] = None):
        self.min_length = min_length
        self.max_length = max_length
        super().__init__(
            message or f"Length must be between {min_length} and {max_length}",
            "INVALID_LENGTH"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if not hasattr(value, '__len__'):
            return False
        
        length = len(value)
        
        if self.min_length is not None and length < self.min_length:
            return False
        if self.max_length is not None and length > self.max_length:
            return False
        
        return True


class RegexValidator(BaseValidator):
    """정규식 검증자"""
    
    def __init__(self, pattern: str, flags: int = 0, message: Optional[str] = None):
        self.pattern = re.compile(pattern, flags)
        super().__init__(
            message or f"Value does not match pattern: {pattern}",
            "PATTERN_MISMATCH"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if not isinstance(value, str):
            return False
        return bool(self.pattern.match(value))


class EmailValidator(RegexValidator):
    """이메일 검증자"""
    
    def __init__(self, message: Optional[str] = None):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        super().__init__(
            pattern, 
            message=message or "Invalid email format",
        )
        self.code = "INVALID_EMAIL"


class UUIDValidator(BaseValidator):
    """UUID 검증자"""
    
    def __init__(self, version: Optional[int] = None, message: Optional[str] = None):
        self.version = version
        super().__init__(
            message or f"Invalid UUID{f' version {version}' if version else ''} format",
            "INVALID_UUID"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if not isinstance(value, str):
            return False
        
        try:
            uuid_obj = uuid.UUID(value)
            if self.version and uuid_obj.version != self.version:
                return False
            return True
        except ValueError:
            return False


class DateValidator(BaseValidator):
    """날짜 검증자"""
    
    def __init__(self, date_format: Optional[str] = None, message: Optional[str] = None):
        self.date_format = date_format
        super().__init__(
            message or "Invalid date format",
            "INVALID_DATE"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if isinstance(value, (date, datetime)):
            return True
        
        if not isinstance(value, str):
            return False
        
        try:
            if self.date_format:
                datetime.strptime(value, self.date_format)
            else:
                # ISO 형식 시도
                datetime.fromisoformat(value.replace('Z', '+00:00'))
            return True
        except ValueError:
            return False


class JSONValidator(BaseValidator):
    """JSON 검증자"""
    
    def __init__(self, schema: Optional[Dict] = None, message: Optional[str] = None):
        self.schema = schema
        super().__init__(
            message or "Invalid JSON format",
            "INVALID_JSON"
        )
    
    def validate(self, value: Any, context: Dict[str, Any] = None) -> bool:
        if isinstance(value, dict):
            return True
        
        if not isinstance(value, str):
            return False
        
        try:
            parsed = json.loads(value)
            # 스키마 검증 (간단한 구현)
            if self.schema:
                return self._validate_json_schema(parsed, self.schema)
            return True
        except (json.JSONDecodeError, TypeError):
            return False
    
    def _validate_json_schema(self, data: Any, schema: Dict) -> bool:
        """간단한 JSON 스키마 검증"""
        if "type" in schema:
            expected_type = schema["type"]
            if expected_type == "object" and not isinstance(data, dict):
                return False
            elif expected_type == "array" and not isinstance(data, list):
                return False
            elif expected_type == "string" and not isinstance(data, str):
                return False
            elif expected_type == "number" and not isinstance(data, (int, float)):
                return False
            elif expected_type == "boolean" and not isinstance(data, bool):
                return False
        
        return True


# 다국어 메시지 관리자
class MessageManager:
    """다국어 메시지 관리자"""
    
    def __init__(self):
        self.messages: Dict[str, Dict[str, str]] = {}
        self.default_locale = "en"
        self.current_locale = "en"
        
        # 기본 메시지 로드
        self._load_default_messages()
    
    def _load_default_messages(self):
        """기본 메시지 로드"""
        self.messages["en"] = {
            "REQUIRED": "This field is required",
            "TYPE_MISMATCH": "Invalid type",
            "OUT_OF_RANGE": "Value is out of range",
            "INVALID_LENGTH": "Invalid length",
            "PATTERN_MISMATCH": "Does not match required pattern",
            "INVALID_EMAIL": "Invalid email format",
            "INVALID_UUID": "Invalid UUID format",
            "INVALID_DATE": "Invalid date format",
            "INVALID_JSON": "Invalid JSON format",
            "VALIDATION_FAILED": "Validation failed"
        }
        
        self.messages["ko"] = {
            "REQUIRED": "필수 입력 항목입니다",
            "TYPE_MISMATCH": "잘못된 타입입니다",
            "OUT_OF_RANGE": "값이 허용 범위를 벗어났습니다",
            "INVALID_LENGTH": "길이가 올바르지 않습니다",
            "PATTERN_MISMATCH": "형식이 올바르지 않습니다",
            "INVALID_EMAIL": "이메일 형식이 올바르지 않습니다",
            "INVALID_UUID": "UUID 형식이 올바르지 않습니다",
            "INVALID_DATE": "날짜 형식이 올바르지 않습니다",
            "INVALID_JSON": "JSON 형식이 올바르지 않습니다",
            "VALIDATION_FAILED": "검증에 실패했습니다"
        }
    
    def set_locale(self, locale: str):
        """로케일 설정"""
        self.current_locale = locale
    
    def get_message(self, code: str, locale: Optional[str] = None) -> str:
        """메시지 가져오기"""
        target_locale = locale or self.current_locale
        
        if target_locale in self.messages and code in self.messages[target_locale]:
            return self.messages[target_locale][code]
        
        # 기본 로케일에서 찾기
        if self.default_locale in self.messages and code in self.messages[self.default_locale]:
            return self.messages[self.default_locale][code]
        
        return f"Unknown error: {code}"
    
    def add_messages(self, locale: str, messages: Dict[str, str]):
        """메시지 추가"""
        if locale not in self.messages:
            self.messages[locale] = {}
        self.messages[locale].update(messages)


# 메인 검증 엔진
class ValidationEngine:
    """고도화된 검증 엔진"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
        # 검증자 레지스트리
        self.validators: Dict[str, BaseValidator] = {}
        self.async_validators: Dict[str, Callable] = {}
        self.custom_validators: Dict[str, Callable] = {}
        
        # 메시지 관리자
        self.message_manager = MessageManager()
        
        # 캐시 시스템
        self.cache_enabled = self.config.get('cache_enabled', True)
        self.validation_cache: Dict[str, ValidationResult] = {}
        self.cache_ttl = self.config.get('cache_ttl', 300)  # 5분
        self.cache_timestamps: Dict[str, float] = {}
        
        # 스레드 풀 (비동기 검증용)
        self.thread_pool = ThreadPoolExecutor(
            max_workers=self.config.get('max_workers', 4)
        )
        
        # 성능 메트릭
        self.metrics = {
            'total_validations': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'avg_execution_time': 0.0,
            'error_count': 0
        }
        
        # 기본 검증자 등록
        self._register_builtin_validators()
    
    def _register_builtin_validators(self):
        """내장 검증자 등록"""
        self.validators.update({
            'required': RequiredValidator(),
            'email': EmailValidator(),
            'uuid': UUIDValidator(),
            'uuid4': UUIDValidator(version=4),
            'date': DateValidator(),
            'json': JSONValidator()
        })
    
    def register_validator(self, name: str, validator: Union[BaseValidator, Callable]):
        """커스텀 검증자 등록"""
        if isinstance(validator, BaseValidator):
            self.validators[name] = validator
        elif callable(validator):
            self.custom_validators[name] = validator
        else:
            raise ValidatorRegistrationException(f"Invalid validator type: {type(validator)}")
        
        self.logger.info(f"Registered validator: {name}")
    
    def register_async_validator(self, name: str, validator: AsyncValidatorFunc):
        """비동기 검증자 등록"""
        if not callable(validator):
            raise ValidatorRegistrationException(f"Validator must be callable: {name}")
        
        self.async_validators[name] = validator
        self.logger.info(f"Registered async validator: {name}")
    
    def create_schema(self) -> ValidationSchema:
        """새 검증 스키마 생성"""
        return ValidationSchema()
    
    def validate(self, data: Dict[str, Any], schema: ValidationSchema,
                mode: ValidationMode = ValidationMode.STRICT) -> ValidationResult:
        """동기 검증 수행"""
        start_time = time.time()
        
        # 캐시 확인
        cache_key = self._generate_cache_key(data, schema)
        if self.cache_enabled and self._is_cache_valid(cache_key):
            self.metrics['cache_hits'] += 1
            cached_result = self.validation_cache[cache_key]
            self.logger.debug(f"Cache hit for validation: {cache_key[:16]}...")
            return cached_result
        
        self.metrics['cache_misses'] += 1
        
        # 검증 수행
        result = ValidationResult()
        
        try:
            # 필수 필드 검증
            self._validate_required_fields(data, schema, result)
            
            if mode == ValidationMode.FAST_FAIL and result.has_errors():
                return result
            
            # 필드별 검증
            self._validate_fields(data, schema, result, mode)
            
            # 전역 규칙 검증
            self._validate_global_rules(data, schema, result, mode)
            
            # 메트릭 업데이트
            execution_time = time.time() - start_time
            result.execution_time = execution_time
            self._update_metrics(execution_time, result.has_errors())
            
            # 캐시 저장
            if self.cache_enabled:
                self._cache_result(cache_key, result)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Validation error: {e}")
            result.add_error(ValidationError(
                field="__global__",
                value=None,
                rule="system",
                message=f"Internal validation error: {str(e)}",
                code="SYSTEM_ERROR"
            ))
            return result
    
    async def validate_async(self, data: Dict[str, Any], schema: ValidationSchema,
                           mode: ValidationMode = ValidationMode.STRICT) -> ValidationResult:
        """비동기 검증 수행"""
        start_time = time.time()
        
        # 캐시 확인
        cache_key = self._generate_cache_key(data, schema)
        if self.cache_enabled and self._is_cache_valid(cache_key):
            self.metrics['cache_hits'] += 1
            cached_result = self.validation_cache[cache_key]
            self.logger.debug(f"Cache hit for async validation: {cache_key[:16]}...")
            return cached_result
        
        self.metrics['cache_misses'] += 1
        
        # 비동기 검증 수행
        result = ValidationResult()
        
        try:
            # 동기 검증 먼저 수행
            sync_result = self.validate(data, schema, mode)
            result = sync_result
            
            # 비동기 검증자가 있으면 추가 수행
            if self.async_validators:
                await self._run_async_validators(data, schema, result, mode)
            
            # 메트릭 업데이트
            execution_time = time.time() - start_time
            result.execution_time = execution_time
            self._update_metrics(execution_time, result.has_errors())
            
            # 캐시 저장
            if self.cache_enabled:
                self._cache_result(cache_key, result)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Async validation error: {e}")
            result.add_error(ValidationError(
                field="__global__",
                value=None,
                rule="system",
                message=f"Internal async validation error: {str(e)}",
                code="SYSTEM_ERROR"
            ))
            return result
    
    def validate_batch(self, data_list: List[Dict[str, Any]], schema: ValidationSchema,
                      mode: ValidationMode = ValidationMode.STRICT) -> List[ValidationResult]:
        """배치 검증"""
        results = []
        
        with ThreadPoolExecutor(max_workers=self.config.get('batch_workers', 4)) as executor:
            futures = [
                executor.submit(self.validate, data, schema, mode)
                for data in data_list
            ]
            
            for future in futures:
                results.append(future.result())
        
        return results
    
    async def validate_batch_async(self, data_list: List[Dict[str, Any]], schema: ValidationSchema,
                                 mode: ValidationMode = ValidationMode.STRICT) -> List[ValidationResult]:
        """비동기 배치 검증"""
        tasks = [
            self.validate_async(data, schema, mode)
            for data in data_list
        ]
        
        return await asyncio.gather(*tasks)
    
    def _validate_required_fields(self, data: Dict[str, Any], schema: ValidationSchema,
                                result: ValidationResult):
        """필수 필드 검증"""
        for field_name in schema.required_fields:
            if field_name not in data or data[field_name] is None:
                error = ValidationError(
                    field=field_name,
                    value=data.get(field_name),
                    rule="required",
                    message=self.message_manager.get_message("REQUIRED"),
                    code="REQUIRED"
                )
                result.add_error(error)
            else:
                result.validated_fields.add(field_name)
    
    def _validate_fields(self, data: Dict[str, Any], schema: ValidationSchema,
                        result: ValidationResult, mode: ValidationMode):
        """필드별 검증"""
        for field_name, rules in schema.fields.items():
            if field_name not in data:
                continue
            
            field_value = data[field_name]
            
            for rule in rules:
                if not self._check_rule_conditions(rule, data):
                    continue
                
                is_valid = self._execute_validator(rule, field_value, data)
                
                if not is_valid:
                    error = ValidationError(
                        field=field_name,
                        value=field_value,
                        rule=rule.name,
                        message=self._get_error_message(rule, field_name, field_value),
                        severity=rule.severity,
                        code=rule.code
                    )
                    result.add_error(error)
                    
                    if mode == ValidationMode.FAST_FAIL and error.severity == ValidationSeverity.ERROR:
                        return
                
                result.validated_fields.add(field_name)
    
    def _validate_global_rules(self, data: Dict[str, Any], schema: ValidationSchema,
                             result: ValidationResult, mode: ValidationMode):
        """전역 규칙 검증"""
        for rule in schema.global_rules:
            if not self._check_rule_conditions(rule, data):
                continue
            
            is_valid = self._execute_validator(rule, data, data)
            
            if not is_valid:
                error = ValidationError(
                    field="__global__",
                    value=data,
                    rule=rule.name,
                    message=self._get_error_message(rule, "__global__", data),
                    severity=rule.severity,
                    code=rule.code
                )
                result.add_error(error)
                
                if mode == ValidationMode.FAST_FAIL and error.severity == ValidationSeverity.ERROR:
                    return
    
    def _execute_validator(self, rule: ValidationRule, value: Any, context: Dict[str, Any]) -> bool:
        """검증자 실행"""
        try:
            if isinstance(rule.validator, BaseValidator):
                return rule.validator.validate(value, context)
            elif callable(rule.validator):
                return rule.validator(value)
            else:
                self.logger.error(f"Invalid validator type for rule: {rule.name}")
                return False
        except Exception as e:
            self.logger.error(f"Validator execution error: {rule.name}, {e}")
            return False
    
    async def _run_async_validators(self, data: Dict[str, Any], schema: ValidationSchema,
                                  result: ValidationResult, mode: ValidationMode):
        """비동기 검증자 실행"""
        tasks = []
        
        for field_name, rules in schema.fields.items():
            if field_name not in data:
                continue
            
            for rule in rules:
                if rule.is_async and rule.name in self.async_validators:
                    task = self._run_single_async_validator(
                        rule, field_name, data[field_name], data, result
                    )
                    tasks.append(task)
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _run_single_async_validator(self, rule: ValidationRule, field_name: str,
                                        value: Any, context: Dict[str, Any],
                                        result: ValidationResult):
        """단일 비동기 검증자 실행"""
        try:
            validator = self.async_validators[rule.name]
            is_valid = await validator(value)
            
            if not is_valid:
                error = ValidationError(
                    field=field_name,
                    value=value,
                    rule=rule.name,
                    message=self._get_error_message(rule, field_name, value),
                    severity=rule.severity,
                    code=rule.code
                )
                result.add_error(error)
        except Exception as e:
            self.logger.error(f"Async validator error: {rule.name}, {e}")
    
    def _check_rule_conditions(self, rule: ValidationRule, data: Dict[str, Any]) -> bool:
        """규칙 조건 확인"""
        if not rule.conditions:
            return True
        
        for field, expected_value in rule.conditions.items():
            if field not in data or data[field] != expected_value:
                return False
        
        return True
    
    def _get_error_message(self, rule: ValidationRule, field_name: str, value: Any) -> str:
        """오류 메시지 생성"""
        if rule.message:
            return rule.message
        
        if rule.code:
            return self.message_manager.get_message(rule.code)
        
        return f"Validation failed for field '{field_name}'"
    
    def _generate_cache_key(self, data: Dict[str, Any], schema: ValidationSchema) -> str:
        """캐시 키 생성"""
        data_hash = hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
        schema_hash = hashlib.md5(str(schema).encode()).hexdigest()
        return f"{data_hash}_{schema_hash}"
    
    def _is_cache_valid(self, cache_key: str) -> bool:
        """캐시 유효성 확인"""
        if cache_key not in self.validation_cache:
            return False
        
        if cache_key not in self.cache_timestamps:
            return False
        
        return time.time() - self.cache_timestamps[cache_key] < self.cache_ttl
    
    def _cache_result(self, cache_key: str, result: ValidationResult):
        """결과 캐싱"""
        self.validation_cache[cache_key] = result
        self.cache_timestamps[cache_key] = time.time()
    
    def _update_metrics(self, execution_time: float, has_error: bool):
        """메트릭 업데이트"""
        self.metrics['total_validations'] += 1
        
        if has_error:
            self.metrics['error_count'] += 1
        
        # 이동 평균 계산
        total_validations = self.metrics['total_validations']
        current_avg = self.metrics['avg_execution_time']
        self.metrics['avg_execution_time'] = (
            (current_avg * (total_validations - 1) + execution_time) / total_validations
        )
    
    def clear_cache(self):
        """캐시 정리"""
        self.validation_cache.clear()
        self.cache_timestamps.clear()
        self.logger.info("Validation cache cleared")
    
    def get_metrics(self) -> Dict[str, Any]:
        """메트릭 반환"""
        cache_hit_rate = (
            self.metrics['cache_hits'] / 
            (self.metrics['cache_hits'] + self.metrics['cache_misses']) * 100
            if (self.metrics['cache_hits'] + self.metrics['cache_misses']) > 0 else 0
        )
        
        return {
            **self.metrics,
            'cache_hit_rate': round(cache_hit_rate, 2),
            'cache_size': len(self.validation_cache),
            'registered_validators': len(self.validators),
            'async_validators': len(self.async_validators)
        }
    
    def set_locale(self, locale: str):
        """로케일 설정"""
        self.message_manager.set_locale(locale)
    
    def add_messages(self, locale: str, messages: Dict[str, str]):
        """메시지 추가"""
        self.message_manager.add_messages(locale, messages)


# 스키마 빌더
class SchemaBuilder:
    """검증 스키마 빌더"""
    
    def __init__(self, engine: ValidationEngine):
        self.engine = engine
        self.schema = ValidationSchema()
    
    def require(self, *field_names: str) -> 'SchemaBuilder':
        """필수 필드 설정"""
        for field_name in field_names:
            self.schema.add_required_field(field_name)
        return self
    
    def optional(self, *field_names: str) -> 'SchemaBuilder':
        """선택 필드 설정"""
        for field_name in field_names:
            self.schema.add_optional_field(field_name)
        return self
    
    def field(self, field_name: str) -> 'FieldBuilder':
        """필드 빌더 반환"""
        return FieldBuilder(self, field_name)
    
    def global_rule(self, name: str, validator: Union[ValidatorFunc, str],
                   message: Optional[str] = None, 
                   severity: ValidationSeverity = ValidationSeverity.ERROR) -> 'SchemaBuilder':
        """전역 규칙 추가"""
        if isinstance(validator, str) and validator in self.engine.validators:
            validator_obj = self.engine.validators[validator]
        elif callable(validator):
            validator_obj = validator
        else:
            raise ValueError(f"Invalid validator: {validator}")
        
        rule = ValidationRule(
            name=name,
            validator=validator_obj,
            message=message,
            severity=severity
        )
        self.schema.global_rules.append(rule)
        return self
    
    def build(self) -> ValidationSchema:
        """스키마 생성"""
        return self.schema


class FieldBuilder:
    """필드 빌더"""
    
    def __init__(self, schema_builder: SchemaBuilder, field_name: str):
        self.schema_builder = schema_builder
        self.field_name = field_name
    
    def required(self) -> 'FieldBuilder':
        """필수 필드로 설정"""
        self.schema_builder.schema.add_required_field(self.field_name)
        return self
    
    def type(self, expected_type: Type, message: Optional[str] = None) -> 'FieldBuilder':
        """타입 검증 추가"""
        validator = TypeValidator(expected_type, message)
        rule = ValidationRule(
            name=f"type_{expected_type.__name__}",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def length(self, min_length: Optional[int] = None, max_length: Optional[int] = None,
              message: Optional[str] = None) -> 'FieldBuilder':
        """길이 검증 추가"""
        validator = LengthValidator(min_length, max_length, message)
        rule = ValidationRule(
            name="length",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def range(self, min_val: Optional[Union[int, float]] = None,
             max_val: Optional[Union[int, float]] = None,
             message: Optional[str] = None) -> 'FieldBuilder':
        """범위 검증 추가"""
        validator = RangeValidator(min_val, max_val, message)
        rule = ValidationRule(
            name="range",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def pattern(self, pattern: str, flags: int = 0, message: Optional[str] = None) -> 'FieldBuilder':
        """정규식 검증 추가"""
        validator = RegexValidator(pattern, flags, message)
        rule = ValidationRule(
            name="pattern",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def email(self, message: Optional[str] = None) -> 'FieldBuilder':
        """이메일 검증 추가"""
        validator = EmailValidator(message)
        rule = ValidationRule(
            name="email",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def uuid(self, version: Optional[int] = None, message: Optional[str] = None) -> 'FieldBuilder':
        """UUID 검증 추가"""
        validator = UUIDValidator(version, message)
        rule = ValidationRule(
            name=f"uuid{version or ''}",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def date(self, date_format: Optional[str] = None, message: Optional[str] = None) -> 'FieldBuilder':
        """날짜 검증 추가"""
        validator = DateValidator(date_format, message)
        rule = ValidationRule(
            name="date",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def json(self, schema: Optional[Dict] = None, message: Optional[str] = None) -> 'FieldBuilder':
        """JSON 검증 추가"""
        validator = JSONValidator(schema, message)
        rule = ValidationRule(
            name="json",
            validator=validator,
            message=message or validator.message,
            code=validator.code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def custom(self, name: str, validator: ValidatorFunc, message: Optional[str] = None,
              severity: ValidationSeverity = ValidationSeverity.ERROR,
              code: Optional[str] = None) -> 'FieldBuilder':
        """커스텀 검증 추가"""
        rule = ValidationRule(
            name=name,
            validator=validator,
            message=message,
            severity=severity,
            code=code
        )
        self.schema_builder.schema.add_field_rule(self.field_name, rule)
        return self
    
    def when(self, conditions: Dict[str, Any]) -> 'FieldBuilder':
        """조건부 검증"""
        # 마지막 규칙에 조건 추가
        if self.field_name in self.schema_builder.schema.fields:
            rules = self.schema_builder.schema.fields[self.field_name]
            if rules:
                rules[-1].conditions.update(conditions)
        return self
    
    def end(self) -> SchemaBuilder:
        """필드 빌더 종료"""
        return self.schema_builder


# 고급 검증 헬퍼들
class EnhancedValidationHelpers:
    """고도화된 검증 헬퍼 클래스"""
    
    def __init__(self, engine: Optional[ValidationEngine] = None):
        self.engine = engine or ValidationEngine()
        self._setup_common_validators()
    
    def _setup_common_validators(self):
        """공통 검증자 설정"""
        # 사용자 ID 검증자
        self.engine.register_validator('user_id', UUIDValidator(version=4, message="Invalid user ID format"))
        
        # 프로젝트 ID 검증자  
        self.engine.register_validator('project_id', UUIDValidator(version=4, message="Invalid project ID format"))
        
        # 대화 ID 검증자
        self.engine.register_validator('conversation_id', UUIDValidator(version=4, message="Invalid conversation ID format"))
        
        # 사용자명 검증자
        self.engine.register_validator('username', LengthValidator(1, 50, "Username must be 1-50 characters"))
        
        # 액션 검증자
        valid_actions = ['save', 'load', 'list', 'delete', 'search']
        self.engine.register_validator('action', lambda x: x in valid_actions)
    
    def create_user_schema(self) -> ValidationSchema:
        """사용자 검증 스키마 생성"""
        return (SchemaBuilder(self.engine)
                .require('user_id', 'username')
                .field('user_id').uuid(version=4).end()
                .field('username').length(1, 50).end()
                .field('email').email().end()
                .build())
    
    def create_conversation_schema(self) -> ValidationSchema:
        """대화 검증 스키마 생성"""
        return (SchemaBuilder(self.engine)
                .require('conversation_id', 'title', 'messages')
                .field('conversation_id').uuid(version=4).end()
                .field('title').length(1, 200).end()
                .field('messages').json().end()
                .field('metadata').json().end()
                .build())
    
    def validate_user_data(self, data: Dict[str, Any]) -> ValidationResult:
        """사용자 데이터 검증"""
        schema = self.create_user_schema()
        return self.engine.validate(data, schema)
    
    def validate_conversation_data(self, data: Dict[str, Any]) -> ValidationResult:
        """대화 데이터 검증"""
        schema = self.create_conversation_schema()
        result = self.engine.validate(data, schema)
        
        # 추가 메시지 검증
        if 'messages' in data and result.is_valid:
            try:
                messages = json.loads(data['messages']) if isinstance(data['messages'], str) else data['messages']
                message_validation = self._validate_messages(messages)
                
                for error in message_validation.errors:
                    result.add_error(error)
                for warning in message_validation.warnings:
                    result.add_error(warning)
                    
            except Exception as e:
                result.add_error(ValidationError(
                    field='messages',
                    value=data['messages'],
                    rule='message_format',
                    message=f"Invalid message format: {str(e)}",
                    code='INVALID_MESSAGE_FORMAT'
                ))
        
        return result
    
    def _validate_messages(self, messages: List[Dict[str, Any]]) -> ValidationResult:
        """메시지 목록 검증"""
        result = ValidationResult()
        
        if not isinstance(messages, list):
            result.add_error(ValidationError(
                field='messages',
                value=messages,
                rule='type',
                message='Messages must be a list',
                code='TYPE_MISMATCH'
            ))
            return result
        
        valid_roles = ['user', 'assistant', 'system']
        
        for i, message in enumerate(messages):
            if not isinstance(message, dict):
                result.add_error(ValidationError(
                    field=f'messages[{i}]',
                    value=message,
                    rule='type', 
                    message=f'Message {i + 1} must be an object',
                    code='TYPE_MISMATCH'
                ))
                continue
            
            # 필수 필드 검증
            for required_field in ['role', 'content']:
                if required_field not in message:
                    result.add_error(ValidationError(
                        field=f'messages[{i}].{required_field}',
                        value=None,
                        rule='required',
                        message=f'Message {i + 1} missing required field: {required_field}',
                        code='REQUIRED'
                    ))
            
            # role 검증
            if 'role' in message and message['role'] not in valid_roles:
                result.add_error(ValidationError(
                    field=f'messages[{i}].role',
                    value=message['role'],
                    rule='enum',
                    message=f'Message {i + 1} has invalid role. Must be one of: {", ".join(valid_roles)}',
                    code='INVALID_ENUM'
                ))
            
            # content 검증
            if 'content' in message and not isinstance(message['content'], str):
                result.add_error(ValidationError(
                    field=f'messages[{i}].content',
                    value=message['content'],
                    rule='type',
                    message=f'Message {i + 1} content must be a string',
                    code='TYPE_MISMATCH'
                ))
        
        return result
    
    async def validate_user_data_async(self, data: Dict[str, Any]) -> ValidationResult:
        """비동기 사용자 데이터 검증"""
        schema = self.create_user_schema()
        return await self.engine.validate_async(data, schema)
    
    async def validate_conversation_data_async(self, data: Dict[str, Any]) -> ValidationResult:
        """비동기 대화 데이터 검증"""
        schema = self.create_conversation_schema()
        return await self.engine.validate_async(data, schema)


# 전역 인스턴스 및 편의 함수들
_default_engine = None
_default_helpers = None

def get_validation_engine(config: Optional[Dict[str, Any]] = None) -> ValidationEngine:
    """기본 검증 엔진 반환"""
    global _default_engine
    if _default_engine is None:
        _default_engine = ValidationEngine(config)
    return _default_engine

def get_validation_helpers(engine: Optional[ValidationEngine] = None) -> EnhancedValidationHelpers:
    """기본 검증 헬퍼 반환"""
    global _default_helpers
    if _default_helpers is None:
        _default_helpers = EnhancedValidationHelpers(engine)
    return _default_helpers

# 편의 함수들 (하위 호환성)
def is_valid_user_id(user_id: str) -> bool:
    """사용자 ID 검증 (편의 함수)"""
    validator = UUIDValidator(version=4)
    return validator.validate(user_id)

def is_valid_project_id(project_id: str) -> bool:
    """프로젝트 ID 검증 (편의 함수)"""
    return is_valid_user_id(project_id)

def is_valid_conversation_id(conversation_id: str) -> bool:
    """대화 ID 검증 (편의 함수)"""
    return is_valid_user_id(conversation_id)

def is_valid_email(email: Optional[str]) -> bool:
    """이메일 검증 (편의 함수)"""
    if not email:
        return True
    validator = EmailValidator()
    return validator.validate(email)

def validate_required_fields(data: dict, required_fields: List[str]) -> None:
    """필수 필드 검증 (편의 함수)"""
    engine = get_validation_engine()
    schema = engine.create_schema()
    
    for field in required_fields:
        schema.add_required_field(field)
    
    result = engine.validate(data, schema)
    
    if not result.is_valid:
        raise ValidationException("Required field validation failed", result)

def validate_conversation_save_parameters(conversation_id: str, title: str, messages: str) -> List[dict]:
    """대화 저장 파라미터 검증 (편의 함수)"""
    helpers = get_validation_helpers()
    
    data = {
        'conversation_id': conversation_id,
        'title': title,
        'messages': messages
    }
    
    result = helpers.validate_conversation_data(data)
    
    if not result.is_valid:
        error_messages = result.get_error_messages()
        raise ValidationException(f"Validation failed: {'; '.join(error_messages)}", result)
    
    return json.loads(messages) if isinstance(messages, str) else messages

# 데코레이터
def validate_input(schema_func: Callable[[], ValidationSchema], 
                  mode: ValidationMode = ValidationMode.STRICT):
    """입력 검증 데코레이터"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 첫 번째 인자가 dict인 경우 검증
            if args and isinstance(args[0], dict):
                engine = get_validation_engine()
                schema = schema_func()
                result = engine.validate(args[0], schema, mode)
                
                if not result.is_valid:
                    raise ValidationException("Input validation failed", result)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def validate_input_async(schema_func: Callable[[], ValidationSchema],
                        mode: ValidationMode = ValidationMode.STRICT):
    """비동기 입력 검증 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 첫 번째 인자가 dict인 경우 검증
            if args and isinstance(args[0], dict):
                engine = get_validation_engine()
                schema = schema_func()
                result = await engine.validate_async(args[0], schema, mode)
                
                if not result.is_valid:
                    raise ValidationException("Input validation failed", result)
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# 하위 호환성을 위한 별칭
ValidationHelpers = EnhancedValidationHelpers
ConversationValidationHelpers = EnhancedValidationHelpers
UserValidationHelper = EnhancedValidationHelpers

# 스키마 예제들
def create_example_schemas():
    """예제 스키마들"""
    engine = get_validation_engine()
    
    # 사용자 등록 스키마
    user_registration_schema = (
        SchemaBuilder(engine)
        .require('username', 'email', 'password')
        .field('username').length(3, 50).pattern(r'^[a-zA-Z0-9_]+$').end()
        .field('email').email().end()
        .field('password').length(8, 128).end()
        .field('age').type(int).range(13, 120).end()
        .build()
    )
    
    # API 요청 스키마
    api_request_schema = (
        SchemaBuilder(engine)
        .require('action')
        .field('action').custom('valid_action', lambda x: x in ['create', 'read', 'update', 'delete']).end()
        .field('data').json().end()
        .build()
    )
    
    return {
        'user_registration': user_registration_schema,
        'api_request': api_request_schema
    }

if __name__ == "__main__":
    # 사용 예제
    import asyncio
    
    async def main():
        # 엔진 생성
        engine = ValidationEngine({
            'cache_enabled': True,
            'cache_ttl': 300,
            'max_workers': 4
        })
        
        # 한국어 메시지 설정
        engine.set_locale('ko')
        
        # 사용자 데이터 검증 예제
        helpers = EnhancedValidationHelpers(engine)
        
        user_data = {
            'user_id': '550e8400-e29b-41d4-a716-446655440000',
            'username': 'testuser',
            'email': 'test@example.com'
        }
        
        result = helpers.validate_user_data(user_data)
        print(f"사용자 검증 결과: {result.is_valid}")
        
        if not result.is_valid:
            for error in result.errors:
                print(f"오류: {error.field} - {error.message}")
        
        # 비동기 검증 예제
        async_result = await helpers.validate_user_data_async(user_data)
        print(f"비동기 검증 결과: {async_result.is_valid}")
        
        # 메트릭 출력
        metrics = engine.get_metrics()
        print(f"검증 메트릭: {metrics}")
    
    # 스크립트로 실행할 때만 예제 실행
    asyncio.run(main())