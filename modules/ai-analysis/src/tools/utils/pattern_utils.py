"""
패턴 분석 유틸리티 모듈
JavaScript tools의 패턴 매칭, 정규식, 코드 분석 기능들을 Python으로 포팅
"""

import re
import ast
from typing import List, Dict, Any, Optional, Tuple, Union
import logging
from dataclasses import dataclass
from enum import Enum


class Language(Enum):
    """지원하는 프로그래밍 언어"""
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    PYTHON = "python"
    UNKNOWN = "unknown"


@dataclass
class FunctionPattern:
    """함수 패턴 정보"""
    name: str
    signature: str
    start_line: int
    end_line: Optional[int] = None
    parameters: List[str] = None
    return_type: Optional[str] = None
    is_async: bool = False
    is_method: bool = False
    complexity: int = 1
    docstring: Optional[str] = None


@dataclass
class ClassPattern:
    """클래스 패턴 정보"""
    name: str
    signature: str
    start_line: int
    end_line: Optional[int] = None
    base_classes: List[str] = None
    methods: List[FunctionPattern] = None
    properties: List[str] = None


class PatternExtractor:
    """
    코드 패턴 추출기
    JavaScript pattern extraction 기능 포팅
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._compiled_patterns = self._compile_patterns()
    
    def _compile_patterns(self) -> Dict[Language, Dict[str, List[re.Pattern]]]:
        """정규식 패턴들을 미리 컴파일"""
        return {
            Language.JAVASCRIPT: {
                'functions': [
                    re.compile(r'function\s+(\w+)\s*\(([^)]*)\)', re.MULTILINE),
                    re.compile(r'const\s+(\w+)\s*=\s*function\s*\(([^)]*)\)', re.MULTILINE),
                    re.compile(r'const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>', re.MULTILINE),
                    re.compile(r'(\w+)\s*:\s*function\s*\(([^)]*)\)', re.MULTILINE),
                    re.compile(r'(\w+)\s*\(([^)]*)\)\s*=>', re.MULTILINE),
                    re.compile(r'async\s+function\s+(\w+)\s*\(([^)]*)\)', re.MULTILINE),
                    re.compile(r'(\w+)\s*\(([^)]*)\)\s*\{', re.MULTILINE)
                ],
                'classes': [
                    re.compile(r'class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{', re.MULTILINE)
                ]
            },
            Language.PYTHON: {
                'functions': [
                    re.compile(r'def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(.+?))?:', re.MULTILINE)
                ],
                'classes': [
                    re.compile(r'class\s+(\w+)(?:\(([^)]+)\))?:', re.MULTILINE)
                ]
            }
        }
    
    def detect_language(self, file_path: str, content: Optional[str] = None) -> Language:
        """파일 확장자나 내용으로 언어 감지"""
        if file_path.endswith(('.js', '.jsx')):
            return Language.JAVASCRIPT
        elif file_path.endswith(('.ts', '.tsx')):
            return Language.TYPESCRIPT
        elif file_path.endswith('.py'):
            return Language.PYTHON
        
        # 내용으로 추측
        if content:
            if 'def ' in content and ':' in content:
                return Language.PYTHON
            elif 'function' in content or '=>' in content:
                return Language.JAVASCRIPT
        
        return Language.UNKNOWN
    
    def extract_functions(self, content: str, language: Language, file_path: str = "") -> List[FunctionPattern]:
        """함수 패턴 추출"""
        functions = []
        
        if language == Language.PYTHON:
            functions.extend(self._extract_python_functions(content, file_path))
        elif language in [Language.JAVASCRIPT, Language.TYPESCRIPT]:
            functions.extend(self._extract_js_functions(content, file_path))
        
        return functions
    
    def _extract_python_functions(self, content: str, file_path: str) -> List[FunctionPattern]:
        """Python 함수 추출"""
        functions = []
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped.startswith('def '):
                continue
            
            # 정규식으로 함수 정보 추출
            func_pattern = self._compiled_patterns[Language.PYTHON]['functions'][0]
            match = func_pattern.search(line)
            
            if match:
                name = match.group(1)
                params_str = match.group(2) if match.group(2) else ""
                return_type = match.group(3) if len(match.groups()) > 2 and match.group(3) else None
                
                # 매개변수 파싱
                parameters = self._parse_python_parameters(params_str)
                
                # 메서드인지 확인 (들여쓰기로 판단)
                is_method = len(line) - len(line.lstrip()) > 0
                
                # 비동기 함수 확인
                is_async = 'async def' in line
                
                # docstring 추출
                docstring = self._extract_python_docstring(lines, i + 1)
                
                # 함수 끝 라인 찾기
                end_line = self._find_python_function_end(lines, i)
                
                # 복잡도 계산
                func_content = '\n'.join(lines[i:end_line+1]) if end_line else line
                complexity = self._calculate_complexity(func_content)
                
                functions.append(FunctionPattern(
                    name=name,
                    signature=line.strip(),
                    start_line=i + 1,
                    end_line=end_line + 1 if end_line else None,
                    parameters=parameters,
                    return_type=return_type,
                    is_async=is_async,
                    is_method=is_method,
                    complexity=complexity,
                    docstring=docstring
                ))
        
        return functions
    
    def _extract_js_functions(self, content: str, file_path: str) -> List[FunctionPattern]:
        """JavaScript/TypeScript 함수 추출"""
        functions = []
        lines = content.split('\n')
        
        patterns = self._compiled_patterns[Language.JAVASCRIPT]['functions']
        
        for i, line in enumerate(lines):
            for pattern in patterns:
                match = pattern.search(line)
                if match:
                    name = match.group(1)
                    params_str = match.group(2) if len(match.groups()) > 1 and match.group(2) else ""
                    
                    # 매개변수 파싱
                    parameters = self._parse_js_parameters(params_str)
                    
                    # 메서드인지 확인
                    is_method = len(line) - len(line.lstrip()) > 0
                    
                    # 비동기 함수 확인
                    is_async = 'async' in line
                    
                    # 함수 끝 라인 찾기
                    end_line = self._find_js_function_end(lines, i)
                    
                    # 복잡도 계산
                    func_content = '\n'.join(lines[i:end_line+1]) if end_line else line
                    complexity = self._calculate_complexity(func_content)
                    
                    functions.append(FunctionPattern(
                        name=name,
                        signature=line.strip(),
                        start_line=i + 1,
                        end_line=end_line + 1 if end_line else None,
                        parameters=parameters,
                        is_async=is_async,
                        is_method=is_method,
                        complexity=complexity
                    ))
                    break
        
        return functions
    
    def extract_classes(self, content: str, language: Language, file_path: str = "") -> List[ClassPattern]:
        """클래스 패턴 추출"""
        classes = []
        
        if language == Language.PYTHON:
            classes.extend(self._extract_python_classes(content, file_path))
        elif language in [Language.JAVASCRIPT, Language.TYPESCRIPT]:
            classes.extend(self._extract_js_classes(content, file_path))
        
        return classes
    
    def _extract_python_classes(self, content: str, file_path: str) -> List[ClassPattern]:
        """Python 클래스 추출"""
        classes = []
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped.startswith('class '):
                continue
            
            class_pattern = self._compiled_patterns[Language.PYTHON]['classes'][0]
            match = class_pattern.search(line)
            
            if match:
                name = match.group(1)
                base_classes_str = match.group(2) if len(match.groups()) > 1 and match.group(2) else ""
                
                # 상속 클래스 파싱
                base_classes = [cls.strip() for cls in base_classes_str.split(',')] if base_classes_str else []
                
                # 클래스 끝 라인 찾기
                end_line = self._find_python_class_end(lines, i)
                
                # 클래스 내 메서드 추출
                class_content = '\n'.join(lines[i:end_line+1]) if end_line else line
                methods = self._extract_python_functions(class_content, file_path)
                
                classes.append(ClassPattern(
                    name=name,
                    signature=line.strip(),
                    start_line=i + 1,
                    end_line=end_line + 1 if end_line else None,
                    base_classes=base_classes,
                    methods=methods
                ))
        
        return classes
    
    def _extract_js_classes(self, content: str, file_path: str) -> List[ClassPattern]:
        """JavaScript/TypeScript 클래스 추출"""
        classes = []
        lines = content.split('\n')
        
        class_pattern = self._compiled_patterns[Language.JAVASCRIPT]['classes'][0]
        
        for i, line in enumerate(lines):
            match = class_pattern.search(line)
            if match:
                name = match.group(1)
                extends_class = match.group(2) if len(match.groups()) > 1 and match.group(2) else None
                implements_str = match.group(3) if len(match.groups()) > 2 and match.group(3) else None
                
                # 상속/구현 클래스 파싱
                base_classes = []
                if extends_class:
                    base_classes.append(extends_class)
                if implements_str:
                    base_classes.extend([cls.strip() for cls in implements_str.split(',')])
                
                # 클래스 끝 라인 찾기
                end_line = self._find_js_class_end(lines, i)
                
                # 클래스 내 메서드 추출
                class_content = '\n'.join(lines[i:end_line+1]) if end_line else line
                methods = self._extract_js_functions(class_content, file_path)
                
                classes.append(ClassPattern(
                    name=name,
                    signature=line.strip(),
                    start_line=i + 1,
                    end_line=end_line + 1 if end_line else None,
                    base_classes=base_classes,
                    methods=methods
                ))
        
        return classes
    
    def _parse_python_parameters(self, params_str: str) -> List[str]:
        """Python 매개변수 파싱"""
        if not params_str.strip():
            return []
        
        params = []
        for param in params_str.split(','):
            param = param.strip()
            if param:
                # 타입 힌트 제거
                if ':' in param:
                    param = param.split(':')[0].strip()
                # 기본값 제거
                if '=' in param:
                    param = param.split('=')[0].strip()
                params.append(param)
        
        return params
    
    def _parse_js_parameters(self, params_str: str) -> List[str]:
        """JavaScript 매개변수 파싱"""
        if not params_str.strip():
            return []
        
        params = []
        for param in params_str.split(','):
            param = param.strip()
            if param:
                # 타입 제거 (TypeScript)
                if ':' in param:
                    param = param.split(':')[0].strip()
                # 기본값 제거
                if '=' in param:
                    param = param.split('=')[0].strip()
                params.append(param)
        
        return params
    
    def _extract_python_docstring(self, lines: List[str], start_idx: int) -> Optional[str]:
        """Python docstring 추출"""
        if start_idx >= len(lines):
            return None
        
        # 다음 라인이 docstring인지 확인
        next_line = lines[start_idx].strip()
        if not (next_line.startswith('"""') or next_line.startswith("'''")):
            return None
        
        quote_type = next_line[:3]
        docstring_lines = []
        
        # 한 줄 docstring
        if next_line.endswith(quote_type) and len(next_line) > 6:
            return next_line[3:-3].strip()
        
        # 다중 줄 docstring
        for i in range(start_idx + 1, len(lines)):
            line = lines[i]
            if quote_type in line:
                break
            docstring_lines.append(line.strip())
        
        return '\n'.join(docstring_lines).strip() if docstring_lines else None
    
    def _calculate_complexity(self, content: str) -> int:
        """순환 복잡도 계산"""
        complexity = 1
        
        # 제어 구조 키워드들
        control_keywords = ['if', 'elif', 'else', 'while', 'for', 'try', 'except', 'finally', 'switch', 'case']
        
        for keyword in control_keywords:
            complexity += len(re.findall(rf'\b{keyword}\b', content, re.IGNORECASE))
        
        return complexity
    
    def _find_python_function_end(self, lines: List[str], start_idx: int) -> Optional[int]:
        """Python 함수 끝 라인 찾기"""
        if start_idx >= len(lines):
            return None
        
        base_indent = len(lines[start_idx]) - len(lines[start_idx].lstrip())
        
        for i in range(start_idx + 1, len(lines)):
            line = lines[i]
            if line.strip() == '':
                continue
            
            current_indent = len(line) - len(line.lstrip())
            if current_indent <= base_indent:
                return i - 1
        
        return len(lines) - 1
    
    def _find_js_function_end(self, lines: List[str], start_idx: int) -> Optional[int]:
        """JavaScript 함수 끝 라인 찾기"""
        if start_idx >= len(lines):
            return None
        
        brace_count = 0
        found_first_brace = False
        
        for i in range(start_idx, len(lines)):
            line = lines[i]
            for char in line:
                if char == '{':
                    brace_count += 1
                    found_first_brace = True
                elif char == '}':
                    brace_count -= 1
                    if found_first_brace and brace_count == 0:
                        return i
        
        return None
    
    def _find_python_class_end(self, lines: List[str], start_idx: int) -> Optional[int]:
        """Python 클래스 끝 라인 찾기"""
        return self._find_python_function_end(lines, start_idx)
    
    def _find_js_class_end(self, lines: List[str], start_idx: int) -> Optional[int]:
        """JavaScript 클래스 끝 라인 찾기"""
        return self._find_js_function_end(lines, start_idx)


