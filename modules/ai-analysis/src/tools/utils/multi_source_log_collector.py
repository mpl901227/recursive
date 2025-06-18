#!/usr/bin/env python3
"""
Multi-Source Log Collector
자가 발전형 LLM 연동 IDE를 위한 멀티소스 로그 수집 및 통합 분석 엔진

주요 기능:
- 실시간 멀티소스 로그 수집 (서버, 터미널, 웹콘솔, DB, 도커 등)
- 로그 상관관계 분석 및 패턴 탐지
- 이상 징후 실시간 감지
- 통합 로그 포맷으로 변환
- LLM 처리를 위한 컨텍스트 enrichment
- 시계열 데이터 분석 및 예측
"""

import asyncio
import json
import logging
import re
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, AsyncGenerator, Callable, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import defaultdict, deque
import weakref
import psutil
import docker
import subprocess
import sqlite3
import aiofiles
import websockets
import aiohttp
from concurrent.futures import ThreadPoolExecutor
import queue
import signal
import sys
from contextlib import asynccontextmanager
import hashlib
import uuid

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class LogLevel(Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogSource(Enum):
    SERVER = "server"
    TERMINAL = "terminal"
    WEB_CONSOLE = "web_console"
    BROWSER = "browser"
    DATABASE = "database"
    DOCKER = "docker"
    SYSTEM = "system"
    NETWORK = "network"
    APPLICATION = "application"
    SECURITY = "security"


class AnomalyType(Enum):
    PERFORMANCE = "performance"
    ERROR_SPIKE = "error_spike"
    UNUSUAL_PATTERN = "unusual_pattern"
    THRESHOLD_BREACH = "threshold_breach"
    CORRELATION_BREAK = "correlation_break"


# 데이터 클래스들
@dataclass
class LogEntry:
    """개별 로그 엔트리"""
    id: str
    timestamp: datetime
    source: LogSource
    level: LogLevel
    message: str
    raw_data: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    correlation_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    
    def __post_init__(self):
        if not self.id:
            self.id = self._generate_id()
    
    def _generate_id(self) -> str:
        """고유 ID 생성"""
        unique_string = f"{self.timestamp.isoformat()}-{self.source.value}-{hash(self.message)}"
        return hashlib.md5(unique_string.encode()).hexdigest()


@dataclass
class UnifiedLog:
    """통합 로그 포맷"""
    entries: List[LogEntry]
    correlation_map: Dict[str, List[str]] = field(default_factory=dict)
    time_range: tuple = None
    total_entries: int = 0
    sources_count: Dict[LogSource, int] = field(default_factory=dict)
    
    def __post_init__(self):
        if self.entries:
            self.total_entries = len(self.entries)
            self.time_range = (
                min(entry.timestamp for entry in self.entries),
                max(entry.timestamp for entry in self.entries)
            )
            # 소스별 카운트
            for entry in self.entries:
                self.sources_count[entry.source] = self.sources_count.get(entry.source, 0) + 1


@dataclass
class Anomaly:
    """이상 징후 정보"""
    id: str
    type: AnomalyType
    severity: float  # 0.0 ~ 1.0
    source: LogSource
    detected_at: datetime
    description: str
    affected_entries: List[str]  # LogEntry IDs
    confidence: float
    suggested_actions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CorrelatedLogs:
    """상관관계 분석된 로그들"""
    primary_entry: LogEntry
    related_entries: List[LogEntry]
    correlation_strength: float
    correlation_type: str  # 'temporal', 'causal', 'pattern'
    time_window: timedelta
    
    def get_all_entries(self) -> List[LogEntry]:
        """모든 관련 엔트리 반환"""
        return [self.primary_entry] + self.related_entries


@dataclass
class LogStream:
    """로그 스트림 정보"""
    source: LogSource
    active: bool
    last_update: datetime
    total_collected: int
    error_count: int
    collector_instance: Any = None


# 개별 로그 수집기들
class BaseLogCollector:
    """기본 로그 수집기 클래스"""
    
    def __init__(self, source: LogSource, config: Dict[str, Any] = None):
        self.source = source
        self.config = config or {}
        self.active = False
        self.collected_count = 0
        self.error_count = 0
        self.last_error = None
        self.callbacks: List[Callable] = []
        self._stop_event = asyncio.Event()
    
    async def start_collection(self):
        """수집 시작"""
        self.active = True
        self._stop_event.clear()
        logger.info(f"Started {self.source.value} log collection")
    
    async def stop_collection(self):
        """수집 중지"""
        self.active = False
        self._stop_event.set()
        logger.info(f"Stopped {self.source.value} log collection")
    
    def add_callback(self, callback: Callable[[LogEntry], None]):
        """콜백 추가"""
        self.callbacks.append(callback)
    
    async def emit_log(self, entry: LogEntry):
        """로그 엔트리 발생"""
        self.collected_count += 1
        for callback in self.callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(entry)
                else:
                    callback(entry)
            except Exception as e:
                logger.error(f"Callback error in {self.source.value}: {e}")
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """로그 수집 (서브클래스에서 구현)"""
        raise NotImplementedError


class ServerLogCollector(BaseLogCollector):
    """서버 로그 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.SERVER, config)
        self.log_files = config.get('log_files', ['/var/log/apache2/access.log', '/var/log/nginx/access.log'])
        self.follow_mode = config.get('follow_mode', True)
        self.file_positions = {}
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """서버 로그 파일 모니터링"""
        await self.start_collection()
        
        try:
            while self.active:
                for log_file in self.log_files:
                    try:
                        async for entry in self._tail_file(log_file):
                            yield entry
                    except Exception as e:
                        logger.error(f"Error reading {log_file}: {e}")
                        self.error_count += 1
                
                await asyncio.sleep(0.1)  # CPU 부하 방지
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Server log collection error: {e}")
    
    async def _tail_file(self, file_path: str) -> AsyncGenerator[LogEntry, None]:
        """파일 tail 모드로 읽기"""
        try:
            if not Path(file_path).exists():
                return
            
            # 파일 포지션 관리
            if file_path not in self.file_positions:
                self.file_positions[file_path] = 0
            
            async with aiofiles.open(file_path, 'r') as f:
                await f.seek(self.file_positions[file_path])
                
                while self.active:
                    line = await f.readline()
                    if line:
                        self.file_positions[file_path] = await f.tell()
                        entry = self._parse_server_log(line.strip(), file_path)
                        if entry:
                            yield entry
                    else:
                        await asyncio.sleep(0.1)
                        
        except Exception as e:
            logger.error(f"Error tailing file {file_path}: {e}")
    
    def _parse_server_log(self, line: str, file_path: str) -> Optional[LogEntry]:
        """서버 로그 파싱"""
        try:
            # Apache/Nginx 로그 파싱 (간단한 예제)
            # 실제로는 더 정교한 파싱 필요
            patterns = [
                # Apache Combined Log Format
                r'(?P<ip>\S+) \S+ \S+ \[(?P<timestamp>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) (?P<protocol>\S+)" (?P<status>\d+) (?P<size>\S+)',
                # Nginx Log Format
                r'(?P<ip>\S+) - \S+ \[(?P<timestamp>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) (?P<protocol>\S+)" (?P<status>\d+) (?P<size>\d+)'
            ]
            
            for pattern in patterns:
                match = re.match(pattern, line)
                if match:
                    data = match.groupdict()
                    
                    # 타임스탬프 파싱
                    try:
                        timestamp = datetime.strptime(
                            data['timestamp'].split()[0], 
                            '%d/%b/%Y:%H:%M:%S'
                        )
                    except:
                        timestamp = datetime.now()
                    
                    # 로그 레벨 결정
                    status_code = int(data.get('status', 200))
                    if status_code >= 500:
                        level = LogLevel.ERROR
                    elif status_code >= 400:
                        level = LogLevel.WARNING
                    else:
                        level = LogLevel.INFO
                    
                    return LogEntry(
                        id="",
                        timestamp=timestamp,
                        source=LogSource.SERVER,
                        level=level,
                        message=f"{data['method']} {data['path']} - {data['status']}",
                        raw_data=data,
                        metadata={
                            'file_path': file_path,
                            'status_code': status_code,
                            'ip_address': data['ip']
                        }
                    )
            
            # 파싱 실패시 raw 로그로 저장
            return LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.SERVER,
                level=LogLevel.INFO,
                message=line,
                raw_data={'raw_line': line},
                metadata={'file_path': file_path, 'parsed': False}
            )
            
        except Exception as e:
            logger.error(f"Error parsing server log: {e}")
            return None


class TerminalLogCollector(BaseLogCollector):
    """터미널 명령어 및 출력 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.TERMINAL, config)
        self.shell_history_file = config.get('history_file', '~/.bash_history')
        self.monitor_current_session = config.get('monitor_session', True)
        self.last_history_size = 0
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """터미널 로그 수집"""
        await self.start_collection()
        
        try:
            while self.active:
                # 히스토리 파일 모니터링
                async for entry in self._monitor_shell_history():
                    yield entry
                
                # 현재 세션 모니터링 (옵션)
                if self.monitor_current_session:
                    async for entry in self._monitor_current_commands():
                        yield entry
                
                await asyncio.sleep(1)
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Terminal log collection error: {e}")
    
    async def _monitor_shell_history(self) -> AsyncGenerator[LogEntry, None]:
        """쉘 히스토리 파일 모니터링"""
        try:
            history_path = Path(self.shell_history_file).expanduser()
            if not history_path.exists():
                return
            
            stat = history_path.stat()
            current_size = stat.st_size
            
            if current_size > self.last_history_size:
                async with aiofiles.open(history_path, 'r') as f:
                    await f.seek(self.last_history_size)
                    new_content = await f.read()
                    
                    for line in new_content.strip().split('\n'):
                        if line.strip():
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.TERMINAL,
                                level=LogLevel.INFO,
                                message=f"Command: {line}",
                                raw_data={'command': line},
                                metadata={'type': 'shell_history'}
                            )
                
                self.last_history_size = current_size
                
        except Exception as e:
            logger.error(f"Error monitoring shell history: {e}")
    
    async def _monitor_current_commands(self) -> AsyncGenerator[LogEntry, None]:
        """현재 실행 중인 명령어 모니터링"""
        try:
            # 현재 프로세스들 확인
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time']):
                try:
                    proc_info = proc.info
                    if proc_info['cmdline']:
                        command = ' '.join(proc_info['cmdline'])
                        
                        yield LogEntry(
                            id="",
                            timestamp=datetime.fromtimestamp(proc_info['create_time']),
                            source=LogSource.TERMINAL,
                            level=LogLevel.INFO,
                            message=f"Process: {command}",
                            raw_data=proc_info,
                            metadata={'type': 'running_process', 'pid': proc_info['pid']}
                        )
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except Exception as e:
            logger.error(f"Error monitoring current commands: {e}")


