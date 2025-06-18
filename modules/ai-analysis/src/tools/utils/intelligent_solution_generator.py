#!/usr/bin/env python3
"""
Intelligent Solution Generator
자가 발전형 LLM 연동 IDE의 핵심 - 지능형 해결책 생성 시스템

주요 기능:
- 멀티소스 로그 분석을 통한 문제 식별
- LLM 기반 다중 해결책 생성
- 솔루션 영향도 분석 및 위험도 평가
- 실행 계획 자동 생성
- 시뮬레이션 및 A/B 테스트 지원
- 진화형 솔루션 개선
"""

import asyncio
import json
import logging
import hashlib
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import aiohttp
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from contextlib import asynccontextmanager
import pickle
import yaml
from collections import defaultdict, deque
import re
import ast
import subprocess
import statistics
import weakref

# 로깅 설정
logger = logging.getLogger(__name__)


# 열거형 정의
class ProblemSeverity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class SolutionType(Enum):
    CODE_FIX = "code_fix"
    CONFIG_CHANGE = "config_change"
    INFRASTRUCTURE = "infrastructure"
    PROCESS_IMPROVEMENT = "process_improvement"
    MONITORING = "monitoring"
    SCALING = "scaling"
    SECURITY = "security"
    OPTIMIZATION = "optimization"


class ImplementationStrategy(Enum):
    IMMEDIATE = "immediate"
    GRADUAL_ROLLOUT = "gradual_rollout"
    CANARY_DEPLOYMENT = "canary_deployment"
    BLUE_GREEN = "blue_green"
    FEATURE_FLAG = "feature_flag"
    MAINTENANCE_WINDOW = "maintenance_window"


class RiskLevel(Enum):
    MINIMAL = "minimal"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# 데이터 클래스들
@dataclass
class Problem:
    """문제 정의"""
    id: str
    title: str
    description: str
    severity: ProblemSeverity
    affected_components: List[str]
    symptoms: List[str]
    error_messages: List[str]
    metrics: Dict[str, Any]
    timestamp: datetime
    source_logs: List[str]
    context: Dict[str, Any] = field(default_factory=dict)
    related_problems: List[str] = field(default_factory=list)
    business_impact: Optional[str] = None
    user_impact: Optional[str] = None


@dataclass
class SystemContext:
    """시스템 컨텍스트"""
    architecture: Dict[str, Any]
    technologies: List[str]
    deployment_environment: str
    scaling_info: Dict[str, Any]
    performance_baselines: Dict[str, float]
    recent_changes: List[Dict[str, Any]]
    dependencies: List[str]
    constraints: List[str]
    business_rules: List[str]
    compliance_requirements: List[str]


@dataclass
class Solution:
    """해결책"""
    id: str
    title: str
    description: str
    solution_type: SolutionType
    implementation_strategy: ImplementationStrategy
    risk_level: RiskLevel
    confidence_score: float
    impact_score: float
    effort_estimate: int  # 시간(분)
    cost_estimate: float
    code_changes: List[str] = field(default_factory=list)
    config_changes: Dict[str, Any] = field(default_factory=dict)
    infrastructure_changes: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)
    rollback_plan: Optional[str] = None
    test_plan: Optional[str] = None
    monitoring_plan: Optional[str] = None
    success_criteria: List[str] = field(default_factory=list)
    side_effects: List[str] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)
    generated_at: datetime = field(default_factory=datetime.now)


@dataclass
class ImplementationPlan:
    """구현 계획"""
    solution_id: str
    phases: List[Dict[str, Any]]
    timeline: Dict[str, datetime]
    resources_required: Dict[str, Any]
    checkpoints: List[Dict[str, Any]]
    rollback_triggers: List[str]
    success_metrics: List[str]
    communication_plan: Dict[str, Any]


@dataclass
class SimulationResult:
    """시뮬레이션 결과"""
    solution_id: str
    success_probability: float
    predicted_outcomes: Dict[str, Any]
    potential_issues: List[str]
    performance_impact: Dict[str, float]
    resource_utilization: Dict[str, float]
    estimated_downtime: int  # 초
    confidence_interval: Tuple[float, float]


@dataclass
class RankedSolutions:
    """순위가 매겨진 솔루션들"""
    solutions: List[Solution]
    ranking_criteria: Dict[str, float]
    recommendation: str
    alternatives_explanation: str


# LLM 인터페이스
class LLMInterface:
    """LLM 인터페이스 추상화"""
    
    def __init__(self, model_config: Dict[str, Any]):
        self.config = model_config
        self.session = None
        self.rate_limiter = asyncio.Semaphore(10)  # 동시 요청 제한
        
    async def initialize(self):
        """LLM 연결 초기화"""
        self.session = aiohttp.ClientSession()
        
    async def cleanup(self):
        """리소스 정리"""
        if self.session:
            await self.session.close()
    
    async def generate_response(self, prompt: str, context: Dict[str, Any] = None) -> str:
        """LLM 응답 생성"""
        async with self.rate_limiter:
            try:
                # 실제 LLM API 호출 (OpenAI, Anthropic 등)
                response = await self._call_llm_api(prompt, context)
                return response
            except Exception as e:
                logger.error(f"LLM API 호출 실패: {e}")
                return self._fallback_response(prompt)
    
    async def _call_llm_api(self, prompt: str, context: Dict[str, Any] = None) -> str:
        """실제 LLM API 호출"""
        # 여기에 실제 LLM API 호출 로직 구현
        # OpenAI, Anthropic, 로컬 모델 등
        
        # 예시: OpenAI API 호출
        api_url = self.config.get('api_url', 'https://api.openai.com/v1/chat/completions')
        headers = {
            'Authorization': f"Bearer {self.config.get('api_key')}",
            'Content-Type': 'application/json'
        }
        
        payload = {
            'model': self.config.get('model', 'gpt-4'),
            'messages': [
                {'role': 'system', 'content': self._build_system_prompt(context)},
                {'role': 'user', 'content': prompt}
            ],
            'max_tokens': self.config.get('max_tokens', 2000),
            'temperature': self.config.get('temperature', 0.7)
        }
        
        async with self.session.post(api_url, headers=headers, json=payload) as response:
            if response.status == 200:
                result = await response.json()
                return result['choices'][0]['message']['content']
            else:
                raise Exception(f"API 호출 실패: {response.status}")
    
    def _build_system_prompt(self, context: Dict[str, Any] = None) -> str:
        """시스템 프롬프트 구성"""
        base_prompt = """
        당신은 자가 발전형 IDE의 지능형 해결책 생성 엔진입니다.
        
        역할:
        - 시스템 문제를 분석하고 실용적인 해결책을 제안
        - 위험도와 영향도를 고려한 안전한 솔루션 제공
        - 구체적이고 실행 가능한 구현 계획 수립
        - 비즈니스 영향을 최소화하는 방향으로 제안
        
        제약사항:
        - 항상 롤백 계획을 포함할 것
        - 테스트 가능한 솔루션만 제안할 것
        - 단계적 구현을 선호할 것
        - 보안과 안정성을 최우선으로 고려할 것
        """
        
        if context:
            base_prompt += f"\n\n현재 시스템 컨텍스트:\n{json.dumps(context, indent=2)}"
        
        return base_prompt
    
    def _fallback_response(self, prompt: str) -> str:
        """LLM 실패 시 폴백 응답"""
        return json.dumps({
            "error": "LLM 서비스 일시 불가",
            "fallback_action": "시스템 로그를 확인하고 기본 문제 해결 절차를 따르십시오",
            "retry_suggested": True
        })


class PromptTemplateManager:
    """프롬프트 템플릿 관리자"""
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[str, str]:
        """프롬프트 템플릿 로드"""
        return {
            "problem_analysis": """
            다음 시스템 문제를 분석해주세요:
            
            문제: {problem_description}
            증상: {symptoms}
            에러 메시지: {error_messages}
            영향 받는 컴포넌트: {affected_components}
            시스템 메트릭: {metrics}
            
            시스템 컨텍스트:
            {system_context}
            
            요청사항:
            1. 근본 원인 분석
            2. 3-5개의 해결책 제안 (우선순위 순)
            3. 각 해결책의 위험도와 예상 효과
            4. 구현 순서와 롤백 계획
            5. 예방 조치 제안
            
            JSON 형식으로 응답해주세요.
            """,
            
            "solution_refinement": """
            다음 해결책을 개선해주세요:
            
            기존 솔루션: {existing_solution}
            사용자 피드백: {user_feedback}
            실행 결과: {execution_results}
            
            개선 요청:
            1. 더 안전한 접근 방법
            2. 부작용 최소화 방안
            3. 성능 최적화 고려사항
            4. 모니터링 강화 방안
            
            개선된 솔루션을 JSON으로 제공해주세요.
            """,
            
            "impact_assessment": """
            다음 해결책의 영향도를 평가해주세요:
            
            해결책: {solution}
            시스템 현황: {system_status}
            비즈니스 컨텍스트: {business_context}
            
            평가 항목:
            1. 시스템 성능에 미치는 영향
            2. 사용자 경험에 미치는 영향
            3. 비즈니스 메트릭에 미치는 영향
            4. 보안에 미치는 영향
            5. 운영 복잡성에 미치는 영향
            
            각 항목을 1-10 점수로 평가하고 근거를 제시해주세요.
            """,
            
            "implementation_plan": """
            다음 해결책의 구현 계획을 수립해주세요:
            
            해결책: {solution}
            제약사항: {constraints}
            리소스: {available_resources}
            타임라인: {timeline_requirements}
            
            계획에 포함할 항목:
            1. 단계별 구현 순서
            2. 각 단계의 검증 방법
            3. 롤백 조건과 절차
            4. 리스크 완화 조치
            5. 성공 기준과 메트릭
            6. 커뮤니케이션 계획
            
            상세한 구현 계획을 JSON으로 제공해주세요.
            """
        }
    
    def get_template(self, template_name: str) -> str:
        """템플릿 반환"""
        return self.templates.get(template_name, "")
    
    def format_template(self, template_name: str, **kwargs) -> str:
        """템플릿 포맷팅"""
        template = self.get_template(template_name)
        return template.format(**kwargs)


