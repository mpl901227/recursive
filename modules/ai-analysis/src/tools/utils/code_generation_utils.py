#!/usr/bin/env python3
"""
Code Generation Utilities
AI 어시스티드 코딩을 위한 코드 생성, 리팩토링, 최적화 도구들

주요 기능:
- 함수/클래스 자동 생성
- 코드 리팩토링 및 최적화
- 테스트 케이스 자동 생성
- 문서화 자동화
- 코드 스타일 통일
- 성능 최적화 제안
- 보안 패턴 적용
- 디자인 패턴 구현
"""

import ast
import re
import inspect
import textwrap
from typing import Dict, List, Any, Optional, Union, Callable, Type, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import json
import logging
from abc import ABC, abstractmethod
import asyncio
from datetime import datetime
import hashlib

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class CodeStyle(Enum):
    """코드 스타일"""
    PEP8 = "pep8"
    GOOGLE = "google"
    NUMPY = "numpy"
    SPHINX = "sphinx"
    CUSTOM = "custom"


class Language(Enum):
    """지원 언어"""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    JAVA = "java"
    CSHARP = "csharp"
    GO = "go"
    RUST = "rust"


class OptimizationType(Enum):
    """최적화 유형"""
    PERFORMANCE = "performance"
    MEMORY = "memory"
    READABILITY = "readability"
    MAINTAINABILITY = "maintainability"
    SECURITY = "security"


class TemplateType(Enum):
    """템플릿 유형"""
    FUNCTION = "function"
    CLASS = "class"
    MODULE = "module"
    TEST = "test"
    DOCUMENTATION = "documentation"
    API_ENDPOINT = "api_endpoint"
    DATA_MODEL = "data_model"


# 데이터 클래스들
@dataclass
class FunctionSpec:
    """함수 사양"""
    name: str
    description: str
    parameters: List[Dict[str, Any]] = field(default_factory=list)
    return_type: Optional[str] = None
    return_description: Optional[str] = None
    raises: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    complexity: str = "O(n)"
    is_async: bool = False
    decorators: List[str] = field(default_factory=list)


@dataclass
class ClassSpec:
    """클래스 사양"""
    name: str
    description: str
    base_classes: List[str] = field(default_factory=list)
    methods: List[FunctionSpec] = field(default_factory=list)
    attributes: List[Dict[str, Any]] = field(default_factory=list)
    class_variables: List[Dict[str, Any]] = field(default_factory=list)
    design_patterns: List[str] = field(default_factory=list)
    is_abstract: bool = False
    is_dataclass: bool = False


@dataclass
class CodeTemplate:
    """코드 템플릿"""
    name: str
    template_type: TemplateType
    language: Language
    template_string: str
    variables: Dict[str, Any] = field(default_factory=dict)
    dependencies: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)


@dataclass
class RefactoringResult:
    """리팩토링 결과"""
    original_code: str
    refactored_code: str
    improvements: List[str]
    warnings: List[str]
    metrics: Dict[str, Any]
    confidence_score: float


@dataclass
class OptimizationSuggestion:
    """최적화 제안"""
    type: OptimizationType
    description: str
    original_code: str
    optimized_code: str
    expected_improvement: str
    complexity_change: str
    confidence: float


