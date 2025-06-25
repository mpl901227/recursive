"use client"

import { useState, useEffect } from "react"
import {
  Server,
  Terminal,
  FolderTree,
  Activity,
  Database,
  Globe,
  Settings,
  Play,
  Square,
  RotateCcw,
  Eye,
  FileText,
  Code,
  Cpu,
  HardDrive,
  Network,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SystemAdminProps {
  onMessage: (message: string) => void
}

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

interface FileNode {
  name: string
  type: "file" | "folder"
  path: string
  size?: string
  modified?: Date
  children?: FileNode[]
}

export function SystemAdmin({ onMessage }: SystemAdminProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "1",
      timestamp: new Date(),
      level: "info",
      source: "WebSocket",
      message: "Client connected from 127.0.0.1:3001",
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 30000),
      level: "warn",
      source: "LLM API",
      message: "Rate limit approaching for OpenAI API",
    },
    {
      id: "3",
      timestamp: new Date(Date.now() - 60000),
      level: "error",
      source: "Database",
      message: "Connection timeout to PostgreSQL",
    },
  ])

  const [servers] = useState<ServerStatus[]>([
    {
      name: "Next.js Dev Server",
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
    },
    {
      name: "Database Server",
      status: "error",
      port: 5432,
      uptime: "0m",
      memory: "0MB",
      cpu: "0%",
    },
  ])

  const [fileTree] = useState<FileNode>({
    name: "recursive-ide",
    type: "folder",
    path: "/",
    children: [
      {
        name: "app",
        type: "folder",
        path: "/app",
        children: [
          { name: "page.tsx", type: "file", path: "/app/page.tsx", size: "2.1KB", modified: new Date() },
          { name: "layout.tsx", type: "file", path: "/app/layout.tsx", size: "1.8KB", modified: new Date() },
          {
            name: "api",
            type: "folder",
            path: "/app/api",
            children: [
              { name: "llm", type: "folder", path: "/app/api/llm" },
              { name: "websocket", type: "folder", path: "/app/api/websocket" },
            ],
          },
        ],
      },
      {
        name: "components",
        type: "folder",
        path: "/components",
        children: [
          { name: "header.tsx", type: "file", path: "/components/header.tsx", size: "3.2KB" },
          { name: "main-content.tsx", type: "file", path: "/components/main-content.tsx", size: "5.1KB" },
          { name: "system-admin.tsx", type: "file", path: "/components/system-admin.tsx", size: "8.7KB" },
        ],
      },
      {
        name: "lib",
        type: "folder",
        path: "/lib",
        children: [
          { name: "websocket-client.ts", type: "file", path: "/lib/websocket-client.ts", size: "4.3KB" },
          { name: "llm-api.ts", type: "file", path: "/lib/llm-api.ts", size: "2.9KB" },
        ],
      },
      { name: "package.json", type: "file", path: "/package.json", size: "1.2KB" },
      { name: "tailwind.config.ts", type: "file", path: "/tailwind.config.ts", size: "0.8KB" },
    ],
  })

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>("")

  useEffect(() => {
    // Simulate real-time log updates
    const interval = setInterval(() => {
      const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date(),
        level: Math.random() > 0.7 ? "warn" : "info",
        source: ["WebSocket", "LLM API", "Database", "File System"][Math.floor(Math.random() * 4)],
        message: ["Heartbeat received", "Request processed successfully", "Cache updated", "Background task completed"][
          Math.floor(Math.random() * 4)
        ],
      }
      setLogs((prev) => [newLog, ...prev.slice(0, 49)]) // Keep last 50 logs
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const handleFileSelect = (node: FileNode) => {
    if (node.type === "file") {
      setSelectedFile(node.path)
      // Mock file content
      setFileContent(
        `// ${node.name}\n// Path: ${node.path}\n// Size: ${node.size}\n\n// This is mock content for demonstration\nexport default function Component() {\n  return <div>Hello World</div>\n}`,
      )
      onMessage(`Opened file: ${node.path}`)
    }
  }

  const renderFileTree = (node: FileNode, level = 0) => {
    const Icon = node.type === "folder" ? FolderTree : FileText

    return (
      <div key={node.path}>
        <div
          className={`flex items-center space-x-2 p-1 hover:bg-gray-100 rounded cursor-pointer ${
            selectedFile === node.path ? "bg-blue-100" : ""
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFileSelect(node)}
        >
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="text-sm">{node.name}</span>
          {node.size && <span className="text-xs text-gray-400 ml-auto">{node.size}</span>}
        </div>
        {node.children?.map((child) => renderFileTree(child, level + 1))}
      </div>
    )
  }

  const getStatusIcon = (status: ServerStatus["status"]) => {
    switch (status) {
      case "running":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case "stopped":
        return <XCircle className="w-4 h-4 text-gray-500" />
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-500" />
    }
  }

  const getLogLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "info":
        return "text-blue-600 bg-blue-50"
      case "warn":
        return "text-yellow-600 bg-yellow-50"
      case "error":
        return "text-red-600 bg-red-50"
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Admin Header */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
        <div className="flex items-center space-x-3">
          <Settings className="w-5 h-5 text-orange-400" />
          <span className="font-semibold">System Administration</span>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          <Badge variant="outline" className="text-orange-400 border-orange-400">
            Recursive IDE v1.0
          </Badge>
        </div>
      </div>

      {/* Admin Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="bg-gray-800 border-b border-gray-700 justify-start rounded-none p-0">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="servers" className="data-[state=active]:bg-gray-700">
              <Server className="w-4 h-4 mr-2" />
              Servers
            </TabsTrigger>
            <TabsTrigger value="files" className="data-[state=active]:bg-gray-700">
              <FolderTree className="w-4 h-4 mr-2" />
              File System
            </TabsTrigger>
            <TabsTrigger value="terminal" className="data-[state=active]:bg-gray-700">
              <Terminal className="w-4 h-4 mr-2" />
              Terminal
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
              <FileText className="w-4 h-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="meta" className="data-[state=active]:bg-gray-700">
              <Code className="w-4 h-4 mr-2" />
              Meta System
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-300 flex items-center">
                    <Cpu className="w-4 h-4 mr-2" />
                    CPU Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">23%</div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: "23%" }}></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-300 flex items-center">
                    <HardDrive className="w-4 h-4 mr-2" />
                    Memory
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">4.2GB</div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: "52%" }}></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-300 flex items-center">
                    <Network className="w-4 h-4 mr-2" />
                    Network
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">↑ 1.2MB/s</div>
                  <div className="text-sm text-gray-400">↓ 3.4MB/s</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-300 flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    Connections
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">12</div>
                  <div className="text-sm text-gray-400">Active WebSocket</div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {logs.slice(0, 10).map((log) => (
                      <div key={log.id} className="flex items-center space-x-3 text-sm">
                        <Badge className={getLogLevelColor(log.level)}>{log.level.toUpperCase()}</Badge>
                        <span className="text-gray-400">{log.timestamp.toLocaleTimeString()}</span>
                        <span className="text-gray-300">{log.source}:</span>
                        <span className="text-white">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Servers Tab */}
          <TabsContent value="servers" className="flex-1 p-4">
            <div className="space-y-4">
              {servers.map((server) => (
                <Card key={server.name} className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(server.status)}
                        <CardTitle className="text-white">{server.name}</CardTitle>
                        <Badge variant="outline">Port {server.port}</Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="outline">
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Square className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Uptime:</span>
                        <div className="text-white font-medium">{server.uptime}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Memory:</span>
                        <div className="text-white font-medium">{server.memory}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">CPU:</span>
                        <div className="text-white font-medium">{server.cpu}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* File System Tab */}
          <TabsContent value="files" className="flex-1 overflow-hidden">
            <div className="h-full flex">
              {/* File Tree */}
              <div className="w-1/3 border-r border-gray-700 p-4">
                <h3 className="text-white font-medium mb-4">Project Structure</h3>
                <ScrollArea className="h-full">{renderFileTree(fileTree)}</ScrollArea>
              </div>

              {/* File Content */}
              <div className="flex-1 p-4">
                {selectedFile ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-medium">{selectedFile}</h3>
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                        <Button size="sm" variant="outline">
                          <Code className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-auto">
                      <pre className="text-green-400 whitespace-pre-wrap">{fileContent}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    Select a file to view its contents
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Terminal Tab */}
          <TabsContent value="terminal" className="flex-1 p-4">
            <div className="h-full bg-black rounded-lg p-4 font-mono text-sm">
              <div className="text-green-400">
                <div>Recursive IDE Terminal v1.0</div>
                <div>Type 'help' for available commands</div>
                <div className="mt-4">
                  <div>$ ls -la</div>
                  <div className="text-white ml-2">
                    drwxr-xr-x 12 user staff 384 Dec 25 14:30 .<br />
                    drwxr-xr-x 8 user staff 256 Dec 25 14:25 ..
                    <br />
                    drwxr-xr-x 3 user staff 96 Dec 25 14:30 app
                    <br />
                    drwxr-xr-x 5 user staff 160 Dec 25 14:30 components
                    <br />
                    drwxr-xr-x 3 user staff 96 Dec 25 14:30 lib
                    <br />
                    -rw-r--r-- 1 user staff 1234 Dec 25 14:30 package.json
                    <br />
                  </div>
                </div>
                <div className="mt-2">
                  <div>$ npm run dev</div>
                  <div className="text-blue-400 ml-2">
                    {"&gt;"} recursive-ide@1.0.0 dev
                    <br />
                    {"&gt;"} next dev
                    <br />
                    <br />✓ Ready on http://localhost:3000
                    <br />
                  </div>
                </div>
                <div className="mt-4">
                  $ <span className="animate-pulse">_</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="flex-1 p-4">
            <Card className="h-full bg-gray-800 border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">System Logs</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setLogs([])}>
                    Clear Logs
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-2 font-mono text-sm">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start space-x-3 p-2 hover:bg-gray-700 rounded">
                        <Badge className={getLogLevelColor(log.level)} variant="outline">
                          {log.level.toUpperCase()}
                        </Badge>
                        <span className="text-gray-400 w-20 flex-shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                        <span className="text-blue-400 w-24 flex-shrink-0">{log.source}</span>
                        <span className="text-white flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Meta System Tab */}
          <TabsContent value="meta" className="flex-1 p-4">
            <div className="space-y-6">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Code className="w-5 h-5 mr-2" />
                    Recursive IDE Meta System
                  </CardTitle>
                  <CardDescription className="text-gray-400">This system can modify and improve itself</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                      <Settings className="w-6 h-6 mb-2" />
                      <span>System Config</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                      <Code className="w-6 h-6 mb-2" />
                      <span>Code Generation</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                      <Activity className="w-6 h-6 mb-2" />
                      <span>Performance Analysis</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                      <Database className="w-6 h-6 mb-2" />
                      <span>Data Management</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Self-Improvement Capabilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                      <span className="text-white">Code Analysis & Optimization</span>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                      <span className="text-white">UI/UX Enhancement</span>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                      <span className="text-white">Performance Monitoring</span>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                      <span className="text-white">Security Auditing</span>
                      <Badge className="bg-yellow-600">Pending</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
