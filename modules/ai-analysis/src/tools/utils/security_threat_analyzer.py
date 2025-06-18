#!/usr/bin/env python3
"""
Advanced Security Threat Analyzer
자가 발전형 LLM 연동 IDE를 위한 고도화된 보안 위협 분석 시스템

주요 기능:
- 실시간 보안 위협 탐지
- AI 기반 위협 패턴 분석
- 자동 대응 전략 생성
- 진화형 위협 인텔리전스
- 멀티소스 보안 로그 통합 분석
- 예측적 보안 분석
- 자동 취약점 스캔 및 수정 제안
"""

import asyncio
import hashlib
import hmac
import json
import logging
import re
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Callable,
    Iterator, AsyncIterator, Protocol, runtime_checkable
)
import ipaddress
import ssl
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import weakref
from contextlib import asynccontextmanager
import aiofiles
import aiohttp
import requests
from cryptography import x509
from cryptography.hazmat.primitives import serialization
import yaml

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class ThreatLevel(Enum):
    """위협 수준"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ThreatType(Enum):
    """위협 유형"""
    MALWARE = "malware"
    PHISHING = "phishing"
    SQL_INJECTION = "sql_injection"
    XSS = "xss"
    CSRF = "csrf"
    BRUTE_FORCE = "brute_force"
    DDoS = "ddos"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    DATA_EXFILTRATION = "data_exfiltration"
    INSIDER_THREAT = "insider_threat"
    APT = "advanced_persistent_threat"
    ZERO_DAY = "zero_day"
    SUPPLY_CHAIN = "supply_chain"
    SOCIAL_ENGINEERING = "social_engineering"
    RANSOMWARE = "ransomware"


class SecurityEventType(Enum):
    """보안 이벤트 유형"""
    AUTHENTICATION_FAILURE = "auth_failure"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    SUSPICIOUS_NETWORK_ACTIVITY = "suspicious_network"
    ANOMALOUS_USER_BEHAVIOR = "anomalous_behavior"
    POLICY_VIOLATION = "policy_violation"
    VULNERABILITY_DETECTED = "vulnerability_detected"
    MALICIOUS_CODE_DETECTED = "malicious_code"
    DATA_BREACH_ATTEMPT = "data_breach_attempt"
    CONFIGURATION_CHANGE = "config_change"
    SYSTEM_COMPROMISE = "system_compromise"


class MitigationStatus(Enum):
    """완화 조치 상태"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    MONITORING = "monitoring"


# 데이터 클래스들
@dataclass
class SecurityEvent:
    """보안 이벤트"""
    id: str
    event_type: SecurityEventType
    timestamp: datetime
    source_ip: Optional[str] = None
    target_ip: Optional[str] = None
    user_agent: Optional[str] = None
    payload: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    severity: ThreatLevel = ThreatLevel.INFO
    raw_log: Optional[str] = None
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class SecurityAnomaly:
    """보안 이상 징후"""
    id: str
    anomaly_type: str
    confidence_score: float
    description: str
    events: List[SecurityEvent]
    timeline: List[datetime]
    affected_resources: List[str]
    potential_threats: List[ThreatType]
    risk_score: float
    detected_at: datetime = field(default_factory=datetime.now)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class ThreatIntelligence:
    """위협 인텔리전스"""
    ioc_type: str  # IP, domain, hash, etc.
    value: str
    threat_types: List[ThreatType]
    confidence: float
    first_seen: datetime
    last_seen: datetime
    source: str
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Vulnerability:
    """취약점 정보"""
    id: str
    cve_id: Optional[str]
    title: str
    description: str
    severity: ThreatLevel
    cvss_score: Optional[float]
    affected_components: List[str]
    exploit_available: bool
    patch_available: bool
    discovery_date: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MitigationStrategy:
    """완화 전략"""
    id: str
    name: str
    description: str
    priority: ThreatLevel
    estimated_effort: int  # hours
    effectiveness_score: float
    implementation_steps: List[str]
    prerequisites: List[str]
    risks: List[str]
    automation_possible: bool
    status: MitigationStatus = MitigationStatus.PENDING
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class SecurityMetrics:
    """보안 메트릭"""
    total_events: int
    critical_threats: int
    high_threats: int
    medium_threats: int
    low_threats: int
    false_positives: int
    mean_detection_time: float
    mean_response_time: float
    incident_count: int
    vulnerability_count: int
    patching_rate: float
    security_score: float


