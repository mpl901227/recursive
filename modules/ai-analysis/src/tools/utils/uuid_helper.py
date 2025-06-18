#!/usr/bin/env python3
"""
Enhanced UUID Helper Utilities
JavaScript uuid-helper.js를 Python으로 포팅하고 고도화

주요 개선사항:
- 다양한 UUID 버전 지원 (v1, v3, v4, v5, v6, v7, v8)
- UUID 정보 분석 및 파싱
- 커스텀 UUID 네임스페이스 지원
- 성능 최적화된 배치 생성
- 데이터베이스 친화적 UUID 형식
- 보안 강화된 랜덤 생성
- UUID 히스토리 및 추적
- 다양한 인코딩 형식 지원
"""

import uuid
import os
import time
import hashlib
import base64
import secrets
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Union, Tuple, NamedTuple
from dataclasses import dataclass, field
from enum import Enum
import logging
import re
from pathlib import Path
import json

# 로깅 설정
logger = logging.getLogger(__name__)


class UUIDVersion(Enum):
    """UUID 버전"""
    V1 = 1  # 시간 기반
    V2 = 2  # DCE 보안 (거의 사용 안함)
    V3 = 3  # MD5 해시 기반
    V4 = 4  # 랜덤
    V5 = 5  # SHA-1 해시 기반
    V6 = 6  # 재정렬된 시간 기반 (RFC 4122bis)
    V7 = 7  # Unix Timestamp 기반 (RFC 4122bis)
    V8 = 8  # 사용자 정의 (RFC 4122bis)


class UUIDFormat(Enum):
    """UUID 출력 형식"""
    STANDARD = "standard"        # 8-4-4-4-12
    COMPACT = "compact"          # 32자리 연속
    BRACED = "braced"           # {8-4-4-4-12}
    PARENTHESES = "parentheses" # (8-4-4-4-12)
    URN = "urn"                 # urn:uuid:8-4-4-4-12
    BASE64 = "base64"           # Base64 인코딩
    BASE32 = "base32"           # Base32 인코딩
    SHORT = "short"             # 22자리 Base64 (패딩 제거)


@dataclass
class UUIDInfo:
    """UUID 정보 분석 결과"""
    uuid_str: str
    version: Optional[int]
    variant: str
    is_valid: bool
    timestamp: Optional[datetime] = None
    node: Optional[str] = None  # MAC 주소 (v1에서)
    clock_seq: Optional[int] = None  # 클록 시퀀스 (v1에서)
    namespace: Optional[str] = None  # 네임스페이스 (v3, v5에서)
    name: Optional[str] = None  # 이름 (v3, v5에서)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ValidationResult:
    """UUID 검증 결과"""
    is_valid: bool
    error_message: Optional[str] = None
    uuid_info: Optional[UUIDInfo] = None
    suggestions: List[str] = field(default_factory=list)


class UUIDNamespace:
    """표준 및 커스텀 네임스페이스"""
    
    # RFC 4122 표준 네임스페이스
    DNS = uuid.NAMESPACE_DNS
    URL = uuid.NAMESPACE_URL  
    OID = uuid.NAMESPACE_OID
    X500 = uuid.NAMESPACE_X500
    
    # 커스텀 네임스페이스들
    _custom_namespaces: Dict[str, uuid.UUID] = {}
    
    @classmethod
    def register_namespace(cls, name: str, namespace_uuid: Union[str, uuid.UUID]) -> uuid.UUID:
        """커스텀 네임스페이스 등록"""
        if isinstance(namespace_uuid, str):
            namespace_uuid = uuid.UUID(namespace_uuid)
        
        cls._custom_namespaces[name] = namespace_uuid
        logger.info(f"Registered custom namespace: {name} -> {namespace_uuid}")
        return namespace_uuid
    
    @classmethod
    def get_namespace(cls, name: str) -> Optional[uuid.UUID]:
        """네임스페이스 조회"""
        # 표준 네임스페이스 확인
        if hasattr(cls, name.upper()):
            return getattr(cls, name.upper())
        
        # 커스텀 네임스페이스 확인
        return cls._custom_namespaces.get(name)
    
    @classmethod
    def list_namespaces(cls) -> Dict[str, str]:
        """모든 네임스페이스 목록"""
        result = {
            'DNS': str(cls.DNS),
            'URL': str(cls.URL),
            'OID': str(cls.OID),
            'X500': str(cls.X500)
        }
        
        for name, ns_uuid in cls._custom_namespaces.items():
            result[name] = str(ns_uuid)
        
        return result


