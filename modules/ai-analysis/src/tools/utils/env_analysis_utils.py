#!/usr/bin/env python3
"""
Enhanced Environment Analysis Utilities
환경변수 사용 패턴 분석, 보안 검증, 다중 환경 관리 도구들
"""

import ast
import os
import re
import asyncio
import hashlib
import base64
from pathlib import Path
from typing import Dict, List, Set, Optional, Union, Any, Tuple, Pattern
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
import logging
from concurrent.futures import ThreadPoolExecutor
import json
import yaml
from cryptography.fernet import Fernet
from pydantic import BaseModel, Field, validator
import aiofiles
import aiohttp

# 로깅 설정
logger = logging.getLogger(__name__)


class EnvVarPriority(Enum):
    """환경변수 우선순위"""
    CRITICAL = "critical"
    IMPORTANT = "important" 
    OPTIONAL = "optional"
    DEBUG = "debug"


class EnvVarStatus(Enum):
    """환경변수 상태"""
    SET = "set"
    NOT_SET = "not_set"
    EMPTY = "empty"
    INVALID = "invalid"
    ENCRYPTED = "encrypted"


class SecurityLevel(Enum):
    """보안 수준"""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    SECRET = "secret"


class EnvVarUsage(BaseModel):
    """환경변수 사용 정보"""
    file: str
    line: int
    context: str
    pattern_type: str
    has_default: bool = False
    is_encrypted: bool = False


class EnvVariable(BaseModel):
    """환경변수 정보"""
    name: str
    priority: EnvVarPriority
    security_level: SecurityLevel
    usages: List[EnvVarUsage] = Field(default_factory=list)
    has_default: bool = False
    current_status: EnvVarStatus
    current_value: Optional[str] = None
    example: Optional[str] = None
    description: Optional[str] = None
    validation_rules: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    last_modified: Optional[datetime] = None
    environments: Dict[str, str] = Field(default_factory=dict)  # env_name -> status
    
    @validator('name')
    def validate_name(cls, v):
        if not re.match(r'^[A-Z][A-Z0-9_]*$', v):
            logger.warning(f"Environment variable name '{v}' doesn't follow conventions")
        return v


class SecurityEvent(BaseModel):
    """보안 이벤트"""
    timestamp: datetime
    event_type: str
    severity: str
    variable_name: str
    file_path: str
    line_number: int
    description: str
    recommendation: str


class AnalysisResult(BaseModel):
    """분석 결과"""
    environment_variables: List[EnvVariable]
    security_events: List[SecurityEvent] = Field(default_factory=list)
    summary: Dict[str, Any]
    scan_results: Dict[str, Any]
    analysis_metadata: Dict[str, Any]


