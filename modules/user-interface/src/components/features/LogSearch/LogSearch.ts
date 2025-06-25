/**
 * @fileoverview LogSearch Component
 * @description 로그 검색 및 필터링을 위한 Feature 컴포넌트
 * @version 1.0.0
 * LOG_SYSTEM_UI_INTEGRATION_PLAN.md Phase 2.2 구현
 */

import { BaseComponent } from '../../base/component.js';
import { EventManager } from '../../../core/events.js';
import type { 
  SearchResult,
  SearchOptions,
  LogLevel,
  TimeRange,
  LogSearchProps,
  LogSystemService,
  SavedSearch,
  LogEntry
} from '../../../types/log-system.js';

// SCSS 스타일 import
import './LogSearch.scss';

/**
 * LogSearch DOM 요소들
 */
interface LogSearchElements {
  container: HTMLElement | null;
  searchForm: HTMLElement | null;
  searchInput: HTMLElement | null;
  searchButton: HTMLElement | null;
  clearButton: HTMLElement | null;
  advancedToggle: HTMLElement | null;
  advancedPanel: HTMLElement | null;
  regexToggle: HTMLElement | null;
  caseSensitiveToggle: HTMLElement | null;
  levelFilters: HTMLElement | null;
  sourcesFilter: HTMLElement | null;
  timeRangeFilter: HTMLElement | null;
  autoCompleteList: HTMLElement | null;
  savedSearches: HTMLElement | null;
  searchHistory: HTMLElement | null;
  resultsContainer: HTMLElement | null;
  resultsHeader: HTMLElement | null;
  resultsList: HTMLElement | null;
  loadingIndicator: HTMLElement | null;
  noResults: HTMLElement | null;
}

/**
 * LogSearch 상태
 */
interface LogSearchState {
  query: string;
  isAdvancedMode: boolean;
  isRegexMode: boolean;
  isCaseSensitive: boolean;
  selectedLevels: LogLevel[];
  selectedSources: string[];
  timeRange: TimeRange;
  isSearching: boolean;
  lastSearchTime: number;
  searchResults: SearchResult | null;
  autoCompleteOptions: string[];
  searchHistory: string[];
  savedSearches: SavedSearch[];
  availableSources: string[];
}

/**
 * LogSearch 컴포넌트
 * 
 * @example
 * ```typescript
 * const logSearch = new LogSearch('#log-search', {
 *   initialQuery: 'error',
 *   enableAdvancedSearch: true,
 *   enableAutoComplete: true,
 *   saveSearchHistory: true,
 *   liveSearch: false
 * }, eventManager);
 * 
 * await logSearch.initialize();
 * ```
 */
export class LogSearch extends BaseComponent<HTMLElement, LogSearchProps> {
  private elements: LogSearchElements = {
    container: null,
    searchForm: null,
    searchInput: null,
    searchButton: null,
    clearButton: null,
    advancedToggle: null,
    advancedPanel: null,
    regexToggle: null,
    caseSensitiveToggle: null,
    levelFilters: null,
    sourcesFilter: null,
    timeRangeFilter: null,
    autoCompleteList: null,
    savedSearches: null,
    searchHistory: null,
    resultsContainer: null,
    resultsHeader: null,
    resultsList: null,
    loadingIndicator: null,
    noResults: null
  };

  private logSearchState: LogSearchState = {
    query: '',
    isAdvancedMode: false,
    isRegexMode: false,
    isCaseSensitive: false,
    selectedLevels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    selectedSources: [],
    timeRange: '1h',
    isSearching: false,
    lastSearchTime: 0,
    searchResults: null,
    autoCompleteOptions: [],
    searchHistory: [],
    savedSearches: [],
    availableSources: []
  };

  private logSystemService: LogSystemService | null = null;
  private searchDebounceTimer: number | null = null;
  private autoCompleteTimer: number | null = null;

  constructor(
    element: HTMLElement | string,
    props: LogSearchProps = {},
    eventManager: EventManager
  ) {
    const defaultProps: LogSearchProps = {
      initialQuery: '',
      enableAdvancedSearch: true,
      enableAutoComplete: true,
      saveSearchHistory: true,
      liveSearch: false,
      ...props
    };

    super(element, defaultProps, eventManager);

    // 초기 쿼리 설정
    if (this.props.initialQuery) {
      this.logSearchState.query = this.props.initialQuery;
    }
  }