class DatabaseLogCollector(BaseLogCollector):
    """데이터베이스 로그 및 성능 메트릭 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.DATABASE, config)
        self.db_configs = config.get('databases', [])
        self.collect_slow_queries = config.get('collect_slow_queries', True)
        self.collect_performance_metrics = config.get('collect_performance', True)
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """데이터베이스 로그 수집"""
        await self.start_collection()
        
        try:
            while self.active:
                for db_config in self.db_configs:
                    async for entry in self._collect_db_logs(db_config):
                        yield entry
                
                await asyncio.sleep(5)  # DB 부하 방지
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Database log collection error: {e}")
    
    async def _collect_db_logs(self, db_config: Dict) -> AsyncGenerator[LogEntry, None]:
        """개별 DB 로그 수집"""
        db_type = db_config.get('type', 'sqlite')
        
        try:
            if db_type == 'sqlite':
                async for entry in self._collect_sqlite_logs(db_config):
                    yield entry
            elif db_type == 'postgresql':
                async for entry in self._collect_postgres_logs(db_config):
                    yield entry
            elif db_type == 'mysql':
                async for entry in self._collect_mysql_logs(db_config):
                    yield entry
                    
        except Exception as e:
            logger.error(f"Error collecting {db_type} logs: {e}")
    
    async def _collect_sqlite_logs(self, config: Dict) -> AsyncGenerator[LogEntry, None]:
        """SQLite 로그 수집"""
        try:
            db_path = config.get('path')
            if not db_path or not Path(db_path).exists():
                return
            
            # 간단한 SQLite 정보 수집
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # 데이터베이스 크기
            cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
            db_size = cursor.fetchone()[0]
            
            yield LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.DATABASE,
                level=LogLevel.INFO,
                message=f"SQLite DB size: {db_size} bytes",
                raw_data={'db_path': db_path, 'size_bytes': db_size},
                metadata={'type': 'database_metrics', 'db_type': 'sqlite'}
            )
            
            conn.close()
            
        except Exception as e:
            logger.error(f"Error collecting SQLite logs: {e}")
    
    async def _collect_postgres_logs(self, config: Dict) -> AsyncGenerator[LogEntry, None]:
        """PostgreSQL 로그 수집 (예제)"""
        # 실제 구현에서는 psycopg2나 asyncpg 사용
        try:
            log_file = config.get('log_file', '/var/log/postgresql/postgresql.log')
            if Path(log_file).exists():
                async with aiofiles.open(log_file, 'r') as f:
                    async for line in f:
                        if 'ERROR' in line or 'WARNING' in line:
                            level = LogLevel.ERROR if 'ERROR' in line else LogLevel.WARNING
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.DATABASE,
                                level=level,
                                message=line.strip(),
                                raw_data={'raw_line': line},
                                metadata={'type': 'postgres_log', 'db_type': 'postgresql'}
                            )
        except Exception as e:
            logger.error(f"Error collecting PostgreSQL logs: {e}")
    
    async def _collect_mysql_logs(self, config: Dict) -> AsyncGenerator[LogEntry, None]:
        """MySQL 로그 수집 (예제)"""
        # 실제 구현에서는 aiomysql 사용
        try:
            error_log = config.get('error_log', '/var/log/mysql/error.log')
            slow_log = config.get('slow_log', '/var/log/mysql/slow.log')
            
            for log_file in [error_log, slow_log]:
                if Path(log_file).exists():
                    async with aiofiles.open(log_file, 'r') as f:
                        async for line in f:
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.DATABASE,
                                level=LogLevel.WARNING,
                                message=line.strip(),
                                raw_data={'raw_line': line},
                                metadata={'type': 'mysql_log', 'db_type': 'mysql'}
                            )
        except Exception as e:
            logger.error(f"Error collecting MySQL logs: {e}")


class DockerLogCollector(BaseLogCollector):
    """Docker 컨테이너 로그 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.DOCKER, config)
        self.client = None
        self.container_filters = config.get('container_filters', {})
        self.follow_logs = config.get('follow_logs', True)
        self.include_stats = config.get('include_stats', True)
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """Docker 로그 수집"""
        await self.start_collection()
        
        try:
            self.client = docker.from_env()
            
            while self.active:
                # 컨테이너 로그 수집
                async for entry in self._collect_container_logs():
                    yield entry
                
                # 컨테이너 통계 수집
                if self.include_stats:
                    async for entry in self._collect_container_stats():
                        yield entry
                
                await asyncio.sleep(2)
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Docker log collection error: {e}")
        finally:
            if self.client:
                self.client.close()
    
    async def _collect_container_logs(self) -> AsyncGenerator[LogEntry, None]:
        """컨테이너 로그 수집"""
        try:
            containers = self.client.containers.list()
            
            for container in containers:
                try:
                    # 최근 로그만 가져오기
                    logs = container.logs(tail=10, timestamps=True)
                    
                    for log_line in logs.decode('utf-8').split('\n'):
                        if log_line.strip():
                            # 타임스탬프 파싱
                            parts = log_line.split(' ', 1)
                            if len(parts) == 2:
                                timestamp_str, message = parts
                                try:
                                    timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                except:
                                    timestamp = datetime.now()
                            else:
                                timestamp = datetime.now()
                                message = log_line
                            
                            yield LogEntry(
                                id="",
                                timestamp=timestamp,
                                source=LogSource.DOCKER,
                                level=LogLevel.INFO,
                                message=message,
                                raw_data={'container_id': container.id, 'container_name': container.name},
                                metadata={
                                    'type': 'container_log',
                                    'container_name': container.name,
                                    'image': container.image.tags[0] if container.image.tags else 'unknown'
                                }
                            )
                            
                except Exception as e:
                    logger.error(f"Error collecting logs from container {container.name}: {e}")
                    
        except Exception as e:
            logger.error(f"Error listing containers: {e}")
    
    async def _collect_container_stats(self) -> AsyncGenerator[LogEntry, None]:
        """컨테이너 통계 수집"""
        try:
            containers = self.client.containers.list()
            
            for container in containers:
                try:
                    stats = container.stats(stream=False)
                    
                    # CPU 사용률 계산
                    cpu_percent = 0
                    if 'cpu_stats' in stats and 'precpu_stats' in stats:
                        cpu_stats = stats['cpu_stats']
                        precpu_stats = stats['precpu_stats']
                        
                        cpu_delta = cpu_stats['cpu_usage']['total_usage'] - precpu_stats['cpu_usage']['total_usage']
                        system_delta = cpu_stats['system_cpu_usage'] - precpu_stats['system_cpu_usage']
                        
                        if system_delta > 0:
                            cpu_percent = (cpu_delta / system_delta) * 100.0
                    
                    # 메모리 사용률
                    memory_usage = stats.get('memory_stats', {}).get('usage', 0)
                    memory_limit = stats.get('memory_stats', {}).get('limit', 0)
                    memory_percent = (memory_usage / memory_limit * 100) if memory_limit > 0 else 0
                    
                    yield LogEntry(
                        id="",
                        timestamp=datetime.now(),
                        source=LogSource.DOCKER,
                        level=LogLevel.INFO,
                        message=f"Container stats: CPU {cpu_percent:.1f}%, Memory {memory_percent:.1f}%",
                        raw_data=stats,
                        metadata={
                            'type': 'container_stats',
                            'container_name': container.name,
                            'cpu_percent': cpu_percent,
                            'memory_percent': memory_percent,
                            'memory_usage': memory_usage
                        }
                    )
                    
                except Exception as e:
                    logger.error(f"Error collecting stats from container {container.name}: {e}")
                    
        except Exception as e:
            logger.error(f"Error collecting container stats: {e}")


