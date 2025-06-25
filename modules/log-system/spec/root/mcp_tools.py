#!/usr/bin/env python3
"""
통합 로그 수집기 - MCP (Model Context Protocol) 연동 도구 (완성본)
LLM이 로그를 분석하고 인사이트를 제공할 수 있는 도구들
"""

import json
import time
import re
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Union
from collections import defaultdict, Counter
from dataclasses import dataclass
import sqlite3
import os

# 로컬 모듈 임포트
try:
    import sys
    sys.path.append('../../python')
    from storage import LogStorage, create_storage
    from main import Config, load_config_with_overrides
except ImportError:
    print("로컬 모듈을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요.")


@dataclass
class LogAnalysis:
    """로그 분석 결과"""
    total_logs: int
    timerange: str
    error_rate: float
    top_errors: List[Dict]
    performance_issues: List[Dict]
    trends: Dict[str, Any]
    recommendations: List[str]


class MCPLogAnalyzer:
    """MCP용 로그 분석기"""
    
    def __init__(self, config_path: str = None):
        self.config = load_config_with_overrides(config_path)
        self.storage = create_storage(
            db_path=self.config.storage.db_path,
            max_size_mb=self.config.storage.max_size_mb,
            max_days=self.config.storage.max_days
        )
    
    def get_recent_errors(self, minutes: int = 30) -> List[Dict]:
        """최근 에러 로그 조회"""
        try:
            # 시간 계산
            since_time = datetime.now() - timedelta(minutes=minutes)
            
            # 에러 로그 조회
            return self.storage.query_logs(
                levels=['ERROR', 'FATAL'],
                since=since_time.isoformat(),
                limit=100
            )
        except Exception as e:
            return [{'error': str(e)}]
    
    def find_slow_queries(self, threshold_ms: int = 1000) -> List[Dict]:
        """슬로우 쿼리 조회"""
        try:
            # 최근 1시간 동안의 로그 조회
            since_time = datetime.now() - timedelta(hours=1)
            
            all_logs = self.storage.query_logs(
                since=since_time.isoformat(),
                limit=1000
            )
            
            # 슬로우 쿼리 필터링
            slow_queries = []
            for log in all_logs:
                duration = log.get('metadata', {}).get('duration_ms', 0)
                if duration >= threshold_ms:
                    slow_queries.append({
                        'timestamp': log['timestamp'],
                        'source': log['source'],
                        'message': log['message'],
                        'duration_ms': duration,
                        'query': log.get('metadata', {}).get('query', log['message'])
                    })
            
            return slow_queries
        except Exception as e:
            return [{'error': str(e)}]
    
    def trace_request(self, trace_id: str) -> Dict:
        """트레이스 ID로 요청 추적"""
        try:
            # 트레이스 ID로 로그 조회
            logs = self.storage.query_logs(
                trace_id=trace_id,
                limit=100
            )
            
            if not logs:
                return {'error': f'트레이스 ID {trace_id}에 대한 로그를 찾을 수 없습니다'}
            
            # 타임라인 정렬
            sorted_logs = sorted(logs, key=lambda x: x['timestamp'])
            
            return {
                'trace_id': trace_id,
                'log_count': len(logs),
                'start_time': sorted_logs[0]['timestamp'],
                'end_time': sorted_logs[-1]['timestamp'],
                'logs': sorted_logs
            }
        except Exception as e:
            return {'error': str(e)}
    
    def analyze_error_pattern(self, error_message: str, hours: int = 24) -> Dict:
        """에러 패턴 분석"""
        try:
            since_time = datetime.now() - timedelta(hours=hours)
            
            # 유사한 에러 메시지 검색
            error_logs = self.storage.query_logs(
                levels=['ERROR', 'FATAL'],
                since=since_time.isoformat(),
                limit=500
            )
            
            # 패턴 매칭
            similar_errors = []
            for log in error_logs:
                if error_message.lower() in log['message'].lower():
                    similar_errors.append(log)
            
            return {
                'pattern': error_message,
                'timerange_hours': hours,
                'similar_errors_count': len(similar_errors),
                'similar_errors': similar_errors[:20]  # 최대 20개
            }
        except Exception as e:
            return {'error': str(e)}
    
    def debug_session(self, since: str = "5m") -> Dict:
        """디버깅 세션 정보 수집"""
        try:
            # 시간 파싱
            if since.endswith('m'):
                minutes = int(since[:-1])
                since_time = datetime.now() - timedelta(minutes=minutes)
            elif since.endswith('h'):
                hours = int(since[:-1])
                since_time = datetime.now() - timedelta(hours=hours)
            else:
                since_time = datetime.now() - timedelta(minutes=5)
            
            # 모든 로그 조회
            all_logs = self.storage.query_logs(
                since=since_time.isoformat(),
                limit=1000
            )
            
            # 분류
            errors = [log for log in all_logs if log['level'] in ['ERROR', 'FATAL']]
            warnings = [log for log in all_logs if log['level'] == 'WARN']
            
            return {
                'timerange': since,
                'total_logs': len(all_logs),
                'errors': len(errors),
                'warnings': len(warnings),
                'recent_errors': errors[:10],
                'recent_warnings': warnings[:10]
            }
        except Exception as e:
            return {'error': str(e)}
        
    def _generate_alerts(self, stats: Dict) -> List[Dict]:
        """통계 기반 알림 생성"""
        alerts = []
        
        basic = stats.get('basic', {})
        by_level = stats.get('by_level', {})
        trends = self._analyze_trends(stats)
        
        # 에러율 알림
        total_logs = basic.get('total_logs', 0)
        if total_logs > 0:
            error_count = by_level.get('ERROR', 0) + by_level.get('FATAL', 0)
            error_rate = error_count / total_logs
            
            if error_rate > 0.1:
                alerts.append({
                    'type': 'high_error_rate',
                    'severity': 'critical',
                    'message': f'에러율이 {error_rate*100:.1f}%로 높습니다',
                    'value': error_rate,
                    'threshold': 0.1
                })
            elif error_rate > 0.05:
                alerts.append({
                    'type': 'elevated_error_rate',
                    'severity': 'warning',
                    'message': f'에러율이 {error_rate*100:.1f}%로 상승했습니다',
                    'value': error_rate,
                    'threshold': 0.05
                })
                
        # 에러 증가 트렌드 알림
        if trends.get('error_trend') == 'increasing':
            alerts.append({
                'type': 'increasing_errors',
                'severity': 'warning',
                'message': '에러 발생이 증가 추세입니다',
                'trend': 'increasing'
            })
            
        return alerts
        
    def _analyze_search_patterns(self, logs: List[Dict]) -> Dict:
        """검색 결과 패턴 분석"""
        patterns = {
            'sources': Counter([log['source'] for log in logs]),
            'levels': Counter([log['level'] for log in logs]),
            'time_distribution': defaultdict(int),
            'common_keywords': Counter()
        }
        
        # 시간대별 분포
        for log in logs:
            try:
                timestamp = datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00'))
                hour = timestamp.strftime('%H:00')
                patterns['time_distribution'][hour] += 1
            except:
                pass
                
        # 공통 키워드 추출
        all_messages = ' '.join([log['message'] for log in logs])
        words = re.findall(r'\w+', all_messages.lower())
        patterns['common_keywords'] = Counter(words).most_common(10)
        
        return patterns
        
    def _create_timeline(self, logs: List[Dict]) -> List[Dict]:
        """로그 타임라인 생성"""
        sorted_logs = sorted(logs, key=lambda x: x['timestamp'])
        
        timeline = []
        for i, log in enumerate(sorted_logs):
            timeline_entry = {
                'sequence': i + 1,
                'timestamp': log['timestamp'],
                'source': log['source'],
                'level': log['level'],
                'message': log['message']
            }
            
            # 이전 로그와의 시간 간격
            if i > 0:
                try:
                    current_time = datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00'))
                    prev_time = datetime.fromisoformat(sorted_logs[i-1]['timestamp'].replace('Z', '+00:00'))
                    gap_ms = int((current_time - prev_time).total_seconds() * 1000)
                    timeline_entry['gap_from_previous_ms'] = gap_ms
                except:
                    pass
                    
            timeline.append(timeline_entry)
            
        return timeline


