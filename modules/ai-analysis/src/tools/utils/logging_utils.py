#!/usr/bin/env python3
"""
Enhanced Logging Utilities
JavaScript logger.js의 고도화된 Python 포팅 버전

주요 개선사항:
- 구조화된 로깅 (structlog 사용)
- 로그 레벨별 핸들러
- 로그 로테이션 및 압축
- 비동기 로깅 지원
- 메트릭 수집 통합
- 다중 출력 대상 (파일, 콘솔, 원격)
- 로그 검색 및 필터링 고도화
- 성능 최적화 및 배치 처리
"""

import asyncio
import json
import logging
import logging.handlers
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Callable, AsyncGenerator
from dataclasses import dataclass, asdict
from enum import Enum
import threading
from concurrent.futures import ThreadPoolExecutor
import gzip
import re
from collections import defaultdict, deque
import aiofiles
import structlog
from contextlib import asynccontextmanager


class LogLevel(Enum):
    """로그 레벨"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogFormat(Enum):
    """로그 포맷"""
    JSON = "json"
    PLAIN = "plain"
    STRUCTURED = "structured"
    CONSOLE = "console"


@dataclass
class LogEntry:
    """로그 엔트리 데이터 클래스"""
    timestamp: datetime
    level: LogLevel
    server: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    trace_id: Optional[str] = None
    user_id: Optional[str] = None
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    tags: Optional[List[str]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        result['level'] = self.level.value
        return result


@dataclass
class LogFilter:
    """로그 필터 조건"""
    level: Optional[LogLevel] = None
    server: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    message_pattern: Optional[str] = None
    module: Optional[str] = None
    user_id: Optional[str] = None
    trace_id: Optional[str] = None
    tags: Optional[List[str]] = None
    limit: int = 100


@dataclass
class LogStats:
    """로그 통계"""
    total_logs: int
    by_level: Dict[str, int]
    by_server: Dict[str, int]
    by_hour: Dict[str, int]
    error_patterns: Dict[str, int]
    avg_logs_per_minute: float
    time_range: Dict[str, datetime]


class LogConfig:
    """로그 설정"""
    
    def __init__(self):
        self.log_dir = Path("logs")
        self.max_file_size = 100 * 1024 * 1024  # 100MB
        self.backup_count = 10
        self.log_format = LogFormat.JSON
        self.console_output = True
        self.file_output = True
        self.async_logging = True
        self.batch_size = 100
        self.flush_interval = 5.0  # seconds
        self.compression = True
        self.retention_days = 30
        self.enable_metrics = True
        self.remote_logging = False
        self.remote_endpoint = None
        self.log_level = LogLevel.INFO
        self.structured_logging = True
        
        # 성능 설정
        self.max_queue_size = 10000
        self.worker_threads = 2
        self.memory_threshold = 50 * 1024 * 1024  # 50MB


class EnhancedLogger:
    """
    고도화된 로거 클래스
    JavaScript Logger 클래스의 Python 포팅 + 확장
    """
    
    def __init__(self, 
                 log_dir: Union[str, Path], 
                 server_name: str = "main",
                 config: Optional[LogConfig] = None):
        self.log_dir = Path(log_dir)
        self.server_name = server_name
        self.config = config or LogConfig()
        
        # 내부 상태
        self._initialized = False
        self._log_queue = asyncio.Queue(maxsize=self.config.max_queue_size)
        self._stop_event = asyncio.Event()
        self._worker_tasks = []
        self._metrics = LogMetrics()
        self._context = {}
        self._filters = []
        
        # 파일 핸들러들
        self._file_handlers = {}
        self._console_handler = None
        
        # 구조화 로깅 설정
        if self.config.structured_logging:
            self._setup_structured_logging()
        
        # 초기화
        asyncio.create_task(self._initialize())
    
    def _setup_structured_logging(self):
        """구조화된 로깅 설정"""
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                structlog.processors.add_log_level,
                structlog.processors.StackInfoRenderer(),
                structlog.dev.set_exc_info,
                structlog.processors.JSONRenderer()
            ],
            wrapper_class=structlog.make_filtering_bound_logger(
                logging.INFO if self.config.log_level == LogLevel.INFO else logging.DEBUG
            ),
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
        
        self._struct_logger = structlog.get_logger(self.server_name)
    
    async def _initialize(self):
        """비동기 초기화"""
        if self._initialized:
            return
        
        try:
            # 로그 디렉토리 생성
            self.log_dir.mkdir(parents=True, exist_ok=True)
            
            # 파일 핸들러 설정
            if self.config.file_output:
                await self._setup_file_handlers()
            
            # 콘솔 핸들러 설정
            if self.config.console_output:
                self._setup_console_handler()
            
            # 비동기 워커 시작
            if self.config.async_logging:
                await self._start_workers()
            
            # 메트릭 수집 시작
            if self.config.enable_metrics:
                asyncio.create_task(self._metrics_collector())
            
            # 로그 정리 스케줄러 시작
            asyncio.create_task(self._cleanup_scheduler())
            
            self._initialized = True
            await self.info("Logger initialized", {
                "server": self.server_name,
                "config": {
                    "async_logging": self.config.async_logging,
                    "log_dir": str(self.log_dir),
                    "log_format": self.config.log_format.value
                }
            })
            
        except Exception as e:
            print(f"Failed to initialize logger: {e}")
            raise
    
    async def _setup_file_handlers(self):
        """파일 핸들러 설정"""
        log_file = self.log_dir / f"{self.server_name}-server.log"
        
        # 로테이팅 파일 핸들러
        handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=self.config.max_file_size,
            backupCount=self.config.backup_count
        )
        
        # 포매터 설정
        if self.config.log_format == LogFormat.JSON:
            formatter = logging.Formatter('%(message)s')
        else:
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
        
        handler.setFormatter(formatter)
        self._file_handlers['main'] = handler
    
    def _setup_console_handler(self):
        """콘솔 핸들러 설정"""
        handler = logging.StreamHandler(sys.stdout)
        
        if self.config.log_format == LogFormat.CONSOLE:
            formatter = ConsoleColorFormatter()
        else:
            formatter = logging.Formatter(
                '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
            )
        
        handler.setFormatter(formatter)
        self._console_handler = handler
    
    async def _start_workers(self):
        """비동기 워커 시작"""
        for i in range(self.config.worker_threads):
            task = asyncio.create_task(self._log_worker(f"worker-{i}"))
            self._worker_tasks.append(task)
    
    async def _log_worker(self, worker_name: str):
        """로그 처리 워커"""
        batch = []
        last_flush = time.time()
        
        while not self._stop_event.is_set():
            try:
                # 배치 수집
                timeout = self.config.flush_interval - (time.time() - last_flush)
                if timeout <= 0:
                    timeout = 0.1
                
                try:
                    log_entry = await asyncio.wait_for(
                        self._log_queue.get(),
                        timeout=timeout
                    )
                    batch.append(log_entry)
                except asyncio.TimeoutError:
                    pass
                
                # 배치 처리 조건
                should_flush = (
                    len(batch) >= self.config.batch_size or
                    (time.time() - last_flush) >= self.config.flush_interval or
                    self._stop_event.is_set()
                )
                
                if should_flush and batch:
                    await self._process_batch(batch, worker_name)
                    batch.clear()
                    last_flush = time.time()
                    
            except Exception as e:
                print(f"Log worker {worker_name} error: {e}")
                await asyncio.sleep(1)
    
    async def _process_batch(self, batch: List[LogEntry], worker_name: str):
        """로그 배치 처리"""
        try:
            # 파일 출력
            if self.config.file_output:
                await self._write_to_files(batch)
            
            # 콘솔 출력
            if self.config.console_output:
                await self._write_to_console(batch)
            
            # 원격 로깅
            if self.config.remote_logging and self.config.remote_endpoint:
                await self._send_to_remote(batch)
            
            # 메트릭 업데이트
            if self.config.enable_metrics:
                self._metrics.update_batch(batch)
                
        except Exception as e:
            print(f"Batch processing error in {worker_name}: {e}")
    
    async def _write_to_files(self, batch: List[LogEntry]):
        """파일에 로그 배치 쓰기"""
        lines = []
        for entry in batch:
            if self.config.log_format == LogFormat.JSON:
                line = json.dumps(entry.to_dict(), ensure_ascii=False)
            else:
                line = self._format_log_entry(entry)
            lines.append(line + '\n')
        
        log_file = self.log_dir / f"{self.server_name}-server.log"
        
        try:
            async with aiofiles.open(log_file, 'a', encoding='utf-8') as f:
                await f.writelines(lines)
        except Exception as e:
            print(f"Failed to write logs to file: {e}")
    
    async def _write_to_console(self, batch: List[LogEntry]):
        """콘솔에 로그 배치 출력"""
        for entry in batch:
            if self.config.log_format == LogFormat.CONSOLE:
                formatted = self._format_console_entry(entry)
            else:
                formatted = self._format_log_entry(entry)
            
            print(formatted)
    
    def _format_log_entry(self, entry: LogEntry) -> str:
        """로그 엔트리 포맷팅"""
        timestamp = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        level = entry.level.value.ljust(8)
        server = entry.server.ljust(10)
        
        base_msg = f"{timestamp} [{level}] {server}: {entry.message}"
        
        if entry.data:
            data_str = json.dumps(entry.data, ensure_ascii=False)
            base_msg += f" | Data: {data_str}"
        
        if entry.trace_id:
            base_msg += f" | Trace: {entry.trace_id}"
        
        return base_msg
    
    def _format_console_entry(self, entry: LogEntry) -> str:
        """콘솔용 컬러 포맷팅"""
        colors = {
            LogLevel.DEBUG: '\033[36m',    # Cyan
            LogLevel.INFO: '\033[32m',     # Green
            LogLevel.WARNING: '\033[33m',  # Yellow
            LogLevel.ERROR: '\033[31m',    # Red
            LogLevel.CRITICAL: '\033[35m', # Magenta
        }
        reset = '\033[0m'
        
        color = colors.get(entry.level, '')
        timestamp = entry.timestamp.strftime("%H:%M:%S")
        
        return f"{color}[{entry.server}:{entry.level.value}] {timestamp}: {entry.message}{reset}"
    
    # Public API Methods
    async def debug(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """DEBUG 레벨 로그"""
        await self._log(LogLevel.DEBUG, message, data, **kwargs)
    
    async def info(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """INFO 레벨 로그"""
        await self._log(LogLevel.INFO, message, data, **kwargs)
    
    async def warning(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """WARNING 레벨 로그"""
        await self._log(LogLevel.WARNING, message, data, **kwargs)
    
    async def error(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """ERROR 레벨 로그"""
        await self._log(LogLevel.ERROR, message, data, **kwargs)
    
    async def critical(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """CRITICAL 레벨 로그"""
        await self._log(LogLevel.CRITICAL, message, data, **kwargs)
    
    async def _log(self, level: LogLevel, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """내부 로깅 메서드"""
        if not self._initialized:
            await self._initialize()
        
        # 컨텍스트 병합
        merged_data = {**self._context}
        if data:
            merged_data.update(data)
        if kwargs:
            merged_data.update(kwargs)
        
        # 호출자 정보 추출
        frame = sys._getframe(2)
        
        entry = LogEntry(
            timestamp=datetime.now(),
            level=level,
            server=self.server_name,
            message=message,
            module=frame.f_code.co_filename,
            function=frame.f_code.co_name,
            line=frame.f_lineno,
            data=merged_data if merged_data else None,
            trace_id=self._context.get('trace_id'),
            user_id=self._context.get('user_id'),
            request_id=self._context.get('request_id'),
            session_id=self._context.get('session_id'),
            tags=self._context.get('tags')
        )
        
        # 필터 적용
        if not self._apply_filters(entry):
            return
        
        if self.config.async_logging:
            try:
                await self._log_queue.put(entry)
            except asyncio.QueueFull:
                # 큐가 가득 찬 경우 직접 출력
                print(f"Log queue full, dropping message: {message}")
        else:
            await self._process_batch([entry], "sync")
    
    def _apply_filters(self, entry: LogEntry) -> bool:
        """로그 필터 적용"""
        for log_filter in self._filters:
            if not log_filter(entry):
                return False
        return True
    
    def add_filter(self, filter_func: Callable[[LogEntry], bool]):
        """로그 필터 추가"""
        self._filters.append(filter_func)
    
    def with_context(self, **kwargs) -> 'ContextualLogger':
        """컨텍스트가 있는 로거 반환"""
        return ContextualLogger(self, kwargs)
    
    async def clear_logs(self) -> Dict[str, Any]:
        """로그 파일 지우기"""
        try:
            log_file = self.log_dir / f"{self.server_name}-server.log"
            
            if log_file.exists():
                log_file.unlink()
                await self.info("Log file cleared", {"file": str(log_file)})
                return {
                    "success": True,
                    "message": f"{self.server_name} 서버 로그가 성공적으로 지워졌습니다."
                }
            else:
                return {
                    "success": True,
                    "message": "지울 로그 파일이 없습니다."
                }
                
        except Exception as e:
            await self.error("Failed to clear logs", {"error": str(e)})
            raise
    
    async def get_logs(self, 
                      lines: int = 50, 
                      filter_conditions: Optional[LogFilter] = None) -> Dict[str, Any]:
        """로그 조회"""
        try:
            log_file = self.log_dir / f"{self.server_name}-server.log"
            
            if not log_file.exists():
                return {
                    "server": self.server_name,
                    "logs": [],
                    "total": 0,
                    "returned": 0
                }
            
            logs = []
            total_count = 0
            
            async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                async for line in f:
                    if not line.strip():
                        continue
                    
                    total_count += 1
                    
                    try:
                        log_data = json.loads(line.strip())
                        entry = self._parse_log_entry(log_data)
                        
                        # 필터 적용
                        if filter_conditions and not self._matches_filter(entry, filter_conditions):
                            continue
                        
                        logs.append(log_data)
                        
                    except json.JSONDecodeError:
                        # Raw 로그 라인 처리
                        logs.append({"message": line.strip(), "level": "RAW"})
            
            # 최근 로그부터 반환
            recent_logs = logs[-lines:] if lines > 0 else logs
            
            return {
                "server": self.server_name,
                "logs": recent_logs,
                "total": total_count,
                "returned": len(recent_logs),
                "filter_applied": filter_conditions is not None
            }
            
        except Exception as e:
            await self.error("Failed to get logs", {"error": str(e)})
            raise
    
    def _parse_log_entry(self, log_data: Dict[str, Any]) -> LogEntry:
        """로그 데이터를 LogEntry로 파싱"""
        return LogEntry(
            timestamp=datetime.fromisoformat(log_data['timestamp']),
            level=LogLevel(log_data['level']),
            server=log_data['server'],
            message=log_data['message'],
            module=log_data.get('module'),
            function=log_data.get('function'),
            line=log_data.get('line'),
            data=log_data.get('data'),
            trace_id=log_data.get('trace_id'),
            user_id=log_data.get('user_id'),
            request_id=log_data.get('request_id'),
            session_id=log_data.get('session_id'),
            tags=log_data.get('tags')
        )
    
    def _matches_filter(self, entry: LogEntry, filter_conditions: LogFilter) -> bool:
        """로그 엔트리가 필터 조건에 맞는지 확인"""
        if filter_conditions.level and entry.level != filter_conditions.level:
            return False
        
        if filter_conditions.server and entry.server != filter_conditions.server:
            return False
        
        if filter_conditions.start_time and entry.timestamp < filter_conditions.start_time:
            return False
        
        if filter_conditions.end_time and entry.timestamp > filter_conditions.end_time:
            return False
        
        if filter_conditions.message_pattern:
            pattern = re.compile(filter_conditions.message_pattern, re.IGNORECASE)
            if not pattern.search(entry.message):
                return False
        
        if filter_conditions.module and entry.module != filter_conditions.module:
            return False
        
        if filter_conditions.user_id and entry.user_id != filter_conditions.user_id:
            return False
        
        if filter_conditions.trace_id and entry.trace_id != filter_conditions.trace_id:
            return False
        
        if filter_conditions.tags:
            if not entry.tags or not set(filter_conditions.tags).issubset(set(entry.tags)):
                return False
        
        return True
    
    async def get_stats(self, 
                       days: int = 7, 
                       granularity: str = "hour") -> LogStats:
        """로그 통계 생성"""
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        filter_conditions = LogFilter(
            start_time=start_time,
            end_time=end_time,
            limit=-1  # 모든 로그
        )
        
        logs_data = await self.get_logs(-1, filter_conditions)
        logs = [self._parse_log_entry(log) for log in logs_data['logs'] if isinstance(log, dict)]
        
        # 통계 계산
        by_level = defaultdict(int)
        by_server = defaultdict(int)
        by_hour = defaultdict(int)
        error_patterns = defaultdict(int)
        
        for entry in logs:
            by_level[entry.level.value] += 1
            by_server[entry.server] += 1
            
            hour_key = entry.timestamp.strftime("%Y-%m-%d %H:00")
            by_hour[hour_key] += 1
            
            if entry.level in [LogLevel.ERROR, LogLevel.CRITICAL]:
                # 에러 패턴 추출 (첫 50자)
                pattern = entry.message[:50]
                error_patterns[pattern] += 1
        
        # 분당 평균 로그 수
        total_minutes = max(1, (end_time - start_time).total_seconds() / 60)
        avg_logs_per_minute = len(logs) / total_minutes
        
        return LogStats(
            total_logs=len(logs),
            by_level=dict(by_level),
            by_server=dict(by_server),
            by_hour=dict(by_hour),
            error_patterns=dict(error_patterns),
            avg_logs_per_minute=avg_logs_per_minute,
            time_range={"start": start_time, "end": end_time}
        )
    
    # 정적 메서드들
    @staticmethod
    async def get_all_server_logs(log_dir: Union[str, Path], 
                                 lines: int = 50, 
                                 filter_conditions: Optional[LogFilter] = None) -> Dict[str, Any]:
        """모든 서버 로그 통합 조회"""
        log_dir = Path(log_dir)
        
        if not log_dir.exists():
            return {"servers": [], "total_servers": 0}
        
        all_logs = []
        
        try:
            log_files = list(log_dir.glob("*-server.log"))
            
            for log_file in log_files:
                try:
                    server_name = log_file.stem.replace("-server", "")
                    logger = EnhancedLogger(log_dir, server_name)
                    await logger._initialize()
                    
                    logs = await logger.get_logs(lines, filter_conditions)
                    all_logs.append(logs)
                    
                except Exception as e:
                    print(f"Failed to read logs for {log_file}: {e}")
            
            return {
                "servers": all_logs,
                "total_servers": len(all_logs)
            }
            
        except Exception as e:
            return {
                "servers": [],
                "total_servers": 0,
                "error": str(e)
            }
    
    async def _metrics_collector(self):
        """메트릭 수집기"""
        while not self._stop_event.is_set():
            try:
                # 메트릭 수집 및 저장
                await self._collect_metrics()
                await asyncio.sleep(60)  # 1분마다
            except Exception as e:
                print(f"Metrics collection error: {e}")
                await asyncio.sleep(60)
    
    async def _collect_metrics(self):
        """메트릭 수집"""
        # 큐 크기, 메모리 사용량 등 수집
        queue_size = self._log_queue.qsize()
        
        # 시스템 메트릭과 함께 저장
        metrics_data = {
            "timestamp": datetime.now().isoformat(),
            "server": self.server_name,
            "queue_size": queue_size,
            "worker_count": len(self._worker_tasks),
            "total_logs": self._metrics.total_logs,
            "error_count": self._metrics.error_count
        }
        
        # 메트릭 파일에 저장
        metrics_file = self.log_dir / f"{self.server_name}-metrics.jsonl"
        async with aiofiles.open(metrics_file, 'a', encoding='utf-8') as f:
            await f.write(json.dumps(metrics_data) + '\n')
    
    async def _cleanup_scheduler(self):
        """로그 정리 스케줄러"""
        while not self._stop_event.is_set():
            try:
                await self._cleanup_old_logs()
                await asyncio.sleep(24 * 3600)  # 24시간마다
            except Exception as e:
                print(f"Cleanup scheduler error: {e}")
                await asyncio.sleep(3600)  # 오류 시 1시간 후 재시도
    
    async def _cleanup_old_logs(self):
        """오래된 로그 정리"""
        cutoff_date = datetime.now() - timedelta(days=self.config.retention_days)
        
        # 로그 파일들 정리
        for log_file in self.log_dir.glob("*.log*"):
            try:
                file_time = datetime.fromtimestamp(log_file.stat().st_mtime)
                if file_time < cutoff_date:
                    if self.config.compression and not log_file.suffix == '.gz':
                        # 압축 후 삭제
                        await self._compress_log_file(log_file)
                    elif file_time < cutoff_date - timedelta(days=7):
                        # 압축된 파일도 일주일 더 지나면 삭제
                        log_file.unlink()
                        await self.info("Deleted old log file", {"file": str(log_file)})
            except Exception as e:
                await self.warning("Failed to cleanup log file", {
                    "file": str(log_file),
                    "error": str(e)
                })
    
    async def _compress_log_file(self, log_file: Path):
        """로그 파일 압축"""
        compressed_file = log_file.with_suffix(log_file.suffix + '.gz')
        
        try:
            with open(log_file, 'rb') as f_in:
                with gzip.open(compressed_file, 'wb') as f_out:
                    f_out.writelines(f_in)
            
            log_file.unlink()
            await self.info("Compressed log file", {
                "original": str(log_file),
                "compressed": str(compressed_file)
            })
            
        except Exception as e:
            await self.error("Failed to compress log file", {
                "file": str(log_file),
                "error": str(e)
            })
    
    async def _send_to_remote(self, batch: List[LogEntry]):
        """원격 로깅 서버로 전송"""
        if not self.config.remote_endpoint:
            return
        
        try:
            import aiohttp
            
            payload = {
                "server": self.server_name,
                "logs": [entry.to_dict() for entry in batch]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.config.remote_endpoint,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        print(f"Remote logging failed: {response.status}")
                        
        except Exception as e:
            print(f"Remote logging error: {e}")
    
    async def shutdown(self):
        """로거 종료"""
        self._stop_event.set()
        
        # 남은 로그들 처리
        remaining_logs = []
        while not self._log_queue.empty():
            try:
                entry = self._log_queue.get_nowait()
                remaining_logs.append(entry)
            except asyncio.QueueEmpty:
                break
        
        if remaining_logs:
            await self._process_batch(remaining_logs, "shutdown")
        
        # 워커 태스크 종료 대기
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        
        await self.info("Logger shutdown completed")


class ContextualLogger:
    """컨텍스트가 있는 로거"""
    
    def __init__(self, logger: EnhancedLogger, context: Dict[str, Any]):
        self.logger = logger
        self.context = context
    
    async def debug(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        merged_data = {**self.context, **(data or {}), **kwargs}
        await self.logger.debug(message, merged_data)
    
    async def info(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        merged_data = {**self.context, **(data or {}), **kwargs}
        await self.logger.info(message, merged_data)
    
    async def warning(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        merged_data = {**self.context, **(data or {}), **kwargs}
        await self.logger.warning(message, merged_data)
    
    async def error(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        merged_data = {**self.context, **(data or {}), **kwargs}
        await self.logger.error(message, merged_data)
    
    async def critical(self, message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        merged_data = {**self.context, **(data or {}), **kwargs}
        await self.logger.critical(message, merged_data)


class LogMetrics:
    """로그 메트릭 수집기"""
    
    def __init__(self):
        self.total_logs = 0
        self.error_count = 0
        self.by_level = defaultdict(int)
        self.by_server = defaultdict(int)
        self.response_times = deque(maxlen=1000)
        self.lock = threading.Lock()
    
    def update_batch(self, batch: List[LogEntry]):
        """배치 메트릭 업데이트"""
        with self.lock:
            self.total_logs += len(batch)
            
            for entry in batch:
                self.by_level[entry.level.value] += 1
                self.by_server[entry.server] += 1
                
                if entry.level in [LogLevel.ERROR, LogLevel.CRITICAL]:
                    self.error_count += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """메트릭 통계 반환"""
        with self.lock:
            return {
                "total_logs": self.total_logs,
                "error_count": self.error_count,
                "by_level": dict(self.by_level),
                "by_server": dict(self.by_server),
                "avg_response_time": sum(self.response_times) / len(self.response_times) if self.response_times else 0
            }


class ConsoleColorFormatter(logging.Formatter):
    """컬러 콘솔 포매터"""
    
    def __init__(self):
        super().__init__()
        self.colors = {
            'DEBUG': '\033[36m',    # Cyan
            'INFO': '\033[32m',     # Green
            'WARNING': '\033[33m',  # Yellow
            'ERROR': '\033[31m',    # Red
            'CRITICAL': '\033[35m', # Magenta
        }
        self.reset = '\033[0m'
    
    def format(self, record):
        color = self.colors.get(record.levelname, '')
        record.levelname = f"{color}{record.levelname}{self.reset}"
        return super().format(record)


class LogSearchEngine:
    """로그 검색 엔진"""
    
    def __init__(self, log_dir: Union[str, Path]):
        self.log_dir = Path(log_dir)
        self.indexes = {}  # 인덱스 캐시
    
    async def search(self, 
                    query: str, 
                    servers: Optional[List[str]] = None,
                    time_range: Optional[Tuple[datetime, datetime]] = None,
                    level: Optional[LogLevel] = None,
                    limit: int = 100) -> List[Dict[str, Any]]:
        """로그 검색"""
        results = []
        
        # 검색할 로그 파일들 결정
        if servers:
            log_files = [self.log_dir / f"{server}-server.log" for server in servers]
        else:
            log_files = list(self.log_dir.glob("*-server.log"))
        
        # 각 파일에서 검색
        for log_file in log_files:
            if not log_file.exists():
                continue
            
            file_results = await self._search_in_file(log_file, query, time_range, level, limit)
            results.extend(file_results)
            
            if len(results) >= limit:
                break
        
        # 시간순 정렬
        results.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return results[:limit]
    
    async def _search_in_file(self, 
                             log_file: Path, 
                             query: str,
                             time_range: Optional[Tuple[datetime, datetime]],
                             level: Optional[LogLevel],
                             limit: int) -> List[Dict[str, Any]]:
        """파일 내 검색"""
        results = []
        query_lower = query.lower()
        
        try:
            async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                async for line in f:
                    if not line.strip():
                        continue
                    
                    try:
                        log_data = json.loads(line.strip())
                        
                        # 레벨 필터
                        if level and log_data.get('level') != level.value:
                            continue
                        
                        # 시간 범위 필터
                        if time_range:
                            log_time = datetime.fromisoformat(log_data['timestamp'])
                            if not (time_range[0] <= log_time <= time_range[1]):
                                continue
                        
                        # 텍스트 검색
                        searchable_text = (
                            log_data.get('message', '') + ' ' +
                            json.dumps(log_data.get('data', {}), ensure_ascii=False)
                        ).lower()
                        
                        if query_lower in searchable_text:
                            # 검색어 하이라이트
                            log_data['_highlight'] = self._highlight_matches(
                                log_data.get('message', ''), query
                            )
                            results.append(log_data)
                            
                            if len(results) >= limit:
                                break
                    
                    except json.JSONDecodeError:
                        # Raw 로그 라인 검색
                        if query_lower in line.lower():
                            results.append({
                                "message": line.strip(),
                                "level": "RAW",
                                "_highlight": self._highlight_matches(line.strip(), query)
                            })
        
        except Exception as e:
            print(f"Search error in {log_file}: {e}")
        
        return results
    
    def _highlight_matches(self, text: str, query: str) -> str:
        """검색어 하이라이트"""
        pattern = re.compile(re.escape(query), re.IGNORECASE)
        return pattern.sub(f"**{query}**", text)


class LogAnalyzer:
    """로그 분석기"""
    
    def __init__(self, log_dir: Union[str, Path]):
        self.log_dir = Path(log_dir)
    
    async def analyze_errors(self, days: int = 7) -> Dict[str, Any]:
        """에러 패턴 분석"""
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        error_patterns = defaultdict(int)
        error_timeline = defaultdict(int)
        error_servers = defaultdict(int)
        
        # 모든 서버 로그 분석
        log_files = list(self.log_dir.glob("*-server.log"))
        
        for log_file in log_files:
            server_name = log_file.stem.replace("-server", "")
            
            try:
                async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                    async for line in f:
                        if not line.strip():
                            continue
                        
                        try:
                            log_data = json.loads(line.strip())
                            
                            # 에러 레벨만 분석
                            if log_data.get('level') not in ['ERROR', 'CRITICAL']:
                                continue
                            
                            # 시간 범위 확인
                            log_time = datetime.fromisoformat(log_data['timestamp'])
                            if not (start_time <= log_time <= end_time):
                                continue
                            
                            # 패턴 추출 (메시지의 첫 100자)
                            message = log_data.get('message', '')
                            pattern = message[:100]
                            error_patterns[pattern] += 1
                            
                            # 시간대별 분포
                            hour_key = log_time.strftime("%Y-%m-%d %H:00")
                            error_timeline[hour_key] += 1
                            
                            # 서버별 분포
                            error_servers[server_name] += 1
                            
                        except (json.JSONDecodeError, ValueError, KeyError):
                            continue
            
            except Exception as e:
                print(f"Error analyzing {log_file}: {e}")
        
        # 상위 패턴들 정렬
        top_patterns = sorted(error_patterns.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            "analysis_period": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat(),
                "days": days
            },
            "total_errors": sum(error_patterns.values()),
            "top_error_patterns": [
                {"pattern": pattern, "count": count} 
                for pattern, count in top_patterns
            ],
            "timeline": dict(error_timeline),
            "by_server": dict(error_servers),
            "unique_patterns": len(error_patterns)
        }
    
    async def analyze_performance(self, days: int = 1) -> Dict[str, Any]:
        """성능 분석"""
        # 메트릭 파일들 분석
        metrics_files = list(self.log_dir.glob("*-metrics.jsonl"))
        
        performance_data = {
            "queue_sizes": [],
            "worker_counts": [],
            "log_rates": [],
            "timestamps": []
        }
        
        for metrics_file in metrics_files:
            try:
                async with aiofiles.open(metrics_file, 'r', encoding='utf-8') as f:
                    async for line in f:
                        if not line.strip():
                            continue
                        
                        try:
                            metrics = json.loads(line.strip())
                            
                            performance_data["queue_sizes"].append(metrics.get("queue_size", 0))
                            performance_data["worker_counts"].append(metrics.get("worker_count", 0))
                            performance_data["log_rates"].append(metrics.get("total_logs", 0))
                            performance_data["timestamps"].append(metrics.get("timestamp", ""))
                            
                        except json.JSONDecodeError:
                            continue
            
            except Exception as e:
                print(f"Error analyzing metrics {metrics_file}: {e}")
        
        # 통계 계산
        queue_sizes = performance_data["queue_sizes"]
        
        return {
            "queue_performance": {
                "avg_size": sum(queue_sizes) / len(queue_sizes) if queue_sizes else 0,
                "max_size": max(queue_sizes) if queue_sizes else 0,
                "min_size": min(queue_sizes) if queue_sizes else 0
            },
            "data_points": len(queue_sizes),
            "analysis_period": f"{days} days"
        }


# 전역 로거 인스턴스 관리
_loggers = {}
_default_config = LogConfig()

def get_logger(server_name: str = "main", 
               log_dir: Union[str, Path] = "logs",
               config: Optional[LogConfig] = None) -> EnhancedLogger:
    """전역 로거 인스턴스 반환"""
    key = f"{server_name}_{log_dir}"
    
    if key not in _loggers:
        _loggers[key] = EnhancedLogger(log_dir, server_name, config or _default_config)
    
    return _loggers[key]

def set_default_config(config: LogConfig):
    """기본 로그 설정 변경"""
    global _default_config
    _default_config = config

# 편의 함수들
async def log_info(message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
    """INFO 로그 편의 함수"""
    logger = get_logger()
    await logger.info(message, data, **kwargs)

async def log_error(message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
    """ERROR 로그 편의 함수"""
    logger = get_logger()
    await logger.error(message, data, **kwargs)

async def log_debug(message: str, data: Optional[Dict[str, Any]] = None, **kwargs):
    """DEBUG 로그 편의 함수"""
    logger = get_logger()
    await logger.debug(message, data, **kwargs)

async def clear_all_logs(log_dir: Union[str, Path] = "logs") -> Dict[str, Any]:
    """모든 로그 파일 지우기"""
    return await EnhancedLogger.get_all_server_logs(log_dir, 0)

# 데코레이터
def log_function_calls(logger: Optional[EnhancedLogger] = None):
    """함수 호출 로깅 데코레이터"""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            nonlocal logger
            if logger is None:
                logger = get_logger()
            
            start_time = time.time()
            
            await logger.debug(f"Function call started: {func.__name__}", {
                "function": func.__name__,
                "args_count": len(args),
                "kwargs_keys": list(kwargs.keys())
            })
            
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                
                execution_time = time.time() - start_time
                
                await logger.debug(f"Function call completed: {func.__name__}", {
                    "function": func.__name__,
                    "execution_time": execution_time,
                    "success": True
                })
                
                return result
                
            except Exception as e:
                execution_time = time.time() - start_time
                
                await logger.error(f"Function call failed: {func.__name__}", {
                    "function": func.__name__,
                    "execution_time": execution_time,
                    "error": str(e),
                    "error_type": type(e).__name__
                })
                
                raise
        
        def sync_wrapper(*args, **kwargs):
            # 동기 함수용 래퍼 - 비동기 로깅을 위해 이벤트 루프 사용
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            return loop.run_until_complete(async_wrapper(*args, **kwargs))
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    
    return decorator

# Context Manager
@asynccontextmanager
async def log_context(**context):
    """로깅 컨텍스트 매니저"""
    logger = get_logger()
    original_context = logger._context.copy()
    
    try:
        logger._context.update(context)
        yield logger
    finally:
        logger._context = original_context


# 사용 예제
if __name__ == "__main__":
    async def main():
        # 기본 사용법
        logger = get_logger("example", "logs")
        
        await logger.info("서버 시작됨", {
            "port": 8000,
            "environment": "development"
        })
        
        # 컨텍스트 사용
        async with log_context(user_id="user123", trace_id="trace456"):
            ctx_logger = get_logger("example")
            await ctx_logger.info("사용자 작업 시작")
            await ctx_logger.error("작업 중 오류 발생", {
                "error_code": "E001",
                "details": "파일을 찾을 수 없음"
            })
        
        # 로그 조회
        logs = await logger.get_logs(10)
        print(f"최근 로그 {len(logs['logs'])}개 조회됨")
        
        # 로그 검색
        search_engine = LogSearchEngine("logs")
        results = await search_engine.search("오류", limit=5)
        print(f"검색 결과: {len(results)}개")
        
        # 통계
        stats = await logger.get_stats()
        print(f"총 로그: {stats.total_logs}개")
        
        # 종료
        await logger.shutdown()
    
    asyncio.run(main())