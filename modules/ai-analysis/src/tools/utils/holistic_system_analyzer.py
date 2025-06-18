#!/usr/bin/env python3
"""
Holistic System Analyzer
전체 시스템 통합 분석 및 인사이트 도출 엔진

주요 기능:
- 멀티소스 로그 통합 분석
- 시스템 건강도 평가
- 연쇄 효과 분석
- 병목 지점 예측
- 최적화 로드맵 생성
- 패턴 인식 및 이상 탐지
- 성능 예측 및 용량 계획
"""

import asyncio
import json
import logging
import statistics
import time
from collections import defaultdict, deque, Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any, Set, Tuple, Union, Iterator
import numpy as np
import networkx as nx
from concurrent.futures import ThreadPoolExecutor
import threading
import weakref
import pickle
from pathlib import Path
import hashlib

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class HealthStatus(Enum):
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class ComponentType(Enum):
    APPLICATION = "application"
    DATABASE = "database"
    CACHE = "cache"
    LOAD_BALANCER = "load_balancer"
    API_GATEWAY = "api_gateway"
    MESSAGE_QUEUE = "message_queue"
    FILE_SYSTEM = "file_system"
    NETWORK = "network"
    CONTAINER = "container"
    SERVICE_MESH = "service_mesh"


class IssueType(Enum):
    PERFORMANCE = "performance"
    AVAILABILITY = "availability"
    SECURITY = "security"
    CAPACITY = "capacity"
    CONFIGURATION = "configuration"
    DEPENDENCY = "dependency"
    DATA_QUALITY = "data_quality"


