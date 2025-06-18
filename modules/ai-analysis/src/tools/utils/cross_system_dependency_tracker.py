#!/usr/bin/env python3
"""
Cross-System Dependency Tracker
시스템 간 의존성 추적 및 영향도 분석 도구

주요 기능:
- 실시간 의존성 그래프 구축 및 관리
- 연쇄 장애 추적 및 예측
- 영향 반경 분석 및 시뮬레이션
- 의존성 구조 최적화 제안
- 장애 전파 경로 시각화
- 복구 우선순위 자동 계산
- 시스템 간 통신 패턴 학습
- 의존성 취약점 자동 탐지
"""

import asyncio
import json
import logging
import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Dict, List, Set, Optional, Tuple, Any, Union, 
    Callable, Iterator, NamedTuple
)
import heapq
import networkx as nx
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import weakref
import pickle
from contextlib import asynccontextmanager

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class SystemType(Enum):
    """시스템 타입 정의"""
    WEB_SERVER = "web_server"
    DATABASE = "database"
    CACHE = "cache"
    MESSAGE_QUEUE = "message_queue"
    API_GATEWAY = "api_gateway"
    MICROSERVICE = "microservice"
    LOAD_BALANCER = "load_balancer"
    CDN = "cdn"
    FILE_STORAGE = "file_storage"
    MONITORING = "monitoring"
    EXTERNAL_API = "external_api"
    DOCKER_CONTAINER = "docker_container"
    KUBERNETES_POD = "kubernetes_pod"
    LAMBDA_FUNCTION = "lambda_function"


class DependencyType(Enum):
    """의존성 타입 정의"""
    SYNCHRONOUS = "synchronous"      # 동기적 의존성
    ASYNCHRONOUS = "asynchronous"    # 비동기적 의존성
    BATCH = "batch"                  # 배치 처리 의존성
    STREAMING = "streaming"          # 스트리밍 의존성
    CONFIGURATION = "configuration"  # 설정 의존성
    DATA = "data"                   # 데이터 의존성
    SHARED_RESOURCE = "shared_resource"  # 공유 리소스 의존성


class FailureType(Enum):
    """장애 타입 정의"""
    SERVICE_DOWN = "service_down"
    SLOW_RESPONSE = "slow_response"
    HIGH_ERROR_RATE = "high_error_rate"
    RESOURCE_EXHAUSTION = "resource_exhaustion"
    CONNECTION_TIMEOUT = "connection_timeout"
    AUTHENTICATION_FAILURE = "authentication_failure"
    DATA_CORRUPTION = "data_corruption"
    CONFIGURATION_ERROR = "configuration_error"


class ImpactSeverity(Enum):
    """영향도 심각도"""
    CRITICAL = "critical"    # 서비스 완전 중단
    HIGH = "high"           # 주요 기능 영향
    MEDIUM = "medium"       # 일부 기능 영향
    LOW = "low"            # 성능 저하
    NEGLIGIBLE = "negligible"  # 무시할 수 있는 수준


# 데이터 클래스들
@dataclass
class SystemNode:
    """시스템 노드 정보"""
    id: str
    name: str
    system_type: SystemType
    endpoint: Optional[str] = None
    health_check_url: Optional[str] = None
    version: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_health_check: Optional[datetime] = None
    status: str = "unknown"  # healthy, degraded, down, unknown
    
    def __hash__(self):
        return hash(self.id)


@dataclass
class DependencyEdge:
    """의존성 엣지 정보"""
    source_id: str
    target_id: str
    dependency_type: DependencyType
    weight: float = 1.0  # 의존성 강도 (0.0 ~ 1.0)
    latency_sla: Optional[float] = None  # SLA 응답 시간 (ms)
    error_threshold: float = 0.05  # 허용 에러율
    timeout: Optional[float] = None  # 타임아웃 (초)
    retry_policy: Optional[Dict] = None
    circuit_breaker: Optional[Dict] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    last_verified: Optional[datetime] = None
    
    def __hash__(self):
        return hash((self.source_id, self.target_id))


@dataclass
class FailureEvent:
    """장애 이벤트"""
    system_id: str
    failure_type: FailureType
    severity: ImpactSeverity
    description: str
    timestamp: datetime = field(default_factory=datetime.now)
    resolved_at: Optional[datetime] = None
    root_cause: Optional[str] = None
    recovery_time: Optional[float] = None  # 초
    affected_users: Optional[int] = None
    financial_impact: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CascadeFailure:
    """연쇄 장애 정보"""
    root_failure: FailureEvent
    cascade_path: List[str]  # 장애 전파 경로
    affected_systems: Set[str]
    total_impact_score: float
    propagation_time: float  # 초
    recovery_plan: Optional[List[str]] = None
    lessons_learned: Optional[str] = None


@dataclass
class ImpactAnalysis:
    """영향도 분석 결과"""
    affected_systems: Set[str]
    impact_scores: Dict[str, float]  # system_id -> impact_score
    estimated_downtime: Dict[str, float]  # system_id -> downtime (minutes)
    user_impact: int  # 영향받는 사용자 수
    revenue_impact: float  # 매출 영향 (달러)
    recovery_priority: List[str]  # 복구 우선순위
    mitigation_strategies: List[str]


@dataclass
class OptimizationSuggestion:
    """의존성 최적화 제안"""
    suggestion_type: str  # "reduce_coupling", "add_redundancy", "circuit_breaker" 등
    description: str
    affected_systems: List[str]
    expected_benefit: str
    implementation_effort: str  # "low", "medium", "high"
    priority_score: float
    estimated_cost: Optional[float] = None
    estimated_savings: Optional[float] = None


class DependencyGraph:
    """의존성 그래프 클래스"""
    
    def __init__(self):
        self._graph = nx.DiGraph()
        self._systems: Dict[str, SystemNode] = {}
        self._dependencies: Dict[Tuple[str, str], DependencyEdge] = {}
        self._failure_history: List[FailureEvent] = []
        self._cascade_history: List[CascadeFailure] = []
        self._lock = threading.RLock()
        
        # 성능 메트릭
        self.metrics = {
            'graph_build_time': 0.0,
            'analysis_time': 0.0,
            'nodes_count': 0,
            'edges_count': 0,
            'last_update': None
        }
    
    def add_system(self, system: SystemNode) -> None:
        """시스템 노드 추가"""
        with self._lock:
            self._systems[system.id] = system
            self._graph.add_node(system.id, **system.__dict__)
            self.metrics['nodes_count'] = len(self._systems)
            self.metrics['last_update'] = datetime.now()
            
            logger.debug(f"Added system: {system.id} ({system.system_type.value})")
    
    def add_dependency(self, dependency: DependencyEdge) -> None:
        """의존성 엣지 추가"""
        with self._lock:
            # 시스템 존재 확인
            if dependency.source_id not in self._systems:
                raise ValueError(f"Source system not found: {dependency.source_id}")
            if dependency.target_id not in self._systems:
                raise ValueError(f"Target system not found: {dependency.target_id}")
            
            edge_key = (dependency.source_id, dependency.target_id)
            self._dependencies[edge_key] = dependency
            
            self._graph.add_edge(
                dependency.source_id, 
                dependency.target_id,
                **dependency.__dict__
            )
            
            self.metrics['edges_count'] = len(self._dependencies)
            self.metrics['last_update'] = datetime.now()
            
            logger.debug(f"Added dependency: {dependency.source_id} -> {dependency.target_id}")
    
    def remove_system(self, system_id: str) -> None:
        """시스템 제거"""
        with self._lock:
            if system_id not in self._systems:
                return
            
            # 관련 의존성도 제거
            to_remove = []
            for (source, target), dep in self._dependencies.items():
                if source == system_id or target == system_id:
                    to_remove.append((source, target))
            
            for edge_key in to_remove:
                del self._dependencies[edge_key]
            
            del self._systems[system_id]
            self._graph.remove_node(system_id)
            
            self.metrics['nodes_count'] = len(self._systems)
            self.metrics['edges_count'] = len(self._dependencies)
            self.metrics['last_update'] = datetime.now()
            
            logger.info(f"Removed system: {system_id}")
    
    def get_dependencies(self, system_id: str) -> List[str]:
        """시스템의 의존성 목록 반환"""
        with self._lock:
            return list(self._graph.successors(system_id))
    
    def get_dependents(self, system_id: str) -> List[str]:
        """시스템에 의존하는 시스템들 반환"""
        with self._lock:
            return list(self._graph.predecessors(system_id))
    
    def find_shortest_path(self, source: str, target: str) -> Optional[List[str]]:
        """최단 의존성 경로 찾기"""
        try:
            return nx.shortest_path(self._graph, source, target)
        except nx.NetworkXNoPath:
            return None
    
    def find_all_paths(self, source: str, target: str, max_length: int = 10) -> List[List[str]]:
        """모든 의존성 경로 찾기"""
        try:
            return list(nx.all_simple_paths(self._graph, source, target, cutoff=max_length))
        except nx.NetworkXNoPath:
            return []
    
    def detect_cycles(self) -> List[List[str]]:
        """순환 의존성 탐지"""
        try:
            cycles = list(nx.simple_cycles(self._graph))
            return cycles
        except Exception as e:
            logger.error(f"Error detecting cycles: {e}")
            return []
    
    def calculate_centrality_metrics(self) -> Dict[str, Dict[str, float]]:
        """중심성 메트릭 계산"""
        metrics = {}
        
        try:
            # 차수 중심성 (얼마나 많은 연결을 가지고 있는가)
            degree_centrality = nx.degree_centrality(self._graph)
            
            # 근접 중심성 (다른 노드들과 얼마나 가까운가)
            closeness_centrality = nx.closeness_centrality(self._graph)
            
            # 매개 중심성 (얼마나 많은 경로의 중간에 위치하는가)
            betweenness_centrality = nx.betweenness_centrality(self._graph)
            
            # 페이지랭크 (영향력 점수)
            pagerank = nx.pagerank(self._graph)
            
            for node_id in self._systems:
                metrics[node_id] = {
                    'degree_centrality': degree_centrality.get(node_id, 0),
                    'closeness_centrality': closeness_centrality.get(node_id, 0),
                    'betweenness_centrality': betweenness_centrality.get(node_id, 0),
                    'pagerank': pagerank.get(node_id, 0)
                }
        
        except Exception as e:
            logger.error(f"Error calculating centrality metrics: {e}")
        
        return metrics
    
    def to_dict(self) -> Dict[str, Any]:
        """그래프를 딕셔너리로 직렬화"""
        return {
            'systems': {sid: {
                'id': sys.id,
                'name': sys.name,
                'system_type': sys.system_type.value,
                'endpoint': sys.endpoint,
                'version': sys.version,
                'status': sys.status,
                'metadata': sys.metadata
            } for sid, sys in self._systems.items()},
            
            'dependencies': [
                {
                    'source_id': dep.source_id,
                    'target_id': dep.target_id,
                    'dependency_type': dep.dependency_type.value,
                    'weight': dep.weight,
                    'latency_sla': dep.latency_sla,
                    'error_threshold': dep.error_threshold,
                    'timeout': dep.timeout,
                    'metadata': dep.metadata
                }
                for dep in self._dependencies.values()
            ],
            
            'metrics': self.metrics
        }


