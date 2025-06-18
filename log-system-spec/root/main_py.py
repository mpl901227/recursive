#!/usr/bin/env python3
"""
통합 로그 수집기 - CLI 메인 진입점
개발자를 위한 원클릭 로그 수집 시스템
"""

import asyncio
import sys
import os
import signal
import argparse
import subprocess
import time
import json
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

# 로컬 모듈 임포트
try:
    from server import LogCollectorServer
    from collectors import CollectorManager
    from storage import create_storage, migrate_database
    from config import Config, create_default_config
except ImportError as e:
    print(f"모듈 임포트 오류: {e}")
    print("현재 디렉토리에서 실행하거나 PYTHONPATH를 확인하세요.")
    sys.exit(1)


class LogCollectorCLI:
    """메인 CLI 클래스"""
    
    def __init__(self):
        self.config = None
        self.server_process = None
        self.collector_manager = None
        self.running_processes = []
        
    def setup_signal_handlers(self):
        """시그널 핸들러 설정"""
        def signal_handler(signum, frame):
            print(f"\n시그널 {signum} 수신, 종료 중...")
            asyncio.create_task(self.cleanup())
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
    async def cleanup(self):
        """정리 작업"""
        print("로그 수집기 정리 중...")
        
        # 수집기 중지
        if self.collector_manager:
            await self.collector_manager.stop_all()
            
        # 서버 프로세스 종료
        for proc in self.running_processes:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    
        print("정리 완료")
        
    def load_config(self, config_path: str = None) -> Config:
        """설정 로드"""
        if config_path and os.path.exists(config_path):
            self.config = Config.from_file(config_path)
        else:
            # 기본 설정 파일 찾기
            default_paths = [
                "./log_collector.yaml",
                "./config/log_collector.yaml", 
                "~/.log_collector/config.yaml"
            ]
            
            for path in default_paths:
                expanded_path = os.path.expanduser(path)
                if os.path.exists(expanded_path):
                    self.config = Config.from_file(expanded_path)
                    print(f"설정 파일 로드됨: {expanded_path}")
                    break
            else:
                # 기본 설정 생성
                self.config = Config()
                print("기본 설정 사용")
                
        return self.config
        
    async def start_server(self, args):
        """서버 시작"""
        print("=== 로그 수집 서버 시작 ===")
        
        config = self.load_config(args.config)
        
        # 서버 설정
        host = args.host or config.server.host
        port = args.port or config.server.port
        db_path = args.db or config.storage.db_path
        
        # 서버 인스턴스 생성
        server = LogCollectorServer(host, port)
        server.storage = create_storage(
            db_path=db_path,
            max_size_mb=config.storage.max_size_mb,
            max_days=config.storage.max_days
        )
        
        print(f"서버 주소: http://{host}:{port}")
        print(f"데이터베이스: {db_path}")
        print(f"WebSocket: ws://{host}:{port}/ws")
        print(f"RPC 엔드포인트: http://{host}:{port}/rpc")
        
        try:
            await server.start()
            
            print("\n서버가 시작되었습니다. Ctrl+C로 종료하세요.")
            
            # 서버 유지
            while True:
                await asyncio.sleep(1)
                
        except KeyboardInterrupt:
            print("\n서버 종료 중...")
        except Exception as e:
            print(f"서버 오류: {e}")
        finally:
            await self.cleanup()
            
    async def start_collectors(self, args):
        """수집기 시작"""
        print("=== 로그 수집기 시작 ===")
        
        config = self.load_config(args.config)
        
        # 수집기 관리자 생성
        self.collector_manager = CollectorManager(args.config)
        
        # 선택된 수집기들
        selected_collectors = args.collectors or None
        
        if selected_collectors:
            print(f"시작할 수집기: {', '.join(selected_collectors)}")
        else:
            print("모든 활성화된 수집기 시작")
            
        try:
            await self.collector_manager.start_all(selected_collectors)
        except KeyboardInterrupt:
            print("\n수집기 종료 중...")
        finally:
            await self.cleanup()
            
    async def start_all(self, args):
        """서버와 수집기 모두 시작"""
        print("=== 통합 로그 수집 시스템 시작 ===")
        
        config = self.load_config(args.config)
        
        # 서버를 별도 프로세스로 시작
        server_cmd = [
            sys.executable, "-m", "main", "server",
            "--host", args.host or config.server.host,
            "--port", str(args.port or config.server.port),
            "--db", args.db or config.storage.db_path
        ]
        
        if args.config:
            server_cmd.extend(["--config", args.config])
            
        print("서버 프로세스 시작 중...")
        server_process = subprocess.Popen(server_cmd)
        self.running_processes.append(server_process)
        
        # 서버 시작 대기
        await asyncio.sleep(3)
        
        if server_process.poll() is not None:
            print("서버 시작 실패")
            return
            
        print("서버 시작됨, 수집기 시작 중...")
        
        # 수집기 시작
        try:
            await self.start_collectors(args)
        finally:
            await self.cleanup()
            
    def init_project(self, args):
        """프로젝트 초기화"""
        print("=== 프로젝트 초기화 ===")
        
        project_type = args.type or "webapp"
        project_name = args.name or os.path.basename(os.getcwd())
        
        print(f"프로젝트 타입: {project_type}")
        print(f"프로젝트 이름: {project_name}")
        
        # 설정 파일 생성
        config_path = "./log_collector.yaml"
        
        if os.path.exists(config_path) and not args.force:
            print(f"설정 파일이 이미 존재합니다: {config_path}")
            if input("덮어쓰시겠습니까? (y/N): ").lower() != 'y':
                print("초기화 취소됨")
                return
                
        # 프로젝트 타입별 설정 생성
        config = create_default_config(project_type, project_name)
        
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
            
        print(f"설정 파일 생성됨: {config_path}")
        
        # 디렉토리 생성
        os.makedirs("logs", exist_ok=True)
        os.makedirs(".log_collector", exist_ok=True)
        
        # .gitignore 업데이트
        gitignore_path = "./.gitignore"
        gitignore_entries = [
            "# Log Collector",
            "logs/",
            "*.db",
            "*.db-*",
            ".log_collector/",
        ]
        
        if os.path.exists(gitignore_path):
            with open(gitignore_path, 'r') as f:
                existing = f.read()
                
            if "# Log Collector" not in existing:
                with open(gitignore_path, 'a') as f:
                    f.write("\n" + "\n".join(gitignore_entries) + "\n")
                print(".gitignore 업데이트됨")
        else:
            with open(gitignore_path, 'w') as f:
                f.write("\n".join(gitignore_entries) + "\n")
            print(".gitignore 생성됨")
            
        # IDE 설정 파일 생성 (VS Code)
        if args.ide == "vscode" or (not args.ide and os.path.exists(".vscode")):
            self._create_vscode_config()
            
        print("\n초기화 완료!")
        print(f"다음 명령어로 시작하세요:")
        print(f"  python -m main start")
        
    def _create_vscode_config(self):
        """VS Code 설정 생성"""
        vscode_dir = ".vscode"
        os.makedirs(vscode_dir, exist_ok=True)
        
        # settings.json 업데이트
        settings_path = os.path.join(vscode_dir, "settings.json")
        settings = {}
        
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r') as f:
                    settings = json.load(f)
            except:
                pass
                
        settings.update({
            "log-collector.enabled": True,
            "log-collector.server": "http://localhost:8888",
            "log-collector.auto-start": False
        })
        
        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=2)
            
        print("VS Code 설정 생성됨")
        
    def status(self, args):
        """서버 상태 확인"""
        config = self.load_config(args.config)
        server_url = f"http://{config.server.host}:{config.server.port}"
        
        print("=== 로그 수집기 상태 ===")
        print(f"서버 URL: {server_url}")
        
        try:
            import requests
            
            # 헬스체크
            health_response = requests.get(f"{server_url}/health", timeout=5)
            if health_response.status_code == 200:
                health_data = health_response.json()
                print(f"✅ 서버 상태: 정상")
                print(f"   응답 시간: {health_data.get('timestamp')}")
                
                # 통계 조회
                stats_payload = {
                    "jsonrpc": "2.0",
                    "method": "get_stats",
                    "params": {"timerange": "1h"},
                    "id": 1
                }
                
                stats_response = requests.post(f"{server_url}/rpc", json=stats_payload, timeout=5)
                if stats_response.status_code == 200:
                    stats_data = stats_response.json()
                    if 'result' in stats_data:
                        stats = stats_data['result']
                        print(f"   총 로그: {stats['total_logs']}개 (최근 1시간)")
                        print(f"   소스별:")
                        for source, count in stats['by_source'].items():
                            print(f"     - {source}: {count}개")
                        print(f"   레벨별:")
                        for level, count in stats['by_level'].items():
                            print(f"     - {level}: {count}개")
                            
            else:
                print(f"❌ 서버 상태: 비정상 (HTTP {health_response.status_code})")
                
        except Exception as e:
            print(f"❌ 서버 상태: 연결 실패 ({str(e)})")
            
        # 데이터베이스 상태
        db_path = config.storage.db_path
        if os.path.exists(db_path):
            db_size = os.path.getsize(db_path) / 1024 / 1024
            print(f"💾 데이터베이스: {db_path} ({db_size:.1f}MB)")
        else:
            print(f"💾 데이터베이스: 없음")
            
    def logs(self, args):
        """로그 조회"""
        config = self.load_config(args.config)
        server_url = f"http://{config.server.host}:{config.server.port}/rpc"
        
        # 쿼리 파라미터 구성
        params = {
            "limit": args.limit,
        }
        
        if args.source:
            params["sources"] = args.source
        if args.level:
            params["levels"] = args.level
        if args.since:
            params["since"] = args.since
        if args.search:
            # 검색 API 사용
            payload = {
                "jsonrpc": "2.0",
                "method": "search",
                "params": {
                    "query": args.search,
                    "limit": args.limit
                },
                "id": 1
            }
        else:
            payload = {
                "jsonrpc": "2.0", 
                "method": "query",
                "params": params,
                "id": 1
            }
            
        try:
            import requests
            
            response = requests.post(server_url, json=payload, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'result' in data:
                    result = data['result']
                    logs = result.get('logs', [])
                    
                    if not logs:
                        print("로그가 없습니다.")
                        return
                        
                    print(f"=== 로그 조회 결과 ({len(logs)}개) ===")
                    
                    for log in logs:
                        timestamp = log.get('timestamp', '')
                        level = log.get('level', '').ljust(5)
                        source = log.get('source', '').ljust(15)
                        message = log.get('message', '')
                        
                        # 레벨별 색상 (터미널 지원시)
                        if level.strip() == 'ERROR':
                            level_colored = f"\033[91m{level}\033[0m"  # 빨강
                        elif level.strip() == 'WARN':
                            level_colored = f"\033[93m{level}\033[0m"  # 노랑
                        elif level.strip() == 'DEBUG':
                            level_colored = f"\033[90m{level}\033[0m"  # 회색
                        else:
                            level_colored = level
                            
                        print(f"{timestamp[:19]} {level_colored} {source} {message}")
                        
                        # 상세 정보 표시
                        if args.verbose:
                            metadata = log.get('metadata', {})
                            if metadata:
                                for key, value in metadata.items():
                                    print(f"    {key}: {value}")
                            print()
                            
                else:
                    print(f"API 오류: {data.get('error', 'Unknown error')}")
            else:
                print(f"HTTP 오류: {response.status_code}")
                
        except Exception as e:
            print(f"로그 조회 실패: {e}")
            
    def migrate(self, args):
        """데이터베이스 마이그레이션"""
        print("=== 데이터베이스 마이그레이션 ===")
        
        old_db = args.from_db
        new_db = args.to_db
        
        if not os.path.exists(old_db):
            print(f"원본 데이터베이스가 존재하지 않습니다: {old_db}")
            return
            
        if os.path.exists(new_db) and not args.force:
            print(f"대상 데이터베이스가 이미 존재합니다: {new_db}")
            if input("덮어쓰시겠습니까? (y/N): ").lower() != 'y':
                print("마이그레이션 취소됨")
                return
                
        try:
            migrate_database(old_db, new_db)
            print("마이그레이션 완료!")
        except Exception as e:
            print(f"마이그레이션 실패: {e}")
            
    def daemon(self, args):
        """데몬 모드로 실행"""
        print("=== 데몬 모드 시작 ===")
        
        # PID 파일 생성
        pid_file = ".log_collector/daemon.pid"
        os.makedirs(os.path.dirname(pid_file), exist_ok=True)
        
        if os.path.exists(pid_file):
            with open(pid_file, 'r') as f:
                old_pid = f.read().strip()
            print(f"기존 데몬이 실행 중일 수 있습니다 (PID: {old_pid})")
            
        with open(pid_file, 'w') as f:
            f.write(str(os.getpid()))
            
        try:
            # 백그라운드 실행
            asyncio.run(self.start_all(args))
        finally:
            if os.path.exists(pid_file):
                os.remove(pid_file)


def create_parser():
    """CLI 파서 생성"""
    parser = argparse.ArgumentParser(
        description="통합 로그 수집기 - 개발자를 위한 실시간 로그 수집 시스템",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
사용 예시:
  %(prog)s init --type webapp                # 웹앱 프로젝트 초기화
  %(prog)s start                             # 서버와 수집기 모두 시작
  %(prog)s server --port 9999                # 서버만 시작
  %(prog)s collectors --collectors console   # 특정 수집기만 시작
  %(prog)s logs --level ERROR --since 1h    # 최근 1시간 에러 로그 조회
  %(prog)s status                            # 서버 상태 확인
        """
    )
    
    # 공통 옵션
    parser.add_argument('--config', help='설정 파일 경로')
    parser.add_argument('--verbose', '-v', action='store_true', help='상세 출력')
    
    subparsers = parser.add_subparsers(dest='command', help='명령어')
    
    # init 명령어
    init_parser = subparsers.add_parser('init', help='프로젝트 초기화')
    init_parser.add_argument('--type', choices=['webapp', 'api', 'desktop', 'microservice'], 
                           default='webapp', help='프로젝트 타입')
    init_parser.add_argument('--name', help='프로젝트 이름')
    init_parser.add_argument('--ide', choices=['vscode', 'pycharm'], help='IDE 설정 생성')
    init_parser.add_argument('--force', action='store_true', help='기존 설정 덮어쓰기')
    
    # start 명령어 (기본)
    start_parser = subparsers.add_parser('start', help='서버와 수집기 모두 시작')
    start_parser.add_argument('--host', default='0.0.0.0', help='서버 호스트')
    start_parser.add_argument('--port', type=int, default=8888, help='서버 포트')
    start_parser.add_argument('--db', help='데이터베이스 경로')
    start_parser.add_argument('--collectors', nargs='*', help='시작할 수집기 목록')
    
    # server 명령어
    server_parser = subparsers.add_parser('server', help='서버만 시작')
    server_parser.add_argument('--host', default='0.0.0.0', help='서버 호스트')
    server_parser.add_argument('--port', type=int, default=8888, help='서버 포트')
    server_parser.add_argument('--db', help='데이터베이스 경로')
    
    # collectors 명령어
    collectors_parser = subparsers.add_parser('collectors', help='수집기만 시작')
    collectors_parser.add_argument('--collectors', nargs='*', help='시작할 수집기 목록')
    
    # status 명령어
    status_parser = subparsers.add_parser('status', help='서버 상태 확인')
    
    # logs 명령어
    logs_parser = subparsers.add_parser('logs', help='로그 조회')
    logs_parser.add_argument('--source', nargs='*', help='소스 필터')
    logs_parser.add_argument('--level', nargs='*', help='레벨 필터')
    logs_parser.add_argument('--since', help='시간 필터 (예: 1h, 30m, 1d)')
    logs_parser.add_argument('--search', help='검색어')
    logs_parser.add_argument('--limit', type=int, default=50, help='조회 개수')
    logs_parser.add_argument('--verbose', action='store_true', help='상세 정보 표시')
    
    # migrate 명령어
    migrate_parser = subparsers.add_parser('migrate', help='데이터베이스 마이그레이션')
    migrate_parser.add_argument('--from-db', required=True, help='원본 DB 경로')
    migrate_parser.add_argument('--to-db', required=True, help='대상 DB 경로')
    migrate_parser.add_argument('--force', action='store_true', help='기존 DB 덮어쓰기')
    
    # daemon 명령어
    daemon_parser = subparsers.add_parser('daemon', help='데몬 모드로 실행')
    daemon_parser.add_argument('--host', default='0.0.0.0', help='서버 호스트')
    daemon_parser.add_argument('--port', type=int, default=8888, help='서버 포트')
    daemon_parser.add_argument('--db', help='데이터베이스 경로')
    daemon_parser.add_argument('--collectors', nargs='*', help='시작할 수집기 목록')
    
    return parser


async def main():
    """메인 함수"""
    parser = create_parser()
    args = parser.parse_args()
    
    if not args.command:
        # 기본 명령어는 start
        args.command = 'start'
        
    cli = LogCollectorCLI()
    cli.setup_signal_handlers()
    
    try:
        if args.command == 'init':
            cli.init_project(args)
        elif args.command == 'start':
            await cli.start_all(args)
        elif args.command == 'server':
            await cli.start_server(args)
        elif args.command == 'collectors':
            await cli.start_collectors(args)
        elif args.command == 'status':
            cli.status(args)
        elif args.command == 'logs':
            cli.logs(args)
        elif args.command == 'migrate':
            cli.migrate(args)
        elif args.command == 'daemon':
            cli.daemon(args)
        else:
            parser.print_help()
            
    except KeyboardInterrupt:
        print("\n사용자에 의해 중단됨")
    except Exception as e:
        print(f"오류 발생: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
