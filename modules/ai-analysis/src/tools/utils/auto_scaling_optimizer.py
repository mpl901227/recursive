#!/usr/bin/env python3
"""
Advanced Auto Scaling Optimizer
자가 발전형 LLM 연동 IDE를 위한 지능형 자동 스케일링 최적화기

주요 기능:
- 멀티소스 로그 기반 로드 예측
- AI 기반 스케일링 전략 최적화
- 실시간 비용 효율성 분석
- 진화형 알고리즘을 통한 전략 개선
- LLM 연동 의사결정 지원
- 자가 학습 및 적응형 최적화
"""

import asyncio
import logging
import time
import math
import statistics
from datetime import datetime, timedelta
from typing import (
    Dict, List, Optional, Union, Tuple, Any, Callable,
    NamedTuple, Protocol, TypeVar, Generic
)
from dataclasses import dataclass, field
from enum import Enum, auto
from collections import defaultdict, deque
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import json
import pickle
from pathlib import Path
import threading
from contextlib import asynccontextmanager
import weakref
import uuid

# 타입 정의
T = TypeVar('T')
MetricValue = Union[int, float]

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class ScalingDirection(Enum):
    UP = "scale_up"
    DOWN = "scale_down"
    MAINTAIN = "maintain"


class ResourceType(Enum):
    CPU = "cpu"
    MEMORY = "memory"
    STORAGE = "storage"
    NETWORK = "network"
    GPU = "gpu"
    CUSTOM = "custom"


class ScalingStrategy(Enum):
    REACTIVE = "reactive"
    PREDICTIVE = "predictive"
    HYBRID = "hybrid"
    AI_OPTIMIZED = "ai_optimized"