class CodePatternLibrary:
    """코드 패턴 라이브러리"""
    
    def __init__(self):
        self.patterns = {
            "singleton": self._singleton_pattern,
            "factory": self._factory_pattern,
            "observer": self._observer_pattern,
            "decorator": self._decorator_pattern,
            "strategy": self._strategy_pattern,
            "builder": self._builder_pattern,
            "adapter": self._adapter_pattern,
            "command": self._command_pattern
        }
    
    def get_pattern(self, pattern_name: str, **kwargs) -> str:
        """디자인 패턴 코드 반환"""
        if pattern_name in self.patterns:
            return self.patterns[pattern_name](**kwargs)
        raise ValueError(f"Unknown pattern: {pattern_name}")
    
    def _singleton_pattern(self, class_name: str = "Singleton") -> str:
        """싱글톤 패턴"""
        return f'''
class {class_name}:
    """싱글톤 패턴 구현"""
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            # 초기화 코드
            self._initialized = True
'''
    
    def _factory_pattern(self, class_name: str = "Factory", 
                        product_types: List[str] = None) -> str:
        """팩토리 패턴"""
        if product_types is None:
            product_types = ["TypeA", "TypeB"]
        
        products = "\n".join([
            f"    elif product_type == '{ptype}':\n        return {ptype}()"
            for ptype in product_types
        ])
        
        return f'''
class {class_name}:
    """팩토리 패턴 구현"""
    
    @staticmethod
    def create_product(product_type: str):
        """제품 생성"""
        if product_type == '{product_types[0]}':
            return {product_types[0]}()
{products}
        else:
            raise ValueError(f"Unknown product type: {{product_type}}")
'''
    
    def _observer_pattern(self, subject_name: str = "Subject") -> str:
        """옵저버 패턴"""
        return f'''
from abc import ABC, abstractmethod
from typing import List

class Observer(ABC):
    """옵저버 인터페이스"""
    
    @abstractmethod
    def update(self, subject: '{subject_name}') -> None:
        pass

class {subject_name}:
    """옵저버 패턴 주체"""
    
    def __init__(self):
        self._observers: List[Observer] = []
        self._state = None
    
    def attach(self, observer: Observer) -> None:
        """옵저버 등록"""
        self._observers.append(observer)
    
    def detach(self, observer: Observer) -> None:
        """옵저버 해제"""
        self._observers.remove(observer)
    
    def notify(self) -> None:
        """모든 옵저버에게 알림"""
        for observer in self._observers:
            observer.update(self)
    
    @property
    def state(self):
        return self._state
    
    @state.setter
    def state(self, value):
        self._state = value
        self.notify()
'''
    
    def _decorator_pattern(self, component_name: str = "Component") -> str:
        """데코레이터 패턴"""
        return f'''
from abc import ABC, abstractmethod

class {component_name}(ABC):
    """컴포넌트 인터페이스"""
    
    @abstractmethod
    def operation(self) -> str:
        pass

class Concrete{component_name}({component_name}):
    """구체적인 컴포넌트"""
    
    def operation(self) -> str:
        return "Concrete{component_name}"

class {component_name}Decorator({component_name}):
    """데코레이터 기본 클래스"""
    
    def __init__(self, component: {component_name}):
        self._component = component
    
    def operation(self) -> str:
        return self._component.operation()

class ConcreteDecorator({component_name}Decorator):
    """구체적인 데코레이터"""
    
    def operation(self) -> str:
        return f"ConcreteDecorator({{super().operation()}})"
'''
    
    def _strategy_pattern(self, context_name: str = "Context") -> str:
        """전략 패턴"""
        return f'''
from abc import ABC, abstractmethod

class Strategy(ABC):
    """전략 인터페이스"""
    
    @abstractmethod
    def execute(self, data: Any) -> Any:
        pass

class {context_name}:
    """컨텍스트 클래스"""
    
    def __init__(self, strategy: Strategy):
        self._strategy = strategy
    
    def set_strategy(self, strategy: Strategy):
        """전략 변경"""
        self._strategy = strategy
    
    def execute_strategy(self, data: Any) -> Any:
        """전략 실행"""
        return self._strategy.execute(data)

class ConcreteStrategyA(Strategy):
    """구체적인 전략 A"""
    
    def execute(self, data: Any) -> Any:
        return f"Strategy A: {{data}}"

class ConcreteStrategyB(Strategy):
    """구체적인 전략 B"""
    
    def execute(self, data: Any) -> Any:
        return f"Strategy B: {{data}}"
'''
    
    def _builder_pattern(self, product_name: str = "Product") -> str:
        """빌더 패턴"""
        return f'''
class {product_name}:
    """빌더로 생성될 제품"""
    
    def __init__(self):
        self.part_a = None
        self.part_b = None
        self.part_c = None
    
    def __str__(self):
        return f"{product_name}(a={{self.part_a}}, b={{self.part_b}}, c={{self.part_c}})"

class {product_name}Builder:
    """빌더 클래스"""
    
    def __init__(self):
        self._product = {product_name}()
    
    def set_part_a(self, value: Any) -> '{product_name}Builder':
        """Part A 설정"""
        self._product.part_a = value
        return self
    
    def set_part_b(self, value: Any) -> '{product_name}Builder':
        """Part B 설정"""
        self._product.part_b = value
        return self
    
    def set_part_c(self, value: Any) -> '{product_name}Builder':
        """Part C 설정"""
        self._product.part_c = value
        return self
    
    def build(self) -> {product_name}:
        """제품 빌드"""
        result = self._product
        self._product = {product_name}()  # 새로운 인스턴스로 리셋
        return result
'''
    
    def _adapter_pattern(self, target_name: str = "Target", 
                        adaptee_name: str = "Adaptee") -> str:
        """어댑터 패턴"""
        return f'''
class {target_name}:
    """타겟 인터페이스"""
    
    def request(self) -> str:
        return "Target: Default behavior"

class {adaptee_name}:
    """어댑티 클래스"""
    
    def specific_request(self) -> str:
        return "Special behavior"

class Adapter({target_name}):
    """어댑터 클래스"""
    
    def __init__(self, adaptee: {adaptee_name}):
        self._adaptee = adaptee
    
    def request(self) -> str:
        return f"Adapter: {{self._adaptee.specific_request()}}"
'''
    
    def _command_pattern(self, command_name: str = "Command") -> str:
        """명령 패턴"""
        return f'''
from abc import ABC, abstractmethod

class {command_name}(ABC):
    """명령 인터페이스"""
    
    @abstractmethod
    def execute(self) -> None:
        pass

class SimpleCommand({command_name}):
    """간단한 명령"""
    
    def __init__(self, payload: str):
        self._payload = payload
    
    def execute(self) -> None:
        print(f"SimpleCommand: {{self._payload}}")

class ComplexCommand({command_name}):
    """복잡한 명령"""
    
    def __init__(self, receiver, a: str, b: str):
        self._receiver = receiver
        self._a = a
        self._b = b
    
    def execute(self) -> None:
        self._receiver.do_something(self._a)
        self._receiver.do_something_else(self._b)

class Invoker:
    """명령 호출자"""
    
    def __init__(self):
        self._on_start = None
        self._on_finish = None
    
    def set_on_start(self, command: {command_name}):
        self._on_start = command
    
    def set_on_finish(self, command: {command_name}):
        self._on_finish = command
    
    def do_something_important(self):
        if self._on_start:
            self._on_start.execute()
        
        print("Invoker: doing something important...")
        
        if self._on_finish:
            self._on_finish.execute()
'''


