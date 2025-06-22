/**
 * Validation Utilities
 * 입력 검증을 위한 TypeScript 유틸리티 함수들
 */

// 타입 정의
export interface ValidationRule<T = any> {
  validate: (value: T) => boolean;
  message: string;
  type?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FormValidationOptions {
  stopOnFirstError?: boolean;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  showErrorsImmediately?: boolean;
}

export interface FieldValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
  type?: 'email' | 'phone' | 'url' | 'number' | 'date' | 'password' | 'text';
}

export type ValidatorFunction<T = any> = (value: T) => boolean | string;

// 정규식 패턴들
export const PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_KR: /^01[016789]-?\d{3,4}-?\d{4}$/,
  PHONE_US: /^(\+1\s?)?(\([0-9]{3}\)|[0-9]{3})[\s\-]?[0-9]{3}[\s\-]?[0-9]{4}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  IPV4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  IPV6: /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
  MAC_ADDRESS: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
  CREDIT_CARD: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/,
  SSN_KR: /^\d{6}-?[1-4]\d{6}$/,
  PASSWORD_STRONG: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  BASE64: /^[A-Za-z0-9+/]*={0,2}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  DOMAIN: /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/,
  USERNAME: /^[a-zA-Z0-9_]{3,20}$/,
  FILENAME: /^[^<>:"/\\|?*\x00-\x1f]+$/
};

/**
 * 기본 검증 함수들
 */

/**
 * 필수 입력 검증
 */
export const required = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

/**
 * 이메일 검증
 */
export const isEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  return PATTERNS.EMAIL.test(email.trim());
};

/**
 * 전화번호 검증
 */
export const isPhone = (phone: string, format: 'kr' | 'us' | 'international' = 'kr'): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  
  const cleaned = phone.replace(/\s+/g, '');
  
  switch (format) {
    case 'kr':
      return PATTERNS.PHONE_KR.test(cleaned);
    case 'us':
      return PATTERNS.PHONE_US.test(cleaned);
    case 'international':
      // 국제 전화번호 (+ 포함, 7-15자리)
      return /^\+[1-9]\d{6,14}$/.test(cleaned);
    default:
      return false;
  }
};

/**
 * URL 검증
 */
export const isUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return PATTERNS.URL.test(url);
  } catch {
    return false;
  }
};

/**
 * IP 주소 검증
 */
export const isIP = (ip: string, version: 4 | 6 | 'both' = 'both'): boolean => {
  if (!ip || typeof ip !== 'string') return false;
  
  switch (version) {
    case 4:
      return PATTERNS.IPV4.test(ip);
    case 6:
      return PATTERNS.IPV6.test(ip);
    case 'both':
      return PATTERNS.IPV4.test(ip) || PATTERNS.IPV6.test(ip);
    default:
      return false;
  }
};

/**
 * 신용카드 번호 검증 (Luhn 알고리즘)
 */
