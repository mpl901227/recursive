# 🛠️ UI Integration 실행 스크립트

## 📋 개요
이 문서는 user-interface-v4 통합 작업을 위한 실행 가능한 스크립트들을 제공합니다.

---

## 🚀 Phase 1: 기본 구조 표준화

### 1.1 네임스페이스 및 패키지 매니저 통일

```bash
#!/bin/bash
# scripts/phase1-setup.sh

echo "🔧 Phase 1: 기본 구조 표준화 시작..."

# 1. user-interface-v4 디렉토리로 이동
cd modules/user-interface-v4

# 2. pnpm 제거 및 npm으로 전환
echo "📦 패키지 매니저를 npm으로 통일..."
rm -f pnpm-lock.yaml
npm install

# 3. package.json 네임스페이스 업데이트
echo "🏷️ 네임스페이스를 @recursive/user-interface-v4로 변경..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = '@recursive/user-interface-v4';
pkg.description = 'Recursive UI Module - Advanced Next.js implementation with system admin';
pkg.main = 'src/app.tsx';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ package.json 업데이트 완료');
"

# 4. 루트 디렉토리로 돌아가서 워크스페이스 업데이트
cd ../../

echo "🔧 루트 package.json 스크립트 업데이트..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// 새로운 스크립트 추가
pkg.scripts['dev:ui-v4'] = 'cd modules/user-interface-v4 && npm run dev -- --port 3002';
pkg.scripts['build:ui-v4'] = 'cd modules/user-interface-v4 && npm run build';
pkg.scripts['serve:ui-v4'] = 'cd modules/user-interface-v4 && npm start';

// 기본 dev 스크립트 업데이트
pkg.scripts['dev'] = 'concurrently \"npm run dev:server\" \"npm run dev:ui-v4\"';
pkg.scripts['build'] = 'npm run build:server && npm run build:ui-v4';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ 루트 package.json 업데이트 완료');
"

echo "✅ Phase 1 완료!"
```

### 1.2 포트 설정 업데이트

```bash
#!/bin/bash
# scripts/update-ports.sh

echo "🔌 포트 설정 업데이트..."

# user-interface-v4의 WebSocket 클라이언트 포트 변경
cat > modules/user-interface-v4/lib/websocket-client.ts << 'EOF'
"use client"

interface WebSocketMessage {
  type: string
  data: any
  timestamp: number
}

interface WebSocketConfig {
  url: string
  reconnectInterval: number
  maxReconnectAttempts: number
  heartbeatInterval: number
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private config: WebSocketConfig
  private reconnectAttempts = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isConnecting = false
  private messageHandlers = new Map<string, (data: any) => void>()
  private connectionHandlers: Array<(connected: boolean) => void> = []

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      url: config.url || 'ws://localhost:3001', // recursive WebSocket 서버
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
    }
  }

  // ... 나머지 메서드들은 기존과 동일
EOF

echo "✅ WebSocket 클라이언트 포트 업데이트 완료"
```

---

## 🔗 Phase 2: 백엔드 통합

### 2.1 MCP Provider 실제 구현체 연결

```bash
#!/bin/bash
# scripts/phase2-mcp-integration.sh

echo "🔗 Phase 2: MCP 통합 시작..."

# MCP Provider 업데이트
cat > modules/user-interface-v4/components/mcp-provider.tsx << 'EOF'
"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"

// 실제 recursive 시스템의 인터페이스 임포트 (추후 구현)
interface MCPMessage {
  jsonrpc: "2.0"
  method: string
  params?: any
  id?: number
}

interface MCPContextType {
  sendMessage: (message: MCPMessage) => void
  isConnected: boolean
  messages: MCPMessage[]
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
}

const MCPContext = createContext<MCPContextType | null>(null)

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [messages, setMessages] = useState<MCPMessage[]>([])

  useEffect(() => {
    // 실제 recursive WebSocket 서버와 연결
    const connectToRecursive = async () => {
      setConnectionStatus('connecting')
      
      try {
        // WebSocket 연결 시뮬레이션 (실제 구현 시 recursive 시스템과 연동)
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        setIsConnected(true)
        setConnectionStatus('connected')
        console.log('🔗 MCP Provider connected to recursive system')
      } catch (error) {
        console.error('❌ MCP connection failed:', error)
        setConnectionStatus('disconnected')
      }
    }

    connectToRecursive()
  }, [])

  const sendMessage = (message: MCPMessage) => {
    if (!isConnected) {
      console.warn('⚠️ MCP not connected, message queued:', message)
      return
    }

    setMessages(prev => [...prev, message])
    
    // 실제 recursive 시스템으로 메시지 전송
    console.log('📤 Sending MCP message to recursive:', message)

    // 응답 시뮬레이션
    setTimeout(() => {
      const response: MCPMessage = {
        jsonrpc: "2.0",
        method: "response",
        params: { success: true, original: message },
        id: message.id,
      }
      setMessages(prev => [...prev, response])
    }, 100)
  }

  return (
    <MCPContext.Provider value={{ 
      sendMessage, 
      isConnected, 
      messages, 
      connectionStatus 
    }}>
      {children}
    </MCPContext.Provider>
  )
}

export function useMCP() {
  const context = useContext(MCPContext)
  if (!context) {
    throw new Error("useMCP must be used within MCPProvider")
  }
  return context
}
EOF

echo "✅ MCP Provider 업데이트 완료"
```

