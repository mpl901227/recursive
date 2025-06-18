#!/usr/bin/env python3
"""
Context Management Utilities for AI Assisted Coding
AI가 코드 컨텍스트를 이해하고 관리하는 핵심 유틸리티

주요 기능:
- 프로젝트 구조 분석 및 지식 그래프 구축
- 코드 관계 추적 및 의존성 매핑
- 실시간 컨텍스트 수집 및 업데이트
- 코드 변화 이력 추적
- 의미론적 코드 검색
- 컨텍스트 기반 추천 시스템
"""

import ast
import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Iterator,
    Callable, NamedTuple, Protocol, TypeVar, Generic
)
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import pickle
import gzip
from functools import lru_cache, wraps
import networkx as nx
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# 로깅 설정
logger = logging.getLogger(__name__)

# 타입 정의
T = TypeVar('T')


# 열거형 정의
class ContextType(Enum):
    """컨텍스트 타입"""
    FILE = "file"
    FUNCTION = "function"
    CLASS = "class"
    MODULE = "module"
    PROJECT = "project"
    DEPENDENCY = "dependency"
    IMPORT = "import"
    VARIABLE = "variable"
    COMMENT = "comment"


class RelationType(Enum):
    """관계 타입"""
    IMPORTS = "imports"
    DEPENDS_ON = "depends_on"
    CALLS = "calls"
    INHERITS = "inherits"
    IMPLEMENTS = "implements"
    USES = "uses"
    DEFINES = "defines"
    CONTAINS = "contains"
    REFERENCES = "references"
    MODIFIES = "modifies"


class ChangeType(Enum):
    """변경 타입"""
    ADDED = "added"
    MODIFIED = "modified"
    DELETED = "deleted"
    MOVED = "moved"
    RENAMED = "renamed"


# 데이터 클래스들
@dataclass
class CodeLocation:
    """코드 위치 정보"""
    file_path: str
    line_start: int
    line_end: int
    column_start: int = 0
    column_end: int = 0
    
    def __hash__(self):
        return hash((self.file_path, self.line_start, self.line_end))


@dataclass
class CodeElement:
    """코드 요소"""
    id: str
    name: str
    type: ContextType
    location: CodeLocation
    signature: str = ""
    docstring: str = ""
    complexity: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    last_modified: datetime = field(default_factory=datetime.now)
    
    def __hash__(self):
        return hash(self.id)


@dataclass
class CodeRelation:
    """코드 관계"""
    source_id: str
    target_id: str
    relation_type: RelationType
    strength: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class ChangeEvent:
    """변경 이벤트"""
    id: str
    element_id: str
    change_type: ChangeType
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    author: str = ""
    commit_hash: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContextQuery:
    """컨텍스트 쿼리"""
    query_text: str
    context_types: List[ContextType] = field(default_factory=list)
    file_filters: List[str] = field(default_factory=list)
    max_results: int = 10
    similarity_threshold: float = 0.1
    include_dependencies: bool = True


@dataclass
class ContextResult:
    """컨텍스트 검색 결과"""
    element: CodeElement
    relevance_score: float
    context_path: List[str] = field(default_factory=list)
    related_elements: List[CodeElement] = field(default_factory=list)


@dataclass
class ProjectContext:
    """프로젝트 컨텍스트"""
    project_path: str
    name: str
    language: str
    framework: str = ""
    version: str = ""
    dependencies: List[str] = field(default_factory=list)
    entry_points: List[str] = field(default_factory=list)
    test_directories: List[str] = field(default_factory=list)
    build_files: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_analyzed: datetime = field(default_factory=datetime.now)


# 예외 클래스들
class ContextError(Exception):
    """컨텍스트 관련 기본 예외"""
    pass


class ContextNotFoundError(ContextError):
    """컨텍스트를 찾을 수 없음"""
    pass


class ContextCorruptedError(ContextError):
    """컨텍스트 데이터 손상"""
    pass


# 캐시 데코레이터
def cache_result(ttl: int = 3600):
    """결과 캐싱 데코레이터"""
    def decorator(func):
        cache = {}
        cache_times = {}
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = str(hash((args, tuple(sorted(kwargs.items())))))
            now = time.time()
            
            if key in cache and now - cache_times[key] < ttl:
                return cache[key]
            
            result = func(*args, **kwargs)
            cache[key] = result
            cache_times[key] = now
            
            # 캐시 크기 제한
            if len(cache) > 1000:
                oldest_key = min(cache_times.keys(), key=lambda k: cache_times[k])
                del cache[oldest_key]
                del cache_times[oldest_key]
            
            return result
        return wrapper
    return decorator