class SystemMetricsCollector(BaseLogCollector):
    """시스템 메트릭 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.SYSTEM, config)
        self.collect_interval = config.get('collect_interval', 10)  # seconds
        self.include_processes = config.get('include_processes', True)
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """시스템 메트릭 수집"""
        await self.start_collection()
        
        try:
            while self.active:
                # 시스템 메트릭 수집
                async for entry in self._collect_system_metrics():
                    yield entry
                
                await asyncio.sleep(self.collect_interval)
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"System metrics collection error: {e}")
    
    async def _collect_system_metrics(self) -> AsyncGenerator[LogEntry, None]:
        """시스템 메트릭 수집"""
        try:
            # CPU 사용률
            cpu_percent = psutil.cpu_percent(interval=1)
            yield LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.SYSTEM,
                level=LogLevel.INFO,
                message=f"CPU usage: {cpu_percent}%",
                raw_data={'cpu_percent': cpu_percent},
                metadata={'type': 'cpu_metrics', 'metric_name': 'cpu_usage'}
            )
            
            # 메모리 사용률
            memory = psutil.virtual_memory()
            yield LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.SYSTEM,
                level=LogLevel.INFO,
                message=f"Memory usage: {memory.percent}%",
                raw_data={'memory_percent': memory.percent, 'memory_available': memory.available},
                metadata={'type': 'memory_metrics', 'metric_name': 'memory_usage'}
            )
            
            # 디스크 사용률
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            yield LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.SYSTEM,
                level=LogLevel.INFO,
                message=f"Disk usage: {disk_percent:.1f}%",
                raw_data={'disk_percent': disk_percent, 'disk_free': disk.free},
                metadata={'type': 'disk_metrics', 'metric_name': 'disk_usage'}
            )
            
            # 네트워크 I/O
            net_io = psutil.net_io_counters()
            yield LogEntry(
                id="",
                timestamp=datetime.now(),
                source=LogSource.SYSTEM,
                level=LogLevel.INFO,
                message=f"Network I/O: {net_io.bytes_sent} sent, {net_io.bytes_recv} received",
                raw_data={'bytes_sent': net_io.bytes_sent, 'bytes_recv': net_io.bytes_recv},
                metadata={'type': 'network_metrics', 'metric_name': 'network_io'}
            )
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")


class WebConsoleCollector(BaseLogCollector):
    """웹 콘솔 로그 수집기 (WebSocket 기반)"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.WEB_CONSOLE, config)
        self.websocket_url = config.get('websocket_url', 'ws://localhost:8080/console')
        self.http_endpoints = config.get('http_endpoints', [])
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """웹 콘솔 로그 수집"""
        await self.start_collection()
        
        try:
            # WebSocket을 통한 실시간 로그 수집
            async for entry in self._collect_websocket_logs():
                yield entry
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Web console log collection error: {e}")
    
    async def _collect_websocket_logs(self) -> AsyncGenerator[LogEntry, None]:
        """WebSocket을 통한 실시간 로그 수집"""
        try:
            async with websockets.connect(self.websocket_url) as websocket:
                while self.active:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        
                        # JSON 메시지 파싱
                        try:
                            data = json.loads(message)
                            
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.WEB_CONSOLE,
                                level=LogLevel.INFO,
                                message=data.get('message', message),
                                raw_data=data,
                                metadata={'type': 'websocket_log', 'source_url': self.websocket_url}
                            )
                            
                        except json.JSONDecodeError:
                            # JSON이 아닌 메시지
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.WEB_CONSOLE,
                                level=LogLevel.INFO,
                                message=message,
                                raw_data={'raw_message': message},
                                metadata={'type': 'websocket_raw', 'source_url': self.websocket_url}
                            )
                            
                    except asyncio.TimeoutError:
                        continue
                    except websockets.exceptions.ConnectionClosed:
                        logger.warning("WebSocket connection closed, attempting to reconnect...")
                        break
                        
        except Exception as e:
            logger.error(f"WebSocket collection error: {e}")