# MCP 도구 함수들 - LLM이 직접 호출할 수 있는 함수들
def get_recent_logs(minutes: int = 30, limit: int = 50, levels: List[str] = None, sources: List[str] = None) -> Dict:
    """
    최근 로그 조회 (모든 레벨)
    
    Args:
        minutes: 조회할 시간 범위 (분)
        limit: 최대 조회할 로그 수
        levels: 필터링할 로그 레벨 (예: ['INFO', 'WARN', 'ERROR'])
        sources: 필터링할 소스 (예: ['mcp_calls', 'http_traffic'])
        
    Returns:
        최근 로그 목록과 분석 정보
    """
    try:
        analyzer = MCPLogAnalyzer()
        
        # 시간 계산
        since_time = datetime.now() - timedelta(minutes=minutes)
        
        # 로그 조회
        logs = analyzer.storage.query_logs(
            levels=levels,
            sources=sources,
            since=since_time.isoformat(),
            limit=limit
        )
        
        if not logs:
            return {
                'success': True,
                'logs': [],
                'count': 0,
                'analysis': {
                    'message': f'최근 {minutes}분간 로그가 없습니다.',
                    'timerange_minutes': minutes,
                    'filters_applied': {
                        'levels': levels,
                        'sources': sources,
                        'limit': limit
                    }
                }
            }
            
        # 로그 분석
        log_levels = Counter([log.get('level', 'UNKNOWN') for log in logs])
        log_sources = Counter([log.get('source', 'unknown') for log in logs])
        
        analysis = {
            'total_logs': len(logs),
            'timerange_minutes': minutes,
            'log_by_level': dict(log_levels.most_common()),
            'log_by_source': dict(log_sources.most_common(5)),
            'most_recent': logs[0] if logs else None,
            'activity_summary': {
                'errors': log_levels.get('ERROR', 0) + log_levels.get('FATAL', 0),
                'warnings': log_levels.get('WARN', 0),
                'info_messages': log_levels.get('INFO', 0),
                'debug_messages': log_levels.get('DEBUG', 0),
                'error_rate': (log_levels.get('ERROR', 0) + log_levels.get('FATAL', 0)) / len(logs) if logs else 0
            },
            'filters_applied': {
                'levels': levels,
                'sources': sources,
                'limit': limit
            }
        }
        
        return {
            'success': True,
            'logs': logs,
            'count': len(logs),
            'analysis': analysis
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'count': 0,
            'logs': []
        }