class CodeGenerator:
    """코드 생성기 메인 클래스"""
    
    def __init__(self, style: CodeStyle = CodeStyle.PEP8):
        self.style = style
        self.templates = {}
        self.pattern_library = CodePatternLibrary()
        self._load_templates()
    
    def _load_templates(self):
        """템플릿 로드"""
        self.templates = {
            TemplateType.FUNCTION: self._get_function_template(),
            TemplateType.CLASS: self._get_class_template(),
            TemplateType.MODULE: self._get_module_template(),
            TemplateType.TEST: self._get_test_template(),
            TemplateType.API_ENDPOINT: self._get_api_endpoint_template(),
            TemplateType.DATA_MODEL: self._get_data_model_template()
        }
    
    def generate_function(self, spec: FunctionSpec) -> str:
        """함수 생성"""
        try:
            # 매개변수 문자열 생성
            params = self._format_parameters(spec.parameters)
            
            # 반환 타입 문자열
            return_type = f" -> {spec.return_type}" if spec.return_type else ""
            
            # 데코레이터
            decorators = "\n".join([f"@{dec}" for dec in spec.decorators])
            decorator_prefix = decorators + "\n" if decorators else ""
            
            # 함수 시그니처
            async_prefix = "async " if spec.is_async else ""
            signature = f"{async_prefix}def {spec.name}({params}){return_type}:"
            
            # 독스트링 생성
            docstring = self._generate_docstring(spec)
            
            # 기본 구현
            if spec.is_async:
                body = '    pass  # TODO: Implement async function'
            else:
                body = '    pass  # TODO: Implement function'
            
            # 전체 함수 조합
            function_code = f'''{decorator_prefix}{signature}
{docstring}
{body}'''
            
            return self._format_code(function_code)
            
        except Exception as e:
            logger.error(f"Function generation failed: {e}")
            raise
    
    def generate_class(self, spec: ClassSpec) -> str:
        """클래스 생성"""
        try:
            # 기본 클래스
            bases = f"({', '.join(spec.base_classes)})" if spec.base_classes else ""
            
            # 데코레이터 (데이터클래스 등)
            decorators = []
            if spec.is_dataclass:
                decorators.append("@dataclass")
            
            decorator_prefix = "\n".join(decorators) + "\n" if decorators else ""
            
            # 클래스 시그니처
            class_signature = f"class {spec.name}{bases}:"
            
            # 클래스 독스트링
            class_docstring = f'    """{spec.description}"""'
            
            # 클래스 변수
            class_vars = self._format_class_variables(spec.class_variables)
            
            # 속성 (데이터클래스가 아닌 경우)
            attributes = self._format_attributes(spec.attributes) if not spec.is_dataclass else ""
            
            # __init__ 메서드 (데이터클래스가 아닌 경우)
            init_method = self._generate_init_method(spec) if not spec.is_dataclass else ""
            
            # 메서드들
            methods = "\n\n".join([
                self._indent_code(self.generate_function(method), 1)
                for method in spec.methods
            ])
            
            # 전체 클래스 조합
            parts = [
                decorator_prefix + class_signature,
                class_docstring,
                class_vars,
                attributes,
                init_method,
                methods
            ]
            
            class_code = "\n\n".join(part for part in parts if part.strip())
            
            return self._format_code(class_code)
            
        except Exception as e:
            logger.error(f"Class generation failed: {e}")
            raise
    
    def generate_module(self, name: str, description: str, 
                       classes: List[ClassSpec] = None,
                       functions: List[FunctionSpec] = None,
                       imports: List[str] = None) -> str:
        """모듈 생성"""
        try:
            parts = []
            
            # 모듈 헤더
            header = f'''#!/usr/bin/env python3
"""
{name}
{description}
"""

'''
            parts.append(header)
            
            # Import 문
            if imports:
                import_section = "\n".join(imports) + "\n\n"
                parts.append(import_section)
            
            # 클래스들
            if classes:
                for class_spec in classes:
                    parts.append(self.generate_class(class_spec))
                    parts.append("\n\n")
            
            # 함수들
            if functions:
                for func_spec in functions:
                    parts.append(self.generate_function(func_spec))
                    parts.append("\n\n")
            
            # 메인 섹션
            main_section = '''
if __name__ == "__main__":
    pass
'''
            parts.append(main_section)
            
            return "".join(parts)
            
        except Exception as e:
            logger.error(f"Module generation failed: {e}")
            raise
    
    def generate_test_suite(self, target_spec: Union[FunctionSpec, ClassSpec]) -> str:
        """테스트 스위트 생성"""
        try:
            if isinstance(target_spec, FunctionSpec):
                return self._generate_function_tests(target_spec)
            elif isinstance(target_spec, ClassSpec):
                return self._generate_class_tests(target_spec)
            else:
                raise ValueError("Invalid target specification")
                
        except Exception as e:
            logger.error(f"Test generation failed: {e}")
            raise
    
    def generate_api_endpoint(self, endpoint_name: str, method: str, 
                            path: str, request_model: str = None,
                            response_model: str = None) -> str:
        """API 엔드포인트 생성 (FastAPI 기준)"""
        try:
            method_lower = method.lower()
            
            # 파라미터 설정
            params = []
            if request_model and method_lower in ['post', 'put', 'patch']:
                params.append(f"request: {request_model}")
            
            param_str = ", ".join(params)
            response_type = f" -> {response_model}" if response_model else ""
            
            endpoint_code = f'''
@app.{method_lower}("{path}")
async def {endpoint_name}({param_str}){response_type}:
    """
    {endpoint_name.replace('_', ' ').title()} endpoint
    
    Args:
        {param_str.replace(':', ': ')}
    
    Returns:
        {response_model or 'Response data'}
    """
    try:
        # TODO: Implement endpoint logic
        pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
'''
            
            return self._format_code(endpoint_code)
            
        except Exception as e:
            logger.error(f"API endpoint generation failed: {e}")
            raise
    
    def generate_data_model(self, model_name: str, fields: List[Dict[str, Any]],
                           framework: str = "pydantic") -> str:
        """데이터 모델 생성"""
        try:
            if framework == "pydantic":
                return self._generate_pydantic_model(model_name, fields)
            elif framework == "dataclass":
                return self._generate_dataclass_model(model_name, fields)
            elif framework == "sqlalchemy":
                return self._generate_sqlalchemy_model(model_name, fields)
            else:
                raise ValueError(f"Unsupported framework: {framework}")
                
        except Exception as e:
            logger.error(f"Data model generation failed: {e}")
            raise
    
    def _format_parameters(self, parameters: List[Dict[str, Any]]) -> str:
        """매개변수 형식화"""
        if not parameters:
            return ""
        
        param_strings = []
        for param in parameters:
            name = param['name']
            param_type = param.get('type', '')
            default = param.get('default')
            
            param_str = name
            if param_type:
                param_str += f": {param_type}"
            if default is not None:
                param_str += f" = {repr(default)}"
            
            param_strings.append(param_str)
        
        return ", ".join(param_strings)
    
    def _generate_docstring(self, spec: FunctionSpec) -> str:
        """독스트링 생성"""
        lines = [f'    """{spec.description}']
        
        if spec.parameters:
            lines.append("")
            lines.append("    Args:")
            for param in spec.parameters:
                param_desc = param.get('description', 'Parameter description')
                param_type = param.get('type', '')
                type_info = f" ({param_type})" if param_type else ""
                lines.append(f"        {param['name']}{type_info}: {param_desc}")
        
        if spec.return_type:
            lines.append("")
            lines.append("    Returns:")
            return_desc = spec.return_description or f"{spec.return_type}: Return value description"
            lines.append(f"        {return_desc}")
        
        if spec.raises:
            lines.append("")
            lines.append("    Raises:")
            for exception in spec.raises:
                lines.append(f"        {exception}: Exception description")
        
        if spec.examples:
            lines.append("")
            lines.append("    Examples:")
            for example in spec.examples:
                lines.append(f"        >>> {example}")
        
        lines.append('    """')
        return "\n".join(lines)
    
    def _format_class_variables(self, class_vars: List[Dict[str, Any]]) -> str:
        """클래스 변수 형식화"""
        if not class_vars:
            return ""
        
        lines = []
        for var in class_vars:
            name = var['name']
            value = var.get('value', 'None')
            var_type = var.get('type', '')
            
            if var_type:
                lines.append(f"    {name}: {var_type} = {repr(value)}")
            else:
                lines.append(f"    {name} = {repr(value)}")
        
        return "\n".join(lines)
    
    def _format_attributes(self, attributes: List[Dict[str, Any]]) -> str:
        """인스턴스 속성 형식화"""
        if not attributes:
            return ""
        
        lines = ["    # Instance attributes"]
        for attr in attributes:
            name = attr['name']
            description = attr.get('description', 'Attribute description')
            lines.append(f"    # {name}: {description}")
        
        return "\n".join(lines)
    
    def _generate_init_method(self, spec: ClassSpec) -> str:
        """__init__ 메서드 생성"""
        if not spec.attributes:
            return ""
        
        # 매개변수 생성
        params = ["self"]
        assignments = []
        
        for attr in spec.attributes:
            name = attr['name']
            attr_type = attr.get('type', '')
            default = attr.get('default')
            
            param_str = name
            if attr_type:
                param_str += f": {attr_type}"
            if default is not None:
                param_str += f" = {repr(default)}"
            
            params.append(param_str)
            assignments.append(f"        self.{name} = {name}")
        
        param_str = ", ".join(params)
        assignment_str = "\n".join(assignments)
        
        return f'''    def __init__({param_str}):
        """Initialize the instance."""
{assignment_str}'''
    
    def _generate_function_tests(self, spec: FunctionSpec) -> str:
        """함수 테스트 생성"""
        test_name = f"Test{spec.name.title()}"
        method_name = f"test_{spec.name}"
        
        return f'''
import unittest
from unittest.mock import Mock, patch

class {test_name}(unittest.TestCase):
    """Test cases for {spec.name} function"""
    
    def setUp(self):
        """Set up test fixtures."""
        pass
    
    def tearDown(self):
        """Clean up after tests."""
        pass
    
    def {method_name}_basic(self):
        """Test basic functionality."""
        # TODO: Implement basic test
        pass
    
    def {method_name}_edge_cases(self):
        """Test edge cases."""
        # TODO: Implement edge case tests
        pass
    
    def {method_name}_error_handling(self):
        """Test error handling."""
        # TODO: Implement error handling tests
        pass

if __name__ == '__main__':
    unittest.main()
'''
    
    def _generate_class_tests(self, spec: ClassSpec) -> str:
        """클래스 테스트 생성"""
        test_name = f"Test{spec.name}"
        
        method_tests = []
        for method in spec.methods:
            method_test = f'''
    def test_{method.name}(self):
        """Test {method.name} method."""
        # TODO: Implement {method.name} test
        pass'''
            method_tests.append(method_test)
        
        method_tests_str = "\n".join(method_tests)
        
        return f'''
import unittest
from unittest.mock import Mock, patch

class {test_name}(unittest.TestCase):
    """Test cases for {spec.name} class"""
    
    def setUp(self):
        """Set up test fixtures."""
        self.instance = {spec.name}()
    
    def tearDown(self):
        """Clean up after tests."""
        pass
    
    def test_initialization(self):
        """Test class initialization."""
        # TODO: Implement initialization test
        pass
{method_tests_str}

if __name__ == '__main__':
    unittest.main()
'''
    
    def _generate_pydantic_model(self, model_name: str, fields: List[Dict[str, Any]]) -> str:
        """Pydantic 모델 생성"""
        field_lines = []
        
        for field in fields:
            name = field['name']
            field_type = field.get('type', 'Any')
            description = field.get('description', '')
            default = field.get('default')
            
            field_str = f"    {name}: {field_type}"
            
            if default is not None:
                field_str += f" = {repr(default)}"
            elif field.get('optional', False):
                field_str += " = None"
            
            field_lines.append(field_str)
        
        fields_str = "\n".join(field_lines)
        
        return f'''
from dataclasses import dataclass, field
from typing import Optional, Any

@dataclass
class {model_name}:
    """{model_name} data model"""
    
{fields_str}
'''
    
    def _generate_sqlalchemy_model(self, model_name: str, fields: List[Dict[str, Any]]) -> str:
        """SQLAlchemy 모델 생성"""
        field_lines = []
        
        for field_info in fields:
            name = field_info['name']
            field_type = field_info.get('type', 'String')
            primary_key = field_info.get('primary_key', False)
            nullable = field_info.get('nullable', True)
            
            # SQLAlchemy 타입 매핑
            if field_type in ['str', 'string']:
                sa_type = 'String'
            elif field_type in ['int', 'integer']:
                sa_type = 'Integer'
            elif field_type in ['float']:
                sa_type = 'Float'
            elif field_type in ['bool', 'boolean']:
                sa_type = 'Boolean'
            elif field_type in ['datetime']:
                sa_type = 'DateTime'
            else:
                sa_type = 'String'
            
            field_str = f"    {name} = Column({sa_type}"
            
            if primary_key:
                field_str += ", primary_key=True"
            if not nullable:
                field_str += ", nullable=False"
            
            field_str += ")"
            field_lines.append(field_str)
        
        fields_str = "\n".join(field_lines)
        
        return f'''
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class {model_name}(Base):
    """{model_name} SQLAlchemy model"""
    __tablename__ = '{model_name.lower()}s'
    
{fields_str}
'''
    
    def _indent_code(self, code: str, levels: int = 1) -> str:
        """코드 들여쓰기"""
        indent = "    " * levels
        return "\n".join([indent + line if line.strip() else line for line in code.split("\n")])
    
    def _format_code(self, code: str) -> str:
        """코드 형식화"""
        # 기본적인 형식화 (실제로는 black, autopep8 등을 사용할 수 있음)
        lines = code.split("\n")
        formatted_lines = []
        
        for line in lines:
            # 불필요한 공백 제거
            formatted_line = line.rstrip()
            formatted_lines.append(formatted_line)
        
        # 연속된 빈 줄 정리
        result_lines = []
        prev_empty = False
        
        for line in formatted_lines:
            if line.strip() == "":
                if not prev_empty:
                    result_lines.append(line)
                prev_empty = True
            else:
                result_lines.append(line)
                prev_empty = False
        
        return "\n".join(result_lines)
    
    def _get_function_template(self) -> str:
        """함수 템플릿 반환"""
        return '''
def {name}({params}){return_type}:
    """{description}
    
    Args:
{args_doc}
    
    Returns:
{return_doc}
    """
    {body}
'''
    
    def _get_class_template(self) -> str:
        """클래스 템플릿 반환"""
        return '''
class {name}({bases}):
    """{description}"""
    
    def __init__(self{init_params}):
        """Initialize the {name} instance."""
        {init_body}
    
    {methods}
'''
    
    def _get_module_template(self) -> str:
        """모듈 템플릿 반환"""
        return '''#!/usr/bin/env python3
"""
{name}
{description}
"""

{imports}

{constants}

{classes}

{functions}

if __name__ == "__main__":
    pass
'''
    
    def _get_test_template(self) -> str:
        """테스트 템플릿 반환"""
        return '''
import unittest
from unittest.mock import Mock, patch

class Test{class_name}(unittest.TestCase):
    """Test cases for {class_name}"""
    
    def setUp(self):
        """Set up test fixtures."""
        pass
    
    def tearDown(self):
        """Clean up after tests."""
        pass
    
    {test_methods}

if __name__ == '__main__':
    unittest.main()
'''
    
    def _get_api_endpoint_template(self) -> str:
        """API 엔드포인트 템플릿 반환"""
        return '''
@app.{method}("{path}")
async def {name}({params}){return_type}:
    """
    {description}
    """
    try:
        {body}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
'''
    
    def _get_data_model_template(self) -> str:
        """데이터 모델 템플릿 반환"""
        return '''
from pydantic import BaseModel
from typing import Optional

class {name}(BaseModel):
    """{description}"""
    
    {fields}
    
    class Config:
        extra = "forbid"
'''


