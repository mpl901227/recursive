#!/usr/bin/env python3
"""
AI Cost Prediction Utilities
AI 모델 호출 비용 예측 및 최적화 도구들
"""

import re
import requests
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any
import logging

# 로깅 설정
logger = logging.getLogger(__name__)


class TokenCounter:
    """토큰 계산기"""
    
    def __init__(self):
        self.encoders = {}
        self._init_encoders()
    
    def _init_encoders(self):
        """tiktoken 인코더들 초기화"""
        try:
            import tiktoken
            self.encoders["gpt-4"] = tiktoken.encoding_for_model("gpt-4")
            self.encoders["gpt-3.5-turbo"] = tiktoken.encoding_for_model("gpt-3.5-turbo")
            self.encoders["gpt-4-turbo"] = tiktoken.encoding_for_model("gpt-4-turbo")
            self.encoders["claude"] = self.encoders["gpt-4"]  # 근사치
        except Exception as e:
            logger.warning(f"토큰 인코더 초기화 오류: {e}")
    
    def count_tokens(self, text: str, model: str = "gpt-4") -> int:
        """텍스트의 토큰 수 계산"""
        try:
            if model.startswith("claude"):
                encoder = self.encoders.get("claude")
            else:
                encoder = self.encoders.get(model, self.encoders.get("gpt-4"))
            
            if encoder:
                return len(encoder.encode(text))
            else:
                # 대략적 계산 (1 토큰 ≈ 4 문자)
                return len(text) // 4
        except Exception as e:
            logger.warning(f"토큰 계산 오류: {e}")
            return len(text) // 4


