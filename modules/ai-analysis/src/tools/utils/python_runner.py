#!/usr/bin/env python3
"""
Enhanced Python Runner Utilities  
JavaScript python-runner.js의 고도화된 Python 포팅 버전

주요 개선사항:
- 가상환경 자동 감지 및 관리
- 의존성 자동 설치
- 스크립트 실행 결과 캐싱
- 병렬 스크립트 실행 지원
- 실행 환경 격리
- 성능 모니터링
- 보안 강화 (sandbox 실행)
- 실행 히스토리 및 로깅
"""

import asyncio
import os
import sys
import subprocess
import shutil
import venv
import tempfile
import time
import signal
import psutil
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import json
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import logging
from contextlib import asynccontextmanager
import resource
import platform


class ExecutionMode(Enum):
    """실행 모드"""
    NORMAL = "normal"
    SANDBOX = "sandbox"
    ISOLATED = "isolated"
    CONTAINER = "container"


class ScriptStatus(Enum):
    """스크립트 상태"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass
class ExecutionResult:
    """실행 결과"""
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    execution_time: float
    memory_usage: Optional[int] = None
    cpu_usage: Optional[float] = None
    script_path: Optional[str] = None
    args: Optional[List[str]] = None
    error: Optional[str] = None
    pid: Optional[int] = None
    status: ScriptStatus = ScriptStatus.COMPLETED
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return {
            "success": self.success,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "execution_time": self.execution_time,
            "memory_usage": self.memory_usage,
            "cpu_usage": self.cpu_usage,
            "script_path": self.script_path,
            "args": self.args,
            "error": self.error,
            "pid": self.pid,
            "status": self.status.value
        }


@dataclass
class EnvironmentInfo:
    """Python 환경 정보"""
    python_path: str
    version: str
    virtual_env: Optional[str] = None
    site_packages: Optional[str] = None
    installed_packages: List[str] = field(default_factory=list)
    pip_version: Optional[str] = None


@dataclass
class ExecutionConfig:
    """실행 설정"""
    timeout: float = 300.0  # 5분
    max_memory: int = 512 * 1024 * 1024  # 512MB
    max_cpu_percent: float = 80.0
    working_directory: Optional[str] = None
    environment_variables: Dict[str, str] = field(default_factory=dict)
    execution_mode: ExecutionMode = ExecutionMode.NORMAL
    capture_output: bool = True
    shell: bool = False
    create_venv: bool = False
    install_requirements: bool = False
    requirements_file: Optional[str] = None
    python_version: Optional[str] = None
    allow_network: bool = True
    allowed_modules: Optional[List[str]] = None
    blocked_modules: Optional[List[str]] = None


class EnhancedPythonRunner:
    """
    고도화된 Python 실행기
    JavaScript PythonRunner 클래스의 Python 포팅 + 확장
    """
    
    def __init__(self, project_root: Optional[str] = None, config: Optional[ExecutionConfig] = None):
        self.project_root = Path(project_root) if project_root else Path.cwd()
        self.config = config or ExecutionConfig()
        self.logger = logging.getLogger(__name__)
        
        # 캐시된 정보
        self._python_commands = {}
        self._environments = {}
        self._execution_history = []
        self._running_processes = {}
        
        # 리소스 모니터링
        self._resource_monitor = ResourceMonitor()
        
        # 실행기 풀
        self._thread_pool = ThreadPoolExecutor(max_workers=4)
        self._process_pool = ProcessPoolExecutor(max_workers=2)
        
        # 플랫폼 정보
        self.platform = platform.system().lower()
        
        # 초기화
        asyncio.create_task(self._initialize())
    
    async def _initialize(self):
        """비동기 초기화"""
        try:
            # Python 명령어들 미리 찾기
            await self._discover_python_interpreters()
            
            # 기본 환경 정보 수집
            await self._collect_environment_info()
            
            self.logger.info("PythonRunner initialized", extra={
                "project_root": str(self.project_root),
                "python_interpreters": len(self._python_commands),
                "platform": self.platform
            })
            
        except Exception as e:
            self.logger.error(f"Failed to initialize PythonRunner: {e}")
            raise
    
    async def _discover_python_interpreters(self):
        """Python 인터프리터 탐지"""
        candidates = [
            "python", "python3", "py",
            "python3.11", "python3.10", "python3.9", "python3.8",
            "/usr/bin/python3", "/usr/local/bin/python3"
        ]
        
        for candidate in candidates:
            try:
                result = await self._run_command([candidate, "--version"], timeout=5.0)
                if result.success:
                    version_info = result.stdout.strip() or result.stderr.strip()
                    self._python_commands[candidate] = {
                        "path": candidate,
                        "version": version_info,
                        "available": True
                    }
                    self.logger.debug(f"Found Python: {candidate} - {version_info}")
            except Exception:
                continue
        
        if not self._python_commands:
            raise RuntimeError("No Python interpreter found. Please install Python.")
    
    async def _collect_environment_info(self):
        """환경 정보 수집"""
        for cmd, info in self._python_commands.items():
            try:
                env_info = await self._get_environment_info(cmd)
                self._environments[cmd] = env_info
            except Exception as e:
                self.logger.warning(f"Failed to collect env info for {cmd}: {e}")
    
    async def _get_environment_info(self, python_cmd: str) -> EnvironmentInfo:
        """특정 Python 명령어의 환경 정보 수집"""
        # Python 경로 확인
        path_result = await self._run_command([python_cmd, "-c", "import sys; print(sys.executable)"])
        python_path = path_result.stdout.strip() if path_result.success else python_cmd
        
        # 버전 확인
        version_result = await self._run_command([python_cmd, "--version"])
        version = version_result.stdout.strip() or version_result.stderr.strip()
        
        # 가상환경 확인
        venv_result = await self._run_command([
            python_cmd, "-c", 
            "import sys; print(getattr(sys, 'prefix', None) != getattr(sys, 'base_prefix', sys.prefix))"
        ])
        in_venv = venv_result.stdout.strip() == "True" if venv_result.success else False
        
        # 가상환경 경로
        venv_path = None
        if in_venv:
            venv_path_result = await self._run_command([
                python_cmd, "-c", "import sys; print(sys.prefix)"
            ])
            venv_path = venv_path_result.stdout.strip() if venv_path_result.success else None
        
        # 설치된 패키지 목록
        packages = []
        try:
            pip_list_result = await self._run_command([python_cmd, "-m", "pip", "list", "--format=json"])
            if pip_list_result.success:
                packages_data = json.loads(pip_list_result.stdout)
                packages = [pkg["name"] for pkg in packages_data]
        except Exception:
            pass
        
        # pip 버전
        pip_version = None
        try:
            pip_version_result = await self._run_command([python_cmd, "-m", "pip", "--version"])
            if pip_version_result.success:
                pip_version = pip_version_result.stdout.strip()
        except Exception:
            pass
        
        return EnvironmentInfo(
            python_path=python_path,
            version=version,
            virtual_env=venv_path,
            installed_packages=packages,
            pip_version=pip_version
        )
    
    async def get_best_python_command(self, version_hint: Optional[str] = None) -> str:
        """최적의 Python 명령어 선택"""
        if not self._python_commands:
            await self._discover_python_interpreters()
        
        if version_hint:
            # 특정 버전 요청
            for cmd, info in self._python_commands.items():
                if version_hint in info["version"]:
                    return cmd
        
        # 기본 우선순위
        preferred_order = ["python3", "python", "py"]
        
        for preferred in preferred_order:
            if preferred in self._python_commands:
                return preferred
        
        # 첫 번째 사용 가능한 것
        return next(iter(self._python_commands.keys()))
    
    async def run_script(self, 
                        script_path: Union[str, Path], 
                        args: List[str] = None,
                        config: Optional[ExecutionConfig] = None) -> ExecutionResult:
        """스크립트 실행"""
        script_path = Path(script_path)
        args = args or []
        config = config or self.config
        
        # 스크립트 존재 확인
        if not script_path.exists():
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error=f"Script file not found: {script_path}",
                script_path=str(script_path),
                args=args,
                status=ScriptStatus.FAILED
            )
        
        # 실행 환경 준비
        python_cmd = await self.get_best_python_command(config.python_version)
        working_dir = Path(config.working_directory or self.project_root)
        
        # 가상환경 생성 (필요시)
        if config.create_venv:
            venv_path = await self._create_virtual_environment(script_path, config)
            python_cmd = str(venv_path / "bin" / "python" if self.platform != "windows" 
                           else venv_path / "Scripts" / "python.exe")
        
        # 의존성 설치 (필요시)
        if config.install_requirements:
            await self._install_requirements(python_cmd, config)
        
        # 보안 검사
        if config.execution_mode == ExecutionMode.SANDBOX:
            security_check = await self._security_check(script_path, config)
            if not security_check["safe"]:
                return ExecutionResult(
                    success=False,
                    stdout="",
                    stderr="",
                    exit_code=-1,
                    execution_time=0.0,
                    error=f"Security check failed: {security_check['reason']}",
                    script_path=str(script_path),
                    args=args,
                    status=ScriptStatus.FAILED
                )
        
        # 실행 명령어 구성
        command = [python_cmd, str(script_path)] + args
        
        self.logger.info(f"Executing Python script: {' '.join(command)}")
        self.logger.debug(f"Working directory: {working_dir}")
        
        # 실행
        start_time = time.time()
        
        try:
            if config.execution_mode == ExecutionMode.ISOLATED:
                result = await self._run_isolated(command, working_dir, config)
            elif config.execution_mode == ExecutionMode.SANDBOX:
                result = await self._run_sandboxed(command, working_dir, config)
            else:
                result = await self._run_normal(command, working_dir, config)
            
            execution_time = time.time() - start_time
            result.execution_time = execution_time
            result.script_path = str(script_path)
            result.args = args
            
            # 실행 히스토리에 추가
            self._execution_history.append({
                "timestamp": time.time(),
                "script_path": str(script_path),
                "args": args,
                "result": result.to_dict()
            })
            
            self.logger.info(f"Script execution completed in {execution_time:.2f}s with exit code {result.exit_code}")
            
            return result
            
        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"Script execution failed: {e}")
            
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=execution_time,
                error=str(e),
                script_path=str(script_path),
                args=args,
                status=ScriptStatus.FAILED
            )
    
    async def _run_normal(self, command: List[str], working_dir: Path, config: ExecutionConfig) -> ExecutionResult:
        """일반 모드 실행"""
        env = os.environ.copy()
        env.update(config.environment_variables)
        
        # 프로세스 생성
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=working_dir,
            env=env,
            stdout=asyncio.subprocess.PIPE if config.capture_output else None,
            stderr=asyncio.subprocess.PIPE if config.capture_output else None,
            stdin=asyncio.subprocess.DEVNULL
        )
        
        self._running_processes[process.pid] = process
        
        # 리소스 모니터링 시작
        monitor_task = asyncio.create_task(
            self._monitor_process(process.pid, config)
        ) if config.max_memory or config.max_cpu_percent else None
        
        try:
            # 타임아웃과 함께 실행
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=config.timeout
            )
            
            if monitor_task:
                monitor_task.cancel()
            
            return ExecutionResult(
                success=process.returncode == 0,
                stdout=stdout.decode('utf-8', errors='replace') if stdout else "",
                stderr=stderr.decode('utf-8', errors='replace') if stderr else "",
                exit_code=process.returncode,
                execution_time=0.0,  # 나중에 설정됨
                pid=process.pid,
                status=ScriptStatus.COMPLETED if process.returncode == 0 else ScriptStatus.FAILED
            )
            
        except asyncio.TimeoutError:
            if monitor_task:
                monitor_task.cancel()
            
            # 프로세스 종료
            await self._terminate_process(process)
            
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error=f"Execution timeout ({config.timeout}s)",
                pid=process.pid,
                status=ScriptStatus.TIMEOUT
            )
            
        finally:
            self._running_processes.pop(process.pid, None)
    
    async def _run_isolated(self, command: List[str], working_dir: Path, config: ExecutionConfig) -> ExecutionResult:
        """격리된 환경에서 실행"""
        # 임시 디렉토리 생성
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            # 스크립트와 필요한 파일들 복사
            script_path = Path(command[1])
            temp_script = temp_path / script_path.name
            
            # 스크립트 복사
            import shutil
            shutil.copy2(script_path, temp_script)
            
            # 새 명령어로 실행
            isolated_command = [command[0], str(temp_script)] + command[2:]
            
            # 환경 변수 제한
            restricted_env = {
                "PATH": os.environ.get("PATH", ""),
                "PYTHONPATH": str(temp_path),
                "HOME": str(temp_path),
                "TEMP": str(temp_path),
                "TMP": str(temp_path)
            }
            restricted_env.update(config.environment_variables)
            
            # 실행
            process = await asyncio.create_subprocess_exec(
                *isolated_command,
                cwd=temp_path,
                env=restricted_env,
                stdout=asyncio.subprocess.PIPE if config.capture_output else None,
                stderr=asyncio.subprocess.PIPE if config.capture_output else None,
                stdin=asyncio.subprocess.DEVNULL
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=config.timeout
                )
                
                return ExecutionResult(
                    success=process.returncode == 0,
                    stdout=stdout.decode('utf-8', errors='replace') if stdout else "",
                    stderr=stderr.decode('utf-8', errors='replace') if stderr else "",
                    exit_code=process.returncode,
                    execution_time=0.0,
                    pid=process.pid,
                    status=ScriptStatus.COMPLETED if process.returncode == 0 else ScriptStatus.FAILED
                )
                
            except asyncio.TimeoutError:
                await self._terminate_process(process)
                return ExecutionResult(
                    success=False,
                    stdout="",
                    stderr="",
                    exit_code=-1,
                    execution_time=0.0,
                    error=f"Execution timeout ({config.timeout}s)",
                    pid=process.pid,
                    status=ScriptStatus.TIMEOUT
                )
    
    async def _run_sandboxed(self, command: List[str], working_dir: Path, config: ExecutionConfig) -> ExecutionResult:
        """샌드박스 환경에서 실행"""
        # 리소스 제한 설정
        def preexec_fn():
            # 메모리 제한
            if config.max_memory:
                resource.setrlimit(resource.RLIMIT_AS, (config.max_memory, config.max_memory))
            
            # CPU 시간 제한  
            resource.setrlimit(resource.RLIMIT_CPU, (int(config.timeout), int(config.timeout)))
            
            # 파일 디스크립터 제한
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
            
            # 프로세스 수 제한
            resource.setrlimit(resource.RLIMIT_NPROC, (1, 1))
        
        # 제한된 환경 변수
        sandbox_env = {
            "PATH": "/usr/bin:/bin",
            "PYTHONPATH": "",
            "HOME": "/tmp",
            "USER": "sandbox"
        }
        
        # 네트워크 차단 (가능한 경우)
        if not config.allow_network and self.platform == "linux":
            # unshare를 사용한 네트워크 네임스페이스 격리
            command = ["unshare", "--net"] + command
        
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=working_dir,
                env=sandbox_env,
                stdout=asyncio.subprocess.PIPE if config.capture_output else None,
                stderr=asyncio.subprocess.PIPE if config.capture_output else None,
                stdin=asyncio.subprocess.DEVNULL,
                preexec_fn=preexec_fn if self.platform != "windows" else None
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=config.timeout
            )
            
            return ExecutionResult(
                success=process.returncode == 0,
                stdout=stdout.decode('utf-8', errors='replace') if stdout else "",
                stderr=stderr.decode('utf-8', errors='replace') if stderr else "",
                exit_code=process.returncode,
                execution_time=0.0,
                pid=process.pid,
                status=ScriptStatus.COMPLETED if process.returncode == 0 else ScriptStatus.FAILED
            )
            
        except asyncio.TimeoutError:
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error=f"Sandboxed execution timeout ({config.timeout}s)",
                status=ScriptStatus.TIMEOUT
            )
    
    async def _monitor_process(self, pid: int, config: ExecutionConfig):
        """프로세스 리소스 모니터링"""
        try:
            process = psutil.Process(pid)
            
            while process.is_running():
                # 메모리 사용량 확인
                memory_info = process.memory_info()
                if config.max_memory and memory_info.rss > config.max_memory:
                    self.logger.warning(f"Process {pid} exceeded memory limit")
                    process.terminate()
                    break
                
                # CPU 사용률 확인
                cpu_percent = process.cpu_percent()
                if config.max_cpu_percent and cpu_percent > config.max_cpu_percent:
                    self.logger.warning(f"Process {pid} exceeded CPU limit")
                    process.terminate()
                    break
                
                await asyncio.sleep(1)
                
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        except Exception as e:
            self.logger.error(f"Process monitoring error: {e}")
    
    async def _terminate_process(self, process: asyncio.subprocess.Process):
        """프로세스 종료"""
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
    
    async def _create_virtual_environment(self, script_path: Path, config: ExecutionConfig) -> Path:
        """가상환경 생성"""
        venv_name = f"venv_{hashlib.md5(str(script_path).encode()).hexdigest()[:8]}"
        venv_path = self.project_root / ".venvs" / venv_name
        
        if not venv_path.exists():
            self.logger.info(f"Creating virtual environment: {venv_path}")
            
            # 가상환경 생성
            venv.create(venv_path, with_pip=True)
            
            # pip 업그레이드
            pip_cmd = str(venv_path / "bin" / "pip" if self.platform != "windows" 
                         else venv_path / "Scripts" / "pip.exe")
            
            await self._run_command([pip_cmd, "install", "--upgrade", "pip"])
        
        return venv_path
    
    async def _install_requirements(self, python_cmd: str, config: ExecutionConfig):
        """의존성 설치"""
        requirements_file = config.requirements_file
        
        if requirements_file and Path(requirements_file).exists():
            self.logger.info(f"Installing requirements from {requirements_file}")
            
            result = await self._run_command([
                python_cmd, "-m", "pip", "install", "-r", requirements_file
            ])
            
            if not result.success:
                raise RuntimeError(f"Failed to install requirements: {result.stderr}")
    
    async def _security_check(self, script_path: Path, config: ExecutionConfig) -> Dict[str, Any]:
        """보안 검사"""
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 위험한 모듈/함수 검사
            dangerous_patterns = [
                r'import\s+os',
                r'import\s+subprocess',
                r'import\s+sys',
                r'__import__',
                r'eval\s*\(',
                r'exec\s*\(',
                r'open\s*\(',
                r'file\s*\(',
                r'input\s*\(',
                r'raw_input\s*\(',
            ]
            
            # 허용된 모듈 확인
            if config.allowed_modules:
                import_pattern = r'(?:from\s+(\w+)|import\s+(\w+))'
                imports = re.findall(import_pattern, content)
                all_imports = [imp for imp_tuple in imports for imp in imp_tuple if imp]
                
                for imp in all_imports:
                    if imp not in config.allowed_modules:
                        return {
                            "safe": False,
                            "reason": f"Module '{imp}' is not in allowed modules list"
                        }
            
            # 차단된 모듈 확인
            if config.blocked_modules:
                for blocked in config.blocked_modules:
                    if re.search(rf'\b{blocked}\b', content):
                        return {
                            "safe": False,
                            "reason": f"Blocked module '{blocked}' found in script"
                        }
            
            # 위험한 패턴 확인
            for pattern in dangerous_patterns:
                if re.search(pattern, content):
                    return {
                        "safe": False,
                        "reason": f"Dangerous pattern found: {pattern}"
                    }
            
            return {"safe": True, "reason": None}
            
        except Exception as e:
            return {
                "safe": False,
                "reason": f"Security check failed: {str(e)}"
            }
    
    async def _run_command(self, command: List[str], timeout: float = 30.0) -> ExecutionResult:
        """명령어 실행"""
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return ExecutionResult(
                success=process.returncode == 0,
                stdout=stdout.decode('utf-8', errors='replace'),
                stderr=stderr.decode('utf-8', errors='replace'),
                exit_code=process.returncode,
                execution_time=0.0
            )
            
        except asyncio.TimeoutError:
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error="Command timeout"
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error=str(e)
            )
    
    # 배치 및 병렬 실행
    async def run_scripts_parallel(self, 
                                  scripts: List[Tuple[str, List[str]]], 
                                  max_concurrent: int = 3,
                                  config: Optional[ExecutionConfig] = None) -> List[ExecutionResult]:
        """스크립트들을 병렬로 실행"""
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def run_with_semaphore(script_path: str, args: List[str]):
            async with semaphore:
                return await self.run_script(script_path, args, config)
        
        tasks = [
            run_with_semaphore(script_path, args)
            for script_path, args in scripts
        ]
        
        return await asyncio.gather(*tasks, return_exceptions=False)
    
    async def run_pipeline(self, 
                          pipeline: List[Dict[str, Any]],
                          config: Optional[ExecutionConfig] = None) -> List[ExecutionResult]:
        """파이프라인 실행 (이전 결과를 다음 스크립트에 전달)"""
        results = []
        previous_output = ""
        
        for step in pipeline:
            script_path = step["script"]
            args = step.get("args", [])
            
            # 이전 출력을 인자로 전달 (설정된 경우)
            if step.get("use_previous_output", False) and previous_output:
                args.append(previous_output)
            
            result = await self.run_script(script_path, args, config)
            results.append(result)
            
            if not result.success and step.get("stop_on_failure", True):
                break
            
            previous_output = result.stdout.strip()
        
        return results
    
    # 환경 관리
    async def list_environments(self) -> List[EnvironmentInfo]:
        """사용 가능한 Python 환경 목록"""
        if not self._environments:
            await self._collect_environment_info()
        
        return list(self._environments.values())
    
    async def create_environment(self, 
                                name: str, 
                                python_version: Optional[str] = None,
                                packages: Optional[List[str]] = None) -> EnvironmentInfo:
        """새 가상환경 생성"""
        venv_path = self.project_root / ".venvs" / name
        
        if venv_path.exists():
            raise ValueError(f"Environment '{name}' already exists")
        
        # 가상환경 생성
        base_python = await self.get_best_python_command(python_version)
        
        self.logger.info(f"Creating environment '{name}' with {base_python}")
        
        # venv 생성
        result = await self._run_command([base_python, "-m", "venv", str(venv_path)])
        if not result.success:
            raise RuntimeError(f"Failed to create venv: {result.stderr}")
        
        # pip 업그레이드
        pip_cmd = str(venv_path / "bin" / "pip" if self.platform != "windows" 
                     else venv_path / "Scripts" / "pip.exe")
        
        await self._run_command([pip_cmd, "install", "--upgrade", "pip"])
        
        # 패키지 설치
        if packages:
            for package in packages:
                result = await self._run_command([pip_cmd, "install", package])
                if not result.success:
                    self.logger.warning(f"Failed to install {package}: {result.stderr}")
        
        # 환경 정보 수집
        python_cmd = str(venv_path / "bin" / "python" if self.platform != "windows" 
                        else venv_path / "Scripts" / "python.exe")
        
        env_info = await self._get_environment_info(python_cmd)
        self._environments[python_cmd] = env_info
        
        return env_info
    
    # 실행 히스토리 및 통계
    def get_execution_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """실행 히스토리 반환"""
        return self._execution_history[-limit:]
    
    def get_execution_stats(self) -> Dict[str, Any]:
        """실행 통계"""
        if not self._execution_history:
            return {"total_executions": 0}
        
        total = len(self._execution_history)
        successful = sum(1 for h in self._execution_history if h["result"]["success"])
        failed = total - successful
        
        execution_times = [h["result"]["execution_time"] for h in self._execution_history]
        avg_time = sum(execution_times) / len(execution_times) if execution_times else 0
        
        return {
            "total_executions": total,
            "successful": successful,
            "failed": failed,
            "success_rate": (successful / total * 100) if total > 0 else 0,
            "average_execution_time": avg_time,
            "most_recent": self._execution_history[-1]["timestamp"] if self._execution_history else None
        }
    
    # 실행 중인 프로세스 관리
    def list_running_processes(self) -> List[Dict[str, Any]]:
        """실행 중인 프로세스 목록"""
        running = []
        
        for pid, process in self._running_processes.items():
            try:
                ps_process = psutil.Process(pid)
                running.append({
                    "pid": pid,
                    "status": ps_process.status(),
                    "cpu_percent": ps_process.cpu_percent(),
                    "memory_info": ps_process.memory_info()._asdict(),
                    "create_time": ps_process.create_time()
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return running
    
    async def terminate_process(self, pid: int) -> bool:
        """프로세스 종료"""
        if pid in self._running_processes:
            process = self._running_processes[pid]
            await self._terminate_process(process)
            return True
        return False
    
    # 정리
    async def cleanup(self):
        """리소스 정리"""
        # 실행 중인 프로세스들 종료
        for process in list(self._running_processes.values()):
            try:
                await self._terminate_process(process)
            except Exception:
                pass
        
        # 스레드 풀 종료
        self._thread_pool.shutdown(wait=False)
        self._process_pool.shutdown(wait=False)
        
        self.logger.info("PythonRunner cleanup completed")


class ResourceMonitor:
    """리소스 모니터링"""
    
    def __init__(self):
        self.monitoring = False
        self.metrics = []
    
    async def start_monitoring(self, pid: int, interval: float = 1.0):
        """모니터링 시작"""
        self.monitoring = True
        
        try:
            process = psutil.Process(pid)
            
            while self.monitoring and process.is_running():
                metric = {
                    "timestamp": time.time(),
                    "cpu_percent": process.cpu_percent(),
                    "memory_info": process.memory_info()._asdict(),
                    "num_threads": process.num_threads()
                }
                
                self.metrics.append(metric)
                await asyncio.sleep(interval)
                
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False
    
    def get_metrics(self) -> List[Dict[str, Any]]:
        """메트릭 반환"""
        return self.metrics.copy()


# 전역 인스턴스 관리
_runner_instances = {}

def get_python_runner(project_root: Optional[str] = None, 
                     config: Optional[ExecutionConfig] = None) -> EnhancedPythonRunner:
    """전역 Python 실행기 인스턴스 반환"""
    key = project_root or os.getcwd()
    
    if key not in _runner_instances:
        _runner_instances[key] = EnhancedPythonRunner(project_root, config)
    
    return _runner_instances[key]

# 편의 함수들
async def run_python_script(script_path: Union[str, Path], 
                           args: List[str] = None,
                           timeout: float = 300.0,
                           **kwargs) -> ExecutionResult:
    """Python 스크립트 실행 편의 함수"""
    config = ExecutionConfig(timeout=timeout, **kwargs)
    runner = get_python_runner()
    return await runner.run_script(script_path, args, config)

async def run_python_code(code: str, 
                         timeout: float = 30.0,
                         **kwargs) -> ExecutionResult:
    """Python 코드 문자열 실행"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        temp_script = f.name
    
    try:
        config = ExecutionConfig(timeout=timeout, **kwargs)
        runner = get_python_runner()
        return await runner.run_script(temp_script, [], config)
    finally:
        os.unlink(temp_script)