class EnhancedUUIDHelper:
    """고도화된 UUID 헬퍼 클래스"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.default_version = UUIDVersion(self.config.get('default_version', 4))
        self.default_format = UUIDFormat(self.config.get('default_format', 'standard'))
        
        # 성능 최적화를 위한 캐시
        self._validation_cache: Dict[str, ValidationResult] = {}
        self._cache_lock = threading.RLock()
        
        # UUID 생성 통계
        self.stats = {
            'total_generated': 0,
            'by_version': {v.value: 0 for v in UUIDVersion},
            'validation_requests': 0,
            'validation_cache_hits': 0
        }
        
        # 보안 강화를 위한 랜덤 시드
        self._secure_random = secrets.SystemRandom()
        
        # UUID 히스토리 (선택적)
        self.enable_history = self.config.get('enable_history', False)
        self.history: List[Dict[str, Any]] = []
        self.max_history_size = self.config.get('max_history_size', 1000)
    
    def generate_uuid(self, 
                     version: Optional[UUIDVersion] = None,
                     output_format: Optional[UUIDFormat] = None,
                     namespace: Optional[Union[str, uuid.UUID]] = None,
                     name: Optional[str] = None,
                     node: Optional[int] = None) -> str:
        """
        UUID 생성 (다양한 버전 지원)
        
        Args:
            version: UUID 버전
            output_format: 출력 형식
            namespace: 네임스페이스 (v3, v5용)
            name: 이름 (v3, v5용)
            node: 노드 ID (v1용)
        """
        version = version or self.default_version
        output_format = output_format or self.default_format
        
        try:
            # 버전별 UUID 생성
            if version == UUIDVersion.V1:
                generated_uuid = uuid.uuid1(node=node)
            
            elif version == UUIDVersion.V3:
                if not namespace or not name:
                    raise ValueError("v3 UUID requires namespace and name")
                ns_uuid = self._resolve_namespace(namespace)
                generated_uuid = uuid.uuid3(ns_uuid, name)
            
            elif version == UUIDVersion.V4:
                generated_uuid = uuid.uuid4()
            
            elif version == UUIDVersion.V5:
                if not namespace or not name:
                    raise ValueError("v5 UUID requires namespace and name")
                ns_uuid = self._resolve_namespace(namespace)
                generated_uuid = uuid.uuid5(ns_uuid, name)
            
            elif version == UUIDVersion.V6:
                # v6는 v1을 기반으로 시간 순서 개선
                generated_uuid = self._generate_uuid_v6(node)
            
            elif version == UUIDVersion.V7:
                # v7은 Unix timestamp 기반
                generated_uuid = self._generate_uuid_v7()
            
            elif version == UUIDVersion.V8:
                # v8은 사용자 정의
                generated_uuid = self._generate_uuid_v8()
            
            else:
                raise ValueError(f"Unsupported UUID version: {version}")
            
            # 통계 업데이트
            self.stats['total_generated'] += 1
            self.stats['by_version'][version.value] += 1
            
            # 히스토리 기록
            if self.enable_history:
                self._record_history('generate', {
                    'uuid': str(generated_uuid),
                    'version': version.value,
                    'format': output_format.value,
                    'namespace': str(namespace) if namespace else None,
                    'name': name
                })
            
            return self._format_uuid(generated_uuid, output_format)
            
        except Exception as e:
            logger.error(f"UUID 생성 실패: {e}")
            raise
    
    def _generate_uuid_v6(self, node: Optional[int] = None) -> uuid.UUID:
        """UUID v6 생성 (시간 순서 최적화)"""
        # v1 UUID를 생성하고 시간 부분을 재배열
        v1_uuid = uuid.uuid1(node=node)
        
        # v1의 시간 필드를 재배열하여 v6 만들기
        time_low = v1_uuid.time_low
        time_mid = v1_uuid.time_mid
        time_hi = v1_uuid.time_hi_version & 0x0fff
        
        # v6 형식으로 재배열: time_hi + time_mid + time_low
        v6_time_hi = ((time_hi << 16) | time_mid) & 0xffffffff
        v6_time_mid = (time_low >> 16) & 0xffff
        v6_time_low = time_low & 0xffff
        
        # v6 UUID 구성
        fields = (
            v6_time_hi,
            v6_time_mid,
            (6 << 12) | v6_time_low,  # version 6
            v1_uuid.clock_seq_hi_variant,
            v1_uuid.clock_seq_low,
            v1_uuid.node
        )
        
        return uuid.UUID(fields=fields)
    
    def _generate_uuid_v7(self) -> uuid.UUID:
        """UUID v7 생성 (Unix timestamp 기반)"""
        # 현재 Unix timestamp (ms)
        timestamp_ms = int(time.time() * 1000)
        
        # 랜덤 비트 생성
        rand_a = self._secure_random.getrandbits(12)
        rand_b = self._secure_random.getrandbits(62)
        
        # v7 UUID 구성
        time_hi = (timestamp_ms >> 16) & 0xffffffff
        time_mid = timestamp_ms & 0xffff
        time_low = (7 << 12) | rand_a  # version 7
        
        clock_seq_hi = 0x80 | ((rand_b >> 56) & 0x3f)  # variant bits
        clock_seq_low = (rand_b >> 48) & 0xff
        node = rand_b & 0xffffffffffff
        
        fields = (time_hi, time_mid, time_low, clock_seq_hi, clock_seq_low, node)
        return uuid.UUID(fields=fields)
    
    def _generate_uuid_v8(self) -> uuid.UUID:
        """UUID v8 생성 (사용자 정의)"""
        # 완전 랜덤하지만 v8 포맷 준수
        fields = (
            self._secure_random.getrandbits(32),  # time_hi
            self._secure_random.getrandbits(16),  # time_mid
            (8 << 12) | self._secure_random.getrandbits(12),  # version 8
            0x80 | self._secure_random.getrandbits(6),  # variant
            self._secure_random.getrandbits(8),
            self._secure_random.getrandbits(48)
        )
        return uuid.UUID(fields=fields)
    
    def _resolve_namespace(self, namespace: Union[str, uuid.UUID]) -> uuid.UUID:
        """네임스페이스 해결"""
        if isinstance(namespace, uuid.UUID):
            return namespace
        
        if isinstance(namespace, str):
            # 표준 또는 커스텀 네임스페이스에서 찾기
            ns_uuid = UUIDNamespace.get_namespace(namespace)
            if ns_uuid:
                return ns_uuid
            
            # UUID 문자열로 파싱 시도
            try:
                return uuid.UUID(namespace)
            except ValueError:
                pass
        
        raise ValueError(f"Invalid namespace: {namespace}")
    
    def _format_uuid(self, uuid_obj: uuid.UUID, output_format: UUIDFormat) -> str:
        """UUID 형식 변환"""
        if output_format == UUIDFormat.STANDARD:
            return str(uuid_obj)
        elif output_format == UUIDFormat.COMPACT:
            return str(uuid_obj).replace('-', '')
        elif output_format == UUIDFormat.BRACED:
            return f"{{{uuid_obj}}}"
        elif output_format == UUIDFormat.PARENTHESES:
            return f"({uuid_obj})"
        elif output_format == UUIDFormat.URN:
            return f"urn:uuid:{uuid_obj}"
        elif output_format == UUIDFormat.BASE64:
            return base64.b64encode(uuid_obj.bytes).decode('ascii')
        elif output_format == UUIDFormat.BASE32:
            return base64.b32encode(uuid_obj.bytes).decode('ascii')
        elif output_format == UUIDFormat.SHORT:
            return base64.b64encode(uuid_obj.bytes).decode('ascii').rstrip('=')
        else:
            return str(uuid_obj)
    
    def validate_uuid(self, uuid_str: str, field_name: str = "UUID") -> ValidationResult:
        """
        UUID 검증 (캐싱 지원)
        
        Args:
            uuid_str: 검증할 UUID 문자열
            field_name: 필드명 (오류 메시지용)
        """
        self.stats['validation_requests'] += 1
        
        # 캐시 확인
        with self._cache_lock:
            if uuid_str in self._validation_cache:
                self.stats['validation_cache_hits'] += 1
                return self._validation_cache[uuid_str]
        
        result = self._validate_uuid_internal(uuid_str, field_name)
        
        # 캐시 저장 (크기 제한)
        with self._cache_lock:
            if len(self._validation_cache) >= 1000:
                # LRU 방식으로 오래된 항목 제거
                oldest_key = next(iter(self._validation_cache))
                del self._validation_cache[oldest_key]
            
            self._validation_cache[uuid_str] = result
        
        return result
    
    def _validate_uuid_internal(self, uuid_str: str, field_name: str) -> ValidationResult:
        """내부 UUID 검증 로직"""
        if not uuid_str:
            return ValidationResult(
                is_valid=False,
                error_message=f"{field_name}가 제공되지 않았습니다.",
                suggestions=["UUID 문자열을 제공해주세요."]
            )
        
        if not isinstance(uuid_str, str):
            return ValidationResult(
                is_valid=False,
                error_message=f"{field_name}는 문자열이어야 합니다.",
                suggestions=["UUID를 문자열 형태로 제공해주세요."]
            )
        
        # 다양한 형식 시도
        cleaned_uuid = self._clean_uuid_string(uuid_str)
        
        try:
            uuid_obj = uuid.UUID(cleaned_uuid)
            uuid_info = self._analyze_uuid(uuid_obj, uuid_str)
            
            return ValidationResult(
                is_valid=True,
                uuid_info=uuid_info
            )
            
        except ValueError as e:
            suggestions = self._generate_validation_suggestions(uuid_str)
            
            return ValidationResult(
                is_valid=False,
                error_message=f"유효하지 않은 {field_name} 형식입니다: {str(e)}",
                suggestions=suggestions
            )
    
    def _clean_uuid_string(self, uuid_str: str) -> str:
        """UUID 문자열 정리"""
        # 공백 제거
        cleaned = uuid_str.strip()
        
        # 중괄호, 괄호 제거
        cleaned = cleaned.strip('{}()')
        
        # URN 접두사 제거
        if cleaned.startswith('urn:uuid:'):
            cleaned = cleaned[9:]
        
        # Base64/Base32 디코딩 시도
        if len(cleaned) == 22 or len(cleaned) == 24:  # Base64 (패딩 유무)
            try:
                # Base64 디코딩 시도
                if len(cleaned) == 22:
                    cleaned += '=='  # 패딩 추가
                decoded_bytes = base64.b64decode(cleaned)
                if len(decoded_bytes) == 16:
                    return str(uuid.UUID(bytes=decoded_bytes))
            except Exception:
                pass
        
        # 하이픈이 없는 32자리 문자열인 경우 하이픈 추가
        if len(cleaned) == 32 and '-' not in cleaned:
            cleaned = f"{cleaned[:8]}-{cleaned[8:12]}-{cleaned[12:16]}-{cleaned[16:20]}-{cleaned[20:]}"
        
        return cleaned
    
    def _analyze_uuid(self, uuid_obj: uuid.UUID, original_str: str) -> UUIDInfo:
        """UUID 정보 분석"""
        info = UUIDInfo(
            uuid_str=original_str,
            version=uuid_obj.version,
            variant=self._get_variant_name(uuid_obj.variant),
            is_valid=True
        )
        
        # 버전별 추가 정보
        if uuid_obj.version == 1:
            info.timestamp = datetime.fromtimestamp(
                (uuid_obj.time - 0x01b21dd213814000) / 1e7,
                tz=timezone.utc
            )
            info.node = f"{uuid_obj.node:012x}"
            info.clock_seq = uuid_obj.clock_seq
        
        return info
    
    def _get_variant_name(self, variant: str) -> str:
        """변형(variant) 이름 반환"""
        if variant == uuid.RFC_4122:
            return "RFC 4122"
        elif variant == uuid.RESERVED_NCS:
            return "Reserved NCS"
        elif variant == uuid.RESERVED_MICROSOFT:
            return "Reserved Microsoft"
        elif variant == uuid.RESERVED_FUTURE:
            return "Reserved Future"
        else:
            return "Unknown"
    
    def _generate_validation_suggestions(self, uuid_str: str) -> List[str]:
        """검증 실패 시 제안사항 생성"""
        suggestions = []
        
        if not uuid_str:
            suggestions.append("UUID 문자열을 제공해주세요.")
            return suggestions
        
        # 길이 확인
        cleaned = uuid_str.strip().strip('{}()')
        if len(cleaned) == 32:
            suggestions.append("하이픈이 없는 UUID인 것 같습니다. 하이픈을 추가해보세요.")
        elif len(cleaned) < 32:
            suggestions.append("UUID가 너무 짧습니다. 완전한 UUID를 입력해주세요.")
        elif len(cleaned) > 36:
            suggestions.append("UUID가 너무 깁니다. 표준 UUID 형식을 확인해주세요.")
        
        # 문자 확인
        if not re.match(r'^[0-9a-fA-F\-{}() :]+$', uuid_str):
            suggestions.append("UUID에 유효하지 않은 문자가 포함되어 있습니다.")
        
        # 형식 제안
        suggestions.append("표준 UUID 형식: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")
        suggestions.append("또는 generate_uuid() 함수를 사용해서 새 UUID를 생성하세요.")
        
        return suggestions
    
    def _record_history(self, operation: str, data: Dict[str, Any]) -> None:
        """히스토리 기록"""
        if not self.enable_history:
            return
        
        history_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'operation': operation,
            **data
        }
        
        self.history.append(history_entry)
        
        # 히스토리 크기 제한
        if len(self.history) > self.max_history_size:
            self.history = self.history[-self.max_history_size:]
    
    def is_valid_uuid(self, uuid_str: str) -> bool:
        """간단한 UUID 유효성 검사"""
        return self.validate_uuid(uuid_str).is_valid
    
    def generate_test_uuid(self, prefix: str = "") -> str:
        """테스트용 UUID 생성"""
        test_uuid = self.generate_uuid()
        
        if prefix:
            # 접두사를 메타데이터로 기록
            if self.enable_history:
                self._record_history('generate_test', {
                    'uuid': test_uuid,
                    'prefix': prefix,
                    'purpose': 'testing'
                })
        
        return test_uuid
    
    def get_default_user_id(self) -> Optional[str]:
        """기본 사용자 ID 가져오기 (환경변수에서)"""
        default_user_id = os.getenv('DEFAULT_USER_ID')
        
        if not default_user_id:
            logger.debug("DEFAULT_USER_ID 환경변수가 설정되지 않음")
            return None
        
        if not self.is_valid_uuid(default_user_id):
            logger.warning(f"DEFAULT_USER_ID가 유효한 UUID가 아님: {default_user_id}")
            return None
        
        logger.debug(f"기본 사용자 ID 반환: {default_user_id}")
        return default_user_id
    
    def batch_generate_uuids(self, 
                           count: int,
                           version: Optional[UUIDVersion] = None,
                           output_format: Optional[UUIDFormat] = None) -> List[str]:
        """배치 UUID 생성 (성능 최적화)"""
        if count <= 0:
            return []
        
        if count > 10000:
            logger.warning(f"대량 UUID 생성 요청: {count}개")
        
        version = version or self.default_version
        output_format = output_format or self.default_format
        
        # v4 UUID의 경우 최적화된 배치 생성
        if version == UUIDVersion.V4:
            return [self._format_uuid(uuid.uuid4(), output_format) for _ in range(count)]
        
        # 다른 버전은 일반 생성
        return [self.generate_uuid(version, output_format) for _ in range(count)]
    
    def convert_format(self, uuid_str: str, target_format: UUIDFormat) -> str:
        """UUID 형식 변환"""
        validation_result = self.validate_uuid(uuid_str)
        if not validation_result.is_valid:
            raise ValueError(validation_result.error_message)
        
        # 표준 UUID 객체로 변환
        cleaned = self._clean_uuid_string(uuid_str)
        uuid_obj = uuid.UUID(cleaned)
        
        return self._format_uuid(uuid_obj, target_format)
    
    def get_uuid_info(self, uuid_str: str) -> Optional[UUIDInfo]:
        """UUID 상세 정보 조회"""
        validation_result = self.validate_uuid(uuid_str)
        return validation_result.uuid_info if validation_result.is_valid else None
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 정보 반환"""
        return {
            **self.stats,
            'cache_size': len(self._validation_cache),
            'cache_hit_rate': (
                self.stats['validation_cache_hits'] / self.stats['validation_requests'] * 100
                if self.stats['validation_requests'] > 0 else 0
            ),
            'history_size': len(self.history) if self.enable_history else 0
        }
    
    def clear_cache(self) -> None:
        """캐시 정리"""
        with self._cache_lock:
            self._validation_cache.clear()
        logger.info("UUID validation cache cleared")
    
    def export_history(self, file_path: Optional[str] = None) -> str:
        """히스토리 내보내기"""
        if not self.enable_history:
            raise RuntimeError("History is not enabled")
        
        if not file_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_path = f"uuid_history_{timestamp}.json"
        
        history_data = {
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'total_entries': len(self.history),
            'stats': self.get_stats(),
            'history': self.history
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(history_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"UUID history exported to: {file_path}")
        return file_path
    
    def benchmark_generation(self, count: int = 10000) -> Dict[str, Any]:
        """UUID 생성 성능 벤치마크"""
        results = {}
        
        for version in [UUIDVersion.V1, UUIDVersion.V4, UUIDVersion.V7]:
            start_time = time.time()
            
            for _ in range(count):
                self.generate_uuid(version)
            
            duration = time.time() - start_time
            results[f"v{version.value}"] = {
                'duration': duration,
                'per_second': count / duration,
                'per_uuid_ms': (duration / count) * 1000
            }
        
        return {
            'test_count': count,
            'results': results,
            'fastest': min(results.keys(), key=lambda k: results[k]['duration'])
        }


# 전역 인스턴스
_default_uuid_helper = None
_instance_lock = threading.Lock()

def get_uuid_helper(config: Optional[Dict[str, Any]] = None) -> EnhancedUUIDHelper:
    """전역 UUID 헬퍼 인스턴스 반환"""
    global _default_uuid_helper
    
    if _default_uuid_helper is None:
        with _instance_lock:
            if _default_uuid_helper is None:
                _default_uuid_helper = EnhancedUUIDHelper(config)
    
    return _default_uuid_helper


# 편의 함수들 (하위 호환성)
def is_valid_uuid(uuid_str: str) -> bool:
    """UUID 유효성 검증"""
    return get_uuid_helper().is_valid_uuid(uuid_str)

def generate_uuid(version: Optional[UUIDVersion] = None, 
                 output_format: Optional[UUIDFormat] = None) -> str:
    """UUID 생성"""
    return get_uuid_helper().generate_uuid(version, output_format)

def validate_uuid(uuid_str: str, field_name: str = "UUID") -> ValidationResult:
    """UUID 검증 및 오류 메시지 반환"""
    return get_uuid_helper().validate_uuid(uuid_str, field_name)

def get_default_user_id() -> Optional[str]:
    """기본 사용자 ID 가져오기"""
    return get_uuid_helper().get_default_user_id()

def generate_test_uuid(prefix: str = "") -> str:
    """테스트용 UUID 생성"""
    return get_uuid_helper().generate_test_uuid(prefix)

def batch_generate_uuids(count: int, 
                        version: Optional[UUIDVersion] = None) -> List[str]:
    """배치 UUID 생성"""
    return get_uuid_helper().batch_generate_uuids(count, version)

def convert_uuid_format(uuid_str: str, target_format: UUIDFormat) -> str:
    """UUID 형식 변환"""
    return get_uuid_helper().convert_format(uuid_str, target_format)

def get_uuid_info(uuid_str: str) -> Optional[UUIDInfo]:
    """UUID 상세 정보 조회"""
    return get_uuid_helper().get_uuid_info(uuid_str)


# UUID 분석 및 유틸리티 클래스
class UUIDAnalyzer:
    """UUID 분석 전용 클래스"""
    
    def __init__(self):
        self.helper = get_uuid_helper()
    
    def analyze_uuid_batch(self, uuid_list: List[str]) -> Dict[str, Any]:
        """여러 UUID 배치 분석"""
        results = {
            'total_count': len(uuid_list),
            'valid_count': 0,
            'invalid_count': 0,
            'version_distribution': {},
            'format_distribution': {},
            'analysis_results': []
        }
        
        for uuid_str in uuid_list:
            analysis = self.analyze_single_uuid(uuid_str)
            results['analysis_results'].append(analysis)
            
            if analysis['is_valid']:
                results['valid_count'] += 1
                version = analysis['version']
                if version:
                    results['version_distribution'][f'v{version}'] = \
                        results['version_distribution'].get(f'v{version}', 0) + 1
            else:
                results['invalid_count'] += 1
        
        return results
    
    def analyze_single_uuid(self, uuid_str: str) -> Dict[str, Any]:
        """단일 UUID 분석"""
        validation_result = self.helper.validate_uuid(uuid_str)
        
        result = {
            'uuid': uuid_str,
            'is_valid': validation_result.is_valid,
            'error_message': validation_result.error_message,
            'suggestions': validation_result.suggestions
        }
        
        if validation_result.uuid_info:
            info = validation_result.uuid_info
            result.update({
                'version': info.version,
                'variant': info.variant,
                'timestamp': info.timestamp.isoformat() if info.timestamp else None,
                'node': info.node,
                'clock_seq': info.clock_seq
            })
        
        return result
    
    def find_uuid_collisions(self, uuid_list: List[str]) -> Dict[str, List[int]]:
        """UUID 충돌 (중복) 탐지"""
        uuid_positions = {}
        
        for i, uuid_str in enumerate(uuid_list):
            if self.helper.is_valid_uuid(uuid_str):
                # 표준 형식으로 정규화
                try:
                    normalized = str(uuid.UUID(uuid_str))
                    if normalized not in uuid_positions:
                        uuid_positions[normalized] = []
                    uuid_positions[normalized].append(i)
                except ValueError:
                    continue
        
        # 중복된 UUID만 반환
        collisions = {k: v for k, v in uuid_positions.items() if len(v) > 1}
        return collisions
    
    def suggest_uuid_improvements(self, uuid_str: str) -> List[str]:
        """UUID 개선 제안"""
        suggestions = []
        
        validation_result = self.helper.validate_uuid(uuid_str)
        if not validation_result.is_valid:
            return validation_result.suggestions
        
        info = validation_result.uuid_info
        if info and info.version:
            if info.version == 1:
                suggestions.append("v1 UUID는 MAC 주소를 포함하므로 프라이버시 문제가 있을 수 있습니다.")
                suggestions.append("보안이 중요한 경우 v4 UUID 사용을 권장합니다.")
            
            elif info.version == 4:
                suggestions.append("v4 UUID는 보안성이 좋습니다.")
                suggestions.append("정렬이 필요한 경우 v7 UUID를 고려해보세요.")
            
            elif info.version in [3, 5]:
                suggestions.append(f"v{info.version} UUID는 결정적 생성됩니다.")
                suggestions.append("동일한 입력에 대해 항상 같은 UUID가 생성됩니다.")
        
        return suggestions


class UUIDGenerator:
    """고급 UUID 생성기"""
    
    def __init__(self):
        self.helper = get_uuid_helper()
    
    def generate_sequential_uuids(self, count: int, 
                                 base_uuid: Optional[str] = None) -> List[str]:
        """순차적 UUID 생성 (정렬 가능)"""
        if base_uuid:
            try:
                base = uuid.UUID(base_uuid)
                base_int = base.int
            except ValueError:
                raise ValueError("Invalid base UUID")
        else:
            base_int = uuid.uuid4().int
        
        sequential_uuids = []
        for i in range(count):
            new_int = (base_int + i) & ((1 << 128) - 1)  # 128비트 오버플로우 방지
            sequential_uuids.append(str(uuid.UUID(int=new_int)))
        
        return sequential_uuids
    
    def generate_uuid_with_metadata(self, metadata: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """메타데이터와 함께 UUID 생성"""
        generated_uuid = self.helper.generate_uuid()
        
        uuid_metadata = {
            'uuid': generated_uuid,
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'metadata': metadata,
            'generator_info': {
                'version': 'enhanced',
                'source': 'EnhancedUUIDHelper'
            }
        }
        
        return generated_uuid, uuid_metadata
    
    def generate_named_uuid(self, name: str, 
                           namespace: str = 'default',
                           version: UUIDVersion = UUIDVersion.V5) -> str:
        """이름 기반 UUID 생성"""
        if version not in [UUIDVersion.V3, UUIDVersion.V5]:
            raise ValueError("Named UUIDs require version 3 or 5")
        
        # 네임스페이스 해결
        if namespace == 'default':
            ns_uuid = UUIDNamespace.DNS
        else:
            ns_uuid = UUIDNamespace.get_namespace(namespace)
            if not ns_uuid:
                # 커스텀 네임스페이스 생성
                ns_uuid = UUIDNamespace.register_namespace(
                    namespace, 
                    str(uuid.uuid4())
                )
        
        return self.helper.generate_uuid(
            version=version,
            namespace=ns_uuid,
            name=name
        )
    
    def generate_time_based_uuid(self, timestamp: Optional[datetime] = None) -> str:
        """시간 기반 UUID 생성 (v7 스타일)"""
        if timestamp:
            # 특정 시간 기반 UUID 생성 (v8 사용)
            ts_ms = int(timestamp.timestamp() * 1000)
            
            # 시간을 UUID에 인코딩
            time_hi = (ts_ms >> 16) & 0xffffffff
            time_mid = ts_ms & 0xffff
            time_low = (8 << 12) | secrets.randbits(12)  # version 8
            
            clock_seq_hi = 0x80 | secrets.randbits(6)
            clock_seq_low = secrets.randbits(8)
            node = secrets.randbits(48)
            
            fields = (time_hi, time_mid, time_low, clock_seq_hi, clock_seq_low, node)
            return str(uuid.UUID(fields=fields))
        else:
            # 현재 시간 기반 v7 UUID
            return self.helper.generate_uuid(version=UUIDVersion.V7)


class UUIDStorage:
    """UUID 저장 및 관리"""
    
    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = Path(storage_path) if storage_path else Path("uuid_storage.json")
        self.storage_data = self._load_storage()
        self.helper = get_uuid_helper()
    
    def _load_storage(self) -> Dict[str, Any]:
        """저장된 UUID 데이터 로드"""
        try:
            if self.storage_path.exists():
                with open(self.storage_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"UUID 저장소 로드 실패: {e}")
        
        return {
            'uuids': {},
            'metadata': {
                'created_at': datetime.now(timezone.utc).isoformat(),
                'version': '1.0'
            }
        }
    
    def _save_storage(self) -> None:
        """UUID 데이터 저장"""
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                json.dump(self.storage_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"UUID 저장소 저장 실패: {e}")
    
    def store_uuid(self, uuid_str: str, name: str, metadata: Optional[Dict] = None) -> bool:
        """UUID 저장"""
        if not self.helper.is_valid_uuid(uuid_str):
            return False
        
        self.storage_data['uuids'][name] = {
            'uuid': uuid_str,
            'stored_at': datetime.now(timezone.utc).isoformat(),
            'metadata': metadata or {}
        }
        
        self._save_storage()
        return True
    
    def retrieve_uuid(self, name: str) -> Optional[str]:
        """저장된 UUID 조회"""
        uuid_info = self.storage_data['uuids'].get(name)
        return uuid_info['uuid'] if uuid_info else None
    
    def list_stored_uuids(self) -> List[Dict[str, Any]]:
        """저장된 모든 UUID 목록"""
        return [
            {
                'name': name,
                **info
            }
            for name, info in self.storage_data['uuids'].items()
        ]
    
    def delete_stored_uuid(self, name: str) -> bool:
        """저장된 UUID 삭제"""
        if name in self.storage_data['uuids']:
            del self.storage_data['uuids'][name]
            self._save_storage()
            return True
        return False
    
    def cleanup_invalid_uuids(self) -> int:
        """유효하지 않은 UUID 정리"""
        invalid_names = []
        
        for name, info in self.storage_data['uuids'].items():
            if not self.helper.is_valid_uuid(info['uuid']):
                invalid_names.append(name)
        
        for name in invalid_names:
            del self.storage_data['uuids'][name]
        
        if invalid_names:
            self._save_storage()
        
        return len(invalid_names)


# 메인 실행 부분
if __name__ == "__main__":
    import argparse
    import sys
    
    def main():
        parser = argparse.ArgumentParser(description='Enhanced UUID Helper CLI')
        subparsers = parser.add_subparsers(dest='command', help='Available commands')
        
        # generate 명령어
        gen_parser = subparsers.add_parser('generate', help='Generate UUID')
        gen_parser.add_argument('--version', type=int, choices=[1, 3, 4, 5, 6, 7, 8], 
                               default=4, help='UUID version')
        gen_parser.add_argument('--format', choices=[f.value for f in UUIDFormat], 
                               default='standard', help='Output format')
        gen_parser.add_argument('--count', type=int, default=1, help='Number of UUIDs to generate')
        gen_parser.add_argument('--namespace', help='Namespace for v3/v5')
        gen_parser.add_argument('--name', help='Name for v3/v5')
        
        # validate 명령어
        val_parser = subparsers.add_parser('validate', help='Validate UUID')
        val_parser.add_argument('uuid', help='UUID to validate')
        val_parser.add_argument('--detailed', action='store_true', help='Show detailed info')
        
        # convert 명령어
        conv_parser = subparsers.add_parser('convert', help='Convert UUID format')
        conv_parser.add_argument('uuid', help='UUID to convert')
        conv_parser.add_argument('--to', choices=[f.value for f in UUIDFormat], 
                                required=True, help='Target format')
        
        # benchmark 명령어
        bench_parser = subparsers.add_parser('benchmark', help='Benchmark UUID generation')
        bench_parser.add_argument('--count', type=int, default=10000, help='Number of UUIDs to generate')
        
        # info 명령어
        info_parser = subparsers.add_parser('info', help='Show UUID info')
        info_parser.add_argument('uuid', help='UUID to analyze')
        
        args = parser.parse_args()
        
        if not args.command:
            parser.print_help()
            return
        
        helper = get_uuid_helper()
        
        try:
            if args.command == 'generate':
                version = UUIDVersion(args.version)
                output_format = UUIDFormat(args.format)
                
                if args.count == 1:
                    result = helper.generate_uuid(
                        version=version,
                        output_format=output_format,
                        namespace=args.namespace,
                        name=args.name
                    )
                    print(result)
                else:
                    results = helper.batch_generate_uuids(
                        args.count, version, output_format
                    )
                    for result in results:
                        print(result)
            
            elif args.command == 'validate':
                validation_result = helper.validate_uuid(args.uuid)
                
                if validation_result.is_valid:
                    print("✅ Valid UUID")
                    if args.detailed and validation_result.uuid_info:
                        info = validation_result.uuid_info
                        print(f"Version: {info.version}")
                        print(f"Variant: {info.variant}")
                        if info.timestamp:
                            print(f"Timestamp: {info.timestamp}")
                        if info.node:
                            print(f"Node: {info.node}")
                else:
                    print("❌ Invalid UUID")
                    print(f"Error: {validation_result.error_message}")
                    if validation_result.suggestions:
                        print("Suggestions:")
                        for suggestion in validation_result.suggestions:
                            print(f"  - {suggestion}")
            
            elif args.command == 'convert':
                target_format = UUIDFormat(args.to)
                result = helper.convert_format(args.uuid, target_format)
                print(result)
            
            elif args.command == 'benchmark':
                results = helper.benchmark_generation(args.count)
                print(f"Benchmark Results ({args.count} UUIDs):")
                print("-" * 40)
                for version, data in results['results'].items():
                    print(f"{version}: {data['per_second']:.0f} UUIDs/sec")
                print(f"Fastest: {results['fastest']}")
            
            elif args.command == 'info':
                uuid_info = helper.get_uuid_info(args.uuid)
                if uuid_info:
                    print(f"UUID: {uuid_info.uuid_str}")
                    print(f"Version: {uuid_info.version}")
                    print(f"Variant: {uuid_info.variant}")
                    print(f"Valid: {uuid_info.is_valid}")
                    if uuid_info.timestamp:
                        print(f"Timestamp: {uuid_info.timestamp}")
                    if uuid_info.node:
                        print(f"Node: {uuid_info.node}")
                    if uuid_info.clock_seq is not None:
                        print(f"Clock Sequence: {uuid_info.clock_seq}")
                else:
                    print("❌ Invalid UUID")
                    
        except Exception as e:
            print(f"❌ Error: {e}", file=sys.stderr)
            sys.exit(1)
    
    main()