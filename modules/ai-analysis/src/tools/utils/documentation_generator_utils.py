#!/usr/bin/env python3
"""
Documentation Generator Utilities
AI 기반 자동 문서화 및 주석 생성 도구들

주요 기능:
- 코드에서 자동 문서 생성
- 함수/클래스 독스트링 자동 생성
- README 및 API 문서 자동 생성
- 튜토리얼 및 가이드 생성
- 다양한 출력 형식 지원 (Markdown, HTML, RST)
- 다국어 문서 지원
- 코드 예제 추출 및 검증
- 문서 품질 검증 및 개선 제안
"""

import ast
import inspect
import re
import json
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Tuple, Set, Iterator
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import logging
import subprocess
import sys
from collections import defaultdict
import importlib.util
from jinja2 import Template, Environment, FileSystemLoader
import markdown
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.formatters import HtmlFormatter

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class DocumentFormat(Enum):
    MARKDOWN = "markdown"
    HTML = "html"
    RST = "rst"
    PLAIN_TEXT = "plain_text"
    JSON = "json"


class DocumentType(Enum):
    DOCSTRING = "docstring"
    README = "readme"
    API_DOCS = "api_docs"
    TUTORIAL = "tutorial"
    CHANGELOG = "changelog"
    ARCHITECTURE = "architecture"


class DocstringStyle(Enum):
    GOOGLE = "google"
    NUMPY = "numpy"
    SPHINX = "sphinx"
    PLAIN = "plain"


# 데이터 클래스들
@dataclass
class CodeElement:
    """코드 요소 정보"""
    name: str
    type: str  # function, class, method, property
    signature: str
    docstring: Optional[str] = None
    source_code: str = ""
    line_number: int = 0
    file_path: str = ""
    parent: Optional[str] = None
    children: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)
    parameters: List[Dict[str, Any]] = field(default_factory=list)
    return_type: Optional[str] = None
    raises: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    see_also: List[str] = field(default_factory=list)
    notes: str = ""
    complexity: str = "O(1)"  # 시간 복잡도
    is_async: bool = False
    is_property: bool = False
    is_private: bool = False


@dataclass
class DocumentationConfig:
    """문서화 설정"""
    project_name: str = "Untitled Project"
    project_version: str = "1.0.0"
    author: str = "Unknown"
    description: str = ""
    license: str = "MIT"
    repository_url: str = ""
    documentation_url: str = ""
    output_format: DocumentFormat = DocumentFormat.MARKDOWN
    docstring_style: DocstringStyle = DocstringStyle.GOOGLE
    include_private: bool = False
    include_source: bool = False
    include_inheritance: bool = True
    include_examples: bool = True
    language: str = "en"
    template_dir: Optional[str] = None
    output_dir: str = "docs"
    auto_generate_toc: bool = True
    include_type_hints: bool = True
    generate_uml: bool = False