class CodeRefactorer:
    """코드 리팩토링 도구"""
    
    def __init__(self):
        self.optimizers = {
            OptimizationType.PERFORMANCE: self._optimize_performance,
            OptimizationType.MEMORY: self._optimize_memory,
            OptimizationType.READABILITY: self._optimize_readability,
            OptimizationType.MAINTAINABILITY: self._optimize_maintainability,
            OptimizationType.SECURITY: self._optimize_security
        }
    
    def refactor_code(self, code: str, target_style: CodeStyle = CodeStyle.PEP8) -> RefactoringResult:
        """코드 리팩토링"""
        try:
            original_code = code
            refactored_code = code
            improvements = []
            warnings = []
            
            # AST 파싱
            try:
                tree = ast.parse(code)
            except SyntaxError as e:
                warnings.append(f"Syntax error: {e}")
                return RefactoringResult(
                    original_code=original_code,
                    refactored_code=refactored_code,
                    improvements=improvements,
                    warnings=warnings,
                    metrics={},
                    confidence_score=0.0
                )
            
            # 다양한 리팩토링 적용
            refactored_code = self._apply_naming_conventions(refactored_code)
            if refactored_code != code:
                improvements.append("Applied naming conventions")
            
            refactored_code = self._remove_duplicate_code(refactored_code)
            if len(refactored_code.split('\n')) < len(code.split('\n')):
                improvements.append("Removed duplicate code")
            
            refactored_code = self._simplify_conditionals(refactored_code)
            refactored_code = self._optimize_imports(refactored_code)
            
            # 메트릭 계산
            metrics = self._calculate_metrics(original_code, refactored_code)
            
            # 신뢰도 점수 계산
            confidence_score = self._calculate_confidence(improvements, warnings)
            
            return RefactoringResult(
                original_code=original_code,
                refactored_code=refactored_code,
                improvements=improvements,
                warnings=warnings,
                metrics=metrics,
                confidence_score=confidence_score
            )
            
        except Exception as e:
            logger.error(f"Refactoring failed: {e}")
            return RefactoringResult(
                original_code=code,
                refactored_code=code,
                improvements=[],
                warnings=[f"Refactoring failed: {e}"],
                metrics={},
                confidence_score=0.0
            )
    
    def suggest_optimizations(self, code: str) -> List[OptimizationSuggestion]:
        """최적화 제안"""
        suggestions = []
        
        try:
            tree = ast.parse(code)
            
            # 성능 최적화 제안
            suggestions.extend(self._suggest_performance_optimizations(code, tree))
            
            # 메모리 최적화 제안
            suggestions.extend(self._suggest_memory_optimizations(code, tree))
            
            # 가독성 최적화 제안
            suggestions.extend(self._suggest_readability_optimizations(code, tree))
            
            # 보안 최적화 제안
            suggestions.extend(self._suggest_security_optimizations(code, tree))
            
        except SyntaxError:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.READABILITY,
                description="Fix syntax errors",
                original_code=code,
                optimized_code="# Fix syntax errors first",
                expected_improvement="Code will be executable",
                complexity_change="N/A",
                confidence=1.0
            ))
        
        return suggestions
    
    def _apply_naming_conventions(self, code: str) -> str:
        """명명 규칙 적용"""
        # 간단한 naming convention 적용 예제
        lines = code.split('\n')
        updated_lines = []
        
        for line in lines:
            # 함수/변수명에서 camelCase를 snake_case로 변환
            line = re.sub(r'def ([a-z]+)([A-Z][a-z]+)', r'def \1_\2', line)
            line = re.sub(r'([a-z])([A-Z])', r'\1_\2', line)
            updated_lines.append(line)
        
        return '\n'.join(updated_lines)
    
    def _remove_duplicate_code(self, code: str) -> str:
        """중복 코드 제거"""
        lines = code.split('\n')
        unique_lines = []
        seen_lines = set()
        
        for line in lines:
            stripped = line.strip()
            if stripped and stripped not in seen_lines:
                unique_lines.append(line)
                seen_lines.add(stripped)
            elif not stripped:  # 빈 줄은 유지
                unique_lines.append(line)
        
        return '\n'.join(unique_lines)
    
    def _simplify_conditionals(self, code: str) -> str:
        """조건문 단순화"""
        # if True: 또는 if False: 같은 명백한 조건문 제거
        code = re.sub(r'if True:\s*\n\s*', '', code)
        code = re.sub(r'if False:\s*\n.*?\n', '', code, flags=re.DOTALL)
        
        return code
    
    def _optimize_imports(self, code: str) -> str:
        """import 최적화"""
        lines = code.split('\n')
        import_lines = []
        other_lines = []
        
        for line in lines:
            if line.startswith('import ') or line.startswith('from '):
                import_lines.append(line)
            else:
                other_lines.append(line)
        
        # import 정렬 및 중복 제거
        import_lines = sorted(list(set(import_lines)))
        
        # 표준 라이브러리, 서드파티, 로컬 import 순으로 그룹화
        std_imports = []
        third_party_imports = []
        local_imports = []
        
        for imp in import_lines:
            if any(imp.startswith(f'import {lib}') or imp.startswith(f'from {lib}') 
                   for lib in ['os', 'sys', 're', 'json', 'datetime', 'typing']):
                std_imports.append(imp)
            elif imp.startswith('from .') or imp.startswith('import .'):
                local_imports.append(imp)
            else:
                third_party_imports.append(imp)
        
        # 재조합
        organized_imports = std_imports
        if third_party_imports:
            if organized_imports:
                organized_imports.append('')
            organized_imports.extend(third_party_imports)
        if local_imports:
            if organized_imports:
                organized_imports.append('')
            organized_imports.extend(local_imports)
        
        return '\n'.join(organized_imports + [''] + other_lines)
    
    def _suggest_performance_optimizations(self, code: str, tree: ast.AST) -> List[OptimizationSuggestion]:
        """성능 최적화 제안"""
        suggestions = []
        
        # 리스트 컴프리헨션 제안
        if 'for ' in code and 'append(' in code:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.PERFORMANCE,
                description="Use list comprehension instead of explicit loop",
                original_code="# Loop with append detected",
                optimized_code="# Use [expression for item in iterable]",
                expected_improvement="2-3x faster execution",
                complexity_change="Same O(n)",
                confidence=0.8
            ))
        
        # 문자열 연결 최적화
        if '+=' in code and 'str' in code:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.PERFORMANCE,
                description="Use join() for multiple string concatenations",
                original_code="# String concatenation with += detected",
                optimized_code="# Use ''.join(string_list)",
                expected_improvement="O(n) instead of O(n²)",
                complexity_change="O(n²) → O(n)",
                confidence=0.9
            ))
        
        return suggestions
    
    def _suggest_memory_optimizations(self, code: str, tree: ast.AST) -> List[OptimizationSuggestion]:
        """메모리 최적화 제안"""
        suggestions = []
        
        # 제너레이터 사용 제안
        if 'return [' in code and 'for ' in code:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.MEMORY,
                description="Use generator expression for large datasets",
                original_code="# List comprehension detected",
                optimized_code="# Use (expression for item in iterable)",
                expected_improvement="Lazy evaluation, lower memory usage",
                complexity_change="Same time, O(1) space",
                confidence=0.7
            ))
        
        return suggestions
    
    def _suggest_readability_optimizations(self, code: str, tree: ast.AST) -> List[OptimizationSuggestion]:
        """가독성 최적화 제안"""
        suggestions = []
        
        # 긴 함수 분할 제안
        lines = code.split('\n')
        if len(lines) > 50:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.READABILITY,
                description="Split long function into smaller functions",
                original_code=f"# Function with {len(lines)} lines",
                optimized_code="# Split into multiple focused functions",
                expected_improvement="Better maintainability and testing",
                complexity_change="Same overall complexity",
                confidence=0.6
            ))
        
        return suggestions
    
    def _suggest_security_optimizations(self, code: str, tree: ast.AST) -> List[OptimizationSuggestion]:
        """보안 최적화 제안"""
        suggestions = []
        
        # SQL 인젝션 위험 검사
        if 'execute(' in code and '"' in code and '+' in code:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.SECURITY,
                description="Use parameterized queries to prevent SQL injection",
                original_code="# String concatenation in SQL detected",
                optimized_code="# Use cursor.execute(query, params)",
                expected_improvement="Prevents SQL injection attacks",
                complexity_change="Same complexity",
                confidence=0.9
            ))
        
        # eval() 사용 경고
        if 'eval(' in code:
            suggestions.append(OptimizationSuggestion(
                type=OptimizationType.SECURITY,
                description="Avoid eval() function for security reasons",
                original_code="# eval() usage detected",
                optimized_code="# Use ast.literal_eval() or safer alternatives",
                expected_improvement="Prevents code injection",
                complexity_change="Same complexity",
                confidence=1.0
            ))
        
        return suggestions
    
    def _optimize_performance(self, code: str) -> str:
        """성능 최적화"""
        # 실제 구현에서는 더 복잡한 최적화 로직
        return code
    
    def _optimize_memory(self, code: str) -> str:
        """메모리 최적화"""
        return code
    
    def _optimize_readability(self, code: str) -> str:
        """가독성 최적화"""
        return code
    
    def _optimize_maintainability(self, code: str) -> str:
        """유지보수성 최적화"""
        return code
    
    def _optimize_security(self, code: str) -> str:
        """보안 최적화"""
        return code
    
    def _calculate_metrics(self, original: str, refactored: str) -> Dict[str, Any]:
        """메트릭 계산"""
        return {
            'original_lines': len(original.split('\n')),
            'refactored_lines': len(refactored.split('\n')),
            'line_reduction': len(original.split('\n')) - len(refactored.split('\n')),
            'character_reduction': len(original) - len(refactored)
        }
    
    def _calculate_confidence(self, improvements: List[str], warnings: List[str]) -> float:
        """신뢰도 점수 계산"""
        base_score = 0.5
        improvement_bonus = len(improvements) * 0.1
        warning_penalty = len(warnings) * 0.2
        
        return max(0.0, min(1.0, base_score + improvement_bonus - warning_penalty))


