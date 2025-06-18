#!/usr/bin/env python3
"""
Evolutionary Pipeline Manager
자가 발전형 LLM 연동 IDE를 위한 파이프라인 진화 관리 시스템

주요 기능:
- 유전 알고리즘 기반 파이프라인 진화
- 다목적 최적화 (성능, 비용, 안정성)
- 실시간 적합도 평가
- 세대별 버전 관리
- 사용자 피드백 기반 학습
- 자동 롤백 및 복구
- 병렬 진화 처리
"""

import asyncio
import json
import logging
import random
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Set, Tuple, Union, Callable,
    Protocol, runtime_checkable, Generic, TypeVar
)
import numpy as np
from abc import ABC, abstractmethod
import pickle
import threading
from contextlib import contextmanager
import weakref
import copy

# 타입 변수
T = TypeVar('T')
P = TypeVar('P')  # Pipeline type

# 로깅 설정
logger = logging.getLogger(__name__)


# 예외 클래스들
class EvolutionError(Exception):
    """진화 관련 기본 예외"""
    pass


class FitnessEvaluationError(EvolutionError):
    """적합도 평가 오류"""
    pass


class MutationError(EvolutionError):
    """돌연변이 오류"""
    pass


class CrossoverError(EvolutionError):
    """교차 오류"""
    pass


class PipelineExecutionError(EvolutionError):
    """파이프라인 실행 오류"""
    pass


# 열거형 정의
class OptimizationObjective(Enum):
    """최적화 목표"""
    PERFORMANCE = "performance"
    COST = "cost"
    RELIABILITY = "reliability"
    SCALABILITY = "scalability"
    SECURITY = "security"
    USER_SATISFACTION = "user_satisfaction"
    ENERGY_EFFICIENCY = "energy_efficiency"


class MutationType(Enum):
    """돌연변이 타입"""
    PARAMETER_TWEAK = "parameter_tweak"
    STRUCTURE_CHANGE = "structure_change"
    OPERATOR_SWAP = "operator_swap"
    NODE_ADDITION = "node_addition"
    NODE_REMOVAL = "node_removal"
    CONNECTION_MODIFY = "connection_modify"


class CrossoverType(Enum):
    """교차 타입"""
    SINGLE_POINT = "single_point"
    TWO_POINT = "two_point"
    UNIFORM = "uniform"
    ARITHMETIC = "arithmetic"
    BLEND = "blend"
    SIMULATED_BINARY = "simulated_binary"


class SelectionMethod(Enum):
    """선택 방법"""
    TOURNAMENT = "tournament"
    ROULETTE_WHEEL = "roulette_wheel"
    RANK_BASED = "rank_based"
    ELITISM = "elitism"
    DIVERSITY_BASED = "diversity_based"


# 데이터 클래스들
@dataclass
class PerformanceMetrics:
    """성능 메트릭"""
    execution_time: float
    memory_usage: float
    cpu_utilization: float
    throughput: float
    error_rate: float
    latency_p95: float
    resource_efficiency: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class FitnessScore:
    """적합도 점수"""
    overall_score: float
    objective_scores: Dict[OptimizationObjective, float] = field(default_factory=dict)
    weighted_score: float = 0.0
    ranking: Optional[int] = None
    diversity_bonus: float = 0.0
    penalty: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if self.weighted_score == 0.0:
            self.weighted_score = self.overall_score


@dataclass
class PipelineGenes:
    """파이프라인 유전자"""
    structure: Dict[str, Any]
    parameters: Dict[str, Any]
    operators: List[str]
    connections: List[Tuple[str, str]]
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def clone(self) -> 'PipelineGenes':
        """유전자 복제"""
        return PipelineGenes(
            structure=copy.deepcopy(self.structure),
            parameters=copy.deepcopy(self.parameters),
            operators=copy.deepcopy(self.operators),
            connections=copy.deepcopy(self.connections),
            metadata=copy.deepcopy(self.metadata)
        )


@dataclass
class PipelineCandidate:
    """파이프라인 후보"""
    id: str
    genes: PipelineGenes
    fitness: Optional[FitnessScore] = None
    generation: int = 0
    parent_ids: List[str] = field(default_factory=list)
    creation_time: datetime = field(default_factory=datetime.now)
    execution_history: List[PerformanceMetrics] = field(default_factory=list)
    validation_results: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class Generation:
    """세대"""
    generation_id: int
    candidates: List[PipelineCandidate]
    best_candidate: Optional[PipelineCandidate] = None
    average_fitness: float = 0.0
    diversity_index: float = 0.0
    creation_time: datetime = field(default_factory=datetime.now)
    evolution_stats: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvolutionConfig:
    """진화 설정"""
    population_size: int = 50
    max_generations: int = 100
    mutation_rate: float = 0.1
    crossover_rate: float = 0.8
    elitism_rate: float = 0.1
    tournament_size: int = 3
    selection_method: SelectionMethod = SelectionMethod.TOURNAMENT
    mutation_types: List[MutationType] = field(default_factory=lambda: [MutationType.PARAMETER_TWEAK])
    crossover_type: CrossoverType = CrossoverType.SINGLE_POINT
    optimization_objectives: Dict[OptimizationObjective, float] = field(
        default_factory=lambda: {OptimizationObjective.PERFORMANCE: 1.0}
    )
    convergence_threshold: float = 0.001
    diversity_weight: float = 0.1
    parallel_evaluation: bool = True
    max_parallel_workers: int = 4


# 프로토콜 정의
@runtime_checkable
class Executable(Protocol):
    """실행 가능한 파이프라인"""
    
    async def execute(self, input_data: Any) -> Any:
        """파이프라인 실행"""
        ...
    
    def validate(self) -> bool:
        """파이프라인 검증"""
        ...


@runtime_checkable
class Evaluable(Protocol):
    """평가 가능한 후보"""
    
    def evaluate_fitness(self, metrics: PerformanceMetrics) -> FitnessScore:
        """적합도 평가"""
        ...


