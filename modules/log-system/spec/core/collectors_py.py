#!/usr/bin/env python3
"""
통합 로그 수집기 - 각종 로그 소스 수집기들
개발자를 위한 실용적 로그 수집 에이전트
"""

import asyncio
import json
import time
import uuid
import threading
import subprocess
import select
import socket
import re
import os
import sys
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Callable, Set
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
from urllib.parse import urlparse
import logging

# 외부 라이브러리 (선택적 설치)
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    
try:
    import watchdog
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


@dataclass
class CollectorConfig:
    """수집기 기본 설정"""
    enabled: bool = True
    rpc_server: str = "http://localhost:8888/rpc"
    buffer_size: int = 100
    flush_interval: float = 1.0
    retry_count: int = 3
    retry_delay: float = 1.0


class LogClient:
    """JSON-RPC 클라이언트"""
    
    def __init__(self, server_url: str):
        self.server_url = server_url
        self.session = None
        if HAS_AIOHTTP:
            self.session = aiohttp.ClientSession()
        
    async def send_log(self, source: str, level: str, message: str, 
                      metadata: Dict = None, tags: List[str] = None, 
                      trace_id: str = None) -> bool:
        """로그 전송"""
        payload = {
            "jsonrpc": "2.0",
            "method": "log",
            "params": {
                "source": source,
                "level": level,
                "message": message,
                "metadata": metadata or {},
                "tags": tags or [],
                "trace_id": trace_id,
                "timestamp": datetime.now().isoformat()
            },
            "id": str(uuid.uuid4())
        }
        
        try:
            if self.session:
                async with self.session.post(self.server_url, json=payload) as resp:
                    return resp.status == 200
            else:
                # fallback to requests
                if HAS_REQUESTS:
                    resp = requests.post(self.server_url, json=payload, timeout=5)
                    return resp.status_code == 200
                return False
        except Exception as e:
            print(f"로그 전송 실패: {e}")
            return False
            
    async def send_batch(self, logs: List[Dict]) -> bool:
        """배치 로그 전송"""
        payload = {
            "jsonrpc": "2.0",
            "method": "log_batch",
            "params": {
                "logs": logs,
                "compress": len(logs) > 50
            },
            "id": str(uuid.uuid4())
        }
        
        try:
            if self.session:
                async with self.session.post(self.server_url, json=payload) as resp:
                    return resp.status == 200
            return False
        except Exception as e:
            print(f"배치 로그 전송 실패: {e}")
            return False
            
    async def close(self):
        if self.session:
            await self.session.close()


class BaseCollector(ABC):
    """로그 수집기 베이스 클래스"""
    
    def __init__(self, name: str, config: CollectorConfig):
        self.name = name
        self.config = config
        self.client = LogClient(config.rpc_server)
        self.running = False
        self.buffer = []
        self.last_flush = time.time()
        
    @abstractmethod
    async def start_collecting(self):
        """수집 시작 (구현 필요)"""
        pass
        
    async def start(self):
        """수집기 시작"""
        if not self.config.enabled:
            print(f"{self.name} 수집기가 비활성화됨")
            return
            
        print(f"{self.name} 수집기 시작...")
        self.running = True
        
        # 수집 태스크 시작
        collect_task = asyncio.create_task(self.start_collecting())
        flush_task = asyncio.create_task(self._flush_worker())
        
        try:
            await asyncio.gather(collect_task, flush_task)
        except Exception as e:
            print(f"{self.name} 수집기 오류: {e}")
        finally:
            await self.stop()
            
    async def stop(self):
        """수집기 중지"""
        self.running = False
        await self._flush_buffer()
        await self.client.close()
        print(f"{self.name} 수집기 중지됨")
        
    async def log(self, level: str, message: str, metadata: Dict = None, 
                  tags: List[str] = None, trace_id: str = None):
        """로그 버퍼에 추가"""
        log_entry = {
            "source": self.name,
            "level": level,
            "message": message,
            "metadata": metadata or {},
            "tags": tags or [],
            "trace_id": trace_id,
            "timestamp": datetime.now().isoformat()
        }
        
        self.buffer.append(log_entry)
        
        # 버퍼 크기 확인
        if len(self.buffer) >= self.config.buffer_size:
            await self._flush_buffer()
            
    async def _flush_worker(self):
        """주기적 플러시 워커"""
        while self.running:
            await asyncio.sleep(self.config.flush_interval)
            
            if (self.buffer and 
                time.time() - self.last_flush >= self.config.flush_interval):
                await self._flush_buffer()
                
    async def _flush_buffer(self):
        """버퍼 비우기"""
        if not self.buffer:
            return
            
        logs_to_send = self.buffer.copy()
        self.buffer.clear()
        self.last_flush = time.time()
        
        # 재시도 로직
        for attempt in range(self.config.retry_count):
            success = await self.client.send_batch(logs_to_send)
            if success:
                break
            else:
                if attempt < self.config.retry_count - 1:
                    await asyncio.sleep(self.config.retry_delay * (2 ** attempt))