class BrowserPerformanceCollector(BaseLogCollector):
    """브라우저 성능 및 사용자 경험 메트릭 수집기"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(LogSource.BROWSER, config)
        self.performance_api_url = config.get('performance_api_url', 'http://localhost:3000/api/performance')
        self.user_analytics_url = config.get('analytics_url', 'http://localhost:3000/api/analytics')
    
    async def collect_logs(self) -> AsyncGenerator[LogEntry, None]:
        """브라우저 성능 로그 수집"""
        await self.start_collection()
        
        try:
            while self.active:
                # 성능 메트릭 수집
                async for entry in self._collect_performance_metrics():
                    yield entry
                
                # 사용자 분석 데이터 수집
                async for entry in self._collect_user_analytics():
                    yield entry
                
                await asyncio.sleep(30)  # 30초 간격
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Browser performance collection error: {e}")
    
    async def _collect_performance_metrics(self) -> AsyncGenerator[LogEntry, None]:
        """성능 메트릭 수집"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.performance_api_url) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        for metric in data.get('metrics', []):
                            yield LogEntry(
                                id="",
                                timestamp=datetime.now(),
                                source=LogSource.BROWSER,
                                level=LogLevel.INFO,
                                message=f"Performance: {metric.get('name')} = {metric.get('value')}",
                                raw_data=metric,
                                metadata={
                                    'type': 'performance_metric',
                                    'metric_name': metric.get('name'),
                                    'page_url': metric.get('page_url')
                                }
                            )
                            
        except Exception as e:
            logger.error(f"Error collecting performance metrics: {e}")
    
    async def _collect_user_analytics(self) -> AsyncGenerator[LogEntry, None]:
        """사용자 분석 데이터 수집"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.user_analytics_url) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        for event in data.get('events', []):
                            yield LogEntry(
                                id="",
                                timestamp=datetime.fromisoformat(event.get('timestamp', datetime.now().isoformat())),
                                source=LogSource.BROWSER,
                                level=LogLevel.INFO,
                                message=f"User event: {event.get('type')} on {event.get('element')}",
                                raw_data=event,
                                metadata={
                                    'type': 'user_analytics',
                                    'event_type': event.get('type'),
                                    'user_id': event.get('user_id')
                                }
                            )
                            
        except Exception as e:
            logger.error(f"Error collecting user analytics: {e}")


# 메인 로그 수집기 클래스
class MultiSourceLogCollector:
    """멀티소스 로그 수집 및 통합 관리자"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.collectors: Dict[LogSource, BaseLogCollector] = {}
        self.log_buffer = deque(maxlen=10000)  # 최대 10,000개 로그 버퍼
        self.correlation_analyzer = CorrelationAnalyzer()
        self.anomaly_detector = AnomalyDetector()
        self.active_streams: Dict[LogSource, LogStream] = {}
        self.callbacks: List[Callable] = []
        self.background_tasks: Set[asyncio.Task] = set()
        self._stop_event = asyncio.Event()
        
        # 통계
        self.total_collected = 0
        self.errors_count = 0
        self.start_time = None
        
        # 초기화
        self._initialize_collectors()
    
    def _initialize_collectors(self):
        """수집기들 초기화"""
        collector_configs = self.config.get('collectors', {})
        
        # 각 소스별 수집기 생성
        if collector_configs.get('server', {}).get('enabled', True):
            self.collectors[LogSource.SERVER] = ServerLogCollector(
                collector_configs.get('server', {})
            )
        
        if collector_configs.get('terminal', {}).get('enabled', True):
            self.collectors[LogSource.TERMINAL] = TerminalLogCollector(
                collector_configs.get('terminal', {})
            )
        
        if collector_configs.get('database', {}).get('enabled', True):
            self.collectors[LogSource.DATABASE] = DatabaseLogCollector(
                collector_configs.get('database', {})
            )
        
        if collector_configs.get('docker', {}).get('enabled', True):
            self.collectors[LogSource.DOCKER] = DockerLogCollector(
                collector_configs.get('docker', {})
            )
        
        if collector_configs.get('system', {}).get('enabled', True):
            self.collectors[LogSource.SYSTEM] = SystemMetricsCollector(
                collector_configs.get('system', {})
            )
        
        if collector_configs.get('web_console', {}).get('enabled', False):
            self.collectors[LogSource.WEB_CONSOLE] = WebConsoleCollector(
                collector_configs.get('web_console', {})
            )
        
        if collector_configs.get('browser', {}).get('enabled', False):
            self.collectors[LogSource.BROWSER] = BrowserPerformanceCollector(
                collector_configs.get('browser', {})
            )
        
        # 각 수집기에 콜백 등록
        for collector in self.collectors.values():
            collector.add_callback(self._on_log_entry)
    
    async def _on_log_entry(self, entry: LogEntry):
        """로그 엔트리 수신 시 호출되는 콜백"""
        # 버퍼에 추가
        self.log_buffer.append(entry)
        self.total_collected += 1
        
        # 상관관계 분석
        correlated_logs = await self.correlation_analyzer.find_correlations(entry, list(self.log_buffer))
        
        # 이상 징후 탐지
        anomalies = await self.anomaly_detector.detect_anomalies([entry], list(self.log_buffer))
        
        # 외부 콜백 호출
        for callback in self.callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(entry, correlated_logs, anomalies)
                else:
                    callback(entry, correlated_logs, anomalies)
            except Exception as e:
                logger.error(f"Callback error: {e}")
                self.errors_count += 1
    
    def add_callback(self, callback: Callable):
        """외부 콜백 추가"""
        self.callbacks.append(callback)
    
    async def start_real_time_collection(self) -> Dict[LogSource, LogStream]:
        """실시간 로그 수집 시작"""
        self.start_time = datetime.now()
        self._stop_event.clear()
        
        logger.info("Starting multi-source log collection...")
        
        # 각 수집기 시작
        for source, collector in self.collectors.items():
            try:
                task = asyncio.create_task(self._run_collector(source, collector))
                self.background_tasks.add(task)
                task.add_done_callback(self.background_tasks.discard)
                
                self.active_streams[source] = LogStream(
                    source=source,
                    active=True,
                    last_update=datetime.now(),
                    total_collected=0,
                    error_count=0,
                    collector_instance=collector
                )
                
                logger.info(f"Started {source.value} collector")
                
            except Exception as e:
                logger.error(f"Failed to start {source.value} collector: {e}")
                self.errors_count += 1
        
        return self.active_streams
    
    async def _run_collector(self, source: LogSource, collector: BaseLogCollector):
        """개별 수집기 실행"""
        try:
            async for log_entry in collector.collect_logs():
                if self._stop_event.is_set():
                    break
                
                # 스트림 정보 업데이트
                if source in self.active_streams:
                    stream = self.active_streams[source]
                    stream.last_update = datetime.now()
                    stream.total_collected += 1
                
        except Exception as e:
            logger.error(f"Error in {source.value} collector: {e}")
            if source in self.active_streams:
                self.active_streams[source].error_count += 1
        finally:
            if source in self.active_streams:
                self.active_streams[source].active = False
    
    async def stop_collection(self):
        """로그 수집 중지"""
        logger.info("Stopping multi-source log collection...")
        
        self._stop_event.set()
        
        # 각 수집기 중지
        for collector in self.collectors.values():
            await collector.stop_collection()
        
        # 백그라운드 태스크 정리
        if self.background_tasks:
            await asyncio.gather(*self.background_tasks, return_exceptions=True)
        
        # 스트림 상태 업데이트
        for stream in self.active_streams.values():
            stream.active = False
        
        logger.info("Multi-source log collection stopped")
    
    def correlate_logs_by_timestamp(self, logs: List[LogEntry], time_window: timedelta = timedelta(seconds=30)) -> List[CorrelatedLogs]:
        """타임스탬프 기반 로그 상관관계 분석"""
        correlated_groups = []
        processed_ids = set()
        
        for primary_log in logs:
            if primary_log.id in processed_ids:
                continue
            
            related_logs = []
            window_start = primary_log.timestamp - time_window
            window_end = primary_log.timestamp + time_window
            
            for other_log in logs:
                if (other_log.id != primary_log.id and 
                    other_log.id not in processed_ids and
                    window_start <= other_log.timestamp <= window_end):
                    
                    # 상관관계 강도 계산
                    correlation_strength = self._calculate_correlation_strength(primary_log, other_log)
                    
                    if correlation_strength > 0.3:  # 임계값
                        related_logs.append(other_log)
                        processed_ids.add(other_log.id)
            
            if related_logs:
                correlated_group = CorrelatedLogs(
                    primary_entry=primary_log,
                    related_entries=related_logs,
                    correlation_strength=sum(self._calculate_correlation_strength(primary_log, log) for log in related_logs) / len(related_logs),
                    correlation_type='temporal',
                    time_window=time_window
                )
                correlated_groups.append(correlated_group)
                processed_ids.add(primary_log.id)
        
        return correlated_groups
    
    def _calculate_correlation_strength(self, log1: LogEntry, log2: LogEntry) -> float:
        """두 로그 간 상관관계 강도 계산"""
        strength = 0.0
        
        # 같은 소스면 강도 증가
        if log1.source == log2.source:
            strength += 0.3
        
        # 같은 사용자/세션이면 강도 증가
        if log1.user_id and log1.user_id == log2.user_id:
            strength += 0.4
        if log1.session_id and log1.session_id == log2.session_id:
            strength += 0.3
        
        # 메시지 유사성 검사 (간단한 키워드 매칭)
        common_keywords = self._find_common_keywords(log1.message, log2.message)
        if common_keywords:
            strength += min(0.4, len(common_keywords) * 0.1)
        
        return min(strength, 1.0)
    
    def _find_common_keywords(self, message1: str, message2: str) -> Set[str]:
        """두 메시지에서 공통 키워드 찾기"""
        # 간단한 키워드 추출 (실제로는 더 정교한 NLP 필요)
        words1 = set(re.findall(r'\w+', message1.lower()))
        words2 = set(re.findall(r'\w+', message2.lower()))
        
        # 일반적인 단어 제외
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'}
        
        common = (words1 & words2) - stop_words
        return {word for word in common if len(word) > 2}  # 3글자 이상만
    
    def detect_anomalies_across_sources(self, logs: List[LogEntry]) -> List[Anomaly]:
        """다중 소스 간 이상 패턴 탐지"""
        anomalies = []
        
        # 소스별 로그 분류
        logs_by_source = defaultdict(list)
        for log in logs:
            logs_by_source[log.source].append(log)
        
        # 에러 급증 탐지
        anomalies.extend(self._detect_error_spikes(logs_by_source))
        
        # 성능 이상 탐지
        anomalies.extend(self._detect_performance_anomalies(logs_by_source))
        
        # 패턴 이상 탐지
        anomalies.extend(self._detect_pattern_anomalies(logs))
        
        return anomalies
    
    def _detect_error_spikes(self, logs_by_source: Dict[LogSource, List[LogEntry]]) -> List[Anomaly]:
        """에러 급증 탐지"""
        anomalies = []
        
        for source, logs in logs_by_source.items():
            error_logs = [log for log in logs if log.level in [LogLevel.ERROR, LogLevel.CRITICAL]]
            
            if len(error_logs) > 5:  # 임계값: 5개 이상 에러
                anomaly = Anomaly(
                    id=str(uuid.uuid4()),
                    type=AnomalyType.ERROR_SPIKE,
                    severity=min(1.0, len(error_logs) / 10),  # 10개면 최대 심각도
                    source=source,
                    detected_at=datetime.now(),
                    description=f"Error spike detected in {source.value}: {len(error_logs)} errors",
                    affected_entries=[log.id for log in error_logs],
                    confidence=0.8,
                    suggested_actions=[
                        f"Investigate {source.value} system health",
                        "Check recent deployments or changes",
                        "Monitor error patterns for root cause"
                    ]
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    def _detect_performance_anomalies(self, logs_by_source: Dict[LogSource, List[LogEntry]]) -> List[Anomaly]:
        """성능 이상 탐지"""
        anomalies = []
        
        # 시스템 메트릭 확인
        if LogSource.SYSTEM in logs_by_source:
            system_logs = logs_by_source[LogSource.SYSTEM]
            
            for log in system_logs:
                if log.metadata.get('type') == 'cpu_metrics':
                    cpu_percent = log.raw_data.get('cpu_percent', 0)
                    if cpu_percent > 90:  # CPU 90% 이상
                        anomaly = Anomaly(
                            id=str(uuid.uuid4()),
                            type=AnomalyType.PERFORMANCE,
                            severity=cpu_percent / 100,
                            source=LogSource.SYSTEM,
                            detected_at=datetime.now(),
                            description=f"High CPU usage detected: {cpu_percent}%",
                            affected_entries=[log.id],
                            confidence=0.9,
                            suggested_actions=[
                                "Identify CPU-intensive processes",
                                "Check for resource leaks",
                                "Consider scaling resources"
                            ]
                        )
                        anomalies.append(anomaly)
                
                elif log.metadata.get('type') == 'memory_metrics':
                    memory_percent = log.raw_data.get('memory_percent', 0)
                    if memory_percent > 85:  # 메모리 85% 이상
                        anomaly = Anomaly(
                            id=str(uuid.uuid4()),
                            type=AnomalyType.PERFORMANCE,
                            severity=memory_percent / 100,
                            source=LogSource.SYSTEM,
                            detected_at=datetime.now(),
                            description=f"High memory usage detected: {memory_percent}%",
                            affected_entries=[log.id],
                            confidence=0.9,
                            suggested_actions=[
                                "Identify memory-intensive processes",
                                "Check for memory leaks",
                                "Consider adding memory"
                            ]
                        )
                        anomalies.append(anomaly)
        
        return anomalies
    
    def _detect_pattern_anomalies(self, logs: List[LogEntry]) -> List[Anomaly]:
        """패턴 이상 탐지"""
        anomalies = []
        
        # 비정상적인 시간대 활동 탐지
        night_logs = [log for log in logs if 2 <= log.timestamp.hour <= 6]  # 새벽 2-6시
        if len(night_logs) > 10:  # 새벽에 너무 많은 활동
            anomaly = Anomaly(
                id=str(uuid.uuid4()),
                type=AnomalyType.UNUSUAL_PATTERN,
                severity=0.6,
                source=LogSource.SYSTEM,  # 일반적인 소스로 설정
                detected_at=datetime.now(),
                description=f"Unusual night-time activity: {len(night_logs)} logs between 2-6 AM",
                affected_entries=[log.id for log in night_logs],
                confidence=0.7,
                suggested_actions=[
                    "Investigate scheduled jobs or automated processes",
                    "Check for unauthorized access",
                    "Review system maintenance schedules"
                ]
            )
            anomalies.append(anomaly)
        
        return anomalies
    
    def create_unified_log_format(self, raw_logs: List[LogEntry]) -> UnifiedLog:
        """통합 로그 포맷으로 변환"""
        if not raw_logs:
            return UnifiedLog(entries=[])
        
        # 상관관계 맵 생성
        correlation_map = {}
        correlated_groups = self.correlate_logs_by_timestamp(raw_logs)
        
        for group in correlated_groups:
            primary_id = group.primary_entry.id
            related_ids = [entry.id for entry in group.related_entries]
            correlation_map[primary_id] = related_ids
        
        return UnifiedLog(
            entries=raw_logs,
            correlation_map=correlation_map
        )
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """수집 통계 반환"""
        runtime = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        return {
            'total_collected': self.total_collected,
            'errors_count': self.errors_count,
            'runtime_seconds': runtime,
            'collection_rate': self.total_collected / runtime if runtime > 0 else 0,
            'buffer_size': len(self.log_buffer),
            'active_sources': len([s for s in self.active_streams.values() if s.active]),
            'source_stats': {
                source.value: {
                    'active': stream.active,
                    'total_collected': stream.total_collected,
                    'error_count': stream.error_count,
                    'last_update': stream.last_update.isoformat() if stream.last_update else None
                }
                for source, stream in self.active_streams.items()
            }
        }
    
    async def export_logs(self, 
                         output_file: str, 
                         format: str = 'json',
                         time_range: Optional[Tuple[datetime, datetime]] = None,
                         sources: Optional[List[LogSource]] = None) -> bool:
        """로그 내보내기"""
        try:
            # 필터링
            logs_to_export = list(self.log_buffer)
            
            if time_range:
                start_time, end_time = time_range
                logs_to_export = [
                    log for log in logs_to_export
                    if start_time <= log.timestamp <= end_time
                ]
            
            if sources:
                logs_to_export = [
                    log for log in logs_to_export
                    if log.source in sources
                ]
            
            # 내보내기
            if format == 'json':
                unified_log = self.create_unified_log_format(logs_to_export)
                
                async with aiofiles.open(output_file, 'w') as f:
                    await f.write(json.dumps(asdict(unified_log), default=str, indent=2))
            
            elif format == 'csv':
                import csv
                import io
                
                output = io.StringIO()
                writer = csv.writer(output)
                
                # 헤더
                writer.writerow(['timestamp', 'source', 'level', 'message', 'metadata'])
                
                # 데이터
                for log in logs_to_export:
                    writer.writerow([
                        log.timestamp.isoformat(),
                        log.source.value,
                        log.level.value,
                        log.message,
                        json.dumps(log.metadata)
                    ])
                
                async with aiofiles.open(output_file, 'w') as f:
                    await f.write(output.getvalue())
            
            logger.info(f"Exported {len(logs_to_export)} logs to {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error exporting logs: {e}")
            return False


# 상관관계 분석기
class CorrelationAnalyzer:
    """로그 상관관계 분석기"""
    
    def __init__(self):
        self.pattern_cache = {}
        self.correlation_history = deque(maxlen=1000)
    
    async def find_correlations(self, target_log: LogEntry, context_logs: List[LogEntry]) -> List[CorrelatedLogs]:
        """특정 로그와 관련된 상관관계 찾기"""
        correlations = []
        
        # 시간 기반 상관관계
        time_window = timedelta(minutes=5)
        time_correlations = self._find_temporal_correlations(target_log, context_logs, time_window)
        correlations.extend(time_correlations)
        
        # 패턴 기반 상관관계
        pattern_correlations = self._find_pattern_correlations(target_log, context_logs)
        correlations.extend(pattern_correlations)
        
        # 인과관계 추론
        causal_correlations = self._find_causal_correlations(target_log, context_logs)
        correlations.extend(causal_correlations)
        
        return correlations
    
    def _find_temporal_correlations(self, target_log: LogEntry, context_logs: List[LogEntry], time_window: timedelta) -> List[CorrelatedLogs]:
        """시간 기반 상관관계 찾기"""
        correlations = []
        
        window_start = target_log.timestamp - time_window
        window_end = target_log.timestamp + time_window
        
        related_logs = [
            log for log in context_logs
            if (log.id != target_log.id and 
                window_start <= log.timestamp <= window_end)
        ]
        
        if related_logs:
            correlation = CorrelatedLogs(
                primary_entry=target_log,
                related_entries=related_logs,
                correlation_strength=0.7,  # 시간 기반은 중간 강도
                correlation_type='temporal',
                time_window=time_window
            )
            correlations.append(correlation)
        
        return correlations
    
    def _find_pattern_correlations(self, target_log: LogEntry, context_logs: List[LogEntry]) -> List[CorrelatedLogs]:
        """패턴 기반 상관관계 찾기"""
        correlations = []
        
        # 메시지 패턴 유사성
        target_keywords = self._extract_keywords(target_log.message)
        
        similar_logs = []
        for log in context_logs:
            if log.id != target_log.id:
                log_keywords = self._extract_keywords(log.message)
                similarity = self._calculate_keyword_similarity(target_keywords, log_keywords)
                
                if similarity > 0.5:  # 50% 이상 유사
                    similar_logs.append(log)
        
        if similar_logs:
            correlation = CorrelatedLogs(
                primary_entry=target_log,
                related_entries=similar_logs,
                correlation_strength=0.8,  # 패턴 기반은 높은 강도
                correlation_type='pattern',
                time_window=timedelta(hours=1)  # 패턴은 더 긴 시간 윈도우
            )
            correlations.append(correlation)
        
        return correlations
    
    def _find_causal_correlations(self, target_log: LogEntry, context_logs: List[LogEntry]) -> List[CorrelatedLogs]:
        """인과관계 상관관계 찾기"""
        correlations = []
        
        # 에러 로그 이후의 관련 로그들 찾기
        if target_log.level in [LogLevel.ERROR, LogLevel.CRITICAL]:
            # 에러 이후 5분 내의 로그들
            after_error_window = timedelta(minutes=5)
            after_logs = [
                log for log in context_logs
                if (log.timestamp > target_log.timestamp and 
                    log.timestamp <= target_log.timestamp + after_error_window and
                    log.source != target_log.source)  # 다른 소스에서의 반응
            ]
            
            if after_logs:
                correlation = CorrelatedLogs(
                    primary_entry=target_log,
                    related_entries=after_logs,
                    correlation_strength=0.9,  # 인과관계는 가장 높은 강도
                    correlation_type='causal',
                    time_window=after_error_window
                )
                correlations.append(correlation)
        
        return correlations
    
    def _extract_keywords(self, message: str) -> Set[str]:
        """메시지에서 키워드 추출"""
        # 간단한 키워드 추출 (실제로는 더 정교한 NLP 필요)
        words = re.findall(r'\w+', message.lower())
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
                      'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did'}
        
        return {word for word in words if len(word) > 2 and word not in stop_words}
    
    def _calculate_keyword_similarity(self, keywords1: Set[str], keywords2: Set[str]) -> float:
        """키워드 집합 간 유사도 계산"""
        if not keywords1 or not keywords2:
            return 0.0
        
        intersection = keywords1 & keywords2
        union = keywords1 | keywords2
        
        return len(intersection) / len(union) if union else 0.0