class CodeQualityAnalyzer:
    """코드 품질 분석기"""
    
    def __init__(self):
        pass
    
    def analyze_quality(self, code: str) -> Dict[str, Any]:
        """코드 품질 분석"""
        try:
            tree = ast.parse(code)
            
            analysis = {
                'complexity': self._calculate_complexity(tree),
                'maintainability': self._calculate_maintainability(code),
                'readability': self._calculate_readability(code),
                'test_coverage': self._estimate_test_coverage(code),
                'documentation': self._analyze_documentation(tree),
                'violations': self._find_style_violations(code),
                'suggestions': self._generate_improvement_suggestions(code, tree)
            }
            
            # 전체 점수 계산
            analysis['overall_score'] = self._calculate_overall_score(analysis)
            
            return analysis
            
        except SyntaxError as e:
            return {
                'error': f"Syntax error: {e}",
                'overall_score': 0.0
            }
    
    def _calculate_complexity(self, tree: ast.AST) -> Dict[str, Any]:
        """복잡도 계산"""
        complexity = {'cyclomatic': 1, 'cognitive': 0, 'halstead': {}}
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                complexity['cyclomatic'] += 1
                complexity['cognitive'] += 1
            elif isinstance(node, ast.ExceptHandler):
                complexity['cyclomatic'] += 1
        
        return complexity
    
    def _calculate_maintainability(self, code: str) -> float:
        """유지보수성 계산"""
        lines = code.split('\n')
        
        # 함수 길이 체크
        long_functions = len([l for l in lines if 'def ' in l]) * 10
        
        # 주석 비율
        comment_lines = len([l for l in lines if l.strip().startswith('#')])
        comment_ratio = comment_lines / len(lines) if lines else 0
        
        # 기본 점수에서 패널티/보너스 적용
        score = 0.8 - (long_functions * 0.01) + (comment_ratio * 0.2)
        
        return max(0.0, min(1.0, score))
    
    def _calculate_readability(self, code: str) -> float:
        """가독성 계산"""
        lines = code.split('\n')
        
        # 평균 줄 길이
        avg_line_length = sum(len(l) for l in lines) / len(lines) if lines else 0
        
        # 변수명 길이 (간단한 휴리스틱)
        var_names = re.findall(r'\b[a-z_][a-z0-9_]*\b', code)
        avg_var_length = sum(len(name) for name in var_names) / len(var_names) if var_names else 0
        
        # 가독성 점수 계산
        line_score = 1.0 - min(1.0, max(0.0, (avg_line_length - 80) / 40))
        var_score = min(1.0, avg_var_length / 10)
        
        return (line_score + var_score) / 2
    
    def _estimate_test_coverage(self, code: str) -> float:
        """테스트 커버리지 추정"""
        # 간단한 휴리스틱: test_ 함수의 비율
        total_functions = len(re.findall(r'def \w+', code))
        test_functions = len(re.findall(r'def test_\w+', code))
        
        if total_functions == 0:
            return 0.0
        
        return min(1.0, test_functions / total_functions)
    
    def _analyze_documentation(self, tree: ast.AST) -> Dict[str, Any]:
        """문서화 분석"""
        doc_info = {
            'module_docstring': False,
            'function_docstrings': 0,
            'class_docstrings': 0,
            'total_functions': 0,
            'total_classes': 0
        }
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Module):
                doc_info['module_docstring'] = ast.get_docstring(node) is not None
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                doc_info['total_functions'] += 1
                if ast.get_docstring(node):
                    doc_info['function_docstrings'] += 1
            elif isinstance(node, ast.ClassDef):
                doc_info['total_classes'] += 1
                if ast.get_docstring(node):
                    doc_info['class_docstrings'] += 1
        
        # 문서화 비율 계산
        total_items = doc_info['total_functions'] + doc_info['total_classes']
        documented_items = doc_info['function_docstrings'] + doc_info['class_docstrings']
        
        doc_info['documentation_ratio'] = documented_items / total_items if total_items > 0 else 0.0
        
        return doc_info
    
    def _find_style_violations(self, code: str) -> List[str]:
        """스타일 위반 찾기"""
        violations = []
        lines = code.split('\n')
        
        for i, line in enumerate(lines, 1):
            # 긴 줄
            if len(line) > 88:
                violations.append(f"Line {i}: Line too long ({len(line)} > 88 characters)")
            
            # 탭 사용
            if '\t' in line:
                violations.append(f"Line {i}: Use spaces instead of tabs")
            
            # 함수명 규칙
            if re.search(r'def [A-Z]', line):
                violations.append(f"Line {i}: Function names should be lowercase with underscores")
        
        return violations
    
    def _generate_improvement_suggestions(self, code: str, tree: ast.AST) -> List[str]:
        """개선 제안 생성"""
        suggestions = []
        
        # 함수 길이 체크
        lines = code.split('\n')
        if len(lines) > 50:
            suggestions.append("Consider breaking down long functions into smaller ones")
        
        # 중복 코드 체크
        unique_lines = set(line.strip() for line in lines if line.strip())
        if len(unique_lines) < len(lines) * 0.8:
            suggestions.append("Remove duplicate code and extract common functionality")
        
        # 에러 처리 체크
        if 'try:' not in code and ('open(' in code or 'requests.' in code):
            suggestions.append("Add proper error handling for I/O operations")
        
        return suggestions
    
    def _calculate_overall_score(self, analysis: Dict[str, Any]) -> float:
        """전체 점수 계산"""
        weights = {
            'maintainability': 0.3,
            'readability': 0.25,
            'test_coverage': 0.2,
            'documentation_ratio': 0.15,
            'style_compliance': 0.1
        }
        
        # 스타일 준수 점수
        style_score = max(0.0, 1.0 - len(analysis.get('violations', [])) * 0.1)
        
        # 문서화 점수
        doc_ratio = analysis.get('documentation', {}).get('documentation_ratio', 0.0)
        
        # 가중 평균 계산
        overall = (
            analysis.get('maintainability', 0.0) * weights['maintainability'] +
            analysis.get('readability', 0.0) * weights['readability'] +
            analysis.get('test_coverage', 0.0) * weights['test_coverage'] +
            doc_ratio * weights['documentation_ratio'] +
            style_score * weights['style_compliance']
        )
        
        return round(overall, 2)