class EnvironmentType(Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


class CloudProvider(Enum):
    AWS = "aws"
    GCP = "gcp"
    AZURE = "azure"
    KUBERNETES = "kubernetes"
    DOCKER = "docker"
    ON_PREMISE = "on_premise"


# 예외 클래스
class ScalingError(Exception):
    """스케일링 관련 기본 예외"""
    pass


class InvalidScalingStrategy(ScalingError):
    """잘못된 스케일링 전략"""
    pass


class ResourceLimitExceeded(ScalingError):
    """리소스 한계 초과"""
    pass


class PredictionError(ScalingError):
    """예측 오류"""
    pass


# 데이터 클래스들
@dataclass
class MetricPoint:
    """메트릭 데이터 포인트"""
    timestamp: datetime
    value: MetricValue
    resource_type: ResourceType
    instance_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LoadPattern:
    """로드 패턴 정보"""
    pattern_id: str
    name: str
    description: str
    time_range: Tuple[datetime, datetime]
    metrics: List[MetricPoint]
    seasonality: Dict[str, Any] = field(default_factory=dict)
    trend: Dict[str, Any] = field(default_factory=dict)
    confidence_score: float = 0.0


@dataclass
class ScalingRule:
    """스케일링 규칙"""
    rule_id: str
    resource_type: ResourceType
    threshold_up: float
    threshold_down: float
    scale_up_amount: int
    scale_down_amount: int
    cooldown_period: int  # seconds
    conditions: List[str] = field(default_factory=list)
    priority: int = 1
    enabled: bool = True


@dataclass
class ScalingAction:
    """스케일링 액션"""
    action_id: str
    timestamp: datetime
    direction: ScalingDirection
    resource_type: ResourceType
    current_capacity: int
    target_capacity: int
    reason: str
    confidence: float
    estimated_cost: float
    estimated_duration: int  # seconds
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ResourceInstance:
    """리소스 인스턴스 정보"""
    instance_id: str
    instance_type: str
    cloud_provider: CloudProvider
    specs: Dict[str, Any]
    current_utilization: Dict[ResourceType, float]
    cost_per_hour: float
    status: str = "running"
    created_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScalingConfiguration:
    """스케일링 설정"""
    min_instances: int = 1
    max_instances: int = 100
    target_utilization: Dict[ResourceType, float] = field(default_factory=dict)
    scaling_policies: List[ScalingRule] = field(default_factory=list)
    prediction_window: int = 3600  # seconds
    evaluation_interval: int = 60  # seconds
    cost_optimization: bool = True
    performance_weight: float = 0.7
    cost_weight: float = 0.3
    enable_ai_optimization: bool = True


@dataclass
class LoadPrediction:
    """로드 예측 결과"""
    prediction_id: str
    target_time: datetime
    predicted_metrics: Dict[ResourceType, List[MetricPoint]]
    confidence_intervals: Dict[ResourceType, Tuple[float, float]]
    model_accuracy: float
    prediction_horizon: int  # seconds
    created_at: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CostAnalysis:
    """비용 분석 결과"""
    analysis_id: str
    time_period: Tuple[datetime, datetime]
    total_cost: float
    cost_breakdown: Dict[str, float]
    cost_per_instance: Dict[str, float]
    optimization_opportunities: List[str]
    potential_savings: float
    efficiency_score: float
    recommendations: List[str] = field(default_factory=list)


@dataclass
class ScalingEvolutionGeneration:
    """스케일링 전략 진화 세대"""
    generation_id: str
    strategies: List[Dict[str, Any]]
    fitness_scores: List[float]
    best_strategy: Dict[str, Any]
    performance_metrics: Dict[str, float]
    cost_metrics: Dict[str, float]
    created_at: datetime = field(default_factory=datetime.now)


class LoadPredictor:
    """로드 예측기"""
    
    def __init__(self):
        self.models = {}
        self.training_data = defaultdict(list)
        self.prediction_cache = {}
        self.accuracy_history = defaultdict(list)
        
    def add_training_data(self, resource_type: ResourceType, metrics: List[MetricPoint]):
        """훈련 데이터 추가"""
        self.training_data[resource_type].extend(metrics)
        
        # 데이터 크기 제한 (메모리 관리)
        max_points = 10000
        if len(self.training_data[resource_type]) > max_points:
            self.training_data[resource_type] = self.training_data[resource_type][-max_points:]
    
    def train_model(self, resource_type: ResourceType) -> bool:
        """모델 훈련"""
        try:
            data = self.training_data[resource_type]
            if len(data) < 100:  # 최소 데이터 요구량
                logger.warning(f"Insufficient data for {resource_type} prediction model")
                return False
            
            # 시계열 데이터 전처리
            values = [point.value for point in data]
            timestamps = [point.timestamp for point in data]
            
            # 간단한 시계열 모델 (실제로는 더 복잡한 ML 모델 사용)
            model = self._create_time_series_model(values, timestamps)
            self.models[resource_type] = model
            
            logger.info(f"Trained prediction model for {resource_type}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to train model for {resource_type}: {e}")
            return False
    
    def predict_load(self, resource_type: ResourceType, 
                    prediction_horizon: int) -> Optional[LoadPrediction]:
        """로드 예측"""
        try:
            if resource_type not in self.models:
                if not self.train_model(resource_type):
                    return None
            
            model = self.models[resource_type]
            target_time = datetime.now() + timedelta(seconds=prediction_horizon)
            
            # 예측 실행
            predicted_values = self._predict_with_model(model, prediction_horizon)
            
            # 신뢰구간 계산
            confidence_interval = self._calculate_confidence_interval(
                predicted_values, self.accuracy_history[resource_type]
            )
            
            # 예측 메트릭 생성
            predicted_metrics = []
            current_time = datetime.now()
            for i, value in enumerate(predicted_values):
                predicted_metrics.append(MetricPoint(
                    timestamp=current_time + timedelta(seconds=i * 60),
                    value=value,
                    resource_type=resource_type,
                    instance_id="predicted"
                ))
            
            prediction = LoadPrediction(
                prediction_id=str(uuid.uuid4()),
                target_time=target_time,
                predicted_metrics={resource_type: predicted_metrics},
                confidence_intervals={resource_type: confidence_interval},
                model_accuracy=self._get_model_accuracy(resource_type),
                prediction_horizon=prediction_horizon
            )
            
            # 캐시에 저장
            cache_key = f"{resource_type}_{prediction_horizon}"
            self.prediction_cache[cache_key] = prediction
            
            return prediction
            
        except Exception as e:
            logger.error(f"Failed to predict load for {resource_type}: {e}")
            return None
    
    def _create_time_series_model(self, values: List[float], timestamps: List[datetime]) -> Dict[str, Any]:
        """시계열 모델 생성"""
        # 간단한 이동 평균 기반 모델 (실제로는 ARIMA, LSTM 등 사용)
        if len(values) < 10:
            return {"type": "simple_average", "average": statistics.mean(values)}
        
        # 트렌드 계산
        x = list(range(len(values)))
        trend = np.polyfit(x, values, 1)[0]
        
        # 계절성 패턴 추출 (일주일 단위)
        seasonality = {}
        if len(values) >= 168:  # 1주일치 시간 데이터
            for hour in range(24):
                hour_values = [values[i] for i in range(hour, len(values), 24) if i < len(values)]
                if hour_values:
                    seasonality[hour] = statistics.mean(hour_values)
        
        return {
            "type": "trend_seasonal",
            "trend": trend,
            "seasonality": seasonality,
            "recent_average": statistics.mean(values[-24:]),  # 최근 24시간 평균
            "volatility": statistics.stdev(values) if len(values) > 1 else 0
        }
    
    def _predict_with_model(self, model: Dict[str, Any], horizon: int) -> List[float]:
        """모델을 사용한 예측"""
        predictions = []
        base_value = model.get("recent_average", 0)
        trend = model.get("trend", 0)
        seasonality = model.get("seasonality", {})
        volatility = model.get("volatility", 0)
        
        current_time = datetime.now()
        
        for i in range(horizon // 60):  # 분 단위 예측
            future_time = current_time + timedelta(minutes=i)
            hour = future_time.hour
            
            # 기본값 + 트렌드 + 계절성
            predicted_value = base_value + (trend * i)
            
            if str(hour) in seasonality:
                seasonal_factor = seasonality[str(hour)] / base_value if base_value > 0 else 1
                predicted_value *= seasonal_factor
            
            # 약간의 노이즈 추가 (실제 변동성 반영)
            noise = np.random.normal(0, volatility * 0.1)
            predicted_value = max(0, predicted_value + noise)
            
            predictions.append(predicted_value)
        
        return predictions
    
    def _calculate_confidence_interval(self, predictions: List[float], 
                                     accuracy_history: List[float]) -> Tuple[float, float]:
        """신뢰구간 계산"""
        if not accuracy_history:
            # 기본 신뢰구간 (±20%)
            avg_pred = statistics.mean(predictions) if predictions else 0
            return (avg_pred * 0.8, avg_pred * 1.2)
        
        avg_accuracy = statistics.mean(accuracy_history)
        std_accuracy = statistics.stdev(accuracy_history) if len(accuracy_history) > 1 else 0.1
        
        # 95% 신뢰구간
        margin_of_error = 1.96 * std_accuracy
        avg_pred = statistics.mean(predictions) if predictions else 0
        
        lower_bound = avg_pred * (avg_accuracy - margin_of_error)
        upper_bound = avg_pred * (avg_accuracy + margin_of_error)
        
        return (max(0, lower_bound), upper_bound)
    
    def _get_model_accuracy(self, resource_type: ResourceType) -> float:
        """모델 정확도 반환"""
        if resource_type not in self.accuracy_history:
            return 0.7  # 기본 정확도
        
        recent_accuracy = self.accuracy_history[resource_type][-10:]  # 최근 10개
        return statistics.mean(recent_accuracy) if recent_accuracy else 0.7
    
    def update_accuracy(self, resource_type: ResourceType, 
                       predicted_value: float, actual_value: float):
        """예측 정확도 업데이트"""
        if actual_value == 0:
            accuracy = 0.0
        else:
            error_rate = abs(predicted_value - actual_value) / actual_value
            accuracy = max(0, 1 - error_rate)
        
        self.accuracy_history[resource_type].append(accuracy)
        
        # 히스토리 크기 제한
        if len(self.accuracy_history[resource_type]) > 100:
            self.accuracy_history[resource_type] = self.accuracy_history[resource_type][-100:]


class CostOptimizer:
    """비용 최적화기"""
    
    def __init__(self):
        self.cost_models = {}
        self.optimization_history = []
        self.savings_tracker = defaultdict(float)
        
    def analyze_cost_efficiency(self, instances: List[ResourceInstance], 
                               time_period: Tuple[datetime, datetime]) -> CostAnalysis:
        """비용 효율성 분석"""
        try:
            analysis_id = str(uuid.uuid4())
            total_cost = 0
            cost_breakdown = {}
            cost_per_instance = {}
            
            # 시간 계산
            duration_hours = (time_period[1] - time_period[0]).total_seconds() / 3600
            
            for instance in instances:
                instance_cost = instance.cost_per_hour * duration_hours
                total_cost += instance_cost
                cost_per_instance[instance.instance_id] = instance_cost
                
                # 인스턴스 타입별 비용 분석
                if instance.instance_type not in cost_breakdown:
                    cost_breakdown[instance.instance_type] = 0
                cost_breakdown[instance.instance_type] += instance_cost
            
            # 최적화 기회 식별
            optimization_opportunities = self._identify_optimization_opportunities(instances)
            
            # 잠재적 절약 계산
            potential_savings = self._calculate_potential_savings(instances, optimization_opportunities)
            
            # 효율성 점수 계산
            efficiency_score = self._calculate_efficiency_score(instances)
            
            # 권장사항 생성
            recommendations = self._generate_cost_recommendations(instances, optimization_opportunities)
            
            return CostAnalysis(
                analysis_id=analysis_id,
                time_period=time_period,
                total_cost=total_cost,
                cost_breakdown=cost_breakdown,
                cost_per_instance=cost_per_instance,
                optimization_opportunities=optimization_opportunities,
                potential_savings=potential_savings,
                efficiency_score=efficiency_score,
                recommendations=recommendations
            )
            
        except Exception as e:
            logger.error(f"Failed to analyze cost efficiency: {e}")
            raise PredictionError(f"Cost analysis failed: {e}")
    
    def _identify_optimization_opportunities(self, instances: List[ResourceInstance]) -> List[str]:
        """최적화 기회 식별"""
        opportunities = []
        
        for instance in instances:
            # CPU 사용률이 낮은 인스턴스
            cpu_util = instance.current_utilization.get(ResourceType.CPU, 0)
            if cpu_util < 20:
                opportunities.append(f"Low CPU utilization on {instance.instance_id}: {cpu_util}%")
            
            # 메모리 사용률이 낮은 인스턴스
            memory_util = instance.current_utilization.get(ResourceType.MEMORY, 0)
            if memory_util < 30:
                opportunities.append(f"Low memory utilization on {instance.instance_id}: {memory_util}%")
            
            # 과도한 인스턴스 타입 사용
            if cpu_util < 50 and memory_util < 50:
                opportunities.append(f"Consider downsizing {instance.instance_id}")
        
        # 중복된 기회 제거
        return list(set(opportunities))
    
    def _calculate_potential_savings(self, instances: List[ResourceInstance], 
                                   opportunities: List[str]) -> float:
        """잠재적 절약 계산"""
        total_savings = 0
        
        for instance in instances:
            cpu_util = instance.current_utilization.get(ResourceType.CPU, 0)
            memory_util = instance.current_utilization.get(ResourceType.MEMORY, 0)
            
            # 다운사이징 가능한 경우
            if cpu_util < 50 and memory_util < 50:
                # 30% 비용 절약 가능하다고 가정
                total_savings += instance.cost_per_hour * 24 * 30 * 0.3  # 월간 절약
        
        return total_savings
    
    def _calculate_efficiency_score(self, instances: List[ResourceInstance]) -> float:
        """효율성 점수 계산 (0-1)"""
        if not instances:
            return 0.0
        
        total_efficiency = 0
        
        for instance in instances:
            cpu_util = instance.current_utilization.get(ResourceType.CPU, 0) / 100
            memory_util = instance.current_utilization.get(ResourceType.MEMORY, 0) / 100
            
            # 이상적인 사용률을 70%로 가정
            target_util = 0.7
            cpu_efficiency = 1 - abs(cpu_util - target_util)
            memory_efficiency = 1 - abs(memory_util - target_util)
            
            instance_efficiency = (cpu_efficiency + memory_efficiency) / 2
            total_efficiency += max(0, instance_efficiency)
        
        return total_efficiency / len(instances)
    
    def _generate_cost_recommendations(self, instances: List[ResourceInstance], 
                                     opportunities: List[str]) -> List[str]:
        """비용 최적화 권장사항 생성"""
        recommendations = []
        
        # 일반적인 권장사항
        if len(opportunities) > 0:
            recommendations.append("Consider implementing auto-scaling to optimize resource usage")
        
        # 인스턴스별 권장사항
        underutilized_count = 0
        for instance in instances:
            cpu_util = instance.current_utilization.get(ResourceType.CPU, 0)
            if cpu_util < 30:
                underutilized_count += 1
        
        if underutilized_count > len(instances) * 0.3:
            recommendations.append("Consider consolidating workloads to reduce the number of instances")
        
        # 스케줄링 권장사항
        recommendations.append("Consider using spot instances for non-critical workloads")
        recommendations.append("Implement scheduled scaling for predictable load patterns")
        
        return recommendations


class EvolutionaryScalingOptimizer:
    """진화형 스케일링 최적화기"""
    
    def __init__(self, population_size: int = 20, mutation_rate: float = 0.1):
        self.population_size = population_size
        self.mutation_rate = mutation_rate
        self.generations = []
        self.best_strategies = []
        self.fitness_history = []
        
    def evolve_scaling_strategy(self, 
                              current_strategy: Dict[str, Any],
                              performance_metrics: Dict[str, float],
                              cost_metrics: Dict[str, float]) -> Dict[str, Any]:
        """스케일링 전략 진화"""
        try:
            # 현재 세대 생성
            if not self.generations:
                population = self._create_initial_population(current_strategy)
            else:
                population = self._create_next_generation()
            
            # 적합도 평가
            fitness_scores = []
            for strategy in population:
                fitness = self._evaluate_fitness(strategy, performance_metrics, cost_metrics)
                fitness_scores.append(fitness)
            
            # 최고 전략 선택
            best_index = fitness_scores.index(max(fitness_scores))
            best_strategy = population[best_index]
            
            # 세대 정보 저장
            generation = ScalingEvolutionGeneration(
                generation_id=str(uuid.uuid4()),
                strategies=population,
                fitness_scores=fitness_scores,
                best_strategy=best_strategy,
                performance_metrics=performance_metrics,
                cost_metrics=cost_metrics
            )
            
            self.generations.append(generation)
            self.best_strategies.append(best_strategy)
            self.fitness_history.append(max(fitness_scores))
            
            logger.info(f"Evolution generation {len(self.generations)} completed. "
                       f"Best fitness: {max(fitness_scores):.3f}")
            
            return best_strategy
            
        except Exception as e:
            logger.error(f"Failed to evolve scaling strategy: {e}")
            return current_strategy
    
    def _create_initial_population(self, base_strategy: Dict[str, Any]) -> List[Dict[str, Any]]:
        """초기 개체군 생성"""
        population = [base_strategy.copy()]  # 기본 전략 포함
        
        for _ in range(self.population_size - 1):
            mutated_strategy = self._mutate_strategy(base_strategy)
            population.append(mutated_strategy)
        
        return population
    
    def _create_next_generation(self) -> List[Dict[str, Any]]:
        """다음 세대 생성"""
        if not self.generations:
            raise ValueError("No previous generation found")
        
        current_gen = self.generations[-1]
        population = []
        
        # 엘리트 보존 (상위 20%)
        elite_count = max(1, self.population_size // 5)
        elite_indices = sorted(range(len(current_gen.fitness_scores)), 
                             key=lambda i: current_gen.fitness_scores[i], reverse=True)[:elite_count]
        
        for i in elite_indices:
            population.append(current_gen.strategies[i].copy())
        
        # 교배 및 돌연변이로 나머지 생성
        while len(population) < self.population_size:
            parent1 = self._select_parent(current_gen)
            parent2 = self._select_parent(current_gen)
            
            child = self._crossover(parent1, parent2)
            child = self._mutate_strategy(child)
            
            population.append(child)
        
        return population
    
    def _select_parent(self, generation: ScalingEvolutionGeneration) -> Dict[str, Any]:
        """부모 선택 (토너먼트 선택)"""
        tournament_size = 3
        candidates = np.random.choice(len(generation.strategies), tournament_size, replace=False)
        
        best_candidate = candidates[0]
        for candidate in candidates[1:]:
            if generation.fitness_scores[candidate] > generation.fitness_scores[best_candidate]:
                best_candidate = candidate
        
        return generation.strategies[best_candidate].copy()
    
    def _crossover(self, parent1: Dict[str, Any], parent2: Dict[str, Any]) -> Dict[str, Any]:
        """교배 연산"""
        child = {}
        
        for key in parent1.keys():
            if key in parent2:
                # 50% 확률로 각 부모의 유전자 선택
                if np.random.random() < 0.5:
                    child[key] = parent1[key]
                else:
                    child[key] = parent2[key]
            else:
                child[key] = parent1[key]
        
        return child
    
    def _mutate_strategy(self, strategy: Dict[str, Any]) -> Dict[str, Any]:
        """전략 돌연변이"""
        mutated = strategy.copy()
        
        # 각 파라미터에 대해 돌연변이 확률 적용
        for key, value in mutated.items():
            if np.random.random() < self.mutation_rate:
                if isinstance(value, (int, float)):
                    # 수치형 값 돌연변이 (±20% 범위)
                    mutation_factor = np.random.uniform(0.8, 1.2)
                    mutated[key] = value * mutation_factor
                elif isinstance(value, list) and value:
                    # 리스트 값 돌연변이 (요소 변경)
                    index = np.random.randint(0, len(value))
                    if isinstance(value[index], (int, float)):
                        mutation_factor = np.random.uniform(0.8, 1.2)
                        mutated[key][index] = value[index] * mutation_factor
        
        return mutated
    
    def _evaluate_fitness(self, strategy: Dict[str, Any], 
                         performance_metrics: Dict[str, float],
                         cost_metrics: Dict[str, float]) -> float:
        """적합도 평가"""
        try:
            # 성능 점수 (높을수록 좋음)
            performance_score = 0
            performance_weights = {
                'response_time': -1,  # 낮을수록 좋음
                'throughput': 1,      # 높을수록 좋음
                'availability': 1,    # 높을수록 좋음
                'error_rate': -1      # 낮을수록 좋음
            }
            
            for metric, value in performance_metrics.items():
                weight = performance_weights.get(metric, 0)
                performance_score += value * weight
            
            # 비용 점수 (낮을수록 좋음)
            cost_score = 0
            cost_weights = {
                'total_cost': -1,
                'cost_per_transaction': -1,
                'efficiency_ratio': 1
            }
            
            for metric, value in cost_metrics.items():
                weight = cost_weights.get(metric, 0)
                cost_score += value * weight
            
            # 전략별 보너스/페널티
            strategy_score = 0
            
            # 스케일링 빈도 (너무 자주 스케일링하면 페널티)
            scaling_frequency = strategy.get('scaling_frequency', 0)
            if scaling_frequency > 10:  # 시간당 10회 이상
                strategy_score -= (scaling_frequency - 10) * 0.1
            
            # 리소스 활용률 (적정 수준 유지 보너스)
            target_utilization = strategy.get('target_utilization', 70)
            if 60 <= target_utilization <= 80:
                strategy_score += 0.2
            
            # 최종 적합도 점수 (0-1 정규화)
            total_score = (performance_score * 0.4 + cost_score * 0.4 + strategy_score * 0.2)
            normalized_score = max(0, min(1, (total_score + 10) / 20))  # -10~10을 0~1로 정규화
            
            return normalized_score
            
        except Exception as e:
            logger.error(f"Failed to evaluate fitness: {e}")
            return 0.0


class AutoScalingOptimizer:
    """통합 자동 스케일링 최적화기"""
    
    def __init__(self, config: ScalingConfiguration):
        self.config = config
        self.load_predictor = LoadPredictor()
        self.cost_optimizer = CostOptimizer()
        self.evolutionary_optimizer = EvolutionaryScalingOptimizer()
        self.instances = {}
        self.scaling_history = []
        self.performance_metrics = defaultdict(list)
        self.cost_metrics = defaultdict(list)
        self.active_rules = []
        self.prediction_accuracy = defaultdict(float)
        self.optimization_lock = threading.RLock()
        self.monitoring_active = False
        self.llm_integration = None  # LLM 연동을 위한 플레이스홀더
        
        # 메트릭 수집을 위한 버퍼
        self.metrics_buffer = defaultdict(lambda: deque(maxlen=1000))
        self.scaling_decisions = deque(maxlen=100)
        
        # 진화형 최적화를 위한 세대 관리
        self.current_generation = 0
        self.evolution_interval = 3600  # 1시간마다 진화
        self.last_evolution = datetime.now()
        
    async def start_optimization(self):
        """최적화 시스템 시작"""
        logger.info("Starting Auto Scaling Optimizer")
        self.monitoring_active = True
        
        # 백그라운드 태스크들 시작
        tasks = [
            asyncio.create_task(self._monitoring_loop()),
            asyncio.create_task(self._prediction_loop()),
            asyncio.create_task(self._evolution_loop()),
            asyncio.create_task(self._cost_analysis_loop())
        ]
        
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Error in optimization system: {e}")
            await self.stop_optimization()
    
    async def stop_optimization(self):
        """최적화 시스템 중지"""
        logger.info("Stopping Auto Scaling Optimizer")
        self.monitoring_active = False
    
    async def _monitoring_loop(self):
        """실시간 모니터링 루프"""
        while self.monitoring_active:
            try:
                # 현재 인스턴스 상태 수집
                await self._collect_instance_metrics()
                
                # 스케일링 규칙 평가
                scaling_decisions = await self._evaluate_scaling_rules()
                
                # 스케일링 실행
                for decision in scaling_decisions:
                    await self._execute_scaling_action(decision)
                
                await asyncio.sleep(self.config.evaluation_interval)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(self.config.evaluation_interval)
    
    async def _prediction_loop(self):
        """예측 루프"""
        while self.monitoring_active:
            try:
                # 각 리소스 타입에 대해 예측 수행
                for resource_type in ResourceType:
                    if resource_type in self.metrics_buffer:
                        # 훈련 데이터 업데이트
                        recent_metrics = list(self.metrics_buffer[resource_type])[-100:]
                        if recent_metrics:
                            metric_points = [
                                MetricPoint(
                                    timestamp=datetime.now() - timedelta(minutes=len(recent_metrics)-i),
                                    value=metric['value'],
                                    resource_type=resource_type,
                                    instance_id=metric.get('instance_id', 'unknown')
                                )
                                for i, metric in enumerate(recent_metrics)
                            ]
                            self.load_predictor.add_training_data(resource_type, metric_points)
                        
                        # 예측 수행
                        prediction = self.load_predictor.predict_load(
                            resource_type, self.config.prediction_window
                        )
                        
                        if prediction:
                            await self._process_prediction(prediction)
                
                await asyncio.sleep(300)  # 5분마다 예측
                
            except Exception as e:
                logger.error(f"Error in prediction loop: {e}")
                await asyncio.sleep(300)
    
    async def _evolution_loop(self):
        """진화 루프"""
        while self.monitoring_active:
            try:
                if datetime.now() - self.last_evolution >= timedelta(seconds=self.evolution_interval):
                    await self._evolve_scaling_strategy()
                    self.last_evolution = datetime.now()
                
                await asyncio.sleep(600)  # 10분마다 확인
                
            except Exception as e:
                logger.error(f"Error in evolution loop: {e}")
                await asyncio.sleep(600)
    
    async def _cost_analysis_loop(self):
        """비용 분석 루프"""
        while self.monitoring_active:
            try:
                # 지난 1시간 비용 분석
                end_time = datetime.now()
                start_time = end_time - timedelta(hours=1)
                
                cost_analysis = self.cost_optimizer.analyze_cost_efficiency(
                    list(self.instances.values()),
                    (start_time, end_time)
                )
                
                # 비용 메트릭 업데이트
                self.cost_metrics['total_cost'].append(cost_analysis.total_cost)
                self.cost_metrics['efficiency_score'].append(cost_analysis.efficiency_score)
                
                # LLM 연동: 비용 분석 결과를 LLM에 전달
                if self.llm_integration:
                    await self._send_cost_analysis_to_llm(cost_analysis)
                
                await asyncio.sleep(3600)  # 1시간마다 비용 분석
                
            except Exception as e:
                logger.error(f"Error in cost analysis loop: {e}")
                await asyncio.sleep(3600)
    
    async def _collect_instance_metrics(self):
        """인스턴스 메트릭 수집"""
        for instance_id, instance in self.instances.items():
            try:
                # 실제 구현에서는 클라우드 API나 모니터링 시스템에서 메트릭 수집
                metrics = await self._fetch_instance_metrics(instance)
                
                # 메트릭 버퍼에 저장
                for resource_type, value in metrics.items():
                    self.metrics_buffer[resource_type].append({
                        'timestamp': datetime.now(),
                        'value': value,
                        'instance_id': instance_id
                    })
                
                # 인스턴스 상태 업데이트
                instance.current_utilization = metrics
                
            except Exception as e:
                logger.error(f"Failed to collect metrics for {instance_id}: {e}")
    
    async def _fetch_instance_metrics(self, instance: ResourceInstance) -> Dict[ResourceType, float]:
        """실제 인스턴스 메트릭 가져오기 (모의)"""
        # 실제 구현에서는 AWS CloudWatch, GCP Monitoring 등의 API 사용
        return {
            ResourceType.CPU: np.random.uniform(20, 80),
            ResourceType.MEMORY: np.random.uniform(30, 70),
            ResourceType.NETWORK: np.random.uniform(10, 50),
            ResourceType.STORAGE: np.random.uniform(40, 90)
        }
    
    async def _evaluate_scaling_rules(self) -> List[ScalingAction]:
        """스케일링 규칙 평가"""
        scaling_actions = []
        
        with self.optimization_lock:
            for rule in self.config.scaling_policies:
                if not rule.enabled:
                    continue
                
                try:
                    action = await self._evaluate_single_rule(rule)
                    if action:
                        scaling_actions.append(action)
                        
                except Exception as e:
                    logger.error(f"Failed to evaluate rule {rule.rule_id}: {e}")
        
        # 우선순위 정렬
        scaling_actions.sort(key=lambda x: getattr(x, 'priority', 1), reverse=True)
        
        return scaling_actions
    
    async def _evaluate_single_rule(self, rule: ScalingRule) -> Optional[ScalingAction]:
        """단일 스케일링 규칙 평가"""
        resource_type = rule.resource_type
        
        # 최근 메트릭 가져오기
        if resource_type not in self.metrics_buffer:
            return None
        
        recent_metrics = list(self.metrics_buffer[resource_type])[-5:]  # 최근 5개
        if not recent_metrics:
            return None
        
        current_value = statistics.mean([m['value'] for m in recent_metrics])
        
        # 스케일링 방향 결정
        direction = ScalingDirection.MAINTAIN
        target_capacity = len(self.instances)
        
        if current_value > rule.threshold_up:
            direction = ScalingDirection.UP
            target_capacity = min(
                len(self.instances) + rule.scale_up_amount,
                self.config.max_instances
            )
        elif current_value < rule.threshold_down:
            direction = ScalingDirection.DOWN
            target_capacity = max(
                len(self.instances) - rule.scale_down_amount,
                self.config.min_instances
            )
        
        if direction == ScalingDirection.MAINTAIN:
            return None
        
        # 쿨다운 확인
        if not self._check_cooldown(rule):
            return None
        
        # 스케일링 액션 생성
        action = ScalingAction(
            action_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            direction=direction,
            resource_type=resource_type,
            current_capacity=len(self.instances),
            target_capacity=target_capacity,
            reason=f"Rule {rule.rule_id}: {resource_type.value} {current_value:.1f}%",
            confidence=self._calculate_action_confidence(rule, current_value),
            estimated_cost=self._estimate_scaling_cost(direction, target_capacity - len(self.instances)),
            estimated_duration=60  # 추정 실행 시간 (초)
        )
        
        return action
    
    def _check_cooldown(self, rule: ScalingRule) -> bool:
        """쿨다운 기간 확인"""
        now = datetime.now()
        
        for action in self.scaling_decisions:
            if (action.resource_type == rule.resource_type and
                (now - action.timestamp).total_seconds() < rule.cooldown_period):
                return False
        
        return True
    
    def _calculate_action_confidence(self, rule: ScalingRule, current_value: float) -> float:
        """스케일링 액션 신뢰도 계산"""
        # 임계값을 얼마나 초과했는지에 따른 신뢰도
        if current_value > rule.threshold_up:
            excess = current_value - rule.threshold_up
            confidence = min(1.0, excess / (100 - rule.threshold_up))
        elif current_value < rule.threshold_down:
            deficit = rule.threshold_down - current_value
            confidence = min(1.0, deficit / rule.threshold_down)
        else:
            confidence = 0.5
        
        # 예측 정확도 반영
        prediction_accuracy = self.prediction_accuracy.get(rule.resource_type, 0.7)
        confidence *= prediction_accuracy
        
        return confidence
    
    def _estimate_scaling_cost(self, direction: ScalingDirection, instance_count_change: int) -> float:
        """스케일링 비용 추정"""
        if not self.instances:
            return 0.0
        
        # 평균 인스턴스 비용 계산
        avg_cost_per_hour = statistics.mean([
            instance.cost_per_hour for instance in self.instances.values()
        ])
        
        # 비용 변화 계산 (1시간 기준)
        cost_change = avg_cost_per_hour * instance_count_change
        
        return cost_change if direction == ScalingDirection.UP else -cost_change
    
    async def _execute_scaling_action(self, action: ScalingAction):
        """스케일링 액션 실행"""
        try:
            logger.info(f"Executing scaling action: {action.action_id}")
            
            # LLM 연동: 스케일링 결정을 LLM에 보고
            if self.llm_integration:
                await self._report_scaling_decision_to_llm(action)
            
            # 실제 스케일링 실행 (모의)
            success = await self._perform_scaling(action)
            
            if success:
                # 성공한 액션 기록
                self.scaling_decisions.append(action)
                self.scaling_history.append({
                    'action': action,
                    'timestamp': action.timestamp,
                    'success': True
                })
                
                logger.info(f"Scaling action {action.action_id} completed successfully")
            else:
                logger.error(f"Scaling action {action.action_id} failed")
                
        except Exception as e:
            logger.error(f"Failed to execute scaling action {action.action_id}: {e}")
    
    async def _perform_scaling(self, action: ScalingAction) -> bool:
        """실제 스케일링 수행 (클라우드 API 호출)"""
        try:
            current_count = len(self.instances)
            target_count = action.target_capacity
            
            if action.direction == ScalingDirection.UP:
                # 인스턴스 추가
                for i in range(target_count - current_count):
                    new_instance = await self._launch_instance()
                    if new_instance:
                        self.instances[new_instance.instance_id] = new_instance
                    
            elif action.direction == ScalingDirection.DOWN:
                # 인스턴스 제거
                instances_to_remove = list(self.instances.keys())[:current_count - target_count]
                for instance_id in instances_to_remove:
                    success = await self._terminate_instance(instance_id)
                    if success:
                        del self.instances[instance_id]
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to perform scaling: {e}")
            return False
    
    async def _launch_instance(self) -> Optional[ResourceInstance]:
        """새 인스턴스 시작"""
        # 실제 구현에서는 클라우드 API 호출
        instance_id = f"instance-{uuid.uuid4().hex[:8]}"
        
        instance = ResourceInstance(
            instance_id=instance_id,
            instance_type="m5.large",  # 예시
            cloud_provider=CloudProvider.AWS,
            specs={
                "cpu_cores": 2,
                "memory_gb": 8,
                "storage_gb": 20
            },
            current_utilization={},
            cost_per_hour=0.096,  # 예시 비용
            status="launching",
            created_at=datetime.now()
        )
        
        logger.info(f"Launched new instance: {instance_id}")
        return instance
    
    async def _terminate_instance(self, instance_id: str) -> bool:
        """인스턴스 종료"""
        # 실제 구현에서는 클라우드 API 호출
        logger.info(f"Terminated instance: {instance_id}")
        return True
    
    async def _process_prediction(self, prediction: LoadPrediction):
        """예측 결과 처리"""
        try:
            # 예측 기반 사전 스케일링 결정
            for resource_type, metrics in prediction.predicted_metrics.items():
                if not metrics:
                    continue
                
                future_values = [m.value for m in metrics]
                max_predicted = max(future_values)
                
                # 임계값 확인
                for rule in self.config.scaling_policies:
                    if rule.resource_type == resource_type and rule.enabled:
                        if max_predicted > rule.threshold_up:
                            # 사전 스케일업 준비
                            await self._prepare_proactive_scaling(resource_type, ScalingDirection.UP)
                        elif max_predicted < rule.threshold_down:
                            # 사전 스케일다운 준비
                            await self._prepare_proactive_scaling(resource_type, ScalingDirection.DOWN)
            
        except Exception as e:
            logger.error(f"Failed to process prediction: {e}")
    
    async def _prepare_proactive_scaling(self, resource_type: ResourceType, direction: ScalingDirection):
        """사전 스케일링 준비"""
        logger.info(f"Preparing proactive scaling for {resource_type.value} - {direction.value}")
        
        # LLM 연동: 예측 기반 스케일링 계획을 LLM에 보고
        if self.llm_integration:
            await self._report_proactive_scaling_to_llm(resource_type, direction)
    
    async def _evolve_scaling_strategy(self):
        """스케일링 전략 진화"""
        try:
            logger.info("Starting scaling strategy evolution")
            
            # 현재 전략 수집
            current_strategy = self._extract_current_strategy()
            
            # 성능 메트릭 수집
            performance_metrics = self._calculate_performance_metrics()
            
            # 비용 메트릭 수집
            cost_metrics = self._calculate_cost_metrics()
            
            # 진화 실행
            evolved_strategy = self.evolutionary_optimizer.evolve_scaling_strategy(
                current_strategy, performance_metrics, cost_metrics
            )
            
            # 새 전략 적용
            await self._apply_evolved_strategy(evolved_strategy)
            
            self.current_generation += 1
            logger.info(f"Evolution completed - Generation {self.current_generation}")
            
            # LLM 연동: 진화 결과를 LLM에 보고
            if self.llm_integration:
                await self._report_evolution_to_llm(evolved_strategy, performance_metrics, cost_metrics)
            
        except Exception as e:
            logger.error(f"Failed to evolve scaling strategy: {e}")
    
    def _extract_current_strategy(self) -> Dict[str, Any]:
        """현재 스케일링 전략 추출"""
        strategy = {}
        
        for rule in self.config.scaling_policies:
            strategy[f"{rule.resource_type.value}_threshold_up"] = rule.threshold_up
            strategy[f"{rule.resource_type.value}_threshold_down"] = rule.threshold_down
            strategy[f"{rule.resource_type.value}_scale_up"] = rule.scale_up_amount
            strategy[f"{rule.resource_type.value}_scale_down"] = rule.scale_down_amount
            strategy[f"{rule.resource_type.value}_cooldown"] = rule.cooldown_period
        
        strategy["min_instances"] = self.config.min_instances
        strategy["max_instances"] = self.config.max_instances
        strategy["prediction_window"] = self.config.prediction_window
        strategy["evaluation_interval"] = self.config.evaluation_interval
        
        return strategy
    
    def _calculate_performance_metrics(self) -> Dict[str, float]:
        """성능 메트릭 계산"""
        metrics = {}
        
        # 최근 성능 데이터 분석
        if self.performance_metrics:
            for metric_name, values in self.performance_metrics.items():
                if values:
                    recent_values = values[-10:]  # 최근 10개
                    metrics[metric_name] = statistics.mean(recent_values)
        
        # 스케일링 반응성 계산
        recent_actions = [a for a in self.scaling_decisions 
                         if (datetime.now() - a.timestamp).total_seconds() < 3600]
        
        metrics["scaling_frequency"] = len(recent_actions)
        metrics["avg_scaling_confidence"] = statistics.mean([a.confidence for a in recent_actions]) if recent_actions else 0.5
        
        return metrics
    
    def _calculate_cost_metrics(self) -> Dict[str, float]:
        """비용 메트릭 계산"""
        metrics = {}
        
        if self.cost_metrics:
            for metric_name, values in self.cost_metrics.items():
                if values:
                    recent_values = values[-10:]  # 최근 10개
                    metrics[metric_name] = statistics.mean(recent_values)
        
        # 현재 시간당 비용
        current_hourly_cost = sum(instance.cost_per_hour for instance in self.instances.values())
        metrics["current_hourly_cost"] = current_hourly_cost
        
        # 비용 대비 성능
        if current_hourly_cost > 0 and self.performance_metrics.get("throughput"):
            throughput_values = self.performance_metrics["throughput"][-5:]
            if throughput_values:
                avg_throughput = statistics.mean(throughput_values)
                metrics["cost_per_throughput"] = current_hourly_cost / avg_throughput
        
        return metrics
    
    async def _apply_evolved_strategy(self, strategy: Dict[str, Any]):
        """진화된 전략 적용"""
        try:
            # 스케일링 정책 업데이트
            for rule in self.config.scaling_policies:
                resource_key = rule.resource_type.value
                
                if f"{resource_key}_threshold_up" in strategy:
                    rule.threshold_up = max(50, min(95, strategy[f"{resource_key}_threshold_up"]))
                
                if f"{resource_key}_threshold_down" in strategy:
                    rule.threshold_down = max(5, min(50, strategy[f"{resource_key}_threshold_down"]))
                
                if f"{resource_key}_scale_up" in strategy:
                    rule.scale_up_amount = max(1, min(10, int(strategy[f"{resource_key}_scale_up"])))
                
                if f"{resource_key}_scale_down" in strategy:
                    rule.scale_down_amount = max(1, min(5, int(strategy[f"{resource_key}_scale_down"])))
                
                if f"{resource_key}_cooldown" in strategy:
                    rule.cooldown_period = max(30, min(3600, int(strategy[f"{resource_key}_cooldown"])))
            
            # 전역 설정 업데이트
            if "min_instances" in strategy:
                self.config.min_instances = max(1, min(50, int(strategy["min_instances"])))
            
            if "max_instances" in strategy:
                self.config.max_instances = max(self.config.min_instances, min(1000, int(strategy["max_instances"])))
            
            if "prediction_window" in strategy:
                self.config.prediction_window = max(300, min(7200, int(strategy["prediction_window"])))
            
            if "evaluation_interval" in strategy:
                self.config.evaluation_interval = max(30, min(300, int(strategy["evaluation_interval"])))
            
            logger.info("Applied evolved scaling strategy")
            
        except Exception as e:
            logger.error(f"Failed to apply evolved strategy: {e}")
    
    # LLM 연동 메서드들
    async def _send_cost_analysis_to_llm(self, cost_analysis: CostAnalysis):
        """비용 분석 결과를 LLM에 전달"""
        if not self.llm_integration:
            return
        
        message = {
            "type": "cost_analysis",
            "data": {
                "total_cost": cost_analysis.total_cost,
                "efficiency_score": cost_analysis.efficiency_score,
                "optimization_opportunities": cost_analysis.optimization_opportunities,
                "potential_savings": cost_analysis.potential_savings,
                "recommendations": cost_analysis.recommendations
            },
            "timestamp": datetime.now().isoformat()
        }
        
        await self.llm_integration.send_message(message)
    
    async def _report_scaling_decision_to_llm(self, action: ScalingAction):
        """스케일링 결정을 LLM에 보고"""
        if not self.llm_integration:
            return
        
        message = {
            "type": "scaling_decision",
            "data": {
                "action_id": action.action_id,
                "direction": action.direction.value,
                "resource_type": action.resource_type.value,
                "current_capacity": action.current_capacity,
                "target_capacity": action.target_capacity,
                "reason": action.reason,
                "confidence": action.confidence,
                "estimated_cost": action.estimated_cost
            },
            "timestamp": action.timestamp.isoformat()
        }
        
        await self.llm_integration.send_message(message)
    
    async def _report_proactive_scaling_to_llm(self, resource_type: ResourceType, direction: ScalingDirection):
        """사전 스케일링 계획을 LLM에 보고"""
        if not self.llm_integration:
            return
        
        message = {
            "type": "proactive_scaling_plan",
            "data": {
                "resource_type": resource_type.value,
                "direction": direction.value,
                "prediction_based": True
            },
            "timestamp": datetime.now().isoformat()
        }
        
        await self.llm_integration.send_message(message)
    
    async def _report_evolution_to_llm(self, strategy: Dict[str, Any], 
                                     performance_metrics: Dict[str, float], 
                                     cost_metrics: Dict[str, float]):
        """진화 결과를 LLM에 보고"""
        if not self.llm_integration:
            return
        
        message = {
            "type": "strategy_evolution",
            "data": {
                "generation": self.current_generation,
                "evolved_strategy": strategy,
                "performance_metrics": performance_metrics,
                "cost_metrics": cost_metrics,
                "fitness_history": self.evolutionary_optimizer.fitness_history[-10:]  # 최근 10세대
            },
            "timestamp": datetime.now().isoformat()
        }
        
        await self.llm_integration.send_message(message)
    
    # 공개 API 메서드들
    def add_instance(self, instance: ResourceInstance):
        """인스턴스 추가"""
        with self.optimization_lock:
            self.instances[instance.instance_id] = instance
            logger.info(f"Added instance {instance.instance_id}")
    
    def remove_instance(self, instance_id: str):
        """인스턴스 제거"""
        with self.optimization_lock:
            if instance_id in self.instances:
                del self.instances[instance_id]
                logger.info(f"Removed instance {instance_id}")
    
    def update_scaling_policy(self, rule: ScalingRule):
        """스케일링 정책 업데이트"""
        with self.optimization_lock:
            # 기존 규칙 제거
            self.config.scaling_policies = [
                r for r in self.config.scaling_policies 
                if r.rule_id != rule.rule_id
            ]
            # 새 규칙 추가
            self.config.scaling_policies.append(rule)
            logger.info(f"Updated scaling rule {rule.rule_id}")
    
    def get_scaling_status(self) -> Dict[str, Any]:
        """현재 스케일링 상태 반환"""
        with self.optimization_lock:
            return {
                "active_instances": len(self.instances),
                "min_instances": self.config.min_instances,
                "max_instances": self.config.max_instances,
                "monitoring_active": self.monitoring_active,
                "current_generation": self.current_generation,
                "recent_actions": len([
                    a for a in self.scaling_decisions 
                    if (datetime.now() - a.timestamp).total_seconds() < 3600
                ]),
                "last_evolution": self.last_evolution.isoformat()
            }
    
    def get_performance_report(self) -> Dict[str, Any]:
        """성능 보고서 반환"""
        performance_metrics = self._calculate_performance_metrics()
        cost_metrics = self._calculate_cost_metrics()
        
        return {
            "performance_metrics": performance_metrics,
            "cost_metrics": cost_metrics,
            "prediction_accuracy": dict(self.prediction_accuracy),
            "evolution_history": [gen.fitness_scores for gen in self.evolutionary_optimizer.generations[-5:]],
            "optimization_opportunities": self._identify_current_opportunities()
        }
    
    def _identify_current_opportunities(self) -> List[str]:
        """현재 최적화 기회 식별"""
        opportunities = []
        
        # 인스턴스 활용률 분석
        if self.instances:
            low_util_instances = 0
            for instance in self.instances.values():
                cpu_util = instance.current_utilization.get(ResourceType.CPU, 0)
                if cpu_util < 30:
                    low_util_instances += 1
            
            if low_util_instances > len(self.instances) * 0.3:
                opportunities.append("Consider reducing instance count - low CPU utilization detected")
        
        # 스케일링 빈도 분석
        recent_actions = [a for a in self.scaling_decisions 
                         if (datetime.now() - a.timestamp).total_seconds() < 3600]
        if len(recent_actions) > 10:
            opportunities.append("High scaling frequency detected - consider adjusting thresholds")
        
        # 비용 효율성 분석
        if self.cost_metrics.get("efficiency_score"):
            recent_efficiency = self.cost_metrics["efficiency_score"][-5:]
            if recent_efficiency and statistics.mean(recent_efficiency) < 0.6:
                opportunities.append("Low cost efficiency - review instance types and scaling policies")
        
        return opportunities
    
    def set_llm_integration(self, llm_integration):
        """LLM 연동 설정"""
        self.llm_integration = llm_integration
        logger.info("LLM integration configured")
    
    async def process_llm_feedback(self, feedback: Dict[str, Any]):
        """LLM 피드백 처리"""
        try:
            feedback_type = feedback.get("type")
            
            if feedback_type == "scaling_recommendation":
                await self._process_llm_scaling_recommendation(feedback)
            elif feedback_type == "strategy_optimization":
                await self._process_llm_strategy_optimization(feedback)
            elif feedback_type == "cost_optimization":
                await self._process_llm_cost_optimization(feedback)
            else:
                logger.warning(f"Unknown LLM feedback type: {feedback_type}")
                
        except Exception as e:
            logger.error(f"Failed to process LLM feedback: {e}")
    
    async def _process_llm_scaling_recommendation(self, feedback: Dict[str, Any]):
        """LLM 스케일링 권장사항 처리"""
        data = feedback.get("data", {})
        
        # LLM이 권장하는 스케일링 액션
        recommended_action = data.get("recommended_action")
        confidence = data.get("confidence", 0.5)
        reasoning = data.get("reasoning", "")
        
        if recommended_action and confidence > 0.7:
            # 높은 신뢰도의 LLM 권장사항을 스케일링 결정에 반영
            logger.info(f"Processing high-confidence LLM recommendation: {reasoning}")
            
            # 추가 검증 후 적용 (실제 구현에서는 더 엄격한 검증 필요)
            if await self._validate_llm_recommendation(recommended_action):
                await self._apply_llm_recommendation(recommended_action)
    
    async def _process_llm_strategy_optimization(self, feedback: Dict[str, Any]):
        """LLM 전략 최적화 권장사항 처리"""
        data = feedback.get("data", {})
        
        # LLM이 제안하는 전략 개선사항
        strategy_improvements = data.get("improvements", [])
        
        for improvement in strategy_improvements:
            if improvement.get("confidence", 0) > 0.8:
                await self._apply_strategy_improvement(improvement)
    
    async def _process_llm_cost_optimization(self, feedback: Dict[str, Any]):
        """LLM 비용 최적화 권장사항 처리"""
        data = feedback.get("data", {})
        
        # LLM이 제안하는 비용 최적화 방안
        cost_optimizations = data.get("optimizations", [])
        
        for optimization in cost_optimizations:
            if optimization.get("potential_savings", 0) > 100:  # $100 이상 절약 가능
                await self._evaluate_cost_optimization(optimization)


class ScalingMetricsCollector:
    """스케일링 메트릭 수집기"""
    
    def __init__(self):
        self.metrics_history = defaultdict(lambda: deque(maxlen=1000))
        self.collection_interval = 60  # 초
        self.is_collecting = False
        
    async def start_collection(self):
        """메트릭 수집 시작"""
        self.is_collecting = True
        while self.is_collecting:
            try:
                await self._collect_system_metrics()
                await asyncio.sleep(self.collection_interval)
            except Exception as e:
                logger.error(f"Error collecting metrics: {e}")
                await asyncio.sleep(self.collection_interval)
    
    def stop_collection(self):
        """메트릭 수집 중지"""
        self.is_collecting = False
    
    async def _collect_system_metrics(self):
        """시스템 메트릭 수집"""
        timestamp = datetime.now()
        
        # CPU 메트릭
        cpu_metric = MetricPoint(
            timestamp=timestamp,
            value=await self._get_cpu_usage(),
            resource_type=ResourceType.CPU,
            instance_id="system"
        )
        self.metrics_history[ResourceType.CPU].append(cpu_metric)
        
        # 메모리 메트릭
        memory_metric = MetricPoint(
            timestamp=timestamp,
            value=await self._get_memory_usage(),
            resource_type=ResourceType.MEMORY,
            instance_id="system"
        )
        self.metrics_history[ResourceType.MEMORY].append(memory_metric)
        
        # 네트워크 메트릭
        network_metric = MetricPoint(
            timestamp=timestamp,
            value=await self._get_network_usage(),
            resource_type=ResourceType.NETWORK,
            instance_id="system"
        )
        self.metrics_history[ResourceType.NETWORK].append(network_metric)
    
    async def _get_cpu_usage(self) -> float:
        """CPU 사용률 조회"""
        try:
            import psutil
            return psutil.cpu_percent(interval=1)
        except ImportError:
            # psutil이 없는 경우 모의 데이터
            return np.random.uniform(20, 80)
    
    async def _get_memory_usage(self) -> float:
        """메모리 사용률 조회"""
        try:
            import psutil
            return psutil.virtual_memory().percent
        except ImportError:
            # psutil이 없는 경우 모의 데이터
            return np.random.uniform(30, 70)
    
    async def _get_network_usage(self) -> float:
        """네트워크 사용률 조회"""
        try:
            import psutil
            net_io = psutil.net_io_counters()
            # 간단한 네트워크 사용률 계산 (실제로는 더 복잡한 계산 필요)
            return min(100, (net_io.bytes_sent + net_io.bytes_recv) / (1024 * 1024))  # MB 단위
        except ImportError:
            # psutil이 없는 경우 모의 데이터
            return np.random.uniform(10, 50)


class ScalingSimulator:
    """스케일링 시뮬레이터 (테스트 및 검증용)"""
    
    def __init__(self):
        self.simulated_load = []
        self.simulation_results = []
        
    def create_load_scenario(self, duration_hours: int, load_pattern: str) -> List[MetricPoint]:
        """로드 시나리오 생성"""
        points = []
        current_time = datetime.now()
        
        for minute in range(duration_hours * 60):
            timestamp = current_time + timedelta(minutes=minute)
            
            if load_pattern == "steady":
                cpu_value = 50 + np.random.normal(0, 5)
            elif load_pattern == "spike":
                base = 40
                if 120 <= minute <= 180:  # 2-3시간에 스파이크
                    base = 90
                cpu_value = base + np.random.normal(0, 5)
            elif load_pattern == "gradual_increase":
                cpu_value = 30 + (minute / (duration_hours * 60)) * 50 + np.random.normal(0, 3)
            elif load_pattern == "oscillating":
                cpu_value = 50 + 20 * math.sin(minute / 60 * math.pi) + np.random.normal(0, 3)
            else:
                cpu_value = 50 + np.random.normal(0, 10)
            
            points.append(MetricPoint(
                timestamp=timestamp,
                value=max(0, min(100, cpu_value)),
                resource_type=ResourceType.CPU,
                instance_id="simulated"
            ))
        
        self.simulated_load = points
        return points
    
    async def simulate_scaling_strategy(self, optimizer: AutoScalingOptimizer, 
                                      load_data: List[MetricPoint]) -> Dict[str, Any]:
        """스케일링 전략 시뮬레이션"""
        simulation_start = datetime.now()
        scaling_actions = []
        cost_history = []
        performance_history = []
        
        # 시뮬레이션 실행
        for i, metric_point in enumerate(load_data):
            # 메트릭 주입
            optimizer.metrics_buffer[ResourceType.CPU].append({
                'timestamp': metric_point.timestamp,
                'value': metric_point.value,
                'instance_id': metric_point.instance_id
            })
            
            # 스케일링 규칙 평가
            actions = await optimizer._evaluate_scaling_rules()
            scaling_actions.extend(actions)
            
            # 성능 및 비용 메트릭 계산
            current_instances = len(optimizer.instances)
            cost = current_instances * 0.096  # 시간당 비용
            
            # 성능 점수 계산 (간단한 모델)
            if metric_point.value > 80 and current_instances < 5:
                performance_score = 0.6  # 부하가 높은데 인스턴스가 부족
            elif metric_point.value < 30 and current_instances > 2:
                performance_score = 0.8  # 부하가 낮은데 인스턴스가 많음 (비효율적)
            else:
                performance_score = 0.9  # 적정 수준
            
            cost_history.append(cost)
            performance_history.append(performance_score)
        
        # 시뮬레이션 결과 분석
        simulation_result = {
            "duration": len(load_data),
            "total_scaling_actions": len(scaling_actions),
            "total_cost": sum(cost_history),
            "average_performance": statistics.mean(performance_history),
            "scaling_frequency": len(scaling_actions) / (len(load_data) / 60),  # 시간당 스케일링 횟수
            "cost_efficiency": statistics.mean(performance_history) / (sum(cost_history) / len(cost_history)),
            "actions_breakdown": {
                "scale_up": len([a for a in scaling_actions if a.direction == ScalingDirection.UP]),
                "scale_down": len([a for a in scaling_actions if a.direction == ScalingDirection.DOWN])
            }
        }
        
        self.simulation_results.append(simulation_result)
        return simulation_result
    
    def compare_strategies(self, strategy_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """전략 비교 분석"""
        comparison = {
            "best_cost_efficiency": max(strategy_results, key=lambda x: x["cost_efficiency"]),
            "lowest_cost": min(strategy_results, key=lambda x: x["total_cost"]),
            "best_performance": max(strategy_results, key=lambda x: x["average_performance"]),
            "most_stable": min(strategy_results, key=lambda x: x["scaling_frequency"])
        }
        
        return comparison


# 팩토리 및 유틸리티 함수들
def create_default_scaling_config() -> ScalingConfiguration:
    """기본 스케일링 설정 생성"""
    default_rules = [
        ScalingRule(
            rule_id="cpu_scale_up",
            resource_type=ResourceType.CPU,
            threshold_up=75.0,
            threshold_down=25.0,
            scale_up_amount=2,
            scale_down_amount=1,
            cooldown_period=300,
            priority=1
        ),
        ScalingRule(
            rule_id="memory_scale_up",
            resource_type=ResourceType.MEMORY,
            threshold_up=80.0,
            threshold_down=30.0,
            scale_up_amount=1,
            scale_down_amount=1,
            cooldown_period=300,
            priority=2
        )
    ]
    
    return ScalingConfiguration(
        min_instances=2,
        max_instances=20,
        target_utilization={
            ResourceType.CPU: 70.0,
            ResourceType.MEMORY: 75.0
        },
        scaling_policies=default_rules,
        prediction_window=1800,  # 30분
        evaluation_interval=60,   # 1분
        cost_optimization=True,
        performance_weight=0.6,
        cost_weight=0.4,
        enable_ai_optimization=True
    )


def create_sample_instances(count: int = 3) -> List[ResourceInstance]:
    """샘플 인스턴스 생성"""
    instances = []
    
    for i in range(count):
        instance = ResourceInstance(
            instance_id=f"i-{uuid.uuid4().hex[:8]}",
            instance_type="m5.large",
            cloud_provider=CloudProvider.AWS,
            specs={
                "cpu_cores": 2,
                "memory_gb": 8,
                "storage_gb": 20
            },
            current_utilization={
                ResourceType.CPU: np.random.uniform(30, 70),
                ResourceType.MEMORY: np.random.uniform(40, 80),
                ResourceType.NETWORK: np.random.uniform(10, 40)
            },
            cost_per_hour=0.096,
            status="running",
            created_at=datetime.now() - timedelta(hours=np.random.randint(1, 24))
        )
        instances.append(instance)
    
    return instances


# 메인 실행 함수
async def main_example():
    """사용 예제"""
    print("=== Auto Scaling Optimizer Example ===")
    
    # 1. 기본 설정 생성
    config = create_default_scaling_config()
    print(f"Created scaling config with {len(config.scaling_policies)} policies")
    
    # 2. 최적화기 생성
    optimizer = AutoScalingOptimizer(config)
    
    # 3. 샘플 인스턴스 추가
    instances = create_sample_instances(3)
    for instance in instances:
        optimizer.add_instance(instance)
    
    print(f"Added {len(instances)} sample instances")
    
    # 4. 메트릭 수집기 시작
    metrics_collector = ScalingMetricsCollector()
    
    # 5. 시뮬레이션 실행
    simulator = ScalingSimulator()
    
    # 다양한 로드 패턴으로 시뮬레이션
    patterns = ["steady", "spike", "gradual_increase", "oscillating"]
    simulation_results = []
    
    for pattern in patterns:
        print(f"\nSimulating {pattern} load pattern...")
        
        # 로드 시나리오 생성 (2시간)
        load_data = simulator.create_load_scenario(2, pattern)
        
        # 시뮬레이션 실행
        result = await simulator.simulate_scaling_strategy(optimizer, load_data)
        result["pattern"] = pattern
        simulation_results.append(result)
        
        print(f"  Total cost: ${result['total_cost']:.2f}")
        print(f"  Average performance: {result['average_performance']:.3f}")
        print(f"  Scaling actions: {result['total_scaling_actions']}")
        print(f"  Cost efficiency: {result['cost_efficiency']:.3f}")
    
    # 6. 전략 비교
    comparison = simulator.compare_strategies(simulation_results)
    print(f"\n=== Strategy Comparison ===")
    print(f"Best cost efficiency: {comparison['best_cost_efficiency']['pattern']}")
    print(f"Lowest cost: {comparison['lowest_cost']['pattern']}")
    print(f"Best performance: {comparison['best_performance']['pattern']}")
    print(f"Most stable: {comparison['most_stable']['pattern']}")
    
    # 7. 현재 상태 확인
    status = optimizer.get_scaling_status()
    print(f"\n=== Current Status ===")
    print(f"Active instances: {status['active_instances']}")
    print(f"Monitoring active: {status['monitoring_active']}")
    print(f"Current generation: {status['current_generation']}")
    
    # 8. 성능 보고서
    report = optimizer.get_performance_report()
    print(f"\n=== Performance Report ===")
    print(f"Performance metrics: {report['performance_metrics']}")
    print(f"Cost metrics: {report['cost_metrics']}")
    
    if report['optimization_opportunities']:
        print(f"Optimization opportunities:")
        for opportunity in report['optimization_opportunities']:
            print(f"  - {opportunity}")


# LLM 연동 예제 클래스
class MockLLMIntegration:
    """LLM 연동 모의 클래스"""
    
    def __init__(self):
        self.message_history = []
    
    async def send_message(self, message: Dict[str, Any]):
        """LLM에 메시지 전송"""
        self.message_history.append(message)
        print(f"[LLM] Received {message['type']}: {message.get('data', {})}")
        
        # 모의 LLM 응답 생성
        await self._generate_mock_response(message)
    
    async def _generate_mock_response(self, message: Dict[str, Any]):
        """모의 LLM 응답 생성"""
        message_type = message.get("type")
        
        if message_type == "cost_analysis":
            # 비용 분석에 대한 LLM 응답
            efficiency_score = message["data"].get("efficiency_score", 0)
            if efficiency_score < 0.7:
                response = {
                    "type": "cost_optimization",
                    "data": {
                        "optimizations": [
                            {
                                "type": "instance_rightsizing",
                                "potential_savings": 200,
                                "confidence": 0.85,
                                "description": "Consider downsizing underutilized instances"
                            }
                        ]
                    }
                }
                print(f"[LLM] Suggesting cost optimization: {response}")
        
        elif message_type == "scaling_decision":
            # 스케일링 결정에 대한 LLM 피드백
            confidence = message["data"].get("confidence", 0)
            if confidence < 0.6:
                response = {
                    "type": "scaling_recommendation",
                    "data": {
                        "recommended_action": "wait_and_observe",
                        "confidence": 0.8,
                        "reasoning": "Low confidence scaling decision - recommend waiting for more data"
                    }
                }
                print(f"[LLM] Providing scaling guidance: {response}")


# 통합 예제 실행
async def advanced_example_with_llm():
    """LLM 연동 고급 예제"""
    print("=== Advanced Auto Scaling with LLM Integration ===")
    
    # LLM 연동 설정
    llm_integration = MockLLMIntegration()
    
    # 최적화기 생성 및 LLM 연동
    config = create_default_scaling_config()
    optimizer = AutoScalingOptimizer(config)
    optimizer.set_llm_integration(llm_integration)
    
    # 인스턴스 추가
    instances = create_sample_instances(5)
    for instance in instances:
        optimizer.add_instance(instance)
    
    print("Starting optimization with LLM integration...")
    
    # 짧은 시간 동안 실제 최적화 시스템 실행 (데모용)
    try:
        # 최적화 시스템을 백그라운드에서 시작
        optimization_task = asyncio.create_task(optimizer.start_optimization())
        
        # 5초 후 중지
        await asyncio.sleep(5)
        await optimizer.stop_optimization()
        
        print("Optimization demo completed")
        
    except Exception as e:
        print(f"Demo error: {e}")
    
    # LLM 메시지 히스토리 확인
    print(f"\nLLM received {len(llm_integration.message_history)} messages")
    for i, msg in enumerate(llm_integration.message_history[-3:]):  # 최근 3개만 표시
        print(f"  {i+1}. {msg['type']}: {msg['timestamp']}")


# 편의 함수들
def export_scaling_configuration(config: ScalingConfiguration, filepath: str):
    """스케일링 설정 내보내기"""
    try:
        config_dict = {
            "min_instances": config.min_instances,
            "max_instances": config.max_instances,
            "target_utilization": {k.value: v for k, v in config.target_utilization.items()},
            "prediction_window": config.prediction_window,
            "evaluation_interval": config.evaluation_interval,
            "cost_optimization": config.cost_optimization,
            "performance_weight": config.performance_weight,
            "cost_weight": config.cost_weight,
            "enable_ai_optimization": config.enable_ai_optimization,
            "scaling_policies": [
                {
                    "rule_id": rule.rule_id,
                    "resource_type": rule.resource_type.value,
                    "threshold_up": rule.threshold_up,
                    "threshold_down": rule.threshold_down,
                    "scale_up_amount": rule.scale_up_amount,
                    "scale_down_amount": rule.scale_down_amount,
                    "cooldown_period": rule.cooldown_period,
                    "priority": rule.priority,
                    "enabled": rule.enabled
                }
                for rule in config.scaling_policies
            ]
        }
        
        with open(filepath, 'w') as f:
            json.dump(config_dict, f, indent=2)
        
        print(f"Configuration exported to {filepath}")
        
    except Exception as e:
        print(f"Failed to export configuration: {e}")


def import_scaling_configuration(filepath: str) -> Optional[ScalingConfiguration]:
    """스케일링 설정 가져오기"""
    try:
        with open(filepath, 'r') as f:
            config_dict = json.load(f)
        
        # 스케일링 정책 복원
        scaling_policies = []
        for rule_dict in config_dict.get("scaling_policies", []):
            rule = ScalingRule(
                rule_id=rule_dict["rule_id"],
                resource_type=ResourceType(rule_dict["resource_type"]),
                threshold_up=rule_dict["threshold_up"],
                threshold_down=rule_dict["threshold_down"],
                scale_up_amount=rule_dict["scale_up_amount"],
                scale_down_amount=rule_dict["scale_down_amount"],
                cooldown_period=rule_dict["cooldown_period"],
                priority=rule_dict.get("priority", 1),
                enabled=rule_dict.get("enabled", True)
            )
            scaling_policies.append(rule)
        
        # 설정 객체 생성
        config = ScalingConfiguration(
            min_instances=config_dict["min_instances"],
            max_instances=config_dict["max_instances"],
            target_utilization={
                ResourceType(k): v for k, v in config_dict["target_utilization"].items()
            },
            scaling_policies=scaling_policies,
            prediction_window=config_dict["prediction_window"],
            evaluation_interval=config_dict["evaluation_interval"],
            cost_optimization=config_dict["cost_optimization"],
            performance_weight=config_dict["performance_weight"],
            cost_weight=config_dict["cost_weight"],
            enable_ai_optimization=config_dict["enable_ai_optimization"]
        )
        
        print(f"Configuration imported from {filepath}")
        return config
        
    except Exception as e:
        print(f"Failed to import configuration: {e}")
        return None


# 메인 실행부
if __name__ == "__main__":
    print("Auto Scaling Optimizer - Advanced Implementation")
    print("=" * 50)
    
    # 기본 예제 실행
    asyncio.run(main_example())
    
    print("\n" + "=" * 50)
    
    # LLM 연동 예제 실행
    asyncio.run(advanced_example_with_llm())
    
    print("\n" + "=" * 50)
    
    # 설정 내보내기/가져오기 예제
    print("Configuration Export/Import Example")
    config = create_default_scaling_config()
    export_scaling_configuration(config, "scaling_config.json")
    
    imported_config = import_scaling_configuration("scaling_config.json")
    if imported_config:
        print("Configuration successfully imported and validated")
    
    print("\nAuto Scaling Optimizer implementation completed!")