def get_recent_errors(minutes: int = 30) -> Dict:
    """
    최근 에러 로그 조회
    
    Args:
        minutes: 조회할 시간 범위 (분)
        
    Returns:
        최근 에러 로그 목록과 분석 정보
    """
    try:
        analyzer = MCPLogAnalyzer()
        errors = analyzer.get_recent_errors(minutes)
        
        if not errors or (len(errors) == 1 and 'error' in errors[0]):
            return {
                'success': False,
                'errors': errors,
                'count': 0,
                'analysis': {'message': '에러 로그가 없거나 조회에 실패했습니다.'}
            }
            
        # 에러 분석
        error_sources = Counter([e.get('source', 'unknown') for e in errors])
        error_types = Counter([e.get('error_type', 'unknown') for e in errors if e.get('error_type')])
        
        analysis = {
            'total_errors': len(errors),
            'timerange_minutes': minutes,
            'error_by_source': dict(error_sources.most_common(5)),
            'error_by_type': dict(error_types.most_common(5)),
            'most_recent': errors[0] if errors else None,
            'recommendations': []
        }
        
        # 권장사항 생성
        if len(errors) > 10:
            analysis['recommendations'].append(f"{minutes}분간 {len(errors)}개 에러 발생. 긴급 조치가 필요합니다.")
        
        most_common_source = error_sources.most_common(1)
        if most_common_source and most_common_source[0][1] > len(errors) * 0.5:
            analysis['recommendations'].append(f"'{most_common_source[0][0]}' 소스에서 에러가 집중되고 있습니다.")
            
        return {
            'success': True,
            'errors': errors,
            'count': len(errors),
            'analysis': analysis
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'count': 0
        }


def find_slow_queries(threshold_ms: int = 1000) -> Dict:
    """
    슬로우 쿼리 찾기
    
    Args:
        threshold_ms: 느린 쿼리 기준 시간 (밀리초)
        
    Returns:
        슬로우 쿼리 목록과 분석
    """
    try:
        analyzer = MCPLogAnalyzer()
        slow_queries = analyzer.find_slow_queries(threshold_ms)
        
        if not slow_queries or (len(slow_queries) == 1 and 'error' in slow_queries[0]):
            return {
                'success': False,
                'slow_queries': slow_queries,
                'count': 0,
                'analysis': {'message': '슬로우 쿼리가 없거나 조회에 실패했습니다.'}
            }
            
        # 분석 정보
        durations = [q['duration_ms'] for q in slow_queries]
        analysis = {
            'total_slow_queries': len(slow_queries),
            'threshold_ms': threshold_ms,
            'slowest_query_ms': max(durations) if durations else 0,
            'average_duration_ms': statistics.mean(durations) if durations else 0,
            'median_duration_ms': statistics.median(durations) if durations else 0,
            'recommendations': []
        }
        
        # 권장사항
        if analysis['slowest_query_ms'] > 5000:
            analysis['recommendations'].append(f"가장 느린 쿼리가 {analysis['slowest_query_ms']}ms입니다. 즉시 최적화가 필요합니다.")
            
        if len(slow_queries) > 10:
            analysis['recommendations'].append(f"{len(slow_queries)}개의 슬로우 쿼리가 발견되었습니다. 전반적인 DB 성능 검토가 필요합니다.")
            
        return {
            'success': True,
            'slow_queries': slow_queries,
            'count': len(slow_queries),
            'analysis': analysis
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'count': 0
        }


def trace_request(trace_id: str) -> Dict:
    """
    특정 트레이스 ID의 요청 추적
    
    Args:
        trace_id: 추적할 트레이스 ID
        
    Returns:
        트레이스 정보와 분석
    """
    try:
        analyzer = MCPLogAnalyzer()
        trace_info = analyzer.trace_request(trace_id)
        
        if 'error' in trace_info:
            return {
                'success': False,
                'trace_id': trace_id,
                'error': trace_info['error']
            }
            
        return {
            'success': True,
            'trace_info': trace_info
        }
        
    except Exception as e:
        return {
            'success': False,
            'trace_id': trace_id,
            'error': str(e)
        }