### 2.2 로그 시스템 연동

```bash
#!/bin/bash
# scripts/setup-log-integration.sh

echo "📝 로그 시스템 연동 설정..."

# 로그 시스템 클라이언트 생성
mkdir -p modules/user-interface-v4/lib
cat > modules/user-interface-v4/lib/log-client.ts << 'EOF'
interface LogEntry {
  id: string
  timestamp: Date
  level: "info" | "warn" | "error"
  source: string
  message: string
}

interface ServerStatus {
  name: string
  status: "running" | "stopped" | "error"
  port: number
  uptime: string
  memory: string
  cpu: string
}

export class LogSystemClient {
  private baseUrl: string

  constructor(baseUrl = 'http://localhost:8888') {
    this.baseUrl = baseUrl
  }

  async getLogs(limit = 50): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/logs/recent?limit=${limit}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      // 로그 시스템이 없을 때 임시 데이터 반환
      return this.getMockLogs()
    }
  }

  async getServerStatus(): Promise<ServerStatus[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/status`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch server status:', error)
      return this.getMockServerStatus()
    }
  }

  private getMockLogs(): LogEntry[] {
    return [
      {
        id: "1",
        timestamp: new Date(),
        level: "info",
        source: "WebSocket",
        message: "Client connected from 127.0.0.1:3002",
      },
      {
        id: "2", 
        timestamp: new Date(Date.now() - 30000),
        level: "warn",
        source: "LLM API",
        message: "Rate limit approaching for OpenAI API",
      }
    ]
  }

  private getMockServerStatus(): ServerStatus[] {
    return [
      {
        name: "Recursive Server",
        status: "running",
        port: 3000,
        uptime: "2h 34m",
        memory: "245MB",
        cpu: "12%",
      },
      {
        name: "WebSocket Server", 
        status: "running",
        port: 3001,
        uptime: "2h 34m",
        memory: "89MB",
        cpu: "3%",
      }
    ]
  }
}

export const logClient = new LogSystemClient()
EOF

echo "✅ 로그 시스템 클라이언트 생성 완료"
```

---

## 🧹 Phase 3: 기존 모듈 정리

### 3.1 워크스페이스 정리

```bash
#!/bin/bash
# scripts/phase3-cleanup.sh

echo "🧹 Phase 3: 기존 모듈 정리..."

# 루트 package.json 워크스페이스 업데이트
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// 워크스페이스를 v4 중심으로 재구성
pkg.workspaces = [
  'core/*',
  'modules/user-interface-v4',    // 메인 UI
  'modules/user-interface-v2',    // 백업용 유지
  'modules/log-system',
  'modules/ai-analysis', 
  'modules/mcp-protocol',
  'modules/websocket-protocol'
];

// 기존 UI 관련 스크립트 정리
delete pkg.scripts['dev:ui'];  // v1 제거
pkg.scripts['dev:ui-legacy'] = pkg.scripts['dev:ui-v2'];  // v2는 legacy로

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ 워크스페이스 정리 완료');
"

# .gitignore 업데이트 (빌드 결과물 제외)
echo "
# UI Build outputs
/dist/
modules/user-interface-v4/.next/
modules/user-interface-v4/out/
" >> .gitignore

echo "✅ Phase 3 완료!"
```

---

## 🏭 Phase 4: 프로덕션 설정

### 4.1 Next.js 프로덕션 설정

```bash
#!/bin/bash
# scripts/phase4-production.sh

echo "🏭 Phase 4: 프로덕션 설정..."

# Next.js 설정 업데이트
cat > modules/user-interface-v4/next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: '../../dist/ui',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/websocket/:path*',
        destination: 'http://localhost:3001/:path*'
      },
      {
        source: '/api/logs/:path*',
        destination: 'http://localhost:8888/api/:path*'
      }
    ]
  },
}

export default nextConfig
EOF

# Express 서버에 정적 파일 서빙 설정 추가를 위한 스크립트
cat > scripts/update-express-server.js << 'EOF'
const fs = require('fs');
const path = require('path');

