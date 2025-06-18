# 🔧 Recursive 로그 시스템 환경 설정 가이드

## 📋 **목차**
- [개요](#개요)
- [환경별 설정 파일](#환경별-설정-파일)
- [환경 변수 설정](#환경-변수-설정)
- [개발 환경 설정](#개발-환경-설정)
- [프로덕션 환경 설정](#프로덕션-환경-설정)
- [테스트 환경 설정](#테스트-환경-설정)
- [Docker 환경 설정](#docker-환경-설정)
- [트러블슈팅](#트러블슈팅)

---

## 🎯 **개요**

Recursive 로그 시스템은 환경별로 최적화된 설정을 제공합니다. 개발, 테스트, 프로덕션 환경에서 각각 다른 설정을 사용하여 최적의 성능과 보안을 제공합니다.

### **지원하는 환경**
- `development`: 개발 환경 (디버깅 최적화)
- `production`: 프로덕션 환경 (성능, 보안 최적화)
- `test`: 테스트 환경 (격리, 속도 최적화)

---

## 📁 **환경별 설정 파일**

```
modules/log-system/config/
├── default.yaml       # 기본 설정
├── recursive.yaml     # Recursive 특화 설정
├── development.yaml   # 개발 환경 설정
├── production.yaml    # 프로덕션 환경 설정
├── test.yaml         # 테스트 환경 설정 (자동 생성)
└── schema.json       # 설정 스키마
```

### **설정 우선순위**
1. **환경 변수** (최고 우선순위)
2. **환경별 설정 파일** (`development.yaml`, `production.yaml`)
3. **Recursive 특화 설정** (`recursive.yaml`)
4. **기본 설정** (`default.yaml`)

---

## 🌍 **환경 변수 설정**

### **기본 환경 변수**

```bash
# 환경 지정
NODE_ENV=development  # development, production, test

# 로그 시스템 기본 설정
LOG_HOST=localhost           # 서버 호스트
LOG_PORT=8888               # 서버 포트
LOG_LEVEL=INFO              # 로그 레벨 (DEBUG, INFO, WARN, ERROR)
PYTHON_PATH=python          # Python 실행 경로

# 데이터베이스 설정
LOG_DB_PATH=./logs/recursive_logs.db  # DB 파일 경로
LOG_MAX_SIZE_MB=1000                  # 최대 DB 크기 (MB)
LOG_RETENTION_DAYS=30                 # 로그 보관 기간 (일)
```

### **성능 관련 환경 변수**

```bash
# 배치 처리
LOG_BATCH_SIZE=100           # 배치 크기
LOG_FLUSH_INTERVAL=5000      # 플러시 간격 (ms)
LOG_MAX_QUEUE=1000           # 최대 큐 크기

# 레이트 리미팅
LOG_RATE_LIMIT=100           # 초당 최대 로그 수
LOG_BURST_LIMIT=500          # 버스트 한계

# 메모리 관리
LOG_BUFFER_SIZE=1000         # 버퍼 크기
GC_INTERVAL=60000            # GC 간격 (ms)
MAX_MEMORY_MB=100            # 최대 메모리 사용량 (MB)
```

### **보안 관련 환경 변수**

```bash
# 접근 제어
ALLOWED_IPS=127.0.0.1,::1   # 허용된 IP 주소
API_KEY_REQUIRED=false       # API 키 필수 여부
LOG_API_KEY=                 # API 키

# 암호화
ENCRYPT_LOGS=false           # 로그 암호화 여부
LOG_ENCRYPTION_KEY=          # 암호화 키
```

### **알림 관련 환경 변수**

```bash
# 알림 임계값
ALERT_ERROR_THRESHOLD=20     # 에러 알림 임계값
ALERT_ERROR_WINDOW=300       # 에러 감지 윈도우 (초)
ALERT_COOLDOWN=600           # 알림 쿨다운 (초)
ALERT_SLOW_THRESHOLD=2000    # 느린 요청 임계값 (ms)
ALERT_MEMORY_THRESHOLD=100   # 메모리 알림 임계값 (MB)

# 알림 채널
WEBHOOK_ALERTS_ENABLED=false # 웹훅 알림 활성화
WEBHOOK_URL=                 # 웹훅 URL
EMAIL_ALERTS_ENABLED=false   # 이메일 알림 활성화
SMTP_HOST=                   # SMTP 서버
SMTP_PORT=587                # SMTP 포트
SMTP_USER=                   # SMTP 사용자명
SMTP_PASS=                   # SMTP 비밀번호
ALERT_EMAIL_TO=              # 알림 받을 이메일
```

### **백업 관련 환경 변수**

```bash
# 로컬 백업
LOG_BACKUP_INTERVAL=24h      # 백업 간격
LOG_BACKUP_PATH=./backups    # 백업 경로
BACKUP_RETENTION=30          # 백업 보관 기간 (일)

# 원격 백업 (S3)
REMOTE_BACKUP_ENABLED=false  # 원격 백업 활성화
BACKUP_PROVIDER=s3           # 백업 제공자
BACKUP_BUCKET=               # S3 버킷명
AWS_ACCESS_KEY=              # AWS 액세스 키
AWS_SECRET_KEY=              # AWS 시크릿 키
AWS_REGION=us-east-1         # AWS 리전
```

---

## 🔨 **개발 환경 설정**

### **.env.development**

```bash
# 개발 환경 설정
NODE_ENV=development

# 기본 설정
LOG_HOST=localhost
LOG_PORT=8888
LOG_LEVEL=DEBUG
PYTHON_PATH=python

# 데이터베이스
LOG_DB_PATH=./logs/dev_logs.db
LOG_MAX_SIZE_MB=100
LOG_RETENTION_DAYS=7

# 성능 (개발 최적화)
LOG_BATCH_SIZE=10            # 작은 배치로 즉시 확인
LOG_FLUSH_INTERVAL=1000      # 빠른 플러시
LOG_RATE_LIMIT=0             # 제한 없음

# 알림 (즉시 피드백)
ALERT_ERROR_THRESHOLD=1      # 민감한 감지
ALERT_ERROR_WINDOW=60
ALERT_COOLDOWN=60
ALERT_SLOW_THRESHOLD=500     # 낮은 임계값

# 디버깅
LOG_SQL_QUERIES=true         # SQL 쿼리 로깅
INCLUDE_STACK_TRACES=true    # 스택 트레이스 포함
ENABLE_PROFILING=true        # 프로파일링 활성화
```

### **개발 환경 시작**

```bash
# 1. 환경 변수 설정
cp .env.development .env

# 2. 개발 모드로 시작
npm run logs:dev

# 3. 또는 수동으로 설정
NODE_ENV=development npm start
```

---

## 🚀 **프로덕션 환경 설정**

### **.env.production**

```bash
# 프로덕션 환경 설정
NODE_ENV=production

# 기본 설정
LOG_HOST=0.0.0.0             # 모든 인터페이스
LOG_PORT=8888
LOG_LEVEL=WARN               # 경고 이상만
PYTHON_PATH=python3

# 데이터베이스 (대용량)
LOG_DB_PATH=/var/log/recursive/prod_logs.db
LOG_MAX_SIZE_MB=5000
LOG_RETENTION_DAYS=90

# 성능 최적화
LOG_BATCH_SIZE=500
LOG_FLUSH_INTERVAL=2000
LOG_RATE_LIMIT=200
LOG_BURST_LIMIT=1000
MAX_MEMORY_MB=300

# 보안
ALLOWED_IPS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
API_KEY_REQUIRED=true
LOG_API_KEY=your-secure-api-key-here
ENCRYPT_LOGS=true
LOG_ENCRYPTION_KEY=your-encryption-key-here

# 알림 (프로덕션 수준)
ALERT_ERROR_THRESHOLD=50
ALERT_ERROR_WINDOW=300
ALERT_COOLDOWN=1800
ALERT_SLOW_THRESHOLD=5000
ALERT_MEMORY_THRESHOLD=200

# 웹훅 알림
WEBHOOK_ALERTS_ENABLED=true
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# 이메일 알림
EMAIL_ALERTS_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourcompany.com
SMTP_PASS=your-app-password
ALERT_EMAIL_TO=devops@yourcompany.com

# 백업
LOG_BACKUP_INTERVAL=12h
LOG_BACKUP_PATH=/var/backups/recursive/logs
BACKUP_RETENTION=30

# S3 백업
REMOTE_BACKUP_ENABLED=true
BACKUP_PROVIDER=s3
BACKUP_BUCKET=recursive-logs-backup
AWS_ACCESS_KEY=AKIA...
AWS_SECRET_KEY=...
AWS_REGION=us-east-1
```

### **프로덕션 배포**

```bash
# 1. 프로덕션 환경 변수 설정
cp .env.production .env

# 2. 디렉토리 생성
sudo mkdir -p /var/log/recursive
sudo mkdir -p /var/backups/recursive/logs
sudo chown -R app:app /var/log/recursive
sudo chown -R app:app /var/backups/recursive

# 3. PM2로 시작
pm2 start ecosystem.config.js --env production

# 4. 로그 로테이션 설정
sudo cp scripts/logrotate.conf /etc/logrotate.d/recursive-logs
```

---

## 🧪 **테스트 환경 설정**

### **.env.test**

```bash
# 테스트 환경 설정
NODE_ENV=test

# 기본 설정
LOG_HOST=localhost
LOG_PORT=8889               # 다른 포트 사용
LOG_LEVEL=ERROR             # 에러만 로깅
PYTHON_PATH=python

# 테스트 전용 데이터베이스
LOG_DB_PATH=./logs/test_logs.db
LOG_MAX_SIZE_MB=10          # 작은 크기
LOG_RETENTION_DAYS=1        # 짧은 보관

# 성능 (테스트 최적화)
LOG_BATCH_SIZE=1            # 즉시 처리
LOG_FLUSH_INTERVAL=100      # 빠른 플러시
LOG_RATE_LIMIT=0            # 제한 없음

# 알림 비활성화
ALERT_ERROR_THRESHOLD=999999
WEBHOOK_ALERTS_ENABLED=false
EMAIL_ALERTS_ENABLED=false

# 테스트 전용 설정
AUTO_CLEANUP=true           # 자동 정리
MOCK_DATA_ENABLED=true      # 모킹 데이터
```

### **테스트 실행**

```bash
# 1. 테스트 환경 변수 설정
NODE_ENV=test npm test

# 2. 또는 별도 설정으로
cp .env.test .env
npm test
```

---

## 🐳 **Docker 환경 설정**

### **Dockerfile**

```dockerfile
FROM node:18-alpine

# Python 설치 (로그 시스템 코어용)
RUN apk add --no-cache python3 py3-pip

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 복사 및 설치
COPY package*.json ./
COPY requirements.txt ./
RUN npm ci --only=production
RUN pip3 install -r requirements.txt

# 소스 코드 복사
COPY . .

# 로그 디렉토리 생성
RUN mkdir -p /app/logs

# 권한 설정
RUN addgroup -g 1001 -S nodejs
RUN adduser -S app -u 1001
RUN chown -R app:nodejs /app
USER app

# 환경 변수
ENV NODE_ENV=production
ENV LOG_HOST=0.0.0.0
ENV LOG_PORT=8888
ENV LOG_DB_PATH=/app/logs/prod_logs.db

# 포트 노출
EXPOSE 8888

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8888/health || exit 1

# 시작 명령
CMD ["npm", "start"]
```

### **docker-compose.yml**

```yaml
version: '3.8'

services:
  recursive-app:
    build: .
    ports:
      - "3000:3000"
      - "8888:8888"  # 로그 시스템 포트
    environment:
      - NODE_ENV=production
      - LOG_HOST=0.0.0.0
      - LOG_PORT=8888
      - LOG_LEVEL=WARN
      - LOG_DB_PATH=/app/logs/prod_logs.db
      - LOG_MAX_SIZE_MB=1000
      - LOG_RETENTION_DAYS=30
      - ALERT_ERROR_THRESHOLD=20
      - WEBHOOK_ALERTS_ENABLED=true
      - WEBHOOK_URL=${WEBHOOK_URL}
    volumes:
      - logs_data:/app/logs
      - backup_data:/app/backups
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8888/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 선택사항: 로그 뷰어 (향후 구현)
  log-viewer:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./logs:/usr/share/nginx/html/logs:ro
    depends_on:
      - recursive-app

volumes:
  logs_data:
  backup_data:
```

### **Docker 환경 변수 파일**

**.env.docker**
```bash
# Docker 환경 설정
COMPOSE_PROJECT_NAME=recursive
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
LOG_MAX_SIZE_MB=2000
LOG_RETENTION_DAYS=60
ALERT_ERROR_THRESHOLD=30
```

### **Docker 실행**

```bash
# 1. 환경 파일 설정
cp .env.docker .env

# 2. Docker Compose로 시작
docker-compose up -d

# 3. 로그 확인
docker-compose logs -f recursive-app

# 4. 헬스체크
docker-compose exec recursive-app curl http://localhost:8888/health
```

---

## 🔍 **트러블슈팅**

### **일반적인 문제들**

#### **1. Python 서버가 시작되지 않음**
```bash
# 문제: Python 경로 오류
# 해결: Python 경로 확인
which python3
export PYTHON_PATH=python3

# 문제: 의존성 누락
# 해결: 의존성 재설치
pip install -r requirements.txt
```

#### **2. 환경 변수가 적용되지 않음**
```bash
# 문제: .env 파일 위치 오류
# 해결: 프로젝트 루트에 .env 파일 위치 확인
ls -la .env

# 문제: 환경 변수 우선순위
# 해결: 시스템 환경 변수 확인
printenv | grep LOG_
```

#### **3. 로그 파일 권한 오류**
```bash
# 문제: 로그 디렉토리 권한 부족
# 해결: 권한 수정
sudo mkdir -p /var/log/recursive
sudo chown -R $USER:$USER /var/log/recursive
chmod 755 /var/log/recursive
```

#### **4. 메모리 사용량 증가**
```bash
# 문제: 메모리 누수
# 해결: 설정 최적화
export LOG_BATCH_SIZE=100
export GC_INTERVAL=30000
export MAX_MEMORY_MB=200

# 로그 레벨 조정
export LOG_LEVEL=WARN
```

#### **5. 성능 저하**
```bash
# 문제: 배치 처리 비활성화
# 해결: 배치 처리 활성화
export LOG_BATCH_SIZE=500
export LOG_FLUSH_INTERVAL=2000

# 인덱싱 확인
# 로그 시스템 재시작
npm restart
```

### **로그 파일 위치**

```bash
# 개발 환경
./logs/dev_logs.db
./logs/dev_alerts.log

# 프로덕션 환경
/var/log/recursive/prod_logs.db
/var/log/recursive/alerts.log
/var/log/recursive/audit.log

# 테스트 환경
./logs/test_logs.db

# Docker 환경
/app/logs/prod_logs.db
```

### **디버깅 명령어**

```bash
# 환경 변수 확인
npm run logs:env

# 설정 검증
npm run logs:config

# 연결 테스트
npm run logs:test

# 상태 확인
npm run logs:status

# 로그 뷰어 (개발용)
npm run logs:view
```

---

## 📚 **추가 자료**

- [LOG_SYSTEM_INTEGRATION_PLAN.md](../LOG_SYSTEM_INTEGRATION_PLAN.md) - 전체 통합 계획
- [API 문서](./API.md) - API 사용법
- [성능 튜닝 가이드](./PERFORMANCE.md) - 성능 최적화
- [보안 가이드](./SECURITY.md) - 보안 설정

---

**🎯 이제 환경에 맞는 설정을 선택하고 시작하세요!** 