def analyze_error_pattern(error_message: str, hours: int = 24) -> Dict:
    """
    유사한 에러 패턴 분석
    
    Args:
        error_message: 분석할 에러 메시지
        hours: 분석 시간 범위 (시간)
        
    Returns:
        에러 패턴 분석 결과
    """
    try:
        analyzer = MCPLogAnalyzer()
        analysis = analyzer.analyze_error_pattern(error_message, hours)
        
        if 'error' in analysis:
            return {
                'success': False,
                'error_message': error_message,
                'error': analysis['error']
            }
            
        return {
            'success': True,
            'analysis': analysis
        }
        
    except Exception as e:
        return {
            'success': False,
            'error_message': error_message,
            'error': str(e)
        }


def debug_session(since: str = "5m") -> Dict:
    """
    디버깅용 종합 로그 수집 및 분석
    
    Args:
        since: 조회 시간 범위 (예: "5m", "1h", "30m")
        
    Returns:
        디버깅에 필요한 종합 정보
    """
    try:
        analyzer = MCPLogAnalyzer()
        debug_info = analyzer.debug_session(since)
        
        if 'error' in debug_info:
            return {
                'success': False,
                'since': since,
                'error': debug_info['error']
            }
            
        # 핵심 이슈 요약
        summary = debug_info.get('summary', {})
        critical_issues = []
        
        if summary.get('error_count', 0) > 0:
            critical_issues.append(f"🚨 {summary['error_count']}개 에러 발생")
            
        if summary.get('slow_query_count', 0) > 0:
            critical_issues.append(f"🐌 {summary['slow_query_count']}개 슬로우 쿼리")
            
        avg_response = summary.get('avg_response_time_ms', 0)
        if avg_response > 1000:
            critical_issues.append(f"⏱️ 평균 응답시간 {avg_response:.0f}ms")
            
        debug_info['critical_issues'] = critical_issues
        debug_info['health_status'] = 'critical' if len(critical_issues) > 2 else 'warning' if critical_issues else 'healthy'
        
        return {
            'success': True,
            'debug_info': debug_info
        }
        
    except Exception as e:
        return {
            'success': False,
            'since': since,
            'error': str(e)
        }


def get_performance_insights(hours: int = 1) -> Dict:
    """
    성능 인사이트 분석
    
    Args:
        hours: 분석 시간 범위 (시간)
        
    Returns:
        성능 분석 결과 및 권장사항
    """
    try:
        analyzer = MCPLogAnalyzer()
        insights = analyzer.get_performance_insights(hours)
        
        if 'error' in insights:
            return {
                'success': False,
                'hours': hours,
                'error': insights['error']
            }
            
        # 성능 점수 계산
        performance_score = 100
        
        # HTTP 성능 점수
        if 'http' in insights.get('trends', {}):
            http_trends = insights['trends']['http']
            avg_response = http_trends.get('avg_response_time_ms', 0)
            
            if avg_response > 2000:
                performance_score -= 40
            elif avg_response > 1000:
                performance_score -= 20
            elif avg_response > 500:
                performance_score -= 10
                
        # DB 성능 점수
        if 'database' in insights.get('trends', {}):
            db_trends = insights['trends']['database']
            avg_query = db_trends.get('avg_query_time_ms', 0)
            
            if avg_query > 1000:
                performance_score -= 30
            elif avg_query > 500:
                performance_score -= 15
            elif avg_query > 200:
                performance_score -= 5
                
        insights['performance_score'] = max(0, min(100, performance_score))
        insights['performance_grade'] = (
            'A' if performance_score >= 90 else
            'B' if performance_score >= 80 else
            'C' if performance_score >= 70 else
            'D' if performance_score >= 60 else 'F'
        )
        
        return {
            'success': True,
            'insights': insights
        }
        
    except Exception as e:
        return {
            'success': False,
            'hours': hours,
            'error': str(e)
        }