# 진화 연산자들
class MutationEngine:
    """돌연변이 엔진"""
    
    def __init__(self, config: EvolutionConfig):
        self.config = config
        self.mutation_strategies = {
            MutationType.PARAMETER_TWEAK: self._parameter_tweak,
            MutationType.STRUCTURE_CHANGE: self._structure_change,
            MutationType.OPERATOR_SWAP: self._operator_swap,
            MutationType.NODE_ADDITION: self._node_addition,
            MutationType.NODE_REMOVAL: self._node_removal,
            MutationType.CONNECTION_MODIFY: self._connection_modify
        }
    
    def mutate(self, candidate: PipelineCandidate) -> PipelineCandidate:
        """후보 돌연변이"""
        if random.random() > self.config.mutation_rate:
            return candidate
        
        mutated_genes = candidate.genes.clone()
        mutation_type = random.choice(self.config.mutation_types)
        
        try:
            self.mutation_strategies[mutation_type](mutated_genes)
            
            mutated_candidate = PipelineCandidate(
                id=str(uuid.uuid4()),
                genes=mutated_genes,
                generation=candidate.generation + 1,
                parent_ids=[candidate.id]
            )
            
            logger.debug(f"Mutation {mutation_type.value} applied to {candidate.id}")
            return mutated_candidate
            
        except Exception as e:
            logger.error(f"Mutation failed for {candidate.id}: {e}")
            raise MutationError(f"Mutation failed: {e}")
    
    def _parameter_tweak(self, genes: PipelineGenes):
        """매개변수 미세 조정"""
        for param_name, param_value in genes.parameters.items():
            if random.random() < 0.3:  # 30% 확률로 매개변수 조정
                if isinstance(param_value, (int, float)):
                    # 가우시안 노이즈 추가
                    noise = np.random.normal(0, abs(param_value) * 0.1)
                    genes.parameters[param_name] = param_value + noise
                elif isinstance(param_value, bool):
                    # 불린 값 플립
                    if random.random() < 0.1:
                        genes.parameters[param_name] = not param_value
    
    def _structure_change(self, genes: PipelineGenes):
        """구조 변경"""
        # 구조 내 노드 순서 변경
        if 'nodes' in genes.structure:
            nodes = genes.structure['nodes']
            if len(nodes) > 1:
                # 두 노드 위치 교환
                idx1, idx2 = random.sample(range(len(nodes)), 2)
                nodes[idx1], nodes[idx2] = nodes[idx2], nodes[idx1]
    
    def _operator_swap(self, genes: PipelineGenes):
        """연산자 교환"""
        if genes.operators and len(genes.operators) > 1:
            idx = random.randint(0, len(genes.operators) - 1)
            # 사전 정의된 연산자 목록에서 랜덤 선택
            available_operators = ['map', 'filter', 'reduce', 'transform', 'aggregate']
            genes.operators[idx] = random.choice(available_operators)
    
    def _node_addition(self, genes: PipelineGenes):
        """노드 추가"""
        if 'nodes' in genes.structure:
            new_node = {
                'id': str(uuid.uuid4()),
                'type': random.choice(['processor', 'filter', 'transformer']),
                'config': {}
            }
            genes.structure['nodes'].append(new_node)
    
    def _node_removal(self, genes: PipelineGenes):
        """노드 제거"""
        if 'nodes' in genes.structure and len(genes.structure['nodes']) > 1:
            idx = random.randint(0, len(genes.structure['nodes']) - 1)
            removed_node = genes.structure['nodes'].pop(idx)
            
            # 연결 정보 업데이트
            genes.connections = [
                (src, tgt) for src, tgt in genes.connections
                if src != removed_node.get('id') and tgt != removed_node.get('id')
            ]
    
    def _connection_modify(self, genes: PipelineGenes):
        """연결 수정"""
        if genes.connections and len(genes.connections) > 0:
            idx = random.randint(0, len(genes.connections) - 1)
            src, tgt = genes.connections[idx]
            
            # 새로운 연결 대상 찾기
            if 'nodes' in genes.structure:
                available_nodes = [node.get('id') for node in genes.structure['nodes']]
                if available_nodes:
                    new_target = random.choice(available_nodes)
                    genes.connections[idx] = (src, new_target)