# 사용 예제
if __name__ == "__main__":
    async def main():
        # 기본 사용법
        runner = get_python_runner()
        
        # 스크립트 실행
        result = await runner.run_script("test_script.py", ["arg1", "arg2"])
        print(f"실행 결과: {result.success}")
        print(f"출력: {result.stdout}")
        
        # 보안 샌드박스 실행
        secure_config = ExecutionConfig(
            execution_mode=ExecutionMode.SANDBOX,
            timeout=60.0,
            max_memory=50 * 1024 * 1024,  # 50MB
            allow_network=False
        )
        
        result = await runner.run_script("untrusted_script.py", config=secure_config)
        
        # 병렬 실행
        scripts = [
            ("script1.py", ["arg1"]),
            ("script2.py", ["arg2"]),
            ("script3.py", ["arg3"])
        ]
        
        results = await runner.run_scripts_parallel(scripts, max_concurrent=2)
        print(f"병렬 실행 완료: {len(results)}개 스크립트")
        
        # 파이프라인 실행
        pipeline = [
            {"script": "data_extract.py", "args": ["input.csv"]},
            {"script": "data_process.py", "use_previous_output": True},
            {"script": "data_save.py", "use_previous_output": True}
        ]
        
        pipeline_results = await runner.run_pipeline(pipeline)
        
        # 실행 통계
        stats = runner.get_execution_stats()
        print(f"실행 통계: {stats}")
        
        # 정리
        await runner.cleanup()
    
    asyncio.run(main())