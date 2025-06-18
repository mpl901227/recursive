#!/usr/bin/env python3
"""
Context-Aware Log Parser
컨텍스트를 고려한 지능형 로그 파싱 및 의미론적 분석

주요 기능:
- 다양한 로그 형식 자동 감지 및 파싱
- 컨텍스트 기반 의미론적 분석
- 로그 이상 패턴 실시간 탐지
- 에러 자동 분류 및 심각도 평가
- 로그 간 상관관계 분석
- 시계열 패턴 분석
- 자연어 처리 기반 로그 이해
- 머신러닝 기반 예측 분석
"""

import re
import json
import asyncio
import logging
import hashlib
import statistics
from datetime import datetime, timedelta
from typing import (
    Dict, List, Optional, Any, Union, Tuple, Set, Iterator,
    Pattern, Callable, Protocol, Type, TypeVar
)
from dataclasses import dataclass, field
from enum import Enum, auto
from collections import defaultdict, deque, Counter
from pathlib import Path
import pickle
import threading
from concurrent.futures import ThreadPoolExecutor
import time
import gzip
import base64

# 외부 라이브러리 (선택적 import)
try:
    import numpy as np
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    from sklearn.cluster import DBSCAN
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.ensemble import IsolationForest
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import spacy
    HAS_SPACY = True
except ImportError:
    HAS_SPACY = False

# 로깅 설정
logger = logging.getLogger(__name__)

# 타입 정의
T = TypeVar('T')
LogData = Dict[str, Any]


# 열거형 정의
class LogLevel(Enum):
    TRACE = 0
    DEBUG = 10
    INFO = 20
    WARN = 30
    ERROR = 40
    FATAL = 50
    UNKNOWN = 999


class LogFormat(Enum):
    APACHE_COMMON = auto()
    APACHE_COMBINED = auto()
    NGINX = auto()
    SYSLOG = auto()
    JSON = auto()
    CSV = auto()
    DOCKER = auto()
    KUBERNETES = auto()
    APPLICATION = auto()
    DATABASE = auto()
    CUSTOM = auto()
    UNKNOWN = auto()


class AnomalyType(Enum):
    FREQUENCY = "frequency_anomaly"
    PATTERN = "pattern_anomaly"
    VALUE = "value_anomaly"
    SEQUENCE = "sequence_anomaly"
    CORRELATION = "correlation_anomaly"
    TEMPORAL = "temporal_anomaly"


class ErrorCategory(Enum):
    SYNTAX_ERROR = "syntax_error"
    RUNTIME_ERROR = "runtime_error"
    NETWORK_ERROR = "network_error"
    DATABASE_ERROR = "database_error"
    AUTHENTICATION_ERROR = "auth_error"
    AUTHORIZATION_ERROR = "authz_error"
    VALIDATION_ERROR = "validation_error"
    SYSTEM_ERROR = "system_error"
    BUSINESS_ERROR = "business_error"
    UNKNOWN_ERROR = "unknown_error"


class SeverityLevel(Enum):
    CRITICAL = 5
    HIGH = 4
    MEDIUM = 3
    LOW = 2
    INFO = 1
    UNKNOWN = 0


# 데이터 클래스들
@dataclass
class LogEntry:
    """파싱된 로그 엔트리"""
    raw_message: str
    timestamp: Optional[datetime] = None
    level: LogLevel = LogLevel.UNKNOWN
    source: Optional[str] = None
    message: Optional[str] = None
    fields: Dict[str, Any] = field(default_factory=dict)
    tags: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


@dataclass
class LogContext:
    """로그 컨텍스트 정보"""
    source_type: str
    application_name: Optional[str] = None
    environment: Optional[str] = None
    server_name: Optional[str] = None
    service_version: Optional[str] = None
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    trace_id: Optional[str] = None
    custom_context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedLog:
    """컨텍스트와 함께 파싱된 로그"""
    entry: LogEntry
    context: LogContext
    format_type: LogFormat
    confidence_score: float
    parsing_time: float
    enriched_fields: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SemanticLog:
    """의미론적으로 분석된 로그"""
    parsed_log: ParsedLog
    intent: Optional[str] = None
    entities: List[Dict[str, Any]] = field(default_factory=list)
    sentiment: Optional[str] = None
    topics: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    semantic_vector: Optional[List[float]] = None
    similarity_hash: Optional[str] = None


@dataclass
class LogAnomaly:
    """로그 이상 패턴"""
    anomaly_type: AnomalyType
    log_entry: LogEntry
    anomaly_score: float
    description: str
    severity: SeverityLevel
    context: Dict[str, Any] = field(default_factory=dict)
    related_logs: List[LogEntry] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)


@dataclass
class ErrorClassification:
    """에러 분류 결과"""
    category: ErrorCategory
    subcategory: Optional[str] = None
    confidence: float = 0.0
    description: str = ""
    severity: SeverityLevel = SeverityLevel.UNKNOWN
    impact_scope: List[str] = field(default_factory=list)
    root_cause_hints: List[str] = field(default_factory=list)


@dataclass
class LogPattern:
    """로그 패턴"""
    pattern_id: str
    pattern_regex: Pattern
    description: str
    frequency: int = 0
    last_seen: Optional[datetime] = None
    examples: List[str] = field(default_factory=list)
    variations: List[str] = field(default_factory=list)


# 프로토콜 정의
class LogParser(Protocol):
    def parse(self, raw_log: str, context: LogContext) -> Optional[ParsedLog]:
        """로그 파싱"""
        ...


class AnomalyDetector(Protocol):
    def detect(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """이상 패턴 탐지"""
        ...


# 커스텀 예외
class LogParsingError(Exception):
    """로그 파싱 오류"""
    pass


class ContextExtractionError(Exception):
    """컨텍스트 추출 오류"""
    pass


class AnomalyDetectionError(Exception):
    """이상 탐지 오류"""
    pass


# 로그 포맷 탐지기
class LogFormatDetector:
    """로그 포맷 자동 탐지"""
    
    def __init__(self):
        self.format_patterns = {
            LogFormat.APACHE_COMMON: [
                re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+)'),
            ],
            LogFormat.APACHE_COMBINED: [
                re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+) "([^"]*)" "([^"]*)"'),
            ],
            LogFormat.NGINX: [
                re.compile(r'^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)"'),
            ],
            LogFormat.SYSLOG: [
                re.compile(r'^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\S+) (\S+)(?:\[(\d+)\])?: (.*)'),
            ],
            LogFormat.JSON: [
                re.compile(r'^\s*\{.*\}\s*$'),
            ],
            LogFormat.DOCKER: [
                re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (.*)'),
            ],
            LogFormat.KUBERNETES: [
                re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (\w+) (.*)'),
            ],
        }
        
        self.confidence_cache = {}
    
    def detect_format(self, log_lines: List[str]) -> Tuple[LogFormat, float]:
        """로그 형식 탐지"""
        if not log_lines:
            return LogFormat.UNKNOWN, 0.0
        
        # 캐시 확인
        cache_key = hashlib.md5('\n'.join(log_lines[:10]).encode()).hexdigest()
        if cache_key in self.confidence_cache:
            return self.confidence_cache[cache_key]
        
        format_scores = defaultdict(float)
        
        # 샘플 라인들에 대해 각 포맷 테스트
        sample_size = min(50, len(log_lines))
        sample_lines = log_lines[:sample_size]
        
        for log_format, patterns in self.format_patterns.items():
            matches = 0
            for line in sample_lines:
                if self._test_format(line, patterns):
                    matches += 1
            
            format_scores[log_format] = matches / sample_size
        
        # 가장 높은 점수의 포맷 선택
        if not format_scores:
            result = (LogFormat.UNKNOWN, 0.0)
        else:
            best_format = max(format_scores.items(), key=lambda x: x[1])
            result = best_format
        
        # 캐시에 저장
        self.confidence_cache[cache_key] = result
        return result
    
    def _test_format(self, line: str, patterns: List[Pattern]) -> bool:
        """개별 라인에 대해 포맷 테스트"""
        return any(pattern.match(line.strip()) for pattern in patterns)