class ConsoleCollector(BaseCollector):
    """콘솔 출력 수집기"""
    
    def __init__(self, config: CollectorConfig, commands: List[str] = None):
        super().__init__("console", config)
        self.commands = commands or []
        self.processes = {}
        
    async def start_collecting(self):
        """콘솔 출력 수집 시작"""
        tasks = []
        
        for cmd in self.commands:
            task = asyncio.create_task(self._monitor_command(cmd))
            tasks.append(task)
            
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
            
    async def _monitor_command(self, command: str):
        """명령어 모니터링"""
        try:
            # 명령어 실행
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True
            )
            
            self.processes[command] = process
            
            # stdout, stderr 동시 모니터링
            tasks = [
                asyncio.create_task(self._read_stream(process.stdout, "INFO", command)),
                asyncio.create_task(self._read_stream(process.stderr, "ERROR", command))
            ]
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            await self.log("ERROR", f"명령어 실행 실패: {command}", 
                          {"error": str(e), "command": command})
            
    async def _read_stream(self, stream, level: str, command: str):
        """스트림 읽기"""
        if not stream:
            return
            
        while self.running:
            try:
                line = await stream.readline()
                if not line:
                    break
                    
                message = line.decode('utf-8', errors='ignore').strip()
                if message:
                    await self.log(
                        level=level,
                        message=message,
                        metadata={
                            "command": command,
                            "stream": "stdout" if level == "INFO" else "stderr"
                        },
                        tags=["console", command.split()[0]]
                    )
                    
            except Exception as e:
                print(f"스트림 읽기 오류: {e}")
                break


class HTTPTrafficCollector(BaseCollector):
    """HTTP 트래픽 수집기"""
    
    def __init__(self, config: CollectorConfig, ports: List[int] = None):
        super().__init__("http_traffic", config)
        self.ports = ports or [8000, 8080, 3000, 5000]
        self.servers = []
        
    async def start_collecting(self):
        """HTTP 프록시 서버 시작"""
        if not HAS_AIOHTTP:
            await self.log("ERROR", "aiohttp가 설치되지 않음")
            return
            
        from aiohttp import web
        
        for port in self.ports:
            try:
                app = web.Application()
                app.router.add_route('*', '/{path:.*}', self._proxy_handler)
                
                runner = web.AppRunner(app)
                await runner.setup()
                
                # 프록시 포트 (원래 포트 + 1000)
                proxy_port = port + 1000
                site = web.TCPSite(runner, 'localhost', proxy_port)
                await site.start()
                
                self.servers.append(runner)
                
                await self.log("INFO", f"HTTP 프록시 시작", 
                              {"original_port": port, "proxy_port": proxy_port})
                              
            except Exception as e:
                await self.log("ERROR", f"HTTP 프록시 시작 실패: 포트 {port}", 
                              {"error": str(e), "port": port})
                
        # 서버 유지
        while self.running:
            await asyncio.sleep(1)
            
    async def _proxy_handler(self, request):
        """프록시 핸들러"""
        start_time = time.time()
        
        try:
            # 원본 서버로 요청 전달
            original_port = int(request.url.port) - 1000
            target_url = f"{request.url.scheme}://localhost:{original_port}{request.path_qs}"
            
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    request.method,
                    target_url,
                    headers=request.headers,
                    data=await request.read()
                ) as resp:
                    
                    # 응답 시간 계산
                    duration_ms = int((time.time() - start_time) * 1000)
                    
                    # 로그 기록
                    await self.log(
                        level="INFO" if resp.status < 400 else "WARN" if resp.status < 500 else "ERROR",
                        message=f"{request.method} {request.path} - {resp.status}",
                        metadata={
                            "method": request.method,
                            "path": request.path,
                            "status": resp.status,
                            "duration_ms": duration_ms,
                            "ip": request.remote,
                            "user_agent": request.headers.get("User-Agent", ""),
                            "content_length": resp.headers.get("Content-Length", 0)
                        },
                        tags=["http", request.method.lower()]
                    )
                    
                    # 응답 반환
                    body = await resp.read()
                    return web.Response(
                        body=body,
                        status=resp.status,
                        headers=resp.headers
                    )
                    
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            
            await self.log(
                level="ERROR",
                message=f"{request.method} {request.path} - Connection Failed",
                metadata={
                    "method": request.method,
                    "path": request.path,
                    "error": str(e),
                    "duration_ms": duration_ms
                },
                tags=["http", "error"]
            )
            
            return web.Response(text="Proxy Error", status=502)