class CrossoverEngine:
    """교차 엔진"""
    
    def __init__(self, config: EvolutionConfig):
        self.config = config
        self.crossover_strategies = {
            CrossoverType.SINGLE_POINT: self._single_point_crossover,
            CrossoverType.TWO_POINT: self._two_point_crossover,
            CrossoverType.UNIFORM: self._uniform_crossover,
            CrossoverType.ARITHMETIC: self._arithmetic_crossover,
            CrossoverType.BLEND: self._blend_crossover
        }
    
    def crossover(self, parent1: PipelineCandidate, parent2: PipelineCandidate) -> Tuple[PipelineCandidate, PipelineCandidate]:
        """교차 연산"""
        if random.random() > self.config.crossover_rate:
            return parent1, parent2
        
        try:
            child1_genes, child2_genes = self.crossover_strategies[self.config.crossover_type](
                parent1.genes, parent2.genes
            )
            
            child1 = PipelineCandidate(
                id=str(uuid.uuid4()),
                genes=child1_genes,
                generation=max(parent1.generation, parent2.generation) + 1,
                parent_ids=[parent1.id, parent2.id]
            )
            
            child2 = PipelineCandidate(
                id=str(uuid.uuid4()),
                genes=child2_genes,
                generation=max(parent1.generation, parent2.generation) + 1,
                parent_ids=[parent1.id, parent2.id]
            )
            
            return child1, child2
            
        except Exception as e:
            logger.error(f"Crossover failed: {e}")
            raise CrossoverError(f"Crossover failed: {e}")
    
    def _single_point_crossover(self, genes1: PipelineGenes, genes2: PipelineGenes) -> Tuple[PipelineGenes, PipelineGenes]:
        """단일점 교차"""
        child1 = genes1.clone()
        child2 = genes2.clone()
        
        # 매개변수 교차
        param_keys = list(genes1.parameters.keys())
        if param_keys:
            crossover_point = random.randint(0, len(param_keys))
            
            for i, key in enumerate(param_keys):
                if i >= crossover_point:
                    if key in genes2.parameters:
                        child1.parameters[key] = genes2.parameters[key]
                    if key in genes1.parameters:
                        child2.parameters[key] = genes1.parameters[key]
        
        return child1, child2
    
    def _two_point_crossover(self, genes1: PipelineGenes, genes2: PipelineGenes) -> Tuple[PipelineGenes, PipelineGenes]:
        """두점 교차"""
        child1 = genes1.clone()
        child2 = genes2.clone()
        
        param_keys = list(genes1.parameters.keys())
        if len(param_keys) >= 2:
            point1, point2 = sorted(random.sample(range(len(param_keys)), 2))
            
            for i, key in enumerate(param_keys):
                if point1 <= i < point2:
                    if key in genes2.parameters:
                        child1.parameters[key] = genes2.parameters[key]
                    if key in genes1.parameters:
                        child2.parameters[key] = genes1.parameters[key]
        
        return child1, child2
    
    def _uniform_crossover(self, genes1: PipelineGenes, genes2: PipelineGenes) -> Tuple[PipelineGenes, PipelineGenes]:
        """균등 교차"""
        child1 = genes1.clone()
        child2 = genes2.clone()
        
        for key in genes1.parameters:
            if random.random() < 0.5 and key in genes2.parameters:
                child1.parameters[key] = genes2.parameters[key]
                child2.parameters[key] = genes1.parameters[key]
        
        return child1, child2
    
    def _arithmetic_crossover(self, genes1: PipelineGenes, genes2: PipelineGenes) -> Tuple[PipelineGenes, PipelineGenes]:
        """산술 교차"""
        child1 = genes1.clone()
        child2 = genes2.clone()
        
        alpha = random.random()
        
        for key in genes1.parameters:
            if key in genes2.parameters:
                val1, val2 = genes1.parameters[key], genes2.parameters[key]
                if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                    child1.parameters[key] = alpha * val1 + (1 - alpha) * val2
                    child2.parameters[key] = (1 - alpha) * val1 + alpha * val2
        
        return child1, child2
    
    def _blend_crossover(self, genes1: PipelineGenes, genes2: PipelineGenes) -> Tuple[PipelineGenes, PipelineGenes]:
        """블렌드 교차"""
        child1 = genes1.clone()
        child2 = genes2.clone()
        
        for key in genes1.parameters:
            if key in genes2.parameters:
                val1, val2 = genes1.parameters[key], genes2.parameters[key]
                if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                    min_val, max_val = min(val1, val2), max(val1, val2)
                    range_val = max_val - min_val
                    
                    # 범위 확장
                    extended_min = min_val - 0.25 * range_val
                    extended_max = max_val + 0.25 * range_val
                    
                    child1.parameters[key] = random.uniform(extended_min, extended_max)
                    child2.parameters[key] = random.uniform(extended_min, extended_max)
        
        return child1, child2