class CrossSystemDependencyTracker:
    """시스템 간 의존성 추적기"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.dependency_graph = DependencyGraph()
        self.impact_calculator = ImpactCalculator()
        self.cascade_analyzer = CascadeAnalyzer()
        self.optimization_engine = OptimizationEngine()
        
        # 실시간 모니터링
        self.health_monitor = HealthMonitor()
        self.anomaly_detector = AnomalyDetector()
        
        # 설정
        self.monitoring_interval = self.config.get('monitoring_interval', 30)  # 초
        self.max_cascade_depth = self.config.get('max_cascade_depth', 10)
        self.impact_threshold = self.config.get('impact_threshold', 0.1)
        
        # 상태
        self._monitoring = False
        self._monitor_task = None
        
        logger.info("CrossSystemDependencyTracker initialized")
    
    async def start_monitoring(self) -> None:
        """실시간 모니터링 시작"""
        if self._monitoring:
            return
        
        self._monitoring = True
        self._monitor_task = asyncio.create_task(self._monitoring_loop())
        logger.info("Started dependency monitoring")
    
    async def stop_monitoring(self) -> None:
        """모니터링 중지"""
        self._monitoring = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped dependency monitoring")
    
    async def _monitoring_loop(self) -> None:
        """모니터링 루프"""
        while self._monitoring:
            try:
                await self._check_system_health()
                await self._detect_anomalies()
                await asyncio.sleep(self.monitoring_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(5)  # 짧은 대기 후 재시도
    
    async def _check_system_health(self) -> None:
        """시스템 건강도 확인"""
        systems = list(self.dependency_graph._systems.values())
        
        async def check_single_system(system: SystemNode):
            try:
                health = await self.health_monitor.check_system_health(system)
                system.status = health['status']
                system.last_health_check = datetime.now()
                
                if health['status'] != 'healthy':
                    await self._handle_unhealthy_system(system, health)
            
            except Exception as e:
                logger.error(f"Error checking health for {system.id}: {e}")
                system.status = 'unknown'
        
        # 병렬로 건강도 확인
        await asyncio.gather(*[check_single_system(sys) for sys in systems], 
                           return_exceptions=True)
    
    async def _detect_anomalies(self) -> None:
        """이상 징후 탐지"""
        try:
            anomalies = await self.anomaly_detector.detect_anomalies(
                self.dependency_graph
            )
            
            for anomaly in anomalies:
                await self._handle_anomaly(anomaly)
        
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
    
    async def _handle_unhealthy_system(self, system: SystemNode, health_info: Dict) -> None:
        """비정상 시스템 처리"""
        logger.warning(f"Unhealthy system detected: {system.id} - {health_info}")
        
        # 장애 이벤트 생성
        failure = FailureEvent(
            system_id=system.id,
            failure_type=self._classify_failure_type(health_info),
            severity=self._assess_severity(system, health_info),
            description=health_info.get('description', 'System health check failed'),
            metadata=health_info
        )
        
        # 연쇄 영향 분석
        impact_analysis = await self.analyze_cascade_impact(failure)
        
        # 알림 및 대응
        await self._trigger_alerts(failure, impact_analysis)
    
    async def _handle_anomaly(self, anomaly: Dict) -> None:
        """이상 징후 처리"""
        logger.info(f"Anomaly detected: {anomaly}")
        
        # 이상 징후 기반 예측 분석
        predicted_failures = await self._predict_failures_from_anomaly(anomaly)
        
        for predicted_failure in predicted_failures:
            logger.warning(f"Predicted failure: {predicted_failure}")
    
    def build_dependency_graph(self, systems: List[SystemNode], 
                             dependencies: List[DependencyEdge]) -> DependencyGraph:
        """의존성 그래프 구축"""
        start_time = time.time()
        
        # 시스템 추가
        for system in systems:
            self.dependency_graph.add_system(system)
        
        # 의존성 추가
        for dependency in dependencies:
            self.dependency_graph.add_dependency(dependency)
        
        # 메트릭 업데이트
        build_time = time.time() - start_time
        self.dependency_graph.metrics['graph_build_time'] = build_time
        
        logger.info(f"Built dependency graph: {len(systems)} systems, "
                   f"{len(dependencies)} dependencies in {build_time:.3f}s")
        
        return self.dependency_graph
    
    async def discover_dependencies_automatically(self, 
                                                discovery_methods: List[str] = None) -> List[DependencyEdge]:
        """의존성 자동 발견"""
        if discovery_methods is None:
            discovery_methods = ['network_analysis', 'log_analysis', 'config_analysis']
        
        discovered_dependencies = []
        
        for method in discovery_methods:
            try:
                if method == 'network_analysis':
                    deps = await self._discover_from_network_traffic()
                elif method == 'log_analysis':
                    deps = await self._discover_from_logs()
                elif method == 'config_analysis':
                    deps = await self._discover_from_configs()
                else:
                    logger.warning(f"Unknown discovery method: {method}")
                    continue
                
                discovered_dependencies.extend(deps)
                logger.info(f"Discovered {len(deps)} dependencies from {method}")
            
            except Exception as e:
                logger.error(f"Error in {method}: {e}")
        
        # 중복 제거
        unique_dependencies = self._deduplicate_dependencies(discovered_dependencies)
        
        logger.info(f"Total discovered dependencies: {len(unique_dependencies)}")
        return unique_dependencies
    
    async def track_cascade_failure(self, initial_failure: FailureEvent) -> CascadeFailure:
        """연쇄 장애 추적"""
        return await self.cascade_analyzer.analyze_cascade(
            initial_failure, self.dependency_graph, self.max_cascade_depth
        )
    
    async def analyze_cascade_impact(self, failure: FailureEvent) -> ImpactAnalysis:
        """연쇄 영향 분석"""
        return await self.impact_calculator.calculate_impact(
            failure, self.dependency_graph
        )
    
    def predict_impact_radius(self, system_id: str, 
                            failure_probability: float = 1.0) -> ImpactAnalysis:
        """영향 반경 예측"""
        # 가상 장애 시나리오 생성
        hypothetical_failure = FailureEvent(
            system_id=system_id,
            failure_type=FailureType.SERVICE_DOWN,
            severity=ImpactSeverity.HIGH,
            description="Hypothetical failure for impact prediction"
        )
        
        return asyncio.run(self.impact_calculator.calculate_impact(
            hypothetical_failure, self.dependency_graph, failure_probability
        ))
    
    async def optimize_dependency_structure(self) -> List[OptimizationSuggestion]:
        """의존성 구조 최적화 제안"""
        return await self.optimization_engine.generate_suggestions(
            self.dependency_graph
        )
    
    def find_single_points_of_failure(self) -> List[str]:
        """단일 장애점 찾기"""
        spofs = []
        centrality_metrics = self.dependency_graph.calculate_centrality_metrics()
        
        for system_id, metrics in centrality_metrics.items():
            # 높은 중심성 = 잠재적 SPOF
            score = (metrics['betweenness_centrality'] * 0.4 + 
                    metrics['degree_centrality'] * 0.3 + 
                    metrics['pagerank'] * 0.3)
            
            if score > 0.7:  # 임계값
                spofs.append(system_id)
        
        return spofs
    
    def calculate_system_criticality(self) -> Dict[str, float]:
        """시스템별 중요도 계산"""
        criticality_scores = {}
        centrality_metrics = self.dependency_graph.calculate_centrality_metrics()
        
        for system_id, metrics in centrality_metrics.items():
            system = self.dependency_graph._systems[system_id]
            
            # 기본 중요도 점수
            base_score = (metrics['betweenness_centrality'] * 0.3 + 
                         metrics['degree_centrality'] * 0.2 + 
                         metrics['pagerank'] * 0.2 +
                         metrics['closeness_centrality'] * 0.3)
            
            # 시스템 타입별 가중치
            type_weights = {
                SystemType.DATABASE: 1.5,
                SystemType.API_GATEWAY: 1.4,
                SystemType.LOAD_BALANCER: 1.3,
                SystemType.MESSAGE_QUEUE: 1.2,
                SystemType.WEB_SERVER: 1.1,
                SystemType.MICROSERVICE: 1.0,
                SystemType.CACHE: 0.8,
                SystemType.MONITORING: 0.6
            }
            
            weight = type_weights.get(system.system_type, 1.0)
            criticality_scores[system_id] = base_score * weight
        
        return criticality_scores
    
    async def simulate_failure_scenarios(self, scenarios: List[Dict]) -> Dict[str, Any]:
        """장애 시나리오 시뮬레이션"""
        simulation_results = {}
        
        for i, scenario in enumerate(scenarios):
            scenario_id = f"scenario_{i}"
            
            try:
                # 시나리오 실행
                result = await self._run_failure_simulation(scenario)
                simulation_results[scenario_id] = result
                
                logger.info(f"Completed simulation for scenario {scenario_id}")
            
            except Exception as e:
                logger.error(f"Error in scenario {scenario_id}: {e}")
                simulation_results[scenario_id] = {'error': str(e)}
        
        return simulation_results
    
    async def _run_failure_simulation(self, scenario: Dict) -> Dict[str, Any]:
        """개별 장애 시뮬레이션 실행"""
        failed_systems = scenario.get('failed_systems', [])
        failure_type = FailureType(scenario.get('failure_type', FailureType.SERVICE_DOWN.value))
        severity = ImpactSeverity(scenario.get('severity', ImpactSeverity.HIGH.value))
        
        total_impact = ImpactAnalysis(
            affected_systems=set(),
            impact_scores={},
            estimated_downtime={},
            user_impact=0,
            revenue_impact=0.0,
            recovery_priority=[],
            mitigation_strategies=[]
        )
        
        # 각 장애 시스템에 대해 영향 분석
        for system_id in failed_systems:
            failure = FailureEvent(
                system_id=system_id,
                failure_type=failure_type,
                severity=severity,
                description=f"Simulated failure in {system_id}"
            )
            
            impact = await self.analyze_cascade_impact(failure)
            
            # 영향 누적
            total_impact.affected_systems.update(impact.affected_systems)
            total_impact.user_impact += impact.user_impact
            total_impact.revenue_impact += impact.revenue_impact
            
            for sys_id, score in impact.impact_scores.items():
                if sys_id in total_impact.impact_scores:
                    total_impact.impact_scores[sys_id] = max(
                        total_impact.impact_scores[sys_id], score
                    )
                else:
                    total_impact.impact_scores[sys_id] = score
        
        return {
            'scenario': scenario,
            'total_affected_systems': len(total_impact.affected_systems),
            'affected_systems': list(total_impact.affected_systems),
            'total_user_impact': total_impact.user_impact,
            'total_revenue_impact': total_impact.revenue_impact,
            'impact_scores': total_impact.impact_scores,
            'simulation_timestamp': datetime.now().isoformat()
        }
    
    def generate_recovery_plan(self, failure_event: FailureEvent) -> List[Dict[str, Any]]:
        """복구 계획 생성"""
        # 영향받은 시스템들의 중요도 기반 복구 순서 결정
        criticality_scores = self.calculate_system_criticality()
        
        # 장애 시스템에서 영향받는 시스템들 찾기
        affected_systems = set()
        
        def find_affected_recursive(system_id: str, depth: int = 0):
            if depth > self.max_cascade_depth:
                return
            
            dependents = self.dependency_graph.get_dependents(system_id)
            for dependent in dependents:
                if dependent not in affected_systems:
                    affected_systems.add(dependent)
                    find_affected_recursive(dependent, depth + 1)
        
        find_affected_recursive(failure_event.system_id)
        
        # 복구 우선순위 계산
        recovery_plan = []
        
        # 1. 루트 원인 시스템 먼저 복구
        recovery_plan.append({
            'system_id': failure_event.system_id,
            'priority': 1,
            'action': 'restore_root_cause',
            'description': f"Restore {failure_event.system_id} - root cause of failure",
            'estimated_time': self._estimate_recovery_time(failure_event.system_id, failure_event.failure_type)
        })
        
        # 2. 중요도 순으로 영향받은 시스템들 복구
        sorted_affected = sorted(
            affected_systems,
            key=lambda x: criticality_scores.get(x, 0),
            reverse=True
        )
        
        for i, system_id in enumerate(sorted_affected):
            recovery_plan.append({
                'system_id': system_id,
                'priority': i + 2,
                'action': 'verify_and_restore',
                'description': f"Verify and restore {system_id}",
                'estimated_time': self._estimate_recovery_time(system_id, FailureType.SLOW_RESPONSE)
            })
        
        return recovery_plan
    
    def _estimate_recovery_time(self, system_id: str, failure_type: FailureType) -> float:
        """복구 시간 추정 (분 단위)"""
        system = self.dependency_graph._systems.get(system_id)
        if not system:
            return 30.0  # 기본값
        
        # 시스템 타입별 기본 복구 시간
        base_times = {
            SystemType.DATABASE: 45,
            SystemType.MESSAGE_QUEUE: 30,
            SystemType.API_GATEWAY: 20,
            SystemType.LOAD_BALANCER: 15,
            SystemType.WEB_SERVER: 10,
            SystemType.MICROSERVICE: 8,
            SystemType.CACHE: 5,
            SystemType.CDN: 3
        }
        
        # 장애 타입별 가중치
        failure_weights = {
            FailureType.SERVICE_DOWN: 1.5,
            FailureType.RESOURCE_EXHAUSTION: 1.3,
            FailureType.DATA_CORRUPTION: 2.0,
            FailureType.CONFIGURATION_ERROR: 1.2,
            FailureType.HIGH_ERROR_RATE: 1.1,
            FailureType.SLOW_RESPONSE: 0.8,
            FailureType.CONNECTION_TIMEOUT: 0.9,
            FailureType.AUTHENTICATION_FAILURE: 0.7
        }
        
        base_time = base_times.get(system.system_type, 15)
        weight = failure_weights.get(failure_type, 1.0)
        
        return base_time * weight
    
    def _classify_failure_type(self, health_info: Dict) -> FailureType:
        """건강도 정보로부터 장애 타입 분류"""
        status = health_info.get('status', 'unknown')
        response_time = health_info.get('response_time', 0)
        error_rate = health_info.get('error_rate', 0)
        
        if status == 'down':
            return FailureType.SERVICE_DOWN
        elif response_time > 5000:  # 5초 이상
            return FailureType.SLOW_RESPONSE
        elif error_rate > 0.1:  # 10% 이상
            return FailureType.HIGH_ERROR_RATE
        else:
            return FailureType.SLOW_RESPONSE
    
    def _assess_severity(self, system: SystemNode, health_info: Dict) -> ImpactSeverity:
        """시스템과 건강도 정보로 심각도 평가"""
        # 시스템 타입별 기본 심각도
        type_severity = {
            SystemType.DATABASE: ImpactSeverity.CRITICAL,
            SystemType.API_GATEWAY: ImpactSeverity.CRITICAL,
            SystemType.LOAD_BALANCER: ImpactSeverity.HIGH,
            SystemType.MESSAGE_QUEUE: ImpactSeverity.HIGH,
            SystemType.WEB_SERVER: ImpactSeverity.MEDIUM,
            SystemType.MICROSERVICE: ImpactSeverity.MEDIUM,
            SystemType.CACHE: ImpactSeverity.LOW,
            SystemType.MONITORING: ImpactSeverity.LOW
        }
        
        base_severity = type_severity.get(system.system_type, ImpactSeverity.MEDIUM)
        
        # 상태에 따른 조정
        status = health_info.get('status', 'unknown')
        if status == 'down':
            return base_severity
        elif status == 'degraded':
            # 한 단계 낮춤
            severity_order = [ImpactSeverity.NEGLIGIBLE, ImpactSeverity.LOW, 
                            ImpactSeverity.MEDIUM, ImpactSeverity.HIGH, ImpactSeverity.CRITICAL]
            current_index = severity_order.index(base_severity)
            return severity_order[max(0, current_index - 1)]
        
        return base_severity
    
    async def _trigger_alerts(self, failure: FailureEvent, impact: ImpactAnalysis) -> None:
        """알림 발송"""
        alert_data = {
            'failure': failure,
            'impact': impact,
            'timestamp': datetime.now().isoformat(),
            'recovery_plan': self.generate_recovery_plan(failure)
        }
        
        # 심각도에 따른 알림 레벨 결정
        if failure.severity in [ImpactSeverity.CRITICAL, ImpactSeverity.HIGH]:
            await self._send_critical_alert(alert_data)
        else:
            await self._send_warning_alert(alert_data)
    
    async def _send_critical_alert(self, alert_data: Dict) -> None:
        """긴급 알림 발송"""
        logger.critical(f"CRITICAL ALERT: {alert_data['failure'].description}")
        # 실제 구현에서는 Slack, PagerDuty, 이메일 등으로 발송
    
    async def _send_warning_alert(self, alert_data: Dict) -> None:
        """경고 알림 발송"""
        logger.warning(f"WARNING: {alert_data['failure'].description}")
        # 실제 구현에서는 모니터링 대시보드, 로그 등에 기록
    
    async def _predict_failures_from_anomaly(self, anomaly: Dict) -> List[FailureEvent]:
        """이상 징후로부터 장애 예측"""
        predictions = []
        
        affected_system = anomaly.get('system_id')
        anomaly_type = anomaly.get('type')
        confidence = anomaly.get('confidence', 0.5)
        
        if confidence > 0.8:  # 높은 신뢰도
            predicted_failure = FailureEvent(
                system_id=affected_system,
                failure_type=self._map_anomaly_to_failure_type(anomaly_type),
                severity=ImpactSeverity.MEDIUM,
                description=f"Predicted failure based on anomaly: {anomaly_type}",
                metadata={'prediction_confidence': confidence, 'anomaly': anomaly}
            )
            predictions.append(predicted_failure)
        
        return predictions
    
    def _map_anomaly_to_failure_type(self, anomaly_type: str) -> FailureType:
        """이상 타입을 장애 타입으로 매핑"""
        mapping = {
            'high_latency': FailureType.SLOW_RESPONSE,
            'error_spike': FailureType.HIGH_ERROR_RATE,
            'resource_exhaustion': FailureType.RESOURCE_EXHAUSTION,
            'connection_issues': FailureType.CONNECTION_TIMEOUT,
            'auth_failures': FailureType.AUTHENTICATION_FAILURE
        }
        return mapping.get(anomaly_type, FailureType.SLOW_RESPONSE)
    
    async def _discover_from_network_traffic(self) -> List[DependencyEdge]:
        """네트워크 트래픽 분석으로 의존성 발견"""
        # 실제 구현에서는 네트워크 모니터링 도구 연동
        discovered = []
        logger.info("Discovering dependencies from network traffic analysis")
        
        # 예시 구현 - 실제로는 네트워크 플로우 데이터 분석
        # tcpdump, netstat, eBPF 등을 활용
        
        return discovered
    
    async def _discover_from_logs(self) -> List[DependencyEdge]:
        """로그 분석으로 의존성 발견"""
        discovered = []
        logger.info("Discovering dependencies from log analysis")
        
        # 실제 구현에서는 로그에서 API 호출, DB 쿼리 등을 파싱
        # 정규식이나 구조화된 로그 파싱을 통해 의존성 추출
        
        return discovered
    
    async def _discover_from_configs(self) -> List[DependencyEdge]:
        """설정 파일 분석으로 의존성 발견"""
        discovered = []
        logger.info("Discovering dependencies from configuration analysis")
        
        # 실제 구현에서는 docker-compose.yml, kubernetes manifests,
        # application.yml 등에서 의존성 정보 추출
        
        return discovered
    
    def _deduplicate_dependencies(self, dependencies: List[DependencyEdge]) -> List[DependencyEdge]:
        """의존성 중복 제거"""
        seen = set()
        unique_deps = []
        
        for dep in dependencies:
            key = (dep.source_id, dep.target_id, dep.dependency_type)
            if key not in seen:
                seen.add(key)
                unique_deps.append(dep)
        
        return unique_deps
    
    def export_to_graphviz(self, output_file: str) -> None:
        """Graphviz 형식으로 내보내기"""
        try:
            import pygraphviz as pgv
            
            G = pgv.AGraph(directed=True)
            
            # 노드 추가
            for system_id, system in self.dependency_graph._systems.items():
                G.add_node(
                    system_id,
                    label=f"{system.name}\\n({system.system_type.value})",
                    shape=self._get_node_shape(system.system_type),
                    color=self._get_node_color(system.status)
                )
            
            # 엣지 추가
            for dep in self.dependency_graph._dependencies.values():
                G.add_edge(
                    dep.source_id,
                    dep.target_id,
                    label=dep.dependency_type.value,
                    weight=dep.weight,
                    color=self._get_edge_color(dep.dependency_type)
                )
            
            G.layout(prog='dot')
            G.draw(output_file)
            
            logger.info(f"Exported dependency graph to {output_file}")
        
        except ImportError:
            logger.error("pygraphviz not installed, cannot export to Graphviz")
        except Exception as e:
            logger.error(f"Error exporting to Graphviz: {e}")
    
    def _get_node_shape(self, system_type: SystemType) -> str:
        """시스템 타입별 노드 모양"""
        shapes = {
            SystemType.DATABASE: 'cylinder',
            SystemType.WEB_SERVER: 'box',
            SystemType.API_GATEWAY: 'diamond',
            SystemType.LOAD_BALANCER: 'trapezium',
            SystemType.CACHE: 'ellipse',
            SystemType.MESSAGE_QUEUE: 'parallelogram',
            SystemType.MICROSERVICE: 'box',
            SystemType.EXTERNAL_API: 'doubleoctagon'
        }
        return shapes.get(system_type, 'box')
    
    def _get_node_color(self, status: str) -> str:
        """시스템 상태별 노드 색상"""
        colors = {
            'healthy': 'green',
            'degraded': 'yellow',
            'down': 'red',
            'unknown': 'gray'
        }
        return colors.get(status, 'gray')
    
    def _get_edge_color(self, dependency_type: DependencyType) -> str:
        """의존성 타입별 엣지 색상"""
        colors = {
            DependencyType.SYNCHRONOUS: 'blue',
            DependencyType.ASYNCHRONOUS: 'green',
            DependencyType.BATCH: 'orange',
            DependencyType.STREAMING: 'purple',
            DependencyType.CONFIGURATION: 'brown',
            DependencyType.DATA: 'red',
            DependencyType.SHARED_RESOURCE: 'pink'
        }
        return colors.get(dependency_type, 'black')


class ImpactCalculator:
    """영향도 계산기"""
    
    def __init__(self):
        self.user_impact_weights = {
            SystemType.WEB_SERVER: 1000,      # 사용자당 영향도
            SystemType.API_GATEWAY: 800,
            SystemType.DATABASE: 1200,
            SystemType.CACHE: 200,
            SystemType.CDN: 500,
            SystemType.LOAD_BALANCER: 900,
            SystemType.MICROSERVICE: 300
        }
        
        self.revenue_impact_rates = {
            SystemType.WEB_SERVER: 100.0,     # 분당 매출 손실 (달러)
            SystemType.API_GATEWAY: 150.0,
            SystemType.DATABASE: 200.0,
            SystemType.CACHE: 20.0,
            SystemType.CDN: 50.0,
            SystemType.LOAD_BALANCER: 180.0,
            SystemType.MICROSERVICE: 30.0
        }
    
    async def calculate_impact(self, failure: FailureEvent, 
                             dependency_graph: DependencyGraph,
                             failure_probability: float = 1.0) -> ImpactAnalysis:
        """영향도 계산"""
        affected_systems = set()
        impact_scores = {}
        estimated_downtime = {}
        
        # BFS로 영향받는 시스템들 찾기
        queue = deque([(failure.system_id, 1.0)])  # (system_id, impact_probability)
        visited = set()
        
        while queue:
            current_system, probability = queue.popleft()
            
            if current_system in visited:
                continue
            
            visited.add(current_system)
            affected_systems.add(current_system)
            
            # 영향 점수 계산
            impact_scores[current_system] = self._calculate_system_impact_score(
                current_system, failure, dependency_graph, probability
            )
            
            # 예상 다운타임 계산
            estimated_downtime[current_system] = self._estimate_downtime(
                current_system, failure, dependency_graph
            )
            
            # 의존하는 시스템들을 큐에 추가
            dependents = dependency_graph.get_dependents(current_system)
            for dependent in dependents:
                if dependent not in visited:
                    # 의존성 강도에 따른 확률 감소
                    edge_key = (current_system, dependent)
                    dependency = dependency_graph._dependencies.get(edge_key)
                    
                    if dependency:
                        # 의존성 타입에 따른 영향 확률
                        type_probabilities = {
                            DependencyType.SYNCHRONOUS: 0.9,
                            DependencyType.ASYNCHRONOUS: 0.3,
                            DependencyType.BATCH: 0.2,
                            DependencyType.STREAMING: 0.6,
                            DependencyType.CONFIGURATION: 0.1,
                            DependencyType.DATA: 0.8,
                            DependencyType.SHARED_RESOURCE: 0.7
                        }
                        
                        type_prob = type_probabilities.get(
                            dependency.dependency_type, 0.5
                        )
                        new_probability = probability * dependency.weight * type_prob
                        
                        if new_probability > 0.05:  # 임계값
                            queue.append((dependent, new_probability))
        
        # 전체 사용자 영향 계산
        total_user_impact = sum(
            self._calculate_user_impact(sys_id, dependency_graph, impact_scores[sys_id])
            for sys_id in affected_systems
        )
        
        # 전체 매출 영향 계산
        total_revenue_impact = sum(
            self._calculate_revenue_impact(sys_id, dependency_graph, estimated_downtime[sys_id])
            for sys_id in affected_systems
        )
        
        # 복구 우선순위 계산
        recovery_priority = self._calculate_recovery_priority(
            affected_systems, impact_scores, dependency_graph
        )
        
        # 완화 전략 생성
        mitigation_strategies = self._generate_mitigation_strategies(
            failure, affected_systems, dependency_graph
        )
        
        return ImpactAnalysis(
            affected_systems=affected_systems,
            impact_scores=impact_scores,
            estimated_downtime=estimated_downtime,
            user_impact=int(total_user_impact),
            revenue_impact=total_revenue_impact,
            recovery_priority=recovery_priority,
            mitigation_strategies=mitigation_strategies
        )
    
    def _calculate_system_impact_score(self, system_id: str, failure: FailureEvent,
                                     dependency_graph: DependencyGraph, 
                                     probability: float) -> float:
        """시스템별 영향 점수 계산"""
        system = dependency_graph._systems.get(system_id)
        if not system:
            return 0.0
        
        # 기본 영향 점수 (시스템 타입 기반)
        base_scores = {
            SystemType.DATABASE: 0.9,
            SystemType.API_GATEWAY: 0.8,
            SystemType.LOAD_BALANCER: 0.7,
            SystemType.WEB_SERVER: 0.6,
            SystemType.MESSAGE_QUEUE: 0.5,
            SystemType.MICROSERVICE: 0.4,
            SystemType.CACHE: 0.3,
            SystemType.CDN: 0.2,
            SystemType.MONITORING: 0.1
        }
        
        base_score = base_scores.get(system.system_type, 0.4)
        
        # 장애 심각도에 따른 가중치
        severity_weights = {
            ImpactSeverity.CRITICAL: 1.0,
            ImpactSeverity.HIGH: 0.8,
            ImpactSeverity.MEDIUM: 0.6,
            ImpactSeverity.LOW: 0.4,
            ImpactSeverity.NEGLIGIBLE: 0.2
        }
        
        severity_weight = severity_weights.get(failure.severity, 0.6)
        
        return base_score * severity_weight * probability
    
    def _estimate_downtime(self, system_id: str, failure: FailureEvent,
                          dependency_graph: DependencyGraph) -> float:
        """다운타임 추정 (분 단위)"""
        system = dependency_graph._systems.get(system_id)
        if not system:
            return 30.0
        
        # 기본 복구 시간 (분)
        base_recovery_times = {
            SystemType.DATABASE: 60,
            SystemType.MESSAGE_QUEUE: 45,
            SystemType.API_GATEWAY: 30,
            SystemType.LOAD_BALANCER: 20,
            SystemType.WEB_SERVER: 15,
            SystemType.MICROSERVICE: 10,
            SystemType.CACHE: 5,
            SystemType.CDN: 3
        }
        
        base_time = base_recovery_times.get(system.system_type, 20)
        
        # 장애 타입에 따른 가중치
        failure_multipliers = {
            FailureType.SERVICE_DOWN: 1.5,
            FailureType.DATA_CORRUPTION: 3.0,
            FailureType.RESOURCE_EXHAUSTION: 1.3,
            FailureType.CONFIGURATION_ERROR: 1.2,
            FailureType.HIGH_ERROR_RATE: 1.1,
            FailureType.SLOW_RESPONSE: 0.8,
            FailureType.CONNECTION_TIMEOUT: 0.9,
            FailureType.AUTHENTICATION_FAILURE: 0.7
        }
        
        multiplier = failure_multipliers.get(failure.failure_type, 1.0)
        
        return base_time * multiplier
    
    def _calculate_user_impact(self, system_id: str, dependency_graph: DependencyGraph,
                              impact_score: float) -> float:
        """사용자 영향 계산"""
        system = dependency_graph._systems.get(system_id)
        if not system:
            return 0.0
        
        base_users = self.user_impact_weights.get(system.system_type, 100)
        return base_users * impact_score
    
    def _calculate_revenue_impact(self, system_id: str, dependency_graph: DependencyGraph,
                                 downtime_minutes: float) -> float:
        """매출 영향 계산"""
        system = dependency_graph._systems.get(system_id)
        if not system:
            return 0.0
        
        revenue_per_minute = self.revenue_impact_rates.get(system.system_type, 10.0)
        return revenue_per_minute * downtime_minutes
    
    def _calculate_recovery_priority(self, affected_systems: Set[str],
                                   impact_scores: Dict[str, float],
                                   dependency_graph: DependencyGraph) -> List[str]:
        """복구 우선순위 계산"""
        # (시스템ID, 우선순위 점수) 튜플 리스트
        priority_scores = []
        
        for system_id in affected_systems:
            system = dependency_graph._systems.get(system_id)
            if not system:
                continue
            
            # 영향 점수
            impact_score = impact_scores.get(system_id, 0.0)
            
            # 의존성 중심성 (다른 시스템들이 얼마나 이 시스템에 의존하는가)
            dependents_count = len(dependency_graph.get_dependents(system_id))
            
            # 시스템 타입별 가중치
            type_weights = {
                SystemType.DATABASE: 10,
                SystemType.API_GATEWAY: 8,
                SystemType.LOAD_BALANCER: 7,
                SystemType.MESSAGE_QUEUE: 6,
                SystemType.WEB_SERVER: 5,
                SystemType.MICROSERVICE: 3,
                SystemType.CACHE: 2,
                SystemType.CDN: 1
            }
            
            type_weight = type_weights.get(system.system_type, 3)
            
            # 총 우선순위 점수
            priority_score = (
                impact_score * 0.4 +
                dependents_count * 0.3 +
                type_weight * 0.3
            )
            
            priority_scores.append((system_id, priority_score))
        
        # 점수 기준 내림차순 정렬
        priority_scores.sort(key=lambda x: x[1], reverse=True)
        
        return [system_id for system_id, _ in priority_scores]
    
    def _generate_mitigation_strategies(self, failure: FailureEvent,
                                      affected_systems: Set[str],
                                      dependency_graph: DependencyGraph) -> List[str]:
        """완화 전략 생성"""
        strategies = []
        
        # 장애 타입별 기본 전략
        type_strategies = {
            FailureType.SERVICE_DOWN: [
                "Implement circuit breaker pattern",
                "Route traffic to backup systems",
                "Scale up healthy instances"
            ],
            FailureType.SLOW_RESPONSE: [
                "Increase timeout values",
                "Implement caching layer",
                "Optimize database queries"
            ],
            FailureType.HIGH_ERROR_RATE: [
                "Enable retry mechanisms with exponential backoff",
                "Implement graceful degradation",
                "Review and fix error-prone code paths"
            ],
            FailureType.RESOURCE_EXHAUSTION: [
                "Auto-scale resources",
                "Implement rate limiting",
                "Optimize resource usage"
            ]
        }
        
        base_strategies = type_strategies.get(failure.failure_type, [
            "Monitor system health closely",
            "Prepare rollback procedures",
            "Communicate with stakeholders"
        ])
        
        strategies.extend(base_strategies)
        
        # 영향받은 시스템 수에 따른 추가 전략
        if len(affected_systems) > 5:
            strategies.append("Activate incident response team")
            strategies.append("Prepare customer communication")
        
        if len(affected_systems) > 10:
            strategies.append("Consider declaring major incident")
            strategies.append("Engage executive leadership")
        
        return strategies


class CascadeAnalyzer:
    """연쇄 장애 분석기"""
    
    async def analyze_cascade(self, initial_failure: FailureEvent,
                            dependency_graph: DependencyGraph,
                            max_depth: int = 10) -> CascadeFailure:
        """연쇄 장애 분석"""
        cascade_path = [initial_failure.system_id]
        affected_systems = {initial_failure.system_id}
        total_impact_score = 0.0
        
        # BFS로 연쇄 전파 추적
        queue = deque([(initial_failure.system_id, 0, 1.0)])  # (system_id, depth, probability)
        propagation_start = time.time()
        
        while queue and len(cascade_path) < max_depth:
            current_system, depth, probability = queue.popleft()
            
            if depth >= max_depth:
                continue
            
            # 의존하는 시스템들 확인
            dependents = dependency_graph.get_dependents(current_system)
            
            for dependent in dependents:
                if dependent in affected_systems:
                    continue
                
                # 장애 전파 확률 계산
                propagation_prob = self._calculate_propagation_probability(
                    current_system, dependent, dependency_graph, initial_failure
                )
                
                new_probability = probability * propagation_prob
                
                # 임계값 이상인 경우만 전파
                if new_probability > 0.1:
                    cascade_path.append(dependent)
                    affected_systems.add(dependent)
                    
                    # 영향 점수 누적
                    system_impact = self._calculate_cascade_impact_score(
                        dependent, dependency_graph, new_probability
                    )
                    total_impact_score += system_impact
                    
                    queue.append((dependent, depth + 1, new_probability))
        
        propagation_time = time.time() - propagation_start
        
        return CascadeFailure(
            root_failure=initial_failure,
            cascade_path=cascade_path,
            affected_systems=affected_systems,
            total_impact_score=total_impact_score,
            propagation_time=propagation_time
        )
    
    def _calculate_propagation_probability(self, source: str, target: str,
                                         dependency_graph: DependencyGraph,
                                         failure: FailureEvent) -> float:
        """장애 전파 확률 계산"""
        edge_key = (source, target)
        dependency = dependency_graph._dependencies.get(edge_key)
        
        if not dependency:
            return 0.0
        
        # 의존성 타입별 기본 전파 확률
        base_probabilities = {
            DependencyType.SYNCHRONOUS: 0.8,
            DependencyType.ASYNCHRONOUS: 0.2,
            DependencyType.BATCH: 0.1,
            DependencyType.STREAMING: 0.4,
            DependencyType.CONFIGURATION: 0.05,
            DependencyType.DATA: 0.6,
            DependencyType.SHARED_RESOURCE: 0.5
        }
        
        base_prob = base_probabilities.get(dependency.dependency_type, 0.3)
        
        # 의존성 가중치 적용
        weighted_prob = base_prob * dependency.weight
        
        # 장애 타입별 전파 가능성
        failure_multipliers = {
            FailureType.SERVICE_DOWN: 1.0,
            FailureType.RESOURCE_EXHAUSTION: 0.8,
            FailureType.SLOW_RESPONSE: 0.6,
            FailureType.HIGH_ERROR_RATE: 0.7,
            FailureType.CONNECTION_TIMEOUT: 0.9,
            FailureType.AUTHENTICATION_FAILURE: 0.4,
            FailureType.DATA_CORRUPTION: 0.5,
            FailureType.CONFIGURATION_ERROR: 0.3
        }
        
        failure_multiplier = failure_multipliers.get(failure.failure_type, 0.5)
        
        return min(1.0, weighted_prob * failure_multiplier)
    
    def _calculate_cascade_impact_score(self, system_id: str,
                                      dependency_graph: DependencyGraph,
                                      probability: float) -> float:
        """연쇄 영향 점수 계산"""
        system = dependency_graph._systems.get(system_id)
        if not system:
            return 0.0
        
        # 시스템 타입별 기본 영향 점수
        base_scores = {
            SystemType.DATABASE: 0.9,
            SystemType.API_GATEWAY: 0.8,
            SystemType.LOAD_BALANCER: 0.7,
            SystemType.WEB_SERVER: 0.6,
            SystemType.MESSAGE_QUEUE: 0.5,
            SystemType.MICROSERVICE: 0.4,
            SystemType.CACHE: 0.3,
            SystemType.CDN: 0.2,
            SystemType.MONITORING: 0.1
        }
        
        base_score = base_scores.get(system.system_type, 0.4)
        return base_score * probability


class OptimizationEngine:
    """의존성 최적화 엔진"""
    
    async def generate_suggestions(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """최적화 제안 생성"""
        suggestions = []
        
        # 1. 단일 장애점 제거 제안
        spof_suggestions = await self._suggest_spof_mitigation(dependency_graph)
        suggestions.extend(spof_suggestions)
        
        # 2. 과도한 결합도 감소 제안
        coupling_suggestions = await self._suggest_coupling_reduction(dependency_graph)
        suggestions.extend(coupling_suggestions)
        
        # 3. 중복성 추가 제안
        redundancy_suggestions = await self._suggest_redundancy_improvements(dependency_graph)
        suggestions.extend(redundancy_suggestions)
        
        # 4. 회로 차단기 패턴 제안
        circuit_breaker_suggestions = await self._suggest_circuit_breaker_patterns(dependency_graph)
        suggestions.extend(circuit_breaker_suggestions)
        
        # 5. 캐싱 레이어 제안
        caching_suggestions = await self._suggest_caching_layers(dependency_graph)
        suggestions.extend(caching_suggestions)
        
        # 우선순위별 정렬
        suggestions.sort(key=lambda x: x.priority_score, reverse=True)
        
        return suggestions
    
    async def _suggest_spof_mitigation(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """단일 장애점 완화 제안"""
        suggestions = []
        centrality_metrics = dependency_graph.calculate_centrality_metrics()
        
        for system_id, metrics in centrality_metrics.items():
            # 높은 중심성 = 잠재적 SPOF
            centrality_score = (
                metrics['betweenness_centrality'] * 0.4 +
                metrics['degree_centrality'] * 0.3 +
                metrics['pagerank'] * 0.3
            )
            
            if centrality_score > 0.7:  # 임계값
                system = dependency_graph._systems[system_id]
                
                suggestion = OptimizationSuggestion(
                    suggestion_type="reduce_spof",
                    description=f"Add redundancy for critical system {system.name} "
                               f"(centrality score: {centrality_score:.3f})",
                    affected_systems=[system_id],
                    expected_benefit="Reduced single point of failure risk",
                    implementation_effort="high",
                    priority_score=centrality_score * 10,
                    estimated_cost=50000 + (centrality_score * 100000),
                    estimated_savings=centrality_score * 500000
                )
                suggestions.append(suggestion)
        
        return suggestions
    
    async def _suggest_coupling_reduction(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """결합도 감소 제안"""
        suggestions = []
        
        # 과도한 외부 의존성을 가진 시스템 찾기
        for system_id, system in dependency_graph._systems.items():
            dependencies = dependency_graph.get_dependencies(system_id)
            
            if len(dependencies) > 5:  # 임계값
                suggestion = OptimizationSuggestion(
                    suggestion_type="reduce_coupling",
                    description=f"Reduce coupling for {system.name} "
                               f"({len(dependencies)} dependencies)",
                    affected_systems=[system_id] + dependencies,
                    expected_benefit="Improved system resilience and maintainability",
                    implementation_effort="medium",
                    priority_score=len(dependencies) * 2,
                    estimated_cost=20000 + (len(dependencies) * 5000),
                    estimated_savings=len(dependencies) * 15000
                )
                suggestions.append(suggestion)
        
        return suggestions
    
    async def _suggest_redundancy_improvements(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """중복성 개선 제안"""
        suggestions = []
        
        # 중요한 시스템 중 단일 인스턴스로 운영되는 것들 찾기
        critical_types = {
            SystemType.DATABASE,
            SystemType.API_GATEWAY,
            SystemType.LOAD_BALANCER,
            SystemType.MESSAGE_QUEUE
        }
        
        for system_id, system in dependency_graph._systems.items():
            if system.system_type in critical_types:
                dependents = dependency_graph.get_dependents(system_id)
                
                if len(dependents) > 2:  # 많은 시스템이 의존하는 경우
                    suggestion = OptimizationSuggestion(
                        suggestion_type="add_redundancy",
                        description=f"Add redundancy for critical {system.system_type.value} "
                                   f"{system.name} ({len(dependents)} dependents)",
                        affected_systems=[system_id] + dependents,
                        expected_benefit="Improved availability and fault tolerance",
                        implementation_effort="medium",
                        priority_score=len(dependents) * 3,
                        estimated_cost=30000 + (len(dependents) * 3000),
                        estimated_savings=len(dependents) * 25000
                    )
                    suggestions.append(suggestion)
        
        return suggestions
    
    async def _suggest_circuit_breaker_patterns(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """회로 차단기 패턴 제안"""
        suggestions = []
        
        # 동기 의존성에 대해 회로 차단기 패턴 제안
        for dependency in dependency_graph._dependencies.values():
            if (dependency.dependency_type == DependencyType.SYNCHRONOUS and
                not dependency.circuit_breaker):
                
                source_system = dependency_graph._systems[dependency.source_id]
                target_system = dependency_graph._systems[dependency.target_id]
                
                suggestion = OptimizationSuggestion(
                    suggestion_type="circuit_breaker",
                    description=f"Implement circuit breaker between {source_system.name} "
                               f"and {target_system.name}",
                    affected_systems=[dependency.source_id, dependency.target_id],
                    expected_benefit="Prevent cascade failures and improve resilience",
                    implementation_effort="low",
                    priority_score=dependency.weight * 5,
                    estimated_cost=5000,
                    estimated_savings=dependency.weight * 50000
                )
                suggestions.append(suggestion)
        
        return suggestions
    
    async def _suggest_caching_layers(self, dependency_graph: DependencyGraph) -> List[OptimizationSuggestion]:
        """캐싱 레이어 제안"""
        suggestions = []
        
        # 데이터베이스나 외부 API에 많은 의존성이 있는 경우
        for system_id, system in dependency_graph._systems.items():
            if system.system_type in {SystemType.DATABASE, SystemType.EXTERNAL_API}:
                dependents = dependency_graph.get_dependents(system_id)
                
                if len(dependents) > 3:  # 많은 클라이언트가 있는 경우
                    suggestion = OptimizationSuggestion(
                        suggestion_type="add_caching",
                        description=f"Add caching layer for {system.name} "
                                   f"({len(dependents)} clients)",
                        affected_systems=[system_id] + dependents,
                        expected_benefit="Reduced load and improved response times",
                        implementation_effort="medium",
                        priority_score=len(dependents) * 2,
                        estimated_cost=15000,
                        estimated_savings=len(dependents) * 10000
                    )
                    suggestions.append(suggestion)
        
        return suggestions


class HealthMonitor:
    """시스템 건강도 모니터"""
    
    async def check_system_health(self, system: SystemNode) -> Dict[str, Any]:
        """시스템 건강도 확인"""
        health_info = {
            'system_id': system.id,
            'status': 'unknown',
            'response_time': 0,
            'error_rate': 0,
            'cpu_usage': 0,
            'memory_usage': 0,
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            if system.health_check_url:
                # HTTP 건강도 확인
                health_info = await self._http_health_check(system)
            else:
                # 기본 연결성 확인
                health_info = await self._basic_connectivity_check(system)
        
        except Exception as e:
            health_info.update({
                'status': 'down',
                'error': str(e)
            })
        
        return health_info
    
    async def _http_health_check(self, system: SystemNode) -> Dict[str, Any]:
        """HTTP 건강도 확인"""
        import aiohttp
        
        start_time = time.time()
        
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(system.health_check_url) as response:
                    response_time = (time.time() - start_time) * 1000  # ms
                    
                    if response.status == 200:
                        status = 'healthy'
                    elif response.status in {502, 503, 504}:
                        status = 'down'
                    else:
                        status = 'degraded'
                    
                    return {
                        'system_id': system.id,
                        'status': status,
                        'response_time': response_time,
                        'http_status': response.status,
                        'timestamp': datetime.now().isoformat()
                    }
        
        except asyncio.TimeoutError:
            return {
                'system_id': system.id,
                'status': 'down',
                'error': 'Health check timeout',
                'response_time': (time.time() - start_time) * 1000,
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            return {
                'system_id': system.id,
                'status': 'down',
                'error': str(e),
                'response_time': (time.time() - start_time) * 1000,
                'timestamp': datetime.now().isoformat()
            }
    
    async def _basic_connectivity_check(self, system: SystemNode) -> Dict[str, Any]:
        """기본 연결성 확인"""
        # 실제 구현에서는 ping, 포트 확인 등을 수행
        return {
            'system_id': system.id,
            'status': 'healthy',  # 기본값
            'response_time': 50,  # 기본값
            'timestamp': datetime.now().isoformat()
        }


class AnomalyDetector:
    """이상 징후 탐지기"""
    
    def __init__(self):
        self.baseline_metrics = {}
        self.anomaly_threshold = 2.0  # 표준편차
    
    async def detect_anomalies(self, dependency_graph: DependencyGraph) -> List[Dict[str, Any]]:
        """이상 징후 탐지"""
        anomalies = []
        
        for system_id, system in dependency_graph._systems.items():
            try:
                # 시스템별 메트릭 수집
                current_metrics = await self._collect_system_metrics(system)
                
                # 베이스라인과 비교
                system_anomalies = self._compare_with_baseline(system_id, current_metrics)
                anomalies.extend(system_anomalies)
                
                # 베이스라인 업데이트
                self._update_baseline(system_id, current_metrics)
            
            except Exception as e:
                logger.error(f"Error detecting anomalies for {system_id}: {e}")
        
        return anomalies
    
    async def _collect_system_metrics(self, system: SystemNode) -> Dict[str, float]:
        """시스템 메트릭 수집"""
        # 실제 구현에서는 Prometheus, CloudWatch 등에서 메트릭 수집
        return {
            'response_time': 100.0,  # ms
            'error_rate': 0.01,      # 1%
            'cpu_usage': 0.5,        # 50%
            'memory_usage': 0.6,     # 60%
            'request_rate': 1000.0,  # requests/min
            'timestamp': time.time()
        }
    
    def _compare_with_baseline(self, system_id: str, current_metrics: Dict[str, float]) -> List[Dict[str, Any]]:
        """베이스라인과 비교"""
        anomalies = []
        
        if system_id not in self.baseline_metrics:
            return anomalies
        
        baseline = self.baseline_metrics[system_id]
        
        for metric_name, current_value in current_metrics.items():
            if metric_name == 'timestamp':
                continue
            
            if metric_name in baseline:
                mean = baseline[metric_name]['mean']
                std = baseline[metric_name]['std']
                
                if std > 0:
                    z_score = abs(current_value - mean) / std
                    
                    if z_score > self.anomaly_threshold:
                        anomalies.append({
                            'system_id': system_id,
                            'type': f'{metric_name}_anomaly',
                            'current_value': current_value,
                            'expected_range': (mean - 2*std, mean + 2*std),
                            'z_score': z_score,
                            'confidence': min(1.0, z_score / self.anomaly_threshold),
                            'timestamp': datetime.now().isoformat()
                        })
        
        return anomalies
    
    def _update_baseline(self, system_id: str, metrics: Dict[str, float]) -> None:
        """베이스라인 업데이트"""
        if system_id not in self.baseline_metrics:
            self.baseline_metrics[system_id] = {}
        
        baseline = self.baseline_metrics[system_id]
        
        for metric_name, value in metrics.items():
            if metric_name == 'timestamp':
                continue
            
            if metric_name not in baseline:
                baseline[metric_name] = {
                    'values': [value],
                    'mean': value,
                    'std': 0.0
                }
            else:
                # 이동 평균 및 표준편차 계산 (최근 100개 값 유지)
                values = baseline[metric_name]['values']
                values.append(value)
                
                if len(values) > 100:
                    values.pop(0)
                
                baseline[metric_name]['mean'] = np.mean(values)
                baseline[metric_name]['std'] = np.std(values)


# 팩토리 클래스
class DependencyTrackerFactory:
    """의존성 추적기 팩토리"""
    
    @staticmethod
    def create_tracker(config: Optional[Dict[str, Any]] = None) -> CrossSystemDependencyTracker:
        """의존성 추적기 생성"""
        return CrossSystemDependencyTracker(config)
    
    @staticmethod
    def create_from_config_file(config_file: str) -> CrossSystemDependencyTracker:
        """설정 파일로부터 추적기 생성"""
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            return CrossSystemDependencyTracker(config)
        except Exception as e:
            logger.error(f"Error loading config from {config_file}: {e}")
            return CrossSystemDependencyTracker()


# 유틸리티 함수들
def create_system_node(system_id: str, name: str, system_type: str, **kwargs) -> SystemNode:
    """시스템 노드 생성 헬퍼"""
    return SystemNode(
        id=system_id,
        name=name,
        system_type=SystemType(system_type),
        **kwargs
    )

def create_dependency_edge(source_id: str, target_id: str, dependency_type: str, **kwargs) -> DependencyEdge:
    """의존성 엣지 생성 헬퍼"""
    return DependencyEdge(
        source_id=source_id,
        target_id=target_id,
        dependency_type=DependencyType(dependency_type),
        **kwargs
    )

async def analyze_system_dependencies(systems_config: List[Dict], 
                                    dependencies_config: List[Dict]) -> Dict[str, Any]:
    """시스템 의존성 분석 (편의 함수)"""
    tracker = CrossSystemDependencyTracker()
    
    # 시스템 노드 생성
    systems = []
    for sys_config in systems_config:
        system = create_system_node(**sys_config)
        systems.append(system)
    
    # 의존성 엣지 생성
    dependencies = []
    for dep_config in dependencies_config:
        dependency = create_dependency_edge(**dep_config)
        dependencies.append(dependency)
    
    # 의존성 그래프 구축
    graph = tracker.build_dependency_graph(systems, dependencies)
    
    # 분석 실행
    analysis_results = {
        'graph_metrics': graph.metrics,
        'centrality_metrics': graph.calculate_centrality_metrics(),
        'cycles': graph.detect_cycles(),
        'spof_candidates': tracker.find_single_points_of_failure(),
        'criticality_scores': tracker.calculate_system_criticality(),
        'optimization_suggestions': await tracker.optimize_dependency_structure()
    }
    
    return analysis_results

def export_graph_to_json(dependency_graph: DependencyGraph, output_file: str) -> None:
    """의존성 그래프를 JSON으로 내보내기"""
    try:
        graph_data = dependency_graph.to_dict()
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(graph_data, f, indent=2, ensure_ascii=False, default=str)
        
        logger.info(f"Exported dependency graph to {output_file}")
    
    except Exception as e:
        logger.error(f"Error exporting graph to JSON: {e}")

def import_graph_from_json(json_file: str) -> DependencyGraph:
    """JSON에서 의존성 그래프 가져오기"""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            graph_data = json.load(f)
        
        graph = DependencyGraph()
        
        # 시스템 추가
        for sys_id, sys_data in graph_data['systems'].items():
            system = SystemNode(
                id=sys_data['id'],
                name=sys_data['name'],
                system_type=SystemType(sys_data['system_type']),
                endpoint=sys_data.get('endpoint'),
                version=sys_data.get('version'),
                metadata=sys_data.get('metadata', {})
            )
            graph.add_system(system)
        
        # 의존성 추가
        for dep_data in graph_data['dependencies']:
            dependency = DependencyEdge(
                source_id=dep_data['source_id'],
                target_id=dep_data['target_id'],
                dependency_type=DependencyType(dep_data['dependency_type']),
                weight=dep_data.get('weight', 1.0),
                latency_sla=dep_data.get('latency_sla'),
                error_threshold=dep_data.get('error_threshold', 0.05),
                timeout=dep_data.get('timeout'),
                metadata=dep_data.get('metadata', {})
            )
            graph.add_dependency(dependency)
        
        logger.info(f"Imported dependency graph from {json_file}")
        return graph
    
    except Exception as e:
        logger.error(f"Error importing graph from JSON: {e}")
        return DependencyGraph()


# 사용 예제 및 테스트
if __name__ == "__main__":
    async def main():
        # 의존성 추적기 생성
        tracker = CrossSystemDependencyTracker({
            'monitoring_interval': 30,
            'max_cascade_depth': 10,
            'impact_threshold': 0.1
        })
        
        # 시스템 노드들 생성
        systems = [
            create_system_node("web-server-1", "Web Server", "web_server", 
                             endpoint="http://web-server-1:8080"),
            create_system_node("api-gateway", "API Gateway", "api_gateway", 
                             endpoint="http://api-gateway:80"),
            create_system_node("user-service", "User Service", "microservice", 
                             endpoint="http://user-service:8080"),
            create_system_node("order-service", "Order Service", "microservice", 
                             endpoint="http://order-service:8080"),
            create_system_node("postgres-db", "PostgreSQL Database", "database", 
                             endpoint="postgres://postgres-db:5432"),
            create_system_node("redis-cache", "Redis Cache", "cache", 
                             endpoint="redis://redis-cache:6379"),
            create_system_node("rabbitmq", "RabbitMQ", "message_queue", 
                             endpoint="amqp://rabbitmq:5672")
        ]
        
        # 의존성 관계들 정의
        dependencies = [
            create_dependency_edge("web-server-1", "api-gateway", "synchronous", weight=0.9),
            create_dependency_edge("api-gateway", "user-service", "synchronous", weight=0.8),
            create_dependency_edge("api-gateway", "order-service", "synchronous", weight=0.7),
            create_dependency_edge("user-service", "postgres-db", "synchronous", weight=1.0),
            create_dependency_edge("order-service", "postgres-db", "synchronous", weight=1.0),
            create_dependency_edge("user-service", "redis-cache", "synchronous", weight=0.5),
            create_dependency_edge("order-service", "rabbitmq", "asynchronous", weight=0.6)
        ]
        
        # 의존성 그래프 구축
        print("Building dependency graph...")
        graph = tracker.build_dependency_graph(systems, dependencies)
        
        # 분석 실행
        print("\nAnalyzing system dependencies...")
        
        # 중심성 메트릭
        centrality = graph.calculate_centrality_metrics()
        print("Centrality Metrics:")
        for system_id, metrics in centrality.items():
            print(f"  {system_id}: PageRank={metrics['pagerank']:.3f}")
        
        # 단일 장애점 찾기
        spof = tracker.find_single_points_of_failure()
        print(f"\nSingle Points of Failure: {spof}")
        
        # 시스템 중요도
        criticality = tracker.calculate_system_criticality()
        print("\nSystem Criticality Scores:")
        for system_id, score in sorted(criticality.items(), key=lambda x: x[1], reverse=True):
            print(f"  {system_id}: {score:.3f}")
        
        # 장애 시뮬레이션
        print("\nSimulating failure scenarios...")
        scenarios = [
            {
                'failed_systems': ['postgres-db'],
                'failure_type': 'service_down',
                'severity': 'critical'
            },
            {
                'failed_systems': ['api-gateway'],
                'failure_type': 'slow_response',
                'severity': 'high'
            }
        ]
        
        simulation_results = await tracker.simulate_failure_scenarios(scenarios)
        for scenario_id, result in simulation_results.items():
            if 'error' not in result:
                print(f"  {scenario_id}: {result['total_affected_systems']} systems affected")
        
        # 최적화 제안
        print("\nGenerating optimization suggestions...")
        suggestions = await tracker.optimize_dependency_structure()
        print(f"Generated {len(suggestions)} optimization suggestions:")
        for i, suggestion in enumerate(suggestions[:3], 1):
            print(f"  {i}. {suggestion.suggestion_type}: {suggestion.description}")
        
        # 그래프 내보내기
        print("\nExporting dependency graph...")
        export_graph_to_json(graph, "dependency_graph.json")
        
        # Graphviz 내보내기 (선택적)
        try:
            tracker.export_to_graphviz("dependency_graph.dot")
            print("Exported to Graphviz format")
        except Exception as e:
            print(f"Graphviz export failed: {e}")
        
        print("\nDependency analysis completed!")
    
    # 예제 실행
    asyncio.run(main())