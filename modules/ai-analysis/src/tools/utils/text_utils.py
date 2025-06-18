#!/usr/bin/env python3
"""
Enhanced Text Analysis Utilities
고도화된 텍스트 처리 및 분석 도구들

주요 기능:
- 다국어 텍스트 처리 지원
- NLP 기반 텍스트 분석
- 스마트 텍스트 변환 및 정제
- 텍스트 유사도 및 분류
- 키워드 추출 및 요약
- 텍스트 품질 분석
- 성능 최적화된 텍스트 연산
"""

import re
import unicodedata
import string
import hashlib
import logging
from typing import Dict, List, Set, Tuple, Optional, Any, Union, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import Counter, defaultdict
from functools import lru_cache, wraps
import time
import threading
from concurrent.futures import ThreadPoolExecutor
import asyncio
import math

# 선택적 의존성 처리
try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize, sent_tokenize
    from nltk.stem import PorterStemmer, WordNetLemmatizer
    from nltk.chunk import ne_chunk
    from nltk.tag import pos_tag
    NLTK_AVAILABLE = True
except ImportError:
    NLTK_AVAILABLE = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

# 로깅 설정
logger = logging.getLogger(__name__)


# 예외 클래스들
class TextUtilsError(Exception):
    """텍스트 유틸리티 기본 예외"""
    pass


class TextProcessingError(TextUtilsError):
    """텍스트 처리 오류"""
    pass


class LanguageDetectionError(TextUtilsError):
    """언어 감지 오류"""
    pass


class TextAnalysisError(TextUtilsError):
    """텍스트 분석 오류"""
    pass


# 열거형 정의
class Language(Enum):
    """지원 언어"""
    KOREAN = "ko"
    ENGLISH = "en"
    JAPANESE = "ja"
    CHINESE = "zh"
    SPANISH = "es"
    FRENCH = "fr"
    GERMAN = "de"
    RUSSIAN = "ru"
    PORTUGUESE = "pt"
    ITALIAN = "it"
    ARABIC = "ar"
    HINDI = "hi"
    AUTO = "auto"


class TextCategory(Enum):
    """텍스트 카테고리"""
    TECHNICAL = "technical"
    BUSINESS = "business"
    ACADEMIC = "academic"
    CASUAL = "casual"
    FORMAL = "formal"
    CREATIVE = "creative"
    NEWS = "news"
    SOCIAL = "social"


class SentimentType(Enum):
    """감정 유형"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


# 데이터 클래스들
@dataclass
class TextMetrics:
    """텍스트 메트릭"""
    char_count: int = 0
    word_count: int = 0
    sentence_count: int = 0
    paragraph_count: int = 0
    avg_word_length: float = 0.0
    avg_sentence_length: float = 0.0
    readability_score: float = 0.0
    complexity_score: float = 0.0
    unique_words: int = 0
    vocabulary_richness: float = 0.0


@dataclass
class LanguageInfo:
    """언어 정보"""
    language: Language
    confidence: float
    script: str
    direction: str  # ltr, rtl
    encoding: str


@dataclass
class KeyWord:
    """키워드 정보"""
    word: str
    frequency: int
    importance: float
    position: List[int]
    context: List[str]


@dataclass
class NamedEntity:
    """개체명 정보"""
    text: str
    label: str
    start: int
    end: int
    confidence: float


@dataclass
class SentimentInfo:
    """감정 분석 정보"""
    sentiment: SentimentType
    confidence: float
    positive_score: float
    negative_score: float
    neutral_score: float


@dataclass
class TextSummary:
    """텍스트 요약"""
    original_length: int
    summary_length: int
    compression_ratio: float
    summary_text: str
    key_sentences: List[str]
    key_points: List[str]


@dataclass
class TextAnalysisResult:
    """종합 텍스트 분석 결과"""
    text: str
    language_info: LanguageInfo
    metrics: TextMetrics
    keywords: List[KeyWord]
    entities: List[NamedEntity]
    sentiment: SentimentInfo
    category: TextCategory
    summary: Optional[TextSummary] = None
    quality_score: float = 0.0
    readability_level: str = "unknown"


@dataclass
class TextCleaningConfig:
    """텍스트 정제 설정"""
    remove_urls: bool = True
    remove_emails: bool = True
    remove_html: bool = True
    remove_extra_whitespace: bool = True
    normalize_unicode: bool = True
    remove_special_chars: bool = False
    lowercase: bool = False
    remove_stopwords: bool = False
    remove_punctuation: bool = False
    min_word_length: int = 1
    max_word_length: int = 50


# 성능 측정 데코레이터
def measure_performance(func):
    """성능 측정 데코레이터"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            logger.debug(f"{func.__name__} 실행시간: {execution_time:.4f}초")
            return result
        except Exception as e:
            logger.error(f"{func.__name__} 실행 오류: {e}")
            raise
    return wrapper