class FitnessEvaluator:
    """적합도 평가기"""
    
    def __init__(self, config: EvolutionConfig):
        self.config = config
        self.objective_weights = config.optimization_objectives
        self.evaluation_cache = {}
        self._cache_lock = threading.RLock()
    
    async def evaluate_candidate(self, candidate: PipelineCandidate, 
                               test_data: Any = None) -> FitnessScore:
        """후보 적합도 평가"""
        try:
            # 캐시 확인
            cache_key = self._get_cache_key(candidate)
            with self._cache_lock:
                if cache_key in self.evaluation_cache:
                    return self.evaluation_cache[cache_key]
            
            # 파이프라인 실행 및 성능 측정
            metrics = await self._execute_and_measure(candidate, test_data)
            
            # 목적별 점수 계산
            objective_scores = {}
            for objective, weight in self.objective_weights.items():
                score = self._calculate_objective_score(objective, metrics)
                objective_scores[objective] = score
            
            # 전체 적합도 계산
            overall_score = sum(
                score * weight for score, weight in 
                zip(objective_scores.values(), self.objective_weights.values())
            )
            
            # 다양성 보너스 계산
            diversity_bonus = self._calculate_diversity_bonus(candidate)
            
            # 제약 조건 위반 페널티
            penalty = self._calculate_penalty(candidate, metrics)
            
            fitness = FitnessScore(
                overall_score=overall_score,
                objective_scores=objective_scores,
                weighted_score=overall_score + diversity_bonus - penalty,
                diversity_bonus=diversity_bonus,
                penalty=penalty,
                metadata={
                    'metrics': asdict(metrics),
                    'evaluation_time': datetime.now().isoformat()
                }
            )
            
            # 캐시에 저장
            with self._cache_lock:
                self.evaluation_cache[cache_key] = fitness
            
            candidate.fitness = fitness
            candidate.execution_history.append(metrics)
            
            return fitness
            
        except Exception as e:
            logger.error(f"Fitness evaluation failed for {candidate.id}: {e}")
            raise FitnessEvaluationError(f"Evaluation failed: {e}")
    
    async def _execute_and_measure(self, candidate: PipelineCandidate, 
                                 test_data: Any) -> PerformanceMetrics:
        """파이프라인 실행 및 성능 측정"""
        start_time = time.time()
        start_memory = self._get_memory_usage()
        
        try:
            # 파이프라인 구성 및 실행
            pipeline = self._build_pipeline(candidate.genes)
            
            if hasattr(pipeline, 'execute'):
                result = await pipeline.execute(test_data)
            else:
                # 기본 실행 로직
                result = await self._default_execution(candidate.genes, test_data)
            
            execution_time = time.time() - start_time
            memory_usage = self._get_memory_usage() - start_memory
            
            # 성능 메트릭 수집
            metrics = PerformanceMetrics(
                execution_time=execution_time,
                memory_usage=max(0, memory_usage),
                cpu_utilization=self._get_cpu_utilization(),
                throughput=self._calculate_throughput(result, execution_time),
                error_rate=0.0,  # 성공적 실행
                latency_p95=execution_time * 1.2,  # 추정값
                resource_efficiency=self._calculate_resource_efficiency(
                    execution_time, memory_usage
                )
            )
            
            return metrics
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Pipeline execution failed: {e}")
            
            # 실패한 경우의 메트릭
            return PerformanceMetrics(
                execution_time=execution_time,
                memory_usage=0,
                cpu_utilization=0,
                throughput=0,
                error_rate=1.0,
                latency_p95=float('inf'),
                resource_efficiency=0
            )
    
    def _calculate_objective_score(self, objective: OptimizationObjective, 
                                 metrics: PerformanceMetrics) -> float:
        """목적별 점수 계산"""
        if objective == OptimizationObjective.PERFORMANCE:
            # 실행 시간이 짧을수록 높은 점수
            return 1.0 / (1.0 + metrics.execution_time)
        
        elif objective == OptimizationObjective.COST:
            # 리소스 사용량이 적을수록 높은 점수
            cost_factor = metrics.memory_usage + metrics.cpu_utilization
            return 1.0 / (1.0 + cost_factor)
        
        elif objective == OptimizationObjective.RELIABILITY:
            # 에러율이 낮을수록 높은 점수
            return 1.0 - metrics.error_rate
        
        elif objective == OptimizationObjective.SCALABILITY:
            # 처리량이 높을수록 높은 점수
            return metrics.throughput / (1.0 + metrics.throughput)
        
        else:
            # 기본 점수
            return metrics.resource_efficiency
    
    def _calculate_diversity_bonus(self, candidate: PipelineCandidate) -> float:
        """다양성 보너스 계산"""
        # 간단한 다양성 측정: 구조의 복잡성
        structure_complexity = len(candidate.genes.operators) + len(candidate.genes.connections)
        return self.config.diversity_weight * (structure_complexity / 100.0)
    
    def _calculate_penalty(self, candidate: PipelineCandidate, 
                         metrics: PerformanceMetrics) -> float:
        """제약 조건 위반 페널티"""
        penalty = 0.0
        
        # 실행 시간 제한
        if metrics.execution_time > 10.0:  # 10초 제한
            penalty += (metrics.execution_time - 10.0) * 0.1
        
        # 메모리 사용량 제한
        if metrics.memory_usage > 1000:  # 1GB 제한
            penalty += (metrics.memory_usage - 1000) * 0.001
        
        # 에러율 페널티
        penalty += metrics.error_rate * 10.0
        
        return penalty
    
    def _get_cache_key(self, candidate: PipelineCandidate) -> str:
        """캐시 키 생성"""
        genes_str = json.dumps(asdict(candidate.genes), sort_keys=True)
        return hashlib.md5(genes_str.encode()).hexdigest()
    
    def _build_pipeline(self, genes: PipelineGenes) -> Any:
        """유전자로부터 파이프라인 구축"""
        # 실제 구현에서는 genes를 기반으로 실행 가능한 파이프라인 객체 생성
        return MockPipeline(genes)
    
    async def _default_execution(self, genes: PipelineGenes, test_data: Any) -> Any:
        """기본 실행 로직"""
        # 시뮬레이션된 실행
        await asyncio.sleep(random.uniform(0.1, 2.0))  # 실행 시간 시뮬레이션
        return {"result": "success", "processed_items": random.randint(100, 1000)}
    
    def _get_memory_usage(self) -> float:
        """메모리 사용량 측정"""
        import psutil
        process = psutil.Process()
        return process.memory_info().rss / 1024 / 1024  # MB
    
    def _get_cpu_utilization(self) -> float:
        """CPU 사용률 측정"""
        import psutil
        return psutil.cpu_percent(interval=0.1)
    
    def _calculate_throughput(self, result: Any, execution_time: float) -> float:
        """처리량 계산"""
        if isinstance(result, dict) and 'processed_items' in result:
            return result['processed_items'] / execution_time
        return 1.0 / execution_time
    
    def _calculate_resource_efficiency(self, execution_time: float, memory_usage: float) -> float:
        """리소스 효율성 계산"""
        return 1.0 / (1.0 + execution_time + memory_usage / 1000.0)


