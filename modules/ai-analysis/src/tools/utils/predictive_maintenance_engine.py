#!/usr/bin/env python3
"""
Predictive Maintenance Engine
자가 발전형 LLM 연동 IDE용 예측적 유지보수 엔진

주요 기능:
- 시스템 컴포넌트 건강도 모니터링 및 장애 예측
- ML 기반 이상 탐지 및 패턴 분석
- 최적 유지보수 스케줄링 및 비용 최적화
- 자동 복구 시스템 및 백업 전략
- LLM 통합 분석 및 인사이트 생성
- 예측 정확도 지속 개선 시스템
"""

import asyncio
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Union, Tuple, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging
import json
import pickle
from pathlib import Path
import statistics
import threading
from concurrent.futures import ThreadPoolExecutor
import heapq
from collections import defaultdict, deque
import warnings
from abc import ABC, abstractmethod

# ML/AI 라이브러리 (사용 가능한 경우)
try:
    from sklearn.ensemble import IsolationForest, RandomForestRegressor
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import DBSCAN
    from sklearn.decomposition import PCA
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    warnings.warn("scikit-learn not available. Using fallback implementations.")

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# 열거형 정의
class ComponentType(Enum):
    """컴포넌트 타입"""
    SERVER = "server"
    DATABASE = "database"
    APPLICATION = "application"
    NETWORK = "network"
    STORAGE = "storage"
    CONTAINER = "container"
    SERVICE = "service"
    QUEUE = "queue"
    CACHE = "cache"
    CDN = "cdn"
    LOAD_BALANCER = "load_balancer"
    FIREWALL = "firewall"


class HealthStatus(Enum):
    """건강 상태"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    FAILING = "failing"
    UNKNOWN = "unknown"


class MaintenanceType(Enum):
    """유지보수 타입"""
    PREVENTIVE = "preventive"
    CORRECTIVE = "corrective"
    EMERGENCY = "emergency"
    SCHEDULED = "scheduled"
    PREDICTIVE = "predictive"


class RiskLevel(Enum):
    """위험 수준"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# 데이터 클래스 정의
@dataclass
class ComponentMetrics:
    """컴포넌트 메트릭"""
    component_id: str
    component_type: ComponentType
    timestamp: datetime
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    disk_usage: float = 0.0
    network_io: float = 0.0
    response_time: float = 0.0
    error_rate: float = 0.0
    throughput: float = 0.0
    temperature: Optional[float] = None
    custom_metrics: Dict[str, float] = field(default_factory=dict)
    
    def to_feature_vector(self) -> np.ndarray:
        """ML 모델용 특성 벡터로 변환"""
        features = [
            self.cpu_usage,
            self.memory_usage,
            self.disk_usage,
            self.network_io,
            self.response_time,
            self.error_rate,
            self.throughput
        ]
        
        if self.temperature is not None:
            features.append(self.temperature)
        
        # 커스텀 메트릭 추가
        for value in self.custom_metrics.values():
            features.append(value)
        
        return np.array(features)


@dataclass
class FailurePrediction:
    """장애 예측 결과"""
    component_id: str
    predicted_failure_time: datetime
    confidence: float
    risk_level: RiskLevel
    failure_type: str
    contributing_factors: List[str]
    recommended_actions: List[str]
    estimated_downtime: timedelta
    financial_impact: float
    prevention_cost: float
    
    @property
    def time_to_failure(self) -> timedelta:
        """장애까지 남은 시간"""
        return self.predicted_failure_time - datetime.now()
    
    @property
    def is_imminent(self) -> bool:
        """임박한 장애 여부"""
        return self.time_to_failure <= timedelta(hours=24)


@dataclass
class MaintenanceTask:
    """유지보수 작업"""
    task_id: str
    component_id: str
    task_type: MaintenanceType
    description: str
    estimated_duration: timedelta
    required_resources: List[str]
    dependencies: List[str] = field(default_factory=list)
    scheduled_time: Optional[datetime] = None
    priority: int = 1
    estimated_cost: float = 0.0
    risk_if_delayed: RiskLevel = RiskLevel.LOW
    automation_possible: bool = False
    requires_downtime: bool = False
    
    def __lt__(self, other):
        """우선순위 비교 (높은 우선순위가 먼저)"""
        return self.priority > other.priority


@dataclass
class MaintenanceSchedule:
    """유지보수 스케줄"""
    schedule_id: str
    tasks: List[MaintenanceTask]
    total_duration: timedelta
    total_cost: float
    optimization_score: float
    conflicts: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class SystemHealthReport:
    """시스템 건강 보고서"""
    report_id: str
    timestamp: datetime
    overall_health: HealthStatus
    component_health: Dict[str, HealthStatus]
    risk_assessment: Dict[str, RiskLevel]
    predicted_failures: List[FailurePrediction]
    recommended_actions: List[str]
    trend_analysis: Dict[str, str]
    next_review_date: datetime


class ComponentHealthMonitor:
    """컴포넌트 건강도 모니터"""
    
    def __init__(self, component_id: str, component_type: ComponentType):
        self.component_id = component_id
        self.component_type = component_type
        self.metrics_history = deque(maxlen=1000)  # 최근 1000개 메트릭 저장
        self.anomaly_detector = None
        self.baseline_metrics = None
        self.thresholds = self._get_default_thresholds()
        
        if HAS_SKLEARN:
            self.anomaly_detector = IsolationForest(contamination=0.1, random_state=42)
    
    def _get_default_thresholds(self) -> Dict[str, Dict[str, float]]:
        """컴포넌트 타입별 기본 임계값"""
        base_thresholds = {
            "cpu_usage": {"warning": 70.0, "critical": 90.0},
            "memory_usage": {"warning": 80.0, "critical": 95.0},
            "disk_usage": {"warning": 85.0, "critical": 95.0},
            "error_rate": {"warning": 1.0, "critical": 5.0},
            "response_time": {"warning": 1000.0, "critical": 5000.0}  # ms
        }
        
        # 컴포넌트 타입별 특화 임계값
        type_specific = {
            ComponentType.DATABASE: {
                "response_time": {"warning": 100.0, "critical": 500.0},
                "cpu_usage": {"warning": 60.0, "critical": 80.0}
            },
            ComponentType.CACHE: {
                "memory_usage": {"warning": 90.0, "critical": 98.0},
                "response_time": {"warning": 10.0, "critical": 50.0}
            }
        }
        
        if self.component_type in type_specific:
            base_thresholds.update(type_specific[self.component_type])
        
        return base_thresholds
    
    def add_metrics(self, metrics: ComponentMetrics) -> None:
        """메트릭 추가"""
        self.metrics_history.append(metrics)
        
        # 베이스라인 업데이트
        if len(self.metrics_history) >= 50:
            self._update_baseline()
        
        # 이상 탐지 모델 업데이트
        if HAS_SKLEARN and len(self.metrics_history) >= 100:
            self._update_anomaly_detector()
    
    def _update_baseline(self) -> None:
        """베이스라인 메트릭 업데이트"""
        if len(self.metrics_history) < 50:
            return
        
        recent_metrics = list(self.metrics_history)[-50:]  # 최근 50개
        
        self.baseline_metrics = {
            "cpu_usage": statistics.mean(m.cpu_usage for m in recent_metrics),
            "memory_usage": statistics.mean(m.memory_usage for m in recent_metrics),
            "disk_usage": statistics.mean(m.disk_usage for m in recent_metrics),
            "response_time": statistics.mean(m.response_time for m in recent_metrics),
            "error_rate": statistics.mean(m.error_rate for m in recent_metrics),
            "throughput": statistics.mean(m.throughput for m in recent_metrics)
        }
    
    def _update_anomaly_detector(self) -> None:
        """이상 탐지 모델 업데이트"""
        if not HAS_SKLEARN or len(self.metrics_history) < 100:
            return
        
        try:
            # 특성 벡터 생성
            features = np.array([m.to_feature_vector() for m in self.metrics_history])
            
            # 정규화
            scaler = StandardScaler()
            features_scaled = scaler.fit_transform(features)
            
            # 모델 훈련
            self.anomaly_detector.fit(features_scaled)
            self.scaler = scaler
            
        except Exception as e:
            logger.error(f"Failed to update anomaly detector for {self.component_id}: {e}")
    
    def detect_anomalies(self, metrics: ComponentMetrics) -> Dict[str, Any]:
        """이상 탐지"""
        anomalies = {"rule_based": [], "ml_based": None, "severity": "normal"}
        
        # 규칙 기반 이상 탐지
        for metric, thresholds in self.thresholds.items():
            if hasattr(metrics, metric):
                value = getattr(metrics, metric)
                
                if value >= thresholds["critical"]:
                    anomalies["rule_based"].append({
                        "metric": metric,
                        "value": value,
                        "threshold": thresholds["critical"],
                        "severity": "critical"
                    })
                elif value >= thresholds["warning"]:
                    anomalies["rule_based"].append({
                        "metric": metric,
                        "value": value,
                        "threshold": thresholds["warning"],
                        "severity": "warning"
                    })
        
        # ML 기반 이상 탐지
        if HAS_SKLEARN and self.anomaly_detector is not None and hasattr(self, 'scaler'):
            try:
                feature_vector = metrics.to_feature_vector().reshape(1, -1)
                feature_scaled = self.scaler.transform(feature_vector)
                
                anomaly_score = self.anomaly_detector.decision_function(feature_scaled)[0]
                is_anomaly = self.anomaly_detector.predict(feature_scaled)[0] == -1
                
                anomalies["ml_based"] = {
                    "is_anomaly": is_anomaly,
                    "anomaly_score": float(anomaly_score),
                    "confidence": abs(anomaly_score)
                }
                
            except Exception as e:
                logger.error(f"ML anomaly detection failed for {self.component_id}: {e}")
        
        # 전체 심각도 결정
        if any(a["severity"] == "critical" for a in anomalies["rule_based"]):
            anomalies["severity"] = "critical"
        elif any(a["severity"] == "warning" for a in anomalies["rule_based"]):
            anomalies["severity"] = "warning"
        elif anomalies["ml_based"] and anomalies["ml_based"]["is_anomaly"]:
            anomalies["severity"] = "anomaly"
        
        return anomalies
    
    def get_health_status(self) -> HealthStatus:
        """현재 건강 상태 반환"""
        if not self.metrics_history:
            return HealthStatus.UNKNOWN
        
        latest_metrics = self.metrics_history[-1]
        anomalies = self.detect_anomalies(latest_metrics)
        
        if anomalies["severity"] == "critical":
            return HealthStatus.CRITICAL
        elif anomalies["severity"] == "warning":
            return HealthStatus.WARNING
        elif anomalies["severity"] == "anomaly":
            return HealthStatus.WARNING
        else:
            return HealthStatus.HEALTHY
    
    def predict_degradation_trend(self, hours_ahead: int = 24) -> Dict[str, Any]:
        """성능 저하 트렌드 예측"""
        if len(self.metrics_history) < 10:
            return {"status": "insufficient_data"}
        
        try:
            # 최근 메트릭 분석
            recent_metrics = list(self.metrics_history)[-min(100, len(self.metrics_history)):]
            
            trends = {}
            for metric in ["cpu_usage", "memory_usage", "disk_usage", "response_time", "error_rate"]:
                values = [getattr(m, metric) for m in recent_metrics]
                
                # 간단한 선형 트렌드 계산
                x = np.arange(len(values))
                slope = np.polyfit(x, values, 1)[0] if len(values) > 1 else 0
                
                # 미래 값 예측
                future_value = values[-1] + slope * hours_ahead
                
                trends[metric] = {
                    "current": values[-1],
                    "trend_slope": float(slope),
                    "predicted_value": float(future_value),
                    "is_degrading": slope > 0 and metric != "throughput"  # throughput은 증가가 좋음
                }
            
            return {
                "status": "success",
                "trends": trends,
                "prediction_horizon_hours": hours_ahead,
                "confidence": min(len(recent_metrics) / 100.0, 1.0)
            }
            
        except Exception as e:
            logger.error(f"Trend prediction failed for {self.component_id}: {e}")
            return {"status": "error", "message": str(e)}


