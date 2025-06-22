/**
 * Format Utilities
 * 데이터 포맷팅 및 변환을 위한 TypeScript 유틸리티 함수들
 */

// 타입 정의
export interface NumberFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  style?: 'decimal' | 'currency' | 'percent';
  currency?: string;
  notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
}

export interface DurationFormatOptions {
  precision?: number | 'auto';
  format?: 'short' | 'long';
  locale?: string;
}

export interface DateFormatOptions {
  locale?: string;
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  year?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow';
  day?: 'numeric' | '2-digit';
  weekday?: 'long' | 'short' | 'narrow';
  hour?: 'numeric' | '2-digit';
  minute?: 'numeric' | '2-digit';
  second?: 'numeric' | '2-digit';
  hour12?: boolean;
}

export interface UrlFormatOptions {
  protocol?: boolean;
  domain?: boolean;
  path?: boolean;
  query?: boolean;
  fragment?: boolean;
  maxLength?: number;
}

export type PhoneFormat = 'kr' | 'us' | 'international';
export type MaskType = 'ssn' | 'card' | 'phone' | 'custom';

// 색상 타입 오버로드를 위한 함수 시그니처 - 나중에 구현부 앞에서 다시 선언됨

/**
 * 바이트 크기 포맷팅
 */
export const formatBytes = (
  bytes: number,
  decimals: number = 2,
  locale: string = 'ko-KR'
): string => {
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return '-' + formatBytes(-bytes, decimals, locale);

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${value.toLocaleString(locale)} ${sizes[i]}`;
};

/**
 * 숫자 포맷팅
 */
export const formatNumber = (
  number: number,
  options: NumberFormatOptions = {}
): string => {
  const {
    locale = 'ko-KR',
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    style = 'decimal',
    currency = 'KRW',
    notation = 'standard'
  } = options;

  if (isNaN(number)) return '0';

  return new Intl.NumberFormat(locale, {
    style,
    currency: style === 'currency' ? currency : undefined,
    notation,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(number);
};

/**
 * 통화 포맷팅
 */
export const formatCurrency = (
  amount: number,
  currency: string = 'KRW',
  locale: string = 'ko-KR'
): string => {
  return formatNumber(amount, {
    locale,
    style: 'currency',
    currency
  });
};

/**
 * 퍼센트 포맷팅
 */
export const formatPercent = (
  value: number,
  decimals: number = 1,
  locale: string = 'ko-KR'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

/**
 * 시간 포맷팅
 */

/**
 * 밀리초를 사람이 읽기 쉬운 형태로 변환
 */
export const formatDuration = (
  ms: number,
  options: DurationFormatOptions = {}
): string => {
  const {
    precision = 'auto',
    format = 'long'
  } = options;

  if (ms < 0) return '0ms';

  const units = [
    { name: 'year', value: 365 * 24 * 60 * 60 * 1000, short: 'y', long: '년' },
    { name: 'day', value: 24 * 60 * 60 * 1000, short: 'd', long: '일' },
    { name: 'hour', value: 60 * 60 * 1000, short: 'h', long: '시간' },
    { name: 'minute', value: 60 * 1000, short: 'm', long: '분' },
    { name: 'second', value: 1000, short: 's', long: '초' },
    { name: 'millisecond', value: 1, short: 'ms', long: '밀리초' }
  ];

  const parts: string[] = [];
  let remaining = ms;

  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      remaining = remaining % unit.value;
      
      const unitName = format === 'short' ? unit.short : unit.long;
      parts.push(`${count}${unitName}`);
      
      if (precision !== 'auto' && parts.length >= precision) break;
    }
  }

  if (parts.length === 0) {
    return format === 'short' ? '0ms' : '0밀리초';
  }

  return parts.join(' ');
};

/**
 * 업타임 포맷팅
 */
export const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}초`);
  
  return parts.join(' ');
};

/**
 * 날짜/시간 포맷팅
 */

/**
 * 날짜 포맷팅
 */
