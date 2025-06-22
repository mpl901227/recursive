# 🎨 Recursive UI Module

Modern TypeScript-based frontend architecture for the Recursive AI Development Assistant.

## 📋 **Overview**

This module represents a complete refactoring of the original monolithic frontend (`core/server/public/`) into a modular, scalable architecture using TypeScript, Vite, and modern web standards.

## 🏗️ **Architecture**

```
src/
├── core/           # Core application systems
├── components/     # UI components (layout, common, features)
├── services/       # Business logic services
├── utils/          # Utility functions
├── types/          # TypeScript type definitions
└── styles/         # Global styles and themes
```

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+ 
- npm 9+

### **Installation**
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### **Development Commands**
```bash
# Development server (http://localhost:3001)
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:ui
npm run test:coverage

# Preview production build
npm run preview
```

## 🎯 **Key Features**

- **⚡ Vite**: Fast development and optimized builds
- **🔷 TypeScript**: Full type safety with strict mode
- **🎨 Modular CSS**: Component-scoped styles with Sass
- **🧪 Testing**: Vitest with UI and coverage
- **📱 Responsive**: Mobile-first design
- **♿ Accessible**: WCAG 2.1 AA compliance
- **🔄 Real-time**: WebSocket and MCP integration

## 📁 **Project Structure**

### **Core Systems**
- `core/app.ts` - Main application class and initialization
- `core/events.ts` - Event management system
- `core/router.ts` - Client-side routing
- `core/config.ts` - Configuration management
- `core/lifecycle.ts` - Application lifecycle management

### **Components**
```
components/
├── layout/         # Layout components (Header, Sidebar, etc.)
├── common/         # Reusable UI components (Button, Modal, etc.)
└── features/       # Feature-specific components (Dashboard, etc.)
```

### **Services**
```
services/
├── websocket/      # WebSocket client and management
├── mcp/           # MCP (Model Context Protocol) integration
├── api/           # HTTP API client
├── storage/       # Local/Session storage management
└── analytics/     # Analytics and monitoring
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000/ws

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DEBUG=false
```

### **Build Configuration**
- `vite.config.js` - Vite build configuration
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.js` - ESLint rules and settings

## 🧪 **Testing**

### **Unit Tests**
```bash
# Run unit tests
npm run test

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### **E2E Tests**
```bash
# Run end-to-end tests (requires Playwright)
npm run test:e2e
```

## 🎨 **Styling**

### **CSS Architecture**
```
styles/
├── globals.scss    # Global styles and resets
├── variables.scss  # CSS custom properties
├── mixins.scss     # Sass mixins and functions
└── themes.scss     # Theme definitions
```

### **Design System**
- **Colors**: CSS custom properties with dark/light themes
- **Typography**: System font stack with consistent sizing
- **Spacing**: 8px grid system
- **Breakpoints**: Mobile-first responsive design

## 🔌 **API Integration**

### **WebSocket Connection**
```typescript
import { WebSocketManager } from '@/services/websocket';

const wsManager = new WebSocketManager({
  url: 'ws://localhost:3000/ws',
  protocols: ['recursive-protocol'],
  heartbeat: { interval: 30000 }
});

await wsManager.connect();
```

### **MCP Client**
```typescript
import { MCPManager } from '@/services/mcp';

const mcpManager = new MCPManager({
  timeout: 5000,
  retryAttempts: 3
});

const result = await mcpManager.executeTool('analyze-code', { 
  file: 'src/app.ts' 
});
```

## 🚀 **Deployment**

### **Production Build**
```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

### **Build Outputs**
- `build/` - Production-ready static files
- `build/assets/` - Optimized CSS, JS, and media files
- `build/index.html` - Entry point with inlined critical CSS

## 📊 **Performance**

### **Bundle Analysis**
- **Target**: < 500KB total bundle size
- **Code Splitting**: Route-based chunks
- **Tree Shaking**: Automatic dead code elimination
- **Asset Optimization**: Minified CSS/JS, optimized images

### **Runtime Performance**
- **Initial Load**: < 3 seconds on 3G
- **First Paint**: < 1.5 seconds
- **Interactive**: < 2.5 seconds
- **Memory Usage**: < 50MB baseline

## 🔍 **Debugging**

### **Development Tools**
- **DevTools Integration**: Full source maps
- **Hot Module Replacement**: Instant updates
- **Error Boundaries**: Graceful error handling
- **Performance Profiling**: Built-in metrics

### **Debug Mode**
```bash
# Enable debug mode
VITE_ENABLE_DEBUG=true npm run dev
```

## 🤝 **Contributing**

### **Code Style**
- **ESLint**: Enforced code style and quality
- **Prettier**: Consistent code formatting
- **TypeScript**: Strict type checking enabled
- **Conventional Commits**: Standardized commit messages

### **Development Workflow**
1. Create feature branch from `main`
2. Implement changes with tests
3. Run linting and type checking
4. Submit pull request with description
5. Code review and approval
6. Merge to main branch

## 📚 **Documentation**

### **API Documentation**
- **TypeScript**: Self-documenting with JSDoc
- **Components**: Storybook documentation (planned)
- **Services**: API reference with examples

### **Guides**
- **Component Development**: Best practices and patterns
- **Service Integration**: Adding new services
- **Performance Optimization**: Tips and techniques

## 🔗 **Related Modules**

- **Log System**: `../log-system/` - Centralized logging
- **MCP Protocol**: `../mcp-protocol/` - Protocol implementation
- **WebSocket Protocol**: `../websocket-protocol/` - WebSocket handling
- **AI Analysis**: `../ai-analysis/` - AI-powered analysis tools

## 📄 **License**

MIT License - see `../../../LICENSE` for details.

## 🆘 **Support**

- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Documentation**: See `docs/` folder for detailed guides

---

**🚀 Built with modern web technologies for the future of AI-assisted development.** 