export const isCreditCard = (cardNumber: string): boolean => {
  if (!cardNumber || typeof cardNumber !== 'string') return false;
  
  const cleaned = cardNumber.replace(/\D/g, '');
  if (!PATTERNS.CREDIT_CARD.test(cleaned)) return false;
  
  // Luhn 알고리즘 검증
  let sum = 0;
  let isEven = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const char = cleaned[i];
    if (!char) continue;
    let digit = parseInt(char, 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

/**
 * 주민등록번호 검증 (한국)
 */
export const isSSN = (ssn: string): boolean => {
  if (!ssn || typeof ssn !== 'string') return false;
  
  const cleaned = ssn.replace(/\D/g, '');
  if (!PATTERNS.SSN_KR.test(cleaned)) return false;
  
  // 체크섬 검증
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0;
  
  for (let i = 0; i < 12; i++) {
    const char = cleaned[i];
    const weight = weights[i];
    if (!char || weight === undefined) continue;
    sum += parseInt(char, 10) * weight;
  }
  
  const checksum = (11 - (sum % 11)) % 10;
  const lastChar = cleaned[12];
  if (!lastChar) return false;
  return checksum === parseInt(lastChar, 10);
};

/**
 * 강력한 비밀번호 검증
 */
export const isStrongPassword = (password: string): boolean => {
  if (!password || typeof password !== 'string') return false;
  return PATTERNS.PASSWORD_STRONG.test(password);
};

/**
 * 숫자 범위 검증
 */
export const isInRange = (value: number, min: number, max: number): boolean => {
  if (typeof value !== 'number' || isNaN(value)) return false;
  return value >= min && value <= max;
};

/**
 * 문자열 길이 검증
 */
export const hasLength = (str: string, min: number, max?: number): boolean => {
  if (!str || typeof str !== 'string') return false;
  const length = str.length;
  if (max !== undefined) {
    return length >= min && length <= max;
  }
  return length >= min;
};

/**
 * 정규식 패턴 검증
 */
export const matchesPattern = (value: string, pattern: RegExp): boolean => {
  if (!value || typeof value !== 'string') return false;
  return pattern.test(value);
};

/**
 * 날짜 검증
 */
export const isValidDate = (date: any): boolean => {
  if (date instanceof Date) {
    return !isNaN(date.getTime());
  }
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
  return false;
};

/**
 * 미래 날짜 검증
 */
export const isFutureDate = (date: Date | string): boolean => {
  if (!isValidDate(date)) return false;
  const dateObj = new Date(date);
  return dateObj.getTime() > Date.now();
};

/**
 * 과거 날짜 검증
 */
export const isPastDate = (date: Date | string): boolean => {
  if (!isValidDate(date)) return false;
  const dateObj = new Date(date);
  return dateObj.getTime() < Date.now();
};

/**
 * 나이 범위 검증
 */
export const isValidAge = (birthDate: Date | string, minAge: number = 0, maxAge: number = 150): boolean => {
  if (!isValidDate(birthDate)) return false;
  
  const birth = new Date(birthDate);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    return age - 1 >= minAge && age - 1 <= maxAge;
  }
  
  return age >= minAge && age <= maxAge;
};

/**
 * JSON 형식 검증
 */
export const isValidJSON = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

/**
 * Base64 검증
 */
export const isBase64 = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return PATTERNS.BASE64.test(str);
};

/**
 * UUID 검증
 */
export const isUUID = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return PATTERNS.UUID.test(str);
};

/**
 * 도메인 검증
 */
export const isDomain = (domain: string): boolean => {
  if (!domain || typeof domain !== 'string') return false;
  return PATTERNS.DOMAIN.test(domain);
};

/**
 * MAC 주소 검증
 */
export const isMacAddress = (mac: string): boolean => {
  if (!mac || typeof mac !== 'string') return false;
  return PATTERNS.MAC_ADDRESS.test(mac);
};

/**
 * HEX 색상 검증
 */
export const isHexColor = (color: string): boolean => {
  if (!color || typeof color !== 'string') return false;
  return PATTERNS.HEX_COLOR.test(color);
};

/**
 * 사용자명 검증
 */
export const isUsername = (username: string): boolean => {
  if (!username || typeof username !== 'string') return false;
  return PATTERNS.USERNAME.test(username);
};

/**
 * 파일명 검증
 */
export const isValidFilename = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false;
  return PATTERNS.FILENAME.test(filename);
};

/**
 * 슬러그 검증
 */
export const isSlug = (slug: string): boolean => {
  if (!slug || typeof slug !== 'string') return false;
  return PATTERNS.SLUG.test(slug);
};

/**
 * 배열 검증
 */
export const isArray = (value: any, minLength?: number, maxLength?: number): boolean => {
  if (!Array.isArray(value)) return false;
  if (minLength !== undefined && value.length < minLength) return false;
  if (maxLength !== undefined && value.length > maxLength) return false;
  return true;
};

/**
 * 객체 검증
 */
export const isObject = (value: any): boolean => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

/**
 * 빈 값 검증
 */
export const isEmpty = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * 숫자 검증
 */
export const isNumber = (value: any): boolean => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

/**
 * 정수 검증
 */
export const isInteger = (value: any): boolean => {
  return Number.isInteger(value);
};

/**
 * 양수 검증
 */
export const isPositive = (value: number): boolean => {
  return isNumber(value) && value > 0;
};

/**
 * 음수 검증
 */
export const isNegative = (value: number): boolean => {
  return isNumber(value) && value < 0;
};

/**
 * 복합 검증 함수들
 */