class FileWatcherCollector(BaseCollector):
    """파일 변경 감시 수집기"""
    
    def __init__(self, config: CollectorConfig, watch_paths: List[str] = None, 
                 ignore_patterns: List[str] = None):
        super().__init__("file_watcher", config)
        self.watch_paths = watch_paths or ["./"]
        self.ignore_patterns = ignore_patterns or ["*.pyc", "*.log", "__pycache__", ".git"]
        self.observer = None
        
    async def start_collecting(self):
        """파일 감시 시작"""
        if not HAS_WATCHDOG:
            await self.log("ERROR", "watchdog 라이브러리가 설치되지 않음")
            return
            
        self.observer = Observer()
        event_handler = FileChangeHandler(self)
        
        for path in self.watch_paths:
            if os.path.exists(path):
                self.observer.schedule(event_handler, path, recursive=True)
                await self.log("INFO", f"파일 감시 시작: {path}")
            else:
                await self.log("WARN", f"경로가 존재하지 않음: {path}")
                
        self.observer.start()
        
        # 감시 유지
        while self.running:
            await asyncio.sleep(1)
            
        self.observer.stop()
        self.observer.join()
        
    def should_ignore(self, file_path: str) -> bool:
        """파일 무시 여부 확인"""
        for pattern in self.ignore_patterns:
            if pattern.startswith("*."):
                if file_path.endswith(pattern[1:]):
                    return True
            elif pattern in file_path:
                return True
        return False


class FileChangeHandler(FileSystemEventHandler):
    """파일 변경 이벤트 핸들러"""
    
    def __init__(self, collector: FileWatcherCollector):
        self.collector = collector
        
    def on_modified(self, event):
        if not event.is_directory and not self.collector.should_ignore(event.src_path):
            asyncio.create_task(self._log_change("modified", event.src_path))
            
    def on_created(self, event):
        if not event.is_directory and not self.collector.should_ignore(event.src_path):
            asyncio.create_task(self._log_change("created", event.src_path))
            
    def on_deleted(self, event):
        if not event.is_directory and not self.collector.should_ignore(event.src_path):
            asyncio.create_task(self._log_change("deleted", event.src_path))
            
    async def _log_change(self, action: str, file_path: str):
        """파일 변경 로그"""
        file_stats = {}
        if action != "deleted" and os.path.exists(file_path):
            stat = os.stat(file_path)
            file_stats = {
                "size": stat.st_size,
                "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat()
            }
            
        await self.collector.log(
            level="INFO",
            message=f"파일 {action}: {os.path.basename(file_path)}",
            metadata={
                "action": action,
                "file_path": file_path,
                "file_name": os.path.basename(file_path),
                "directory": os.path.dirname(file_path),
                **file_stats
            },
            tags=["file", action, Path(file_path).suffix.lstrip('.')]
        )