class KnowledgeGraph:
    """코드 지식 그래프"""
    
    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.elements: Dict[str, CodeElement] = {}
        self.relations: List[CodeRelation] = []
        self._lock = threading.RLock()
    
    def add_element(self, element: CodeElement) -> None:
        """요소 추가"""
        with self._lock:
            self.elements[element.id] = element
            self.graph.add_node(element.id, element=element)
    
    def add_relation(self, relation: CodeRelation) -> None:
        """관계 추가"""
        with self._lock:
            self.relations.append(relation)
            self.graph.add_edge(
                relation.source_id,
                relation.target_id,
                relation_type=relation.relation_type,
                strength=relation.strength,
                metadata=relation.metadata
            )
    
    def get_element(self, element_id: str) -> Optional[CodeElement]:
        """요소 조회"""
        return self.elements.get(element_id)
    
    def get_related_elements(self, element_id: str, 
                           relation_types: List[RelationType] = None,
                           max_depth: int = 2) -> List[CodeElement]:
        """관련 요소 조회"""
        if element_id not in self.graph:
            return []
        
        related = []
        visited = set()
        queue = deque([(element_id, 0)])
        
        while queue:
            current_id, depth = queue.popleft()
            
            if current_id in visited or depth > max_depth:
                continue
            
            visited.add(current_id)
            
            if depth > 0 and current_id in self.elements:
                related.append(self.elements[current_id])
            
            # 인접 노드 탐색
            for neighbor in self.graph.neighbors(current_id):
                edge_data = self.graph[current_id][neighbor]
                
                # 관계 타입 필터링
                if relation_types:
                    for edge_key, edge_attrs in edge_data.items():
                        if edge_attrs.get('relation_type') in relation_types:
                            queue.append((neighbor, depth + 1))
                            break
                else:
                    queue.append((neighbor, depth + 1))
        
        return related
    
    def find_shortest_path(self, source_id: str, target_id: str) -> Optional[List[str]]:
        """최단 경로 찾기"""
        try:
            return nx.shortest_path(self.graph, source_id, target_id)
        except nx.NetworkXNoPath:
            return None
    
    def get_strongly_connected_components(self) -> List[List[str]]:
        """강연결 성분 찾기"""
        return list(nx.strongly_connected_components(self.graph))
    
    def calculate_centrality(self) -> Dict[str, float]:
        """중심성 계산"""
        try:
            return nx.pagerank(self.graph)
        except:
            return {}
    
    def export_to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 내보내기"""
        return {
            'elements': {eid: asdict(element) for eid, element in self.elements.items()},
            'relations': [asdict(relation) for relation in self.relations],
            'graph_data': nx.node_link_data(self.graph)
        }
    
    def import_from_dict(self, data: Dict[str, Any]) -> None:
        """딕셔너리에서 가져오기"""
        with self._lock:
            # 요소 복원
            for eid, element_data in data.get('elements', {}).items():
                element = CodeElement(**element_data)
                self.elements[eid] = element
            
            # 관계 복원
            self.relations = [CodeRelation(**rel_data) for rel_data in data.get('relations', [])]
            
            # 그래프 복원
            self.graph = nx.node_link_graph(data.get('graph_data', {}))


class ContextDatabase:
    """컨텍스트 데이터베이스"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """데이터베이스 초기화"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS elements (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    line_start INTEGER,
                    line_end INTEGER,
                    signature TEXT,
                    docstring TEXT,
                    complexity INTEGER DEFAULT 1,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS relations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    strength REAL DEFAULT 1.0,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES elements (id),
                    FOREIGN KEY (target_id) REFERENCES elements (id)
                );
                
                CREATE TABLE IF NOT EXISTS changes (
                    id TEXT PRIMARY KEY,
                    element_id TEXT NOT NULL,
                    change_type TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    author TEXT,
                    commit_hash TEXT,
                    metadata TEXT,
                    FOREIGN KEY (element_id) REFERENCES elements (id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_elements_type ON elements (type);
                CREATE INDEX IF NOT EXISTS idx_elements_file ON elements (file_path);
                CREATE INDEX IF NOT EXISTS idx_relations_source ON relations (source_id);
                CREATE INDEX IF NOT EXISTS idx_relations_target ON relations (target_id);
                CREATE INDEX IF NOT EXISTS idx_changes_element ON changes (element_id);
                CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes (timestamp);
            """)
    
    def save_element(self, element: CodeElement) -> None:
        """요소 저장"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO elements 
                (id, name, type, file_path, line_start, line_end, signature, 
                 docstring, complexity, metadata, last_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                element.id, element.name, element.type.value,
                element.location.file_path, element.location.line_start, element.location.line_end,
                element.signature, element.docstring, element.complexity,
                json.dumps(element.metadata), element.last_modified
            ))
    
    def save_relation(self, relation: CodeRelation) -> None:
        """관계 저장"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO relations 
                (source_id, target_id, relation_type, strength, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (
                relation.source_id, relation.target_id, relation.relation_type.value,
                relation.strength, json.dumps(relation.metadata)
            ))
    
    def save_change(self, change: ChangeEvent) -> None:
        """변경 이벤트 저장"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO changes 
                (id, element_id, change_type, old_value, new_value, timestamp, author, commit_hash, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                change.id, change.element_id, change.change_type.value,
                change.old_value, change.new_value, change.timestamp,
                change.author, change.commit_hash, json.dumps(change.metadata)
            ))
    
    def query_elements(self, context_type: ContextType = None, 
                      file_path: str = None) -> List[CodeElement]:
        """요소 쿼리"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            query = "SELECT * FROM elements WHERE 1=1"
            params = []
            
            if context_type:
                query += " AND type = ?"
                params.append(context_type.value)
            
            if file_path:
                query += " AND file_path = ?"
                params.append(file_path)
            
            cursor = conn.execute(query, params)
            elements = []
            
            for row in cursor.fetchall():
                location = CodeLocation(
                    file_path=row['file_path'],
                    line_start=row['line_start'],
                    line_end=row['line_end']
                )
                
                element = CodeElement(
                    id=row['id'],
                    name=row['name'],
                    type=ContextType(row['type']),
                    location=location,
                    signature=row['signature'] or "",
                    docstring=row['docstring'] or "",
                    complexity=row['complexity'],
                    metadata=json.loads(row['metadata'] or '{}')
                )
                elements.append(element)
            
            return elements


class SemanticSearchEngine:
    """의미론적 검색 엔진"""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=10000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        self.document_vectors = None
        self.documents = []
        self.element_map = {}
        self._fitted = False
    
    def add_documents(self, elements: List[CodeElement]) -> None:
        """문서 추가"""
        self.documents = []
        self.element_map = {}
        
        for element in elements:
            # 검색 가능한 텍스트 생성
            text_parts = [
                element.name,
                element.signature,
                element.docstring,
                element.location.file_path
            ]
            
            # 메타데이터에서 텍스트 추출
            for key, value in element.metadata.items():
                if isinstance(value, str):
                    text_parts.append(value)
            
            document = ' '.join(filter(None, text_parts))
            self.documents.append(document)
            self.element_map[len(self.documents) - 1] = element
        
        # 벡터화
        if self.documents:
            self.document_vectors = self.vectorizer.fit_transform(self.documents)
            self._fitted = True
    
    def search(self, query: str, max_results: int = 10, 
              min_similarity: float = 0.1) -> List[Tuple[CodeElement, float]]:
        """의미론적 검색"""
        if not self._fitted or not self.documents:
            return []
        
        # 쿼리 벡터화
        query_vector = self.vectorizer.transform([query])
        
        # 유사도 계산
        similarities = cosine_similarity(query_vector, self.document_vectors).flatten()
        
        # 결과 정렬
        results = []
        for idx, similarity in enumerate(similarities):
            if similarity >= min_similarity:
                element = self.element_map[idx]
                results.append((element, similarity))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:max_results]


class FileAnalyzer:
    """파일 분석기"""
    
    def __init__(self):
        self.supported_extensions = {
            '.py': self._analyze_python,
            '.js': self._analyze_javascript,
            '.ts': self._analyze_typescript,
            '.jsx': self._analyze_javascript,
            '.tsx': self._analyze_typescript,
            '.java': self._analyze_java,
            '.cpp': self._analyze_cpp,
            '.c': self._analyze_cpp,
            '.go': self._analyze_go,
            '.rs': self._analyze_rust,
        }
    
    def analyze_file(self, file_path: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """파일 분석"""
        file_path = Path(file_path)
        
        if not file_path.exists():
            return [], []
        
        extension = file_path.suffix.lower()
        analyzer = self.supported_extensions.get(extension, self._analyze_generic)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return analyzer(str(file_path), content)
        except Exception as e:
            logger.error(f"Failed to analyze {file_path}: {e}")
            return [], []
    
    def _analyze_python(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """Python 파일 분석"""
        elements = []
        relations = []
        
        try:
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    element = self._create_function_element(node, file_path)
                    elements.append(element)
                    
                    # 함수 호출 관계 분석
                    for child in ast.walk(node):
                        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                            relation = CodeRelation(
                                source_id=element.id,
                                target_id=f"{file_path}::{child.func.id}",
                                relation_type=RelationType.CALLS
                            )
                            relations.append(relation)
                
                elif isinstance(node, ast.ClassDef):
                    element = self._create_class_element(node, file_path)
                    elements.append(element)
                    
                    # 상속 관계 분석
                    for base in node.bases:
                        if isinstance(base, ast.Name):
                            relation = CodeRelation(
                                source_id=element.id,
                                target_id=f"{file_path}::{base.id}",
                                relation_type=RelationType.INHERITS
                            )
                            relations.append(relation)
                
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    import_relations = self._analyze_imports(node, file_path)
                    relations.extend(import_relations)
        
        except SyntaxError as e:
            logger.warning(f"Syntax error in {file_path}: {e}")
        
        return elements, relations
    
    def _create_function_element(self, node: ast.FunctionDef, file_path: str) -> CodeElement:
        """함수 요소 생성"""
        element_id = f"{file_path}::{node.name}"
        
        # 함수 시그니처 생성
        args = [arg.arg for arg in node.args.args]
        signature = f"def {node.name}({', '.join(args)})"
        
        # 독스트링 추출
        docstring = ast.get_docstring(node) or ""
        
        # 복잡도 계산 (간단한 버전)
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For)):
                complexity += 1
        
        location = CodeLocation(
            file_path=file_path,
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno)
        )
        
        return CodeElement(
            id=element_id,
            name=node.name,
            type=ContextType.FUNCTION,
            location=location,
            signature=signature,
            docstring=docstring,
            complexity=complexity,
            metadata={
                'is_async': isinstance(node, ast.AsyncFunctionDef),
                'decorators': [d.id if isinstance(d, ast.Name) else str(d) for d in node.decorator_list]
            }
        )
    
    def _create_class_element(self, node: ast.ClassDef, file_path: str) -> CodeElement:
        """클래스 요소 생성"""
        element_id = f"{file_path}::{node.name}"
        
        # 클래스 시그니처 생성
        bases = [base.id if isinstance(base, ast.Name) else str(base) for base in node.bases]
        signature = f"class {node.name}"
        if bases:
            signature += f"({', '.join(bases)})"
        
        # 독스트링 추출
        docstring = ast.get_docstring(node) or ""
        
        location = CodeLocation(
            file_path=file_path,
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno)
        )
        
        # 메서드 수집
        methods = []
        for child in node.body:
            if isinstance(child, ast.FunctionDef):
                methods.append(child.name)
        
        return CodeElement(
            id=element_id,
            name=node.name,
            type=ContextType.CLASS,
            location=location,
            signature=signature,
            docstring=docstring,
            metadata={
                'bases': bases,
                'methods': methods,
                'decorators': [d.id if isinstance(d, ast.Name) else str(d) for d in node.decorator_list]
            }
        )
    
    def _analyze_imports(self, node: Union[ast.Import, ast.ImportFrom], file_path: str) -> List[CodeRelation]:
        """임포트 분석"""
        relations = []
        
        if isinstance(node, ast.Import):
            for alias in node.names:
                relation = CodeRelation(
                    source_id=file_path,
                    target_id=alias.name,
                    relation_type=RelationType.IMPORTS,
                    metadata={'alias': alias.asname}
                )
                relations.append(relation)
        
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                relation = CodeRelation(
                    source_id=file_path,
                    target_id=f"{module}.{alias.name}",
                    relation_type=RelationType.IMPORTS,
                    metadata={'module': module, 'alias': alias.asname}
                )
                relations.append(relation)
        
        return relations
    
    def _analyze_javascript(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """JavaScript 파일 분석 (정규식 기반)"""
        elements = []
        relations = []
        lines = content.split('\n')
        
        # 함수 패턴
        function_patterns = [
            re.compile(r'function\s+(\w+)\s*\(([^)]*)\)'),
            re.compile(r'const\s+(\w+)\s*=\s*function\s*\(([^)]*)\)'),
            re.compile(r'const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>'),
        ]
        
        # 클래스 패턴
        class_pattern = re.compile(r'class\s+(\w+)(?:\s+extends\s+(\w+))?')
        
        for i, line in enumerate(lines, 1):
            # 함수 탐지
            for pattern in function_patterns:
                match = pattern.search(line)
                if match:
                    func_name = match.group(1)
                    params = match.group(2) if len(match.groups()) > 1 else ""
                    
                    element = CodeElement(
                        id=f"{file_path}::{func_name}",
                        name=func_name,
                        type=ContextType.FUNCTION,
                        location=CodeLocation(file_path, i, i),
                        signature=f"function {func_name}({params})",
                        metadata={'language': 'javascript'}
                    )
                    elements.append(element)
                    break
            
            # 클래스 탐지
            class_match = class_pattern.search(line)
            if class_match:
                class_name = class_match.group(1)
                extends = class_match.group(2) if len(class_match.groups()) > 1 else None
                
                element = CodeElement(
                    id=f"{file_path}::{class_name}",
                    name=class_name,
                    type=ContextType.CLASS,
                    location=CodeLocation(file_path, i, i),
                    signature=f"class {class_name}",
                    metadata={'language': 'javascript', 'extends': extends}
                )
                elements.append(element)
                
                if extends:
                    relation = CodeRelation(
                        source_id=element.id,
                        target_id=f"{file_path}::{extends}",
                        relation_type=RelationType.INHERITS
                    )
                    relations.append(relation)
        
        return elements, relations
    
    def _analyze_typescript(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """TypeScript 파일 분석"""
        # JavaScript 분석을 기반으로 TypeScript 특화 기능 추가
        elements, relations = self._analyze_javascript(file_path, content)
        
        # TypeScript 인터페이스 분석
        interface_pattern = re.compile(r'interface\s+(\w+)')
        lines = content.split('\n')
        
        for i, line in enumerate(lines, 1):
            match = interface_pattern.search(line)
            if match:
                interface_name = match.group(1)
                element = CodeElement(
                    id=f"{file_path}::{interface_name}",
                    name=interface_name,
                    type=ContextType.CLASS,  # 인터페이스를 클래스 타입으로 분류
                    location=CodeLocation(file_path, i, i),
                    signature=f"interface {interface_name}",
                    metadata={'language': 'typescript', 'is_interface': True}
                )
                elements.append(element)
        
        return elements, relations
    
    def _analyze_java(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """Java 파일 분석"""
        elements = []
        relations = []
        lines = content.split('\n')
        
        # Java 패턴들
        class_pattern = re.compile(r'class\s+(\w+)(?:\s+extends\s+(\w+))?')
        method_pattern = re.compile(r'(public|private|protected)?\s*(static)?\s*\w+\s+(\w+)\s*\([^)]*\)')
        
        for i, line in enumerate(lines, 1):
            # 클래스 탐지
            class_match = class_pattern.search(line)
            if class_match:
                class_name = class_match.group(1)
                extends = class_match.group(2) if len(class_match.groups()) > 1 else None
                
                element = CodeElement(
                    id=f"{file_path}::{class_name}",
                    name=class_name,
                    type=ContextType.CLASS,
                    location=CodeLocation(file_path, i, i),
                    signature=f"class {class_name}",
                    metadata={'language': 'java', 'extends': extends}
                )
                elements.append(element)
                
                if extends:
                    relation = CodeRelation(
                        source_id=element.id,
                        target_id=f"{file_path}::{extends}",
                        relation_type=RelationType.INHERITS
                    )
                    relations.append(relation)
            
            # 메서드 탐지
            method_match = method_pattern.search(line)
            if method_match:
                method_name = method_match.group(3)
                visibility = method_match.group(1) or "package"
                is_static = method_match.group(2) is not None
                
                element = CodeElement(
                    id=f"{file_path}::{method_name}",
                    name=method_name,
                    type=ContextType.FUNCTION,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={
                        'language': 'java',
                        'visibility': visibility,
                        'is_static': is_static
                    }
                )
                elements.append(element)
        
        return elements, relations
    
    def _analyze_cpp(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """C++ 파일 분석"""
        elements = []
        relations = []
        lines = content.split('\n')
        
        # C++ 패턴들
        class_pattern = re.compile(r'class\s+(\w+)(?:\s*:\s*public\s+(\w+))?')
        function_pattern = re.compile(r'(\w+)\s+(\w+)\s*\([^)]*\)\s*[{;]')
        
        for i, line in enumerate(lines, 1):
            # 클래스 탐지
            class_match = class_pattern.search(line)
            if class_match:
                class_name = class_match.group(1)
                inherits = class_match.group(2) if len(class_match.groups()) > 1 else None
                
                element = CodeElement(
                    id=f"{file_path}::{class_name}",
                    name=class_name,
                    type=ContextType.CLASS,
                    location=CodeLocation(file_path, i, i),
                    signature=f"class {class_name}",
                    metadata={'language': 'cpp', 'inherits': inherits}
                )
                elements.append(element)
                
                if inherits:
                    relation = CodeRelation(
                        source_id=element.id,
                        target_id=f"{file_path}::{inherits}",
                        relation_type=RelationType.INHERITS
                    )
                    relations.append(relation)
            
            # 함수 탐지
            func_match = function_pattern.search(line)
            if func_match and not line.strip().startswith('//'):
                return_type = func_match.group(1)
                func_name = func_match.group(2)
                
                element = CodeElement(
                    id=f"{file_path}::{func_name}",
                    name=func_name,
                    type=ContextType.FUNCTION,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={'language': 'cpp', 'return_type': return_type}
                )
                elements.append(element)
        
        return elements, relations
    
    def _analyze_go(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """Go 파일 분석"""
        elements = []
        relations = []
        lines = content.split('\n')
        
        # Go 패턴들
        func_pattern = re.compile(r'func\s+(\w+)\s*\([^)]*\)')
        struct_pattern = re.compile(r'type\s+(\w+)\s+struct')
        
        for i, line in enumerate(lines, 1):
            # 함수 탐지
            func_match = func_pattern.search(line)
            if func_match:
                func_name = func_match.group(1)
                
                element = CodeElement(
                    id=f"{file_path}::{func_name}",
                    name=func_name,
                    type=ContextType.FUNCTION,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={'language': 'go'}
                )
                elements.append(element)
            
            # 구조체 탐지
            struct_match = struct_pattern.search(line)
            if struct_match:
                struct_name = struct_match.group(1)
                
                element = CodeElement(
                    id=f"{file_path}::{struct_name}",
                    name=struct_name,
                    type=ContextType.CLASS,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={'language': 'go', 'is_struct': True}
                )
                elements.append(element)
        
        return elements, relations
    
    def _analyze_rust(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """Rust 파일 분석"""
        elements = []
        relations = []
        lines = content.split('\n')
        
        # Rust 패턴들
        fn_pattern = re.compile(r'fn\s+(\w+)\s*\([^)]*\)')
        struct_pattern = re.compile(r'struct\s+(\w+)')
        impl_pattern = re.compile(r'impl\s+(\w+)')
        
        for i, line in enumerate(lines, 1):
            # 함수 탐지
            fn_match = fn_pattern.search(line)
            if fn_match:
                fn_name = fn_match.group(1)
                
                element = CodeElement(
                    id=f"{file_path}::{fn_name}",
                    name=fn_name,
                    type=ContextType.FUNCTION,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={'language': 'rust'}
                )
                elements.append(element)
            
            # 구조체 탐지
            struct_match = struct_pattern.search(line)
            if struct_match:
                struct_name = struct_match.group(1)
                
                element = CodeElement(
                    id=f"{file_path}::{struct_name}",
                    name=struct_name,
                    type=ContextType.CLASS,
                    location=CodeLocation(file_path, i, i),
                    signature=line.strip(),
                    metadata={'language': 'rust', 'is_struct': True}
                )
                elements.append(element)
            
            # impl 블록 탐지
            impl_match = impl_pattern.search(line)
            if impl_match:
                impl_name = impl_match.group(1)
                
                relation = CodeRelation(
                    source_id=f"{file_path}::impl_{impl_name}",
                    target_id=f"{file_path}::{impl_name}",
                    relation_type=RelationType.IMPLEMENTS
                )
                relations.append(relation)
        
        return elements, relations
    
    def _analyze_generic(self, file_path: str, content: str) -> Tuple[List[CodeElement], List[CodeRelation]]:
        """일반 파일 분석"""
        elements = []
        relations = []
        
        # 파일 자체를 하나의 요소로 등록
        element = CodeElement(
            id=file_path,
            name=Path(file_path).name,
            type=ContextType.FILE,
            location=CodeLocation(file_path, 1, len(content.split('\n'))),
            signature=f"file: {Path(file_path).name}",
            metadata={
                'size': len(content),
                'lines': len(content.split('\n')),
                'extension': Path(file_path).suffix
            }
        )
        elements.append(element)
        
        return elements, relations


class ProjectAnalyzer:
    """프로젝트 분석기"""
    
    def __init__(self):
        self.file_analyzer = FileAnalyzer()
        self.supported_project_files = {
            'package.json': self._analyze_nodejs_project,
            'requirements.txt': self._analyze_python_project,
            'Pipfile': self._analyze_python_project,
            'pyproject.toml': self._analyze_python_project,
            'pom.xml': self._analyze_maven_project,
            'build.gradle': self._analyze_gradle_project,
            'Cargo.toml': self._analyze_rust_project,
            'go.mod': self._analyze_go_project,
            'composer.json': self._analyze_php_project,
        }
    
    def analyze_project_structure(self, project_path: str) -> ProjectContext:
        """프로젝트 구조 분석"""
        project_path = Path(project_path)
        
        # 프로젝트 타입 감지
        project_info = self._detect_project_type(project_path)
        
        # 진입점 찾기
        entry_points = self._find_entry_points(project_path, project_info['language'])
        
        # 테스트 디렉토리 찾기
        test_dirs = self._find_test_directories(project_path)
        
        # 빌드 파일 찾기
        build_files = self._find_build_files(project_path)
        
        return ProjectContext(
            project_path=str(project_path),
            name=project_path.name,
            language=project_info['language'],
            framework=project_info.get('framework', ''),
            version=project_info.get('version', ''),
            dependencies=project_info.get('dependencies', []),
            entry_points=entry_points,
            test_directories=test_dirs,
            build_files=build_files,
            metadata=project_info
        )
    
    def _detect_project_type(self, project_path: Path) -> Dict[str, Any]:
        """프로젝트 타입 감지"""
        project_info = {
            'language': 'unknown',
            'framework': '',
            'version': '',
            'dependencies': []
        }
        
        # 프로젝트 파일 확인
        for filename, analyzer in self.supported_project_files.items():
            project_file = project_path / filename
            if project_file.exists():
                try:
                    info = analyzer(project_file)
                    project_info.update(info)
                    break
                except Exception as e:
                    logger.warning(f"Failed to analyze {filename}: {e}")
        
        # 파일 확장자로 언어 추정
        if project_info['language'] == 'unknown':
            language_stats = defaultdict(int)
            for file_path in project_path.rglob('*'):
                if file_path.is_file() and not self._should_skip_file(file_path):
                    ext = file_path.suffix.lower()
                    if ext in ['.py']:
                        language_stats['python'] += 1
                    elif ext in ['.js', '.jsx']:
                        language_stats['javascript'] += 1
                    elif ext in ['.ts', '.tsx']:
                        language_stats['typescript'] += 1
                    elif ext in ['.java']:
                        language_stats['java'] += 1
                    elif ext in ['.cpp', '.cc', '.cxx']:
                        language_stats['cpp'] += 1
                    elif ext in ['.c']:
                        language_stats['c'] += 1
                    elif ext in ['.go']:
                        language_stats['go'] += 1
                    elif ext in ['.rs']:
                        language_stats['rust'] += 1
            
            if language_stats:
                project_info['language'] = max(language_stats.items(), key=lambda x: x[1])[0]
        
        return project_info
    
    def _analyze_nodejs_project(self, package_json: Path) -> Dict[str, Any]:
        """Node.js 프로젝트 분석"""
        with open(package_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 프레임워크 감지
        framework = ''
        dependencies = data.get('dependencies', {})
        if 'react' in dependencies:
            framework = 'react'
        elif 'vue' in dependencies:
            framework = 'vue'
        elif 'angular' in dependencies:
            framework = 'angular'
        elif 'express' in dependencies:
            framework = 'express'
        elif 'next' in dependencies:
            framework = 'next.js'
        
        return {
            'language': 'javascript',
            'framework': framework,
            'version': data.get('version', ''),
            'dependencies': list(dependencies.keys()),
            'scripts': data.get('scripts', {}),
            'main': data.get('main', ''),
            'author': data.get('author', ''),
            'description': data.get('description', '')
        }
    
    def _analyze_python_project(self, project_file: Path) -> Dict[str, Any]:
        """Python 프로젝트 분석"""
        if project_file.name == 'requirements.txt':
            with open(project_file, 'r', encoding='utf-8') as f:
                deps = [line.strip().split('==')[0] for line in f if line.strip() and not line.startswith('#')]
        elif project_file.name == 'Pipfile':
            # Pipfile은 TOML 형식이지만 간단히 파싱
            with open(project_file, 'r', encoding='utf-8') as f:
                content = f.read()
                deps = re.findall(r'(\w+)\s*=', content)
        else:
            deps = []
        
        # 프레임워크 감지
        framework = ''
        if 'django' in deps:
            framework = 'django'
        elif 'flask' in deps:
            framework = 'flask'
        elif 'fastapi' in deps:
            framework = 'fastapi'
        elif 'tornado' in deps:
            framework = 'tornado'
        
        return {
            'language': 'python',
            'framework': framework,
            'dependencies': deps
        }
    
    def _analyze_maven_project(self, pom_xml: Path) -> Dict[str, Any]:
        """Maven 프로젝트 분석"""
        # 간단한 XML 파싱 (실제로는 xml.etree.ElementTree 사용 권장)
        with open(pom_xml, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 간단한 정규식으로 정보 추출
        version_match = re.search(r'<version>([^<]+)</version>', content)
        artifact_match = re.search(r'<artifactId>([^<]+)</artifactId>', content)
        
        return {
            'language': 'java',
            'framework': 'maven',
            'version': version_match.group(1) if version_match else '',
            'artifact_id': artifact_match.group(1) if artifact_match else ''
        }
    
    def _analyze_gradle_project(self, build_gradle: Path) -> Dict[str, Any]:
        """Gradle 프로젝트 분석"""
        with open(build_gradle, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Spring Boot 감지
        framework = ''
        if 'spring-boot' in content:
            framework = 'spring-boot'
        elif 'android' in content:
            framework = 'android'
        
        return {
            'language': 'java',
            'framework': framework
        }
    
    def _analyze_rust_project(self, cargo_toml: Path) -> Dict[str, Any]:
        """Rust 프로젝트 분석"""
        # 간단한 TOML 파싱
        with open(cargo_toml, 'r', encoding='utf-8') as f:
            content = f.read()
        
        name_match = re.search(r'name\s*=\s*"([^"]+)"', content)
        version_match = re.search(r'version\s*=\s*"([^"]+)"', content)
        
        return {
            'language': 'rust',
            'name': name_match.group(1) if name_match else '',
            'version': version_match.group(1) if version_match else ''
        }
    
    def _analyze_go_project(self, go_mod: Path) -> Dict[str, Any]:
        """Go 프로젝트 분석"""
        with open(go_mod, 'r', encoding='utf-8') as f:
            content = f.read()
        
        module_match = re.search(r'module\s+([^\s]+)', content)
        go_version_match = re.search(r'go\s+([\d.]+)', content)
        
        return {
            'language': 'go',
            'module': module_match.group(1) if module_match else '',
            'go_version': go_version_match.group(1) if go_version_match else ''
        }
    
    def _analyze_php_project(self, composer_json: Path) -> Dict[str, Any]:
        """PHP 프로젝트 분석"""
        with open(composer_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        dependencies = data.get('require', {})
        framework = ''
        
        if 'laravel/framework' in dependencies:
            framework = 'laravel'
        elif 'symfony/symfony' in dependencies:
            framework = 'symfony'
        elif 'codeigniter/codeigniter' in dependencies:
            framework = 'codeigniter'
        
        return {
            'language': 'php',
            'framework': framework,
            'version': data.get('version', ''),
            'dependencies': list(dependencies.keys())
        }
    
    def _find_entry_points(self, project_path: Path, language: str) -> List[str]:
        """진입점 찾기"""
        entry_points = []
        
        # 언어별 진입점 패턴
        patterns = {
            'python': ['main.py', 'app.py', '__main__.py', 'manage.py'],
            'javascript': ['index.js', 'app.js', 'main.js', 'server.js'],
            'typescript': ['index.ts', 'app.ts', 'main.ts', 'server.ts'],
            'java': ['Main.java', 'Application.java'],
            'go': ['main.go'],
            'rust': ['main.rs'],
            'cpp': ['main.cpp', 'main.cc'],
            'c': ['main.c']
        }
        
        if language in patterns:
            for pattern in patterns[language]:
                for file_path in project_path.rglob(pattern):
                    if not self._should_skip_file(file_path):
                        entry_points.append(str(file_path.relative_to(project_path)))
        
        return entry_points
    
    def _find_test_directories(self, project_path: Path) -> List[str]:
        """테스트 디렉토리 찾기"""
        test_dirs = []
        test_patterns = ['test', 'tests', 'spec', 'specs', '__tests__']
        
        for pattern in test_patterns:
            for test_dir in project_path.rglob(pattern):
                if test_dir.is_dir() and not self._should_skip_file(test_dir):
                    test_dirs.append(str(test_dir.relative_to(project_path)))
        
        return test_dirs
    
    def _find_build_files(self, project_path: Path) -> List[str]:
        """빌드 파일 찾기"""
        build_files = []
        build_patterns = [
            'Makefile', 'CMakeLists.txt', 'build.gradle', 'pom.xml',
            'package.json', 'Cargo.toml', 'go.mod', 'requirements.txt',
            'Dockerfile', 'docker-compose.yml'
        ]
        
        for pattern in build_patterns:
            for build_file in project_path.rglob(pattern):
                if build_file.is_file():
                    build_files.append(str(build_file.relative_to(project_path)))
        
        return build_files
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """파일을 건너뛸지 판단"""
        skip_patterns = [
            '.git', '.svn', '.hg',
            'node_modules', '__pycache__', '.pytest_cache',
            'venv', '.venv', 'env', '.env',
            'dist', 'build', 'target',
            '.idea', '.vscode', '.vs',
            '*.pyc', '*.pyo', '*.pyd',
            '*.class', '*.jar', '*.war',
            '*.o', '*.so', '*.dll', '*.exe'
        ]
        
        path_str = str(file_path).lower()
        return any(pattern.lower() in path_str for pattern in skip_patterns)


class ContextManager:
    """컨텍스트 관리자 - 메인 클래스"""
    
    def __init__(self, project_path: str, db_path: str = None):
        self.project_path = Path(project_path)
        self.db_path = db_path or str(self.project_path / '.context_cache.db')
        
        # 컴포넌트 초기화
        self.knowledge_graph = KnowledgeGraph()
        self.database = ContextDatabase(self.db_path)
        self.search_engine = SemanticSearchEngine()
        self.file_analyzer = FileAnalyzer()
        self.project_analyzer = ProjectAnalyzer()
        
        # 캐시 및 설정
        self.analysis_cache = {}
        self.last_scan_time = None
        self._lock = threading.RLock()
        
        # 프로젝트 컨텍스트 로드
        self.project_context = None
        self._load_or_create_project_context()
    
    def _load_or_create_project_context(self):
        """프로젝트 컨텍스트 로드 또는 생성"""
        try:
            # 캐시에서 프로젝트 컨텍스트 로드 시도
            cache_file = self.project_path / '.project_context.json'
            if cache_file.exists():
                with open(cache_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.project_context = ProjectContext(**data)
            else:
                # 새로 분석
                self.project_context = self.project_analyzer.analyze_project_structure(str(self.project_path))
                self._save_project_context()
        except Exception as e:
            logger.error(f"Failed to load project context: {e}")
            # 기본 컨텍스트 생성
            self.project_context = ProjectContext(
                project_path=str(self.project_path),
                name=self.project_path.name,
                language='unknown'
            )
    
    def _save_project_context(self):
        """프로젝트 컨텍스트 저장"""
        try:
            cache_file = self.project_path / '.project_context.json'
            with open(cache_file, 'w', encoding='utf-8') as f:
                # datetime 객체를 문자열로 변환
                data = asdict(self.project_context)
                data['last_analyzed'] = data['last_analyzed'].isoformat()
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save project context: {e}")
    
    @cache_result(ttl=1800)  # 30분 캐시
    def extract_code_context(self, file_path: str) -> Dict[str, Any]:
        """파일에서 코드 컨텍스트 추출"""
        try:
            elements, relations = self.file_analyzer.analyze_file(file_path)
            
            # 데이터베이스에 저장
            for element in elements:
                self.database.save_element(element)
                self.knowledge_graph.add_element(element)
            
            for relation in relations:
                self.database.save_relation(relation)
                self.knowledge_graph.add_relation(relation)
            
            return {
                'file_path': file_path,
                'elements': [asdict(e) for e in elements],
                'relations': [asdict(r) for r in relations],
                'analysis_time': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Failed to extract context from {file_path}: {e}")
            return {'error': str(e), 'file_path': file_path}
    
    async def build_project_knowledge_graph(self) -> KnowledgeGraph:
        """프로젝트 지식 그래프 구축"""
        logger.info("Building project knowledge graph...")
        
        # 모든 코드 파일 찾기
        code_files = []
        for pattern in ['*.py', '*.js', '*.ts', '*.jsx', '*.tsx', '*.java', '*.cpp', '*.c', '*.go', '*.rs']:
            code_files.extend(self.project_path.rglob(pattern))
        
        # 스킵할 파일 필터링
        code_files = [f for f in code_files if not self.project_analyzer._should_skip_file(f)]
        
        logger.info(f"Found {len(code_files)} code files to analyze")
        
        # 병렬 처리로 파일 분석
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(self.extract_code_context, str(f)) for f in code_files]
            
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if 'error' not in result:
                        logger.debug(f"Analyzed {result['file_path']}")
                except Exception as e:
                    logger.error(f"Failed to analyze file: {e}")
        
        # 검색 엔진 업데이트
        all_elements = self.database.query_elements()
        self.search_engine.add_documents(all_elements)
        
        self.last_scan_time = datetime.now()
        logger.info("Project knowledge graph built successfully")
        
        return self.knowledge_graph
    
    def find_related_code(self, query: str, max_results: int = 10) -> List[ContextResult]:
        """관련 코드 스니펫 검색"""
        # 의미론적 검색
        search_results = self.search_engine.search(query, max_results, min_similarity=0.1)
        
        context_results = []
        for element, score in search_results:
            # 관련 요소 찾기
            related_elements = self.knowledge_graph.get_related_elements(
                element.id, max_depth=2
            )
            
            # 컨텍스트 경로 구성
            context_path = self._build_context_path(element)
            
            result = ContextResult(
                element=element,
                relevance_score=score,
                context_path=context_path,
                related_elements=related_elements[:5]  # 상위 5개만
            )
            context_results.append(result)
        
        return context_results
    
    def _build_context_path(self, element: CodeElement) -> List[str]:
        """컨텍스트 경로 구성"""
        path_parts = []
        
        # 파일 경로
        rel_path = Path(element.location.file_path).relative_to(self.project_path)
        path_parts.append(str(rel_path))
        
        # 요소 타입과 이름
        if element.type != ContextType.FILE:
            path_parts.append(f"{element.type.value}:{element.name}")
        
        return path_parts
    
    def track_code_evolution(self, file_path: str) -> List[ChangeEvent]:
        """코드 변화 이력 추적"""
        # Git 로그 분석 (간단한 버전)
        changes = []
        
        try:
            import subprocess
            
            # Git 로그 가져오기
            result = subprocess.run(
                ['git', 'log', '--oneline', '--follow', file_path],
                cwd=self.project_path,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split(' ', 1)
                        if len(parts) == 2:
                            commit_hash, message = parts
                            
                            change = ChangeEvent(
                                id=f"{file_path}:{commit_hash}",
                                element_id=file_path,
                                change_type=ChangeType.MODIFIED,
                                commit_hash=commit_hash,
                                metadata={'message': message}
                            )
                            changes.append(change)
            
        except Exception as e:
            logger.warning(f"Failed to get git history for {file_path}: {e}")
        
        return changes
    
    def get_context_for_ai(self, query: str, max_context_size: int = 8000) -> Dict[str, Any]:
        """AI를 위한 컨텍스트 생성"""
        # 관련 코드 검색
        related_code = self.find_related_code(query, max_results=5)
        
        # 컨텍스트 구성
        context = {
            'project_info': {
                'name': self.project_context.name,
                'language': self.project_context.language,
                'framework': self.project_context.framework,
                'entry_points': self.project_context.entry_points
            },
            'query': query,
            'related_elements': [],
            'code_snippets': [],
            'dependencies': [],
            'suggestions': []
        }
        
        current_size = len(json.dumps(context))
        
        for result in related_code:
            element = result.element
            
            # 코드 스니펫 읽기
            try:
                with open(element.location.file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    start_line = max(0, element.location.line_start - 3)  # 앞뒤 3줄 포함
                    end_line = min(len(lines), element.location.line_end + 3)
                    snippet = ''.join(lines[start_line:end_line])
                
                snippet_info = {
                    'element_id': element.id,
                    'name': element.name,
                    'type': element.type.value,
                    'file_path': str(Path(element.location.file_path).relative_to(self.project_path)),
                    'line_range': [element.location.line_start, element.location.line_end],
                    'signature': element.signature,
                    'docstring': element.docstring,
                    'code': snippet,
                    'relevance_score': result.relevance_score,
                    'context_path': result.context_path
                }
                
                # 크기 제한 확인
                snippet_size = len(json.dumps(snippet_info))
                if current_size + snippet_size > max_context_size:
                    break
                
                context['code_snippets'].append(snippet_info)
                current_size += snippet_size
                
                # 관련 요소 정보 추가
                element_info = {
                    'id': element.id,
                    'name': element.name,
                    'type': element.type.value,
                    'complexity': element.complexity,
                    'metadata': element.metadata
                }
                context['related_elements'].append(element_info)
                
                # 의존성 정보 추가
                dependencies = self.knowledge_graph.get_related_elements(
                    element.id, 
                    [RelationType.IMPORTS, RelationType.DEPENDS_ON], 
                    max_depth=1
                )
                
                for dep in dependencies[:3]:  # 최대 3개
                    dep_info = {
                        'name': dep.name,
                        'type': dep.type.value,
                        'file_path': str(Path(dep.location.file_path).relative_to(self.project_path))
                    }
                    if dep_info not in context['dependencies']:
                        context['dependencies'].append(dep_info)
                
            except Exception as e:
                logger.warning(f"Failed to read code snippet for {element.id}: {e}")
        
        # AI 제안사항 생성
        context['suggestions'] = self._generate_ai_suggestions(query, related_code)
        
        return context
    
    def _generate_ai_suggestions(self, query: str, related_code: List[ContextResult]) -> List[str]:
        """AI 제안사항 생성"""
        suggestions = []
        
        # 쿼리 분석
        query_lower = query.lower()
        
        if 'test' in query_lower:
            suggestions.append("Consider writing unit tests for the related functions")
            suggestions.append("Check existing test coverage in the test directories")
        
        if 'refactor' in query_lower:
            suggestions.append("Look for code duplication in related functions")
            suggestions.append("Consider extracting common functionality into utilities")
        
        if 'optimize' in query_lower or 'performance' in query_lower:
            suggestions.append("Profile the code to identify bottlenecks")
            suggestions.append("Consider caching mechanisms for frequently called functions")
        
        if 'bug' in query_lower or 'error' in query_lower:
            suggestions.append("Check error handling in related functions")
            suggestions.append("Review recent changes that might have introduced the issue")
        
        # 관련 코드 기반 제안
        if related_code:
            high_complexity_elements = [
                r.element for r in related_code if r.element.complexity > 5
            ]
            
            if high_complexity_elements:
                suggestions.append("Some related functions have high complexity - consider refactoring")
            
            # 언어별 제안
            languages = set(r.element.metadata.get('language', '') for r in related_code)
            for lang in languages:
                if lang == 'python':
                    suggestions.append("Consider using type hints for better code clarity")
                elif lang == 'javascript':
                    suggestions.append("Consider using TypeScript for better type safety")
        
        return suggestions[:5]  # 최대 5개 제안
    
    def update_context(self, file_path: str, change_type: ChangeType = ChangeType.MODIFIED):
        """컨텍스트 업데이트"""
        try:
            # 기존 요소들 제거
            old_elements = self.database.query_elements(file_path=file_path)
            for element in old_elements:
                if element.id in self.knowledge_graph.elements:
                    del self.knowledge_graph.elements[element.id]
                    if self.knowledge_graph.graph.has_node(element.id):
                        self.knowledge_graph.graph.remove_node(element.id)
            
            # 새로운 분석 수행
            if change_type != ChangeType.DELETED:
                context = self.extract_code_context(file_path)
                if 'error' not in context:
                    logger.info(f"Updated context for {file_path}")
            
            # 변경 이벤트 기록
            change_event = ChangeEvent(
                id=f"{file_path}:{datetime.now().timestamp()}",
                element_id=file_path,
                change_type=change_type,
                timestamp=datetime.now()
            )
            self.database.save_change(change_event)
            
        except Exception as e:
            logger.error(f"Failed to update context for {file_path}: {e}")
    
    def export_context(self, output_path: str = None) -> str:
        """컨텍스트 내보내기"""
        if output_path is None:
            output_path = str(self.project_path / 'context_export.json')
        
        export_data = {
            'project_context': asdict(self.project_context),
            'knowledge_graph': self.knowledge_graph.export_to_dict(),
            'export_time': datetime.now().isoformat(),
            'version': '1.0'
        }
        
        # datetime 객체를 문자열로 변환
        def serialize_datetime(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, default=serialize_datetime)
        
        # 압축 버전도 생성
        compressed_path = output_path.replace('.json', '.json.gz')
        with gzip.open(compressed_path, 'wt', encoding='utf-8') as f:
            json.dump(export_data, f, default=serialize_datetime)
        
        logger.info(f"Context exported to {output_path}")
        return output_path
    
    def import_context(self, import_path: str) -> bool:
        """컨텍스트 가져오기"""
        try:
            # 압축 파일 확인
            if import_path.endswith('.gz'):
                with gzip.open(import_path, 'rt', encoding='utf-8') as f:
                    export_data = json.load(f)
            else:
                with open(import_path, 'r', encoding='utf-8') as f:
                    export_data = json.load(f)
            
            # 프로젝트 컨텍스트 복원
            project_data = export_data['project_context']
            project_data['last_analyzed'] = datetime.fromisoformat(project_data['last_analyzed'])
            self.project_context = ProjectContext(**project_data)
            
            # 지식 그래프 복원
            self.knowledge_graph.import_from_dict(export_data['knowledge_graph'])
            
            logger.info(f"Context imported from {import_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to import context from {import_path}: {e}")
            return False
    
    def get_project_statistics(self) -> Dict[str, Any]:
        """프로젝트 통계 반환"""
        all_elements = self.database.query_elements()
        
        stats = {
            'total_elements': len(all_elements),
            'by_type': defaultdict(int),
            'by_language': defaultdict(int),
            'complexity_distribution': defaultdict(int),
            'total_relations': len(self.knowledge_graph.relations),
            'centrality_scores': self.knowledge_graph.calculate_centrality(),
            'project_info': asdict(self.project_context)
        }
        
        for element in all_elements:
            stats['by_type'][element.type.value] += 1
            
            language = element.metadata.get('language', 'unknown')
            stats['by_language'][language] += 1
            
            # 복잡도 분포
            complexity_range = f"{(element.complexity // 5) * 5}-{(element.complexity // 5) * 5 + 4}"
            stats['complexity_distribution'][complexity_range] += 1
        
        # 상위 중심성 요소들
        if stats['centrality_scores']:
            top_central = sorted(
                stats['centrality_scores'].items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:10]
            
            stats['most_central_elements'] = [
                {
                    'element_id': elem_id,
                    'centrality_score': score,
                    'element_name': self.knowledge_graph.get_element(elem_id).name if self.knowledge_graph.get_element(elem_id) else 'Unknown'
                }
                for elem_id, score in top_central
            ]
        
        return dict(stats)
    
    def cleanup_old_data(self, days: int = 30):
        """오래된 데이터 정리"""
        cutoff_time = datetime.now() - timedelta(days=days)
        
        # SQLite에서 오래된 변경 기록 삭제
        with sqlite3.connect(self.database.db_path) as conn:
            conn.execute(
                "DELETE FROM changes WHERE timestamp < ?",
                (cutoff_time,)
            )
            conn.commit()
        
        logger.info(f"Cleaned up data older than {days} days")
    
    def __enter__(self):
        """컨텍스트 매니저 진입"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """컨텍스트 매니저 종료"""
        # 정리 작업
        if hasattr(self, 'database'):
            # 최종 상태 저장
            self._save_project_context()


# 편의 함수들
def create_context_manager(project_path: str, db_path: str = None) -> ContextManager:
    """컨텍스트 매니저 생성"""
    return ContextManager(project_path, db_path)

async def quick_project_analysis(project_path: str) -> Dict[str, Any]:
    """빠른 프로젝트 분석"""
    with create_context_manager(project_path) as cm:
        await cm.build_project_knowledge_graph()
        return cm.get_project_statistics()

def search_code_context(project_path: str, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """코드 컨텍스트 검색"""
    with create_context_manager(project_path) as cm:
        results = cm.find_related_code(query, max_results)
        return [asdict(result) for result in results]

def get_ai_context(project_path: str, query: str, max_size: int = 8000) -> Dict[str, Any]:
    """AI를 위한 컨텍스트 반환"""
    with create_context_manager(project_path) as cm:
        return cm.get_context_for_ai(query, max_size)

# 사용 예제
if __name__ == "__main__":
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description='Context Management for AI Assisted Coding')
    parser.add_argument('project_path', help='Path to the project')
    parser.add_argument('--build-graph', action='store_true', help='Build knowledge graph')
    parser.add_argument('--search', help='Search for related code')
    parser.add_argument('--export', help='Export context to file')
    parser.add_argument('--import', dest='import_file', help='Import context from file')
    parser.add_argument('--stats', action='store_true', help='Show project statistics')
    parser.add_argument('--cleanup', type=int, help='Cleanup data older than N days')
    
    args = parser.parse_args()
    
    if not Path(args.project_path).exists():
        print(f"Error: Project path {args.project_path} does not exist")
        sys.exit(1)
    
    async def main():
        with create_context_manager(args.project_path) as cm:
            if args.build_graph:
                print("Building project knowledge graph...")
                await cm.build_project_knowledge_graph()
                print("Knowledge graph built successfully!")
            
            if args.search:
                print(f"Searching for: {args.search}")
                results = cm.find_related_code(args.search)
                for i, result in enumerate(results[:5], 1):
                    element = result.element
                    print(f"\n{i}. {element.name} ({element.type.value})")
                    print(f"   File: {element.location.file_path}")
                    print(f"   Lines: {element.location.line_start}-{element.location.line_end}")
                    print(f"   Relevance: {result.relevance_score:.3f}")
                    if element.docstring:
                        print(f"   Description: {element.docstring[:100]}...")
            
            if args.export:
                output_path = cm.export_context(args.export)
                print(f"Context exported to {output_path}")
            
            if args.import_file:
                success = cm.import_context(args.import_file)
                print(f"Context import {'successful' if success else 'failed'}")
            
            if args.stats:
                stats = cm.get_project_statistics()
                print("\nProject Statistics:")
                print(f"Total elements: {stats['total_elements']}")
                print(f"Total relations: {stats['total_relations']}")
                print(f"Primary language: {stats['project_info']['language']}")
                print(f"Framework: {stats['project_info']['framework']}")
                
                print("\nElements by type:")
                for elem_type, count in stats['by_type'].items():
                    print(f"  {elem_type}: {count}")
                
                if 'most_central_elements' in stats:
                    print("\nMost central elements:")
                    for elem in stats['most_central_elements'][:5]:
                        print(f"  {elem['element_name']}: {elem['centrality_score']:.3f}")
            
            if args.cleanup:
                cm.cleanup_old_data(args.cleanup)
                print(f"Cleaned up data older than {args.cleanup} days")
    
    # 비동기 실행
    asyncio.run(main())