class FailurePredictor:
    """장애 예측기"""
    
    def __init__(self):
        self.prediction_models = {}
        self.historical_failures = []
        self.feature_importance = {}
        
        if HAS_SKLEARN:
            self.default_model = RandomForestRegressor(n_estimators=100, random_state=42)
    
    def train_prediction_model(self, component_type: ComponentType, 
                             training_data: List[Tuple[ComponentMetrics, bool]]) -> bool:
        """예측 모델 훈련"""
        if not HAS_SKLEARN or len(training_data) < 50:
            logger.warning(f"Insufficient training data for {component_type}")
            return False
        
        try:
            # 특성과 레이블 분리
            X = np.array([metrics.to_feature_vector() for metrics, _ in training_data])
            y = np.array([1 if failed else 0 for _, failed in training_data])
            
            # 모델 훈련
            model = RandomForestRegressor(n_estimators=100, random_state=42)
            model.fit(X, y)
            
            self.prediction_models[component_type] = {
                "model": model,
                "scaler": StandardScaler().fit(X),
                "feature_names": self._get_feature_names()
            }
            
            # 특성 중요도 저장
            self.feature_importance[component_type] = dict(zip(
                self._get_feature_names(),
                model.feature_importances_
            ))
            
            logger.info(f"Prediction model trained for {component_type}")
            return True
            
        except Exception as e:
            logger.error(f"Model training failed for {component_type}: {e}")
            return False
    
    def _get_feature_names(self) -> List[str]:
        """특성 이름 목록"""
        return [
            "cpu_usage", "memory_usage", "disk_usage", "network_io",
            "response_time", "error_rate", "throughput", "temperature"
        ]
    
    def predict_failure(self, metrics: ComponentMetrics, 
                       prediction_horizon: timedelta = timedelta(days=7)) -> Optional[FailurePrediction]:
        """장애 예측"""
        component_type = metrics.component_type
        
        # ML 모델 예측
        ml_prediction = self._ml_based_prediction(metrics, prediction_horizon)
        
        # 규칙 기반 예측
        rule_prediction = self._rule_based_prediction(metrics, prediction_horizon)
        
        # 앙상블 예측 (ML + 규칙 기반)
        final_prediction = self._ensemble_prediction(ml_prediction, rule_prediction, metrics)
        
        return final_prediction
    
    def _ml_based_prediction(self, metrics: ComponentMetrics, 
                           horizon: timedelta) -> Optional[Dict[str, Any]]:
        """ML 기반 예측"""
        if not HAS_SKLEARN or metrics.component_type not in self.prediction_models:
            return None
        
        try:
            model_info = self.prediction_models[metrics.component_type]
            model = model_info["model"]
            scaler = model_info["scaler"]
            
            # 특성 정규화
            features = metrics.to_feature_vector().reshape(1, -1)
            features_scaled = scaler.transform(features)
            
            # 예측
            failure_probability = model.predict(features_scaled)[0]
            
            return {
                "failure_probability": float(failure_probability),
                "confidence": 0.8,  # ML 모델 기본 신뢰도
                "method": "ml"
            }
            
        except Exception as e:
            logger.error(f"ML prediction failed: {e}")
            return None
    
    def _rule_based_prediction(self, metrics: ComponentMetrics, 
                             horizon: timedelta) -> Dict[str, Any]:
        """규칙 기반 예측"""
        risk_factors = []
        failure_probability = 0.0
        
        # CPU 사용률 기반 위험도
        if metrics.cpu_usage > 95:
            risk_factors.append("critical_cpu_usage")
            failure_probability += 0.4
        elif metrics.cpu_usage > 85:
            risk_factors.append("high_cpu_usage")
            failure_probability += 0.2
        
        # 메모리 사용률 기반 위험도
        if metrics.memory_usage > 98:
            risk_factors.append("critical_memory_usage")
            failure_probability += 0.5
        elif metrics.memory_usage > 90:
            risk_factors.append("high_memory_usage")
            failure_probability += 0.3
        
        # 디스크 사용률 기반 위험도
        if metrics.disk_usage > 98:
            risk_factors.append("critical_disk_usage")
            failure_probability += 0.6
        elif metrics.disk_usage > 95:
            risk_factors.append("high_disk_usage")
            failure_probability += 0.3
        
        # 오류율 기반 위험도
        if metrics.error_rate > 10:
            risk_factors.append("critical_error_rate")
            failure_probability += 0.4
        elif metrics.error_rate > 5:
            risk_factors.append("high_error_rate")
            failure_probability += 0.2
        
        # 응답 시간 기반 위험도
        if metrics.response_time > 10000:  # 10초
            risk_factors.append("critical_response_time")
            failure_probability += 0.3
        elif metrics.response_time > 5000:  # 5초
            risk_factors.append("high_response_time")
            failure_probability += 0.1
        
        return {
            "failure_probability": min(failure_probability, 1.0),
            "risk_factors": risk_factors,
            "confidence": 0.7,  # 규칙 기반 기본 신뢰도
            "method": "rule_based"
        }
    
    def _ensemble_prediction(self, ml_pred: Optional[Dict], rule_pred: Dict, 
                           metrics: ComponentMetrics) -> Optional[FailurePrediction]:
        """앙상블 예측"""
        if ml_pred is None:
            # ML 예측이 없으면 규칙 기반만 사용
            failure_prob = rule_pred["failure_probability"]
            confidence = rule_pred["confidence"]
            contributing_factors = rule_pred["risk_factors"]
        else:
            # ML과 규칙 기반 결합 (가중 평균)
            ml_weight = 0.6
            rule_weight = 0.4
            
            failure_prob = (ml_pred["failure_probability"] * ml_weight + 
                          rule_pred["failure_probability"] * rule_weight)
            confidence = (ml_pred["confidence"] * ml_weight + 
                        rule_pred["confidence"] * rule_weight)
            contributing_factors = rule_pred["risk_factors"]
        
        # 예측 임계값 확인
        if failure_prob < 0.1:
            return None  # 장애 가능성이 낮음
        
        # 위험 수준 결정
        if failure_prob >= 0.8:
            risk_level = RiskLevel.CRITICAL
        elif failure_prob >= 0.6:
            risk_level = RiskLevel.HIGH
        elif failure_prob >= 0.3:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW
        
        # 예상 장애 시간 계산
        base_hours = 24 * 7  # 7일
        predicted_hours = base_hours * (1 - failure_prob)
        predicted_failure_time = datetime.now() + timedelta(hours=predicted_hours)
        
        # 권장 조치 생성
        recommended_actions = self._generate_recommendations(contributing_factors, metrics)
        
        # 비용 추정
        financial_impact = self._estimate_financial_impact(metrics, risk_level)
        prevention_cost = financial_impact * 0.1  # 예방 비용은 피해 비용의 10%
        
        return FailurePrediction(
            component_id=metrics.component_id,
            predicted_failure_time=predicted_failure_time,
            confidence=confidence,
            risk_level=risk_level,
            failure_type=self._determine_failure_type(contributing_factors),
            contributing_factors=contributing_factors,
            recommended_actions=recommended_actions,
            estimated_downtime=timedelta(hours=2),  # 기본 다운타임 추정
            financial_impact=financial_impact,
            prevention_cost=prevention_cost
        )
    
    def _generate_recommendations(self, risk_factors: List[str], 
                                metrics: ComponentMetrics) -> List[str]:
        """권장 조치 생성"""
        recommendations = []
        
        if "critical_cpu_usage" in risk_factors:
            recommendations.append("Scale up CPU resources or optimize CPU-intensive processes")
        if "critical_memory_usage" in risk_factors:
            recommendations.append("Increase memory allocation or investigate memory leaks")
        if "critical_disk_usage" in risk_factors:
            recommendations.append("Clean up disk space or expand storage capacity")
        if "critical_error_rate" in risk_factors:
            recommendations.append("Investigate and fix underlying application errors")
        if "critical_response_time" in risk_factors:
            recommendations.append("Optimize database queries or add caching layer")
        
        if not recommendations:
            recommendations.append("Monitor system closely and prepare for potential issues")
        
        return recommendations
    
    def _determine_failure_type(self, risk_factors: List[str]) -> str:
        """장애 유형 결정"""
        if any("cpu" in factor for factor in risk_factors):
            return "performance_degradation"
        elif any("memory" in factor for factor in risk_factors):
            return "memory_exhaustion"
        elif any("disk" in factor for factor in risk_factors):
            return "storage_failure"
        elif any("error" in factor for factor in risk_factors):
            return "application_error"
        else:
            return "general_system_failure"
    
    def _estimate_financial_impact(self, metrics: ComponentMetrics, 
                                 risk_level: RiskLevel) -> float:
        """재정적 영향 추정"""
        base_costs = {
            ComponentType.DATABASE: 10000,
            ComponentType.APPLICATION: 5000,
            ComponentType.SERVER: 3000,
            ComponentType.NETWORK: 2000
        }
        
        base_cost = base_costs.get(metrics.component_type, 1000)
        
        risk_multipliers = {
            RiskLevel.LOW: 0.1,
            RiskLevel.MEDIUM: 0.3,
            RiskLevel.HIGH: 0.7,
            RiskLevel.CRITICAL: 1.0
        }
        
        return base_cost * risk_multipliers[risk_level]


