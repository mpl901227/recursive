#!/usr/bin/env python3
"""
Continuous Learning Engine
자가 발전형 LLM 연동 IDE를 위한 지속적 학습 엔진

주요 기능:
- 사용자 피드백 기반 실시간 학습
- 솔루션 성능 추적 및 가중치 조정
- 패턴 라이브러리 자동 구축
- 개인화된 학습 모델 적응
- 집단 지성 기반 지식 공유
- 멀티모달 학습 (코드, 로그, 메트릭)
- 세대별 모델 진화 관리
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Set, Union, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import defaultdict, deque
import numpy as np
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import pickle
import hashlib
from pathlib import Path
import sqlite3
import aiofiles
import weakref
from functools import lru_cache, wraps
from contextlib import asynccontextmanager
import math
import statistics

# 외부 라이브러리 (선택적)
try:
    import numpy as np
    import pandas as pd
    from sklearn.cluster import KMeans
    from sklearn.metrics.pairwise import cosine_similarity
    from sklearn.feature_extraction.text import TfidfVectorizer
    HAS_ML_LIBS = True
except ImportError:
    HAS_ML_LIBS = False
    np = None

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class FeedbackType(Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"


class LearningSignalType(Enum):
    SOLUTION_EFFECTIVENESS = "solution_effectiveness"
    USER_PREFERENCE = "user_preference"
    PATTERN_DISCOVERY = "pattern_discovery"
    PERFORMANCE_IMPROVEMENT = "performance_improvement"
    ERROR_CORRECTION = "error_correction"


class ModelEvolutionStrategy(Enum):
    INCREMENTAL = "incremental"
    GENERATIONAL = "generational"
    HYBRID = "hybrid"
    ENSEMBLE = "ensemble"


class KnowledgeSource(Enum):
    USER_FEEDBACK = "user_feedback"
    SYSTEM_METRICS = "system_metrics"
    CODE_ANALYSIS = "code_analysis"
    LOG_PATTERNS = "log_patterns"
    EXTERNAL_API = "external_api"


# 데이터 클래스들
@dataclass
class UserFeedback:
    """사용자 피드백"""
    feedback_id: str
    user_id: str
    solution_id: str
    feedback_type: FeedbackType
    rating: float  # 0.0 - 1.0
    comment: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LearningSignal:
    """학습 신호"""
    signal_id: str
    signal_type: LearningSignalType
    strength: float  # 학습 신호의 강도 (0.0 - 1.0)
    source: KnowledgeSource
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.now)
    confidence: float = 1.0


@dataclass
class SolutionOutcome:
    """솔루션 결과"""
    solution_id: str
    success: bool
    performance_metrics: Dict[str, float]
    error_rate: float
    user_satisfaction: float
    execution_time: float
    resource_usage: Dict[str, float]
    side_effects: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class Pattern:
    """학습된 패턴"""
    pattern_id: str
    pattern_type: str
    description: str
    conditions: Dict[str, Any]
    actions: List[Dict[str, Any]]
    confidence: float
    usage_count: int = 0
    success_rate: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    last_used: Optional[datetime] = None


@dataclass
class UserProfile:
    """사용자 프로필"""
    user_id: str
    preferences: Dict[str, Any] = field(default_factory=dict)
    skill_level: str = "intermediate"
    coding_style: Dict[str, Any] = field(default_factory=dict)
    frequent_patterns: List[str] = field(default_factory=list)
    learning_rate: float = 0.1
    feedback_history: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    last_active: datetime = field(default_factory=datetime.now)


@dataclass
class KnowledgeGraphNode:
    """지식 그래프 노드"""
    node_id: str
    node_type: str
    properties: Dict[str, Any]
    connections: Set[str] = field(default_factory=set)
    weight: float = 1.0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class ModelGeneration:
    """모델 세대"""
    generation_id: str
    parent_generation: Optional[str]
    model_weights: Dict[str, float]
    performance_metrics: Dict[str, float]
    training_data_size: int
    created_at: datetime = field(default_factory=datetime.now)
    fitness_score: float = 0.0


# 커스텀 예외
class LearningEngineError(Exception):
    """학습 엔진 기본 예외"""
    pass


class InsufficientDataError(LearningEngineError):
    """데이터 부족 예외"""
    pass


class ModelEvolutionError(LearningEngineError):
    """모델 진화 오류"""
    pass


# 성능 측정 데코레이터
def measure_learning_performance(func):
    """학습 성능 측정 데코레이터"""
    @wraps(func)
    async def async_wrapper(self, *args, **kwargs):
        start_time = time.time()
        try:
            result = await func(self, *args, **kwargs)
            execution_time = time.time() - start_time
            self.performance_tracker.record_operation(
                func.__name__, execution_time, True
            )
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            self.performance_tracker.record_operation(
                func.__name__, execution_time, False
            )
            logger.error(f"Learning operation {func.__name__} failed: {e}")
            raise
    
    @wraps(func)
    def sync_wrapper(self, *args, **kwargs):
        start_time = time.time()
        try:
            result = func(self, *args, **kwargs)
            execution_time = time.time() - start_time
            self.performance_tracker.record_operation(
                func.__name__, execution_time, True
            )
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            self.performance_tracker.record_operation(
                func.__name__, execution_time, False
            )
            logger.error(f"Learning operation {func.__name__} failed: {e}")
            raise
    
    return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper


class PerformanceTracker:
    """성능 추적기"""
    
    def __init__(self):
        self.operations = defaultdict(list)
        self.lock = threading.RLock()
    
    def record_operation(self, operation: str, execution_time: float, success: bool):
        """작업 기록"""
        with self.lock:
            self.operations[operation].append({
                'execution_time': execution_time,
                'success': success,
                'timestamp': datetime.now()
            })
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """성능 통계 반환"""
        with self.lock:
            stats = {}
            for operation, records in self.operations.items():
                if records:
                    execution_times = [r['execution_time'] for r in records]
                    success_count = sum(1 for r in records if r['success'])
                    
                    stats[operation] = {
                        'avg_execution_time': statistics.mean(execution_times),
                        'min_execution_time': min(execution_times),
                        'max_execution_time': max(execution_times),
                        'success_rate': success_count / len(records),
                        'total_calls': len(records)
                    }
            return stats


class FeedbackProcessor:
    """피드백 처리기"""
    
    def __init__(self):
        self.feedback_buffer = deque(maxlen=10000)
        self.sentiment_analyzer = SentimentAnalyzer()
        self.feedback_aggregator = FeedbackAggregator()
    
    async def process_feedback(self, feedback: UserFeedback) -> LearningSignal:
        """피드백 처리 및 학습 신호 생성"""
        # 피드백 검증
        if not self._validate_feedback(feedback):
            raise ValueError("Invalid feedback data")
        
        # 버퍼에 추가
        self.feedback_buffer.append(feedback)
        
        # 감정 분석
        sentiment_score = await self._analyze_sentiment(feedback)
        
        # 학습 신호 강도 계산
        signal_strength = self._calculate_signal_strength(feedback, sentiment_score)
        
        # 학습 신호 생성
        learning_signal = LearningSignal(
            signal_id=str(uuid.uuid4()),
            signal_type=self._determine_signal_type(feedback),
            strength=signal_strength,
            source=KnowledgeSource.USER_FEEDBACK,
            data={
                'feedback': asdict(feedback),
                'sentiment_score': sentiment_score,
                'processed_at': datetime.now().isoformat()
            },
            confidence=self._calculate_confidence(feedback)
        )
        
        logger.info(f"Processed feedback {feedback.feedback_id} -> signal {learning_signal.signal_id}")
        return learning_signal
    
    def _validate_feedback(self, feedback: UserFeedback) -> bool:
        """피드백 유효성 검증"""
        return (
            feedback.feedback_id and
            feedback.user_id and
            feedback.solution_id and
            0.0 <= feedback.rating <= 1.0
        )
    
    async def _analyze_sentiment(self, feedback: UserFeedback) -> float:
        """감정 분석"""
        if not feedback.comment:
            return feedback.rating
        
        return await self.sentiment_analyzer.analyze(feedback.comment)
    
    def _calculate_signal_strength(self, feedback: UserFeedback, sentiment: float) -> float:
        """학습 신호 강도 계산"""
        # 평점과 감정 분석 결과 조합
        base_strength = (feedback.rating + sentiment) / 2
        
        # 피드백 타입에 따른 가중치
        type_weights = {
            FeedbackType.POSITIVE: 1.0,
            FeedbackType.NEGATIVE: 1.2,  # 부정적 피드백에 더 높은 가중치
            FeedbackType.BUG_REPORT: 1.5,
            FeedbackType.FEATURE_REQUEST: 0.8,
            FeedbackType.NEUTRAL: 0.6
        }
        
        weight = type_weights.get(feedback.feedback_type, 1.0)
        return min(base_strength * weight, 1.0)
    
    def _determine_signal_type(self, feedback: UserFeedback) -> LearningSignalType:
        """학습 신호 타입 결정"""
        if feedback.feedback_type == FeedbackType.BUG_REPORT:
            return LearningSignalType.ERROR_CORRECTION
        elif feedback.rating > 0.7:
            return LearningSignalType.SOLUTION_EFFECTIVENESS
        else:
            return LearningSignalType.USER_PREFERENCE
    
    def _calculate_confidence(self, feedback: UserFeedback) -> float:
        """신뢰도 계산"""
        confidence = 0.5  # 기본 신뢰도
        
        # 댓글이 있으면 신뢰도 증가
        if feedback.comment and len(feedback.comment) > 10:
            confidence += 0.2
        
        # 극단적 평점은 신뢰도 증가
        if feedback.rating < 0.2 or feedback.rating > 0.8:
            confidence += 0.2
        
        # 컨텍스트 정보가 많으면 신뢰도 증가
        if len(feedback.context) > 3:
            confidence += 0.1
        
        return min(confidence, 1.0)


class SentimentAnalyzer:
    """감정 분석기"""
    
    def __init__(self):
        self.positive_words = {
            'good', 'great', 'excellent', 'perfect', 'amazing', 'helpful',
            'useful', 'fast', 'efficient', 'clean', 'simple', 'intuitive'
        }
        self.negative_words = {
            'bad', 'terrible', 'awful', 'slow', 'buggy', 'confusing',
            'complex', 'difficult', 'broken', 'useless', 'frustrating'
        }
    
    async def analyze(self, text: str) -> float:
        """감정 분석 수행"""
        if not text:
            return 0.5
        
        words = text.lower().split()
        
        positive_count = sum(1 for word in words if word in self.positive_words)
        negative_count = sum(1 for word in words if word in self.negative_words)
        
        if positive_count + negative_count == 0:
            return 0.5
        
        sentiment_score = positive_count / (positive_count + negative_count)
        return sentiment_score


class FeedbackAggregator:
    """피드백 집계기"""
    
    def __init__(self):
        self.aggregated_data = defaultdict(list)
    
    def aggregate_by_solution(self, feedbacks: List[UserFeedback]) -> Dict[str, Dict[str, Any]]:
        """솔루션별 피드백 집계"""
        solution_stats = defaultdict(lambda: {
            'ratings': [],
            'feedback_types': defaultdict(int),
            'total_count': 0
        })
        
        for feedback in feedbacks:
            stats = solution_stats[feedback.solution_id]
            stats['ratings'].append(feedback.rating)
            stats['feedback_types'][feedback.feedback_type.value] += 1
            stats['total_count'] += 1
        
        # 통계 계산
        result = {}
        for solution_id, stats in solution_stats.items():
            ratings = stats['ratings']
            result[solution_id] = {
                'avg_rating': statistics.mean(ratings),
                'rating_std': statistics.stdev(ratings) if len(ratings) > 1 else 0,
                'total_feedback': stats['total_count'],
                'feedback_distribution': dict(stats['feedback_types'])
            }
        
        return result


class PatternLibrary:
    """패턴 라이브러리"""
    
    def __init__(self, storage_path: str = "patterns.db"):
        self.storage_path = storage_path
        self.patterns: Dict[str, Pattern] = {}
        self.pattern_index = {}  # 빠른 검색을 위한 인덱스
        self.lock = threading.RLock()
        self._init_storage()
    
    def _init_storage(self):
        """저장소 초기화"""
        try:
            conn = sqlite3.connect(self.storage_path)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS patterns (
                    pattern_id TEXT PRIMARY KEY,
                    pattern_type TEXT,
                    description TEXT,
                    conditions TEXT,
                    actions TEXT,
                    confidence REAL,
                    usage_count INTEGER,
                    success_rate REAL,
                    created_at TEXT,
                    last_used TEXT
                )
            ''')
            conn.commit()
            conn.close()
            self._load_patterns()
        except Exception as e:
            logger.error(f"Failed to initialize pattern storage: {e}")
    
    def _load_patterns(self):
        """저장된 패턴 로드"""
        try:
            conn = sqlite3.connect(self.storage_path)
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM patterns")
            
            for row in cursor.fetchall():
                pattern = Pattern(
                    pattern_id=row[0],
                    pattern_type=row[1],
                    description=row[2],
                    conditions=json.loads(row[3]),
                    actions=json.loads(row[4]),
                    confidence=row[5],
                    usage_count=row[6],
                    success_rate=row[7],
                    created_at=datetime.fromisoformat(row[8]),
                    last_used=datetime.fromisoformat(row[9]) if row[9] else None
                )
                self.patterns[pattern.pattern_id] = pattern
            
            conn.close()
            logger.info(f"Loaded {len(self.patterns)} patterns from storage")
        except Exception as e:
            logger.error(f"Failed to load patterns: {e}")
    
    async def add_pattern(self, pattern: Pattern) -> bool:
        """패턴 추가"""
        with self.lock:
            try:
                # 중복 패턴 검사
                if await self._is_duplicate_pattern(pattern):
                    logger.info(f"Pattern {pattern.pattern_id} is duplicate, merging...")
                    return await self._merge_pattern(pattern)
                
                self.patterns[pattern.pattern_id] = pattern
                await self._save_pattern(pattern)
                await self._update_pattern_index(pattern)
                
                logger.info(f"Added new pattern: {pattern.pattern_id}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to add pattern: {e}")
                return False
    
    async def find_matching_patterns(self, conditions: Dict[str, Any]) -> List[Pattern]:
        """조건에 맞는 패턴 찾기"""
        matching_patterns = []
        
        for pattern in self.patterns.values():
            if await self._matches_conditions(pattern, conditions):
                matching_patterns.append(pattern)
        
        # 신뢰도와 성공률로 정렬
        matching_patterns.sort(
            key=lambda p: (p.confidence * p.success_rate, p.usage_count),
            reverse=True
        )
        
        return matching_patterns
    
    async def update_pattern_performance(self, pattern_id: str, success: bool):
        """패턴 성능 업데이트"""
        with self.lock:
            if pattern_id not in self.patterns:
                return
            
            pattern = self.patterns[pattern_id]
            pattern.usage_count += 1
            pattern.last_used = datetime.now()
            
            # 성공률 업데이트 (지수 이동 평균)
            alpha = 0.1  # 학습률
            new_success = 1.0 if success else 0.0
            pattern.success_rate = (
                alpha * new_success + (1 - alpha) * pattern.success_rate
            )
            
            await self._save_pattern(pattern)
    
    async def _is_duplicate_pattern(self, new_pattern: Pattern) -> bool:
        """중복 패턴 검사"""
        for existing_pattern in self.patterns.values():
            if (existing_pattern.pattern_type == new_pattern.pattern_type and
                await self._similarity_score(existing_pattern, new_pattern) > 0.8):
                return True
        return False
    
    async def _similarity_score(self, pattern1: Pattern, pattern2: Pattern) -> float:
        """패턴 유사도 계산"""
        # 간단한 유사도 계산 (실제로는 더 정교한 알고리즘 필요)
        conditions1 = set(pattern1.conditions.keys())
        conditions2 = set(pattern2.conditions.keys())
        
        if not conditions1 or not conditions2:
            return 0.0
        
        intersection = len(conditions1 & conditions2)
        union = len(conditions1 | conditions2)
        
        return intersection / union if union > 0 else 0.0
    
    async def _matches_conditions(self, pattern: Pattern, conditions: Dict[str, Any]) -> bool:
        """조건 매칭 확인"""
        for key, expected_value in pattern.conditions.items():
            if key not in conditions:
                continue
            
            actual_value = conditions[key]
            
            # 타입별 매칭 로직
            if isinstance(expected_value, str):
                if actual_value != expected_value:
                    return False
            elif isinstance(expected_value, (int, float)):
                if abs(actual_value - expected_value) > 0.1:
                    return False
            elif isinstance(expected_value, dict):
                if 'min' in expected_value and actual_value < expected_value['min']:
                    return False
                if 'max' in expected_value and actual_value > expected_value['max']:
                    return False
        
        return True
    
    async def _save_pattern(self, pattern: Pattern):
        """패턴 저장"""
        try:
            conn = sqlite3.connect(self.storage_path)
            conn.execute('''
                INSERT OR REPLACE INTO patterns 
                (pattern_id, pattern_type, description, conditions, actions, 
                 confidence, usage_count, success_rate, created_at, last_used)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                pattern.pattern_id,
                pattern.pattern_type,
                pattern.description,
                json.dumps(pattern.conditions),
                json.dumps(pattern.actions),
                pattern.confidence,
                pattern.usage_count,
                pattern.success_rate,
                pattern.created_at.isoformat(),
                pattern.last_used.isoformat() if pattern.last_used else None
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to save pattern: {e}")
    
    async def _update_pattern_index(self, pattern: Pattern):
        """패턴 인덱스 업데이트"""
        # 검색 성능을 위한 인덱스 구축
        for key in pattern.conditions.keys():
            if key not in self.pattern_index:
                self.pattern_index[key] = set()
            self.pattern_index[key].add(pattern.pattern_id)
    
    async def _merge_pattern(self, new_pattern: Pattern) -> bool:
        """중복 패턴 병합"""
        # 기존 패턴과 새 패턴을 병합하는 로직
        # 실제 구현에서는 더 정교한 병합 전략 필요
        for existing_pattern in self.patterns.values():
            if await self._similarity_score(existing_pattern, new_pattern) > 0.8:
                # 신뢰도 업데이트
                existing_pattern.confidence = max(existing_pattern.confidence, new_pattern.confidence)
                await self._save_pattern(existing_pattern)
                return True
        return False


class KnowledgeGraph:
    """지식 그래프"""
    
    def __init__(self):
        self.nodes: Dict[str, KnowledgeGraphNode] = {}
        self.edges: Dict[str, Set[str]] = defaultdict(set)
        self.lock = threading.RLock()
    
    async def add_node(self, node: KnowledgeGraphNode):
        """노드 추가"""
        with self.lock:
            self.nodes[node.node_id] = node
            logger.debug(f"Added knowledge graph node: {node.node_id}")
    
    async def add_connection(self, node1_id: str, node2_id: str, weight: float = 1.0):
        """연결 추가"""
        with self.lock:
            if node1_id in self.nodes and node2_id in self.nodes:
                self.edges[node1_id].add(node2_id)
                self.edges[node2_id].add(node1_id)
                
                # 노드에도 연결 정보 추가
                self.nodes[node1_id].connections.add(node2_id)
                self.nodes[node2_id].connections.add(node1_id)
    
    async def find_related_nodes(self, node_id: str, max_depth: int = 3) -> List[KnowledgeGraphNode]:
        """관련 노드 찾기"""
        if node_id not in self.nodes:
            return []
        
        visited = set()
        related_nodes = []
        queue = deque([(node_id, 0)])
        
        while queue:
            current_id, depth = queue.popleft()
            
            if current_id in visited or depth > max_depth:
                continue
            
            visited.add(current_id)
            if depth > 0:  # 시작 노드는 제외
                related_nodes.append(self.nodes[current_id])
            
            # 연결된 노드들을 큐에 추가
            for connected_id in self.edges[current_id]:
                if connected_id not in visited:
                    queue.append((connected_id, depth + 1))
        
        return related_nodes
    
    async def calculate_node_importance(self, node_id: str) -> float:
        """노드 중요도 계산 (PageRank 스타일)"""
        if node_id not in self.nodes:
            return 0.0
        
        # 간단한 중요도 계산: 연결 수 + 가중치
        node = self.nodes[node_id]
        connection_score = len(node.connections) * 0.1
        weight_score = node.weight
        
        return min(connection_score + weight_score, 1.0)
    
    async def suggest_new_connections(self, node_id: str) -> List[Tuple[str, float]]:
        """새로운 연결 제안"""
        if node_id not in self.nodes:
            return []
        
        current_node = self.nodes[node_id]
        suggestions = []
        
        # 현재 노드와 유사한 속성을 가진 노드들 찾기
        for other_id, other_node in self.nodes.items():
            if other_id == node_id or other_id in current_node.connections:
                continue
            
            similarity = await self._calculate_node_similarity(current_node, other_node)
            if similarity > 0.5:
                suggestions.append((other_id, similarity))
        
        # 유사도 순으로 정렬
        suggestions.sort(key=lambda x: x[1], reverse=True)
        return suggestions[:5]  # 상위 5개만 반환
    
    async def _calculate_node_similarity(self, node1: KnowledgeGraphNode, node2: KnowledgeGraphNode) -> float:
        """노드 유사도 계산"""
        if node1.node_type != node2.node_type:
            return 0.0
        
        # 속성 기반 유사도 계산
        props1 = set(node1.properties.keys())
        props2 = set(node2.properties.keys())
        
        if not props1 or not props2:
            return 0.0
        
        intersection = len(props1 & props2)
        union = len(props1 | props2)
        
        return intersection / union if union > 0 else 0.0


class ModelEvolutionManager:
    """모델 진화 관리자"""
    
    def __init__(self, strategy: ModelEvolutionStrategy = ModelEvolutionStrategy.HYBRID):
        self.strategy = strategy
        self.generations: List[ModelGeneration] = []
        self.current_generation: Optional[ModelGeneration] = None
        self.evolution_history = []
        self.lock = threading.RLock()
    
    async def create_initial_generation(self, initial_weights: Dict[str, float]) -> ModelGeneration:
        """초기 세대 생성"""
        generation = ModelGeneration(
            generation_id=str(uuid.uuid4()),
            parent_generation=None,
            model_weights=initial_weights.copy(),
            performance_metrics={},
            training_data_size=0
        )
        
        with self.lock:
            self.generations.append(generation)
            self.current_generation = generation
        
        logger.info(f"Created initial generation: {generation.generation_id}")
        return generation
    
    async def evolve_generation(self, performance_data: Dict[str, float], 
                              training_data_size: int) -> ModelGeneration:
        """새로운 세대 진화"""
        if not self.current_generation:
            raise ModelEvolutionError("No current generation to evolve from")
        
        # 현재 세대의 적합도 점수 업데이트
        self.current_generation.fitness_score = await self._calculate_fitness(
            self.current_generation, performance_data
        )
        
        # 진화 전략에 따른 새 세대 생성
        if self.strategy == ModelEvolutionStrategy.INCREMENTAL:
            new_generation = await self._incremental_evolution(performance_data, training_data_size)
        elif self.strategy == ModelEvolutionStrategy.GENERATIONAL:
            new_generation = await self._generational_evolution(performance_data, training_data_size)
        elif self.strategy == ModelEvolutionStrategy.ENSEMBLE:
            new_generation = await self._ensemble_evolution(performance_data, training_data_size)
        else:  # HYBRID
            new_generation = await self._hybrid_evolution(performance_data, training_data_size)
        
        with self.lock:
            self.generations.append(new_generation)
            self.current_generation = new_generation
            
            # 오래된 세대 정리 (최대 10개 세대 유지)
            if len(self.generations) > 10:
                self.generations = self.generations[-10:]
        
        logger.info(f"Evolved to generation: {new_generation.generation_id}")
        return new_generation
    
    async def _calculate_fitness(self, generation: ModelGeneration, 
                               performance_data: Dict[str, float]) -> float:
        """적합도 점수 계산"""
        if not performance_data:
            return 0.0
        
        # 가중 평균으로 적합도 계산
        weights = {
            'accuracy': 0.3,
            'speed': 0.2,
            'user_satisfaction': 0.3,
            'resource_efficiency': 0.2
        }
        
        fitness = 0.0
        total_weight = 0.0
        
        for metric, value in performance_data.items():
            weight = weights.get(metric, 0.1)
            fitness += value * weight
            total_weight += weight
        
        return fitness / total_weight if total_weight > 0 else 0.0
    
    async def _incremental_evolution(self, performance_data: Dict[str, float], 
                                   training_data_size: int) -> ModelGeneration:
        """점진적 진화"""
        current_weights = self.current_generation.model_weights.copy()
        
        # 성능 데이터를 바탕으로 가중치 조정
        learning_rate = 0.01
        for weight_name, current_value in current_weights.items():
            # 성능에 따른 가중치 조정 (간단한 경사 하강법)
            gradient = performance_data.get(weight_name, 0.0) - 0.5
            current_weights[weight_name] += learning_rate * gradient
            
            # 가중치 범위 제한
            current_weights[weight_name] = max(0.0, min(1.0, current_weights[weight_name]))
        
        return ModelGeneration(
            generation_id=str(uuid.uuid4()),
            parent_generation=self.current_generation.generation_id,
            model_weights=current_weights,
            performance_metrics=performance_data.copy(),
            training_data_size=training_data_size
        )
    
    async def _generational_evolution(self, performance_data: Dict[str, float], 
                                    training_data_size: int) -> ModelGeneration:
        """세대별 진화 (유전 알고리즘)"""
        current_weights = self.current_generation.model_weights.copy()
        
        # 돌연변이 적용
        mutation_rate = 0.1
        for weight_name, current_value in current_weights.items():
            if np and np.random.random() < mutation_rate:
                # 가우시안 노이즈 추가
                noise = np.random.normal(0, 0.05)
                current_weights[weight_name] += noise
                current_weights[weight_name] = max(0.0, min(1.0, current_weights[weight_name]))
        
        # 교차 (부모 세대들의 가중치 조합)
        if len(self.generations) > 1:
            parent1 = self.current_generation
            parent2 = self.generations[-2]
            
            # 가중 평균으로 교차
            for weight_name in current_weights:
                if weight_name in parent2.model_weights:
                    alpha = 0.7  # parent1에 더 높은 가중치
                    current_weights[weight_name] = (
                        alpha * parent1.model_weights[weight_name] +
                        (1 - alpha) * parent2.model_weights[weight_name]
                    )
        
        return ModelGeneration(
            generation_id=str(uuid.uuid4()),
            parent_generation=self.current_generation.generation_id,
            model_weights=current_weights,
            performance_metrics=performance_data.copy(),
            training_data_size=training_data_size
        )
    
    async def _ensemble_evolution(self, performance_data: Dict[str, float], 
                                training_data_size: int) -> ModelGeneration:
        """앙상블 진화"""
        # 여러 이전 세대의 최고 성능 가중치들을 조합
        if len(self.generations) < 2:
            return await self._incremental_evolution(performance_data, training_data_size)
        
        # 상위 성능 세대들 선별
        top_generations = sorted(
            self.generations[-5:], 
            key=lambda g: g.fitness_score, 
            reverse=True
        )[:3]
        
        # 가중 평균으로 앙상블 가중치 생성
        ensemble_weights = defaultdict(float)
        total_fitness = sum(g.fitness_score for g in top_generations)
        
        if total_fitness > 0:
            for generation in top_generations:
                weight_factor = generation.fitness_score / total_fitness
                for weight_name, weight_value in generation.model_weights.items():
                    ensemble_weights[weight_name] += weight_value * weight_factor
        
        return ModelGeneration(
            generation_id=str(uuid.uuid4()),
            parent_generation=self.current_generation.generation_id,
            model_weights=dict(ensemble_weights),
            performance_metrics=performance_data.copy(),
            training_data_size=training_data_size
        )
    
    async def _hybrid_evolution(self, performance_data: Dict[str, float], 
                              training_data_size: int) -> ModelGeneration:
        """하이브리드 진화 (점진적 + 세대별)"""
        incremental_gen = await self._incremental_evolution(performance_data, training_data_size)
        generational_gen = await self._generational_evolution(performance_data, training_data_size)
        
        # 두 접근법의 가중치를 조합
        hybrid_weights = {}
        for weight_name in incremental_gen.model_weights:
            inc_weight = incremental_gen.model_weights[weight_name]
            gen_weight = generational_gen.model_weights.get(weight_name, inc_weight)
            
            # 성능에 따라 조합 비율 결정
            current_fitness = self.current_generation.fitness_score
            if current_fitness > 0.7:  # 성능이 좋으면 점진적 진화 선호
                hybrid_weights[weight_name] = 0.7 * inc_weight + 0.3 * gen_weight
            else:  # 성능이 낮으면 세대별 진화 선호
                hybrid_weights[weight_name] = 0.3 * inc_weight + 0.7 * gen_weight
        
        return ModelGeneration(
            generation_id=str(uuid.uuid4()),
            parent_generation=self.current_generation.generation_id,
            model_weights=hybrid_weights,
            performance_metrics=performance_data.copy(),
            training_data_size=training_data_size
        )
    
    def get_evolution_history(self) -> List[Dict[str, Any]]:
        """진화 이력 반환"""
        history = []
        for generation in self.generations:
            history.append({
                'generation_id': generation.generation_id,
                'parent_generation': generation.parent_generation,
                'fitness_score': generation.fitness_score,
                'created_at': generation.created_at.isoformat(),
                'performance_metrics': generation.performance_metrics,
                'training_data_size': generation.training_data_size
            })
        return history


class AdaptationEngine:
    """적응 엔진"""
    
    def __init__(self):
        self.user_profiles: Dict[str, UserProfile] = {}
        self.adaptation_rules = {}
        self.lock = threading.RLock()
    
    async def adapt_to_user_preferences(self, user_id: str, 
                                      preferences: Dict[str, Any]) -> UserProfile:
        """사용자 선호도에 맞춘 적응"""
        with self.lock:
            if user_id not in self.user_profiles:
                self.user_profiles[user_id] = UserProfile(user_id=user_id)
            
            profile = self.user_profiles[user_id]
            
            # 기존 선호도와 새 선호도 병합
            for key, value in preferences.items():
                if key in profile.preferences:
                    # 지수 이동 평균으로 업데이트
                    alpha = profile.learning_rate
                    if isinstance(value, (int, float)) and isinstance(profile.preferences[key], (int, float)):
                        profile.preferences[key] = (
                            alpha * value + (1 - alpha) * profile.preferences[key]
                        )
                    else:
                        profile.preferences[key] = value
                else:
                    profile.preferences[key] = value
            
            profile.last_active = datetime.now()
            
            logger.info(f"Adapted user profile for {user_id}")
            return profile
    
    async def predict_user_needs(self, user_id: str, 
                               current_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """사용자 니즈 예측"""
        if user_id not in self.user_profiles:
            return []
        
        profile = self.user_profiles[user_id]
        predictions = []
        
        # 과거 패턴 기반 예측
        for pattern in profile.frequent_patterns:
            if await self._pattern_applies_to_context(pattern, current_context):
                predictions.append({
                    'type': 'pattern_based',
                    'pattern': pattern,
                    'confidence': 0.8,
                    'suggestion': await self._generate_pattern_suggestion(pattern, current_context)
                })
        
        # 선호도 기반 예측
        for pref_key, pref_value in profile.preferences.items():
            if pref_key in current_context:
                similarity = await self._calculate_preference_similarity(
                    current_context[pref_key], pref_value
                )
                if similarity > 0.7:
                    predictions.append({
                        'type': 'preference_based',
                        'preference': pref_key,
                        'confidence': similarity,
                        'suggestion': await self._generate_preference_suggestion(pref_key, pref_value)
                    })
        
        # 신뢰도 순으로 정렬
        predictions.sort(key=lambda x: x['confidence'], reverse=True)
        return predictions[:5]  # 상위 5개만 반환
    
    async def _pattern_applies_to_context(self, pattern: str, context: Dict[str, Any]) -> bool:
        """패턴이 현재 컨텍스트에 적용되는지 확인"""
        # 간단한 구현 - 실제로는 더 정교한 패턴 매칭 필요
        return pattern in str(context).lower()
    
    async def _generate_pattern_suggestion(self, pattern: str, context: Dict[str, Any]) -> str:
        """패턴 기반 제안 생성"""
        return f"Based on your usage pattern '{pattern}', consider..."
    
    async def _calculate_preference_similarity(self, current_value: Any, preferred_value: Any) -> float:
        """선호도 유사도 계산"""
        if type(current_value) != type(preferred_value):
            return 0.0
        
        if isinstance(current_value, str):
            # 문자열 유사도
            if current_value == preferred_value:
                return 1.0
            elif current_value.lower() in preferred_value.lower() or preferred_value.lower() in current_value.lower():
                return 0.7
            else:
                return 0.0
        elif isinstance(current_value, (int, float)):
            # 수치 유사도
            if preferred_value == 0:
                return 1.0 if current_value == 0 else 0.0
            ratio = min(current_value, preferred_value) / max(current_value, preferred_value)
            return ratio
        else:
            return 1.0 if current_value == preferred_value else 0.0
    
    async def _generate_preference_suggestion(self, pref_key: str, pref_value: Any) -> str:
        """선호도 기반 제안 생성"""
        return f"Since you prefer {pref_key}={pref_value}, you might like..."
    
    async def update_user_patterns(self, user_id: str, new_patterns: List[str]):
        """사용자 패턴 업데이트"""
        with self.lock:
            if user_id not in self.user_profiles:
                self.user_profiles[user_id] = UserProfile(user_id=user_id)
            
            profile = self.user_profiles[user_id]
            
            # 새 패턴들을 기존 패턴과 병합
            for pattern in new_patterns:
                if pattern not in profile.frequent_patterns:
                    profile.frequent_patterns.append(pattern)
            
            # 패턴 목록 크기 제한 (최대 20개)
            if len(profile.frequent_patterns) > 20:
                profile.frequent_patterns = profile.frequent_patterns[-20:]


class ContinuousLearningEngine:
    """지속적 학습 엔진 메인 클래스"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        
        # 핵심 컴포넌트 초기화
        self.feedback_processor = FeedbackProcessor()
        self.pattern_library = PatternLibrary(
            self.config.get('pattern_storage_path', 'patterns.db')
        )
        self.knowledge_graph = KnowledgeGraph()
        self.model_evolution_manager = ModelEvolutionManager(
            ModelEvolutionStrategy(self.config.get('evolution_strategy', 'hybrid'))
        )
        self.adaptation_engine = AdaptationEngine()
        self.performance_tracker = PerformanceTracker()
        
        # 학습 상태
        self.is_learning = False
        self.learning_history = deque(maxlen=1000)
        self.lock = threading.RLock()
        
        # 백그라운드 작업
        self.background_tasks = set()
        
        logger.info("Continuous Learning Engine initialized")
    
    @measure_learning_performance
    async def process_user_feedback(self, feedback: UserFeedback) -> LearningSignal:
        """사용자 피드백 처리 메인 메서드"""
        try:
            # 피드백 처리
            learning_signal = await self.feedback_processor.process_feedback(feedback)
            
            # 학습 신호 저장
            self.learning_history.append(learning_signal)
            
            # 백그라운드에서 학습 수행
            task = asyncio.create_task(self._background_learning(learning_signal))
            self.background_tasks.add(task)
            task.add_done_callback(self.background_tasks.discard)
            
            logger.info(f"Processed feedback {feedback.feedback_id}")
            return learning_signal
            
        except Exception as e:
            logger.error(f"Failed to process feedback: {e}")
            raise LearningEngineError(f"Feedback processing failed: {e}")
    
    @measure_learning_performance
    async def update_solution_weights(self, solution_id: str, outcome: SolutionOutcome):
        """솔루션 가중치 업데이트"""
        try:
            # 솔루션 성능 데이터 추출
            performance_data = {
                'accuracy': 1.0 - outcome.error_rate,
                'speed': 1.0 / max(outcome.execution_time, 0.001),
                'user_satisfaction': outcome.user_satisfaction,
                'resource_efficiency': 1.0 - sum(outcome.resource_usage.values()) / len(outcome.resource_usage)
            }
            
            # 모델 진화
            await self.model_evolution_manager.evolve_generation(
                performance_data, 
                len(self.learning_history)
            )
            
            # 관련 패턴 성능 업데이트
            patterns = await self.pattern_library.find_matching_patterns({
                'solution_id': solution_id
            })
            
            for pattern in patterns:
                await self.pattern_library.update_pattern_performance(
                    pattern.pattern_id, outcome.success
                )
            
            logger.info(f"Updated weights for solution {solution_id}")
            
        except Exception as e:
            logger.error(f"Failed to update solution weights: {e}")
            raise LearningEngineError(f"Weight update failed: {e}")
    
    @measure_learning_performance
    async def learn_new_patterns(self, successful_solutions: List[Dict[str, Any]]):
        """성공한 솔루션에서 새로운 패턴 학습"""
        try:
            if len(successful_solutions) < 2:
                logger.info("Insufficient solutions for pattern learning")
                return
            
            # 솔루션들에서 공통 패턴 추출
            common_patterns = await self._extract_common_patterns(successful_solutions)
            
            for pattern_data in common_patterns:
                # 새 패턴 생성
                pattern = Pattern(
                    pattern_id=str(uuid.uuid4()),
                    pattern_type=pattern_data['type'],
                    description=pattern_data['description'],
                    conditions=pattern_data['conditions'],
                    actions=pattern_data['actions'],
                    confidence=pattern_data['confidence']
                )
                
                # 패턴 라이브러리에 추가
                await self.pattern_library.add_pattern(pattern)
                
                # 지식 그래프에 노드 추가
                graph_node = KnowledgeGraphNode(
                    node_id=pattern.pattern_id,
                    node_type='pattern',
                    properties={
                        'pattern_type': pattern.pattern_type,
                        'confidence': pattern.confidence,
                        'description': pattern.description
                    }
                )
                await self.knowledge_graph.add_node(graph_node)
            
            logger.info(f"Learned {len(common_patterns)} new patterns")
            
        except Exception as e:
            logger.error(f"Failed to learn new patterns: {e}")
            raise LearningEngineError(f"Pattern learning failed: {e}")
    
    async def adapt_to_user_preferences(self, user_id: str, preferences: Dict[str, Any]):
        """사용자 선호도 적응"""
        try:
            profile = await self.adaptation_engine.adapt_to_user_preferences(
                user_id, preferences
            )
            
            # 사용자 패턴을 지식 그래프에 추가
            user_node = KnowledgeGraphNode(
                node_id=f"user_{user_id}",
                node_type='user',
                properties={
                    'preferences': profile.preferences,
                    'skill_level': profile.skill_level,
                    'learning_rate': profile.learning_rate
                }
            )
            await self.knowledge_graph.add_node(user_node)
            
            logger.info(f"Adapted to user {user_id} preferences")
            return profile
            
        except Exception as e:
            logger.error(f"Failed to adapt to user preferences: {e}")
            raise LearningEngineError(f"User adaptation failed: {e}")
    
    async def get_personalized_suggestions(self, user_id: str, 
                                         context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """개인화된 제안 생성"""
        try:
            # 사용자 니즈 예측
            predictions = await self.adaptation_engine.predict_user_needs(user_id, context)
            
            # 관련 패턴 찾기
            patterns = await self.pattern_library.find_matching_patterns(context)
            
            # 제안 생성
            suggestions = []
            
            # 예측 기반 제안
            for prediction in predictions:
                suggestions.append({
                    'type': 'prediction',
                    'content': prediction['suggestion'],
                    'confidence': prediction['confidence'],
                    'source': 'user_pattern'
                })
            
            # 패턴 기반 제안
            for pattern in patterns[:3]:  # 상위 3개 패턴
                suggestions.append({
                    'type': 'pattern',
                    'content': f"Apply pattern: {pattern.description}",
                    'confidence': pattern.confidence,
                    'source': 'pattern_library',
                    'pattern_id': pattern.pattern_id
                })
            
            # 신뢰도 순으로 정렬
            suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            
            return suggestions
            
        except Exception as e:
            logger.error(f"Failed to generate personalized suggestions: {e}")
            return []
    
    async def _background_learning(self, learning_signal: LearningSignal):
        """백그라운드 학습 프로세스"""
        try:
            with self.lock:
                if self.is_learning:
                    return  # 이미 학습 중
                self.is_learning = True
            
            try:
                # 학습 신호 유형에 따른 처리
                if learning_signal.signal_type == LearningSignalType.PATTERN_DISCOVERY:
                    await self._process_pattern_discovery(learning_signal)
                elif learning_signal.signal_type == LearningSignalType.SOLUTION_EFFECTIVENESS:
                    await self._process_solution_effectiveness(learning_signal)
                elif learning_signal.signal_type == LearningSignalType.USER_PREFERENCE:
                    await self._process_user_preference(learning_signal)
                elif learning_signal.signal_type == LearningSignalType.ERROR_CORRECTION:
                    await self._process_error_correction(learning_signal)
                
                # 지식 그래프 업데이트
                await self._update_knowledge_graph(learning_signal)
                
            finally:
                with self.lock:
                    self.is_learning = False
            
        except Exception as e:
            logger.error(f"Background learning failed: {e}")
    
    async def _extract_common_patterns(self, solutions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """솔루션들에서 공통 패턴 추출"""
        if not solutions:
            return []
        
        patterns = []
        
        # 간단한 패턴 추출 로직 (실제로는 더 정교한 ML 알고리즘 필요)
        common_keys = set(solutions[0].keys())
        for solution in solutions[1:]:
            common_keys &= set(solution.keys())
        
        if len(common_keys) >= 3:  # 최소 3개 공통 키
            pattern = {
                'type': 'solution_pattern',
                'description': f"Common pattern found in {len(solutions)} solutions",
                'conditions': {key: 'any' for key in common_keys},
                'actions': [{'type': 'apply_common_approach'}],
                'confidence': min(0.8, len(common_keys) / 10.0)
            }
            patterns.append(pattern)
        
        return patterns
    
    async def _process_pattern_discovery(self, signal: LearningSignal):
        """패턴 발견 처리"""
        pattern_data = signal.data.get('pattern', {})
        if pattern_data:
            pattern = Pattern(
                pattern_id=str(uuid.uuid4()),
                pattern_type=pattern_data.get('type', 'discovered'),
                description=pattern_data.get('description', 'Auto-discovered pattern'),
                conditions=pattern_data.get('conditions', {}),
                actions=pattern_data.get('actions', []),
                confidence=signal.strength
            )
            await self.pattern_library.add_pattern(pattern)
    
    async def _process_solution_effectiveness(self, signal: LearningSignal):
        """솔루션 효과성 처리"""
        feedback_data = signal.data.get('feedback', {})
        solution_id = feedback_data.get('solution_id')
        
        if solution_id:
            # 솔루션 관련 패턴들의 가중치 조정
            patterns = await self.pattern_library.find_matching_conditions({'solution_id': solution_id})
            for pattern in patterns:
                await self.pattern_library.update_pattern_performance(
                    pattern.pattern_id, signal.strength > 0.5
                )
    
    async def _process_user_preference(self, signal: LearningSignal):
        """사용자 선호도 처리"""
        feedback_data = signal.data.get('feedback', {})
        user_id = feedback_data.get('user_id')
        
        if user_id:
            # 사용자 프로필 업데이트
            preferences = feedback_data.get('context', {})
            await self.adaptation_engine.adapt_to_user_preferences(user_id, preferences)
    
    async def _process_error_correction(self, signal: LearningSignal):
        """에러 수정 처리"""
        feedback_data = signal.data.get('feedback', {})
        
        # 에러 패턴을 네거티브 패턴으로 학습
        error_pattern = Pattern(
            pattern_id=str(uuid.uuid4()),
            pattern_type='error_pattern',
            description=f"Error pattern: {feedback_data.get('comment', 'Unknown error')}",
            conditions=feedback_data.get('context', {}),
            actions=[{'type': 'avoid', 'reason': 'known_error'}],
            confidence=signal.strength
        )
        await self.pattern_library.add_pattern(error_pattern)
    
    async def _update_knowledge_graph(self, signal: LearningSignal):
        """지식 그래프 업데이트"""
        # 학습 신호를 지식 그래프 노드로 추가
        signal_node = KnowledgeGraphNode(
            node_id=signal.signal_id,
            node_type='learning_signal',
            properties={
                'signal_type': signal.signal_type.value,
                'strength': signal.strength,
                'source': signal.source.value,
                'confidence': signal.confidence
            }
        )
        await self.knowledge_graph.add_node(signal_node)
        
        # 관련 노드들과 연결
        feedback_data = signal.data.get('feedback', {})
        if 'user_id' in feedback_data:
            await self.knowledge_graph.add_connection(
                signal.signal_id, f"user_{feedback_data['user_id']}"
            )
        if 'solution_id' in feedback_data:
            await self.knowledge_graph.add_connection(
                signal.signal_id, feedback_data['solution_id']
            )
    
    def get_learning_statistics(self) -> Dict[str, Any]:
        """학습 통계 반환"""
        with self.lock:
            total_signals = len(self.learning_history)
            if total_signals == 0:
                return {'status': 'no_learning_data'}
            
            # 신호 유형별 분포
            signal_distribution = defaultdict(int)
            strength_sum = 0.0
            
            for signal in self.learning_history:
                signal_distribution[signal.signal_type.value] += 1
                strength_sum += signal.strength
            
            avg_strength = strength_sum / total_signals
            
            # 성능 통계
            performance_stats = self.performance_tracker.get_performance_stats()
            
            # 모델 진화 이력
            evolution_history = self.model_evolution_manager.get_evolution_history()
            
            return {
                'total_learning_signals': total_signals,
                'signal_distribution': dict(signal_distribution),
                'average_signal_strength': avg_strength,
                'pattern_library_size': len(self.pattern_library.patterns),
                'knowledge_graph_nodes': len(self.knowledge_graph.nodes),
                'user_profiles': len(self.adaptation_engine.user_profiles),
                'model_generations': len(self.model_evolution_manager.generations),
                'performance_stats': performance_stats,
                'evolution_history': evolution_history[-5:],  # 최근 5개 세대
                'is_learning': self.is_learning
            }
    
    async def export_knowledge(self, export_path: str) -> bool:
        """지식 내보내기"""
        try:
            knowledge_data = {
                'patterns': [asdict(pattern) for pattern in self.pattern_library.patterns.values()],
                'user_profiles': {uid: asdict(profile) for uid, profile in self.adaptation_engine.user_profiles.items()},
                'knowledge_graph_nodes': {nid: asdict(node) for nid, node in self.knowledge_graph.nodes.items()},
                'model_generations': [asdict(gen) for gen in self.model_evolution_manager.generations],
                'learning_history': [asdict(signal) for signal in list(self.learning_history)],
                'export_timestamp': datetime.now().isoformat(),
                'config': self.config
            }
            
            # JSON으로 저장
            async with aiofiles.open(export_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(knowledge_data, indent=2, default=str))
            
            logger.info(f"Knowledge exported to {export_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to export knowledge: {e}")
            return False
    
    async def import_knowledge(self, import_path: str) -> bool:
        """지식 가져오기"""
        try:
            async with aiofiles.open(import_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                knowledge_data = json.loads(content)
            
            # 패턴 라이브러리 복원
            for pattern_data in knowledge_data.get('patterns', []):
                pattern = Pattern(
                    pattern_id=pattern_data['pattern_id'],
                    pattern_type=pattern_data['pattern_type'],
                    description=pattern_data['description'],
                    conditions=pattern_data['conditions'],
                    actions=pattern_data['actions'],
                    confidence=pattern_data['confidence'],
                    usage_count=pattern_data.get('usage_count', 0),
                    success_rate=pattern_data.get('success_rate', 0.0),
                    created_at=datetime.fromisoformat(pattern_data['created_at']),
                    last_used=datetime.fromisoformat(pattern_data['last_used']) if pattern_data.get('last_used') else None
                )
                await self.pattern_library.add_pattern(pattern)
            
            # 사용자 프로필 복원
            for user_id, profile_data in knowledge_data.get('user_profiles', {}).items():
                profile = UserProfile(
                    user_id=profile_data['user_id'],
                    preferences=profile_data.get('preferences', {}),
                    skill_level=profile_data.get('skill_level', 'intermediate'),
                    coding_style=profile_data.get('coding_style', {}),
                    frequent_patterns=profile_data.get('frequent_patterns', []),
                    learning_rate=profile_data.get('learning_rate', 0.1),
                    feedback_history=profile_data.get('feedback_history', []),
                    created_at=datetime.fromisoformat(profile_data['created_at']),
                    last_active=datetime.fromisoformat(profile_data['last_active'])
                )
                self.adaptation_engine.user_profiles[user_id] = profile
            
            # 지식 그래프 노드 복원
            for node_id, node_data in knowledge_data.get('knowledge_graph_nodes', {}).items():
                node = KnowledgeGraphNode(
                    node_id=node_data['node_id'],
                    node_type=node_data['node_type'],
                    properties=node_data.get('properties', {}),
                    connections=set(node_data.get('connections', [])),
                    weight=node_data.get('weight', 1.0),
                    created_at=datetime.fromisoformat(node_data['created_at'])
                )
                await self.knowledge_graph.add_node(node)
            
            # 모델 세대 복원
            for gen_data in knowledge_data.get('model_generations', []):
                generation = ModelGeneration(
                    generation_id=gen_data['generation_id'],
                    parent_generation=gen_data.get('parent_generation'),
                    model_weights=gen_data['model_weights'],
                    performance_metrics=gen_data.get('performance_metrics', {}),
                    training_data_size=gen_data.get('training_data_size', 0),
                    created_at=datetime.fromisoformat(gen_data['created_at']),
                    fitness_score=gen_data.get('fitness_score', 0.0)
                )
                self.model_evolution_manager.generations.append(generation)
            
            # 최신 세대를 현재 세대로 설정
            if self.model_evolution_manager.generations:
                self.model_evolution_manager.current_generation = self.model_evolution_manager.generations[-1]
            
            logger.info(f"Knowledge imported from {import_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to import knowledge: {e}")
            return False
    
    async def cleanup_old_data(self, retention_days: int = 30):
        """오래된 데이터 정리"""
        try:
            cutoff_date = datetime.now() - timedelta(days=retention_days)
            
            # 오래된 학습 신호 제거
            original_count = len(self.learning_history)
            self.learning_history = deque(
                (signal for signal in self.learning_history if signal.timestamp > cutoff_date),
                maxlen=1000
            )
            removed_signals = original_count - len(self.learning_history)
            
            # 사용되지 않는 패턴 제거
            removed_patterns = 0
            patterns_to_remove = []
            
            for pattern_id, pattern in self.pattern_library.patterns.items():
                if (pattern.last_used and pattern.last_used < cutoff_date and 
                    pattern.usage_count == 0):
                    patterns_to_remove.append(pattern_id)
            
            for pattern_id in patterns_to_remove:
                del self.pattern_library.patterns[pattern_id]
                removed_patterns += 1
            
            # 비활성 사용자 프로필 제거
            removed_profiles = 0
            profiles_to_remove = []
            
            for user_id, profile in self.adaptation_engine.user_profiles.items():
                if profile.last_active < cutoff_date:
                    profiles_to_remove.append(user_id)
            
            for user_id in profiles_to_remove:
                del self.adaptation_engine.user_profiles[user_id]
                removed_profiles += 1
            
            # 오래된 모델 세대 제거 (최신 5개만 유지)
            if len(self.model_evolution_manager.generations) > 5:
                self.model_evolution_manager.generations = self.model_evolution_manager.generations[-5:]
            
            logger.info(f"Cleanup completed: removed {removed_signals} signals, "
                       f"{removed_patterns} patterns, {removed_profiles} profiles")
            
        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")
    
    async def start_periodic_learning(self, interval_minutes: int = 60):
        """주기적 학습 프로세스 시작"""
        async def periodic_task():
            while True:
                try:
                    await asyncio.sleep(interval_minutes * 60)
                    
                    # 주기적 학습 작업
                    await self._periodic_pattern_analysis()
                    await self._periodic_model_optimization()
                    await self._periodic_knowledge_graph_update()
                    
                    logger.info("Periodic learning cycle completed")
                    
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Periodic learning error: {e}")
        
        task = asyncio.create_task(periodic_task())
        self.background_tasks.add(task)
        task.add_done_callback(self.background_tasks.discard)
        
        logger.info(f"Started periodic learning with {interval_minutes} minute intervals")
    
    async def _periodic_pattern_analysis(self):
        """주기적 패턴 분석"""
        # 최근 피드백에서 새로운 패턴 발견
        recent_signals = [
            signal for signal in self.learning_history 
            if signal.timestamp > datetime.now() - timedelta(hours=24)
        ]
        
        if len(recent_signals) >= 5:
            # 피드백 데이터에서 패턴 추출
            feedback_data = [signal.data.get('feedback', {}) for signal in recent_signals]
            patterns = await self._extract_common_patterns(feedback_data)
            
            for pattern_data in patterns:
                pattern = Pattern(
                    pattern_id=str(uuid.uuid4()),
                    pattern_type='periodic_discovery',
                    description=pattern_data['description'],
                    conditions=pattern_data['conditions'],
                    actions=pattern_data['actions'],
                    confidence=pattern_data['confidence']
                )
                await self.pattern_library.add_pattern(pattern)
    
    async def _periodic_model_optimization(self):
        """주기적 모델 최적화"""
        if self.model_evolution_manager.current_generation:
            # 현재 성능 데이터 수집
            performance_data = {
                'learning_rate': len(self.learning_history) / max(1, len(self.learning_history) // 10),
                'pattern_effectiveness': sum(p.success_rate for p in self.pattern_library.patterns.values()) / max(1, len(self.pattern_library.patterns)),
                'user_satisfaction': sum(
                    signal.strength for signal in self.learning_history 
                    if signal.signal_type == LearningSignalType.USER_PREFERENCE
                ) / max(1, len([s for s in self.learning_history if s.signal_type == LearningSignalType.USER_PREFERENCE]))
            }
            
            # 모델 진화
            await self.model_evolution_manager.evolve_generation(
                performance_data, len(self.learning_history)
            )
    
    async def _periodic_knowledge_graph_update(self):
        """주기적 지식 그래프 업데이트"""
        # 노드 중요도 재계산
        for node_id in list(self.knowledge_graph.nodes.keys()):
            importance = await self.knowledge_graph.calculate_node_importance(node_id)
            self.knowledge_graph.nodes[node_id].weight = importance
        
        # 새로운 연결 제안 및 추가
        for node_id in list(self.knowledge_graph.nodes.keys())[:10]:  # 상위 10개 노드만
            suggestions = await self.knowledge_graph.suggest_new_connections(node_id)
            for suggested_id, similarity in suggestions[:2]:  # 상위 2개 제안만
                if similarity > 0.7:
                    await self.knowledge_graph.add_connection(node_id, suggested_id, similarity)
    
    def stop_background_tasks(self):
        """백그라운드 작업 중지"""
        for task in self.background_tasks:
            task.cancel()
        self.background_tasks.clear()
        logger.info("Background tasks stopped")
    
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        self.stop_background_tasks()


# 팩토리 함수
def create_learning_engine(config: Optional[Dict[str, Any]] = None) -> ContinuousLearningEngine:
    """학습 엔진 팩토리 함수"""
    return ContinuousLearningEngine(config)


# 전역 인스턴스 관리
_global_learning_engine: Optional[ContinuousLearningEngine] = None
_engine_lock = threading.Lock()


def get_global_learning_engine(config: Optional[Dict[str, Any]] = None) -> ContinuousLearningEngine:
    """전역 학습 엔진 인스턴스 반환"""
    global _global_learning_engine
    
    with _engine_lock:
        if _global_learning_engine is None:
            _global_learning_engine = create_learning_engine(config)
        return _global_learning_engine


def reset_global_learning_engine():
    """전역 학습 엔진 리셋"""
    global _global_learning_engine
    
    with _engine_lock:
        if _global_learning_engine:
            _global_learning_engine.stop_background_tasks()
        _global_learning_engine = None


# 편의 함수들
async def quick_feedback_processing(user_id: str, solution_id: str, rating: float, 
                                  comment: str = None) -> LearningSignal:
    """빠른 피드백 처리 (편의 함수)"""
    engine = get_global_learning_engine()
    
    feedback = UserFeedback(
        feedback_id=str(uuid.uuid4()),
        user_id=user_id,
        solution_id=solution_id,
        feedback_type=FeedbackType.POSITIVE if rating > 0.5 else FeedbackType.NEGATIVE,
        rating=rating,
        comment=comment
    )
    
    return await engine.process_user_feedback(feedback)


async def quick_solution_update(solution_id: str, success: bool, 
                              execution_time: float = 1.0,
                              user_satisfaction: float = 0.8) -> None:
    """빠른 솔루션 업데이트 (편의 함수)"""
    engine = get_global_learning_engine()
    
    outcome = SolutionOutcome(
        solution_id=solution_id,
        success=success,
        performance_metrics={'accuracy': 0.9 if success else 0.3},
        error_rate=0.1 if success else 0.7,
        user_satisfaction=user_satisfaction,
        execution_time=execution_time,
        resource_usage={'cpu': 0.3, 'memory': 0.4}
    )
    
    await engine.update_solution_weights(solution_id, outcome)


async def get_learning_insights() -> Dict[str, Any]:
    """학습 인사이트 조회 (편의 함수)"""
    engine = get_global_learning_engine()
    return engine.get_learning_statistics()


# 사용 예제 및 테스트
async def example_usage():
    """사용 예제"""
    print("=== Continuous Learning Engine Example ===")
    
    # 학습 엔진 초기화
    config = {
        'evolution_strategy': 'hybrid',
        'pattern_storage_path': 'test_patterns.db'
    }
    
    async with create_learning_engine(config) as engine:
        # 초기 모델 세대 생성
        initial_weights = {
            'accuracy_weight': 0.8,
            'speed_weight': 0.6,
            'user_satisfaction_weight': 0.9
        }
        await engine.model_evolution_manager.create_initial_generation(initial_weights)
        
        # 사용자 피드백 처리
        feedback = UserFeedback(
            feedback_id="feedback_001",
            user_id="user_123",
            solution_id="solution_456",
            feedback_type=FeedbackType.POSITIVE,
            rating=0.85,
            comment="Great solution, very helpful!"
        )
        
        learning_signal = await engine.process_user_feedback(feedback)
        print(f"Learning signal generated: {learning_signal.signal_id}")
        
        # 솔루션 성과 업데이트
        outcome = SolutionOutcome(
            solution_id="solution_456",
            success=True,
            performance_metrics={'accuracy': 0.9, 'speed': 0.8},
            error_rate=0.05,
            user_satisfaction=0.85,
            execution_time=2.3,
            resource_usage={'cpu': 0.4, 'memory': 0.3}
        )
        
        await engine.update_solution_weights("solution_456", outcome)
        print("Solution weights updated")
        
        # 개인화된 제안 받기
        suggestions = await engine.get_personalized_suggestions(
            "user_123", 
            {'task_type': 'debugging', 'complexity': 'medium'}
        )
        print(f"Generated {len(suggestions)} personalized suggestions")
        
        # 학습 통계 확인
        stats = engine.get_learning_statistics()
        print(f"Learning statistics: {stats}")
        
        # 주기적 학습 시작
        await engine.start_periodic_learning(interval_minutes=1)  # 테스트용으로 1분
        
        # 잠시 대기 (실제 운영에서는 필요 없음)
        await asyncio.sleep(2)
        
        print("Example completed successfully!")


if __name__ == "__main__":
    # 사용 예제 실행
    asyncio.run(example_usage())
    
    # 전역 엔진 정리
    reset_global_learning_engine()