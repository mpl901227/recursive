"use client"

import { ChevronRight, FolderTree, FileText, GitBranch, Terminal, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"

interface RightSidebarProps {
  isMain?: boolean
  onToggle: () => void
  onAppLaunch: (app: string) => void
}

export function RightSidebar({ isMain = false, onToggle, onAppLaunch }: RightSidebarProps) {
  const [activeApp, setActiveApp] = useState("files")

  const apps = [
    { id: "files", name: "File Explorer", icon: FolderTree },
    { id: "editor", name: "Text Editor", icon: FileText },
    { id: "git", name: "Git Manager", icon: GitBranch },
    { id: "terminal", name: "Terminal", icon: Terminal },
    { id: "monitor", name: "System Monitor", icon: Monitor },
  ]

  return (
    <div className={`${isMain ? "flex-1" : "w-96"} bg-white border-l border-gray-200 flex flex-col`}>
      {/* Header - 높이와 색상 통일 */}
      <div className="h-10 bg-gradient-to-r from-green-50 to-sky-50 border-b border-gray-200 flex items-center justify-end px-4">
        <Button variant="ghost" size="sm" onClick={onToggle}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* App Tabs */}
      <Tabs value={activeApp} onValueChange={setActiveApp} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-5 w-full">
          {apps.map((app) => {
            const Icon = app.icon
            return (
              <TabsTrigger
                key={app.id}
                value={app.id}
                className="flex flex-col items-center p-2"
                onClick={() => onAppLaunch(app.name)}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-xs">{app.name.split(" ")[0]}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* File Explorer */}
        <TabsContent value="files" className="flex-1 p-4">
          <div className="space-y-2">
            <div className="font-medium text-sm text-gray-700 mb-3">Project Structure</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <FolderTree className="w-4 h-4 text-blue-500" />
                <span>src/</span>
              </div>
              <div className="flex items-center space-x-2 p-2 pl-6 hover:bg-gray-50 rounded cursor-pointer">
                <FileText className="w-4 h-4 text-green-500" />
                <span>components/</span>
              </div>
              <div className="flex items-center space-x-2 p-2 pl-10 hover:bg-gray-50 rounded cursor-pointer">
                <FileText className="w-4 h-4 text-gray-500" />
                <span>header.tsx</span>
              </div>
              <div className="flex items-center space-x-2 p-2 pl-10 hover:bg-gray-50 rounded cursor-pointer">
                <FileText className="w-4 h-4 text-gray-500" />
                <span>sidebar.tsx</span>
              </div>
              <div className="flex items-center space-x-2 p-2 pl-6 hover:bg-gray-50 rounded cursor-pointer">
                <FileText className="w-4 h-4 text-orange-500" />
                <span>app/</span>
              </div>
              <div className="flex items-center space-x-2 p-2 pl-10 hover:bg-gray-50 rounded cursor-pointer">
                <FileText className="w-4 h-4 text-gray-500" />
                <span>page.tsx</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Text Editor */}
        <TabsContent value="editor" className="flex-1 p-4">
          <div className="h-full bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400">
            <div className="mb-2 text-gray-500">// main-content.tsx</div>
            <div>export function MainContent() {"{"}</div>
            <div className="ml-4">return (</div>
            <div className="ml-8">{'<div className="flex-1">'}</div>
            <div className="ml-12">{"<h1>Hello World</h1>"}</div>
            <div className="ml-8">{"</div>"}</div>
            <div className="ml-4">)</div>
            <div>{"}"}</div>
            <div className="mt-4 w-2 h-4 bg-green-400 animate-pulse"></div>
          </div>
        </TabsContent>

        {/* Git Manager */}
        <TabsContent value="git" className="flex-1 p-4">
          <div className="space-y-4">
            <div className="font-medium text-sm text-gray-700">Git Status</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2 text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>main branch</span>
              </div>
              <div className="flex items-center space-x-2 text-orange-600">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>3 modified files</span>
              </div>
              <div className="flex items-center space-x-2 text-blue-600">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>2 commits ahead</span>
              </div>
            </div>
            <Button className="w-full" size="sm">
              Commit Changes
            </Button>
          </div>
        </TabsContent>

        {/* Terminal */}
        <TabsContent value="terminal" className="flex-1 p-4">
          <div className="h-full bg-black rounded-lg p-4 font-mono text-sm text-green-400">
            <div>$ npm run dev</div>
            <div className="text-gray-400">Starting development server...</div>
            <div className="text-blue-400">✓ Ready on http://localhost:3000</div>
            <div className="mt-2">
              $ <span className="animate-pulse">_</span>
            </div>
          </div>
        </TabsContent>

        {/* System Monitor */}
        <TabsContent value="monitor" className="flex-1 p-4">
          <div className="space-y-4">
            <div className="font-medium text-sm text-gray-700">System Status</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>CPU Usage</span>
                  <span>45%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: "45%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Memory</span>
                  <span>2.1GB / 8GB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: "26%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Network</span>
                  <span>Connected</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-600">Active connections: 3</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