class SeverityLevel(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


# 데이터 클래스들
@dataclass
class LogEntry:
    """통합 로그 엔트리"""
    timestamp: datetime
    source: str
    component: str
    level: str
    message: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    correlation_id: Optional[str] = None


@dataclass
class MetricData:
    """메트릭 데이터"""
    name: str
    value: float
    unit: str
    timestamp: datetime
    component: str
    tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class SystemComponent:
    """시스템 컴포넌트"""
    id: str
    name: str
    type: ComponentType
    health_status: HealthStatus
    dependencies: List[str] = field(default_factory=list)
    dependents: List[str] = field(default_factory=list)
    metrics: List[MetricData] = field(default_factory=list)
    last_updated: datetime = field(default_factory=datetime.now)


@dataclass
class Issue:
    """시스템 이슈"""
    id: str
    type: IssueType
    severity: SeverityLevel
    title: str
    description: str
    affected_components: List[str]
    first_detected: datetime
    last_seen: datetime
    root_cause: Optional[str] = None
    symptoms: List[str] = field(default_factory=list)
    related_logs: List[LogEntry] = field(default_factory=list)


@dataclass
class Pattern:
    """패턴 정보"""
    id: str
    name: str
    pattern_type: str
    frequency: float
    confidence: float
    components: List[str]
    time_range: Tuple[datetime, datetime]
    characteristics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Anomaly:
    """이상 현상"""
    id: str
    component: str
    metric: str
    detected_at: datetime
    anomaly_score: float
    expected_value: float
    actual_value: float
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CascadeEffect:
    """연쇄 효과"""
    trigger_component: str
    trigger_event: str
    affected_path: List[str]
    impact_severity: float
    propagation_time: timedelta
    mitigation_strategies: List[str] = field(default_factory=list)


@dataclass
class BottleneckInfo:
    """병목 정보"""
    component: str
    resource: str
    utilization: float
    queue_depth: int
    wait_time: float
    throughput_impact: float
    predicted_saturation: Optional[datetime] = None


@dataclass
class SystemHealthReport:
    """시스템 건강도 보고서"""
    overall_health: HealthStatus
    health_score: float
    timestamp: datetime
    components: List[SystemComponent]
    active_issues: List[Issue]
    patterns: List[Pattern]
    anomalies: List[Anomaly]
    cascade_effects: List[CascadeEffect]
    bottlenecks: List[BottleneckInfo]
    recommendations: List[str] = field(default_factory=list)


@dataclass
class OptimizationOpportunity:
    """최적화 기회"""
    type: str
    title: str
    description: str
    expected_impact: float
    implementation_effort: str
    affected_components: List[str]
    prerequisites: List[str] = field(default_factory=list)


@dataclass
class OptimizationRoadmap:
    """최적화 로드맵"""
    opportunities: List[OptimizationOpportunity]
    priority_order: List[str]
    estimated_timeline: Dict[str, timedelta]
    expected_outcomes: Dict[str, float]


@dataclass
class PredictedBottleneck:
    """예측된 병목"""
    component: str
    resource: str
    predicted_time: datetime
    confidence: float
    leading_indicators: List[str]
    prevention_strategies: List[str] = field(default_factory=list)


@dataclass
class TrendData:
    """트렌드 데이터"""
    metric: str
    component: str
    values: List[float]
    timestamps: List[datetime]
    trend_direction: str  # 'increasing', 'decreasing', 'stable', 'volatile'
    trend_strength: float


# 패턴 탐지기
class PatternDetector:
    """패턴 탐지기"""
    
    def __init__(self):
        self.pattern_cache = {}
        self.pattern_models = {}
        
    def detect_temporal_patterns(self, metrics: List[MetricData], 
                               window_size: int = 100) -> List[Pattern]:
        """시간적 패턴 탐지"""
        patterns = []
        
        # 컴포넌트별로 그룹화
        by_component = defaultdict(list)
        for metric in metrics:
            by_component[metric.component].append(metric)
        
        for component, component_metrics in by_component.items():
            # 시간순 정렬
            component_metrics.sort(key=lambda x: x.timestamp)
            
            # 주기적 패턴 탐지
            periodic_patterns = self._detect_periodic_patterns(component_metrics)
            patterns.extend(periodic_patterns)
            
            # 급증/급감 패턴 탐지
            spike_patterns = self._detect_spike_patterns(component_metrics)
            patterns.extend(spike_patterns)
            
            # 상관관계 패턴 탐지
            correlation_patterns = self._detect_correlation_patterns(component_metrics)
            patterns.extend(correlation_patterns)
        
        return patterns
    
    def _detect_periodic_patterns(self, metrics: List[MetricData]) -> List[Pattern]:
        """주기적 패턴 탐지"""
        patterns = []
        
        if len(metrics) < 10:
            return patterns
        
        # 값 시계열 추출
        values = [m.value for m in metrics]
        timestamps = [m.timestamp for m in metrics]
        
        # 간단한 FFT 기반 주기 탐지 시뮬레이션
        try:
            # 이동 평균으로 주기성 근사 탐지
            window_size = min(10, len(values) // 4)
            moving_avg = []
            for i in range(len(values) - window_size + 1):
                avg = sum(values[i:i + window_size]) / window_size
                moving_avg.append(avg)
            
            # 표준편차 기반 변동성 분석
            if len(moving_avg) > 1:
                std_dev = statistics.stdev(moving_avg)
                mean_val = statistics.mean(moving_avg)
                
                # 변동성이 일정 범위 내에 있으면 주기적 패턴으로 간주
                if std_dev > 0 and (std_dev / mean_val) > 0.1:
                    pattern = Pattern(
                        id=f"periodic_{metrics[0].component}_{int(time.time())}",
                        name=f"Periodic pattern in {metrics[0].component}",
                        pattern_type="periodic",
                        frequency=1.0 / window_size,
                        confidence=min(1.0, std_dev / mean_val),
                        components=[metrics[0].component],
                        time_range=(timestamps[0], timestamps[-1]),
                        characteristics={
                            "cycle_length": window_size,
                            "amplitude": std_dev,
                            "baseline": mean_val
                        }
                    )
                    patterns.append(pattern)
        
        except Exception as e:
            logger.warning(f"Error detecting periodic patterns: {e}")
        
        return patterns
    
    def _detect_spike_patterns(self, metrics: List[MetricData]) -> List[Pattern]:
        """급증/급감 패턴 탐지"""
        patterns = []
        
        if len(metrics) < 5:
            return patterns
        
        values = [m.value for m in metrics]
        timestamps = [m.timestamp for m in metrics]
        
        try:
            mean_val = statistics.mean(values)
            std_dev = statistics.stdev(values) if len(values) > 1 else 0
            
            if std_dev == 0:
                return patterns
            
            threshold = mean_val + 2 * std_dev
            
            spikes = []
            for i, (value, timestamp) in enumerate(zip(values, timestamps)):
                if value > threshold:
                    spikes.append((i, value, timestamp))
            
            if spikes:
                pattern = Pattern(
                    id=f"spike_{metrics[0].component}_{int(time.time())}",
                    name=f"Spike pattern in {metrics[0].component}",
                    pattern_type="spike",
                    frequency=len(spikes) / len(values),
                    confidence=min(1.0, len(spikes) / max(1, len(values) * 0.1)),
                    components=[metrics[0].component],
                    time_range=(timestamps[0], timestamps[-1]),
                    characteristics={
                        "spike_count": len(spikes),
                        "max_spike": max(s[1] for s in spikes),
                        "threshold": threshold,
                        "baseline": mean_val
                    }
                )
                patterns.append(pattern)
        
        except Exception as e:
            logger.warning(f"Error detecting spike patterns: {e}")
        
        return patterns
    
    def _detect_correlation_patterns(self, metrics: List[MetricData]) -> List[Pattern]:
        """상관관계 패턴 탐지"""
        patterns = []
        
        # 메트릭 이름별로 그룹화
        by_metric = defaultdict(list)
        for metric in metrics:
            by_metric[metric.name].append(metric)
        
        metric_names = list(by_metric.keys())
        
        # 두 메트릭 간 상관관계 분석
        for i in range(len(metric_names)):
            for j in range(i + 1, len(metric_names)):
                metric1_name = metric_names[i]
                metric2_name = metric_names[j]
                
                values1 = [m.value for m in by_metric[metric1_name]]
                values2 = [m.value for m in by_metric[metric2_name]]
                
                # 길이 맞춤
                min_len = min(len(values1), len(values2))
                if min_len < 3:
                    continue
                
                values1 = values1[:min_len]
                values2 = values2[:min_len]
                
                # 간단한 상관계수 계산
                try:
                    correlation = self._calculate_correlation(values1, values2)
                    
                    if abs(correlation) > 0.7:  # 강한 상관관계
                        pattern = Pattern(
                            id=f"correlation_{metric1_name}_{metric2_name}_{int(time.time())}",
                            name=f"Correlation between {metric1_name} and {metric2_name}",
                            pattern_type="correlation",
                            frequency=1.0,
                            confidence=abs(correlation),
                            components=[metrics[0].component],
                            time_range=(metrics[0].timestamp, metrics[-1].timestamp),
                            characteristics={
                                "correlation_coefficient": correlation,
                                "metric1": metric1_name,
                                "metric2": metric2_name,
                                "relationship": "positive" if correlation > 0 else "negative"
                            }
                        )
                        patterns.append(pattern)
                
                except Exception as e:
                    logger.warning(f"Error calculating correlation: {e}")
        
        return patterns
    
    def _calculate_correlation(self, values1: List[float], values2: List[float]) -> float:
        """상관계수 계산"""
        if len(values1) != len(values2) or len(values1) < 2:
            return 0.0
        
        mean1 = sum(values1) / len(values1)
        mean2 = sum(values2) / len(values2)
        
        numerator = sum((v1 - mean1) * (v2 - mean2) for v1, v2 in zip(values1, values2))
        
        sum_sq1 = sum((v1 - mean1) ** 2 for v1 in values1)
        sum_sq2 = sum((v2 - mean2) ** 2 for v2 in values2)
        
        denominator = (sum_sq1 * sum_sq2) ** 0.5
        
        if denominator == 0:
            return 0.0
        
        return numerator / denominator


# 인과관계 분석기
class CausalityAnalyzer:
    """인과관계 분석기"""
    
    def __init__(self):
        self.causal_graph = nx.DiGraph()
        self.causal_rules = []
    
    def analyze_cascade_effects(self, issue: Issue, 
                              system_graph: nx.Graph) -> List[CascadeEffect]:
        """연쇄 효과 분석"""
        cascade_effects = []
        
        for affected_component in issue.affected_components:
            if affected_component not in system_graph:
                continue
            
            # 의존성 그래프에서 영향을 받을 수 있는 컴포넌트들 찾기
            affected_paths = []
            
            try:
                # BFS로 영향 전파 경로 탐색
                queue = deque([(affected_component, [affected_component], 0)])
                visited = set()
                max_depth = 5  # 최대 5단계까지만 추적
                
                while queue:
                    current, path, depth = queue.popleft()
                    
                    if current in visited or depth >= max_depth:
                        continue
                    
                    visited.add(current)
                    
                    # 현재 노드의 이웃들 (의존하는 컴포넌트들)
                    for neighbor in system_graph.neighbors(current):
                        if neighbor not in visited:
                            new_path = path + [neighbor]
                            affected_paths.append(new_path)
                            queue.append((neighbor, new_path, depth + 1))
                
                # 각 경로에 대해 연쇄 효과 생성
                for path in affected_paths[:10]:  # 최대 10개 경로만
                    if len(path) > 1:
                        cascade_effect = CascadeEffect(
                            trigger_component=affected_component,
                            trigger_event=issue.title,
                            affected_path=path,
                            impact_severity=max(0.1, 1.0 / len(path)),  # 경로가 길수록 영향 감소
                            propagation_time=timedelta(minutes=len(path) * 2),  # 추정 전파 시간
                            mitigation_strategies=self._generate_mitigation_strategies(path)
                        )
                        cascade_effects.append(cascade_effect)
            
            except Exception as e:
                logger.warning(f"Error analyzing cascade effects: {e}")
        
        return cascade_effects
    
    def _generate_mitigation_strategies(self, path: List[str]) -> List[str]:
        """완화 전략 생성"""
        strategies = []
        
        # 경로 길이에 따른 전략
        if len(path) <= 2:
            strategies.append("Direct component isolation")
            strategies.append("Immediate failover activation")
        elif len(path) <= 4:
            strategies.append("Circuit breaker implementation")
            strategies.append("Load balancer reconfiguration")
            strategies.append("Graceful degradation")
        else:
            strategies.append("Distributed fallback mechanisms")
            strategies.append("Cross-region failover")
            strategies.append("Service mesh traffic management")
        
        # 공통 전략
        strategies.extend([
            "Real-time monitoring enhancement",
            "Automated recovery procedures",
            "Dependency injection optimization"
        ])
        
        return strategies
    
    def build_causal_relationships(self, logs: List[LogEntry], 
                                 time_window: timedelta = timedelta(minutes=5)) -> Dict[str, List[str]]:
        """로그 기반 인과관계 구축"""
        causal_map = defaultdict(list)
        
        # 시간순으로 정렬
        sorted_logs = sorted(logs, key=lambda x: x.timestamp)
        
        for i, log in enumerate(sorted_logs):
            # 에러 로그인 경우
            if log.level.lower() in ['error', 'critical', 'fatal']:
                # 시간 윈도우 내의 후속 로그들 확인
                for j in range(i + 1, len(sorted_logs)):
                    next_log = sorted_logs[j]
                    
                    if next_log.timestamp - log.timestamp > time_window:
                        break
                    
                    # 다른 컴포넌트의 에러인 경우 인과관계 가능성
                    if (next_log.component != log.component and 
                        next_log.level.lower() in ['error', 'warning', 'critical']):
                        
                        causal_key = f"{log.component}->{next_log.component}"
                        causal_map[causal_key].append({
                            'trigger': log.message,
                            'effect': next_log.message,
                            'time_diff': (next_log.timestamp - log.timestamp).total_seconds()
                        })
        
        return dict(causal_map)


# 성능 예측기
class PerformancePredictor:
    """성능 예측기"""
    
    def __init__(self):
        self.prediction_models = {}
        self.trend_cache = {}
    
    def predict_future_bottlenecks(self, trend_data: List[TrendData], 
                                 prediction_horizon: timedelta = timedelta(hours=24)) -> List[PredictedBottleneck]:
        """미래 병목 지점 예측"""
        predicted_bottlenecks = []
        
        for trend in trend_data:
            if trend.trend_direction == 'increasing' and trend.trend_strength > 0.7:
                # 증가 추세가 강한 경우 병목 예측
                bottleneck = self._predict_resource_saturation(trend, prediction_horizon)
                if bottleneck:
                    predicted_bottlenecks.append(bottleneck)
        
        return predicted_bottlenecks
    
    def _predict_resource_saturation(self, trend: TrendData, 
                                   horizon: timedelta) -> Optional[PredictedBottleneck]:
        """리소스 포화 시점 예측"""
        if len(trend.values) < 3:
            return None
        
        try:
            # 선형 회귀 기반 간단한 예측
            x_values = list(range(len(trend.values)))
            y_values = trend.values
            
            # 최소제곱법으로 기울기 계산
            n = len(x_values)
            sum_x = sum(x_values)
            sum_y = sum(y_values)
            sum_xy = sum(x * y for x, y in zip(x_values, y_values))
            sum_x2 = sum(x * x for x in x_values)
            
            if n * sum_x2 - sum_x * sum_x == 0:
                return None
            
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
            intercept = (sum_y - slope * sum_x) / n
            
            # 현재 값에서 100% 사용률까지의 시간 계산
            current_value = y_values[-1]
            saturation_threshold = 100.0  # 100% 사용률 가정
            
            if slope <= 0 or current_value >= saturation_threshold:
                return None
            
            time_to_saturation = (saturation_threshold - current_value) / slope
            
            # 시간 단위로 변환 (데이터 포인트 간격을 가정)
            time_interval = timedelta(minutes=5)  # 5분 간격 가정
            predicted_time = datetime.now() + time_interval * time_to_saturation
            
            # 예측 시간이 호라이즌 내에 있는 경우만 반환
            if predicted_time <= datetime.now() + horizon:
                confidence = min(1.0, trend.trend_strength)
                
                return PredictedBottleneck(
                    component=trend.component,
                    resource=trend.metric,
                    predicted_time=predicted_time,
                    confidence=confidence,
                    leading_indicators=[
                        f"Increasing {trend.metric} trend",
                        f"Current utilization: {current_value:.1f}%",
                        f"Growth rate: {slope:.2f}%/interval"
                    ],
                    prevention_strategies=[
                        "Scale out resources",
                        "Optimize resource usage",
                        "Implement load balancing",
                        "Cache optimization",
                        "Database query optimization"
                    ]
                )
        
        except Exception as e:
            logger.warning(f"Error predicting saturation: {e}")
        
        return None
    
    def calculate_trend_data(self, metrics: List[MetricData]) -> List[TrendData]:
        """메트릭에서 트렌드 데이터 계산"""
        trend_data = []
        
        # 컴포넌트와 메트릭별로 그룹화
        by_component_metric = defaultdict(list)
        for metric in metrics:
            key = f"{metric.component}:{metric.name}"
            by_component_metric[key].append(metric)
        
        for key, metric_list in by_component_metric.items():
            component, metric_name = key.split(':', 1)
            
            # 시간순 정렬
            metric_list.sort(key=lambda x: x.timestamp)
            
            if len(metric_list) < 3:
                continue
            
            values = [m.value for m in metric_list]
            timestamps = [m.timestamp for m in metric_list]
            
            # 트렌드 방향 계산
            trend_direction, trend_strength = self._calculate_trend_direction(values)
            
            trend = TrendData(
                metric=metric_name,
                component=component,
                values=values,
                timestamps=timestamps,
                trend_direction=trend_direction,
                trend_strength=trend_strength
            )
            trend_data.append(trend)
        
        return trend_data
    
    def _calculate_trend_direction(self, values: List[float]) -> Tuple[str, float]:
        """트렌드 방향과 강도 계산"""
        if len(values) < 2:
            return 'stable', 0.0
        
        # 첫 번째와 마지막 값 비교
        start_value = values[0]
        end_value = values[-1]
        
        if start_value == 0:
            return 'stable', 0.0
        
        change_rate = (end_value - start_value) / start_value
        
        # 변화율 기준으로 방향 결정
        if abs(change_rate) < 0.05:  # 5% 미만 변화
            return 'stable', abs(change_rate)
        elif change_rate > 0:
            return 'increasing', min(1.0, change_rate)
        else:
            return 'decreasing', min(1.0, abs(change_rate))


# 병목 식별기
class BottleneckIdentifier:
    """병목 식별기"""
    
    def __init__(self):
        self.bottleneck_cache = {}
        self.threshold_config = {
            'cpu_threshold': 80.0,
            'memory_threshold': 85.0,
            'disk_threshold': 90.0,
            'network_threshold': 80.0,
            'queue_depth_threshold': 100,
            'response_time_threshold': 5.0  # seconds
        }
    
    def identify_current_bottlenecks(self, components: List[SystemComponent]) -> List[BottleneckInfo]:
        """현재 병목 지점 식별"""
        bottlenecks = []
        
        for component in components:
            component_bottlenecks = self._analyze_component_bottlenecks(component)
            bottlenecks.extend(component_bottlenecks)
        
        # 심각도 순으로 정렬
        bottlenecks.sort(key=lambda x: x.utilization, reverse=True)
        
        return bottlenecks
    
    def _analyze_component_bottlenecks(self, component: SystemComponent) -> List[BottleneckInfo]:
        """컴포넌트별 병목 분석"""
        bottlenecks = []
        
        # 최근 메트릭만 사용 (예: 최근 10분)
        recent_metrics = [
            m for m in component.metrics 
            if datetime.now() - m.timestamp < timedelta(minutes=10)
        ]
        
        # 메트릭별로 그룹화
        by_metric = defaultdict(list)
        for metric in recent_metrics:
            by_metric[metric.name].append(metric.value)
        
        for metric_name, values in by_metric.items():
            if not values:
                continue
            
            avg_value = sum(values) / len(values)
            max_value = max(values)
            
            # 임계값 확인
            bottleneck_info = self._check_bottleneck_thresholds(
                component.id, metric_name, avg_value, max_value, values
            )
            
            if bottleneck_info:
                bottlenecks.append(bottleneck_info)
        
        return bottlenecks
    
    def _check_bottleneck_thresholds(self, component_id: str, metric_name: str, 
                                   avg_value: float, max_value: float, 
                                   values: List[float]) -> Optional[BottleneckInfo]:
        """임계값 기반 병목 확인"""
        threshold_map = {
            'cpu_usage': self.threshold_config['cpu_threshold'],
            'memory_usage': self.threshold_config['memory_threshold'],
            'disk_usage': self.threshold_config['disk_threshold'],
            'network_usage': self.threshold_config['network_threshold'],
            'queue_depth': self.threshold_config['queue_depth_threshold'],
            'response_time': self.threshold_config['response_time_threshold']
        }
        
        # 메트릭 이름에서 임계값 찾기
        threshold = None
        for key, value in threshold_map.items():
            if key in metric_name.lower():
                threshold = value
                break
        
        if threshold is None:
            return None
        
        # 임계값 초과 확인
        if avg_value > threshold or max_value > threshold * 1.2:
            # 큐 깊이 계산 (단순화)
            queue_depth = int(max(0, (avg_value - threshold) / 10))
            
            # 대기 시간 추정
            wait_time = max(0.0, (avg_value - threshold) / 100.0)
            
            # 처리량 영향 추정
            throughput_impact = min(1.0, (avg_value - threshold) / threshold)
            
            return BottleneckInfo(
                component=component_id,
                resource=metric_name,
                utilization=avg_value,
                queue_depth=queue_depth,
                wait_time=wait_time,
                throughput_impact=throughput_impact,
                predicted_saturation=self._predict_saturation_time(values, threshold)
            )
        
        return None
    
    def _predict_saturation_time(self, values: List[float], threshold: float) -> Optional[datetime]:
        """포화 시점 예측"""
        if len(values) < 3:
            return None
        
        try:
            # 최근 트렌드 기반 예측
            recent_values = values[-5:] if len(values) >= 5 else values
            if len(recent_values) < 2:
                return None
            
            # 평균 증가율 계산
            increases = []
            for i in range(1, len(recent_values)):
                if recent_values[i-1] > 0:
                    increase = (recent_values[i] - recent_values[i-1]) / recent_values[i-1]
                    increases.append(increase)
            
            if not increases:
                return None
            
            avg_increase_rate = sum(increases) / len(increases)
            
            if avg_increase_rate <= 0:
                return None
            
            # 100% 포화까지의 시간 계산
            current_value = values[-1]
            remaining = 100.0 - current_value
            
            if remaining <= 0:
                return datetime.now()
            
            # 시간 간격을 5분으로 가정
            intervals_to_saturation = remaining / (current_value * avg_increase_rate)
            time_to_saturation = timedelta(minutes=5 * intervals_to_saturation)
            
            return datetime.now() + time_to_saturation
        
        except Exception as e:
            logger.warning(f"Error predicting saturation time: {e}")
            return None


# 메인 분석기 클래스
class HolisticSystemAnalyzer:
    """전체 시스템 통합 분석기"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.pattern_detector = PatternDetector()
        self.causality_analyzer = CausalityAnalyzer()
        self.performance_predictor = PerformancePredictor()
        self.bottleneck_identifier = BottleneckIdentifier()
        
        # 시스템 상태 캐시
        self.system_graph = nx.Graph()
        self.component_registry = {}
        self.analysis_cache = {}
        self.last_analysis_time = None
        
        # 설정
        self.analysis_interval = timedelta(minutes=5)
        self.cache_ttl = timedelta(minutes=10)
        
    async def analyze_system_health(self, unified_logs: List[LogEntry], 
                                  metrics: List[MetricData],
                                  components: List[SystemComponent]) -> SystemHealthReport:
        """전체 시스템 건강도 분석"""
        start_time = datetime.now()
        
        try:
            # 1. 시스템 그래프 업데이트
            self._update_system_graph(components)
            
            # 2. 패턴 탐지
            patterns = await self._detect_patterns_async(unified_logs, metrics)
            
            # 3. 이상 탐지
            anomalies = await self._detect_anomalies_async(metrics, components)
            
            # 4. 이슈 식별
            issues = await self._identify_issues_async(unified_logs, anomalies, components)
            
            # 5. 연쇄 효과 분석
            cascade_effects = await self._analyze_cascade_effects_async(issues)
            
            # 6. 병목 지점 식별
            bottlenecks = await self._identify_bottlenecks_async(components)
            
            # 7. 전체 건강도 평가
            overall_health, health_score = self._calculate_overall_health(
                components, issues, anomalies, bottlenecks
            )
            
            # 8. 권장사항 생성
            recommendations = await self._generate_recommendations_async(
                issues, bottlenecks, patterns, anomalies
            )
            
            # 결과 생성
            report = SystemHealthReport(
                overall_health=overall_health,
                health_score=health_score,
                timestamp=start_time,
                components=components,
                active_issues=issues,
                patterns=patterns,
                anomalies=anomalies,
                cascade_effects=cascade_effects,
                bottlenecks=bottlenecks,
                recommendations=recommendations
            )
            
            # 분석 결과 캐시
            self._cache_analysis_result(report)
            
            logger.info(f"System health analysis completed in {(datetime.now() - start_time).total_seconds():.2f}s")
            
            return report
            
        except Exception as e:
            logger.error(f"Error in system health analysis: {e}")
            # 기본 보고서 반환
            return SystemHealthReport(
                overall_health=HealthStatus.UNKNOWN,
                health_score=0.0,
                timestamp=start_time,
                components=components,
                active_issues=[],
                patterns=[],
                anomalies=[],
                cascade_effects=[],
                bottlenecks=[]
            )
    
    def _update_system_graph(self, components: List[SystemComponent]):
        """시스템 의존성 그래프 업데이트"""
        # 그래프 초기화
        self.system_graph.clear()
        
        # 컴포넌트 노드 추가
        for component in components:
            self.system_graph.add_node(
                component.id,
                name=component.name,
                type=component.type,
                health_status=component.health_status
            )
            self.component_registry[component.id] = component
        
        # 의존성 엣지 추가
        for component in components:
            for dependency in component.dependencies:
                if dependency in self.component_registry:
                    self.system_graph.add_edge(component.id, dependency)
    
    async def _detect_patterns_async(self, logs: List[LogEntry], 
                                   metrics: List[MetricData]) -> List[Pattern]:
        """비동기 패턴 탐지"""
        try:
            # 시간적 패턴 탐지
            temporal_patterns = self.pattern_detector.detect_temporal_patterns(metrics)
            
            # 로그 기반 패턴 탐지
            log_patterns = await self._detect_log_patterns_async(logs)
            
            return temporal_patterns + log_patterns
        
        except Exception as e:
            logger.error(f"Error detecting patterns: {e}")
            return []
    
    async def _detect_log_patterns_async(self, logs: List[LogEntry]) -> List[Pattern]:
        """로그 기반 패턴 탐지"""
        patterns = []
        
        try:
            # 에러 패턴 분석
            error_logs = [log for log in logs if log.level.lower() in ['error', 'critical', 'fatal']]
            
            if error_logs:
                # 에러 메시지 패턴 분석
                error_messages = [log.message for log in error_logs]
                error_counter = Counter(error_messages)
                
                # 반복되는 에러 패턴 식별
                for message, count in error_counter.most_common(10):
                    if count > 1:  # 2회 이상 발생한 에러
                        pattern = Pattern(
                            id=f"error_pattern_{hashlib.md5(message.encode()).hexdigest()[:8]}",
                            name=f"Recurring error pattern",
                            pattern_type="error_recurrence",
                            frequency=count / len(error_logs),
                            confidence=min(1.0, count / max(1, len(error_logs) * 0.1)),
                            components=list(set(log.component for log in error_logs if log.message == message)),
                            time_range=(
                                min(log.timestamp for log in error_logs if log.message == message),
                                max(log.timestamp for log in error_logs if log.message == message)
                            ),
                            characteristics={
                                "error_message": message[:200],  # 메시지 일부만 저장
                                "occurrence_count": count,
                                "affected_components": list(set(log.component for log in error_logs if log.message == message))
                            }
                        )
                        patterns.append(pattern)
        
        except Exception as e:
            logger.error(f"Error detecting log patterns: {e}")
        
        return patterns
    
    async def _detect_anomalies_async(self, metrics: List[MetricData], 
                                    components: List[SystemComponent]) -> List[Anomaly]:
        """비동기 이상 탐지"""
        anomalies = []
        
        try:
            # 컴포넌트별로 메트릭 그룹화
            by_component = defaultdict(list)
            for metric in metrics:
                by_component[metric.component].append(metric)
            
            for component_id, component_metrics in by_component.items():
                component_anomalies = await self._detect_component_anomalies_async(
                    component_id, component_metrics
                )
                anomalies.extend(component_anomalies)
        
        except Exception as e:
            logger.error(f"Error detecting anomalies: {e}")
        
        return anomalies
    
    async def _detect_component_anomalies_async(self, component_id: str, 
                                              metrics: List[MetricData]) -> List[Anomaly]:
        """컴포넌트별 이상 탐지"""
        anomalies = []
        
        try:
            # 메트릭 이름별로 그룹화
            by_metric = defaultdict(list)
            for metric in metrics:
                by_metric[metric.name].append(metric)
            
            for metric_name, metric_list in by_metric.items():
                if len(metric_list) < 5:  # 최소 5개 데이터 포인트 필요
                    continue
                
                # 시간순 정렬
                metric_list.sort(key=lambda x: x.timestamp)
                values = [m.value for m in metric_list]
                
                # 통계적 이상 탐지 (Z-score 기반)
                if len(values) >= 3:
                    mean_val = statistics.mean(values)
                    std_dev = statistics.stdev(values) if len(values) > 1 else 0
                    
                    if std_dev > 0:
                        # 최근 값의 Z-score 계산
                        recent_value = values[-1]
                        z_score = abs(recent_value - mean_val) / std_dev
                        
                        # Z-score > 2 (95% 신뢰구간 벗어남)
                        if z_score > 2.0:
                            anomaly = Anomaly(
                                id=f"anomaly_{component_id}_{metric_name}_{int(time.time())}",
                                component=component_id,
                                metric=metric_name,
                                detected_at=metric_list[-1].timestamp,
                                anomaly_score=min(1.0, z_score / 3.0),  # 정규화
                                expected_value=mean_val,
                                actual_value=recent_value,
                                context={
                                    "z_score": z_score,
                                    "std_dev": std_dev,
                                    "threshold": mean_val + 2 * std_dev,
                                    "deviation_type": "high" if recent_value > mean_val else "low"
                                }
                            )
                            anomalies.append(anomaly)
        
        except Exception as e:
            logger.warning(f"Error detecting component anomalies: {e}")
        
        return anomalies
    
    async def _identify_issues_async(self, logs: List[LogEntry], 
                                   anomalies: List[Anomaly],
                                   components: List[SystemComponent]) -> List[Issue]:
        """비동기 이슈 식별"""
        issues = []
        
        try:
            # 1. 로그 기반 이슈 식별
            log_issues = await self._identify_log_issues_async(logs)
            issues.extend(log_issues)
            
            # 2. 이상 현상 기반 이슈 식별
            anomaly_issues = await self._identify_anomaly_issues_async(anomalies)
            issues.extend(anomaly_issues)
            
            # 3. 컴포넌트 상태 기반 이슈 식별
            component_issues = await self._identify_component_issues_async(components)
            issues.extend(component_issues)
            
            # 중복 제거 및 통합
            issues = self._deduplicate_issues(issues)
        
        except Exception as e:
            logger.error(f"Error identifying issues: {e}")
        
        return issues
    
    async def _identify_log_issues_async(self, logs: List[LogEntry]) -> List[Issue]:
        """로그 기반 이슈 식별"""
        issues = []
        
        try:
            # 에러 로그 분석
            error_logs = [log for log in logs if log.level.lower() in ['error', 'critical', 'fatal']]
            
            # 컴포넌트별 에러 그룹화
            by_component = defaultdict(list)
            for log in error_logs:
                by_component[log.component].append(log)
            
            for component, component_errors in by_component.items():
                if len(component_errors) >= 3:  # 3개 이상의 에러
                    # 에러 메시지 분석
                    error_messages = [log.message for log in component_errors]
                    unique_errors = set(error_messages)
                    
                    # 심각도 계산
                    critical_count = sum(1 for log in component_errors if log.level.lower() == 'critical')
                    error_count = len(component_errors)
                    
                    if critical_count > 0:
                        severity = SeverityLevel.CRITICAL
                    elif error_count > 10:
                        severity = SeverityLevel.HIGH
                    elif error_count > 5:
                        severity = SeverityLevel.MEDIUM
                    else:
                        severity = SeverityLevel.LOW
                    
                    issue = Issue(
                        id=f"log_issue_{component}_{int(time.time())}",
                        type=IssueType.AVAILABILITY,
                        severity=severity,
                        title=f"Multiple errors in {component}",
                        description=f"Detected {error_count} errors ({critical_count} critical) in {component}",
                        affected_components=[component],
                        first_detected=min(log.timestamp for log in component_errors),
                        last_seen=max(log.timestamp for log in component_errors),
                        symptoms=[
                            f"{len(unique_errors)} unique error types",
                            f"{error_count} total errors",
                            f"{critical_count} critical errors"
                        ],
                        related_logs=component_errors[:10]  # 최대 10개 로그만 저장
                    )
                    issues.append(issue)
        
        except Exception as e:
            logger.warning(f"Error identifying log issues: {e}")
        
        return issues
    
    async def _identify_anomaly_issues_async(self, anomalies: List[Anomaly]) -> List[Issue]:
        """이상 현상 기반 이슈 식별"""
        issues = []
        
        try:
            # 컴포넌트별 이상 현상 그룹화
            by_component = defaultdict(list)
            for anomaly in anomalies:
                by_component[anomaly.component].append(anomaly)
            
            for component, component_anomalies in by_component.items():
                if len(component_anomalies) >= 2:  # 2개 이상의 이상 현상
                    avg_anomaly_score = sum(a.anomaly_score for a in component_anomalies) / len(component_anomalies)
                    
                    # 심각도 결정
                    if avg_anomaly_score > 0.8:
                        severity = SeverityLevel.CRITICAL
                    elif avg_anomaly_score > 0.6:
                        severity = SeverityLevel.HIGH
                    elif avg_anomaly_score > 0.4:
                        severity = SeverityLevel.MEDIUM
                    else:
                        severity = SeverityLevel.LOW
                    
                    issue = Issue(
                        id=f"anomaly_issue_{component}_{int(time.time())}",
                        type=IssueType.PERFORMANCE,
                        severity=severity,
                        title=f"Performance anomalies in {component}",
                        description=f"Detected {len(component_anomalies)} performance anomalies",
                        affected_components=[component],
                        first_detected=min(a.detected_at for a in component_anomalies),
                        last_seen=max(a.detected_at for a in component_anomalies),
                        symptoms=[
                            f"Average anomaly score: {avg_anomaly_score:.2f}",
                            f"Affected metrics: {', '.join(set(a.metric for a in component_anomalies))}"
                        ]
                    )
                    issues.append(issue)
        
        except Exception as e:
            logger.warning(f"Error identifying anomaly issues: {e}")
        
        return issues
    
    async def _identify_component_issues_async(self, components: List[SystemComponent]) -> List[Issue]:
        """컴포넌트 상태 기반 이슈 식별"""
        issues = []
        
        try:
            for component in components:
                if component.health_status in [HealthStatus.CRITICAL, HealthStatus.WARNING]:
                    severity = SeverityLevel.CRITICAL if component.health_status == HealthStatus.CRITICAL else SeverityLevel.MEDIUM
                    
                    issue = Issue(
                        id=f"component_issue_{component.id}_{int(time.time())}",
                        type=IssueType.AVAILABILITY,
                        severity=severity,
                        title=f"Component health issue: {component.name}",
                        description=f"Component {component.name} is in {component.health_status.value} state",
                        affected_components=[component.id],
                        first_detected=component.last_updated,
                        last_seen=component.last_updated,
                        symptoms=[f"Health status: {component.health_status.value}"]
                    )
                    issues.append(issue)
        
        except Exception as e:
            logger.warning(f"Error identifying component issues: {e}")
        
        return issues
    
    def _deduplicate_issues(self, issues: List[Issue]) -> List[Issue]:
        """이슈 중복 제거"""
        seen = set()
        deduplicated = []
        
        for issue in issues:
            # 컴포넌트와 타입 기반 키 생성
            key = f"{sorted(issue.affected_components)}_{issue.type.value}"
            
            if key not in seen:
                seen.add(key)
                deduplicated.append(issue)
        
        return deduplicated
    
    async def _analyze_cascade_effects_async(self, issues: List[Issue]) -> List[CascadeEffect]:
        """비동기 연쇄 효과 분석"""
        cascade_effects = []
        
        try:
            for issue in issues:
                effects = self.causality_analyzer.analyze_cascade_effects(issue, self.system_graph)
                cascade_effects.extend(effects)
        
        except Exception as e:
            logger.error(f"Error analyzing cascade effects: {e}")
        
        return cascade_effects
    
    async def _identify_bottlenecks_async(self, components: List[SystemComponent]) -> List[BottleneckInfo]:
        """비동기 병목 식별"""
        try:
            return self.bottleneck_identifier.identify_current_bottlenecks(components)
        except Exception as e:
            logger.error(f"Error identifying bottlenecks: {e}")
            return []
    
    def _calculate_overall_health(self, components: List[SystemComponent], 
                                issues: List[Issue], anomalies: List[Anomaly],
                                bottlenecks: List[BottleneckInfo]) -> Tuple[HealthStatus, float]:
        """전체 건강도 계산"""
        try:
            # 컴포넌트 건강도 점수
            component_scores = []
            for component in components:
                if component.health_status == HealthStatus.HEALTHY:
                    component_scores.append(1.0)
                elif component.health_status == HealthStatus.WARNING:
                    component_scores.append(0.7)
                elif component.health_status == HealthStatus.CRITICAL:
                    component_scores.append(0.3)
                else:
                    component_scores.append(0.5)  # UNKNOWN
            
            base_score = sum(component_scores) / len(component_scores) if component_scores else 0.5
            
            # 이슈 패널티
            issue_penalty = 0
            for issue in issues:
                if issue.severity == SeverityLevel.CRITICAL:
                    issue_penalty += 0.3
                elif issue.severity == SeverityLevel.HIGH:
                    issue_penalty += 0.2
                elif issue.severity == SeverityLevel.MEDIUM:
                    issue_penalty += 0.1
                else:
                    issue_penalty += 0.05
            
            # 이상 현상 패널티
            anomaly_penalty = len(anomalies) * 0.05
            
            # 병목 패널티
            bottleneck_penalty = len(bottlenecks) * 0.1
            
            # 최종 점수 계산
            final_score = max(0.0, base_score - issue_penalty - anomaly_penalty - bottleneck_penalty)
            
            # 건강도 상태 결정
            if final_score >= 0.8:
                health_status = HealthStatus.HEALTHY
            elif final_score >= 0.6:
                health_status = HealthStatus.WARNING
            elif final_score >= 0.3:
                health_status = HealthStatus.CRITICAL
            else:
                health_status = HealthStatus.CRITICAL
            
            return health_status, final_score
        
        except Exception as e:
            logger.error(f"Error calculating overall health: {e}")
            return HealthStatus.UNKNOWN, 0.0
    
    async def _generate_recommendations_async(self, issues: List[Issue], 
                                            bottlenecks: List[BottleneckInfo],
                                            patterns: List[Pattern],
                                            anomalies: List[Anomaly]) -> List[str]:
        """비동기 권장사항 생성"""
        recommendations = []
        
        try:
            # 이슈 기반 권장사항
            for issue in issues[:5]:  # 최대 5개 이슈
                if issue.severity in [SeverityLevel.CRITICAL, SeverityLevel.HIGH]:
                    if issue.type == IssueType.PERFORMANCE:
                        recommendations.append(f"Performance optimization needed for {', '.join(issue.affected_components)}")
                    elif issue.type == IssueType.AVAILABILITY:
                        recommendations.append(f"Investigate availability issues in {', '.join(issue.affected_components)}")
                    elif issue.type == IssueType.CAPACITY:
                        recommendations.append(f"Scale resources for {', '.join(issue.affected_components)}")
            
            # 병목 기반 권장사항
            for bottleneck in bottlenecks[:3]:  # 최대 3개 병목
                if bottleneck.utilization > 90:
                    recommendations.append(f"Critical: Scale {bottleneck.resource} in {bottleneck.component}")
                elif bottleneck.utilization > 80:
                    recommendations.append(f"Consider scaling {bottleneck.resource} in {bottleneck.component}")
            
            # 패턴 기반 권장사항
            for pattern in patterns:
                if pattern.pattern_type == "spike" and pattern.confidence > 0.7:
                    recommendations.append(f"Implement spike protection for {', '.join(pattern.components)}")
                elif pattern.pattern_type == "periodic" and pattern.confidence > 0.8:
                    recommendations.append(f"Optimize for periodic load in {', '.join(pattern.components)}")
            
            # 이상 현상 기반 권장사항
            anomaly_components = list(set(a.component for a in anomalies))
            if len(anomaly_components) > 2:
                recommendations.append(f"Investigate system-wide performance issues affecting {len(anomaly_components)} components")
            
            # 일반적인 권장사항
            if not recommendations:
                recommendations.append("System appears healthy. Continue monitoring.")
        
        except Exception as e:
            logger.error(f"Error generating recommendations: {e}")
            recommendations = ["Error generating recommendations. Manual review recommended."]
        
        return recommendations[:10]  # 최대 10개 권장사항
    
    def _cache_analysis_result(self, report: SystemHealthReport):
        """분석 결과 캐시"""
        cache_key = f"health_report_{report.timestamp.isoformat()}"
        self.analysis_cache[cache_key] = {
            'report': report,
            'cached_at': datetime.now()
        }
        
        # 오래된 캐시 정리
        cutoff_time = datetime.now() - self.cache_ttl
        self.analysis_cache = {
            k: v for k, v in self.analysis_cache.items()
            if v['cached_at'] > cutoff_time
        }
        
        self.last_analysis_time = datetime.now()
    
    # 편의 메서드들
    async def identify_cascade_effects(self, issue: Issue) -> List[CascadeEffect]:
        """특정 이슈의 연쇄 효과 분석"""
        return self.causality_analyzer.analyze_cascade_effects(issue, self.system_graph)
    
    async def predict_future_bottlenecks(self, trend_data: List[TrendData],
                                       prediction_horizon: timedelta = timedelta(hours=24)) -> List[PredictedBottleneck]:
        """미래 병목 지점 예측"""
        return self.performance_predictor.predict_future_bottlenecks(trend_data, prediction_horizon)
    
    async def generate_optimization_roadmap(self, analysis: SystemHealthReport) -> OptimizationRoadmap:
        """최적화 로드맵 생성"""
        opportunities = []
        
        # 병목 기반 최적화 기회
        for bottleneck in analysis.bottlenecks:
            if bottleneck.utilization > 80:
                opportunity = OptimizationOpportunity(
                    type="resource_scaling",
                    title=f"Scale {bottleneck.resource} in {bottleneck.component}",
                    description=f"Resource utilization at {bottleneck.utilization:.1f}%",
                    expected_impact=min(1.0, (bottleneck.utilization - 50) / 50),
                    implementation_effort="Medium",
                    affected_components=[bottleneck.component]
                )
                opportunities.append(opportunity)
        
        # 이슈 기반 최적화 기회
        for issue in analysis.active_issues:
            if issue.severity in [SeverityLevel.CRITICAL, SeverityLevel.HIGH]:
                opportunity = OptimizationOpportunity(
                    type="issue_resolution",
                    title=f"Resolve {issue.type.value} issue",
                    description=issue.description,
                    expected_impact=0.8 if issue.severity == SeverityLevel.CRITICAL else 0.6,
                    implementation_effort="High" if issue.severity == SeverityLevel.CRITICAL else "Medium",
                    affected_components=issue.affected_components
                )
                opportunities.append(opportunity)
        
        # 우선순위 정렬 (영향도 기반)
        opportunities.sort(key=lambda x: x.expected_impact, reverse=True)
        priority_order = [opp.title for opp in opportunities]
        
        # 예상 타임라인
        estimated_timeline = {}
        for i, opp in enumerate(opportunities):
            if opp.implementation_effort == "Low":
                estimated_timeline[opp.title] = timedelta(days=1)
            elif opp.implementation_effort == "Medium":
                estimated_timeline[opp.title] = timedelta(weeks=1)
            else:
                estimated_timeline[opp.title] = timedelta(weeks=4)
        
        # 예상 결과
        expected_outcomes = {opp.title: opp.expected_impact for opp in opportunities}
        
        return OptimizationRoadmap(
            opportunities=opportunities,
            priority_order=priority_order,
            estimated_timeline=estimated_timeline,
            expected_outcomes=expected_outcomes
        )
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """시스템 분석기 메트릭 반환"""
        return {
            'components_tracked': len(self.component_registry),
            'graph_nodes': self.system_graph.number_of_nodes(),
            'graph_edges': self.system_graph.number_of_edges(),
            'cache_size': len(self.analysis_cache),
            'last_analysis': self.last_analysis_time.isoformat() if self.last_analysis_time else None,
            'analysis_interval': self.analysis_interval.total_seconds()
        }


# 팩토리 함수
def create_holistic_analyzer(config: Optional[Dict[str, Any]] = None) -> HolisticSystemAnalyzer:
    """홀리스틱 시스템 분석기 생성"""
    return HolisticSystemAnalyzer(config)


# 편의 함수들
async def analyze_system_health_quick(logs: List[LogEntry], 
                                    metrics: List[MetricData],
                                    components: List[SystemComponent]) -> SystemHealthReport:
    """빠른 시스템 건강도 분석"""
    analyzer = HolisticSystemAnalyzer()
    return await analyzer.analyze_system_health(logs, metrics, components)


def create_sample_system_data() -> Tuple[List[LogEntry], List[MetricData], List[SystemComponent]]:
    """샘플 시스템 데이터 생성 (테스트용)"""
    now = datetime.now()
    
    # 샘플 로그 엔트리
    logs = [
        LogEntry(
            timestamp=now - timedelta(minutes=5),
            source="application",
            component="web-server-1",
            level="ERROR",
            message="Database connection timeout",
            metadata={"error_code": "DB_TIMEOUT", "duration": 30},
            tags=["database", "timeout"]
        ),
        LogEntry(
            timestamp=now - timedelta(minutes=3),
            source="system",
            component="load-balancer",
            level="WARNING",
            message="High CPU usage detected",
            metadata={"cpu_usage": 85.2},
            tags=["performance", "cpu"]
        ),
        LogEntry(
            timestamp=now - timedelta(minutes=1),
            source="application",
            component="api-gateway",
            level="INFO",
            message="Request processed successfully",
            metadata={"response_time": 120, "status_code": 200},
            tags=["success", "api"]
        )
    ]
    
    # 샘플 메트릭 데이터
    metrics = []
    for i in range(20):
        timestamp = now - timedelta(minutes=i)
        
        # CPU 메트릭 (증가 추세)
        cpu_value = 60 + i * 2 + (i % 3) * 5  # 기본 60%에서 증가
        metrics.append(MetricData(
            name="cpu_usage",
            value=min(100, cpu_value),
            unit="percent",
            timestamp=timestamp,
            component="web-server-1",
            tags={"instance": "i-12345"}
        ))
        
        # 메모리 메트릭 (안정)
        memory_value = 75 + (i % 5) * 2  # 75% 주변에서 안정
        metrics.append(MetricData(
            name="memory_usage",
            value=memory_value,
            unit="percent",
            timestamp=timestamp,
            component="web-server-1",
            tags={"instance": "i-12345"}
        ))
        
        # 응답 시간 메트릭 (스파이크 패턴)
        response_time = 100 + (50 if i % 7 == 0 else 0) + (i % 3) * 10
        metrics.append(MetricData(
            name="response_time",
            value=response_time,
            unit="milliseconds",
            timestamp=timestamp,
            component="api-gateway",
            tags={"endpoint": "/api/v1/users"}
        ))
    
    # 샘플 시스템 컴포넌트
    components = [
        SystemComponent(
            id="web-server-1",
            name="Web Server 1",
            type=ComponentType.APPLICATION,
            health_status=HealthStatus.WARNING,
            dependencies=["database-1", "cache-1"],
            dependents=["load-balancer"],
            metrics=[m for m in metrics if m.component == "web-server-1"]
        ),
        SystemComponent(
            id="database-1",
            name="Primary Database",
            type=ComponentType.DATABASE,
            health_status=HealthStatus.HEALTHY,
            dependencies=[],
            dependents=["web-server-1", "api-gateway"],
            metrics=[]
        ),
        SystemComponent(
            id="cache-1",
            name="Redis Cache",
            type=ComponentType.CACHE,
            health_status=HealthStatus.HEALTHY,
            dependencies=[],
            dependents=["web-server-1"],
            metrics=[]
        ),
        SystemComponent(
            id="load-balancer",
            name="Load Balancer",
            type=ComponentType.LOAD_BALANCER,
            health_status=HealthStatus.WARNING,
            dependencies=["web-server-1"],
            dependents=[],
            metrics=[]
        ),
        SystemComponent(
            id="api-gateway",
            name="API Gateway",
            type=ComponentType.API_GATEWAY,
            health_status=HealthStatus.HEALTHY,
            dependencies=["database-1"],
            dependents=[],
            metrics=[m for m in metrics if m.component == "api-gateway"]
        )
    ]
    
    return logs, metrics, components


# 전역 인스턴스 관리
_global_analyzer = None
_analyzer_lock = threading.Lock()


def get_global_analyzer(config: Optional[Dict[str, Any]] = None) -> HolisticSystemAnalyzer:
    """전역 분석기 인스턴스 반환"""
    global _global_analyzer
    
    with _analyzer_lock:
        if _global_analyzer is None:
            _global_analyzer = HolisticSystemAnalyzer(config)
        return _global_analyzer


def reset_global_analyzer():
    """전역 분석기 리셋"""
    global _global_analyzer
    
    with _analyzer_lock:
        _global_analyzer = None


# 유틸리티 클래스들
class AnalysisScheduler:
    """분석 스케줄러"""
    
    def __init__(self, analyzer: HolisticSystemAnalyzer, interval: timedelta = timedelta(minutes=5)):
        self.analyzer = analyzer
        self.interval = interval
        self.running = False
        self.task = None
        
    async def start(self):
        """스케줄러 시작"""
        if self.running:
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_scheduler())
        logger.info(f"Analysis scheduler started with {self.interval.total_seconds()}s interval")
    
    async def stop(self):
        """스케줄러 중지"""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Analysis scheduler stopped")
    
    async def _run_scheduler(self):
        """스케줄러 실행 루프"""
        while self.running:
            try:
                # 여기서 실제 데이터 수집 로직이 들어가야 함
                # 현재는 샘플 데이터로 테스트
                logs, metrics, components = create_sample_system_data()
                
                # 분석 실행
                report = await self.analyzer.analyze_system_health(logs, metrics, components)
                
                # 결과 로깅
                logger.info(f"Scheduled analysis completed. Health: {report.overall_health.value}, Score: {report.health_score:.2f}")
                
                # 다음 분석까지 대기
                await asyncio.sleep(self.interval.total_seconds())
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduled analysis: {e}")
                await asyncio.sleep(60)  # 에러 시 1분 대기


class HealthReportExporter:
    """건강도 보고서 내보내기"""
    
    @staticmethod
    def to_json(report: SystemHealthReport, indent: int = 2) -> str:
        """JSON 형식으로 내보내기"""
        def default_serializer(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            elif isinstance(obj, timedelta):
                return obj.total_seconds()
            elif isinstance(obj, Enum):
                return obj.value
            elif hasattr(obj, '__dict__'):
                return obj.__dict__
            return str(obj)
        
        return json.dumps(report.__dict__, default=default_serializer, indent=indent, ensure_ascii=False)
    
    @staticmethod
    def to_summary(report: SystemHealthReport) -> str:
        """요약 형식으로 내보내기"""
        lines = [
            f"System Health Report - {report.timestamp.strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 60,
            f"Overall Health: {report.overall_health.value.upper()}",
            f"Health Score: {report.health_score:.2f}/1.0",
            "",
            f"Components: {len(report.components)}",
            f"Active Issues: {len(report.active_issues)}",
            f"Anomalies: {len(report.anomalies)}",
            f"Bottlenecks: {len(report.bottlenecks)}",
            f"Cascade Effects: {len(report.cascade_effects)}",
            ""
        ]
        
        if report.active_issues:
            lines.append("Critical Issues:")
            for issue in report.active_issues[:5]:
                lines.append(f"  - {issue.title} ({issue.severity.name})")
            lines.append("")
        
        if report.bottlenecks:
            lines.append("Top Bottlenecks:")
            for bottleneck in report.bottlenecks[:3]:
                lines.append(f"  - {bottleneck.component}: {bottleneck.resource} at {bottleneck.utilization:.1f}%")
            lines.append("")
        
        if report.recommendations:
            lines.append("Recommendations:")
            for rec in report.recommendations[:5]:
                lines.append(f"  - {rec}")
        
        return "\n".join(lines)
    
    @staticmethod
    def to_html(report: SystemHealthReport) -> str:
        """HTML 형식으로 내보내기"""
        health_color = {
            HealthStatus.HEALTHY: "green",
            HealthStatus.WARNING: "orange", 
            HealthStatus.CRITICAL: "red",
            HealthStatus.UNKNOWN: "gray"
        }.get(report.overall_health, "gray")
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>System Health Report</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .health-status {{ color: {health_color}; font-weight: bold; }}
                .metric {{ margin: 10px 0; }}
                .issue {{ background: #ffebee; padding: 10px; margin: 5px 0; border-left: 4px solid #f44336; }}
                .warning {{ background: #fff3e0; border-left-color: #ff9800; }}
                .success {{ background: #e8f5e8; border-left-color: #4caf50; }}
                table {{ border-collapse: collapse; width: 100%; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; }}
            </style>
        </head>
        <body>
            <h1>System Health Report</h1>
            <p><strong>Generated:</strong> {report.timestamp.strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p><strong>Overall Health:</strong> <span class="health-status">{report.overall_health.value.upper()}</span></p>
            <p><strong>Health Score:</strong> {report.health_score:.2f}/1.0</p>
            
            <h2>Summary</h2>
            <div class="metric">Components: {len(report.components)}</div>
            <div class="metric">Active Issues: {len(report.active_issues)}</div>
            <div class="metric">Anomalies: {len(report.anomalies)}</div>
            <div class="metric">Bottlenecks: {len(report.bottlenecks)}</div>
        """
        
        if report.active_issues:
            html += "<h2>Active Issues</h2>"
            for issue in report.active_issues:
                severity_class = "issue" if issue.severity == SeverityLevel.CRITICAL else "warning"
                html += f'<div class="{severity_class}"><strong>{issue.title}</strong><br>{issue.description}</div>'
        
        if report.bottlenecks:
            html += "<h2>Bottlenecks</h2><table><tr><th>Component</th><th>Resource</th><th>Utilization</th></tr>"
            for bottleneck in report.bottlenecks:
                html += f"<tr><td>{bottleneck.component}</td><td>{bottleneck.resource}</td><td>{bottleneck.utilization:.1f}%</td></tr>"
            html += "</table>"
        
        if report.recommendations:
            html += "<h2>Recommendations</h2><ul>"
            for rec in report.recommendations:
                html += f"<li>{rec}</li>"
            html += "</ul>"
        
        html += "</body></html>"
        return html


# 메인 실행 부분 (테스트용)
async def main():
    """메인 함수 (데모 및 테스트용)"""
    print("🔍 Holistic System Analyzer Demo")
    print("=" * 50)
    
    try:
        # 분석기 생성
        analyzer = HolisticSystemAnalyzer()
        
        # 샘플 데이터 생성
        print("📊 Generating sample system data...")
        logs, metrics, components = create_sample_system_data()
        
        print(f"  - Logs: {len(logs)}")
        print(f"  - Metrics: {len(metrics)}")
        print(f"  - Components: {len(components)}")
        
        # 시스템 분석 실행
        print("\n🔍 Analyzing system health...")
        start_time = time.time()
        
        report = await analyzer.analyze_system_health(logs, metrics, components)
        
        analysis_time = time.time() - start_time
        print(f"  ✅ Analysis completed in {analysis_time:.2f}s")
        
        # 결과 출력
        print("\n📋 Analysis Results:")
        print(f"  Overall Health: {report.overall_health.value.upper()}")
        print(f"  Health Score: {report.health_score:.2f}/1.0")
        print(f"  Issues Found: {len(report.active_issues)}")
        print(f"  Anomalies: {len(report.anomalies)}")
        print(f"  Bottlenecks: {len(report.bottlenecks)}")
        print(f"  Patterns: {len(report.patterns)}")
        
        # 상세 정보
        if report.active_issues:
            print("\n🚨 Active Issues:")
            for issue in report.active_issues[:3]:
                print(f"  - {issue.title} ({issue.severity.name})")
        
        if report.bottlenecks:
            print("\n⚠️  Bottlenecks:")
            for bottleneck in report.bottlenecks[:3]:
                print(f"  - {bottleneck.component}: {bottleneck.resource} at {bottleneck.utilization:.1f}%")
        
        if report.recommendations:
            print("\n💡 Recommendations:")
            for rec in report.recommendations[:3]:
                print(f"  - {rec}")
        
        # 최적화 로드맵 생성
        print("\n🗺️  Generating optimization roadmap...")
        roadmap = await analyzer.generate_optimization_roadmap(report)
        
        if roadmap.opportunities:
            print(f"  Found {len(roadmap.opportunities)} optimization opportunities")
            print("  Top priorities:")
            for opp in roadmap.opportunities[:3]:
                print(f"    - {opp.title} (Impact: {opp.expected_impact:.2f})")
        
        # 트렌드 데이터 분석
        print("\n📈 Analyzing trends...")
        trend_data = analyzer.performance_predictor.calculate_trend_data(metrics)
        
        if trend_data:
            print(f"  Analyzed {len(trend_data)} trend patterns")
            for trend in trend_data[:3]:
                print(f"    - {trend.component}:{trend.metric} trending {trend.trend_direction} (strength: {trend.trend_strength:.2f})")
        
        # 미래 병목 예측
        print("\n🔮 Predicting future bottlenecks...")
        predicted_bottlenecks = await analyzer.predict_future_bottlenecks(trend_data)
        
        if predicted_bottlenecks:
            print(f"  Found {len(predicted_bottlenecks)} predicted bottlenecks")
            for bottleneck in predicted_bottlenecks[:3]:
                print(f"    - {bottleneck.component}:{bottleneck.resource} at {bottleneck.predicted_time.strftime('%H:%M')} (confidence: {bottleneck.confidence:.2f})")
        
        # 보고서 내보내기
        print("\n📄 Exporting reports...")
        exporter = HealthReportExporter()
        
        # 요약 보고서
        summary = exporter.to_summary(report)
        print("  Summary report generated")
        
        # JSON 보고서 (파일로 저장)
        try:
            json_report = exporter.to_json(report)
            with open("health_report.json", "w", encoding="utf-8") as f:
                f.write(json_report)
            print("  JSON report saved to health_report.json")
        except Exception as e:
            print(f"  Failed to save JSON report: {e}")
        
        # HTML 보고서 (파일로 저장)
        try:
            html_report = exporter.to_html(report)
            with open("health_report.html", "w", encoding="utf-8") as f:
                f.write(html_report)
            print("  HTML report saved to health_report.html")
        except Exception as e:
            print(f"  Failed to save HTML report: {e}")
        
        print("\n✅ Demo completed successfully!")
        
        # 스케줄러 테스트 (5초간)
        print("\n⏰ Testing scheduler for 5 seconds...")
        scheduler = AnalysisScheduler(analyzer, timedelta(seconds=2))
        await scheduler.start()
        await asyncio.sleep(5)
        await scheduler.stop()
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 메인 함수 실행
    asyncio.run(main())