# 팩토리 및 헬퍼 함수들
class CodeGenerationFactory:
    """코드 생성 팩토리"""
    
    @staticmethod
    def create_generator(style: CodeStyle = CodeStyle.PEP8) -> CodeGenerator:
        """코드 생성기 생성"""
        return CodeGenerator(style)
    
    @staticmethod
    def create_refactorer() -> CodeRefactorer:
        """리팩토링 도구 생성"""
        return CodeRefactorer()
    
    @staticmethod
    def create_analyzer() -> CodeQualityAnalyzer:
        """품질 분석기 생성"""
        return CodeQualityAnalyzer()
    
    @staticmethod
    def create_pattern_library() -> CodePatternLibrary:
        """패턴 라이브러리 생성"""
        return CodePatternLibrary()


# 전역 인스턴스
_default_generator = None
_default_refactorer = None
_default_analyzer = None

def get_code_generator(style: CodeStyle = CodeStyle.PEP8) -> CodeGenerator:
    """기본 코드 생성기 반환"""
    global _default_generator
    if _default_generator is None:
        _default_generator = CodeGenerator(style)
    return _default_generator

def get_code_refactorer() -> CodeRefactorer:
    """기본 리팩토링 도구 반환"""
    global _default_refactorer
    if _default_refactorer is None:
        _default_refactorer = CodeRefactorer()
    return _default_refactorer

