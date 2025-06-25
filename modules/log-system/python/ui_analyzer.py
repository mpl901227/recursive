"""
UI 스크린샷 분석 모듈
스크린샷을 촬영하고 LLM을 통해 UI 요소를 분석하는 기능을 제공합니다.
"""

import asyncio
import base64
import json
import os
import tempfile
from datetime import datetime
from typing import Dict, Any, Optional, List
import aiohttp
import logging
from playwright.async_api import async_playwright

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UIAnalyzer:
    """UI 스크린샷 분석기"""
    
    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None
        self.session = None
        
        # LLM 설정
        self.anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        
        # 기본 설정
        self.default_viewport = {'width': 1920, 'height': 1080}
        self.default_timeout = 30000
        
    async def initialize(self):
        """브라우저 및 HTTP 세션 초기화"""
        try:
            # Playwright 브라우저 시작
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage']
            )
            self.context = await self.browser.new_context(
                viewport=self.default_viewport,
                ignore_https_errors=True
            )
            self.page = await self.context.new_page()
            
            # HTTP 세션 초기화
            self.session = aiohttp.ClientSession()
            
            logger.info("[UI-ANALYZER] Initialized successfully")
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Failed to initialize: {e}")
            raise
    
    async def cleanup(self):
        """리소스 정리"""
        try:
            if self.page:
                await self.page.close()
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            if self.session:
                await self.session.close()
            logger.info("[UI-ANALYZER] Cleaned up successfully")
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Cleanup error: {e}")
    
    async def analyze_ui(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        UI 분석 메인 함수
        
        Args:
            params: {
                'query': str,           # 분석 질문
                'url': str,             # 대상 URL (기본: http://localhost:3001)
                'action': str,          # 분석 유형 (screenshot, element, measure, interact, navigate)
                'selector': str,        # CSS 셀렉터 (선택사항)
                'wait_for': str,        # 대기할 셀렉터 (선택사항)
                'full_page': bool,      # 전체 페이지 스크린샷 여부
                'model': str,          # 사용할 LLM 모델
                'wait_time': int,      # 추가 대기 시간 (ms)
                'wait_for_network': bool, # 네트워크 요청 완료 대기
                'multiple_selectors': List[str], # 여러 셀렉터 대기
                'interactions': List[Dict], # 상호작용 시퀀스
                'navigation_path': List[str], # 네비게이션 경로
                'smart_navigation': bool, # 스마트 네비게이션 활성화
                'fallback_urls': List[str] # 대체 URL 목록
            }
        
        Returns:
            분석 결과 딕셔너리
        """
        try:
            # 파라미터 추출
            query = params.get('query', '이 UI에 대해 설명해주세요')
            url = params.get('url', 'http://localhost:3001')
            action = params.get('action', 'screenshot')
            selector = params.get('selector')
            wait_for = params.get('wait_for')
            full_page = params.get('full_page', False)
            model = params.get('model', 'claude-3-5-sonnet-20241022')
            wait_time = params.get('wait_time', 0)
            wait_for_network = params.get('wait_for_network', True)
            multiple_selectors = params.get('multiple_selectors', [])
            interactions = params.get('interactions', [])
            navigation_path = params.get('navigation_path', [])
            smart_navigation = params.get('smart_navigation', True)
            fallback_urls = params.get('fallback_urls', [])
            
            logger.info(f"[UI-ANALYZER] Analysis started: {action} - {query}")
            
            # 스마트 URL 처리
            success_url = await self._smart_url_navigation(url, fallback_urls, smart_navigation)
            
            # 페이지 로드 - 네트워크 대기 옵션
            wait_until = 'networkidle' if wait_for_network else 'domcontentloaded'
            await self.page.goto(success_url, wait_until=wait_until, timeout=self.default_timeout)
            
            # 네비게이션 경로 처리 (SPA 라우팅)
            if navigation_path:
                await self._navigate_through_spa(navigation_path)
            
            # 추가 대기 시간
            if wait_time > 0:
                await asyncio.sleep(wait_time / 1000)
            
            # 단일 셀렉터 대기
            if wait_for:
                try:
                    await self.page.wait_for_selector(wait_for, timeout=15000)
                    logger.info(f"[UI-ANALYZER] Found selector: {wait_for}")
                except Exception as e:
                    logger.warning(f"[UI-ANALYZER] Selector not found: {wait_for} - {e}")
            
            # 여러 셀렉터 대기 (하나라도 나타나면 진행)
            if multiple_selectors:
                await self._wait_for_any_selector(multiple_selectors)
            
            # SPA 라우팅 대기 (특별히 로그 뷰어용)
            if '/logs/' in success_url or '#/logs/' in success_url:
                await self._wait_for_spa_navigation()
            
            # 상호작용 시퀀스 수행
            if interactions:
                await self._perform_interaction_sequence(interactions)
            
            # 액션에 따른 처리
            result = {}
            
            if action == 'screenshot':
                result = await self._take_screenshot_and_analyze(query, selector, full_page, model)
            elif action == 'element':
                result = await self._analyze_element(query, selector, model)
            elif action == 'measure':
                result = await self._measure_elements(query, selector)
            elif action == 'interact':
                result = await self._interact_and_analyze(query, selector, model)
            elif action == 'navigate':
                result = await self._navigate_and_analyze(query, navigation_path, model)
            else:
                result = await self._take_screenshot_and_analyze(query, selector, full_page, model)
            
            # 메타데이터 추가
            result['metadata'] = {
                'url': success_url,
                'original_url': url,
                'timestamp': datetime.now().isoformat(),
                'viewport': self.default_viewport,
                'action': action,
                'selector': selector,
                'model': model,
                'interactions_performed': len(interactions),
                'navigation_steps': len(navigation_path),
                'smart_navigation_used': smart_navigation
            }
            
            return result
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Analysis failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def _take_screenshot_and_analyze(self, query: str, selector: str = None, full_page: bool = False, model: str = 'claude-3-5-sonnet-20241022') -> Dict[str, Any]:
        """스크린샷 촬영 및 LLM 분석"""
        try:
            # 스크린샷 촬영
            if selector:
                # 특정 요소만 캡처
                element = await self.page.query_selector(selector)
                if not element:
                    raise Exception(f"Element not found: {selector}")
                screenshot = await element.screenshot()
            else:
                # 전체 페이지 또는 뷰포트 캡처
                screenshot = await self.page.screenshot(full_page=full_page)
            
            # Base64 인코딩
            screenshot_base64 = base64.b64encode(screenshot).decode('utf-8')
            
            # LLM 분석
            analysis = await self._analyze_with_llm(query, screenshot_base64, model)
            
            return {
                'success': True,
                'screenshot_size': len(screenshot),
                'analysis': analysis,
                'query': query
            }
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Screenshot analysis failed: {e}")
            raise
    
    async def _analyze_element(self, query: str, selector: str, model: str) -> Dict[str, Any]:
        """특정 요소 분석"""
        try:
            if not selector:
                raise Exception("Element analysis requires a selector")
            
            # 요소 정보 수집
            element_info = await self.page.evaluate(f"""
                () => {{
                    const element = document.querySelector('{selector}');
                    if (!element) return null;
                    
                    const rect = element.getBoundingClientRect();
                    const styles = window.getComputedStyle(element);
                    
                    return {{
                        tagName: element.tagName,
                        className: element.className,
                        id: element.id,
                        textContent: element.textContent?.slice(0, 200),
                        bounds: {{
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height
                        }},
                        styles: {{
                            display: styles.display,
                            position: styles.position,
                            backgroundColor: styles.backgroundColor,
                            color: styles.color,
                            fontSize: styles.fontSize,
                            fontFamily: styles.fontFamily,
                            margin: styles.margin,
                            padding: styles.padding,
                            border: styles.border
                        }}
                    }};
                }}
            """)
            
            if not element_info:
                raise Exception(f"Element not found: {selector}")
            
            # 요소 스크린샷
            element = await self.page.query_selector(selector)
            screenshot = await element.screenshot()
            screenshot_base64 = base64.b64encode(screenshot).decode('utf-8')
            
            # LLM 분석 (요소 정보 포함)
            enhanced_query = f"{query}\n\n요소 정보:\n{json.dumps(element_info, indent=2, ensure_ascii=False)}"
            analysis = await self._analyze_with_llm(enhanced_query, screenshot_base64, model)
            
            return {
                'success': True,
                'element_info': element_info,
                'analysis': analysis,
                'query': query
            }
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Element analysis failed: {e}")
            raise
    
    async def _measure_elements(self, query: str, selector: str = None) -> Dict[str, Any]:
        """요소 크기 및 위치 측정"""
        try:
            if selector:
                # 특정 요소 측정
                measurements = await self.page.evaluate(f"""
                    () => {{
                        const element = document.querySelector('{selector}');
                        if (!element) return null;
                        
                        const rect = element.getBoundingClientRect();
                        const styles = window.getComputedStyle(element);
                        
                        return {{
                            selector: '{selector}',
                            bounds: {{
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                top: rect.top,
                                right: rect.right,
                                bottom: rect.bottom,
                                left: rect.left
                            }},
                            computed: {{
                                width: styles.width,
                                height: styles.height,
                                marginTop: styles.marginTop,
                                marginRight: styles.marginRight,
                                marginBottom: styles.marginBottom,
                                marginLeft: styles.marginLeft,
                                paddingTop: styles.paddingTop,
                                paddingRight: styles.paddingRight,
                                paddingBottom: styles.paddingBottom,
                                paddingLeft: styles.paddingLeft
                            }}
                        }};
                    }}
                """)
            else:
                # 페이지 전체 측정
                measurements = await self.page.evaluate("""
                    () => {
                        const body = document.body;
                        const html = document.documentElement;
                        
                        return {
                            viewport: {
                                width: window.innerWidth,
                                height: window.innerHeight
                            },
                            document: {
                                width: Math.max(body.scrollWidth, html.scrollWidth),
                                height: Math.max(body.scrollHeight, html.scrollHeight)
                            },
                            scroll: {
                                x: window.scrollX,
                                y: window.scrollY
                            }
                        };
                    }
                """)
            
            return {
                'success': True,
                'measurements': measurements,
                'query': query,
                'type': 'measurement'
            }
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Measurement failed: {e}")
            raise
    
    async def _interact_and_analyze(self, query: str, selector: str, model: str) -> Dict[str, Any]:
        """요소와 상호작용 후 분석 (드롭다운, 메뉴, 모달 등)"""
        try:
            # 상호작용 전 스크린샷
            before_screenshot = await self.page.screenshot()
            before_base64 = base64.b64encode(before_screenshot).decode('utf-8')
            
            interactions_performed = []
            
            if selector:
                element = await self.page.query_selector(selector)
                if element:
                    # 요소 타입에 따른 적절한 상호작용 수행
                    tag_name = await element.evaluate('el => el.tagName.toLowerCase()')
                    element_type = await element.evaluate('el => el.type || ""')
                    class_name = await element.evaluate('el => el.className || ""')
                    
                    # 드롭다운이나 메뉴 감지
                    if any(keyword in class_name.lower() for keyword in ['dropdown', 'menu', 'select', 'accordion']):
                        # 클릭해서 펼치기
                        await element.click()
                        interactions_performed.append('click_to_expand')
                        await asyncio.sleep(1)  # 애니메이션 대기
                        
                        # 펼쳐진 메뉴 요소들 확인
                        await asyncio.sleep(0.5)
                        
                    elif tag_name == 'button' or 'btn' in class_name.lower():
                        # 버튼 클릭
                        await element.click()
                        interactions_performed.append('button_click')
                        await asyncio.sleep(1)
                        
                    elif tag_name == 'select':
                        # 셀렉트 박스 열기
                        await element.click()
                        interactions_performed.append('select_open')
                        await asyncio.sleep(0.5)
                        
                    elif any(keyword in class_name.lower() for keyword in ['tab', 'nav']):
                        # 탭이나 네비게이션 클릭
                        await element.click()
                        interactions_performed.append('navigation_click')
                        await asyncio.sleep(1)
                        
                    else:
                        # 기본: 호버 후 클릭
                        await element.hover()
                        await asyncio.sleep(0.3)
                        await element.click()
                        interactions_performed.extend(['hover', 'click'])
                        await asyncio.sleep(1)
            
            # 상호작용 후 추가 대기 (동적 콘텐츠 로딩)
            await asyncio.sleep(0.5)
            
            # 상호작용 후 스크린샷
            after_screenshot = await self.page.screenshot()
            after_base64 = base64.b64encode(after_screenshot).decode('utf-8')
            
            # LLM 분석 (before/after 비교)
            comparison_query = f"""
{query}

상호작용 분석:
- 수행된 액션: {', '.join(interactions_performed)}
- 대상 요소: {selector}

상호작용 전후 화면을 비교하여 다음을 분석해주세요:
1. 어떤 UI 요소가 나타났거나 사라졌는지
2. 드롭다운이나 메뉴가 펼쳐졌는지
3. 새로운 콘텐츠가 로드되었는지
4. 버튼의 색상이나 상태가 변경되었는지
"""
            analysis = await self._analyze_with_llm(comparison_query, after_base64, model)
            
            return {
                'success': True,
                'before_screenshot_size': len(before_screenshot),
                'after_screenshot_size': len(after_screenshot),
                'analysis': analysis,
                'query': query,
                'interactions_performed': interactions_performed,
                'selector': selector
            }
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Interaction analysis failed: {e}")
            raise
    
    async def _analyze_with_llm(self, query: str, screenshot_base64: str, model: str) -> Dict[str, Any]:
        """LLM을 통한 스크린샷 분석"""
        try:
            if model.startswith('claude'):
                return await self._analyze_with_claude(query, screenshot_base64, model)
            elif model.startswith('gpt'):
                return await self._analyze_with_openai(query, screenshot_base64, model)
            else:
                raise Exception(f"Unsupported model: {model}")
                
        except Exception as e:
            logger.error(f"[UI-ANALYZER] LLM analysis failed: {e}")
            return {
                'error': str(e),
                'fallback_response': f"스크린샷을 성공적으로 촬영했습니다. 질문: {query}"
            }
    
    async def _analyze_with_claude(self, query: str, screenshot_base64: str, model: str) -> Dict[str, Any]:
        """Claude API를 통한 분석"""
        if not self.anthropic_api_key:
            raise Exception("ANTHROPIC_API_KEY not found")
        
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.anthropic_api_key,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01"
        }
        
        payload = {
            "model": model,
            "max_tokens": 2000,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"다음 UI 스크린샷을 분석해주세요:\n\n{query}\n\n구체적이고 정확한 정보를 제공해주세요. 크기, 위치, 색상, 레이아웃 등을 포함해서 답변해주세요."
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": screenshot_base64
                            }
                        }
                    ]
                }
            ]
        }
        
        async with self.session.post(url, headers=headers, json=payload) as response:
            if response.status == 200:
                result = await response.json()
                return {
                    'model': model,
                    'response': result['content'][0]['text'],
                    'usage': result.get('usage', {})
                }
            else:
                error_text = await response.text()
                raise Exception(f"Claude API error {response.status}: {error_text}")
    
    async def _analyze_with_openai(self, query: str, screenshot_base64: str, model: str) -> Dict[str, Any]:
        """OpenAI API를 통한 분석"""
        if not self.openai_api_key:
            raise Exception("OPENAI_API_KEY not found")
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"다음 UI 스크린샷을 분석해주세요:\n\n{query}\n\n구체적이고 정확한 정보를 제공해주세요. 크기, 위치, 색상, 레이아웃 등을 포함해서 답변해주세요."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{screenshot_base64}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 2000
        }
        
        async with self.session.post(url, headers=headers, json=payload) as response:
            if response.status == 200:
                result = await response.json()
                return {
                    'model': model,
                    'response': result['choices'][0]['message']['content'],
                    'usage': result.get('usage', {})
                }
            else:
                error_text = await response.text()
                raise Exception(f"OpenAI API error {response.status}: {error_text}")

    async def _wait_for_any_selector(self, selectors: List[str], timeout: int = 10000):
        """여러 셀렉터 중 하나라도 나타날 때까지 대기"""
        try:
            # 모든 셀렉터에 대해 병렬로 대기
            tasks = [
                self.page.wait_for_selector(selector, timeout=timeout)
                for selector in selectors
            ]
            
            # 첫 번째로 완료되는 것을 기다림
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            
            # 나머지 태스크 취소
            for task in pending:
                task.cancel()
            
            logger.info(f"[UI-ANALYZER] Found one of selectors: {selectors}")
            
        except Exception as e:
            logger.warning(f"[UI-ANALYZER] None of selectors found: {selectors} - {e}")

    async def _wait_for_spa_navigation(self):
        """SPA 네비게이션 완료 대기"""
        try:
            # 일반적인 SPA 로딩 인디케이터들 대기
            spa_selectors = [
                '.log-viewer',
                '.log-viewer__toolbar', 
                '.log-viewer__refresh-btn',
                '[data-component="LogViewer"]',
                '.loading-spinner',
                '.content-loaded'
            ]
            
            await self._wait_for_any_selector(spa_selectors, timeout=8000)
            
            # 추가로 짧은 대기 (렌더링 완료)
            await asyncio.sleep(0.5)
            
        except Exception as e:
            logger.warning(f"[UI-ANALYZER] SPA navigation wait failed: {e}")

    async def _navigate_through_spa(self, navigation_path: List[str]):
        """SPA 네비게이션 경로를 따라 이동"""
        try:
            for step in navigation_path:
                logger.info(f"[UI-ANALYZER] Navigation step: {step}")
                
                if step.startswith('click:'):
                    # 클릭 액션
                    selector = step.replace('click:', '')
                    await self.page.click(selector)
                    await asyncio.sleep(1)  # 네비게이션 대기
                    
                elif step.startswith('hover:'):
                    # 호버 액션
                    selector = step.replace('hover:', '')
                    await self.page.hover(selector)
                    await asyncio.sleep(0.5)
                    
                elif step.startswith('wait:'):
                    # 대기 액션
                    selector = step.replace('wait:', '')
                    await self.page.wait_for_selector(selector, timeout=10000)
                    
                elif step.startswith('url:'):
                    # URL 변경
                    url = step.replace('url:', '')
                    await self.page.goto(url, wait_until='networkidle')
                    
                else:
                    # 기본적으로 클릭 시도
                    await self.page.click(step)
                    await asyncio.sleep(1)
                    
        except Exception as e:
            logger.warning(f"[UI-ANALYZER] Navigation step failed: {e}")

    async def _perform_interaction_sequence(self, interactions: List[Dict]):
        """상호작용 시퀀스 수행"""
        try:
            for interaction in interactions:
                action_type = interaction.get('type', 'click')
                selector = interaction.get('selector')
                value = interaction.get('value')
                wait_after = interaction.get('wait_after', 500)
                
                logger.info(f"[UI-ANALYZER] Performing {action_type} on {selector}")
                
                if action_type == 'click':
                    await self.page.click(selector)
                    
                elif action_type == 'hover':
                    await self.page.hover(selector)
                    
                elif action_type == 'type':
                    await self.page.fill(selector, value)
                    
                elif action_type == 'select':
                    await self.page.select_option(selector, value)
                    
                elif action_type == 'scroll':
                    await self.page.evaluate(f"document.querySelector('{selector}').scrollIntoView()")
                    
                elif action_type == 'wait':
                    await self.page.wait_for_selector(selector, timeout=10000)
                    
                # 액션 후 대기
                await asyncio.sleep(wait_after / 1000)
                
        except Exception as e:
            logger.warning(f"[UI-ANALYZER] Interaction sequence failed: {e}")

    async def _navigate_and_analyze(self, query: str, navigation_path: List[str], model: str) -> Dict[str, Any]:
        """네비게이션 후 분석"""
        try:
            # 네비게이션 전 스크린샷
            before_screenshot = await self.page.screenshot()
            before_base64 = base64.b64encode(before_screenshot).decode('utf-8')
            
            # 네비게이션 수행
            await self._navigate_through_spa(navigation_path)
            
            # 네비게이션 후 스크린샷
            after_screenshot = await self.page.screenshot()
            after_base64 = base64.b64encode(after_screenshot).decode('utf-8')
            
            # LLM 분석
            navigation_query = f"{query}\n\n네비게이션 경로: {' -> '.join(navigation_path)}\n네비게이션 후 화면을 분석해주세요."
            analysis = await self._analyze_with_llm(navigation_query, after_base64, model)
            
            return {
                'success': True,
                'before_screenshot_size': len(before_screenshot),
                'after_screenshot_size': len(after_screenshot),
                'analysis': analysis,
                'query': query,
                'navigation_path': navigation_path
            }
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Navigation analysis failed: {e}")
            raise

    async def _smart_url_navigation(self, base_url: str, fallback_urls: List[str], smart_navigation: bool) -> str:
        """스마트 URL 네비게이션 - SPA 패턴 자동 감지 및 대체 URL 시도"""
        if not smart_navigation:
            return base_url
        
        # 일반적인 SPA 라우팅 패턴들
        spa_patterns = {
            '/logs/viewer': ['/#/logs/viewer', '/#/logs', '/logs#viewer'],
            '/logs/dashboard': ['/#/logs/dashboard', '/#/dashboard'],
            '/logs/search': ['/#/logs/search', '/#/search'],
            '/dashboard': ['/#/dashboard', '/#/'],
            '/analysis': ['/#/analysis', '/#/analyze']
        }
        
        # URL에서 경로 추출
        from urllib.parse import urlparse
        parsed = urlparse(base_url)
        path = parsed.path
        
        # 대체 URL 목록 생성
        urls_to_try = [base_url]
        
        # SPA 패턴 추가
        if path in spa_patterns:
            for pattern in spa_patterns[path]:
                alt_url = f"{parsed.scheme}://{parsed.netloc}{pattern}"
                urls_to_try.append(alt_url)
        
        # 사용자 제공 대체 URL 추가
        urls_to_try.extend(fallback_urls)
        
        # 각 URL 시도
        for url in urls_to_try:
            try:
                logger.info(f"[UI-ANALYZER] Trying URL: {url}")
                await self.page.goto(url, wait_until='domcontentloaded', timeout=10000)
                
                # 페이지가 올바르게 로드되었는지 확인
                if await self._is_page_loaded_correctly(url):
                    logger.info(f"[UI-ANALYZER] Successfully loaded: {url}")
                    return url
                    
            except Exception as e:
                logger.warning(f"[UI-ANALYZER] Failed to load {url}: {e}")
                continue
        
        # 모든 URL이 실패하면 원본 URL 반환
        logger.warning(f"[UI-ANALYZER] All URLs failed, using original: {base_url}")
        return base_url

    async def _is_page_loaded_correctly(self, url: str) -> bool:
        """페이지가 올바르게 로드되었는지 확인"""
        try:
            # 기본 체크: 타이틀이 있고 에러 페이지가 아닌지
            title = await self.page.title()
            if not title or 'error' in title.lower() or '404' in title:
                return False
            
            # URL별 특정 요소 체크
            if 'logs' in url:
                # 로그 관련 페이지라면 로그 뷰어 요소들이 있는지 확인
                log_elements = [
                    '.log-viewer', 
                    '[data-component="LogViewer"]',
                    'button:has-text("Refresh")',
                    'button:has-text("Search")',
                    '.log-container'
                ]
                
                for selector in log_elements:
                    try:
                        await self.page.wait_for_selector(selector, timeout=2000)
                        return True
                    except:
                        continue
            
            # 일반적인 로드 완료 체크
            await self.page.wait_for_load_state('networkidle', timeout=3000)
            return True
            
        except Exception as e:
            logger.warning(f"[UI-ANALYZER] Page load check failed: {e}")
            return False

    async def _fast_element_detection(self, query: str, target_type: str = None) -> Dict[str, Any]:
        """빠른 요소 감지 - 병렬로 여러 전략 시도"""
        logger.info(f"[UI-ANALYZER] Fast element detection for: {target_type or 'general'}")
        
        detection_strategies = []
        
        if target_type == 'green_button':
            # 초록색 버튼 감지 전략들
            detection_strategies = [
                self._detect_by_color_and_text('green'),
                self._detect_by_common_button_patterns(['refresh', 'start', 'play', 'connect', 'go']),
                self._detect_by_css_classes(['btn-success', 'btn-green', 'success', 'green']),
                self._detect_by_computed_style('background-color', ['green', 'rgb(40, 167, 69)', '#28a745'])
            ]
        else:
            # 일반적인 요소 감지 전략들
            detection_strategies = [
                self._detect_by_text_content(query),
                self._detect_by_aria_labels(),
                self._detect_by_semantic_elements()
            ]
        
        # 병렬 실행
        try:
            results = await asyncio.gather(*detection_strategies, return_exceptions=True)
            
            # 첫 번째 성공한 결과 반환
            for result in results:
                if isinstance(result, dict) and result.get('success'):
                    logger.info(f"[UI-ANALYZER] Fast detection successful: {result.get('method')}")
                    return result
            
            # 모든 전략 실패
            return {'success': False, 'error': 'All detection strategies failed'}
            
        except Exception as e:
            logger.error(f"[UI-ANALYZER] Fast detection failed: {e}")
            return {'success': False, 'error': str(e)}

    async def _detect_by_color_and_text(self, color: str) -> Dict[str, Any]:
        """색상과 텍스트 기반 버튼 감지"""
        try:
            # JavaScript로 색상 기반 요소 찾기
            result = await self.page.evaluate(f"""
                () => {{
                    const elements = Array.from(document.querySelectorAll('button, .btn, [role="button"]'));
                    const colorKeywords = {{
                        'green': ['green', '#28a745', 'rgb(40, 167, 69)', '#198754', '#20c997'],
                        'blue': ['blue', '#007bff', 'rgb(0, 123, 255)', '#0d6efd'],
                        'red': ['red', '#dc3545', 'rgb(220, 53, 69)', '#d63384']
                    }};
                    
                    for (const el of elements) {{
                        const styles = window.getComputedStyle(el);
                        const bgColor = styles.backgroundColor.toLowerCase();
                        const borderColor = styles.borderColor.toLowerCase();
                        
                        const targetColors = colorKeywords['{color}'] || [];
                        
                        for (const targetColor of targetColors) {{
                            if (bgColor.includes(targetColor) || borderColor.includes(targetColor)) {{
                                return {{
                                    success: true,
                                    element: {{
                                        tagName: el.tagName,
                                        textContent: el.textContent?.trim(),
                                        className: el.className,
                                        id: el.id,
                                        selector: el.id ? `#${{el.id}}` : `.${{{el.className.split(' ')[0]}}}`,
                                        color: bgColor,
                                        position: {{
                                            x: el.getBoundingClientRect().x,
                                            y: el.getBoundingClientRect().y
                                        }}
                                    }},
                                    method: 'color_detection'
                                }};
                            }}
                        }}
                    }}
                    
                    return {{success: false}};
                }}
            """)
            
            return result
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_common_button_patterns(self, keywords: List[str]) -> Dict[str, Any]:
        """일반적인 버튼 패턴으로 감지"""
        try:
            for keyword in keywords:
                selectors = [
                    f'button:has-text("{keyword.title()}")',
                    f'button:has-text("{keyword.lower()}")',
                    f'button:has-text("{keyword.upper()}")',
                    f'.btn:has-text("{keyword}")',
                    f'[aria-label*="{keyword}" i]',
                    f'[title*="{keyword}" i]'
                ]
                
                for selector in selectors:
                    try:
                        element = await self.page.query_selector(selector)
                        if element:
                            text = await element.text_content()
                            return {
                                'success': True,
                                'element': {
                                    'textContent': text.strip(),
                                    'selector': selector
                                },
                                'method': 'pattern_detection'
                            }
                    except:
                        continue
            
            return {'success': False}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_css_classes(self, class_keywords: List[str]) -> Dict[str, Any]:
        """CSS 클래스명으로 감지"""
        try:
            for keyword in class_keywords:
                selectors = [
                    f'.{keyword}',
                    f'[class*="{keyword}"]',
                    f'button.{keyword}',
                    f'.btn.{keyword}'
                ]
                
                for selector in selectors:
                    try:
                        element = await self.page.query_selector(selector)
                        if element:
                            text = await element.text_content()
                            return {
                                'success': True,
                                'element': {
                                    'textContent': text.strip() if text else '',
                                    'selector': selector
                                },
                                'method': 'css_class_detection'
                            }
                    except:
                        continue
            
            return {'success': False}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_computed_style(self, style_property: str, target_values: List[str]) -> Dict[str, Any]:
        """계산된 스타일로 감지"""
        try:
            result = await self.page.evaluate(f"""
                () => {{
                    const buttons = Array.from(document.querySelectorAll('button, .btn, [role="button"]'));
                    const targetValues = {target_values};
                    
                    for (const btn of buttons) {{
                        const styles = window.getComputedStyle(btn);
                        const value = styles['{style_property}'].toLowerCase();
                        
                        for (const target of targetValues) {{
                            if (value.includes(target.toLowerCase())) {{
                                return {{
                                    success: true,
                                    element: {{
                                        textContent: btn.textContent?.trim(),
                                        className: btn.className,
                                        id: btn.id,
                                        styleValue: value
                                    }},
                                    method: 'computed_style_detection'
                                }};
                            }}
                        }}
                    }}
                    
                    return {{success: false}};
                }}
            """)
            
            return result
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_text_content(self, query: str) -> Dict[str, Any]:
        """텍스트 내용으로 감지"""
        try:
            # 쿼리에서 키워드 추출
            keywords = query.lower().split()
            
            for keyword in keywords:
                if len(keyword) > 2:  # 3글자 이상만
                    element = await self.page.query_selector(f':has-text("{keyword}")')
                    if element:
                        text = await element.text_content()
                        return {
                            'success': True,
                            'element': {
                                'textContent': text.strip(),
                                'keyword': keyword
                            },
                            'method': 'text_content_detection'
                        }
            
            return {'success': False}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_aria_labels(self) -> Dict[str, Any]:
        """ARIA 라벨로 감지"""
        try:
            elements = await self.page.query_selector_all('[aria-label], [aria-labelledby], [title]')
            
            for element in elements[:10]:  # 처음 10개만 체크
                aria_label = await element.get_attribute('aria-label')
                title = await element.get_attribute('title')
                
                if aria_label or title:
                    text = await element.text_content()
                    return {
                        'success': True,
                        'element': {
                            'textContent': text.strip() if text else '',
                            'ariaLabel': aria_label,
                            'title': title
                        },
                        'method': 'aria_detection'
                    }
            
            return {'success': False}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _detect_by_semantic_elements(self) -> Dict[str, Any]:
        """시맨틱 요소로 감지"""
        try:
            semantic_selectors = [
                'button', '.btn', '[role="button"]',
                'input[type="submit"]', 'input[type="button"]',
                '.button', '.action-btn', '.primary-btn'
            ]
            
            for selector in semantic_selectors:
                elements = await self.page.query_selector_all(selector)
                if elements:
                    # 첫 번째 요소 반환
                    first_element = elements[0]
                    text = await first_element.text_content()
                    return {
                        'success': True,
                        'element': {
                            'textContent': text.strip() if text else '',
                            'selector': selector,
                            'count': len(elements)
                        },
                        'method': 'semantic_detection'
                    }
            
            return {'success': False}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}


# 전역 인스턴스
ui_analyzer_instance = None

async def get_ui_analyzer():
    """UI Analyzer 싱글톤 인스턴스 반환"""
    global ui_analyzer_instance
    if ui_analyzer_instance is None:
        ui_analyzer_instance = UIAnalyzer()
        await ui_analyzer_instance.initialize()
    return ui_analyzer_instance

async def analyze_ui_screenshot(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    UI 스크린샷 분석 메인 함수 (외부 호출용)
    
    Args:
        params: 분석 파라미터
    
    Returns:
        분석 결과
    """
    try:
        analyzer = await get_ui_analyzer()
        result = await analyzer.analyze_ui(params)
        return result
    except Exception as e:
        logger.error(f"[UI-ANALYZER] UI analysis failed: {e}")
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

async def quick_element_finder(query: str, url: str = 'http://localhost:3001', element_type: str = None) -> Dict[str, Any]:
    """
    빠른 요소 찾기 - 효율적인 UI 요소 검색
    
    Args:
        query: 찾을 요소에 대한 설명
        url: 대상 URL
        element_type: 요소 타입 (green_button, blue_button, input, etc.)
    
    Returns:
        요소 정보
    """
    try:
        analyzer = await get_ui_analyzer()
        
        # 스마트 URL 처리
        success_url = await analyzer._smart_url_navigation(
            url, 
            fallback_urls=[f"{url}/#/logs/viewer", f"{url}/#/logs", f"{url}/#/dashboard"],
            smart_navigation=True
        )
        
        # 페이지 로드
        await analyzer.page.goto(success_url, wait_until='domcontentloaded', timeout=15000)
        
        # SPA 로딩 대기
        await asyncio.sleep(1)
        
        # 빠른 요소 감지
        detection_result = await analyzer._fast_element_detection(query, element_type)
        
        if detection_result.get('success'):
            return {
                'success': True,
                'element': detection_result['element'],
                'method': detection_result['method'],
                'url': success_url,
                'query': query,
                'timestamp': datetime.now().isoformat()
            }
        else:
            # 폴백: 전통적인 스크린샷 분석
            screenshot = await analyzer.page.screenshot()
            screenshot_base64 = base64.b64encode(screenshot).decode('utf-8')
            
            analysis = await analyzer._analyze_with_llm(
                f"화면에서 다음을 찾아주세요: {query}. 요소의 정확한 텍스트를 알려주세요.",
                screenshot_base64,
                'claude-3-5-sonnet-20241022'
            )
            
            return {
                'success': True,
                'analysis': analysis,
                'fallback_used': True,
                'url': success_url,
                'query': query,
                'timestamp': datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.error(f"[UI-ANALYZER] Quick element finder failed: {e}")
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

# 테스트용 함수
async def test_ui_analyzer():
    """UI Analyzer 테스트"""
    analyzer = UIAnalyzer()
    try:
        await analyzer.initialize()
        
        # 테스트 파라미터
        test_params = {
            'query': '이 페이지의 헤더 높이는 얼마인가요?',
            'url': 'http://localhost:3001',
            'action': 'screenshot',
            'model': 'claude-3-5-sonnet-20241022'
        }
        
        result = await analyzer.analyze_ui(test_params)
        print("테스트 결과:", json.dumps(result, indent=2, ensure_ascii=False))
        
    finally:
        await analyzer.cleanup()

if __name__ == "__main__":
    asyncio.run(test_ui_analyzer())