#!/usr/bin/env python3
"""
통합 로그 수집기 - JSON-RPC 2.0 서버
개인 개발용 실시간 로그 수집 및 분석 서버
"""

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
import sqlite3
import threading
import gzip
import base64
from pathlib import Path

from aiohttp import web, WSMsgType
from aiohttp.web import Request, Response, WebSocketResponse
import aiohttp_cors


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


class LogStorage:
    """SQLite 기반 로그 저장소"""
    
    def __init__(self, db_path: str = "./dev_logs.db"):
        self.db_path = db_path
        self.init_db()
        
    def init_db(self):
        """데이터베이스 초기화"""
        print(f"[DB] 데이터베이스 초기화: {self.db_path}")
        conn = sqlite3.connect(self.db_path)
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
                created_at REAL NOT NULL
            )
        ''')
        print("[DB] logs 테이블 생성 완료")
        
        # 인덱스 생성
        conn.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON logs(timestamp)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_source_level ON logs(source, level)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_trace_id ON logs(trace_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_created_at ON logs(created_at)')
        
        # FTS 전문검색 테이블
        conn.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
                id UNINDEXED,
                message,
                metadata,
                content=''
            )
        ''')
        
        conn.commit()
        conn.close()
        print("[DB] 데이터베이스 초기화 완료")
        
    def store_log(self, log_entry: LogEntry):
        """로그 저장"""
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute('''
                INSERT INTO logs (id, source, level, timestamp, message, metadata, tags, trace_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                log_entry.id,
                log_entry.source,
                log_entry.level,
                log_entry.timestamp,
                log_entry.message,
                json.dumps(log_entry.metadata),
                json.dumps(log_entry.tags),
                log_entry.trace_id,
                time.time()
            ))
            
            # FTS 인덱스 업데이트
            conn.execute('''
                INSERT INTO logs_fts (id, message, metadata) VALUES (?, ?, ?)
            ''', (log_entry.id, log_entry.message, json.dumps(log_entry.metadata)))
            
            conn.commit()
        finally:
            conn.close()
            
    def store_logs_batch(self, log_entries: List[LogEntry]):
        """배치 로그 저장"""
        conn = sqlite3.connect(self.db_path)
        try:
            logs_data = []
            fts_data = []
            current_time = time.time()
            
            for log_entry in log_entries:
                logs_data.append((
                    log_entry.id,
                    log_entry.source,
                    log_entry.level,
                    log_entry.timestamp,
                    log_entry.message,
                    json.dumps(log_entry.metadata),
                    json.dumps(log_entry.tags),
                    log_entry.trace_id,
                    current_time
                ))
                fts_data.append((log_entry.id, log_entry.message, json.dumps(log_entry.metadata)))
            
            conn.executemany('''
                INSERT INTO logs (id, source, level, timestamp, message, metadata, tags, trace_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', logs_data)
            
            conn.executemany('''
                INSERT INTO logs_fts (id, message, metadata) VALUES (?, ?, ?)
            ''', fts_data)
            
            conn.commit()
        finally:
            conn.close()
            
    def query_logs(self, sources: List[str] = None, levels: List[str] = None, 
                   since: str = None, limit: int = 100, search: str = None) -> List[Dict]:
        """로그 조회"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            # 기본 쿼리 구성
            if search:
                # FTS 검색을 사용하는 경우
                query = '''
                    SELECT logs.* FROM logs 
                    JOIN logs_fts ON logs.id = logs_fts.id 
                    WHERE logs_fts MATCH ?
                '''
                params = [search]
                
                # 추가 필터 조건 적용
                if sources:
                    placeholders = ','.join('?' * len(sources))
                    query += f" AND logs.source IN ({placeholders})"
                    params.extend(sources)
                    
                if levels:
                    placeholders = ','.join('?' * len(levels))
                    query += f" AND logs.level IN ({placeholders})"
                    params.extend(levels)
                    
                if since:
                    since_timestamp = self._parse_time_since(since)
                    query += " AND logs.created_at >= ?"
                    params.append(since_timestamp)
            else:
                # 일반 검색
                query = "SELECT * FROM logs WHERE 1=1"
                params = []
                
                if sources:
                    placeholders = ','.join('?' * len(sources))
                    query += f" AND source IN ({placeholders})"
                    params.extend(sources)
                    
                if levels:
                    placeholders = ','.join('?' * len(levels))
                    query += f" AND level IN ({placeholders})"
                    params.extend(levels)
                    
                if since:
                    since_timestamp = self._parse_time_since(since)
                    query += " AND created_at >= ?"
                    params.append(since_timestamp)
            
            # 정렬 및 제한
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            print(f"[DB] 쿼리 실행: {query}")
            print(f"[DB] 파라미터: {params}")
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                result = dict(row)
                result['metadata'] = json.loads(result['metadata']) if result['metadata'] else {}
                result['tags'] = json.loads(result['tags']) if result['tags'] else []
                results.append(result)
                
            print(f"[DB] 결과: {len(results)}개 로그 반환")
            return results
            
        except Exception as e:
            print(f"[DB] 쿼리 오류: {e}")
            print(f"[DB] 쿼리: {query}")
            print(f"[DB] 파라미터: {params}")
            # 오류 발생 시 빈 결과 반환
            return []
        finally:
            conn.close()
            
    def _parse_time_since(self, since: str) -> float:
        """시간 문자열을 timestamp로 변환 (예: "5m" -> 5분 전)"""
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
            # 기본값: 분 단위
            return now - int(since) * 60


class RealTimeAnalyzer:
    """실시간 로그 분석기"""
    
    def __init__(self):
        self.error_counts = defaultdict(lambda: deque(maxlen=60))  # 1분간 에러 수
        self.response_times = defaultdict(lambda: deque(maxlen=100))  # 최근 응답시간들
        self.alerts = []
        
    def analyze_log(self, log_entry: LogEntry) -> List[Dict]:
        """로그 분석 및 알림 생성"""
        alerts = []
        current_time = time.time()
        
        # 에러율 급증 감지
        if log_entry.level in ['ERROR', 'FATAL']:
            source_errors = self.error_counts[log_entry.source]
            source_errors.append(current_time)
            
            # 1분간 에러가 10개 이상이면 알림
            recent_errors = [t for t in source_errors if current_time - t <= 60]
            if len(recent_errors) >= 10:
                alerts.append({
                    'type': 'error_spike',
                    'source': log_entry.source,
                    'count': len(recent_errors),
                    'message': f'{log_entry.source}에서 1분간 {len(recent_errors)}개 에러 발생'
                })
                
        # 응답시간 지연 감지 (HTTP, DB 쿼리)
        if log_entry.source in ['http_traffic', 'db_query']:
            duration = log_entry.metadata.get('duration_ms', 0)
            if duration > 0:
                source_times = self.response_times[log_entry.source]
                source_times.append(duration)
                
                if len(source_times) >= 10:
                    avg_time = sum(source_times) / len(source_times)
                    if duration > avg_time * 3:  # 평균의 3배 이상 느림
                        alerts.append({
                            'type': 'slow_response',
                            'source': log_entry.source,
                            'duration': duration,
                            'average': avg_time,
                            'message': f'{log_entry.source} 응답시간 지연: {duration}ms (평균 {avg_time:.1f}ms)'
                        })
                        
        return alerts


class LogCollectorServer:
    """메인 로그 수집 서버"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8888, db_path: str = "./dev_logs.db"):
        self.host = host
        self.port = port
        self.storage = LogStorage(db_path)
        self.analyzer = RealTimeAnalyzer()
        self.websockets = set()
        self.app = web.Application()
        self.setup_routes()
        
    def setup_routes(self):
        """라우트 설정"""
        # CORS 설정
        cors = aiohttp_cors.setup(self.app, defaults={
            "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*"
            )
        })
        
        # JSON-RPC 엔드포인트
        resource = self.app.router.add_post('/rpc', self.handle_rpc)
        cors.add(resource)
        
        # WebSocket 엔드포인트 (실시간 스트리밍)
        self.app.router.add_get('/ws', self.handle_websocket)
        
        # 헬스체크
        health_resource = self.app.router.add_get('/health', self.handle_health)
        cors.add(health_resource)
        
    async def handle_health(self, request: Request) -> Response:
        """헬스체크 엔드포인트"""
        return web.json_response({'status': 'ok', 'timestamp': datetime.now().isoformat()})
        
    async def handle_websocket(self, request: Request) -> WebSocketResponse:
        """WebSocket 연결 처리"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        self.websockets.add(ws)
        
        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    # WebSocket으로 받은 필터 설정 처리
                    data = json.loads(msg.data)
                    # TODO: 클라이언트별 필터 설정 저장
                elif msg.type == WSMsgType.ERROR:
                    print(f'WebSocket error: {ws.exception()}')
        finally:
            self.websockets.discard(ws)
            
        return ws
        
    async def broadcast_log(self, log_entry: LogEntry, alerts: List[Dict] = None):
        """WebSocket으로 실시간 로그 브로드캐스트"""
        if not self.websockets:
            return
            
        message = {
            'type': 'log',
            'data': asdict(log_entry),
            'alerts': alerts or []
        }
        
        # 연결이 끊어진 WebSocket 제거
        dead_ws = set()
        for ws in self.websockets:
            try:
                await ws.send_str(json.dumps(message))
            except:
                dead_ws.add(ws)
                
        self.websockets -= dead_ws
        
    async def handle_rpc(self, request: Request) -> Response:
        """JSON-RPC 2.0 요청 처리"""
        try:
            data = await request.json()
            print(f"[RPC] 요청 수신: {data}")
            
            # 배치 요청 처리
            if isinstance(data, list):
                return await self.handle_batch_rpc(data)
            
            # JSON-RPC 2.0 검증
            if data.get('jsonrpc') != '2.0':
                print(f"[RPC] JSON-RPC 버전 오류: {data.get('jsonrpc')}")
                return self.rpc_error(-32600, "Invalid Request", data.get('id'))
                
            method = data.get('method')
            params = data.get('params', {})
            request_id = data.get('id')
            
            # 메서드 라우팅
            if method == 'ping':
                result = await self.method_ping(params)
            elif method == 'log':
                result = await self.method_log(params)
            elif method == 'log_batch':
                result = await self.method_log_batch(params)
            elif method == 'query':
                result = await self.method_query(params)
            elif method == 'search':
                result = await self.method_search(params)
            elif method == 'get_stats':
                result = await self.method_get_stats(params)
            else:
                return self.rpc_error(-32601, "Method not found", request_id)
                
            return web.json_response({
                'jsonrpc': '2.0',
                'result': result,
                'id': request_id
            })
            
        except json.JSONDecodeError:
            return self.rpc_error(-32700, "Parse error")
        except Exception as e:
            print(f"[RPC] 내부 에러: {e}")
            import traceback
            traceback.print_exc()
            return self.rpc_error(-32603, "Internal error", data.get('id') if 'data' in locals() else None)
    
    async def handle_batch_rpc(self, batch_data: List[Dict]) -> Response:
        """JSON-RPC 2.0 배치 요청 처리"""
        print(f"[RPC] 배치 요청 처리: {len(batch_data)}개 요청")
        
        results = []
        for data in batch_data:
            try:
                # 개별 요청 검증
                if data.get('jsonrpc') != '2.0':
                    results.append({
                        'jsonrpc': '2.0',
                        'error': {'code': -32600, 'message': 'Invalid Request'},
                        'id': data.get('id')
                    })
                    continue
                
                method = data.get('method')
                params = data.get('params', {})
                request_id = data.get('id')
                
                # 메서드 라우팅
                if method == 'ping':
                    result = await self.method_ping(params)
                elif method == 'log':
                    result = await self.method_log(params)
                elif method == 'log_batch':
                    result = await self.method_log_batch(params)
                elif method == 'query':
                    result = await self.method_query(params)
                elif method == 'search':
                    result = await self.method_search(params)
                elif method == 'get_stats':
                    result = await self.method_get_stats(params)
                else:
                    results.append({
                        'jsonrpc': '2.0',
                        'error': {'code': -32601, 'message': 'Method not found'},
                        'id': request_id
                    })
                    continue
                
                results.append({
                    'jsonrpc': '2.0',
                    'result': result,
                    'id': request_id
                })
                
            except Exception as e:
                print(f"[RPC] 배치 요청 처리 중 에러: {e}")
                results.append({
                    'jsonrpc': '2.0',
                    'error': {'code': -32603, 'message': 'Internal error'},
                    'id': data.get('id') if isinstance(data, dict) else None
                })
        
        return web.json_response(results)
            
    def rpc_error(self, code: int, message: str, request_id=None):
        """JSON-RPC 에러 응답"""
        return web.json_response({
            'jsonrpc': '2.0',
            'error': {'code': code, 'message': message},
            'id': request_id
        }, status=400)
        
    async def method_ping(self, params: Dict) -> Dict:
        """핑 테스트 - 연결 확인"""
        return {
            'pong': True,
            'timestamp': datetime.now().isoformat(),
            'server': 'Recursive Log System'
        }
        
    async def method_log(self, params: Dict) -> Dict:
        """단일 로그 수집"""
        log_entry = LogEntry(
            id=str(uuid.uuid4()),
            source=params['source'],
            level=params['level'],
            timestamp=params.get('timestamp', datetime.now().isoformat()),
            message=params['message'],
            metadata=params.get('metadata', {}),
            tags=params.get('tags', []),
            trace_id=params.get('trace_id')
        )
        
        # 저장
        self.storage.store_log(log_entry)
        
        # 실시간 분석
        alerts = self.analyzer.analyze_log(log_entry)
        
        # WebSocket 브로드캐스트
        await self.broadcast_log(log_entry, alerts)
        
        return {'status': 'received', 'id': log_entry.id, 'alerts': len(alerts)}
        
    async def method_log_batch(self, params: Dict) -> Dict:
        """배치 로그 수집"""
        logs_data = params['logs']
        compress = params.get('compress', False)
        
        # 압축 해제
        if compress and isinstance(logs_data, str):
            compressed_data = base64.b64decode(logs_data)
            logs_data = json.loads(gzip.decompress(compressed_data).decode())
            
        log_entries = []
        all_alerts = []
        
        for log_data in logs_data:
            log_entry = LogEntry(
                id=log_data.get('id', str(uuid.uuid4())),
                source=log_data['source'],
                level=log_data['level'],
                timestamp=log_data.get('timestamp', datetime.now().isoformat()),
                message=log_data['message'],
                metadata=log_data.get('metadata', {}),
                tags=log_data.get('tags', []),
                trace_id=log_data.get('trace_id')
            )
            log_entries.append(log_entry)
            
            # 실시간 분석
            alerts = self.analyzer.analyze_log(log_entry)
            all_alerts.extend(alerts)
            
        # 배치 저장
        self.storage.store_logs_batch(log_entries)
        
        # 최신 몇 개만 브로드캐스트 (성능상)
        for log_entry in log_entries[-5:]:
            await self.broadcast_log(log_entry)
            
        return {'status': 'received', 'count': len(log_entries), 'alerts': len(all_alerts)}
        
    async def method_query(self, params: Dict) -> Dict:
        """로그 조회"""
        sources = params.get('sources')
        levels = params.get('levels')
        since = params.get('since')
        limit = params.get('limit', 100)
        
        logs = self.storage.query_logs(sources, levels, since, limit)
        return {'logs': logs, 'count': len(logs)}
        
    async def method_search(self, params: Dict) -> Dict:
        """전문 검색"""
        query = params['query']
        timerange = params.get('timerange', '1h')
        context = params.get('context', 0)
        
        logs = self.storage.query_logs(
            since=timerange,
            search=query,
            limit=params.get('limit', 100)
        )
        
        return {'logs': logs, 'count': len(logs), 'query': query}
        
    async def method_get_stats(self, params: Dict) -> Dict:
        """통계 조회"""
        timerange = params.get('timerange', '1h')
        
        # 기본 통계
        logs = self.storage.query_logs(since=timerange, limit=10000)
        
        stats = {
            'total_logs': len(logs),
            'by_source': defaultdict(int),
            'by_level': defaultdict(int),
            'timerange': timerange
        }
        
        for log in logs:
            stats['by_source'][log['source']] += 1
            stats['by_level'][log['level']] += 1
            
        # dict로 변환 (JSON 직렬화용)
        stats['by_source'] = dict(stats['by_source'])
        stats['by_level'] = dict(stats['by_level'])
        
        return stats
        
    async def start(self):
        """서버 시작"""
        print(f"로그 수집 서버 시작: http://{self.host}:{self.port}")
        print(f"WebSocket: ws://{self.host}:{self.port}/ws")
        print(f"RPC 엔드포인트: http://{self.host}:{self.port}/rpc")
        
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, self.port)
        await site.start()


def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='통합 로그 수집 서버')
    parser.add_argument('--host', default='0.0.0.0', help='서버 호스트')
    parser.add_argument('--port', type=int, default=8888, help='서버 포트')
    parser.add_argument('--db', default='./dev_logs.db', help='SQLite DB 경로')
    
    args = parser.parse_args()
    
    # 서버 생성 및 실행
    server = LogCollectorServer(args.host, args.port)
    
    try:
        asyncio.run(server.start())
        # 서버 유지
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")


if __name__ == '__main__':
    main()
