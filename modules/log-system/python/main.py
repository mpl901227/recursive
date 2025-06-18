#!/usr/bin/env python3
"""
Recursive 로그 시스템 - Python 서버 진입점
통합 로그 수집 및 분석 서버의 독립 실행 진입점
"""

import asyncio
import sys
import os
import signal
import logging
import argparse
from pathlib import Path
from typing import Optional

# 현재 디렉토리를 Python 경로에 추가
sys.path.append(os.path.dirname(__file__))

# 로그 시스템 모듈 import
from server import LogCollectorServer


class LogSystemRunner:
    """로그 시스템 실행 관리자"""
    
    def __init__(self):
        self.server: Optional[LogCollectorServer] = None
        self.running = False
        self.setup_logging()
        
    def setup_logging(self):
        """기본 로깅 설정 (Windows UTF-8 지원)"""
        # Windows에서 UTF-8 출력을 위한 설정
        if sys.platform.startswith('win'):
            import codecs
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler('logs/server.log', mode='a', encoding='utf-8')
            ]
        )
        self.logger = logging.getLogger('LogSystemRunner')
        
    def setup_signal_handlers(self):
        """시그널 핸들러 설정 (우아한 종료)"""
        def signal_handler(signum, frame):
            self.logger.info(f"Signal {signum} received. Shutting down gracefully...")
            self.running = False
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
    async def start_server(self, host: str, port: int, db_path: str):
        """서버 시작"""
        try:
            # 데이터베이스 디렉토리 생성
            db_dir = Path(db_path).parent
            db_dir.mkdir(parents=True, exist_ok=True)
            
            # 로그 디렉토리 생성
            logs_dir = Path('logs')
            logs_dir.mkdir(exist_ok=True)
            
            self.logger.info("[START] Recursive Log System Starting...")
            self.logger.info(f"[DB] Database: {db_path}")
            self.logger.info(f"[SERVER] Server: http://{host}:{port}")
            self.logger.info(f"[WS] WebSocket: ws://{host}:{port}/ws")
            self.logger.info(f"[RPC] JSON-RPC: http://{host}:{port}/rpc")
            
            # 서버 인스턴스 생성
            self.server = LogCollectorServer(host, port, db_path)
            
            # 서버 시작
            await self.server.start()
            self.running = True
            
            self.logger.info("[SUCCESS] Log System Started Successfully!")
            self.logger.info("[READY] Ready to collect logs...")
            
            # 서버 유지 (시그널 대기)
            while self.running:
                await asyncio.sleep(1)
                
        except Exception as e:
            self.logger.error(f"[ERROR] Failed to start server: {e}")
            raise
            
    async def shutdown(self):
        """서버 종료"""
        try:
            self.logger.info("[SHUTDOWN] Shutting down log system...")
            self.running = False
            
            if self.server:
                # WebSocket 연결 정리
                if hasattr(self.server, 'websockets'):
                    for ws in list(self.server.websockets):
                        try:
                            await ws.close()
                        except:
                            pass
                    self.server.websockets.clear()
                
                # 추가 정리 작업이 필요하면 여기에
                self.logger.info("[WS] WebSocket connections closed")
            
            self.logger.info("[COMPLETE] Log system shutdown complete")
            
        except Exception as e:
            self.logger.error(f"[ERROR] Error during shutdown: {e}")


def parse_arguments():
    """명령행 인자 파싱"""
    parser = argparse.ArgumentParser(
        description='Recursive Log System - Integrated Log Collection Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # 기본 설정으로 실행
  %(prog)s --host localhost --port 8888
  %(prog)s --db ./logs/recursive.db --verbose
  %(prog)s --config ./config/custom.yaml
        """
    )
    
    # 서버 설정
    parser.add_argument(
        '--host', 
        default='localhost',
        help='서버 바인딩 호스트 (기본값: localhost)'
    )
    
    parser.add_argument(
        '--port', 
        type=int, 
        default=8888,
        help='서버 포트 (기본값: 8888)'
    )
    
    # 데이터베이스 설정
    parser.add_argument(
        '--db', 
        default='./logs/recursive_logs.db',
        help='SQLite 데이터베이스 경로 (기본값: ./logs/recursive_logs.db)'
    )
    
    # 설정 파일
    parser.add_argument(
        '--config',
        help='YAML 설정 파일 경로 (선택사항)'
    )
    
    # 로깅 레벨
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='상세 로깅 활성화'
    )
    
    parser.add_argument(
        '--debug',
        action='store_true',
        help='디버그 모드 활성화'
    )
    
    # 개발 모드
    parser.add_argument(
        '--dev',
        action='store_true',
        help='개발 모드 (hot-reload, 디버그 출력 등)'
    )
    
    return parser.parse_args()


def load_config_file(config_path: str) -> dict:
    """설정 파일 로드"""
    try:
        import yaml
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except ImportError:
        print("[WARN] PyYAML이 설치되지 않았습니다. pip install PyYAML")
        return {}
    except FileNotFoundError:
        print(f"[WARN] 설정 파일을 찾을 수 없습니다: {config_path}")
        return {}
    except Exception as e:
        print(f"[WARN] 설정 파일 로드 실패: {e}")
        return {}


def setup_environment(args):
    """환경 설정"""
    # 로깅 레벨 설정
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    elif args.verbose:
        logging.getLogger().setLevel(logging.INFO)
    else:
        logging.getLogger().setLevel(logging.WARNING)
    
    # 개발 모드 설정
    if args.dev:
        os.environ['RECURSIVE_DEV_MODE'] = '1'
        print("[DEV] 개발 모드 활성화")


async def main():
    """메인 실행 함수"""
    try:
        # 명령행 인자 파싱
        args = parse_arguments()
        
        # 환경 설정
        setup_environment(args)
        
        # 설정 파일 로드 (있는 경우)
        config = {}
        if args.config:
            config = load_config_file(args.config)
        
        # 설정 병합 (명령행 > 설정파일 > 기본값)
        host = args.host or config.get('server', {}).get('host', 'localhost')
        port = args.port or config.get('server', {}).get('port', 8888)
        db_path = args.db or config.get('storage', {}).get('db_path', './logs/recursive_logs.db')
        
        # 런너 생성 및 실행
        runner = LogSystemRunner()
        runner.setup_signal_handlers()
        
        try:
            await runner.start_server(host, port, db_path)
        except KeyboardInterrupt:
            print("\n")  # 깔끔한 줄바꿈
        finally:
            await runner.shutdown()
            
    except Exception as e:
        print(f"💥 Critical error: {e}")
        logging.exception("Critical error occurred")
        sys.exit(1)


def cli_main():
    """CLI 진입점 (동기 버전)"""
    try:
        # Python 3.7+ 호환성
        if sys.version_info >= (3, 7):
            asyncio.run(main())
        else:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    cli_main() 