class SelectionEngine:
    """선택 엔진"""
    
    def __init__(self, config: EvolutionConfig):
        self.config = config
    
    def select_parents(self, population: List[PipelineCandidate], 
                      count: int) -> List[PipelineCandidate]:
        """부모 선택"""
        if self.config.selection_method == SelectionMethod.TOURNAMENT:
            return self._tournament_selection(population, count)
        elif self.config.selection_method == SelectionMethod.ROULETTE_WHEEL:
            return self._roulette_wheel_selection(population, count)
        elif self.config.selection_method == SelectionMethod.RANK_BASED:
            return self._rank_based_selection(population, count)
        elif self.config.selection_method == SelectionMethod.ELITISM:
            return self._elitism_selection(population, count)
        else:
            return self._diversity_based_selection(population, count)
    
    def _tournament_selection(self, population: List[PipelineCandidate], 
                            count: int) -> List[PipelineCandidate]:
        """토너먼트 선택"""
        selected = []
        
        for _ in range(count):
            tournament = random.sample(population, 
                                     min(self.config.tournament_size, len(population)))
            winner = max(tournament, 
                        key=lambda x: x.fitness.weighted_score if x.fitness else 0)
            selected.append(winner)
        
        return selected
    
    def _roulette_wheel_selection(self, population: List[PipelineCandidate], 
                                count: int) -> List[PipelineCandidate]:
        """룰렛 휠 선택"""
        fitness_scores = [c.fitness.weighted_score if c.fitness else 0 for c in population]
        min_fitness = min(fitness_scores)
        
        # 음수 적합도 처리
        if min_fitness < 0:
            fitness_scores = [f - min_fitness + 1 for f in fitness_scores]
        
        total_fitness = sum(fitness_scores)
        if total_fitness == 0:
            return random.sample(population, count)
        
        selected = []
        for _ in range(count):
            pick = random.uniform(0, total_fitness)
            current = 0
            for i, fitness in enumerate(fitness_scores):
                current += fitness
                if current >= pick:
                    selected.append(population[i])
                    break
        return selected
    
    def _rank_based_selection(self, population: List[PipelineCandidate], 
                            count: int) -> List[PipelineCandidate]:
        """순위 기반 선택"""
        sorted_population = sorted(population, 
                                 key=lambda x: x.fitness.weighted_score if x.fitness else 0,
                                 reverse=True)
        
        # 순위에 따른 가중치 부여
        ranks = list(range(len(sorted_population), 0, -1))
        total_rank = sum(ranks)
        
        selected = []
        for _ in range(count):
            pick = random.uniform(0, total_rank)
            current = 0
            for i, rank in enumerate(ranks):
                current += rank
                if current >= pick:
                    selected.append(sorted_population[i])
                    break
        
        return selected
    
    def _elitism_selection(self, population: List[PipelineCandidate], 
                         count: int) -> List[PipelineCandidate]:
        """엘리트 선택"""
        sorted_population = sorted(population, 
                                 key=lambda x: x.fitness.weighted_score if x.fitness else 0,
                                 reverse=True)
        return sorted_population[:count]
    
    def _diversity_based_selection(self, population: List[PipelineCandidate], 
                                 count: int) -> List[PipelineCandidate]:
        """다양성 기반 선택"""
        selected = []
        remaining = population.copy()
        
        # 첫 번째는 가장 좋은 개체
        if remaining:
            best = max(remaining, key=lambda x: x.fitness.weighted_score if x.fitness else 0)
            selected.append(best)
            remaining.remove(best)
        
        # 나머지는 다양성을 고려하여 선택
        while len(selected) < count and remaining:
            diversity_scores = []
            
            for candidate in remaining:
                diversity_score = self._calculate_diversity_from_selected(candidate, selected)
                fitness_score = candidate.fitness.weighted_score if candidate.fitness else 0
                combined_score = fitness_score + diversity_score
                diversity_scores.append((candidate, combined_score))
            
            # 가장 높은 결합 점수를 가진 후보 선택
            best_candidate, _ = max(diversity_scores, key=lambda x: x[1])
            selected.append(best_candidate)
            remaining.remove(best_candidate)
        
        return selected
    
    def _calculate_diversity_from_selected(self, candidate: PipelineCandidate, 
                                         selected: List[PipelineCandidate]) -> float:
        """선택된 개체들로부터의 다양성 계산"""
        if not selected:
            return 1.0
        
        diversity_sum = 0.0
        for selected_candidate in selected:
            diversity_sum += self._calculate_genetic_distance(candidate, selected_candidate)
        
        return diversity_sum / len(selected)
    
    def _calculate_genetic_distance(self, candidate1: PipelineCandidate, 
                                  candidate2: PipelineCandidate) -> float:
        """유전적 거리 계산"""
        distance = 0.0
        
        # 매개변수 차이
        params1 = candidate1.genes.parameters
        params2 = candidate2.genes.parameters
        
        all_keys = set(params1.keys()) | set(params2.keys())
        for key in all_keys:
            if key in params1 and key in params2:
                val1, val2 = params1[key], params2[key]
                if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                    distance += abs(val1 - val2)
                elif val1 != val2:
                    distance += 1.0
            else:
                distance += 1.0
        
        # 구조 차이
        ops1 = set(candidate1.genes.operators)
        ops2 = set(candidate2.genes.operators)
        distance += len(ops1.symmetric_difference(ops2))
        
        return distance


class MockPipeline:
    """파이프라인 시뮬레이션용 목 클래스"""
    
    def __init__(self, genes: PipelineGenes):
        self.genes = genes
    
    async def execute(self, input_data: Any) -> Any:
        """파이프라인 실행 시뮬레이션"""
        # 유전자 기반 실행 시간 계산
        complexity = len(self.genes.operators) + len(self.genes.connections)
        base_time = self.genes.parameters.get('base_execution_time', 1.0)
        execution_time = base_time * (1 + complexity * 0.1)
        
        await asyncio.sleep(execution_time)
        
        return {
            'result': 'success',
            'processed_items': random.randint(100, 1000),
            'execution_time': execution_time
        }
    
    def validate(self) -> bool:
        """파이프라인 검증"""
        return len(self.genes.operators) > 0


