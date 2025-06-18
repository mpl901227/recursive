"""
Common utilities and helpers for the MCP tools project.

This module provides shared functionality including:
- User and project management
- Validation helpers
- File system operations
- Utility functions for datetime, JSON, strings, collections, and type conversion
"""

# Validation helpers
from .validation_helper import (
    ValidationHelpers,
    ConversationValidationHelpers,
    UserValidationHelper  # 하위 호환성
)

# File system helpers
from .file_system_helper import (
    BaseFileHelper,
    ConversationFileHelper,
    BackupFileHelper,
    ConfigFileHelper,
    FileSystemConversationHelper  # 하위 호환성
)

# Utility classes
from .time_utils import (
    DateTimeUtils,
    TimeUtils  # 별칭
)

from .data_utils import (
    JsonUtils,
    DataUtils  # 별칭
)

from .text_utils import (
    StringUtils,
    TextUtils  # 별칭
)

from .list_dict_utils import (
    ListUtils,
    DictUtils
)

from .convert_utils import (
    ConversionUtils,
    ConvertUtils  # 별칭
)

# 새로 추가된 JavaScript 포팅 유틸리티들
from .path_utils import (
    PathUtils,
    normalize_path,
    resolve_path,
    find_existing_path
)

from .cache_utils import (
    LRUCache,
    CacheManager,
    CacheDecorator,
    get_cache_manager,
    get_file_cache,
    get_function_cache,
    get_dependency_cache,
    get_result_cache,
    cache_with_file_cache,
    cache_with_function_cache
)

from .async_utils import (
    AsyncUtils,
    TaskQueue,
    BatchResult,
    get_async_utils,
    get_task_queue,
    safe_operation,
    process_files_in_batches,
    concurrent_map,
    throttle,
    debounce
)

# Scripts 폴더에서 포팅된 유틸리티들
try:
    from .cost_prediction_utils import (
        TokenCounter,
        CostCalculator,
        WorkflowCostAnalyzer,
        calculate_message_cost,
        compare_model_costs,
        estimate_workflow_cost,
        get_cheapest_model_for_task,
        count_tokens
    )
except ImportError:
    # 의존성이 없으면 None으로 설정
    TokenCounter = None
    CostCalculator = None
    WorkflowCostAnalyzer = None
    calculate_message_cost = None
    compare_model_costs = None
    estimate_workflow_cost = None
    get_cheapest_model_for_task = None
    count_tokens = None


__all__ = [
    # Validation
    'ValidationHelpers',
    'ConversationValidationHelpers',
    'UserValidationHelper',
    
    # File system
    'BaseFileHelper',
    'ConversationFileHelper',
    'BackupFileHelper',
    'ConfigFileHelper',
    'FileSystemConversationHelper',  # 하위 호환성
    
    # Utils
    'DateTimeUtils',
    'TimeUtils',
    'JsonUtils',
    'DataUtils',
    'StringUtils',
    'TextUtils',
    'ListUtils',
    'DictUtils',
    'ConversionUtils',
    'ConvertUtils',
    
    # JavaScript 포팅 유틸리티들
    'PathUtils',
    'normalize_path',
    'resolve_path',
    'find_existing_path',
    'LRUCache',
    'CacheManager',
    'CacheDecorator',
    'get_cache_manager',
    'get_file_cache',
    'get_function_cache',
    'get_dependency_cache',
    'get_result_cache',
    'cache_with_file_cache',
    'cache_with_function_cache',
    'AsyncUtils',
    'TaskQueue',
    'BatchResult',
    'get_async_utils',
    'get_task_queue',
    'safe_operation',
    'process_files_in_batches',
    'concurrent_map',
    'throttle',
    'debounce',
    
    # Scripts 포팅 유틸리티들
    'TokenCounter',
    'CostCalculator',
    'WorkflowCostAnalyzer',
    'calculate_message_cost',
    'compare_model_costs',
    'estimate_workflow_cost',
    'get_cheapest_model_for_task',
    'count_tokens',
    
    # User/Project management (re-exported from core_logic)
    'UserProjectManager',
    'UserValidationHelperClass',
    'User',
    'Project'
]

# 버전 정보
__version__ = "1.0.0" 