class SecurityThreatAnalyzer:
    """고도화된 보안 위협 분석기"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # 내부 상태
        self.threat_intelligence_db: Dict[str, ThreatIntelligence] = {}
        self.known_vulnerabilities: Dict[str, Vulnerability] = {}
        self.event_history: deque = deque(maxlen=10000)
        self.anomaly_detectors: Dict[str, Callable] = {}
        self.mitigation_strategies: Dict[str, MitigationStrategy] = {}
        
        # 패턴 및 규칙
        self.attack_patterns = self._load_attack_patterns()
        self.security_rules = self._load_security_rules()
        self.ml_models = {}
        
        # 성능 메트릭
        self.metrics = SecurityMetrics(
            total_events=0, critical_threats=0, high_threats=0,
            medium_threats=0, low_threats=0, false_positives=0,
            mean_detection_time=0.0, mean_response_time=0.0,
            incident_count=0, vulnerability_count=0,
            patching_rate=0.0, security_score=0.0
        )
        
        # 스레드 안전성
        self._lock = threading.RLock()
        
        # 초기화
        self._initialize_threat_intelligence()
        self._initialize_anomaly_detectors()
        self._initialize_ml_models()
    
    def _load_attack_patterns(self) -> Dict[str, Dict[str, Any]]:
        """공격 패턴 로드"""
        patterns = {
            "sql_injection": {
                "regex_patterns": [
                    r"(\%27)|(\')|(\-\-)|(\%23)|(#)",
                    r"((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))",
                    r"\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))",
                    r"((\%27)|(\'))union",
                    r"exec(\s|\+)+(s|x)p\w+",
                    r"union.*select.*from",
                    r"select.*from.*where.*="
                ],
                "severity": ThreatLevel.HIGH,
                "description": "SQL Injection attack patterns"
            },
            "xss": {
                "regex_patterns": [
                    r"<script[^>]*>.*?</script>",
                    r"javascript:",
                    r"on\w+\s*=",
                    r"<iframe[^>]*>",
                    r"eval\s*\(",
                    r"document\.cookie",
                    r"window\.location"
                ],
                "severity": ThreatLevel.HIGH,
                "description": "Cross-Site Scripting (XSS) patterns"
            },
            "command_injection": {
                "regex_patterns": [
                    r"(\||;|&|\$\(|\`)",
                    r"(nc|netcat|wget|curl)(\s|$)",
                    r"(rm|del|format)(\s|$)",
                    r"(cat|type)(\s|$)",
                    r"(ps|tasklist)(\s|$)",
                    r"(\.\./|\.\.\\\)",
                    r"/etc/passwd",
                    r"cmd\.exe",
                    r"powershell"
                ],
                "severity": ThreatLevel.CRITICAL,
                "description": "Command injection patterns"
            },
            "path_traversal": {
                "regex_patterns": [
                    r"(\.\./|\.\.\\\){2,}",
                    r"(\.\.%2f|\.\.%5c){2,}",
                    r"/etc/passwd",
                    r"\\windows\\system32",
                    r"\.\..*\.\..*\.\."
                ],
                "severity": ThreatLevel.HIGH,
                "description": "Path traversal attack patterns"
            },
            "brute_force": {
                "behavioral_patterns": {
                    "failed_login_threshold": 10,
                    "time_window": 300,  # 5 minutes
                    "unique_usernames": 5
                },
                "severity": ThreatLevel.MEDIUM,
                "description": "Brute force attack patterns"
            }
        }
        
        # 정규식 컴파일
        for pattern_name, pattern_data in patterns.items():
            if "regex_patterns" in pattern_data:
                pattern_data["compiled_patterns"] = [
                    re.compile(pattern, re.IGNORECASE)
                    for pattern in pattern_data["regex_patterns"]
                ]
        
        return patterns
    
    def _load_security_rules(self) -> Dict[str, Any]:
        """보안 규칙 로드"""
        return {
            "suspicious_ips": {
                "known_malicious_ranges": [
                    "10.0.0.0/8",  # Private ranges used maliciously
                    "172.16.0.0/12",
                    "192.168.0.0/16"
                ],
                "tor_exit_nodes": [],  # Would be populated from external source
                "vpn_ranges": []
            },
            "suspicious_user_agents": [
                "sqlmap",
                "nikto",
                "nmap",
                "masscan",
                "zap",
                "burp",
                "w3af"
            ],
            "sensitive_files": [
                "/etc/passwd",
                "/etc/shadow",
                "web.config",
                ".env",
                "config.php",
                "database.yml",
                "secrets.json"
            ],
            "admin_paths": [
                "/admin",
                "/administrator",
                "/wp-admin",
                "/phpmyadmin",
                "/cpanel",
                "/webmail"
            ]
        }
    
    def _initialize_threat_intelligence(self):
        """위협 인텔리전스 초기화"""
        # 기본 위협 인텔리전스 로드
        default_threats = [
            {
                "ioc_type": "ip",
                "value": "192.168.1.100",
                "threat_types": [ThreatType.BRUTE_FORCE],
                "confidence": 0.8,
                "source": "internal_analysis"
            }
        ]
        
        for threat_data in default_threats:
            threat = ThreatIntelligence(
                ioc_type=threat_data["ioc_type"],
                value=threat_data["value"],
                threat_types=threat_data["threat_types"],
                confidence=threat_data["confidence"],
                first_seen=datetime.now(),
                last_seen=datetime.now(),
                source=threat_data["source"]
            )
            self.threat_intelligence_db[threat.value] = threat
    
    def _initialize_anomaly_detectors(self):
        """이상 징후 탐지기 초기화"""
        self.anomaly_detectors = {
            "traffic_spike": self._detect_traffic_spike,
            "unusual_access_pattern": self._detect_unusual_access_pattern,
            "privilege_escalation": self._detect_privilege_escalation,
            "data_exfiltration": self._detect_data_exfiltration,
            "lateral_movement": self._detect_lateral_movement,
            "time_based_anomaly": self._detect_time_based_anomaly
        }
    
    def _initialize_ml_models(self):
        """머신러닝 모델 초기화"""
        # 실제 구현에서는 사전 훈련된 모델을 로드
        self.ml_models = {
            "anomaly_detection": None,  # Isolation Forest 등
            "threat_classification": None,  # Random Forest 등
            "risk_scoring": None,  # Neural Network 등
            "behavioral_analysis": None  # LSTM 등
        }
    
    async def detect_security_anomalies(self, logs: List[Dict[str, Any]]) -> List[SecurityAnomaly]:
        """보안 이상 징후 탐지"""
        anomalies = []
        
        # 로그를 SecurityEvent로 변환
        events = [self._parse_log_to_event(log) for log in logs]
        
        # 각 탐지기 실행
        for detector_name, detector_func in self.anomaly_detectors.items():
            try:
                detected_anomalies = await detector_func(events)
                anomalies.extend(detected_anomalies)
                self.logger.debug(f"Detector {detector_name} found {len(detected_anomalies)} anomalies")
            except Exception as e:
                self.logger.error(f"Error in detector {detector_name}: {e}")
        
        # 중복 제거 및 우선순위 정렬
        unique_anomalies = self._deduplicate_anomalies(anomalies)
        sorted_anomalies = sorted(unique_anomalies, key=lambda x: x.risk_score, reverse=True)
        
        return sorted_anomalies
    
    def _parse_log_to_event(self, log: Dict[str, Any]) -> SecurityEvent:
        """로그를 SecurityEvent로 파싱"""
        event_type = self._classify_log_event_type(log)
        
        return SecurityEvent(
            id=str(uuid.uuid4()),
            event_type=event_type,
            timestamp=self._parse_timestamp(log.get("timestamp", datetime.now())),
            source_ip=log.get("source_ip"),
            target_ip=log.get("target_ip"),
            user_agent=log.get("user_agent"),
            payload=log.get("payload"),
            headers=log.get("headers", {}),
            metadata=log.get("metadata", {}),
            raw_log=json.dumps(log)
        )
    
    def _classify_log_event_type(self, log: Dict[str, Any]) -> SecurityEventType:
        """로그 이벤트 유형 분류"""
        message = log.get("message", "").lower()
        status_code = log.get("status_code", 0)
        
        if "authentication" in message and ("fail" in message or status_code == 401):
            return SecurityEventType.AUTHENTICATION_FAILURE
        elif "unauthorized" in message or status_code == 403:
            return SecurityEventType.UNAUTHORIZED_ACCESS
        elif "malware" in message or "virus" in message:
            return SecurityEventType.MALICIOUS_CODE_DETECTED
        elif "configuration" in message and "change" in message:
            return SecurityEventType.CONFIGURATION_CHANGE
        else:
            return SecurityEventType.SUSPICIOUS_NETWORK_ACTIVITY
    
    def _parse_timestamp(self, timestamp_data: Any) -> datetime:
        """타임스탬프 파싱"""
        if isinstance(timestamp_data, datetime):
            return timestamp_data
        elif isinstance(timestamp_data, str):
            try:
                return datetime.fromisoformat(timestamp_data.replace('Z', '+00:00'))
            except ValueError:
                return datetime.now()
        elif isinstance(timestamp_data, (int, float)):
            return datetime.fromtimestamp(timestamp_data)
        else:
            return datetime.now()
    
    async def _detect_traffic_spike(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """트래픽 급증 탐지"""
        anomalies = []
        
        # 시간대별 트래픽 분석
        traffic_by_hour = defaultdict(int)
        for event in events:
            hour_key = event.timestamp.replace(minute=0, second=0, microsecond=0)
            traffic_by_hour[hour_key] += 1
        
        if len(traffic_by_hour) < 2:
            return anomalies
        
        # 평균 및 표준편차 계산
        traffic_values = list(traffic_by_hour.values())
        avg_traffic = sum(traffic_values) / len(traffic_values)
        
        # 임계값 초과 확인 (평균의 3배)
        threshold = avg_traffic * 3
        
        for hour, count in traffic_by_hour.items():
            if count > threshold:
                anomaly = SecurityAnomaly(
                    id=str(uuid.uuid4()),
                    anomaly_type="traffic_spike",
                    confidence_score=min(count / threshold, 1.0),
                    description=f"Traffic spike detected: {count} events in hour {hour}",
                    events=[e for e in events if e.timestamp.hour == hour.hour],
                    timeline=[hour],
                    affected_resources=["network"],
                    potential_threats=[ThreatType.DDoS],
                    risk_score=min(count / threshold * 0.7, 1.0)
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_unusual_access_pattern(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """비정상 접근 패턴 탐지"""
        anomalies = []
        
        # IP별 접근 패턴 분석
        ip_patterns = defaultdict(lambda: {
            "request_count": 0,
            "unique_resources": set(),
            "time_distribution": [],
            "user_agents": set(),
            "status_codes": []
        })
        
        for event in events:
            if event.source_ip:
                pattern = ip_patterns[event.source_ip]
                pattern["request_count"] += 1
                pattern["time_distribution"].append(event.timestamp)
                if event.user_agent:
                    pattern["user_agents"].add(event.user_agent)
        
        for ip, pattern in ip_patterns.items():
            risk_score = 0.0
            suspicious_indicators = []
            
            # 요청 수 기반 분석
            if pattern["request_count"] > 1000:  # 시간당 1000회 이상
                risk_score += 0.3
                suspicious_indicators.append("high_request_rate")
            
            # User-Agent 다양성 분석
            if len(pattern["user_agents"]) > 10:  # 10개 이상의 다른 User-Agent
                risk_score += 0.2
                suspicious_indicators.append("multiple_user_agents")
            
            # 의심스러운 User-Agent 확인
            for ua in pattern["user_agents"]:
                if any(suspicious in ua.lower() for suspicious in self.security_rules["suspicious_user_agents"]):
                    risk_score += 0.4
                    suspicious_indicators.append("suspicious_user_agent")
                    break
            
            # 시간 분포 분석 (너무 규칙적인 패턴)
            if len(pattern["time_distribution"]) > 10:
                time_intervals = []
                sorted_times = sorted(pattern["time_distribution"])
                for i in range(1, len(sorted_times)):
                    interval = (sorted_times[i] - sorted_times[i-1]).total_seconds()
                    time_intervals.append(interval)
                
                if time_intervals and max(time_intervals) - min(time_intervals) < 1:  # 1초 이내 간격
                    risk_score += 0.3
                    suspicious_indicators.append("regular_timing_pattern")
            
            if risk_score > 0.5:
                anomaly = SecurityAnomaly(
                    id=str(uuid.uuid4()),
                    anomaly_type="unusual_access_pattern",
                    confidence_score=min(risk_score, 1.0),
                    description=f"Unusual access pattern from {ip}: {', '.join(suspicious_indicators)}",
                    events=[e for e in events if e.source_ip == ip],
                    timeline=pattern["time_distribution"],
                    affected_resources=[ip],
                    potential_threats=[ThreatType.BRUTE_FORCE, ThreatType.DDoS],
                    risk_score=risk_score
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_privilege_escalation(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """권한 상승 탐지"""
        anomalies = []
        
        privilege_indicators = [
            "sudo", "su", "admin", "root", "administrator",
            "escalate", "privilege", "permission", "grant"
        ]
        
        suspicious_events = []
        for event in events:
            if event.payload:
                payload_lower = event.payload.lower()
                if any(indicator in payload_lower for indicator in privilege_indicators):
                    suspicious_events.append(event)
        
        if len(suspicious_events) > 5:  # 5개 이상의 권한 관련 이벤트
            anomaly = SecurityAnomaly(
                id=str(uuid.uuid4()),
                anomaly_type="privilege_escalation",
                confidence_score=min(len(suspicious_events) / 10, 1.0),
                description=f"Potential privilege escalation detected: {len(suspicious_events)} related events",
                events=suspicious_events,
                timeline=[e.timestamp for e in suspicious_events],
                affected_resources=["system"],
                potential_threats=[ThreatType.PRIVILEGE_ESCALATION],
                risk_score=min(len(suspicious_events) / 10 * 0.8, 1.0)
            )
            anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_data_exfiltration(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """데이터 유출 탐지"""
        anomalies = []
        
        # 대용량 데이터 전송 패턴 탐지
        large_transfers = []
        sensitive_file_access = []
        
        for event in events:
            # 페이로드 크기 기반 분석
            if event.payload and len(event.payload) > 10000:  # 10KB 이상
                large_transfers.append(event)
            
            # 민감한 파일 접근 패턴
            if event.payload:
                for sensitive_file in self.security_rules["sensitive_files"]:
                    if sensitive_file in event.payload.lower():
                        sensitive_file_access.append(event)
                        break
        
        if len(large_transfers) > 10:
            anomaly = SecurityAnomaly(
                id=str(uuid.uuid4()),
                anomaly_type="data_exfiltration",
                confidence_score=min(len(large_transfers) / 20, 1.0),
                description=f"Potential data exfiltration: {len(large_transfers)} large data transfers",
                events=large_transfers,
                timeline=[e.timestamp for e in large_transfers],
                affected_resources=["data"],
                potential_threats=[ThreatType.DATA_EXFILTRATION],
                risk_score=min(len(large_transfers) / 20 * 0.9, 1.0)
            )
            anomalies.append(anomaly)
        
        if sensitive_file_access:
            anomaly = SecurityAnomaly(
                id=str(uuid.uuid4()),
                anomaly_type="sensitive_file_access",
                confidence_score=min(len(sensitive_file_access) / 5, 1.0),
                description=f"Sensitive file access detected: {len(sensitive_file_access)} attempts",
                events=sensitive_file_access,
                timeline=[e.timestamp for e in sensitive_file_access],
                affected_resources=["filesystem"],
                potential_threats=[ThreatType.DATA_EXFILTRATION, ThreatType.INSIDER_THREAT],
                risk_score=min(len(sensitive_file_access) / 5 * 0.7, 1.0)
            )
            anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_lateral_movement(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """횡적 이동 탐지"""
        anomalies = []
        
        # IP 간 연결 패턴 분석
        ip_connections = defaultdict(set)
        
        for event in events:
            if event.source_ip and event.target_ip:
                ip_connections[event.source_ip].add(event.target_ip)
        
        for source_ip, target_ips in ip_connections.items():
            if len(target_ips) > 10:  # 하나의 소스에서 10개 이상의 대상으로 연결
                related_events = [e for e in events if e.source_ip == source_ip]
                
                anomaly = SecurityAnomaly(
                    id=str(uuid.uuid4()),
                    anomaly_type="lateral_movement",
                    confidence_score=min(len(target_ips) / 20, 1.0),
                    description=f"Potential lateral movement: {source_ip} connected to {len(target_ips)} targets",
                    events=related_events,
                    timeline=[e.timestamp for e in related_events],
                    affected_resources=[source_ip] + list(target_ips),
                    potential_threats=[ThreatType.APT, ThreatType.PRIVILEGE_ESCALATION],
                    risk_score=min(len(target_ips) / 20 * 0.8, 1.0)
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    async def _detect_time_based_anomaly(self, events: List[SecurityEvent]) -> List[SecurityAnomaly]:
        """시간 기반 이상 탐지"""
        anomalies = []
        
        # 시간대별 활동 분석
        hourly_activity = defaultdict(int)
        for event in events:
            hour = event.timestamp.hour
            hourly_activity[hour] += 1
        
        # 비정상적인 시간대 활동 탐지 (새벽 2-6시)
        night_hours = [2, 3, 4, 5, 6]
        night_activity = sum(hourly_activity[hour] for hour in night_hours)
        total_activity = sum(hourly_activity.values())
        
        if total_activity > 0:
            night_ratio = night_activity / total_activity
            
            if night_ratio > 0.3:  # 30% 이상이 새벽 시간대
                night_events = [e for e in events if e.timestamp.hour in night_hours]
                
                anomaly = SecurityAnomaly(
                    id=str(uuid.uuid4()),
                    anomaly_type="time_based_anomaly",
                    confidence_score=min(night_ratio * 2, 1.0),
                    description=f"Unusual activity during night hours: {night_ratio:.2%} of total activity",
                    events=night_events,
                    timeline=[e.timestamp for e in night_events],
                    affected_resources=["system"],
                    potential_threats=[ThreatType.INSIDER_THREAT, ThreatType.APT],
                    risk_score=min(night_ratio * 0.6, 1.0)
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    def _deduplicate_anomalies(self, anomalies: List[SecurityAnomaly]) -> List[SecurityAnomaly]:
        """이상 징후 중복 제거"""
        # 유사한 이상 징후들을 병합
        unique_anomalies = []
        processed_ids = set()
        
        for anomaly in anomalies:
            if anomaly.id in processed_ids:
                continue
            
            # 유사한 이상 징후 찾기
            similar_anomalies = [
                other for other in anomalies
                if other.id != anomaly.id and 
                self._are_anomalies_similar(anomaly, other)
            ]
            
            if similar_anomalies:
                # 병합된 이상 징후 생성
                merged_anomaly = self._merge_anomalies(anomaly, similar_anomalies)
                unique_anomalies.append(merged_anomaly)
                
                # 처리된 ID들 추가
                processed_ids.add(anomaly.id)
                processed_ids.update(a.id for a in similar_anomalies)
            else:
                unique_anomalies.append(anomaly)
                processed_ids.add(anomaly.id)
        
        return unique_anomalies
    
    def _are_anomalies_similar(self, anomaly1: SecurityAnomaly, anomaly2: SecurityAnomaly) -> bool:
        """두 이상 징후가 유사한지 확인"""
        # 같은 타입이고 시간이 근접한 경우
        time_diff = abs((anomaly1.detected_at - anomaly2.detected_at).total_seconds())
        return (anomaly1.anomaly_type == anomaly2.anomaly_type and 
                time_diff < 300 and  # 5분 이내
                len(set(anomaly1.affected_resources) & set(anomaly2.affected_resources)) > 0)
    
    def _merge_anomalies(self, primary: SecurityAnomaly, others: List[SecurityAnomaly]) -> SecurityAnomaly:
        """이상 징후들을 병합"""
        all_events = primary.events[:]
        all_timelines = primary.timeline[:]
        all_resources = set(primary.affected_resources)
        all_threats = set(primary.potential_threats)
        
        for anomaly in others:
            all_events.extend(anomaly.events)
            all_timelines.extend(anomaly.timeline)
            all_resources.update(anomaly.affected_resources)
            all_threats.update(anomaly.potential_threats)
        
        # 병합된 이상 징후 생성
        merged = SecurityAnomaly(
            id=str(uuid.uuid4()),
            anomaly_type=primary.anomaly_type,
            confidence_score=max(primary.confidence_score, 
                               max((a.confidence_score for a in others), default=0)),
            description=f"Merged anomaly: {primary.description} (and {len(others)} similar)",
            events=all_events,
            timeline=sorted(all_timelines),
            affected_resources=list(all_resources),
            potential_threats=list(all_threats),
            risk_score=min(sum(a.risk_score for a in [primary] + others) / len([primary] + others), 1.0)
        )
        
        return merged
    
    async def assess_threat_severity(self, threat: Dict[str, Any]) -> Tuple[ThreatLevel, float]:
        """위협 심각도 평가"""
        threat_type = threat.get("type", "unknown")
        indicators = threat.get("indicators", [])
        affected_assets = threat.get("affected_assets", [])
        
        severity_score = 0.0
        
        # 위협 유형별 기본 점수
        threat_type_scores = {
            ThreatType.CRITICAL.value: 0.9,
            ThreatType.RANSOMWARE.value: 0.9,
            ThreatType.APT.value: 0.8,
            ThreatType.DATA_EXFILTRATION.value: 0.8,
            ThreatType.PRIVILEGE_ESCALATION.value: 0.7,
            ThreatType.SQL_INJECTION.value: 0.7,
            ThreatType.XSS.value: 0.6,
            ThreatType.BRUTE_FORCE.value: 0.5,
            ThreatType.DDoS.value: 0.5
        }
        
        severity_score += threat_type_scores.get(threat_type, 0.3)
        
        # 지표 수에 따른 가중치
        severity_score += min(len(indicators) * 0.1, 0.3)
        
        # 영향받는 자산 수에 따른 가중치
        severity_score += min(len(affected_assets) * 0.05, 0.2)
        
        # 위협 인텔리전스 데이터 확인
        for indicator in indicators:
            if indicator in self.threat_intelligence_db:
                ti = self.threat_intelligence_db[indicator]
                severity_score += ti.confidence * 0.2
        
        # 정규화
        severity_score = min(severity_score, 1.0)
        
        # 심각도 레벨 결정
        if severity_score >= 0.8:
            level = ThreatLevel.CRITICAL
        elif severity_score >= 0.6:
            level = ThreatLevel.HIGH
        elif severity_score >= 0.4:
            level = ThreatLevel.MEDIUM
        else:
            level = ThreatLevel.LOW
        
        return level, severity_score
    
    async def generate_mitigation_strategies(self, threat: Dict[str, Any]) -> List[MitigationStrategy]:
        """위협 완화 전략 생성"""
        threat_type = threat.get("type", "unknown")
        severity_level, severity_score = await self.assess_threat_severity(threat)
        
        strategies = []
        
        # 위협 유형별 맞춤 전략
        if threat_type == ThreatType.SQL_INJECTION.value:
            strategies.extend(self._generate_sql_injection_mitigations(threat, severity_level))
        elif threat_type == ThreatType.XSS.value:
            strategies.extend(self._generate_xss_mitigations(threat, severity_level))
        elif threat_type == ThreatType.BRUTE_FORCE.value:
            strategies.extend(self._generate_brute_force_mitigations(threat, severity_level))
        elif threat_type == ThreatType.DDoS.value:
            strategies.extend(self._generate_ddos_mitigations(threat, severity_level))
        elif threat_type == ThreatType.MALWARE.value:
            strategies.extend(self._generate_malware_mitigations(threat, severity_level))
        elif threat_type == ThreatType.DATA_EXFILTRATION.value:
            strategies.extend(self._generate_data_exfiltration_mitigations(threat, severity_level))
        
        # 일반적인 보안 강화 전략
        strategies.extend(self._generate_general_security_strategies(threat, severity_level))
        
        # 효과성에 따른 정렬
        strategies.sort(key=lambda x: (x.priority.value, -x.effectiveness_score))
        
        return strategies[:10]  # 상위 10개 전략만 반환
    
    def _generate_sql_injection_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """SQL 인젝션 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Parameterized Queries",
                description="Replace dynamic SQL with parameterized queries or prepared statements",
                priority=ThreatLevel.CRITICAL,
                estimated_effort=8,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Identify all SQL queries in the application",
                    "Replace string concatenation with parameterized queries",
                    "Use ORM frameworks where possible",
                    "Test all database interactions"
                ],
                prerequisites=["Access to source code", "Development environment"],
                risks=["Potential application downtime during deployment"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Deploy Web Application Firewall (WAF)",
                description="Implement WAF rules to filter SQL injection attempts",
                priority=ThreatLevel.HIGH,
                estimated_effort=4,
                effectiveness_score=0.7,
                implementation_steps=[
                    "Configure WAF with SQL injection detection rules",
                    "Set up monitoring and alerting",
                    "Fine-tune rules to reduce false positives",
                    "Regular rule updates"
                ],
                prerequisites=["WAF solution", "Network access"],
                risks=["Potential blocking of legitimate traffic"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Input Validation and Sanitization",
                description="Implement strict input validation and sanitization",
                priority=ThreatLevel.HIGH,
                estimated_effort=6,
                effectiveness_score=0.8,
                implementation_steps=[
                    "Define input validation rules",
                    "Implement server-side validation",
                    "Add input sanitization functions",
                    "Test with various attack payloads"
                ],
                prerequisites=["Development team", "Testing framework"],
                risks=["Over-filtering may break legitimate functionality"],
                automation_possible=True
            )
        ]
        return strategies
    
    def _generate_xss_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """XSS 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Content Security Policy (CSP)",
                description="Deploy strict CSP headers to prevent XSS execution",
                priority=ThreatLevel.HIGH,
                estimated_effort=3,
                effectiveness_score=0.8,
                implementation_steps=[
                    "Define CSP policy",
                    "Implement CSP headers",
                    "Test with browser developer tools",
                    "Monitor CSP violations"
                ],
                prerequisites=["Web server configuration access"],
                risks=["May break existing functionality"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Output Encoding and Escaping",
                description="Implement proper output encoding for all user inputs",
                priority=ThreatLevel.HIGH,
                estimated_effort=5,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Identify all output points",
                    "Implement context-aware encoding",
                    "Use templating engines with auto-escaping",
                    "Validate encoding effectiveness"
                ],
                prerequisites=["Source code access", "Development environment"],
                risks=["Potential display issues if over-encoded"],
                automation_possible=True
            )
        ]
        return strategies
    
    def _generate_brute_force_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """무차별 대입 공격 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Rate Limiting",
                description="Deploy rate limiting to prevent rapid login attempts",
                priority=ThreatLevel.HIGH,
                estimated_effort=2,
                effectiveness_score=0.8,
                implementation_steps=[
                    "Configure rate limiting rules",
                    "Set appropriate thresholds",
                    "Implement progressive delays",
                    "Monitor effectiveness"
                ],
                prerequisites=["Load balancer or web server access"],
                risks=["May impact legitimate users"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Enable Multi-Factor Authentication",
                description="Implement MFA to add additional security layer",
                priority=ThreatLevel.HIGH,
                estimated_effort=8,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Choose MFA solution",
                    "Integrate with authentication system",
                    "User enrollment and training",
                    "Monitor adoption rates"
                ],
                prerequisites=["MFA service", "User management system"],
                risks=["User resistance", "Recovery complexity"],
                automation_possible=False
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Account Lockout Policy",
                description="Implement account lockout after failed attempts",
                priority=ThreatLevel.MEDIUM,
                estimated_effort=2,
                effectiveness_score=0.6,
                implementation_steps=[
                    "Define lockout thresholds",
                    "Implement lockout mechanism",
                    "Create unlock procedures",
                    "Monitor lockout events"
                ],
                prerequisites=["Authentication system access"],
                risks=["Potential DoS against legitimate users"],
                automation_possible=True
            )
        ]
        return strategies
    
    def _generate_ddos_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """DDoS 공격 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Deploy DDoS Protection Service",
                description="Implement cloud-based DDoS protection",
                priority=ThreatLevel.CRITICAL,
                estimated_effort=4,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Choose DDoS protection service",
                    "Configure traffic routing",
                    "Set up monitoring dashboards",
                    "Test failover procedures"
                ],
                prerequisites=["Cloud DDoS service", "DNS management"],
                risks=["Additional latency", "Service dependency"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Traffic Shaping",
                description="Configure traffic shaping and QoS policies",
                priority=ThreatLevel.HIGH,
                estimated_effort=3,
                effectiveness_score=0.7,
                implementation_steps=[
                    "Analyze traffic patterns",
                    "Configure traffic shaping rules",
                    "Implement QoS policies",
                    "Monitor traffic flows"
                ],
                prerequisites=["Network equipment access", "Traffic analysis tools"],
                risks=["May slow legitimate traffic"],
                automation_possible=True
            )
        ]
        return strategies
    
    def _generate_malware_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """맬웨어 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Deploy Endpoint Detection and Response (EDR)",
                description="Implement EDR solution for malware detection",
                priority=ThreatLevel.CRITICAL,
                estimated_effort=6,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Choose EDR solution",
                    "Deploy agents on endpoints",
                    "Configure detection rules",
                    "Train security team"
                ],
                prerequisites=["EDR licensing", "Endpoint access"],
                risks=["Performance impact", "False positives"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Application Whitelisting",
                description="Deploy application whitelisting to prevent unauthorized execution",
                priority=ThreatLevel.HIGH,
                estimated_effort=8,
                effectiveness_score=0.8,
                implementation_steps=[
                    "Catalog legitimate applications",
                    "Configure whitelisting policies",
                    "Test application compatibility",
                    "Manage whitelist updates"
                ],
                prerequisites=["Endpoint management system"],
                risks=["May block legitimate software"],
                automation_possible=True
            )
        ]
        return strategies
    
    def _generate_data_exfiltration_mitigations(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """데이터 유출 완화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Implement Data Loss Prevention (DLP)",
                description="Deploy DLP solution to monitor and prevent data exfiltration",
                priority=ThreatLevel.CRITICAL,
                estimated_effort=10,
                effectiveness_score=0.8,
                implementation_steps=[
                    "Choose DLP solution",
                    "Define data classification policies",
                    "Configure monitoring rules",
                    "Train users on policies"
                ],
                prerequisites=["DLP licensing", "Data classification"],
                risks=["User productivity impact"],
                automation_possible=True
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Network Segmentation",
                description="Implement network segmentation to limit data access",
                priority=ThreatLevel.HIGH,
                estimated_effort=12,
                effectiveness_score=0.9,
                implementation_steps=[
                    "Design network segments",
                    "Configure firewalls and VLANs",
                    "Implement access controls",
                    "Test connectivity"
                ],
                prerequisites=["Network infrastructure", "Security team"],
                risks=["Complexity increase", "Connectivity issues"],
                automation_possible=False
            )
        ]
        return strategies
    
    def _generate_general_security_strategies(self, threat: Dict[str, Any], severity: ThreatLevel) -> List[MitigationStrategy]:
        """일반적인 보안 강화 전략"""
        strategies = [
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Security Awareness Training",
                description="Conduct regular security awareness training for all users",
                priority=ThreatLevel.MEDIUM,
                estimated_effort=16,
                effectiveness_score=0.6,
                implementation_steps=[
                    "Develop training materials",
                    "Schedule training sessions",
                    "Conduct phishing simulations",
                    "Track completion rates"
                ],
                prerequisites=["Training budget", "HR coordination"],
                risks=["Low engagement", "Time investment"],
                automation_possible=False
            ),
            MitigationStrategy(
                id=str(uuid.uuid4()),
                name="Regular Security Assessments",
                description="Conduct periodic security assessments and penetration testing",
                priority=ThreatLevel.MEDIUM,
                estimated_effort=20,
                effectiveness_score=0.7,
                implementation_steps=[
                    "Plan assessment scope",
                    "Engage security professionals",
                    "Execute testing",
                    "Remediate findings"
                ],
                prerequisites=["Security budget", "Management approval"],
                risks=["Business disruption during testing"],
                automation_possible=False
            )
        ]
        return strategies
    
    async def scan_for_vulnerabilities(self, target: str, scan_type: str = "comprehensive") -> List[Vulnerability]:
        """취약점 스캔"""
        vulnerabilities = []
        
        try:
            if scan_type == "network":
                vulnerabilities.extend(await self._scan_network_vulnerabilities(target))
            elif scan_type == "web":
                vulnerabilities.extend(await self._scan_web_vulnerabilities(target))
            elif scan_type == "comprehensive":
                vulnerabilities.extend(await self._scan_network_vulnerabilities(target))
                vulnerabilities.extend(await self._scan_web_vulnerabilities(target))
                vulnerabilities.extend(await self._scan_configuration_vulnerabilities(target))
        
        except Exception as e:
            self.logger.error(f"Error during vulnerability scan: {e}")
        
        return vulnerabilities
    
    async def _scan_network_vulnerabilities(self, target: str) -> List[Vulnerability]:
        """네트워크 취약점 스캔"""
        vulnerabilities = []
        
        # 포트 스캔
        open_ports = await self._scan_ports(target)
        
        for port in open_ports:
            # 알려진 취약한 서비스 확인
            service_vulns = self._check_service_vulnerabilities(port)
            vulnerabilities.extend(service_vulns)
        
        return vulnerabilities
    
    async def _scan_web_vulnerabilities(self, target: str) -> List[Vulnerability]:
        """웹 애플리케이션 취약점 스캔"""
        vulnerabilities = []
        
        # 기본 웹 취약점 확인
        web_vulns = [
            await self._check_sql_injection_vulnerability(target),
            await self._check_xss_vulnerability(target),
            await self._check_directory_traversal_vulnerability(target),
            await self._check_csrf_vulnerability(target)
        ]
        
        # None이 아닌 취약점만 추가
        vulnerabilities.extend([v for v in web_vulns if v is not None])
        
        return vulnerabilities
    
    async def _scan_configuration_vulnerabilities(self, target: str) -> List[Vulnerability]:
        """설정 취약점 스캔"""
        vulnerabilities = []
        
        # SSL/TLS 설정 확인
        ssl_vulns = await self._check_ssl_configuration(target)
        vulnerabilities.extend(ssl_vulns)
        
        # HTTP 헤더 보안 확인
        header_vulns = await self._check_security_headers(target)
        vulnerabilities.extend(header_vulns)
        
        return vulnerabilities
    
    async def _scan_ports(self, target: str) -> List[int]:
        """포트 스캔"""
        open_ports = []
        common_ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 1433, 3306, 3389, 5432]
        
        for port in common_ports:
            try:
                # 타임아웃을 짧게 설정하여 빠른 스캔
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex((target, port))
                if result == 0:
                    open_ports.append(port)
                sock.close()
            except Exception:
                continue
        
        return open_ports
    
    def _check_service_vulnerabilities(self, port: int) -> List[Vulnerability]:
        """서비스별 알려진 취약점 확인"""
        vulnerabilities = []
        
        # 포트별 알려진 취약점 데이터베이스
        port_vulnerabilities = {
            21: [  # FTP
                Vulnerability(
                    id="FTP-001",
                    cve_id="CVE-2023-1234",
                    title="Anonymous FTP Access",
                    description="FTP server allows anonymous access",
                    severity=ThreatLevel.MEDIUM,
                    cvss_score=5.0,
                    affected_components=["FTP Server"],
                    exploit_available=True,
                    patch_available=True,
                    discovery_date=datetime.now()
                )
            ],
            22: [  # SSH
                Vulnerability(
                    id="SSH-001",
                    cve_id=None,
                    title="Weak SSH Configuration",
                    description="SSH server may have weak configuration",
                    severity=ThreatLevel.LOW,
                    cvss_score=3.0,
                    affected_components=["SSH Server"],
                    exploit_available=False,
                    patch_available=True,
                    discovery_date=datetime.now()
                )
            ]
        }
        
        return port_vulnerabilities.get(port, [])
    
    async def _check_sql_injection_vulnerability(self, target: str) -> Optional[Vulnerability]:
        """SQL 인젝션 취약점 확인"""
        test_payloads = ["'", "1' OR '1'='1", "'; DROP TABLE users--"]
        
        for payload in test_payloads:
            try:
                # 실제 구현에서는 안전한 테스트만 수행
                # 여기서는 시뮬레이션
                if "'" in payload:  # 단순 시뮬레이션
                    return Vulnerability(
                        id="SQL-001",
                        cve_id=None,
                        title="SQL Injection Vulnerability",
                        description="Application may be vulnerable to SQL injection",
                        severity=ThreatLevel.HIGH,
                        cvss_score=8.0,
                        affected_components=["Web Application"],
                        exploit_available=True,
                        patch_available=True,
                        discovery_date=datetime.now()
                    )
            except Exception:
                continue
        
        return None
    
    async def _check_xss_vulnerability(self, target: str) -> Optional[Vulnerability]:
        """XSS 취약점 확인"""
        test_payloads = ["<script>alert('XSS')</script>", "<img src=x onerror=alert('XSS')>"]
        
        # 시뮬레이션된 XSS 취약점 탐지
        return Vulnerability(
            id="XSS-001",
            cve_id=None,
            title="Cross-Site Scripting (XSS) Vulnerability",
            description="Application may be vulnerable to XSS attacks",
            severity=ThreatLevel.MEDIUM,
            cvss_score=6.0,
            affected_components=["Web Application"],
            exploit_available=True,
            patch_available=True,
            discovery_date=datetime.now()
        )
    
    async def _check_directory_traversal_vulnerability(self, target: str) -> Optional[Vulnerability]:
        """디렉토리 순회 취약점 확인"""
        test_payloads = ["../../../etc/passwd", "..\\..\\..\\windows\\system32\\config\\sam"]
        
        # 시뮬레이션
        return None
    
    async def _check_csrf_vulnerability(self, target: str) -> Optional[Vulnerability]:
        """CSRF 취약점 확인"""
        # CSRF 토큰 존재 여부 확인 시뮬레이션
        return Vulnerability(
            id="CSRF-001",
            cve_id=None,
            title="Cross-Site Request Forgery (CSRF) Vulnerability",
            description="Application lacks CSRF protection",
            severity=ThreatLevel.MEDIUM,
            cvss_score=5.0,
            affected_components=["Web Application"],
            exploit_available=True,
            patch_available=True,
            discovery_date=datetime.now()
        )
    
    async def _check_ssl_configuration(self, target: str) -> List[Vulnerability]:
        """SSL/TLS 설정 확인"""
        vulnerabilities = []
        
        try:
            # SSL 인증서 정보 확인
            context = ssl.create_default_context()
            with socket.create_connection((target, 443), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=target) as ssock:
                    cert = ssock.getpeercert()
                    
                    # 인증서 만료 확인
                    not_after = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    if not_after < datetime.now() + timedelta(days=30):
                        vulnerabilities.append(Vulnerability(
                            id="SSL-001",
                            cve_id=None,
                            title="SSL Certificate Expiring Soon",
                            description=f"SSL certificate expires on {not_after}",
                            severity=ThreatLevel.MEDIUM,
                            cvss_score=4.0,
                            affected_components=["SSL Certificate"],
                            exploit_available=False,
                            patch_available=True,
                            discovery_date=datetime.now()
                        ))
        
        except Exception as e:
            self.logger.debug(f"SSL check failed for {target}: {e}")
        
        return vulnerabilities
    
    async def _check_security_headers(self, target: str) -> List[Vulnerability]:
        """보안 헤더 확인"""
        vulnerabilities = []
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://{target}", timeout=5) as response:
                    headers = response.headers
                    
                    # 중요한 보안 헤더 확인
                    security_headers = [
                        'Content-Security-Policy',
                        'X-Frame-Options',
                        'X-Content-Type-Options',
                        'Strict-Transport-Security',
                        'X-XSS-Protection'
                    ]
                    
                    missing_headers = [h for h in security_headers if h not in headers]
                    
                    if missing_headers:
                        vulnerabilities.append(Vulnerability(
                            id="HDR-001",
                            cve_id=None,
                            title="Missing Security Headers",
                            description=f"Missing headers: {', '.join(missing_headers)}",
                            severity=ThreatLevel.LOW,
                            cvss_score=3.0,
                            affected_components=["Web Server"],
                            exploit_available=False,
                            patch_available=True,
                            discovery_date=datetime.now()
                        ))
        
        except Exception as e:
            self.logger.debug(f"Header check failed for {target}: {e}")
        
        return vulnerabilities
    
    def update_threat_intelligence(self, intelligence: ThreatIntelligence):
        """위협 인텔리전스 업데이트"""
        with self._lock:
            existing = self.threat_intelligence_db.get(intelligence.value)
            
            if existing:
                # 기존 정보 업데이트
                existing.last_seen = intelligence.last_seen
                existing.confidence = max(existing.confidence, intelligence.confidence)
                existing.threat_types = list(set(existing.threat_types + intelligence.threat_types))
                existing.tags = list(set(existing.tags + intelligence.tags))
            else:
                # 새로운 정보 추가
                self.threat_intelligence_db[intelligence.value] = intelligence
    
    def get_security_metrics(self) -> SecurityMetrics:
        """보안 메트릭 반환"""
        with self._lock:
            return self.metrics
    
    def update_metrics(self, **kwargs):
        """메트릭 업데이트"""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self.metrics, key):
                    setattr(self.metrics, key, value)
    
    async def export_threat_report(self, format_type: str = "json") -> str:
        """위협 분석 보고서 내보내기"""
        report_data = {
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "total_events": self.metrics.total_events,
                "critical_threats": self.metrics.critical_threats,
                "high_threats": self.metrics.high_threats,
                "medium_threats": self.metrics.medium_threats,
                "low_threats": self.metrics.low_threats,
                "security_score": self.metrics.security_score
            },
            "threat_intelligence": {
                "total_indicators": len(self.threat_intelligence_db),
                "high_confidence_indicators": len([
                    ti for ti in self.threat_intelligence_db.values() 
                    if ti.confidence > 0.8
                ])
            },
            "vulnerabilities": {
                "total": len(self.known_vulnerabilities),
                "critical": len([v for v in self.known_vulnerabilities.values() 
                               if v.severity == ThreatLevel.CRITICAL]),
                "high": len([v for v in self.known_vulnerabilities.values() 
                           if v.severity == ThreatLevel.HIGH])
            },
            "recent_events": list(self.event_history)[-100:]  # 최근 100개 이벤트
        }
        
        if format_type == "json":
            return json.dumps(report_data, indent=2, default=str)
        elif format_type == "yaml":
            return yaml.dump(report_data, default_flow_style=False)
        else:
            raise ValueError(f"Unsupported format: {format_type}")
    
    async def start_real_time_monitoring(self, callback: Callable[[SecurityAnomaly], None]):
        """실시간 모니터링 시작"""
        self.logger.info("Starting real-time security monitoring...")
        
        while True:
            try:
                # 실시간 로그 수집 시뮬레이션
                recent_logs = await self._collect_recent_logs()
                
                if recent_logs:
                    # 이상 징후 탐지
                    anomalies = await self.detect_security_anomalies(recent_logs)
                    
                    # 콜백 함수 호출
                    for anomaly in anomalies:
                        if anomaly.risk_score > 0.5:  # 임계값 이상만 알림
                            callback(anomaly)
                
                # 1분 간격으로 모니터링
                await asyncio.sleep(60)
                
            except Exception as e:
                self.logger.error(f"Error in real-time monitoring: {e}")
                await asyncio.sleep(10)  # 에러 시 짧은 대기
    
    async def _collect_recent_logs(self) -> List[Dict[str, Any]]:
        """최근 로그 수집 (시뮬레이션)"""
        # 실제 구현에서는 다양한 로그 소스에서 수집
        sample_logs = [
            {
                "timestamp": datetime.now().isoformat(),
                "source_ip": "192.168.1.100",
                "target_ip": "10.0.0.1",
                "message": "Failed login attempt",
                "status_code": 401,
                "user_agent": "Mozilla/5.0"
            },
            {
                "timestamp": datetime.now().isoformat(),
                "source_ip": "203.0.113.1",
                "target_ip": "10.0.0.1",
                "message": "SQL injection attempt detected",
                "payload": "' OR 1=1--",
                "status_code": 400
            }
        ]
        
        return sample_logs


class ThreatIntelligenceManager:
    """위협 인텔리전스 관리자"""
    
    def __init__(self):
        self.feeds = {}
        self.indicators = {}
        self.last_update = {}
    
    async def update_from_external_feeds(self, feed_urls: List[str]):
        """외부 피드에서 위협 인텔리전스 업데이트"""
        for url in feed_urls:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=30) as response:
                        if response.status == 200:
                            data = await response.json()
                            await self._process_feed_data(url, data)
                            self.last_update[url] = datetime.now()
            except Exception as e:
                logger.error(f"Failed to update from feed {url}: {e}")
    
    async def _process_feed_data(self, source: str, data: Dict[str, Any]):
        """피드 데이터 처리"""
        # STIX/TAXII 형식 또는 커스텀 형식 처리
        indicators = data.get("indicators", [])
        
        for indicator_data in indicators:
            indicator = ThreatIntelligence(
                ioc_type=indicator_data.get("type", "unknown"),
                value=indicator_data.get("value", ""),
                threat_types=[ThreatType(t) for t in indicator_data.get("threat_types", [])],
                confidence=indicator_data.get("confidence", 0.5),
                first_seen=datetime.now(),
                last_seen=datetime.now(),
                source=source,
                tags=indicator_data.get("tags", [])
            )
            
            self.indicators[indicator.value] = indicator


class SecurityPlaybookExecutor:
    """보안 플레이북 실행기"""
    
    def __init__(self, analyzer: SecurityThreatAnalyzer):
        self.analyzer = analyzer
        self.playbooks = self._load_playbooks()
    
    def _load_playbooks(self) -> Dict[str, Dict[str, Any]]:
        """보안 플레이북 로드"""
        return {
            "incident_response": {
                "name": "Incident Response Playbook",
                "triggers": [ThreatLevel.CRITICAL, ThreatLevel.HIGH],
                "steps": [
                    {"action": "isolate_affected_systems", "automated": True},
                    {"action": "collect_forensic_evidence", "automated": False},
                    {"action": "notify_stakeholders", "automated": True},
                    {"action": "begin_containment", "automated": False}
                ]
            },
            "malware_response": {
                "name": "Malware Response Playbook",
                "triggers": [ThreatType.MALWARE, ThreatType.RANSOMWARE],
                "steps": [
                    {"action": "disconnect_network", "automated": True},
                    {"action": "run_antivirus_scan", "automated": True},
                    {"action": "restore_from_backup", "automated": False},
                    {"action": "patch_vulnerabilities", "automated": False}
                ]
            },
            "data_breach_response": {
                "name": "Data Breach Response Playbook",
                "triggers": [ThreatType.DATA_EXFILTRATION],
                "steps": [
                    {"action": "assess_data_exposure", "automated": False},
                    {"action": "secure_affected_systems", "automated": True},
                    {"action": "notify_authorities", "automated": False},
                    {"action": "communicate_with_customers", "automated": False}
                ]
            }
        }
    
    async def execute_playbook(self, threat_type: ThreatType, severity: ThreatLevel) -> Dict[str, Any]:
        """플레이북 실행"""
        applicable_playbooks = []
        
        for playbook_id, playbook in self.playbooks.items():
            triggers = playbook.get("triggers", [])
            if threat_type in triggers or severity in triggers:
                applicable_playbooks.append((playbook_id, playbook))
        
        if not applicable_playbooks:
            return {"status": "no_playbook_found", "threat_type": threat_type.value}
        
        # 첫 번째 적용 가능한 플레이북 실행
        playbook_id, playbook = applicable_playbooks[0]
        results = []
        
        for step in playbook["steps"]:
            action = step["action"]
            automated = step["automated"]
            
            if automated:
                result = await self._execute_automated_action(action)
            else:
                result = await self._create_manual_task(action)
            
            results.append({
                "action": action,
                "automated": automated,
                "result": result
            })
        
        return {
            "status": "executed",
            "playbook": playbook["name"],
            "results": results
        }
    
    async def _execute_automated_action(self, action: str) -> Dict[str, Any]:
        """자동화된 액션 실행"""
        action_handlers = {
            "isolate_affected_systems": self._isolate_systems,
            "disconnect_network": self._disconnect_network,
            "run_antivirus_scan": self._run_antivirus_scan,
            "secure_affected_systems": self._secure_systems,
            "notify_stakeholders": self._send_notifications
        }
        
        handler = action_handlers.get(action)
        if handler:
            return await handler()
        else:
            return {"status": "action_not_implemented", "action": action}
    
    async def _create_manual_task(self, action: str) -> Dict[str, Any]:
        """수동 작업 태스크 생성"""
        return {
            "status": "task_created",
            "action": action,
            "assigned_to": "security_team",
            "created_at": datetime.now().isoformat(),
            "priority": "high"
        }
    
    async def _isolate_systems(self) -> Dict[str, Any]:
        """시스템 격리"""
        # 실제 구현에서는 네트워크 스위치나 방화벽 API 호출
        return {
            "status": "success",
            "message": "Affected systems isolated from network",
            "isolated_count": 3
        }
    
    async def _disconnect_network(self) -> Dict[str, Any]:
        """네트워크 연결 차단"""
        return {
            "status": "success",
            "message": "Network connections disabled",
            "timestamp": datetime.now().isoformat()
        }
    
    async def _run_antivirus_scan(self) -> Dict[str, Any]:
        """안티바이러스 스캔 실행"""
        return {
            "status": "initiated",
            "message": "Full system antivirus scan started",
            "estimated_duration": "2 hours"
        }
    
    async def _secure_systems(self) -> Dict[str, Any]:
        """시스템 보안 강화"""
        return {
            "status": "success",
            "message": "Security hardening applied",
            "changes_applied": ["firewall_rules", "access_controls", "monitoring"]
        }
    
    async def _send_notifications(self) -> Dict[str, Any]:
        """이해관계자 알림"""
        return {
            "status": "sent",
            "message": "Notifications sent to security team and management",
            "recipients": ["security@company.com", "ciso@company.com"]
        }


class AdaptiveSecurityEngine:
    """적응형 보안 엔진"""
    
    def __init__(self, analyzer: SecurityThreatAnalyzer):
        self.analyzer = analyzer
        self.learning_history = []
        self.adaptation_rules = {}
        self.performance_metrics = {}
    
    async def learn_from_incidents(self, incidents: List[Dict[str, Any]]):
        """인시던트에서 학습"""
        for incident in incidents:
            # 인시던트 패턴 분석
            patterns = self._extract_incident_patterns(incident)
            
            # 대응 효과성 평가
            effectiveness = self._evaluate_response_effectiveness(incident)
            
            # 학습 데이터로 저장
            learning_entry = {
                "incident_id": incident.get("id"),
                "patterns": patterns,
                "response_actions": incident.get("response_actions", []),
                "effectiveness": effectiveness,
                "timestamp": datetime.now()
            }
            
            self.learning_history.append(learning_entry)
            
            # 적응 규칙 업데이트
            await self._update_adaptation_rules(learning_entry)
    
    def _extract_incident_patterns(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        """인시던트 패턴 추출"""
        return {
            "threat_type": incident.get("threat_type"),
            "attack_vectors": incident.get("attack_vectors", []),
            "affected_assets": incident.get("affected_assets", []),
            "time_of_day": incident.get("detection_time", datetime.now()).hour,
            "duration": incident.get("duration_minutes", 0),
            "severity": incident.get("severity")
        }
    
    def _evaluate_response_effectiveness(self, incident: Dict[str, Any]) -> float:
        """대응 효과성 평가"""
        factors = {
            "detection_time": incident.get("detection_time_minutes", 60),
            "response_time": incident.get("response_time_minutes", 120),
            "containment_success": incident.get("contained", False),
            "false_positive": incident.get("false_positive", False),
            "escalation_needed": incident.get("escalated", False)
        }
        
        score = 1.0
        
        # 탐지 시간 (짧을수록 좋음)
        if factors["detection_time"] > 30:
            score -= 0.2
        
        # 대응 시간 (짧을수록 좋음)
        if factors["response_time"] > 60:
            score -= 0.2
        
        # 봉쇄 성공
        if not factors["containment_success"]:
            score -= 0.3
        
        # 거짓 양성
        if factors["false_positive"]:
            score -= 0.4
        
        # 에스컬레이션 필요
        if factors["escalation_needed"]:
            score -= 0.1
        
        return max(score, 0.0)
    
    async def _update_adaptation_rules(self, learning_entry: Dict[str, Any]):
        """적응 규칙 업데이트"""
        patterns = learning_entry["patterns"]
        effectiveness = learning_entry["effectiveness"]
        
        # 패턴별 성공률 추적
        pattern_key = f"{patterns['threat_type']}_{patterns['time_of_day']}"
        
        if pattern_key not in self.adaptation_rules:
            self.adaptation_rules[pattern_key] = {
                "success_rate": effectiveness,
                "count": 1,
                "best_actions": learning_entry["response_actions"]
            }
        else:
            rule = self.adaptation_rules[pattern_key]
            # 이동 평균으로 성공률 업데이트
            rule["success_rate"] = (rule["success_rate"] * rule["count"] + effectiveness) / (rule["count"] + 1)
            rule["count"] += 1
            
            # 더 효과적인 액션 발견 시 업데이트
            if effectiveness > rule["success_rate"]:
                rule["best_actions"] = learning_entry["response_actions"]
    
    async def recommend_adaptive_response(self, threat: Dict[str, Any]) -> List[Dict[str, Any]]:
        """적응형 대응 권장사항"""
        threat_type = threat.get("type")
        current_hour = datetime.now().hour
        
        pattern_key = f"{threat_type}_{current_hour}"
        
        recommendations = []
        
        # 학습된 패턴 기반 권장사항
        if pattern_key in self.adaptation_rules:
            rule = self.adaptation_rules[pattern_key]
            if rule["success_rate"] > 0.7:  # 70% 이상 성공률
                recommendations.append({
                    "type": "learned_response",
                    "confidence": rule["success_rate"],
                    "actions": rule["best_actions"],
                    "reason": f"Based on {rule['count']} similar incidents"
                })
        
        # 시간대별 권장사항
        if current_hour in [22, 23, 0, 1, 2, 3, 4, 5, 6]:  # 야간/새벽
            recommendations.append({
                "type": "time_based",
                "confidence": 0.8,
                "actions": ["escalate_to_oncall", "increase_monitoring"],
                "reason": "Night time detected - limited staff availability"
            })
        
        # 위협 유형별 기본 권장사항
        threat_specific_actions = {
            ThreatType.RANSOMWARE.value: ["isolate_immediately", "check_backups", "notify_legal"],
            ThreatType.DATA_EXFILTRATION.value: ["monitor_data_flows", "check_dlp_logs", "notify_privacy_team"],
            ThreatType.APT.value: ["preserve_evidence", "deep_forensics", "threat_hunting"]
        }
        
        if threat_type in threat_specific_actions:
            recommendations.append({
                "type": "threat_specific",
                "confidence": 0.9,
                "actions": threat_specific_actions[threat_type],
                "reason": f"Standard response for {threat_type}"
            })
        
        return recommendations


# 통합 보안 오케스트레이터
class SecurityOrchestrator:
    """보안 시스템 통합 오케스트레이터"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.analyzer = SecurityThreatAnalyzer(config)
        self.threat_intel_manager = ThreatIntelligenceManager()
        self.playbook_executor = SecurityPlaybookExecutor(self.analyzer)
        self.adaptive_engine = AdaptiveSecurityEngine(self.analyzer)
        
        self.active_threats = {}
        self.incident_queue = deque()
        self.response_history = []
    
    async def process_security_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """보안 이벤트 통합 처리"""
        try:
            # 1. 이벤트 분석
            security_event = self.analyzer._parse_log_to_event(event)
            
            # 2. 위협 탐지
            anomalies = await self.analyzer.detect_security_anomalies([event])
            
            # 3. 심각도 평가
            if anomalies:
                threat_level, risk_score = await self.analyzer.assess_threat_severity({
                    "type": anomalies[0].potential_threats[0].value if anomalies[0].potential_threats else "unknown",
                    "indicators": [security_event.source_ip] if security_event.source_ip else [],
                    "affected_assets": anomalies[0].affected_resources
                })
                
                # 4. 적응형 대응 권장사항
                adaptive_recommendations = await self.adaptive_engine.recommend_adaptive_response({
                    "type": anomalies[0].potential_threats[0].value if anomalies[0].potential_threats else "unknown"
                })
                
                # 5. 플레이북 실행 (고위험인 경우)
                playbook_result = None
                if threat_level in [ThreatLevel.CRITICAL, ThreatLevel.HIGH]:
                    if anomalies[0].potential_threats:
                        playbook_result = await self.playbook_executor.execute_playbook(
                            anomalies[0].potential_threats[0], threat_level
                        )
                
                # 6. 인시던트 큐에 추가
                incident = {
                    "id": str(uuid.uuid4()),
                    "event": security_event,
                    "anomalies": anomalies,
                    "threat_level": threat_level,
                    "risk_score": risk_score,
                    "adaptive_recommendations": adaptive_recommendations,
                    "playbook_result": playbook_result,
                    "timestamp": datetime.now()
                }
                
                self.incident_queue.append(incident)
                
                return {
                    "status": "threat_detected",
                    "incident_id": incident["id"],
                    "threat_level": threat_level.value,
                    "risk_score": risk_score,
                    "actions_taken": playbook_result.get("results", []) if playbook_result else [],
                    "recommendations": adaptive_recommendations
                }
            else:
                return {
                    "status": "normal",
                    "message": "No threats detected"
                }
        
        except Exception as e:
            logger.error(f"Error processing security event: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    async def start_continuous_monitoring(self):
        """연속 모니터링 시작"""
        logger.info("Starting continuous security monitoring...")
        
        # 실시간 모니터링 시작
        monitoring_task = asyncio.create_task(
            self.analyzer.start_real_time_monitoring(self._handle_anomaly_alert)
        )
        
        # 위협 인텔리전스 업데이트 (매 시간)
        intel_task = asyncio.create_task(self._periodic_threat_intel_update())
        
        # 적응형 학습 (매일)
        learning_task = asyncio.create_task(self._periodic_adaptive_learning())
        
        await asyncio.gather(monitoring_task, intel_task, learning_task)
    
    def _handle_anomaly_alert(self, anomaly: SecurityAnomaly):
        """이상 징후 알림 처리"""
        logger.warning(f"Security anomaly detected: {anomaly.description} (Risk: {anomaly.risk_score})")
        
        # 고위험 이상 징후에 대한 즉시 대응
        if anomaly.risk_score > 0.8:
            asyncio.create_task(self._emergency_response(anomaly))
    
    async def _emergency_response(self, anomaly: SecurityAnomaly):
        """긴급 대응"""
        logger.critical(f"Initiating emergency response for: {anomaly.description}")
        
        # 자동 격리 또는 차단 등의 즉시 대응 조치
        if anomaly.potential_threats:
            threat_type = anomaly.potential_threats[0]
            await self.playbook_executor.execute_playbook(threat_type, ThreatLevel.CRITICAL)
    
    async def _periodic_threat_intel_update(self):
        """주기적 위협 인텔리전스 업데이트"""
        while True:
            try:
                # 외부 위협 인텔리전스 피드 업데이트
                feed_urls = self.config.get("threat_intel_feeds", [])
                if feed_urls:
                    await self.threat_intel_manager.update_from_external_feeds(feed_urls)
                
                # 1시간 대기
                await asyncio.sleep(3600)
            except Exception as e:
                logger.error(f"Error updating threat intelligence: {e}")
                await asyncio.sleep(300)  # 에러 시 5분 후 재시도
    
    async def _periodic_adaptive_learning(self):
        """주기적 적응형 학습"""
        while True:
            try:
                # 최근 24시간의 인시던트에서 학습
                recent_incidents = [
                    incident for incident in self.response_history
                    if (datetime.now() - incident["timestamp"]).days < 1
                ]
                
                if recent_incidents:
                    await self.adaptive_engine.learn_from_incidents(recent_incidents)
                
                # 24시간 대기
                await asyncio.sleep(86400)
            except Exception as e:
                logger.error(f"Error in adaptive learning: {e}")
                await asyncio.sleep(3600)  # 에러 시 1시간 후 재시도


# 편의 함수들
async def quick_security_scan(target: str) -> Dict[str, Any]:
    """빠른 보안 스캔"""
    analyzer = SecurityThreatAnalyzer()
    vulnerabilities = await analyzer.scan_for_vulnerabilities(target, "comprehensive")
    
    return {
        "target": target,
        "scan_time": datetime.now().isoformat(),
        "vulnerabilities_found": len(vulnerabilities),
        "critical_count": len([v for v in vulnerabilities if v.severity == ThreatLevel.CRITICAL]),
        "high_count": len([v for v in vulnerabilities if v.severity == ThreatLevel.HIGH]),
        "vulnerabilities": [
            {
                "id": v.id,
                "title": v.title,
                "severity": v.severity.value,
                "cvss_score": v.cvss_score
            } for v in vulnerabilities
        ]
    }

def create_security_orchestrator(config: Optional[Dict[str, Any]] = None) -> SecurityOrchestrator:
    """보안 오케스트레이터 생성"""
    return SecurityOrchestrator(config)

async def analyze_security_logs(log_files: List[str]) -> Dict[str, Any]:
    """보안 로그 분석"""
    analyzer = SecurityThreatAnalyzer()
    all_logs = []
    
    # 로그 파일들 읽기
    for log_file in log_files:
        try:
            async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                content = await f.read()
                # 간단한 JSON 로그 파싱 (실제로는 더 복잡한 파싱 필요)
                for line in content.strip().split('\n'):
                    if line.strip():
                        try:
                            log_entry = json.loads(line)
                            all_logs.append(log_entry)
                        except json.JSONDecodeError:
                            # JSON이 아닌 로그는 기본 구조로 변환
                            all_logs.append({
                                "message": line,
                                "timestamp": datetime.now().isoformat()
                            })
        except Exception as e:
            logger.error(f"Error reading log file {log_file}: {e}")
    
    # 이상 징후 탐지
    anomalies = await analyzer.detect_security_anomalies(all_logs)
    
    return {
        "logs_processed": len(all_logs),
        "anomalies_detected": len(anomalies),
        "high_risk_anomalies": len([a for a in anomalies if a.risk_score > 0.7]),
        "anomalies": [
            {
                "id": a.id,
                "type": a.anomaly_type,
                "risk_score": a.risk_score,
                "description": a.description,
                "affected_resources": a.affected_resources
            } for a in anomalies
        ]
    }

# 메인 실행 예제
if __name__ == "__main__":
    async def main():
        # 보안 오케스트레이터 생성
        config = {
            "threat_intel_feeds": [
                "https://api.threatintel.example.com/feed",
                "https://feeds.security.example.com/iocs"
            ]
        }
        
        orchestrator = create_security_orchestrator(config)
        
        # 샘플 보안 이벤트 처리
        sample_event = {
            "timestamp": datetime.now().isoformat(),
            "source_ip": "192.168.1.100",
            "target_ip": "10.0.0.1",
            "message": "Multiple failed login attempts detected",
            "status_code": 401,
            "user_agent": "sqlmap/1.0"
        }
        
        result = await orchestrator.process_security_event(sample_event)
        print(f"Security event processing result: {json.dumps(result, indent=2)}")
        
        # 빠른 보안 스캔 실행
        scan_result = await quick_security_scan("example.com")
        print(f"Security scan result: {json.dumps(scan_result, indent=2)}")
    
    # 실행
    asyncio.run(main())