# 이상 징후 탐지기
class AnomalyDetector:
    """이상 징후 탐지기"""
    
    def __init__(self):
        self.baseline_metrics = {}
        self.detection_history = deque(maxlen=500)
        self.adaptive_thresholds = {}
    
    async def detect_anomalies(self, new_logs: List[LogEntry], historical_logs: List[LogEntry]) -> List[Anomaly]:
        """이상 징후 탐지"""
        anomalies = []
        
        # 통계적 이상 탐지
        anomalies.extend(self._detect_statistical_anomalies(new_logs, historical_logs))
        
        # 임계값 기반 탐지
        anomalies.extend(self._detect_threshold_anomalies(new_logs))
        
        # 패턴 기반 탐지
        anomalies.extend(self._detect_pattern_anomalies(new_logs, historical_logs))
        
        # 시계열 이상 탐지
        anomalies.extend(self._detect_time_series_anomalies(new_logs, historical_logs))
        
        # 탐지된 이상 징후를 히스토리에 저장
        self.detection_history.extend(anomalies)
        
        return anomalies
    
    def _detect_statistical_anomalies(self, new_logs: List[LogEntry], historical_logs: List[LogEntry]) -> List[Anomaly]:
        """통계적 이상 탐지"""
        anomalies = []
        
        # 소스별 로그 빈도 분석
        new_source_counts = defaultdict(int)
        historical_source_counts = defaultdict(int)
        
        for log in new_logs:
            new_source_counts[log.source] += 1
        
        for log in historical_logs[-1000:]:  # 최근 1000개만 분석
            historical_source_counts[log.source] += 1
        
        # 각 소스별로 이상 빈도 확인
        for source in new_source_counts:
            new_count = new_source_counts[source]
            historical_avg = historical_source_counts.get(source, 0) / max(1, len(historical_logs[-1000:]) / 100)  # 평균적인 빈도
            
            # Z-score 기반 이상 탐지
            if historical_avg > 0 and new_count > historical_avg * 3:  # 3배 이상 증가
                anomaly = Anomaly(
                    id=str(uuid.uuid4()),
                    type=AnomalyType.UNUSUAL_PATTERN,
                    severity=min(1.0, new_count / (historical_avg * 5)),
                    source=source,
                    detected_at=datetime.now(),
                    description=f"Unusual log frequency for {source.value}: {new_count} vs average {historical_avg:.1f}",
                    affected_entries=[log.id for log in new_logs if log.source == source],
                    confidence=0.8,
                    suggested_actions=[
                        f"Investigate {source.value} system behavior",
                        "Check for configuration changes",
                        "Monitor system resources"
                    ]
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    def _detect_threshold_anomalies(self, logs: List[LogEntry]) -> List[Anomaly]:
        """임계값 기반 이상 탐지"""
        anomalies = []
        
        # 시스템 메트릭 임계값 확인
        for log in logs:
            if log.source == LogSource.SYSTEM:
                metric_type = log.metadata.get('metric_name')
                
                if metric_type == 'cpu_usage':
                    cpu_percent = log.raw_data.get('cpu_percent', 0)
                    if cpu_percent > 95:  # CPU 95% 이상
                        anomalies.append(self._create_threshold_anomaly(
                            log, 'cpu_usage', cpu_percent, 95, 
                            "Critical CPU usage detected"
                        ))
                
                elif metric_type == 'memory_usage':
                    memory_percent = log.raw_data.get('memory_percent', 0)
                    if memory_percent > 90:  # 메모리 90% 이상
                        anomalies.append(self._create_threshold_anomaly(
                            log, 'memory_usage', memory_percent, 90,
                            "Critical memory usage detected"
                        ))
                
                elif metric_type == 'disk_usage':
                    disk_percent = log.raw_data.get('disk_percent', 0)
                    if disk_percent > 85:  # 디스크 85% 이상
                        anomalies.append(self._create_threshold_anomaly(
                            log, 'disk_usage', disk_percent, 85,
                            "High disk usage detected"
                        ))
        
        return anomalies
    
    def _create_threshold_anomaly(self, log: LogEntry, metric_name: str, 
                                value: float, threshold: float, description: str) -> Anomaly:
        """임계값 기반 이상 징후 생성"""
        return Anomaly(
            id=str(uuid.uuid4()),
            type=AnomalyType.THRESHOLD_BREACH,
            severity=min(1.0, value / (threshold * 1.2)),  # 임계값의 120%를 최대 심각도로
            source=log.source,
            detected_at=datetime.now(),
            description=f"{description}: {value}% (threshold: {threshold}%)",
            affected_entries=[log.id],
            confidence=0.95,
            suggested_actions=[
                f"Immediate action required for {metric_name}",
                "Scale resources if possible",
                "Identify resource-intensive processes"
            ],
            metadata={'metric_name': metric_name, 'value': value, 'threshold': threshold}
        )
    
    def _detect_pattern_anomalies(self, new_logs: List[LogEntry], historical_logs: List[LogEntry]) -> List[Anomaly]:
        """패턴 기반 이상 탐지"""
        anomalies = []
        
        # 에러 패턴 급변 탐지
        error_patterns = self._extract_error_patterns(new_logs)
        historical_error_patterns = self._extract_error_patterns(historical_logs[-500:])  # 최근 500개
        
        # 새로운 에러 패턴 탐지
        new_patterns = set(error_patterns.keys()) - set(historical_error_patterns.keys())
        
        for pattern in new_patterns:
            if error_patterns[pattern] > 3:  # 새로운 패턴이 3번 이상 발생
                related_logs = [log for log in new_logs if pattern in log.message]
                
                anomaly = Anomaly(
                    id=str(uuid.uuid4()),
                    type=AnomalyType.UNUSUAL_PATTERN,
                    severity=min(1.0, error_patterns[pattern] / 10),
                    source=related_logs[0].source if related_logs else LogSource.SYSTEM,
                    detected_at=datetime.now(),
                    description=f"New error pattern detected: '{pattern}' ({error_patterns[pattern]} occurrences)",
                    affected_entries=[log.id for log in related_logs],
                    confidence=0.75,
                    suggested_actions=[
                        "Investigate new error pattern",
                        "Check recent code deployments",
                        "Review system changes"
                    ],
                    metadata={'error_pattern': pattern, 'occurrence_count': error_patterns[pattern]}
                )
                anomalies.append(anomaly)
        
        return anomalies
    
    def _extract_error_patterns(self, logs: List[LogEntry]) -> Dict[str, int]:
        """에러 로그에서 패턴 추출"""
        patterns = defaultdict(int)
        
        error_logs = [log for log in logs if log.level in [LogLevel.ERROR, LogLevel.CRITICAL]]
        
        for log in error_logs:
            # 간단한 패턴 추출 (실제로는 더 정교한 패턴 매칭 필요)
            # 에러 메시지에서 중요한 키워드들 추출
            keywords = re.findall(r'\b[A-Z][a-zA-Z]*Error\b|\b[A-Z][a-zA-Z]*Exception\b|\bfailed\b|\berror\b', log.message, re.IGNORECASE)
            
            for keyword in keywords:
                patterns[keyword.lower()] += 1
        
        return dict(patterns)
    
    def _detect_time_series_anomalies(self, new_logs: List[LogEntry], historical_logs: List[LogEntry]) -> List[Anomaly]:
        """시계열 이상 탐지"""
        anomalies = []
        
        # 시간대별 로그 분포 분석
        current_hour = datetime.now().hour
        
        # 현재 시간대의 히스토리컬 데이터
        historical_current_hour = [
            log for log in historical_logs
            if log.timestamp.hour == current_hour
        ]
        
        # 평균 로그 수와 비교
        if historical_current_hour:
            historical_avg = len(historical_current_hour) / max(1, len(set(log.timestamp.date() for log in historical_current_hour)))
            current_count = len(new_logs)
            
            # 현재 로그 수가 평균의 50% 미만이거나 300% 이상인 경우
            if current_count < historical_avg * 0.5 or current_count > historical_avg * 3:
                severity_type = "low" if current_count < historical_avg * 0.5 else "high"
                
                anomaly = Anomaly(
                    id=str(uuid.uuid4()),
                    type=AnomalyType.UNUSUAL_PATTERN,
                    severity=0.6,
                    source=LogSource.SYSTEM,
                    detected_at=datetime.now(),
                    description=f"Unusual log volume for hour {current_hour}: {current_count} vs average {historical_avg:.1f} ({severity_type})",
                    affected_entries=[log.id for log in new_logs],
                    confidence=0.7,
                    suggested_actions=[
                        "Investigate system activity patterns",
                        "Check for scheduled maintenance or jobs",
                        "Verify system availability"
                    ],
                    metadata={'hour': current_hour, 'current_count': current_count, 'historical_avg': historical_avg}
                )
                anomalies.append(anomaly)
        
        return anomalies


# 메인 실행 및 설정 관리 클래스
class LogCollectionManager:
    """로그 수집 관리자"""
    
    def __init__(self, config_file: str = None):
        self.config = self._load_config(config_file)
        self.collector = MultiSourceLogCollector(self.config)
        self.llm_processor = None  # LLM 처리기 (추후 연동)
        self._running = False
        
        # 시그널 핸들러 등록
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """설정 파일 로드"""
        default_config = {
            'collectors': {
                'server': {
                    'enabled': True,
                    'log_files': ['/var/log/apache2/access.log', '/var/log/nginx/access.log'],
                    'follow_mode': True
                },
                'terminal': {
                    'enabled': True,
                    'history_file': '~/.bash_history',
                    'monitor_session': True
                },
                'database': {
                    'enabled': True,
                    'databases': [
                        {'type': 'sqlite', 'path': './app.db'}
                    ]
                },
                'docker': {
                    'enabled': True,
                    'include_stats': True
                },
                'system': {
                    'enabled': True,
                    'collect_interval': 10
                },
                'web_console': {
                    'enabled': False,
                    'websocket_url': 'ws://localhost:8080/console'
                },
                'browser': {
                    'enabled': False,
                    'performance_api_url': 'http://localhost:3000/api/performance'
                }
            },
            'output': {
                'buffer_size': 10000,
                'export_interval': 300,  # 5분마다 내보내기
                'export_format': 'json'
            },
            'anomaly_detection': {
                'enabled': True,
                'sensitivity': 0.7,
                'min_confidence': 0.5
            }
        }
        
        if config_file and Path(config_file).exists():
            try:
                with open(config_file, 'r') as f:
                    user_config = json.load(f)
                    # 깊은 병합
                    self._deep_merge(default_config, user_config)
            except Exception as e:
                logger.error(f"Error loading config file {config_file}: {e}")
        
        return default_config
    
    def _deep_merge(self, base_dict: Dict, update_dict: Dict):
        """딕셔너리 깊은 병합"""
        for key, value in update_dict.items():
            if key in base_dict and isinstance(base_dict[key], dict) and isinstance(value, dict):
                self._deep_merge(base_dict[key], value)
            else:
                base_dict[key] = value
    
    def _signal_handler(self, signum, frame):
        """시그널 핸들러"""
        logger.info(f"Received signal {signum}, shutting down...")
        self._running = False
    
    async def start(self):
        """로그 수집 시작"""
        logger.info("Starting Multi-Source Log Collection Manager...")
        self._running = True
        
        # 로그 수집 콜백 등록
        self.collector.add_callback(self._process_collected_logs)
        
        # 실시간 수집 시작
        streams = await self.collector.start_real_time_collection()
        logger.info(f"Started collection from {len(streams)} sources")
        
        # 주기적 작업들
        export_task = asyncio.create_task(self._periodic_export())
        stats_task = asyncio.create_task(self._periodic_stats())
        
        try:
            # 메인 루프
            while self._running:
                await asyncio.sleep(1)
                
                # 활성 스트림 체크
                active_count = len([s for s in streams.values() if s.active])
                if active_count == 0:
                    logger.warning("No active log streams, checking collectors...")
                
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        finally:
            # 정리 작업
            export_task.cancel()
            stats_task.cancel()
            await self.collector.stop_collection()
            
            logger.info("Multi-Source Log Collection Manager stopped")
    
    async def _process_collected_logs(self, log_entry: LogEntry, 
                                    correlated_logs: List[CorrelatedLogs], 
                                    anomalies: List[Anomaly]):
        """수집된 로그 처리"""
        # 이상 징후가 탐지된 경우 즉시 처리
        if anomalies:
            await self._handle_anomalies(anomalies)
        
        # 상관관계가 있는 로그들 처리
        if correlated_logs:
            await self._handle_correlated_logs(correlated_logs)
        
        # LLM 처리 (추후 구현)
        # if self.llm_processor:
        #     await self.llm_processor.process_log_entry(log_entry, correlated_logs, anomalies)
    
    async def _handle_anomalies(self, anomalies: List[Anomaly]):
        """이상 징후 처리"""
        for anomaly in anomalies:
            logger.warning(f"Anomaly detected: {anomaly.description} (severity: {anomaly.severity:.2f})")
            
            # 심각도가 높은 경우 즉시 알림
            if anomaly.severity > 0.8:
                await self._send_alert(anomaly)
    
    async def _handle_correlated_logs(self, correlated_logs: List[CorrelatedLogs]):
        """상관관계 로그 처리"""
        for correlation in correlated_logs:
            if correlation.correlation_strength > 0.8:
                logger.info(f"Strong correlation detected: {correlation.correlation_type} "
                          f"(strength: {correlation.correlation_strength:.2f})")
    
    async def _send_alert(self, anomaly: Anomaly):
        """알림 전송"""
        alert_message = f"""
        🚨 ANOMALY ALERT 🚨
        Type: {anomaly.type.value}
        Source: {anomaly.source.value}
        Severity: {anomaly.severity:.2f}
        Description: {anomaly.description}
        
        Suggested Actions:
        {chr(10).join(f"- {action}" for action in anomaly.suggested_actions)}
        """
        
        # 여기서 실제 알림 서비스로 전송 (Slack, Discord, Email 등)
        logger.critical(alert_message)
    
    async def _periodic_export(self):
        """주기적 로그 내보내기"""
        export_interval = self.config.get('output', {}).get('export_interval', 300)
        
        while self._running:
            try:
                await asyncio.sleep(export_interval)
                
                if not self._running:
                    break
                
                # 로그 내보내기
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_file = f"logs_export_{timestamp}.json"
                
                success = await self.collector.export_logs(output_file)
                if success:
                    logger.info(f"Logs exported to {output_file}")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic export: {e}")
    
    async def _periodic_stats(self):
        """주기적 통계 출력"""
        while self._running:
            try:
                await asyncio.sleep(60)  # 1분마다
                
                if not self._running:
                    break
                
                stats = self.collector.get_collection_stats()
                logger.info(f"Collection Stats: {stats['total_collected']} logs, "
                          f"{stats['active_sources']} active sources, "
                          f"{stats['collection_rate']:.1f} logs/sec")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic stats: {e}")
    
    def get_real_time_dashboard_data(self) -> Dict[str, Any]:
        """실시간 대시보드 데이터 반환"""
        stats = self.collector.get_collection_stats()
        
        # 최근 로그 분석
        recent_logs = list(self.collector.log_buffer)[-100:]  # 최근 100개
        
        # 소스별 분포
        source_distribution = defaultdict(int)
        level_distribution = defaultdict(int)
        recent_anomalies = []
        
        for log in recent_logs:
            source_distribution[log.source.value] += 1
            level_distribution[log.level.value] += 1
        
        # 최근 이상 징후
        if hasattr(self.collector.anomaly_detector, 'detection_history'):
            recent_anomalies = [
                {
                    'type': anomaly.type.value,
                    'severity': anomaly.severity,
                    'description': anomaly.description,
                    'detected_at': anomaly.detected_at.isoformat()
                }
                for anomaly in list(self.collector.anomaly_detector.detection_history)[-10:]
            ]
        
        return {
            'stats': stats,
            'source_distribution': dict(source_distribution),
            'level_distribution': dict(level_distribution),
            'recent_anomalies': recent_anomalies,
            'system_health': self._calculate_system_health(recent_logs)
        }
    
    def _calculate_system_health(self, recent_logs: List[LogEntry]) -> Dict[str, Any]:
        """시스템 건강도 계산"""
        error_count = len([log for log in recent_logs if log.level in [LogLevel.ERROR, LogLevel.CRITICAL]])
        warning_count = len([log for log in recent_logs if log.level == LogLevel.WARNING])
        total_count = len(recent_logs)
        
        if total_count == 0:
            return {'score': 1.0, 'status': 'unknown'}
        
        error_ratio = error_count / total_count
        warning_ratio = warning_count / total_count
        
        # 간단한 건강도 점수 계산
        health_score = 1.0 - (error_ratio * 0.5 + warning_ratio * 0.2)
        health_score = max(0.0, min(1.0, health_score))
        
        if health_score >= 0.8:
            status = 'healthy'
        elif health_score >= 0.6:
            status = 'warning'
        elif health_score >= 0.4:
            status = 'degraded'
        else:
            status = 'critical'
        
        return {
            'score': health_score,
            'status': status,
            'error_ratio': error_ratio,
            'warning_ratio': warning_ratio
        }


# CLI 인터페이스
async def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Multi-Source Log Collector')
    parser.add_argument('--config', '-c', help='Configuration file path')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    parser.add_argument('--export', '-e', help='Export logs to file and exit')
    parser.add_argument('--stats', '-s', action='store_true', help='Show collection statistics')
    
    args = parser.parse_args()
    
    # 로깅 설정
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        manager = LogCollectionManager(args.config)
        
        if args.export:
            # 내보내기 모드
            logger.info(f"Exporting logs to {args.export}")
            success = await manager.collector.export_logs(args.export)
            if success:
                print(f"Logs exported successfully to {args.export}")
            else:
                print("Failed to export logs")
            return
        
        if args.stats:
            # 통계 출력 모드
            await manager.collector.start_real_time_collection()
            await asyncio.sleep(5)  # 5초간 수집
            stats = manager.collector.get_collection_stats()
            print(json.dumps(stats, indent=2, default=str))
            await manager.collector.stop_collection()
            return
        
        # 일반 실행 모드
        await manager.start()
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())