class MaintenanceScheduler:
    """유지보수 스케줄러"""
    
    def __init__(self):
        self.scheduled_tasks = []
        self.resource_constraints = {}
        self.business_hours = (9, 17)  # 9 AM to 5 PM
        self.maintenance_windows = []  # 정기 유지보수 창
    
    def add_maintenance_window(self, start_time: datetime, end_time: datetime, 
                             recurring: bool = False, interval: Optional[timedelta] = None):
        """유지보수 창 추가"""
        window = {
            "start": start_time,
            "end": end_time,
            "recurring": recurring,
            "interval": interval
        }
        self.maintenance_windows.append(window)
    
    def schedule_optimal_maintenance(self, predictions: List[FailurePrediction],
                                   constraints: Optional[Dict[str, Any]] = None) -> MaintenanceSchedule:
        """최적 유지보수 스케줄 생성"""
        tasks = self._create_maintenance_tasks(predictions)
        
        # 우선순위 기반 정렬
        priority_queue = []
        for task in tasks:
            priority_score = self._calculate_priority_score(task, predictions)
            heapq.heappush(priority_queue, (-priority_score, task))
        
        # 스케줄링
        scheduled_tasks = []
        current_time = datetime.now()
        resource_usage = defaultdict(list)
        
        while priority_queue:
            _, task = heapq.heappop(priority_queue)
            
            # 최적 시간 찾기
            optimal_time = self._find_optimal_time_slot(
                task, current_time, resource_usage, constraints
            )
            
            if optimal_time:
                task.scheduled_time = optimal_time
                scheduled_tasks.append(task)
                
                # 리소스 사용량 업데이트
                for resource in task.required_resources:
                    resource_usage[resource].append({
                        "start": optimal_time,
                        "end": optimal_time + task.estimated_duration,
                        "task_id": task.task_id
                    })
        
        # 스케줄 최적화
        optimized_schedule = self._optimize_schedule(scheduled_tasks)
        
        return MaintenanceSchedule(
            schedule_id=f"schedule_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            tasks=optimized_schedule,
            total_duration=sum([task.estimated_duration for task in optimized_schedule], timedelta()),
            total_cost=sum(task.estimated_cost for task in optimized_schedule),
            optimization_score=self._calculate_optimization_score(optimized_schedule)
        )
    
    def _create_maintenance_tasks(self, predictions: List[FailurePrediction]) -> List[MaintenanceTask]:
        """예측 결과에서 유지보수 작업 생성"""
        tasks = []
        
        for prediction in predictions:
            # 예방적 유지보수 작업 생성
            task = MaintenanceTask(
                task_id=f"maint_{prediction.component_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                component_id=prediction.component_id,
                task_type=MaintenanceType.PREVENTIVE,
                description=f"Preventive maintenance for {prediction.component_id}",
                estimated_duration=self._estimate_task_duration(prediction),
                required_resources=self._determine_required_resources(prediction),
                priority=self._calculate_task_priority(prediction),
                estimated_cost=prediction.prevention_cost,
                risk_if_delayed=prediction.risk_level,
                automation_possible=self._can_automate_task(prediction),
                requires_downtime=self._requires_downtime(prediction)
            )
            tasks.append(task)
            
            # 긴급한 경우 즉시 대응 작업도 생성
            if prediction.is_imminent:
                emergency_task = MaintenanceTask(
                    task_id=f"emergency_{prediction.component_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    component_id=prediction.component_id,
                    task_type=MaintenanceType.EMERGENCY,
                    description=f"Emergency intervention for {prediction.component_id}",
                    estimated_duration=timedelta(hours=1),
                    required_resources=["emergency_team"],
                    priority=10,  # 최고 우선순위
                    estimated_cost=prediction.prevention_cost * 2,
                    risk_if_delayed=RiskLevel.CRITICAL,
                    automation_possible=False,
                    requires_downtime=True
                )
                tasks.append(emergency_task)
        
        return tasks
    
    def _estimate_task_duration(self, prediction: FailurePrediction) -> timedelta:
        """작업 소요 시간 추정"""
        base_durations = {
            "performance_degradation": timedelta(hours=2),
            "memory_exhaustion": timedelta(hours=1),
            "storage_failure": timedelta(hours=4),
            "application_error": timedelta(hours=3),
            "general_system_failure": timedelta(hours=6)
        }
        
        base_duration = base_durations.get(prediction.failure_type, timedelta(hours=2))
        
        # 위험 수준에 따른 조정
        risk_multipliers = {
            RiskLevel.LOW: 0.5,
            RiskLevel.MEDIUM: 1.0,
            RiskLevel.HIGH: 1.5,
            RiskLevel.CRITICAL: 2.0
        }
        
        return base_duration * risk_multipliers[prediction.risk_level]
    
    def _determine_required_resources(self, prediction: FailurePrediction) -> List[str]:
        """필요 리소스 결정"""
        resources = ["maintenance_team"]
        
        if "cpu" in prediction.contributing_factors:
            resources.append("performance_specialist")
        if "memory" in prediction.contributing_factors:
            resources.append("system_admin")
        if "disk" in prediction.contributing_factors:
            resources.append("storage_team")
        if "error" in prediction.contributing_factors:
            resources.append("developer")
        
        if prediction.risk_level == RiskLevel.CRITICAL:
            resources.append("senior_engineer")
        
        return resources
    
    def _calculate_task_priority(self, prediction: FailurePrediction) -> int:
        """작업 우선순위 계산"""
        base_priority = {
            RiskLevel.CRITICAL: 9,
            RiskLevel.HIGH: 7,
            RiskLevel.MEDIUM: 5,
            RiskLevel.LOW: 3
        }[prediction.risk_level]
        
        # 시간 임박도에 따른 조정
        if prediction.time_to_failure <= timedelta(hours=24):
            base_priority += 2
        elif prediction.time_to_failure <= timedelta(days=3):
            base_priority += 1
        
        # 재정적 영향에 따른 조정
        if prediction.financial_impact > 50000:
            base_priority += 1
        
        return min(base_priority, 10)
    
    def _can_automate_task(self, prediction: FailurePrediction) -> bool:
        """자동화 가능 여부 판단"""
        automatable_types = [
            "performance_degradation",
            "memory_exhaustion"
        ]
        
        return (prediction.failure_type in automatable_types and 
                prediction.risk_level != RiskLevel.CRITICAL)
    
    def _requires_downtime(self, prediction: FailurePrediction) -> bool:
        """다운타임 필요 여부 판단"""
        downtime_required_types = [
            "storage_failure",
            "general_system_failure"
        ]
        
        return (prediction.failure_type in downtime_required_types or 
                prediction.risk_level == RiskLevel.CRITICAL)
    
    def _calculate_priority_score(self, task: MaintenanceTask, 
                                predictions: List[FailurePrediction]) -> float:
        """우선순위 점수 계산"""
        # 기본 우선순위
        score = task.priority * 10
        
        # 관련 예측 찾기
        related_prediction = next(
            (p for p in predictions if p.component_id == task.component_id), 
            None
        )
        
        if related_prediction:
            # 시간 임박도
            hours_to_failure = related_prediction.time_to_failure.total_seconds() / 3600
            if hours_to_failure > 0:
                time_urgency = max(0, 100 - hours_to_failure)
                score += time_urgency
            
            # 재정적 영향
            financial_factor = min(related_prediction.financial_impact / 10000, 10)
            score += financial_factor
            
            # 신뢰도
            confidence_factor = related_prediction.confidence * 20
            score += confidence_factor
        
        # 작업 유형에 따른 가중치
        type_weights = {
            MaintenanceType.EMERGENCY: 50,
            MaintenanceType.PREVENTIVE: 20,
            MaintenanceType.CORRECTIVE: 30,
            MaintenanceType.SCHEDULED: 10,
            MaintenanceType.PREDICTIVE: 25
        }
        
        score += type_weights.get(task.task_type, 10)
        
        return score
    
    def _find_optimal_time_slot(self, task: MaintenanceTask, start_time: datetime,
                               resource_usage: Dict, constraints: Optional[Dict] = None) -> Optional[datetime]:
        """최적 시간 슬롯 찾기"""
        # 제약 조건 설정
        if constraints is None:
            constraints = {}
        
        avoid_business_hours = constraints.get("avoid_business_hours", True)
        max_search_days = constraints.get("max_search_days", 30)
        
        current_search_time = start_time
        end_search_time = start_time + timedelta(days=max_search_days)
        
        while current_search_time < end_search_time:
            # 비즈니스 시간 회피
            if avoid_business_hours and self._is_business_hours(current_search_time):
                current_search_time = self._next_non_business_hour(current_search_time)
                continue
            
            # 리소스 충돌 확인
            if not self._has_resource_conflict(task, current_search_time, resource_usage):
                # 유지보수 창 확인
                if self._is_in_maintenance_window(current_search_time, task.estimated_duration):
                    return current_search_time
                elif not avoid_business_hours:
                    return current_search_time
            
            # 다음 시간 슬롯으로
            current_search_time += timedelta(hours=1)
        
        return None  # 적절한 시간 슬롯을 찾지 못함
    
    def _is_business_hours(self, dt: datetime) -> bool:
        """비즈니스 시간 여부 확인"""
        return (dt.weekday() < 5 and  # 월-금
                self.business_hours[0] <= dt.hour < self.business_hours[1])
    
    def _next_non_business_hour(self, dt: datetime) -> datetime:
        """다음 비비즈니스 시간 반환"""
        if dt.weekday() < 5:  # 평일
            if dt.hour < self.business_hours[0]:
                return dt.replace(hour=self.business_hours[1], minute=0, second=0, microsecond=0)
            else:
                # 다음 날 자정으로
                next_day = dt + timedelta(days=1)
                return next_day.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            return dt  # 주말은 언제든 가능
    
    def _has_resource_conflict(self, task: MaintenanceTask, start_time: datetime,
                             resource_usage: Dict) -> bool:
        """리소스 충돌 확인"""
        task_end_time = start_time + task.estimated_duration
        
        for resource in task.required_resources:
            for usage in resource_usage.get(resource, []):
                if (start_time < usage["end"] and task_end_time > usage["start"]):
                    return True
        
        return False
    
    def _is_in_maintenance_window(self, start_time: datetime, duration: timedelta) -> bool:
        """유지보수 창 내 여부 확인"""
        if not self.maintenance_windows:
            return True  # 유지보수 창이 정의되지 않으면 언제든 가능
        
        end_time = start_time + duration
        
        for window in self.maintenance_windows:
            if window["start"] <= start_time and end_time <= window["end"]:
                return True
        
        return False
    
    def _optimize_schedule(self, tasks: List[MaintenanceTask]) -> List[MaintenanceTask]:
        """스케줄 최적화"""
        # 의존성 기반 재정렬
        optimized_tasks = []
        remaining_tasks = tasks.copy()
        
        while remaining_tasks:
            # 의존성이 모두 해결된 작업 찾기
            ready_tasks = [
                task for task in remaining_tasks
                if all(dep_id in [completed.task_id for completed in optimized_tasks]
                      for dep_id in task.dependencies)
            ]
            
            if not ready_tasks:
                # 순환 의존성 등의 문제로 더 이상 진행할 수 없음
                logger.warning("Cannot resolve all task dependencies")
                optimized_tasks.extend(remaining_tasks)
                break
            
            # 우선순위가 가장 높은 작업 선택
            next_task = max(ready_tasks, key=lambda t: t.priority)
            optimized_tasks.append(next_task)
            remaining_tasks.remove(next_task)
        
        return optimized_tasks
    
    def _calculate_optimization_score(self, tasks: List[MaintenanceTask]) -> float:
        """최적화 점수 계산"""
        if not tasks:
            return 0.0
        
        # 우선순위 점수
        priority_score = sum(task.priority for task in tasks) / len(tasks)
        
        # 시간 효율성 점수
        total_duration = sum([task.estimated_duration.total_seconds() for task in tasks])
        if total_duration > 0:
            time_efficiency = min(100, 86400 * 7 / total_duration)  # 일주일 기준
        else:
            time_efficiency = 100
        
        # 비용 효율성 점수
        total_cost = sum(task.estimated_cost for task in tasks)
        if total_cost > 0:
            cost_efficiency = min(100, 100000 / total_cost)  # 10만원 기준
        else:
            cost_efficiency = 100
        
        return (priority_score * 0.4 + time_efficiency * 0.3 + cost_efficiency * 0.3)


