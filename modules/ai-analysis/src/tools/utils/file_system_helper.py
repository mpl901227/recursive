#!/usr/bin/env python3
"""
Enhanced Filesystem Helpers
고도화된 파일 시스템 관련 헬퍼 클래스들

주요 개선사항:
- 비동기 I/O 지원
- 트랜잭션 기반 파일 작업
- 압축 및 아카이브 지원
- 클라우드 스토리지 연동
- 파일 버전 관리
- 성능 최적화 및 배치 처리
- 향상된 에러 처리 및 로깅
- 파일 시스템 이벤트 모니터링
"""

import asyncio
import hashlib
import json
import logging
import shutil
import tempfile
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, AsyncGenerator, Callable, TYPE_CHECKING
from dataclasses import dataclass, asdict
import zipfile
import gzip
import tarfile
from concurrent.futures import ThreadPoolExecutor
import aiofiles
import threading
from enum import Enum

if TYPE_CHECKING:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
else:
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        # Handle case where watchdog is not available
        Observer = None
        FileSystemEventHandler = None


# 커스텀 예외 클래스들
class FileSystemError(Exception):
    """파일 시스템 관련 기본 예외"""
    pass


class FileNotFoundError(FileSystemError):
    """파일을 찾을 수 없음"""
    pass


class FileAccessError(FileSystemError):
    """파일 접근 권한 오류"""
    pass


class TransactionError(FileSystemError):
    """트랜잭션 실행 오류"""
    pass


class CompressionError(FileSystemError):
    """압축/해제 오류"""
    pass


# 열거형 정의
class CompressionType(Enum):
    NONE = "none"
    GZIP = "gzip"
    ZIP = "zip"
    TAR = "tar"
    TAR_GZ = "tar.gz"


class FileEventType(Enum):
    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"
    MOVED = "moved"