# 사용 예제 및 테스트 코드
"""
사용 예제:

1. 기본 실행:
   python multi_source_log_collector.py

2. 설정 파일과 함께 실행:
   python multi_source_log_collector.py --config config.json

3. 로그 내보내기:
   python multi_source_log_collector.py --export logs_export.json

4. 통계 확인:
   python multi_source_log_collector.py --stats

5. 프로그래밍 방식 사용:
   
   import asyncio
   from multi_source_log_collector import MultiSourceLogCollector
   
   async def example_usage():
       collector = MultiSourceLogCollector()
       
       # 콜백 등록
       async def log_callback(entry, correlations, anomalies):
           print(f"New log: {entry.message}")
           if anomalies:
               print(f"Anomalies detected: {len(anomalies)}")
       
       collector.add_callback(log_callback)
       
       # 수집 시작
       streams = await collector.start_real_time_collection()
       
       # 10초간 수집
       await asyncio.sleep(10)
       
       # 통계 출력
       stats = collector.get_collection_stats()
       print(f"Collected {stats['total_collected']} logs")
       
       # 수집 중지
       await collector.stop_collection()
   
   asyncio.run(example_usage())

설정 파일 예제 (config.json):
{
  "collectors": {
    "server": {
      "enabled": true,
      "log_files": ["/var/log/nginx/access.log"],
      "follow_mode": true
    },
    "terminal": {
      "enabled": true,
      "history_file": "~/.zsh_history"
    },
    "database": {
      "enabled": true,
      "databases": [
        {
          "type": "postgresql",
          "host": "localhost",
          "port": 5432,
          "database": "myapp",
          "log_file": "/var/log/postgresql/postgresql.log"
        }
      ]
    },
    "docker": {
      "enabled": true,
      "include_stats": true,
      "container_filters": {"status": "running"}
    },
    "system": {
      "enabled": true,
      "collect_interval": 5
    }
  },
  "output": {
    "buffer_size": 20000,
    "export_interval": 600,
    "export_format": "json"
  },
  "anomaly_detection": {
    "enabled": true,
    "sensitivity": 0.8,
    "min_confidence": 0.6
  }
}
"""