/**
 * 여러 검증 규칙을 조합
 */
export const validate = (value: any, rules: ValidationRule[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      if (rule.type === 'warning') {
        warnings.push(rule.message);
      } else {
        errors.push(rule.message);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * 필드 검증
 */
export const validateField = (value: any, rules: FieldValidationRule): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 필수 입력 검증
  if (rules.required && !required(value)) {
    errors.push('이 필드는 필수입니다.');
    return { valid: false, errors, warnings };
  }

  // 값이 없으면 다른 검증은 건너뛰기
  if (!required(value)) {
    return { valid: true, errors, warnings };
  }

  // 타입별 검증
  if (rules.type) {
    switch (rules.type) {
      case 'email':
        if (!isEmail(value)) {
          errors.push('올바른 이메일 형식이 아닙니다.');
        }
        break;
      case 'phone':
        if (!isPhone(value)) {
          errors.push('올바른 전화번호 형식이 아닙니다.');
        }
        break;
      case 'url':
        if (!isUrl(value)) {
          errors.push('올바른 URL 형식이 아닙니다.');
        }
        break;
      case 'number':
        if (!isNumber(Number(value))) {
          errors.push('숫자만 입력 가능합니다.');
        }
        break;
      case 'date':
        if (!isValidDate(value)) {
          errors.push('올바른 날짜 형식이 아닙니다.');
        }
        break;
      case 'password':
        if (!isStrongPassword(value)) {
          errors.push('비밀번호는 8자 이상이며 대소문자, 숫자, 특수문자를 포함해야 합니다.');
        }
        break;
    }
  }

  // 길이 검증
  if (typeof value === 'string') {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      errors.push(`최소 ${rules.minLength}자 이상 입력해주세요.`);
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push(`최대 ${rules.maxLength}자까지 입력 가능합니다.`);
    }
  }

  // 패턴 검증
  if (rules.pattern && typeof value === 'string') {
    if (!rules.pattern.test(value)) {
      errors.push('입력 형식이 올바르지 않습니다.');
    }
  }

  // 커스텀 검증
  if (rules.custom) {
    const result = rules.custom(value);
    if (typeof result === 'string') {
      errors.push(result);
    } else if (!result) {
      errors.push('입력값이 유효하지 않습니다.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * 폼 검증
 */
export const validateForm = (
  data: Record<string, any>,
  schema: Record<string, FieldValidationRule>
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [fieldName, rules] of Object.entries(schema)) {
    const fieldValue = data[fieldName];
    const result = validateField(fieldValue, rules);
    
    if (!result.valid) {
      result.errors.forEach(error => {
        errors.push(`${fieldName}: ${error}`);
      });
    }
    
    result.warnings.forEach(warning => {
      warnings.push(`${fieldName}: ${warning}`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * 검증 규칙 빌더
 */
export class ValidationBuilder {
  private rules: ValidationRule[] = [];

  required(message: string = '이 필드는 필수입니다.'): this {
    this.rules.push({
      validate: required,
      message,
      type: 'error'
    });
    return this;
  }

  email(message: string = '올바른 이메일 형식이 아닙니다.'): this {
    this.rules.push({
      validate: isEmail,
      message,
      type: 'error'
    });
    return this;
  }

  phone(format: 'kr' | 'us' | 'international' = 'kr', message?: string): this {
    const defaultMessage = '올바른 전화번호 형식이 아닙니다.';
    this.rules.push({
      validate: (value) => isPhone(value, format),
      message: message || defaultMessage,
      type: 'error'
    });
    return this;
  }

  url(message: string = '올바른 URL 형식이 아닙니다.'): this {
    this.rules.push({
      validate: isUrl,
      message,
      type: 'error'
    });
    return this;
  }

  minLength(length: number, message?: string): this {
    const defaultMessage = `최소 ${length}자 이상 입력해주세요.`;
    this.rules.push({
      validate: (value) => typeof value === 'string' && value.length >= length,
      message: message || defaultMessage,
      type: 'error'
    });
    return this;
  }

  maxLength(length: number, message?: string): this {
    const defaultMessage = `최대 ${length}자까지 입력 가능합니다.`;
    this.rules.push({
      validate: (value) => typeof value === 'string' && value.length <= length,
      message: message || defaultMessage,
      type: 'error'
    });
    return this;
  }

  pattern(regex: RegExp, message: string = '입력 형식이 올바르지 않습니다.'): this {
    this.rules.push({
      validate: (value) => matchesPattern(value, regex),
      message,
      type: 'error'
    });
    return this;
  }

  range(min: number, max: number, message?: string): this {
    const defaultMessage = `${min}과 ${max} 사이의 값을 입력해주세요.`;
    this.rules.push({
      validate: (value) => isInRange(Number(value), min, max),
      message: message || defaultMessage,
      type: 'error'
    });
    return this;
  }

  custom(validator: ValidatorFunction, message: string = '입력값이 유효하지 않습니다.'): this {
    this.rules.push({
      validate: (value) => {
        const result = validator(value);
        return typeof result === 'boolean' ? result : true;
      },
      message,
      type: 'error'
    });
    return this;
  }

  warning(validator: ValidatorFunction, message: string): this {
    this.rules.push({
      validate: (value) => {
        const result = validator(value);
        return typeof result === 'boolean' ? result : true;
      },
      message,
      type: 'warning'
    });
    return this;
  }

  build(): ValidationRule[] {
    return [...this.rules];
  }

  validate(value: any): ValidationResult {
    return validate(value, this.rules);
  }
}

/**
 * 검증 매니저 클래스
 */
export class ValidationManager {
  private validators = new Map<string, ValidationRule[]>();
  private customValidators = new Map<string, ValidatorFunction>();

  /**
   * 검증 규칙 등록
   */
  register(name: string, rules: ValidationRule[]): void {
    this.validators.set(name, rules);
  }

  /**
   * 커스텀 검증 함수 등록
   */
  registerCustom(name: string, validator: ValidatorFunction): void {
    this.customValidators.set(name, validator);
  }

  /**
   * 검증 실행
   */
  validate(name: string, value: any): ValidationResult {
    const rules = this.validators.get(name);
    if (!rules) {
      throw new Error(`Validator "${name}" not found`);
    }
    return validate(value, rules);
  }

  /**
   * 커스텀 검증 실행
   */
  validateCustom(name: string, value: any): boolean | string {
    const validator = this.customValidators.get(name);
    if (!validator) {
      throw new Error(`Custom validator "${name}" not found`);
    }
    return validator(value);
  }

  /**
   * 등록된 검증기 목록
   */
  list(): string[] {
    return Array.from(this.validators.keys());
  }

  /**
   * 검증기 제거
   */
  remove(name: string): boolean {
    return this.validators.delete(name);
  }

  /**
   * 모든 검증기 제거
   */
  clear(): void {
    this.validators.clear();
    this.customValidators.clear();
  }
}

/**
 * 전역 검증 매니저 인스턴스
 */
export const validationManager = new ValidationManager();

/**
 * 편의 함수들
 */

/**
 * 검증 규칙 빌더 생성
 */
export const validator = (): ValidationBuilder => new ValidationBuilder();

/**
 * 빠른 검증
 */
export const quickValidate = {
  email: (value: string) => ({ valid: isEmail(value), message: '올바른 이메일 형식이 아닙니다.' }),
  phone: (value: string) => ({ valid: isPhone(value), message: '올바른 전화번호 형식이 아닙니다.' }),
  url: (value: string) => ({ valid: isUrl(value), message: '올바른 URL 형식이 아닙니다.' }),
  required: (value: any) => ({ valid: required(value), message: '이 필드는 필수입니다.' }),
  number: (value: any) => ({ valid: isNumber(Number(value)), message: '숫자만 입력 가능합니다.' }),
  date: (value: any) => ({ valid: isValidDate(value), message: '올바른 날짜 형식이 아닙니다.' })
};

/**
 * 실시간 검증을 위한 디바운스된 검증 함수
 */
export const createDebouncedValidator = (
  validationFn: (value: any) => ValidationResult,
  delay: number = 300
): ((value: any) => Promise<ValidationResult>) => {
  let timeoutId: number | undefined;
  
  return (value: any): Promise<ValidationResult> => {
    return new Promise(resolve => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = window.setTimeout(() => {
        resolve(validationFn(value));
      }, delay);
    });
  };
};