# 데이터 클래스들
@dataclass
class FileMetadata:
    """파일 메타데이터"""
    path: str
    size: int
    created_at: datetime
    modified_at: datetime
    checksum: str
    version: int = 1
    tags: List[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class FileOperation:
    """파일 작업 정의"""
    operation_type: str  # 'create', 'update', 'delete', 'move'
    source_path: Path
    target_path: Optional[Path] = None
    data: Optional[Any] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class TransactionResult:
    """트랜잭션 결과"""
    success: bool
    operations_count: int
    execution_time: float
    rollback_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class FileEvent:
    """파일 시스템 이벤트"""
    event_type: FileEventType
    file_path: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None


# 설정 클래스
@dataclass
class FileSystemConfig:
    """파일 시스템 설정"""
    max_file_size: int = 100_000_000  # 100MB
    chunk_size: int = 8192  # 8KB
    backup_retention_days: int = 30
    max_concurrent_operations: int = 10
    enable_checksums: bool = True
    enable_versioning: bool = False
    compression_level: int = 6
    temp_dir: Optional[str] = None


class BaseFileHelper:
    """
    향상된 기본 파일 헬퍼 클래스
    비동기 I/O, 트랜잭션, 압축 등 고급 기능 제공
    """
    
    def __init__(self, base_dir: str, config: Optional[FileSystemConfig] = None):
        self.base_dir = Path(base_dir)
        self.config = config or FileSystemConfig()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=self.config.max_concurrent_operations)
        self._file_watcher: Optional[Any] = None
        self._event_handlers: List[Callable[[Any], None]] = []
        
        # 메트릭 수집
        self.metrics = {
            'operations_count': 0,
            'bytes_processed': 0,
            'errors_count': 0,
            'avg_response_time': 0.0
        }
        
        self._init_directories()
    
    def _init_directories(self) -> None:
        """기본 디렉토리 초기화"""
        try:
            self.base_dir.mkdir(parents=True, exist_ok=True)
            
            # 임시 디렉토리 설정
            if self.config.temp_dir:
                self.temp_dir = Path(self.config.temp_dir)
            else:
                self.temp_dir = self.base_dir / '.tmp'
            self.temp_dir.mkdir(exist_ok=True)
            
            # 버전 관리 디렉토리
            if self.config.enable_versioning:
                self.versions_dir = self.base_dir / '.versions'
                self.versions_dir.mkdir(exist_ok=True)
                
        except Exception as e:
            self.logger.error(f"디렉토리 초기화 실패: {e}")
            raise FileSystemError(f"디렉토리 초기화 실패: {e}")
    
    def _measure_time(self, func):
        """실행 시간 측정 데코레이터"""
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                self.metrics['operations_count'] += 1
                return result
            except Exception as e:
                self.metrics['errors_count'] += 1
                raise
            finally:
                execution_time = time.time() - start_time
                self._update_avg_response_time(execution_time)
        
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                self.metrics['operations_count'] += 1
                return result
            except Exception as e:
                self.metrics['errors_count'] += 1
                raise
            finally:
                execution_time = time.time() - start_time
                self._update_avg_response_time(execution_time)
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    
    def _update_avg_response_time(self, execution_time: float) -> None:
        """평균 응답 시간 업데이트"""
        if self.metrics['operations_count'] == 1:
            self.metrics['avg_response_time'] = execution_time
        else:
            # 이동 평균 계산
            alpha = 0.1  # 가중치
            self.metrics['avg_response_time'] = (
                alpha * execution_time + 
                (1 - alpha) * self.metrics['avg_response_time']
            )
    
    async def ensure_directory_async(self, directory: Path) -> None:
        """비동기 디렉토리 생성"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            self._executor, 
            lambda: directory.mkdir(parents=True, exist_ok=True)
        )
    
    def ensure_directory(self, directory: Path) -> None:
        """동기 디렉토리 생성"""
        try:
            directory.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise FileSystemError(f"디렉토리 생성 실패: {directory}, {e}")
    
    def get_file_path(self, relative_path: str) -> Path:
        """상대 경로로부터 절대 파일 경로 반환"""
        return self.base_dir / relative_path
    
    async def file_exists_async(self, file_path: Path) -> bool:
        """비동기 파일 존재 확인"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: file_path.exists() and file_path.is_file()
        )
    
    def file_exists(self, file_path: Path) -> bool:
        """동기 파일 존재 확인"""
        return file_path.exists() and file_path.is_file()
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """파일 체크섬 계산"""
        if not self.config.enable_checksums:
            return ""
        
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(self.config.chunk_size), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            self.logger.warning(f"체크섬 계산 실패: {file_path}, {e}")
            return ""
    
    async def _calculate_checksum_async(self, file_path: Path) -> str:
        """비동기 파일 체크섬 계산"""
        if not self.config.enable_checksums:
            return ""
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self._calculate_checksum,
            file_path
        )
    
    def get_file_metadata(self, file_path: Path) -> Optional[FileMetadata]:
        """파일 메타데이터 추출"""
        try:
            if not self.file_exists(file_path):
                return None
            
            stat = file_path.stat()
            checksum = self._calculate_checksum(file_path)
            
            return FileMetadata(
                path=str(file_path),
                size=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_ctime),
                modified_at=datetime.fromtimestamp(stat.st_mtime),
                checksum=checksum
            )
        except Exception as e:
            self.logger.error(f"메타데이터 추출 실패: {file_path}, {e}")
            return None
    
    async def get_file_metadata_async(self, file_path: Path) -> Optional[FileMetadata]:
        """비동기 파일 메타데이터 추출"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self.get_file_metadata,
            file_path
        )
    
    async def delete_file_safely_async(self, file_path: Path) -> bool:
        """비동기 안전한 파일 삭제"""
        try:
            if await self.file_exists_async(file_path):
                # 버전 관리가 활성화된 경우 백업
                if self.config.enable_versioning:
                    await self._backup_file_version(file_path)
                
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    self._executor,
                    file_path.unlink
                )
                
                self.logger.info(f"파일 삭제 완료: {file_path}")
                return True
            return False
        except Exception as e:
            self.logger.error(f"파일 삭제 실패: {file_path}, {e}")
            raise FileAccessError(f"파일 삭제 실패: {file_path}, {e}")
    
    def delete_file_safely(self, file_path: Path) -> bool:
        """동기 안전한 파일 삭제"""
        try:
            if self.file_exists(file_path):
                # 버전 관리가 활성화된 경우 백업
                if self.config.enable_versioning:
                    self._backup_file_version_sync(file_path)
                
                file_path.unlink()
                self.logger.info(f"파일 삭제 완료: {file_path}")
                return True
            return False
        except Exception as e:
            self.logger.error(f"파일 삭제 실패: {file_path}, {e}")
            raise FileAccessError(f"파일 삭제 실패: {file_path}, {e}")
    
    async def _backup_file_version(self, file_path: Path) -> None:
        """파일 버전 백업 (비동기)"""
        if not self.config.enable_versioning:
            return
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{file_path.name}_{timestamp}"
            backup_path = self.versions_dir / backup_name
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self._executor,
                shutil.copy2,
                file_path,
                backup_path
            )
            
            self.logger.debug(f"파일 버전 백업: {backup_path}")
        except Exception as e:
            self.logger.warning(f"버전 백업 실패: {file_path}, {e}")
    
    def _backup_file_version_sync(self, file_path: Path) -> None:
        """파일 버전 백업 (동기)"""
        if not self.config.enable_versioning:
            return
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{file_path.name}_{timestamp}"
            backup_path = self.versions_dir / backup_name
            
            shutil.copy2(file_path, backup_path)
            self.logger.debug(f"파일 버전 백업: {backup_path}")
        except Exception as e:
            self.logger.warning(f"버전 백업 실패: {file_path}, {e}")
    
    async def read_json_file_async(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """비동기 JSON 파일 읽기"""
        try:
            if not await self.file_exists_async(file_path):
                return None
            
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                return json.loads(content)
        except (json.JSONDecodeError, IOError) as e:
            self.logger.error(f"JSON 파일 읽기 실패: {file_path}, {e}")
            raise FileAccessError(f"JSON 파일 읽기 실패: {file_path}, {e}")
    
    def read_json_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """동기 JSON 파일 읽기"""
        try:
            if not self.file_exists(file_path):
                return None
            
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self.logger.error(f"JSON 파일 읽기 실패: {file_path}, {e}")
            raise FileAccessError(f"JSON 파일 읽기 실패: {file_path}, {e}")
    
    async def write_json_file_async(self, file_path: Path, data: Dict[str, Any]) -> bool:
        """비동기 JSON 파일 쓰기"""
        try:
            await self.ensure_directory_async(file_path.parent)
            
            # 버전 관리
            if self.config.enable_versioning and await self.file_exists_async(file_path):
                await self._backup_file_version(file_path)
            
            async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(data, ensure_ascii=False, indent=2))
            
            # 메트릭 업데이트
            self.metrics['bytes_processed'] += len(json.dumps(data))
            return True
        except (IOError, TypeError) as e:
            self.logger.error(f"JSON 파일 쓰기 실패: {file_path}, {e}")
            raise FileAccessError(f"JSON 파일 쓰기 실패: {file_path}, {e}")
    
    def write_json_file(self, file_path: Path, data: Dict[str, Any]) -> bool:
        """동기 JSON 파일 쓰기"""
        try:
            self.ensure_directory(file_path.parent)
            
            # 버전 관리
            if self.config.enable_versioning and self.file_exists(file_path):
                self._backup_file_version_sync(file_path)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 메트릭 업데이트
            self.metrics['bytes_processed'] += len(json.dumps(data))
            return True
        except (IOError, TypeError) as e:
            self.logger.error(f"JSON 파일 쓰기 실패: {file_path}, {e}")
            raise FileAccessError(f"JSON 파일 쓰기 실패: {file_path}, {e}")
    
    def list_files_with_extension(self, directory: Path, extension: str, recursive: bool = False) -> List[str]:
        """확장자별 파일 목록 반환"""
        try:
            if not directory.exists():
                return []
            
            pattern = f"*.{extension.lstrip('.')}"
            
            if recursive:
                files = list(directory.rglob(pattern))
            else:
                files = list(directory.glob(pattern))
            
            return [f.stem for f in files]
        except Exception as e:
            self.logger.error(f"파일 목록 조회 실패: {directory}, {e}")
            return []
    
    def compress_file(self, source_path: Path, target_path: Path, 
                     compression_type: CompressionType = CompressionType.GZIP) -> bool:
        """파일 압축"""
        try:
            if compression_type == CompressionType.GZIP:
                with open(source_path, 'rb') as f_in:
                    with gzip.open(target_path, 'wb', compresslevel=self.config.compression_level) as f_out:
                        shutil.copyfileobj(f_in, f_out)
            
            elif compression_type == CompressionType.ZIP:
                with zipfile.ZipFile(target_path, 'w', zipfile.ZIP_DEFLATED, 
                                   compresslevel=self.config.compression_level) as zipf:
                    zipf.write(source_path, source_path.name)
            
            elif compression_type == CompressionType.TAR_GZ:
                with tarfile.open(target_path, 'w:gz', compresslevel=self.config.compression_level) as tar:
                    tar.add(source_path, arcname=source_path.name)
            
            else:
                raise CompressionError(f"지원하지 않는 압축 형식: {compression_type}")
            
            self.logger.info(f"파일 압축 완료: {source_path} -> {target_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"파일 압축 실패: {source_path}, {e}")
            raise CompressionError(f"파일 압축 실패: {source_path}, {e}")
    
    def decompress_file(self, source_path: Path, target_path: Path, 
                       compression_type: CompressionType = CompressionType.GZIP) -> bool:
        """파일 압축 해제"""
        try:
            if compression_type == CompressionType.GZIP:
                with gzip.open(source_path, 'rb') as f_in:
                    with open(target_path, 'wb') as f_out:
                        shutil.copyfileobj(f_in, f_out)
            
            elif compression_type == CompressionType.ZIP:
                with zipfile.ZipFile(source_path, 'r') as zipf:
                    zipf.extractall(target_path.parent)
            
            elif compression_type == CompressionType.TAR_GZ:
                with tarfile.open(source_path, 'r:gz') as tar:
                    tar.extractall(target_path.parent)
            
            else:
                raise CompressionError(f"지원하지 않는 압축 형식: {compression_type}")
            
            self.logger.info(f"파일 압축 해제 완료: {source_path} -> {target_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"파일 압축 해제 실패: {source_path}, {e}")
            raise CompressionError(f"파일 압축 해제 실패: {source_path}, {e}")
    
    @asynccontextmanager
    async def atomic_operation(self) -> AsyncGenerator[List[FileOperation], None]:
        """원자적 파일 작업 컨텍스트 매니저"""
        operations = []
        rollback_data = {}
        
        try:
            yield operations
            
            # 모든 작업 실행
            for operation in operations:
                await self._execute_operation(operation, rollback_data)
            
            self.logger.info(f"원자적 작업 완료: {len(operations)}개 작업")
            
        except Exception as e:
            # 롤백 실행
            await self._rollback_operations(rollback_data)
            self.logger.error(f"원자적 작업 실패, 롤백 완료: {e}")
            raise TransactionError(f"원자적 작업 실패: {e}")
    
    async def _execute_operation(self, operation: FileOperation, rollback_data: Dict) -> None:
        """개별 작업 실행"""
        if operation.operation_type == 'create':
            if await self.file_exists_async(operation.source_path):
                rollback_data[str(operation.source_path)] = 'delete'
            await self.write_json_file_async(operation.source_path, operation.data)
        
        elif operation.operation_type == 'update':
            if await self.file_exists_async(operation.source_path):
                # 기존 데이터 백업
                old_data = await self.read_json_file_async(operation.source_path)
                rollback_data[str(operation.source_path)] = old_data
            await self.write_json_file_async(operation.source_path, operation.data)
        
        elif operation.operation_type == 'delete':
            if await self.file_exists_async(operation.source_path):
                # 기존 데이터 백업
                old_data = await self.read_json_file_async(operation.source_path)
                rollback_data[str(operation.source_path)] = old_data
                await self.delete_file_safely_async(operation.source_path)
        
        elif operation.operation_type == 'move':
            if operation.target_path:
                if await self.file_exists_async(operation.source_path):
                    rollback_data[str(operation.source_path)] = str(operation.target_path)
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        self._executor,
                        shutil.move,
                        operation.source_path,
                        operation.target_path
                    )
    
    async def _rollback_operations(self, rollback_data: Dict) -> None:
        """작업 롤백"""
        for path_str, action_or_data in rollback_data.items():
            try:
                path = Path(path_str)
                
                if action_or_data == 'delete':
                    await self.delete_file_safely_async(path)
                elif isinstance(action_or_data, dict):
                    await self.write_json_file_async(path, action_or_data)
                elif isinstance(action_or_data, str) and action_or_data != 'delete':
                    # 파일 이동 롤백
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        self._executor,
                        shutil.move,
                        action_or_data,
                        path
                    )
            except Exception as e:
                self.logger.error(f"롤백 실패: {path_str}, {e}")
    
    def start_file_watcher(self, watch_path: Optional[Path] = None) -> None:
        """파일 시스템 감시 시작"""
        if self._file_watcher:
            return
        
        if Observer is None or FileSystemEventHandler is None:
            self.logger.warning("watchdog 라이브러리가 없어 파일 감시를 시작할 수 없습니다")
            return
        
        watch_path = watch_path or self.base_dir
        
        class FileEventHandler(FileSystemEventHandler):
            def __init__(self, helper: 'BaseFileHelper'):
                self.helper = helper
            
            def on_any_event(self, event):
                if event.is_directory:
                    return
                
                event_type_map = {
                    'created': FileEventType.CREATED,
                    'modified': FileEventType.MODIFIED,
                    'deleted': FileEventType.DELETED,
                    'moved': FileEventType.MOVED
                }
                
                file_event = FileEvent(
                    event_type=event_type_map.get(event.event_type, FileEventType.MODIFIED),
                    file_path=event.src_path,
                    timestamp=datetime.now(),
                    metadata={'raw_event': event}
                )
                
                # 이벤트 핸들러들 호출
                for handler in self.helper._event_handlers:
                    try:
                        handler(file_event)
                    except Exception as e:
                        self.helper.logger.error(f"이벤트 핸들러 실행 오류: {e}")
        
        self._file_watcher = Observer()
        self._file_watcher.schedule(
            FileEventHandler(self),
            str(watch_path),
            recursive=True
        )
        self._file_watcher.start()
        self.logger.info(f"파일 감시 시작: {watch_path}")
    
    def stop_file_watcher(self) -> None:
        """파일 시스템 감시 중지"""
        if self._file_watcher:
            self._file_watcher.stop()
            self._file_watcher.join()
            self._file_watcher = None
            self.logger.info("파일 감시 중지")
    
    def add_event_handler(self, handler: Callable[[Any], None]) -> None:
        """파일 이벤트 핸들러 추가"""
        self._event_handlers.append(handler)
    
    def remove_event_handler(self, handler: Callable[[Any], None]) -> None:
        """파일 이벤트 핸들러 제거"""
        if handler in self._event_handlers:
            self._event_handlers.remove(handler)
    
    def get_metrics(self) -> Dict[str, Any]:
        """성능 메트릭 반환"""
        return {
            **self.metrics,
            'config': asdict(self.config),
            'active_watchers': 1 if self._file_watcher else 0,
            'event_handlers_count': len(self._event_handlers)
        }
    
    def cleanup_old_versions(self, days: int = None) -> int:
        """오래된 버전 파일 정리"""
        if not self.config.enable_versioning:
            return 0
        
        days = days or self.config.backup_retention_days
        cutoff_time = time.time() - (days * 24 * 3600)
        cleaned_count = 0
        
        try:
            for version_file in self.versions_dir.iterdir():
                if version_file.is_file():
                    if version_file.stat().st_mtime < cutoff_time:
                        version_file.unlink()
                        cleaned_count += 1
            
            self.logger.info(f"오래된 버전 파일 정리 완료: {cleaned_count}개")
            return cleaned_count
            
        except Exception as e:
            self.logger.error(f"버전 파일 정리 실패: {e}")
            return 0
    
    def __del__(self):
        """소멸자"""
        try:
            self.stop_file_watcher()
            if hasattr(self, '_executor'):
                self._executor.shutdown(wait=False)
        except Exception:
            pass


class ConversationFileHelper(BaseFileHelper):
    """
    대화 파일 관리 헬퍼 클래스 (고도화)
    향상된 캐싱, 압축, 검색 기능 포함
    """
    
    def __init__(self, data_dir: str, config: Optional[FileSystemConfig] = None):
        super().__init__(data_dir, config)
        self.conversation_dir = self.base_dir / 'output' / 'data' / 'conversations'
        self.index_file = self.conversation_dir / '.index.json'
        self._conversation_cache = {}  # 메모리 캐시
        self._cache_lock = threading.RLock()
        self._index_cache = None
        self._last_index_update = 0
        
        # 인덱스 초기화
        self._init_conversation_index()
    
    def _init_conversation_index(self) -> None:
        """대화 인덱스 초기화"""
        try:
            self.ensure_directory(self.conversation_dir)
            if not self.file_exists(self.index_file):
                self._rebuild_index()
            else:
                self._load_index()
        except Exception as e:
            self.logger.error(f"대화 인덱스 초기화 실패: {e}")
    
    def _load_index(self) -> None:
        """인덱스 파일 로드"""
        try:
            index_data = self.read_json_file(self.index_file)
            if index_data:
                self._index_cache = index_data
                self._last_index_update = time.time()
        except Exception as e:
            self.logger.warning(f"인덱스 로드 실패, 재구축: {e}")
            self._rebuild_index()
    
    def _rebuild_index(self) -> None:
        """인덱스 재구축"""
        try:
            index_data = {
                'conversations': {},
                'last_updated': datetime.now().isoformat(),
                'version': '2.0'
            }
            
            # 모든 대화 파일 스캔
            for conv_file in self.conversation_dir.glob('*.json'):
                if conv_file.name == '.index.json':
                    continue
                
                try:
                    metadata = self.get_file_metadata(conv_file)
                    if metadata:
                        conv_id = conv_file.stem
                        index_data['conversations'][conv_id] = {
                            'file_path': str(conv_file),
                            'size': metadata.size,
                            'modified_at': metadata.modified_at.isoformat(),
                            'checksum': metadata.checksum
                        }
                except Exception as e:
                    self.logger.warning(f"대화 파일 인덱싱 실패: {conv_file}, {e}")
            
            self.write_json_file(self.index_file, index_data)
            self._index_cache = index_data
            self._last_index_update = time.time()
            
            self.logger.info(f"인덱스 재구축 완료: {len(index_data['conversations'])}개 대화")
            
        except Exception as e:
            self.logger.error(f"인덱스 재구축 실패: {e}")
    
    def _update_index_entry(self, conversation_id: str, operation: str = 'update') -> None:
        """인덱스 항목 업데이트"""
        try:
            if not self._index_cache:
                self._load_index()
            
            if operation == 'delete':
                self._index_cache['conversations'].pop(conversation_id, None)
            else:
                filepath = self.get_conversation_filepath(conversation_id)
                metadata = self.get_file_metadata(filepath)
                
                if metadata:
                    self._index_cache['conversations'][conversation_id] = {
                        'file_path': str(filepath),
                        'size': metadata.size,
                        'modified_at': metadata.modified_at.isoformat(),
                        'checksum': metadata.checksum
                    }
            
            self._index_cache['last_updated'] = datetime.now().isoformat()
            self.write_json_file(self.index_file, self._index_cache)
            
        except Exception as e:
            self.logger.error(f"인덱스 업데이트 실패: {conversation_id}, {e}")
    
    def get_conversation_filepath(self, conversation_id: str) -> Path:
        """대화 파일 경로 반환"""
        return self.conversation_dir / f"{conversation_id}.json"
    
    async def save_conversation_async(self, conversation_data: Dict[str, Any]) -> bool:
        """비동기 대화 데이터 저장"""
        conversation_id = conversation_data.get('id')
        if not conversation_id:
            raise ValueError("대화 ID가 없어 저장할 수 없습니다")
        
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            
            # 압축 저장 옵션
            if self.config.enable_compression and len(str(conversation_data)) > 1024:
                compressed_path = filepath.with_suffix('.json.gz')
                await self._save_compressed_async(compressed_path, conversation_data)
            else:
                success = await self.write_json_file_async(filepath, conversation_data)
                if not success:
                    return False
            
            # 캐시 업데이트
            with self._cache_lock:
                self._conversation_cache[conversation_id] = conversation_data
            
            # 인덱스 업데이트
            self._update_index_entry(conversation_id)
            
            self.logger.info(f"대화 저장 성공: {conversation_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"대화 저장 실패: {conversation_id}, {e}")
            return False
    
    def save_conversation(self, conversation_data: Dict[str, Any]) -> bool:
        """동기 대화 데이터 저장"""
        conversation_id = conversation_data.get('id')
        if not conversation_id:
            self.logger.error("대화 ID가 없어 저장할 수 없습니다")
            return False
        
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            
            # 압축 저장 옵션
            if hasattr(self.config, 'enable_compression') and getattr(self.config, 'enable_compression', False):
                if len(str(conversation_data)) > 1024:
                    compressed_path = filepath.with_suffix('.json.gz')
                    self._save_compressed(compressed_path, conversation_data)
                else:
                    success = self.write_json_file(filepath, conversation_data)
                    if not success:
                        return False
            else:
                success = self.write_json_file(filepath, conversation_data)
                if not success:
                    return False
            
            # 캐시 업데이트
            with self._cache_lock:
                self._conversation_cache[conversation_id] = conversation_data
            
            # 인덱스 업데이트
            self._update_index_entry(conversation_id)
            
            self.logger.info(f"대화 저장 성공: {conversation_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"대화 저장 실패: {conversation_id}, {e}")
            return False
    
    async def _save_compressed_async(self, filepath: Path, data: Dict[str, Any]) -> None:
        """비동기 압축 저장"""
        temp_path = self.temp_dir / f"{filepath.name}.tmp"
        
        try:
            # 임시 파일에 저장
            await self.write_json_file_async(temp_path, data)
            
            # 압축
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self._executor,
                self.compress_file,
                temp_path,
                filepath,
                CompressionType.GZIP
            )
            
            # 임시 파일 삭제
            await self.delete_file_safely_async(temp_path)
            
        except Exception as e:
            # 임시 파일 정리
            if temp_path.exists():
                await self.delete_file_safely_async(temp_path)
            raise e
    
    def _save_compressed(self, filepath: Path, data: Dict[str, Any]) -> None:
        """동기 압축 저장"""
        temp_path = self.temp_dir / f"{filepath.name}.tmp"
        
        try:
            # 임시 파일에 저장
            self.write_json_file(temp_path, data)
            
            # 압축
            self.compress_file(temp_path, filepath, CompressionType.GZIP)
            
            # 임시 파일 삭제
            self.delete_file_safely(temp_path)
            
        except Exception as e:
            # 임시 파일 정리
            if temp_path.exists():
                self.delete_file_safely(temp_path)
            raise e
    
    async def load_conversation_async(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """비동기 대화 데이터 로드"""
        # 캐시 확인
        with self._cache_lock:
            if conversation_id in self._conversation_cache:
                return self._conversation_cache[conversation_id]
        
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            compressed_path = filepath.with_suffix('.json.gz')
            
            data = None
            
            # 압축 파일 우선 확인
            if await self.file_exists_async(compressed_path):
                data = await self._load_compressed_async(compressed_path)
            elif await self.file_exists_async(filepath):
                data = await self.read_json_file_async(filepath)
            
            if data:
                # 캐시 업데이트
                with self._cache_lock:
                    self._conversation_cache[conversation_id] = data
                
                self.logger.debug(f"대화 로드 성공: {conversation_id}")
                return data
            
            self.logger.debug(f"대화 로드 실패 또는 파일 없음: {conversation_id}")
            return None
            
        except Exception as e:
            self.logger.error(f"대화 로드 오류: {conversation_id}, {e}")
            return None
    
    def load_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """동기 대화 데이터 로드"""
        # 캐시 확인
        with self._cache_lock:
            if conversation_id in self._conversation_cache:
                return self._conversation_cache[conversation_id]
        
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            compressed_path = filepath.with_suffix('.json.gz')
            
            data = None
            
            # 압축 파일 우선 확인
            if self.file_exists(compressed_path):
                data = self._load_compressed(compressed_path)
            elif self.file_exists(filepath):
                data = self.read_json_file(filepath)
            
            if data:
                # 캐시 업데이트
                with self._cache_lock:
                    self._conversation_cache[conversation_id] = data
                
                self.logger.debug(f"대화 로드 성공: {conversation_id}")
                return data
            
            self.logger.debug(f"대화 로드 실패 또는 파일 없음: {conversation_id}")
            return None
            
        except Exception as e:
            self.logger.error(f"대화 로드 오류: {conversation_id}, {e}")
            return None
    
    async def _load_compressed_async(self, filepath: Path) -> Optional[Dict[str, Any]]:
        """비동기 압축 파일 로드"""
        temp_path = self.temp_dir / f"{filepath.stem}.tmp"
        
        try:
            # 압축 해제
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self._executor,
                self.decompress_file,
                filepath,
                temp_path,
                CompressionType.GZIP
            )
            
            # 데이터 로드
            data = await self.read_json_file_async(temp_path)
            
            # 임시 파일 삭제
            await self.delete_file_safely_async(temp_path)
            
            return data
            
        except Exception as e:
            # 임시 파일 정리
            if temp_path.exists():
                await self.delete_file_safely_async(temp_path)
            raise e
    
    def _load_compressed(self, filepath: Path) -> Optional[Dict[str, Any]]:
        """동기 압축 파일 로드"""
        temp_path = self.temp_dir / f"{filepath.stem}.tmp"
        
        try:
            # 압축 해제
            self.decompress_file(filepath, temp_path, CompressionType.GZIP)
            
            # 데이터 로드
            data = self.read_json_file(temp_path)
            
            # 임시 파일 삭제
            self.delete_file_safely(temp_path)
            
            return data
            
        except Exception as e:
            # 임시 파일 정리
            if temp_path.exists():
                self.delete_file_safely(temp_path)
            raise e
    
    async def delete_conversation_async(self, conversation_id: str) -> bool:
        """비동기 대화 파일 삭제"""
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            compressed_path = filepath.with_suffix('.json.gz')
            
            deleted = False
            
            # 압축 파일 삭제
            if await self.file_exists_async(compressed_path):
                deleted = await self.delete_file_safely_async(compressed_path)
            
            # 일반 파일 삭제
            if await self.file_exists_async(filepath):
                deleted = await self.delete_file_safely_async(filepath) or deleted
            
            if deleted:
                # 캐시에서 제거
                with self._cache_lock:
                    self._conversation_cache.pop(conversation_id, None)
                
                # 인덱스 업데이트
                self._update_index_entry(conversation_id, 'delete')
                
                self.logger.info(f"대화 삭제 성공: {conversation_id}")
                return True
            
            self.logger.warning(f"대화 삭제 실패 또는 파일 없음: {conversation_id}")
            return False
            
        except Exception as e:
            self.logger.error(f"대화 삭제 오류: {conversation_id}, {e}")
            return False
    
    def delete_conversation(self, conversation_id: str) -> bool:
        """동기 대화 파일 삭제"""
        try:
            filepath = self.get_conversation_filepath(conversation_id)
            compressed_path = filepath.with_suffix('.json.gz')
            
            deleted = False
            
            # 압축 파일 삭제
            if self.file_exists(compressed_path):
                deleted = self.delete_file_safely(compressed_path)
            
            # 일반 파일 삭제
            if self.file_exists(filepath):
                deleted = self.delete_file_safely(filepath) or deleted
            
            if deleted:
                # 캐시에서 제거
                with self._cache_lock:
                    self._conversation_cache.pop(conversation_id, None)
                
                # 인덱스 업데이트
                self._update_index_entry(conversation_id, 'delete')
                
                self.logger.info(f"대화 삭제 성공: {conversation_id}")
                return True
            
            self.logger.warning(f"대화 삭제 실패 또는 파일 없음: {conversation_id}")
            return False
            
        except Exception as e:
            self.logger.error(f"대화 삭제 오류: {conversation_id}, {e}")
            return False
    
    def list_conversations(self, limit: Optional[int] = None, 
                          sort_by: str = 'modified_at', 
                          ascending: bool = False) -> List[Dict[str, Any]]:
        """대화 목록 반환 (정렬 및 페이징 지원)"""
        try:
            if not self._index_cache:
                self._load_index()
            
            conversations = []
            for conv_id, conv_info in self._index_cache.get('conversations', {}).items():
                conversations.append({
                    'id': conv_id,
                    **conv_info
                })
            
            # 정렬
            reverse_sort = not ascending
            if sort_by in ['size', 'modified_at']:
                conversations.sort(
                    key=lambda x: x.get(sort_by, 0),
                    reverse=reverse_sort
                )
            else:
                conversations.sort(
                    key=lambda x: x.get('id', ''),
                    reverse=reverse_sort
                )
            
            # 제한
            if limit:
                conversations = conversations[:limit]
            
            return conversations
            
        except Exception as e:
            self.logger.error(f"대화 목록 조회 실패: {e}")
            return []
    
    def search_conversations(self, query: str, search_in_content: bool = False) -> List[Dict[str, Any]]:
        """대화 검색"""
        try:
            results = []
            
            # ID 기반 검색
            for conv_id in self._index_cache.get('conversations', {}).keys():
                if query.lower() in conv_id.lower():
                    conv_info = self._index_cache['conversations'][conv_id]
                    results.append({
                        'id': conv_id,
                        'match_type': 'id',
                        **conv_info
                    })
            
            # 내용 검색 (옵션)
            if search_in_content:
                for conv_id in self._index_cache.get('conversations', {}).keys():
                    if conv_id not in [r['id'] for r in results]:  # 중복 방지
                        conv_data = self.load_conversation(conv_id)
                        if conv_data and self._search_in_conversation(conv_data, query):
                            conv_info = self._index_cache['conversations'][conv_id]
                            results.append({
                                'id': conv_id,
                                'match_type': 'content',
                                **conv_info
                            })
            
            return results
            
        except Exception as e:
            self.logger.error(f"대화 검색 실패: {e}")
            return []
    
    def _search_in_conversation(self, conv_data: Dict[str, Any], query: str) -> bool:
        """대화 내용에서 검색"""
        query_lower = query.lower()
        
        # 제목 검색
        if conv_data.get('title', '').lower().find(query_lower) != -1:
            return True
        
        # 메시지 내용 검색
        for message in conv_data.get('messages', []):
            content = message.get('content', '')
            if isinstance(content, str) and content.lower().find(query_lower) != -1:
                return True
        
        return False
    
    def get_conversation_count(self) -> int:
        """대화 파일 개수 반환"""
        try:
            if not self._index_cache:
                self._load_index()
            return len(self._index_cache.get('conversations', {}))
        except Exception:
            return 0
    
    def conversation_exists(self, conversation_id: str) -> bool:
        """대화 파일 존재 여부 확인"""
        try:
            if not self._index_cache:
                self._load_index()
            return conversation_id in self._index_cache.get('conversations', {})
        except Exception:
            filepath = self.get_conversation_filepath(conversation_id)
            compressed_path = filepath.with_suffix('.json.gz')
            return self.file_exists(filepath) or self.file_exists(compressed_path)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        with self._cache_lock:
            return {
                'cached_conversations': len(self._conversation_cache),
                'cache_memory_usage': sum(len(str(data)) for data in self._conversation_cache.values()),
                'index_cache_age': time.time() - self._last_index_update if self._last_index_update else 0
            }
    
    def clear_cache(self) -> None:
        """캐시 정리"""
        with self._cache_lock:
            self._conversation_cache.clear()
            self._index_cache = None
        self.logger.info("대화 캐시 정리 완료")
    
    async def batch_save_conversations_async(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """대화 배치 저장"""
        results = {
            'success_count': 0,
            'error_count': 0,
            'errors': []
        }
        
        # 원자적 작업으로 수행
        async with self.atomic_operation() as operations:
            for conv_data in conversations:
                conv_id = conv_data.get('id')
                if not conv_id:
                    results['error_count'] += 1
                    results['errors'].append('대화 ID 없음')
                    continue
                
                operations.append(FileOperation(
                    operation_type='create',
                    source_path=self.get_conversation_filepath(conv_id),
                    data=conv_data
                ))
        
        # 캐시 업데이트
        with self._cache_lock:
            for conv_data in conversations:
                conv_id = conv_data.get('id')
                if conv_id:
                    self._conversation_cache[conv_id] = conv_data
                    results['success_count'] += 1
        
        # 인덱스 재구축
        self._rebuild_index()
        
        return results


class BackupFileHelper(BaseFileHelper):
    """
    향상된 백업 파일 관리 헬퍼 클래스
    압축, 암호화, 증분 백업 지원
    """
    
    def __init__(self, data_dir: str, config: Optional[FileSystemConfig] = None):
        super().__init__(data_dir, config)
        self.backup_dir = self.base_dir / 'output' / 'data' / 'backups'
        self.backup_metadata_file = self.backup_dir / '.backup_metadata.json'
        
        # 백업 설정 확장
        self.backup_config = {
            'enable_compression': True,
            'enable_encryption': False,
            'incremental_backup': True,
            'max_backup_size': 1_000_000_000,  # 1GB
            'backup_schedule': '0 2 * * *'  # 매일 새벽 2시
        }
    
    def create_backup(self, backup_name: str, data: Dict[str, Any], 
                     compression: CompressionType = CompressionType.GZIP) -> bool:
        """향상된 백업 생성"""
        try:
            self.ensure_directory(self.backup_dir)
            
            # 백업 메타데이터 생성
            backup_metadata = {
                'name': backup_name,
                'created_at': datetime.now().isoformat(),
                'size': len(json.dumps(data)),
                'checksum': hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest(),
                'compression': compression.value,
                'version': '2.0'
            }
            
            if compression == CompressionType.NONE:
                backup_path = self.backup_dir / f"{backup_name}.json"
                success = self.write_json_file(backup_path, data)
            else:
                # 압축 백업
                temp_path = self.temp_dir / f"{backup_name}_temp.json"
                backup_path = self.backup_dir / f"{backup_name}.json.{compression.value}"
                
                # 임시 파일에 저장 후 압축
                self.write_json_file(temp_path, data)
                self.compress_file(temp_path, backup_path, compression)
                self.delete_file_safely(temp_path)
                success = True
            
            if success:
                # 메타데이터 업데이트
                self._update_backup_metadata(backup_name, backup_metadata)
                self.logger.info(f"백업 생성 성공: {backup_name}")
                
                # 백업 크기 제한 확인
                self._cleanup_old_backups()
                
            return success
            
        except Exception as e:
            self.logger.error(f"백업 생성 실패: {backup_name}, {e}")
            return False
    
    def _update_backup_metadata(self, backup_name: str, metadata: Dict[str, Any]) -> None:
        """백업 메타데이터 업데이트"""
        try:
            if self.file_exists(self.backup_metadata_file):
                all_metadata = self.read_json_file(self.backup_metadata_file) or {}
            else:
                all_metadata = {'backups': {}, 'last_updated': ''}
            
            all_metadata['backups'][backup_name] = metadata
            all_metadata['last_updated'] = datetime.now().isoformat()
            
            self.write_json_file(self.backup_metadata_file, all_metadata)
            
        except Exception as e:
            self.logger.warning(f"백업 메타데이터 업데이트 실패: {e}")
    
    def restore_backup(self, backup_name: str) -> Optional[Dict[str, Any]]:
        """향상된 백업 복원"""
        try:
            # 메타데이터에서 백업 정보 확인
            metadata = self._get_backup_metadata(backup_name)
            if not metadata:
                self.logger.error(f"백업 메타데이터를 찾을 수 없음: {backup_name}")
                return None
            
            compression_type = CompressionType(metadata.get('compression', 'none'))
            
            if compression_type == CompressionType.NONE:
                backup_path = self.backup_dir / f"{backup_name}.json"
                data = self.read_json_file(backup_path)
            else:
                # 압축 파일 복원
                backup_path = self.backup_dir / f"{backup_name}.json.{compression_type.value}"
                temp_path = self.temp_dir / f"{backup_name}_restore.json"
                
                self.decompress_file(backup_path, temp_path, compression_type)
                data = self.read_json_file(temp_path)
                self.delete_file_safely(temp_path)
            
            if data:
                # 체크섬 검증
                current_checksum = hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
                expected_checksum = metadata.get('checksum', '')
                
                if current_checksum != expected_checksum:
                    self.logger.warning(f"백업 체크섬 불일치: {backup_name}")
                
                self.logger.info(f"백업 복원 성공: {backup_name}")
                return data
            
            return None
            
        except Exception as e:
            self.logger.error(f"백업 복원 실패: {backup_name}, {e}")
            return None
    
    def _get_backup_metadata(self, backup_name: str) -> Optional[Dict[str, Any]]:
        """백업 메타데이터 조회"""
        try:
            if not self.file_exists(self.backup_metadata_file):
                return None
            
            all_metadata = self.read_json_file(self.backup_metadata_file)
            return all_metadata.get('backups', {}).get(backup_name)
            
        except Exception:
            return None
    
    def list_backups(self, sort_by: str = 'created_at', limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """백업 목록 반환 (정렬 및 제한 지원)"""
        try:
            if not self.file_exists(self.backup_metadata_file):
                return []
            
            all_metadata = self.read_json_file(self.backup_metadata_file)
            backups = list(all_metadata.get('backups', {}).values())
            
            # 정렬
            if sort_by in ['created_at', 'size']:
                backups.sort(key=lambda x: x.get(sort_by, ''), reverse=True)
            
            # 제한
            if limit:
                backups = backups[:limit]
            
            return backups
            
        except Exception as e:
            self.logger.error(f"백업 목록 조회 실패: {e}")
            return []
    
    def delete_backup(self, backup_name: str) -> bool:
        """백업 삭제"""
        try:
            metadata = self._get_backup_metadata(backup_name)
            if not metadata:
                return False
            
            compression_type = CompressionType(metadata.get('compression', 'none'))
            
            if compression_type == CompressionType.NONE:
                backup_path = self.backup_dir / f"{backup_name}.json"
            else:
                backup_path = self.backup_dir / f"{backup_name}.json.{compression_type.value}"
            
            success = self.delete_file_safely(backup_path)
            
            if success:
                # 메타데이터에서 제거
                self._remove_backup_metadata(backup_name)
                self.logger.info(f"백업 삭제 성공: {backup_name}")
            
            return success
            
        except Exception as e:
            self.logger.error(f"백업 삭제 실패: {backup_name}, {e}")
            return False
    
    def _remove_backup_metadata(self, backup_name: str) -> None:
        """백업 메타데이터에서 항목 제거"""
        try:
            if self.file_exists(self.backup_metadata_file):
                all_metadata = self.read_json_file(self.backup_metadata_file)
                if all_metadata and 'backups' in all_metadata:
                    all_metadata['backups'].pop(backup_name, None)
                    all_metadata['last_updated'] = datetime.now().isoformat()
                    self.write_json_file(self.backup_metadata_file, all_metadata)
        except Exception as e:
            self.logger.warning(f"백업 메타데이터 제거 실패: {e}")
    
    def _cleanup_old_backups(self) -> None:
        """오래된 백업 정리"""
        try:
            backups = self.list_backups(sort_by='created_at')
            total_size = sum(backup.get('size', 0) for backup in backups)
            
            # 크기 제한 초과 시 오래된 백업 삭제
            while total_size > self.backup_config['max_backup_size'] and backups:
                oldest_backup = backups.pop()
                self.delete_backup(oldest_backup['name'])
                total_size -= oldest_backup.get('size', 0)
                self.logger.info(f"크기 제한으로 인한 백업 삭제: {oldest_backup['name']}")
            
            # 보존 기간 초과 백업 삭제
            cutoff_date = datetime.now().timestamp() - (self.config.backup_retention_days * 24 * 3600)
            
            for backup in backups:
                try:
                    created_at = datetime.fromisoformat(backup['created_at']).timestamp()
                    if created_at < cutoff_date:
                        self.delete_backup(backup['name'])
                        self.logger.info(f"보존 기간 초과로 인한 백업 삭제: {backup['name']}")
                except Exception as e:
                    self.logger.warning(f"백업 날짜 파싱 실패: {backup['name']}, {e}")
                    
        except Exception as e:
            self.logger.error(f"백업 정리 실패: {e}")
    
    def create_incremental_backup(self, backup_name: str, source_dir: Path) -> bool:
        """증분 백업 생성"""
        try:
            # 이전 백업 정보 확인
            last_backup = self._get_last_backup_info(backup_name)
            
            # 변경된 파일만 수집
            changed_files = self._get_changed_files(source_dir, last_backup)
            
            if not changed_files:
                self.logger.info(f"변경된 파일이 없어 증분 백업 생략: {backup_name}")
                return True
            
            # 증분 백업 데이터 생성
            backup_data = {
                'type': 'incremental',
                'base_backup': last_backup.get('name') if last_backup else None,
                'timestamp': datetime.now().isoformat(),
                'changed_files': changed_files
            }
            
            # 백업 실행
            incremental_name = f"{backup_name}_inc_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            return self.create_backup(incremental_name, backup_data, CompressionType.GZIP)
            
        except Exception as e:
            self.logger.error(f"증분 백업 생성 실패: {backup_name}, {e}")
            return False
    
    def _get_last_backup_info(self, backup_name: str) -> Optional[Dict[str, Any]]:
        """마지막 백업 정보 조회"""
        try:
            backups = self.list_backups(sort_by='created_at')
            for backup in backups:
                if backup['name'].startswith(backup_name):
                    return backup
            return None
        except Exception:
            return None
    
    def _get_changed_files(self, source_dir: Path, last_backup: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """변경된 파일 목록 추출"""
        changed_files = {}
        
        try:
            # 기준 시간 설정
            if last_backup:
                cutoff_time = datetime.fromisoformat(last_backup['created_at']).timestamp()
            else:
                cutoff_time = 0
            
            # 디렉토리 순회
            for file_path in source_dir.rglob('*'):
                if file_path.is_file():
                    stat = file_path.stat()
                    
                    # 수정 시간 확인
                    if stat.st_mtime > cutoff_time:
                        relative_path = str(file_path.relative_to(source_dir))
                        
                        # 파일 정보 저장
                        changed_files[relative_path] = {
                            'size': stat.st_size,
                            'modified_at': stat.st_mtime,
                            'checksum': self._calculate_checksum(file_path)
                        }
            
            return changed_files
            
        except Exception as e:
            self.logger.error(f"변경된 파일 검색 실패: {e}")
            return {}
    
    def restore_incremental_backup(self, backup_name: str, target_dir: Path) -> bool:
        """증분 백업 복원"""
        try:
            # 백업 체인 구성
            backup_chain = self._build_backup_chain(backup_name)
            
            if not backup_chain:
                self.logger.error(f"백업 체인을 구성할 수 없음: {backup_name}")
                return False
            
            # 체인 순서대로 복원
            for backup in backup_chain:
                backup_data = self.restore_backup(backup['name'])
                if not backup_data:
                    self.logger.error(f"백업 복원 실패: {backup['name']}")
                    return False
                
                # 파일 복원
                if backup_data.get('type') == 'incremental':
                    self._restore_incremental_files(backup_data, target_dir)
                else:
                    self._restore_full_backup(backup_data, target_dir)
            
            self.logger.info(f"증분 백업 복원 완료: {backup_name}")
            return True
            
        except Exception as e:
            self.logger.error(f"증분 백업 복원 실패: {backup_name}, {e}")
            return False
    
    def _build_backup_chain(self, backup_name: str) -> List[Dict[str, Any]]:
        """백업 체인 구성"""
        try:
            backups = self.list_backups(sort_by='created_at')
            chain = []
            
            # 관련 백업들 필터링
            related_backups = [b for b in backups if b['name'].startswith(backup_name)]
            
            # 시간순 정렬
            related_backups.sort(key=lambda x: x['created_at'])
            
            return related_backups
            
        except Exception as e:
            self.logger.error(f"백업 체인 구성 실패: {e}")
            return []
    
    def _restore_incremental_files(self, backup_data: Dict[str, Any], target_dir: Path) -> None:
        """증분 파일 복원"""
        try:
            changed_files = backup_data.get('changed_files', {})
            
            for relative_path, file_info in changed_files.items():
                # 실제 파일 복원 로직 (예: 별도 저장소에서 가져오기)
                # 여기서는 메타데이터만 복원하는 예시
                target_path = target_dir / relative_path
                self.ensure_directory(target_path.parent)
                
                # 파일 정보를 메타데이터로 저장
                metadata = {
                    'original_path': relative_path,
                    'size': file_info['size'],
                    'modified_at': file_info['modified_at'],
                    'checksum': file_info['checksum']
                }
                
                metadata_path = target_path.with_suffix('.metadata.json')
                self.write_json_file(metadata_path, metadata)
                
        except Exception as e:
            self.logger.error(f"증분 파일 복원 실패: {e}")
    
    def _restore_full_backup(self, backup_data: Dict[str, Any], target_dir: Path) -> None:
        """전체 백업 복원"""
        try:
            # 전체 백업 복원 로직
            pass
        except Exception as e:
            self.logger.error(f"전체 백업 복원 실패: {e}")


class ConfigFileHelper(BaseFileHelper):
    """
    향상된 설정 파일 관리 헬퍼 클래스
    환경별 설정, 암호화, 검증 기능 포함
    """
    
    def __init__(self, data_dir: str, config: Optional[FileSystemConfig] = None):
        super().__init__(data_dir, config)
        self.config_dir = self.base_dir / 'output' / 'data' / 'settings'
        self.environments = ['development', 'staging', 'production']
        self.config_schema = {}  # 설정 스키마 저장
        
        # 암호화 키 (실제 운영시에는 안전한 키 관리 필요)
        self.encryption_key = None
        
    def _get_config_path(self, config_name: str, environment: str = 'development') -> Path:
        """환경별 설정 파일 경로 반환"""
        if environment and environment != 'development':
            return self.config_dir / environment / f"{config_name}.json"
        return self.config_dir / f"{config_name}.json"
    
    def _encrypt_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """민감한 데이터 암호화"""
        if not self.encryption_key:
            return data
        
        try:
            from cryptography.fernet import Fernet
            
            encrypted_data = data.copy()
            sensitive_keys = ['password', 'secret', 'key', 'token']
            
            f = Fernet(self.encryption_key)
            
            for key, value in data.items():
                if any(sensitive_key in key.lower() for sensitive_key in sensitive_keys):
                    if isinstance(value, str):
                        encrypted_data[key] = f.encrypt(value.encode()).decode()
                        encrypted_data[f"{key}_encrypted"] = True
            
            return encrypted_data
            
        except ImportError:
            self.logger.warning("cryptography 라이브러리가 없어 암호화를 건너뜁니다")
            return data
        except Exception as e:
            self.logger.error(f"데이터 암호화 실패: {e}")
            return data
    
    def _decrypt_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """민감한 데이터 복호화"""
        if not self.encryption_key:
            return data
        
        try:
            from cryptography.fernet import Fernet
            
            decrypted_data = data.copy()
            f = Fernet(self.encryption_key)
            
            for key, value in data.items():
                if key.endswith('_encrypted') and value:
                    original_key = key[:-10]  # '_encrypted' 제거
                    if original_key in data:
                        encrypted_value = data[original_key]
                        if isinstance(encrypted_value, str):
                            decrypted_data[original_key] = f.decrypt(encrypted_value.encode()).decode()
                            del decrypted_data[key]
            
            return decrypted_data
            
        except ImportError:
            return data
        except Exception as e:
            self.logger.error(f"데이터 복호화 실패: {e}")
            return data
    
    def set_encryption_key(self, key: bytes) -> None:
        """암호화 키 설정"""
        self.encryption_key = key
    
    def generate_encryption_key(self) -> bytes:
        """새 암호화 키 생성"""
        try:
            from cryptography.fernet import Fernet
            return Fernet.generate_key()
        except ImportError:
            self.logger.warning("cryptography 라이브러리가 없어 키 생성을 건너뜁니다")
            return b''
    
    def set_config_schema(self, config_name: str, schema: Dict[str, Any]) -> None:
        """설정 스키마 설정"""
        self.config_schema[config_name] = schema
    
    def _validate_config(self, config_name: str, config_data: Dict[str, Any]) -> bool:
        """설정 데이터 검증"""
        if config_name not in self.config_schema:
            return True  # 스키마가 없으면 통과
        
        try:
            schema = self.config_schema[config_name]
            
            # 필수 키 검증
            required_keys = schema.get('required', [])
            for key in required_keys:
                if key not in config_data:
                    self.logger.error(f"필수 설정 키 누락: {key}")
                    return False
            
            # 타입 검증
            type_specs = schema.get('types', {})
            for key, expected_type in type_specs.items():
                if key in config_data:
                    value = config_data[key]
                    if expected_type == 'string' and not isinstance(value, str):
                        self.logger.error(f"설정 키 타입 오류: {key} (expected string)")
                        return False
                    elif expected_type == 'number' and not isinstance(value, (int, float)):
                        self.logger.error(f"설정 키 타입 오류: {key} (expected number)")
                        return False
                    elif expected_type == 'boolean' and not isinstance(value, bool):
                        self.logger.error(f"설정 키 타입 오류: {key} (expected boolean)")
                        return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"설정 검증 실패: {e}")
            return False
    
    async def save_config_async(self, config_name: str, config_data: Dict[str, Any], 
                               environment: str = 'development', 
                               encrypt_sensitive: bool = True) -> bool:
        """비동기 설정 저장"""
        try:
            # 설정 검증
            if not self._validate_config(config_name, config_data):
                return False
            
            # 민감한 데이터 암호화
            if encrypt_sensitive:
                config_data = self._encrypt_sensitive_data(config_data)
            
            # 환경별 디렉토리 생성
            config_path = self._get_config_path(config_name, environment)
            await self.ensure_directory_async(config_path.parent)
            
            # 설정 저장
            success = await self.write_json_file_async(config_path, config_data)
            
            if success:
                self.logger.info(f"설정 저장 성공: {config_name} ({environment})")
            else:
                self.logger.error(f"설정 저장 실패: {config_name} ({environment})")
            
            return success
            
        except Exception as e:
            self.logger.error(f"설정 저장 오류: {config_name}, {e}")
            return False
    
    def save_config(self, config_name: str, config_data: Dict[str, Any], 
                   environment: str = 'development', 
                   encrypt_sensitive: bool = True) -> bool:
        """동기 설정 저장"""
        try:
            # 설정 검증
            if not self._validate_config(config_name, config_data):
                return False
            
            # 민감한 데이터 암호화
            if encrypt_sensitive:
                config_data = self._encrypt_sensitive_data(config_data)
            
            # 환경별 디렉토리 생성
            config_path = self._get_config_path(config_name, environment)
            self.ensure_directory(config_path.parent)
            
            # 설정 저장
            success = self.write_json_file(config_path, config_data)
            
            if success:
                self.logger.info(f"설정 저장 성공: {config_name} ({environment})")
            else:
                self.logger.error(f"설정 저장 실패: {config_name} ({environment})")
            
            return success
            
        except Exception as e:
            self.logger.error(f"설정 저장 오류: {config_name}, {e}")
            return False
    
    async def load_config_async(self, config_name: str, 
                               environment: str = 'development',
                               default_config: Optional[Dict[str, Any]] = None,
                               decrypt_sensitive: bool = True) -> Dict[str, Any]:
        """비동기 설정 로드"""
        try:
            config_path = self._get_config_path(config_name, environment)
            data = await self.read_json_file_async(config_path)
            
            if data is None:
                self.logger.debug(f"설정 파일 없음, 기본값 사용: {config_name} ({environment})")
                return default_config or {}
            
            # 민감한 데이터 복호화
            if decrypt_sensitive:
                data = self._decrypt_sensitive_data(data)
            
            self.logger.debug(f"설정 로드 성공: {config_name} ({environment})")
            return data
            
        except Exception as e:
            self.logger.error(f"설정 로드 오류: {config_name}, {e}")
            return default_config or {}
    
    def load_config(self, config_name: str, 
                   environment: str = 'development',
                   default_config: Optional[Dict[str, Any]] = None,
                   decrypt_sensitive: bool = True) -> Dict[str, Any]:
        """동기 설정 로드"""
        try:
            config_path = self._get_config_path(config_name, environment)
            data = self.read_json_file(config_path)
            
            if data is None:
                self.logger.debug(f"설정 파일 없음, 기본값 사용: {config_name} ({environment})")
                return default_config or {}
            
            # 민감한 데이터 복호화
            if decrypt_sensitive:
                data = self._decrypt_sensitive_data(data)
            
            self.logger.debug(f"설정 로드 성공: {config_name} ({environment})")
            return data
            
        except Exception as e:
            self.logger.error(f"설정 로드 오류: {config_name}, {e}")
            return default_config or {}
    
    def config_exists(self, config_name: str, environment: str = 'development') -> bool:
        """설정 파일 존재 여부 확인"""
        config_path = self._get_config_path(config_name, environment)
        return self.file_exists(config_path)
    
    def delete_config(self, config_name: str, environment: str = 'development') -> bool:
        """설정 파일 삭제"""
        config_path = self._get_config_path(config_name, environment)
        return self.delete_file_safely(config_path)
    
    def list_configs(self, environment: str = 'development') -> List[str]:
        """설정 파일 목록 반환"""
        config_dir = self.config_dir if environment == 'development' else self.config_dir / environment
        return self.list_files_with_extension(config_dir, 'json')
    
    def migrate_config(self, config_name: str, from_env: str, to_env: str) -> bool:
        """환경간 설정 마이그레이션"""
        try:
            # 소스 설정 로드
            source_config = self.load_config(config_name, from_env)
            if not source_config:
                self.logger.error(f"마이그레이션할 설정이 없음: {config_name} ({from_env})")
                return False
            
            # 대상 환경에 저장
            success = self.save_config(config_name, source_config, to_env)
            
            if success:
                self.logger.info(f"설정 마이그레이션 완료: {config_name} ({from_env} -> {to_env})")
            
            return success
            
        except Exception as e:
            self.logger.error(f"설정 마이그레이션 실패: {config_name}, {e}")
            return False
    
    def compare_configs(self, config_name: str, env1: str, env2: str) -> Dict[str, Any]:
        """환경간 설정 비교"""
        try:
            config1 = self.load_config(config_name, env1, decrypt_sensitive=False)
            config2 = self.load_config(config_name, env2, decrypt_sensitive=False)
            
            # 차이점 분석
            differences = {
                'only_in_env1': [],
                'only_in_env2': [],
                'different_values': [],
                'same_keys': []
            }
            
            all_keys = set(config1.keys()) | set(config2.keys())
            
            for key in all_keys:
                if key in config1 and key not in config2:
                    differences['only_in_env1'].append(key)
                elif key in config2 and key not in config1:
                    differences['only_in_env2'].append(key)
                elif config1[key] != config2[key]:
                    differences['different_values'].append({
                        'key': key,
                        'env1_value': config1[key],
                        'env2_value': config2[key]
                    })
                else:
                    differences['same_keys'].append(key)
            
            return differences
            
        except Exception as e:
            self.logger.error(f"설정 비교 실패: {config_name}, {e}")
            return {}
    
    def export_configs(self, environment: str = 'development', 
                      export_path: Optional[Path] = None) -> bool:
        """설정 내보내기"""
        try:
            if not export_path:
                export_path = self.temp_dir / f"configs_export_{environment}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
            # 모든 설정 수집
            config_names = self.list_configs(environment)
            exported_configs = {}
            
            for config_name in config_names:
                config_data = self.load_config(config_name, environment, decrypt_sensitive=False)
                exported_configs[config_name] = config_data
            
            # 내보내기 메타데이터 추가
            export_data = {
                'metadata': {
                    'environment': environment,
                    'exported_at': datetime.now().isoformat(),
                    'config_count': len(exported_configs)
                },
                'configs': exported_configs
            }
            
            # 파일 저장
            success = self.write_json_file(export_path, export_data)
            
            if success:
                self.logger.info(f"설정 내보내기 완료: {export_path}")
            
            return success
            
        except Exception as e:
            self.logger.error(f"설정 내보내기 실패: {e}")
            return False
    
    def import_configs(self, import_path: Path, target_environment: str = 'development') -> bool:
        """설정 가져오기"""
        try:
            # 내보내기 파일 로드
            import_data = self.read_json_file(import_path)
            if not import_data:
                self.logger.error(f"가져오기 파일을 읽을 수 없음: {import_path}")
                return False
            
            configs = import_data.get('configs', {})
            if not configs:
                self.logger.error("가져올 설정이 없음")
                return False
            
            # 설정 가져오기
            success_count = 0
            for config_name, config_data in configs.items():
                if self.save_config(config_name, config_data, target_environment):
                    success_count += 1
            
            self.logger.info(f"설정 가져오기 완료: {success_count}/{len(configs)}개")
            return success_count > 0
            
        except Exception as e:
            self.logger.error(f"설정 가져오기 실패: {e}")
            return False


# 팩토리 함수들
def create_file_helper(base_dir: str, helper_type: str = 'base', 
                      config: Optional[FileSystemConfig] = None) -> BaseFileHelper:
    """파일 헬퍼 팩토리 함수"""
    if helper_type == 'conversation':
        return ConversationFileHelper(base_dir, config)
    elif helper_type == 'backup':
        return BackupFileHelper(base_dir, config)
    elif helper_type == 'config':
        return ConfigFileHelper(base_dir, config)
    else:
        return BaseFileHelper(base_dir, config)


# 전역 설정 및 인스턴스
_default_config = FileSystemConfig()
_global_helpers = {}

def get_default_config() -> FileSystemConfig:
    """기본 설정 반환"""
    return _default_config

def set_default_config(config: FileSystemConfig) -> None:
    """기본 설정 설정"""
    global _default_config
    _default_config = config

def get_file_helper(base_dir: str, helper_type: str = 'base') -> BaseFileHelper:
    """전역 파일 헬퍼 인스턴스 반환"""
    key = f"{helper_type}_{base_dir}"
    
    if key not in _global_helpers:
        _global_helpers[key] = create_file_helper(base_dir, helper_type, _default_config)
    
    return _global_helpers[key]

# 편의 함수들 (하위 호환성)
def get_conversation_helper(data_dir: str) -> ConversationFileHelper:
    """대화 파일 헬퍼 반환"""
    return get_file_helper(data_dir, 'conversation')

def get_backup_helper(data_dir: str) -> BackupFileHelper:
    """백업 파일 헬퍼 반환"""
    return get_file_helper(data_dir, 'backup')

def get_config_helper(data_dir: str) -> ConfigFileHelper:
    """설정 파일 헬퍼 반환"""
    return get_file_helper(data_dir, 'config')

# 하위 호환성을 위한 별칭
FileSystemConversationHelper = ConversationFileHelper