def get_system_health() -> Dict:
    """
    시스템 전반적인 건강도 조회
    
    Returns:
        시스템 건강도 점수 및 상태
    """
    try:
        analyzer = MCPLogAnalyzer()
        
        # 최근 1시간 통계
        stats = analyzer.get_log_statistics("1h")
        
        if 'error' in stats:
            return {
                'success': False,
                'error': stats['error']
            }
            
        health_score = stats.get('health_score', 50)
        health_status = (
            'excellent' if health_score >= 95 else
            'good' if health_score >= 85 else
            'fair' if health_score >= 70 else
            'poor' if health_score >= 50 else 'critical'
        )
        
        # 주요 지표
        basic = stats.get('basic', {})
        by_level = stats.get('by_level', {})
        
        key_metrics = {
            'total_logs': basic.get('total_logs', 0),
            'error_count': by_level.get('ERROR', 0) + by_level.get('FATAL', 0),
            'warning_count': by_level.get('WARN', 0) + by_level.get('WARNING', 0),
            'error_rate': (by_level.get('ERROR', 0) + by_level.get('FATAL', 0)) / max(basic.get('total_logs', 1), 1),
            'health_score': health_score,
            'health_status': health_status
        }
        
        # 알림 및 권장사항
        alerts = stats.get('alerts', [])
        recommendations = []
        
        if key_metrics['error_rate'] > 0.1:
            recommendations.append("에러율이 10%를 초과했습니다. 긴급 점검이 필요합니다.")
        elif key_metrics['error_rate'] > 0.05:
            recommendations.append("에러율이 상승했습니다. 모니터링을 강화하세요.")
            
        if key_metrics['total_logs'] == 0:
            recommendations.append("로그 수집이 중단되었을 수 있습니다. 수집기 상태를 확인하세요.")
            
        return {
            'success': True,
            'health': {
                'score': health_score,
                'status': health_status,
                'metrics': key_metrics,
                'alerts': alerts,
                'recommendations': recommendations,
                'timestamp': datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def search_logs(query: str, sources: List[str] = None, levels: List[str] = None, 
                since: str = "1h", limit: int = 50) -> Dict:
    """
    고급 로그 검색
    
    Args:
        query: 검색 쿼리
        sources: 소스 필터 (옵션)
        levels: 레벨 필터 (옵션)
        since: 시간 범위 (예: "1h", "30m")
        limit: 결과 개수 제한
        
    Returns:
        검색 결과 및 분석
    """
    try:
        analyzer = MCPLogAnalyzer()
        
        filters = {
            'limit': limit,
            'since': since
        }
        
        if sources:
            filters['sources'] = sources
        if levels:
            filters['levels'] = levels
            
        results = analyzer.search_logs_advanced(query, **filters)
        
        if 'error' in results:
            return {
                'success': False,
                'query': query,
                'error': results['error']
            }
            
        return {
            'success': True,
            'search_results': results
        }
        
    except Exception as e:
        return {
            'success': False,
            'query': query,
            'error': str(e)
        }


def get_log_summary(timerange: str = "1h") -> Dict:
    """
    로그 요약 정보 조회
    
    Args:
        timerange: 시간 범위 (예: "1h", "6h", "24h")
        
    Returns:
        로그 요약 통계
    """
    try:
        analyzer = MCPLogAnalyzer()
        stats = analyzer.get_log_statistics(timerange)
        
        if 'error' in stats:
            return {
                'success': False,
                'timerange': timerange,
                'error': stats['error']
            }
            
        # 요약 정보 구성
        basic = stats.get('basic', {})
        by_source = stats.get('by_source_level', [])
        by_level = stats.get('by_level', {})
        
        summary = {
            'timerange': timerange,
            'total_logs': basic.get('total_logs', 0),
            'unique_sources': basic.get('unique_sources', 0),
            'error_rate': (by_level.get('ERROR', 0) + by_level.get('FATAL', 0)) / max(basic.get('total_logs', 1), 1),
            'top_sources': sorted(by_source, key=lambda x: x['count'], reverse=True)[:5],
            'level_distribution': dict(by_level),
            'health_score': stats.get('health_score', 50),
            'trends': stats.get('trends_analysis', {}),
            'timestamp': datetime.now().isoformat()
        }
        
        return {
            'success': True,
            'summary': summary
        }
        
    except Exception as e:
        return {
            'success': False,
            'timerange': timerange,
            'error': str(e)
        }


def analyze_incident(incident_description: str, timerange: str = "1h") -> Dict:
    """
    사고 분석 - 특정 문제 상황에 대한 종합 분석
    
    Args:
        incident_description: 사고 설명
        timerange: 분석 시간 범위
        
    Returns:
        사고 분석 결과 및 근본 원인 분석
    """
    try:
        analyzer = MCPLogAnalyzer()
        
        # 1. 키워드 기반 로그 검색
        keywords = incident_description.lower().split()
        search_results = []
        
        for keyword in keywords:
            if len(keyword) > 3:  # 3글자 이상 키워드만
                result = analyzer.search_logs_advanced(keyword, since=timerange, limit=20)
                if 'logs' in result:
                    search_results.extend(result['logs'])
                    
        # 중복 제거
        unique_logs = {log['id']: log for log in search_results}.values()
        relevant_logs = list(unique_logs)
        
        # 2. 에러 로그 수집
        errors = analyzer.get_recent_errors(analyzer._parse_minutes(timerange))
        
        # 3. 성능 이슈 분석
        performance = analyzer.get_performance_insights(analyzer._parse_minutes(timerange) // 60 or 1)
        
        # 4. 시스템 상태
        system_stats = analyzer.get_log_statistics(timerange)
        
        # 5. 근본 원인 분석
        root_cause_analysis = {
            'potential_causes': [],
            'evidence': [],
            'timeline': [],
            'affected_components': set(),
            'recommendations': []
        }
        
        # 에러 패턴 분석
        if errors:
            error_sources = Counter([e.get('source', 'unknown') for e in errors])
            most_affected = error_sources.most_common(1)
            if most_affected:
                root_cause_analysis['affected_components'].add(most_affected[0][0])
                root_cause_analysis['potential_causes'].append(f"{most_affected[0][0]}에서 {most_affected[0][1]}회 에러 발생")
                
        # 성능 이슈 분석
        if 'error' not in performance:
            perf_issues = performance.get('performance_issues', [])
            for issue in perf_issues:
                root_cause_analysis['potential_causes'].append(issue['description'])
                root_cause_analysis['affected_components'].add('performance')
                
        # 타임라인 구성
        all_logs = relevant_logs + errors
        all_logs.sort(key=lambda x: x.get('timestamp', ''))
        
        for log in all_logs[-20:]:  # 최근 20개
            root_cause_analysis['timeline'].append({
                'timestamp': log.get('timestamp'),
                'source': log.get('source'),
                'level': log.get('level'),
                'message': log.get('message', '')[:100]  # 처음 100자
            })
            
        # 권장사항 생성
        if len(errors) > 5:
            root_cause_analysis['recommendations'].append("다수의 에러가 발생했습니다. 로그를 상세 분석하여 공통 원인을 찾으세요.")
            
        if 'performance' in root_cause_analysis['affected_components']:
            root_cause_analysis['recommendations'].append("성능 이슈가 감지되었습니다. 리소스 사용량과 병목 지점을 확인하세요.")
            
        if not root_cause_analysis['potential_causes']:
            root_cause_analysis['recommendations'].append("명확한 원인을 찾지 못했습니다. 더 넓은 시간 범위에서 분석하거나 다른 키워드로 검색해보세요.")
            
        root_cause_analysis['affected_components'] = list(root_cause_analysis['affected_components'])
        
        return {
            'success': True,
            'incident_analysis': {
                'description': incident_description,
                'timerange': timerange,
                'relevant_logs_count': len(relevant_logs),
                'error_count': len(errors),
                'root_cause_analysis': root_cause_analysis,
                'system_health': system_stats.get('health_score', 50),
                'timestamp': datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        return {
            'success': False,
            'incident_description': incident_description,
            'error': str(e)
        }


# MCP 서버 등록용 도구 목록
MCP_TOOLS = [
    {
        'name': 'get_recent_errors',
        'description': '최근 발생한 에러 로그를 조회하고 분석합니다',
        'function': get_recent_errors,
        'parameters': {
            'minutes': {'type': 'integer', 'description': '조회할 시간 범위 (분)', 'default': 30}
        }
    },
    {
        'name': 'find_slow_queries',
        'description': '느린 데이터베이스 쿼리를 찾아 분석합니다',
        'function': find_slow_queries,
        'parameters': {
            'threshold_ms': {'type': 'integer', 'description': '느린 쿼리 기준 시간 (밀리초)', 'default': 1000}
        }
    },
    {
        'name': 'trace_request',
        'description': '특정 트레이스 ID의 요청을 추적하여 전체 흐름을 분석합니다',
        'function': trace_request,
        'parameters': {
            'trace_id': {'type': 'string', 'description': '추적할 트레이스 ID', 'required': True}
        }
    },
    {
        'name': 'analyze_error_pattern',
        'description': '특정 에러 메시지와 유사한 패턴을 분석합니다',
        'function': analyze_error_pattern,
        'parameters': {
            'error_message': {'type': 'string', 'description': '분석할 에러 메시지', 'required': True},
            'hours': {'type': 'integer', 'description': '분석 시간 범위 (시간)', 'default': 24}
        }
    },
    {
        'name': 'debug_session',
        'description': '디버깅에 필요한 종합적인 로그 정보를 수집합니다',
        'function': debug_session,
        'parameters': {
            'since': {'type': 'string', 'description': '조회 시간 범위 (예: 5m, 1h)', 'default': '5m'}
        }
    },
    {
        'name': 'get_performance_insights',
        'description': '시스템 성능을 분석하고 병목점을 찾습니다',
        'function': get_performance_insights,
        'parameters': {
            'hours': {'type': 'integer', 'description': '분석 시간 범위 (시간)', 'default': 1}
        }
    },
    {
        'name': 'get_system_health',
        'description': '시스템 전반적인 건강도를 평가합니다',
        'function': get_system_health,
        'parameters': {}
    },
    {
        'name': 'search_logs',
        'description': '고급 검색으로 특정 로그를 찾습니다',
        'function': search_logs,
        'parameters': {
            'query': {'type': 'string', 'description': '검색 쿼리', 'required': True},
            'sources': {'type': 'array', 'description': '소스 필터 (옵션)'},
            'levels': {'type': 'array', 'description': '레벨 필터 (옵션)'},
            'since': {'type': 'string', 'description': '시간 범위', 'default': '1h'},
            'limit': {'type': 'integer', 'description': '결과 개수 제한', 'default': 50}
        }
    },
    {
        'name': 'get_log_summary',
        'description': '특정 시간 범위의 로그 요약 정보를 제공합니다',
        'function': get_log_summary,
        'parameters': {
            'timerange': {'type': 'string', 'description': '시간 범위 (예: 1h, 6h, 24h)', 'default': '1h'}
        }
    },
    {
        'name': 'analyze_incident',
        'description': '사고 상황을 종합적으로 분석하고 근본 원인을 찾습니다',
        'function': analyze_incident,
        'parameters': {
            'incident_description': {'type': 'string', 'description': '사고 설명', 'required': True},
            'timerange': {'type': 'string', 'description': '분석 시간 범위', 'default': '1h'}
        }
    }
]


class MCPServer:
    """MCP 서버 래퍼"""
    
    def __init__(self, config_path: str = None):
        self.analyzer = MCPLogAnalyzer(config_path)
        self.tools = {tool['name']: tool for tool in MCP_TOOLS}
        
    def handle_tool_call(self, tool_name: str, parameters: Dict) -> Dict:
        """MCP 도구 호출 처리"""
        if tool_name not in self.tools:
            return {
                'success': False,
                'error': f'알 수 없는 도구: {tool_name}',
                'available_tools': list(self.tools.keys())
            }
            
        tool = self.tools[tool_name]
        function = tool['function']
        
        try:
            result = function(**parameters)
            return result
        except Exception as e:
            return {
                'success': False,
                'error': f'도구 실행 오류: {str(e)}',
                'tool_name': tool_name,
                'parameters': parameters
            }
            
    def get_available_tools(self) -> List[Dict]:
        """사용 가능한 도구 목록 반환"""
        return [{
            'name': tool['name'],
            'description': tool['description'],
            'parameters': tool['parameters']
        } for tool in MCP_TOOLS]
        
    def generate_context_for_llm(self, query: str) -> Dict:
        """LLM을 위한 컨텍스트 자동 생성"""
        context = {
            'query': query,
            'timestamp': datetime.now().isoformat(),
            'suggested_tools': [],
            'relevant_data': {}
        }
        
        query_lower = query.lower()
        
        # 쿼리 분석하여 적절한 도구 추천
        if any(word in query_lower for word in ['error', '에러', '오류', 'exception']):
            context['suggested_tools'].append('get_recent_errors')
            context['suggested_tools'].append('analyze_error_pattern')
            
        if any(word in query_lower for word in ['slow', '느린', 'performance', '성능']):
            context['suggested_tools'].append('find_slow_queries')
            context['suggested_tools'].append('get_performance_insights')
            
        if any(word in query_lower for word in ['trace', '추적', 'request', '요청']):
            context['suggested_tools'].append('trace_request')
            
        if any(word in query_lower for word in ['debug', '디버그', 'troubleshoot', '문제해결']):
            context['suggested_tools'].append('debug_session')
            
        if any(word in query_lower for word in ['health', '건강', 'status', '상태']):
            context['suggested_tools'].append('get_system_health')
            context['suggested_tools'].append('get_log_summary')
            
        if any(word in query_lower for word in ['incident', '사고', 'outage', '장애']):
            context['suggested_tools'].append('analyze_incident')
            
        if any(word in query_lower for word in ['search', '검색', 'find', '찾기']):
            context['suggested_tools'].append('search_logs')
            
        # 기본 컨텍스트 데이터 수집
        try:
            # 최근 시스템 상태
            health = get_system_health()
            if health['success']:
                context['relevant_data']['system_health'] = health['health']
                
            # 최근 에러 요약
            recent_errors = get_recent_errors(10)  # 최근 10분
            if recent_errors['success'] and recent_errors['count'] > 0:
                context['relevant_data']['recent_errors'] = {
                    'count': recent_errors['count'],
                    'most_recent': recent_errors['errors'][0] if recent_errors['errors'] else None
                }
                
        except Exception as e:
            context['relevant_data']['context_error'] = str(e)
            
        return context


def create_mcp_server(config_path: str = None) -> MCPServer:
    """MCP 서버 인스턴스 생성"""
    return MCPServer(config_path)


def get_mcp_tools_schema() -> Dict:
    """MCP 도구 스키마 반환 (MCP 클라이언트용)"""
    return {
        'tools': [
            {
                'name': tool['name'],
                'description': tool['description'],
                'inputSchema': {
                    'type': 'object',
                    'properties': tool['parameters'],
                    'required': [
                        param_name for param_name, param_info in tool['parameters'].items()
                        if param_info.get('required', False)
                    ]
                }
            }
            for tool in MCP_TOOLS
        ]
    }


# CLI 인터페이스
def main():
    """CLI 메인 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description='MCP 로그 분석 도구')
    parser.add_argument('--config', help='설정 파일 경로')
    parser.add_argument('--tool', help='실행할 도구 이름')
    parser.add_argument('--params', help='도구 파라미터 (JSON 형식)')
    parser.add_argument('--list-tools', action='store_true', help='사용 가능한 도구 목록')
    parser.add_argument('--test', action='store_true', help='모든 도구 테스트')
    parser.add_argument('--context', help='LLM 컨텍스트 생성을 위한 쿼리')
    
    args = parser.parse_args()
    
    server = create_mcp_server(args.config)
    
    if args.list_tools:
        print("=== 사용 가능한 MCP 도구들 ===")
        tools = server.get_available_tools()
        for tool in tools:
            print(f"\n📊 {tool['name']}")
            print(f"   설명: {tool['description']}")
            if tool['parameters']:
                print("   파라미터:")
                for param_name, param_info in tool['parameters'].items():
                    required = " (필수)" if param_info.get('required') else ""
                    default = f" [기본값: {param_info.get('default')}]" if 'default' in param_info else ""
                    print(f"     - {param_name}: {param_info.get('description', '')}{required}{default}")
                    
    elif args.context:
        print("=== LLM 컨텍스트 생성 ===")
        context = server.generate_context_for_llm(args.context)
        print(json.dumps(context, indent=2, ensure_ascii=False))
        
    elif args.test:
        print("=== MCP 도구 테스트 ===")
        
        # 1. 시스템 건강도
        print("\n1. 시스템 건강도 확인...")
        result = server.handle_tool_call('get_system_health', {})
        if result['success']:
            health = result['health']
            print(f"   상태: {health['status']} (점수: {health['score']})")
            print(f"   총 로그: {health['metrics']['total_logs']}개")
            print(f"   에러율: {health['metrics']['error_rate']*100:.1f}%")
        else:
            print(f"   실패: {result.get('error')}")
            
        # 2. 최근 에러
        print("\n2. 최근 에러 확인...")
        result = server.handle_tool_call('get_recent_errors', {'minutes': 30})
        if result['success']:
            print(f"   최근 30분간 에러: {result['count']}개")
            if result['count'] > 0:
                print(f"   주요 소스: {list(result['analysis']['error_by_source'].keys())}")
        else:
            print(f"   실패: {result.get('error')}")
            
        # 3. 슬로우 쿼리
        print("\n3. 슬로우 쿼리 확인...")
        result = server.handle_tool_call('find_slow_queries', {'threshold_ms': 500})
        if result['success']:
            print(f"   슬로우 쿼리: {result['count']}개")
            if result['count'] > 0:
                slowest = result['analysis']['slowest_query_ms']
                print(f"   가장 느린 쿼리: {slowest}ms")
        else:
            print(f"   실패: {result.get('error')}")
            
        # 4. 성능 인사이트
        print("\n4. 성능 분석...")
        result = server.handle_tool_call('get_performance_insights', {'hours': 1})
        if result['success']:
            insights = result['insights']
            score = insights.get('performance_score', 0)
            grade = insights.get('performance_grade', 'N/A')
            print(f"   성능 점수: {score} (등급: {grade})")
            
            if 'trends' in insights and 'http' in insights['trends']:
                avg_response = insights['trends']['http']['avg_response_time_ms']
                print(f"   평균 응답시간: {avg_response:.0f}ms")
        else:
            print(f"   실패: {result.get('error')}")
            
        # 5. 로그 요약
        print("\n5. 로그 요약...")
        result = server.handle_tool_call('get_log_summary', {'timerange': '1h'})
        if result['success']:
            summary = result['summary']
            print(f"   최근 1시간 로그: {summary['total_logs']}개")
            print(f"   유니크 소스: {summary['unique_sources']}개")
            print(f"   에러율: {summary['error_rate']*100:.1f}%")
        else:
            print(f"   실패: {result.get('error')}")
            
    elif args.tool:
        if not args.params:
            print("--params 옵션으로 파라미터를 JSON 형식으로 제공하세요.")
            print('예: --params \'{"minutes": 30}\'')
            return
            
        try:
            params = json.loads(args.params)
            result = server.handle_tool_call(args.tool, params)
            print(json.dumps(result, indent=2, ensure_ascii=False))
        except json.JSONDecodeError as e:
            print(f"JSON 파라미터 파싱 오류: {e}")
        except Exception as e:
            print(f"도구 실행 오류: {e}")
            
    else:
        parser.print_help()


if __name__ == '__main__':
    main()


# 사용 예시
"""
CLI 사용법:

# 사용 가능한 도구 목록
python mcp_tools.py --list-tools

# 시스템 건강도 확인
python mcp_tools.py --tool get_system_health --params '{}'

# 최근 30분 에러 조회
python mcp_tools.py --tool get_recent_errors --params '{"minutes": 30}'

# 슬로우 쿼리 찾기
python mcp_tools.py --tool find_slow_queries --params '{"threshold_ms": 1000}'

# 로그 검색
python mcp_tools.py --tool search_logs --params '{"query": "database timeout", "since": "1h"}'

# 사고 분석
python mcp_tools.py --tool analyze_incident --params '{"incident_description": "API 응답 지연", "timerange": "2h"}'

# 모든 도구 테스트
python mcp_tools.py --test

# LLM 컨텍스트 생성
python mcp_tools.py --context "최근에 데이터베이스 에러가 많이 발생하는데 원인을 찾아줘"

Python API 사용법:

from mcp_tools import create_mcp_server

# MCP 서버 생성
server = create_mcp_server("./config.yaml")

# 도구 실행
result = server.handle_tool_call('get_recent_errors', {'minutes': 30})
print(result)

# LLM 컨텍스트 생성
context = server.generate_context_for_llm("시스템 성능 문제를 분석해줘")
print(context)

# 사용 가능한 도구 목록
tools = server.get_available_tools()
for tool in tools:
    print(f"{tool['name']}: {tool['description']}")
"""