class AutoRecoverySystem:
    """자동 복구 시스템"""
    
    def __init__(self):
        self.recovery_strategies = {}
        self.recovery_history = []
        self.success_rates = defaultdict(float)
        
    def register_recovery_strategy(self, component_type: ComponentType, 
                                 failure_type: str, strategy: Dict[str, Any]):
        """복구 전략 등록"""
        key = (component_type, failure_type)
        self.recovery_strategies[key] = strategy
    
    def attempt_auto_recovery(self, prediction: FailurePrediction) -> Dict[str, Any]:
        """자동 복구 시도"""
        key = (prediction.component_id, prediction.failure_type)
        
        if key not in self.recovery_strategies:
            return {"status": "no_strategy", "message": "No recovery strategy available"}
        
        strategy = self.recovery_strategies[key]
        
        try:
            # 복구 전략 실행
            recovery_result = self._execute_recovery_strategy(strategy, prediction)
            
            # 결과 기록
            self.recovery_history.append({
                "timestamp": datetime.now(),
                "component_id": prediction.component_id,
                "failure_type": prediction.failure_type,
                "strategy": strategy["name"],
                "success": recovery_result["success"]
            })
            
            # 성공률 업데이트
            self._update_success_rate(key, recovery_result["success"])
            
            return recovery_result
            
        except Exception as e:
            logger.error(f"Auto recovery failed for {prediction.component_id}: {e}")
            return {"status": "error", "message": str(e)}
    
    def _execute_recovery_strategy(self, strategy: Dict[str, Any], 
                                 prediction: FailurePrediction) -> Dict[str, Any]:
        """복구 전략 실행"""
        strategy_type = strategy.get("type", "script")
        
        if strategy_type == "restart":
            return self._restart_component(prediction.component_id)
        elif strategy_type == "scale":
            return self._scale_component(prediction.component_id, strategy.get("scale_factor", 1.5))
        elif strategy_type == "cleanup":
            return self._cleanup_component(prediction.component_id)
        elif strategy_type == "script":
            return self._run_recovery_script(strategy.get("script", ""), prediction)
        else:
            return {"status": "unknown_strategy", "success": False}
    
    def _restart_component(self, component_id: str) -> Dict[str, Any]:
        """컴포넌트 재시작"""
        try:
            # 실제 구현에서는 컨테이너/서비스 재시작 로직
            logger.info(f"Restarting component: {component_id}")
            
            # 시뮬레이션: 70% 성공률
            import random
            success = random.random() < 0.7
            
            return {
                "status": "completed",
                "success": success,
                "action": "restart",
                "message": f"Component {component_id} restart {'successful' if success else 'failed'}"
            }
        except Exception as e:
            return {"status": "error", "success": False, "message": str(e)}
    
    def _scale_component(self, component_id: str, scale_factor: float) -> Dict[str, Any]:
        """컴포넌트 스케일링"""
        try:
            logger.info(f"Scaling component {component_id} by factor {scale_factor}")
            
            # 시뮬레이션: 80% 성공률
            import random
            success = random.random() < 0.8
            
            return {
                "status": "completed",
                "success": success,
                "action": "scale",
                "scale_factor": scale_factor,
                "message": f"Component {component_id} scaling {'successful' if success else 'failed'}"
            }
        except Exception as e:
            return {"status": "error", "success": False, "message": str(e)}
    
    def _cleanup_component(self, component_id: str) -> Dict[str, Any]:
        """컴포넌트 정리"""
        try:
            logger.info(f"Cleaning up component: {component_id}")
            
            # 시뮬레이션: 90% 성공률
            import random
            success = random.random() < 0.9
            
            return {
                "status": "completed",
                "success": success,
                "action": "cleanup",
                "message": f"Component {component_id} cleanup {'successful' if success else 'failed'}"
            }
        except Exception as e:
            return {"status": "error", "success": False, "message": str(e)}
    
    def _run_recovery_script(self, script: str, prediction: FailurePrediction) -> Dict[str, Any]:
        """복구 스크립트 실행"""
        try:
            # 보안상 실제 스크립트 실행은 하지 않고 시뮬레이션
            logger.info(f"Running recovery script for {prediction.component_id}")
            
            # 시뮬레이션: 복잡도에 따른 성공률
            import random
            success_rate = 0.6 if len(script) > 100 else 0.8
            success = random.random() < success_rate
            
            return {
                "status": "completed",
                "success": success,
                "action": "script",
                "message": f"Recovery script for {prediction.component_id} {'successful' if success else 'failed'}"
            }
        except Exception as e:
            return {"status": "error", "success": False, "message": str(e)}
    
    def _update_success_rate(self, key: Tuple, success: bool):
        """성공률 업데이트"""
        current_rate = self.success_rates[key]
        # 지수 이동 평균으로 업데이트
        alpha = 0.1
        new_rate = alpha * (1.0 if success else 0.0) + (1 - alpha) * current_rate
        self.success_rates[key] = new_rate
    
    def get_recovery_recommendations(self, prediction: FailurePrediction) -> List[str]:
        """복구 권장사항 반환"""
        recommendations = []
        
        # 자동 복구 가능 여부 확인
        key = (prediction.component_id, prediction.failure_type)
        if key in self.recovery_strategies:
            success_rate = self.success_rates.get(key, 0.5)
            recommendations.append(
                f"Auto-recovery available (Success rate: {success_rate:.1%})"
            )
        
        # 일반적인 권장사항
        if prediction.failure_type == "performance_degradation":
            recommendations.extend([
                "Consider horizontal scaling",
                "Optimize resource allocation",
                "Review performance bottlenecks"
            ])
        elif prediction.failure_type == "memory_exhaustion":
            recommendations.extend([
                "Increase memory limits",
                "Check for memory leaks",
                "Implement memory monitoring"
            ])
        elif prediction.failure_type == "storage_failure":
            recommendations.extend([
                "Backup critical data immediately",
                "Plan storage expansion",
                "Check disk health"
            ])
        
        return recommendations


