#!/usr/bin/env python3
"""
통합 로그 수집기 - 설정 관리
프로젝트별 맞춤 설정 및 검증 시스템
"""

import os
import json
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, asdict, field
from datetime import datetime
import re


@dataclass
class ServerConfig:
    """서버 설정"""
    host: str = "0.0.0.0"
    port: int = 8888
    cors_enabled: bool = True
    auth_token: Optional[str] = None
    request_timeout: float = 30.0
    max_connections: int = 1000


@dataclass
class StorageConfig:
    """저장소 설정"""
    db_path: str = "./logs/dev_logs.db"
    max_size_mb: int = 500
    max_days: int = 7
    enable_compression: bool = True
    batch_size: int = 100
    batch_timeout: float = 1.0
    vacuum_interval: int = 3600
    backup_enabled: bool = False
    backup_path: str = "./logs/backups"


@dataclass
class ConsoleCollectorConfig:
    """콘솔 수집기 설정"""
    enabled: bool = True
    commands: List[str] = field(default_factory=list)
    auto_restart: bool = True
    capture_env: bool = False
    encoding: str = "utf-8"


@dataclass
class HTTPCollectorConfig:
    """HTTP 수집기 설정"""
    enabled: bool = True
    ports: List[int] = field(default_factory=lambda: [8000, 8080, 3000, 5000])
    proxy_port_offset: int = 1000
    ignore_paths: List[str] = field(default_factory=lambda: ["/health", "/metrics", "/favicon.ico"])
    capture_headers: bool = True
    capture_body: bool = False
    max_body_size: int = 1024


@dataclass
class FileWatcherConfig:
    """파일 감시 설정"""
    enabled: bool = True
    watch_paths: List[str] = field(default_factory=lambda: ["./src", "./config"])
    ignore_patterns: List[str] = field(default_factory=lambda: [
        "*.pyc", "*.pyo", "*.pyd", "__pycache__", ".git", ".svn", 
        "node_modules", "*.log", "*.tmp", ".DS_Store"
    ])
    include_extensions: List[str] = field(default_factory=lambda: [
        ".py", ".js", ".ts", ".java", ".go", ".rs", ".cpp", ".c", ".h",
        ".yaml", ".yml", ".json", ".xml", ".toml", ".ini", ".conf"
    ])
    recursive: bool = True
    follow_symlinks: bool = False


@dataclass
class ProcessMonitorConfig:
    """프로세스 모니터 설정"""
    enabled: bool = False
    check_interval: float = 5.0
    monitor_processes: List[str] = field(default_factory=list)
    cpu_threshold: float = 80.0
    memory_threshold_mb: float = 1000.0
    track_children: bool = True


@dataclass
class DatabaseConfig:
    """데이터베이스 수집기 설정"""
    enabled: bool = False
    databases: List[Dict[str, str]] = field(default_factory=list)
    slow_query_threshold_ms: int = 1000
    capture_queries: bool = True
    capture_transactions: bool = False
    max_query_length: int = 1000


@dataclass
class AlertConfig:
    """알림 설정"""
    enabled: bool = True
    error_spike_threshold: int = 10
    error_spike_window: int = 60
    slow_response_multiplier: float = 3.0
    channels: List[str] = field(default_factory=lambda: ["console"])
    webhook_url: Optional[str] = None
    slack_token: Optional[str] = None
    email_config: Dict[str, str] = field(default_factory=dict)


@dataclass
class CollectorsConfig:
    """수집기들 설정"""
    console: ConsoleCollectorConfig = field(default_factory=ConsoleCollectorConfig)
    http_traffic: HTTPCollectorConfig = field(default_factory=HTTPCollectorConfig)
    file_watcher: FileWatcherConfig = field(default_factory=FileWatcherConfig)
    process_monitor: ProcessMonitorConfig = field(default_factory=ProcessMonitorConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)