class LanguageDetector:
    """언어 감지기"""
    
    def __init__(self):
        self.char_patterns = {
            Language.KOREAN: re.compile(r'[가-힣]'),
            Language.JAPANESE: re.compile(r'[ひらがなカタカナ]'),
            Language.CHINESE: re.compile(r'[\u4e00-\u9fff]'),
            Language.ARABIC: re.compile(r'[\u0600-\u06ff]'),
            Language.RUSSIAN: re.compile(r'[а-яё]', re.IGNORECASE),
        }
        
        self.common_words = {
            Language.ENGLISH: {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of'},
            Language.KOREAN: {'그리고', '하지만', '그러나', '또한', '이것', '저것', '어떤', '같은', '다른'},
            Language.JAPANESE: {'です', 'ます', 'から', 'まで', 'として', 'による', 'について'},
            Language.CHINESE: {'的', '和', '在', '有', '是', '不', '了', '人', '我', '你'},
            Language.SPANISH: {'el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no'},
            Language.FRENCH: {'le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir'},
            Language.GERMAN: {'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'},
        }
    
    @measure_performance
    def detect_language(self, text: str) -> LanguageInfo:
        """언어 감지"""
        if not text or not text.strip():
            raise LanguageDetectionError("텍스트가 비어있습니다")
        
        text = text.lower().strip()
        scores = defaultdict(float)
        
        # 문자 패턴 기반 점수
        for lang, pattern in self.char_patterns.items():
            matches = len(pattern.findall(text))
            if matches > 0:
                scores[lang] += matches / len(text) * 100
        
        # 일반적인 단어 기반 점수
        words = re.findall(r'\b\w+\b', text)
        for lang, common_words in self.common_words.items():
            common_count = sum(1 for word in words if word in common_words)
            if common_count > 0:
                scores[lang] += (common_count / len(words)) * 50
        
        # 영어를 기본값으로 설정
        if not scores:
            scores[Language.ENGLISH] = 10.0
        
        # 가장 높은 점수의 언어 선택
        detected_lang = max(scores.items(), key=lambda x: x[1])
        
        # 스크립트 및 방향 결정
        script = self._get_script(detected_lang[0])
        direction = self._get_direction(detected_lang[0])
        
        return LanguageInfo(
            language=detected_lang[0],
            confidence=min(detected_lang[1] / 100.0, 1.0),
            script=script,
            direction=direction,
            encoding="utf-8"
        )
    
    def _get_script(self, language: Language) -> str:
        """스크립트 타입 반환"""
        script_map = {
            Language.KOREAN: "Hangul",
            Language.JAPANESE: "Hiragana/Katakana",
            Language.CHINESE: "Chinese",
            Language.ARABIC: "Arabic",
            Language.RUSSIAN: "Cyrillic",
        }
        return script_map.get(language, "Latin")
    
    def _get_direction(self, language: Language) -> str:
        """텍스트 방향 반환"""
        return "rtl" if language == Language.ARABIC else "ltr"


class TextNormalizer:
    """텍스트 정규화기"""
    
    def __init__(self):
        self.url_pattern = re.compile(
            r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        )
        self.email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self.html_pattern = re.compile(r'<[^<]+?>')
        self.whitespace_pattern = re.compile(r'\s+')
        
        # 한글 정규화 패턴
        self.korean_patterns = {
            'repeated_chars': re.compile(r'(.)\1{2,}'),  # 연속된 문자
            'emoticons': re.compile(r'[ㅋㅎㅠㅜㅗㅡ]{2,}'),  # 감정 표현
        }
    
    @measure_performance
    def normalize_text(self, text: str, config: TextCleaningConfig) -> str:
        """텍스트 정규화"""
        if not text:
            return ""
        
        result = text
        
        # HTML 태그 제거
        if config.remove_html:
            result = self.html_pattern.sub(' ', result)
        
        # URL 제거
        if config.remove_urls:
            result = self.url_pattern.sub(' ', result)
        
        # 이메일 제거
        if config.remove_emails:
            result = self.email_pattern.sub(' ', result)
        
        # 유니코드 정규화
        if config.normalize_unicode:
            result = unicodedata.normalize('NFKC', result)
        
        # 특수문자 제거
        if config.remove_special_chars:
            result = re.sub(r'[^\w\s가-힣]', ' ', result)
        
        # 구두점 제거
        if config.remove_punctuation:
            result = result.translate(str.maketrans('', '', string.punctuation))
        
        # 소문자 변환
        if config.lowercase:
            result = result.lower()
        
        # 여분의 공백 제거
        if config.remove_extra_whitespace:
            result = self.whitespace_pattern.sub(' ', result).strip()
        
        # 단어 길이 필터링
        if config.min_word_length > 1 or config.max_word_length < 50:
            words = result.split()
            words = [w for w in words if config.min_word_length <= len(w) <= config.max_word_length]
            result = ' '.join(words)
        
        return result
    
    def normalize_korean_text(self, text: str) -> str:
        """한글 텍스트 정규화"""
        result = text
        
        # 연속된 문자 정규화 (ㅋㅋㅋㅋ → ㅋㅋ)
        result = self.korean_patterns['repeated_chars'].sub(r'\1\1', result)
        
        # 감정 표현 정규화
        result = self.korean_patterns['emoticons'].sub(lambda m: m.group(0)[:2], result)
        
        return result
    
    def normalize_whitespace(self, text: str) -> str:
        """공백 정규화"""
        if not text:
            return ""
        return self.whitespace_pattern.sub(' ', text).strip()


class TextAnalyzer:
    """텍스트 분석기"""
    
    def __init__(self):
        self.language_detector = LanguageDetector()
        self.normalizer = TextNormalizer()
        self._init_nlp_models()
        
        # 캐시 설정
        self.cache_size = 1000
        self._analysis_cache = {}
        self._cache_lock = threading.RLock()
    
    def _init_nlp_models(self):
        """NLP 모델 초기화"""
        self.nlp_models = {}
        
        if SPACY_AVAILABLE:
            try:
                self.nlp_models['en'] = spacy.load('en_core_web_sm')
                logger.info("영어 spaCy 모델 로드 성공")
            except OSError:
                logger.warning("영어 spaCy 모델을 찾을 수 없습니다")
        
        if NLTK_AVAILABLE:
            try:
                nltk.download('punkt', quiet=True)
                nltk.download('stopwords', quiet=True)
                nltk.download('wordnet', quiet=True)
                nltk.download('averaged_perceptron_tagger', quiet=True)
                nltk.download('maxent_ne_chunker', quiet=True)
                nltk.download('words', quiet=True)
                self.stemmer = PorterStemmer()
                self.lemmatizer = WordNetLemmatizer()
                logger.info("NLTK 리소스 로드 성공")
            except Exception as e:
                logger.warning(f"NLTK 초기화 실패: {e}")
        
        if TRANSFORMERS_AVAILABLE:
            try:
                self.sentiment_analyzer = pipeline("sentiment-analysis")
                self.summarizer = pipeline("summarization")
                logger.info("Transformers 모델 로드 성공")
            except Exception as e:
                logger.warning(f"Transformers 초기화 실패: {e}")
    
    @measure_performance
    def analyze_text(self, text: str, config: Optional[TextCleaningConfig] = None) -> TextAnalysisResult:
        """종합 텍스트 분석"""
        if not text or not text.strip():
            raise TextAnalysisError("분석할 텍스트가 없습니다")
        
        # 캐시 확인
        cache_key = self._generate_cache_key(text, config)
        cached_result = self._get_from_cache(cache_key)
        if cached_result:
            return cached_result
        
        # 정제 설정
        if config is None:
            config = TextCleaningConfig()
        
        original_text = text
        normalized_text = self.normalizer.normalize_text(text, config)
        
        # 언어 감지
        language_info = self.language_detector.detect_language(text)
        
        # 메트릭 계산
        metrics = self._calculate_metrics(normalized_text)
        
        # 키워드 추출
        keywords = self._extract_keywords(normalized_text, language_info.language)
        
        # 개체명 인식
        entities = self._extract_entities(normalized_text, language_info.language)
        
        # 감정 분석
        sentiment = self._analyze_sentiment(normalized_text)
        
        # 카테고리 분류
        category = self._classify_category(normalized_text, keywords)
        
        # 요약 생성 (긴 텍스트의 경우)
        summary = None
        if len(normalized_text) > 1000:
            summary = self._generate_summary(normalized_text)
        
        # 품질 점수 계산
        quality_score = self._calculate_quality_score(metrics, keywords, entities)
        
        # 가독성 수준 결정
        readability_level = self._determine_readability_level(metrics.readability_score)
        
        result = TextAnalysisResult(
            text=original_text,
            language_info=language_info,
            metrics=metrics,
            keywords=keywords,
            entities=entities,
            sentiment=sentiment,
            category=category,
            summary=summary,
            quality_score=quality_score,
            readability_level=readability_level
        )
        
        # 캐시에 저장
        self._save_to_cache(cache_key, result)
        
        return result
    
    def _calculate_metrics(self, text: str) -> TextMetrics:
        """텍스트 메트릭 계산"""
        if not text:
            return TextMetrics()
        
        # 기본 카운트
        char_count = len(text)
        words = text.split()
        word_count = len(words)
        
        # 문장 분할
        sentences = self._split_sentences(text)
        sentence_count = len(sentences)
        
        # 단락 분할
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        paragraph_count = len(paragraphs)
        
        # 평균 계산
        avg_word_length = sum(len(word) for word in words) / word_count if word_count > 0 else 0
        avg_sentence_length = word_count / sentence_count if sentence_count > 0 else 0
        
        # 고유 단어 수
        unique_words = len(set(word.lower() for word in words))
        
        # 어휘 풍부도 (Type-Token Ratio)
        vocabulary_richness = unique_words / word_count if word_count > 0 else 0
        
        # 가독성 점수 (Flesch Reading Ease 근사)
        readability_score = self._calculate_readability_score(avg_sentence_length, avg_word_length)
        
        # 복잡도 점수
        complexity_score = self._calculate_complexity_score(text, avg_sentence_length)
        
        return TextMetrics(
            char_count=char_count,
            word_count=word_count,
            sentence_count=sentence_count,
            paragraph_count=paragraph_count,
            avg_word_length=avg_word_length,
            avg_sentence_length=avg_sentence_length,
            readability_score=readability_score,
            complexity_score=complexity_score,
            unique_words=unique_words,
            vocabulary_richness=vocabulary_richness
        )
    
    def _extract_keywords(self, text: str, language: Language) -> List[KeyWord]:
        """키워드 추출"""
        if not text:
            return []
        
        try:
            # TF-IDF 기반 키워드 추출
            if SKLEARN_AVAILABLE:
                return self._extract_keywords_tfidf(text)
            else:
                return self._extract_keywords_frequency(text, language)
        except Exception as e:
            logger.warning(f"키워드 추출 실패: {e}")
            return self._extract_keywords_frequency(text, language)
    
    def _extract_keywords_tfidf(self, text: str) -> List[KeyWord]:
        """TF-IDF 기반 키워드 추출"""
        try:
            # 문장 단위로 분할
            sentences = self._split_sentences(text)
            if len(sentences) < 2:
                return self._extract_keywords_frequency(text, Language.AUTO)
            
            vectorizer = TfidfVectorizer(
                max_features=50,
                stop_words='english' if self._is_english_text(text) else None,
                ngram_range=(1, 2),
                min_df=1,
                max_df=0.8
            )
            
            tfidf_matrix = vectorizer.fit_transform(sentences)
            feature_names = vectorizer.get_feature_names_out()
            
            # 평균 TF-IDF 점수 계산
            mean_scores = tfidf_matrix.mean(axis=0).A1
            
            keywords = []
            for i, (word, score) in enumerate(zip(feature_names, mean_scores)):
                if score > 0:
                    keywords.append(KeyWord(
                        word=word,
                        frequency=self._count_word_frequency(text, word),
                        importance=float(score),
                        position=self._find_word_positions(text, word),
                        context=self._extract_word_context(text, word)
                    ))
            
            # 중요도 순으로 정렬
            keywords.sort(key=lambda x: x.importance, reverse=True)
            return keywords[:20]  # 상위 20개만 반환
            
        except Exception as e:
            logger.warning(f"TF-IDF 키워드 추출 실패: {e}")
            return []
    
    def _extract_keywords_frequency(self, text: str, language: Language) -> List[KeyWord]:
        """빈도 기반 키워드 추출"""
        words = re.findall(r'\b\w+\b', text.lower())
        
        # 불용어 제거
        stop_words = self._get_stop_words(language)
        words = [word for word in words if word not in stop_words and len(word) > 2]
        
        # 빈도 계산
        word_freq = Counter(words)
        
        keywords = []
        for word, freq in word_freq.most_common(20):
            keywords.append(KeyWord(
                word=word,
                frequency=freq,
                importance=freq / len(words),  # 상대 빈도
                position=self._find_word_positions(text, word),
                context=self._extract_word_context(text, word)
            ))
        
        return keywords
    
    def _extract_entities(self, text: str, language: Language) -> List[NamedEntity]:
        """개체명 인식"""
        entities = []
        
        try:
            # spaCy 사용 (영어)
            if language == Language.ENGLISH and 'en' in self.nlp_models:
                doc = self.nlp_models['en'](text)
                for ent in doc.ents:
                    entities.append(NamedEntity(
                        text=ent.text,
                        label=ent.label_,
                        start=ent.start_char,
                        end=ent.end_char,
                        confidence=0.8  # spaCy는 신뢰도를 직접 제공하지 않음
                    ))
            
            # NLTK 사용 (백업)
            elif NLTK_AVAILABLE:
                entities.extend(self._extract_entities_nltk(text))
            
            # 정규식 기반 패턴 매칭
            entities.extend(self._extract_entities_regex(text))
            
        except Exception as e:
            logger.warning(f"개체명 인식 실패: {e}")
        
        return entities
    
    def _extract_entities_nltk(self, text: str) -> List[NamedEntity]:
        """NLTK 기반 개체명 인식"""
        try:
            tokens = word_tokenize(text)
            pos_tags = pos_tag(tokens)
            chunks = ne_chunk(pos_tags, binary=False)
            
            entities = []
            current_entity = []
            current_label = None
            start_pos = 0
            
            for i, chunk in enumerate(chunks):
                if hasattr(chunk, 'label'):
                    if current_label != chunk.label():
                        if current_entity:
                            entity_text = ' '.join(current_entity)
                            entities.append(NamedEntity(
                                text=entity_text,
                                label=current_label,
                                start=start_pos,
                                end=start_pos + len(entity_text),
                                confidence=0.7
                            ))
                        current_entity = [chunk[0][0]]
                        current_label = chunk.label()
                        start_pos = text.find(chunk[0][0], start_pos)
                    else:
                        current_entity.append(chunk[0][0])
                else:
                    if current_entity:
                        entity_text = ' '.join(current_entity)
                        entities.append(NamedEntity(
                            text=entity_text,
                            label=current_label,
                            start=start_pos,
                            end=start_pos + len(entity_text),
                            confidence=0.7
                        ))
                        current_entity = []
                        current_label = None
            
            return entities
            
        except Exception as e:
            logger.warning(f"NLTK 개체명 인식 실패: {e}")
            return []
    
    def _extract_entities_regex(self, text: str) -> List[NamedEntity]:
        """정규식 기반 개체명 인식"""
        entities = []
        
        patterns = {
            'EMAIL': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            'URL': r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+',
            'PHONE': r'(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',
            'DATE': r'(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})',
            'MONEY': r'\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s?(?:원|달러|유로)',
        }
        
        for label, pattern in patterns.items():
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entities.append(NamedEntity(
                    text=match.group(),
                    label=label,
                    start=match.start(),
                    end=match.end(),
                    confidence=0.9
                ))
        
        return entities
    
    def _analyze_sentiment_rule_based(self, text: str) -> SentimentInfo:
        """규칙 기반 감정 분석"""
        positive_words = {
            'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
            'love', 'like', 'enjoy', 'happy', 'pleased', 'satisfied', 'perfect',
            '좋다', '훌륭하다', '멋지다', '최고', '완벽', '만족', '행복', '기쁘다'
        }
        
        negative_words = {
            'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry',
            'sad', 'disappointed', 'frustrated', 'annoying', 'worst', 'fail',
            '나쁘다', '싫다', '화나다', '실망', '짜증', '최악', '실패', '문제'
        }
        
        words = re.findall(r'\b\w+\b', text.lower())
        
        positive_count = sum(1 for word in words if word in positive_words)
        negative_count = sum(1 for word in words if word in negative_words)
        
        total_sentiment_words = positive_count + negative_count
        
        if total_sentiment_words == 0:
            return SentimentInfo(
                sentiment=SentimentType.NEUTRAL,
                confidence=0.5,
                positive_score=0.5,
                negative_score=0.5,
                neutral_score=1.0
            )
        
        positive_ratio = positive_count / total_sentiment_words
        negative_ratio = negative_count / total_sentiment_words
        
        if positive_ratio > negative_ratio:
            sentiment = SentimentType.POSITIVE
            confidence = positive_ratio
        elif negative_ratio > positive_ratio:
            sentiment = SentimentType.NEGATIVE
            confidence = negative_ratio
        else:
            sentiment = SentimentType.NEUTRAL
            confidence = 0.5
        
        return SentimentInfo(
            sentiment=sentiment,
            confidence=confidence,
            positive_score=positive_ratio,
            negative_score=negative_ratio,
            neutral_score=1.0 - (positive_ratio + negative_ratio)
        )
    
    def _classify_category(self, text: str, keywords: List[KeyWord]) -> TextCategory:
        """텍스트 카테고리 분류"""
        keyword_texts = [kw.word.lower() for kw in keywords]
        
        category_patterns = {
            TextCategory.TECHNICAL: {
                'api', 'code', 'programming', 'software', 'algorithm', 'data',
                'system', 'database', 'server', 'network', 'security', 'development'
            },
            TextCategory.BUSINESS: {
                'business', 'company', 'market', 'sales', 'revenue', 'profit',
                'customer', 'strategy', 'management', 'finance', 'investment'
            },
            TextCategory.ACADEMIC: {
                'research', 'study', 'analysis', 'theory', 'method', 'result',
                'conclusion', 'abstract', 'literature', 'hypothesis', 'experiment'
            },
            TextCategory.NEWS: {
                'news', 'report', 'breaking', 'update', 'announced', 'confirmed',
                'according', 'source', 'government', 'official', 'statement'
            },
            TextCategory.SOCIAL: {
                'people', 'community', 'social', 'friend', 'family', 'relationship',
                'culture', 'society', 'group', 'public', 'personal'
            }
        }
        
        scores = defaultdict(float)
        
        for category, patterns in category_patterns.items():
            score = sum(1 for kw in keyword_texts if kw in patterns)
            scores[category] = score / len(keyword_texts) if keyword_texts else 0
        
        # 가장 높은 점수의 카테고리 반환
        if scores:
            best_category = max(scores.items(), key=lambda x: x[1])
            return best_category[0] if best_category[1] > 0.1 else TextCategory.CASUAL
        
        return TextCategory.CASUAL
    
    def _generate_summary(self, text: str) -> Optional[TextSummary]:
        """텍스트 요약 생성"""
        try:
            if TRANSFORMERS_AVAILABLE and hasattr(self, 'summarizer'):
                # Transformers 기반 요약
                if len(text) > 1024:
                    text = text[:1024]  # 토큰 제한
                
                summary_result = self.summarizer(text, max_length=150, min_length=50, do_sample=False)
                summary_text = summary_result[0]['summary_text']
                
                return TextSummary(
                    original_length=len(text),
                    summary_length=len(summary_text),
                    compression_ratio=len(summary_text) / len(text),
                    summary_text=summary_text,
                    key_sentences=self._extract_key_sentences(text),
                    key_points=self._extract_key_points(text)
                )
            else:
                # 추출적 요약 (문장 순위 기반)
                return self._generate_extractive_summary(text)
                
        except Exception as e:
            logger.warning(f"요약 생성 실패: {e}")
            return self._generate_extractive_summary(text)
    
    def _generate_extractive_summary(self, text: str) -> TextSummary:
        """추출적 요약 생성"""
        sentences = self._split_sentences(text)
        if len(sentences) <= 3:
            return TextSummary(
                original_length=len(text),
                summary_length=len(text),
                compression_ratio=1.0,
                summary_text=text,
                key_sentences=sentences,
                key_points=sentences
            )
        
        # 문장 점수 계산 (간단한 방법)
        word_freq = Counter(re.findall(r'\b\w+\b', text.lower()))
        sentence_scores = []
        
        for sentence in sentences:
            words = re.findall(r'\b\w+\b', sentence.lower())
            score = sum(word_freq[word] for word in words) / len(words) if words else 0
            sentence_scores.append((sentence, score))
        
        # 상위 점수 문장들 선택
        sentence_scores.sort(key=lambda x: x[1], reverse=True)
        top_sentences = sentence_scores[:max(3, len(sentences) // 3)]
        
        # 원본 순서대로 정렬
        summary_sentences = []
        for sentence in sentences:
            if any(sentence == s[0] for s in top_sentences):
                summary_sentences.append(sentence)
        
        summary_text = ' '.join(summary_sentences)
        
        return TextSummary(
            original_length=len(text),
            summary_length=len(summary_text),
            compression_ratio=len(summary_text) / len(text),
            summary_text=summary_text,
            key_sentences=summary_sentences,
            key_points=summary_sentences[:3]
        )
    
    def _calculate_quality_score(self, metrics: TextMetrics, keywords: List[KeyWord], entities: List[NamedEntity]) -> float:
        """텍스트 품질 점수 계산"""
        score = 0.0
        
        # 어휘 풍부도 (0-30점)
        score += min(metrics.vocabulary_richness * 30, 30)
        
        # 문장 길이 적절성 (0-20점)
        ideal_sentence_length = 15
        length_penalty = abs(metrics.avg_sentence_length - ideal_sentence_length) / ideal_sentence_length
        score += max(0, 20 - length_penalty * 20)
        
        # 키워드 다양성 (0-25점)
        if keywords:
            keyword_diversity = len(set(kw.word for kw in keywords)) / len(keywords)
            score += keyword_diversity * 25
        
        # 개체명 존재 (0-15점)
        if entities:
            score += min(len(entities) * 3, 15)
        
        # 가독성 (0-10점)
        if metrics.readability_score > 0:
            score += min(metrics.readability_score / 10, 10)
        
        return min(score, 100.0)
    
    def _calculate_readability_score(self, avg_sentence_length: float, avg_word_length: float) -> float:
        """가독성 점수 계산 (Flesch Reading Ease 근사)"""
        if avg_sentence_length == 0 or avg_word_length == 0:
            return 0.0
        
        # 간단한 공식 (실제 Flesch 공식은 음절 수를 사용)
        score = 206.835 - (1.015 * avg_sentence_length) - (84.6 * avg_word_length)
        return max(0, min(score, 100))
    
    def _calculate_complexity_score(self, text: str, avg_sentence_length: float) -> float:
        """복잡도 점수 계산"""
        complexity = 0.0
        
        # 문장 길이 기반
        complexity += min(avg_sentence_length / 20, 1.0) * 30
        
        # 특수 구두점 사용
        special_chars = len(re.findall(r'[;:(){}[\]"]', text))
        complexity += min(special_chars / len(text) * 100, 1.0) * 20
        
        # 긴 단어 비율
        words = text.split()
        long_words = sum(1 for word in words if len(word) > 6)
        if words:
            complexity += (long_words / len(words)) * 50
        
        return min(complexity, 100.0)
    
    def _determine_readability_level(self, readability_score: float) -> str:
        """가독성 수준 결정"""
        if readability_score >= 90:
            return "매우 쉬움"
        elif readability_score >= 80:
            return "쉬움"
        elif readability_score >= 70:
            return "보통"
        elif readability_score >= 60:
            return "어려움"
        else:
            return "매우 어려움"
    
    def _split_sentences(self, text: str) -> List[str]:
        """문장 분할"""
        if NLTK_AVAILABLE:
            try:
                return sent_tokenize(text)
            except:
                pass
        
        # 간단한 문장 분할
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _is_english_text(self, text: str) -> bool:
        """영어 텍스트 여부 확인"""
        english_chars = len(re.findall(r'[a-zA-Z]', text))
        return english_chars / len(text) > 0.7 if text else False
    
    def _get_stop_words(self, language: Language) -> Set[str]:
        """불용어 목록 반환"""
        stop_words_dict = {
            Language.ENGLISH: {
                'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
                'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
                'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
            },
            Language.KOREAN: {
                '그리고', '하지만', '그러나', '또한', '이것', '저것', '어떤', '같은',
                '다른', '있다', '없다', '되다', '하다', '이다', '아니다', '그다',
                '이런', '저런', '그런', '어떤', '무슨', '어느', '모든'
            }
        }
        
        if NLTK_AVAILABLE and language == Language.ENGLISH:
            try:
                return set(stopwords.words('english'))
            except:
                pass
        
        return stop_words_dict.get(language, set())
    
    def _count_word_frequency(self, text: str, word: str) -> int:
        """단어 빈도 계산"""
        return len(re.findall(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE))
    
    def _find_word_positions(self, text: str, word: str) -> List[int]:
        """단어 위치 찾기"""
        positions = []
        pattern = r'\b' + re.escape(word) + r'\b'
        for match in re.finditer(pattern, text, re.IGNORECASE):
            positions.append(match.start())
        return positions
    
    def _extract_word_context(self, text: str, word: str, window: int = 30) -> List[str]:
        """단어 주변 문맥 추출"""
        contexts = []
        positions = self._find_word_positions(text, word)
        
        for pos in positions[:3]:  # 최대 3개 문맥만
            start = max(0, pos - window)
            end = min(len(text), pos + len(word) + window)
            context = text[start:end].strip()
            if context:
                contexts.append(context)
        
        return contexts
    
    def _extract_key_sentences(self, text: str) -> List[str]:
        """핵심 문장 추출"""
        sentences = self._split_sentences(text)
        if len(sentences) <= 3:
            return sentences
        
        # 첫 문장과 마지막 문장은 보통 중요
        key_sentences = [sentences[0]]
        if len(sentences) > 1:
            key_sentences.append(sentences[-1])
        
        # 중간에서 가장 긴 문장 추가
        if len(sentences) > 2:
            middle_sentences = sentences[1:-1]
            longest = max(middle_sentences, key=len)
            key_sentences.insert(1, longest)
        
        return key_sentences
    
    def _extract_key_points(self, text: str) -> List[str]:
        """핵심 포인트 추출"""
        # 간단히 핵심 문장과 동일하게 처리
        return self._extract_key_sentences(text)
    
    def _generate_cache_key(self, text: str, config: Optional[TextCleaningConfig]) -> str:
        """캐시 키 생성"""
        config_str = str(config) if config else "default"
        return hashlib.md5((text + config_str).encode()).hexdigest()
    
    def _get_from_cache(self, key: str) -> Optional[TextAnalysisResult]:
        """캐시에서 결과 가져오기"""
        with self._cache_lock:
            return self._analysis_cache.get(key)
    
    def _save_to_cache(self, key: str, result: TextAnalysisResult) -> None:
        """캐시에 결과 저장"""
        with self._cache_lock:
            if len(self._analysis_cache) >= self.cache_size:
                # 오래된 항목 제거 (간단한 구현)
                oldest_key = next(iter(self._analysis_cache))
                del self._analysis_cache[oldest_key]
            
            self._analysis_cache[key] = result


class TextSimilarityCalculator:
    """텍스트 유사도 계산기"""
    
    def __init__(self):
        self.vectorizer = None
        if SKLEARN_AVAILABLE:
            self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
    
    @measure_performance
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """두 텍스트 간 유사도 계산"""
        if not text1 or not text2:
            return 0.0
        
        if self.vectorizer and SKLEARN_AVAILABLE:
            return self._calculate_cosine_similarity(text1, text2)
        else:
            return self._calculate_jaccard_similarity(text1, text2)
    
    def _calculate_cosine_similarity(self, text1: str, text2: str) -> float:
        """코사인 유사도 계산"""
        try:
            tfidf_matrix = self.vectorizer.fit_transform([text1, text2])
            similarity_matrix = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])
            return float(similarity_matrix[0][0])
        except Exception as e:
            logger.warning(f"코사인 유사도 계산 실패: {e}")
            return self._calculate_jaccard_similarity(text1, text2)
    
    def _calculate_jaccard_similarity(self, text1: str, text2: str) -> float:
        """자카드 유사도 계산"""
        words1 = set(re.findall(r'\b\w+\b', text1.lower()))
        words2 = set(re.findall(r'\b\w+\b', text2.lower()))
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0
    
    def find_similar_texts(self, target_text: str, text_corpus: List[str], threshold: float = 0.5) -> List[Tuple[int, float]]:
        """유사한 텍스트 찾기"""
        similar_texts = []
        
        for i, text in enumerate(text_corpus):
            similarity = self.calculate_similarity(target_text, text)
            if similarity >= threshold:
                similar_texts.append((i, similarity))
        
        return sorted(similar_texts, key=lambda x: x[1], reverse=True)


class TextClustering:
    """텍스트 클러스터링"""
    
    def __init__(self, n_clusters: int = 5):
        self.n_clusters = n_clusters
        self.vectorizer = None
        self.kmeans = None
        
        if SKLEARN_AVAILABLE:
            self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
            self.kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    
    @measure_performance
    def cluster_texts(self, texts: List[str]) -> Dict[int, List[int]]:
        """텍스트 클러스터링"""
        if not SKLEARN_AVAILABLE or len(texts) < self.n_clusters:
            return {0: list(range(len(texts)))}
        
        try:
            # TF-IDF 벡터화
            tfidf_matrix = self.vectorizer.fit_transform(texts)
            
            # K-means 클러스터링
            cluster_labels = self.kmeans.fit_predict(tfidf_matrix)
            
            # 클러스터별 텍스트 인덱스 그룹화
            clusters = defaultdict(list)
            for i, label in enumerate(cluster_labels):
                clusters[int(label)].append(i)
            
            return dict(clusters)
            
        except Exception as e:
            logger.error(f"텍스트 클러스터링 실패: {e}")
            return {0: list(range(len(texts)))}
    
    def get_cluster_keywords(self, texts: List[str], clusters: Dict[int, List[int]]) -> Dict[int, List[str]]:
        """클러스터별 대표 키워드 추출"""
        cluster_keywords = {}
        
        for cluster_id, text_indices in clusters.items():
            cluster_texts = [texts[i] for i in text_indices]
            combined_text = ' '.join(cluster_texts)
            
            # 간단한 키워드 추출
            words = re.findall(r'\b\w+\b', combined_text.lower())
            word_freq = Counter(words)
            top_words = [word for word, count in word_freq.most_common(10)]
            
            cluster_keywords[cluster_id] = top_words
        
        return cluster_keywords


class EnhancedStringUtils:
    """고도화된 문자열 유틸리티"""
    
    def __init__(self):
        self.text_analyzer = TextAnalyzer()
        self.similarity_calculator = TextSimilarityCalculator()
        self.normalizer = TextNormalizer()
    
    @staticmethod
    @lru_cache(maxsize=1000)
    def sanitize_search_query(query: str) -> str:
        """검색 쿼리 문자열 정리 (캐시 적용)"""
        if not query:
            return ""
        
        # 특수 문자 제거 및 공백 정리
        sanitized = re.sub(r'[^\w\s가-힣]', ' ', query)
        sanitized = re.sub(r'\s+', ' ', sanitized)
        return sanitized.strip()
    
    @staticmethod
    def smart_truncate(text: str, max_length: int, suffix: str = "...", 
                      preserve_words: bool = True) -> str:
        """스마트 텍스트 자르기"""
        if not text or len(text) <= max_length:
            return text
        
        if max_length <= len(suffix):
            return suffix[:max_length]
        
        if preserve_words:
            # 단어 경계에서 자르기
            truncated = text[:max_length - len(suffix)]
            last_space = truncated.rfind(' ')
            if last_space > 0:
                truncated = truncated[:last_space]
            return truncated + suffix
        else:
            return text[:max_length - len(suffix)] + suffix
    
    @staticmethod
    def normalize_whitespace(text: str) -> str:
        """공백 문자 정규화"""
        if not text:
            return ""
        return re.sub(r'\s+', ' ', text).strip()
    
    def extract_smart_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """스마트 키워드 추출"""
        try:
            config = TextCleaningConfig(remove_stopwords=True)
            result = self.text_analyzer.analyze_text(text, config)
            return [kw.word for kw in result.keywords[:max_keywords]]
        except Exception as e:
            logger.warning(f"스마트 키워드 추출 실패: {e}")
            return self.extract_keywords(text)
    
    @staticmethod
    def extract_keywords(text: str, min_length: int = 2) -> List[str]:
        """기본 키워드 추출"""
        if not text:
            return []
        
        # 단어 추출 (한글, 영문, 숫자)
        words = re.findall(r'[가-힣a-zA-Z0-9]+', text)
        
        # 최소 길이 필터링 및 중복 제거
        keywords = list(set(word for word in words if len(word) >= min_length))
        
        return sorted(keywords)
    
    @staticmethod
    def is_empty_or_whitespace(text: str) -> bool:
        """문자열이 비어있거나 공백만 있는지 확인"""
        return not text or text.isspace()
    
    @staticmethod
    def safe_string(value: Any, default: str = "") -> str:
        """안전한 문자열 변환"""
        if value is None:
            return default
        
        try:
            return str(value)
        except (TypeError, ValueError):
            return default
    
    def calculate_text_similarity(self, text1: str, text2: str) -> float:
        """텍스트 유사도 계산"""
        return self.similarity_calculator.calculate_similarity(text1, text2)
    
    def clean_text(self, text: str, config: Optional[TextCleaningConfig] = None) -> str:
        """텍스트 정제"""
        if config is None:
            config = TextCleaningConfig()
        return self.normalizer.normalize_text(text, config)
    
    @staticmethod
    def count_words(text: str, language: Language = Language.AUTO) -> int:
        """단어 수 계산"""
        if not text:
            return 0
        
        if language == Language.KOREAN:
            # 한글의 경우 어절 단위로 계산
            return len(text.split())
        else:
            # 영문의 경우 단어 단위로 계산
            words = re.findall(r'\b\w+\b', text)
            return len(words)
    
    @staticmethod
    def estimate_reading_time(text: str, wpm: int = 200) -> int:
        """읽기 시간 추정 (분 단위)"""
        if not text:
            return 0
        
        word_count = len(text.split())
        reading_time = max(1, word_count // wpm)
        return reading_time
    
    def detect_language(self, text: str) -> Language:
        """언어 감지"""
        try:
            language_info = self.text_analyzer.language_detector.detect_language(text)
            return language_info.language
        except Exception:
            return Language.AUTO


# 편의 함수들
def analyze_text(text: str, config: Optional[TextCleaningConfig] = None) -> TextAnalysisResult:
    """텍스트 분석 편의 함수"""
    analyzer = TextAnalyzer()
    return analyzer.analyze_text(text, config)

def extract_keywords(text: str, max_keywords: int = 10) -> List[str]:
    """키워드 추출 편의 함수"""
    utils = EnhancedStringUtils()
    return utils.extract_smart_keywords(text, max_keywords)

def calculate_similarity(text1: str, text2: str) -> float:
    """유사도 계산 편의 함수"""
    calculator = TextSimilarityCalculator()
    return calculator.calculate_similarity(text1, text2)

def clean_text(text: str, remove_urls: bool = True, remove_html: bool = True) -> str:
    """텍스트 정제 편의 함수"""
    config = TextCleaningConfig(remove_urls=remove_urls, remove_html=remove_html)
    normalizer = TextNormalizer()
    return normalizer.normalize_text(text, config)

def detect_language(text: str) -> Language:
    """언어 감지 편의 함수"""
    detector = LanguageDetector()
    language_info = detector.detect_language(text)
    return language_info.language

def cluster_texts(texts: List[str], n_clusters: int = 5) -> Dict[int, List[int]]:
    """텍스트 클러스터링 편의 함수"""
    clustering = TextClustering(n_clusters)
    return clustering.cluster_texts(texts)

# 하위 호환성을 위한 함수들
def sanitize_search_query(query: str) -> str:
    """하위 호환성을 위한 함수"""
    return EnhancedStringUtils.sanitize_search_query(query)

def truncate_string(text: str, max_length: int, suffix: str = "...") -> str:
    """하위 호환성을 위한 함수"""
    return EnhancedStringUtils.smart_truncate(text, max_length, suffix)

def normalize_whitespace(text: str) -> str:
    """하위 호환성을 위한 함수"""
    return EnhancedStringUtils.normalize_whitespace(text)

# 별칭 제공
StringUtils = EnhancedStringUtils
TextUtils = EnhancedStringUtils


# 전역 인스턴스 (싱글톤 패턴)
_global_text_analyzer = None
_global_similarity_calculator = None
_global_string_utils = None

def get_text_analyzer() -> TextAnalyzer:
    """전역 텍스트 분석기 반환"""
    global _global_text_analyzer
    if _global_text_analyzer is None:
        _global_text_analyzer = TextAnalyzer()
    return _global_text_analyzer

def get_similarity_calculator() -> TextSimilarityCalculator:
    """전역 유사도 계산기 반환"""
    global _global_similarity_calculator
    if _global_similarity_calculator is None:
        _global_similarity_calculator = TextSimilarityCalculator()
    return _global_similarity_calculator

def get_string_utils() -> EnhancedStringUtils:
    """전역 문자열 유틸리티 반환"""
    global _global_string_utils
    if _global_string_utils is None:
        _global_string_utils = EnhancedStringUtils()
    return _global_string_utils


# 성능 벤치마킹 함수
def benchmark_text_operations(text: str, iterations: int = 100) -> Dict[str, float]:
    """텍스트 연산 성능 벤치마킹"""
    results = {}
    
    # 언어 감지 벤치마크
    start_time = time.time()
    for _ in range(iterations):
        detect_language(text)
    results['language_detection'] = (time.time() - start_time) / iterations
    
    # 키워드 추출 벤치마크
    start_time = time.time()
    for _ in range(iterations):
        extract_keywords(text)
    results['keyword_extraction'] = (time.time() - start_time) / iterations
    
    # 텍스트 정제 벤치마크
    start_time = time.time()
    for _ in range(iterations):
        clean_text(text)
    results['text_cleaning'] = (time.time() - start_time) / iterations
    
    # 전체 분석 벤치마크
    start_time = time.time()
    for _ in range(min(iterations, 10)):  # 전체 분석은 비용이 높으므로 적게 실행
        analyze_text(text)
    results['full_analysis'] = (time.time() - start_time) / min(iterations, 10)
    
    return results


# 메인 실행부 (테스트 및 예제)
if __name__ == "__main__":
    import argparse
    import sys
    
    def main():
        parser = argparse.ArgumentParser(description='Enhanced Text Analysis Utilities')
        parser.add_argument('--text', '-t', required=True, help='분석할 텍스트')
        parser.add_argument('--operation', '-o', choices=[
            'analyze', 'keywords', 'language', 'similarity', 'clean', 'cluster', 'benchmark'
        ], default='analyze', help='수행할 작업')
        parser.add_argument('--compare', '-c', help='유사도 비교할 두 번째 텍스트')
        parser.add_argument('--output', choices=['json', 'text'], default='text', help='출력 형식')
        parser.add_argument('--max-keywords', type=int, default=10, help='최대 키워드 수')
        parser.add_argument('--clean-config', help='정제 설정 JSON')
        parser.add_argument('--benchmark-iterations', type=int, default=100, help='벤치마크 반복 횟수')
        
        args = parser.parse_args()
        
        try:
            if args.operation == 'analyze':
                # 전체 텍스트 분석
                config = None
                if args.clean_config:
                    import json
                    config_dict = json.loads(args.clean_config)
                    config = TextCleaningConfig(**config_dict)
                
                result = analyze_text(args.text, config)
                
                if args.output == 'json':
                    import json
                    # 데이터클래스를 딕셔너리로 변환
                    result_dict = {
                        'text': result.text,
                        'language': result.language_info.language.value,
                        'language_confidence': result.language_info.confidence,
                        'metrics': {
                            'char_count': result.metrics.char_count,
                            'word_count': result.metrics.word_count,
                            'sentence_count': result.metrics.sentence_count,
                            'readability_score': result.metrics.readability_score,
                            'complexity_score': result.metrics.complexity_score,
                            'vocabulary_richness': result.metrics.vocabulary_richness
                        },
                        'keywords': [kw.word for kw in result.keywords],
                        'sentiment': {
                            'type': result.sentiment.sentiment.value,
                            'confidence': result.sentiment.confidence,
                            'positive_score': result.sentiment.positive_score,
                            'negative_score': result.sentiment.negative_score
                        },
                        'category': result.category.value,
                        'quality_score': result.quality_score,
                        'readability_level': result.readability_level
                    }
                    print(json.dumps(result_dict, ensure_ascii=False, indent=2))
                else:
                    print(f"=== 텍스트 분석 결과 ===")
                    print(f"언어: {result.language_info.language.value} (신뢰도: {result.language_info.confidence:.2f})")
                    print(f"문자 수: {result.metrics.char_count}")
                    print(f"단어 수: {result.metrics.word_count}")
                    print(f"문장 수: {result.metrics.sentence_count}")
                    print(f"가독성 점수: {result.metrics.readability_score:.1f}")
                    print(f"복잡도 점수: {result.metrics.complexity_score:.1f}")
                    print(f"어휘 풍부도: {result.metrics.vocabulary_richness:.3f}")
                    print(f"감정: {result.sentiment.sentiment.value} (신뢰도: {result.sentiment.confidence:.2f})")
                    print(f"카테고리: {result.category.value}")
                    print(f"품질 점수: {result.quality_score:.1f}/100")
                    print(f"가독성 수준: {result.readability_level}")
                    print(f"\n주요 키워드:")
                    for i, kw in enumerate(result.keywords[:args.max_keywords], 1):
                        print(f"  {i}. {kw.word} (빈도: {kw.frequency}, 중요도: {kw.importance:.3f})")
                    
                    if result.entities:
                        print(f"\n개체명:")
                        for entity in result.entities[:5]:
                            print(f"  - {entity.text} ({entity.label})")
                    
                    if result.summary:
                        print(f"\n요약 (압축률: {result.summary.compression_ratio:.1%}):")
                        print(f"  {result.summary.summary_text}")
            
            elif args.operation == 'keywords':
                # 키워드 추출
                keywords = extract_keywords(args.text, args.max_keywords)
                if args.output == 'json':
                    import json
                    print(json.dumps(keywords, ensure_ascii=False))
                else:
                    print("=== 키워드 ===")
                    for i, keyword in enumerate(keywords, 1):
                        print(f"{i}. {keyword}")
            
            elif args.operation == 'language':
                # 언어 감지
                language = detect_language(args.text)
                if args.output == 'json':
                    import json
                    print(json.dumps({'language': language.value}, ensure_ascii=False))
                else:
                    print(f"감지된 언어: {language.value}")
            
            elif args.operation == 'similarity':
                # 유사도 계산
                if not args.compare:
                    print("유사도 계산을 위해서는 --compare 옵션이 필요합니다.", file=sys.stderr)
                    sys.exit(1)
                
                similarity = calculate_similarity(args.text, args.compare)
                if args.output == 'json':
                    import json
                    print(json.dumps({'similarity': similarity}, ensure_ascii=False))
                else:
                    print(f"유사도: {similarity:.3f}")
            
            elif args.operation == 'clean':
                # 텍스트 정제
                config = TextCleaningConfig()
                if args.clean_config:
                    import json
                    config_dict = json.loads(args.clean_config)
                    config = TextCleaningConfig(**config_dict)
                
                cleaned = clean_text(args.text)
                if args.output == 'json':
                    import json
                    print(json.dumps({'original': args.text, 'cleaned': cleaned}, ensure_ascii=False))
                else:
                    print("=== 정제된 텍스트 ===")
                    print(cleaned)
            
            elif args.operation == 'benchmark':
                # 성능 벤치마킹
                results = benchmark_text_operations(args.text, args.benchmark_iterations)
                if args.output == 'json':
                    import json
                    print(json.dumps(results, ensure_ascii=False))
                else:
                    print("=== 성능 벤치마크 결과 ===")
                    for operation, time_taken in results.items():
                        print(f"{operation}: {time_taken*1000:.2f}ms")
        
        except Exception as e:
            print(f"오류 발생: {e}", file=sys.stderr)
            sys.exit(1)
    
    main()


# 추가 유틸리티 클래스들

class TextStatistics:
    """텍스트 통계 분석기"""
    
    @staticmethod
    def calculate_diversity_index(text: str) -> float:
        """어휘 다양성 지수 계산"""
        words = re.findall(r'\b\w+\b', text.lower())
        if not words:
            return 0.0
        
        unique_words = len(set(words))
        total_words = len(words)
        
        return unique_words / total_words
    
    @staticmethod
    def calculate_lexical_density(text: str) -> float:
        """어휘 밀도 계산 (내용어 비율)"""
        words = re.findall(r'\b\w+\b', text.lower())
        if not words:
            return 0.0
        
        # 간단한 내용어 패턴 (실제로는 더 정교한 POS 태깅 필요)
        content_words = [w for w in words if len(w) > 3]  # 3글자 이상
        
        return len(content_words) / len(words)
    
    @staticmethod
    def calculate_sentence_variety(text: str) -> Dict[str, int]:
        """문장 유형 다양성 분석"""
        sentences = re.split(r'[.!?]+', text)
        sentence_types = {
            'declarative': 0,  # 평서문
            'interrogative': 0,  # 의문문
            'exclamatory': 0,  # 감탄문
            'imperative': 0   # 명령문
        }
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            if sentence.endswith('?'):
                sentence_types['interrogative'] += 1
            elif sentence.endswith('!'):
                sentence_types['exclamatory'] += 1
            elif any(word in sentence.lower() for word in ['please', '해라', '하세요', '하라']):
                sentence_types['imperative'] += 1
            else:
                sentence_types['declarative'] += 1
        
        return sentence_types


class TextFormatter:
    """텍스트 포맷터"""
    
    @staticmethod
    def format_for_display(text: str, max_width: int = 80) -> str:
        """디스플레이용 텍스트 포맷팅"""
        import textwrap
        return textwrap.fill(text, width=max_width)
    
    @staticmethod
    def format_as_markdown(text: str, title: Optional[str] = None) -> str:
        """마크다운 형식으로 포맷팅"""
        lines = []
        
        if title:
            lines.append(f"# {title}")
            lines.append("")
        
        paragraphs = text.split('\n\n')
        for paragraph in paragraphs:
            lines.append(paragraph.strip())
            lines.append("")
        
        return '\n'.join(lines)
    
    @staticmethod
    def format_as_html(text: str, title: Optional[str] = None) -> str:
        """HTML 형식으로 포맷팅"""
        html_lines = ["<!DOCTYPE html>", "<html>", "<head>"]
        
        if title:
            html_lines.append(f"<title>{title}</title>")
        
        html_lines.extend([
            "</head>",
            "<body>",
            f"<div>{text.replace(chr(10), '<br>')}</div>",
            "</body>",
            "</html>"
        ])
        
        return '\n'.join(html_lines)


class MultilingualTextProcessor:
    """다국어 텍스트 처리기"""
    
    def __init__(self):
        self.language_patterns = {
            Language.KOREAN: {
                'josa': re.compile(r'[이가을를에서의로와과]'),
                'honorific': re.compile(r'[습니요세요시네다]')
            },
            Language.JAPANESE: {
                'particles': re.compile(r'[はがをにでと]'),
                'polite': re.compile(r'[ますですでした]')
            },
            Language.ENGLISH: {
                'articles': re.compile(r'\b(a|an|the)\b'),
                'contractions': re.compile(r"['\u2019]([a-z]{1,3})\b"),
            }
        }
    
    def analyze_linguistic_features(self, text: str, language: Language) -> Dict[str, Any]:
        """언어별 특성 분석"""
        features = {}
        
        if language in self.language_patterns:
            patterns = self.language_patterns[language]
            
            for feature_name, pattern in patterns.items():
                matches = pattern.findall(text)
                features[feature_name] = {
                    'count': len(matches),
                    'examples': list(set(matches))[:5]  # 최대 5개 예시
                }
        
        return features
    
    def normalize_by_language(self, text: str, language: Language) -> str:
        """언어별 특화 정규화"""
        if language == Language.KOREAN:
            return self._normalize_korean(text)
        elif language == Language.JAPANESE:
            return self._normalize_japanese(text)
        elif language == Language.ENGLISH:
            return self._normalize_english(text)
        else:
            return text
    
    def _normalize_korean(self, text: str) -> str:
        """한국어 정규화"""
        # 된소리 정규화
        text = text.replace('ㄲ', 'ㄱㄱ').replace('ㄸ', 'ㄷㄷ')
        text = text.replace('ㅃ', 'ㅂㅂ').replace('ㅆ', 'ㅅㅅ').replace('ㅉ', 'ㅈㅈ')
        
        # 겹받침 정규화
        text = text.replace('ㄳ', 'ㄱㅅ').replace('ㄵ', 'ㄴㅈ').replace('ㄶ', 'ㄴㅎ')
        text = text.replace('ㄺ', 'ㄹㄱ').replace('ㄻ', 'ㄹㅁ').replace('ㄼ', 'ㄹㅂ')
        text = text.replace('ㄽ', 'ㄹㅅ').replace('ㄾ', 'ㄹㅌ').replace('ㄿ', 'ㄹㅍ')
        text = text.replace('ㅀ', 'ㄹㅎ').replace('ㅄ', 'ㅂㅅ')
        
        return text
    
    def _normalize_japanese(self, text: str) -> str:
        """일본어 정규화"""
        # 히라가나-가타카나 변환은 복잡하므로 기본적인 정규화만
        return unicodedata.normalize('NFKC', text)
    
    def _normalize_english(self, text: str) -> str:
        """영어 정규화"""
        # 축약형 확장
        contractions = {
            "n't": " not",
            "'re": " are",
            "'ve": " have",
            "'ll": " will",
            "'d": " would",
            "'m": " am"
        }
        
        for contraction, expansion in contractions.items():
            text = text.replace(contraction, expansion)
        
        return text


# 최종 통합 클래스
class UltimateTextProcessor:
    """최종 통합 텍스트 처리기"""
    
    def __init__(self):
        self.analyzer = TextAnalyzer()
        self.similarity_calculator = TextSimilarityCalculator()
        self.clustering = TextClustering()
        self.formatter = TextFormatter()
        self.multilingual_processor = MultilingualTextProcessor()
        self.statistics = TextStatistics()
    
    def process_comprehensive(self, text: str, 
                            config: Optional[TextCleaningConfig] = None) -> Dict[str, Any]:
        """종합적인 텍스트 처리"""
        # 기본 분석
        analysis_result = self.analyzer.analyze_text(text, config)
        
        # 통계 정보
        diversity_index = self.statistics.calculate_diversity_index(text)
        lexical_density = self.statistics.calculate_lexical_density(text)
        sentence_variety = self.statistics.calculate_sentence_variety(text)
        
        # 언어별 특성
        linguistic_features = self.multilingual_processor.analyze_linguistic_features(
            text, analysis_result.language_info.language
        )
        
        return {
            'basic_analysis': analysis_result,
            'statistics': {
                'diversity_index': diversity_index,
                'lexical_density': lexical_density,
                'sentence_variety': sentence_variety
            },
            'linguistic_features': linguistic_features,
            'processing_timestamp': time.time()
        }


# 사용 예제 및 테스트 데이터
SAMPLE_TEXTS = {
    'english': "This is a comprehensive text analysis utility that provides advanced natural language processing capabilities. It can detect languages, extract keywords, analyze sentiment, and much more.",
    'korean': "이것은 고도화된 텍스트 분석 유틸리티입니다. 자연어 처리 기능을 제공하며, 언어 감지, 키워드 추출, 감정 분석 등 다양한 기능을 포함하고 있습니다.",
    'technical': "The algorithm implements a TF-IDF vectorization approach combined with cosine similarity metrics to calculate text similarity scores. Performance optimization includes caching mechanisms and parallel processing capabilities.",
    'casual': "Hey there! How's it going? I'm having a great day and wanted to share some exciting news with everyone. Hope you're all doing well! 😊"
}


def run_comprehensive_example():
    """종합적인 사용 예제"""
    processor = UltimateTextProcessor()
    
    print("=== 고도화된 텍스트 분석 예제 ===\n")
    
    for text_type, sample_text in SAMPLE_TEXTS.items():
        print(f"--- {text_type.upper()} 텍스트 분석 ---")
        
        try:
            result = processor.process_comprehensive(sample_text)
            analysis = result['basic_analysis']
            stats = result['statistics']
            
            print(f"언어: {analysis.language_info.language.value}")
            print(f"감정: {analysis.sentiment.sentiment.value} ({analysis.sentiment.confidence:.2f})")
            print(f"카테고리: {analysis.category.value}")
            print(f"품질 점수: {analysis.quality_score:.1f}/100")
            print(f"어휘 다양성: {stats['diversity_index']:.3f}")
            print(f"어휘 밀도: {stats['lexical_density']:.3f}")
            print(f"주요 키워드: {', '.join([kw.word for kw in analysis.keywords[:5]])}")
            print()
            
        except Exception as e:
            print(f"분석 실패: {e}")
            print()


if __name__ == "__main__":
    # 예제 실행 (스크립트로 직접 실행 시)
    if len(sys.argv) == 1:
        run_comprehensive_example()
    else:
        main()