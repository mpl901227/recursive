"""
경로 처리 유틸리티 모듈
JavaScript tools의 경로 관련 공통 기능들을 Python으로 포팅
"""

import os
import pathlib
from typing import Optional, Union, List
import platform
import logging


class PathUtils:
    """경로 처리를 위한 유틸리티 클래스"""
    
    def __init__(self, base_path: Optional[str] = None, debug_mode: bool = False):
        self.base_path = base_path or os.getcwd()
        self.debug_mode = debug_mode
        self.platform = platform.system().lower()
        self.logger = logging.getLogger(__name__)
        
        # 워크스페이스 경로 자동 감지
        if 'thronglet' in self.base_path.lower():
            self.workspace_root = self.base_path
        else:
            self.workspace_root = os.environ.get('WORKSPACE_ROOT', self.base_path)
    
    def log_path_info(self, operation: str, path_data: dict) -> None:
        """경로 디버깅 로그"""
        if self.debug_mode:
            self.logger.debug(f"[PATH_DEBUG] {operation}: {path_data}")
    
    def normalize_path(self, file_path: str) -> str:
        """
        경로 정규화 (JavaScript normalizePath 포팅)
        Windows/Unix 경로를 표준화
        """
        if not file_path:
            self.log_path_info('경로 정규화 실패', {'input': file_path, 'reason': 'empty_path'})
            return ''
        
        try:
            # Windows 절대 경로 처리
            if self.platform == 'windows' and len(file_path) > 1 and file_path[1] == ':':
                normalized = file_path.replace('\\', '/')
            else:
                # 일반적인 경로 정규화
                normalized = str(pathlib.Path(file_path).as_posix())
            
            self.log_path_info('경로 정규화 성공', {
                'input': file_path,
                'output': normalized,
                'platform': self.platform
            })
            
            return normalized
        except Exception as error:
            self.log_path_info('경로 정규화 오류', {
                'input': file_path,
                'error': str(error)
            })
            return file_path  # 원본 반환
    
    def resolve_path(self, input_path: str, base_path: Optional[str] = None) -> str:
        """
        경로 해결 (JavaScript resolvePath 포팅)
        상대/절대 경로 처리
        """
        base = base_path or self.base_path
        
        try:
            # 이미 절대 경로인 경우
            if os.path.isabs(input_path):
                resolved = input_path
            else:
                # 상대 경로인 경우 기준 경로와 결합
                resolved = os.path.abspath(os.path.join(base, input_path))
            
            normalized = self.normalize_path(resolved)
            
            self.log_path_info('경로 해결', {
                'input': input_path,
                'base': base,
                'resolved': resolved,
                'normalized': normalized
            })
            
            return normalized
        except Exception as error:
            self.log_path_info('경로 해결 실패', {
                'input': input_path,
                'base': base,
                'error': str(error)
            })
            raise Exception(f"경로 해결 실패: {input_path} - {str(error)}")
    
    def find_existing_path(self, possible_paths: List[str]) -> Optional[str]:
        """
        다중 경로 시도 (JavaScript findExistingPath 포팅)
        파일 존재 확인
        """
        for try_path in possible_paths:
            try:
                resolved_path = self.resolve_path(try_path)
                if os.path.exists(resolved_path):
                    self.log_path_info('파일 경로 발견', {
                        'found': resolved_path,
                        'tried': len(possible_paths)
                    })
                    return resolved_path
            except Exception:
                # 다음 경로 시도
                continue
        
        self.log_path_info('파일 경로 찾기 실패', {
            'tried': possible_paths,
            'all_failed': True
        })
        
        return None
    
    def get_file_id(self, file_path: str) -> str:
        """파일 경로를 고유 ID로 변환"""
        normalized = self.normalize_path(file_path)
        return normalized.replace('/', '_').replace('\\', '_').replace(':', '')
    
    def get_relative_path(self, file_path: str, base_path: Optional[str] = None) -> str:
        """상대 경로 계산"""
        base = base_path or self.workspace_root
        try:
            return os.path.relpath(file_path, base)
        except Exception:
            return file_path
    
    def ensure_directory(self, dir_path: str) -> str:
        """디렉토리가 존재하지 않으면 생성"""
        resolved_path = self.resolve_path(dir_path)
        os.makedirs(resolved_path, exist_ok=True)
        return resolved_path
    
    def get_file_extension(self, file_path: str) -> str:
        """파일 확장자 추출"""
        return pathlib.Path(file_path).suffix.lower()
    
    def is_code_file(self, file_path: str, extensions: Optional[List[str]] = None) -> bool:
        """코드 파일 여부 확인"""
        if extensions is None:
            extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html']
        
        return self.get_file_extension(file_path) in extensions
    
    def get_common_patterns(self) -> dict:
        """파일 패턴 반환"""
        return {
            'code_files': ['*.js', '*.ts', '*.jsx', '*.tsx', '*.py', '*.java'],
            'exclude_dirs': ['.git', 'node_modules', '__pycache__', 'dist', 'build', '.vscode', '.idea'],
            'config_files': ['*.json', '*.yaml', '*.yml', '*.toml', '*.ini'],
            'doc_files': ['*.md', '*.txt', '*.rst']
        }


# 전역 인스턴스
_default_path_utils = None

def get_path_utils(base_path: Optional[str] = None, debug_mode: bool = False) -> PathUtils:
    """기본 PathUtils 인스턴스 반환"""
    global _default_path_utils
    if _default_path_utils is None:
        _default_path_utils = PathUtils(base_path, debug_mode)
    return _default_path_utils


# 편의 함수들
def normalize_path(file_path: str) -> str:
    """경로 정규화 편의 함수"""
    return get_path_utils().normalize_path(file_path)

def resolve_path(input_path: str, base_path: Optional[str] = None) -> str:
    """경로 해결 편의 함수"""
    return get_path_utils().resolve_path(input_path, base_path)

def find_existing_path(possible_paths: List[str]) -> Optional[str]:
    """기존 경로 찾기 편의 함수"""
    return get_path_utils().find_existing_path(possible_paths) 