@dataclass
class Config:
    """메인 설정 클래스"""
    project_name: str = "my-project"
    project_type: str = "webapp"
    version: str = "1.0.0"
    
    server: ServerConfig = field(default_factory=ServerConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    collectors: CollectorsConfig = field(default_factory=CollectorsConfig)
    alerts: AlertConfig = field(default_factory=AlertConfig)
    
    # 메타데이터
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return asdict(self)
    
    def to_yaml(self) -> str:
        """YAML 문자열로 변환"""
        data = self.to_dict()
        return yaml.dump(data, default_flow_style=False, allow_unicode=True, indent=2)
    
    def to_json(self) -> str:
        """JSON 문자열로 변환"""
        data = self.to_dict()
        return json.dumps(data, indent=2, ensure_ascii=False)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Config':
        """딕셔너리에서 생성"""
        # 중첩된 설정 객체 생성
        server_data = data.get('server', {})
        storage_data = data.get('storage', {})
        collectors_data = data.get('collectors', {})
        alerts_data = data.get('alerts', {})
        
        # 수집기별 설정
        console_data = collectors_data.get('console', {})
        http_data = collectors_data.get('http_traffic', {})
        file_data = collectors_data.get('file_watcher', {})
        process_data = collectors_data.get('process_monitor', {})
        db_data = collectors_data.get('database', {})
        
        return cls(
            project_name=data.get('project_name', 'my-project'),
            project_type=data.get('project_type', 'webapp'),
            version=data.get('version', '1.0.0'),
            server=ServerConfig(**server_data),
            storage=StorageConfig(**storage_data),
            collectors=CollectorsConfig(
                console=ConsoleCollectorConfig(**console_data),
                http_traffic=HTTPCollectorConfig(**http_data),
                file_watcher=FileWatcherConfig(**file_data),
                process_monitor=ProcessMonitorConfig(**process_data),
                database=DatabaseConfig(**db_data)
            ),
            alerts=AlertConfig(**alerts_data),
            created_at=data.get('created_at', datetime.now().isoformat()),
            updated_at=datetime.now().isoformat()
        )
    
    @classmethod
    def from_file(cls, file_path: str) -> 'Config':
        """파일에서 설정 로드"""
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"설정 파일을 찾을 수 없습니다: {file_path}")
        
        with open(path, 'r', encoding='utf-8') as f:
            if path.suffix.lower() in ['.yaml', '.yml']:
                data = yaml.safe_load(f) or {}
            elif path.suffix.lower() == '.json':
                data = json.load(f)
            else:
                raise ValueError(f"지원하지 않는 파일 형식: {path.suffix}")
        
        return cls.from_dict(data)
    
    def save(self, file_path: str):
        """파일로 설정 저장"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # 업데이트 시간 갱신
        self.updated_at = datetime.now().isoformat()
        
        with open(path, 'w', encoding='utf-8') as f:
            if path.suffix.lower() in ['.yaml', '.yml']:
                yaml.dump(self.to_dict(), f, default_flow_style=False, 
                         allow_unicode=True, indent=2)
            elif path.suffix.lower() == '.json':
                json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
            else:
                raise ValueError(f"지원하지 않는 파일 형식: {path.suffix}")
    
    def validate(self) -> List[str]:
        """설정 검증"""
        errors = []
        
        # 서버 설정 검증
        if not (1 <= self.server.port <= 65535):
            errors.append(f"잘못된 포트 번호: {self.server.port}")
        
        if self.server.request_timeout <= 0:
            errors.append("요청 타임아웃은 양수여야 합니다")
        
        # 저장소 설정 검증
        if self.storage.max_size_mb <= 0:
            errors.append("최대 DB 크기는 양수여야 합니다")
        
        if self.storage.max_days <= 0:
            errors.append("로그 보관 기간은 양수여야 합니다")
        
        # 경로 검증
        db_dir = Path(self.storage.db_path).parent
        try:
            db_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            errors.append(f"DB 디렉토리 생성 실패: {e}")
        
        # HTTP 포트 검증
        for port in self.collectors.http_traffic.ports:
            if not (1 <= port <= 65535):
                errors.append(f"잘못된 HTTP 포트: {port}")
        
        # 파일 감시 경로 검증
        for watch_path in self.collectors.file_watcher.watch_paths:
            if not os.path.exists(watch_path):
                errors.append(f"감시 경로가 존재하지 않습니다: {watch_path}")
        
        return errors
    
    def merge(self, other: 'Config') -> 'Config':
        """다른 설정과 병합"""
        merged_data = self.to_dict()
        other_data = other.to_dict()
        
        def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
            """딕셔너리 깊은 병합"""
            result = dict1.copy()
            for key, value in dict2.items():
                if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                    result[key] = deep_merge(result[key], value)
                else:
                    result[key] = value
            return result
        
        merged_data = deep_merge(merged_data, other_data)
        return Config.from_dict(merged_data)


class ConfigValidator:
    """설정 검증기"""
    
    @staticmethod
    def validate_port(port: int) -> bool:
        """포트 번호 검증"""
        return 1 <= port <= 65535
    
    @staticmethod
    def validate_path(path: str) -> bool:
        """경로 검증"""
        try:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            return True
        except:
            return False
    
    @staticmethod
    def validate_regex(pattern: str) -> bool:
        """정규식 패턴 검증"""
        try:
            re.compile(pattern)
            return True
        except re.error:
            return False
    
    @staticmethod
    def validate_url(url: str) -> bool:
        """URL 검증"""
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
        return url_pattern.match(url) is not None


def create_default_config(project_type: str = "webapp", project_name: str = "my-project") -> Dict[str, Any]:
    """프로젝트 타입별 기본 설정 생성"""
    
    base_config = Config(
        project_name=project_name,
        project_type=project_type
    )
    
    # 프로젝트 타입별 맞춤 설정
    if project_type == "webapp":
        # 웹앱: HTTP 트래픽, 파일 감시, 콘솔 활성화
        base_config.collectors.console.enabled = True
        base_config.collectors.console.commands = [
            "python app.py",
            "flask run",
            "python manage.py runserver",
            "npm start",
            "npm run dev"
        ]
        
        base_config.collectors.http_traffic.enabled = True
        base_config.collectors.http_traffic.ports = [8000, 8080, 3000, 5000]
        
        base_config.collectors.file_watcher.enabled = True
        base_config.collectors.file_watcher.watch_paths = [
            "./app", "./src", "./templates", "./static", "./config"
        ]
        
        base_config.collectors.database.enabled = True
        base_config.collectors.database.databases = [
            {
                "type": "postgresql",
                "name": "main_db",
                "log_path": "/var/log/postgresql/postgresql.log"
            }
        ]
        
    elif project_type == "api":
        # API: HTTP 트래픽, DB 쿼리 중심
        base_config.collectors.console.enabled = True
        base_config.collectors.console.commands = [
            "python api.py",
            "uvicorn main:app --reload",
            "fastapi dev main.py",
            "gunicorn app:app"
        ]
        
        base_config.collectors.http_traffic.enabled = True
        base_config.collectors.http_traffic.ports = [8000, 8080, 5000]
        base_config.collectors.http_traffic.capture_body = True
        
        base_config.collectors.file_watcher.enabled = True
        base_config.collectors.file_watcher.watch_paths = [
            "./api", "./src", "./routes", "./models", "./config"
        ]
        
        base_config.collectors.database.enabled = True
        base_config.collectors.database.slow_query_threshold_ms = 500
        
        base_config.collectors.process_monitor.enabled = True
        base_config.collectors.process_monitor.monitor_processes = [
            "python", "uvicorn", "gunicorn", "nginx"
        ]
        
    elif project_type == "microservice":
        # 마이크로서비스: 모든 수집기 활성화
        base_config.collectors.console.enabled = True
        base_config.collectors.http_traffic.enabled = True
        base_config.collectors.file_watcher.enabled = True
        base_config.collectors.process_monitor.enabled = True
        base_config.collectors.database.enabled = True
        
        # 더 자주 모니터링
        base_config.collectors.process_monitor.check_interval = 2.0
        base_config.storage.batch_size = 50  # 더 작은 배치
        
        # 알림 강화
        base_config.alerts.error_spike_threshold = 5
        base_config.alerts.error_spike_window = 30
        
    elif project_type == "desktop":
        # 데스크톱 앱: 프로세스, 파일 중심
        base_config.collectors.console.enabled = True
        base_config.collectors.console.commands = [
            "python main.py",
            "python gui.py"
        ]
        
        base_config.collectors.http_traffic.enabled = False
        
        base_config.collectors.file_watcher.enabled = True
        base_config.collectors.file_watcher.watch_paths = [
            "./src", "./resources", "./config"
        ]
        
        base_config.collectors.process_monitor.enabled = True
        base_config.collectors.process_monitor.check_interval = 10.0
        
        base_config.collectors.database.enabled = False
    
    return base_config.to_dict()


def get_env_config() -> Dict[str, Any]:
    """환경변수에서 설정 로드"""
    env_config = {}
    
    # 서버 설정
    if os.getenv('LOG_COLLECTOR_HOST'):
        env_config['server'] = env_config.get('server', {})
        env_config['server']['host'] = os.getenv('LOG_COLLECTOR_HOST')
    
    if os.getenv('LOG_COLLECTOR_PORT'):
        env_config['server'] = env_config.get('server', {})
        env_config['server']['port'] = int(os.getenv('LOG_COLLECTOR_PORT'))
    
    if os.getenv('LOG_COLLECTOR_AUTH_TOKEN'):
        env_config['server'] = env_config.get('server', {})
        env_config['server']['auth_token'] = os.getenv('LOG_COLLECTOR_AUTH_TOKEN')
    
    # 저장소 설정
    if os.getenv('LOG_COLLECTOR_DB_PATH'):
        env_config['storage'] = env_config.get('storage', {})
        env_config['storage']['db_path'] = os.getenv('LOG_COLLECTOR_DB_PATH')
    
    if os.getenv('LOG_COLLECTOR_MAX_SIZE_MB'):
        env_config['storage'] = env_config.get('storage', {})
        env_config['storage']['max_size_mb'] = int(os.getenv('LOG_COLLECTOR_MAX_SIZE_MB'))
    
    # 알림 설정
    if os.getenv('LOG_COLLECTOR_WEBHOOK_URL'):
        env_config['alerts'] = env_config.get('alerts', {})
        env_config['alerts']['webhook_url'] = os.getenv('LOG_COLLECTOR_WEBHOOK_URL')
    
    if os.getenv('LOG_COLLECTOR_SLACK_TOKEN'):
        env_config['alerts'] = env_config.get('alerts', {})
        env_config['alerts']['slack_token'] = os.getenv('LOG_COLLECTOR_SLACK_TOKEN')
    
    return env_config


def load_config_with_overrides(config_path: str = None) -> Config:
    """설정 파일 + 환경변수 오버라이드로 최종 설정 로드"""
    
    # 1. 기본 설정
    config = Config()
    
    # 2. 설정 파일 병합
    if config_path and os.path.exists(config_path):
        file_config = Config.from_file(config_path)
        config = config.merge(file_config)
    
    # 3. 환경변수 오버라이드
    env_overrides = get_env_config()
    if env_overrides:
        env_config = Config.from_dict(env_overrides)
        config = config.merge(env_config)
    
    # 4. 검증
    errors = config.validate()
    if errors:
        print("⚠️  설정 검증 오류:")
        for error in errors:
            print(f"   - {error}")
        print("기본값으로 계속 진행합니다.\n")
    
    return config


def create_sample_configs():
    """샘플 설정 파일들 생성"""
    
    configs = {
        "webapp": create_default_config("webapp", "my-webapp"),
        "api": create_default_config("api", "my-api"),
        "microservice": create_default_config("microservice", "my-service"),
        "desktop": create_default_config("desktop", "my-desktop-app")
    }
    
    samples_dir = Path("./config_samples")
    samples_dir.mkdir(exist_ok=True)
    
    for project_type, config_data in configs.items():
        config_path = samples_dir / f"{project_type}_config.yaml"
        
        config = Config.from_dict(config_data)
        config.save(str(config_path))
        
        print(f"샘플 설정 생성: {config_path}")


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='설정 관리 도구')
    parser.add_argument('--create-samples', action='store_true', help='샘플 설정 파일 생성')
    parser.add_argument('--validate', help='설정 파일 검증')
    parser.add_argument('--convert', nargs=2, metavar=('INPUT', 'OUTPUT'), help='설정 파일 변환')
    
    args = parser.parse_args()
    
    if args.create_samples:
        create_sample_configs()
    elif args.validate:
        try:
            config = Config.from_file(args.validate)
            errors = config.validate()
            if errors:
                print("❌ 검증 실패:")
                for error in errors:
                    print(f"   - {error}")
            else:
                print("✅ 설정 파일이 유효합니다")
        except Exception as e:
            print(f"❌ 설정 파일 로드 실패: {e}")
    elif args.convert:
        try:
            input_path, output_path = args.convert
            config = Config.from_file(input_path)
            config.save(output_path)
            print(f"✅ 변환 완료: {input_path} -> {output_path}")
        except Exception as e:
            print(f"❌ 변환 실패: {e}")
    else:
        parser.print_help()