class EnhancedEnvironmentAnalyzer:
    """고도화된 환경변수 분석기"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.env_vars: Dict[str, EnvVariable] = {}
        self.security_events: List[SecurityEvent] = []
        self.encryption_key = self._initialize_encryption()
        
        # 우선순위 키워드 (확장됨)
        self.priority_keywords = {
            EnvVarPriority.CRITICAL: [
                'secret', 'key', 'password', 'token', 'private', 'credential',
                'auth', 'certificate', 'ssl', 'tls', 'jwt', 'oauth', 'api_key',
                'database_password', 'db_password', 'master_key', 'encryption_key'
            ],
            EnvVarPriority.IMPORTANT: [
                'api', 'url', 'host', 'port', 'endpoint', 'service', 'redis',
                'database', 'db_host', 'db_port', 'cache', 'queue', 'broker',
                'smtp', 'mail', 'webhook', 'callback'
            ],
            EnvVarPriority.OPTIONAL: [
                'debug', 'log', 'timeout', 'limit', 'verbose', 'mode',
                'env', 'environment', 'stage', 'region', 'zone'
            ],
            EnvVarPriority.DEBUG: [
                'test', 'dev', 'development', 'staging', 'local', 'mock'
            ]
        }
        
        # 보안 수준 키워드
        self.security_keywords = {
            SecurityLevel.SECRET: [
                'secret', 'password', 'private_key', 'master_key', 'encryption_key',
                'jwt_secret', 'session_secret', 'cookie_secret'
            ],
            SecurityLevel.CONFIDENTIAL: [
                'api_key', 'token', 'credential', 'auth', 'certificate',
                'database_url', 'db_password', 'oauth'
            ],
            SecurityLevel.INTERNAL: [
                'host', 'port', 'endpoint', 'service_url', 'redis_url',
                'queue_url', 'webhook_url'
            ],
            SecurityLevel.PUBLIC: [
                'debug', 'log_level', 'environment', 'region', 'version'
            ]
        }
        
        # 확장된 API 패턴
        self.api_patterns = {
            'OPENAI_API_KEY': {
                'pattern': r'sk-[a-zA-Z0-9]{48}',
                'example': 'sk-your-openai-api-key-here',
                'description': 'OpenAI API 키'
            },
            'ANTHROPIC_API_KEY': {
                'pattern': r'sk-ant-api[0-9]{2}-[a-zA-Z0-9\-_]{95}',
                'example': 'sk-ant-api03-your-anthropic-key-here',
                'description': 'Anthropic API 키'
            },
            'STRIPE_SECRET_KEY': {
                'pattern': r'sk_(test_|live_)[a-zA-Z0-9]{24}',
                'example': 'sk_test_your-stripe-secret-key',
                'description': 'Stripe 비밀 키'
            },
            'GITHUB_TOKEN': {
                'pattern': r'gh[ps]_[a-zA-Z0-9]{36}',
                'example': 'ghp_your-github-personal-access-token',
                'description': 'GitHub 개인 액세스 토큰'
            },
            'DATABASE_URL': {
                'pattern': r'(postgres|postgresql|mysql|mongodb)://.*',
                'example': 'postgresql://user:password@localhost:5432/dbname',
                'description': '데이터베이스 연결 URL'
            },
            'REDIS_URL': {
                'pattern': r'redis://.*',
                'example': 'redis://localhost:6379',
                'description': 'Redis 서버 URL'
            },
            'AWS_ACCESS_KEY_ID': {
                'pattern': r'AKIA[0-9A-Z]{16}',
                'example': 'AKIAIOSFODNN7EXAMPLE',
                'description': 'AWS 액세스 키 ID'
            },
            'AWS_SECRET_ACCESS_KEY': {
                'pattern': r'[A-Za-z0-9/+=]{40}',
                'example': 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                'description': 'AWS 비밀 액세스 키'
            }
        }
        
        # 컴파일된 정규식 패턴 (성능 최적화)
        self.compiled_patterns = self._compile_patterns()
        
        # 검증 규칙
        self.validation_rules = {
            'url': {
                'pattern': r'^https?://|^postgres://|^mysql://|^redis://|^mongodb://',
                'description': 'Valid URL format'
            },
            'port': {
                'pattern': r'^\d{1,5}$',
                'validator': lambda x: 1 <= int(x) <= 65535,
                'description': 'Valid port number (1-65535)'
            },
            'email': {
                'pattern': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
                'description': 'Valid email format'
            },
            'boolean': {
                'pattern': r'^(true|false|1|0|yes|no|on|off)$',
                'description': 'Valid boolean value'
            },
            'json': {
                'validator': self._validate_json,
                'description': 'Valid JSON string'
            }
        }
    
    def _initialize_encryption(self) -> Fernet:
        """암호화 키 초기화"""
        key = os.getenv('ENV_ENCRYPTION_KEY')
        if not key:
            key = Fernet.generate_key()
            logger.warning("No encryption key found, generated new key. Set ENV_ENCRYPTION_KEY to persist.")
        else:
            key = key.encode()
        return Fernet(key)
    
    def _compile_patterns(self) -> Dict[str, Pattern]:
        """정규식 패턴 컴파일 (성능 최적화)"""
        patterns = {}
        
        # Python 패턴
        patterns['python_environ'] = re.compile(r'os\.environ\[[\'"](.*?)[\'"]\]')
        patterns['python_getenv'] = re.compile(r'os\.getenv\([\'"](.*?)[\'"]\)')
        
        # JavaScript 패턴
        patterns['js_process_env'] = re.compile(r'process\.env\.([A-Z_][A-Z0-9_]*)')
        patterns['js_process_env_bracket'] = re.compile(r'process\.env\[[\'"](.*?)[\'"]\]')
        
        # 일반 패턴
        patterns['env_placeholder'] = re.compile(r'\$\{([A-Z_][A-Z0-9_]*)\}')
        patterns['docker_env'] = re.compile(r'ENV\s+([A-Z_][A-Z0-9_]*)')
        
        # 보안 패턴
        for name, info in self.api_patterns.items():
            patterns[f'security_{name}'] = re.compile(info['pattern'])
        
        return patterns
    
    async def analyze_project_async(self, 
                                  project_path: str,
                                  file_patterns: List[str] = None,
                                  include_dependencies: bool = True,
                                  max_workers: int = 4) -> AnalysisResult:
        """비동기 프로젝트 분석"""
        if file_patterns is None:
            file_patterns = ['*.js', '*.ts', '*.tsx', '*.py', '*.json', '*.yaml', '*.yml', '*.env*', 'Dockerfile*']
        
        project_path = Path(project_path).resolve()
        start_time = datetime.now()
        
        # 파일 목록 수집
        files_to_scan = []
        for pattern in file_patterns:
            files_to_scan.extend(project_path.rglob(pattern))
        
        # 필터링
        files_to_scan = [f for f in files_to_scan if self._should_include_file(f)]
        
        logger.info(f"Found {len(files_to_scan)} files to analyze")
        
        # 비동기 배치 처리
        semaphore = asyncio.Semaphore(max_workers)
        tasks = [self._analyze_file_async(file_path, project_path, semaphore) 
                for file_path in files_to_scan]
        
        scan_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 의존성 분석
        if include_dependencies:
            await self._analyze_dependencies_async(project_path)
        
        # 보안 검사
        await self._perform_security_audit()
        
        # 다중 환경 분석
        await self._analyze_multiple_environments(project_path)
        
        # 결과 생성
        return self._generate_analysis_result(
            start_time=start_time,
            files_scanned=len(files_to_scan),
            scan_results=scan_results
        )
    
    async def _analyze_file_async(self, 
                                file_path: Path, 
                                project_root: Path, 
                                semaphore: asyncio.Semaphore) -> Dict[str, Any]:
        """비동기 파일 분석"""
        async with semaphore:
            try:
                relative_path = file_path.relative_to(project_root)
                
                async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                    content = await f.read()
                
                if file_path.suffix == '.py':
                    return await self._analyze_python_file_async(content, relative_path)
                elif file_path.suffix in ['.js', '.ts', '.tsx', '.jsx']:
                    return await self._analyze_javascript_file_async(content, relative_path)
                elif file_path.suffix in ['.json']:
                    return await self._analyze_json_file_async(content, relative_path)
                elif file_path.suffix in ['.yaml', '.yml']:
                    return await self._analyze_yaml_file_async(content, relative_path)
                elif file_path.name.startswith('.env') or 'env' in file_path.name.lower():
                    return await self._analyze_env_file_async(content, relative_path)
                elif 'dockerfile' in file_path.name.lower():
                    return await self._analyze_dockerfile_async(content, relative_path)
                else:
                    return await self._analyze_generic_file_async(content, relative_path)
                
            except Exception as e:
                logger.error(f"Error analyzing {file_path}: {e}")
                return {'error': str(e), 'file': str(file_path)}
    
    async def _analyze_python_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """비동기 Python 파일 분석"""
        try:
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.Subscript):
                    await self._handle_python_environ(node, relative_path)
                elif isinstance(node, ast.Call):
                    await self._handle_python_getenv(node, relative_path)
            
            return {'success': True, 'file': str(relative_path)}
            
        except SyntaxError:
            # AST 파싱 실패시 정규식으로 폴백
            return await self._analyze_with_regex_async(content, relative_path)
    
    async def _handle_python_environ(self, node: ast.Subscript, relative_path: Path):
        """Python os.environ 처리"""
        if (isinstance(node.value, ast.Attribute) and 
            isinstance(node.value.value, ast.Name) and
            node.value.value.id == 'os' and
            node.value.attr == 'environ'):
            
            if isinstance(node.slice, ast.Constant):
                env_name = node.slice.value
                usage = EnvVarUsage(
                    file=str(relative_path),
                    line=node.lineno,
                    context=f"os.environ['{env_name}']",
                    pattern_type="python_environ",
                    has_default=False
                )
                await self._add_env_usage(env_name, usage)
    
    async def _handle_python_getenv(self, node: ast.Call, relative_path: Path):
        """Python os.getenv 처리"""
        if (isinstance(node.func, ast.Attribute) and
            isinstance(node.func.value, ast.Name) and
            node.func.value.id == 'os' and
            node.func.attr == 'getenv'):
            
            if node.args and isinstance(node.args[0], ast.Constant):
                env_name = node.args[0].value
                has_default = len(node.args) > 1
                
                usage = EnvVarUsage(
                    file=str(relative_path),
                    line=node.lineno,
                    context=f"os.getenv('{env_name}'" + (", 'default')" if has_default else ")"),
                    pattern_type="python_getenv",
                    has_default=has_default
                )
                await self._add_env_usage(env_name, usage)
    
    async def _analyze_javascript_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """비동기 JavaScript 파일 분석"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines, 1):
            # process.env.VARIABLE 패턴
            for match in self.compiled_patterns['js_process_env'].finditer(line):
                env_name = match.group(1)
                has_default = '||' in line or '??' in line or '?.';
                
                usage = EnvVarUsage(
                    file=str(relative_path),
                    line=i,
                    context=match.group(0),
                    pattern_type="js_process_env",
                    has_default=has_default
                )
                await self._add_env_usage(env_name, usage)
            
            # process.env['VARIABLE'] 패턴
            for match in self.compiled_patterns['js_process_env_bracket'].finditer(line):
                env_name = match.group(1)
                has_default = '||' in line or '??' in line
                
                usage = EnvVarUsage(
                    file=str(relative_path),
                    line=i,
                    context=match.group(0),
                    pattern_type="js_process_env_bracket",
                    has_default=has_default
                )
                await self._add_env_usage(env_name, usage)
        
        return {'success': True, 'file': str(relative_path)}
    
    async def _analyze_env_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """환경변수 파일 분석"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # 값이 암호화되어 있는지 확인
                    is_encrypted = self._is_encrypted_value(value)
                    
                    usage = EnvVarUsage(
                        file=str(relative_path),
                        line=i,
                        context=line,
                        pattern_type="env_file",
                        has_default=True,
                        is_encrypted=is_encrypted
                    )
                    await self._add_env_usage(key, usage)
        
        return {'success': True, 'file': str(relative_path)}
    
    async def _analyze_dockerfile_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """Dockerfile 분석"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines, 1):
            # ENV 명령어
            if line.strip().startswith('ENV'):
                match = self.compiled_patterns['docker_env'].match(line)
                if match:
                    env_name = match.group(1)
                    
                    usage = EnvVarUsage(
                        file=str(relative_path),
                        line=i,
                        context=line.strip(),
                        pattern_type="dockerfile_env",
                        has_default=True
                    )
                    await self._add_env_usage(env_name, usage)
        
        return {'success': True, 'file': str(relative_path)}
    
    async def _add_env_usage(self, env_name: str, usage: EnvVarUsage):
        """환경변수 사용 정보 추가"""
        if env_name not in self.env_vars:
            self.env_vars[env_name] = EnvVariable(
                name=env_name,
                priority=self._determine_priority(env_name),
                security_level=self._determine_security_level(env_name),
                current_status=self._check_current_status(env_name),
                current_value=self._get_masked_value(env_name),
                example=self._get_example_value(env_name),
                description=self._get_description(env_name),
                validation_rules=self._get_validation_rules(env_name),
                tags=self._generate_tags(env_name)
            )
        
        # 중복 사용 정보 확인
        existing_usage = next(
            (u for u in self.env_vars[env_name].usages 
             if u.file == usage.file and u.line == usage.line), 
            None
        )
        
        if not existing_usage:
            self.env_vars[env_name].usages.append(usage)
        
        # 기본값 존재 여부 업데이트
        if usage.has_default:
            self.env_vars[env_name].has_default = True
    
    async def _perform_security_audit(self):
        """보안 감사 수행"""
        for env_name, env_var in self.env_vars.items():
            # 하드코딩된 시크릿 검사
            await self._check_hardcoded_secrets(env_var)
            
            # 약한 패스워드 검사
            await self._check_weak_credentials(env_var)
            
            # 민감한 정보 노출 검사
            await self._check_sensitive_exposure(env_var)
            
            # 암호화 상태 검사
            await self._check_encryption_status(env_var)
    
    async def _check_hardcoded_secrets(self, env_var: EnvVariable):
        """하드코딩된 시크릿 검사"""
        if env_var.security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]:
            for usage in env_var.usages:
                # 값이 직접 하드코딩되어 있는지 확인
                if self._contains_hardcoded_value(usage.context):
                    event = SecurityEvent(
                        timestamp=datetime.now(),
                        event_type="hardcoded_secret",
                        severity="HIGH",
                        variable_name=env_var.name,
                        file_path=usage.file,
                        line_number=usage.line,
                        description=f"Potential hardcoded secret detected for {env_var.name}",
                        recommendation="Use environment variables instead of hardcoded secrets"
                    )
                    self.security_events.append(event)
    
    async def _check_weak_credentials(self, env_var: EnvVariable):
        """약한 자격증명 검사"""
        if env_var.current_value and env_var.security_level == SecurityLevel.SECRET:
            if self._is_weak_credential(env_var.current_value):
                event = SecurityEvent(
                    timestamp=datetime.now(),
                    event_type="weak_credential",
                    severity="MEDIUM",
                    variable_name=env_var.name,
                    file_path="environment",
                    line_number=0,
                    description=f"Weak credential detected for {env_var.name}",
                    recommendation="Use strong, randomly generated credentials"
                )
                self.security_events.append(event)
    
    def encrypt_sensitive_vars(self, vars_dict: Dict[str, str]) -> Dict[str, str]:
        """민감한 환경변수 암호화"""
        encrypted_vars = {}
        
        for key, value in vars_dict.items():
            if key in self.env_vars:
                env_var = self.env_vars[key]
                if env_var.security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]:
                    encrypted_value = self.encryption_key.encrypt(value.encode()).decode()
                    encrypted_vars[key] = f"ENC({encrypted_value})"
                else:
                    encrypted_vars[key] = value
            else:
                encrypted_vars[key] = value
        
        return encrypted_vars
    
    def decrypt_sensitive_vars(self, vars_dict: Dict[str, str]) -> Dict[str, str]:
        """암호화된 환경변수 복호화"""
        decrypted_vars = {}
        
        for key, value in vars_dict.items():
            if isinstance(value, str) and value.startswith("ENC(") and value.endswith(")"):
                try:
                    encrypted_value = value[4:-1]  # ENC( 와 ) 제거
                    decrypted_value = self.encryption_key.decrypt(encrypted_value.encode()).decode()
                    decrypted_vars[key] = decrypted_value
                except Exception as e:
                    logger.error(f"Failed to decrypt {key}: {e}")
                    decrypted_vars[key] = value
            else:
                decrypted_vars[key] = value
        
        return decrypted_vars
    
    async def sync_environments(self, 
                              source_env: str, 
                              target_envs: List[str],
                              exclude_vars: List[str] = None) -> Dict[str, Any]:
        """환경간 변수 동기화"""
        exclude_vars = exclude_vars or []
        results = {}
        
        # 소스 환경 로드
        source_vars = await self._load_environment_config(source_env)
        
        for target_env in target_envs:
            try:
                target_vars = await self._load_environment_config(target_env)
                
                # 차이점 분석
                differences = self._compare_environments(source_vars, target_vars)
                
                # 동기화할 변수 필터링
                sync_vars = {
                    k: v for k, v in differences['missing_in_target'].items()
                    if k not in exclude_vars
                }
                
                # 동기화 실행
                if sync_vars:
                    await self._update_environment_config(target_env, sync_vars)
                
                results[target_env] = {
                    'synced_vars': list(sync_vars.keys()),
                    'differences': differences,
                    'status': 'success'
                }
                
            except Exception as e:
                results[target_env] = {
                    'status': 'error',
                    'error': str(e)
                }
        
        return results
    
    def generate_env_docs(self, output_format: str = 'markdown') -> str:
        """환경변수 문서 생성"""
        if output_format == 'markdown':
            return self._generate_markdown_docs()
        elif output_format == 'html':
            return self._generate_html_docs()
        elif output_format == 'json':
            return self._generate_json_docs()
        else:
            raise ValueError(f"Unsupported format: {output_format}")
    
    def _generate_markdown_docs(self) -> str:
        """마크다운 문서 생성"""
        lines = [
            "# Environment Variables Documentation",
            "",
            f"Generated on: {datetime.now().isoformat()}",
            "",
            "## Summary",
            ""
        ]
        
        # 우선순위별 통계
        priority_stats = {}
        for env_var in self.env_vars.values():
            priority = env_var.priority.value
            priority_stats[priority] = priority_stats.get(priority, 0) + 1
        
        for priority, count in priority_stats.items():
            lines.append(f"- **{priority.upper()}**: {count} variables")
        
        lines.extend(["", "## Variables by Priority", ""])
        
        # 우선순위별 변수 목록
        for priority in EnvVarPriority:
            vars_in_priority = [v for v in self.env_vars.values() if v.priority == priority]
            if vars_in_priority:
                lines.extend([f"### {priority.value.upper()}", ""])
                
                for env_var in sorted(vars_in_priority, key=lambda x: x.name):
                    lines.extend([
                        f"#### `{env_var.name}`",
                        "",
                        f"**Status**: {env_var.current_status.value}",
                        f"**Security Level**: {env_var.security_level.value}",
                        ""
                    ])
                    
                    if env_var.description:
                        lines.extend([f"**Description**: {env_var.description}", ""])
                    
                    if env_var.example:
                        lines.extend([f"**Example**: `{env_var.example}`", ""])
                    
                    if env_var.usages:
                        lines.extend(["**Used in**:", ""])
                        for usage in env_var.usages:
                            lines.append(f"- `{usage.file}:{usage.line}` - {usage.context}")
                        lines.append("")
                    
                    lines.append("---")
                    lines.append("")
        
        return "\n".join(lines)
    
    def _determine_priority(self, var_name: str) -> EnvVarPriority:
        """환경변수 우선순위 결정"""
        var_lower = var_name.lower()
        
        for priority, keywords in self.priority_keywords.items():
            if any(keyword in var_lower for keyword in keywords):
                return priority
        
        return EnvVarPriority.OPTIONAL
    
    def _determine_security_level(self, var_name: str) -> SecurityLevel:
        """보안 수준 결정"""
        var_lower = var_name.lower()
        
        for level, keywords in self.security_keywords.items():
            if any(keyword in var_lower for keyword in keywords):
                return level
        
        return SecurityLevel.INTERNAL
    
    def _check_current_status(self, var_name: str) -> EnvVarStatus:
        """현재 환경변수 설정 상태 확인"""
        value = os.getenv(var_name)
        
        if value is None:
            return EnvVarStatus.NOT_SET
        elif value == "":
            return EnvVarStatus.EMPTY
        elif self._is_encrypted_value(value):
            return EnvVarStatus.ENCRYPTED
        elif self._is_invalid_value(var_name, value):
            return EnvVarStatus.INVALID
        else:
            return EnvVarStatus.SET
    
    def _get_masked_value(self, var_name: str) -> Optional[str]:
        """마스킹된 값 반환 (보안)"""
        value = os.getenv(var_name)
        if not value:
            return None
        
        if var_name in self.env_vars:
            security_level = self.env_vars[var_name].security_level
            if security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]:
                # 앞 3자리와 뒤 3자리만 표시
                if len(value) > 6:
                    return f"{value[:3]}{'*' * (len(value) - 6)}{value[-3:]}"
                else:
                    return "*" * len(value)
        
        return value[:50] + "..." if len(value) > 50 else value
    
    def _get_example_value(self, var_name: str) -> Optional[str]:
        """환경변수 예제 값 제공"""
        if var_name in self.api_patterns:
            return self.api_patterns[var_name]['example']
        
        var_lower = var_name.lower()
        examples = {
            'port': '3000',
            'host': 'localhost',
            'database_url': 'postgresql://user:password@localhost:5432/dbname',
            'redis_url': 'redis://localhost:6379',
            'debug': 'true',
            'timeout': '30000',
            'limit': '100',
            'log_level': 'INFO',
            'environment': 'development',
            'region': 'us-east-1',
            'zone': 'us-east-1a'
        }
        
        for key, example in examples.items():
            if key in var_lower:
                return example
        
        return None
    
    def _get_description(self, var_name: str) -> Optional[str]:
        """환경변수 설명 생성"""
        if var_name in self.api_patterns:
            return self.api_patterns[var_name]['description']
        
        var_lower = var_name.lower()
        descriptions = {
            'database_url': '데이터베이스 연결 URL',
            'redis_url': 'Redis 서버 URL',
            'debug': '디버그 모드 활성화',
            'port': '서버 포트 번호',
            'host': '서버 호스트',
            'secret': '보안 시크릿 키',
            'token': '인증 토큰',
            'password': '비밀번호',
            'api_key': 'API 인증 키',
            'log_level': '로그 레벨 설정',
            'timeout': '타임아웃 설정 (밀리초)',
            'environment': '실행 환경 (development, production 등)',
            'region': '클라우드 리전',
            'webhook': '웹훅 URL'
        }
        
        for key, desc in descriptions.items():
            if key in var_lower:
                return desc
        
        return None
    
    def _get_validation_rules(self, var_name: str) -> Dict[str, Any]:
        """검증 규칙 반환"""
        var_lower = var_name.lower()
        rules = {}
        
        if 'url' in var_lower:
            rules.update(self.validation_rules['url'])
        elif 'port' in var_lower:
            rules.update(self.validation_rules['port'])
        elif 'email' in var_lower:
            rules.update(self.validation_rules['email'])
        elif any(keyword in var_lower for keyword in ['debug', 'enable', 'disable']):
            rules.update(self.validation_rules['boolean'])
        elif var_lower.endswith('_json') or 'config' in var_lower:
            rules.update(self.validation_rules['json'])
        
        return rules
    
    def _generate_tags(self, var_name: str) -> List[str]:
        """태그 생성"""
        var_lower = var_name.lower()
        tags = []
        
        # 서비스별 태그
        services = ['database', 'redis', 'api', 'auth', 'mail', 'storage', 'queue']
        for service in services:
            if service in var_lower:
                tags.append(service)
        
        # 환경별 태그
        environments = ['dev', 'test', 'staging', 'prod']
        for env in environments:
            if env in var_lower:
                tags.append(f"env:{env}")
        
        # 타입별 태그
        types = ['secret', 'config', 'endpoint', 'credential']
        for type_tag in types:
            if type_tag in var_lower:
                tags.append(f"type:{type_tag}")
        
        return tags
    
    def _should_include_file(self, file_path: Path) -> bool:
        """파일 포함 여부 판단"""
        skip_patterns = [
            'node_modules', '.git', '__pycache__', 'venv', '.venv',
            'dist', 'build', '.next', '.nuxt', 'target', 'vendor',
            '.pytest_cache', '.coverage', '.tox'
        ]
        
        # 크기 제한 (10MB)
        try:
            if file_path.stat().st_size > 10 * 1024 * 1024:
                return False
        except OSError:
            return False
        
        return not any(pattern in str(file_path) for pattern in skip_patterns)
    
    def _is_encrypted_value(self, value: str) -> bool:
        """값이 암호화되어 있는지 확인"""
        return (isinstance(value, str) and 
                value.startswith("ENC(") and 
                value.endswith(")"))
    
    def _is_invalid_value(self, var_name: str, value: str) -> bool:
        """값이 유효하지 않은지 확인"""
        if var_name in self.env_vars:
            rules = self.env_vars[var_name].validation_rules
            
            # 패턴 검증
            if 'pattern' in rules:
                if not re.match(rules['pattern'], value):
                    return True
            
            # 커스텀 검증자
            if 'validator' in rules:
                try:
                    return not rules['validator'](value)
                except Exception:
                    return True
        
        return False
    
    def _validate_json(self, value: str) -> bool:
        """JSON 형식 검증"""
        try:
            json.loads(value)
            return True
        except (json.JSONDecodeError, TypeError):
            return False
    
    def _contains_hardcoded_value(self, context: str) -> bool:
        """하드코딩된 값 포함 여부 확인"""
        # 문자열 리터럴에 실제 값이 있는지 확인
        hardcoded_patterns = [
            r'["\'][a-zA-Z0-9+/]{20,}["\']',  # Base64 형태
            r'["\']sk-[a-zA-Z0-9]{20,}["\']',  # API 키 형태
            r'["\'][A-Z0-9]{20,}["\']',        # 대문자+숫자 조합
        ]
        
        for pattern in hardcoded_patterns:
            if re.search(pattern, context):
                return True
        
        return False
    
    def _is_weak_credential(self, value: str) -> bool:
        """약한 자격증명 확인"""
        weak_patterns = [
            r'^(password|123456|admin|test),
            r'^.{1,7},  # 너무 짧음
            r'^[a-z]+,  # 소문자만
            r'^[0-9]+,  # 숫자만
        ]
        
        for pattern in weak_patterns:
            if re.match(pattern, value, re.IGNORECASE):
                return True
        
        return False
    
    async def _analyze_dependencies_async(self, project_path: Path):
        """의존성 파일 비동기 분석"""
        dependency_files = [
            'package.json', 'requirements.txt', 'Pipfile',
            'composer.json', 'Gemfile', 'go.mod', 'Cargo.toml',
            '.env.example', '.env.template'
        ]
        
        tasks = []
        for filename in dependency_files:
            file_path = project_path / filename
            if file_path.exists():
                if filename == 'package.json':
                    tasks.append(self._analyze_package_json_async(file_path))
                elif filename in ['requirements.txt', 'Pipfile']:
                    tasks.append(self._analyze_python_deps_async(file_path))
                elif filename.startswith('.env.'):
                    tasks.append(self._analyze_env_template_async(file_path))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _analyze_package_json_async(self, file_path: Path):
        """package.json 비동기 분석"""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                data = json.loads(content)
            
            # scripts 섹션에서 환경변수 찾기
            scripts = data.get('scripts', {})
            for script_name, script_content in scripts.items():
                env_vars = re.findall(r'\$([A-Z_][A-Z0-9_]*)', script_content)
                for env_var in env_vars:
                    usage = EnvVarUsage(
                        file=str(file_path),
                        line=0,
                        context=f"script: {script_name}",
                        pattern_type="package_json_script",
                        has_default=False
                    )
                    await self._add_env_usage(env_var, usage)
        
        except Exception as e:
            logger.error(f"Error analyzing package.json: {e}")
    
    async def _analyze_multiple_environments(self, project_path: Path):
        """다중 환경 분석"""
        env_files = list(project_path.glob('.env*'))
        
        for env_file in env_files:
            env_name = env_file.name
            if env_name in ['.env', '.env.local', '.env.development', '.env.production']:
                try:
                    async with aiofiles.open(env_file, 'r', encoding='utf-8') as f:
                        content = await f.read()
                    
                    env_vars_in_file = {}
                    for line in content.split('\n'):
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            env_vars_in_file[key.strip()] = value.strip()
                    
                    # 각 환경변수에 환경 정보 추가
                    for var_name in env_vars_in_file:
                        if var_name in self.env_vars:
                            self.env_vars[var_name].environments[env_name] = 'defined'
                
                except Exception as e:
                    logger.error(f"Error analyzing {env_file}: {e}")
    
    async def _load_environment_config(self, env_name: str) -> Dict[str, str]:
        """환경 설정 로드"""
        # 실제 구현에서는 다양한 소스에서 로드
        # 예: .env 파일, 클라우드 설정, 데이터베이스 등
        env_file = Path(f".env.{env_name}")
        if env_file.exists():
            async with aiofiles.open(env_file, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            env_vars = {}
            for line in content.split('\n'):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
            
            return env_vars
        
        return {}
    
    def _compare_environments(self, source_vars: Dict[str, str], target_vars: Dict[str, str]) -> Dict[str, Any]:
        """환경 간 비교"""
        source_keys = set(source_vars.keys())
        target_keys = set(target_vars.keys())
        
        return {
            'missing_in_target': {k: source_vars[k] for k in source_keys - target_keys},
            'missing_in_source': {k: target_vars[k] for k in target_keys - source_keys},
            'common_vars': {k: {'source': source_vars[k], 'target': target_vars[k]} 
                           for k in source_keys & target_keys 
                           if source_vars[k] != target_vars[k]}
        }
    
    async def _update_environment_config(self, env_name: str, vars_to_update: Dict[str, str]):
        """환경 설정 업데이트"""
        env_file = Path(f".env.{env_name}")
        
        # 기존 내용 로드
        existing_vars = {}
        if env_file.exists():
            async with aiofiles.open(env_file, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            for line in content.split('\n'):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    existing_vars[key.strip()] = value.strip()
        
        # 업데이트
        existing_vars.update(vars_to_update)
        
        # 파일에 쓰기
        lines = []
        for key, value in existing_vars.items():
            lines.append(f"{key}={value}")
        
        async with aiofiles.open(env_file, 'w', encoding='utf-8') as f:
            await f.write('\n'.join(lines))
    
    def _generate_analysis_result(self, 
                                start_time: datetime, 
                                files_scanned: int, 
                                scan_results: List[Any]) -> AnalysisResult:
        """분석 결과 생성"""
        end_time = datetime.now()
        execution_time = (end_time - start_time).total_seconds()
        
        # 요약 통계
        summary = {
            'total_vars': len(self.env_vars),
            'by_priority': {},
            'by_security_level': {},
            'by_status': {},
            'missing_critical': 0,
            'security_issues': len(self.security_events)
        }
        
        for env_var in self.env_vars.values():
            # 우선순위별
            priority = env_var.priority.value
            summary['by_priority'][priority] = summary['by_priority'].get(priority, 0) + 1
            
            # 보안 수준별
            security_level = env_var.security_level.value
            summary['by_security_level'][security_level] = summary['by_security_level'].get(security_level, 0) + 1
            
            # 상태별
            status = env_var.current_status.value
            summary['by_status'][status] = summary['by_status'].get(status, 0) + 1
            
            # 누락된 중요 변수
            if (env_var.priority == EnvVarPriority.CRITICAL and 
                env_var.current_status == EnvVarStatus.NOT_SET):
                summary['missing_critical'] += 1
        
        scan_results_summary = {
            'files_scanned': files_scanned,
            'execution_time': execution_time,
            'errors': [r for r in scan_results if isinstance(r, Exception) or 
                      (isinstance(r, dict) and 'error' in r)]
        }
        
        analysis_metadata = {
            'analyzer_version': '2.0.0',
            'analysis_timestamp': end_time.isoformat(),
            'configuration': self.config,
            'patterns_used': list(self.compiled_patterns.keys())
        }
        
        return AnalysisResult(
            environment_variables=list(self.env_vars.values()),
            security_events=self.security_events,
            summary=summary,
            scan_results=scan_results_summary,
            analysis_metadata=analysis_metadata
        )
    
    async def _analyze_with_regex_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """정규식 기반 폴백 분석"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines, 1):
            # 모든 패턴 확인
            for pattern_name, compiled_pattern in self.compiled_patterns.items():
                matches = compiled_pattern.finditer(line)
                for match in matches:
                    env_name = match.group(1) if match.groups() else match.group(0)
                    
                    usage = EnvVarUsage(
                        file=str(relative_path),
                        line=i,
                        context=match.group(0),
                        pattern_type=pattern_name,
                        has_default='default' in line.lower() or '||' in line
                    )
                    await self._add_env_usage(env_name, usage)
        
        return {'success': True, 'file': str(relative_path)}
    
    async def _analyze_json_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """JSON 파일 비동기 분석"""
        try:
            # JSON에서 ${ENV_VAR} 패턴 찾기
            lines = content.split('\n')
            
            for i, line in enumerate(lines, 1):
                matches = self.compiled_patterns['env_placeholder'].finditer(line)
                for match in matches:
                    env_name = match.group(1)
                    
                    usage = EnvVarUsage(
                        file=str(relative_path),
                        line=i,
                        context=match.group(0),
                        pattern_type="json_placeholder",
                        has_default=False
                    )
                    await self._add_env_usage(env_name, usage)
            
            return {'success': True, 'file': str(relative_path)}
        
        except Exception as e:
            return {'error': str(e), 'file': str(relative_path)}
    
    async def _analyze_yaml_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """YAML 파일 비동기 분석"""
        try:
            # YAML에서 ${ENV_VAR} 패턴과 환경변수 참조 찾기
            lines = content.split('\n')
            
            for i, line in enumerate(lines, 1):
                # ${ENV_VAR} 패턴
                matches = self.compiled_patterns['env_placeholder'].finditer(line)
                for match in matches:
                    env_name = match.group(1)
                    
                    usage = EnvVarUsage(
                        file=str(relative_path),
                        line=i,
                        context=match.group(0),
                        pattern_type="yaml_placeholder",
                        has_default=False
                    )
                    await self._add_env_usage(env_name, usage)
            
            return {'success': True, 'file': str(relative_path)}
        
        except Exception as e:
            return {'error': str(e), 'file': str(relative_path)}
    
    async def _analyze_generic_file_async(self, content: str, relative_path: Path) -> Dict[str, Any]:
        """일반 파일 비동기 분석"""
        return await self._analyze_with_regex_async(content, relative_path)
    
    async def _analyze_env_template_async(self, file_path: Path):
        """환경변수 템플릿 파일 분석"""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key = line.split('=')[0].strip()
                        
                        usage = EnvVarUsage(
                            file=str(file_path),
                            line=i,
                            context=line,
                            pattern_type="env_template",
                            has_default=True
                        )
                        await self._add_env_usage(key, usage)
        
        except Exception as e:
            logger.error(f"Error analyzing env template {file_path}: {e}")
    
    async def _analyze_python_deps_async(self, file_path: Path):
        """Python 의존성 파일 분석"""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            # 환경변수 관련 패키지 확인
            env_packages = ['python-dotenv', 'python-decouple', 'environs', 'pydantic[dotenv]']
            
            for package in env_packages:
                if package in content:
                    logger.info(f"Found environment package: {package} in {file_path}")
        
        except Exception as e:
            logger.error(f"Error analyzing Python deps {file_path}: {e}")
    
    async def _check_sensitive_exposure(self, env_var: EnvVariable):
        """민감한 정보 노출 검사"""
        if env_var.security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]:
            for usage in env_var.usages:
                # 로그 파일이나 설정 파일에 노출되었는지 확인
                if any(keyword in usage.file.lower() for keyword in ['log', 'config', 'public']):
                    event = SecurityEvent(
                        timestamp=datetime.now(),
                        event_type="sensitive_exposure",
                        severity="HIGH",
                        variable_name=env_var.name,
                        file_path=usage.file,
                        line_number=usage.line,
                        description=f"Sensitive variable {env_var.name} may be exposed in {usage.file}",
                        recommendation="Ensure sensitive variables are not logged or exposed in public files"
                    )
                    self.security_events.append(event)
    
    async def _check_encryption_status(self, env_var: EnvVariable):
        """암호화 상태 검사"""
        if (env_var.security_level == SecurityLevel.SECRET and 
            env_var.current_status == EnvVarStatus.SET and
            not any(usage.is_encrypted for usage in env_var.usages)):
            
            event = SecurityEvent(
                timestamp=datetime.now(),
                event_type="unencrypted_secret",
                severity="MEDIUM",
                variable_name=env_var.name,
                file_path="environment",
                line_number=0,
                description=f"Secret variable {env_var.name} is not encrypted",
                recommendation="Consider encrypting sensitive environment variables"
            )
            self.security_events.append(event)
    
    def _generate_html_docs(self) -> str:
        """HTML 문서 생성"""
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Environment Variables Documentation</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .variable {{ border: 1px solid #ddd; margin: 20px 0; padding: 20px; }}
                .critical {{ border-left: 5px solid #ff4444; }}
                .important {{ border-left: 5px solid #ff8800; }}
                .optional {{ border-left: 5px solid #44aa44; }}
                .status-set {{ color: green; }}
                .status-not-set {{ color: red; }}
                .status-invalid {{ color: orange; }}
            </style>
        </head>
        <body>
            <h1>Environment Variables Documentation</h1>
            <p>Generated on: {datetime.now().isoformat()}</p>
        """
        
        for env_var in sorted(self.env_vars.values(), key=lambda x: (x.priority.value, x.name)):
            html += f"""
            <div class="variable {env_var.priority.value}">
                <h3>{env_var.name}</h3>
                <p><strong>Status:</strong> <span class="status-{env_var.current_status.value.replace('_', '-')}">{env_var.current_status.value}</span></p>
                <p><strong>Priority:</strong> {env_var.priority.value}</p>
                <p><strong>Security Level:</strong> {env_var.security_level.value}</p>
            """
            
            if env_var.description:
                html += f"<p><strong>Description:</strong> {env_var.description}</p>"
            
            if env_var.example:
                html += f"<p><strong>Example:</strong> <code>{env_var.example}</code></p>"
            
            if env_var.usages:
                html += "<p><strong>Used in:</strong></p><ul>"
                for usage in env_var.usages:
                    html += f"<li><code>{usage.file}:{usage.line}</code> - {usage.context}</li>"
                html += "</ul>"
            
            html += "</div>"
        
        html += "</body></html>"
        return html
    
    def _generate_json_docs(self) -> str:
        """JSON 문서 생성"""
        return json.dumps({
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'total_variables': len(self.env_vars)
            },
            'variables': [var.dict() for var in self.env_vars.values()],
            'security_events': [event.dict() for event in self.security_events]
        }, indent=2, ensure_ascii=False, default=str)


# 편의 함수들
async def analyze_env_usage_async(project_path: str = '.', 
                                file_patterns: List[str] = None, 
                                include_deps: bool = True,
                                max_workers: int = 4) -> AnalysisResult:
    """비동기 환경변수 사용 분석 (편의 함수)"""
    analyzer = EnhancedEnvironmentAnalyzer()
    return await analyzer.analyze_project_async(project_path, file_patterns, include_deps, max_workers)

def analyze_env_usage_sync(project_path: str = '.', 
                          file_patterns: List[str] = None, 
                          include_deps: bool = True) -> AnalysisResult:
    """동기 환경변수 사용 분석 (편의 함수)"""
    return asyncio.run(analyze_env_usage_async(project_path, file_patterns, include_deps))

async def generate_env_template_async(project_path: str = '.', 
                                    output_file: str = '.env.example',
                                    include_examples: bool = True) -> str:
    """비동기 환경변수 템플릿 생성 (편의 함수)"""
    analysis_result = await analyze_env_usage_async(project_path)
    
    template_lines = [
        "# Environment Variables Template",
        "# Copy this file to .env and fill in your values",
        f"# Generated on: {datetime.now().isoformat()}",
        ""
    ]
    
    # 우선순위별로 그룹화
    for priority in EnvVarPriority:
        priority_vars = [v for v in analysis_result.environment_variables if v.priority == priority]
        if priority_vars:
            template_lines.append(f"# {priority.value.upper()} Variables")
            for var in sorted(priority_vars, key=lambda x: x.name):
                if var.description:
                    template_lines.append(f"# {var.description}")
                
                if include_examples and var.example:
                    template_lines.append(f"# Example: {var.example}")
                
                if var.has_default:
                    template_lines.append(f"# {var.name}=")
                else:
                    template_lines.append(f"{var.name}=")
                
                template_lines.append("")
            template_lines.append("")
    
    template_content = '\n'.join(template_lines)
    
    # 파일에 쓰기
    async with aiofiles.open(output_file, 'w', encoding='utf-8') as f:
        await f.write(template_content)
    
    return template_content

def generate_env_template_sync(project_path: str = '.', 
                              output_file: str = '.env.example',
                              include_examples: bool = True) -> str:
    """동기 환경변수 템플릿 생성 (편의 함수)"""
    return asyncio.run(generate_env_template_async(project_path, output_file, include_examples))

async def validate_current_env_async(project_path: str = '.') -> Dict[str, Any]:
    """비동기 현재 환경변수 검증 (편의 함수)"""
    analysis_result = await analyze_env_usage_async(project_path)
    
    validation_results = {
        'valid': [],
        'invalid': [],
        'missing': [],
        'warnings': [],
        'security_issues': []
    }
    
    for var in analysis_result.environment_variables:
        var_name = var.name
        
        if var.current_status == EnvVarStatus.NOT_SET:
            if var.priority in [EnvVarPriority.CRITICAL, EnvVarPriority.IMPORTANT]:
                validation_results['missing'].append({
                    'name': var_name,
                    'priority': var.priority.value,
                    'reason': f'{var.priority.value.title()} environment variable not set'
                })
        elif var.current_status == EnvVarStatus.INVALID:
            validation_results['invalid'].append({
                'name': var_name,
                'reason': 'Value does not match validation rules',
                'rules': var.validation_rules
            })
        elif var.current_status == EnvVarStatus.SET:
            validation_results['valid'].append({
                'name': var_name,
                'security_level': var.security_level.value
            })
        elif var.current_status == EnvVarStatus.EMPTY:
            validation_results['warnings'].append({
                'name': var_name,
                'reason': 'Environment variable is set but empty'
            })
    
    # 보안 이슈 추가
    for event in analysis_result.security_events:
        validation_results['security_issues'].append({
            'variable': event.variable_name,
            'type': event.event_type,
            'severity': event.severity,
            'description': event.description,
            'recommendation': event.recommendation
        })
    
    return validation_results

def validate_current_env_sync(project_path: str = '.') -> Dict[str, Any]:
    """동기 현재 환경변수 검증 (편의 함수)"""
    return asyncio.run(validate_current_env_async(project_path))

async def find_missing_env_vars_async(project_path: str = '.') -> List[Dict[str, str]]:
    """비동기 누락된 환경변수 찾기 (편의 함수)"""
    analysis_result = await analyze_env_usage_async(project_path)
    
    missing_vars = []
    for var in analysis_result.environment_variables:
        if (var.current_status == EnvVarStatus.NOT_SET and 
            var.priority in [EnvVarPriority.CRITICAL, EnvVarPriority.IMPORTANT]):
            missing_vars.append({
                'name': var.name,
                'priority': var.priority.value,
                'description': var.description or 'No description available',
                'example': var.example or 'No example available'
            })
    
    return missing_vars

def find_missing_env_vars_sync(project_path: str = '.') -> List[Dict[str, str]]:
    """동기 누락된 환경변수 찾기 (편의 함수)"""
    return asyncio.run(find_missing_env_vars_async(project_path))

async def encrypt_env_file_async(input_file: str, output_file: str = None) -> Dict[str, Any]:
    """환경변수 파일 암호화 (편의 함수)"""
    analyzer = EnhancedEnvironmentAnalyzer()
    
    if output_file is None:
        output_file = f"{input_file}.encrypted"
    
    try:
        # 원본 파일 읽기
        async with aiofiles.open(input_file, 'r', encoding='utf-8') as f:
            content = await f.read()
        
        # 환경변수 파싱
        env_vars = {}
        for line in content.split('\n'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env_vars[key.strip()] = value.strip()
        
        # 민감한 변수 암호화
        encrypted_vars = analyzer.encrypt_sensitive_vars(env_vars)
        
        # 암호화된 파일 생성
        encrypted_lines = []
        for key, value in encrypted_vars.items():
            encrypted_lines.append(f"{key}={value}")
        
        encrypted_content = '\n'.join(encrypted_lines)
        
        async with aiofiles.open(output_file, 'w', encoding='utf-8') as f:
            await f.write(encrypted_content)
        
        return {
            'success': True,
            'input_file': input_file,
            'output_file': output_file,
            'encrypted_count': sum(1 for v in encrypted_vars.values() if v.startswith('ENC(')),
            'total_vars': len(encrypted_vars)
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def encrypt_env_file_sync(input_file: str, output_file: str = None) -> Dict[str, Any]:
    """동기 환경변수 파일 암호화 (편의 함수)"""
    return asyncio.run(encrypt_env_file_async(input_file, output_file))

async def sync_environments_async(source_env: str, 
                                target_envs: List[str],
                                exclude_vars: List[str] = None) -> Dict[str, Any]:
    """비동기 환경 동기화 (편의 함수)"""
    analyzer = EnhancedEnvironmentAnalyzer()
    return await analyzer.sync_environments(source_env, target_envs, exclude_vars)

def sync_environments_sync(source_env: str, 
                          target_envs: List[str],
                          exclude_vars: List[str] = None) -> Dict[str, Any]:
    """동기 환경 동기화 (편의 함수)"""
    return asyncio.run(sync_environments_async(source_env, target_envs, exclude_vars))

async def audit_env_security_async(project_path: str = '.') -> Dict[str, Any]:
    """비동기 환경변수 보안 감사 (편의 함수)"""
    analysis_result = await analyze_env_usage_async(project_path)
    
    audit_results = {
        'total_variables': len(analysis_result.environment_variables),
        'security_events': len(analysis_result.security_events),
        'critical_issues': 0,
        'high_issues': 0,
        'medium_issues': 0,
        'low_issues': 0,
        'recommendations': [],
        'events': []
    }
    
    # 보안 이벤트 분류
    for event in analysis_result.security_events:
        audit_results['events'].append({
            'type': event.event_type,
            'severity': event.severity,
            'variable': event.variable_name,
            'file': event.file_path,
            'line': event.line_number,
            'description': event.description,
            'recommendation': event.recommendation,
            'timestamp': event.timestamp.isoformat()
        })
        
        if event.severity == 'CRITICAL':
            audit_results['critical_issues'] += 1
        elif event.severity == 'HIGH':
            audit_results['high_issues'] += 1
        elif event.severity == 'MEDIUM':
            audit_results['medium_issues'] += 1
        else:
            audit_results['low_issues'] += 1
    
    # 일반적인 보안 권장사항
    secret_vars = [v for v in analysis_result.environment_variables 
                   if v.security_level == SecurityLevel.SECRET]
    
    if secret_vars:
        unencrypted_secrets = [v for v in secret_vars 
                              if v.current_status == EnvVarStatus.SET and
                              not any(u.is_encrypted for u in v.usages)]
        
        if unencrypted_secrets:
            audit_results['recommendations'].append(
                f"Consider encrypting {len(unencrypted_secrets)} secret variables"
            )
    
    missing_critical = [v for v in analysis_result.environment_variables
                       if v.priority == EnvVarPriority.CRITICAL and 
                       v.current_status == EnvVarStatus.NOT_SET]
    
    if missing_critical:
        audit_results['recommendations'].append(
            f"Set {len(missing_critical)} missing critical environment variables"
        )
    
    return audit_results

def audit_env_security_sync(project_path: str = '.') -> Dict[str, Any]:
    """동기 환경변수 보안 감사 (편의 함수)"""
    return asyncio.run(audit_env_security_async(project_path))

class EnvDocGenerator:
    """환경변수 문서 생성기"""
    
    def __init__(self, analysis_result: AnalysisResult):
        self.analysis_result = analysis_result
    
    def generate_readme_section(self) -> str:
        """README.md용 환경변수 섹션 생성"""
        lines = [
            "## Environment Variables",
            "",
            "This project uses the following environment variables:",
            ""
        ]
        
        # 중요한 변수들만 표시
        important_vars = [
            v for v in self.analysis_result.environment_variables
            if v.priority in [EnvVarPriority.CRITICAL, EnvVarPriority.IMPORTANT]
        ]
        
        if important_vars:
            lines.extend([
                "| Variable | Required | Description | Example |",
                "|----------|----------|-------------|---------|"
            ])
            
            for var in sorted(important_vars, key=lambda x: (x.priority.value, x.name)):
                required = "✅" if var.priority == EnvVarPriority.CRITICAL else "⚠️"
                description = var.description or "No description"
                example = var.example or "N/A"
                
                lines.append(f"| `{var.name}` | {required} | {description} | `{example}` |")
        
        lines.extend([
            "",
            "### Setup Instructions",
            "",
            "1. Copy `.env.example` to `.env`",
            "2. Fill in the required values",
            "3. Ensure sensitive variables are kept secure",
            ""
        ])
        
        return "\n".join(lines)
    
    def generate_docker_compose_env(self) -> str:
        """Docker Compose용 환경변수 섹션 생성"""
        lines = [
            "# Environment variables for docker-compose.yml",
            "# Add these to your docker-compose.yml under environment:",
            ""
        ]
        
        for var in sorted(self.analysis_result.environment_variables, key=lambda x: x.name):
            if var.current_status != EnvVarStatus.NOT_SET:
                if var.security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]:
                    lines.append(f"      - {var.name}=${{${var.name}}}")
                else:
                    lines.append(f"      - {var.name}={var.example or 'value'}")
        
        return "\n".join(lines)
    
    def generate_kubernetes_configmap(self) -> str:
        """Kubernetes ConfigMap YAML 생성"""
        public_vars = [
            v for v in self.analysis_result.environment_variables
            if v.security_level == SecurityLevel.PUBLIC and v.current_status != EnvVarStatus.NOT_SET
        ]
        
        lines = [
            "apiVersion: v1",
            "kind: ConfigMap",
            "metadata:",
            "  name: app-config",
            "data:"
        ]
        
        for var in sorted(public_vars, key=lambda x: x.name):
            example_value = var.example or "change-me"
            lines.append(f"  {var.name}: \"{example_value}\"")
        
        return "\n".join(lines)
    
    def generate_kubernetes_secret(self) -> str:
        """Kubernetes Secret YAML 생성"""
        secret_vars = [
            v for v in self.analysis_result.environment_variables
            if v.security_level in [SecurityLevel.SECRET, SecurityLevel.CONFIDENTIAL]
            and v.current_status != EnvVarStatus.NOT_SET
        ]
        
        lines = [
            "apiVersion: v1",
            "kind: Secret",
            "metadata:",
            "  name: app-secrets",
            "type: Opaque",
            "data:"
        ]
        
        for var in sorted(secret_vars, key=lambda x: x.name):
            # Base64 encode placeholder
            placeholder = base64.b64encode(b"change-me").decode()
            lines.append(f"  {var.name}: {placeholder}")
        
        lines.extend([
            "",
            "# Note: Replace 'change-me' values with actual base64-encoded secrets",
            "# Example: echo -n 'actual-secret-value' | base64"
        ])
        
        return "\n".join(lines)


# 고급 분석 클래스
class EnvVariableDependencyAnalyzer:
    """환경변수 의존성 분석기"""
    
    def __init__(self, analysis_result: AnalysisResult):
        self.analysis_result = analysis_result
        self.dependency_graph = {}
    
    def analyze_dependencies(self) -> Dict[str, Any]:
        """환경변수 간 의존성 분석"""
        # 환경변수 값에서 다른 환경변수 참조 찾기
        for var in self.analysis_result.environment_variables:
            dependencies = []
            
            # 사용 컨텍스트에서 다른 환경변수 참조 찾기
            for usage in var.usages:
                referenced_vars = self._find_referenced_vars(usage.context)
                dependencies.extend(referenced_vars)
            
            if dependencies:
                self.dependency_graph[var.name] = list(set(dependencies))
        
        return {
            'dependency_graph': self.dependency_graph,
            'circular_dependencies': self._find_circular_dependencies(),
            'orphaned_variables': self._find_orphaned_variables(),
            'dependency_chains': self._find_dependency_chains()
        }
    
    def _find_referenced_vars(self, context: str) -> List[str]:
        """컨텍스트에서 참조된 환경변수 찾기"""
        # ${VAR}, $VAR, process.env.VAR 등의 패턴 찾기
        patterns = [
            r'\$\{([A-Z_][A-Z0-9_]*)\}',
            r'\$([A-Z_][A-Z0-9_]*)',
            r'process\.env\.([A-Z_][A-Z0-9_]*)',
            r'os\.environ\[[\'"](.*?)[\'"]\]',
            r'os\.getenv\([\'"](.*?)[\'"]\)'
        ]
        
        referenced = []
        for pattern in patterns:
            matches = re.findall(pattern, context)
            referenced.extend(matches)
        
        return referenced
    
    def _find_circular_dependencies(self) -> List[List[str]]:
        """순환 의존성 찾기"""
        def has_path(start: str, end: str, visited: Set[str]) -> bool:
            if start == end:
                return True
            if start in visited:
                return False
            
            visited.add(start)
            
            for dependency in self.dependency_graph.get(start, []):
                if has_path(dependency, end, visited.copy()):
                    return True
            
            return False
        
        circular = []
        for var in self.dependency_graph:
            for dependency in self.dependency_graph[var]:
                if has_path(dependency, var, set()):
                    circular.append([var, dependency])
        
        return circular
    
    def _find_orphaned_variables(self) -> List[str]:
        """고아 변수 찾기 (참조되지 않는 변수)"""
        all_vars = {var.name for var in self.analysis_result.environment_variables}
        referenced_vars = set()
        
        for dependencies in self.dependency_graph.values():
            referenced_vars.update(dependencies)
        
        return list(all_vars - referenced_vars)
    
    def _find_dependency_chains(self) -> List[List[str]]:
        """의존성 체인 찾기"""
        chains = []
        
        def build_chain(var: str, current_chain: List[str]) -> None:
            if var in current_chain:  # 순환 방지
                return
            
            new_chain = current_chain + [var]
            dependencies = self.dependency_graph.get(var, [])
            
            if not dependencies:
                if len(new_chain) > 1:
                    chains.append(new_chain)
            else:
                for dep in dependencies:
                    build_chain(dep, new_chain)
        
        for var in self.dependency_graph:
            build_chain(var, [])
        
        return chains


# 메인 진입점
if __name__ == "__main__":
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description='Enhanced Environment Variable Analysis')
    parser.add_argument('path', nargs='?', default='.', help='Project path to analyze')
    parser.add_argument('--output', '-o', help='Output file for results')
    parser.add_argument('--format', choices=['json', 'markdown', 'html'], default='json', help='Output format')
    parser.add_argument('--template', action='store_true', help='Generate .env template')
    parser.add_argument('--validate', action='store_true', help='Validate current environment')
    parser.add_argument('--audit', action='store_true', help='Security audit')
    parser.add_argument('--encrypt', help='Encrypt environment file')
    parser.add_argument('--async', action='store_true', help='Use async analysis')
    
    args = parser.parse_args()
    
    async def main():
        try:
            if args.encrypt:
                result = await encrypt_env_file_async(args.encrypt)
                print(f"Encryption result: {result}")
                return
            
            if args.async:
                analysis_result = await analyze_env_usage_async(args.path)
            else:
                analysis_result = analyze_env_usage_sync(args.path)
            
            if args.template:
                template = generate_env_template_sync(args.path)
                print("Generated .env.example template")
                return
            
            if args.validate:
                validation = validate_current_env_sync(args.path)
                print(f"Validation results: {validation}")
                return
            
            if args.audit:
                audit_result = audit_env_security_sync(args.path)
                print(f"Security audit: {audit_result}")
                return
            
            # 기본 분석 결과 출력
            analyzer = EnhancedEnvironmentAnalyzer()
            
            if args.format == 'json':
                output = analyzer._generate_json_docs()
            elif args.format == 'markdown':
                output = analyzer._generate_markdown_docs()
            else:
                output = analyzer._generate_html_docs()
            
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(output)
                print(f"Results written to {args.output}")
            else:
                print(output)
        
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    
    asyncio.run(main())