#!/usr/bin/env python3
"""
Enhanced Analysis Utilities
고도화된 프로젝트 분석 및 메타데이터 추출 도구들

주요 개선사항:
- 타입 안정성 강화 (Pydantic 모델)
- 의존성 그래프 분석
- 보안 분석 추가
- 성능 최적화 (캐싱, 병렬처리)
- 코드 품질 메트릭 확장
- AI 기반 분석 준비
"""

import ast
import re
import os
import hashlib
import networkx as nx
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Union, Set, Tuple, Generator
from dataclasses import dataclass, field
from pydantic import BaseModel, Field, validator
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from enum import Enum
import json

# 로깅 설정
logger = logging.getLogger(__name__)


class SecurityLevel(str, Enum):
    """보안 위험 수준"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class LanguageType(str, Enum):
    """지원하는 프로그래밍 언어"""
    PYTHON = "Python"
    JAVASCRIPT = "JavaScript"
    TYPESCRIPT = "TypeScript"
    REACT_JSX = "React JSX"
    REACT_TSX = "React TSX"
    JAVA = "Java"
    CPP = "C++"
    C = "C"
    CSHARP = "C#"
    GO = "Go"
    RUST = "Rust"
    PHP = "PHP"
    RUBY = "Ruby"
    SWIFT = "Swift"
    KOTLIN = "Kotlin"
    UNKNOWN = "Unknown"


class SecurityIssue(BaseModel):
    """보안 이슈 모델"""
    type: str = Field(..., description="보안 이슈 유형")
    severity: SecurityLevel = Field(..., description="심각도")
    line: int = Field(..., description="라인 번호")
    description: str = Field(..., description="이슈 설명")
    recommendation: str = Field(..., description="권장사항")
    code_snippet: Optional[str] = Field(None, description="문제 코드 조각")


class DependencyInfo(BaseModel):
    """의존성 정보 모델"""
    name: str = Field(..., description="의존성 이름")
    version: Optional[str] = Field(None, description="버전")
    import_type: str = Field(..., description="import 타입")
    module: str = Field(..., description="모듈명")
    line: int = Field(..., description="라인 번호")
    is_external: bool = Field(True, description="외부 의존성 여부")
    is_standard_library: bool = Field(False, description="표준 라이브러리 여부")


class FunctionMetrics(BaseModel):
    """함수 메트릭 모델"""
    name: str = Field(..., description="함수명")
    line_start: int = Field(..., description="시작 라인")
    line_end: int = Field(..., description="끝 라인")
    cyclomatic_complexity: int = Field(0, description="순환 복잡도")
    cognitive_complexity: int = Field(0, description="인지 복잡도")
    halstead_complexity: Dict[str, float] = Field(default_factory=dict, description="할스테드 복잡도")
    parameters_count: int = Field(0, description="매개변수 개수")
    return_statements: int = Field(0, description="return 문 개수")
    is_async: bool = Field(False, description="비동기 함수 여부")
    is_recursive: bool = Field(False, description="재귀 함수 여부")
    docstring_quality: int = Field(0, description="독스트링 품질 점수 (0-100)")


class ClassMetrics(BaseModel):
    """클래스 메트릭 모델"""
    name: str = Field(..., description="클래스명")
    line_start: int = Field(..., description="시작 라인")
    line_end: int = Field(..., description="끝 라인")
    methods_count: int = Field(0, description="메서드 개수")
    attributes_count: int = Field(0, description="속성 개수")
    inheritance_depth: int = Field(0, description="상속 깊이")
    coupling_factor: float = Field(0.0, description="결합도")
    cohesion_factor: float = Field(0.0, description="응집도")
    is_abstract: bool = Field(False, description="추상 클래스 여부")
    design_patterns: List[str] = Field(default_factory=list, description="탐지된 디자인 패턴")


class CodeQualityMetrics(BaseModel):
    """코드 품질 메트릭"""
    maintainability_index: float = Field(0.0, description="유지보수성 지수")
    technical_debt_ratio: float = Field(0.0, description="기술 부채 비율")
    code_duplication_ratio: float = Field(0.0, description="코드 중복 비율")
    test_coverage_estimate: float = Field(0.0, description="테스트 커버리지 추정")
    documentation_ratio: float = Field(0.0, description="문서화 비율")
    complexity_distribution: Dict[str, int] = Field(default_factory=dict, description="복잡도 분포")


class AnalysisResult(BaseModel):
    """분석 결과 모델"""
    file_path: str = Field(..., description="파일 경로")
    file_hash: str = Field(..., description="파일 해시")
    language: LanguageType = Field(..., description="프로그래밍 언어")
    lines_of_code: int = Field(0, description="코드 라인 수")
    functions: List[FunctionMetrics] = Field(default_factory=list, description="함수 메트릭")
    classes: List[ClassMetrics] = Field(default_factory=list, description="클래스 메트릭")
    dependencies: List[DependencyInfo] = Field(default_factory=list, description="의존성 정보")
    security_issues: List[SecurityIssue] = Field(default_factory=list, description="보안 이슈")
    env_vars: List[Dict[str, Any]] = Field(default_factory=list, description="환경변수")
    quality_metrics: CodeQualityMetrics = Field(default_factory=CodeQualityMetrics, description="품질 메트릭")
    analysis_timestamp: datetime = Field(default_factory=datetime.now, description="분석 시각")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class DependencyGraph(BaseModel):
    """의존성 그래프 모델"""
    nodes: List[str] = Field(default_factory=list, description="노드 목록")
    edges: List[Tuple[str, str]] = Field(default_factory=list, description="엣지 목록")
    circular_dependencies: List[List[str]] = Field(default_factory=list, description="순환 의존성")
    depth_analysis: Dict[str, int] = Field(default_factory=dict, description="깊이 분석")
    centrality_metrics: Dict[str, float] = Field(default_factory=dict, description="중심성 메트릭")


class ProjectSummary(BaseModel):
    """프로젝트 요약 모델"""
    total_files: int = Field(0, description="총 파일 수")
    total_lines: int = Field(0, description="총 라인 수")
    language_distribution: Dict[str, int] = Field(default_factory=dict, description="언어별 분포")
    complexity_summary: Dict[str, float] = Field(default_factory=dict, description="복잡도 요약")
    security_summary: Dict[str, int] = Field(default_factory=dict, description="보안 요약")
    quality_summary: Dict[str, float] = Field(default_factory=dict, description="품질 요약")
    dependency_graph: Optional[DependencyGraph] = Field(None, description="의존성 그래프")
    hotspots: List[Dict[str, Any]] = Field(default_factory=list, description="핫스팟 분석")
    recommendations: List[str] = Field(default_factory=list, description="개선 권장사항")


class EnhancedProjectAnalyzer:
    """고도화된 프로젝트 분석기"""
    
    def __init__(self, cache_enabled: bool = True, max_workers: int = 4):
        self.cache_enabled = cache_enabled
        self.max_workers = max_workers
        self.cache = {}
        
        # 지원하는 파일 확장자 매핑
        self.language_mapping = {
            '.py': LanguageType.PYTHON,
            '.js': LanguageType.JAVASCRIPT,
            '.ts': LanguageType.TYPESCRIPT,
            '.jsx': LanguageType.REACT_JSX,
            '.tsx': LanguageType.REACT_TSX,
            '.java': LanguageType.JAVA,
            '.cpp': LanguageType.CPP,
            '.c': LanguageType.C,
            '.cs': LanguageType.CSHARP,
            '.go': LanguageType.GO,
            '.rs': LanguageType.RUST,
            '.php': LanguageType.PHP,
            '.rb': LanguageType.RUBY,
            '.swift': LanguageType.SWIFT,
            '.kt': LanguageType.KOTLIN,
        }
        
        # 보안 패턴 정의
        self.security_patterns = {
            'hardcoded_secrets': [
                (r'(?i)(password|pwd|secret|key|token)\s*=\s*["\'][^"\']+["\']', 
                 SecurityLevel.CRITICAL, "하드코딩된 보안 정보"),
                (r'(?i)(api_key|apikey)\s*=\s*["\'][^"\']+["\']', 
                 SecurityLevel.CRITICAL, "하드코딩된 API 키"),
            ],
            'sql_injection': [
                (r'(?i)(select|insert|update|delete).*\+.*', 
                 SecurityLevel.HIGH, "SQL 인젝션 취약점 가능성"),
                (r'(?i)execute\s*\(\s*["\'].*\+.*["\']', 
                 SecurityLevel.HIGH, "동적 SQL 실행"),
            ],
            'xss_vulnerability': [
                (r'(?i)innerHTML\s*=\s*.*\+', 
                 SecurityLevel.MEDIUM, "XSS 취약점 가능성"),
                (r'(?i)document\.write\s*\(.*\+', 
                 SecurityLevel.MEDIUM, "동적 DOM 조작"),
            ],
            'weak_crypto': [
                (r'(?i)(md5|sha1)\s*\(', 
                 SecurityLevel.MEDIUM, "약한 암호화 알고리즘 사용"),
            ]
        }
        
        # 표준 라이브러리 목록 (Python)
        self.python_stdlib = {
            'os', 'sys', 'json', 're', 'time', 'datetime', 'collections',
            'itertools', 'functools', 'pathlib', 'typing', 'logging',
            'unittest', 'asyncio', 'threading', 'multiprocessing'
        }
        
        # 디자인 패턴 탐지 패턴
        self.design_patterns = {
            'singleton': [r'class\s+\w+.*:\s*\n\s*_instance\s*=\s*None'],
            'factory': [r'def\s+create_\w+\s*\(', r'class\s+\w*Factory'],
            'observer': [r'def\s+(add|remove)_observer', r'def\s+notify'],
            'decorator': [r'@\w+\s*\n\s*def\s+\w+'],
            'builder': [r'class\s+\w*Builder', r'def\s+build\s*\('],
        }
    
    def analyze_file(self, file_path: Union[str, Path]) -> AnalysisResult:
        """단일 파일 분석"""
        file_path = Path(file_path)
        
        # 캐시 확인
        if self.cache_enabled:
            file_hash = self._get_file_hash(file_path)
            if file_hash in self.cache:
                logger.debug(f"캐시에서 분석 결과 반환: {file_path}")
                return self.cache[file_hash]
        
        try:
            # 파일 내용 읽기
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # 언어 탐지
            language = self._detect_language(file_path)
            
            # 분석 수행
            result = AnalysisResult(
                file_path=str(file_path),
                file_hash=file_hash,
                language=language,
                lines_of_code=len([line for line in content.splitlines() if line.strip()])
            )
            
            # 언어별 분석
            if language == LanguageType.PYTHON:
                result = self._analyze_python_file(file_path, content, result)
            elif language in [LanguageType.JAVASCRIPT, LanguageType.TYPESCRIPT, 
                             LanguageType.REACT_JSX, LanguageType.REACT_TSX]:
                result = self._analyze_javascript_file(file_path, content, result)
            else:
                result = self._analyze_generic_file(file_path, content, result)
            
            # 보안 분석
            result.security_issues = self._analyze_security(content)
            
            # 환경변수 분석
            result.env_vars = self._extract_env_vars(content, language)
            
            # 코드 품질 메트릭 계산
            result.quality_metrics = self._calculate_quality_metrics(result)
            
            # 캐시 저장
            if self.cache_enabled:
                self.cache[file_hash] = result
            
            return result
            
        except Exception as e:
            logger.error(f"파일 분석 실패: {file_path}, 오류: {e}")
            return AnalysisResult(
                file_path=str(file_path),
                file_hash="",
                language=LanguageType.UNKNOWN,
                lines_of_code=0
            )
    
    def analyze_project(self, project_path: Union[str, Path], 
                       recursive: bool = True,
                       file_patterns: Optional[List[str]] = None) -> Tuple[List[AnalysisResult], ProjectSummary]:
        """프로젝트 전체 분석"""
        project_path = Path(project_path)
        
        if file_patterns is None:
            file_patterns = list(self.language_mapping.keys())
        
        # 분석할 파일 목록 수집
        files_to_analyze = []
        for pattern in file_patterns:
            if recursive:
                files_to_analyze.extend(project_path.rglob(f"*{pattern}"))
            else:
                files_to_analyze.extend(project_path.glob(f"*{pattern}"))
        
        # 스킵할 파일 필터링
        files_to_analyze = [f for f in files_to_analyze if not self._should_skip_file(f)]
        
        logger.info(f"분석 대상 파일: {len(files_to_analyze)}개")
        
        # 병렬 분석
        analysis_results = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_file = {executor.submit(self.analyze_file, file_path): file_path 
                             for file_path in files_to_analyze}
            
            for future in as_completed(future_to_file):
                file_path = future_to_file[future]
                try:
                    result = future.result()
                    analysis_results.append(result)
                except Exception as e:
                    logger.error(f"파일 분석 실패: {file_path}, 오류: {e}")
        
        # 프로젝트 요약 생성
        summary = self._generate_project_summary(analysis_results)
        
        return analysis_results, summary
    
    def build_dependency_graph(self, analysis_results: List[AnalysisResult]) -> DependencyGraph:
        """의존성 그래프 구축"""
        graph = nx.DiGraph()
        
        # 노드와 엣지 추가
        for result in analysis_results:
            file_name = Path(result.file_path).stem
            graph.add_node(file_name)
            
            for dep in result.dependencies:
                if not dep.is_external:
                    graph.add_edge(file_name, dep.name)
        
        # 순환 의존성 탐지
        try:
            cycles = list(nx.simple_cycles(graph))
        except nx.NetworkXError:
            cycles = []
        
        # 중심성 분석
        try:
            centrality = nx.betweenness_centrality(graph)
        except:
            centrality = {}
        
        # 깊이 분석
        depth_analysis = {}
        for node in graph.nodes():
            try:
                depth_analysis[node] = nx.shortest_path_length(graph, source=node)
            except:
                depth_analysis[node] = 0
        
        return DependencyGraph(
            nodes=list(graph.nodes()),
            edges=list(graph.edges()),
            circular_dependencies=cycles,
            depth_analysis=depth_analysis,
            centrality_metrics=centrality
        )
    
    def _analyze_python_file(self, file_path: Path, content: str, result: AnalysisResult) -> AnalysisResult:
        """Python 파일 분석"""
        try:
            tree = ast.parse(content)
            
            # 함수 분석
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    func_metrics = self._analyze_python_function(node, content)
                    result.functions.append(func_metrics)
                
                elif isinstance(node, ast.ClassDef):
                    class_metrics = self._analyze_python_class(node, content)
                    result.classes.append(class_metrics)
                
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    deps = self._analyze_python_import(node)
                    result.dependencies.extend(deps)
            
        except SyntaxError as e:
            logger.warning(f"Python 구문 분석 실패: {file_path}, {e}")
            # 정규식 기반 폴백 분석
            result = self._analyze_with_regex(content, result)
        
        return result
    
    def _analyze_python_function(self, node: ast.FunctionDef, content: str) -> FunctionMetrics:
        """Python 함수 분석"""
        lines = content.splitlines()
        
        # 기본 정보
        func_name = node.name
        line_start = node.lineno
        line_end = getattr(node, 'end_lineno', line_start)
        
        # 복잡도 계산
        cyclomatic = self._calculate_cyclomatic_complexity(node)
        cognitive = self._calculate_cognitive_complexity(node)
        halstead = self._calculate_halstead_complexity(node, content)
        
        # 매개변수 개수
        params_count = len(node.args.args)
        
        # return 문 개수
        return_count = len([n for n in ast.walk(node) if isinstance(n, ast.Return)])
        
        # 재귀 함수 여부
        is_recursive = any(isinstance(n, ast.Call) and 
                          isinstance(n.func, ast.Name) and 
                          n.func.id == func_name 
                          for n in ast.walk(node))
        
        # 독스트링 품질 평가
        docstring_quality = self._evaluate_docstring_quality(ast.get_docstring(node))
        
        return FunctionMetrics(
            name=func_name,
            line_start=line_start,
            line_end=line_end,
            cyclomatic_complexity=cyclomatic,
            cognitive_complexity=cognitive,
            halstead_complexity=halstead,
            parameters_count=params_count,
            return_statements=return_count,
            is_async=isinstance(node, ast.AsyncFunctionDef),
            is_recursive=is_recursive,
            docstring_quality=docstring_quality
        )
    
    def _analyze_python_class(self, node: ast.ClassDef, content: str) -> ClassMetrics:
        """Python 클래스 분석"""
        # 메서드 및 속성 개수
        methods = [n for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        attributes = [n for n in ast.walk(node) if isinstance(n, ast.Assign)]
        
        # 상속 깊이
        inheritance_depth = len(node.bases)
        
        # 추상 클래스 여부
        is_abstract = any(isinstance(decorator, ast.Name) and 
                         decorator.id == 'abstractmethod'
                         for method in methods 
                         for decorator in method.decorator_list
                         if isinstance(decorator, ast.Name))
        
        # 디자인 패턴 탐지
        detected_patterns = self._detect_design_patterns(node, content)
        
        return ClassMetrics(
            name=node.name,
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno),
            methods_count=len(methods),
            attributes_count=len(attributes),
            inheritance_depth=inheritance_depth,
            is_abstract=is_abstract,
            design_patterns=detected_patterns
        )
    
    def _analyze_python_import(self, node: Union[ast.Import, ast.ImportFrom]) -> List[DependencyInfo]:
        """Python import 문 분석"""
        dependencies = []
        
        if isinstance(node, ast.Import):
            for alias in node.names:
                module_name = alias.name.split('.')[0]
                dependencies.append(DependencyInfo(
                    name=alias.asname or alias.name,
                    import_type="import",
                    module=alias.name,
                    line=node.lineno,
                    is_external=module_name not in self.python_stdlib,
                    is_standard_library=module_name in self.python_stdlib
                ))
        
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            module_name = module.split('.')[0]
            
            for alias in node.names:
                dependencies.append(DependencyInfo(
                    name=alias.asname or alias.name,
                    import_type="from_import",
                    module=module,
                    line=node.lineno,
                    is_external=module_name not in self.python_stdlib,
                    is_standard_library=module_name in self.python_stdlib
                ))
        
        return dependencies
    
    def _analyze_javascript_file(self, file_path: Path, content: str, result: AnalysisResult) -> AnalysisResult:
        """JavaScript/TypeScript 파일 분석"""
        lines = content.splitlines()
        
        # 정규식 기반 분석
        for i, line in enumerate(lines, 1):
            # 함수 패턴
            func_patterns = [
                r'function\s+(\w+)\s*\(',
                r'const\s+(\w+)\s*=\s*function',
                r'(\w+)\s*:\s*function',
                r'(\w+)\s*=\s*\([^)]*\)\s*=>'
            ]
            
            for pattern in func_patterns:
                match = re.search(pattern, line)
                if match:
                    result.functions.append(FunctionMetrics(
                        name=match.group(1),
                        line_start=i,
                        line_end=i,  # 단순화
                        parameters_count=line.count(',') + 1 if '(' in line else 0
                    ))
            
            # 클래스 패턴
            class_match = re.search(r'class\s+(\w+)', line)
            if class_match:
                result.classes.append(ClassMetrics(
                    name=class_match.group(1),
                    line_start=i,
                    line_end=i
                ))
            
            # Import 패턴
            import_patterns = [
                r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]',
                r'import\s+[\'"]([^\'"]+)[\'"]',
                r'require\([\'"]([^\'"]+)[\'"]\)'
            ]
            
            for pattern in import_patterns:
                match = re.search(pattern, line)
                if match:
                    result.dependencies.append(DependencyInfo(
                        name=match.group(1),
                        import_type="import",
                        module=match.group(1),
                        line=i,
                        is_external=not match.group(1).startswith('.')
                    ))
        
        return result
    
    def _analyze_generic_file(self, file_path: Path, content: str, result: AnalysisResult) -> AnalysisResult:
        """일반 파일 분석"""
        return self._analyze_with_regex(content, result)
    
    def _analyze_with_regex(self, content: str, result: AnalysisResult) -> AnalysisResult:
        """정규식 기반 폴백 분석"""
        lines = content.splitlines()
        
        for i, line in enumerate(lines, 1):
            # 함수 패턴
            if re.search(r'\w+\s*\([^)]*\)\s*\{', line):
                func_match = re.search(r'(\w+)\s*\(', line)
                if func_match:
                    result.functions.append(FunctionMetrics(
                        name=func_match.group(1),
                        line_start=i,
                        line_end=i
                    ))
        
        return result
    
    def _analyze_security(self, content: str) -> List[SecurityIssue]:
        """보안 분석"""
        issues = []
        lines = content.splitlines()
        
        for category, patterns in self.security_patterns.items():
            for pattern, severity, description in patterns:
                for i, line in enumerate(lines, 1):
                    if re.search(pattern, line):
                        issues.append(SecurityIssue(
                            type=category,
                            severity=severity,
                            line=i,
                            description=description,
                            recommendation=self._get_security_recommendation(category),
                            code_snippet=line.strip()
                        ))
        
        return issues
    
    def _extract_env_vars(self, content: str, language: LanguageType) -> List[Dict[str, Any]]:
        """환경변수 추출"""
        env_vars = []
        lines = content.splitlines()
        
        if language == LanguageType.PYTHON:
            patterns = [
                r'os\.environ\[[\'"](.*?)[\'"]\]',
                r'os\.getenv\([\'"](.*?)[\'"]\)',
            ]
        else:
            patterns = [
                r'process\.env\.([A-Z_][A-Z0-9_]*)',
                r'process\.env\[[\'"](.*?)[\'"]\]',
            ]
        
        for i, line in enumerate(lines, 1):
            for pattern in patterns:
                matches = re.finditer(pattern, line)
                for match in matches:
                    env_vars.append({
                        'name': match.group(1),
                        'line': i,
                        'pattern': pattern,
                        'context': line.strip()
                    })
        
        return env_vars
    
    def _calculate_quality_metrics(self, result: AnalysisResult) -> CodeQualityMetrics:
        """코드 품질 메트릭 계산"""
        # 복잡도 평균
        avg_complexity = 0
        if result.functions:
            avg_complexity = sum(f.cyclomatic_complexity for f in result.functions) / len(result.functions)
        
        # 유지보수성 지수 (Microsoft 공식 기반)
        maintainability = max(0, 171 - 5.2 * avg_complexity - 0.23 * len(result.functions) - 16.2 * len(str(result.lines_of_code)))
        
        # 문서화 비율
        documented_functions = sum(1 for f in result.functions if f.docstring_quality > 0)
        doc_ratio = documented_functions / len(result.functions) if result.functions else 0
        
        # 복잡도 분포
        complexity_dist = {}
        for func in result.functions:
            complexity = func.cyclomatic_complexity
            if complexity <= 5:
                complexity_dist['low'] = complexity_dist.get('low', 0) + 1
            elif complexity <= 10:
                complexity_dist['medium'] = complexity_dist.get('medium', 0) + 1
            else:
                complexity_dist['high'] = complexity_dist.get('high', 0) + 1
        
        return CodeQualityMetrics(
            maintainability_index=maintainability,
            documentation_ratio=doc_ratio,
            complexity_distribution=complexity_dist
        )
    
    def _calculate_cyclomatic_complexity(self, node: ast.AST) -> int:
        """순환 복잡도 계산"""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity += 1
            elif isinstance(child, ast.ExceptHandler):
                complexity += 1
            elif isinstance(child, (ast.And, ast.Or)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
        return complexity
    
    def _calculate_cognitive_complexity(self, node: ast.AST) -> int:
        """인지 복잡도 계산 (SonarQube 방식)"""
        complexity = 0
        nesting_level = 0
        
        def calculate_recursive(node, level=0):
            nonlocal complexity
            
            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                    complexity += 1 + level
                    calculate_recursive(child, level + 1)
                elif isinstance(child, ast.ExceptHandler):
                    complexity += 1 + level
                    calculate_recursive(child, level + 1)
                elif isinstance(child, (ast.And, ast.Or)):
                    complexity += 1
                    calculate_recursive(child, level)
                else:
                    calculate_recursive(child, level)
        
        calculate_recursive(node)
        return complexity
    
    def _calculate_halstead_complexity(self, node: ast.AST, content: str) -> Dict[str, float]:
        """할스테드 복잡도 계산"""
        operators = set()
        operands = set()
        operator_count = 0
        operand_count = 0
        
        for child in ast.walk(node):
            if isinstance(child, ast.BinOp):
                operators.add(type(child.op).__name__)
                operator_count += 1
            elif isinstance(child, ast.Name):
                operands.add(child.id)
                operand_count += 1
            elif isinstance(child, ast.Constant):
                operands.add(str(child.value))
                operand_count += 1
        
        # 할스테드 메트릭 계산
        n1 = len(operators)  # 고유 연산자 수
        n2 = len(operands)   # 고유 피연산자 수
        N1 = operator_count  # 총 연산자 수
        N2 = operand_count   # 총 피연산자 수
        
        if n1 == 0 or n2 == 0:
            return {}
        
        vocabulary = n1 + n2
        length = N1 + N2
        volume = length * (vocabulary.bit_length() if vocabulary > 0 else 0)
        difficulty = (n1 / 2) * (N2 / n2) if n2 > 0 else 0
        effort = difficulty * volume
        
        return {
            'vocabulary': vocabulary,
            'length': length,
            'volume': volume,
            'difficulty': difficulty,
            'effort': effort
        }
    
    def _evaluate_docstring_quality(self, docstring: Optional[str]) -> int:
        """독스트링 품질 평가 (0-100점)"""
        if not docstring:
            return 0
        
        score = 0
        
        # 기본 존재 점수
        score += 20
        
        # 길이 점수 (너무 짧지 않고 너무 길지 않음)
        if 10 <= len(docstring) <= 500:
            score += 20
        elif len(docstring) > 10:
            score += 10
        
        # 구조 점수
        if 'Args:' in docstring or 'Parameters:' in docstring:
            score += 20
        if 'Returns:' in docstring or 'Return:' in docstring:
            score += 20
        if 'Raises:' in docstring or 'Throws:' in docstring:
            score += 10
        if 'Example:' in docstring or 'Examples:' in docstring:
            score += 10
        
        return min(score, 100)
    
    def _detect_design_patterns(self, node: ast.ClassDef, content: str) -> List[str]:
        """디자인 패턴 탐지"""
        patterns = []
        class_content = ast.get_source_segment(content, node)
        
        if not class_content:
            return patterns
        
        for pattern_name, pattern_regexes in self.design_patterns.items():
            for regex in pattern_regexes:
                if re.search(regex, class_content, re.MULTILINE):
                    patterns.append(pattern_name)
                    break
        
        return patterns
    
    def _get_security_recommendation(self, issue_type: str) -> str:
        """보안 이슈별 권장사항"""
        recommendations = {
            'hardcoded_secrets': "환경변수나 설정 파일을 사용하여 민감한 정보를 외부화하세요.",
            'sql_injection': "매개변수화된 쿼리나 ORM을 사용하세요.",
            'xss_vulnerability': "사용자 입력을 적절히 이스케이프하거나 검증하세요.",
            'weak_crypto': "SHA-256 이상의 강력한 해시 알고리즘을 사용하세요."
        }
        return recommendations.get(issue_type, "보안 모범 사례를 따르세요.")
    
    def _generate_project_summary(self, analysis_results: List[AnalysisResult]) -> ProjectSummary:
        """프로젝트 요약 생성"""
        if not analysis_results:
            return ProjectSummary()
        
        # 기본 통계
        total_files = len(analysis_results)
        total_lines = sum(r.lines_of_code for r in analysis_results)
        
        # 언어별 분포
        language_dist = {}
        for result in analysis_results:
            lang = result.language.value
            language_dist[lang] = language_dist.get(lang, 0) + 1
        
        # 복잡도 요약
        all_functions = [f for r in analysis_results for f in r.functions]
        complexity_summary = {}
        if all_functions:
            complexities = [f.cyclomatic_complexity for f in all_functions]
            complexity_summary = {
                'avg_cyclomatic': sum(complexities) / len(complexities),
                'max_cyclomatic': max(complexities),
                'functions_over_10': len([c for c in complexities if c > 10])
            }
        
        # 보안 요약
        all_security_issues = [issue for r in analysis_results for issue in r.security_issues]
        security_summary = {}
        for issue in all_security_issues:
            severity = issue.severity.value
            security_summary[severity] = security_summary.get(severity, 0) + 1
        
        # 품질 요약
        quality_metrics = [r.quality_metrics for r in analysis_results]
        quality_summary = {}
        if quality_metrics:
            maintainability_scores = [q.maintainability_index for q in quality_metrics]
            doc_ratios = [q.documentation_ratio for q in quality_metrics]
            
            quality_summary = {
                'avg_maintainability': sum(maintainability_scores) / len(maintainability_scores),
                'avg_documentation': sum(doc_ratios) / len(doc_ratios)
            }
        
        # 의존성 그래프
        dependency_graph = self.build_dependency_graph(analysis_results)
        
        # 핫스팟 분석 (복잡도가 높은 파일들)
        hotspots = []
        for result in analysis_results:
            if result.functions:
                avg_complexity = sum(f.cyclomatic_complexity for f in result.functions) / len(result.functions)
                if avg_complexity > 10:
                    hotspots.append({
                        'file': result.file_path,
                        'avg_complexity': avg_complexity,
                        'functions_count': len(result.functions),
                        'security_issues': len(result.security_issues)
                    })
        
        hotspots.sort(key=lambda x: x['avg_complexity'], reverse=True)
        
        # 권장사항 생성
        recommendations = self._generate_recommendations(analysis_results, complexity_summary, security_summary)
        
        return ProjectSummary(
            total_files=total_files,
            total_lines=total_lines,
            language_distribution=language_dist,
            complexity_summary=complexity_summary,
            security_summary=security_summary,
            quality_summary=quality_summary,
            dependency_graph=dependency_graph,
            hotspots=hotspots[:10],  # 상위 10개만
            recommendations=recommendations
        )
    
    def _generate_recommendations(self, analysis_results: List[AnalysisResult], 
                                complexity_summary: Dict, security_summary: Dict) -> List[str]:
        """개선 권장사항 생성"""
        recommendations = []
        
        # 복잡도 관련 권장사항
        if complexity_summary.get('functions_over_10', 0) > 0:
            recommendations.append(
                f"순환 복잡도가 10을 초과하는 함수가 {complexity_summary['functions_over_10']}개 있습니다. "
                "함수를 더 작은 단위로 분리하는 것을 고려하세요."
            )
        
        # 보안 관련 권장사항
        critical_issues = security_summary.get('critical', 0)
        if critical_issues > 0:
            recommendations.append(
                f"심각한 보안 이슈가 {critical_issues}개 발견되었습니다. "
                "하드코딩된 시크릿을 환경변수로 이동하세요."
            )
        
        # 문서화 권장사항
        all_functions = [f for r in analysis_results for f in r.functions]
        undocumented = len([f for f in all_functions if f.docstring_quality == 0])
        if undocumented > len(all_functions) * 0.5:
            recommendations.append(
                f"문서화되지 않은 함수가 {undocumented}개 있습니다. "
                "코드 가독성을 위해 독스트링을 추가하세요."
            )
        
        # 의존성 권장사항
        external_deps = set()
        for result in analysis_results:
            for dep in result.dependencies:
                if dep.is_external:
                    external_deps.add(dep.module)
        
        if len(external_deps) > 20:
            recommendations.append(
                f"외부 의존성이 {len(external_deps)}개로 많습니다. "
                "의존성을 정리하고 필요한 것만 유지하세요."
            )
        
        return recommendations
    
    def _detect_language(self, file_path: Path) -> LanguageType:
        """파일 확장자로 언어 탐지"""
        suffix = file_path.suffix.lower()
        return self.language_mapping.get(suffix, LanguageType.UNKNOWN)
    
    def _get_file_hash(self, file_path: Path) -> str:
        """파일 해시 계산"""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """파일을 건너뛸지 판단"""
        skip_patterns = [
            'node_modules', '.git', '__pycache__', 'venv', '.venv',
            'dist', 'build', '.next', '.nuxt', 'target', 'vendor',
            '.pytest_cache', '.mypy_cache', 'coverage'
        ]
        
        path_str = str(file_path)
        return any(pattern in path_str for pattern in skip_patterns)


class SecurityAnalyzer:
    """전문 보안 분석기"""
    
    def __init__(self):
        self.vulnerability_patterns = {
            'injection': {
                'sql': [
                    r'(?i)(select|insert|update|delete).*(\+|format|%)',
                    r'(?i)cursor\.execute\s*\(\s*["\'].*\+',
                    r'(?i)query\s*=\s*["\'].*\+.*["\']'
                ],
                'command': [
                    r'(?i)(os\.system|subprocess\.call|exec|eval)\s*\([^)]*\+',
                    r'(?i)shell=True.*\+',
                ],
                'ldap': [
                    r'(?i)ldap.*search.*\+',
                ]
            },
            'crypto': {
                'weak_algorithms': [
                    r'(?i)(md5|sha1|des|rc4)\s*\(',
                    r'(?i)algorithm\s*=\s*["\'](?:md5|sha1|des)["\']'
                ],
                'weak_random': [
                    r'(?i)random\.random\(\)',
                    r'(?i)math\.random\(\)'
                ]
            },
            'authentication': {
                'weak_password': [
                    r'(?i)password\s*=\s*["\']["\']',  # 빈 패스워드
                    r'(?i)password\s*=\s*["\'](?:admin|password|123|test)["\']'
                ],
                'hardcoded_credentials': [
                    r'(?i)(api_key|secret|token|password)\s*=\s*["\'][^"\']{8,}["\']'
                ]
            }
        }
    
    def analyze_vulnerabilities(self, content: str, language: LanguageType) -> List[SecurityIssue]:
        """심화 보안 취약점 분석"""
        issues = []
        lines = content.splitlines()
        
        for category, subcategories in self.vulnerability_patterns.items():
            for subcategory, patterns in subcategories.items():
                for pattern in patterns:
                    for i, line in enumerate(lines, 1):
                        if re.search(pattern, line):
                            severity = self._determine_severity(category, subcategory)
                            issues.append(SecurityIssue(
                                type=f"{category}_{subcategory}",
                                severity=severity,
                                line=i,
                                description=self._get_vulnerability_description(category, subcategory),
                                recommendation=self._get_vulnerability_recommendation(category, subcategory),
                                code_snippet=line.strip()
                            ))
        
        return issues
    
    def _determine_severity(self, category: str, subcategory: str) -> SecurityLevel:
        """취약점 심각도 결정"""
        severity_mapping = {
            ('injection', 'sql'): SecurityLevel.CRITICAL,
            ('injection', 'command'): SecurityLevel.CRITICAL,
            ('crypto', 'weak_algorithms'): SecurityLevel.HIGH,
            ('authentication', 'hardcoded_credentials'): SecurityLevel.CRITICAL,
            ('authentication', 'weak_password'): SecurityLevel.HIGH,
        }
        return severity_mapping.get((category, subcategory), SecurityLevel.MEDIUM)
    
    def _get_vulnerability_description(self, category: str, subcategory: str) -> str:
        """취약점 설명"""
        descriptions = {
            ('injection', 'sql'): "SQL 인젝션 취약점이 발견되었습니다",
            ('injection', 'command'): "명령어 인젝션 취약점이 발견되었습니다",
            ('crypto', 'weak_algorithms'): "약한 암호화 알고리즘이 사용되고 있습니다",
            ('authentication', 'hardcoded_credentials'): "하드코딩된 인증 정보가 발견되었습니다",
        }
        return descriptions.get((category, subcategory), "보안 취약점이 발견되었습니다")
    
    def _get_vulnerability_recommendation(self, category: str, subcategory: str) -> str:
        """취약점별 권장사항"""
        recommendations = {
            ('injection', 'sql'): "매개변수화된 쿼리나 ORM을 사용하세요",
            ('injection', 'command'): "입력값을 검증하고 화이트리스트 방식을 사용하세요",
            ('crypto', 'weak_algorithms'): "SHA-256, AES 등 강력한 암호화 알고리즘을 사용하세요",
            ('authentication', 'hardcoded_credentials'): "환경변수나 키 관리 서비스를 사용하세요",
        }
        return recommendations.get((category, subcategory), "보안 모범 사례를 따르세요")


# 편의 함수들
def analyze_single_file(file_path: Union[str, Path], 
                       cache_enabled: bool = True) -> AnalysisResult:
    """단일 파일 분석 편의 함수"""
    analyzer = EnhancedProjectAnalyzer(cache_enabled=cache_enabled)
    return analyzer.analyze_file(file_path)


def analyze_project_enhanced(project_path: Union[str, Path], 
                           recursive: bool = True,
                           max_workers: int = 4) -> Tuple[List[AnalysisResult], ProjectSummary]:
    """프로젝트 분석 편의 함수"""
    analyzer = EnhancedProjectAnalyzer(max_workers=max_workers)
    return analyzer.analyze_project(project_path, recursive)


def get_security_report(analysis_results: List[AnalysisResult]) -> Dict[str, Any]:
    """보안 리포트 생성 편의 함수"""
    all_issues = []
    for result in analysis_results:
        for issue in result.security_issues:
            all_issues.append({
                'file': result.file_path,
                'type': issue.type,
                'severity': issue.severity.value,
                'line': issue.line,
                'description': issue.description,
                'code': issue.code_snippet
            })
    
    # 심각도별 분류
    by_severity = {}
    for issue in all_issues:
        severity = issue['severity']
        if severity not in by_severity:
            by_severity[severity] = []
        by_severity[severity].append(issue)
    
    return {
        'total_issues': len(all_issues),
        'by_severity': by_severity,
        'top_files_with_issues': _get_top_vulnerable_files(all_issues),
        'recommendations': _generate_security_recommendations(by_severity)
    }


def get_complexity_report(analysis_results: List[AnalysisResult]) -> Dict[str, Any]:
    """복잡도 리포트 생성 편의 함수"""
    all_functions = []
    for result in analysis_results:
        for func in result.functions:
            all_functions.append({
                'file': result.file_path,
                'name': func.name,
                'cyclomatic': func.cyclomatic_complexity,
                'cognitive': func.cognitive_complexity,
                'lines': func.line_end - func.line_start + 1
            })
    
    # 복잡도 통계
    if all_functions:
        complexities = [f['cyclomatic'] for f in all_functions]
        complex_functions = [f for f in all_functions if f['cyclomatic'] > 10]
        
        return {
            'total_functions': len(all_functions),
            'avg_complexity': sum(complexities) / len(complexities),
            'max_complexity': max(complexities),
            'complex_functions_count': len(complex_functions),
            'complex_functions': sorted(complex_functions, 
                                      key=lambda x: x['cyclomatic'], 
                                      reverse=True)[:10]
        }
    
    return {'total_functions': 0}


def _get_top_vulnerable_files(issues: List[Dict]) -> List[Dict]:
    """취약점이 많은 파일 순위"""
    file_counts = {}
    for issue in issues:
        file_path = issue['file']
        if file_path not in file_counts:
            file_counts[file_path] = {'count': 0, 'critical': 0, 'high': 0}
        file_counts[file_path]['count'] += 1
        if issue['severity'] == 'critical':
            file_counts[file_path]['critical'] += 1
        elif issue['severity'] == 'high':
            file_counts[file_path]['high'] += 1
    
    sorted_files = sorted(file_counts.items(), 
                         key=lambda x: (x[1]['critical'], x[1]['high'], x[1]['count']), 
                         reverse=True)
    
    return [{'file': file, **stats} for file, stats in sorted_files[:5]]


def _generate_security_recommendations(by_severity: Dict) -> List[str]:
    """보안 권장사항 생성"""
    recommendations = []
    
    if 'critical' in by_severity:
        recommendations.append(
            f"긴급: {len(by_severity['critical'])}개의 심각한 보안 취약점을 즉시 수정하세요."
        )
    
    if 'high' in by_severity:
        recommendations.append(
            f"높음: {len(by_severity['high'])}개의 높은 위험 취약점을 우선 수정하세요."
        )
    
    recommendations.extend([
        "정기적인 보안 코드 리뷰를 실시하세요.",
        "자동화된 보안 스캔 도구를 CI/CD 파이프라인에 통합하세요.",
        "개발팀에 보안 코딩 교육을 제공하세요."
    ])
    
    return recommendations


if __name__ == "__main__":
    # 사용 예시
    import sys
    
    if len(sys.argv) < 2:
        print("사용법: python analysis_utils.py <프로젝트_경로>")
        sys.exit(1)
    
    project_path = sys.argv[1]
    
    # 프로젝트 분석 실행
    results, summary = analyze_project_enhanced(project_path)
    
    print(f"분석 완료: {summary.total_files}개 파일, {summary.total_lines}줄")
    print(f"보안 이슈: {sum(summary.security_summary.values())}개")
    print(f"복잡한 함수: {summary.complexity_summary.get('functions_over_10', 0)}개")
    
    # 보안 리포트
    security_report = get_security_report(results)
    if security_report['total_issues'] > 0:
        print(f"\n⚠️  보안 이슈 {security_report['total_issues']}개 발견")
        for severity, issues in security_report['by_severity'].items():
            print(f"  {severity}: {len(issues)}개")
    
    # 복잡도 리포트
    complexity_report = get_complexity_report(results)
    if complexity_report['complex_functions_count'] > 0:
        print(f"\n📊 복잡한 함수 {complexity_report['complex_functions_count']}개")
        print(f"  평균 복잡도: {complexity_report['avg_complexity']:.1f}")
        print(f"  최대 복잡도: {complexity_report['max_complexity']}")
