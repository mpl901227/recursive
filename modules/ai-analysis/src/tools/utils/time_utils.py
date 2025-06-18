#!/usr/bin/env python3
"""
Enhanced DateTime Utilities
고도화된 날짜/시간 처리 유틸리티

주요 기능:
- 자연어 시간 파싱 ("2시간 후", "내일 오전 9시")
- 스마트 타임존 처리 및 변환
- 상대시간 계산 및 표현
- 다국어 지원 (한국어, 영어)
- 비즈니스 시간 계산
- 반복 일정 처리
- 시간 범위 검증
- 성능 최적화된 시간 연산
"""

import re
import pytz
import calendar
from datetime import datetime, timedelta, date, time as dt_time
from typing import Optional, Dict, List, Any, Union, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import logging
from functools import lru_cache, wraps
import threading
from collections import defaultdict
import json

# 타입 정의
DateTimeInput = Union[datetime, date, str, int, float]
TimezoneInput = Union[str, pytz.BaseTzInfo]


class TimeFormat(Enum):
    """시간 형식 타입"""
    ISO = "iso"
    RFC3339 = "rfc3339"
    TIMESTAMP = "timestamp"
    HUMAN = "human"
    RELATIVE = "relative"
    BUSINESS = "business"


class RelativeTimeUnit(Enum):
    """상대시간 단위"""
    SECOND = "second"
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"