class CostCalculator:
    """비용 계산기"""
    
    def __init__(self):
        # API 가격 정보 (USD per 1K tokens)
        self.api_pricing = {
            "claude-3-5-sonnet-20241022": {
                "input": 0.003,   # $3 per 1M tokens
                "output": 0.015,  # $15 per 1M tokens
                "name": "Claude 3.5 Sonnet"
            },
            "claude-3-haiku-20240307": {
                "input": 0.00025,  # $0.25 per 1M tokens
                "output": 0.00125, # $1.25 per 1M tokens
                "name": "Claude 3 Haiku"
            },
            "gpt-4": {
                "input": 0.03,    # $30 per 1M tokens
                "output": 0.06,   # $60 per 1M tokens
                "name": "GPT-4"
            },
            "gpt-4-turbo": {
                "input": 0.01,    # $10 per 1M tokens
                "output": 0.03,   # $30 per 1M tokens
                "name": "GPT-4 Turbo"
            },
            "gpt-3.5-turbo": {
                "input": 0.0005,  # $0.5 per 1M tokens
                "output": 0.0015, # $1.5 per 1M tokens
                "name": "GPT-3.5 Turbo"
            }
        }
        
        self.exchange_rate = 1300  # 기본 환율
        self.token_counter = TokenCounter()
        self._update_exchange_rate()
    
    def _update_exchange_rate(self) -> bool:
        """실시간 환율 정보 업데이트"""
        try:
            response = requests.get(
                "https://api.exchangerate-api.com/v4/latest/USD",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                self.exchange_rate = data["rates"]["KRW"]
                logger.info(f"환율 업데이트: 1 USD = {self.exchange_rate} KRW")
                return True
        except Exception as e:
            logger.warning(f"환율 정보 가져오기 실패: {e}")
        return False
    
    def calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> Dict[str, float]:
        """모델별 비용 계산"""
        pricing = self.api_pricing.get(model, self.api_pricing["gpt-3.5-turbo"])
        
        input_cost_usd = (input_tokens / 1000) * pricing["input"]
        output_cost_usd = (output_tokens / 1000) * pricing["output"]
        total_cost_usd = input_cost_usd + output_cost_usd
        
        # 원화 환산
        total_cost_krw = total_cost_usd * self.exchange_rate
        
        return {
            "input_cost_usd": input_cost_usd,
            "output_cost_usd": output_cost_usd,
            "total_cost_usd": total_cost_usd,
            "total_cost_krw": total_cost_krw,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "model": pricing["name"]
        }
    
    def compare_models(self, message: str, estimated_response_tokens: int = 500) -> Dict[str, Any]:
        """여러 모델간 비용 비교"""
        input_tokens = self.token_counter.count_tokens(message, "gpt-4")
        
        comparisons = {}
        for model_id, pricing in self.api_pricing.items():
            cost_info = self.calculate_cost(input_tokens, estimated_response_tokens, model_id)
            comparisons[model_id] = cost_info
        
        # 가격순 정렬
        sorted_models = sorted(
            comparisons.items(), 
            key=lambda x: x[1]["total_cost_usd"]
        )
        
        return {
            "input_tokens": input_tokens,
            "estimated_output_tokens": estimated_response_tokens,
            "comparisons": comparisons,
            "cheapest": sorted_models[0][0],
            "most_expensive": sorted_models[-1][0],
            "cost_difference": sorted_models[-1][1]["total_cost_usd"] - sorted_models[0][1]["total_cost_usd"]
        }


class WorkflowCostAnalyzer:
    """워크플로우 비용 분석기"""
    
    def __init__(self):
        self.cost_calculator = CostCalculator()
        
        # 도구별 응답 크기 추정 승수
        self.tool_response_multipliers = {
            "anthropic_chat": 1.0,
            "openai_chat": 1.0,
            "analyze_dependencies": 2.5,
            "get_conversation_summary": 0.3,
            "smart_inject_context": 1.5,
            "code_analysis": 2.0,
            "file_search": 1.2,
            "dependency_check": 1.8
        }
    
    def estimate_tool_cost(self, tool_name: str, message: str, 
                          estimated_response_tokens: int = 500,
                          model: str = "claude-3-5-sonnet-20241022") -> Dict[str, Any]:
        """도구 호출 비용 예측"""
        input_tokens = self.cost_calculator.token_counter.count_tokens(message, model)
        
        multiplier = self.tool_response_multipliers.get(tool_name, 1.0)
        adjusted_response_tokens = int(estimated_response_tokens * multiplier)
        
        cost_info = self.cost_calculator.calculate_cost(input_tokens, adjusted_response_tokens, model)
        
        cost_info.update({
            "tool_name": tool_name,
            "estimated_response_tokens": adjusted_response_tokens,
            "response_multiplier": multiplier,
            "timestamp": datetime.now().isoformat(),
            "exchange_rate": self.cost_calculator.exchange_rate
        })
        
        return cost_info
    
    def estimate_workflow_cost(self, workflow: List[Dict]) -> Dict[str, Any]:
        """전체 워크플로우 비용 추정"""
        total_cost_usd = 0
        total_tokens = 0
        step_costs = []
        
        for step in workflow:
            tool_name = step.get("tool", "unknown")
            message = step.get("message", "")
            model = step.get("model", "claude-3-5-sonnet-20241022")
            
            cost_info = self.estimate_tool_cost(tool_name, message, model=model)
            step_costs.append(cost_info)
            
            total_cost_usd += cost_info["total_cost_usd"]
            total_tokens += cost_info["input_tokens"] + cost_info["estimated_response_tokens"]
        
        return {
            "total_cost_usd": total_cost_usd,
            "total_cost_krw": total_cost_usd * self.cost_calculator.exchange_rate,
            "total_tokens": total_tokens,
            "step_count": len(workflow),
            "avg_cost_per_step": total_cost_usd / len(workflow) if workflow else 0,
            "step_costs": step_costs,
            "analysis_time": datetime.now().isoformat()
        }
    
    def generate_optimization_suggestions(self, workflow_cost: Dict, threshold_usd: float = 1.0) -> List[str]:
        """비용 최적화 제안 생성"""
        suggestions = []
        
        if workflow_cost["total_cost_usd"] > threshold_usd:
            suggestions.append(f"총 비용이 ${workflow_cost['total_cost_usd']:.4f}로 임계값 ${threshold_usd}를 초과합니다.")
        
        # 비싼 단계들 찾기
        expensive_steps = [
            step for step in workflow_cost["step_costs"]
            if step["total_cost_usd"] > workflow_cost["avg_cost_per_step"] * 2
        ]
        
        if expensive_steps:
            suggestions.append("비용이 높은 단계들:")
            for step in expensive_steps[:3]:  # 최대 3개
                suggestions.append(f"  - {step['tool_name']}: ${step['total_cost_usd']:.4f}")
        
        # 모델 교체 제안
        for step in workflow_cost["step_costs"]:
            if "claude-3-5-sonnet" in step.get("model", ""):
                haiku_cost = self.cost_calculator.calculate_cost(
                    step["input_tokens"], 
                    step["estimated_response_tokens"], 
                    "claude-3-haiku-20240307"
                )
                savings = step["total_cost_usd"] - haiku_cost["total_cost_usd"]
                if savings > 0.001:  # 0.1센트 이상 절약
                    suggestions.append(f"{step['tool_name']}에서 Haiku 사용 시 ${savings:.4f} 절약 가능")
        
        return suggestions


# 편의 함수들
def calculate_message_cost(message: str, model: str = "claude-3-5-sonnet-20241022", 
                          estimated_response_tokens: int = 500) -> Dict[str, Any]:
    """메시지 비용 계산 (편의 함수)"""
    calculator = CostCalculator()
    input_tokens = calculator.token_counter.count_tokens(message, model)
    return calculator.calculate_cost(input_tokens, estimated_response_tokens, model)


def compare_model_costs(message: str, estimated_response_tokens: int = 500) -> Dict[str, Any]:
    """모델간 비용 비교 (편의 함수)"""
    calculator = CostCalculator()
    return calculator.compare_models(message, estimated_response_tokens)


def estimate_workflow_cost(workflow_steps: List[Dict]) -> Dict[str, Any]:
    """워크플로우 비용 추정 (편의 함수)"""
    analyzer = WorkflowCostAnalyzer()
    return analyzer.estimate_workflow_cost(workflow_steps)


def get_cheapest_model_for_task(message: str, estimated_response_tokens: int = 500) -> str:
    """작업에 가장 저렴한 모델 추천 (편의 함수)"""
    comparison = compare_model_costs(message, estimated_response_tokens)
    return comparison["cheapest"]


def count_tokens(text: str, model: str = "gpt-4") -> int:
    """토큰 수 계산 (편의 함수)"""
    counter = TokenCounter()
    return counter.count_tokens(text, model) 