class EvolutionaryPipelineManager:
    """진화형 파이프라인 매니저"""
    
    def __init__(self, config: EvolutionConfig = None):
        self.config = config or EvolutionConfig()
        self.fitness_evaluator = FitnessEvaluator(self.config)
        self.mutation_engine = MutationEngine(self.config)
        self.crossover_engine = CrossoverEngine(self.config)
        self.selection_engine = SelectionEngine(self.config)
        
        # 진화 상태
        self.pipelines: Dict[str, List[Generation]] = {}
        self.current_generation: Dict[str, int] = {}
        self.evolution_history: Dict[str, List[Dict[str, Any]]] = {}
        self.best_candidates: Dict[str, PipelineCandidate] = {}
        
        # 동시성 제어
        self.evolution_locks: Dict[str, asyncio.Lock] = {}
        self.executor = ThreadPoolExecutor(max_workers=self.config.max_parallel_workers)
        
        # 성능 추적
        self.metrics_history: Dict[str, List[PerformanceMetrics]] = defaultdict(list)
        self.convergence_tracker: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10))
        
        logger.info("Evolutionary Pipeline Manager initialized")
    
    async def evolve_pipeline(self, pipeline_id: str, 
                            performance_data: PerformanceMetrics = None,
                            test_data: Any = None) -> Generation:
        """파이프라인 진화"""
        if pipeline_id not in self.evolution_locks:
            self.evolution_locks[pipeline_id] = asyncio.Lock()
        
        async with self.evolution_locks[pipeline_id]:
            return await self._evolve_pipeline_internal(pipeline_id, performance_data, test_data)
    
    async def _evolve_pipeline_internal(self, pipeline_id: str, 
                                      performance_data: PerformanceMetrics,
                                      test_data: Any) -> Generation:
        """내부 진화 로직"""
        logger.info(f"Starting evolution for pipeline {pipeline_id}")
        
        # 초기화 또는 기존 세대 로드
        if pipeline_id not in self.pipelines:
            await self._initialize_pipeline(pipeline_id)
        
        current_gen_num = self.current_generation[pipeline_id]
        current_population = self.pipelines[pipeline_id][-1].candidates
        
        # 현재 세대 평가
        if self.config.parallel_evaluation:
            await self._evaluate_population_parallel(current_population, test_data)
        else:
            await self._evaluate_population_sequential(current_population, test_data)
        
        # 수렴 조건 확인
        if await self._check_convergence(pipeline_id):
            logger.info(f"Pipeline {pipeline_id} has converged")
            return self.pipelines[pipeline_id][-1]
        
        # 새로운 세대 생성
        next_generation = await self._create_next_generation(current_population, current_gen_num + 1)
        
        # 세대 추가
        self.pipelines[pipeline_id].append(next_generation)
        self.current_generation[pipeline_id] = current_gen_num + 1
        
        # 최고 후보 업데이트
        self._update_best_candidate(pipeline_id, next_generation)
        
        # 진화 히스토리 업데이트
        await self._update_evolution_history(pipeline_id, next_generation)
        
        logger.info(f"Generation {current_gen_num + 1} created for pipeline {pipeline_id}")
        return next_generation
    
    async def _initialize_pipeline(self, pipeline_id: str):
        """파이프라인 초기화"""
        logger.info(f"Initializing pipeline {pipeline_id}")
        
        # 초기 개체군 생성
        initial_population = []
        for i in range(self.config.population_size):
            candidate = self._create_random_candidate(0)
            initial_population.append(candidate)
        
        # 초기 세대 생성
        initial_generation = Generation(
            generation_id=0,
            candidates=initial_population,
            creation_time=datetime.now()
        )
        
        self.pipelines[pipeline_id] = [initial_generation]
        self.current_generation[pipeline_id] = 0
        self.evolution_history[pipeline_id] = []
    
    def _create_random_candidate(self, generation: int) -> PipelineCandidate:
        """랜덤 후보 생성"""
        # 랜덤 유전자 생성
        genes = PipelineGenes(
            structure={
                'nodes': [
                    {
                        'id': str(uuid.uuid4()),
                        'type': random.choice(['processor', 'filter', 'transformer']),
                        'config': {}
                    }
                    for _ in range(random.randint(1, 5))
                ]
            },
            parameters={
                'base_execution_time': random.uniform(0.1, 2.0),
                'memory_limit': random.uniform(100, 1000),
                'cpu_threshold': random.uniform(0.1, 1.0),
                'batch_size': random.randint(10, 100),
                'timeout': random.uniform(5, 30)
            },
            operators=[
                random.choice(['map', 'filter', 'reduce', 'transform'])
                for _ in range(random.randint(1, 3))
            ],
            connections=[
                (f"node_{i}", f"node_{i+1}")
                for i in range(random.randint(0, 3))
            ]
        )
        
        return PipelineCandidate(
            id=str(uuid.uuid4()),
            genes=genes,
            generation=generation
        )
    
    async def _evaluate_population_parallel(self, population: List[PipelineCandidate], 
                                          test_data: Any):
        """병렬 개체군 평가"""
        semaphore = asyncio.Semaphore(self.config.max_parallel_workers)
        
        async def evaluate_with_semaphore(candidate):
            async with semaphore:
                return await self.fitness_evaluator.evaluate_candidate(candidate, test_data)
        
        tasks = [evaluate_with_semaphore(candidate) for candidate in population 
                if candidate.fitness is None]
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _evaluate_population_sequential(self, population: List[PipelineCandidate], 
                                            test_data: Any):
        """순차 개체군 평가"""
        for candidate in population:
            if candidate.fitness is None:
                await self.fitness_evaluator.evaluate_candidate(candidate, test_data)
    
    async def _check_convergence(self, pipeline_id: str) -> bool:
        """수렴 조건 확인"""
        if len(self.pipelines[pipeline_id]) < 5:  # 최소 5세대
            return False
        
        recent_generations = self.pipelines[pipeline_id][-5:]
        best_scores = [
            max(gen.candidates, key=lambda x: x.fitness.weighted_score if x.fitness else 0).fitness.weighted_score
            for gen in recent_generations
            if gen.candidates and all(c.fitness for c in gen.candidates)
        ]
        
        if len(best_scores) < 5:
            return False
        
        # 점수 변화량 확인
        score_variance = np.var(best_scores)
        return score_variance < self.config.convergence_threshold
    
    async def _create_next_generation(self, current_population: List[PipelineCandidate], 
                                    generation_num: int) -> Generation:
        """다음 세대 생성"""
        next_population = []
        
        # 엘리트 보존
        elite_count = int(self.config.population_size * self.config.elitism_rate)
        elites = self.selection_engine.select_parents(current_population, elite_count)
        next_population.extend(elites)
        
        # 교차 및 돌연변이
        remaining_count = self.config.population_size - elite_count
        
        while len(next_population) < self.config.population_size:
            # 부모 선택
            parents = self.selection_engine.select_parents(current_population, 2)
            
            if len(parents) >= 2:
                # 교차
                child1, child2 = self.crossover_engine.crossover(parents[0], parents[1])
                
                # 돌연변이
                child1 = self.mutation_engine.mutate(child1)
                child2 = self.mutation_engine.mutate(child2)
                
                # 세대 번호 설정
                child1.generation = generation_num
                child2.generation = generation_num
                
                next_population.extend([child1, child2])
        
        # 개체군 크기 조정
        next_population = next_population[:self.config.population_size]
        
        # 다양성 계산
        diversity_index = self._calculate_population_diversity(next_population)
        
        # 평균 적합도 계산 (평가 후)
        avg_fitness = 0.0
        if all(c.fitness for c in current_population):
            avg_fitness = np.mean([c.fitness.weighted_score for c in current_population])
        
        generation = Generation(
            generation_id=generation_num,
            candidates=next_population,
            average_fitness=avg_fitness,
            diversity_index=diversity_index,
            evolution_stats={
                'elite_count': elite_count,
                'mutation_rate': self.config.mutation_rate,
                'crossover_rate': self.config.crossover_rate
            }
        )
        
        return generation
    
    def _calculate_population_diversity(self, population: List[PipelineCandidate]) -> float:
        """개체군 다양성 계산"""
        if len(population) < 2:
            return 0.0
        
        total_distance = 0.0
        comparisons = 0
        
        for i in range(len(population)):
            for j in range(i + 1, len(population)):
                distance = self.selection_engine._calculate_genetic_distance(
                    population[i], population[j]
                )
                total_distance += distance
                comparisons += 1
        
        return total_distance / comparisons if comparisons > 0 else 0.0
    
    def _update_best_candidate(self, pipeline_id: str, generation: Generation):
        """최고 후보 업데이트"""
        if not generation.candidates:
            return
        
        current_best = max(
            generation.candidates,
            key=lambda x: x.fitness.weighted_score if x.fitness else 0
        )
        
        generation.best_candidate = current_best
        
        if (pipeline_id not in self.best_candidates or
            (current_best.fitness and 
             (not self.best_candidates[pipeline_id].fitness or
              current_best.fitness.weighted_score > self.best_candidates[pipeline_id].fitness.weighted_score))):
            self.best_candidates[pipeline_id] = current_best
    
    async def _update_evolution_history(self, pipeline_id: str, generation: Generation):
        """진화 히스토리 업데이트"""
        history_entry = {
            'generation_id': generation.generation_id,
            'timestamp': generation.creation_time.isoformat(),
            'population_size': len(generation.candidates),
            'average_fitness': generation.average_fitness,
            'diversity_index': generation.diversity_index,
            'best_fitness': generation.best_candidate.fitness.weighted_score if generation.best_candidate and generation.best_candidate.fitness else 0,
            'evolution_stats': generation.evolution_stats
        }
        
        self.evolution_history[pipeline_id].append(history_entry)
    
    def get_best_candidate(self, pipeline_id: str) -> Optional[PipelineCandidate]:
        """최고 후보 반환"""
        return self.best_candidates.get(pipeline_id)
    
    def get_evolution_history(self, pipeline_id: str) -> List[Dict[str, Any]]:
        """진화 히스토리 반환"""
        return self.evolution_history.get(pipeline_id, [])
    
    def get_current_generation(self, pipeline_id: str) -> Optional[Generation]:
        """현재 세대 반환"""
        if pipeline_id in self.pipelines and self.pipelines[pipeline_id]:
            return self.pipelines[pipeline_id][-1]
        return None
    
    async def rollback_to_generation(self, pipeline_id: str, generation_id: int) -> bool:
        """특정 세대로 롤백"""
        if pipeline_id not in self.pipelines:
            return False
        
        # 해당 세대 찾기
        target_generation = None
        for i, generation in enumerate(self.pipelines[pipeline_id]):
            if generation.generation_id == generation_id:
                target_generation = generation
                # 이후 세대들 제거
                self.pipelines[pipeline_id] = self.pipelines[pipeline_id][:i+1]
                self.current_generation[pipeline_id] = generation_id
                break
        
        if target_generation:
            # 최고 후보 업데이트
            self._update_best_candidate(pipeline_id, target_generation)
            logger.info(f"Rolled back pipeline {pipeline_id} to generation {generation_id}")
            return True
        
        return False
    
    def export_pipeline_state(self, pipeline_id: str, filepath: Path) -> bool:
        """파이프라인 상태 내보내기"""
        try:
            state = {
                'pipeline_id': pipeline_id,
                'config': asdict(self.config),
                'generations': [asdict(gen) for gen in self.pipelines.get(pipeline_id, [])],
                'current_generation': self.current_generation.get(pipeline_id, 0),
                'evolution_history': self.evolution_history.get(pipeline_id, []),
                'best_candidate': asdict(self.best_candidates[pipeline_id]) if pipeline_id in self.best_candidates else None,
                'export_time': datetime.now().isoformat()
            }
            
            with open(filepath, 'w') as f:
                json.dump(state, f, indent=2, default=str)
            
            logger.info(f"Pipeline state exported to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to export pipeline state: {e}")
            return False
    
    def import_pipeline_state(self, filepath: Path) -> Optional[str]:
        """파이프라인 상태 가져오기"""
        try:
            with open(filepath, 'r') as f:
                state = json.load(f)
            
            pipeline_id = state['pipeline_id']
            
            # 설정 복원
            self.config = EvolutionConfig(**state['config'])
            
            # 세대들 복원 (간단화된 버전)
            self.pipelines[pipeline_id] = []
            self.current_generation[pipeline_id] = state['current_generation']
            self.evolution_history[pipeline_id] = state['evolution_history']
            
            logger.info(f"Pipeline state imported from {filepath}")
            return pipeline_id
            
        except Exception as e:
            logger.error(f"Failed to import pipeline state: {e}")
            return None
    
    async def optimize_multi_objective(self, pipeline_id: str, 
                                     objectives: Dict[OptimizationObjective, float],
                                     test_data: Any = None) -> List[PipelineCandidate]:
        """다목적 최적화"""
        # 목적 함수 가중치 업데이트
        self.config.optimization_objectives = objectives
        self.fitness_evaluator = FitnessEvaluator(self.config)
        
        # 여러 세대 진화
        for _ in range(self.config.max_generations):
            generation = await self.evolve_pipeline(pipeline_id, test_data=test_data)
            
            if await self._check_convergence(pipeline_id):
                break
        
        # 파레토 최적 해집합 반환
        current_population = self.get_current_generation(pipeline_id).candidates
        return self._find_pareto_optimal_solutions(current_population)
    
    def _find_pareto_optimal_solutions(self, population: List[PipelineCandidate]) -> List[PipelineCandidate]:
        """파레토 최적 해집합 찾기"""
        pareto_optimal = []
        
        for candidate in population:
            if not candidate.fitness:
                continue
            
            is_dominated = False
            for other in population:
                if not other.fitness or candidate == other:
                    continue
                
                if self._dominates(other, candidate):
                    is_dominated = True
                    break
            
            if not is_dominated:
                pareto_optimal.append(candidate)
        
        return pareto_optimal
    
    def _dominates(self, candidate1: PipelineCandidate, candidate2: PipelineCandidate) -> bool:
        """지배 관계 확인"""
        if not candidate1.fitness or not candidate2.fitness:
            return False
        
        scores1 = candidate1.fitness.objective_scores
        scores2 = candidate2.fitness.objective_scores
        
        better_in_any = False
        for objective in scores1:
            if objective in scores2:
                if scores1[objective] > scores2[objective]:
                    better_in_any = True
                elif scores1[objective] < scores2[objective]:
                    return False
        
        return better_in_any
    
    def generate_evolution_report(self, pipeline_id: str) -> Dict[str, Any]:
        """진화 보고서 생성"""
        if pipeline_id not in self.pipelines:
            return {'error': 'Pipeline not found'}
        
        generations = self.pipelines[pipeline_id]
        history = self.evolution_history[pipeline_id]
        best_candidate = self.best_candidates.get(pipeline_id)
        
        report = {
            'pipeline_id': pipeline_id,
            'total_generations': len(generations),
            'current_generation': self.current_generation.get(pipeline_id, 0),
            'convergence_achieved': len(history) > 0 and self._check_convergence_from_history(history),
            'best_fitness': best_candidate.fitness.weighted_score if best_candidate and best_candidate.fitness else 0,
            'evolution_timeline': history,
            'diversity_trend': [entry.get('diversity_index', 0) for entry in history],
            'fitness_trend': [entry.get('best_fitness', 0) for entry in history],
            'recommendations': self._generate_evolution_recommendations(pipeline_id)
        }
        
        return report
    
    def _check_convergence_from_history(self, history: List[Dict[str, Any]]) -> bool:
        """히스토리에서 수렴 여부 확인"""
        if len(history) < 5:
            return False
        
        recent_fitness = [entry.get('best_fitness', 0) for entry in history[-5:]]
        return np.var(recent_fitness) < self.config.convergence_threshold
    
    def _generate_evolution_recommendations(self, pipeline_id: str) -> List[str]:
        """진화 개선 권장사항 생성"""
        recommendations = []
        
        if pipeline_id not in self.evolution_history:
            return recommendations
        
        history = self.evolution_history[pipeline_id]
        if not history:
            return recommendations
        
        # 다양성 분석
        recent_diversity = [entry.get('diversity_index', 0) for entry in history[-5:]]
        if all(d < 0.1 for d in recent_diversity):
            recommendations.append("낮은 다양성 감지: 돌연변이율 증가 권장")
        
        # 적합도 개선 분석
        fitness_trend = [entry.get('best_fitness', 0) for entry in history[-10:]]
        if len(fitness_trend) > 5:
            recent_improvement = fitness_trend[-1] - fitness_trend[-5]
            if recent_improvement < 0.01:
                recommendations.append("적합도 개선 정체: 교차율 조정 또는 새로운 돌연변이 전략 시도 권장")
        
        # 수렴 분석
        if self._check_convergence_from_history(history):
            recommendations.append("수렴 달성: 현재 설정이 효과적임")
        elif len(history) > 20:
            recommendations.append("장기간 진화: 목적 함수 재검토 또는 제약 조건 완화 고려")
        
        return recommendations
    
    async def cleanup(self):
        """리소스 정리"""
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=True)
        
        logger.info("Evolutionary Pipeline Manager cleaned up")