# 특화된 파서들
class ApacheLogParser:
    """Apache 로그 파서"""
    
    def __init__(self):
        self.common_pattern = re.compile(
            r'^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+)'
        )
        self.combined_pattern = re.compile(
            r'^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+) "([^"]*)" "([^"]*)"'
        )
    
    def parse(self, raw_log: str, context: LogContext) -> Optional[ParsedLog]:
        """Apache 로그 파싱"""
        start_time = time.time()
        
        # Combined 포맷 시도
        match = self.combined_pattern.match(raw_log.strip())
        if match:
            ip, timestamp_str, request, status, size, referer, user_agent = match.groups()
            
            entry = LogEntry(
                raw_message=raw_log,
                timestamp=self._parse_apache_timestamp(timestamp_str),
                level=self._status_to_level(int(status)),
                source="apache",
                message=request,
                fields={
                    "client_ip": ip,
                    "request": request,
                    "status_code": int(status),
                    "response_size": self._parse_size(size),
                    "referer": referer if referer != "-" else None,
                    "user_agent": user_agent
                }
            )
            
            return ParsedLog(
                entry=entry,
                context=context,
                format_type=LogFormat.APACHE_COMBINED,
                confidence_score=0.95,
                parsing_time=time.time() - start_time
            )
        
        # Common 포맷 시도
        match = self.common_pattern.match(raw_log.strip())
        if match:
            ip, timestamp_str, request, status, size = match.groups()
            
            entry = LogEntry(
                raw_message=raw_log,
                timestamp=self._parse_apache_timestamp(timestamp_str),
                level=self._status_to_level(int(status)),
                source="apache",
                message=request,
                fields={
                    "client_ip": ip,
                    "request": request,
                    "status_code": int(status),
                    "response_size": self._parse_size(size)
                }
            )
            
            return ParsedLog(
                entry=entry,
                context=context,
                format_type=LogFormat.APACHE_COMMON,
                confidence_score=0.9,
                parsing_time=time.time() - start_time
            )
        
        return None
    
    def _parse_apache_timestamp(self, timestamp_str: str) -> datetime:
        """Apache 타임스탬프 파싱"""
        try:
            return datetime.strptime(timestamp_str, "%d/%b/%Y:%H:%M:%S %z")
        except ValueError:
            try:
                return datetime.strptime(timestamp_str, "%d/%b/%Y:%H:%M:%S")
            except ValueError:
                return datetime.now()
    
    def _status_to_level(self, status_code: int) -> LogLevel:
        """HTTP 상태 코드를 로그 레벨로 변환"""
        if status_code >= 500:
            return LogLevel.ERROR
        elif status_code >= 400:
            return LogLevel.WARN
        elif status_code >= 300:
            return LogLevel.INFO
        else:
            return LogLevel.INFO
    
    def _parse_size(self, size_str: str) -> Optional[int]:
        """응답 크기 파싱"""
        if size_str == "-":
            return None
        try:
            return int(size_str)
        except ValueError:
            return None


class JSONLogParser:
    """JSON 로그 파서"""
    
    def parse(self, raw_log: str, context: LogContext) -> Optional[ParsedLog]:
        """JSON 로그 파싱"""
        start_time = time.time()
        
        try:
            data = json.loads(raw_log.strip())
            
            # 공통 필드 추출
            timestamp = self._extract_timestamp(data)
            level = self._extract_level(data)
            message = self._extract_message(data)
            
            entry = LogEntry(
                raw_message=raw_log,
                timestamp=timestamp,
                level=level,
                source=data.get("source", context.source_type),
                message=message,
                fields=data
            )
            
            return ParsedLog(
                entry=entry,
                context=context,
                format_type=LogFormat.JSON,
                confidence_score=0.98,
                parsing_time=time.time() - start_time
            )
            
        except json.JSONDecodeError:
            return None
    
    def _extract_timestamp(self, data: Dict[str, Any]) -> datetime:
        """타임스탬프 추출"""
        timestamp_fields = ["timestamp", "@timestamp", "time", "datetime", "date"]
        
        for field in timestamp_fields:
            if field in data:
                try:
                    ts_value = data[field]
                    if isinstance(ts_value, str):
                        # ISO 형식 시도
                        try:
                            return datetime.fromisoformat(ts_value.replace('Z', '+00:00'))
                        except ValueError:
                            # 다른 형식들 시도
                            formats = [
                                "%Y-%m-%dT%H:%M:%S.%fZ",
                                "%Y-%m-%d %H:%M:%S",
                                "%d/%b/%Y:%H:%M:%S",
                            ]
                            for fmt in formats:
                                try:
                                    return datetime.strptime(ts_value, fmt)
                                except ValueError:
                                    continue
                    elif isinstance(ts_value, (int, float)):
                        # Unix 타임스탬프
                        return datetime.fromtimestamp(ts_value)
                except (ValueError, TypeError):
                    continue
        
        return datetime.now()
    
    def _extract_level(self, data: Dict[str, Any]) -> LogLevel:
        """로그 레벨 추출"""
        level_fields = ["level", "severity", "priority", "logLevel"]
        
        for field in level_fields:
            if field in data:
                level_str = str(data[field]).upper()
                try:
                    return LogLevel[level_str]
                except KeyError:
                    # 숫자 레벨 처리
                    level_mapping = {
                        "0": LogLevel.TRACE,
                        "10": LogLevel.DEBUG,
                        "20": LogLevel.INFO,
                        "30": LogLevel.WARN,
                        "40": LogLevel.ERROR,
                        "50": LogLevel.FATAL
                    }
                    if level_str in level_mapping:
                        return level_mapping[level_str]
        
        return LogLevel.UNKNOWN
    
    def _extract_message(self, data: Dict[str, Any]) -> Optional[str]:
        """메시지 추출"""
        message_fields = ["message", "msg", "text", "description", "content"]
        
        for field in message_fields:
            if field in data and data[field]:
                return str(data[field])
        
        return None


class SyslogParser:
    """Syslog 파서"""
    
    def __init__(self):
        self.pattern = re.compile(
            r'^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\S+) (\S+)(?:\[(\d+)\])?: (.*)'
        )
    
    def parse(self, raw_log: str, context: LogContext) -> Optional[ParsedLog]:
        """Syslog 파싱"""
        start_time = time.time()
        
        match = self.pattern.match(raw_log.strip())
        if not match:
            return None
        
        timestamp_str, hostname, program, pid, message = match.groups()
        
        # 타임스탬프 파싱 (연도 추가)
        try:
            current_year = datetime.now().year
            timestamp = datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S")
        except ValueError:
            timestamp = datetime.now()
        
        entry = LogEntry(
            raw_message=raw_log,
            timestamp=timestamp,
            level=LogLevel.INFO,  # Syslog는 기본적으로 INFO
            source="syslog",
            message=message,
            fields={
                "hostname": hostname,
                "program": program,
                "pid": int(pid) if pid else None,
            }
        )
        
        return ParsedLog(
            entry=entry,
            context=context,
            format_type=LogFormat.SYSLOG,
            confidence_score=0.9,
            parsing_time=time.time() - start_time
        )