class PredictiveMaintenanceEngine:
    """통합 예측적 유지보수 엔진"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.component_monitors = {}
        self.failure_predictor = FailurePredictor()
        self.maintenance_scheduler = MaintenanceScheduler()
        self.auto_recovery = AutoRecoverySystem()
        self.system_health_history = deque(maxlen=100)
        
        # 설정 초기화
        self.prediction_interval = timedelta(minutes=self.config.get("prediction_interval_minutes", 15))
        self.health_check_interval = timedelta(minutes=self.config.get("health_check_interval_minutes", 5))
        
        # 실행 상태
        self.is_running = False
        self.last_prediction_time = None
        self.last_health_check_time = None
        
        # 스레드 풀
        self.executor = ThreadPoolExecutor(max_workers=4)
        
    def register_component(self, component_id: str, component_type: ComponentType) -> bool:
        """컴포넌트 등록"""
        try:
            monitor = ComponentHealthMonitor(component_id, component_type)
            self.component_monitors[component_id] = monitor
            logger.info(f"Component registered: {component_id} ({component_type.value})")
            return True
        except Exception as e:
            logger.error(f"Failed to register component {component_id}: {e}")
            return False
    
    def add_component_metrics(self, metrics: ComponentMetrics) -> bool:
        """컴포넌트 메트릭 추가"""
        try:
            if metrics.component_id not in self.component_monitors:
                # 자동 등록
                self.register_component(metrics.component_id, metrics.component_type)
            
            monitor = self.component_monitors[metrics.component_id]
            monitor.add_metrics(metrics)
            return True
        except Exception as e:
            logger.error(f"Failed to add metrics for {metrics.component_id}: {e}")
            return False
    
    async def run_prediction_cycle(self) -> List[FailurePrediction]:
        """예측 사이클 실행"""
        predictions = []
        
        for component_id, monitor in self.component_monitors.items():
            if not monitor.metrics_history:
                continue
            
            try:
                latest_metrics = monitor.metrics_history[-1]
                prediction = self.failure_predictor.predict_failure(latest_metrics)
                
                if prediction:
                    predictions.append(prediction)
                    
                    # 임박한 장애에 대한 자동 복구 시도
                    if prediction.is_imminent and prediction.risk_level == RiskLevel.CRITICAL:
                        recovery_result = self.auto_recovery.attempt_auto_recovery(prediction)
                        logger.info(f"Auto-recovery attempted for {component_id}: {recovery_result}")
                
            except Exception as e:
                logger.error(f"Prediction failed for {component_id}: {e}")
        
        self.last_prediction_time = datetime.now()
        return predictions
    
    def generate_system_health_report(self) -> SystemHealthReport:
        """시스템 건강 보고서 생성"""
        component_health = {}
        risk_assessment = {}
        overall_health = HealthStatus.HEALTHY
        
        # 각 컴포넌트 건강도 평가
        for component_id, monitor in self.component_monitors.items():
            health = monitor.get_health_status()
            component_health[component_id] = health
            
            # 전체 건강도 업데이트
            if health == HealthStatus.CRITICAL:
                overall_health = HealthStatus.CRITICAL
            elif health == HealthStatus.WARNING and overall_health == HealthStatus.HEALTHY:
                overall_health = HealthStatus.WARNING
        
        # 위험도 평가
        for component_id, monitor in self.component_monitors.items():
            if monitor.metrics_history:
                latest_metrics = monitor.metrics_history[-1]
                # 간단한 위험도 계산
                if latest_metrics.cpu_usage > 90 or latest_metrics.memory_usage > 95:
                    risk_assessment[component_id] = RiskLevel.HIGH
                elif latest_metrics.cpu_usage > 70 or latest_metrics.memory_usage > 80:
                    risk_assessment[component_id] = RiskLevel.MEDIUM
                else:
                    risk_assessment[component_id] = RiskLevel.LOW
        
        # 예측 실행
        predictions = asyncio.run(self.run_prediction_cycle())
        
        # 권장 조치 생성
        recommended_actions = []
        for prediction in predictions:
            recommended_actions.extend(prediction.recommended_actions)
        
        # 트렌드 분석
        trend_analysis = self._analyze_trends()
        
        report = SystemHealthReport(
            report_id=f"health_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            timestamp=datetime.now(),
            overall_health=overall_health,
            component_health=component_health,
            risk_assessment=risk_assessment,
            predicted_failures=predictions,
            recommended_actions=list(set(recommended_actions)),  # 중복 제거
            trend_analysis=trend_analysis,
            next_review_date=datetime.now() + self.health_check_interval
        )
        
        # 이력에 추가
        self.system_health_history.append(report)
        
        return report
    
    def _analyze_trends(self) -> Dict[str, str]:
        """트렌드 분석"""
        trends = {}
        
        for component_id, monitor in self.component_monitors.items():
            if len(monitor.metrics_history) < 10:
                trends[component_id] = "insufficient_data"
                continue
            
            # 최근 트렌드 분석
            trend_result = monitor.predict_degradation_trend(hours_ahead=24)
            
            if trend_result.get("status") == "success":
                degrading_metrics = [
                    metric for metric, data in trend_result["trends"].items()
                    if data.get("is_degrading", False)
                ]
                
                if degrading_metrics:
                    trends[component_id] = f"degrading_in_{', '.join(degrading_metrics)}"
                else:
                    trends[component_id] = "stable"
            else:
                trends[component_id] = "analysis_failed"
        
        return trends
    
    def create_maintenance_schedule(self, predictions: Optional[List[FailurePrediction]] = None) -> MaintenanceSchedule:
        """유지보수 스케줄 생성"""
        if predictions is None:
            predictions = asyncio.run(self.run_prediction_cycle())
        
        return self.maintenance_scheduler.schedule_optimal_maintenance(predictions)
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """시스템 메트릭 반환"""
        total_components = len(self.component_monitors)
        active_components = sum(1 for monitor in self.component_monitors.values() 
                              if monitor.metrics_history)
        
        health_distribution = defaultdict(int)
        for monitor in self.component_monitors.values():
            health = monitor.get_health_status()
            health_distribution[health.value] += 1
        
        return {
            "total_components": total_components,
            "active_components": active_components,
            "health_distribution": dict(health_distribution),
            "last_prediction_time": self.last_prediction_time.isoformat() if self.last_prediction_time else None,
            "prediction_interval_minutes": self.prediction_interval.total_seconds() / 60,
            "system_uptime": "calculated_uptime_here",  # 실제 구현에서는 시스템 가동 시간 계산
            "total_predictions_made": len([p for report in self.system_health_history 
                                         for p in report.predicted_failures])
        }
    
    def export_health_history(self, format: str = "json") -> str:
        """건강 이력 내보내기"""
        history_data = [
            {
                "timestamp": report.timestamp.isoformat(),
                "overall_health": report.overall_health.value,
                "component_count": len(report.component_health),
                "predicted_failures": len(report.predicted_failures),
                "high_risk_components": len([r for r in report.risk_assessment.values() 
                                           if r == RiskLevel.HIGH])
            }
            for report in self.system_health_history
        ]
        
        if format == "json":
            return json.dumps(history_data, indent=2)
        elif format == "csv":
            import csv
            import io
            
            output = io.StringIO()
            if history_data:
                writer = csv.DictWriter(output, fieldnames=history_data[0].keys())
                writer.writeheader()
                writer.writerows(history_data)
            
            return output.getvalue()
        else:
            raise ValueError(f"Unsupported format: {format}")
    
    def cleanup(self):
        """리소스 정리"""
        self.is_running = False
        self.executor.shutdown(wait=True)


# 편의 함수들
def create_sample_metrics(component_id: str, component_type: ComponentType) -> ComponentMetrics:
    """샘플 메트릭 생성 (테스트용)"""
    import random
    
    return ComponentMetrics(
        component_id=component_id,
        component_type=component_type,
        timestamp=datetime.now(),
        cpu_usage=random.uniform(20, 95),
        memory_usage=random.uniform(30, 98),
        disk_usage=random.uniform(40, 90),
        network_io=random.uniform(0, 1000),
        response_time=random.uniform(10, 5000),
        error_rate=random.uniform(0, 10),
        throughput=random.uniform(100, 10000),
        temperature=random.uniform(30, 80)
    )


# 사용 예제
if __name__ == "__main__":
    # 예측적 유지보수 엔진 초기화
    engine = PredictiveMaintenanceEngine({
        "prediction_interval_minutes": 15,
        "health_check_interval_minutes": 5
    })
    
    # 컴포넌트 등록
    engine.register_component("web_server_1", ComponentType.SERVER)
    engine.register_component("db_primary", ComponentType.DATABASE)
    engine.register_component("app_service", ComponentType.APPLICATION)
    
    # 샘플 메트릭 추가
    for i in range(10):
        engine.add_component_metrics(create_sample_metrics("web_server_1", ComponentType.SERVER))
        engine.add_component_metrics(create_sample_metrics("db_primary", ComponentType.DATABASE))
        engine.add_component_metrics(create_sample_metrics("app_service", ComponentType.APPLICATION))
    
    # 시스템 건강 보고서 생성
    health_report = engine.generate_system_health_report()
    print(f"System Health Report: {health_report.overall_health.value}")
    print(f"Components monitored: {len(health_report.component_health)}")
    print(f"Predicted failures: {len(health_report.predicted_failures)}")
    
    # 예측된 장애가 있는 경우 유지보수 스케줄 생성
    if health_report.predicted_failures:
        maintenance_schedule = engine.create_maintenance_schedule(health_report.predicted_failures)
        print(f"Maintenance tasks scheduled: {len(maintenance_schedule.tasks)}")
        print(f"Total estimated cost: ${maintenance_schedule.total_cost:.2f}")
        print(f"Optimization score: {maintenance_schedule.optimization_score:.2f}")
    
    # 시스템 메트릭 출력
    metrics = engine.get_system_metrics()
    print(f"System Metrics: {json.dumps(metrics, indent=2)}")
    
    # 리소스 정리
    engine.cleanup()


# LLM 통합을 위한 추가 클래스들
class LLMIntegratedAnalyzer:
    """LLM 통합 분석기"""
    
    def __init__(self, llm_client=None):
        self.llm_client = llm_client
        self.analysis_history = []
        
    async def analyze_with_llm(self, system_data: Dict[str, Any]) -> Dict[str, Any]:
        """LLM을 사용한 시스템 분석"""
        if not self.llm_client:
            return self._fallback_analysis(system_data)
        
        try:
            # LLM용 프롬프트 생성
            prompt = self._create_analysis_prompt(system_data)
            
            # LLM 호출 (실제 구현에서는 OpenAI API 등 사용)
            response = await self._call_llm(prompt)
            
            # 응답 파싱 및 구조화
            analysis = self._parse_llm_response(response)
            
            # 분석 이력에 추가
            self.analysis_history.append({
                "timestamp": datetime.now(),
                "input_data": system_data,
                "analysis": analysis
            })
            
            return analysis
            
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return self._fallback_analysis(system_data)
    
    def _create_analysis_prompt(self, system_data: Dict[str, Any]) -> str:
        """LLM 분석용 프롬프트 생성"""
        prompt = f"""
        System Health Analysis Request
        
        Please analyze the following system data and provide insights:
        
        Components: {system_data.get('component_count', 0)}
        Overall Health: {system_data.get('overall_health', 'unknown')}
        Risk Factors: {system_data.get('risk_factors', [])}
        Recent Trends: {system_data.get('trends', {})}
        Predicted Failures: {system_data.get('predicted_failures', [])}
        
        Please provide:
        1. Root cause analysis
        2. Recommended immediate actions
        3. Long-term optimization strategies
        4. Risk mitigation suggestions
        5. Performance improvement opportunities
        
        Format your response as structured JSON with clear sections.
        """
        
        return prompt
    
    async def _call_llm(self, prompt: str) -> str:
        """LLM 호출 (모의 구현)"""
        # 실제 구현에서는 OpenAI API, Anthropic API 등을 사용
        # 여기서는 샘플 응답 반환
        await asyncio.sleep(0.1)  # API 호출 시뮬레이션
        
        return """
        {
            "root_cause_analysis": {
                "primary_causes": ["High memory usage", "CPU bottleneck"],
                "contributing_factors": ["Increased load", "Memory leak"],
                "confidence": 0.85
            },
            "immediate_actions": [
                "Scale up memory allocation",
                "Restart affected services",
                "Monitor CPU usage closely"
            ],
            "long_term_strategies": [
                "Implement auto-scaling",
                "Code optimization",
                "Performance monitoring improvements"
            ],
            "risk_mitigation": [
                "Set up alerting thresholds",
                "Create backup procedures",
                "Implement circuit breakers"
            ],
            "performance_opportunities": [
                "Database query optimization",
                "Caching implementation",
                "Load balancing improvements"
            ]
        }
        """
    
    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """LLM 응답 파싱"""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # JSON 파싱 실패 시 기본 응답 반환
            return {
                "root_cause_analysis": {"primary_causes": ["Analysis failed"], "confidence": 0.1},
                "immediate_actions": ["Manual investigation required"],
                "long_term_strategies": ["Improve monitoring"],
                "risk_mitigation": ["Regular health checks"],
                "performance_opportunities": ["System optimization review"]
            }
    
    def _fallback_analysis(self, system_data: Dict[str, Any]) -> Dict[str, Any]:
        """LLM 없이 기본 분석"""
        return {
            "root_cause_analysis": {
                "primary_causes": ["System analysis without LLM"],
                "confidence": 0.6
            },
            "immediate_actions": ["Review system metrics", "Check resource usage"],
            "long_term_strategies": ["Implement comprehensive monitoring"],
            "risk_mitigation": ["Regular maintenance", "Backup procedures"],
            "performance_opportunities": ["System optimization", "Resource allocation review"]
        }


class EvolutionaryOptimizer:
    """진화형 최적화기"""
    
    def __init__(self):
        self.generations = []
        self.current_generation = 0
        self.fitness_history = []
        
    def evolve_maintenance_strategy(self, current_strategy: Dict[str, Any], 
                                  performance_data: Dict[str, Any]) -> Dict[str, Any]:
        """유지보수 전략 진화"""
        # 현재 전략의 적합도 평가
        current_fitness = self._evaluate_fitness(current_strategy, performance_data)
        
        # 돌연변이 생성
        mutations = self._create_mutations(current_strategy)
        
        # 각 돌연변이의 적합도 평가
        mutation_fitness = []
        for mutation in mutations:
            fitness = self._evaluate_fitness(mutation, performance_data)
            mutation_fitness.append((mutation, fitness))
        
        # 최적 전략 선택
        best_mutation = max(mutation_fitness, key=lambda x: x[1])
        
        if best_mutation[1] > current_fitness:
            # 더 나은 전략 발견
            evolved_strategy = best_mutation[0]
            evolved_strategy["generation"] = self.current_generation + 1
            evolved_strategy["fitness_improvement"] = best_mutation[1] - current_fitness
        else:
            # 현재 전략 유지
            evolved_strategy = current_strategy.copy()
            evolved_strategy["fitness_improvement"] = 0
        
        # 세대 기록
        self.generations.append(evolved_strategy)
        self.fitness_history.append(best_mutation[1])
        self.current_generation += 1
        
        return evolved_strategy
    
    def _evaluate_fitness(self, strategy: Dict[str, Any], 
                         performance_data: Dict[str, Any]) -> float:
        """전략 적합도 평가"""
        fitness = 0.0
        
        # 비용 효율성 (낮을수록 좋음)
        cost_efficiency = 1.0 / (strategy.get("estimated_cost", 1000) + 1)
        fitness += cost_efficiency * 0.3
        
        # 시간 효율성 (빠를수록 좋음)
        time_efficiency = 1.0 / (strategy.get("estimated_duration_hours", 24) + 1)
        fitness += time_efficiency * 0.2
        
        # 성공률 (높을수록 좋음)
        success_rate = strategy.get("success_probability", 0.5)
        fitness += success_rate * 0.3
        
        # 리스크 감소 (높을수록 좋음)
        risk_reduction = strategy.get("risk_reduction", 0.5)
        fitness += risk_reduction * 0.2
        
        return fitness
    
    def _create_mutations(self, base_strategy: Dict[str, Any]) -> List[Dict[str, Any]]:
        """전략 돌연변이 생성"""
        mutations = []
        
        for i in range(5):  # 5개의 돌연변이 생성
            mutation = base_strategy.copy()
            
            # 비용 변경
            cost_change = np.random.uniform(0.8, 1.2)
            mutation["estimated_cost"] = mutation.get("estimated_cost", 1000) * cost_change
            
            # 시간 변경
            time_change = np.random.uniform(0.9, 1.1)
            mutation["estimated_duration_hours"] = mutation.get("estimated_duration_hours", 24) * time_change
            
            # 성공률 변경
            success_change = np.random.uniform(-0.1, 0.1)
            mutation["success_probability"] = np.clip(
                mutation.get("success_probability", 0.5) + success_change, 0.0, 1.0
            )
            
            mutations.append(mutation)
        
        return mutations
    
    def get_evolution_summary(self) -> Dict[str, Any]:
        """진화 요약 정보"""
        if not self.fitness_history:
            return {"status": "no_evolution_data"}
        
        return {
            "total_generations": len(self.generations),
            "fitness_trend": "improving" if self.fitness_history[-1] > self.fitness_history[0] else "declining",
            "best_fitness": max(self.fitness_history),
            "current_fitness": self.fitness_history[-1],
            "improvement_rate": (self.fitness_history[-1] - self.fitness_history[0]) / len(self.fitness_history)
        }


class ContinuousImprovementSystem:
    """지속적 개선 시스템"""
    
    def __init__(self):
        self.improvement_cycles = []
        self.feedback_data = []
        self.llm_analyzer = LLMIntegratedAnalyzer()
        self.evolutionary_optimizer = EvolutionaryOptimizer()
        
    async def run_improvement_cycle(self, system_data: Dict[str, Any]) -> Dict[str, Any]:
        """개선 사이클 실행"""
        cycle_start = datetime.now()
        
        # 1. LLM 기반 분석
        llm_analysis = await self.llm_analyzer.analyze_with_llm(system_data)
        
        # 2. 현재 전략 평가
        current_strategy = system_data.get("maintenance_strategy", {})
        performance_data = system_data.get("performance_data", {})
        
        # 3. 진화형 최적화
        evolved_strategy = self.evolutionary_optimizer.evolve_maintenance_strategy(
            current_strategy, performance_data
        )
        
        # 4. 개선 계획 생성
        improvement_plan = self._create_improvement_plan(llm_analysis, evolved_strategy)
        
        # 5. 사이클 결과 기록
        cycle_result = {
            "cycle_id": len(self.improvement_cycles) + 1,
            "timestamp": cycle_start,
            "duration": datetime.now() - cycle_start,
            "llm_analysis": llm_analysis,
            "evolved_strategy": evolved_strategy,
            "improvement_plan": improvement_plan,
            "success": True
        }
        
        self.improvement_cycles.append(cycle_result)
        
        return cycle_result
    
    def _create_improvement_plan(self, llm_analysis: Dict[str, Any], 
                               evolved_strategy: Dict[str, Any]) -> Dict[str, Any]:
        """개선 계획 생성"""
        plan = {
            "immediate_actions": llm_analysis.get("immediate_actions", []),
            "strategic_changes": evolved_strategy,
            "timeline": self._create_timeline(llm_analysis, evolved_strategy),
            "resource_requirements": self._estimate_resources(evolved_strategy),
            "expected_benefits": self._estimate_benefits(llm_analysis, evolved_strategy),
            "risk_assessment": self._assess_implementation_risks(evolved_strategy)
        }
        
        return plan
    
    def _create_timeline(self, llm_analysis: Dict[str, Any], 
                        evolved_strategy: Dict[str, Any]) -> Dict[str, str]:
        """구현 타임라인 생성"""
        return {
            "immediate": "0-24 hours",
            "short_term": "1-7 days", 
            "medium_term": "1-4 weeks",
            "long_term": "1-3 months"
        }
    
    def _estimate_resources(self, strategy: Dict[str, Any]) -> Dict[str, Any]:
        """리소스 요구사항 추정"""
        return {
            "personnel": strategy.get("required_personnel", 2),
            "budget": strategy.get("estimated_cost", 5000),
            "tools": strategy.get("required_tools", ["monitoring", "automation"]),
            "downtime": strategy.get("estimated_downtime", "minimal")
        }
    
    def _estimate_benefits(self, llm_analysis: Dict[str, Any], 
                         strategy: Dict[str, Any]) -> Dict[str, Any]:
        """예상 효과 추정"""
        return {
            "cost_savings": strategy.get("estimated_cost", 5000) * 0.2,  # 20% 절약
            "performance_improvement": "15-25%",
            "reliability_increase": strategy.get("success_probability", 0.7),
            "risk_reduction": strategy.get("risk_reduction", 0.4)
        }
    
    def _assess_implementation_risks(self, strategy: Dict[str, Any]) -> Dict[str, Any]:
        """구현 위험 평가"""
        complexity = strategy.get("complexity", "medium")
        
        risk_levels = {
            "low": {"probability": 0.1, "impact": "minimal"},
            "medium": {"probability": 0.3, "impact": "moderate"},
            "high": {"probability": 0.6, "impact": "significant"}
        }
        
        return risk_levels.get(complexity, risk_levels["medium"])
    
    def add_feedback(self, cycle_id: int, feedback: Dict[str, Any]):
        """사용자 피드백 추가"""
        feedback_entry = {
            "cycle_id": cycle_id,
            "timestamp": datetime.now(),
            "feedback": feedback,
            "satisfaction_score": feedback.get("satisfaction", 5)  # 1-10 스케일
        }
        
        self.feedback_data.append(feedback_entry)
    
    def get_improvement_metrics(self) -> Dict[str, Any]:
        """개선 메트릭 반환"""
        if not self.improvement_cycles:
            return {"status": "no_data"}
        
        # 평균 사이클 시간
        avg_cycle_time = sum(
            cycle["duration"].total_seconds() for cycle in self.improvement_cycles
        ) / len(self.improvement_cycles)
        
        # 피드백 점수 평균
        avg_satisfaction = 0
        if self.feedback_data:
            avg_satisfaction = sum(
                feedback["satisfaction_score"] for feedback in self.feedback_data
            ) / len(self.feedback_data)
        
        # 진화 요약
        evolution_summary = self.evolutionary_optimizer.get_evolution_summary()
        
        return {
            "total_cycles": len(self.improvement_cycles),
            "average_cycle_time_seconds": avg_cycle_time,
            "average_satisfaction_score": avg_satisfaction,
            "evolution_summary": evolution_summary,
            "last_cycle": self.improvement_cycles[-1]["timestamp"].isoformat(),
            "success_rate": sum(1 for cycle in self.improvement_cycles if cycle["success"]) / len(self.improvement_cycles)
        }


# 통합 API 클래스
class SelfEvolvingMaintenanceAPI:
    """자가 발전형 유지보수 API"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.maintenance_engine = PredictiveMaintenanceEngine(config)
        self.improvement_system = ContinuousImprovementSystem()
        self.is_running = False
        
    async def start_monitoring(self):
        """모니터링 시작"""
        self.is_running = True
        logger.info("Self-evolving maintenance system started")
        
        # 백그라운드 작업 시작
        asyncio.create_task(self._background_monitoring())
        asyncio.create_task(self._background_improvement())
    
    async def stop_monitoring(self):
        """모니터링 중지"""
        self.is_running = False
        self.maintenance_engine.cleanup()
        logger.info("Self-evolving maintenance system stopped")
    
    async def _background_monitoring(self):
        """백그라운드 모니터링 루프"""
        while self.is_running:
            try:
                # 예측 사이클 실행
                predictions = await self.maintenance_engine.run_prediction_cycle()
                
                # 임박한 장애에 대한 즉시 대응
                for prediction in predictions:
                    if prediction.is_imminent:
                        logger.warning(f"Imminent failure detected: {prediction.component_id}")
                        # 자동 대응 로직 실행
                
                await asyncio.sleep(300)  # 5분 대기
                
            except Exception as e:
                logger.error(f"Background monitoring error: {e}")
                await asyncio.sleep(60)  # 에러 시 1분 대기
    
    async def _background_improvement(self):
        """백그라운드 개선 루프"""
        while self.is_running:
            try:
                # 시스템 데이터 수집
                system_data = {
                    "metrics": self.maintenance_engine.get_system_metrics(),
                    "health_report": self.maintenance_engine.generate_system_health_report(),
                    "maintenance_strategy": {},  # 현재 전략
                    "performance_data": {}  # 성능 데이터
                }
                
                # 개선 사이클 실행
                improvement_result = await self.improvement_system.run_improvement_cycle(system_data)
                logger.info(f"Improvement cycle completed: {improvement_result['cycle_id']}")
                
                await asyncio.sleep(3600)  # 1시간 대기
                
            except Exception as e:
                logger.error(f"Background improvement error: {e}")
                await asyncio.sleep(600)  # 에러 시 10분 대기
    
    # API 메서드들
    def add_metrics(self, metrics: ComponentMetrics) -> bool:
        """메트릭 추가"""
        return self.maintenance_engine.add_component_metrics(metrics)
    
    def register_component(self, component_id: str, component_type: ComponentType) -> bool:
        """컴포넌트 등록"""
        return self.maintenance_engine.register_component(component_id, component_type)
    
    def get_health_report(self) -> SystemHealthReport:
        """건강 보고서 반환"""
        return self.maintenance_engine.generate_system_health_report()
    
    def get_maintenance_schedule(self) -> MaintenanceSchedule:
        """유지보수 스케줄 반환"""
        return self.maintenance_engine.create_maintenance_schedule()
    
    def get_improvement_metrics(self) -> Dict[str, Any]:
        """개선 메트릭 반환"""
        return self.improvement_system.get_improvement_metrics()
    
    def provide_feedback(self, cycle_id: int, feedback: Dict[str, Any]):
        """피드백 제공"""
        self.improvement_system.add_feedback(cycle_id, feedback)