export const formatDate = (
  date: Date | string | number,
  options: DateFormatOptions = {}
): string => {
  const {
    locale = 'ko-KR',
    dateStyle,
    timeStyle,
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    second,
    hour12
  } = options;

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return 'Invalid Date';

  const formatOptions: Intl.DateTimeFormatOptions = {};
  
  // dateStyle이나 timeStyle을 사용하는 경우
  if (dateStyle || timeStyle) {
    if (dateStyle) formatOptions.dateStyle = dateStyle;
    if (timeStyle) formatOptions.timeStyle = timeStyle;
  } else {
    // 개별 옵션들을 사용하는 경우
    if (year) formatOptions.year = year;
    if (month) formatOptions.month = month;
    if (day) formatOptions.day = day;
    if (weekday) formatOptions.weekday = weekday;
    if (hour) formatOptions.hour = hour;
    if (minute) formatOptions.minute = minute;
    if (second) formatOptions.second = second;
    if (hour12 !== undefined) formatOptions.hour12 = hour12;
    
    // 아무 옵션도 지정되지 않은 경우 기본값 설정
    if (Object.keys(formatOptions).length === 0) {
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
    }
  }

  return new Intl.DateTimeFormat(locale, formatOptions).format(dateObj);
};

/**
 * 상대 시간 포맷팅 (예: "3분 전", "2시간 후")
 */
export const formatRelativeTime = (
  date: Date | string | number,
  locale: string = 'ko-KR'
): string => {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return 'Invalid Date';

  const now = new Date();
  const diffInMs = dateObj.getTime() - now.getTime();
  const diffInSeconds = Math.round(diffInMs / 1000);
  const diffInMinutes = Math.round(diffInSeconds / 60);
  const diffInHours = Math.round(diffInMinutes / 60);
  const diffInDays = Math.round(diffInHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffInSeconds) < 60) {
    return rtf.format(diffInSeconds, 'second');
  } else if (Math.abs(diffInMinutes) < 60) {
    return rtf.format(diffInMinutes, 'minute');
  } else if (Math.abs(diffInHours) < 24) {
    return rtf.format(diffInHours, 'hour');
  } else if (Math.abs(diffInDays) < 30) {
    return rtf.format(diffInDays, 'day');
  } else {
    return formatDate(dateObj, { dateStyle: 'medium' });
  }
};

/**
 * 타임스탬프 포맷팅
 */
export const formatTimestamp = (
  timestamp: number | Date | string,
  includeTime: boolean = true
): string => {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const options: DateFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }

  return formatDate(date, options);
};

/**
 * 문자열 포맷팅
 */

/**
 * 템플릿 문자열 포맷팅
 */
export const formatTemplate = (
  template: string,
  data: Record<string, any>
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
};

/**
 * 첫 글자 대문자
 */
export const capitalize = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * 제목 케이스 (각 단어의 첫 글자 대문자)
 */
export const titleCase = (str: string): string => {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * 카멜 케이스 변환
 */
export const camelCase = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, '');
};

/**
 * 케밥 케이스 변환 (kebab-case)
 */
export const kebabCase = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

/**
 * 스네이크 케이스 변환 (snake_case)
 */
export const snakeCase = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
};

/**
 * 문자열 자르기
 */