# 사용 예제 및 테스트
async def example_usage():
    """사용 예제"""
    
    # 설정 생성
    config = EvolutionConfig(
        population_size=20,
        max_generations=50,
        mutation_rate=0.15,
        crossover_rate=0.8,
        optimization_objectives={
            OptimizationObjective.PERFORMANCE: 0.6,
            OptimizationObjective.COST: 0.3,
            OptimizationObjective.RELIABILITY: 0.1
        }
    )
    
    # 매니저 생성
    manager = EvolutionaryPipelineManager(config)
    
    # 테스트 데이터
    test_data = {'input': list(range(1000))}
    
    try:
        # 파이프라인 진화
        pipeline_id = 'test_pipeline_001'
        
        print(f"Starting evolution for pipeline: {pipeline_id}")
        
        # 여러 세대 진화
        for generation in range(5):
            result = await manager.evolve_pipeline(pipeline_id, test_data=test_data)
            
            best = result.best_candidate
            print(f"Generation {generation}: Best fitness = {best.fitness.weighted_score if best and best.fitness else 'N/A'}")
        
        # 최고 후보 확인
        best_candidate = manager.get_best_candidate(pipeline_id)
        if best_candidate:
            print(f"\nBest candidate: {best_candidate.id}")
            print(f"Fitness: {best_candidate.fitness.weighted_score}")
            print(f"Genes: {best_candidate.genes.parameters}")
        
        # 진화 보고서 생성
        report = manager.generate_evolution_report(pipeline_id)
        print(f"\nEvolution Report:")
        print(f"Total generations: {report['total_generations']}")
        print(f"Best fitness: {report['best_fitness']}")
        print(f"Recommendations: {report['recommendations']}")
        
        # 다목적 최적화 예제
        print("\n--- Multi-objective Optimization ---")
        pareto_solutions = await manager.optimize_multi_objective(
            pipeline_id,
            {
                OptimizationObjective.PERFORMANCE: 0.5,
                OptimizationObjective.COST: 0.3,
                OptimizationObjective.RELIABILITY: 0.2
            },
            test_data
        )
        
        print(f"Found {len(pareto_solutions)} Pareto optimal solutions")
        
    finally:
        await manager.cleanup()


if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 예제 실행
    asyncio.run(example_usage())
        