class ProcessMonitorCollector(BaseCollector):
    """프로세스 모니터링 수집기"""
    
    def __init__(self, config: CollectorConfig, 
                 monitor_processes: List[str] = None,
                 check_interval: float = 5.0):
        super().__init__("process_monitor", config)
        self.monitor_processes = monitor_processes or []
        self.check_interval = check_interval
        self.last_stats = {}
        
    async def start_collecting(self):
        """프로세스 모니터링 시작"""
        if not HAS_PSUTIL:
            await self.log("ERROR", "psutil 라이브러리가 설치되지 않음")
            return
            
        while self.running:
            await self._check_processes()
            await asyncio.sleep(self.check_interval)
            
    async def _check_processes(self):
        """프로세스 상태 확인"""
        try:
            current_stats = {}
            
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
                try:
                    info = proc.info
                    name = info['name']
                    
                    # 모니터링 대상 프로세스만 또는 모든 프로세스
                    if not self.monitor_processes or name in self.monitor_processes:
                        current_stats[info['pid']] = {
                            'name': name,
                            'cpu_percent': info['cpu_percent'],
                            'memory_mb': info['memory_info'].rss / 1024 / 1024,
                            'status': proc.status()
                        }
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
            # 이전 상태와 비교하여 변화 감지
            for pid, stats in current_stats.items():
                if pid in self.last_stats:
                    old_stats = self.last_stats[pid]
                    
                    # CPU 사용률 급증 감지
                    if stats['cpu_percent'] > 80 and old_stats['cpu_percent'] < 50:
                        await self.log(
                            level="WARN",
                            message=f"높은 CPU 사용률: {stats['name']} ({stats['cpu_percent']:.1f}%)",
                            metadata=stats,
                            tags=["process", "cpu", "high_usage"]
                        )
                        
                    # 메모리 사용량 급증 감지  
                    if stats['memory_mb'] > old_stats['memory_mb'] * 1.5:
                        await self.log(
                            level="WARN", 
                            message=f"메모리 사용량 증가: {stats['name']} ({stats['memory_mb']:.1f}MB)",
                            metadata=stats,
                            tags=["process", "memory", "increase"]
                        )
                else:
                    # 새 프로세스 시작
                    await self.log(
                        level="INFO",
                        message=f"프로세스 시작: {stats['name']} (PID: {pid})",
                        metadata=stats,
                        tags=["process", "start"]
                    )
                    
            # 종료된 프로세스 감지
            for pid in self.last_stats:
                if pid not in current_stats:
                    old_stats = self.last_stats[pid]
                    await self.log(
                        level="INFO",
                        message=f"프로세스 종료: {old_stats['name']} (PID: {pid})",
                        metadata=old_stats,
                        tags=["process", "stop"]
                    )
                    
            self.last_stats = current_stats
            
        except Exception as e:
            await self.log("ERROR", f"프로세스 모니터링 오류: {str(e)}")


class DatabaseQueryCollector(BaseCollector):
    """데이터베이스 쿼리 수집기"""
    
    def __init__(self, config: CollectorConfig, db_configs: List[Dict] = None):
        super().__init__("db_query", config)
        self.db_configs = db_configs or []
        self.connections = {}
        
    async def start_collecting(self):
        """DB 쿼리 모니터링 시작"""
        # 여기서는 로그 파일 모니터링 방식으로 구현
        # 실제로는 각 DB별 드라이버 후킹이 필요
        
        for db_config in self.db_configs:
            db_type = db_config.get('type', 'postgresql')
            log_path = db_config.get('log_path')
            
            if log_path and os.path.exists(log_path):
                asyncio.create_task(self._monitor_db_log(db_type, log_path))
            else:
                await self.log("WARN", f"DB 로그 파일을 찾을 수 없음: {log_path}")
                
        # 모니터링 유지
        while self.running:
            await asyncio.sleep(1)
            
    async def _monitor_db_log(self, db_type: str, log_path: str):
        """DB 로그 파일 모니터링"""
        try:
            with open(log_path, 'r') as f:
                # 파일 끝으로 이동
                f.seek(0, 2)
                
                while self.running:
                    line = f.readline()
                    if line:
                        await self._parse_db_log(db_type, line.strip())
                    else:
                        await asyncio.sleep(0.1)
                        
        except Exception as e:
            await self.log("ERROR", f"DB 로그 모니터링 오류: {str(e)}")
            
    async def _parse_db_log(self, db_type: str, log_line: str):
        """DB 로그 파싱"""
        # PostgreSQL 로그 파싱 예시
        if db_type == 'postgresql':
            # 간단한 패턴 매칭
            if 'duration:' in log_line:
                match = re.search(r'duration: ([\d.]+) ms.*statement: (.+)', log_line)
                if match:
                    duration = float(match.group(1))
                    query = match.group(2)
                    
                    level = "WARN" if duration > 1000 else "INFO"
                    
                    await self.log(
                        level=level,
                        message=f"SQL 쿼리 실행 ({duration}ms)",
                        metadata={
                            "query": query[:200],  # 처음 200글자만
                            "duration_ms": duration,
                            "db_type": db_type,
                            "slow_query": duration > 1000
                        },
                        tags=["database", db_type, "query"]
                    )