export const truncate = (
  str: string,
  length: number = 100,
  suffix: string = '...'
): string => {
  if (!str || str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};

/**
 * 단어 단위로 문자열 자르기
 */
export const truncateWords = (
  str: string,
  wordCount: number = 10,
  suffix: string = '...'
): string => {
  if (!str) return str;
  const words = str.split(/\s+/);
  if (words.length <= wordCount) return str;
  return words.slice(0, wordCount).join(' ') + suffix;
};

/**
 * HTML 태그 제거
 */
export const stripHtml = (html: string): string => {
  if (!html) return html;
  return html.replace(/<[^>]*>/g, '');
};

/**
 * HTML 특수문자 이스케이프
 */
export const escapeHtml = (str: string): string => {
  if (!str) return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * 전화번호 포맷팅
 */
export const formatPhone = (phone: string, format: PhoneFormat = 'kr'): string => {
  if (!phone) return phone;
  
  // 숫자만 추출
  const numbers = phone.replace(/\D/g, '');
  
  switch (format) {
    case 'kr':
      if (numbers.length === 11) {
        return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
      } else if (numbers.length === 10) {
        return numbers.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      }
      break;
    case 'us':
      if (numbers.length === 10) {
        return numbers.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
      } else if (numbers.length === 11 && numbers[0] === '1') {
        return numbers.replace(/(\d)(\d{3})(\d{3})(\d{4})/, '+$1 ($2) $3-$4');
      }
      break;
    case 'international':
      if (numbers.length >= 10) {
        return '+' + numbers;
      }
      break;
  }
  
  return phone;
};

/**
 * 카드 번호 포맷팅
 */
export const formatCardNumber = (cardNumber: string, mask: boolean = false): string => {
  if (!cardNumber) return cardNumber;
  
  const numbers = cardNumber.replace(/\D/g, '');
  
  if (mask && numbers.length >= 12) {
    const maskedNumbers = numbers.slice(0, 4) + 
                         '*'.repeat(numbers.length - 8) + 
                         numbers.slice(-4);
    return maskedNumbers.replace(/(\d{4})/g, '$1 ').trim();
  }
  
  return numbers.replace(/(\d{4})/g, '$1 ').trim();
};

/**
 * URL 포맷팅
 */
export const formatUrl = (url: string, options: UrlFormatOptions = {}): string => {
  if (!url) return url;
  
  const {
    protocol = true,
    domain = true,
    path = true,
    query = true,
    fragment = true,
    maxLength
  } = options;

  try {
    const urlObj = new URL(url);
    let formatted = '';
    
    if (protocol) formatted += urlObj.protocol + '//';
    if (domain) formatted += urlObj.hostname;
    if (path && urlObj.pathname !== '/') formatted += urlObj.pathname;
    if (query && urlObj.search) formatted += urlObj.search;
    if (fragment && urlObj.hash) formatted += urlObj.hash;
    
    if (maxLength && formatted.length > maxLength) {
      return truncate(formatted, maxLength);
    }
    
    return formatted;
  } catch (error) {
    return url;
  }
};

/**
 * 개인정보 마스킹
 */

/**
 * 이메일 마스킹
 */
export const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return email;
  
  const [local, domain] = email.split('@');
  if (!local || local.length <= 2) return email;
  
  const maskedLocal = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
};

/**
 * 개인정보 마스킹
 */
export const maskPrivate = (value: string, type: MaskType): string => {
  if (!value) return value;
  
  switch (type) {
    case 'ssn':
      // 주민등록번호 마스킹 (123456-1******)
      return value.replace(/(\d{6})-?(\d{1})(\d{6})/, '$1-$2******');
    
    case 'card':
      // 카드번호 마스킹 (1234-****-****-5678)
      return formatCardNumber(value, true);
    
    case 'phone':
      // 전화번호 마스킹 (010-****-1234)
      const numbers = value.replace(/\D/g, '');
      if (numbers.length === 11) {
        return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3');
      }
      return value;
    
    case 'custom':
      // 중간 부분 마스킹
      if (value.length <= 4) return value;
      const start = Math.ceil(value.length * 0.3);
      const end = Math.floor(value.length * 0.3);
      return value.substring(0, start) + 
             '*'.repeat(value.length - start - end) + 
             value.substring(value.length - end);
    
    default:
      return value;
  }
};

/**
 * 데이터 포맷팅
 */

/**
 * JSON 포맷팅 (예쁘게 출력)
 */
export const formatJson = (obj: any, space: number = 2): string => {
  try {
    return JSON.stringify(obj, null, space);
  } catch (error) {
    return String(obj);
  }
};

/**
 * 버전 비교
 */
export const compareVersions = (version1: string, version2: string): number => {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1parts.length, v2parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part < v2part) return -1;
    if (v1part > v2part) return 1;
  }
  
  return 0;
};

/**
 * 색상 포맷팅 - 구현부
 */