class SolutionValidator:
    """솔루션 검증기"""
    
    def __init__(self):
        self.validation_rules = self._load_validation_rules()
    
    def _load_validation_rules(self) -> Dict[str, Callable]:
        """검증 규칙 로드"""
        return {
            "has_rollback_plan": self._check_rollback_plan,
            "has_test_plan": self._check_test_plan,
            "risk_assessment": self._check_risk_assessment,
            "implementation_feasibility": self._check_implementation_feasibility,
            "resource_requirements": self._check_resource_requirements,
            "compliance_check": self._check_compliance,
            "security_review": self._check_security,
            "performance_impact": self._check_performance_impact
        }
    
    def validate_solution(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """솔루션 검증"""
        validation_results = {
            "is_valid": True,
            "issues": [],
            "warnings": [],
            "recommendations": [],
            "score": 0.0
        }
        
        total_checks = len(self.validation_rules)
        passed_checks = 0
        
        for rule_name, rule_func in self.validation_rules.items():
            try:
                result = rule_func(solution, context)
                if result["passed"]:
                    passed_checks += 1
                else:
                    validation_results["issues"].append({
                        "rule": rule_name,
                        "message": result.get("message", "검증 실패"),
                        "severity": result.get("severity", "medium")
                    })
                
                if result.get("warnings"):
                    validation_results["warnings"].extend(result["warnings"])
                
                if result.get("recommendations"):
                    validation_results["recommendations"].extend(result["recommendations"])
                    
            except Exception as e:
                logger.error(f"검증 규칙 {rule_name} 실행 실패: {e}")
                validation_results["issues"].append({
                    "rule": rule_name,
                    "message": f"검증 실행 오류: {str(e)}",
                    "severity": "high"
                })
        
        validation_results["score"] = passed_checks / total_checks
        validation_results["is_valid"] = validation_results["score"] >= 0.7  # 70% 이상 통과
        
        return validation_results
    
    def _check_rollback_plan(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """롤백 계획 확인"""
        if not solution.rollback_plan:
            return {
                "passed": False,
                "message": "롤백 계획이 없습니다",
                "severity": "high",
                "recommendations": ["명확한 롤백 절차를 수립하세요"]
            }
        
        if len(solution.rollback_plan) < 50:
            return {
                "passed": False,
                "message": "롤백 계획이 너무 간단합니다",
                "severity": "medium",
                "recommendations": ["더 상세한 롤백 절차를 작성하세요"]
            }
        
        return {"passed": True}
    
    def _check_test_plan(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """테스트 계획 확인"""
        if not solution.test_plan:
            return {
                "passed": False,
                "message": "테스트 계획이 없습니다",
                "severity": "high",
                "recommendations": ["테스트 계획을 수립하세요"]
            }
        
        return {"passed": True}
    
    def _check_risk_assessment(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """위험도 평가 확인"""
        if solution.risk_level == RiskLevel.CRITICAL and solution.implementation_strategy == ImplementationStrategy.IMMEDIATE:
            return {
                "passed": False,
                "message": "고위험 솔루션에 즉시 구현 전략은 위험합니다",
                "severity": "critical",
                "recommendations": ["단계적 구현 전략을 고려하세요"]
            }
        
        return {"passed": True}
    
    def _check_implementation_feasibility(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """구현 가능성 확인"""
        # 기술 스택 호환성 확인
        required_tech = set()
        for change in solution.code_changes:
            # 코드 변경에서 필요한 기술 추출
            if "docker" in change.lower():
                required_tech.add("docker")
            if "kubernetes" in change.lower():
                required_tech.add("kubernetes")
        
        available_tech = set(context.technologies)
        missing_tech = required_tech - available_tech
        
        if missing_tech:
            return {
                "passed": False,
                "message": f"필요한 기술이 없습니다: {', '.join(missing_tech)}",
                "severity": "high",
                "recommendations": [f"{tech} 설치 또는 대안 검토" for tech in missing_tech]
            }
        
        return {"passed": True}
    
    def _check_resource_requirements(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """리소스 요구사항 확인"""
        # 추정 시간이 너무 긴 경우
        if solution.effort_estimate > 480:  # 8시간 초과
            return {
                "passed": True,
                "warnings": ["구현 시간이 길어 여러 단계로 나누는 것을 고려하세요"]
            }
        
        return {"passed": True}
    
    def _check_compliance(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """컴플라이언스 확인"""
        # 컴플라이언스 요구사항과 솔루션 비교
        compliance_issues = []
        
        for requirement in context.compliance_requirements:
            if "gdpr" in requirement.lower() and "data" in str(solution.code_changes).lower():
                compliance_issues.append("GDPR 데이터 처리 규정 검토 필요")
            
            if "sox" in requirement.lower() and solution.solution_type == SolutionType.CONFIG_CHANGE:
                compliance_issues.append("SOX 규정에 따른 변경 승인 필요")
        
        if compliance_issues:
            return {
                "passed": True,
                "warnings": compliance_issues,
                "recommendations": ["컴플라이언스 팀과 사전 협의하세요"]
            }
        
        return {"passed": True}
    
    def _check_security(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """보안 검토"""
        security_issues = []
        
        # 코드 변경에서 보안 위험 패턴 확인
        for change in solution.code_changes:
            if "password" in change.lower() and "plain" in change.lower():
                security_issues.append("평문 패스워드 사용 위험")
            
            if "sql" in change.lower() and "concat" in change.lower():
                security_issues.append("SQL 인젝션 위험 가능성")
            
            if "eval(" in change or "exec(" in change:
                security_issues.append("코드 실행 보안 위험")
        
        if security_issues:
            return {
                "passed": False,
                "message": "보안 위험이 발견되었습니다",
                "severity": "high",
                "issues": security_issues,
                "recommendations": ["보안팀 리뷰 필요"]
            }
        
        return {"passed": True}
    
    def _check_performance_impact(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """성능 영향 확인"""
        if solution.impact_score > 8.0 and solution.solution_type == SolutionType.CODE_FIX:
            return {
                "passed": True,
                "warnings": ["높은 성능 영향이 예상됩니다"],
                "recommendations": ["성능 테스트를 충분히 수행하세요"]
            }
        
        return {"passed": True}


class ImpactAssessor:
    """영향도 평가기"""
    
    def __init__(self):
        self.assessment_criteria = self._initialize_criteria()
    
    def _initialize_criteria(self) -> Dict[str, Dict[str, Any]]:
        """평가 기준 초기화"""
        return {
            "system_performance": {
                "weight": 0.25,
                "metrics": ["cpu_usage", "memory_usage", "response_time", "throughput"]
            },
            "user_experience": {
                "weight": 0.25,
                "metrics": ["page_load_time", "error_rate", "availability", "usability"]
            },
            "business_impact": {
                "weight": 0.20,
                "metrics": ["revenue", "conversion_rate", "customer_satisfaction", "operational_cost"]
            },
            "security": {
                "weight": 0.15,
                "metrics": ["vulnerability_score", "data_exposure", "access_control", "audit_trail"]
            },
            "operational_complexity": {
                "weight": 0.15,
                "metrics": ["deployment_complexity", "monitoring_overhead", "maintenance_effort", "team_training"]
            }
        }
    
    def assess_solution_impact(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """솔루션 영향도 평가"""
        impact_assessment = {
            "overall_score": 0.0,
            "category_scores": {},
            "detailed_analysis": {},
            "risk_factors": [],
            "mitigation_strategies": []
        }
        
        total_weighted_score = 0.0
        
        for category, config in self.assessment_criteria.items():
            category_score = self._assess_category(solution, context, category, config)
            weight = config["weight"]
            weighted_score = category_score * weight
            
            impact_assessment["category_scores"][category] = {
                "score": category_score,
                "weight": weight,
                "weighted_score": weighted_score
            }
            
            total_weighted_score += weighted_score
        
        impact_assessment["overall_score"] = total_weighted_score
        impact_assessment["detailed_analysis"] = self._generate_detailed_analysis(solution, context)
        impact_assessment["risk_factors"] = self._identify_risk_factors(solution, context)
        impact_assessment["mitigation_strategies"] = self._suggest_mitigation_strategies(solution, context)
        
        return impact_assessment
    
    def _assess_category(self, solution: Solution, context: SystemContext, 
                        category: str, config: Dict[str, Any]) -> float:
        """카테고리별 영향도 평가"""
        if category == "system_performance":
            return self._assess_system_performance(solution, context)
        elif category == "user_experience":
            return self._assess_user_experience(solution, context)
        elif category == "business_impact":
            return self._assess_business_impact(solution, context)
        elif category == "security":
            return self._assess_security_impact(solution, context)
        elif category == "operational_complexity":
            return self._assess_operational_complexity(solution, context)
        else:
            return 5.0  # 기본값
    
    def _assess_system_performance(self, solution: Solution, context: SystemContext) -> float:
        """시스템 성능 영향 평가"""
        score = 5.0  # 기본값 (중립)
        
        if solution.solution_type == SolutionType.OPTIMIZATION:
            score += 2.0  # 최적화는 긍정적 영향
        
        if solution.solution_type == SolutionType.SCALING:
            score += 1.5  # 스케일링도 긍정적
        
        if "cache" in solution.description.lower():
            score += 1.0  # 캐싱 개선
        
        if "database" in solution.description.lower() and "index" in solution.description.lower():
            score += 1.0  # DB 인덱스 최적화
        
        if solution.effort_estimate > 240:  # 4시간 이상
            score -= 0.5  # 복잡한 변경은 위험
        
        return min(10.0, max(1.0, score))
    
    def _assess_user_experience(self, solution: Solution, context: SystemContext) -> float:
        """사용자 경험 영향 평가"""
        score = 5.0
        
        if "frontend" in str(solution.affected_components).lower():
            if "performance" in solution.description.lower():
                score += 2.0
            elif "ui" in solution.description.lower() or "ux" in solution.description.lower():
                score += 1.5
        
        if solution.implementation_strategy == ImplementationStrategy.MAINTENANCE_WINDOW:
            score -= 1.0  # 다운타임 있음
        
        if solution.implementation_strategy == ImplementationStrategy.CANARY_DEPLOYMENT:
            score += 0.5  # 안전한 배포
        
        return min(10.0, max(1.0, score))
    
    def _assess_business_impact(self, solution: Solution, context: SystemContext) -> float:
        """비즈니스 영향 평가"""
        score = 5.0
        
        if solution.cost_estimate > 10000:  # 높은 비용
            score -= 2.0
        elif solution.cost_estimate < 1000:  # 낮은 비용
            score += 1.0
        
        if "revenue" in solution.business_impact or "customer" in solution.business_impact:
            score += 2.0
        
        if solution.effort_estimate > 480:  # 8시간 초과
            score -= 1.0
        
        return min(10.0, max(1.0, score))
    
    def _assess_security_impact(self, solution: Solution, context: SystemContext) -> float:
        """보안 영향 평가"""
        score = 5.0
        
        if solution.solution_type == SolutionType.SECURITY:
            score += 3.0  # 보안 개선
        
        # 보안 키워드 검색
        security_keywords = ["authentication", "authorization", "encryption", "ssl", "tls"]
        for keyword in security_keywords:
            if keyword in solution.description.lower():
                score += 0.5
        
        # 위험 키워드 검색
        risk_keywords = ["disable", "bypass", "skip", "ignore"]
        for keyword in risk_keywords:
            if keyword in solution.description.lower():
                score -= 1.0
        
        return min(10.0, max(1.0, score))
    
    def _assess_operational_complexity(self, solution: Solution, context: SystemContext) -> float:
        """운영 복잡성 평가"""
        score = 5.0
        
        if len(solution.prerequisites) > 3:
            score -= 1.0
        
        if solution.implementation_strategy == ImplementationStrategy.IMMEDIATE:
            score += 1.0  # 간단한 구현
        elif solution.implementation_strategy == ImplementationStrategy.BLUE_GREEN:
            score -= 1.0  # 복잡한 구현
        
        if solution.monitoring_plan:
            score += 0.5  # 모니터링 계획 있음
        
        return min(10.0, max(1.0, score))
    
    def _generate_detailed_analysis(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """상세 분석 생성"""
        return {
            "affected_systems": solution.affected_components,
            "change_magnitude": self._calculate_change_magnitude(solution),
            "rollback_feasibility": self._assess_rollback_feasibility(solution),
            "testing_requirements": self._determine_testing_requirements(solution),
            "deployment_complexity": self._assess_deployment_complexity(solution),
            "monitoring_requirements": self._determine_monitoring_requirements(solution)
        }
    
    def _calculate_change_magnitude(self, solution: Solution) -> str:
        """변경 규모 계산"""
        if len(solution.code_changes) > 10 or len(solution.infrastructure_changes) > 5:
            return "major"
        elif len(solution.code_changes) > 3 or len(solution.infrastructure_changes) > 2:
            return "moderate"
        else:
            return "minor"
    
    def _assess_rollback_feasibility(self, solution: Solution) -> str:
        """롤백 가능성 평가"""
        if solution.rollback_plan and len(solution.rollback_plan) > 100:
            return "high"
        elif solution.rollback_plan:
            return "medium"
        else:
            return "low"
    
    def _determine_testing_requirements(self, solution: Solution) -> List[str]:
        """테스트 요구사항 결정"""
        requirements = ["unit_tests"]
        
        if solution.solution_type in [SolutionType.CODE_FIX, SolutionType.OPTIMIZATION]:
            requirements.append("integration_tests")
        
        if solution.solution_type == SolutionType.INFRASTRUCTURE:
            requirements.extend(["load_tests", "failover_tests"])
        
        if solution.solution_type == SolutionType.SECURITY:
            requirements.extend(["security_tests", "penetration_tests"])
        
        return requirements
    
    def _assess_deployment_complexity(self, solution: Solution) -> str:
        """배포 복잡성 평가"""
        complexity_score = 0
        
        if solution.implementation_strategy == ImplementationStrategy.BLUE_GREEN:
            complexity_score += 3
        elif solution.implementation_strategy == ImplementationStrategy.CANARY_DEPLOYMENT:
            complexity_score += 2
        elif solution.implementation_strategy == ImplementationStrategy.GRADUAL_ROLLOUT:
            complexity_score += 1
        
        if len(solution.prerequisites) > 3:
            complexity_score += 2
        
        if len(solution.infrastructure_changes) > 3:
            complexity_score += 2
        
        if complexity_score >= 5:
            return "high"
        elif complexity_score >= 3:
            return "medium"
        else:
            return "low"
    
    def _determine_monitoring_requirements(self, solution: Solution) -> List[str]:
        """모니터링 요구사항 결정"""
        requirements = ["basic_health_checks"]
        
        if solution.solution_type == SolutionType.OPTIMIZATION:
            requirements.extend(["performance_metrics", "resource_utilization"])
        
        if solution.solution_type == SolutionType.SCALING:
            requirements.extend(["auto_scaling_metrics", "capacity_metrics"])
        
        if solution.solution_type == SolutionType.SECURITY:
            requirements.extend(["security_logs", "audit_trails"])
        
        return requirements
    
    def _identify_risk_factors(self, solution: Solution, context: SystemContext) -> List[str]:
        """위험 요소 식별"""
        risk_factors = []
        
        if solution.risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
            risk_factors.append("High inherent risk level")
        
        if not solution.rollback_plan:
            risk_factors.append("No rollback plan defined")
        
        if solution.effort_estimate > 480:
            risk_factors.append("Long implementation time increases risk")
        
        if len(solution.affected_components) > 5:
            risk_factors.append("Multiple components affected")
        
        if solution.implementation_strategy == ImplementationStrategy.IMMEDIATE:
            risk_factors.append("Immediate deployment without gradual rollout")
        
        return risk_factors
    
    def _suggest_mitigation_strategies(self, solution: Solution, context: SystemContext) -> List[str]:
        """위험 완화 전략 제안"""
        strategies = []
        
        if not solution.rollback_plan:
            strategies.append("Develop comprehensive rollback procedures")
        
        if solution.risk_level == RiskLevel.HIGH:
            strategies.append("Consider canary deployment strategy")
            strategies.append("Implement additional monitoring during rollout")
        
        if len(solution.affected_components) > 3:
            strategies.append("Phase implementation across components")
            strategies.append("Test component interactions thoroughly")
        
        if solution.effort_estimate > 240:
            strategies.append("Break down implementation into smaller phases")
            strategies.append("Set up intermediate checkpoints")
        
        return strategies


class RiskAnalyzer:
    """위험 분석기"""
    
    def __init__(self):
        self.risk_models = self._initialize_risk_models()
    
    def _initialize_risk_models(self) -> Dict[str, Any]:
        """위험 모델 초기화"""
        return {
            "technical_risk": {
                "factors": ["complexity", "dependencies", "technology_maturity", "team_expertise"],
                "weights": [0.3, 0.25, 0.25, 0.2]
            },
            "business_risk": {
                "factors": ["revenue_impact", "customer_impact", "competitive_impact", "regulatory_impact"],
                "weights": [0.4, 0.3, 0.2, 0.1]
            },
            "operational_risk": {
                "factors": ["downtime_risk", "performance_degradation", "support_overhead", "training_requirements"],
                "weights": [0.4, 0.3, 0.2, 0.1]
            }
        }
    
    def analyze_solution_risks(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """솔루션 위험 분석"""
        risk_analysis = {
            "overall_risk_score": 0.0,
            "risk_categories": {},
            "critical_risks": [],
            "risk_mitigation_plan": {},
            "confidence_level": 0.0
        }
        
        total_risk = 0.0
        category_count = len(self.risk_models)
        
        for category, model in self.risk_models.items():
            category_risk = self._analyze_category_risk(solution, context, category, model)
            risk_analysis["risk_categories"][category] = category_risk
            total_risk += category_risk["score"]
        
        risk_analysis["overall_risk_score"] = total_risk / category_count
        risk_analysis["critical_risks"] = self._identify_critical_risks(solution, context)
        risk_analysis["risk_mitigation_plan"] = self._create_mitigation_plan(solution, context)
        risk_analysis["confidence_level"] = self._calculate_confidence_level(solution, context)
        
        return risk_analysis
    
    def _analyze_category_risk(self, solution: Solution, context: SystemContext, 
                             category: str, model: Dict[str, Any]) -> Dict[str, Any]:
        """카테고리별 위험 분석"""
        factors = model["factors"]
        weights = model["weights"]
        
        factor_scores = {}
        weighted_sum = 0.0
        
        for i, factor in enumerate(factors):
            score = self._evaluate_risk_factor(solution, context, factor)
            factor_scores[factor] = score
            weighted_sum += score * weights[i]
        
        return {
            "score": weighted_sum,
            "factor_scores": factor_scores,
            "risk_level": self._categorize_risk_level(weighted_sum)
        }
    
    def _evaluate_risk_factor(self, solution: Solution, context: SystemContext, factor: str) -> float:
        """위험 요소 평가"""
        if factor == "complexity":
            return self._assess_complexity_risk(solution)
        elif factor == "dependencies":
            return self._assess_dependency_risk(solution, context)
        elif factor == "technology_maturity":
            return self._assess_technology_maturity_risk(solution, context)
        elif factor == "team_expertise":
            return self._assess_expertise_risk(solution, context)
        elif factor == "revenue_impact":
            return self._assess_revenue_impact_risk(solution)
        elif factor == "customer_impact":
            return self._assess_customer_impact_risk(solution)
        elif factor == "downtime_risk":
            return self._assess_downtime_risk(solution)
        elif factor == "performance_degradation":
            return self._assess_performance_risk(solution)
        else:
            return 5.0  # 기본 중간 위험도
    
    def _assess_complexity_risk(self, solution: Solution) -> float:
        """복잡성 위험 평가"""
        risk_score = 1.0
        
        if len(solution.code_changes) > 10:
            risk_score += 3.0
        elif len(solution.code_changes) > 5:
            risk_score += 2.0
        elif len(solution.code_changes) > 2:
            risk_score += 1.0
        
        if len(solution.infrastructure_changes) > 5:
            risk_score += 2.0
        elif len(solution.infrastructure_changes) > 2:
            risk_score += 1.0
        
        if len(solution.prerequisites) > 5:
            risk_score += 1.5
        
        if solution.effort_estimate > 480:  # 8시간 초과
            risk_score += 2.0
        
        return min(10.0, risk_score)
    
    def _assess_dependency_risk(self, solution: Solution, context: SystemContext) -> float:
        """의존성 위험 평가"""
        risk_score = 1.0
        
        if len(solution.affected_components) > 5:
            risk_score += 3.0
        elif len(solution.affected_components) > 3:
            risk_score += 2.0
        elif len(solution.affected_components) > 1:
            risk_score += 1.0
        
        # 외부 의존성 체크
        external_deps = len([dep for dep in context.dependencies if "external" in dep.lower()])
        if external_deps > 3:
            risk_score += 2.0
        
        return min(10.0, risk_score)
    
    def _assess_technology_maturity_risk(self, solution: Solution, context: SystemContext) -> float:
        """기술 성숙도 위험 평가"""
        risk_score = 3.0  # 기본값
        
        # 새로운 기술 사용 여부 확인
        new_tech_keywords = ["beta", "alpha", "experimental", "preview"]
        for change in solution.code_changes:
            for keyword in new_tech_keywords:
                if keyword in change.lower():
                    risk_score += 2.0
                    break
        
        return min(10.0, risk_score)
    
    def _assess_expertise_risk(self, solution: Solution, context: SystemContext) -> float:
        """전문성 위험 평가"""
        risk_score = 3.0  # 기본값
        
        # 복잡한 기술이 필요한 경우
        complex_tech = ["kubernetes", "microservices", "machine learning", "blockchain"]
        for change in solution.code_changes:
            for tech in complex_tech:
                if tech in change.lower():
                    risk_score += 1.5
                    break
        
        return min(10.0, risk_score)
    
    def _assess_revenue_impact_risk(self, solution: Solution) -> float:
        """수익 영향 위험 평가"""
        if solution.business_impact and "revenue" in solution.business_impact.lower():
            if "decrease" in solution.business_impact.lower() or "loss" in solution.business_impact.lower():
                return 8.0
            elif "increase" in solution.business_impact.lower():
                return 2.0
        
        return 4.0  # 기본값
    
    def _assess_customer_impact_risk(self, solution: Solution) -> float:
        """고객 영향 위험 평가"""
        if solution.user_impact:
            if "negative" in solution.user_impact.lower():
                return 7.0
            elif "positive" in solution.user_impact.lower():
                return 2.0
        
        if solution.implementation_strategy == ImplementationStrategy.MAINTENANCE_WINDOW:
            return 6.0  # 다운타임으로 인한 고객 영향
        
        return 3.0
    
    def _assess_downtime_risk(self, solution: Solution) -> float:
        """다운타임 위험 평가"""
        if solution.implementation_strategy == ImplementationStrategy.MAINTENANCE_WINDOW:
            return 8.0
        elif solution.implementation_strategy == ImplementationStrategy.BLUE_GREEN:
            return 2.0
        elif solution.implementation_strategy == ImplementationStrategy.CANARY_DEPLOYMENT:
            return 3.0
        else:
            return 4.0
    
    def _assess_performance_risk(self, solution: Solution) -> float:
        """성능 위험 평가"""
        if solution.solution_type == SolutionType.OPTIMIZATION:
            return 2.0  # 최적화는 성능 향상 기대
        elif "database" in solution.description.lower():
            return 6.0  # DB 변경은 성능 위험
        elif "cache" in solution.description.lower():
            return 3.0  # 캐시 변경은 중간 위험
        else:
            return 4.0
    
    def _categorize_risk_level(self, score: float) -> str:
        """위험 수준 분류"""
        if score >= 8.0:
            return "critical"
        elif score >= 6.0:
            return "high"
        elif score >= 4.0:
            return "medium"
        elif score >= 2.0:
            return "low"
        else:
            return "minimal"
    
    def _identify_critical_risks(self, solution: Solution, context: SystemContext) -> List[Dict[str, Any]]:
        """치명적 위험 식별"""
        critical_risks = []
        
        # 롤백 계획 없음
        if not solution.rollback_plan:
            critical_risks.append({
                "type": "no_rollback_plan",
                "description": "롤백 계획이 없어 실패 시 복구가 어려움",
                "impact": "high",
                "probability": "medium"
            })
        
        # 프로덕션 즉시 배포
        if (solution.implementation_strategy == ImplementationStrategy.IMMEDIATE and 
            context.deployment_environment == "production"):
            critical_risks.append({
                "type": "immediate_production_deploy",
                "description": "프로덕션 환경에 즉시 배포하는 것은 위험함",
                "impact": "critical",
                "probability": "low"
            })
        
        # 다중 컴포넌트 동시 변경
        if len(solution.affected_components) > 5:
            critical_risks.append({
                "type": "multiple_component_changes",
                "description": "너무 많은 컴포넌트를 동시에 변경하면 장애 원인 추적이 어려움",
                "impact": "high",
                "probability": "medium"
            })
        
        return critical_risks
    
    def _create_mitigation_plan(self, solution: Solution, context: SystemContext) -> Dict[str, Any]:
        """위험 완화 계획 생성"""
        mitigation_plan = {
            "immediate_actions": [],
            "monitoring_enhancements": [],
            "contingency_plans": [],
            "risk_indicators": []
        }
        
        # 즉시 조치사항
        if not solution.rollback_plan:
            mitigation_plan["immediate_actions"].append(
                "롤백 계획 수립 및 검증"
            )
        
        if not solution.test_plan:
            mitigation_plan["immediate_actions"].append(
                "포괄적 테스트 계획 수립"
            )
        
        # 모니터링 강화
        if solution.solution_type in [SolutionType.CODE_FIX, SolutionType.OPTIMIZATION]:
            mitigation_plan["monitoring_enhancements"].extend([
                "성능 메트릭 실시간 모니터링",
                "에러율 증가 알림 설정",
                "응답 시간 임계값 모니터링"
            ])
        
        # 비상 계획
        mitigation_plan["contingency_plans"].append(
            "장애 발생 시 즉시 롤백 절차"
        )
        
        if solution.implementation_strategy != ImplementationStrategy.CANARY_DEPLOYMENT:
            mitigation_plan["contingency_plans"].append(
                "트래픽 일시 중단 및 우회 방안"
            )
        
        # 위험 지표
        mitigation_plan["risk_indicators"].extend([
            "에러율 2배 이상 증가",
            "응답 시간 50% 이상 증가",
            "메모리 사용량 90% 이상",
            "CPU 사용량 90% 이상"
        ])
        
        return mitigation_plan
    
    def _calculate_confidence_level(self, solution: Solution, context: SystemContext) -> float:
        """신뢰도 계산"""
        confidence = 0.5  # 기본값
        
        # 테스트 계획이 있으면 신뢰도 증가
        if solution.test_plan:
            confidence += 0.2
        
        # 롤백 계획이 있으면 신뢰도 증가
        if solution.rollback_plan:
            confidence += 0.2
        
        # 점진적 배포 전략이면 신뢰도 증가
        if solution.implementation_strategy in [
            ImplementationStrategy.CANARY_DEPLOYMENT,
            ImplementationStrategy.GRADUAL_ROLLOUT
        ]:
            confidence += 0.1
        
        # 높은 신뢰도 점수면 신뢰도 증가
        if solution.confidence_score > 8.0:
            confidence += 0.1
        elif solution.confidence_score < 5.0:
            confidence -= 0.1
        
        return min(1.0, max(0.0, confidence))


class IntelligentSolutionGenerator:
    """지능형 해결책 생성기 메인 클래스"""
    
    def __init__(self, llm_config: Dict[str, Any]):
        self.llm_interface = LLMInterface(llm_config)
        self.prompt_manager = PromptTemplateManager()
        self.solution_validator = SolutionValidator()
        self.impact_assessor = ImpactAssessor()
        self.risk_analyzer = RiskAnalyzer()
        
        # 캐시와 메트릭
        self.solution_cache = {}
        self.generation_metrics = {
            "total_generations": 0,
            "successful_generations": 0,
            "average_generation_time": 0.0,
            "cache_hits": 0
        }
        
        # 학습 데이터
        self.successful_solutions = deque(maxlen=1000)  # 최근 성공 솔루션 저장
        self.failed_solutions = deque(maxlen=500)       # 실패 솔루션 분석용
        
        # 스레드 안전성
        self._lock = threading.RLock()
        
    async def initialize(self):
        """초기화"""
        await self.llm_interface.initialize()
        logger.info("IntelligentSolutionGenerator 초기화 완료")
    
    async def cleanup(self):
        """정리"""
        await self.llm_interface.cleanup()
        logger.info("IntelligentSolutionGenerator 정리 완료")
    
    async def generate_solutions(self, problem: Problem, context: SystemContext) -> List[Solution]:
        """문제에 대한 다중 해결책 생성"""
        start_time = time.time()
        
        try:
            # 캐시 확인
            cache_key = self._generate_cache_key(problem, context)
            cached_solutions = self._get_cached_solutions(cache_key)
            if cached_solutions:
                self.generation_metrics["cache_hits"] += 1
                return cached_solutions
            
            # LLM을 통한 솔루션 생성
            prompt = self._build_solution_generation_prompt(problem, context)
            llm_response = await self.llm_interface.generate_response(prompt, context.__dict__)
            
            # 응답 파싱 및 솔루션 객체 생성
            raw_solutions = self._parse_llm_response(llm_response)
            solutions = []
            
            for raw_solution in raw_solutions:
                solution = await self._create_solution_object(raw_solution, problem, context)
                if solution:
                    # 검증 및 평가
                    validation_result = self.solution_validator.validate_solution(solution, context)
                    if validation_result["is_valid"]:
                        # 영향도 평가
                        impact_assessment = self.impact_assessor.assess_solution_impact(solution, context)
                        solution.impact_score = impact_assessment["overall_score"]
                        
                        # 위험 분석
                        risk_analysis = self.risk_analyzer.analyze_solution_risks(solution, context)
                        solution.risk_level = RiskLevel(risk_analysis["risk_categories"]["technical_risk"]["risk_level"])
                        
                        solutions.append(solution)
            
            # 캐시에 저장
            self._cache_solutions(cache_key, solutions)
            
            # 메트릭 업데이트
            execution_time = time.time() - start_time
            self._update_generation_metrics(execution_time, len(solutions) > 0)
            
            logger.info(f"생성된 솔루션 수: {len(solutions)}, 실행 시간: {execution_time:.2f}초")
            
            return solutions
            
        except Exception as e:
            logger.error(f"솔루션 생성 실패: {e}")
            execution_time = time.time() - start_time
            self._update_generation_metrics(execution_time, False)
            return []
    
    def _build_solution_generation_prompt(self, problem: Problem, context: SystemContext) -> str:
        """솔루션 생성 프롬프트 구축"""
        # 과거 성공 사례에서 패턴 추출
        similar_patterns = self._find_similar_successful_patterns(problem)
        
        # 기본 프롬프트 템플릿 사용
        prompt = self.prompt_manager.format_template(
            "problem_analysis",
            problem_description=problem.description,
            symptoms="\n".join(problem.symptoms),
            error_messages="\n".join(problem.error_messages),
            affected_components=", ".join(problem.affected_components),
            metrics=json.dumps(problem.metrics, indent=2),
            system_context=json.dumps(context.__dict__, indent=2, default=str)
        )
        
        # 성공 패턴 추가
        if similar_patterns:
            prompt += f"\n\n참고할 과거 성공 사례:\n{json.dumps(similar_patterns, indent=2)}"
        
        # 제약사항 추가
        if context.constraints:
            prompt += f"\n\n시스템 제약사항:\n{chr(10).join(context.constraints)}"
        
        return prompt
    
    def _find_similar_successful_patterns(self, problem: Problem) -> List[Dict[str, Any]]:
        """유사한 성공 패턴 찾기"""
        patterns = []
        
        for successful_solution in self.successful_solutions:
            similarity_score = self._calculate_problem_similarity(
                problem, successful_solution.get("original_problem")
            )
            
            if similarity_score > 0.7:  # 70% 이상 유사
                patterns.append({
                    "solution_type": successful_solution["solution_type"],
                    "approach": successful_solution["approach"],
                    "success_factors": successful_solution["success_factors"],
                    "similarity_score": similarity_score
                })
        
        # 유사도 순으로 정렬하여 상위 3개만 반환
        patterns.sort(key=lambda x: x["similarity_score"], reverse=True)
        return patterns[:3]
    
    def _calculate_problem_similarity(self, problem1: Problem, problem2: Optional[Dict]) -> float:
        """문제 유사도 계산"""
        if not problem2:
            return 0.0
        
        similarity_score = 0.0
        
        # 컴포넌트 유사도
        if problem2.get("affected_components"):
            common_components = set(problem1.affected_components) & set(problem2["affected_components"])
            component_similarity = len(common_components) / max(
                len(problem1.affected_components), len(problem2["affected_components"])
            )
            similarity_score += component_similarity * 0.4
        
        # 증상 유사도
        if problem2.get("symptoms"):
            common_symptoms = set(problem1.symptoms) & set(problem2["symptoms"])
            symptom_similarity = len(common_symptoms) / max(
                len(problem1.symptoms), len(problem2["symptoms"])
            )
            similarity_score += symptom_similarity * 0.3
        
        # 심각도 유사도
        if problem2.get("severity") == problem1.severity.value:
            similarity_score += 0.3
        
        return similarity_score
    
    def _parse_llm_response(self, response: str) -> List[Dict[str, Any]]:
        """LLM 응답 파싱"""
        try:
            # JSON 형태로 응답을 기대
            if response.strip().startswith('{'):
                parsed = json.loads(response)
                if "solutions" in parsed:
                    return parsed["solutions"]
                else:
                    return [parsed]
            else:
                # 자연어 응답인 경우 구조화
                return self._parse_natural_language_response(response)
                
        except json.JSONDecodeError:
            # JSON 파싱 실패 시 자연어 처리
            return self._parse_natural_language_response(response)
    
    def _parse_natural_language_response(self, response: str) -> List[Dict[str, Any]]:
        """자연어 응답 파싱"""
        solutions = []
        
        # 솔루션 분리 (번호나 구분자 기준)
        solution_parts = re.split(r'\n(?=\d+\.|\*\*|##)', response)
        
        for part in solution_parts:
            if len(part.strip()) < 50:  # 너무 짧은 부분은 제외
                continue
                
            solution = {
                "title": self._extract_title(part),
                "description": self._extract_description(part),
                "solution_type": self._infer_solution_type(part),
                "implementation_strategy": self._infer_implementation_strategy(part),
                "risk_level": self._infer_risk_level(part),
                "confidence_score": 7.0,  # 기본값
                "effort_estimate": self._estimate_effort(part),
                "code_changes": self._extract_code_changes(part),
                "config_changes": {},
                "rollback_plan": self._extract_rollback_plan(part)
            }
            
            solutions.append(solution)
        
        return solutions[:5]  # 최대 5개 솔루션
    
    def _extract_title(self, text: str) -> str:
        """제목 추출"""
        # 첫 번째 줄이나 볼드 텍스트를 제목으로 추정
        lines = text.strip().split('\n')
        first_line = lines[0].strip()
        
        # 번호나 마커 제거
        title = re.sub(r'^\d+\.\s*|^\*\*|^##\s*', '', first_line)
        title = re.sub(r'\*\*$', '', title)
        
        return title[:100]  # 제목 길이 제한
    
    def _extract_description(self, text: str) -> str:
        """설명 추출"""
        lines = text.strip().split('\n')
        description_lines = []
        
        for line in lines[1:]:  # 첫 번째 줄은 제목으로 간주
            line = line.strip()
            if line and not line.startswith('```'):  # 코드 블록 제외
                description_lines.append(line)
        
        return ' '.join(description_lines)[:500]  # 설명 길이 제한
    
    def _infer_solution_type(self, text: str) -> str:
        """솔루션 타입 추론"""
        text_lower = text.lower()
        
        if any(keyword in text_lower for keyword in ['code', 'function', 'method', 'fix bug']):
            return SolutionType.CODE_FIX.value
        elif any(keyword in text_lower for keyword in ['config', 'setting', 'parameter']):
            return SolutionType.CONFIG_CHANGE.value
        elif any(keyword in text_lower for keyword in ['scale', 'horizontal', 'vertical']):
            return SolutionType.SCALING.value
        elif any(keyword in text_lower for keyword in ['security', 'authentication', 'authorization']):
            return SolutionType.SECURITY.value
        elif any(keyword in text_lower for keyword in ['optimize', 'performance', 'cache']):
            return SolutionType.OPTIMIZATION.value
        elif any(keyword in text_lower for keyword in ['infrastructure', 'deploy', 'server']):
            return SolutionType.INFRASTRUCTURE.value
        elif any(keyword in text_lower for keyword in ['process', 'workflow', 'procedure']):
            return SolutionType.PROCESS_IMPROVEMENT.value
        elif any(keyword in text_lower for keyword in ['monitor', 'alert', 'log']):
            return SolutionType.MONITORING.value
        else:
            return SolutionType.CODE_FIX.value  # 기본값
    
    def _infer_implementation_strategy(self, text: str) -> str:
        """구현 전략 추론"""
        text_lower = text.lower()
        
        if any(keyword in text_lower for keyword in ['canary', 'gradual', 'phase']):
            return ImplementationStrategy.CANARY_DEPLOYMENT.value
        elif any(keyword in text_lower for keyword in ['blue-green', 'blue green']):
            return ImplementationStrategy.BLUE_GREEN.value
        elif any(keyword in text_lower for keyword in ['maintenance', 'downtime', 'window']):
            return ImplementationStrategy.MAINTENANCE_WINDOW.value
        elif any(keyword in text_lower for keyword in ['feature flag', 'toggle']):
            return ImplementationStrategy.FEATURE_FLAG.value
        elif any(keyword in text_lower for keyword in ['rollout', 'staged']):
            return ImplementationStrategy.GRADUAL_ROLLOUT.value
        else:
            return ImplementationStrategy.IMMEDIATE.value  # 기본값
    
    def _infer_risk_level(self, text: str) -> str:
        """위험 수준 추론"""
        text_lower = text.lower()
        
        if any(keyword in text_lower for keyword in ['critical', 'dangerous', 'high risk']):
            return RiskLevel.CRITICAL.value
        elif any(keyword in text_lower for keyword in ['risky', 'caution', 'careful']):
            return RiskLevel.HIGH.value
        elif any(keyword in text_lower for keyword in ['moderate', 'medium']):
            return RiskLevel.MEDIUM.value
        elif any(keyword in text_lower for keyword in ['safe', 'low risk', 'minimal']):
            return RiskLevel.LOW.value
        else:
            return RiskLevel.MEDIUM.value  # 기본값
    
    def _estimate_effort(self, text: str) -> int:
        """노력 시간 추정 (분 단위)"""
        text_lower = text.lower()
        
        # 시간 키워드 검색
        if any(keyword in text_lower for keyword in ['minutes', 'quick', 'simple']):
            return 30
        elif any(keyword in text_lower for keyword in ['hour', 'hours']):
            return 120
        elif any(keyword in text_lower for keyword in ['day', 'days']):
            return 480
        elif any(keyword in text_lower for keyword in ['week', 'weeks']):
            return 2400
        elif any(keyword in text_lower for keyword in ['complex', 'difficult', 'major']):
            return 960
        else:
            return 240  # 기본값: 4시간
    
    def _extract_code_changes(self, text: str) -> List[str]:
        """코드 변경사항 추출"""
        code_changes = []
        
        # 코드 블록 추출
        code_blocks = re.findall(r'```[\s\S]*?```', text)
        for block in code_blocks:
            # ``` 제거 하고 내용만 추출
            code_content = re.sub(r'```\w*\n?', '', block).strip()
            if code_content:
                code_changes.append(code_content)
        
        # 코드가 없으면 텍스트에서 변경사항 추출
        if not code_changes:
            lines = text.split('\n')
            for line in lines:
                if any(keyword in line.lower() for keyword in ['modify', 'change', 'update', 'add', 'remove']):
                    code_changes.append(line.strip())
        
        return code_changes[:10]  # 최대 10개
    
    def _extract_rollback_plan(self, text: str) -> str:
        """롤백 계획 추출"""
        text_lower = text.lower()
        
        # 롤백 관련 섹션 찾기
        rollback_keywords = ['rollback', 'revert', 'undo', 'restore']
        lines = text.split('\n')
        
        rollback_lines = []
        in_rollback_section = False
        
        for line in lines:
            line_lower = line.lower()
            
            if any(keyword in line_lower for keyword in rollback_keywords):
                in_rollback_section = True
                rollback_lines.append(line.strip())
            elif in_rollback_section:
                if line.strip() and not line.startswith('#'):
                    rollback_lines.append(line.strip())
                elif not line.strip():
                    break  # 빈 줄이면 섹션 끝
        
        if rollback_lines:
            return '\n'.join(rollback_lines)
        else:
            return "기본 롤백 절차: 이전 버전으로 복원 후 서비스 재시작"
    
    async def _create_solution_object(self, raw_solution: Dict[str, Any], 
                                    problem: Problem, context: SystemContext) -> Optional[Solution]:
        """원시 솔루션 데이터를 Solution 객체로 변환"""
        try:
            solution_id = hashlib.md5(
                f"{problem.id}_{raw_solution.get('title', '')}_{datetime.now().isoformat()}"
                .encode()
            ).hexdigest()[:16]
            
            solution = Solution(
                id=solution_id,
                title=raw_solution.get('title', 'Untitled Solution'),
                description=raw_solution.get('description', ''),
                solution_type=SolutionType(raw_solution.get('solution_type', SolutionType.CODE_FIX.value)),
                implementation_strategy=ImplementationStrategy(
                    raw_solution.get('implementation_strategy', ImplementationStrategy.IMMEDIATE.value)
                ),
                risk_level=RiskLevel(raw_solution.get('risk_level', RiskLevel.MEDIUM.value)),
                confidence_score=float(raw_solution.get('confidence_score', 7.0)),
                impact_score=0.0,  # 나중에 계산
                effort_estimate=int(raw_solution.get('effort_estimate', 240)),
                cost_estimate=self._estimate_cost(raw_solution),
                code_changes=raw_solution.get('code_changes', []),
                config_changes=raw_solution.get('config_changes', {}),
                infrastructure_changes=raw_solution.get('infrastructure_changes', []),
                prerequisites=raw_solution.get('prerequisites', []),
                rollback_plan=raw_solution.get('rollback_plan', ''),
                test_plan=await self._generate_test_plan(raw_solution, problem, context),
                monitoring_plan=await self._generate_monitoring_plan(raw_solution, problem, context),
                success_criteria=self._generate_success_criteria(raw_solution, problem),
                side_effects=self._predict_side_effects(raw_solution, context),
                alternatives=raw_solution.get('alternatives', [])
            )
            
            return solution
            
        except Exception as e:
            logger.error(f"솔루션 객체 생성 실패: {e}")
            return None
    
    def _estimate_cost(self, raw_solution: Dict[str, Any]) -> float:
        """비용 추정"""
        base_cost = 0.0
        
        # 시간 기반 비용 (시간당 $100 가정)
        effort_hours = raw_solution.get('effort_estimate', 240) / 60
        base_cost += effort_hours * 100
        
        # 인프라 비용
        if raw_solution.get('infrastructure_changes'):
            base_cost += len(raw_solution['infrastructure_changes']) * 500
        
        # 복잡성 기반 추가 비용
        if raw_solution.get('solution_type') == SolutionType.INFRASTRUCTURE.value:
            base_cost *= 1.5
        
        return round(base_cost, 2)
    
    async def _generate_test_plan(self, raw_solution: Dict[str, Any], 
                                problem: Problem, context: SystemContext) -> str:
        """테스트 계획 생성"""
        test_plan_prompt = f"""
        다음 솔루션에 대한 테스트 계획을 생성해주세요:
        
        솔루션: {raw_solution.get('title', '')}
        설명: {raw_solution.get('description', '')}
        변경사항: {raw_solution.get('code_changes', [])}
        
        테스트 계획에 포함할 항목:
        1. 단위 테스트
        2. 통합 테스트
        3. 성능 테스트
        4. 보안 테스트 (필요시)
        5. 사용자 수용 테스트
        
        간결하고 실행 가능한 테스트 계획을 제공해주세요.
        """
        
        try:
            response = await self.llm_interface.generate_response(test_plan_prompt)
            return response[:1000]  # 길이 제한
        except Exception:
            return self._generate_default_test_plan(raw_solution)
    
    def _generate_default_test_plan(self, raw_solution: Dict[str, Any]) -> str:
        """기본 테스트 계획 생성"""
        solution_type = raw_solution.get('solution_type', '')
        
        if solution_type == SolutionType.CODE_FIX.value:
            return """
            1. 단위 테스트: 수정된 함수/메서드 테스트
            2. 통합 테스트: 연관 컴포넌트 상호작용 검증
            3. 회귀 테스트: 기존 기능 영향 확인
            4. 부하 테스트: 성능 저하 여부 확인
            """
        elif solution_type == SolutionType.INFRASTRUCTURE.value:
            return """
            1. 인프라 상태 검증
            2. 연결성 테스트
            3. 장애 조치 테스트
            4. 모니터링 검증
            """
        else:
            return """
            1. 기능 테스트: 주요 기능 동작 확인
            2. 회귀 테스트: 기존 기능 검증
            3. 성능 테스트: 응답 시간 및 처리량 확인
            """
    
    async def _generate_monitoring_plan(self, raw_solution: Dict[str, Any], 
                                      problem: Problem, context: SystemContext) -> str:
        """모니터링 계획 생성"""
        monitoring_plan_prompt = f"""
        다음 솔루션에 대한 모니터링 계획을 생성해주세요:
        
        솔루션: {raw_solution.get('title', '')}
        문제: {problem.description}
        영향 받는 컴포넌트: {problem.affected_components}
        
        모니터링 계획에 포함할 항목:
        1. 핵심 메트릭
        2. 알림 임계값
        3. 대시보드 설정
        4. 로그 모니터링
        
        실용적인 모니터링 계획을 제공해주세요.
        """
        
        try:
            response = await self.llm_interface.generate_response(monitoring_plan_prompt)
            return response[:1000]  # 길이 제한
        except Exception:
            return self._generate_default_monitoring_plan(raw_solution, problem)
    
    def _generate_default_monitoring_plan(self, raw_solution: Dict[str, Any], problem: Problem) -> str:
        """기본 모니터링 계획 생성"""
        return f"""
        핵심 메트릭:
        - 응답 시간: 평균 < 200ms
        - 에러율: < 1%
        - CPU 사용률: < 80%
        - 메모리 사용률: < 85%
        
        알림 설정:
        - 에러율 2% 초과 시 즉시 알림
        - 응답 시간 500ms 초과 시 경고
        - 리소스 사용률 90% 초과 시 알림
        
        영향 받는 컴포넌트: {', '.join(problem.affected_components)}
        """
    
    def _generate_success_criteria(self, raw_solution: Dict[str, Any], problem: Problem) -> List[str]:
        """성공 기준 생성"""
        criteria = [
            "문제 증상이 해결됨",
            "시스템 안정성 유지",
            "성능 저하 없음"
        ]
        
        # 문제 유형별 특화 기준
        if problem.severity == ProblemSeverity.CRITICAL:
            criteria.append("서비스 가용성 99.9% 이상 유지")
        
        if "performance" in problem.description.lower():
            criteria.append("응답 시간 기준선 대비 개선")
        
        if "error" in problem.description.lower():
            criteria.append("에러율 1% 미만 유지")
        
        return criteria
    
    def _predict_side_effects(self, raw_solution: Dict[str, Any], context: SystemContext) -> List[str]:
        """부작용 예측"""
        side_effects = []
        
        solution_type = raw_solution.get('solution_type', '')
        
        if solution_type == SolutionType.CODE_FIX.value:
            side_effects.extend([
                "관련 기능의 동작 변경 가능성",
                "메모리 사용량 변화",
                "API 응답 시간 변화"
            ])
        
        elif solution_type == SolutionType.INFRASTRUCTURE.value:
            side_effects.extend([
                "네트워크 지연 증가 가능성",
                "리소스 사용량 변화",
                "다른 서비스에 영향"
            ])
        
        elif solution_type == SolutionType.SCALING.value:
            side_effects.extend([
                "비용 증가",
                "복잡성 증가",
                "모니터링 오버헤드"
            ])
        
        # 컨텍스트 기반 추가 예측
        if len(context.dependencies) > 5:
            side_effects.append("의존성 체인 영향")
        
        return side_effects[:5]  # 최대 5개
    
    def rank_solutions_by_impact(self, solutions: List[Solution]) -> RankedSolutions:
        """영향도 기반 솔루션 순위 매기기"""
        if not solutions:
            return RankedSolutions(
                solutions=[],
                ranking_criteria={},
                recommendation="해결책이 없습니다",
                alternatives_explanation=""
            )
        
        # 순위 기준 가중치
        ranking_criteria = {
            "impact_score": 0.3,
            "confidence_score": 0.25,
            "risk_level": 0.2,  # 낮을수록 좋음
            "effort_estimate": 0.15,  # 낮을수록 좋음
            "cost_estimate": 0.1   # 낮을수록 좋음
        }
        
        # 각 솔루션의 종합 점수 계산
        scored_solutions = []
        
        for solution in solutions:
            total_score = 0.0
            
            # 영향도 점수 (높을수록 좋음)
            total_score += solution.impact_score * ranking_criteria["impact_score"]
            
            # 신뢰도 점수 (높을수록 좋음)
            total_score += solution.confidence_score * ranking_criteria["confidence_score"]
            
            # 위험도 점수 (낮을수록 좋음, 역수 사용)
            risk_score = self._risk_level_to_score(solution.risk_level)
            total_score += (10 - risk_score) * ranking_criteria["risk_level"]
            
            # 노력 추정 점수 (낮을수록 좋음, 정규화)
            effort_score = min(10, max(1, 11 - (solution.effort_estimate / 60)))  # 시간 단위로 변환
            total_score += effort_score * ranking_criteria["effort_estimate"]
            
            # 비용 점수 (낮을수록 좋음, 정규화)
            cost_score = min(10, max(1, 11 - (solution.cost_estimate / 1000)))
            total_score += cost_score * ranking_criteria["cost_estimate"]
            
            scored_solutions.append((solution, total_score))
        
        # 점수 순으로 정렬
        scored_solutions.sort(key=lambda x: x[1], reverse=True)
        ranked_solutions = [solution for solution, score in scored_solutions]
        
        # 추천 및 대안 설명 생성
        recommendation = self._generate_recommendation(ranked_solutions[0])
        alternatives_explanation = self._generate_alternatives_explanation(ranked_solutions)
        
        return RankedSolutions(
            solutions=ranked_solutions,
            ranking_criteria=ranking_criteria,
            recommendation=recommendation,
            alternatives_explanation=alternatives_explanation
        )
    
    def _risk_level_to_score(self, risk_level: RiskLevel) -> float:
        """위험 수준을 점수로 변환"""
        risk_scores = {
            RiskLevel.MINIMAL: 1.0,
            RiskLevel.LOW: 3.0,
            RiskLevel.MEDIUM: 5.0,
            RiskLevel.HIGH: 7.0,
            RiskLevel.CRITICAL: 10.0
        }
        return risk_scores.get(risk_level, 5.0)
    
    def _generate_recommendation(self, best_solution: Solution) -> str:
        """최고 솔루션에 대한 추천 설명"""
        return f"""
        추천 솔루션: {best_solution.title}
        
        추천 이유:
        - 높은 영향도 점수: {best_solution.impact_score:.1f}/10
        - 신뢰도: {best_solution.confidence_score:.1f}/10
        - 위험 수준: {best_solution.risk_level.value}
        - 예상 소요 시간: {best_solution.effort_estimate//60}시간 {best_solution.effort_estimate%60}분
        
        이 솔루션은 위험 대비 효과가 가장 높고 구현이 상대적으로 용이합니다.
        """
    
    def _generate_alternatives_explanation(self, ranked_solutions: List[Solution]) -> str:
        """대안 솔루션들에 대한 설명"""
        if len(ranked_solutions) <= 1:
            return "다른 대안이 없습니다."
        
        explanations = []
        for i, solution in enumerate(ranked_solutions[1:4], 2):  # 2-4위까지
            explanations.append(
                f"{i}순위: {solution.title} "
                f"(위험도: {solution.risk_level.value}, 시간: {solution.effort_estimate//60}h)"
            )
        
        return "대안 솔루션들:\n" + "\n".join(explanations)
    
    async def simulate_solution_outcomes(self, solution: Solution) -> SimulationResult:
        """솔루션 적용 결과 시뮬레이션"""
        # 몬테카를로 시뮬레이션 또는 룰 기반 예측
        
        success_probability = self._calculate_success_probability(solution)
        predicted_outcomes = self._predict_outcomes(solution)
        potential_issues = self._identify_potential_issues(solution)
        performance_impact = self._estimate_performance_impact(solution)
        resource_utilization = self._estimate_resource_impact(solution)
        estimated_downtime = self._estimate_downtime(solution)
        confidence_interval = self._calculate_confidence_interval(solution)
        
        return SimulationResult(
            solution_id=solution.id,
            success_probability=success_probability,
            predicted_outcomes=predicted_outcomes,
            potential_issues=potential_issues,
            performance_impact=performance_impact,
            resource_utilization=resource_utilization,
            estimated_downtime=estimated_downtime,
            confidence_interval=confidence_interval
        )
    
    def _calculate_success_probability(self, solution: Solution) -> float:
        """성공 확률 계산"""
        base_probability = 0.7  # 기본 70%
        
        # 신뢰도 점수 기반 조정
        confidence_factor = (solution.confidence_score - 5) * 0.05
        base_probability += confidence_factor
        
        # 위험 수준 기반 조정
        risk_penalty = self._risk_level_to_score(solution.risk_level) * 0.02
        base_probability -= risk_penalty
        
        # 롤백 계획 존재 여부
        if solution.rollback_plan and len(solution.rollback_plan) > 50:
            base_probability += 0.1
        
        # 테스트 계획 존재 여부
        if solution.test_plan and len(solution.test_plan) > 50:
            base_probability += 0.1
        
        return min(0.95, max(0.05, base_probability))
    
    def _predict_outcomes(self, solution: Solution) -> Dict[str, Any]:
        """결과 예측"""
        return {
            "problem_resolution": "높음" if solution.confidence_score > 7 else "보통",
            "performance_change": self._predict_performance_change(solution),
            "stability_impact": self._predict_stability_impact(solution),
            "user_experience": self._predict_user_experience_impact(solution),
            "operational_overhead": self._predict_operational_overhead(solution)
        }
    
    def _predict_performance_change(self, solution: Solution) -> str:
        """성능 변화 예측"""
        if solution.solution_type == SolutionType.OPTIMIZATION:
            return "개선"
        elif solution.solution_type == SolutionType.SCALING:
            return "개선"
        elif solution.solution_type == SolutionType.MONITORING:
            return "약간 저하"
        else:
            return "변화 없음"
    
    def _predict_stability_impact(self, solution: Solution) -> str:
        """안정성 영향 예측"""
        if solution.risk_level in [RiskLevel.CRITICAL, RiskLevel.HIGH]:
            return "위험"
        elif solution.risk_level == RiskLevel.MEDIUM:
            return "보통"
        else:
            return "안전"
    
    def _predict_user_experience_impact(self, solution: Solution) -> str:
        """사용자 경험 영향 예측"""
        if solution.implementation_strategy == ImplementationStrategy.MAINTENANCE_WINDOW:
            return "일시 영향"
        elif solution.solution_type == SolutionType.OPTIMIZATION:
            return "개선"
        else:
            return "변화 없음"
    
    def _predict_operational_overhead(self, solution: Solution) -> str:
        """운영 오버헤드 예측"""
        if solution.solution_type == SolutionType.MONITORING:
            return "증가"
        elif solution.solution_type == SolutionType.INFRASTRUCTURE:
            return "증가"
        elif solution.solution_type == SolutionType.OPTIMIZATION:
            return "감소"
        else:
            return "변화 없음"
    
    def _identify_potential_issues(self, solution: Solution) -> List[str]:
        """잠재적 이슈 식별"""
        issues = []
        
        if not solution.rollback_plan:
            issues.append("롤백 계획 부족으로 실패 시 복구 어려움")
        
        if solution.effort_estimate > 480:
            issues.append("긴 구현 시간으로 인한 추가 위험")
        
        if len(solution.affected_components) > 5:
            issues.append("다중 컴포넌트 영향으로 복잡성 증가")
        
        if solution.risk_level == RiskLevel.HIGH:
            issues.append("높은 위험으로 예상치 못한 부작용 가능")
        
        return issues
    
    def _estimate_performance_impact(self, solution: Solution) -> Dict[str, float]:
        """성능 영향 추정"""
        impact = {
            "cpu_usage_change": 0.0,
            "memory_usage_change": 0.0,
            "response_time_change": 0.0,
            "throughput_change": 0.0
        }
        
        if solution.solution_type == SolutionType.OPTIMIZATION:
            impact["response_time_change"] = -0.2  # 20% 개선
            impact["throughput_change"] = 0.15     # 15% 증가
        elif solution.solution_type == SolutionType.MONITORING:
            impact["cpu_usage_change"] = 0.05      # 5% 증가
            impact["memory_usage_change"] = 0.03   # 3% 증가
        
        return impact
    
    def _estimate_resource_impact(self, solution: Solution) -> Dict[str, float]:
        """리소스 영향 추정"""
        return {
            "cpu": 0.05,     # 5% 증가 (기본값)
            "memory": 0.03,  # 3% 증가 (기본값)
            "disk": 0.01,    # 1% 증가 (기본값)
            "network": 0.02  # 2% 증가 (기본값)
        }
    
    def _estimate_downtime(self, solution: Solution) -> int:
        """예상 다운타임 (초)"""
        if solution.implementation_strategy == ImplementationStrategy.MAINTENANCE_WINDOW:
            return solution.effort_estimate * 60  # 전체 시간
        elif solution.implementation_strategy == ImplementationStrategy.BLUE_GREEN:
            return 30  # 스위치 시간
        elif solution.implementation_strategy == ImplementationStrategy.CANARY_DEPLOYMENT:
            return 0   # 무중단
        else:
            return solution.effort_estimate * 6  # 10% 다운타임
    
    def _calculate_confidence_interval(self, solution: Solution) -> Tuple[float, float]:
        """신뢰 구간 계산"""
        base_success = self._calculate_success_probability(solution)
        margin = 0.1  # 10% 여유
        
        lower_bound = max(0.0, base_success - margin)
        upper_bound = min(1.0, base_success + margin)
        
        return (lower_bound, upper_bound)
    
    async def generate_implementation_plan(self, solution: Solution) -> ImplementationPlan:
        """구현 계획 자동 생성"""
        phases = self._create_implementation_phases(solution)
        timeline = self._create_timeline(solution, phases)
        resources = self._determine_required_resources(solution)
        checkpoints = self._create_checkpoints(solution, phases)
        rollback_triggers = self._define_rollback_triggers(solution)
        success_metrics = self._define_success_metrics(solution)
        communication_plan = self._create_communication_plan(solution)
        
        return ImplementationPlan(
            solution_id=solution.id,
            phases=phases,
            timeline=timeline,
            resources_required=resources,
            checkpoints=checkpoints,
            rollback_triggers=rollback_triggers,
            success_metrics=success_metrics,
            communication_plan=communication_plan
        )
    
    def _create_implementation_phases(self, solution: Solution) -> List[Dict[str, Any]]:
        """구현 단계 생성"""
        phases = []
        
        # 1. 준비 단계
        phases.append({
            "name": "준비",
            "description": "필요한 리소스 준비 및 사전 검증",
            "duration_minutes": 30,
            "tasks": [
                "백업 생성",
                "테스트 환경 준비",
                "솔루션 테스트 준비"
            ]
        })
        
        # 2. 구현 단계
        phases.append({
            "name": "구현",
            "description": "솔루션 구현 및 테스트",
            "duration_minutes": solution.effort_estimate,
            "tasks": [
                "코드 변경사항 적용",
                "설정 변경사항 적용", 
                "단위 테스트 실행",
                "통합 테스트 실행"
            ]
        })
        
        # 3. 검증 단계
        phases.append({
            "name": "검증",
            "description": "구현 결과 검증 및 모니터링",
            "duration_minutes": 60,
            "tasks": [
                "기능 동작 확인",
                "성능 메트릭 확인",
                "에러율 모니터링",
                "사용자 피드백 수집"
            ]
        })
        
        # 4. 배포 단계 (구현 전략에 따라)
        if solution.implementation_strategy == ImplementationStrategy.CANARY_DEPLOYMENT:
            phases.append({
                "name": "카나리 배포",
                "description": "소규모 트래픽으로 점진적 배포",
                "duration_minutes": 120,
                "tasks": [
                    "5% 트래픽으로 배포",
                    "메트릭 모니터링",
                    "50% 트래픽으로 확장",
                    "100% 트래픽으로 완전 배포"
                ]
            })
        elif solution.implementation_strategy == ImplementationStrategy.BLUE_GREEN:
            phases.append({
                "name": "블루-그린 배포",
                "description": "새 환경 구성 후 스위치",
                "duration_minutes": 90,
                "tasks": [
                    "그린 환경 구성",
                    "테스트 및 검증",
                    "트래픽 스위치",
                    "블루 환경 정리"
                ]
            })
        
        # 5. 완료 단계
        phases.append({
            "name": "완료",
            "description": "구현 완료 및 정리",
            "duration_minutes": 30,
            "tasks": [
                "문서 업데이트",
                "팀 공유",
                "성공 메트릭 기록",
                "교훈 정리"
            ]
        })
        
        return phases
    
    def _create_timeline(self, solution: Solution, phases: List[Dict[str, Any]]) -> Dict[str, datetime]:
        """타임라인 생성"""
        timeline = {}
        current_time = datetime.now()
        
        timeline["start"] = current_time
        
        for i, phase in enumerate(phases):
            phase_duration = timedelta(minutes=phase["duration_minutes"])
            if i == 0:
                timeline[f"phase_{i+1}_start"] = current_time
            else:
                timeline[f"phase_{i+1}_start"] = timeline[f"phase_{i}_end"]
            
            timeline[f"phase_{i+1}_end"] = timeline[f"phase_{i+1}_start"] + phase_duration
        
        timeline["end"] = timeline[f"phase_{len(phases)}_end"]
        
        return timeline
    
    def _determine_required_resources(self, solution: Solution) -> Dict[str, Any]:
        """필요한 리소스 결정"""
        resources = {
            "human_resources": [],
            "technical_resources": [],
            "budget": solution.cost_estimate,
            "time": solution.effort_estimate
        }
        
        # 인적 리소스
        if solution.solution_type == SolutionType.CODE_FIX:
            resources["human_resources"].extend(["개발자", "QA 엔지니어"])
        elif solution.solution_type == SolutionType.INFRASTRUCTURE:
            resources["human_resources"].extend(["DevOps 엔지니어", "시스템 관리자"])
        elif solution.solution_type == SolutionType.SECURITY:
            resources["human_resources"].extend(["보안 엔지니어", "개발자"])
        
        # 기술적 리소스
        if solution.solution_type == SolutionType.INFRASTRUCTURE:
            resources["technical_resources"].extend([
                "테스트 환경",
                "모니터링 도구",
                "배포 파이프라인"
            ])
        
        if solution.solution_type == SolutionType.CODE_FIX:
            resources["technical_resources"].extend([
                "개발 환경",
                "테스트 프레임워크",
                "코드 리뷰 도구"
            ])
        
        return resources
    
    def _create_checkpoints(self, solution: Solution, phases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """체크포인트 생성"""
        checkpoints = []
        
        for i, phase in enumerate(phases):
            checkpoint = {
                "phase": phase["name"],
                "criteria": [],
                "actions_on_failure": []
            }
            
            if phase["name"] == "준비":
                checkpoint["criteria"] = [
                    "백업 완료 확인",
                    "테스트 환경 준비 완료",
                    "팀 준비 상태 확인"
                ]
                checkpoint["actions_on_failure"] = [
                    "문제 해결 후 재시도",
                    "일정 조정"
                ]
            
            elif phase["name"] == "구현":
                checkpoint["criteria"] = [
                    "코드 변경 완료",
                    "테스트 통과",
                    "코드 리뷰 완료"
                ]
                checkpoint["actions_on_failure"] = [
                    "롤백 실행",
                    "문제 분석 후 재구현"
                ]
            
            elif phase["name"] == "검증":
                checkpoint["criteria"] = [
                    "기능 동작 정상",
                    "성능 기준 충족",
                    "에러율 정상 범위"
                ]
                checkpoint["actions_on_failure"] = [
                    "즉시 롤백",
                    "원인 분석"
                ]
            
            checkpoints.append(checkpoint)
        
        return checkpoints
    
    def _define_rollback_triggers(self, solution: Solution) -> List[str]:
        """롤백 트리거 정의"""
        triggers = [
            "에러율 5% 초과",
            "응답 시간 200% 증가",
            "서비스 가용성 95% 미만",
            "치명적 버그 발견"
        ]
        
        if solution.solution_type == SolutionType.INFRASTRUCTURE:
            triggers.extend([
                "인프라 장애 발생",
                "네트워크 연결 문제",
                "리소스 부족"
            ])
        
        if solution.solution_type == SolutionType.SECURITY:
            triggers.extend([
                "보안 취약점 발견",
                "인증/인가 문제",
                "데이터 유출 위험"
            ])
        
        return triggers
    
    def _define_success_metrics(self, solution: Solution) -> List[str]:
        """성공 메트릭 정의"""
        metrics = [
            "문제 해결 확인",
            "시스템 안정성 유지",
            "성능 저하 없음"
        ]
        
        if solution.solution_type == SolutionType.OPTIMIZATION:
            metrics.extend([
                "응답 시간 개선",
                "처리량 증가",
                "리소스 사용량 최적화"
            ])
        
        if solution.solution_type == SolutionType.SECURITY:
            metrics.extend([
                "보안 취약점 해결",
                "인증/인가 정상 동작",
                "보안 감사 통과"
            ])
        
        return metrics
    
    def _create_communication_plan(self, solution: Solution) -> Dict[str, Any]:
        """커뮤니케이션 계획 생성"""
        return {
            "stakeholders": [
                "개발팀",
                "운영팀",
                "QA팀",
                "비즈니스 팀"
            ],
            "communication_channels": [
                "이메일",
                "슬랙/팀즈",
                "대시보드",
                "정기 회의"
            ],
            "notifications": {
                "start": "구현 시작 알림",
                "milestones": "주요 단계 완료 알림",
                "issues": "문제 발생 즉시 알림",
                "completion": "구현 완료 보고"
            },
            "reporting_schedule": {
                "daily": "일일 진행 상황 리포트",
                "weekly": "주간 종합 리포트",
                "milestone": "단계별 완료 리포트"
            }
        }
    
    def _generate_cache_key(self, problem: Problem, context: SystemContext) -> str:
        """캐시 키 생성"""
        key_components = [
            problem.title,
            problem.description,
            str(problem.severity.value),
            str(sorted(problem.affected_components)),
            str(sorted(context.technologies)),
            context.deployment_environment
        ]
        
        key_string = "|".join(key_components)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _get_cached_solutions(self, cache_key: str) -> Optional[List[Solution]]:
        """캐시에서 솔루션 조회"""
        with self._lock:
            if cache_key in self.solution_cache:
                cached_data = self.solution_cache[cache_key]
                # 캐시 만료 확인 (1시간)
                if datetime.now() - cached_data["timestamp"] < timedelta(hours=1):
                    return cached_data["solutions"]
                else:
                    del self.solution_cache[cache_key]
        return None
    
    def _cache_solutions(self, cache_key: str, solutions: List[Solution]):
        """솔루션 캐시에 저장"""
        with self._lock:
            self.solution_cache[cache_key] = {
                "solutions": solutions,
                "timestamp": datetime.now()
            }
            
            # 캐시 크기 제한 (100개)
            if len(self.solution_cache) > 100:
                oldest_key = min(
                    self.solution_cache.keys(),
                    key=lambda k: self.solution_cache[k]["timestamp"]
                )
                del self.solution_cache[oldest_key]
    
    def _update_generation_metrics(self, execution_time: float, success: bool):
        """생성 메트릭 업데이트"""
        with self._lock:
            self.generation_metrics["total_generations"] += 1
            
            if success:
                self.generation_metrics["successful_generations"] += 1
            
            # 평균 실행 시간 계산
            total = self.generation_metrics["total_generations"]
            current_avg = self.generation_metrics["average_generation_time"]
            new_avg = ((current_avg * (total - 1)) + execution_time) / total
            self.generation_metrics["average_generation_time"] = new_avg
    
    def record_solution_feedback(self, solution_id: str, feedback: Dict[str, Any]):
        """솔루션 피드백 기록"""
        feedback_data = {
            "solution_id": solution_id,
            "feedback": feedback,
            "timestamp": datetime.now()
        }
        
        if feedback.get("success", False):
            # 성공 사례 저장
            success_data = {
                "solution_id": solution_id,
                "solution_type": feedback.get("solution_type"),
                "approach": feedback.get("approach"),
                "success_factors": feedback.get("success_factors", []),
                "original_problem": feedback.get("original_problem"),
                "timestamp": datetime.now()
            }
            self.successful_solutions.append(success_data)
            logger.info(f"성공 솔루션 기록: {solution_id}")
        else:
            # 실패 사례 저장
            failure_data = {
                "solution_id": solution_id,
                "failure_reason": feedback.get("failure_reason"),
                "lessons_learned": feedback.get("lessons_learned", []),
                "timestamp": datetime.now()
            }
            self.failed_solutions.append(failure_data)
            logger.warning(f"실패 솔루션 기록: {solution_id}")
    
    def get_generation_statistics(self) -> Dict[str, Any]:
        """생성 통계 반환"""
        with self._lock:
            success_rate = 0.0
            if self.generation_metrics["total_generations"] > 0:
                success_rate = (
                    self.generation_metrics["successful_generations"] / 
                    self.generation_metrics["total_generations"]
                )
            
            return {
                "total_generations": self.generation_metrics["total_generations"],
                "successful_generations": self.generation_metrics["successful_generations"],
                "success_rate": success_rate,
                "average_generation_time": self.generation_metrics["average_generation_time"],
                "cache_hits": self.generation_metrics["cache_hits"],
                "cache_hit_rate": (
                    self.generation_metrics["cache_hits"] / 
                    max(1, self.generation_metrics["total_generations"])
                ),
                "successful_solutions_count": len(self.successful_solutions),
                "failed_solutions_count": len(self.failed_solutions)
            }
    
    async def refine_solution_based_on_feedback(self, solution: Solution, 
                                              feedback: Dict[str, Any]) -> Solution:
        """피드백 기반 솔루션 개선"""
        refinement_prompt = self.prompt_manager.format_template(
            "solution_refinement",
            existing_solution=solution.__dict__,
            user_feedback=feedback,
            execution_results=feedback.get("execution_results", {})
        )
        
        try:
            llm_response = await self.llm_interface.generate_response(refinement_prompt)
            refined_data = self._parse_llm_response(llm_response)
            
            if refined_data:
                # 기존 솔루션 업데이트
                refined_solution = solution
                refined_solution.description = refined_data[0].get("description", solution.description)
                refined_solution.code_changes = refined_data[0].get("code_changes", solution.code_changes)
                refined_solution.rollback_plan = refined_data[0].get("rollback_plan", solution.rollback_plan)
                refined_solution.confidence_score = min(10.0, solution.confidence_score + 1.0)
                
                return refined_solution
            
        except Exception as e:
            logger.error(f"솔루션 개선 실패: {e}")
        
        return solution
    
    def export_solutions_report(self, solutions: List[Solution], 
                              format_type: str = "json") -> str:
        """솔루션 리포트 내보내기"""
        if format_type == "json":
            return self._export_json_report(solutions)
        elif format_type == "markdown":
            return self._export_markdown_report(solutions)
        elif format_type == "html":
            return self._export_html_report(solutions)
        else:
            raise ValueError(f"지원하지 않는 형식: {format_type}")
    
    def _export_json_report(self, solutions: List[Solution]) -> str:
        """JSON 형식 리포트"""
        report_data = {
            "generated_at": datetime.now().isoformat(),
            "total_solutions": len(solutions),
            "solutions": []
        }
        
        for solution in solutions:
            solution_data = {
                "id": solution.id,
                "title": solution.title,
                "description": solution.description,
                "solution_type": solution.solution_type.value,
                "risk_level": solution.risk_level.value,
                "confidence_score": solution.confidence_score,
                "impact_score": solution.impact_score,
                "effort_estimate": solution.effort_estimate,
                "cost_estimate": solution.cost_estimate
            }
            report_data["solutions"].append(solution_data)
        
        return json.dumps(report_data, indent=2, ensure_ascii=False)
    
    def _export_markdown_report(self, solutions: List[Solution]) -> str:
        """Markdown 형식 리포트"""
        report = f"# 솔루션 분석 리포트\n\n"
        report += f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        report += f"총 솔루션 수: {len(solutions)}\n\n"
        
        for i, solution in enumerate(solutions, 1):
            report += f"## {i}. {solution.title}\n\n"
            report += f"**설명:** {solution.description}\n\n"
            report += f"**솔루션 유형:** {solution.solution_type.value}\n"
            report += f"**위험 수준:** {solution.risk_level.value}\n"
            report += f"**신뢰도:** {solution.confidence_score}/10\n"
            report += f"**영향도:** {solution.impact_score}/10\n"
            report += f"**예상 시간:** {solution.effort_estimate}분\n"
            report += f"**예상 비용:** ${solution.cost_estimate:,.2f}\n\n"
            
            if solution.rollback_plan:
                report += f"**롤백 계획:**\n{solution.rollback_plan}\n\n"
            
            report += "---\n\n"
        
        return report
    
    def _export_html_report(self, solutions: List[Solution]) -> str:
        """HTML 형식 리포트"""
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>솔루션 분석 리포트</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .solution {{ border: 1px solid #ddd; margin: 20px 0; padding: 20px; }}
                .risk-critical {{ border-left: 5px solid #ff4444; }}
                .risk-high {{ border-left: 5px solid #ff8800; }}
                .risk-medium {{ border-left: 5px solid #ffaa00; }}
                .risk-low {{ border-left: 5px solid #44ff44; }}
                .metrics {{ display: flex; gap: 20px; }}
                .metric {{ text-align: center; }}
            </style>
        </head>
        <body>
            <h1>솔루션 분석 리포트</h1>
            <p>생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>총 솔루션 수: {len(solutions)}</p>
        """
        
        for i, solution in enumerate(solutions, 1):
            risk_class = f"risk-{solution.risk_level.value}"
            html += f"""
            <div class="solution {risk_class}">
                <h2>{i}. {solution.title}</h2>
                <p><strong>설명:</strong> {solution.description}</p>
                <div class="metrics">
                    <div class="metric">
                        <h4>신뢰도</h4>
                        <p>{solution.confidence_score}/10</p>
                    </div>
                    <div class="metric">
                        <h4>영향도</h4>
                        <p>{solution.impact_score}/10</p>
                    </div>
                    <div class="metric">
                        <h4>위험도</h4>
                        <p>{solution.risk_level.value}</p>
                    </div>
                    <div class="metric">
                        <h4>예상 시간</h4>
                        <p>{solution.effort_estimate}분</p>
                    </div>
                </div>
            </div>
            """
        
        html += """
        </body>
        </html>
        """
        
        return html


# 헬퍼 함수들
def create_solution_generator(llm_config: Dict[str, Any]) -> IntelligentSolutionGenerator:
    """솔루션 생성기 팩토리 함수"""
    return IntelligentSolutionGenerator(llm_config)


async def analyze_problem_and_generate_solutions(
    problem_description: str,
    affected_components: List[str],
    system_context: Dict[str, Any],
    llm_config: Dict[str, Any]
) -> Tuple[List[Solution], RankedSolutions]:
    """문제 분석 및 솔루션 생성 통합 함수"""
    
    # 문제 객체 생성
    problem = Problem(
        id=hashlib.md5(problem_description.encode()).hexdigest()[:16],
        title=problem_description[:100],
        description=problem_description,
        severity=ProblemSeverity.MEDIUM,  # 기본값
        affected_components=affected_components,
        symptoms=[],
        error_messages=[],
        metrics={},
        timestamp=datetime.now(),
        source_logs=[]
    )
    
    # 시스템 컨텍스트 객체 생성
    context = SystemContext(
        architecture=system_context.get("architecture", {}),
        technologies=system_context.get("technologies", []),
        deployment_environment=system_context.get("deployment_environment", "production"),
        scaling_info=system_context.get("scaling_info", {}),
        performance_baselines=system_context.get("performance_baselines", {}),
        recent_changes=system_context.get("recent_changes", []),
        dependencies=system_context.get("dependencies", []),
        constraints=system_context.get("constraints", []),
        business_rules=system_context.get("business_rules", []),
        compliance_requirements=system_context.get("compliance_requirements", [])
    )
    
    # 솔루션 생성기 초기화
    generator = IntelligentSolutionGenerator(llm_config)
    await generator.initialize()
    
    try:
        # 솔루션 생성
        solutions = await generator.generate_solutions(problem, context)
        
        # 솔루션 순위 매기기
        ranked_solutions = generator.rank_solutions_by_impact(solutions)
        
        return solutions, ranked_solutions
        
    finally:
        await generator.cleanup()


if __name__ == "__main__":
    # 예제 사용법
    async def main():
        llm_config = {
            "api_url": "https://api.openai.com/v1/chat/completions",
            "api_key": "your-api-key",
            "model": "gpt-4",
            "max_tokens": 2000,
            "temperature": 0.7
        }
        
        problem_desc = "웹서버 응답 시간이 급격히 증가하고 있습니다"
        components = ["web_server", "database", "load_balancer"]
        context = {
            "technologies": ["nginx", "postgresql", "python"],
            "deployment_environment": "production",
            "constraints": ["24/7 서비스", "제로 다운타임"]
        }
        
        solutions, ranked = await analyze_problem_and_generate_solutions(
            problem_desc, components, context, llm_config
        )
        
        print(f"생성된 솔루션 수: {len(solutions)}")
        print(f"추천 솔루션: {ranked.recommendation}")
    
    # asyncio.run(main())