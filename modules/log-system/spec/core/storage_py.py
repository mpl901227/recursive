#!/usr/bin/env python3
"""
통합 로그 수집기 - 저장소 관리
SQLite 기반 고성능 로그 저장 및 조회 시스템
"""

import sqlite3
import json
import time
import threading
import gzip
import os
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from collections import defaultdict
import queue
import asyncio
from concurrent.futures import ThreadPoolExecutor


@dataclass
class LogEntry:
    """표준 로그 엔트리 구조"""
    id: str
    source: str
    level: str
    timestamp: str
    message: str
    metadata: Dict[str, Any]
    tags: List[str]
    trace_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """딕셔너리로 변환"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'LogEntry':
        """딕셔너리에서 생성"""
        return cls(**data)


class StorageConfig:
    """저장소 설정"""
    
    def __init__(self, 
                 db_path: str = "./dev_logs.db",
                 max_size_mb: int = 500,
                 max_days: int = 7,
                 enable_compression: bool = True,
                 batch_size: int = 100,
                 batch_timeout: float = 1.0,
                 vacuum_interval: int = 3600):  # 1시간
        self.db_path = db_path
        self.max_size_mb = max_size_mb
        self.max_days = max_days
        self.enable_compression = enable_compression
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout
        self.vacuum_interval = vacuum_interval


class BatchProcessor:
    """배치 처리기 - 성능 최적화용"""
    
    def __init__(self, storage: 'LogStorage', config: StorageConfig):
        self.storage = storage
        self.config = config
        self.batch_queue = queue.Queue()
        self.batch_buffer = []
        self.last_flush = time.time()
        self.running = False
        self.thread = None
        
    def start(self):
        """배치 처리 시작"""
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._batch_worker, daemon=True)
        self.thread.start()
        
    def stop(self):
        """배치 처리 중지"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
            
    def add_log(self, log_entry: LogEntry):
        """로그 추가 (비동기)"""
        try:
            self.batch_queue.put_nowait(log_entry)
        except queue.Full:
            # 큐가 가득 차면 즉시 처리
            self._flush_batch()
            self.batch_queue.put_nowait(log_entry)
            
    def _batch_worker(self):
        """배치 처리 워커"""
        while self.running:
            try:
                # 타임아웃으로 로그 수집
                try:
                    log_entry = self.batch_queue.get(timeout=0.1)
                    self.batch_buffer.append(log_entry)
                except queue.Empty:
                    pass
                
                # 배치 크기나 시간 기준으로 플러시
                current_time = time.time()
                if (len(self.batch_buffer) >= self.config.batch_size or 
                    (self.batch_buffer and current_time - self.last_flush >= self.config.batch_timeout)):
                    self._flush_batch()
                    
            except Exception as e:
                print(f"배치 처리 오류: {e}")
                
        # 종료 시 남은 배치 처리
        if self.batch_buffer:
            self._flush_batch()
            
    def _flush_batch(self):
        """배치 데이터 저장"""
        if not self.batch_buffer:
            return
            
        try:
            self.storage._store_logs_direct(self.batch_buffer)
            self.batch_buffer.clear()
            self.last_flush = time.time()
        except Exception as e:
            print(f"배치 저장 오류: {e}")