export function formatColor(color: string, format: 'hex' | 'rgb-string' | 'hsl-string'): string;
export function formatColor(color: string, format: 'rgb'): { r: number; g: number; b: number };
export function formatColor(color: string, format: 'hsl'): { h: number; s: number; l: number };
export function formatColor(color: string, format: 'hex' | 'rgb-string' | 'hsl-string' | 'rgb' | 'hsl' = 'hex'): any {
  if (!color) return color;
  
  // HEX 색상을 RGB로 변환
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1]!, 16),
      g: parseInt(result[2]!, 16),
      b: parseInt(result[3]!, 16)
    } : null;
  };
  
  // RGB를 HSL로 변환
  const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  };
  
  // HEX 색상인지 확인
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    
    switch (format) {
      case 'hex':
        return color.toUpperCase();
      case 'rgb':
        return rgb;
      case 'rgb-string':
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      case 'hsl':
        return rgbToHsl(rgb.r, rgb.g, rgb.b);
      case 'hsl-string':
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
      default:
        return color;
    }
  }
  
  return color;
}

/**
 * 에러 포맷팅
 */
export const formatError = (error: Error | any, includeStack: boolean = false): string => {
  if (!error) return 'Unknown error';
  
  let message = '';
  
  if (error instanceof Error) {
    message = error.message;
    if (includeStack && error.stack) {
      message += '\n\nStack trace:\n' + error.stack;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object') {
    try {
      message = JSON.stringify(error, null, 2);
    } catch {
      message = String(error);
    }
  } else {
    message = String(error);
  }
  
  return message;
};

/**
 * 배열 포맷팅
 */
export const formatList = (
  items: string[],
  options: {
    style?: 'long' | 'short' | 'narrow';
    type?: 'conjunction' | 'disjunction' | 'unit';
    locale?: string;
  } = {}
): string => {
  const { style = 'long', type = 'conjunction', locale = 'ko-KR' } = options;
  
  // 빈 배열이거나 유효하지 않은 항목들 필터링
  const validItems = items.filter(item => item != null && item !== '');
  
  if (validItems.length === 0) return '';
  if (validItems.length === 1) return validItems[0]!;
  
  try {
    // Check if Intl.ListFormat is available
    if (typeof (Intl as any).ListFormat !== 'undefined') {
      const formatter = new (Intl as any).ListFormat(locale, { style, type });
      return formatter.format(validItems);
    }
    throw new Error('Intl.ListFormat not available');
  } catch {
    // Fallback for unsupported browsers
    if (validItems.length === 2) {
      const [first, second] = validItems;
      return type === 'disjunction' ? `${first} 또는 ${second}` : `${first}과 ${second}`;
    }
    
    const last = validItems[validItems.length - 1];
    const rest = validItems.slice(0, -1);
    const conjunction = type === 'disjunction' ? ' 또는 ' : '과 ';
    return rest.join(', ') + conjunction + last;
  }
};

/**
 * 파일 크기 단위 변환
 */
export const convertBytes = (
  bytes: number,
  from: 'B' | 'KB' | 'MB' | 'GB' | 'TB' = 'B',
  to: 'B' | 'KB' | 'MB' | 'GB' | 'TB' = 'MB'
): number => {
  const units = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };
  const fromPower = units[from];
  const toPower = units[to];
  
  const bytesValue = bytes * Math.pow(1024, fromPower);
  return bytesValue / Math.pow(1024, toPower);
};

/**
 * 진행률 바 포맷팅
 */
export const formatProgressBar = (
  progress: number,
  options: {
    width?: number;
    filled?: string;
    empty?: string;
    showPercent?: boolean;
  } = {}
): string => {
  const { width = 20, filled = '█', empty = '░', showPercent = true } = options;
  
  const percentage = Math.max(0, Math.min(100, progress));
  const filledLength = Math.round((percentage / 100) * width);
  const emptyLength = width - filledLength;
  
  const bar = filled.repeat(filledLength) + empty.repeat(emptyLength);
  
  return showPercent ? `${bar} ${percentage.toFixed(1)}%` : bar;
};