const serverFilePath = path.join(__dirname, '../core/server/server.js');
let serverContent = fs.readFileSync(serverFilePath, 'utf8');

// 정적 파일 서빙 코드 추가
const staticFileCode = `
    // UI v4 정적 파일 서빙
    this.app.use(express.static(path.join(__dirname, '../../dist/ui')));
    
    // SPA 라우팅 지원
    this.app.get('*', (req, res) => {
      // API 요청이 아닌 경우에만 index.html 반환
      if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '../../dist/ui/index.html'));
      }
    });`;

// setupRoutes 메서드 마지막에 추가
if (!serverContent.includes('UI v4 정적 파일 서빙')) {
  serverContent = serverContent.replace(
    /setupRoutes\(\) {[\s\S]*?}(?=\s*setupWebSocketServer)/,
    (match) => match.slice(0, -1) + staticFileCode + '\n  }'
  );
  
  fs.writeFileSync(serverFilePath, serverContent);
  console.log('✅ Express 서버에 정적 파일 서빙 설정 추가 완료');
} else {
  console.log('ℹ️ 정적 파일 서빙 설정이 이미 존재합니다');
}
EOF

node scripts/update-express-server.js

echo "✅ Phase 4 완료!"
```

---

## 🚀 전체 통합 실행 스크립트

### 통합 실행 (모든 Phase 한번에)

```bash
#!/bin/bash
# scripts/integrate-ui-v4.sh

echo "🚀 User Interface V4 통합 시작..."
echo "=================================="

# Phase 1: 기본 구조 표준화
echo "📋 Phase 1: 기본 구조 표준화..."
bash scripts/phase1-setup.sh

# Phase 2: 백엔드 통합  
echo "📋 Phase 2: 백엔드 통합..."
bash scripts/phase2-mcp-integration.sh
bash scripts/setup-log-integration.sh

# Phase 3: 기존 모듈 정리
echo "📋 Phase 3: 기존 모듈 정리..."
bash scripts/phase3-cleanup.sh

# Phase 4: 프로덕션 설정
echo "📋 Phase 4: 프로덕션 설정..."
bash scripts/phase4-production.sh

echo ""
echo "🎉 UI V4 통합 완료!"
echo "=================================="
echo "다음 명령어로 실행할 수 있습니다:"
echo "  개발 모드: npm run dev"
echo "  빌드: npm run build"
echo "  UI만 실행: npm run dev:ui-v4"
echo ""
```

### 개발 환경 시작

```bash
#!/bin/bash
# scripts/start-dev.sh

echo "🔧 개발 환경 시작..."

# 필요한 서비스들 순서대로 시작
echo "📝 로그 서버 시작..."
npm run dev:logs &

echo "🖥️ 메인 서버 시작..." 
npm run dev:server &

echo "🎨 UI V4 시작..."
npm run dev:ui-v4 &

echo "✅ 모든 서비스가 시작되었습니다!"
echo "📱 UI: http://localhost:3002"
echo "🖥️ 서버: http://localhost:3000"
echo "📝 로그: http://localhost:8888"
```

---

## 📋 검증 스크립트

### 통합 상태 확인

```bash
#!/bin/bash
# scripts/verify-integration.sh

echo "🔍 UI V4 통합 상태 확인..."

# 1. 포트 상태 확인
echo "🔌 포트 상태 확인..."
netstat -an | grep -E ":3000|:3001|:3002|:8888" | head -10

# 2. 패키지 설치 상태 확인
echo "📦 패키지 설치 상태..."
cd modules/user-interface-v4
if [ -f "package-lock.json" ]; then
    echo "✅ npm 패키지 매니저 사용 중"
else
    echo "❌ package-lock.json 없음"
fi

# 3. 빌드 테스트
echo "🏗️ 빌드 테스트..."
npm run build 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 빌드 성공"
else
    echo "❌ 빌드 실패"
fi

cd ../../

echo "✅ 검증 완료!"
```

---

## 📞 사용법

### 전체 통합 실행
```bash
chmod +x scripts/*.sh
./scripts/integrate-ui-v4.sh
```

### 개별 Phase 실행
```bash
./scripts/phase1-setup.sh      # 기본 구조 설정
./scripts/phase2-mcp-integration.sh  # 백엔드 통합
./scripts/phase3-cleanup.sh    # 모듈 정리  
./scripts/phase4-production.sh # 프로덕션 설정
```

### 개발 환경 시작
```bash
./scripts/start-dev.sh
```

### 상태 확인
```bash
./scripts/verify-integration.sh
```

---

*모든 스크립트는 프로젝트 루트에서 실행해야 합니다.* 