def get_quality_analyzer() -> CodeQualityAnalyzer:
    """기본 품질 분석기 반환"""
    global _default_analyzer
    if _default_analyzer is None:
        _default_analyzer = CodeQualityAnalyzer()
    return _default_analyzer

# 편의 함수들
def generate_function_from_spec(spec: FunctionSpec) -> str:
    """함수 사양에서 함수 생성 (편의 함수)"""
    return get_code_generator().generate_function(spec)

def generate_class_from_spec(spec: ClassSpec) -> str:
    """클래스 사양에서 클래스 생성 (편의 함수)"""
    return get_code_generator().generate_class(spec)

def refactor_code_snippet(code: str) -> RefactoringResult:
    """코드 스니펫 리팩토링 (편의 함수)"""
    return get_code_refactorer().refactor_code(code)

def analyze_code_quality(code: str) -> Dict[str, Any]:
    """코드 품질 분석 (편의 함수)"""
    return get_quality_analyzer().analyze_quality(code)

def get_design_pattern(pattern_name: str, **kwargs) -> str:
    """디자인 패턴 코드 생성 (편의 함수)"""
    library = CodePatternLibrary()
    return library.get_pattern(pattern_name, **kwargs)

# 사용 예제 (문서화용)
if __name__ == "__main__":
    # 함수 생성 예제
    print("=== Function Generation Example ===")
    
    func_spec = FunctionSpec(
        name="calculate_average",
        description="Calculate the average of a list of numbers",
        parameters=[
            {"name": "numbers", "type": "List[float]", "description": "List of numbers"},
            {"name": "precision", "type": "int", "default": 2, "description": "Decimal precision"}
        ],
        return_type="float",
        return_description="Average value rounded to specified precision",
        raises=["ValueError", "ZeroDivisionError"],
        examples=["calculate_average([1, 2, 3, 4, 5])", "calculate_average([1.5, 2.7, 3.1], precision=1)"]
    )
    
    generator = get_code_generator()
    generated_function = generator.generate_function(func_spec)
    print(generated_function)
    
    # 클래스 생성 예제
    print("\n=== Class Generation Example ===")
    
    class_spec = ClassSpec(
        name="DataProcessor",
        description="A class for processing and analyzing data",
        attributes=[
            {"name": "data", "type": "List[Any]", "description": "Raw data to process"},
            {"name": "processed", "type": "bool", "default": False, "description": "Processing status"}
        ],
        methods=[
            FunctionSpec(
                name="process_data",
                description="Process the raw data",
                parameters=[{"name": "method", "type": "str", "default": "default"}],
                return_type="bool"
            ),
            FunctionSpec(
                name="get_statistics",
                description="Get statistical information about the data",
                return_type="Dict[str, Any]"
            )
        ]
    )
    
    generated_class = generator.generate_class(class_spec)
    print(generated_class)
    
    # 디자인 패턴 예제
    print("\n=== Design Pattern Example ===")
    
    pattern_library = CodePatternLibrary()
    singleton_code = pattern_library.get_pattern("singleton", class_name="DatabaseConnection")
    print(singleton_code)
    
    # 코드 리팩토링 예제
    print("\n=== Code Refactoring Example ===")
    
    sample_code = '''
def badFunction():
    x = 1
    y = 2
    z = 3
    if x == 1:
        if y == 2:
            if z == 3:
                return True
    return False

def anotherBadFunction():
    x = 1
    y = 2
    z = 3
    if x == 1:
        if y == 2:
            if z == 3:
                return True
    return False
'''
    
    refactorer = get_code_refactorer()
    refactoring_result = refactorer.refactor_code(sample_code)
    
    print("Original code quality issues found:")
    for improvement in refactoring_result.improvements:
        print(f"  - {improvement}")
    
    print(f"Confidence score: {refactoring_result.confidence_score}")
    
    # 최적화 제안 예제
    print("\n=== Optimization Suggestions Example ===")
    
    optimization_code = '''
def slow_function(items):
    result = ""
    for item in items:
        result += str(item)
    return result

def inefficient_search(data, target):
    found = []
    for item in data:
        if item == target:
            found.append(item)
    return found
'''
    
    suggestions = refactorer.suggest_optimizations(optimization_code)
    print("Optimization suggestions:")
    for suggestion in suggestions:
        print(f"  - {suggestion.type.value}: {suggestion.description}")
        print(f"    Expected improvement: {suggestion.expected_improvement}")
        print(f"    Confidence: {suggestion.confidence:.1%}")
    
    # 코드 품질 분석 예제
    print("\n=== Code Quality Analysis Example ===")
    
    quality_code = '''
def well_documented_function(data, threshold=0.5):
    """
    Process data based on a threshold value.
    
    Args:
        data (List[float]): Input data to process
        threshold (float): Threshold for filtering
    
    Returns:
        List[float]: Filtered data above threshold
    """
    try:
        result = [x for x in data if x > threshold]
        return result
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        return []

class DataAnalyzer:
    """Analyze data patterns and trends."""
    
    def __init__(self, data):
        self.data = data
        self.results = {}
    
    def analyze_trends(self):
        """Analyze trends in the data."""
        # Implementation here
        pass
'''
    
    analyzer = get_quality_analyzer()
    quality_analysis = analyzer.analyze_quality(quality_code)
    
    print(f"Overall quality score: {quality_analysis['overall_score']:.2f}")
    print(f"Maintainability: {quality_analysis['maintainability']:.2f}")
    print(f"Readability: {quality_analysis['readability']:.2f}")
    print(f"Documentation ratio: {quality_analysis['documentation']['documentation_ratio']:.2f}")
    
    if quality_analysis['violations']:
        print("Style violations:")
        for violation in quality_analysis['violations'][:3]:  # Show first 3
            print(f"  - {violation}")
    
    if quality_analysis['suggestions']:
        print("Improvement suggestions:")
        for suggestion in quality_analysis['suggestions']:
            print(f"  - {suggestion}")
    
    # 데이터 모델 생성 예제
    print("\n=== Data Model Generation Example ===")
    
    user_fields = [
        {"name": "id", "type": "int", "description": "User ID"},
        {"name": "username", "type": "str", "description": "Username"},
        {"name": "email", "type": "str", "description": "Email address"},
        {"name": "created_at", "type": "datetime", "description": "Creation timestamp"},
        {"name": "is_active", "type": "bool", "default": True, "description": "Active status"}
    ]
    
    pydantic_model = generator.generate_data_model("User", user_fields, "pydantic")
    print("Pydantic Model:")
    print(pydantic_model)
    
    dataclass_model = generator.generate_data_model("User", user_fields, "dataclass")
    print("\nDataclass Model:")
    print(dataclass_model)
    
    # API 엔드포인트 생성 예제
    print("\n=== API Endpoint Generation Example ===")
    
    api_endpoint = generator.generate_api_endpoint(
        endpoint_name="create_user",
        method="POST",
        path="/api/users",
        request_model="UserCreateRequest",
        response_model="UserResponse"
    )
    print(api_endpoint)
    
    # 테스트 생성 예제
    print("\n=== Test Generation Example ===")
    
    test_func_spec = FunctionSpec(
        name="add_numbers",
        description="Add two numbers together",
        parameters=[
            {"name": "a", "type": "int", "description": "First number"},
            {"name": "b", "type": "int", "description": "Second number"}
        ],
        return_type="int"
    )
    
    test_suite = generator.generate_test_suite(test_func_spec)
    print(test_suite)repr(default)}"
            elif field.get('optional', False):
                field_str += " = None"
            
            if description:
                field_str += f"  # {description}"
            
            field_lines.append(field_str)
        
        fields_str = "\n".join(field_lines)
        
        return f'''
from pydantic import BaseModel, Field
from typing import Optional, Any

class {model_name}(BaseModel):
    """{model_name} data model"""
    
{fields_str}
    
    class Config:
        """Pydantic configuration"""
        extra = "forbid"
        validate_assignment = True
'''
    
    def _generate_dataclass_model(self, model_name: str, fields: List[Dict[str, Any]]) -> str:
        """데이터클래스 모델 생성"""
        field_lines = []
        
        for field in fields:
            name = field['name']
            field_type = field.get('type', 'Any')
            default = field.get('default')
            
            field_str = f"    {name}: {field_type}"
            
            if default is not None:
                field_str += f" = {