class CollectorManager:
    """수집기 관리자"""
    
    def __init__(self, config_path: str = None):
        self.collectors = {}
        self.config = self._load_config(config_path)
        self.running = False
        
    def _load_config(self, config_path: str) -> Dict:
        """설정 파일 로드"""
        default_config = {
            "server": {
                "rpc_url": "http://localhost:8888/rpc"
            },
            "collectors": {
                "console": {
                    "enabled": True,
                    "commands": ["python app.py", "npm start"]
                },
                "http_traffic": {
                    "enabled": True,
                    "ports": [8000, 8080, 3000]
                },
                "file_watcher": {
                    "enabled": True,
                    "watch_paths": ["./src", "./config"],
                    "ignore_patterns": ["*.pyc", "node_modules", ".git"]
                },
                "process_monitor": {
                    "enabled": False,
                    "check_interval": 5.0
                },
                "db_query": {
                    "enabled": False,
                    "databases": []
                }
            }
        }
        
        if config_path and os.path.exists(config_path):
            try:
                import yaml
                with open(config_path, 'r') as f:
                    loaded_config = yaml.safe_load(f)
                    # 딕셔너리 병합
                    default_config.update(loaded_config)
            except Exception as e:
                print(f"설정 파일 로드 실패: {e}")
                
        return default_config
        
    def create_collectors(self):
        """수집기 생성"""
        base_config = CollectorConfig(
            rpc_server=self.config["server"]["rpc_url"]
        )
        
        collectors_config = self.config["collectors"]
        
        # 콘솔 수집기
        if collectors_config["console"]["enabled"]:
            console_config = CollectorConfig(**base_config.__dict__)
            console_config.enabled = True
            self.collectors["console"] = ConsoleCollector(
                console_config,
                collectors_config["console"]["commands"]
            )
            
        # HTTP 트래픽 수집기
        if collectors_config["http_traffic"]["enabled"]:
            http_config = CollectorConfig(**base_config.__dict__)
            http_config.enabled = True
            self.collectors["http_traffic"] = HTTPTrafficCollector(
                http_config,
                collectors_config["http_traffic"]["ports"]
            )
            
        # 파일 감시 수집기
        if collectors_config["file_watcher"]["enabled"]:
            file_config = CollectorConfig(**base_config.__dict__)
            file_config.enabled = True
            self.collectors["file_watcher"] = FileWatcherCollector(
                file_config,
                collectors_config["file_watcher"]["watch_paths"],
                collectors_config["file_watcher"]["ignore_patterns"]
            )
            
        # 프로세스 모니터
        if collectors_config["process_monitor"]["enabled"]:
            process_config = CollectorConfig(**base_config.__dict__)
            process_config.enabled = True
            self.collectors["process_monitor"] = ProcessMonitorCollector(
                process_config,
                check_interval=collectors_config["process_monitor"]["check_interval"]
            )
            
        # DB 쿼리 수집기
        if collectors_config["db_query"]["enabled"]:
            db_config = CollectorConfig(**base_config.__dict__)
            db_config.enabled = True
            self.collectors["db_query"] = DatabaseQueryCollector(
                db_config,
                collectors_config["db_query"]["databases"]
            )
            
    async def start_all(self, collector_names: List[str] = None):
        """모든 또는 지정된 수집기 시작"""
        self.create_collectors()
        
        if collector_names:
            selected_collectors = {k: v for k, v in self.collectors.items() 
                                 if k in collector_names}
        else:
            selected_collectors = self.collectors
            
        if not selected_collectors:
            print("시작할 수집기가 없습니다.")
            return
            
        print(f"수집기 시작: {list(selected_collectors.keys())}")
        self.running = True
        
        tasks = []
        for name, collector in selected_collectors.items():
            task = asyncio.create_task(collector.start())
            tasks.append(task)
            
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
        except KeyboardInterrupt:
            print("\n수집기 중지 중...")
        finally:
            await self.stop_all()
            
    async def stop_all(self):
        """모든 수집기 중지"""
        self.running = False
        tasks = []
        
        for collector in self.collectors.values():
            if hasattr(collector, 'stop'):
                tasks.append(asyncio.create_task(collector.stop()))
                
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
            
        print("모든 수집기 중지됨")


async def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='로그 수집기 시작')
    parser.add_argument('--config', default=None, help='설정 파일 경로')
    parser.add_argument('--collectors', nargs='*', help='시작할 수집기 목록')
    parser.add_argument('--list', action='store_true', help='사용 가능한 수집기 목록')
    
    args = parser.parse_args()
    
    manager = CollectorManager(args.config)
    
    if args.list:
        print("사용 가능한 수집기:")
        print("- console: 콘솔 출력 수집")
        print("- http_traffic: HTTP 트래픽 수집")  
        print("- file_watcher: 파일 변경 감시")
        print("- process_monitor: 프로세스 모니터링")
        print("- db_query: 데이터베이스 쿼리 수집")
        return
        
    await manager.start_all(args.collectors)


if __name__ == '__main__':
    asyncio.run(main())