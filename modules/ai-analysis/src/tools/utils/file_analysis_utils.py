#!/usr/bin/env python3
"""
Enhanced File Analysis Utilities
다언어 파일 분석 및 메타데이터 추출 도구들 (고도화 버전)
"""

import os
import re
import ast
import json
import hashlib
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Callable, Set, Tuple
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import logging
from contextlib import asynccontextmanager
from enum import Enum
import weakref

# Pydantic for data validation
try:
    from pydantic import BaseModel, Field, validator
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False

# Performance monitoring
import time
import psutil
import threading
from collections import defaultdict

# Configuration
class AnalysisConfig(BaseModel if PYDANTIC_AVAILABLE else object):
    """분석 설정"""
    max_file_size: int = Field(default=100_000_000, description="최대 파일 크기 (100MB)")
    cache_ttl: int = Field(default=3600, description="캐시 TTL (초)")
    max_workers: int = Field(default=4, description="최대 워커 수")
    chunk_size: int = Field(default=1024 * 1024, description="청크 크기 (1MB)")
    enable_caching: bool = Field(default=True, description="캐싱 활성화")
    enable_security_scan: bool = Field(default=True, description="보안 스캔 활성화")
    log_level: str = Field(default="INFO", description="로그 레벨")
    
    if not PYDANTIC_AVAILABLE:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

# Custom exceptions
class FileAnalysisError(Exception):
    """파일 분석 관련 예외"""
    pass

class FileTooLargeError(FileAnalysisError):
    """파일 크기 초과 예외"""
    pass

class UnsupportedFileTypeError(FileAnalysisError):
    """지원하지 않는 파일 형식 예외"""
    pass

# Enhanced data models
@dataclass
class SecurityIssue:
    """보안 이슈"""
    type: str
    severity: str  # low, medium, high, critical
    line: int
    description: str
    recommendation: str
    pattern: str

@dataclass
class CodeMetrics:
    """코드 메트릭"""
    cyclomatic_complexity: int
    halstead_difficulty: float
    maintainability_index: float
    technical_debt_ratio: float
    code_duplication: float
    test_coverage_estimate: float

@dataclass
class DependencyInfo:
    """의존성 정보"""
    name: str
    version: Optional[str]
    type: str  # import, require, include
    source: str  # local, external, builtin
    security_advisories: List[str] = field(default_factory=list)

@dataclass
class FileInfo:
    """파일 정보 (강화 버전)"""
    name: str
    path: str
    extension: str
    size: int
    size_formatted: str
    modified: str
    created: str
    lines: int
    encoding: str
    checksum: str
    mime_type: str
    is_binary: bool
    
@dataclass
class ContentAnalysis:
    """콘텐츠 분석 결과 (강화 버전)"""
    language: str
    confidence: float
    imports: List[Dict[str, Any]]
    functions: List[Dict[str, Any]]
    classes: List[Dict[str, Any]]
    variables: List[Dict[str, Any]]
    constants: List[Dict[str, Any]]
    comments: Dict[str, int]
    dependencies: List[DependencyInfo]
    security_issues: List[SecurityIssue]
    metrics: CodeMetrics
    api_endpoints: List[Dict[str, Any]]
    database_queries: List[Dict[str, Any]]
    todos: List[Dict[str, Any]]

# Performance monitoring
class PerformanceMonitor:
    """성능 모니터링"""
    
    def __init__(self):
        self.metrics = defaultdict(list)
        self.lock = threading.Lock()
    
    def record(self, operation: str, duration: float, memory_usage: int = 0):
        """메트릭 기록"""
        with self.lock:
            self.metrics[operation].append({
                'duration': duration,
                'memory_usage': memory_usage,
                'timestamp': time.time()
            })
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 반환"""
        with self.lock:
            stats = {}
            for operation, measurements in self.metrics.items():
                if measurements:
                    durations = [m['duration'] for m in measurements]
                    stats[operation] = {
                        'count': len(measurements),
                        'avg_duration': sum(durations) / len(durations),
                        'min_duration': min(durations),
                        'max_duration': max(durations),
                        'total_duration': sum(durations)
                    }
            return stats

# Enhanced caching system
class AnalysisCache:
    """분석 결과 캐시 시스템"""
    
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.cache = {}
        self.timestamps = {}
        self.max_size = max_size
        self.ttl = ttl
        self.lock = threading.RLock()
        self.hits = 0
        self.misses = 0
    
    def _get_cache_key(self, file_path: Path) -> str:
        """캐시 키 생성"""
        stat = file_path.stat()
        return hashlib.md5(
            f"{file_path}:{stat.st_mtime}:{stat.st_size}".encode()
        ).hexdigest()
    
    def get(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """캐시에서 결과 가져오기"""
        with self.lock:
            key = self._get_cache_key(file_path)
            
            if key in self.cache:
                # TTL 확인
                if time.time() - self.timestamps[key] < self.ttl:
                    self.hits += 1
                    return self.cache[key]
                else:
                    # 만료된 항목 제거
                    del self.cache[key]
                    del self.timestamps[key]
            
            self.misses += 1
            return None
    
    def set(self, file_path: Path, result: Dict[str, Any]):
        """캐시에 결과 저장"""
        with self.lock:
            key = self._get_cache_key(file_path)
            
            # 캐시 크기 관리
            if len(self.cache) >= self.max_size:
                # 가장 오래된 항목 제거 (LRU)
                oldest_key = min(self.timestamps.keys(), key=self.timestamps.get)
                del self.cache[oldest_key]
                del self.timestamps[oldest_key]
            
            self.cache[key] = result
            self.timestamps[key] = time.time()
    
    def clear(self):
        """캐시 초기화"""
        with self.lock:
            self.cache.clear()
            self.timestamps.clear()
            self.hits = 0
            self.misses = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계"""
        with self.lock:
            total_requests = self.hits + self.misses
            hit_rate = (self.hits / total_requests * 100) if total_requests > 0 else 0
            
            return {
                'size': len(self.cache),
                'max_size': self.max_size,
                'hits': self.hits,
                'misses': self.misses,
                'hit_rate': round(hit_rate, 2),
                'memory_usage': sum(len(str(v)) for v in self.cache.values())
            }

# Security analyzer
class SecurityAnalyzer:
    """보안 분석기"""
    
    def __init__(self):
        self.patterns = {
            'hardcoded_secret': [
                (r'password\s*=\s*["\'][^"\']{8,}["\']', 'high', 'Hardcoded password detected'),
                (r'api[_-]?key\s*=\s*["\'][^"\']{20,}["\']', 'high', 'Hardcoded API key detected'),
                (r'secret[_-]?key\s*=\s*["\'][^"\']{16,}["\']', 'high', 'Hardcoded secret key detected'),
                (r'token\s*=\s*["\'][^"\']{20,}["\']', 'medium', 'Hardcoded token detected'),
            ],
            'sql_injection': [
                (r'execute\s*\(\s*["\'].*?%s.*?["\']', 'high', 'Potential SQL injection vulnerability'),
                (r'query\s*\(\s*["\'].*?\+.*?["\']', 'medium', 'Potential SQL injection via string concatenation'),
            ],
            'command_injection': [
                (r'os\.system\s*\([^)]*\+', 'high', 'Potential command injection via os.system'),
                (r'subprocess\.\w+\([^)]*\+', 'medium', 'Potential command injection via subprocess'),
            ],
            'weak_crypto': [
                (r'md5\s*\(', 'medium', 'Weak cryptographic algorithm (MD5)'),
                (r'sha1\s*\(', 'medium', 'Weak cryptographic algorithm (SHA1)'),
            ]
        }
    
    def analyze(self, content: str, file_path: str) -> List[SecurityIssue]:
        """보안 분석 수행"""
        issues = []
        lines = content.splitlines()
        
        for i, line in enumerate(lines, 1):
            for category, patterns in self.patterns.items():
                for pattern, severity, description in patterns:
                    if re.search(pattern, line, re.IGNORECASE):
                        issues.append(SecurityIssue(
                            type=category,
                            severity=severity,
                            line=i,
                            description=description,
                            recommendation=self._get_recommendation(category),
                            pattern=pattern
                        ))
        
        return issues
    
    def _get_recommendation(self, issue_type: str) -> str:
        """보안 이슈별 권장사항"""
        recommendations = {
            'hardcoded_secret': 'Use environment variables or secure configuration management',
            'sql_injection': 'Use parameterized queries or ORM',
            'command_injection': 'Validate and sanitize input, use subprocess with shell=False',
            'weak_crypto': 'Use strong cryptographic algorithms like SHA-256 or bcrypt'
        }
        return recommendations.get(issue_type, 'Review and fix security issue')