  /**
   * 컴포넌트 초기화
   */
  async initialize(): Promise<void> {
    this.logger.info('LogSearch 초기화 시작');

    try {
      // LogSystemService 가져오기
      await this.getLogSystemService();

      // 기본 렌더링
      this.render();

      // DOM 요소 찾기
      this.findDOMElements();

      // 이벤트 바인딩
      this.bindEvents();

      // 초기 데이터 로드
      await this.loadInitialData();

      // 검색 히스토리 로드
      this.loadSearchHistory();

      // 저장된 검색 로드
      this.loadSavedSearches();

      // 초기 검색 실행
      if (this.props.initialQuery) {
        await this.performSearch(this.props.initialQuery);
      }

      this.logger.info('LogSearch 초기화 완료');
    } catch (error) {
      this.handleError(error as Error, 'initialize');
      throw error;
    }
  }

  /**
   * 컴포넌트 렌더링
   */
  render(): void {
    this.element.innerHTML = `
      <div class="log-search" data-component="LogSearch">
        ${this.renderSearchForm()}
        ${this.props.enableAdvancedSearch ? this.renderAdvancedPanel() : ''}
        ${this.renderResultsContainer()}
        ${this.renderLoadingIndicator()}
      </div>
    `;

    // CSS 클래스 추가
    this.element.classList.add('recursive-log-search');
  }

  /**
   * 검색 폼 렌더링
   */
  private renderSearchForm(): string {
    return `
      <div class="log-search__search-form">
        <div class="log-search__search-row">
          <input 
            type="text" 
            class="log-search__search-input" 
            placeholder="로그 검색... (예: error, /regex/, source:mcp)"
            value="${this.escapeHtml(this.logSearchState.query)}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="log-search__search-btn">
            🔍 검색
          </button>
          <button type="button" class="log-search__clear-btn">
            🗑️ 지우기
          </button>
        </div>
        
        <div class="log-search__search-row">
          <label class="log-search__option">
            <input type="checkbox" class="log-search__regex-toggle" ${this.logSearchState.isRegexMode ? 'checked' : ''}>
            <span>정규식</span>
          </label>
          <label class="log-search__option">
            <input type="checkbox" class="log-search__case-toggle" ${this.logSearchState.isCaseSensitive ? 'checked' : ''}>
            <span>대소문자 구분</span>
          </label>
          ${this.props.enableAdvancedSearch ? `
            <button type="button" class="log-search__advanced-toggle ${this.logSearchState.isAdvancedMode ? 'active' : ''}">
              🔍 고급 검색
            </button>
          ` : ''}
        </div>

        ${this.props.enableAutoComplete ? this.renderAutoComplete() : ''}
      </div>
    `;
  }

  /**
   * 자동완성 렌더링
   */
  private renderAutoComplete(): string {
    return `
      <div class="log-search__autocomplete" style="display: none;">
        <ul class="log-search__autocomplete-list">
          <!-- 자동완성 항목들이 동적으로 추가됩니다 -->
        </ul>
      </div>
    `;
  }

  /**
   * 고급 검색 패널 렌더링
   */
  private renderAdvancedPanel(): string {
    return `
      <div class="log-search__advanced-filters ${this.logSearchState.isAdvancedMode ? 'log-search__advanced-filters--visible' : ''}">
        <div class="log-search__filter-grid">
          <div class="log-search__filter-group">
            <label class="log-search__filter-label">로그 레벨</label>
            <div class="log-search__level-filters">
              ${this.renderLevelFilters()}
            </div>
          </div>

          <div class="log-search__filter-group">
            <label class="log-search__filter-label">소스</label>
            <select class="log-search__filter-select" multiple>
              ${this.renderSourceOptions()}
            </select>
          </div>

          <div class="log-search__filter-group">
            <label class="log-search__filter-label">시간 범위</label>
            <select class="log-search__filter-select">
              <option value="15m" ${this.logSearchState.timeRange === '15m' ? 'selected' : ''}>15분</option>
              <option value="1h" ${this.logSearchState.timeRange === '1h' ? 'selected' : ''}>1시간</option>
              <option value="6h" ${this.logSearchState.timeRange === '6h' ? 'selected' : ''}>6시간</option>
              <option value="24h" ${this.logSearchState.timeRange === '24h' ? 'selected' : ''}>24시간</option>
              <option value="7d" ${this.logSearchState.timeRange === '7d' ? 'selected' : ''}>7일</option>
              <option value="30d" ${this.logSearchState.timeRange === '30d' ? 'selected' : ''}>30일</option>
            </select>
          </div>
        </div>

        ${this.props.saveSearchHistory ? this.renderSavedSearches() : ''}
      </div>
    `;
  }