class LogStorage:
    """고성능 SQLite 로그 저장소"""
    
    def __init__(self, config: StorageConfig = None):
        self.config = config or StorageConfig()
        self.db_path = self.config.db_path
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.batch_processor = BatchProcessor(self, self.config)
        self._init_db()
        self._start_maintenance()
        
    def _init_db(self):
        """데이터베이스 초기화 및 최적화"""
        # 디렉토리 생성
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        conn.execute('PRAGMA journal_mode = WAL')  # Write-Ahead Logging
        conn.execute('PRAGMA synchronous = NORMAL')  # 성능 최적화
        conn.execute('PRAGMA cache_size = -64000')  # 64MB 캐시
        conn.execute('PRAGMA temp_store = MEMORY')
        conn.execute('PRAGMA mmap_size = 268435456')  # 256MB mmap
        
        # 메인 로그 테이블
        conn.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                level TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                tags TEXT,
                trace_id TEXT,
                created_at REAL NOT NULL,
                size_bytes INTEGER DEFAULT 0
            )
        ''')
        
        # 압축된 로그 테이블 (아카이브용)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS logs_archive (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                level TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                compressed_data BLOB NOT NULL,
                created_at REAL NOT NULL,
                original_size INTEGER NOT NULL,
                compressed_size INTEGER NOT NULL
            )
        ''')
        
        # 인덱스 생성
        indexes = [
            'CREATE INDEX IF NOT EXISTS idx_timestamp ON logs(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_source_level ON logs(source, level)',
            'CREATE INDEX IF NOT EXISTS idx_trace_id ON logs(trace_id)',
            'CREATE INDEX IF NOT EXISTS idx_created_at ON logs(created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_level_time ON logs(level, created_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_source_time ON logs(source, created_at DESC)',
        ]
        
        for index in indexes:
            conn.execute(index)
            
        # FTS5 전문검색 테이블
        conn.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
                id UNINDEXED,
                source,
                message,
                metadata,
                content=''
            )
        ''')
        
        # 통계 테이블
        conn.execute('''
            CREATE TABLE IF NOT EXISTS log_stats (
                date TEXT PRIMARY KEY,
                source TEXT,
                level TEXT,
                count INTEGER DEFAULT 0,
                total_size INTEGER DEFAULT 0,
                UNIQUE(date, source, level)
            )
        ''')
        
        # 트리거: 통계 자동 업데이트
        conn.execute('''
            CREATE TRIGGER IF NOT EXISTS update_stats_insert
            AFTER INSERT ON logs
            BEGIN
                INSERT OR REPLACE INTO log_stats (date, source, level, count, total_size)
                VALUES (
                    date(NEW.timestamp),
                    NEW.source,
                    NEW.level,
                    COALESCE((SELECT count FROM log_stats 
                             WHERE date = date(NEW.timestamp) AND source = NEW.source AND level = NEW.level), 0) + 1,
                    COALESCE((SELECT total_size FROM log_stats 
                             WHERE date = date(NEW.timestamp) AND source = NEW.source AND level = NEW.level), 0) + NEW.size_bytes
                );
            END
        ''')
        
        conn.commit()
        conn.close()
        
    def _start_maintenance(self):
        """유지보수 작업 시작"""
        self.batch_processor.start()
        
        # 정기 유지보수 스레드
        def maintenance_worker():
            while True:
                try:
                    time.sleep(self.config.vacuum_interval)
                    self._maintenance_task()
                except Exception as e:
                    print(f"유지보수 오류: {e}")
                    
        maintenance_thread = threading.Thread(target=maintenance_worker, daemon=True)
        maintenance_thread.start()
        
    def _maintenance_task(self):
        """정기 유지보수 작업"""
        print("로그 저장소 유지보수 시작...")
        
        # 1. 오래된 로그 정리
        self._cleanup_old_logs()
        
        # 2. 크기 기반 정리
        self._cleanup_by_size()
        
        # 3. 압축 및 아카이빙
        self._archive_old_logs()
        
        # 4. VACUUM (공간 회수)
        self._vacuum_database()
        
        print("로그 저장소 유지보수 완료")
        
    def store_log(self, log_entry: LogEntry):
        """단일 로그 저장 (배치 처리)"""
        self.batch_processor.add_log(log_entry)
        
    def store_logs_batch(self, log_entries: List[LogEntry]):
        """배치 로그 저장"""
        for log_entry in log_entries:
            self.batch_processor.add_log(log_entry)
            
    def _store_logs_direct(self, log_entries: List[LogEntry]):
        """직접 로그 저장 (배치 처리기에서 호출)"""
        conn = sqlite3.connect(self.db_path)
        try:
            logs_data = []
            fts_data = []
            current_time = time.time()
            
            for log_entry in log_entries:
                # 크기 계산
                size_bytes = len(json.dumps(asdict(log_entry)).encode('utf-8'))
                
                logs_data.append((
                    log_entry.id,
                    log_entry.source,
                    log_entry.level,
                    log_entry.timestamp,
                    log_entry.message,
                    json.dumps(log_entry.metadata),
                    json.dumps(log_entry.tags),
                    log_entry.trace_id,
                    current_time,
                    size_bytes
                ))
                
                fts_data.append((
                    log_entry.id,
                    log_entry.source,
                    log_entry.message,
                    json.dumps(log_entry.metadata)
                ))
            
            # 트랜잭션으로 일괄 처리
            conn.execute('BEGIN TRANSACTION')
            
            conn.executemany('''
                INSERT OR REPLACE INTO logs 
                (id, source, level, timestamp, message, metadata, tags, trace_id, created_at, size_bytes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', logs_data)
            
            conn.executemany('''
                INSERT OR REPLACE INTO logs_fts (id, source, message, metadata) 
                VALUES (?, ?, ?, ?)
            ''', fts_data)
            
            conn.execute('COMMIT')
            
        except Exception as e:
            conn.execute('ROLLBACK')
            raise e
        finally:
            conn.close()
            
    async def query_logs_async(self, **kwargs) -> List[Dict]:
        """비동기 로그 조회"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, self.query_logs, **kwargs)
        
    def query_logs(self, 
                   sources: List[str] = None,
                   levels: List[str] = None,
                   since: str = None,
                   until: str = None,
                   limit: int = 100,
                   offset: int = 0,
                   search: str = None,
                   trace_id: str = None,
                   include_archived: bool = False) -> List[Dict]:
        """고급 로그 조회"""
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            # 기본 쿼리
            if include_archived:
                # 아카이브 테이블도 포함 (압축 해제 필요)
                query = '''
                    SELECT id, source, level, timestamp, message, metadata, tags, trace_id, created_at 
                    FROM logs WHERE 1=1
                    UNION ALL
                    SELECT id, source, level, timestamp, NULL as message, NULL as metadata, NULL as tags, NULL as trace_id, created_at
                    FROM logs_archive WHERE 1=1
                '''
            else:
                query = "SELECT * FROM logs WHERE 1=1"
                
            params = []
            
            # 필터 조건 추가
            if sources:
                placeholders = ','.join('?' * len(sources))
                query += f" AND source IN ({placeholders})"
                params.extend(sources)
                
            if levels:
                placeholders = ','.join('?' * len(levels))
                query += f" AND level IN ({placeholders})"
                params.extend(levels)
                
            if trace_id:
                query += " AND trace_id = ?"
                params.append(trace_id)
                
            if since:
                since_timestamp = self._parse_time_since(since)
                query += " AND created_at >= ?"
                params.append(since_timestamp)
                
            if until:
                until_timestamp = self._parse_time_since(until)
                query += " AND created_at <= ?"
                params.append(until_timestamp)
                
            # 전문검색
            if search:
                fts_subquery = '''
                    SELECT id FROM logs_fts WHERE logs_fts MATCH ?
                '''
                query += f" AND id IN ({fts_subquery})"
                params.append(search)
                
            # 정렬 및 페이징
            query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                result = dict(row)
                
                # JSON 필드 파싱
                if result['metadata']:
                    result['metadata'] = json.loads(result['metadata'])
                else:
                    result['metadata'] = {}
                    
                if result['tags']:
                    result['tags'] = json.loads(result['tags'])
                else:
                    result['tags'] = []
                    
                results.append(result)
                
            return results
            
        finally:
            conn.close()
            
    def get_statistics(self, timerange: str = "24h") -> Dict:
        """상세 통계 조회"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            since_timestamp = self._parse_time_since(timerange)
            
            # 기본 통계
            basic_stats = conn.execute('''
                SELECT 
                    COUNT(*) as total_logs,
                    COUNT(DISTINCT source) as unique_sources,
                    COUNT(DISTINCT trace_id) as unique_traces,
                    SUM(size_bytes) as total_size_bytes,
                    MIN(created_at) as earliest_log,
                    MAX(created_at) as latest_log
                FROM logs 
                WHERE created_at >= ?
            ''', (since_timestamp,)).fetchone()
            
            # 소스별 통계
            source_stats = conn.execute('''
                SELECT source, level, COUNT(*) as count, SUM(size_bytes) as total_size
                FROM logs 
                WHERE created_at >= ?
                GROUP BY source, level
                ORDER BY count DESC
            ''', (since_timestamp,)).fetchall()
            
            # 시간대별 통계 (1시간 단위)
            hourly_stats = conn.execute('''
                SELECT 
                    datetime((created_at / 3600) * 3600, 'unixepoch') as hour,
                    COUNT(*) as count,
                    COUNT(CASE WHEN level = 'ERROR' THEN 1 END) as error_count
                FROM logs 
                WHERE created_at >= ?
                GROUP BY (created_at / 3600)
                ORDER BY hour DESC
                LIMIT 24
            ''', (since_timestamp,)).fetchall()
            
            # 가장 자주 발생하는 에러
            top_errors = conn.execute('''
                SELECT message, COUNT(*) as count, MAX(created_at) as last_occurrence
                FROM logs 
                WHERE level IN ('ERROR', 'FATAL') AND created_at >= ?
                GROUP BY message
                ORDER BY count DESC
                LIMIT 10
            ''', (since_timestamp,)).fetchall()
            
            return {
                'timerange': timerange,
                'basic': dict(basic_stats),
                'by_source_level': [dict(row) for row in source_stats],
                'hourly': [dict(row) for row in hourly_stats],
                'top_errors': [dict(row) for row in top_errors]
            }
            
        finally:
            conn.close()
            
    def get_trace_logs(self, trace_id: str) -> List[Dict]:
        """트레이스 ID로 관련 로그 조회"""
        return self.query_logs(trace_id=trace_id, limit=1000)
        
    def search_logs(self, query: str, **kwargs) -> Dict:
        """고급 전문검색"""
        # 기본 FTS 검색
        logs = self.query_logs(search=query, **kwargs)
        
        # 검색 결과 하이라이팅
        for log in logs:
            if query.lower() in log['message'].lower():
                # 간단한 하이라이팅
                highlighted = log['message'].replace(
                    query, f"**{query}**"
                )
                log['highlighted_message'] = highlighted
                
        return {
            'query': query,
            'total_found': len(logs),
            'logs': logs
        }
        
    def _parse_time_since(self, since: str) -> float:
        """시간 문자열을 timestamp로 변환"""
        now = time.time()
        
        if since.endswith('s'):
            return now - int(since[:-1])
        elif since.endswith('m'):
            return now - int(since[:-1]) * 60
        elif since.endswith('h'):
            return now - int(since[:-1]) * 3600
        elif since.endswith('d'):
            return now - int(since[:-1]) * 86400
        else:
            return now - int(since) * 60
            
    def _cleanup_old_logs(self):
        """오래된 로그 정리"""
        cutoff_time = time.time() - (self.config.max_days * 86400)
        
        conn = sqlite3.connect(self.db_path)
        try:
            # 아카이브로 이동할 로그 수 확인
            count = conn.execute(
                'SELECT COUNT(*) FROM logs WHERE created_at < ?', 
                (cutoff_time,)
            ).fetchone()[0]
            
            if count > 0:
                print(f"{count}개의 오래된 로그를 정리합니다...")
                
                # 아카이브 테이블로 이동 (압축)
                old_logs = conn.execute('''
                    SELECT * FROM logs WHERE created_at < ? ORDER BY created_at
                ''', (cutoff_time,)).fetchall()
                
                for log in old_logs:
                    # 로그 데이터 압축
                    log_data = json.dumps(dict(log)).encode('utf-8')
                    compressed_data = gzip.compress(log_data)
                    
                    # 아카이브 테이블에 저장
                    conn.execute('''
                        INSERT OR REPLACE INTO logs_archive 
                        (id, source, level, timestamp, compressed_data, created_at, original_size, compressed_size)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        log['id'], log['source'], log['level'], log['timestamp'],
                        compressed_data, log['created_at'],
                        len(log_data), len(compressed_data)
                    ))
                
                # 원본 로그 삭제
                conn.execute('DELETE FROM logs WHERE created_at < ?', (cutoff_time,))
                conn.execute('DELETE FROM logs_fts WHERE id NOT IN (SELECT id FROM logs)')
                
                conn.commit()
                print(f"로그 아카이빙 완료: {count}개")
                
        finally:
            conn.close()
            
    def _cleanup_by_size(self):
        """크기 기반 로그 정리"""
        max_size_bytes = self.config.max_size_mb * 1024 * 1024
        
        # 현재 DB 크기 확인
        db_size = os.path.getsize(self.db_path)
        
        if db_size > max_size_bytes:
            print(f"DB 크기 초과 ({db_size / 1024 / 1024:.1f}MB), 정리 시작...")
            
            conn = sqlite3.connect(self.db_path)
            try:
                # 가장 오래된 로그부터 삭제
                while db_size > max_size_bytes * 0.8:  # 80%까지 줄임
                    conn.execute('''
                        DELETE FROM logs WHERE id IN (
                            SELECT id FROM logs ORDER BY created_at LIMIT 1000
                        )
                    ''')
                    conn.commit()
                    
                    new_size = os.path.getsize(self.db_path)
                    if new_size >= db_size:  # 더 이상 줄어들지 않으면 중단
                        break
                    db_size = new_size
                    
                # FTS 정리
                conn.execute('DELETE FROM logs_fts WHERE id NOT IN (SELECT id FROM logs)')
                conn.commit()
                
            finally:
                conn.close()
                
    def _archive_old_logs(self):
        """로그 압축 아카이빙"""
        if not self.config.enable_compression:
            return
            
        # 1일 이상 된 로그를 압축
        archive_cutoff = time.time() - 86400
        
        conn = sqlite3.connect(self.db_path)
        try:
            logs_to_archive = conn.execute('''
                SELECT * FROM logs 
                WHERE created_at < ? AND level NOT IN ('ERROR', 'FATAL')
                ORDER BY created_at
                LIMIT 10000
            ''', (archive_cutoff,)).fetchall()
            
            if logs_to_archive:
                print(f"{len(logs_to_archive)}개 로그를 압축 아카이빙...")
                
                for log in logs_to_archive:
                    # 압축 처리는 _cleanup_old_logs에서 수행
                    pass
                    
        finally:
            conn.close()
            
    def _vacuum_database(self):
        """데이터베이스 최적화"""
        conn = sqlite3.connect(self.db_path)
        try:
            print("데이터베이스 최적화 중...")
            conn.execute('VACUUM')
            conn.execute('ANALYZE')
            print("데이터베이스 최적화 완료")
        finally:
            conn.close()
            
    def close(self):
        """저장소 종료"""
        self.batch_processor.stop()
        self.executor.shutdown(wait=True)


# 편의 함수들
def create_storage(db_path: str = "./dev_logs.db", **kwargs) -> LogStorage:
    """저장소 생성"""
    config = StorageConfig(db_path=db_path, **kwargs)
    return LogStorage(config)


def migrate_database(old_db_path: str, new_db_path: str):
    """데이터베이스 마이그레이션"""
    print(f"데이터베이스 마이그레이션: {old_db_path} -> {new_db_path}")
    
    old_conn = sqlite3.connect(old_db_path)
    new_storage = create_storage(new_db_path)
    
    try:
        old_conn.row_factory = sqlite3.Row
        logs = old_conn.execute('SELECT * FROM logs ORDER BY created_at').fetchall()
        
        log_entries = []
        for row in logs:
            log_entry = LogEntry(
                id=row['id'],
                source=row['source'],
                level=row['level'],
                timestamp=row['timestamp'],
                message=row['message'],
                metadata=json.loads(row['metadata']) if row['metadata'] else {},
                tags=json.loads(row['tags']) if row['tags'] else [],
                trace_id=row.get('trace_id')
            )
            log_entries.append(log_entry)
            
            # 배치 처리
            if len(log_entries) >= 1000:
                new_storage.store_logs_batch(log_entries)
                log_entries.clear()
                
        # 남은 로그 처리
        if log_entries:
            new_storage.store_logs_batch(log_entries)
            
        print(f"마이그레이션 완료: {len(logs)}개 로그")
        
    finally:
        old_conn.close()
        new_storage.close()


if __name__ == '__main__':
    # 테스트 코드
    import uuid
    
    storage = create_storage("./test_logs.db")
    
    # 테스트 로그 생성
    test_logs = []
    for i in range(100):
        log = LogEntry(
            id=str(uuid.uuid4()),
            source="test_source",
            level="INFO" if i % 10 != 0 else "ERROR",
            timestamp=datetime.now().isoformat(),
            message=f"테스트 메시지 {i}",
            metadata={"index": i, "batch": i // 10},
            tags=["test", f"batch_{i // 10}"]
        )
        test_logs.append(log)
        
    # 배치 저장 테스트
    storage.store_logs_batch(test_logs)
    
    # 조회 테스트
    time.sleep(2)  # 배치 처리 대기
    results = storage.query_logs(limit=10)
    print(f"저장된 로그 {len(results)}개 조회됨")
    
    # 통계 테스트
    stats = storage.get_statistics("1h")
    print(f"통계: {stats['basic']['total_logs']}개 로그")
    
    storage.close()
