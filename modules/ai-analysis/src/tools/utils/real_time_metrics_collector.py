#!/usr/bin/env python3
"""
Real-Time Metrics Collector
실시간 멀티소스 메트릭 수집 및 분석 시스템

주요 기능:
- 멀티소스 실시간 메트릭 수집 (서버, 애플리케이션, 네트워크, 데이터베이스, 도커 등)
- 이상 징후 실시간 탐지
- 성능 예측 및 트렌드 분석
- 적응형 임계값 설정
- 메트릭 상관관계 분석
- 자동 스케일링 신호 생성
- 사용자 경험 메트릭 추적
"""

import asyncio
import threading
import time
import psutil
import docker
import redis
import pymongo
import requests
import websocket
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union, Callable, Iterator
from dataclasses import dataclass, field
from enum import Enum
from collections import deque, defaultdict
import json
import logging
import numpy as np
import statistics
from concurrent.futures import ThreadPoolExecutor
import weakref
import os
import socket
import subprocess
from pathlib import Path
import sqlite3
from contextlib import asynccontextmanager
import aiofiles
import aioredis
import aiodns

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class MetricType(Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    TIMING = "timing"


class AlertLevel(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class CollectionStatus(Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    STOPPED = "stopped"


# 데이터 클래스들
@dataclass
class MetricValue:
    """메트릭 값"""
    name: str
    value: Union[int, float]
    timestamp: datetime
    tags: Dict[str, str] = field(default_factory=dict)
    metric_type: MetricType = MetricType.GAUGE
    unit: Optional[str] = None
    source: Optional[str] = None


@dataclass
class SystemMetrics:
    """시스템 메트릭"""
    cpu_percent: float
    memory_percent: float
    memory_available: int
    memory_used: int
    disk_usage: Dict[str, float]
    disk_io: Dict[str, Any]
    network_io: Dict[str, Any]
    load_average: List[float]
    process_count: int
    open_files: int
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ApplicationMetrics:
    """애플리케이션 메트릭"""
    response_time: float
    throughput: float
    error_rate: float
    active_connections: int
    queue_size: int
    cache_hit_rate: float
    gc_time: float
    heap_usage: float
    thread_count: int
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class DatabaseMetrics:
    """데이터베이스 메트릭"""
    connections_active: int
    connections_total: int
    query_time_avg: float
    slow_queries: int
    deadlocks: int
    buffer_hit_ratio: float
    index_usage: float
    replication_lag: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class NetworkMetrics:
    """네트워크 메트릭"""
    latency: float
    bandwidth_utilization: float
    packet_loss: float
    connection_errors: int
    dns_resolution_time: float
    ssl_handshake_time: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class UserExperienceMetrics:
    """사용자 경험 메트릭"""
    page_load_time: float
    first_contentful_paint: float
    largest_contentful_paint: float
    cumulative_layout_shift: float
    first_input_delay: float
    bounce_rate: float
    session_duration: float
    conversion_rate: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class BusinessMetrics:
    """비즈니스 메트릭"""
    revenue_per_minute: float
    transaction_count: int
    user_registrations: int
    api_calls: int
    feature_usage: Dict[str, int]
    customer_satisfaction: float
    cost_per_transaction: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class MetricAlert:
    """메트릭 알림"""
    metric_name: str
    current_value: float
    threshold: float
    level: AlertLevel
    message: str
    timestamp: datetime
    source: str
    correlation_id: Optional[str] = None


@dataclass
class CollectionConfig:
    """수집 설정"""
    interval: float = 1.0  # 수집 간격 (초)
    buffer_size: int = 1000  # 버퍼 크기
    enable_alerts: bool = True
    enable_predictions: bool = True
    adaptive_thresholds: bool = True
    correlation_analysis: bool = True
    retention_days: int = 30


# 커스텀 예외
class MetricsCollectionError(Exception):
    """메트릭 수집 오류"""
    pass


class ThresholdExceededError(Exception):
    """임계값 초과 오류"""
    pass


# 메트릭 수집기 기본 클래스
class BaseMetricsCollector:
    """기본 메트릭 수집기"""
    
    def __init__(self, name: str, config: CollectionConfig):
        self.name = name
        self.config = config
        self.status = CollectionStatus.STOPPED
        self.metrics_buffer = deque(maxlen=config.buffer_size)
        self.last_collection_time = None
        self.error_count = 0
        self.collection_count = 0
        
    async def collect(self) -> List[MetricValue]:
        """메트릭 수집 (서브클래스에서 구현)"""
        raise NotImplementedError
    
    async def start_collection(self):
        """수집 시작"""
        self.status = CollectionStatus.ACTIVE
        logger.info(f"Started metrics collection for {self.name}")
    
    async def stop_collection(self):
        """수집 중지"""
        self.status = CollectionStatus.STOPPED
        logger.info(f"Stopped metrics collection for {self.name}")
    
    def get_status(self) -> Dict[str, Any]:
        """수집기 상태 반환"""
        return {
            "name": self.name,
            "status": self.status.value,
            "last_collection": self.last_collection_time,
            "error_count": self.error_count,
            "collection_count": self.collection_count,
            "buffer_size": len(self.metrics_buffer)
        }


# 시스템 메트릭 수집기
class SystemMetricsCollector(BaseMetricsCollector):
    """시스템 메트릭 수집기"""
    
    def __init__(self, config: CollectionConfig):
        super().__init__("system", config)
        self.process = psutil.Process()
        
    async def collect(self) -> List[MetricValue]:
        """시스템 메트릭 수집"""
        try:
            timestamp = datetime.now()
            metrics = []
            
            # CPU 메트릭
            cpu_percent = psutil.cpu_percent(interval=None)
            cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
            
            metrics.extend([
                MetricValue("system.cpu.percent", cpu_percent, timestamp, {"source": "system"}),
                MetricValue("system.cpu.cores", len(cpu_per_core), timestamp, {"source": "system"})
            ])
            
            for i, core_percent in enumerate(cpu_per_core):
                metrics.append(
                    MetricValue(f"system.cpu.core_{i}.percent", core_percent, timestamp, 
                              {"source": "system", "core": str(i)})
                )
            
            # 메모리 메트릭
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            metrics.extend([
                MetricValue("system.memory.percent", memory.percent, timestamp, {"source": "system"}),
                MetricValue("system.memory.available", memory.available, timestamp, {"source": "system"}, unit="bytes"),
                MetricValue("system.memory.used", memory.used, timestamp, {"source": "system"}, unit="bytes"),
                MetricValue("system.memory.total", memory.total, timestamp, {"source": "system"}, unit="bytes"),
                MetricValue("system.swap.percent", swap.percent, timestamp, {"source": "system"}),
                MetricValue("system.swap.used", swap.used, timestamp, {"source": "system"}, unit="bytes")
            ])
            
            # 디스크 메트릭
            disk_partitions = psutil.disk_partitions()
            for partition in disk_partitions:
                try:
                    disk_usage = psutil.disk_usage(partition.mountpoint)
                    metrics.extend([
                        MetricValue("system.disk.percent", disk_usage.percent, timestamp, 
                                  {"source": "system", "device": partition.device, "mountpoint": partition.mountpoint}),
                        MetricValue("system.disk.free", disk_usage.free, timestamp, 
                                  {"source": "system", "device": partition.device}, unit="bytes"),
                        MetricValue("system.disk.used", disk_usage.used, timestamp, 
                                  {"source": "system", "device": partition.device}, unit="bytes")
                    ])
                except PermissionError:
                    continue
            
            # 디스크 I/O 메트릭
            disk_io = psutil.disk_io_counters()
            if disk_io:
                metrics.extend([
                    MetricValue("system.disk.read_bytes", disk_io.read_bytes, timestamp, {"source": "system"}, unit="bytes"),
                    MetricValue("system.disk.write_bytes", disk_io.write_bytes, timestamp, {"source": "system"}, unit="bytes"),
                    MetricValue("system.disk.read_count", disk_io.read_count, timestamp, {"source": "system"}),
                    MetricValue("system.disk.write_count", disk_io.write_count, timestamp, {"source": "system"})
                ])
            
            # 네트워크 I/O 메트릭
            network_io = psutil.net_io_counters()
            if network_io:
                metrics.extend([
                    MetricValue("system.network.bytes_sent", network_io.bytes_sent, timestamp, {"source": "system"}, unit="bytes"),
                    MetricValue("system.network.bytes_recv", network_io.bytes_recv, timestamp, {"source": "system"}, unit="bytes"),
                    MetricValue("system.network.packets_sent", network_io.packets_sent, timestamp, {"source": "system"}),
                    MetricValue("system.network.packets_recv", network_io.packets_recv, timestamp, {"source": "system"})
                ])
            
            # 프로세스 메트릭
            process_count = len(psutil.pids())
            load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
            
            metrics.extend([
                MetricValue("system.processes.count", process_count, timestamp, {"source": "system"}),
                MetricValue("system.load.1min", load_avg[0], timestamp, {"source": "system"}),
                MetricValue("system.load.5min", load_avg[1], timestamp, {"source": "system"}),
                MetricValue("system.load.15min", load_avg[2], timestamp, {"source": "system"})
            ])
            
            self.collection_count += 1
            self.last_collection_time = timestamp
            
            return metrics
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error collecting system metrics: {e}")
            raise MetricsCollectionError(f"System metrics collection failed: {e}")


# 애플리케이션 메트릭 수집기
class ApplicationMetricsCollector(BaseMetricsCollector):
    """애플리케이션 메트릭 수집기"""
    
    def __init__(self, config: CollectionConfig, app_endpoints: List[str]):
        super().__init__("application", config)
        self.app_endpoints = app_endpoints
        self.response_times = deque(maxlen=100)
        self.error_counts = defaultdict(int)
        
    async def collect(self) -> List[MetricValue]:
        """애플리케이션 메트릭 수집"""
        try:
            timestamp = datetime.now()
            metrics = []
            
            # HTTP 엔드포인트 메트릭
            for endpoint in self.app_endpoints:
                start_time = time.time()
                try:
                    response = requests.get(endpoint, timeout=5)
                    response_time = (time.time() - start_time) * 1000  # ms
                    
                    self.response_times.append(response_time)
                    
                    metrics.extend([
                        MetricValue("app.http.response_time", response_time, timestamp, 
                                  {"source": "application", "endpoint": endpoint}, unit="ms"),
                        MetricValue("app.http.status_code", response.status_code, timestamp, 
                                  {"source": "application", "endpoint": endpoint})
                    ])
                    
                    if response.status_code >= 400:
                        self.error_counts[endpoint] += 1
                        
                except requests.exceptions.RequestException as e:
                    self.error_counts[endpoint] += 1
                    metrics.append(
                        MetricValue("app.http.error", 1, timestamp, 
                                  {"source": "application", "endpoint": endpoint, "error": str(e)})
                    )
            
            # 집계 메트릭
            if self.response_times:
                avg_response_time = statistics.mean(self.response_times)
                p95_response_time = np.percentile(self.response_times, 95)
                
                metrics.extend([
                    MetricValue("app.http.response_time.avg", avg_response_time, timestamp, {"source": "application"}),
                    MetricValue("app.http.response_time.p95", p95_response_time, timestamp, {"source": "application"})
                ])
            
            # 에러율 계산
            total_requests = self.collection_count
            total_errors = sum(self.error_counts.values())
            error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0
            
            metrics.append(
                MetricValue("app.http.error_rate", error_rate, timestamp, {"source": "application"}, unit="percent")
            )
            
            self.collection_count += 1
            self.last_collection_time = timestamp
            
            return metrics
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error collecting application metrics: {e}")
            raise MetricsCollectionError(f"Application metrics collection failed: {e}")


# 도커 메트릭 수집기
class DockerMetricsCollector(BaseMetricsCollector):
    """도커 메트릭 수집기"""
    
    def __init__(self, config: CollectionConfig):
        super().__init__("docker", config)
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            logger.warning(f"Docker client initialization failed: {e}")
            self.docker_client = None
    
    async def collect(self) -> List[MetricValue]:
        """도커 메트릭 수집"""
        if not self.docker_client:
            return []
        
        try:
            timestamp = datetime.now()
            metrics = []
            
            # 컨테이너 메트릭
            containers = self.docker_client.containers.list()
            
            metrics.append(
                MetricValue("docker.containers.running", len(containers), timestamp, {"source": "docker"})
            )
            
            for container in containers:
                try:
                    stats = container.stats(stream=False)
                    
                    # CPU 메트릭
                    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                               stats['precpu_stats']['cpu_usage']['total_usage']
                    system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                                  stats['precpu_stats']['system_cpu_usage']
                    
                    cpu_percent = 0
                    if system_delta > 0:
                        cpu_percent = (cpu_delta / system_delta) * len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100
                    
                    # 메모리 메트릭
                    memory_usage = stats['memory_stats']['usage']
                    memory_limit = stats['memory_stats']['limit']
                    memory_percent = (memory_usage / memory_limit) * 100 if memory_limit > 0 else 0
                    
                    # 네트워크 메트릭
                    network_rx = 0
                    network_tx = 0
                    if 'networks' in stats:
                        for interface in stats['networks'].values():
                            network_rx += interface['rx_bytes']
                            network_tx += interface['tx_bytes']
                    
                    container_tags = {
                        "source": "docker",
                        "container_id": container.id[:12],
                        "container_name": container.name,
                        "image": container.image.tags[0] if container.image.tags else "unknown"
                    }
                    
                    metrics.extend([
                        MetricValue("docker.container.cpu.percent", cpu_percent, timestamp, container_tags),
                        MetricValue("docker.container.memory.usage", memory_usage, timestamp, container_tags, unit="bytes"),
                        MetricValue("docker.container.memory.percent", memory_percent, timestamp, container_tags),
                        MetricValue("docker.container.network.rx_bytes", network_rx, timestamp, container_tags, unit="bytes"),
                        MetricValue("docker.container.network.tx_bytes", network_tx, timestamp, container_tags, unit="bytes")
                    ])
                    
                except Exception as e:
                    logger.warning(f"Error collecting stats for container {container.name}: {e}")
                    continue
            
            # 이미지 메트릭
            images = self.docker_client.images.list()
            metrics.append(
                MetricValue("docker.images.count", len(images), timestamp, {"source": "docker"})
            )
            
            # 볼륨 메트릭
            volumes = self.docker_client.volumes.list()
            metrics.append(
                MetricValue("docker.volumes.count", len(volumes), timestamp, {"source": "docker"})
            )
            
            self.collection_count += 1
            self.last_collection_time = timestamp
            
            return metrics
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error collecting Docker metrics: {e}")
            raise MetricsCollectionError(f"Docker metrics collection failed: {e}")


# 데이터베이스 메트릭 수집기
class DatabaseMetricsCollector(BaseMetricsCollector):
    """데이터베이스 메트릭 수집기"""
    
    def __init__(self, config: CollectionConfig, db_configs: Dict[str, Dict]):
        super().__init__("database", config)
        self.db_configs = db_configs
        self.connections = {}
        
    async def collect(self) -> List[MetricValue]:
        """데이터베이스 메트릭 수집"""
        try:
            timestamp = datetime.now()
            metrics = []
            
            for db_name, db_config in self.db_configs.items():
                db_type = db_config.get('type', 'unknown')
                
                if db_type == 'redis':
                    metrics.extend(await self._collect_redis_metrics(db_name, db_config, timestamp))
                elif db_type == 'mongodb':
                    metrics.extend(await self._collect_mongodb_metrics(db_name, db_config, timestamp))
                elif db_type == 'postgresql':
                    metrics.extend(await self._collect_postgresql_metrics(db_name, db_config, timestamp))
                elif db_type == 'mysql':
                    metrics.extend(await self._collect_mysql_metrics(db_name, db_config, timestamp))
            
            self.collection_count += 1
            self.last_collection_time = timestamp
            
            return metrics
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error collecting database metrics: {e}")
            raise MetricsCollectionError(f"Database metrics collection failed: {e}")
    
    async def _collect_redis_metrics(self, db_name: str, config: Dict, timestamp: datetime) -> List[MetricValue]:
        """Redis 메트릭 수집"""
        try:
            redis_client = redis.Redis(
                host=config.get('host', 'localhost'),
                port=config.get('port', 6379),
                db=config.get('db', 0),
                password=config.get('password'),
                socket_timeout=5
            )
            
            info = redis_client.info()
            
            tags = {"source": "database", "db_name": db_name, "db_type": "redis"}
            
            return [
                MetricValue("db.redis.connected_clients", info['connected_clients'], timestamp, tags),
                MetricValue("db.redis.used_memory", info['used_memory'], timestamp, tags, unit="bytes"),
                MetricValue("db.redis.used_memory_percent", 
                          (info['used_memory'] / info['maxmemory']) * 100 if info['maxmemory'] > 0 else 0, 
                          timestamp, tags),
                MetricValue("db.redis.keyspace_hits", info['keyspace_hits'], timestamp, tags),
                MetricValue("db.redis.keyspace_misses", info['keyspace_misses'], timestamp, tags),
                MetricValue("db.redis.ops_per_sec", info['instantaneous_ops_per_sec'], timestamp, tags),
                MetricValue("db.redis.expired_keys", info['expired_keys'], timestamp, tags)
            ]
            
        except Exception as e:
            logger.warning(f"Error collecting Redis metrics for {db_name}: {e}")
            return []
    
    async def _collect_mongodb_metrics(self, db_name: str, config: Dict, timestamp: datetime) -> List[MetricValue]:
        """MongoDB 메트릭 수집"""
        try:
            client = pymongo.MongoClient(
                host=config.get('host', 'localhost'),
                port=config.get('port', 27017),
                username=config.get('username'),
                password=config.get('password'),
                serverSelectionTimeoutMS=5000
            )
            
            db = client[config.get('database', 'admin')]
            server_status = db.command("serverStatus")
            
            tags = {"source": "database", "db_name": db_name, "db_type": "mongodb"}
            
            return [
                MetricValue("db.mongodb.connections.current", 
                          server_status['connections']['current'], timestamp, tags),
                MetricValue("db.mongodb.connections.available", 
                          server_status['connections']['available'], timestamp, tags),
                MetricValue("db.mongodb.operations.query", 
                          server_status['opcounters']['query'], timestamp, tags),
                MetricValue("db.mongodb.operations.insert", 
                          server_status['opcounters']['insert'], timestamp, tags),
                MetricValue("db.mongodb.operations.update", 
                          server_status['opcounters']['update'], timestamp, tags),
                MetricValue("db.mongodb.operations.delete", 
                          server_status['opcounters']['delete'], timestamp, tags),
                MetricValue("db.mongodb.memory.resident", 
                          server_status['mem']['resident'] * 1024 * 1024, timestamp, tags, unit="bytes")
            ]
            
        except Exception as e:
            logger.warning(f"Error collecting MongoDB metrics for {db_name}: {e}")
            return []
    
    async def _collect_postgresql_metrics(self, db_name: str, config: Dict, timestamp: datetime) -> List[MetricValue]:
        """PostgreSQL 메트릭 수집 (placeholder)"""
        # psycopg2 또는 asyncpg를 사용한 구현 필요
        return []
    
    async def _collect_mysql_metrics(self, db_name: str, config: Dict, timestamp: datetime) -> List[MetricValue]:
        """MySQL 메트릭 수집 (placeholder)"""
        # mysql-connector-python 또는 aiomysql을 사용한 구현 필요
        return []


# 실시간 메트릭 분석기
class RealTimeMetricsAnalyzer:
    """실시간 메트릭 분석기"""
    
    def __init__(self, config: CollectionConfig):
        self.config = config
        self.metric_history = defaultdict(lambda: deque(maxlen=1000))
        self.thresholds = {}
        self.alerts = deque(maxlen=1000)
        self.anomaly_detector = AnomalyDetector()
        self.correlation_analyzer = CorrelationAnalyzer()
        
    def add_metrics(self, metrics: List[MetricValue]):
        """메트릭 추가 및 분석"""
        for metric in metrics:
            self.metric_history[metric.name].append(metric)
            
            # 임계값 검사
            if self.config.enable_alerts:
                alert = self._check_thresholds(metric)
                if alert:
                    self.alerts.append(alert)
            
            # 이상 징후 탐지
            if self.config.enable_predictions:
                anomaly = self.anomaly_detector.detect(metric.name, metric.value)
                if anomaly:
                    self.alerts.append(
                        MetricAlert(
                            metric_name=metric.name,
                            current_value=metric.value,
                            threshold=anomaly.expected_value,
                            level=AlertLevel.WARNING,
                            message=f"Anomaly detected: {anomaly.reason}",
                            timestamp=metric.timestamp,
                            source="anomaly_detector"
                        )
                    )
    
    def _check_thresholds(self, metric: MetricValue) -> Optional[MetricAlert]:
        """임계값 검사"""
        threshold_config = self.thresholds.get(metric.name)
        if not threshold_config:
            return None
        
        for level, threshold in threshold_config.items():
            if metric.value > threshold:
                return MetricAlert(
                    metric_name=metric.name,
                    current_value=metric.value,
                    threshold=threshold,
                    level=AlertLevel(level),
                    message=f"{metric.name} exceeded {level} threshold: {metric.value} > {threshold}",
                    timestamp=metric.timestamp,
                    source="threshold_checker"
                )
        
        return None
    
    def get_trend_analysis(self, metric_name: str, window_minutes: int = 10) -> Dict[str, Any]:
        """트렌드 분석"""
        history = self.metric_history[metric_name]
        if len(history) < 2:
            return {"trend": "insufficient_data"}
        
        cutoff_time = datetime.now() - timedelta(minutes=window_minutes)
        recent_values = [m.value for m in history if m.timestamp >= cutoff_time]
        
        if len(recent_values) < 2:
            return {"trend": "insufficient_data"}
        
        # 선형 회귀를 통한 트렌드 계산
        x = np.arange(len(recent_values))
        slope, intercept = np.polyfit(x, recent_values, 1)
        
        return {
            "trend": "increasing" if slope > 0 else "decreasing" if slope < 0 else "stable",
            "slope": slope,
            "current_value": recent_values[-1],
            "predicted_next": slope * len(recent_values) + intercept,
            "variance": np.var(recent_values),
            "data_points": len(recent_values)
        }
    
    def get_correlation_matrix(self, metric_names: List[str]) -> Dict[str, Dict[str, float]]:
        """메트릭 간 상관관계 분석"""
        if not self.config.correlation_analysis:
            return {}
        
        return self.correlation_analyzer.compute_correlation_matrix(
            {name: self.metric_history[name] for name in metric_names}
        )


# 이상 징후 탐지기
class AnomalyDetector:
    """이상 징후 탐지기"""
    
    def __init__(self, sensitivity: float = 2.0):
        self.sensitivity = sensitivity
        self.metric_stats = defaultdict(lambda: {"values": deque(maxlen=100), "mean": 0, "std": 0})
    
    def detect(self, metric_name: str, value: float) -> Optional[Dict[str, Any]]:
        """이상 징후 탐지"""
        stats = self.metric_stats[metric_name]
        stats["values"].append(value)
        
        if len(stats["values"]) < 10:  # 최소 데이터 필요
            return None
        
        # 통계 업데이트
        values = list(stats["values"])
        stats["mean"] = statistics.mean(values)
        stats["std"] = statistics.stdev(values) if len(values) > 1 else 0
        
        # Z-score 계산
        if stats["std"] == 0:
            return None
        
        z_score = abs(value - stats["mean"]) / stats["std"]
        
        if z_score > self.sensitivity:
            return {
                "metric_name": metric_name,
                "anomaly_score": z_score,
                "expected_value": stats["mean"],
                "actual_value": value,
                "reason": f"Z-score {z_score:.2f} exceeds sensitivity threshold {self.sensitivity}"
            }
        
        return None


# 상관관계 분석기
class CorrelationAnalyzer:
    """메트릭 간 상관관계 분석기"""
    
    def compute_correlation_matrix(self, metric_histories: Dict[str, deque]) -> Dict[str, Dict[str, float]]:
        """상관관계 매트릭스 계산"""
        correlation_matrix = {}
        metric_names = list(metric_histories.keys())
        
        for metric1 in metric_names:
            correlation_matrix[metric1] = {}
            
            for metric2 in metric_names:
                if metric1 == metric2:
                    correlation_matrix[metric1][metric2] = 1.0
                    continue
                
                correlation = self._calculate_correlation(
                    metric_histories[metric1], 
                    metric_histories[metric2]
                )
                correlation_matrix[metric1][metric2] = correlation
        
        return correlation_matrix
    
    def _calculate_correlation(self, history1: deque, history2: deque) -> float:
        """두 메트릭 간 상관계수 계산"""
        # 시간 동기화된 값들 추출
        min_len = min(len(history1), len(history2))
        if min_len < 3:
            return 0.0
        
        values1 = [m.value for m in list(history1)[-min_len:]]
        values2 = [m.value for m in list(history2)[-min_len:]]
        
        try:
            correlation = np.corrcoef(values1, values2)[0, 1]
            return correlation if not np.isnan(correlation) else 0.0
        except Exception:
            return 0.0


# 적응형 임계값 관리자
class AdaptiveThresholdManager:
    """적응형 임계값 관리자"""
    
    def __init__(self):
        self.thresholds = defaultdict(dict)
        self.learning_rate = 0.1
        self.base_thresholds = {
            "system.cpu.percent": {"warning": 70, "critical": 90},
            "system.memory.percent": {"warning": 80, "critical": 95},
            "system.disk.percent": {"warning": 85, "critical": 95},
            "app.http.response_time": {"warning": 1000, "critical": 5000},
            "app.http.error_rate": {"warning": 5, "critical": 10},
            "docker.container.cpu.percent": {"warning": 80, "critical": 95},
            "docker.container.memory.percent": {"warning": 85, "critical": 95}
        }
    
    def update_thresholds(self, metric_name: str, recent_values: List[float]):
        """최근 값들을 기반으로 임계값 조정"""
        if len(recent_values) < 10:
            return
        
        # 통계 계산
        mean = statistics.mean(recent_values)
        std = statistics.stdev(recent_values) if len(recent_values) > 1 else 0
        p95 = np.percentile(recent_values, 95)
        
        # 기본 임계값이 있는 경우
        if metric_name in self.base_thresholds:
            base_warning = self.base_thresholds[metric_name]["warning"]
            base_critical = self.base_thresholds[metric_name]["critical"]
            
            # 적응형 조정
            adaptive_warning = mean + (2 * std)
            adaptive_critical = mean + (3 * std)
            
            # 가중 평균으로 임계값 업데이트
            new_warning = (1 - self.learning_rate) * base_warning + self.learning_rate * adaptive_warning
            new_critical = (1 - self.learning_rate) * base_critical + self.learning_rate * adaptive_critical
            
            self.thresholds[metric_name] = {
                "warning": max(new_warning, mean + std),  # 최소한 mean + 1*std
                "critical": max(new_critical, mean + 2*std)  # 최소한 mean + 2*std
            }
        else:
            # 새로운 메트릭인 경우 통계 기반으로 설정
            self.thresholds[metric_name] = {
                "warning": p95,
                "critical": mean + 3*std if std > 0 else p95 * 1.2
            }
    
    def get_threshold(self, metric_name: str, level: str) -> Optional[float]:
        """임계값 조회"""
        return self.thresholds.get(metric_name, {}).get(level)


# 예측 엔진
class MetricPredictor:
    """메트릭 예측 엔진"""
    
    def __init__(self):
        self.models = {}
        self.prediction_horizon = 300  # 5분
    
    def predict_future_values(self, metric_name: str, history: deque, 
                            steps_ahead: int = 5) -> List[Dict[str, Any]]:
        """미래 값 예측"""
        if len(history) < 10:
            return []
        
        # 시계열 데이터 준비
        timestamps = [m.timestamp for m in history]
        values = [m.value for m in history]
        
        # 단순 선형 예측 (더 복잡한 모델로 확장 가능)
        x = np.arange(len(values))
        slope, intercept = np.polyfit(x, values, 1)
        
        predictions = []
        last_timestamp = timestamps[-1]
        
        for i in range(1, steps_ahead + 1):
            future_timestamp = last_timestamp + timedelta(seconds=i * 60)  # 1분 간격
            predicted_value = slope * (len(values) + i) + intercept
            
            # 예측 신뢰구간 계산
            residuals = [values[j] - (slope * j + intercept) for j in range(len(values))]
            std_error = statistics.stdev(residuals) if len(residuals) > 1 else 0
            
            predictions.append({
                "timestamp": future_timestamp,
                "predicted_value": predicted_value,
                "confidence_interval": {
                    "lower": predicted_value - 1.96 * std_error,
                    "upper": predicted_value + 1.96 * std_error
                },
                "trend": "increasing" if slope > 0 else "decreasing" if slope < 0 else "stable"
            })
        
        return predictions


# 메인 메트릭 수집 관리자
class RealTimeMetricsManager:
    """실시간 메트릭 수집 관리자"""
    
    def __init__(self, config: CollectionConfig = None):
        self.config = config or CollectionConfig()
        self.collectors = {}
        self.analyzer = RealTimeMetricsAnalyzer(self.config)
        self.threshold_manager = AdaptiveThresholdManager()
        self.predictor = MetricPredictor()
        
        self.running = False
        self.collection_tasks = []
        self.metrics_queue = asyncio.Queue()
        self.alert_callbacks = []
        
        # 메트릭 저장소
        self.metrics_store = MetricsStore()
        
        # 웹소켓 서버 (실시간 스트리밍용)
        self.websocket_server = None
        self.websocket_clients = set()
    
    def add_collector(self, collector: BaseMetricsCollector):
        """메트릭 수집기 추가"""
        self.collectors[collector.name] = collector
        logger.info(f"Added metrics collector: {collector.name}")
    
    def add_alert_callback(self, callback: Callable[[MetricAlert], None]):
        """알림 콜백 추가"""
        self.alert_callbacks.append(callback)
    
    async def start(self):
        """메트릭 수집 시작"""
        if self.running:
            logger.warning("Metrics collection is already running")
            return
        
        self.running = True
        logger.info("Starting metrics collection system")
        
        # 수집기 시작
        for collector in self.collectors.values():
            await collector.start_collection()
            task = asyncio.create_task(self._collection_loop(collector))
            self.collection_tasks.append(task)
        
        # 처리 태스크 시작
        processing_task = asyncio.create_task(self._processing_loop())
        self.collection_tasks.append(processing_task)
        
        # 웹소켓 서버 시작
        if self.config.enable_websocket_streaming:
            await self._start_websocket_server()
    
    async def stop(self):
        """메트릭 수집 중지"""
        if not self.running:
            return
        
        self.running = False
        logger.info("Stopping metrics collection system")
        
        # 수집기 중지
        for collector in self.collectors.values():
            await collector.stop_collection()
        
        # 태스크 취소
        for task in self.collection_tasks:
            task.cancel()
        
        await asyncio.gather(*self.collection_tasks, return_exceptions=True)
        self.collection_tasks.clear()
        
        # 웹소켓 서버 중지
        if self.websocket_server:
            self.websocket_server.close()
            await self.websocket_server.wait_closed()
    
    async def _collection_loop(self, collector: BaseMetricsCollector):
        """개별 수집기 루프"""
        while self.running and collector.status == CollectionStatus.ACTIVE:
            try:
                start_time = time.time()
                
                # 메트릭 수집
                metrics = await collector.collect()
                
                # 큐에 추가
                await self.metrics_queue.put(("metrics", collector.name, metrics))
                
                # 수집 간격 조정
                elapsed = time.time() - start_time
                sleep_time = max(0, self.config.interval - elapsed)
                await asyncio.sleep(sleep_time)
                
            except Exception as e:
                logger.error(f"Error in collection loop for {collector.name}: {e}")
                await asyncio.sleep(self.config.interval)
    
    async def _processing_loop(self):
        """메트릭 처리 루프"""
        while self.running:
            try:
                # 큐에서 메트릭 가져오기
                item = await asyncio.wait_for(self.metrics_queue.get(), timeout=1.0)
                
                if item[0] == "metrics":
                    collector_name, metrics = item[1], item[2]
                    await self._process_metrics(collector_name, metrics)
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
    
    async def _process_metrics(self, collector_name: str, metrics: List[MetricValue]):
        """메트릭 처리"""
        if not metrics:
            return
        
        # 분석기에 메트릭 추가
        self.analyzer.add_metrics(metrics)
        
        # 저장소에 저장
        await self.metrics_store.store_metrics(metrics)
        
        # 적응형 임계값 업데이트
        if self.config.adaptive_thresholds:
            self._update_adaptive_thresholds(metrics)
        
        # 새로운 알림 확인 및 처리
        recent_alerts = list(self.analyzer.alerts)[-len(metrics):]
        for alert in recent_alerts:
            await self._handle_alert(alert)
        
        # 웹소켓 클라이언트에 실시간 전송
        if self.websocket_clients:
            await self._broadcast_metrics(metrics)
    
    def _update_adaptive_thresholds(self, metrics: List[MetricValue]):
        """적응형 임계값 업데이트"""
        metric_groups = defaultdict(list)
        
        for metric in metrics:
            metric_groups[metric.name].append(metric.value)
        
        for metric_name, values in metric_groups.items():
            # 최근 히스토리와 결합
            recent_history = list(self.analyzer.metric_history[metric_name])[-50:]
            all_values = [m.value for m in recent_history] + values
            
            self.threshold_manager.update_thresholds(metric_name, all_values)
    
    async def _handle_alert(self, alert: MetricAlert):
        """알림 처리"""
        logger.warning(f"ALERT: {alert.message}")
        
        # 콜백 호출
        for callback in self.alert_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(alert)
                else:
                    callback(alert)
            except Exception as e:
                logger.error(f"Error in alert callback: {e}")
    
    async def _start_websocket_server(self, port: int = 8765):
        """웹소켓 서버 시작"""
        import websockets
        
        async def handle_client(websocket, path):
            self.websocket_clients.add(websocket)
            logger.info(f"WebSocket client connected: {websocket.remote_address}")
            
            try:
                await websocket.wait_closed()
            finally:
                self.websocket_clients.remove(websocket)
                logger.info(f"WebSocket client disconnected: {websocket.remote_address}")
        
        self.websocket_server = await websockets.serve(handle_client, "localhost", port)
        logger.info(f"WebSocket server started on port {port}")
    
    async def _broadcast_metrics(self, metrics: List[MetricValue]):
        """메트릭을 웹소켓 클라이언트에 브로드캐스트"""
        if not self.websocket_clients:
            return
        
        message = {
            "type": "metrics",
            "timestamp": datetime.now().isoformat(),
            "data": [
                {
                    "name": m.name,
                    "value": m.value,
                    "timestamp": m.timestamp.isoformat(),
                    "tags": m.tags,
                    "unit": m.unit,
                    "source": m.source
                }
                for m in metrics
            ]
        }
        
        message_json = json.dumps(message)
        
        # 연결이 끊어진 클라이언트 제거
        disconnected_clients = set()
        
        for client in self.websocket_clients:
            try:
                await client.send(message_json)
            except Exception:
                disconnected_clients.add(client)
        
        self.websocket_clients -= disconnected_clients
    
    def get_system_status(self) -> Dict[str, Any]:
        """시스템 상태 반환"""
        return {
            "running": self.running,
            "collectors": {name: collector.get_status() for name, collector in self.collectors.items()},
            "metrics_queue_size": self.metrics_queue.qsize(),
            "websocket_clients": len(self.websocket_clients),
            "recent_alerts": len([a for a in self.analyzer.alerts 
                                if a.timestamp > datetime.now() - timedelta(minutes=5)]),
            "total_metrics": sum(len(self.analyzer.metric_history[name]) 
                               for name in self.analyzer.metric_history)
        }
    
    def get_metrics_summary(self, time_range_minutes: int = 10) -> Dict[str, Any]:
        """메트릭 요약 정보 반환"""
        cutoff_time = datetime.now() - timedelta(minutes=time_range_minutes)
        summary = {}
        
        for metric_name, history in self.analyzer.metric_history.items():
            recent_metrics = [m for m in history if m.timestamp >= cutoff_time]
            
            if recent_metrics:
                values = [m.value for m in recent_metrics]
                summary[metric_name] = {
                    "count": len(values),
                    "min": min(values),
                    "max": max(values),
                    "avg": statistics.mean(values),
                    "current": values[-1],
                    "trend": self.analyzer.get_trend_analysis(metric_name, time_range_minutes),
                    "predictions": self.predictor.predict_future_values(metric_name, history)
                }
        
        return summary
    
    async def get_correlation_insights(self) -> Dict[str, Any]:
        """상관관계 인사이트 반환"""
        all_metrics = list(self.analyzer.metric_history.keys())
        correlation_matrix = self.analyzer.get_correlation_matrix(all_metrics)
        
        # 강한 상관관계 찾기
        strong_correlations = []
        for metric1 in correlation_matrix:
            for metric2 in correlation_matrix[metric1]:
                if metric1 != metric2:
                    correlation = correlation_matrix[metric1][metric2]
                    if abs(correlation) > 0.7:  # 강한 상관관계 임계값
                        strong_correlations.append({
                            "metric1": metric1,
                            "metric2": metric2,
                            "correlation": correlation,
                            "type": "positive" if correlation > 0 else "negative"
                        })
        
        return {
            "correlation_matrix": correlation_matrix,
            "strong_correlations": strong_correlations,
            "insights": self._generate_correlation_insights(strong_correlations)
        }
    
    def _generate_correlation_insights(self, correlations: List[Dict]) -> List[str]:
        """상관관계 인사이트 생성"""
        insights = []
        
        for corr in correlations[:5]:  # 상위 5개만
            if corr["type"] == "positive":
                insights.append(
                    f"{corr['metric1']} and {corr['metric2']} move together "
                    f"(correlation: {corr['correlation']:.2f})"
                )
            else:
                insights.append(
                    f"{corr['metric1']} and {corr['metric2']} move in opposite directions "
                    f"(correlation: {corr['correlation']:.2f})"
                )
        
        return insights


# 메트릭 저장소
class MetricsStore:
    """메트릭 저장소"""
    
    def __init__(self, storage_type: str = "sqlite", connection_string: Optional[str] = None):
        self.storage_type = storage_type
        self.connection_string = connection_string or "metrics.db"
        
        if storage_type == "sqlite":
            self._init_sqlite()
        elif storage_type == "redis":
            self._init_redis()
        elif storage_type == "influxdb":
            self._init_influxdb()
    
    def _init_sqlite(self):
        """SQLite 초기화"""
        self.conn = sqlite3.connect(self.connection_string, check_same_thread=False)
        cursor = self.conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp TEXT NOT NULL,
                tags TEXT,
                unit TEXT,
                source TEXT,
                metric_type TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp 
            ON metrics (name, timestamp)
        ''')
        
        self.conn.commit()
    
    def _init_redis(self):
        """Redis 초기화"""
        # Redis 시계열 데이터 저장 구현
        pass
    
    def _init_influxdb(self):
        """InfluxDB 초기화"""
        # InfluxDB 연동 구현
        pass
    
    async def store_metrics(self, metrics: List[MetricValue]):
        """메트릭 저장"""
        if self.storage_type == "sqlite":
            await self._store_sqlite(metrics)
        elif self.storage_type == "redis":
            await self._store_redis(metrics)
        elif self.storage_type == "influxdb":
            await self._store_influxdb(metrics)
    
    async def _store_sqlite(self, metrics: List[MetricValue]):
        """SQLite에 메트릭 저장"""
        cursor = self.conn.cursor()
        
        for metric in metrics:
            cursor.execute('''
                INSERT INTO metrics (name, value, timestamp, tags, unit, source, metric_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                metric.name,
                metric.value,
                metric.timestamp.isoformat(),
                json.dumps(metric.tags),
                metric.unit,
                metric.source,
                metric.metric_type.value
            ))
        
        self.conn.commit()
    
    async def _store_redis(self, metrics: List[MetricValue]):
        """Redis에 메트릭 저장"""
        # Redis 시계열 저장 구현
        pass
    
    async def _store_influxdb(self, metrics: List[MetricValue]):
        """InfluxDB에 메트릭 저장"""
        # InfluxDB 저장 구현
        pass


# 편의 함수들
async def create_default_collectors(config: CollectionConfig) -> List[BaseMetricsCollector]:
    """기본 수집기 생성"""
    collectors = []
    
    # 시스템 메트릭 수집기
    system_collector = SystemMetricsCollector(config)
    collectors.append(system_collector)
    
    # 도커 메트릭 수집기 (도커가 설치된 경우)
    try:
        docker_collector = DockerMetricsCollector(config)
        collectors.append(docker_collector)
    except Exception as e:
        logger.warning(f"Docker collector not available: {e}")
    
    # 애플리케이션 메트릭 수집기
    app_endpoints = os.getenv("MONITORING_ENDPOINTS", "").split(",")
    if app_endpoints and app_endpoints[0]:
        app_collector = ApplicationMetricsCollector(config, app_endpoints)
        collectors.append(app_collector)
    
    # 데이터베이스 메트릭 수집기
    db_configs = {}
    
    # Redis 설정
    redis_host = os.getenv("REDIS_HOST")
    if redis_host:
        db_configs["redis"] = {
            "type": "redis",
            "host": redis_host,
            "port": int(os.getenv("REDIS_PORT", "6379")),
            "password": os.getenv("REDIS_PASSWORD")
        }
    
    # MongoDB 설정
    mongo_host = os.getenv("MONGO_HOST")
    if mongo_host:
        db_configs["mongodb"] = {
            "type": "mongodb",
            "host": mongo_host,
            "port": int(os.getenv("MONGO_PORT", "27017")),
            "username": os.getenv("MONGO_USERNAME"),
            "password": os.getenv("MONGO_PASSWORD"),
            "database": os.getenv("MONGO_DATABASE", "admin")
        }
    
    if db_configs:
        db_collector = DatabaseMetricsCollector(config, db_configs)
        collectors.append(db_collector)
    
    return collectors


# 메인 실행 함수
async def main():
    """메인 실행 함수"""
    # 설정
    config = CollectionConfig(
        interval=1.0,
        buffer_size=1000,
        enable_alerts=True,
        enable_predictions=True,
        adaptive_thresholds=True,
        correlation_analysis=True
    )
    config.enable_websocket_streaming = True
    
    # 메트릭 관리자 생성
    manager = RealTimeMetricsManager(config)
    
    # 기본 수집기들 추가
    collectors = await create_default_collectors(config)
    for collector in collectors:
        manager.add_collector(collector)
    
    # 알림 콜백 추가
    def alert_handler(alert: MetricAlert):
        print(f"🚨 ALERT: {alert.level.value.upper()} - {alert.message}")
    
    manager.add_alert_callback(alert_handler)
    
    try:
        # 시스템 시작
        await manager.start()
        print("✅ Real-time metrics collection system started")
        print("📊 WebSocket server available at ws://localhost:8765")
        print("🔧 Press Ctrl+C to stop")
        
        # 주기적 상태 출력
        while True:
            await asyncio.sleep(30)  # 30초마다
            
            status = manager.get_system_status()
            print(f"\n📈 System Status:")
            print(f"   Running: {status['running']}")
            print(f"   Active Collectors: {len([c for c in status['collectors'].values() if c['status'] == 'active'])}")
            print(f"   Queue Size: {status['metrics_queue_size']}")
            print(f"   WebSocket Clients: {status['websocket_clients']}")
            print(f"   Recent Alerts: {status['recent_alerts']}")
            
            # 메트릭 요약
            summary = manager.get_metrics_summary(5)  # 5분간
            if summary:
                print(f"   Key Metrics (5min):")
                for name, data in list(summary.items())[:3]:  # 상위 3개만
                    print(f"     {name}: {data['current']:.2f} (avg: {data['avg']:.2f})")
    
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
    
    finally:
        await manager.stop()
        print("✅ System stopped cleanly")


if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 이벤트 루프 실행
    asyncio.run(main())