# Enhanced FileAnalyzer
class EnhancedFileAnalyzer:
    """강화된 다언어 파일 분석기"""
    
    def __init__(self, config: Optional[AnalysisConfig] = None):
        self.config = config or AnalysisConfig()
        self.cache = AnalysisCache(ttl=self.config.cache_ttl) if self.config.enable_caching else None
        self.security_analyzer = SecurityAnalyzer() if self.config.enable_security_scan else None
        self.performance_monitor = PerformanceMonitor()
        self.logger = self._setup_logger()
        
        # Language analyzers
        self.supported_extensions = {
            '.py': self._analyze_python,
            '.js': self._analyze_javascript,
            '.ts': self._analyze_typescript,
            '.jsx': self._analyze_javascript,
            '.tsx': self._analyze_typescript,
            '.java': self._analyze_java,
            '.cpp': self._analyze_cpp,
            '.c': self._analyze_c,
            '.h': self._analyze_c,
            '.hpp': self._analyze_cpp,
            '.cs': self._analyze_csharp,
            '.go': self._analyze_go,
            '.rs': self._analyze_rust,
            '.php': self._analyze_php,
            '.rb': self._analyze_ruby,
            '.swift': self._analyze_swift,
            '.kt': self._analyze_kotlin,
            '.scala': self._analyze_scala,
            '.json': self._analyze_json,
            '.yaml': self._analyze_yaml,
            '.yml': self._analyze_yaml,
            '.xml': self._analyze_xml,
            '.md': self._analyze_markdown,
            '.vue': self._analyze_vue,
            '.svelte': self._analyze_svelte,
        }
        
        self.language_map = {
            '.py': 'Python',
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.jsx': 'React JSX',
            '.tsx': 'React TSX',
            '.java': 'Java',
            '.cpp': 'C++',
            '.cc': 'C++',
            '.cxx': 'C++',
            '.c': 'C',
            '.h': 'C Header',
            '.hpp': 'C++ Header',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.php': 'PHP',
            '.rb': 'Ruby',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.scala': 'Scala',
            '.json': 'JSON',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.xml': 'XML',
            '.md': 'Markdown',
            '.vue': 'Vue.js',
            '.svelte': 'Svelte',
        }
    
    def _setup_logger(self) -> logging.Logger:
        """로거 설정"""
        logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        logger.setLevel(getattr(logging, self.config.log_level))
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    async def analyze_file_async(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """비동기 파일 분석"""
        file_path = Path(file_path)
        start_time = time.time()
        initial_memory = psutil.Process().memory_info().rss
        
        try:
            # 캐시 확인
            if self.cache:
                cached_result = self.cache.get(file_path)
                if cached_result:
                    self.logger.debug(f"Cache hit for {file_path}")
                    return cached_result
            
            # 파일 크기 확인
            if file_path.stat().st_size > self.config.max_file_size:
                raise FileTooLargeError(f"File too large: {file_path}")
            
            # 파일 분석
            result = await asyncio.get_event_loop().run_in_executor(
                None, self._analyze_file_sync, file_path
            )
            
            # 캐시 저장
            if self.cache:
                self.cache.set(file_path, result)
            
            # 성능 메트릭 기록
            duration = time.time() - start_time
            final_memory = psutil.Process().memory_info().rss
            memory_delta = final_memory - initial_memory
            
            self.performance_monitor.record(
                'analyze_file', duration, memory_delta
            )
            
            return result
            
        except Exception as e:
            self.logger.error(f"Error analyzing {file_path}: {str(e)}")
            raise FileAnalysisError(f"Failed to analyze {file_path}: {str(e)}") from e
    
    def analyze_file(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """동기 파일 분석 (레거시 호환성)"""
        return asyncio.run(self.analyze_file_async(file_path))
    
    def _analyze_file_sync(self, file_path: Path) -> Dict[str, Any]:
        """동기식 파일 분석 내부 메서드"""
        try:
            # 파일 기본 정보
            file_info = self._get_enhanced_file_info(file_path)
            
            # 파일 내용 읽기
            content = self._read_file_content_smart(file_path)
            if content is None:
                return {
                    "file_info": file_info.__dict__,
                    "error": "Could not read file content",
                    "analysis_time": datetime.now().isoformat()
                }
            
            # 언어별 분석
            content_analysis = self._analyze_content_enhanced(file_path, content)
            
            return {
                "file_info": file_info.__dict__,
                "content_analysis": content_analysis.__dict__,
                "analysis_time": datetime.now().isoformat(),
                "analyzer_version": "2.0.0"
            }
            
        except Exception as e:
            self.logger.error(f"Sync analysis failed for {file_path}: {str(e)}")
            return {
                "file_info": {"name": file_path.name, "path": str(file_path)},
                "error": f"Analysis failed: {str(e)}",
                "analysis_time": datetime.now().isoformat()
            }
    
    def _get_enhanced_file_info(self, file_path: Path) -> FileInfo:
        """강화된 파일 기본 정보 추출"""
        stat = file_path.stat()
        
        # 파일 체크섬
        checksum = self._calculate_checksum(file_path)
        
        # MIME 타입 감지
        mime_type = self._detect_mime_type(file_path)
        
        # 바이너리 파일 감지
        is_binary = self._is_binary_file(file_path)
        
        return FileInfo(
            name=file_path.name,
            path=str(file_path),
            extension=file_path.suffix.lower(),
            size=stat.st_size,
            size_formatted=self._format_size(stat.st_size),
            modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            created=datetime.fromtimestamp(stat.st_ctime).isoformat(),
            lines=0,  # 나중에 업데이트
            encoding="unknown",
            checksum=checksum,
            mime_type=mime_type,
            is_binary=is_binary
        )
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """파일 체크섬 계산"""
        try:
            hash_md5 = hashlib.md5()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(self.config.chunk_size), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception:
            return ""
    
    def _detect_mime_type(self, file_path: Path) -> str:
        """MIME 타입 감지"""
        try:
            import mimetypes
            mime_type, _ = mimetypes.guess_type(str(file_path))
            return mime_type or "application/octet-stream"
        except Exception:
            return "unknown"
    
    def _is_binary_file(self, file_path: Path) -> bool:
        """바이너리 파일 감지"""
        try:
            with open(file_path, 'rb') as f:
                chunk = f.read(1024)
                return b'\0' in chunk
        except Exception:
            return False
    
    def _read_file_content_smart(self, file_path: Path) -> Optional[str]:
        """스마트 파일 내용 읽기"""
        if self._is_binary_file(file_path):
            return None
        
        encodings = ['utf-8', 'utf-8-sig', 'cp1252', 'latin1', 'ascii']
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                    # 인코딩 정보 저장 (파일 정보에 업데이트)
                    return content
            except UnicodeDecodeError:
                continue
            except Exception as e:
                self.logger.warning(f"Error reading {file_path} with {encoding}: {e}")
                continue
        
        return None
    
    def _analyze_content_enhanced(self, file_path: Path, content: str) -> ContentAnalysis:
        """강화된 내용 분석"""
        extension = file_path.suffix.lower()
        language = self.language_map.get(extension, f"Unknown ({extension})")
        
        # 기본 구조
        analysis = ContentAnalysis(
            language=language,
            confidence=self._calculate_language_confidence(content, extension),
            imports=[],
            functions=[],
            classes=[],
            variables=[],
            constants=[],
            comments={"single_line": 0, "multi_line": 0, "docstrings": 0},
            dependencies=[],
            security_issues=[],
            metrics=CodeMetrics(0, 0.0, 0.0, 0.0, 0.0, 0.0),
            api_endpoints=[],
            database_queries=[],
            todos=[]
        )
        
        # 언어별 분석 수행
        if extension in self.supported_extensions:
            try:
                self.supported_extensions[extension](content, analysis)
            except Exception as e:
                self.logger.warning(f"Language-specific analysis failed for {extension}: {e}")
                self._analyze_generic_enhanced(content, analysis)
        else:
            self._analyze_generic_enhanced(content, analysis)
        
        # 보안 분석
        if self.security_analyzer:
            analysis.security_issues = self.security_analyzer.analyze(content, str(file_path))
        
        # TODO 추출
        analysis.todos = self._extract_todos(content)
        
        # API 엔드포인트 추출
        analysis.api_endpoints = self._extract_api_endpoints(content, language)
        
        # 데이터베이스 쿼리 추출
        analysis.database_queries = self._extract_database_queries(content, language)
        
        return analysis
    
    def _calculate_language_confidence(self, content: str, extension: str) -> float:
        """언어 감지 신뢰도 계산"""
        if extension in self.supported_extensions:
            return 1.0
        
        # 내용 기반 언어 감지 로직
        language_indicators = {
            'python': [r'def\s+\w+\s*\(', r'import\s+\w+', r'from\s+\w+\s+import'],
            'javascript': [r'function\s+\w+\s*\(', r'const\s+\w+\s*=', r'=>\s*{'],
            'java': [r'public\s+class\s+\w+', r'public\s+static\s+void\s+main'],
        }
        
        max_confidence = 0.0
        for lang, patterns in language_indicators.items():
            matches = sum(1 for pattern in patterns if re.search(pattern, content))
            confidence = min(matches / len(patterns), 1.0)
            max_confidence = max(max_confidence, confidence)
        
        return max_confidence
    
    def _extract_todos(self, content: str) -> List[Dict[str, Any]]:
        """TODO 주석 추출"""
        todos = []
        lines = content.splitlines()
        
        todo_patterns = [
            r'#\s*(TODO|FIXME|HACK|NOTE|BUG)\s*:?\s*(.*)',
            r'//\s*(TODO|FIXME|HACK|NOTE|BUG)\s*:?\s*(.*)',
            r'/\*\s*(TODO|FIXME|HACK|NOTE|BUG)\s*:?\s*(.*?)\s*\*/',
        ]
        
        for i, line in enumerate(lines, 1):
            for pattern in todo_patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    todos.append({
                        'type': match.group(1).upper(),
                        'message': match.group(2).strip(),
                        'line': i,
                        'full_text': line.strip()
                    })
        
        return todos
    
    def _extract_api_endpoints(self, content: str, language: str) -> List[Dict[str, Any]]:
        """API 엔드포인트 추출"""
        endpoints = []
        
        if language.lower() in ['python', 'javascript', 'typescript']:
            # REST API 패턴
            api_patterns = [
                r'@app\.route\(["\']([^"\']+)["\'].*?methods\s*=\s*\[([^\]]+)\]',
                r'@router\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']',
                r'app\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']',
                r'router\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']',
            ]
            
            lines = content.splitlines()
            for i, line in enumerate(lines, 1):
                for pattern in api_patterns:
                    match = re.search(pattern, line)
                    if match:
                        if len(match.groups()) == 2 and match.group(2).startswith('['):
                            # Flask style
                            endpoints.append({
                                'path': match.group(1),
                                'methods': [m.strip().strip('"\'') for m in match.group(2).split(',')],
                                'line': i,
                                'framework': 'flask'
                            })
                        else:
                            # Express/FastAPI style
                            endpoints.append({
                                'path': match.group(2) if len(match.groups()) > 1 else match.group(1),
                                'methods': [match.group(1).upper()],
                                'line': i,
                                'framework': 'express/fastapi'
                            })
        
        return endpoints
    
    def _extract_database_queries(self, content: str, language: str) -> List[Dict[str, Any]]:
        """데이터베이스 쿼리 추출"""
        queries = []
        
        # SQL 쿼리 패턴
        sql_patterns = [
            r'(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+.*?(?:;|$)',
            r'["\'](?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+.*?["\']',
        ]
        
        lines = content.splitlines()
        for i, line in enumerate(lines, 1):
            for pattern in sql_patterns:
                matches = re.finditer(pattern, line, re.IGNORECASE | re.DOTALL)
                for match in matches:
                    query_type = match.group(1).upper() if match.groups() else 'UNKNOWN'
                    queries.append({
                        'type': query_type,
                        'query': match.group(0)[:100] + '...' if len(match.group(0)) > 100 else match.group(0),
                        'line': i,
                        'full_match': match.group(0)
                    })
        
        return queries
    
    # Language-specific analyzers (enhanced versions)
    def _analyze_python(self, content: str, analysis: ContentAnalysis):
        """Python 파일 분석 (강화 버전)"""
        try:
            tree = ast.parse(content)
            
            # AST 기반 분석
            visitor = PythonASTVisitor()
            visitor.visit(tree)
            
            analysis.imports = visitor.imports
            analysis.functions = visitor.functions
            analysis.classes = visitor.classes
            analysis.variables = visitor.variables
            analysis.constants = visitor.constants
            
            # 코드 메트릭 계산
            analysis.metrics = self._calculate_python_metrics(tree, content)
            
            # 의존성 분석
            analysis.dependencies = self._analyze_python_dependencies(visitor.imports)
            
        except SyntaxError as e:
            self.logger.warning(f"Python syntax error, falling back to regex: {e}")
            self._analyze_with_regex(content, analysis, 'python')
        except Exception as e:
            self.logger.error(f"Python analysis error: {e}")
            self._analyze_generic_enhanced(content, analysis)
    
    def _calculate_python_metrics(self, tree: ast.AST, content: str) -> CodeMetrics:
        """Python 코드 메트릭 계산"""
        # 사이클로매틱 복잡도
        complexity = 1
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(node, ast.ExceptHandler):
                complexity += 1
            elif isinstance(node, (ast.And, ast.Or)):
                complexity += 1
        
        # 할스테드 메트릭 (간소화)
        operators = len(re.findall(r'[+\-*/=<>!&|^%]', content))
        operands = len(re.findall(r'\b\w+\b', content))
        vocabulary = operators + operands
        length = vocabulary
        difficulty = (operators / 2) * (operands / vocabulary) if vocabulary > 0 else 0
        
        # 유지보수성 인덱스 추정
        lines_of_code = len([line for line in content.splitlines() if line.strip() and not line.strip().startswith('#')])
        maintainability = max(0, 171 - 5.2 * complexity - 0.23 * difficulty - 16.2 * (lines_of_code ** 0.5))
        
        # 기술 부채 비율 추정 (복잡도 기반)
        tech_debt = min(complexity / 10.0, 1.0)
        
        # 코드 중복도 추정 (간단한 휴리스틱)
        lines = content.splitlines()
        unique_lines = len(set(line.strip() for line in lines if line.strip()))
        total_lines = len([line for line in lines if line.strip()])
        duplication = 1.0 - (unique_lines / total_lines) if total_lines > 0 else 0.0
        
        # 테스트 커버리지 추정 (테스트 파일 여부와 assert 문 개수 기반)
        test_indicators = len(re.findall(r'\bassert\b|test_|unittest|pytest', content, re.IGNORECASE))
        coverage_estimate = min(test_indicators / 10.0, 1.0)
        
        return CodeMetrics(
            cyclomatic_complexity=complexity,
            halstead_difficulty=difficulty,
            maintainability_index=maintainability,
            technical_debt_ratio=tech_debt,
            code_duplication=duplication,
            test_coverage_estimate=coverage_estimate
        )
    
    def _analyze_python_dependencies(self, imports: List[Dict[str, Any]]) -> List[DependencyInfo]:
        """Python 의존성 분석"""
        dependencies = []
        builtin_modules = {
            'os', 'sys', 'json', 're', 'datetime', 'time', 'math', 'random',
            'collections', 'itertools', 'functools', 'pathlib', 'typing'
        }
        
        for imp in imports:
            module_name = imp.get('module', '')
            if not module_name:
                continue
            
            # 최상위 모듈명 추출
            top_level = module_name.split('.')[0]
            
            dep_type = 'builtin' if top_level in builtin_modules else 'external'
            if module_name.startswith('.'):
                dep_type = 'local'
            
            dependencies.append(DependencyInfo(
                name=module_name,
                version=None,  # 실제 설치된 버전 확인 가능하면 추가
                type=imp.get('type', 'import'),
                source=dep_type,
                security_advisories=[]  # 보안 권고사항은 별도 서비스 연동 필요
            ))
        
        return dependencies
    
    # New language analyzers
    def _analyze_vue(self, content: str, analysis: ContentAnalysis):
        """Vue.js 파일 분석"""
        # Template, script, style 섹션 분리
        template_match = re.search(r'<template[^>]*>(.*?)</template>', content, re.DOTALL)
        script_match = re.search(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
        style_match = re.search(r'<style[^>]*>(.*?)</style>', content, re.DOTALL)
        
        if script_match:
            script_content = script_match.group(1)
            # JavaScript 분석 적용
            self._analyze_javascript(script_content, analysis)
        
        # Vue 특화 패턴
        if template_match:
            template_content = template_match.group(1)
            # v-if, v-for 등 디렉티브 추출
            directives = re.findall(r'v-(\w+)', template_content)
            analysis.variables.extend([
                {'name': f'v-{directive}', 'type': 'vue_directive', 'line': 0}
                for directive in set(directives)
            ])
    
    def _analyze_svelte(self, content: str, analysis: ContentAnalysis):
        """Svelte 파일 분석"""
        # Script 태그 추출
        script_matches = re.finditer(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
        
        for match in script_matches:
            script_content = match.group(1)
            self._analyze_javascript(script_content, analysis)
        
        # Svelte 특화 패턴
        # Reactive statements
        reactive_statements = re.findall(r'\$:\s*(.+)', content)
        for stmt in reactive_statements:
            analysis.variables.append({
                'name': stmt.strip(),
                'type': 'svelte_reactive',
                'line': 0
            })
    
    def _analyze_ruby(self, content: str, analysis: ContentAnalysis):
        """Ruby 파일 분석"""
        lines = content.splitlines()
        
        patterns = {
            'class': r'class\s+(\w+)',
            'module': r'module\s+(\w+)',
            'def': r'def\s+(\w+)',
            'require': r'require\s+[\'"]([^\'"]+)[\'"]',
            'gem': r'gem\s+[\'"]([^\'"]+)[\'"]',
        }
        
        for i, line in enumerate(lines, 1):
            for pattern_type, pattern in patterns.items():
                match = re.search(pattern, line)
                if match:
                    if pattern_type == 'class':
                        analysis.classes.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'class'
                        })
                    elif pattern_type == 'def':
                        analysis.functions.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'method'
                        })
                    elif pattern_type in ['require', 'gem']:
                        analysis.imports.append({
                            'type': pattern_type,
                            'module': match.group(1),
                            'line': i
                        })
    
    def _analyze_swift(self, content: str, analysis: ContentAnalysis):
        """Swift 파일 분석"""
        lines = content.splitlines()
        
        patterns = {
            'class': r'class\s+(\w+)',
            'struct': r'struct\s+(\w+)',
            'enum': r'enum\s+(\w+)',
            'func': r'func\s+(\w+)',
            'import': r'import\s+(\w+)',
        }
        
        for i, line in enumerate(lines, 1):
            for pattern_type, pattern in patterns.items():
                match = re.search(pattern, line)
                if match:
                    if pattern_type in ['class', 'struct', 'enum']:
                        analysis.classes.append({
                            'name': match.group(1),
                            'line': i,
                            'type': pattern_type
                        })
                    elif pattern_type == 'func':
                        analysis.functions.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'function'
                        })
                    elif pattern_type == 'import':
                        analysis.imports.append({
                            'type': 'import',
                            'module': match.group(1),
                            'line': i
                        })
    
    def _analyze_kotlin(self, content: str, analysis: ContentAnalysis):
        """Kotlin 파일 분석"""
        lines = content.splitlines()
        
        patterns = {
            'class': r'(?:class|data class|sealed class)\s+(\w+)',
            'interface': r'interface\s+(\w+)',
            'object': r'object\s+(\w+)',
            'fun': r'fun\s+(\w+)',
            'import': r'import\s+([\w.]+)',
        }
        
        for i, line in enumerate(lines, 1):
            for pattern_type, pattern in patterns.items():
                match = re.search(pattern, line)
                if match:
                    if pattern_type in ['class', 'interface', 'object']:
                        analysis.classes.append({
                            'name': match.group(1),
                            'line': i,
                            'type': pattern_type
                        })
                    elif pattern_type == 'fun':
                        analysis.functions.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'function'
                        })
                    elif pattern_type == 'import':
                        analysis.imports.append({
                            'type': 'import',
                            'module': match.group(1),
                            'line': i
                        })
    
    def _analyze_scala(self, content: str, analysis: ContentAnalysis):
        """Scala 파일 분석"""
        lines = content.splitlines()
        
        patterns = {
            'class': r'class\s+(\w+)',
            'object': r'object\s+(\w+)',
            'trait': r'trait\s+(\w+)',
            'def': r'def\s+(\w+)',
            'val': r'val\s+(\w+)',
            'var': r'var\s+(\w+)',
            'import': r'import\s+([\w.]+)',
        }
        
        for i, line in enumerate(lines, 1):
            for pattern_type, pattern in patterns.items():
                match = re.search(pattern, line)
                if match:
                    if pattern_type in ['class', 'object', 'trait']:
                        analysis.classes.append({
                            'name': match.group(1),
                            'line': i,
                            'type': pattern_type
                        })
                    elif pattern_type == 'def':
                        analysis.functions.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'method'
                        })
                    elif pattern_type in ['val', 'var']:
                        analysis.variables.append({
                            'name': match.group(1),
                            'line': i,
                            'type': pattern_type
                        })
                    elif pattern_type == 'import':
                        analysis.imports.append({
                            'type': 'import',
                            'module': match.group(1),
                            'line': i
                        })
    
    def _analyze_generic_enhanced(self, content: str, analysis: ContentAnalysis):
        """향상된 일반 텍스트 파일 분석"""
        lines = content.splitlines()
        analysis.comments["single_line"] = len(lines)
        
        # 함수/메서드 패턴 (다양한 언어)
        function_patterns = [
            (r'(\w+)\s*\([^)]*\)\s*[{:]', 'function_call_or_def'),
            (r'def\s+(\w+)', 'python_function'),
            (r'function\s+(\w+)', 'js_function'),
            (r'(\w+):\s*function', 'js_method'),
            (r'public\s+\w+\s+(\w+)\s*\(', 'java_method'),
        ]
        
        # URL/엔드포인트 패턴
        url_patterns = [
            r'https?://[^\s<>"{}|\\^`\[\]]+',
            r'[\'"][/\w-]+[\'"]',  # 경로 패턴
        ]
        
        for i, line in enumerate(lines, 1):
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            # 함수 패턴 매칭
            for pattern, func_type in function_patterns:
                matches = re.finditer(pattern, line)
                for match in matches:
                    if match.groups():
                        analysis.functions.append({
                            "name": match.group(1),
                            "line": i,
                            "type": func_type,
                            "confidence": 0.7
                        })
            
            # URL 패턴 매칭
            for pattern in url_patterns:
                matches = re.finditer(pattern, line)
                for match in matches:
                    analysis.api_endpoints.append({
                        "url": match.group(0),
                        "line": i,
                        "type": "potential_endpoint"
                    })
        
        # 기본 메트릭 계산
        total_lines = len([line for line in lines if line.strip()])
        comment_lines = len([line for line in lines if line.strip().startswith(('#', '//', '/*'))])
        
        analysis.metrics = CodeMetrics(
            cyclomatic_complexity=len(analysis.functions),
            halstead_difficulty=0.0,
            maintainability_index=100.0 - (comment_lines / total_lines * 100) if total_lines > 0 else 100.0,
            technical_debt_ratio=0.0,
            code_duplication=0.0,
            test_coverage_estimate=0.0
        )
    
    # Enhanced JavaScript/TypeScript analyzers
    def _analyze_javascript(self, content: str, analysis: ContentAnalysis):
        """JavaScript 파일 분석 (강화 버전)"""
        lines = content.splitlines()
        
        # 패턴 정의
        patterns = {
            'import': [
                r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]',
                r'import\s+[\'"]([^\'"]+)[\'"]',
                r'const\s+.*?\s*=\s*require\([\'"]([^\'"]+)[\'"]\)',
                r'require\([\'"]([^\'"]+)[\'"]\)'
            ],
            'function': [
                r'function\s+(\w+)\s*\(',
                r'const\s+(\w+)\s*=\s*function',
                r'(\w+)\s*:\s*function',
                r'(\w+)\s*=\s*\([^)]*\)\s*=>',
                r'async\s+function\s+(\w+)',
                r'export\s+(?:async\s+)?function\s+(\w+)'
            ],
            'class': [
                r'class\s+(\w+)',
                r'export\s+class\s+(\w+)'
            ],
            'variable': [
                r'(?:const|let|var)\s+(\w+)',
                r'export\s+(?:const|let|var)\s+(\w+)'
            ]
        }
        
        for i, line in enumerate(lines, 1):
            # Import 분석
            for pattern in patterns['import']:
                matches = re.finditer(pattern, line)
                for match in matches:
                    analysis.imports.append({
                        'type': 'import',
                        'module': match.group(1),
                        'line': i
                    })
            
            # 함수 분석
            for pattern in patterns['function']:
                matches = re.finditer(pattern, line)
                for match in matches:
                    if match.groups():
                        is_async = 'async' in line
                        is_arrow = '=>' in line
                        analysis.functions.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'function',
                            'is_async': is_async,
                            'is_arrow': is_arrow,
                            'is_exported': 'export' in line
                        })
            
            # 클래스 분석
            for pattern in patterns['class']:
                matches = re.finditer(pattern, line)
                for match in matches:
                    analysis.classes.append({
                        'name': match.group(1),
                        'line': i,
                        'type': 'class',
                        'is_exported': 'export' in line
                    })
            
            # 변수 분석
            for pattern in patterns['variable']:
                matches = re.finditer(pattern, line)
                for match in matches:
                    var_name = match.group(1)
                    if var_name.isupper():
                        analysis.constants.append({
                            'name': var_name,
                            'line': i,
                            'type': 'constant'
                        })
                    else:
                        analysis.variables.append({
                            'name': var_name,
                            'line': i,
                            'type': 'variable'
                        })
        
        # 주석 분석
        self._analyze_comments_js_style(content, analysis)
        
        # React/Vue 컴포넌트 감지
        if re.search(r'React\.|jsx|tsx', content) or 'useState' in content or 'useEffect' in content:
            analysis.language += ' (React)'
        
        # Node.js 환경 감지
        if 'require(' in content or 'module.exports' in content or 'exports.' in content:
            analysis.language += ' (Node.js)'
    
    def _analyze_typescript(self, content: str, analysis: ContentAnalysis):
        """TypeScript 파일 분석"""
        # JavaScript 분석 기본 적용
        self._analyze_javascript(content, analysis)
        
        lines = content.splitlines()
        
        # TypeScript 특화 패턴
        ts_patterns = {
            'interface': r'interface\s+(\w+)',
            'type': r'type\s+(\w+)\s*=',
            'enum': r'enum\s+(\w+)',
            'namespace': r'namespace\s+(\w+)',
            'generic': r'<([A-Z]\w*(?:,\s*[A-Z]\w*)*)>',
        }
        
        for i, line in enumerate(lines, 1):
            for pattern_type, pattern in ts_patterns.items():
                matches = re.finditer(pattern, line)
                for match in matches:
                    if pattern_type in ['interface', 'enum', 'namespace']:
                        analysis.classes.append({
                            'name': match.group(1),
                            'line': i,
                            'type': pattern_type,
                            'is_typescript': True
                        })
                    elif pattern_type == 'type':
                        analysis.constants.append({
                            'name': match.group(1),
                            'line': i,
                            'type': 'type_alias',
                            'is_typescript': True
                        })
    
    def _analyze_comments_js_style(self, content: str, analysis: ContentAnalysis):
        """JavaScript 스타일 주석 분석"""
        # 단일 라인 주석 (//)
        single_line = len(re.findall(r'//.*', content))
        # 다중 라인 주석 (/* */)
        multi_line = len(re.findall(r'/\*.*?\*/', content, re.DOTALL))
        # JSDoc 주석
        jsdoc = len(re.findall(r'/\*\*.*?\*/', content, re.DOTALL))
        
        analysis.comments.update({
            "single_line": single_line,
            "multi_line": multi_line,
            "docstrings": jsdoc
        })
    
    def _format_size(self, size_bytes: int) -> str:
        """바이트를 읽기 쉬운 형태로 변환"""
        if size_bytes == 0:
            return "0 B"
        
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"
    
    async def analyze_directory_async(self, directory: Union[str, Path], 
                                    file_patterns: List[str] = None,
                                    recursive: bool = True,
                                    max_concurrent: int = None) -> Dict[str, Any]:
        """비동기 디렉토리 분석"""
        directory = Path(directory)
        max_concurrent = max_concurrent or self.config.max_workers
        
        if file_patterns is None:
            file_patterns = list(self.supported_extensions.keys())
        
        # 파일 목록 수집
        files_to_analyze = []
        for pattern in file_patterns:
            if recursive:
                files_to_analyze.extend(directory.rglob(f'*{pattern}'))
            else:
                files_to_analyze.extend(directory.glob(f'*{pattern}'))
        
        # 스킵할 파일 필터링
        files_to_analyze = [f for f in files_to_analyze if not self._should_skip_file(f)]
        
        # 세마포어로 동시성 제어
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def analyze_with_semaphore(file_path):
            async with semaphore:
                return await self.analyze_file_async(file_path)
        
        # 병렬 분석 실행
        start_time = time.time()
        tasks = [analyze_with_semaphore(file_path) for file_path in files_to_analyze]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 결과 정리
        successful_results = []
        errors = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                errors.append({
                    'file': str(files_to_analyze[i]),
                    'error': str(result)
                })
            else:
                successful_results.append(result)
        
        analysis_time = time.time() - start_time
        
        return {
            "directory": str(directory),
            "total_files": len(files_to_analyze),
            "successful_analyses": len(successful_results),
            "errors": len(errors),
            "analysis_time": analysis_time,
            "files": successful_results,
            "error_details": errors,
            "performance_stats": self.performance_monitor.get_stats(),
            "cache_stats": self.cache.get_stats() if self.cache else None
        }
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """파일을 건너뛸지 판단"""
        skip_patterns = [
            "node_modules", ".git", "__pycache__", "venv", ".venv",
            "dist", "build", ".next", ".nuxt", "target", "vendor",
            ".DS_Store", "Thumbs.db", ".idea", ".vscode"
        ]
        
        path_str = str(file_path).lower()
        return any(pattern in path_str for pattern in skip_patterns)
    
    def get_analysis_stats(self) -> Dict[str, Any]:
        """분석 통계 반환"""
        return {
            "performance": self.performance_monitor.get_stats(),
            "cache": self.cache.get_stats() if self.cache else None,
            "supported_languages": len(self.supported_extensions),
            "config": self.config.__dict__ if hasattr(self.config, '__dict__') else str(self.config)
        }