class RecurrencePattern(Enum):
    """반복 패턴"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    BUSINESS_DAYS = "business_days"
    CUSTOM = "custom"


# 커스텀 예외
class TimeUtilsError(Exception):
    """시간 유틸리티 기본 예외"""
    pass


class TimeParsingError(TimeUtilsError):
    """시간 파싱 오류"""
    pass


class TimezoneError(TimeUtilsError):
    """타임존 관련 오류"""
    pass


class TimeRangeError(TimeUtilsError):
    """시간 범위 오류"""
    pass


# 데이터 클래스
@dataclass
class ParsedTime:
    """파싱된 시간 정보"""
    datetime_obj: datetime
    original_text: str
    confidence: float
    timezone: Optional[pytz.BaseTzInfo] = None
    is_relative: bool = False
    parsed_components: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TimeRange:
    """시간 범위"""
    start: datetime
    end: datetime
    timezone: Optional[pytz.BaseTzInfo] = None
    
    def __post_init__(self):
        if self.start >= self.end:
            raise TimeRangeError("시작 시간이 종료 시간보다 늦습니다")
    
    @property
    def duration(self) -> timedelta:
        return self.end - self.start
    
    def contains(self, dt: datetime) -> bool:
        """시간이 범위 내에 있는지 확인"""
        return self.start <= dt <= self.end
    
    def overlaps(self, other: 'TimeRange') -> bool:
        """다른 시간 범위와 겹치는지 확인"""
        return self.start < other.end and self.end > other.start


@dataclass
class BusinessHours:
    """업무시간 정의"""
    weekdays: Dict[int, Tuple[dt_time, dt_time]]  # 0=월요일, 6=일요일
    holidays: List[date] = field(default_factory=list)
    timezone: pytz.BaseTzInfo = field(default_factory=lambda: pytz.UTC)
    
    def is_business_time(self, dt: datetime) -> bool:
        """업무시간인지 확인"""
        if dt.date() in self.holidays:
            return False
        
        weekday = dt.weekday()
        if weekday not in self.weekdays:
            return False
        
        start_time, end_time = self.weekdays[weekday]
        return start_time <= dt.time() <= end_time


@dataclass
class RecurrentSchedule:
    """반복 일정"""
    start_date: datetime
    pattern: RecurrencePattern
    interval: int = 1
    end_date: Optional[datetime] = None
    count: Optional[int] = None
    custom_rule: Optional[str] = None


class TimeConfig:
    """시간 유틸리티 설정"""
    
    def __init__(self):
        self.default_timezone = pytz.UTC
        self.locale = 'ko_KR'
        self.date_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d',
            '%Y/%m/%d %H:%M:%S',
            '%Y/%m/%d',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y'
        ]
        self.cache_size = 1000
        self.enable_natural_language = True
        self.enable_fuzzy_parsing = True


class NaturalLanguageParser:
    """자연어 시간 파싱기"""
    
    def __init__(self, locale: str = 'ko_KR'):
        self.locale = locale
        self.patterns = self._load_patterns()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def _load_patterns(self) -> Dict[str, List[Tuple[str, Callable]]]:
        """언어별 패턴 로드"""
        if self.locale.startswith('ko'):
            return self._get_korean_patterns()
        else:
            return self._get_english_patterns()
    
    def _get_korean_patterns(self) -> Dict[str, List[Tuple[str, Callable]]]:
        """한국어 시간 표현 패턴"""
        return {
            'relative': [
                (r'(\d+)시간\s*후', lambda m: timedelta(hours=int(m.group(1)))),
                (r'(\d+)분\s*후', lambda m: timedelta(minutes=int(m.group(1)))),
                (r'(\d+)일\s*후', lambda m: timedelta(days=int(m.group(1)))),
                (r'(\d+)주\s*후', lambda m: timedelta(weeks=int(m.group(1)))),
                (r'(\d+)개월\s*후', lambda m: timedelta(days=int(m.group(1)) * 30)),
                (r'(\d+)년\s*후', lambda m: timedelta(days=int(m.group(1)) * 365)),
                (r'(\d+)시간\s*전', lambda m: -timedelta(hours=int(m.group(1)))),
                (r'(\d+)분\s*전', lambda m: -timedelta(minutes=int(m.group(1)))),
                (r'(\d+)일\s*전', lambda m: -timedelta(days=int(m.group(1)))),
                (r'지금', lambda m: timedelta(0)),
                (r'오늘', lambda m: timedelta(0)),
                (r'내일', lambda m: timedelta(days=1)),
                (r'모레', lambda m: timedelta(days=2)),
                (r'어제', lambda m: timedelta(days=-1)),
                (r'그제', lambda m: timedelta(days=-2)),
            ],
            'absolute': [
                (r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', 
                 lambda m: datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
                (r'(\d{1,2})월\s*(\d{1,2})일', 
                 lambda m: datetime(datetime.now().year, int(m.group(1)), int(m.group(2)))),
                (r'오전\s*(\d{1,2})시', 
                 lambda m: datetime.combine(date.today(), dt_time(int(m.group(1))))),
                (r'오후\s*(\d{1,2})시', 
                 lambda m: datetime.combine(date.today(), dt_time(int(m.group(1)) + 12 if int(m.group(1)) != 12 else 12))),
                (r'(\d{1,2})시\s*(\d{1,2})분', 
                 lambda m: datetime.combine(date.today(), dt_time(int(m.group(1)), int(m.group(2))))),
            ],
            'weekdays': [
                (r'다음\s*월요일', lambda m: self._next_weekday(0)),
                (r'다음\s*화요일', lambda m: self._next_weekday(1)),
                (r'다음\s*수요일', lambda m: self._next_weekday(2)),
                (r'다음\s*목요일', lambda m: self._next_weekday(3)),
                (r'다음\s*금요일', lambda m: self._next_weekday(4)),
                (r'다음\s*토요일', lambda m: self._next_weekday(5)),
                (r'다음\s*일요일', lambda m: self._next_weekday(6)),
                (r'이번\s*월요일', lambda m: self._this_weekday(0)),
                (r'이번\s*화요일', lambda m: self._this_weekday(1)),
                (r'이번\s*수요일', lambda m: self._this_weekday(2)),
                (r'이번\s*목요일', lambda m: self._this_weekday(3)),
                (r'이번\s*금요일', lambda m: self._this_weekday(4)),
                (r'이번\s*토요일', lambda m: self._this_weekday(5)),
                (r'이번\s*일요일', lambda m: self._this_weekday(6)),
            ]
        }
    
    def _get_english_patterns(self) -> Dict[str, List[Tuple[str, Callable]]]:
        """영어 시간 표현 패턴"""
        return {
            'relative': [
                (r'(\d+)\s*hours?\s*ago', lambda m: -timedelta(hours=int(m.group(1)))),
                (r'(\d+)\s*minutes?\s*ago', lambda m: -timedelta(minutes=int(m.group(1)))),
                (r'(\d+)\s*days?\s*ago', lambda m: -timedelta(days=int(m.group(1)))),
                (r'(\d+)\s*weeks?\s*ago', lambda m: -timedelta(weeks=int(m.group(1)))),
                (r'(\d+)\s*months?\s*ago', lambda m: -timedelta(days=int(m.group(1)) * 30)),
                (r'(\d+)\s*years?\s*ago', lambda m: -timedelta(days=int(m.group(1)) * 365)),
                (r'in\s*(\d+)\s*hours?', lambda m: timedelta(hours=int(m.group(1)))),
                (r'in\s*(\d+)\s*minutes?', lambda m: timedelta(minutes=int(m.group(1)))),
                (r'in\s*(\d+)\s*days?', lambda m: timedelta(days=int(m.group(1)))),
                (r'now', lambda m: timedelta(0)),
                (r'today', lambda m: timedelta(0)),
                (r'tomorrow', lambda m: timedelta(days=1)),
                (r'yesterday', lambda m: timedelta(days=-1)),
            ],
            'absolute': [
                (r'(\d{4})-(\d{1,2})-(\d{1,2})', 
                 lambda m: datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
                (r'(\d{1,2})/(\d{1,2})/(\d{4})', 
                 lambda m: datetime(int(m.group(3)), int(m.group(1)), int(m.group(2)))),
                (r'(\d{1,2}):(\d{1,2})\s*(AM|PM)', 
                 lambda m: datetime.combine(date.today(), 
                    dt_time(int(m.group(1)) + (12 if m.group(3) == 'PM' and int(m.group(1)) != 12 else 0), 
                            int(m.group(2))))),
            ]
        }
    
    def _next_weekday(self, weekday: int) -> datetime:
        """다음 주 특정 요일"""
        today = datetime.now()
        days_ahead = weekday - today.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        return today + timedelta(days=days_ahead)
    
    def _this_weekday(self, weekday: int) -> datetime:
        """이번 주 특정 요일"""
        today = datetime.now()
        days_ahead = weekday - today.weekday()
        return today + timedelta(days=days_ahead)
    
    def parse(self, text: str, reference_time: Optional[datetime] = None) -> Optional[ParsedTime]:
        """자연어 시간 표현 파싱"""
        if not text:
            return None
        
        reference_time = reference_time or datetime.now()
        text = text.strip().lower()
        
        # 패턴별로 매칭 시도
        for category, patterns in self.patterns.items():
            for pattern, handler in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    try:
                        if category == 'relative':
                            delta = handler(match)
                            result_dt = reference_time + delta
                            return ParsedTime(
                                datetime_obj=result_dt,
                                original_text=text,
                                confidence=0.9,
                                is_relative=True,
                                parsed_components={'delta': delta, 'reference': reference_time}
                            )
                        elif category in ['absolute', 'weekdays']:
                            result_dt = handler(match)
                            return ParsedTime(
                                datetime_obj=result_dt,
                                original_text=text,
                                confidence=0.8,
                                is_relative=False
                            )
                    except Exception as e:
                        self.logger.warning(f"패턴 매칭 실패: {pattern}, 오류: {e}")
                        continue
        
        return None


class TimezoneManager:
    """타임존 관리자"""
    
    def __init__(self):
        self.cache = {}
        self.common_timezones = {
            'KST': 'Asia/Seoul',
            'JST': 'Asia/Tokyo',
            'EST': 'US/Eastern',
            'PST': 'US/Pacific',
            'UTC': 'UTC',
            'GMT': 'GMT'
        }
        self.auto_detect_enabled = True
        
    @lru_cache(maxsize=100)
    def get_timezone(self, tz_input: TimezoneInput) -> pytz.BaseTzInfo:
        """타임존 객체 반환"""
        if isinstance(tz_input, pytz.BaseTzInfo):
            return tz_input
        
        if isinstance(tz_input, str):
            # 일반적인 약어 처리
            if tz_input.upper() in self.common_timezones:
                tz_input = self.common_timezones[tz_input.upper()]
            
            try:
                return pytz.timezone(tz_input)
            except pytz.UnknownTimeZoneError:
                raise TimezoneError(f"알 수 없는 타임존: {tz_input}")
        
        raise TimezoneError(f"지원하지 않는 타임존 타입: {type(tz_input)}")
    
    def convert_timezone(self, dt: datetime, from_tz: TimezoneInput, 
                        to_tz: TimezoneInput) -> datetime:
        """타임존 변환"""
        from_timezone = self.get_timezone(from_tz)
        to_timezone = self.get_timezone(to_tz)
        
        # naive datetime인 경우 from_tz로 localize
        if dt.tzinfo is None:
            dt = from_timezone.localize(dt)
        
        return dt.astimezone(to_timezone)
    
    def get_timezone_offset(self, tz: TimezoneInput, dt: Optional[datetime] = None) -> timedelta:
        """타임존 오프셋 반환"""
        dt = dt or datetime.now()
        timezone = self.get_timezone(tz)
        
        if dt.tzinfo is None:
            dt = timezone.localize(dt)
        
        return dt.utcoffset()
    
    def list_timezones_by_country(self, country_code: str) -> List[str]:
        """국가별 타임존 목록"""
        try:
            return pytz.country_timezones.get(country_code.upper(), [])
        except KeyError:
            return []
    
    def detect_timezone_from_offset(self, offset_hours: float) -> List[str]:
        """오프셋으로부터 가능한 타임존들 찾기"""
        target_offset = timedelta(hours=offset_hours)
        matching_timezones = []
        
        for tz_name in pytz.common_timezones:
            try:
                tz = pytz.timezone(tz_name)
                dt = datetime.now()
                localized_dt = tz.localize(dt)
                if localized_dt.utcoffset() == target_offset:
                    matching_timezones.append(tz_name)
            except:
                continue
        
        return matching_timezones


class SmartTimeUtils:
    """고도화된 시간 유틸리티 메인 클래스"""
    
    def __init__(self, config: Optional[TimeConfig] = None):
        self.config = config or TimeConfig()
        self.timezone_manager = TimezoneManager()
        self.nl_parser = NaturalLanguageParser(self.config.locale)
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self.metrics = defaultdict(int)
        self._lock = threading.RLock()
        
        # 성능 메트릭 수집
        self._operation_times = defaultdict(list)
    
    def _measure_time(self, operation_name: str):
        """실행 시간 측정 데코레이터"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                start_time = datetime.now()
                try:
                    result = func(*args, **kwargs)
                    self.metrics[f"{operation_name}_success"] += 1
                    return result
                except Exception as e:
                    self.metrics[f"{operation_name}_error"] += 1
                    raise
                finally:
                    duration = (datetime.now() - start_time).total_seconds()
                    with self._lock:
                        self._operation_times[operation_name].append(duration)
                        # 최근 100개만 유지
                        if len(self._operation_times[operation_name]) > 100:
                            self._operation_times[operation_name] = self._operation_times[operation_name][-100:]
            return wrapper
        return decorator
    
    def parse_smart(self, time_input: Union[str, datetime, int, float], 
                   context: Optional[Dict[str, Any]] = None) -> ParsedTime:
        """스마트 시간 파싱"""
        context = context or {}
        reference_time = context.get('reference_time', datetime.now())
        
        if isinstance(time_input, datetime):
            return ParsedTime(
                datetime_obj=time_input,
                original_text=str(time_input),
                confidence=1.0
            )
        
        if isinstance(time_input, (int, float)):
            # 타임스탬프로 가정
            try:
                dt = datetime.fromtimestamp(time_input)
                return ParsedTime(
                    datetime_obj=dt,
                    original_text=str(time_input),
                    confidence=0.9
                )
            except (ValueError, OSError):
                raise TimeParsingError(f"유효하지 않은 타임스탬프: {time_input}")
        
        if isinstance(time_input, str):
            # 자연어 파싱 시도
            if self.config.enable_natural_language:
                parsed = self.nl_parser.parse(time_input, reference_time)
                if parsed:
                    return parsed
            
            # 표준 형식 파싱 시도
            return self._parse_standard_formats(time_input)
        
        raise TimeParsingError(f"지원하지 않는 시간 입력 타입: {type(time_input)}")
    
    def _parse_standard_formats(self, time_str: str) -> ParsedTime:
        """표준 시간 형식 파싱"""
        errors = []
        
        for fmt in self.config.date_formats:
            try:
                dt = datetime.strptime(time_str, fmt)
                return ParsedTime(
                    datetime_obj=dt,
                    original_text=time_str,
                    confidence=0.95
                )
            except ValueError as e:
                errors.append(str(e))
        
        # ISO 형식 시도
        try:
            dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
            return ParsedTime(
                datetime_obj=dt,
                original_text=time_str,
                confidence=0.98
            )
        except ValueError as e:
            errors.append(str(e))
        
        raise TimeParsingError(f"시간 문자열 파싱 실패: {time_str}. 오류: {errors}")
    
    def get_relative_time(self, dt: datetime, reference: Optional[datetime] = None,
                         max_unit: RelativeTimeUnit = RelativeTimeUnit.YEAR) -> str:
        """상대 시간 문자열 반환"""
        reference = reference or datetime.now()
        diff = dt - reference
        
        # 절댓값과 방향 계산
        abs_diff = abs(diff.total_seconds())
        is_future = diff.total_seconds() > 0
        
        # 단위별 계산
        units = [
            (RelativeTimeUnit.YEAR, 365 * 24 * 3600, "년"),
            (RelativeTimeUnit.MONTH, 30 * 24 * 3600, "개월"),
            (RelativeTimeUnit.WEEK, 7 * 24 * 3600, "주"),
            (RelativeTimeUnit.DAY, 24 * 3600, "일"),
            (RelativeTimeUnit.HOUR, 3600, "시간"),
            (RelativeTimeUnit.MINUTE, 60, "분"),
            (RelativeTimeUnit.SECOND, 1, "초")
        ]
        
        for unit, seconds, label in units:
            if unit.value == max_unit.value:
                break
            
            if abs_diff >= seconds:
                value = int(abs_diff // seconds)
                direction = "후" if is_future else "전"
                
                if self.config.locale.startswith('ko'):
                    return f"{value}{label} {direction}"
                else:
                    plural = "s" if value > 1 else ""
                    direction_en = "from now" if is_future else "ago"
                    return f"{value} {label}{plural} {direction_en}"
        
        # 1초 미만
        if self.config.locale.startswith('ko'):
            return "방금 전" if not is_future else "곧"
        else:
            return "just now" if not is_future else "in a moment"
    
    def format_time(self, dt: datetime, format_type: TimeFormat = TimeFormat.ISO,
                    timezone: Optional[TimezoneInput] = None,
                    locale: Optional[str] = None) -> str:
        """시간 포맷팅"""
        locale = locale or self.config.locale
        
        # 타임존 변환
        if timezone:
            target_tz = self.timezone_manager.get_timezone(timezone)
            if dt.tzinfo is None:
                dt = self.config.default_timezone.localize(dt)
            dt = dt.astimezone(target_tz)
        
        if format_type == TimeFormat.ISO:
            return dt.isoformat()
        elif format_type == TimeFormat.RFC3339:
            return dt.strftime('%Y-%m-%dT%H:%M:%S%z')
        elif format_type == TimeFormat.TIMESTAMP:
            return str(int(dt.timestamp()))
        elif format_type == TimeFormat.HUMAN:
            if locale.startswith('ko'):
                return dt.strftime('%Y년 %m월 %d일 %H시 %M분')
            else:
                return dt.strftime('%B %d, %Y at %I:%M %p')
        elif format_type == TimeFormat.RELATIVE:
            return self.get_relative_time(dt)
        elif format_type == TimeFormat.BUSINESS:
            if locale.startswith('ko'):
                weekdays = ['월', '화', '수', '목', '금', '토', '일']
                return dt.strftime(f'%Y년 %m월 %d일 ({weekdays[dt.weekday()]}) %H:%M')
            else:
                return dt.strftime('%Y-%m-%d (%A) %H:%M')
        
        return dt.isoformat()
    
    def calculate_business_time(self, start: datetime, duration: timedelta,
                              business_hours: BusinessHours) -> datetime:
        """업무시간 기준 시간 계산"""
        current = start
        remaining = duration.total_seconds()
        
        while remaining > 0:
            if business_hours.is_business_time(current):
                remaining -= 60  # 1분씩 차감
            current += timedelta(minutes=1)
        
        return current
    
    def get_business_days_between(self, start: date, end: date,
                                business_hours: BusinessHours) -> int:
        """두 날짜 사이의 업무일 수"""
        count = 0
        current = start
        
        while current <= end:
            if (current.weekday() in business_hours.weekdays and 
                current not in business_hours.holidays):
                count += 1
            current += timedelta(days=1)
        
        return count
    
    def generate_recurrent_dates(self, schedule: RecurrentSchedule) -> List[datetime]:
        """반복 일정 날짜 생성"""
        dates = []
        current = schedule.start_date
        count = 0
        
        while True:
            # 종료 조건 확인
            if schedule.end_date and current > schedule.end_date:
                break
            if schedule.count and count >= schedule.count:
                break
            
            dates.append(current)
            count += 1
            
            # 다음 날짜 계산
            if schedule.pattern == RecurrencePattern.DAILY:
                current += timedelta(days=schedule.interval)
            elif schedule.pattern == RecurrencePattern.WEEKLY:
                current += timedelta(weeks=schedule.interval)
            elif schedule.pattern == RecurrencePattern.MONTHLY:
                # 월 단위 증가 (복잡한 로직 필요)
                month = current.month
                year = current.year
                month += schedule.interval
                while month > 12:
                    month -= 12
                    year += 1
                
                # 날짜가 해당 월에 존재하지 않는 경우 처리
                day = min(current.day, calendar.monthrange(year, month)[1])
                current = current.replace(year=year, month=month, day=day)
            elif schedule.pattern == RecurrencePattern.YEARLY:
                current = current.replace(year=current.year + schedule.interval)
            elif schedule.pattern == RecurrencePattern.BUSINESS_DAYS:
                current += timedelta(days=1)
                while current.weekday() >= 5:  # 주말 건너뛰기
                    current += timedelta(days=1)
        
        return dates
    
    def validate_time_range(self, time_range: TimeRange) -> List[str]:
        """시간 범위 검증"""
        issues = []
        
        if time_range.start >= time_range.end:
            issues.append("시작 시간이 종료 시간보다 늦습니다")
        
        if time_range.duration > timedelta(days=365):
            issues.append("시간 범위가 1년을 초과합니다")
        
        if time_range.start < datetime(1900, 1, 1):
            issues.append("시작 시간이 너무 과거입니다")
        
        if time_range.end > datetime(2100, 12, 31):
            issues.append("종료 시간이 너무 미래입니다")
        
        return issues
    
    def find_available_slots(self, 
                           search_range: TimeRange,
                           slot_duration: timedelta,
                           blocked_ranges: List[TimeRange],
                           business_hours: Optional[BusinessHours] = None) -> List[TimeRange]:
        """사용 가능한 시간 슬롯 찾기"""
        available_slots = []
        current = search_range.start
        
        while current + slot_duration <= search_range.end:
            slot_end = current + slot_duration
            slot_range = TimeRange(current, slot_end)
            
            # 차단된 범위와 겹치는지 확인
            is_blocked = any(slot_range.overlaps(blocked) for blocked in blocked_ranges)
            
            # 업무시간 확인
            if business_hours and not business_hours.is_business_time(current):
                is_blocked = True
            
            if not is_blocked:
                available_slots.append(slot_range)
                current = slot_end
            else:
                current += timedelta(minutes=15)  # 15분씩 이동
        
        return available_slots
    
    def calculate_age(self, birth_date: date, reference_date: Optional[date] = None) -> Dict[str, int]:
        """나이 계산 (년, 월, 일)"""
        reference_date = reference_date or date.today()
        
        years = reference_date.year - birth_date.year
        months = reference_date.month - birth_date.month
        days = reference_date.day - birth_date.day
        
        if days < 0:
            months -= 1
            # 이전 달의 마지막 날 계산
            if reference_date.month == 1:
                prev_month_days = calendar.monthrange(reference_date.year - 1, 12)[1]
            else:
                prev_month_days = calendar.monthrange(reference_date.year, reference_date.month - 1)[1]
            days += prev_month_days
        
        if months < 0:
            years -= 1
            months += 12
        
        return {
            'years': years,
            'months': months,
            'days': days,
            'total_days': (reference_date - birth_date).days
        }
    
    def get_season(self, dt: datetime, hemisphere: str = 'north') -> str:
        """계절 반환"""
        month = dt.month
        day = dt.day
        
        if hemisphere.lower() == 'north':
            if (month == 12 and day >= 21) or month in [1, 2] or (month == 3 and day < 20):
                return '겨울' if self.config.locale.startswith('ko') else 'winter'
            elif (month == 3 and day >= 20) or month in [4, 5] or (month == 6 and day < 21):
                return '봄' if self.config.locale.startswith('ko') else 'spring'
            elif (month == 6 and day >= 21) or month in [7, 8] or (month == 9 and day < 22):
                return '여름' if self.config.locale.startswith('ko') else 'summer'
            else:
                return '가을' if self.config.locale.startswith('ko') else 'autumn'
        else:
            # 남반구는 계절이 반대
            if (month == 6 and day >= 21) or month in [7, 8] or (month == 9 and day < 22):
                return '겨울' if self.config.locale.startswith('ko') else 'winter'
            elif (month == 9 and day >= 22) or month in [10, 11] or (month == 12 and day < 21):
                return '봄' if self.config.locale.startswith('ko') else 'spring'
            elif (month == 12 and day >= 21) or month in [1, 2] or (month == 3 and day < 20):
                return '여름' if self.config.locale.startswith('ko') else 'summer'
            else:
                return '가을' if self.config.locale.startswith('ko') else 'autumn'
    
    def get_lunar_phase(self, dt: datetime) -> str:
        """달의 위상 계산 (간단한 근사치)"""
        # 2000년 1월 6일을 신월로 기준 (Julian day 2451550.1)
        base_new_moon = datetime(2000, 1, 6, 18, 14, 0)
        lunar_cycle = 29.53058867  # 달의 주기 (일)
        
        days_since_base = (dt - base_new_moon).total_seconds() / (24 * 3600)
        lunar_age = days_since_base % lunar_cycle
        
        if lunar_age < 1.84566:
            return '신월' if self.config.locale.startswith('ko') else 'new moon'
        elif lunar_age < 5.53699:
            return '초승달' if self.config.locale.startswith('ko') else 'waxing crescent'
        elif lunar_age < 9.22831:
            return '상현달' if self.config.locale.startswith('ko') else 'first quarter'
        elif lunar_age < 12.91963:
            return '보름달에 가까운 달' if self.config.locale.startswith('ko') else 'waxing gibbous'
        elif lunar_age < 16.61096:
            return '보름달' if self.config.locale.startswith('ko') else 'full moon'
        elif lunar_age < 20.30228:
            return '기우는 보름달' if self.config.locale.startswith('ko') else 'waning gibbous'
        elif lunar_age < 23.99361:
            return '하현달' if self.config.locale.startswith('ko') else 'last quarter'
        elif lunar_age < 27.68493:
            return '그믐달' if self.config.locale.startswith('ko') else 'waning crescent'
        else:
            return '신월' if self.config.locale.startswith('ko') else 'new moon'
    
    def calculate_time_until_event(self, event_time: datetime, 
                                 current_time: Optional[datetime] = None) -> Dict[str, Any]:
        """이벤트까지 남은 시간 상세 계산"""
        current_time = current_time or datetime.now()
        
        if event_time <= current_time:
            return {
                'is_past': True,
                'message': '이미 지났습니다' if self.config.locale.startswith('ko') else 'Already passed'
            }
        
        diff = event_time - current_time
        total_seconds = int(diff.total_seconds())
        
        years = total_seconds // (365 * 24 * 3600)
        total_seconds %= (365 * 24 * 3600)
        
        months = total_seconds // (30 * 24 * 3600)
        total_seconds %= (30 * 24 * 3600)
        
        days = total_seconds // (24 * 3600)
        total_seconds %= (24 * 3600)
        
        hours = total_seconds // 3600
        total_seconds %= 3600
        
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        
        return {
            'is_past': False,
            'years': years,
            'months': months,
            'days': days,
            'hours': hours,
            'minutes': minutes,
            'seconds': seconds,
            'total_days': diff.days,
            'total_seconds': int(diff.total_seconds()),
            'formatted': self._format_time_until(years, months, days, hours, minutes, seconds)
        }
    
    def _format_time_until(self, years: int, months: int, days: int, 
                          hours: int, minutes: int, seconds: int) -> str:
        """남은 시간 포맷팅"""
        parts = []
        
        if self.config.locale.startswith('ko'):
            if years > 0:
                parts.append(f"{years}년")
            if months > 0:
                parts.append(f"{months}개월")
            if days > 0:
                parts.append(f"{days}일")
            if hours > 0:
                parts.append(f"{hours}시간")
            if minutes > 0:
                parts.append(f"{minutes}분")
            if seconds > 0 and not parts:  # 초는 다른 단위가 없을 때만
                parts.append(f"{seconds}초")
        else:
            if years > 0:
                parts.append(f"{years} year{'s' if years > 1 else ''}")
            if months > 0:
                parts.append(f"{months} month{'s' if months > 1 else ''}")
            if days > 0:
                parts.append(f"{days} day{'s' if days > 1 else ''}")
            if hours > 0:
                parts.append(f"{hours} hour{'s' if hours > 1 else ''}")
            if minutes > 0:
                parts.append(f"{minutes} minute{'s' if minutes > 1 else ''}")
            if seconds > 0 and not parts:
                parts.append(f"{seconds} second{'s' if seconds > 1 else ''}")
        
        if not parts:
            return '곧' if self.config.locale.startswith('ko') else 'very soon'
        
        return ' '.join(parts[:2])  # 최대 2개 단위만 표시
    
    def get_time_zone_info(self, tz: TimezoneInput) -> Dict[str, Any]:
        """타임존 상세 정보"""
        timezone = self.timezone_manager.get_timezone(tz)
        now = datetime.now()
        
        try:
            localized_now = timezone.localize(now)
        except:
            localized_now = now.replace(tzinfo=timezone)
        
        return {
            'name': str(timezone),
            'abbreviation': localized_now.strftime('%Z'),
            'offset': str(localized_now.utcoffset()),
            'offset_hours': localized_now.utcoffset().total_seconds() / 3600,
            'is_dst': bool(localized_now.dst()),
            'current_time': localized_now.strftime('%Y-%m-%d %H:%M:%S %Z')
        }
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """성능 메트릭 반환"""
        with self._lock:
            avg_times = {}
            for operation, times in self._operation_times.items():
                if times:
                    avg_times[operation] = {
                        'avg_seconds': sum(times) / len(times),
                        'min_seconds': min(times),
                        'max_seconds': max(times),
                        'call_count': len(times)
                    }
            
            return {
                'operation_counts': dict(self.metrics),
                'average_times': avg_times,
                'cache_info': {
                    'timezone_cache_size': len(self.timezone_manager.cache)
                }
            }
    
    def clear_cache(self) -> None:
        """캐시 정리"""
        self.timezone_manager.get_timezone.cache_clear()
        self.timezone_manager.cache.clear()
        
        with self._lock:
            self._operation_times.clear()
            self.metrics.clear()


class TimeZoneConverter:
    """타임존 변환 전용 클래스"""
    
    def __init__(self):
        self.timezone_manager = TimezoneManager()
    
    def convert_multiple_timezones(self, dt: datetime, 
                                 timezones: List[TimezoneInput]) -> Dict[str, datetime]:
        """여러 타임존으로 동시 변환"""
        results = {}
        
        for tz in timezones:
            try:
                tz_obj = self.timezone_manager.get_timezone(tz)
                if dt.tzinfo is None:
                    localized_dt = pytz.UTC.localize(dt)
                else:
                    localized_dt = dt
                
                converted = localized_dt.astimezone(tz_obj)
                results[str(tz)] = converted
            except Exception as e:
                results[str(tz)] = f"Error: {e}"
        
        return results
    
    def get_world_clock(self, timezones: Optional[List[str]] = None) -> Dict[str, str]:
        """세계 시계"""
        if timezones is None:
            timezones = [
                'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai',
                'Europe/London', 'Europe/Paris', 'Europe/Berlin',
                'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
                'Australia/Sydney', 'UTC'
            ]
        
        now_utc = datetime.now(pytz.UTC)
        world_times = {}
        
        for tz_name in timezones:
            try:
                tz = pytz.timezone(tz_name)
                local_time = now_utc.astimezone(tz)
                world_times[tz_name] = local_time.strftime('%Y-%m-%d %H:%M:%S %Z')
            except Exception as e:
                world_times[tz_name] = f"Error: {e}"
        
        return world_times


class TimeScheduler:
    """시간 스케줄링 전용 클래스"""
    
    def __init__(self):
        self.scheduled_tasks = {}
        self.recurring_tasks = {}
    
    def schedule_once(self, task_id: str, run_time: datetime, 
                     callback: Callable, *args, **kwargs) -> bool:
        """일회성 작업 스케줄"""
        if run_time <= datetime.now():
            return False
        
        self.scheduled_tasks[task_id] = {
            'run_time': run_time,
            'callback': callback,
            'args': args,
            'kwargs': kwargs,
            'type': 'once'
        }
        return True
    
    def schedule_recurring(self, task_id: str, schedule: RecurrentSchedule,
                          callback: Callable, *args, **kwargs) -> bool:
        """반복 작업 스케줄"""
        self.recurring_tasks[task_id] = {
            'schedule': schedule,
            'callback': callback,
            'args': args,
            'kwargs': kwargs,
            'last_run': None,
            'next_run': schedule.start_date
        }
        return True
    
    def get_upcoming_tasks(self, hours_ahead: int = 24) -> List[Dict[str, Any]]:
        """예정된 작업 목록"""
        cutoff_time = datetime.now() + timedelta(hours=hours_ahead)
        upcoming = []
        
        # 일회성 작업
        for task_id, task in self.scheduled_tasks.items():
            if task['run_time'] <= cutoff_time:
                upcoming.append({
                    'id': task_id,
                    'type': 'once',
                    'run_time': task['run_time'],
                    'callback_name': task['callback'].__name__
                })
        
        # 반복 작업
        for task_id, task in self.recurring_tasks.items():
            if task['next_run'] <= cutoff_time:
                upcoming.append({
                    'id': task_id,
                    'type': 'recurring',
                    'run_time': task['next_run'],
                    'callback_name': task['callback'].__name__
                })
        
        return sorted(upcoming, key=lambda x: x['run_time'])


# 전역 인스턴스 및 설정
_default_time_utils = None
_default_config = TimeConfig()

def get_time_utils(config: Optional[TimeConfig] = None) -> SmartTimeUtils:
    """기본 시간 유틸리티 인스턴스 반환"""
    global _default_time_utils
    if _default_time_utils is None:
        _default_time_utils = SmartTimeUtils(config or _default_config)
    return _default_time_utils

def set_default_config(config: TimeConfig) -> None:
    """기본 설정 설정"""
    global _default_config, _default_time_utils
    _default_config = config
    _default_time_utils = None  # 새 설정으로 재생성


# 편의 함수들 (하위 호환성)
def get_current_datetime() -> datetime:
    """현재 datetime 객체 반환"""
    return datetime.now()

def get_current_datetime_str() -> str:
    """현재 시간을 ISO 형식 문자열로 반환"""
    return datetime.now().isoformat()

def format_datetime(dt: datetime, format_type: TimeFormat = TimeFormat.ISO) -> str:
    """datetime 객체 포맷팅"""
    return get_time_utils().format_time(dt, format_type)

def parse_datetime(dt_str: str) -> Optional[datetime]:
    """시간 문자열 파싱"""
    try:
        parsed = get_time_utils().parse_smart(dt_str)
        return parsed.datetime_obj
    except TimeParsingError:
        return None

def parse_natural_time(text: str, reference_time: Optional[datetime] = None) -> Optional[datetime]:
    """자연어 시간 파싱"""
    try:
        parsed = get_time_utils().parse_smart(text, {'reference_time': reference_time})
        return parsed.datetime_obj
    except TimeParsingError:
        return None

def get_relative_time_string(dt: datetime, reference: Optional[datetime] = None) -> str:
    """상대 시간 문자열 반환"""
    return get_time_utils().get_relative_time(dt, reference)

def convert_timezone(dt: datetime, from_tz: str, to_tz: str) -> datetime:
    """타임존 변환"""
    time_utils = get_time_utils()
    return time_utils.timezone_manager.convert_timezone(dt, from_tz, to_tz)

def get_world_clock(timezones: Optional[List[str]] = None) -> Dict[str, str]:
    """세계 시계"""
    converter = TimeZoneConverter()
    return converter.get_world_clock(timezones)

def calculate_age_detailed(birth_date: date, reference_date: Optional[date] = None) -> Dict[str, int]:
    """상세한 나이 계산"""
    return get_time_utils().calculate_age(birth_date, reference_date)

def get_season_info(dt: datetime, hemisphere: str = 'north') -> str:
    """계절 정보"""
    return get_time_utils().get_season(dt, hemisphere)

def find_next_business_day(start_date: date, business_hours: BusinessHours) -> date:
    """다음 업무일 찾기"""
    current = start_date + timedelta(days=1)
    
    while True:
        if (current.weekday() in business_hours.weekdays and 
            current not in business_hours.holidays):
            return current
        current += timedelta(days=1)

def create_time_range(start: DateTimeInput, end: DateTimeInput, 
                     timezone: Optional[str] = None) -> TimeRange:
    """시간 범위 생성"""
    time_utils = get_time_utils()
    
    if isinstance(start, str):
        start = time_utils.parse_smart(start).datetime_obj
    if isinstance(end, str):
        end = time_utils.parse_smart(end).datetime_obj
    
    tz = None
    if timezone:
        tz = time_utils.timezone_manager.get_timezone(timezone)
    
    return TimeRange(start, end, tz)

def schedule_task(task_id: str, run_time: datetime, callback: Callable, 
                 scheduler: Optional[TimeScheduler] = None) -> bool:
    """작업 스케줄링"""
    if scheduler is None:
        scheduler = TimeScheduler()
    return scheduler.schedule_once(task_id, run_time, callback)


# 별칭 제공 (하위 호환성)
DateTimeUtils = SmartTimeUtils
TimeUtils = SmartTimeUtils

# 레거시 함수들
def format_datetime_for_display(dt_str: str) -> str:
    """표시용 datetime 형식으로 변환 (레거시)"""
    try:
        dt = parse_datetime(dt_str)
        if dt:
            return format_datetime(dt, TimeFormat.HUMAN)
        return dt_str
    except Exception:
        return dt_str

def get_datetime_display_string(dt_str: str) -> str:
    """사용자 친화적인 datetime 문자열 반환 (레거시)"""
    return format_datetime_for_display(dt_str)

def format_datetime_simple(dt: datetime) -> str:
    """간단한 형식의 datetime 문자열 반환 (레거시)"""
    return format_datetime(dt)


# 모듈 초기화
def _initialize_module():
    """모듈 초기화"""
    # 기본 설정 적용
    config = TimeConfig()
    
    # 시스템 로케일에 따른 기본 설정
    import locale
    try:
        system_locale = locale.getdefaultlocale()[0]
        if system_locale and system_locale.startswith('ko'):
            config.locale = 'ko_KR'
            config.default_timezone = pytz.timezone('Asia/Seoul')
        else:
            config.locale = 'en_US'
            config.default_timezone = pytz.UTC
    except:
        pass  # 기본값 유지
    
    set_default_config(config)

# 모듈 로드 시 초기화 실행
_initialize_module()


if __name__ == "__main__":
    # 사용 예제
    time_utils = get_time_utils()
    
    # 자연어 파싱 테스트
    examples = [
        "2시간 후",
        "내일 오전 9시",
        "다음 주 월요일",
        "2024-12-25 15:30:00"
    ]
    
    print("=== 자연어 시간 파싱 테스트 ===")
    for example in examples:
        try:
            parsed = time_utils.parse_smart(example)
            print(f"입력: {example}")
            print(f"결과: {parsed.datetime_obj}")
            print(f"신뢰도: {parsed.confidence}")
            print(f"상대시간: {time_utils.get_relative_time(parsed.datetime_obj)}")
            print("-" * 50)
        except Exception as e:
            print(f"오류: {example} -> {e}")
    
    # 세계 시계 테스트
    print("\n=== 세계 시계 ===")
    world_times = get_world_clock(['Asia/Seoul', 'US/Eastern', 'Europe/London'])
    for tz, time_str in world_times.items():
        print(f"{tz}: {time_str}")
    
    # 성능 메트릭
    print("\n=== 성능 메트릭 ===")
    metrics = time_utils.get_performance_metrics()
    for operation, stats in metrics['average_times'].items():
        print(f"{operation}: 평균 {stats['avg_seconds']:.4f}초, 호출 {stats['call_count']}회")