  /**
   * 레벨 필터 렌더링
   */
  private renderLevelFilters(): string {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    return levels.map(level => `
      <label class="log-search__level-filter">
        <input 
          type="checkbox" 
          value="${level}" 
          ${this.logSearchState.selectedLevels.includes(level) ? 'checked' : ''}
        >
        <span class="log-level log-level--${level.toLowerCase()}">${level}</span>
      </label>
    `).join('');
  }

  /**
   * 소스 옵션 렌더링
   */
  private renderSourceOptions(): string {
    return this.logSearchState.availableSources.map(source => `
      <option value="${source}" ${this.logSearchState.selectedSources.includes(source) ? 'selected' : ''}>
        ${source}
      </option>
    `).join('');
  }

  /**
   * 저장된 검색 렌더링
   */
  private renderSavedSearches(): string {
    return `
      <div class="log-search__saved-searches">
        <h4>저장된 검색</h4>
        <div class="log-search__saved-list">
          ${this.logSearchState.savedSearches.map(search => `
            <div class="log-search__saved-item" data-search-id="${search.id}">
              <span class="log-search__saved-name">${this.escapeHtml(search.name)}</span>
              <span class="log-search__saved-query">${this.escapeHtml(search.query)}</span>
              <button type="button" class="log-search__saved-load" title="검색 로드">
                <span class="icon-play"></span>
              </button>
              <button type="button" class="log-search__saved-delete" title="삭제">
                <span class="icon-trash"></span>
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 검색 결과 컨테이너 렌더링
   */
  private renderResultsContainer(): string {
    return `
      <div class="log-search__results-container">
        ${this.renderResultsHeader()}
        <div class="log-search__results-list">
          ${this.logSearchState.searchResults ? this.renderSearchResults() : this.renderNoResults()}
        </div>
      </div>
    `;
  }

  /**
   * 검색 결과 헤더 렌더링
   */
  private renderResultsHeader(): string {
    const results = this.logSearchState.searchResults;
    if (!results) return '';

    return `
      <div class="log-search__results-header">
        <div class="log-search__results-info">
          <span class="log-search__results-count">${results.total_matches}개 결과</span>
          <span class="log-search__search-time">(${results.search_time}ms)</span>
        </div>
        <div class="log-search__results-actions">
          <button type="button" class="log-search__export-btn">
            <span class="icon-download"></span>
            내보내기
          </button>
          <button type="button" class="log-search__save-search-btn">
            <span class="icon-bookmark"></span>
            검색 저장
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 검색 결과 렌더링
   */
  private renderSearchResults(): string {
    if (!this.logSearchState.searchResults) return '';

    const { logs, highlights } = this.logSearchState.searchResults;
    
    return logs.map(log => {
      const highlight = highlights?.find(h => h.log_id === log.id);
      const message = highlight ? highlight.highlighted_text : log.message;
      
      return `
        <div class="log-search__result-item log-entry log-entry--${log.level.toLowerCase()}" data-log-id="${log.id}">
          <div class="log-entry__timestamp">${this.formatTimestamp(log.timestamp)}</div>
          <div class="log-entry__level">
            <span class="log-level log-level--${log.level.toLowerCase()}">${log.level}</span>
          </div>
          <div class="log-entry__source">${this.escapeHtml(log.source)}</div>
          <div class="log-entry__message">${message}</div>
          ${log.trace_id ? `<div class="log-entry__trace" data-trace-id="${log.trace_id}">
            <span class="icon-link"></span>
          </div>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * 결과 없음 상태 렌더링
   */
  private renderNoResults(): string {
    return `
      <div class="log-search__no-results">
        <div class="icon-search icon--large"></div>
        <h3>검색 결과가 없습니다</h3>
        <p>다른 검색어나 필터를 시도해보세요.</p>
      </div>
    `;
  }

  /**
   * 로딩 인디케이터 렌더링
   */
  private renderLoadingIndicator(): string {
    return `
      <div class="log-search__loading ${this.logSearchState.isSearching ? 'log-search__loading--visible' : ''}">
        <div class="spinner"></div>
        <span>검색 중...</span>
      </div>
    `;
  }

  /**
   * DOM 요소 찾기
   */
  private findDOMElements(): void {
    const container = this.element.querySelector('.log-search');
    if (!container) return;

    this.elements = {
      container: container as HTMLElement,
      searchForm: container.querySelector('.log-search__search-form'),
      searchInput: container.querySelector('.log-search__search-input'),
      searchButton: container.querySelector('.log-search__search-btn'),
      clearButton: container.querySelector('.log-search__clear-btn'),
      advancedToggle: container.querySelector('.log-search__advanced-toggle'),
              advancedPanel: container.querySelector('.log-search__advanced-filters'),
        regexToggle: container.querySelector('.log-search__regex-toggle'),
        caseSensitiveToggle: container.querySelector('.log-search__case-toggle'),
        levelFilters: container.querySelector('.log-search__level-filters'),
        sourcesFilter: container.querySelector('.log-search__filter-select[multiple]'),
        timeRangeFilter: container.querySelector('.log-search__filter-select:not([multiple])'),
      autoCompleteList: container.querySelector('.log-search__autocomplete-list'),
      savedSearches: container.querySelector('.log-search__saved-searches'),
      searchHistory: container.querySelector('.log-search__search-history'),
              resultsContainer: container.querySelector('.log-search__results-container'),
      resultsHeader: container.querySelector('.log-search__results-header'),
      resultsList: container.querySelector('.log-search__results-list'),
      loadingIndicator: container.querySelector('.log-search__loading'),
      noResults: container.querySelector('.log-search__no-results')
    };
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents(): void {
    // 검색 입력 이벤트
    if (this.elements.searchInput) {
      this.addDOMEventListener(this.elements.searchInput, 'input', (e) => {
        const target = e.target as HTMLInputElement;
        this.handleSearchInput(target.value);
      });

      this.addDOMEventListener(this.elements.searchInput, 'keydown', (e) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter') {
          e.preventDefault();
          this.handleSearchSubmit();
        } else if (keyEvent.key === 'Escape') {
          this.hideAutoComplete();
        }
      });

      this.addDOMEventListener(this.elements.searchInput, 'focus', () => {
        this.showAutoComplete();
      });

      this.addDOMEventListener(this.elements.searchInput, 'blur', () => {
        // 약간의 지연을 두어 클릭 이벤트가 처리되도록 함
        setTimeout(() => this.hideAutoComplete(), 150);
      });
    }

    // 검색 버튼 이벤트
    if (this.elements.searchButton) {
      this.addDOMEventListener(this.elements.searchButton, 'click', () => {
        this.handleSearchSubmit();
      });
    }

    // 클리어 버튼 이벤트
    if (this.elements.clearButton) {
      this.addDOMEventListener(this.elements.clearButton, 'click', () => {
        this.clearSearch();
      });
    }

    // 고급 검색 토글 이벤트
    if (this.elements.advancedToggle) {
      this.addDOMEventListener(this.elements.advancedToggle, 'click', () => {
        this.toggleAdvancedPanel();
      });
    }

    // 정규식 토글 이벤트
    if (this.elements.regexToggle) {
      this.addDOMEventListener(this.elements.regexToggle, 'change', (e) => {
        const target = e.target as HTMLInputElement;
        this.logSearchState.isRegexMode = target.checked;
      });
    }

    // 대소문자 구분 토글 이벤트
    if (this.elements.caseSensitiveToggle) {
      this.addDOMEventListener(this.elements.caseSensitiveToggle, 'change', (e) => {
        const target = e.target as HTMLInputElement;
        this.logSearchState.isCaseSensitive = target.checked;
      });
    }

    // 레벨 필터 이벤트
    if (this.elements.levelFilters) {
      this.addDOMEventListener(this.elements.levelFilters, 'change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'checkbox') {
          this.handleLevelFilterChange(target.value as LogLevel, target.checked);
        }
      });
    }

    // 소스 필터 이벤트
    if (this.elements.sourcesFilter) {
      this.addDOMEventListener(this.elements.sourcesFilter, 'change', () => {
        this.handleSourceFilterChange();
      });
    }

    // 시간 범위 필터 이벤트
    if (this.elements.timeRangeFilter) {
      this.addDOMEventListener(this.elements.timeRangeFilter, 'change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.logSearchState.timeRange = target.value as TimeRange;
      });
    }

    // 검색 결과 클릭 이벤트
    if (this.elements.resultsList) {
      this.addDOMEventListener(this.elements.resultsList, 'click', (e) => {
        const target = e.target as HTMLElement;
        const logItem = target.closest('.log-search__result-item');
        if (logItem) {
          const logId = logItem.getAttribute('data-log-id');
          if (logId) {
            this.handleResultClick(logId);
          }
        }

        // 트레이스 ID 클릭 처리
        const traceElement = target.closest('.log-entry__trace');
        if (traceElement) {
          const traceId = traceElement.getAttribute('data-trace-id');
          if (traceId) {
            this.handleTraceClick(traceId);
          }
        }
      });
    }

    // 저장된 검색 이벤트
    this.bindSavedSearchEvents();
  }

  /**
   * 저장된 검색 이벤트 바인딩
   */
  private bindSavedSearchEvents(): void {
    if (this.elements.savedSearches) {
      this.addDOMEventListener(this.elements.savedSearches, 'click', (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button');
        if (!button) return;

        const savedItem = button.closest('.log-search__saved-item');
        if (!savedItem) return;

        const searchId = savedItem.getAttribute('data-search-id');
        if (!searchId) return;

        if (button.classList.contains('log-search__saved-load')) {
          this.loadSavedSearch(searchId);
        } else if (button.classList.contains('log-search__saved-delete')) {
          this.deleteSavedSearch(searchId);
        }
      });
    }
  }

  /**
   * LogSystemService 가져오기
   */
  private async getLogSystemService(): Promise<void> {
    try {
      // 전역 앱 인스턴스에서 서비스 레지스트리 가져오기
      const app = (window as any).app;
      if (app && app.serviceRegistry) {
        this.logSystemService = app.serviceRegistry.get('log-system');
      }
      
      // 서비스가 없으면 전역에서 다시 시도
      if (!this.logSystemService) {
        this.logSystemService = (window as any).logSystemService;
      }
      
      if (this.logSystemService) {
        this.logger.info('LogSystemService 연결 완료');
        
        // 서비스가 연결되어 있지 않으면 연결 시도
        if (typeof (this.logSystemService as any).isConnected === 'function' && !(this.logSystemService as any).isConnected()) {
          try {
            if (typeof (this.logSystemService as any).connect === 'function') {
              await (this.logSystemService as any).connect();
            }
            this.logger.info('LogSystemService 연결 성공');
          } catch (error) {
            this.logger.warn('LogSystemService 연결 실패, 목업 데이터 사용:', error);
            this.logSystemService = null;
          }
        }
      } else {
        this.logger.warn('LogSystemService를 찾을 수 없습니다. 목업 데이터를 사용합니다.');
      }
    } catch (error) {
      this.logger.error('LogSystemService 연결 실패:', error);
      this.logSystemService = null;
    }
  }

  /**
   * 초기 데이터 로드
   */
  private async loadInitialData(): Promise<void> {
    try {
      // 사용 가능한 소스 목록 로드
      await this.loadAvailableSources();
    } catch (error) {
      this.logger.error('Failed to load initial data:', error);
    }
  }

  /**
   * 사용 가능한 소스 목록 로드
   */
  private async loadAvailableSources(): Promise<void> {
    if (!this.logSystemService) return;

    try {
      const stats = await this.logSystemService.getStats('24h');
      this.logSearchState.availableSources = Object.keys(stats.by_source);
    } catch (error) {
      this.logger.error('Failed to load available sources:', error);
      // 기본 소스 목록 설정
      this.logSearchState.availableSources = ['mcp', 'websocket', 'http', 'ai', 'system'];
    }
  }

  /**
   * 검색 입력 처리
   */
  private handleSearchInput(value: string): void {
    this.logSearchState.query = value;

    // 자동완성 업데이트
    if (this.props.enableAutoComplete) {
      this.updateAutoComplete(value);
    }

    // 라이브 검색
    if (this.props.liveSearch && value.length >= 2) {
      this.debounceSearch(value);
    }
  }

  /**
   * 검색 제출 처리
   */
  private async handleSearchSubmit(): Promise<void> {
    const query = this.logSearchState.query.trim();
    if (!query) return;

    await this.performSearch(query);
    this.addToSearchHistory(query);
  }

  /**
   * 검색 실행 (실제 서비스 또는 목업 데이터)
   */
  private async performSearch(query: string): Promise<void> {
    if (!query.trim()) {
      this.logger.warn('검색어가 비어있습니다');
      return;
    }

    this.setSearching(true);

    try {
      if (this.logSystemService) {
        // 실제 로그 시스템 사용
        const searchOptions: SearchOptions = {
          timerange: this.logSearchState.timeRange,
          context: 2,
          highlight: true,
          max_results: 100,
          fields: ['message', 'metadata']
        };

        const result = await this.logSystemService.search(query, searchOptions);
        
        this.logSearchState.searchResults = result;
        this.logSearchState.lastSearchTime = Date.now();
        
        this.logger.info(`실제 검색 결과 ${(result as any).matches?.length || 0}개 로드 완료`);
      } else {
        // 목업 데이터 생성
        const mockResults = this.generateMockSearchResults(query);
        this.logSearchState.searchResults = {
          query,
          total_matches: mockResults.length,
          search_time: Math.floor(Math.random() * 200) + 50,
          options: {
            timerange: this.logSearchState.timeRange,
            context: 2,
            highlight: true,
            max_results: 100,
            fields: ['message', 'metadata']
          }
        } as any;
        
        this.logger.info(`목업 검색 결과 ${mockResults.length}개 생성 완료`);
      }

      // 결과 렌더링 업데이트
      this.updateResultsDisplay();

      // 콜백 호출
      if (this.props.onSearchResults && this.logSearchState.searchResults) {
        this.props.onSearchResults(this.logSearchState.searchResults);
      }

      // 이벤트 발생
      this.emit('search:completed', { query, results: this.logSearchState.searchResults });

    } catch (error) {
      this.logger.error('검색 실패:', error);
      this.handleError(error as Error, 'performSearch');
      
      // 에러 발생 시 목업 데이터로 폴백
      const mockResults = this.generateMockSearchResults(query);
      this.logSearchState.searchResults = {
        query,
        total_matches: mockResults.length,
        search_time: Math.floor(Math.random() * 200) + 50,
        options: {
          timerange: this.logSearchState.timeRange,
          context: 2,
          highlight: true,
          max_results: 100,
          fields: ['message', 'metadata']
        }
      } as any;
      this.updateResultsDisplay();
    } finally {
      this.setSearching(false);
    }
  }

  /**
   * 디바운스된 검색
   */
  private debounceSearch(query: string): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = window.setTimeout(() => {
      this.performSearch(query);
    }, 500);
  }

  /**
   * 검색 상태 설정
   */
  private setSearching(searching: boolean): void {
    this.logSearchState.isSearching = searching;
    
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.classList.toggle('log-search__loading--visible', searching);
    }

    if (this.elements.searchButton) {
      (this.elements.searchButton as HTMLButtonElement).disabled = searching;
    }
  }

  /**
   * 목업 검색 결과 생성
   */
  private generateMockSearchResults(query: string): LogEntry[] {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const sources = ['mcp-server', 'ui-component', 'log-system', 'websocket', 'api-client'];
    const baseMessages = [
      `Search query "${query}" processed successfully`,
      `Found matching entries for: ${query}`,
      `Processing search request: ${query}`,
      `Query execution completed for: ${query}`,
      `Search index updated with term: ${query}`,
      `Filtered results for query: ${query}`,
      `Cache hit for search: ${query}`,
      `Full-text search completed: ${query}`,
      `Search analytics recorded for: ${query}`,
      `Query optimization applied to: ${query}`
    ];

    const mockResults: LogEntry[] = [];
    const now = Date.now();
    const resultCount = Math.floor(Math.random() * 15) + 5; // 5-20개 결과

    for (let i = 0; i < resultCount; i++) {
      const level = levels[Math.floor(Math.random() * levels.length)] as LogLevel;
      const source = sources[Math.floor(Math.random() * sources.length)] as string;
      const message = baseMessages[Math.floor(Math.random() * baseMessages.length)] as string;
      const timestamp = new Date(now - (i * 120000 + Math.random() * 120000)).toISOString();

      mockResults.push({
        id: `search-mock-${i}`,
        level,
        source,
        message,
        timestamp,
        metadata: {
          component: source,
          environment: 'development',
          version: '1.0.0',
          search_query: query
        },
        tags: [level.toLowerCase(), source, 'search-result'],
        trace_id: `search-trace-${Math.random().toString(36).substr(2, 9)}`
      });
    }

    // 검색어 필터링 시뮬레이션
    if (this.logSearchState.selectedLevels && this.logSearchState.selectedLevels.length > 0 && this.logSearchState.selectedLevels.length < 5) {
      return mockResults.filter(log => this.logSearchState.selectedLevels.includes(log.level));
    }

    return mockResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * 자동완성 업데이트
   */
  private updateAutoComplete(query: string): void {
    if (!query || query.length < 2) {
      this.hideAutoComplete();
      return;
    }

    // 자동완성 옵션 생성
    const options = [
      ...this.logSearchState.searchHistory.filter(h => 
        h.toLowerCase().includes(query.toLowerCase())
      ),
      ...this.logSearchState.availableSources.map(s => `source:${s}`).filter(s => 
        s.toLowerCase().includes(query.toLowerCase())
      ),
      'level:ERROR',
      'level:WARN',
      'level:INFO',
      '/regex.*pattern/',
      'trace_id:'
    ].filter(option => 
      option.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);

    this.logSearchState.autoCompleteOptions = options;
    this.renderAutoCompleteOptions();
    this.showAutoComplete();
  }

  /**
   * 자동완성 옵션 렌더링
   */
  private renderAutoCompleteOptions(): void {
    if (!this.elements.autoCompleteList) return;

    this.elements.autoCompleteList.innerHTML = this.logSearchState.autoCompleteOptions
      .map(option => `
        <li class="log-search__autocomplete-item" data-value="${this.escapeHtml(option)}">
          ${this.escapeHtml(option)}
        </li>
      `).join('');

    // 자동완성 항목 클릭 이벤트
    this.elements.autoCompleteList.querySelectorAll('.log-search__autocomplete-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const value = target.getAttribute('data-value');
        if (value && this.elements.searchInput) {
          (this.elements.searchInput as HTMLInputElement).value = value;
          this.logSearchState.query = value;
          this.hideAutoComplete();
          this.handleSearchSubmit();
        }
      });
    });
  }

  /**
   * 자동완성 표시
   */
  private showAutoComplete(): void {
    const autoComplete = this.element.querySelector('.log-search__autocomplete');
    if (autoComplete && this.logSearchState.autoCompleteOptions.length > 0) {
      (autoComplete as HTMLElement).style.display = 'block';
    }
  }

  /**
   * 자동완성 숨기기
   */
  private hideAutoComplete(): void {
    const autoComplete = this.element.querySelector('.log-search__autocomplete');
    if (autoComplete) {
      (autoComplete as HTMLElement).style.display = 'none';
    }
  }

  /**
   * 고급 패널 토글
   */
  private toggleAdvancedPanel(): void {
    this.logSearchState.isAdvancedMode = !this.logSearchState.isAdvancedMode;
    
    if (this.elements.advancedPanel) {
      this.elements.advancedPanel.style.display = this.logSearchState.isAdvancedMode ? 'block' : 'none';
    }

    if (this.elements.advancedToggle) {
      this.elements.advancedToggle.classList.toggle('active', this.logSearchState.isAdvancedMode);
    }
  }

  /**
   * 레벨 필터 변경 처리
   */
  private handleLevelFilterChange(level: LogLevel, checked: boolean): void {
    if (checked) {
      if (!this.logSearchState.selectedLevels.includes(level)) {
        this.logSearchState.selectedLevels.push(level);
      }
    } else {
      this.logSearchState.selectedLevels = this.logSearchState.selectedLevels.filter(l => l !== level);
    }
  }

  /**
   * 소스 필터 변경 처리
   */
  private handleSourceFilterChange(): void {
    if (!this.elements.sourcesFilter) return;

    const select = this.elements.sourcesFilter as HTMLSelectElement;
    const selectedOptions = Array.from(select.selectedOptions).map(option => option.value);
    this.logSearchState.selectedSources = selectedOptions;
  }

  /**
   * 검색 결과 클릭 처리
   */
  private handleResultClick(logId: string): void {
    this.emit('result:clicked', { logId });
  }

  /**
   * 트레이스 ID 클릭 처리
   */
  private handleTraceClick(traceId: string): void {
    this.emit('trace:clicked', { traceId });
  }

  /**
   * 검색 지우기
   */
  private clearSearch(): void {
    this.logSearchState.query = '';
    this.logSearchState.searchResults = null;
    
    if (this.elements.searchInput) {
      (this.elements.searchInput as HTMLInputElement).value = '';
    }

    this.updateResultsDisplay();
    this.hideAutoComplete();
  }

  /**
   * 검색 히스토리에 추가
   */
  private addToSearchHistory(query: string): void {
    if (!this.props.saveSearchHistory) return;

    // 중복 제거
    this.logSearchState.searchHistory = this.logSearchState.searchHistory.filter(h => h !== query);
    
    // 최신 검색어를 맨 앞에 추가
    this.logSearchState.searchHistory.unshift(query);
    
    // 최대 20개까지만 유지
    if (this.logSearchState.searchHistory.length > 20) {
      this.logSearchState.searchHistory = this.logSearchState.searchHistory.slice(0, 20);
    }

    // 로컬 스토리지에 저장
    this.saveSearchHistory();
  }

  /**
   * 검색 히스토리 로드
   */
  private loadSearchHistory(): void {
    if (!this.props.saveSearchHistory) return;

    try {
      const saved = localStorage.getItem('recursive-log-search-history');
      if (saved) {
        this.logSearchState.searchHistory = JSON.parse(saved);
      }
    } catch (error) {
      this.logger.error('Failed to load search history:', error);
    }
  }

  /**
   * 검색 히스토리 저장
   */
  private saveSearchHistory(): void {
    if (!this.props.saveSearchHistory) return;

    try {
      localStorage.setItem('recursive-log-search-history', JSON.stringify(this.logSearchState.searchHistory));
    } catch (error) {
      this.logger.error('Failed to save search history:', error);
    }
  }

  /**
   * 저장된 검색 로드
   */
  private loadSavedSearches(): void {
    try {
      const saved = localStorage.getItem('recursive-log-saved-searches');
      if (saved) {
        this.logSearchState.savedSearches = JSON.parse(saved);
      }
    } catch (error) {
      this.logger.error('Failed to load saved searches:', error);
    }
  }

  /**
   * 저장된 검색 로드
   */
  private loadSavedSearch(searchId: string): void {
    const search = this.logSearchState.savedSearches.find(s => s.id === searchId);
    if (!search) return;

    this.logSearchState.query = search.query;
    if (this.elements.searchInput) {
      (this.elements.searchInput as HTMLInputElement).value = search.query;
    }

    // 사용 횟수 증가
    search.usage_count++;
    search.last_used = new Date().toISOString();

    this.performSearch(search.query);
  }

  /**
   * 저장된 검색 삭제
   */
  private deleteSavedSearch(searchId: string): void {
    this.logSearchState.savedSearches = this.logSearchState.savedSearches.filter(s => s.id !== searchId);
    
    // 로컬 스토리지 업데이트
    try {
      localStorage.setItem('recursive-log-saved-searches', JSON.stringify(this.logSearchState.savedSearches));
    } catch (error) {
      this.logger.error('Failed to save searches:', error);
    }

    // UI 업데이트
    this.updateSavedSearchesDisplay();
  }

  /**
   * 검색 상태 설정
   */
  private setLoading(loading: boolean): void {
    this.logSearchState.isSearching = loading;
    
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.classList.toggle('log-search__loading--visible', loading);
    }

    if (this.elements.searchButton) {
      (this.elements.searchButton as HTMLButtonElement).disabled = loading;
    }
  }

  /**
   * 결과 표시 업데이트
   */
  private updateResultsDisplay(): void {
    if (!this.elements.resultsList) return;

    if (this.logSearchState.searchResults) {
      this.elements.resultsList.innerHTML = this.renderSearchResults();
    } else {
      this.elements.resultsList.innerHTML = this.renderNoResults();
    }

    // 헤더 업데이트
    if (this.elements.resultsHeader) {
      this.elements.resultsHeader.innerHTML = this.renderResultsHeader();
    }
  }

  /**
   * 저장된 검색 표시 업데이트
   */
  private updateSavedSearchesDisplay(): void {
    if (!this.elements.savedSearches) return;

    const savedList = this.elements.savedSearches.querySelector('.log-search__saved-list');
    if (savedList) {
      savedList.innerHTML = this.logSearchState.savedSearches.map(search => `
        <div class="log-search__saved-item" data-search-id="${search.id}">
          <span class="log-search__saved-name">${this.escapeHtml(search.name)}</span>
          <span class="log-search__saved-query">${this.escapeHtml(search.query)}</span>
          <button type="button" class="log-search__saved-load" title="검색 로드">
            <span class="icon-play"></span>
          </button>
          <button type="button" class="log-search__saved-delete" title="삭제">
            <span class="icon-trash"></span>
          </button>
        </div>
      `).join('');
    }
  }

  /**
   * 타임스탬프 포맷팅
   */
  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return timestamp;
    }
  }

  /**
   * HTML 이스케이프
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 컴포넌트 정리
   */
  async destroy(): Promise<void> {
    // 타이머 정리
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    if (this.autoCompleteTimer) {
      clearTimeout(this.autoCompleteTimer);
    }

    // 부모 클래스 정리
    await super.destroy();
  }
}

/**
 * LogSearch 컴포넌트 팩토리 함수
 */
export function createLogSearchComponent(
  element: HTMLElement | string,
  props: LogSearchProps = {},
  eventManager: EventManager
): LogSearch {
  return new LogSearch(element, props, eventManager);
} 