# 사용 예제 (자가 발전형 시스템)
async def main_example():
    """메인 예제 실행"""
    # API 초기화
    api = SelfEvolvingMaintenanceAPI({
        "prediction_interval_minutes": 10,
        "health_check_interval_minutes": 5
    })
    
    # 컴포넌트 등록
    api.register_component("web_server_1", ComponentType.SERVER)
    api.register_component("db_primary", ComponentType.DATABASE)
    api.register_component("cache_redis", ComponentType.CACHE)
    
    # 모니터링 시작
    await api.start_monitoring()
    
    # 샘플 메트릭 지속적 추가
    for i in range(50):
        # 각 컴포넌트에 메트릭 추가
        api.add_metrics(create_sample_metrics("web_server_1", ComponentType.SERVER))
        api.add_metrics(create_sample_metrics("db_primary", ComponentType.DATABASE))
        api.add_metrics(create_sample_metrics("cache_redis", ComponentType.CACHE))
        
        await asyncio.sleep(10)  # 10초 간격
        
        # 10번째마다 상태 확인
        if i % 10 == 0:
            health_report = api.get_health_report()
            print(f"Cycle {i}: Health={health_report.overall_health.value}, "
                  f"Predictions={len(health_report.predicted_failures)}")
            
            # 개선 메트릭 확인
            improvement_metrics = api.get_improvement_metrics()
            if improvement_metrics.get("total_cycles", 0) > 0:
                print(f"Improvement cycles: {improvement_metrics['total_cycles']}")
    
    # 모니터링 중지
    await api.stop_monitoring()
    
    # 최종 보고서
    final_health = api.get_health_report()
    final_schedule = api.get_maintenance_schedule()
    final_improvements = api.get_improvement_metrics()
    
    print("\n=== Final Report ===")
    print(f"System Health: {final_health.overall_health.value}")
    print(f"Maintenance Tasks: {len(final_schedule.tasks)}")
    print(f"Improvement Cycles: {final_improvements.get('total_cycles', 0)}")
    print(f"Success Rate: {final_improvements.get('success_rate', 0):.2%}")


# 실행
if __name__ == "__main__":
    print("Starting Self-Evolving Predictive Maintenance Engine...")
    asyncio.run(main_example())