@dataclass
class DocumentationResult:
    """문서화 결과"""
    content: str
    format: DocumentFormat
    metadata: Dict[str, Any]
    generated_at: datetime
    file_path: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class CodeParser:
    """코드 파싱 및 분석"""
    
    def __init__(self):
        self.parsed_modules = {}
        self.import_graph = defaultdict(set)
    
    def parse_python_file(self, file_path: str) -> List[CodeElement]:
        """Python 파일 파싱"""
        elements = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source_code = f.read()
            
            tree = ast.parse(source_code)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    element = self._parse_function(node, source_code, file_path)
                    elements.append(element)
                
                elif isinstance(node, ast.AsyncFunctionDef):
                    element = self._parse_function(node, source_code, file_path, is_async=True)
                    elements.append(element)
                
                elif isinstance(node, ast.ClassDef):
                    element = self._parse_class(node, source_code, file_path)
                    elements.append(element)
                    
                    # 클래스 내 메서드들도 파싱
                    for class_node in node.body:
                        if isinstance(class_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            method = self._parse_function(
                                class_node, source_code, file_path,
                                parent=node.name,
                                is_async=isinstance(class_node, ast.AsyncFunctionDef)
                            )
                            elements.append(method)
        
        except Exception as e:
            logger.error(f"Failed to parse {file_path}: {e}")
        
        return elements
    
    def _parse_function(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef], 
                       source_code: str, file_path: str, 
                       parent: Optional[str] = None, is_async: bool = False) -> CodeElement:
        """함수 파싱"""
        # 시그니처 추출
        signature = self._extract_signature(node)
        
        # 매개변수 정보 추출
        parameters = self._extract_parameters(node)
        
        # 반환 타입 추출
        return_type = self._extract_return_type(node)
        
        # 데코레이터 추출
        decorators = [self._ast_to_string(dec) for dec in node.decorator_list]
        
        # 독스트링 추출
        docstring = ast.get_docstring(node)
        
        # private 여부 확인
        is_private = node.name.startswith('_')
        
        # property 여부 확인
        is_property = any('property' in dec for dec in decorators)
        
        return CodeElement(
            name=node.name,
            type="method" if parent else "function",
            signature=signature,
            docstring=docstring,
            line_number=node.lineno,
            file_path=file_path,
            parent=parent,
            decorators=decorators,
            parameters=parameters,
            return_type=return_type,
            is_async=is_async,
            is_property=is_property,
            is_private=is_private
        )
    
    def _parse_class(self, node: ast.ClassDef, source_code: str, file_path: str) -> CodeElement:
        """클래스 파싱"""
        # 상속 클래스 추출
        base_classes = [self._ast_to_string(base) for base in node.bases]
        
        # 데코레이터 추출
        decorators = [self._ast_to_string(dec) for dec in node.decorator_list]
        
        # 독스트링 추출
        docstring = ast.get_docstring(node)
        
        # 클래스 메서드 목록 생성
        children = []
        for class_node in node.body:
            if isinstance(class_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                children.append(class_node.name)
        
        return CodeElement(
            name=node.name,
            type="class",
            signature=f"class {node.name}({', '.join(base_classes)})" if base_classes else f"class {node.name}",
            docstring=docstring,
            line_number=node.lineno,
            file_path=file_path,
            decorators=decorators,
            children=children,
            is_private=node.name.startswith('_')
        )
    
    def _extract_signature(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> str:
        """함수 시그니처 추출"""
        try:
            # asyncio 함수인지 확인
            async_prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
            
            # 매개변수 처리
            args = []
            
            # 일반 매개변수
            for arg in node.args.args:
                arg_str = arg.arg
                if arg.annotation:
                    arg_str += f": {self._ast_to_string(arg.annotation)}"
                args.append(arg_str)
            
            # 기본값이 있는 매개변수
            defaults = node.args.defaults
            if defaults:
                # 뒤에서부터 기본값 적용
                for i, default in enumerate(defaults):
                    idx = len(args) - len(defaults) + i
                    if idx >= 0 and idx < len(args):
                        args[idx] += f" = {self._ast_to_string(default)}"
            
            # *args 처리
            if node.args.vararg:
                vararg = f"*{node.args.vararg.arg}"
                if node.args.vararg.annotation:
                    vararg += f": {self._ast_to_string(node.args.vararg.annotation)}"
                args.append(vararg)
            
            # **kwargs 처리
            if node.args.kwarg:
                kwarg = f"**{node.args.kwarg.arg}"
                if node.args.kwarg.annotation:
                    kwarg += f": {self._ast_to_string(node.args.kwarg.annotation)}"
                args.append(kwarg)
            
            # 반환 타입 처리
            return_annotation = ""
            if node.returns:
                return_annotation = f" -> {self._ast_to_string(node.returns)}"
            
            return f"{async_prefix}def {node.name}({', '.join(args)}){return_annotation}"
        
        except Exception as e:
            logger.warning(f"Failed to extract signature for {node.name}: {e}")
            return f"def {node.name}(...)"
    
    def _extract_parameters(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> List[Dict[str, Any]]:
        """매개변수 정보 추출"""
        parameters = []
        
        try:
            # 일반 매개변수
            for i, arg in enumerate(node.args.args):
                param_info = {
                    "name": arg.arg,
                    "type": self._ast_to_string(arg.annotation) if arg.annotation else "Any",
                    "default": None,
                    "kind": "positional"
                }
                
                # 기본값 확인
                defaults = node.args.defaults
                if defaults and i >= len(node.args.args) - len(defaults):
                    default_idx = i - (len(node.args.args) - len(defaults))
                    param_info["default"] = self._ast_to_string(defaults[default_idx])
                
                parameters.append(param_info)
            
            # *args
            if node.args.vararg:
                parameters.append({
                    "name": node.args.vararg.arg,
                    "type": self._ast_to_string(node.args.vararg.annotation) if node.args.vararg.annotation else "Any",
                    "default": None,
                    "kind": "var_positional"
                })
            
            # **kwargs
            if node.args.kwarg:
                parameters.append({
                    "name": node.args.kwarg.arg,
                    "type": self._ast_to_string(node.args.kwarg.annotation) if node.args.kwarg.annotation else "Any",
                    "default": None,
                    "kind": "var_keyword"
                })
        
        except Exception as e:
            logger.warning(f"Failed to extract parameters for {node.name}: {e}")
        
        return parameters
    
    def _extract_return_type(self, node: Union[ast.FunctionDef, ast.AsyncFunctionDef]) -> Optional[str]:
        """반환 타입 추출"""
        if node.returns:
            return self._ast_to_string(node.returns)
        return None
    
    def _ast_to_string(self, node: ast.AST) -> str:
        """AST 노드를 문자열로 변환"""
        try:
            if hasattr(ast, 'unparse'):
                return ast.unparse(node)
            else:
                # Python 3.8 이하에서는 astor 라이브러리 사용 또는 대안
                return str(node)
        except Exception:
            return str(node)


class DocstringGenerator:
    """독스트링 자동 생성기"""
    
    def __init__(self, style: DocstringStyle = DocstringStyle.GOOGLE):
        self.style = style
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[str, str]:
        """독스트링 템플릿 로드"""
        templates = {
            DocstringStyle.GOOGLE: {
                "function": '''"""{{ summary }}
{% if description %}
{{ description }}
{% endif %}
{% if parameters %}
Args:
{% for param in parameters %}
    {{ param.name }} ({{ param.type }}): {{ param.description }}{% if param.default %} Defaults to {{ param.default }}.{% endif %}
{% endfor %}
{% endif %}
{% if returns %}
Returns:
    {{ returns.type }}: {{ returns.description }}
{% endif %}
{% if raises %}
Raises:
{% for exception in raises %}
    {{ exception.type }}: {{ exception.description }}
{% endfor %}
{% endif %}
{% if examples %}
Examples:
{% for example in examples %}
    {{ example }}
{% endfor %}
{% endif %}
"""''',
                "class": '''"""{{ summary }}
{% if description %}
{{ description }}
{% endif %}
{% if attributes %}
Attributes:
{% for attr in attributes %}
    {{ attr.name }} ({{ attr.type }}): {{ attr.description }}
{% endfor %}
{% endif %}
{% if examples %}
Examples:
{% for example in examples %}
    {{ example }}
{% endfor %}
{% endif %}
"""'''
            },
            DocstringStyle.NUMPY: {
                "function": '''"""{{ summary }}
{% if description %}
{{ description }}
{% endif %}
{% if parameters %}
Parameters
----------
{% for param in parameters %}
{{ param.name }} : {{ param.type }}
    {{ param.description }}{% if param.default %} (default: {{ param.default }}){% endif %}
{% endfor %}
{% endif %}
{% if returns %}
Returns
-------
{{ returns.type }}
    {{ returns.description }}
{% endif %}
{% if raises %}
Raises
------
{% for exception in raises %}
{{ exception.type }}
    {{ exception.description }}
{% endfor %}
{% endif %}
{% if examples %}
Examples
--------
{% for example in examples %}
{{ example }}
{% endfor %}
{% endif %}
"""''',
                "class": '''"""{{ summary }}
{% if description %}
{{ description }}
{% endif %}
{% if attributes %}
Attributes
----------
{% for attr in attributes %}
{{ attr.name }} : {{ attr.type }}
    {{ attr.description }}
{% endfor %}
{% endif %}
{% if examples %}
Examples
--------
{% for example in examples %}
{{ example }}
{% endfor %}
{% endif %}
"""'''
            }
        }
        return templates
    
    def generate_function_docstring(self, element: CodeElement, 
                                  context: Optional[Dict[str, Any]] = None) -> str:
        """함수 독스트링 생성"""
        if element.docstring:
            return element.docstring  # 이미 독스트링이 있으면 그대로 반환
        
        # 함수 분석에서 정보 추출
        summary = self._generate_summary(element)
        description = self._generate_description(element, context)
        
        # 매개변수 설명 생성
        parameters = []
        for param in element.parameters:
            param_desc = self._generate_parameter_description(param, element)
            parameters.append({
                "name": param["name"],
                "type": param["type"],
                "description": param_desc,
                "default": param.get("default")
            })
        
        # 반환값 설명 생성
        returns = None
        if element.return_type and element.return_type != "None":
            returns = {
                "type": element.return_type,
                "description": self._generate_return_description(element)
            }
        
        # 예외 정보 생성
        raises = self._generate_raises_info(element)
        
        # 예제 생성
        examples = self._generate_examples(element)
        
        # 템플릿 렌더링
        template_str = self.templates[self.style]["function"]
        template = Template(template_str)
        
        return template.render(
            summary=summary,
            description=description,
            parameters=parameters,
            returns=returns,
            raises=raises,
            examples=examples
        ).strip()
    
    def generate_class_docstring(self, element: CodeElement, 
                                context: Optional[Dict[str, Any]] = None) -> str:
        """클래스 독스트링 생성"""
        if element.docstring:
            return element.docstring
        
        summary = self._generate_summary(element)
        description = self._generate_description(element, context)
        
        # 속성 정보 생성 (향후 구현)
        attributes = []
        
        # 예제 생성
        examples = self._generate_examples(element)
        
        template_str = self.templates[self.style]["class"]
        template = Template(template_str)
        
        return template.render(
            summary=summary,
            description=description,
            attributes=attributes,
            examples=examples
        ).strip()
    
    def _generate_summary(self, element: CodeElement) -> str:
        """요약 생성"""
        # 함수/클래스 이름에서 의미 추출
        name = element.name
        
        # 일반적인 패턴 기반 요약 생성
        patterns = {
            r'^get_': 'Get {}',
            r'^set_': 'Set {}',
            r'^is_': 'Check if {}',
            r'^has_': 'Check if has {}',
            r'^create_': 'Create {}',
            r'^delete_': 'Delete {}',
            r'^update_': 'Update {}',
            r'^save_': 'Save {}',
            r'^load_': 'Load {}',
            r'^parse_': 'Parse {}',
            r'^validate_': 'Validate {}',
            r'^calculate_': 'Calculate {}',
            r'^process_': 'Process {}',
            r'^generate_': 'Generate {}',
            r'^build_': 'Build {}',
        }
        
        for pattern, template in patterns.items():
            if re.match(pattern, name):
                object_name = re.sub(pattern, '', name).replace('_', ' ')
                return template.format(object_name)
        
        # 기본 요약
        if element.type == "class":
            return f"{name.replace('_', ' ')} class"
        else:
            return f"{name.replace('_', ' ')} function"
    
    def _generate_description(self, element: CodeElement, context: Optional[Dict[str, Any]] = None) -> str:
        """상세 설명 생성"""
        # 컨텍스트 기반 설명 생성 (향후 AI 모델 연동)
        if context and 'description' in context:
            return context['description']
        
        # 기본 설명
        if element.type == "class":
            return f"Implementation of {element.name}."
        else:
            return f"Detailed implementation of {element.name} function."
    
    def _generate_parameter_description(self, param: Dict[str, Any], element: CodeElement) -> str:
        """매개변수 설명 생성"""
        param_name = param["name"]
        param_type = param["type"]
        
        # 일반적인 매개변수 이름 패턴 기반 설명
        descriptions = {
            "self": "Instance reference",
            "cls": "Class reference",
            "args": "Variable length argument list",
            "kwargs": "Arbitrary keyword arguments",
            "data": "Input data to process",
            "file_path": "Path to the file",
            "filename": "Name of the file",
            "config": "Configuration parameters",
            "options": "Optional parameters",
            "callback": "Callback function to execute",
            "timeout": "Timeout value in seconds",
            "max_retries": "Maximum number of retries",
            "debug": "Enable debug mode",
            "verbose": "Enable verbose output",
        }
        
        if param_name in descriptions:
            return descriptions[param_name]
        
        # 타입 기반 설명
        if param_type == "str":
            return f"String parameter for {param_name}"
        elif param_type == "int":
            return f"Integer parameter for {param_name}"
        elif param_type == "bool":
            return f"Boolean flag for {param_name}"
        elif param_type == "List":
            return f"List of items for {param_name}"
        elif param_type == "Dict":
            return f"Dictionary parameter for {param_name}"
        
        return f"Parameter {param_name}"
    
    def _generate_return_description(self, element: CodeElement) -> str:
        """반환값 설명 생성"""
        return_type = element.return_type
        
        # 타입 기반 설명
        if return_type == "bool":
            return "True if successful, False otherwise"
        elif return_type == "str":
            return "String result"
        elif return_type == "int":
            return "Integer result"
        elif return_type == "List":
            return "List of results"
        elif return_type == "Dict":
            return "Dictionary containing results"
        elif "Optional" in return_type:
            return "Result value or None if not found"
        
        return "Function result"
    
    def _generate_raises_info(self, element: CodeElement) -> List[Dict[str, str]]:
        """예외 정보 생성"""
        raises = []
        
        # 함수 이름 패턴 기반 예외 추정
        if any(word in element.name for word in ['validate', 'check']):
            raises.append({
                "type": "ValueError",
                "description": "If validation fails"
            })
        
        if any(word in element.name for word in ['file', 'read', 'write', 'save', 'load']):
            raises.append({
                "type": "IOError",
                "description": "If file operation fails"
            })
        
        if any(word in element.name for word in ['connect', 'request', 'download']):
            raises.append({
                "type": "ConnectionError",
                "description": "If connection fails"
            })
        
        return raises
    
    def _generate_examples(self, element: CodeElement) -> List[str]:
        """예제 코드 생성"""
        examples = []
        
        # 간단한 예제 생성
        if element.type == "function":
            if element.parameters:
                # 매개변수가 있는 경우
                example_args = []
                for param in element.parameters[:3]:  # 처음 3개만
                    if param["name"] in ["self", "cls"]:
                        continue
                    if param["default"]:
                        continue  # 기본값이 있는 경우 생략
                    
                    param_type = param["type"]
                    if param_type == "str":
                        example_args.append(f'"{param["name"]}_value"')
                    elif param_type == "int":
                        example_args.append("1")
                    elif param_type == "bool":
                        example_args.append("True")
                    elif param_type == "List":
                        example_args.append("[]")
                    elif param_type == "Dict":
                        example_args.append("{}")
                    else:
                        example_args.append(f"{param['name']}_value")
                
                if example_args:
                    examples.append(f">>> {element.name}({', '.join(example_args)})")
            else:
                # 매개변수가 없는 경우
                examples.append(f">>> {element.name}()")
        
        return examples


class ReadmeGenerator:
    """README 자동 생성기"""
    
    def __init__(self, config: DocumentationConfig):
        self.config = config
    
    def generate_readme(self, project_path: str, code_elements: List[CodeElement]) -> str:
        """README.md 생성"""
        readme_sections = []
        
        # 프로젝트 제목
        readme_sections.append(f"# {self.config.project_name}")
        readme_sections.append("")
        
        # 설명
        if self.config.description:
            readme_sections.append(self.config.description)
            readme_sections.append("")
        
        # 뱃지 (예시)
        if self.config.repository_url:
            readme_sections.append("![Build Status](https://img.shields.io/badge/build-passing-brightgreen)")
            readme_sections.append("![Version](https://img.shields.io/badge/version-{}-blue)".format(self.config.project_version))
            readme_sections.append("")
        
        # 목차
        readme_sections.append("## Table of Contents")
        readme_sections.append("- [Installation](#installation)")
        readme_sections.append("- [Quick Start](#quick-start)")
        readme_sections.append("- [API Reference](#api-reference)")
        readme_sections.append("- [Contributing](#contributing)")
        readme_sections.append("- [License](#license)")
        readme_sections.append("")
        
        # 설치 방법
        readme_sections.append("## Installation")
        readme_sections.append("")
        readme_sections.append("```bash")
        readme_sections.append(f"pip install {self.config.project_name.lower().replace(' ', '-')}")
        readme_sections.append("```")
        readme_sections.append("")
        
        # 빠른 시작
        readme_sections.append("## Quick Start")
        readme_sections.append("")
        quick_start_example = self._generate_quick_start_example(code_elements)
        readme_sections.append("```python")
        readme_sections.append(quick_start_example)
        readme_sections.append("```")
        readme_sections.append("")
        
        # API 참조
        readme_sections.append("## API Reference")
        readme_sections.append("")
        api_overview = self._generate_api_overview(code_elements)
        readme_sections.extend(api_overview)
        readme_sections.append("")
        
        # 기여 방법
        readme_sections.append("## Contributing")
        readme_sections.append("")
        readme_sections.append("Contributions are welcome! Please feel free to submit a Pull Request.")
        readme_sections.append("")
        
        # 라이선스
        readme_sections.append("## License")
        readme_sections.append("")
        readme_sections.append(f"This project is licensed under the {self.config.license} License.")
        
        return "\n".join(readme_sections)
    
    def _generate_quick_start_example(self, code_elements: List[CodeElement]) -> str:
        """빠른 시작 예제 생성"""
        # 주요 클래스나 함수 찾기
        main_classes = [e for e in code_elements if e.type == "class" and not e.is_private]
        main_functions = [e for e in code_elements if e.type == "function" and not e.is_private]
        
        example_lines = []
        
        # 임포트 문
        if main_classes:
            class_names = [c.name for c in main_classes[:3]]
            example_lines.append(f"from {self.config.project_name.lower()} import {', '.join(class_names)}")
        
        example_lines.append("")
        
        # 기본 사용 예제
        if main_classes:
            main_class = main_classes[0]
            example_lines.append(f"# Create an instance")
            example_lines.append(f"{main_class.name.lower()} = {main_class.name}()")
            example_lines.append("")
            
            # 주요 메서드 호출 예제
            methods = [e for e in code_elements if e.parent == main_class.name and not e.is_private]
            if methods:
                main_method = methods[0]
                example_lines.append(f"# Use main functionality")
                example_lines.append(f"result = {main_class.name.lower()}.{main_method.name}()")
                example_lines.append("print(result)")
        
        elif main_functions:
            main_function = main_functions[0]
            example_lines.append(f"# Use main function")
            example_lines.append(f"result = {main_function.name}()")
            example_lines.append("print(result)")
        
        return "\n".join(example_lines)
    
    def _generate_api_overview(self, code_elements: List[CodeElement]) -> List[str]:
        """API 개요 생성"""
        overview = []
        
        # 클래스별 정리
        classes = [e for e in code_elements if e.type == "class" and not e.is_private]
        if classes:
            overview.append("### Classes")
            overview.append("")
            for cls in classes:
                overview.append(f"#### `{cls.name}`")
                if cls.docstring:
                    # 독스트링의 첫 번째 줄만 사용
                    summary = cls.docstring.split('\n')[0].strip()
                    overview.append(summary)
                overview.append("")
        
        # 함수별 정리
        functions = [e for e in code_elements if e.type == "function" and not e.is_private]
        if functions:
            overview.append("### Functions")
            overview.append("")
            for func in functions:
                overview.append(f"#### `{func.name}()`")
                if func.docstring:
                    summary = func.docstring.split('\n')[0].strip()
                    overview.append(summary)
                overview.append("")
        
        return overview


class APIDocumentationGenerator:
    """API 문서 자동 생성기"""
    
    def __init__(self, config: DocumentationConfig):
        self.config = config
        self.docstring_generator = DocstringGenerator(config.docstring_style)
    
    def generate_api_docs(self, code_elements: List[CodeElement]) -> str:
        """API 문서 생성"""
        docs = []
        
        # 제목
        docs.append(f"# {self.config.project_name} API Reference")
        docs.append("")
        docs.append(f"Version: {self.config.project_version}")
        docs.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        docs.append("")
        
        # 목차 생성
        if self.config.auto_generate_toc:
            toc = self._generate_table_of_contents(code_elements)
            docs.extend(toc)
            docs.append("")
        
        # 클래스 문서화
        classes = [e for e in code_elements if e.type == "class"]
        if not self.config.include_private:
            classes = [c for c in classes if not c.is_private]
        
        if classes:
            docs.append("## Classes")
            docs.append("")
            
            for cls in sorted(classes, key=lambda x: x.name):
                class_docs = self._generate_class_documentation(cls, code_elements)
                docs.extend(class_docs)
                docs.append("")
        
        # 함수 문서화
        functions = [e for e in code_elements if e.type == "function"]
        if not self.config.include_private:
            functions = [f for f in functions if not f.is_private]
        
        if functions:
            docs.append("## Functions")
            docs.append("")
            
            for func in sorted(functions, key=lambda x: x.name):
                func_docs = self._generate_function_documentation(func)
                docs.extend(func_docs)
                docs.append("")
        
        return "\n".join(docs)
    
    def _generate_table_of_contents(self, code_elements: List[CodeElement]) -> List[str]:
        """목차 생성"""
        toc = ["## Table of Contents", ""]
        
        # 클래스 목차
        classes = [e for e in code_elements if e.type == "class"]
        if not self.config.include_private:
            classes = [c for c in classes if not c.is_private]
        
        if classes:
            toc.append("### Classes")
            for cls in sorted(classes, key=lambda x: x.name):
                toc.append(f"- [{cls.name}](#{cls.name.lower()})")
            toc.append("")
        
        # 함수 목차
        functions = [e for e in code_elements if e.type == "function"]
        if not self.config.include_private:
            functions = [f for f in functions if not f.is_private]
        
        if functions:
            toc.append("### Functions")
            for func in sorted(functions, key=lambda x: x.name):
                toc.append(f"- [{func.name}](#{func.name.lower()})")
            toc.append("")
        
        return toc
    
    def _generate_class_documentation(self, cls: CodeElement, all_elements: List[CodeElement]) -> List[str]:
        """클래스 문서 생성"""
        docs = []
        
        # 클래스 제목
        docs.append(f"### {cls.name}")
        docs.append("")
        
        # 시그니처
        docs.append("```python")
        docs.append(cls.signature)
        docs.append("```")
        docs.append("")
        
        # 독스트링
        if cls.docstring:
            docs.append(cls.docstring)
        else:
            # 자동 생성
            generated_docstring = self.docstring_generator.generate_class_docstring(cls)
            docs.append(generated_docstring)
        docs.append("")
        
        # 상속 정보
        if self.config.include_inheritance and "(" in cls.signature:
            docs.append("**Inheritance:**")
            base_classes = cls.signature.split("(")[1].split(")")[0]
            if base_classes.strip():
                docs.append(f"Inherits from: `{base_classes}`")
                docs.append("")
        
        # 메서드 목록
        methods = [e for e in all_elements if e.parent == cls.name]
        if not self.config.include_private:
            methods = [m for m in methods if not m.is_private]
        
        if methods:
            docs.append("**Methods:**")
            docs.append("")
            
            for method in sorted(methods, key=lambda x: x.name):
                method_docs = self._generate_method_documentation(method)
                docs.extend(method_docs)
                docs.append("")
        
        # 소스 코드 (옵션)
        if self.config.include_source and cls.source_code:
            docs.append("**Source:**")
            docs.append("```python")
            docs.append(cls.source_code)
            docs.append("```")
            docs.append("")
        
        return docs
    
    def _generate_function_documentation(self, func: CodeElement) -> List[str]:
        """함수 문서 생성"""
        docs = []
        
        # 함수 제목
        docs.append(f"### {func.name}")
        docs.append("")
        
        # 시그니처
        docs.append("```python")
        docs.append(func.signature)
        docs.append("```")
        docs.append("")
        
        # 독스트링
        if func.docstring:
            docs.append(func.docstring)
        else:
            # 자동 생성
            generated_docstring = self.docstring_generator.generate_function_docstring(func)
            docs.append(generated_docstring)
        docs.append("")
        
        # 매개변수 표 생성
        if func.parameters and self.config.include_type_hints:
            docs.append("**Parameters:**")
            docs.append("")
            docs.append("| Name | Type | Default | Description |")
            docs.append("|------|------|---------|-------------|")
            
            for param in func.parameters:
                if param["name"] in ["self", "cls"]:
                    continue
                
                name = param["name"]
                param_type = param.get("type", "Any")
                default = param.get("default", "Required")
                description = f"Parameter {name}"  # 향후 AI로 개선
                
                docs.append(f"| `{name}` | `{param_type}` | `{default}` | {description} |")
            
            docs.append("")
        
        # 반환값 정보
        if func.return_type and func.return_type != "None":
            docs.append("**Returns:**")
            docs.append(f"- `{func.return_type}`: Return value description")
            docs.append("")
        
        return docs
    
    def _generate_method_documentation(self, method: CodeElement) -> List[str]:
        """메서드 문서 생성 (함수와 유사하지만 간소화)"""
        docs = []
        
        docs.append(f"#### `{method.name}()`")
        docs.append("")
        
        # 간단한 시그니처
        docs.append("```python")
        docs.append(method.signature)
        docs.append("```")
        docs.append("")
        
        # 독스트링 첫 줄만
        if method.docstring:
            summary = method.docstring.split('\n')[0].strip()
            docs.append(summary)
        else:
            docs.append(f"Method: {method.name}")
        
        return docs


class TutorialGenerator:
    """튜토리얼 자동 생성기"""
    
    def __init__(self, config: DocumentationConfig):
        self.config = config
    
    def generate_tutorial(self, code_elements: List[CodeElement], 
                         examples: Optional[List[str]] = None) -> str:
        """튜토리얼 생성"""
        tutorial = []
        
        # 제목
        tutorial.append(f"# {self.config.project_name} Tutorial")
        tutorial.append("")
        tutorial.append("This tutorial will guide you through the basic usage of this library.")
        tutorial.append("")
        
        # 설치
        tutorial.append("## Installation")
        tutorial.append("")
        tutorial.append("First, install the library:")
        tutorial.append("")
        tutorial.append("```bash")
        tutorial.append(f"pip install {self.config.project_name.lower().replace(' ', '-')}")
        tutorial.append("```")
        tutorial.append("")
        
        # 기본 사용법
        tutorial.append("## Basic Usage")
        tutorial.append("")
        
        # 주요 클래스/함수 기반 단계별 튜토리얼
        main_classes = [e for e in code_elements if e.type == "class" and not e.is_private]
        main_functions = [e for e in code_elements if e.type == "function" and not e.is_private]
        
        if main_classes:
            tutorial.extend(self._generate_class_tutorial(main_classes[0], code_elements))
        
        if main_functions:
            tutorial.extend(self._generate_function_tutorial(main_functions[:3]))
        
        # 고급 사용법
        tutorial.append("## Advanced Usage")
        tutorial.append("")
        tutorial.append("Coming soon...")
        tutorial.append("")
        
        # 예제 코드
        if examples:
            tutorial.append("## Examples")
            tutorial.append("")
            for i, example in enumerate(examples, 1):
                tutorial.append(f"### Example {i}")
                tutorial.append("")
                tutorial.append("```python")
                tutorial.append(example)
                tutorial.append("```")
                tutorial.append("")
        
        return "\n".join(tutorial)
    
    def _generate_class_tutorial(self, cls: CodeElement, all_elements: List[CodeElement]) -> List[str]:
        """클래스 기반 튜토리얼 생성"""
        tutorial = []
        
        tutorial.append(f"### Using {cls.name}")
        tutorial.append("")
        tutorial.append(f"The `{cls.name}` class is the main component of this library.")
        tutorial.append("")
        
        # 기본 인스턴스 생성
        tutorial.append("#### Creating an Instance")
        tutorial.append("")
        tutorial.append("```python")
        tutorial.append(f"from {self.config.project_name.lower()} import {cls.name}")
        tutorial.append("")
        tutorial.append(f"# Create a new instance")
        tutorial.append(f"{cls.name.lower()} = {cls.name}()")
        tutorial.append("```")
        tutorial.append("")
        
        # 주요 메서드 사용법
        methods = [e for e in all_elements if e.parent == cls.name and not e.is_private]
        if methods:
            tutorial.append("#### Using Methods")
            tutorial.append("")
            
            # 처음 2-3개 메서드만 튜토리얼에 포함
            for method in methods[:3]:
                tutorial.append(f"##### {method.name}")
                tutorial.append("")
                
                example_call = self._generate_method_example(method, cls.name.lower())
                tutorial.append("```python")
                tutorial.append(example_call)
                tutorial.append("```")
                tutorial.append("")
        
        return tutorial
    
    def _generate_function_tutorial(self, functions: List[CodeElement]) -> List[str]:
        """함수 기반 튜토리얼 생성"""
        tutorial = []
        
        tutorial.append("### Using Functions")
        tutorial.append("")
        
        for func in functions:
            tutorial.append(f"#### {func.name}")
            tutorial.append("")
            
            if func.docstring:
                summary = func.docstring.split('\n')[0].strip()
                tutorial.append(summary)
                tutorial.append("")
            
            example_call = self._generate_function_example(func)
            tutorial.append("```python")
            tutorial.append(f"from {self.config.project_name.lower()} import {func.name}")
            tutorial.append("")
            tutorial.append(example_call)
            tutorial.append("```")
            tutorial.append("")
        
        return tutorial
    
    def _generate_method_example(self, method: CodeElement, instance_name: str) -> str:
        """메서드 사용 예제 생성"""
        # 간단한 매개변수 예제 생성
        example_args = []
        for param in method.parameters:
            if param["name"] in ["self", "cls"]:
                continue
            
            param_type = param.get("type", "Any")
            if param_type == "str":
                example_args.append('"example"')
            elif param_type == "int":
                example_args.append("10")
            elif param_type == "bool":
                example_args.append("True")
            elif param_type == "List":
                example_args.append("[]")
            elif param_type == "Dict":
                example_args.append("{}")
        
        args_str = ", ".join(example_args)
        return f"result = {instance_name}.{method.name}({args_str})"
    
    def _generate_function_example(self, func: CodeElement) -> str:
        """함수 사용 예제 생성"""
        example_args = []
        for param in func.parameters:
            param_type = param.get("type", "Any")
            if param_type == "str":
                example_args.append('"example"')
            elif param_type == "int":
                example_args.append("10")
            elif param_type == "bool":
                example_args.append("True")
            elif param_type == "List":
                example_args.append("[]")
            elif param_type == "Dict":
                example_args.append("{}")
        
        args_str = ", ".join(example_args)
        return f"result = {func.name}({args_str})"


class DocumentationQualityChecker:
    """문서 품질 검사기"""
    
    def __init__(self):
        self.quality_rules = {
            "min_docstring_length": 10,
            "require_examples": True,
            "require_type_hints": True,
            "require_return_docs": True,
            "max_line_length": 88,
            "require_parameter_docs": True
        }
    
    def check_documentation_quality(self, elements: List[CodeElement]) -> Dict[str, Any]:
        """문서 품질 검사"""
        report = {
            "score": 0,
            "max_score": 0,
            "issues": [],
            "suggestions": [],
            "statistics": {
                "total_elements": len(elements),
                "documented_elements": 0,
                "missing_docstrings": 0,
                "missing_examples": 0,
                "missing_type_hints": 0
            }
        }
        
        for element in elements:
            if element.is_private:
                continue  # private 요소는 점수에서 제외
            
            element_score = 0
            max_element_score = 10
            
            # 독스트링 존재 여부
            if element.docstring:
                element_score += 3
                report["statistics"]["documented_elements"] += 1
                
                # 독스트링 길이
                if len(element.docstring) >= self.quality_rules["min_docstring_length"]:
                    element_score += 2
                else:
                    report["issues"].append(f"{element.name}: Docstring too short")
            else:
                report["statistics"]["missing_docstrings"] += 1
                report["issues"].append(f"{element.name}: Missing docstring")
            
            # 타입 힌트
            if element.type == "function":
                if element.return_type:
                    element_score += 2
                else:
                    report["statistics"]["missing_type_hints"] += 1
                    report["issues"].append(f"{element.name}: Missing return type hint")
                
                # 매개변수 타입 힌트
                if all(p.get("type") != "Any" for p in element.parameters if p["name"] not in ["self", "cls"]):
                    element_score += 2
                else:
                    report["issues"].append(f"{element.name}: Missing parameter type hints")
            
            # 예제 존재 여부
            if element.examples:
                element_score += 1
            else:
                report["statistics"]["missing_examples"] += 1
                if self.quality_rules["require_examples"]:
                    report["issues"].append(f"{element.name}: Missing examples")
            
            report["score"] += element_score
            report["max_score"] += max_element_score
        
        # 점수 계산
        if report["max_score"] > 0:
            report["percentage"] = (report["score"] / report["max_score"]) * 100
        else:
            report["percentage"] = 0
        
        # 개선 제안 생성
        report["suggestions"] = self._generate_improvement_suggestions(report)
        
        return report
    
    def _generate_improvement_suggestions(self, report: Dict[str, Any]) -> List[str]:
        """개선 제안 생성"""
        suggestions = []
        stats = report["statistics"]
        
        if stats["missing_docstrings"] > 0:
            suggestions.append(f"Add docstrings to {stats['missing_docstrings']} elements")
        
        if stats["missing_type_hints"] > 0:
            suggestions.append(f"Add type hints to {stats['missing_type_hints']} functions")
        
        if stats["missing_examples"] > 0:
            suggestions.append(f"Add examples to {stats['missing_examples']} elements")
        
        if report["percentage"] < 70:
            suggestions.append("Overall documentation quality is below 70%. Consider comprehensive review.")
        
        return suggestions


class DocumentationManager:
    """문서화 통합 관리자"""
    
    def __init__(self, config: Optional[DocumentationConfig] = None):
        self.config = config or DocumentationConfig()
        self.parser = CodeParser()
        self.docstring_generator = DocstringGenerator(self.config.docstring_style)
        self.readme_generator = ReadmeGenerator(self.config)
        self.api_generator = APIDocumentationGenerator(self.config)
        self.tutorial_generator = TutorialGenerator(self.config)
        self.quality_checker = DocumentationQualityChecker()
    
    def generate_complete_documentation(self, project_path: str) -> Dict[str, DocumentationResult]:
        """완전한 문서화 생성"""
        results = {}
        
        try:
            # 프로젝트 파일 스캔
            code_elements = self._scan_project(project_path)
            
            # README 생성
            readme_content = self.readme_generator.generate_readme(project_path, code_elements)
            results["readme"] = DocumentationResult(
                content=readme_content,
                format=DocumentFormat.MARKDOWN,
                metadata={"type": "readme"},
                generated_at=datetime.now()
            )
            
            # API 문서 생성
            api_content = self.api_generator.generate_api_docs(code_elements)
            results["api_docs"] = DocumentationResult(
                content=api_content,
                format=DocumentFormat.MARKDOWN,
                metadata={"type": "api_docs"},
                generated_at=datetime.now()
            )
            
            # 튜토리얼 생성
            tutorial_content = self.tutorial_generator.generate_tutorial(code_elements)
            results["tutorial"] = DocumentationResult(
                content=tutorial_content,
                format=DocumentFormat.MARKDOWN,
                metadata={"type": "tutorial"},
                generated_at=datetime.now()
            )
            
            # 품질 검사
            quality_report = self.quality_checker.check_documentation_quality(code_elements)
            results["quality_report"] = DocumentationResult(
                content=json.dumps(quality_report, indent=2),
                format=DocumentFormat.JSON,
                metadata={"type": "quality_report"},
                generated_at=datetime.now()
            )
            
            # 독스트링 자동 생성 제안
            missing_docstrings = [e for e in code_elements if not e.docstring and not e.is_private]
            if missing_docstrings:
                generated_docstrings = {}
                for element in missing_docstrings:
                    if element.type == "function":
                        generated_docstrings[element.name] = self.docstring_generator.generate_function_docstring(element)
                    elif element.type == "class":
                        generated_docstrings[element.name] = self.docstring_generator.generate_class_docstring(element)
                
                results["generated_docstrings"] = DocumentationResult(
                    content=json.dumps(generated_docstrings, indent=2),
                    format=DocumentFormat.JSON,
                    metadata={"type": "generated_docstrings"},
                    generated_at=datetime.now()
                )
        
        except Exception as e:
            logger.error(f"Failed to generate documentation: {e}")
            results["error"] = DocumentationResult(
                content=f"Error: {str(e)}",
                format=DocumentFormat.PLAIN_TEXT,
                metadata={"type": "error"},
                generated_at=datetime.now(),
                errors=[str(e)]
            )
        
        return results
    
    def _scan_project(self, project_path: str) -> List[CodeElement]:
        """프로젝트 스캔"""
        elements = []
        project_root = Path(project_path)
        
        # Python 파일 찾기
        python_files = list(project_root.rglob("*.py"))
        
        for py_file in python_files:
            # __pycache__, .git 등 제외
            if any(skip_dir in str(py_file) for skip_dir in ["__pycache__", ".git", "venv", ".env"]):
                continue
            
            try:
                file_elements = self.parser.parse_python_file(str(py_file))
                elements.extend(file_elements)
            except Exception as e:
                logger.warning(f"Failed to parse {py_file}: {e}")
        
        return elements
    
    def save_documentation(self, results: Dict[str, DocumentationResult], output_dir: str) -> Dict[str, str]:
        """문서 파일로 저장"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        saved_files = {}
        
        for doc_type, result in results.items():
            if result.format == DocumentFormat.MARKDOWN:
                filename = f"{doc_type}.md"
            elif result.format == DocumentFormat.JSON:
                filename = f"{doc_type}.json"
            elif result.format == DocumentFormat.HTML:
                filename = f"{doc_type}.html"
            else:
                filename = f"{doc_type}.txt"
            
            file_path = output_path / filename
            
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(result.content)
                
                saved_files[doc_type] = str(file_path)
                logger.info(f"Saved {doc_type} to {file_path}")
            
            except Exception as e:
                logger.error(f"Failed to save {doc_type}: {e}")
        
        return saved_files


# 편의 함수들
def generate_docstring(code: str, style: DocstringStyle = DocstringStyle.GOOGLE) -> str:
    """코드에서 독스트링 자동 생성"""
    generator = DocstringGenerator(style)
    parser = CodeParser()
    
    # 임시 파일로 코드 파싱
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                element = parser._parse_function(node, code, "temp.py")
                return generator.generate_function_docstring(element)
            elif isinstance(node, ast.ClassDef):
                element = parser._parse_class(node, code, "temp.py")
                return generator.generate_class_docstring(element)
    except Exception as e:
        logger.error(f"Failed to generate docstring: {e}")
        return ""
    
    return ""


def generate_project_docs(project_path: str, output_dir: str = "docs", 
                         config: Optional[DocumentationConfig] = None) -> Dict[str, str]:
    """프로젝트 문서 자동 생성"""
    if config is None:
        config = DocumentationConfig()
    
    manager = DocumentationManager(config)
    
    # 문서 생성
    results = manager.generate_complete_documentation(project_path)
    
    # 파일로 저장
    saved_files = manager.save_documentation(results, output_dir)
    
    return saved_files


def check_documentation_quality(project_path: str) -> Dict[str, Any]:
    """프로젝트 문서 품질 검사"""
    manager = DocumentationManager()
    elements = manager._scan_project(project_path)
    return manager.quality_checker.check_documentation_quality(elements)


# 메인 실행 예제
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Documentation Generator")
    parser.add_argument("project_path", help="Path to the project")
    parser.add_argument("--output", "-o", default="docs", help="Output directory")
    parser.add_argument("--format", choices=["markdown", "html"], default="markdown", help="Output format")
    parser.add_argument("--style", choices=["google", "numpy", "sphinx"], default="google", help="Docstring style")
    parser.add_argument("--name", help="Project name")
    parser.add_argument("--version", default="1.0.0", help="Project version")
    
    args = parser.parse_args()
    
    # 설정 생성
    config = DocumentationConfig(
        project_name=args.name or Path(args.project_path).name,
        project_version=args.version,
        output_format=DocumentFormat.MARKDOWN if args.format == "markdown" else DocumentFormat.HTML,
        docstring_style=DocstringStyle(args.style)
    )
    
    # 문서 생성
    print(f"Generating documentation for {config.project_name}...")
    saved_files = generate_project_docs(args.project_path, args.output, config)
    
    print("Generated files:")
    for doc_type, file_path in saved_files.items():
        print(f"  {doc_type}: {file_path}")
    
    # 품질 검사
    print("\nChecking documentation quality...")
    quality_report = check_documentation_quality(args.project_path)
    print(f"Documentation score: {quality_report['percentage']:.1f}%")
    
    if quality_report['issues']:
        print("Issues found:")
        for issue in quality_report['issues'][:5]:  # 처음 5개만 표시
            print(f"  - {issue}")
    
    if quality_report['suggestions']:
        print("Suggestions:")
        for suggestion in quality_report['suggestions']:
            print(f"  - {suggestion}")