# Enhanced AST Visitor for Python
class PythonASTVisitor(ast.NodeVisitor):
    """향상된 Python AST 방문자"""
    
    def __init__(self):
        self.imports = []
        self.functions = []
        self.classes = []
        self.variables = []
        self.constants = []
        self.current_class = None
        self.decorators = []
    
    def visit_Import(self, node: ast.Import):
        """import 문 방문"""
        for alias in node.names:
            self.imports.append({
                "type": "import",
                "module": alias.name,
                "alias": alias.asname,
                "line": node.lineno
            })
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node: ast.ImportFrom):
        """from import 문 방문"""
        module = node.module or ""
        for alias in node.names:
            self.imports.append({
                "type": "from_import",
                "module": module,
                "name": alias.name,
                "alias": alias.asname,
                "line": node.lineno
            })
        self.generic_visit(node)
    
    def visit_FunctionDef(self, node: ast.FunctionDef):
        """함수 정의 방문"""
        self._process_function(node, is_async=False)
        self.generic_visit(node)
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        """비동기 함수 정의 방문"""
        self._process_function(node, is_async=True)
        self.generic_visit(node)
    
    def visit_ClassDef(self, node: ast.ClassDef):
        """클래스 정의 방문"""
        old_class = self.current_class
        self.current_class = node.name
        
        # 데코레이터 정보
        decorators = [self._ast_to_string(d) for d in node.decorator_list]
        
        self.classes.append({
            "name": node.name,
            "bases": [self._ast_to_string(base) for base in node.bases],
            "decorators": decorators,
            "docstring": ast.get_docstring(node),
            "line": node.lineno,
            "is_dataclass": any("dataclass" in dec for dec in decorators),
            "methods": []
        })
        
        self.generic_visit(node)
        self.current_class = old_class
    
    def visit_Assign(self, node: ast.Assign):
        """변수 할당 방문"""
        for target in node.targets:
            if isinstance(target, ast.Name):
                var_info = {
                    "name": target.id,
                    "line": node.lineno,
                    "value": self._get_value_repr(node.value),
                    "type": self._infer_type(node.value),
                    "in_class": self.current_class is not None
                }
                
                # 상수 판별 (대문자 이름)
                if target.id.isupper():
                    self.constants.append(var_info)
                else:
                    self.variables.append(var_info)
        
        self.generic_visit(node)
    
    def _process_function(self, node: ast.FunctionDef, is_async: bool = False):
        """함수 처리"""
        # 매개변수 정보
        args = []
        for arg in node.args.args:
            arg_info = {
                "name": arg.arg,
                "annotation": self._ast_to_string(arg.annotation) if arg.annotation else None
            }
            args.append(arg_info)
        
        # 데코레이터 정보
        decorators = [self._ast_to_string(d) for d in node.decorator_list]
        
        # 함수 복잡도 계산
        complexity = self._calculate_complexity(node)
        
        func_info = {
            "name": node.name,
            "args": args,
            "decorators": decorators,
            "return_annotation": self._ast_to_string(node.returns) if node.returns else None,
            "docstring": ast.get_docstring(node),
            "line": node.lineno,
            "is_async": is_async,
            "is_method": self.current_class is not None,
            "complexity": complexity,
            "is_property": any("property" in dec for dec in decorators),
            "is_staticmethod": any("staticmethod" in dec for dec in decorators),
            "is_classmethod": any("classmethod" in dec for dec in decorators)
        }
        
        self.functions.append(func_info)
    
    def _calculate_complexity(self, node: ast.FunctionDef) -> int:
        """함수 복잡도 계산"""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(child, ast.ExceptHandler):
                complexity += 1
            elif isinstance(child, (ast.And, ast.Or)):
                complexity += 1
        return complexity
    
    def _ast_to_string(self, node: ast.AST) -> str:
        """AST 노드를 문자열로 변환"""
        try:
            if hasattr(ast, 'unparse'):
                return ast.unparse(node)
            else:
                # Python 3.8 이하 호환성
                return str(node)
        except Exception:
            return "..."
    
    def _get_value_repr(self, node: ast.AST) -> str:
        """값 표현 추출"""
        try:
            if isinstance(node, ast.Constant):
                return repr(node.value)
            elif isinstance(node, ast.Name):
                return node.id
            else:
                return self._ast_to_string(node)[:50] + "..." if len(self._ast_to_string(node)) > 50 else self._ast_to_string(node)
        except Exception:
            return "..."
    
    def _infer_type(self, node: ast.AST) -> str:
        """타입 추론"""
        if isinstance(node, ast.Constant):
            return type(node.value).__name__
        elif isinstance(node, ast.List):
            return "list"
        elif isinstance(node, ast.Dict):
            return "dict"
        elif isinstance(node, ast.Set):
            return "set"
        elif isinstance(node, ast.Tuple):
            return "tuple"
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                return f"call_{node.func.id}"
        return "unknown"