class PatternAnalyzer:
    """패턴 분석기"""
    
    def __init__(self):
        self.extractor = PatternExtractor()
        self.logger = logging.getLogger(__name__)
    
    def analyze_file_patterns(self, content: str, file_path: str) -> Dict[str, Any]:
        """파일의 모든 패턴 분석"""
        language = self.extractor.detect_language(file_path, content)
        
        functions = self.extractor.extract_functions(content, language, file_path)
        classes = self.extractor.extract_classes(content, language, file_path)
        
        return {
            'language': language.value,
            'file_path': file_path,
            'functions': [self._function_to_dict(f) for f in functions],
            'classes': [self._class_to_dict(c) for c in classes],
            'stats': {
                'total_functions': len(functions),
                'total_classes': len(classes),
                'async_functions': sum(1 for f in functions if f.is_async),
                'methods': sum(1 for f in functions if f.is_method),
                'average_complexity': sum(f.complexity for f in functions) / len(functions) if functions else 0
            }
        }
    
    def _function_to_dict(self, func: FunctionPattern) -> Dict[str, Any]:
        """FunctionPattern을 딕셔너리로 변환"""
        return {
            'name': func.name,
            'signature': func.signature,
            'start_line': func.start_line,
            'end_line': func.end_line,
            'parameters': func.parameters or [],
            'return_type': func.return_type,
            'is_async': func.is_async,
            'is_method': func.is_method,
            'complexity': func.complexity,
            'docstring': func.docstring
        }
    
    def _class_to_dict(self, cls: ClassPattern) -> Dict[str, Any]:
        """ClassPattern을 딕셔너리로 변환"""
        return {
            'name': cls.name,
            'signature': cls.signature,
            'start_line': cls.start_line,
            'end_line': cls.end_line,
            'base_classes': cls.base_classes or [],
            'methods': [self._function_to_dict(m) for m in cls.methods] if cls.methods else [],
            'properties': cls.properties or []
        }


# 전역 인스턴스
_default_pattern_analyzer = None

def get_pattern_analyzer() -> PatternAnalyzer:
    """기본 패턴 분석기 반환"""
    global _default_pattern_analyzer
    if _default_pattern_analyzer is None:
        _default_pattern_analyzer = PatternAnalyzer()
    return _default_pattern_analyzer


# 편의 함수들
def extract_functions(content: str, file_path: str) -> List[FunctionPattern]:
    """함수 추출 편의 함수"""
    analyzer = get_pattern_analyzer()
    language = analyzer.extractor.detect_language(file_path, content)
    return analyzer.extractor.extract_functions(content, language, file_path)

def extract_classes(content: str, file_path: str) -> List[ClassPattern]:
    """클래스 추출 편의 함수"""
    analyzer = get_pattern_analyzer()
    language = analyzer.extractor.detect_language(file_path, content)
    return analyzer.extractor.extract_classes(content, language, file_path)

def analyze_file_patterns(content: str, file_path: str) -> Dict[str, Any]:
    """파일 패턴 분석 편의 함수"""
    return get_pattern_analyzer().analyze_file_patterns(content, file_path) 