# 메인 파서 클래스
class ContextAwareLogParser:
    """컨텍스트를 고려한 지능형 로그 파서"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.format_detector = LogFormatDetector()
        
        # 특화된 파서들 등록
        self.parsers = {
            LogFormat.APACHE_COMMON: ApacheLogParser(),
            LogFormat.APACHE_COMBINED: ApacheLogParser(),
            LogFormat.JSON: JSONLogParser(),
            LogFormat.SYSLOG: SyslogParser(),
        }
        
        # 컨텍스트 추출기들
        self.context_extractors = {}
        
        # 패턴 라이브러리
        self.known_patterns = {}
        self.load_pattern_library()
        
        # 성능 메트릭
        self.metrics = {
            "total_parsed": 0,
            "parse_errors": 0,
            "avg_parse_time": 0.0,
            "format_detection_cache_hits": 0
        }
        
        # 캐시 및 최적화
        self.parse_cache = {}
        self.cache_lock = threading.RLock()
        
        # NLP 모델 (선택적)
        self.nlp_model = None
        if HAS_SPACY:
            try:
                import spacy
                self.nlp_model = spacy.load("en_core_web_sm")
            except OSError:
                logger.warning("Spacy English model not found. NLP features will be limited.")
    
    def load_pattern_library(self):
        """알려진 패턴 라이브러리 로드"""
        # 기본 패턴들
        self.known_patterns = {
            "error_patterns": [
                re.compile(r'error|exception|fail|fatal|critical', re.IGNORECASE),
                re.compile(r'stack\s*trace', re.IGNORECASE),
                re.compile(r'timeout|timed\s*out', re.IGNORECASE),
            ],
            "warning_patterns": [
                re.compile(r'warn|warning|deprecated', re.IGNORECASE),
                re.compile(r'retry|retrying', re.IGNORECASE),
            ],
            "security_patterns": [
                re.compile(r'unauthorized|forbidden|access\s*denied', re.IGNORECASE),
                re.compile(r'authentication|authorization', re.IGNORECASE),
                re.compile(r'login|logout|session', re.IGNORECASE),
            ],
            "performance_patterns": [
                re.compile(r'slow|performance|latency', re.IGNORECASE),
                re.compile(r'memory|cpu|disk|network', re.IGNORECASE),
                re.compile(r'\d+ms|\d+s|\d+\.\d+s', re.IGNORECASE),
            ]
        }
    
    def parse_with_context(self, raw_log: str, context: LogContext) -> Optional[ParsedLog]:
        """컨텍스트 기반 로그 파싱"""
        if not raw_log or not raw_log.strip():
            return None
        
        start_time = time.time()
        
        try:
            # 캐시 확인
            cache_key = self._generate_cache_key(raw_log, context)
            with self.cache_lock:
                if cache_key in self.parse_cache:
                    cached_result = self.parse_cache[cache_key]
                    self.metrics["format_detection_cache_hits"] += 1
                    return cached_result
            
            # 포맷 감지
            log_format, confidence = self.format_detector.detect_format([raw_log])
            
            # 적절한 파서 선택
            if log_format in self.parsers:
                parser = self.parsers[log_format]
                parsed_log = parser.parse(raw_log, context)
            else:
                # 일반 파서 사용
                parsed_log = self._parse_generic(raw_log, context, log_format)
            
            if parsed_log:
                # 컨텍스트 기반 보강
                self._enrich_with_context(parsed_log, context)
                
                # 패턴 매칭
                self._apply_pattern_matching(parsed_log)
                
                # 캐시에 저장
                with self.cache_lock:
                    if len(self.parse_cache) < 1000:  # 캐시 크기 제한
                        self.parse_cache[cache_key] = parsed_log
            
            # 메트릭 업데이트
            self.metrics["total_parsed"] += 1
            parse_time = time.time() - start_time
            self._update_avg_parse_time(parse_time)
            
            return parsed_log
            
        except Exception as e:
            self.metrics["parse_errors"] += 1
            logger.error(f"Error parsing log: {e}")
            raise LogParsingError(f"Failed to parse log: {e}")
    
    def _parse_generic(self, raw_log: str, context: LogContext, 
                      detected_format: LogFormat) -> ParsedLog:
        """일반적인 로그 파싱"""
        start_time = time.time()
        
        # 기본 타임스탬프 추출 시도
        timestamp = self._extract_timestamp_generic(raw_log)
        
        # 기본 레벨 추출 시도
        level = self._extract_level_generic(raw_log)
        
        entry = LogEntry(
            raw_message=raw_log,
            timestamp=timestamp,
            level=level,
            source=context.source_type,
            message=raw_log.strip(),
            fields={}
        )
        
        return ParsedLog(
            entry=entry,
            context=context,
            format_type=detected_format,
            confidence_score=0.5,  # 낮은 신뢰도
            parsing_time=time.time() - start_time
        )
    
    def _extract_timestamp_generic(self, log_line: str) -> datetime:
        """일반적인 타임스탬프 추출"""
        timestamp_patterns = [
            # ISO 8601
            re.compile(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)'),
            # 일반 형식
            re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'),
            # 로그 형식
            re.compile(r'(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2})'),
            # Syslog 형식
            re.compile(r'(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})'),
        ]
        
        for pattern in timestamp_patterns:
            match = pattern.search(log_line)
            if match:
                timestamp_str = match.group(1)
                try:
                    # 다양한 형식으로 파싱 시도
                    formats = [
                        "%Y-%m-%dT%H:%M:%S.%fZ",
                        "%Y-%m-%dT%H:%M:%SZ",
                        "%Y-%m-%dT%H:%M:%S.%f",
                        "%Y-%m-%dT%H:%M:%S",
                        "%Y-%m-%d %H:%M:%S",
                        "%d/%b/%Y:%H:%M:%S",
                        "%b %d %H:%M:%S"
                    ]
                    
                    for fmt in formats:
                        try:
                            return datetime.strptime(timestamp_str, fmt)
                        except ValueError:
                            continue
                            
                except ValueError:
                    continue
        
        return datetime.now()
    
    def _extract_level_generic(self, log_line: str) -> LogLevel:
        """일반적인 로그 레벨 추출"""
        level_patterns = {
            LogLevel.FATAL: re.compile(r'\b(fatal|critical)\b', re.IGNORECASE),
            LogLevel.ERROR: re.compile(r'\b(error|err)\b', re.IGNORECASE),
            LogLevel.WARN: re.compile(r'\b(warn|warning)\b', re.IGNORECASE),
            LogLevel.INFO: re.compile(r'\b(info|information)\b', re.IGNORECASE),
            LogLevel.DEBUG: re.compile(r'\b(debug|dbg)\b', re.IGNORECASE),
            LogLevel.TRACE: re.compile(r'\btrace\b', re.IGNORECASE),
        }
        
        for level, pattern in level_patterns.items():
            if pattern.search(log_line):
                return level
        
        return LogLevel.UNKNOWN
    
    def _enrich_with_context(self, parsed_log: ParsedLog, context: LogContext):
        """컨텍스트 기반 로그 보강"""
        enriched_fields = {}
        
        # 애플리케이션 컨텍스트 추가
        if context.application_name:
            enriched_fields["application"] = context.application_name
        
        if context.environment:
            enriched_fields["environment"] = context.environment
        
        if context.request_id:
            enriched_fields["request_id"] = context.request_id
        
        if context.trace_id:
            enriched_fields["trace_id"] = context.trace_id
        
        # IP 주소 추출
        ip_pattern = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
        ip_matches = ip_pattern.findall(parsed_log.entry.raw_message)
        if ip_matches:
            enriched_fields["extracted_ips"] = ip_matches
        
        # URL 추출
        url_pattern = re.compile(r'https?://[^\s]+')
        url_matches = url_pattern.findall(parsed_log.entry.raw_message)
        if url_matches:
            enriched_fields["extracted_urls"] = url_matches
        
        # 이메일 추출
        email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        email_matches = email_pattern.findall(parsed_log.entry.raw_message)
        if email_matches:
            enriched_fields["extracted_emails"] = email_matches
        
        # 숫자 패턴 추출 (성능 메트릭 등)
        number_pattern = re.compile(r'\b\d+(?:\.\d+)?\s*(?:ms|s|MB|GB|KB|%)\b')
        metric_matches = number_pattern.findall(parsed_log.entry.raw_message)
        if metric_matches:
            enriched_fields["performance_metrics"] = metric_matches
        
        parsed_log.enriched_fields = enriched_fields
    
    def _apply_pattern_matching(self, parsed_log: ParsedLog):
        """패턴 매칭 적용"""
        message = parsed_log.entry.message or parsed_log.entry.raw_message
        tags = set()
        
        # 알려진 패턴들과 매칭
        for pattern_category, patterns in self.known_patterns.items():
            for pattern in patterns:
                if pattern.search(message):
                    tags.add(pattern_category.replace('_patterns', ''))
        
        parsed_log.entry.tags.update(tags)
    
    def _generate_cache_key(self, raw_log: str, context: LogContext) -> str:
        """캐시 키 생성"""
        context_str = f"{context.source_type}:{context.application_name or 'unknown'}"
        log_hash = hashlib.md5(raw_log.encode()).hexdigest()[:16]
        return f"{context_str}:{log_hash}"
    
    def _update_avg_parse_time(self, parse_time: float):
        """평균 파싱 시간 업데이트"""
        if self.metrics["total_parsed"] == 1:
            self.metrics["avg_parse_time"] = parse_time
        else:
            alpha = 0.1  # 가중 평균을 위한 알파값
            self.metrics["avg_parse_time"] = (
                alpha * parse_time + (1 - alpha) * self.metrics["avg_parse_time"]
            )
    
    def extract_semantic_meaning(self, parsed_log: ParsedLog) -> SemanticLog:
        """로그의 의미론적 내용 추출"""
        message = parsed_log.entry.message or parsed_log.entry.raw_message
        
        semantic_log = SemanticLog(parsed_log=parsed_log)
        
        # 기본 키워드 추출
        semantic_log.keywords = self._extract_keywords(message)
        
        # 의도 추출
        semantic_log.intent = self._extract_intent(message)
        
        # 토픽 추출
        semantic_log.topics = self._extract_topics(message)
        
        # 유사성 해시 생성
        semantic_log.similarity_hash = self._generate_similarity_hash(message)
        
        # NLP 기반 분석 (spaCy 사용 가능한 경우)
        if self.nlp_model:
            semantic_log.entities = self._extract_entities_nlp(message)
            semantic_log.sentiment = self._analyze_sentiment(message)
            semantic_log.semantic_vector = self._generate_semantic_vector(message)
        else:
            # 기본 엔티티 추출
            semantic_log.entities = self._extract_entities_basic(message)
        
        return semantic_log
    
    def _extract_keywords(self, message: str) -> List[str]:
        """키워드 추출"""
        # 기본적인 키워드 추출 (불용어 제거)
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
        }
        
        # 단어 추출 (알파벳, 숫자, 밑줄만)
        words = re.findall(r'\b[a-zA-Z0-9_]+\b', message.lower())
        
        # 불용어 제거 및 길이 필터링
        keywords = [word for word in words 
                   if word not in stop_words and len(word) > 2]
        
        # 빈도 기반 상위 키워드 선택
        word_counts = Counter(keywords)
        return [word for word, count in word_counts.most_common(10)]
    
    def _extract_intent(self, message: str) -> Optional[str]:
        """의도 추출"""
        intent_patterns = {
            'request': re.compile(r'\b(get|post|put|delete|request|call)\b', re.IGNORECASE),
            'error': re.compile(r'\b(error|exception|fail|crash|abort)\b', re.IGNORECASE),
            'warning': re.compile(r'\b(warn|warning|alert|notice)\b', re.IGNORECASE),
            'info': re.compile(r'\b(start|started|stop|stopped|complete|finish)\b', re.IGNORECASE),
            'authentication': re.compile(r'\b(login|logout|auth|signin|signout)\b', re.IGNORECASE),
            'transaction': re.compile(r'\b(transaction|payment|order|purchase)\b', re.IGNORECASE),
            'performance': re.compile(r'\b(slow|fast|performance|latency|timeout)\b', re.IGNORECASE),
        }
        
        for intent, pattern in intent_patterns.items():
            if pattern.search(message):
                return intent
        
        return None
    
    def _extract_topics(self, message: str) -> List[str]:
        """토픽 추출"""
        topic_patterns = {
            'database': re.compile(r'\b(sql|database|db|mysql|postgres|oracle|mongo)\b', re.IGNORECASE),
            'network': re.compile(r'\b(http|https|tcp|udp|network|connection|socket)\b', re.IGNORECASE),
            'security': re.compile(r'\b(security|auth|ssl|tls|certificate|encryption)\b', re.IGNORECASE),
            'performance': re.compile(r'\b(performance|memory|cpu|disk|cache|optimization)\b', re.IGNORECASE),
            'user_management': re.compile(r'\b(user|account|profile|session|permission)\b', re.IGNORECASE),
            'api': re.compile(r'\b(api|rest|graphql|endpoint|service|microservice)\b', re.IGNORECASE),
            'deployment': re.compile(r'\b(deploy|deployment|build|release|version)\b', re.IGNORECASE),
            'monitoring': re.compile(r'\b(monitor|metric|alert|health|status)\b', re.IGNORECASE),
        }
        
        topics = []
        for topic, pattern in topic_patterns.items():
            if pattern.search(message):
                topics.append(topic)
        
        return topics
    
    def _generate_similarity_hash(self, message: str) -> str:
        """유사성 해시 생성 (fuzzy hashing)"""
        # 정규화된 메시지에서 해시 생성
        normalized = re.sub(r'\d+', 'N', message.lower())  # 숫자를 N으로 치환
        normalized = re.sub(r'[^\w\s]', '', normalized)     # 특수문자 제거
        normalized = re.sub(r'\s+', ' ', normalized).strip() # 공백 정규화
        
        return hashlib.md5(normalized.encode()).hexdigest()
    
    def _extract_entities_basic(self, message: str) -> List[Dict[str, Any]]:
        """기본 엔티티 추출"""
        entities = []
        
        # IP 주소
        ip_pattern = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
        for match in ip_pattern.finditer(message):
            entities.append({
                'type': 'IP_ADDRESS',
                'text': match.group(),
                'start': match.start(),
                'end': match.end()
            })
        
        # URL
        url_pattern = re.compile(r'https?://[^\s]+')
        for match in url_pattern.finditer(message):
            entities.append({
                'type': 'URL',
                'text': match.group(),
                'start': match.start(),
                'end': match.end()
            })
        
        # 이메일
        email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        for match in email_pattern.finditer(message):
            entities.append({
                'type': 'EMAIL',
                'text': match.group(),
                'start': match.start(),
                'end': match.end()
            })
        
        # 파일 경로
        path_pattern = re.compile(r'[/\\][\w/\\.-]+')
        for match in path_pattern.finditer(message):
            entities.append({
                'type': 'FILE_PATH',
                'text': match.group(),
                'start': match.start(),
                'end': match.end()
            })
        
        return entities
    
    def _extract_entities_nlp(self, message: str) -> List[Dict[str, Any]]:
        """NLP 기반 엔티티 추출"""
        if not self.nlp_model:
            return self._extract_entities_basic(message)
        
        doc = self.nlp_model(message)
        entities = []
        
        for ent in doc.ents:
            entities.append({
                'type': ent.label_,
                'text': ent.text,
                'start': ent.start_char,
                'end': ent.end_char,
                'confidence': getattr(ent, 'score', 1.0)
            })
        
        # 기본 엔티티도 추가
        entities.extend(self._extract_entities_basic(message))
        
        return entities
    
    def _analyze_sentiment(self, message: str) -> str:
        """감정 분석"""
        # 기본적인 감정 분석 (단어 기반)
        positive_words = {
            'success', 'successful', 'complete', 'completed', 'good', 'great',
            'excellent', 'perfect', 'ok', 'ready', 'healthy', 'normal'
        }
        
        negative_words = {
            'error', 'fail', 'failed', 'failure', 'exception', 'crash',
            'critical', 'fatal', 'timeout', 'slow', 'bad', 'wrong',
            'invalid', 'unauthorized', 'forbidden', 'denied'
        }
        
        words = set(re.findall(r'\b\w+\b', message.lower()))
        
        positive_score = len(words & positive_words)
        negative_score = len(words & negative_words)
        
        if negative_score > positive_score:
            return 'negative'
        elif positive_score > negative_score:
            return 'positive'
        else:
            return 'neutral'
    
    def _generate_semantic_vector(self, message: str) -> List[float]:
        """의미론적 벡터 생성"""
        if not self.nlp_model:
            return []
        
        doc = self.nlp_model(message)
        return doc.vector.tolist() if doc.vector.size > 0 else []
    
    def identify_error_categories(self, error_logs: List[ParsedLog]) -> Dict[str, List[ErrorClassification]]:
        """에러 카테고리 자동 분류"""
        categorized_errors = defaultdict(list)
        
        for parsed_log in error_logs:
            if parsed_log.entry.level not in [LogLevel.ERROR, LogLevel.FATAL]:
                continue
            
            classification = self._classify_error(parsed_log)
            categorized_errors[classification.category.value].append(classification)
        
        return dict(categorized_errors)
    
    def _classify_error(self, parsed_log: ParsedLog) -> ErrorClassification:
        """개별 에러 분류"""
        message = parsed_log.entry.message or parsed_log.entry.raw_message
        
        # 에러 패턴 매칭
        error_patterns = {
            ErrorCategory.SYNTAX_ERROR: [
                re.compile(r'syntax\s*error|parse\s*error|invalid\s*syntax', re.IGNORECASE),
                re.compile(r'unexpected\s*token|missing\s*semicolon', re.IGNORECASE),
            ],
            ErrorCategory.RUNTIME_ERROR: [
                re.compile(r'null\s*pointer|segmentation\s*fault|access\s*violation', re.IGNORECASE),
                re.compile(r'index\s*out\s*of\s*bounds|array\s*index', re.IGNORECASE),
                re.compile(r'stack\s*overflow|memory\s*leak', re.IGNORECASE),
            ],
            ErrorCategory.NETWORK_ERROR: [
                re.compile(r'connection\s*refused|connection\s*timeout', re.IGNORECASE),
                re.compile(r'network\s*unreachable|host\s*not\s*found', re.IGNORECASE),
                re.compile(r'socket\s*error|tcp\s*error', re.IGNORECASE),
            ],
            ErrorCategory.DATABASE_ERROR: [
                re.compile(r'database\s*error|sql\s*error|query\s*failed', re.IGNORECASE),
                re.compile(r'table\s*does\s*not\s*exist|column\s*not\s*found', re.IGNORECASE),
                re.compile(r'duplicate\s*key|foreign\s*key\s*constraint', re.IGNORECASE),
            ],
            ErrorCategory.AUTHENTICATION_ERROR: [
                re.compile(r'authentication\s*failed|login\s*failed', re.IGNORECASE),
                re.compile(r'invalid\s*credentials|bad\s*password', re.IGNORECASE),
                re.compile(r'token\s*expired|session\s*expired', re.IGNORECASE),
            ],
            ErrorCategory.AUTHORIZATION_ERROR: [
                re.compile(r'access\s*denied|permission\s*denied|forbidden', re.IGNORECASE),
                re.compile(r'unauthorized|insufficient\s*privileges', re.IGNORECASE),
            ],
            ErrorCategory.VALIDATION_ERROR: [
                re.compile(r'validation\s*error|invalid\s*input|bad\s*request', re.IGNORECASE),
                re.compile(r'required\s*field|missing\s*parameter', re.IGNORECASE),
            ],
            ErrorCategory.SYSTEM_ERROR: [
                re.compile(r'system\s*error|internal\s*error|server\s*error', re.IGNORECASE),
                re.compile(r'out\s*of\s*memory|disk\s*full|resource\s*exhausted', re.IGNORECASE),
            ],
        }
        
        # 패턴 매칭으로 카테고리 결정
        for category, patterns in error_patterns.items():
            for pattern in patterns:
                if pattern.search(message):
                    severity = self._determine_severity(message, category)
                    return ErrorClassification(
                        category=category,
                        confidence=0.8,
                        description=f"Classified as {category.value} based on pattern matching",
                        severity=severity,
                        impact_scope=self._determine_impact_scope(parsed_log),
                        root_cause_hints=self._generate_root_cause_hints(message, category)
                    )
        
        # 기본 분류
        return ErrorClassification(
            category=ErrorCategory.UNKNOWN_ERROR,
            confidence=0.1,
            description="Could not classify error category",
            severity=SeverityLevel.UNKNOWN
        )
    
    def _determine_severity(self, message: str, category: ErrorCategory) -> SeverityLevel:
        """심각도 결정"""
        # 키워드 기반 심각도 평가
        critical_keywords = ['critical', 'fatal', 'crash', 'abort', 'emergency']
        high_keywords = ['error', 'fail', 'exception', 'severe', 'major']
        medium_keywords = ['warning', 'warn', 'minor', 'timeout']
        low_keywords = ['info', 'notice', 'debug', 'trace']
        
        message_lower = message.lower()
        
        if any(keyword in message_lower for keyword in critical_keywords):
            return SeverityLevel.CRITICAL
        elif any(keyword in message_lower for keyword in high_keywords):
            return SeverityLevel.HIGH
        elif any(keyword in message_lower for keyword in medium_keywords):
            return SeverityLevel.MEDIUM
        elif any(keyword in message_lower for keyword in low_keywords):
            return SeverityLevel.LOW
        
        # 카테고리 기반 기본 심각도
        category_severity_map = {
            ErrorCategory.SYNTAX_ERROR: SeverityLevel.HIGH,
            ErrorCategory.RUNTIME_ERROR: SeverityLevel.HIGH,
            ErrorCategory.NETWORK_ERROR: SeverityLevel.MEDIUM,
            ErrorCategory.DATABASE_ERROR: SeverityLevel.HIGH,
            ErrorCategory.AUTHENTICATION_ERROR: SeverityLevel.HIGH,
            ErrorCategory.AUTHORIZATION_ERROR: SeverityLevel.MEDIUM,
            ErrorCategory.VALIDATION_ERROR: SeverityLevel.LOW,
            ErrorCategory.SYSTEM_ERROR: SeverityLevel.CRITICAL,
            ErrorCategory.BUSINESS_ERROR: SeverityLevel.MEDIUM,
        }
        
        return category_severity_map.get(category, SeverityLevel.UNKNOWN)
    
    def _determine_impact_scope(self, parsed_log: ParsedLog) -> List[str]:
        """영향 범위 결정"""
        scope = []
        
        # 컨텍스트 기반 스코프
        context = parsed_log.context
        if context.application_name:
            scope.append(f"application:{context.application_name}")
        if context.service_version:
            scope.append(f"version:{context.service_version}")
        if context.environment:
            scope.append(f"environment:{context.environment}")
        
        # 메시지 기반 스코프
        message = parsed_log.entry.message or parsed_log.entry.raw_message
        
        if re.search(r'database|db|sql', message, re.IGNORECASE):
            scope.append("component:database")
        if re.search(r'network|http|tcp|connection', message, re.IGNORECASE):
            scope.append("component:network")
        if re.search(r'cache|redis|memcache', message, re.IGNORECASE):
            scope.append("component:cache")
        if re.search(r'auth|login|session', message, re.IGNORECASE):
            scope.append("component:authentication")
        
        return scope
    
    def _generate_root_cause_hints(self, message: str, category: ErrorCategory) -> List[str]:
        """근본 원인 힌트 생성"""
        hints = []
        
        # 카테고리별 일반적인 힌트
        category_hints = {
            ErrorCategory.NETWORK_ERROR: [
                "Check network connectivity",
                "Verify DNS resolution",
                "Check firewall settings",
                "Review proxy configuration"
            ],
            ErrorCategory.DATABASE_ERROR: [
                "Check database connection",
                "Verify table/column existence",
                "Review query syntax",
                "Check database permissions"
            ],
            ErrorCategory.AUTHENTICATION_ERROR: [
                "Verify credentials",
                "Check token expiration",
                "Review authentication configuration",
                "Check user permissions"
            ],
            ErrorCategory.SYSTEM_ERROR: [
                "Check system resources",
                "Review system logs",
                "Verify disk space",
                "Check memory usage"
            ]
        }
        
        hints.extend(category_hints.get(category, []))
        
        # 메시지 기반 특정 힌트
        if 'timeout' in message.lower():
            hints.append("Consider increasing timeout values")
        if 'memory' in message.lower():
            hints.append("Check memory allocation and usage")
        if 'permission' in message.lower():
            hints.append("Review file/directory permissions")
        
        return hints[:5]  # 최대 5개까지


# 이상 탐지기들
class FrequencyAnomalyDetector:
    """빈도 기반 이상 탐지"""
    
    def __init__(self, window_size: int = 60, threshold: float = 3.0):
        self.window_size = window_size  # 초 단위
        self.threshold = threshold      # 표준편차 배수
        self.frequency_history = deque(maxlen=1000)
    
    def detect(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """빈도 이상 탐지"""
        if len(logs) < 10:
            return []
        
        anomalies = []
        
        # 시간 윈도우별로 로그 카운트
        time_windows = self._create_time_windows(logs)
        counts = [len(window) for window in time_windows.values()]
        
        if len(counts) < 3:
            return anomalies
        
        # 통계 계산
        mean_count = statistics.mean(counts)
        std_count = statistics.stdev(counts) if len(counts) > 1 else 0
        
        # 이상 탐지
        for timestamp, window_logs in time_windows.items():
            count = len(window_logs)
            
            if std_count > 0:
                z_score = abs(count - mean_count) / std_count
                
                if z_score > self.threshold:
                    # 이상 로그 생성
                    anomaly = LogAnomaly(
                        anomaly_type=AnomalyType.FREQUENCY,
                        log_entry=window_logs[0] if window_logs else LogEntry(""),
                        anomaly_score=z_score,
                        description=f"Unusual log frequency: {count} logs in window (expected ~{mean_count:.1f})",
                        severity=SeverityLevel.HIGH if z_score > 5 else SeverityLevel.MEDIUM,
                        context={
                            "window_timestamp": timestamp,
                            "log_count": count,
                            "expected_count": mean_count,
                            "z_score": z_score
                        },
                        related_logs=window_logs,
                        suggested_actions=[
                            "Investigate the cause of log frequency spike",
                            "Check system resources and performance",
                            "Review application behavior during this time"
                        ]
                    )
                    anomalies.append(anomaly)
        
        return anomalies
    
    def _create_time_windows(self, logs: List[LogEntry]) -> Dict[datetime, List[LogEntry]]:
        """시간 윈도우 생성"""
        windows = defaultdict(list)
        
        for log in logs:
            # 윈도우 시작 시간 계산 (window_size 초 단위로 반올림)
            timestamp = log.timestamp
            window_start = datetime(
                timestamp.year, timestamp.month, timestamp.day,
                timestamp.hour, timestamp.minute,
                (timestamp.second // self.window_size) * self.window_size
            )
            
            windows[window_start].append(log)
        
        return dict(windows)


class PatternAnomalyDetector:
    """패턴 기반 이상 탐지"""
    
    def __init__(self, min_support: float = 0.01):
        self.min_support = min_support
        self.known_patterns = {}
        self.pattern_frequencies = Counter()
    
    def detect(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """패턴 이상 탐지"""
        anomalies = []
        
        # 패턴 학습 및 업데이트
        self._update_patterns(logs)
        
        # 각 로그에 대해 패턴 이상 검사
        for log in logs:
            log_pattern = self._extract_pattern(log.message or log.raw_message)
            
            if log_pattern not in self.known_patterns:
                # 새로운 패턴 발견
                anomaly_score = 1.0  # 최대 이상 점수
                
                anomaly = LogAnomaly(
                    anomaly_type=AnomalyType.PATTERN,
                    log_entry=log,
                    anomaly_score=anomaly_score,
                    description=f"Unknown log pattern detected: {log_pattern[:100]}...",
                    severity=SeverityLevel.MEDIUM,
                    context={"pattern": log_pattern},
                    suggested_actions=[
                        "Review the new log pattern",
                        "Check if this indicates a new error condition",
                        "Update pattern recognition rules if normal"
                    ]
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    def _extract_pattern(self, message: str) -> str:
        """메시지에서 패턴 추출"""
        if not message:
            return ""
        
        # 숫자를 플레이스홀더로 치환
        pattern = re.sub(r'\d+', '{NUM}', message)
        # 타임스탬프 치환
        pattern = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', '{TIMESTAMP}', pattern)
        # IP 주소 치환
        pattern = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', '{IP}', pattern)
        # URL 치환
        pattern = re.sub(r'https?://[^\s]+', '{URL}', pattern)
        # 파일 경로 치환
        pattern = re.sub(r'[/\\][\w/\\.-]+', '{PATH}', pattern)
        
        return pattern
    
    def _update_patterns(self, logs: List[LogEntry]):
        """패턴 업데이트"""
        for log in logs:
            pattern = self._extract_pattern(log.message or log.raw_message)
            self.pattern_frequencies[pattern] += 1
        
        # 최소 지지도 이상의 패턴만 유지
        total_logs = sum(self.pattern_frequencies.values())
        min_count = total_logs * self.min_support
        
        self.known_patterns = {
            pattern: count for pattern, count in self.pattern_frequencies.items()
            if count >= min_count
        }


class CorrelationAnomalyDetector:
    """상관관계 기반 이상 탐지"""
    
    def __init__(self, time_window: int = 300):  # 5분 윈도우
        self.time_window = time_window
        self.correlation_rules = {}
    
    def detect(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """상관관계 이상 탐지"""
        anomalies = []
        
        # 시간별로 로그 그룹화
        time_groups = self._group_by_time_window(logs)
        
        for window_start, window_logs in time_groups.items():
            # 예상되는 상관관계 확인
            correlation_anomalies = self._check_correlations(window_logs, window_start)
            anomalies.extend(correlation_anomalies)
        
        return anomalies
    
    def _group_by_time_window(self, logs: List[LogEntry]) -> Dict[datetime, List[LogEntry]]:
        """시간 윈도우별 그룹화"""
        groups = defaultdict(list)
        
        for log in logs:
            # 윈도우 시작 시간 계산
            timestamp = log.timestamp
            window_start = datetime(
                timestamp.year, timestamp.month, timestamp.day,
                timestamp.hour, 
                (timestamp.minute // (self.time_window // 60)) * (self.time_window // 60)
            )
            groups[window_start].append(log)
        
        return dict(groups)
    
    def _check_correlations(self, logs: List[LogEntry], window_start: datetime) -> List[LogAnomaly]:
        """상관관계 확인"""
        anomalies = []
        
        # 에러 로그가 있는데 관련된 정상 로그가 없는 경우
        error_logs = [log for log in logs if log.level in [LogLevel.ERROR, LogLevel.FATAL]]
        info_logs = [log for log in logs if log.level == LogLevel.INFO]
        
        if error_logs and not info_logs:
            # 에러만 있고 정상 로그가 없는 경우
            anomaly = LogAnomaly(
                anomaly_type=AnomalyType.CORRELATION,
                log_entry=error_logs[0],
                anomaly_score=0.7,
                description=f"Errors detected without corresponding normal operations in time window",
                severity=SeverityLevel.HIGH,
                context={
                    "window_start": window_start,
                    "error_count": len(error_logs),
                    "info_count": len(info_logs)
                },
                related_logs=error_logs,
                suggested_actions=[
                    "Investigate why no normal operations are logged",
                    "Check if the application is responding properly",
                    "Verify logging configuration"
                ]
            )
            anomalies.append(anomaly)
        
        return anomalies


# 메인 통합 클래스
class LogAnomalyDetectionEngine:
    """통합 로그 이상 탐지 엔진"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        
        # 이상 탐지기들 초기화
        self.detectors = {
            'frequency': FrequencyAnomalyDetector(),
            'pattern': PatternAnomalyDetector(),
            'correlation': CorrelationAnomalyDetector()
        }
        
        # 머신러닝 기반 탐지기 (선택적)
        if HAS_SKLEARN:
            self.ml_detector = IsolationForestDetector()
            self.detectors['ml'] = self.ml_detector
        
        # 이상 히스토리
        self.anomaly_history = deque(maxlen=10000)
        self.false_positive_patterns = set()
    
    def detect_anomalies_batch(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """배치 로그에서 이상 탐지"""
        all_anomalies = []
        
        # 각 탐지기로 이상 탐지
        for detector_name, detector in self.detectors.items():
            try:
                anomalies = detector.detect(logs)
                
                # 탐지기 정보 추가
                for anomaly in anomalies:
                    anomaly.context['detector'] = detector_name
                
                all_anomalies.extend(anomalies)
                
            except Exception as e:
                logger.error(f"Error in {detector_name} detector: {e}")
        
        # 중복 제거 및 점수 통합
        consolidated_anomalies = self._consolidate_anomalies(all_anomalies)
        
        # 거짓 양성 필터링
        filtered_anomalies = self._filter_false_positives(consolidated_anomalies)
        
        # 히스토리에 추가
        self.anomaly_history.extend(filtered_anomalies)
        
        return filtered_anomalies
    
    def detect_anomalies_stream(self, log_stream: Iterator[LogEntry]) -> Iterator[LogAnomaly]:
        """스트림 로그에서 실시간 이상 탐지"""
        buffer = deque(maxlen=1000)  # 슬라이딩 윈도우
        
        for log_entry in log_stream:
            buffer.append(log_entry)
            
            # 충분한 데이터가 쌓이면 이상 탐지 수행
            if len(buffer) >= 100:
                recent_logs = list(buffer)[-100:]  # 최근 100개 로그
                anomalies = self.detect_anomalies_batch(recent_logs)
                
                # 새로운 이상만 반환
                for anomaly in anomalies:
                    if self._is_new_anomaly(anomaly):
                        yield anomaly
    
    def _consolidate_anomalies(self, anomalies: List[LogAnomaly]) -> List[LogAnomaly]:
        """중복 이상 탐지 결과 통합"""
        # 유사한 이상들을 그룹화
        groups = defaultdict(list)
        
        for anomaly in anomalies:
            # 그룹화 키 생성 (시간 + 로그 엔트리 기반)
            key = (
                anomaly.log_entry.timestamp.replace(second=0, microsecond=0),
                anomaly.anomaly_type,
                anomaly.log_entry.raw_message[:100]
            )
            groups[key].append(anomaly)
        
        consolidated = []
        for group in groups.values():
            if len(group) == 1:
                consolidated.append(group[0])
            else:
                # 여러 탐지기에서 발견된 이상 - 점수 통합
                primary_anomaly = max(group, key=lambda x: x.anomaly_score)
                
                # 점수 가중 평균
                total_score = sum(a.anomaly_score for a in group)
                primary_anomaly.anomaly_score = min(total_score / len(group) * 1.2, 1.0)
                
                # 탐지기 정보 통합
                detectors = [a.context.get('detector', 'unknown') for a in group]
                primary_anomaly.context['detectors'] = detectors
                primary_anomaly.description += f" (detected by {', '.join(detectors)})"
                
                consolidated.append(primary_anomaly)
        
        return consolidated
    
    def _filter_false_positives(self, anomalies: List[LogAnomaly]) -> List[LogAnomaly]:
        """거짓 양성 필터링"""
        filtered = []
        
        for anomaly in anomalies:
            # 알려진 거짓 양성 패턴 확인
            pattern = self._extract_anomaly_pattern(anomaly)
            
            if pattern not in self.false_positive_patterns:
                # 추가 휴리스틱 검사
                if self._is_likely_false_positive(anomaly):
                    self.false_positive_patterns.add(pattern)
                    logger.debug(f"Added false positive pattern: {pattern}")
                else:
                    filtered.append(anomaly)
        
        return filtered
    
    def _extract_anomaly_pattern(self, anomaly: LogAnomaly) -> str:
        """이상 패턴 추출"""
        message = anomaly.log_entry.message or anomaly.log_entry.raw_message
        
        # 패턴 생성 (숫자, 시간 등을 일반화)
        pattern = re.sub(r'\d+', 'N', message)
        pattern = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', 'TIMESTAMP', pattern)
        pattern = re.sub(r'[a-fA-F0-9-]{36}', 'UUID', pattern)  # UUID 패턴
        
        return f"{anomaly.anomaly_type.value}:{pattern[:100]}"
    
    def _is_likely_false_positive(self, anomaly: LogAnomaly) -> bool:
        """거짓 양성 가능성 확인"""
        # 너무 낮은 이상 점수
        if anomaly.anomaly_score < 0.3:
            return True
        
        # 정보 레벨 로그의 빈도 이상은 거짓 양성일 가능성 높음
        if (anomaly.anomaly_type == AnomalyType.FREQUENCY and 
            anomaly.log_entry.level == LogLevel.INFO):
            return True
        
        # 반복적으로 발생하는 패턴 (스케줄링 등)
        recent_similar = [
            a for a in self.anomaly_history
            if (a.anomaly_type == anomaly.anomaly_type and
                abs((a.log_entry.timestamp - anomaly.log_entry.timestamp).total_seconds()) < 3600)
        ]
        
        if len(recent_similar) > 5:  # 1시간 내 5회 이상 유사한 이상
            return True
        
        return False
    
    def _is_new_anomaly(self, anomaly: LogAnomaly) -> bool:
        """새로운 이상인지 확인"""
        pattern = self._extract_anomaly_pattern(anomaly)
        
        # 최근 히스토리에서 유사한 이상 확인
        recent_threshold = datetime.now() - timedelta(minutes=5)
        recent_patterns = {
            self._extract_anomaly_pattern(a) for a in self.anomaly_history
            if a.log_entry.timestamp > recent_threshold
        }
        
        return pattern not in recent_patterns
    
    def mark_false_positive(self, anomaly: LogAnomaly):
        """거짓 양성으로 마킹"""
        pattern = self._extract_anomaly_pattern(anomaly)
        self.false_positive_patterns.add(pattern)
        logger.info(f"Marked as false positive: {pattern}")
    
    def get_anomaly_statistics(self) -> Dict[str, Any]:
        """이상 탐지 통계"""
        if not self.anomaly_history:
            return {}
        
        total_anomalies = len(self.anomaly_history)
        
        # 타입별 분포
        type_distribution = Counter(a.anomaly_type for a in self.anomaly_history)
        
        # 심각도별 분포
        severity_distribution = Counter(a.severity for a in self.anomaly_history)
        
        # 최근 트렌드
        recent_threshold = datetime.now() - timedelta(hours=24)
        recent_anomalies = [
            a for a in self.anomaly_history
            if a.log_entry.timestamp > recent_threshold
        ]
        
        return {
            'total_anomalies': total_anomalies,
            'recent_24h': len(recent_anomalies),
            'type_distribution': dict(type_distribution),
            'severity_distribution': {k.value: v for k, v in severity_distribution.items()},
            'false_positive_patterns': len(self.false_positive_patterns),
            'avg_anomaly_score': statistics.mean(a.anomaly_score for a in self.anomaly_history)
        }


class IsolationForestDetector:
    """Isolation Forest 기반 이상 탐지"""
    
    def __init__(self, contamination: float = 0.1):
        self.contamination = contamination
        self.model = None
        self.vectorizer = None
        self.is_trained = False
        
        if HAS_SKLEARN:
            from sklearn.ensemble import IsolationForest
            from sklearn.feature_extraction.text import TfidfVectorizer
            
            self.model = IsolationForest(contamination=contamination, random_state=42)
            self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
    
    def detect(self, logs: List[LogEntry]) -> List[LogAnomaly]:
        """ML 기반 이상 탐지"""
        if not HAS_SKLEARN or len(logs) < 50:
            return []
        
        try:
            # 특성 추출
            features = self._extract_features(logs)
            
            if features is None or features.shape[0] < 10:
                return []
            
            # 모델 훈련 (처음 또는 주기적으로)
            if not self.is_trained:
                self.model.fit(features)
                self.is_trained = True
            
            # 이상 탐지
            anomaly_scores = self.model.decision_function(features)
            predictions = self.model.predict(features)
            
            anomalies = []
            for i, (log, score, prediction) in enumerate(zip(logs, anomaly_scores, predictions)):
                if prediction == -1:  # 이상으로 분류
                    anomaly = LogAnomaly(
                        anomaly_type=AnomalyType.PATTERN,
                        log_entry=log,
                        anomaly_score=abs(score),  # 음수 점수를 양수로 변환
                        description=f"ML-detected anomaly (score: {score:.3f})",
                        severity=SeverityLevel.MEDIUM,
                        context={'ml_score': score, 'method': 'isolation_forest'},
                        suggested_actions=[
                            "Review the anomalous log entry",
                            "Check for unusual patterns or values",
                            "Investigate potential security or performance issues"
                        ]
                    )
                    anomalies.append(anomaly)
            
            return anomalies
            
        except Exception as e:
            logger.error(f"ML anomaly detection failed: {e}")
            return []
    
    def _extract_features(self, logs: List[LogEntry]) -> Optional[Any]:
        """로그에서 특성 추출"""
        if not logs:
            return None
        
        # 텍스트 특성
        messages = [log.message or log.raw_message for log in logs]
        
        try:
            # TF-IDF 벡터화
            if not hasattr(self.vectorizer, 'vocabulary_') or not self.vectorizer.vocabulary_:
                # 처음 훈련
                text_features = self.vectorizer.fit_transform(messages)
            else:
                # 기존 벡터라이저 사용
                text_features = self.vectorizer.transform(messages)
            
            # 숫자 특성 추가
            numeric_features = []
            for log in logs:
                features = [
                    log.level.value,  # 로그 레벨
                    len(log.message or log.raw_message),  # 메시지 길이
                    log.timestamp.hour,  # 시간
                    log.timestamp.weekday(),  # 요일
                    len(log.fields),  # 필드 수
                ]
                numeric_features.append(features)
            
            # 텍스트와 숫자 특성 결합
            if HAS_PANDAS:
                import numpy as np
                from scipy.sparse import hstack
                
                numeric_array = np.array(numeric_features)
                combined_features = hstack([text_features, numeric_array])
                return combined_features
            else:
                return text_features
                
        except Exception as e:
            logger.error(f"Feature extraction failed: {e}")
            return None


# 사용 예제 및 유틸리티 함수들
class LogParsingPipeline:
    """로그 파싱 파이프라인"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.parser = ContextAwareLogParser(config)
        self.anomaly_detector = LogAnomalyDetectionEngine(config)
        self.parsed_logs = []
        self.semantic_logs = []
        
    async def process_log_stream(self, log_stream: Iterator[str], 
                               context: LogContext) -> Iterator[Dict[str, Any]]:
        """로그 스트림 처리"""
        for raw_log in log_stream:
            try:
                # 파싱
                parsed_log = self.parser.parse_with_context(raw_log, context)
                if not parsed_log:
                    continue
                
                # 의미론적 분석
                semantic_log = self.parser.extract_semantic_meaning(parsed_log)
                
                # 이상 탐지 (배치 단위로)
                self.parsed_logs.append(parsed_log.entry)
                if len(self.parsed_logs) >= 100:
                    anomalies = self.anomaly_detector.detect_anomalies_batch(self.parsed_logs[-100:])
                    
                    # 결과 생성
                    result = {
                        'parsed_log': parsed_log,
                        'semantic_log': semantic_log,
                        'anomalies': anomalies
                    }
                    
                    yield result
                    
            except Exception as e:
                logger.error(f"Error processing log: {e}")
                continue
    
    def get_pipeline_statistics(self) -> Dict[str, Any]:
        """파이프라인 통계"""
        return {
            'parser_metrics': self.parser.metrics,
            'anomaly_stats': self.anomaly_detector.get_anomaly_statistics(),
            'total_processed_logs': len(self.parsed_logs)
        }


# 유틸리티 함수들
def create_log_context(source_type: str, **kwargs) -> LogContext:
    """로그 컨텍스트 생성 헬퍼"""
    return LogContext(source_type=source_type, **kwargs)

def parse_log_file(file_path: str, context: LogContext) -> List[ParsedLog]:
    """로그 파일 파싱"""
    parser = ContextAwareLogParser()
    parsed_logs = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    parsed_log = parser.parse_with_context(line, context)
                    if parsed_log:
                        parsed_logs.append(parsed_log)
    except Exception as e:
        logger.error(f"Error reading log file {file_path}: {e}")
    
    return parsed_logs

def analyze_log_patterns(logs: List[LogEntry]) -> Dict[str, Any]:
    """로그 패턴 분석"""
    if not logs:
        return {}
    
    # 레벨별 분포
    level_distribution = Counter(log.level for log in logs)
    
    # 시간별 분포
    hour_distribution = Counter(log.timestamp.hour for log in logs)
    
    # 태그 분포
    all_tags = []
    for log in logs:
        all_tags.extend(log.tags)
    tag_distribution = Counter(all_tags)
    
    # 소스별 분포
    source_distribution = Counter(log.source for log in logs)
    
    return {
        'total_logs': len(logs),
        'level_distribution': dict(level_distribution),
        'hour_distribution': dict(hour_distribution),
        'tag_distribution': dict(tag_distribution.most_common(10)),
        'source_distribution': dict(source_distribution),
        'time_span': {
            'start': min(log.timestamp for log in logs),
            'end': max(log.timestamp for log in logs)
        }
    }

def export_anomalies_to_json(anomalies: List[LogAnomaly], output_file: str):
    """이상 탐지 결과를 JSON으로 내보내기"""
    export_data = []
    
    for anomaly in anomalies:
        data = {
            'anomaly_type': anomaly.anomaly_type.value,
            'log_entry': {
                'timestamp': anomaly.log_entry.timestamp.isoformat(),
                'level': anomaly.log_entry.level.name,
                'message': anomaly.log_entry.message,
                'raw_message': anomaly.log_entry.raw_message,
                'fields': anomaly.log_entry.fields
            },
            'anomaly_score': anomaly.anomaly_score,
            'description': anomaly.description,
            'severity': anomaly.severity.name,
            'context': anomaly.context,
            'suggested_actions': anomaly.suggested_actions
        }
        export_data.append(data)
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False, default=str)
        logger.info(f"Exported {len(anomalies)} anomalies to {output_file}")
    except Exception as e:
        logger.error(f"Failed to export anomalies: {e}")


# 메인 실행 함수
async def main():
    """메인 실행 함수 - 사용 예제"""
    
    # 로그 컨텍스트 생성
    context = LogContext(
        source_type="web_server",
        application_name="my_app",
        environment="production",
        server_name="web01"
    )
    
    # 파서 초기화
    parser = ContextAwareLogParser()
    
    # 샘플 로그들
    sample_logs = [
        '127.0.0.1 - - [10/Dec/2023:13:55:36 +0000] "GET /api/users HTTP/1.1" 200 2326',
        '{"timestamp": "2023-12-10T13:55:37Z", "level": "ERROR", "message": "Database connection failed"}',
        'Dec 10 13:55:38 web01 nginx[1234]: connection refused',
        '2023-12-10T13:55:39Z CRITICAL: Out of memory error',
    ]
    
    # 파싱 및 분석
    parsed_logs = []
    semantic_logs = []
    
    for raw_log in sample_logs:
        # 파싱
        parsed_log = parser.parse_with_context(raw_log, context)
        if parsed_log:
            parsed_logs.append(parsed_log)
            
            # 의미론적 분석
            semantic_log = parser.extract_semantic_meaning(parsed_log)
            semantic_logs.append(semantic_log)
    
    # 이상 탐지
    anomaly_detector = LogAnomalyDetectionEngine()
    log_entries = [pl.entry for pl in parsed_logs]
    anomalies = anomaly_detector.detect_anomalies_batch(log_entries)
    
    # 결과 출력
    print(f"Parsed {len(parsed_logs)} logs")
    print(f"Detected {len(anomalies)} anomalies")
    
    for anomaly in anomalies:
        print(f"Anomaly: {anomaly.description} (score: {anomaly.anomaly_score:.2f})")
    
    # 통계 출력
    stats = analyze_log_patterns(log_entries)
    print("Log analysis statistics:", stats)


if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 비동기 실행
    asyncio.run(main())