# Enhanced Batch Analyzer
class EnhancedBatchFileAnalyzer:
    """향상된 배치 파일 분석기"""
    
    def __init__(self, config: Optional[AnalysisConfig] = None):
        self.config = config or AnalysisConfig()
        self.analyzer = EnhancedFileAnalyzer(config)
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    async def analyze_directory_with_progress(
        self,
        directory: Union[str, Path],
        file_patterns: List[str] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """진행률 콜백과 함께 디렉토리 분석"""
        
        directory = Path(directory)
        if file_patterns is None:
            file_patterns = ['*.py', '*.js', '*.ts', '*.jsx', '*.tsx', '*.java', '*.cpp', '*.c', '*.go', '*.rs']
        
        # 파일 목록 수집
        files_to_analyze = []
        for pattern in file_patterns:
            files_to_analyze.extend(directory.rglob(pattern))
        
        files_to_analyze = [f for f in files_to_analyze if not self._should_skip_file(f)]
        
        total_files = len(files_to_analyze)
        processed_files = 0
        results = []
        errors = []
        
        # 진행률 콜백 호출
        if progress_callback:
            progress_callback(processed_files, total_files)
        
        # 배치 단위로 처리
        batch_size = min(self.config.max_workers, 10)
        
        for i in range(0, total_files, batch_size):
            batch = files_to_analyze[i:i + batch_size]
            
            # 배치 내 파일들을 병렬 처리
            tasks = [self.analyzer.analyze_file_async(file_path) for file_path in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 결과 처리
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    errors.append({
                        'file': str(batch[j]),
                        'error': str(result)
                    })
                else:
                    results.append(result)
                
                processed_files += 1
                
                # 진행률 업데이트
                if progress_callback:
                    progress_callback(processed_files, total_files)
        
        # 분석 결과 요약 생성
        summary = self._generate_analysis_summary(results)
        
        return {
            "directory": str(directory),
            "total_files": total_files,
            "successful_analyses": len(results),
            "failed_analyses": len(errors),
            "files": results,
            "errors": errors,
            "summary": summary,
            "performance_stats": self.analyzer.get_analysis_stats()
        }
    
    def _generate_analysis_summary(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """분석 결과 요약 생성"""
        if not results:
            return {}
        
        # 언어별 통계
        language_stats = {}
        total_lines = 0
        total_functions = 0
        total_classes = 0
        total_security_issues = 0
        complexity_scores = []
        
        for result in results:
            content_analysis = result.get('content_analysis', {})
            
            language = content_analysis.get('language', 'Unknown')
            if language not in language_stats:
                language_stats[language] = {
                    'files': 0,
                    'lines': 0,
                    'functions': 0,
                    'classes': 0,
                    'security_issues': 0
                }
            
            language_stats[language]['files'] += 1
            
            # 라인 수
            file_info = result.get('file_info', {})
            lines = file_info.get('lines', 0)
            language_stats[language]['lines'] += lines
            total_lines += lines
            
            # 함수/클래스 수
            functions = len(content_analysis.get('functions', []))
            classes = len(content_analysis.get('classes', []))
            language_stats[language]['functions'] += functions
            language_stats[language]['classes'] += classes
            total_functions += functions
            total_classes += classes
            
            # 보안 이슈
            security_issues = len(content_analysis.get('security_issues', []))
            language_stats[language]['security_issues'] += security_issues
            total_security_issues += security_issues
            
            # 복잡도
            metrics = content_analysis.get('metrics', {})
            if isinstance(metrics, dict):
                complexity = metrics.get('cyclomatic_complexity', 0)
                if complexity > 0:
                    complexity_scores.append(complexity)
        
        # 평균 복잡도 계산
        avg_complexity = sum(complexity_scores) / len(complexity_scores) if complexity_scores else 0
        
        return {
            'language_breakdown': language_stats,
            'totals': {
                'lines_of_code': total_lines,
                'functions': total_functions,
                'classes': total_classes,
                'security_issues': total_security_issues,
                'average_complexity': round(avg_complexity, 2)
            },
            'quality_metrics': {
                'files_with_security_issues': len([r for r in results 
                                                 if len(r.get('content_analysis', {}).get('security_issues', [])) > 0]),
                'average_file_size': total_lines / len(results) if results else 0,
                'complexity_distribution': {
                    'low': len([c for c in complexity_scores if c <= 5]),
                    'medium': len([c for c in complexity_scores if 5 < c <= 10]),
                    'high': len([c for c in complexity_scores if c > 10])
                }
            }
        }
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """파일을 건너뛸지 판단"""
        skip_patterns = [
            "node_modules", ".git", "__pycache__", "venv", ".venv",
            "dist", "build", ".next", ".nuxt", "target", "vendor",
            ".DS_Store", "Thumbs.db", ".idea", ".vscode"
        ]
        
        path_str = str(file_path).lower()
        return any(pattern in path_str for pattern in skip_patterns)


# Dependency Graph Analyzer
class DependencyGraphAnalyzer:
    """의존성 그래프 분석기"""
    
    def __init__(self):
        self.graph = {}
        self.reverse_graph = {}
        
    def build_graph(self, analysis_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """의존성 그래프 구축"""
        self.graph = {}
        self.reverse_graph = {}
        
        # 파일별 의존성 정보 수집
        for result in analysis_results:
            file_path = result.get('file_info', {}).get('path', '')
            if not file_path:
                continue
                
            content_analysis = result.get('content_analysis', {})
            imports = content_analysis.get('imports', [])
            
            self.graph[file_path] = []
            
            for imp in imports:
                dependency = imp.get('module', '')
                if dependency:
                    self.graph[file_path].append(dependency)
                    
                    # 역방향 그래프 구축
                    if dependency not in self.reverse_graph:
                        self.reverse_graph[dependency] = []
                    self.reverse_graph[dependency].append(file_path)
        
        return {
            'graph': self.graph,
            'reverse_graph': self.reverse_graph,
            'circular_dependencies': self.find_circular_dependencies(),
            'dependency_levels': self.calculate_dependency_levels(),
            'orphaned_files': self.find_orphaned_files(),
            'hub_files': self.find_hub_files()
        }
    
    def find_circular_dependencies(self) -> List[List[str]]:
        """순환 의존성 탐지"""
        visited = set()
        rec_stack = set()
        cycles = []
        
        def dfs(node, path):
            if node in rec_stack:
                # 순환 발견
                cycle_start = path.index(node)
                cycles.append(path[cycle_start:] + [node])
                return
            
            if node in visited:
                return
            
            visited.add(node)
            rec_stack.add(node)
            
            for neighbor in self.graph.get(node, []):
                if neighbor in self.graph:  # 내부 모듈만 확인
                    dfs(neighbor, path + [node])
            
            rec_stack.remove(node)
        
        for node in self.graph:
            if node not in visited:
                dfs(node, [])
        
        return cycles
    
    def calculate_dependency_levels(self) -> Dict[str, int]:
        """의존성 레벨 계산 (깊이)"""
        levels = {}
        
        def calculate_level(node, visited):
            if node in visited:
                return 0  # 순환 방지
            if node in levels:
                return levels[node]
            
            visited.add(node)
            dependencies = self.graph.get(node, [])
            
            if not dependencies:
                levels[node] = 0
            else:
                max_level = 0
                for dep in dependencies:
                    if dep in self.graph:  # 내부 의존성만
                        dep_level = calculate_level(dep, visited)
                        max_level = max(max_level, dep_level + 1)
                levels[node] = max_level
            
            visited.remove(node)
            return levels[node]
        
        for node in self.graph:
            calculate_level(node, set())
        
        return levels
    
    def find_orphaned_files(self) -> List[str]:
        """고립된 파일 찾기 (의존성이 없고 다른 파일에서 참조되지 않는 파일)"""
        orphaned = []
        
        for file_path in self.graph:
            has_dependencies = bool(self.graph.get(file_path, []))
            is_referenced = file_path in self.reverse_graph
            
            if not has_dependencies and not is_referenced:
                orphaned.append(file_path)
        
        return orphaned
    
    def find_hub_files(self, threshold: int = 5) -> List[Dict[str, Any]]:
        """허브 파일 찾기 (많은 파일에서 참조되는 파일)"""
        hubs = []
        
        for module, referencing_files in self.reverse_graph.items():
            if len(referencing_files) >= threshold:
                hubs.append({
                    'module': module,
                    'reference_count': len(referencing_files),
                    'referencing_files': referencing_files
                })
        
        return sorted(hubs, key=lambda x: x['reference_count'], reverse=True)


# Report Generator
class AnalysisReportGenerator:
    """분석 리포트 생성기"""
    
    def __init__(self):
        self.template = """
# 코드 분석 리포트

## 📊 전체 요약

- **총 파일 수**: {total_files}
- **분석 성공**: {successful_files}
- **분석 실패**: {failed_files}
- **총 코드 라인**: {total_lines:,}
- **평균 복잡도**: {avg_complexity:.2f}

## 🔍 언어별 분석

{language_breakdown}

## 🚨 보안 이슈

{security_summary}

## 📈 품질 메트릭

{quality_metrics}

## 🔗 의존성 분석

{dependency_analysis}

## ⚠️ 주의사항

{warnings}

---
*생성 시간: {generation_time}*
*분석기 버전: 2.0.0*
        """
    
    def generate_report(self, analysis_result: Dict[str, Any], 
                       dependency_graph: Optional[Dict[str, Any]] = None) -> str:
        """분석 리포트 생성"""
        
        summary = analysis_result.get('summary', {})
        totals = summary.get('totals', {})
        quality_metrics = summary.get('quality_metrics', {})
        
        # 언어별 분석
        language_breakdown = self._format_language_breakdown(summary.get('language_breakdown', {}))
        
        # 보안 이슈 요약
        security_summary = self._format_security_summary(analysis_result)
        
        # 품질 메트릭
        quality_metrics_text = self._format_quality_metrics(quality_metrics)
        
        # 의존성 분석
        dependency_analysis = self._format_dependency_analysis(dependency_graph) if dependency_graph else "의존성 분석이 수행되지 않았습니다."
        
        # 경고사항
        warnings = self._generate_warnings(analysis_result, dependency_graph)
        
        return self.template.format(
            total_files=analysis_result.get('total_files', 0),
            successful_files=analysis_result.get('successful_analyses', 0),
            failed_files=analysis_result.get('failed_analyses', 0),
            total_lines=totals.get('lines_of_code', 0),
            avg_complexity=totals.get('average_complexity', 0),
            language_breakdown=language_breakdown,
            security_summary=security_summary,
            quality_metrics=quality_metrics_text,
            dependency_analysis=dependency_analysis,
            warnings=warnings,
            generation_time=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )
    
    def _format_language_breakdown(self, language_stats: Dict[str, Any]) -> str:
        """언어별 분석 포맷팅"""
        if not language_stats:
            return "언어별 통계를 사용할 수 없습니다."
        
        lines = []
        for language, stats in sorted(language_stats.items(), key=lambda x: x[1]['files'], reverse=True):
            lines.append(f"### {language}")
            lines.append(f"- 파일 수: {stats['files']}")
            lines.append(f"- 코드 라인: {stats['lines']:,}")
            lines.append(f"- 함수 수: {stats['functions']}")
            lines.append(f"- 클래스 수: {stats['classes']}")
            lines.append(f"- 보안 이슈: {stats['security_issues']}")
            lines.append("")
        
        return "\n".join(lines)
    
    def _format_security_summary(self, analysis_result: Dict[str, Any]) -> str:
        """보안 이슈 요약 포맷팅"""
        files = analysis_result.get('files', [])
        
        security_issues = []
        for file_result in files:
            content_analysis = file_result.get('content_analysis', {})
            file_issues = content_analysis.get('security_issues', [])
            
            for issue in file_issues:
                issue['file'] = file_result.get('file_info', {}).get('name', 'Unknown')
                security_issues.append(issue)
        
        if not security_issues:
            return "보안 이슈가 발견되지 않았습니다. ✅"
        
        # 심각도별 분류
        by_severity = {}
        for issue in security_issues:
            severity = issue.get('severity', 'unknown')
            if severity not in by_severity:
                by_severity[severity] = []
            by_severity[severity].append(issue)
        
        lines = [f"**총 {len(security_issues)}개의 보안 이슈 발견**\n"]
        
        for severity in ['critical', 'high', 'medium', 'low']:
            if severity in by_severity:
                lines.append(f"### {severity.upper()} 심각도 ({len(by_severity[severity])}개)")
                for issue in by_severity[severity][:5]:  # 최대 5개까지만 표시
                    lines.append(f"- **{issue.get('file', 'Unknown')}:{issue.get('line', 0)}** - {issue.get('description', 'No description')}")
                if len(by_severity[severity]) > 5:
                    lines.append(f"- ... 외 {len(by_severity[severity]) - 5}개")
                lines.append("")
        
        return "\n".join(lines)
    
    def _format_quality_metrics(self, quality_metrics: Dict[str, Any]) -> str:
        """품질 메트릭 포맷팅"""
        if not quality_metrics:
            return "품질 메트릭을 사용할 수 없습니다."
        
        lines = []
        
        # 보안 이슈가 있는 파일
        files_with_issues = quality_metrics.get('files_with_security_issues', 0)
        lines.append(f"- **보안 이슈가 있는 파일**: {files_with_issues}개")
        
        # 평균 파일 크기
        avg_file_size = quality_metrics.get('average_file_size', 0)
        lines.append(f"- **평균 파일 크기**: {avg_file_size:.1f} 라인")
        
        # 복잡도 분포
        complexity_dist = quality_metrics.get('complexity_distribution', {})
        if complexity_dist:
            lines.append("- **복잡도 분포**:")
            lines.append(f"  - 낮음 (≤5): {complexity_dist.get('low', 0)}개")
            lines.append(f"  - 보통 (6-10): {complexity_dist.get('medium', 0)}개")
            lines.append(f"  - 높음 (>10): {complexity_dist.get('high', 0)}개")
        
        return "\n".join(lines)
    
    def _format_dependency_analysis(self, dependency_graph: Dict[str, Any]) -> str:
        """의존성 분석 포맷팅"""
        lines = []
        
        # 순환 의존성
        circular_deps = dependency_graph.get('circular_dependencies', [])
        lines.append(f"- **순환 의존성**: {len(circular_deps)}개")
        
        if circular_deps:
            lines.append("  주요 순환 의존성:")
            for cycle in circular_deps[:3]:  # 최대 3개까지
                cycle_str = " → ".join(cycle)
                lines.append(f"    - {cycle_str}")
        
        # 고립된 파일
        orphaned = dependency_graph.get('orphaned_files', [])
        lines.append(f"- **고립된 파일**: {len(orphaned)}개")
        
        # 허브 파일
        hubs = dependency_graph.get('hub_files', [])
        lines.append(f"- **허브 파일**: {len(hubs)}개")
        
        if hubs:
            lines.append("  주요 허브 파일:")
            for hub in hubs[:3]:  # 최대 3개까지
                lines.append(f"    - {hub['module']} ({hub['reference_count']}개 참조)")
        
        return "\n".join(lines)
    
    def _generate_warnings(self, analysis_result: Dict[str, Any], 
                          dependency_graph: Optional[Dict[str, Any]]) -> str:
        """경고사항 생성"""
        warnings = []
        
        # 분석 실패가 많은 경우
        failed_analyses = analysis_result.get('failed_analyses', 0)
        total_files = analysis_result.get('total_files', 0)
        
        if total_files > 0 and failed_analyses / total_files > 0.1:
            warnings.append(f"⚠️ 전체 파일의 {failed_analyses/total_files*100:.1f}%가 분석에 실패했습니다.")
        
        # 보안 이슈가 많은 경우
        summary = analysis_result.get('summary', {})
        total_security_issues = summary.get('totals', {}).get('security_issues', 0)
        
        if total_security_issues > 10:
            warnings.append(f"🚨 총 {total_security_issues}개의 보안 이슈가 발견되었습니다. 우선적으로 해결하세요.")
        
        # 순환 의존성이 있는 경우
        if dependency_graph:
            circular_deps = dependency_graph.get('circular_dependencies', [])
            if circular_deps:
                warnings.append(f"🔄 {len(circular_deps)}개의 순환 의존성이 발견되었습니다. 리팩토링을 고려하세요.")
        
        # 평균 복잡도가 높은 경우
        avg_complexity = summary.get('totals', {}).get('average_complexity', 0)
        if avg_complexity > 10:
            warnings.append(f"📊 평균 복잡도가 {avg_complexity:.1f}로 높습니다. 코드 분할을 고려하세요.")
        
        if not warnings:
            warnings.append("✅ 특별한 주의사항이 없습니다.")
        
        return "\n".join(warnings)


# 편의 함수들 (Enhanced)
async def analyze_file_enhanced(file_path: Union[str, Path], 
                               config: Optional[AnalysisConfig] = None) -> Dict[str, Any]:
    """강화된 파일 분석 (편의 함수)"""
    analyzer = EnhancedFileAnalyzer(config)
    return await analyzer.analyze_file_async(file_path)


async def analyze_directory_enhanced(directory: Union[str, Path], 
                                   file_patterns: List[str] = None,
                                   recursive: bool = True,
                                   include_dependency_graph: bool = True,
                                   progress_callback: Optional[Callable[[int, int], None]] = None,
                                   config: Optional[AnalysisConfig] = None) -> Dict[str, Any]:
    """강화된 디렉토리 분석 (편의 함수)"""
    
    batch_analyzer = EnhancedBatchFileAnalyzer(config)
    
    # 진행률 콜백과 함께 분석
    if progress_callback:
        result = await batch_analyzer.analyze_directory_with_progress(
            directory, file_patterns, progress_callback
        )
    else:
        result = await batch_analyzer.analyze_directory_with_progress(
            directory, file_patterns
        )
    
    # 의존성 그래프 분석
    if include_dependency_graph and result['files']:
        dep_analyzer = DependencyGraphAnalyzer()
        dependency_graph = dep_analyzer.build_graph(result['files'])
        result['dependency_graph'] = dependency_graph
    
    return result


def generate_analysis_report(analysis_result: Dict[str, Any], 
                           output_file: Optional[str] = None) -> str:
    """분석 리포트 생성 (편의 함수)"""
    
    report_generator = AnalysisReportGenerator()
    dependency_graph = analysis_result.get('dependency_graph')
    
    report = report_generator.generate_report(analysis_result, dependency_graph)
    
    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(report)
    
    return report


# 설정 헬퍼
def create_analysis_config(**kwargs) -> AnalysisConfig:
    """분석 설정 생성 헬퍼"""
    return AnalysisConfig(**kwargs)


# 성능 최적화된 배치 분석
async def batch_analyze_with_limits(files: List[Path], 
                                  max_concurrent: int = 5,
                                  memory_limit_mb: int = 1000,
                                  config: Optional[AnalysisConfig] = None) -> List[Dict[str, Any]]:
    """메모리 제한과 함께 배치 분석"""
    
    analyzer = EnhancedFileAnalyzer(config)
    results = []
    current_memory = 0
    
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def analyze_with_memory_check(file_path: Path):
        nonlocal current_memory
        
        async with semaphore:
            # 메모리 사용량 체크
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            
            if memory_mb > memory_limit_mb:
                # 메모리 정리
                if analyzer.cache:
                    analyzer.cache.clear()
                
                # 가비지 컬렉션 강제 실행
                import gc
                gc.collect()
            
            return await analyzer.analyze_file_async(file_path)
    
    # 배치 단위로 처리
    batch_size = min(max_concurrent, 20)
    
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        
        tasks = [analyze_with_memory_check(file_path) for file_path in batch]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in batch_results:
            if not isinstance(result, Exception):
                results.append(result)
    
    return results "